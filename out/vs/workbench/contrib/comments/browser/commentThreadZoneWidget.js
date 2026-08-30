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
import { Color } from "../../../../base/common/color.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isCodeEditor, MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { Range } from "../../../../editor/common/core/range.js";
import * as languages from "../../../../editor/common/languages.js";
import { ZoneWidget } from "../../../../editor/contrib/zoneWidget/browser/zoneWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { CommentGlyphWidget } from "./commentGlyphWidget.js";
import { ICommentService } from "./commentService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { CommentThreadWidget } from "./commentThreadWidget.js";
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadStateBorderColor } from "./commentColors.js";
import { peekViewBorder } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { StableEditorScrollState } from "../../../../editor/browser/stableEditorScroll.js";
import Severity from "../../../../base/common/severity.js";
import * as nls from "../../../../nls.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
function getCommentThreadWidgetStateColor(thread, theme) {
  return getCommentThreadStateBorderColor(thread, theme) ?? theme.getColor(peekViewBorder);
}
function commentThreadHasDraft(commentThread) {
  const comments = commentThread.comments;
  if (!comments) {
    return false;
  }
  return comments.some((comment) => comment.state === languages.CommentState.Draft);
}
var CommentWidgetFocus = /* @__PURE__ */ ((CommentWidgetFocus2) => {
  CommentWidgetFocus2[CommentWidgetFocus2["None"] = 0] = "None";
  CommentWidgetFocus2[CommentWidgetFocus2["Widget"] = 1] = "Widget";
  CommentWidgetFocus2[CommentWidgetFocus2["Editor"] = 2] = "Editor";
  return CommentWidgetFocus2;
})(CommentWidgetFocus || {});
function parseMouseDownInfoFromEvent(e) {
  const range = e.target.range;
  if (!range) {
    return null;
  }
  if (!e.event.leftButton) {
    return null;
  }
  if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
    return null;
  }
  const data = e.target.detail;
  const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;
  if (gutterOffsetX > 20) {
    return null;
  }
  return { lineNumber: range.startLineNumber };
}
function isMouseUpEventDragFromMouseDown(mouseDownInfo, e) {
  if (!mouseDownInfo) {
    return null;
  }
  const { lineNumber } = mouseDownInfo;
  const range = e.target.range;
  if (!range) {
    return null;
  }
  return lineNumber;
}
function isMouseUpEventMatchMouseDown(mouseDownInfo, e) {
  if (!mouseDownInfo) {
    return null;
  }
  const { lineNumber } = mouseDownInfo;
  const range = e.target.range;
  if (!range || range.startLineNumber !== lineNumber) {
    return null;
  }
  if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
    return null;
  }
  return lineNumber;
}
let ReviewZoneWidget = class extends ZoneWidget {
  constructor(editor, _uniqueOwner, _commentThread, _pendingComment, _pendingEdits, instantiationService, themeService, commentService, contextKeyService, configurationService, dialogService) {
    super(editor, { keepEditorSelection: true, isAccessible: true, showArrow: !!_commentThread.range });
    this._uniqueOwner = _uniqueOwner;
    this._commentThread = _commentThread;
    this._pendingComment = _pendingComment;
    this._pendingEdits = _pendingEdits;
    this.themeService = themeService;
    this.commentService = commentService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this._onDidClose = new Emitter();
    this._onDidCreateThread = new Emitter();
    this._onDidChangeExpandedState = new Emitter();
    this._globalToDispose = new DisposableStore();
    this._commentThreadDisposables = [];
    this._contextKeyService = this._globalToDispose.add(contextKeyService.createScoped(this.domNode));
    this._scopedInstantiationService = this._globalToDispose.add(instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this._contextKeyService]
    )));
    const controller = this.commentService.getCommentController(this._uniqueOwner);
    if (controller) {
      this._commentOptions = controller.options;
    }
    this._initialCollapsibleState = _pendingComment ? languages.CommentThreadCollapsibleState.Expanded : _commentThread.initialCollapsibleState;
    _commentThread.initialCollapsibleState = this._initialCollapsibleState;
    this._commentThreadDisposables = [];
    this.create();
    this._globalToDispose.add(this.themeService.onDidColorThemeChange(this._applyTheme, this));
    this._globalToDispose.add(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._applyTheme();
      }
    }));
    this._applyTheme();
  }
  get uniqueOwner() {
    return this._uniqueOwner;
  }
  get commentThread() {
    return this._commentThread;
  }
  get expanded() {
    return this._isExpanded;
  }
  get onDidClose() {
    return this._onDidClose.event;
  }
  get onDidCreateThread() {
    return this._onDidCreateThread.event;
  }
  get onDidChangeExpandedState() {
    return this._onDidChangeExpandedState.event;
  }
  getPosition() {
    if (this.position) {
      return this.position;
    }
    if (this._commentGlyph) {
      return this._commentGlyph.getPosition().position ?? void 0;
    }
    return void 0;
  }
  revealRange() {
  }
  reveal(commentUniqueId, focus = 0 /* None */) {
    this.makeVisible(commentUniqueId, focus);
    const comment = this._commentThread.comments?.find((comment2) => comment2.uniqueIdInThread === commentUniqueId) ?? this._commentThread.comments?.[0];
    this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread, comment });
  }
  _expandAndShowZoneWidget() {
    if (!this._isExpanded) {
      this.show(this.arrowPosition(this._commentThread.range), 2);
    }
  }
  _setFocus(commentUniqueId, focus) {
    if (focus === 1 /* Widget */) {
      this._commentThreadWidget.focus(commentUniqueId);
    } else if (focus === 2 /* Editor */) {
      this._commentThreadWidget.focusCommentEditor();
    }
  }
  _goToComment(commentUniqueId, focus) {
    const height = this.editor.getLayoutInfo().height;
    const coords = this._commentThreadWidget.getCommentCoords(commentUniqueId);
    if (coords) {
      let scrollTop = 1;
      if (this._commentThread.range) {
        const commentThreadCoords = coords.thread;
        const commentCoords = coords.comment;
        scrollTop = this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top;
      }
      this.editor.setScrollTop(scrollTop);
      this._setFocus(commentUniqueId, focus);
    } else {
      this._goToThread(focus);
    }
  }
  _goToThread(focus) {
    const rangeToReveal = this._commentThread.range ? new Range(this._commentThread.range.startLineNumber, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + 1, 1) : new Range(1, 1, 1, 1);
    this.editor.revealRangeInCenter(rangeToReveal);
    this._setFocus(void 0, focus);
  }
  makeVisible(commentUniqueId, focus = 0 /* None */) {
    this._expandAndShowZoneWidget();
    if (commentUniqueId !== void 0) {
      this._goToComment(commentUniqueId, focus);
    } else {
      this._goToThread(focus);
    }
  }
  getPendingComments() {
    return {
      newComment: this._commentThreadWidget.getPendingComment(),
      edits: this._commentThreadWidget.getPendingEdits()
    };
  }
  setPendingComment(pending) {
    this._pendingComment = pending;
    this.expand();
    this._commentThreadWidget.setPendingComment(pending);
  }
  _fillContainer(container) {
    this.setCssClass("review-widget");
    this._commentThreadWidget = this._scopedInstantiationService.createInstance(
      CommentThreadWidget,
      container,
      this.editor,
      this._uniqueOwner,
      this.editor.getModel().uri,
      this._contextKeyService,
      this._scopedInstantiationService,
      this._commentThread,
      this._pendingComment,
      this._pendingEdits,
      { context: this.editor },
      this._commentOptions,
      {
        actionRunner: async () => {
          if (!this._commentThread.comments || !this._commentThread.comments.length) {
            const newPosition = this.getPosition();
            if (newPosition) {
              const originalRange = this._commentThread.range;
              if (!originalRange) {
                return;
              }
              let range;
              if (newPosition.lineNumber !== originalRange.endLineNumber) {
                const distance = newPosition.lineNumber - originalRange.endLineNumber;
                range = new Range(originalRange.startLineNumber + distance, originalRange.startColumn, originalRange.endLineNumber + distance, originalRange.endColumn);
              } else {
                range = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.endColumn);
              }
              await this.commentService.updateCommentThreadTemplate(this.uniqueOwner, this._commentThread.commentThreadHandle, range);
            }
          }
        },
        collapse: () => {
          return this.collapse(true);
        }
      }
    );
    this._disposables.add(this._commentThreadWidget);
  }
  arrowPosition(range) {
    if (!range) {
      return void 0;
    }
    return { lineNumber: range.endLineNumber, column: range.endLineNumber === range.startLineNumber ? (range.startColumn + range.endColumn + 1) / 2 : 1 };
  }
  deleteCommentThread() {
    this.dispose();
    this.commentService.disposeCommentThread(this.uniqueOwner, this._commentThread.threadId);
  }
  doCollapse() {
    this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
  }
  async collapse(confirm = false) {
    if (!confirm || await this.confirmCollapse()) {
      this.doCollapse();
      return true;
    } else {
      return false;
    }
  }
  async confirmCollapse() {
    const confirmSetting = this.configurationService.getValue("comments.thread.confirmOnCollapse");
    if (confirmSetting === "whenHasUnsubmittedComments" && this._commentThreadWidget.hasUnsubmittedComments) {
      const result = await this.dialogService.confirm({
        message: nls.localize("confirmCollapse", "Collapsing this comment thread will discard unsubmitted comments. Are you sure you want to discard these comments?"),
        primaryButton: nls.localize("discard", "Discard"),
        type: Severity.Warning,
        checkbox: { label: nls.localize("neverAskAgain", "Never ask me again"), checked: false }
      });
      if (result.checkboxChecked) {
        await this.configurationService.updateValue("comments.thread.confirmOnCollapse", "never");
      }
      return result.confirmed;
    }
    return true;
  }
  expand(setActive) {
    this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
    if (setActive) {
      this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread });
    }
  }
  getGlyphPosition() {
    if (this._commentGlyph) {
      return this._commentGlyph.getPosition().position.lineNumber;
    }
    return 0;
  }
  async update(commentThread) {
    if (this._commentThread !== commentThread) {
      this._commentThreadDisposables.forEach((disposable) => disposable.dispose());
      this._commentThread = commentThread;
      this._commentThreadDisposables = [];
      this.bindCommentThreadListeners();
    }
    await this._commentThreadWidget.updateCommentThread(commentThread);
    const lineNumber = this._commentThread.range?.endLineNumber ?? 1;
    let shouldMoveWidget = false;
    if (this._commentGlyph) {
      const hasDraft = commentThreadHasDraft(commentThread);
      this._commentGlyph.setThreadState(commentThread.state, hasDraft);
      if (this._commentGlyph.getPosition().position.lineNumber !== lineNumber) {
        shouldMoveWidget = true;
        this._commentGlyph.setLineNumber(lineNumber);
      }
    }
    if (shouldMoveWidget && this._isExpanded || this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
      this.show(this.arrowPosition(this._commentThread.range), 2);
    } else if (this._commentThread.collapsibleState !== languages.CommentThreadCollapsibleState.Expanded) {
      this.hide();
    }
  }
  _onWidth(widthInPixel) {
    this._commentThreadWidget.layout(widthInPixel);
  }
  _doLayout(heightInPixel, widthInPixel) {
    this._commentThreadWidget.layout(widthInPixel);
  }
  async display(range, shouldReveal) {
    if (range) {
      this._commentGlyph = new CommentGlyphWidget(this.editor, range?.endLineNumber ?? -1);
      const hasDraft = commentThreadHasDraft(this._commentThread);
      this._commentGlyph.setThreadState(this._commentThread.state, hasDraft);
      this._globalToDispose.add(this._commentGlyph.onDidChangeLineNumber(async (e) => {
        if (!this._commentThread.range) {
          return;
        }
        const shift = e - this._commentThread.range.endLineNumber;
        const newRange = new Range(this._commentThread.range.startLineNumber + shift, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + shift, this._commentThread.range.endColumn);
        this._commentThread.range = newRange;
      }));
    }
    await this._commentThreadWidget.display(this.editor.getOption(EditorOption.lineHeight), shouldReveal);
    this._disposables.add(this._commentThreadWidget.onDidResize((dimension) => {
      this._refresh(dimension);
    }));
    if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
      this.show(this.arrowPosition(range), 2);
    }
    if (shouldReveal) {
      this.makeVisible();
    }
    this.bindCommentThreadListeners();
  }
  bindCommentThreadListeners() {
    this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async (_) => {
      await this.update(this._commentThread);
    }));
    this._commentThreadDisposables.push(this._commentThread.onDidChangeCollapsibleState((state) => {
      if (state === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
        this.show(this.arrowPosition(this._commentThread.range), 2);
        this._commentThreadWidget.ensureFocusIntoNewEditingComment();
        return;
      }
      if (state === languages.CommentThreadCollapsibleState.Collapsed && this._isExpanded) {
        this.hide();
        return;
      }
    }));
    if (this._initialCollapsibleState === void 0) {
      const onDidChangeInitialCollapsibleState = this._commentThread.onDidChangeInitialCollapsibleState((state) => {
        this._initialCollapsibleState = state;
        this._commentThread.collapsibleState = this._initialCollapsibleState;
        onDidChangeInitialCollapsibleState.dispose();
      });
      this._commentThreadDisposables.push(onDidChangeInitialCollapsibleState);
    }
    this._commentThreadDisposables.push(this._commentThread.onDidChangeState(() => {
      const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
      this.style({
        frameColor: borderColor,
        arrowColor: borderColor
      });
      this.container?.style.setProperty(commentThreadStateColorVar, `${borderColor}`);
      this.container?.style.setProperty(commentThreadStateBackgroundColorVar, `${borderColor.transparent(0.1)}`);
    }));
  }
  async submitComment() {
    return this._commentThreadWidget.submitComment();
  }
  _refresh(dimensions) {
    if (this._isExpanded === void 0 && dimensions.height === 0 && dimensions.width === 0) {
      this.commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
      return;
    }
    if (this._isExpanded) {
      this._commentThreadWidget.layout();
      const headHeight = Math.ceil(this.editor.getOption(EditorOption.lineHeight) * 1.2);
      const lineHeight = this.editor.getOption(EditorOption.lineHeight);
      const arrowHeight = Math.round(lineHeight / 3);
      const frameThickness = Math.round(lineHeight / 9) * 2;
      const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness + 8) / lineHeight);
      if (this._viewZone?.heightInLines === computedLinesNumber) {
        return;
      }
      const currentPosition = this.getPosition();
      if (this._viewZone && currentPosition && currentPosition.lineNumber !== this._viewZone.afterLineNumber && this._viewZone.afterLineNumber !== 0) {
        this._viewZone.afterLineNumber = currentPosition.lineNumber;
      }
      const capture = StableEditorScrollState.capture(this.editor);
      this._relayout(computedLinesNumber);
      capture.restore(this.editor);
    }
  }
  _applyTheme() {
    const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor
    });
    const fontInfo = this.editor.getOption(EditorOption.fontInfo);
    this._commentThreadWidget.applyTheme(fontInfo);
  }
  show(rangeOrPos, heightInLines) {
    const glyphPosition = this._commentGlyph?.getPosition();
    let range = Range.isIRange(rangeOrPos) ? rangeOrPos : rangeOrPos ? Range.fromPositions(rangeOrPos) : void 0;
    if (glyphPosition?.position && range && glyphPosition.position.lineNumber !== range.endLineNumber) {
      const distance = glyphPosition.position.lineNumber - range.endLineNumber;
      range = new Range(range.startLineNumber + distance, range.startColumn, range.endLineNumber + distance, range.endColumn);
    }
    const wasExpanded = this._isExpanded;
    this._isExpanded = true;
    super.show(range ?? new Range(0, 0, 0, 0), heightInLines);
    this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
    this._refresh(this._commentThreadWidget.getDimensions());
    if (!wasExpanded) {
      this._onDidChangeExpandedState.fire(true);
    }
  }
  async collapseAndFocusRange() {
    if (await this.collapse(true) && Range.isIRange(this.commentThread.range) && isCodeEditor(this.editor)) {
      this.editor.setSelection(this.commentThread.range);
    }
  }
  hide() {
    if (this._isExpanded) {
      this._isExpanded = false;
      if (this.editor.hasWidgetFocus()) {
        this.editor.focus();
      }
      if (!this._commentThread.comments || !this._commentThread.comments.length) {
        this.deleteCommentThread();
      }
      this._onDidChangeExpandedState.fire(false);
    }
    super.hide();
  }
  dispose() {
    super.dispose();
    if (this._commentGlyph) {
      this._commentGlyph.dispose();
      this._commentGlyph = void 0;
    }
    this._globalToDispose.dispose();
    this._commentThreadDisposables.forEach((global) => global.dispose());
    this._onDidClose.fire(void 0);
    this._onDidClose.dispose();
    this._onDidCreateThread.dispose();
    this._onDidChangeExpandedState.dispose();
  }
};
ReviewZoneWidget = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, ICommentService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IDialogService)
], ReviewZoneWidget);
export {
  CommentWidgetFocus,
  ReviewZoneWidget,
  isMouseUpEventDragFromMouseDown,
  isMouseUpEventMatchMouseDown,
  parseMouseDownInfoFromEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50VGhyZWFkWm9uZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgaXNDb2RlRWRpdG9yLCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBab25lV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvem9uZVdpZGdldC9icm93c2VyL3pvbmVXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tZW50R2x5cGhXaWRnZXQgfSBmcm9tICcuL2NvbW1lbnRHbHlwaFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFNlcnZpY2UgfSBmcm9tICcuL2NvbW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tZW50VGhyZWFkV2lkZ2V0IH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRUaHJlYWRXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvbW1lbnRUaHJlYWRXaWRnZXQgfSBmcm9tICcuL2NvbW1lbnRUaHJlYWRXaWRnZXQuanMnO1xuaW1wb3J0IHsgY29tbWVudFRocmVhZFN0YXRlQmFja2dyb3VuZENvbG9yVmFyLCBjb21tZW50VGhyZWFkU3RhdGVDb2xvclZhciwgZ2V0Q29tbWVudFRocmVhZFN0YXRlQm9yZGVyQ29sb3IgfSBmcm9tICcuL2NvbW1lbnRDb2xvcnMuanMnO1xuaW1wb3J0IHsgcGVla1ZpZXdCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wZWVrVmlldy9icm93c2VyL3BlZWtWaWV3LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zdGFibGVFZGl0b3JTY3JvbGwuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcblxuZnVuY3Rpb24gZ2V0Q29tbWVudFRocmVhZFdpZGdldFN0YXRlQ29sb3IodGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlIHwgdW5kZWZpbmVkLCB0aGVtZTogSUNvbG9yVGhlbWUpOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBnZXRDb21tZW50VGhyZWFkU3RhdGVCb3JkZXJDb2xvcih0aHJlYWQsIHRoZW1lKSA/PyB0aGVtZS5nZXRDb2xvcihwZWVrVmlld0JvcmRlcik7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBjb21tZW50IHRocmVhZCBoYXMgYW55IGRyYWZ0IGNvbW1lbnRzXG4gKi9cbmZ1bmN0aW9uIGNvbW1lbnRUaHJlYWRIYXNEcmFmdChjb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZCk6IGJvb2xlYW4ge1xuXHRjb25zdCBjb21tZW50cyA9IGNvbW1lbnRUaHJlYWQuY29tbWVudHM7XG5cdGlmICghY29tbWVudHMpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIGNvbW1lbnRzLnNvbWUoY29tbWVudCA9PiBjb21tZW50LnN0YXRlID09PSBsYW5ndWFnZXMuQ29tbWVudFN0YXRlLkRyYWZ0KTtcbn1cblxuZXhwb3J0IGVudW0gQ29tbWVudFdpZGdldEZvY3VzIHtcblx0Tm9uZSA9IDAsXG5cdFdpZGdldCA9IDEsXG5cdEVkaXRvciA9IDJcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTW91c2VEb3duSW5mb0Zyb21FdmVudChlOiBJRWRpdG9yTW91c2VFdmVudCkge1xuXHRjb25zdCByYW5nZSA9IGUudGFyZ2V0LnJhbmdlO1xuXG5cdGlmICghcmFuZ2UpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGlmICghZS5ldmVudC5sZWZ0QnV0dG9uKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBkYXRhID0gZS50YXJnZXQuZGV0YWlsO1xuXHRjb25zdCBndXR0ZXJPZmZzZXRYID0gZGF0YS5vZmZzZXRYIC0gZGF0YS5nbHlwaE1hcmdpbldpZHRoIC0gZGF0YS5saW5lTnVtYmVyc1dpZHRoIC0gZGF0YS5nbHlwaE1hcmdpbkxlZnQ7XG5cblx0Ly8gZG9uJ3QgY29sbGlkZSB3aXRoIGZvbGRpbmcgYW5kIGdpdCBkZWNvcmF0aW9uc1xuXHRpZiAoZ3V0dGVyT2Zmc2V0WCA+IDIwKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRyZXR1cm4geyBsaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTW91c2VVcEV2ZW50RHJhZ0Zyb21Nb3VzZURvd24obW91c2VEb3duSW5mbzogeyBsaW5lTnVtYmVyOiBudW1iZXIgfSB8IG51bGwsIGU6IElFZGl0b3JNb3VzZUV2ZW50KSB7XG5cdGlmICghbW91c2VEb3duSW5mbykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgeyBsaW5lTnVtYmVyIH0gPSBtb3VzZURvd25JbmZvO1xuXG5cdGNvbnN0IHJhbmdlID0gZS50YXJnZXQucmFuZ2U7XG5cblx0aWYgKCFyYW5nZSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cmV0dXJuIGxpbmVOdW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vdXNlVXBFdmVudE1hdGNoTW91c2VEb3duKG1vdXNlRG93bkluZm86IHsgbGluZU51bWJlcjogbnVtYmVyIH0gfCBudWxsLCBlOiBJRWRpdG9yTW91c2VFdmVudCkge1xuXHRpZiAoIW1vdXNlRG93bkluZm8pIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IHsgbGluZU51bWJlciB9ID0gbW91c2VEb3duSW5mbztcblxuXHRjb25zdCByYW5nZSA9IGUudGFyZ2V0LnJhbmdlO1xuXG5cdGlmICghcmFuZ2UgfHwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBsaW5lTnVtYmVyKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRyZXR1cm4gbGluZU51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFJldmlld1pvbmVXaWRnZXQgZXh0ZW5kcyBab25lV2lkZ2V0IGltcGxlbWVudHMgSUNvbW1lbnRUaHJlYWRXaWRnZXQge1xuXHRwcml2YXRlIF9jb21tZW50VGhyZWFkV2lkZ2V0ITogQ29tbWVudFRocmVhZFdpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IG5ldyBFbWl0dGVyPFJldmlld1pvbmVXaWRnZXQgfCB1bmRlZmluZWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3JlYXRlVGhyZWFkID0gbmV3IEVtaXR0ZXI8UmV2aWV3Wm9uZVdpZGdldD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFeHBhbmRlZFN0YXRlID0gbmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKTtcblx0cHJpdmF0ZSBfaXNFeHBhbmRlZD86IGJvb2xlYW47XG5cdHByaXZhdGUgX2luaXRpYWxDb2xsYXBzaWJsZVN0YXRlPzogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlO1xuXHRwcml2YXRlIF9jb21tZW50R2x5cGg/OiBDb21tZW50R2x5cGhXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dsb2JhbFRvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfY29tbWVudFRocmVhZERpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0cHVibGljIGdldCB1bmlxdWVPd25lcigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl91bmlxdWVPd25lcjtcblx0fVxuXHRwdWJsaWMgZ2V0IGNvbW1lbnRUaHJlYWQoKTogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50VGhyZWFkO1xuXHR9XG5cblx0cHVibGljIGdldCBleHBhbmRlZCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faXNFeHBhbmRlZDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbW1lbnRPcHRpb25zOiBsYW5ndWFnZXMuQ29tbWVudE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIF91bmlxdWVPd25lcjogc3RyaW5nLFxuXHRcdHByaXZhdGUgX2NvbW1lbnRUaHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkLFxuXHRcdHByaXZhdGUgX3BlbmRpbmdDb21tZW50OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfcGVuZGluZ0VkaXRzOiB7IFtrZXk6IG51bWJlcl06IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB9IHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbW1lbnRTZXJ2aWNlIHByaXZhdGUgY29tbWVudFNlcnZpY2U6IElDb21tZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IGtlZXBFZGl0b3JTZWxlY3Rpb246IHRydWUsIGlzQWNjZXNzaWJsZTogdHJ1ZSwgc2hvd0Fycm93OiAhIV9jb21tZW50VGhyZWFkLnJhbmdlIH0pO1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fZ2xvYmFsVG9EaXNwb3NlLmFkZChjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5kb21Ob2RlKSk7XG5cblx0XHR0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX2dsb2JhbFRvRGlzcG9zZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2VdXG5cdFx0KSkpO1xuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY29tbWVudFNlcnZpY2UuZ2V0Q29tbWVudENvbnRyb2xsZXIodGhpcy5fdW5pcXVlT3duZXIpO1xuXHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50T3B0aW9ucyA9IGNvbnRyb2xsZXIub3B0aW9ucztcblx0XHR9XG5cblx0XHR0aGlzLl9pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9IF9wZW5kaW5nQ29tbWVudCA/IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCA6IF9jb21tZW50VGhyZWFkLmluaXRpYWxDb2xsYXBzaWJsZVN0YXRlO1xuXHRcdF9jb21tZW50VGhyZWFkLmluaXRpYWxDb2xsYXBzaWJsZVN0YXRlID0gdGhpcy5faW5pdGlhbENvbGxhcHNpYmxlU3RhdGU7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzID0gW107XG5cdFx0dGhpcy5jcmVhdGUoKTtcblxuXHRcdHRoaXMuX2dsb2JhbFRvRGlzcG9zZS5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoaXMuX2FwcGx5VGhlbWUsIHRoaXMpKTtcblx0XHR0aGlzLl9nbG9iYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSkge1xuXHRcdFx0XHR0aGlzLl9hcHBseVRoZW1lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2FwcGx5VGhlbWUoKTtcblxuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZENsb3NlKCk6IEV2ZW50PFJldmlld1pvbmVXaWRnZXQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDcmVhdGVUaHJlYWQoKTogRXZlbnQ8UmV2aWV3Wm9uZVdpZGdldD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENyZWF0ZVRocmVhZC5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VFeHBhbmRlZFN0YXRlKCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VFeHBhbmRlZFN0YXRlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IElQb3NpdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMucG9zaXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnBvc2l0aW9uO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb21tZW50R2x5cGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21tZW50R2x5cGguZ2V0UG9zaXRpb24oKS5wb3NpdGlvbiA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmV2ZWFsUmFuZ2UoKSB7XG5cdFx0Ly8gd2UgZG9uJ3QgZG8gYW55dGhpbmcgaGVyZSBhcyB3ZSBhbHdheXMgZG8gdGhlIHJldmVhbCBvdXJzZWx2ZXMuXG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsKGNvbW1lbnRVbmlxdWVJZD86IG51bWJlciwgZm9jdXM6IENvbW1lbnRXaWRnZXRGb2N1cyA9IENvbW1lbnRXaWRnZXRGb2N1cy5Ob25lKSB7XG5cdFx0dGhpcy5tYWtlVmlzaWJsZShjb21tZW50VW5pcXVlSWQsIGZvY3VzKTtcblx0XHRjb25zdCBjb21tZW50ID0gdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cz8uZmluZChjb21tZW50ID0+IGNvbW1lbnQudW5pcXVlSWRJblRocmVhZCA9PT0gY29tbWVudFVuaXF1ZUlkKSA/PyB0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzPy5bMF07XG5cdFx0dGhpcy5jb21tZW50U2VydmljZS5zZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKHRoaXMudW5pcXVlT3duZXIsIHsgdGhyZWFkOiB0aGlzLl9jb21tZW50VGhyZWFkLCBjb21tZW50IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhwYW5kQW5kU2hvd1pvbmVXaWRnZXQoKSB7XG5cdFx0aWYgKCF0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLnNob3codGhpcy5hcnJvd1Bvc2l0aW9uKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UpLCAyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRGb2N1cyhjb21tZW50VW5pcXVlSWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZm9jdXM6IENvbW1lbnRXaWRnZXRGb2N1cykge1xuXHRcdGlmIChmb2N1cyA9PT0gQ29tbWVudFdpZGdldEZvY3VzLldpZGdldCkge1xuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5mb2N1cyhjb21tZW50VW5pcXVlSWQpO1xuXHRcdH0gZWxzZSBpZiAoZm9jdXMgPT09IENvbW1lbnRXaWRnZXRGb2N1cy5FZGl0b3IpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuZm9jdXNDb21tZW50RWRpdG9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ29Ub0NvbW1lbnQoY29tbWVudFVuaXF1ZUlkOiBudW1iZXIsIGZvY3VzOiBDb21tZW50V2lkZ2V0Rm9jdXMpIHtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0O1xuXHRcdGNvbnN0IGNvb3JkcyA9IHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuZ2V0Q29tbWVudENvb3Jkcyhjb21tZW50VW5pcXVlSWQpO1xuXHRcdGlmIChjb29yZHMpIHtcblx0XHRcdGxldCBzY3JvbGxUb3A6IG51bWJlciA9IDE7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFRocmVhZC5yYW5nZSkge1xuXHRcdFx0XHRjb25zdCBjb21tZW50VGhyZWFkQ29vcmRzID0gY29vcmRzLnRocmVhZDtcblx0XHRcdFx0Y29uc3QgY29tbWVudENvb3JkcyA9IGNvb3Jkcy5jb21tZW50O1xuXHRcdFx0XHRzY3JvbGxUb3AgPSB0aGlzLmVkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSAtIGhlaWdodCAvIDIgKyBjb21tZW50Q29vcmRzLnRvcCAtIGNvbW1lbnRUaHJlYWRDb29yZHMudG9wO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcCk7XG5cdFx0XHR0aGlzLl9zZXRGb2N1cyhjb21tZW50VW5pcXVlSWQsIGZvY3VzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZ29Ub1RocmVhZChmb2N1cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ29Ub1RocmVhZChmb2N1czogQ29tbWVudFdpZGdldEZvY3VzKSB7XG5cdFx0Y29uc3QgcmFuZ2VUb1JldmVhbCA9IHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2Vcblx0XHRcdD8gbmV3IFJhbmdlKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0Q29sdW1uLCB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxLCAxKVxuXHRcdFx0OiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSk7XG5cblx0XHR0aGlzLmVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKHJhbmdlVG9SZXZlYWwpO1xuXHRcdHRoaXMuX3NldEZvY3VzKHVuZGVmaW5lZCwgZm9jdXMpO1xuXHR9XG5cblx0cHVibGljIG1ha2VWaXNpYmxlKGNvbW1lbnRVbmlxdWVJZD86IG51bWJlciwgZm9jdXM6IENvbW1lbnRXaWRnZXRGb2N1cyA9IENvbW1lbnRXaWRnZXRGb2N1cy5Ob25lKSB7XG5cdFx0dGhpcy5fZXhwYW5kQW5kU2hvd1pvbmVXaWRnZXQoKTtcblxuXHRcdGlmIChjb21tZW50VW5pcXVlSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZ29Ub0NvbW1lbnQoY29tbWVudFVuaXF1ZUlkLCBmb2N1cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2dvVG9UaHJlYWQoZm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRQZW5kaW5nQ29tbWVudHMoKTogeyBuZXdDb21tZW50OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQ7IGVkaXRzOiB7IFtrZXk6IG51bWJlcl06IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB9IH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuZXdDb21tZW50OiB0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmdldFBlbmRpbmdDb21tZW50KCksXG5cdFx0XHRlZGl0czogdGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5nZXRQZW5kaW5nRWRpdHMoKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc2V0UGVuZGluZ0NvbW1lbnQocGVuZGluZzogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50KSB7XG5cdFx0dGhpcy5fcGVuZGluZ0NvbW1lbnQgPSBwZW5kaW5nO1xuXHRcdHRoaXMuZXhwYW5kKCk7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5zZXRQZW5kaW5nQ29tbWVudChwZW5kaW5nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlsbENvbnRhaW5lcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5zZXRDc3NDbGFzcygncmV2aWV3LXdpZGdldCcpO1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQgPSB0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvbW1lbnRUaHJlYWRXaWRnZXQ8SVJhbmdlPixcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHRoaXMuZWRpdG9yLFxuXHRcdFx0dGhpcy5fdW5pcXVlT3duZXIsXG5cdFx0XHR0aGlzLmVkaXRvci5nZXRNb2RlbCgpIS51cmksXG5cdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZCxcblx0XHRcdHRoaXMuX3BlbmRpbmdDb21tZW50LFxuXHRcdFx0dGhpcy5fcGVuZGluZ0VkaXRzLFxuXHRcdFx0eyBjb250ZXh0OiB0aGlzLmVkaXRvciwgfSxcblx0XHRcdHRoaXMuX2NvbW1lbnRPcHRpb25zLFxuXHRcdFx0e1xuXHRcdFx0XHRhY3Rpb25SdW5uZXI6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMgfHwgIXRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IHRoaXMuZ2V0UG9zaXRpb24oKTtcblxuXHRcdFx0XHRcdFx0aWYgKG5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsUmFuZ2UgPSB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlO1xuXHRcdFx0XHRcdFx0XHRpZiAoIW9yaWdpbmFsUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0bGV0IHJhbmdlOiBSYW5nZTtcblxuXHRcdFx0XHRcdFx0XHRpZiAobmV3UG9zaXRpb24ubGluZU51bWJlciAhPT0gb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gVGhlIHdpZGdldCBjb3VsZCBoYXZlIG1vdmVkIGFzIGEgcmVzdWx0IG9mIGVkaXRvciBjaGFuZ2VzLlxuXHRcdFx0XHRcdFx0XHRcdC8vIFdlIG5lZWQgdG8gdHJ5IHRvIGNhbGN1bGF0ZSB0aGUgbmV3LCBtb3JlIGNvcnJlY3QsIHJhbmdlIGZvciB0aGUgY29tbWVudC5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBkaXN0YW5jZSA9IG5ld1Bvc2l0aW9uLmxpbmVOdW1iZXIgLSBvcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2Uob3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIgKyBkaXN0YW5jZSwgb3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbiwgb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyICsgZGlzdGFuY2UsIG9yaWdpbmFsUmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgb3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbiwgb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyLCBvcmlnaW5hbFJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tZW50U2VydmljZS51cGRhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhpcy51bmlxdWVPd25lciwgdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlLCByYW5nZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb2xsYXBzZTogKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbGxhcHNlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgYXJyb3dQb3NpdGlvbihyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogSVBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBBcnJvdyBvbiB0b3AgZWRnZSBvZiB6b25lIHdpZGdldCB3aWxsIGJlIGF0IHRoZSBzdGFydCBvZiB0aGUgbGluZSBpZiByYW5nZSBpcyBtdWx0aS1saW5lLCBlbHNlIGF0IG1pZHBvaW50IG9mIHJhbmdlIChyb3VuZGluZyByaWdodHdhcmRzKVxuXHRcdHJldHVybiB7IGxpbmVOdW1iZXI6IHJhbmdlLmVuZExpbmVOdW1iZXIsIGNvbHVtbjogcmFuZ2UuZW5kTGluZU51bWJlciA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID8gKHJhbmdlLnN0YXJ0Q29sdW1uICsgcmFuZ2UuZW5kQ29sdW1uICsgMSkgLyAyIDogMSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBkZWxldGVDb21tZW50VGhyZWFkKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY29tbWVudFNlcnZpY2UuZGlzcG9zZUNvbW1lbnRUaHJlYWQodGhpcy51bmlxdWVPd25lciwgdGhpcy5fY29tbWVudFRocmVhZC50aHJlYWRJZCk7XG5cdH1cblxuXHRwcml2YXRlIGRvQ29sbGFwc2UoKSB7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb2xsYXBzZShjb25maXJtOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIWNvbmZpcm0gfHwgKGF3YWl0IHRoaXMuY29uZmlybUNvbGxhcHNlKCkpKSB7XG5cdFx0XHR0aGlzLmRvQ29sbGFwc2UoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtQ29sbGFwc2UoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY29uZmlybVNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd3aGVuSGFzVW5zdWJtaXR0ZWRDb21tZW50cycgfCAnbmV2ZXInPignY29tbWVudHMudGhyZWFkLmNvbmZpcm1PbkNvbGxhcHNlJyk7XG5cblx0XHRpZiAoY29uZmlybVNldHRpbmcgPT09ICd3aGVuSGFzVW5zdWJtaXR0ZWRDb21tZW50cycgJiYgdGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5oYXNVbnN1Ym1pdHRlZENvbW1lbnRzKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29uZmlybUNvbGxhcHNlJywgXCJDb2xsYXBzaW5nIHRoaXMgY29tbWVudCB0aHJlYWQgd2lsbCBkaXNjYXJkIHVuc3VibWl0dGVkIGNvbW1lbnRzLiBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGlzY2FyZCB0aGVzZSBjb21tZW50cz9cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSgnZGlzY2FyZCcsIFwiRGlzY2FyZFwiKSxcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnbmV2ZXJBc2tBZ2FpbicsIFwiTmV2ZXIgYXNrIG1lIGFnYWluXCIpLCBjaGVja2VkOiBmYWxzZSB9XG5cdFx0XHR9KTtcblx0XHRcdGlmIChyZXN1bHQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2NvbW1lbnRzLnRocmVhZC5jb25maXJtT25Db2xsYXBzZScsICduZXZlcicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdC5jb25maXJtZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZChzZXRBY3RpdmU/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkO1xuXHRcdGlmIChzZXRBY3RpdmUpIHtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLnVuaXF1ZU93bmVyLCB7IHRocmVhZDogdGhpcy5fY29tbWVudFRocmVhZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0R2x5cGhQb3NpdGlvbigpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9jb21tZW50R2x5cGgpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb21tZW50R2x5cGguZ2V0UG9zaXRpb24oKS5wb3NpdGlvbiEubGluZU51bWJlcjtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRhc3luYyB1cGRhdGUoY29tbWVudFRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SVJhbmdlPikge1xuXHRcdGlmICh0aGlzLl9jb21tZW50VGhyZWFkICE9PSBjb21tZW50VGhyZWFkKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQgPSBjb21tZW50VGhyZWFkO1xuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzID0gW107XG5cdFx0XHR0aGlzLmJpbmRDb21tZW50VGhyZWFkTGlzdGVuZXJzKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fY29tbWVudFRocmVhZFdpZGdldC51cGRhdGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWQpO1xuXG5cdFx0Ly8gTW92ZSBjb21tZW50IGdseXBoIHdpZGdldCBhbmQgc2hvdyBwb3NpdGlvbiBpZiB0aGUgbGluZSBoYXMgY2hhbmdlZC5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fY29tbWVudFRocmVhZC5yYW5nZT8uZW5kTGluZU51bWJlciA/PyAxO1xuXHRcdGxldCBzaG91bGRNb3ZlV2lkZ2V0ID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRHbHlwaCkge1xuXHRcdFx0Y29uc3QgaGFzRHJhZnQgPSBjb21tZW50VGhyZWFkSGFzRHJhZnQoY29tbWVudFRocmVhZCk7XG5cdFx0XHR0aGlzLl9jb21tZW50R2x5cGguc2V0VGhyZWFkU3RhdGUoY29tbWVudFRocmVhZC5zdGF0ZSwgaGFzRHJhZnQpO1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRHbHlwaC5nZXRQb3NpdGlvbigpLnBvc2l0aW9uIS5saW5lTnVtYmVyICE9PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHNob3VsZE1vdmVXaWRnZXQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9jb21tZW50R2x5cGguc2V0TGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoKHNob3VsZE1vdmVXaWRnZXQgJiYgdGhpcy5faXNFeHBhbmRlZCkgfHwgKHRoaXMuX2NvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9PT0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkICYmICF0aGlzLl9pc0V4cGFuZGVkKSkge1xuXHRcdFx0dGhpcy5zaG93KHRoaXMuYXJyb3dQb3NpdGlvbih0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlKSwgMik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9jb21tZW50VGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgIT09IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5sYXlvdXQod2lkdGhJblBpeGVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXQoaGVpZ2h0SW5QaXhlbDogbnVtYmVyLCB3aWR0aEluUGl4ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQubGF5b3V0KHdpZHRoSW5QaXhlbCk7XG5cdH1cblxuXHRhc3luYyBkaXNwbGF5KHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIHNob3VsZFJldmVhbDogYm9vbGVhbikge1xuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0dGhpcy5fY29tbWVudEdseXBoID0gbmV3IENvbW1lbnRHbHlwaFdpZGdldCh0aGlzLmVkaXRvciwgcmFuZ2U/LmVuZExpbmVOdW1iZXIgPz8gLTEpO1xuXHRcdFx0Y29uc3QgaGFzRHJhZnQgPSBjb21tZW50VGhyZWFkSGFzRHJhZnQodGhpcy5fY29tbWVudFRocmVhZCk7XG5cdFx0XHR0aGlzLl9jb21tZW50R2x5cGguc2V0VGhyZWFkU3RhdGUodGhpcy5fY29tbWVudFRocmVhZC5zdGF0ZSwgaGFzRHJhZnQpO1xuXHRcdFx0dGhpcy5fZ2xvYmFsVG9EaXNwb3NlLmFkZCh0aGlzLl9jb21tZW50R2x5cGgub25EaWRDaGFuZ2VMaW5lTnVtYmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2hpZnQgPSBlIC0gKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IG5ld1JhbmdlID0gbmV3IFJhbmdlKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgc2hpZnQsIHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRDb2x1bW4sIHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UuZW5kTGluZU51bWJlciArIHNoaWZ0LCB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UgPSBuZXdSYW5nZTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmRpc3BsYXkodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSwgc2hvdWxkUmV2ZWFsKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5vbkRpZFJlc2l6ZShkaW1lbnNpb24gPT4ge1xuXHRcdFx0dGhpcy5fcmVmcmVzaChkaW1lbnNpb24pO1xuXHRcdH0pKTtcblx0XHRpZiAodGhpcy5fY29tbWVudFRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID09PSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuc2hvdyh0aGlzLmFycm93UG9zaXRpb24ocmFuZ2UpLCAyKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGlzIGlzIGEgbmV3IGNvbW1lbnQgdGhyZWFkIGF3YWl0aW5nIHVzZXIgaW5wdXQgdGhlbiB3ZSBuZWVkIHRvIHJldmVhbCBpdC5cblx0XHRpZiAoc2hvdWxkUmV2ZWFsKSB7XG5cdFx0XHR0aGlzLm1ha2VWaXNpYmxlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5iaW5kQ29tbWVudFRocmVhZExpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBiaW5kQ29tbWVudFRocmVhZExpc3RlbmVycygpIHtcblx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMucHVzaCh0aGlzLl9jb21tZW50VGhyZWFkLm9uRGlkQ2hhbmdlQ29tbWVudHMoYXN5bmMgXyA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZSh0aGlzLl9jb21tZW50VGhyZWFkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMucHVzaCh0aGlzLl9jb21tZW50VGhyZWFkLm9uRGlkQ2hhbmdlQ29sbGFwc2libGVTdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgPT09IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCAmJiAhdGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0XHR0aGlzLnNob3codGhpcy5hcnJvd1Bvc2l0aW9uKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UpLCAyKTtcblx0XHRcdFx0dGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5lbnN1cmVGb2N1c0ludG9OZXdFZGl0aW5nQ29tbWVudCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGF0ZSA9PT0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCAmJiB0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX2luaXRpYWxDb2xsYXBzaWJsZVN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUgPSB0aGlzLl9jb21tZW50VGhyZWFkLm9uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUoc3RhdGUgPT4ge1xuXHRcdFx0XHQvLyBGaWxlIGNvbW1lbnRzIGFsd2F5cyBzdGFydCBleHBhbmRlZFxuXHRcdFx0XHR0aGlzLl9pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPSB0aGlzLl9pbml0aWFsQ29sbGFwc2libGVTdGF0ZTtcblx0XHRcdFx0b25EaWRDaGFuZ2VJbml0aWFsQ29sbGFwc2libGVTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcy5wdXNoKG9uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUpO1xuXHRcdH1cblxuXG5cdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzLnB1c2godGhpcy5fY29tbWVudFRocmVhZC5vbkRpZENoYW5nZVN0YXRlKCgpID0+IHtcblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID1cblx0XHRcdFx0Z2V0Q29tbWVudFRocmVhZFdpZGdldFN0YXRlQ29sb3IodGhpcy5fY29tbWVudFRocmVhZC5zdGF0ZSwgdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0XHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0XHRmcmFtZUNvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdFx0YXJyb3dDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY29udGFpbmVyPy5zdHlsZS5zZXRQcm9wZXJ0eShjb21tZW50VGhyZWFkU3RhdGVDb2xvclZhciwgYCR7Ym9yZGVyQ29sb3J9YCk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lcj8uc3R5bGUuc2V0UHJvcGVydHkoY29tbWVudFRocmVhZFN0YXRlQmFja2dyb3VuZENvbG9yVmFyLCBgJHtib3JkZXJDb2xvci50cmFuc3BhcmVudCguMSl9YCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgc3VibWl0Q29tbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5zdWJtaXRDb21tZW50KCk7XG5cdH1cblxuXHRfcmVmcmVzaChkaW1lbnNpb25zOiBkb20uRGltZW5zaW9uKSB7XG5cdFx0aWYgKCh0aGlzLl9pc0V4cGFuZGVkID09PSB1bmRlZmluZWQpICYmIChkaW1lbnNpb25zLmhlaWdodCA9PT0gMCkgJiYgKGRpbWVuc2lvbnMud2lkdGggPT09IDApKSB7XG5cdFx0XHR0aGlzLmNvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmxheW91dCgpO1xuXG5cdFx0XHRjb25zdCBoZWFkSGVpZ2h0ID0gTWF0aC5jZWlsKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgKiAxLjIpO1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0XHRjb25zdCBhcnJvd0hlaWdodCA9IE1hdGgucm91bmQobGluZUhlaWdodCAvIDMpO1xuXHRcdFx0Y29uc3QgZnJhbWVUaGlja25lc3MgPSBNYXRoLnJvdW5kKGxpbmVIZWlnaHQgLyA5KSAqIDI7XG5cblx0XHRcdGNvbnN0IGNvbXB1dGVkTGluZXNOdW1iZXIgPSBNYXRoLmNlaWwoKGhlYWRIZWlnaHQgKyBkaW1lbnNpb25zLmhlaWdodCArIGFycm93SGVpZ2h0ICsgZnJhbWVUaGlja25lc3MgKyA4IC8qKiBtYXJnaW4gYm90dG9tIHRvIGF2b2lkIG1hcmdpbiBjb2xsYXBzZSAqLykgLyBsaW5lSGVpZ2h0KTtcblxuXHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lPy5oZWlnaHRJbkxpbmVzID09PSBjb21wdXRlZExpbmVzTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudFBvc2l0aW9uID0gdGhpcy5nZXRQb3NpdGlvbigpO1xuXG5cdFx0XHRpZiAodGhpcy5fdmlld1pvbmUgJiYgY3VycmVudFBvc2l0aW9uICYmIGN1cnJlbnRQb3NpdGlvbi5saW5lTnVtYmVyICE9PSB0aGlzLl92aWV3Wm9uZS5hZnRlckxpbmVOdW1iZXIgJiYgdGhpcy5fdmlld1pvbmUuYWZ0ZXJMaW5lTnVtYmVyICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3ZpZXdab25lLmFmdGVyTGluZU51bWJlciA9IGN1cnJlbnRQb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjYXB0dXJlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLmVkaXRvcik7XG5cdFx0XHR0aGlzLl9yZWxheW91dChjb21wdXRlZExpbmVzTnVtYmVyKTtcblx0XHRcdGNhcHR1cmUucmVzdG9yZSh0aGlzLmVkaXRvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUaGVtZSgpIHtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IGdldENvbW1lbnRUaHJlYWRXaWRnZXRTdGF0ZUNvbG9yKHRoaXMuX2NvbW1lbnRUaHJlYWQuc3RhdGUsIHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSkgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0dGhpcy5zdHlsZSh7XG5cdFx0XHRhcnJvd0NvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdGZyYW1lQ29sb3I6IGJvcmRlckNvbG9yXG5cdFx0fSk7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuYXBwbHlUaGVtZShmb250SW5mbyk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG93KHJhbmdlT3JQb3M6IElSYW5nZSB8IElQb3NpdGlvbiB8IHVuZGVmaW5lZCwgaGVpZ2h0SW5MaW5lczogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZ2x5cGhQb3NpdGlvbiA9IHRoaXMuX2NvbW1lbnRHbHlwaD8uZ2V0UG9zaXRpb24oKTtcblx0XHRsZXQgcmFuZ2UgPSBSYW5nZS5pc0lSYW5nZShyYW5nZU9yUG9zKSA/IHJhbmdlT3JQb3MgOiAocmFuZ2VPclBvcyA/IFJhbmdlLmZyb21Qb3NpdGlvbnMocmFuZ2VPclBvcykgOiB1bmRlZmluZWQpO1xuXHRcdGlmIChnbHlwaFBvc2l0aW9uPy5wb3NpdGlvbiAmJiByYW5nZSAmJiBnbHlwaFBvc2l0aW9uLnBvc2l0aW9uLmxpbmVOdW1iZXIgIT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIFRoZSB3aWRnZXQgY291bGQgaGF2ZSBtb3ZlZCBhcyBhIHJlc3VsdCBvZiBlZGl0b3IgY2hhbmdlcy5cblx0XHRcdC8vIFdlIG5lZWQgdG8gdHJ5IHRvIGNhbGN1bGF0ZSB0aGUgbmV3LCBtb3JlIGNvcnJlY3QsIHJhbmdlIGZvciB0aGUgY29tbWVudC5cblx0XHRcdGNvbnN0IGRpc3RhbmNlID0gZ2x5cGhQb3NpdGlvbi5wb3NpdGlvbi5saW5lTnVtYmVyIC0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdHJhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciArIGRpc3RhbmNlLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciArIGRpc3RhbmNlLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhc0V4cGFuZGVkID0gdGhpcy5faXNFeHBhbmRlZDtcblx0XHR0aGlzLl9pc0V4cGFuZGVkID0gdHJ1ZTtcblx0XHRzdXBlci5zaG93KHJhbmdlID8/IG5ldyBSYW5nZSgwLCAwLCAwLCAwKSwgaGVpZ2h0SW5MaW5lcyk7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkO1xuXHRcdHRoaXMuX3JlZnJlc2godGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5nZXREaW1lbnNpb25zKCkpO1xuXHRcdGlmICghd2FzRXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRXhwYW5kZWRTdGF0ZS5maXJlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvbGxhcHNlQW5kRm9jdXNSYW5nZSgpIHtcblx0XHRpZiAoYXdhaXQgdGhpcy5jb2xsYXBzZSh0cnVlKSAmJiBSYW5nZS5pc0lSYW5nZSh0aGlzLmNvbW1lbnRUaHJlYWQucmFuZ2UpICYmIGlzQ29kZUVkaXRvcih0aGlzLmVkaXRvcikpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFNlbGVjdGlvbih0aGlzLmNvbW1lbnRUaHJlYWQucmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGhpZGUoKSB7XG5cdFx0aWYgKHRoaXMuX2lzRXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX2lzRXhwYW5kZWQgPSBmYWxzZTtcblx0XHRcdC8vIEZvY3VzIHRoZSBjb250YWluZXIgc28gdGhhdCB0aGUgY29tbWVudCBlZGl0b3Igd2lsbCBiZSBibHVycmVkIGJlZm9yZSBpdCBpcyBoaWRkZW5cblx0XHRcdGlmICh0aGlzLmVkaXRvci5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cyB8fCAhdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5kZWxldGVDb21tZW50VGhyZWFkKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4cGFuZGVkU3RhdGUuZmlyZShmYWxzZSk7XG5cdFx0fVxuXHRcdHN1cGVyLmhpZGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRHbHlwaCkge1xuXHRcdFx0dGhpcy5fY29tbWVudEdseXBoLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2NvbW1lbnRHbHlwaCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9nbG9iYWxUb0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcy5mb3JFYWNoKGdsb2JhbCA9PiBnbG9iYWwuZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENyZWF0ZVRocmVhZC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHBhbmRlZFN0YXRlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFzQjtBQUMvQixTQUFzQix1QkFBdUI7QUFDN0MsU0FBeUMsY0FB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
