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
import * as dom from "../../../../base/browser/dom.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { TokenizationRegistry } from "../../../common/languages.js";
import { HoverOperation, HoverStartMode, HoverStartSource } from "./hoverOperation.js";
import { HoverParticipantRegistry, HoverRangeAnchor } from "./hoverTypes.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ContentHoverWidget } from "./contentHoverWidget.js";
import { ContentHoverComputer } from "./contentHoverComputer.js";
import { ContentHoverResult } from "./contentHoverTypes.js";
import { Emitter } from "../../../../base/common/event.js";
import { RenderedContentHover } from "./contentHoverRendered.js";
import { isMousePositionWithinElement } from "./hoverUtils.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
let ContentHoverWidgetWrapper = class extends Disposable {
  constructor(_editor, _instantiationService, _keybindingService, _hoverService, _clipboardService) {
    super();
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._clipboardService = _clipboardService;
    this._currentResult = null;
    this._renderedContentHover = this._register(new MutableDisposable());
    this._onContentsChanged = this._register(new Emitter());
    this.onContentsChanged = this._onContentsChanged.event;
    this._contentHoverWidget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
    this._participants = this._initializeHoverParticipants();
    this._hoverOperation = this._register(new HoverOperation(this._editor, new ContentHoverComputer(this._editor, this._participants)));
    this._registerListeners();
  }
  _initializeHoverParticipants() {
    const participants = [];
    for (const participant of HoverParticipantRegistry.getAll()) {
      const participantInstance = this._instantiationService.createInstance(participant, this._editor);
      participants.push(participantInstance);
    }
    participants.sort((p1, p2) => p1.hoverOrdinal - p2.hoverOrdinal);
    this._register(this._contentHoverWidget.onDidResize(() => {
      this._participants.forEach((participant) => participant.handleResize?.());
    }));
    this._register(this._contentHoverWidget.onDidScroll((e) => {
      this._participants.forEach((participant) => participant.handleScroll?.(e));
    }));
    this._register(this._contentHoverWidget.onContentsChanged(() => {
      this._participants.forEach((participant) => participant.handleContentsChanged?.());
    }));
    return participants;
  }
  _registerListeners() {
    this._register(this._hoverOperation.onResult((result) => {
      const messages = result.hasLoadingMessage ? this._addLoadingMessage(result) : result.value;
      this._withResult(new ContentHoverResult(messages, result.isComplete, result.options));
    }));
    const contentHoverWidgetNode = this._contentHoverWidget.getDomNode();
    this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, "keydown", (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
      }
    }));
    this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, "mouseleave", (e) => {
      this._onMouseLeave(e);
    }));
    this._register(TokenizationRegistry.onDidChange(() => {
      if (this._contentHoverWidget.position && this._currentResult) {
        this._setCurrentResult(this._currentResult);
      }
    }));
    this._register(this._contentHoverWidget.onContentsChanged(() => {
      this._onContentsChanged.fire();
    }));
  }
  /**
   * Returns true if the hover shows now or will show.
   */
  _startShowingOrUpdateHover(anchor, mode, source, focus, mouseEvent) {
    const contentHoverIsVisible = this._contentHoverWidget.position && this._currentResult;
    if (!contentHoverIsVisible) {
      if (anchor) {
        this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
        return true;
      }
      return false;
    }
    const isHoverSticky = this._editor.getOption(EditorOption.hover).sticky;
    const isMouseGettingCloser = mouseEvent && this._contentHoverWidget.isMouseGettingCloser(mouseEvent.event.posx, mouseEvent.event.posy);
    const isHoverStickyAndIsMouseGettingCloser = isHoverSticky && isMouseGettingCloser;
    if (isHoverStickyAndIsMouseGettingCloser) {
      if (anchor) {
        this._startHoverOperationIfNecessary(anchor, mode, source, focus, true);
      }
      return true;
    }
    if (!anchor) {
      this._setCurrentResult(null);
      return false;
    }
    const currentAnchorEqualsPreviousAnchor = this._currentResult && this._currentResult.options.anchor.equals(anchor);
    if (currentAnchorEqualsPreviousAnchor) {
      return true;
    }
    const currentAnchorCompatibleWithPreviousAnchor = this._currentResult && anchor.canAdoptVisibleHover(this._currentResult.options.anchor, this._contentHoverWidget.position);
    if (!currentAnchorCompatibleWithPreviousAnchor) {
      this._setCurrentResult(null);
      this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
      return true;
    }
    if (this._currentResult) {
      this._setCurrentResult(this._currentResult.filter(anchor));
    }
    this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
    return true;
  }
  _startHoverOperationIfNecessary(anchor, mode, source, shouldFocus, insistOnKeepingHoverVisible) {
    const currentAnchorEqualToPreviousHover = this._hoverOperation.options && this._hoverOperation.options.anchor.equals(anchor);
    if (currentAnchorEqualToPreviousHover) {
      return;
    }
    this._hoverOperation.cancel();
    const contentHoverComputerOptions = {
      anchor,
      source,
      shouldFocus,
      insistOnKeepingHoverVisible
    };
    this._hoverOperation.start(mode, contentHoverComputerOptions);
  }
  _setCurrentResult(hoverResult) {
    let currentHoverResult = hoverResult;
    const currentResultEqualToPreviousResult = this._currentResult === currentHoverResult;
    if (currentResultEqualToPreviousResult) {
      return;
    }
    const currentHoverResultIsEmpty = currentHoverResult && currentHoverResult.hoverParts.length === 0;
    if (currentHoverResultIsEmpty) {
      currentHoverResult = null;
    }
    this._currentResult = currentHoverResult;
    if (this._currentResult) {
      this._showHover(this._currentResult);
    } else {
      this._hideHover();
    }
  }
  _addLoadingMessage(hoverResult) {
    for (const participant of this._participants) {
      if (!participant.createLoadingMessage) {
        continue;
      }
      const loadingMessage = participant.createLoadingMessage(hoverResult.options.anchor);
      if (!loadingMessage) {
        continue;
      }
      return hoverResult.value.slice(0).concat([loadingMessage]);
    }
    return hoverResult.value;
  }
  _withResult(hoverResult) {
    const previousHoverIsVisibleWithCompleteResult = this._contentHoverWidget.position && this._currentResult && this._currentResult.isComplete;
    if (!previousHoverIsVisibleWithCompleteResult) {
      this._setCurrentResult(hoverResult);
    }
    const isCurrentHoverResultComplete = hoverResult.isComplete;
    if (!isCurrentHoverResultComplete) {
      return;
    }
    const currentHoverResultIsEmpty = hoverResult.hoverParts.length === 0;
    const insistOnKeepingPreviousHoverVisible = hoverResult.options.insistOnKeepingHoverVisible;
    const shouldKeepPreviousHoverVisible = currentHoverResultIsEmpty && insistOnKeepingPreviousHoverVisible;
    if (shouldKeepPreviousHoverVisible) {
      return;
    }
    this._setCurrentResult(hoverResult);
  }
  _showHover(hoverResult) {
    const context = this._getHoverContext();
    this._renderedContentHover.value = new RenderedContentHover(this._editor, hoverResult, this._participants, context, this._keybindingService, this._hoverService, this._clipboardService);
    if (this._renderedContentHover.value.domNodeHasChildren) {
      this._contentHoverWidget.show(this._renderedContentHover.value);
    } else {
      this._renderedContentHover.clear();
    }
  }
  _hideHover() {
    this._contentHoverWidget.hide();
    this._participants.forEach((participant) => participant.handleHide?.());
  }
  _getHoverContext() {
    const hide = () => {
      this.hide();
    };
    const onContentsChanged = () => {
      this._contentHoverWidget.handleContentsChanged();
    };
    const setMinimumDimensions = (dimensions) => {
      this._contentHoverWidget.setMinimumDimensions(dimensions);
    };
    const focus = () => this.focus();
    return { hide, onContentsChanged, setMinimumDimensions, focus };
  }
  showsOrWillShow(mouseEvent) {
    const isContentWidgetResizing = this._contentHoverWidget.isResizing;
    if (isContentWidgetResizing) {
      return true;
    }
    if (this._isMouseOnCodeActionWidget(mouseEvent)) {
      return true;
    }
    const anchorCandidates = this._findHoverAnchorCandidates(mouseEvent);
    const anchorCandidatesExist = anchorCandidates.length > 0;
    if (!anchorCandidatesExist) {
      return this._startShowingOrUpdateHover(null, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
    }
    const anchor = anchorCandidates[0];
    return this._startShowingOrUpdateHover(anchor, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
  }
  _findHoverAnchorCandidates(mouseEvent) {
    const anchorCandidates = [];
    for (const participant of this._participants) {
      if (!participant.suggestHoverAnchor) {
        continue;
      }
      const anchor = participant.suggestHoverAnchor(mouseEvent);
      if (!anchor) {
        continue;
      }
      anchorCandidates.push(anchor);
    }
    const target = mouseEvent.target;
    switch (target.type) {
      case MouseTargetType.CONTENT_TEXT: {
        anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
        break;
      }
      case MouseTargetType.CONTENT_EMPTY: {
        const epsilon = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
        const mouseIsWithinLinesAndCloseToHover = !target.detail.isAfterLines && typeof target.detail.horizontalDistanceToText === "number" && target.detail.horizontalDistanceToText < epsilon;
        if (!mouseIsWithinLinesAndCloseToHover) {
          break;
        }
        anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
        break;
      }
    }
    anchorCandidates.sort((a, b) => b.priority - a.priority);
    return anchorCandidates;
  }
  _isMouseOnCodeActionWidget(mouseEvent) {
    const target = mouseEvent.event.browserEvent.target;
    if (target instanceof Element && !!target.closest(".action-widget")) {
      return true;
    }
    return false;
  }
  _onMouseLeave(e) {
    const editorDomNode = this._editor.getDomNode();
    const isMousePositionOutsideOfEditor = !editorDomNode || !isMousePositionWithinElement(editorDomNode, e.x, e.y);
    if (isMousePositionOutsideOfEditor) {
      this.hide();
    }
  }
  startShowingAtRange(range, mode, source, focus) {
    this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, void 0, void 0), mode, source, focus, null);
  }
  getWidgetContent() {
    const node = this._contentHoverWidget.getDomNode();
    if (!node.textContent) {
      return void 0;
    }
    return node.textContent;
  }
  async updateHoverVerbosityLevel(action, index, focus) {
    this._renderedContentHover.value?.updateHoverVerbosityLevel(action, index, focus);
  }
  doesHoverAtIndexSupportVerbosityAction(index, action) {
    return this._renderedContentHover.value?.doesHoverAtIndexSupportVerbosityAction(index, action) ?? false;
  }
  getAccessibleWidgetContent() {
    return this._renderedContentHover.value?.getAccessibleWidgetContent();
  }
  getAccessibleWidgetContentAtIndex(index) {
    return this._renderedContentHover.value?.getAccessibleWidgetContentAtIndex(index);
  }
  focusedHoverPartIndex() {
    return this._renderedContentHover.value?.focusedHoverPartIndex ?? -1;
  }
  containsNode(node) {
    return node ? this._contentHoverWidget.getDomNode().contains(node) : false;
  }
  focus() {
    const hoverPartsCount = this._renderedContentHover.value?.hoverPartsCount;
    if (hoverPartsCount === 1) {
      this.focusHoverPartWithIndex(0);
      return;
    }
    this._contentHoverWidget.focus();
  }
  focusHoverPartWithIndex(index) {
    this._renderedContentHover.value?.focusHoverPartWithIndex(index);
  }
  scrollUp() {
    this._contentHoverWidget.scrollUp();
  }
  scrollDown() {
    this._contentHoverWidget.scrollDown();
  }
  scrollLeft() {
    this._contentHoverWidget.scrollLeft();
  }
  scrollRight() {
    this._contentHoverWidget.scrollRight();
  }
  pageUp() {
    this._contentHoverWidget.pageUp();
  }
  pageDown() {
    this._contentHoverWidget.pageDown();
  }
  goToTop() {
    this._contentHoverWidget.goToTop();
  }
  goToBottom() {
    this._contentHoverWidget.goToBottom();
  }
  hide() {
    this._hoverOperation.cancel();
    this._setCurrentResult(null);
  }
  getDomNode() {
    return this._contentHoverWidget.getDomNode();
  }
  get isColorPickerVisible() {
    return this._renderedContentHover.value?.isColorPickerVisible() ?? false;
  }
  get isVisibleFromKeyboard() {
    return this._contentHoverWidget.isVisibleFromKeyboard;
  }
  get isVisible() {
    return this._contentHoverWidget.isVisible;
  }
  get isFocused() {
    return this._contentHoverWidget.isFocused;
  }
  get isResizing() {
    return this._contentHoverWidget.isResizing;
  }
  get widget() {
    return this._contentHoverWidget;
  }
};
ContentHoverWidgetWrapper = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IClipboardService)
], ContentHoverWidgetWrapper);
export {
  ContentHoverWidgetWrapper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxjb250ZW50SG92ZXJXaWRnZXRXcmFwcGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBIb3Zlck9wZXJhdGlvbiwgSG92ZXJSZXN1bHQsIEhvdmVyU3RhcnRNb2RlLCBIb3ZlclN0YXJ0U291cmNlIH0gZnJvbSAnLi9ob3Zlck9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlckFuY2hvciwgSG92ZXJQYXJ0aWNpcGFudFJlZ2lzdHJ5LCBIb3ZlclJhbmdlQW5jaG9yLCBJRWRpdG9ySG92ZXJDb250ZXh0LCBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudCwgSUhvdmVyUGFydCwgSUhvdmVyV2lkZ2V0IH0gZnJvbSAnLi9ob3ZlclR5cGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBIb3ZlclZlcmJvc2l0eUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGFuZGFsb25lL3N0YW5kYWxvbmVFbnVtcy5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJXaWRnZXQgfSBmcm9tICcuL2NvbnRlbnRIb3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb21wdXRlciwgQ29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zIH0gZnJvbSAnLi9jb250ZW50SG92ZXJDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJSZXN1bHQgfSBmcm9tICcuL2NvbnRlbnRIb3ZlclR5cGVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZW5kZXJlZENvbnRlbnRIb3ZlciB9IGZyb20gJy4vY29udGVudEhvdmVyUmVuZGVyZWQuanMnO1xuaW1wb3J0IHsgaXNNb3VzZVBvc2l0aW9uV2l0aGluRWxlbWVudCB9IGZyb20gJy4vaG92ZXJVdGlscy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDb250ZW50SG92ZXJXaWRnZXRXcmFwcGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElIb3ZlcldpZGdldCB7XG5cblx0cHJpdmF0ZSBfY3VycmVudFJlc3VsdDogQ29udGVudEhvdmVyUmVzdWx0IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkQ29udGVudEhvdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFJlbmRlcmVkQ29udGVudEhvdmVyPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZW50SG92ZXJXaWRnZXQ6IENvbnRlbnRIb3ZlcldpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfcGFydGljaXBhbnRzOiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3Zlck9wZXJhdGlvbjogSG92ZXJPcGVyYXRpb248Q29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zLCBJSG92ZXJQYXJ0PjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbnRlbnRzQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db250ZW50c0NoYW5nZWQgPSB0aGlzLl9vbkNvbnRlbnRzQ2hhbmdlZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRlbnRIb3ZlcldpZGdldCwgdGhpcy5fZWRpdG9yKSk7XG5cdFx0dGhpcy5fcGFydGljaXBhbnRzID0gdGhpcy5faW5pdGlhbGl6ZUhvdmVyUGFydGljaXBhbnRzKCk7XG5cdFx0dGhpcy5faG92ZXJPcGVyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgSG92ZXJPcGVyYXRpb24odGhpcy5fZWRpdG9yLCBuZXcgQ29udGVudEhvdmVyQ29tcHV0ZXIodGhpcy5fZWRpdG9yLCB0aGlzLl9wYXJ0aWNpcGFudHMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRpYWxpemVIb3ZlclBhcnRpY2lwYW50cygpOiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudFtdIHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudHM6IElFZGl0b3JIb3ZlclBhcnRpY2lwYW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHBhcnRpY2lwYW50IG9mIEhvdmVyUGFydGljaXBhbnRSZWdpc3RyeS5nZXRBbGwoKSkge1xuXHRcdFx0Y29uc3QgcGFydGljaXBhbnRJbnN0YW5jZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHBhcnRpY2lwYW50LCB0aGlzLl9lZGl0b3IpO1xuXHRcdFx0cGFydGljaXBhbnRzLnB1c2gocGFydGljaXBhbnRJbnN0YW5jZSk7XG5cdFx0fVxuXHRcdHBhcnRpY2lwYW50cy5zb3J0KChwMSwgcDIpID0+IHAxLmhvdmVyT3JkaW5hbCAtIHAyLmhvdmVyT3JkaW5hbCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGVudEhvdmVyV2lkZ2V0Lm9uRGlkUmVzaXplKCgpID0+IHtcblx0XHRcdHRoaXMuX3BhcnRpY2lwYW50cy5mb3JFYWNoKHBhcnRpY2lwYW50ID0+IHBhcnRpY2lwYW50LmhhbmRsZVJlc2l6ZT8uKCkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQub25EaWRTY3JvbGwoKGUpID0+IHtcblx0XHRcdHRoaXMuX3BhcnRpY2lwYW50cy5mb3JFYWNoKHBhcnRpY2lwYW50ID0+IHBhcnRpY2lwYW50LmhhbmRsZVNjcm9sbD8uKGUpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGVudEhvdmVyV2lkZ2V0Lm9uQ29udGVudHNDaGFuZ2VkKCgpID0+IHtcblx0XHRcdHRoaXMuX3BhcnRpY2lwYW50cy5mb3JFYWNoKHBhcnRpY2lwYW50ID0+IHBhcnRpY2lwYW50LmhhbmRsZUNvbnRlbnRzQ2hhbmdlZD8uKCkpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gcGFydGljaXBhbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG92ZXJPcGVyYXRpb24ub25SZXN1bHQoKHJlc3VsdCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSAocmVzdWx0Lmhhc0xvYWRpbmdNZXNzYWdlID8gdGhpcy5fYWRkTG9hZGluZ01lc3NhZ2UocmVzdWx0KSA6IHJlc3VsdC52YWx1ZSk7XG5cdFx0XHR0aGlzLl93aXRoUmVzdWx0KG5ldyBDb250ZW50SG92ZXJSZXN1bHQobWVzc2FnZXMsIHJlc3VsdC5pc0NvbXBsZXRlLCByZXN1bHQub3B0aW9ucykpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBjb250ZW50SG92ZXJXaWRnZXROb2RlID0gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoY29udGVudEhvdmVyV2lkZ2V0Tm9kZSwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRlbnRIb3ZlcldpZGdldE5vZGUsICdtb3VzZWxlYXZlJywgKGUpID0+IHtcblx0XHRcdHRoaXMuX29uTW91c2VMZWF2ZShlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoVG9rZW5pemF0aW9uUmVnaXN0cnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5wb3NpdGlvbiAmJiB0aGlzLl9jdXJyZW50UmVzdWx0KSB7XG5cdFx0XHRcdHRoaXMuX3NldEN1cnJlbnRSZXN1bHQodGhpcy5fY3VycmVudFJlc3VsdCk7IC8vIHJlbmRlciBhZ2FpblxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQub25Db250ZW50c0NoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25Db250ZW50c0NoYW5nZWQuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGhvdmVyIHNob3dzIG5vdyBvciB3aWxsIHNob3cuXG5cdCAqL1xuXHRwcml2YXRlIF9zdGFydFNob3dpbmdPclVwZGF0ZUhvdmVyKFxuXHRcdGFuY2hvcjogSG92ZXJBbmNob3IgfCBudWxsLFxuXHRcdG1vZGU6IEhvdmVyU3RhcnRNb2RlLFxuXHRcdHNvdXJjZTogSG92ZXJTdGFydFNvdXJjZSxcblx0XHRmb2N1czogYm9vbGVhbixcblx0XHRtb3VzZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCB8IG51bGxcblx0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29udGVudEhvdmVySXNWaXNpYmxlID0gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnBvc2l0aW9uICYmIHRoaXMuX2N1cnJlbnRSZXN1bHQ7XG5cdFx0aWYgKCFjb250ZW50SG92ZXJJc1Zpc2libGUpIHtcblx0XHRcdGlmIChhbmNob3IpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnRIb3Zlck9wZXJhdGlvbklmTmVjZXNzYXJ5KGFuY2hvciwgbW9kZSwgc291cmNlLCBmb2N1cywgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaXNIb3ZlclN0aWNreSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmhvdmVyKS5zdGlja3k7XG5cdFx0Y29uc3QgaXNNb3VzZUdldHRpbmdDbG9zZXIgPSBtb3VzZUV2ZW50ICYmIHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5pc01vdXNlR2V0dGluZ0Nsb3Nlcihtb3VzZUV2ZW50LmV2ZW50LnBvc3gsIG1vdXNlRXZlbnQuZXZlbnQucG9zeSk7XG5cdFx0Y29uc3QgaXNIb3ZlclN0aWNreUFuZElzTW91c2VHZXR0aW5nQ2xvc2VyID0gaXNIb3ZlclN0aWNreSAmJiBpc01vdXNlR2V0dGluZ0Nsb3Nlcjtcblx0XHQvLyBUaGUgbW91c2UgaXMgZ2V0dGluZyBjbG9zZXIgdG8gdGhlIGhvdmVyLCBzbyB3ZSB3aWxsIGtlZXAgdGhlIGhvdmVyIHVudG91Y2hlZFxuXHRcdC8vIEJ1dCB3ZSB3aWxsIGtpY2sgb2ZmIGEgaG92ZXIgdXBkYXRlIGF0IHRoZSBuZXcgYW5jaG9yLCBpbnNpc3Rpbmcgb24ga2VlcGluZyB0aGUgaG92ZXIgdmlzaWJsZS5cblx0XHRpZiAoaXNIb3ZlclN0aWNreUFuZElzTW91c2VHZXR0aW5nQ2xvc2VyKSB7XG5cdFx0XHRpZiAoYW5jaG9yKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0SG92ZXJPcGVyYXRpb25JZk5lY2Vzc2FyeShhbmNob3IsIG1vZGUsIHNvdXJjZSwgZm9jdXMsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdC8vIElmIG1vdXNlIGlzIG5vdCBnZXR0aW5nIGNsb3NlciBhbmQgYW5jaG9yIG5vdCBkZWZpbmVkLCBoaWRlIHRoZSBob3ZlclxuXHRcdGlmICghYW5jaG9yKSB7XG5cdFx0XHR0aGlzLl9zZXRDdXJyZW50UmVzdWx0KG51bGwpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBJZiBtb3VzZSBpZiBub3QgZ2V0dGluZyBjbG9zZXIgYW5kIGFuY2hvciBpcyBkZWZpbmVkLCBhbmQgdGhlIG5ldyBhbmNob3IgaXMgdGhlIHNhbWUgYXMgdGhlIHByZXZpb3VzIGFuY2hvclxuXHRcdGNvbnN0IGN1cnJlbnRBbmNob3JFcXVhbHNQcmV2aW91c0FuY2hvciA9IHRoaXMuX2N1cnJlbnRSZXN1bHQgJiYgdGhpcy5fY3VycmVudFJlc3VsdC5vcHRpb25zLmFuY2hvci5lcXVhbHMoYW5jaG9yKTtcblx0XHRpZiAoY3VycmVudEFuY2hvckVxdWFsc1ByZXZpb3VzQW5jaG9yKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Ly8gSWYgbW91c2UgaWYgbm90IGdldHRpbmcgY2xvc2VyIGFuZCBhbmNob3IgaXMgZGVmaW5lZCwgYW5kIHRoZSBuZXcgYW5jaG9yIGlzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIHByZXZpb3VzIGFuY2hvclxuXHRcdGNvbnN0IGN1cnJlbnRBbmNob3JDb21wYXRpYmxlV2l0aFByZXZpb3VzQW5jaG9yID0gdGhpcy5fY3VycmVudFJlc3VsdCAmJiBhbmNob3IuY2FuQWRvcHRWaXNpYmxlSG92ZXIodGhpcy5fY3VycmVudFJlc3VsdC5vcHRpb25zLmFuY2hvciwgdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnBvc2l0aW9uKTtcblx0XHRpZiAoIWN1cnJlbnRBbmNob3JDb21wYXRpYmxlV2l0aFByZXZpb3VzQW5jaG9yKSB7XG5cdFx0XHR0aGlzLl9zZXRDdXJyZW50UmVzdWx0KG51bGwpO1xuXHRcdFx0dGhpcy5fc3RhcnRIb3Zlck9wZXJhdGlvbklmTmVjZXNzYXJ5KGFuY2hvciwgbW9kZSwgc291cmNlLCBmb2N1cywgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdC8vIFdlIGFyZW4ndCBnZXR0aW5nIGFueSBjbG9zZXIgdG8gdGhlIGhvdmVyLCBzbyB3ZSB3aWxsIGZpbHRlciBleGlzdGluZyByZXN1bHRzXG5cdFx0Ly8gYW5kIGtlZXAgdGhvc2Ugd2hpY2ggYWxzbyBhcHBseSB0byB0aGUgbmV3IGFuY2hvci5cblx0XHRpZiAodGhpcy5fY3VycmVudFJlc3VsdCkge1xuXHRcdFx0dGhpcy5fc2V0Q3VycmVudFJlc3VsdCh0aGlzLl9jdXJyZW50UmVzdWx0LmZpbHRlcihhbmNob3IpKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhcnRIb3Zlck9wZXJhdGlvbklmTmVjZXNzYXJ5KGFuY2hvciwgbW9kZSwgc291cmNlLCBmb2N1cywgZmFsc2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRIb3Zlck9wZXJhdGlvbklmTmVjZXNzYXJ5KGFuY2hvcjogSG92ZXJBbmNob3IsIG1vZGU6IEhvdmVyU3RhcnRNb2RlLCBzb3VyY2U6IEhvdmVyU3RhcnRTb3VyY2UsIHNob3VsZEZvY3VzOiBib29sZWFuLCBpbnNpc3RPbktlZXBpbmdIb3ZlclZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50QW5jaG9yRXF1YWxUb1ByZXZpb3VzSG92ZXIgPSB0aGlzLl9ob3Zlck9wZXJhdGlvbi5vcHRpb25zICYmIHRoaXMuX2hvdmVyT3BlcmF0aW9uLm9wdGlvbnMuYW5jaG9yLmVxdWFscyhhbmNob3IpO1xuXHRcdGlmIChjdXJyZW50QW5jaG9yRXF1YWxUb1ByZXZpb3VzSG92ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXJPcGVyYXRpb24uY2FuY2VsKCk7XG5cdFx0Y29uc3QgY29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zOiBDb250ZW50SG92ZXJDb21wdXRlck9wdGlvbnMgPSB7XG5cdFx0XHRhbmNob3IsXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRzaG91bGRGb2N1cyxcblx0XHRcdGluc2lzdE9uS2VlcGluZ0hvdmVyVmlzaWJsZVxuXHRcdH07XG5cdFx0dGhpcy5faG92ZXJPcGVyYXRpb24uc3RhcnQobW9kZSwgY29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEN1cnJlbnRSZXN1bHQoaG92ZXJSZXN1bHQ6IENvbnRlbnRIb3ZlclJlc3VsdCB8IG51bGwpOiB2b2lkIHtcblx0XHRsZXQgY3VycmVudEhvdmVyUmVzdWx0ID0gaG92ZXJSZXN1bHQ7XG5cdFx0Y29uc3QgY3VycmVudFJlc3VsdEVxdWFsVG9QcmV2aW91c1Jlc3VsdCA9IHRoaXMuX2N1cnJlbnRSZXN1bHQgPT09IGN1cnJlbnRIb3ZlclJlc3VsdDtcblx0XHRpZiAoY3VycmVudFJlc3VsdEVxdWFsVG9QcmV2aW91c1Jlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50SG92ZXJSZXN1bHRJc0VtcHR5ID0gY3VycmVudEhvdmVyUmVzdWx0ICYmIGN1cnJlbnRIb3ZlclJlc3VsdC5ob3ZlclBhcnRzLmxlbmd0aCA9PT0gMDtcblx0XHRpZiAoY3VycmVudEhvdmVyUmVzdWx0SXNFbXB0eSkge1xuXHRcdFx0Y3VycmVudEhvdmVyUmVzdWx0ID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudFJlc3VsdCA9IGN1cnJlbnRIb3ZlclJlc3VsdDtcblx0XHRpZiAodGhpcy5fY3VycmVudFJlc3VsdCkge1xuXHRcdFx0dGhpcy5fc2hvd0hvdmVyKHRoaXMuX2N1cnJlbnRSZXN1bHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9oaWRlSG92ZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRMb2FkaW5nTWVzc2FnZShob3ZlclJlc3VsdDogSG92ZXJSZXN1bHQ8Q29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zLCBJSG92ZXJQYXJ0Pik6IElIb3ZlclBhcnRbXSB7XG5cdFx0Zm9yIChjb25zdCBwYXJ0aWNpcGFudCBvZiB0aGlzLl9wYXJ0aWNpcGFudHMpIHtcblx0XHRcdGlmICghcGFydGljaXBhbnQuY3JlYXRlTG9hZGluZ01lc3NhZ2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsb2FkaW5nTWVzc2FnZSA9IHBhcnRpY2lwYW50LmNyZWF0ZUxvYWRpbmdNZXNzYWdlKGhvdmVyUmVzdWx0Lm9wdGlvbnMuYW5jaG9yKTtcblx0XHRcdGlmICghbG9hZGluZ01lc3NhZ2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaG92ZXJSZXN1bHQudmFsdWUuc2xpY2UoMCkuY29uY2F0KFtsb2FkaW5nTWVzc2FnZV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gaG92ZXJSZXN1bHQudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF93aXRoUmVzdWx0KGhvdmVyUmVzdWx0OiBDb250ZW50SG92ZXJSZXN1bHQpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0hvdmVySXNWaXNpYmxlV2l0aENvbXBsZXRlUmVzdWx0ID0gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnBvc2l0aW9uICYmIHRoaXMuX2N1cnJlbnRSZXN1bHQgJiYgdGhpcy5fY3VycmVudFJlc3VsdC5pc0NvbXBsZXRlO1xuXHRcdGlmICghcHJldmlvdXNIb3ZlcklzVmlzaWJsZVdpdGhDb21wbGV0ZVJlc3VsdCkge1xuXHRcdFx0dGhpcy5fc2V0Q3VycmVudFJlc3VsdChob3ZlclJlc3VsdCk7XG5cdFx0fVxuXHRcdC8vIFRoZSBob3ZlciBpcyB2aXNpYmxlIHdpdGggYSBwcmV2aW91cyBjb21wbGV0ZSByZXN1bHQuXG5cdFx0Y29uc3QgaXNDdXJyZW50SG92ZXJSZXN1bHRDb21wbGV0ZSA9IGhvdmVyUmVzdWx0LmlzQ29tcGxldGU7XG5cdFx0aWYgKCFpc0N1cnJlbnRIb3ZlclJlc3VsdENvbXBsZXRlKSB7XG5cdFx0XHQvLyBJbnN0ZWFkIG9mIHJlbmRlcmluZyB0aGUgbmV3IHBhcnRpYWwgcmVzdWx0LCB3ZSB3YWl0IGZvciB0aGUgcmVzdWx0IHRvIGJlIGNvbXBsZXRlLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50SG92ZXJSZXN1bHRJc0VtcHR5ID0gaG92ZXJSZXN1bHQuaG92ZXJQYXJ0cy5sZW5ndGggPT09IDA7XG5cdFx0Y29uc3QgaW5zaXN0T25LZWVwaW5nUHJldmlvdXNIb3ZlclZpc2libGUgPSBob3ZlclJlc3VsdC5vcHRpb25zLmluc2lzdE9uS2VlcGluZ0hvdmVyVmlzaWJsZTtcblx0XHRjb25zdCBzaG91bGRLZWVwUHJldmlvdXNIb3ZlclZpc2libGUgPSBjdXJyZW50SG92ZXJSZXN1bHRJc0VtcHR5ICYmIGluc2lzdE9uS2VlcGluZ1ByZXZpb3VzSG92ZXJWaXNpYmxlO1xuXHRcdGlmIChzaG91bGRLZWVwUHJldmlvdXNIb3ZlclZpc2libGUpIHtcblx0XHRcdC8vIFRoZSBob3ZlciB3b3VsZCBub3cgaGlkZSBub3JtYWxseSwgc28gd2UnbGwga2VlcCB0aGUgcHJldmlvdXMgbWVzc2FnZXNcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0Q3VycmVudFJlc3VsdChob3ZlclJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93SG92ZXIoaG92ZXJSZXN1bHQ6IENvbnRlbnRIb3ZlclJlc3VsdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9nZXRIb3ZlckNvbnRleHQoKTtcblx0XHR0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZSA9IG5ldyBSZW5kZXJlZENvbnRlbnRIb3Zlcih0aGlzLl9lZGl0b3IsIGhvdmVyUmVzdWx0LCB0aGlzLl9wYXJ0aWNpcGFudHMsIGNvbnRleHQsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9ob3ZlclNlcnZpY2UsIHRoaXMuX2NsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGlmICh0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZS5kb21Ob2RlSGFzQ2hpbGRyZW4pIHtcblx0XHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5zaG93KHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlSG92ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmhpZGUoKTtcblx0XHR0aGlzLl9wYXJ0aWNpcGFudHMuZm9yRWFjaChwYXJ0aWNpcGFudCA9PiBwYXJ0aWNpcGFudC5oYW5kbGVIaWRlPy4oKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIb3ZlckNvbnRleHQoKTogSUVkaXRvckhvdmVyQ29udGV4dCB7XG5cdFx0Y29uc3QgaGlkZSA9ICgpID0+IHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdH07XG5cdFx0Y29uc3Qgb25Db250ZW50c0NoYW5nZWQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuaGFuZGxlQ29udGVudHNDaGFuZ2VkKCk7XG5cdFx0fTtcblx0XHRjb25zdCBzZXRNaW5pbXVtRGltZW5zaW9ucyA9IChkaW1lbnNpb25zOiBkb20uRGltZW5zaW9uKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuc2V0TWluaW11bURpbWVuc2lvbnMoZGltZW5zaW9ucyk7XG5cdFx0fTtcblx0XHRjb25zdCBmb2N1cyA9ICgpID0+IHRoaXMuZm9jdXMoKTtcblx0XHRyZXR1cm4geyBoaWRlLCBvbkNvbnRlbnRzQ2hhbmdlZCwgc2V0TWluaW11bURpbWVuc2lvbnMsIGZvY3VzIH07XG5cdH1cblxuXG5cdHB1YmxpYyBzaG93c09yV2lsbFNob3cobW91c2VFdmVudDogSUVkaXRvck1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBpc0NvbnRlbnRXaWRnZXRSZXNpemluZyA9IHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5pc1Jlc2l6aW5nO1xuXHRcdGlmIChpc0NvbnRlbnRXaWRnZXRSZXNpemluZykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc01vdXNlT25Db2RlQWN0aW9uV2lkZ2V0KG1vdXNlRXZlbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgYW5jaG9yQ2FuZGlkYXRlczogSG92ZXJBbmNob3JbXSA9IHRoaXMuX2ZpbmRIb3ZlckFuY2hvckNhbmRpZGF0ZXMobW91c2VFdmVudCk7XG5cdFx0Y29uc3QgYW5jaG9yQ2FuZGlkYXRlc0V4aXN0ID0gYW5jaG9yQ2FuZGlkYXRlcy5sZW5ndGggPiAwO1xuXHRcdGlmICghYW5jaG9yQ2FuZGlkYXRlc0V4aXN0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc3RhcnRTaG93aW5nT3JVcGRhdGVIb3ZlcihudWxsLCBIb3ZlclN0YXJ0TW9kZS5EZWxheWVkLCBIb3ZlclN0YXJ0U291cmNlLk1vdXNlLCBmYWxzZSwgbW91c2VFdmVudCk7XG5cdFx0fVxuXHRcdGNvbnN0IGFuY2hvciA9IGFuY2hvckNhbmRpZGF0ZXNbMF07XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0U2hvd2luZ09yVXBkYXRlSG92ZXIoYW5jaG9yLCBIb3ZlclN0YXJ0TW9kZS5EZWxheWVkLCBIb3ZlclN0YXJ0U291cmNlLk1vdXNlLCBmYWxzZSwgbW91c2VFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kSG92ZXJBbmNob3JDYW5kaWRhdGVzKG1vdXNlRXZlbnQ6IElFZGl0b3JNb3VzZUV2ZW50KTogSG92ZXJBbmNob3JbXSB7XG5cdFx0Y29uc3QgYW5jaG9yQ2FuZGlkYXRlczogSG92ZXJBbmNob3JbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcGFydGljaXBhbnQgb2YgdGhpcy5fcGFydGljaXBhbnRzKSB7XG5cdFx0XHRpZiAoIXBhcnRpY2lwYW50LnN1Z2dlc3RIb3ZlckFuY2hvcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFuY2hvciA9IHBhcnRpY2lwYW50LnN1Z2dlc3RIb3ZlckFuY2hvcihtb3VzZUV2ZW50KTtcblx0XHRcdGlmICghYW5jaG9yKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YW5jaG9yQ2FuZGlkYXRlcy5wdXNoKGFuY2hvcik7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IG1vdXNlRXZlbnQudGFyZ2V0O1xuXHRcdHN3aXRjaCAodGFyZ2V0LnR5cGUpIHtcblx0XHRcdGNhc2UgTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVDoge1xuXHRcdFx0XHRhbmNob3JDYW5kaWRhdGVzLnB1c2gobmV3IEhvdmVyUmFuZ2VBbmNob3IoMCwgdGFyZ2V0LnJhbmdlLCBtb3VzZUV2ZW50LmV2ZW50LnBvc3gsIG1vdXNlRXZlbnQuZXZlbnQucG9zeSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfRU1QVFk6IHtcblx0XHRcdFx0Y29uc3QgZXBzaWxvbiA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggLyAyO1xuXHRcdFx0XHQvLyBMZXQgaG92ZXIga2ljayBpbiBldmVuIHdoZW4gdGhlIG1vdXNlIGlzIHRlY2huaWNhbGx5IGluIHRoZSBlbXB0eSBhcmVhIGFmdGVyIGEgbGluZSwgZ2l2ZW4gdGhlIGRpc3RhbmNlIGlzIHNtYWxsIGVub3VnaFxuXHRcdFx0XHRjb25zdCBtb3VzZUlzV2l0aGluTGluZXNBbmRDbG9zZVRvSG92ZXIgPSAhdGFyZ2V0LmRldGFpbC5pc0FmdGVyTGluZXNcblx0XHRcdFx0XHQmJiB0eXBlb2YgdGFyZ2V0LmRldGFpbC5ob3Jpem9udGFsRGlzdGFuY2VUb1RleHQgPT09ICdudW1iZXInXG5cdFx0XHRcdFx0JiYgdGFyZ2V0LmRldGFpbC5ob3Jpem9udGFsRGlzdGFuY2VUb1RleHQgPCBlcHNpbG9uO1xuXHRcdFx0XHRpZiAoIW1vdXNlSXNXaXRoaW5MaW5lc0FuZENsb3NlVG9Ib3Zlcikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFuY2hvckNhbmRpZGF0ZXMucHVzaChuZXcgSG92ZXJSYW5nZUFuY2hvcigwLCB0YXJnZXQucmFuZ2UsIG1vdXNlRXZlbnQuZXZlbnQucG9zeCwgbW91c2VFdmVudC5ldmVudC5wb3N5KSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhbmNob3JDYW5kaWRhdGVzLnNvcnQoKGEsIGIpID0+IGIucHJpb3JpdHkgLSBhLnByaW9yaXR5KTtcblx0XHRyZXR1cm4gYW5jaG9yQ2FuZGlkYXRlcztcblx0fVxuXG5cdHByaXZhdGUgX2lzTW91c2VPbkNvZGVBY3Rpb25XaWRnZXQobW91c2VFdmVudDogSUVkaXRvck1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCB0YXJnZXQgPSBtb3VzZUV2ZW50LmV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQ7XG5cdFx0aWYgKHRhcmdldCBpbnN0YW5jZW9mIEVsZW1lbnQgJiYgISF0YXJnZXQuY2xvc2VzdCgnLmFjdGlvbi13aWRnZXQnKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX29uTW91c2VMZWF2ZShlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yRG9tTm9kZSA9IHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0Y29uc3QgaXNNb3VzZVBvc2l0aW9uT3V0c2lkZU9mRWRpdG9yID0gIWVkaXRvckRvbU5vZGUgfHwgIWlzTW91c2VQb3NpdGlvbldpdGhpbkVsZW1lbnQoZWRpdG9yRG9tTm9kZSwgZS54LCBlLnkpO1xuXHRcdGlmIChpc01vdXNlUG9zaXRpb25PdXRzaWRlT2ZFZGl0b3IpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGFydFNob3dpbmdBdFJhbmdlKHJhbmdlOiBSYW5nZSwgbW9kZTogSG92ZXJTdGFydE1vZGUsIHNvdXJjZTogSG92ZXJTdGFydFNvdXJjZSwgZm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFydFNob3dpbmdPclVwZGF0ZUhvdmVyKG5ldyBIb3ZlclJhbmdlQW5jaG9yKDAsIHJhbmdlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIG1vZGUsIHNvdXJjZSwgZm9jdXMsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIGdldFdpZGdldENvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHRpZiAoIW5vZGUudGV4dENvbnRlbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBub2RlLnRleHRDb250ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZUhvdmVyVmVyYm9zaXR5TGV2ZWwoYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbiwgaW5kZXg6IG51bWJlciwgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWU/LnVwZGF0ZUhvdmVyVmVyYm9zaXR5TGV2ZWwoYWN0aW9uLCBpbmRleCwgZm9jdXMpO1xuXHR9XG5cblx0cHVibGljIGRvZXNIb3ZlckF0SW5kZXhTdXBwb3J0VmVyYm9zaXR5QWN0aW9uKGluZGV4OiBudW1iZXIsIGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWU/LmRvZXNIb3ZlckF0SW5kZXhTdXBwb3J0VmVyYm9zaXR5QWN0aW9uKGluZGV4LCBhY3Rpb24pID8/IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVXaWRnZXRDb250ZW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlPy5nZXRBY2Nlc3NpYmxlV2lkZ2V0Q29udGVudCgpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVXaWRnZXRDb250ZW50QXRJbmRleChpbmRleDogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWU/LmdldEFjY2Vzc2libGVXaWRnZXRDb250ZW50QXRJbmRleChpbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNlZEhvdmVyUGFydEluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlPy5mb2N1c2VkSG92ZXJQYXJ0SW5kZXggPz8gLTE7XG5cdH1cblxuXHRwdWJsaWMgY29udGFpbnNOb2RlKG5vZGU6IE5vZGUgfCBudWxsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChub2RlID8gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmdldERvbU5vZGUoKS5jb250YWlucyhub2RlKSA6IGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHRjb25zdCBob3ZlclBhcnRzQ291bnQgPSB0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZT8uaG92ZXJQYXJ0c0NvdW50O1xuXHRcdGlmIChob3ZlclBhcnRzQ291bnQgPT09IDEpIHtcblx0XHRcdHRoaXMuZm9jdXNIb3ZlclBhcnRXaXRoSW5kZXgoMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZT8uZm9jdXNIb3ZlclBhcnRXaXRoSW5kZXgoaW5kZXgpO1xuXHR9XG5cblx0cHVibGljIHNjcm9sbFVwKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5zY3JvbGxVcCgpO1xuXHR9XG5cblx0cHVibGljIHNjcm9sbERvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnNjcm9sbERvd24oKTtcblx0fVxuXG5cdHB1YmxpYyBzY3JvbGxMZWZ0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5zY3JvbGxMZWZ0KCk7XG5cdH1cblxuXHRwdWJsaWMgc2Nyb2xsUmlnaHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnNjcm9sbFJpZ2h0KCk7XG5cdH1cblxuXHRwdWJsaWMgcGFnZVVwKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5wYWdlVXAoKTtcblx0fVxuXG5cdHB1YmxpYyBwYWdlRG93bigpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQucGFnZURvd24oKTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvVG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5nb1RvVG9wKCk7XG5cdH1cblxuXHRwdWJsaWMgZ29Ub0JvdHRvbSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuZ29Ub0JvdHRvbSgpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXJPcGVyYXRpb24uY2FuY2VsKCk7XG5cdFx0dGhpcy5fc2V0Q3VycmVudFJlc3VsdChudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDb2xvclBpY2tlclZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlPy5pc0NvbG9yUGlja2VyVmlzaWJsZSgpID8/IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGdldCBpc1Zpc2libGVGcm9tS2V5Ym9hcmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5pc1Zpc2libGVGcm9tS2V5Ym9hcmQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmlzVmlzaWJsZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuaXNGb2N1c2VkO1xuXHR9XG5cblx0cHVibGljIGdldCBpc1Jlc2l6aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuaXNSZXNpemluZztcblx0fVxuXG5cdHB1YmxpYyBnZXQgd2lkZ2V0KCkge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQXlDLHVCQUF1QjtBQUNoRSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUE2QixnQkFBZ0Isd0JBQXdCO0FBQzlFLFNBQXNCLDBCQUEwQix3QkFBZ0c7QUFDaEosU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBeUQ7QUFDbEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBRTNCLElBQU0sNEJBQU4sY0FBd0MsV0FBbUM7QUFBQSxFQVlqRixZQUNrQixTQUN1Qix1QkFDSCxvQkFDTCxlQUNJLG1CQUNuQztBQUNELFVBQU07QUFOVztBQUN1QjtBQUNIO0FBQ0w7QUFDSTtBQWZyQyxTQUFRLGlCQUE0QztBQUNwRCxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksa0JBQXdDLENBQUM7QUFNckcsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN4RSxTQUFn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
