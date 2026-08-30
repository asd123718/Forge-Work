import { isFirefox } from "../../browser.js";
import { DataTransfers } from "../../dnd.js";
import { $, addDisposableListener, append, clearNode, EventHelper, EventType, getWindow, isHTMLElement, trackFocus } from "../../dom.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { Gesture, EventType as TouchEventType } from "../../touch.js";
import { Orientation } from "../sash/sash.js";
import { Color, RGBA } from "../../../common/color.js";
import { Emitter, Event } from "../../../common/event.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import "./paneview.css";
import { localize } from "../../../../nls.js";
import { Sizing, SplitView } from "./splitview.js";
import { applyDragImage } from "../dnd/dnd.js";
const DEFAULT_PANE_HEADER_SIZE = 22;
let globalPaneHeaderSize = DEFAULT_PANE_HEADER_SIZE;
function setGlobalPaneHeaderSize(size) {
  globalPaneHeaderSize = size;
}
class Pane extends Disposable {
  constructor(options) {
    super();
    this.expandedSize = void 0;
    this._headerVisible = true;
    this._collapsible = true;
    this._bodyRendered = false;
    this.styles = {
      dropBackground: void 0,
      headerBackground: void 0,
      headerBorder: void 0,
      headerForeground: void 0,
      leftBorder: void 0
    };
    this.animationTimer = void 0;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeExpansionState = this._register(new Emitter());
    this.onDidChangeExpansionState = this._onDidChangeExpansionState.event;
    this.orthogonalSize = 0;
    this._expanded = typeof options.expanded === "undefined" ? true : !!options.expanded;
    this._orientation = typeof options.orientation === "undefined" ? Orientation.VERTICAL : options.orientation;
    this._ariaHeaderLabel = this.getAriaHeaderLabel(options.title);
    this._minimumBodySize = typeof options.minimumBodySize === "number" ? options.minimumBodySize : this._orientation === Orientation.HORIZONTAL ? 200 : 120;
    this._maximumBodySize = typeof options.maximumBodySize === "number" ? options.maximumBodySize : Number.POSITIVE_INFINITY;
    this.element = $(".pane");
  }
  get ariaHeaderLabel() {
    return this._ariaHeaderLabel;
  }
  set ariaHeaderLabel(newLabel) {
    this._ariaHeaderLabel = newLabel;
    this.header?.setAttribute("aria-label", this.ariaHeaderLabel);
  }
  get draggableElement() {
    return this.header;
  }
  get dropTargetElement() {
    return this.element;
  }
  get dropBackground() {
    return this.styles.dropBackground;
  }
  get minimumBodySize() {
    return this._minimumBodySize;
  }
  set minimumBodySize(size) {
    this._minimumBodySize = size;
    this._onDidChange.fire(void 0);
  }
  get maximumBodySize() {
    return this._maximumBodySize;
  }
  set maximumBodySize(size) {
    this._maximumBodySize = size;
    this._onDidChange.fire(void 0);
  }
  get headerSize() {
    return this.headerVisible ? globalPaneHeaderSize : 0;
  }
  get minimumSize() {
    const headerSize = this.headerSize;
    const expanded = !this.headerVisible || this.isExpanded();
    const minimumBodySize = expanded ? this.minimumBodySize : 0;
    return headerSize + minimumBodySize;
  }
  get maximumSize() {
    const headerSize = this.headerSize;
    const expanded = !this.headerVisible || this.isExpanded();
    const maximumBodySize = expanded ? this.maximumBodySize : 0;
    return headerSize + maximumBodySize;
  }
  getAriaHeaderLabel(title) {
    return localize("viewSection", "{0} Section", title);
  }
  isExpanded() {
    return this._expanded;
  }
  setExpanded(expanded) {
    if (!expanded && !this.collapsible) {
      return false;
    }
    if (this._expanded === !!expanded) {
      return false;
    }
    this.element?.classList.toggle("expanded", expanded);
    this._expanded = !!expanded;
    this.updateHeader();
    if (expanded) {
      if (!this._bodyRendered) {
        this.renderBody(this.body);
        this._bodyRendered = true;
      }
      if (typeof this.animationTimer === "number") {
        getWindow(this.element).clearTimeout(this.animationTimer);
      }
      append(this.element, this.body);
    } else {
      this.animationTimer = getWindow(this.element).setTimeout(() => {
        this.body.remove();
      }, 200);
    }
    this._onDidChangeExpansionState.fire(expanded);
    this._onDidChange.fire(expanded ? this.expandedSize : void 0);
    return true;
  }
  get headerVisible() {
    return this._headerVisible;
  }
  set headerVisible(visible) {
    if (this._headerVisible === !!visible) {
      return;
    }
    this._headerVisible = !!visible;
    this.updateHeader();
    this._onDidChange.fire(void 0);
  }
  get collapsible() {
    return this._collapsible;
  }
  set collapsible(collapsible) {
    if (this._collapsible === !!collapsible) {
      return;
    }
    this._collapsible = !!collapsible;
    this.updateHeader();
  }
  get orientation() {
    return this._orientation;
  }
  set orientation(orientation) {
    if (this._orientation === orientation) {
      return;
    }
    this._orientation = orientation;
    if (this.element) {
      this.element.classList.toggle("horizontal", this.orientation === Orientation.HORIZONTAL);
      this.element.classList.toggle("vertical", this.orientation === Orientation.VERTICAL);
    }
    if (this.header) {
      this.updateHeader();
    }
  }
  render() {
    this.element.classList.toggle("expanded", this.isExpanded());
    this.element.classList.toggle("horizontal", this.orientation === Orientation.HORIZONTAL);
    this.element.classList.toggle("vertical", this.orientation === Orientation.VERTICAL);
    this.header = $(".pane-header");
    append(this.element, this.header);
    this.header.setAttribute("tabindex", "0");
    this.header.setAttribute("role", "button");
    this.header.setAttribute("aria-label", this.ariaHeaderLabel);
    this.renderHeader(this.header);
    const focusTracker = trackFocus(this.header);
    this._register(focusTracker);
    this._register(focusTracker.onDidFocus(() => this.header?.classList.add("focused"), null));
    this._register(focusTracker.onDidBlur(() => this.header?.classList.remove("focused"), null));
    this.updateHeader();
    const eventDisposables = this._register(new DisposableStore());
    const onKeyDown = this._register(new DomEmitter(this.header, "keydown"));
    const onHeaderKeyDown = Event.map(onKeyDown.event, (e) => new StandardKeyboardEvent(e), eventDisposables);
    this._register(Event.filter(onHeaderKeyDown, (e) => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space, eventDisposables)(() => this.setExpanded(!this.isExpanded()), null));
    this._register(Event.filter(onHeaderKeyDown, (e) => e.keyCode === KeyCode.LeftArrow, eventDisposables)(() => this.setExpanded(false), null));
    this._register(Event.filter(onHeaderKeyDown, (e) => e.keyCode === KeyCode.RightArrow, eventDisposables)(() => this.setExpanded(true), null));
    this._register(Gesture.addTarget(this.header));
    const header = this.header;
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._register(addDisposableListener(header, eventType, (e) => {
        if (!e.defaultPrevented) {
          this.setExpanded(!this.isExpanded());
        }
      }));
    });
    this.body = append(this.element, $(".pane-body"));
    if (!this._bodyRendered && this.isExpanded()) {
      this.renderBody(this.body);
      this._bodyRendered = true;
    }
    if (!this.isExpanded()) {
      this.body.remove();
    }
  }
  layout(size) {
    const headerSize = this.headerSize;
    const width = this._orientation === Orientation.VERTICAL ? this.orthogonalSize : size;
    const height = this._orientation === Orientation.VERTICAL ? size - headerSize : this.orthogonalSize - headerSize;
    if (this.isExpanded()) {
      this.body.classList.toggle("wide", width >= 600);
      this.layoutBody(height, width);
      this.expandedSize = size;
    }
  }
  style(styles) {
    this.styles = styles;
    if (!this.header) {
      return;
    }
    this.updateHeader();
  }
  updateHeader() {
    if (!this.header) {
      return;
    }
    const expanded = !this.headerVisible || this.isExpanded();
    if (this.collapsible) {
      this.header.setAttribute("tabindex", "0");
      this.header.setAttribute("role", "button");
    } else {
      this.header.removeAttribute("tabindex");
      this.header.removeAttribute("role");
    }
    this.header.classList.toggle("hidden", !this.headerVisible);
    this.header.classList.toggle("expanded", expanded);
    this.header.classList.toggle("not-collapsible", !this.collapsible);
    this.header.setAttribute("aria-expanded", String(expanded));
    this.header.style.color = this.collapsible ? this.styles.headerForeground ?? "" : "";
    this.header.style.backgroundColor = (this.collapsible ? this.styles.headerBackground : "transparent") ?? "";
    this.header.style.borderTop = this.styles.headerBorder && this.orientation === Orientation.VERTICAL ? `1px solid ${this.styles.headerBorder}` : "";
    this.element.style.borderLeft = this.styles.leftBorder && this.orientation === Orientation.HORIZONTAL ? `1px solid ${this.styles.leftBorder}` : "";
  }
}
const _PaneDraggable = class _PaneDraggable extends Disposable {
  constructor(pane, dnd, context) {
    super();
    this.pane = pane;
    this.dnd = dnd;
    this.context = context;
    this.dragOverCounter = 0;
    // see https://github.com/microsoft/vscode/issues/14470
    this._onDidDrop = this._register(new Emitter());
    this.onDidDrop = this._onDidDrop.event;
    pane.draggableElement.draggable = true;
    this._register(addDisposableListener(pane.draggableElement, "dragstart", (e) => this.onDragStart(e)));
    this._register(addDisposableListener(pane.dropTargetElement, "dragenter", (e) => this.onDragEnter(e)));
    this._register(addDisposableListener(pane.dropTargetElement, "dragleave", (e) => this.onDragLeave(e)));
    this._register(addDisposableListener(pane.dropTargetElement, "dragend", (e) => this.onDragEnd(e)));
    this._register(addDisposableListener(pane.dropTargetElement, "drop", (e) => this.onDrop(e)));
  }
  onDragStart(e) {
    if (!this.dnd.canDrag(this.pane) || !e.dataTransfer) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const label = this.pane.draggableElement?.textContent || "";
    e.dataTransfer.effectAllowed = "move";
    if (isFirefox) {
      e.dataTransfer?.setData(DataTransfers.TEXT, label);
    }
    applyDragImage(e, this.pane.element, label);
    this.context.draggable = this;
  }
  onDragEnter(e) {
    if (!this.context.draggable || this.context.draggable === this) {
      return;
    }
    if (!this.dnd.canDrop(this.context.draggable.pane, this.pane)) {
      return;
    }
    this.dragOverCounter++;
    this.render();
  }
  onDragLeave(e) {
    if (!this.context.draggable || this.context.draggable === this) {
      return;
    }
    if (!this.dnd.canDrop(this.context.draggable.pane, this.pane)) {
      return;
    }
    this.dragOverCounter--;
    if (this.dragOverCounter === 0) {
      this.render();
    }
  }
  onDragEnd(e) {
    if (!this.context.draggable) {
      return;
    }
    this.dragOverCounter = 0;
    this.render();
    this.context.draggable = null;
  }
  onDrop(e) {
    if (!this.context.draggable) {
      return;
    }
    EventHelper.stop(e);
    this.dragOverCounter = 0;
    this.render();
    if (this.dnd.canDrop(this.context.draggable.pane, this.pane) && this.context.draggable !== this) {
      this._onDidDrop.fire({ from: this.context.draggable.pane, to: this.pane });
    }
    this.context.draggable = null;
  }
  render() {
    let backgroundColor = null;
    if (this.dragOverCounter > 0) {
      backgroundColor = this.pane.dropBackground ?? _PaneDraggable.DefaultDragOverBackgroundColor.toString();
    }
    this.pane.dropTargetElement.style.backgroundColor = backgroundColor || "";
  }
};
_PaneDraggable.DefaultDragOverBackgroundColor = new Color(new RGBA(128, 128, 128, 0.5));
let PaneDraggable = _PaneDraggable;
class DefaultPaneDndController {
  canDrag(pane) {
    return true;
  }
  canDrop(pane, overPane) {
    return true;
  }
}
class PaneView extends Disposable {
  constructor(container, options = {}) {
    super();
    this.dndContext = { draggable: null };
    this.paneItems = [];
    this.orthogonalSize = 0;
    this.size = 0;
    this.animationTimer = void 0;
    this._onDidDrop = this._register(new Emitter());
    this.onDidDrop = this._onDidDrop.event;
    this.dnd = options.dnd;
    this.orientation = options.orientation ?? Orientation.VERTICAL;
    this.element = append(container, $(".monaco-pane-view"));
    this.splitview = this._register(new SplitView(this.element, { orientation: this.orientation }));
    this.onDidSashReset = this.splitview.onDidSashReset;
    this.onDidSashChange = this.splitview.onDidSashChange;
    this.onDidScroll = this.splitview.onDidScroll;
    const eventDisposables = this._register(new DisposableStore());
    const onKeyDown = this._register(new DomEmitter(this.element, "keydown"));
    const onHeaderKeyDown = Event.map(Event.filter(onKeyDown.event, (e) => isHTMLElement(e.target) && e.target.classList.contains("pane-header"), eventDisposables), (e) => new StandardKeyboardEvent(e), eventDisposables);
    this._register(Event.filter(onHeaderKeyDown, (e) => e.keyCode === KeyCode.UpArrow, eventDisposables)(() => this.focusPrevious()));
    this._register(Event.filter(onHeaderKeyDown, (e) => e.keyCode === KeyCode.DownArrow, eventDisposables)(() => this.focusNext()));
  }
  addPane(pane, size, index = this.splitview.length) {
    const disposables = new DisposableStore();
    pane.onDidChangeExpansionState(this.setupAnimation, this, disposables);
    const paneItem = { pane, disposable: disposables };
    this.paneItems.splice(index, 0, paneItem);
    pane.orientation = this.orientation;
    pane.orthogonalSize = this.orthogonalSize;
    this.splitview.addView(pane, size, index);
    if (this.dnd) {
      const draggable = new PaneDraggable(pane, this.dnd, this.dndContext);
      disposables.add(draggable);
      disposables.add(draggable.onDidDrop(this._onDidDrop.fire, this._onDidDrop));
    }
  }
  removePane(pane) {
    const index = this.paneItems.findIndex((item) => item.pane === pane);
    if (index === -1) {
      return;
    }
    this.splitview.removeView(index, pane.isExpanded() ? Sizing.Distribute : void 0);
    const paneItem = this.paneItems.splice(index, 1)[0];
    paneItem.disposable.dispose();
  }
  movePane(from, to) {
    const fromIndex = this.paneItems.findIndex((item) => item.pane === from);
    const toIndex = this.paneItems.findIndex((item) => item.pane === to);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    const [paneItem] = this.paneItems.splice(fromIndex, 1);
    this.paneItems.splice(toIndex, 0, paneItem);
    this.splitview.moveView(fromIndex, toIndex);
  }
  resizePane(pane, size) {
    const index = this.paneItems.findIndex((item) => item.pane === pane);
    if (index === -1) {
      return;
    }
    this.splitview.resizeView(index, size);
  }
  getPaneSize(pane) {
    const index = this.paneItems.findIndex((item) => item.pane === pane);
    if (index === -1) {
      return -1;
    }
    return this.splitview.getViewSize(index);
  }
  layout(height, width) {
    this.orthogonalSize = this.orientation === Orientation.VERTICAL ? width : height;
    this.size = this.orientation === Orientation.HORIZONTAL ? width : height;
    for (const paneItem of this.paneItems) {
      paneItem.pane.orthogonalSize = this.orthogonalSize;
    }
    this.splitview.layout(this.size);
  }
  setBoundarySashes(sashes) {
    this.boundarySashes = sashes;
    this.updateSplitviewOrthogonalSashes(sashes);
  }
  updateSplitviewOrthogonalSashes(sashes) {
    if (this.orientation === Orientation.VERTICAL) {
      this.splitview.orthogonalStartSash = sashes?.left;
      this.splitview.orthogonalEndSash = sashes?.right;
    } else {
      this.splitview.orthogonalEndSash = sashes?.bottom;
    }
  }
  flipOrientation(height, width) {
    this.orientation = this.orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
    const paneSizes = this.paneItems.map((pane) => this.getPaneSize(pane.pane));
    this.splitview.dispose();
    clearNode(this.element);
    this.splitview = this._register(new SplitView(this.element, { orientation: this.orientation }));
    this.updateSplitviewOrthogonalSashes(this.boundarySashes);
    const newOrthogonalSize = this.orientation === Orientation.VERTICAL ? width : height;
    const newSize = this.orientation === Orientation.HORIZONTAL ? width : height;
    this.paneItems.forEach((pane, index) => {
      pane.pane.orthogonalSize = newOrthogonalSize;
      pane.pane.orientation = this.orientation;
      const viewSize = this.size === 0 ? 0 : newSize * paneSizes[index] / this.size;
      this.splitview.addView(pane.pane, viewSize, index);
    });
    this.size = newSize;
    this.orthogonalSize = newOrthogonalSize;
    this.splitview.layout(this.size);
  }
  setupAnimation() {
    if (typeof this.animationTimer === "number") {
      getWindow(this.element).clearTimeout(this.animationTimer);
    }
    this.element.classList.add("animated");
    this.animationTimer = getWindow(this.element).setTimeout(() => {
      this.animationTimer = void 0;
      this.element.classList.remove("animated");
    }, 200);
  }
  getPaneHeaderElements() {
    return [...this.element.querySelectorAll(".pane-header")];
  }
  focusPrevious() {
    const headers = this.getPaneHeaderElements();
    const index = headers.indexOf(this.element.ownerDocument.activeElement);
    if (index === -1) {
      return;
    }
    headers[Math.max(index - 1, 0)].focus();
  }
  focusNext() {
    const headers = this.getPaneHeaderElements();
    const index = headers.indexOf(this.element.ownerDocument.activeElement);
    if (index === -1) {
      return;
    }
    headers[Math.min(index + 1, headers.length - 1)].focus();
  }
  dispose() {
    super.dispose();
    this.paneItems.forEach((i) => i.disposable.dispose());
  }
}
export {
  DEFAULT_PANE_HEADER_SIZE,
  DefaultPaneDndController,
  Pane,
  PaneView,
  setGlobalPaneHeaderSize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcc3BsaXR2aWV3XFxwYW5ldmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmlyZWZveCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgY2xlYXJOb2RlLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQsIHRyYWNrRm9jdXMgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uL2V2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgSUJvdW5kYXJ5U2FzaGVzLCBPcmllbnRhdGlvbiB9IGZyb20gJy4uL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBDb2xvciwgUkdCQSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0ICcuL3BhbmV2aWV3LmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVmlldywgU2l6aW5nLCBTcGxpdFZpZXcgfSBmcm9tICcuL3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uL2RuZC9kbmQuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElQYW5lT3B0aW9ucyB7XG5cdG1pbmltdW1Cb2R5U2l6ZT86IG51bWJlcjtcblx0bWF4aW11bUJvZHlTaXplPzogbnVtYmVyO1xuXHRleHBhbmRlZD86IGJvb2xlYW47XG5cdG9yaWVudGF0aW9uPzogT3JpZW50YXRpb247XG5cdHRpdGxlOiBzdHJpbmc7XG5cdHRpdGxlRGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhbmVTdHlsZXMge1xuXHRyZWFkb25seSBkcm9wQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBoZWFkZXJGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGhlYWRlckJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaGVhZGVyQm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGxlZnRCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEFORV9IRUFERVJfU0laRSA9IDIyO1xubGV0IGdsb2JhbFBhbmVIZWFkZXJTaXplID0gREVGQVVMVF9QQU5FX0hFQURFUl9TSVpFO1xuXG4vKipcbiAqIFVwZGF0ZXMgdGhlIGhlYWRlciBzaXplIHVzZWQgYnkgYWxsIHBhbmVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0R2xvYmFsUGFuZUhlYWRlclNpemUoc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdGdsb2JhbFBhbmVIZWFkZXJTaXplID0gc2l6ZTtcbn1cblxuLyoqXG4gKiBBIFBhbmUgaXMgYSBzdHJ1Y3R1cmVkIFNwbGl0VmlldyB2aWV3LlxuICpcbiAqIFdBUk5JTkc6IFlvdSBtdXN0IGNhbGwgYHJlbmRlcigpYCBhZnRlciB5b3UgY29uc3RydWN0IGl0LlxuICogSXQgY2FuJ3QgYmUgZG9uZSBhdXRvbWF0aWNhbGx5IGF0IHRoZSBlbmQgb2YgdGhlIGN0b3JcbiAqIGJlY2F1c2Ugb2YgdGhlIG9yZGVyIG9mIHByb3BlcnR5IGluaXRpYWxpemF0aW9uIGluIFR5cGVTY3JpcHQuXG4gKiBTdWJjbGFzc2VzIHdvdWxkbid0IGJlIGFibGUgdG8gc2V0IG93biBwcm9wZXJ0aWVzXG4gKiBiZWZvcmUgdGhlIGByZW5kZXIoKWAgY2FsbCwgdGh1cyBmb3JiaWRkaW5nIHRoZWlyIHVzZS5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFBhbmUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVZpZXcge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGhlYWRlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYm9keSE6IEhUTUxFbGVtZW50O1xuXG5cdHByb3RlY3RlZCBfZXhwYW5kZWQ6IGJvb2xlYW47XG5cdHByb3RlY3RlZCBfb3JpZW50YXRpb246IE9yaWVudGF0aW9uO1xuXG5cdHByaXZhdGUgZXhwYW5kZWRTaXplOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hlYWRlclZpc2libGUgPSB0cnVlO1xuXHRwcml2YXRlIF9jb2xsYXBzaWJsZSA9IHRydWU7XG5cdHByaXZhdGUgX2JvZHlSZW5kZXJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9taW5pbXVtQm9keVNpemU6IG51bWJlcjtcblx0cHJpdmF0ZSBfbWF4aW11bUJvZHlTaXplOiBudW1iZXI7XG5cdHByaXZhdGUgX2FyaWFIZWFkZXJMYWJlbDogc3RyaW5nO1xuXHRwcml2YXRlIHN0eWxlczogSVBhbmVTdHlsZXMgPSB7XG5cdFx0ZHJvcEJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRoZWFkZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0aGVhZGVyQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0aGVhZGVyRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdGxlZnRCb3JkZXI6IHVuZGVmaW5lZFxuXHR9O1xuXHRwcml2YXRlIGFuaW1hdGlvblRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRXhwYW5zaW9uU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHBhbnNpb25TdGF0ZTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZUV4cGFuc2lvblN0YXRlLmV2ZW50O1xuXG5cdGdldCBhcmlhSGVhZGVyTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJpYUhlYWRlckxhYmVsO1xuXHR9XG5cblx0c2V0IGFyaWFIZWFkZXJMYWJlbChuZXdMYWJlbDogc3RyaW5nKSB7XG5cdFx0dGhpcy5fYXJpYUhlYWRlckxhYmVsID0gbmV3TGFiZWw7XG5cdFx0dGhpcy5oZWFkZXI/LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYXJpYUhlYWRlckxhYmVsKTtcblx0fVxuXG5cdGdldCBkcmFnZ2FibGVFbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5oZWFkZXI7XG5cdH1cblxuXHRnZXQgZHJvcFRhcmdldEVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRnZXQgZHJvcEJhY2tncm91bmQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zdHlsZXMuZHJvcEJhY2tncm91bmQ7XG5cdH1cblxuXHRnZXQgbWluaW11bUJvZHlTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX21pbmltdW1Cb2R5U2l6ZTtcblx0fVxuXG5cdHNldCBtaW5pbXVtQm9keVNpemUoc2l6ZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbWluaW11bUJvZHlTaXplID0gc2l6ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXQgbWF4aW11bUJvZHlTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX21heGltdW1Cb2R5U2l6ZTtcblx0fVxuXG5cdHNldCBtYXhpbXVtQm9keVNpemUoc2l6ZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbWF4aW11bUJvZHlTaXplID0gc2l6ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBoZWFkZXJTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuaGVhZGVyVmlzaWJsZSA/IGdsb2JhbFBhbmVIZWFkZXJTaXplIDogMDtcblx0fVxuXG5cdGdldCBtaW5pbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGhlYWRlclNpemUgPSB0aGlzLmhlYWRlclNpemU7XG5cdFx0Y29uc3QgZXhwYW5kZWQgPSAhdGhpcy5oZWFkZXJWaXNpYmxlIHx8IHRoaXMuaXNFeHBhbmRlZCgpO1xuXHRcdGNvbnN0IG1pbmltdW1Cb2R5U2l6ZSA9IGV4cGFuZGVkID8gdGhpcy5taW5pbXVtQm9keVNpemUgOiAwO1xuXG5cdFx0cmV0dXJuIGhlYWRlclNpemUgKyBtaW5pbXVtQm9keVNpemU7XG5cdH1cblxuXHRnZXQgbWF4aW11bVNpemUoKTogbnVtYmVyIHtcblx0XHRjb25zdCBoZWFkZXJTaXplID0gdGhpcy5oZWFkZXJTaXplO1xuXHRcdGNvbnN0IGV4cGFuZGVkID0gIXRoaXMuaGVhZGVyVmlzaWJsZSB8fCB0aGlzLmlzRXhwYW5kZWQoKTtcblx0XHRjb25zdCBtYXhpbXVtQm9keVNpemUgPSBleHBhbmRlZCA/IHRoaXMubWF4aW11bUJvZHlTaXplIDogMDtcblxuXHRcdHJldHVybiBoZWFkZXJTaXplICsgbWF4aW11bUJvZHlTaXplO1xuXHR9XG5cblx0b3J0aG9nb25hbFNpemU6IG51bWJlciA9IDA7XG5cblx0cHJvdGVjdGVkIGdldEFyaWFIZWFkZXJMYWJlbCh0aXRsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3ZpZXdTZWN0aW9uJywgXCJ7MH0gU2VjdGlvblwiLCB0aXRsZSk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBJUGFuZU9wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2V4cGFuZGVkID0gdHlwZW9mIG9wdGlvbnMuZXhwYW5kZWQgPT09ICd1bmRlZmluZWQnID8gdHJ1ZSA6ICEhb3B0aW9ucy5leHBhbmRlZDtcblx0XHR0aGlzLl9vcmllbnRhdGlvbiA9IHR5cGVvZiBvcHRpb25zLm9yaWVudGF0aW9uID09PSAndW5kZWZpbmVkJyA/IE9yaWVudGF0aW9uLlZFUlRJQ0FMIDogb3B0aW9ucy5vcmllbnRhdGlvbjtcblx0XHR0aGlzLl9hcmlhSGVhZGVyTGFiZWwgPSB0aGlzLmdldEFyaWFIZWFkZXJMYWJlbChvcHRpb25zLnRpdGxlKTtcblx0XHR0aGlzLl9taW5pbXVtQm9keVNpemUgPSB0eXBlb2Ygb3B0aW9ucy5taW5pbXVtQm9keVNpemUgPT09ICdudW1iZXInID8gb3B0aW9ucy5taW5pbXVtQm9keVNpemUgOiB0aGlzLl9vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IDIwMCA6IDEyMDtcblx0XHR0aGlzLl9tYXhpbXVtQm9keVNpemUgPSB0eXBlb2Ygb3B0aW9ucy5tYXhpbXVtQm9keVNpemUgPT09ICdudW1iZXInID8gb3B0aW9ucy5tYXhpbXVtQm9keVNpemUgOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcucGFuZScpO1xuXHR9XG5cblx0aXNFeHBhbmRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZXhwYW5kZWQ7XG5cdH1cblxuXHRzZXRFeHBhbmRlZChleHBhbmRlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICghZXhwYW5kZWQgJiYgIXRoaXMuY29sbGFwc2libGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZXhwYW5kZWQgPT09ICEhZXhwYW5kZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuXG5cdFx0dGhpcy5fZXhwYW5kZWQgPSAhIWV4cGFuZGVkO1xuXHRcdHRoaXMudXBkYXRlSGVhZGVyKCk7XG5cblx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdGlmICghdGhpcy5fYm9keVJlbmRlcmVkKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyQm9keSh0aGlzLmJvZHkpO1xuXHRcdFx0XHR0aGlzLl9ib2R5UmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHRoaXMuYW5pbWF0aW9uVGltZXIgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpLmNsZWFyVGltZW91dCh0aGlzLmFuaW1hdGlvblRpbWVyKTtcblx0XHRcdH1cblx0XHRcdGFwcGVuZCh0aGlzLmVsZW1lbnQsIHRoaXMuYm9keSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYW5pbWF0aW9uVGltZXIgPSBnZXRXaW5kb3codGhpcy5lbGVtZW50KS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5ib2R5LnJlbW92ZSgpO1xuXHRcdFx0fSwgMjAwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4cGFuc2lvblN0YXRlLmZpcmUoZXhwYW5kZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZXhwYW5kZWQgPyB0aGlzLmV4cGFuZGVkU2l6ZSA6IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXQgaGVhZGVyVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGVhZGVyVmlzaWJsZTtcblx0fVxuXG5cdHNldCBoZWFkZXJWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5faGVhZGVyVmlzaWJsZSA9PT0gISF2aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faGVhZGVyVmlzaWJsZSA9ICEhdmlzaWJsZTtcblx0XHR0aGlzLnVwZGF0ZUhlYWRlcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldCBjb2xsYXBzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29sbGFwc2libGU7XG5cdH1cblxuXHRzZXQgY29sbGFwc2libGUoY29sbGFwc2libGU6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5fY29sbGFwc2libGUgPT09ICEhY29sbGFwc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb2xsYXBzaWJsZSA9ICEhY29sbGFwc2libGU7XG5cdFx0dGhpcy51cGRhdGVIZWFkZXIoKTtcblx0fVxuXG5cdGdldCBvcmllbnRhdGlvbigpOiBPcmllbnRhdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX29yaWVudGF0aW9uO1xuXHR9XG5cblx0c2V0IG9yaWVudGF0aW9uKG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbikge1xuXHRcdGlmICh0aGlzLl9vcmllbnRhdGlvbiA9PT0gb3JpZW50YXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vcmllbnRhdGlvbiA9IG9yaWVudGF0aW9uO1xuXG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hvcml6b250YWwnLCB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2ZXJ0aWNhbCcsIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5oZWFkZXIpIHtcblx0XHRcdHRoaXMudXBkYXRlSGVhZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIHRoaXMuaXNFeHBhbmRlZCgpKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaG9yaXpvbnRhbCcsIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2ZXJ0aWNhbCcsIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKTtcblxuXHRcdHRoaXMuaGVhZGVyID0gJCgnLnBhbmUtaGVhZGVyJyk7XG5cdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgdGhpcy5oZWFkZXIpO1xuXHRcdHRoaXMuaGVhZGVyLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdC8vIFVzZSByb2xlIGJ1dHRvbiBzbyB0aGUgYXJpYS1leHBhbmRlZCBzdGF0ZSBnZXRzIHJlYWQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk1OTk2XG5cdFx0dGhpcy5oZWFkZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuaGVhZGVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYXJpYUhlYWRlckxhYmVsKTtcblx0XHR0aGlzLnJlbmRlckhlYWRlcih0aGlzLmhlYWRlcik7XG5cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0cmFja0ZvY3VzKHRoaXMuaGVhZGVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHRoaXMuaGVhZGVyPy5jbGFzc0xpc3QuYWRkKCdmb2N1c2VkJyksIG51bGwpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMuaGVhZGVyPy5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyksIG51bGwpKTtcblxuXHRcdHRoaXMudXBkYXRlSGVhZGVyKCk7XG5cblx0XHRjb25zdCBldmVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBvbktleURvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLmhlYWRlciwgJ2tleWRvd24nKSk7XG5cdFx0Y29uc3Qgb25IZWFkZXJLZXlEb3duID0gRXZlbnQubWFwKG9uS2V5RG93bi5ldmVudCwgZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpLCBldmVudERpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihvbkhlYWRlcktleURvd24sIGUgPT4gZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSwgZXZlbnREaXNwb3NhYmxlcykoKCkgPT4gdGhpcy5zZXRFeHBhbmRlZCghdGhpcy5pc0V4cGFuZGVkKCkpLCBudWxsKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIob25IZWFkZXJLZXlEb3duLCBlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5MZWZ0QXJyb3csIGV2ZW50RGlzcG9zYWJsZXMpKCgpID0+IHRoaXMuc2V0RXhwYW5kZWQoZmFsc2UpLCBudWxsKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIob25IZWFkZXJLZXlEb3duLCBlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93LCBldmVudERpc3Bvc2FibGVzKSgoKSA9PiB0aGlzLnNldEV4cGFuZGVkKHRydWUpLCBudWxsKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLmhlYWRlcikpO1xuXG5cdFx0Y29uc3QgaGVhZGVyID0gdGhpcy5oZWFkZXI7XG5cdFx0W0V2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXS5mb3JFYWNoKGV2ZW50VHlwZSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVhZGVyLCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoIWUuZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0RXhwYW5kZWQoIXRoaXMuaXNFeHBhbmRlZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5ib2R5ID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLnBhbmUtYm9keScpKTtcblxuXHRcdC8vIE9ubHkgcmVuZGVyIHRoZSBib2R5IGlmIGl0IHdpbGwgYmUgdmlzaWJsZVxuXHRcdC8vIE90aGVyd2lzZSwgcmVuZGVyIGl0IHdoZW4gdGhlIHBhbmUgaXMgZXhwYW5kZWRcblx0XHRpZiAoIXRoaXMuX2JvZHlSZW5kZXJlZCAmJiB0aGlzLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0dGhpcy5yZW5kZXJCb2R5KHRoaXMuYm9keSk7XG5cdFx0XHR0aGlzLl9ib2R5UmVuZGVyZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdHRoaXMuYm9keS5yZW1vdmUoKTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaGVhZGVyU2l6ZSA9IHRoaXMuaGVhZGVyU2l6ZTtcblxuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fb3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gdGhpcy5vcnRob2dvbmFsU2l6ZSA6IHNpemU7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5fb3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gc2l6ZSAtIGhlYWRlclNpemUgOiB0aGlzLm9ydGhvZ29uYWxTaXplIC0gaGVhZGVyU2l6ZTtcblxuXHRcdGlmICh0aGlzLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0dGhpcy5ib2R5LmNsYXNzTGlzdC50b2dnbGUoJ3dpZGUnLCB3aWR0aCA+PSA2MDApO1xuXHRcdFx0dGhpcy5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdFx0dGhpcy5leHBhbmRlZFNpemUgPSBzaXplO1xuXHRcdH1cblx0fVxuXG5cdHN0eWxlKHN0eWxlczogSVBhbmVTdHlsZXMpOiB2b2lkIHtcblx0XHR0aGlzLnN0eWxlcyA9IHN0eWxlcztcblxuXHRcdGlmICghdGhpcy5oZWFkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUhlYWRlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUhlYWRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGVhZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4cGFuZGVkID0gIXRoaXMuaGVhZGVyVmlzaWJsZSB8fCB0aGlzLmlzRXhwYW5kZWQoKTtcblxuXHRcdGlmICh0aGlzLmNvbGxhcHNpYmxlKSB7XG5cdFx0XHR0aGlzLmhlYWRlci5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRcdHRoaXMuaGVhZGVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5oZWFkZXIucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuXHRcdFx0dGhpcy5oZWFkZXIucmVtb3ZlQXR0cmlidXRlKCdyb2xlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5oZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXRoaXMuaGVhZGVyVmlzaWJsZSk7XG5cdFx0dGhpcy5oZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCBleHBhbmRlZCk7XG5cdFx0dGhpcy5oZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbm90LWNvbGxhcHNpYmxlJywgIXRoaXMuY29sbGFwc2libGUpO1xuXHRcdHRoaXMuaGVhZGVyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyhleHBhbmRlZCkpO1xuXG5cdFx0dGhpcy5oZWFkZXIuc3R5bGUuY29sb3IgPSB0aGlzLmNvbGxhcHNpYmxlID8gdGhpcy5zdHlsZXMuaGVhZGVyRm9yZWdyb3VuZCA/PyAnJyA6ICcnO1xuXHRcdHRoaXMuaGVhZGVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICh0aGlzLmNvbGxhcHNpYmxlID8gdGhpcy5zdHlsZXMuaGVhZGVyQmFja2dyb3VuZCA6ICd0cmFuc3BhcmVudCcpID8/ICcnO1xuXHRcdHRoaXMuaGVhZGVyLnN0eWxlLmJvcmRlclRvcCA9IHRoaXMuc3R5bGVzLmhlYWRlckJvcmRlciAmJiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IGAxcHggc29saWQgJHt0aGlzLnN0eWxlcy5oZWFkZXJCb3JkZXJ9YCA6ICcnO1xuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJMZWZ0ID0gdGhpcy5zdHlsZXMubGVmdEJvcmRlciAmJiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gYDFweCBzb2xpZCAke3RoaXMuc3R5bGVzLmxlZnRCb3JkZXJ9YCA6ICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlbmRlckhlYWRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElEbmRDb250ZXh0IHtcblx0ZHJhZ2dhYmxlOiBQYW5lRHJhZ2dhYmxlIHwgbnVsbDtcbn1cblxuY2xhc3MgUGFuZURyYWdnYWJsZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERlZmF1bHREcmFnT3ZlckJhY2tncm91bmRDb2xvciA9IG5ldyBDb2xvcihuZXcgUkdCQSgxMjgsIDEyOCwgMTI4LCAwLjUpKTtcblxuXHRwcml2YXRlIGRyYWdPdmVyQ291bnRlciA9IDA7IC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQ0NzBcblxuXHRwcml2YXRlIF9vbkRpZERyb3AgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGZyb206IFBhbmU7IHRvOiBQYW5lIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZERyb3AgPSB0aGlzLl9vbkRpZERyb3AuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBwYW5lOiBQYW5lLCBwcml2YXRlIGRuZDogSVBhbmVEbmRDb250cm9sbGVyLCBwcml2YXRlIGNvbnRleHQ6IElEbmRDb250ZXh0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHBhbmUuZHJhZ2dhYmxlRWxlbWVudCEuZHJhZ2dhYmxlID0gdHJ1ZTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFuZS5kcmFnZ2FibGVFbGVtZW50ISwgJ2RyYWdzdGFydCcsIGUgPT4gdGhpcy5vbkRyYWdTdGFydChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYW5lLmRyb3BUYXJnZXRFbGVtZW50LCAnZHJhZ2VudGVyJywgZSA9PiB0aGlzLm9uRHJhZ0VudGVyKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhbmUuZHJvcFRhcmdldEVsZW1lbnQsICdkcmFnbGVhdmUnLCBlID0+IHRoaXMub25EcmFnTGVhdmUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFuZS5kcm9wVGFyZ2V0RWxlbWVudCwgJ2RyYWdlbmQnLCBlID0+IHRoaXMub25EcmFnRW5kKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhbmUuZHJvcFRhcmdldEVsZW1lbnQsICdkcm9wJywgZSA9PiB0aGlzLm9uRHJvcChlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdTdGFydChlOiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZG5kLmNhbkRyYWcodGhpcy5wYW5lKSB8fCAhZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLnBhbmUuZHJhZ2dhYmxlRWxlbWVudD8udGV4dENvbnRlbnQgfHwgJyc7XG5cblx0XHRlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuXG5cdFx0aWYgKGlzRmlyZWZveCkge1xuXHRcdFx0Ly8gRmlyZWZveDogcmVxdWlyZXMgdG8gc2V0IGEgdGV4dCBkYXRhIHRyYW5zZmVyIHRvIGdldCBnb2luZ1xuXHRcdFx0ZS5kYXRhVHJhbnNmZXI/LnNldERhdGEoRGF0YVRyYW5zZmVycy5URVhULCBsYWJlbCk7XG5cdFx0fVxuXG5cdFx0YXBwbHlEcmFnSW1hZ2UoZSwgdGhpcy5wYW5lLmVsZW1lbnQsIGxhYmVsKTtcblxuXHRcdHRoaXMuY29udGV4dC5kcmFnZ2FibGUgPSB0aGlzO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdFbnRlcihlOiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dC5kcmFnZ2FibGUgfHwgdGhpcy5jb250ZXh0LmRyYWdnYWJsZSA9PT0gdGhpcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5kbmQuY2FuRHJvcCh0aGlzLmNvbnRleHQuZHJhZ2dhYmxlLnBhbmUsIHRoaXMucGFuZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRyYWdPdmVyQ291bnRlcisrO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRHJhZ0xlYXZlKGU6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZXh0LmRyYWdnYWJsZSB8fCB0aGlzLmNvbnRleHQuZHJhZ2dhYmxlID09PSB0aGlzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmRuZC5jYW5Ecm9wKHRoaXMuY29udGV4dC5kcmFnZ2FibGUucGFuZSwgdGhpcy5wYW5lKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZHJhZ092ZXJDb3VudGVyLS07XG5cblx0XHRpZiAodGhpcy5kcmFnT3ZlckNvdW50ZXIgPT09IDApIHtcblx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdFbmQoZTogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRleHQuZHJhZ2dhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kcmFnT3ZlckNvdW50ZXIgPSAwO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5jb250ZXh0LmRyYWdnYWJsZSA9IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIG9uRHJvcChlOiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dC5kcmFnZ2FibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0dGhpcy5kcmFnT3ZlckNvdW50ZXIgPSAwO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cblx0XHRpZiAodGhpcy5kbmQuY2FuRHJvcCh0aGlzLmNvbnRleHQuZHJhZ2dhYmxlLnBhbmUsIHRoaXMucGFuZSkgJiYgdGhpcy5jb250ZXh0LmRyYWdnYWJsZSAhPT0gdGhpcykge1xuXHRcdFx0dGhpcy5fb25EaWREcm9wLmZpcmUoeyBmcm9tOiB0aGlzLmNvbnRleHQuZHJhZ2dhYmxlLnBhbmUsIHRvOiB0aGlzLnBhbmUgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0LmRyYWdnYWJsZSA9IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHRsZXQgYmFja2dyb3VuZENvbG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmICh0aGlzLmRyYWdPdmVyQ291bnRlciA+IDApIHtcblx0XHRcdGJhY2tncm91bmRDb2xvciA9IHRoaXMucGFuZS5kcm9wQmFja2dyb3VuZCA/PyBQYW5lRHJhZ2dhYmxlLkRlZmF1bHREcmFnT3ZlckJhY2tncm91bmRDb2xvci50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdHRoaXMucGFuZS5kcm9wVGFyZ2V0RWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiYWNrZ3JvdW5kQ29sb3IgfHwgJyc7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFuZURuZENvbnRyb2xsZXIge1xuXHRjYW5EcmFnKHBhbmU6IFBhbmUpOiBib29sZWFuO1xuXHRjYW5Ecm9wKHBhbmU6IFBhbmUsIG92ZXJQYW5lOiBQYW5lKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRQYW5lRG5kQ29udHJvbGxlciBpbXBsZW1lbnRzIElQYW5lRG5kQ29udHJvbGxlciB7XG5cblx0Y2FuRHJhZyhwYW5lOiBQYW5lKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRjYW5Ecm9wKHBhbmU6IFBhbmUsIG92ZXJQYW5lOiBQYW5lKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFuZVZpZXdPcHRpb25zIHtcblx0ZG5kPzogSVBhbmVEbmRDb250cm9sbGVyO1xuXHRvcmllbnRhdGlvbj86IE9yaWVudGF0aW9uO1xufVxuXG5pbnRlcmZhY2UgSVBhbmVJdGVtIHtcblx0cGFuZTogUGFuZTtcblx0ZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBjbGFzcyBQYW5lVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZG5kOiBJUGFuZURuZENvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZG5kQ29udGV4dDogSURuZENvbnRleHQgPSB7IGRyYWdnYWJsZTogbnVsbCB9O1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBwYW5lSXRlbXM6IElQYW5lSXRlbVtdID0gW107XG5cdHByaXZhdGUgb3J0aG9nb25hbFNpemU6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc2l6ZTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBzcGxpdHZpZXc6IFNwbGl0Vmlldztcblx0cHJpdmF0ZSBhbmltYXRpb25UaW1lcjogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkRHJvcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZnJvbTogUGFuZTsgdG86IFBhbmUgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRHJvcDogRXZlbnQ8eyBmcm9tOiBQYW5lOyB0bzogUGFuZSB9PiA9IHRoaXMuX29uRGlkRHJvcC5ldmVudDtcblxuXHRvcmllbnRhdGlvbjogT3JpZW50YXRpb247XG5cdHByaXZhdGUgYm91bmRhcnlTYXNoZXM6IElCb3VuZGFyeVNhc2hlcyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRTYXNoQ2hhbmdlOiBFdmVudDxudW1iZXI+O1xuXHRyZWFkb25seSBvbkRpZFNhc2hSZXNldDogRXZlbnQ8bnVtYmVyPjtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGw6IEV2ZW50PFNjcm9sbEV2ZW50PjtcblxuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJUGFuZVZpZXdPcHRpb25zID0ge30pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kbmQgPSBvcHRpb25zLmRuZDtcblx0XHR0aGlzLm9yaWVudGF0aW9uID0gb3B0aW9ucy5vcmllbnRhdGlvbiA/PyBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9uYWNvLXBhbmUtdmlldycpKTtcblx0XHR0aGlzLnNwbGl0dmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTcGxpdFZpZXcodGhpcy5lbGVtZW50LCB7IG9yaWVudGF0aW9uOiB0aGlzLm9yaWVudGF0aW9uIH0pKTtcblx0XHR0aGlzLm9uRGlkU2FzaFJlc2V0ID0gdGhpcy5zcGxpdHZpZXcub25EaWRTYXNoUmVzZXQ7XG5cdFx0dGhpcy5vbkRpZFNhc2hDaGFuZ2UgPSB0aGlzLnNwbGl0dmlldy5vbkRpZFNhc2hDaGFuZ2U7XG5cdFx0dGhpcy5vbkRpZFNjcm9sbCA9IHRoaXMuc3BsaXR2aWV3Lm9uRGlkU2Nyb2xsO1xuXG5cdFx0Y29uc3QgZXZlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgb25LZXlEb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy5lbGVtZW50LCAna2V5ZG93bicpKTtcblx0XHRjb25zdCBvbkhlYWRlcktleURvd24gPSBFdmVudC5tYXAoRXZlbnQuZmlsdGVyKG9uS2V5RG93bi5ldmVudCwgZSA9PiBpc0hUTUxFbGVtZW50KGUudGFyZ2V0KSAmJiBlLnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3BhbmUtaGVhZGVyJyksIGV2ZW50RGlzcG9zYWJsZXMpLCBlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSksIGV2ZW50RGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKG9uSGVhZGVyS2V5RG93biwgZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdywgZXZlbnREaXNwb3NhYmxlcykoKCkgPT4gdGhpcy5mb2N1c1ByZXZpb3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIob25IZWFkZXJLZXlEb3duLCBlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3csIGV2ZW50RGlzcG9zYWJsZXMpKCgpID0+IHRoaXMuZm9jdXNOZXh0KCkpKTtcblx0fVxuXG5cdGFkZFBhbmUocGFuZTogUGFuZSwgc2l6ZTogbnVtYmVyLCBpbmRleCA9IHRoaXMuc3BsaXR2aWV3Lmxlbmd0aCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHBhbmUub25EaWRDaGFuZ2VFeHBhbnNpb25TdGF0ZSh0aGlzLnNldHVwQW5pbWF0aW9uLCB0aGlzLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBwYW5lSXRlbSA9IHsgcGFuZTogcGFuZSwgZGlzcG9zYWJsZTogZGlzcG9zYWJsZXMgfTtcblx0XHR0aGlzLnBhbmVJdGVtcy5zcGxpY2UoaW5kZXgsIDAsIHBhbmVJdGVtKTtcblx0XHRwYW5lLm9yaWVudGF0aW9uID0gdGhpcy5vcmllbnRhdGlvbjtcblx0XHRwYW5lLm9ydGhvZ29uYWxTaXplID0gdGhpcy5vcnRob2dvbmFsU2l6ZTtcblx0XHR0aGlzLnNwbGl0dmlldy5hZGRWaWV3KHBhbmUsIHNpemUsIGluZGV4KTtcblxuXHRcdGlmICh0aGlzLmRuZCkge1xuXHRcdFx0Y29uc3QgZHJhZ2dhYmxlID0gbmV3IFBhbmVEcmFnZ2FibGUocGFuZSwgdGhpcy5kbmQsIHRoaXMuZG5kQ29udGV4dCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZHJhZ2dhYmxlKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkcmFnZ2FibGUub25EaWREcm9wKHRoaXMuX29uRGlkRHJvcC5maXJlLCB0aGlzLl9vbkRpZERyb3ApKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVQYW5lKHBhbmU6IFBhbmUpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMucGFuZUl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0ucGFuZSA9PT0gcGFuZSk7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpdHZpZXcucmVtb3ZlVmlldyhpbmRleCwgcGFuZS5pc0V4cGFuZGVkKCkgPyBTaXppbmcuRGlzdHJpYnV0ZSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcGFuZUl0ZW0gPSB0aGlzLnBhbmVJdGVtcy5zcGxpY2UoaW5kZXgsIDEpWzBdO1xuXHRcdHBhbmVJdGVtLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0bW92ZVBhbmUoZnJvbTogUGFuZSwgdG86IFBhbmUpOiB2b2lkIHtcblx0XHRjb25zdCBmcm9tSW5kZXggPSB0aGlzLnBhbmVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnBhbmUgPT09IGZyb20pO1xuXHRcdGNvbnN0IHRvSW5kZXggPSB0aGlzLnBhbmVJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnBhbmUgPT09IHRvKTtcblxuXHRcdGlmIChmcm9tSW5kZXggPT09IC0xIHx8IHRvSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3BhbmVJdGVtXSA9IHRoaXMucGFuZUl0ZW1zLnNwbGljZShmcm9tSW5kZXgsIDEpO1xuXHRcdHRoaXMucGFuZUl0ZW1zLnNwbGljZSh0b0luZGV4LCAwLCBwYW5lSXRlbSk7XG5cblx0XHR0aGlzLnNwbGl0dmlldy5tb3ZlVmlldyhmcm9tSW5kZXgsIHRvSW5kZXgpO1xuXHR9XG5cblx0cmVzaXplUGFuZShwYW5lOiBQYW5lLCBzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMucGFuZUl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0ucGFuZSA9PT0gcGFuZSk7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpdHZpZXcucmVzaXplVmlldyhpbmRleCwgc2l6ZSk7XG5cdH1cblxuXHRnZXRQYW5lU2l6ZShwYW5lOiBQYW5lKTogbnVtYmVyIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMucGFuZUl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0ucGFuZSA9PT0gcGFuZSk7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc3BsaXR2aWV3LmdldFZpZXdTaXplKGluZGV4KTtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMub3J0aG9nb25hbFNpemUgPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IHdpZHRoIDogaGVpZ2h0O1xuXHRcdHRoaXMuc2l6ZSA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB3aWR0aCA6IGhlaWdodDtcblxuXHRcdGZvciAoY29uc3QgcGFuZUl0ZW0gb2YgdGhpcy5wYW5lSXRlbXMpIHtcblx0XHRcdHBhbmVJdGVtLnBhbmUub3J0aG9nb25hbFNpemUgPSB0aGlzLm9ydGhvZ29uYWxTaXplO1xuXHRcdH1cblxuXHRcdHRoaXMuc3BsaXR2aWV3LmxheW91dCh0aGlzLnNpemUpO1xuXHR9XG5cblx0c2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpIHtcblx0XHR0aGlzLmJvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXHRcdHRoaXMudXBkYXRlU3BsaXR2aWV3T3J0aG9nb25hbFNhc2hlcyhzYXNoZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTcGxpdHZpZXdPcnRob2dvbmFsU2FzaGVzKHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHR0aGlzLnNwbGl0dmlldy5vcnRob2dvbmFsU3RhcnRTYXNoID0gc2FzaGVzPy5sZWZ0O1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcub3J0aG9nb25hbEVuZFNhc2ggPSBzYXNoZXM/LnJpZ2h0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNwbGl0dmlldy5vcnRob2dvbmFsRW5kU2FzaCA9IHNhc2hlcz8uYm90dG9tO1xuXHRcdH1cblx0fVxuXG5cdGZsaXBPcmllbnRhdGlvbihoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMub3JpZW50YXRpb24gPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRjb25zdCBwYW5lU2l6ZXMgPSB0aGlzLnBhbmVJdGVtcy5tYXAocGFuZSA9PiB0aGlzLmdldFBhbmVTaXplKHBhbmUucGFuZSkpO1xuXG5cdFx0dGhpcy5zcGxpdHZpZXcuZGlzcG9zZSgpO1xuXHRcdGNsZWFyTm9kZSh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5zcGxpdHZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3BsaXRWaWV3KHRoaXMuZWxlbWVudCwgeyBvcmllbnRhdGlvbjogdGhpcy5vcmllbnRhdGlvbiB9KSk7XG5cdFx0dGhpcy51cGRhdGVTcGxpdHZpZXdPcnRob2dvbmFsU2FzaGVzKHRoaXMuYm91bmRhcnlTYXNoZXMpO1xuXG5cdFx0Y29uc3QgbmV3T3J0aG9nb25hbFNpemUgPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IHdpZHRoIDogaGVpZ2h0O1xuXHRcdGNvbnN0IG5ld1NpemUgPSB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gd2lkdGggOiBoZWlnaHQ7XG5cblx0XHR0aGlzLnBhbmVJdGVtcy5mb3JFYWNoKChwYW5lLCBpbmRleCkgPT4ge1xuXHRcdFx0cGFuZS5wYW5lLm9ydGhvZ29uYWxTaXplID0gbmV3T3J0aG9nb25hbFNpemU7XG5cdFx0XHRwYW5lLnBhbmUub3JpZW50YXRpb24gPSB0aGlzLm9yaWVudGF0aW9uO1xuXG5cdFx0XHRjb25zdCB2aWV3U2l6ZSA9IHRoaXMuc2l6ZSA9PT0gMCA/IDAgOiAobmV3U2l6ZSAqIHBhbmVTaXplc1tpbmRleF0pIC8gdGhpcy5zaXplO1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcuYWRkVmlldyhwYW5lLnBhbmUsIHZpZXdTaXplLCBpbmRleCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNpemUgPSBuZXdTaXplO1xuXHRcdHRoaXMub3J0aG9nb25hbFNpemUgPSBuZXdPcnRob2dvbmFsU2l6ZTtcblxuXHRcdHRoaXMuc3BsaXR2aWV3LmxheW91dCh0aGlzLnNpemUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cEFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuYW5pbWF0aW9uVGltZXIgPT09ICdudW1iZXInKSB7XG5cdFx0XHRnZXRXaW5kb3codGhpcy5lbGVtZW50KS5jbGVhclRpbWVvdXQodGhpcy5hbmltYXRpb25UaW1lcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2FuaW1hdGVkJyk7XG5cblx0XHR0aGlzLmFuaW1hdGlvblRpbWVyID0gZ2V0V2luZG93KHRoaXMuZWxlbWVudCkuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmFuaW1hdGlvblRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2FuaW1hdGVkJyk7XG5cdFx0fSwgMjAwKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGFuZUhlYWRlckVsZW1lbnRzKCk6IEhUTUxFbGVtZW50W10ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdHJldHVybiBbLi4udGhpcy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wYW5lLWhlYWRlcicpXSBhcyBIVE1MRWxlbWVudFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c1ByZXZpb3VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhlYWRlcnMgPSB0aGlzLmdldFBhbmVIZWFkZXJFbGVtZW50cygpO1xuXHRcdGNvbnN0IGluZGV4ID0gaGVhZGVycy5pbmRleE9mKHRoaXMuZWxlbWVudC5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGhlYWRlcnNbTWF0aC5tYXgoaW5kZXggLSAxLCAwKV0uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNOZXh0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGhlYWRlcnMgPSB0aGlzLmdldFBhbmVIZWFkZXJFbGVtZW50cygpO1xuXHRcdGNvbnN0IGluZGV4ID0gaGVhZGVycy5pbmRleE9mKHRoaXMuZWxlbWVudC5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGhlYWRlcnNbTWF0aC5taW4oaW5kZXggKyAxLCBoZWFkZXJzLmxlbmd0aCAtIDEpXS5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLnBhbmVJdGVtcy5mb3JFYWNoKGkgPT4gaS5kaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsR0FBRyx1QkFBdUIs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
