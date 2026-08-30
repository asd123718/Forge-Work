import { $, addDisposableListener, append, EventType, getActiveElement, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { AnchorAlignment, AnchorAxisAlignment, AnchorPosition, layout2d } from "../../../../../base/common/layout.js";
import { renderMarkdown } from "../../../../../base/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { localize } from "../../../../../nls.js";
import { OnboardingDismissReason } from "../../common/onboardingScenario.js";
import "../media/spotlight.css";
const DEFAULT_HOLE_PADDING = 6;
const POINTER_SIZE = 10;
const POINTER_GAP = POINTER_SIZE;
const POINTER_EDGE_MARGIN = 16;
class SpotlightOverlay extends Disposable {
  constructor(_container, _resizeObserverCtor = getWindow(_container).ResizeObserver) {
    super();
    this._container = _container;
    this._resizeObserverCtor = _resizeObserverCtor;
    this._descriptionRenderStore = this._register(new DisposableStore());
    /** Listeners scoped to the currently shown step (re-layout sources). */
    this._stepListeners = this._register(new DisposableStore());
    this._onDidClickNext = this._register(new Emitter());
    this.onDidClickNext = this._onDidClickNext.event;
    this._onDidClickPrevious = this._register(new Emitter());
    this.onDidClickPrevious = this._onDidClickPrevious.event;
    this._onDidSkip = this._register(new Emitter());
    this.onDidSkip = this._onDidSkip.event;
    this._options = {};
    this._hasShown = false;
    this._root = append(this._container, $(".spotlight-overlay"));
    this._root.style.display = "none";
    this._blockers = [
      append(this._root, $(".spotlight-blocker")),
      append(this._root, $(".spotlight-blocker")),
      append(this._root, $(".spotlight-blocker")),
      append(this._root, $(".spotlight-blocker"))
    ];
    this._hole = append(this._root, $(".spotlight-hole"));
    this._hole.setAttribute("aria-hidden", "true");
    this._pointer = append(this._root, $(".spotlight-callout-pointer"));
    this._pointer.setAttribute("aria-hidden", "true");
    this._callout = append(this._root, $(".spotlight-callout"));
    this._callout.setAttribute("role", "dialog");
    this._callout.setAttribute("aria-modal", "true");
    this._callout.tabIndex = -1;
    const header = append(this._callout, $(".spotlight-callout-header"));
    this._title = append(header, $("h2.spotlight-callout-title"));
    this._title.id = "spotlight-callout-title";
    this._callout.setAttribute("aria-labelledby", this._title.id);
    this._description = append(this._callout, $(".spotlight-callout-description"));
    this._description.id = "spotlight-callout-description";
    this._callout.setAttribute("aria-describedby", this._description.id);
    const footer = append(this._callout, $(".spotlight-callout-footer"));
    this._counter = append(footer, $(".spotlight-callout-counter"));
    const actions = append(footer, $(".spotlight-callout-actions"));
    this._skipButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
    this._skipButton.label = localize("spotlight.endTour", "End Tour");
    this._skipButton.setTitle(localize("spotlight.endTour.tooltip", "End Tour (Esc)"));
    this._register(this._skipButton.onDidClick(() => this._onDidSkip.fire(OnboardingDismissReason.SkipButton)));
    this._backButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true }));
    this._backButton.label = localize("spotlight.back", "Back");
    this._register(this._backButton.onDidClick(() => this._onDidClickPrevious.fire()));
    this._nextButton = this._register(new Button(actions, { ...defaultButtonStyles }));
    this._nextButton.label = localize("spotlight.next", "Next");
    this._register(this._nextButton.onDidClick(() => this._onDidClickNext.fire("button")));
    for (const button of [this._skipButton, this._backButton, this._nextButton]) {
      this._register(button.onDidEscape(() => this._onDidSkip.fire(OnboardingDismissReason.EscapeKey)));
    }
    this._register(addDisposableListener(this._callout, EventType.KEY_DOWN, (e) => this._onKeyDown(e)));
    this._register({ dispose: () => this._restoreFocus() });
  }
  /** Show `content` spotlighting `target`. */
  show(target, content, options = {}) {
    if (!this._hasShown) {
      this._hasShown = true;
      this._previousFocus = isHTMLElement(getActiveElement()) ? getActiveElement() : void 0;
    }
    this._target = target;
    this._options = options;
    this._renderContent(content);
    const externalUiParticipates = !!options.targetOverlayVisible || !!options.allowTargetInteraction || !!options.advanceOnTargetClick || !!options.hideNext;
    this._root.classList.toggle("target-overlay-visible", externalUiParticipates);
    this._callout.setAttribute("aria-modal", externalUiParticipates ? "false" : "true");
    this._root.style.display = "";
    this._stepListeners.clear();
    const targetWindow = getWindow(this._container);
    const observer = new this._resizeObserverCtor(() => this.scheduleLayout());
    observer.observe(target);
    observer.observe(this._container);
    this._stepListeners.add({ dispose: () => observer.disconnect() });
    this._stepListeners.add(addDisposableListener(targetWindow, EventType.RESIZE, () => this.scheduleLayout()));
    this._stepListeners.add(addDisposableListener(targetWindow, EventType.SCROLL, () => this.scheduleLayout(), true));
    this._stepListeners.add(toDisposable(() => {
      this._scheduledLayout?.dispose();
      this._scheduledLayout = void 0;
    }));
    const advanceOnTargetClick = !!options.advanceOnTargetClick;
    const hideNext = advanceOnTargetClick || !!options.hideNext;
    this._nextButton.element.style.display = hideNext ? "none" : "";
    if (advanceOnTargetClick) {
      this._stepListeners.add(addDisposableListener(target, EventType.CLICK, () => this._onDidClickNext.fire("target")));
    }
    if (options.allowTargetInteraction || advanceOnTargetClick || options.hideNext) {
      this._stepListeners.add(addDisposableListener(target, EventType.KEY_DOWN, (e) => this._onKeyDown(e)));
    }
    this.layout();
    (hideNext ? target : this._nextButton.element).focus();
  }
  /** Hide the current step while another target is being resolved. */
  hide() {
    this._stepListeners.clear();
    this._root.style.display = "none";
    this._root.classList.remove("target-overlay-visible");
    this._target = void 0;
    this._options = {};
  }
  /** Recompute the hole and callout positions for the current target. */
  layout() {
    const target = this._target;
    if (!target || this._root.style.display === "none") {
      return;
    }
    const targetWindow = getWindow(this._container);
    const viewportWidth = targetWindow.document.documentElement.clientWidth;
    const viewportHeight = targetWindow.document.documentElement.clientHeight;
    const rect = target.getBoundingClientRect();
    const padding = this._options.padding ?? DEFAULT_HOLE_PADDING;
    const holeLeft = Math.max(0, rect.left - padding);
    const holeTop = Math.max(0, rect.top - padding);
    const holeWidth = Math.min(viewportWidth - holeLeft, rect.width + padding * 2);
    const holeHeight = Math.min(viewportHeight - holeTop, rect.height + padding * 2);
    this._hole.style.left = `${holeLeft}px`;
    this._hole.style.top = `${holeTop}px`;
    this._hole.style.width = `${holeWidth}px`;
    this._hole.style.height = `${holeHeight}px`;
    if (this._options.allowTargetInteraction || this._options.advanceOnTargetClick) {
      const right = holeLeft + holeWidth;
      const bottom = holeTop + holeHeight;
      this._layoutBlocker(this._blockers[0], 0, 0, viewportWidth, holeTop);
      this._layoutBlocker(this._blockers[1], right, holeTop, viewportWidth - right, holeHeight);
      this._layoutBlocker(this._blockers[2], 0, bottom, viewportWidth, viewportHeight - bottom);
      this._layoutBlocker(this._blockers[3], 0, holeTop, holeLeft, holeHeight);
    } else {
      this._layoutBlocker(this._blockers[0], 0, 0, viewportWidth, viewportHeight);
      for (let i = 1; i < this._blockers.length; i++) {
        this._blockers[i].style.display = "none";
      }
    }
    this._layoutCallout({ top: holeTop, left: holeLeft, width: holeWidth, height: holeHeight }, viewportWidth, viewportHeight);
  }
  _layoutBlocker(blocker, left, top, width, height) {
    blocker.style.display = "";
    blocker.style.left = `${left}px`;
    blocker.style.top = `${top}px`;
    blocker.style.right = "auto";
    blocker.style.bottom = "auto";
    blocker.style.width = `${Math.max(0, width)}px`;
    blocker.style.height = `${Math.max(0, height)}px`;
  }
  _layoutCallout(anchor, viewportWidth, viewportHeight) {
    const viewport = { top: 0, left: 0, width: viewportWidth, height: viewportHeight };
    const view = { width: this._callout.offsetWidth, height: this._callout.offsetHeight };
    const { anchorAxisAlignment, anchorPosition, anchorAlignment } = this._resolvePlacement(this._options.placement ?? "auto");
    const result = layout2d(viewport, view, anchor, { anchorAxisAlignment, anchorPosition, anchorAlignment });
    const left = anchorAxisAlignment === AnchorAxisAlignment.VERTICAL ? this._centerCallout(anchor, view.width, viewportWidth) : result.left;
    const callout = { top: result.top, left, width: view.width, height: view.height };
    const pointerSide = this._getPointerSide(anchor, callout, anchorAxisAlignment);
    const offsetCallout = this._offsetCalloutForPointer(callout, pointerSide, viewportWidth, viewportHeight);
    this._callout.style.top = `${offsetCallout.top}px`;
    this._callout.style.left = `${offsetCallout.left}px`;
    this._layoutPointer(anchor, offsetCallout, pointerSide);
  }
  _centerCallout(anchor, calloutWidth, viewportWidth) {
    const centered = anchor.left + anchor.width / 2 - calloutWidth / 2;
    return Math.max(0, Math.min(centered, viewportWidth - calloutWidth));
  }
  _getPointerSide(anchor, callout, anchorAxisAlignment) {
    const targetCenterX = anchor.left + anchor.width / 2;
    const targetCenterY = anchor.top + anchor.height / 2;
    const calloutCenterX = callout.left + callout.width / 2;
    const calloutCenterY = callout.top + callout.height / 2;
    return anchorAxisAlignment === AnchorAxisAlignment.VERTICAL ? calloutCenterY < targetCenterY ? "bottom" : "top" : calloutCenterX < targetCenterX ? "right" : "left";
  }
  _offsetCalloutForPointer(callout, side, viewportWidth, viewportHeight) {
    switch (side) {
      case "bottom":
        return { ...callout, top: Math.max(0, callout.top - POINTER_GAP) };
      case "top":
        return { ...callout, top: Math.min(viewportHeight - callout.height, callout.top + POINTER_GAP) };
      case "right":
        return { ...callout, left: Math.max(0, callout.left - POINTER_GAP) };
      case "left":
        return { ...callout, left: Math.min(viewportWidth - callout.width, callout.left + POINTER_GAP) };
    }
  }
  _layoutPointer(anchor, callout, side) {
    const targetCenterX = anchor.left + anchor.width / 2;
    const targetCenterY = anchor.top + anchor.height / 2;
    const pointerOffset = POINTER_SIZE / 2;
    this._pointer.classList.remove("top", "right", "bottom", "left");
    this._pointer.classList.add(side);
    if (side === "top" || side === "bottom") {
      const pointerCenterX = this._clamp(targetCenterX, callout.left + POINTER_EDGE_MARGIN, callout.left + callout.width - POINTER_EDGE_MARGIN);
      this._pointer.style.left = `${pointerCenterX - pointerOffset}px`;
      this._pointer.style.top = `${side === "bottom" ? callout.top + callout.height - pointerOffset : callout.top - pointerOffset}px`;
      return;
    }
    const pointerCenterY = this._clamp(targetCenterY, callout.top + POINTER_EDGE_MARGIN, callout.top + callout.height - POINTER_EDGE_MARGIN);
    this._pointer.style.left = `${side === "right" ? callout.left + callout.width - pointerOffset : callout.left - pointerOffset}px`;
    this._pointer.style.top = `${pointerCenterY - pointerOffset}px`;
  }
  _clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }
  _resolvePlacement(placement) {
    switch (placement) {
      case "above":
        return { anchorAxisAlignment: AnchorAxisAlignment.VERTICAL, anchorPosition: AnchorPosition.ABOVE, anchorAlignment: AnchorAlignment.LEFT };
      case "left":
        return { anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL, anchorPosition: AnchorPosition.BELOW, anchorAlignment: AnchorAlignment.RIGHT };
      case "right":
        return { anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL, anchorPosition: AnchorPosition.BELOW, anchorAlignment: AnchorAlignment.LEFT };
      case "below":
      case "auto":
      default:
        return { anchorAxisAlignment: AnchorAxisAlignment.VERTICAL, anchorPosition: AnchorPosition.BELOW, anchorAlignment: AnchorAlignment.LEFT };
    }
  }
  _renderContent(content) {
    this._title.textContent = content.title;
    this._descriptionRenderStore.clear();
    this._description.replaceChildren();
    if (isMarkdownString(content.description)) {
      const rendered = this._descriptionRenderStore.add(renderMarkdown(content.description));
      this._description.appendChild(rendered.element);
    } else {
      this._description.textContent = content.description;
    }
    this._counter.textContent = localize("spotlight.counter", "{0} of {1}", content.stepIndex + 1, content.stepCount);
    this._skipButton.element.style.display = content.isLastStep ? "none" : "";
    this._backButton.element.style.display = content.canGoBack ? "" : "none";
    this._nextButton.label = content.isLastStep ? localize("spotlight.done", "Done") : localize("spotlight.next", "Next");
  }
  _onKeyDown(e) {
    const event = new StandardKeyboardEvent(e);
    if (event.equals(KeyCode.Escape)) {
      event.stopPropagation();
      event.preventDefault();
      this._onDidSkip.fire(OnboardingDismissReason.EscapeKey);
      return;
    }
    if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab)) {
      this._trapFocus(event);
    }
  }
  _trapFocus(event) {
    const focusable = this._collectFocusable();
    if (focusable.length === 0) {
      return;
    }
    const active = getActiveElement();
    const currentIndex = focusable.findIndex((element) => element === active);
    let nextIndex;
    if (currentIndex === -1) {
      nextIndex = event.shiftKey ? focusable.length - 1 : 0;
    } else {
      const delta = event.shiftKey ? -1 : 1;
      nextIndex = (currentIndex + delta + focusable.length) % focusable.length;
    }
    event.preventDefault();
    event.stopPropagation();
    focusable[nextIndex].focus();
  }
  /**
   * The focusable elements participating in the focus trap, in DOM order: the
   * spotlighted target (when it is interactive or the Next button is hidden), then any
   * interactive content in the (possibly markdown) description, then the visible
   * action buttons. Including the target keeps the spotlighted control
   * keyboard-reachable, and querying the description keeps markdown links
   * reachable despite `aria-modal`.
   */
  _collectFocusable() {
    const targetFocusables = (this._options.allowTargetInteraction || this._options.advanceOnTargetClick || this._options.hideNext) && this._target ? [this._target, ...this._target.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
    const descriptionFocusables = Array.from(
      // eslint-disable-next-line no-restricted-syntax -- querying our own callout description subtree for focusable markdown content (e.g. links)
      this._description.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    );
    const buttons = [this._skipButton, this._backButton, this._nextButton].filter((button) => button.element.style.display !== "none").map((button) => button.element);
    return [...targetFocusables, ...descriptionFocusables, ...buttons].filter((element) => this._isTabbable(element));
  }
  _isTabbable(element) {
    if (!element.isConnected || element.getAttribute("aria-hidden") === "true" || element.tabIndex === -1 || element.hasAttribute("disabled")) {
      return false;
    }
    const style = getWindow(this._container).getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }
  scheduleLayout() {
    if (this._scheduledLayout) {
      return;
    }
    const targetWindow = getWindow(this._container);
    this._scheduledLayout = scheduleAtNextAnimationFrame(targetWindow, () => {
      this._scheduledLayout = void 0;
      this.layout();
    });
  }
  _restoreFocus() {
    const previous = this._previousFocus;
    this._previousFocus = void 0;
    if (previous && previous.isConnected) {
      previous.focus();
    }
  }
  dispose() {
    this._root.remove();
    super.dispose();
  }
}
export {
  SpotlightOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9uYm9hcmRpbmdcXGJyb3dzZXJcXHNwb3RsaWdodFxcc3BvdGxpZ2h0T3ZlcmxheS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudFR5cGUsIGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgaXNIVE1MRWxlbWVudCwgc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBBbmNob3JBeGlzQWxpZ25tZW50LCBBbmNob3JQb3NpdGlvbiwgSVJlY3QsIGxheW91dDJkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF5b3V0LmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTcG90bGlnaHRQbGFjZW1lbnQgfSBmcm9tICcuL3Nwb3RsaWdodFR5cGVzLmpzJztcbmltcG9ydCB7IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uIH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdTY2VuYXJpby5qcyc7XG5pbXBvcnQgJy4uL21lZGlhL3Nwb3RsaWdodC5jc3MnO1xuXG4vKiogSG93IHRoZSB1c2VyIGFkdmFuY2VkIHRvIHRoZSBuZXh0IHN0ZXAuICovXG5leHBvcnQgdHlwZSBTcG90bGlnaHRBZHZhbmNlU291cmNlID0gJ2J1dHRvbicgfCAndGFyZ2V0JztcblxuLyoqIFdoeSBhIHN0ZXAgZW5kZWQgaW4gYSBza2lwOiB0aGUgU2tpcCBidXR0b24gb3IgdGhlIEVzY2FwZSBrZXkuICovXG5leHBvcnQgdHlwZSBTcG90bGlnaHRTa2lwUmVhc29uID0gT25ib2FyZGluZ0Rpc21pc3NSZWFzb24uU2tpcEJ1dHRvbiB8IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkVzY2FwZUtleTtcblxuLyoqIERlZmF1bHQgcGFkZGluZyAocHgpIGFkZGVkIGFyb3VuZCB0aGUgdGFyZ2V0IHdoZW4gY3V0dGluZyB0aGUgaGlnaGxpZ2h0IGhvbGUuICovXG5jb25zdCBERUZBVUxUX0hPTEVfUEFERElORyA9IDY7XG5jb25zdCBQT0lOVEVSX1NJWkUgPSAxMDtcbmNvbnN0IFBPSU5URVJfR0FQID0gUE9JTlRFUl9TSVpFO1xuY29uc3QgUE9JTlRFUl9FREdFX01BUkdJTiA9IDE2O1xudHlwZSBQb2ludGVyU2lkZSA9ICd0b3AnIHwgJ3JpZ2h0JyB8ICdib3R0b20nIHwgJ2xlZnQnO1xuXG4vKiogQ29udGVudCByZW5kZXJlZCBpbnNpZGUgdGhlIHNwb3RsaWdodCBjYWxsb3V0IGZvciBhIHNpbmdsZSBzdGVwLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3BvdGxpZ2h0Q29udGVudCB7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdC8qKiBaZXJvLWJhc2VkIGluZGV4IG9mIHRoZSBjdXJyZW50IHN0ZXAuICovXG5cdHJlYWRvbmx5IHN0ZXBJbmRleDogbnVtYmVyO1xuXHQvKiogVG90YWwgbnVtYmVyIG9mIHN0ZXBzIGluIHRoZSB0b3VyLiAqL1xuXHRyZWFkb25seSBzdGVwQ291bnQ6IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgYSBcIkJhY2tcIiBhY3Rpb24gc2hvdWxkIGJlIG9mZmVyZWQuICovXG5cdHJlYWRvbmx5IGNhbkdvQmFjazogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdGhpcyBpcyB0aGUgZmluYWwgc3RlcCAodGhlIHByaW1hcnkgYnV0dG9uIGJlY29tZXMgXCJEb25lXCIpLiAqL1xuXHRyZWFkb25seSBpc0xhc3RTdGVwOiBib29sZWFuO1xufVxuXG4vKiogT3B0aW9ucyBjb250cm9sbGluZyBob3cgYSBzdGVwIGlzIHNob3duLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3BvdGxpZ2h0U2hvd09wdGlvbnMge1xuXHRyZWFkb25seSBwbGFjZW1lbnQ/OiBTcG90bGlnaHRQbGFjZW1lbnQ7XG5cdHJlYWRvbmx5IGFsbG93VGFyZ2V0SW50ZXJhY3Rpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBwYWRkaW5nPzogbnVtYmVyO1xuXHRyZWFkb25seSBoaWRlTmV4dD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRhcmdldE92ZXJsYXlWaXNpYmxlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB0aGUgc3RlcCBhZHZhbmNlcyAoZmlyZXMgYG9uRGlkQ2xpY2tOZXh0YCkgd2hlbiB0aGUgdXNlciBjbGlja3Ncblx0ICogdGhlIHNwb3RsaWdodGVkIHRhcmdldCBpdHNlbGYuIFRoZSBcIk5leHRcIiBidXR0b24gaXMgaGlkZGVuIGFuZCB0aGUgdGFyZ2V0XG5cdCAqIGlzIGtlcHQgaW50ZXJhY3RpdmUgc28gdGhlIHVzZXIgY2FuIHByZXNzIGl0IHRvIGNvbnRpbnVlLlxuXHQgKi9cblx0cmVhZG9ubHkgYWR2YW5jZU9uVGFyZ2V0Q2xpY2s/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEEgcHVyZS1ET00gc3BvdGxpZ2h0IG92ZXJsYXk6IGRpbXMgdGhlIHdpbmRvdywgY3V0cyBhIGhpZ2hsaWdodCBob2xlIGFyb3VuZCBhXG4gKiB0YXJnZXQgZWxlbWVudCBhbmQgc2hvd3MgYW4gYW5jaG9yZWQgY2FsbG91dC4gSXQgb3ducyBubyBWUyBDb2RlIHNlcnZpY2VzIHNvXG4gKiBpdCBjYW4gYmUgdW5pdC10ZXN0ZWQgYW5kIHJldXNlZC4gU2NoZWR1bGluZyBhbmQgY29udGVudCBjb21lIGZyb20gdGhlXG4gKiBzcG90bGlnaHQgcHJlc2VudGF0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgU3BvdGxpZ2h0T3ZlcmxheSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3Q6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ibG9ja2VyczogcmVhZG9ubHkgSFRNTEVsZW1lbnRbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfaG9sZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BvaW50ZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWxsb3V0OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY291bnRlcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rlc2NyaXB0aW9uUmVuZGVyU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhY2tCdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV4dEJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9za2lwQnV0dG9uOiBCdXR0b247XG5cblx0LyoqIExpc3RlbmVycyBzY29wZWQgdG8gdGhlIGN1cnJlbnRseSBzaG93biBzdGVwIChyZS1sYXlvdXQgc291cmNlcykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0ZXBMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tOZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3BvdGxpZ2h0QWR2YW5jZVNvdXJjZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tOZXh0OiBFdmVudDxTcG90bGlnaHRBZHZhbmNlU291cmNlPiA9IHRoaXMuX29uRGlkQ2xpY2tOZXh0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tQcmV2aW91cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrUHJldmlvdXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbGlja1ByZXZpb3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2tpcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNwb3RsaWdodFNraXBSZWFzb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNraXA6IEV2ZW50PFNwb3RsaWdodFNraXBSZWFzb24+ID0gdGhpcy5fb25EaWRTa2lwLmV2ZW50O1xuXG5cdHByaXZhdGUgX3RhcmdldDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29wdGlvbnM6IElTcG90bGlnaHRTaG93T3B0aW9ucyA9IHt9O1xuXHRwcml2YXRlIF9oYXNTaG93biA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcmV2aW91c0ZvY3VzOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2NoZWR1bGVkTGF5b3V0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc2l6ZU9ic2VydmVyQ3RvcjogdHlwZW9mIFJlc2l6ZU9ic2VydmVyID0gZ2V0V2luZG93KF9jb250YWluZXIpLlJlc2l6ZU9ic2VydmVyLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcm9vdCA9IGFwcGVuZCh0aGlzLl9jb250YWluZXIsICQoJy5zcG90bGlnaHQtb3ZlcmxheScpKTtcblx0XHR0aGlzLl9yb290LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLl9ibG9ja2VycyA9IFtcblx0XHRcdGFwcGVuZCh0aGlzLl9yb290LCAkKCcuc3BvdGxpZ2h0LWJsb2NrZXInKSksXG5cdFx0XHRhcHBlbmQodGhpcy5fcm9vdCwgJCgnLnNwb3RsaWdodC1ibG9ja2VyJykpLFxuXHRcdFx0YXBwZW5kKHRoaXMuX3Jvb3QsICQoJy5zcG90bGlnaHQtYmxvY2tlcicpKSxcblx0XHRcdGFwcGVuZCh0aGlzLl9yb290LCAkKCcuc3BvdGxpZ2h0LWJsb2NrZXInKSksXG5cdFx0XTtcblx0XHR0aGlzLl9ob2xlID0gYXBwZW5kKHRoaXMuX3Jvb3QsICQoJy5zcG90bGlnaHQtaG9sZScpKTtcblx0XHR0aGlzLl9ob2xlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuX3BvaW50ZXIgPSBhcHBlbmQodGhpcy5fcm9vdCwgJCgnLnNwb3RsaWdodC1jYWxsb3V0LXBvaW50ZXInKSk7XG5cdFx0dGhpcy5fcG9pbnRlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdHRoaXMuX2NhbGxvdXQgPSBhcHBlbmQodGhpcy5fcm9vdCwgJCgnLnNwb3RsaWdodC1jYWxsb3V0JykpO1xuXHRcdHRoaXMuX2NhbGxvdXQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2RpYWxvZycpO1xuXHRcdHRoaXMuX2NhbGxvdXQuc2V0QXR0cmlidXRlKCdhcmlhLW1vZGFsJywgJ3RydWUnKTtcblx0XHR0aGlzLl9jYWxsb3V0LnRhYkluZGV4ID0gLTE7XG5cblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQodGhpcy5fY2FsbG91dCwgJCgnLnNwb3RsaWdodC1jYWxsb3V0LWhlYWRlcicpKTtcblx0XHR0aGlzLl90aXRsZSA9IGFwcGVuZChoZWFkZXIsICQoJ2gyLnNwb3RsaWdodC1jYWxsb3V0LXRpdGxlJykpO1xuXHRcdHRoaXMuX3RpdGxlLmlkID0gJ3Nwb3RsaWdodC1jYWxsb3V0LXRpdGxlJztcblx0XHR0aGlzLl9jYWxsb3V0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbGxlZGJ5JywgdGhpcy5fdGl0bGUuaWQpO1xuXG5cdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBhcHBlbmQodGhpcy5fY2FsbG91dCwgJCgnLnNwb3RsaWdodC1jYWxsb3V0LWRlc2NyaXB0aW9uJykpO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uLmlkID0gJ3Nwb3RsaWdodC1jYWxsb3V0LWRlc2NyaXB0aW9uJztcblx0XHR0aGlzLl9jYWxsb3V0LnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmliZWRieScsIHRoaXMuX2Rlc2NyaXB0aW9uLmlkKTtcblxuXHRcdGNvbnN0IGZvb3RlciA9IGFwcGVuZCh0aGlzLl9jYWxsb3V0LCAkKCcuc3BvdGxpZ2h0LWNhbGxvdXQtZm9vdGVyJykpO1xuXHRcdHRoaXMuX2NvdW50ZXIgPSBhcHBlbmQoZm9vdGVyLCAkKCcuc3BvdGxpZ2h0LWNhbGxvdXQtY291bnRlcicpKTtcblx0XHRjb25zdCBhY3Rpb25zID0gYXBwZW5kKGZvb3RlciwgJCgnLnNwb3RsaWdodC1jYWxsb3V0LWFjdGlvbnMnKSk7XG5cblx0XHR0aGlzLl9za2lwQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihhY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5fc2tpcEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdzcG90bGlnaHQuZW5kVG91cicsIFwiRW5kIFRvdXJcIik7XG5cdFx0dGhpcy5fc2tpcEJ1dHRvbi5zZXRUaXRsZShsb2NhbGl6ZSgnc3BvdGxpZ2h0LmVuZFRvdXIudG9vbHRpcCcsIFwiRW5kIFRvdXIgKEVzYylcIikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NraXBCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLl9vbkRpZFNraXAuZmlyZShPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5Ta2lwQnV0dG9uKSkpO1xuXG5cdFx0dGhpcy5fYmFja0J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oYWN0aW9ucywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdHRoaXMuX2JhY2tCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnc3BvdGxpZ2h0LmJhY2snLCBcIkJhY2tcIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYmFja0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuX29uRGlkQ2xpY2tQcmV2aW91cy5maXJlKCkpKTtcblxuXHRcdHRoaXMuX25leHRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0dGhpcy5fbmV4dEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdzcG90bGlnaHQubmV4dCcsIFwiTmV4dFwiKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9uZXh0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5fb25EaWRDbGlja05leHQuZmlyZSgnYnV0dG9uJykpKTtcblxuXHRcdC8vIEJ1dHRvbnMgc3dhbGxvdyBFc2NhcGUgaW50ZXJuYWxseSwgc28gcm91dGUgdGhlaXIgZXNjYXBlIGV2ZW50cyB0byBlbmQgdGhlIHRvdXIgdG9vLlxuXHRcdGZvciAoY29uc3QgYnV0dG9uIG9mIFt0aGlzLl9za2lwQnV0dG9uLCB0aGlzLl9iYWNrQnV0dG9uLCB0aGlzLl9uZXh0QnV0dG9uXSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkRXNjYXBlKCgpID0+IHRoaXMuX29uRGlkU2tpcC5maXJlKE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkVzY2FwZUtleSkpKTtcblx0XHR9XG5cblx0XHQvLyBLZXlib2FyZCBoYW5kbGluZyBvbiB0aGUgY2FsbG91dDogRXNjIGVuZHMgdGhlIHRvdXIsIGZvY3VzIGlzIHRyYXBwZWQgd2l0aGluLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jYWxsb3V0LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4gdGhpcy5fb25LZXlEb3duKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHRoaXMuX3Jlc3RvcmVGb2N1cygpIH0pO1xuXHR9XG5cblx0LyoqIFNob3cgYGNvbnRlbnRgIHNwb3RsaWdodGluZyBgdGFyZ2V0YC4gKi9cblx0c2hvdyh0YXJnZXQ6IEhUTUxFbGVtZW50LCBjb250ZW50OiBJU3BvdGxpZ2h0Q29udGVudCwgb3B0aW9uczogSVNwb3RsaWdodFNob3dPcHRpb25zID0ge30pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1Nob3duKSB7XG5cdFx0XHR0aGlzLl9oYXNTaG93biA9IHRydWU7XG5cdFx0XHR0aGlzLl9wcmV2aW91c0ZvY3VzID0gaXNIVE1MRWxlbWVudChnZXRBY3RpdmVFbGVtZW50KCkpID8gZ2V0QWN0aXZlRWxlbWVudCgpIGFzIEhUTUxFbGVtZW50IDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RhcmdldCA9IHRhcmdldDtcblx0XHR0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9yZW5kZXJDb250ZW50KGNvbnRlbnQpO1xuXHRcdGNvbnN0IGV4dGVybmFsVWlQYXJ0aWNpcGF0ZXMgPSAhIW9wdGlvbnMudGFyZ2V0T3ZlcmxheVZpc2libGUgfHwgISFvcHRpb25zLmFsbG93VGFyZ2V0SW50ZXJhY3Rpb24gfHwgISFvcHRpb25zLmFkdmFuY2VPblRhcmdldENsaWNrIHx8ICEhb3B0aW9ucy5oaWRlTmV4dDtcblx0XHR0aGlzLl9yb290LmNsYXNzTGlzdC50b2dnbGUoJ3RhcmdldC1vdmVybGF5LXZpc2libGUnLCBleHRlcm5hbFVpUGFydGljaXBhdGVzKTtcblx0XHR0aGlzLl9jYWxsb3V0LnNldEF0dHJpYnV0ZSgnYXJpYS1tb2RhbCcsIGV4dGVybmFsVWlQYXJ0aWNpcGF0ZXMgPyAnZmFsc2UnIDogJ3RydWUnKTtcblxuXHRcdHRoaXMuX3Jvb3Quc3R5bGUuZGlzcGxheSA9ICcnO1xuXG5cdFx0Ly8gUmVidWlsZCB0aGUgcGVyLXN0ZXAgcmUtbGF5b3V0IGxpc3RlbmVycy5cblx0XHR0aGlzLl9zdGVwTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyB0aGlzLl9yZXNpemVPYnNlcnZlckN0b3IoKCkgPT4gdGhpcy5zY2hlZHVsZUxheW91dCgpKTtcblx0XHRvYnNlcnZlci5vYnNlcnZlKHRhcmdldCk7XG5cdFx0b2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLl9jb250YWluZXIpO1xuXHRcdHRoaXMuX3N0ZXBMaXN0ZW5lcnMuYWRkKHsgZGlzcG9zZTogKCkgPT4gb2JzZXJ2ZXIuZGlzY29ubmVjdCgpIH0pO1xuXG5cdFx0dGhpcy5fc3RlcExpc3RlbmVycy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRXZlbnRUeXBlLlJFU0laRSwgKCkgPT4gdGhpcy5zY2hlZHVsZUxheW91dCgpKSk7XG5cdFx0dGhpcy5fc3RlcExpc3RlbmVycy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRXZlbnRUeXBlLlNDUk9MTCwgKCkgPT4gdGhpcy5zY2hlZHVsZUxheW91dCgpLCB0cnVlKSk7XG5cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgc2NoZWR1bGVkIGZyYW1lIHdoZW4gdGhlIHN0ZXAgY2hhbmdlcy4gUmVnaXN0ZXJlZFxuXHRcdC8vIG9uY2UgaGVyZSAobm90IHBlciBzY2hlZHVsZSkgc28gaGlnaC1mcmVxdWVuY3kgc2Nyb2xsL3Jlc2l6ZSBldmVudHNcblx0XHQvLyBkb24ndCBhY2N1bXVsYXRlIG5vLW9wIGRpc3Bvc2FibGVzIGluIGBfc3RlcExpc3RlbmVyc2AuXG5cdFx0dGhpcy5fc3RlcExpc3RlbmVycy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlZExheW91dD8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVkTGF5b3V0ID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gdGhlIHN0ZXAgYWR2YW5jZXMgYnkgcHJlc3NpbmcgdGhlIHRhcmdldCwgaGlkZSB0aGUgTmV4dCBidXR0b24gYW5kXG5cdFx0Ly8gYWR2YW5jZSBvbiBhIGNsaWNrIG9mIHRoZSAoaW50ZXJhY3RpdmUpIHRhcmdldCBpbnN0ZWFkLiBUaGUgdGFyZ2V0IGlzXG5cdFx0Ly8ga2VwdCBrZXlib2FyZC1yZWFjaGFibGU6IGl0IGpvaW5zIHRoZSBmb2N1cyB0cmFwIChzZWUgYF9jb2xsZWN0Rm9jdXNhYmxlYClcblx0XHQvLyBhbmQgd2Ugcm91dGUgVGFiL0VzYyBmcm9tIGl0IHRocm91Z2ggdGhlIHNhbWUgaGFuZGxlciwgc28ga2V5Ym9hcmQtb25seVxuXHRcdC8vIHVzZXJzIGNhbiBmb2N1cyB0aGUgc3BvdGxpZ2h0ZWQgY29udHJvbCBhbmQgYWN0aXZhdGUgaXQgdG8gYWR2YW5jZS5cblx0XHRjb25zdCBhZHZhbmNlT25UYXJnZXRDbGljayA9ICEhb3B0aW9ucy5hZHZhbmNlT25UYXJnZXRDbGljaztcblx0XHRjb25zdCBoaWRlTmV4dCA9IGFkdmFuY2VPblRhcmdldENsaWNrIHx8ICEhb3B0aW9ucy5oaWRlTmV4dDtcblx0XHR0aGlzLl9uZXh0QnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGhpZGVOZXh0ID8gJ25vbmUnIDogJyc7XG5cdFx0aWYgKGFkdmFuY2VPblRhcmdldENsaWNrKSB7XG5cdFx0XHR0aGlzLl9zdGVwTGlzdGVuZXJzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX29uRGlkQ2xpY2tOZXh0LmZpcmUoJ3RhcmdldCcpKSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmFsbG93VGFyZ2V0SW50ZXJhY3Rpb24gfHwgYWR2YW5jZU9uVGFyZ2V0Q2xpY2sgfHwgb3B0aW9ucy5oaWRlTmV4dCkge1xuXHRcdFx0dGhpcy5fc3RlcExpc3RlbmVycy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHRoaXMuX29uS2V5RG93bihlKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0KCk7XG5cblx0XHQvLyBNb3ZlIGZvY3VzIHRvIHRoZSBzcG90bGlnaHRlZCBjb250cm9sIChzbyBrZXlib2FyZCB1c2VycyBjYW4gYWN0aXZhdGUgaXRcblx0XHQvLyB0byBhZHZhbmNlKSBvciwgb3RoZXJ3aXNlLCBpbnRvIHRoZSBjYWxsb3V0J3MgcHJpbWFyeSBhY3Rpb24uXG5cdFx0KGhpZGVOZXh0ID8gdGFyZ2V0IDogdGhpcy5fbmV4dEJ1dHRvbi5lbGVtZW50KS5mb2N1cygpO1xuXHR9XG5cblx0LyoqIEhpZGUgdGhlIGN1cnJlbnQgc3RlcCB3aGlsZSBhbm90aGVyIHRhcmdldCBpcyBiZWluZyByZXNvbHZlZC4gKi9cblx0aGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGVwTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcm9vdC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX3Jvb3QuY2xhc3NMaXN0LnJlbW92ZSgndGFyZ2V0LW92ZXJsYXktdmlzaWJsZScpO1xuXHRcdHRoaXMuX3RhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vcHRpb25zID0ge307XG5cdH1cblxuXHQvKiogUmVjb21wdXRlIHRoZSBob2xlIGFuZCBjYWxsb3V0IHBvc2l0aW9ucyBmb3IgdGhlIGN1cnJlbnQgdGFyZ2V0LiAqL1xuXHRsYXlvdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fdGFyZ2V0O1xuXHRcdGlmICghdGFyZ2V0IHx8IHRoaXMuX3Jvb3Quc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0Y29uc3Qgdmlld3BvcnRXaWR0aCA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodDtcblxuXHRcdGNvbnN0IHJlY3QgPSB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgcGFkZGluZyA9IHRoaXMuX29wdGlvbnMucGFkZGluZyA/PyBERUZBVUxUX0hPTEVfUEFERElORztcblx0XHRjb25zdCBob2xlTGVmdCA9IE1hdGgubWF4KDAsIHJlY3QubGVmdCAtIHBhZGRpbmcpO1xuXHRcdGNvbnN0IGhvbGVUb3AgPSBNYXRoLm1heCgwLCByZWN0LnRvcCAtIHBhZGRpbmcpO1xuXHRcdGNvbnN0IGhvbGVXaWR0aCA9IE1hdGgubWluKHZpZXdwb3J0V2lkdGggLSBob2xlTGVmdCwgcmVjdC53aWR0aCArIHBhZGRpbmcgKiAyKTtcblx0XHRjb25zdCBob2xlSGVpZ2h0ID0gTWF0aC5taW4odmlld3BvcnRIZWlnaHQgLSBob2xlVG9wLCByZWN0LmhlaWdodCArIHBhZGRpbmcgKiAyKTtcblxuXHRcdHRoaXMuX2hvbGUuc3R5bGUubGVmdCA9IGAke2hvbGVMZWZ0fXB4YDtcblx0XHR0aGlzLl9ob2xlLnN0eWxlLnRvcCA9IGAke2hvbGVUb3B9cHhgO1xuXHRcdHRoaXMuX2hvbGUuc3R5bGUud2lkdGggPSBgJHtob2xlV2lkdGh9cHhgO1xuXHRcdHRoaXMuX2hvbGUuc3R5bGUuaGVpZ2h0ID0gYCR7aG9sZUhlaWdodH1weGA7XG5cblx0XHQvLyBXaGVuIHRoZSB0YXJnZXQgaXMgaW50ZXJhY3RpdmUgKGV4cGxpY2l0bHksIG9yIGJlY2F1c2UgdGhlIHN0ZXAgYWR2YW5jZXNcblx0XHQvLyBvbiBhIHRhcmdldCBjbGljayksIGFycmFuZ2UgdGhlIGNsaWNrIGJsb2NrZXJzIGFyb3VuZCB0aGUgaG9sZSBzbyBldmVudHNcblx0XHQvLyBpbnNpZGUgaXQgcmVhY2ggdGhlIHVuZGVybHlpbmcgZWxlbWVudC5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5hbGxvd1RhcmdldEludGVyYWN0aW9uIHx8IHRoaXMuX29wdGlvbnMuYWR2YW5jZU9uVGFyZ2V0Q2xpY2spIHtcblx0XHRcdGNvbnN0IHJpZ2h0ID0gaG9sZUxlZnQgKyBob2xlV2lkdGg7XG5cdFx0XHRjb25zdCBib3R0b20gPSBob2xlVG9wICsgaG9sZUhlaWdodDtcblx0XHRcdHRoaXMuX2xheW91dEJsb2NrZXIodGhpcy5fYmxvY2tlcnNbMF0sIDAsIDAsIHZpZXdwb3J0V2lkdGgsIGhvbGVUb3ApO1xuXHRcdFx0dGhpcy5fbGF5b3V0QmxvY2tlcih0aGlzLl9ibG9ja2Vyc1sxXSwgcmlnaHQsIGhvbGVUb3AsIHZpZXdwb3J0V2lkdGggLSByaWdodCwgaG9sZUhlaWdodCk7XG5cdFx0XHR0aGlzLl9sYXlvdXRCbG9ja2VyKHRoaXMuX2Jsb2NrZXJzWzJdLCAwLCBib3R0b20sIHZpZXdwb3J0V2lkdGgsIHZpZXdwb3J0SGVpZ2h0IC0gYm90dG9tKTtcblx0XHRcdHRoaXMuX2xheW91dEJsb2NrZXIodGhpcy5fYmxvY2tlcnNbM10sIDAsIGhvbGVUb3AsIGhvbGVMZWZ0LCBob2xlSGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGF5b3V0QmxvY2tlcih0aGlzLl9ibG9ja2Vyc1swXSwgMCwgMCwgdmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLl9ibG9ja2Vycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHR0aGlzLl9ibG9ja2Vyc1tpXS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xheW91dENhbGxvdXQoeyB0b3A6IGhvbGVUb3AsIGxlZnQ6IGhvbGVMZWZ0LCB3aWR0aDogaG9sZVdpZHRoLCBoZWlnaHQ6IGhvbGVIZWlnaHQgfSwgdmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0QmxvY2tlcihibG9ja2VyOiBIVE1MRWxlbWVudCwgbGVmdDogbnVtYmVyLCB0b3A6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRibG9ja2VyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRibG9ja2VyLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblx0XHRibG9ja2VyLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdFx0YmxvY2tlci5zdHlsZS5yaWdodCA9ICdhdXRvJztcblx0XHRibG9ja2VyLnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcblx0XHRibG9ja2VyLnN0eWxlLndpZHRoID0gYCR7TWF0aC5tYXgoMCwgd2lkdGgpfXB4YDtcblx0XHRibG9ja2VyLnN0eWxlLmhlaWdodCA9IGAke01hdGgubWF4KDAsIGhlaWdodCl9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q2FsbG91dChhbmNob3I6IElSZWN0LCB2aWV3cG9ydFdpZHRoOiBudW1iZXIsIHZpZXdwb3J0SGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3cG9ydDogSVJlY3QgPSB7IHRvcDogMCwgbGVmdDogMCwgd2lkdGg6IHZpZXdwb3J0V2lkdGgsIGhlaWdodDogdmlld3BvcnRIZWlnaHQgfTtcblx0XHRjb25zdCB2aWV3ID0geyB3aWR0aDogdGhpcy5fY2FsbG91dC5vZmZzZXRXaWR0aCwgaGVpZ2h0OiB0aGlzLl9jYWxsb3V0Lm9mZnNldEhlaWdodCB9O1xuXG5cdFx0Y29uc3QgeyBhbmNob3JBeGlzQWxpZ25tZW50LCBhbmNob3JQb3NpdGlvbiwgYW5jaG9yQWxpZ25tZW50IH0gPSB0aGlzLl9yZXNvbHZlUGxhY2VtZW50KHRoaXMuX29wdGlvbnMucGxhY2VtZW50ID8/ICdhdXRvJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbGF5b3V0MmQodmlld3BvcnQsIHZpZXcsIGFuY2hvciwgeyBhbmNob3JBeGlzQWxpZ25tZW50LCBhbmNob3JQb3NpdGlvbiwgYW5jaG9yQWxpZ25tZW50IH0pO1xuXG5cdFx0Y29uc3QgbGVmdCA9IGFuY2hvckF4aXNBbGlnbm1lbnQgPT09IEFuY2hvckF4aXNBbGlnbm1lbnQuVkVSVElDQUwgPyB0aGlzLl9jZW50ZXJDYWxsb3V0KGFuY2hvciwgdmlldy53aWR0aCwgdmlld3BvcnRXaWR0aCkgOiByZXN1bHQubGVmdDtcblx0XHRjb25zdCBjYWxsb3V0ID0geyB0b3A6IHJlc3VsdC50b3AsIGxlZnQsIHdpZHRoOiB2aWV3LndpZHRoLCBoZWlnaHQ6IHZpZXcuaGVpZ2h0IH07XG5cdFx0Y29uc3QgcG9pbnRlclNpZGUgPSB0aGlzLl9nZXRQb2ludGVyU2lkZShhbmNob3IsIGNhbGxvdXQsIGFuY2hvckF4aXNBbGlnbm1lbnQpO1xuXHRcdGNvbnN0IG9mZnNldENhbGxvdXQgPSB0aGlzLl9vZmZzZXRDYWxsb3V0Rm9yUG9pbnRlcihjYWxsb3V0LCBwb2ludGVyU2lkZSwgdmlld3BvcnRXaWR0aCwgdmlld3BvcnRIZWlnaHQpO1xuXG5cdFx0dGhpcy5fY2FsbG91dC5zdHlsZS50b3AgPSBgJHtvZmZzZXRDYWxsb3V0LnRvcH1weGA7XG5cdFx0dGhpcy5fY2FsbG91dC5zdHlsZS5sZWZ0ID0gYCR7b2Zmc2V0Q2FsbG91dC5sZWZ0fXB4YDtcblx0XHR0aGlzLl9sYXlvdXRQb2ludGVyKGFuY2hvciwgb2Zmc2V0Q2FsbG91dCwgcG9pbnRlclNpZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2VudGVyQ2FsbG91dChhbmNob3I6IElSZWN0LCBjYWxsb3V0V2lkdGg6IG51bWJlciwgdmlld3BvcnRXaWR0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBjZW50ZXJlZCA9IGFuY2hvci5sZWZ0ICsgKGFuY2hvci53aWR0aCAvIDIpIC0gKGNhbGxvdXRXaWR0aCAvIDIpO1xuXHRcdHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihjZW50ZXJlZCwgdmlld3BvcnRXaWR0aCAtIGNhbGxvdXRXaWR0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UG9pbnRlclNpZGUoYW5jaG9yOiBJUmVjdCwgY2FsbG91dDogSVJlY3QsIGFuY2hvckF4aXNBbGlnbm1lbnQ6IEFuY2hvckF4aXNBbGlnbm1lbnQpOiBQb2ludGVyU2lkZSB7XG5cdFx0Y29uc3QgdGFyZ2V0Q2VudGVyWCA9IGFuY2hvci5sZWZ0ICsgKGFuY2hvci53aWR0aCAvIDIpO1xuXHRcdGNvbnN0IHRhcmdldENlbnRlclkgPSBhbmNob3IudG9wICsgKGFuY2hvci5oZWlnaHQgLyAyKTtcblx0XHRjb25zdCBjYWxsb3V0Q2VudGVyWCA9IGNhbGxvdXQubGVmdCArIChjYWxsb3V0LndpZHRoIC8gMik7XG5cdFx0Y29uc3QgY2FsbG91dENlbnRlclkgPSBjYWxsb3V0LnRvcCArIChjYWxsb3V0LmhlaWdodCAvIDIpO1xuXHRcdHJldHVybiBhbmNob3JBeGlzQWxpZ25tZW50ID09PSBBbmNob3JBeGlzQWxpZ25tZW50LlZFUlRJQ0FMXG5cdFx0XHQ/IGNhbGxvdXRDZW50ZXJZIDwgdGFyZ2V0Q2VudGVyWSA/ICdib3R0b20nIDogJ3RvcCdcblx0XHRcdDogY2FsbG91dENlbnRlclggPCB0YXJnZXRDZW50ZXJYID8gJ3JpZ2h0JyA6ICdsZWZ0Jztcblx0fVxuXG5cdHByaXZhdGUgX29mZnNldENhbGxvdXRGb3JQb2ludGVyKGNhbGxvdXQ6IElSZWN0LCBzaWRlOiBQb2ludGVyU2lkZSwgdmlld3BvcnRXaWR0aDogbnVtYmVyLCB2aWV3cG9ydEhlaWdodDogbnVtYmVyKTogSVJlY3Qge1xuXHRcdHN3aXRjaCAoc2lkZSkge1xuXHRcdFx0Y2FzZSAnYm90dG9tJzpcblx0XHRcdFx0cmV0dXJuIHsgLi4uY2FsbG91dCwgdG9wOiBNYXRoLm1heCgwLCBjYWxsb3V0LnRvcCAtIFBPSU5URVJfR0FQKSB9O1xuXHRcdFx0Y2FzZSAndG9wJzpcblx0XHRcdFx0cmV0dXJuIHsgLi4uY2FsbG91dCwgdG9wOiBNYXRoLm1pbih2aWV3cG9ydEhlaWdodCAtIGNhbGxvdXQuaGVpZ2h0LCBjYWxsb3V0LnRvcCArIFBPSU5URVJfR0FQKSB9O1xuXHRcdFx0Y2FzZSAncmlnaHQnOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5jYWxsb3V0LCBsZWZ0OiBNYXRoLm1heCgwLCBjYWxsb3V0LmxlZnQgLSBQT0lOVEVSX0dBUCkgfTtcblx0XHRcdGNhc2UgJ2xlZnQnOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5jYWxsb3V0LCBsZWZ0OiBNYXRoLm1pbih2aWV3cG9ydFdpZHRoIC0gY2FsbG91dC53aWR0aCwgY2FsbG91dC5sZWZ0ICsgUE9JTlRFUl9HQVApIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0UG9pbnRlcihhbmNob3I6IElSZWN0LCBjYWxsb3V0OiBJUmVjdCwgc2lkZTogUG9pbnRlclNpZGUpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRDZW50ZXJYID0gYW5jaG9yLmxlZnQgKyAoYW5jaG9yLndpZHRoIC8gMik7XG5cdFx0Y29uc3QgdGFyZ2V0Q2VudGVyWSA9IGFuY2hvci50b3AgKyAoYW5jaG9yLmhlaWdodCAvIDIpO1xuXHRcdGNvbnN0IHBvaW50ZXJPZmZzZXQgPSBQT0lOVEVSX1NJWkUgLyAyO1xuXG5cdFx0dGhpcy5fcG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCd0b3AnLCAncmlnaHQnLCAnYm90dG9tJywgJ2xlZnQnKTtcblx0XHR0aGlzLl9wb2ludGVyLmNsYXNzTGlzdC5hZGQoc2lkZSk7XG5cblx0XHRpZiAoc2lkZSA9PT0gJ3RvcCcgfHwgc2lkZSA9PT0gJ2JvdHRvbScpIHtcblx0XHRcdGNvbnN0IHBvaW50ZXJDZW50ZXJYID0gdGhpcy5fY2xhbXAodGFyZ2V0Q2VudGVyWCwgY2FsbG91dC5sZWZ0ICsgUE9JTlRFUl9FREdFX01BUkdJTiwgY2FsbG91dC5sZWZ0ICsgY2FsbG91dC53aWR0aCAtIFBPSU5URVJfRURHRV9NQVJHSU4pO1xuXHRcdFx0dGhpcy5fcG9pbnRlci5zdHlsZS5sZWZ0ID0gYCR7cG9pbnRlckNlbnRlclggLSBwb2ludGVyT2Zmc2V0fXB4YDtcblx0XHRcdHRoaXMuX3BvaW50ZXIuc3R5bGUudG9wID0gYCR7c2lkZSA9PT0gJ2JvdHRvbScgPyBjYWxsb3V0LnRvcCArIGNhbGxvdXQuaGVpZ2h0IC0gcG9pbnRlck9mZnNldCA6IGNhbGxvdXQudG9wIC0gcG9pbnRlck9mZnNldH1weGA7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9pbnRlckNlbnRlclkgPSB0aGlzLl9jbGFtcCh0YXJnZXRDZW50ZXJZLCBjYWxsb3V0LnRvcCArIFBPSU5URVJfRURHRV9NQVJHSU4sIGNhbGxvdXQudG9wICsgY2FsbG91dC5oZWlnaHQgLSBQT0lOVEVSX0VER0VfTUFSR0lOKTtcblx0XHR0aGlzLl9wb2ludGVyLnN0eWxlLmxlZnQgPSBgJHtzaWRlID09PSAncmlnaHQnID8gY2FsbG91dC5sZWZ0ICsgY2FsbG91dC53aWR0aCAtIHBvaW50ZXJPZmZzZXQgOiBjYWxsb3V0LmxlZnQgLSBwb2ludGVyT2Zmc2V0fXB4YDtcblx0XHR0aGlzLl9wb2ludGVyLnN0eWxlLnRvcCA9IGAke3BvaW50ZXJDZW50ZXJZIC0gcG9pbnRlck9mZnNldH1weGA7XG5cdH1cblxuXHRwcml2YXRlIF9jbGFtcCh2YWx1ZTogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLm1heChtaW4sIE1hdGgubWluKHZhbHVlLCBtYXgpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVQbGFjZW1lbnQocGxhY2VtZW50OiBTcG90bGlnaHRQbGFjZW1lbnQpOiB7IGFuY2hvckF4aXNBbGlnbm1lbnQ6IEFuY2hvckF4aXNBbGlnbm1lbnQ7IGFuY2hvclBvc2l0aW9uOiBBbmNob3JQb3NpdGlvbjsgYW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQgfSB7XG5cdFx0c3dpdGNoIChwbGFjZW1lbnQpIHtcblx0XHRcdGNhc2UgJ2Fib3ZlJzpcblx0XHRcdFx0cmV0dXJuIHsgYW5jaG9yQXhpc0FsaWdubWVudDogQW5jaG9yQXhpc0FsaWdubWVudC5WRVJUSUNBTCwgYW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkFCT1ZFLCBhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5MRUZUIH07XG5cdFx0XHRjYXNlICdsZWZ0Jzpcblx0XHRcdFx0cmV0dXJuIHsgYW5jaG9yQXhpc0FsaWdubWVudDogQW5jaG9yQXhpc0FsaWdubWVudC5IT1JJWk9OVEFMLCBhbmNob3JQb3NpdGlvbjogQW5jaG9yUG9zaXRpb24uQkVMT1csIGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50LlJJR0hUIH07XG5cdFx0XHRjYXNlICdyaWdodCc6XG5cdFx0XHRcdHJldHVybiB7IGFuY2hvckF4aXNBbGlnbm1lbnQ6IEFuY2hvckF4aXNBbGlnbm1lbnQuSE9SSVpPTlRBTCwgYW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkJFTE9XLCBhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5MRUZUIH07XG5cdFx0XHRjYXNlICdiZWxvdyc6XG5cdFx0XHRjYXNlICdhdXRvJzpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB7IGFuY2hvckF4aXNBbGlnbm1lbnQ6IEFuY2hvckF4aXNBbGlnbm1lbnQuVkVSVElDQUwsIGFuY2hvclBvc2l0aW9uOiBBbmNob3JQb3NpdGlvbi5CRUxPVywgYW5jaG9yQWxpZ25tZW50OiBBbmNob3JBbGlnbm1lbnQuTEVGVCB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNvbnRlbnQoY29udGVudDogSVNwb3RsaWdodENvbnRlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZS50ZXh0Q29udGVudCA9IGNvbnRlbnQudGl0bGU7XG5cblx0XHR0aGlzLl9kZXNjcmlwdGlvblJlbmRlclN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb24ucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcoY29udGVudC5kZXNjcmlwdGlvbikpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5fZGVzY3JpcHRpb25SZW5kZXJTdG9yZS5hZGQocmVuZGVyTWFya2Rvd24oY29udGVudC5kZXNjcmlwdGlvbikpO1xuXHRcdFx0dGhpcy5fZGVzY3JpcHRpb24uYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2Rlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gY29udGVudC5kZXNjcmlwdGlvbjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb3VudGVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Nwb3RsaWdodC5jb3VudGVyJywgXCJ7MH0gb2YgezF9XCIsIGNvbnRlbnQuc3RlcEluZGV4ICsgMSwgY29udGVudC5zdGVwQ291bnQpO1xuXG5cdFx0dGhpcy5fc2tpcEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBjb250ZW50LmlzTGFzdFN0ZXAgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLl9iYWNrQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGNvbnRlbnQuY2FuR29CYWNrID8gJycgOiAnbm9uZSc7XG5cdFx0dGhpcy5fbmV4dEJ1dHRvbi5sYWJlbCA9IGNvbnRlbnQuaXNMYXN0U3RlcFxuXHRcdFx0PyBsb2NhbGl6ZSgnc3BvdGxpZ2h0LmRvbmUnLCBcIkRvbmVcIilcblx0XHRcdDogbG9jYWxpemUoJ3Nwb3RsaWdodC5uZXh0JywgXCJOZXh0XCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25LZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMuX29uRGlkU2tpcC5maXJlKE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkVzY2FwZUtleSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikgfHwgZXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0dGhpcy5fdHJhcEZvY3VzKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cmFwRm9jdXMoZXZlbnQ6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzYWJsZSA9IHRoaXMuX2NvbGxlY3RGb2N1c2FibGUoKTtcblx0XHRpZiAoZm9jdXNhYmxlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZSA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBmb2N1c2FibGUuZmluZEluZGV4KGVsZW1lbnQgPT4gZWxlbWVudCA9PT0gYWN0aXZlKTtcblxuXHRcdC8vIFdoZW4gZm9jdXMgaXNuJ3QgY3VycmVudGx5IG9uIGEgdHJhY2tlZCBlbGVtZW50IChlLmcuIGl0IGxhbmRlZCBvbiB0aGVcblx0XHQvLyBjYWxsb3V0IGNvbnRhaW5lciBpdHNlbGYpLCBzdGFydCBmcm9tIHRoZSBhcHByb3ByaWF0ZSBlbmQgc28gVGFiIGdvZXMgdG9cblx0XHQvLyB0aGUgZmlyc3QgZWxlbWVudCBhbmQgU2hpZnQrVGFiIHRvIHRoZSBsYXN0LlxuXHRcdGxldCBuZXh0SW5kZXg6IG51bWJlcjtcblx0XHRpZiAoY3VycmVudEluZGV4ID09PSAtMSkge1xuXHRcdFx0bmV4dEluZGV4ID0gZXZlbnQuc2hpZnRLZXkgPyBmb2N1c2FibGUubGVuZ3RoIC0gMSA6IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRlbHRhID0gZXZlbnQuc2hpZnRLZXkgPyAtMSA6IDE7XG5cdFx0XHRuZXh0SW5kZXggPSAoY3VycmVudEluZGV4ICsgZGVsdGEgKyBmb2N1c2FibGUubGVuZ3RoKSAlIGZvY3VzYWJsZS5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRmb2N1c2FibGVbbmV4dEluZGV4XS5mb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBmb2N1c2FibGUgZWxlbWVudHMgcGFydGljaXBhdGluZyBpbiB0aGUgZm9jdXMgdHJhcCwgaW4gRE9NIG9yZGVyOiB0aGVcblx0ICogc3BvdGxpZ2h0ZWQgdGFyZ2V0ICh3aGVuIGl0IGlzIGludGVyYWN0aXZlIG9yIHRoZSBOZXh0IGJ1dHRvbiBpcyBoaWRkZW4pLCB0aGVuIGFueVxuXHQgKiBpbnRlcmFjdGl2ZSBjb250ZW50IGluIHRoZSAocG9zc2libHkgbWFya2Rvd24pIGRlc2NyaXB0aW9uLCB0aGVuIHRoZSB2aXNpYmxlXG5cdCAqIGFjdGlvbiBidXR0b25zLiBJbmNsdWRpbmcgdGhlIHRhcmdldCBrZWVwcyB0aGUgc3BvdGxpZ2h0ZWQgY29udHJvbFxuXHQgKiBrZXlib2FyZC1yZWFjaGFibGUsIGFuZCBxdWVyeWluZyB0aGUgZGVzY3JpcHRpb24ga2VlcHMgbWFya2Rvd24gbGlua3Ncblx0ICogcmVhY2hhYmxlIGRlc3BpdGUgYGFyaWEtbW9kYWxgLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29sbGVjdEZvY3VzYWJsZSgpOiBIVE1MRWxlbWVudFtdIHtcblx0XHRjb25zdCB0YXJnZXRGb2N1c2FibGVzID0gKHRoaXMuX29wdGlvbnMuYWxsb3dUYXJnZXRJbnRlcmFjdGlvbiB8fCB0aGlzLl9vcHRpb25zLmFkdmFuY2VPblRhcmdldENsaWNrIHx8IHRoaXMuX29wdGlvbnMuaGlkZU5leHQpICYmIHRoaXMuX3RhcmdldFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4IC0tIHF1ZXJ5aW5nIHRoZSBzcG90bGlnaHQgdGFyZ2V0IHN1YnRyZWUgZm9yIGZvY3VzYWJsZSBjb250cm9sc1xuXHRcdFx0PyBbdGhpcy5fdGFyZ2V0LCAuLi50aGlzLl90YXJnZXQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2FbaHJlZl0sIGJ1dHRvbiwgaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEsIFt0YWJpbmRleF06bm90KFt0YWJpbmRleD1cIi0xXCJdKScpXVxuXHRcdFx0OiBbXTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbkZvY3VzYWJsZXMgPSBBcnJheS5mcm9tKFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4IC0tIHF1ZXJ5aW5nIG91ciBvd24gY2FsbG91dCBkZXNjcmlwdGlvbiBzdWJ0cmVlIGZvciBmb2N1c2FibGUgbWFya2Rvd24gY29udGVudCAoZS5nLiBsaW5rcylcblx0XHRcdHRoaXMuX2Rlc2NyaXB0aW9uLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdhW2hyZWZdLCBidXR0b24sIGlucHV0LCBzZWxlY3QsIHRleHRhcmVhLCBbdGFiaW5kZXhdOm5vdChbdGFiaW5kZXg9XCItMVwiXSknKVxuXHRcdCk7XG5cdFx0Y29uc3QgYnV0dG9ucyA9IFt0aGlzLl9za2lwQnV0dG9uLCB0aGlzLl9iYWNrQnV0dG9uLCB0aGlzLl9uZXh0QnV0dG9uXVxuXHRcdFx0LmZpbHRlcihidXR0b24gPT4gYnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKVxuXHRcdFx0Lm1hcChidXR0b24gPT4gYnV0dG9uLmVsZW1lbnQpO1xuXHRcdHJldHVybiBbLi4udGFyZ2V0Rm9jdXNhYmxlcywgLi4uZGVzY3JpcHRpb25Gb2N1c2FibGVzLCAuLi5idXR0b25zXS5maWx0ZXIoZWxlbWVudCA9PiB0aGlzLl9pc1RhYmJhYmxlKGVsZW1lbnQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVGFiYmFibGUoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJykgPT09ICd0cnVlJyB8fCBlbGVtZW50LnRhYkluZGV4ID09PSAtMSB8fCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzdHlsZSA9IGdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpLmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJiBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJztcblx0fVxuXG5cdHNjaGVkdWxlTGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zY2hlZHVsZWRMYXlvdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lcik7XG5cdFx0dGhpcy5fc2NoZWR1bGVkTGF5b3V0ID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csICgpID0+IHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlZExheW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlRm9jdXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9wcmV2aW91c0ZvY3VzO1xuXHRcdHRoaXMuX3ByZXZpb3VzRm9jdXMgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHByZXZpb3VzICYmIHByZXZpb3VzLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRwcmV2aW91cy5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdC5yZW1vdmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFXLGtCQUFrQixXQUFXLGVBQWUsb0NBQW9DO0FBQ3RJLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGVBQXNCO0FBQy9CLFNBQTBCLHdCQUF3QjtBQUNsRCxTQUFTLGlCQUFpQixxQkFBcUIsZ0JBQXVCLGdCQUFnQjtBQUN0RixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQjtBQUN4QyxPQUFPO0FBU1AsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sY0FBYztBQUNwQixNQUFNLHNCQUFzQjtBQXNDckIsTUFBTSx5QkFBeUIsV0FBVztBQUFBLEVBbUNoRCxZQUNrQixZQUNBLHNCQUE2QyxVQUFVLFVBQVUsRUFBRSxnQkFDbkY7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQTFCbEIsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBTy9FO0FBQUEsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRXRFLFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxRQUFnQyxDQUFD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
