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
import "./media/chatEditorController.css";
import { getTotalWidth } from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore, dispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { themeColorFromId } from "../../../../../base/common/themables.js";
import { MouseTargetType } from "../../../../../editor/browser/editorBrowser.js";
import { observableCodeEditor } from "../../../../../editor/browser/observableCodeEditor.js";
import { AccessibleDiffViewer } from "../../../../../editor/browser/widget/diffEditor/components/accessibleDiffViewer.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { diffAddDecoration, diffDeleteDecoration, diffWholeLineAddDecoration } from "../../../../../editor/browser/widget/diffEditor/registrations.contribution.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { LineRange } from "../../../../../editor/common/core/ranges/lineRange.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../../editor/common/model/textModel.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../editor/common/viewModel/inlineDecorations.js";
import { localize } from "../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { TextEditorSelectionRevealType } from "../../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { EditorsOrder, isDiffEditorInput } from "../../../../common/editor.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from "../../../scm/common/quickDiff.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { isTextDiffEditorForEntry } from "./chatEditing.js";
import { ActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ctxCursorInChangeRange } from "./chatEditingEditorContextKeys.js";
import { LinkedList } from "../../../../../base/common/linkedList.js";
import { ChatEditingExplanationWidgetManager } from "./chatEditingExplanationWidget.js";
import { IChatEditingExplanationModelManager } from "./chatEditingExplanationModelManager.js";
import { IChatWidgetService } from "../chat.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
class ObjectPool {
  constructor() {
    this._free = new LinkedList();
  }
  dispose() {
    dispose(this._free);
  }
  get() {
    return this._free.shift();
  }
  putBack(obj) {
    this._free.push(obj);
  }
  get free() {
    return this._free;
  }
}
let ChatEditingCodeEditorIntegration = class {
  constructor(_entry, _editor, documentDiffInfo, renderDiffImmediately, _editorService, _accessibilitySignalsService, contextKeyService, instantiationService, _chatEditingService, _explanationModelManager, _chatWidgetService, _viewsService) {
    this._entry = _entry;
    this._editor = _editor;
    this._editorService = _editorService;
    this._accessibilitySignalsService = _accessibilitySignalsService;
    this._explanationModelManager = _explanationModelManager;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
    this._currentIndex = observableValue(this, -1);
    this.currentIndex = this._currentIndex;
    this._store = new DisposableStore();
    this._diffHunksRenderStore = this._store.add(new DisposableStore());
    this._diffHunkWidgetPool = this._store.add(new ObjectPool());
    this._diffHunkWidgets = [];
    this._viewZones = [];
    this._accessibleDiffViewVisible = observableValue(this, false);
    this._diffLineDecorations = _editor.createDecorationsCollection();
    const codeEditorObs = observableCodeEditor(_editor);
    this._diffLineDecorations = this._editor.createDecorationsCollection();
    this._diffVisualDecorations = this._editor.createDecorationsCollection();
    this._store.add(new ChatEditingExplanationWidgetManager(
      this._editor,
      this._chatWidgetService,
      this._viewsService,
      this._explanationModelManager,
      this._entry.modifiedURI
    ));
    const enabledObs = derived((r) => {
      if (!isEqual(codeEditorObs.model.read(r)?.uri, documentDiffInfo.read(r).modifiedModel.uri)) {
        return false;
      }
      if (this._editor.getOption(EditorOption.inDiffEditor) && !instantiationService.invokeFunction(isTextDiffEditorForEntry, _entry, this._editor)) {
        return false;
      }
      return true;
    });
    this._store.add(autorun((r) => {
      if (!enabledObs.read(r)) {
        this._diffLineDecorations.clear();
        return;
      }
      const data = [];
      const diff = documentDiffInfo.read(r);
      for (const diffEntry of diff.changes) {
        data.push({
          range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
          options: ChatEditingCodeEditorIntegration._diffLineDecorationData
        });
      }
      this._diffLineDecorations.set(data);
    }));
    let lastModifyingRequestId;
    this._store.add(autorun((r) => {
      if (enabledObs.read(r) && !_entry.isCurrentlyBeingModifiedBy.read(r) && lastModifyingRequestId !== _entry.lastModifyingRequestId && !documentDiffInfo.read(r).identical) {
        lastModifyingRequestId = _entry.lastModifyingRequestId;
        const position = _editor.getPosition() ?? new Position(1, 1);
        const ranges = this._diffLineDecorations.getRanges();
        let initialIndex = ranges.findIndex((r2) => r2.containsPosition(position));
        if (initialIndex < 0) {
          initialIndex = 0;
          for (; initialIndex < ranges.length - 1; initialIndex++) {
            const range = ranges[initialIndex];
            if (range.endLineNumber >= position.lineNumber) {
              break;
            }
          }
        }
        this._currentIndex.set(initialIndex, void 0);
        _editor.revealRange(ranges[initialIndex]);
      }
    }));
    this._store.add(autorun((r) => {
      if (!enabledObs.read(r)) {
        this._clearDiffRendering();
        return;
      }
      if (!_entry.isCurrentlyBeingModifiedBy.read(r) || renderDiffImmediately) {
        const isDiffEditor = this._editor.getOption(EditorOption.inDiffEditor);
        codeEditorObs.getOption(EditorOption.fontInfo).read(r);
        codeEditorObs.getOption(EditorOption.lineHeight).read(r);
        const reviewMode = _entry.reviewMode.read(r);
        const diff = documentDiffInfo.read(r);
        this._updateDiffRendering(diff, reviewMode, isDiffEditor);
      }
    }));
    const _ctxCursorInChangeRange = ctxCursorInChangeRange.bindTo(contextKeyService);
    this._store.add(autorun((r) => {
      const position = codeEditorObs.positions.read(r)?.at(0);
      if (!position || !enabledObs.read(r)) {
        _ctxCursorInChangeRange.reset();
        return;
      }
      const diff = documentDiffInfo.read(r);
      const changeAtCursor = diff.changes.find((m) => m.modified.contains(position.lineNumber) || m.modified.isEmpty && m.modified.startLineNumber === position.lineNumber);
      _ctxCursorInChangeRange.set(!!changeAtCursor);
      if (changeAtCursor) {
        let signal;
        if (changeAtCursor.modified.isEmpty) {
          signal = AccessibilitySignal.diffLineDeleted;
        } else if (changeAtCursor.original.isEmpty) {
          signal = AccessibilitySignal.diffLineInserted;
        } else {
          signal = AccessibilitySignal.diffLineModified;
        }
        this._accessibilitySignalsService.playSignal(signal, { source: "chatEditingEditor.cursorPositionChanged" });
      }
    }));
    this._store.add(autorun((r) => {
      const visible = this._accessibleDiffViewVisible.read(r);
      if (!visible || !enabledObs.read(r)) {
        return;
      }
      const accessibleDiffWidget = new AccessibleDiffViewContainer();
      _editor.addOverlayWidget(accessibleDiffWidget);
      r.store.add(toDisposable(() => _editor.removeOverlayWidget(accessibleDiffWidget)));
      r.store.add(instantiationService.createInstance(
        AccessibleDiffViewer,
        accessibleDiffWidget.getDomNode(),
        enabledObs,
        (visible2, tx) => this._accessibleDiffViewVisible.set(visible2, tx),
        constObservable(true),
        codeEditorObs.layoutInfo.map((v, r2) => v.width),
        codeEditorObs.layoutInfo.map((v, r2) => v.height),
        documentDiffInfo.map((diff) => diff.changes.slice()),
        instantiationService.createInstance(AccessibleDiffViewerModel, documentDiffInfo, _editor)
      ));
    }));
    let actualOptions;
    const restoreActualOptions = () => {
      if (actualOptions !== void 0) {
        this._editor.updateOptions(actualOptions);
        actualOptions = void 0;
      }
    };
    this._store.add(toDisposable(restoreActualOptions));
    const renderAsBeingModified = derived(this, (r) => {
      return enabledObs.read(r) && Boolean(_entry.isCurrentlyBeingModifiedBy.read(r));
    });
    this._store.add(autorun((r) => {
      const value = renderAsBeingModified.read(r);
      if (value) {
        actualOptions ??= {
          readOnly: this._editor.getOption(EditorOption.readOnly),
          stickyScroll: this._editor.getOption(EditorOption.stickyScroll),
          codeLens: this._editor.getOption(EditorOption.codeLens),
          guides: this._editor.getOption(EditorOption.guides)
        };
        this._editor.updateOptions({
          readOnly: true,
          stickyScroll: { enabled: false },
          codeLens: false,
          guides: { indentation: false, bracketPairs: false }
        });
      } else {
        restoreActualOptions();
      }
    }));
  }
  dispose() {
    this._clear();
    this._store.dispose();
  }
  _clear() {
    this._diffLineDecorations.clear();
    this._clearDiffRendering();
    this._currentIndex.set(-1, void 0);
  }
  // ---- diff rendering logic
  _clearDiffRendering() {
    this._editor.changeViewZones((viewZoneChangeAccessor) => {
      for (const id of this._viewZones) {
        viewZoneChangeAccessor.removeZone(id);
      }
    });
    this._viewZones = [];
    this._diffHunksRenderStore.clear();
    for (const widget of this._diffHunkWidgetPool.free) {
      widget.remove();
    }
    this._diffVisualDecorations.clear();
  }
  _updateDiffRendering(diff, reviewMode, diffMode) {
    const chatDiffAddDecoration = ModelDecorationOptions.createDynamic({
      ...diffAddDecoration,
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
      ...diffWholeLineAddDecoration,
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const createOverviewDecoration = (overviewRulerColor, minimapColor) => {
      return ModelDecorationOptions.createDynamic({
        description: "chat-editing-decoration",
        overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
        minimap: { color: themeColorFromId(minimapColor), position: MinimapPosition.Gutter }
      });
    };
    const modifiedDecoration = createOverviewDecoration(overviewRulerModifiedForeground, minimapGutterModifiedBackground);
    const addedDecoration = createOverviewDecoration(overviewRulerAddedForeground, minimapGutterAddedBackground);
    const deletedDecoration = createOverviewDecoration(overviewRulerDeletedForeground, minimapGutterDeletedBackground);
    this._diffHunksRenderStore.clear();
    this._diffHunkWidgets.length = 0;
    const diffHunkDecorations = [];
    this._editor.changeViewZones((viewZoneChangeAccessor) => {
      for (const id of this._viewZones) {
        viewZoneChangeAccessor.removeZone(id);
      }
      this._viewZones = [];
      const modifiedVisualDecorations = [];
      const mightContainNonBasicASCII = diff.originalModel.mightContainNonBasicASCII();
      const mightContainRTL = diff.originalModel.mightContainRTL();
      const renderOptions = RenderOptions.fromEditor(this._editor);
      const editorLineCount = this._editor.getModel()?.getLineCount();
      for (const diffEntry of diff.changes) {
        const originalRange = diffEntry.original;
        diff.originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
        const source = new LineSource(
          originalRange.mapToLineArray((l) => diff.originalModel.tokenization.getLineTokens(l)),
          [],
          mightContainNonBasicASCII,
          mightContainRTL
        );
        const decorations = [];
        if (reviewMode) {
          for (const i of diffEntry.innerChanges || []) {
            decorations.push(new InlineDecoration(
              i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)),
              diffDeleteDecoration.className,
              InlineDecorationType.Regular
            ));
            if (!(i.originalRange.isEmpty() && i.originalRange.startLineNumber === 1 && i.modifiedRange.endLineNumber === editorLineCount) && !i.modifiedRange.isEmpty()) {
              modifiedVisualDecorations.push({
                range: i.modifiedRange,
                options: chatDiffAddDecoration
              });
            }
          }
        }
        const isCreatedContent = decorations.length === 1 && decorations[0].range.isEmpty() && diffEntry.original.startLineNumber === 1;
        if (!diffEntry.modified.isEmpty) {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: chatDiffWholeLineAddDecoration
          });
        }
        if (diffEntry.original.isEmpty) {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: addedDecoration
          });
        } else if (diffEntry.modified.isEmpty) {
          modifiedVisualDecorations.push({
            range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
            options: deletedDecoration
          });
        } else {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: modifiedDecoration
          });
        }
        let extraLines = 0;
        if (reviewMode && !diffMode) {
          const domNode = document.createElement("div");
          domNode.className = "chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text";
          const result = renderLines(source, renderOptions, decorations, domNode);
          extraLines = result.heightInLines;
          if (!isCreatedContent) {
            const viewZoneData = {
              afterLineNumber: diffEntry.modified.startLineNumber - 1,
              heightInLines: result.heightInLines,
              domNode,
              ordinal: 5e4 + 2
              // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
            };
            this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
          }
        }
        if (reviewMode || diffMode) {
          let widget = this._diffHunkWidgetPool.get();
          if (!widget) {
            widget = this._editor.invokeWithinContext((accessor) => {
              const instaService = accessor.get(IInstantiationService);
              return instaService.createInstance(DiffHunkWidget, this._editor, diff, diffEntry, this._editor.getModel().getVersionId(), isCreatedContent ? 0 : extraLines);
            });
          } else {
            widget.update(diff, diffEntry, this._editor.getModel().getVersionId(), isCreatedContent ? 0 : extraLines);
          }
          this._diffHunksRenderStore.add(toDisposable(() => {
            this._diffHunkWidgetPool.putBack(widget);
          }));
          widget.layout(diffEntry.modified.startLineNumber);
          this._diffHunkWidgets.push(widget);
          diffHunkDecorations.push({
            range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
            options: {
              description: "diff-hunk-widget",
              stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
            }
          });
        }
      }
      this._diffVisualDecorations.set(!diffMode ? modifiedVisualDecorations : []);
    });
    const diffHunkDecoCollection = this._editor.createDecorationsCollection(diffHunkDecorations);
    this._diffHunksRenderStore.add(toDisposable(() => {
      diffHunkDecoCollection.clear();
    }));
    for (const extraWidget of this._diffHunkWidgetPool.free) {
      extraWidget.remove();
    }
    const positionObs = observableFromEvent(this._editor.onDidChangeCursorPosition, (_) => this._editor.getPosition());
    const activeWidgetIdx = derived((r) => {
      const position = positionObs.read(r);
      if (!position) {
        return -1;
      }
      const idx = diffHunkDecoCollection.getRanges().findIndex((r2) => r2.containsPosition(position));
      return idx;
    });
    const toggleWidget = (activeWidget) => {
      const positionIdx = activeWidgetIdx.get();
      for (let i = 0; i < this._diffHunkWidgets.length; i++) {
        const widget = this._diffHunkWidgets[i];
        widget.toggle(widget === activeWidget || i === positionIdx);
      }
    };
    this._diffHunksRenderStore.add(autorun((r) => {
      const idx = activeWidgetIdx.read(r);
      const widget = this._diffHunkWidgets[idx];
      toggleWidget(widget);
    }));
    this._diffHunksRenderStore.add(this._editor.onMouseUp((e) => {
      if (e.target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
        const zone = e.target.detail;
        const idx = this._viewZones.findIndex((id) => id === zone.viewZoneId);
        if (idx >= 0) {
          this._editor.setPosition(e.target.position);
          this._editor.focus();
        }
      }
    }));
    this._diffHunksRenderStore.add(this._editor.onMouseMove((e) => {
      if (e.target.type === MouseTargetType.OVERLAY_WIDGET) {
        const id = e.target.detail;
        const widget = this._diffHunkWidgets.find((w) => w.getId() === id);
        toggleWidget(widget);
      } else if (e.target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
        const zone = e.target.detail;
        const idx = this._viewZones.findIndex((id) => id === zone.viewZoneId);
        toggleWidget(this._diffHunkWidgets[idx]);
      } else if (e.target.position) {
        const { position } = e.target;
        const idx = diffHunkDecoCollection.getRanges().findIndex((r) => r.containsPosition(position));
        toggleWidget(this._diffHunkWidgets[idx]);
      } else {
        toggleWidget(void 0);
      }
    }));
    this._diffHunksRenderStore.add(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
      for (let i = 0; i < this._diffHunkWidgets.length; i++) {
        const widget = this._diffHunkWidgets[i];
        const range = diffHunkDecoCollection.getRange(i);
        if (range) {
          widget.layout(range?.startLineNumber);
        } else {
          widget.dispose();
        }
      }
    }));
  }
  enableAccessibleDiffView() {
    this._accessibleDiffViewVisible.set(true, void 0);
  }
  // ---- navigation logic
  reveal(firstOrLast, preserveFocus) {
    const decorations = this._diffLineDecorations.getRanges().sort((a, b) => Range.compareRangesUsingStarts(a, b));
    const index = firstOrLast ? 0 : decorations.length - 1;
    const range = decorations.at(index);
    if (range) {
      this._editor.setPosition(range.getStartPosition());
      this._editor.revealRange(range);
      if (!preserveFocus) {
        this._editor.focus();
      }
      this._currentIndex.set(index, void 0);
    }
  }
  next(wrap) {
    return this._reveal(true, !wrap);
  }
  previous(wrap) {
    return this._reveal(false, !wrap);
  }
  _reveal(next, strict) {
    const position = this._editor.getPosition();
    if (!position) {
      this._currentIndex.set(-1, void 0);
      return false;
    }
    const decorations = this._diffLineDecorations.getRanges().sort((a, b) => Range.compareRangesUsingStarts(a, b));
    if (decorations.length === 0) {
      this._currentIndex.set(-1, void 0);
      return false;
    }
    let newIndex = -1;
    for (let i = 0; i < decorations.length; i++) {
      const range = decorations[i];
      if (range.containsPosition(position)) {
        newIndex = i + (next ? 1 : -1);
        break;
      } else if (Position.isBefore(position, range.getStartPosition())) {
        newIndex = next ? i : i - 1;
        break;
      }
    }
    if (strict && (newIndex < 0 || newIndex >= decorations.length)) {
      return false;
    }
    newIndex = (newIndex + decorations.length) % decorations.length;
    this._currentIndex.set(newIndex, void 0);
    const targetRange = decorations[newIndex];
    const targetPosition = next ? targetRange.getStartPosition() : targetRange.getEndPosition();
    this._editor.setPosition(targetPosition);
    this._editor.revealPositionInCenter(targetRange.getStartPosition().delta(-1));
    this._editor.focus();
    return true;
  }
  // --- hunks
  _findClosestWidget() {
    if (!this._editor.hasModel()) {
      return void 0;
    }
    const lineRelativeTop = this._editor.getTopForLineNumber(this._editor.getPosition().lineNumber) - this._editor.getScrollTop();
    let closestWidget;
    let closestDistance = Number.MAX_VALUE;
    for (const widget of this._diffHunkWidgets) {
      const widgetTop = widget.getPosition()?.preference?.top;
      if (widgetTop !== void 0) {
        const distance = Math.abs(widgetTop - lineRelativeTop);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestWidget = widget;
        }
      }
    }
    return closestWidget;
  }
  async rejectNearestChange(closestWidget) {
    closestWidget = closestWidget ?? this._findClosestWidget();
    if (closestWidget instanceof DiffHunkWidget) {
      await closestWidget.reject();
      this.next(true);
    }
  }
  async acceptNearestChange(closestWidget) {
    closestWidget = closestWidget ?? this._findClosestWidget();
    if (closestWidget instanceof DiffHunkWidget) {
      await closestWidget.accept();
      this.next(true);
    }
  }
  async toggleDiff(widget, show) {
    if (!this._editor.hasModel()) {
      return;
    }
    let selection = this._editor.getSelection();
    if (widget instanceof DiffHunkWidget) {
      const lineNumber = widget.getStartLineNumber();
      const position = lineNumber ? new Position(lineNumber, 1) : void 0;
      if (position && !selection.containsPosition(position)) {
        selection = Selection.fromPositions(position);
      }
    }
    const isDiffEditor = this._editor.getOption(EditorOption.inDiffEditor);
    if (show !== void 0 ? show : !isDiffEditor) {
      const diffEditor = await this._editorService.openEditor({
        original: { resource: this._entry.originalURI },
        modified: { resource: this._entry.modifiedURI },
        options: { selection },
        label: localize("diff.generic", "{0} (changes from chat)", basename(this._entry.modifiedURI))
      });
      if (diffEditor && diffEditor.input) {
        diffEditor.getControl()?.setSelection(selection);
        const d = autorun((r) => {
          const state = this._entry.state.read(r);
          if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
            d.dispose();
            const editorIdents = [];
            for (const candidate of this._editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
              if (isDiffEditorInput(candidate.editor) && isEqual(candidate.editor.original.resource, this._entry.originalURI) && isEqual(candidate.editor.modified.resource, this._entry.modifiedURI)) {
                editorIdents.push(candidate);
              }
            }
            this._editorService.closeEditors(editorIdents);
          }
        });
      }
    } else {
      await this._editorService.openEditor({
        resource: this._entry.modifiedURI,
        options: {
          selection,
          selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport
        }
      });
    }
  }
};
ChatEditingCodeEditorIntegration._diffLineDecorationData = ModelDecorationOptions.register({ description: "diff-line-decoration" });
ChatEditingCodeEditorIntegration = __decorateClass([
  __decorateParam(4, IEditorService),
  __decorateParam(5, IAccessibilitySignalService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IChatEditingService),
  __decorateParam(9, IChatEditingExplanationModelManager),
  __decorateParam(10, IChatWidgetService),
  __decorateParam(11, IViewsService)
], ChatEditingCodeEditorIntegration);
let DiffHunkWidget = class {
  constructor(_editor, _diffInfo, _change, _versionId, _lineDelta, instaService) {
    this._editor = _editor;
    this._diffInfo = _diffInfo;
    this._change = _change;
    this._versionId = _versionId;
    this._lineDelta = _lineDelta;
    this._id = `diff-change-widget-${DiffHunkWidget._idPool++}`;
    this._store = new DisposableStore();
    this._removed = false;
    this._domNode = document.createElement("div");
    this._domNode.className = "chat-diff-change-content-widget";
    const toolbar = instaService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.ChatEditingEditorHunk, {
      telemetrySource: "chatEditingEditorHunk",
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: { primaryGroup: () => true },
      menuOptions: {
        renderShortTitle: true,
        arg: this
      },
      actionViewItemProvider: (action, options) => {
        const isPrimary = action.id === "chatEditor.action.acceptHunk";
        if (!action.class) {
          return new class extends ActionViewItem {
            constructor() {
              super(void 0, action, { ...options, keybindingNotRenderedWithLabel: true, icon: false, label: true });
            }
            render(container) {
              super.render(container);
              if (isPrimary) {
                this.element?.classList.add("primary");
              }
            }
          }();
        }
        return void 0;
      }
    });
    this._store.add(toolbar);
    this._store.add(toolbar.actionRunner.onWillRun((_) => _editor.focus()));
    this._editor.addOverlayWidget(this);
  }
  update(diffInfo, change, versionId, lineDelta) {
    this._diffInfo = diffInfo;
    this._change = change;
    this._versionId = versionId;
    this._lineDelta = lineDelta;
  }
  dispose() {
    this._store.dispose();
    this._editor.removeOverlayWidget(this);
    this._removed = true;
  }
  getId() {
    return this._id;
  }
  layout(startLineNumber) {
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const scrollTop = this._editor.getScrollTop();
    this._position = {
      stackOrdinal: 1,
      preference: {
        top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - lineHeight * this._lineDelta,
        left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + getTotalWidth(this._domNode))
      }
    };
    if (this._removed) {
      this._removed = false;
      this._editor.addOverlayWidget(this);
    } else {
      this._editor.layoutOverlayWidget(this);
    }
    this._lastStartLineNumber = startLineNumber;
  }
  remove() {
    this._editor.removeOverlayWidget(this);
    this._removed = true;
  }
  toggle(show) {
    this._domNode.classList.toggle("hover", show);
    if (this._lastStartLineNumber) {
      this.layout(this._lastStartLineNumber);
    }
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return this._position ?? null;
  }
  getStartLineNumber() {
    return this._lastStartLineNumber;
  }
  // ---
  async reject() {
    if (this._versionId !== this._editor.getModel()?.getVersionId()) {
      return false;
    }
    return await this._diffInfo.undo(this._change);
  }
  async accept() {
    if (this._versionId !== this._editor.getModel()?.getVersionId()) {
      return false;
    }
    return this._diffInfo.keep(this._change);
  }
};
DiffHunkWidget._idPool = 0;
DiffHunkWidget = __decorateClass([
  __decorateParam(5, IInstantiationService)
], DiffHunkWidget);
class AccessibleDiffViewContainer {
  constructor() {
    this._domNode = document.createElement("div");
    this._domNode.className = "accessible-diff-view";
    this._domNode.style.width = "100%";
    this._domNode.style.position = "absolute";
  }
  getId() {
    return "chatEdits.accessibleDiffView";
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return {
      preference: { top: 0, left: 0 },
      stackOrdinal: 1
    };
  }
}
class AccessibleDiffViewerModel {
  constructor(_documentDiffInfo, _editor) {
    this._documentDiffInfo = _documentDiffInfo;
    this._editor = _editor;
  }
  getOriginalModel() {
    return this._documentDiffInfo.get().originalModel;
  }
  getOriginalOptions() {
    return this._editor.getOptions();
  }
  originalReveal(range) {
    const changes = this._documentDiffInfo.get().changes;
    const idx = changes.findIndex((value) => value.original.intersect(LineRange.fromRange(range)));
    if (idx >= 0) {
      range = changes[idx].modified.toInclusiveRange() ?? range;
    }
    this.modifiedReveal(range);
  }
  getModifiedModel() {
    return this._editor.getModel();
  }
  getModifiedOptions() {
    return this._editor.getOptions();
  }
  modifiedReveal(range) {
    if (range) {
      this._editor.revealRange(range);
      this._editor.setSelection(range);
    }
    this._editor.focus();
  }
  modifiedSetSelection(range) {
    this._editor.setSelection(range);
  }
  modifiedFocus() {
    this._editor.focus();
  }
  getModifiedPosition() {
    return this._editor.getPosition() ?? void 0;
  }
}
export {
  ChatEditingCodeEditorIntegration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0RWRpdG9yQ29udHJvbGxlci5jc3MnO1xuXG5pbXBvcnQgeyBnZXRUb3RhbFdpZHRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElPdmVybGF5V2lkZ2V0LCBJT3ZlcmxheVdpZGdldFBvc2l0aW9uLCBJT3ZlcmxheVdpZGdldFBvc2l0aW9uQ29vcmRpbmF0ZXMsIElWaWV3Wm9uZSwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVEaWZmVmlld2VyLCBJQWNjZXNzaWJsZURpZmZWaWV3ZXJNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvYWNjZXNzaWJsZURpZmZWaWV3ZXIuanMnO1xuaW1wb3J0IHsgTGluZVNvdXJjZSwgcmVuZGVyTGluZXMsIFJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9jb21wb25lbnRzL2RpZmZFZGl0b3JWaWV3Wm9uZXMvcmVuZGVyTGluZXMuanMnO1xuaW1wb3J0IHsgZGlmZkFkZERlY29yYXRpb24sIGRpZmZEZWxldGVEZWNvcmF0aW9uLCBkaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL3JlZ2lzdHJhdGlvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIE1pbmltYXBQb3NpdGlvbiwgT3ZlcnZpZXdSdWxlckxhbmUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uLCBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yc09yZGVyLCBJRWRpdG9ySWRlbnRpZmllciwgaXNEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1pbmltYXBHdXR0ZXJBZGRlZEJhY2tncm91bmQsIG1pbmltYXBHdXR0ZXJEZWxldGVkQmFja2dyb3VuZCwgbWluaW1hcEd1dHRlck1vZGlmaWVkQmFja2dyb3VuZCwgb3ZlcnZpZXdSdWxlckFkZGVkRm9yZWdyb3VuZCwgb3ZlcnZpZXdSdWxlckRlbGV0ZWRGb3JlZ3JvdW5kLCBvdmVydmlld1J1bGVyTW9kaWZpZWRGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2NvbW1vbi9xdWlja0RpZmYuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSwgSU1vZGlmaWVkRmlsZUVudHJ5LCBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rLCBJTW9kaWZpZWRGaWxlRW50cnlFZGl0b3JJbnRlZ3JhdGlvbiwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1RleHREaWZmRWRpdG9yRm9yRW50cnkgfSBmcm9tICcuL2NoYXRFZGl0aW5nLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBjdHhDdXJzb3JJbkNoYW5nZVJhbmdlIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXRNYW5hZ2VyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEb2N1bWVudERpZmYyIGV4dGVuZHMgSURvY3VtZW50RGlmZiB7XG5cblx0b3JpZ2luYWxNb2RlbDogSVRleHRNb2RlbDtcblx0bW9kaWZpZWRNb2RlbDogSVRleHRNb2RlbDtcblxuXHRrZWVwKGNoYW5nZXM6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdHVuZG8oY2hhbmdlczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxuY2xhc3MgT2JqZWN0UG9vbDxUIGV4dGVuZHMgSURpc3Bvc2FibGU+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mcmVlID0gbmV3IExpbmtlZExpc3Q8VD4oKTtcblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fZnJlZSk7XG5cdH1cblxuXHRnZXQoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZyZWUuc2hpZnQoKTtcblx0fVxuXG5cdHB1dEJhY2sob2JqOiBUKTogdm9pZCB7XG5cdFx0dGhpcy5fZnJlZS5wdXNoKG9iaik7XG5cdH1cblxuXHRnZXQgZnJlZSgpOiBJdGVyYWJsZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZyZWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nQ29kZUVkaXRvckludGVncmF0aW9uIGltcGxlbWVudHMgSU1vZGlmaWVkRmlsZUVudHJ5RWRpdG9ySW50ZWdyYXRpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9kaWZmTGluZURlY29yYXRpb25EYXRhID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnZGlmZi1saW5lLWRlY29yYXRpb24nIH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRJbmRleCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAtMSk7XG5cdHJlYWRvbmx5IGN1cnJlbnRJbmRleDogSU9ic2VydmFibGU8bnVtYmVyPiA9IHRoaXMuX2N1cnJlbnRJbmRleDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlmZkxpbmVEZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlmZlZpc3VhbERlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmSHVua3NSZW5kZXJTdG9yZSA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmSHVua1dpZGdldFBvb2wgPSB0aGlzLl9zdG9yZS5hZGQobmV3IE9iamVjdFBvb2w8RGlmZkh1bmtXaWRnZXQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmSHVua1dpZGdldHM6IERpZmZIdW5rV2lkZ2V0W10gPSBbXTtcblx0cHJpdmF0ZSBfdmlld1pvbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2libGVEaWZmVmlld1Zpc2libGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VudHJ5OiBJTW9kaWZpZWRGaWxlRW50cnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRkb2N1bWVudERpZmZJbmZvOiBJT2JzZXJ2YWJsZTxJRG9jdW1lbnREaWZmMj4sXG5cdFx0cmVuZGVyRGlmZkltbWVkaWF0ZWx5OiBib29sZWFuLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTaWduYWxzU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgX2NoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASUNoYXRFZGl0aW5nRXhwbGFuYXRpb25Nb2RlbE1hbmFnZXIgcHJpdmF0ZSByZWFkb25seSBfZXhwbGFuYXRpb25Nb2RlbE1hbmFnZXI6IElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2RpZmZMaW5lRGVjb3JhdGlvbnMgPSBfZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdGNvbnN0IGNvZGVFZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcihfZWRpdG9yKTtcblxuXHRcdHRoaXMuX2RpZmZMaW5lRGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7IC8vIHRyYWNrcyB0aGUgbGluZSByYW5nZSB3L28gdmlzdWFscyAodXNlZCBmb3IgbmF2aWdhdGUpXG5cdFx0dGhpcy5fZGlmZlZpc3VhbERlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpOyAvLyB0cmFja3MgdGhlIHJlYWwgZGlmZiB3aXRoIGNoYXJhY3RlciBsZXZlbCBpbnNlcnRzXG5cblx0XHQvLyBDcmVhdGUgZXhwbGFuYXRpb24gd2lkZ2V0IG1hbmFnZXIgYW5kIGNvbm5lY3QgaXQgdG8gdGhlIG1vZGVsIG1hbmFnZXJcblx0XHR0aGlzLl9zdG9yZS5hZGQobmV3IENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXRNYW5hZ2VyKFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dGhpcy5fY2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0XHR0aGlzLl92aWV3c1NlcnZpY2UsXG5cdFx0XHR0aGlzLl9leHBsYW5hdGlvbk1vZGVsTWFuYWdlcixcblx0XHRcdHRoaXMuX2VudHJ5Lm1vZGlmaWVkVVJJLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZE9icyA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRpZiAoIWlzRXF1YWwoY29kZUVkaXRvck9icy5tb2RlbC5yZWFkKHIpPy51cmksIGRvY3VtZW50RGlmZkluZm8ucmVhZChyKS5tb2RpZmllZE1vZGVsLnVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvcikgJiYgIWluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGlzVGV4dERpZmZFZGl0b3JGb3JFbnRyeSwgX2VudHJ5LCB0aGlzLl9lZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cblx0XHQvLyB1cGRhdGUgZGVjb3JhdGlvbnNcblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0aWYgKCFlbmFibGVkT2JzLnJlYWQocikpIHtcblx0XHRcdFx0dGhpcy5fZGlmZkxpbmVEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGE6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBkaWZmID0gZG9jdW1lbnREaWZmSW5mby5yZWFkKHIpO1xuXHRcdFx0Zm9yIChjb25zdCBkaWZmRW50cnkgb2YgZGlmZi5jaGFuZ2VzKSB7XG5cdFx0XHRcdGRhdGEucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2U6IGRpZmZFbnRyeS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkgPz8gbmV3IFJhbmdlKGRpZmZFbnRyeS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIDEsIGRpZmZFbnRyeS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSxcblx0XHRcdFx0XHRvcHRpb25zOiBDaGF0RWRpdGluZ0NvZGVFZGl0b3JJbnRlZ3JhdGlvbi5fZGlmZkxpbmVEZWNvcmF0aW9uRGF0YVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RpZmZMaW5lRGVjb3JhdGlvbnMuc2V0KGRhdGEpO1xuXHRcdH0pKTtcblxuXHRcdC8vIElOSVQgY3VycmVudCBpbmRleCB3aGVuOiBlbmFibGVkLCBub3Qgc3RyZWFtaW5nIGFueW1vcmUsIG9uY2UgcGVyIHJlcXVlc3QsIGFuZCB3aGVuIGhhdmluZyBjaGFuZ2VzXG5cdFx0bGV0IGxhc3RNb2RpZnlpbmdSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0aWYgKGVuYWJsZWRPYnMucmVhZChyKVxuXHRcdFx0XHQmJiAhX2VudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LnJlYWQocilcblx0XHRcdFx0JiYgbGFzdE1vZGlmeWluZ1JlcXVlc3RJZCAhPT0gX2VudHJ5Lmxhc3RNb2RpZnlpbmdSZXF1ZXN0SWRcblx0XHRcdFx0JiYgIWRvY3VtZW50RGlmZkluZm8ucmVhZChyKS5pZGVudGljYWxcblx0XHRcdCkge1xuXHRcdFx0XHRsYXN0TW9kaWZ5aW5nUmVxdWVzdElkID0gX2VudHJ5Lmxhc3RNb2RpZnlpbmdSZXF1ZXN0SWQ7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gX2VkaXRvci5nZXRQb3NpdGlvbigpID8/IG5ldyBQb3NpdGlvbigxLCAxKTtcblx0XHRcdFx0Y29uc3QgcmFuZ2VzID0gdGhpcy5fZGlmZkxpbmVEZWNvcmF0aW9ucy5nZXRSYW5nZXMoKTtcblx0XHRcdFx0bGV0IGluaXRpYWxJbmRleCA9IHJhbmdlcy5maW5kSW5kZXgociA9PiByLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKTtcblx0XHRcdFx0aWYgKGluaXRpYWxJbmRleCA8IDApIHtcblx0XHRcdFx0XHRpbml0aWFsSW5kZXggPSAwO1xuXHRcdFx0XHRcdGZvciAoOyBpbml0aWFsSW5kZXggPCByYW5nZXMubGVuZ3RoIC0gMTsgaW5pdGlhbEluZGV4KyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VzW2luaXRpYWxJbmRleF07XG5cdFx0XHRcdFx0XHRpZiAocmFuZ2UuZW5kTGluZU51bWJlciA+PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50SW5kZXguc2V0KGluaXRpYWxJbmRleCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0X2VkaXRvci5yZXZlYWxSYW5nZShyYW5nZXNbaW5pdGlhbEluZGV4XSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVuZGVyIGRpZmYgZGVjb3JhdGlvbnNcblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0aWYgKCFlbmFibGVkT2JzLnJlYWQocikpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJEaWZmUmVuZGVyaW5nKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZG9uZTogcmVuZGVyIGRpZmZcblx0XHRcdGlmICghX2VudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LnJlYWQocikgfHwgcmVuZGVyRGlmZkltbWVkaWF0ZWx5KSB7XG5cdFx0XHRcdGNvbnN0IGlzRGlmZkVkaXRvciA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvcik7XG5cblx0XHRcdFx0Y29kZUVkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS5yZWFkKHIpO1xuXHRcdFx0XHRjb2RlRWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkucmVhZChyKTtcblxuXHRcdFx0XHRjb25zdCByZXZpZXdNb2RlID0gX2VudHJ5LnJldmlld01vZGUucmVhZChyKTtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGRvY3VtZW50RGlmZkluZm8ucmVhZChyKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRGlmZlJlbmRlcmluZyhkaWZmLCByZXZpZXdNb2RlLCBpc0RpZmZFZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IF9jdHhDdXJzb3JJbkNoYW5nZVJhbmdlID0gY3R4Q3Vyc29ySW5DaGFuZ2VSYW5nZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gYWNjZXNzaWJpbGl0eTogc2lnbmFscyB3aGlsZSBjdXJzb3IgY2hhbmdlc1xuXHRcdC8vIGN0eDogY3Vyc29yIGluIGNoYW5nZSByYW5nZVxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBjb2RlRWRpdG9yT2JzLnBvc2l0aW9ucy5yZWFkKHIpPy5hdCgwKTtcblx0XHRcdGlmICghcG9zaXRpb24gfHwgIWVuYWJsZWRPYnMucmVhZChyKSkge1xuXHRcdFx0XHRfY3R4Q3Vyc29ySW5DaGFuZ2VSYW5nZS5yZXNldCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRpZmYgPSBkb2N1bWVudERpZmZJbmZvLnJlYWQocik7XG5cdFx0XHRjb25zdCBjaGFuZ2VBdEN1cnNvciA9IGRpZmYuY2hhbmdlcy5maW5kKG0gPT4gbS5tb2RpZmllZC5jb250YWlucyhwb3NpdGlvbi5saW5lTnVtYmVyKSB8fCBtLm1vZGlmaWVkLmlzRW1wdHkgJiYgbS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgPT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHRfY3R4Q3Vyc29ySW5DaGFuZ2VSYW5nZS5zZXQoISFjaGFuZ2VBdEN1cnNvcik7XG5cblx0XHRcdGlmIChjaGFuZ2VBdEN1cnNvcikge1xuXHRcdFx0XHRsZXQgc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsO1xuXHRcdFx0XHRpZiAoY2hhbmdlQXRDdXJzb3IubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdHNpZ25hbCA9IEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVEZWxldGVkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoYW5nZUF0Q3Vyc29yLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRzaWduYWwgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lSW5zZXJ0ZWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2lnbmFsID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZU1vZGlmaWVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxzU2VydmljZS5wbGF5U2lnbmFsKHNpZ25hbCwgeyBzb3VyY2U6ICdjaGF0RWRpdGluZ0VkaXRvci5jdXJzb3JQb3NpdGlvbkNoYW5nZWQnIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGFjY2Vzc2liaWxpdHk6IGRpZmYgdmlld1xuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXG5cdFx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3VmlzaWJsZS5yZWFkKHIpO1xuXG5cdFx0XHRpZiAoIXZpc2libGUgfHwgIWVuYWJsZWRPYnMucmVhZChyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjY2Vzc2libGVEaWZmV2lkZ2V0ID0gbmV3IEFjY2Vzc2libGVEaWZmVmlld0NvbnRhaW5lcigpO1xuXHRcdFx0X2VkaXRvci5hZGRPdmVybGF5V2lkZ2V0KGFjY2Vzc2libGVEaWZmV2lkZ2V0KTtcblx0XHRcdHIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBfZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQoYWNjZXNzaWJsZURpZmZXaWRnZXQpKSk7XG5cblx0XHRcdHIuc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBY2Nlc3NpYmxlRGlmZlZpZXdlcixcblx0XHRcdFx0YWNjZXNzaWJsZURpZmZXaWRnZXQuZ2V0RG9tTm9kZSgpLFxuXHRcdFx0XHRlbmFibGVkT2JzLFxuXHRcdFx0XHQodmlzaWJsZSwgdHgpID0+IHRoaXMuX2FjY2Vzc2libGVEaWZmVmlld1Zpc2libGUuc2V0KHZpc2libGUsIHR4KSxcblx0XHRcdFx0Y29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0XHRjb2RlRWRpdG9yT2JzLmxheW91dEluZm8ubWFwKCh2LCByKSA9PiB2LndpZHRoKSxcblx0XHRcdFx0Y29kZUVkaXRvck9icy5sYXlvdXRJbmZvLm1hcCgodiwgcikgPT4gdi5oZWlnaHQpLFxuXHRcdFx0XHRkb2N1bWVudERpZmZJbmZvLm1hcChkaWZmID0+IGRpZmYuY2hhbmdlcy5zbGljZSgpKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWNjZXNzaWJsZURpZmZWaWV3ZXJNb2RlbCwgZG9jdW1lbnREaWZmSW5mbywgX2VkaXRvciksXG5cdFx0XHQpKTtcblx0XHR9KSk7XG5cblxuXHRcdC8vIC0tLS0gcmVhZG9ubHkgd2hpbGUgc3RyZWFtaW5nXG5cblx0XHRsZXQgYWN0dWFsT3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCByZXN0b3JlQWN0dWFsT3B0aW9ucyA9ICgpID0+IHtcblx0XHRcdGlmIChhY3R1YWxPcHRpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnVwZGF0ZU9wdGlvbnMoYWN0dWFsT3B0aW9ucyk7XG5cdFx0XHRcdGFjdHVhbE9wdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUocmVzdG9yZUFjdHVhbE9wdGlvbnMpKTtcblxuXHRcdGNvbnN0IHJlbmRlckFzQmVpbmdNb2RpZmllZCA9IGRlcml2ZWQodGhpcywgciA9PiB7XG5cdFx0XHRyZXR1cm4gZW5hYmxlZE9icy5yZWFkKHIpICYmIEJvb2xlYW4oX2VudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LnJlYWQocikpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJlbmRlckFzQmVpbmdNb2RpZmllZC5yZWFkKHIpO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cblx0XHRcdFx0YWN0dWFsT3B0aW9ucyA/Pz0ge1xuXHRcdFx0XHRcdHJlYWRPbmx5OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSksXG5cdFx0XHRcdFx0c3RpY2t5U2Nyb2xsOiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpLFxuXHRcdFx0XHRcdGNvZGVMZW5zOiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5jb2RlTGVucyksXG5cdFx0XHRcdFx0Z3VpZGVzOiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5ndWlkZXMpXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dGhpcy5fZWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHRcdHN0aWNreVNjcm9sbDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdGNvZGVMZW5zOiBmYWxzZSxcblx0XHRcdFx0XHRndWlkZXM6IHsgaW5kZW50YXRpb246IGZhbHNlLCBicmFja2V0UGFpcnM6IGZhbHNlIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN0b3JlQWN0dWFsT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXIoKTtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhcigpIHtcblx0XHR0aGlzLl9kaWZmTGluZURlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2xlYXJEaWZmUmVuZGVyaW5nKCk7XG5cdFx0dGhpcy5fY3VycmVudEluZGV4LnNldCgtMSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLS0gZGlmZiByZW5kZXJpbmcgbG9naWNcblxuXHRwcml2YXRlIF9jbGVhckRpZmZSZW5kZXJpbmcoKSB7XG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZVZpZXdab25lcygodmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLl92aWV3Wm9uZXMpIHtcblx0XHRcdFx0dmlld1pvbmVDaGFuZ2VBY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl92aWV3Wm9uZXMgPSBbXTtcblx0XHR0aGlzLl9kaWZmSHVua3NSZW5kZXJTdG9yZS5jbGVhcigpO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2RpZmZIdW5rV2lkZ2V0UG9vbC5mcmVlKSB7XG5cdFx0XHR3aWRnZXQucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RpZmZWaXN1YWxEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGlmZlJlbmRlcmluZyhkaWZmOiBJRG9jdW1lbnREaWZmMiwgcmV2aWV3TW9kZTogYm9vbGVhbiwgZGlmZk1vZGU6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNoYXREaWZmQWRkRGVjb3JhdGlvbiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyh7XG5cdFx0XHQuLi5kaWZmQWRkRGVjb3JhdGlvbixcblx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhdERpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5jcmVhdGVEeW5hbWljKHtcblx0XHRcdC4uLmRpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uLFxuXHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY3JlYXRlT3ZlcnZpZXdEZWNvcmF0aW9uID0gKG92ZXJ2aWV3UnVsZXJDb2xvcjogc3RyaW5nLCBtaW5pbWFwQ29sb3I6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuIE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyh7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhdC1lZGl0aW5nLWRlY29yYXRpb24nLFxuXHRcdFx0XHRvdmVydmlld1J1bGVyOiB7IGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKG92ZXJ2aWV3UnVsZXJDb2xvciksIHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5MZWZ0IH0sXG5cdFx0XHRcdG1pbmltYXA6IHsgY29sb3I6IHRoZW1lQ29sb3JGcm9tSWQobWluaW1hcENvbG9yKSwgcG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5HdXR0ZXIgfSxcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgbW9kaWZpZWREZWNvcmF0aW9uID0gY3JlYXRlT3ZlcnZpZXdEZWNvcmF0aW9uKG92ZXJ2aWV3UnVsZXJNb2RpZmllZEZvcmVncm91bmQsIG1pbmltYXBHdXR0ZXJNb2RpZmllZEJhY2tncm91bmQpO1xuXHRcdGNvbnN0IGFkZGVkRGVjb3JhdGlvbiA9IGNyZWF0ZU92ZXJ2aWV3RGVjb3JhdGlvbihvdmVydmlld1J1bGVyQWRkZWRGb3JlZ3JvdW5kLCBtaW5pbWFwR3V0dGVyQWRkZWRCYWNrZ3JvdW5kKTtcblx0XHRjb25zdCBkZWxldGVkRGVjb3JhdGlvbiA9IGNyZWF0ZU92ZXJ2aWV3RGVjb3JhdGlvbihvdmVydmlld1J1bGVyRGVsZXRlZEZvcmVncm91bmQsIG1pbmltYXBHdXR0ZXJEZWxldGVkQmFja2dyb3VuZCk7XG5cblx0XHR0aGlzLl9kaWZmSHVua3NSZW5kZXJTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX2RpZmZIdW5rV2lkZ2V0cy5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IGRpZmZIdW5rRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cblx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlVmlld1pvbmVzKCh2aWV3Wm9uZUNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX3ZpZXdab25lcykge1xuXHRcdFx0XHR2aWV3Wm9uZUNoYW5nZUFjY2Vzc29yLnJlbW92ZVpvbmUoaWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdmlld1pvbmVzID0gW107XG5cdFx0XHRjb25zdCBtb2RpZmllZFZpc3VhbERlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSA9IGRpZmYub3JpZ2luYWxNb2RlbC5taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJKCk7XG5cdFx0XHRjb25zdCBtaWdodENvbnRhaW5SVEwgPSBkaWZmLm9yaWdpbmFsTW9kZWwubWlnaHRDb250YWluUlRMKCk7XG5cdFx0XHRjb25zdCByZW5kZXJPcHRpb25zID0gUmVuZGVyT3B0aW9ucy5mcm9tRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cdFx0XHRjb25zdCBlZGl0b3JMaW5lQ291bnQgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCk7XG5cblx0XHRcdGZvciAoY29uc3QgZGlmZkVudHJ5IG9mIGRpZmYuY2hhbmdlcykge1xuXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsUmFuZ2UgPSBkaWZmRW50cnkub3JpZ2luYWw7XG5cdFx0XHRcdGRpZmYub3JpZ2luYWxNb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oTWF0aC5tYXgoMSwgb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSkpO1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBuZXcgTGluZVNvdXJjZShcblx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlLm1hcFRvTGluZUFycmF5KGwgPT4gZGlmZi5vcmlnaW5hbE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGwpKSxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHRtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJLFxuXHRcdFx0XHRcdG1pZ2h0Q29udGFpblJUTCxcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElubGluZURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0XHRcdGlmIChyZXZpZXdNb2RlKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpIG9mIGRpZmZFbnRyeS5pbm5lckNoYW5nZXMgfHwgW10pIHtcblx0XHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2gobmV3IElubGluZURlY29yYXRpb24oXG5cdFx0XHRcdFx0XHRcdGkub3JpZ2luYWxSYW5nZS5kZWx0YSgtKGRpZmZFbnRyeS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgLSAxKSksXG5cdFx0XHRcdFx0XHRcdGRpZmZEZWxldGVEZWNvcmF0aW9uLmNsYXNzTmFtZSEsXG5cdFx0XHRcdFx0XHRcdElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJcblx0XHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0XHQvLyBJZiB0aGUgb3JpZ2luYWwgcmFuZ2UgaXMgZW1wdHksIHRoZSBzdGFydCBsaW5lIG51bWJlciBpcyAxIGFuZCB0aGUgbmV3IHJhbmdlIHNwYW5zIHRoZSBlbnRpcmUgZmlsZSwgZG9uJ3QgZHJhdyBhbiBBZGRlZCBkZWNvcmF0aW9uXG5cdFx0XHRcdFx0XHRpZiAoIShpLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eSgpICYmIGkub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IDEgJiYgaS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIgPT09IGVkaXRvckxpbmVDb3VudCkgJiYgIWkubW9kaWZpZWRSYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZTogaS5tb2RpZmllZFJhbmdlLCBvcHRpb25zOiBjaGF0RGlmZkFkZERlY29yYXRpb25cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVuZGVyIGFuIGFkZGVkIGRlY29yYXRpb24gYnV0IGRvbid0IGFsc28gcmVuZGVyIGEgZGVsZXRlZCBkZWNvcmF0aW9uIGZvciBuZXdseSBpbnNlcnRlZCBjb250ZW50IGF0IHRoZSBzdGFydCBvZiB0aGUgZmlsZVxuXHRcdFx0XHQvLyBOb3RlLCB0aGlzIGlzIGEgd29ya2Fyb3VuZCBmb3IgdGhlIGBMaW5lUmFuZ2UuaXNFbXB0eSgpYCBpbiBkaWZmRW50cnkub3JpZ2luYWwgYmVpbmcgYGZhbHNlYCBmb3IgbmV3bHkgaW5zZXJ0ZWQgY29udGVudFxuXHRcdFx0XHRjb25zdCBpc0NyZWF0ZWRDb250ZW50ID0gZGVjb3JhdGlvbnMubGVuZ3RoID09PSAxICYmIGRlY29yYXRpb25zWzBdLnJhbmdlLmlzRW1wdHkoKSAmJiBkaWZmRW50cnkub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyID09PSAxO1xuXG5cdFx0XHRcdGlmICghZGlmZkVudHJ5Lm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRtb2RpZmllZFZpc3VhbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGRpZmZFbnRyeS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogY2hhdERpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZGlmZkVudHJ5Lm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHQvLyBpbnNlcnRpb25cblx0XHRcdFx0XHRtb2RpZmllZFZpc3VhbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGRpZmZFbnRyeS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogYWRkZWREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGlmZkVudHJ5Lm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHQvLyBkZWxldGlvblxuXHRcdFx0XHRcdG1vZGlmaWVkVmlzdWFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKGRpZmZFbnRyeS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSAxLCAxLCBkaWZmRW50cnkubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLCAxKSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IGRlbGV0ZWREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbW9kaWZpY2F0aW9uXG5cdFx0XHRcdFx0bW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBkaWZmRW50cnkubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpISxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IG1vZGlmaWVkRGVjb3JhdGlvblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGV4dHJhTGluZXMgPSAwO1xuXHRcdFx0XHRpZiAocmV2aWV3TW9kZSAmJiAhZGlmZk1vZGUpIHtcblx0XHRcdFx0XHRjb25zdCBkb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0ZG9tTm9kZS5jbGFzc05hbWUgPSAnY2hhdC1lZGl0aW5nLW9yaWdpbmFsLXpvbmUgdmlldy1saW5lcyBsaW5lLWRlbGV0ZSBtb25hY28tbW91c2UtY3Vyc29yLXRleHQnO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlbmRlckxpbmVzKHNvdXJjZSwgcmVuZGVyT3B0aW9ucywgZGVjb3JhdGlvbnMsIGRvbU5vZGUpO1xuXHRcdFx0XHRcdGV4dHJhTGluZXMgPSByZXN1bHQuaGVpZ2h0SW5MaW5lcztcblx0XHRcdFx0XHRpZiAoIWlzQ3JlYXRlZENvbnRlbnQpIHtcblxuXHRcdFx0XHRcdFx0Y29uc3Qgdmlld1pvbmVEYXRhOiBJVmlld1pvbmUgPSB7XG5cdFx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogZGlmZkVudHJ5Lm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciAtIDEsXG5cdFx0XHRcdFx0XHRcdGhlaWdodEluTGluZXM6IHJlc3VsdC5oZWlnaHRJbkxpbmVzLFxuXHRcdFx0XHRcdFx0XHRkb21Ob2RlLFxuXHRcdFx0XHRcdFx0XHRvcmRpbmFsOiA1MDAwMCArIDIgLy8gbW9yZSB0aGFuIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvYmY1MmE1Y2ZiMmM3NWE3MzI3YzlhZGVhZWZiZGRjMDZkNTI5ZGNhZC9zcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRab25lV2lkZ2V0LnRzI0w0MlxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0dGhpcy5fdmlld1pvbmVzLnB1c2godmlld1pvbmVDaGFuZ2VBY2Nlc3Nvci5hZGRab25lKHZpZXdab25lRGF0YSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXZpZXdNb2RlIHx8IGRpZmZNb2RlKSB7XG5cblx0XHRcdFx0XHQvLyBBZGQgY29udGVudCB3aWRnZXQgZm9yIGVhY2ggZGlmZiBjaGFuZ2Vcblx0XHRcdFx0XHRsZXQgd2lkZ2V0ID0gdGhpcy5fZGlmZkh1bmtXaWRnZXRQb29sLmdldCgpO1xuXHRcdFx0XHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHQvLyBtYWtlIGEgbmV3IG9uZVxuXHRcdFx0XHRcdFx0d2lkZ2V0ID0gdGhpcy5fZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmSHVua1dpZGdldCwgdGhpcy5fZWRpdG9yLCBkaWZmLCBkaWZmRW50cnksIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpIS5nZXRWZXJzaW9uSWQoKSwgaXNDcmVhdGVkQ29udGVudCA/IDAgOiBleHRyYUxpbmVzKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR3aWRnZXQudXBkYXRlKGRpZmYsIGRpZmZFbnRyeSwgdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhLmdldFZlcnNpb25JZCgpLCBpc0NyZWF0ZWRDb250ZW50ID8gMCA6IGV4dHJhTGluZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9kaWZmSHVua3NSZW5kZXJTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2RpZmZIdW5rV2lkZ2V0UG9vbC5wdXRCYWNrKHdpZGdldCk7XG5cdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0d2lkZ2V0LmxheW91dChkaWZmRW50cnkubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdFx0XHRcdHRoaXMuX2RpZmZIdW5rV2lkZ2V0cy5wdXNoKHdpZGdldCk7XG5cdFx0XHRcdFx0ZGlmZkh1bmtEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBkaWZmRW50cnkubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpID8/IG5ldyBSYW5nZShkaWZmRW50cnkubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLCAxLCBkaWZmRW50cnkubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnZGlmZi1odW5rLXdpZGdldCcsXG5cdFx0XHRcdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2RpZmZWaXN1YWxEZWNvcmF0aW9ucy5zZXQoIWRpZmZNb2RlID8gbW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9ucyA6IFtdKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZmZIdW5rRGVjb0NvbGxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKGRpZmZIdW5rRGVjb3JhdGlvbnMpO1xuXG5cdFx0dGhpcy5fZGlmZkh1bmtzUmVuZGVyU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkaWZmSHVua0RlY29Db2xsZWN0aW9uLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSElERSBwb29sZWQgd2lkZ2V0cyB0aGF0IGFyZSBub3QgdXNlZFxuXHRcdGZvciAoY29uc3QgZXh0cmFXaWRnZXQgb2YgdGhpcy5fZGlmZkh1bmtXaWRnZXRQb29sLmZyZWUpIHtcblx0XHRcdGV4dHJhV2lkZ2V0LnJlbW92ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbiwgXyA9PiB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cblx0XHRjb25zdCBhY3RpdmVXaWRnZXRJZHggPSBkZXJpdmVkKHIgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBwb3NpdGlvbk9icy5yZWFkKHIpO1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZHggPSBkaWZmSHVua0RlY29Db2xsZWN0aW9uLmdldFJhbmdlcygpLmZpbmRJbmRleChyID0+IHIuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpO1xuXHRcdFx0cmV0dXJuIGlkeDtcblx0XHR9KTtcblx0XHRjb25zdCB0b2dnbGVXaWRnZXQgPSAoYWN0aXZlV2lkZ2V0OiBEaWZmSHVua1dpZGdldCB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb25JZHggPSBhY3RpdmVXaWRnZXRJZHguZ2V0KCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2RpZmZIdW5rV2lkZ2V0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9kaWZmSHVua1dpZGdldHNbaV07XG5cdFx0XHRcdHdpZGdldC50b2dnbGUod2lkZ2V0ID09PSBhY3RpdmVXaWRnZXQgfHwgaSA9PT0gcG9zaXRpb25JZHgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9kaWZmSHVua3NSZW5kZXJTdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdC8vIHJldmVhbCB3aGVuIGN1cnNvciBpbnNpZGVcblx0XHRcdGNvbnN0IGlkeCA9IGFjdGl2ZVdpZGdldElkeC5yZWFkKHIpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fZGlmZkh1bmtXaWRnZXRzW2lkeF07XG5cdFx0XHR0b2dnbGVXaWRnZXQod2lkZ2V0KTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX2RpZmZIdW5rc1JlbmRlclN0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZVVwKGUgPT4ge1xuXHRcdFx0Ly8gc2V0IGFwcHJveGltYXRlIHBvc2l0aW9uIHdoZW4gY2xpY2tpbmcgb24gdmlldyB6b25lXG5cdFx0XHRpZiAoZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FKSB7XG5cdFx0XHRcdGNvbnN0IHpvbmUgPSBlLnRhcmdldC5kZXRhaWw7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuX3ZpZXdab25lcy5maW5kSW5kZXgoaWQgPT4gaWQgPT09IHpvbmUudmlld1pvbmVJZCk7XG5cdFx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbihlLnRhcmdldC5wb3NpdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaWZmSHVua3NSZW5kZXJTdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VNb3ZlKGUgPT4ge1xuXG5cdFx0XHQvLyByZXZlYWwgd2hlbiBob3ZlcmluZyBvdmVyXG5cdFx0XHRpZiAoZS50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLk9WRVJMQVlfV0lER0VUKSB7XG5cdFx0XHRcdGNvbnN0IGlkID0gZS50YXJnZXQuZGV0YWlsO1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9kaWZmSHVua1dpZGdldHMuZmluZCh3ID0+IHcuZ2V0SWQoKSA9PT0gaWQpO1xuXHRcdFx0XHR0b2dnbGVXaWRnZXQod2lkZ2V0KTtcblxuXHRcdFx0fSBlbHNlIGlmIChlLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9WSUVXX1pPTkUpIHtcblx0XHRcdFx0Y29uc3Qgem9uZSA9IGUudGFyZ2V0LmRldGFpbDtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fdmlld1pvbmVzLmZpbmRJbmRleChpZCA9PiBpZCA9PT0gem9uZS52aWV3Wm9uZUlkKTtcblx0XHRcdFx0dG9nZ2xlV2lkZ2V0KHRoaXMuX2RpZmZIdW5rV2lkZ2V0c1tpZHhdKTtcblxuXHRcdFx0fSBlbHNlIGlmIChlLnRhcmdldC5wb3NpdGlvbikge1xuXHRcdFx0XHRjb25zdCB7IHBvc2l0aW9uIH0gPSBlLnRhcmdldDtcblx0XHRcdFx0Y29uc3QgaWR4ID0gZGlmZkh1bmtEZWNvQ29sbGVjdGlvbi5nZXRSYW5nZXMoKS5maW5kSW5kZXgociA9PiByLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKTtcblx0XHRcdFx0dG9nZ2xlV2lkZ2V0KHRoaXMuX2RpZmZIdW5rV2lkZ2V0c1tpZHhdKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9nZ2xlV2lkZ2V0KHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlmZkh1bmtzUmVuZGVyU3RvcmUuYWRkKEV2ZW50LmFueSh0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UsIHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSkoKCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9kaWZmSHVua1dpZGdldHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fZGlmZkh1bmtXaWRnZXRzW2ldO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGRpZmZIdW5rRGVjb0NvbGxlY3Rpb24uZ2V0UmFuZ2UoaSk7XG5cdFx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHRcdHdpZGdldC5sYXlvdXQocmFuZ2U/LnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0d2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGVuYWJsZUFjY2Vzc2libGVEaWZmVmlldygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdWaXNpYmxlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tLSBuYXZpZ2F0aW9uIGxvZ2ljXG5cblx0cmV2ZWFsKGZpcnN0T3JMYXN0OiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9kaWZmTGluZURlY29yYXRpb25zXG5cdFx0XHQuZ2V0UmFuZ2VzKClcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYSwgYikpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSBmaXJzdE9yTGFzdCA/IDAgOiBkZWNvcmF0aW9ucy5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IHJhbmdlID0gZGVjb3JhdGlvbnMuYXQoaW5kZXgpO1xuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUmFuZ2UocmFuZ2UpO1xuXHRcdFx0aWYgKCFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4LnNldChpbmRleCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRuZXh0KHdyYXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsKHRydWUsICF3cmFwKTtcblx0fVxuXG5cdHByZXZpb3VzKHdyYXA6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmV2ZWFsKGZhbHNlLCAhd3JhcCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWwobmV4dDogYm9vbGVhbiwgc3RyaWN0OiBib29sZWFuKSB7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleC5zZXQoLTEsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9kaWZmTGluZURlY29yYXRpb25zXG5cdFx0XHQuZ2V0UmFuZ2VzKClcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYSwgYikpO1xuXG5cdFx0aWYgKGRlY29yYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4LnNldCgtMSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgbmV3SW5kZXg6IG51bWJlciA9IC0xO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGVjb3JhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZGVjb3JhdGlvbnNbaV07XG5cdFx0XHRpZiAocmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0bmV3SW5kZXggPSBpICsgKG5leHQgPyAxIDogLTEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSBpZiAoUG9zaXRpb24uaXNCZWZvcmUocG9zaXRpb24sIHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkpIHtcblx0XHRcdFx0bmV3SW5kZXggPSBuZXh0ID8gaSA6IGkgLSAxO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc3RyaWN0ICYmIChuZXdJbmRleCA8IDAgfHwgbmV3SW5kZXggPj0gZGVjb3JhdGlvbnMubGVuZ3RoKSkge1xuXHRcdFx0Ly8gTk8gY2hhbmdlXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bmV3SW5kZXggPSAobmV3SW5kZXggKyBkZWNvcmF0aW9ucy5sZW5ndGgpICUgZGVjb3JhdGlvbnMubGVuZ3RoO1xuXG5cdFx0dGhpcy5fY3VycmVudEluZGV4LnNldChuZXdJbmRleCwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHRhcmdldFJhbmdlID0gZGVjb3JhdGlvbnNbbmV3SW5kZXhdO1xuXHRcdGNvbnN0IHRhcmdldFBvc2l0aW9uID0gbmV4dCA/IHRhcmdldFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSA6IHRhcmdldFJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHRhcmdldFBvc2l0aW9uKTtcblx0XHR0aGlzLl9lZGl0b3IucmV2ZWFsUG9zaXRpb25JbkNlbnRlcih0YXJnZXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuZGVsdGEoLTEpKTtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tIGh1bmtzXG5cblx0cHJpdmF0ZSBfZmluZENsb3Nlc3RXaWRnZXQoKTogRGlmZkh1bmtXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVSZWxhdGl2ZVRvcCA9IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIpIC0gdGhpcy5fZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXHRcdGxldCBjbG9zZXN0V2lkZ2V0OiBEaWZmSHVua1dpZGdldCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2xvc2VzdERpc3RhbmNlID0gTnVtYmVyLk1BWF9WQUxVRTtcblxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2RpZmZIdW5rV2lkZ2V0cykge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0VG9wID0gKDxJT3ZlcmxheVdpZGdldFBvc2l0aW9uQ29vcmRpbmF0ZXMgfCB1bmRlZmluZWQ+d2lkZ2V0LmdldFBvc2l0aW9uKCk/LnByZWZlcmVuY2UpPy50b3A7XG5cdFx0XHRpZiAod2lkZ2V0VG9wICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBNYXRoLmFicyh3aWRnZXRUb3AgLSBsaW5lUmVsYXRpdmVUb3ApO1xuXHRcdFx0XHRpZiAoZGlzdGFuY2UgPCBjbG9zZXN0RGlzdGFuY2UpIHtcblx0XHRcdFx0XHRjbG9zZXN0RGlzdGFuY2UgPSBkaXN0YW5jZTtcblx0XHRcdFx0XHRjbG9zZXN0V2lkZ2V0ID0gd2lkZ2V0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNsb3Nlc3RXaWRnZXQ7XG5cdH1cblxuXHRhc3luYyByZWplY3ROZWFyZXN0Q2hhbmdlKGNsb3Nlc3RXaWRnZXQ/OiBJTW9kaWZpZWRGaWxlRW50cnlDaGFuZ2VIdW5rKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y2xvc2VzdFdpZGdldCA9IGNsb3Nlc3RXaWRnZXQgPz8gdGhpcy5fZmluZENsb3Nlc3RXaWRnZXQoKTtcblx0XHRpZiAoY2xvc2VzdFdpZGdldCBpbnN0YW5jZW9mIERpZmZIdW5rV2lkZ2V0KSB7XG5cdFx0XHRhd2FpdCBjbG9zZXN0V2lkZ2V0LnJlamVjdCgpO1xuXHRcdFx0dGhpcy5uZXh0KHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFjY2VwdE5lYXJlc3RDaGFuZ2UoY2xvc2VzdFdpZGdldD86IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmspOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjbG9zZXN0V2lkZ2V0ID0gY2xvc2VzdFdpZGdldCA/PyB0aGlzLl9maW5kQ2xvc2VzdFdpZGdldCgpO1xuXHRcdGlmIChjbG9zZXN0V2lkZ2V0IGluc3RhbmNlb2YgRGlmZkh1bmtXaWRnZXQpIHtcblx0XHRcdGF3YWl0IGNsb3Nlc3RXaWRnZXQuYWNjZXB0KCk7XG5cdFx0XHR0aGlzLm5leHQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdG9nZ2xlRGlmZih3aWRnZXQ6IElNb2RpZmllZEZpbGVFbnRyeUNoYW5nZUh1bmsgfCB1bmRlZmluZWQsIHNob3c/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHdpZGdldCBpbnN0YW5jZW9mIERpZmZIdW5rV2lkZ2V0KSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gd2lkZ2V0LmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBsaW5lTnVtYmVyID8gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHBvc2l0aW9uICYmICFzZWxlY3Rpb24uY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0c2VsZWN0aW9uID0gU2VsZWN0aW9uLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlzRGlmZkVkaXRvciA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmluRGlmZkVkaXRvcik7XG5cblx0XHQvLyBVc2UgdGhlICdzaG93JyBhcmd1bWVudCB0byBjb250cm9sIHRoZSBkaWZmIHN0YXRlIGlmIHByb3ZpZGVkXG5cdFx0aWYgKHNob3cgIT09IHVuZGVmaW5lZCA/IHNob3cgOiAhaXNEaWZmRWRpdG9yKSB7XG5cdFx0XHQvLyBPcGVuIERJRkYgZWRpdG9yXG5cdFx0XHRjb25zdCBkaWZmRWRpdG9yID0gYXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHRoaXMuX2VudHJ5Lm9yaWdpbmFsVVJJIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiB0aGlzLl9lbnRyeS5tb2RpZmllZFVSSSB9LFxuXHRcdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbiB9LFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RpZmYuZ2VuZXJpYycsICd7MH0gKGNoYW5nZXMgZnJvbSBjaGF0KScsIGJhc2VuYW1lKHRoaXMuX2VudHJ5Lm1vZGlmaWVkVVJJKSlcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZGlmZkVkaXRvciAmJiBkaWZmRWRpdG9yLmlucHV0KSB7XG5cdFx0XHRcdGRpZmZFZGl0b3IuZ2V0Q29udHJvbCgpPy5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgZCA9IGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9lbnRyeS5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCB8fCBzdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5SZWplY3RlZCkge1xuXHRcdFx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JJZGVudHM6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX2VkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpc0RpZmZFZGl0b3JJbnB1dChjYW5kaWRhdGUuZWRpdG9yKVxuXHRcdFx0XHRcdFx0XHRcdCYmIGlzRXF1YWwoY2FuZGlkYXRlLmVkaXRvci5vcmlnaW5hbC5yZXNvdXJjZSwgdGhpcy5fZW50cnkub3JpZ2luYWxVUkkpXG5cdFx0XHRcdFx0XHRcdFx0JiYgaXNFcXVhbChjYW5kaWRhdGUuZWRpdG9yLm1vZGlmaWVkLnJlc291cmNlLCB0aGlzLl9lbnRyeS5tb2RpZmllZFVSSSlcblx0XHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdFx0ZWRpdG9ySWRlbnRzLnB1c2goY2FuZGlkYXRlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLmNsb3NlRWRpdG9ycyhlZGl0b3JJZGVudHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE9wZW4gbm9ybWFsIGVkaXRvclxuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuX2VudHJ5Lm1vZGlmaWVkVVJJLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLk5lYXJUb3BJZk91dHNpZGVWaWV3cG9ydFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRGlmZkh1bmtXaWRnZXQgaW1wbGVtZW50cyBJT3ZlcmxheVdpZGdldCwgSU1vZGlmaWVkRmlsZUVudHJ5Q2hhbmdlSHVuayB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmcgPSBgZGlmZi1jaGFuZ2Utd2lkZ2V0LSR7RGlmZkh1bmtXaWRnZXQuX2lkUG9vbCsrfWA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9wb3NpdGlvbjogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFN0YXJ0TGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZW1vdmVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIF9kaWZmSW5mbzogSURvY3VtZW50RGlmZjIsXG5cdFx0cHJpdmF0ZSBfY2hhbmdlOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsXG5cdFx0cHJpdmF0ZSBfdmVyc2lvbklkOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfbGluZURlbHRhOiBudW1iZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ2NoYXQtZGlmZi1jaGFuZ2UtY29udGVudC13aWRnZXQnO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5fZG9tTm9kZSwgTWVudUlkLkNoYXRFZGl0aW5nRWRpdG9ySHVuaywge1xuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnY2hhdEVkaXRpbmdFZGl0b3JIdW5rJyxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSwgfSxcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHJlbmRlclNob3J0VGl0bGU6IHRydWUsXG5cdFx0XHRcdGFyZzogdGhpcyxcblx0XHRcdH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzUHJpbWFyeSA9IGFjdGlvbi5pZCA9PT0gJ2NoYXRFZGl0b3IuYWN0aW9uLmFjY2VwdEh1bmsnO1xuXHRcdFx0XHRpZiAoIWFjdGlvbi5jbGFzcykge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywga2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsOiB0cnVlIC8qIGhpZGUga2V5YmluZGluZyBmb3IgYWN0aW9ucyB3aXRob3V0IGljb24gKi8sIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNQcmltYXJ5KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdwcmltYXJ5Jyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodG9vbGJhcik7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRvb2xiYXIuYWN0aW9uUnVubmVyLm9uV2lsbFJ1bihfID0+IF9lZGl0b3IuZm9jdXMoKSkpO1xuXHRcdHRoaXMuX2VkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0dXBkYXRlKGRpZmZJbmZvOiBJRG9jdW1lbnREaWZmMiwgY2hhbmdlOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIHZlcnNpb25JZDogbnVtYmVyLCBsaW5lRGVsdGE6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2RpZmZJbmZvID0gZGlmZkluZm87XG5cdFx0dGhpcy5fY2hhbmdlID0gY2hhbmdlO1xuXHRcdHRoaXMuX3ZlcnNpb25JZCA9IHZlcnNpb25JZDtcblx0XHR0aGlzLl9saW5lRGVsdGEgPSBsaW5lRGVsdGE7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHR0aGlzLl9yZW1vdmVkID0gdHJ1ZTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0bGF5b3V0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgeyBjb250ZW50TGVmdCwgY29udGVudFdpZHRoLCB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIH0gPSB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX2VkaXRvci5nZXRTY3JvbGxUb3AoKTtcblxuXHRcdHRoaXMuX3Bvc2l0aW9uID0ge1xuXHRcdFx0c3RhY2tPcmRpbmFsOiAxLFxuXHRcdFx0cHJlZmVyZW5jZToge1xuXHRcdFx0XHR0b3A6IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcikgLSBzY3JvbGxUb3AgLSAobGluZUhlaWdodCAqIHRoaXMuX2xpbmVEZWx0YSksXG5cdFx0XHRcdGxlZnQ6IGNvbnRlbnRMZWZ0ICsgY29udGVudFdpZHRoIC0gKDIgKiB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoICsgZ2V0VG90YWxXaWR0aCh0aGlzLl9kb21Ob2RlKSlcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuX3JlbW92ZWQpIHtcblx0XHRcdHRoaXMuX3JlbW92ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2VkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFN0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblx0fVxuXG5cdHJlbW92ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHR0aGlzLl9yZW1vdmVkID0gdHJ1ZTtcblx0fVxuXG5cdHRvZ2dsZShzaG93OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdob3ZlcicsIHNob3cpO1xuXHRcdGlmICh0aGlzLl9sYXN0U3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0U3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fcG9zaXRpb24gPz8gbnVsbDtcblx0fVxuXG5cdGdldFN0YXJ0TGluZU51bWJlcigpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0U3RhcnRMaW5lTnVtYmVyO1xuXHR9XG5cblx0Ly8gLS0tXG5cblx0YXN5bmMgcmVqZWN0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl92ZXJzaW9uSWQgIT09IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRWZXJzaW9uSWQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZGlmZkluZm8udW5kbyh0aGlzLl9jaGFuZ2UpO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl92ZXJzaW9uSWQgIT09IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRWZXJzaW9uSWQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGlmZkluZm8ua2VlcCh0aGlzLl9jaGFuZ2UpO1xuXHR9XG59XG5cblxuY2xhc3MgQWNjZXNzaWJsZURpZmZWaWV3Q29udGFpbmVyIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9ICdhY2Nlc3NpYmxlLWRpZmYtdmlldyc7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdjaGF0RWRpdHMuYWNjZXNzaWJsZURpZmZWaWV3Jztcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVmZXJlbmNlOiB7IHRvcDogMCwgbGVmdDogMCB9LFxuXHRcdFx0c3RhY2tPcmRpbmFsOiAxXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBBY2Nlc3NpYmxlRGlmZlZpZXdlck1vZGVsIGltcGxlbWVudHMgSUFjY2Vzc2libGVEaWZmVmlld2VyTW9kZWwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudERpZmZJbmZvOiBJT2JzZXJ2YWJsZTxJRG9jdW1lbnREaWZmMj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0KSB7IH1cblxuXHRnZXRPcmlnaW5hbE1vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9kb2N1bWVudERpZmZJbmZvLmdldCgpLm9yaWdpbmFsTW9kZWw7XG5cdH1cblxuXHRnZXRPcmlnaW5hbE9wdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvci5nZXRPcHRpb25zKCk7XG5cdH1cblxuXHRvcmlnaW5hbFJldmVhbChyYW5nZTogUmFuZ2UpIHtcblx0XHRjb25zdCBjaGFuZ2VzID0gdGhpcy5fZG9jdW1lbnREaWZmSW5mby5nZXQoKS5jaGFuZ2VzO1xuXHRcdGNvbnN0IGlkeCA9IGNoYW5nZXMuZmluZEluZGV4KHZhbHVlID0+IHZhbHVlLm9yaWdpbmFsLmludGVyc2VjdChMaW5lUmFuZ2UuZnJvbVJhbmdlKHJhbmdlKSkpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0cmFuZ2UgPSBjaGFuZ2VzW2lkeF0ubW9kaWZpZWQudG9JbmNsdXNpdmVSYW5nZSgpID8/IHJhbmdlO1xuXHRcdH1cblx0XHR0aGlzLm1vZGlmaWVkUmV2ZWFsKHJhbmdlKTtcblx0fVxuXG5cdGdldE1vZGlmaWVkTW9kZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0fVxuXG5cdGdldE1vZGlmaWVkT3B0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yLmdldE9wdGlvbnMoKTtcblx0fVxuXG5cdG1vZGlmaWVkUmV2ZWFsKHJhbmdlOiBSYW5nZSkge1xuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlKHJhbmdlKTtcblx0XHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb24ocmFuZ2UpO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdG1vZGlmaWVkU2V0U2VsZWN0aW9uKHJhbmdlOiBSYW5nZSkge1xuXHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb24ocmFuZ2UpO1xuXHR9XG5cblx0bW9kaWZpZWRGb2N1cygpIHtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdGdldE1vZGlmaWVkUG9zaXRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpID8/IHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBRVAsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCLFNBQXNCLG9CQUFvQjtBQUNwRSxTQUFTLFNBQVMsaUJBQWlCLFNBQXNCLHFCQUFxQix1QkFBdUI7QUFDckcsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBNEcsdUJBQXVCO0FBQ25JLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQXdEO0FBQ2pFLFNBQVMsWUFBWSxhQUFhLHFCQUFxQjtBQUN2RCxTQUFTLG1CQUFtQixzQkFBc0Isa0NBQWtDO0FBQ3BGLFNBQVMsb0JBQW9DO0FBQzdDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQjtBQUkxQixTQUE0QyxpQkFBaUIsbUJBQW1CLDhCQUE4QjtBQUM5RyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtCQUFrQiw0QkFBNEI7QUFDdkQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6RCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFpQyx5QkFBeUI7QUFDbkUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEIsZ0NBQWdDLGlDQUFpQyw4QkFBOEIsZ0NBQWdDLHVDQUF1QztBQUM3TSxTQUFTLHFCQUE0Ryw4QkFBOEI7QUFDbkosU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFXOUIsTUFBTSxXQUFrQztBQUFBLEVBQXhDO0FBRUMsU0FBaUIsUUFBUSxJQUFJLFdBQWM7QUFBQTtBQUFBLEVBRTNDLFVBQWdCO0FBQ2YsWUFBUSxLQUFLLEtBQUs7QUFBQSxFQUNuQjtBQUFBLEVBRUEsTUFBcUI7QUFDcEIsV0FBTyxLQUFLLE1BQU0sTUFBTTtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxRQUFRLEtBQWM7QUFDckIsU0FBSyxNQUFNLEtBQUssR0FBRztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxJQUFJLE9BQW9CO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUVPLElBQU0sbUNBQU4sTUFBc0Y7QUFBQSxFQWlCNUYsWUFDa0IsUUFDQSxTQUNqQixrQkFDQSx1QkFDaUMsZ0JBQ2EsOEJBQzFCLG1CQUNHLHNCQUNGLHFCQUNpQywwQkFDakIsb0JBQ0wsZUFDL0I7QUFaZ0I7QUFDQTtBQUdnQjtBQUNhO0FBSVE7QUFDakI7QUFDTDtBQXpCakMsU0FBaUIsZ0JBQWdCLGdCQUFnQixNQUFNLEVBQUU7QUFDekQsU0FBUyxlQUFvQyxLQUFLO0FBQ2xELFNBQWlCLFNBQVMsSUFBSSxnQkFBZ0I7QUFJOUMsU0FBaUIsd0JBQXdCLEtBQUssT0FBTyxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDOUUsU0FBaUIsc0JBQXNCLEtBQUssT0FBTyxJQUFJLElBQUksV0FBMkIsQ0FBQztBQUN2RixTQUFpQixtQkFBcUMsQ0FBQztBQUN2RCxTQUFRLGFBQXVCLENBQUM7QUFFaEMsU0FBaUIsNkJBQTZCLGdCQUF5QixNQUFNLEtBQUs7QUFnQmpGLFNBQUssdUJBQXVCLFFBQVEsNEJBQTRCO0FBQ2hFLFVBQU0sZ0JBQWdCLHFCQUFxQixPQUFPO0FBRWxELFNBQUssdUJBQXVCLEtBQUssUUFBUSw0QkFBNEI7QUFDckUsU0FBSyx5QkFBeUIsS0FBSyxRQUFRLDRCQUE0QjtBQUd2RSxTQUFLLE9BQU8sSUFBSSxJQUFJO0FBQUEsTUFDbkIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSyxPQUFPO0FBQUEsSUFDYixDQUFDO0FBRUQsVUFBTSxhQUFhLFFBQVEsT0FBSztBQUMvQixVQUFJLENBQUMsUUFBUSxjQUFjLE1BQU0sS0FBSyxDQUFDLEdBQUcsS0FBSyxpQkFBaUIsS0FBSyxDQUFDLEVBQUUsY0FBYyxHQUFHLEdBQUc7QUFDM0YsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLEtBQUssUUFBUSxVQUFVLGFBQWEsWUFBWSxLQUFLLENBQUMscUJBQXFCLGVBQWUsMEJBQTBCLFFBQVEsS0FBSyxPQUFPLEdBQUc7QUFDOUksZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBSUQsU0FBSyxPQUFPLElBQUksUUFBUSxPQUFLO0FBRTVCLFVBQUksQ0FBQyxXQUFXLEtBQUssQ0FBQyxHQUFHO0FBQ3hCLGFBQUsscUJBQXFCLE1BQU07QUFDaEM7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFnQyxDQUFDO0FBQ3ZDLFlBQU0sT0FBTyxpQkFBaUIsS0FBSyxDQUFDO0FBQ3BDLGlCQUFXLGFBQWEsS0FBSyxTQUFTO0FBQ3JDLGFBQUssS0FBSztBQUFBLFVBQ1QsT0FBTyxVQUFVLFNBQVMsaUJBQWlCLEtBQUssSUFBSSxNQUFNLFVBQVUsU0FBUyxpQkFBaUIsR0FBRyxVQUFVLFNBQVMsaUJBQWlCLE9BQU8sZ0JBQWdCO0FBQUEsVUFDNUosU0FBUyxpQ0FBaUM7QUFBQSxRQUMzQyxDQUFDO0FBQUEsTUFDRjtBQUNBLFdBQUsscUJBQXFCLElBQUksSUFBSTtBQUFBLElBQ25DLENBQUMsQ0FBQztBQUdGLFFBQUk7QUFDSixTQUFLLE9BQU8sSUFBSSxRQUFRLE9BQUs7QUFFNUIsVUFBSSxXQUFXLEtBQUssQ0FBQyxLQUNqQixDQUFDLE9BQU8sMkJBQTJCLEtBQUssQ0FBQyxLQUN6QywyQkFBMkIsT0FBTywwQkFDbEMsQ0FBQyxpQkFBaUIsS0FBSyxDQUFDLEVBQUUsV0FDNUI7QUFDRCxpQ0FBeUIsT0FBTztBQUNoQyxjQUFNLFdBQVcsUUFBUSxZQUFZLEtBQUssSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUMzRCxjQUFNLFNBQVMsS0FBSyxxQkFBcUIsVUFBVTtBQUNuRCxZQUFJLGVBQWUsT0FBTyxVQUFVLENBQUFBLE9BQUtBLEdBQUUsaUJBQWlCLFFBQVEsQ0FBQztBQUNyRSxZQUFJLGVBQWUsR0FBRztBQUNyQix5QkFBZTtBQUNmLGlCQUFPLGVBQWUsT0FBTyxTQUFTLEdBQUcsZ0JBQWdCO0FBQ3hELGtCQUFNLFFBQVEsT0FBTyxZQUFZO0FBQ2pDLGdCQUFJLE1BQU0saUJBQWlCLFNBQVMsWUFBWTtBQUMvQztBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGFBQUssY0FBYyxJQUFJLGNBQWMsTUFBUztBQUM5QyxnQkFBUSxZQUFZLE9BQU8sWUFBWSxDQUFDO0FBQUEsTUFDekM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFNBQUssT0FBTyxJQUFJLFFBQVEsT0FBSztBQUU1QixVQUFJLENBQUMsV0FBVyxLQUFLLENBQUMsR0FBRztBQUN4QixhQUFLLG9CQUFvQjtBQUN6QjtBQUFBLE1BQ0Q7QUFHQSxVQUFJLENBQUMsT0FBTywyQkFBMkIsS0FBSyxDQUFDLEtBQUssdUJBQXVCO0FBQ3hFLGNBQU0sZUFBZSxLQUFLLFFBQVEsVUFBVSxhQUFhLFlBQVk7QUFFckUsc0JBQWMsVUFBVSxhQUFhLFFBQVEsRUFBRSxLQUFLLENBQUM7QUFDckQsc0JBQWMsVUFBVSxhQUFhLFVBQVUsRUFBRSxLQUFLLENBQUM7QUFFdkQsY0FBTSxhQUFhLE9BQU8sV0FBVyxLQUFLLENBQUM7QUFDM0MsY0FBTSxPQUFPLGlCQUFpQixLQUFLLENBQUM7QUFDcEMsYUFBSyxxQkFBcUIsTUFBTSxZQUFZLFlBQVk7QUFBQSxNQUN6RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSwwQkFBMEIsdUJBQXVCLE9BQU8saUJBQWlCO0FBSS9FLFNBQUssT0FBTyxJQUFJLFFBQVEsT0FBSztBQUM1QixZQUFNLFdBQVcsY0FBYyxVQUFVLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQztBQUN0RCxVQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsS0FBSyxDQUFDLEdBQUc7QUFDckMsZ0NBQXdCLE1BQU07QUFDOUI7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFPLGlCQUFpQixLQUFLLENBQUM7QUFDcEMsWUFBTSxpQkFBaUIsS0FBSyxRQUFRLEtBQUssT0FBSyxFQUFFLFNBQVMsU0FBUyxTQUFTLFVBQVUsS0FBSyxFQUFFLFNBQVMsV0FBVyxFQUFFLFNBQVMsb0JBQW9CLFNBQVMsVUFBVTtBQUVsSyw4QkFBd0IsSUFBSSxDQUFDLENBQUMsY0FBYztBQUU1QyxVQUFJLGdCQUFnQjtBQUNuQixZQUFJO0FBQ0osWUFBSSxlQUFlLFNBQVMsU0FBUztBQUNwQyxtQkFBUyxvQkFBb0I7QUFBQSxRQUM5QixXQUFXLGVBQWUsU0FBUyxTQUFTO0FBQzNDLG1CQUFTLG9CQUFvQjtBQUFBLFFBQzlCLE9BQU87QUFDTixtQkFBUyxvQkFBb0I7QUFBQSxRQUM5QjtBQUNBLGFBQUssNkJBQTZCLFdBQVcsUUFBUSxFQUFFLFFBQVEsMENBQTBDLENBQUM7QUFBQSxNQUMzRztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxPQUFPLElBQUksUUFBUSxPQUFLO0FBRTVCLFlBQU0sVUFBVSxLQUFLLDJCQUEyQixLQUFLLENBQUM7QUFFdEQsVUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEtBQUssQ0FBQyxHQUFHO0FBQ3BDO0FBQUEsTUFDRDtBQUVBLFlBQU0sdUJBQXVCLElBQUksNEJBQTRCO0FBQzdELGNBQVEsaUJBQWlCLG9CQUFvQjtBQUM3QyxRQUFFLE1BQU0sSUFBSSxhQUFhLE1BQU0sUUFBUSxvQkFBb0Isb0JBQW9CLENBQUMsQ0FBQztBQUVqRixRQUFFLE1BQU0sSUFBSSxxQkFBcUI7QUFBQSxRQUNoQztBQUFBLFFBQ0EscUJBQXFCLFdBQVc7QUFBQSxRQUNoQztBQUFBLFFBQ0EsQ0FBQ0MsVUFBUyxPQUFPLEtBQUssMkJBQTJCLElBQUlBLFVBQVMsRUFBRTtBQUFBLFFBQ2hFLGdCQUFnQixJQUFJO0FBQUEsUUFDcEIsY0FBYyxXQUFXLElBQUksQ0FBQyxHQUFHRCxPQUFNLEVBQUUsS0FBSztBQUFBLFFBQzlDLGNBQWMsV0FBVyxJQUFJLENBQUMsR0FBR0EsT0FBTSxFQUFFLE1BQU07QUFBQSxRQUMvQyxpQkFBaUIsSUFBSSxVQUFRLEtBQUssUUFBUSxNQUFNLENBQUM7QUFBQSxRQUNqRCxxQkFBcUIsZUFBZSwyQkFBMkIsa0JBQWtCLE9BQU87QUFBQSxNQUN6RixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFLRixRQUFJO0FBRUosVUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxVQUFJLGtCQUFrQixRQUFXO0FBQ2hDLGFBQUssUUFBUSxjQUFjLGFBQWE7QUFDeEMsd0JBQWdCO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBRUEsU0FBSyxPQUFPLElBQUksYUFBYSxvQkFBb0IsQ0FBQztBQUVsRCxVQUFNLHdCQUF3QixRQUFRLE1BQU0sT0FBSztBQUNoRCxhQUFPLFdBQVcsS0FBSyxDQUFDLEtBQUssUUFBUSxPQUFPLDJCQUEyQixLQUFLLENBQUMsQ0FBQztBQUFBLElBQy9FLENBQUM7QUFFRCxTQUFLLE9BQU8sSUFBSSxRQUFRLE9BQUs7QUFDNUIsWUFBTSxRQUFRLHNCQUFzQixLQUFLLENBQUM7QUFDMUMsVUFBSSxPQUFPO0FBRVYsMEJBQWtCO0FBQUEsVUFDakIsVUFBVSxLQUFLLFFBQVEsVUFBVSxhQUFhLFFBQVE7QUFBQSxVQUN0RCxjQUFjLEtBQUssUUFBUSxVQUFVLGFBQWEsWUFBWTtBQUFBLFVBQzlELFVBQVUsS0FBSyxRQUFRLFVBQVUsYUFBYSxRQUFRO0FBQUEsVUFDdEQsUUFBUSxLQUFLLFFBQVEsVUFBVSxhQUFhLE1BQU07QUFBQSxRQUNuRDtBQUVBLGFBQUssUUFBUSxjQUFjO0FBQUEsVUFDMUIsVUFBVTtBQUFBLFVBQ1YsY0FBYyxFQUFFLFNBQVMsTUFBTTtBQUFBLFVBQy9CLFVBQVU7QUFBQSxVQUNWLFFBQVEsRUFBRSxhQUFhLE9BQU8sY0FBYyxNQUFNO0FBQUEsUUFDbkQsQ0FBQztBQUFBLE1BQ0YsT0FBTztBQUNOLDZCQUFxQjtBQUFBLE1BQ3RCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssT0FBTztBQUNaLFNBQUssT0FBTyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVRLFNBQVM7QUFDaEIsU0FBSyxxQkFBcUIsTUFBTTtBQUNoQyxTQUFLLG9CQUFvQjtBQUN6QixTQUFLLGNBQWMsSUFBSSxJQUFJLE1BQVM7QUFBQSxFQUNyQztBQUFBO0FBQUEsRUFJUSxzQkFBc0I7QUFDN0IsU0FBSyxRQUFRLGdCQUFnQixDQUFDLDJCQUEyQjtBQUN4RCxpQkFBVyxNQUFNLEtBQUssWUFBWTtBQUNqQywrQkFBdUIsV0FBVyxFQUFFO0FBQUEsTUFDckM7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLGFBQWEsQ0FBQztBQUNuQixTQUFLLHNCQUFzQixNQUFNO0FBQ2pDLGVBQVcsVUFBVSxLQUFLLG9CQUFvQixNQUFNO0FBQ25ELGFBQU8sT0FBTztBQUFBLElBQ2Y7QUFDQSxTQUFLLHVCQUF1QixNQUFNO0FBQUEsRUFDbkM7QUFBQSxFQUVRLHFCQUFxQixNQUFzQixZQUFxQixVQUF5QjtBQUVoRyxVQUFNLHdCQUF3Qix1QkFBdUIsY0FBYztBQUFBLE1BQ2xFLEdBQUc7QUFBQSxNQUNILFlBQVksdUJBQXVCO0FBQUEsSUFDcEMsQ0FBQztBQUNELFVBQU0saUNBQWlDLHVCQUF1QixjQUFjO0FBQUEsTUFDM0UsR0FBRztBQUFBLE1BQ0gsWUFBWSx1QkFBdUI7QUFBQSxJQUNwQyxDQUFDO0FBQ0QsVUFBTSwyQkFBMkIsQ0FBQyxvQkFBNEIsaUJBQXlCO0FBQ3RGLGFBQU8sdUJBQXVCLGNBQWM7QUFBQSxRQUMzQyxhQUFhO0FBQUEsUUFDYixlQUFlLEVBQUUsT0FBTyxpQkFBaUIsa0JBQWtCLEdBQUcsVUFBVSxrQkFBa0IsS0FBSztBQUFBLFFBQy9GLFNBQVMsRUFBRSxPQUFPLGlCQUFpQixZQUFZLEdBQUcsVUFBVSxnQkFBZ0IsT0FBTztBQUFBLE1BQ3BGLENBQUM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxxQkFBcUIseUJBQXlCLGlDQUFpQywrQkFBK0I7QUFDcEgsVUFBTSxrQkFBa0IseUJBQXlCLDhCQUE4Qiw0QkFBNEI7QUFDM0csVUFBTSxvQkFBb0IseUJBQXlCLGdDQUFnQyw4QkFBOEI7QUFFakgsU0FBSyxzQkFBc0IsTUFBTTtBQUNqQyxTQUFLLGlCQUFpQixTQUFTO0FBQy9CLFVBQU0sc0JBQStDLENBQUM7QUFFdEQsU0FBSyxRQUFRLGdCQUFnQixDQUFDLDJCQUEyQjtBQUN4RCxpQkFBVyxNQUFNLEtBQUssWUFBWTtBQUNqQywrQkFBdUIsV0FBVyxFQUFFO0FBQUEsTUFDckM7QUFDQSxXQUFLLGFBQWEsQ0FBQztBQUNuQixZQUFNLDRCQUFxRCxDQUFDO0FBQzVELFlBQU0sNEJBQTRCLEtBQUssY0FBYywwQkFBMEI7QUFDL0UsWUFBTSxrQkFBa0IsS0FBSyxjQUFjLGdCQUFnQjtBQUMzRCxZQUFNLGdCQUFnQixjQUFjLFdBQVcsS0FBSyxPQUFPO0FBQzNELFlBQU0sa0JBQWtCLEtBQUssUUFBUSxTQUFTLEdBQUcsYUFBYTtBQUU5RCxpQkFBVyxhQUFhLEtBQUssU0FBUztBQUVyQyxjQUFNLGdCQUFnQixVQUFVO0FBQ2hDLGFBQUssY0FBYyxhQUFhLGtCQUFrQixLQUFLLElBQUksR0FBRyxjQUFjLHlCQUF5QixDQUFDLENBQUM7QUFDdkcsY0FBTSxTQUFTLElBQUk7QUFBQSxVQUNsQixjQUFjLGVBQWUsT0FBSyxLQUFLLGNBQWMsYUFBYSxjQUFjLENBQUMsQ0FBQztBQUFBLFVBQ2xGLENBQUM7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGNBQWtDLENBQUM7QUFFekMsWUFBSSxZQUFZO0FBQ2YscUJBQVcsS0FBSyxVQUFVLGdCQUFnQixDQUFDLEdBQUc7QUFDN0Msd0JBQVksS0FBSyxJQUFJO0FBQUEsY0FDcEIsRUFBRSxjQUFjLE1BQU0sRUFBRSxVQUFVLFNBQVMsa0JBQWtCLEVBQUU7QUFBQSxjQUMvRCxxQkFBcUI7QUFBQSxjQUNyQixxQkFBcUI7QUFBQSxZQUN0QixDQUFDO0FBR0QsZ0JBQUksRUFBRSxFQUFFLGNBQWMsUUFBUSxLQUFLLEVBQUUsY0FBYyxvQkFBb0IsS0FBSyxFQUFFLGNBQWMsa0JBQWtCLG9CQUFvQixDQUFDLEVBQUUsY0FBYyxRQUFRLEdBQUc7QUFDN0osd0NBQTBCLEtBQUs7QUFBQSxnQkFDOUIsT0FBTyxFQUFFO0FBQUEsZ0JBQWUsU0FBUztBQUFBLGNBQ2xDLENBQUM7QUFBQSxZQUNGO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFJQSxjQUFNLG1CQUFtQixZQUFZLFdBQVcsS0FBSyxZQUFZLENBQUMsRUFBRSxNQUFNLFFBQVEsS0FBSyxVQUFVLFNBQVMsb0JBQW9CO0FBRTlILFlBQUksQ0FBQyxVQUFVLFNBQVMsU0FBUztBQUNoQyxvQ0FBMEIsS0FBSztBQUFBLFlBQzlCLE9BQU8sVUFBVSxTQUFTLGlCQUFpQjtBQUFBLFlBQzNDLFNBQVM7QUFBQSxVQUNWLENBQUM7QUFBQSxRQUNGO0FBRUEsWUFBSSxVQUFVLFNBQVMsU0FBUztBQUUvQixvQ0FBMEIsS0FBSztBQUFBLFlBQzlCLE9BQU8sVUFBVSxTQUFTLGlCQUFpQjtBQUFBLFlBQzNDLFNBQVM7QUFBQSxVQUNWLENBQUM7QUFBQSxRQUNGLFdBQVcsVUFBVSxTQUFTLFNBQVM7QUFFdEMsb0NBQTBCLEtBQUs7QUFBQSxZQUM5QixPQUFPLElBQUksTUFBTSxVQUFVLFNBQVMsa0JBQWtCLEdBQUcsR0FBRyxVQUFVLFNBQVMsaUJBQWlCLENBQUM7QUFBQSxZQUNqRyxTQUFTO0FBQUEsVUFDVixDQUFDO0FBQUEsUUFDRixPQUFPO0FBRU4sb0NBQTBCLEtBQUs7QUFBQSxZQUM5QixPQUFPLFVBQVUsU0FBUyxpQkFBaUI7QUFBQSxZQUMzQyxTQUFTO0FBQUEsVUFDVixDQUFDO0FBQUEsUUFDRjtBQUVBLFlBQUksYUFBYTtBQUNqQixZQUFJLGNBQWMsQ0FBQyxVQUFVO0FBQzVCLGdCQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsa0JBQVEsWUFBWTtBQUNwQixnQkFBTSxTQUFTLFlBQVksUUFBUSxlQUFlLGFBQWEsT0FBTztBQUN0RSx1QkFBYSxPQUFPO0FBQ3BCLGNBQUksQ0FBQyxrQkFBa0I7QUFFdEIsa0JBQU0sZUFBMEI7QUFBQSxjQUMvQixpQkFBaUIsVUFBVSxTQUFTLGtCQUFrQjtBQUFBLGNBQ3RELGVBQWUsT0FBTztBQUFBLGNBQ3RCO0FBQUEsY0FDQSxTQUFTLE1BQVE7QUFBQTtBQUFBLFlBQ2xCO0FBRUEsaUJBQUssV0FBVyxLQUFLLHVCQUF1QixRQUFRLFlBQVksQ0FBQztBQUFBLFVBQ2xFO0FBQUEsUUFDRDtBQUVBLFlBQUksY0FBYyxVQUFVO0FBRzNCLGNBQUksU0FBUyxLQUFLLG9CQUFvQixJQUFJO0FBQzFDLGNBQUksQ0FBQyxRQUFRO0FBRVoscUJBQVMsS0FBSyxRQUFRLG9CQUFvQixjQUFZO0FBQ3JELG9CQUFNLGVBQWUsU0FBUyxJQUFJLHFCQUFxQjtBQUN2RCxxQkFBTyxhQUFhLGVBQWUsZ0JBQWdCLEtBQUssU0FBUyxNQUFNLFdBQVcsS0FBSyxRQUFRLFNBQVMsRUFBRyxhQUFhLEdBQUcsbUJBQW1CLElBQUksVUFBVTtBQUFBLFlBQzdKLENBQUM7QUFBQSxVQUNGLE9BQU87QUFDTixtQkFBTyxPQUFPLE1BQU0sV0FBVyxLQUFLLFFBQVEsU0FBUyxFQUFHLGFBQWEsR0FBRyxtQkFBbUIsSUFBSSxVQUFVO0FBQUEsVUFDMUc7QUFDQSxlQUFLLHNCQUFzQixJQUFJLGFBQWEsTUFBTTtBQUNqRCxpQkFBSyxvQkFBb0IsUUFBUSxNQUFNO0FBQUEsVUFDeEMsQ0FBQyxDQUFDO0FBRUYsaUJBQU8sT0FBTyxVQUFVLFNBQVMsZUFBZTtBQUVoRCxlQUFLLGlCQUFpQixLQUFLLE1BQU07QUFDakMsOEJBQW9CLEtBQUs7QUFBQSxZQUN4QixPQUFPLFVBQVUsU0FBUyxpQkFBaUIsS0FBSyxJQUFJLE1BQU0sVUFBVSxTQUFTLGlCQUFpQixHQUFHLFVBQVUsU0FBUyxpQkFBaUIsT0FBTyxnQkFBZ0I7QUFBQSxZQUM1SixTQUFTO0FBQUEsY0FDUixhQUFhO0FBQUEsY0FDYixZQUFZLHVCQUF1QjtBQUFBLFlBQ3BDO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLHVCQUF1QixJQUFJLENBQUMsV0FBVyw0QkFBNEIsQ0FBQyxDQUFDO0FBQUEsSUFDM0UsQ0FBQztBQUVELFVBQU0seUJBQXlCLEtBQUssUUFBUSw0QkFBNEIsbUJBQW1CO0FBRTNGLFNBQUssc0JBQXNCLElBQUksYUFBYSxNQUFNO0FBQ2pELDZCQUF1QixNQUFNO0FBQUEsSUFDOUIsQ0FBQyxDQUFDO0FBR0YsZUFBVyxlQUFlLEtBQUssb0JBQW9CLE1BQU07QUFDeEQsa0JBQVksT0FBTztBQUFBLElBQ3BCO0FBRUEsVUFBTSxjQUFjLG9CQUFvQixLQUFLLFFBQVEsMkJBQTJCLE9BQUssS0FBSyxRQUFRLFlBQVksQ0FBQztBQUUvRyxVQUFNLGtCQUFrQixRQUFRLE9BQUs7QUFDcEMsWUFBTSxXQUFXLFlBQVksS0FBSyxDQUFDO0FBQ25DLFVBQUksQ0FBQyxVQUFVO0FBQ2QsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLE1BQU0sdUJBQXVCLFVBQVUsRUFBRSxVQUFVLENBQUFBLE9BQUtBLEdBQUUsaUJBQWlCLFFBQVEsQ0FBQztBQUMxRixhQUFPO0FBQUEsSUFDUixDQUFDO0FBQ0QsVUFBTSxlQUFlLENBQUMsaUJBQTZDO0FBQ2xFLFlBQU0sY0FBYyxnQkFBZ0IsSUFBSTtBQUN4QyxlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssaUJBQWlCLFFBQVEsS0FBSztBQUN0RCxjQUFNLFNBQVMsS0FBSyxpQkFBaUIsQ0FBQztBQUN0QyxlQUFPLE9BQU8sV0FBVyxnQkFBZ0IsTUFBTSxXQUFXO0FBQUEsTUFDM0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxzQkFBc0IsSUFBSSxRQUFRLE9BQUs7QUFFM0MsWUFBTSxNQUFNLGdCQUFnQixLQUFLLENBQUM7QUFDbEMsWUFBTSxTQUFTLEtBQUssaUJBQWlCLEdBQUc7QUFDeEMsbUJBQWEsTUFBTTtBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUdGLFNBQUssc0JBQXNCLElBQUksS0FBSyxRQUFRLFVBQVUsT0FBSztBQUUxRCxVQUFJLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixtQkFBbUI7QUFDeEQsY0FBTSxPQUFPLEVBQUUsT0FBTztBQUN0QixjQUFNLE1BQU0sS0FBSyxXQUFXLFVBQVUsUUFBTSxPQUFPLEtBQUssVUFBVTtBQUNsRSxZQUFJLE9BQU8sR0FBRztBQUNiLGVBQUssUUFBUSxZQUFZLEVBQUUsT0FBTyxRQUFRO0FBQzFDLGVBQUssUUFBUSxNQUFNO0FBQUEsUUFDcEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLHNCQUFzQixJQUFJLEtBQUssUUFBUSxZQUFZLE9BQUs7QUFHNUQsVUFBSSxFQUFFLE9BQU8sU0FBUyxnQkFBZ0IsZ0JBQWdCO0FBQ3JELGNBQU0sS0FBSyxFQUFFLE9BQU87QUFDcEIsY0FBTSxTQUFTLEtBQUssaUJBQWlCLEtBQUssT0FBSyxFQUFFLE1BQU0sTUFBTSxFQUFFO0FBQy9ELHFCQUFhLE1BQU07QUFBQSxNQUVwQixXQUFXLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixtQkFBbUI7QUFDL0QsY0FBTSxPQUFPLEVBQUUsT0FBTztBQUN0QixjQUFNLE1BQU0sS0FBSyxXQUFXLFVBQVUsUUFBTSxPQUFPLEtBQUssVUFBVTtBQUNsRSxxQkFBYSxLQUFLLGlCQUFpQixHQUFHLENBQUM7QUFBQSxNQUV4QyxXQUFXLEVBQUUsT0FBTyxVQUFVO0FBQzdCLGNBQU0sRUFBRSxTQUFTLElBQUksRUFBRTtBQUN2QixjQUFNLE1BQU0sdUJBQXVCLFVBQVUsRUFBRSxVQUFVLE9BQUssRUFBRSxpQkFBaUIsUUFBUSxDQUFDO0FBQzFGLHFCQUFhLEtBQUssaUJBQWlCLEdBQUcsQ0FBQztBQUFBLE1BRXhDLE9BQU87QUFDTixxQkFBYSxNQUFTO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssc0JBQXNCLElBQUksTUFBTSxJQUFJLEtBQUssUUFBUSxtQkFBbUIsS0FBSyxRQUFRLGlCQUFpQixFQUFFLE1BQU07QUFDOUcsZUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLGlCQUFpQixRQUFRLEtBQUs7QUFDdEQsY0FBTSxTQUFTLEtBQUssaUJBQWlCLENBQUM7QUFDdEMsY0FBTSxRQUFRLHVCQUF1QixTQUFTLENBQUM7QUFDL0MsWUFBSSxPQUFPO0FBQ1YsaUJBQU8sT0FBTyxPQUFPLGVBQWU7QUFBQSxRQUNyQyxPQUFPO0FBQ04saUJBQU8sUUFBUTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsMkJBQWlDO0FBQ2hDLFNBQUssMkJBQTJCLElBQUksTUFBTSxNQUFTO0FBQUEsRUFDcEQ7QUFBQTtBQUFBLEVBSUEsT0FBTyxhQUFzQixlQUErQjtBQUUzRCxVQUFNLGNBQWMsS0FBSyxxQkFDdkIsVUFBVSxFQUNWLEtBQUssQ0FBQyxHQUFHLE1BQU0sTUFBTSx5QkFBeUIsR0FBRyxDQUFDLENBQUM7QUFFckQsVUFBTSxRQUFRLGNBQWMsSUFBSSxZQUFZLFNBQVM7QUFDckQsVUFBTSxRQUFRLFlBQVksR0FBRyxLQUFLO0FBQ2xDLFFBQUksT0FBTztBQUNWLFdBQUssUUFBUSxZQUFZLE1BQU0saUJBQWlCLENBQUM7QUFDakQsV0FBSyxRQUFRLFlBQVksS0FBSztBQUM5QixVQUFJLENBQUMsZUFBZTtBQUNuQixhQUFLLFFBQVEsTUFBTTtBQUFBLE1BQ3BCO0FBQ0EsV0FBSyxjQUFjLElBQUksT0FBTyxNQUFTO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxLQUFLLE1BQXdCO0FBQzVCLFdBQU8sS0FBSyxRQUFRLE1BQU0sQ0FBQyxJQUFJO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFNBQVMsTUFBd0I7QUFDaEMsV0FBTyxLQUFLLFFBQVEsT0FBTyxDQUFDLElBQUk7QUFBQSxFQUNqQztBQUFBLEVBRVEsUUFBUSxNQUFlLFFBQWlCO0FBRS9DLFVBQU0sV0FBVyxLQUFLLFFBQVEsWUFBWTtBQUMxQyxRQUFJLENBQUMsVUFBVTtBQUNkLFdBQUssY0FBYyxJQUFJLElBQUksTUFBUztBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sY0FBYyxLQUFLLHFCQUN2QixVQUFVLEVBQ1YsS0FBSyxDQUFDLEdBQUcsTUFBTSxNQUFNLHlCQUF5QixHQUFHLENBQUMsQ0FBQztBQUVyRCxRQUFJLFlBQVksV0FBVyxHQUFHO0FBQzdCLFdBQUssY0FBYyxJQUFJLElBQUksTUFBUztBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksV0FBbUI7QUFDdkIsYUFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLFFBQVEsS0FBSztBQUM1QyxZQUFNLFFBQVEsWUFBWSxDQUFDO0FBQzNCLFVBQUksTUFBTSxpQkFBaUIsUUFBUSxHQUFHO0FBQ3JDLG1CQUFXLEtBQUssT0FBTyxJQUFJO0FBQzNCO0FBQUEsTUFDRCxXQUFXLFNBQVMsU0FBUyxVQUFVLE1BQU0saUJBQWlCLENBQUMsR0FBRztBQUNqRSxtQkFBVyxPQUFPLElBQUksSUFBSTtBQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxXQUFXLFdBQVcsS0FBSyxZQUFZLFlBQVksU0FBUztBQUUvRCxhQUFPO0FBQUEsSUFDUjtBQUVBLGdCQUFZLFdBQVcsWUFBWSxVQUFVLFlBQVk7QUFFekQsU0FBSyxjQUFjLElBQUksVUFBVSxNQUFTO0FBRTFDLFVBQU0sY0FBYyxZQUFZLFFBQVE7QUFDeEMsVUFBTSxpQkFBaUIsT0FBTyxZQUFZLGlCQUFpQixJQUFJLFlBQVksZUFBZTtBQUMxRixTQUFLLFFBQVEsWUFBWSxjQUFjO0FBQ3ZDLFNBQUssUUFBUSx1QkFBdUIsWUFBWSxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUM1RSxTQUFLLFFBQVEsTUFBTTtBQUVuQixXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFJUSxxQkFBaUQ7QUFDeEQsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGtCQUFrQixLQUFLLFFBQVEsb0JBQW9CLEtBQUssUUFBUSxZQUFZLEVBQUUsVUFBVSxJQUFJLEtBQUssUUFBUSxhQUFhO0FBQzVILFFBQUk7QUFDSixRQUFJLGtCQUFrQixPQUFPO0FBRTdCLGVBQVcsVUFBVSxLQUFLLGtCQUFrQjtBQUMzQyxZQUFNLFlBQTRELE9BQU8sWUFBWSxHQUFHLFlBQWE7QUFDckcsVUFBSSxjQUFjLFFBQVc7QUFDNUIsY0FBTSxXQUFXLEtBQUssSUFBSSxZQUFZLGVBQWU7QUFDckQsWUFBSSxXQUFXLGlCQUFpQjtBQUMvQiw0QkFBa0I7QUFDbEIsMEJBQWdCO0FBQUEsUUFDakI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixlQUE2RDtBQUN0RixvQkFBZ0IsaUJBQWlCLEtBQUssbUJBQW1CO0FBQ3pELFFBQUkseUJBQXlCLGdCQUFnQjtBQUM1QyxZQUFNLGNBQWMsT0FBTztBQUMzQixXQUFLLEtBQUssSUFBSTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixlQUE2RDtBQUN0RixvQkFBZ0IsaUJBQWlCLEtBQUssbUJBQW1CO0FBQ3pELFFBQUkseUJBQXlCLGdCQUFnQjtBQUM1QyxZQUFNLGNBQWMsT0FBTztBQUMzQixXQUFLLEtBQUssSUFBSTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFdBQVcsUUFBa0QsTUFBK0I7QUFDakcsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBRUEsUUFBSSxZQUFZLEtBQUssUUFBUSxhQUFhO0FBQzFDLFFBQUksa0JBQWtCLGdCQUFnQjtBQUNyQyxZQUFNLGFBQWEsT0FBTyxtQkFBbUI7QUFDN0MsWUFBTSxXQUFXLGFBQWEsSUFBSSxTQUFTLFlBQVksQ0FBQyxJQUFJO0FBQzVELFVBQUksWUFBWSxDQUFDLFVBQVUsaUJBQWlCLFFBQVEsR0FBRztBQUN0RCxvQkFBWSxVQUFVLGNBQWMsUUFBUTtBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxLQUFLLFFBQVEsVUFBVSxhQUFhLFlBQVk7QUFHckUsUUFBSSxTQUFTLFNBQVksT0FBTyxDQUFDLGNBQWM7QUFFOUMsWUFBTSxhQUFhLE1BQU0sS0FBSyxlQUFlLFdBQVc7QUFBQSxRQUN2RCxVQUFVLEVBQUUsVUFBVSxLQUFLLE9BQU8sWUFBWTtBQUFBLFFBQzlDLFVBQVUsRUFBRSxVQUFVLEtBQUssT0FBTyxZQUFZO0FBQUEsUUFDOUMsU0FBUyxFQUFFLFVBQVU7QUFBQSxRQUNyQixPQUFPLFNBQVMsZ0JBQWdCLDJCQUEyQixTQUFTLEtBQUssT0FBTyxXQUFXLENBQUM7QUFBQSxNQUM3RixDQUFDO0FBRUQsVUFBSSxjQUFjLFdBQVcsT0FBTztBQUNuQyxtQkFBVyxXQUFXLEdBQUcsYUFBYSxTQUFTO0FBQy9DLGNBQU0sSUFBSSxRQUFRLE9BQUs7QUFDdEIsZ0JBQU0sUUFBUSxLQUFLLE9BQU8sTUFBTSxLQUFLLENBQUM7QUFDdEMsY0FBSSxVQUFVLHVCQUF1QixZQUFZLFVBQVUsdUJBQXVCLFVBQVU7QUFDM0YsY0FBRSxRQUFRO0FBQ1Ysa0JBQU0sZUFBb0MsQ0FBQztBQUMzQyx1QkFBVyxhQUFhLEtBQUssZUFBZSxXQUFXLGFBQWEsb0JBQW9CLEdBQUc7QUFDMUYsa0JBQUksa0JBQWtCLFVBQVUsTUFBTSxLQUNsQyxRQUFRLFVBQVUsT0FBTyxTQUFTLFVBQVUsS0FBSyxPQUFPLFdBQVcsS0FDbkUsUUFBUSxVQUFVLE9BQU8sU0FBUyxVQUFVLEtBQUssT0FBTyxXQUFXLEdBQ3JFO0FBQ0QsNkJBQWEsS0FBSyxTQUFTO0FBQUEsY0FDNUI7QUFBQSxZQUNEO0FBRUEsaUJBQUssZUFBZSxhQUFhLFlBQVk7QUFBQSxVQUM5QztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELE9BQU87QUFFTixZQUFNLEtBQUssZUFBZSxXQUFXO0FBQUEsUUFDcEMsVUFBVSxLQUFLLE9BQU87QUFBQSxRQUN0QixTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0EscUJBQXFCLDhCQUE4QjtBQUFBLFFBQ3BEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDRDtBQWhwQmEsaUNBRVksMEJBQTBCLHVCQUF1QixTQUFTLEVBQUUsYUFBYSx1QkFBdUIsQ0FBQztBQUY3RyxtQ0FBTjtBQUFBLEVBc0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBN0JVO0FBa3BCYixJQUFNLGlCQUFOLE1BQTZFO0FBQUEsRUFXNUUsWUFDa0IsU0FDVCxXQUNBLFNBQ0EsWUFDQSxZQUNlLGNBQ3RCO0FBTmdCO0FBQ1Q7QUFDQTtBQUNBO0FBQ0E7QUFiVCxTQUFpQixNQUFjLHNCQUFzQixlQUFlLFNBQVM7QUFHN0UsU0FBaUIsU0FBUyxJQUFJLGdCQUFnQjtBQUc5QyxTQUFRLFdBQW9CO0FBVTNCLFNBQUssV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM1QyxTQUFLLFNBQVMsWUFBWTtBQUUxQixVQUFNLFVBQVUsYUFBYSxlQUFlLHNCQUFzQixLQUFLLFVBQVUsT0FBTyx1QkFBdUI7QUFBQSxNQUM5RyxpQkFBaUI7QUFBQSxNQUNqQixvQkFBb0IsbUJBQW1CO0FBQUEsTUFDdkMsZ0JBQWdCLEVBQUUsY0FBYyxNQUFNLEtBQU07QUFBQSxNQUM1QyxhQUFhO0FBQUEsUUFDWixrQkFBa0I7QUFBQSxRQUNsQixLQUFLO0FBQUEsTUFDTjtBQUFBLE1BQ0Esd0JBQXdCLENBQUMsUUFBUSxZQUFZO0FBQzVDLGNBQU0sWUFBWSxPQUFPLE9BQU87QUFDaEMsWUFBSSxDQUFDLE9BQU8sT0FBTztBQUNsQixpQkFBTyxJQUFJLGNBQWMsZUFBZTtBQUFBLFlBQ3ZDLGNBQWM7QUFDYixvQkFBTSxRQUFXLFFBQVEsRUFBRSxHQUFHLFNBQVMsZ0NBQWdDLE1BQXFELE1BQU0sT0FBTyxPQUFPLEtBQUssQ0FBQztBQUFBLFlBQ3ZKO0FBQUEsWUFDUyxPQUFPLFdBQThCO0FBQzdDLG9CQUFNLE9BQU8sU0FBUztBQUN0QixrQkFBSSxXQUFXO0FBQ2QscUJBQUssU0FBUyxVQUFVLElBQUksU0FBUztBQUFBLGNBQ3RDO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLE9BQU8sSUFBSSxPQUFPO0FBQ3ZCLFNBQUssT0FBTyxJQUFJLFFBQVEsYUFBYSxVQUFVLE9BQUssUUFBUSxNQUFNLENBQUMsQ0FBQztBQUNwRSxTQUFLLFFBQVEsaUJBQWlCLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsT0FBTyxVQUEwQixRQUFrQyxXQUFtQixXQUF5QjtBQUM5RyxTQUFLLFlBQVk7QUFDakIsU0FBSyxVQUFVO0FBQ2YsU0FBSyxhQUFhO0FBQ2xCLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssT0FBTyxRQUFRO0FBQ3BCLFNBQUssUUFBUSxvQkFBb0IsSUFBSTtBQUNyQyxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRUEsUUFBZ0I7QUFDZixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxPQUFPLGlCQUErQjtBQUVyQyxVQUFNLGFBQWEsS0FBSyxRQUFRLFVBQVUsYUFBYSxVQUFVO0FBQ2pFLFVBQU0sRUFBRSxhQUFhLGNBQWMsdUJBQXVCLElBQUksS0FBSyxRQUFRLGNBQWM7QUFDekYsVUFBTSxZQUFZLEtBQUssUUFBUSxhQUFhO0FBRTVDLFNBQUssWUFBWTtBQUFBLE1BQ2hCLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxRQUNYLEtBQUssS0FBSyxRQUFRLG9CQUFvQixlQUFlLElBQUksWUFBYSxhQUFhLEtBQUs7QUFBQSxRQUN4RixNQUFNLGNBQWMsZ0JBQWdCLElBQUkseUJBQXlCLGNBQWMsS0FBSyxRQUFRO0FBQUEsTUFDN0Y7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLFVBQVU7QUFDbEIsV0FBSyxXQUFXO0FBQ2hCLFdBQUssUUFBUSxpQkFBaUIsSUFBSTtBQUFBLElBQ25DLE9BQU87QUFDTixXQUFLLFFBQVEsb0JBQW9CLElBQUk7QUFBQSxJQUN0QztBQUNBLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQUVBLFNBQWU7QUFDZCxTQUFLLFFBQVEsb0JBQW9CLElBQUk7QUFDckMsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVBLE9BQU8sTUFBZTtBQUNyQixTQUFLLFNBQVMsVUFBVSxPQUFPLFNBQVMsSUFBSTtBQUM1QyxRQUFJLEtBQUssc0JBQXNCO0FBQzlCLFdBQUssT0FBTyxLQUFLLG9CQUFvQjtBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBLEVBRUEsYUFBMEI7QUFDekIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsY0FBNkM7QUFDNUMsV0FBTyxLQUFLLGFBQWE7QUFBQSxFQUMxQjtBQUFBLEVBRUEscUJBQXlDO0FBQ3hDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBLEVBSUEsTUFBTSxTQUEyQjtBQUNoQyxRQUFJLEtBQUssZUFBZSxLQUFLLFFBQVEsU0FBUyxHQUFHLGFBQWEsR0FBRztBQUNoRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sTUFBTSxLQUFLLFVBQVUsS0FBSyxLQUFLLE9BQU87QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBTSxTQUEyQjtBQUNoQyxRQUFJLEtBQUssZUFBZSxLQUFLLFFBQVEsU0FBUyxHQUFHLGFBQWEsR0FBRztBQUNoRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxVQUFVLEtBQUssS0FBSyxPQUFPO0FBQUEsRUFDeEM7QUFDRDtBQXJJTSxlQUVVLFVBQVU7QUFGcEIsaUJBQU47QUFBQSxFQWlCRztBQUFBLEdBakJHO0FBd0lOLE1BQU0sNEJBQXNEO0FBQUEsRUFJM0QsY0FBYztBQUNiLFNBQUssV0FBVyxTQUFTLGNBQWMsS0FBSztBQUM1QyxTQUFLLFNBQVMsWUFBWTtBQUMxQixTQUFLLFNBQVMsTUFBTSxRQUFRO0FBQzVCLFNBQUssU0FBUyxNQUFNLFdBQVc7QUFBQSxFQUNoQztBQUFBLEVBRUEsUUFBZ0I7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsYUFBMEI7QUFDekIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsY0FBNkM7QUFDNUMsV0FBTztBQUFBLE1BQ04sWUFBWSxFQUFFLEtBQUssR0FBRyxNQUFNLEVBQUU7QUFBQSxNQUM5QixjQUFjO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sMEJBQWdFO0FBQUEsRUFDckUsWUFDa0IsbUJBQ0EsU0FDaEI7QUFGZ0I7QUFDQTtBQUFBLEVBQ2Q7QUFBQSxFQUVKLG1CQUFtQjtBQUNsQixXQUFPLEtBQUssa0JBQWtCLElBQUksRUFBRTtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxxQkFBcUI7QUFDcEIsV0FBTyxLQUFLLFFBQVEsV0FBVztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxlQUFlLE9BQWM7QUFDNUIsVUFBTSxVQUFVLEtBQUssa0JBQWtCLElBQUksRUFBRTtBQUM3QyxVQUFNLE1BQU0sUUFBUSxVQUFVLFdBQVMsTUFBTSxTQUFTLFVBQVUsVUFBVSxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQzNGLFFBQUksT0FBTyxHQUFHO0FBQ2IsY0FBUSxRQUFRLEdBQUcsRUFBRSxTQUFTLGlCQUFpQixLQUFLO0FBQUEsSUFDckQ7QUFDQSxTQUFLLGVBQWUsS0FBSztBQUFBLEVBQzFCO0FBQUEsRUFFQSxtQkFBbUI7QUFDbEIsV0FBTyxLQUFLLFFBQVEsU0FBUztBQUFBLEVBQzlCO0FBQUEsRUFFQSxxQkFBcUI7QUFDcEIsV0FBTyxLQUFLLFFBQVEsV0FBVztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxlQUFlLE9BQWM7QUFDNUIsUUFBSSxPQUFPO0FBQ1YsV0FBSyxRQUFRLFlBQVksS0FBSztBQUM5QixXQUFLLFFBQVEsYUFBYSxLQUFLO0FBQUEsSUFDaEM7QUFDQSxTQUFLLFFBQVEsTUFBTTtBQUFBLEVBQ3BCO0FBQUEsRUFFQSxxQkFBcUIsT0FBYztBQUNsQyxTQUFLLFFBQVEsYUFBYSxLQUFLO0FBQUEsRUFDaEM7QUFBQSxFQUVBLGdCQUFnQjtBQUNmLFNBQUssUUFBUSxNQUFNO0FBQUEsRUFDcEI7QUFBQSxFQUVBLHNCQUFzQjtBQUNyQixXQUFPLEtBQUssUUFBUSxZQUFZLEtBQUs7QUFBQSxFQUN0QztBQUNEOyIsCiAgIm5hbWVzIjogWyJyIiwgInZpc2libGUiXQp9Cg==
