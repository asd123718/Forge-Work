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
import { Action } from "../../../../base/common/actions.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { findFirstIdxMonotonousOrArrLen } from "../../../../base/common/arraysFind.js";
import { createCancelablePromise, Delayer } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import "./media/review.css";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorType } from "../../../../editor/common/editorCommon.js";
import { ModelDecorationOptions, TextModel } from "../../../../editor/common/model/textModel.js";
import * as languages from "../../../../editor/common/languages.js";
import * as nls from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { CommentGlyphWidget } from "./commentGlyphWidget.js";
import { ICommentService } from "./commentService.js";
import { CommentWidgetFocus, isMouseUpEventDragFromMouseDown, parseMouseDownInfoFromEvent, ReviewZoneWidget } from "./commentThreadZoneWidget.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { COMMENTS_VIEW_ID } from "./commentsTreeViewer.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { COMMENTS_SECTION } from "../common/commentsConfiguration.js";
import { COMMENTEDITOR_DECORATION_KEY } from "./commentReply.js";
import { Emitter } from "../../../../base/common/event.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { CommentThreadRangeDecorator } from "./commentThreadRangeDecorator.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { URI } from "../../../../base/common/uri.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { threadHasMeaningfulComments } from "./commentsModel.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
const ID = "editor.contrib.review";
class CommentingRangeDecoration {
  constructor(_editor, _ownerId, _extensionId, _label, _range, options, commentingRangesInfo, isHover = false) {
    this._editor = _editor;
    this._ownerId = _ownerId;
    this._extensionId = _extensionId;
    this._label = _label;
    this._range = _range;
    this.options = options;
    this.commentingRangesInfo = commentingRangesInfo;
    this.isHover = isHover;
    this._startLineNumber = _range.startLineNumber;
    this._endLineNumber = _range.endLineNumber;
  }
  get id() {
    return this._decorationId;
  }
  set id(id) {
    this._decorationId = id;
  }
  get range() {
    return {
      startLineNumber: this._startLineNumber,
      startColumn: 1,
      endLineNumber: this._endLineNumber,
      endColumn: 1
    };
  }
  getCommentAction() {
    return {
      extensionId: this._extensionId,
      label: this._label,
      ownerId: this._ownerId,
      commentingRangesInfo: this.commentingRangesInfo
    };
  }
  getOriginalRange() {
    return this._range;
  }
  getActiveRange() {
    return this.id ? this._editor.getModel().getDecorationRange(this.id) : void 0;
  }
}
const _CommentingRangeDecorator = class _CommentingRangeDecorator {
  constructor() {
    this.commentingRangeDecorations = [];
    this.decorationIds = [];
    this._lastHover = -1;
    this._onDidChangeDecorationsCount = new Emitter();
    this.onDidChangeDecorationsCount = this._onDidChangeDecorationsCount.event;
    const decorationOptions = {
      description: _CommentingRangeDecorator.description,
      isWholeLine: true,
      linesDecorationsClassName: "comment-range-glyph comment-diff-added"
    };
    this.decorationOptions = ModelDecorationOptions.createDynamic(decorationOptions);
    const hoverDecorationOptions = {
      description: _CommentingRangeDecorator.description,
      isWholeLine: true,
      linesDecorationsClassName: `comment-range-glyph line-hover`
    };
    this.hoverDecorationOptions = ModelDecorationOptions.createDynamic(hoverDecorationOptions);
    const multilineDecorationOptions = {
      description: _CommentingRangeDecorator.description,
      isWholeLine: true,
      linesDecorationsClassName: `comment-range-glyph multiline-add`
    };
    this.multilineDecorationOptions = ModelDecorationOptions.createDynamic(multilineDecorationOptions);
  }
  updateHover(hoverLine) {
    if (this._editor && this._infos && hoverLine !== this._lastHover) {
      this._doUpdate(this._editor, this._infos, hoverLine);
    }
    this._lastHover = hoverLine ?? -1;
  }
  updateSelection(cursorLine, range = new Range(0, 0, 0, 0)) {
    this._lastSelection = range.isEmpty() ? void 0 : range;
    this._lastSelectionCursor = range.isEmpty() ? void 0 : cursorLine;
    if (this._editor && this._infos) {
      this._doUpdate(this._editor, this._infos, cursorLine, range);
    }
  }
  update(editor, commentInfos, cursorLine, range) {
    if (editor) {
      this._editor = editor;
      this._infos = commentInfos;
      this._doUpdate(editor, commentInfos, cursorLine, range);
    }
  }
  _lineHasThread(editor, lineRange) {
    return editor.getDecorationsInRange(lineRange)?.find((decoration) => decoration.options.description === CommentGlyphWidget.description);
  }
  _doUpdate(editor, commentInfos, emphasisLine = -1, selectionRange = this._lastSelection) {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    emphasisLine = this._lastSelectionCursor ?? emphasisLine;
    const commentingRangeDecorations = [];
    for (const info of commentInfos) {
      info.commentingRanges.ranges.forEach((range) => {
        const rangeObject = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
        let intersectingSelectionRange = selectionRange ? rangeObject.intersectRanges(selectionRange) : void 0;
        if (selectionRange && emphasisLine >= 0 && intersectingSelectionRange && !(intersectingSelectionRange.startLineNumber === intersectingSelectionRange.endLineNumber && emphasisLine === intersectingSelectionRange.startLineNumber)) {
          let intersectingEmphasisRange;
          if (emphasisLine <= intersectingSelectionRange.startLineNumber) {
            intersectingEmphasisRange = intersectingSelectionRange.collapseToStart();
            intersectingSelectionRange = new Range(intersectingSelectionRange.startLineNumber + 1, 1, intersectingSelectionRange.endLineNumber, 1);
          } else {
            intersectingEmphasisRange = new Range(intersectingSelectionRange.endLineNumber, 1, intersectingSelectionRange.endLineNumber, 1);
            intersectingSelectionRange = new Range(intersectingSelectionRange.startLineNumber, 1, intersectingSelectionRange.endLineNumber - 1, 1);
          }
          commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, intersectingSelectionRange, this.multilineDecorationOptions, info.commentingRanges, true));
          if (!this._lineHasThread(editor, intersectingEmphasisRange)) {
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, intersectingEmphasisRange, this.hoverDecorationOptions, info.commentingRanges, true));
          }
          const beforeRangeEndLine = Math.min(intersectingEmphasisRange.startLineNumber, intersectingSelectionRange.startLineNumber) - 1;
          const hasBeforeRange = rangeObject.startLineNumber <= beforeRangeEndLine;
          const afterRangeStartLine = Math.max(intersectingEmphasisRange.endLineNumber, intersectingSelectionRange.endLineNumber) + 1;
          const hasAfterRange = rangeObject.endLineNumber >= afterRangeStartLine;
          if (hasBeforeRange) {
            const beforeRange = new Range(range.startLineNumber, 1, beforeRangeEndLine, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, beforeRange, this.decorationOptions, info.commentingRanges, true));
          }
          if (hasAfterRange) {
            const afterRange = new Range(afterRangeStartLine, 1, range.endLineNumber, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, afterRange, this.decorationOptions, info.commentingRanges, true));
          }
        } else if (rangeObject.startLineNumber <= emphasisLine && emphasisLine <= rangeObject.endLineNumber) {
          if (rangeObject.startLineNumber < emphasisLine) {
            const beforeRange = new Range(range.startLineNumber, 1, emphasisLine - 1, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, beforeRange, this.decorationOptions, info.commentingRanges, true));
          }
          const emphasisRange = new Range(emphasisLine, 1, emphasisLine, 1);
          if (!this._lineHasThread(editor, emphasisRange)) {
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, emphasisRange, this.hoverDecorationOptions, info.commentingRanges, true));
          }
          if (emphasisLine < rangeObject.endLineNumber) {
            const afterRange = new Range(emphasisLine + 1, 1, range.endLineNumber, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, afterRange, this.decorationOptions, info.commentingRanges, true));
          }
        } else {
          commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, range, this.decorationOptions, info.commentingRanges));
        }
      });
    }
    editor.changeDecorations((accessor) => {
      this.decorationIds = accessor.deltaDecorations(this.decorationIds, commentingRangeDecorations);
      commentingRangeDecorations.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
    });
    const rangesDifference = this.commentingRangeDecorations.length - commentingRangeDecorations.length;
    this.commentingRangeDecorations = commentingRangeDecorations;
    if (rangesDifference) {
      this._onDidChangeDecorationsCount.fire(this.commentingRangeDecorations.length);
    }
  }
  areRangesIntersectingOrTouchingByLine(a, b) {
    if (a.endLineNumber < b.startLineNumber - 1) {
      return false;
    }
    if (b.endLineNumber + 1 < a.startLineNumber) {
      return false;
    }
    return true;
  }
  getMatchedCommentAction(commentRange) {
    if (commentRange === void 0) {
      const foundInfos = this._infos?.filter((info) => info.commentingRanges.fileComments);
      if (foundInfos) {
        return foundInfos.map((foundInfo) => {
          return {
            action: {
              ownerId: foundInfo.uniqueOwner,
              extensionId: foundInfo.extensionId,
              label: foundInfo.label,
              commentingRangesInfo: foundInfo.commentingRanges
            }
          };
        });
      }
      return [];
    }
    const foundHoverActions = /* @__PURE__ */ new Map();
    for (const decoration of this.commentingRangeDecorations) {
      const range = decoration.getActiveRange();
      if (range && this.areRangesIntersectingOrTouchingByLine(range, commentRange)) {
        const action = decoration.getCommentAction();
        const alreadyFoundInfo = foundHoverActions.get(action.ownerId);
        if (alreadyFoundInfo?.action.commentingRangesInfo === action.commentingRangesInfo) {
          const newRange = new Range(
            range.startLineNumber < alreadyFoundInfo.range.startLineNumber ? range.startLineNumber : alreadyFoundInfo.range.startLineNumber,
            range.startColumn < alreadyFoundInfo.range.startColumn ? range.startColumn : alreadyFoundInfo.range.startColumn,
            range.endLineNumber > alreadyFoundInfo.range.endLineNumber ? range.endLineNumber : alreadyFoundInfo.range.endLineNumber,
            range.endColumn > alreadyFoundInfo.range.endColumn ? range.endColumn : alreadyFoundInfo.range.endColumn
          );
          foundHoverActions.set(action.ownerId, { range: newRange, action });
        } else {
          foundHoverActions.set(action.ownerId, { range, action });
        }
      }
    }
    const seenOwners = /* @__PURE__ */ new Set();
    return Array.from(foundHoverActions.values()).filter((action) => {
      if (seenOwners.has(action.action.ownerId)) {
        return false;
      } else {
        seenOwners.add(action.action.ownerId);
        return true;
      }
    });
  }
  getNearestCommentingRange(findPosition, reverse) {
    let findPositionContainedWithin;
    let decorations;
    if (reverse) {
      decorations = [];
      for (let i = this.commentingRangeDecorations.length - 1; i >= 0; i--) {
        decorations.push(this.commentingRangeDecorations[i]);
      }
    } else {
      decorations = this.commentingRangeDecorations;
    }
    for (const decoration of decorations) {
      const range = decoration.getActiveRange();
      if (!range) {
        continue;
      }
      if (findPositionContainedWithin && this.areRangesIntersectingOrTouchingByLine(range, findPositionContainedWithin)) {
        findPositionContainedWithin = Range.plusRange(findPositionContainedWithin, range);
        continue;
      }
      if (range.startLineNumber <= findPosition.lineNumber && findPosition.lineNumber <= range.endLineNumber) {
        findPositionContainedWithin = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
        continue;
      }
      if (!reverse && range.endLineNumber < findPosition.lineNumber) {
        continue;
      }
      if (reverse && range.startLineNumber > findPosition.lineNumber) {
        continue;
      }
      return range;
    }
    return decorations.length > 0 ? decorations[0].getActiveRange() ?? void 0 : void 0;
  }
  dispose() {
    this._onDidChangeDecorationsCount.dispose();
    this.commentingRangeDecorations = [];
  }
};
_CommentingRangeDecorator.description = "commenting-range-decorator";
let CommentingRangeDecorator = _CommentingRangeDecorator;
function moveToNextCommentInThread(commentInfo, type) {
  if (!commentInfo?.comment || !commentInfo?.thread?.comments) {
    return;
  }
  const currentIndex = commentInfo.thread.comments?.indexOf(commentInfo.comment);
  if (currentIndex === void 0 || currentIndex < 0) {
    return;
  }
  if (type === "previous" && currentIndex === 0) {
    return;
  }
  if (type === "next" && currentIndex === commentInfo.thread.comments.length - 1) {
    return;
  }
  const comment = commentInfo.thread.comments?.[type === "previous" ? currentIndex - 1 : currentIndex + 1];
  if (!comment) {
    return;
  }
  return {
    ...commentInfo,
    comment
  };
}
function revealCommentThread(commentService, editorService, uriIdentityService, commentThread, comment, focusReply, pinned, preserveFocus, sideBySide) {
  if (!commentThread.resource) {
    return;
  }
  if (!commentService.isCommentingEnabled) {
    commentService.enableCommenting(true);
  }
  const range = commentThread.range;
  const focus = focusReply ? CommentWidgetFocus.Editor : preserveFocus ? CommentWidgetFocus.None : CommentWidgetFocus.Widget;
  const activeEditor = editorService.activeTextEditorControl;
  const currentActiveResources = isDiffEditor(activeEditor) ? [activeEditor.getOriginalEditor(), activeEditor.getModifiedEditor()] : activeEditor ? [activeEditor] : [];
  const threadToReveal = commentThread.threadId;
  const commentToReveal = comment?.uniqueIdInThread;
  const resource = URI.parse(commentThread.resource);
  for (const editor of currentActiveResources) {
    const model = editor.getModel();
    if (model instanceof TextModel && uriIdentityService.extUri.isEqual(resource, model.uri)) {
      if (threadToReveal && isCodeEditor(editor)) {
        const controller = CommentController.get(editor);
        controller?.revealCommentThread(threadToReveal, commentToReveal, true, focus);
      }
      return;
    }
  }
  editorService.openEditor({
    resource,
    options: {
      pinned,
      preserveFocus,
      selection: range ?? new Range(1, 1, 1, 1)
    }
  }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then((editor) => {
    if (editor) {
      const control = editor.getControl();
      if (threadToReveal && isCodeEditor(control)) {
        const controller = CommentController.get(control);
        controller?.revealCommentThread(threadToReveal, commentToReveal, true, focus);
      }
    }
  });
}
let CommentController = class extends Disposable {
  constructor(editor, commentService, instantiationService, codeEditorService, contextMenuService, quickInputService, viewsService, configurationService, contextKeyService, editorService, keybindingService, accessibilityService, notificationService, uriIdentityService) {
    super();
    this.commentService = commentService;
    this.instantiationService = instantiationService;
    this.codeEditorService = codeEditorService;
    this.contextMenuService = contextMenuService;
    this.quickInputService = quickInputService;
    this.viewsService = viewsService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.keybindingService = keybindingService;
    this.accessibilityService = accessibilityService;
    this.notificationService = notificationService;
    this.uriIdentityService = uriIdentityService;
    this.localToDispose = this._register(new DisposableStore());
    this.mouseDownInfo = null;
    this._commentingRangeSpaceReserved = false;
    this._commentingRangeAmountReserved = 0;
    this._emptyThreadsToAddQueue = [];
    // uniqueOwner -> threadId -> uniqueIdInThread -> pending comment
    this._inProcessContinueOnComments = /* @__PURE__ */ new Map();
    this._editorDisposables = [];
    this._hasRespondedToEditorChange = false;
    this._commentInfos = [];
    this._commentWidgets = [];
    this._pendingNewCommentCache = {};
    this._pendingEditsCache = {};
    this._computePromise = null;
    this._activeCursorHasCommentingRange = CommentContextKeys.activeCursorHasCommentingRange.bindTo(contextKeyService);
    this._activeCursorHasComment = CommentContextKeys.activeCursorHasComment.bindTo(contextKeyService);
    this._activeEditorHasCommentingRange = CommentContextKeys.activeEditorHasCommentingRange.bindTo(contextKeyService);
    this._commentWidgetVisible = CommentContextKeys.commentWidgetVisible.bindTo(contextKeyService);
    if (editor instanceof EmbeddedCodeEditorWidget) {
      return;
    }
    this.editor = editor;
    this._commentingRangeDecorator = this._register(new CommentingRangeDecorator());
    this._register(this._commentingRangeDecorator.onDidChangeDecorationsCount((count) => {
      if (count === 0) {
        this.clearEditorListeners();
      } else if (this._editorDisposables.length === 0) {
        this.registerEditorListeners();
      }
    }));
    this._register(this._commentThreadRangeDecorator = new CommentThreadRangeDecorator(this.commentService));
    this._register(this.commentService.onDidDeleteDataProvider((ownerId) => {
      if (ownerId) {
        delete this._pendingNewCommentCache[ownerId];
        delete this._pendingEditsCache[ownerId];
      } else {
        this._pendingNewCommentCache = {};
        this._pendingEditsCache = {};
      }
      this.beginCompute();
    }));
    this._register(this.commentService.onDidSetDataProvider((_) => this.beginComputeAndHandleEditorChange()));
    this._register(this.commentService.onDidUpdateCommentingRanges((_) => this.beginComputeAndHandleEditorChange()));
    this._register(this.commentService.onDidSetResourceCommentInfos(async (e) => {
      const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
      if (editorURI && editorURI.toString() === e.resource.toString()) {
        await this.setComments(e.commentInfos.filter((commentInfo) => commentInfo !== null));
      }
    }));
    this._register(this.commentService.onDidChangeCommentingEnabled((e) => {
      if (e) {
        this.registerEditorListeners();
        this.beginCompute();
      } else {
        this.tryUpdateReservedSpace();
        this.clearEditorListeners();
        this._commentingRangeDecorator.update(this.editor, []);
        this._commentThreadRangeDecorator.update(this.editor, []);
        dispose(this._commentWidgets);
        this._commentWidgets = [];
      }
    }));
    this._register(this.editor.onWillChangeModel((e) => this.onWillChangeModel(e)));
    this._register(this.editor.onDidChangeModel((_) => this.onModelChanged()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("diffEditor.renderSideBySide")) {
        this.beginCompute();
      }
    }));
    this.onModelChanged();
    this._register(this.codeEditorService.registerDecorationType("comment-controller", COMMENTEDITOR_DECORATION_KEY, {}));
    this._register(
      this.commentService.registerContinueOnCommentProvider({
        provideContinueOnComments: () => {
          const pendingComments = [];
          if (this._commentWidgets) {
            for (const zone of this._commentWidgets) {
              const zonePendingComments = zone.getPendingComments();
              const pendingNewComment = zonePendingComments.newComment;
              if (!pendingNewComment) {
                continue;
              }
              let lastCommentBody;
              if (zone.commentThread.comments && zone.commentThread.comments.length) {
                const lastComment = zone.commentThread.comments[zone.commentThread.comments.length - 1];
                if (typeof lastComment.body === "string") {
                  lastCommentBody = lastComment.body;
                } else {
                  lastCommentBody = lastComment.body.value;
                }
              }
              if (pendingNewComment.body !== lastCommentBody) {
                pendingComments.push({
                  uniqueOwner: zone.uniqueOwner,
                  uri: zone.editor.getModel().uri,
                  range: zone.commentThread.range,
                  comment: pendingNewComment,
                  isReply: zone.commentThread.comments !== void 0 && zone.commentThread.comments.length > 0
                });
              }
            }
          }
          return pendingComments;
        }
      })
    );
  }
  registerEditorListeners() {
    this._editorDisposables = [];
    if (!this.editor) {
      return;
    }
    this._editorDisposables.push(this.editor.onMouseMove((e) => this.onEditorMouseMove(e)));
    this._editorDisposables.push(this.editor.onMouseLeave(() => this.onEditorMouseLeave()));
    this._editorDisposables.push(this.editor.onDidChangeCursorPosition((e) => this.onEditorChangeCursorPosition(e.position)));
    this._editorDisposables.push(this.editor.onDidFocusEditorWidget(() => this.onEditorChangeCursorPosition(this.editor?.getPosition() ?? null)));
    this._editorDisposables.push(this.editor.onDidChangeCursorSelection((e) => this.onEditorChangeCursorSelection(e)));
    this._editorDisposables.push(this.editor.onDidBlurEditorWidget(() => this.onEditorChangeCursorSelection()));
  }
  clearEditorListeners() {
    dispose(this._editorDisposables);
    this._editorDisposables = [];
  }
  onEditorMouseLeave() {
    this._commentingRangeDecorator.updateHover();
  }
  onEditorMouseMove(e) {
    const position = e.target.position?.lineNumber;
    if (e.event.leftButton.valueOf() && position && this.mouseDownInfo) {
      this._commentingRangeDecorator.updateSelection(position, new Range(this.mouseDownInfo.lineNumber, 1, position, 1));
    } else {
      this._commentingRangeDecorator.updateHover(position);
    }
  }
  onEditorChangeCursorSelection(e) {
    const position = this.editor?.getPosition()?.lineNumber;
    if (position) {
      this._commentingRangeDecorator.updateSelection(position, e?.selection);
    }
  }
  onEditorChangeCursorPosition(e) {
    if (!e) {
      return;
    }
    const range = Range.fromPositions(e, { column: -1, lineNumber: e.lineNumber });
    const decorations = this.editor?.getDecorationsInRange(range);
    let hasCommentingRange = false;
    if (decorations) {
      for (const decoration of decorations) {
        if (decoration.options.description === CommentGlyphWidget.description) {
          hasCommentingRange = false;
          break;
        } else if (decoration.options.description === CommentingRangeDecorator.description) {
          hasCommentingRange = true;
        }
      }
    }
    this._activeCursorHasCommentingRange.set(hasCommentingRange);
    this._activeCursorHasComment.set(this.getCommentsAtLine(range).length > 0);
  }
  isEditorInlineOriginal(testEditor) {
    if (this.configurationService.getValue("diffEditor.renderSideBySide")) {
      return false;
    }
    const foundEditor = this.editorService.visibleTextEditorControls.find((editor) => {
      if (editor.getEditorType() === EditorType.IDiffEditor) {
        const diffEditor = editor;
        return diffEditor.getOriginalEditor() === testEditor;
      }
      return false;
    });
    return !!foundEditor;
  }
  beginCompute() {
    this._computePromise = createCancelablePromise((token) => {
      const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
      if (editorURI) {
        return this.commentService.getDocumentComments(editorURI);
      }
      return Promise.resolve([]);
    });
    this._computeAndSetPromise = this._computePromise.then(async (commentInfos) => {
      await this.setComments(coalesce(commentInfos));
      this._computePromise = null;
    }, (error) => console.log(error));
    this._computePromise.then(() => this._computeAndSetPromise = void 0);
    return this._computeAndSetPromise;
  }
  beginComputeCommentingRanges() {
    if (this._computeCommentingRangeScheduler) {
      this._computeCommentingRangeScheduler.trigger(() => {
        const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
        if (editorURI) {
          return this.commentService.getDocumentComments(editorURI);
        }
        return Promise.resolve([]);
      }).then((commentInfos) => {
        if (this.commentService.isCommentingEnabled) {
          const meaningfulCommentInfos = coalesce(commentInfos);
          this._commentingRangeDecorator.update(this.editor, meaningfulCommentInfos, this.editor?.getPosition()?.lineNumber, this.editor?.getSelection() ?? void 0);
        }
      }, (err) => {
        onUnexpectedError(err);
        return null;
      });
    }
  }
  static get(editor) {
    return editor.getContribution(ID);
  }
  revealCommentThread(threadId, commentUniqueId, fetchOnceIfNotExist, focus) {
    const commentThreadWidget = this._commentWidgets.filter((widget) => widget.commentThread.threadId === threadId);
    if (commentThreadWidget.length === 1) {
      commentThreadWidget[0].reveal(commentUniqueId, focus);
    } else if (fetchOnceIfNotExist) {
      if (this._computeAndSetPromise) {
        this._computeAndSetPromise.then((_) => {
          this.revealCommentThread(threadId, commentUniqueId, false, focus);
        });
      } else {
        this.beginCompute().then((_) => {
          this.revealCommentThread(threadId, commentUniqueId, false, focus);
        });
      }
    }
  }
  collapseAll() {
    for (const widget of this._commentWidgets) {
      widget.collapse(true);
    }
  }
  async collapseVisibleComments() {
    if (!this.editor) {
      return;
    }
    const visibleRanges = this.editor.getVisibleRanges();
    for (const widget of this._commentWidgets) {
      if (widget.expanded && widget.commentThread.range) {
        const isVisible = visibleRanges.some(
          (visibleRange) => Range.areIntersectingOrTouching(visibleRange, widget.commentThread.range)
        );
        if (isVisible) {
          await widget.collapse(true);
        }
      }
    }
  }
  _updateCommentWidgetVisibleContext() {
    const hasExpanded = this._commentWidgets.some((widget) => widget.expanded);
    this._commentWidgetVisible.set(hasExpanded);
  }
  expandAll() {
    for (const widget of this._commentWidgets) {
      widget.expand();
    }
  }
  expandUnresolved() {
    for (const widget of this._commentWidgets) {
      if (widget.commentThread.state === languages.CommentThreadState.Unresolved) {
        widget.expand();
      }
    }
  }
  nextCommentThread(focusThread) {
    this._findNearestCommentThread(focusThread);
  }
  _findNearestCommentThread(focusThread, reverse) {
    if (!this._commentWidgets.length || !this.editor?.hasModel()) {
      return;
    }
    const after = reverse ? this.editor.getSelection().getStartPosition() : this.editor.getSelection().getEndPosition();
    const sortedWidgets = this._commentWidgets.sort((a, b) => {
      if (reverse) {
        const temp = a;
        a = b;
        b = temp;
      }
      if (a.commentThread.range === void 0) {
        return -1;
      }
      if (b.commentThread.range === void 0) {
        return 1;
      }
      if (a.commentThread.range.startLineNumber < b.commentThread.range.startLineNumber) {
        return -1;
      }
      if (a.commentThread.range.startLineNumber > b.commentThread.range.startLineNumber) {
        return 1;
      }
      if (a.commentThread.range.startColumn < b.commentThread.range.startColumn) {
        return -1;
      }
      if (a.commentThread.range.startColumn > b.commentThread.range.startColumn) {
        return 1;
      }
      return 0;
    });
    const idx = findFirstIdxMonotonousOrArrLen(sortedWidgets, (widget) => {
      const lineValueOne = reverse ? after.lineNumber : widget.commentThread.range?.startLineNumber ?? 0;
      const lineValueTwo = reverse ? widget.commentThread.range?.startLineNumber ?? 0 : after.lineNumber;
      const columnValueOne = reverse ? after.column : widget.commentThread.range?.startColumn ?? 0;
      const columnValueTwo = reverse ? widget.commentThread.range?.startColumn ?? 0 : after.column;
      if (lineValueOne > lineValueTwo) {
        return true;
      }
      if (lineValueOne < lineValueTwo) {
        return false;
      }
      if (columnValueOne > columnValueTwo) {
        return true;
      }
      return false;
    });
    const nextWidget = sortedWidgets[idx];
    if (nextWidget !== void 0) {
      this.editor.setSelection(nextWidget.commentThread.range ?? new Range(1, 1, 1, 1));
      nextWidget.reveal(void 0, focusThread ? CommentWidgetFocus.Widget : CommentWidgetFocus.None);
    }
  }
  previousCommentThread(focusThread) {
    this._findNearestCommentThread(focusThread, true);
  }
  _findNearestCommentingRange(reverse) {
    if (!this.editor?.hasModel()) {
      return;
    }
    const after = this.editor.getSelection().getEndPosition();
    const range = this._commentingRangeDecorator.getNearestCommentingRange(after, reverse);
    if (range) {
      const position = reverse ? range.getEndPosition() : range.getStartPosition();
      this.editor.setPosition(position);
      this.editor.revealLineInCenterIfOutsideViewport(position.lineNumber);
    }
    if (this.accessibilityService.isScreenReaderOptimized()) {
      const commentRangeStart = range?.getStartPosition().lineNumber;
      const commentRangeEnd = range?.getEndPosition().lineNumber;
      if (commentRangeStart && commentRangeEnd) {
        const oneLine = commentRangeStart === commentRangeEnd;
        oneLine ? status(nls.localize("commentRange", "Line {0}", commentRangeStart)) : status(nls.localize("commentRangeStart", "Lines {0} to {1}", commentRangeStart, commentRangeEnd));
      }
    }
  }
  nextCommentingRange() {
    this._findNearestCommentingRange();
  }
  previousCommentingRange() {
    this._findNearestCommentingRange(true);
  }
  dispose() {
    super.dispose();
    dispose(this._editorDisposables);
    dispose(this._commentWidgets);
    this.editor = null;
  }
  onWillChangeModel(e) {
    if (e.newModelUrl) {
      this.tryUpdateReservedSpace(e.newModelUrl);
    }
  }
  async handleCommentAdded(editorId, uniqueOwner, thread) {
    const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId);
    if (matchedZones.length) {
      return;
    }
    const matchedNewCommentThreadZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === uniqueOwner && zoneWidget.commentThread.commentThreadHandle === -1 && Range.equalsRange(zoneWidget.commentThread.range, thread.range));
    if (matchedNewCommentThreadZones.length) {
      matchedNewCommentThreadZones[0].update(thread);
      return;
    }
    const continueOnCommentIndex = this._inProcessContinueOnComments.get(uniqueOwner)?.findIndex((pending) => {
      if (pending.range === void 0) {
        return thread.range === void 0;
      } else {
        return Range.lift(pending.range).equalsRange(thread.range);
      }
    });
    let continueOnCommentText;
    if (continueOnCommentIndex !== void 0 && continueOnCommentIndex >= 0) {
      continueOnCommentText = this._inProcessContinueOnComments.get(uniqueOwner)?.splice(continueOnCommentIndex, 1)[0].comment.body;
    }
    const pendingCommentText = (this._pendingNewCommentCache[uniqueOwner] && this._pendingNewCommentCache[uniqueOwner][thread.threadId]) ?? continueOnCommentText;
    const pendingEdits = this._pendingEditsCache[uniqueOwner] && this._pendingEditsCache[uniqueOwner][thread.threadId];
    const shouldReveal = thread.canReply && thread.isTemplate && (!thread.comments || thread.comments.length === 0) && (!thread.editorId || thread.editorId === editorId);
    await this.displayCommentThread(uniqueOwner, thread, shouldReveal, pendingCommentText, pendingEdits);
    this._commentInfos.filter((info) => info.uniqueOwner === uniqueOwner)[0].threads.push(thread);
    this.tryUpdateReservedSpace();
  }
  onModelChanged() {
    this.localToDispose.clear();
    this.tryUpdateReservedSpace();
    this.removeCommentWidgetsAndStoreCache();
    if (!this.editor) {
      return;
    }
    this._hasRespondedToEditorChange = false;
    this.localToDispose.add(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
    this.localToDispose.add(this.editor.onMouseUp((e) => this.onEditorMouseUp(e)));
    if (this._editorDisposables.length) {
      this.clearEditorListeners();
      this.registerEditorListeners();
    }
    this._computeCommentingRangeScheduler = new Delayer(200);
    this.localToDispose.add({
      dispose: () => {
        this._computeCommentingRangeScheduler?.cancel();
        this._computeCommentingRangeScheduler = null;
      }
    });
    this.localToDispose.add(this.editor.onDidChangeModelContent(async () => {
      this.beginComputeCommentingRanges();
    }));
    this.localToDispose.add(this.commentService.onDidUpdateCommentThreads(async (e) => {
      const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
      if (!editorURI || !this.commentService.isCommentingEnabled) {
        return;
      }
      if (this._computePromise) {
        await this._computePromise;
      }
      const commentInfo = this._commentInfos.filter((info) => info.uniqueOwner === e.uniqueOwner);
      if (!commentInfo || !commentInfo.length) {
        return;
      }
      const added = e.added.filter((thread) => thread.resource && this.uriIdentityService.extUri.isEqual(URI.parse(thread.resource), editorURI));
      const removed = e.removed.filter((thread) => thread.resource && this.uriIdentityService.extUri.isEqual(URI.parse(thread.resource), editorURI));
      const changed = e.changed.filter((thread) => thread.resource && this.uriIdentityService.extUri.isEqual(URI.parse(thread.resource), editorURI));
      const pending = e.pending.filter((pending2) => this.uriIdentityService.extUri.isEqual(pending2.uri, editorURI));
      removed.forEach((thread) => {
        const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === e.uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId && zoneWidget.commentThread.threadId !== "");
        if (matchedZones.length) {
          const matchedZone = matchedZones[0];
          const index = this._commentWidgets.indexOf(matchedZone);
          this._commentWidgets.splice(index, 1);
          matchedZone.dispose();
        }
        const infosThreads = this._commentInfos.filter((info) => info.uniqueOwner === e.uniqueOwner)[0].threads;
        for (let i = 0; i < infosThreads.length; i++) {
          if (infosThreads[i] === thread) {
            infosThreads.splice(i, 1);
            i--;
          }
        }
      });
      for (const thread of changed) {
        const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === e.uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId);
        if (matchedZones.length) {
          const matchedZone = matchedZones[0];
          matchedZone.update(thread);
          this.openCommentsView(thread);
        }
      }
      const editorId = this.editor?.getId();
      for (const thread of added) {
        await this.handleCommentAdded(editorId, e.uniqueOwner, thread);
      }
      for (const thread of pending) {
        await this.resumePendingComment(editorURI, thread);
      }
      this._commentThreadRangeDecorator.update(this.editor, commentInfo);
    }));
    this.beginComputeAndHandleEditorChange();
  }
  async resumePendingComment(editorURI, thread) {
    const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === thread.uniqueOwner && Range.lift(zoneWidget.commentThread.range)?.equalsRange(thread.range));
    if (thread.isReply && matchedZones.length) {
      this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: true });
      matchedZones[0].setPendingComment(thread.comment);
    } else if (matchedZones.length) {
      this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: false });
      const existingPendingComment = matchedZones[0].getPendingComments().newComment;
      let pendingComment;
      if (!existingPendingComment || thread.comment.body.includes(existingPendingComment.body)) {
        pendingComment = thread.comment;
      } else if (existingPendingComment.body.includes(thread.comment.body)) {
        pendingComment = existingPendingComment;
      } else {
        pendingComment = { body: `${existingPendingComment}
${thread.comment.body}`, cursor: thread.comment.cursor };
      }
      matchedZones[0].setPendingComment(pendingComment);
    } else if (!thread.isReply) {
      const threadStillAvailable = this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: false });
      if (!threadStillAvailable) {
        return;
      }
      if (!this._inProcessContinueOnComments.has(thread.uniqueOwner)) {
        this._inProcessContinueOnComments.set(thread.uniqueOwner, []);
      }
      this._inProcessContinueOnComments.get(thread.uniqueOwner)?.push(thread);
      await this.commentService.createCommentThreadTemplate(thread.uniqueOwner, thread.uri, thread.range ? Range.lift(thread.range) : void 0);
    }
  }
  beginComputeAndHandleEditorChange() {
    this.beginCompute().then(() => {
      if (!this._hasRespondedToEditorChange) {
        if (this._commentInfos.some((commentInfo) => commentInfo.commentingRanges.ranges.length > 0 || commentInfo.commentingRanges.fileComments)) {
          this._hasRespondedToEditorChange = true;
          const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Comments);
          if (verbose) {
            const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
            if (keybinding) {
              status(nls.localize("hasCommentRangesKb", "Editor has commenting ranges, run the command Open Accessibility Help ({0}), for more information.", keybinding));
            } else {
              status(nls.localize("hasCommentRangesNoKb", "Editor has commenting ranges, run the command Open Accessibility Help, which is currently not triggerable via keybinding, for more information."));
            }
          } else {
            status(nls.localize("hasCommentRanges", "Editor has commenting ranges."));
          }
        }
      }
    });
  }
  async openCommentsView(thread) {
    if (thread.comments && thread.comments.length > 0 && threadHasMeaningfulComments(thread)) {
      const openViewState = this.configurationService.getValue(COMMENTS_SECTION).openView;
      if (openViewState === "file") {
        return this.viewsService.openView(COMMENTS_VIEW_ID);
      } else if (openViewState === "firstFile" || openViewState === "firstFileUnresolved" && thread.state === languages.CommentThreadState.Unresolved) {
        const hasShownView = this.viewsService.getViewWithId(COMMENTS_VIEW_ID)?.hasRendered;
        if (!hasShownView) {
          return this.viewsService.openView(COMMENTS_VIEW_ID);
        }
      }
    }
    return void 0;
  }
  async displayCommentThread(uniqueOwner, thread, shouldReveal, pendingComment, pendingEdits) {
    const editor = this.editor?.getModel();
    if (!editor) {
      return;
    }
    if (!this.editor || this.isEditorInlineOriginal(this.editor)) {
      return;
    }
    let continueOnCommentReply;
    if (thread.range && !pendingComment) {
      continueOnCommentReply = this.commentService.removeContinueOnComment({ uniqueOwner, uri: editor.uri, range: thread.range, isReply: true });
    }
    const zoneWidget = this.instantiationService.createInstance(ReviewZoneWidget, this.editor, uniqueOwner, thread, pendingComment ?? continueOnCommentReply?.comment, pendingEdits);
    await zoneWidget.display(thread.range, shouldReveal);
    this._commentWidgets.push(zoneWidget);
    this.localToDispose.add(zoneWidget.onDidChangeExpandedState(() => this._updateCommentWidgetVisibleContext()));
    this.localToDispose.add(zoneWidget.onDidClose(() => this._updateCommentWidgetVisibleContext()));
    this.openCommentsView(thread);
  }
  onEditorMouseDown(e) {
    this.mouseDownInfo = (e.target.element?.className.indexOf("comment-range-glyph") ?? -1) >= 0 ? parseMouseDownInfoFromEvent(e) : null;
  }
  onEditorMouseUp(e) {
    const matchedLineNumber = isMouseUpEventDragFromMouseDown(this.mouseDownInfo, e);
    this.mouseDownInfo = null;
    if (!this.editor || matchedLineNumber === null || !e.target.element) {
      return;
    }
    const mouseUpIsOnDecorator = e.target.element.className.indexOf("comment-range-glyph") >= 0;
    const lineNumber = e.target.position.lineNumber;
    let range;
    let selection;
    if (matchedLineNumber !== lineNumber) {
      if (matchedLineNumber > lineNumber) {
        selection = new Range(matchedLineNumber, this.editor.getModel().getLineLength(matchedLineNumber) + 1, lineNumber, 1);
      } else {
        selection = new Range(matchedLineNumber, 1, lineNumber, this.editor.getModel().getLineLength(lineNumber) + 1);
      }
    } else if (mouseUpIsOnDecorator) {
      selection = this.editor.getSelection();
    }
    if (selection && selection.startLineNumber <= lineNumber && lineNumber <= selection.endLineNumber) {
      range = selection;
      this.editor.setSelection(new Range(selection.endLineNumber, 1, selection.endLineNumber, 1));
    } else if (mouseUpIsOnDecorator) {
      range = new Range(lineNumber, 1, lineNumber, 1);
    }
    if (range) {
      this.addOrToggleCommentAtLine(range, e);
    }
  }
  getCommentsAtLine(commentRange) {
    return this._commentWidgets.filter((widget) => widget.getGlyphPosition() === (commentRange ? commentRange.endLineNumber : 0));
  }
  async addOrToggleCommentAtLine(commentRange, e) {
    if (!this._addInProgress) {
      this._addInProgress = true;
      const existingCommentsAtLine = this.getCommentsAtLine(commentRange);
      if (existingCommentsAtLine.length) {
        const allExpanded = existingCommentsAtLine.every((widget) => widget.expanded);
        existingCommentsAtLine.forEach(allExpanded ? (widget) => widget.collapse(true) : (widget) => widget.expand(true));
        this.processNextThreadToAdd();
        return;
      } else {
        this.addCommentAtLine(commentRange, e);
      }
    } else {
      this._emptyThreadsToAddQueue.push([commentRange, e]);
    }
  }
  processNextThreadToAdd() {
    this._addInProgress = false;
    const info = this._emptyThreadsToAddQueue.shift();
    if (info) {
      this.addOrToggleCommentAtLine(info[0], info[1]);
    }
  }
  clipUserRangeToCommentRange(userRange, commentRange) {
    if (userRange.startLineNumber < commentRange.startLineNumber) {
      userRange = new Range(commentRange.startLineNumber, commentRange.startColumn, userRange.endLineNumber, userRange.endColumn);
    }
    if (userRange.endLineNumber > commentRange.endLineNumber) {
      userRange = new Range(userRange.startLineNumber, userRange.startColumn, commentRange.endLineNumber, commentRange.endColumn);
    }
    return userRange;
  }
  addCommentAtLine(range, e) {
    const newCommentInfos = this._commentingRangeDecorator.getMatchedCommentAction(range);
    if (!newCommentInfos.length || !this.editor?.hasModel()) {
      this._addInProgress = false;
      if (!newCommentInfos.length) {
        if (range) {
          this.notificationService.error(nls.localize("comments.addCommand.error", "The cursor must be within a commenting range to add a comment."));
        } else {
          this.notificationService.error(nls.localize("comments.addFileCommentCommand.error", "File comments are not allowed on this file."));
        }
      }
      return Promise.resolve();
    }
    if (newCommentInfos.length > 1) {
      if (e && range) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => e.event,
          getActions: () => this.getContextMenuActions(newCommentInfos, range),
          getActionsContext: () => newCommentInfos.length ? newCommentInfos[0] : void 0,
          onHide: () => {
            this._addInProgress = false;
          }
        });
        return Promise.resolve();
      } else {
        const picks = this.getCommentProvidersQuickPicks(newCommentInfos);
        return this.quickInputService.pick(picks, { placeHolder: nls.localize("pickCommentService", "Select Comment Provider"), matchOnDescription: true }).then((pick) => {
          if (!pick) {
            return;
          }
          const commentInfos = newCommentInfos.filter((info) => info.action.ownerId === pick.id);
          if (commentInfos.length) {
            const { ownerId } = commentInfos[0].action;
            const clippedRange = range && commentInfos[0].range ? this.clipUserRangeToCommentRange(range, commentInfos[0].range) : range;
            this.addCommentAtLine2(clippedRange, ownerId);
          }
        }).then(() => {
          this._addInProgress = false;
        });
      }
    } else {
      const { ownerId } = newCommentInfos[0].action;
      const clippedRange = range && newCommentInfos[0].range ? this.clipUserRangeToCommentRange(range, newCommentInfos[0].range) : range;
      this.addCommentAtLine2(clippedRange, ownerId);
    }
    return Promise.resolve();
  }
  getCommentProvidersQuickPicks(commentInfos) {
    const picks = commentInfos.map((commentInfo) => {
      const { ownerId, extensionId, label } = commentInfo.action;
      return {
        label: label ?? extensionId ?? ownerId,
        id: ownerId
      };
    });
    return picks;
  }
  getContextMenuActions(commentInfos, commentRange) {
    const actions = [];
    commentInfos.forEach((commentInfo) => {
      const { ownerId, extensionId, label } = commentInfo.action;
      actions.push(new Action(
        "addCommentThread",
        `${label || extensionId}`,
        void 0,
        true,
        () => {
          const clippedRange = commentInfo.range ? this.clipUserRangeToCommentRange(commentRange, commentInfo.range) : commentRange;
          this.addCommentAtLine2(clippedRange, ownerId);
          return Promise.resolve();
        }
      ));
    });
    return actions;
  }
  addCommentAtLine2(range, ownerId) {
    if (!this.editor) {
      return;
    }
    this.commentService.createCommentThreadTemplate(ownerId, this.editor.getModel().uri, range, this.editor.getId());
    this.processNextThreadToAdd();
    return;
  }
  getExistingCommentEditorOptions(editor) {
    const lineDecorationsWidth = editor.getOption(EditorOption.lineDecorationsWidth);
    let extraEditorClassName = [];
    const configuredExtraClassName = editor.getRawOptions().extraEditorClassName;
    if (configuredExtraClassName) {
      extraEditorClassName = configuredExtraClassName.split(" ");
    }
    return { lineDecorationsWidth, extraEditorClassName };
  }
  getWithoutCommentsEditorOptions(editor, extraEditorClassName, startingLineDecorationsWidth) {
    let lineDecorationsWidth = startingLineDecorationsWidth;
    const inlineCommentPos = extraEditorClassName.findIndex((name) => name === "inline-comment");
    if (inlineCommentPos >= 0) {
      extraEditorClassName.splice(inlineCommentPos, 1);
    }
    const options = editor.getOptions();
    if (options.get(EditorOption.folding) && options.get(EditorOption.showFoldingControls) !== "never") {
      lineDecorationsWidth += 11;
    }
    lineDecorationsWidth -= 24;
    return { extraEditorClassName, lineDecorationsWidth };
  }
  getWithCommentsLineDecorationWidth(editor, startingLineDecorationsWidth) {
    let lineDecorationsWidth = startingLineDecorationsWidth;
    const options = editor.getOptions();
    if (options.get(EditorOption.folding) && options.get(EditorOption.showFoldingControls) !== "never") {
      lineDecorationsWidth -= 11;
    }
    lineDecorationsWidth += 24;
    this._commentingRangeAmountReserved = lineDecorationsWidth;
    return this._commentingRangeAmountReserved;
  }
  getWithCommentsEditorOptions(editor, extraEditorClassName, startingLineDecorationsWidth) {
    extraEditorClassName.push("inline-comment");
    return { lineDecorationsWidth: this.getWithCommentsLineDecorationWidth(editor, startingLineDecorationsWidth), extraEditorClassName };
  }
  updateEditorLayoutOptions(editor, extraEditorClassName, lineDecorationsWidth) {
    editor.updateOptions({
      extraEditorClassName: extraEditorClassName.join(" "),
      lineDecorationsWidth
    });
  }
  ensureCommentingRangeReservedAmount(editor) {
    const existing = this.getExistingCommentEditorOptions(editor);
    if (existing.lineDecorationsWidth !== this._commentingRangeAmountReserved) {
      editor.updateOptions({
        lineDecorationsWidth: this.getWithCommentsLineDecorationWidth(editor, existing.lineDecorationsWidth)
      });
    }
  }
  tryUpdateReservedSpace(uri) {
    if (!this.editor) {
      return;
    }
    const hasCommentsOrRangesInInfo = this._commentInfos.some((info) => {
      const hasRanges = Boolean(info.commentingRanges && (Array.isArray(info.commentingRanges) ? info.commentingRanges : info.commentingRanges.ranges).length);
      return hasRanges || info.threads.length > 0;
    });
    uri = uri ?? this.editor.getModel()?.uri;
    const resourceHasCommentingRanges = uri ? this.commentService.resourceHasCommentingRanges(uri) : false;
    const hasCommentsOrRanges = hasCommentsOrRangesInInfo || resourceHasCommentingRanges;
    if (hasCommentsOrRanges && this.commentService.isCommentingEnabled) {
      if (!this._commentingRangeSpaceReserved) {
        this._commentingRangeSpaceReserved = true;
        const { lineDecorationsWidth, extraEditorClassName } = this.getExistingCommentEditorOptions(this.editor);
        const newOptions = this.getWithCommentsEditorOptions(this.editor, extraEditorClassName, lineDecorationsWidth);
        this.updateEditorLayoutOptions(this.editor, newOptions.extraEditorClassName, newOptions.lineDecorationsWidth);
      } else {
        this.ensureCommentingRangeReservedAmount(this.editor);
      }
    } else if ((!hasCommentsOrRanges || !this.commentService.isCommentingEnabled) && this._commentingRangeSpaceReserved) {
      this._commentingRangeSpaceReserved = false;
      const { lineDecorationsWidth, extraEditorClassName } = this.getExistingCommentEditorOptions(this.editor);
      const newOptions = this.getWithoutCommentsEditorOptions(this.editor, extraEditorClassName, lineDecorationsWidth);
      this.updateEditorLayoutOptions(this.editor, newOptions.extraEditorClassName, newOptions.lineDecorationsWidth);
    }
  }
  async setComments(commentInfos) {
    if (!this.editor || !this.commentService.isCommentingEnabled) {
      return;
    }
    this._commentInfos = commentInfos;
    this.tryUpdateReservedSpace();
    this.removeCommentWidgetsAndStoreCache();
    let hasCommentingRanges = false;
    for (const info of this._commentInfos) {
      if (!hasCommentingRanges && (info.commentingRanges.ranges.length > 0 || info.commentingRanges.fileComments)) {
        hasCommentingRanges = true;
      }
      const providerCacheStore = this._pendingNewCommentCache[info.uniqueOwner];
      const providerEditsCacheStore = this._pendingEditsCache[info.uniqueOwner];
      info.threads = info.threads.filter((thread) => !thread.isDisposed);
      for (const thread of info.threads) {
        let pendingComment = void 0;
        if (providerCacheStore) {
          pendingComment = providerCacheStore[thread.threadId];
        }
        let pendingEdits = void 0;
        if (providerEditsCacheStore) {
          pendingEdits = providerEditsCacheStore[thread.threadId];
        }
        await this.displayCommentThread(info.uniqueOwner, thread, false, pendingComment, pendingEdits);
      }
      for (const thread of info.pendingCommentThreads ?? []) {
        this.resumePendingComment(this.editor.getModel().uri, thread);
      }
    }
    this._commentingRangeDecorator.update(this.editor, this._commentInfos);
    this._commentThreadRangeDecorator.update(this.editor, this._commentInfos);
    if (hasCommentingRanges) {
      this._activeEditorHasCommentingRange.set(true);
    } else {
      this._activeEditorHasCommentingRange.set(false);
    }
  }
  collapseAndFocusRange(threadId) {
    this._commentWidgets?.find((widget) => widget.commentThread.threadId === threadId)?.collapseAndFocusRange();
  }
  removeCommentWidgetsAndStoreCache() {
    if (this._commentWidgets) {
      this._commentWidgets.forEach((zone) => {
        const pendingComments = zone.getPendingComments();
        const pendingNewComment = pendingComments.newComment;
        const providerNewCommentCacheStore = this._pendingNewCommentCache[zone.uniqueOwner];
        let lastCommentBody;
        if (zone.commentThread.comments && zone.commentThread.comments.length) {
          const lastComment = zone.commentThread.comments[zone.commentThread.comments.length - 1];
          if (typeof lastComment.body === "string") {
            lastCommentBody = lastComment.body;
          } else {
            lastCommentBody = lastComment.body.value;
          }
        }
        if (pendingNewComment && pendingNewComment.body !== lastCommentBody) {
          if (!providerNewCommentCacheStore) {
            this._pendingNewCommentCache[zone.uniqueOwner] = {};
          }
          this._pendingNewCommentCache[zone.uniqueOwner][zone.commentThread.threadId] = pendingNewComment;
        } else {
          if (providerNewCommentCacheStore) {
            delete providerNewCommentCacheStore[zone.commentThread.threadId];
          }
        }
        const pendingEdits = pendingComments.edits;
        const providerEditsCacheStore = this._pendingEditsCache[zone.uniqueOwner];
        if (Object.keys(pendingEdits).length > 0) {
          if (!providerEditsCacheStore) {
            this._pendingEditsCache[zone.uniqueOwner] = {};
          }
          this._pendingEditsCache[zone.uniqueOwner][zone.commentThread.threadId] = pendingEdits;
        } else if (providerEditsCacheStore) {
          delete providerEditsCacheStore[zone.commentThread.threadId];
        }
        zone.dispose();
      });
    }
    this._commentWidgets = [];
  }
};
CommentController = __decorateClass([
  __decorateParam(1, ICommentService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, IUriIdentityService)
], CommentController);
export {
  CommentController,
  ID,
  moveToNextCommentInThread,
  revealCommentThread
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50c0NvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvcmV2aWV3LmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvclR5cGUsIElEaWZmRWRpdG9yLCBJRWRpdG9yLCBJRWRpdG9yQ29udHJpYnV0aW9uLCBJTW9kZWxDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgSU1vZGVsRGVsdGFEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zLCBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBDb21tZW50R2x5cGhXaWRnZXQgfSBmcm9tICcuL2NvbW1lbnRHbHlwaFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudEluZm8sIElDb21tZW50U2VydmljZSB9IGZyb20gJy4vY29tbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWVudFdpZGdldEZvY3VzLCBpc01vdXNlVXBFdmVudERyYWdGcm9tTW91c2VEb3duLCBwYXJzZU1vdXNlRG93bkluZm9Gcm9tRXZlbnQsIFJldmlld1pvbmVXaWRnZXQgfSBmcm9tICcuL2NvbW1lbnRUaHJlYWRab25lV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ09NTUVOVFNfVklFV19JRCB9IGZyb20gJy4vY29tbWVudHNUcmVlVmlld2VyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ09NTUVOVFNfU0VDVElPTiwgSUNvbW1lbnRzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50c0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ09NTUVOVEVESVRPUl9ERUNPUkFUSU9OX0tFWSB9IGZyb20gJy4vY29tbWVudFJlcGx5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tZW50VGhyZWFkUmFuZ2VEZWNvcmF0b3IgfSBmcm9tICcuL2NvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvci5qcyc7XG5pbXBvcnQgeyBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgQ29tbWVudHNQYW5lbCB9IGZyb20gJy4vY29tbWVudHNWaWV3LmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQ29tbWVudENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IHRocmVhZEhhc01lYW5pbmdmdWxDb21tZW50cyB9IGZyb20gJy4vY29tbWVudHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IElEID0gJ2VkaXRvci5jb250cmliLnJldmlldyc7XG5cbmludGVyZmFjZSBDb21tZW50UmFuZ2VBY3Rpb24ge1xuXHRvd25lcklkOiBzdHJpbmc7XG5cdGV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbW1lbnRpbmdSYW5nZXNJbmZvOiBsYW5ndWFnZXMuQ29tbWVudGluZ1Jhbmdlcztcbn1cblxuaW50ZXJmYWNlIE1lcmdlZENvbW1lbnRSYW5nZUFjdGlvbnMge1xuXHRyYW5nZT86IFJhbmdlO1xuXHRhY3Rpb246IENvbW1lbnRSYW5nZUFjdGlvbjtcbn1cblxuY2xhc3MgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbiBpbXBsZW1lbnRzIElNb2RlbERlbHRhRGVjb3JhdGlvbiB7XG5cdHByaXZhdGUgX2RlY29yYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHJpdmF0ZSBfZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXG5cdHB1YmxpYyBnZXQgaWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbklkO1xuXHR9XG5cblx0cHVibGljIHNldCBpZChpZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbklkID0gaWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJhbmdlKCk6IElSYW5nZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogdGhpcy5fc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogMSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IHRoaXMuX2VuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogMVxuXHRcdH07XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9lZGl0b3I6IElDb2RlRWRpdG9yLCBwcml2YXRlIF9vd25lcklkOiBzdHJpbmcsIHByaXZhdGUgX2V4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHByaXZhdGUgX2xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHByaXZhdGUgX3JhbmdlOiBJUmFuZ2UsIHB1YmxpYyByZWFkb25seSBvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zLCBwcml2YXRlIGNvbW1lbnRpbmdSYW5nZXNJbmZvOiBsYW5ndWFnZXMuQ29tbWVudGluZ1JhbmdlcywgcHVibGljIHJlYWRvbmx5IGlzSG92ZXI6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciA9IF9yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5fZW5kTGluZU51bWJlciA9IF9yYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHR9XG5cblx0cHVibGljIGdldENvbW1lbnRBY3Rpb24oKTogQ29tbWVudFJhbmdlQWN0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHRoaXMuX2V4dGVuc2lvbklkLFxuXHRcdFx0bGFiZWw6IHRoaXMuX2xhYmVsLFxuXHRcdFx0b3duZXJJZDogdGhpcy5fb3duZXJJZCxcblx0XHRcdGNvbW1lbnRpbmdSYW5nZXNJbmZvOiB0aGlzLmNvbW1lbnRpbmdSYW5nZXNJbmZvXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRPcmlnaW5hbFJhbmdlKCkge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVSYW5nZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5pZCA/IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpIS5nZXREZWNvcmF0aW9uUmFuZ2UodGhpcy5pZCkgOiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgQ29tbWVudGluZ1JhbmdlRGVjb3JhdG9yIHtcblx0cHVibGljIHN0YXRpYyBkZXNjcmlwdGlvbiA9ICdjb21tZW50aW5nLXJhbmdlLWRlY29yYXRvcic7XG5cdHByaXZhdGUgZGVjb3JhdGlvbk9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgaG92ZXJEZWNvcmF0aW9uT3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBtdWx0aWxpbmVEZWNvcmF0aW9uT3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblx0cHJpdmF0ZSBjb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uczogQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbltdID0gW107XG5cdHByaXZhdGUgZGVjb3JhdGlvbklkczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW5mb3M6IElDb21tZW50SW5mb1tdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0SG92ZXI6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIF9sYXN0U2VsZWN0aW9uOiBSYW5nZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFNlbGVjdGlvbkN1cnNvcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZURlY29yYXRpb25zQ291bnQ6IEVtaXR0ZXI8bnVtYmVyPiA9IG5ldyBFbWl0dGVyKCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZURlY29yYXRpb25zQ291bnQgPSB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zQ291bnQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbk9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdFx0ZGVzY3JpcHRpb246IENvbW1lbnRpbmdSYW5nZURlY29yYXRvci5kZXNjcmlwdGlvbixcblx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0bGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogJ2NvbW1lbnQtcmFuZ2UtZ2x5cGggY29tbWVudC1kaWZmLWFkZGVkJ1xuXHRcdH07XG5cblx0XHR0aGlzLmRlY29yYXRpb25PcHRpb25zID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKGRlY29yYXRpb25PcHRpb25zKTtcblxuXHRcdGNvbnN0IGhvdmVyRGVjb3JhdGlvbk9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdFx0ZGVzY3JpcHRpb246IENvbW1lbnRpbmdSYW5nZURlY29yYXRvci5kZXNjcmlwdGlvbixcblx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0bGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogYGNvbW1lbnQtcmFuZ2UtZ2x5cGggbGluZS1ob3ZlcmBcblx0XHR9O1xuXG5cdFx0dGhpcy5ob3ZlckRlY29yYXRpb25PcHRpb25zID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKGhvdmVyRGVjb3JhdGlvbk9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgbXVsdGlsaW5lRGVjb3JhdGlvbk9wdGlvbnM6IElNb2RlbERlY29yYXRpb25PcHRpb25zID0ge1xuXHRcdFx0ZGVzY3JpcHRpb246IENvbW1lbnRpbmdSYW5nZURlY29yYXRvci5kZXNjcmlwdGlvbixcblx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0bGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogYGNvbW1lbnQtcmFuZ2UtZ2x5cGggbXVsdGlsaW5lLWFkZGBcblx0XHR9O1xuXG5cdFx0dGhpcy5tdWx0aWxpbmVEZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyhtdWx0aWxpbmVEZWNvcmF0aW9uT3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlSG92ZXIoaG92ZXJMaW5lPzogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvciAmJiB0aGlzLl9pbmZvcyAmJiAoaG92ZXJMaW5lICE9PSB0aGlzLl9sYXN0SG92ZXIpKSB7XG5cdFx0XHR0aGlzLl9kb1VwZGF0ZSh0aGlzLl9lZGl0b3IsIHRoaXMuX2luZm9zLCBob3ZlckxpbmUpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0SG92ZXIgPSBob3ZlckxpbmUgPz8gLTE7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlU2VsZWN0aW9uKGN1cnNvckxpbmU6IG51bWJlciwgcmFuZ2U6IFJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApKSB7XG5cdFx0dGhpcy5fbGFzdFNlbGVjdGlvbiA9IHJhbmdlLmlzRW1wdHkoKSA/IHVuZGVmaW5lZCA6IHJhbmdlO1xuXHRcdHRoaXMuX2xhc3RTZWxlY3Rpb25DdXJzb3IgPSByYW5nZS5pc0VtcHR5KCkgPyB1bmRlZmluZWQgOiBjdXJzb3JMaW5lO1xuXHRcdC8vIFNvbWUgc2NlbmFyaW9zOlxuXHRcdC8vIFNlbGVjdGlvbiBpcyBtYWRlLiBFbXBoYXNpcyBzaG91bGQgc2hvdyBvbiB0aGUgZHJhZy9zZWxlY3Rpb24gZW5kIGxvY2F0aW9uLlxuXHRcdC8vIFNlbGVjdGlvbiBpcyBtYWRlLCB0aGVuIHVzZXIgY2xpY2tzIGVsc2V3aGVyZS4gV2Ugc2hvdWxkIHN0aWxsIHNob3cgdGhlIGRlY29yYXRpb24uXG5cdFx0aWYgKHRoaXMuX2VkaXRvciAmJiB0aGlzLl9pbmZvcykge1xuXHRcdFx0dGhpcy5fZG9VcGRhdGUodGhpcy5fZWRpdG9yLCB0aGlzLl9pbmZvcywgY3Vyc29yTGluZSwgcmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1cGRhdGUoZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCwgY29tbWVudEluZm9zOiBJQ29tbWVudEluZm9bXSwgY3Vyc29yTGluZT86IG51bWJlciwgcmFuZ2U/OiBSYW5nZSkge1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0XHRcdHRoaXMuX2luZm9zID0gY29tbWVudEluZm9zO1xuXHRcdFx0dGhpcy5fZG9VcGRhdGUoZWRpdG9yLCBjb21tZW50SW5mb3MsIGN1cnNvckxpbmUsIHJhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9saW5lSGFzVGhyZWFkKGVkaXRvcjogSUNvZGVFZGl0b3IsIGxpbmVSYW5nZTogUmFuZ2UpIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldERlY29yYXRpb25zSW5SYW5nZShsaW5lUmFuZ2UpPy5maW5kKGRlY29yYXRpb24gPT4gZGVjb3JhdGlvbi5vcHRpb25zLmRlc2NyaXB0aW9uID09PSBDb21tZW50R2x5cGhXaWRnZXQuZGVzY3JpcHRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9VcGRhdGUoZWRpdG9yOiBJQ29kZUVkaXRvciwgY29tbWVudEluZm9zOiBJQ29tbWVudEluZm9bXSwgZW1waGFzaXNMaW5lOiBudW1iZXIgPSAtMSwgc2VsZWN0aW9uUmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkID0gdGhpcy5fbGFzdFNlbGVjdGlvbikge1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlJ3Mgc3RpbGwgYSBzZWxlY3Rpb24sIHVzZSB0aGF0LlxuXHRcdGVtcGhhc2lzTGluZSA9IHRoaXMuX2xhc3RTZWxlY3Rpb25DdXJzb3IgPz8gZW1waGFzaXNMaW5lO1xuXG5cdFx0Y29uc3QgY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnM6IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaW5mbyBvZiBjb21tZW50SW5mb3MpIHtcblx0XHRcdGluZm8uY29tbWVudGluZ1Jhbmdlcy5yYW5nZXMuZm9yRWFjaChyYW5nZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJhbmdlT2JqZWN0ID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHRcdGxldCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZSA9IHNlbGVjdGlvblJhbmdlID8gcmFuZ2VPYmplY3QuaW50ZXJzZWN0UmFuZ2VzKHNlbGVjdGlvblJhbmdlKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKChzZWxlY3Rpb25SYW5nZSAmJiAoZW1waGFzaXNMaW5lID49IDApICYmIGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlKVxuXHRcdFx0XHRcdC8vIElmIHRoZXJlJ3Mgb25seSBvbmUgc2VsZWN0aW9uIGxpbmUsIHRoZW4ganVzdCBkcm9wIGludG8gdGhlIGVsc2UgaWYgYW5kIHNob3cgYW4gZW1waGFzaXMgbGluZS5cblx0XHRcdFx0XHQmJiAhKChpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLmVuZExpbmVOdW1iZXIpXG5cdFx0XHRcdFx0XHQmJiAoZW1waGFzaXNMaW5lID09PSBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIpKSkge1xuXHRcdFx0XHRcdC8vIFRoZSBlbXBoYXNpc0xpbmUgc2hvdWxkIGJlIHdpdGhpbiB0aGUgY29tbWVudGluZyByYW5nZSwgZXZlbiBpZiB0aGUgc2VsZWN0aW9uIHJhbmdlIHN0cmV0Y2hlc1xuXHRcdFx0XHRcdC8vIG91dHNpZGUgb2YgdGhlIGNvbW1lbnRpbmcgcmFuZ2UuXG5cdFx0XHRcdFx0Ly8gQ2xpcCB0aGUgZW1waGFzaXMgYW5kIHNlbGVjdGlvbiByYW5nZXMgdG8gdGhlIGNvbW1lbnRpbmcgcmFuZ2Vcblx0XHRcdFx0XHRsZXQgaW50ZXJzZWN0aW5nRW1waGFzaXNSYW5nZTogUmFuZ2U7XG5cdFx0XHRcdFx0aWYgKGVtcGhhc2lzTGluZSA8PSBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGludGVyc2VjdGluZ0VtcGhhc2lzUmFuZ2UgPSBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5jb2xsYXBzZVRvU3RhcnQoKTtcblx0XHRcdFx0XHRcdGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlID0gbmV3IFJhbmdlKGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlciArIDEsIDEsIGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLmVuZExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbnRlcnNlY3RpbmdFbXBoYXNpc1JhbmdlID0gbmV3IFJhbmdlKGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLmVuZExpbmVOdW1iZXIsIDEsIGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLmVuZExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRcdFx0aW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2UgPSBuZXcgUmFuZ2UoaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxLCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLnB1c2gobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24oZWRpdG9yLCBpbmZvLnVuaXF1ZU93bmVyLCBpbmZvLmV4dGVuc2lvbklkLCBpbmZvLmxhYmVsLCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZSwgdGhpcy5tdWx0aWxpbmVEZWNvcmF0aW9uT3B0aW9ucywgaW5mby5jb21tZW50aW5nUmFuZ2VzLCB0cnVlKSk7XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuX2xpbmVIYXNUaHJlYWQoZWRpdG9yLCBpbnRlcnNlY3RpbmdFbXBoYXNpc1JhbmdlKSkge1xuXHRcdFx0XHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMucHVzaChuZXcgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbihlZGl0b3IsIGluZm8udW5pcXVlT3duZXIsIGluZm8uZXh0ZW5zaW9uSWQsIGluZm8ubGFiZWwsIGludGVyc2VjdGluZ0VtcGhhc2lzUmFuZ2UsIHRoaXMuaG92ZXJEZWNvcmF0aW9uT3B0aW9ucywgaW5mby5jb21tZW50aW5nUmFuZ2VzLCB0cnVlKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYmVmb3JlUmFuZ2VFbmRMaW5lID0gTWF0aC5taW4oaW50ZXJzZWN0aW5nRW1waGFzaXNSYW5nZS5zdGFydExpbmVOdW1iZXIsIGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlcikgLSAxO1xuXHRcdFx0XHRcdGNvbnN0IGhhc0JlZm9yZVJhbmdlID0gcmFuZ2VPYmplY3Quc3RhcnRMaW5lTnVtYmVyIDw9IGJlZm9yZVJhbmdlRW5kTGluZTtcblx0XHRcdFx0XHRjb25zdCBhZnRlclJhbmdlU3RhcnRMaW5lID0gTWF0aC5tYXgoaW50ZXJzZWN0aW5nRW1waGFzaXNSYW5nZS5lbmRMaW5lTnVtYmVyLCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5lbmRMaW5lTnVtYmVyKSArIDE7XG5cdFx0XHRcdFx0Y29uc3QgaGFzQWZ0ZXJSYW5nZSA9IHJhbmdlT2JqZWN0LmVuZExpbmVOdW1iZXIgPj0gYWZ0ZXJSYW5nZVN0YXJ0TGluZTtcblx0XHRcdFx0XHRpZiAoaGFzQmVmb3JlUmFuZ2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJlZm9yZVJhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSwgYmVmb3JlUmFuZ2VFbmRMaW5lLCAxKTtcblx0XHRcdFx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLnB1c2gobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24oZWRpdG9yLCBpbmZvLnVuaXF1ZU93bmVyLCBpbmZvLmV4dGVuc2lvbklkLCBpbmZvLmxhYmVsLCBiZWZvcmVSYW5nZSwgdGhpcy5kZWNvcmF0aW9uT3B0aW9ucywgaW5mby5jb21tZW50aW5nUmFuZ2VzLCB0cnVlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChoYXNBZnRlclJhbmdlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhZnRlclJhbmdlID0gbmV3IFJhbmdlKGFmdGVyUmFuZ2VTdGFydExpbmUsIDEsIHJhbmdlLmVuZExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMucHVzaChuZXcgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbihlZGl0b3IsIGluZm8udW5pcXVlT3duZXIsIGluZm8uZXh0ZW5zaW9uSWQsIGluZm8ubGFiZWwsIGFmdGVyUmFuZ2UsIHRoaXMuZGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICgocmFuZ2VPYmplY3Quc3RhcnRMaW5lTnVtYmVyIDw9IGVtcGhhc2lzTGluZSkgJiYgKGVtcGhhc2lzTGluZSA8PSByYW5nZU9iamVjdC5lbmRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdGlmIChyYW5nZU9iamVjdC5zdGFydExpbmVOdW1iZXIgPCBlbXBoYXNpc0xpbmUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJlZm9yZVJhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSwgZW1waGFzaXNMaW5lIC0gMSwgMSk7XG5cdFx0XHRcdFx0XHRjb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucy5wdXNoKG5ldyBDb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uKGVkaXRvciwgaW5mby51bmlxdWVPd25lciwgaW5mby5leHRlbnNpb25JZCwgaW5mby5sYWJlbCwgYmVmb3JlUmFuZ2UsIHRoaXMuZGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBlbXBoYXNpc1JhbmdlID0gbmV3IFJhbmdlKGVtcGhhc2lzTGluZSwgMSwgZW1waGFzaXNMaW5lLCAxKTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2xpbmVIYXNUaHJlYWQoZWRpdG9yLCBlbXBoYXNpc1JhbmdlKSkge1xuXHRcdFx0XHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMucHVzaChuZXcgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbihlZGl0b3IsIGluZm8udW5pcXVlT3duZXIsIGluZm8uZXh0ZW5zaW9uSWQsIGluZm8ubGFiZWwsIGVtcGhhc2lzUmFuZ2UsIHRoaXMuaG92ZXJEZWNvcmF0aW9uT3B0aW9ucywgaW5mby5jb21tZW50aW5nUmFuZ2VzLCB0cnVlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbXBoYXNpc0xpbmUgPCByYW5nZU9iamVjdC5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhZnRlclJhbmdlID0gbmV3IFJhbmdlKGVtcGhhc2lzTGluZSArIDEsIDEsIHJhbmdlLmVuZExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMucHVzaChuZXcgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbihlZGl0b3IsIGluZm8udW5pcXVlT3duZXIsIGluZm8uZXh0ZW5zaW9uSWQsIGluZm8ubGFiZWwsIGFmdGVyUmFuZ2UsIHRoaXMuZGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucy5wdXNoKG5ldyBDb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uKGVkaXRvciwgaW5mby51bmlxdWVPd25lciwgaW5mby5leHRlbnNpb25JZCwgaW5mby5sYWJlbCwgcmFuZ2UsIHRoaXMuZGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHR0aGlzLmRlY29yYXRpb25JZHMgPSBhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMuZGVjb3JhdGlvbklkcywgY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMpO1xuXHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMuZm9yRWFjaCgoZGVjb3JhdGlvbiwgaW5kZXgpID0+IGRlY29yYXRpb24uaWQgPSB0aGlzLmRlY29yYXRpb25JZHNbaW5kZXhdKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJhbmdlc0RpZmZlcmVuY2UgPSB0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLmxlbmd0aCAtIGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLmxlbmd0aDtcblx0XHR0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zID0gY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnM7XG5cdFx0aWYgKHJhbmdlc0RpZmZlcmVuY2UpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnNDb3VudC5maXJlKHRoaXMuY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMubGVuZ3RoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFyZVJhbmdlc0ludGVyc2VjdGluZ09yVG91Y2hpbmdCeUxpbmUoYTogUmFuZ2UsIGI6IFJhbmdlKSB7XG5cdFx0Ly8gQ2hlY2sgaWYgYGFgIGlzIGJlZm9yZSBgYmBcblx0XHRpZiAoYS5lbmRMaW5lTnVtYmVyIDwgKGIuc3RhcnRMaW5lTnVtYmVyIC0gMSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBgYmAgaXMgYmVmb3JlIGBhYFxuXHRcdGlmICgoYi5lbmRMaW5lTnVtYmVyICsgMSkgPCBhLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRoZXNlIHJhbmdlcyBtdXN0IGludGVyc2VjdFxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGdldE1hdGNoZWRDb21tZW50QWN0aW9uKGNvbW1lbnRSYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQpOiBNZXJnZWRDb21tZW50UmFuZ2VBY3Rpb25zW10ge1xuXHRcdGlmIChjb21tZW50UmFuZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZm91bmRJbmZvcyA9IHRoaXMuX2luZm9zPy5maWx0ZXIoaW5mbyA9PiBpbmZvLmNvbW1lbnRpbmdSYW5nZXMuZmlsZUNvbW1lbnRzKTtcblx0XHRcdGlmIChmb3VuZEluZm9zKSB7XG5cdFx0XHRcdHJldHVybiBmb3VuZEluZm9zLm1hcChmb3VuZEluZm8gPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdFx0b3duZXJJZDogZm91bmRJbmZvLnVuaXF1ZU93bmVyLFxuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25JZDogZm91bmRJbmZvLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogZm91bmRJbmZvLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRjb21tZW50aW5nUmFuZ2VzSW5mbzogZm91bmRJbmZvLmNvbW1lbnRpbmdSYW5nZXNcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBrZXlzIGlzIG93bmVySWRcblx0XHRjb25zdCBmb3VuZEhvdmVyQWN0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJhbmdlOiBSYW5nZTsgYWN0aW9uOiBDb21tZW50UmFuZ2VBY3Rpb24gfT4oKTtcblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgdGhpcy5jb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBkZWNvcmF0aW9uLmdldEFjdGl2ZVJhbmdlKCk7XG5cdFx0XHRpZiAocmFuZ2UgJiYgdGhpcy5hcmVSYW5nZXNJbnRlcnNlY3RpbmdPclRvdWNoaW5nQnlMaW5lKHJhbmdlLCBjb21tZW50UmFuZ2UpKSB7XG5cdFx0XHRcdC8vIFdlIGNhbiBoYXZlIHNldmVyYWwgY29tbWVudGluZyByYW5nZXMgdGhhdCBtYXRjaCBmcm9tIHRoZSBzYW1lIHVuaXF1ZU93bmVyIGJlY2F1c2Ugb2YgaG93XG5cdFx0XHRcdC8vIHRoZSBsaW5lIGhvdmVyIGFuZCBzZWxlY3Rpb24gZGVjb3JhdGlvbiBpcyBkb25lLlxuXHRcdFx0XHQvLyBUaGUgcmFuZ2VzIG11c3QgYmUgbWVyZ2VkIHNvIHRoYXQgd2UgY2FuIHNlZSBpZiB0aGUgbmV3IGNvbW1lbnRSYW5nZSBmaXRzIHdpdGhpbiB0aGVtLlxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBkZWNvcmF0aW9uLmdldENvbW1lbnRBY3Rpb24oKTtcblx0XHRcdFx0Y29uc3QgYWxyZWFkeUZvdW5kSW5mbyA9IGZvdW5kSG92ZXJBY3Rpb25zLmdldChhY3Rpb24ub3duZXJJZCk7XG5cdFx0XHRcdGlmIChhbHJlYWR5Rm91bmRJbmZvPy5hY3Rpb24uY29tbWVudGluZ1Jhbmdlc0luZm8gPT09IGFjdGlvbi5jb21tZW50aW5nUmFuZ2VzSW5mbykge1xuXHRcdFx0XHRcdC8vIE1lcmdlIHJhbmdlcy5cblx0XHRcdFx0XHRjb25zdCBuZXdSYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdFx0XHRcdHJhbmdlLnN0YXJ0TGluZU51bWJlciA8IGFscmVhZHlGb3VuZEluZm8ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID8gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDogYWxyZWFkeUZvdW5kSW5mby5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRyYW5nZS5zdGFydENvbHVtbiA8IGFscmVhZHlGb3VuZEluZm8ucmFuZ2Uuc3RhcnRDb2x1bW4gPyByYW5nZS5zdGFydENvbHVtbiA6IGFscmVhZHlGb3VuZEluZm8ucmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRyYW5nZS5lbmRMaW5lTnVtYmVyID4gYWxyZWFkeUZvdW5kSW5mby5yYW5nZS5lbmRMaW5lTnVtYmVyID8gcmFuZ2UuZW5kTGluZU51bWJlciA6IGFscmVhZHlGb3VuZEluZm8ucmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRcdHJhbmdlLmVuZENvbHVtbiA+IGFscmVhZHlGb3VuZEluZm8ucmFuZ2UuZW5kQ29sdW1uID8gcmFuZ2UuZW5kQ29sdW1uIDogYWxyZWFkeUZvdW5kSW5mby5yYW5nZS5lbmRDb2x1bW5cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGZvdW5kSG92ZXJBY3Rpb25zLnNldChhY3Rpb24ub3duZXJJZCwgeyByYW5nZTogbmV3UmFuZ2UsIGFjdGlvbiB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3VuZEhvdmVyQWN0aW9ucy5zZXQoYWN0aW9uLm93bmVySWQsIHsgcmFuZ2UsIGFjdGlvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlZW5Pd25lcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbShmb3VuZEhvdmVyQWN0aW9ucy52YWx1ZXMoKSkuZmlsdGVyKGFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoc2Vlbk93bmVycy5oYXMoYWN0aW9uLmFjdGlvbi5vd25lcklkKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWVuT3duZXJzLmFkZChhY3Rpb24uYWN0aW9uLm93bmVySWQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXROZWFyZXN0Q29tbWVudGluZ1JhbmdlKGZpbmRQb3NpdGlvbjogUG9zaXRpb24sIHJldmVyc2U/OiBib29sZWFuKTogUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGxldCBmaW5kUG9zaXRpb25Db250YWluZWRXaXRoaW46IFJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uczogQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbltdO1xuXHRcdGlmIChyZXZlcnNlKSB7XG5cdFx0XHRkZWNvcmF0aW9ucyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHRoaXMuY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zW2ldKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVjb3JhdGlvbnMgPSB0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZGVjb3JhdGlvbi5nZXRBY3RpdmVSYW5nZSgpO1xuXHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpbmRQb3NpdGlvbkNvbnRhaW5lZFdpdGhpbiAmJiB0aGlzLmFyZVJhbmdlc0ludGVyc2VjdGluZ09yVG91Y2hpbmdCeUxpbmUocmFuZ2UsIGZpbmRQb3NpdGlvbkNvbnRhaW5lZFdpdGhpbikpIHtcblx0XHRcdFx0ZmluZFBvc2l0aW9uQ29udGFpbmVkV2l0aGluID0gUmFuZ2UucGx1c1JhbmdlKGZpbmRQb3NpdGlvbkNvbnRhaW5lZFdpdGhpbiwgcmFuZ2UpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSBmaW5kUG9zaXRpb24ubGluZU51bWJlciAmJiBmaW5kUG9zaXRpb24ubGluZU51bWJlciA8PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGZpbmRQb3NpdGlvbkNvbnRhaW5lZFdpdGhpbiA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFyZXZlcnNlICYmIHJhbmdlLmVuZExpbmVOdW1iZXIgPCBmaW5kUG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJldmVyc2UgJiYgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gZmluZFBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByYW5nZTtcblx0XHR9XG5cdFx0cmV0dXJuIChkZWNvcmF0aW9ucy5sZW5ndGggPiAwID8gKGRlY29yYXRpb25zWzBdLmdldEFjdGl2ZVJhbmdlKCkgPz8gdW5kZWZpbmVkKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zQ291bnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMgPSBbXTtcblx0fVxufVxuXG4vKipcbiogTmF2aWdhdGUgdG8gdGhlIG5leHQgb3IgcHJldmlvdXMgY29tbWVudCBpbiB0aGUgY3VycmVudCB0aHJlYWQuXG4qIEBwYXJhbSB0eXBlXG4qL1xuZXhwb3J0IGZ1bmN0aW9uIG1vdmVUb05leHRDb21tZW50SW5UaHJlYWQoY29tbWVudEluZm86IHsgdGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxJUmFuZ2U+OyBjb21tZW50PzogbGFuZ3VhZ2VzLkNvbW1lbnQgfSB8IHVuZGVmaW5lZCwgdHlwZTogJ25leHQnIHwgJ3ByZXZpb3VzJykge1xuXHRpZiAoIWNvbW1lbnRJbmZvPy5jb21tZW50IHx8ICFjb21tZW50SW5mbz8udGhyZWFkPy5jb21tZW50cykge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBjdXJyZW50SW5kZXggPSBjb21tZW50SW5mby50aHJlYWQuY29tbWVudHM/LmluZGV4T2YoY29tbWVudEluZm8uY29tbWVudCk7XG5cdGlmIChjdXJyZW50SW5kZXggPT09IHVuZGVmaW5lZCB8fCBjdXJyZW50SW5kZXggPCAwKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmICh0eXBlID09PSAncHJldmlvdXMnICYmIGN1cnJlbnRJbmRleCA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAodHlwZSA9PT0gJ25leHQnICYmIGN1cnJlbnRJbmRleCA9PT0gY29tbWVudEluZm8udGhyZWFkLmNvbW1lbnRzLmxlbmd0aCAtIDEpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgY29tbWVudCA9IGNvbW1lbnRJbmZvLnRocmVhZC5jb21tZW50cz8uW3R5cGUgPT09ICdwcmV2aW91cycgPyBjdXJyZW50SW5kZXggLSAxIDogY3VycmVudEluZGV4ICsgMV07XG5cdGlmICghY29tbWVudCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdC4uLmNvbW1lbnRJbmZvLFxuXHRcdGNvbW1lbnQsXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXZlYWxDb21tZW50VGhyZWFkKGNvbW1lbnRTZXJ2aWNlOiBJQ29tbWVudFNlcnZpY2UsIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdGNvbW1lbnRUaHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZT4sIGNvbW1lbnQ6IGxhbmd1YWdlcy5Db21tZW50IHwgdW5kZWZpbmVkLCBmb2N1c1JlcGx5PzogYm9vbGVhbiwgcGlubmVkPzogYm9vbGVhbiwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHNpZGVCeVNpZGU/OiBib29sZWFuKTogdm9pZCB7XG5cdGlmICghY29tbWVudFRocmVhZC5yZXNvdXJjZSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoIWNvbW1lbnRTZXJ2aWNlLmlzQ29tbWVudGluZ0VuYWJsZWQpIHtcblx0XHRjb21tZW50U2VydmljZS5lbmFibGVDb21tZW50aW5nKHRydWUpO1xuXHR9XG5cblx0Y29uc3QgcmFuZ2UgPSBjb21tZW50VGhyZWFkLnJhbmdlO1xuXHRjb25zdCBmb2N1cyA9IGZvY3VzUmVwbHkgPyBDb21tZW50V2lkZ2V0Rm9jdXMuRWRpdG9yIDogKHByZXNlcnZlRm9jdXMgPyBDb21tZW50V2lkZ2V0Rm9jdXMuTm9uZSA6IENvbW1lbnRXaWRnZXRGb2N1cy5XaWRnZXQpO1xuXG5cdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdC8vIElmIHRoZSBhY3RpdmUgZWRpdG9yIGlzIGEgZGlmZiBlZGl0b3Igd2hlcmUgb25lIG9mIHRoZSBzaWRlcyBoYXMgdGhlIGNvbW1lbnQsXG5cdC8vIHRoZW4gd2UgdHJ5IHRvIHJldmVhbCB0aGUgY29tbWVudCBpbiB0aGUgZGlmZiBlZGl0b3IuXG5cdGNvbnN0IGN1cnJlbnRBY3RpdmVSZXNvdXJjZXM6IElFZGl0b3JbXSA9IGlzRGlmZkVkaXRvcihhY3RpdmVFZGl0b3IpID8gW2FjdGl2ZUVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpLCBhY3RpdmVFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKV1cblx0XHQ6IChhY3RpdmVFZGl0b3IgPyBbYWN0aXZlRWRpdG9yXSA6IFtdKTtcblx0Y29uc3QgdGhyZWFkVG9SZXZlYWwgPSBjb21tZW50VGhyZWFkLnRocmVhZElkO1xuXHRjb25zdCBjb21tZW50VG9SZXZlYWwgPSBjb21tZW50Py51bmlxdWVJZEluVGhyZWFkO1xuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShjb21tZW50VGhyZWFkLnJlc291cmNlKTtcblxuXHRmb3IgKGNvbnN0IGVkaXRvciBvZiBjdXJyZW50QWN0aXZlUmVzb3VyY2VzKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoKG1vZGVsIGluc3RhbmNlb2YgVGV4dE1vZGVsKSAmJiB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIG1vZGVsLnVyaSkpIHtcblxuXHRcdFx0aWYgKHRocmVhZFRvUmV2ZWFsICYmIGlzQ29kZUVkaXRvcihlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tZW50Q29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRcdFx0Y29udHJvbGxlcj8ucmV2ZWFsQ29tbWVudFRocmVhZCh0aHJlYWRUb1JldmVhbCwgY29tbWVudFRvUmV2ZWFsLCB0cnVlLCBmb2N1cyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRyZXNvdXJjZSxcblx0XHRvcHRpb25zOiB7XG5cdFx0XHRwaW5uZWQ6IHBpbm5lZCxcblx0XHRcdHByZXNlcnZlRm9jdXM6IHByZXNlcnZlRm9jdXMsXG5cdFx0XHRzZWxlY3Rpb246IHJhbmdlID8/IG5ldyBSYW5nZSgxLCAxLCAxLCAxKVxuXHRcdH1cblx0fSwgc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVApLnRoZW4oZWRpdG9yID0+IHtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRjb25zdCBjb250cm9sID0gZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRcdGlmICh0aHJlYWRUb1JldmVhbCAmJiBpc0NvZGVFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1lbnRDb250cm9sbGVyLmdldChjb250cm9sKTtcblx0XHRcdFx0Y29udHJvbGxlcj8ucmV2ZWFsQ29tbWVudFRocmVhZCh0aHJlYWRUb1JldmVhbCwgY29tbWVudFRvUmV2ZWFsLCB0cnVlLCBmb2N1cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbW1lbnRDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2FsVG9EaXNwb3NlOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRXaWRnZXRzOiBSZXZpZXdab25lV2lkZ2V0W107XG5cdHByaXZhdGUgX2NvbW1lbnRJbmZvczogSUNvbW1lbnRJbmZvW107XG5cdHByaXZhdGUgX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvciE6IENvbW1lbnRpbmdSYW5nZURlY29yYXRvcjtcblx0cHJpdmF0ZSBfY29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yITogQ29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yO1xuXHRwcml2YXRlIG1vdXNlRG93bkluZm86IHsgbGluZU51bWJlcjogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY29tbWVudGluZ1JhbmdlU3BhY2VSZXNlcnZlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb21tZW50aW5nUmFuZ2VBbW91bnRSZXNlcnZlZCA9IDA7XG5cdHByaXZhdGUgX2NvbXB1dGVQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxBcnJheTxJQ29tbWVudEluZm8gfCBudWxsPj4gfCBudWxsO1xuXHRwcml2YXRlIF9jb21wdXRlQW5kU2V0UHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWRkSW5Qcm9ncmVzcyE6IGJvb2xlYW47XG5cdHByaXZhdGUgX2VtcHR5VGhyZWFkc1RvQWRkUXVldWU6IFtSYW5nZSB8IHVuZGVmaW5lZCwgSUVkaXRvck1vdXNlRXZlbnQgfCB1bmRlZmluZWRdW10gPSBbXTtcblx0cHJpdmF0ZSBfY29tcHV0ZUNvbW1lbnRpbmdSYW5nZVNjaGVkdWxlciE6IERlbGF5ZXI8QXJyYXk8SUNvbW1lbnRJbmZvIHwgbnVsbD4+IHwgbnVsbDtcblx0cHJpdmF0ZSBfcGVuZGluZ05ld0NvbW1lbnRDYWNoZTogeyBba2V5OiBzdHJpbmddOiB7IFtrZXk6IHN0cmluZ106IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB9IH07XG5cdHByaXZhdGUgX3BlbmRpbmdFZGl0c0NhY2hlOiB7IFtrZXk6IHN0cmluZ106IHsgW2tleTogc3RyaW5nXTogeyBba2V5OiBudW1iZXJdOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfSB9IH07IC8vIHVuaXF1ZU93bmVyIC0+IHRocmVhZElkIC0+IHVuaXF1ZUlkSW5UaHJlYWQgLT4gcGVuZGluZyBjb21tZW50XG5cdHByaXZhdGUgX2luUHJvY2Vzc0NvbnRpbnVlT25Db21tZW50czogTWFwPHN0cmluZywgbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50VGhyZWFkW10+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIF9lZGl0b3JEaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRwcml2YXRlIF9hY3RpdmVDdXJzb3JIYXNDb21tZW50aW5nUmFuZ2U6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9hY3RpdmVDdXJzb3JIYXNDb21tZW50OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfY29tbWVudFdpZGdldFZpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9oYXNSZXNwb25kZWRUb0VkaXRvckNoYW5nZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb21tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1lbnRTZXJ2aWNlOiBJQ29tbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29tbWVudEluZm9zID0gW107XG5cdFx0dGhpcy5fY29tbWVudFdpZGdldHMgPSBbXTtcblx0XHR0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlID0ge307XG5cdFx0dGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGUgPSB7fTtcblx0XHR0aGlzLl9jb21wdXRlUHJvbWlzZSA9IG51bGw7XG5cdFx0dGhpcy5fYWN0aXZlQ3Vyc29ySGFzQ29tbWVudGluZ1JhbmdlID0gQ29tbWVudENvbnRleHRLZXlzLmFjdGl2ZUN1cnNvckhhc0NvbW1lbnRpbmdSYW5nZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjdGl2ZUN1cnNvckhhc0NvbW1lbnQgPSBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlQ3Vyc29ySGFzQ29tbWVudC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjdGl2ZUVkaXRvckhhc0NvbW1lbnRpbmdSYW5nZSA9IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2UuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb21tZW50V2lkZ2V0VmlzaWJsZSA9IENvbW1lbnRDb250ZXh0S2V5cy5jb21tZW50V2lkZ2V0VmlzaWJsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG5cdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRvcigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3Iub25EaWRDaGFuZ2VEZWNvcmF0aW9uc0NvdW50KGNvdW50ID0+IHtcblx0XHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmNsZWFyRWRpdG9yTGlzdGVuZXJzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yTGlzdGVuZXJzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yID0gbmV3IENvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvcih0aGlzLmNvbW1lbnRTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbW1lbnRTZXJ2aWNlLm9uRGlkRGVsZXRlRGF0YVByb3ZpZGVyKG93bmVySWQgPT4ge1xuXHRcdFx0aWYgKG93bmVySWQpIHtcblx0XHRcdFx0ZGVsZXRlIHRoaXMuX3BlbmRpbmdOZXdDb21tZW50Q2FjaGVbb3duZXJJZF07XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl9wZW5kaW5nRWRpdHNDYWNoZVtvd25lcklkXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdOZXdDb21tZW50Q2FjaGUgPSB7fTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGUgPSB7fTtcblx0XHRcdH1cblx0XHRcdHRoaXMuYmVnaW5Db21wdXRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tbWVudFNlcnZpY2Uub25EaWRTZXREYXRhUHJvdmlkZXIoXyA9PiB0aGlzLmJlZ2luQ29tcHV0ZUFuZEhhbmRsZUVkaXRvckNoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tZW50U2VydmljZS5vbkRpZFVwZGF0ZUNvbW1lbnRpbmdSYW5nZXMoXyA9PiB0aGlzLmJlZ2luQ29tcHV0ZUFuZEhhbmRsZUVkaXRvckNoYW5nZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbW1lbnRTZXJ2aWNlLm9uRGlkU2V0UmVzb3VyY2VDb21tZW50SW5mb3MoYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JVUkkgPSB0aGlzLmVkaXRvciAmJiB0aGlzLmVkaXRvci5oYXNNb2RlbCgpICYmIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXHRcdFx0aWYgKGVkaXRvclVSSSAmJiBlZGl0b3JVUkkudG9TdHJpbmcoKSA9PT0gZS5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0Q29tbWVudHMoZS5jb21tZW50SW5mb3MuZmlsdGVyKGNvbW1lbnRJbmZvID0+IGNvbW1lbnRJbmZvICE9PSBudWxsKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tZW50U2VydmljZS5vbkRpZENoYW5nZUNvbW1lbnRpbmdFbmFibGVkKGUgPT4ge1xuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0dGhpcy5yZWdpc3RlckVkaXRvckxpc3RlbmVycygpO1xuXHRcdFx0XHR0aGlzLmJlZ2luQ29tcHV0ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cnlVcGRhdGVSZXNlcnZlZFNwYWNlKCk7XG5cdFx0XHRcdHRoaXMuY2xlYXJFZGl0b3JMaXN0ZW5lcnMoKTtcblx0XHRcdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yLnVwZGF0ZSh0aGlzLmVkaXRvciwgW10pO1xuXHRcdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkUmFuZ2VEZWNvcmF0b3IudXBkYXRlKHRoaXMuZWRpdG9yLCBbXSk7XG5cdFx0XHRcdGRpc3Bvc2UodGhpcy5fY29tbWVudFdpZGdldHMpO1xuXHRcdFx0XHR0aGlzLl9jb21tZW50V2lkZ2V0cyA9IFtdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uV2lsbENoYW5nZU1vZGVsKGUgPT4gdGhpcy5vbldpbGxDaGFuZ2VNb2RlbChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoXyA9PiB0aGlzLm9uTW9kZWxDaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnKSkge1xuXHRcdFx0XHR0aGlzLmJlZ2luQ29tcHV0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMub25Nb2RlbENoYW5nZWQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoJ2NvbW1lbnQtY29udHJvbGxlcicsIENPTU1FTlRFRElUT1JfREVDT1JBVElPTl9LRVksIHt9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnJlZ2lzdGVyQ29udGludWVPbkNvbW1lbnRQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVDb250aW51ZU9uQ29tbWVudHM6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwZW5kaW5nQ29tbWVudHM6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudFRocmVhZFtdID0gW107XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRXaWRnZXRzKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHpvbmUgb2YgdGhpcy5fY29tbWVudFdpZGdldHMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgem9uZVBlbmRpbmdDb21tZW50cyA9IHpvbmUuZ2V0UGVuZGluZ0NvbW1lbnRzKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHBlbmRpbmdOZXdDb21tZW50ID0gem9uZVBlbmRpbmdDb21tZW50cy5uZXdDb21tZW50O1xuXHRcdFx0XHRcdFx0XHRpZiAoIXBlbmRpbmdOZXdDb21tZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0bGV0IGxhc3RDb21tZW50Qm9keTtcblx0XHRcdFx0XHRcdFx0aWYgKHpvbmUuY29tbWVudFRocmVhZC5jb21tZW50cyAmJiB6b25lLmNvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbGFzdENvbW1lbnQgPSB6b25lLmNvbW1lbnRUaHJlYWQuY29tbWVudHNbem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgbGFzdENvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhc3RDb21tZW50Qm9keSA9IGxhc3RDb21tZW50LmJvZHk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdGxhc3RDb21tZW50Qm9keSA9IGxhc3RDb21tZW50LmJvZHkudmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKHBlbmRpbmdOZXdDb21tZW50LmJvZHkgIT09IGxhc3RDb21tZW50Qm9keSkge1xuXHRcdFx0XHRcdFx0XHRcdHBlbmRpbmdDb21tZW50cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdHVuaXF1ZU93bmVyOiB6b25lLnVuaXF1ZU93bmVyLFxuXHRcdFx0XHRcdFx0XHRcdFx0dXJpOiB6b25lLmVkaXRvci5nZXRNb2RlbCgpIS51cmksXG5cdFx0XHRcdFx0XHRcdFx0XHRyYW5nZTogem9uZS5jb21tZW50VGhyZWFkLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29tbWVudDogcGVuZGluZ05ld0NvbW1lbnQsXG5cdFx0XHRcdFx0XHRcdFx0XHRpc1JlcGx5OiAoem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzICE9PSB1bmRlZmluZWQpICYmICh6b25lLmNvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoID4gMClcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcGVuZGluZ0NvbW1lbnRzO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMgPSBbXTtcblx0XHRpZiAoIXRoaXMuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZU1vdmUoZSA9PiB0aGlzLm9uRWRpdG9yTW91c2VNb3ZlKGUpKSk7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMucHVzaCh0aGlzLmVkaXRvci5vbk1vdXNlTGVhdmUoKCkgPT4gdGhpcy5vbkVkaXRvck1vdXNlTGVhdmUoKSkpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLnB1c2godGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHRoaXMub25FZGl0b3JDaGFuZ2VDdXJzb3JQb3NpdGlvbihlLnBvc2l0aW9uKSkpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLnB1c2godGhpcy5lZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB0aGlzLm9uRWRpdG9yQ2hhbmdlQ3Vyc29yUG9zaXRpb24odGhpcy5lZGl0b3I/LmdldFBvc2l0aW9uKCkgPz8gbnVsbCkpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKGUgPT4gdGhpcy5vbkVkaXRvckNoYW5nZUN1cnNvclNlbGVjdGlvbihlKSkpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLnB1c2godGhpcy5lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMub25FZGl0b3JDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckVkaXRvckxpc3RlbmVycygpIHtcblx0XHRkaXNwb3NlKHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcyA9IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlTGVhdmUoKSB7XG5cdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yLnVwZGF0ZUhvdmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yTW91c2VNb3ZlKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlLnRhcmdldC5wb3NpdGlvbj8ubGluZU51bWJlcjtcblx0XHRpZiAoZS5ldmVudC5sZWZ0QnV0dG9uLnZhbHVlT2YoKSAmJiBwb3NpdGlvbiAmJiB0aGlzLm1vdXNlRG93bkluZm8pIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGVTZWxlY3Rpb24ocG9zaXRpb24sIG5ldyBSYW5nZSh0aGlzLm1vdXNlRG93bkluZm8ubGluZU51bWJlciwgMSwgcG9zaXRpb24sIDEpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yLnVwZGF0ZUhvdmVyKHBvc2l0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKGU/OiBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLmVkaXRvcj8uZ2V0UG9zaXRpb24oKT8ubGluZU51bWJlcjtcblx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGVTZWxlY3Rpb24ocG9zaXRpb24sIGU/LnNlbGVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvckNoYW5nZUN1cnNvclBvc2l0aW9uKGU6IFBvc2l0aW9uIHwgbnVsbCkge1xuXHRcdGlmICghZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoZSwgeyBjb2x1bW46IC0xLCBsaW5lTnVtYmVyOiBlLmxpbmVOdW1iZXIgfSk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLmVkaXRvcj8uZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlKTtcblx0XHRsZXQgaGFzQ29tbWVudGluZ1JhbmdlID0gZmFsc2U7XG5cdFx0aWYgKGRlY29yYXRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKGRlY29yYXRpb24ub3B0aW9ucy5kZXNjcmlwdGlvbiA9PT0gQ29tbWVudEdseXBoV2lkZ2V0LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gV2UgZG9uJ3QgYWxsb3cgbXVsdGlwbGUgY29tbWVudHMgb24gdGhlIHNhbWUgbGluZS5cblx0XHRcdFx0XHRoYXNDb21tZW50aW5nUmFuZ2UgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChkZWNvcmF0aW9uLm9wdGlvbnMuZGVzY3JpcHRpb24gPT09IENvbW1lbnRpbmdSYW5nZURlY29yYXRvci5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdGhhc0NvbW1lbnRpbmdSYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlQ3Vyc29ySGFzQ29tbWVudGluZ1JhbmdlLnNldChoYXNDb21tZW50aW5nUmFuZ2UpO1xuXHRcdHRoaXMuX2FjdGl2ZUN1cnNvckhhc0NvbW1lbnQuc2V0KHRoaXMuZ2V0Q29tbWVudHNBdExpbmUocmFuZ2UpLmxlbmd0aCA+IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0VkaXRvcklubGluZU9yaWdpbmFsKHRlc3RFZGl0b3I6IElDb2RlRWRpdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2RpZmZFZGl0b3IucmVuZGVyU2lkZUJ5U2lkZScpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm91bmRFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZVRleHRFZGl0b3JDb250cm9scy5maW5kKGVkaXRvciA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yLmdldEVkaXRvclR5cGUoKSA9PT0gRWRpdG9yVHlwZS5JRGlmZkVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBkaWZmRWRpdG9yID0gZWRpdG9yIGFzIElEaWZmRWRpdG9yO1xuXHRcdFx0XHRyZXR1cm4gZGlmZkVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpID09PSB0ZXN0RWRpdG9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHRcdHJldHVybiAhIWZvdW5kRWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBiZWdpbkNvbXB1dGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fY29tcHV0ZVByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JVUkkgPSB0aGlzLmVkaXRvciAmJiB0aGlzLmVkaXRvci5oYXNNb2RlbCgpICYmIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXG5cdFx0XHRpZiAoZWRpdG9yVVJJKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbW1lbnRTZXJ2aWNlLmdldERvY3VtZW50Q29tbWVudHMoZWRpdG9yVVJJKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jb21wdXRlQW5kU2V0UHJvbWlzZSA9IHRoaXMuX2NvbXB1dGVQcm9taXNlLnRoZW4oYXN5bmMgY29tbWVudEluZm9zID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuc2V0Q29tbWVudHMoY29hbGVzY2UoY29tbWVudEluZm9zKSk7XG5cdFx0XHR0aGlzLl9jb21wdXRlUHJvbWlzZSA9IG51bGw7XG5cdFx0fSwgZXJyb3IgPT4gY29uc29sZS5sb2coZXJyb3IpKTtcblx0XHR0aGlzLl9jb21wdXRlUHJvbWlzZS50aGVuKCgpID0+IHRoaXMuX2NvbXB1dGVBbmRTZXRQcm9taXNlID0gdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gdGhpcy5fY29tcHV0ZUFuZFNldFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGJlZ2luQ29tcHV0ZUNvbW1lbnRpbmdSYW5nZXMoKSB7XG5cdFx0aWYgKHRoaXMuX2NvbXB1dGVDb21tZW50aW5nUmFuZ2VTY2hlZHVsZXIpIHtcblx0XHRcdHRoaXMuX2NvbXB1dGVDb21tZW50aW5nUmFuZ2VTY2hlZHVsZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvclVSSSA9IHRoaXMuZWRpdG9yICYmIHRoaXMuZWRpdG9yLmhhc01vZGVsKCkgJiYgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cblx0XHRcdFx0aWYgKGVkaXRvclVSSSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbW1lbnRTZXJ2aWNlLmdldERvY3VtZW50Q29tbWVudHMoZWRpdG9yVVJJKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0fSkudGhlbihjb21tZW50SW5mb3MgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jb21tZW50U2VydmljZS5pc0NvbW1lbnRpbmdFbmFibGVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVhbmluZ2Z1bENvbW1lbnRJbmZvcyA9IGNvYWxlc2NlKGNvbW1lbnRJbmZvcyk7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yLnVwZGF0ZSh0aGlzLmVkaXRvciwgbWVhbmluZ2Z1bENvbW1lbnRJbmZvcywgdGhpcy5lZGl0b3I/LmdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXIsIHRoaXMuZWRpdG9yPy5nZXRTZWxlY3Rpb24oKSA/PyB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IENvbW1lbnRDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248Q29tbWVudENvbnRyb2xsZXI+KElEKTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxDb21tZW50VGhyZWFkKHRocmVhZElkOiBzdHJpbmcsIGNvbW1lbnRVbmlxdWVJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBmZXRjaE9uY2VJZk5vdEV4aXN0OiBib29sZWFuLCBmb2N1czogQ29tbWVudFdpZGdldEZvY3VzKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWVudFRocmVhZFdpZGdldCA9IHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZpbHRlcih3aWRnZXQgPT4gd2lkZ2V0LmNvbW1lbnRUaHJlYWQudGhyZWFkSWQgPT09IHRocmVhZElkKTtcblx0XHRpZiAoY29tbWVudFRocmVhZFdpZGdldC5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbW1lbnRUaHJlYWRXaWRnZXRbMF0ucmV2ZWFsKGNvbW1lbnRVbmlxdWVJZCwgZm9jdXMpO1xuXHRcdH0gZWxzZSBpZiAoZmV0Y2hPbmNlSWZOb3RFeGlzdCkge1xuXHRcdFx0aWYgKHRoaXMuX2NvbXB1dGVBbmRTZXRQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuX2NvbXB1dGVBbmRTZXRQcm9taXNlLnRoZW4oXyA9PiB7XG5cdFx0XHRcdFx0dGhpcy5yZXZlYWxDb21tZW50VGhyZWFkKHRocmVhZElkLCBjb21tZW50VW5pcXVlSWQsIGZhbHNlLCBmb2N1cyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5iZWdpbkNvbXB1dGUoKS50aGVuKF8gPT4ge1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsQ29tbWVudFRocmVhZCh0aHJlYWRJZCwgY29tbWVudFVuaXF1ZUlkLCBmYWxzZSwgZm9jdXMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fY29tbWVudFdpZGdldHMpIHtcblx0XHRcdHdpZGdldC5jb2xsYXBzZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29sbGFwc2VWaXNpYmxlQ29tbWVudHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5lZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2NvbW1lbnRXaWRnZXRzKSB7XG5cdFx0XHRpZiAod2lkZ2V0LmV4cGFuZGVkICYmIHdpZGdldC5jb21tZW50VGhyZWFkLnJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGlzVmlzaWJsZSA9IHZpc2libGVSYW5nZXMuc29tZSh2aXNpYmxlUmFuZ2UgPT5cblx0XHRcdFx0XHRSYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHZpc2libGVSYW5nZSwgd2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2UhKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoaXNWaXNpYmxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgd2lkZ2V0LmNvbGxhcHNlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29tbWVudFdpZGdldFZpc2libGVDb250ZXh0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc0V4cGFuZGVkID0gdGhpcy5fY29tbWVudFdpZGdldHMuc29tZSh3aWRnZXQgPT4gd2lkZ2V0LmV4cGFuZGVkKTtcblx0XHR0aGlzLl9jb21tZW50V2lkZ2V0VmlzaWJsZS5zZXQoaGFzRXhwYW5kZWQpO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZEFsbCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLl9jb21tZW50V2lkZ2V0cykge1xuXHRcdFx0d2lkZ2V0LmV4cGFuZCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBleHBhbmRVbnJlc29sdmVkKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2NvbW1lbnRXaWRnZXRzKSB7XG5cdFx0XHRpZiAod2lkZ2V0LmNvbW1lbnRUaHJlYWQuc3RhdGUgPT09IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZCkge1xuXHRcdFx0XHR3aWRnZXQuZXhwYW5kKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG5leHRDb21tZW50VGhyZWFkKGZvY3VzVGhyZWFkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZE5lYXJlc3RDb21tZW50VGhyZWFkKGZvY3VzVGhyZWFkKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmROZWFyZXN0Q29tbWVudFRocmVhZChmb2N1c1RocmVhZDogYm9vbGVhbiwgcmV2ZXJzZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbW1lbnRXaWRnZXRzLmxlbmd0aCB8fCAhdGhpcy5lZGl0b3I/Lmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZnRlciA9IHJldmVyc2UgPyB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKS5nZXRTdGFydFBvc2l0aW9uKCkgOiB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKS5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHNvcnRlZFdpZGdldHMgPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAocmV2ZXJzZSkge1xuXHRcdFx0XHRjb25zdCB0ZW1wID0gYTtcblx0XHRcdFx0YSA9IGI7XG5cdFx0XHRcdGIgPSB0ZW1wO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGEuY29tbWVudFRocmVhZC5yYW5nZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdGlmIChiLmNvbW1lbnRUaHJlYWQucmFuZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblx0XHRcdGlmIChhLmNvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDwgYi5jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhLmNvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gYi5jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGEuY29tbWVudFRocmVhZC5yYW5nZS5zdGFydENvbHVtbiA8IGIuY29tbWVudFRocmVhZC5yYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhLmNvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRDb2x1bW4gPiBiLmNvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRDb2x1bW4pIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAwO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaWR4ID0gZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKHNvcnRlZFdpZGdldHMsIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBsaW5lVmFsdWVPbmUgPSByZXZlcnNlID8gYWZ0ZXIubGluZU51bWJlciA6ICh3aWRnZXQuY29tbWVudFRocmVhZC5yYW5nZT8uc3RhcnRMaW5lTnVtYmVyID8/IDApO1xuXHRcdFx0Y29uc3QgbGluZVZhbHVlVHdvID0gcmV2ZXJzZSA/ICh3aWRnZXQuY29tbWVudFRocmVhZC5yYW5nZT8uc3RhcnRMaW5lTnVtYmVyID8/IDApIDogYWZ0ZXIubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGNvbHVtblZhbHVlT25lID0gcmV2ZXJzZSA/IGFmdGVyLmNvbHVtbiA6ICh3aWRnZXQuY29tbWVudFRocmVhZC5yYW5nZT8uc3RhcnRDb2x1bW4gPz8gMCk7XG5cdFx0XHRjb25zdCBjb2x1bW5WYWx1ZVR3byA9IHJldmVyc2UgPyAod2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2U/LnN0YXJ0Q29sdW1uID8/IDApIDogYWZ0ZXIuY29sdW1uO1xuXHRcdFx0aWYgKGxpbmVWYWx1ZU9uZSA+IGxpbmVWYWx1ZVR3bykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGxpbmVWYWx1ZU9uZSA8IGxpbmVWYWx1ZVR3bykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb2x1bW5WYWx1ZU9uZSA+IGNvbHVtblZhbHVlVHdvKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbmV4dFdpZGdldDogUmV2aWV3Wm9uZVdpZGdldCB8IHVuZGVmaW5lZCA9IHNvcnRlZFdpZGdldHNbaWR4XTtcblx0XHRpZiAobmV4dFdpZGdldCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRTZWxlY3Rpb24obmV4dFdpZGdldC5jb21tZW50VGhyZWFkLnJhbmdlID8/IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSk7XG5cdFx0XHRuZXh0V2lkZ2V0LnJldmVhbCh1bmRlZmluZWQsIGZvY3VzVGhyZWFkID8gQ29tbWVudFdpZGdldEZvY3VzLldpZGdldCA6IENvbW1lbnRXaWRnZXRGb2N1cy5Ob25lKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcHJldmlvdXNDb21tZW50VGhyZWFkKGZvY3VzVGhyZWFkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZE5lYXJlc3RDb21tZW50VGhyZWFkKGZvY3VzVGhyZWFkLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmROZWFyZXN0Q29tbWVudGluZ1JhbmdlKHJldmVyc2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcj8uaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFmdGVyID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRjb25zdCByYW5nZSA9IHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci5nZXROZWFyZXN0Q29tbWVudGluZ1JhbmdlKGFmdGVyLCByZXZlcnNlKTtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gcmV2ZXJzZSA/IHJhbmdlLmdldEVuZFBvc2l0aW9uKCkgOiByYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0Y29uc3QgY29tbWVudFJhbmdlU3RhcnQgPSByYW5nZT8uZ2V0U3RhcnRQb3NpdGlvbigpLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBjb21tZW50UmFuZ2VFbmQgPSByYW5nZT8uZ2V0RW5kUG9zaXRpb24oKS5saW5lTnVtYmVyO1xuXHRcdFx0aWYgKGNvbW1lbnRSYW5nZVN0YXJ0ICYmIGNvbW1lbnRSYW5nZUVuZCkge1xuXHRcdFx0XHRjb25zdCBvbmVMaW5lID0gY29tbWVudFJhbmdlU3RhcnQgPT09IGNvbW1lbnRSYW5nZUVuZDtcblx0XHRcdFx0b25lTGluZSA/IHN0YXR1cyhubHMubG9jYWxpemUoJ2NvbW1lbnRSYW5nZScsIFwiTGluZSB7MH1cIiwgY29tbWVudFJhbmdlU3RhcnQpKSA6IHN0YXR1cyhubHMubG9jYWxpemUoJ2NvbW1lbnRSYW5nZVN0YXJ0JywgXCJMaW5lcyB7MH0gdG8gezF9XCIsIGNvbW1lbnRSYW5nZVN0YXJ0LCBjb21tZW50UmFuZ2VFbmQpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbmV4dENvbW1lbnRpbmdSYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kTmVhcmVzdENvbW1lbnRpbmdSYW5nZSgpO1xuXHR9XG5cblx0cHVibGljIHByZXZpb3VzQ29tbWVudGluZ1JhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmROZWFyZXN0Q29tbWVudGluZ1JhbmdlKHRydWUpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2UodGhpcy5fY29tbWVudFdpZGdldHMpO1xuXG5cdFx0dGhpcy5lZGl0b3IgPSBudWxsITsgLy8gU3RyaWN0IG51bGwgb3ZlcnJpZGUgLSBudWxsaW5nIG91dCBpbiBkaXNwb3NlXG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbENoYW5nZU1vZGVsKGU6IElNb2RlbENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLm5ld01vZGVsVXJsKSB7XG5cdFx0XHR0aGlzLnRyeVVwZGF0ZVJlc2VydmVkU3BhY2UoZS5uZXdNb2RlbFVybCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVDb21tZW50QWRkZWQoZWRpdG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdW5pcXVlT3duZXI6IHN0cmluZywgdGhyZWFkOiBsYW5ndWFnZXMuQWRkZWRDb21tZW50VGhyZWFkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWF0Y2hlZFpvbmVzID0gdGhpcy5fY29tbWVudFdpZGdldHMuZmlsdGVyKHpvbmVXaWRnZXQgPT4gem9uZVdpZGdldC51bmlxdWVPd25lciA9PT0gdW5pcXVlT3duZXIgJiYgem9uZVdpZGdldC5jb21tZW50VGhyZWFkLnRocmVhZElkID09PSB0aHJlYWQudGhyZWFkSWQpO1xuXHRcdGlmIChtYXRjaGVkWm9uZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hlZE5ld0NvbW1lbnRUaHJlYWRab25lcyA9IHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZpbHRlcih6b25lV2lkZ2V0ID0+IHpvbmVXaWRnZXQudW5pcXVlT3duZXIgPT09IHVuaXF1ZU93bmVyICYmIHpvbmVXaWRnZXQuY29tbWVudFRocmVhZC5jb21tZW50VGhyZWFkSGFuZGxlID09PSAtMSAmJiBSYW5nZS5lcXVhbHNSYW5nZSh6b25lV2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2UsIHRocmVhZC5yYW5nZSkpO1xuXG5cdFx0aWYgKG1hdGNoZWROZXdDb21tZW50VGhyZWFkWm9uZXMubGVuZ3RoKSB7XG5cdFx0XHRtYXRjaGVkTmV3Q29tbWVudFRocmVhZFpvbmVzWzBdLnVwZGF0ZSh0aHJlYWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRpbnVlT25Db21tZW50SW5kZXggPSB0aGlzLl9pblByb2Nlc3NDb250aW51ZU9uQ29tbWVudHMuZ2V0KHVuaXF1ZU93bmVyKT8uZmluZEluZGV4KHBlbmRpbmcgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmcucmFuZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhyZWFkLnJhbmdlID09PSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gUmFuZ2UubGlmdChwZW5kaW5nLnJhbmdlKS5lcXVhbHNSYW5nZSh0aHJlYWQucmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGxldCBjb250aW51ZU9uQ29tbWVudFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoKGNvbnRpbnVlT25Db21tZW50SW5kZXggIT09IHVuZGVmaW5lZCkgJiYgY29udGludWVPbkNvbW1lbnRJbmRleCA+PSAwKSB7XG5cdFx0XHRjb250aW51ZU9uQ29tbWVudFRleHQgPSB0aGlzLl9pblByb2Nlc3NDb250aW51ZU9uQ29tbWVudHMuZ2V0KHVuaXF1ZU93bmVyKT8uc3BsaWNlKGNvbnRpbnVlT25Db21tZW50SW5kZXgsIDEpWzBdLmNvbW1lbnQuYm9keTtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nQ29tbWVudFRleHQgPSAodGhpcy5fcGVuZGluZ05ld0NvbW1lbnRDYWNoZVt1bmlxdWVPd25lcl0gJiYgdGhpcy5fcGVuZGluZ05ld0NvbW1lbnRDYWNoZVt1bmlxdWVPd25lcl1bdGhyZWFkLnRocmVhZElkXSlcblx0XHRcdD8/IGNvbnRpbnVlT25Db21tZW50VGV4dDtcblx0XHRjb25zdCBwZW5kaW5nRWRpdHMgPSB0aGlzLl9wZW5kaW5nRWRpdHNDYWNoZVt1bmlxdWVPd25lcl0gJiYgdGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGVbdW5pcXVlT3duZXJdW3RocmVhZC50aHJlYWRJZF07XG5cdFx0Y29uc3Qgc2hvdWxkUmV2ZWFsID0gdGhyZWFkLmNhblJlcGx5ICYmIHRocmVhZC5pc1RlbXBsYXRlICYmICghdGhyZWFkLmNvbW1lbnRzIHx8ICh0aHJlYWQuY29tbWVudHMubGVuZ3RoID09PSAwKSkgJiYgKCF0aHJlYWQuZWRpdG9ySWQgfHwgKHRocmVhZC5lZGl0b3JJZCA9PT0gZWRpdG9ySWQpKTtcblx0XHRhd2FpdCB0aGlzLmRpc3BsYXlDb21tZW50VGhyZWFkKHVuaXF1ZU93bmVyLCB0aHJlYWQsIHNob3VsZFJldmVhbCwgcGVuZGluZ0NvbW1lbnRUZXh0LCBwZW5kaW5nRWRpdHMpO1xuXHRcdHRoaXMuX2NvbW1lbnRJbmZvcy5maWx0ZXIoaW5mbyA9PiBpbmZvLnVuaXF1ZU93bmVyID09PSB1bmlxdWVPd25lcilbMF0udGhyZWFkcy5wdXNoKHRocmVhZCk7XG5cdFx0dGhpcy50cnlVcGRhdGVSZXNlcnZlZFNwYWNlKCk7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbENoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5jbGVhcigpO1xuXHRcdHRoaXMudHJ5VXBkYXRlUmVzZXJ2ZWRTcGFjZSgpO1xuXG5cdFx0dGhpcy5yZW1vdmVDb21tZW50V2lkZ2V0c0FuZFN0b3JlQ2FjaGUoKTtcblx0XHRpZiAoIXRoaXMuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faGFzUmVzcG9uZGVkVG9FZGl0b3JDaGFuZ2UgPSBmYWxzZTtcblxuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VEb3duKGUgPT4gdGhpcy5vbkVkaXRvck1vdXNlRG93bihlKSkpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZWRpdG9yLm9uTW91c2VVcChlID0+IHRoaXMub25FZGl0b3JNb3VzZVVwKGUpKSk7XG5cdFx0aWYgKHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5jbGVhckVkaXRvckxpc3RlbmVycygpO1xuXHRcdFx0dGhpcy5yZWdpc3RlckVkaXRvckxpc3RlbmVycygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbXB1dGVDb21tZW50aW5nUmFuZ2VTY2hlZHVsZXIgPSBuZXcgRGVsYXllcjxJQ29tbWVudEluZm9bXT4oMjAwKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbXB1dGVDb21tZW50aW5nUmFuZ2VTY2hlZHVsZXI/LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9jb21wdXRlQ29tbWVudGluZ1JhbmdlU2NoZWR1bGVyID0gbnVsbDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLmJlZ2luQ29tcHV0ZUNvbW1lbnRpbmdSYW5nZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5jb21tZW50U2VydmljZS5vbkRpZFVwZGF0ZUNvbW1lbnRUaHJlYWRzKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yVVJJID0gdGhpcy5lZGl0b3IgJiYgdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSAmJiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaTtcblx0XHRcdGlmICghZWRpdG9yVVJJIHx8ICF0aGlzLmNvbW1lbnRTZXJ2aWNlLmlzQ29tbWVudGluZ0VuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fY29tcHV0ZVByb21pc2UpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29tcHV0ZVByb21pc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbW1lbnRJbmZvID0gdGhpcy5fY29tbWVudEluZm9zLmZpbHRlcihpbmZvID0+IGluZm8udW5pcXVlT3duZXIgPT09IGUudW5pcXVlT3duZXIpO1xuXHRcdFx0aWYgKCFjb21tZW50SW5mbyB8fCAhY29tbWVudEluZm8ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWRkZWQgPSBlLmFkZGVkLmZpbHRlcih0aHJlYWQgPT4gdGhyZWFkLnJlc291cmNlICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKFVSSS5wYXJzZSh0aHJlYWQucmVzb3VyY2UpLCBlZGl0b3JVUkkpKTtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBlLnJlbW92ZWQuZmlsdGVyKHRocmVhZCA9PiB0aHJlYWQucmVzb3VyY2UgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoVVJJLnBhcnNlKHRocmVhZC5yZXNvdXJjZSksIGVkaXRvclVSSSkpO1xuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IGUuY2hhbmdlZC5maWx0ZXIodGhyZWFkID0+IHRocmVhZC5yZXNvdXJjZSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChVUkkucGFyc2UodGhyZWFkLnJlc291cmNlKSwgZWRpdG9yVVJJKSk7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gZS5wZW5kaW5nLmZpbHRlcihwZW5kaW5nID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHBlbmRpbmcudXJpLCBlZGl0b3JVUkkpKTtcblxuXHRcdFx0cmVtb3ZlZC5mb3JFYWNoKHRocmVhZCA9PiB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZWRab25lcyA9IHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZpbHRlcih6b25lV2lkZ2V0ID0+IHpvbmVXaWRnZXQudW5pcXVlT3duZXIgPT09IGUudW5pcXVlT3duZXIgJiYgem9uZVdpZGdldC5jb21tZW50VGhyZWFkLnRocmVhZElkID09PSB0aHJlYWQudGhyZWFkSWQgJiYgem9uZVdpZGdldC5jb21tZW50VGhyZWFkLnRocmVhZElkICE9PSAnJyk7XG5cdFx0XHRcdGlmIChtYXRjaGVkWm9uZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hlZFpvbmUgPSBtYXRjaGVkWm9uZXNbMF07XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5pbmRleE9mKG1hdGNoZWRab25lKTtcblx0XHRcdFx0XHR0aGlzLl9jb21tZW50V2lkZ2V0cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRcdG1hdGNoZWRab25lLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpbmZvc1RocmVhZHMgPSB0aGlzLl9jb21tZW50SW5mb3MuZmlsdGVyKGluZm8gPT4gaW5mby51bmlxdWVPd25lciA9PT0gZS51bmlxdWVPd25lcilbMF0udGhyZWFkcztcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbmZvc1RocmVhZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAoaW5mb3NUaHJlYWRzW2ldID09PSB0aHJlYWQpIHtcblx0XHRcdFx0XHRcdGluZm9zVGhyZWFkcy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRpLS07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCB0aHJlYWQgb2YgY2hhbmdlZCkge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVkWm9uZXMgPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5maWx0ZXIoem9uZVdpZGdldCA9PiB6b25lV2lkZ2V0LnVuaXF1ZU93bmVyID09PSBlLnVuaXF1ZU93bmVyICYmIHpvbmVXaWRnZXQuY29tbWVudFRocmVhZC50aHJlYWRJZCA9PT0gdGhyZWFkLnRocmVhZElkKTtcblx0XHRcdFx0aWYgKG1hdGNoZWRab25lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaGVkWm9uZSA9IG1hdGNoZWRab25lc1swXTtcblx0XHRcdFx0XHRtYXRjaGVkWm9uZS51cGRhdGUodGhyZWFkKTtcblx0XHRcdFx0XHR0aGlzLm9wZW5Db21tZW50c1ZpZXcodGhyZWFkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWRpdG9ySWQgPSB0aGlzLmVkaXRvcj8uZ2V0SWQoKTtcblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIGFkZGVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlQ29tbWVudEFkZGVkKGVkaXRvcklkLCBlLnVuaXF1ZU93bmVyLCB0aHJlYWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBwZW5kaW5nKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVzdW1lUGVuZGluZ0NvbW1lbnQoZWRpdG9yVVJJLCB0aHJlYWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yLnVwZGF0ZSh0aGlzLmVkaXRvciwgY29tbWVudEluZm8pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuYmVnaW5Db21wdXRlQW5kSGFuZGxlRWRpdG9yQ2hhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc3VtZVBlbmRpbmdDb21tZW50KGVkaXRvclVSSTogVVJJLCB0aHJlYWQ6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudFRocmVhZCkge1xuXHRcdGNvbnN0IG1hdGNoZWRab25lcyA9IHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZpbHRlcih6b25lV2lkZ2V0ID0+IHpvbmVXaWRnZXQudW5pcXVlT3duZXIgPT09IHRocmVhZC51bmlxdWVPd25lciAmJiBSYW5nZS5saWZ0KHpvbmVXaWRnZXQuY29tbWVudFRocmVhZC5yYW5nZSk/LmVxdWFsc1JhbmdlKHRocmVhZC5yYW5nZSkpO1xuXHRcdGlmICh0aHJlYWQuaXNSZXBseSAmJiBtYXRjaGVkWm9uZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnJlbW92ZUNvbnRpbnVlT25Db21tZW50KHsgdW5pcXVlT3duZXI6IHRocmVhZC51bmlxdWVPd25lciwgdXJpOiBlZGl0b3JVUkksIHJhbmdlOiB0aHJlYWQucmFuZ2UsIGlzUmVwbHk6IHRydWUgfSk7XG5cdFx0XHRtYXRjaGVkWm9uZXNbMF0uc2V0UGVuZGluZ0NvbW1lbnQodGhyZWFkLmNvbW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAobWF0Y2hlZFpvbmVzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5yZW1vdmVDb250aW51ZU9uQ29tbWVudCh7IHVuaXF1ZU93bmVyOiB0aHJlYWQudW5pcXVlT3duZXIsIHVyaTogZWRpdG9yVVJJLCByYW5nZTogdGhyZWFkLnJhbmdlLCBpc1JlcGx5OiBmYWxzZSB9KTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nUGVuZGluZ0NvbW1lbnQgPSBtYXRjaGVkWm9uZXNbMF0uZ2V0UGVuZGluZ0NvbW1lbnRzKCkubmV3Q29tbWVudDtcblx0XHRcdC8vIFdlIG5lZWQgdG8gdHJ5IHRvIHJlY29uY2lsZSB0aGUgZXhpc3RpbmcgcGVuZGluZyBjb21tZW50IHdpdGggdGhlIGluY29taW5nIHBlbmRpbmcgY29tbWVudFxuXHRcdFx0bGV0IHBlbmRpbmdDb21tZW50OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQ7XG5cdFx0XHRpZiAoIWV4aXN0aW5nUGVuZGluZ0NvbW1lbnQgfHwgdGhyZWFkLmNvbW1lbnQuYm9keS5pbmNsdWRlcyhleGlzdGluZ1BlbmRpbmdDb21tZW50LmJvZHkpKSB7XG5cdFx0XHRcdHBlbmRpbmdDb21tZW50ID0gdGhyZWFkLmNvbW1lbnQ7XG5cdFx0XHR9IGVsc2UgaWYgKGV4aXN0aW5nUGVuZGluZ0NvbW1lbnQuYm9keS5pbmNsdWRlcyh0aHJlYWQuY29tbWVudC5ib2R5KSkge1xuXHRcdFx0XHRwZW5kaW5nQ29tbWVudCA9IGV4aXN0aW5nUGVuZGluZ0NvbW1lbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwZW5kaW5nQ29tbWVudCA9IHsgYm9keTogYCR7ZXhpc3RpbmdQZW5kaW5nQ29tbWVudH1cXG4ke3RocmVhZC5jb21tZW50LmJvZHl9YCwgY3Vyc29yOiB0aHJlYWQuY29tbWVudC5jdXJzb3IgfTtcblx0XHRcdH1cblx0XHRcdG1hdGNoZWRab25lc1swXS5zZXRQZW5kaW5nQ29tbWVudChwZW5kaW5nQ29tbWVudCk7XG5cdFx0fSBlbHNlIGlmICghdGhyZWFkLmlzUmVwbHkpIHtcblx0XHRcdGNvbnN0IHRocmVhZFN0aWxsQXZhaWxhYmxlID0gdGhpcy5jb21tZW50U2VydmljZS5yZW1vdmVDb250aW51ZU9uQ29tbWVudCh7IHVuaXF1ZU93bmVyOiB0aHJlYWQudW5pcXVlT3duZXIsIHVyaTogZWRpdG9yVVJJLCByYW5nZTogdGhyZWFkLnJhbmdlLCBpc1JlcGx5OiBmYWxzZSB9KTtcblx0XHRcdGlmICghdGhyZWFkU3RpbGxBdmFpbGFibGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pblByb2Nlc3NDb250aW51ZU9uQ29tbWVudHMuaGFzKHRocmVhZC51bmlxdWVPd25lcikpIHtcblx0XHRcdFx0dGhpcy5faW5Qcm9jZXNzQ29udGludWVPbkNvbW1lbnRzLnNldCh0aHJlYWQudW5pcXVlT3duZXIsIFtdKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luUHJvY2Vzc0NvbnRpbnVlT25Db21tZW50cy5nZXQodGhyZWFkLnVuaXF1ZU93bmVyKT8ucHVzaCh0aHJlYWQpO1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tZW50U2VydmljZS5jcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUodGhyZWFkLnVuaXF1ZU93bmVyLCB0aHJlYWQudXJpLCB0aHJlYWQucmFuZ2UgPyBSYW5nZS5saWZ0KHRocmVhZC5yYW5nZSkgOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYmVnaW5Db21wdXRlQW5kSGFuZGxlRWRpdG9yQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuYmVnaW5Db21wdXRlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2hhc1Jlc3BvbmRlZFRvRWRpdG9yQ2hhbmdlKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb21tZW50SW5mb3Muc29tZShjb21tZW50SW5mbyA9PiBjb21tZW50SW5mby5jb21tZW50aW5nUmFuZ2VzLnJhbmdlcy5sZW5ndGggPiAwIHx8IGNvbW1lbnRJbmZvLmNvbW1lbnRpbmdSYW5nZXMuZmlsZUNvbW1lbnRzKSkge1xuXHRcdFx0XHRcdHRoaXMuX2hhc1Jlc3BvbmRlZFRvRWRpdG9yQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCB2ZXJib3NlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNvbW1lbnRzKTtcblx0XHRcdFx0XHRpZiAodmVyYm9zZSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmlsaXR5SGVscCk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0XHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzKG5scy5sb2NhbGl6ZSgnaGFzQ29tbWVudFJhbmdlc0tiJywgXCJFZGl0b3IgaGFzIGNvbW1lbnRpbmcgcmFuZ2VzLCBydW4gdGhlIGNvbW1hbmQgT3BlbiBBY2Nlc3NpYmlsaXR5IEhlbHAgKHswfSksIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiLCBrZXliaW5kaW5nKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdGF0dXMobmxzLmxvY2FsaXplKCdoYXNDb21tZW50UmFuZ2VzTm9LYicsIFwiRWRpdG9yIGhhcyBjb21tZW50aW5nIHJhbmdlcywgcnVuIHRoZSBjb21tYW5kIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwLCB3aGljaCBpcyBjdXJyZW50bHkgbm90IHRyaWdnZXJhYmxlIHZpYSBrZXliaW5kaW5nLCBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGF0dXMobmxzLmxvY2FsaXplKCdoYXNDb21tZW50UmFuZ2VzJywgXCJFZGl0b3IgaGFzIGNvbW1lbnRpbmcgcmFuZ2VzLlwiKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5Db21tZW50c1ZpZXcodGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZCkge1xuXHRcdGlmICh0aHJlYWQuY29tbWVudHMgJiYgKHRocmVhZC5jb21tZW50cy5sZW5ndGggPiAwKSAmJiB0aHJlYWRIYXNNZWFuaW5nZnVsQ29tbWVudHModGhyZWFkKSkge1xuXHRcdFx0Y29uc3Qgb3BlblZpZXdTdGF0ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUNvbW1lbnRzQ29uZmlndXJhdGlvbj4oQ09NTUVOVFNfU0VDVElPTikub3BlblZpZXc7XG5cdFx0XHRpZiAob3BlblZpZXdTdGF0ZSA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhDT01NRU5UU19WSUVXX0lEKTtcblx0XHRcdH0gZWxzZSBpZiAob3BlblZpZXdTdGF0ZSA9PT0gJ2ZpcnN0RmlsZScgfHwgKG9wZW5WaWV3U3RhdGUgPT09ICdmaXJzdEZpbGVVbnJlc29sdmVkJyAmJiB0aHJlYWQuc3RhdGUgPT09IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZCkpIHtcblx0XHRcdFx0Y29uc3QgaGFzU2hvd25WaWV3ID0gdGhpcy52aWV3c1NlcnZpY2UuZ2V0Vmlld1dpdGhJZDxDb21tZW50c1BhbmVsPihDT01NRU5UU19WSUVXX0lEKT8uaGFzUmVuZGVyZWQ7XG5cdFx0XHRcdGlmICghaGFzU2hvd25WaWV3KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KENPTU1FTlRTX1ZJRVdfSUQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc3BsYXlDb21tZW50VGhyZWFkKHVuaXF1ZU93bmVyOiBzdHJpbmcsIHRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQsIHNob3VsZFJldmVhbDogYm9vbGVhbiwgcGVuZGluZ0NvbW1lbnQ6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB8IHVuZGVmaW5lZCwgcGVuZGluZ0VkaXRzOiB7IFtrZXk6IG51bWJlcl06IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB9IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmVkaXRvciB8fCB0aGlzLmlzRWRpdG9ySW5saW5lT3JpZ2luYWwodGhpcy5lZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNvbnRpbnVlT25Db21tZW50UmVwbHk6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudFRocmVhZCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhyZWFkLnJhbmdlICYmICFwZW5kaW5nQ29tbWVudCkge1xuXHRcdFx0Y29udGludWVPbkNvbW1lbnRSZXBseSA9IHRoaXMuY29tbWVudFNlcnZpY2UucmVtb3ZlQ29udGludWVPbkNvbW1lbnQoeyB1bmlxdWVPd25lciwgdXJpOiBlZGl0b3IudXJpLCByYW5nZTogdGhyZWFkLnJhbmdlLCBpc1JlcGx5OiB0cnVlIH0pO1xuXHRcdH1cblx0XHRjb25zdCB6b25lV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXZpZXdab25lV2lkZ2V0LCB0aGlzLmVkaXRvciwgdW5pcXVlT3duZXIsIHRocmVhZCwgcGVuZGluZ0NvbW1lbnQgPz8gY29udGludWVPbkNvbW1lbnRSZXBseT8uY29tbWVudCwgcGVuZGluZ0VkaXRzKTtcblx0XHRhd2FpdCB6b25lV2lkZ2V0LmRpc3BsYXkodGhyZWFkLnJhbmdlLCBzaG91bGRSZXZlYWwpO1xuXHRcdHRoaXMuX2NvbW1lbnRXaWRnZXRzLnB1c2goem9uZVdpZGdldCk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQoem9uZVdpZGdldC5vbkRpZENoYW5nZUV4cGFuZGVkU3RhdGUoKCkgPT4gdGhpcy5fdXBkYXRlQ29tbWVudFdpZGdldFZpc2libGVDb250ZXh0KCkpKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh6b25lV2lkZ2V0Lm9uRGlkQ2xvc2UoKCkgPT4gdGhpcy5fdXBkYXRlQ29tbWVudFdpZGdldFZpc2libGVDb250ZXh0KCkpKTtcblx0XHR0aGlzLm9wZW5Db21tZW50c1ZpZXcodGhyZWFkKTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZURvd24oZTogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLm1vdXNlRG93bkluZm8gPSAoZS50YXJnZXQuZWxlbWVudD8uY2xhc3NOYW1lLmluZGV4T2YoJ2NvbW1lbnQtcmFuZ2UtZ2x5cGgnKSA/PyAtMSkgPj0gMCA/IHBhcnNlTW91c2VEb3duSW5mb0Zyb21FdmVudChlKSA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yTW91c2VVcChlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG1hdGNoZWRMaW5lTnVtYmVyID0gaXNNb3VzZVVwRXZlbnREcmFnRnJvbU1vdXNlRG93bih0aGlzLm1vdXNlRG93bkluZm8sIGUpO1xuXHRcdHRoaXMubW91c2VEb3duSW5mbyA9IG51bGw7XG5cblx0XHRpZiAoIXRoaXMuZWRpdG9yIHx8IG1hdGNoZWRMaW5lTnVtYmVyID09PSBudWxsIHx8ICFlLnRhcmdldC5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vdXNlVXBJc09uRGVjb3JhdG9yID0gKGUudGFyZ2V0LmVsZW1lbnQuY2xhc3NOYW1lLmluZGV4T2YoJ2NvbW1lbnQtcmFuZ2UtZ2x5cGgnKSA+PSAwKTtcblxuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBlLnRhcmdldC5wb3NpdGlvbiEubGluZU51bWJlcjtcblx0XHRsZXQgcmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZWxlY3Rpb246IFJhbmdlIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0XHQvLyBDaGVjayBmb3IgZHJhZyBhbG9uZyBndXR0ZXIgZGVjb3JhdGlvblxuXHRcdGlmICgobWF0Y2hlZExpbmVOdW1iZXIgIT09IGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRpZiAobWF0Y2hlZExpbmVOdW1iZXIgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHNlbGVjdGlvbiA9IG5ldyBSYW5nZShtYXRjaGVkTGluZU51bWJlciwgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUxlbmd0aChtYXRjaGVkTGluZU51bWJlcikgKyAxLCBsaW5lTnVtYmVyLCAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlbGVjdGlvbiA9IG5ldyBSYW5nZShtYXRjaGVkTGluZU51bWJlciwgMSwgbGluZU51bWJlciwgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKSArIDEpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAobW91c2VVcElzT25EZWNvcmF0b3IpIHtcblx0XHRcdHNlbGVjdGlvbiA9IHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBzZWxlY3Rpb24gYXQgbGluZSBudW1iZXIuXG5cdFx0aWYgKHNlbGVjdGlvbiAmJiAoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA8PSBsaW5lTnVtYmVyKSAmJiAobGluZU51bWJlciA8PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcikpIHtcblx0XHRcdHJhbmdlID0gc2VsZWN0aW9uO1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZShzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgMSwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIDEpKTtcblx0XHR9IGVsc2UgaWYgKG1vdXNlVXBJc09uRGVjb3JhdG9yKSB7XG5cdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCAxKTtcblx0XHR9XG5cblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdHRoaXMuYWRkT3JUb2dnbGVDb21tZW50QXRMaW5lKHJhbmdlLCBlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29tbWVudHNBdExpbmUoY29tbWVudFJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCk6IFJldmlld1pvbmVXaWRnZXRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZpbHRlcih3aWRnZXQgPT4gd2lkZ2V0LmdldEdseXBoUG9zaXRpb24oKSA9PT0gKGNvbW1lbnRSYW5nZSA/IGNvbW1lbnRSYW5nZS5lbmRMaW5lTnVtYmVyIDogMCkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGFkZE9yVG9nZ2xlQ29tbWVudEF0TGluZShjb21tZW50UmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkLCBlOiBJRWRpdG9yTW91c2VFdmVudCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIElmIGFuIGFkZCBpcyBhbHJlYWR5IGluIHByb2dyZXNzLCBxdWV1ZSB0aGUgbmV4dCBhZGQgYW5kIHByb2Nlc3MgaXQgYWZ0ZXIgdGhlIGN1cnJlbnQgb25lIGZpbmlzaGVzIHRvXG5cdFx0Ly8gcHJldmVudCBlbXB0eSBjb21tZW50IHRocmVhZHMgZnJvbSBiZWluZyBhZGRlZCB0byB0aGUgc2FtZSBsaW5lLlxuXHRcdGlmICghdGhpcy5fYWRkSW5Qcm9ncmVzcykge1xuXHRcdFx0dGhpcy5fYWRkSW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0XHQvLyBUaGUgd2lkZ2V0J3MgcG9zaXRpb24gaXMgdW5kZWZpbmVkIHVudGlsIHRoZSB3aWRnZXQgaGFzIGJlZW4gZGlzcGxheWVkLCBzbyByZWx5IG9uIHRoZSBnbHlwaCBwb3NpdGlvbiBpbnN0ZWFkXG5cdFx0XHRjb25zdCBleGlzdGluZ0NvbW1lbnRzQXRMaW5lID0gdGhpcy5nZXRDb21tZW50c0F0TGluZShjb21tZW50UmFuZ2UpO1xuXHRcdFx0aWYgKGV4aXN0aW5nQ29tbWVudHNBdExpbmUubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGFsbEV4cGFuZGVkID0gZXhpc3RpbmdDb21tZW50c0F0TGluZS5ldmVyeSh3aWRnZXQgPT4gd2lkZ2V0LmV4cGFuZGVkKTtcblx0XHRcdFx0ZXhpc3RpbmdDb21tZW50c0F0TGluZS5mb3JFYWNoKGFsbEV4cGFuZGVkID8gd2lkZ2V0ID0+IHdpZGdldC5jb2xsYXBzZSh0cnVlKSA6IHdpZGdldCA9PiB3aWRnZXQuZXhwYW5kKHRydWUpKTtcblx0XHRcdFx0dGhpcy5wcm9jZXNzTmV4dFRocmVhZFRvQWRkKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWRkQ29tbWVudEF0TGluZShjb21tZW50UmFuZ2UsIGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9lbXB0eVRocmVhZHNUb0FkZFF1ZXVlLnB1c2goW2NvbW1lbnRSYW5nZSwgZV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc05leHRUaHJlYWRUb0FkZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9hZGRJblByb2dyZXNzID0gZmFsc2U7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2VtcHR5VGhyZWFkc1RvQWRkUXVldWUuc2hpZnQoKTtcblx0XHRpZiAoaW5mbykge1xuXHRcdFx0dGhpcy5hZGRPclRvZ2dsZUNvbW1lbnRBdExpbmUoaW5mb1swXSwgaW5mb1sxXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGlwVXNlclJhbmdlVG9Db21tZW50UmFuZ2UodXNlclJhbmdlOiBSYW5nZSwgY29tbWVudFJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRpZiAodXNlclJhbmdlLnN0YXJ0TGluZU51bWJlciA8IGNvbW1lbnRSYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHVzZXJSYW5nZSA9IG5ldyBSYW5nZShjb21tZW50UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb21tZW50UmFuZ2Uuc3RhcnRDb2x1bW4sIHVzZXJSYW5nZS5lbmRMaW5lTnVtYmVyLCB1c2VyUmFuZ2UuZW5kQ29sdW1uKTtcblx0XHR9XG5cdFx0aWYgKHVzZXJSYW5nZS5lbmRMaW5lTnVtYmVyID4gY29tbWVudFJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHVzZXJSYW5nZSA9IG5ldyBSYW5nZSh1c2VyUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB1c2VyUmFuZ2Uuc3RhcnRDb2x1bW4sIGNvbW1lbnRSYW5nZS5lbmRMaW5lTnVtYmVyLCBjb21tZW50UmFuZ2UuZW5kQ29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVzZXJSYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBhZGRDb21tZW50QXRMaW5lKHJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCwgZTogSUVkaXRvck1vdXNlRXZlbnQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXdDb21tZW50SW5mb3MgPSB0aGlzLl9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IuZ2V0TWF0Y2hlZENvbW1lbnRBY3Rpb24ocmFuZ2UpO1xuXHRcdGlmICghbmV3Q29tbWVudEluZm9zLmxlbmd0aCB8fCAhdGhpcy5lZGl0b3I/Lmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX2FkZEluUHJvZ3Jlc3MgPSBmYWxzZTtcblx0XHRcdGlmICghbmV3Q29tbWVudEluZm9zLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdjb21tZW50cy5hZGRDb21tYW5kLmVycm9yJywgXCJUaGUgY3Vyc29yIG11c3QgYmUgd2l0aGluIGEgY29tbWVudGluZyByYW5nZSB0byBhZGQgYSBjb21tZW50LlwiKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnY29tbWVudHMuYWRkRmlsZUNvbW1lbnRDb21tYW5kLmVycm9yJywgXCJGaWxlIGNvbW1lbnRzIGFyZSBub3QgYWxsb3dlZCBvbiB0aGlzIGZpbGUuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGlmIChuZXdDb21tZW50SW5mb3MubGVuZ3RoID4gMSkge1xuXHRcdFx0aWYgKGUgJiYgcmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuZXZlbnQsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMobmV3Q29tbWVudEluZm9zLCByYW5nZSksXG5cdFx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IG5ld0NvbW1lbnRJbmZvcy5sZW5ndGggPyBuZXdDb21tZW50SW5mb3NbMF0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b25IaWRlOiAoKSA9PiB7IHRoaXMuX2FkZEluUHJvZ3Jlc3MgPSBmYWxzZTsgfVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwaWNrcyA9IHRoaXMuZ2V0Q29tbWVudFByb3ZpZGVyc1F1aWNrUGlja3MobmV3Q29tbWVudEluZm9zKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdwaWNrQ29tbWVudFNlcnZpY2UnLCBcIlNlbGVjdCBDb21tZW50IFByb3ZpZGVyXCIpLCBtYXRjaE9uRGVzY3JpcHRpb246IHRydWUgfSkudGhlbihwaWNrID0+IHtcblx0XHRcdFx0XHRpZiAoIXBpY2spIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBjb21tZW50SW5mb3MgPSBuZXdDb21tZW50SW5mb3MuZmlsdGVyKGluZm8gPT4gaW5mby5hY3Rpb24ub3duZXJJZCA9PT0gcGljay5pZCk7XG5cblx0XHRcdFx0XHRpZiAoY29tbWVudEluZm9zLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBvd25lcklkIH0gPSBjb21tZW50SW5mb3NbMF0uYWN0aW9uO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2xpcHBlZFJhbmdlID0gcmFuZ2UgJiYgY29tbWVudEluZm9zWzBdLnJhbmdlID8gdGhpcy5jbGlwVXNlclJhbmdlVG9Db21tZW50UmFuZ2UocmFuZ2UsIGNvbW1lbnRJbmZvc1swXS5yYW5nZSkgOiByYW5nZTtcblx0XHRcdFx0XHRcdHRoaXMuYWRkQ29tbWVudEF0TGluZTIoY2xpcHBlZFJhbmdlLCBvd25lcklkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2FkZEluUHJvZ3Jlc3MgPSBmYWxzZTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHsgb3duZXJJZCB9ID0gbmV3Q29tbWVudEluZm9zWzBdLmFjdGlvbjtcblx0XHRcdGNvbnN0IGNsaXBwZWRSYW5nZSA9IHJhbmdlICYmIG5ld0NvbW1lbnRJbmZvc1swXS5yYW5nZSA/IHRoaXMuY2xpcFVzZXJSYW5nZVRvQ29tbWVudFJhbmdlKHJhbmdlLCBuZXdDb21tZW50SW5mb3NbMF0ucmFuZ2UpIDogcmFuZ2U7XG5cdFx0XHR0aGlzLmFkZENvbW1lbnRBdExpbmUyKGNsaXBwZWRSYW5nZSwgb3duZXJJZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21tZW50UHJvdmlkZXJzUXVpY2tQaWNrcyhjb21tZW50SW5mb3M6IE1lcmdlZENvbW1lbnRSYW5nZUFjdGlvbnNbXSkge1xuXHRcdGNvbnN0IHBpY2tzOiBRdWlja1BpY2tJbnB1dFtdID0gY29tbWVudEluZm9zLm1hcCgoY29tbWVudEluZm8pID0+IHtcblx0XHRcdGNvbnN0IHsgb3duZXJJZCwgZXh0ZW5zaW9uSWQsIGxhYmVsIH0gPSBjb21tZW50SW5mby5hY3Rpb247XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBsYWJlbCA/PyBleHRlbnNpb25JZCA/PyBvd25lcklkLFxuXHRcdFx0XHRpZDogb3duZXJJZFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVF1aWNrUGlja0l0ZW07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRleHRNZW51QWN0aW9ucyhjb21tZW50SW5mb3M6IE1lcmdlZENvbW1lbnRSYW5nZUFjdGlvbnNbXSwgY29tbWVudFJhbmdlOiBSYW5nZSk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRjb21tZW50SW5mb3MuZm9yRWFjaChjb21tZW50SW5mbyA9PiB7XG5cdFx0XHRjb25zdCB7IG93bmVySWQsIGV4dGVuc2lvbklkLCBsYWJlbCB9ID0gY29tbWVudEluZm8uYWN0aW9uO1xuXG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbihcblx0XHRcdFx0J2FkZENvbW1lbnRUaHJlYWQnLFxuXHRcdFx0XHRgJHtsYWJlbCB8fCBleHRlbnNpb25JZH1gLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjbGlwcGVkUmFuZ2UgPSBjb21tZW50SW5mby5yYW5nZSA/IHRoaXMuY2xpcFVzZXJSYW5nZVRvQ29tbWVudFJhbmdlKGNvbW1lbnRSYW5nZSwgY29tbWVudEluZm8ucmFuZ2UpIDogY29tbWVudFJhbmdlO1xuXHRcdFx0XHRcdHRoaXMuYWRkQ29tbWVudEF0TGluZTIoY2xpcHBlZFJhbmdlLCBvd25lcklkKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHVibGljIGFkZENvbW1lbnRBdExpbmUyKHJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCwgb3duZXJJZDogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLmNyZWF0ZUNvbW1lbnRUaHJlYWRUZW1wbGF0ZShvd25lcklkLCB0aGlzLmVkaXRvci5nZXRNb2RlbCgpIS51cmksIHJhbmdlLCB0aGlzLmVkaXRvci5nZXRJZCgpKTtcblx0XHR0aGlzLnByb2Nlc3NOZXh0VGhyZWFkVG9BZGQoKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIGdldEV4aXN0aW5nQ29tbWVudEVkaXRvck9wdGlvbnMoZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGNvbnN0IGxpbmVEZWNvcmF0aW9uc1dpZHRoOiBudW1iZXIgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lRGVjb3JhdGlvbnNXaWR0aCk7XG5cdFx0bGV0IGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRFeHRyYUNsYXNzTmFtZSA9IGVkaXRvci5nZXRSYXdPcHRpb25zKCkuZXh0cmFFZGl0b3JDbGFzc05hbWU7XG5cdFx0aWYgKGNvbmZpZ3VyZWRFeHRyYUNsYXNzTmFtZSkge1xuXHRcdFx0ZXh0cmFFZGl0b3JDbGFzc05hbWUgPSBjb25maWd1cmVkRXh0cmFDbGFzc05hbWUuc3BsaXQoJyAnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbGluZURlY29yYXRpb25zV2lkdGgsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFdpdGhvdXRDb21tZW50c0VkaXRvck9wdGlvbnMoZWRpdG9yOiBJQ29kZUVkaXRvciwgZXh0cmFFZGl0b3JDbGFzc05hbWU6IHN0cmluZ1tdLCBzdGFydGluZ0xpbmVEZWNvcmF0aW9uc1dpZHRoOiBudW1iZXIpIHtcblx0XHRsZXQgbGluZURlY29yYXRpb25zV2lkdGggPSBzdGFydGluZ0xpbmVEZWNvcmF0aW9uc1dpZHRoO1xuXHRcdGNvbnN0IGlubGluZUNvbW1lbnRQb3MgPSBleHRyYUVkaXRvckNsYXNzTmFtZS5maW5kSW5kZXgobmFtZSA9PiBuYW1lID09PSAnaW5saW5lLWNvbW1lbnQnKTtcblx0XHRpZiAoaW5saW5lQ29tbWVudFBvcyA+PSAwKSB7XG5cdFx0XHRleHRyYUVkaXRvckNsYXNzTmFtZS5zcGxpY2UoaW5saW5lQ29tbWVudFBvcywgMSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGVkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nKSAmJiBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scykgIT09ICduZXZlcicpIHtcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoICs9IDExOyAvLyAxMSBjb21lcyBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvOTRlZTVmNTg2MTlkNTkxNzA5ODNmNDUzZmU3OGYxNTZjMGNjNzNhMy9zcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9tZWRpYS9yZXZpZXcuY3NzI0w0ODVcblx0XHR9XG5cdFx0bGluZURlY29yYXRpb25zV2lkdGggLT0gMjQ7XG5cdFx0cmV0dXJuIHsgZXh0cmFFZGl0b3JDbGFzc05hbWUsIGxpbmVEZWNvcmF0aW9uc1dpZHRoIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFdpdGhDb21tZW50c0xpbmVEZWNvcmF0aW9uV2lkdGgoZWRpdG9yOiBJQ29kZUVkaXRvciwgc3RhcnRpbmdMaW5lRGVjb3JhdGlvbnNXaWR0aDogbnVtYmVyKSB7XG5cdFx0bGV0IGxpbmVEZWNvcmF0aW9uc1dpZHRoID0gc3RhcnRpbmdMaW5lRGVjb3JhdGlvbnNXaWR0aDtcblx0XHRjb25zdCBvcHRpb25zID0gZWRpdG9yLmdldE9wdGlvbnMoKTtcblx0XHRpZiAob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbGRpbmcpICYmIG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zaG93Rm9sZGluZ0NvbnRyb2xzKSAhPT0gJ25ldmVyJykge1xuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGggLT0gMTE7XG5cdFx0fVxuXHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoICs9IDI0O1xuXHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZUFtb3VudFJlc2VydmVkID0gbGluZURlY29yYXRpb25zV2lkdGg7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRpbmdSYW5nZUFtb3VudFJlc2VydmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXaXRoQ29tbWVudHNFZGl0b3JPcHRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiBzdHJpbmdbXSwgc3RhcnRpbmdMaW5lRGVjb3JhdGlvbnNXaWR0aDogbnVtYmVyKSB7XG5cdFx0ZXh0cmFFZGl0b3JDbGFzc05hbWUucHVzaCgnaW5saW5lLWNvbW1lbnQnKTtcblx0XHRyZXR1cm4geyBsaW5lRGVjb3JhdGlvbnNXaWR0aDogdGhpcy5nZXRXaXRoQ29tbWVudHNMaW5lRGVjb3JhdGlvbldpZHRoKGVkaXRvciwgc3RhcnRpbmdMaW5lRGVjb3JhdGlvbnNXaWR0aCksIGV4dHJhRWRpdG9yQ2xhc3NOYW1lIH07XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvckxheW91dE9wdGlvbnMoZWRpdG9yOiBJQ29kZUVkaXRvciwgZXh0cmFFZGl0b3JDbGFzc05hbWU6IHN0cmluZ1tdLCBsaW5lRGVjb3JhdGlvbnNXaWR0aDogbnVtYmVyKSB7XG5cdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0ZXh0cmFFZGl0b3JDbGFzc05hbWU6IGV4dHJhRWRpdG9yQ2xhc3NOYW1lLmpvaW4oJyAnKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiBsaW5lRGVjb3JhdGlvbnNXaWR0aFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVDb21tZW50aW5nUmFuZ2VSZXNlcnZlZEFtb3VudChlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldEV4aXN0aW5nQ29tbWVudEVkaXRvck9wdGlvbnMoZWRpdG9yKTtcblx0XHRpZiAoZXhpc3RpbmcubGluZURlY29yYXRpb25zV2lkdGggIT09IHRoaXMuX2NvbW1lbnRpbmdSYW5nZUFtb3VudFJlc2VydmVkKSB7XG5cdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiB0aGlzLmdldFdpdGhDb21tZW50c0xpbmVEZWNvcmF0aW9uV2lkdGgoZWRpdG9yLCBleGlzdGluZy5saW5lRGVjb3JhdGlvbnNXaWR0aClcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJ5VXBkYXRlUmVzZXJ2ZWRTcGFjZSh1cmk/OiBVUkkpIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQ29tbWVudHNPclJhbmdlc0luSW5mbyA9IHRoaXMuX2NvbW1lbnRJbmZvcy5zb21lKGluZm8gPT4ge1xuXHRcdFx0Y29uc3QgaGFzUmFuZ2VzID0gQm9vbGVhbihpbmZvLmNvbW1lbnRpbmdSYW5nZXMgJiYgKEFycmF5LmlzQXJyYXkoaW5mby5jb21tZW50aW5nUmFuZ2VzKSA/IGluZm8uY29tbWVudGluZ1JhbmdlcyA6IGluZm8uY29tbWVudGluZ1Jhbmdlcy5yYW5nZXMpLmxlbmd0aCk7XG5cdFx0XHRyZXR1cm4gaGFzUmFuZ2VzIHx8IChpbmZvLnRocmVhZHMubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cdFx0dXJpID0gdXJpID8/IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk/LnVyaTtcblx0XHRjb25zdCByZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXMgPSB1cmkgPyB0aGlzLmNvbW1lbnRTZXJ2aWNlLnJlc291cmNlSGFzQ29tbWVudGluZ1Jhbmdlcyh1cmkpIDogZmFsc2U7XG5cblx0XHRjb25zdCBoYXNDb21tZW50c09yUmFuZ2VzID0gaGFzQ29tbWVudHNPclJhbmdlc0luSW5mbyB8fCByZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXM7XG5cblx0XHRpZiAoaGFzQ29tbWVudHNPclJhbmdlcyAmJiB0aGlzLmNvbW1lbnRTZXJ2aWNlLmlzQ29tbWVudGluZ0VuYWJsZWQpIHtcblx0XHRcdGlmICghdGhpcy5fY29tbWVudGluZ1JhbmdlU3BhY2VSZXNlcnZlZCkge1xuXHRcdFx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VTcGFjZVJlc2VydmVkID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgeyBsaW5lRGVjb3JhdGlvbnNXaWR0aCwgZXh0cmFFZGl0b3JDbGFzc05hbWUgfSA9IHRoaXMuZ2V0RXhpc3RpbmdDb21tZW50RWRpdG9yT3B0aW9ucyh0aGlzLmVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IG5ld09wdGlvbnMgPSB0aGlzLmdldFdpdGhDb21tZW50c0VkaXRvck9wdGlvbnModGhpcy5lZGl0b3IsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lLCBsaW5lRGVjb3JhdGlvbnNXaWR0aCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlRWRpdG9yTGF5b3V0T3B0aW9ucyh0aGlzLmVkaXRvciwgbmV3T3B0aW9ucy5leHRyYUVkaXRvckNsYXNzTmFtZSwgbmV3T3B0aW9ucy5saW5lRGVjb3JhdGlvbnNXaWR0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVuc3VyZUNvbW1lbnRpbmdSYW5nZVJlc2VydmVkQW1vdW50KHRoaXMuZWRpdG9yKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCghaGFzQ29tbWVudHNPclJhbmdlcyB8fCAhdGhpcy5jb21tZW50U2VydmljZS5pc0NvbW1lbnRpbmdFbmFibGVkKSAmJiB0aGlzLl9jb21tZW50aW5nUmFuZ2VTcGFjZVJlc2VydmVkKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VTcGFjZVJlc2VydmVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCB7IGxpbmVEZWNvcmF0aW9uc1dpZHRoLCBleHRyYUVkaXRvckNsYXNzTmFtZSB9ID0gdGhpcy5nZXRFeGlzdGluZ0NvbW1lbnRFZGl0b3JPcHRpb25zKHRoaXMuZWRpdG9yKTtcblx0XHRcdGNvbnN0IG5ld09wdGlvbnMgPSB0aGlzLmdldFdpdGhvdXRDb21tZW50c0VkaXRvck9wdGlvbnModGhpcy5lZGl0b3IsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lLCBsaW5lRGVjb3JhdGlvbnNXaWR0aCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckxheW91dE9wdGlvbnModGhpcy5lZGl0b3IsIG5ld09wdGlvbnMuZXh0cmFFZGl0b3JDbGFzc05hbWUsIG5ld09wdGlvbnMubGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0Q29tbWVudHMoY29tbWVudEluZm9zOiBJQ29tbWVudEluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3IgfHwgIXRoaXMuY29tbWVudFNlcnZpY2UuaXNDb21tZW50aW5nRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbW1lbnRJbmZvcyA9IGNvbW1lbnRJbmZvcztcblx0XHR0aGlzLnRyeVVwZGF0ZVJlc2VydmVkU3BhY2UoKTtcblx0XHQvLyBjcmVhdGUgdmlld3pvbmVzXG5cdFx0dGhpcy5yZW1vdmVDb21tZW50V2lkZ2V0c0FuZFN0b3JlQ2FjaGUoKTtcblxuXHRcdGxldCBoYXNDb21tZW50aW5nUmFuZ2VzID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBpbmZvIG9mIHRoaXMuX2NvbW1lbnRJbmZvcykge1xuXHRcdFx0aWYgKCFoYXNDb21tZW50aW5nUmFuZ2VzICYmIChpbmZvLmNvbW1lbnRpbmdSYW5nZXMucmFuZ2VzLmxlbmd0aCA+IDAgfHwgaW5mby5jb21tZW50aW5nUmFuZ2VzLmZpbGVDb21tZW50cykpIHtcblx0XHRcdFx0aGFzQ29tbWVudGluZ1JhbmdlcyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyQ2FjaGVTdG9yZSA9IHRoaXMuX3BlbmRpbmdOZXdDb21tZW50Q2FjaGVbaW5mby51bmlxdWVPd25lcl07XG5cdFx0XHRjb25zdCBwcm92aWRlckVkaXRzQ2FjaGVTdG9yZSA9IHRoaXMuX3BlbmRpbmdFZGl0c0NhY2hlW2luZm8udW5pcXVlT3duZXJdO1xuXHRcdFx0aW5mby50aHJlYWRzID0gaW5mby50aHJlYWRzLmZpbHRlcih0aHJlYWQgPT4gIXRocmVhZC5pc0Rpc3Bvc2VkKTtcblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIGluZm8udGhyZWFkcykge1xuXHRcdFx0XHRsZXQgcGVuZGluZ0NvbW1lbnQ6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHByb3ZpZGVyQ2FjaGVTdG9yZSkge1xuXHRcdFx0XHRcdHBlbmRpbmdDb21tZW50ID0gcHJvdmlkZXJDYWNoZVN0b3JlW3RocmVhZC50aHJlYWRJZF07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgcGVuZGluZ0VkaXRzOiB7IFtrZXk6IG51bWJlcl06IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocHJvdmlkZXJFZGl0c0NhY2hlU3RvcmUpIHtcblx0XHRcdFx0XHRwZW5kaW5nRWRpdHMgPSBwcm92aWRlckVkaXRzQ2FjaGVTdG9yZVt0aHJlYWQudGhyZWFkSWRdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5kaXNwbGF5Q29tbWVudFRocmVhZChpbmZvLnVuaXF1ZU93bmVyLCB0aHJlYWQsIGZhbHNlLCBwZW5kaW5nQ29tbWVudCwgcGVuZGluZ0VkaXRzKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIGluZm8ucGVuZGluZ0NvbW1lbnRUaHJlYWRzID8/IFtdKSB7XG5cdFx0XHRcdHRoaXMucmVzdW1lUGVuZGluZ0NvbW1lbnQodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEudXJpLCB0aHJlYWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGUodGhpcy5lZGl0b3IsIHRoaXMuX2NvbW1lbnRJbmZvcyk7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yLnVwZGF0ZSh0aGlzLmVkaXRvciwgdGhpcy5fY29tbWVudEluZm9zKTtcblxuXHRcdGlmIChoYXNDb21tZW50aW5nUmFuZ2VzKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Uuc2V0KHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2Uuc2V0KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2VBbmRGb2N1c1JhbmdlKHRocmVhZElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50V2lkZ2V0cz8uZmluZCh3aWRnZXQgPT4gd2lkZ2V0LmNvbW1lbnRUaHJlYWQudGhyZWFkSWQgPT09IHRocmVhZElkKT8uY29sbGFwc2VBbmRGb2N1c1JhbmdlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUNvbW1lbnRXaWRnZXRzQW5kU3RvcmVDYWNoZSgpIHtcblx0XHRpZiAodGhpcy5fY29tbWVudFdpZGdldHMpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZvckVhY2goem9uZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDb21tZW50cyA9IHpvbmUuZ2V0UGVuZGluZ0NvbW1lbnRzKCk7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdOZXdDb21tZW50ID0gcGVuZGluZ0NvbW1lbnRzLm5ld0NvbW1lbnQ7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyTmV3Q29tbWVudENhY2hlU3RvcmUgPSB0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlW3pvbmUudW5pcXVlT3duZXJdO1xuXG5cdFx0XHRcdGxldCBsYXN0Q29tbWVudEJvZHk7XG5cdFx0XHRcdGlmICh6b25lLmNvbW1lbnRUaHJlYWQuY29tbWVudHMgJiYgem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RDb21tZW50ID0gem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzW3pvbmUuY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGxhc3RDb21tZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRsYXN0Q29tbWVudEJvZHkgPSBsYXN0Q29tbWVudC5ib2R5O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsYXN0Q29tbWVudEJvZHkgPSBsYXN0Q29tbWVudC5ib2R5LnZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGVuZGluZ05ld0NvbW1lbnQgJiYgKHBlbmRpbmdOZXdDb21tZW50LmJvZHkgIT09IGxhc3RDb21tZW50Qm9keSkpIHtcblx0XHRcdFx0XHRpZiAoIXByb3ZpZGVyTmV3Q29tbWVudENhY2hlU3RvcmUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdOZXdDb21tZW50Q2FjaGVbem9uZS51bmlxdWVPd25lcl0gPSB7fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlW3pvbmUudW5pcXVlT3duZXJdW3pvbmUuY29tbWVudFRocmVhZC50aHJlYWRJZF0gPSBwZW5kaW5nTmV3Q29tbWVudDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAocHJvdmlkZXJOZXdDb21tZW50Q2FjaGVTdG9yZSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHByb3ZpZGVyTmV3Q29tbWVudENhY2hlU3RvcmVbem9uZS5jb21tZW50VGhyZWFkLnRocmVhZElkXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwZW5kaW5nRWRpdHMgPSBwZW5kaW5nQ29tbWVudHMuZWRpdHM7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyRWRpdHNDYWNoZVN0b3JlID0gdGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGVbem9uZS51bmlxdWVPd25lcl07XG5cdFx0XHRcdGlmIChPYmplY3Qua2V5cyhwZW5kaW5nRWRpdHMpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRpZiAoIXByb3ZpZGVyRWRpdHNDYWNoZVN0b3JlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRWRpdHNDYWNoZVt6b25lLnVuaXF1ZU93bmVyXSA9IHt9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRWRpdHNDYWNoZVt6b25lLnVuaXF1ZU93bmVyXVt6b25lLmNvbW1lbnRUaHJlYWQudGhyZWFkSWRdID0gcGVuZGluZ0VkaXRzO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3ZpZGVyRWRpdHNDYWNoZVN0b3JlKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHByb3ZpZGVyRWRpdHNDYWNoZVN0b3JlW3pvbmUuY29tbWVudFRocmVhZC50aHJlYWRJZF07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR6b25lLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbW1lbnRXaWRnZXRzID0gW107XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNDQUFzQztBQUMvQyxTQUE0Qix5QkFBeUIsZUFBZTtBQUNwRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksaUJBQWlCLGVBQTRCO0FBQ2xFLE9BQU87QUFDUCxTQUF5QyxjQUFjLG9CQUFvQjtBQUMzRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFpQixhQUFhO0FBQzlCLFNBQVMsa0JBQWlGO0FBRTFGLFNBQVMsd0JBQXdCLGlCQUFpQjtBQUNsRCxZQUFZLGVBQWU7QUFDM0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBEO0FBQ25FLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXVCLHVCQUF1QjtBQUM5QyxTQUFTLG9CQUFvQixpQ0FBaUMsNkJBQTZCLHdCQUF3QjtBQUNuSCxTQUFTLGNBQWMsZ0JBQWdCLGtCQUFrQjtBQUN6RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUFnRDtBQUN6RCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGVBQWU7QUFDeEIsU0FBc0IsMEJBQTBCO0FBRWhELFNBQVMsbUNBQW1DO0FBRzVDLFNBQVMsY0FBYztBQUN2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBC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
