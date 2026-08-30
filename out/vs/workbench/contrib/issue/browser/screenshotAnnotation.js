import { $, addDisposableListener, append, EventType, getWindow } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
var AnnotationTool = /* @__PURE__ */ ((AnnotationTool2) => {
  AnnotationTool2["Select"] = "select";
  AnnotationTool2["Freehand"] = "freehand";
  AnnotationTool2["Rectangle"] = "rectangle";
  AnnotationTool2["Ellipse"] = "ellipse";
  AnnotationTool2["Arrow"] = "arrow";
  AnnotationTool2["Text"] = "text";
  AnnotationTool2["Eraser"] = "eraser";
  AnnotationTool2["Pan"] = "pan";
  AnnotationTool2["Crop"] = "crop";
  AnnotationTool2["Move"] = "move";
  return AnnotationTool2;
})(AnnotationTool || {});
const COLORS = [
  "#ff3b30",
  // red
  "#007aff",
  // blue
  "#34c759",
  // green
  "#ffcc00",
  // yellow
  "#000000",
  // black
  "#ffffff"
  // white
];
const LIGHT_SWATCH_COLORS = /* @__PURE__ */ new Set(["#34c759", "#ffcc00", "#ffffff", "transparent"]);
const FONT_FAMILIES = [
  { label: "Sans-serif", value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: "Monospace", value: '"Cascadia Code", "Fira Code", Consolas, monospace' },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' }
];
const DEFAULT_TEXT_BOX_WIDTH = 240;
const MIN_TEXT_BOX_WIDTH = 48;
const TEXT_DRAG_THRESHOLD = 4;
const CANVAS_BREATHING_ROOM = 64;
const FILL_COLORS = ["transparent", ...COLORS];
const STROKE_WIDTHS = [2, 4, 8, 12];
const TEXT_SIZES = [14, 18, 24, 32, 48];
function cloneDrawAction(action, identityMap = /* @__PURE__ */ new Map()) {
  const existing = identityMap.get(action);
  if (existing) {
    return existing;
  }
  const clone = {
    type: action.type,
    strokeColor: action.strokeColor,
    fillColor: action.fillColor,
    opacity: action.opacity,
    lineWidth: action.lineWidth,
    fontSize: action.fontSize,
    fontFamily: action.fontFamily,
    points: action.points ? action.points.map((p) => ({ x: p.x, y: p.y })) : void 0,
    rect: action.rect ? { ...action.rect } : void 0,
    ellipseRect: action.ellipseRect ? { ...action.ellipseRect } : void 0,
    arrowStart: action.arrowStart ? { ...action.arrowStart } : void 0,
    arrowEnd: action.arrowEnd ? { ...action.arrowEnd } : void 0,
    text: action.text,
    textPos: action.textPos ? { ...action.textPos } : void 0,
    textWidth: action.textWidth,
    cropFrom: action.cropFrom === void 0 ? void 0 : action.cropFrom === null ? null : { ...action.cropFrom },
    cropTo: action.cropTo === void 0 ? void 0 : action.cropTo === null ? null : { ...action.cropTo },
    moveBefore: action.moveBefore ? cloneMoveSnapshot(action.moveBefore) : void 0,
    moveAfter: action.moveAfter ? cloneMoveSnapshot(action.moveAfter) : void 0
  };
  identityMap.set(action, clone);
  clone.erasedActions = action.erasedActions ? action.erasedActions.map((a) => cloneDrawAction(a, identityMap)) : void 0;
  clone.erasedIndices = action.erasedIndices ? action.erasedIndices.slice() : void 0;
  clone.moveTarget = action.moveTarget ? cloneDrawAction(action.moveTarget, identityMap) : void 0;
  return clone;
}
function cloneMoveSnapshot(s) {
  return {
    points: s.points ? s.points.map((p) => ({ x: p.x, y: p.y })) : void 0,
    rect: s.rect ? { ...s.rect } : void 0,
    ellipseRect: s.ellipseRect ? { ...s.ellipseRect } : void 0,
    arrowStart: s.arrowStart ? { ...s.arrowStart } : void 0,
    arrowEnd: s.arrowEnd ? { ...s.arrowEnd } : void 0,
    textPos: s.textPos ? { ...s.textPos } : void 0,
    textWidth: s.textWidth
  };
}
function captureMoveSnapshot(action) {
  return cloneMoveSnapshot({
    points: action.points,
    rect: action.rect,
    ellipseRect: action.ellipseRect,
    arrowStart: action.arrowStart,
    arrowEnd: action.arrowEnd,
    textPos: action.textPos,
    textWidth: action.textWidth
  });
}
function applyMoveSnapshot(action, snapshot) {
  const fresh = cloneMoveSnapshot(snapshot);
  action.points = fresh.points;
  action.rect = fresh.rect;
  action.ellipseRect = fresh.ellipseRect;
  action.arrowStart = fresh.arrowStart;
  action.arrowEnd = fresh.arrowEnd;
  action.textPos = fresh.textPos;
  action.textWidth = fresh.textWidth;
}
function moveSnapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
class ScreenshotAnnotationEditor {
  constructor(screenshot, parentElement, initialState) {
    this.screenshot = screenshot;
    this.parentElement = parentElement;
    this.initialState = initialState;
    this.disposables = new DisposableStore();
    this.toolOptionsDisposables = new DisposableStore();
    this._onDidSave = new Emitter();
    this.onDidSave = this._onDidSave.event;
    this._onDidCancel = new Emitter();
    this.onDidCancel = this._onDidCancel.event;
    this.activeTool = "freehand" /* Freehand */;
    this.activeStrokeColor = COLORS[0];
    this.activeFillColor = "transparent";
    this.activeLineWidth = 4;
    this.activeOpacity = 1;
    this.actions = [];
    this.undoneActions = [];
    this.currentAction = null;
    this.isDrawing = false;
    this.isErasing = false;
    /** Actions erased during the current pointer drag; committed to undo stack on pointer-up. */
    this.pendingEraseActions = [];
    /** Original index (in `actions[]`) of each entry in `pendingEraseActions`, captured at the moment it was removed. */
    this.pendingEraseIndices = [];
    this.imageElement = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.scale = 1;
    // Pan & zoom
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = { x: 0, y: 0 };
    // Crop with handles
    this.cropMode = false;
    this.cropRegion = null;
    this.cropDragHandle = null;
    this.cropDragStart = { x: 0, y: 0 };
    this.cropRegionStart = null;
    this.hasUserZoomed = false;
    /** Pending wheel-zoom delta accumulated across rapid wheel events; flushed on rAF. */
    this.pendingZoom = null;
    this.pendingZoomRaf = 0;
    // Original image preserved so crops can be expanded back
    this.originalImage = null;
    // Current crop region in original-image coords (null = no crop applied)
    this.currentCrop = null;
    // Pre-crop state restored on Cancel
    this.preCropState = null;
    this.mainToolbar = null;
    this.cropToolbar = null;
    // Selection (Select tool)
    this.selectedActionIndex = -1;
    this.isDraggingSelected = false;
    this.isResizingSelectedText = false;
    this.dragStart = { x: 0, y: 0 };
    this.selectedTextResizeStartWidth = DEFAULT_TEXT_BOX_WIDTH;
    /** Captured at the start of a Select-tool drag/resize so a Move sentinel can be committed on pointer-up. */
    this.pendingMove = null;
    // Text configuration
    this.activeFontSize = 18;
    this.activeFontFamily = FONT_FAMILIES[0].value;
    this.textPlacementState = null;
    this.textEditState = null;
    this.textEditor = null;
    this.textCaretVisible = true;
    this.textCaretInterval = null;
    // Tool buttons (for active state management)
    this.toolButtons = [];
    this.undoBtn = null;
    this.redoBtn = null;
    this.toolOptionsPopover = null;
    this.createUI();
    this.loadImage();
  }
  /** Annotations are stored in original-image coords. While in crop mode the canvas already shows the original image, so the offset is 0. */
  get cropOffsetX() {
    return this.cropMode ? 0 : this.currentCrop?.x ?? 0;
  }
  get cropOffsetY() {
    return this.cropMode ? 0 : this.currentCrop?.y ?? 0;
  }
  createUI() {
    this.container = append(this.parentElement, $("div.issue-reporter-annotation-overlay"));
    this.container.tabIndex = -1;
    const toolbar = append(this.container, $("div.annotation-toolbar"));
    this.mainToolbar = toolbar;
    const drawingTools = [
      { tool: "select" /* Select */, label: localize("select", "Select / Move"), icon: renderIcon(Codicon.inspect) },
      { tool: "pan" /* Pan */, label: localize("pan", "Pan"), icon: renderIcon(Codicon.move) }
    ];
    for (const { tool, label, icon } of drawingTools) {
      this.addToolButton(toolbar, tool, label, icon);
    }
    const cropBtn = append(toolbar, $("button.tool-btn.crop-btn"));
    cropBtn.appendChild(renderIcon(Codicon.screenCut));
    cropBtn.title = localize("crop", "Crop");
    cropBtn.setAttribute("aria-label", localize("crop", "Crop"));
    this.toolButtons.push({ element: cropBtn, tool: "crop" /* Crop */ });
    this.disposables.add(addDisposableListener(cropBtn, EventType.CLICK, () => {
      this.setActiveTool("crop" /* Crop */);
    }));
    const moreDrawingTools = [
      { tool: "freehand" /* Freehand */, label: localize("freehand", "Draw"), icon: renderIcon(Codicon.edit) },
      { tool: "rectangle" /* Rectangle */, label: localize("rectangle", "Rectangle"), icon: renderIcon(Codicon.primitiveSquare) },
      { tool: "ellipse" /* Ellipse */, label: localize("ellipse", "Ellipse"), icon: renderIcon(Codicon.circle) },
      { tool: "arrow" /* Arrow */, label: localize("arrow", "Arrow"), icon: renderIcon(Codicon.arrowRight) },
      { tool: "eraser" /* Eraser */, label: localize("eraser", "Eraser"), icon: renderIcon(Codicon.eraser) }
    ];
    for (const { tool, label, icon } of moreDrawingTools) {
      this.addToolButton(toolbar, tool, label, icon);
    }
    this.addToolButton(toolbar, "text" /* Text */, localize("text", "Text"), renderIcon(Codicon.symbolString));
    this.toolOptionsPopover = append(this.container, $("div.annotation-tool-options-popover"));
    this.toolOptionsPopover.style.display = "none";
    this.disposables.add(addDisposableListener(this.container, EventType.CLICK, (e) => {
      if (!this.toolOptionsPopover || this.toolOptionsPopover.style.display === "none") {
        return;
      }
      const target = e.target;
      if (!this.toolOptionsPopover.contains(target) && !this.toolButtons.some((button) => button.element.contains(target))) {
        this.hideToolOptions();
      }
    }));
    this.renderToolOptions();
    append(toolbar, $("div.toolbar-separator"));
    const undoBtn = append(toolbar, $("button.tool-btn"));
    undoBtn.appendChild(renderIcon(Codicon.discard));
    undoBtn.title = localize("undo", "Undo");
    undoBtn.setAttribute("aria-label", localize("undo", "Undo"));
    this.disposables.add(addDisposableListener(undoBtn, EventType.CLICK, () => this.undo()));
    this.undoBtn = undoBtn;
    const redoBtn = append(toolbar, $("button.tool-btn"));
    redoBtn.appendChild(renderIcon(Codicon.redo));
    redoBtn.title = localize("redo", "Redo");
    redoBtn.setAttribute("aria-label", localize("redo", "Redo"));
    this.disposables.add(addDisposableListener(redoBtn, EventType.CLICK, () => this.redo()));
    this.redoBtn = redoBtn;
    this.updateUndoRedoState();
    append(toolbar, $("div.toolbar-separator"));
    const discardBtn = this.disposables.add(new Button(toolbar, { ...defaultButtonStyles, secondary: true }));
    discardBtn.label = localize("discard", "Discard");
    this.disposables.add(discardBtn.onDidClick(() => {
      this.cancelTextEdit();
      this._onDidCancel.fire();
      this.dispose();
    }));
    const saveBtn = this.disposables.add(new Button(toolbar, defaultButtonStyles));
    saveBtn.label = localize("save", "Save");
    this.disposables.add(saveBtn.onDidClick(() => {
      this.commitTextEdit();
      const dataUrl = this.compositeToDataUrl();
      this._onDidSave.fire({ dataUrl, state: this.captureState() });
      this.dispose();
    }));
    const cropToolbar = append(this.container, $("div.annotation-toolbar.annotation-crop-toolbar"));
    cropToolbar.style.display = "none";
    this.cropToolbar = cropToolbar;
    const cropCancelBtn = this.disposables.add(new Button(cropToolbar, { ...defaultButtonStyles, secondary: true }));
    cropCancelBtn.label = localize("cancel", "Cancel");
    this.disposables.add(cropCancelBtn.onDidClick(() => {
      this.cancelCrop();
    }));
    const cropApplyBtn = this.disposables.add(new Button(cropToolbar, defaultButtonStyles));
    cropApplyBtn.label = localize("apply", "Apply");
    this.disposables.add(cropApplyBtn.onDidClick(() => {
      this.commitCrop();
    }));
    const hint = append(this.container, $("div.annotation-hint"));
    hint.textContent = localize("annotationHint", "Edit screenshot to highlight the problem");
    const canvasContainer = append(this.container, $("div.annotation-canvas-container"));
    this.canvas = append(canvasContainer, $("canvas"));
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D canvas context");
    }
    this.ctx = ctx;
    this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_DOWN, (e) => this.onPointerDown(e)));
    this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_MOVE, (e) => this.onPointerMove(e)));
    this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_UP, (e) => this.onPointerUp(e)));
    this.disposables.add(addDisposableListener(this.canvas, EventType.DBLCLICK, () => {
      this.commitCrop();
    }));
    this.disposables.add(addDisposableListener(canvasContainer, EventType.WHEEL, (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        const factor = delta < 0 ? 1.1 : 0.9;
        const containerRect = canvasContainer.getBoundingClientRect();
        const cx = e.clientX - (containerRect.left + containerRect.width / 2);
        const cy = e.clientY - (containerRect.top + containerRect.height / 2);
        if (this.pendingZoom) {
          this.pendingZoom.factor *= factor;
          this.pendingZoom.cx = cx;
          this.pendingZoom.cy = cy;
        } else {
          this.pendingZoom = { factor, cx, cy };
        }
        if (!this.pendingZoomRaf) {
          const targetWindow = getWindow(this.canvas);
          this.pendingZoomRaf = targetWindow.requestAnimationFrame(() => {
            this.pendingZoomRaf = 0;
            this.flushPendingZoom();
          });
        }
      } else {
        this.panX -= e.deltaX;
        this.panY -= e.deltaY;
        this.clampPan();
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
      }
    }, { passive: false }));
    this.disposables.add(addDisposableListener(this.container, EventType.KEY_DOWN, (e) => {
      if (this.textEditState) {
        return;
      }
      if (this.textPlacementState && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.cancelTextPlacement();
        return;
      }
      if (e.key === "Escape") {
        if (this.cropMode) {
          e.preventDefault();
          e.stopPropagation();
          this.cancelCrop();
          return;
        }
        if (this.selectedActionIndex >= 0) {
          this.selectedActionIndex = -1;
          this.redraw();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._onDidCancel.fire();
        this.dispose();
      } else if (e.key === "Enter" && this.cropMode) {
        e.preventDefault();
        this.commitCrop();
      } else if ((e.key === "Delete" || e.key === "Backspace") && this.selectedActionIndex >= 0) {
        e.preventDefault();
        const removedIndex = this.selectedActionIndex;
        const [removed] = this.actions.splice(removedIndex, 1);
        this.selectedActionIndex = -1;
        this.actions.push({
          type: "eraser" /* Eraser */,
          strokeColor: "",
          opacity: 1,
          lineWidth: 0,
          erasedActions: [removed],
          erasedIndices: [removedIndex]
        });
        this.undoneActions.length = 0;
        this.updateUndoRedoState();
        this.redraw();
      }
    }));
    const resizeObserver = new ResizeObserver(() => {
      if (this.imageElement) {
        if (this.hasUserZoomed) {
          const minScale = this.getFitScale();
          if (this.scale < minScale) {
            this.scale = minScale;
          }
        }
        this.sizeCanvas();
        this.clampPan();
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
        this.redraw();
      }
    });
    resizeObserver.observe(canvasContainer);
    this.disposables.add({ dispose: () => resizeObserver.disconnect() });
  }
  addToolButton(toolbar, tool, label, icon) {
    const btn = append(toolbar, $("button.tool-btn"));
    btn.appendChild(icon);
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", String(tool === this.activeTool));
    if (tool === this.activeTool) {
      btn.classList.add("active");
    }
    this.toolButtons.push({ element: btn, tool });
    this.disposables.add(addDisposableListener(btn, EventType.CLICK, (e) => {
      e.stopPropagation();
      this.setActiveTool(tool);
    }));
  }
  renderToolOptions() {
    if (!this.toolOptionsPopover) {
      return;
    }
    this.toolOptionsDisposables.clear();
    this.toolOptionsPopover.textContent = "";
    this.toolOptionsPopover.setAttribute("role", "group");
    this.toolOptionsPopover.setAttribute("aria-label", localize("toolOptions", "Tool Options"));
    this.appendColorOptions(
      this.toolOptionsPopover,
      this.activeTool === "text" /* Text */ ? localize("textColor", "Text Color") : localize("strokeColor", "Stroke Color"),
      COLORS,
      this.activeStrokeColor,
      localize("setStrokeColor", "Set Stroke Color"),
      (color) => {
        this.activeStrokeColor = color;
        this.applyToolOptionsToTextEdit();
      }
    );
    if (this.activeTool !== "freehand" /* Freehand */ && this.activeTool !== "arrow" /* Arrow */) {
      this.appendColorOptions(
        this.toolOptionsPopover,
        this.activeTool === "text" /* Text */ ? localize("textBackgroundColor", "Background Color") : localize("fillColor", "Fill Color"),
        FILL_COLORS,
        this.activeFillColor,
        localize("setFillColor", "Set Fill Color"),
        (color) => {
          this.activeFillColor = color;
          this.applyToolOptionsToTextEdit();
        }
      );
    }
    this.appendSizeOptions(this.toolOptionsPopover);
    this.appendOpacityOptions(this.toolOptionsPopover);
  }
  appendColorOptions(container, label, colors, selectedColor, ariaLabelPrefix, onSelect) {
    const group = append(container, $("div.annotation-tool-options-group"));
    append(group, $("span.annotation-tool-options-label")).textContent = label;
    const swatches = append(group, $("div.annotation-color-swatches"));
    for (const color of colors) {
      const swatch = append(swatches, $("button.annotation-color-swatch"));
      const isTransparent = color === "transparent";
      swatch.classList.toggle("transparent", isTransparent);
      swatch.classList.toggle("light-swatch", LIGHT_SWATCH_COLORS.has(color));
      swatch.style.backgroundColor = isTransparent ? "transparent" : color;
      swatch.setAttribute("aria-label", isTransparent ? localize("transparentColor", "{0}: Transparent", ariaLabelPrefix) : localize("colorValue", "{0}: {1}", ariaLabelPrefix, color));
      swatch.setAttribute("aria-pressed", String(color === selectedColor));
      swatch.classList.toggle("active", color === selectedColor);
      this.toolOptionsDisposables.add(addDisposableListener(swatch, EventType.CLICK, (e) => {
        e.stopPropagation();
        onSelect(color);
        this.renderToolOptions();
        this.redraw();
      }));
    }
  }
  appendSizeOptions(container) {
    const isText = this.activeTool === "text" /* Text */;
    const values = isText ? TEXT_SIZES : STROKE_WIDTHS;
    const selectedValue = isText ? this.activeFontSize : this.activeLineWidth;
    const group = append(container, $("div.annotation-tool-options-group"));
    append(group, $("span.annotation-tool-options-label")).textContent = isText ? localize("textSize", "Text Size") : localize("strokeWidth", "Stroke Width");
    const buttons = append(group, $("div.annotation-size-buttons"));
    for (const value of values) {
      const button = append(buttons, $("button.annotation-size-button"));
      button.textContent = `${value}`;
      button.setAttribute("aria-label", isText ? localize("setTextSize", "Set Text Size to {0}px", value) : localize("setStrokeWidth", "Set Stroke Width to {0}px", value));
      button.setAttribute("aria-pressed", String(value === selectedValue));
      button.classList.toggle("active", value === selectedValue);
      this.toolOptionsDisposables.add(addDisposableListener(button, EventType.CLICK, (e) => {
        e.stopPropagation();
        if (isText) {
          this.activeFontSize = value;
        } else {
          this.activeLineWidth = value;
        }
        this.applyToolOptionsToTextEdit();
        this.renderToolOptions();
        this.redraw();
      }));
    }
  }
  appendOpacityOptions(container) {
    const group = append(container, $("div.annotation-tool-options-group.annotation-opacity-options"));
    const label = append(group, $("label.annotation-tool-options-label"));
    label.textContent = localize("opacity", "Opacity");
    const input = append(group, $("input.annotation-opacity-slider"));
    input.type = "range";
    input.min = "20";
    input.max = "100";
    input.step = "10";
    input.value = `${Math.round(this.activeOpacity * 100)}`;
    input.setAttribute("aria-label", localize("setOpacity", "Set Opacity"));
    const value = append(group, $("span.annotation-opacity-value"));
    value.textContent = `${input.value}%`;
    this.toolOptionsDisposables.add(addDisposableListener(input, EventType.INPUT, (e) => {
      e.stopPropagation();
      this.activeOpacity = Number(input.value) / 100;
      value.textContent = `${input.value}%`;
      this.applyToolOptionsToTextEdit();
      this.redraw();
    }));
  }
  applyToolOptionsToTextEdit() {
    if (!this.textEditState) {
      return;
    }
    this.textEditState.strokeColor = this.activeStrokeColor;
    this.textEditState.fillColor = this.activeFillColor;
    this.textEditState.opacity = this.activeOpacity;
    this.textEditState.fontSize = this.activeFontSize;
  }
  showToolOptions(anchor) {
    if (!this.toolOptionsPopover || !this.hasToolOptions(this.activeTool)) {
      this.hideToolOptions();
      return;
    }
    this.renderToolOptions();
    const containerRect = this.container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    this.toolOptionsPopover.style.top = `${anchorRect.bottom - containerRect.top + 6}px`;
    this.toolOptionsPopover.style.display = "flex";
    const halfWidth = this.toolOptionsPopover.offsetWidth / 2;
    const desiredLeft = anchorRect.left + anchorRect.width / 2 - containerRect.left;
    const minLeft = halfWidth + 8;
    const maxLeft = Math.max(minLeft, containerRect.width - halfWidth - 8);
    this.toolOptionsPopover.style.left = `${Math.min(Math.max(desiredLeft, minLeft), maxLeft)}px`;
  }
  hideToolOptions() {
    if (this.toolOptionsPopover) {
      this.toolOptionsPopover.style.display = "none";
    }
  }
  hasToolOptions(tool) {
    return tool === "freehand" /* Freehand */ || tool === "rectangle" /* Rectangle */ || tool === "ellipse" /* Ellipse */ || tool === "arrow" /* Arrow */ || tool === "text" /* Text */;
  }
  setActiveTool(tool) {
    if (this.textEditState && tool !== "text" /* Text */) {
      this.commitTextEdit();
    }
    if (this.textPlacementState && tool !== "text" /* Text */) {
      this.cancelTextPlacement();
    }
    if (tool === "crop" /* Crop */) {
      this.hideToolOptions();
      this.enterCropMode();
      return;
    }
    this.activeTool = tool;
    this.selectedActionIndex = -1;
    for (const tb of this.toolButtons) {
      tb.element.classList.toggle("active", tb.tool === tool);
      tb.element.setAttribute("aria-pressed", String(tb.tool === tool));
    }
    const activeToolButton = this.toolButtons.find((tb) => tb.tool === tool)?.element;
    if (activeToolButton && this.hasToolOptions(tool)) {
      this.showToolOptions(activeToolButton);
    } else {
      this.hideToolOptions();
    }
    this.canvas.style.cursor = tool === "select" /* Select */ ? "default" : tool === "pan" /* Pan */ ? "grab" : tool === "eraser" /* Eraser */ ? `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewport='0 0 24 24'><circle cx='12' cy='12' r='9' fill='none' stroke='%23fff' stroke-width='2'/><circle cx='12' cy='12' r='9' fill='none' stroke='%23000' stroke-width='1' stroke-dasharray='2 2'/></svg>") 12 12, cell` : "crosshair";
    this.redraw();
  }
  enterCropMode() {
    if (this.cropMode || !this.originalImage) {
      return;
    }
    this.preCropState = {
      element: this.imageElement,
      width: this.imageWidth,
      height: this.imageHeight,
      currentCrop: this.currentCrop
    };
    this.imageElement = this.originalImage.element;
    this.imageWidth = this.originalImage.width;
    this.imageHeight = this.originalImage.height;
    this.cropRegion = this.currentCrop ? { ...this.currentCrop } : { x: 0, y: 0, width: this.originalImage.width, height: this.originalImage.height };
    this.cropMode = true;
    for (const tb of this.toolButtons) {
      tb.element.classList.toggle("active", tb.tool === "crop" /* Crop */);
    }
    if (this.mainToolbar) {
      this.mainToolbar.style.display = "none";
    }
    if (this.cropToolbar) {
      this.cropToolbar.style.display = "";
    }
    this.hasUserZoomed = false;
    this.panX = 0;
    this.panY = 0;
    this.canvas.style.transform = "";
    this.canvas.style.cursor = "default";
    this.sizeCanvas();
    this.redraw();
  }
  exitCropMode() {
    this.cropMode = false;
    this.cropRegion = null;
    this.cropDragHandle = null;
    this.cropRegionStart = null;
    this.preCropState = null;
    if (this.mainToolbar) {
      this.mainToolbar.style.display = "";
    }
    if (this.cropToolbar) {
      this.cropToolbar.style.display = "none";
    }
    this.setActiveTool(this.activeTool);
  }
  commitCrop() {
    if (!this.cropMode || !this.cropRegion || !this.originalImage) {
      return;
    }
    const cr = this.normalizeCropRect(this.cropRegion);
    if (cr.width < 10 || cr.height < 10) {
      return;
    }
    const cropFrom = this.preCropState?.currentCrop ?? null;
    const cropAction = {
      type: "crop" /* Crop */,
      strokeColor: "",
      opacity: 1,
      lineWidth: 0,
      cropFrom,
      cropTo: cr
    };
    this.actions.push(cropAction);
    this.undoneActions.length = 0;
    this.updateUndoRedoState();
    this.hasUserZoomed = false;
    this.panX = 0;
    this.panY = 0;
    this.canvas.style.transform = "";
    this.exitCropMode();
    this.applyDisplayedCrop(cr);
  }
  cancelCrop() {
    if (!this.cropMode || !this.preCropState) {
      this.exitCropMode();
      return;
    }
    this.imageElement = this.preCropState.element;
    this.imageWidth = this.preCropState.width;
    this.imageHeight = this.preCropState.height;
    this.currentCrop = this.preCropState.currentCrop;
    this.hasUserZoomed = false;
    this.panX = 0;
    this.panY = 0;
    this.canvas.style.transform = "";
    this.exitCropMode();
    this.sizeCanvas();
    this.redraw();
  }
  loadImage() {
    const img = mainWindow.document.createElement("img");
    img.onload = () => {
      this.imageElement = img;
      this.imageWidth = img.naturalWidth;
      this.imageHeight = img.naturalHeight;
      this.originalImage = { element: img, width: img.naturalWidth, height: img.naturalHeight };
      this.currentCrop = null;
      if (this.initialState && (this.initialState.actions.length || this.initialState.undoneActions.length)) {
        const identityMap = /* @__PURE__ */ new Map();
        this.actions.push(...this.initialState.actions.map((a) => cloneDrawAction(a, identityMap)));
        this.undoneActions.push(...this.initialState.undoneActions.map((a) => cloneDrawAction(a, identityMap)));
        this.updateUndoRedoState();
      }
      this.applyDisplayedCrop(this.initialState?.crop ?? null);
    };
    img.src = this.screenshot.dataUrl;
  }
  /**
   * Update the displayed image to reflect the given crop (or the full original
   * when null). Cropped images are re-rasterized from the preserved original so
   * undo/redo of crop actions is fully reversible without keeping intermediate
   * image elements around.
   */
  applyDisplayedCrop(crop) {
    if (!this.originalImage) {
      return;
    }
    if (!crop) {
      this.imageElement = this.originalImage.element;
      this.imageWidth = this.originalImage.width;
      this.imageHeight = this.originalImage.height;
      this.currentCrop = null;
      this.sizeCanvas();
      this.redraw();
      return;
    }
    const cr = {
      x: Math.max(0, Math.min(this.originalImage.width, crop.x)),
      y: Math.max(0, Math.min(this.originalImage.height, crop.y)),
      width: Math.max(1, Math.min(this.originalImage.width - Math.max(0, crop.x), crop.width)),
      height: Math.max(1, Math.min(this.originalImage.height - Math.max(0, crop.y), crop.height))
    };
    const cropCanvas = mainWindow.document.createElement("canvas");
    cropCanvas.width = cr.width;
    cropCanvas.height = cr.height;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(this.originalImage.element, cr.x, cr.y, cr.width, cr.height, 0, 0, cr.width, cr.height);
    const croppedImg = mainWindow.document.createElement("img");
    croppedImg.onload = () => {
      this.imageElement = croppedImg;
      this.imageWidth = croppedImg.naturalWidth;
      this.imageHeight = croppedImg.naturalHeight;
      this.currentCrop = cr;
      this.sizeCanvas();
      this.redraw();
    };
    croppedImg.src = cropCanvas.toDataURL("image/png");
  }
  captureState() {
    const identityMap = /* @__PURE__ */ new Map();
    return {
      actions: this.actions.map((a) => cloneDrawAction(a, identityMap)),
      undoneActions: this.undoneActions.map((a) => cloneDrawAction(a, identityMap)),
      crop: this.currentCrop ? { ...this.currentCrop } : null
    };
  }
  sizeCanvas() {
    const container = this.canvas.parentElement;
    if (!container) {
      return;
    }
    const targetWindow = getWindow(this.canvas);
    const dpr = targetWindow.devicePixelRatio || 1;
    const maxWidth = container.clientWidth - CANVAS_BREATHING_ROOM * 2;
    const maxHeight = container.clientHeight - CANVAS_BREATHING_ROOM * 2;
    if (!this.hasUserZoomed) {
      const scaleX = maxWidth / this.imageWidth;
      const scaleY = maxHeight / this.imageHeight;
      this.scale = Math.min(scaleX, scaleY, 1);
    }
    const displayWidth = Math.floor(this.imageWidth * this.scale);
    const displayHeight = Math.floor(this.imageHeight * this.scale);
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
    const MAX_BACKING_DIM = 4096;
    const naturalW = displayWidth * dpr;
    const naturalH = displayHeight * dpr;
    const overage = Math.max(1, naturalW / MAX_BACKING_DIM, naturalH / MAX_BACKING_DIM);
    const effectiveDpr = dpr / overage;
    this.canvas.width = Math.max(1, Math.floor(displayWidth * effectiveDpr));
    this.canvas.height = Math.max(1, Math.floor(displayHeight * effectiveDpr));
    this.ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
  }
  canvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.scale + this.cropOffsetX,
      y: (e.clientY - rect.top) / this.scale + this.cropOffsetY
    };
  }
  onPointerDown(e) {
    const pos = this.canvasCoords(e);
    if (this.cropMode && this.cropRegion) {
      const handle = this.cropHandleHitTest(pos);
      if (handle) {
        this.cropDragHandle = handle;
        this.cropDragStart = pos;
        this.cropRegionStart = { ...this.cropRegion };
        this.canvas.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (this.activeTool === "select" /* Select */) {
      const hitIndex = this.hitTest(pos);
      this.selectedActionIndex = hitIndex;
      if (hitIndex >= 0) {
        const hitAction = this.actions[hitIndex];
        this.pendingMove = { target: hitAction, before: captureMoveSnapshot(hitAction) };
        if (hitAction.type === "text" /* Text */ && this.isNearTextResizeHandle(pos, hitAction)) {
          this.isResizingSelectedText = true;
          this.dragStart = { x: pos.x, y: pos.y };
          this.selectedTextResizeStartWidth = hitAction.textWidth ?? DEFAULT_TEXT_BOX_WIDTH;
          this.canvas.setPointerCapture(e.pointerId);
          this.canvas.style.cursor = "ew-resize";
        } else {
          this.isDraggingSelected = true;
          this.dragStart = { x: pos.x, y: pos.y };
          this.canvas.setPointerCapture(e.pointerId);
          this.canvas.style.cursor = "move";
        }
      }
      this.redraw();
      return;
    }
    this.selectedActionIndex = -1;
    if (this.activeTool === "text" /* Text */) {
      this.commitTextEdit();
      this.textPlacementState = {
        start: pos,
        current: pos,
        pointerId: e.pointerId
      };
      this.canvas.setPointerCapture(e.pointerId);
      this.redraw();
      return;
    }
    if (this.activeTool === "eraser" /* Eraser */) {
      this.isErasing = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.eraseAt(pos);
      return;
    }
    if (this.activeTool === "pan" /* Pan */) {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = "grabbing";
      return;
    }
    this.isDrawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    switch (this.activeTool) {
      case "freehand" /* Freehand */:
        this.currentAction = {
          type: "freehand" /* Freehand */,
          strokeColor: this.activeStrokeColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          points: [pos]
        };
        break;
      case "rectangle" /* Rectangle */:
        this.currentAction = {
          type: "rectangle" /* Rectangle */,
          strokeColor: this.activeStrokeColor,
          fillColor: this.activeFillColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          rect: { x: pos.x, y: pos.y, width: 0, height: 0 }
        };
        break;
      case "ellipse" /* Ellipse */:
        this.currentAction = {
          type: "ellipse" /* Ellipse */,
          strokeColor: this.activeStrokeColor,
          fillColor: this.activeFillColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          ellipseRect: { x: pos.x, y: pos.y, width: 0, height: 0 }
        };
        break;
      case "arrow" /* Arrow */:
        this.currentAction = {
          type: "arrow" /* Arrow */,
          strokeColor: this.activeStrokeColor,
          opacity: this.activeOpacity,
          lineWidth: this.activeLineWidth,
          arrowStart: pos,
          arrowEnd: pos
        };
        break;
    }
  }
  onPointerMove(e) {
    if (this.cropMode) {
      const pos2 = this.canvasCoords(e);
      if (this.cropDragHandle && this.cropRegionStart) {
        this.updateCropRegion(pos2);
        this.redraw();
        return;
      }
      const handle = this.cropHandleHitTest(pos2);
      this.canvas.style.cursor = this.cropCursorFor(handle);
      return;
    }
    if (this.isResizingSelectedText && this.selectedActionIndex >= 0) {
      const pos2 = this.canvasCoords(e);
      const action = this.actions[this.selectedActionIndex];
      if (action.type === "text" /* Text */) {
        action.textWidth = Math.max(MIN_TEXT_BOX_WIDTH, this.selectedTextResizeStartWidth + (pos2.x - this.dragStart.x));
        this.redraw();
      }
      return;
    }
    if (this.isDraggingSelected && this.selectedActionIndex >= 0) {
      const pos2 = this.canvasCoords(e);
      const dx = pos2.x - this.dragStart.x;
      const dy = pos2.y - this.dragStart.y;
      this.moveAction(this.actions[this.selectedActionIndex], dx, dy);
      this.dragStart = { x: pos2.x, y: pos2.y };
      this.redraw();
      return;
    }
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.panX += dx;
      this.panY += dy;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.clampPan();
      this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
      return;
    }
    if (this.textPlacementState) {
      const pos2 = this.canvasCoords(e);
      this.textPlacementState.current = pos2;
      this.redraw();
      return;
    }
    if (this.isErasing) {
      const pos2 = this.canvasCoords(e);
      this.eraseAt(pos2);
      return;
    }
    if (this.activeTool === "select" /* Select */ && this.selectedActionIndex >= 0) {
      const pos2 = this.canvasCoords(e);
      const action = this.actions[this.selectedActionIndex];
      if (action.type === "text" /* Text */ && this.isNearTextResizeHandle(pos2, action)) {
        this.canvas.style.cursor = "ew-resize";
      } else if (this.selectedActionIndex >= 0) {
        this.canvas.style.cursor = "default";
      }
    }
    if (!this.isDrawing) {
      return;
    }
    const pos = this.canvasCoords(e);
    if (!this.currentAction) {
      return;
    }
    switch (this.currentAction.type) {
      case "freehand" /* Freehand */:
        this.currentAction.points.push(pos);
        break;
      case "rectangle" /* Rectangle */: {
        const rect = this.currentAction.rect;
        this.currentAction.rect = {
          ...rect,
          width: pos.x - rect.x,
          height: pos.y - rect.y
        };
        break;
      }
      case "ellipse" /* Ellipse */: {
        const er = this.currentAction.ellipseRect;
        let w = pos.x - er.x;
        let h = pos.y - er.y;
        if (e.shiftKey) {
          const size = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w) * size;
          h = Math.sign(h) * size;
        }
        this.currentAction.ellipseRect = { ...er, width: w, height: h };
        break;
      }
      case "arrow" /* Arrow */:
        this.currentAction.arrowEnd = pos;
        break;
    }
    this.redraw();
  }
  onPointerUp(e) {
    if (this.cropMode && this.cropDragHandle) {
      this.cropDragHandle = null;
      this.cropRegionStart = null;
      this.canvas.releasePointerCapture(e.pointerId);
      return;
    }
    if (this.isResizingSelectedText) {
      this.isResizingSelectedText = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = "default";
      this.commitPendingMove();
      return;
    }
    if (this.isDraggingSelected) {
      this.isDraggingSelected = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = "default";
      this.commitPendingMove();
      return;
    }
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = this.activeTool === "pan" /* Pan */ ? "grab" : "crosshair";
      return;
    }
    if (this.isErasing) {
      this.isErasing = false;
      this.canvas.releasePointerCapture(e.pointerId);
      if (this.pendingEraseActions.length > 0) {
        this.actions.push({
          type: "eraser" /* Eraser */,
          strokeColor: "",
          opacity: 1,
          lineWidth: 0,
          erasedActions: this.pendingEraseActions.slice(),
          erasedIndices: this.pendingEraseIndices.slice()
        });
        this.pendingEraseActions = [];
        this.pendingEraseIndices = [];
        this.undoneActions.length = 0;
        this.updateUndoRedoState();
      }
      return;
    }
    if (this.textPlacementState) {
      const { start, current, pointerId } = this.textPlacementState;
      if (pointerId === e.pointerId) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      const dx = current.x - start.x;
      const didDrag = Math.abs(dx) >= TEXT_DRAG_THRESHOLD;
      const x = didDrag ? Math.min(start.x, current.x) : start.x;
      const rawWidth = didDrag ? Math.abs(dx) : this.getMaxTextWidthFrom(start.x);
      const width = didDrag ? Math.max(1, Math.min(rawWidth, this.getTextImageRight() - x)) : rawWidth;
      const y = start.y;
      this.textPlacementState = null;
      this.startTextEdit({ x, y }, width, didDrag);
      return;
    }
    if (!this.isDrawing) {
      return;
    }
    this.canvas.releasePointerCapture(e.pointerId);
    this.isDrawing = false;
    if (this.currentAction) {
      this.actions.push(this.currentAction);
      this.undoneActions.length = 0;
      this.updateUndoRedoState();
      this.currentAction = null;
    }
    this.redraw();
  }
  eraseAt(pos) {
    const hitIndex = this.hitTest(pos);
    if (hitIndex < 0) {
      return;
    }
    const [erased] = this.actions.splice(hitIndex, 1);
    this.pendingEraseActions.push(erased);
    this.pendingEraseIndices.push(hitIndex);
    this.selectedActionIndex = -1;
    this.redraw();
  }
  commitPendingMove() {
    const pending = this.pendingMove;
    this.pendingMove = null;
    if (!pending) {
      return;
    }
    const after = captureMoveSnapshot(pending.target);
    if (moveSnapshotsEqual(pending.before, after)) {
      return;
    }
    this.actions.push({
      type: "move" /* Move */,
      strokeColor: "",
      opacity: 1,
      lineWidth: 0,
      moveTarget: pending.target,
      moveBefore: pending.before,
      moveAfter: after
    });
    this.undoneActions.length = 0;
    this.updateUndoRedoState();
  }
  updateUndoRedoState() {
    if (this.undoBtn) {
      this.undoBtn.disabled = this.actions.length === 0;
    }
    if (this.redoBtn) {
      this.redoBtn.disabled = this.undoneActions.length === 0;
    }
  }
  undo() {
    if (this.textPlacementState) {
      this.cancelTextPlacement();
      return;
    }
    if (this.textEditState) {
      this.cancelTextEdit();
      return;
    }
    const action = this.actions.pop();
    if (!action) {
      return;
    }
    if (action.type === "eraser" /* Eraser */ && action.erasedActions) {
      const erased = action.erasedActions;
      const indices = action.erasedIndices ?? erased.map(() => this.actions.length);
      for (let i = erased.length - 1; i >= 0; i--) {
        const idx = Math.min(indices[i], this.actions.length);
        this.actions.splice(idx, 0, erased[i]);
      }
    }
    this.undoneActions.push(action);
    this.updateUndoRedoState();
    this.selectedActionIndex = -1;
    if (action.type === "crop" /* Crop */) {
      this.applyDisplayedCrop(action.cropFrom ?? null);
    } else if (action.type === "move" /* Move */ && action.moveTarget && action.moveBefore) {
      applyMoveSnapshot(action.moveTarget, action.moveBefore);
      this.redraw();
    } else {
      this.redraw();
    }
  }
  redo() {
    if (this.textPlacementState) {
      return;
    }
    if (this.textEditState) {
      return;
    }
    const action = this.undoneActions.pop();
    if (!action) {
      return;
    }
    if (action.type === "eraser" /* Eraser */ && action.erasedActions) {
      for (const erased of action.erasedActions) {
        const idx = this.actions.indexOf(erased);
        if (idx >= 0) {
          this.actions.splice(idx, 1);
        }
      }
    }
    this.actions.push(action);
    this.selectedActionIndex = -1;
    this.updateUndoRedoState();
    if (action.type === "crop" /* Crop */) {
      this.applyDisplayedCrop(action.cropTo ?? null);
    } else if (action.type === "move" /* Move */ && action.moveTarget && action.moveAfter) {
      applyMoveSnapshot(action.moveTarget, action.moveAfter);
      this.redraw();
    } else {
      this.redraw();
    }
  }
  cropHandleHitTest(pos) {
    if (!this.cropRegion) {
      return null;
    }
    const r = this.normalizeCropRect(this.cropRegion);
    const handlePx = 12;
    const tol = handlePx / this.scale;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const handles = [
      { name: "nw", x: r.x, y: r.y },
      { name: "n", x: cx, y: r.y },
      { name: "ne", x: r.x + r.width, y: r.y },
      { name: "e", x: r.x + r.width, y: cy },
      { name: "se", x: r.x + r.width, y: r.y + r.height },
      { name: "s", x: cx, y: r.y + r.height },
      { name: "sw", x: r.x, y: r.y + r.height },
      { name: "w", x: r.x, y: cy }
    ];
    for (const h of handles) {
      if (Math.abs(pos.x - h.x) <= tol && Math.abs(pos.y - h.y) <= tol) {
        return h.name;
      }
    }
    if (pos.x >= r.x && pos.x <= r.x + r.width && pos.y >= r.y && pos.y <= r.y + r.height) {
      return "move";
    }
    return null;
  }
  cropCursorFor(handle) {
    switch (handle) {
      case "nw":
      case "se":
        return "nwse-resize";
      case "ne":
      case "sw":
        return "nesw-resize";
      case "n":
      case "s":
        return "ns-resize";
      case "e":
      case "w":
        return "ew-resize";
      case "move":
        return "move";
      default:
        return "default";
    }
  }
  updateCropRegion(pos) {
    if (!this.cropRegionStart || !this.cropDragHandle) {
      return;
    }
    const dx = pos.x - this.cropDragStart.x;
    const dy = pos.y - this.cropDragStart.y;
    const start = this.cropRegionStart;
    if (this.cropDragHandle === "move") {
      const x2 = Math.max(0, Math.min(this.imageWidth - start.width, start.x + dx));
      const y2 = Math.max(0, Math.min(this.imageHeight - start.height, start.y + dy));
      this.cropRegion = { x: x2, y: y2, width: start.width, height: start.height };
      return;
    }
    let { x, y, width, height } = start;
    switch (this.cropDragHandle) {
      case "nw":
        x += dx;
        y += dy;
        width -= dx;
        height -= dy;
        break;
      case "n":
        y += dy;
        height -= dy;
        break;
      case "ne":
        y += dy;
        width += dx;
        height -= dy;
        break;
      case "e":
        width += dx;
        break;
      case "se":
        width += dx;
        height += dy;
        break;
      case "s":
        height += dy;
        break;
      case "sw":
        x += dx;
        width -= dx;
        height += dy;
        break;
      case "w":
        x += dx;
        width -= dx;
        break;
    }
    x = Math.max(0, Math.min(this.imageWidth, x));
    y = Math.max(0, Math.min(this.imageHeight, y));
    width = Math.max(10, Math.min(this.imageWidth - x, width));
    height = Math.max(10, Math.min(this.imageHeight - y, height));
    this.cropRegion = { x, y, width, height };
  }
  normalizeCropRect(r) {
    return {
      x: r.width < 0 ? r.x + r.width : r.x,
      y: r.height < 0 ? r.y + r.height : r.y,
      width: Math.abs(r.width),
      height: Math.abs(r.height)
    };
  }
  startTextEdit(pos, width, showBoxOutline) {
    this.commitTextEdit();
    const editor = mainWindow.document.createElement("textarea");
    editor.setAttribute("aria-label", localize("typeText", "Type text"));
    editor.setAttribute("wrap", "off");
    editor.style.position = "fixed";
    editor.style.left = "-10000px";
    editor.style.top = "0";
    editor.style.width = "1px";
    editor.style.height = "1px";
    editor.style.opacity = "0";
    editor.style.pointerEvents = "none";
    editor.style.padding = "0";
    editor.style.border = "0";
    editor.style.margin = "0";
    editor.style.resize = "none";
    editor.style.overflow = "hidden";
    this.container.appendChild(editor);
    this.textEditState = {
      pos,
      text: "",
      caretIndex: 0,
      strokeColor: this.activeStrokeColor,
      fillColor: this.activeFillColor,
      opacity: this.activeOpacity,
      fontSize: this.activeFontSize,
      fontFamily: this.activeFontFamily,
      width,
      showBoxOutline
    };
    this.textEditor = editor;
    this.startTextCaretBlink();
    const sync = () => {
      if (!this.textEditState || this.textEditor !== editor) {
        return;
      }
      this.textEditState.text = editor.value;
      this.textEditState.caretIndex = editor.selectionStart ?? editor.value.length;
      this.textCaretVisible = true;
      this.redraw();
    };
    editor.addEventListener("input", sync);
    editor.addEventListener("keyup", sync);
    editor.addEventListener("click", sync);
    editor.addEventListener("select", sync);
    editor.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.commitTextEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelTextEdit();
      }
    });
    editor.addEventListener("blur", () => {
      if (this.textEditor === editor) {
        this.commitTextEdit();
      }
    });
    setTimeout(() => {
      if (this.textEditor === editor) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }, 0);
    this.redraw();
  }
  startTextCaretBlink() {
    if (this.textCaretInterval !== null) {
      getWindow(this.container).clearInterval(this.textCaretInterval);
    }
    this.textCaretVisible = true;
    this.textCaretInterval = getWindow(this.container).setInterval(() => {
      if (!this.textEditState) {
        return;
      }
      this.textCaretVisible = !this.textCaretVisible;
      this.redraw();
    }, 500);
  }
  stopTextCaretBlink() {
    if (this.textCaretInterval !== null) {
      getWindow(this.container).clearInterval(this.textCaretInterval);
      this.textCaretInterval = null;
    }
    this.textCaretVisible = true;
  }
  commitTextEdit() {
    if (!this.textEditState) {
      return;
    }
    const { text, pos, strokeColor, fillColor, opacity, fontFamily, fontSize, width } = this.textEditState;
    this.cleanupTextEditor();
    if (text.trim()) {
      this.actions.push({
        type: "text" /* Text */,
        strokeColor,
        fillColor,
        opacity,
        lineWidth: 1,
        fontSize,
        fontFamily,
        text,
        textPos: pos,
        textWidth: width
      });
      this.undoneActions.length = 0;
      this.updateUndoRedoState();
    }
    this.redraw();
  }
  cancelTextEdit() {
    if (!this.textEditState) {
      return;
    }
    this.cleanupTextEditor();
    this.redraw();
  }
  cancelTextPlacement() {
    if (!this.textPlacementState) {
      return;
    }
    if (this.canvas.hasPointerCapture(this.textPlacementState.pointerId)) {
      this.canvas.releasePointerCapture(this.textPlacementState.pointerId);
    }
    this.textPlacementState = null;
    this.redraw();
  }
  getTextImageRight() {
    return this.cropOffsetX + this.imageWidth;
  }
  getMaxTextWidthFrom(startX) {
    return Math.max(1, this.getTextImageRight() - startX);
  }
  cleanupTextEditor() {
    this.stopTextCaretBlink();
    this.textEditor?.remove();
    this.textEditor = null;
    this.textEditState = null;
    this.container.focus();
  }
  redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.imageElement) {
      this.ctx.drawImage(this.imageElement, 0, 0, this.imageWidth * this.scale, this.imageHeight * this.scale);
    }
    this.ctx.save();
    this.ctx.translate(-this.cropOffsetX * this.scale, -this.cropOffsetY * this.scale);
    for (const action of this.actions) {
      this.drawAction(action);
    }
    if (this.selectedActionIndex >= 0 && this.selectedActionIndex < this.actions.length) {
      this.drawSelectionHighlight(this.actions[this.selectedActionIndex]);
    }
    if (this.currentAction) {
      this.drawAction(this.currentAction);
    }
    if (this.textEditState) {
      this.drawTextEditState();
    }
    if (this.textPlacementState) {
      this.drawTextPlacementState();
    }
    this.ctx.restore();
    if (this.cropMode && this.cropRegion) {
      const r = this.normalizeCropRect(this.cropRegion);
      const dpr = getWindow(this.canvas).devicePixelRatio || 1;
      const cw = this.canvas.width / dpr;
      const ch = this.canvas.height / dpr;
      const rx = r.x * this.scale;
      const ry = r.y * this.scale;
      const rw = r.width * this.scale;
      const rh = r.height * this.scale;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      this.ctx.fillRect(0, 0, cw, ry);
      this.ctx.fillRect(0, ry + rh, cw, ch - (ry + rh));
      this.ctx.fillRect(0, ry, rx, rh);
      this.ctx.fillRect(rx + rw, ry, cw - (rx + rw), rh);
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(rx, ry, rw, rh);
      const handleSize = 10;
      const half = handleSize / 2;
      const handles = [
        { x: rx, y: ry },
        // nw
        { x: rx + rw / 2, y: ry },
        // n
        { x: rx + rw, y: ry },
        // ne
        { x: rx + rw, y: ry + rh / 2 },
        // e
        { x: rx + rw, y: ry + rh },
        // se
        { x: rx + rw / 2, y: ry + rh },
        // s
        { x: rx, y: ry + rh },
        // sw
        { x: rx, y: ry + rh / 2 }
        // w
      ];
      this.ctx.fillStyle = "#ffffff";
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = 1;
      for (const h of handles) {
        this.ctx.fillRect(h.x - half, h.y - half, handleSize, handleSize);
        this.ctx.strokeRect(h.x - half, h.y - half, handleSize, handleSize);
      }
      this.ctx.restore();
    }
  }
  drawAction(action) {
    if (action.type === "eraser" /* Eraser */ || action.type === "crop" /* Crop */ || action.type === "move" /* Move */) {
      return;
    }
    this.ctx.save();
    const fillColor = action.fillColor ?? "transparent";
    this.ctx.globalAlpha = action.opacity;
    this.ctx.strokeStyle = action.strokeColor;
    this.ctx.fillStyle = this.isTransparent(fillColor) ? action.strokeColor : fillColor;
    this.ctx.lineWidth = action.lineWidth * this.scale;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points && action.points.length > 0) {
          this.ctx.beginPath();
          this.ctx.moveTo(action.points[0].x * this.scale, action.points[0].y * this.scale);
          for (let i = 1; i < action.points.length; i++) {
            this.ctx.lineTo(action.points[i].x * this.scale, action.points[i].y * this.scale);
          }
          this.ctx.stroke();
        }
        break;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          if (!this.isTransparent(fillColor)) {
            this.ctx.fillRect(
              action.rect.x * this.scale,
              action.rect.y * this.scale,
              action.rect.width * this.scale,
              action.rect.height * this.scale
            );
          }
          this.ctx.strokeRect(
            action.rect.x * this.scale,
            action.rect.y * this.scale,
            action.rect.width * this.scale,
            action.rect.height * this.scale
          );
        }
        break;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          const r = action.ellipseRect;
          const cx = (r.x + r.width / 2) * this.scale;
          const cy = (r.y + r.height / 2) * this.scale;
          const rx = Math.abs(r.width / 2) * this.scale;
          const ry = Math.abs(r.height / 2) * this.scale;
          this.ctx.beginPath();
          this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (!this.isTransparent(fillColor)) {
            this.ctx.fill();
          }
          this.ctx.stroke();
        }
        break;
      case "arrow" /* Arrow */:
        if (action.arrowStart && action.arrowEnd) {
          this.drawArrow(
            action.arrowStart.x * this.scale,
            action.arrowStart.y * this.scale,
            action.arrowEnd.x * this.scale,
            action.arrowEnd.y * this.scale
          );
        }
        break;
      case "text" /* Text */:
        if (action.text && action.textPos) {
          const fontSize = (action.fontSize || 16) * this.scale;
          const fontFamily = action.fontFamily || "sans-serif";
          const width = (action.textWidth ?? DEFAULT_TEXT_BOX_WIDTH) * this.scale;
          this.ctx.font = `${fontSize}px ${fontFamily}`;
          this.ctx.textBaseline = "alphabetic";
          if (!this.isTransparent(fillColor)) {
            const layout = this.measureWrappedText(action.text, width, fontSize, fontFamily);
            this.ctx.fillRect(
              action.textPos.x * this.scale,
              action.textPos.y * this.scale - fontSize,
              width,
              Math.max(layout.height, fontSize * 1.2)
            );
          }
          this.ctx.fillStyle = action.strokeColor;
          this.drawWrappedText(action.text, action.textPos.x * this.scale, action.textPos.y * this.scale, width, fontSize, fontFamily);
        }
        break;
    }
    this.ctx.restore();
  }
  drawTextEditState() {
    if (!this.textEditState) {
      return;
    }
    const { pos, text, strokeColor, fillColor, opacity, fontFamily, fontSize, caretIndex, width, showBoxOutline } = this.textEditState;
    const scaledFontSize = fontSize * this.scale;
    const scaledWidth = width * this.scale;
    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    this.ctx.fillStyle = strokeColor;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = Math.max(1, this.scale);
    this.ctx.font = `${scaledFontSize}px ${fontFamily}`;
    this.ctx.textBaseline = "alphabetic";
    if (!this.isTransparent(fillColor)) {
      const layout2 = this.measureWrappedText(text, scaledWidth, scaledFontSize, fontFamily);
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(
        pos.x * this.scale,
        pos.y * this.scale - scaledFontSize,
        scaledWidth,
        Math.max(layout2.height, scaledFontSize * 1.2)
      );
      this.ctx.fillStyle = strokeColor;
    }
    const layout = this.drawWrappedText(text, pos.x * this.scale, pos.y * this.scale, scaledWidth, scaledFontSize, fontFamily);
    if (showBoxOutline) {
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      this.ctx.strokeRect(
        pos.x * this.scale,
        pos.y * this.scale - scaledFontSize,
        scaledWidth,
        Math.max(layout.height, scaledFontSize * 1.2)
      );
      this.ctx.setLineDash([]);
    }
    if (this.textCaretVisible) {
      const caret = this.getTextCaretMetrics(text, caretIndex, scaledWidth, scaledFontSize, fontFamily);
      const caretX = pos.x * this.scale + caret.x;
      const baselineY = pos.y * this.scale + caret.baselineOffsetY;
      this.ctx.beginPath();
      this.ctx.moveTo(caretX, baselineY - scaledFontSize);
      this.ctx.lineTo(caretX, baselineY + Math.max(2, this.scale));
      this.ctx.stroke();
    }
    this.ctx.restore();
  }
  isTransparent(color) {
    return color === "transparent";
  }
  drawTextPlacementState() {
    if (!this.textPlacementState) {
      return;
    }
    const { start, current } = this.textPlacementState;
    const dx = current.x - start.x;
    const didDrag = Math.abs(dx) >= TEXT_DRAG_THRESHOLD;
    if (!didDrag) {
      return;
    }
    const x = Math.min(start.x, current.x);
    const width = Math.max(1, Math.min(Math.abs(dx), this.getTextImageRight() - x));
    const y = (start.y - this.activeFontSize) * this.scale;
    const height = this.activeFontSize * this.scale * 1.2;
    this.ctx.save();
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.lineWidth = Math.max(1, this.scale);
    this.ctx.strokeRect(x * this.scale, y, width * this.scale, height);
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }
  drawWrappedText(text, x, baselineY, maxWidth, fontSize, fontFamily) {
    const layout = this.measureWrappedText(text, maxWidth, fontSize, fontFamily);
    const lineHeight = layout.lineHeight;
    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i];
      this.ctx.fillText(line.text, x, baselineY + i * lineHeight);
    }
    return {
      width: layout.width,
      height: layout.height,
      lineHeight
    };
  }
  getTextCaretMetrics(text, caretIndex, maxWidth, fontSize, fontFamily) {
    const layout = this.measureWrappedText(text, maxWidth, fontSize, fontFamily);
    const line = [...layout.lines].reverse().find((candidate) => candidate.startIndex <= caretIndex) ?? layout.lines[0];
    const safeCaretIndex = Math.min(Math.max(caretIndex, line.startIndex), line.endIndex);
    const beforeCaret = line.text.slice(0, safeCaretIndex - line.startIndex);
    this.ctx.save();
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    const x = this.ctx.measureText(beforeCaret).width;
    this.ctx.restore();
    return {
      x,
      baselineOffsetY: line.lineIndex * layout.lineHeight
    };
  }
  measureWrappedText(text, maxWidth, fontSize, fontFamily) {
    this.ctx.save();
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    const lineHeight = fontSize * 1.2;
    const lines = [];
    const paragraphs = text.split("\n");
    let globalIndex = 0;
    let lineIndex = 0;
    let maxLineWidth = 0;
    for (let p = 0; p < paragraphs.length; p++) {
      const paragraph = paragraphs[p];
      const paragraphStart = globalIndex;
      const paragraphEnd = paragraphStart + paragraph.length;
      if (paragraph.length === 0) {
        lines.push({ text: "", startIndex: paragraphStart, endIndex: paragraphStart, lineIndex });
        lineIndex++;
      } else {
        let lineStart = paragraphStart;
        while (lineStart < paragraphEnd) {
          let bestEnd = lineStart + 1;
          let lastWhitespaceBreak = -1;
          for (let i = lineStart + 1; i <= paragraphEnd; i++) {
            const candidate = text.slice(lineStart, i);
            if (this.ctx.measureText(candidate).width <= maxWidth) {
              bestEnd = i;
              if (/\s/.test(text[i - 1])) {
                lastWhitespaceBreak = i;
              }
            } else {
              break;
            }
          }
          let lineEnd = bestEnd;
          if (bestEnd < paragraphEnd && lastWhitespaceBreak > lineStart) {
            lineEnd = lastWhitespaceBreak;
          }
          if (lineEnd <= lineStart) {
            lineEnd = lineStart + 1;
          }
          const rawLineText = text.slice(lineStart, lineEnd);
          const lineText = rawLineText.replace(/\s+$/u, "");
          lines.push({ text: lineText, startIndex: lineStart, endIndex: lineEnd, lineIndex });
          maxLineWidth = Math.max(maxLineWidth, this.ctx.measureText(lineText).width);
          lineIndex++;
          lineStart = lineEnd;
          while (lineStart < paragraphEnd && /\s/u.test(text[lineStart])) {
            lineStart++;
          }
        }
      }
      globalIndex = paragraphEnd + 1;
    }
    if (lines.length === 0) {
      lines.push({ text: "", startIndex: 0, endIndex: 0, lineIndex: 0 });
    }
    if (maxLineWidth === 0) {
      for (const line of lines) {
        maxLineWidth = Math.max(maxLineWidth, this.ctx.measureText(line.text).width);
      }
    }
    this.ctx.restore();
    return {
      lines,
      width: Math.max(maxLineWidth, maxWidth),
      height: lines.length * lineHeight,
      lineHeight
    };
  }
  hitTest(pos) {
    for (let i = this.actions.length - 1; i >= 0; i--) {
      if (this.isPointOnAction(pos, this.actions[i])) {
        return i;
      }
    }
    return -1;
  }
  isPointOnAction(pos, action) {
    const threshold = 8;
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points) {
          for (let i = 1; i < action.points.length; i++) {
            if (this.pointToSegmentDist(pos, action.points[i - 1], action.points[i]) < threshold) {
              return true;
            }
          }
        }
        return false;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          const r = action.rect;
          const nx = Math.min(r.x, r.x + r.width);
          const ny = Math.min(r.y, r.y + r.height);
          const nw = Math.abs(r.width);
          const nh = Math.abs(r.height);
          return pos.x >= nx - threshold && pos.x <= nx + nw + threshold && pos.y >= ny - threshold && pos.y <= ny + nh + threshold;
        }
        return false;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          const er = action.ellipseRect;
          const cx = er.x + er.width / 2;
          const cy = er.y + er.height / 2;
          const rx = Math.abs(er.width / 2);
          const ry = Math.abs(er.height / 2);
          if (rx < 1 || ry < 1) {
            return false;
          }
          const dx = (pos.x - cx) / rx;
          const dy = (pos.y - cy) / ry;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (!this.isTransparent(action.fillColor ?? "transparent")) {
            return dist <= 1 + threshold / Math.min(rx, ry);
          }
          const normalizedThreshold = threshold / Math.min(rx, ry);
          return Math.abs(dist - 1) < normalizedThreshold;
        }
        return false;
      case "arrow" /* Arrow */:
        if (action.arrowStart && action.arrowEnd) {
          return this.pointToSegmentDist(pos, action.arrowStart, action.arrowEnd) < threshold;
        }
        return false;
      case "text" /* Text */:
        if (action.text && action.textPos) {
          const bounds = this.getActionBounds(action);
          if (!bounds) {
            return false;
          }
          return pos.x >= action.textPos.x - threshold && pos.x <= bounds.x + bounds.width + threshold && pos.y >= bounds.y - threshold && pos.y <= bounds.y + bounds.height + threshold;
        }
        return false;
    }
    return false;
  }
  pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
      return Math.hypot(p.x - a.x, p.y - a.y);
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }
  moveAction(action, dx, dy) {
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points) {
          for (const pt of action.points) {
            pt.x += dx;
            pt.y += dy;
          }
        }
        break;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          action.rect.x += dx;
          action.rect.y += dy;
        }
        break;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          action.ellipseRect.x += dx;
          action.ellipseRect.y += dy;
        }
        break;
      case "arrow" /* Arrow */:
        if (action.arrowStart) {
          action.arrowStart.x += dx;
          action.arrowStart.y += dy;
        }
        if (action.arrowEnd) {
          action.arrowEnd.x += dx;
          action.arrowEnd.y += dy;
        }
        break;
      case "text" /* Text */:
        if (action.textPos) {
          action.textPos.x += dx;
          action.textPos.y += dy;
        }
        break;
    }
  }
  drawSelectionHighlight(action) {
    this.ctx.save();
    this.ctx.strokeStyle = "#007acc";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    const pad = 6;
    const bounds = this.getActionBounds(action);
    if (bounds) {
      this.ctx.strokeRect(
        (bounds.x - pad) * this.scale,
        (bounds.y - pad) * this.scale,
        (bounds.width + pad * 2) * this.scale,
        (bounds.height + pad * 2) * this.scale
      );
      if (action.type === "text" /* Text */) {
        const handleSize = 8;
        const handleX = (bounds.x + bounds.width + pad) * this.scale;
        const handleY = (bounds.y + bounds.height / 2) * this.scale;
        this.ctx.fillStyle = "#007acc";
        this.ctx.fillRect(handleX - handleSize / 2, handleY - handleSize / 2, handleSize, handleSize);
      }
    }
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }
  isNearTextResizeHandle(pos, action) {
    if (action.type !== "text" /* Text */) {
      return false;
    }
    const bounds = this.getActionBounds(action);
    if (!bounds) {
      return false;
    }
    const threshold = 8;
    const handleX = bounds.x + bounds.width;
    const handleY = bounds.y + bounds.height / 2;
    return Math.abs(pos.x - handleX) <= threshold && Math.abs(pos.y - handleY) <= threshold * 2;
  }
  getActionBounds(action) {
    switch (action.type) {
      case "freehand" /* Freehand */:
        if (action.points && action.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const pt of action.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return null;
      case "rectangle" /* Rectangle */:
        if (action.rect) {
          const r = action.rect;
          return {
            x: Math.min(r.x, r.x + r.width),
            y: Math.min(r.y, r.y + r.height),
            width: Math.abs(r.width),
            height: Math.abs(r.height)
          };
        }
        return null;
      case "ellipse" /* Ellipse */:
        if (action.ellipseRect) {
          const er = action.ellipseRect;
          return {
            x: Math.min(er.x, er.x + er.width),
            y: Math.min(er.y, er.y + er.height),
            width: Math.abs(er.width),
            height: Math.abs(er.height)
          };
        }
        return null;
      case "arrow" /* Arrow */:
        if (action.arrowStart && action.arrowEnd) {
          const minX = Math.min(action.arrowStart.x, action.arrowEnd.x);
          const minY = Math.min(action.arrowStart.y, action.arrowEnd.y);
          const maxX = Math.max(action.arrowStart.x, action.arrowEnd.x);
          const maxY = Math.max(action.arrowStart.y, action.arrowEnd.y);
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return null;
      case "text" /* Text */:
        if (action.text && action.textPos) {
          const fontSize = action.fontSize || 16;
          const fontFamily = action.fontFamily || "sans-serif";
          const textWidth = action.textWidth ?? DEFAULT_TEXT_BOX_WIDTH;
          const layout = this.measureWrappedText(action.text, textWidth, fontSize, fontFamily);
          return {
            x: action.textPos.x,
            y: action.textPos.y - fontSize,
            width: textWidth,
            height: layout.height
          };
        }
        return null;
    }
    return null;
  }
  drawArrow(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return;
    }
    const unitX = dx / length;
    const unitY = dy / length;
    const normalX = -unitY;
    const normalY = unitX;
    const lineWidth = this.ctx.lineWidth;
    const headLength = Math.min(Math.max(12 * this.scale, lineWidth * 3), length);
    const headWidth = Math.max(10 * this.scale, lineWidth * 2.5);
    const baseX = toX - unitX * headLength;
    const baseY = toY - unitY * headLength;
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(baseX, baseY);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(baseX + normalX * headWidth / 2, baseY + normalY * headWidth / 2);
    this.ctx.lineTo(baseX - normalX * headWidth / 2, baseY - normalY * headWidth / 2);
    this.ctx.closePath();
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fill();
  }
  flushPendingZoom() {
    const pending = this.pendingZoom;
    this.pendingZoom = null;
    if (!pending) {
      return;
    }
    const minScale = this.getFitScale();
    const maxScale = 8;
    const desiredScale = this.scale * pending.factor;
    const newScale = Math.max(minScale, Math.min(maxScale, desiredScale));
    if (newScale === this.scale) {
      return;
    }
    const halfImgW = this.imageWidth * this.scale / 2;
    const halfImgH = this.imageHeight * this.scale / 2;
    const anchorCx = this.panX + Math.max(-halfImgW, Math.min(halfImgW, pending.cx - this.panX));
    const anchorCy = this.panY + Math.max(-halfImgH, Math.min(halfImgH, pending.cy - this.panY));
    const r = newScale / this.scale;
    this.panX = anchorCx * (1 - r) + this.panX * r;
    this.panY = anchorCy * (1 - r) + this.panY * r;
    this.scale = newScale;
    this.hasUserZoomed = true;
    if (newScale === minScale) {
      this.panX = 0;
      this.panY = 0;
    }
    this.sizeCanvas();
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
    this.redraw();
  }
  getFitScale() {
    const container = this.canvas.parentElement;
    if (!container || !this.imageWidth || !this.imageHeight) {
      return 1;
    }
    const maxWidth = Math.max(1, container.clientWidth - CANVAS_BREATHING_ROOM * 2);
    const maxHeight = Math.max(1, container.clientHeight - CANVAS_BREATHING_ROOM * 2);
    return Math.min(maxWidth / this.imageWidth, maxHeight / this.imageHeight, 1);
  }
  clampPan() {
    const container = this.canvas.parentElement;
    if (!container) {
      return;
    }
    const imgW = this.imageWidth * this.scale;
    const imgH = this.imageHeight * this.scale;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const maxPanX = Math.abs(cW - imgW) / 2;
    const maxPanY = Math.abs(cH - imgH) / 2;
    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
  }
  compositeToDataUrl() {
    const finalCanvas = mainWindow.document.createElement("canvas");
    finalCanvas.width = this.imageWidth;
    finalCanvas.height = this.imageHeight;
    const ctx = finalCanvas.getContext("2d");
    if (this.imageElement) {
      ctx.drawImage(this.imageElement, 0, 0, this.imageWidth, this.imageHeight);
    }
    const savedScale = this.scale;
    this.scale = 1;
    const savedCtx = this.ctx;
    this.ctx = ctx;
    const offX = this.currentCrop?.x ?? 0;
    const offY = this.currentCrop?.y ?? 0;
    ctx.save();
    ctx.translate(-offX, -offY);
    for (const action of this.actions) {
      this.drawAction(action);
    }
    ctx.restore();
    this.ctx = savedCtx;
    this.scale = savedScale;
    return finalCanvas.toDataURL("image/png");
  }
  dispose() {
    if (this.pendingZoomRaf) {
      getWindow(this.canvas).cancelAnimationFrame(this.pendingZoomRaf);
      this.pendingZoomRaf = 0;
      this.pendingZoom = null;
    }
    this.cancelTextPlacement();
    this.cleanupTextEditor();
    this.container.remove();
    this.toolOptionsDisposables.dispose();
    this.disposables.dispose();
    this._onDidSave.dispose();
    this._onDidCancel.dispose();
  }
}
export {
  ScreenshotAnnotationEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxicm93c2VyXFxzY3JlZW5zaG90QW5ub3RhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudFR5cGUsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJU2NyZWVuc2hvdCB9IGZyb20gJy4vaXNzdWVSZXBvcnRlck92ZXJsYXkuanMnO1xuXG5jb25zdCBlbnVtIEFubm90YXRpb25Ub29sIHtcblx0U2VsZWN0ID0gJ3NlbGVjdCcsXG5cdEZyZWVoYW5kID0gJ2ZyZWVoYW5kJyxcblx0UmVjdGFuZ2xlID0gJ3JlY3RhbmdsZScsXG5cdEVsbGlwc2UgPSAnZWxsaXBzZScsXG5cdEFycm93ID0gJ2Fycm93Jyxcblx0VGV4dCA9ICd0ZXh0Jyxcblx0RXJhc2VyID0gJ2VyYXNlcicsXG5cdFBhbiA9ICdwYW4nLFxuXHRDcm9wID0gJ2Nyb3AnLFxuXHRNb3ZlID0gJ21vdmUnLFxufVxuXG5jb25zdCBDT0xPUlMgPSBbXG5cdCcjZmYzYjMwJywgLy8gcmVkXG5cdCcjMDA3YWZmJywgLy8gYmx1ZVxuXHQnIzM0Yzc1OScsIC8vIGdyZWVuXG5cdCcjZmZjYzAwJywgLy8geWVsbG93XG5cdCcjMDAwMDAwJywgLy8gYmxhY2tcblx0JyNmZmZmZmYnLCAvLyB3aGl0ZVxuXTtcblxuY29uc3QgTElHSFRfU1dBVENIX0NPTE9SUyA9IG5ldyBTZXQoWycjMzRjNzU5JywgJyNmZmNjMDAnLCAnI2ZmZmZmZicsICd0cmFuc3BhcmVudCddKTtcblxuY29uc3QgRk9OVF9GQU1JTElFUyA9IFtcblx0eyBsYWJlbDogJ1NhbnMtc2VyaWYnLCB2YWx1ZTogJy1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJTZWdvZSBVSVwiLCBzYW5zLXNlcmlmJyB9LFxuXHR7IGxhYmVsOiAnTW9ub3NwYWNlJywgdmFsdWU6ICdcIkNhc2NhZGlhIENvZGVcIiwgXCJGaXJhIENvZGVcIiwgQ29uc29sYXMsIG1vbm9zcGFjZScgfSxcblx0eyBsYWJlbDogJ1NlcmlmJywgdmFsdWU6ICdHZW9yZ2lhLCBcIlRpbWVzIE5ldyBSb21hblwiLCBzZXJpZicgfSxcbl07XG5cbmNvbnN0IERFRkFVTFRfVEVYVF9CT1hfV0lEVEggPSAyNDA7XG5jb25zdCBNSU5fVEVYVF9CT1hfV0lEVEggPSA0ODtcbmNvbnN0IFRFWFRfRFJBR19USFJFU0hPTEQgPSA0O1xuLyoqIFBhZGRpbmcgb24gZWFjaCBzaWRlIG9mIHRoZSBkaXNwbGF5ZWQgaW1hZ2UgaW5zaWRlIHRoZSBjYW52YXMgY29udGFpbmVyIGF0IGZpdC10by13aW5kb3cgc2NhbGUuICovXG5jb25zdCBDQU5WQVNfQlJFQVRISU5HX1JPT00gPSA2NDtcbmNvbnN0IEZJTExfQ09MT1JTID0gWyd0cmFuc3BhcmVudCcsIC4uLkNPTE9SU107XG5jb25zdCBTVFJPS0VfV0lEVEhTID0gWzIsIDQsIDgsIDEyXTtcbmNvbnN0IFRFWFRfU0laRVMgPSBbMTQsIDE4LCAyNCwgMzIsIDQ4XTtcblxuZXhwb3J0IGludGVyZmFjZSBJQW5ub3RhdGlvbkRyYXdBY3Rpb24ge1xuXHRyZWFkb25seSB0eXBlOiBBbm5vdGF0aW9uVG9vbDtcblx0c3Ryb2tlQ29sb3I6IHN0cmluZztcblx0ZmlsbENvbG9yPzogc3RyaW5nO1xuXHRvcGFjaXR5OiBudW1iZXI7XG5cdGxpbmVXaWR0aDogbnVtYmVyO1xuXHRmb250U2l6ZT86IG51bWJlcjtcblx0Zm9udEZhbWlseT86IHN0cmluZztcblx0cG9pbnRzPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W107XG5cdHJlY3Q/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xuXHRlbGxpcHNlUmVjdD86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XG5cdGFycm93U3RhcnQ/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG5cdGFycm93RW5kPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHR0ZXh0Pzogc3RyaW5nO1xuXHR0ZXh0UG9zPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHR0ZXh0V2lkdGg/OiBudW1iZXI7XG5cdC8qKiBPbmx5IHNldCBmb3IgdHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyOiB0aGUgYmF0Y2ggb2YgYWN0aW9ucyByZW1vdmVkIGluIG9uZSBzdHJva2UuICovXG5cdGVyYXNlZEFjdGlvbnM/OiBJQW5ub3RhdGlvbkRyYXdBY3Rpb25bXTtcblx0LyoqIE9ubHkgc2V0IGZvciB0eXBlID09PSBBbm5vdGF0aW9uVG9vbC5FcmFzZXI6IHRoZSBvcmlnaW5hbCBpbmRleCAoaW4gYGFjdGlvbnNbXWApIG9mIGVhY2ggZXJhc2VkIGFjdGlvbiBhdCB0aGUgbW9tZW50IGl0IHdhcyByZW1vdmVkLiAqL1xuXHRlcmFzZWRJbmRpY2VzPzogbnVtYmVyW107XG5cdC8qKiBPbmx5IHNldCBmb3IgdHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuQ3JvcDogdGhlIGNyb3AgYWN0aXZlIGJlZm9yZSB0aGlzIGFjdGlvbi4gbnVsbCBtZWFucyBubyBjcm9wIChmdWxsIG9yaWdpbmFsIGltYWdlKS4gKi9cblx0Y3JvcEZyb20/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbDtcblx0LyoqIE9ubHkgc2V0IGZvciB0eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Dcm9wOiB0aGUgY3JvcCBhY3RpdmUgYWZ0ZXIgdGhpcyBhY3Rpb24uIG51bGwgbWVhbnMgbm8gY3JvcCAoZnVsbCBvcmlnaW5hbCBpbWFnZSkuICovXG5cdGNyb3BUbz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsO1xuXHQvKiogT25seSBzZXQgZm9yIHR5cGUgPT09IEFubm90YXRpb25Ub29sLk1vdmU6IHRoZSBhY3Rpb24gdGhhdCB3YXMgbW92ZWQgb3IgcmVzaXplZC4gKi9cblx0bW92ZVRhcmdldD86IElBbm5vdGF0aW9uRHJhd0FjdGlvbjtcblx0LyoqIE9ubHkgc2V0IGZvciB0eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Nb3ZlOiBzbmFwc2hvdCBvZiBnZW9tZXRyaWMgZmllbGRzIGJlZm9yZSB0aGUgY2hhbmdlLiAqL1xuXHRtb3ZlQmVmb3JlPzogSUFubm90YXRpb25Nb3ZlU25hcHNob3Q7XG5cdC8qKiBPbmx5IHNldCBmb3IgdHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuTW92ZTogc25hcHNob3Qgb2YgZ2VvbWV0cmljIGZpZWxkcyBhZnRlciB0aGUgY2hhbmdlLiAqL1xuXHRtb3ZlQWZ0ZXI/OiBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdDtcbn1cblxuaW50ZXJmYWNlIElBbm5vdGF0aW9uTW92ZVNuYXBzaG90IHtcblx0cG9pbnRzPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W107XG5cdHJlY3Q/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xuXHRlbGxpcHNlUmVjdD86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XG5cdGFycm93U3RhcnQ/OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG5cdGFycm93RW5kPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHR0ZXh0UG9zPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHR0ZXh0V2lkdGg/OiBudW1iZXI7XG59XG5cbnR5cGUgRHJhd0FjdGlvbiA9IElBbm5vdGF0aW9uRHJhd0FjdGlvbjtcblxuZXhwb3J0IGludGVyZmFjZSBJQW5ub3RhdGlvbkVkaXRvclN0YXRlIHtcblx0cmVhZG9ubHkgYWN0aW9uczogcmVhZG9ubHkgSUFubm90YXRpb25EcmF3QWN0aW9uW107XG5cdHJlYWRvbmx5IHVuZG9uZUFjdGlvbnM6IHJlYWRvbmx5IElBbm5vdGF0aW9uRHJhd0FjdGlvbltdO1xuXHRyZWFkb25seSBjcm9wOiB7IHJlYWRvbmx5IHg6IG51bWJlcjsgcmVhZG9ubHkgeTogbnVtYmVyOyByZWFkb25seSB3aWR0aDogbnVtYmVyOyByZWFkb25seSBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQW5ub3RhdGlvblNhdmVSZXN1bHQge1xuXHRyZWFkb25seSBkYXRhVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXRlOiBJQW5ub3RhdGlvbkVkaXRvclN0YXRlO1xufVxuXG5mdW5jdGlvbiBjbG9uZURyYXdBY3Rpb24oYWN0aW9uOiBJQW5ub3RhdGlvbkRyYXdBY3Rpb24sIGlkZW50aXR5TWFwOiBNYXA8SUFubm90YXRpb25EcmF3QWN0aW9uLCBJQW5ub3RhdGlvbkRyYXdBY3Rpb24+ID0gbmV3IE1hcCgpKTogSUFubm90YXRpb25EcmF3QWN0aW9uIHtcblx0Y29uc3QgZXhpc3RpbmcgPSBpZGVudGl0eU1hcC5nZXQoYWN0aW9uKTtcblx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHR9XG5cdGNvbnN0IGNsb25lOiBJQW5ub3RhdGlvbkRyYXdBY3Rpb24gPSB7XG5cdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0c3Ryb2tlQ29sb3I6IGFjdGlvbi5zdHJva2VDb2xvcixcblx0XHRmaWxsQ29sb3I6IGFjdGlvbi5maWxsQ29sb3IsXG5cdFx0b3BhY2l0eTogYWN0aW9uLm9wYWNpdHksXG5cdFx0bGluZVdpZHRoOiBhY3Rpb24ubGluZVdpZHRoLFxuXHRcdGZvbnRTaXplOiBhY3Rpb24uZm9udFNpemUsXG5cdFx0Zm9udEZhbWlseTogYWN0aW9uLmZvbnRGYW1pbHksXG5cdFx0cG9pbnRzOiBhY3Rpb24ucG9pbnRzID8gYWN0aW9uLnBvaW50cy5tYXAocCA9PiAoeyB4OiBwLngsIHk6IHAueSB9KSkgOiB1bmRlZmluZWQsXG5cdFx0cmVjdDogYWN0aW9uLnJlY3QgPyB7IC4uLmFjdGlvbi5yZWN0IH0gOiB1bmRlZmluZWQsXG5cdFx0ZWxsaXBzZVJlY3Q6IGFjdGlvbi5lbGxpcHNlUmVjdCA/IHsgLi4uYWN0aW9uLmVsbGlwc2VSZWN0IH0gOiB1bmRlZmluZWQsXG5cdFx0YXJyb3dTdGFydDogYWN0aW9uLmFycm93U3RhcnQgPyB7IC4uLmFjdGlvbi5hcnJvd1N0YXJ0IH0gOiB1bmRlZmluZWQsXG5cdFx0YXJyb3dFbmQ6IGFjdGlvbi5hcnJvd0VuZCA/IHsgLi4uYWN0aW9uLmFycm93RW5kIH0gOiB1bmRlZmluZWQsXG5cdFx0dGV4dDogYWN0aW9uLnRleHQsXG5cdFx0dGV4dFBvczogYWN0aW9uLnRleHRQb3MgPyB7IC4uLmFjdGlvbi50ZXh0UG9zIH0gOiB1bmRlZmluZWQsXG5cdFx0dGV4dFdpZHRoOiBhY3Rpb24udGV4dFdpZHRoLFxuXHRcdGNyb3BGcm9tOiBhY3Rpb24uY3JvcEZyb20gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFjdGlvbi5jcm9wRnJvbSA9PT0gbnVsbCA/IG51bGwgOiB7IC4uLmFjdGlvbi5jcm9wRnJvbSB9LFxuXHRcdGNyb3BUbzogYWN0aW9uLmNyb3BUbyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogYWN0aW9uLmNyb3BUbyA9PT0gbnVsbCA/IG51bGwgOiB7IC4uLmFjdGlvbi5jcm9wVG8gfSxcblx0XHRtb3ZlQmVmb3JlOiBhY3Rpb24ubW92ZUJlZm9yZSA/IGNsb25lTW92ZVNuYXBzaG90KGFjdGlvbi5tb3ZlQmVmb3JlKSA6IHVuZGVmaW5lZCxcblx0XHRtb3ZlQWZ0ZXI6IGFjdGlvbi5tb3ZlQWZ0ZXIgPyBjbG9uZU1vdmVTbmFwc2hvdChhY3Rpb24ubW92ZUFmdGVyKSA6IHVuZGVmaW5lZCxcblx0fTtcblx0aWRlbnRpdHlNYXAuc2V0KGFjdGlvbiwgY2xvbmUpO1xuXHQvLyBSZXNvbHZlIHJlZmVyZW5jZXMgYWZ0ZXIgcmVnaXN0ZXJpbmcgc2VsZiBzbyBjeWNsaWMgc3RydWN0dXJlcyBkb24ndCByZWN1cnNlIGZvcmV2ZXIuXG5cdGNsb25lLmVyYXNlZEFjdGlvbnMgPSBhY3Rpb24uZXJhc2VkQWN0aW9ucyA/IGFjdGlvbi5lcmFzZWRBY3Rpb25zLm1hcChhID0+IGNsb25lRHJhd0FjdGlvbihhLCBpZGVudGl0eU1hcCkpIDogdW5kZWZpbmVkO1xuXHRjbG9uZS5lcmFzZWRJbmRpY2VzID0gYWN0aW9uLmVyYXNlZEluZGljZXMgPyBhY3Rpb24uZXJhc2VkSW5kaWNlcy5zbGljZSgpIDogdW5kZWZpbmVkO1xuXHRjbG9uZS5tb3ZlVGFyZ2V0ID0gYWN0aW9uLm1vdmVUYXJnZXQgPyBjbG9uZURyYXdBY3Rpb24oYWN0aW9uLm1vdmVUYXJnZXQsIGlkZW50aXR5TWFwKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIGNsb25lO1xufVxuXG5mdW5jdGlvbiBjbG9uZU1vdmVTbmFwc2hvdChzOiBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdCk6IElBbm5vdGF0aW9uTW92ZVNuYXBzaG90IHtcblx0cmV0dXJuIHtcblx0XHRwb2ludHM6IHMucG9pbnRzID8gcy5wb2ludHMubWFwKHAgPT4gKHsgeDogcC54LCB5OiBwLnkgfSkpIDogdW5kZWZpbmVkLFxuXHRcdHJlY3Q6IHMucmVjdCA/IHsgLi4ucy5yZWN0IH0gOiB1bmRlZmluZWQsXG5cdFx0ZWxsaXBzZVJlY3Q6IHMuZWxsaXBzZVJlY3QgPyB7IC4uLnMuZWxsaXBzZVJlY3QgfSA6IHVuZGVmaW5lZCxcblx0XHRhcnJvd1N0YXJ0OiBzLmFycm93U3RhcnQgPyB7IC4uLnMuYXJyb3dTdGFydCB9IDogdW5kZWZpbmVkLFxuXHRcdGFycm93RW5kOiBzLmFycm93RW5kID8geyAuLi5zLmFycm93RW5kIH0gOiB1bmRlZmluZWQsXG5cdFx0dGV4dFBvczogcy50ZXh0UG9zID8geyAuLi5zLnRleHRQb3MgfSA6IHVuZGVmaW5lZCxcblx0XHR0ZXh0V2lkdGg6IHMudGV4dFdpZHRoLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjYXB0dXJlTW92ZVNuYXBzaG90KGFjdGlvbjogSUFubm90YXRpb25EcmF3QWN0aW9uKTogSUFubm90YXRpb25Nb3ZlU25hcHNob3Qge1xuXHRyZXR1cm4gY2xvbmVNb3ZlU25hcHNob3Qoe1xuXHRcdHBvaW50czogYWN0aW9uLnBvaW50cyxcblx0XHRyZWN0OiBhY3Rpb24ucmVjdCxcblx0XHRlbGxpcHNlUmVjdDogYWN0aW9uLmVsbGlwc2VSZWN0LFxuXHRcdGFycm93U3RhcnQ6IGFjdGlvbi5hcnJvd1N0YXJ0LFxuXHRcdGFycm93RW5kOiBhY3Rpb24uYXJyb3dFbmQsXG5cdFx0dGV4dFBvczogYWN0aW9uLnRleHRQb3MsXG5cdFx0dGV4dFdpZHRoOiBhY3Rpb24udGV4dFdpZHRoLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gYXBwbHlNb3ZlU25hcHNob3QoYWN0aW9uOiBJQW5ub3RhdGlvbkRyYXdBY3Rpb24sIHNuYXBzaG90OiBJQW5ub3RhdGlvbk1vdmVTbmFwc2hvdCk6IHZvaWQge1xuXHRjb25zdCBmcmVzaCA9IGNsb25lTW92ZVNuYXBzaG90KHNuYXBzaG90KTtcblx0YWN0aW9uLnBvaW50cyA9IGZyZXNoLnBvaW50cztcblx0YWN0aW9uLnJlY3QgPSBmcmVzaC5yZWN0O1xuXHRhY3Rpb24uZWxsaXBzZVJlY3QgPSBmcmVzaC5lbGxpcHNlUmVjdDtcblx0YWN0aW9uLmFycm93U3RhcnQgPSBmcmVzaC5hcnJvd1N0YXJ0O1xuXHRhY3Rpb24uYXJyb3dFbmQgPSBmcmVzaC5hcnJvd0VuZDtcblx0YWN0aW9uLnRleHRQb3MgPSBmcmVzaC50ZXh0UG9zO1xuXHRhY3Rpb24udGV4dFdpZHRoID0gZnJlc2gudGV4dFdpZHRoO1xufVxuXG5mdW5jdGlvbiBtb3ZlU25hcHNob3RzRXF1YWwoYTogSUFubm90YXRpb25Nb3ZlU25hcHNob3QsIGI6IElBbm5vdGF0aW9uTW92ZVNuYXBzaG90KTogYm9vbGVhbiB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYik7XG59XG5cbmV4cG9ydCBjbGFzcyBTY3JlZW5zaG90QW5ub3RhdGlvbkVkaXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sT3B0aW9uc0Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmUgPSBuZXcgRW1pdHRlcjxJQW5ub3RhdGlvblNhdmVSZXN1bHQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZTogRXZlbnQ8SUFubm90YXRpb25TYXZlUmVzdWx0PiA9IHRoaXMuX29uRGlkU2F2ZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDYW5jZWwgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENhbmNlbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENhbmNlbC5ldmVudDtcblxuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNhbnZhcyE6IEhUTUxDYW52YXNFbGVtZW50O1xuXHRwcml2YXRlIGN0eCE6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcblxuXHRwcml2YXRlIGFjdGl2ZVRvb2w6IEFubm90YXRpb25Ub29sID0gQW5ub3RhdGlvblRvb2wuRnJlZWhhbmQ7XG5cdHByaXZhdGUgYWN0aXZlU3Ryb2tlQ29sb3IgPSBDT0xPUlNbMF07XG5cdHByaXZhdGUgYWN0aXZlRmlsbENvbG9yID0gJ3RyYW5zcGFyZW50Jztcblx0cHJpdmF0ZSBhY3RpdmVMaW5lV2lkdGggPSA0O1xuXHRwcml2YXRlIGFjdGl2ZU9wYWNpdHkgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbnM6IERyYXdBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVuZG9uZUFjdGlvbnM6IERyYXdBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIGN1cnJlbnRBY3Rpb246IERyYXdBY3Rpb24gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBpc0RyYXdpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBpc0VyYXNpbmcgPSBmYWxzZTtcblx0LyoqIEFjdGlvbnMgZXJhc2VkIGR1cmluZyB0aGUgY3VycmVudCBwb2ludGVyIGRyYWc7IGNvbW1pdHRlZCB0byB1bmRvIHN0YWNrIG9uIHBvaW50ZXItdXAuICovXG5cdHByaXZhdGUgcGVuZGluZ0VyYXNlQWN0aW9uczogRHJhd0FjdGlvbltdID0gW107XG5cdC8qKiBPcmlnaW5hbCBpbmRleCAoaW4gYGFjdGlvbnNbXWApIG9mIGVhY2ggZW50cnkgaW4gYHBlbmRpbmdFcmFzZUFjdGlvbnNgLCBjYXB0dXJlZCBhdCB0aGUgbW9tZW50IGl0IHdhcyByZW1vdmVkLiAqL1xuXHRwcml2YXRlIHBlbmRpbmdFcmFzZUluZGljZXM6IG51bWJlcltdID0gW107XG5cblx0cHJpdmF0ZSBpbWFnZUVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBpbWFnZVdpZHRoID0gMDtcblx0cHJpdmF0ZSBpbWFnZUhlaWdodCA9IDA7XG5cdHByaXZhdGUgc2NhbGUgPSAxO1xuXG5cdC8vIFBhbiAmIHpvb21cblx0cHJpdmF0ZSBwYW5YID0gMDtcblx0cHJpdmF0ZSBwYW5ZID0gMDtcblx0cHJpdmF0ZSBpc1Bhbm5pbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBsYXN0UGFuUG9pbnQgPSB7IHg6IDAsIHk6IDAgfTtcblxuXHQvLyBDcm9wIHdpdGggaGFuZGxlc1xuXHRwcml2YXRlIGNyb3BNb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgY3JvcFJlZ2lvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNyb3BEcmFnSGFuZGxlOiAnbncnIHwgJ24nIHwgJ25lJyB8ICdlJyB8ICdzZScgfCAncycgfCAnc3cnIHwgJ3cnIHwgJ21vdmUnIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY3JvcERyYWdTdGFydCA9IHsgeDogMCwgeTogMCB9O1xuXHRwcml2YXRlIGNyb3BSZWdpb25TdGFydDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGhhc1VzZXJab29tZWQgPSBmYWxzZTtcblx0LyoqIFBlbmRpbmcgd2hlZWwtem9vbSBkZWx0YSBhY2N1bXVsYXRlZCBhY3Jvc3MgcmFwaWQgd2hlZWwgZXZlbnRzOyBmbHVzaGVkIG9uIHJBRi4gKi9cblx0cHJpdmF0ZSBwZW5kaW5nWm9vbTogeyBmYWN0b3I6IG51bWJlcjsgY3g6IG51bWJlcjsgY3k6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcGVuZGluZ1pvb21SYWYgPSAwO1xuXG5cdC8vIE9yaWdpbmFsIGltYWdlIHByZXNlcnZlZCBzbyBjcm9wcyBjYW4gYmUgZXhwYW5kZWQgYmFja1xuXHRwcml2YXRlIG9yaWdpbmFsSW1hZ2U6IHsgZWxlbWVudDogSFRNTEltYWdlRWxlbWVudDsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXHQvLyBDdXJyZW50IGNyb3AgcmVnaW9uIGluIG9yaWdpbmFsLWltYWdlIGNvb3JkcyAobnVsbCA9IG5vIGNyb3AgYXBwbGllZClcblx0cHJpdmF0ZSBjdXJyZW50Q3JvcDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuXHQvLyBQcmUtY3JvcCBzdGF0ZSByZXN0b3JlZCBvbiBDYW5jZWxcblx0cHJpdmF0ZSBwcmVDcm9wU3RhdGU6IHsgZWxlbWVudDogSFRNTEltYWdlRWxlbWVudDsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGN1cnJlbnRDcm9wOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB9IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgbWFpblRvb2xiYXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY3JvcFRvb2xiYXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cblx0LyoqIEFubm90YXRpb25zIGFyZSBzdG9yZWQgaW4gb3JpZ2luYWwtaW1hZ2UgY29vcmRzLiBXaGlsZSBpbiBjcm9wIG1vZGUgdGhlIGNhbnZhcyBhbHJlYWR5IHNob3dzIHRoZSBvcmlnaW5hbCBpbWFnZSwgc28gdGhlIG9mZnNldCBpcyAwLiAqL1xuXHRwcml2YXRlIGdldCBjcm9wT2Zmc2V0WCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5jcm9wTW9kZSA/IDAgOiAodGhpcy5jdXJyZW50Q3JvcD8ueCA/PyAwKTsgfVxuXHRwcml2YXRlIGdldCBjcm9wT2Zmc2V0WSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5jcm9wTW9kZSA/IDAgOiAodGhpcy5jdXJyZW50Q3JvcD8ueSA/PyAwKTsgfVxuXG5cdC8vIFNlbGVjdGlvbiAoU2VsZWN0IHRvb2wpXG5cdHByaXZhdGUgc2VsZWN0ZWRBY3Rpb25JbmRleCA9IC0xO1xuXHRwcml2YXRlIGlzRHJhZ2dpbmdTZWxlY3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGlzUmVzaXppbmdTZWxlY3RlZFRleHQgPSBmYWxzZTtcblx0cHJpdmF0ZSBkcmFnU3RhcnQgPSB7IHg6IDAsIHk6IDAgfTtcblx0cHJpdmF0ZSBzZWxlY3RlZFRleHRSZXNpemVTdGFydFdpZHRoID0gREVGQVVMVF9URVhUX0JPWF9XSURUSDtcblx0LyoqIENhcHR1cmVkIGF0IHRoZSBzdGFydCBvZiBhIFNlbGVjdC10b29sIGRyYWcvcmVzaXplIHNvIGEgTW92ZSBzZW50aW5lbCBjYW4gYmUgY29tbWl0dGVkIG9uIHBvaW50ZXItdXAuICovXG5cdHByaXZhdGUgcGVuZGluZ01vdmU6IHsgdGFyZ2V0OiBEcmF3QWN0aW9uOyBiZWZvcmU6IElBbm5vdGF0aW9uTW92ZVNuYXBzaG90IH0gfCBudWxsID0gbnVsbDtcblxuXHQvLyBUZXh0IGNvbmZpZ3VyYXRpb25cblx0cHJpdmF0ZSBhY3RpdmVGb250U2l6ZSA9IDE4O1xuXHRwcml2YXRlIGFjdGl2ZUZvbnRGYW1pbHkgPSBGT05UX0ZBTUlMSUVTWzBdLnZhbHVlO1xuXHRwcml2YXRlIHRleHRQbGFjZW1lbnRTdGF0ZToge1xuXHRcdHN0YXJ0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG5cdFx0Y3VycmVudDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHRcdHBvaW50ZXJJZDogbnVtYmVyO1xuXHR9IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdGV4dEVkaXRTdGF0ZToge1xuXHRcdHBvczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuXHRcdHRleHQ6IHN0cmluZztcblx0XHRjYXJldEluZGV4OiBudW1iZXI7XG5cdFx0c3Ryb2tlQ29sb3I6IHN0cmluZztcblx0XHRmaWxsQ29sb3I6IHN0cmluZztcblx0XHRvcGFjaXR5OiBudW1iZXI7XG5cdFx0Zm9udFNpemU6IG51bWJlcjtcblx0XHRmb250RmFtaWx5OiBzdHJpbmc7XG5cdFx0d2lkdGg6IG51bWJlcjtcblx0XHRzaG93Qm94T3V0bGluZTogYm9vbGVhbjtcblx0fSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHRleHRFZGl0b3I6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB0ZXh0Q2FyZXRWaXNpYmxlID0gdHJ1ZTtcblx0cHJpdmF0ZSB0ZXh0Q2FyZXRJbnRlcnZhbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cblx0Ly8gVG9vbCBidXR0b25zIChmb3IgYWN0aXZlIHN0YXRlIG1hbmFnZW1lbnQpXG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbEJ1dHRvbnM6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IHRvb2w6IEFubm90YXRpb25Ub29sIH1bXSA9IFtdO1xuXHRwcml2YXRlIHVuZG9CdG46IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVkb0J0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB0b29sT3B0aW9uc1BvcG92ZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNjcmVlbnNob3Q6IElTY3JlZW5zaG90LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFyZW50RWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsU3RhdGU/OiBJQW5ub3RhdGlvbkVkaXRvclN0YXRlLFxuXHQpIHtcblx0XHR0aGlzLmNyZWF0ZVVJKCk7XG5cdFx0dGhpcy5sb2FkSW1hZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVUkoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIgPSBhcHBlbmQodGhpcy5wYXJlbnRFbGVtZW50LCAkKCdkaXYuaXNzdWUtcmVwb3J0ZXItYW5ub3RhdGlvbi1vdmVybGF5JykpO1xuXHRcdHRoaXMuY29udGFpbmVyLnRhYkluZGV4ID0gLTE7XG5cblx0XHQvLyBNYWluIHRvb2xiYXIgKGhpZGRlbiBkdXJpbmcgY3JvcCBtb2RlKVxuXHRcdGNvbnN0IHRvb2xiYXIgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLXRvb2xiYXInKSk7XG5cdFx0dGhpcy5tYWluVG9vbGJhciA9IHRvb2xiYXI7XG5cblx0XHQvLyAxLiBEcmF3aW5nIHRvb2xzOiBTZWxlY3QsIFBhbiwgQ3JvcCwgRHJhdywgUmVjdGFuZ2xlLCBFbGxpcHNlLCBBcnJvd1xuXHRcdGNvbnN0IGRyYXdpbmdUb29sczogeyB0b29sOiBBbm5vdGF0aW9uVG9vbDsgbGFiZWw6IHN0cmluZzsgaWNvbjogSFRNTFNwYW5FbGVtZW50IH1bXSA9IFtcblx0XHRcdHsgdG9vbDogQW5ub3RhdGlvblRvb2wuU2VsZWN0LCBsYWJlbDogbG9jYWxpemUoJ3NlbGVjdCcsIFwiU2VsZWN0IC8gTW92ZVwiKSwgaWNvbjogcmVuZGVySWNvbihDb2RpY29uLmluc3BlY3QpIH0sXG5cdFx0XHR7IHRvb2w6IEFubm90YXRpb25Ub29sLlBhbiwgbGFiZWw6IGxvY2FsaXplKCdwYW4nLCBcIlBhblwiKSwgaWNvbjogcmVuZGVySWNvbihDb2RpY29uLm1vdmUpIH0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHsgdG9vbCwgbGFiZWwsIGljb24gfSBvZiBkcmF3aW5nVG9vbHMpIHtcblx0XHRcdHRoaXMuYWRkVG9vbEJ1dHRvbih0b29sYmFyLCB0b29sLCBsYWJlbCwgaWNvbik7XG5cdFx0fVxuXG5cdFx0Ly8gMi4gQ3JvcCB0b29sXG5cdFx0Y29uc3QgY3JvcEJ0biA9IGFwcGVuZCh0b29sYmFyLCAkKCdidXR0b24udG9vbC1idG4uY3JvcC1idG4nKSk7XG5cdFx0Y3JvcEJ0bi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uc2NyZWVuQ3V0KSk7XG5cdFx0Y3JvcEJ0bi50aXRsZSA9IGxvY2FsaXplKCdjcm9wJywgXCJDcm9wXCIpO1xuXHRcdGNyb3BCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2Nyb3AnLCBcIkNyb3BcIikpO1xuXHRcdHRoaXMudG9vbEJ1dHRvbnMucHVzaCh7IGVsZW1lbnQ6IGNyb3BCdG4sIHRvb2w6IEFubm90YXRpb25Ub29sLkNyb3AgfSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNyb3BCdG4sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVUb29sKEFubm90YXRpb25Ub29sLkNyb3ApO1xuXHRcdH0pKTtcblxuXHRcdC8vIDMuIE1vcmUgZHJhd2luZyB0b29sc1xuXHRcdGNvbnN0IG1vcmVEcmF3aW5nVG9vbHM6IHsgdG9vbDogQW5ub3RhdGlvblRvb2w7IGxhYmVsOiBzdHJpbmc7IGljb246IEhUTUxTcGFuRWxlbWVudCB9W10gPSBbXG5cdFx0XHR7IHRvb2w6IEFubm90YXRpb25Ub29sLkZyZWVoYW5kLCBsYWJlbDogbG9jYWxpemUoJ2ZyZWVoYW5kJywgXCJEcmF3XCIpLCBpY29uOiByZW5kZXJJY29uKENvZGljb24uZWRpdCkgfSxcblx0XHRcdHsgdG9vbDogQW5ub3RhdGlvblRvb2wuUmVjdGFuZ2xlLCBsYWJlbDogbG9jYWxpemUoJ3JlY3RhbmdsZScsIFwiUmVjdGFuZ2xlXCIpLCBpY29uOiByZW5kZXJJY29uKENvZGljb24ucHJpbWl0aXZlU3F1YXJlKSB9LFxuXHRcdFx0eyB0b29sOiBBbm5vdGF0aW9uVG9vbC5FbGxpcHNlLCBsYWJlbDogbG9jYWxpemUoJ2VsbGlwc2UnLCBcIkVsbGlwc2VcIiksIGljb246IHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGUpIH0sXG5cdFx0XHR7IHRvb2w6IEFubm90YXRpb25Ub29sLkFycm93LCBsYWJlbDogbG9jYWxpemUoJ2Fycm93JywgXCJBcnJvd1wiKSwgaWNvbjogcmVuZGVySWNvbihDb2RpY29uLmFycm93UmlnaHQpIH0sXG5cdFx0XHR7IHRvb2w6IEFubm90YXRpb25Ub29sLkVyYXNlciwgbGFiZWw6IGxvY2FsaXplKCdlcmFzZXInLCBcIkVyYXNlclwiKSwgaWNvbjogcmVuZGVySWNvbihDb2RpY29uLmVyYXNlcikgfSxcblx0XHRdO1xuXHRcdGZvciAoY29uc3QgeyB0b29sLCBsYWJlbCwgaWNvbiB9IG9mIG1vcmVEcmF3aW5nVG9vbHMpIHtcblx0XHRcdHRoaXMuYWRkVG9vbEJ1dHRvbih0b29sYmFyLCB0b29sLCBsYWJlbCwgaWNvbik7XG5cdFx0fVxuXG5cdFx0Ly8gNC4gVGV4dCB0b29sXG5cdFx0dGhpcy5hZGRUb29sQnV0dG9uKHRvb2xiYXIsIEFubm90YXRpb25Ub29sLlRleHQsIGxvY2FsaXplKCd0ZXh0JywgXCJUZXh0XCIpLCByZW5kZXJJY29uKENvZGljb24uc3ltYm9sU3RyaW5nKSk7XG5cblx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3ZlciA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnZGl2LmFubm90YXRpb24tdG9vbC1vcHRpb25zLXBvcG92ZXInKSk7XG5cdFx0dGhpcy50b29sT3B0aW9uc1BvcG92ZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudG9vbE9wdGlvbnNQb3BvdmVyIHx8IHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBOb2RlO1xuXHRcdFx0aWYgKCF0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5jb250YWlucyh0YXJnZXQpICYmICF0aGlzLnRvb2xCdXR0b25zLnNvbWUoYnV0dG9uID0+IGJ1dHRvbi5lbGVtZW50LmNvbnRhaW5zKHRhcmdldCkpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZVRvb2xPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMucmVuZGVyVG9vbE9wdGlvbnMoKTtcblxuXHRcdC8vIDUuIFNlcGFyYXRvclxuXHRcdGFwcGVuZCh0b29sYmFyLCAkKCdkaXYudG9vbGJhci1zZXBhcmF0b3InKSk7XG5cblx0XHQvLyA2LiBVbmRvIGJ1dHRvblxuXHRcdGNvbnN0IHVuZG9CdG4gPSBhcHBlbmQodG9vbGJhciwgJCgnYnV0dG9uLnRvb2wtYnRuJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdHVuZG9CdG4uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmRpc2NhcmQpKTtcblx0XHR1bmRvQnRuLnRpdGxlID0gbG9jYWxpemUoJ3VuZG8nLCBcIlVuZG9cIik7XG5cdFx0dW5kb0J0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgndW5kbycsIFwiVW5kb1wiKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHVuZG9CdG4sIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy51bmRvKCkpKTtcblx0XHR0aGlzLnVuZG9CdG4gPSB1bmRvQnRuO1xuXG5cdFx0Ly8gNy4gUmVkbyBidXR0b25cblx0XHRjb25zdCByZWRvQnRuID0gYXBwZW5kKHRvb2xiYXIsICQoJ2J1dHRvbi50b29sLWJ0bicpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRyZWRvQnRuLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5yZWRvKSk7XG5cdFx0cmVkb0J0bi50aXRsZSA9IGxvY2FsaXplKCdyZWRvJywgXCJSZWRvXCIpO1xuXHRcdHJlZG9CdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3JlZG8nLCBcIlJlZG9cIikpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihyZWRvQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMucmVkbygpKSk7XG5cdFx0dGhpcy5yZWRvQnRuID0gcmVkb0J0bjtcblx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblxuXHRcdC8vIDguIFNlcGFyYXRvclxuXHRcdGFwcGVuZCh0b29sYmFyLCAkKCdkaXYudG9vbGJhci1zZXBhcmF0b3InKSk7XG5cblx0XHQvLyA5LiBEaXNjYXJkIGJ1dHRvblxuXHRcdGNvbnN0IGRpc2NhcmRCdG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRvb2xiYXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRkaXNjYXJkQnRuLmxhYmVsID0gbG9jYWxpemUoJ2Rpc2NhcmQnLCBcIkRpc2NhcmRcIik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzY2FyZEJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY2FuY2VsVGV4dEVkaXQoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsLmZpcmUoKTtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIDEwLiBTYXZlIGJ1dHRvblxuXHRcdGNvbnN0IHNhdmVCdG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRvb2xiYXIsIGRlZmF1bHRCdXR0b25TdHlsZXMpKTtcblx0XHRzYXZlQnRuLmxhYmVsID0gbG9jYWxpemUoJ3NhdmUnLCBcIlNhdmVcIik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoc2F2ZUJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY29tbWl0VGV4dEVkaXQoKTtcblx0XHRcdGNvbnN0IGRhdGFVcmwgPSB0aGlzLmNvbXBvc2l0ZVRvRGF0YVVybCgpO1xuXHRcdFx0dGhpcy5fb25EaWRTYXZlLmZpcmUoeyBkYXRhVXJsLCBzdGF0ZTogdGhpcy5jYXB0dXJlU3RhdGUoKSB9KTtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENyb3AgdG9vbGJhciAoc2hvd24gb25seSBkdXJpbmcgY3JvcCBtb2RlLCBoaWRkZW4gYnkgZGVmYXVsdClcblx0XHRjb25zdCBjcm9wVG9vbGJhciA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnZGl2LmFubm90YXRpb24tdG9vbGJhci5hbm5vdGF0aW9uLWNyb3AtdG9vbGJhcicpKTtcblx0XHRjcm9wVG9vbGJhci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuY3JvcFRvb2xiYXIgPSBjcm9wVG9vbGJhcjtcblxuXHRcdGNvbnN0IGNyb3BDYW5jZWxCdG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGNyb3BUb29sYmFyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0Y3JvcENhbmNlbEJ0bi5sYWJlbCA9IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjcm9wQ2FuY2VsQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5jYW5jZWxDcm9wKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3JvcEFwcGx5QnRuID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihjcm9wVG9vbGJhciwgZGVmYXVsdEJ1dHRvblN0eWxlcykpO1xuXHRcdGNyb3BBcHBseUJ0bi5sYWJlbCA9IGxvY2FsaXplKCdhcHBseScsIFwiQXBwbHlcIik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY3JvcEFwcGx5QnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5jb21taXRDcm9wKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGludCBsYWJlbFxuXHRcdGNvbnN0IGhpbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLWhpbnQnKSk7XG5cdFx0aGludC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhbm5vdGF0aW9uSGludCcsIFwiRWRpdCBzY3JlZW5zaG90IHRvIGhpZ2hsaWdodCB0aGUgcHJvYmxlbVwiKTtcblxuXHRcdC8vIENhbnZhcyBjb250YWluZXJcblx0XHRjb25zdCBjYW52YXNDb250YWluZXIgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLWNhbnZhcy1jb250YWluZXInKSk7XG5cdFx0dGhpcy5jYW52YXMgPSBhcHBlbmQoY2FudmFzQ29udGFpbmVyLCAkKCdjYW52YXMnKSkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG5cdFx0Y29uc3QgY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0XHRpZiAoIWN0eCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IDJEIGNhbnZhcyBjb250ZXh0Jyk7XG5cdFx0fVxuXHRcdHRoaXMuY3R4ID0gY3R4O1xuXG5cdFx0Ly8gQ2FudmFzIHBvaW50ZXIgZXZlbnRzXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY2FudmFzLCBFdmVudFR5cGUuUE9JTlRFUl9ET1dOLCBlID0+IHRoaXMub25Qb2ludGVyRG93bihlKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNhbnZhcywgRXZlbnRUeXBlLlBPSU5URVJfTU9WRSwgZSA9PiB0aGlzLm9uUG9pbnRlck1vdmUoZSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jYW52YXMsIEV2ZW50VHlwZS5QT0lOVEVSX1VQLCBlID0+IHRoaXMub25Qb2ludGVyVXAoZSkpKTtcblxuXHRcdC8vIERvdWJsZS1jbGljayB0byBhcHBseSBjcm9wXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY2FudmFzLCBFdmVudFR5cGUuREJMQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuY29tbWl0Q3JvcCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdoZWVsOiB0b3VjaHBhZCB0d28tZmluZ2VyIHNjcm9sbCBcdTIxOTIgcGFuOyBDdHJsK3doZWVsIG9yIHBpbmNoIFx1MjE5MiB6b29tIGFyb3VuZCBjdXJzb3Jcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FudmFzQ29udGFpbmVyLCBFdmVudFR5cGUuV0hFRUwsIChlOiBXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRpZiAoZS5jdHJsS2V5KSB7XG5cdFx0XHRcdC8vIFBpbmNoLXRvLXpvb20gb24gdG91Y2hwYWQgKGJyb3dzZXIgc3ludGhlc2lzZXMgY3RybEtleSkgb3IgQ3RybCtzY3JvbGwuXG5cdFx0XHRcdC8vIFdoZWVsIGV2ZW50cyBjYW4gZmlyZSBmYXN0ZXIgdGhhbiB3ZSBjYW4gcmVkcmF3IGF0IGhpZ2ggem9vbSBsZXZlbHMsXG5cdFx0XHRcdC8vIHNvIHdlIGNvYWxlc2NlIHRoZSBkZWx0YXMgYW5kIGZsdXNoIG9uY2UgcGVyIGFuaW1hdGlvbiBmcmFtZS4gVGhpcyBrZWVwc1xuXHRcdFx0XHQvLyB0aGUgY2FudmFzIHJlYWxsb2NhdGlvbi9yZWRyYXcgY29zdCBib3VuZGVkIGFuZCBsZXRzIG90aGVyIGlucHV0IChsaWtlXG5cdFx0XHRcdC8vIGRyYXdpbmcpIGludGVybGVhdmUgcmVzcG9uc2l2ZWx5LlxuXHRcdFx0XHRjb25zdCBkZWx0YSA9IGUuZGVsdGFZICE9PSAwID8gZS5kZWx0YVkgOiBlLmRlbHRhWDtcblx0XHRcdFx0Y29uc3QgZmFjdG9yID0gZGVsdGEgPCAwID8gMS4xIDogMC45O1xuXHRcdFx0XHRjb25zdCBjb250YWluZXJSZWN0ID0gY2FudmFzQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRjb25zdCBjeCA9IGUuY2xpZW50WCAtIChjb250YWluZXJSZWN0LmxlZnQgKyBjb250YWluZXJSZWN0LndpZHRoIC8gMik7XG5cdFx0XHRcdGNvbnN0IGN5ID0gZS5jbGllbnRZIC0gKGNvbnRhaW5lclJlY3QudG9wICsgY29udGFpbmVyUmVjdC5oZWlnaHQgLyAyKTtcblx0XHRcdFx0aWYgKHRoaXMucGVuZGluZ1pvb20pIHtcblx0XHRcdFx0XHR0aGlzLnBlbmRpbmdab29tLmZhY3RvciAqPSBmYWN0b3I7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nWm9vbS5jeCA9IGN4O1xuXHRcdFx0XHRcdHRoaXMucGVuZGluZ1pvb20uY3kgPSBjeTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnBlbmRpbmdab29tID0geyBmYWN0b3IsIGN4LCBjeSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5wZW5kaW5nWm9vbVJhZikge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLmNhbnZhcyk7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nWm9vbVJhZiA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wZW5kaW5nWm9vbVJhZiA9IDA7XG5cdFx0XHRcdFx0XHR0aGlzLmZsdXNoUGVuZGluZ1pvb20oKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVHdvLWZpbmdlciBzY3JvbGwgb24gdG91Y2hwYWQgKG9yIHBsYWluIHNjcm9sbCB3aGVlbCkgXHUyMTkyIHBhblxuXHRcdFx0XHR0aGlzLnBhblggLT0gZS5kZWx0YVg7XG5cdFx0XHRcdHRoaXMucGFuWSAtPSBlLmRlbHRhWTtcblx0XHRcdFx0dGhpcy5jbGFtcFBhbigpO1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7dGhpcy5wYW5YfXB4LCAke3RoaXMucGFuWX1weClgO1xuXHRcdFx0fVxuXHRcdH0sIHsgcGFzc2l2ZTogZmFsc2UgfSkpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgc2hvcnRjdXRzXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAodGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSAmJiBlLmtleSA9PT0gJ0VzY2FwZScpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmNhbmNlbFRleHRQbGFjZW1lbnQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUua2V5ID09PSAnRXNjYXBlJykge1xuXHRcdFx0XHRpZiAodGhpcy5jcm9wTW9kZSkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuY2FuY2VsQ3JvcCgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID49IDApIHtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPSAtMTtcblx0XHRcdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUua2V5ID09PSAnRW50ZXInICYmIHRoaXMuY3JvcE1vZGUpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLmNvbW1pdENyb3AoKTtcblx0XHRcdH0gZWxzZSBpZiAoKGUua2V5ID09PSAnRGVsZXRlJyB8fCBlLmtleSA9PT0gJ0JhY2tzcGFjZScpICYmIHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29uc3QgcmVtb3ZlZEluZGV4ID0gdGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4O1xuXHRcdFx0XHRjb25zdCBbcmVtb3ZlZF0gPSB0aGlzLmFjdGlvbnMuc3BsaWNlKHJlbW92ZWRJbmRleCwgMSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA9IC0xO1xuXHRcdFx0XHQvLyBSZWNvcmQgdGhlIGRlbGV0aW9uIGFzIGFuIEVyYXNlciBzZW50aW5lbCBzbyB1bmRvL3JlZG8gd29ya3MganVzdFxuXHRcdFx0XHQvLyBsaWtlIHRoZSBlcmFzZXIgdG9vbC5cblx0XHRcdFx0dGhpcy5hY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLkVyYXNlcixcblx0XHRcdFx0XHRzdHJva2VDb2xvcjogJycsXG5cdFx0XHRcdFx0b3BhY2l0eTogMSxcblx0XHRcdFx0XHRsaW5lV2lkdGg6IDAsXG5cdFx0XHRcdFx0ZXJhc2VkQWN0aW9uczogW3JlbW92ZWRdLFxuXHRcdFx0XHRcdGVyYXNlZEluZGljZXM6IFtyZW1vdmVkSW5kZXhdLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy51bmRvbmVBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHRcdHRoaXMudXBkYXRlVW5kb1JlZG9TdGF0ZSgpO1xuXHRcdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLWZpdCBjYW52YXMgd2hlbiBjb250YWluZXIgcmVzaXplc1xuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmltYWdlRWxlbWVudCkge1xuXHRcdFx0XHQvLyBPbiByZXNpemUsIGVuc3VyZSB0aGUgdXNlcidzIGN1cnJlbnQgem9vbSBpcyBzdGlsbCBhdCBsZWFzdCB0aGUgbmV3IGZpdC10by13aW5kb3dcblx0XHRcdFx0Ly8gc2NhbGUuIFdpdGhvdXQgdGhpcywgZ3Jvd2luZyB0aGUgd2luZG93IGFmdGVyIHpvb21pbmcgb3V0IGNvdWxkIGxlYXZlIHRoZSBpbWFnZVxuXHRcdFx0XHQvLyBvcnBoYW5lZCBpbiB0aGUgY2VudHJlIHdpdGggZW1wdHkgc3BhY2UgYXJvdW5kIGl0IHRoYXQgY2FuJ3QgYmUgZmlsbGVkLlxuXHRcdFx0XHRpZiAodGhpcy5oYXNVc2VyWm9vbWVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWluU2NhbGUgPSB0aGlzLmdldEZpdFNjYWxlKCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc2NhbGUgPCBtaW5TY2FsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zY2FsZSA9IG1pblNjYWxlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNpemVDYW52YXMoKTtcblx0XHRcdFx0dGhpcy5jbGFtcFBhbigpO1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7dGhpcy5wYW5YfXB4LCAke3RoaXMucGFuWX1weClgO1xuXHRcdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoY2FudmFzQ29udGFpbmVyKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVG9vbEJ1dHRvbih0b29sYmFyOiBIVE1MRWxlbWVudCwgdG9vbDogQW5ub3RhdGlvblRvb2wsIGxhYmVsOiBzdHJpbmcsIGljb246IEhUTUxTcGFuRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ0biA9IGFwcGVuZCh0b29sYmFyLCAkKCdidXR0b24udG9vbC1idG4nKSk7XG5cdFx0YnRuLmFwcGVuZENoaWxkKGljb24pO1xuXHRcdGJ0bi50aXRsZSA9IGxhYmVsO1xuXHRcdGJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cdFx0YnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKHRvb2wgPT09IHRoaXMuYWN0aXZlVG9vbCkpO1xuXHRcdGlmICh0b29sID09PSB0aGlzLmFjdGl2ZVRvb2wpIHtcblx0XHRcdGJ0bi5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcblx0XHR9XG5cdFx0dGhpcy50b29sQnV0dG9ucy5wdXNoKHsgZWxlbWVudDogYnRuLCB0b29sIH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidG4sIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVUb29sKHRvb2wpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVG9vbE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRvb2xPcHRpb25zUG9wb3Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvb2xPcHRpb25zRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd0b29sT3B0aW9ucycsIFwiVG9vbCBPcHRpb25zXCIpKTtcblxuXHRcdHRoaXMuYXBwZW5kQ29sb3JPcHRpb25zKFxuXHRcdFx0dGhpcy50b29sT3B0aW9uc1BvcG92ZXIsXG5cdFx0XHR0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlRleHQgPyBsb2NhbGl6ZSgndGV4dENvbG9yJywgXCJUZXh0IENvbG9yXCIpIDogbG9jYWxpemUoJ3N0cm9rZUNvbG9yJywgXCJTdHJva2UgQ29sb3JcIiksXG5cdFx0XHRDT0xPUlMsXG5cdFx0XHR0aGlzLmFjdGl2ZVN0cm9rZUNvbG9yLFxuXHRcdFx0bG9jYWxpemUoJ3NldFN0cm9rZUNvbG9yJywgXCJTZXQgU3Ryb2tlIENvbG9yXCIpLFxuXHRcdFx0Y29sb3IgPT4ge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZVN0cm9rZUNvbG9yID0gY29sb3I7XG5cdFx0XHRcdHRoaXMuYXBwbHlUb29sT3B0aW9uc1RvVGV4dEVkaXQoKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0aWYgKHRoaXMuYWN0aXZlVG9vbCAhPT0gQW5ub3RhdGlvblRvb2wuRnJlZWhhbmQgJiYgdGhpcy5hY3RpdmVUb29sICE9PSBBbm5vdGF0aW9uVG9vbC5BcnJvdykge1xuXHRcdFx0dGhpcy5hcHBlbmRDb2xvck9wdGlvbnMoXG5cdFx0XHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLFxuXHRcdFx0XHR0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlRleHQgPyBsb2NhbGl6ZSgndGV4dEJhY2tncm91bmRDb2xvcicsIFwiQmFja2dyb3VuZCBDb2xvclwiKSA6IGxvY2FsaXplKCdmaWxsQ29sb3InLCBcIkZpbGwgQ29sb3JcIiksXG5cdFx0XHRcdEZJTExfQ09MT1JTLFxuXHRcdFx0XHR0aGlzLmFjdGl2ZUZpbGxDb2xvcixcblx0XHRcdFx0bG9jYWxpemUoJ3NldEZpbGxDb2xvcicsIFwiU2V0IEZpbGwgQ29sb3JcIiksXG5cdFx0XHRcdGNvbG9yID0+IHtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZpbGxDb2xvciA9IGNvbG9yO1xuXHRcdFx0XHRcdHRoaXMuYXBwbHlUb29sT3B0aW9uc1RvVGV4dEVkaXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGVuZFNpemVPcHRpb25zKHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyKTtcblx0XHR0aGlzLmFwcGVuZE9wYWNpdHlPcHRpb25zKHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kQ29sb3JPcHRpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIGNvbG9yczogc3RyaW5nW10sIHNlbGVjdGVkQ29sb3I6IHN0cmluZywgYXJpYUxhYmVsUHJlZml4OiBzdHJpbmcsIG9uU2VsZWN0OiAoY29sb3I6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2LmFubm90YXRpb24tdG9vbC1vcHRpb25zLWdyb3VwJykpO1xuXHRcdGFwcGVuZChncm91cCwgJCgnc3Bhbi5hbm5vdGF0aW9uLXRvb2wtb3B0aW9ucy1sYWJlbCcpKS50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdGNvbnN0IHN3YXRjaGVzID0gYXBwZW5kKGdyb3VwLCAkKCdkaXYuYW5ub3RhdGlvbi1jb2xvci1zd2F0Y2hlcycpKTtcblx0XHRmb3IgKGNvbnN0IGNvbG9yIG9mIGNvbG9ycykge1xuXHRcdFx0Y29uc3Qgc3dhdGNoID0gYXBwZW5kKHN3YXRjaGVzLCAkKCdidXR0b24uYW5ub3RhdGlvbi1jb2xvci1zd2F0Y2gnKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0XHRjb25zdCBpc1RyYW5zcGFyZW50ID0gY29sb3IgPT09ICd0cmFuc3BhcmVudCc7XG5cdFx0XHRzd2F0Y2guY2xhc3NMaXN0LnRvZ2dsZSgndHJhbnNwYXJlbnQnLCBpc1RyYW5zcGFyZW50KTtcblx0XHRcdHN3YXRjaC5jbGFzc0xpc3QudG9nZ2xlKCdsaWdodC1zd2F0Y2gnLCBMSUdIVF9TV0FUQ0hfQ09MT1JTLmhhcyhjb2xvcikpO1xuXHRcdFx0c3dhdGNoLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGlzVHJhbnNwYXJlbnQgPyAndHJhbnNwYXJlbnQnIDogY29sb3I7XG5cdFx0XHRzd2F0Y2guc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgaXNUcmFuc3BhcmVudCA/IGxvY2FsaXplKCd0cmFuc3BhcmVudENvbG9yJywgXCJ7MH06IFRyYW5zcGFyZW50XCIsIGFyaWFMYWJlbFByZWZpeCkgOiBsb2NhbGl6ZSgnY29sb3JWYWx1ZScsIFwiezB9OiB7MX1cIiwgYXJpYUxhYmVsUHJlZml4LCBjb2xvcikpO1xuXHRcdFx0c3dhdGNoLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKGNvbG9yID09PSBzZWxlY3RlZENvbG9yKSk7XG5cdFx0XHRzd2F0Y2guY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgY29sb3IgPT09IHNlbGVjdGVkQ29sb3IpO1xuXHRcdFx0dGhpcy50b29sT3B0aW9uc0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc3dhdGNoLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRvblNlbGVjdChjb2xvcik7XG5cdFx0XHRcdHRoaXMucmVuZGVyVG9vbE9wdGlvbnMoKTtcblx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZFNpemVPcHRpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpc1RleHQgPSB0aGlzLmFjdGl2ZVRvb2wgPT09IEFubm90YXRpb25Ub29sLlRleHQ7XG5cdFx0Y29uc3QgdmFsdWVzID0gaXNUZXh0ID8gVEVYVF9TSVpFUyA6IFNUUk9LRV9XSURUSFM7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRWYWx1ZSA9IGlzVGV4dCA/IHRoaXMuYWN0aXZlRm9udFNpemUgOiB0aGlzLmFjdGl2ZUxpbmVXaWR0aDtcblx0XHRjb25zdCBncm91cCA9IGFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLXRvb2wtb3B0aW9ucy1ncm91cCcpKTtcblx0XHRhcHBlbmQoZ3JvdXAsICQoJ3NwYW4uYW5ub3RhdGlvbi10b29sLW9wdGlvbnMtbGFiZWwnKSkudGV4dENvbnRlbnQgPSBpc1RleHQgPyBsb2NhbGl6ZSgndGV4dFNpemUnLCBcIlRleHQgU2l6ZVwiKSA6IGxvY2FsaXplKCdzdHJva2VXaWR0aCcsIFwiU3Ryb2tlIFdpZHRoXCIpO1xuXHRcdGNvbnN0IGJ1dHRvbnMgPSBhcHBlbmQoZ3JvdXAsICQoJ2Rpdi5hbm5vdGF0aW9uLXNpemUtYnV0dG9ucycpKTtcblx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gYXBwZW5kKGJ1dHRvbnMsICQoJ2J1dHRvbi5hbm5vdGF0aW9uLXNpemUtYnV0dG9uJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0YnV0dG9uLnRleHRDb250ZW50ID0gYCR7dmFsdWV9YDtcblx0XHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBpc1RleHQgPyBsb2NhbGl6ZSgnc2V0VGV4dFNpemUnLCBcIlNldCBUZXh0IFNpemUgdG8gezB9cHhcIiwgdmFsdWUpIDogbG9jYWxpemUoJ3NldFN0cm9rZVdpZHRoJywgXCJTZXQgU3Ryb2tlIFdpZHRoIHRvIHswfXB4XCIsIHZhbHVlKSk7XG5cdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodmFsdWUgPT09IHNlbGVjdGVkVmFsdWUpKTtcblx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCB2YWx1ZSA9PT0gc2VsZWN0ZWRWYWx1ZSk7XG5cdFx0XHR0aGlzLnRvb2xPcHRpb25zRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGlmIChpc1RleHQpIHtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvbnRTaXplID0gdmFsdWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVMaW5lV2lkdGggPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmFwcGx5VG9vbE9wdGlvbnNUb1RleHRFZGl0KCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyVG9vbE9wdGlvbnMoKTtcblx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZE9wYWNpdHlPcHRpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IGFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5hbm5vdGF0aW9uLXRvb2wtb3B0aW9ucy1ncm91cC5hbm5vdGF0aW9uLW9wYWNpdHktb3B0aW9ucycpKTtcblx0XHRjb25zdCBsYWJlbCA9IGFwcGVuZChncm91cCwgJCgnbGFiZWwuYW5ub3RhdGlvbi10b29sLW9wdGlvbnMtbGFiZWwnKSk7XG5cdFx0bGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb3BhY2l0eScsIFwiT3BhY2l0eVwiKTtcblx0XHRjb25zdCBpbnB1dCA9IGFwcGVuZChncm91cCwgJCgnaW5wdXQuYW5ub3RhdGlvbi1vcGFjaXR5LXNsaWRlcicpKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXHRcdGlucHV0LnR5cGUgPSAncmFuZ2UnO1xuXHRcdGlucHV0Lm1pbiA9ICcyMCc7XG5cdFx0aW5wdXQubWF4ID0gJzEwMCc7XG5cdFx0aW5wdXQuc3RlcCA9ICcxMCc7XG5cdFx0aW5wdXQudmFsdWUgPSBgJHtNYXRoLnJvdW5kKHRoaXMuYWN0aXZlT3BhY2l0eSAqIDEwMCl9YDtcblx0XHRpbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnc2V0T3BhY2l0eScsIFwiU2V0IE9wYWNpdHlcIikpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXBwZW5kKGdyb3VwLCAkKCdzcGFuLmFubm90YXRpb24tb3BhY2l0eS12YWx1ZScpKTtcblx0XHR2YWx1ZS50ZXh0Q29udGVudCA9IGAke2lucHV0LnZhbHVlfSVgO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0LCBFdmVudFR5cGUuSU5QVVQsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuYWN0aXZlT3BhY2l0eSA9IE51bWJlcihpbnB1dC52YWx1ZSkgLyAxMDA7XG5cdFx0XHR2YWx1ZS50ZXh0Q29udGVudCA9IGAke2lucHV0LnZhbHVlfSVgO1xuXHRcdFx0dGhpcy5hcHBseVRvb2xPcHRpb25zVG9UZXh0RWRpdCgpO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5VG9vbE9wdGlvbnNUb1RleHRFZGl0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudGV4dEVkaXRTdGF0ZS5zdHJva2VDb2xvciA9IHRoaXMuYWN0aXZlU3Ryb2tlQ29sb3I7XG5cdFx0dGhpcy50ZXh0RWRpdFN0YXRlLmZpbGxDb2xvciA9IHRoaXMuYWN0aXZlRmlsbENvbG9yO1xuXHRcdHRoaXMudGV4dEVkaXRTdGF0ZS5vcGFjaXR5ID0gdGhpcy5hY3RpdmVPcGFjaXR5O1xuXHRcdHRoaXMudGV4dEVkaXRTdGF0ZS5mb250U2l6ZSA9IHRoaXMuYWN0aXZlRm9udFNpemU7XG5cdH1cblxuXHRwcml2YXRlIHNob3dUb29sT3B0aW9ucyhhbmNob3I6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRvb2xPcHRpb25zUG9wb3ZlciB8fCAhdGhpcy5oYXNUb29sT3B0aW9ucyh0aGlzLmFjdGl2ZVRvb2wpKSB7XG5cdFx0XHR0aGlzLmhpZGVUb29sT3B0aW9ucygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlclRvb2xPcHRpb25zKCk7XG5cdFx0Y29uc3QgY29udGFpbmVyUmVjdCA9IHRoaXMuY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGFuY2hvclJlY3QgPSBhbmNob3IuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0dGhpcy50b29sT3B0aW9uc1BvcG92ZXIuc3R5bGUudG9wID0gYCR7YW5jaG9yUmVjdC5ib3R0b20gLSBjb250YWluZXJSZWN0LnRvcCArIDZ9cHhgO1xuXHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0Y29uc3QgaGFsZldpZHRoID0gdGhpcy50b29sT3B0aW9uc1BvcG92ZXIub2Zmc2V0V2lkdGggLyAyO1xuXHRcdGNvbnN0IGRlc2lyZWRMZWZ0ID0gYW5jaG9yUmVjdC5sZWZ0ICsgYW5jaG9yUmVjdC53aWR0aCAvIDIgLSBjb250YWluZXJSZWN0LmxlZnQ7XG5cdFx0Y29uc3QgbWluTGVmdCA9IGhhbGZXaWR0aCArIDg7XG5cdFx0Y29uc3QgbWF4TGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIGNvbnRhaW5lclJlY3Qud2lkdGggLSBoYWxmV2lkdGggLSA4KTtcblx0XHR0aGlzLnRvb2xPcHRpb25zUG9wb3Zlci5zdHlsZS5sZWZ0ID0gYCR7TWF0aC5taW4oTWF0aC5tYXgoZGVzaXJlZExlZnQsIG1pbkxlZnQpLCBtYXhMZWZ0KX1weGA7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVUb29sT3B0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50b29sT3B0aW9uc1BvcG92ZXIpIHtcblx0XHRcdHRoaXMudG9vbE9wdGlvbnNQb3BvdmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNUb29sT3B0aW9ucyh0b29sOiBBbm5vdGF0aW9uVG9vbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0b29sID09PSBBbm5vdGF0aW9uVG9vbC5GcmVlaGFuZFxuXHRcdFx0fHwgdG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuUmVjdGFuZ2xlXG5cdFx0XHR8fCB0b29sID09PSBBbm5vdGF0aW9uVG9vbC5FbGxpcHNlXG5cdFx0XHR8fCB0b29sID09PSBBbm5vdGF0aW9uVG9vbC5BcnJvd1xuXHRcdFx0fHwgdG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuVGV4dDtcblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aXZlVG9vbCh0b29sOiBBbm5vdGF0aW9uVG9vbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRleHRFZGl0U3RhdGUgJiYgdG9vbCAhPT0gQW5ub3RhdGlvblRvb2wuVGV4dCkge1xuXHRcdFx0dGhpcy5jb21taXRUZXh0RWRpdCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy50ZXh0UGxhY2VtZW50U3RhdGUgJiYgdG9vbCAhPT0gQW5ub3RhdGlvblRvb2wuVGV4dCkge1xuXHRcdFx0dGhpcy5jYW5jZWxUZXh0UGxhY2VtZW50KCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3BlY2lhbCBoYW5kbGluZyBmb3IgQ3JvcDogZW50ZXIgY3JvcCBtb2RlIChkb24ndCBjaGFuZ2UgYWN0aXZlVG9vbCB0byBDcm9wIHBlcnNpc3RlbnRseSlcblx0XHRpZiAodG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuQ3JvcCkge1xuXHRcdFx0dGhpcy5oaWRlVG9vbE9wdGlvbnMoKTtcblx0XHRcdHRoaXMuZW50ZXJDcm9wTW9kZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWN0aXZlVG9vbCA9IHRvb2w7XG5cdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gLTE7XG5cdFx0Zm9yIChjb25zdCB0YiBvZiB0aGlzLnRvb2xCdXR0b25zKSB7XG5cdFx0XHR0Yi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIHRiLnRvb2wgPT09IHRvb2wpO1xuXHRcdFx0dGIuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyh0Yi50b29sID09PSB0b29sKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZVRvb2xCdXR0b24gPSB0aGlzLnRvb2xCdXR0b25zLmZpbmQodGIgPT4gdGIudG9vbCA9PT0gdG9vbCk/LmVsZW1lbnQ7XG5cdFx0aWYgKGFjdGl2ZVRvb2xCdXR0b24gJiYgdGhpcy5oYXNUb29sT3B0aW9ucyh0b29sKSkge1xuXHRcdFx0dGhpcy5zaG93VG9vbE9wdGlvbnMoYWN0aXZlVG9vbEJ1dHRvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaGlkZVRvb2xPcHRpb25zKCk7XG5cdFx0fVxuXHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9IHRvb2wgPT09IEFubm90YXRpb25Ub29sLlNlbGVjdCA/ICdkZWZhdWx0JyA6XG5cdFx0XHR0b29sID09PSBBbm5vdGF0aW9uVG9vbC5QYW4gPyAnZ3JhYicgOlxuXHRcdFx0XHR0b29sID09PSBBbm5vdGF0aW9uVG9vbC5FcmFzZXIgPyAndXJsKFwiZGF0YTppbWFnZS9zdmcreG1sLDxzdmcgeG1sbnM9XFwnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcXCcgd2lkdGg9XFwnMjRcXCcgaGVpZ2h0PVxcJzI0XFwnIHZpZXdwb3J0PVxcJzAgMCAyNCAyNFxcJz48Y2lyY2xlIGN4PVxcJzEyXFwnIGN5PVxcJzEyXFwnIHI9XFwnOVxcJyBmaWxsPVxcJ25vbmVcXCcgc3Ryb2tlPVxcJyUyM2ZmZlxcJyBzdHJva2Utd2lkdGg9XFwnMlxcJy8+PGNpcmNsZSBjeD1cXCcxMlxcJyBjeT1cXCcxMlxcJyByPVxcJzlcXCcgZmlsbD1cXCdub25lXFwnIHN0cm9rZT1cXCclMjMwMDBcXCcgc3Ryb2tlLXdpZHRoPVxcJzFcXCcgc3Ryb2tlLWRhc2hhcnJheT1cXCcyIDJcXCcvPjwvc3ZnPlwiKSAxMiAxMiwgY2VsbCcgOiAnY3Jvc3NoYWlyJztcblx0XHR0aGlzLnJlZHJhdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnRlckNyb3BNb2RlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNyb3BNb2RlIHx8ICF0aGlzLm9yaWdpbmFsSW1hZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU2F2ZSBjdXJyZW50IHN0YXRlIGZvciBjYW5jZWxcblx0XHR0aGlzLnByZUNyb3BTdGF0ZSA9IHtcblx0XHRcdGVsZW1lbnQ6IHRoaXMuaW1hZ2VFbGVtZW50ISxcblx0XHRcdHdpZHRoOiB0aGlzLmltYWdlV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IHRoaXMuaW1hZ2VIZWlnaHQsXG5cdFx0XHRjdXJyZW50Q3JvcDogdGhpcy5jdXJyZW50Q3JvcCxcblx0XHR9O1xuXHRcdC8vIFN3aXRjaCB0byBvcmlnaW5hbCBpbWFnZSBzbyB1c2VyIGNhbiBleHBhbmQgY3JvcCByZWdpb25cblx0XHR0aGlzLmltYWdlRWxlbWVudCA9IHRoaXMub3JpZ2luYWxJbWFnZS5lbGVtZW50O1xuXHRcdHRoaXMuaW1hZ2VXaWR0aCA9IHRoaXMub3JpZ2luYWxJbWFnZS53aWR0aDtcblx0XHR0aGlzLmltYWdlSGVpZ2h0ID0gdGhpcy5vcmlnaW5hbEltYWdlLmhlaWdodDtcblx0XHQvLyBJbml0aWFsIGNyb3AgcmVnaW9uID0gY3VycmVudCBjcm9wIChvciBmdWxsIG9yaWdpbmFsKVxuXHRcdHRoaXMuY3JvcFJlZ2lvbiA9IHRoaXMuY3VycmVudENyb3Bcblx0XHRcdD8geyAuLi50aGlzLmN1cnJlbnRDcm9wIH1cblx0XHRcdDogeyB4OiAwLCB5OiAwLCB3aWR0aDogdGhpcy5vcmlnaW5hbEltYWdlLndpZHRoLCBoZWlnaHQ6IHRoaXMub3JpZ2luYWxJbWFnZS5oZWlnaHQgfTtcblx0XHR0aGlzLmNyb3BNb2RlID0gdHJ1ZTtcblx0XHQvLyBNYXJrIGNyb3AgdG9vbCBidXR0b24gYWN0aXZlXG5cdFx0Zm9yIChjb25zdCB0YiBvZiB0aGlzLnRvb2xCdXR0b25zKSB7XG5cdFx0XHR0Yi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIHRiLnRvb2wgPT09IEFubm90YXRpb25Ub29sLkNyb3ApO1xuXHRcdH1cblx0XHQvLyBUb2dnbGUgdG9vbGJhcnNcblx0XHRpZiAodGhpcy5tYWluVG9vbGJhcikgeyB0aGlzLm1haW5Ub29sYmFyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IH1cblx0XHRpZiAodGhpcy5jcm9wVG9vbGJhcikgeyB0aGlzLmNyb3BUb29sYmFyLnN0eWxlLmRpc3BsYXkgPSAnJzsgfVxuXHRcdC8vIFJlc2V0IHpvb20vcGFuIHRvIGZpdCBvcmlnaW5hbFxuXHRcdHRoaXMuaGFzVXNlclpvb21lZCA9IGZhbHNlO1xuXHRcdHRoaXMucGFuWCA9IDA7XG5cdFx0dGhpcy5wYW5ZID0gMDtcblx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XG5cdFx0dGhpcy5zaXplQ2FudmFzKCk7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgZXhpdENyb3BNb2RlKCk6IHZvaWQge1xuXHRcdHRoaXMuY3JvcE1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLmNyb3BSZWdpb24gPSBudWxsO1xuXHRcdHRoaXMuY3JvcERyYWdIYW5kbGUgPSBudWxsO1xuXHRcdHRoaXMuY3JvcFJlZ2lvblN0YXJ0ID0gbnVsbDtcblx0XHR0aGlzLnByZUNyb3BTdGF0ZSA9IG51bGw7XG5cdFx0Ly8gUmVzdG9yZSBtYWluIHRvb2xiYXJcblx0XHRpZiAodGhpcy5tYWluVG9vbGJhcikgeyB0aGlzLm1haW5Ub29sYmFyLnN0eWxlLmRpc3BsYXkgPSAnJzsgfVxuXHRcdGlmICh0aGlzLmNyb3BUb29sYmFyKSB7IHRoaXMuY3JvcFRvb2xiYXIuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgfVxuXHRcdC8vIFJlYWN0aXZhdGUgcHJldmlvdXMgdG9vbFxuXHRcdHRoaXMuc2V0QWN0aXZlVG9vbCh0aGlzLmFjdGl2ZVRvb2wpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21taXRDcm9wKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jcm9wTW9kZSB8fCAhdGhpcy5jcm9wUmVnaW9uIHx8ICF0aGlzLm9yaWdpbmFsSW1hZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3IgPSB0aGlzLm5vcm1hbGl6ZUNyb3BSZWN0KHRoaXMuY3JvcFJlZ2lvbik7XG5cdFx0aWYgKGNyLndpZHRoIDwgMTAgfHwgY3IuaGVpZ2h0IDwgMTApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3JvcEZyb20gPSB0aGlzLnByZUNyb3BTdGF0ZT8uY3VycmVudENyb3AgPz8gbnVsbDtcblx0XHQvLyBQdXNoIGEgQ3JvcCBzZW50aW5lbCBpbnRvIHRoZSBsaW5lYXIgdW5kbyBzdGFjayBzbyB1bmRvL3JlZG8gdHJlYXRzIGl0XG5cdFx0Ly8gbGlrZSBhbnkgb3RoZXIgYWN0aW9uLlxuXHRcdGNvbnN0IGNyb3BBY3Rpb246IERyYXdBY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBbm5vdGF0aW9uVG9vbC5Dcm9wLFxuXHRcdFx0c3Ryb2tlQ29sb3I6ICcnLFxuXHRcdFx0b3BhY2l0eTogMSxcblx0XHRcdGxpbmVXaWR0aDogMCxcblx0XHRcdGNyb3BGcm9tLFxuXHRcdFx0Y3JvcFRvOiBjcixcblx0XHR9O1xuXHRcdHRoaXMuYWN0aW9ucy5wdXNoKGNyb3BBY3Rpb24pO1xuXHRcdHRoaXMudW5kb25lQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdHRoaXMudXBkYXRlVW5kb1JlZG9TdGF0ZSgpO1xuXHRcdHRoaXMuaGFzVXNlclpvb21lZCA9IGZhbHNlO1xuXHRcdHRoaXMucGFuWCA9IDA7XG5cdFx0dGhpcy5wYW5ZID0gMDtcblx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSAnJztcblx0XHR0aGlzLmV4aXRDcm9wTW9kZSgpO1xuXHRcdHRoaXMuYXBwbHlEaXNwbGF5ZWRDcm9wKGNyKTtcblx0fVxuXG5cdHByaXZhdGUgY2FuY2VsQ3JvcCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3JvcE1vZGUgfHwgIXRoaXMucHJlQ3JvcFN0YXRlKSB7XG5cdFx0XHR0aGlzLmV4aXRDcm9wTW9kZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBSZXN0b3JlIHRoZSBwcmUtY3JvcCBkaXNwbGF5ZWQgc3RhdGUuIEFubm90YXRpb25zIGxpdmUgaW4gb3JpZ2luYWwgY29vcmRzXG5cdFx0Ly8gYW5kIGRvbid0IG5lZWQgdG8gYmUgdG91Y2hlZC5cblx0XHR0aGlzLmltYWdlRWxlbWVudCA9IHRoaXMucHJlQ3JvcFN0YXRlLmVsZW1lbnQ7XG5cdFx0dGhpcy5pbWFnZVdpZHRoID0gdGhpcy5wcmVDcm9wU3RhdGUud2lkdGg7XG5cdFx0dGhpcy5pbWFnZUhlaWdodCA9IHRoaXMucHJlQ3JvcFN0YXRlLmhlaWdodDtcblx0XHR0aGlzLmN1cnJlbnRDcm9wID0gdGhpcy5wcmVDcm9wU3RhdGUuY3VycmVudENyb3A7XG5cdFx0dGhpcy5oYXNVc2VyWm9vbWVkID0gZmFsc2U7XG5cdFx0dGhpcy5wYW5YID0gMDtcblx0XHR0aGlzLnBhblkgPSAwO1xuXHRcdHRoaXMuY2FudmFzLnN0eWxlLnRyYW5zZm9ybSA9ICcnO1xuXHRcdHRoaXMuZXhpdENyb3BNb2RlKCk7XG5cdFx0dGhpcy5zaXplQ2FudmFzKCk7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEltYWdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGltZyA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW1nJyk7XG5cdFx0aW1nLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdHRoaXMuaW1hZ2VFbGVtZW50ID0gaW1nO1xuXHRcdFx0dGhpcy5pbWFnZVdpZHRoID0gaW1nLm5hdHVyYWxXaWR0aDtcblx0XHRcdHRoaXMuaW1hZ2VIZWlnaHQgPSBpbWcubmF0dXJhbEhlaWdodDtcblx0XHRcdC8vIFByZXNlcnZlIHRoZSBvcmlnaW5hbCBpbWFnZSBzbyBjcm9wcyBjYW4gYmUgcmUtZXhwYW5kZWRcblx0XHRcdHRoaXMub3JpZ2luYWxJbWFnZSA9IHsgZWxlbWVudDogaW1nLCB3aWR0aDogaW1nLm5hdHVyYWxXaWR0aCwgaGVpZ2h0OiBpbWcubmF0dXJhbEhlaWdodCB9O1xuXHRcdFx0dGhpcy5jdXJyZW50Q3JvcCA9IG51bGw7XG5cblx0XHRcdC8vIFJlc3RvcmUgcHJpb3IgYWN0aW9ucyAoY2xvbmUgc28gdW5kby9yZWRvIHN0YXRlIHN1cnZpdmVzIHJlb3BlbnMpLlxuXHRcdFx0Ly8gVXNlIGEgc2hhcmVkIGlkZW50aXR5IG1hcCBzbyBNb3ZlL0VyYXNlciBzZW50aW5lbHMga2VlcCBwb2ludGluZyBhdFxuXHRcdFx0Ly8gdGhlIGNvcnJlY3QgY2xvbmVkIGFjdGlvbiByZWZlcmVuY2VzLCBib3RoIGluIGFjdGlvbnNbXSBhbmRcblx0XHRcdC8vIHVuZG9uZUFjdGlvbnNbXS5cblx0XHRcdGlmICh0aGlzLmluaXRpYWxTdGF0ZSAmJiAodGhpcy5pbml0aWFsU3RhdGUuYWN0aW9ucy5sZW5ndGggfHwgdGhpcy5pbml0aWFsU3RhdGUudW5kb25lQWN0aW9ucy5sZW5ndGgpKSB7XG5cdFx0XHRcdGNvbnN0IGlkZW50aXR5TWFwID0gbmV3IE1hcDxJQW5ub3RhdGlvbkRyYXdBY3Rpb24sIElBbm5vdGF0aW9uRHJhd0FjdGlvbj4oKTtcblx0XHRcdFx0dGhpcy5hY3Rpb25zLnB1c2goLi4udGhpcy5pbml0aWFsU3RhdGUuYWN0aW9ucy5tYXAoYSA9PiBjbG9uZURyYXdBY3Rpb24oYSwgaWRlbnRpdHlNYXApKSk7XG5cdFx0XHRcdHRoaXMudW5kb25lQWN0aW9ucy5wdXNoKC4uLnRoaXMuaW5pdGlhbFN0YXRlLnVuZG9uZUFjdGlvbnMubWFwKGEgPT4gY2xvbmVEcmF3QWN0aW9uKGEsIGlkZW50aXR5TWFwKSkpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzdG9yZSBwcmlvciBjcm9wLCBpZiBhbnkuXG5cdFx0XHR0aGlzLmFwcGx5RGlzcGxheWVkQ3JvcCh0aGlzLmluaXRpYWxTdGF0ZT8uY3JvcCA/PyBudWxsKTtcblx0XHR9O1xuXHRcdC8vIFVzZSBvcmlnaW5hbCBzY3JlZW5zaG90IChub3QgYW5ub3RhdGVkKSBzbyB3ZSBjYW4gcmUtY3JvcCBmcm9tIGZ1bGwgb3JpZ2luYWxcblx0XHRpbWcuc3JjID0gdGhpcy5zY3JlZW5zaG90LmRhdGFVcmw7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBkaXNwbGF5ZWQgaW1hZ2UgdG8gcmVmbGVjdCB0aGUgZ2l2ZW4gY3JvcCAob3IgdGhlIGZ1bGwgb3JpZ2luYWxcblx0ICogd2hlbiBudWxsKS4gQ3JvcHBlZCBpbWFnZXMgYXJlIHJlLXJhc3Rlcml6ZWQgZnJvbSB0aGUgcHJlc2VydmVkIG9yaWdpbmFsIHNvXG5cdCAqIHVuZG8vcmVkbyBvZiBjcm9wIGFjdGlvbnMgaXMgZnVsbHkgcmV2ZXJzaWJsZSB3aXRob3V0IGtlZXBpbmcgaW50ZXJtZWRpYXRlXG5cdCAqIGltYWdlIGVsZW1lbnRzIGFyb3VuZC5cblx0ICovXG5cdHByaXZhdGUgYXBwbHlEaXNwbGF5ZWRDcm9wKGNyb3A6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm9yaWdpbmFsSW1hZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFjcm9wKSB7XG5cdFx0XHR0aGlzLmltYWdlRWxlbWVudCA9IHRoaXMub3JpZ2luYWxJbWFnZS5lbGVtZW50O1xuXHRcdFx0dGhpcy5pbWFnZVdpZHRoID0gdGhpcy5vcmlnaW5hbEltYWdlLndpZHRoO1xuXHRcdFx0dGhpcy5pbWFnZUhlaWdodCA9IHRoaXMub3JpZ2luYWxJbWFnZS5oZWlnaHQ7XG5cdFx0XHR0aGlzLmN1cnJlbnRDcm9wID0gbnVsbDtcblx0XHRcdHRoaXMuc2l6ZUNhbnZhcygpO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3IgPSB7XG5cdFx0XHR4OiBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLm9yaWdpbmFsSW1hZ2Uud2lkdGgsIGNyb3AueCkpLFxuXHRcdFx0eTogTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5vcmlnaW5hbEltYWdlLmhlaWdodCwgY3JvcC55KSksXG5cdFx0XHR3aWR0aDogTWF0aC5tYXgoMSwgTWF0aC5taW4odGhpcy5vcmlnaW5hbEltYWdlLndpZHRoIC0gTWF0aC5tYXgoMCwgY3JvcC54KSwgY3JvcC53aWR0aCkpLFxuXHRcdFx0aGVpZ2h0OiBNYXRoLm1heCgxLCBNYXRoLm1pbih0aGlzLm9yaWdpbmFsSW1hZ2UuaGVpZ2h0IC0gTWF0aC5tYXgoMCwgY3JvcC55KSwgY3JvcC5oZWlnaHQpKSxcblx0XHR9O1xuXHRcdGNvbnN0IGNyb3BDYW52YXMgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdGNyb3BDYW52YXMud2lkdGggPSBjci53aWR0aDtcblx0XHRjcm9wQ2FudmFzLmhlaWdodCA9IGNyLmhlaWdodDtcblx0XHRjb25zdCBjcm9wQ3R4ID0gY3JvcENhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcblx0XHRjcm9wQ3R4LmRyYXdJbWFnZSh0aGlzLm9yaWdpbmFsSW1hZ2UuZWxlbWVudCwgY3IueCwgY3IueSwgY3Iud2lkdGgsIGNyLmhlaWdodCwgMCwgMCwgY3Iud2lkdGgsIGNyLmhlaWdodCk7XG5cblx0XHRjb25zdCBjcm9wcGVkSW1nID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcblx0XHRjcm9wcGVkSW1nLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdHRoaXMuaW1hZ2VFbGVtZW50ID0gY3JvcHBlZEltZztcblx0XHRcdHRoaXMuaW1hZ2VXaWR0aCA9IGNyb3BwZWRJbWcubmF0dXJhbFdpZHRoO1xuXHRcdFx0dGhpcy5pbWFnZUhlaWdodCA9IGNyb3BwZWRJbWcubmF0dXJhbEhlaWdodDtcblx0XHRcdHRoaXMuY3VycmVudENyb3AgPSBjcjtcblx0XHRcdHRoaXMuc2l6ZUNhbnZhcygpO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9O1xuXHRcdGNyb3BwZWRJbWcuc3JjID0gY3JvcENhbnZhcy50b0RhdGFVUkwoJ2ltYWdlL3BuZycpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYXB0dXJlU3RhdGUoKTogSUFubm90YXRpb25FZGl0b3JTdGF0ZSB7XG5cdFx0Y29uc3QgaWRlbnRpdHlNYXAgPSBuZXcgTWFwPElBbm5vdGF0aW9uRHJhd0FjdGlvbiwgSUFubm90YXRpb25EcmF3QWN0aW9uPigpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY3Rpb25zOiB0aGlzLmFjdGlvbnMubWFwKGEgPT4gY2xvbmVEcmF3QWN0aW9uKGEsIGlkZW50aXR5TWFwKSksXG5cdFx0XHR1bmRvbmVBY3Rpb25zOiB0aGlzLnVuZG9uZUFjdGlvbnMubWFwKGEgPT4gY2xvbmVEcmF3QWN0aW9uKGEsIGlkZW50aXR5TWFwKSksXG5cdFx0XHRjcm9wOiB0aGlzLmN1cnJlbnRDcm9wID8geyAuLi50aGlzLmN1cnJlbnRDcm9wIH0gOiBudWxsLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHNpemVDYW52YXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5jYW52YXMucGFyZW50RWxlbWVudDtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLmNhbnZhcyk7XG5cdFx0Y29uc3QgZHByID0gdGFyZ2V0V2luZG93LmRldmljZVBpeGVsUmF0aW8gfHwgMTtcblx0XHRjb25zdCBtYXhXaWR0aCA9IGNvbnRhaW5lci5jbGllbnRXaWR0aCAtIENBTlZBU19CUkVBVEhJTkdfUk9PTSAqIDI7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gY29udGFpbmVyLmNsaWVudEhlaWdodCAtIENBTlZBU19CUkVBVEhJTkdfUk9PTSAqIDI7XG5cblx0XHQvLyBPbmx5IGF1dG8tZml0IG9uIGluaXRpYWwgbG9hZDsgcmVzcGVjdCB1c2VyIHpvb20gYWZ0ZXIgdGhhdFxuXHRcdGlmICghdGhpcy5oYXNVc2VyWm9vbWVkKSB7XG5cdFx0XHRjb25zdCBzY2FsZVggPSBtYXhXaWR0aCAvIHRoaXMuaW1hZ2VXaWR0aDtcblx0XHRcdGNvbnN0IHNjYWxlWSA9IG1heEhlaWdodCAvIHRoaXMuaW1hZ2VIZWlnaHQ7XG5cdFx0XHR0aGlzLnNjYWxlID0gTWF0aC5taW4oc2NhbGVYLCBzY2FsZVksIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BsYXlXaWR0aCA9IE1hdGguZmxvb3IodGhpcy5pbWFnZVdpZHRoICogdGhpcy5zY2FsZSk7XG5cdFx0Y29uc3QgZGlzcGxheUhlaWdodCA9IE1hdGguZmxvb3IodGhpcy5pbWFnZUhlaWdodCAqIHRoaXMuc2NhbGUpO1xuXG5cdFx0dGhpcy5jYW52YXMuc3R5bGUud2lkdGggPSBgJHtkaXNwbGF5V2lkdGh9cHhgO1xuXHRcdHRoaXMuY2FudmFzLnN0eWxlLmhlaWdodCA9IGAke2Rpc3BsYXlIZWlnaHR9cHhgO1xuXG5cdFx0Ly8gQ2FwIHRoZSBiYWNraW5nIGJ1ZmZlciBzbyBhIDE5MjBcdTAwRDcxMDgwIGltYWdlIGF0IDhcdTAwRDcgem9vbSArIGRwciAyIGRvZXNuJ3QgdHJ5IHRvXG5cdFx0Ly8gYWxsb2NhdGUgYSAzMGtcdTAwRDcxN2sgY2FudmFzICh+MkdCIEdQVSBtZW1vcnkpIHBlciB3aGVlbCB0aWNrLiBXaGVuIHRoZSBuYXR1cmFsXG5cdFx0Ly8gYmFja2luZyBzaXplIGV4Y2VlZHMgdGhlIGNhcCwgdGhlIGJyb3dzZXIgQ1NTLXN0cmV0Y2hlcyB0aGUgY2FudmFzIChzbGlnaHRcblx0XHQvLyBwaXhlbGF0aW9uIGF0IGV4dHJlbWUgem9vbSkgYnV0IGFsbG9jYXRpb24gYW5kIGRyYXdpbmcgc3RheSBjaGVhcC5cblx0XHRjb25zdCBNQVhfQkFDS0lOR19ESU0gPSA0MDk2O1xuXHRcdGNvbnN0IG5hdHVyYWxXID0gZGlzcGxheVdpZHRoICogZHByO1xuXHRcdGNvbnN0IG5hdHVyYWxIID0gZGlzcGxheUhlaWdodCAqIGRwcjtcblx0XHRjb25zdCBvdmVyYWdlID0gTWF0aC5tYXgoMSwgbmF0dXJhbFcgLyBNQVhfQkFDS0lOR19ESU0sIG5hdHVyYWxIIC8gTUFYX0JBQ0tJTkdfRElNKTtcblx0XHRjb25zdCBlZmZlY3RpdmVEcHIgPSBkcHIgLyBvdmVyYWdlO1xuXHRcdHRoaXMuY2FudmFzLndpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihkaXNwbGF5V2lkdGggKiBlZmZlY3RpdmVEcHIpKTtcblx0XHR0aGlzLmNhbnZhcy5oZWlnaHQgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKGRpc3BsYXlIZWlnaHQgKiBlZmZlY3RpdmVEcHIpKTtcblxuXHRcdHRoaXMuY3R4LnNldFRyYW5zZm9ybShlZmZlY3RpdmVEcHIsIDAsIDAsIGVmZmVjdGl2ZURwciwgMCwgMCk7XG5cdH1cblxuXHRwcml2YXRlIGNhbnZhc0Nvb3JkcyhlOiBQb2ludGVyRXZlbnQpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eDogKGUuY2xpZW50WCAtIHJlY3QubGVmdCkgLyB0aGlzLnNjYWxlICsgdGhpcy5jcm9wT2Zmc2V0WCxcblx0XHRcdHk6IChlLmNsaWVudFkgLSByZWN0LnRvcCkgLyB0aGlzLnNjYWxlICsgdGhpcy5jcm9wT2Zmc2V0WSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBvblBvaW50ZXJEb3duKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHBvcyA9IHRoaXMuY2FudmFzQ29vcmRzKGUpO1xuXG5cdFx0Ly8gQ3JvcCBtb2RlOiBoaXQgdGVzdCBoYW5kbGVzIG9yIGludGVyaW9yXG5cdFx0aWYgKHRoaXMuY3JvcE1vZGUgJiYgdGhpcy5jcm9wUmVnaW9uKSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLmNyb3BIYW5kbGVIaXRUZXN0KHBvcyk7XG5cdFx0XHRpZiAoaGFuZGxlKSB7XG5cdFx0XHRcdHRoaXMuY3JvcERyYWdIYW5kbGUgPSBoYW5kbGU7XG5cdFx0XHRcdHRoaXMuY3JvcERyYWdTdGFydCA9IHBvcztcblx0XHRcdFx0dGhpcy5jcm9wUmVnaW9uU3RhcnQgPSB7IC4uLnRoaXMuY3JvcFJlZ2lvbiB9O1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5zZXRQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0IHRvb2w6IGhpdCB0ZXN0IGFuZCBzdGFydCBkcmFnXG5cdFx0aWYgKHRoaXMuYWN0aXZlVG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuU2VsZWN0KSB7XG5cdFx0XHRjb25zdCBoaXRJbmRleCA9IHRoaXMuaGl0VGVzdChwb3MpO1xuXHRcdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gaGl0SW5kZXg7XG5cdFx0XHRpZiAoaGl0SW5kZXggPj0gMCkge1xuXHRcdFx0XHRjb25zdCBoaXRBY3Rpb24gPSB0aGlzLmFjdGlvbnNbaGl0SW5kZXhdO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdNb3ZlID0geyB0YXJnZXQ6IGhpdEFjdGlvbiwgYmVmb3JlOiBjYXB0dXJlTW92ZVNuYXBzaG90KGhpdEFjdGlvbikgfTtcblx0XHRcdFx0aWYgKGhpdEFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0ICYmIHRoaXMuaXNOZWFyVGV4dFJlc2l6ZUhhbmRsZShwb3MsIGhpdEFjdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLmlzUmVzaXppbmdTZWxlY3RlZFRleHQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuZHJhZ1N0YXJ0ID0geyB4OiBwb3MueCwgeTogcG9zLnkgfTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdGVkVGV4dFJlc2l6ZVN0YXJ0V2lkdGggPSBoaXRBY3Rpb24udGV4dFdpZHRoID8/IERFRkFVTFRfVEVYVF9CT1hfV0lEVEg7XG5cdFx0XHRcdFx0dGhpcy5jYW52YXMuc2V0UG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9ICdldy1yZXNpemUnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuaXNEcmFnZ2luZ1NlbGVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLmRyYWdTdGFydCA9IHsgeDogcG9zLngsIHk6IHBvcy55IH07XG5cdFx0XHRcdFx0dGhpcy5jYW52YXMuc2V0UG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9ICdtb3ZlJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXNlbGVjdCB3aGVuIHVzaW5nIG90aGVyIHRvb2xzXG5cdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gLTE7XG5cblx0XHQvLyBUZXh0IHRvb2w6IGRyYWcgdG8gZGVmaW5lIHdpZHRoLCB0aGVuIGVudGVyIHRleHQgZWRpdGluZy5cblx0XHRpZiAodGhpcy5hY3RpdmVUb29sID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0KSB7XG5cdFx0XHR0aGlzLmNvbW1pdFRleHRFZGl0KCk7XG5cdFx0XHR0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSA9IHtcblx0XHRcdFx0c3RhcnQ6IHBvcyxcblx0XHRcdFx0Y3VycmVudDogcG9zLFxuXHRcdFx0XHRwb2ludGVySWQ6IGUucG9pbnRlcklkLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRXJhc2VyIHJlbW92ZXMgYW5ub3RhdGlvbnMgdGhhdCBpbnRlcnNlY3QgdGhlIHBvaW50ZXIgcGF0aC5cblx0XHRpZiAodGhpcy5hY3RpdmVUb29sID09PSBBbm5vdGF0aW9uVG9vbC5FcmFzZXIpIHtcblx0XHRcdHRoaXMuaXNFcmFzaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdHRoaXMuZXJhc2VBdChwb3MpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFBhbiB0b29sXG5cdFx0aWYgKHRoaXMuYWN0aXZlVG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuUGFuKSB7XG5cdFx0XHR0aGlzLmlzUGFubmluZyA9IHRydWU7XG5cdFx0XHR0aGlzLmxhc3RQYW5Qb2ludCA9IHsgeDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFkgfTtcblx0XHRcdHRoaXMuY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9ICdncmFiYmluZyc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pc0RyYXdpbmcgPSB0cnVlO1xuXHRcdHRoaXMuY2FudmFzLnNldFBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblxuXHRcdHN3aXRjaCAodGhpcy5hY3RpdmVUb29sKSB7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkZyZWVoYW5kOlxuXHRcdFx0XHR0aGlzLmN1cnJlbnRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQW5ub3RhdGlvblRvb2wuRnJlZWhhbmQsXG5cdFx0XHRcdFx0c3Ryb2tlQ29sb3I6IHRoaXMuYWN0aXZlU3Ryb2tlQ29sb3IsXG5cdFx0XHRcdFx0b3BhY2l0eTogdGhpcy5hY3RpdmVPcGFjaXR5LFxuXHRcdFx0XHRcdGxpbmVXaWR0aDogdGhpcy5hY3RpdmVMaW5lV2lkdGgsXG5cdFx0XHRcdFx0cG9pbnRzOiBbcG9zXSxcblx0XHRcdFx0fTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlJlY3RhbmdsZTpcblx0XHRcdFx0dGhpcy5jdXJyZW50QWN0aW9uID0ge1xuXHRcdFx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLlJlY3RhbmdsZSxcblx0XHRcdFx0XHRzdHJva2VDb2xvcjogdGhpcy5hY3RpdmVTdHJva2VDb2xvcixcblx0XHRcdFx0XHRmaWxsQ29sb3I6IHRoaXMuYWN0aXZlRmlsbENvbG9yLFxuXHRcdFx0XHRcdG9wYWNpdHk6IHRoaXMuYWN0aXZlT3BhY2l0eSxcblx0XHRcdFx0XHRsaW5lV2lkdGg6IHRoaXMuYWN0aXZlTGluZVdpZHRoLFxuXHRcdFx0XHRcdHJlY3Q6IHsgeDogcG9zLngsIHk6IHBvcy55LCB3aWR0aDogMCwgaGVpZ2h0OiAwIH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5FbGxpcHNlOlxuXHRcdFx0XHR0aGlzLmN1cnJlbnRBY3Rpb24gPSB7XG5cdFx0XHRcdFx0dHlwZTogQW5ub3RhdGlvblRvb2wuRWxsaXBzZSxcblx0XHRcdFx0XHRzdHJva2VDb2xvcjogdGhpcy5hY3RpdmVTdHJva2VDb2xvcixcblx0XHRcdFx0XHRmaWxsQ29sb3I6IHRoaXMuYWN0aXZlRmlsbENvbG9yLFxuXHRcdFx0XHRcdG9wYWNpdHk6IHRoaXMuYWN0aXZlT3BhY2l0eSxcblx0XHRcdFx0XHRsaW5lV2lkdGg6IHRoaXMuYWN0aXZlTGluZVdpZHRoLFxuXHRcdFx0XHRcdGVsbGlwc2VSZWN0OiB7IHg6IHBvcy54LCB5OiBwb3MueSwgd2lkdGg6IDAsIGhlaWdodDogMCB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuQXJyb3c6XG5cdFx0XHRcdHRoaXMuY3VycmVudEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBbm5vdGF0aW9uVG9vbC5BcnJvdyxcblx0XHRcdFx0XHRzdHJva2VDb2xvcjogdGhpcy5hY3RpdmVTdHJva2VDb2xvcixcblx0XHRcdFx0XHRvcGFjaXR5OiB0aGlzLmFjdGl2ZU9wYWNpdHksXG5cdFx0XHRcdFx0bGluZVdpZHRoOiB0aGlzLmFjdGl2ZUxpbmVXaWR0aCxcblx0XHRcdFx0XHRhcnJvd1N0YXJ0OiBwb3MsXG5cdFx0XHRcdFx0YXJyb3dFbmQ6IHBvcyxcblx0XHRcdFx0fTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblBvaW50ZXJNb3ZlKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuXHRcdC8vIENyb3AgbW9kZTogZHJhZyBoYW5kbGUgb3IgbW92ZSByZWdpb247IGFsc28gdXBkYXRlIGN1cnNvclxuXHRcdGlmICh0aGlzLmNyb3BNb2RlKSB7XG5cdFx0XHRjb25zdCBwb3MgPSB0aGlzLmNhbnZhc0Nvb3JkcyhlKTtcblx0XHRcdGlmICh0aGlzLmNyb3BEcmFnSGFuZGxlICYmIHRoaXMuY3JvcFJlZ2lvblN0YXJ0KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ3JvcFJlZ2lvbihwb3MpO1xuXHRcdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBVcGRhdGUgY3Vyc29yIGJhc2VkIG9uIGhvdmVyXG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLmNyb3BIYW5kbGVIaXRUZXN0KHBvcyk7XG5cdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSB0aGlzLmNyb3BDdXJzb3JGb3IoaGFuZGxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZWxlY3QgdG9vbDogcmVzaXplIHNlbGVjdGVkIHRleHRcblx0XHRpZiAodGhpcy5pc1Jlc2l6aW5nU2VsZWN0ZWRUZXh0ICYmIHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCBwb3MgPSB0aGlzLmNhbnZhc0Nvb3JkcyhlKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuYWN0aW9uc1t0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXhdO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0KSB7XG5cdFx0XHRcdGFjdGlvbi50ZXh0V2lkdGggPSBNYXRoLm1heChNSU5fVEVYVF9CT1hfV0lEVEgsIHRoaXMuc2VsZWN0ZWRUZXh0UmVzaXplU3RhcnRXaWR0aCArIChwb3MueCAtIHRoaXMuZHJhZ1N0YXJ0LngpKTtcblx0XHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZWxlY3QgdG9vbDogbW92ZSBzZWxlY3RlZCBlbGVtZW50XG5cdFx0aWYgKHRoaXMuaXNEcmFnZ2luZ1NlbGVjdGVkICYmIHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCBwb3MgPSB0aGlzLmNhbnZhc0Nvb3JkcyhlKTtcblx0XHRcdGNvbnN0IGR4ID0gcG9zLnggLSB0aGlzLmRyYWdTdGFydC54O1xuXHRcdFx0Y29uc3QgZHkgPSBwb3MueSAtIHRoaXMuZHJhZ1N0YXJ0Lnk7XG5cdFx0XHR0aGlzLm1vdmVBY3Rpb24odGhpcy5hY3Rpb25zW3RoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleF0sIGR4LCBkeSk7XG5cdFx0XHR0aGlzLmRyYWdTdGFydCA9IHsgeDogcG9zLngsIHk6IHBvcy55IH07XG5cdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFBhblxuXHRcdGlmICh0aGlzLmlzUGFubmluZykge1xuXHRcdFx0Y29uc3QgZHggPSBlLmNsaWVudFggLSB0aGlzLmxhc3RQYW5Qb2ludC54O1xuXHRcdFx0Y29uc3QgZHkgPSBlLmNsaWVudFkgLSB0aGlzLmxhc3RQYW5Qb2ludC55O1xuXHRcdFx0dGhpcy5wYW5YICs9IGR4O1xuXHRcdFx0dGhpcy5wYW5ZICs9IGR5O1xuXHRcdFx0dGhpcy5sYXN0UGFuUG9pbnQgPSB7IHg6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZIH07XG5cdFx0XHR0aGlzLmNsYW1wUGFuKCk7XG5cdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7dGhpcy5wYW5YfXB4LCAke3RoaXMucGFuWX1weClgO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0Y29uc3QgcG9zID0gdGhpcy5jYW52YXNDb29yZHMoZSk7XG5cdFx0XHR0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZS5jdXJyZW50ID0gcG9zO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc0VyYXNpbmcpIHtcblx0XHRcdGNvbnN0IHBvcyA9IHRoaXMuY2FudmFzQ29vcmRzKGUpO1xuXHRcdFx0dGhpcy5lcmFzZUF0KHBvcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYWN0aXZlVG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuU2VsZWN0ICYmIHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCBwb3MgPSB0aGlzLmNhbnZhc0Nvb3JkcyhlKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuYWN0aW9uc1t0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXhdO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0ICYmIHRoaXMuaXNOZWFyVGV4dFJlc2l6ZUhhbmRsZShwb3MsIGFjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5jYW52YXMuc3R5bGUuY3Vyc29yID0gJ2V3LXJlc2l6ZSc7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwKSB7XG5cdFx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0Jztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuaXNEcmF3aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zID0gdGhpcy5jYW52YXNDb29yZHMoZSk7XG5cblx0XHRpZiAoIXRoaXMuY3VycmVudEFjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAodGhpcy5jdXJyZW50QWN0aW9uLnR5cGUpIHtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRnJlZWhhbmQ6XG5cdFx0XHRcdHRoaXMuY3VycmVudEFjdGlvbi5wb2ludHMhLnB1c2gocG9zKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlJlY3RhbmdsZToge1xuXHRcdFx0XHRjb25zdCByZWN0ID0gdGhpcy5jdXJyZW50QWN0aW9uLnJlY3QhO1xuXHRcdFx0XHQvLyBNdXRhdGUgdGhlIHJlY3Qgb24gdGhlIGN1cnJlbnQgYWN0aW9uICh0aGlzIGlzIHRoZSBpbi1wcm9ncmVzcyBkcmF3aW5nKVxuXHRcdFx0XHQodGhpcy5jdXJyZW50QWN0aW9uIGFzIHsgcmVjdDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB9KS5yZWN0ID0ge1xuXHRcdFx0XHRcdC4uLnJlY3QsXG5cdFx0XHRcdFx0d2lkdGg6IHBvcy54IC0gcmVjdC54LFxuXHRcdFx0XHRcdGhlaWdodDogcG9zLnkgLSByZWN0LnksXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5FbGxpcHNlOiB7XG5cdFx0XHRcdGNvbnN0IGVyID0gdGhpcy5jdXJyZW50QWN0aW9uLmVsbGlwc2VSZWN0ITtcblx0XHRcdFx0bGV0IHcgPSBwb3MueCAtIGVyLng7XG5cdFx0XHRcdGxldCBoID0gcG9zLnkgLSBlci55O1xuXHRcdFx0XHRpZiAoZS5zaGlmdEtleSkge1xuXHRcdFx0XHRcdGNvbnN0IHNpemUgPSBNYXRoLm1heChNYXRoLmFicyh3KSwgTWF0aC5hYnMoaCkpO1xuXHRcdFx0XHRcdHcgPSBNYXRoLnNpZ24odykgKiBzaXplO1xuXHRcdFx0XHRcdGggPSBNYXRoLnNpZ24oaCkgKiBzaXplO1xuXHRcdFx0XHR9XG5cdFx0XHRcdCh0aGlzLmN1cnJlbnRBY3Rpb24gYXMgeyBlbGxpcHNlUmVjdDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB9KS5lbGxpcHNlUmVjdCA9IHsgLi4uZXIsIHdpZHRoOiB3LCBoZWlnaHQ6IGggfTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkFycm93OlxuXHRcdFx0XHQodGhpcy5jdXJyZW50QWN0aW9uIGFzIHsgYXJyb3dFbmQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB9KS5hcnJvd0VuZCA9IHBvcztcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Qb2ludGVyVXAoZTogUG9pbnRlckV2ZW50KTogdm9pZCB7XG5cdFx0Ly8gQ3JvcCBtb2RlOiBlbmQgaGFuZGxlIGRyYWdcblx0XHRpZiAodGhpcy5jcm9wTW9kZSAmJiB0aGlzLmNyb3BEcmFnSGFuZGxlKSB7XG5cdFx0XHR0aGlzLmNyb3BEcmFnSGFuZGxlID0gbnVsbDtcblx0XHRcdHRoaXMuY3JvcFJlZ2lvblN0YXJ0ID0gbnVsbDtcblx0XHRcdHRoaXMuY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0IHRvb2w6IGVuZCBkcmFnXG5cdFx0aWYgKHRoaXMuaXNSZXNpemluZ1NlbGVjdGVkVGV4dCkge1xuXHRcdFx0dGhpcy5pc1Jlc2l6aW5nU2VsZWN0ZWRUZXh0ID0gZmFsc2U7XG5cdFx0XHR0aGlzLmNhbnZhcy5yZWxlYXNlUG9pbnRlckNhcHR1cmUoZS5wb2ludGVySWQpO1xuXHRcdFx0dGhpcy5jYW52YXMuc3R5bGUuY3Vyc29yID0gJ2RlZmF1bHQnO1xuXHRcdFx0dGhpcy5jb21taXRQZW5kaW5nTW92ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlbGVjdCB0b29sOiBlbmQgZHJhZ1xuXHRcdGlmICh0aGlzLmlzRHJhZ2dpbmdTZWxlY3RlZCkge1xuXHRcdFx0dGhpcy5pc0RyYWdnaW5nU2VsZWN0ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR0aGlzLmNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XG5cdFx0XHR0aGlzLmNvbW1pdFBlbmRpbmdNb3ZlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUGFuXG5cdFx0aWYgKHRoaXMuaXNQYW5uaW5nKSB7XG5cdFx0XHR0aGlzLmlzUGFubmluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdHRoaXMuY2FudmFzLnN0eWxlLmN1cnNvciA9IHRoaXMuYWN0aXZlVG9vbCA9PT0gQW5ub3RhdGlvblRvb2wuUGFuID8gJ2dyYWInIDogJ2Nyb3NzaGFpcic7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNFcmFzaW5nKSB7XG5cdFx0XHR0aGlzLmlzRXJhc2luZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5jYW52YXMucmVsZWFzZVBvaW50ZXJDYXB0dXJlKGUucG9pbnRlcklkKTtcblx0XHRcdGlmICh0aGlzLnBlbmRpbmdFcmFzZUFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogQW5ub3RhdGlvblRvb2wuRXJhc2VyLFxuXHRcdFx0XHRcdHN0cm9rZUNvbG9yOiAnJyxcblx0XHRcdFx0XHRvcGFjaXR5OiAxLFxuXHRcdFx0XHRcdGxpbmVXaWR0aDogMCxcblx0XHRcdFx0XHRlcmFzZWRBY3Rpb25zOiB0aGlzLnBlbmRpbmdFcmFzZUFjdGlvbnMuc2xpY2UoKSxcblx0XHRcdFx0XHRlcmFzZWRJbmRpY2VzOiB0aGlzLnBlbmRpbmdFcmFzZUluZGljZXMuc2xpY2UoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMucGVuZGluZ0VyYXNlQWN0aW9ucyA9IFtdO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdFcmFzZUluZGljZXMgPSBbXTtcblx0XHRcdFx0dGhpcy51bmRvbmVBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0XHRcdHRoaXMudXBkYXRlVW5kb1JlZG9TdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSkge1xuXHRcdFx0Y29uc3QgeyBzdGFydCwgY3VycmVudCwgcG9pbnRlcklkIH0gPSB0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZTtcblx0XHRcdGlmIChwb2ludGVySWQgPT09IGUucG9pbnRlcklkKSB7XG5cdFx0XHRcdHRoaXMuY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkeCA9IGN1cnJlbnQueCAtIHN0YXJ0Lng7XG5cdFx0XHRjb25zdCBkaWREcmFnID0gTWF0aC5hYnMoZHgpID49IFRFWFRfRFJBR19USFJFU0hPTEQ7XG5cdFx0XHRjb25zdCB4ID0gZGlkRHJhZyA/IE1hdGgubWluKHN0YXJ0LngsIGN1cnJlbnQueCkgOiBzdGFydC54O1xuXHRcdFx0Y29uc3QgcmF3V2lkdGggPSBkaWREcmFnID8gTWF0aC5hYnMoZHgpIDogdGhpcy5nZXRNYXhUZXh0V2lkdGhGcm9tKHN0YXJ0LngpO1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBkaWREcmFnXG5cdFx0XHRcdD8gTWF0aC5tYXgoMSwgTWF0aC5taW4ocmF3V2lkdGgsIHRoaXMuZ2V0VGV4dEltYWdlUmlnaHQoKSAtIHgpKVxuXHRcdFx0XHQ6IHJhd1dpZHRoO1xuXHRcdFx0Y29uc3QgeSA9IHN0YXJ0Lnk7XG5cdFx0XHR0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZSA9IG51bGw7XG5cdFx0XHR0aGlzLnN0YXJ0VGV4dEVkaXQoeyB4LCB5IH0sIHdpZHRoLCBkaWREcmFnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuaXNEcmF3aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2FudmFzLnJlbGVhc2VQb2ludGVyQ2FwdHVyZShlLnBvaW50ZXJJZCk7XG5cdFx0dGhpcy5pc0RyYXdpbmcgPSBmYWxzZTtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnRBY3Rpb24pIHtcblx0XHRcdHRoaXMuYWN0aW9ucy5wdXNoKHRoaXMuY3VycmVudEFjdGlvbik7XG5cdFx0XHR0aGlzLnVuZG9uZUFjdGlvbnMubGVuZ3RoID0gMDtcblx0XHRcdHRoaXMudXBkYXRlVW5kb1JlZG9TdGF0ZSgpO1xuXHRcdFx0dGhpcy5jdXJyZW50QWN0aW9uID0gbnVsbDtcblx0XHR9XG5cblx0XHR0aGlzLnJlZHJhdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBlcmFzZUF0KHBvczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0Y29uc3QgaGl0SW5kZXggPSB0aGlzLmhpdFRlc3QocG9zKTtcblx0XHRpZiAoaGl0SW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IFtlcmFzZWRdID0gdGhpcy5hY3Rpb25zLnNwbGljZShoaXRJbmRleCwgMSk7XG5cdFx0dGhpcy5wZW5kaW5nRXJhc2VBY3Rpb25zLnB1c2goZXJhc2VkKTtcblx0XHR0aGlzLnBlbmRpbmdFcmFzZUluZGljZXMucHVzaChoaXRJbmRleCk7XG5cdFx0dGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4ID0gLTE7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgY29tbWl0UGVuZGluZ01vdmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMucGVuZGluZ01vdmU7XG5cdFx0dGhpcy5wZW5kaW5nTW92ZSA9IG51bGw7XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFmdGVyID0gY2FwdHVyZU1vdmVTbmFwc2hvdChwZW5kaW5nLnRhcmdldCk7XG5cdFx0aWYgKG1vdmVTbmFwc2hvdHNFcXVhbChwZW5kaW5nLmJlZm9yZSwgYWZ0ZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuYWN0aW9ucy5wdXNoKHtcblx0XHRcdHR5cGU6IEFubm90YXRpb25Ub29sLk1vdmUsXG5cdFx0XHRzdHJva2VDb2xvcjogJycsXG5cdFx0XHRvcGFjaXR5OiAxLFxuXHRcdFx0bGluZVdpZHRoOiAwLFxuXHRcdFx0bW92ZVRhcmdldDogcGVuZGluZy50YXJnZXQsXG5cdFx0XHRtb3ZlQmVmb3JlOiBwZW5kaW5nLmJlZm9yZSxcblx0XHRcdG1vdmVBZnRlcjogYWZ0ZXIsXG5cdFx0fSk7XG5cdFx0dGhpcy51bmRvbmVBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy51cGRhdGVVbmRvUmVkb1N0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVVuZG9SZWRvU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudW5kb0J0bikge1xuXHRcdFx0dGhpcy51bmRvQnRuLmRpc2FibGVkID0gdGhpcy5hY3Rpb25zLmxlbmd0aCA9PT0gMDtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmVkb0J0bikge1xuXHRcdFx0dGhpcy5yZWRvQnRuLmRpc2FibGVkID0gdGhpcy51bmRvbmVBY3Rpb25zLmxlbmd0aCA9PT0gMDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVuZG8oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudGV4dFBsYWNlbWVudFN0YXRlKSB7XG5cdFx0XHR0aGlzLmNhbmNlbFRleHRQbGFjZW1lbnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0dGhpcy5jYW5jZWxUZXh0RWRpdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbnMucG9wKCk7XG5cdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5FcmFzZXIgJiYgYWN0aW9uLmVyYXNlZEFjdGlvbnMpIHtcblx0XHRcdC8vIFJlLWluc2VydCBlYWNoIGVyYXNlZCBhY3Rpb24gYXQgdGhlIGluZGV4IGl0IG9jY3VwaWVkIGF0IHRoZSBtb21lbnQgaXQgd2FzIHJlbW92ZWQuXG5cdFx0XHQvLyBJdGVyYXRlIGluIHJldmVyc2UgYmVjYXVzZSBlYWNoIGVyYXNlIHNwbGljZSB3YXMgcmVsYXRpdmUgdG8gdGhlIGFycmF5IHN0YXRlIGFmdGVyXG5cdFx0XHQvLyB0aGUgcHJldmlvdXMgb25lLCBzbyB1bndpbmRpbmcgbXVzdCBoYXBwZW4gaW4gcmV2ZXJzZSBvcmRlciB0byByZXN0b3JlIHBvc2l0aW9ucy5cblx0XHRcdGNvbnN0IGVyYXNlZCA9IGFjdGlvbi5lcmFzZWRBY3Rpb25zO1xuXHRcdFx0Y29uc3QgaW5kaWNlcyA9IGFjdGlvbi5lcmFzZWRJbmRpY2VzID8/IGVyYXNlZC5tYXAoKCkgPT4gdGhpcy5hY3Rpb25zLmxlbmd0aCk7XG5cdFx0XHRmb3IgKGxldCBpID0gZXJhc2VkLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IE1hdGgubWluKGluZGljZXNbaV0sIHRoaXMuYWN0aW9ucy5sZW5ndGgpO1xuXHRcdFx0XHR0aGlzLmFjdGlvbnMuc3BsaWNlKGlkeCwgMCwgZXJhc2VkW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy51bmRvbmVBY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHR0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPSAtMTtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFubm90YXRpb25Ub29sLkNyb3ApIHtcblx0XHRcdHRoaXMuYXBwbHlEaXNwbGF5ZWRDcm9wKGFjdGlvbi5jcm9wRnJvbSA/PyBudWxsKTtcblx0XHR9IGVsc2UgaWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Nb3ZlICYmIGFjdGlvbi5tb3ZlVGFyZ2V0ICYmIGFjdGlvbi5tb3ZlQmVmb3JlKSB7XG5cdFx0XHRhcHBseU1vdmVTbmFwc2hvdChhY3Rpb24ubW92ZVRhcmdldCwgYWN0aW9uLm1vdmVCZWZvcmUpO1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZG8oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudGV4dFBsYWNlbWVudFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRleHRFZGl0U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9uID0gdGhpcy51bmRvbmVBY3Rpb25zLnBvcCgpO1xuXHRcdGlmICghYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyICYmIGFjdGlvbi5lcmFzZWRBY3Rpb25zKSB7XG5cdFx0XHQvLyBSZS1hcHBseSB0aGUgZXJhc2U6IHJlbW92ZSB0aGUgcmUtaW5zZXJ0ZWQgYWN0aW9ucyBieSByZWZlcmVuY2UuXG5cdFx0XHRmb3IgKGNvbnN0IGVyYXNlZCBvZiBhY3Rpb24uZXJhc2VkQWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLmFjdGlvbnMuaW5kZXhPZihlcmFzZWQpO1xuXHRcdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0XHR0aGlzLmFjdGlvbnMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5hY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHR0aGlzLnNlbGVjdGVkQWN0aW9uSW5kZXggPSAtMTtcblx0XHR0aGlzLnVwZGF0ZVVuZG9SZWRvU3RhdGUoKTtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFubm90YXRpb25Ub29sLkNyb3ApIHtcblx0XHRcdHRoaXMuYXBwbHlEaXNwbGF5ZWRDcm9wKGFjdGlvbi5jcm9wVG8gPz8gbnVsbCk7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuTW92ZSAmJiBhY3Rpb24ubW92ZVRhcmdldCAmJiBhY3Rpb24ubW92ZUFmdGVyKSB7XG5cdFx0XHRhcHBseU1vdmVTbmFwc2hvdChhY3Rpb24ubW92ZVRhcmdldCwgYWN0aW9uLm1vdmVBZnRlcik7XG5cdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JvcEhhbmRsZUhpdFRlc3QocG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiAnbncnIHwgJ24nIHwgJ25lJyB8ICdlJyB8ICdzZScgfCAncycgfCAnc3cnIHwgJ3cnIHwgJ21vdmUnIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLmNyb3BSZWdpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCByID0gdGhpcy5ub3JtYWxpemVDcm9wUmVjdCh0aGlzLmNyb3BSZWdpb24pO1xuXHRcdC8vIENvbnZlcnQgaGFuZGxlIHBpeGVsIHNpemUgdG8gaW1hZ2UgY29vcmRzXG5cdFx0Y29uc3QgaGFuZGxlUHggPSAxMjtcblx0XHRjb25zdCB0b2wgPSBoYW5kbGVQeCAvIHRoaXMuc2NhbGU7XG5cdFx0Y29uc3QgY3ggPSByLnggKyByLndpZHRoIC8gMjtcblx0XHRjb25zdCBjeSA9IHIueSArIHIuaGVpZ2h0IC8gMjtcblx0XHRjb25zdCBoYW5kbGVzOiB7IG5hbWU6ICdudycgfCAnbicgfCAnbmUnIHwgJ2UnIHwgJ3NlJyB8ICdzJyB8ICdzdycgfCAndyc7IHg6IG51bWJlcjsgeTogbnVtYmVyIH1bXSA9IFtcblx0XHRcdHsgbmFtZTogJ253JywgeDogci54LCB5OiByLnkgfSxcblx0XHRcdHsgbmFtZTogJ24nLCB4OiBjeCwgeTogci55IH0sXG5cdFx0XHR7IG5hbWU6ICduZScsIHg6IHIueCArIHIud2lkdGgsIHk6IHIueSB9LFxuXHRcdFx0eyBuYW1lOiAnZScsIHg6IHIueCArIHIud2lkdGgsIHk6IGN5IH0sXG5cdFx0XHR7IG5hbWU6ICdzZScsIHg6IHIueCArIHIud2lkdGgsIHk6IHIueSArIHIuaGVpZ2h0IH0sXG5cdFx0XHR7IG5hbWU6ICdzJywgeDogY3gsIHk6IHIueSArIHIuaGVpZ2h0IH0sXG5cdFx0XHR7IG5hbWU6ICdzdycsIHg6IHIueCwgeTogci55ICsgci5oZWlnaHQgfSxcblx0XHRcdHsgbmFtZTogJ3cnLCB4OiByLngsIHk6IGN5IH0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IGggb2YgaGFuZGxlcykge1xuXHRcdFx0aWYgKE1hdGguYWJzKHBvcy54IC0gaC54KSA8PSB0b2wgJiYgTWF0aC5hYnMocG9zLnkgLSBoLnkpIDw9IHRvbCkge1xuXHRcdFx0XHRyZXR1cm4gaC5uYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBJbnNpZGUgcmVnaW9uIFx1MjE5MiBtb3ZlXG5cdFx0aWYgKHBvcy54ID49IHIueCAmJiBwb3MueCA8PSByLnggKyByLndpZHRoICYmIHBvcy55ID49IHIueSAmJiBwb3MueSA8PSByLnkgKyByLmhlaWdodCkge1xuXHRcdFx0cmV0dXJuICdtb3ZlJztcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGNyb3BDdXJzb3JGb3IoaGFuZGxlOiAnbncnIHwgJ24nIHwgJ25lJyB8ICdlJyB8ICdzZScgfCAncycgfCAnc3cnIHwgJ3cnIHwgJ21vdmUnIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChoYW5kbGUpIHtcblx0XHRcdGNhc2UgJ253Jzpcblx0XHRcdGNhc2UgJ3NlJzogcmV0dXJuICdud3NlLXJlc2l6ZSc7XG5cdFx0XHRjYXNlICduZSc6XG5cdFx0XHRjYXNlICdzdyc6IHJldHVybiAnbmVzdy1yZXNpemUnO1xuXHRcdFx0Y2FzZSAnbic6XG5cdFx0XHRjYXNlICdzJzogcmV0dXJuICducy1yZXNpemUnO1xuXHRcdFx0Y2FzZSAnZSc6XG5cdFx0XHRjYXNlICd3JzogcmV0dXJuICdldy1yZXNpemUnO1xuXHRcdFx0Y2FzZSAnbW92ZSc6IHJldHVybiAnbW92ZSc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJ2RlZmF1bHQnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ3JvcFJlZ2lvbihwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jcm9wUmVnaW9uU3RhcnQgfHwgIXRoaXMuY3JvcERyYWdIYW5kbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZHggPSBwb3MueCAtIHRoaXMuY3JvcERyYWdTdGFydC54O1xuXHRcdGNvbnN0IGR5ID0gcG9zLnkgLSB0aGlzLmNyb3BEcmFnU3RhcnQueTtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuY3JvcFJlZ2lvblN0YXJ0O1xuXG5cdFx0Ly8gVHJhbnNsYXRpbmcgdGhlIGVudGlyZSBib3g6IGtlZXAgZGltZW5zaW9ucyBmaXhlZCBhbmQgY2xhbXAgb25seSB0aGUgcG9zaXRpb24uXG5cdFx0aWYgKHRoaXMuY3JvcERyYWdIYW5kbGUgPT09ICdtb3ZlJykge1xuXHRcdFx0Y29uc3QgeCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMuaW1hZ2VXaWR0aCAtIHN0YXJ0LndpZHRoLCBzdGFydC54ICsgZHgpKTtcblx0XHRcdGNvbnN0IHkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLmltYWdlSGVpZ2h0IC0gc3RhcnQuaGVpZ2h0LCBzdGFydC55ICsgZHkpKTtcblx0XHRcdHRoaXMuY3JvcFJlZ2lvbiA9IHsgeCwgeSwgd2lkdGg6IHN0YXJ0LndpZHRoLCBoZWlnaHQ6IHN0YXJ0LmhlaWdodCB9O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB7IHgsIHksIHdpZHRoLCBoZWlnaHQgfSA9IHN0YXJ0O1xuXHRcdHN3aXRjaCAodGhpcy5jcm9wRHJhZ0hhbmRsZSkge1xuXHRcdFx0Y2FzZSAnbncnOlxuXHRcdFx0XHR4ICs9IGR4OyB5ICs9IGR5OyB3aWR0aCAtPSBkeDsgaGVpZ2h0IC09IGR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ24nOlxuXHRcdFx0XHR5ICs9IGR5OyBoZWlnaHQgLT0gZHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbmUnOlxuXHRcdFx0XHR5ICs9IGR5OyB3aWR0aCArPSBkeDsgaGVpZ2h0IC09IGR5O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2UnOlxuXHRcdFx0XHR3aWR0aCArPSBkeDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzZSc6XG5cdFx0XHRcdHdpZHRoICs9IGR4OyBoZWlnaHQgKz0gZHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncyc6XG5cdFx0XHRcdGhlaWdodCArPSBkeTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzdyc6XG5cdFx0XHRcdHggKz0gZHg7IHdpZHRoIC09IGR4OyBoZWlnaHQgKz0gZHk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAndyc6XG5cdFx0XHRcdHggKz0gZHg7IHdpZHRoIC09IGR4O1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Ly8gQ2xhbXAgdG8gaW1hZ2UgYm91bmRzXG5cdFx0eCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMuaW1hZ2VXaWR0aCwgeCkpO1xuXHRcdHkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLmltYWdlSGVpZ2h0LCB5KSk7XG5cdFx0d2lkdGggPSBNYXRoLm1heCgxMCwgTWF0aC5taW4odGhpcy5pbWFnZVdpZHRoIC0geCwgd2lkdGgpKTtcblx0XHRoZWlnaHQgPSBNYXRoLm1heCgxMCwgTWF0aC5taW4odGhpcy5pbWFnZUhlaWdodCAtIHksIGhlaWdodCkpO1xuXHRcdHRoaXMuY3JvcFJlZ2lvbiA9IHsgeCwgeSwgd2lkdGgsIGhlaWdodCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBub3JtYWxpemVDcm9wUmVjdChyOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KTogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHg6IHIud2lkdGggPCAwID8gci54ICsgci53aWR0aCA6IHIueCxcblx0XHRcdHk6IHIuaGVpZ2h0IDwgMCA/IHIueSArIHIuaGVpZ2h0IDogci55LFxuXHRcdFx0d2lkdGg6IE1hdGguYWJzKHIud2lkdGgpLFxuXHRcdFx0aGVpZ2h0OiBNYXRoLmFicyhyLmhlaWdodCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhcnRUZXh0RWRpdChwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgd2lkdGg6IG51bWJlciwgc2hvd0JveE91dGxpbmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmNvbW1pdFRleHRFZGl0KCk7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XG5cdFx0ZWRpdG9yLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd0eXBlVGV4dCcsIFwiVHlwZSB0ZXh0XCIpKTtcblx0XHRlZGl0b3Iuc2V0QXR0cmlidXRlKCd3cmFwJywgJ29mZicpO1xuXHRcdGVkaXRvci5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XG5cdFx0ZWRpdG9yLnN0eWxlLmxlZnQgPSAnLTEwMDAwcHgnO1xuXHRcdGVkaXRvci5zdHlsZS50b3AgPSAnMCc7XG5cdFx0ZWRpdG9yLnN0eWxlLndpZHRoID0gJzFweCc7XG5cdFx0ZWRpdG9yLnN0eWxlLmhlaWdodCA9ICcxcHgnO1xuXHRcdGVkaXRvci5zdHlsZS5vcGFjaXR5ID0gJzAnO1xuXHRcdGVkaXRvci5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuXHRcdGVkaXRvci5zdHlsZS5wYWRkaW5nID0gJzAnO1xuXHRcdGVkaXRvci5zdHlsZS5ib3JkZXIgPSAnMCc7XG5cdFx0ZWRpdG9yLnN0eWxlLm1hcmdpbiA9ICcwJztcblx0XHRlZGl0b3Iuc3R5bGUucmVzaXplID0gJ25vbmUnO1xuXHRcdGVkaXRvci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGVkaXRvcik7XG5cblx0XHR0aGlzLnRleHRFZGl0U3RhdGUgPSB7XG5cdFx0XHRwb3MsXG5cdFx0XHR0ZXh0OiAnJyxcblx0XHRcdGNhcmV0SW5kZXg6IDAsXG5cdFx0XHRzdHJva2VDb2xvcjogdGhpcy5hY3RpdmVTdHJva2VDb2xvcixcblx0XHRcdGZpbGxDb2xvcjogdGhpcy5hY3RpdmVGaWxsQ29sb3IsXG5cdFx0XHRvcGFjaXR5OiB0aGlzLmFjdGl2ZU9wYWNpdHksXG5cdFx0XHRmb250U2l6ZTogdGhpcy5hY3RpdmVGb250U2l6ZSxcblx0XHRcdGZvbnRGYW1pbHk6IHRoaXMuYWN0aXZlRm9udEZhbWlseSxcblx0XHRcdHdpZHRoLFxuXHRcdFx0c2hvd0JveE91dGxpbmUsXG5cdFx0fTtcblx0XHR0aGlzLnRleHRFZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5zdGFydFRleHRDYXJldEJsaW5rKCk7XG5cblx0XHRjb25zdCBzeW5jID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnRleHRFZGl0U3RhdGUgfHwgdGhpcy50ZXh0RWRpdG9yICE9PSBlZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50ZXh0RWRpdFN0YXRlLnRleHQgPSBlZGl0b3IudmFsdWU7XG5cdFx0XHR0aGlzLnRleHRFZGl0U3RhdGUuY2FyZXRJbmRleCA9IGVkaXRvci5zZWxlY3Rpb25TdGFydCA/PyBlZGl0b3IudmFsdWUubGVuZ3RoO1xuXHRcdFx0dGhpcy50ZXh0Q2FyZXRWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdHRoaXMucmVkcmF3KCk7XG5cdFx0fTtcblxuXHRcdGVkaXRvci5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHN5bmMpO1xuXHRcdGVkaXRvci5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHN5bmMpO1xuXHRcdGVkaXRvci5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHN5bmMpO1xuXHRcdGVkaXRvci5hZGRFdmVudExpc3RlbmVyKCdzZWxlY3QnLCBzeW5jKTtcblx0XHRlZGl0b3IuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyAmJiAoZS5jdHJsS2V5IHx8IGUubWV0YUtleSkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLmNvbW1pdFRleHRFZGl0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUua2V5ID09PSAnRXNjYXBlJykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMuY2FuY2VsVGV4dEVkaXQoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRlZGl0b3IuYWRkRXZlbnRMaXN0ZW5lcignYmx1cicsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLnRleHRFZGl0b3IgPT09IGVkaXRvcikge1xuXHRcdFx0XHR0aGlzLmNvbW1pdFRleHRFZGl0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnRleHRFZGl0b3IgPT09IGVkaXRvcikge1xuXHRcdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvblJhbmdlKGVkaXRvci52YWx1ZS5sZW5ndGgsIGVkaXRvci52YWx1ZS5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH0sIDApO1xuXG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhcnRUZXh0Q2FyZXRCbGluaygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50ZXh0Q2FyZXRJbnRlcnZhbCAhPT0gbnVsbCkge1xuXHRcdFx0Z2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5jbGVhckludGVydmFsKHRoaXMudGV4dENhcmV0SW50ZXJ2YWwpO1xuXHRcdH1cblx0XHR0aGlzLnRleHRDYXJldFZpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMudGV4dENhcmV0SW50ZXJ2YWwgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpLnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMudGV4dENhcmV0VmlzaWJsZSA9ICF0aGlzLnRleHRDYXJldFZpc2libGU7XG5cdFx0XHR0aGlzLnJlZHJhdygpO1xuXHRcdH0sIDUwMCk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3BUZXh0Q2FyZXRCbGluaygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50ZXh0Q2FyZXRJbnRlcnZhbCAhPT0gbnVsbCkge1xuXHRcdFx0Z2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5jbGVhckludGVydmFsKHRoaXMudGV4dENhcmV0SW50ZXJ2YWwpO1xuXHRcdFx0dGhpcy50ZXh0Q2FyZXRJbnRlcnZhbCA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMudGV4dENhcmV0VmlzaWJsZSA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGNvbW1pdFRleHRFZGl0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0ZXh0LCBwb3MsIHN0cm9rZUNvbG9yLCBmaWxsQ29sb3IsIG9wYWNpdHksIGZvbnRGYW1pbHksIGZvbnRTaXplLCB3aWR0aCB9ID0gdGhpcy50ZXh0RWRpdFN0YXRlO1xuXHRcdHRoaXMuY2xlYW51cFRleHRFZGl0b3IoKTtcblx0XHRpZiAodGV4dC50cmltKCkpIHtcblx0XHRcdHRoaXMuYWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0dHlwZTogQW5ub3RhdGlvblRvb2wuVGV4dCxcblx0XHRcdFx0c3Ryb2tlQ29sb3IsXG5cdFx0XHRcdGZpbGxDb2xvcixcblx0XHRcdFx0b3BhY2l0eSxcblx0XHRcdFx0bGluZVdpZHRoOiAxLFxuXHRcdFx0XHRmb250U2l6ZSxcblx0XHRcdFx0Zm9udEZhbWlseSxcblx0XHRcdFx0dGV4dCxcblx0XHRcdFx0dGV4dFBvczogcG9zLFxuXHRcdFx0XHR0ZXh0V2lkdGg6IHdpZHRoLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLnVuZG9uZUFjdGlvbnMubGVuZ3RoID0gMDtcblx0XHRcdHRoaXMudXBkYXRlVW5kb1JlZG9TdGF0ZSgpO1xuXHRcdH1cblx0XHR0aGlzLnJlZHJhdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5jZWxUZXh0RWRpdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGV4dEVkaXRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFudXBUZXh0RWRpdG9yKCk7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgY2FuY2VsVGV4dFBsYWNlbWVudCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGV4dFBsYWNlbWVudFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNhbnZhcy5oYXNQb2ludGVyQ2FwdHVyZSh0aGlzLnRleHRQbGFjZW1lbnRTdGF0ZS5wb2ludGVySWQpKSB7XG5cdFx0XHR0aGlzLmNhbnZhcy5yZWxlYXNlUG9pbnRlckNhcHR1cmUodGhpcy50ZXh0UGxhY2VtZW50U3RhdGUucG9pbnRlcklkKTtcblx0XHR9XG5cdFx0dGhpcy50ZXh0UGxhY2VtZW50U3RhdGUgPSBudWxsO1xuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRleHRJbWFnZVJpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuY3JvcE9mZnNldFggKyB0aGlzLmltYWdlV2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGdldE1heFRleHRXaWR0aEZyb20oc3RhcnRYOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLm1heCgxLCB0aGlzLmdldFRleHRJbWFnZVJpZ2h0KCkgLSBzdGFydFgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhbnVwVGV4dEVkaXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3BUZXh0Q2FyZXRCbGluaygpO1xuXHRcdHRoaXMudGV4dEVkaXRvcj8ucmVtb3ZlKCk7XG5cdFx0dGhpcy50ZXh0RWRpdG9yID0gbnVsbDtcblx0XHR0aGlzLnRleHRFZGl0U3RhdGUgPSBudWxsO1xuXHRcdHRoaXMuY29udGFpbmVyLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZHJhdygpOiB2b2lkIHtcblx0XHR0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG5cblx0XHQvLyBEcmF3IGJhY2tncm91bmQgaW1hZ2Vcblx0XHRpZiAodGhpcy5pbWFnZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlRWxlbWVudCwgMCwgMCwgdGhpcy5pbWFnZVdpZHRoICogdGhpcy5zY2FsZSwgdGhpcy5pbWFnZUhlaWdodCAqIHRoaXMuc2NhbGUpO1xuXHRcdH1cblxuXHRcdC8vIEFubm90YXRpb25zIGFyZSBzdG9yZWQgaW4gb3JpZ2luYWwtaW1hZ2UgY29vcmRzOyB0cmFuc2xhdGUgc28gdGhleSBhcHBlYXIgY29ycmVjdGx5XG5cdFx0Ly8gb3ZlciB0aGUgKHBvc3NpYmx5IGNyb3BwZWQpIGRpc3BsYXllZCBpbWFnZS5cblx0XHR0aGlzLmN0eC5zYXZlKCk7XG5cdFx0dGhpcy5jdHgudHJhbnNsYXRlKC10aGlzLmNyb3BPZmZzZXRYICogdGhpcy5zY2FsZSwgLXRoaXMuY3JvcE9mZnNldFkgKiB0aGlzLnNjYWxlKTtcblxuXHRcdC8vIERyYXcgYWxsIGNvbXBsZXRlZCBhbm5vdGF0aW9uc1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMuYWN0aW9ucykge1xuXHRcdFx0dGhpcy5kcmF3QWN0aW9uKGFjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyBzZWxlY3Rpb24gaGlnaGxpZ2h0XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA+PSAwICYmIHRoaXMuc2VsZWN0ZWRBY3Rpb25JbmRleCA8IHRoaXMuYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZHJhd1NlbGVjdGlvbkhpZ2hsaWdodCh0aGlzLmFjdGlvbnNbdGhpcy5zZWxlY3RlZEFjdGlvbkluZGV4XSk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyBjdXJyZW50IGluLXByb2dyZXNzIGFubm90YXRpb25cblx0XHRpZiAodGhpcy5jdXJyZW50QWN0aW9uKSB7XG5cdFx0XHR0aGlzLmRyYXdBY3Rpb24odGhpcy5jdXJyZW50QWN0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50ZXh0RWRpdFN0YXRlKSB7XG5cdFx0XHR0aGlzLmRyYXdUZXh0RWRpdFN0YXRlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudGV4dFBsYWNlbWVudFN0YXRlKSB7XG5cdFx0XHR0aGlzLmRyYXdUZXh0UGxhY2VtZW50U3RhdGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLmN0eC5yZXN0b3JlKCk7XG5cblx0XHQvLyBEcmF3IGNyb3Agb3ZlcmxheSB3aXRoIGhhbmRsZXNcblx0XHRpZiAodGhpcy5jcm9wTW9kZSAmJiB0aGlzLmNyb3BSZWdpb24pIHtcblx0XHRcdGNvbnN0IHIgPSB0aGlzLm5vcm1hbGl6ZUNyb3BSZWN0KHRoaXMuY3JvcFJlZ2lvbik7XG5cdFx0XHRjb25zdCBkcHIgPSBnZXRXaW5kb3codGhpcy5jYW52YXMpLmRldmljZVBpeGVsUmF0aW8gfHwgMTtcblx0XHRcdGNvbnN0IGN3ID0gdGhpcy5jYW52YXMud2lkdGggLyBkcHI7XG5cdFx0XHRjb25zdCBjaCA9IHRoaXMuY2FudmFzLmhlaWdodCAvIGRwcjtcblx0XHRcdGNvbnN0IHJ4ID0gci54ICogdGhpcy5zY2FsZTtcblx0XHRcdGNvbnN0IHJ5ID0gci55ICogdGhpcy5zY2FsZTtcblx0XHRcdGNvbnN0IHJ3ID0gci53aWR0aCAqIHRoaXMuc2NhbGU7XG5cdFx0XHRjb25zdCByaCA9IHIuaGVpZ2h0ICogdGhpcy5zY2FsZTtcblxuXHRcdFx0dGhpcy5jdHguc2F2ZSgpO1xuXHRcdFx0Ly8gRGltIGFyZWEgb3V0c2lkZSBjcm9wXG5cdFx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjUpJztcblx0XHRcdHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIGN3LCByeSk7ICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRvcFxuXHRcdFx0dGhpcy5jdHguZmlsbFJlY3QoMCwgcnkgKyByaCwgY3csIGNoIC0gKHJ5ICsgcmgpKTsgICAgICAgICAgLy8gYm90dG9tXG5cdFx0XHR0aGlzLmN0eC5maWxsUmVjdCgwLCByeSwgcngsIHJoKTsgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBsZWZ0XG5cdFx0XHR0aGlzLmN0eC5maWxsUmVjdChyeCArIHJ3LCByeSwgY3cgLSAocnggKyBydyksIHJoKTsgICAgICAgICAvLyByaWdodFxuXG5cdFx0XHQvLyBEcmF3IGNyb3AgYm9yZGVyXG5cdFx0XHR0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICcjZmZmZmZmJztcblx0XHRcdHRoaXMuY3R4LmxpbmVXaWR0aCA9IDE7XG5cdFx0XHR0aGlzLmN0eC5zdHJva2VSZWN0KHJ4LCByeSwgcncsIHJoKTtcblxuXHRcdFx0Ly8gRHJhdyA4IGhhbmRsZXMgKGNvcm5lciBzcXVhcmVzKVxuXHRcdFx0Y29uc3QgaGFuZGxlU2l6ZSA9IDEwO1xuXHRcdFx0Y29uc3QgaGFsZiA9IGhhbmRsZVNpemUgLyAyO1xuXHRcdFx0Y29uc3QgaGFuZGxlczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W10gPSBbXG5cdFx0XHRcdHsgeDogcngsIHk6IHJ5IH0sICAgICAgICAgICAgICAgICAvLyBud1xuXHRcdFx0XHR7IHg6IHJ4ICsgcncgLyAyLCB5OiByeSB9LCAgICAgICAgLy8gblxuXHRcdFx0XHR7IHg6IHJ4ICsgcncsIHk6IHJ5IH0sICAgICAgICAgICAgLy8gbmVcblx0XHRcdFx0eyB4OiByeCArIHJ3LCB5OiByeSArIHJoIC8gMiB9LCAgIC8vIGVcblx0XHRcdFx0eyB4OiByeCArIHJ3LCB5OiByeSArIHJoIH0sICAgICAgIC8vIHNlXG5cdFx0XHRcdHsgeDogcnggKyBydyAvIDIsIHk6IHJ5ICsgcmggfSwgICAvLyBzXG5cdFx0XHRcdHsgeDogcngsIHk6IHJ5ICsgcmggfSwgICAgICAgICAgICAvLyBzd1xuXHRcdFx0XHR7IHg6IHJ4LCB5OiByeSArIHJoIC8gMiB9LCAgICAgICAgLy8gd1xuXHRcdFx0XTtcblx0XHRcdHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjZmZmZmZmJztcblx0XHRcdHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyMwMDAwMDAnO1xuXHRcdFx0dGhpcy5jdHgubGluZVdpZHRoID0gMTtcblx0XHRcdGZvciAoY29uc3QgaCBvZiBoYW5kbGVzKSB7XG5cdFx0XHRcdHRoaXMuY3R4LmZpbGxSZWN0KGgueCAtIGhhbGYsIGgueSAtIGhhbGYsIGhhbmRsZVNpemUsIGhhbmRsZVNpemUpO1xuXHRcdFx0XHR0aGlzLmN0eC5zdHJva2VSZWN0KGgueCAtIGhhbGYsIGgueSAtIGhhbGYsIGhhbmRsZVNpemUsIGhhbmRsZVNpemUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jdHgucmVzdG9yZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZHJhd0FjdGlvbihhY3Rpb246IERyYXdBY3Rpb24pOiB2b2lkIHtcblx0XHQvLyBFcmFzZSwgY3JvcCBhbmQgbW92ZSByZWNvcmRzIGFyZSB1bmRvIHNlbnRpbmVsczsgbm90aGluZyB0byBkcmF3LlxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQW5ub3RhdGlvblRvb2wuRXJhc2VyIHx8IGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Dcm9wIHx8IGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5Nb3ZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHRjb25zdCBmaWxsQ29sb3IgPSBhY3Rpb24uZmlsbENvbG9yID8/ICd0cmFuc3BhcmVudCc7XG5cdFx0dGhpcy5jdHguZ2xvYmFsQWxwaGEgPSBhY3Rpb24ub3BhY2l0eTtcblx0XHR0aGlzLmN0eC5zdHJva2VTdHlsZSA9IGFjdGlvbi5zdHJva2VDb2xvcjtcblx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmlzVHJhbnNwYXJlbnQoZmlsbENvbG9yKSA/IGFjdGlvbi5zdHJva2VDb2xvciA6IGZpbGxDb2xvcjtcblx0XHR0aGlzLmN0eC5saW5lV2lkdGggPSBhY3Rpb24ubGluZVdpZHRoICogdGhpcy5zY2FsZTtcblx0XHR0aGlzLmN0eC5saW5lQ2FwID0gJ3JvdW5kJztcblx0XHR0aGlzLmN0eC5saW5lSm9pbiA9ICdyb3VuZCc7XG5cblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkZyZWVoYW5kOlxuXHRcdFx0XHRpZiAoYWN0aW9uLnBvaW50cyAmJiBhY3Rpb24ucG9pbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLmN0eC5iZWdpblBhdGgoKTtcblx0XHRcdFx0XHR0aGlzLmN0eC5tb3ZlVG8oYWN0aW9uLnBvaW50c1swXS54ICogdGhpcy5zY2FsZSwgYWN0aW9uLnBvaW50c1swXS55ICogdGhpcy5zY2FsZSk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBhY3Rpb24ucG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmN0eC5saW5lVG8oYWN0aW9uLnBvaW50c1tpXS54ICogdGhpcy5zY2FsZSwgYWN0aW9uLnBvaW50c1tpXS55ICogdGhpcy5zY2FsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuY3R4LnN0cm9rZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlJlY3RhbmdsZTpcblx0XHRcdFx0aWYgKGFjdGlvbi5yZWN0KSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzVHJhbnNwYXJlbnQoZmlsbENvbG9yKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jdHguZmlsbFJlY3QoXG5cdFx0XHRcdFx0XHRcdGFjdGlvbi5yZWN0LnggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24ucmVjdC55ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLnJlY3Qud2lkdGggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24ucmVjdC5oZWlnaHQgKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5jdHguc3Ryb2tlUmVjdChcblx0XHRcdFx0XHRcdGFjdGlvbi5yZWN0LnggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdFx0YWN0aW9uLnJlY3QueSAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRhY3Rpb24ucmVjdC53aWR0aCAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRhY3Rpb24ucmVjdC5oZWlnaHQgKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRWxsaXBzZTpcblx0XHRcdFx0aWYgKGFjdGlvbi5lbGxpcHNlUmVjdCkge1xuXHRcdFx0XHRcdGNvbnN0IHIgPSBhY3Rpb24uZWxsaXBzZVJlY3Q7XG5cdFx0XHRcdFx0Y29uc3QgY3ggPSAoci54ICsgci53aWR0aCAvIDIpICogdGhpcy5zY2FsZTtcblx0XHRcdFx0XHRjb25zdCBjeSA9IChyLnkgKyByLmhlaWdodCAvIDIpICogdGhpcy5zY2FsZTtcblx0XHRcdFx0XHRjb25zdCByeCA9IE1hdGguYWJzKHIud2lkdGggLyAyKSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRcdFx0Y29uc3QgcnkgPSBNYXRoLmFicyhyLmhlaWdodCAvIDIpICogdGhpcy5zY2FsZTtcblx0XHRcdFx0XHR0aGlzLmN0eC5iZWdpblBhdGgoKTtcblx0XHRcdFx0XHR0aGlzLmN0eC5lbGxpcHNlKGN4LCBjeSwgcngsIHJ5LCAwLCAwLCBNYXRoLlBJICogMik7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzVHJhbnNwYXJlbnQoZmlsbENvbG9yKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jdHguZmlsbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmN0eC5zdHJva2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5BcnJvdzpcblx0XHRcdFx0aWYgKGFjdGlvbi5hcnJvd1N0YXJ0ICYmIGFjdGlvbi5hcnJvd0VuZCkge1xuXHRcdFx0XHRcdHRoaXMuZHJhd0Fycm93KFxuXHRcdFx0XHRcdFx0YWN0aW9uLmFycm93U3RhcnQueCAqIHRoaXMuc2NhbGUsXG5cdFx0XHRcdFx0XHRhY3Rpb24uYXJyb3dTdGFydC55ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdGFjdGlvbi5hcnJvd0VuZC54ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdGFjdGlvbi5hcnJvd0VuZC55ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlRleHQ6XG5cdFx0XHRcdGlmIChhY3Rpb24udGV4dCAmJiBhY3Rpb24udGV4dFBvcykge1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRTaXplID0gKGFjdGlvbi5mb250U2l6ZSB8fCAxNikgKiB0aGlzLnNjYWxlO1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRGYW1pbHkgPSBhY3Rpb24uZm9udEZhbWlseSB8fCAnc2Fucy1zZXJpZic7XG5cdFx0XHRcdFx0Y29uc3Qgd2lkdGggPSAoYWN0aW9uLnRleHRXaWR0aCA/PyBERUZBVUxUX1RFWFRfQk9YX1dJRFRIKSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRcdFx0dGhpcy5jdHguZm9udCA9IGAke2ZvbnRTaXplfXB4ICR7Zm9udEZhbWlseX1gO1xuXHRcdFx0XHRcdHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICdhbHBoYWJldGljJztcblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNUcmFuc3BhcmVudChmaWxsQ29sb3IpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLm1lYXN1cmVXcmFwcGVkVGV4dChhY3Rpb24udGV4dCwgd2lkdGgsIGZvbnRTaXplLCBmb250RmFtaWx5KTtcblx0XHRcdFx0XHRcdHRoaXMuY3R4LmZpbGxSZWN0KFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24udGV4dFBvcy54ICogdGhpcy5zY2FsZSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uLnRleHRQb3MueSAqIHRoaXMuc2NhbGUgLSBmb250U2l6ZSxcblx0XHRcdFx0XHRcdFx0d2lkdGgsXG5cdFx0XHRcdFx0XHRcdE1hdGgubWF4KGxheW91dC5oZWlnaHQsIGZvbnRTaXplICogMS4yKSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuY3R4LmZpbGxTdHlsZSA9IGFjdGlvbi5zdHJva2VDb2xvcjtcblx0XHRcdFx0XHR0aGlzLmRyYXdXcmFwcGVkVGV4dChhY3Rpb24udGV4dCwgYWN0aW9uLnRleHRQb3MueCAqIHRoaXMuc2NhbGUsIGFjdGlvbi50ZXh0UG9zLnkgKiB0aGlzLnNjYWxlLCB3aWR0aCwgZm9udFNpemUsIGZvbnRGYW1pbHkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHRoaXMuY3R4LnJlc3RvcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZHJhd1RleHRFZGl0U3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRleHRFZGl0U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IHBvcywgdGV4dCwgc3Ryb2tlQ29sb3IsIGZpbGxDb2xvciwgb3BhY2l0eSwgZm9udEZhbWlseSwgZm9udFNpemUsIGNhcmV0SW5kZXgsIHdpZHRoLCBzaG93Qm94T3V0bGluZSB9ID0gdGhpcy50ZXh0RWRpdFN0YXRlO1xuXHRcdGNvbnN0IHNjYWxlZEZvbnRTaXplID0gZm9udFNpemUgKiB0aGlzLnNjYWxlO1xuXHRcdGNvbnN0IHNjYWxlZFdpZHRoID0gd2lkdGggKiB0aGlzLnNjYWxlO1xuXHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHR0aGlzLmN0eC5nbG9iYWxBbHBoYSA9IG9wYWNpdHk7XG5cdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gc3Ryb2tlQ29sb3I7XG5cdFx0dGhpcy5jdHguc3Ryb2tlU3R5bGUgPSBzdHJva2VDb2xvcjtcblx0XHR0aGlzLmN0eC5saW5lV2lkdGggPSBNYXRoLm1heCgxLCB0aGlzLnNjYWxlKTtcblx0XHR0aGlzLmN0eC5mb250ID0gYCR7c2NhbGVkRm9udFNpemV9cHggJHtmb250RmFtaWx5fWA7XG5cdFx0dGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ2FscGhhYmV0aWMnO1xuXHRcdGlmICghdGhpcy5pc1RyYW5zcGFyZW50KGZpbGxDb2xvcikpIHtcblx0XHRcdGNvbnN0IGxheW91dCA9IHRoaXMubWVhc3VyZVdyYXBwZWRUZXh0KHRleHQsIHNjYWxlZFdpZHRoLCBzY2FsZWRGb250U2l6ZSwgZm9udEZhbWlseSk7XG5cdFx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSBmaWxsQ29sb3I7XG5cdFx0XHR0aGlzLmN0eC5maWxsUmVjdChcblx0XHRcdFx0cG9zLnggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRwb3MueSAqIHRoaXMuc2NhbGUgLSBzY2FsZWRGb250U2l6ZSxcblx0XHRcdFx0c2NhbGVkV2lkdGgsXG5cdFx0XHRcdE1hdGgubWF4KGxheW91dC5oZWlnaHQsIHNjYWxlZEZvbnRTaXplICogMS4yKSxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSBzdHJva2VDb2xvcjtcblx0XHR9XG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5kcmF3V3JhcHBlZFRleHQodGV4dCwgcG9zLnggKiB0aGlzLnNjYWxlLCBwb3MueSAqIHRoaXMuc2NhbGUsIHNjYWxlZFdpZHRoLCBzY2FsZWRGb250U2l6ZSwgZm9udEZhbWlseSk7XG5cblx0XHRpZiAoc2hvd0JveE91dGxpbmUpIHtcblx0XHRcdHRoaXMuY3R4LnNldExpbmVEYXNoKFs0LCA0XSk7XG5cdFx0XHR0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICdyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNyknO1xuXHRcdFx0dGhpcy5jdHguc3Ryb2tlUmVjdChcblx0XHRcdFx0cG9zLnggKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHRwb3MueSAqIHRoaXMuc2NhbGUgLSBzY2FsZWRGb250U2l6ZSxcblx0XHRcdFx0c2NhbGVkV2lkdGgsXG5cdFx0XHRcdE1hdGgubWF4KGxheW91dC5oZWlnaHQsIHNjYWxlZEZvbnRTaXplICogMS4yKSxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmN0eC5zZXRMaW5lRGFzaChbXSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudGV4dENhcmV0VmlzaWJsZSkge1xuXHRcdFx0Y29uc3QgY2FyZXQgPSB0aGlzLmdldFRleHRDYXJldE1ldHJpY3ModGV4dCwgY2FyZXRJbmRleCwgc2NhbGVkV2lkdGgsIHNjYWxlZEZvbnRTaXplLCBmb250RmFtaWx5KTtcblx0XHRcdGNvbnN0IGNhcmV0WCA9IHBvcy54ICogdGhpcy5zY2FsZSArIGNhcmV0Lng7XG5cdFx0XHRjb25zdCBiYXNlbGluZVkgPSBwb3MueSAqIHRoaXMuc2NhbGUgKyBjYXJldC5iYXNlbGluZU9mZnNldFk7XG5cdFx0XHR0aGlzLmN0eC5iZWdpblBhdGgoKTtcblx0XHRcdHRoaXMuY3R4Lm1vdmVUbyhjYXJldFgsIGJhc2VsaW5lWSAtIHNjYWxlZEZvbnRTaXplKTtcblx0XHRcdHRoaXMuY3R4LmxpbmVUbyhjYXJldFgsIGJhc2VsaW5lWSArIE1hdGgubWF4KDIsIHRoaXMuc2NhbGUpKTtcblx0XHRcdHRoaXMuY3R4LnN0cm9rZSgpO1xuXHRcdH1cblx0XHR0aGlzLmN0eC5yZXN0b3JlKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzVHJhbnNwYXJlbnQoY29sb3I6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb2xvciA9PT0gJ3RyYW5zcGFyZW50Jztcblx0fVxuXG5cdHByaXZhdGUgZHJhd1RleHRQbGFjZW1lbnRTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudGV4dFBsYWNlbWVudFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgc3RhcnQsIGN1cnJlbnQgfSA9IHRoaXMudGV4dFBsYWNlbWVudFN0YXRlO1xuXHRcdGNvbnN0IGR4ID0gY3VycmVudC54IC0gc3RhcnQueDtcblx0XHRjb25zdCBkaWREcmFnID0gTWF0aC5hYnMoZHgpID49IFRFWFRfRFJBR19USFJFU0hPTEQ7XG5cdFx0aWYgKCFkaWREcmFnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHggPSBNYXRoLm1pbihzdGFydC54LCBjdXJyZW50LngpO1xuXHRcdGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5taW4oTWF0aC5hYnMoZHgpLCB0aGlzLmdldFRleHRJbWFnZVJpZ2h0KCkgLSB4KSk7XG5cdFx0Y29uc3QgeSA9IChzdGFydC55IC0gdGhpcy5hY3RpdmVGb250U2l6ZSkgKiB0aGlzLnNjYWxlO1xuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuYWN0aXZlRm9udFNpemUgKiB0aGlzLnNjYWxlICogMS4yO1xuXHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHR0aGlzLmN0eC5zZXRMaW5lRGFzaChbNCwgNF0pO1xuXHRcdHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC43KSc7XG5cdFx0dGhpcy5jdHgubGluZVdpZHRoID0gTWF0aC5tYXgoMSwgdGhpcy5zY2FsZSk7XG5cdFx0dGhpcy5jdHguc3Ryb2tlUmVjdCh4ICogdGhpcy5zY2FsZSwgeSwgd2lkdGggKiB0aGlzLnNjYWxlLCBoZWlnaHQpO1xuXHRcdHRoaXMuY3R4LnNldExpbmVEYXNoKFtdKTtcblx0XHR0aGlzLmN0eC5yZXN0b3JlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRyYXdXcmFwcGVkVGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgYmFzZWxpbmVZOiBudW1iZXIsIG1heFdpZHRoOiBudW1iZXIsIGZvbnRTaXplOiBudW1iZXIsIGZvbnRGYW1pbHk6IHN0cmluZyk6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGxpbmVIZWlnaHQ6IG51bWJlciB9IHtcblx0XHRjb25zdCBsYXlvdXQgPSB0aGlzLm1lYXN1cmVXcmFwcGVkVGV4dCh0ZXh0LCBtYXhXaWR0aCwgZm9udFNpemUsIGZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBsYXlvdXQubGluZUhlaWdodDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxheW91dC5saW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxheW91dC5saW5lc1tpXTtcblx0XHRcdHRoaXMuY3R4LmZpbGxUZXh0KGxpbmUudGV4dCwgeCwgYmFzZWxpbmVZICsgaSAqIGxpbmVIZWlnaHQpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkdGg6IGxheW91dC53aWR0aCxcblx0XHRcdGhlaWdodDogbGF5b3V0LmhlaWdodCxcblx0XHRcdGxpbmVIZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGV4dENhcmV0TWV0cmljcyh0ZXh0OiBzdHJpbmcsIGNhcmV0SW5kZXg6IG51bWJlciwgbWF4V2lkdGg6IG51bWJlciwgZm9udFNpemU6IG51bWJlciwgZm9udEZhbWlseTogc3RyaW5nKTogeyB4OiBudW1iZXI7IGJhc2VsaW5lT2Zmc2V0WTogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMubWVhc3VyZVdyYXBwZWRUZXh0KHRleHQsIG1heFdpZHRoLCBmb250U2l6ZSwgZm9udEZhbWlseSk7XG5cdFx0Y29uc3QgbGluZSA9IFsuLi5sYXlvdXQubGluZXNdLnJldmVyc2UoKS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuc3RhcnRJbmRleCA8PSBjYXJldEluZGV4KSA/PyBsYXlvdXQubGluZXNbMF07XG5cdFx0Y29uc3Qgc2FmZUNhcmV0SW5kZXggPSBNYXRoLm1pbihNYXRoLm1heChjYXJldEluZGV4LCBsaW5lLnN0YXJ0SW5kZXgpLCBsaW5lLmVuZEluZGV4KTtcblx0XHRjb25zdCBiZWZvcmVDYXJldCA9IGxpbmUudGV4dC5zbGljZSgwLCBzYWZlQ2FyZXRJbmRleCAtIGxpbmUuc3RhcnRJbmRleCk7XG5cdFx0dGhpcy5jdHguc2F2ZSgpO1xuXHRcdHRoaXMuY3R4LmZvbnQgPSBgJHtmb250U2l6ZX1weCAke2ZvbnRGYW1pbHl9YDtcblx0XHRjb25zdCB4ID0gdGhpcy5jdHgubWVhc3VyZVRleHQoYmVmb3JlQ2FyZXQpLndpZHRoO1xuXHRcdHRoaXMuY3R4LnJlc3RvcmUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eCxcblx0XHRcdGJhc2VsaW5lT2Zmc2V0WTogbGluZS5saW5lSW5kZXggKiBsYXlvdXQubGluZUhlaWdodCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBtZWFzdXJlV3JhcHBlZFRleHQodGV4dDogc3RyaW5nLCBtYXhXaWR0aDogbnVtYmVyLCBmb250U2l6ZTogbnVtYmVyLCBmb250RmFtaWx5OiBzdHJpbmcpOiB7IGxpbmVzOiB7IHRleHQ6IHN0cmluZzsgc3RhcnRJbmRleDogbnVtYmVyOyBlbmRJbmRleDogbnVtYmVyOyBsaW5lSW5kZXg6IG51bWJlciB9W107IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBsaW5lSGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0dGhpcy5jdHguc2F2ZSgpO1xuXHRcdHRoaXMuY3R4LmZvbnQgPSBgJHtmb250U2l6ZX1weCAke2ZvbnRGYW1pbHl9YDtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZm9udFNpemUgKiAxLjI7XG5cdFx0Y29uc3QgbGluZXM6IHsgdGV4dDogc3RyaW5nOyBzdGFydEluZGV4OiBudW1iZXI7IGVuZEluZGV4OiBudW1iZXI7IGxpbmVJbmRleDogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHBhcmFncmFwaHMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRsZXQgZ2xvYmFsSW5kZXggPSAwO1xuXHRcdGxldCBsaW5lSW5kZXggPSAwO1xuXHRcdGxldCBtYXhMaW5lV2lkdGggPSAwO1xuXG5cdFx0Zm9yIChsZXQgcCA9IDA7IHAgPCBwYXJhZ3JhcGhzLmxlbmd0aDsgcCsrKSB7XG5cdFx0XHRjb25zdCBwYXJhZ3JhcGggPSBwYXJhZ3JhcGhzW3BdO1xuXHRcdFx0Y29uc3QgcGFyYWdyYXBoU3RhcnQgPSBnbG9iYWxJbmRleDtcblx0XHRcdGNvbnN0IHBhcmFncmFwaEVuZCA9IHBhcmFncmFwaFN0YXJ0ICsgcGFyYWdyYXBoLmxlbmd0aDtcblxuXHRcdFx0aWYgKHBhcmFncmFwaC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bGluZXMucHVzaCh7IHRleHQ6ICcnLCBzdGFydEluZGV4OiBwYXJhZ3JhcGhTdGFydCwgZW5kSW5kZXg6IHBhcmFncmFwaFN0YXJ0LCBsaW5lSW5kZXggfSk7XG5cdFx0XHRcdGxpbmVJbmRleCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGxpbmVTdGFydCA9IHBhcmFncmFwaFN0YXJ0O1xuXHRcdFx0XHR3aGlsZSAobGluZVN0YXJ0IDwgcGFyYWdyYXBoRW5kKSB7XG5cdFx0XHRcdFx0bGV0IGJlc3RFbmQgPSBsaW5lU3RhcnQgKyAxO1xuXHRcdFx0XHRcdGxldCBsYXN0V2hpdGVzcGFjZUJyZWFrID0gLTE7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IGxpbmVTdGFydCArIDE7IGkgPD0gcGFyYWdyYXBoRW5kOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHRleHQuc2xpY2UobGluZVN0YXJ0LCBpKTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmN0eC5tZWFzdXJlVGV4dChjYW5kaWRhdGUpLndpZHRoIDw9IG1heFdpZHRoKSB7XG5cdFx0XHRcdFx0XHRcdGJlc3RFbmQgPSBpO1xuXHRcdFx0XHRcdFx0XHRpZiAoL1xccy8udGVzdCh0ZXh0W2kgLSAxXSkpIHtcblx0XHRcdFx0XHRcdFx0XHRsYXN0V2hpdGVzcGFjZUJyZWFrID0gaTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGxpbmVFbmQgPSBiZXN0RW5kO1xuXHRcdFx0XHRcdGlmIChiZXN0RW5kIDwgcGFyYWdyYXBoRW5kICYmIGxhc3RXaGl0ZXNwYWNlQnJlYWsgPiBsaW5lU3RhcnQpIHtcblx0XHRcdFx0XHRcdGxpbmVFbmQgPSBsYXN0V2hpdGVzcGFjZUJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobGluZUVuZCA8PSBsaW5lU3RhcnQpIHtcblx0XHRcdFx0XHRcdGxpbmVFbmQgPSBsaW5lU3RhcnQgKyAxO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJhd0xpbmVUZXh0ID0gdGV4dC5zbGljZShsaW5lU3RhcnQsIGxpbmVFbmQpO1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gcmF3TGluZVRleHQucmVwbGFjZSgvXFxzKyQvdSwgJycpO1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goeyB0ZXh0OiBsaW5lVGV4dCwgc3RhcnRJbmRleDogbGluZVN0YXJ0LCBlbmRJbmRleDogbGluZUVuZCwgbGluZUluZGV4IH0pO1xuXHRcdFx0XHRcdG1heExpbmVXaWR0aCA9IE1hdGgubWF4KG1heExpbmVXaWR0aCwgdGhpcy5jdHgubWVhc3VyZVRleHQobGluZVRleHQpLndpZHRoKTtcblx0XHRcdFx0XHRsaW5lSW5kZXgrKztcblxuXHRcdFx0XHRcdGxpbmVTdGFydCA9IGxpbmVFbmQ7XG5cdFx0XHRcdFx0d2hpbGUgKGxpbmVTdGFydCA8IHBhcmFncmFwaEVuZCAmJiAvXFxzL3UudGVzdCh0ZXh0W2xpbmVTdGFydF0pKSB7XG5cdFx0XHRcdFx0XHRsaW5lU3RhcnQrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Z2xvYmFsSW5kZXggPSBwYXJhZ3JhcGhFbmQgKyAxO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGxpbmVzLnB1c2goeyB0ZXh0OiAnJywgc3RhcnRJbmRleDogMCwgZW5kSW5kZXg6IDAsIGxpbmVJbmRleDogMCB9KTtcblx0XHR9XG5cblx0XHRpZiAobWF4TGluZVdpZHRoID09PSAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdFx0bWF4TGluZVdpZHRoID0gTWF0aC5tYXgobWF4TGluZVdpZHRoLCB0aGlzLmN0eC5tZWFzdXJlVGV4dChsaW5lLnRleHQpLndpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jdHgucmVzdG9yZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5lcyxcblx0XHRcdHdpZHRoOiBNYXRoLm1heChtYXhMaW5lV2lkdGgsIG1heFdpZHRoKSxcblx0XHRcdGhlaWdodDogbGluZXMubGVuZ3RoICogbGluZUhlaWdodCxcblx0XHRcdGxpbmVIZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgaGl0VGVzdChwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuYWN0aW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHRoaXMuaXNQb2ludE9uQWN0aW9uKHBvcywgdGhpcy5hY3Rpb25zW2ldKSkge1xuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1BvaW50T25BY3Rpb24ocG9zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGFjdGlvbjogRHJhd0FjdGlvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRocmVzaG9sZCA9IDg7XG5cdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5GcmVlaGFuZDpcblx0XHRcdFx0aWYgKGFjdGlvbi5wb2ludHMpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGFjdGlvbi5wb2ludHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnBvaW50VG9TZWdtZW50RGlzdChwb3MsIGFjdGlvbi5wb2ludHNbaSAtIDFdLCBhY3Rpb24ucG9pbnRzW2ldKSA8IHRocmVzaG9sZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGU6XG5cdFx0XHRcdGlmIChhY3Rpb24ucmVjdCkge1xuXHRcdFx0XHRcdGNvbnN0IHIgPSBhY3Rpb24ucmVjdDtcblx0XHRcdFx0XHRjb25zdCBueCA9IE1hdGgubWluKHIueCwgci54ICsgci53aWR0aCk7XG5cdFx0XHRcdFx0Y29uc3QgbnkgPSBNYXRoLm1pbihyLnksIHIueSArIHIuaGVpZ2h0KTtcblx0XHRcdFx0XHRjb25zdCBudyA9IE1hdGguYWJzKHIud2lkdGgpO1xuXHRcdFx0XHRcdGNvbnN0IG5oID0gTWF0aC5hYnMoci5oZWlnaHQpO1xuXHRcdFx0XHRcdHJldHVybiBwb3MueCA+PSBueCAtIHRocmVzaG9sZCAmJiBwb3MueCA8PSBueCArIG53ICsgdGhyZXNob2xkICYmXG5cdFx0XHRcdFx0XHRwb3MueSA+PSBueSAtIHRocmVzaG9sZCAmJiBwb3MueSA8PSBueSArIG5oICsgdGhyZXNob2xkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRWxsaXBzZTpcblx0XHRcdFx0aWYgKGFjdGlvbi5lbGxpcHNlUmVjdCkge1xuXHRcdFx0XHRcdGNvbnN0IGVyID0gYWN0aW9uLmVsbGlwc2VSZWN0O1xuXHRcdFx0XHRcdGNvbnN0IGN4ID0gZXIueCArIGVyLndpZHRoIC8gMjtcblx0XHRcdFx0XHRjb25zdCBjeSA9IGVyLnkgKyBlci5oZWlnaHQgLyAyO1xuXHRcdFx0XHRcdGNvbnN0IHJ4ID0gTWF0aC5hYnMoZXIud2lkdGggLyAyKTtcblx0XHRcdFx0XHRjb25zdCByeSA9IE1hdGguYWJzKGVyLmhlaWdodCAvIDIpO1xuXHRcdFx0XHRcdGlmIChyeCA8IDEgfHwgcnkgPCAxKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIE5vcm1hbGl6ZWQgZGlzdGFuY2UgZnJvbSBjZW50ZXJcblx0XHRcdFx0XHRjb25zdCBkeCA9IChwb3MueCAtIGN4KSAvIHJ4O1xuXHRcdFx0XHRcdGNvbnN0IGR5ID0gKHBvcy55IC0gY3kpIC8gcnk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzdCA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzVHJhbnNwYXJlbnQoYWN0aW9uLmZpbGxDb2xvciA/PyAndHJhbnNwYXJlbnQnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRpc3QgPD0gMSArIHRocmVzaG9sZCAvIE1hdGgubWluKHJ4LCByeSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHBvaW50IGlzIG5lYXIgdGhlIGVsbGlwc2UgYm9yZGVyIChkaXN0IGFyb3VuZCAxKVxuXHRcdFx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRUaHJlc2hvbGQgPSB0aHJlc2hvbGQgLyBNYXRoLm1pbihyeCwgcnkpO1xuXHRcdFx0XHRcdHJldHVybiBNYXRoLmFicyhkaXN0IC0gMSkgPCBub3JtYWxpemVkVGhyZXNob2xkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuQXJyb3c6XG5cdFx0XHRcdGlmIChhY3Rpb24uYXJyb3dTdGFydCAmJiBhY3Rpb24uYXJyb3dFbmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wb2ludFRvU2VnbWVudERpc3QocG9zLCBhY3Rpb24uYXJyb3dTdGFydCwgYWN0aW9uLmFycm93RW5kKSA8IHRocmVzaG9sZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlRleHQ6XG5cdFx0XHRcdGlmIChhY3Rpb24udGV4dCAmJiBhY3Rpb24udGV4dFBvcykge1xuXHRcdFx0XHRcdGNvbnN0IGJvdW5kcyA9IHRoaXMuZ2V0QWN0aW9uQm91bmRzKGFjdGlvbik7XG5cdFx0XHRcdFx0aWYgKCFib3VuZHMpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHBvcy54ID49IGFjdGlvbi50ZXh0UG9zLnggLSB0aHJlc2hvbGQgJiZcblx0XHRcdFx0XHRcdHBvcy54IDw9IGJvdW5kcy54ICsgYm91bmRzLndpZHRoICsgdGhyZXNob2xkICYmXG5cdFx0XHRcdFx0XHRwb3MueSA+PSBib3VuZHMueSAtIHRocmVzaG9sZCAmJlxuXHRcdFx0XHRcdFx0cG9zLnkgPD0gYm91bmRzLnkgKyBib3VuZHMuaGVpZ2h0ICsgdGhyZXNob2xkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBwb2ludFRvU2VnbWVudERpc3QocDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCBhOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sIGI6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IG51bWJlciB7XG5cdFx0Y29uc3QgZHggPSBiLnggLSBhLng7XG5cdFx0Y29uc3QgZHkgPSBiLnkgLSBhLnk7XG5cdFx0Y29uc3QgbGVuZ3RoU3EgPSBkeCAqIGR4ICsgZHkgKiBkeTtcblx0XHRpZiAobGVuZ3RoU3EgPT09IDApIHtcblx0XHRcdHJldHVybiBNYXRoLmh5cG90KHAueCAtIGEueCwgcC55IC0gYS55KTtcblx0XHR9XG5cdFx0bGV0IHQgPSAoKHAueCAtIGEueCkgKiBkeCArIChwLnkgLSBhLnkpICogZHkpIC8gbGVuZ3RoU3E7XG5cdFx0dCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHQpKTtcblx0XHRjb25zdCBwcm9qWCA9IGEueCArIHQgKiBkeDtcblx0XHRjb25zdCBwcm9qWSA9IGEueSArIHQgKiBkeTtcblx0XHRyZXR1cm4gTWF0aC5oeXBvdChwLnggLSBwcm9qWCwgcC55IC0gcHJvalkpO1xuXHR9XG5cblx0cHJpdmF0ZSBtb3ZlQWN0aW9uKGFjdGlvbjogRHJhd0FjdGlvbiwgZHg6IG51bWJlciwgZHk6IG51bWJlcik6IHZvaWQge1xuXHRcdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRnJlZWhhbmQ6XG5cdFx0XHRcdGlmIChhY3Rpb24ucG9pbnRzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwdCBvZiBhY3Rpb24ucG9pbnRzKSB7XG5cdFx0XHRcdFx0XHRwdC54ICs9IGR4O1xuXHRcdFx0XHRcdFx0cHQueSArPSBkeTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLlJlY3RhbmdsZTpcblx0XHRcdFx0aWYgKGFjdGlvbi5yZWN0KSB7XG5cdFx0XHRcdFx0YWN0aW9uLnJlY3QueCArPSBkeDtcblx0XHRcdFx0XHRhY3Rpb24ucmVjdC55ICs9IGR5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5FbGxpcHNlOlxuXHRcdFx0XHRpZiAoYWN0aW9uLmVsbGlwc2VSZWN0KSB7XG5cdFx0XHRcdFx0YWN0aW9uLmVsbGlwc2VSZWN0LnggKz0gZHg7XG5cdFx0XHRcdFx0YWN0aW9uLmVsbGlwc2VSZWN0LnkgKz0gZHk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkFycm93OlxuXHRcdFx0XHRpZiAoYWN0aW9uLmFycm93U3RhcnQpIHtcblx0XHRcdFx0XHRhY3Rpb24uYXJyb3dTdGFydC54ICs9IGR4O1xuXHRcdFx0XHRcdGFjdGlvbi5hcnJvd1N0YXJ0LnkgKz0gZHk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFjdGlvbi5hcnJvd0VuZCkge1xuXHRcdFx0XHRcdGFjdGlvbi5hcnJvd0VuZC54ICs9IGR4O1xuXHRcdFx0XHRcdGFjdGlvbi5hcnJvd0VuZC55ICs9IGR5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5UZXh0OlxuXHRcdFx0XHRpZiAoYWN0aW9uLnRleHRQb3MpIHtcblx0XHRcdFx0XHRhY3Rpb24udGV4dFBvcy54ICs9IGR4O1xuXHRcdFx0XHRcdGFjdGlvbi50ZXh0UG9zLnkgKz0gZHk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkcmF3U2VsZWN0aW9uSGlnaGxpZ2h0KGFjdGlvbjogRHJhd0FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuY3R4LnNhdmUoKTtcblx0XHR0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICcjMDA3YWNjJztcblx0XHR0aGlzLmN0eC5saW5lV2lkdGggPSAxO1xuXHRcdHRoaXMuY3R4LnNldExpbmVEYXNoKFs0LCA0XSk7XG5cdFx0Y29uc3QgcGFkID0gNjtcblx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmdldEFjdGlvbkJvdW5kcyhhY3Rpb24pO1xuXHRcdGlmIChib3VuZHMpIHtcblx0XHRcdHRoaXMuY3R4LnN0cm9rZVJlY3QoXG5cdFx0XHRcdChib3VuZHMueCAtIHBhZCkgKiB0aGlzLnNjYWxlLFxuXHRcdFx0XHQoYm91bmRzLnkgLSBwYWQpICogdGhpcy5zY2FsZSxcblx0XHRcdFx0KGJvdW5kcy53aWR0aCArIHBhZCAqIDIpICogdGhpcy5zY2FsZSxcblx0XHRcdFx0KGJvdW5kcy5oZWlnaHQgKyBwYWQgKiAyKSAqIHRoaXMuc2NhbGUsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBbm5vdGF0aW9uVG9vbC5UZXh0KSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZVNpemUgPSA4O1xuXHRcdFx0XHRjb25zdCBoYW5kbGVYID0gKGJvdW5kcy54ICsgYm91bmRzLndpZHRoICsgcGFkKSAqIHRoaXMuc2NhbGU7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZVkgPSAoYm91bmRzLnkgKyBib3VuZHMuaGVpZ2h0IC8gMikgKiB0aGlzLnNjYWxlO1xuXHRcdFx0XHR0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzAwN2FjYyc7XG5cdFx0XHRcdHRoaXMuY3R4LmZpbGxSZWN0KGhhbmRsZVggLSBoYW5kbGVTaXplIC8gMiwgaGFuZGxlWSAtIGhhbmRsZVNpemUgLyAyLCBoYW5kbGVTaXplLCBoYW5kbGVTaXplKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jdHguc2V0TGluZURhc2goW10pO1xuXHRcdHRoaXMuY3R4LnJlc3RvcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgaXNOZWFyVGV4dFJlc2l6ZUhhbmRsZShwb3M6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgYWN0aW9uOiBEcmF3QWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKGFjdGlvbi50eXBlICE9PSBBbm5vdGF0aW9uVG9vbC5UZXh0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGJvdW5kcyA9IHRoaXMuZ2V0QWN0aW9uQm91bmRzKGFjdGlvbik7XG5cdFx0aWYgKCFib3VuZHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGhyZXNob2xkID0gODtcblx0XHRjb25zdCBoYW5kbGVYID0gYm91bmRzLnggKyBib3VuZHMud2lkdGg7XG5cdFx0Y29uc3QgaGFuZGxlWSA9IGJvdW5kcy55ICsgYm91bmRzLmhlaWdodCAvIDI7XG5cdFx0cmV0dXJuIE1hdGguYWJzKHBvcy54IC0gaGFuZGxlWCkgPD0gdGhyZXNob2xkICYmIE1hdGguYWJzKHBvcy55IC0gaGFuZGxlWSkgPD0gdGhyZXNob2xkICogMjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9uQm91bmRzKGFjdGlvbjogRHJhd0FjdGlvbik6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsIHtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkZyZWVoYW5kOlxuXHRcdFx0XHRpZiAoYWN0aW9uLnBvaW50cyAmJiBhY3Rpb24ucG9pbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwdCBvZiBhY3Rpb24ucG9pbnRzKSB7XG5cdFx0XHRcdFx0XHRtaW5YID0gTWF0aC5taW4obWluWCwgcHQueCk7XG5cdFx0XHRcdFx0XHRtaW5ZID0gTWF0aC5taW4obWluWSwgcHQueSk7XG5cdFx0XHRcdFx0XHRtYXhYID0gTWF0aC5tYXgobWF4WCwgcHQueCk7XG5cdFx0XHRcdFx0XHRtYXhZID0gTWF0aC5tYXgobWF4WSwgcHQueSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IHg6IG1pblgsIHk6IG1pblksIHdpZHRoOiBtYXhYIC0gbWluWCwgaGVpZ2h0OiBtYXhZIC0gbWluWSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0Y2FzZSBBbm5vdGF0aW9uVG9vbC5SZWN0YW5nbGU6XG5cdFx0XHRcdGlmIChhY3Rpb24ucmVjdCkge1xuXHRcdFx0XHRcdGNvbnN0IHIgPSBhY3Rpb24ucmVjdDtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0eDogTWF0aC5taW4oci54LCByLnggKyByLndpZHRoKSxcblx0XHRcdFx0XHRcdHk6IE1hdGgubWluKHIueSwgci55ICsgci5oZWlnaHQpLFxuXHRcdFx0XHRcdFx0d2lkdGg6IE1hdGguYWJzKHIud2lkdGgpLFxuXHRcdFx0XHRcdFx0aGVpZ2h0OiBNYXRoLmFicyhyLmhlaWdodCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuRWxsaXBzZTpcblx0XHRcdFx0aWYgKGFjdGlvbi5lbGxpcHNlUmVjdCkge1xuXHRcdFx0XHRcdGNvbnN0IGVyID0gYWN0aW9uLmVsbGlwc2VSZWN0O1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR4OiBNYXRoLm1pbihlci54LCBlci54ICsgZXIud2lkdGgpLFxuXHRcdFx0XHRcdFx0eTogTWF0aC5taW4oZXIueSwgZXIueSArIGVyLmhlaWdodCksXG5cdFx0XHRcdFx0XHR3aWR0aDogTWF0aC5hYnMoZXIud2lkdGgpLFxuXHRcdFx0XHRcdFx0aGVpZ2h0OiBNYXRoLmFicyhlci5oZWlnaHQpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRjYXNlIEFubm90YXRpb25Ub29sLkFycm93OlxuXHRcdFx0XHRpZiAoYWN0aW9uLmFycm93U3RhcnQgJiYgYWN0aW9uLmFycm93RW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWluWCA9IE1hdGgubWluKGFjdGlvbi5hcnJvd1N0YXJ0LngsIGFjdGlvbi5hcnJvd0VuZC54KTtcblx0XHRcdFx0XHRjb25zdCBtaW5ZID0gTWF0aC5taW4oYWN0aW9uLmFycm93U3RhcnQueSwgYWN0aW9uLmFycm93RW5kLnkpO1xuXHRcdFx0XHRcdGNvbnN0IG1heFggPSBNYXRoLm1heChhY3Rpb24uYXJyb3dTdGFydC54LCBhY3Rpb24uYXJyb3dFbmQueCk7XG5cdFx0XHRcdFx0Y29uc3QgbWF4WSA9IE1hdGgubWF4KGFjdGlvbi5hcnJvd1N0YXJ0LnksIGFjdGlvbi5hcnJvd0VuZC55KTtcblx0XHRcdFx0XHRyZXR1cm4geyB4OiBtaW5YLCB5OiBtaW5ZLCB3aWR0aDogbWF4WCAtIG1pblgsIGhlaWdodDogbWF4WSAtIG1pblkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdGNhc2UgQW5ub3RhdGlvblRvb2wuVGV4dDpcblx0XHRcdFx0aWYgKGFjdGlvbi50ZXh0ICYmIGFjdGlvbi50ZXh0UG9zKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9udFNpemUgPSBhY3Rpb24uZm9udFNpemUgfHwgMTY7XG5cdFx0XHRcdFx0Y29uc3QgZm9udEZhbWlseSA9IGFjdGlvbi5mb250RmFtaWx5IHx8ICdzYW5zLXNlcmlmJztcblx0XHRcdFx0XHRjb25zdCB0ZXh0V2lkdGggPSBhY3Rpb24udGV4dFdpZHRoID8/IERFRkFVTFRfVEVYVF9CT1hfV0lEVEg7XG5cdFx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5tZWFzdXJlV3JhcHBlZFRleHQoYWN0aW9uLnRleHQsIHRleHRXaWR0aCwgZm9udFNpemUsIGZvbnRGYW1pbHkpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR4OiBhY3Rpb24udGV4dFBvcy54LFxuXHRcdFx0XHRcdFx0eTogYWN0aW9uLnRleHRQb3MueSAtIGZvbnRTaXplLFxuXHRcdFx0XHRcdFx0d2lkdGg6IHRleHRXaWR0aCxcblx0XHRcdFx0XHRcdGhlaWdodDogbGF5b3V0LmhlaWdodCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZHJhd0Fycm93KGZyb21YOiBudW1iZXIsIGZyb21ZOiBudW1iZXIsIHRvWDogbnVtYmVyLCB0b1k6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGR4ID0gdG9YIC0gZnJvbVg7XG5cdFx0Y29uc3QgZHkgPSB0b1kgLSBmcm9tWTtcblx0XHRjb25zdCBsZW5ndGggPSBNYXRoLmh5cG90KGR4LCBkeSk7XG5cdFx0aWYgKGxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVuaXRYID0gZHggLyBsZW5ndGg7XG5cdFx0Y29uc3QgdW5pdFkgPSBkeSAvIGxlbmd0aDtcblx0XHRjb25zdCBub3JtYWxYID0gLXVuaXRZO1xuXHRcdGNvbnN0IG5vcm1hbFkgPSB1bml0WDtcblx0XHRjb25zdCBsaW5lV2lkdGggPSB0aGlzLmN0eC5saW5lV2lkdGg7XG5cdFx0Y29uc3QgaGVhZExlbmd0aCA9IE1hdGgubWluKE1hdGgubWF4KDEyICogdGhpcy5zY2FsZSwgbGluZVdpZHRoICogMyksIGxlbmd0aCk7XG5cdFx0Y29uc3QgaGVhZFdpZHRoID0gTWF0aC5tYXgoMTAgKiB0aGlzLnNjYWxlLCBsaW5lV2lkdGggKiAyLjUpO1xuXHRcdGNvbnN0IGJhc2VYID0gdG9YIC0gdW5pdFggKiBoZWFkTGVuZ3RoO1xuXHRcdGNvbnN0IGJhc2VZID0gdG9ZIC0gdW5pdFkgKiBoZWFkTGVuZ3RoO1xuXG5cdFx0dGhpcy5jdHguYmVnaW5QYXRoKCk7XG5cdFx0dGhpcy5jdHgubW92ZVRvKGZyb21YLCBmcm9tWSk7XG5cdFx0dGhpcy5jdHgubGluZVRvKGJhc2VYLCBiYXNlWSk7XG5cdFx0dGhpcy5jdHguc3Ryb2tlKCk7XG5cblx0XHR0aGlzLmN0eC5iZWdpblBhdGgoKTtcblx0XHR0aGlzLmN0eC5tb3ZlVG8odG9YLCB0b1kpO1xuXHRcdHRoaXMuY3R4LmxpbmVUbyhiYXNlWCArIG5vcm1hbFggKiBoZWFkV2lkdGggLyAyLCBiYXNlWSArIG5vcm1hbFkgKiBoZWFkV2lkdGggLyAyKTtcblx0XHR0aGlzLmN0eC5saW5lVG8oYmFzZVggLSBub3JtYWxYICogaGVhZFdpZHRoIC8gMiwgYmFzZVkgLSBub3JtYWxZICogaGVhZFdpZHRoIC8gMik7XG5cdFx0dGhpcy5jdHguY2xvc2VQYXRoKCk7XG5cdFx0dGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jdHguc3Ryb2tlU3R5bGU7XG5cdFx0dGhpcy5jdHguZmlsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaFBlbmRpbmdab29tKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLnBlbmRpbmdab29tO1xuXHRcdHRoaXMucGVuZGluZ1pvb20gPSBudWxsO1xuXHRcdGlmICghcGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtaW5TY2FsZSA9IHRoaXMuZ2V0Rml0U2NhbGUoKTtcblx0XHRjb25zdCBtYXhTY2FsZSA9IDg7XG5cdFx0Y29uc3QgZGVzaXJlZFNjYWxlID0gdGhpcy5zY2FsZSAqIHBlbmRpbmcuZmFjdG9yO1xuXHRcdGNvbnN0IG5ld1NjYWxlID0gTWF0aC5tYXgobWluU2NhbGUsIE1hdGgubWluKG1heFNjYWxlLCBkZXNpcmVkU2NhbGUpKTtcblx0XHRpZiAobmV3U2NhbGUgPT09IHRoaXMuc2NhbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQ3Vyc29yLWFuY2hvcmVkIHpvb206IGtlZXAgdGhlIGltYWdlIHBpeGVsIHVuZGVyIHRoZSBjdXJzb3IgdW5kZXIgdGhlXG5cdFx0Ly8gY3Vyc29yIGFmdGVyIHpvb20uIENsYW1wIHRoZSBjdXJzb3IncyBpbWFnZS1zcGFjZSBjb29yZCB0byB0aGUgYWN0dWFsXG5cdFx0Ly8gaW1hZ2UgZXh0ZW50IHNvIGFuIG9mZi1pbWFnZSBjdXJzb3IgKGluIGJyZWF0aGluZy1yb29tIHBhZGRpbmcpIHN0aWxsXG5cdFx0Ly8gcGl2b3RzIG9uIHRoZSBuZWFyZXN0IHJlYWwgaW1hZ2UgcGl4ZWwuXG5cdFx0Y29uc3QgaGFsZkltZ1cgPSAodGhpcy5pbWFnZVdpZHRoICogdGhpcy5zY2FsZSkgLyAyO1xuXHRcdGNvbnN0IGhhbGZJbWdIID0gKHRoaXMuaW1hZ2VIZWlnaHQgKiB0aGlzLnNjYWxlKSAvIDI7XG5cdFx0Y29uc3QgYW5jaG9yQ3ggPSB0aGlzLnBhblggKyBNYXRoLm1heCgtaGFsZkltZ1csIE1hdGgubWluKGhhbGZJbWdXLCBwZW5kaW5nLmN4IC0gdGhpcy5wYW5YKSk7XG5cdFx0Y29uc3QgYW5jaG9yQ3kgPSB0aGlzLnBhblkgKyBNYXRoLm1heCgtaGFsZkltZ0gsIE1hdGgubWluKGhhbGZJbWdILCBwZW5kaW5nLmN5IC0gdGhpcy5wYW5ZKSk7XG5cdFx0Y29uc3QgciA9IG5ld1NjYWxlIC8gdGhpcy5zY2FsZTtcblx0XHR0aGlzLnBhblggPSBhbmNob3JDeCAqICgxIC0gcikgKyB0aGlzLnBhblggKiByO1xuXHRcdHRoaXMucGFuWSA9IGFuY2hvckN5ICogKDEgLSByKSArIHRoaXMucGFuWSAqIHI7XG5cdFx0dGhpcy5zY2FsZSA9IG5ld1NjYWxlO1xuXHRcdHRoaXMuaGFzVXNlclpvb21lZCA9IHRydWU7XG5cdFx0Ly8gRGVsaWJlcmF0ZWx5IGRvIE5PVCBjYWxsIGNsYW1wUGFuKCkgaGVyZS4gV2l0aCByQUYtY29hbGVzY2VkIHdoZWVsIGV2ZW50c1xuXHRcdC8vIGEgc2luZ2xlIGZsdXNoIGNhbiBwcm9kdWNlIGEgbGFyZ2Ugem9vbSBmYWN0b3IgKGUuZy4gdHJhY2twYWQgcGluY2ggZmlyaW5nXG5cdFx0Ly8gMTArIGV2ZW50cyBpbiBvbmUgZnJhbWUgLT4gciB+PSAyLTMpOyB0aGUgY3Vyc29yLWFuY2hvcmVkIHBhbiB0aGF0IG5lZWRzIHRvXG5cdFx0Ly8gYmUgYXBwbGllZCBhdCBsYXJnZSByIGNhbiBleGNlZWQgdGhlIHN0cmljdCBjbGFtcCwgYW5kIGNsYW1waW5nIHRoZW5cblx0XHQvLyBkcmlmdHMgdGhlIGN1cnNvciBhd2F5IGZyb20gdGhlIGFuY2hvciBwaXhlbC4gVGhlIGN1cnNvciBhbmNob3IgaXRzZWxmXG5cdFx0Ly8gZW5zdXJlcyBhdCBsZWFzdCBvbmUgaW1hZ2UgcGl4ZWwgc3RheXMgdmlzaWJsZSAodGhlIG9uZSB1bmRlciB0aGUgY3Vyc29yKSxcblx0XHQvLyBzbyB1bmJvdW5kZWQgem9vbSBwYW4gaXMgc2FmZS5cblx0XHQvLyBXaGVuIHpvb21pbmcgYmFjayBvdXQgdG8gZml0LCBzbmFwIHBhbiB0byBjZW50ZXJlZCBzbyB0aGUgYnJlYXRoaW5nLXJvb21cblx0XHQvLyBsYXlvdXQgbG9va3Mgc3ltbWV0cmljIGluc3RlYWQgb2YgY2Fycnlpbmcgb3ZlciBhbnkgYWNjdW11bGF0ZWQgb2Zmc2V0LlxuXHRcdGlmIChuZXdTY2FsZSA9PT0gbWluU2NhbGUpIHtcblx0XHRcdHRoaXMucGFuWCA9IDA7XG5cdFx0XHR0aGlzLnBhblkgPSAwO1xuXHRcdH1cblx0XHR0aGlzLnNpemVDYW52YXMoKTtcblx0XHR0aGlzLmNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7dGhpcy5wYW5YfXB4LCAke3RoaXMucGFuWX1weClgO1xuXHRcdHRoaXMucmVkcmF3KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEZpdFNjYWxlKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5jYW52YXMucGFyZW50RWxlbWVudDtcblx0XHRpZiAoIWNvbnRhaW5lciB8fCAhdGhpcy5pbWFnZVdpZHRoIHx8ICF0aGlzLmltYWdlSGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0Y29uc3QgbWF4V2lkdGggPSBNYXRoLm1heCgxLCBjb250YWluZXIuY2xpZW50V2lkdGggLSBDQU5WQVNfQlJFQVRISU5HX1JPT00gKiAyKTtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1heCgxLCBjb250YWluZXIuY2xpZW50SGVpZ2h0IC0gQ0FOVkFTX0JSRUFUSElOR19ST09NICogMik7XG5cdFx0cmV0dXJuIE1hdGgubWluKG1heFdpZHRoIC8gdGhpcy5pbWFnZVdpZHRoLCBtYXhIZWlnaHQgLyB0aGlzLmltYWdlSGVpZ2h0LCAxKTtcblx0fVxuXG5cdHByaXZhdGUgY2xhbXBQYW4oKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5jYW52YXMucGFyZW50RWxlbWVudDtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbWdXID0gdGhpcy5pbWFnZVdpZHRoICogdGhpcy5zY2FsZTtcblx0XHRjb25zdCBpbWdIID0gdGhpcy5pbWFnZUhlaWdodCAqIHRoaXMuc2NhbGU7XG5cdFx0Y29uc3QgY1cgPSBjb250YWluZXIuY2xpZW50V2lkdGg7XG5cdFx0Y29uc3QgY0ggPSBjb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXHRcdC8vIE1hbnVhbC1wYW4gY2xhbXA6IGltYWdlIGVkZ2UgY2FuJ3QgdHJhdmVsIHBhc3QgY29udGFpbmVyIGVkZ2UgaW4gZWl0aGVyXG5cdFx0Ly8gZGlyZWN0aW9uLiBXaGVuIGltYWdlIGlzIHNtYWxsZXIgdGhhbiBjb250YWluZXIgKGZpdCAvIHpvb21lZC1vdXQpLCB0aGVcblx0XHQvLyBib3VuZCBzaHJpbmtzIHN5bW1ldHJpY2FsbHkgdG93YXJkIDAgc28gcGFuIGNhbiBzaGlmdCB0aGUgaW1hZ2UgYXJvdW5kXG5cdFx0Ly8gaW5zaWRlIHRoZSBjb250YWluZXIgd2l0aG91dCBzbGlkaW5nIG9mZiBlaXRoZXIgZWRnZS4gV2hlbiB6b29tZWQgaW4sXG5cdFx0Ly8gYWxsb3dzIGZ1bGwgcGFuIHdpdGhpbiB0aGUgem9vbWVkIGNvbnRlbnQuXG5cdFx0Y29uc3QgbWF4UGFuWCA9IE1hdGguYWJzKGNXIC0gaW1nVykgLyAyO1xuXHRcdGNvbnN0IG1heFBhblkgPSBNYXRoLmFicyhjSCAtIGltZ0gpIC8gMjtcblx0XHR0aGlzLnBhblggPSBNYXRoLm1heCgtbWF4UGFuWCwgTWF0aC5taW4obWF4UGFuWCwgdGhpcy5wYW5YKSk7XG5cdFx0dGhpcy5wYW5ZID0gTWF0aC5tYXgoLW1heFBhblksIE1hdGgubWluKG1heFBhblksIHRoaXMucGFuWSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wb3NpdGVUb0RhdGFVcmwoKTogc3RyaW5nIHtcblx0XHQvLyBDcmVhdGUgYSBmaW5hbCBjYW52YXMgYXQgZnVsbCByZXNvbHV0aW9uXG5cdFx0Y29uc3QgZmluYWxDYW52YXMgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdGZpbmFsQ2FudmFzLndpZHRoID0gdGhpcy5pbWFnZVdpZHRoO1xuXHRcdGZpbmFsQ2FudmFzLmhlaWdodCA9IHRoaXMuaW1hZ2VIZWlnaHQ7XG5cdFx0Y29uc3QgY3R4ID0gZmluYWxDYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XG5cblx0XHQvLyBEcmF3IGJhY2tncm91bmQgaW1hZ2Vcblx0XHRpZiAodGhpcy5pbWFnZUVsZW1lbnQpIHtcblx0XHRcdGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZUVsZW1lbnQsIDAsIDAsIHRoaXMuaW1hZ2VXaWR0aCwgdGhpcy5pbWFnZUhlaWdodCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGF5IGFubm90YXRpb25zIGF0IGZ1bGwgcmVzb2x1dGlvbi4gQWN0aW9ucyBhcmUgaW4gb3JpZ2luYWwtaW1hZ2UgY29vcmRzO1xuXHRcdC8vIHRyYW5zbGF0ZSBieSAtY3VycmVudENyb3Agb2Zmc2V0IHNvIHRoZXkgbGFuZCBjb3JyZWN0bHkgb24gdGhlIGNyb3BwZWQgb3V0cHV0LlxuXHRcdGNvbnN0IHNhdmVkU2NhbGUgPSB0aGlzLnNjYWxlO1xuXHRcdHRoaXMuc2NhbGUgPSAxO1xuXHRcdGNvbnN0IHNhdmVkQ3R4ID0gdGhpcy5jdHg7XG5cdFx0dGhpcy5jdHggPSBjdHg7XG5cblx0XHRjb25zdCBvZmZYID0gdGhpcy5jdXJyZW50Q3JvcD8ueCA/PyAwO1xuXHRcdGNvbnN0IG9mZlkgPSB0aGlzLmN1cnJlbnRDcm9wPy55ID8/IDA7XG5cdFx0Y3R4LnNhdmUoKTtcblx0XHRjdHgudHJhbnNsYXRlKC1vZmZYLCAtb2ZmWSk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgdGhpcy5hY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmRyYXdBY3Rpb24oYWN0aW9uKTtcblx0XHR9XG5cdFx0Y3R4LnJlc3RvcmUoKTtcblxuXHRcdHRoaXMuY3R4ID0gc2F2ZWRDdHg7XG5cdFx0dGhpcy5zY2FsZSA9IHNhdmVkU2NhbGU7XG5cblx0XHRyZXR1cm4gZmluYWxDYW52YXMudG9EYXRhVVJMKCdpbWFnZS9wbmcnKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGVuZGluZ1pvb21SYWYpIHtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNhbnZhcykuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5wZW5kaW5nWm9vbVJhZik7XG5cdFx0XHR0aGlzLnBlbmRpbmdab29tUmFmID0gMDtcblx0XHRcdHRoaXMucGVuZGluZ1pvb20gPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLmNhbmNlbFRleHRQbGFjZW1lbnQoKTtcblx0XHR0aGlzLmNsZWFudXBUZXh0RWRpdG9yKCk7XG5cdFx0dGhpcy5jb250YWluZXIucmVtb3ZlKCk7XG5cdFx0dGhpcy50b29sT3B0aW9uc0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFNhdmUuZGlzcG9zZSgpO1xuXHRcdHRo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
