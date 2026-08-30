import { $, addDisposableListener, append, clearNode, EventType, getWindow, scheduleAtNextAnimationFrame } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { PromptTimelineCard } from "./promptTimelineCard.js";
import { MIN_HOST_WIDTH, spaceMarkCenters } from "./promptTimelineLayout.js";
import "./media/promptTimeline.css";
const MIN_TARGET = 24;
const RELAYOUT_MIN_DELTA = 0.5;
const FAN_SIGMA = 40;
const FAN_SPREAD = 14;
const FAN_LINGER = 2e3;
const HARD_WHEEL_REVEAL_WINDOW = 200;
const PILL_LAYOUT = "even";
const EVEN_PILL_SPACING = 26;
class PromptTimelineRulerRail extends Disposable {
  constructor() {
    super();
    this._markDisposables = this._register(new DisposableStore());
    this._marks = [];
    /** Delays enabling the glide until after a structural rebuild's first layout, so freshly created marks don't slide in from the top. */
    this._glideEnabler = this._register(new MutableDisposable());
    this._resizeObserverReady = false;
    this._hostWidth = Number.POSITIVE_INFINITY;
    /** Cached rail height; only changes on resize (observed), so we avoid reading it — a forced reflow — on every scroll. */
    this._railHeight = 0;
    /** Coalesces scroll-driven relayouts to one per animation frame. */
    this._relayoutScheduled = this._register(new MutableDisposable());
    /** Cached top (client px) of the marks column, captured on pointer-enter so the fan can follow the cursor without a per-move reflow. */
    this._laneTop = 0;
    /** True while the pointer is over the lane (keeps the fan open; the linger only collapses once it leaves). */
    this._hovering = false;
    /** Timestamp (ms) of the last hard/fast wheel flick; the fan blooms only if a real scroll follows it within {@link HARD_WHEEL_REVEAL_WINDOW}. */
    this._hardWheelAt = 0;
    /** Collapses the fan {@link FAN_LINGER}ms after the last scroll, unless the pointer is keeping it open. */
    this._fanHide = this._register(new MutableDisposable());
    /** Timestamp (ms) of the last scroll/leave that should keep the fan up; the linger timer re-checks this instead of being churned every scroll frame. */
    this._lastFanActivityAt = 0;
    /** When the user prefers reduced motion the fan is disabled (marks stay their calm rest size). */
    this._reducedMotion = false;
    /** True while keyboard focus is inside the rail: the marks stay revealed (`:focus-within`) but the fisheye is suppressed. */
    this._focused = false;
    this._onDidSelect = this._register(new Emitter());
    this.onDidSelect = this._onDidSelect.event;
    this._onDidReview = this._register(new Emitter());
    this.onDidReview = this._onDidReview.event;
    this._onDidReviewFile = this._register(new Emitter());
    this.onDidReviewFile = this._onDidReviewFile.event;
    this._domNode = $("nav.prompt-timeline-rail.prompt-timeline-rail-ruler");
    this._domNode.setAttribute("aria-label", localize("promptTimeline.railLabel", "Prompt timeline"));
    this._domNode.setAttribute("role", "toolbar");
    this._domNode.setAttribute("aria-orientation", "vertical");
    this._marksContainer = append(this._domNode, $(".prompt-timeline-ruler-marks"));
    this._card = this._register(new PromptTimelineCard(this._domNode));
    this._register(this._card.onDidReview((tick) => this._onDidReview.fire(tick)));
    this._register(this._card.onDidReviewFile((e) => this._onDidReviewFile.fire(e)));
    this._register(addDisposableListener(this._marksContainer, EventType.KEY_DOWN, (e) => this._onMarksKeyDown(e)));
    this._register(addDisposableListener(this._marksContainer, EventType.MOUSE_ENTER, (e) => {
      this._laneTop = this._laneTopNow();
      this._hovering = true;
      this._fanHide.clear();
      this._engage(e.clientY - this._laneTop);
    }));
    this._register(addDisposableListener(this._marksContainer, EventType.MOUSE_MOVE, (e) => {
      this._hovering = true;
      this._engage(e.clientY - this._laneTop);
    }));
    this._register(addDisposableListener(this._marksContainer, EventType.MOUSE_LEAVE, () => {
      this._hovering = false;
      this._scheduleFanHide();
    }));
    const win = getWindow(this._domNode);
    const reducedMotionQuery = win.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reducedMotionQuery) {
      this._reducedMotion = reducedMotionQuery.matches;
      this._register(addDisposableListener(reducedMotionQuery, "change", () => {
        this._reducedMotion = reducedMotionQuery.matches;
        this._applyFan();
      }));
    }
    this._register(addDisposableListener(this._domNode, EventType.FOCUS_IN, () => {
      this._focused = true;
      this._collapseFan();
    }));
    this._register(addDisposableListener(this._domNode, EventType.FOCUS_OUT, () => {
      if (!this._domNode.contains(getWindow(this._domNode).document.activeElement)) {
        this._focused = false;
        this._card.scheduleHide();
      }
    }));
  }
  get domNode() {
    return this._domNode;
  }
  setFilesProvider(provider) {
    this._card.setFilesProvider(provider);
  }
  setTicks(ticks) {
    const sameStructure = ticks.length === this._marks.length && ticks.every((t, i) => this._marks[i]?.tick.requestId === t.requestId);
    if (sameStructure) {
      for (let i = 0; i < ticks.length; i++) {
        this._renderMark(this._marks[i], ticks[i]);
      }
      this._updateActiveClasses();
      this._relayout();
      return;
    }
    this._markDisposables.clear();
    this._marks.length = 0;
    clearNode(this._marksContainer);
    this._card.hide();
    this._marksContainer.classList.remove("glide");
    this._glideEnabler.clear();
    for (const tick of ticks) {
      const button = append(this._marksContainer, $("button.prompt-timeline-ruler-mark"));
      button.tabIndex = -1;
      const bar = append(button, $("span.prompt-timeline-ruler-bar"));
      const entry = { tick, button, bar };
      this._renderMark(entry, tick);
      const requestId = tick.requestId;
      this._markDisposables.add(addDisposableListener(button, EventType.CLICK, () => this._onDidSelect.fire(requestId)));
      this._markDisposables.add(addDisposableListener(button, EventType.MOUSE_ENTER, () => this._showCard(entry)));
      this._markDisposables.add(addDisposableListener(button, EventType.FOCUS, () => {
        this._showCard(entry);
        this._updateTabStops(this._marks.indexOf(entry));
      }));
      this._markDisposables.add(addDisposableListener(button, EventType.MOUSE_LEAVE, () => this._card.scheduleHide()));
      this._marks.push(entry);
    }
    this._ensureResizeObserver();
    const activeIndex = this._marks.findIndex((m) => m.tick.requestId === this._activeRequestId);
    this._updateTabStops(activeIndex >= 0 ? activeIndex : 0);
    this._updateActiveClasses();
    this._relayout();
    this._glideEnabler.value = scheduleAtNextAnimationFrame(getWindow(this._domNode), () => this._marksContainer.classList.add("glide"));
  }
  /** Roving tabindex: exactly one mark is tabbable so the toolbar is a single Tab stop. */
  _updateTabStops(focusIndex) {
    for (let i = 0; i < this._marks.length; i++) {
      this._marks[i].button.tabIndex = i === focusIndex ? 0 : -1;
    }
  }
  _onMarksKeyDown(e) {
    if (this._marks.length === 0) {
      return;
    }
    const event = new StandardKeyboardEvent(e);
    const currentIndex = this._marks.findIndex((m) => m.button === getWindow(this._domNode).document.activeElement);
    let nextIndex;
    switch (event.keyCode) {
      case KeyCode.DownArrow:
        nextIndex = Math.min(this._marks.length - 1, currentIndex + 1);
        break;
      case KeyCode.UpArrow:
        nextIndex = Math.max(0, currentIndex - 1);
        break;
      case KeyCode.Home:
        nextIndex = 0;
        break;
      case KeyCode.End:
        nextIndex = this._marks.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    this._updateTabStops(nextIndex);
    this._marks[nextIndex]?.button.focus();
  }
  _renderMark(entry, tick) {
    entry.tick = tick;
    entry.button.setAttribute("aria-label", tick.ariaLabel);
    clearNode(entry.bar);
    const stat = tick.stat;
    const edited = !!stat && stat.added + stat.removed > 0;
    entry.bar.classList.toggle("edited", edited);
    if (edited) {
      if (stat.added > 0) {
        append(entry.bar, $("span.seg-add")).style.flexGrow = String(stat.added);
      }
      if (stat.removed > 0) {
        append(entry.bar, $("span.seg-del")).style.flexGrow = String(stat.removed);
      }
    }
  }
  /**
   * Records a hard/fast wheel flick. The fan does NOT bloom here — it blooms only if the transcript
   * actually scrolls shortly after (see {@link setScrollLayout}). This way a hard flick against the
   * top/bottom scroll limit, which moves nothing, never reveals the fan.
   */
  notifyHardWheel() {
    this._hardWheelAt = Date.now();
  }
  /** Lane-local Y of the active mark (the prompt currently scrolled to), or the nearest visible one. */
  _activeCenter() {
    const active = this._marks.find((m) => m.tick.requestId === this._activeRequestId && m.baseCenter !== void 0);
    if (active?.baseCenter !== void 0) {
      return active.baseCenter;
    }
    const laidOut = this._marks.filter((m) => m.baseCenter !== void 0);
    return laidOut.at(-1)?.baseCenter;
  }
  /**
   * Lane-local Y for the fisheye focus while SCROLLING: glides continuously with the viewport by
   * interpolating between pills. Each prompt has a content position (`layout.marks[].top`) and a dock
   * position (`baseCenter`); we find where the viewport (`scrollTop`) sits between two prompts in
   * content space and place the focus at the matching fraction between their dock positions. So the
   * fisheye travels smoothly through the pills as you scroll (rather than snapping at prompt
   * boundaries), while still tracking the real scroll position. Returns `undefined` if not laid out.
   */
  _scrollFanCenter() {
    const layout = this._layout;
    if (!layout) {
      return void 0;
    }
    const topById = new Map(layout.marks.map((m) => [m.requestId, m.top]));
    const pts = [];
    for (const entry of this._marks) {
      const contentTop = topById.get(entry.tick.requestId);
      if (contentTop !== void 0 && entry.baseCenter !== void 0) {
        pts.push({ contentTop, center: entry.baseCenter });
      }
    }
    if (pts.length === 0) {
      return void 0;
    }
    pts.sort((a, b) => a.contentTop - b.contentTop);
    const scrollTop = layout.scrollHeight > 0 ? layout.scrollTop / layout.scrollHeight * layout.total : layout.scrollTop;
    if (scrollTop <= pts[0].contentTop) {
      return pts[0].center;
    }
    const last = pts[pts.length - 1];
    if (scrollTop >= last.contentTop) {
      return last.center;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (scrollTop >= a.contentTop && scrollTop <= b.contentTop) {
        const span = b.contentTop - a.contentTop;
        const frac = span > 0 ? (scrollTop - a.contentTop) / span : 0;
        return a.center + frac * (b.center - a.center);
      }
    }
    return last.center;
  }
  setActive(requestId) {
    this._activeRequestId = requestId;
    this._updateActiveClasses();
  }
  focusTick(requestId) {
    this._marks.find((m) => m.tick.requestId === requestId || m.tick.allRequestIds.includes(requestId))?.button.focus();
  }
  setHostWidth(width) {
    if (width > 0 && width !== this._hostWidth) {
      this._hostWidth = width;
      this._relayout();
    }
  }
  setScrollLayout(layout) {
    const prevScrollTop = this._lastScrollTop;
    this._layout = layout;
    if (layout) {
      this._lastScrollTop = layout.scrollTop;
      if (prevScrollTop !== void 0 && Math.abs(layout.scrollTop - prevScrollTop) > 0.5) {
        this._onScrolled();
      }
    }
    this._scheduleRelayout();
  }
  /**
   * Handles a real transcript scroll: blooms the fan if it followed a deliberate hard flick, and
   * keeps it alive (re-arms the linger) while you keep scrolling. Pointer hover owns the fan on its
   * own, so this defers to it.
   */
  _onScrolled() {
    if (this._hovering || this._focused) {
      return;
    }
    if (this._domNode.classList.contains("engaged")) {
      this._scheduleFanHide();
      return;
    }
    if (Date.now() - this._hardWheelAt <= HARD_WHEEL_REVEAL_WINDOW) {
      const center = this._scrollFanCenter() ?? this._activeCenter();
      if (center !== void 0) {
        this._engage(center);
        this._scheduleFanHide();
      }
    }
  }
  /** Coalesces relayout to at most once per animation frame. */
  _scheduleRelayout() {
    if (this._relayoutScheduled.value) {
      return;
    }
    this._relayoutScheduled.value = scheduleAtNextAnimationFrame(getWindow(this._domNode), () => {
      this._relayoutScheduled.clear();
      this._relayout();
    });
  }
  /** Places each mark at its proportional scroll position, spaced so hit targets never overlap. */
  _relayout() {
    const height = this._railHeight > 0 ? this._railHeight : this._railHeight = this._domNode.clientHeight;
    const layout = this._layout;
    const overflowing = this._hostWidth < MIN_HOST_WIDTH;
    this._domNode.classList.toggle("overflowing", overflowing);
    if (overflowing || height <= 0 || !layout || layout.total <= 0) {
      return;
    }
    const scale = height / layout.total;
    const topById = new Map(layout.marks.map((m) => [m.requestId, m.top]));
    const visible = [];
    for (const entry of this._marks) {
      const top = topById.get(entry.tick.requestId);
      if (top === void 0) {
        entry.button.classList.add("hidden");
        entry.lastTop = void 0;
        entry.baseCenter = void 0;
        entry.button.style.transform = "";
        entry.bar.style.transform = "";
        continue;
      }
      entry.button.classList.remove("hidden");
      visible.push({ entry, center: top * scale });
    }
    if (PILL_LAYOUT === "even") {
      this._spaceEvenCenters(visible, height);
    } else {
      spaceMarkCenters(visible, height, MIN_TARGET);
    }
    for (const { entry, center } of visible) {
      entry.baseCenter = center;
      const y = center - MIN_TARGET / 2;
      if (entry.lastTop !== void 0 && Math.abs(y - entry.lastTop) < RELAYOUT_MIN_DELTA) {
        continue;
      }
      entry.lastTop = y;
      entry.button.style.top = `${y}px`;
    }
    if (this._domNode.classList.contains("engaged") && !this._hovering && !this._focused) {
      const scrollCenter = this._scrollFanCenter();
      if (scrollCenter !== void 0) {
        this._fanCenter = scrollCenter;
      }
    }
    this._applyFan();
  }
  /**
   * Even (dock) placement: stacks the pills at a fixed spacing and centres the whole group in the
   * lane. If the group is taller than the lane it distributes across the full height instead, so a
   * long session still fits. Mutates each item's `center` in place.
   */
  _spaceEvenCenters(visible, height) {
    const n = visible.length;
    if (n === 0) {
      return;
    }
    const groupHeight = n * EVEN_PILL_SPACING;
    let start;
    let step;
    if (groupHeight <= height) {
      step = EVEN_PILL_SPACING;
      start = (height - groupHeight) / 2 + step / 2;
    } else {
      step = (height - EVEN_PILL_SPACING) / (n - 1);
      start = EVEN_PILL_SPACING / 2;
    }
    for (let i = 0; i < n; i++) {
      visible[i].center = start + i * step;
    }
  }
  /**
   * Fisheye "fan": magnify the marks near {@link _fanCenter} and gently spread their neighbours
   * apart, so a dense cluster becomes easy to read and click. It is a pointer-only flourish layered
   * on top of the proportional layout — the marks' `top` (owned by `_relayout`) is untouched; the
   * fan only adds a CSS `transform`, so keyboard navigation and the base layout are unaffected.
   * Disabled entirely under reduced-motion.
   */
  _applyFan() {
    const center = this._fanCenter;
    const fanning = center !== void 0 && !this._reducedMotion;
    for (const entry of this._marks) {
      if (entry.baseCenter === void 0) {
        continue;
      }
      if (!fanning) {
        entry.button.style.transform = "";
        entry.bar.style.transform = "";
        continue;
      }
      const d = entry.baseCenter - center;
      const m = Math.exp(-(d * d) / (2 * FAN_SIGMA * FAN_SIGMA));
      entry.button.style.transform = `translateY(${FAN_SPREAD * Math.tanh(d / FAN_SIGMA)}px)`;
      entry.bar.style.transform = `scale(${1 + m * 0.9}, ${1 + m * 0.6})`;
    }
  }
  /**
   * Opens the fan at {@link center} (lane-local Y): reveals the marks (via `.engaged`) and applies
   * the fisheye. Reveal happens even under reduced motion (the marks just don't magnify).
   */
  _engage(center) {
    this._domNode.classList.add("engaged");
    this._fanCenter = center;
    this._applyFan();
  }
  /** Collapses the fan back to the plain scrollbar (marks hidden, no fisheye). */
  _collapseFan() {
    if (!this._domNode.classList.contains("engaged")) {
      return;
    }
    this._domNode.classList.remove("engaged");
    this._fanCenter = void 0;
    this._applyFan();
  }
  /**
   * (Re)starts the linger countdown: {@link FAN_LINGER}ms after the last scroll the fan collapses —
   * but only if the pointer is not keeping it open. Called on every scroll frame and when the pointer
   * leaves, so it avoids churning the timer: it just stamps the activity time and, when the single
   * running timer fires, it re-arms for the remaining time if more scrolling happened since.
   */
  _scheduleFanHide() {
    this._lastFanActivityAt = Date.now();
    if (!this._fanHide.value) {
      this._armFanHide(FAN_LINGER);
    }
  }
  _armFanHide(delay) {
    this._fanHide.value = disposableTimeout(() => {
      this._fanHide.clear();
      if (this._hovering) {
        return;
      }
      const remaining = FAN_LINGER - (Date.now() - this._lastFanActivityAt);
      if (remaining > 0) {
        this._armFanHide(remaining);
      } else {
        this._collapseFan();
      }
    }, delay);
  }
  _updateActiveClasses() {
    for (const entry of this._marks) {
      const isActive = entry.tick.requestId === this._activeRequestId;
      entry.button.classList.toggle("active", isActive);
      if (isActive) {
        entry.button.setAttribute("aria-current", "location");
      } else {
        entry.button.removeAttribute("aria-current");
      }
    }
  }
  /** Lane-local Y (client px) of the marks column top, from the cached rail top (refreshed on resize). Reads layout lazily only if the cache is not yet primed, so hovering never forces a reflow mid-scroll. */
  _laneTopNow() {
    if (this._domTop === void 0) {
      this._domTop = this._domNode.getBoundingClientRect().top;
    }
    return this._domTop;
  }
  _showCard(entry) {
    const centerY = entry.baseCenter ?? entry.button.getBoundingClientRect().top - this._domNode.getBoundingClientRect().top + MIN_TARGET / 2;
    this._card.show(entry.tick, centerY);
  }
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
      this._railHeight = this._domNode.clientHeight;
      this._domTop = this._domNode.getBoundingClientRect().top;
      this._relayout();
    });
    observer.observe(this._domNode);
    this._register(toDisposable(() => observer.disconnect()));
  }
}
export {
  PromptTimelineRulerRail
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFRpbWVsaW5lXFxwcm9tcHRUaW1lbGluZVJ1bGVyUmFpbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBjbGVhck5vZGUsIEV2ZW50VHlwZSwgZ2V0V2luZG93LCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRUaW1lbGluZUNhcmQgfSBmcm9tICcuL3Byb21wdFRpbWVsaW5lQ2FyZC5qcyc7XG5pbXBvcnQgeyBNSU5fSE9TVF9XSURUSCwgc3BhY2VNYXJrQ2VudGVycyB9IGZyb20gJy4vcHJvbXB0VGltZWxpbmVMYXlvdXQuanMnO1xuaW1wb3J0IHsgSVByb21wdFNjcm9sbExheW91dCwgUHJvbXB0RmlsZURpZmYsIFByb21wdFRpY2sgfSBmcm9tICcuL3Byb21wdFRpbWVsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgSVByb21wdFJldmlld0ZpbGVFdmVudCwgSVByb21wdFRpbWVsaW5lUmFpbCB9IGZyb20gJy4vcHJvbXB0VGltZWxpbmVSYWlsLmpzJztcbmltcG9ydCAnLi9tZWRpYS9wcm9tcHRUaW1lbGluZS5jc3MnO1xuXG4vKiogTWluaW11bSBjbGlja2FibGUgdGFyZ2V0IHNpemUgKFdDQUcgMi41LjgpIGZvciBlYWNoIG1hcmsncyBoaXQgYXJlYS4gKi9cbmNvbnN0IE1JTl9UQVJHRVQgPSAyNDtcbi8qKiBTa2lwIHJlLXBvc2l0aW9uaW5nIGEgbWFyayBmb3Igc3ViLXBpeGVsIGRyaWZ0LCBzbyBlc3RpbWF0ZSBub2lzZSBkb2Vzbid0IGNhdXNlIG1pY3JvLWppdHRlci4gKi9cbmNvbnN0IFJFTEFZT1VUX01JTl9ERUxUQSA9IDAuNTtcbi8qKiBGaXNoZXllIFwiZmFuXCIgbGVuczogc3RhbmRhcmQgZGV2aWF0aW9uIChweCkgb2YgdGhlIG1hZ25pZmljYXRpb24gZmFsbG9mZiBhcm91bmQgdGhlIGZvY3VzLiAqL1xuY29uc3QgRkFOX1NJR01BID0gNDA7XG4vKiogRmlzaGV5ZSBcImZhblwiIGxlbnM6IGhvdyBmYXIgKHB4KSBuZWlnaGJvdXJpbmcgbWFya3MgYXJlIHB1c2hlZCBhcGFydCBhcm91bmQgdGhlIGZvY3VzLiAqL1xuY29uc3QgRkFOX1NQUkVBRCA9IDE0O1xuLyoqIFRoZSBmYW4gbGluZ2VycyB0aGlzIGxvbmcgKG1zKSBhZnRlciB0aGUgbGFzdCBzY3JvbGwgXHUyMDE0IHdoaWxlIHRoZSBwb2ludGVyIGlzIGF3YXkgXHUyMDE0IGJlZm9yZSBjb2xsYXBzaW5nLiAqL1xuY29uc3QgRkFOX0xJTkdFUiA9IDIwMDA7XG4vKiogQSBoYXJkIHdoZWVsIGZsaWNrIG9ubHkgcmV2ZWFscyB0aGUgZmFuIGlmIHRoZSB0cmFuc2NyaXB0IGFjdHVhbGx5IHNjcm9sbHMgd2l0aGluIHRoaXMgd2luZG93IChtcykgXHUyMDE0IHNvIGZsaWNraW5nIGFnYWluc3QgdGhlIHRvcC9ib3R0b20gbGltaXQsIHdoaWNoIG1vdmVzIG5vdGhpbmcsIG5ldmVyIGJsb29tcyBpdC4gKi9cbmNvbnN0IEhBUkRfV0hFRUxfUkVWRUFMX1dJTkRPVyA9IDIwMDtcbi8qKlxuICogUGlsbCBwbGFjZW1lbnQuIGAncHJvcG9ydGlvbmFsJ2Agc2NhdHRlcnMgcGlsbHMgYXQgdGhlaXIgcmVhbCBzY3JvbGwgcG9zaXRpb24gKGFuIG92ZXJ2aWV3IHJ1bGVyKTtcbiAqIGAnZXZlbidgIHN0YWNrcyB0aGVtIGFzIGFuIGV2ZW5seS1zcGFjZWQgZG9jayBjZW50cmVkIGluIHRoZSBsYW5lIChzdGFibGUgdW5kZXIgdmlydHVhbGl6YXRpb24sIGFuZFxuICogdGlkaWVyIHdoZW4gYmlnIHJlc3BvbnNlcyB3b3VsZCBvdGhlcndpc2UgY2x1c3RlciB0aGUgcGlsbHMpLiBUaGUgc2Nyb2xsYmFyIHRodW1iIHN0YXlzIHByb3BvcnRpb25hbFxuICogZWl0aGVyIHdheSwgYW5kIHRoZSBmYW4gaXMgaGlkZGVuIHVudGlsIGVuZ2FnZWQsIHNvIGAnZXZlbidgIHN0aWxsIHJlYWRzIGNhbG1seSBhdCByZXN0LlxuICovXG5jb25zdCBQSUxMX0xBWU9VVDogJ3Byb3BvcnRpb25hbCcgfCAnZXZlbicgPSAnZXZlbic7XG4vKiogRXZlbiBsYXlvdXQ6IHZlcnRpY2FsIGdhcCAocHgpIGJldHdlZW4gcGlsbCBjZW50cmVzIFx1MjAxNCBhbHNvIHRoZSBtaW4gc28gaGl0IHRhcmdldHMgbmV2ZXIgb3ZlcmxhcC4gKi9cbmNvbnN0IEVWRU5fUElMTF9TUEFDSU5HID0gMjY7XG5cbmludGVyZmFjZSBJTWFya0VudHJ5IHtcblx0dGljazogUHJvbXB0VGljaztcblx0cmVhZG9ubHkgYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudDtcblx0cmVhZG9ubHkgYmFyOiBIVE1MRWxlbWVudDtcblx0LyoqIExhc3QgYXBwbGllZCBgdG9wYCAocHgpIHNvIHRpbnkgcmVsYXlvdXQgZGVsdGFzIGNhbiBiZSBza2lwcGVkLiAqL1xuXHRsYXN0VG9wPzogbnVtYmVyO1xuXHQvKiogUHJvcG9ydGlvbmFsIChwcmUtZmFuKSBjZW50cmUgKHB4KSBmcm9tIHRoZSBsYXN0IGxheW91dCwgdXNlZCBhcyB0aGUgZmFuJ3MgcmVzdCBwb3NpdGlvbi4gKi9cblx0YmFzZUNlbnRlcj86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBUaGUgb3ZlcnZpZXctcnVsZXIgcmFpbC4gVGhlIHdob2xlIHNlc3Npb24gaXMgY29tcHJlc3NlZCBpbnRvIHRoZSByYWlsIGhlaWdodFxuICogbGlrZSB0aGUgZWRpdG9yJ3Mgb3ZlcnZpZXcgcnVsZXI6IGVhY2ggcHJvbXB0IGlzIGEgbWFyayBhdCBpdHMgcHJvcG9ydGlvbmFsXG4gKiBzY3JvbGwgcG9zaXRpb24sIGNvbG91cmVkIG9ubHkgdG8gc2lnbmFsIHdoZXRoZXIgaXQgY2hhbmdlZCBjb2RlLiBUaGUgcmFpbCBzaXRzXG4gKiBpbiBhIGd1dHRlciBqdXN0IGJlc2lkZSB0aGUgdHJhbnNjcmlwdCdzIG5hdGl2ZSBzY3JvbGxiYXIgKHdoaWNoIGtlZXBzIGhhbmRsaW5nXG4gKiBzY3JvbGwgYW5kIHBvc2l0aW9uKTsgdGhlIGFjdGl2ZSBtYXJrIGlzIHRoZSBcInlvdS1hcmUtaGVyZVwiLiBEZXRhaWwgbGl2ZXMgaW4gdGhlXG4gKiBob3ZlciBjYXJkLlxuICovXG5leHBvcnQgY2xhc3MgUHJvbXB0VGltZWxpbmVSdWxlclJhaWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb21wdFRpbWVsaW5lUmFpbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FyZDogUHJvbXB0VGltZWxpbmVDYXJkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrczogSU1hcmtFbnRyeVtdID0gW107XG5cdC8qKiBEZWxheXMgZW5hYmxpbmcgdGhlIGdsaWRlIHVudGlsIGFmdGVyIGEgc3RydWN0dXJhbCByZWJ1aWxkJ3MgZmlyc3QgbGF5b3V0LCBzbyBmcmVzaGx5IGNyZWF0ZWQgbWFya3MgZG9uJ3Qgc2xpZGUgaW4gZnJvbSB0aGUgdG9wLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nbGlkZUVuYWJsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfYWN0aXZlUmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xheW91dDogSVByb21wdFNjcm9sbExheW91dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVzaXplT2JzZXJ2ZXJSZWFkeSA9IGZhbHNlO1xuXHRwcml2YXRlIF9ob3N0V2lkdGggPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdC8qKiBDYWNoZWQgcmFpbCBoZWlnaHQ7IG9ubHkgY2hhbmdlcyBvbiByZXNpemUgKG9ic2VydmVkKSwgc28gd2UgYXZvaWQgcmVhZGluZyBpdCBcdTIwMTQgYSBmb3JjZWQgcmVmbG93IFx1MjAxNCBvbiBldmVyeSBzY3JvbGwuICovXG5cdHByaXZhdGUgX3JhaWxIZWlnaHQgPSAwO1xuXHQvKiogQ29hbGVzY2VzIHNjcm9sbC1kcml2ZW4gcmVsYXlvdXRzIHRvIG9uZSBwZXIgYW5pbWF0aW9uIGZyYW1lLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWxheW91dFNjaGVkdWxlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0LyoqIExhbmUtbG9jYWwgWSB0aGUgZmlzaGV5ZSBcImZhblwiIG1hZ25pZmllcyBhcm91bmQsIG9yIHVuZGVmaW5lZCB3aGVuIHRoZSBmYW4gaXMgYXQgcmVzdC4gKi9cblx0cHJpdmF0ZSBfZmFuQ2VudGVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBDYWNoZWQgdG9wIChjbGllbnQgcHgpIG9mIHRoZSBtYXJrcyBjb2x1bW4sIGNhcHR1cmVkIG9uIHBvaW50ZXItZW50ZXIgc28gdGhlIGZhbiBjYW4gZm9sbG93IHRoZSBjdXJzb3Igd2l0aG91dCBhIHBlci1tb3ZlIHJlZmxvdy4gKi9cblx0cHJpdmF0ZSBfbGFuZVRvcCA9IDA7XG5cdC8qKiBDYWNoZWQgY2xpZW50IFkgb2YgdGhlIHJhaWwncyB0b3AgZWRnZSwgcmVmcmVzaGVkIG9uIHJlc2l6ZTsgdXNlZCB0byBwbGFjZSB0aGUgaG92ZXIgY2FyZCBhbmQgZGVyaXZlIHRoZSBsYW5lLWxvY2FsIHBvaW50ZXIgWSB3aXRob3V0IGEgcGVyLWhvdmVyIGZvcmNlZCByZWZsb3cuICovXG5cdHByaXZhdGUgX2RvbVRvcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogVHJ1ZSB3aGlsZSB0aGUgcG9pbnRlciBpcyBvdmVyIHRoZSBsYW5lIChrZWVwcyB0aGUgZmFuIG9wZW47IHRoZSBsaW5nZXIgb25seSBjb2xsYXBzZXMgb25jZSBpdCBsZWF2ZXMpLiAqL1xuXHRwcml2YXRlIF9ob3ZlcmluZyA9IGZhbHNlO1xuXHQvKiogVGltZXN0YW1wIChtcykgb2YgdGhlIGxhc3QgaGFyZC9mYXN0IHdoZWVsIGZsaWNrOyB0aGUgZmFuIGJsb29tcyBvbmx5IGlmIGEgcmVhbCBzY3JvbGwgZm9sbG93cyBpdCB3aXRoaW4ge0BsaW5rIEhBUkRfV0hFRUxfUkVWRUFMX1dJTkRPV30uICovXG5cdHByaXZhdGUgX2hhcmRXaGVlbEF0ID0gMDtcblx0LyoqIExhc3Qgc2Nyb2xsIG9mZnNldCBzZWVuLCB0byBkZXRlY3QgcmVhbCB0cmFuc2NyaXB0IG1vdmVtZW50ICh2cy4gYSB3aGVlbCB0aGF0IGhpdCB0aGUgc2Nyb2xsIGxpbWl0IGFuZCBtb3ZlZCBub3RoaW5nKS4gKi9cblx0cHJpdmF0ZSBfbGFzdFNjcm9sbFRvcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogQ29sbGFwc2VzIHRoZSBmYW4ge0BsaW5rIEZBTl9MSU5HRVJ9bXMgYWZ0ZXIgdGhlIGxhc3Qgc2Nyb2xsLCB1bmxlc3MgdGhlIHBvaW50ZXIgaXMga2VlcGluZyBpdCBvcGVuLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mYW5IaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHQvKiogVGltZXN0YW1wIChtcykgb2YgdGhlIGxhc3Qgc2Nyb2xsL2xlYXZlIHRoYXQgc2hvdWxkIGtlZXAgdGhlIGZhbiB1cDsgdGhlIGxpbmdlciB0aW1lciByZS1jaGVja3MgdGhpcyBpbnN0ZWFkIG9mIGJlaW5nIGNodXJuZWQgZXZlcnkgc2Nyb2xsIGZyYW1lLiAqL1xuXHRwcml2YXRlIF9sYXN0RmFuQWN0aXZpdHlBdCA9IDA7XG5cdC8qKiBXaGVuIHRoZSB1c2VyIHByZWZlcnMgcmVkdWNlZCBtb3Rpb24gdGhlIGZhbiBpcyBkaXNhYmxlZCAobWFya3Mgc3RheSB0aGVpciBjYWxtIHJlc3Qgc2l6ZSkuICovXG5cdHByaXZhdGUgX3JlZHVjZWRNb3Rpb24gPSBmYWxzZTtcblx0LyoqIFRydWUgd2hpbGUga2V5Ym9hcmQgZm9jdXMgaXMgaW5zaWRlIHRoZSByYWlsOiB0aGUgbWFya3Mgc3RheSByZXZlYWxlZCAoYDpmb2N1cy13aXRoaW5gKSBidXQgdGhlIGZpc2hleWUgaXMgc3VwcHJlc3NlZC4gKi9cblx0cHJpdmF0ZSBfZm9jdXNlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3Q6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZFNlbGVjdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb21wdFRpY2s+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJldmlldzogRXZlbnQ8UHJvbXB0VGljaz4gPSB0aGlzLl9vbkRpZFJldmlldy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmlld0ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvbXB0UmV2aWV3RmlsZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZpZXdGaWxlOiBFdmVudDxJUHJvbXB0UmV2aWV3RmlsZUV2ZW50PiA9IHRoaXMuX29uRGlkUmV2aWV3RmlsZS5ldmVudDtcblxuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLl9kb21Ob2RlOyB9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kb21Ob2RlID0gJCgnbmF2LnByb21wdC10aW1lbGluZS1yYWlsLnByb21wdC10aW1lbGluZS1yYWlsLXJ1bGVyJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgncHJvbXB0VGltZWxpbmUucmFpbExhYmVsJywgXCJQcm9tcHQgdGltZWxpbmVcIikpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3Rvb2xiYXInKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1vcmllbnRhdGlvbicsICd2ZXJ0aWNhbCcpO1xuXHRcdHRoaXMuX21hcmtzQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJy5wcm9tcHQtdGltZWxpbmUtcnVsZXItbWFya3MnKSk7XG5cdFx0dGhpcy5fY2FyZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9tcHRUaW1lbGluZUNhcmQodGhpcy5fZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NhcmQub25EaWRSZXZpZXcodGljayA9PiB0aGlzLl9vbkRpZFJldmlldy5maXJlKHRpY2spKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2FyZC5vbkRpZFJldmlld0ZpbGUoZSA9PiB0aGlzLl9vbkRpZFJldmlld0ZpbGUuZmlyZShlKSkpO1xuXG5cdFx0Ly8gVG9vbGJhciBrZXlib2FyZCBtb2RlbDogb25lIFRhYiBzdG9wLCBBcnJvdy9Ib21lL0VuZCBtb3ZlIGJldHdlZW4gbWFya3MuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX21hcmtzQ29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4gdGhpcy5fb25NYXJrc0tleURvd24oZSkpKTtcblxuXHRcdC8vIEhvdmVyaW5nIGFueXdoZXJlIGFsb25nIHRoZSBtYXJrcyBjb2x1bW4gYmxvb21zIHRoZSBmaXNoZXllIFwiZmFuXCIgYW5kIGxldHMgaXQgRk9MTE9XIHRoZVxuXHRcdC8vIGN1cnNvciAoYSBtYWNPUy1kb2NrIGZlZWwpLiBUaGUgbGFuZSdzIHRvcCBlZGdlIGlzIGNhY2hlZCAocmVmcmVzaGVkIG9uIHJlc2l6ZSkgc28gZWFjaFxuXHRcdC8vIGhvdmVyL21vdmUgY29udmVydHMgdGhlIHBvaW50ZXIgWSB0byBsYW5lLWxvY2FsIHNwYWNlIHdpdGhvdXQgYSBwZXItZXZlbnRcblx0XHQvLyBnZXRCb3VuZGluZ0NsaWVudFJlY3QgKGEgZm9yY2VkIHJlZmxvdyB0aGF0IHdvdWxkIHN0dXR0ZXIgd2hpbGUgdGhlIHRyYW5zY3JpcHQncyBzdHlsZXMgYXJlXG5cdFx0Ly8gZGlydHkgZHVyaW5nIHNjcm9sbCkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX21hcmtzQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfRU5URVIsIGUgPT4ge1xuXHRcdFx0dGhpcy5fbGFuZVRvcCA9IHRoaXMuX2xhbmVUb3BOb3coKTtcblx0XHRcdHRoaXMuX2hvdmVyaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2ZhbkhpZGUuY2xlYXIoKTsgLy8gaG92ZXJpbmcga2VlcHMgdGhlIGZhbiBvcGVuIFx1MjAxNCBubyBsaW5nZXIgY291bnRkb3duXG5cdFx0XHR0aGlzLl9lbmdhZ2UoZS5jbGllbnRZIC0gdGhpcy5fbGFuZVRvcCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9tYXJrc0NvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX01PVkUsIGUgPT4ge1xuXHRcdFx0dGhpcy5faG92ZXJpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZW5nYWdlKGUuY2xpZW50WSAtIHRoaXMuX2xhbmVUb3ApO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fbWFya3NDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5faG92ZXJpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlRmFuSGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRoZSBmYW4gaXMgYSBwb2ludGVyLW9ubHkgZmxvdXJpc2gsIHNvIGl0IG11c3QgcmVzcGVjdCByZWR1Y2VkLW1vdGlvbi4gUmVhZCBpdCBub3cgYW5kXG5cdFx0Ly8gdHJhY2sgY2hhbmdlczsga2V5Ym9hcmQgdXNlcnMgYWx3YXlzIGdldCB0aGUgY2FsbSwgc3RhdGljIG1hcmtzICsgY2FyZCArIG5hdmlnYXRpb24uXG5cdFx0Y29uc3Qgd2luID0gZ2V0V2luZG93KHRoaXMuX2RvbU5vZGUpO1xuXHRcdGNvbnN0IHJlZHVjZWRNb3Rpb25RdWVyeSA9IHdpbi5tYXRjaE1lZGlhPy4oJyhwcmVmZXJzLXJlZHVjZWQtbW90aW9uOiByZWR1Y2UpJyk7XG5cdFx0aWYgKHJlZHVjZWRNb3Rpb25RdWVyeSkge1xuXHRcdFx0dGhpcy5fcmVkdWNlZE1vdGlvbiA9IHJlZHVjZWRNb3Rpb25RdWVyeS5tYXRjaGVzO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJlZHVjZWRNb3Rpb25RdWVyeSwgJ2NoYW5nZScsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fcmVkdWNlZE1vdGlvbiA9IHJlZHVjZWRNb3Rpb25RdWVyeS5tYXRjaGVzO1xuXHRcdFx0XHR0aGlzLl9hcHBseUZhbigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIEtleWJvYXJkIGZvY3VzIHJldmVhbHMgYSBjYWxtIGRvY2s6IHRoZSBtYXJrcyBzdGF5IHVwIChgOmZvY3VzLXdpdGhpbmAgaW4gQ1NTKSBidXQgdGhlIGZpc2hleWVcblx0XHQvLyBpcyBzdXBwcmVzc2VkLCBzbyB0YWJiaW5nIHRocm91Z2ggbmV2ZXIgbGVhdmVzIHRoZSBwaWxscyBtYWduaWZpZWQgZnJvbSBhbiBlYXJsaWVyIHNjcm9sbC5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgRXZlbnRUeXBlLkZPQ1VTX0lOLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9mb2N1c2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2NvbGxhcHNlRmFuKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCBFdmVudFR5cGUuRk9DVVNfT1VULCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2RvbU5vZGUuY29udGFpbnMoZ2V0V2luZG93KHRoaXMuX2RvbU5vZGUpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzZWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fY2FyZC5zY2hlZHVsZUhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRzZXRGaWxlc1Byb3ZpZGVyKHByb3ZpZGVyOiAodGljazogUHJvbXB0VGljaykgPT4gcmVhZG9ubHkgUHJvbXB0RmlsZURpZmZbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NhcmQuc2V0RmlsZXNQcm92aWRlcihwcm92aWRlcik7XG5cdH1cblxuXHRzZXRUaWNrcyh0aWNrczogcmVhZG9ubHkgUHJvbXB0VGlja1tdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2FtZVN0cnVjdHVyZSA9IHRpY2tzLmxlbmd0aCA9PT0gdGhpcy5fbWFya3MubGVuZ3RoXG5cdFx0XHQmJiB0aWNrcy5ldmVyeSgodCwgaSkgPT4gdGhpcy5fbWFya3NbaV0/LnRpY2sucmVxdWVzdElkID09PSB0LnJlcXVlc3RJZCk7XG5cdFx0aWYgKHNhbWVTdHJ1Y3R1cmUpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGlja3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyTWFyayh0aGlzLl9tYXJrc1tpXSwgdGlja3NbaV0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlQWN0aXZlQ2xhc3NlcygpO1xuXHRcdFx0dGhpcy5fcmVsYXlvdXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9tYXJrRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9tYXJrcy5sZW5ndGggPSAwO1xuXHRcdGNsZWFyTm9kZSh0aGlzLl9tYXJrc0NvbnRhaW5lcik7XG5cdFx0dGhpcy5fY2FyZC5oaWRlKCk7XG5cdFx0Ly8gTmV3IGJ1dHRvbnMgc3RhcnQgYXQgdG9wOjA7IGRpc2FibGUgdGhlIGdsaWRlIHNvIHRoZXkgZG9uJ3QgYW5pbWF0ZSBmcm9tXG5cdFx0Ly8gdGhlIHRvcCBpbnRvIHBsYWNlLCB0aGVuIHJlLWVuYWJsZSBpdCBhZnRlciB0aGlzIGxheW91dCBzbyBsYXRlciBkcmlmdCBnbGlkZXMuXG5cdFx0dGhpcy5fbWFya3NDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZ2xpZGUnKTtcblx0XHR0aGlzLl9nbGlkZUVuYWJsZXIuY2xlYXIoKTtcblxuXHRcdGZvciAoY29uc3QgdGljayBvZiB0aWNrcykge1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gYXBwZW5kKHRoaXMuX21hcmtzQ29udGFpbmVyLCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLnByb21wdC10aW1lbGluZS1ydWxlci1tYXJrJykpO1xuXHRcdFx0YnV0dG9uLnRhYkluZGV4ID0gLTE7XG5cdFx0XHRjb25zdCBiYXIgPSBhcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnByb21wdC10aW1lbGluZS1ydWxlci1iYXInKSk7XG5cdFx0XHRjb25zdCBlbnRyeTogSU1hcmtFbnRyeSA9IHsgdGljaywgYnV0dG9uLCBiYXIgfTtcblx0XHRcdHRoaXMuX3JlbmRlck1hcmsoZW50cnksIHRpY2spO1xuXHRcdFx0Y29uc3QgcmVxdWVzdElkID0gdGljay5yZXF1ZXN0SWQ7XG5cdFx0XHR0aGlzLl9tYXJrRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5fb25EaWRTZWxlY3QuZmlyZShyZXF1ZXN0SWQpKSk7XG5cdFx0XHR0aGlzLl9tYXJrRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4gdGhpcy5fc2hvd0NhcmQoZW50cnkpKSk7XG5cdFx0XHR0aGlzLl9tYXJrRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5GT0NVUywgKCkgPT4geyB0aGlzLl9zaG93Q2FyZChlbnRyeSk7IHRoaXMuX3VwZGF0ZVRhYlN0b3BzKHRoaXMuX21hcmtzLmluZGV4T2YoZW50cnkpKTsgfSkpO1xuXHRcdFx0dGhpcy5fbWFya0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHRoaXMuX2NhcmQuc2NoZWR1bGVIaWRlKCkpKTtcblx0XHRcdHRoaXMuX21hcmtzLnB1c2goZW50cnkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Vuc3VyZVJlc2l6ZU9ic2VydmVyKCk7XG5cdFx0Ly8gTWFrZSB0aGUgYWN0aXZlIG1hcmsgKGVsc2UgdGhlIGZpcnN0KSB0aGUgc2luZ2xlIFRhYiBzdG9wIGludG8gdGhlIHRvb2xiYXIuXG5cdFx0Y29uc3QgYWN0aXZlSW5kZXggPSB0aGlzLl9tYXJrcy5maW5kSW5kZXgobSA9PiBtLnRpY2sucmVxdWVzdElkID09PSB0aGlzLl9hY3RpdmVSZXF1ZXN0SWQpO1xuXHRcdHRoaXMuX3VwZGF0ZVRhYlN0b3BzKGFjdGl2ZUluZGV4ID49IDAgPyBhY3RpdmVJbmRleCA6IDApO1xuXHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTtcblx0XHR0aGlzLl9yZWxheW91dCgpO1xuXHRcdC8vIE1hcmtzIGFyZSBub3cgcG9zaXRpb25lZDsgZW5hYmxlIHRoZSBnbGlkZSBmb3Igc3Vic2VxdWVudCAoZHJpZnQpIHJlbGF5b3V0cy5cblx0XHR0aGlzLl9nbGlkZUVuYWJsZXIudmFsdWUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLl9kb21Ob2RlKSwgKCkgPT4gdGhpcy5fbWFya3NDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZ2xpZGUnKSk7XG5cdH1cblxuXHQvKiogUm92aW5nIHRhYmluZGV4OiBleGFjdGx5IG9uZSBtYXJrIGlzIHRhYmJhYmxlIHNvIHRoZSB0b29sYmFyIGlzIGEgc2luZ2xlIFRhYiBzdG9wLiAqL1xuXHRwcml2YXRlIF91cGRhdGVUYWJTdG9wcyhmb2N1c0luZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX21hcmtzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9tYXJrc1tpXS5idXR0b24udGFiSW5kZXggPSBpID09PSBmb2N1c0luZGV4ID8gMCA6IC0xO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uTWFya3NLZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbWFya3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSB0aGlzLl9tYXJrcy5maW5kSW5kZXgobSA9PiBtLmJ1dHRvbiA9PT0gZ2V0V2luZG93KHRoaXMuX2RvbU5vZGUpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xuXHRcdGxldCBuZXh0SW5kZXg6IG51bWJlcjtcblx0XHRzd2l0Y2ggKGV2ZW50LmtleUNvZGUpIHtcblx0XHRcdGNhc2UgS2V5Q29kZS5Eb3duQXJyb3c6IG5leHRJbmRleCA9IE1hdGgubWluKHRoaXMuX21hcmtzLmxlbmd0aCAtIDEsIGN1cnJlbnRJbmRleCArIDEpOyBicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5VcEFycm93OiBuZXh0SW5kZXggPSBNYXRoLm1heCgwLCBjdXJyZW50SW5kZXggLSAxKTsgYnJlYWs7XG5cdFx0XHRjYXNlIEtleUNvZGUuSG9tZTogbmV4dEluZGV4ID0gMDsgYnJlYWs7XG5cdFx0XHRjYXNlIEtleUNvZGUuRW5kOiBuZXh0SW5kZXggPSB0aGlzLl9tYXJrcy5sZW5ndGggLSAxOyBicmVhaztcblx0XHRcdGRlZmF1bHQ6IHJldHVybjtcblx0XHR9XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR0aGlzLl91cGRhdGVUYWJTdG9wcyhuZXh0SW5kZXgpO1xuXHRcdHRoaXMuX21hcmtzW25leHRJbmRleF0/LmJ1dHRvbi5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTWFyayhlbnRyeTogSU1hcmtFbnRyeSwgdGljazogUHJvbXB0VGljayk6IHZvaWQge1xuXHRcdGVudHJ5LnRpY2sgPSB0aWNrO1xuXHRcdGVudHJ5LmJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aWNrLmFyaWFMYWJlbCk7XG5cdFx0Ly8gVHdvLXRvbmUgYmFyOiBhIGdyZWVuIGFkZGVkIHNlZ21lbnQgYW5kIGEgcmVkIHJlbW92ZWQgc2VnbWVudCwgc2l6ZWQgYnlcblx0XHQvLyB0aGUgdHVybidzIGRpZmYgc3BsaXQuIEdyYXkgd2hlbiB0aGUgdHVybiBtYWRlIG5vIGVkaXRzLlxuXHRcdGNsZWFyTm9kZShlbnRyeS5iYXIpO1xuXHRcdGNvbnN0IHN0YXQgPSB0aWNrLnN0YXQ7XG5cdFx0Y29uc3QgZWRpdGVkID0gISFzdGF0ICYmIHN0YXQuYWRkZWQgKyBzdGF0LnJlbW92ZWQgPiAwO1xuXHRcdGVudHJ5LmJhci5jbGFzc0xpc3QudG9nZ2xlKCdlZGl0ZWQnLCBlZGl0ZWQpO1xuXHRcdGlmIChlZGl0ZWQpIHtcblx0XHRcdC8vIE9ubHkgYXBwZW5kIHRoZSBzaWRlcyB0aGF0IGV4aXN0IHNvIGEgcHVyZS1hZGQgdHVybiBpcyBmdWxseSBncmVlbiBhbmQgYVxuXHRcdFx0Ly8gcHVyZS1kZWxldGUgdHVybiBmdWxseSByZWQ7IHRoZSBtaW4td2lkdGggZmxvb3Iga2VlcHMgYSBsb3BzaWRlZCBzcGxpdCB2aXNpYmxlLlxuXHRcdFx0aWYgKHN0YXQhLmFkZGVkID4gMCkge1xuXHRcdFx0XHRhcHBlbmQoZW50cnkuYmFyLCAkKCdzcGFuLnNlZy1hZGQnKSkuc3R5bGUuZmxleEdyb3cgPSBTdHJpbmcoc3RhdCEuYWRkZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXQhLnJlbW92ZWQgPiAwKSB7XG5cdFx0XHRcdGFwcGVuZChlbnRyeS5iYXIsICQoJ3NwYW4uc2VnLWRlbCcpKS5zdHlsZS5mbGV4R3JvdyA9IFN0cmluZyhzdGF0IS5yZW1vdmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkcyBhIGhhcmQvZmFzdCB3aGVlbCBmbGljay4gVGhlIGZhbiBkb2VzIE5PVCBibG9vbSBoZXJlIFx1MjAxNCBpdCBibG9vbXMgb25seSBpZiB0aGUgdHJhbnNjcmlwdFxuXHQgKiBhY3R1YWxseSBzY3JvbGxzIHNob3J0bHkgYWZ0ZXIgKHNlZSB7QGxpbmsgc2V0U2Nyb2xsTGF5b3V0fSkuIFRoaXMgd2F5IGEgaGFyZCBmbGljayBhZ2FpbnN0IHRoZVxuXHQgKiB0b3AvYm90dG9tIHNjcm9sbCBsaW1pdCwgd2hpY2ggbW92ZXMgbm90aGluZywgbmV2ZXIgcmV2ZWFscyB0aGUgZmFuLlxuXHQgKi9cblx0bm90aWZ5SGFyZFdoZWVsKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hhcmRXaGVlbEF0ID0gRGF0ZS5ub3coKTtcblx0fVxuXG5cdC8qKiBMYW5lLWxvY2FsIFkgb2YgdGhlIGFjdGl2ZSBtYXJrICh0aGUgcHJvbXB0IGN1cnJlbnRseSBzY3JvbGxlZCB0byksIG9yIHRoZSBuZWFyZXN0IHZpc2libGUgb25lLiAqL1xuXHRwcml2YXRlIF9hY3RpdmVDZW50ZXIoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLl9tYXJrcy5maW5kKG0gPT4gbS50aWNrLnJlcXVlc3RJZCA9PT0gdGhpcy5fYWN0aXZlUmVxdWVzdElkICYmIG0uYmFzZUNlbnRlciAhPT0gdW5kZWZpbmVkKTtcblx0XHRpZiAoYWN0aXZlPy5iYXNlQ2VudGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBhY3RpdmUuYmFzZUNlbnRlcjtcblx0XHR9XG5cdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBsYXN0IGxhaWQtb3V0IG1hcmsgKG9yIHRoZSBmaXJzdCkgc28gYSBzY3JvbGwgc3RpbGwgYmxvb21zIHNvbWV3aGVyZSByZWFsLlxuXHRcdGNvbnN0IGxhaWRPdXQgPSB0aGlzLl9tYXJrcy5maWx0ZXIobSA9PiBtLmJhc2VDZW50ZXIgIT09IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGxhaWRPdXQuYXQoLTEpPy5iYXNlQ2VudGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIExhbmUtbG9jYWwgWSBmb3IgdGhlIGZpc2hleWUgZm9jdXMgd2hpbGUgU0NST0xMSU5HOiBnbGlkZXMgY29udGludW91c2x5IHdpdGggdGhlIHZpZXdwb3J0IGJ5XG5cdCAqIGludGVycG9sYXRpbmcgYmV0d2VlbiBwaWxscy4gRWFjaCBwcm9tcHQgaGFzIGEgY29udGVudCBwb3NpdGlvbiAoYGxheW91dC5tYXJrc1tdLnRvcGApIGFuZCBhIGRvY2tcblx0ICogcG9zaXRpb24gKGBiYXNlQ2VudGVyYCk7IHdlIGZpbmQgd2hlcmUgdGhlIHZpZXdwb3J0IChgc2Nyb2xsVG9wYCkgc2l0cyBiZXR3ZWVuIHR3byBwcm9tcHRzIGluXG5cdCAqIGNvbnRlbnQgc3BhY2UgYW5kIHBsYWNlIHRoZSBmb2N1cyBhdCB0aGUgbWF0Y2hpbmcgZnJhY3Rpb24gYmV0d2VlbiB0aGVpciBkb2NrIHBvc2l0aW9ucy4gU28gdGhlXG5cdCAqIGZpc2hleWUgdHJhdmVscyBzbW9vdGhseSB0aHJvdWdoIHRoZSBwaWxscyBhcyB5b3Ugc2Nyb2xsIChyYXRoZXIgdGhhbiBzbmFwcGluZyBhdCBwcm9tcHRcblx0ICogYm91bmRhcmllcyksIHdoaWxlIHN0aWxsIHRyYWNraW5nIHRoZSByZWFsIHNjcm9sbCBwb3NpdGlvbi4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiBub3QgbGFpZCBvdXQuXG5cdCAqL1xuXHRwcml2YXRlIF9zY3JvbGxGYW5DZW50ZXIoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLl9sYXlvdXQ7XG5cdFx0aWYgKCFsYXlvdXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRvcEJ5SWQgPSBuZXcgTWFwKGxheW91dC5tYXJrcy5tYXAobSA9PiBbbS5yZXF1ZXN0SWQsIG0udG9wXSkpO1xuXHRcdGNvbnN0IHB0czogeyBjb250ZW50VG9wOiBudW1iZXI7IGNlbnRlcjogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbWFya3MpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnRUb3AgPSB0b3BCeUlkLmdldChlbnRyeS50aWNrLnJlcXVlc3RJZCk7XG5cdFx0XHRpZiAoY29udGVudFRvcCAhPT0gdW5kZWZpbmVkICYmIGVudHJ5LmJhc2VDZW50ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwdHMucHVzaCh7IGNvbnRlbnRUb3AsIGNlbnRlcjogZW50cnkuYmFzZUNlbnRlciB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHB0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHB0cy5zb3J0KChhLCBiKSA9PiBhLmNvbnRlbnRUb3AgLSBiLmNvbnRlbnRUb3ApO1xuXHRcdC8vIGBjb250ZW50VG9wYHMgYXJlIGluIHRoZSBhZGFwdGl2ZSBFU1RJTUFURUQgc3BhY2UgKHN1bW1pbmcgdG8gYGxheW91dC50b3RhbGApLCBidXRcblx0XHQvLyBgbGF5b3V0LnNjcm9sbFRvcGAvYHNjcm9sbEhlaWdodGAgYXJlIHRoZSB0cmFuc2NyaXB0J3MgUkVBTCBzY3JvbGwgc3BhY2UuIFVuZGVyIHZpcnR1YWxpemF0aW9uXG5cdFx0Ly8gdGhvc2Ugc3BhY2VzIGRpZmZlciwgc28gc2NhbGUgdGhlIHNjcm9sbCBwb3NpdGlvbiBpbnRvIHRoZSBlc3RpbWF0ZWQgc3BhY2UgYmVmb3JlIGNvbXBhcmluZy5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSBsYXlvdXQuc2Nyb2xsSGVpZ2h0ID4gMFxuXHRcdFx0PyAobGF5b3V0LnNjcm9sbFRvcCAvIGxheW91dC5zY3JvbGxIZWlnaHQpICogbGF5b3V0LnRvdGFsXG5cdFx0XHQ6IGxheW91dC5zY3JvbGxUb3A7XG5cdFx0aWYgKHNjcm9sbFRvcCA8PSBwdHNbMF0uY29udGVudFRvcCkge1xuXHRcdFx0cmV0dXJuIHB0c1swXS5jZW50ZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3QgPSBwdHNbcHRzLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChzY3JvbGxUb3AgPj0gbGFzdC5jb250ZW50VG9wKSB7XG5cdFx0XHRyZXR1cm4gbGFzdC5jZW50ZXI7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcHRzLmxlbmd0aCAtIDE7IGkrKykge1xuXHRcdFx0Y29uc3QgYSA9IHB0c1tpXTtcblx0XHRcdGNvbnN0IGIgPSBwdHNbaSArIDFdO1xuXHRcdFx0aWYgKHNjcm9sbFRvcCA+PSBhLmNvbnRlbnRUb3AgJiYgc2Nyb2xsVG9wIDw9IGIuY29udGVudFRvcCkge1xuXHRcdFx0XHRjb25zdCBzcGFuID0gYi5jb250ZW50VG9wIC0gYS5jb250ZW50VG9wO1xuXHRcdFx0XHRjb25zdCBmcmFjID0gc3BhbiA+IDAgPyAoc2Nyb2xsVG9wIC0gYS5jb250ZW50VG9wKSAvIHNwYW4gOiAwO1xuXHRcdFx0XHRyZXR1cm4gYS5jZW50ZXIgKyBmcmFjICogKGIuY2VudGVyIC0gYS5jZW50ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGFzdC5jZW50ZXI7XG5cdH1cblxuXHRzZXRBY3RpdmUocmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVSZXF1ZXN0SWQgPSByZXF1ZXN0SWQ7XG5cdFx0dGhpcy5fdXBkYXRlQWN0aXZlQ2xhc3NlcygpO1xuXHRcdC8vIE5vdGU6IHRoZSBzY3JvbGwtZHJpdmVuIGZhbiBmb2xsb3cgaXMgaGFuZGxlZCBjb250aW51b3VzbHkgaW4gYF9yZWxheW91dGAgKGl0IGdsaWRlcyB3aXRoIHRoZVxuXHRcdC8vIHZpZXdwb3J0KSwgc28gd2UgZG8gbm90IHJlLWNlbnRyZSBoZXJlIFx1MjAxNCB0aGF0IHdvdWxkIHNuYXAgdGhlIGZhbiBhdCBwcm9tcHQgYm91bmRhcmllcy5cblx0fVxuXG5cdGZvY3VzVGljayhyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX21hcmtzLmZpbmQobSA9PiBtLnRpY2sucmVxdWVzdElkID09PSByZXF1ZXN0SWQgfHwgbS50aWNrLmFsbFJlcXVlc3RJZHMuaW5jbHVkZXMocmVxdWVzdElkKSk/LmJ1dHRvbi5mb2N1cygpO1xuXHR9XG5cblx0c2V0SG9zdFdpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAod2lkdGggPiAwICYmIHdpZHRoICE9PSB0aGlzLl9ob3N0V2lkdGgpIHtcblx0XHRcdHRoaXMuX2hvc3RXaWR0aCA9IHdpZHRoO1xuXHRcdFx0dGhpcy5fcmVsYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRzZXRTY3JvbGxMYXlvdXQobGF5b3V0OiBJUHJvbXB0U2Nyb2xsTGF5b3V0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldlNjcm9sbFRvcCA9IHRoaXMuX2xhc3RTY3JvbGxUb3A7XG5cdFx0dGhpcy5fbGF5b3V0ID0gbGF5b3V0O1xuXHRcdGlmIChsYXlvdXQpIHtcblx0XHRcdHRoaXMuX2xhc3RTY3JvbGxUb3AgPSBsYXlvdXQuc2Nyb2xsVG9wO1xuXHRcdFx0Ly8gT25seSByZWFjdCB0byBhIFJFQUwgc2Nyb2xsIG1vdmVtZW50LiBBIHdoZWVsIGZsaWNrIGFnYWluc3QgdGhlIHRvcC9ib3R0b20gbGltaXQgZmlyZXNcblx0XHRcdC8vIHdoZWVsIGV2ZW50cyAoc28gbm90aWZ5SGFyZFdoZWVsIHJ1bnMpIGJ1dCBkb2Vzbid0IGNoYW5nZSBzY3JvbGxUb3AsIHNvIGl0IG5ldmVyIHJldmVhbHNcblx0XHRcdC8vIHRoZSBmYW4gaGVyZS4gUHJvZ3JhbW1hdGljIG51ZGdlcyBkdXJpbmcgdmlydHVhbGl6YXRpb24gcmUtbWVhc3VyZSBsYWNrIGEgcmVjZW50IGhhcmRcblx0XHRcdC8vIHdoZWVsLCBzbyB0aGV5IGRvbid0IHJldmVhbCBpdCBlaXRoZXIuXG5cdFx0XHRpZiAocHJldlNjcm9sbFRvcCAhPT0gdW5kZWZpbmVkICYmIE1hdGguYWJzKGxheW91dC5zY3JvbGxUb3AgLSBwcmV2U2Nyb2xsVG9wKSA+IDAuNSkge1xuXHRcdFx0XHR0aGlzLl9vblNjcm9sbGVkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFNjcm9sbCBmaXJlcyBtYW55IGV2ZW50cyBwZXIgZnJhbWU7IGNvYWxlc2NlIHNvIHdlIGxheSBvdXQgKGFuZCB0b3VjaCB0aGUgRE9NKSBvbmNlLlxuXHRcdHRoaXMuX3NjaGVkdWxlUmVsYXlvdXQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGEgcmVhbCB0cmFuc2NyaXB0IHNjcm9sbDogYmxvb21zIHRoZSBmYW4gaWYgaXQgZm9sbG93ZWQgYSBkZWxpYmVyYXRlIGhhcmQgZmxpY2ssIGFuZFxuXHQgKiBrZWVwcyBpdCBhbGl2ZSAocmUtYXJtcyB0aGUgbGluZ2VyKSB3aGlsZSB5b3Uga2VlcCBzY3JvbGxpbmcuIFBvaW50ZXIgaG92ZXIgb3ducyB0aGUgZmFuIG9uIGl0c1xuXHQgKiBvd24sIHNvIHRoaXMgZGVmZXJzIHRvIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfb25TY3JvbGxlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faG92ZXJpbmcgfHwgdGhpcy5fZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2VuZ2FnZWQnKSkge1xuXHRcdFx0Ly8gQWxyZWFkeSBvcGVuOiBrZWVwIGl0IHVwIHdoaWxlIGFjdGl2ZWx5IHNjcm9sbGluZyAodGhlIGdsaWRlIGhhcHBlbnMgaW4gYF9yZWxheW91dGApLlxuXHRcdFx0dGhpcy5fc2NoZWR1bGVGYW5IaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIE5vdCBvcGVuIHlldDogb25seSBhIGRlbGliZXJhdGUgaGFyZCBmbGljayB0aGF0IGFjdHVhbGx5IG1vdmVkIHRoZSB0cmFuc2NyaXB0IGJsb29tcyBpdC5cblx0XHRpZiAoRGF0ZS5ub3coKSAtIHRoaXMuX2hhcmRXaGVlbEF0IDw9IEhBUkRfV0hFRUxfUkVWRUFMX1dJTkRPVykge1xuXHRcdFx0Y29uc3QgY2VudGVyID0gdGhpcy5fc2Nyb2xsRmFuQ2VudGVyKCkgPz8gdGhpcy5fYWN0aXZlQ2VudGVyKCk7XG5cdFx0XHRpZiAoY2VudGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZW5nYWdlKGNlbnRlcik7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlRmFuSGlkZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBDb2FsZXNjZXMgcmVsYXlvdXQgdG8gYXQgbW9zdCBvbmNlIHBlciBhbmltYXRpb24gZnJhbWUuICovXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVsYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbGF5b3V0U2NoZWR1bGVkLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbGF5b3V0U2NoZWR1bGVkLnZhbHVlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5fZG9tTm9kZSksICgpID0+IHtcblx0XHRcdHRoaXMuX3JlbGF5b3V0U2NoZWR1bGVkLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9yZWxheW91dCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFBsYWNlcyBlYWNoIG1hcmsgYXQgaXRzIHByb3BvcnRpb25hbCBzY3JvbGwgcG9zaXRpb24sIHNwYWNlZCBzbyBoaXQgdGFyZ2V0cyBuZXZlciBvdmVybGFwLiAqL1xuXHRwcml2YXRlIF9yZWxheW91dCgpOiB2b2lkIHtcblx0XHQvLyBVc2UgdGhlIGNhY2hlZCBoZWlnaHQgKHJlZnJlc2hlZCBvbmx5IG9uIHJlc2l6ZSkgdG8gYXZvaWQgYSBmb3JjZWQgcmVmbG93IHBlciBzY3JvbGwuXG5cdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5fcmFpbEhlaWdodCA+IDAgPyB0aGlzLl9yYWlsSGVpZ2h0IDogKHRoaXMuX3JhaWxIZWlnaHQgPSB0aGlzLl9kb21Ob2RlLmNsaWVudEhlaWdodCk7XG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fbGF5b3V0O1xuXHRcdGNvbnN0IG92ZXJmbG93aW5nID0gdGhpcy5faG9zdFdpZHRoIDwgTUlOX0hPU1RfV0lEVEg7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdvdmVyZmxvd2luZycsIG92ZXJmbG93aW5nKTtcblx0XHRpZiAob3ZlcmZsb3dpbmcgfHwgaGVpZ2h0IDw9IDAgfHwgIWxheW91dCB8fCBsYXlvdXQudG90YWwgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY2FsZSA9IGhlaWdodCAvIGxheW91dC50b3RhbDtcblx0XHRjb25zdCB0b3BCeUlkID0gbmV3IE1hcChsYXlvdXQubWFya3MubWFwKG0gPT4gW20ucmVxdWVzdElkLCBtLnRvcF0pKTtcblxuXHRcdC8vIENvbGxlY3QgdmlzaWJsZSBtYXJrcyAoaW4gb3JkZXIpIHdpdGggdGhlaXIgZGVzaXJlZCBwcm9wb3J0aW9uYWwgY2VudHJlLlxuXHRcdGNvbnN0IHZpc2libGU6IHsgZW50cnk6IElNYXJrRW50cnk7IGNlbnRlcjogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbWFya3MpIHtcblx0XHRcdGNvbnN0IHRvcCA9IHRvcEJ5SWQuZ2V0KGVudHJ5LnRpY2sucmVxdWVzdElkKTtcblx0XHRcdGlmICh0b3AgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRlbnRyeS5idXR0b24uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRcdGVudHJ5Lmxhc3RUb3AgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGVudHJ5LmJhc2VDZW50ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGVudHJ5LmJ1dHRvbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHRcdFx0ZW50cnkuYmFyLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGVudHJ5LmJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRcdHZpc2libGUucHVzaCh7IGVudHJ5LCBjZW50ZXI6IHRvcCAqIHNjYWxlIH0pO1xuXHRcdH1cblxuXHRcdGlmIChQSUxMX0xBWU9VVCA9PT0gJ2V2ZW4nKSB7XG5cdFx0XHQvLyBFdmVubHktc3BhY2VkIGRvY2ssIGNlbnRyZWQgdmVydGljYWxseSBhcyBhIGdyb3VwLiBTdGFibGUgdW5kZXIgdmlydHVhbGl6YXRpb24gKHBpbGxzIGRvXG5cdFx0XHQvLyBub3QgZHJpZnQgYXMgcm93IGhlaWdodHMgcmUtbWVhc3VyZSkgYW5kIHRpZHkgd2hlbiBiaWcgcmVzcG9uc2VzIHdvdWxkIGNsdXN0ZXIgdGhlbS5cblx0XHRcdHRoaXMuX3NwYWNlRXZlbkNlbnRlcnModmlzaWJsZSwgaGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUHJvbXB0cyBjYW4gc2l0IGFyYml0cmFyaWx5IGNsb3NlIGluIGNvbnRlbnQgc3BhY2UgKGEgc2hvcnQgdHVybiwgb3IgYWZ0ZXIgaGVpZ2h0XG5cdFx0XHQvLyByZS1lc3RpbWF0ZXMgc2V0dGxlKSwgd2hpY2ggd291bGQgbGV0IHRoZSA+PTI0cHggaGl0IHRhcmdldHMgb3ZlcmxhcC4gUHVzaCBhZGphY2VudFxuXHRcdFx0Ly8gbWFya3MgYXBhcnQgdG8ga2VlcCBhIGZ1bGwgdGFyZ2V0J3Mgc3BhY2luZyB3aGlsZSBzdGF5aW5nIGFzIGNsb3NlIHRvIHRoZWlyXG5cdFx0XHQvLyBwcm9wb3J0aW9uYWwgcG9zaXRpb24gYXMgdGhlIHJhaWwgYWxsb3dzLlxuXHRcdFx0c3BhY2VNYXJrQ2VudGVycyh2aXNpYmxlLCBoZWlnaHQsIE1JTl9UQVJHRVQpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgeyBlbnRyeSwgY2VudGVyIH0gb2YgdmlzaWJsZSkge1xuXHRcdFx0ZW50cnkuYmFzZUNlbnRlciA9IGNlbnRlcjtcblx0XHRcdC8vIFRoZSBidXR0b24gaXMgYSA+PTI0cHggaGl0IHRhcmdldCBjZW50ZXJlZCBvbiB0aGUgbWFyaydzIChzcGFjZWQpIHBvc2l0aW9uLlxuXHRcdFx0Y29uc3QgeSA9IGNlbnRlciAtIE1JTl9UQVJHRVQgLyAyO1xuXHRcdFx0Ly8gU2tpcCBzdWItcGl4ZWwgZHJpZnQgc28gZXN0aW1hdGUgbm9pc2UgZG9lc24ndCBqaXR0ZXIgdGhlIG1hcmtzLlxuXHRcdFx0aWYgKGVudHJ5Lmxhc3RUb3AgIT09IHVuZGVmaW5lZCAmJiBNYXRoLmFicyh5IC0gZW50cnkubGFzdFRvcCkgPCBSRUxBWU9VVF9NSU5fREVMVEEpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbnRyeS5sYXN0VG9wID0geTtcblx0XHRcdGVudHJ5LmJ1dHRvbi5zdHlsZS50b3AgPSBgJHt5fXB4YDtcblx0XHR9XG5cblx0XHQvLyBXaGlsZSB0aGUgZmFuIGlzIG9wZW4gYmVjYXVzZSBvZiBzY3JvbGxpbmcgKG5vdCBzdGVlcmVkIGJ5IHRoZSBwb2ludGVyLCBhbmQgbm90IHdoaWxlIGtleWJvYXJkXG5cdFx0Ly8gZm9jdXMgaXMgc2hvd2luZyB0aGUgY2FsbSBkb2NrKSwgZ2xpZGUgaXRzIGZvY3VzIHdpdGggdGhlIHZpZXdwb3J0IHNvIHRoZSBmaXNoZXllIHRyYXZlbHNcblx0XHQvLyBzbW9vdGhseSB0aHJvdWdoIHRoZSBwaWxscyBhcyB5b3Ugc2Nyb2xsLlxuXHRcdGlmICh0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnZW5nYWdlZCcpICYmICF0aGlzLl9ob3ZlcmluZyAmJiAhdGhpcy5fZm9jdXNlZCkge1xuXHRcdFx0Y29uc3Qgc2Nyb2xsQ2VudGVyID0gdGhpcy5fc2Nyb2xsRmFuQ2VudGVyKCk7XG5cdFx0XHRpZiAoc2Nyb2xsQ2VudGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZmFuQ2VudGVyID0gc2Nyb2xsQ2VudGVyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlLWFwcGx5IHRoZSBwb2ludGVyIGZpc2hleWUgYWdhaW5zdCB0aGUgZnJlc2hseSBtZWFzdXJlZCByZXN0IHBvc2l0aW9ucy5cblx0XHR0aGlzLl9hcHBseUZhbigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV2ZW4gKGRvY2spIHBsYWNlbWVudDogc3RhY2tzIHRoZSBwaWxscyBhdCBhIGZpeGVkIHNwYWNpbmcgYW5kIGNlbnRyZXMgdGhlIHdob2xlIGdyb3VwIGluIHRoZVxuXHQgKiBsYW5lLiBJZiB0aGUgZ3JvdXAgaXMgdGFsbGVyIHRoYW4gdGhlIGxhbmUgaXQgZGlzdHJpYnV0ZXMgYWNyb3NzIHRoZSBmdWxsIGhlaWdodCBpbnN0ZWFkLCBzbyBhXG5cdCAqIGxvbmcgc2Vzc2lvbiBzdGlsbCBmaXRzLiBNdXRhdGVzIGVhY2ggaXRlbSdzIGBjZW50ZXJgIGluIHBsYWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3BhY2VFdmVuQ2VudGVycyh2aXNpYmxlOiB7IGVudHJ5OiBJTWFya0VudHJ5OyBjZW50ZXI6IG51bWJlciB9W10sIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgbiA9IHZpc2libGUubGVuZ3RoO1xuXHRcdGlmIChuID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGdyb3VwSGVpZ2h0ID0gbiAqIEVWRU5fUElMTF9TUEFDSU5HO1xuXHRcdGxldCBzdGFydDogbnVtYmVyO1xuXHRcdGxldCBzdGVwOiBudW1iZXI7XG5cdFx0aWYgKGdyb3VwSGVpZ2h0IDw9IGhlaWdodCkge1xuXHRcdFx0Ly8gQ29tcGFjdCBncm91cCBjZW50cmVkIHZlcnRpY2FsbHkuXG5cdFx0XHRzdGVwID0gRVZFTl9QSUxMX1NQQUNJTkc7XG5cdFx0XHRzdGFydCA9IChoZWlnaHQgLSBncm91cEhlaWdodCkgLyAyICsgc3RlcCAvIDI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRvbyBtYW55IHRvIGZpdCBhdCB0aGUgaWRlYWwgc3BhY2luZzogc3ByZWFkIGV2ZW5seSBhY3Jvc3MgdGhlIGZ1bGwgaGVpZ2h0LlxuXHRcdFx0c3RlcCA9IChoZWlnaHQgLSBFVkVOX1BJTExfU1BBQ0lORykgLyAobiAtIDEpO1xuXHRcdFx0c3RhcnQgPSBFVkVOX1BJTExfU1BBQ0lORyAvIDI7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHR2aXNpYmxlW2ldLmNlbnRlciA9IHN0YXJ0ICsgaSAqIHN0ZXA7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZpc2hleWUgXCJmYW5cIjogbWFnbmlmeSB0aGUgbWFya3MgbmVhciB7QGxpbmsgX2ZhbkNlbnRlcn0gYW5kIGdlbnRseSBzcHJlYWQgdGhlaXIgbmVpZ2hib3Vyc1xuXHQgKiBhcGFydCwgc28gYSBkZW5zZSBjbHVzdGVyIGJlY29tZXMgZWFzeSB0byByZWFkIGFuZCBjbGljay4gSXQgaXMgYSBwb2ludGVyLW9ubHkgZmxvdXJpc2ggbGF5ZXJlZFxuXHQgKiBvbiB0b3Agb2YgdGhlIHByb3BvcnRpb25hbCBsYXlvdXQgXHUyMDE0IHRoZSBtYXJrcycgYHRvcGAgKG93bmVkIGJ5IGBfcmVsYXlvdXRgKSBpcyB1bnRvdWNoZWQ7IHRoZVxuXHQgKiBmYW4gb25seSBhZGRzIGEgQ1NTIGB0cmFuc2Zvcm1gLCBzbyBrZXlib2FyZCBuYXZpZ2F0aW9uIGFuZCB0aGUgYmFzZSBsYXlvdXQgYXJlIHVuYWZmZWN0ZWQuXG5cdCAqIERpc2FibGVkIGVudGlyZWx5IHVuZGVyIHJlZHVjZWQtbW90aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlGYW4oKTogdm9pZCB7XG5cdFx0Y29uc3QgY2VudGVyID0gdGhpcy5fZmFuQ2VudGVyO1xuXHRcdGNvbnN0IGZhbm5pbmcgPSBjZW50ZXIgIT09IHVuZGVmaW5lZCAmJiAhdGhpcy5fcmVkdWNlZE1vdGlvbjtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX21hcmtzKSB7XG5cdFx0XHRpZiAoZW50cnkuYmFzZUNlbnRlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFmYW5uaW5nKSB7XG5cdFx0XHRcdGVudHJ5LmJ1dHRvbi5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHRcdFx0ZW50cnkuYmFyLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGQgPSBlbnRyeS5iYXNlQ2VudGVyIC0gY2VudGVyITtcblx0XHRcdGNvbnN0IG0gPSBNYXRoLmV4cCgtKGQgKiBkKSAvICgyICogRkFOX1NJR01BICogRkFOX1NJR01BKSk7XG5cdFx0XHQvLyBTcHJlYWQgbmVpZ2hib3VycyBhd2F5IGZyb20gdGhlIGZvY3VzIChkb2NrIGZlZWwpIGFuZCBncm93IHRoZSBmb2N1c2VkIGJhciB0aGUgbW9zdC5cblx0XHRcdGVudHJ5LmJ1dHRvbi5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke0ZBTl9TUFJFQUQgKiBNYXRoLnRhbmgoZCAvIEZBTl9TSUdNQSl9cHgpYDtcblx0XHRcdGVudHJ5LmJhci5zdHlsZS50cmFuc2Zvcm0gPSBgc2NhbGUoJHsxICsgbSAqIDAuOX0sICR7MSArIG0gKiAwLjZ9KWA7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW5zIHRoZSBmYW4gYXQge0BsaW5rIGNlbnRlcn0gKGxhbmUtbG9jYWwgWSk6IHJldmVhbHMgdGhlIG1hcmtzICh2aWEgYC5lbmdhZ2VkYCkgYW5kIGFwcGxpZXNcblx0ICogdGhlIGZpc2hleWUuIFJldmVhbCBoYXBwZW5zIGV2ZW4gdW5kZXIgcmVkdWNlZCBtb3Rpb24gKHRoZSBtYXJrcyBqdXN0IGRvbid0IG1hZ25pZnkpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5nYWdlKGNlbnRlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdlbmdhZ2VkJyk7XG5cdFx0dGhpcy5fZmFuQ2VudGVyID0gY2VudGVyO1xuXHRcdHRoaXMuX2FwcGx5RmFuKCk7XG5cdH1cblxuXHQvKiogQ29sbGFwc2VzIHRoZSBmYW4gYmFjayB0byB0aGUgcGxhaW4gc2Nyb2xsYmFyIChtYXJrcyBoaWRkZW4sIG5vIGZpc2hleWUpLiAqL1xuXHRwcml2YXRlIF9jb2xsYXBzZUZhbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdlbmdhZ2VkJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdlbmdhZ2VkJyk7XG5cdFx0dGhpcy5fZmFuQ2VudGVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FwcGx5RmFuKCk7XG5cdH1cblxuXHQvKipcblx0ICogKFJlKXN0YXJ0cyB0aGUgbGluZ2VyIGNvdW50ZG93bjoge0BsaW5rIEZBTl9MSU5HRVJ9bXMgYWZ0ZXIgdGhlIGxhc3Qgc2Nyb2xsIHRoZSBmYW4gY29sbGFwc2VzIFx1MjAxNFxuXHQgKiBidXQgb25seSBpZiB0aGUgcG9pbnRlciBpcyBub3Qga2VlcGluZyBpdCBvcGVuLiBDYWxsZWQgb24gZXZlcnkgc2Nyb2xsIGZyYW1lIGFuZCB3aGVuIHRoZSBwb2ludGVyXG5cdCAqIGxlYXZlcywgc28gaXQgYXZvaWRzIGNodXJuaW5nIHRoZSB0aW1lcjogaXQganVzdCBzdGFtcHMgdGhlIGFjdGl2aXR5IHRpbWUgYW5kLCB3aGVuIHRoZSBzaW5nbGVcblx0ICogcnVubmluZyB0aW1lciBmaXJlcywgaXQgcmUtYXJtcyBmb3IgdGhlIHJlbWFpbmluZyB0aW1lIGlmIG1vcmUgc2Nyb2xsaW5nIGhhcHBlbmVkIHNpbmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVGYW5IaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RGYW5BY3Rpdml0eUF0ID0gRGF0ZS5ub3coKTtcblx0XHRpZiAoIXRoaXMuX2ZhbkhpZGUudmFsdWUpIHtcblx0XHRcdHRoaXMuX2FybUZhbkhpZGUoRkFOX0xJTkdFUik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXJtRmFuSGlkZShkZWxheTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZmFuSGlkZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2ZhbkhpZGUuY2xlYXIoKTtcblx0XHRcdGlmICh0aGlzLl9ob3ZlcmluZykge1xuXHRcdFx0XHRyZXR1cm47IC8vIGhvdmVyaW5nIGtlZXBzIGl0IHVwOyBsZWF2aW5nIHJlLWFybXMgdGhlIGNvdW50ZG93blxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gRkFOX0xJTkdFUiAtIChEYXRlLm5vdygpIC0gdGhpcy5fbGFzdEZhbkFjdGl2aXR5QXQpO1xuXHRcdFx0aWYgKHJlbWFpbmluZyA+IDApIHtcblx0XHRcdFx0dGhpcy5fYXJtRmFuSGlkZShyZW1haW5pbmcpOyAvLyBtb3JlIHNjcm9sbGluZyBoYXBwZW5lZCBzaW5jZSBcdTIwMTQga2VlcCB3YWl0aW5nXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZUZhbigpO1xuXHRcdFx0fVxuXHRcdH0sIGRlbGF5KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZUNsYXNzZXMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9tYXJrcykge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBlbnRyeS50aWNrLnJlcXVlc3RJZCA9PT0gdGhpcy5fYWN0aXZlUmVxdWVzdElkO1xuXHRcdFx0ZW50cnkuYnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcblx0XHRcdGlmIChpc0FjdGl2ZSkge1xuXHRcdFx0XHRlbnRyeS5idXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCAnbG9jYXRpb24nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVudHJ5LmJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBMYW5lLWxvY2FsIFkgKGNsaWVudCBweCkgb2YgdGhlIG1hcmtzIGNvbHVtbiB0b3AsIGZyb20gdGhlIGNhY2hlZCByYWlsIHRvcCAocmVmcmVzaGVkIG9uIHJlc2l6ZSkuIFJlYWRzIGxheW91dCBsYXppbHkgb25seSBpZiB0aGUgY2FjaGUgaXMgbm90IHlldCBwcmltZWQsIHNvIGhvdmVyaW5nIG5ldmVyIGZvcmNlcyBhIHJlZmxvdyBtaWQtc2Nyb2xsLiAqL1xuXHRwcml2YXRlIF9sYW5lVG9wTm93KCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2RvbVRvcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kb21Ub3AgPSB0aGlzLl9kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHR9XG5cdFx0Ly8gVGhlIG1hcmtzIGNvbHVtbiBpcyBpbnNldDowIGF0IHRoZSB0b3AsIHNvIGl0cyBjbGllbnQgdG9wIGVxdWFscyB0aGUgcmFpbCdzLlxuXHRcdHJldHVybiB0aGlzLl9kb21Ub3A7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93Q2FyZChlbnRyeTogSU1hcmtFbnRyeSk6IHZvaWQge1xuXHRcdC8vIFBvc2l0aW9uIHRoZSBjYXJkIGZyb20gdGhlIG1hcmsncyBrbm93biBsYW5lLWxvY2FsIGNlbnRyZSBpbnN0ZWFkIG9mIHJlYWRpbmdcblx0XHQvLyBnZXRCb3VuZGluZ0NsaWVudFJlY3QgKGEgZm9yY2VkIHN5bmNocm9ub3VzIGxheW91dCB0aGF0IHN0dXR0ZXJzIHdoaWxlIHRoZSB0cmFuc2NyaXB0J3Ncblx0XHQvLyBzdHlsZXMgYXJlIGRpcnR5IGR1cmluZyBzY3JvbGwpLiBUaGUgbWFya3MgY29sdW1uIGlzIGluc2V0OjAgYXQgdGhlIHRvcCwgc28gYGJhc2VDZW50ZXJgXG5cdFx0Ly8gaXMgdGhlIFkgcmVsYXRpdmUgdG8gdGhlIHJhaWw7IHRoZSBob3ZlcmVkIG1hcmsgc2l0cyBuZWFyIHRoZSBmYW4gZm9jdXMsIHdoZXJlIGl0c1xuXHRcdC8vIG1hZ25pZmljYXRpb24gdHJhbnNsYXRlIGlzIH4wLCBzbyB0aGlzIG1hdGNoZXMgdGhlIHZpc2libGUgcG9zaXRpb24uIEZhbGxzIGJhY2sgdG8gYVxuXHRcdC8vIG1lYXN1cmVkIHJlY3Qgb25seSBpZiB0aGUgbWFyayBoYXMgbm90IGJlZW4gbGFpZCBvdXQgeWV0LlxuXHRcdGNvbnN0IGNlbnRlclkgPSBlbnRyeS5iYXNlQ2VudGVyXG5cdFx0XHQ/PyAoZW50cnkuYnV0dG9uLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCAtIHRoaXMuX2RvbU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wICsgTUlOX1RBUkdFVCAvIDIpO1xuXHRcdHRoaXMuX2NhcmQuc2hvdyhlbnRyeS50aWNrLCBjZW50ZXJZKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVJlc2l6ZU9ic2VydmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZXNpemVPYnNlcnZlclJlYWR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IFJlc2l6ZU9ic2VydmVyQ3RvciA9IGdldFdpbmRvdyh0aGlzLl9kb21Ob2RlKS5SZXNpemVPYnNlcnZlcjtcblx0XHRpZiAoIVJlc2l6ZU9ic2VydmVyQ3Rvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNpemVPYnNlcnZlclJlYWR5ID0gdHJ1ZTtcblx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlckN0b3IoKCkgPT4ge1xuXHRcdFx0Ly8gSGVpZ2h0IG9ubHkgY2hhbmdlcyBoZXJlICh3aW5kb3cvaW5wdXQtcGFydCByZXNpemUpOyByZWZyZXNoIHRoZSBjYWNoZWQgaGVpZ2h0IGFuZCB0b3Bcblx0XHRcdC8vICh1c2VkIGJ5IGhvdmVyL3NjcnViIHRvIGF2b2lkIHBlci1ldmVudCByZWZsb3dzKSBhbmQgbGF5IG91dC5cblx0XHRcdHRoaXMuX3JhaWxIZWlnaHQgPSB0aGlzLl9kb21Ob2RlLmNsaWVudEhlaWdodDtcblx0XHRcdHRoaXMuX2RvbVRvcCA9IHRoaXMuX2RvbU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wO1xuXHRcdFx0dGhpcy5fcmVsYXlvdXQoKTtcblx0XHR9KTtcblx0XHRvYnNlcnZlci5vYnNlcnZlKHRoaXMuX2RvbU5vZGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBvYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxHQUFHLHVCQUF1QixRQUFRLFdBQVcsV0FBVyxXQUFXLG9DQUFvQztBQUNoSCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0Isd0JBQXdCO0FBR2pELE9BQU87QUFHUCxNQUFNLGFBQWE7QUFFbkIsTUFBTSxxQkFBcUI7QUFFM0IsTUFBTSxZQUFZO0FBRWxCLE1BQU0sYUFBYTtBQUVuQixNQUFNLGFBQWE7QUFFbkIsTUFBTSwyQkFBMkI7QUFPakMsTUFBTSxjQUF1QztBQUU3QyxNQUFNLG9CQUFvQjtBQW9CbkIsTUFBTSxnQ0FB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
