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
import { RenderedHoverParts } from "./hoverTypes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { EditorHoverStatusBar } from "./contentHoverStatusBar.js";
import { HoverCopyButton } from "./hoverCopyButton.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import * as dom from "../../../../base/browser/dom.js";
import { MarkdownHoverParticipant } from "./markdownHoverParticipant.js";
import { ColorHover, HoverColorPickerParticipant } from "../../colorPicker/browser/hoverColorPicker/hoverColorPickerParticipant.js";
import { localize } from "../../../../nls.js";
import { InlayHintsHover } from "../../inlayHints/browser/inlayHintsHover.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
let RenderedContentHover = class extends Disposable {
  constructor(editor, hoverResult, participants, context, keybindingService, hoverService, clipboardService) {
    super();
    const parts = hoverResult.hoverParts;
    this._renderedHoverParts = this._register(new RenderedContentHoverParts(
      editor,
      participants,
      parts,
      context,
      keybindingService,
      hoverService,
      clipboardService
    ));
    const contentHoverComputerOptions = hoverResult.options;
    const anchor = contentHoverComputerOptions.anchor;
    const { showAtPosition, showAtSecondaryPosition } = RenderedContentHover.computeHoverPositions(editor, anchor.range, parts);
    this.shouldAppearBeforeContent = parts.some((m) => m.isBeforeContent);
    this.showAtPosition = showAtPosition;
    this.showAtSecondaryPosition = showAtSecondaryPosition;
    this.initialMousePosX = anchor.initialMousePosX;
    this.initialMousePosY = anchor.initialMousePosY;
    this.shouldFocus = contentHoverComputerOptions.shouldFocus;
    this.source = contentHoverComputerOptions.source;
  }
  get domNode() {
    return this._renderedHoverParts.domNode;
  }
  get domNodeHasChildren() {
    return this._renderedHoverParts.domNodeHasChildren;
  }
  get focusedHoverPartIndex() {
    return this._renderedHoverParts.focusedHoverPartIndex;
  }
  get hoverPartsCount() {
    return this._renderedHoverParts.hoverPartsCount;
  }
  focusHoverPartWithIndex(index) {
    this._renderedHoverParts.focusHoverPartWithIndex(index);
  }
  getAccessibleWidgetContent() {
    return this._renderedHoverParts.getAccessibleContent();
  }
  getAccessibleWidgetContentAtIndex(index) {
    return this._renderedHoverParts.getAccessibleHoverContentAtIndex(index);
  }
  async updateHoverVerbosityLevel(action, index, focus) {
    this._renderedHoverParts.updateHoverVerbosityLevel(action, index, focus);
  }
  doesHoverAtIndexSupportVerbosityAction(index, action) {
    return this._renderedHoverParts.doesHoverAtIndexSupportVerbosityAction(index, action);
  }
  isColorPickerVisible() {
    return this._renderedHoverParts.isColorPickerVisible();
  }
  static computeHoverPositions(editor, anchorRange, hoverParts) {
    let startColumnBoundary = 1;
    if (editor.hasModel()) {
      const viewModel = editor._getViewModel();
      const coordinatesConverter = viewModel.coordinatesConverter;
      const anchorViewRange = coordinatesConverter.convertModelRangeToViewRange(anchorRange);
      const anchorViewMinColumn = viewModel.getLineMinColumn(anchorViewRange.startLineNumber);
      const anchorViewRangeStart = new Position(anchorViewRange.startLineNumber, anchorViewMinColumn);
      startColumnBoundary = coordinatesConverter.convertViewPositionToModelPosition(anchorViewRangeStart).column;
    }
    const anchorStartLineNumber = anchorRange.startLineNumber;
    let secondaryPositionColumn = anchorRange.startColumn;
    let forceShowAtRange;
    for (const hoverPart of hoverParts) {
      const hoverPartRange = hoverPart.range;
      const hoverPartRangeOnAnchorStartLine = hoverPartRange.startLineNumber === anchorStartLineNumber;
      const hoverPartRangeOnAnchorEndLine = hoverPartRange.endLineNumber === anchorStartLineNumber;
      const hoverPartRangeIsOnAnchorLine = hoverPartRangeOnAnchorStartLine && hoverPartRangeOnAnchorEndLine;
      if (hoverPartRangeIsOnAnchorLine) {
        const hoverPartStartColumn = hoverPartRange.startColumn;
        const minSecondaryPositionColumn = Math.min(secondaryPositionColumn, hoverPartStartColumn);
        secondaryPositionColumn = Math.max(minSecondaryPositionColumn, startColumnBoundary);
      }
      if (hoverPart.forceShowAtRange) {
        forceShowAtRange = hoverPartRange;
      }
    }
    let showAtPosition;
    let showAtSecondaryPosition;
    if (forceShowAtRange) {
      const forceShowAtPosition = forceShowAtRange.getStartPosition();
      showAtPosition = forceShowAtPosition;
      showAtSecondaryPosition = forceShowAtPosition;
    } else {
      showAtPosition = anchorRange.getStartPosition();
      showAtSecondaryPosition = new Position(anchorStartLineNumber, secondaryPositionColumn);
    }
    return {
      showAtPosition,
      showAtSecondaryPosition
    };
  }
};
RenderedContentHover = __decorateClass([
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IClipboardService)
], RenderedContentHover);
class RenderedStatusBar {
  constructor(fragment, _statusBar) {
    this._statusBar = _statusBar;
    fragment.appendChild(this._statusBar.hoverElement);
  }
  get hoverElement() {
    return this._statusBar.hoverElement;
  }
  get actions() {
    return this._statusBar.actions;
  }
  dispose() {
    this._statusBar.dispose();
  }
}
let RenderedContentHoverParts = class extends Disposable {
  constructor(editor, participants, hoverParts, context, keybindingService, _hoverService, _clipboardService) {
    super();
    this._hoverService = _hoverService;
    this._clipboardService = _clipboardService;
    this._renderedParts = [];
    this._perPartDisposables = /* @__PURE__ */ new Map();
    this._focusedHoverPartIndex = -1;
    this._context = context;
    this._fragment = document.createDocumentFragment();
    this._register(this._renderParts(participants, hoverParts, context, keybindingService, this._hoverService));
    this._register(this._registerListenersOnRenderedParts());
    this._register(this._createEditorDecorations(editor, hoverParts));
    this._updateMarkdownAndColorParticipantInfo(participants);
  }
  _createEditorDecorations(editor, hoverParts) {
    if (hoverParts.length === 0) {
      return Disposable.None;
    }
    let highlightRange = hoverParts[0].range;
    for (const hoverPart of hoverParts) {
      const hoverPartRange = hoverPart.range;
      highlightRange = Range.plusRange(highlightRange, hoverPartRange);
    }
    const highlightDecoration = editor.createDecorationsCollection();
    highlightDecoration.set([{
      range: highlightRange,
      options: RenderedContentHoverParts._DECORATION_OPTIONS
    }]);
    return toDisposable(() => {
      highlightDecoration.clear();
    });
  }
  _renderParts(participants, hoverParts, hoverContext, keybindingService, hoverService) {
    const statusBar = new EditorHoverStatusBar(keybindingService, hoverService);
    const hoverRenderingContext = {
      fragment: this._fragment,
      statusBar,
      ...hoverContext
    };
    const disposables = new DisposableStore();
    disposables.add(statusBar);
    for (const participant of participants) {
      const renderedHoverParts = this._renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext);
      disposables.add(renderedHoverParts);
      for (const renderedHoverPart of renderedHoverParts.renderedHoverParts) {
        this._renderedParts.push({
          type: "hoverPart",
          participant,
          hoverPart: renderedHoverPart.hoverPart,
          hoverElement: renderedHoverPart.hoverElement
        });
      }
    }
    const renderedStatusBar = this._renderStatusBar(this._fragment, statusBar);
    if (renderedStatusBar) {
      disposables.add(renderedStatusBar);
      this._renderedParts.push({
        type: "statusBar",
        hoverElement: renderedStatusBar.hoverElement,
        actions: renderedStatusBar.actions
      });
    }
    return disposables;
  }
  _renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext) {
    const hoverPartsForParticipant = hoverParts.filter((hoverPart) => hoverPart.owner === participant);
    const hasHoverPartsForParticipant = hoverPartsForParticipant.length > 0;
    if (!hasHoverPartsForParticipant) {
      return new RenderedHoverParts([]);
    }
    return participant.renderHoverParts(hoverRenderingContext, hoverPartsForParticipant);
  }
  _renderStatusBar(fragment, statusBar) {
    if (!statusBar.hasContent) {
      return void 0;
    }
    return new RenderedStatusBar(fragment, statusBar);
  }
  _registerListenersOnRenderedParts() {
    this._renderedParts.forEach((renderedPart, index) => {
      this._createListenersForPart(index, renderedPart);
    });
    return toDisposable(() => {
      for (const d of this._perPartDisposables.values()) {
        d.dispose();
      }
      this._perPartDisposables.clear();
    });
  }
  _createListenersForPart(index, renderedPart) {
    const partDisposables = new DisposableStore();
    const element = renderedPart.hoverElement;
    element.tabIndex = 0;
    partDisposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_IN, (event) => {
      event.stopPropagation();
      this._focusedHoverPartIndex = index;
    }));
    partDisposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_OUT, (event) => {
      event.stopPropagation();
      this._focusedHoverPartIndex = -1;
    }));
    if (renderedPart.type === "hoverPart" && !(renderedPart.hoverPart instanceof ColorHover) && !renderedPart.participant.hideCopyButton) {
      partDisposables.add(new HoverCopyButton(
        element,
        () => renderedPart.participant.getAccessibleContent(renderedPart.hoverPart),
        this._clipboardService,
        this._hoverService
      ));
    }
    this._perPartDisposables.set(index, partDisposables);
  }
  _updateMarkdownAndColorParticipantInfo(participants) {
    const markdownHoverParticipant = participants.find((p) => {
      return p instanceof MarkdownHoverParticipant && !(p instanceof InlayHintsHover);
    });
    if (markdownHoverParticipant) {
      this._markdownHoverParticipant = markdownHoverParticipant;
    }
    this._colorHoverParticipant = participants.find((p) => p instanceof HoverColorPickerParticipant);
  }
  focusHoverPartWithIndex(index) {
    if (index < 0 || index >= this._renderedParts.length) {
      return;
    }
    this._renderedParts[index].hoverElement.focus();
  }
  getAccessibleContent() {
    const content = [];
    for (let i = 0; i < this._renderedParts.length; i++) {
      content.push(this.getAccessibleHoverContentAtIndex(i));
    }
    return content.join("\n\n");
  }
  getAccessibleHoverContentAtIndex(index) {
    const renderedPart = this._renderedParts[index];
    if (!renderedPart) {
      return "";
    }
    if (renderedPart.type === "statusBar") {
      const statusBarDescription = [localize("hoverAccessibilityStatusBar", "This is a hover status bar.")];
      for (const action of renderedPart.actions) {
        const keybinding = action.actionKeybindingLabel;
        if (keybinding) {
          statusBarDescription.push(localize("hoverAccessibilityStatusBarActionWithKeybinding", "It has an action with label {0} and keybinding {1}.", action.actionLabel, keybinding));
        } else {
          statusBarDescription.push(localize("hoverAccessibilityStatusBarActionWithoutKeybinding", "It has an action with label {0}.", action.actionLabel));
        }
      }
      return statusBarDescription.join("\n");
    }
    return renderedPart.participant.getAccessibleContent(renderedPart.hoverPart);
  }
  async updateHoverVerbosityLevel(action, index, focus) {
    if (!this._markdownHoverParticipant) {
      return;
    }
    let rangeOfIndicesToUpdate;
    if (index >= 0) {
      rangeOfIndicesToUpdate = { start: index, endExclusive: index + 1 };
    } else {
      rangeOfIndicesToUpdate = this._findRangeOfMarkdownHoverParts(this._markdownHoverParticipant);
    }
    for (let i = rangeOfIndicesToUpdate.start; i < rangeOfIndicesToUpdate.endExclusive; i++) {
      const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, i);
      if (normalizedMarkdownHoverIndex === void 0) {
        continue;
      }
      const renderedPart = await this._markdownHoverParticipant.updateMarkdownHoverVerbosityLevel(action, normalizedMarkdownHoverIndex);
      if (!renderedPart) {
        continue;
      }
      const prevDisposable = this._perPartDisposables.get(i);
      if (prevDisposable) {
        prevDisposable.dispose();
        this._perPartDisposables.delete(i);
      }
      this._renderedParts[i] = {
        type: "hoverPart",
        participant: this._markdownHoverParticipant,
        hoverPart: renderedPart.hoverPart,
        hoverElement: renderedPart.hoverElement
      };
      this._createListenersForPart(i, this._renderedParts[i]);
    }
    if (focus) {
      if (index >= 0) {
        this.focusHoverPartWithIndex(index);
      } else {
        this._context.focus();
      }
    }
    this._context.onContentsChanged();
  }
  doesHoverAtIndexSupportVerbosityAction(index, action) {
    if (!this._markdownHoverParticipant) {
      return false;
    }
    const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, index);
    if (normalizedMarkdownHoverIndex === void 0) {
      return false;
    }
    return this._markdownHoverParticipant.doesMarkdownHoverAtIndexSupportVerbosityAction(normalizedMarkdownHoverIndex, action);
  }
  isColorPickerVisible() {
    return this._colorHoverParticipant?.isColorPickerVisible() ?? false;
  }
  _normalizedIndexToMarkdownHoverIndexRange(markdownHoverParticipant, index) {
    const renderedPart = this._renderedParts[index];
    if (!renderedPart || renderedPart.type !== "hoverPart") {
      return void 0;
    }
    const isHoverPartMarkdownHover = renderedPart.participant === markdownHoverParticipant;
    if (!isHoverPartMarkdownHover) {
      return void 0;
    }
    const firstIndexOfMarkdownHovers = this._renderedParts.findIndex(
      (renderedPart2) => renderedPart2.type === "hoverPart" && renderedPart2.participant === markdownHoverParticipant
    );
    if (firstIndexOfMarkdownHovers === -1) {
      throw new BugIndicatingError();
    }
    return index - firstIndexOfMarkdownHovers;
  }
  _findRangeOfMarkdownHoverParts(markdownHoverParticipant) {
    const copiedRenderedParts = this._renderedParts.slice();
    const firstIndexOfMarkdownHovers = copiedRenderedParts.findIndex((renderedPart) => renderedPart.type === "hoverPart" && renderedPart.participant === markdownHoverParticipant);
    const inversedLastIndexOfMarkdownHovers = copiedRenderedParts.reverse().findIndex((renderedPart) => renderedPart.type === "hoverPart" && renderedPart.participant === markdownHoverParticipant);
    const lastIndexOfMarkdownHovers = inversedLastIndexOfMarkdownHovers >= 0 ? copiedRenderedParts.length - inversedLastIndexOfMarkdownHovers : inversedLastIndexOfMarkdownHovers;
    return { start: firstIndexOfMarkdownHovers, endExclusive: lastIndexOfMarkdownHovers + 1 };
  }
  get domNode() {
    return this._fragment;
  }
  get domNodeHasChildren() {
    return this._fragment.hasChildNodes();
  }
  get focusedHoverPartIndex() {
    return this._focusedHoverPartIndex;
  }
  get hoverPartsCount() {
    return this._renderedParts.length;
  }
};
RenderedContentHoverParts._DECORATION_OPTIONS = ModelDecorationOptions.register({
  description: "content-hover-highlight",
  className: "hoverHighlight"
});
RenderedContentHoverParts = __decorateClass([
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IClipboardService)
], RenderedContentHoverParts);
export {
  RenderedContentHover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxjb250ZW50SG92ZXJSZW5kZXJlZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElFZGl0b3JIb3ZlckNvbnRleHQsIElFZGl0b3JIb3ZlclBhcnRpY2lwYW50LCBJRWRpdG9ySG92ZXJSZW5kZXJDb250ZXh0LCBJSG92ZXJQYXJ0LCBJUmVuZGVyZWRIb3ZlclBhcnRzLCBSZW5kZXJlZEhvdmVyUGFydHMgfSBmcm9tICcuL2hvdmVyVHlwZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVkaXRvckhvdmVyU3RhdHVzQmFyIH0gZnJvbSAnLi9jb250ZW50SG92ZXJTdGF0dXNCYXIuanMnO1xuaW1wb3J0IHsgSG92ZXJTdGFydFNvdXJjZSB9IGZyb20gJy4vaG92ZXJPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSG92ZXJDb3B5QnV0dG9uIH0gZnJvbSAnLi9ob3ZlckNvcHlCdXR0b24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyUmVzdWx0IH0gZnJvbSAnLi9jb250ZW50SG92ZXJUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBIb3ZlclZlcmJvc2l0eUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50IH0gZnJvbSAnLi9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQuanMnO1xuaW1wb3J0IHsgQ29sb3JIb3ZlciwgSG92ZXJDb2xvclBpY2tlclBhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vY29sb3JQaWNrZXIvYnJvd3Nlci9ob3ZlckNvbG9yUGlja2VyL2hvdmVyQ29sb3JQaWNrZXJQYXJ0aWNpcGFudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJbmxheUhpbnRzSG92ZXIgfSBmcm9tICcuLi8uLi9pbmxheUhpbnRzL2Jyb3dzZXIvaW5sYXlIaW50c0hvdmVyLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBIb3ZlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgUmVuZGVyZWRDb250ZW50SG92ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgY2xvc2VzdE1vdXNlRGlzdGFuY2U6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHVibGljIGluaXRpYWxNb3VzZVBvc1g6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHVibGljIGluaXRpYWxNb3VzZVBvc1k6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2hvd0F0UG9zaXRpb246IFBvc2l0aW9uO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb246IFBvc2l0aW9uO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvdWxkRm9jdXM6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBzb3VyY2U6IEhvdmVyU3RhcnRTb3VyY2U7XG5cdHB1YmxpYyByZWFkb25seSBzaG91bGRBcHBlYXJCZWZvcmVDb250ZW50OiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkSG92ZXJQYXJ0czogUmVuZGVyZWRDb250ZW50SG92ZXJQYXJ0cztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdGhvdmVyUmVzdWx0OiBDb250ZW50SG92ZXJSZXN1bHQsXG5cdFx0cGFydGljaXBhbnRzOiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudDxJSG92ZXJQYXJ0PltdLFxuXHRcdGNvbnRleHQ6IElFZGl0b3JIb3ZlckNvbnRleHQsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBwYXJ0cyA9IGhvdmVyUmVzdWx0LmhvdmVyUGFydHM7XG5cdFx0dGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlbmRlcmVkQ29udGVudEhvdmVyUGFydHMoXG5cdFx0XHRlZGl0b3IsXG5cdFx0XHRwYXJ0aWNpcGFudHMsXG5cdFx0XHRwYXJ0cyxcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZSxcblx0XHRcdGhvdmVyU2VydmljZSxcblx0XHRcdGNsaXBib2FyZFNlcnZpY2Vcblx0XHQpKTtcblx0XHRjb25zdCBjb250ZW50SG92ZXJDb21wdXRlck9wdGlvbnMgPSBob3ZlclJlc3VsdC5vcHRpb25zO1xuXHRcdGNvbnN0IGFuY2hvciA9IGNvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucy5hbmNob3I7XG5cdFx0Y29uc3QgeyBzaG93QXRQb3NpdGlvbiwgc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb24gfSA9IFJlbmRlcmVkQ29udGVudEhvdmVyLmNvbXB1dGVIb3ZlclBvc2l0aW9ucyhlZGl0b3IsIGFuY2hvci5yYW5nZSwgcGFydHMpO1xuXHRcdHRoaXMuc2hvdWxkQXBwZWFyQmVmb3JlQ29udGVudCA9IHBhcnRzLnNvbWUobSA9PiBtLmlzQmVmb3JlQ29udGVudCk7XG5cdFx0dGhpcy5zaG93QXRQb3NpdGlvbiA9IHNob3dBdFBvc2l0aW9uO1xuXHRcdHRoaXMuc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb24gPSBzaG93QXRTZWNvbmRhcnlQb3NpdGlvbjtcblx0XHR0aGlzLmluaXRpYWxNb3VzZVBvc1ggPSBhbmNob3IuaW5pdGlhbE1vdXNlUG9zWDtcblx0XHR0aGlzLmluaXRpYWxNb3VzZVBvc1kgPSBhbmNob3IuaW5pdGlhbE1vdXNlUG9zWTtcblx0XHR0aGlzLnNob3VsZEZvY3VzID0gY29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zLnNob3VsZEZvY3VzO1xuXHRcdHRoaXMuc291cmNlID0gY29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zLnNvdXJjZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZSgpOiBEb2N1bWVudEZyYWdtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzLmRvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGRvbU5vZGVIYXNDaGlsZHJlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzLmRvbU5vZGVIYXNDaGlsZHJlbjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZm9jdXNlZEhvdmVyUGFydEluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5mb2N1c2VkSG92ZXJQYXJ0SW5kZXg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhvdmVyUGFydHNDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHMuaG92ZXJQYXJ0c0NvdW50O1xuXHR9XG5cblx0cHVibGljIGZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHMuZm9jdXNIb3ZlclBhcnRXaXRoSW5kZXgoaW5kZXgpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVXaWRnZXRDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5nZXRBY2Nlc3NpYmxlQ29udGVudCgpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVXaWRnZXRDb250ZW50QXRJbmRleChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzLmdldEFjY2Vzc2libGVIb3ZlckNvbnRlbnRBdEluZGV4KGluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24sIGluZGV4OiBudW1iZXIsIGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy51cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKGFjdGlvbiwgaW5kZXgsIGZvY3VzKTtcblx0fVxuXG5cdHB1YmxpYyBkb2VzSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleDogbnVtYmVyLCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5kb2VzSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleCwgYWN0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBpc0NvbG9yUGlja2VyVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzLmlzQ29sb3JQaWNrZXJWaXNpYmxlKCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNvbXB1dGVIb3ZlclBvc2l0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yLCBhbmNob3JSYW5nZTogUmFuZ2UsIGhvdmVyUGFydHM6IElIb3ZlclBhcnRbXSk6IHsgc2hvd0F0UG9zaXRpb246IFBvc2l0aW9uOyBzaG93QXRTZWNvbmRhcnlQb3NpdGlvbjogUG9zaXRpb24gfSB7XG5cblx0XHRsZXQgc3RhcnRDb2x1bW5Cb3VuZGFyeSA9IDE7XG5cdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHQvLyBFbnN1cmUgdGhlIHJhbmdlIGlzIG9uIHRoZSBjdXJyZW50IHZpZXcgbGluZVxuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyO1xuXHRcdFx0Y29uc3QgYW5jaG9yVmlld1JhbmdlID0gY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShhbmNob3JSYW5nZSk7XG5cdFx0XHRjb25zdCBhbmNob3JWaWV3TWluQ29sdW1uID0gdmlld01vZGVsLmdldExpbmVNaW5Db2x1bW4oYW5jaG9yVmlld1JhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBhbmNob3JWaWV3UmFuZ2VTdGFydCA9IG5ldyBQb3NpdGlvbihhbmNob3JWaWV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBhbmNob3JWaWV3TWluQ29sdW1uKTtcblx0XHRcdHN0YXJ0Q29sdW1uQm91bmRhcnkgPSBjb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKGFuY2hvclZpZXdSYW5nZVN0YXJ0KS5jb2x1bW47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGFuY2hvciByYW5nZSBpcyBhbHdheXMgb24gYSBzaW5nbGUgbGluZVxuXHRcdGNvbnN0IGFuY2hvclN0YXJ0TGluZU51bWJlciA9IGFuY2hvclJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRsZXQgc2Vjb25kYXJ5UG9zaXRpb25Db2x1bW4gPSBhbmNob3JSYW5nZS5zdGFydENvbHVtbjtcblx0XHRsZXQgZm9yY2VTaG93QXRSYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IGhvdmVyUGFydCBvZiBob3ZlclBhcnRzKSB7XG5cdFx0XHRjb25zdCBob3ZlclBhcnRSYW5nZSA9IGhvdmVyUGFydC5yYW5nZTtcblx0XHRcdGNvbnN0IGhvdmVyUGFydFJhbmdlT25BbmNob3JTdGFydExpbmUgPSBob3ZlclBhcnRSYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGFuY2hvclN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGhvdmVyUGFydFJhbmdlT25BbmNob3JFbmRMaW5lID0gaG92ZXJQYXJ0UmFuZ2UuZW5kTGluZU51bWJlciA9PT0gYW5jaG9yU3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgaG92ZXJQYXJ0UmFuZ2VJc09uQW5jaG9yTGluZSA9IGhvdmVyUGFydFJhbmdlT25BbmNob3JTdGFydExpbmUgJiYgaG92ZXJQYXJ0UmFuZ2VPbkFuY2hvckVuZExpbmU7XG5cdFx0XHRpZiAoaG92ZXJQYXJ0UmFuZ2VJc09uQW5jaG9yTGluZSkge1xuXHRcdFx0XHQvLyB0aGlzIG1lc3NhZ2UgaGFzIGEgcmFuZ2UgdGhhdCBpcyBjb21wbGV0ZWx5IHNpdHRpbmcgb24gdGhlIGxpbmUgb2YgdGhlIGFuY2hvclxuXHRcdFx0XHRjb25zdCBob3ZlclBhcnRTdGFydENvbHVtbiA9IGhvdmVyUGFydFJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdFx0XHRjb25zdCBtaW5TZWNvbmRhcnlQb3NpdGlvbkNvbHVtbiA9IE1hdGgubWluKHNlY29uZGFyeVBvc2l0aW9uQ29sdW1uLCBob3ZlclBhcnRTdGFydENvbHVtbik7XG5cdFx0XHRcdHNlY29uZGFyeVBvc2l0aW9uQ29sdW1uID0gTWF0aC5tYXgobWluU2Vjb25kYXJ5UG9zaXRpb25Db2x1bW4sIHN0YXJ0Q29sdW1uQm91bmRhcnkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhvdmVyUGFydC5mb3JjZVNob3dBdFJhbmdlKSB7XG5cdFx0XHRcdGZvcmNlU2hvd0F0UmFuZ2UgPSBob3ZlclBhcnRSYW5nZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc2hvd0F0UG9zaXRpb246IFBvc2l0aW9uO1xuXHRcdGxldCBzaG93QXRTZWNvbmRhcnlQb3NpdGlvbjogUG9zaXRpb247XG5cdFx0aWYgKGZvcmNlU2hvd0F0UmFuZ2UpIHtcblx0XHRcdGNvbnN0IGZvcmNlU2hvd0F0UG9zaXRpb24gPSBmb3JjZVNob3dBdFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdHNob3dBdFBvc2l0aW9uID0gZm9yY2VTaG93QXRQb3NpdGlvbjtcblx0XHRcdHNob3dBdFNlY29uZGFyeVBvc2l0aW9uID0gZm9yY2VTaG93QXRQb3NpdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2hvd0F0UG9zaXRpb24gPSBhbmNob3JSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRzaG93QXRTZWNvbmRhcnlQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihhbmNob3JTdGFydExpbmVOdW1iZXIsIHNlY29uZGFyeVBvc2l0aW9uQ29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNob3dBdFBvc2l0aW9uLFxuXHRcdFx0c2hvd0F0U2Vjb25kYXJ5UG9zaXRpb24sXG5cdFx0fTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVJlbmRlcmVkQ29udGVudEhvdmVyUGFydCB7XG5cdC8qKlxuXHQgKiBUeXBlIG9mIHJlbmRlcmVkIHBhcnRcblx0ICovXG5cdHR5cGU6ICdob3ZlclBhcnQnO1xuXHQvKipcblx0ICogUGFydGljaXBhbnQgb2YgdGhlIHJlbmRlcmVkIGhvdmVyIHBhcnRcblx0ICovXG5cdHBhcnRpY2lwYW50OiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudDxJSG92ZXJQYXJ0Pjtcblx0LyoqXG5cdCAqIFRoZSByZW5kZXJlZCBob3ZlciBwYXJ0XG5cdCAqL1xuXHRob3ZlclBhcnQ6IElIb3ZlclBhcnQ7XG5cdC8qKlxuXHQgKiBUaGUgSFRNTCBlbGVtZW50IGNvbnRhaW5pbmcgdGhlIGhvdmVyIHN0YXR1cyBiYXIuXG5cdCAqL1xuXHRob3ZlckVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVJlbmRlcmVkQ29udGVudFN0YXR1c0JhciB7XG5cdC8qKlxuXHQgKiBUeXBlIG9mIHJlbmRlcmVkIHBhcnRcblx0ICovXG5cdHR5cGU6ICdzdGF0dXNCYXInO1xuXHQvKipcblx0ICogVGhlIEhUTUwgZWxlbWVudCBjb250YWluaW5nIHRoZSBob3ZlciBzdGF0dXMgYmFyLlxuXHQgKi9cblx0aG92ZXJFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0LyoqXG5cdCAqIFRoZSBhY3Rpb25zIG9mIHRoZSBob3ZlciBzdGF0dXMgYmFyLlxuXHQgKi9cblx0YWN0aW9uczogSG92ZXJBY3Rpb25bXTtcbn1cblxudHlwZSBJUmVuZGVyZWRDb250ZW50SG92ZXJQYXJ0T3JTdGF0dXNCYXIgPSBJUmVuZGVyZWRDb250ZW50SG92ZXJQYXJ0IHwgSVJlbmRlcmVkQ29udGVudFN0YXR1c0JhcjtcblxuY2xhc3MgUmVuZGVyZWRTdGF0dXNCYXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoZnJhZ21lbnQ6IERvY3VtZW50RnJhZ21lbnQsIHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c0JhcjogRWRpdG9ySG92ZXJTdGF0dXNCYXIpIHtcblx0XHRmcmFnbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9zdGF0dXNCYXIuaG92ZXJFbGVtZW50KTtcblx0fVxuXG5cdGdldCBob3ZlckVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0dXNCYXIuaG92ZXJFbGVtZW50O1xuXHR9XG5cblx0Z2V0IGFjdGlvbnMoKTogSG92ZXJBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXR1c0Jhci5hY3Rpb25zO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9zdGF0dXNCYXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFJlbmRlcmVkQ29udGVudEhvdmVyUGFydHMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfREVDT1JBVElPTl9PUFRJT05TID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdjb250ZW50LWhvdmVyLWhpZ2hsaWdodCcsXG5cdFx0Y2xhc3NOYW1lOiAnaG92ZXJIaWdobGlnaHQnXG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkUGFydHM6IElSZW5kZXJlZENvbnRlbnRIb3ZlclBhcnRPclN0YXR1c0JhcltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlclBhcnREaXNwb3NhYmxlcyA9IG5ldyBNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZnJhZ21lbnQ6IERvY3VtZW50RnJhZ21lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHQ6IElFZGl0b3JIb3ZlckNvbnRleHQ7XG5cblx0cHJpdmF0ZSBfbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50OiBNYXJrZG93bkhvdmVyUGFydGljaXBhbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbG9ySG92ZXJQYXJ0aWNpcGFudDogSG92ZXJDb2xvclBpY2tlclBhcnRpY2lwYW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb2N1c2VkSG92ZXJQYXJ0SW5kZXg6IG51bWJlciA9IC0xO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cGFydGljaXBhbnRzOiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudDxJSG92ZXJQYXJ0PltdLFxuXHRcdGhvdmVyUGFydHM6IElIb3ZlclBhcnRbXSxcblx0XHRjb250ZXh0OiBJRWRpdG9ySG92ZXJDb250ZXh0LFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy5fZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVuZGVyUGFydHMocGFydGljaXBhbnRzLCBob3ZlclBhcnRzLCBjb250ZXh0LCBrZXliaW5kaW5nU2VydmljZSwgdGhpcy5faG92ZXJTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnNPblJlbmRlcmVkUGFydHMoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY3JlYXRlRWRpdG9yRGVjb3JhdGlvbnMoZWRpdG9yLCBob3ZlclBhcnRzKSk7XG5cdFx0dGhpcy5fdXBkYXRlTWFya2Rvd25BbmRDb2xvclBhcnRpY2lwYW50SW5mbyhwYXJ0aWNpcGFudHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRWRpdG9yRGVjb3JhdGlvbnMoZWRpdG9yOiBJQ29kZUVkaXRvciwgaG92ZXJQYXJ0czogSUhvdmVyUGFydFtdKTogSURpc3Bvc2FibGUge1xuXHRcdGlmIChob3ZlclBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cdFx0bGV0IGhpZ2hsaWdodFJhbmdlID0gaG92ZXJQYXJ0c1swXS5yYW5nZTtcblx0XHRmb3IgKGNvbnN0IGhvdmVyUGFydCBvZiBob3ZlclBhcnRzKSB7XG5cdFx0XHRjb25zdCBob3ZlclBhcnRSYW5nZSA9IGhvdmVyUGFydC5yYW5nZTtcblx0XHRcdGhpZ2hsaWdodFJhbmdlID0gUmFuZ2UucGx1c1JhbmdlKGhpZ2hsaWdodFJhbmdlLCBob3ZlclBhcnRSYW5nZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGhpZ2hsaWdodERlY29yYXRpb24gPSBlZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0aGlnaGxpZ2h0RGVjb3JhdGlvbi5zZXQoW3tcblx0XHRcdHJhbmdlOiBoaWdobGlnaHRSYW5nZSxcblx0XHRcdG9wdGlvbnM6IFJlbmRlcmVkQ29udGVudEhvdmVyUGFydHMuX0RFQ09SQVRJT05fT1BUSU9OU1xuXHRcdH1dKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGhpZ2hsaWdodERlY29yYXRpb24uY2xlYXIoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclBhcnRzKHBhcnRpY2lwYW50czogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8SUhvdmVyUGFydD5bXSwgaG92ZXJQYXJ0czogSUhvdmVyUGFydFtdLCBob3ZlckNvbnRleHQ6IElFZGl0b3JIb3ZlckNvbnRleHQsIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdGF0dXNCYXIgPSBuZXcgRWRpdG9ySG92ZXJTdGF0dXNCYXIoa2V5YmluZGluZ1NlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0Y29uc3QgaG92ZXJSZW5kZXJpbmdDb250ZXh0OiBJRWRpdG9ySG92ZXJSZW5kZXJDb250ZXh0ID0ge1xuXHRcdFx0ZnJhZ21lbnQ6IHRoaXMuX2ZyYWdtZW50LFxuXHRcdFx0c3RhdHVzQmFyLFxuXHRcdFx0Li4uaG92ZXJDb250ZXh0XG5cdFx0fTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdHVzQmFyKTtcblx0XHRmb3IgKGNvbnN0IHBhcnRpY2lwYW50IG9mIHBhcnRpY2lwYW50cykge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRIb3ZlclBhcnRzID0gdGhpcy5fcmVuZGVySG92ZXJQYXJ0c0ZvclBhcnRpY2lwYW50KGhvdmVyUGFydHMsIHBhcnRpY2lwYW50LCBob3ZlclJlbmRlcmluZ0NvbnRleHQpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkSG92ZXJQYXJ0cyk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0IG9mIHJlbmRlcmVkSG92ZXJQYXJ0cy5yZW5kZXJlZEhvdmVyUGFydHMpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyZWRQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnaG92ZXJQYXJ0Jyxcblx0XHRcdFx0XHRwYXJ0aWNpcGFudCxcblx0XHRcdFx0XHRob3ZlclBhcnQ6IHJlbmRlcmVkSG92ZXJQYXJ0LmhvdmVyUGFydCxcblx0XHRcdFx0XHRob3ZlckVsZW1lbnQ6IHJlbmRlcmVkSG92ZXJQYXJ0LmhvdmVyRWxlbWVudCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlcmVkU3RhdHVzQmFyID0gdGhpcy5fcmVuZGVyU3RhdHVzQmFyKHRoaXMuX2ZyYWdtZW50LCBzdGF0dXNCYXIpO1xuXHRcdGlmIChyZW5kZXJlZFN0YXR1c0Jhcikge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkU3RhdHVzQmFyKTtcblx0XHRcdHRoaXMuX3JlbmRlcmVkUGFydHMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdzdGF0dXNCYXInLFxuXHRcdFx0XHRob3ZlckVsZW1lbnQ6IHJlbmRlcmVkU3RhdHVzQmFyLmhvdmVyRWxlbWVudCxcblx0XHRcdFx0YWN0aW9uczogcmVuZGVyZWRTdGF0dXNCYXIuYWN0aW9ucyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJIb3ZlclBhcnRzRm9yUGFydGljaXBhbnQoaG92ZXJQYXJ0czogSUhvdmVyUGFydFtdLCBwYXJ0aWNpcGFudDogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8SUhvdmVyUGFydD4sIGhvdmVyUmVuZGVyaW5nQ29udGV4dDogSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCk6IElSZW5kZXJlZEhvdmVyUGFydHM8SUhvdmVyUGFydD4ge1xuXHRcdGNvbnN0IGhvdmVyUGFydHNGb3JQYXJ0aWNpcGFudCA9IGhvdmVyUGFydHMuZmlsdGVyKGhvdmVyUGFydCA9PiBob3ZlclBhcnQub3duZXIgPT09IHBhcnRpY2lwYW50KTtcblx0XHRjb25zdCBoYXNIb3ZlclBhcnRzRm9yUGFydGljaXBhbnQgPSBob3ZlclBhcnRzRm9yUGFydGljaXBhbnQubGVuZ3RoID4gMDtcblx0XHRpZiAoIWhhc0hvdmVyUGFydHNGb3JQYXJ0aWNpcGFudCkge1xuXHRcdFx0cmV0dXJuIG5ldyBSZW5kZXJlZEhvdmVyUGFydHMoW10pO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFydGljaXBhbnQucmVuZGVySG92ZXJQYXJ0cyhob3ZlclJlbmRlcmluZ0NvbnRleHQsIGhvdmVyUGFydHNGb3JQYXJ0aWNpcGFudCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGF0dXNCYXIoZnJhZ21lbnQ6IERvY3VtZW50RnJhZ21lbnQsIHN0YXR1c0JhcjogRWRpdG9ySG92ZXJTdGF0dXNCYXIpOiBSZW5kZXJlZFN0YXR1c0JhciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFzdGF0dXNCYXIuaGFzQ29udGVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSZW5kZXJlZFN0YXR1c0JhcihmcmFnbWVudCwgc3RhdHVzQmFyKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzT25SZW5kZXJlZFBhcnRzKCk6IElEaXNwb3NhYmxlIHtcblx0XHQvLyBDcmVhdGUgcGVyLXBhcnQgZGlzcG9zYWJsZXMgc28gdGhhdCB3aGVuIGFuIGluZGl2aWR1YWwgcmVuZGVyZWQgcGFydCBpc1xuXHRcdC8vIHVwZGF0ZWQgd2UgY2FuIGRpc3Bvc2UgaXRzIGxpc3RlbmVycyBhbmQgY29weSBidXR0b24gd2l0aG91dCBhZmZlY3Rpbmdcblx0XHQvLyB0aGUgb3RoZXJzLlxuXHRcdHRoaXMuX3JlbmRlcmVkUGFydHMuZm9yRWFjaCgocmVuZGVyZWRQYXJ0OiBJUmVuZGVyZWRDb250ZW50SG92ZXJQYXJ0T3JTdGF0dXNCYXIsIGluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdHRoaXMuX2NyZWF0ZUxpc3RlbmVyc0ZvclBhcnQoaW5kZXgsIHJlbmRlcmVkUGFydCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5fcGVyUGFydERpc3Bvc2FibGVzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcGVyUGFydERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVMaXN0ZW5lcnNGb3JQYXJ0KGluZGV4OiBudW1iZXIsIHJlbmRlcmVkUGFydDogSVJlbmRlcmVkQ29udGVudEhvdmVyUGFydE9yU3RhdHVzQmFyKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFydERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSByZW5kZXJlZFBhcnQuaG92ZXJFbGVtZW50O1xuXHRcdGVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHBhcnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLkZPQ1VTX0lOLCAoZXZlbnQ6IEV2ZW50KSA9PiB7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX2ZvY3VzZWRIb3ZlclBhcnRJbmRleCA9IGluZGV4O1xuXHRcdH0pKTtcblx0XHRwYXJ0RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5GT0NVU19PVVQsIChldmVudDogRXZlbnQpID0+IHtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fZm9jdXNlZEhvdmVyUGFydEluZGV4ID0gLTE7XG5cdFx0fSkpO1xuXHRcdC8vIEFkZCBjb3B5IGJ1dHRvbiBmb3IgbWFya2VyIGhvdmVyc1xuXHRcdGlmIChyZW5kZXJlZFBhcnQudHlwZSA9PT0gJ2hvdmVyUGFydCcgJiYgIShyZW5kZXJlZFBhcnQuaG92ZXJQYXJ0IGluc3RhbmNlb2YgQ29sb3JIb3ZlcikgJiYgIXJlbmRlcmVkUGFydC5wYXJ0aWNpcGFudC5oaWRlQ29weUJ1dHRvbikge1xuXHRcdFx0cGFydERpc3Bvc2FibGVzLmFkZChuZXcgSG92ZXJDb3B5QnV0dG9uKFxuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHQoKSA9PiByZW5kZXJlZFBhcnQucGFydGljaXBhbnQuZ2V0QWNjZXNzaWJsZUNvbnRlbnQocmVuZGVyZWRQYXJ0LmhvdmVyUGFydCksXG5cdFx0XHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX2hvdmVyU2VydmljZVxuXHRcdFx0KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlclBhcnREaXNwb3NhYmxlcy5zZXQoaW5kZXgsIHBhcnREaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVNYXJrZG93bkFuZENvbG9yUGFydGljaXBhbnRJbmZvKHBhcnRpY2lwYW50czogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8SUhvdmVyUGFydD5bXSkge1xuXHRcdGNvbnN0IG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCA9IHBhcnRpY2lwYW50cy5maW5kKHAgPT4ge1xuXHRcdFx0cmV0dXJuIChwIGluc3RhbmNlb2YgTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50KSAmJiAhKHAgaW5zdGFuY2VvZiBJbmxheUhpbnRzSG92ZXIpO1xuXHRcdH0pO1xuXHRcdGlmIChtYXJrZG93bkhvdmVyUGFydGljaXBhbnQpIHtcblx0XHRcdHRoaXMuX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCA9IG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCBhcyBNYXJrZG93bkhvdmVyUGFydGljaXBhbnQ7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbG9ySG92ZXJQYXJ0aWNpcGFudCA9IHBhcnRpY2lwYW50cy5maW5kKHAgPT4gcCBpbnN0YW5jZW9mIEhvdmVyQ29sb3JQaWNrZXJQYXJ0aWNpcGFudCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNIb3ZlclBhcnRXaXRoSW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5fcmVuZGVyZWRQYXJ0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyZWRQYXJ0c1tpbmRleF0uaG92ZXJFbGVtZW50LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWNjZXNzaWJsZUNvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcmVuZGVyZWRQYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29udGVudC5wdXNoKHRoaXMuZ2V0QWNjZXNzaWJsZUhvdmVyQ29udGVudEF0SW5kZXgoaSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGVudC5qb2luKCdcXG5cXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlSG92ZXJDb250ZW50QXRJbmRleChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCByZW5kZXJlZFBhcnQgPSB0aGlzLl9yZW5kZXJlZFBhcnRzW2luZGV4XTtcblx0XHRpZiAoIXJlbmRlcmVkUGFydCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAocmVuZGVyZWRQYXJ0LnR5cGUgPT09ICdzdGF0dXNCYXInKSB7XG5cdFx0XHRjb25zdCBzdGF0dXNCYXJEZXNjcmlwdGlvbiA9IFtsb2NhbGl6ZSgnaG92ZXJBY2Nlc3NpYmlsaXR5U3RhdHVzQmFyJywgXCJUaGlzIGlzIGEgaG92ZXIgc3RhdHVzIGJhci5cIildO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcmVuZGVyZWRQYXJ0LmFjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGFjdGlvbi5hY3Rpb25LZXliaW5kaW5nTGFiZWw7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0c3RhdHVzQmFyRGVzY3JpcHRpb24ucHVzaChsb2NhbGl6ZSgnaG92ZXJBY2Nlc3NpYmlsaXR5U3RhdHVzQmFyQWN0aW9uV2l0aEtleWJpbmRpbmcnLCBcIkl0IGhhcyBhbiBhY3Rpb24gd2l0aCBsYWJlbCB7MH0gYW5kIGtleWJpbmRpbmcgezF9LlwiLCBhY3Rpb24uYWN0aW9uTGFiZWwsIGtleWJpbmRpbmcpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdGF0dXNCYXJEZXNjcmlwdGlvbi5wdXNoKGxvY2FsaXplKCdob3ZlckFjY2Vzc2liaWxpdHlTdGF0dXNCYXJBY3Rpb25XaXRob3V0S2V5YmluZGluZycsIFwiSXQgaGFzIGFuIGFjdGlvbiB3aXRoIGxhYmVsIHswfS5cIiwgYWN0aW9uLmFjdGlvbkxhYmVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBzdGF0dXNCYXJEZXNjcmlwdGlvbi5qb2luKCdcXG4nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlbmRlcmVkUGFydC5wYXJ0aWNpcGFudC5nZXRBY2Nlc3NpYmxlQ29udGVudChyZW5kZXJlZFBhcnQuaG92ZXJQYXJ0KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24sIGluZGV4OiBudW1iZXIsIGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCByYW5nZU9mSW5kaWNlc1RvVXBkYXRlOiBJT2Zmc2V0UmFuZ2U7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdHJhbmdlT2ZJbmRpY2VzVG9VcGRhdGUgPSB7IHN0YXJ0OiBpbmRleCwgZW5kRXhjbHVzaXZlOiBpbmRleCArIDEgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmFuZ2VPZkluZGljZXNUb1VwZGF0ZSA9IHRoaXMuX2ZpbmRSYW5nZU9mTWFya2Rvd25Ib3ZlclBhcnRzKHRoaXMuX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSByYW5nZU9mSW5kaWNlc1RvVXBkYXRlLnN0YXJ0OyBpIDwgcmFuZ2VPZkluZGljZXNUb1VwZGF0ZS5lbmRFeGNsdXNpdmU7IGkrKykge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZE1hcmtkb3duSG92ZXJJbmRleCA9IHRoaXMuX25vcm1hbGl6ZWRJbmRleFRvTWFya2Rvd25Ib3ZlckluZGV4UmFuZ2UodGhpcy5fbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LCBpKTtcblx0XHRcdGlmIChub3JtYWxpemVkTWFya2Rvd25Ib3ZlckluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZW5kZXJlZFBhcnQgPSBhd2FpdCB0aGlzLl9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQudXBkYXRlTWFya2Rvd25Ib3ZlclZlcmJvc2l0eUxldmVsKGFjdGlvbiwgbm9ybWFsaXplZE1hcmtkb3duSG92ZXJJbmRleCk7XG5cdFx0XHRpZiAoIXJlbmRlcmVkUGFydCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIERpc3Bvc2UgYW55IGxpc3RlbmVycy9jb3B5IGJ1dHRvbiBmb3IgdGhlIHByZXZpb3VzIHBhcnQgYXQgdGhpcyBpbmRleFxuXHRcdFx0Y29uc3QgcHJldkRpc3Bvc2FibGUgPSB0aGlzLl9wZXJQYXJ0RGlzcG9zYWJsZXMuZ2V0KGkpO1xuXHRcdFx0aWYgKHByZXZEaXNwb3NhYmxlKSB7XG5cdFx0XHRcdHByZXZEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcGVyUGFydERpc3Bvc2FibGVzLmRlbGV0ZShpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbmRlcmVkUGFydHNbaV0gPSB7XG5cdFx0XHRcdHR5cGU6ICdob3ZlclBhcnQnLFxuXHRcdFx0XHRwYXJ0aWNpcGFudDogdGhpcy5fbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LFxuXHRcdFx0XHRob3ZlclBhcnQ6IHJlbmRlcmVkUGFydC5ob3ZlclBhcnQsXG5cdFx0XHRcdGhvdmVyRWxlbWVudDogcmVuZGVyZWRQYXJ0LmhvdmVyRWxlbWVudCxcblx0XHRcdH07XG5cdFx0XHQvLyBSZWNyZWF0ZSBsaXN0ZW5lcnMgYW5kIGNvcHkgYnV0dG9uIGZvciB0aGUgdXBkYXRlZCBwYXJ0LlxuXHRcdFx0dGhpcy5fY3JlYXRlTGlzdGVuZXJzRm9yUGFydChpLCB0aGlzLl9yZW5kZXJlZFBhcnRzW2ldKTtcblx0XHR9XG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KGluZGV4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fY29udGV4dC5vbkNvbnRlbnRzQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHVibGljIGRvZXNIb3ZlckF0SW5kZXhTdXBwb3J0VmVyYm9zaXR5QWN0aW9uKGluZGV4OiBudW1iZXIsIGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBub3JtYWxpemVkTWFya2Rvd25Ib3ZlckluZGV4ID0gdGhpcy5fbm9ybWFsaXplZEluZGV4VG9NYXJrZG93bkhvdmVySW5kZXhSYW5nZSh0aGlzLl9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQsIGluZGV4KTtcblx0XHRpZiAobm9ybWFsaXplZE1hcmtkb3duSG92ZXJJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQuZG9lc01hcmtkb3duSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihub3JtYWxpemVkTWFya2Rvd25Ib3ZlckluZGV4LCBhY3Rpb24pO1xuXHR9XG5cblx0cHVibGljIGlzQ29sb3JQaWNrZXJWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb2xvckhvdmVyUGFydGljaXBhbnQ/LmlzQ29sb3JQaWNrZXJWaXNpYmxlKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9ub3JtYWxpemVkSW5kZXhUb01hcmtkb3duSG92ZXJJbmRleFJhbmdlKG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudDogTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LCBpbmRleDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZW5kZXJlZFBhcnQgPSB0aGlzLl9yZW5kZXJlZFBhcnRzW2luZGV4XTtcblx0XHRpZiAoIXJlbmRlcmVkUGFydCB8fCByZW5kZXJlZFBhcnQudHlwZSAhPT0gJ2hvdmVyUGFydCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGlzSG92ZXJQYXJ0TWFya2Rvd25Ib3ZlciA9IHJlbmRlcmVkUGFydC5wYXJ0aWNpcGFudCA9PT0gbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50O1xuXHRcdGlmICghaXNIb3ZlclBhcnRNYXJrZG93bkhvdmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBmaXJzdEluZGV4T2ZNYXJrZG93bkhvdmVycyA9IHRoaXMuX3JlbmRlcmVkUGFydHMuZmluZEluZGV4KHJlbmRlcmVkUGFydCA9PlxuXHRcdFx0cmVuZGVyZWRQYXJ0LnR5cGUgPT09ICdob3ZlclBhcnQnXG5cdFx0XHQmJiByZW5kZXJlZFBhcnQucGFydGljaXBhbnQgPT09IG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudFxuXHRcdCk7XG5cdFx0aWYgKGZpcnN0SW5kZXhPZk1hcmtkb3duSG92ZXJzID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5kZXggLSBmaXJzdEluZGV4T2ZNYXJrZG93bkhvdmVycztcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRSYW5nZU9mTWFya2Rvd25Ib3ZlclBhcnRzKG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudDogTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50KTogSU9mZnNldFJhbmdlIHtcblx0XHRjb25zdCBjb3BpZWRSZW5kZXJlZFBhcnRzID0gdGhpcy5fcmVuZGVyZWRQYXJ0cy5zbGljZSgpO1xuXHRcdGNvbnN0IGZpcnN0SW5kZXhPZk1hcmtkb3duSG92ZXJzID0gY29waWVkUmVuZGVyZWRQYXJ0cy5maW5kSW5kZXgocmVuZGVyZWRQYXJ0ID0+IHJlbmRlcmVkUGFydC50eXBlID09PSAnaG92ZXJQYXJ0JyAmJiByZW5kZXJlZFBhcnQucGFydGljaXBhbnQgPT09IG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCk7XG5cdFx0Y29uc3QgaW52ZXJzZWRMYXN0SW5kZXhPZk1hcmtkb3duSG92ZXJzID0gY29waWVkUmVuZGVyZWRQYXJ0cy5yZXZlcnNlKCkuZmluZEluZGV4KHJlbmRlcmVkUGFydCA9PiByZW5kZXJlZFBhcnQudHlwZSA9PT0gJ2hvdmVyUGFydCcgJiYgcmVuZGVyZWRQYXJ0LnBhcnRpY2lwYW50ID09PSBtYXJrZG93bkhvdmVyUGFydGljaXBhbnQpO1xuXHRcdGNvbnN0IGxhc3RJbmRleE9mTWFya2Rvd25Ib3ZlcnMgPSBpbnZlcnNlZExhc3RJbmRleE9mTWFya2Rvd25Ib3ZlcnMgPj0gMCA/IGNvcGllZFJlbmRlcmVkUGFydHMubGVuZ3RoIC0gaW52ZXJzZWRMYXN0SW5kZXhPZk1hcmtkb3duSG92ZXJzIDogaW52ZXJzZWRMYXN0SW5kZXhPZk1hcmtkb3duSG92ZXJzO1xuXHRcdHJldHVybiB7IHN0YXJ0OiBmaXJzdEluZGV4T2ZNYXJrZG93bkhvdmVycywgZW5kRXhjbHVzaXZlOiBsYXN0SW5kZXhPZk1hcmtkb3duSG92ZXJzICsgMSB9O1xuXHR9XG5cblx0cHVibGljIGdldCBkb21Ob2RlKCk6IERvY3VtZW50RnJhZ21lbnQge1xuXHRcdHJldHVybiB0aGlzLl9mcmFnbWVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZUhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9mcmFnbWVudC5oYXNDaGlsZE5vZGVzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGZvY3VzZWRIb3ZlclBhcnRJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9mb2N1c2VkSG92ZXJQYXJ0SW5kZXg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhvdmVyUGFydHNDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZFBhcnRzLmxlbmd0aDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFtSCwwQkFBMEI7QUFDN0ksU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBRXRCLFlBQVksU0FBUztBQUVyQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFlBQVksbUNBQW1DO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMseUJBQXlCO0FBRTNCLElBQU0sdUJBQU4sY0FBbUMsV0FBVztBQUFBLEVBY3BELFlBQ0MsUUFDQSxhQUNBLGNBQ0EsU0FDb0IsbUJBQ0wsY0FDSSxrQkFDbEI7QUFDRCxVQUFNO0FBQ04sVUFBTSxRQUFRLFlBQVk7QUFDMUIsU0FBSyxzQkFBc0IsS0FBSyxVQUFVLElBQUk7QUFBQSxNQUM3QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sOEJBQThCLFlBQVk7QUFDaEQsVUFBTSxTQUFTLDRCQUE0QjtBQUMzQyxVQUFNLEVBQUUsZ0JBQWdCLHdCQUF3QixJQUFJLHFCQUFxQixzQkFBc0IsUUFBUSxPQUFPLE9BQU8sS0FBSztBQUMxSCxTQUFLLDRCQUE0QixNQUFNLEtBQUssT0FBSyxFQUFFLGVBQWU7QUFDbEUsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSywwQkFBMEI7QUFDL0IsU0FBSyxtQkFBbUIsT0FBTztBQUMvQixTQUFLLG1CQUFtQixPQUFPO0FBQy9CLFNBQUssY0FBYyw0QkFBNEI7QUFDL0MsU0FBSyxTQUFTLDRCQUE0QjtBQUFBLEVBQzNDO0FBQUEsRUFFQSxJQUFXLFVBQTRCO0FBQ3RDLFdBQU8sS0FBSyxvQkFBb0I7QUFBQSxFQUNqQztBQUFBLEVBRUEsSUFBVyxxQkFBOEI7QUFDeEMsV0FBTyxLQUFLLG9CQUFvQjtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxJQUFXLHdCQUFnQztBQUMxQyxXQUFPLEtBQUssb0JBQW9CO0FBQUEsRUFDakM7QUFBQSxFQUVBLElBQVcsa0JBQTBCO0FBQ3BDLFdBQU8sS0FBSyxvQkFBb0I7QUFBQSxFQUNqQztBQUFBLEVBRU8sd0JBQXdCLE9BQXFCO0FBQ25ELFNBQUssb0JBQW9CLHdCQUF3QixLQUFLO0FBQUEsRUFDdkQ7QUFBQSxFQUVPLDZCQUFxQztBQUMzQyxXQUFPLEtBQUssb0JBQW9CLHFCQUFxQjtBQUFBLEVBQ3REO0FBQUEsRUFFTyxrQ0FBa0MsT0FBdUI7QUFDL0QsV0FBTyxLQUFLLG9CQUFvQixpQ0FBaUMsS0FBSztBQUFBLEVBQ3ZFO0FBQUEsRUFFQSxNQUFhLDBCQUEwQixRQUE4QixPQUFlLE9BQWdDO0FBQ25ILFNBQUssb0JBQW9CLDBCQUEwQixRQUFRLE9BQU8sS0FBSztBQUFBLEVBQ3hFO0FBQUEsRUFFTyx1Q0FBdUMsT0FBZSxRQUF1QztBQUNuRyxXQUFPLEtBQUssb0JBQW9CLHVDQUF1QyxPQUFPLE1BQU07QUFBQSxFQUNyRjtBQUFBLEVBRU8sdUJBQWdDO0FBQ3RDLFdBQU8sS0FBSyxvQkFBb0IscUJBQXFCO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLE9BQWMsc0JBQXNCLFFBQXFCLGFBQW9CLFlBQTJGO0FBRXZLLFFBQUksc0JBQXNCO0FBQzFCLFFBQUksT0FBTyxTQUFTLEdBQUc7QUFFdEIsWUFBTSxZQUFZLE9BQU8sY0FBYztBQUN2QyxZQUFNLHVCQUF1QixVQUFVO0FBQ3ZDLFlBQU0sa0JBQWtCLHFCQUFxQiw2QkFBNkIsV0FBVztBQUNyRixZQUFNLHNCQUFzQixVQUFVLGlCQUFpQixnQkFBZ0IsZUFBZTtBQUN0RixZQUFNLHVCQUF1QixJQUFJLFNBQVMsZ0JBQWdCLGlCQUFpQixtQkFBbUI7QUFDOUYsNEJBQXNCLHFCQUFxQixtQ0FBbUMsb0JBQW9CLEVBQUU7QUFBQSxJQUNyRztBQUdBLFVBQU0sd0JBQXdCLFlBQVk7QUFDMUMsUUFBSSwwQkFBMEIsWUFBWTtBQUMxQyxRQUFJO0FBRUosZUFBVyxhQUFhLFlBQVk7QUFDbkMsWUFBTSxpQkFBaUIsVUFBVTtBQUNqQyxZQUFNLGtDQUFrQyxlQUFlLG9CQUFvQjtBQUMzRSxZQUFNLGdDQUFnQyxlQUFlLGtCQUFrQjtBQUN2RSxZQUFNLCtCQUErQixtQ0FBbUM7QUFDeEUsVUFBSSw4QkFBOEI7QUFFakMsY0FBTSx1QkFBdUIsZUFBZTtBQUM1QyxjQUFNLDZCQUE2QixLQUFLLElBQUkseUJBQXlCLG9CQUFvQjtBQUN6RixrQ0FBMEIsS0FBSyxJQUFJLDRCQUE0QixtQkFBbUI7QUFBQSxNQUNuRjtBQUNBLFVBQUksVUFBVSxrQkFBa0I7QUFDL0IsMkJBQW1CO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLGtCQUFrQjtBQUNyQixZQUFNLHNCQUFzQixpQkFBaUIsaUJBQWlCO0FBQzlELHVCQUFpQjtBQUNqQixnQ0FBMEI7QUFBQSxJQUMzQixPQUFPO0FBQ04sdUJBQWlCLFlBQVksaUJBQWlCO0FBQzlDLGdDQUEwQixJQUFJLFNBQVMsdUJBQXVCLHVCQUF1QjtBQUFBLElBQ3RGO0FBQ0EsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXZJYSx1QkFBTjtBQUFBLEVBbUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXJCVTtBQTZLYixNQUFNLGtCQUF5QztBQUFBLEVBRTlDLFlBQVksVUFBNkMsWUFBa0M7QUFBbEM7QUFDeEQsYUFBUyxZQUFZLEtBQUssV0FBVyxZQUFZO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLElBQUksZUFBNEI7QUFDL0IsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUN4QjtBQUFBLEVBRUEsSUFBSSxVQUF5QjtBQUM1QixXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxVQUFVO0FBQ1QsU0FBSyxXQUFXLFFBQVE7QUFBQSxFQUN6QjtBQUNEO0FBRUEsSUFBTSw0QkFBTixjQUF3QyxXQUFXO0FBQUEsRUFnQmxELFlBQ0MsUUFDQSxjQUNBLFlBQ0EsU0FDb0IsbUJBQ1ksZUFDSSxtQkFDbkM7QUFDRCxVQUFNO0FBSDBCO0FBQ0k7QUFoQnJDLFNBQWlCLGlCQUF5RCxDQUFDO0FBQzNFLFNBQWlCLHNCQUFzQixvQkFBSSxJQUF5QjtBQU1wRSxTQUFRLHlCQUFpQztBQVl4QyxTQUFLLFdBQVc7QUFDaEIsU0FBSyxZQUFZLFNBQVMsdUJBQXVCO0FBQ2pELFNBQUssVUFBVSxLQUFLLGFBQWEsY0FBYyxZQUFZLFNBQVMsbUJBQW1CLEtBQUssYUFBYSxDQUFDO0FBQzFHLFNBQUssVUFBVSxLQUFLLGtDQUFrQyxDQUFDO0FBQ3ZELFNBQUssVUFBVSxLQUFLLHlCQUF5QixRQUFRLFVBQVUsQ0FBQztBQUNoRSxTQUFLLHVDQUF1QyxZQUFZO0FBQUEsRUFDekQ7QUFBQSxFQUVRLHlCQUF5QixRQUFxQixZQUF1QztBQUM1RixRQUFJLFdBQVcsV0FBVyxHQUFHO0FBQzVCLGFBQU8sV0FBVztBQUFBLElBQ25CO0FBQ0EsUUFBSSxpQkFBaUIsV0FBVyxDQUFDLEVBQUU7QUFDbkMsZUFBVyxhQUFhLFlBQVk7QUFDbkMsWUFBTSxpQkFBaUIsVUFBVTtBQUNqQyx1QkFBaUIsTUFBTSxVQUFVLGdCQUFnQixjQUFjO0FBQUEsSUFDaEU7QUFDQSxVQUFNLHNCQUFzQixPQUFPLDRCQUE0QjtBQUMvRCx3QkFBb0IsSUFBSSxDQUFDO0FBQUEsTUFDeEIsT0FBTztBQUFBLE1BQ1AsU0FBUywwQkFBMEI7QUFBQSxJQUNwQyxDQUFDLENBQUM7QUFDRixXQUFPLGFBQWEsTUFBTTtBQUN6QiwwQkFBb0IsTUFBTTtBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxhQUFhLGNBQXFELFlBQTBCLGNBQW1DLG1CQUF1QyxjQUEwQztBQUN2TixVQUFNLFlBQVksSUFBSSxxQkFBcUIsbUJBQW1CLFlBQVk7QUFDMUUsVUFBTSx3QkFBbUQ7QUFBQSxNQUN4RCxVQUFVLEtBQUs7QUFBQSxNQUNmO0FBQUEsTUFDQSxHQUFHO0FBQUEsSUFDSjtBQUNBLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxnQkFBWSxJQUFJLFNBQVM7QUFDekIsZUFBVyxlQUFlLGNBQWM7QUFDdkMsWUFBTSxxQkFBcUIsS0FBSyxnQ0FBZ0MsWUFBWSxhQUFhLHFCQUFxQjtBQUM5RyxrQkFBWSxJQUFJLGtCQUFrQjtBQUNsQyxpQkFBVyxxQkFBcUIsbUJBQW1CLG9CQUFvQjtBQUN0RSxhQUFLLGVBQWUsS0FBSztBQUFBLFVBQ3hCLE1BQU07QUFBQSxVQUNOO0FBQUEsVUFDQSxXQUFXLGtCQUFrQjtBQUFBLFVBQzdCLGNBQWMsa0JBQWtCO0FBQUEsUUFDakMsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsVUFBTSxvQkFBb0IsS0FBSyxpQkFBaUIsS0FBSyxXQUFXLFNBQVM7QUFDekUsUUFBSSxtQkFBbUI7QUFDdEIsa0JBQVksSUFBSSxpQkFBaUI7QUFDakMsV0FBSyxlQUFlLEtBQUs7QUFBQSxRQUN4QixNQUFNO0FBQUEsUUFDTixjQUFjLGtCQUFrQjtBQUFBLFFBQ2hDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0NBQWdDLFlBQTBCLGFBQWtELHVCQUFtRjtBQUN0TSxVQUFNLDJCQUEyQixXQUFXLE9BQU8sZUFBYSxVQUFVLFVBQVUsV0FBVztBQUMvRixVQUFNLDhCQUE4Qix5QkFBeUIsU0FBUztBQUN0RSxRQUFJLENBQUMsNkJBQTZCO0FBQ2pDLGFBQU8sSUFBSSxtQkFBbUIsQ0FBQyxDQUFDO0FBQUEsSUFDakM7QUFDQSxXQUFPLFlBQVksaUJBQWlCLHVCQUF1Qix3QkFBd0I7QUFBQSxFQUNwRjtBQUFBLEVBRVEsaUJBQWlCLFVBQTRCLFdBQWdFO0FBQ3BILFFBQUksQ0FBQyxVQUFVLFlBQVk7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLElBQUksa0JBQWtCLFVBQVUsU0FBUztBQUFBLEVBQ2pEO0FBQUEsRUFFUSxvQ0FBaUQ7QUFJeEQsU0FBSyxlQUFlLFFBQVEsQ0FBQyxjQUFvRCxVQUFrQjtBQUNsRyxXQUFLLHdCQUF3QixPQUFPLFlBQVk7QUFBQSxJQUNqRCxDQUFDO0FBQ0QsV0FBTyxhQUFhLE1BQU07QUFDekIsaUJBQVcsS0FBSyxLQUFLLG9CQUFvQixPQUFPLEdBQUc7QUFDbEQsVUFBRSxRQUFRO0FBQUEsTUFDWDtBQUNBLFdBQUssb0JBQW9CLE1BQU07QUFBQSxJQUNoQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsd0JBQXdCLE9BQWUsY0FBMEQ7QUFDeEcsVUFBTSxrQkFBa0IsSUFBSSxnQkFBZ0I7QUFDNUMsVUFBTSxVQUFVLGFBQWE7QUFDN0IsWUFBUSxXQUFXO0FBQ25CLG9CQUFnQixJQUFJLElBQUksc0JBQXNCLFNBQVMsSUFBSSxVQUFVLFVBQVUsQ0FBQyxVQUFpQjtBQUNoRyxZQUFNLGdCQUFnQjtBQUN0QixXQUFLLHlCQUF5QjtBQUFBLElBQy9CLENBQUMsQ0FBQztBQUNGLG9CQUFnQixJQUFJLElBQUksc0JBQXNCLFNBQVMsSUFBSSxVQUFVLFdBQVcsQ0FBQyxVQUFpQjtBQUNqRyxZQUFNLGdCQUFnQjtBQUN0QixXQUFLLHlCQUF5QjtBQUFBLElBQy9CLENBQUMsQ0FBQztBQUVGLFFBQUksYUFBYSxTQUFTLGVBQWUsRUFBRSxhQUFhLHFCQUFxQixlQUFlLENBQUMsYUFBYSxZQUFZLGdCQUFnQjtBQUNySSxzQkFBZ0IsSUFBSSxJQUFJO0FBQUEsUUFDdkI7QUFBQSxRQUNBLE1BQU0sYUFBYSxZQUFZLHFCQUFxQixhQUFhLFNBQVM7QUFBQSxRQUMxRSxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDTixDQUFDO0FBQUEsSUFDRjtBQUNBLFNBQUssb0JBQW9CLElBQUksT0FBTyxlQUFlO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLHVDQUF1QyxjQUFxRDtBQUNuRyxVQUFNLDJCQUEyQixhQUFhLEtBQUssT0FBSztBQUN2RCxhQUFRLGFBQWEsNEJBQTZCLEVBQUUsYUFBYTtBQUFBLElBQ2xFLENBQUM7QUFDRCxRQUFJLDBCQUEwQjtBQUM3QixXQUFLLDRCQUE0QjtBQUFBLElBQ2xDO0FBQ0EsU0FBSyx5QkFBeUIsYUFBYSxLQUFLLE9BQUssYUFBYSwyQkFBMkI7QUFBQSxFQUM5RjtBQUFBLEVBRU8sd0JBQXdCLE9BQXFCO0FBQ25ELFFBQUksUUFBUSxLQUFLLFNBQVMsS0FBSyxlQUFlLFFBQVE7QUFDckQ7QUFBQSxJQUNEO0FBQ0EsU0FBSyxlQUFlLEtBQUssRUFBRSxhQUFhLE1BQU07QUFBQSxFQUMvQztBQUFBLEVBRU8sdUJBQStCO0FBQ3JDLFVBQU0sVUFBb0IsQ0FBQztBQUMzQixhQUFTLElBQUksR0FBRyxJQUFJLEtBQUssZUFBZSxRQUFRLEtBQUs7QUFDcEQsY0FBUSxLQUFLLEtBQUssaUNBQWlDLENBQUMsQ0FBQztBQUFBLElBQ3REO0FBQ0EsV0FBTyxRQUFRLEtBQUssTUFBTTtBQUFBLEVBQzNCO0FBQUEsRUFFTyxpQ0FBaUMsT0FBdUI7QUFDOUQsVUFBTSxlQUFlLEtBQUssZUFBZSxLQUFLO0FBQzlDLFFBQUksQ0FBQyxjQUFjO0FBQ2xCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxhQUFhLFNBQVMsYUFBYTtBQUN0QyxZQUFNLHVCQUF1QixDQUFDLFNBQVMsK0JBQStCLDZCQUE2QixDQUFDO0FBQ3BHLGlCQUFXLFVBQVUsYUFBYSxTQUFTO0FBQzFDLGNBQU0sYUFBYSxPQUFPO0FBQzFCLFlBQUksWUFBWTtBQUNmLCtCQUFxQixLQUFLLFNBQVMsbURBQW1ELHVEQUF1RCxPQUFPLGFBQWEsVUFBVSxDQUFDO0FBQUEsUUFDN0ssT0FBTztBQUNOLCtCQUFxQixLQUFLLFNBQVMsc0RBQXNELG9DQUFvQyxPQUFPLFdBQVcsQ0FBQztBQUFBLFFBQ2pKO0FBQUEsTUFDRDtBQUNBLGFBQU8scUJBQXFCLEtBQUssSUFBSTtBQUFBLElBQ3RDO0FBQ0EsV0FBTyxhQUFhLFlBQVkscUJBQXFCLGFBQWEsU0FBUztBQUFBLEVBQzVFO0FBQUEsRUFFQSxNQUFhLDBCQUEwQixRQUE4QixPQUFlLE9BQWdDO0FBQ25ILFFBQUksQ0FBQyxLQUFLLDJCQUEyQjtBQUNwQztBQUFBLElBQ0Q7QUFDQSxRQUFJO0FBQ0osUUFBSSxTQUFTLEdBQUc7QUFDZiwrQkFBeUIsRUFBRSxPQUFPLE9BQU8sY0FBYyxRQUFRLEVBQUU7QUFBQSxJQUNsRSxPQUFPO0FBQ04sK0JBQXlCLEtBQUssK0JBQStCLEtBQUsseUJBQXlCO0FBQUEsSUFDNUY7QUFDQSxhQUFTLElBQUksdUJBQXVCLE9BQU8sSUFBSSx1QkFBdUIsY0FBYyxLQUFLO0FBQ3hGLFlBQU0sK0JBQStCLEtBQUssMENBQTBDLEtBQUssMkJBQTJCLENBQUM7QUFDckgsVUFBSSxpQ0FBaUMsUUFBVztBQUMvQztBQUFBLE1BQ0Q7QUFDQSxZQUFNLGVBQWUsTUFBTSxLQUFLLDBCQUEwQixrQ0FBa0MsUUFBUSw0QkFBNEI7QUFDaEksVUFBSSxDQUFDLGNBQWM7QUFDbEI7QUFBQSxNQUNEO0FBRUEsWUFBTSxpQkFBaUIsS0FBSyxvQkFBb0IsSUFBSSxDQUFDO0FBQ3JELFVBQUksZ0JBQWdCO0FBQ25CLHVCQUFlLFFBQVE7QUFDdkIsYUFBSyxvQkFBb0IsT0FBTyxDQUFDO0FBQUEsTUFDbEM7QUFDQSxXQUFLLGVBQWUsQ0FBQyxJQUFJO0FBQUEsUUFDeEIsTUFBTTtBQUFBLFFBQ04sYUFBYSxLQUFLO0FBQUEsUUFDbEIsV0FBVyxhQUFhO0FBQUEsUUFDeEIsY0FBYyxhQUFhO0FBQUEsTUFDNUI7QUFFQSxXQUFLLHdCQUF3QixHQUFHLEtBQUssZUFBZSxDQUFDLENBQUM7QUFBQSxJQUN2RDtBQUNBLFFBQUksT0FBTztBQUNWLFVBQUksU0FBUyxHQUFHO0FBQ2YsYUFBSyx3QkFBd0IsS0FBSztBQUFBLE1BQ25DLE9BQU87QUFDTixhQUFLLFNBQVMsTUFBTTtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUNBLFNBQUssU0FBUyxrQkFBa0I7QUFBQSxFQUNqQztBQUFBLEVBRU8sdUNBQXVDLE9BQWUsUUFBdUM7QUFDbkcsUUFBSSxDQUFDLEtBQUssMkJBQTJCO0FBQ3BDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSwrQkFBK0IsS0FBSywwQ0FBMEMsS0FBSywyQkFBMkIsS0FBSztBQUN6SCxRQUFJLGlDQUFpQyxRQUFXO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLDBCQUEwQiwrQ0FBK0MsOEJBQThCLE1BQU07QUFBQSxFQUMxSDtBQUFBLEVBRU8sdUJBQWdDO0FBQ3RDLFdBQU8sS0FBSyx3QkFBd0IscUJBQXFCLEtBQUs7QUFBQSxFQUMvRDtBQUFBLEVBRVEsMENBQTBDLDBCQUFvRCxPQUFtQztBQUN4SSxVQUFNLGVBQWUsS0FBSyxlQUFlLEtBQUs7QUFDOUMsUUFBSSxDQUFDLGdCQUFnQixhQUFhLFNBQVMsYUFBYTtBQUN2RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sMkJBQTJCLGFBQWEsZ0JBQWdCO0FBQzlELFFBQUksQ0FBQywwQkFBMEI7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLDZCQUE2QixLQUFLLGVBQWU7QUFBQSxNQUFVLENBQUFBLGtCQUNoRUEsY0FBYSxTQUFTLGVBQ25CQSxjQUFhLGdCQUFnQjtBQUFBLElBQ2pDO0FBQ0EsUUFBSSwrQkFBK0IsSUFBSTtBQUN0QyxZQUFNLElBQUksbUJBQW1CO0FBQUEsSUFDOUI7QUFDQSxXQUFPLFFBQVE7QUFBQSxFQUNoQjtBQUFBLEVBRVEsK0JBQStCLDBCQUFrRTtBQUN4RyxVQUFNLHNCQUFzQixLQUFLLGVBQWUsTUFBTTtBQUN0RCxVQUFNLDZCQUE2QixvQkFBb0IsVUFBVSxrQkFBZ0IsYUFBYSxTQUFTLGVBQWUsYUFBYSxnQkFBZ0Isd0JBQXdCO0FBQzNLLFVBQU0sb0NBQW9DLG9CQUFvQixRQUFRLEVBQUUsVUFBVSxrQkFBZ0IsYUFBYSxTQUFTLGVBQWUsYUFBYSxnQkFBZ0Isd0JBQXdCO0FBQzVMLFVBQU0sNEJBQTRCLHFDQUFxQyxJQUFJLG9CQUFvQixTQUFTLG9DQUFvQztBQUM1SSxXQUFPLEVBQUUsT0FBTyw0QkFBNEIsY0FBYyw0QkFBNEIsRUFBRTtBQUFBLEVBQ3pGO0FBQUEsRUFFQSxJQUFXLFVBQTRCO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVcscUJBQThCO0FBQ3hDLFdBQU8sS0FBSyxVQUFVLGNBQWM7QUFBQSxFQUNyQztBQUFBLEVBRUEsSUFBVyx3QkFBZ0M7QUFDMUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxrQkFBMEI7QUFDcEMsV0FBTyxLQUFLLGVBQWU7QUFBQSxFQUM1QjtBQUNEO0FBL1JNLDBCQUVtQixzQkFBc0IsdUJBQXVCLFNBQVM7QUFBQSxFQUM3RSxhQUFhO0FBQUEsRUFDYixXQUFXO0FBQ1osQ0FBQztBQUxJLDRCQUFOO0FBQUEsRUFxQkc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkJHOyIsCiAgIm5hbWVzIjogWyJyZW5kZXJlZFBhcnQiXQp9Cg==
