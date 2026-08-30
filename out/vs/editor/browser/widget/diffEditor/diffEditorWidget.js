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
import { getWindow, h } from "../../../../base/browser/dom.js";
import { findLast } from "../../../../base/common/arraysFind.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { readHotReloadableExport } from "../../../../base/common/hotReloadHelpers.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, derivedDisposable, disposableObservableValue, observableFromEvent, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from "../../../../base/common/observable.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { LineRange } from "../../../common/core/ranges/lineRange.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { EditorType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { EditorExtensionsRegistry } from "../../editorExtensions.js";
import { ICodeEditorService } from "../../services/codeEditorService.js";
import { StableEditorScrollState } from "../../stableEditorScroll.js";
import { CodeEditorWidget } from "../codeEditor/codeEditorWidget.js";
import { AccessibleDiffViewer, AccessibleDiffViewerModelFromEditors } from "./components/accessibleDiffViewer.js";
import { DiffEditorDecorations } from "./components/diffEditorDecorations.js";
import { DiffEditorEditors } from "./components/diffEditorEditors.js";
import { DiffEditorSash, SashLayout } from "./components/diffEditorSash.js";
import { DiffEditorViewZones } from "./components/diffEditorViewZones/diffEditorViewZones.js";
import { DelegatingEditor } from "./delegatingEditorImpl.js";
import { DiffEditorOptions } from "./diffEditorOptions.js";
import { DiffEditorViewModel } from "./diffEditorViewModel.js";
import { DiffEditorGutter } from "./features/gutterFeature.js";
import { HideUnchangedRegionsFeature } from "./features/hideUnchangedRegionsFeature.js";
import { MovedBlocksLinesFeature } from "./features/movedBlocksLinesFeature.js";
import { OverviewRulerFeature } from "./features/overviewRulerFeature.js";
import { RevertButtonsFeature } from "./features/revertButtonsFeature.js";
import "./style.css";
import { ObservableElementSizeObserver, RefCounted, applyStyle, applyViewZones, translatePosition } from "./utils.js";
let DiffEditorWidget = class extends DelegatingEditor {
  constructor(_domElement, options, codeEditorWidgetOptions, _parentContextKeyService, _parentInstantiationService, _codeEditorService, _accessibilitySignalService, _editorProgressService) {
    super();
    this._domElement = _domElement;
    this._parentContextKeyService = _parentContextKeyService;
    this._parentInstantiationService = _parentInstantiationService;
    this._codeEditorService = _codeEditorService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._editorProgressService = _editorProgressService;
    this.elements = h("div.monaco-diff-editor.side-by-side", { style: { position: "relative", height: "100%" } }, [
      h("div.editor.original@original", { style: { position: "absolute", height: "100%" } }),
      h("div.editor.modified@modified", { style: { position: "absolute", height: "100%" } }),
      h("div.accessibleDiffViewer@accessibleDiffViewer", { style: { position: "absolute", height: "100%" } })
    ]);
    this._diffModelSrc = this._register(disposableObservableValue(this, void 0));
    this._diffModel = derived(this, (reader) => this._diffModelSrc.read(reader)?.object);
    this.allUnchangedRegionsShown = derived(this, (reader) => {
      const regions = this._diffModel.read(reader)?.unchangedRegions.read(reader) ?? [];
      return regions.every((r) => r.visibleLineCountTop.read(reader) + r.visibleLineCountBottom.read(reader) >= r.lineCount);
    });
    this.onDidChangeModel = Event.fromObservableLight(this._diffModel);
    this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._domElement));
    this._instantiationService = this._register(this._parentInstantiationService.createChild(
      new ServiceCollection([IContextKeyService, this._contextKeyService])
    ));
    this._boundarySashes = observableValue(this, void 0);
    this._accessibleDiffViewerShouldBeVisible = observableValue(this, false);
    this._accessibleDiffViewerVisible = derived(
      this,
      (reader) => this._options.onlyShowAccessibleDiffViewer.read(reader) ? true : this._accessibleDiffViewerShouldBeVisible.read(reader)
    );
    this._movedBlocksLinesPart = observableValue(this, void 0);
    this._layoutInfo = derived(this, (reader) => {
      const fullWidth = this._rootSizeObserver.width.read(reader);
      const fullHeight = this._rootSizeObserver.height.read(reader);
      if (this._rootSizeObserver.automaticLayout) {
        this.elements.root.style.height = "100%";
      } else {
        this.elements.root.style.height = fullHeight + "px";
      }
      const sash = this._sash.read(reader);
      const gutter = this._gutter.read(reader);
      const gutterWidth = gutter?.width.read(reader) ?? 0;
      const overviewRulerPartWidth = this._overviewRulerPart.read(reader)?.width ?? 0;
      let originalLeft, originalWidth, modifiedLeft, modifiedWidth, gutterLeft;
      const sideBySide = !!sash;
      if (sideBySide) {
        const sashLeft = sash.sashLeft.read(reader);
        const movedBlocksLinesWidth = this._movedBlocksLinesPart.read(reader)?.width.read(reader) ?? 0;
        originalLeft = 0;
        originalWidth = sashLeft - gutterWidth - movedBlocksLinesWidth;
        gutterLeft = sashLeft - gutterWidth;
        modifiedLeft = sashLeft;
        modifiedWidth = fullWidth - modifiedLeft - overviewRulerPartWidth;
      } else {
        gutterLeft = 0;
        const shouldHideOriginalLineNumbers = this._options.inlineViewHideOriginalLineNumbers.read(reader);
        originalLeft = gutterWidth;
        if (shouldHideOriginalLineNumbers) {
          originalWidth = 0;
        } else {
          originalWidth = Math.max(5, this._editors.originalObs.layoutInfoDecorationsLeft.read(reader));
        }
        modifiedLeft = gutterWidth + originalWidth;
        modifiedWidth = fullWidth - modifiedLeft - overviewRulerPartWidth;
      }
      this.elements.original.style.left = originalLeft + "px";
      this.elements.original.style.width = originalWidth + "px";
      this._editors.original.layout({ width: originalWidth, height: fullHeight }, true);
      gutter?.layout(gutterLeft);
      this.elements.modified.style.left = modifiedLeft + "px";
      this.elements.modified.style.width = modifiedWidth + "px";
      this._editors.modified.layout({ width: modifiedWidth, height: fullHeight }, true);
      return {
        modifiedEditor: this._editors.modified.getLayoutInfo(),
        originalEditor: this._editors.original.getLayoutInfo()
      };
    });
    this._diffValue = this._diffModel.map((m, r) => m?.diff.read(r));
    this.onDidUpdateDiff = Event.fromObservableLight(this._diffValue);
    this._codeEditorService.willCreateDiffEditor();
    this._contextKeyService.createKey("isInDiffEditor", true);
    this._domElement.appendChild(this.elements.root);
    this._register(toDisposable(() => this.elements.root.remove()));
    this._rootSizeObserver = this._register(new ObservableElementSizeObserver(this.elements.root, options.dimension));
    this._rootSizeObserver.setAutomaticLayout(options.automaticLayout ?? false);
    this._options = this._instantiationService.createInstance(DiffEditorOptions, options);
    this._register(autorun((reader) => {
      this._options.setWidth(this._rootSizeObserver.width.read(reader));
    }));
    this._contextKeyService.createKey(EditorContextKeys.isEmbeddedDiffEditor.key, false);
    this._register(bindContextKey(
      EditorContextKeys.isEmbeddedDiffEditor,
      this._contextKeyService,
      (reader) => this._options.isInEmbeddedEditor.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.comparingMovedCode,
      this._contextKeyService,
      (reader) => !!this._diffModel.read(reader)?.movedTextToCompare.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached,
      this._contextKeyService,
      (reader) => this._options.couldShowInlineViewBecauseOfSize.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorInlineMode,
      this._contextKeyService,
      (reader) => !this._options.renderSideBySide.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.hasChanges,
      this._contextKeyService,
      (reader) => (this._diffModel.read(reader)?.diff.read(reader)?.mappings.length ?? 0) > 0
    ));
    this._editors = this._register(this._instantiationService.createInstance(
      DiffEditorEditors,
      this.elements.original,
      this.elements.modified,
      this._options,
      codeEditorWidgetOptions,
      (i, c, o, o2) => this._createInnerEditor(i, c, o, o2)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorOriginalWritable,
      this._contextKeyService,
      (reader) => this._options.originalEditable.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorModifiedWritable,
      this._contextKeyService,
      (reader) => !this._options.readOnly.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorOriginalUri,
      this._contextKeyService,
      (reader) => this._diffModel.read(reader)?.model.original.uri.toString() ?? ""
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorModifiedUri,
      this._contextKeyService,
      (reader) => this._diffModel.read(reader)?.model.modified.uri.toString() ?? ""
    ));
    this._overviewRulerPart = derivedDisposable(
      this,
      (reader) => !this._options.renderOverviewRuler.read(reader) ? void 0 : this._instantiationService.createInstance(
        readHotReloadableExport(OverviewRulerFeature, reader),
        this._editors,
        this.elements.root,
        this._diffModel,
        this._rootSizeObserver.width,
        this._rootSizeObserver.height,
        this._layoutInfo.map((i) => i.modifiedEditor)
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const dimensions = {
      height: this._rootSizeObserver.height,
      width: this._rootSizeObserver.width.map((w, reader) => w - (this._overviewRulerPart.read(reader)?.width ?? 0))
    };
    this._sashLayout = new SashLayout(this._options, dimensions);
    this._sash = derivedDisposable(this, (reader) => {
      const showSash = this._options.renderSideBySide.read(reader);
      this.elements.root.classList.toggle("side-by-side", showSash);
      return !showSash ? void 0 : new DiffEditorSash(
        this.elements.root,
        dimensions,
        this._options.enableSplitViewResizing,
        this._boundarySashes,
        this._sashLayout.sashLeft,
        () => this._sashLayout.resetSash()
      );
    }).recomputeInitiallyAndOnChange(this._store);
    const unchangedRangesFeature = derivedDisposable(
      this,
      (reader) => (
        /** @description UnchangedRangesFeature */
        this._instantiationService.createInstance(
          readHotReloadableExport(HideUnchangedRegionsFeature, reader),
          this._editors,
          this._diffModel,
          this._options
        )
      )
    ).recomputeInitiallyAndOnChange(this._store);
    derivedDisposable(
      this,
      (reader) => (
        /** @description DiffEditorDecorations */
        this._instantiationService.createInstance(
          readHotReloadableExport(DiffEditorDecorations, reader),
          this._editors,
          this._diffModel,
          this._options,
          this
        )
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const origViewZoneIdsToIgnore = /* @__PURE__ */ new Set();
    const modViewZoneIdsToIgnore = /* @__PURE__ */ new Set();
    let isUpdatingViewZones = false;
    const viewZoneManager = derivedDisposable(
      this,
      (reader) => (
        /** @description ViewZoneManager */
        this._instantiationService.createInstance(
          readHotReloadableExport(DiffEditorViewZones, reader),
          getWindow(this._domElement),
          this._editors,
          this._diffModel,
          this._options,
          this,
          () => isUpdatingViewZones || unchangedRangesFeature.read(void 0).isUpdatingHiddenAreas,
          origViewZoneIdsToIgnore,
          modViewZoneIdsToIgnore
        )
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const originalViewZones = derived(this, (reader) => {
      const orig = viewZoneManager.read(reader).viewZones.read(reader).orig;
      const orig2 = unchangedRangesFeature.read(reader).viewZones.read(reader).origViewZones;
      return orig.concat(orig2);
    });
    const modifiedViewZones = derived(this, (reader) => {
      const mod = viewZoneManager.read(reader).viewZones.read(reader).mod;
      const mod2 = unchangedRangesFeature.read(reader).viewZones.read(reader).modViewZones;
      return mod.concat(mod2);
    });
    this._register(applyViewZones(this._editors.original, originalViewZones, (isUpdatingOrigViewZones) => {
      isUpdatingViewZones = isUpdatingOrigViewZones;
    }, origViewZoneIdsToIgnore));
    let scrollState;
    this._register(applyViewZones(this._editors.modified, modifiedViewZones, (isUpdatingModViewZones) => {
      isUpdatingViewZones = isUpdatingModViewZones;
      if (isUpdatingViewZones) {
        scrollState = StableEditorScrollState.capture(this._editors.modified);
      } else {
        scrollState?.restore(this._editors.modified);
        scrollState = void 0;
      }
    }, modViewZoneIdsToIgnore));
    this._accessibleDiffViewer = derivedDisposable(
      this,
      (reader) => this._instantiationService.createInstance(
        readHotReloadableExport(AccessibleDiffViewer, reader),
        this.elements.accessibleDiffViewer,
        this._accessibleDiffViewerVisible,
        (visible, tx) => this._accessibleDiffViewerShouldBeVisible.set(visible, tx),
        this._options.onlyShowAccessibleDiffViewer.map((v) => !v),
        this._rootSizeObserver.width,
        this._rootSizeObserver.height,
        this._diffModel.map((m, r) => m?.diff.read(r)?.mappings.map((m2) => m2.lineRangeMapping)),
        new AccessibleDiffViewerModelFromEditors(this._editors)
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const visibility = this._accessibleDiffViewerVisible.map((v) => v ? "hidden" : "visible");
    this._register(applyStyle(this.elements.modified, { visibility }));
    this._register(applyStyle(this.elements.original, { visibility }));
    this._createDiffEditorContributions();
    this._codeEditorService.addDiffEditor(this);
    this._register(toDisposable(() => {
      this._codeEditorService.removeDiffEditor(this);
    }));
    this._gutter = derivedDisposable(this, (reader) => {
      return this._options.shouldRenderGutterMenu.read(reader) ? this._instantiationService.createInstance(
        readHotReloadableExport(DiffEditorGutter, reader),
        this.elements.root,
        this._diffModel,
        this._editors,
        this._options,
        this._sashLayout,
        this._boundarySashes
      ) : void 0;
    });
    this._register(recomputeInitiallyAndOnChange(this._layoutInfo));
    derivedDisposable(
      this,
      (reader) => (
        /** @description MovedBlocksLinesPart */
        new (readHotReloadableExport(MovedBlocksLinesFeature, reader))(
          this.elements.root,
          this._diffModel,
          this._layoutInfo.map((i) => i.originalEditor),
          this._layoutInfo.map((i) => i.modifiedEditor),
          this._editors
        )
      )
    ).recomputeInitiallyAndOnChange(this._store, (value) => {
      this._movedBlocksLinesPart.set(value, void 0);
    });
    this._register(Event.runAndSubscribe(this._editors.modified.onDidChangeCursorPosition, (e) => this._handleCursorPositionChange(e, true)));
    this._register(Event.runAndSubscribe(this._editors.original.onDidChangeCursorPosition, (e) => this._handleCursorPositionChange(e, false)));
    const isInitializingDiff = this._diffModel.map(this, (m, reader) => {
      if (!m) {
        return void 0;
      }
      return m.diff.read(reader) === void 0 && !m.isDiffUpToDate.read(reader);
    });
    this._register(autorunWithStore((reader, store) => {
      if (isInitializingDiff.read(reader) === true) {
        const r = this._editorProgressService.show(true, 1e3);
        store.add(toDisposable(() => r.done()));
      }
    }));
    this._register(autorunWithStore((reader, store) => {
      store.add(new (readHotReloadableExport(RevertButtonsFeature, reader))(this._editors, this._diffModel, this._options, this));
    }));
    this._register(autorunWithStore((reader, store) => {
      const model = this._diffModel.read(reader);
      if (!model) {
        return;
      }
      for (const m of [model.model.original, model.model.modified]) {
        store.add(m.onWillDispose((e) => {
          onUnexpectedError(new BugIndicatingError("TextModel got disposed before DiffEditorWidget model got reset"));
          this.setModel(null);
        }));
      }
    }));
    this._register(autorun((reader) => {
      this._options.setModel(this._diffModel.read(reader));
    }));
  }
  get onDidContentSizeChange() {
    return this._editors.onDidContentSizeChange;
  }
  get collapseUnchangedRegions() {
    return this._options.hideUnchangedRegions.get();
  }
  getViewWidth() {
    return this._rootSizeObserver.width.get();
  }
  getContentHeight() {
    return this._editors.modified.getContentHeight();
  }
  _createInnerEditor(instantiationService, container, options, editorWidgetOptions) {
    const editor = instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);
    return editor;
  }
  _createDiffEditorContributions() {
    const contributions = EditorExtensionsRegistry.getDiffEditorContributions();
    for (const desc of contributions) {
      try {
        this._register(this._instantiationService.createInstance(desc.ctor, this));
      } catch (err) {
        onUnexpectedError(err);
      }
    }
  }
  get _targetEditor() {
    return this._editors.modified;
  }
  getEditorType() {
    return EditorType.IDiffEditor;
  }
  onVisible() {
    this._editors.original.onVisible();
    this._editors.modified.onVisible();
  }
  onHide() {
    this._editors.original.onHide();
    this._editors.modified.onHide();
  }
  layout(dimension) {
    this._rootSizeObserver.observe(dimension);
  }
  hasTextFocus() {
    return this._editors.original.hasTextFocus() || this._editors.modified.hasTextFocus();
  }
  saveViewState() {
    const originalViewState = this._editors.original.saveViewState();
    const modifiedViewState = this._editors.modified.saveViewState();
    return {
      original: originalViewState,
      modified: modifiedViewState,
      modelState: this._diffModel.get()?.serializeState()
    };
  }
  restoreViewState(s) {
    if (s && s.original && s.modified) {
      const diffEditorState = s;
      this._editors.original.restoreViewState(diffEditorState.original);
      this._editors.modified.restoreViewState(diffEditorState.modified);
      if (diffEditorState.modelState) {
        this._diffModel.get()?.restoreSerializedState(diffEditorState.modelState);
      }
    }
  }
  handleInitialized() {
    this._editors.original.handleInitialized();
    this._editors.modified.handleInitialized();
  }
  createViewModel(model) {
    return this._instantiationService.createInstance(DiffEditorViewModel, model, this._options);
  }
  getModel() {
    return this._diffModel.get()?.model ?? null;
  }
  setModel(model) {
    const vm = !model ? null : "model" in model ? RefCounted.create(model).createNewRef(this) : RefCounted.create(this.createViewModel(model), this);
    this.setDiffModel(vm);
  }
  setDiffModel(viewModel, tx) {
    const currentModel = this._diffModel.get();
    if (!viewModel && currentModel) {
      this._accessibleDiffViewer.get().close();
    }
    if (this._diffModel.get() !== viewModel?.object) {
      subtransaction(tx, (tx2) => {
        const vm = viewModel?.object;
        observableFromEvent.batchEventsGlobally(tx2, () => {
          this._editors.original.setModel(vm ? vm.model.original : null);
          this._editors.modified.setModel(vm ? vm.model.modified : null);
        });
        const prevValueRef = this._diffModelSrc.get()?.createNewRef(this);
        this._diffModelSrc.set(viewModel?.createNewRef(this), tx2);
        setTimeout(() => {
          prevValueRef?.dispose();
        }, 0);
      });
    }
  }
  /**
   * @param changedOptions Only has values for top-level options that have actually changed.
   */
  updateOptions(changedOptions) {
    this._options.updateOptions(changedOptions);
  }
  getDomNode() {
    return this.elements.root;
  }
  getContainerDomNode() {
    return this._domElement;
  }
  getOriginalEditor() {
    return this._editors.original;
  }
  getModifiedEditor() {
    return this._editors.modified;
  }
  setBoundarySashes(sashes) {
    this._boundarySashes.set(sashes, void 0);
  }
  get ignoreTrimWhitespace() {
    return this._options.ignoreTrimWhitespace.get();
  }
  get maxComputationTime() {
    return this._options.maxComputationTimeMs.get();
  }
  get renderSideBySide() {
    return this._options.renderSideBySide.get();
  }
  /**
   * @deprecated Use `this.getDiffComputationResult().changes2` instead.
   */
  getLineChanges() {
    const diffState = this._diffModel.get()?.diff.get();
    if (!diffState) {
      return null;
    }
    return toLineChanges(diffState);
  }
  getDiffComputationResult() {
    const diffState = this._diffModel.get()?.diff.get();
    if (!diffState) {
      return null;
    }
    return {
      changes: this.getLineChanges(),
      changes2: diffState.mappings.map((m) => m.lineRangeMapping),
      identical: diffState.identical,
      quitEarly: diffState.quitEarly
    };
  }
  revert(diff) {
    const model = this._diffModel.get();
    if (!model || !model.isDiffUpToDate.get()) {
      return;
    }
    this._editors.modified.pushUndoStop();
    this._editors.modified.executeEdits("diffEditor", [
      {
        range: diff.modified.toExclusiveRange(),
        text: model.model.original.getValueInRange(diff.original.toExclusiveRange())
      }
    ]);
    this._editors.modified.pushUndoStop();
  }
  revertRangeMappings(diffs) {
    const model = this._diffModel.get();
    if (!model || !model.isDiffUpToDate.get()) {
      return;
    }
    const changes = diffs.map((c) => ({
      range: c.modifiedRange,
      text: model.model.original.getValueInRange(c.originalRange)
    }));
    this._editors.modified.pushUndoStop();
    this._editors.modified.executeEdits("diffEditor", changes);
    this._editors.modified.pushUndoStop();
  }
  revertFocusedRangeMappings() {
    const model = this._diffModel.get();
    if (!model || !model.isDiffUpToDate.get()) {
      return;
    }
    const diffs = this._diffModel.get()?.diff.get()?.mappings;
    if (!diffs || diffs.length === 0) {
      return;
    }
    const modifiedEditor = this._editors.modified;
    if (!modifiedEditor.hasTextFocus()) {
      return;
    }
    const curLineNumber = modifiedEditor.getPosition().lineNumber;
    const selection = modifiedEditor.getSelection();
    const selectedRange = LineRange.fromRange(selection || new Range(curLineNumber, 0, curLineNumber, 0));
    const diffsToRevert = diffs.filter((d) => {
      return d.lineRangeMapping.modified.intersect(selectedRange);
    });
    modifiedEditor.pushUndoStop();
    modifiedEditor.executeEdits("diffEditor", diffsToRevert.map((d) => ({
      range: d.lineRangeMapping.modified.toExclusiveRange(),
      text: model.model.original.getValueInRange(d.lineRangeMapping.original.toExclusiveRange())
    })));
    modifiedEditor.pushUndoStop();
  }
  _goTo(diff) {
    this._editors.modified.setPosition(new Position(diff.lineRangeMapping.modified.startLineNumber, 1));
    this._editors.modified.revealRangeInCenter(diff.lineRangeMapping.modified.toExclusiveRange());
  }
  goToDiff(target) {
    const diffs = this._diffModel.get()?.diff.get()?.mappings;
    if (!diffs || diffs.length === 0) {
      return;
    }
    const curLineNumber = this._editors.modified.getPosition().lineNumber;
    let diff;
    if (target === "next") {
      const modifiedLineCount = this._editors.modified.getModel().getLineCount();
      if (modifiedLineCount === curLineNumber) {
        diff = diffs[0];
      } else {
        diff = diffs.find((d) => d.lineRangeMapping.modified.startLineNumber > curLineNumber) ?? diffs[0];
      }
    } else {
      diff = findLast(diffs, (d) => d.lineRangeMapping.modified.startLineNumber < curLineNumber) ?? diffs[diffs.length - 1];
    }
    this._goTo(diff);
    if (diff.lineRangeMapping.modified.isEmpty) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { source: "diffEditor.goToDiff" });
    } else if (diff.lineRangeMapping.original.isEmpty) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { source: "diffEditor.goToDiff" });
    } else if (diff) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { source: "diffEditor.goToDiff" });
    }
  }
  revealFirstDiff() {
    const diffModel = this._diffModel.get();
    if (!diffModel) {
      return;
    }
    this.waitForDiff().then(() => {
      const diffs = diffModel.diff.get()?.mappings;
      if (!diffs || diffs.length === 0) {
        return;
      }
      this._goTo(diffs[0]);
    });
  }
  accessibleDiffViewerNext() {
    this._accessibleDiffViewer.get().next();
  }
  accessibleDiffViewerPrev() {
    this._accessibleDiffViewer.get().prev();
  }
  async waitForDiff() {
    const diffModel = this._diffModel.get();
    if (!diffModel) {
      return;
    }
    await diffModel.waitForDiff();
  }
  mapToOtherSide() {
    const isModifiedFocus = this._editors.modified.hasWidgetFocus();
    const source = isModifiedFocus ? this._editors.modified : this._editors.original;
    const destination = isModifiedFocus ? this._editors.original : this._editors.modified;
    let destinationSelection;
    const sourceSelection = source.getSelection();
    if (sourceSelection) {
      const mappings = this._diffModel.get()?.diff.get()?.mappings.map((m) => isModifiedFocus ? m.lineRangeMapping.flip() : m.lineRangeMapping);
      if (mappings) {
        const newRange1 = translatePosition(sourceSelection.getStartPosition(), mappings);
        const newRange2 = translatePosition(sourceSelection.getEndPosition(), mappings);
        destinationSelection = Range.plusRange(newRange1, newRange2);
      }
    }
    return { destination, destinationSelection };
  }
  switchSide() {
    const { destination, destinationSelection } = this.mapToOtherSide();
    destination.focus();
    if (destinationSelection) {
      destination.setSelection(destinationSelection);
    }
  }
  exitCompareMove() {
    const model = this._diffModel.get();
    if (!model) {
      return;
    }
    model.movedTextToCompare.set(void 0, void 0);
  }
  collapseAllUnchangedRegions() {
    const unchangedRegions = this._diffModel.get()?.unchangedRegions.get();
    if (!unchangedRegions) {
      return;
    }
    transaction((tx) => {
      for (const region of unchangedRegions) {
        region.collapseAll(tx);
      }
    });
  }
  showAllUnchangedRegions() {
    const unchangedRegions = this._diffModel.get()?.unchangedRegions.get();
    if (!unchangedRegions) {
      return;
    }
    transaction((tx) => {
      for (const region of unchangedRegions) {
        region.showAll(tx);
      }
    });
  }
  _handleCursorPositionChange(e, isModifiedEditor) {
    if (e?.reason === CursorChangeReason.Explicit) {
      const diff = this._diffModel.get()?.diff.get()?.mappings.find((m) => isModifiedEditor ? m.lineRangeMapping.modified.contains(e.position.lineNumber) : m.lineRangeMapping.original.contains(e.position.lineNumber));
      if (diff?.lineRangeMapping.modified.isEmpty) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { source: "diffEditor.cursorPositionChanged" });
      } else if (diff?.lineRangeMapping.original.isEmpty) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { source: "diffEditor.cursorPositionChanged" });
      } else if (diff) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { source: "diffEditor.cursorPositionChanged" });
      }
    }
  }
};
DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH = OverviewRulerFeature.ENTIRE_DIFF_OVERVIEW_WIDTH;
DiffEditorWidget = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICodeEditorService),
  __decorateParam(6, IAccessibilitySignalService),
  __decorateParam(7, IEditorProgressService)
], DiffEditorWidget);
function toLineChanges(state) {
  return state.mappings.map((x) => {
    const m = x.lineRangeMapping;
    let originalStartLineNumber;
    let originalEndLineNumber;
    let modifiedStartLineNumber;
    let modifiedEndLineNumber;
    let innerChanges = m.innerChanges;
    if (m.original.isEmpty) {
      originalStartLineNumber = m.original.startLineNumber - 1;
      originalEndLineNumber = 0;
      innerChanges = void 0;
    } else {
      originalStartLineNumber = m.original.startLineNumber;
      originalEndLineNumber = m.original.endLineNumberExclusive - 1;
    }
    if (m.modified.isEmpty) {
      modifiedStartLineNumber = m.modified.startLineNumber - 1;
      modifiedEndLineNumber = 0;
      innerChanges = void 0;
    } else {
      modifiedStartLineNumber = m.modified.startLineNumber;
      modifiedEndLineNumber = m.modified.endLineNumberExclusive - 1;
    }
    return {
      originalStartLineNumber,
      originalEndLineNumber,
      modifiedStartLineNumber,
      modifiedEndLineNumber,
      charChanges: innerChanges?.map((m2) => ({
        originalStartLineNumber: m2.originalRange.startLineNumber,
        originalStartColumn: m2.originalRange.startColumn,
        originalEndLineNumber: m2.originalRange.endLineNumber,
        originalEndColumn: m2.originalRange.endColumn,
        modifiedStartLineNumber: m2.modifiedRange.startLineNumber,
        modifiedStartColumn: m2.modifiedRange.startColumn,
        modifiedEndLineNumber: m2.modifiedRange.endLineNumber,
        modifiedEndColumn: m2.modifiedRange.endColumn
      }))
    };
  });
}
export {
  DiffEditorWidget,
  toLineChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcZGlmZkVkaXRvcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBnZXRXaW5kb3csIGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgZmluZExhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyByZWFkSG90UmVsb2FkYWJsZUV4cG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hvdFJlbG9hZEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIGF1dG9ydW4sIGF1dG9ydW5XaXRoU3RvcmUsIGRlcml2ZWQsIGRlcml2ZWREaXNwb3NhYmxlLCBkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlLCBzdWJ0cmFuc2FjdGlvbiwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS8yZC9kaW1lbnNpb24uanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uLCBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0YXRpb25SZXN1bHQsIElMaW5lQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlTWFwcGluZywgUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IEVkaXRvclR5cGUsIElEaWZmRWRpdG9yTW9kZWwsIElEaWZmRWRpdG9yVmlld01vZGVsLCBJRGlmZkVkaXRvclZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElEaWZmRWRpdG9yLCBJRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSwgSURpZmZFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUgfSBmcm9tICcuLi8uLi9zdGFibGVFZGl0b3JTY3JvbGwuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCwgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVEaWZmVmlld2VyLCBBY2Nlc3NpYmxlRGlmZlZpZXdlck1vZGVsRnJvbUVkaXRvcnMgfSBmcm9tICcuL2NvbXBvbmVudHMvYWNjZXNzaWJsZURpZmZWaWV3ZXIuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckRlY29yYXRpb25zIH0gZnJvbSAnLi9jb21wb25lbnRzL2RpZmZFZGl0b3JEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yRWRpdG9ycyB9IGZyb20gJy4vY29tcG9uZW50cy9kaWZmRWRpdG9yRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yU2FzaCwgU2FzaExheW91dCB9IGZyb20gJy4vY29tcG9uZW50cy9kaWZmRWRpdG9yU2FzaC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yVmlld1pvbmVzIH0gZnJvbSAnLi9jb21wb25lbnRzL2RpZmZFZGl0b3JWaWV3Wm9uZXMvZGlmZkVkaXRvclZpZXdab25lcy5qcyc7XG5pbXBvcnQgeyBEZWxlZ2F0aW5nRWRpdG9yIH0gZnJvbSAnLi9kZWxlZ2F0aW5nRWRpdG9ySW1wbC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vZGlmZkVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclZpZXdNb2RlbCwgRGlmZk1hcHBpbmcsIERpZmZTdGF0ZSB9IGZyb20gJy4vZGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yR3V0dGVyIH0gZnJvbSAnLi9mZWF0dXJlcy9ndXR0ZXJGZWF0dXJlLmpzJztcbmltcG9ydCB7IEhpZGVVbmNoYW5nZWRSZWdpb25zRmVhdHVyZSB9IGZyb20gJy4vZmVhdHVyZXMvaGlkZVVuY2hhbmdlZFJlZ2lvbnNGZWF0dXJlLmpzJztcbmltcG9ydCB7IE1vdmVkQmxvY2tzTGluZXNGZWF0dXJlIH0gZnJvbSAnLi9mZWF0dXJlcy9tb3ZlZEJsb2Nrc0xpbmVzRmVhdHVyZS5qcyc7XG5pbXBvcnQgeyBPdmVydmlld1J1bGVyRmVhdHVyZSB9IGZyb20gJy4vZmVhdHVyZXMvb3ZlcnZpZXdSdWxlckZlYXR1cmUuanMnO1xuaW1wb3J0IHsgUmV2ZXJ0QnV0dG9uc0ZlYXR1cmUgfSBmcm9tICcuL2ZlYXR1cmVzL3JldmVydEJ1dHRvbnNGZWF0dXJlLmpzJztcbmltcG9ydCAnLi9zdHlsZS5jc3MnO1xuaW1wb3J0IHsgQ1NTU3R5bGUsIE9ic2VydmFibGVFbGVtZW50U2l6ZU9ic2VydmVyLCBSZWZDb3VudGVkLCBhcHBseVN0eWxlLCBhcHBseVZpZXdab25lcywgdHJhbnNsYXRlUG9zaXRpb24gfSBmcm9tICcuL3V0aWxzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRGlmZkNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIHtcblx0b3JpZ2luYWxFZGl0b3I/OiBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnM7XG5cdG1vZGlmaWVkRWRpdG9yPzogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgRGlmZkVkaXRvcldpZGdldCBleHRlbmRzIERlbGVnYXRpbmdFZGl0b3IgaW1wbGVtZW50cyBJRGlmZkVkaXRvciB7XG5cdHB1YmxpYyBzdGF0aWMgRU5USVJFX0RJRkZfT1ZFUlZJRVdfV0lEVEggPSBPdmVydmlld1J1bGVyRmVhdHVyZS5FTlRJUkVfRElGRl9PVkVSVklFV19XSURUSDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnRzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmTW9kZWxTcmM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZNb2RlbDtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWw7XG5cblx0cHVibGljIGdldCBvbkRpZENvbnRlbnRTaXplQ2hhbmdlKCkgeyByZXR1cm4gdGhpcy5fZWRpdG9ycy5vbkRpZENvbnRlbnRTaXplQ2hhbmdlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290U2l6ZU9ic2VydmVyOiBPYnNlcnZhYmxlRWxlbWVudFNpemVPYnNlcnZlcjtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nhc2hMYXlvdXQ6IFNhc2hMYXlvdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nhc2g6IElPYnNlcnZhYmxlPERpZmZFZGl0b3JTYXNoIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYm91bmRhcnlTYXNoZXM7XG5cblx0cHJpdmF0ZSBfYWNjZXNzaWJsZURpZmZWaWV3ZXJTaG91bGRCZVZpc2libGU7XG5cdHByaXZhdGUgX2FjY2Vzc2libGVEaWZmVmlld2VyVmlzaWJsZTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJsZURpZmZWaWV3ZXI6IElPYnNlcnZhYmxlPEFjY2Vzc2libGVEaWZmVmlld2VyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogRGlmZkVkaXRvck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcnM6IERpZmZFZGl0b3JFZGl0b3JzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJ2aWV3UnVsZXJQYXJ0OiBJT2JzZXJ2YWJsZTxPdmVydmlld1J1bGVyRmVhdHVyZSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vdmVkQmxvY2tzTGluZXNQYXJ0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2d1dHRlcjogSU9ic2VydmFibGU8RGlmZkVkaXRvckd1dHRlciB8IHVuZGVmaW5lZD47XG5cblx0cHVibGljIGdldCBjb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnMoKSB7IHJldHVybiB0aGlzLl9vcHRpb25zLmhpZGVVbmNoYW5nZWRSZWdpb25zLmdldCgpOyB9XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGVuIGV2ZXJ5IGhpZGRlbi11bmNoYW5nZWQgcmVnaW9uIG9mIHRoZSBjdXJyZW50IGRpZmYgaXMgZnVsbHlcblx0ICogcmV2ZWFsZWQgKG9yIHRoZXJlIGFyZSBub25lKS4gUmVhZCBieSBgRGlmZkVkaXRvckl0ZW1UZW1wbGF0ZWAgdG8gZHJpdmUgdGhlXG5cdCAqIG11bHRpLWRpZmYgcGVyLWZpbGUgZXhwYW5kL2NvbGxhcHNlIHRvZ2dsZS4gTm90IGV4dGVybmFsIEFQSS5cblx0ICogQGludGVybmFsXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgYWxsVW5jaGFuZ2VkUmVnaW9uc1Nob3duOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb21FbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBSZWFkb25seTxJRGlmZkVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnM+LFxuXHRcdGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zOiBJRGlmZkNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUVkaXRvclByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50cyA9IGgoJ2Rpdi5tb25hY28tZGlmZi1lZGl0b3Iuc2lkZS1ieS1zaWRlJywgeyBzdHlsZTogeyBwb3NpdGlvbjogJ3JlbGF0aXZlJywgaGVpZ2h0OiAnMTAwJScgfSB9LCBbXG5cdFx0XHRoKCdkaXYuZWRpdG9yLm9yaWdpbmFsQG9yaWdpbmFsJywgeyBzdHlsZTogeyBwb3NpdGlvbjogJ2Fic29sdXRlJywgaGVpZ2h0OiAnMTAwJScsIH0gfSksXG5cdFx0XHRoKCdkaXYuZWRpdG9yLm1vZGlmaWVkQG1vZGlmaWVkJywgeyBzdHlsZTogeyBwb3NpdGlvbjogJ2Fic29sdXRlJywgaGVpZ2h0OiAnMTAwJScsIH0gfSksXG5cdFx0XHRoKCdkaXYuYWNjZXNzaWJsZURpZmZWaWV3ZXJAYWNjZXNzaWJsZURpZmZWaWV3ZXInLCB7IHN0eWxlOiB7IHBvc2l0aW9uOiAnYWJzb2x1dGUnLCBoZWlnaHQ6ICcxMDAlJyB9IH0pLFxuXHRcdF0pO1xuXHRcdHRoaXMuX2RpZmZNb2RlbFNyYyA9IHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVPYnNlcnZhYmxlVmFsdWU8UmVmQ291bnRlZDxEaWZmRWRpdG9yVmlld01vZGVsPiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKSk7XG5cdFx0dGhpcy5fZGlmZk1vZGVsID0gZGVyaXZlZDxEaWZmRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4gdGhpcy5fZGlmZk1vZGVsU3JjLnJlYWQocmVhZGVyKT8ub2JqZWN0KTtcblx0XHR0aGlzLmFsbFVuY2hhbmdlZFJlZ2lvbnNTaG93biA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlZ2lvbnMgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy51bmNoYW5nZWRSZWdpb25zLnJlYWQocmVhZGVyKSA/PyBbXTtcblx0XHRcdHJldHVybiByZWdpb25zLmV2ZXJ5KHIgPT4gci52aXNpYmxlTGluZUNvdW50VG9wLnJlYWQocmVhZGVyKSArIHIudmlzaWJsZUxpbmVDb3VudEJvdHRvbS5yZWFkKHJlYWRlcikgPj0gci5saW5lQ291bnQpO1xuXHRcdH0pO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VNb2RlbCA9IEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHQodGhpcy5fZGlmZk1vZGVsKTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLl9kb21FbGVtZW50KSk7XG5cdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9wYXJlbnRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChcblx0XHRcdG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZV0pXG5cdFx0KSk7XG5cdFx0dGhpcy5fYm91bmRhcnlTYXNoZXMgPSBvYnNlcnZhYmxlVmFsdWU8SUJvdW5kYXJ5U2FzaGVzIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVEaWZmVmlld2VyU2hvdWxkQmVWaXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlclZpc2libGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PlxuXHRcdFx0dGhpcy5fb3B0aW9ucy5vbmx5U2hvd0FjY2Vzc2libGVEaWZmVmlld2VyLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQ/IHRydWVcblx0XHRcdFx0OiB0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlclNob3VsZEJlVmlzaWJsZS5yZWFkKHJlYWRlcilcblx0XHQpO1xuXHRcdHRoaXMuX21vdmVkQmxvY2tzTGluZXNQYXJ0ID0gb2JzZXJ2YWJsZVZhbHVlPE1vdmVkQmxvY2tzTGluZXNGZWF0dXJlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2xheW91dEluZm8gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBmdWxsV2lkdGggPSB0aGlzLl9yb290U2l6ZU9ic2VydmVyLndpZHRoLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGZ1bGxIZWlnaHQgPSB0aGlzLl9yb290U2l6ZU9ic2VydmVyLmhlaWdodC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICh0aGlzLl9yb290U2l6ZU9ic2VydmVyLmF1dG9tYXRpY0xheW91dCkge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRzLnJvb3Quc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50cy5yb290LnN0eWxlLmhlaWdodCA9IGZ1bGxIZWlnaHQgKyAncHgnO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzYXNoID0gdGhpcy5fc2FzaC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGd1dHRlciA9IHRoaXMuX2d1dHRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBndXR0ZXJXaWR0aCA9IGd1dHRlcj8ud2lkdGgucmVhZChyZWFkZXIpID8/IDA7XG5cblx0XHRcdGNvbnN0IG92ZXJ2aWV3UnVsZXJQYXJ0V2lkdGggPSB0aGlzLl9vdmVydmlld1J1bGVyUGFydC5yZWFkKHJlYWRlcik/LndpZHRoID8/IDA7XG5cblx0XHRcdGxldCBvcmlnaW5hbExlZnQ6IG51bWJlciwgb3JpZ2luYWxXaWR0aDogbnVtYmVyLCBtb2RpZmllZExlZnQ6IG51bWJlciwgbW9kaWZpZWRXaWR0aDogbnVtYmVyLCBndXR0ZXJMZWZ0OiBudW1iZXI7XG5cblx0XHRcdGNvbnN0IHNpZGVCeVNpZGUgPSAhIXNhc2g7XG5cdFx0XHRpZiAoc2lkZUJ5U2lkZSkge1xuXHRcdFx0XHRjb25zdCBzYXNoTGVmdCA9IHNhc2guc2FzaExlZnQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBtb3ZlZEJsb2Nrc0xpbmVzV2lkdGggPSB0aGlzLl9tb3ZlZEJsb2Nrc0xpbmVzUGFydC5yZWFkKHJlYWRlcik/LndpZHRoLnJlYWQocmVhZGVyKSA/PyAwO1xuXG5cdFx0XHRcdG9yaWdpbmFsTGVmdCA9IDA7XG5cdFx0XHRcdG9yaWdpbmFsV2lkdGggPSBzYXNoTGVmdCAtIGd1dHRlcldpZHRoIC0gbW92ZWRCbG9ja3NMaW5lc1dpZHRoO1xuXG5cdFx0XHRcdGd1dHRlckxlZnQgPSBzYXNoTGVmdCAtIGd1dHRlcldpZHRoO1xuXG5cdFx0XHRcdG1vZGlmaWVkTGVmdCA9IHNhc2hMZWZ0O1xuXHRcdFx0XHRtb2RpZmllZFdpZHRoID0gZnVsbFdpZHRoIC0gbW9kaWZpZWRMZWZ0IC0gb3ZlcnZpZXdSdWxlclBhcnRXaWR0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGd1dHRlckxlZnQgPSAwO1xuXG5cdFx0XHRcdGNvbnN0IHNob3VsZEhpZGVPcmlnaW5hbExpbmVOdW1iZXJzID0gdGhpcy5fb3B0aW9ucy5pbmxpbmVWaWV3SGlkZU9yaWdpbmFsTGluZU51bWJlcnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRvcmlnaW5hbExlZnQgPSBndXR0ZXJXaWR0aDtcblx0XHRcdFx0aWYgKHNob3VsZEhpZGVPcmlnaW5hbExpbmVOdW1iZXJzKSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxXaWR0aCA9IDA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3JpZ2luYWxXaWR0aCA9IE1hdGgubWF4KDUsIHRoaXMuX2VkaXRvcnMub3JpZ2luYWxPYnMubGF5b3V0SW5mb0RlY29yYXRpb25zTGVmdC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bW9kaWZpZWRMZWZ0ID0gZ3V0dGVyV2lkdGggKyBvcmlnaW5hbFdpZHRoO1xuXHRcdFx0XHRtb2RpZmllZFdpZHRoID0gZnVsbFdpZHRoIC0gbW9kaWZpZWRMZWZ0IC0gb3ZlcnZpZXdSdWxlclBhcnRXaWR0aDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5lbGVtZW50cy5vcmlnaW5hbC5zdHlsZS5sZWZ0ID0gb3JpZ2luYWxMZWZ0ICsgJ3B4Jztcblx0XHRcdHRoaXMuZWxlbWVudHMub3JpZ2luYWwuc3R5bGUud2lkdGggPSBvcmlnaW5hbFdpZHRoICsgJ3B4Jztcblx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwubGF5b3V0KHsgd2lkdGg6IG9yaWdpbmFsV2lkdGgsIGhlaWdodDogZnVsbEhlaWdodCB9LCB0cnVlKTtcblxuXHRcdFx0Z3V0dGVyPy5sYXlvdXQoZ3V0dGVyTGVmdCk7XG5cblx0XHRcdHRoaXMuZWxlbWVudHMubW9kaWZpZWQuc3R5bGUubGVmdCA9IG1vZGlmaWVkTGVmdCArICdweCc7XG5cdFx0XHR0aGlzLmVsZW1lbnRzLm1vZGlmaWVkLnN0eWxlLndpZHRoID0gbW9kaWZpZWRXaWR0aCArICdweCc7XG5cdFx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmxheW91dCh7IHdpZHRoOiBtb2RpZmllZFdpZHRoLCBoZWlnaHQ6IGZ1bGxIZWlnaHQgfSwgdHJ1ZSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGlmaWVkRWRpdG9yOiB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmdldExheW91dEluZm8oKSxcblx0XHRcdFx0b3JpZ2luYWxFZGl0b3I6IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuZ2V0TGF5b3V0SW5mbygpLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9kaWZmVmFsdWUgPSB0aGlzLl9kaWZmTW9kZWwubWFwKChtLCByKSA9PiBtPy5kaWZmLnJlYWQocikpO1xuXHRcdHRoaXMub25EaWRVcGRhdGVEaWZmID0gRXZlbnQuZnJvbU9ic2VydmFibGVMaWdodCh0aGlzLl9kaWZmVmFsdWUpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLndpbGxDcmVhdGVEaWZmRWRpdG9yKCk7XG5cblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ2lzSW5EaWZmRWRpdG9yJywgdHJ1ZSk7XG5cblx0XHR0aGlzLl9kb21FbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudHMucm9vdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuZWxlbWVudHMucm9vdC5yZW1vdmUoKSkpO1xuXG5cdFx0dGhpcy5fcm9vdFNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPYnNlcnZhYmxlRWxlbWVudFNpemVPYnNlcnZlcih0aGlzLmVsZW1lbnRzLnJvb3QsIG9wdGlvbnMuZGltZW5zaW9uKSk7XG5cdFx0dGhpcy5fcm9vdFNpemVPYnNlcnZlci5zZXRBdXRvbWF0aWNMYXlvdXQob3B0aW9ucy5hdXRvbWF0aWNMYXlvdXQgPz8gZmFsc2UpO1xuXG5cdFx0dGhpcy5fb3B0aW9ucyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JPcHRpb25zLCBvcHRpb25zKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnNldFdpZHRoKHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIud2lkdGgucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoRWRpdG9yQ29udGV4dEtleXMuaXNFbWJlZGRlZERpZmZFZGl0b3Iua2V5LCBmYWxzZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoRWRpdG9yQ29udGV4dEtleXMuaXNFbWJlZGRlZERpZmZFZGl0b3IsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+IHRoaXMuX29wdGlvbnMuaXNJbkVtYmVkZGVkRWRpdG9yLnJlYWQocmVhZGVyKVxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmNvbXBhcmluZ01vdmVkQ29kZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gISF0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy5tb3ZlZFRleHRUb0NvbXBhcmUucmVhZChyZWFkZXIpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoRWRpdG9yQ29udGV4dEtleXMuZGlmZkVkaXRvclJlbmRlclNpZGVCeVNpZGVJbmxpbmVCcmVha3BvaW50UmVhY2hlZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gdGhpcy5fb3B0aW9ucy5jb3VsZFNob3dJbmxpbmVWaWV3QmVjYXVzZU9mU2l6ZS5yZWFkKHJlYWRlcilcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShFZGl0b3JDb250ZXh0S2V5cy5kaWZmRWRpdG9ySW5saW5lTW9kZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gIXRoaXMuX29wdGlvbnMucmVuZGVyU2lkZUJ5U2lkZS5yZWFkKHJlYWRlcilcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmhhc0NoYW5nZXMsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+ICh0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy5kaWZmLnJlYWQocmVhZGVyKT8ubWFwcGluZ3MubGVuZ3RoID8/IDApID4gMFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fZWRpdG9ycyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RGlmZkVkaXRvckVkaXRvcnMsXG5cdFx0XHR0aGlzLmVsZW1lbnRzLm9yaWdpbmFsLFxuXHRcdFx0dGhpcy5lbGVtZW50cy5tb2RpZmllZCxcblx0XHRcdHRoaXMuX29wdGlvbnMsXG5cdFx0XHRjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyxcblx0XHRcdChpLCBjLCBvLCBvMikgPT4gdGhpcy5fY3JlYXRlSW5uZXJFZGl0b3IoaSwgYywgbywgbzIpLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoRWRpdG9yQ29udGV4dEtleXMuZGlmZkVkaXRvck9yaWdpbmFsV3JpdGFibGUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+IHRoaXMuX29wdGlvbnMub3JpZ2luYWxFZGl0YWJsZS5yZWFkKHJlYWRlcilcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShFZGl0b3JDb250ZXh0S2V5cy5kaWZmRWRpdG9yTW9kaWZpZWRXcml0YWJsZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gIXRoaXMuX29wdGlvbnMucmVhZE9ubHkucmVhZChyZWFkZXIpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoRWRpdG9yQ29udGV4dEtleXMuZGlmZkVkaXRvck9yaWdpbmFsVXJpLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlYWRlciA9PiB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpPy5tb2RlbC5vcmlnaW5hbC51cmkudG9TdHJpbmcoKSA/PyAnJ1xuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmRpZmZFZGl0b3JNb2RpZmllZFVyaSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKT8ubW9kZWwubW9kaWZpZWQudXJpLnRvU3RyaW5nKCkgPz8gJydcblx0XHQpKTtcblxuXHRcdHRoaXMuX292ZXJ2aWV3UnVsZXJQYXJ0ID0gZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+XG5cdFx0XHQhdGhpcy5fb3B0aW9ucy5yZW5kZXJPdmVydmlld1J1bGVyLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0XHQ6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KE92ZXJ2aWV3UnVsZXJGZWF0dXJlLCByZWFkZXIpLFxuXHRcdFx0XHRcdHRoaXMuX2VkaXRvcnMsXG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50cy5yb290LFxuXHRcdFx0XHRcdHRoaXMuX2RpZmZNb2RlbCxcblx0XHRcdFx0XHR0aGlzLl9yb290U2l6ZU9ic2VydmVyLndpZHRoLFxuXHRcdFx0XHRcdHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIuaGVpZ2h0LFxuXHRcdFx0XHRcdHRoaXMuX2xheW91dEluZm8ubWFwKGkgPT4gaS5tb2RpZmllZEVkaXRvciksXG5cdFx0XHRcdClcblx0XHQpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IGRpbWVuc2lvbnMgPSB7XG5cdFx0XHRoZWlnaHQ6IHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIuaGVpZ2h0LFxuXHRcdFx0d2lkdGg6IHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIud2lkdGgubWFwKCh3LCByZWFkZXIpID0+IHcgLSAodGhpcy5fb3ZlcnZpZXdSdWxlclBhcnQucmVhZChyZWFkZXIpPy53aWR0aCA/PyAwKSksXG5cdFx0fTtcblxuXHRcdHRoaXMuX3Nhc2hMYXlvdXQgPSBuZXcgU2FzaExheW91dCh0aGlzLl9vcHRpb25zLCBkaW1lbnNpb25zKTtcblxuXHRcdHRoaXMuX3Nhc2ggPSBkZXJpdmVkRGlzcG9zYWJsZSh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvd1Nhc2ggPSB0aGlzLl9vcHRpb25zLnJlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5lbGVtZW50cy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ3NpZGUtYnktc2lkZScsIHNob3dTYXNoKTtcblx0XHRcdHJldHVybiAhc2hvd1Nhc2ggPyB1bmRlZmluZWQgOiBuZXcgRGlmZkVkaXRvclNhc2goXG5cdFx0XHRcdHRoaXMuZWxlbWVudHMucm9vdCxcblx0XHRcdFx0ZGltZW5zaW9ucyxcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5lbmFibGVTcGxpdFZpZXdSZXNpemluZyxcblx0XHRcdFx0dGhpcy5fYm91bmRhcnlTYXNoZXMsXG5cdFx0XHRcdHRoaXMuX3Nhc2hMYXlvdXQuc2FzaExlZnQsXG5cdFx0XHRcdCgpID0+IHRoaXMuX3Nhc2hMYXlvdXQucmVzZXRTYXNoKCksXG5cdFx0XHQpO1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IHVuY2hhbmdlZFJhbmdlc0ZlYXR1cmUgPSBkZXJpdmVkRGlzcG9zYWJsZSh0aGlzLCByZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiBVbmNoYW5nZWRSYW5nZXNGZWF0dXJlICovXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0cmVhZEhvdFJlbG9hZGFibGVFeHBvcnQoSGlkZVVuY2hhbmdlZFJlZ2lvbnNGZWF0dXJlLCByZWFkZXIpLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLCB0aGlzLl9kaWZmTW9kZWwsIHRoaXMuX29wdGlvbnNcblx0XHRcdClcblx0XHQpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIERpZmZFZGl0b3JEZWNvcmF0aW9ucyAqL1xuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KERpZmZFZGl0b3JEZWNvcmF0aW9ucywgcmVhZGVyKSxcblx0XHRcdFx0dGhpcy5fZWRpdG9ycywgdGhpcy5fZGlmZk1vZGVsLCB0aGlzLl9vcHRpb25zLCB0aGlzLFxuXHRcdFx0KVxuXHRcdCkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0Y29uc3Qgb3JpZ1ZpZXdab25lSWRzVG9JZ25vcmUgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBtb2RWaWV3Wm9uZUlkc1RvSWdub3JlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IGlzVXBkYXRpbmdWaWV3Wm9uZXMgPSBmYWxzZTtcblx0XHRjb25zdCB2aWV3Wm9uZU1hbmFnZXIgPSBkZXJpdmVkRGlzcG9zYWJsZSh0aGlzLCByZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiBWaWV3Wm9uZU1hbmFnZXIgKi9cblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRyZWFkSG90UmVsb2FkYWJsZUV4cG9ydChEaWZmRWRpdG9yVmlld1pvbmVzLCByZWFkZXIpLFxuXHRcdFx0XHRnZXRXaW5kb3codGhpcy5fZG9tRWxlbWVudCksXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMsXG5cdFx0XHRcdHRoaXMuX2RpZmZNb2RlbCxcblx0XHRcdFx0dGhpcy5fb3B0aW9ucyxcblx0XHRcdFx0dGhpcyxcblx0XHRcdFx0KCkgPT4gaXNVcGRhdGluZ1ZpZXdab25lcyB8fCB1bmNoYW5nZWRSYW5nZXNGZWF0dXJlLnJlYWQodW5kZWZpbmVkKS5pc1VwZGF0aW5nSGlkZGVuQXJlYXMsXG5cdFx0XHRcdG9yaWdWaWV3Wm9uZUlkc1RvSWdub3JlLFxuXHRcdFx0XHRtb2RWaWV3Wm9uZUlkc1RvSWdub3JlXG5cdFx0XHQpXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCBvcmlnaW5hbFZpZXdab25lcyA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4geyAvKiogQGRlc2NyaXB0aW9uIG9yaWdpbmFsVmlld1pvbmVzICovXG5cdFx0XHRjb25zdCBvcmlnID0gdmlld1pvbmVNYW5hZ2VyLnJlYWQocmVhZGVyKS52aWV3Wm9uZXMucmVhZChyZWFkZXIpLm9yaWc7XG5cdFx0XHRjb25zdCBvcmlnMiA9IHVuY2hhbmdlZFJhbmdlc0ZlYXR1cmUucmVhZChyZWFkZXIpLnZpZXdab25lcy5yZWFkKHJlYWRlcikub3JpZ1ZpZXdab25lcztcblx0XHRcdHJldHVybiBvcmlnLmNvbmNhdChvcmlnMik7XG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kaWZpZWRWaWV3Wm9uZXMgPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHsgLyoqIEBkZXNjcmlwdGlvbiBtb2RpZmllZFZpZXdab25lcyAqL1xuXHRcdFx0Y29uc3QgbW9kID0gdmlld1pvbmVNYW5hZ2VyLnJlYWQocmVhZGVyKS52aWV3Wm9uZXMucmVhZChyZWFkZXIpLm1vZDtcblx0XHRcdGNvbnN0IG1vZDIgPSB1bmNoYW5nZWRSYW5nZXNGZWF0dXJlLnJlYWQocmVhZGVyKS52aWV3Wm9uZXMucmVhZChyZWFkZXIpLm1vZFZpZXdab25lcztcblx0XHRcdHJldHVybiBtb2QuY29uY2F0KG1vZDIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5Vmlld1pvbmVzKHRoaXMuX2VkaXRvcnMub3JpZ2luYWwsIG9yaWdpbmFsVmlld1pvbmVzLCBpc1VwZGF0aW5nT3JpZ1ZpZXdab25lcyA9PiB7XG5cdFx0XHRpc1VwZGF0aW5nVmlld1pvbmVzID0gaXNVcGRhdGluZ09yaWdWaWV3Wm9uZXM7XG5cdFx0fSwgb3JpZ1ZpZXdab25lSWRzVG9JZ25vcmUpKTtcblx0XHRsZXQgc2Nyb2xsU3RhdGU6IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5Vmlld1pvbmVzKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQsIG1vZGlmaWVkVmlld1pvbmVzLCBpc1VwZGF0aW5nTW9kVmlld1pvbmVzID0+IHtcblx0XHRcdGlzVXBkYXRpbmdWaWV3Wm9uZXMgPSBpc1VwZGF0aW5nTW9kVmlld1pvbmVzO1xuXHRcdFx0aWYgKGlzVXBkYXRpbmdWaWV3Wm9uZXMpIHtcblx0XHRcdFx0c2Nyb2xsU3RhdGUgPSBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZS5jYXB0dXJlKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Nyb2xsU3RhdGU/LnJlc3RvcmUodGhpcy5fZWRpdG9ycy5tb2RpZmllZCk7XG5cdFx0XHRcdHNjcm9sbFN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0sIG1vZFZpZXdab25lSWRzVG9JZ25vcmUpKTtcblxuXHRcdHRoaXMuX2FjY2Vzc2libGVEaWZmVmlld2VyID0gZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+XG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0cmVhZEhvdFJlbG9hZGFibGVFeHBvcnQoQWNjZXNzaWJsZURpZmZWaWV3ZXIsIHJlYWRlciksXG5cdFx0XHRcdHRoaXMuZWxlbWVudHMuYWNjZXNzaWJsZURpZmZWaWV3ZXIsXG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2libGVEaWZmVmlld2VyVmlzaWJsZSxcblx0XHRcdFx0KHZpc2libGUsIHR4KSA9PiB0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlclNob3VsZEJlVmlzaWJsZS5zZXQodmlzaWJsZSwgdHgpLFxuXHRcdFx0XHR0aGlzLl9vcHRpb25zLm9ubHlTaG93QWNjZXNzaWJsZURpZmZWaWV3ZXIubWFwKHYgPT4gIXYpLFxuXHRcdFx0XHR0aGlzLl9yb290U2l6ZU9ic2VydmVyLndpZHRoLFxuXHRcdFx0XHR0aGlzLl9yb290U2l6ZU9ic2VydmVyLmhlaWdodCxcblx0XHRcdFx0dGhpcy5fZGlmZk1vZGVsLm1hcCgobSwgcikgPT4gbT8uZGlmZi5yZWFkKHIpPy5tYXBwaW5ncy5tYXAobSA9PiBtLmxpbmVSYW5nZU1hcHBpbmcpKSxcblx0XHRcdFx0bmV3IEFjY2Vzc2libGVEaWZmVmlld2VyTW9kZWxGcm9tRWRpdG9ycyh0aGlzLl9lZGl0b3JzKSxcblx0XHRcdClcblx0XHQpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IHZpc2liaWxpdHkgPSB0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlclZpc2libGUubWFwPENTU1N0eWxlWyd2aXNpYmlsaXR5J10+KHYgPT4gdiA/ICdoaWRkZW4nIDogJ3Zpc2libGUnKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseVN0eWxlKHRoaXMuZWxlbWVudHMubW9kaWZpZWQsIHsgdmlzaWJpbGl0eSB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlTdHlsZSh0aGlzLmVsZW1lbnRzLm9yaWdpbmFsLCB7IHZpc2liaWxpdHkgfSkpO1xuXG5cdFx0dGhpcy5fY3JlYXRlRGlmZkVkaXRvckNvbnRyaWJ1dGlvbnMoKTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmFkZERpZmZFZGl0b3IodGhpcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlbW92ZURpZmZFZGl0b3IodGhpcyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZ3V0dGVyID0gZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9vcHRpb25zLnNob3VsZFJlbmRlckd1dHRlck1lbnUucmVhZChyZWFkZXIpXG5cdFx0XHRcdD8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0cmVhZEhvdFJlbG9hZGFibGVFeHBvcnQoRGlmZkVkaXRvckd1dHRlciwgcmVhZGVyKSxcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnRzLnJvb3QsXG5cdFx0XHRcdFx0dGhpcy5fZGlmZk1vZGVsLFxuXHRcdFx0XHRcdHRoaXMuX2VkaXRvcnMsXG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucyxcblx0XHRcdFx0XHR0aGlzLl9zYXNoTGF5b3V0LFxuXHRcdFx0XHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzLFxuXHRcdFx0XHQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fbGF5b3V0SW5mbykpO1xuXG5cdFx0ZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+IC8qKiBAZGVzY3JpcHRpb24gTW92ZWRCbG9ja3NMaW5lc1BhcnQgKi9cblx0XHRcdG5ldyAocmVhZEhvdFJlbG9hZGFibGVFeHBvcnQoTW92ZWRCbG9ja3NMaW5lc0ZlYXR1cmUsIHJlYWRlcikpKFxuXHRcdFx0XHR0aGlzLmVsZW1lbnRzLnJvb3QsXG5cdFx0XHRcdHRoaXMuX2RpZmZNb2RlbCxcblx0XHRcdFx0dGhpcy5fbGF5b3V0SW5mby5tYXAoaSA9PiBpLm9yaWdpbmFsRWRpdG9yKSxcblx0XHRcdFx0dGhpcy5fbGF5b3V0SW5mby5tYXAoaSA9PiBpLm1vZGlmaWVkRWRpdG9yKSxcblx0XHRcdFx0dGhpcy5fZWRpdG9ycyxcblx0XHRcdClcblx0XHQpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlLCB2YWx1ZSA9PiB7XG5cdFx0XHQvLyBUaGlzIGlzIHRvIGJyZWFrIHRoZSBsYXlvdXQgaW5mbyA8LT4gbW92ZWQgYmxvY2tzIGxpbmVzIHBhcnQgZGVwZW5kZW5jeSBjeWNsZS5cblx0XHRcdHRoaXMuX21vdmVkQmxvY2tzTGluZXNQYXJ0LnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24sIGUgPT4gdGhpcy5faGFuZGxlQ3Vyc29yUG9zaXRpb25DaGFuZ2UoZSwgdHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uLCBlID0+IHRoaXMuX2hhbmRsZUN1cnNvclBvc2l0aW9uQ2hhbmdlKGUsIGZhbHNlKSkpO1xuXG5cdFx0Y29uc3QgaXNJbml0aWFsaXppbmdEaWZmID0gdGhpcy5fZGlmZk1vZGVsLm1hcCh0aGlzLCAobSwgcmVhZGVyKSA9PiB7XG5cdFx0XHQvKiogQGlzSW5pdGlhbGl6aW5nRGlmZiBpc0RpZmZVcFRvRGF0ZSAqL1xuXHRcdFx0aWYgKCFtKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdHJldHVybiBtLmRpZmYucmVhZChyZWFkZXIpID09PSB1bmRlZmluZWQgJiYgIW0uaXNEaWZmVXBUb0RhdGUucmVhZChyZWFkZXIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gRGlmZkVkaXRvcldpZGdldEhlbHBlci5TaG93UHJvZ3Jlc3MgKi9cblx0XHRcdGlmIChpc0luaXRpYWxpemluZ0RpZmYucmVhZChyZWFkZXIpID09PSB0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IHIgPSB0aGlzLl9lZGl0b3JQcm9ncmVzc1NlcnZpY2Uuc2hvdyh0cnVlLCAxMDAwKTtcblx0XHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiByLmRvbmUoKSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdHN0b3JlLmFkZChuZXcgKHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KFJldmVydEJ1dHRvbnNGZWF0dXJlLCByZWFkZXIpKSh0aGlzLl9lZGl0b3JzLCB0aGlzLl9kaWZmTW9kZWwsIHRoaXMuX29wdGlvbnMsIHRoaXMpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuV2l0aFN0b3JlKChyZWFkZXIsIHN0b3JlKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7IHJldHVybjsgfVxuXHRcdFx0Zm9yIChjb25zdCBtIG9mIFttb2RlbC5tb2RlbC5vcmlnaW5hbCwgbW9kZWwubW9kZWwubW9kaWZpZWRdKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChtLm9uV2lsbERpc3Bvc2UoZSA9PiB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IobmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVGV4dE1vZGVsIGdvdCBkaXNwb3NlZCBiZWZvcmUgRGlmZkVkaXRvcldpZGdldCBtb2RlbCBnb3QgcmVzZXQnKSk7XG5cdFx0XHRcdFx0dGhpcy5zZXRNb2RlbChudWxsKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX29wdGlvbnMuc2V0TW9kZWwodGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yb290U2l6ZU9ic2VydmVyLndpZHRoLmdldCgpO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRlbnRIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZ2V0Q29udGVudEhlaWdodCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVJbm5lckVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBSZWFkb25seTxJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucz4sIGVkaXRvcldpZGdldE9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyk6IENvZGVFZGl0b3JXaWRnZXQge1xuXHRcdGNvbnN0IGVkaXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIGNvbnRhaW5lciwgb3B0aW9ucywgZWRpdG9yV2lkZ2V0T3B0aW9ucyk7XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xheW91dEluZm87XG5cblx0cHJpdmF0ZSBfY3JlYXRlRGlmZkVkaXRvckNvbnRyaWJ1dGlvbnMoKSB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uczogSURpZmZFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdID0gRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldERpZmZFZGl0b3JDb250cmlidXRpb25zKCk7XG5cdFx0Zm9yIChjb25zdCBkZXNjIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGRlc2MuY3RvciwgdGhpcykpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBfdGFyZ2V0RWRpdG9yKCk6IENvZGVFZGl0b3JXaWRnZXQgeyByZXR1cm4gdGhpcy5fZWRpdG9ycy5tb2RpZmllZDsgfVxuXG5cdG92ZXJyaWRlIGdldEVkaXRvclR5cGUoKTogc3RyaW5nIHsgcmV0dXJuIEVkaXRvclR5cGUuSURpZmZFZGl0b3I7IH1cblxuXHRvdmVycmlkZSBvblZpc2libGUoKTogdm9pZCB7XG5cdFx0Ly8gVE9ETzogT25seSBjb21wdXRlIGRpZmZzIHdoZW4gZGlmZiBlZGl0b3IgaXMgdmlzaWJsZVxuXHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwub25WaXNpYmxlKCk7XG5cdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5vblZpc2libGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uSGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLm9uSGlkZSgpO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25IaWRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uPzogSURpbWVuc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIub2JzZXJ2ZShkaW1lbnNpb24pO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGFzVGV4dEZvY3VzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5oYXNUZXh0Rm9jdXMoKSB8fCB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmhhc1RleHRGb2N1cygpOyB9XG5cblx0cHVibGljIG92ZXJyaWRlIHNhdmVWaWV3U3RhdGUoKTogSURpZmZFZGl0b3JWaWV3U3RhdGUge1xuXHRcdGNvbnN0IG9yaWdpbmFsVmlld1N0YXRlID0gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRWaWV3U3RhdGUgPSB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnNhdmVWaWV3U3RhdGUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luYWw6IG9yaWdpbmFsVmlld1N0YXRlLFxuXHRcdFx0bW9kaWZpZWQ6IG1vZGlmaWVkVmlld1N0YXRlLFxuXHRcdFx0bW9kZWxTdGF0ZTogdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5zZXJpYWxpemVTdGF0ZSgpLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVzdG9yZVZpZXdTdGF0ZShzOiBJRGlmZkVkaXRvclZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdGlmIChzICYmIHMub3JpZ2luYWwgJiYgcy5tb2RpZmllZCkge1xuXHRcdFx0Y29uc3QgZGlmZkVkaXRvclN0YXRlID0gcztcblx0XHRcdHRoaXMuX2VkaXRvcnMub3JpZ2luYWwucmVzdG9yZVZpZXdTdGF0ZShkaWZmRWRpdG9yU3RhdGUub3JpZ2luYWwpO1xuXHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5yZXN0b3JlVmlld1N0YXRlKGRpZmZFZGl0b3JTdGF0ZS5tb2RpZmllZCk7XG5cdFx0XHRpZiAoZGlmZkVkaXRvclN0YXRlLm1vZGVsU3RhdGUpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8ucmVzdG9yZVNlcmlhbGl6ZWRTdGF0ZShkaWZmRWRpdG9yU3RhdGUubW9kZWxTdGF0ZSBhcyBhbnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVJbml0aWFsaXplZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmhhbmRsZUluaXRpYWxpemVkKCk7XG5cdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5oYW5kbGVJbml0aWFsaXplZCgpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVZpZXdNb2RlbChtb2RlbDogSURpZmZFZGl0b3JNb2RlbCk6IElEaWZmRWRpdG9yVmlld01vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvclZpZXdNb2RlbCwgbW9kZWwsIHRoaXMuX29wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TW9kZWwoKTogSURpZmZFZGl0b3JNb2RlbCB8IG51bGwgeyByZXR1cm4gdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5tb2RlbCA/PyBudWxsOyB9XG5cblx0b3ZlcnJpZGUgc2V0TW9kZWwobW9kZWw6IElEaWZmRWRpdG9yTW9kZWwgfCBudWxsIHwgSURpZmZFZGl0b3JWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCB2bSA9ICFtb2RlbCA/IG51bGxcblx0XHRcdDogKCdtb2RlbCcgaW4gbW9kZWwpID8gUmVmQ291bnRlZC5jcmVhdGUobW9kZWwpLmNyZWF0ZU5ld1JlZih0aGlzKVxuXHRcdFx0XHQ6IFJlZkNvdW50ZWQuY3JlYXRlKHRoaXMuY3JlYXRlVmlld01vZGVsKG1vZGVsKSwgdGhpcyk7XG5cdFx0dGhpcy5zZXREaWZmTW9kZWwodm0pO1xuXHR9XG5cblx0c2V0RGlmZk1vZGVsKHZpZXdNb2RlbDogUmVmQ291bnRlZDxJRGlmZkVkaXRvclZpZXdNb2RlbD4gfCBudWxsLCB0eD86IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKTtcblxuXHRcdGlmICghdmlld01vZGVsICYmIGN1cnJlbnRNb2RlbCkge1xuXHRcdFx0Ly8gVHJhbnNpdGlvbmluZyBmcm9tIGEgbW9kZWwgdG8gbm8tbW9kZWxcblx0XHRcdHRoaXMuX2FjY2Vzc2libGVEaWZmVmlld2VyLmdldCgpLmNsb3NlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RpZmZNb2RlbC5nZXQoKSAhPT0gdmlld01vZGVsPy5vYmplY3QpIHtcblx0XHRcdHN1YnRyYW5zYWN0aW9uKHR4LCB0eCA9PiB7XG5cdFx0XHRcdGNvbnN0IHZtID0gdmlld01vZGVsPy5vYmplY3Q7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gRGlmZkVkaXRvcldpZGdldC5zZXRNb2RlbCAqL1xuXHRcdFx0XHRvYnNlcnZhYmxlRnJvbUV2ZW50LmJhdGNoRXZlbnRzR2xvYmFsbHkodHgsICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLnNldE1vZGVsKHZtID8gdm0ubW9kZWwub3JpZ2luYWwgOiBudWxsKTtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnNldE1vZGVsKHZtID8gdm0ubW9kZWwubW9kaWZpZWQgOiBudWxsKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHByZXZWYWx1ZVJlZiA9IHRoaXMuX2RpZmZNb2RlbFNyYy5nZXQoKT8uY3JlYXRlTmV3UmVmKHRoaXMpO1xuXHRcdFx0XHR0aGlzLl9kaWZmTW9kZWxTcmMuc2V0KHZpZXdNb2RlbD8uY3JlYXRlTmV3UmVmKHRoaXMpIGFzIFJlZkNvdW50ZWQ8RGlmZkVkaXRvclZpZXdNb2RlbD4gfCB1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gYXN5bmMsIHNvIHRoYXQgdGhpcyBydW5zIGFmdGVyIHRoZSB0cmFuc2FjdGlvbiBmaW5pc2hlZC5cblx0XHRcdFx0XHQvLyBUT0RPOiB1c2UgdGhlIHRyYW5zYWN0aW9uIHRvIHNjaGVkdWxlIGRpc3Bvc2FsXG5cdFx0XHRcdFx0cHJldlZhbHVlUmVmPy5kaXNwb3NlKCk7XG5cdFx0XHRcdH0sIDApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBjaGFuZ2VkT3B0aW9ucyBPbmx5IGhhcyB2YWx1ZXMgZm9yIHRvcC1sZXZlbCBvcHRpb25zIHRoYXQgaGF2ZSBhY3R1YWxseSBjaGFuZ2VkLlxuXHQgKi9cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhjaGFuZ2VkT3B0aW9uczogSURpZmZFZGl0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fb3B0aW9ucy51cGRhdGVPcHRpb25zKGNoYW5nZWRPcHRpb25zKTtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5lbGVtZW50cy5yb290OyB9XG5cdGdldENvbnRhaW5lckRvbU5vZGUoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5fZG9tRWxlbWVudDsgfVxuXHRnZXRPcmlnaW5hbEVkaXRvcigpOiBJQ29kZUVkaXRvciB7IHJldHVybiB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsOyB9XG5cdGdldE1vZGlmaWVkRWRpdG9yKCk6IElDb2RlRWRpdG9yIHsgcmV0dXJuIHRoaXMuX2VkaXRvcnMubW9kaWZpZWQ7IH1cblxuXHRzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcyk6IHZvaWQge1xuXHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzLnNldChzYXNoZXMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmVmFsdWU7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlRGlmZjogRXZlbnQ8dm9pZD47XG5cblx0Z2V0IGlnbm9yZVRyaW1XaGl0ZXNwYWNlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fb3B0aW9ucy5pZ25vcmVUcmltV2hpdGVzcGFjZS5nZXQoKTsgfVxuXG5cdGdldCBtYXhDb21wdXRhdGlvblRpbWUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX29wdGlvbnMubWF4Q29tcHV0YXRpb25UaW1lTXMuZ2V0KCk7IH1cblxuXHRnZXQgcmVuZGVyU2lkZUJ5U2lkZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX29wdGlvbnMucmVuZGVyU2lkZUJ5U2lkZS5nZXQoKTsgfVxuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgYHRoaXMuZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCkuY2hhbmdlczJgIGluc3RlYWQuXG5cdCAqL1xuXHRnZXRMaW5lQ2hhbmdlcygpOiBJTGluZUNoYW5nZVtdIHwgbnVsbCB7XG5cdFx0Y29uc3QgZGlmZlN0YXRlID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5kaWZmLmdldCgpO1xuXHRcdGlmICghZGlmZlN0YXRlKSB7IHJldHVybiBudWxsOyB9XG5cdFx0cmV0dXJuIHRvTGluZUNoYW5nZXMoZGlmZlN0YXRlKTtcblx0fVxuXG5cdGdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpOiBJRGlmZkNvbXB1dGF0aW9uUmVzdWx0IHwgbnVsbCB7XG5cdFx0Y29uc3QgZGlmZlN0YXRlID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5kaWZmLmdldCgpO1xuXHRcdGlmICghZGlmZlN0YXRlKSB7IHJldHVybiBudWxsOyB9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbmdlczogdGhpcy5nZXRMaW5lQ2hhbmdlcygpISxcblx0XHRcdGNoYW5nZXMyOiBkaWZmU3RhdGUubWFwcGluZ3MubWFwKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nKSxcblx0XHRcdGlkZW50aWNhbDogZGlmZlN0YXRlLmlkZW50aWNhbCxcblx0XHRcdHF1aXRFYXJseTogZGlmZlN0YXRlLnF1aXRFYXJseSxcblx0XHR9O1xuXHR9XG5cblx0cmV2ZXJ0KGRpZmY6IExpbmVSYW5nZU1hcHBpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKTtcblx0XHRpZiAoIW1vZGVsIHx8ICFtb2RlbC5pc0RpZmZVcFRvRGF0ZS5nZXQoKSkgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQucHVzaFVuZG9TdG9wKCk7XG5cdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5leGVjdXRlRWRpdHMoJ2RpZmZFZGl0b3InLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHJhbmdlOiBkaWZmLm1vZGlmaWVkLnRvRXhjbHVzaXZlUmFuZ2UoKSxcblx0XHRcdFx0dGV4dDogbW9kZWwubW9kZWwub3JpZ2luYWwuZ2V0VmFsdWVJblJhbmdlKGRpZmYub3JpZ2luYWwudG9FeGNsdXNpdmVSYW5nZSgpKVxuXHRcdFx0fVxuXHRcdF0pO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQucHVzaFVuZG9TdG9wKCk7XG5cdH1cblxuXHRyZXZlcnRSYW5nZU1hcHBpbmdzKGRpZmZzOiBSYW5nZU1hcHBpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpO1xuXHRcdGlmICghbW9kZWwgfHwgIW1vZGVsLmlzRGlmZlVwVG9EYXRlLmdldCgpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgY2hhbmdlczogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBkaWZmcy5tYXA8SUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uPihjID0+ICh7XG5cdFx0XHRyYW5nZTogYy5tb2RpZmllZFJhbmdlLFxuXHRcdFx0dGV4dDogbW9kZWwubW9kZWwub3JpZ2luYWwuZ2V0VmFsdWVJblJhbmdlKGMub3JpZ2luYWxSYW5nZSlcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnB1c2hVbmRvU3RvcCgpO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZXhlY3V0ZUVkaXRzKCdkaWZmRWRpdG9yJywgY2hhbmdlcyk7XG5cdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5wdXNoVW5kb1N0b3AoKTtcblx0fVxuXG5cdHJldmVydEZvY3VzZWRSYW5nZU1hcHBpbmdzKCkge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpO1xuXHRcdGlmICghbW9kZWwgfHwgIW1vZGVsLmlzRGlmZlVwVG9EYXRlLmdldCgpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgZGlmZnMgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk/LmRpZmYuZ2V0KCk/Lm1hcHBpbmdzO1xuXHRcdGlmICghZGlmZnMgfHwgZGlmZnMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgbW9kaWZpZWRFZGl0b3IgPSB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkO1xuXHRcdGlmICghbW9kaWZpZWRFZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBjdXJMaW5lTnVtYmVyID0gbW9kaWZpZWRFZGl0b3IuZ2V0UG9zaXRpb24oKSEubGluZU51bWJlcjtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBtb2RpZmllZEVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBzZWxlY3RlZFJhbmdlID0gTGluZVJhbmdlLmZyb21SYW5nZShzZWxlY3Rpb24gfHwgbmV3IFJhbmdlKGN1ckxpbmVOdW1iZXIsIDAsIGN1ckxpbmVOdW1iZXIsIDApKTtcblx0XHRjb25zdCBkaWZmc1RvUmV2ZXJ0ID0gZGlmZnMuZmlsdGVyKGQgPT4ge1xuXHRcdFx0cmV0dXJuIGQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5pbnRlcnNlY3Qoc2VsZWN0ZWRSYW5nZSk7XG5cdFx0fSk7XG5cblx0XHRtb2RpZmllZEVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRtb2RpZmllZEVkaXRvci5leGVjdXRlRWRpdHMoJ2RpZmZFZGl0b3InLCBkaWZmc1RvUmV2ZXJ0Lm1hcChkID0+IChcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IGQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC50b0V4Y2x1c2l2ZVJhbmdlKCksXG5cdFx0XHRcdHRleHQ6IG1vZGVsLm1vZGVsLm9yaWdpbmFsLmdldFZhbHVlSW5SYW5nZShkLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwudG9FeGNsdXNpdmVSYW5nZSgpKVxuXHRcdFx0fVxuXHRcdCkpKTtcblx0XHRtb2RpZmllZEVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSBfZ29UbyhkaWZmOiBEaWZmTWFwcGluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKGRpZmYubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIDEpKTtcblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnJldmVhbFJhbmdlSW5DZW50ZXIoZGlmZi5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnRvRXhjbHVzaXZlUmFuZ2UoKSk7XG5cdH1cblxuXHRnb1RvRGlmZih0YXJnZXQ6ICdwcmV2aW91cycgfCAnbmV4dCcpOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmcyA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8uZGlmZi5nZXQoKT8ubWFwcGluZ3M7XG5cdFx0aWYgKCFkaWZmcyB8fCBkaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJMaW5lTnVtYmVyID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRQb3NpdGlvbigpIS5saW5lTnVtYmVyO1xuXHRcdGxldCBkaWZmOiBEaWZmTWFwcGluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGFyZ2V0ID09PSAnbmV4dCcpIHtcblx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZUNvdW50ID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRNb2RlbCgpIS5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGlmIChtb2RpZmllZExpbmVDb3VudCA9PT0gY3VyTGluZU51bWJlcikge1xuXHRcdFx0XHRkaWZmID0gZGlmZnNbMF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkaWZmID0gZGlmZnMuZmluZChkID0+IGQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgPiBjdXJMaW5lTnVtYmVyKSA/PyBkaWZmc1swXTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlmZiA9IGZpbmRMYXN0KGRpZmZzLCBkID0+IGQubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgPCBjdXJMaW5lTnVtYmVyKSA/PyBkaWZmc1tkaWZmcy5sZW5ndGggLSAxXTtcblx0XHR9XG5cdFx0dGhpcy5fZ29UbyhkaWZmKTtcblxuXHRcdGlmIChkaWZmLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lRGVsZXRlZCwgeyBzb3VyY2U6ICdkaWZmRWRpdG9yLmdvVG9EaWZmJyB9KTtcblx0XHR9IGVsc2UgaWYgKGRpZmYubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVJbnNlcnRlZCwgeyBzb3VyY2U6ICdkaWZmRWRpdG9yLmdvVG9EaWZmJyB9KTtcblx0XHR9IGVsc2UgaWYgKGRpZmYpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZU1vZGlmaWVkLCB7IHNvdXJjZTogJ2RpZmZFZGl0b3IuZ29Ub0RpZmYnIH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldmVhbEZpcnN0RGlmZigpOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmTW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk7XG5cdFx0aWYgKCFkaWZmTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gd2FpdCBmb3IgdGhlIGRpZmYgY29tcHV0YXRpb24gdG8gZmluaXNoXG5cdFx0dGhpcy53YWl0Rm9yRGlmZigpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZnMgPSBkaWZmTW9kZWwuZGlmZi5nZXQoKT8ubWFwcGluZ3M7XG5cdFx0XHRpZiAoIWRpZmZzIHx8IGRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9nb1RvKGRpZmZzWzBdKTtcblx0XHR9KTtcblx0fVxuXG5cdGFjY2Vzc2libGVEaWZmVmlld2VyTmV4dCgpOiB2b2lkIHsgdGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3ZXIuZ2V0KCkubmV4dCgpOyB9XG5cblx0YWNjZXNzaWJsZURpZmZWaWV3ZXJQcmV2KCk6IHZvaWQgeyB0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlci5nZXQoKS5wcmV2KCk7IH1cblxuXHRhc3luYyB3YWl0Rm9yRGlmZigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWZmTW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk7XG5cdFx0aWYgKCFkaWZmTW9kZWwpIHsgcmV0dXJuOyB9XG5cdFx0YXdhaXQgZGlmZk1vZGVsLndhaXRGb3JEaWZmKCk7XG5cdH1cblxuXHRtYXBUb090aGVyU2lkZSgpOiB7IGRlc3RpbmF0aW9uOiBDb2RlRWRpdG9yV2lkZ2V0OyBkZXN0aW5hdGlvblNlbGVjdGlvbjogUmFuZ2UgfCB1bmRlZmluZWQgfSB7XG5cdFx0Y29uc3QgaXNNb2RpZmllZEZvY3VzID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5oYXNXaWRnZXRGb2N1cygpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGlzTW9kaWZpZWRGb2N1cyA/IHRoaXMuX2VkaXRvcnMubW9kaWZpZWQgOiB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gaXNNb2RpZmllZEZvY3VzID8gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbCA6IHRoaXMuX2VkaXRvcnMubW9kaWZpZWQ7XG5cblx0XHRsZXQgZGVzdGluYXRpb25TZWxlY3Rpb246IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc291cmNlU2VsZWN0aW9uID0gc291cmNlLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzb3VyY2VTZWxlY3Rpb24pIHtcblx0XHRcdGNvbnN0IG1hcHBpbmdzID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5kaWZmLmdldCgpPy5tYXBwaW5ncy5tYXAobSA9PiBpc01vZGlmaWVkRm9jdXMgPyBtLmxpbmVSYW5nZU1hcHBpbmcuZmxpcCgpIDogbS5saW5lUmFuZ2VNYXBwaW5nKTtcblx0XHRcdGlmIChtYXBwaW5ncykge1xuXHRcdFx0XHRjb25zdCBuZXdSYW5nZTEgPSB0cmFuc2xhdGVQb3NpdGlvbihzb3VyY2VTZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpLCBtYXBwaW5ncyk7XG5cdFx0XHRcdGNvbnN0IG5ld1JhbmdlMiA9IHRyYW5zbGF0ZVBvc2l0aW9uKHNvdXJjZVNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpLCBtYXBwaW5ncyk7XG5cdFx0XHRcdGRlc3RpbmF0aW9uU2VsZWN0aW9uID0gUmFuZ2UucGx1c1JhbmdlKG5ld1JhbmdlMSwgbmV3UmFuZ2UyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgZGVzdGluYXRpb24sIGRlc3RpbmF0aW9uU2VsZWN0aW9uIH07XG5cdH1cblxuXHRzd2l0Y2hTaWRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZGVzdGluYXRpb24sIGRlc3RpbmF0aW9uU2VsZWN0aW9uIH0gPSB0aGlzLm1hcFRvT3RoZXJTaWRlKCk7XG5cdFx0ZGVzdGluYXRpb24uZm9jdXMoKTtcblx0XHRpZiAoZGVzdGluYXRpb25TZWxlY3Rpb24pIHtcblx0XHRcdGRlc3RpbmF0aW9uLnNldFNlbGVjdGlvbihkZXN0aW5hdGlvblNlbGVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0ZXhpdENvbXBhcmVNb3ZlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpO1xuXHRcdGlmICghbW9kZWwpIHsgcmV0dXJuOyB9XG5cdFx0bW9kZWwubW92ZWRUZXh0VG9Db21wYXJlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbFVuY2hhbmdlZFJlZ2lvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdW5jaGFuZ2VkUmVnaW9ucyA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8udW5jaGFuZ2VkUmVnaW9ucy5nZXQoKTtcblx0XHRpZiAoIXVuY2hhbmdlZFJlZ2lvbnMpIHsgcmV0dXJuOyB9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByZWdpb24gb2YgdW5jaGFuZ2VkUmVnaW9ucykge1xuXHRcdFx0XHRyZWdpb24uY29sbGFwc2VBbGwodHgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0c2hvd0FsbFVuY2hhbmdlZFJlZ2lvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdW5jaGFuZ2VkUmVnaW9ucyA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8udW5jaGFuZ2VkUmVnaW9ucy5nZXQoKTtcblx0XHRpZiAoIXVuY2hhbmdlZFJlZ2lvbnMpIHsgcmV0dXJuOyB9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByZWdpb24gb2YgdW5jaGFuZ2VkUmVnaW9ucykge1xuXHRcdFx0XHRyZWdpb24uc2hvd0FsbCh0eCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDdXJzb3JQb3NpdGlvbkNoYW5nZShlOiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQsIGlzTW9kaWZpZWRFZGl0b3I6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZT8ucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpIHtcblx0XHRcdGNvbnN0IGRpZmYgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk/LmRpZmYuZ2V0KCk/Lm1hcHBpbmdzLmZpbmQobSA9PiBpc01vZGlmaWVkRWRpdG9yID8gbS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmNvbnRhaW5zKGUucG9zaXRpb24ubGluZU51bWJlcikgOiBtLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwuY29udGFpbnMoZS5wb3NpdGlvbi5saW5lTnVtYmVyKSk7XG5cdFx0XHRpZiAoZGlmZj8ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5pc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZURlbGV0ZWQsIHsgc291cmNlOiAnZGlmZkVkaXRvci5jdXJzb3JQb3NpdGlvbkNoYW5nZWQnIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChkaWZmPy5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lSW5zZXJ0ZWQsIHsgc291cmNlOiAnZGlmZkVkaXRvci5jdXJzb3JQb3NpdGlvbkNoYW5nZWQnIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChkaWZmKSB7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZU1vZGlmaWVkLCB7IHNvdXJjZTogJ2RpZmZFZGl0b3IuY3Vyc29yUG9zaXRpb25DaGFuZ2VkJyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvTGluZUNoYW5nZXMoc3RhdGU6IERpZmZTdGF0ZSk6IElMaW5lQ2hhbmdlW10ge1xuXHRyZXR1cm4gc3RhdGUubWFwcGluZ3MubWFwKHggPT4ge1xuXHRcdGNvbnN0IG0gPSB4LmxpbmVSYW5nZU1hcHBpbmc7XG5cdFx0bGV0IG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IG9yaWdpbmFsRW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCBtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCBtb2RpZmllZEVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgaW5uZXJDaGFuZ2VzID0gbS5pbm5lckNoYW5nZXM7XG5cblx0XHRpZiAobS5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHQvLyBJbnNlcnRpb25cblx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gbS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gMDtcblx0XHRcdGlubmVyQ2hhbmdlcyA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXIgPSBtLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdG9yaWdpbmFsRW5kTGluZU51bWJlciA9IG0ub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDE7XG5cdFx0fVxuXG5cdFx0aWYgKG0ubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0Ly8gRGVsZXRpb25cblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyID0gMDtcblx0XHRcdGlubmVyQ2hhbmdlcyA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXIgPSBtLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlciA9IG0ubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyLFxuXHRcdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXIsXG5cdFx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXIsXG5cdFx0XHRjaGFyQ2hhbmdlczogaW5uZXJDaGFuZ2VzPy5tYXAobSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbS5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0b3JpZ2luYWxTdGFydENvbHVtbjogbS5vcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG0ub3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRvcmlnaW5hbEVuZENvbHVtbjogbS5vcmlnaW5hbFJhbmdlLmVuZENvbHVtbixcblx0XHRcdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG0ubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnRDb2x1bW46IG0ubW9kaWZpZWRSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBtLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0bW9kaWZpZWRFbmRDb2x1bW46IG0ubW9kaWZpZWRSYW5nZS5lbmRDb2x1bW4sXG5cdFx0XHR9KSlcblx0XHR9O1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxXQUFXLFNBQVM7QUFFN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0IseUJBQXlCO0FBQ3RELFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFvQyxTQUFTLGtCQUFrQixTQUFTLG1CQUFtQiwyQkFBMkIscUJBQXFCLGlCQUFpQiwrQkFBK0IsZ0JBQWdCLG1CQUFtQjtBQUM5TixTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFHdkMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQXVEO0FBR2hFLFNBQVMsa0JBQWdGO0FBQ3pGLFNBQVMseUJBQXlCO0FBSWxDLFNBQVMsZ0NBQW9FO0FBQzdFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0JBQWtEO0FBQzNELFNBQVMsc0JBQXNCLDRDQUE0QztBQUMzRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQixrQkFBa0I7QUFDM0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBbUQ7QUFDNUQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsT0FBTztBQUNQ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
