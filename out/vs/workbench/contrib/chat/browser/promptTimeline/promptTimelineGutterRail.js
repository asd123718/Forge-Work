import { $, addDisposableListener, append, clearNode, EventType, getWindow } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { MIN_HOST_WIDTH } from "./promptTimelineLayout.js";
import "./media/promptTimeline.css";
const MAX_REST_DOTS = 50;
const MIN_REST_DOTS = 2;
const DOT_SIZE = 4;
const DOT_GAP = 4;
const HANDLE_PADDING_Y = 8;
const MORE_MARKER_HEIGHT = 8;
const GUTTER_INSET = 12;
function restDotCount(promptCount, railHeight) {
  const capped = Math.min(promptCount, MAX_REST_DOTS);
  if (promptCount <= MIN_REST_DOTS || railHeight <= 0) {
    return capped;
  }
  const available = railHeight - 2 * (GUTTER_INSET + HANDLE_PADDING_Y);
  const step = DOT_SIZE + DOT_GAP;
  if (capped === promptCount && Math.floor((available + DOT_GAP) / step) >= promptCount) {
    return capped;
  }
  return Math.max(MIN_REST_DOTS, Math.min(capped, Math.floor((available - MORE_MARKER_HEIGHT) / step)));
}
let gutterIdSeq = 0;
class PromptTimelineGutterRail extends Disposable {
  constructor() {
    super();
    this._rowDisposables = this._register(new DisposableStore());
    /** Held separately from {@link _rowDisposables}: the dots are re-rendered on resize, without the rows. */
    this._dotDisposables = this._register(new DisposableStore());
    this._rows = [];
    /** The resting dots, in order; `_dotTicks[i]` is the tick index dot `i` stands for. */
    this._dots = [];
    this._dotTicks = [];
    this._hostWidth = Number.POSITIVE_INFINITY;
    /** Cached rail height; only changes on resize (observed), so rendering never forces a reflow to read it. */
    this._railHeight = 0;
    this._resizeObserverReady = false;
    /** Prompt count of the last {@link setTicks}, so a resize can re-sample the dots without new ticks. */
    this._tickCount = 0;
    /** Disclosure held open by explicit activation (handle click/tap/keyboard, or a row focused via keyboard). */
    this._open = false;
    /** Pointer is over the rail; reveals the flyout transiently (independent of {@link _open}). */
    this._hovering = false;
    /** Tick index previewed by the dot currently under the pointer, or `-1` when no dot is hovered. */
    this._previewIndex = -1;
    /** Row currently showing the full-width preview band, or `-1`; only dot-driven previews band. */
    this._previewBand = -1;
    /** Tick index of the prompt the transcript is scrolled to, or `-1`; re-applied when the dots re-render. */
    this._activeIndex = -1;
    /** Row holding the flyout's single tab stop. */
    this._focusRow = 0;
    /** Which of that row's two buttons holds it. */
    this._focusColumn = "jump";
    this._onDidSelect = this._register(new Emitter());
    this.onDidSelect = this._onDidSelect.event;
    /** Fired by a row's diff button to review that prompt's whole changeset. */
    this._onDidReview = this._register(new Emitter());
    this.onDidReview = this._onDidReview.event;
    // Per-FILE review is only offered by the ruler rail's hover card; the gutter rail's rows drill down
    // to the whole prompt. Kept to satisfy the shared rail contract.
    this._onDidReviewFile = this._register(new Emitter());
    this.onDidReviewFile = this._onDidReviewFile.event;
    this._domNode = $("nav.prompt-timeline-rail.prompt-timeline-rail-gutter");
    this._domNode.setAttribute("aria-label", localize("promptTimeline.gutter.railLabel", "Prompt timeline"));
    this._domNode.setAttribute("role", "toolbar");
    this._domNode.setAttribute("aria-orientation", "vertical");
    const panelId = `prompt-timeline-gutter-panel-${gutterIdSeq++}`;
    this._rest = append(this._domNode, $("button.prompt-timeline-gutter-rest"));
    this._rest.setAttribute("aria-haspopup", "true");
    this._rest.setAttribute("aria-expanded", "false");
    this._rest.setAttribute("aria-controls", panelId);
    this._rest.setAttribute("aria-label", localize("promptTimeline.gutter.toggleLabel", "Show prompts"));
    this._rest.tabIndex = 0;
    this._list = append(this._domNode, $(".prompt-timeline-gutter-panel"));
    this._list.id = panelId;
    this._register(addDisposableListener(this._domNode, EventType.MOUSE_OVER, () => {
      this._hovering = true;
      this._updateRevealed();
    }));
    this._register(addDisposableListener(this._domNode, EventType.MOUSE_OUT, (e) => {
      if (!this._domNode.contains(e.relatedTarget)) {
        this._hovering = false;
        this._setPreview(-1);
        this._updateRevealed();
      }
    }));
    this._register(addDisposableListener(this._list, EventType.MOUSE_OVER, (e) => {
      const target = e.target;
      const rowIndex = target === null ? -1 : this._rows.findIndex((row) => row.container.contains(target));
      this._setPreview(rowIndex, "row");
    }));
    this._register(Gesture.addTarget(this._rest));
    this._register(addDisposableListener(this._rest, EventType.CLICK, (e) => {
      e.preventDefault();
      this._toggleOpen();
    }));
    this._register(addDisposableListener(this._rest, TouchEventType.Tap, () => this._toggleOpen()));
    this._register(addDisposableListener(this._rest, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
        event.preventDefault();
        event.stopPropagation();
        this._toggleOpen();
      }
    }));
    this._register(addDisposableListener(this._list, EventType.KEY_DOWN, (e) => this._onListKeyDown(e)));
    this._register(addDisposableListener(this._domNode, EventType.FOCUS_OUT, (e) => {
      if (!this._domNode.contains(e.relatedTarget)) {
        this._open = false;
        this._updateRevealed();
      }
    }));
  }
  get domNode() {
    return this._domNode;
  }
  /** Reveal whenever the disclosure is open OR the pointer is hovering; keep `aria-expanded` in sync. */
  _updateRevealed() {
    const revealed = this._open || this._hovering;
    this._domNode.classList.toggle("revealed", revealed);
    this._rest.setAttribute("aria-expanded", String(revealed));
  }
  /** Toggle the disclosure via explicit activation: opening focuses a row, closing returns to the handle. */
  _toggleOpen() {
    if (this._open) {
      this._close();
    } else {
      this._open = true;
      this._updateRevealed();
      this._focusActiveRow();
    }
  }
  /**
   * Collapse the disclosure (shared close path for activation, Escape, and row actions).
   *
   * `restoreFocus` returns focus to the handle so keyboard users are not stranded; the diff action
   * opts out, because the multi-diff editor it opens takes focus itself and pulling focus back to
   * the rail first would fight it.
   */
  _close(restoreFocus = true) {
    this._open = false;
    this._updateRevealed();
    if (restoreFocus) {
      this._rest.focus();
    }
  }
  _focusActiveRow() {
    this._focusCell(this._focusRow, this._focusColumn);
  }
  setFilesProvider(_provider) {
  }
  /**
   * Rebuilds the resting handle's dots. There is one dot per prompt as long as they fit — capped by
   * {@link MAX_REST_DOTS} and by the room the rail actually has (see {@link restDotCount}); beyond
   * that the dots are evenly sampled across the session so every dot still stands for a real prompt
   * (and the active prompt always maps to one), with a trailing marker signalling the sampling.
   */
  _renderDots(count) {
    this._dotDisposables.clear();
    clearNode(this._rest);
    this._dots.length = 0;
    this._dotTicks.length = 0;
    const dots = restDotCount(count, this._railHeight);
    for (let i = 0; i < dots; i++) {
      const dot = append(this._rest, $(".prompt-timeline-gutter-dot"));
      const tickIndex = dots === count ? i : Math.round(i * (count - 1) / (dots - 1));
      this._dots.push(dot);
      this._dotTicks.push(tickIndex);
      this._dotDisposables.add(addDisposableListener(dot, EventType.MOUSE_OVER, () => this._setPreview(tickIndex)));
    }
    if (count > dots) {
      append(this._rest, $(".prompt-timeline-gutter-dot-more"));
    }
    this._updateDotHighlights();
  }
  /**
   * Observes the rail so the dot column keeps fitting when the transcript's height changes — the
   * window resizing, the chat input growing, a split view. The rail is only mounted once, so the
   * observer is created on the first render and lives for the rail's lifetime.
   */
  _ensureResizeObserver() {
    if (this._resizeObserverReady) {
      return;
    }
    const ResizeObserverCtor = getWindow(this._domNode).ResizeObserver;
    if (!ResizeObserverCtor) {
      return;
    }
    this._resizeObserverReady = true;
    const observer = new ResizeObserverCtor(() => {
      const height = this._domNode.clientHeight;
      if (height <= 0 || height === this._railHeight) {
        return;
      }
      this._railHeight = height;
      if (restDotCount(this._tickCount, height) !== this._dots.length) {
        this._renderDots(this._tickCount);
      }
    });
    observer.observe(this._domNode);
    this._register(toDisposable(() => observer.disconnect()));
  }
  /** Previews the prompt a hovered dot stands for by highlighting its row and scrolling it into view. */
  /**
   * Previews the prompt a row stands for: highlights it and scrolls it into view.
   *
   * `source` decides whether the row gets the full-width band. A preview from a hovered *dot* points
   * at a row the pointer is nowhere near, so the whole row lights up to say "this one". A preview
   * from the pointer resting on the row itself must NOT band it: the row's two halves light up
   * individually under the pointer, and a band covering both would paint over that — making a row
   * with two buttons read as one.
   */
  _setPreview(index, source = "dot") {
    const band = source === "dot" ? index : -1;
    if (this._previewIndex === index && this._previewBand === band) {
      return;
    }
    this._previewIndex = index;
    this._previewBand = band;
    for (let i = 0; i < this._rows.length; i++) {
      this._rows[i].container.classList.toggle("preview", i === band);
    }
    this._updateDotHighlights();
    if (index >= 0) {
      this._revealRow(index);
    }
  }
  /**
   * Accents the dots standing for the active ("you are here") and previewed prompts. Once the dots
   * are sampled the nearest dot stands in, so both accents survive a re-sampling on resize.
   */
  _updateDotHighlights() {
    const activeDot = this._findNearestDotIndex(this._activeIndex);
    const previewDot = this._findNearestDotIndex(this._previewIndex);
    for (let i = 0; i < this._dots.length; i++) {
      this._dots[i].classList.toggle("active", i === activeDot);
      this._dots[i].classList.toggle("preview", i === previewDot);
    }
  }
  _findNearestDotIndex(tickIndex) {
    if (tickIndex < 0) {
      return -1;
    }
    let nearestDot = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this._dotTicks.length; i++) {
      const delta = Math.abs(this._dotTicks[i] - tickIndex);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearestDot = i;
      }
    }
    return nearestDot;
  }
  /**
   * Scrolls a row into view inside the flyout. Done by hand rather than with `scrollIntoView` so a
   * hover can never scroll the transcript (or any other ancestor) behind the rail.
   */
  _revealRow(index) {
    const container = this._rows[index]?.container;
    if (!container) {
      return;
    }
    const top = container.offsetTop;
    const bottom = top + container.offsetHeight;
    const viewTop = this._list.scrollTop;
    const viewBottom = viewTop + this._list.clientHeight;
    if (top < viewTop) {
      this._list.scrollTop = top;
    } else if (bottom > viewBottom) {
      this._list.scrollTop = bottom - this._list.clientHeight;
    }
  }
  setTicks(ticks) {
    this._tickCount = ticks.length;
    this._ensureResizeObserver();
    if (this._railHeight <= 0) {
      this._railHeight = this._domNode.clientHeight;
    }
    const sameStructure = ticks.length === this._rows.length && ticks.every((t, i) => this._rows[i]?.tick.requestId === t.requestId);
    if (sameStructure) {
      const doc = getWindow(this._domNode).document;
      const focusedCell = this._isLiveCell(doc.activeElement) ? doc.activeElement : void 0;
      for (let i = 0; i < ticks.length; i++) {
        this._renderRow(this._rows[i], ticks[i]);
      }
      this._updateTabStops(this._focusRow, this._focusColumn);
      if (focusedCell && !this._isLiveCell(focusedCell)) {
        this._cell(this._focusRow, this._focusColumn)?.focus();
      }
      this._updateActiveClasses();
      return;
    }
    this._rowDisposables.clear();
    this._rows.length = 0;
    this._previewIndex = -1;
    this._previewBand = -1;
    clearNode(this._list);
    this._renderDots(ticks.length);
    for (const tick of ticks) {
      const container = append(this._list, $(".prompt-timeline-gutter-row"));
      const jump = append(container, $("button.prompt-timeline-gutter-row-jump"));
      jump.tabIndex = -1;
      const label = append(jump, $("span.prompt-timeline-gutter-row-label"));
      const diff = append(container, $("button.prompt-timeline-gutter-row-diff"));
      diff.tabIndex = -1;
      const stat = append(diff, $("span.prompt-timeline-gutter-row-stat"));
      const entry = { tick, container, jump, diff, label, stat };
      this._renderRow(entry, tick);
      const requestId = tick.requestId;
      this._rowDisposables.add(addDisposableListener(jump, EventType.CLICK, () => {
        this._onDidSelect.fire(requestId);
        this._close();
      }));
      this._rowDisposables.add(addDisposableListener(diff, EventType.CLICK, () => {
        this._onDidReview.fire(entry.tick);
        this._close(
          /*restoreFocus*/
          false
        );
      }));
      for (const [button, column] of [[jump, "jump"], [diff, "diff"]]) {
        this._rowDisposables.add(addDisposableListener(button, EventType.FOCUS, () => {
          this._open = true;
          this._updateRevealed();
          this._updateTabStops(this._rows.indexOf(entry), column);
        }));
      }
      this._rows.push(entry);
    }
    const activeIndex = this._rows.findIndex((r) => r.tick.requestId === this._activeRequestId);
    this._updateTabStops(activeIndex >= 0 ? activeIndex : 0, "jump");
    this._updateActiveClasses();
  }
  _renderRow(entry, tick) {
    entry.tick = tick;
    entry.jump.setAttribute("aria-label", tick.ariaLabel);
    entry.label.textContent = tick.text;
    entry.label.title = tick.text;
    const stat = tick.stat && tick.stat.added + tick.stat.removed > 0 ? tick.stat : void 0;
    this._renderStat(entry.stat, stat);
    entry.container.classList.toggle("reviewable", !!stat);
    if (stat) {
      entry.diff.setAttribute("aria-label", localize(
        "promptTimeline.gutter.reviewChanges",
        "Review Changes for Prompt: {0}, {1}",
        tick.text,
        stat.fileCount === 1 ? localize("promptTimeline.gutter.reviewOneFile", "1 file changed") : localize("promptTimeline.gutter.reviewNFiles", "{0} files changed", stat.fileCount)
      ));
    }
  }
  _renderStat(container, stat) {
    clearNode(container);
    if (!stat) {
      return;
    }
    append(container, $("span.added")).textContent = `+${stat.added}`;
    append(container, $("span.removed")).textContent = `\u2212${stat.removed}`;
  }
  /** The button a row column maps to, or undefined when that row has no changes to review. */
  _cell(rowIndex, column) {
    const entry = this._rows[rowIndex];
    if (!entry) {
      return void 0;
    }
    if (column === "jump") {
      return entry.jump;
    }
    return entry.container.classList.contains("reviewable") ? entry.diff : void 0;
  }
  /** True when `element` is a row button that is still a live focus target — a dropped badge is not. */
  _isLiveCell(element) {
    return this._rows.some((row) => row.jump === element || row.diff === element && row.container.classList.contains("reviewable"));
  }
  /**
   * Roving tabindex: exactly one button across the whole flyout is tabbable, so it stays a single Tab
   * stop even though every row now holds two. A requested diff column falls back to the label when
   * that row has no changes, so the tab stop can never land on a hidden (unfocusable) button.
   */
  _updateTabStops(focusIndex, column = this._focusColumn) {
    this._focusRow = Math.max(0, Math.min(this._rows.length - 1, focusIndex));
    this._focusColumn = this._cell(this._focusRow, column) ? column : "jump";
    const focused = this._cell(this._focusRow, this._focusColumn);
    for (const entry of this._rows) {
      entry.jump.tabIndex = entry.jump === focused ? 0 : -1;
      entry.diff.tabIndex = entry.diff === focused ? 0 : -1;
    }
  }
  /** Moves the roving tab stop and the focus together, clamping the row and resolving the column. */
  _focusCell(rowIndex, column) {
    this._updateTabStops(rowIndex, column);
    this._cell(this._focusRow, this._focusColumn)?.focus();
  }
  /**
   * The flyout's toolbar keyboard model: Up/Down (and Home/End) walk the rows keeping the current
   * column where the target row has one, Left/Right cross between a row's label and diff buttons,
   * and Escape dismisses.
   */
  _onListKeyDown(e) {
    if (this._rows.length === 0) {
      return;
    }
    const event = new StandardKeyboardEvent(e);
    if (event.keyCode === KeyCode.Escape) {
      event.preventDefault();
      event.stopPropagation();
      this._close();
      return;
    }
    const activeElement = getWindow(this._domNode).document.activeElement;
    const currentIndex = this._rows.findIndex((r) => r.jump === activeElement || r.diff === activeElement);
    const currentColumn = this._rows[currentIndex]?.diff === activeElement ? "diff" : "jump";
    let nextIndex = currentIndex;
    let nextColumn = currentColumn;
    switch (event.keyCode) {
      case KeyCode.DownArrow:
        nextIndex = Math.min(this._rows.length - 1, currentIndex + 1);
        break;
      case KeyCode.UpArrow:
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case KeyCode.Home:
        nextIndex = 0;
        break;
      case KeyCode.End:
        nextIndex = this._rows.length - 1;
        break;
      case KeyCode.RightArrow:
        nextColumn = "diff";
        break;
      case KeyCode.LeftArrow:
        nextColumn = "jump";
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._focusCell(nextIndex, nextColumn);
  }
  setActive(requestId) {
    this._activeRequestId = requestId;
    this._updateActiveClasses();
  }
  _updateActiveClasses() {
    let activeIndex = -1;
    for (let i = 0; i < this._rows.length; i++) {
      const row = this._rows[i];
      const active = this._activeRequestId !== void 0 && (row.tick.requestId === this._activeRequestId || row.tick.allRequestIds.includes(this._activeRequestId));
      if (active) {
        activeIndex = i;
      }
      row.container.classList.toggle("active", active);
      if (active) {
        row.jump.setAttribute("aria-current", "location");
      } else {
        row.jump.removeAttribute("aria-current");
      }
    }
    this._activeIndex = activeIndex;
    this._updateDotHighlights();
  }
  focusTick(requestId) {
    const index = this._rows.findIndex((r) => r.tick.requestId === requestId || r.tick.allRequestIds.includes(requestId));
    if (index >= 0) {
      this._focusCell(index, "jump");
    }
  }
  setHostWidth(width) {
    if (width > 0 && width !== this._hostWidth) {
      this._hostWidth = width;
      this._domNode.classList.toggle("overflowing", width < MIN_HOST_WIDTH);
    }
  }
  // The ruler blooms its fan on a hard scroll and scatters marks by scroll position; the gutter rail is a
  // static, evenly-spaced list, so both are intentionally no-ops.
  notifyHardWheel() {
  }
  setScrollLayout(_layout) {
  }
}
export {
  PromptTimelineGutterRail,
  restDotCount
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFRpbWVsaW5lXFxwcm9tcHRUaW1lbGluZUd1dHRlclJhaWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgY2xlYXJOb2RlLCBFdmVudFR5cGUsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1JTl9IT1NUX1dJRFRIIH0gZnJvbSAnLi9wcm9tcHRUaW1lbGluZUxheW91dC5qcyc7XG5pbXBvcnQgeyBQcm9tcHREaWZmU3RhdCwgUHJvbXB0RmlsZURpZmYsIFByb21wdFRpY2ssIElQcm9tcHRTY3JvbGxMYXlvdXQgfSBmcm9tICcuL3Byb21wdFRpbWVsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgSVByb21wdFJldmlld0ZpbGVFdmVudCwgSVByb21wdFRpbWVsaW5lUmFpbCB9IGZyb20gJy4vcHJvbXB0VGltZWxpbmVSYWlsLmpzJztcbmltcG9ydCAnLi9tZWRpYS9wcm9tcHRUaW1lbGluZS5jc3MnO1xuXG4vKipcbiAqIFVwcGVyIGJvdW5kIG9uIHRoZSBudW1iZXIgb2YgcmVzdGluZyBkb3RzIGRyYXduIG9uIHRoZSBoYW5kbGUuIFRoZSBmbHlvdXQgbGlzdCBpcyB1bmNhcHBlZCAoaXRcbiAqIGxpc3RzIGV2ZXJ5IHByb21wdCksIGJ1dCB0aGUgZG90IGNvbHVtbiB3b3VsZCBncm93IHVuYm91bmRlZGx5IHRhbGwgZm9yIHZlcnkgbG9uZyBzZXNzaW9ucywgc28gaXRcbiAqIGlzIGNhcHBlZDogcGFzdCB0aGUgY2FwIHRoZSBkb3RzIGFyZSBldmVubHkgc2FtcGxlZCBhY3Jvc3MgdGhlIHNlc3Npb24gKGV2ZXJ5IGRvdCBzdGlsbCBzdGFuZHMgZm9yXG4gKiBhIHJlYWwgcHJvbXB0LCBzbyB0aGUgXCJ5b3UgYXJlIGhlcmVcIiBkb3QgYWx3YXlzIGV4aXN0cykgYW5kIGEgdHJhaWxpbmcgbWFya2VyIHNpZ25hbHMgdGhlIHNhbXBsaW5nLlxuICovXG5jb25zdCBNQVhfUkVTVF9ET1RTID0gNTA7XG4vKiogTmV2ZXIgc2FtcGxlIGJlbG93IHRoaXM6IHR3byBkb3RzIGFyZSB0aGUgZmV3ZXN0IHRoYXQgY2FuIHN0aWxsIHNwYW4gdGhlIHNlc3Npb24ncyBzdGFydCBhbmQgZW5kLiAqL1xuY29uc3QgTUlOX1JFU1RfRE9UUyA9IDI7XG4vKipcbiAqIFJlc3RpbmctZG90IGdlb21ldHJ5LCBtaXJyb3JlZCBmcm9tIHRoZSBgLS1wcm9tcHQtdGltZWxpbmUtZ3V0dGVyLSpgIHZhcmlhYmxlcyBpblxuICogYHByb21wdFRpbWVsaW5lLmNzc2Agc28ge0BsaW5rIHJlc3REb3RDb3VudH0gY2FuIHNpemUgdGhlIGNvbHVtbiB3aXRob3V0IG1lYXN1cmluZyBpdCAod2hpY2ggd291bGRcbiAqIGZvcmNlIGEgcmVmbG93IHBlciByZW5kZXIpLiBLZWVwIHRoZSB0d28gaW4gc3luYy5cbiAqL1xuY29uc3QgRE9UX1NJWkUgPSA0O1xuY29uc3QgRE9UX0dBUCA9IDQ7XG5jb25zdCBIQU5ETEVfUEFERElOR19ZID0gODtcbmNvbnN0IE1PUkVfTUFSS0VSX0hFSUdIVCA9IDg7XG4vKiogQ2xlYXJhbmNlIGtlcHQgYmV0d2VlbiB0aGUgaGFuZGxlIGFuZCB0aGUgdHJhbnNjcmlwdCdzIHRvcC9ib3R0b20gZWRnZXMgKGAtLXByb21wdC10aW1lbGluZS1ndXR0ZXItaW5zZXRgKS4gKi9cbmNvbnN0IEdVVFRFUl9JTlNFVCA9IDEyO1xuXG4vKiogSG93IG1hbnkgcmVzdGluZyBkb3RzIGZpdCBmb3IgYHByb21wdENvdW50YCBwcm9tcHRzIGluIGEgcmFpbCBgcmFpbEhlaWdodGAgcHggdGFsbCAoMCB3aGVuIHVubWVhc3VyZWQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc3REb3RDb3VudChwcm9tcHRDb3VudDogbnVtYmVyLCByYWlsSGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBjYXBwZWQgPSBNYXRoLm1pbihwcm9tcHRDb3VudCwgTUFYX1JFU1RfRE9UUyk7XG5cdGlmIChwcm9tcHRDb3VudCA8PSBNSU5fUkVTVF9ET1RTIHx8IHJhaWxIZWlnaHQgPD0gMCkge1xuXHRcdHJldHVybiBjYXBwZWQ7XG5cdH1cblx0Y29uc3QgYXZhaWxhYmxlID0gcmFpbEhlaWdodCAtIDIgKiAoR1VUVEVSX0lOU0VUICsgSEFORExFX1BBRERJTkdfWSk7XG5cdGNvbnN0IHN0ZXAgPSBET1RfU0laRSArIERPVF9HQVA7XG5cdC8vIFNraXAgdGhlIG1hcmtlcidzIHJlc2VydmF0aW9uIG9ubHkgaWYgdGhlIGZpeGVkIGNhcCBsZWZ0IGV2ZXJ5IHByb21wdCBpdHMgb3duIGRvdC5cblx0aWYgKGNhcHBlZCA9PT0gcHJvbXB0Q291bnQgJiYgTWF0aC5mbG9vcigoYXZhaWxhYmxlICsgRE9UX0dBUCkgLyBzdGVwKSA+PSBwcm9tcHRDb3VudCkge1xuXHRcdHJldHVybiBjYXBwZWQ7XG5cdH1cblx0cmV0dXJuIE1hdGgubWF4KE1JTl9SRVNUX0RPVFMsIE1hdGgubWluKGNhcHBlZCwgTWF0aC5mbG9vcigoYXZhaWxhYmxlIC0gTU9SRV9NQVJLRVJfSEVJR0hUKSAvIHN0ZXApKSk7XG59XG5cbi8qKlxuICogV2hpY2ggb2YgYSByb3cncyB0d28gYnV0dG9ucyBob2xkcyB0aGUgZmx5b3V0J3Mgcm92aW5nIHRhYiBzdG9wOiB0aGUgbGFiZWwgKGp1bXAgdG8gdGhlIHByb21wdCkgb3JcbiAqIHRoZSBkaWZmIGJhZGdlIChyZXZpZXcgdGhhdCBwcm9tcHQncyBjaGFuZ2VzKS5cbiAqL1xudHlwZSBSb3dDb2x1bW4gPSAnanVtcCcgfCAnZGlmZic7XG5cbi8qKiBXaGVyZSBhIHJvdyBwcmV2aWV3IGNhbWUgZnJvbSBcdTIwMTQgc2VlIHtAbGluayBQcm9tcHRUaW1lbGluZUd1dHRlclJhaWwuX3NldFByZXZpZXd9LiAqL1xudHlwZSBQcmV2aWV3U291cmNlID0gJ2RvdCcgfCAncm93JztcblxuaW50ZXJmYWNlIElSb3dFbnRyeSB7XG5cdHRpY2s6IFByb21wdFRpY2s7XG5cdC8qKiBSb3cgY29udGFpbmVyLiBIb2xkcyB0aGUgYHJldmlld2FibGVgIHN0YXRlIGFuZCB0aGUgbGF5b3V0IGJvdGggYnV0dG9ucyBzaGFyZTsgbm90IGZvY3VzYWJsZS4gKi9cblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0LyoqIExlZnQgYnV0dG9uOiByZXZlYWxzIHRoZSBwcm9tcHQgaW4gdGhlIHRyYW5zY3JpcHQuICovXG5cdHJlYWRvbmx5IGp1bXA6IEhUTUxCdXR0b25FbGVtZW50O1xuXHQvKiogUmlnaHQgYnV0dG9uOiBvcGVucyB0aGlzIHByb21wdCdzIGNoYW5nZXMgYXMgYSBkaWZmLiBEcm9wcGVkIHdoZW4gdGhlIHByb21wdCBlZGl0ZWQgbm90aGluZy4gKi9cblx0cmVhZG9ubHkgZGlmZjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3RhdDogSFRNTEVsZW1lbnQ7XG59XG5cbi8qKiBVbmlxdWUtcGVyLWluc3RhbmNlIHN1ZmZpeCBzbyB0aGUgZmx5b3V0J3MgaWQgKHJlZmVyZW5jZWQgYnkgdGhlIGhhbmRsZSdzIGBhcmlhLWNvbnRyb2xzYCkgbmV2ZXIgY29sbGlkZXMuICovXG5sZXQgZ3V0dGVySWRTZXEgPSAwO1xuXG4vKipcbiAqIEEgbWluaW1hbCwgbGVmdC1lZGdlIHByb21wdCB0aW1lbGluZS4gQXQgcmVzdCBpdCBpcyBvbmx5IGEgc21hbGwgaGFuZGxlIGluIHRoZSB0cmFuc2NyaXB0J3MgbGVmdFxuICogZ3V0dGVyIChvbmUgZG90IHBlciBwcm9tcHQsIHRoZSBjdXJyZW50IHByb21wdCdzIGRvdCBhY2NlbnRlZCkgXHUyMDE0IG5vIHBlci1wcm9tcHQgbWFya3MsIG5vIGRpZmZcbiAqIGNvbG91ciBcdTIwMTQgc28gdGhlIHRyYW5zY3JpcHQgc3RheXMgY2FsbS4gSG92ZXJpbmcsIHRhcHBpbmcsIG9yIGZvY3VzaW5nIHRoZSBoYW5kbGUgZXhwYW5kcyBhIGZseW91dFxuICogbGlzdGluZyBldmVyeSBwcm9tcHQgKGl0cyB0ZXh0IGFuZCBhIGRpZmYgYmFkZ2UpIHRvIHRoZSAqcmlnaHQqIG9mIHRoZSBkb3RzLCBzbyB0aGUgZG90cyBzdGF5XG4gKiB2aXNpYmxlIGFuZCBrZWVwIHdvcmtpbmcgYXMgYSBzY3J1YmJlcjogaG92ZXJpbmcgYW4gaW5kaXZpZHVhbCBkb3QgcHJldmlld3MgaXRzIHByb21wdCBpbiB0aGVcbiAqIGZseW91dC4gQmVjYXVzZSB0aGUgbGlzdCBpcyBldmVubHkgc3BhY2VkIGFuZCBuZXZlciBkZXJpdmVkIGZyb20gcmVzcG9uc2UgaGVpZ2h0cywgaXQgc3RheXMgc3RhYmxlXG4gKiB1bmRlciB2aXJ0dWFsaXphdGlvbi5cbiAqXG4gKiBFYWNoIHJvdyBpcyBzcGxpdCBpbnRvIHR3byBidXR0b25zIHNvIHRoZSBwcm9tcHQncyBjaGFuZ2VzIGFyZSByZWFjaGFibGUgd2l0aG91dCBsZWF2aW5nIHRoZSByYWlsOlxuICogdGhlIGxhYmVsIG9uIHRoZSBsZWZ0IHJldmVhbHMgdGhlIHByb21wdCBpbiB0aGUgdHJhbnNjcmlwdCwgYW5kIHRoZSBkaWZmIGJhZGdlIG9uIHRoZSByaWdodCBvcGVuc1xuICoganVzdCB0aGF0IHR1cm4ncyBjaGFuZ2VzICh0aGUgcnVsZXIgcmFpbCBvZmZlcnMgdGhlIHNhbWUgZHJpbGwtZG93biBmcm9tIGl0cyBob3ZlciBjYXJkKS4gVGhlIGJhZGdlXG4gKiBpcyBhYnNlbnQgZm9yIHByb21wdHMgdGhhdCBlZGl0ZWQgbm90aGluZy4gQm90aCBjbG9zZSB0aGUgZmx5b3V0LlxuICpcbiAqIFRoZSBoYW5kbGUgaXMgYW4gYWNjZXNzaWJsZSBkaXNjbG9zdXJlIGJ1dHRvbiAoYGFyaWEtZXhwYW5kZWRgL2BhcmlhLWNvbnRyb2xzYCkgd2lyZWQgZm9yIG1vdXNlLFxuICogdG91Y2ggKHZpYSB7QGxpbmsgR2VzdHVyZX0pIGFuZCBrZXlib2FyZDsgdGhlIGZseW91dCBpcyBhIHNpbmdsZS10YWItc3RvcCB0b29sYmFyIHdoZXJlIFVwL0Rvd25cbiAqIChhbmQgSG9tZS9FbmQpIG1vdmUgYmV0d2VlbiByb3dzLCBMZWZ0L1JpZ2h0IG1vdmUgYmV0d2VlbiBhIHJvdydzIHR3byBidXR0b25zLCBhbmQgRXNjYXBlIGRpc21pc3Nlcy5cbiAqXG4gKiBJdCBpbXBsZW1lbnRzIHRoZSBzYW1lIHtAbGluayBJUHJvbXB0VGltZWxpbmVSYWlsfSBjb250cmFjdCBhcyB0aGUgb3ZlcnZpZXctcnVsZXIgcmFpbCBzbyB0aGUgdHdvXG4gKiBhcmUgaW50ZXJjaGFuZ2VhYmxlIGJlaGluZCB0aGUgYHNlc3Npb25zLmNoYXRUaW1lbGluZS5kaXNwbGF5YCBzZXR0aW5nOyB0aGUgc2Nyb2xsLWRyaXZlbiBhbmRcbiAqIGZpc2hleWUgYWZmb3JkYW5jZXMgdGhlIHJ1bGVyIG5lZWRzIChoYXJkLXdoZWVsIGJsb29tLCBwcm9wb3J0aW9uYWwgc2Nyb2xsIGxheW91dCkgYXJlIG5vLW9wcyBoZXJlLlxuICovXG5leHBvcnQgY2xhc3MgUHJvbXB0VGltZWxpbmVHdXR0ZXJSYWlsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcm9tcHRUaW1lbGluZVJhaWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXN0OiBIVE1MQnV0dG9uRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvd0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0LyoqIEhlbGQgc2VwYXJhdGVseSBmcm9tIHtAbGluayBfcm93RGlzcG9zYWJsZXN9OiB0aGUgZG90cyBhcmUgcmUtcmVuZGVyZWQgb24gcmVzaXplLCB3aXRob3V0IHRoZSByb3dzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb3REaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvd3M6IElSb3dFbnRyeVtdID0gW107XG5cdC8qKiBUaGUgcmVzdGluZyBkb3RzLCBpbiBvcmRlcjsgYF9kb3RUaWNrc1tpXWAgaXMgdGhlIHRpY2sgaW5kZXggZG90IGBpYCBzdGFuZHMgZm9yLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb3RzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvdFRpY2tzOiBudW1iZXJbXSA9IFtdO1xuXHRwcml2YXRlIF9hY3RpdmVSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaG9zdFdpZHRoID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHQvKiogQ2FjaGVkIHJhaWwgaGVpZ2h0OyBvbmx5IGNoYW5nZXMgb24gcmVzaXplIChvYnNlcnZlZCksIHNvIHJlbmRlcmluZyBuZXZlciBmb3JjZXMgYSByZWZsb3cgdG8gcmVhZCBpdC4gKi9cblx0cHJpdmF0ZSBfcmFpbEhlaWdodCA9IDA7XG5cdHByaXZhdGUgX3Jlc2l6ZU9ic2VydmVyUmVhZHkgPSBmYWxzZTtcblx0LyoqIFByb21wdCBjb3VudCBvZiB0aGUgbGFzdCB7QGxpbmsgc2V0VGlja3N9LCBzbyBhIHJlc2l6ZSBjYW4gcmUtc2FtcGxlIHRoZSBkb3RzIHdpdGhvdXQgbmV3IHRpY2tzLiAqL1xuXHRwcml2YXRlIF90aWNrQ291bnQgPSAwO1xuXHQvKiogRGlzY2xvc3VyZSBoZWxkIG9wZW4gYnkgZXhwbGljaXQgYWN0aXZhdGlvbiAoaGFuZGxlIGNsaWNrL3RhcC9rZXlib2FyZCwgb3IgYSByb3cgZm9jdXNlZCB2aWEga2V5Ym9hcmQpLiAqL1xuXHRwcml2YXRlIF9vcGVuID0gZmFsc2U7XG5cdC8qKiBQb2ludGVyIGlzIG92ZXIgdGhlIHJhaWw7IHJldmVhbHMgdGhlIGZseW91dCB0cmFuc2llbnRseSAoaW5kZXBlbmRlbnQgb2Yge0BsaW5rIF9vcGVufSkuICovXG5cdHByaXZhdGUgX2hvdmVyaW5nID0gZmFsc2U7XG5cdC8qKiBUaWNrIGluZGV4IHByZXZpZXdlZCBieSB0aGUgZG90IGN1cnJlbnRseSB1bmRlciB0aGUgcG9pbnRlciwgb3IgYC0xYCB3aGVuIG5vIGRvdCBpcyBob3ZlcmVkLiAqL1xuXHRwcml2YXRlIF9wcmV2aWV3SW5kZXggPSAtMTtcblx0LyoqIFJvdyBjdXJyZW50bHkgc2hvd2luZyB0aGUgZnVsbC13aWR0aCBwcmV2aWV3IGJhbmQsIG9yIGAtMWA7IG9ubHkgZG90LWRyaXZlbiBwcmV2aWV3cyBiYW5kLiAqL1xuXHRwcml2YXRlIF9wcmV2aWV3QmFuZCA9IC0xO1xuXHQvKiogVGljayBpbmRleCBvZiB0aGUgcHJvbXB0IHRoZSB0cmFuc2NyaXB0IGlzIHNjcm9sbGVkIHRvLCBvciBgLTFgOyByZS1hcHBsaWVkIHdoZW4gdGhlIGRvdHMgcmUtcmVuZGVyLiAqL1xuXHRwcml2YXRlIF9hY3RpdmVJbmRleCA9IC0xO1xuXHQvKiogUm93IGhvbGRpbmcgdGhlIGZseW91dCdzIHNpbmdsZSB0YWIgc3RvcC4gKi9cblx0cHJpdmF0ZSBfZm9jdXNSb3cgPSAwO1xuXHQvKiogV2hpY2ggb2YgdGhhdCByb3cncyB0d28gYnV0dG9ucyBob2xkcyBpdC4gKi9cblx0cHJpdmF0ZSBfZm9jdXNDb2x1bW46IFJvd0NvbHVtbiA9ICdqdW1wJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0OiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRTZWxlY3QuZXZlbnQ7XG5cblx0LyoqIEZpcmVkIGJ5IGEgcm93J3MgZGlmZiBidXR0b24gdG8gcmV2aWV3IHRoYXQgcHJvbXB0J3Mgd2hvbGUgY2hhbmdlc2V0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb21wdFRpY2s+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJldmlldzogRXZlbnQ8UHJvbXB0VGljaz4gPSB0aGlzLl9vbkRpZFJldmlldy5ldmVudDtcblx0Ly8gUGVyLUZJTEUgcmV2aWV3IGlzIG9ubHkgb2ZmZXJlZCBieSB0aGUgcnVsZXIgcmFpbCdzIGhvdmVyIGNhcmQ7IHRoZSBndXR0ZXIgcmFpbCdzIHJvd3MgZHJpbGwgZG93blxuXHQvLyB0byB0aGUgd2hvbGUgcHJvbXB0LiBLZXB0IHRvIHNhdGlzZnkgdGhlIHNoYXJlZCByYWlsIGNvbnRyYWN0LlxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmlld0ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvbXB0UmV2aWV3RmlsZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZpZXdGaWxlOiBFdmVudDxJUHJvbXB0UmV2aWV3RmlsZUV2ZW50PiA9IHRoaXMuX29uRGlkUmV2aWV3RmlsZS5ldmVudDtcblxuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLl9kb21Ob2RlOyB9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kb21Ob2RlID0gJCgnbmF2LnByb21wdC10aW1lbGluZS1yYWlsLnByb21wdC10aW1lbGluZS1yYWlsLWd1dHRlcicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3Byb21wdFRpbWVsaW5lLmd1dHRlci5yYWlsTGFiZWwnLCBcIlByb21wdCB0aW1lbGluZVwiKSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndG9vbGJhcicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLW9yaWVudGF0aW9uJywgJ3ZlcnRpY2FsJyk7XG5cblx0XHRjb25zdCBwYW5lbElkID0gYHByb21wdC10aW1lbGluZS1ndXR0ZXItcGFuZWwtJHtndXR0ZXJJZFNlcSsrfWA7XG5cblx0XHQvLyBUaGUgcmVzdGluZyBhZmZvcmRhbmNlIGlzIGEgZGlzY2xvc3VyZSBidXR0b24gdGhhdCBleHBhbmRzIHRoZSBmbHlvdXQuIEl0IGNhcnJpZXMgb25lIGRvdCBwZXJcblx0XHQvLyBwcm9tcHQgKGJ1aWx0IGluIGBzZXRUaWNrc2ApOyB0aGUgZG90cyBhcmUgZGVjb3JhdGl2ZSBcdTIwMTQgcG9pbnRlciB0YXJnZXRzIG9ubHksIG5ldmVyIGZvY3VzYWJsZSBcdTIwMTRcblx0XHQvLyBzbyB0aGUgYnV0dG9uIG93bnMgdGhlIGFjY2Vzc2libGUgbmFtZSBhbmQgdGhlIGZseW91dCByb3dzIGNhcnJ5IHRoZSBwZXItcHJvbXB0IHNlbWFudGljcy5cblx0XHR0aGlzLl9yZXN0ID0gYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ucHJvbXB0LXRpbWVsaW5lLWd1dHRlci1yZXN0JykpO1xuXHRcdHRoaXMuX3Jlc3Quc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHR0aGlzLl9yZXN0LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdHRoaXMuX3Jlc3Quc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgcGFuZWxJZCk7XG5cdFx0dGhpcy5fcmVzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgncHJvbXB0VGltZWxpbmUuZ3V0dGVyLnRvZ2dsZUxhYmVsJywgXCJTaG93IHByb21wdHNcIikpO1xuXHRcdHRoaXMuX3Jlc3QudGFiSW5kZXggPSAwO1xuXG5cdFx0dGhpcy5fbGlzdCA9IGFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCcucHJvbXB0LXRpbWVsaW5lLWd1dHRlci1wYW5lbCcpKTtcblx0XHR0aGlzLl9saXN0LmlkID0gcGFuZWxJZDtcblxuXHRcdC8vIE1vdXNlOiByZXZlYWwgd2hpbGUgdGhlIHBvaW50ZXIgaXMgb3ZlciB0aGUgcmFpbCBzdWJ0cmVlLiBUaGUgcmFpbCBlbGVtZW50IGlzXG5cdFx0Ly8gcG9pbnRlci10cmFuc3BhcmVudCAoaXRzIGNoaWxkcmVuIG9wdCBiYWNrIGluKSwgc28gYG1vdXNlZW50ZXJgIG5ldmVyIGZpcmVzIG9uIGl0IFx1MjAxNCBidWJibGVcblx0XHQvLyBgbW91c2VvdmVyYC9gbW91c2VvdXRgIGZyb20gdGhlIGhhbmRsZSBhbmQgZmx5b3V0IGluc3RlYWQsIGFuZCBvbmx5IGNvbGxhcHNlIG9uY2UgdGhlIHBvaW50ZXJcblx0XHQvLyB0cnVseSBsZWF2ZXMgdGhlIHJhaWwgc3VidHJlZS4gVGhlIGhhbmRsZSBhbmQgdGhlIGZseW91dCBhcmUgbGFpZCBvdXQgZmx1c2ggKHRoZSBmbHlvdXQgc3RhcnRzXG5cdFx0Ly8gZXhhY3RseSBhdCB0aGUgaGFuZGxlJ3MgcmlnaHQgZWRnZSBcdTIwMTQgc2VlIHRoZSBzaGFyZWQgYC0tcHJvbXB0LXRpbWVsaW5lLWd1dHRlci1oYW5kbGUtKmAgdmFycyksIHNvXG5cdFx0Ly8gdGhleSBmb3JtIG9uZSBjb250aWd1b3VzIGhvdmVyIHJlZ2lvbjogdHJhdmVsbGluZyBiZXR3ZWVuIHRoZW0ga2VlcHMgYHJlbGF0ZWRUYXJnZXRgIGluc2lkZSB0aGVcblx0XHQvLyByYWlsIGFuZCBuZXZlciBjb2xsYXBzZXMsIHdoaWNoIG1lYW5zIGEgbGVhdmUgaGVyZSBpcyBhbHdheXMgYSByZWFsIGxlYXZlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCBFdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5faG92ZXJpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5fdXBkYXRlUmV2ZWFsZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIEV2ZW50VHlwZS5NT1VTRV9PVVQsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2RvbU5vZGUuY29udGFpbnMoZS5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUgfCBudWxsKSkge1xuXHRcdFx0XHR0aGlzLl9ob3ZlcmluZyA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9zZXRQcmV2aWV3KC0xKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlUmV2ZWFsZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBLZWVwIHJvdyBhbmQgZG90IGZlZWRiYWNrIHBhaXJlZCB3aGljaGV2ZXIgc2lkZSBvZiB0aGUgZ3V0dGVyIHJhaWwgdGhlIHBvaW50ZXIgZW50ZXJzIGZyb20uXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2xpc3QsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCBlID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIE5vZGUgfCBudWxsO1xuXHRcdFx0Y29uc3Qgcm93SW5kZXggPSB0YXJnZXQgPT09IG51bGwgPyAtMSA6IHRoaXMuX3Jvd3MuZmluZEluZGV4KHJvdyA9PiByb3cuY29udGFpbmVyLmNvbnRhaW5zKHRhcmdldCkpO1xuXHRcdFx0dGhpcy5fc2V0UHJldmlldyhyb3dJbmRleCwgJ3JvdycpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRvdWNoICsgY2xpY2sgKyBrZXlib2FyZCB0b2dnbGUgb24gdGhlIGhhbmRsZSAoaU9TIG5lZWRzIGJvdGggY2xpY2sgYW5kIHRhcCBwZXIgU2Vzc2lvbnMgZ3VpZGFuY2UpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMuX3Jlc3QpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcmVzdCwgRXZlbnRUeXBlLkNMSUNLLCBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0aGlzLl90b2dnbGVPcGVuKCk7IH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcmVzdCwgVG91Y2hFdmVudFR5cGUuVGFwLCAoKSA9PiB0aGlzLl90b2dnbGVPcGVuKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcmVzdCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZU9wZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBLZXlib2FyZDogb25lIFRhYiBzdG9wIGludG8gdGhlIGZseW91dDsgVXAvRG93biAoYW5kIEhvbWUvRW5kKSBtb3ZlIGJldHdlZW4gcm93cywgTGVmdC9SaWdodFxuXHRcdC8vIGJldHdlZW4gYSByb3cncyBsYWJlbCBhbmQgZGlmZiBidXR0b25zLCBFc2NhcGUgZGlzbWlzc2VzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9saXN0LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4gdGhpcy5fb25MaXN0S2V5RG93bihlKSkpO1xuXG5cdFx0Ly8gRm9jdXMgZnVsbHkgbGVhdmluZyB0aGUgcmFpbCBjb2xsYXBzZXMgdGhlIGRpc2Nsb3N1cmUgKGNvdmVycyBTaGlmdCtUYWIgb2ZmIHRoZSBoYW5kbGUsXG5cdFx0Ly8gVGFiIHBhc3QgdGhlIGxhc3Qgcm93LCBhbmQgdGFwcGluZyBlbHNld2hlcmUgb24gdG91Y2gsIHdoZXJlIG5vIG1vdXNlb3V0IGZpcmVzKS5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgRXZlbnRUeXBlLkZPQ1VTX09VVCwgKGU6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZG9tTm9kZS5jb250YWlucyhlLnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRcdHRoaXMuX29wZW4gPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlUmV2ZWFsZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogUmV2ZWFsIHdoZW5ldmVyIHRoZSBkaXNjbG9zdXJlIGlzIG9wZW4gT1IgdGhlIHBvaW50ZXIgaXMgaG92ZXJpbmc7IGtlZXAgYGFyaWEtZXhwYW5kZWRgIGluIHN5bmMuICovXG5cdHByaXZhdGUgX3VwZGF0ZVJldmVhbGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJldmVhbGVkID0gdGhpcy5fb3BlbiB8fCB0aGlzLl9ob3ZlcmluZztcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JldmVhbGVkJywgcmV2ZWFsZWQpO1xuXHRcdHRoaXMuX3Jlc3Quc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKHJldmVhbGVkKSk7XG5cdH1cblxuXHQvKiogVG9nZ2xlIHRoZSBkaXNjbG9zdXJlIHZpYSBleHBsaWNpdCBhY3RpdmF0aW9uOiBvcGVuaW5nIGZvY3VzZXMgYSByb3csIGNsb3NpbmcgcmV0dXJucyB0byB0aGUgaGFuZGxlLiAqL1xuXHRwcml2YXRlIF90b2dnbGVPcGVuKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vcGVuKSB7XG5cdFx0XHR0aGlzLl9jbG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vcGVuID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVJldmVhbGVkKCk7XG5cdFx0XHR0aGlzLl9mb2N1c0FjdGl2ZVJvdygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZSB0aGUgZGlzY2xvc3VyZSAoc2hhcmVkIGNsb3NlIHBhdGggZm9yIGFjdGl2YXRpb24sIEVzY2FwZSwgYW5kIHJvdyBhY3Rpb25zKS5cblx0ICpcblx0ICogYHJlc3RvcmVGb2N1c2AgcmV0dXJucyBmb2N1cyB0byB0aGUgaGFuZGxlIHNvIGtleWJvYXJkIHVzZXJzIGFyZSBub3Qgc3RyYW5kZWQ7IHRoZSBkaWZmIGFjdGlvblxuXHQgKiBvcHRzIG91dCwgYmVjYXVzZSB0aGUgbXVsdGktZGlmZiBlZGl0b3IgaXQgb3BlbnMgdGFrZXMgZm9jdXMgaXRzZWxmIGFuZCBwdWxsaW5nIGZvY3VzIGJhY2sgdG9cblx0ICogdGhlIHJhaWwgZmlyc3Qgd291bGQgZmlnaHQgaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9jbG9zZShyZXN0b3JlRm9jdXMgPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy5fb3BlbiA9IGZhbHNlO1xuXHRcdHRoaXMuX3VwZGF0ZVJldmVhbGVkKCk7XG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0dGhpcy5fcmVzdC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzQWN0aXZlUm93KCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvY3VzQ2VsbCh0aGlzLl9mb2N1c1JvdywgdGhpcy5fZm9jdXNDb2x1bW4pO1xuXHR9XG5cblx0c2V0RmlsZXNQcm92aWRlcihfcHJvdmlkZXI6ICh0aWNrOiBQcm9tcHRUaWNrKSA9PiByZWFkb25seSBQcm9tcHRGaWxlRGlmZltdKTogdm9pZCB7XG5cdFx0Ly8gVGhlIGd1dHRlciByYWlsJ3Mgcm93cyByZXZpZXcgYSB3aG9sZSBwcm9tcHQ7IG9ubHkgdGhlIHJ1bGVyIHJhaWwncyBob3ZlciBjYXJkIGxpc3RzIHRoZVxuXHRcdC8vIGluZGl2aWR1YWwgZmlsZXMsIHNvIGl0IGhhcyBubyB1c2UgZm9yIHRoZSBwcm92aWRlci5cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWJ1aWxkcyB0aGUgcmVzdGluZyBoYW5kbGUncyBkb3RzLiBUaGVyZSBpcyBvbmUgZG90IHBlciBwcm9tcHQgYXMgbG9uZyBhcyB0aGV5IGZpdCBcdTIwMTQgY2FwcGVkIGJ5XG5cdCAqIHtAbGluayBNQVhfUkVTVF9ET1RTfSBhbmQgYnkgdGhlIHJvb20gdGhlIHJhaWwgYWN0dWFsbHkgaGFzIChzZWUge0BsaW5rIHJlc3REb3RDb3VudH0pOyBiZXlvbmRcblx0ICogdGhhdCB0aGUgZG90cyBhcmUgZXZlbmx5IHNhbXBsZWQgYWNyb3NzIHRoZSBzZXNzaW9uIHNvIGV2ZXJ5IGRvdCBzdGlsbCBzdGFuZHMgZm9yIGEgcmVhbCBwcm9tcHRcblx0ICogKGFuZCB0aGUgYWN0aXZlIHByb21wdCBhbHdheXMgbWFwcyB0byBvbmUpLCB3aXRoIGEgdHJhaWxpbmcgbWFya2VyIHNpZ25hbGxpbmcgdGhlIHNhbXBsaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyRG90cyhjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZG90RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjbGVhck5vZGUodGhpcy5fcmVzdCk7XG5cdFx0dGhpcy5fZG90cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2RvdFRpY2tzLmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgZG90cyA9IHJlc3REb3RDb3VudChjb3VudCwgdGhpcy5fcmFpbEhlaWdodCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkb3RzOyBpKyspIHtcblx0XHRcdGNvbnN0IGRvdCA9IGFwcGVuZCh0aGlzLl9yZXN0LCAkKCcucHJvbXB0LXRpbWVsaW5lLWd1dHRlci1kb3QnKSk7XG5cdFx0XHRjb25zdCB0aWNrSW5kZXggPSBkb3RzID09PSBjb3VudCA/IGkgOiBNYXRoLnJvdW5kKGkgKiAoY291bnQgLSAxKSAvIChkb3RzIC0gMSkpO1xuXHRcdFx0dGhpcy5fZG90cy5wdXNoKGRvdCk7XG5cdFx0XHR0aGlzLl9kb3RUaWNrcy5wdXNoKHRpY2tJbmRleCk7XG5cdFx0XHQvLyBIb3ZlcmluZyBhIGRvdCBwcmV2aWV3cyB0aGUgcHJvbXB0IGl0IHN0YW5kcyBmb3I6IHRoZSBmbHlvdXQgaXMgYWxyZWFkeSByZXZlYWxlZCBieSB0aGVcblx0XHRcdC8vIGJ1YmJsaW5nIGBtb3VzZW92ZXJgLCBzbyB0aGlzIGp1c3QgYnJpbmdzIHRoYXQgcm93IGludG8gdmlldyBhbmQgaGlnaGxpZ2h0cyBpdC5cblx0XHRcdHRoaXMuX2RvdERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZG90LCBFdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4gdGhpcy5fc2V0UHJldmlldyh0aWNrSW5kZXgpKSk7XG5cdFx0fVxuXHRcdC8vIFRoZSBkb3RzIGFyZSBzYW1wbGVkIHJhdGhlciB0aGFuIG9uZS1wZXItcHJvbXB0OiBhIHNtYWxsIHRyYWlsaW5nIG1hcmtlciBzaWduYWxzIHRoZSBlbGlzaW9uLlxuXHRcdGlmIChjb3VudCA+IGRvdHMpIHtcblx0XHRcdGFwcGVuZCh0aGlzLl9yZXN0LCAkKCcucHJvbXB0LXRpbWVsaW5lLWd1dHRlci1kb3QtbW9yZScpKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlRG90SGlnaGxpZ2h0cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9ic2VydmVzIHRoZSByYWlsIHNvIHRoZSBkb3QgY29sdW1uIGtlZXBzIGZpdHRpbmcgd2hlbiB0aGUgdHJhbnNjcmlwdCdzIGhlaWdodCBjaGFuZ2VzIFx1MjAxNCB0aGVcblx0ICogd2luZG93IHJlc2l6aW5nLCB0aGUgY2hhdCBpbnB1dCBncm93aW5nLCBhIHNwbGl0IHZpZXcuIFRoZSByYWlsIGlzIG9ubHkgbW91bnRlZCBvbmNlLCBzbyB0aGVcblx0ICogb2JzZXJ2ZXIgaXMgY3JlYXRlZCBvbiB0aGUgZmlyc3QgcmVuZGVyIGFuZCBsaXZlcyBmb3IgdGhlIHJhaWwncyBsaWZldGltZS5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZVJlc2l6ZU9ic2VydmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZXNpemVPYnNlcnZlclJlYWR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IFJlc2l6ZU9ic2VydmVyQ3RvciA9IGdldFdpbmRvdyh0aGlzLl9kb21Ob2RlKS5SZXNpemVPYnNlcnZlcjtcblx0XHRpZiAoIVJlc2l6ZU9ic2VydmVyQ3Rvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNpemVPYnNlcnZlclJlYWR5ID0gdHJ1ZTtcblx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlckN0b3IoKCkgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIHRoZSB6ZXJvIGhlaWdodCB0aGUgcmFpbCByZXBvcnRzIHdoaWxlIGhpZGRlbiwgc28gdGhlIGxhc3QgcmVhbCBtZWFzdXJlbWVudCAoYW5kXG5cdFx0XHQvLyB3aXRoIGl0IHRoZSBkb3QgY291bnQpIHN1cnZpdmVzIHVudGlsIGl0IGlzIHNob3duIGFnYWluLlxuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5fZG9tTm9kZS5jbGllbnRIZWlnaHQ7XG5cdFx0XHRpZiAoaGVpZ2h0IDw9IDAgfHwgaGVpZ2h0ID09PSB0aGlzLl9yYWlsSGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JhaWxIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0XHRpZiAocmVzdERvdENvdW50KHRoaXMuX3RpY2tDb3VudCwgaGVpZ2h0KSAhPT0gdGhpcy5fZG90cy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyRG90cyh0aGlzLl90aWNrQ291bnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdG9ic2VydmVyLm9ic2VydmUodGhpcy5fZG9tTm9kZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHR9XG5cblx0LyoqIFByZXZpZXdzIHRoZSBwcm9tcHQgYSBob3ZlcmVkIGRvdCBzdGFuZHMgZm9yIGJ5IGhpZ2hsaWdodGluZyBpdHMgcm93IGFuZCBzY3JvbGxpbmcgaXQgaW50byB2aWV3LiAqL1xuXHQvKipcblx0ICogUHJldmlld3MgdGhlIHByb21wdCBhIHJvdyBzdGFuZHMgZm9yOiBoaWdobGlnaHRzIGl0IGFuZCBzY3JvbGxzIGl0IGludG8gdmlldy5cblx0ICpcblx0ICogYHNvdXJjZWAgZGVjaWRlcyB3aGV0aGVyIHRoZSByb3cgZ2V0cyB0aGUgZnVsbC13aWR0aCBiYW5kLiBBIHByZXZpZXcgZnJvbSBhIGhvdmVyZWQgKmRvdCogcG9pbnRzXG5cdCAqIGF0IGEgcm93IHRoZSBwb2ludGVyIGlzIG5vd2hlcmUgbmVhciwgc28gdGhlIHdob2xlIHJvdyBsaWdodHMgdXAgdG8gc2F5IFwidGhpcyBvbmVcIi4gQSBwcmV2aWV3XG5cdCAqIGZyb20gdGhlIHBvaW50ZXIgcmVzdGluZyBvbiB0aGUgcm93IGl0c2VsZiBtdXN0IE5PVCBiYW5kIGl0OiB0aGUgcm93J3MgdHdvIGhhbHZlcyBsaWdodCB1cFxuXHQgKiBpbmRpdmlkdWFsbHkgdW5kZXIgdGhlIHBvaW50ZXIsIGFuZCBhIGJhbmQgY292ZXJpbmcgYm90aCB3b3VsZCBwYWludCBvdmVyIHRoYXQgXHUyMDE0IG1ha2luZyBhIHJvd1xuXHQgKiB3aXRoIHR3byBidXR0b25zIHJlYWQgYXMgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0UHJldmlldyhpbmRleDogbnVtYmVyLCBzb3VyY2U6IFByZXZpZXdTb3VyY2UgPSAnZG90Jyk6IHZvaWQge1xuXHRcdGNvbnN0IGJhbmQgPSBzb3VyY2UgPT09ICdkb3QnID8gaW5kZXggOiAtMTtcblx0XHRpZiAodGhpcy5fcHJldmlld0luZGV4ID09PSBpbmRleCAmJiB0aGlzLl9wcmV2aWV3QmFuZCA9PT0gYmFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcmV2aWV3SW5kZXggPSBpbmRleDtcblx0XHR0aGlzLl9wcmV2aWV3QmFuZCA9IGJhbmQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yb3dzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9yb3dzW2ldLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdwcmV2aWV3JywgaSA9PT0gYmFuZCk7XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZURvdEhpZ2hsaWdodHMoKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5fcmV2ZWFsUm93KGluZGV4KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQWNjZW50cyB0aGUgZG90cyBzdGFuZGluZyBmb3IgdGhlIGFjdGl2ZSAoXCJ5b3UgYXJlIGhlcmVcIikgYW5kIHByZXZpZXdlZCBwcm9tcHRzLiBPbmNlIHRoZSBkb3RzXG5cdCAqIGFyZSBzYW1wbGVkIHRoZSBuZWFyZXN0IGRvdCBzdGFuZHMgaW4sIHNvIGJvdGggYWNjZW50cyBzdXJ2aXZlIGEgcmUtc2FtcGxpbmcgb24gcmVzaXplLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlRG90SGlnaGxpZ2h0cygpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVEb3QgPSB0aGlzLl9maW5kTmVhcmVzdERvdEluZGV4KHRoaXMuX2FjdGl2ZUluZGV4KTtcblx0XHRjb25zdCBwcmV2aWV3RG90ID0gdGhpcy5fZmluZE5lYXJlc3REb3RJbmRleCh0aGlzLl9wcmV2aWV3SW5kZXgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZG90cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fZG90c1tpXS5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpID09PSBhY3RpdmVEb3QpO1xuXHRcdFx0dGhpcy5fZG90c1tpXS5jbGFzc0xpc3QudG9nZ2xlKCdwcmV2aWV3JywgaSA9PT0gcHJldmlld0RvdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE5lYXJlc3REb3RJbmRleCh0aWNrSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKHRpY2tJbmRleCA8IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0bGV0IG5lYXJlc3REb3QgPSAtMTtcblx0XHRsZXQgYmVzdERlbHRhID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZG90VGlja3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGRlbHRhID0gTWF0aC5hYnModGhpcy5fZG90VGlja3NbaV0gLSB0aWNrSW5kZXgpO1xuXHRcdFx0aWYgKGRlbHRhIDwgYmVzdERlbHRhKSB7XG5cdFx0XHRcdGJlc3REZWx0YSA9IGRlbHRhO1xuXHRcdFx0XHRuZWFyZXN0RG90ID0gaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5lYXJlc3REb3Q7XG5cdH1cblxuXHQvKipcblx0ICogU2Nyb2xscyBhIHJvdyBpbnRvIHZpZXcgaW5zaWRlIHRoZSBmbHlvdXQuIERvbmUgYnkgaGFuZCByYXRoZXIgdGhhbiB3aXRoIGBzY3JvbGxJbnRvVmlld2Agc28gYVxuXHQgKiBob3ZlciBjYW4gbmV2ZXIgc2Nyb2xsIHRoZSB0cmFuc2NyaXB0IChvciBhbnkgb3RoZXIgYW5jZXN0b3IpIGJlaGluZCB0aGUgcmFpbC5cblx0ICovXG5cdHByaXZhdGUgX3JldmVhbFJvdyhpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fcm93c1tpbmRleF0/LmNvbnRhaW5lcjtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0b3AgPSBjb250YWluZXIub2Zmc2V0VG9wO1xuXHRcdGNvbnN0IGJvdHRvbSA9IHRvcCArIGNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0Y29uc3Qgdmlld1RvcCA9IHRoaXMuX2xpc3Quc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IHZpZXdCb3R0b20gPSB2aWV3VG9wICsgdGhpcy5fbGlzdC5jbGllbnRIZWlnaHQ7XG5cdFx0aWYgKHRvcCA8IHZpZXdUb3ApIHtcblx0XHRcdHRoaXMuX2xpc3Quc2Nyb2xsVG9wID0gdG9wO1xuXHRcdH0gZWxzZSBpZiAoYm90dG9tID4gdmlld0JvdHRvbSkge1xuXHRcdFx0dGhpcy5fbGlzdC5zY3JvbGxUb3AgPSBib3R0b20gLSB0aGlzLl9saXN0LmNsaWVudEhlaWdodDtcblx0XHR9XG5cdH1cblxuXHRzZXRUaWNrcyh0aWNrczogcmVhZG9ubHkgUHJvbXB0VGlja1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fdGlja0NvdW50ID0gdGlja3MubGVuZ3RoO1xuXHRcdC8vIFRoZSByYWlsIGlzIGRpc3BsYXllZCBieSB0aGUgdGltZSB0aWNrcyBhcnJpdmUsIHNvIHRoaXMgaXMgdGhlIGZpcnN0IGNoYW5jZSB0byBtZWFzdXJlIGl0LlxuXHRcdHRoaXMuX2Vuc3VyZVJlc2l6ZU9ic2VydmVyKCk7XG5cdFx0aWYgKHRoaXMuX3JhaWxIZWlnaHQgPD0gMCkge1xuXHRcdFx0dGhpcy5fcmFpbEhlaWdodCA9IHRoaXMuX2RvbU5vZGUuY2xpZW50SGVpZ2h0O1xuXHRcdH1cblx0XHRjb25zdCBzYW1lU3RydWN0dXJlID0gdGlja3MubGVuZ3RoID09PSB0aGlzLl9yb3dzLmxlbmd0aFxuXHRcdFx0JiYgdGlja3MuZXZlcnkoKHQsIGkpID0+IHRoaXMuX3Jvd3NbaV0/LnRpY2sucmVxdWVzdElkID09PSB0LnJlcXVlc3RJZCk7XG5cdFx0aWYgKHNhbWVTdHJ1Y3R1cmUpIHtcblx0XHRcdC8vIE5vdGUgdGhlIGZvY3VzZWQgdGFyZ2V0IGJlZm9yZSBhbnkgYnV0dG9uIGNhbiBkaXNhcHBlYXIgdW5kZXJuZWF0aCBpdC5cblx0XHRcdGNvbnN0IGRvYyA9IGdldFdpbmRvdyh0aGlzLl9kb21Ob2RlKS5kb2N1bWVudDtcblx0XHRcdGNvbnN0IGZvY3VzZWRDZWxsID0gdGhpcy5faXNMaXZlQ2VsbChkb2MuYWN0aXZlRWxlbWVudCkgPyBkb2MuYWN0aXZlRWxlbWVudCA6IHVuZGVmaW5lZDtcblx0XHRcdC8vIE9ubHkgdGhlIHN0YXRzIGNoYW5nZWQgKHN0cmVhbWluZyBlZGl0cyk7IHVwZGF0ZSB0aGVtIGluIHBsYWNlIHNvIGZvY3VzL2hvdmVyIGFyZSBrZXB0LlxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aWNrcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJSb3codGhpcy5fcm93c1tpXSwgdGlja3NbaV0pO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQSBwcm9tcHQgd2hvc2UgZmlyc3QgZWRpdCBqdXN0IGxhbmRlZCBnYWlucyBhIGRpZmYgYnV0dG9uOyByZS1hcHBseSB0aGUgdGFiIHN0b3BzIHNvIGl0XG5cdFx0XHQvLyBqb2lucyB0aGUgcm92aW5nIG9yZGVyIChhbmQgc28gYSBzdG9wIG5ldmVyIGxhbmRzIG9uIG9uZSB0aGF0IHdlbnQgYXdheSkuXG5cdFx0XHR0aGlzLl91cGRhdGVUYWJTdG9wcyh0aGlzLl9mb2N1c1JvdywgdGhpcy5fZm9jdXNDb2x1bW4pO1xuXHRcdFx0Ly8gVGhlIGZvY3VzZWQgYmFkZ2UgaXMgdGhlIG9uZSB0aGF0IHdlbnQgYXdheSAoaXRzIHByb21wdCdzIGVkaXRzIG5ldHRlZCBiYWNrIHRvIHplcm8pOlxuXHRcdFx0Ly8gZm9sbG93IHRoZSB0YWIgc3RvcCB0byBpdHMgZmFsbGJhY2ssIGluc3RlYWQgb2YgbGVhdmluZyBmb2N1cyBvbiBhIGBkaXNwbGF5OiBub25lYCBidXR0b25cblx0XHRcdC8vIFx1MjAxNCB3aGljaCB0aGUgYnJvd3NlciBzdHJhbmRzIG9uIDxib2R5PiwgYW5kIHRoZSByYWlsIHRoZW4gcmVhZHMgYXMgYSByZWFsIGZvY3VzLW91dC5cblx0XHRcdGlmIChmb2N1c2VkQ2VsbCAmJiAhdGhpcy5faXNMaXZlQ2VsbChmb2N1c2VkQ2VsbCkpIHtcblx0XHRcdFx0dGhpcy5fY2VsbCh0aGlzLl9mb2N1c1JvdywgdGhpcy5fZm9jdXNDb2x1bW4pPy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlQWN0aXZlQ2xhc3NlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jvd0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcm93cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3ByZXZpZXdJbmRleCA9IC0xO1xuXHRcdHRoaXMuX3ByZXZpZXdCYW5kID0gLTE7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuX2xpc3QpO1xuXHRcdC8vIFRoZSByZXN0aW5nIGRvdHMgcHJldmlldyBob3cgbWFueSBwcm9tcHRzIHRoZSBmbHlvdXQgaG9sZHMgYW5kIHdoZXJlIHRoZSB0cmFuc2NyaXB0IGlzLlxuXHRcdHRoaXMuX3JlbmRlckRvdHModGlja3MubGVuZ3RoKTtcblxuXHRcdGZvciAoY29uc3QgdGljayBvZiB0aWNrcykge1xuXHRcdFx0Ly8gVGhlIHJvdyBpcyBhIHBsYWluIGNvbnRhaW5lciwgbm90IGEgYnV0dG9uOiBpdCBob2xkcyB0d28gaW5kZXBlbmRlbnQgdGFyZ2V0cywgYW5kIGFcblx0XHRcdC8vIGJ1dHRvbiBtYXkgbm90IG5lc3QgaW5zaWRlIGEgYnV0dG9uLlxuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gYXBwZW5kKHRoaXMuX2xpc3QsICQoJy5wcm9tcHQtdGltZWxpbmUtZ3V0dGVyLXJvdycpKTtcblx0XHRcdGNvbnN0IGp1bXAgPSBhcHBlbmQoY29udGFpbmVyLCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLnByb21wdC10aW1lbGluZS1ndXR0ZXItcm93LWp1bXAnKSk7XG5cdFx0XHRqdW1wLnRhYkluZGV4ID0gLTE7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGFwcGVuZChqdW1wLCAkKCdzcGFuLnByb21wdC10aW1lbGluZS1ndXR0ZXItcm93LWxhYmVsJykpO1xuXHRcdFx0Y29uc3QgZGlmZiA9IGFwcGVuZChjb250YWluZXIsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ucHJvbXB0LXRpbWVsaW5lLWd1dHRlci1yb3ctZGlmZicpKTtcblx0XHRcdGRpZmYudGFiSW5kZXggPSAtMTtcblx0XHRcdGNvbnN0IHN0YXQgPSBhcHBlbmQoZGlmZiwgJCgnc3Bhbi5wcm9tcHQtdGltZWxpbmUtZ3V0dGVyLXJvdy1zdGF0JykpO1xuXHRcdFx0Y29uc3QgZW50cnk6IElSb3dFbnRyeSA9IHsgdGljaywgY29udGFpbmVyLCBqdW1wLCBkaWZmLCBsYWJlbCwgc3RhdCB9O1xuXHRcdFx0dGhpcy5fcmVuZGVyUm93KGVudHJ5LCB0aWNrKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IHRpY2sucmVxdWVzdElkO1xuXHRcdFx0Ly8gQm90aCB0YXJnZXRzIGNvbGxhcHNlIHRoZSBkaXNjbG9zdXJlIHNvIGl0IGRvZXMgbm90IGxpbmdlciBvdmVyIHRoZSB0cmFuc2NyaXB0IChhIHBvaW50ZXJcblx0XHRcdC8vIHN0aWxsIHJlc3Rpbmcgb24gdGhlIHJhaWwga2VlcHMgaXQgcmV2ZWFsZWQsIGFzIGhvdmVyIGFsd2F5cyBoYXMpLiBKdW1waW5nIHJldHVybnMgZm9jdXNcblx0XHRcdC8vIHRvIHRoZSBoYW5kbGU7IHJldmlld2luZyBsZWF2ZXMgaXQgYWxvbmUsIGZvciB0aGUgZGlmZiBlZGl0b3IgdG8gdGFrZS5cblx0XHRcdHRoaXMuX3Jvd0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoanVtcCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUocmVxdWVzdElkKTtcblx0XHRcdFx0dGhpcy5fY2xvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3Jvd0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZGlmZiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmV2aWV3LmZpcmUoZW50cnkudGljayk7XG5cdFx0XHRcdHRoaXMuX2Nsb3NlKC8qcmVzdG9yZUZvY3VzKi8gZmFsc2UpO1xuXHRcdFx0fSkpO1xuXHRcdFx0Zm9yIChjb25zdCBbYnV0dG9uLCBjb2x1bW5dIG9mIFtbanVtcCwgJ2p1bXAnXSwgW2RpZmYsICdkaWZmJ11dIGFzIGNvbnN0KSB7XG5cdFx0XHRcdHRoaXMuX3Jvd0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCBFdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0XHQvLyBLZXlib2FyZC1mb2N1c2luZyBhIHJvdyAoZS5nLiBUYWIgaW4gZnJvbSB0aGUgaGFuZGxlKSBjb3VudHMgYXMgb3BlbmluZyB0aGUgZGlzY2xvc3VyZS5cblx0XHRcdFx0XHR0aGlzLl9vcGVuID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVSZXZlYWxlZCgpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRhYlN0b3BzKHRoaXMuX3Jvd3MuaW5kZXhPZihlbnRyeSksIGNvbHVtbik7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jvd3MucHVzaChlbnRyeSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlSW5kZXggPSB0aGlzLl9yb3dzLmZpbmRJbmRleChyID0+IHIudGljay5yZXF1ZXN0SWQgPT09IHRoaXMuX2FjdGl2ZVJlcXVlc3RJZCk7XG5cdFx0dGhpcy5fdXBkYXRlVGFiU3RvcHMoYWN0aXZlSW5kZXggPj0gMCA/IGFjdGl2ZUluZGV4IDogMCwgJ2p1bXAnKTtcblx0XHR0aGlzLl91cGRhdGVBY3RpdmVDbGFzc2VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJSb3coZW50cnk6IElSb3dFbnRyeSwgdGljazogUHJvbXB0VGljayk6IHZvaWQge1xuXHRcdGVudHJ5LnRpY2sgPSB0aWNrO1xuXHRcdGVudHJ5Lmp1bXAuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGljay5hcmlhTGFiZWwpO1xuXHRcdGVudHJ5LmxhYmVsLnRleHRDb250ZW50ID0gdGljay50ZXh0O1xuXHRcdGVudHJ5LmxhYmVsLnRpdGxlID0gdGljay50ZXh0O1xuXHRcdC8vIEEgc3RhdCB0aGF0IG5ldHMgb3V0IHRvIG5vIGNoYW5nZWQgbGluZXMgaXMgdHJlYXRlZCBhcyBub3RoaW5nIHRvIHJldmlldy5cblx0XHRjb25zdCBzdGF0ID0gdGljay5zdGF0ICYmIHRpY2suc3RhdC5hZGRlZCArIHRpY2suc3RhdC5yZW1vdmVkID4gMCA/IHRpY2suc3RhdCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZW5kZXJTdGF0KGVudHJ5LnN0YXQsIHN0YXQpO1xuXHRcdC8vIFByb21wdHMgdGhhdCBlZGl0ZWQgbm90aGluZyBoYXZlIG5vdGhpbmcgdG8gcmV2aWV3OiB0aGUgcm93IGRyb3BzIGl0cyBzZWNvbmQgaGFsZiBlbnRpcmVseVxuXHRcdC8vIChyYXRoZXIgdGhhbiBzaG93aW5nIGl0IGRpc2FibGVkKSwgd2hpY2ggYWxzbyB0YWtlcyBpdCBvdXQgb2YgdGhlIGZvY3VzIG9yZGVyLlxuXHRcdGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdyZXZpZXdhYmxlJywgISFzdGF0KTtcblx0XHRpZiAoc3RhdCkge1xuXHRcdFx0ZW50cnkuZGlmZi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdFx0J3Byb21wdFRpbWVsaW5lLmd1dHRlci5yZXZpZXdDaGFuZ2VzJyxcblx0XHRcdFx0XCJSZXZpZXcgQ2hhbmdlcyBmb3IgUHJvbXB0OiB7MH0sIHsxfVwiLFxuXHRcdFx0XHR0aWNrLnRleHQsXG5cdFx0XHRcdHN0YXQuZmlsZUNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgncHJvbXB0VGltZWxpbmUuZ3V0dGVyLnJldmlld09uZUZpbGUnLCBcIjEgZmlsZSBjaGFuZ2VkXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0VGltZWxpbmUuZ3V0dGVyLnJldmlld05GaWxlcycsIFwiezB9IGZpbGVzIGNoYW5nZWRcIiwgc3RhdC5maWxlQ291bnQpLFxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU3RhdChjb250YWluZXI6IEhUTUxFbGVtZW50LCBzdGF0OiBQcm9tcHREaWZmU3RhdCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdGlmICghc3RhdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLmFkZGVkJykpLnRleHRDb250ZW50ID0gYCske3N0YXQuYWRkZWR9YDtcblx0XHRhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnJlbW92ZWQnKSkudGV4dENvbnRlbnQgPSBgXFx1MjIxMiR7c3RhdC5yZW1vdmVkfWA7XG5cdH1cblxuXHQvKiogVGhlIGJ1dHRvbiBhIHJvdyBjb2x1bW4gbWFwcyB0bywgb3IgdW5kZWZpbmVkIHdoZW4gdGhhdCByb3cgaGFzIG5vIGNoYW5nZXMgdG8gcmV2aWV3LiAqL1xuXHRwcml2YXRlIF9jZWxsKHJvd0luZGV4OiBudW1iZXIsIGNvbHVtbjogUm93Q29sdW1uKTogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fcm93c1tyb3dJbmRleF07XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGNvbHVtbiA9PT0gJ2p1bXAnKSB7XG5cdFx0XHRyZXR1cm4gZW50cnkuanVtcDtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3Jldmlld2FibGUnKSA/IGVudHJ5LmRpZmYgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogVHJ1ZSB3aGVuIGBlbGVtZW50YCBpcyBhIHJvdyBidXR0b24gdGhhdCBpcyBzdGlsbCBhIGxpdmUgZm9jdXMgdGFyZ2V0IFx1MjAxNCBhIGRyb3BwZWQgYmFkZ2UgaXMgbm90LiAqL1xuXHRwcml2YXRlIF9pc0xpdmVDZWxsKGVsZW1lbnQ6IEVsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvd3Muc29tZShyb3cgPT4gcm93Lmp1bXAgPT09IGVsZW1lbnRcblx0XHRcdHx8IChyb3cuZGlmZiA9PT0gZWxlbWVudCAmJiByb3cuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygncmV2aWV3YWJsZScpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUm92aW5nIHRhYmluZGV4OiBleGFjdGx5IG9uZSBidXR0b24gYWNyb3NzIHRoZSB3aG9sZSBmbHlvdXQgaXMgdGFiYmFibGUsIHNvIGl0IHN0YXlzIGEgc2luZ2xlIFRhYlxuXHQgKiBzdG9wIGV2ZW4gdGhvdWdoIGV2ZXJ5IHJvdyBub3cgaG9sZHMgdHdvLiBBIHJlcXVlc3RlZCBkaWZmIGNvbHVtbiBmYWxscyBiYWNrIHRvIHRoZSBsYWJlbCB3aGVuXG5cdCAqIHRoYXQgcm93IGhhcyBubyBjaGFuZ2VzLCBzbyB0aGUgdGFiIHN0b3AgY2FuIG5ldmVyIGxhbmQgb24gYSBoaWRkZW4gKHVuZm9jdXNhYmxlKSBidXR0b24uXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVUYWJTdG9wcyhmb2N1c0luZGV4OiBudW1iZXIsIGNvbHVtbjogUm93Q29sdW1uID0gdGhpcy5fZm9jdXNDb2x1bW4pOiB2b2lkIHtcblx0XHR0aGlzLl9mb2N1c1JvdyA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMuX3Jvd3MubGVuZ3RoIC0gMSwgZm9jdXNJbmRleCkpO1xuXHRcdHRoaXMuX2ZvY3VzQ29sdW1uID0gdGhpcy5fY2VsbCh0aGlzLl9mb2N1c1JvdywgY29sdW1uKSA/IGNvbHVtbiA6ICdqdW1wJztcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fY2VsbCh0aGlzLl9mb2N1c1JvdywgdGhpcy5fZm9jdXNDb2x1bW4pO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fcm93cykge1xuXHRcdFx0ZW50cnkuanVtcC50YWJJbmRleCA9IGVudHJ5Lmp1bXAgPT09IGZvY3VzZWQgPyAwIDogLTE7XG5cdFx0XHRlbnRyeS5kaWZmLnRhYkluZGV4ID0gZW50cnkuZGlmZiA9PT0gZm9jdXNlZCA/IDAgOiAtMTtcblx0XHR9XG5cdH1cblxuXHQvKiogTW92ZXMgdGhlIHJvdmluZyB0YWIgc3RvcCBhbmQgdGhlIGZvY3VzIHRvZ2V0aGVyLCBjbGFtcGluZyB0aGUgcm93IGFuZCByZXNvbHZpbmcgdGhlIGNvbHVtbi4gKi9cblx0cHJpdmF0ZSBfZm9jdXNDZWxsKHJvd0luZGV4OiBudW1iZXIsIGNvbHVtbjogUm93Q29sdW1uKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlVGFiU3RvcHMocm93SW5kZXgsIGNvbHVtbik7XG5cdFx0dGhpcy5fY2VsbCh0aGlzLl9mb2N1c1JvdywgdGhpcy5fZm9jdXNDb2x1bW4pPy5mb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBmbHlvdXQncyB0b29sYmFyIGtleWJvYXJkIG1vZGVsOiBVcC9Eb3duIChhbmQgSG9tZS9FbmQpIHdhbGsgdGhlIHJvd3Mga2VlcGluZyB0aGUgY3VycmVudFxuXHQgKiBjb2x1bW4gd2hlcmUgdGhlIHRhcmdldCByb3cgaGFzIG9uZSwgTGVmdC9SaWdodCBjcm9zcyBiZXR3ZWVuIGEgcm93J3MgbGFiZWwgYW5kIGRpZmYgYnV0dG9ucyxcblx0ICogYW5kIEVzY2FwZSBkaXNtaXNzZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9vbkxpc3RLZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcm93cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fY2xvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldFdpbmRvdyh0aGlzLl9kb21Ob2RlKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IHRoaXMuX3Jvd3MuZmluZEluZGV4KHIgPT4gci5qdW1wID09PSBhY3RpdmVFbGVtZW50IHx8IHIuZGlmZiA9PT0gYWN0aXZlRWxlbWVudCk7XG5cdFx0Y29uc3QgY3VycmVudENvbHVtbjogUm93Q29sdW1uID0gdGhpcy5fcm93c1tjdXJyZW50SW5kZXhdPy5kaWZmID09PSBhY3RpdmVFbGVtZW50ID8gJ2RpZmYnIDogJ2p1bXAnO1xuXHRcdGxldCBuZXh0SW5kZXggPSBjdXJyZW50SW5kZXg7XG5cdFx0bGV0IG5leHRDb2x1bW4gPSBjdXJyZW50Q29sdW1uO1xuXHRcdHN3aXRjaCAoZXZlbnQua2V5Q29kZSkge1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkRvd25BcnJvdzogbmV4dEluZGV4ID0gTWF0aC5taW4odGhpcy5fcm93cy5sZW5ndGggLSAxLCBjdXJyZW50SW5kZXggKyAxKTsgYnJlYWs7XG5cdFx0XHRjYXNlIEtleUNvZGUuVXBBcnJvdzogbmV4dEluZGV4ID0gTWF0aC5tYXgoMCwgY3VycmVudEluZGV4IC0gMSk7IGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkhvbWU6IG5leHRJbmRleCA9IDA7IGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkVuZDogbmV4dEluZGV4ID0gdGhpcy5fcm93cy5sZW5ndGggLSAxOyBicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5SaWdodEFycm93OiBuZXh0Q29sdW1uID0gJ2RpZmYnOyBicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5MZWZ0QXJyb3c6IG5leHRDb2x1bW4gPSAnanVtcCc7IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuO1xuXHRcdH1cblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHRoaXMuX2ZvY3VzQ2VsbChuZXh0SW5kZXgsIG5leHRDb2x1bW4pO1xuXHR9XG5cblx0c2V0QWN0aXZlKHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlUmVxdWVzdElkID0gcmVxdWVzdElkO1xuXHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTogdm9pZCB7XG5cdFx0bGV0IGFjdGl2ZUluZGV4ID0gLTE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yb3dzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCByb3cgPSB0aGlzLl9yb3dzW2ldO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5fYWN0aXZlUmVxdWVzdElkICE9PSB1bmRlZmluZWRcblx0XHRcdFx0JiYgKHJvdy50aWNrLnJlcXVlc3RJZCA9PT0gdGhpcy5fYWN0aXZlUmVxdWVzdElkIHx8IHJvdy50aWNrLmFsbFJlcXVlc3RJZHMuaW5jbHVkZXModGhpcy5fYWN0aXZlUmVxdWVzdElkKSk7XG5cdFx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRcdGFjdGl2ZUluZGV4ID0gaTtcblx0XHRcdH1cblx0XHRcdHJvdy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgYWN0aXZlKTtcblx0XHRcdC8vIEV4cG9zZSB0aGUgY3VycmVudCBwcm9tcHQgdG8gYXNzaXN0aXZlIHRlY2gsIG1pcnJvcmluZyB0aGUgb3ZlcnZpZXctcnVsZXIgcmFpbC4gSXQgbWFya3Ncblx0XHRcdC8vIHRoZSBqdW1wIGJ1dHRvbiwgd2hpY2ggaXMgdGhlIG9uZSB0aGF0IG5hbWVzIHRoZSBwcm9tcHQuXG5cdFx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRcdHJvdy5qdW1wLnNldEF0dHJpYnV0ZSgnYXJpYS1jdXJyZW50JywgJ2xvY2F0aW9uJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyb3cuanVtcC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBBY2NlbnQgdGhlIGRvdCBzdGFuZGluZyBmb3IgdGhlIHByb21wdCB0aGUgdHJhbnNjcmlwdCBpcyBzY3JvbGxlZCB0bywgc28gdGhlIHJlc3RpbmcgaGFuZGxlXG5cdFx0Ly8gcmVhZHMgYXMgYSBcInlvdSBhcmUgaGVyZVwiIGFuZCB0cmFja3Mgc2Nyb2xsaW5nLlxuXHRcdHRoaXMuX2FjdGl2ZUluZGV4ID0gYWN0aXZlSW5kZXg7XG5cdFx0dGhpcy5fdXBkYXRlRG90SGlnaGxpZ2h0cygpO1xuXHR9XG5cblx0Zm9jdXNUaWNrKHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9yb3dzLmZpbmRJbmRleChyID0+IHIudGljay5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCB8fCByLnRpY2suYWxsUmVxdWVzdElkcy5pbmNsdWRlcyhyZXF1ZXN0SWQpKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5fZm9jdXNDZWxsKGluZGV4LCAnanVtcCcpO1xuXHRcdH1cblx0fVxuXG5cdHNldEhvc3RXaWR0aCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHdpZHRoID4gMCAmJiB3aWR0aCAhPT0gdGhpcy5faG9zdFdpZHRoKSB7XG5cdFx0XHR0aGlzLl9ob3N0V2lkdGggPSB3aWR0aDtcblx0XHRcdC8vIFRvbyBuYXJyb3cgdG8gcGxhY2UgdGhlIGhhbmRsZSBiZXNpZGUgdGhlIGNvbnRlbnQ6IGhpZGUgaXQgKHRoZSBuYXRpdmUgc2Nyb2xsYmFyIHJlbWFpbnMpLlxuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVyZmxvd2luZycsIHdpZHRoIDwgTUlOX0hPU1RfV0lEVEgpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFRoZSBydWxlciBibG9vbXMgaXRzIGZhbiBvbiBhIGhhcmQgc2Nyb2xsIGFuZCBzY2F0dGVycyBtYXJrcyBieSBzY3JvbGwgcG9zaXRpb247IHRoZSBndXR0ZXIgcmFpbCBpcyBhXG5cdC8vIHN0YXRpYywgZXZlbmx5LXNwYWNlZCBsaXN0LCBzbyBib3RoIGFyZSBpbnRlbnRpb25hbGx5IG5vLW9wcy5cblx0bm90aWZ5SGFyZFdoZWVsKCk6IHZvaWQgeyB9XG5cdHNldFNjcm9sbExheW91dChfbGF5b3V0OiBJUHJvbXB0U2Nyb2xsTGF5b3V0IHwgdW5kZWZpbmVkKTogdm9pZCB7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFXLFdBQVcsaUJBQWlCO0FBQ2xGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUcvQixPQUFPO0FBUVAsTUFBTSxnQkFBZ0I7QUFFdEIsTUFBTSxnQkFBZ0I7QUFNdEIsTUFBTSxXQUFXO0FBQ2pCLE1BQU0sVUFBVTtBQUNoQixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLHFCQUFxQjtBQUUzQixNQUFNLGVBQWU7QUFHZCxTQUFTLGFBQWEsYUFBcUIsWUFBNEI7QUFDN0UsUUFBTSxTQUFTLEtBQUssSUFBSSxhQUFhLGFBQWE7QUFDbEQsTUFBSSxlQUFlLGlCQUFpQixjQUFjLEdBQUc7QUFDcEQsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFlBQVksYUFBYSxLQUFLLGVBQWU7QUFDbkQsUUFBTSxPQUFPLFdBQVc7QUFFeEIsTUFBSSxXQUFXLGVBQWUsS0FBSyxPQUFPLFlBQVksV0FBVyxJQUFJLEtBQUssYUFBYTtBQUN0RixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sS0FBSyxJQUFJLGVBQWUsS0FBSyxJQUFJLFFBQVEsS0FBSyxPQUFPLFlBQVksc0JBQXNCLElBQUksQ0FBQyxDQUFDO0FBQ3JHO0FBd0JBLElBQUksY0FBYztBQXdCWCxNQUFNLGlDQUFpQyxXQUEwQztBQUFBLEVBK0N2RixjQUFjO0FBQ2IsVUFB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
