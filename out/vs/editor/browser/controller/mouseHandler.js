import * as dom from "../../../base/browser/dom.js";
import { StandardWheelEvent } from "../../../base/browser/mouseEvent.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as platform from "../../../base/common/platform.js";
import { HitTestContext, MouseTarget, MouseTargetFactory } from "./mouseTarget.js";
import { MouseTargetType } from "../editorBrowser.js";
import { ClientCoordinates, EditorMouseEvent, EditorMouseEventFactory, GlobalEditorPointerMoveMonitor, createEditorPagePosition, createCoordinatesRelativeToEditor } from "../editorDom.js";
import { EditorZoom } from "../../common/config/editorZoom.js";
import { Position } from "../../common/core/position.js";
import { Selection } from "../../common/core/selection.js";
import { ViewEventHandler } from "../../common/viewEventHandler.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { NavigationCommandRevealType } from "../coreCommands.js";
import { MouseWheelClassifier } from "../../../base/browser/ui/scrollbar/scrollableElement.js";
import { TopBottomDragScrolling, LeftRightDragScrolling } from "./dragScrolling.js";
import { TextDirection } from "../../common/model.js";
class MouseHandler extends ViewEventHandler {
  constructor(context, viewController, viewHelper) {
    super();
    this._mouseLeaveMonitor = null;
    this._context = context;
    this.viewController = viewController;
    this.viewHelper = viewHelper;
    this.mouseTargetFactory = new MouseTargetFactory(this._context, viewHelper);
    this._mouseDownOperation = this._register(new MouseDownOperation(
      this._context,
      this.viewController,
      this.viewHelper,
      this.mouseTargetFactory,
      (e, testEventTarget) => this._createMouseTarget(e, testEventTarget),
      (e) => this._getMouseColumn(e)
    ));
    this.lastMouseLeaveTime = -1;
    this._height = this._context.configuration.options.get(EditorOption.layoutInfo).height;
    const mouseEvents = new EditorMouseEventFactory(this.viewHelper.viewDomNode);
    this._register(mouseEvents.onContextMenu(this.viewHelper.viewDomNode, (e) => this._onContextMenu(e, true)));
    this._register(mouseEvents.onMouseMove(this.viewHelper.viewDomNode, (e) => {
      this._onMouseMove(e);
      if (!this._mouseLeaveMonitor) {
        this._mouseLeaveMonitor = dom.addDisposableListener(this.viewHelper.viewDomNode.ownerDocument, "mousemove", (e2) => {
          if (!this.viewHelper.viewDomNode.contains(e2.target)) {
            this._onMouseLeave(new EditorMouseEvent(e2, false, this.viewHelper.viewDomNode));
          }
        });
      }
    }));
    this._register(mouseEvents.onMouseUp(this.viewHelper.viewDomNode, (e) => this._onMouseUp(e)));
    this._register(mouseEvents.onMouseLeave(this.viewHelper.viewDomNode, (e) => this._onMouseLeave(e)));
    let capturePointerId = 0;
    this._register(mouseEvents.onPointerDown(this.viewHelper.viewDomNode, (e, pointerId) => {
      capturePointerId = pointerId;
    }));
    this._register(dom.addDisposableListener(this.viewHelper.viewDomNode, dom.EventType.POINTER_UP, (e) => {
      this._mouseDownOperation.onPointerUp();
    }));
    this._register(mouseEvents.onMouseDown(this.viewHelper.viewDomNode, (e) => this._onMouseDown(e, capturePointerId)));
    this._setupMouseWheelZoomListener();
    this._context.addEventHandler(this);
  }
  _setupMouseWheelZoomListener() {
    const classifier = MouseWheelClassifier.INSTANCE;
    let prevMouseWheelTime = 0;
    let gestureStartZoomLevel = EditorZoom.getZoomLevel();
    let gestureHasZoomModifiers = false;
    let gestureAccumulatedDelta = 0;
    const onMouseWheel = (browserEvent) => {
      this.viewController.emitMouseWheel(browserEvent);
      if (!this._context.configuration.options.get(EditorOption.mouseWheelZoom)) {
        return;
      }
      const e = new StandardWheelEvent(browserEvent);
      classifier.acceptStandardWheelEvent(e);
      if (classifier.isPhysicalMouseWheel()) {
        if (hasMouseWheelZoomModifiers(browserEvent)) {
          const zoomLevel = EditorZoom.getZoomLevel();
          const delta = e.deltaY > 0 ? 1 : -1;
          EditorZoom.setZoomLevel(zoomLevel + delta);
          e.preventDefault();
          e.stopPropagation();
        }
      } else {
        if (Date.now() - prevMouseWheelTime > 50) {
          gestureStartZoomLevel = EditorZoom.getZoomLevel();
          gestureHasZoomModifiers = hasMouseWheelZoomModifiers(browserEvent);
          gestureAccumulatedDelta = 0;
        }
        prevMouseWheelTime = Date.now();
        gestureAccumulatedDelta += e.deltaY;
        if (gestureHasZoomModifiers) {
          EditorZoom.setZoomLevel(gestureStartZoomLevel + gestureAccumulatedDelta / 5);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    this._register(dom.addDisposableListener(this.viewHelper.viewDomNode, dom.EventType.MOUSE_WHEEL, onMouseWheel, { capture: true, passive: false }));
    function hasMouseWheelZoomModifiers(browserEvent) {
      return platform.isMacintosh ? (browserEvent.metaKey || browserEvent.ctrlKey) && !browserEvent.shiftKey && !browserEvent.altKey : browserEvent.ctrlKey && !browserEvent.metaKey && !browserEvent.shiftKey && !browserEvent.altKey;
    }
  }
  dispose() {
    this._context.removeEventHandler(this);
    if (this._mouseLeaveMonitor) {
      this._mouseLeaveMonitor.dispose();
      this._mouseLeaveMonitor = null;
    }
    super.dispose();
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    if (e.hasChanged(EditorOption.layoutInfo)) {
      const height = this._context.configuration.options.get(EditorOption.layoutInfo).height;
      if (this._height !== height) {
        this._height = height;
        this._mouseDownOperation.onHeightChanged();
      }
    }
    return false;
  }
  onCursorStateChanged(e) {
    this._mouseDownOperation.onCursorStateChanged(e);
    return false;
  }
  onFocusChanged(e) {
    return false;
  }
  // --- end event handlers
  getTargetAtClientPoint(clientX, clientY) {
    const clientPos = new ClientCoordinates(clientX, clientY);
    const pos = clientPos.toPageCoordinates(dom.getWindow(this.viewHelper.viewDomNode));
    const editorPos = createEditorPagePosition(this.viewHelper.viewDomNode);
    if (pos.y < editorPos.y || pos.y > editorPos.y + editorPos.height || pos.x < editorPos.x || pos.x > editorPos.x + editorPos.width) {
      return null;
    }
    const relativePos = createCoordinatesRelativeToEditor(this.viewHelper.viewDomNode, editorPos, pos);
    return this.mouseTargetFactory.createMouseTarget(this.viewHelper.getLastRenderData(), editorPos, pos, relativePos, null);
  }
  _createMouseTarget(e, testEventTarget) {
    let target = e.target;
    if (!this.viewHelper.viewDomNode.contains(target)) {
      const shadowRoot = dom.getShadowRoot(this.viewHelper.viewDomNode);
      if (shadowRoot) {
        const potentialTarget = shadowRoot.elementsFromPoint(e.posx, e.posy).find(
          (el) => this.viewHelper.viewDomNode.contains(el)
        ) ?? null;
        target = potentialTarget;
      }
    }
    return this.mouseTargetFactory.createMouseTarget(this.viewHelper.getLastRenderData(), e.editorPos, e.pos, e.relativePos, testEventTarget ? target : null);
  }
  _getMouseColumn(e) {
    return this.mouseTargetFactory.getMouseColumn(e.relativePos);
  }
  _onContextMenu(e, testEventTarget) {
    this.viewController.emitContextMenu({
      event: e,
      target: this._createMouseTarget(e, testEventTarget)
    });
  }
  _onMouseMove(e) {
    const targetIsWidget = this.mouseTargetFactory.mouseTargetIsWidget(e);
    if (!targetIsWidget) {
      e.preventDefault();
    }
    if (this._mouseDownOperation.isActive()) {
      return;
    }
    const actualMouseMoveTime = e.timestamp;
    if (actualMouseMoveTime < this.lastMouseLeaveTime) {
      return;
    }
    this.viewController.emitMouseMove({
      event: e,
      target: this._createMouseTarget(e, true)
    });
  }
  _onMouseLeave(e) {
    if (this._mouseLeaveMonitor) {
      this._mouseLeaveMonitor.dispose();
      this._mouseLeaveMonitor = null;
    }
    this.lastMouseLeaveTime = (/* @__PURE__ */ new Date()).getTime();
    this.viewController.emitMouseLeave({
      event: e,
      target: null
    });
  }
  _onMouseUp(e) {
    this.viewController.emitMouseUp({
      event: e,
      target: this._createMouseTarget(e, true)
    });
  }
  _onMouseDown(e, pointerId) {
    const t = this._createMouseTarget(e, true);
    const targetIsContent = t.type === MouseTargetType.CONTENT_TEXT || t.type === MouseTargetType.CONTENT_EMPTY;
    const targetIsGutter = t.type === MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === MouseTargetType.GUTTER_LINE_NUMBERS || t.type === MouseTargetType.GUTTER_LINE_DECORATIONS;
    const targetIsLineNumbers = t.type === MouseTargetType.GUTTER_LINE_NUMBERS;
    const selectOnLineNumbers = this._context.configuration.options.get(EditorOption.selectOnLineNumbers);
    const targetIsViewZone = t.type === MouseTargetType.CONTENT_VIEW_ZONE || t.type === MouseTargetType.GUTTER_VIEW_ZONE;
    const targetIsWidget = t.type === MouseTargetType.CONTENT_WIDGET;
    let shouldHandle = e.leftButton || e.middleButton;
    if (platform.isMacintosh && e.leftButton && e.ctrlKey) {
      shouldHandle = false;
    }
    const focus = () => {
      e.preventDefault();
      this.viewHelper.focusTextArea();
    };
    if (shouldHandle && (targetIsContent || targetIsLineNumbers && selectOnLineNumbers)) {
      focus();
      this._mouseDownOperation.start(t.type, e, pointerId);
    } else if (targetIsGutter) {
      e.preventDefault();
    } else if (targetIsViewZone) {
      const viewZoneData = t.detail;
      if (shouldHandle && this.viewHelper.shouldSuppressMouseDownOnViewZone(viewZoneData.viewZoneId)) {
        focus();
        this._mouseDownOperation.start(t.type, e, pointerId);
        e.preventDefault();
      }
    } else if (targetIsWidget && this.viewHelper.shouldSuppressMouseDownOnWidget(t.detail)) {
      focus();
      e.preventDefault();
    }
    this.viewController.emitMouseDown({
      event: e,
      target: t
    });
  }
  _onMouseWheel(e) {
    this.viewController.emitMouseWheel(e);
  }
}
class MouseDownOperation extends Disposable {
  constructor(_context, _viewController, _viewHelper, _mouseTargetFactory, createMouseTarget, getMouseColumn) {
    super();
    this._context = _context;
    this._viewController = _viewController;
    this._viewHelper = _viewHelper;
    this._mouseTargetFactory = _mouseTargetFactory;
    this._createMouseTarget = createMouseTarget;
    this._getMouseColumn = getMouseColumn;
    this._mouseMoveMonitor = this._register(new GlobalEditorPointerMoveMonitor(this._viewHelper.viewDomNode));
    this._topBottomDragScrolling = this._register(new TopBottomDragScrolling(
      this._context,
      this._viewHelper,
      this._mouseTargetFactory,
      (position, inSelectionMode, revealType) => this._dispatchMouse(position, inSelectionMode, revealType)
    ));
    this._leftRightDragScrolling = this._register(new LeftRightDragScrolling(
      this._context,
      this._viewHelper,
      this._mouseTargetFactory,
      (position, inSelectionMode, revealType) => this._dispatchMouse(position, inSelectionMode, revealType)
    ));
    this._mouseState = new MouseDownState();
    this._currentSelection = new Selection(1, 1, 1, 1);
    this._isActive = false;
    this._lastMouseEvent = null;
  }
  isActive() {
    return this._isActive;
  }
  _onMouseDownThenMove(e) {
    this._lastMouseEvent = e;
    this._mouseState.setModifiers(e);
    const position = this._findMousePosition(e, false);
    if (!position) {
      return;
    }
    if (this._mouseState.isDragAndDrop) {
      this._viewController.emitMouseDrag({
        event: e,
        target: position
      });
    } else {
      if (position.type === MouseTargetType.OUTSIDE_EDITOR) {
        if (position.outsidePosition === "above" || position.outsidePosition === "below") {
          this._topBottomDragScrolling.start(position, e);
          this._leftRightDragScrolling.stop();
        } else {
          this._leftRightDragScrolling.start(position, e);
          this._topBottomDragScrolling.stop();
        }
      } else {
        this._topBottomDragScrolling.stop();
        this._leftRightDragScrolling.stop();
        this._dispatchMouse(position, true, NavigationCommandRevealType.Minimal);
      }
    }
  }
  start(targetType, e, pointerId) {
    this._lastMouseEvent = e;
    this._mouseState.setStartedOnLineNumbers(targetType === MouseTargetType.GUTTER_LINE_NUMBERS);
    this._mouseState.setStartButtons(e);
    this._mouseState.setModifiers(e);
    const position = this._findMousePosition(e, true);
    if (!position || !position.position) {
      return;
    }
    this._mouseState.trySetCount(e.detail, position.position);
    e.detail = this._mouseState.count;
    const options = this._context.configuration.options;
    if (!options.get(EditorOption.readOnly) && options.get(EditorOption.dragAndDrop) && !options.get(EditorOption.columnSelection) && !this._mouseState.altKey && e.detail < 2 && !this._isActive && !this._currentSelection.isEmpty() && position.type === MouseTargetType.CONTENT_TEXT && position.position && this._currentSelection.containsPosition(position.position)) {
      this._mouseState.isDragAndDrop = true;
      this._isActive = true;
      this._mouseMoveMonitor.startMonitoring(
        this._viewHelper.viewLinesDomNode,
        pointerId,
        e.buttons,
        (e2) => this._onMouseDownThenMove(e2),
        (browserEvent) => {
          const position2 = this._findMousePosition(this._lastMouseEvent, false);
          if (dom.isKeyboardEvent(browserEvent)) {
            this._viewController.emitMouseDropCanceled();
          } else {
            this._viewController.emitMouseDrop({
              event: this._lastMouseEvent,
              target: position2 ? this._createMouseTarget(this._lastMouseEvent, true) : null
              // Ignoring because position is unknown, e.g., Content View Zone
            });
          }
          this._stop();
        }
      );
      return;
    }
    this._mouseState.isDragAndDrop = false;
    this._dispatchMouse(position, e.shiftKey, NavigationCommandRevealType.Minimal);
    if (!this._isActive) {
      this._isActive = true;
      this._mouseMoveMonitor.startMonitoring(
        this._viewHelper.viewLinesDomNode,
        pointerId,
        e.buttons,
        (e2) => this._onMouseDownThenMove(e2),
        () => this._stop()
      );
    }
  }
  _stop() {
    this._isActive = false;
    this._topBottomDragScrolling.stop();
    this._leftRightDragScrolling.stop();
  }
  onHeightChanged() {
    this._mouseMoveMonitor.stopMonitoring();
  }
  onPointerUp() {
    this._mouseMoveMonitor.stopMonitoring();
  }
  onCursorStateChanged(e) {
    this._currentSelection = e.selections[0];
  }
  _getPositionOutsideEditor(e) {
    const editorContent = e.editorPos;
    const model = this._context.viewModel;
    const viewLayout = this._context.viewLayout;
    const mouseColumn = this._getMouseColumn(e);
    if (e.posy < editorContent.y) {
      const outsideDistance = editorContent.y - e.posy;
      const verticalOffset = Math.max(viewLayout.getCurrentScrollTop() - outsideDistance, 0);
      const viewZoneData = HitTestContext.getZoneAtCoord(this._context, verticalOffset);
      if (viewZoneData) {
        const newPosition = this._helpPositionJumpOverViewZone(viewZoneData);
        if (newPosition) {
          return MouseTarget.createOutsideEditor(mouseColumn, newPosition, "above", outsideDistance);
        }
      }
      const aboveLineNumber = viewLayout.getLineNumberAtVerticalOffset(verticalOffset);
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(aboveLineNumber, 1), "above", outsideDistance);
    }
    if (e.posy > editorContent.y + editorContent.height) {
      const outsideDistance = e.posy - editorContent.y - editorContent.height;
      const verticalOffset = viewLayout.getCurrentScrollTop() + e.relativePos.y;
      const viewZoneData = HitTestContext.getZoneAtCoord(this._context, verticalOffset);
      if (viewZoneData) {
        const newPosition = this._helpPositionJumpOverViewZone(viewZoneData);
        if (newPosition) {
          return MouseTarget.createOutsideEditor(mouseColumn, newPosition, "below", outsideDistance);
        }
      }
      const belowLineNumber = viewLayout.getLineNumberAtVerticalOffset(verticalOffset);
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(belowLineNumber, model.getLineMaxColumn(belowLineNumber)), "below", outsideDistance);
    }
    const possibleLineNumber = viewLayout.getLineNumberAtVerticalOffset(viewLayout.getCurrentScrollTop() + e.relativePos.y);
    const layoutInfo = this._context.configuration.options.get(EditorOption.layoutInfo);
    const xLeftBoundary = layoutInfo.contentLeft;
    if (e.relativePos.x <= xLeftBoundary) {
      const outsideDistance = xLeftBoundary - e.relativePos.x;
      const isRtl = model.getTextDirection(possibleLineNumber) === TextDirection.RTL;
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(possibleLineNumber, isRtl ? model.getLineMaxColumn(possibleLineNumber) : 1), "left", outsideDistance);
    }
    const contentRight = layoutInfo.minimap.minimapLeft === 0 ? layoutInfo.width - layoutInfo.verticalScrollbarWidth : layoutInfo.minimap.minimapLeft;
    const xRightBoundary = contentRight;
    if (e.relativePos.x >= xRightBoundary) {
      const outsideDistance = e.relativePos.x - xRightBoundary;
      const isRtl = model.getTextDirection(possibleLineNumber) === TextDirection.RTL;
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(possibleLineNumber, isRtl ? 1 : model.getLineMaxColumn(possibleLineNumber)), "right", outsideDistance);
    }
    return null;
  }
  _findMousePosition(e, testEventTarget) {
    const positionOutsideEditor = this._getPositionOutsideEditor(e);
    if (positionOutsideEditor) {
      return positionOutsideEditor;
    }
    const t = this._createMouseTarget(e, testEventTarget);
    const hintedPosition = t.position;
    if (!hintedPosition) {
      return null;
    }
    if (t.type === MouseTargetType.CONTENT_VIEW_ZONE || t.type === MouseTargetType.GUTTER_VIEW_ZONE) {
      const newPosition = this._helpPositionJumpOverViewZone(t.detail);
      if (newPosition) {
        return MouseTarget.createViewZone(t.type, t.element, t.mouseColumn, newPosition, t.detail);
      }
    }
    return t;
  }
  _helpPositionJumpOverViewZone(viewZoneData) {
    const selectionStart = new Position(this._currentSelection.selectionStartLineNumber, this._currentSelection.selectionStartColumn);
    const positionBefore = viewZoneData.positionBefore;
    const positionAfter = viewZoneData.positionAfter;
    if (positionBefore && positionAfter) {
      if (positionBefore.isBefore(selectionStart)) {
        return positionBefore;
      } else {
        return positionAfter;
      }
    }
    return null;
  }
  _dispatchMouse(position, inSelectionMode, revealType) {
    if (!position.position) {
      return;
    }
    this._viewController.dispatchMouse({
      position: position.position,
      mouseColumn: position.mouseColumn,
      startedOnLineNumbers: this._mouseState.startedOnLineNumbers,
      revealType,
      inSelectionMode,
      mouseDownCount: this._mouseState.count,
      altKey: this._mouseState.altKey,
      ctrlKey: this._mouseState.ctrlKey,
      metaKey: this._mouseState.metaKey,
      shiftKey: this._mouseState.shiftKey,
      leftButton: this._mouseState.leftButton,
      middleButton: this._mouseState.middleButton,
      onInjectedText: position.type === MouseTargetType.CONTENT_TEXT && position.detail.injectedText !== null
    });
  }
}
const _MouseDownState = class _MouseDownState {
  get altKey() {
    return this._altKey;
  }
  get ctrlKey() {
    return this._ctrlKey;
  }
  get metaKey() {
    return this._metaKey;
  }
  get shiftKey() {
    return this._shiftKey;
  }
  get leftButton() {
    return this._leftButton;
  }
  get middleButton() {
    return this._middleButton;
  }
  get startedOnLineNumbers() {
    return this._startedOnLineNumbers;
  }
  constructor() {
    this._altKey = false;
    this._ctrlKey = false;
    this._metaKey = false;
    this._shiftKey = false;
    this._leftButton = false;
    this._middleButton = false;
    this._startedOnLineNumbers = false;
    this._lastMouseDownPosition = null;
    this._lastMouseDownPositionEqualCount = 0;
    this._lastMouseDownCount = 0;
    this._lastSetMouseDownCountTime = 0;
    this.isDragAndDrop = false;
  }
  get count() {
    return this._lastMouseDownCount;
  }
  setModifiers(source) {
    this._altKey = source.altKey;
    this._ctrlKey = source.ctrlKey;
    this._metaKey = source.metaKey;
    this._shiftKey = source.shiftKey;
  }
  setStartButtons(source) {
    this._leftButton = source.leftButton;
    this._middleButton = source.middleButton;
  }
  setStartedOnLineNumbers(startedOnLineNumbers) {
    this._startedOnLineNumbers = startedOnLineNumbers;
  }
  trySetCount(setMouseDownCount, newMouseDownPosition) {
    const currentTime = (/* @__PURE__ */ new Date()).getTime();
    if (currentTime - this._lastSetMouseDownCountTime > _MouseDownState.CLEAR_MOUSE_DOWN_COUNT_TIME) {
      setMouseDownCount = 1;
    }
    this._lastSetMouseDownCountTime = currentTime;
    if (setMouseDownCount > this._lastMouseDownCount + 1) {
      setMouseDownCount = this._lastMouseDownCount + 1;
    }
    if (this._lastMouseDownPosition && this._lastMouseDownPosition.equals(newMouseDownPosition)) {
      this._lastMouseDownPositionEqualCount++;
    } else {
      this._lastMouseDownPositionEqualCount = 1;
    }
    this._lastMouseDownPosition = newMouseDownPosition;
    this._lastMouseDownCount = Math.min(setMouseDownCount, this._lastMouseDownPositionEqualCount);
  }
};
_MouseDownState.CLEAR_MOUSE_DOWN_COUNT_TIME = 400;
let MouseDownState = _MouseDownState;
export {
  MouseHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXG1vdXNlSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkV2hlZWxFdmVudCwgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEhpdFRlc3RDb250ZXh0LCBNb3VzZVRhcmdldCwgTW91c2VUYXJnZXRGYWN0b3J5LCBQb2ludGVySGFuZGxlckxhc3RSZW5kZXJEYXRhIH0gZnJvbSAnLi9tb3VzZVRhcmdldC5qcyc7XG5pbXBvcnQgeyBJTW91c2VUYXJnZXQsIElNb3VzZVRhcmdldFZpZXdab25lRGF0YSwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDbGllbnRDb29yZGluYXRlcywgRWRpdG9yTW91c2VFdmVudCwgRWRpdG9yTW91c2VFdmVudEZhY3RvcnksIEdsb2JhbEVkaXRvclBvaW50ZXJNb3ZlTW9uaXRvciwgY3JlYXRlRWRpdG9yUGFnZVBvc2l0aW9uLCBjcmVhdGVDb29yZGluYXRlc1JlbGF0aXZlVG9FZGl0b3IgfSBmcm9tICcuLi9lZGl0b3JEb20uanMnO1xuaW1wb3J0IHsgVmlld0NvbnRyb2xsZXIgfSBmcm9tICcuLi92aWV3L3ZpZXdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEVkaXRvclpvb20gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvclpvb20uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSG9yaXpvbnRhbFBvc2l0aW9uIH0gZnJvbSAnLi4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IFZpZXdFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld0V2ZW50SGFuZGxlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlIH0gZnJvbSAnLi4vY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1vdXNlV2hlZWxDbGFzc2lmaWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdMaW5lc0dwdSB9IGZyb20gJy4uL3ZpZXdQYXJ0cy92aWV3TGluZXNHcHUvdmlld0xpbmVzR3B1LmpzJztcbmltcG9ydCB7IFRvcEJvdHRvbURyYWdTY3JvbGxpbmcsIExlZnRSaWdodERyYWdTY3JvbGxpbmcgfSBmcm9tICcuL2RyYWdTY3JvbGxpbmcuanMnO1xuaW1wb3J0IHsgVGV4dERpcmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBvaW50ZXJIYW5kbGVySGVscGVyIHtcblx0dmlld0RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRsaW5lc0NvbnRlbnREb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0dmlld0xpbmVzRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHZpZXdMaW5lc0dwdTogVmlld0xpbmVzR3B1IHwgdW5kZWZpbmVkO1xuXG5cdGZvY3VzVGV4dEFyZWEoKTogdm9pZDtcblx0ZGlzcGF0Y2hUZXh0QXJlYUV2ZW50KGV2ZW50OiBDdXN0b21FdmVudCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgbGFzdCByZW5kZXJlZCBpbmZvcm1hdGlvbiBmb3IgY3Vyc29ycyAmIHRleHRhcmVhLlxuXHQgKi9cblx0Z2V0TGFzdFJlbmRlckRhdGEoKTogUG9pbnRlckhhbmRsZXJMYXN0UmVuZGVyRGF0YTtcblxuXHQvKipcblx0ICogUmVuZGVyIHJpZ2h0IG5vd1xuXHQgKi9cblx0cmVuZGVyTm93KCk6IHZvaWQ7XG5cblx0c2hvdWxkU3VwcHJlc3NNb3VzZURvd25PblZpZXdab25lKHZpZXdab25lSWQ6IHN0cmluZyk6IGJvb2xlYW47XG5cdHNob3VsZFN1cHByZXNzTW91c2VEb3duT25XaWRnZXQod2lkZ2V0SWQ6IHN0cmluZyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIERlY29kZSBhIHBvc2l0aW9uIGZyb20gYSByZW5kZXJlZCBkb20gbm9kZVxuXHQgKi9cblx0Z2V0UG9zaXRpb25Gcm9tRE9NSW5mbyhzcGFuTm9kZTogSFRNTEVsZW1lbnQsIG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24gfCBudWxsO1xuXG5cdHZpc2libGVSYW5nZUZvclBvc2l0aW9uKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBIb3Jpem9udGFsUG9zaXRpb24gfCBudWxsO1xuXHRnZXRMaW5lV2lkdGgobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTW91c2VIYW5kbGVyIGV4dGVuZHMgVmlld0V2ZW50SGFuZGxlciB7XG5cblx0cHJvdGVjdGVkIF9jb250ZXh0OiBWaWV3Q29udGV4dDtcblx0cHJvdGVjdGVkIHZpZXdDb250cm9sbGVyOiBWaWV3Q29udHJvbGxlcjtcblx0cHJvdGVjdGVkIHZpZXdIZWxwZXI6IElQb2ludGVySGFuZGxlckhlbHBlcjtcblx0cHJvdGVjdGVkIG1vdXNlVGFyZ2V0RmFjdG9yeTogTW91c2VUYXJnZXRGYWN0b3J5O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21vdXNlRG93bk9wZXJhdGlvbjogTW91c2VEb3duT3BlcmF0aW9uO1xuXHRwcml2YXRlIGxhc3RNb3VzZUxlYXZlVGltZTogbnVtYmVyO1xuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfbW91c2VMZWF2ZU1vbml0b3I6IElEaXNwb3NhYmxlIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQsIHZpZXdDb250cm9sbGVyOiBWaWV3Q29udHJvbGxlciwgdmlld0hlbHBlcjogSVBvaW50ZXJIYW5kbGVySGVscGVyKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMudmlld0NvbnRyb2xsZXIgPSB2aWV3Q29udHJvbGxlcjtcblx0XHR0aGlzLnZpZXdIZWxwZXIgPSB2aWV3SGVscGVyO1xuXHRcdHRoaXMubW91c2VUYXJnZXRGYWN0b3J5ID0gbmV3IE1vdXNlVGFyZ2V0RmFjdG9yeSh0aGlzLl9jb250ZXh0LCB2aWV3SGVscGVyKTtcblxuXHRcdHRoaXMuX21vdXNlRG93bk9wZXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNb3VzZURvd25PcGVyYXRpb24oXG5cdFx0XHR0aGlzLl9jb250ZXh0LFxuXHRcdFx0dGhpcy52aWV3Q29udHJvbGxlcixcblx0XHRcdHRoaXMudmlld0hlbHBlcixcblx0XHRcdHRoaXMubW91c2VUYXJnZXRGYWN0b3J5LFxuXHRcdFx0KGUsIHRlc3RFdmVudFRhcmdldCkgPT4gdGhpcy5fY3JlYXRlTW91c2VUYXJnZXQoZSwgdGVzdEV2ZW50VGFyZ2V0KSxcblx0XHRcdChlKSA9PiB0aGlzLl9nZXRNb3VzZUNvbHVtbihlKVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5sYXN0TW91c2VMZWF2ZVRpbWUgPSAtMTtcblx0XHR0aGlzLl9oZWlnaHQgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pLmhlaWdodDtcblxuXHRcdGNvbnN0IG1vdXNlRXZlbnRzID0gbmV3IEVkaXRvck1vdXNlRXZlbnRGYWN0b3J5KHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb3VzZUV2ZW50cy5vbkNvbnRleHRNZW51KHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSwgKGUpID0+IHRoaXMuX29uQ29udGV4dE1lbnUoZSwgdHJ1ZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vdXNlRXZlbnRzLm9uTW91c2VNb3ZlKHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSwgKGUpID0+IHtcblx0XHRcdHRoaXMuX29uTW91c2VNb3ZlKGUpO1xuXG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzODc4OVxuXHRcdFx0Ly8gV2hlbiBtb3ZpbmcgdGhlIG1vdXNlIHJlYWxseSBxdWlja2x5LCB0aGUgYnJvd3NlciBzb21ldGltZXMgZm9yZ2V0cyB0b1xuXHRcdFx0Ly8gc2VuZCB1cyBhIGBtb3VzZWxlYXZlYCBvciBgbW91c2VvdXRgIGV2ZW50LiBXZSB0aGVyZWZvcmUgaW5zdGFsbCBoZXJlXG5cdFx0XHQvLyBhIGdsb2JhbCBgbW91c2Vtb3ZlYCBsaXN0ZW5lciB0byBtYW51YWxseSByZWNvdmVyIGlmIHRoZSBtb3VzZSBnb2VzIG91dHNpZGVcblx0XHRcdC8vIHRoZSBlZGl0b3IuIEFzIHNvb24gYXMgdGhlIG1vdXNlIGxlYXZlcyBvdXRzaWRlIG9mIHRoZSBlZGl0b3IsIHdlXG5cdFx0XHQvLyByZW1vdmUgdGhpcyBsaXN0ZW5lclxuXG5cdFx0XHRpZiAoIXRoaXMuX21vdXNlTGVhdmVNb25pdG9yKSB7XG5cdFx0XHRcdHRoaXMuX21vdXNlTGVhdmVNb25pdG9yID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUub3duZXJEb2N1bWVudCwgJ21vdXNlbW92ZScsIChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUuY29udGFpbnMoZS50YXJnZXQgYXMgTm9kZSB8IG51bGwpKSB7XG5cdFx0XHRcdFx0XHQvLyB3ZW50IG91dHNpZGUgdGhlIGVkaXRvciFcblx0XHRcdFx0XHRcdHRoaXMuX29uTW91c2VMZWF2ZShuZXcgRWRpdG9yTW91c2VFdmVudChlLCBmYWxzZSwgdGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb3VzZUV2ZW50cy5vbk1vdXNlVXAodGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLCAoZSkgPT4gdGhpcy5fb25Nb3VzZVVwKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihtb3VzZUV2ZW50cy5vbk1vdXNlTGVhdmUodGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLCAoZSkgPT4gdGhpcy5fb25Nb3VzZUxlYXZlKGUpKSk7XG5cblx0XHQvLyBgcG9pbnRlcmRvd25gIGV2ZW50cyBjYW4ndCBiZSB1c2VkIHRvIGRldGVybWluZSBpZiB0aGVyZSdzIGEgZG91YmxlIGNsaWNrLCBvciB0cmlwbGUgY2xpY2tcblx0XHQvLyBiZWNhdXNlIHRoZWlyIGBlLmRldGFpbGAgaXMgYWx3YXlzIDAuXG5cdFx0Ly8gV2Ugd2lsbCB0aGVyZWZvcmUgc2F2ZSB0aGUgcG9pbnRlciBpZCBmb3IgdGhlIG1vdXNlIGFuZCB0aGVuIHJldXNlIGl0IGluIHRoZSBgbW91c2Vkb3duYCBldmVudFxuXHRcdC8vIGZvciBgZWxlbWVudC5zZXRQb2ludGVyQ2FwdHVyZWAuXG5cdFx0bGV0IGNhcHR1cmVQb2ludGVySWQ6IG51bWJlciA9IDA7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW91c2VFdmVudHMub25Qb2ludGVyRG93bih0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUsIChlLCBwb2ludGVySWQpID0+IHtcblx0XHRcdGNhcHR1cmVQb2ludGVySWQgPSBwb2ludGVySWQ7XG5cdFx0fSkpO1xuXHRcdC8vIFRoZSBgcG9pbnRlcnVwYCBsaXN0ZW5lciByZWdpc3RlcmVkIGJ5IGBHbG9iYWxFZGl0b3JQb2ludGVyTW92ZU1vbml0b3JgIGRvZXMgbm90IGdldCBpbnZva2VkIDEwMCUgb2YgdGhlIHRpbWVzLlxuXHRcdC8vIEkgc3BlY3VsYXRlIHRoYXQgdGhpcyBpcyBiZWNhdXNlIHRoZSBgcG9pbnRlcnVwYCBsaXN0ZW5lciBpcyBvbmx5IHJlZ2lzdGVyZWQgZHVyaW5nIHRoZSBgbW91c2Vkb3duYCBldmVudCwgYW5kIHBlcmhhcHNcblx0XHQvLyB0aGUgYHBvaW50ZXJ1cGAgZXZlbnQgaXMgYWxyZWFkeSBxdWV1ZWQgZm9yIGRpc3BhdGNoaW5nLCB3aGljaCBtYWtlcyBpdCB0aGF0IHRoZSBuZXcgbGlzdGVuZXIgZG9lc24ndCBnZXQgZmlyZWQuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDY0ODYgZm9yIHJlcHJvIHN0ZXBzLlxuXHRcdC8vIFRvIGNvbXBlbnNhdGUgZm9yIHRoYXQsIHdlIHNpbXBseSByZWdpc3RlciBoZXJlIGEgYHBvaW50ZXJ1cGAgbGlzdGVuZXIgYW5kIGp1c3QgY29tbXVuaWNhdGUgaXQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUsIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9VUCwgKGU6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fbW91c2VEb3duT3BlcmF0aW9uLm9uUG9pbnRlclVwKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vdXNlRXZlbnRzLm9uTW91c2VEb3duKHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSwgKGUpID0+IHRoaXMuX29uTW91c2VEb3duKGUsIGNhcHR1cmVQb2ludGVySWQpKSk7XG5cdFx0dGhpcy5fc2V0dXBNb3VzZVdoZWVsWm9vbUxpc3RlbmVyKCk7XG5cblx0XHR0aGlzLl9jb250ZXh0LmFkZEV2ZW50SGFuZGxlcih0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwTW91c2VXaGVlbFpvb21MaXN0ZW5lcigpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNsYXNzaWZpZXIgPSBNb3VzZVdoZWVsQ2xhc3NpZmllci5JTlNUQU5DRTtcblxuXHRcdGxldCBwcmV2TW91c2VXaGVlbFRpbWUgPSAwO1xuXHRcdGxldCBnZXN0dXJlU3RhcnRab29tTGV2ZWwgPSBFZGl0b3Jab29tLmdldFpvb21MZXZlbCgpO1xuXHRcdGxldCBnZXN0dXJlSGFzWm9vbU1vZGlmaWVycyA9IGZhbHNlO1xuXHRcdGxldCBnZXN0dXJlQWNjdW11bGF0ZWREZWx0YSA9IDA7XG5cblx0XHRjb25zdCBvbk1vdXNlV2hlZWwgPSAoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdDb250cm9sbGVyLmVtaXRNb3VzZVdoZWVsKGJyb3dzZXJFdmVudCk7XG5cblx0XHRcdGlmICghdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5tb3VzZVdoZWVsWm9vbSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlID0gbmV3IFN0YW5kYXJkV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHRcdFx0Y2xhc3NpZmllci5hY2NlcHRTdGFuZGFyZFdoZWVsRXZlbnQoZSk7XG5cblx0XHRcdGlmIChjbGFzc2lmaWVyLmlzUGh5c2ljYWxNb3VzZVdoZWVsKCkpIHtcblx0XHRcdFx0aWYgKGhhc01vdXNlV2hlZWxab29tTW9kaWZpZXJzKGJyb3dzZXJFdmVudCkpIHtcblx0XHRcdFx0XHRjb25zdCB6b29tTGV2ZWw6IG51bWJlciA9IEVkaXRvclpvb20uZ2V0Wm9vbUxldmVsKCk7XG5cdFx0XHRcdFx0Y29uc3QgZGVsdGEgPSBlLmRlbHRhWSA+IDAgPyAxIDogLTE7XG5cdFx0XHRcdFx0RWRpdG9yWm9vbS5zZXRab29tTGV2ZWwoem9vbUxldmVsICsgZGVsdGEpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB3ZSBjb25zaWRlciBtb3VzZXdoZWVsIGV2ZW50cyB0aGF0IG9jY3VyIHdpdGhpbiA1MG1zIG9mIGVhY2ggb3RoZXIgdG8gYmUgcGFydCBvZiB0aGUgc2FtZSBnZXN0dXJlXG5cdFx0XHRcdC8vIHdlIGRvbid0IHdhbnQgdG8gY29uc2lkZXIgbW91c2Ugd2hlZWwgZXZlbnRzIHdoZXJlIGN0cmwvY21kIGlzIHByZXNzZWQgZHVyaW5nIHRoZSBpbmVydGlhIHBoYXNlXG5cdFx0XHRcdC8vIHdlIGFsc28gd2FudCB0byBhY2N1bXVsYXRlIGRlbHRhWSB2YWx1ZXMgZnJvbSB0aGUgc2FtZSBnZXN0dXJlIGFuZCB1c2UgdGhhdCB0byBzZXQgdGhlIHpvb20gbGV2ZWxcblx0XHRcdFx0aWYgKERhdGUubm93KCkgLSBwcmV2TW91c2VXaGVlbFRpbWUgPiA1MCkge1xuXHRcdFx0XHRcdC8vIHJlc2V0IGlmIG1vcmUgdGhhbiA1MG1zIGhhdmUgcGFzc2VkXG5cdFx0XHRcdFx0Z2VzdHVyZVN0YXJ0Wm9vbUxldmVsID0gRWRpdG9yWm9vbS5nZXRab29tTGV2ZWwoKTtcblx0XHRcdFx0XHRnZXN0dXJlSGFzWm9vbU1vZGlmaWVycyA9IGhhc01vdXNlV2hlZWxab29tTW9kaWZpZXJzKGJyb3dzZXJFdmVudCk7XG5cdFx0XHRcdFx0Z2VzdHVyZUFjY3VtdWxhdGVkRGVsdGEgPSAwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJldk1vdXNlV2hlZWxUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0Z2VzdHVyZUFjY3VtdWxhdGVkRGVsdGEgKz0gZS5kZWx0YVk7XG5cblx0XHRcdFx0aWYgKGdlc3R1cmVIYXNab29tTW9kaWZpZXJzKSB7XG5cdFx0XHRcdFx0RWRpdG9yWm9vbS5zZXRab29tTGV2ZWwoZ2VzdHVyZVN0YXJ0Wm9vbUxldmVsICsgZ2VzdHVyZUFjY3VtdWxhdGVkRGVsdGEgLyA1KTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfV0hFRUwsIG9uTW91c2VXaGVlbCwgeyBjYXB0dXJlOiB0cnVlLCBwYXNzaXZlOiBmYWxzZSB9KSk7XG5cblx0XHRmdW5jdGlvbiBoYXNNb3VzZVdoZWVsWm9vbU1vZGlmaWVycyhicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiAoXG5cdFx0XHRcdHBsYXRmb3JtLmlzTWFjaW50b3NoXG5cdFx0XHRcdFx0Ly8gb24gbWFjT1Mgd2Ugc3VwcG9ydCBjbWQgKyB0d28gZmluZ2VycyBzY3JvbGwgKGBtZXRhS2V5YCBzZXQpXG5cdFx0XHRcdFx0Ly8gYW5kIGFsc28gdGhlIHR3byBmaW5nZXJzIHBpbmNoIGdlc3R1cmUgKGBjdHJLZXlgIHNldClcblx0XHRcdFx0XHQ/ICgoYnJvd3NlckV2ZW50Lm1ldGFLZXkgfHwgYnJvd3NlckV2ZW50LmN0cmxLZXkpICYmICFicm93c2VyRXZlbnQuc2hpZnRLZXkgJiYgIWJyb3dzZXJFdmVudC5hbHRLZXkpXG5cdFx0XHRcdFx0OiAoYnJvd3NlckV2ZW50LmN0cmxLZXkgJiYgIWJyb3dzZXJFdmVudC5tZXRhS2V5ICYmICFicm93c2VyRXZlbnQuc2hpZnRLZXkgJiYgIWJyb3dzZXJFdmVudC5hbHRLZXkpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRleHQucmVtb3ZlRXZlbnRIYW5kbGVyKHRoaXMpO1xuXHRcdGlmICh0aGlzLl9tb3VzZUxlYXZlTW9uaXRvcikge1xuXHRcdFx0dGhpcy5fbW91c2VMZWF2ZU1vbml0b3IuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbW91c2VMZWF2ZU1vbml0b3IgPSBudWxsO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyAtLS0gYmVnaW4gZXZlbnQgaGFuZGxlcnNcblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pKSB7XG5cdFx0XHQvLyBsYXlvdXQgY2hhbmdlXG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pLmhlaWdodDtcblx0XHRcdGlmICh0aGlzLl9oZWlnaHQgIT09IGhlaWdodCkge1xuXHRcdFx0XHR0aGlzLl9oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0XHRcdHRoaXMuX21vdXNlRG93bk9wZXJhdGlvbi5vbkhlaWdodENoYW5nZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkN1cnNvclN0YXRlQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX21vdXNlRG93bk9wZXJhdGlvbi5vbkN1cnNvclN0YXRlQ2hhbmdlZChlKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRm9jdXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0ZvY3VzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdC8vIC0tLSBlbmQgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgZ2V0VGFyZ2V0QXRDbGllbnRQb2ludChjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcik6IElNb3VzZVRhcmdldCB8IG51bGwge1xuXHRcdGNvbnN0IGNsaWVudFBvcyA9IG5ldyBDbGllbnRDb29yZGluYXRlcyhjbGllbnRYLCBjbGllbnRZKTtcblx0XHRjb25zdCBwb3MgPSBjbGllbnRQb3MudG9QYWdlQ29vcmRpbmF0ZXMoZG9tLmdldFdpbmRvdyh0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUpKTtcblx0XHRjb25zdCBlZGl0b3JQb3MgPSBjcmVhdGVFZGl0b3JQYWdlUG9zaXRpb24odGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlKTtcblxuXHRcdGlmIChwb3MueSA8IGVkaXRvclBvcy55IHx8IHBvcy55ID4gZWRpdG9yUG9zLnkgKyBlZGl0b3JQb3MuaGVpZ2h0IHx8IHBvcy54IDwgZWRpdG9yUG9zLnggfHwgcG9zLnggPiBlZGl0b3JQb3MueCArIGVkaXRvclBvcy53aWR0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVsYXRpdmVQb3MgPSBjcmVhdGVDb29yZGluYXRlc1JlbGF0aXZlVG9FZGl0b3IodGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLCBlZGl0b3JQb3MsIHBvcyk7XG5cdFx0cmV0dXJuIHRoaXMubW91c2VUYXJnZXRGYWN0b3J5LmNyZWF0ZU1vdXNlVGFyZ2V0KHRoaXMudmlld0hlbHBlci5nZXRMYXN0UmVuZGVyRGF0YSgpLCBlZGl0b3JQb3MsIHBvcywgcmVsYXRpdmVQb3MsIG51bGwpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVNb3VzZVRhcmdldChlOiBFZGl0b3JNb3VzZUV2ZW50LCB0ZXN0RXZlbnRUYXJnZXQ6IGJvb2xlYW4pOiBJTW91c2VUYXJnZXQge1xuXHRcdGxldCB0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IGUudGFyZ2V0O1xuXHRcdGlmICghdGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLmNvbnRhaW5zKHRhcmdldCkpIHtcblx0XHRcdGNvbnN0IHNoYWRvd1Jvb3QgPSBkb20uZ2V0U2hhZG93Um9vdCh0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUpO1xuXHRcdFx0aWYgKHNoYWRvd1Jvb3QpIHtcblx0XHRcdFx0Y29uc3QgcG90ZW50aWFsVGFyZ2V0ID0gc2hhZG93Um9vdC5lbGVtZW50c0Zyb21Qb2ludChlLnBvc3gsIGUucG9zeSkuZmluZChcblx0XHRcdFx0XHQoZWw6IEVsZW1lbnQpID0+IHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZS5jb250YWlucyhlbClcblx0XHRcdFx0KSA/PyBudWxsO1xuXHRcdFx0XHR0YXJnZXQgPSBwb3RlbnRpYWxUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vdXNlVGFyZ2V0RmFjdG9yeS5jcmVhdGVNb3VzZVRhcmdldCh0aGlzLnZpZXdIZWxwZXIuZ2V0TGFzdFJlbmRlckRhdGEoKSwgZS5lZGl0b3JQb3MsIGUucG9zLCBlLnJlbGF0aXZlUG9zLCB0ZXN0RXZlbnRUYXJnZXQgPyB0YXJnZXQgOiBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vdXNlQ29sdW1uKGU6IEVkaXRvck1vdXNlRXZlbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm1vdXNlVGFyZ2V0RmFjdG9yeS5nZXRNb3VzZUNvbHVtbihlLnJlbGF0aXZlUG9zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25Db250ZXh0TWVudShlOiBFZGl0b3JNb3VzZUV2ZW50LCB0ZXN0RXZlbnRUYXJnZXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdDb250cm9sbGVyLmVtaXRDb250ZXh0TWVudSh7XG5cdFx0XHRldmVudDogZSxcblx0XHRcdHRhcmdldDogdGhpcy5fY3JlYXRlTW91c2VUYXJnZXQoZSwgdGVzdEV2ZW50VGFyZ2V0KVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbk1vdXNlTW92ZShlOiBFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0SXNXaWRnZXQgPSB0aGlzLm1vdXNlVGFyZ2V0RmFjdG9yeS5tb3VzZVRhcmdldElzV2lkZ2V0KGUpO1xuXHRcdGlmICghdGFyZ2V0SXNXaWRnZXQpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbW91c2VEb3duT3BlcmF0aW9uLmlzQWN0aXZlKCkpIHtcblx0XHRcdC8vIEluIHNlbGVjdGlvbi9kcmFnIG9wZXJhdGlvblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3R1YWxNb3VzZU1vdmVUaW1lID0gZS50aW1lc3RhbXA7XG5cdFx0aWYgKGFjdHVhbE1vdXNlTW92ZVRpbWUgPCB0aGlzLmxhc3RNb3VzZUxlYXZlVGltZSkge1xuXHRcdFx0Ly8gRHVlIHRvIHRocm90dGxpbmcsIHRoaXMgZXZlbnQgb2NjdXJyZWQgYmVmb3JlIHRoZSBtb3VzZSBsZWZ0IHRoZSBlZGl0b3IsIHRoZXJlZm9yZSBpZ25vcmUgaXQuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3Q29udHJvbGxlci5lbWl0TW91c2VNb3ZlKHtcblx0XHRcdGV2ZW50OiBlLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLl9jcmVhdGVNb3VzZVRhcmdldChlLCB0cnVlKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbk1vdXNlTGVhdmUoZTogRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tb3VzZUxlYXZlTW9uaXRvcikge1xuXHRcdFx0dGhpcy5fbW91c2VMZWF2ZU1vbml0b3IuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbW91c2VMZWF2ZU1vbml0b3IgPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RNb3VzZUxlYXZlVGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cdFx0dGhpcy52aWV3Q29udHJvbGxlci5lbWl0TW91c2VMZWF2ZSh7XG5cdFx0XHRldmVudDogZSxcblx0XHRcdHRhcmdldDogbnVsbFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbk1vdXNlVXAoZTogRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudmlld0NvbnRyb2xsZXIuZW1pdE1vdXNlVXAoe1xuXHRcdFx0ZXZlbnQ6IGUsXG5cdFx0XHR0YXJnZXQ6IHRoaXMuX2NyZWF0ZU1vdXNlVGFyZ2V0KGUsIHRydWUpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uTW91c2VEb3duKGU6IEVkaXRvck1vdXNlRXZlbnQsIHBvaW50ZXJJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdCA9IHRoaXMuX2NyZWF0ZU1vdXNlVGFyZ2V0KGUsIHRydWUpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0SXNDb250ZW50ID0gKHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCB8fCB0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX0VNUFRZKTtcblx0XHRjb25zdCB0YXJnZXRJc0d1dHRlciA9ICh0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOIHx8IHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX05VTUJFUlMgfHwgdC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfREVDT1JBVElPTlMpO1xuXHRcdGNvbnN0IHRhcmdldElzTGluZU51bWJlcnMgPSAodC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUyk7XG5cdFx0Y29uc3Qgc2VsZWN0T25MaW5lTnVtYmVycyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2VsZWN0T25MaW5lTnVtYmVycyk7XG5cdFx0Y29uc3QgdGFyZ2V0SXNWaWV3Wm9uZSA9ICh0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1ZJRVdfWk9ORSB8fCB0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfVklFV19aT05FKTtcblx0XHRjb25zdCB0YXJnZXRJc1dpZGdldCA9ICh0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1dJREdFVCk7XG5cblx0XHRsZXQgc2hvdWxkSGFuZGxlID0gZS5sZWZ0QnV0dG9uIHx8IGUubWlkZGxlQnV0dG9uO1xuXHRcdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCAmJiBlLmxlZnRCdXR0b24gJiYgZS5jdHJsS2V5KSB7XG5cdFx0XHRzaG91bGRIYW5kbGUgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9ICgpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMudmlld0hlbHBlci5mb2N1c1RleHRBcmVhKCk7XG5cdFx0fTtcblxuXHRcdGlmIChzaG91bGRIYW5kbGUgJiYgKHRhcmdldElzQ29udGVudCB8fCAodGFyZ2V0SXNMaW5lTnVtYmVycyAmJiBzZWxlY3RPbkxpbmVOdW1iZXJzKSkpIHtcblx0XHRcdGZvY3VzKCk7XG5cdFx0XHR0aGlzLl9tb3VzZURvd25PcGVyYXRpb24uc3RhcnQodC50eXBlLCBlLCBwb2ludGVySWQpO1xuXG5cdFx0fSBlbHNlIGlmICh0YXJnZXRJc0d1dHRlcikge1xuXHRcdFx0Ly8gRG8gbm90IHN0ZWFsIGZvY3VzXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fSBlbHNlIGlmICh0YXJnZXRJc1ZpZXdab25lKSB7XG5cdFx0XHRjb25zdCB2aWV3Wm9uZURhdGEgPSB0LmRldGFpbDtcblx0XHRcdGlmIChzaG91bGRIYW5kbGUgJiYgdGhpcy52aWV3SGVscGVyLnNob3VsZFN1cHByZXNzTW91c2VEb3duT25WaWV3Wm9uZSh2aWV3Wm9uZURhdGEudmlld1pvbmVJZCkpIHtcblx0XHRcdFx0Zm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fbW91c2VEb3duT3BlcmF0aW9uLnN0YXJ0KHQudHlwZSwgZSwgcG9pbnRlcklkKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGFyZ2V0SXNXaWRnZXQgJiYgdGhpcy52aWV3SGVscGVyLnNob3VsZFN1cHByZXNzTW91c2VEb3duT25XaWRnZXQodC5kZXRhaWwpKSB7XG5cdFx0XHRmb2N1cygpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld0NvbnRyb2xsZXIuZW1pdE1vdXNlRG93bih7XG5cdFx0XHRldmVudDogZSxcblx0XHRcdHRhcmdldDogdFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbk1vdXNlV2hlZWwoZTogSU1vdXNlV2hlZWxFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudmlld0NvbnRyb2xsZXIuZW1pdE1vdXNlV2hlZWwoZSk7XG5cdH1cbn1cblxuY2xhc3MgTW91c2VEb3duT3BlcmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3JlYXRlTW91c2VUYXJnZXQ6IChlOiBFZGl0b3JNb3VzZUV2ZW50LCB0ZXN0RXZlbnRUYXJnZXQ6IGJvb2xlYW4pID0+IElNb3VzZVRhcmdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2V0TW91c2VDb2x1bW46IChlOiBFZGl0b3JNb3VzZUV2ZW50KSA9PiBudW1iZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW91c2VNb3ZlTW9uaXRvcjogR2xvYmFsRWRpdG9yUG9pbnRlck1vdmVNb25pdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b3BCb3R0b21EcmFnU2Nyb2xsaW5nOiBUb3BCb3R0b21EcmFnU2Nyb2xsaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sZWZ0UmlnaHREcmFnU2Nyb2xsaW5nOiBMZWZ0UmlnaHREcmFnU2Nyb2xsaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb3VzZVN0YXRlOiBNb3VzZURvd25TdGF0ZTtcblxuXHRwcml2YXRlIF9jdXJyZW50U2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHByaXZhdGUgX2lzQWN0aXZlOiBib29sZWFuO1xuXHRwcml2YXRlIF9sYXN0TW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogVmlld0NvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRyb2xsZXI6IFZpZXdDb250cm9sbGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdIZWxwZXI6IElQb2ludGVySGFuZGxlckhlbHBlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb3VzZVRhcmdldEZhY3Rvcnk6IE1vdXNlVGFyZ2V0RmFjdG9yeSxcblx0XHRjcmVhdGVNb3VzZVRhcmdldDogKGU6IEVkaXRvck1vdXNlRXZlbnQsIHRlc3RFdmVudFRhcmdldDogYm9vbGVhbikgPT4gSU1vdXNlVGFyZ2V0LFxuXHRcdGdldE1vdXNlQ29sdW1uOiAoZTogRWRpdG9yTW91c2VFdmVudCkgPT4gbnVtYmVyXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY3JlYXRlTW91c2VUYXJnZXQgPSBjcmVhdGVNb3VzZVRhcmdldDtcblx0XHR0aGlzLl9nZXRNb3VzZUNvbHVtbiA9IGdldE1vdXNlQ29sdW1uO1xuXG5cdFx0dGhpcy5fbW91c2VNb3ZlTW9uaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHbG9iYWxFZGl0b3JQb2ludGVyTW92ZU1vbml0b3IodGhpcy5fdmlld0hlbHBlci52aWV3RG9tTm9kZSkpO1xuXHRcdHRoaXMuX3RvcEJvdHRvbURyYWdTY3JvbGxpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9wQm90dG9tRHJhZ1Njcm9sbGluZyhcblx0XHRcdHRoaXMuX2NvbnRleHQsXG5cdFx0XHR0aGlzLl92aWV3SGVscGVyLFxuXHRcdFx0dGhpcy5fbW91c2VUYXJnZXRGYWN0b3J5LFxuXHRcdFx0KHBvc2l0aW9uLCBpblNlbGVjdGlvbk1vZGUsIHJldmVhbFR5cGUpID0+IHRoaXMuX2Rpc3BhdGNoTW91c2UocG9zaXRpb24sIGluU2VsZWN0aW9uTW9kZSwgcmV2ZWFsVHlwZSlcblx0XHQpKTtcblx0XHR0aGlzLl9sZWZ0UmlnaHREcmFnU2Nyb2xsaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IExlZnRSaWdodERyYWdTY3JvbGxpbmcoXG5cdFx0XHR0aGlzLl9jb250ZXh0LFxuXHRcdFx0dGhpcy5fdmlld0hlbHBlcixcblx0XHRcdHRoaXMuX21vdXNlVGFyZ2V0RmFjdG9yeSxcblx0XHRcdChwb3NpdGlvbiwgaW5TZWxlY3Rpb25Nb2RlLCByZXZlYWxUeXBlKSA9PiB0aGlzLl9kaXNwYXRjaE1vdXNlKHBvc2l0aW9uLCBpblNlbGVjdGlvbk1vZGUsIHJldmVhbFR5cGUpXG5cdFx0KSk7XG5cdFx0dGhpcy5fbW91c2VTdGF0ZSA9IG5ldyBNb3VzZURvd25TdGF0ZSgpO1xuXG5cdFx0dGhpcy5fY3VycmVudFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSk7XG5cdFx0dGhpcy5faXNBY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXN0TW91c2VFdmVudCA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgaXNBY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQWN0aXZlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Nb3VzZURvd25UaGVuTW92ZShlOiBFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdE1vdXNlRXZlbnQgPSBlO1xuXHRcdHRoaXMuX21vdXNlU3RhdGUuc2V0TW9kaWZpZXJzKGUpO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9maW5kTW91c2VQb3NpdGlvbihlLCBmYWxzZSk7XG5cdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0Ly8gSWdub3JpbmcgYmVjYXVzZSBwb3NpdGlvbiBpcyB1bmtub3duXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21vdXNlU3RhdGUuaXNEcmFnQW5kRHJvcCkge1xuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdE1vdXNlRHJhZyh7XG5cdFx0XHRcdGV2ZW50OiBlLFxuXHRcdFx0XHR0YXJnZXQ6IHBvc2l0aW9uXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHBvc2l0aW9uLnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5PVVRTSURFX0VESVRPUikge1xuXHRcdFx0XHRpZiAocG9zaXRpb24ub3V0c2lkZVBvc2l0aW9uID09PSAnYWJvdmUnIHx8IHBvc2l0aW9uLm91dHNpZGVQb3NpdGlvbiA9PT0gJ2JlbG93Jykge1xuXHRcdFx0XHRcdHRoaXMuX3RvcEJvdHRvbURyYWdTY3JvbGxpbmcuc3RhcnQocG9zaXRpb24sIGUpO1xuXHRcdFx0XHRcdHRoaXMuX2xlZnRSaWdodERyYWdTY3JvbGxpbmcuc3RvcCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xlZnRSaWdodERyYWdTY3JvbGxpbmcuc3RhcnQocG9zaXRpb24sIGUpO1xuXHRcdFx0XHRcdHRoaXMuX3RvcEJvdHRvbURyYWdTY3JvbGxpbmcuc3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90b3BCb3R0b21EcmFnU2Nyb2xsaW5nLnN0b3AoKTtcblx0XHRcdFx0dGhpcy5fbGVmdFJpZ2h0RHJhZ1Njcm9sbGluZy5zdG9wKCk7XG5cdFx0XHRcdHRoaXMuX2Rpc3BhdGNoTW91c2UocG9zaXRpb24sIHRydWUsIE5hdmlnYXRpb25Db21tYW5kUmV2ZWFsVHlwZS5NaW5pbWFsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RhcnQodGFyZ2V0VHlwZTogTW91c2VUYXJnZXRUeXBlLCBlOiBFZGl0b3JNb3VzZUV2ZW50LCBwb2ludGVySWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RNb3VzZUV2ZW50ID0gZTtcblxuXHRcdHRoaXMuX21vdXNlU3RhdGUuc2V0U3RhcnRlZE9uTGluZU51bWJlcnModGFyZ2V0VHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX05VTUJFUlMpO1xuXHRcdHRoaXMuX21vdXNlU3RhdGUuc2V0U3RhcnRCdXR0b25zKGUpO1xuXHRcdHRoaXMuX21vdXNlU3RhdGUuc2V0TW9kaWZpZXJzKGUpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZmluZE1vdXNlUG9zaXRpb24oZSwgdHJ1ZSk7XG5cdFx0aWYgKCFwb3NpdGlvbiB8fCAhcG9zaXRpb24ucG9zaXRpb24pIHtcblx0XHRcdC8vIElnbm9yaW5nIGJlY2F1c2UgcG9zaXRpb24gaXMgdW5rbm93blxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21vdXNlU3RhdGUudHJ5U2V0Q291bnQoZS5kZXRhaWwsIHBvc2l0aW9uLnBvc2l0aW9uKTtcblxuXHRcdC8vIE92ZXJ3cml0ZSB0aGUgZGV0YWlsIG9mIHRoZSBNb3VzZUV2ZW50LCBhcyBpdCB3aWxsIGJlIHNlbnQgb3V0IGluIGFuIGV2ZW50IGFuZCBjb250cmlidXRpb25zIG1pZ2h0IHJlbHkgb24gaXQuXG5cdFx0ZS5kZXRhaWwgPSB0aGlzLl9tb3VzZVN0YXRlLmNvdW50O1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXG5cdFx0aWYgKCFvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVhZE9ubHkpXG5cdFx0XHQmJiBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZHJhZ0FuZERyb3ApXG5cdFx0XHQmJiAhb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmNvbHVtblNlbGVjdGlvbilcblx0XHRcdCYmICF0aGlzLl9tb3VzZVN0YXRlLmFsdEtleSAvLyB3ZSBkb24ndCBzdXBwb3J0IG11bHRpcGxlIG1vdXNlXG5cdFx0XHQmJiBlLmRldGFpbCA8IDIgLy8gb25seSBzaW5nbGUgY2xpY2sgb24gYSBzZWxlY3Rpb24gY2FuIHdvcmtcblx0XHRcdCYmICF0aGlzLl9pc0FjdGl2ZSAvLyB0aGUgbW91c2UgaXMgbm90IGRvd24geWV0XG5cdFx0XHQmJiAhdGhpcy5fY3VycmVudFNlbGVjdGlvbi5pc0VtcHR5KCkgLy8gd2UgZG9uJ3QgZHJhZyBzaW5nbGUgY3Vyc29yXG5cdFx0XHQmJiAocG9zaXRpb24udHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCkgLy8gc2luZ2xlIGNsaWNrIG9uIHRleHRcblx0XHRcdCYmIHBvc2l0aW9uLnBvc2l0aW9uICYmIHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24uY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbi5wb3NpdGlvbikgLy8gc2luZ2xlIGNsaWNrIG9uIGEgc2VsZWN0aW9uXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9tb3VzZVN0YXRlLmlzRHJhZ0FuZERyb3AgPSB0cnVlO1xuXHRcdFx0dGhpcy5faXNBY3RpdmUgPSB0cnVlO1xuXG5cdFx0XHR0aGlzLl9tb3VzZU1vdmVNb25pdG9yLnN0YXJ0TW9uaXRvcmluZyhcblx0XHRcdFx0dGhpcy5fdmlld0hlbHBlci52aWV3TGluZXNEb21Ob2RlLFxuXHRcdFx0XHRwb2ludGVySWQsXG5cdFx0XHRcdGUuYnV0dG9ucyxcblx0XHRcdFx0KGUpID0+IHRoaXMuX29uTW91c2VEb3duVGhlbk1vdmUoZSksXG5cdFx0XHRcdChicm93c2VyRXZlbnQ/OiBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZmluZE1vdXNlUG9zaXRpb24odGhpcy5fbGFzdE1vdXNlRXZlbnQhLCBmYWxzZSk7XG5cblx0XHRcdFx0XHRpZiAoZG9tLmlzS2V5Ym9hcmRFdmVudChicm93c2VyRXZlbnQpKSB7XG5cdFx0XHRcdFx0XHQvLyBjYW5jZWxcblx0XHRcdFx0XHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyLmVtaXRNb3VzZURyb3BDYW5jZWxlZCgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5lbWl0TW91c2VEcm9wKHtcblx0XHRcdFx0XHRcdFx0ZXZlbnQ6IHRoaXMuX2xhc3RNb3VzZUV2ZW50ISxcblx0XHRcdFx0XHRcdFx0dGFyZ2V0OiAocG9zaXRpb24gPyB0aGlzLl9jcmVhdGVNb3VzZVRhcmdldCh0aGlzLl9sYXN0TW91c2VFdmVudCEsIHRydWUpIDogbnVsbCkgLy8gSWdub3JpbmcgYmVjYXVzZSBwb3NpdGlvbiBpcyB1bmtub3duLCBlLmcuLCBDb250ZW50IFZpZXcgWm9uZVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fc3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW91c2VTdGF0ZS5pc0RyYWdBbmREcm9wID0gZmFsc2U7XG5cdFx0dGhpcy5fZGlzcGF0Y2hNb3VzZShwb3NpdGlvbiwgZS5zaGlmdEtleSwgTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlLk1pbmltYWwpO1xuXG5cdFx0aWYgKCF0aGlzLl9pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5faXNBY3RpdmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fbW91c2VNb3ZlTW9uaXRvci5zdGFydE1vbml0b3JpbmcoXG5cdFx0XHRcdHRoaXMuX3ZpZXdIZWxwZXIudmlld0xpbmVzRG9tTm9kZSxcblx0XHRcdFx0cG9pbnRlcklkLFxuXHRcdFx0XHRlLmJ1dHRvbnMsXG5cdFx0XHRcdChlKSA9PiB0aGlzLl9vbk1vdXNlRG93blRoZW5Nb3ZlKGUpLFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9zdG9wKClcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3RvcEJvdHRvbURyYWdTY3JvbGxpbmcuc3RvcCgpO1xuXHRcdHRoaXMuX2xlZnRSaWdodERyYWdTY3JvbGxpbmcuc3RvcCgpO1xuXHR9XG5cblx0cHVibGljIG9uSGVpZ2h0Q2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb3VzZU1vdmVNb25pdG9yLnN0b3BNb25pdG9yaW5nKCk7XG5cdH1cblxuXHRwdWJsaWMgb25Qb2ludGVyVXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW91c2VNb3ZlTW9uaXRvci5zdG9wTW9uaXRvcmluZygpO1xuXHR9XG5cblx0cHVibGljIG9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudFNlbGVjdGlvbiA9IGUuc2VsZWN0aW9uc1swXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFBvc2l0aW9uT3V0c2lkZUVkaXRvcihlOiBFZGl0b3JNb3VzZUV2ZW50KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGVudCA9IGUuZWRpdG9yUG9zO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWw7XG5cdFx0Y29uc3Qgdmlld0xheW91dCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dDtcblxuXHRcdGNvbnN0IG1vdXNlQ29sdW1uID0gdGhpcy5fZ2V0TW91c2VDb2x1bW4oZSk7XG5cblx0XHRpZiAoZS5wb3N5IDwgZWRpdG9yQ29udGVudC55KSB7XG5cdFx0XHRjb25zdCBvdXRzaWRlRGlzdGFuY2UgPSBlZGl0b3JDb250ZW50LnkgLSBlLnBvc3k7XG5cdFx0XHRjb25zdCB2ZXJ0aWNhbE9mZnNldCA9IE1hdGgubWF4KHZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpIC0gb3V0c2lkZURpc3RhbmNlLCAwKTtcblx0XHRcdGNvbnN0IHZpZXdab25lRGF0YSA9IEhpdFRlc3RDb250ZXh0LmdldFpvbmVBdENvb3JkKHRoaXMuX2NvbnRleHQsIHZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdGlmICh2aWV3Wm9uZURhdGEpIHtcblx0XHRcdFx0Y29uc3QgbmV3UG9zaXRpb24gPSB0aGlzLl9oZWxwUG9zaXRpb25KdW1wT3ZlclZpZXdab25lKHZpZXdab25lRGF0YSk7XG5cdFx0XHRcdGlmIChuZXdQb3NpdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uLCBuZXdQb3NpdGlvbiwgJ2Fib3ZlJywgb3V0c2lkZURpc3RhbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhYm92ZUxpbmVOdW1iZXIgPSB2aWV3TGF5b3V0LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uLCBuZXcgUG9zaXRpb24oYWJvdmVMaW5lTnVtYmVyLCAxKSwgJ2Fib3ZlJywgb3V0c2lkZURpc3RhbmNlKTtcblx0XHR9XG5cblx0XHRpZiAoZS5wb3N5ID4gZWRpdG9yQ29udGVudC55ICsgZWRpdG9yQ29udGVudC5oZWlnaHQpIHtcblx0XHRcdGNvbnN0IG91dHNpZGVEaXN0YW5jZSA9IGUucG9zeSAtIGVkaXRvckNvbnRlbnQueSAtIGVkaXRvckNvbnRlbnQuaGVpZ2h0O1xuXHRcdFx0Y29uc3QgdmVydGljYWxPZmZzZXQgPSB2aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSArIGUucmVsYXRpdmVQb3MueTtcblx0XHRcdGNvbnN0IHZpZXdab25lRGF0YSA9IEhpdFRlc3RDb250ZXh0LmdldFpvbmVBdENvb3JkKHRoaXMuX2NvbnRleHQsIHZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdGlmICh2aWV3Wm9uZURhdGEpIHtcblx0XHRcdFx0Y29uc3QgbmV3UG9zaXRpb24gPSB0aGlzLl9oZWxwUG9zaXRpb25KdW1wT3ZlclZpZXdab25lKHZpZXdab25lRGF0YSk7XG5cdFx0XHRcdGlmIChuZXdQb3NpdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uLCBuZXdQb3NpdGlvbiwgJ2JlbG93Jywgb3V0c2lkZURpc3RhbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBiZWxvd0xpbmVOdW1iZXIgPSB2aWV3TGF5b3V0LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uLCBuZXcgUG9zaXRpb24oYmVsb3dMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGJlbG93TGluZU51bWJlcikpLCAnYmVsb3cnLCBvdXRzaWRlRGlzdGFuY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc3NpYmxlTGluZU51bWJlciA9IHZpZXdMYXlvdXQuZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQodmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgKyBlLnJlbGF0aXZlUG9zLnkpO1xuXG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cblx0XHRjb25zdCB4TGVmdEJvdW5kYXJ5ID0gbGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHRpZiAoZS5yZWxhdGl2ZVBvcy54IDw9IHhMZWZ0Qm91bmRhcnkpIHtcblx0XHRcdGNvbnN0IG91dHNpZGVEaXN0YW5jZSA9IHhMZWZ0Qm91bmRhcnkgLSBlLnJlbGF0aXZlUG9zLng7XG5cdFx0XHRjb25zdCBpc1J0bCA9IG1vZGVsLmdldFRleHREaXJlY3Rpb24ocG9zc2libGVMaW5lTnVtYmVyKSA9PT0gVGV4dERpcmVjdGlvbi5SVEw7XG5cdFx0XHRyZXR1cm4gTW91c2VUYXJnZXQuY3JlYXRlT3V0c2lkZUVkaXRvcihtb3VzZUNvbHVtbiwgbmV3IFBvc2l0aW9uKHBvc3NpYmxlTGluZU51bWJlciwgaXNSdGwgPyBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc3NpYmxlTGluZU51bWJlcikgOiAxKSwgJ2xlZnQnLCBvdXRzaWRlRGlzdGFuY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRSaWdodCA9IChcblx0XHRcdGxheW91dEluZm8ubWluaW1hcC5taW5pbWFwTGVmdCA9PT0gMFxuXHRcdFx0XHQ/IGxheW91dEluZm8ud2lkdGggLSBsYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLy8gSGFwcGVucyB3aGVuIG1pbmltYXAgaXMgaGlkZGVuXG5cdFx0XHRcdDogbGF5b3V0SW5mby5taW5pbWFwLm1pbmltYXBMZWZ0XG5cdFx0KTtcblx0XHRjb25zdCB4UmlnaHRCb3VuZGFyeSA9IGNvbnRlbnRSaWdodDtcblx0XHRpZiAoZS5yZWxhdGl2ZVBvcy54ID49IHhSaWdodEJvdW5kYXJ5KSB7XG5cdFx0XHRjb25zdCBvdXRzaWRlRGlzdGFuY2UgPSBlLnJlbGF0aXZlUG9zLnggLSB4UmlnaHRCb3VuZGFyeTtcblx0XHRcdGNvbnN0IGlzUnRsID0gbW9kZWwuZ2V0VGV4dERpcmVjdGlvbihwb3NzaWJsZUxpbmVOdW1iZXIpID09PSBUZXh0RGlyZWN0aW9uLlJUTDtcblx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uLCBuZXcgUG9zaXRpb24ocG9zc2libGVMaW5lTnVtYmVyLCBpc1J0bCA/IDEgOiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc3NpYmxlTGluZU51bWJlcikpLCAncmlnaHQnLCBvdXRzaWRlRGlzdGFuY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1vdXNlUG9zaXRpb24oZTogRWRpdG9yTW91c2VFdmVudCwgdGVzdEV2ZW50VGFyZ2V0OiBib29sZWFuKTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Y29uc3QgcG9zaXRpb25PdXRzaWRlRWRpdG9yID0gdGhpcy5fZ2V0UG9zaXRpb25PdXRzaWRlRWRpdG9yKGUpO1xuXHRcdGlmIChwb3NpdGlvbk91dHNpZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybiBwb3NpdGlvbk91dHNpZGVFZGl0b3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdCA9IHRoaXMuX2NyZWF0ZU1vdXNlVGFyZ2V0KGUsIHRlc3RFdmVudFRhcmdldCk7XG5cdFx0Y29uc3QgaGludGVkUG9zaXRpb24gPSB0LnBvc2l0aW9uO1xuXHRcdGlmICghaGludGVkUG9zaXRpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1ZJRVdfWk9ORSB8fCB0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfVklFV19aT05FKSB7XG5cdFx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IHRoaXMuX2hlbHBQb3NpdGlvbkp1bXBPdmVyVmlld1pvbmUodC5kZXRhaWwpO1xuXHRcdFx0aWYgKG5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVWaWV3Wm9uZSh0LnR5cGUsIHQuZWxlbWVudCwgdC5tb3VzZUNvbHVtbiwgbmV3UG9zaXRpb24sIHQuZGV0YWlsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdDtcblx0fVxuXG5cdHByaXZhdGUgX2hlbHBQb3NpdGlvbkp1bXBPdmVyVmlld1pvbmUodmlld1pvbmVEYXRhOiBJTW91c2VUYXJnZXRWaWV3Wm9uZURhdGEpOiBQb3NpdGlvbiB8IG51bGwge1xuXHRcdC8vIEZvcmNlIHBvc2l0aW9uIG9uIHZpZXcgem9uZXMgdG8gZ28gYWJvdmUgb3IgYmVsb3cgZGVwZW5kaW5nIG9uIHdoZXJlIHNlbGVjdGlvbiBzdGFydGVkIGZyb21cblx0XHRjb25zdCBzZWxlY3Rpb25TdGFydCA9IG5ldyBQb3NpdGlvbih0aGlzLl9jdXJyZW50U2VsZWN0aW9uLnNlbGVjdGlvblN0YXJ0TGluZU51bWJlciwgdGhpcy5fY3VycmVudFNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydENvbHVtbik7XG5cdFx0Y29uc3QgcG9zaXRpb25CZWZvcmUgPSB2aWV3Wm9uZURhdGEucG9zaXRpb25CZWZvcmU7XG5cdFx0Y29uc3QgcG9zaXRpb25BZnRlciA9IHZpZXdab25lRGF0YS5wb3NpdGlvbkFmdGVyO1xuXG5cdFx0aWYgKHBvc2l0aW9uQmVmb3JlICYmIHBvc2l0aW9uQWZ0ZXIpIHtcblx0XHRcdGlmIChwb3NpdGlvbkJlZm9yZS5pc0JlZm9yZShzZWxlY3Rpb25TdGFydCkpIHtcblx0XHRcdFx0cmV0dXJuIHBvc2l0aW9uQmVmb3JlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHBvc2l0aW9uQWZ0ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcGF0Y2hNb3VzZShwb3NpdGlvbjogSU1vdXNlVGFyZ2V0LCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIHJldmVhbFR5cGU6IE5hdmlnYXRpb25Db21tYW5kUmV2ZWFsVHlwZSk6IHZvaWQge1xuXHRcdGlmICghcG9zaXRpb24ucG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZGlzcGF0Y2hNb3VzZSh7XG5cdFx0XHRwb3NpdGlvbjogcG9zaXRpb24ucG9zaXRpb24sXG5cdFx0XHRtb3VzZUNvbHVtbjogcG9zaXRpb24ubW91c2VDb2x1bW4sXG5cdFx0XHRzdGFydGVkT25MaW5lTnVtYmVyczogdGhpcy5fbW91c2VTdGF0ZS5zdGFydGVkT25MaW5lTnVtYmVycyxcblx0XHRcdHJldmVhbFR5cGUsXG5cblx0XHRcdGluU2VsZWN0aW9uTW9kZTogaW5TZWxlY3Rpb25Nb2RlLFxuXHRcdFx0bW91c2VEb3duQ291bnQ6IHRoaXMuX21vdXNlU3RhdGUuY291bnQsXG5cdFx0XHRhbHRLZXk6IHRoaXMuX21vdXNlU3RhdGUuYWx0S2V5LFxuXHRcdFx0Y3RybEtleTogdGhpcy5fbW91c2VTdGF0ZS5jdHJsS2V5LFxuXHRcdFx0bWV0YUtleTogdGhpcy5fbW91c2VTdGF0ZS5tZXRhS2V5LFxuXHRcdFx0c2hpZnRLZXk6IHRoaXMuX21vdXNlU3RhdGUuc2hpZnRLZXksXG5cblx0XHRcdGxlZnRCdXR0b246IHRoaXMuX21vdXNlU3RhdGUubGVmdEJ1dHRvbixcblx0XHRcdG1pZGRsZUJ1dHRvbjogdGhpcy5fbW91c2VTdGF0ZS5taWRkbGVCdXR0b24sXG5cblx0XHRcdG9uSW5qZWN0ZWRUZXh0OiBwb3NpdGlvbi50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUICYmIHBvc2l0aW9uLmRldGFpbC5pbmplY3RlZFRleHQgIT09IG51bGxcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBNb3VzZURvd25TdGF0ZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0xFQVJfTU9VU0VfRE9XTl9DT1VOVF9USU1FID0gNDAwOyAvLyBtc1xuXG5cdHByaXZhdGUgX2FsdEtleTogYm9vbGVhbjtcblx0cHVibGljIGdldCBhbHRLZXkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9hbHRLZXk7IH1cblxuXHRwcml2YXRlIF9jdHJsS2V5OiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IGN0cmxLZXkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9jdHJsS2V5OyB9XG5cblx0cHJpdmF0ZSBfbWV0YUtleTogYm9vbGVhbjtcblx0cHVibGljIGdldCBtZXRhS2V5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fbWV0YUtleTsgfVxuXG5cdHByaXZhdGUgX3NoaWZ0S2V5OiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IHNoaWZ0S2V5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc2hpZnRLZXk7IH1cblxuXHRwcml2YXRlIF9sZWZ0QnV0dG9uOiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IGxlZnRCdXR0b24oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9sZWZ0QnV0dG9uOyB9XG5cblx0cHJpdmF0ZSBfbWlkZGxlQnV0dG9uOiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IG1pZGRsZUJ1dHRvbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX21pZGRsZUJ1dHRvbjsgfVxuXG5cdHByaXZhdGUgX3N0YXJ0ZWRPbkxpbmVOdW1iZXJzOiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IHN0YXJ0ZWRPbkxpbmVOdW1iZXJzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3RhcnRlZE9uTGluZU51bWJlcnM7IH1cblxuXHRwcml2YXRlIF9sYXN0TW91c2VEb3duUG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbDtcblx0cHJpdmF0ZSBfbGFzdE1vdXNlRG93blBvc2l0aW9uRXF1YWxDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIF9sYXN0TW91c2VEb3duQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfbGFzdFNldE1vdXNlRG93bkNvdW50VGltZTogbnVtYmVyO1xuXHRwdWJsaWMgaXNEcmFnQW5kRHJvcDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9hbHRLZXkgPSBmYWxzZTtcblx0XHR0aGlzLl9jdHJsS2V5ID0gZmFsc2U7XG5cdFx0dGhpcy5fbWV0YUtleSA9IGZhbHNlO1xuXHRcdHRoaXMuX3NoaWZ0S2V5ID0gZmFsc2U7XG5cdFx0dGhpcy5fbGVmdEJ1dHRvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX21pZGRsZUJ1dHRvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX3N0YXJ0ZWRPbkxpbmVOdW1iZXJzID0gZmFsc2U7XG5cdFx0dGhpcy5fbGFzdE1vdXNlRG93blBvc2l0aW9uID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0TW91c2VEb3duUG9zaXRpb25FcXVhbENvdW50ID0gMDtcblx0XHR0aGlzLl9sYXN0TW91c2VEb3duQ291bnQgPSAwO1xuXHRcdHRoaXMuX2xhc3RTZXRNb3VzZURvd25Db3VudFRpbWUgPSAwO1xuXHRcdHRoaXMuaXNEcmFnQW5kRHJvcCA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0TW91c2VEb3duQ291bnQ7XG5cdH1cblxuXHRwdWJsaWMgc2V0TW9kaWZpZXJzKHNvdXJjZTogRWRpdG9yTW91c2VFdmVudCkge1xuXHRcdHRoaXMuX2FsdEtleSA9IHNvdXJjZS5hbHRLZXk7XG5cdFx0dGhpcy5fY3RybEtleSA9IHNvdXJjZS5jdHJsS2V5O1xuXHRcdHRoaXMuX21ldGFLZXkgPSBzb3VyY2UubWV0YUtleTtcblx0XHR0aGlzLl9zaGlmdEtleSA9IHNvdXJjZS5zaGlmdEtleTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTdGFydEJ1dHRvbnMoc291cmNlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG5cdFx0dGhpcy5fbGVmdEJ1dHRvbiA9IHNvdXJjZS5sZWZ0QnV0dG9uO1xuXHRcdHRoaXMuX21pZGRsZUJ1dHRvbiA9IHNvdXJjZS5taWRkbGVCdXR0b247XG5cdH1cblxuXHRwdWJsaWMgc2V0U3RhcnRlZE9uTGluZU51bWJlcnMoc3RhcnRlZE9uTGluZU51bWJlcnM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFydGVkT25MaW5lTnVtYmVycyA9IHN0YXJ0ZWRPbkxpbmVOdW1iZXJzO1xuXHR9XG5cblx0cHVibGljIHRyeVNldENvdW50KHNldE1vdXNlRG93bkNvdW50OiBudW1iZXIsIG5ld01vdXNlRG93blBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdC8vIGEuIEludmFsaWRhdGUgbXVsdGlwbGUgY2xpY2tpbmcgaWYgdG9vIG11Y2ggdGltZSBoYXMgcGFzc2VkICh3aWxsIGJlIGhpdCBieSBJRSBiZWNhdXNlIHRoZSBkZXRhaWwgZmllbGQgb2YgbW91c2UgZXZlbnRzIGNvbnRhaW5zIGdhcmJhZ2UgaW4gSUUxMClcblx0XHRjb25zdCBjdXJyZW50VGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cdFx0aWYgKGN1cnJlbnRUaW1lIC0gdGhpcy5fbGFzdFNldE1vdXNlRG93bkNvdW50VGltZSA+IE1vdXNlRG93blN0YXRlLkNMRUFSX01PVVNFX0RPV05fQ09VTlRfVElNRSkge1xuXHRcdFx0c2V0TW91c2VEb3duQ291bnQgPSAxO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0U2V0TW91c2VEb3duQ291bnRUaW1lID0gY3VycmVudFRpbWU7XG5cblx0XHQvLyBiLiBFbnN1cmUgdGhhdCB3ZSBkb24ndCBqdW1wIGZyb20gc2luZ2xlIGNsaWNrIHRvIHRyaXBsZSBjbGljayBpbiBvbmUgZ28gKHdpbGwgYmUgaGl0IGJ5IElFIGJlY2F1c2UgdGhlIGRldGFpbCBmaWVsZCBvZiBtb3VzZSBldmVudHMgY29udGFpbnMgZ2FyYmFnZSBpbiBJRTEwKVxuXHRcdGlmIChzZXRNb3VzZURvd25Db3VudCA+IHRoaXMuX2xhc3RNb3VzZURvd25Db3VudCArIDEpIHtcblx0XHRcdHNldE1vdXNlRG93bkNvdW50ID0gdGhpcy5fbGFzdE1vdXNlRG93bkNvdW50ICsgMTtcblx0XHR9XG5cblx0XHQvLyBjLiBJbnZhbGlkYXRlIG11bHRpcGxlIGNsaWNraW5nIGlmIHRoZSBsb2dpY2FsIHBvc2l0aW9uIGlzIGRpZmZlcmVudFxuXHRcdGlmICh0aGlzLl9sYXN0TW91c2VEb3duUG9zaXRpb24gJiYgdGhpcy5fbGFzdE1vdXNlRG93blBvc2l0aW9uLmVxdWFscyhuZXdNb3VzZURvd25Qb3NpdGlvbikpIHtcblx0XHRcdHRoaXMuX2xhc3RNb3VzZURvd25Qb3NpdGlvbkVxdWFsQ291bnQrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGFzdE1vdXNlRG93blBvc2l0aW9uRXF1YWxDb3VudCA9IDE7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RNb3VzZURvd25Qb3NpdGlvbiA9IG5ld01vdXNlRG93blBvc2l0aW9uO1xuXG5cdFx0Ly8gRmluYWxseSBzZXQgdGhlIGxhc3RNb3VzZURvd25Db3VudFxuXHRcdHRoaXMuX2xhc3RNb3VzZURvd25Db3VudCA9IE1hdGgubWluKHNldE1vdXNlRG93bkNvdW50LCB0aGlzLl9sYXN0TW91c2VEb3duUG9zaXRpb25FcXVhbENvdW50KTtcblx0fVxuXG59XG4iXSwKICAibWFwcGlu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
