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
import { reset } from "../../../../../base/browser/dom.js";
import { SerializableGrid } from "../../../../../base/browser/ui/grid/grid.js";
import { Orientation } from "../../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../../base/common/color.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, thenIfNotDisposed, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, observableValue, transaction } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { isDefined } from "../../../../../base/common/types.js";
import "./media/mergeEditor.css";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { ScrollType } from "../../../../../editor/common/editorCommon.js";
import { ITextResourceConfigurationService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../../nls.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { AbstractTextEditor } from "../../../../browser/parts/editor/textEditor.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../../common/editor.js";
import { applyTextEditorOptions } from "../../../../common/editor/editorOptions.js";
import { readTransientState, writeTransientState } from "../../../codeEditor/browser/toggleWordWrap.js";
import { MergeEditorInput } from "../mergeEditorInput.js";
import { deepMerge, PersistentStore } from "../utils.js";
import { BaseCodeEditorView } from "./editors/baseCodeEditorView.js";
import { ScrollSynchronizer } from "./scrollSynchronizer.js";
import { MergeEditorViewModel } from "./viewModel.js";
import { ViewZoneComputer } from "./viewZones.js";
import { ctxIsMergeEditor, ctxMergeBaseUri, ctxMergeEditorLayout, ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop, ctxMergeEditorShowNonConflictingChanges, ctxMergeResultUri } from "../../common/mergeEditor.js";
import { settingsSashBorder } from "../../../preferences/common/settingsEditorColorRegistry.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import "./colors.js";
import { InputCodeEditorView } from "./editors/inputCodeEditorView.js";
import { ResultCodeEditorView } from "./editors/resultCodeEditorView.js";
let MergeEditor = class extends AbstractTextEditor {
  constructor(group, instantiation, contextKeyService, telemetryService, storageService, themeService, textResourceConfigurationService, editorService, editorGroupService, fileService, _codeEditorService) {
    super(MergeEditor.ID, group, telemetryService, instantiation, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
    this.contextKeyService = contextKeyService;
    this._codeEditorService = _codeEditorService;
    this._sessionDisposables = new DisposableStore();
    this._viewModel = observableValue(this, void 0);
    this._grid = this._register(new MutableDisposable());
    this.input1View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 1, this._viewModel));
    this.baseView = observableValue(this, void 0);
    this.baseViewOptions = observableValue(this, void 0);
    this.input2View = this._register(this.instantiationService.createInstance(InputCodeEditorView, 2, this._viewModel));
    this.inputResultView = this._register(this.instantiationService.createInstance(ResultCodeEditorView, this._viewModel));
    this._layoutMode = this.instantiationService.createInstance(MergeEditorLayoutStore);
    this._layoutModeObs = observableValue(this, this._layoutMode.value);
    this._ctxIsMergeEditor = ctxIsMergeEditor.bindTo(this.contextKeyService);
    this._ctxUsesColumnLayout = ctxMergeEditorLayout.bindTo(this.contextKeyService);
    this._ctxShowBase = ctxMergeEditorShowBase.bindTo(this.contextKeyService);
    this._ctxShowBaseAtTop = ctxMergeEditorShowBaseAtTop.bindTo(this.contextKeyService);
    this._ctxResultUri = ctxMergeResultUri.bindTo(this.contextKeyService);
    this._ctxBaseUri = ctxMergeBaseUri.bindTo(this.contextKeyService);
    this._ctxShowNonConflictingChanges = ctxMergeEditorShowNonConflictingChanges.bindTo(this.contextKeyService);
    this._inputModel = observableValue(this, void 0);
    this.viewZoneComputer = new ViewZoneComputer(
      this.input1View.editor,
      this.input2View.editor,
      this.inputResultView.editor
    );
    this.scrollSynchronizer = this._register(new ScrollSynchronizer(this._viewModel, this.input1View, this.input2View, this.baseView, this.inputResultView, this._layoutModeObs));
    this._onDidChangeSizeConstraints = this._register(new Emitter());
    this.onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;
    this.baseViewDisposables = this._register(new DisposableStore());
    this.showNonConflictingChangesStore = this.instantiationService.createInstance(PersistentStore, "mergeEditor/showNonConflictingChanges");
    this.showNonConflictingChanges = observableValue(this, this.showNonConflictingChangesStore.get() ?? false);
  }
  get viewModel() {
    return this._viewModel;
  }
  get inputModel() {
    return this._inputModel;
  }
  get model() {
    return this.inputModel.get()?.model;
  }
  dispose() {
    this._sessionDisposables.dispose();
    this._ctxIsMergeEditor.reset();
    this._ctxUsesColumnLayout.reset();
    this._ctxShowNonConflictingChanges.reset();
    super.dispose();
  }
  get minimumWidth() {
    return this._layoutMode.value.kind === "mixed" ? this.input1View.view.minimumWidth + this.input2View.view.minimumWidth : this.input1View.view.minimumWidth + this.input2View.view.minimumWidth + this.inputResultView.view.minimumWidth;
  }
  // #endregion
  getTitle() {
    if (this.input) {
      return this.input.getName();
    }
    return localize("mergeEditor", "Text Merge Editor");
  }
  createEditorControl(parent, initialOptions) {
    this.rootHtmlElement = parent;
    parent.classList.add("merge-editor");
    this.applyLayout(this._layoutMode.value);
    this.applyOptions(initialOptions);
  }
  updateEditorControlOptions(options) {
    this.applyOptions(options);
  }
  applyOptions(options) {
    const inputOptions = deepMerge(options, {
      minimap: { enabled: false },
      glyphMargin: false,
      lineNumbersMinChars: 2
    });
    const readOnlyInputOptions = deepMerge(inputOptions, {
      readOnly: true,
      readOnlyMessage: void 0
    });
    this.input1View.updateOptions(readOnlyInputOptions);
    this.input2View.updateOptions(readOnlyInputOptions);
    this.baseViewOptions.set({ ...this.input2View.editor.getRawOptions() }, void 0);
    this.inputResultView.updateOptions(inputOptions);
  }
  getMainControl() {
    return this.inputResultView.editor;
  }
  layout(dimension) {
    this._grid.value?.layout(dimension.width, dimension.height);
  }
  async setInput(input, options, context, token) {
    if (!(input instanceof MergeEditorInput)) {
      throw new BugIndicatingError("ONLY MergeEditorInput is supported");
    }
    await super.setInput(input, options, context, token);
    this._sessionDisposables.clear();
    transaction((tx) => {
      this._viewModel.set(void 0, tx);
      this._inputModel.set(void 0, tx);
    });
    const inputModel = await input.resolve();
    const model = inputModel.model;
    const viewModel = this.instantiationService.createInstance(
      MergeEditorViewModel,
      model,
      this.input1View,
      this.input2View,
      this.inputResultView,
      this.baseView,
      this.showNonConflictingChanges
    );
    model.telemetry.reportMergeEditorOpened({
      combinableConflictCount: model.combinableConflictCount,
      conflictCount: model.conflictCount,
      baseTop: this._layoutModeObs.get().showBaseAtTop,
      baseVisible: this._layoutModeObs.get().showBase,
      isColumnView: this._layoutModeObs.get().kind === "columns"
    });
    transaction((tx) => {
      this._viewModel.set(viewModel, tx);
      this._inputModel.set(inputModel, tx);
    });
    this._sessionDisposables.add(viewModel);
    this._sessionDisposables.add(autorun((reader) => {
      const focusedType = viewModel.focusedEditorType.read(reader);
      if (!(input instanceof MergeEditorInput)) {
        return;
      }
      input.updateFocusedEditor(focusedType || "result");
    }));
    this._ctxResultUri.set(inputModel.resultUri.toString());
    this._ctxBaseUri.set(model.base.uri.toString());
    this._sessionDisposables.add(toDisposable(() => {
      this._ctxBaseUri.reset();
      this._ctxResultUri.reset();
    }));
    const viewZoneRegistrationStore = new DisposableStore();
    this._sessionDisposables.add(viewZoneRegistrationStore);
    this._sessionDisposables.add(autorunWithStore((reader) => {
      const baseView = this.baseView.read(reader);
      const resultScrollTop = this.inputResultView.editor.getScrollTop();
      this.scrollSynchronizer.stopSync();
      viewZoneRegistrationStore.clear();
      this.inputResultView.editor.changeViewZones((resultViewZoneAccessor) => {
        const layout = this._layoutModeObs.read(reader);
        const shouldAlignResult = layout.kind === "columns";
        const shouldAlignBase = layout.kind === "mixed" && !layout.showBaseAtTop;
        this.input1View.editor.changeViewZones((input1ViewZoneAccessor) => {
          this.input2View.editor.changeViewZones((input2ViewZoneAccessor) => {
            if (baseView) {
              baseView.editor.changeViewZones((baseViewZoneAccessor) => {
                viewZoneRegistrationStore.add(this.setViewZones(
                  reader,
                  viewModel,
                  this.input1View.editor,
                  input1ViewZoneAccessor,
                  this.input2View.editor,
                  input2ViewZoneAccessor,
                  baseView.editor,
                  baseViewZoneAccessor,
                  shouldAlignBase,
                  this.inputResultView.editor,
                  resultViewZoneAccessor,
                  shouldAlignResult
                ));
              });
            } else {
              viewZoneRegistrationStore.add(this.setViewZones(
                reader,
                viewModel,
                this.input1View.editor,
                input1ViewZoneAccessor,
                this.input2View.editor,
                input2ViewZoneAccessor,
                void 0,
                void 0,
                false,
                this.inputResultView.editor,
                resultViewZoneAccessor,
                shouldAlignResult
              ));
            }
          });
        });
      });
      this.inputResultView.editor.setScrollTop(resultScrollTop, ScrollType.Smooth);
      this.scrollSynchronizer.startSync();
      this.scrollSynchronizer.updateScrolling();
    }));
    const viewState = this.loadEditorViewState(input, context);
    if (viewState) {
      this._applyViewState(viewState);
    } else {
      this._sessionDisposables.add(thenIfNotDisposed(model.onInitialized, () => {
        const firstConflict = model.modifiedBaseRanges.get().find((r) => r.isConflicting);
        if (!firstConflict) {
          return;
        }
        this.input1View.editor.revealLineInCenter(firstConflict.input1Range.startLineNumber);
        transaction((tx) => {
          viewModel.setActiveModifiedBaseRange(firstConflict, tx);
        });
      }));
    }
    const mirrorWordWrapTransientState = (candidate) => {
      const candidateState = readTransientState(candidate, this._codeEditorService);
      writeTransientState(model.input2.textModel, candidateState, this._codeEditorService);
      writeTransientState(model.input1.textModel, candidateState, this._codeEditorService);
      writeTransientState(model.resultTextModel, candidateState, this._codeEditorService);
      const baseTextModel = this.baseView.get()?.editor.getModel();
      if (baseTextModel) {
        writeTransientState(baseTextModel, candidateState, this._codeEditorService);
      }
    };
    this._sessionDisposables.add(this._codeEditorService.onDidChangeTransientModelProperty((candidate) => {
      mirrorWordWrapTransientState(candidate);
    }));
    mirrorWordWrapTransientState(this.inputResultView.editor.getModel());
    const that = this;
    this._sessionDisposables.add(new class {
      constructor() {
        this._disposable = new DisposableStore();
        for (const model2 of this.baseInput1Input2()) {
          this._disposable.add(model2.onDidChangeContent(() => this._checkBaseInput1Input2AllEmpty()));
        }
      }
      dispose() {
        this._disposable.dispose();
      }
      *baseInput1Input2() {
        yield model.base;
        yield model.input1.textModel;
        yield model.input2.textModel;
      }
      _checkBaseInput1Input2AllEmpty() {
        for (const model2 of this.baseInput1Input2()) {
          if (model2.getValueLength() > 0) {
            return;
          }
        }
        that.editorService.replaceEditors(
          [{ editor: input, replacement: { resource: input.result, options: { preserveFocus: true } }, forceReplaceDirty: true }],
          that.group
        );
      }
    }());
  }
  setViewZones(reader, viewModel, input1Editor, input1ViewZoneAccessor, input2Editor, input2ViewZoneAccessor, baseEditor, baseViewZoneAccessor, shouldAlignBase, resultEditor, resultViewZoneAccessor, shouldAlignResult) {
    const input1ViewZoneIds = [];
    const input2ViewZoneIds = [];
    const baseViewZoneIds = [];
    const resultViewZoneIds = [];
    const viewZones = this.viewZoneComputer.computeViewZones(reader, viewModel, {
      codeLensesVisible: true,
      showNonConflictingChanges: this.showNonConflictingChanges.read(reader),
      shouldAlignBase,
      shouldAlignResult
    });
    const disposableStore = new DisposableStore();
    if (baseViewZoneAccessor) {
      for (const v of viewZones.baseViewZones) {
        v.create(baseViewZoneAccessor, baseViewZoneIds, disposableStore);
      }
    }
    for (const v of viewZones.resultViewZones) {
      v.create(resultViewZoneAccessor, resultViewZoneIds, disposableStore);
    }
    for (const v of viewZones.input1ViewZones) {
      v.create(input1ViewZoneAccessor, input1ViewZoneIds, disposableStore);
    }
    for (const v of viewZones.input2ViewZones) {
      v.create(input2ViewZoneAccessor, input2ViewZoneIds, disposableStore);
    }
    disposableStore.add({
      dispose: () => {
        input1Editor.changeViewZones((a) => {
          for (const zone of input1ViewZoneIds) {
            a.removeZone(zone);
          }
        });
        input2Editor.changeViewZones((a) => {
          for (const zone of input2ViewZoneIds) {
            a.removeZone(zone);
          }
        });
        baseEditor?.changeViewZones((a) => {
          for (const zone of baseViewZoneIds) {
            a.removeZone(zone);
          }
        });
        resultEditor.changeViewZones((a) => {
          for (const zone of resultViewZoneIds) {
            a.removeZone(zone);
          }
        });
      }
    });
    return disposableStore;
  }
  setOptions(options) {
    super.setOptions(options);
    if (options) {
      applyTextEditorOptions(options, this.inputResultView.editor, ScrollType.Smooth);
    }
  }
  clearInput() {
    super.clearInput();
    this._sessionDisposables.clear();
    for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
      editor.setModel(null);
    }
  }
  focus() {
    super.focus();
    (this.getControl() ?? this.inputResultView.editor).focus();
  }
  hasFocus() {
    for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
      if (editor.hasTextFocus()) {
        return true;
      }
    }
    return super.hasFocus();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    for (const { editor } of [this.input1View, this.input2View, this.inputResultView]) {
      if (visible) {
        editor.onVisible();
      } else {
        editor.onHide();
      }
    }
    this._ctxIsMergeEditor.set(visible);
  }
  // ---- interact with "outside world" via`getControl`, `scopedContextKeyService`: we only expose the result-editor keep the others internal
  getControl() {
    return this.inputResultView.editor;
  }
  get scopedContextKeyService() {
    const control = this.getControl();
    return control?.invokeWithinContext((accessor) => accessor.get(IContextKeyService));
  }
  // --- layout
  toggleBase() {
    this.setLayout({
      ...this._layoutMode.value,
      showBase: !this._layoutMode.value.showBase
    });
  }
  toggleShowBaseTop() {
    const showBaseTop = this._layoutMode.value.showBase && this._layoutMode.value.showBaseAtTop;
    this.setLayout({
      ...this._layoutMode.value,
      showBaseAtTop: true,
      showBase: !showBaseTop
    });
  }
  toggleShowBaseCenter() {
    const showBaseCenter = this._layoutMode.value.showBase && !this._layoutMode.value.showBaseAtTop;
    this.setLayout({
      ...this._layoutMode.value,
      showBaseAtTop: false,
      showBase: !showBaseCenter
    });
  }
  setLayoutKind(kind) {
    this.setLayout({
      ...this._layoutMode.value,
      kind
    });
  }
  setLayout(newLayout) {
    const value = this._layoutMode.value;
    if (JSON.stringify(value) === JSON.stringify(newLayout)) {
      return;
    }
    this.model?.telemetry.reportLayoutChange({
      baseTop: newLayout.showBaseAtTop,
      baseVisible: newLayout.showBase,
      isColumnView: newLayout.kind === "columns"
    });
    this.applyLayout(newLayout);
  }
  applyLayout(layout) {
    transaction((tx) => {
      if (layout.showBase && !this.baseView.get()) {
        this.baseViewDisposables.clear();
        const baseView = this.baseViewDisposables.add(
          this.instantiationService.createInstance(
            BaseCodeEditorView,
            this.viewModel
          )
        );
        this.baseViewDisposables.add(autorun((reader) => {
          const options = this.baseViewOptions.read(reader);
          if (options) {
            baseView.updateOptions(options);
          }
        }));
        this.baseView.set(baseView, tx);
      } else if (!layout.showBase && this.baseView.get()) {
        this.baseView.set(void 0, tx);
        this.baseViewDisposables.clear();
      }
      if (layout.kind === "mixed") {
        this.setGrid([
          layout.showBaseAtTop && layout.showBase ? {
            size: 38,
            data: this.baseView.get().view
          } : void 0,
          {
            size: 38,
            groups: [
              { data: this.input1View.view },
              !layout.showBaseAtTop && layout.showBase ? { data: this.baseView.get().view } : void 0,
              { data: this.input2View.view }
            ].filter(isDefined)
          },
          {
            size: 62,
            data: this.inputResultView.view
          }
        ].filter(isDefined));
      } else if (layout.kind === "columns") {
        this.setGrid([
          layout.showBase ? {
            size: 40,
            data: this.baseView.get().view
          } : void 0,
          {
            size: 60,
            groups: [{ data: this.input1View.view }, { data: this.inputResultView.view }, { data: this.input2View.view }]
          }
        ].filter(isDefined));
      }
      this._layoutMode.value = layout;
      this._ctxUsesColumnLayout.set(layout.kind);
      this._ctxShowBase.set(layout.showBase);
      this._ctxShowBaseAtTop.set(layout.showBaseAtTop);
      this._onDidChangeSizeConstraints.fire();
      this._layoutModeObs.set(layout, tx);
    });
  }
  setGrid(descriptor) {
    let width = -1;
    let height = -1;
    if (this._grid.value) {
      width = this._grid.value.width;
      height = this._grid.value.height;
    }
    this._grid.value = SerializableGrid.from({
      orientation: Orientation.VERTICAL,
      size: 100,
      groups: descriptor
    }, {
      styles: { separatorBorder: this.theme.getColor(settingsSashBorder) ?? Color.transparent },
      proportionalLayout: true
    });
    reset(this.rootHtmlElement, this._grid.value.element);
    if (width !== -1) {
      this._grid.value.layout(width, height);
    }
  }
  _applyViewState(state) {
    if (!state) {
      return;
    }
    this.inputResultView.editor.restoreViewState(state);
    if (state.input1State) {
      this.input1View.editor.restoreViewState(state.input1State);
    }
    if (state.input2State) {
      this.input2View.editor.restoreViewState(state.input2State);
    }
    if (state.focusIndex >= 0) {
      [this.input1View.editor, this.input2View.editor, this.inputResultView.editor][state.focusIndex].focus();
    }
  }
  computeEditorViewState(resource) {
    if (!isEqual(this.inputModel.get()?.resultUri, resource)) {
      return void 0;
    }
    const result = this.inputResultView.editor.saveViewState();
    if (!result) {
      return void 0;
    }
    const input1State = this.input1View.editor.saveViewState() ?? void 0;
    const input2State = this.input2View.editor.saveViewState() ?? void 0;
    const focusIndex = [this.input1View.editor, this.input2View.editor, this.inputResultView.editor].findIndex((editor) => editor.hasWidgetFocus());
    return { ...result, input1State, input2State, focusIndex };
  }
  tracksEditorViewState(input) {
    return input instanceof MergeEditorInput;
  }
  toggleShowNonConflictingChanges() {
    this.showNonConflictingChanges.set(!this.showNonConflictingChanges.get(), void 0);
    this.showNonConflictingChangesStore.set(this.showNonConflictingChanges.get());
    this._ctxShowNonConflictingChanges.set(this.showNonConflictingChanges.get());
  }
};
MergeEditor.ID = "mergeEditor";
MergeEditor = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IEditorGroupsService),
  __decorateParam(9, IFileService),
  __decorateParam(10, ICodeEditorService)
], MergeEditor);
let MergeEditorLayoutStore = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    this._value = { kind: "mixed", showBase: false, showBaseAtTop: true };
    const value = _storageService.get(MergeEditorLayoutStore._key, StorageScope.PROFILE, "mixed");
    if (value === "mixed" || value === "columns") {
      this._value = { kind: value, showBase: false, showBaseAtTop: true };
    } else if (value) {
      try {
        this._value = JSON.parse(value);
      } catch (e) {
        onUnexpectedError(e);
      }
    }
  }
  get value() {
    return this._value;
  }
  set value(value) {
    if (this._value !== value) {
      this._value = value;
      this._storageService.store(MergeEditorLayoutStore._key, JSON.stringify(this._value), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
};
MergeEditorLayoutStore._key = "mergeEditor/layout";
MergeEditorLayoutStore = __decorateClass([
  __decorateParam(0, IStorageService)
], MergeEditorLayoutStore);
let MergeEditorOpenHandlerContribution = class extends Disposable {
  constructor(_editorService, codeEditorService) {
    super();
    this._editorService = _editorService;
    this._store.add(codeEditorService.registerCodeEditorOpenHandler(this.openCodeEditorFromMergeEditor.bind(this)));
  }
  async openCodeEditorFromMergeEditor(input, _source, sideBySide) {
    const activePane = this._editorService.activeEditorPane;
    if (!sideBySide && input.options && activePane instanceof MergeEditor && activePane.getControl() && activePane.input instanceof MergeEditorInput && isEqual(input.resource, activePane.input.result)) {
      const targetEditor = activePane.getControl();
      applyTextEditorOptions(input.options, targetEditor, ScrollType.Smooth);
      return targetEditor;
    }
    return null;
  }
};
MergeEditorOpenHandlerContribution = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, ICodeEditorService)
], MergeEditorOpenHandlerContribution);
let MergeEditorResolverContribution = class extends Disposable {
  constructor(editorResolverService, instantiationService) {
    super();
    const mergeEditorInputFactory = (mergeEditor) => {
      return {
        editor: instantiationService.createInstance(
          MergeEditorInput,
          mergeEditor.base.resource,
          {
            uri: mergeEditor.input1.resource,
            title: mergeEditor.input1.label ?? basename(mergeEditor.input1.resource),
            description: mergeEditor.input1.description ?? "",
            detail: mergeEditor.input1.detail
          },
          {
            uri: mergeEditor.input2.resource,
            title: mergeEditor.input2.label ?? basename(mergeEditor.input2.resource),
            description: mergeEditor.input2.description ?? "",
            detail: mergeEditor.input2.detail
          },
          mergeEditor.result.resource
        )
      };
    };
    this._register(editorResolverService.registerEditor(
      `*`,
      {
        id: DEFAULT_EDITOR_ASSOCIATION.id,
        label: DEFAULT_EDITOR_ASSOCIATION.displayName,
        detail: DEFAULT_EDITOR_ASSOCIATION.providerDisplayName,
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createMergeEditorInput: mergeEditorInputFactory
      }
    ));
  }
};
MergeEditorResolverContribution.ID = "workbench.contrib.mergeEditorResolver";
MergeEditorResolverContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService),
  __decorateParam(1, IInstantiationService)
], MergeEditorResolverContribution);
export {
  MergeEditor,
  MergeEditorOpenHandlerContribution,
  MergeEditorResolverContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxtZXJnZUVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpbWVuc2lvbiwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEdyaWQsIEdyaWROb2RlRGVzY3JpcHRvciwgSVZpZXcsIFNlcmlhbGl6YWJsZUdyaWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRoZW5JZk5vdERpc3Bvc2VkLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1bldpdGhTdG9yZSwgSU9ic2VydmFibGUsIElSZWFkZXIsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvbWVyZ2VFZGl0b3IuY3NzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJVmlld1pvbmVDaGFuZ2VBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgYXMgSUNvZGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclZpZXdTdGF0ZSwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucywgSVRleHRFZGl0b3JPcHRpb25zLCBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHRFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0RWRpdG9yLmpzJztcbmltcG9ydCB7IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLCBFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBJRWRpdG9yT3BlbkNvbnRleHQsIElSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBhcHBseVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IHJlYWRUcmFuc2llbnRTdGF0ZSwgd3JpdGVUcmFuc2llbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci90b2dnbGVXb3JkV3JhcC5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vbWVyZ2VFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTWVyZ2VFZGl0b3JJbnB1dE1vZGVsIH0gZnJvbSAnLi4vbWVyZ2VFZGl0b3JJbnB1dE1vZGVsLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yTW9kZWwgfSBmcm9tICcuLi9tb2RlbC9tZXJnZUVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IGRlZXBNZXJnZSwgUGVyc2lzdGVudFN0b3JlIH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgQmFzZUNvZGVFZGl0b3JWaWV3IH0gZnJvbSAnLi9lZGl0b3JzL2Jhc2VDb2RlRWRpdG9yVmlldy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxTeW5jaHJvbml6ZXIgfSBmcm9tICcuL3Njcm9sbFN5bmNocm9uaXplci5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IFZpZXdab25lQ29tcHV0ZXIgfSBmcm9tICcuL3ZpZXdab25lcy5qcyc7XG5pbXBvcnQgeyBjdHhJc01lcmdlRWRpdG9yLCBjdHhNZXJnZUJhc2VVcmksIGN0eE1lcmdlRWRpdG9yTGF5b3V0LCBjdHhNZXJnZUVkaXRvclNob3dCYXNlLCBjdHhNZXJnZUVkaXRvclNob3dCYXNlQXRUb3AsIGN0eE1lcmdlRWRpdG9yU2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcywgY3R4TWVyZ2VSZXN1bHRVcmksIE1lcmdlRWRpdG9yTGF5b3V0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXJnZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc1Nhc2hCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi9wcmVmZXJlbmNlcy9jb21tb24vc2V0dGluZ3NFZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSwgTWVyZ2VFZGl0b3JJbnB1dEZhY3RvcnlGdW5jdGlvbiwgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL2NvbG9ycy5qcyc7XG5pbXBvcnQgeyBJbnB1dENvZGVFZGl0b3JWaWV3IH0gZnJvbSAnLi9lZGl0b3JzL2lucHV0Q29kZUVkaXRvclZpZXcuanMnO1xuaW1wb3J0IHsgUmVzdWx0Q29kZUVkaXRvclZpZXcgfSBmcm9tICcuL2VkaXRvcnMvcmVzdWx0Q29kZUVkaXRvclZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgTWVyZ2VFZGl0b3IgZXh0ZW5kcyBBYnN0cmFjdFRleHRFZGl0b3I8SU1lcmdlRWRpdG9yVmlld1N0YXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ21lcmdlRWRpdG9yJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlbDtcblxuXHRwdWJsaWMgZ2V0IHZpZXdNb2RlbCgpOiBJT2JzZXJ2YWJsZTxNZXJnZUVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl92aWV3TW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIHJvb3RIdG1sRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXQxVmlldztcblx0cHJpdmF0ZSByZWFkb25seSBiYXNlVmlldztcblx0cHJpdmF0ZSByZWFkb25seSBiYXNlVmlld09wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXQyVmlldztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0UmVzdWx0Vmlldztcblx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0TW9kZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0TW9kZU9icztcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4SXNNZXJnZUVkaXRvcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFVzZXNDb2x1bW5MYXlvdXQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFNob3dCYXNlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U2hvd0Jhc2VBdFRvcDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4UmVzdWx0VXJpOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhCYXNlVXJpOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhTaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRNb2RlbDtcblx0cHVibGljIGdldCBpbnB1dE1vZGVsKCk6IElPYnNlcnZhYmxlPElNZXJnZUVkaXRvcklucHV0TW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXRNb2RlbDtcblx0fVxuXHRwdWJsaWMgZ2V0IG1vZGVsKCk6IE1lcmdlRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmlucHV0TW9kZWwuZ2V0KCk/Lm1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3Wm9uZUNvbXB1dGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2Nyb2xsU3luY2hyb25pemVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKE1lcmdlRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgaW5zdGFudGlhdGlvbiwgc3RvcmFnZVNlcnZpY2UsIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3VwU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl92aWV3TW9kZWwgPSBvYnNlcnZhYmxlVmFsdWU8TWVyZ2VFZGl0b3JWaWV3TW9kZWwgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fZ3JpZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxHcmlkPElWaWV3Pj4oKSk7XG5cdFx0dGhpcy5pbnB1dDFWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnB1dENvZGVFZGl0b3JWaWV3LCAxLCB0aGlzLl92aWV3TW9kZWwpKTtcblx0XHR0aGlzLmJhc2VWaWV3ID0gb2JzZXJ2YWJsZVZhbHVlPEJhc2VDb2RlRWRpdG9yVmlldyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmJhc2VWaWV3T3B0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seTxJQ29kZUVkaXRvck9wdGlvbnM+IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuaW5wdXQyVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5wdXRDb2RlRWRpdG9yVmlldywgMiwgdGhpcy5fdmlld01vZGVsKSk7XG5cdFx0dGhpcy5pbnB1dFJlc3VsdFZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc3VsdENvZGVFZGl0b3JWaWV3LCB0aGlzLl92aWV3TW9kZWwpKTtcblx0XHR0aGlzLl9sYXlvdXRNb2RlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZXJnZUVkaXRvckxheW91dFN0b3JlKTtcblx0XHR0aGlzLl9sYXlvdXRNb2RlT2JzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRoaXMuX2xheW91dE1vZGUudmFsdWUpO1xuXHRcdHRoaXMuX2N0eElzTWVyZ2VFZGl0b3IgPSBjdHhJc01lcmdlRWRpdG9yLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhVc2VzQ29sdW1uTGF5b3V0ID0gY3R4TWVyZ2VFZGl0b3JMYXlvdXQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFNob3dCYXNlID0gY3R4TWVyZ2VFZGl0b3JTaG93QmFzZS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4U2hvd0Jhc2VBdFRvcCA9IGN0eE1lcmdlRWRpdG9yU2hvd0Jhc2VBdFRvcC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4UmVzdWx0VXJpID0gY3R4TWVyZ2VSZXN1bHRVcmkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eEJhc2VVcmkgPSBjdHhNZXJnZUJhc2VVcmkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFNob3dOb25Db25mbGljdGluZ0NoYW5nZXMgPSBjdHhNZXJnZUVkaXRvclNob3dOb25Db25mbGljdGluZ0NoYW5nZXMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2lucHV0TW9kZWwgPSBvYnNlcnZhYmxlVmFsdWU8SU1lcmdlRWRpdG9ySW5wdXRNb2RlbCB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnZpZXdab25lQ29tcHV0ZXIgPSBuZXcgVmlld1pvbmVDb21wdXRlcihcblx0XHRcdHRoaXMuaW5wdXQxVmlldy5lZGl0b3IsXG5cdFx0XHR0aGlzLmlucHV0MlZpZXcuZWRpdG9yLFxuXHRcdFx0dGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yLFxuXHRcdCk7XG5cdFx0dGhpcy5zY3JvbGxTeW5jaHJvbml6ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Nyb2xsU3luY2hyb25pemVyKHRoaXMuX3ZpZXdNb2RlbCwgdGhpcy5pbnB1dDFWaWV3LCB0aGlzLmlucHV0MlZpZXcsIHRoaXMuYmFzZVZpZXcsIHRoaXMuaW5wdXRSZXN1bHRWaWV3LCB0aGlzLl9sYXlvdXRNb2RlT2JzKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzID0gdGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMuZXZlbnQ7XG5cdFx0dGhpcy5iYXNlVmlld0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXNTdG9yZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGVyc2lzdGVudFN0b3JlPGJvb2xlYW4+LCAnbWVyZ2VFZGl0b3Ivc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcycpO1xuXHRcdHRoaXMuc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXNTdG9yZS5nZXQoKSA/PyBmYWxzZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3R4SXNNZXJnZUVkaXRvci5yZXNldCgpO1xuXHRcdHRoaXMuX2N0eFVzZXNDb2x1bW5MYXlvdXQucmVzZXQoKTtcblx0XHR0aGlzLl9jdHhTaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLnJlc2V0KCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBsYXlvdXQgY29uc3RyYWludHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cztcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHM6IEV2ZW50PHZvaWQ+O1xuXG5cdG92ZXJyaWRlIGdldCBtaW5pbXVtV2lkdGgoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dE1vZGUudmFsdWUua2luZCA9PT0gJ21peGVkJ1xuXHRcdFx0PyB0aGlzLmlucHV0MVZpZXcudmlldy5taW5pbXVtV2lkdGggKyB0aGlzLmlucHV0MlZpZXcudmlldy5taW5pbXVtV2lkdGhcblx0XHRcdDogdGhpcy5pbnB1dDFWaWV3LnZpZXcubWluaW11bVdpZHRoICsgdGhpcy5pbnB1dDJWaWV3LnZpZXcubWluaW11bVdpZHRoICsgdGhpcy5pbnB1dFJlc3VsdFZpZXcudmlldy5taW5pbXVtV2lkdGg7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZ2V0VGl0bGUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5wdXQuZ2V0TmFtZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsb2NhbGl6ZSgnbWVyZ2VFZGl0b3InLCBcIlRleHQgTWVyZ2UgRWRpdG9yXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvckNvbnRyb2wocGFyZW50OiBIVE1MRWxlbWVudCwgaW5pdGlhbE9wdGlvbnM6IElDb2RlRWRpdG9yT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMucm9vdEh0bWxFbGVtZW50ID0gcGFyZW50O1xuXHRcdHBhcmVudC5jbGFzc0xpc3QuYWRkKCdtZXJnZS1lZGl0b3InKTtcblx0XHR0aGlzLmFwcGx5TGF5b3V0KHRoaXMuX2xheW91dE1vZGUudmFsdWUpO1xuXHRcdHRoaXMuYXBwbHlPcHRpb25zKGluaXRpYWxPcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVFZGl0b3JDb250cm9sT3B0aW9ucyhvcHRpb25zOiBJQ29kZUVkaXRvck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLmFwcGx5T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlPcHRpb25zKG9wdGlvbnM6IElDb2RlRWRpdG9yT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0T3B0aW9uczogSUNvZGVFZGl0b3JPcHRpb25zID0gZGVlcE1lcmdlPElDb2RlRWRpdG9yT3B0aW9ucz4ob3B0aW9ucywge1xuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0Z2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMlxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVhZE9ubHlJbnB1dE9wdGlvbnM6IElDb2RlRWRpdG9yT3B0aW9ucyA9IGRlZXBNZXJnZTxJQ29kZUVkaXRvck9wdGlvbnM+KGlucHV0T3B0aW9ucywge1xuXHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRyZWFkT25seU1lc3NhZ2U6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5pbnB1dDFWaWV3LnVwZGF0ZU9wdGlvbnMocmVhZE9ubHlJbnB1dE9wdGlvbnMpO1xuXHRcdHRoaXMuaW5wdXQyVmlldy51cGRhdGVPcHRpb25zKHJlYWRPbmx5SW5wdXRPcHRpb25zKTtcblx0XHR0aGlzLmJhc2VWaWV3T3B0aW9ucy5zZXQoeyAuLi50aGlzLmlucHV0MlZpZXcuZWRpdG9yLmdldFJhd09wdGlvbnMoKSB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuaW5wdXRSZXN1bHRWaWV3LnVwZGF0ZU9wdGlvbnMoaW5wdXRPcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRNYWluQ29udHJvbCgpOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRSZXN1bHRWaWV3LmVkaXRvcjtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2dyaWQudmFsdWU/LmxheW91dChkaW1lbnNpb24ud2lkdGgsIGRpbWVuc2lvbi5oZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShpbnB1dCBpbnN0YW5jZW9mIE1lcmdlRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdPTkxZIE1lcmdlRWRpdG9ySW5wdXQgaXMgc3VwcG9ydGVkJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl92aWV3TW9kZWwuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0dGhpcy5faW5wdXRNb2RlbC5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbnB1dE1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gaW5wdXRNb2RlbC5tb2RlbDtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNZXJnZUVkaXRvclZpZXdNb2RlbCxcblx0XHRcdG1vZGVsLFxuXHRcdFx0dGhpcy5pbnB1dDFWaWV3LFxuXHRcdFx0dGhpcy5pbnB1dDJWaWV3LFxuXHRcdFx0dGhpcy5pbnB1dFJlc3VsdFZpZXcsXG5cdFx0XHR0aGlzLmJhc2VWaWV3LFxuXHRcdFx0dGhpcy5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLFxuXHRcdCk7XG5cblx0XHRtb2RlbC50ZWxlbWV0cnkucmVwb3J0TWVyZ2VFZGl0b3JPcGVuZWQoe1xuXHRcdFx0Y29tYmluYWJsZUNvbmZsaWN0Q291bnQ6IG1vZGVsLmNvbWJpbmFibGVDb25mbGljdENvdW50LFxuXHRcdFx0Y29uZmxpY3RDb3VudDogbW9kZWwuY29uZmxpY3RDb3VudCxcblxuXHRcdFx0YmFzZVRvcDogdGhpcy5fbGF5b3V0TW9kZU9icy5nZXQoKS5zaG93QmFzZUF0VG9wLFxuXHRcdFx0YmFzZVZpc2libGU6IHRoaXMuX2xheW91dE1vZGVPYnMuZ2V0KCkuc2hvd0Jhc2UsXG5cdFx0XHRpc0NvbHVtblZpZXc6IHRoaXMuX2xheW91dE1vZGVPYnMuZ2V0KCkua2luZCA9PT0gJ2NvbHVtbnMnLFxuXHRcdH0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fdmlld01vZGVsLnNldCh2aWV3TW9kZWwsIHR4KTtcblx0XHRcdHRoaXMuX2lucHV0TW9kZWwuc2V0KGlucHV0TW9kZWwsIHR4KTtcblx0XHR9KTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbCk7XG5cblx0XHQvLyBUcmFjayBmb2N1cyBjaGFuZ2VzIHRvIHVwZGF0ZSB0aGUgZWRpdG9yIG5hbWVcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIGZvY3VzZWQgZWRpdG9yIG5hbWUgYmFzZWQgb24gZm9jdXMgKi9cblx0XHRcdGNvbnN0IGZvY3VzZWRUeXBlID0gdmlld01vZGVsLmZvY3VzZWRFZGl0b3JUeXBlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKCEoaW5wdXQgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcklucHV0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlucHV0LnVwZGF0ZUZvY3VzZWRFZGl0b3IoZm9jdXNlZFR5cGUgfHwgJ3Jlc3VsdCcpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNldC91bnNldCBjb250ZXh0IGtleXMgYmFzZWQgb24gaW5wdXRcblx0XHR0aGlzLl9jdHhSZXN1bHRVcmkuc2V0KGlucHV0TW9kZWwucmVzdWx0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuX2N0eEJhc2VVcmkuc2V0KG1vZGVsLmJhc2UudXJpLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2N0eEJhc2VVcmkucmVzZXQoKTtcblx0XHRcdHRoaXMuX2N0eFJlc3VsdFVyaS5yZXNldCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZpZXdab25lUmVnaXN0cmF0aW9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh2aWV3Wm9uZVJlZ2lzdHJhdGlvblN0b3JlKTtcblx0XHQvLyBTZXQgdGhlIHZpZXcgem9uZXMgYmVmb3JlIHJlc3RvcmluZyB2aWV3IHN0YXRlIVxuXHRcdC8vIE90aGVyd2lzZSBzY3JvbGxpbmcgd2lsbCBiZSBvZmZcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgYWxpZ25tZW50IHZpZXcgem9uZXMgKi9cblx0XHRcdGNvbnN0IGJhc2VWaWV3ID0gdGhpcy5iYXNlVmlldy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdFNjcm9sbFRvcCA9IHRoaXMuaW5wdXRSZXN1bHRWaWV3LmVkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHRcdHRoaXMuc2Nyb2xsU3luY2hyb25pemVyLnN0b3BTeW5jKCk7XG5cblx0XHRcdHZpZXdab25lUmVnaXN0cmF0aW9uU3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0dGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhyZXN1bHRWaWV3Wm9uZUFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fbGF5b3V0TW9kZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHNob3VsZEFsaWduUmVzdWx0ID0gbGF5b3V0LmtpbmQgPT09ICdjb2x1bW5zJztcblx0XHRcdFx0Y29uc3Qgc2hvdWxkQWxpZ25CYXNlID0gbGF5b3V0LmtpbmQgPT09ICdtaXhlZCcgJiYgIWxheW91dC5zaG93QmFzZUF0VG9wO1xuXG5cdFx0XHRcdHRoaXMuaW5wdXQxVmlldy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGlucHV0MVZpZXdab25lQWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMuaW5wdXQyVmlldy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGlucHV0MlZpZXdab25lQWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGJhc2VWaWV3KSB7XG5cdFx0XHRcdFx0XHRcdGJhc2VWaWV3LmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYmFzZVZpZXdab25lQWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHZpZXdab25lUmVnaXN0cmF0aW9uU3RvcmUuYWRkKHRoaXMuc2V0Vmlld1pvbmVzKHJlYWRlcixcblx0XHRcdFx0XHRcdFx0XHRcdHZpZXdNb2RlbCxcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuaW5wdXQxVmlldy5lZGl0b3IsXG5cdFx0XHRcdFx0XHRcdFx0XHRpbnB1dDFWaWV3Wm9uZUFjY2Vzc29yLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5pbnB1dDJWaWV3LmVkaXRvcixcblx0XHRcdFx0XHRcdFx0XHRcdGlucHV0MlZpZXdab25lQWNjZXNzb3IsXG5cdFx0XHRcdFx0XHRcdFx0XHRiYXNlVmlldy5lZGl0b3IsXG5cdFx0XHRcdFx0XHRcdFx0XHRiYXNlVmlld1pvbmVBY2Nlc3Nvcixcblx0XHRcdFx0XHRcdFx0XHRcdHNob3VsZEFsaWduQmFzZSxcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuaW5wdXRSZXN1bHRWaWV3LmVkaXRvcixcblx0XHRcdFx0XHRcdFx0XHRcdHJlc3VsdFZpZXdab25lQWNjZXNzb3IsXG5cdFx0XHRcdFx0XHRcdFx0XHRzaG91bGRBbGlnblJlc3VsdFxuXHRcdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHZpZXdab25lUmVnaXN0cmF0aW9uU3RvcmUuYWRkKHRoaXMuc2V0Vmlld1pvbmVzKHJlYWRlcixcblx0XHRcdFx0XHRcdFx0XHR2aWV3TW9kZWwsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5pbnB1dDFWaWV3LmVkaXRvcixcblx0XHRcdFx0XHRcdFx0XHRpbnB1dDFWaWV3Wm9uZUFjY2Vzc29yLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuaW5wdXQyVmlldy5lZGl0b3IsXG5cdFx0XHRcdFx0XHRcdFx0aW5wdXQyVmlld1pvbmVBY2Nlc3Nvcixcblx0XHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuaW5wdXRSZXN1bHRWaWV3LmVkaXRvcixcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHRWaWV3Wm9uZUFjY2Vzc29yLFxuXHRcdFx0XHRcdFx0XHRcdHNob3VsZEFsaWduUmVzdWx0XG5cdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmlucHV0UmVzdWx0Vmlldy5lZGl0b3Iuc2V0U2Nyb2xsVG9wKHJlc3VsdFNjcm9sbFRvcCwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXG5cdFx0XHR0aGlzLnNjcm9sbFN5bmNocm9uaXplci5zdGFydFN5bmMoKTtcblx0XHRcdHRoaXMuc2Nyb2xsU3luY2hyb25pemVyLnVwZGF0ZVNjcm9sbGluZygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMubG9hZEVkaXRvclZpZXdTdGF0ZShpbnB1dCwgY29udGV4dCk7XG5cdFx0aWYgKHZpZXdTdGF0ZSkge1xuXHRcdFx0dGhpcy5fYXBwbHlWaWV3U3RhdGUodmlld1N0YXRlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh0aGVuSWZOb3REaXNwb3NlZChtb2RlbC5vbkluaXRpYWxpemVkLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0Q29uZmxpY3QgPSBtb2RlbC5tb2RpZmllZEJhc2VSYW5nZXMuZ2V0KCkuZmluZChyID0+IHIuaXNDb25mbGljdGluZyk7XG5cdFx0XHRcdGlmICghZmlyc3RDb25mbGljdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmlucHV0MVZpZXcuZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcihmaXJzdENvbmZsaWN0LmlucHV0MVJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHNldEFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlICovXG5cdFx0XHRcdFx0dmlld01vZGVsLnNldEFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlKGZpcnN0Q29uZmxpY3QsIHR4KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gd29yZCB3cmFwIHNwZWNpYWwgY2FzZSAtIHN5bmMgdHJhbnNpZW50IHN0YXRlIGZyb20gcmVzdWx0IG1vZGVsIHRvIGlucHV0WzF8Ml0gbW9kZWxzXG5cdFx0Y29uc3QgbWlycm9yV29yZFdyYXBUcmFuc2llbnRTdGF0ZSA9IChjYW5kaWRhdGU6IElUZXh0TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZVN0YXRlID0gcmVhZFRyYW5zaWVudFN0YXRlKGNhbmRpZGF0ZSwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0XHR3cml0ZVRyYW5zaWVudFN0YXRlKG1vZGVsLmlucHV0Mi50ZXh0TW9kZWwsIGNhbmRpZGF0ZVN0YXRlLCB0aGlzLl9jb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0XHR3cml0ZVRyYW5zaWVudFN0YXRlKG1vZGVsLmlucHV0MS50ZXh0TW9kZWwsIGNhbmRpZGF0ZVN0YXRlLCB0aGlzLl9jb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0XHR3cml0ZVRyYW5zaWVudFN0YXRlKG1vZGVsLnJlc3VsdFRleHRNb2RlbCwgY2FuZGlkYXRlU3RhdGUsIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgYmFzZVRleHRNb2RlbCA9IHRoaXMuYmFzZVZpZXcuZ2V0KCk/LmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGJhc2VUZXh0TW9kZWwpIHtcblx0XHRcdFx0d3JpdGVUcmFuc2llbnRTdGF0ZShiYXNlVGV4dE1vZGVsLCBjYW5kaWRhdGVTdGF0ZSwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5vbkRpZENoYW5nZVRyYW5zaWVudE1vZGVsUHJvcGVydHkoY2FuZGlkYXRlID0+IHtcblx0XHRcdG1pcnJvcldvcmRXcmFwVHJhbnNpZW50U3RhdGUoY2FuZGlkYXRlKTtcblx0XHR9KSk7XG5cdFx0bWlycm9yV29yZFdyYXBUcmFuc2llbnRTdGF0ZSh0aGlzLmlucHV0UmVzdWx0Vmlldy5lZGl0b3IuZ2V0TW9kZWwoKSEpO1xuXG5cdFx0Ly8gZGV0ZWN0IHdoZW4gYmFzZSwgaW5wdXQxLCBhbmQgaW5wdXQyIGJlY29tZSBlbXB0eSBhbmQgcmVwbGFjZSBUSElTIGVkaXRvciB3aXRoIGl0cyByZXN1bHQgZWRpdG9yXG5cdFx0Ly8gVE9ET0Bqcmlla2VuQGhlZGlldCB0aGlzIG5lZWRzIGEgYmV0dGVyL2NsZWFuZXIgc29sdXRpb25cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTU1OTQwXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3Mge1xuXG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLmJhc2VJbnB1dDFJbnB1dDIoKSkge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLl9jaGVja0Jhc2VJbnB1dDFJbnB1dDJBbGxFbXB0eSgpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgKmJhc2VJbnB1dDFJbnB1dDIoKSB7XG5cdFx0XHRcdHlpZWxkIG1vZGVsLmJhc2U7XG5cdFx0XHRcdHlpZWxkIG1vZGVsLmlucHV0MS50ZXh0TW9kZWw7XG5cdFx0XHRcdHlpZWxkIG1vZGVsLmlucHV0Mi50ZXh0TW9kZWw7XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgX2NoZWNrQmFzZUlucHV0MUlucHV0MkFsbEVtcHR5KCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMuYmFzZUlucHV0MUlucHV0MigpKSB7XG5cdFx0XHRcdFx0aWYgKG1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGFsbCBlbXB0eSAtPiByZXBsYWNlIHRoaXMgZWRpdG9yIHdpdGggYSBub3JtYWwgZWRpdG9yIGZvciByZXN1bHRcblx0XHRcdFx0dGhhdC5lZGl0b3JTZXJ2aWNlLnJlcGxhY2VFZGl0b3JzKFxuXHRcdFx0XHRcdFt7IGVkaXRvcjogaW5wdXQsIHJlcGxhY2VtZW50OiB7IHJlc291cmNlOiBpbnB1dC5yZXN1bHQsIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0sIGZvcmNlUmVwbGFjZURpcnR5OiB0cnVlIH1dLFxuXHRcdFx0XHRcdHRoYXQuZ3JvdXBcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Vmlld1pvbmVzKFxuXHRcdHJlYWRlcjogSVJlYWRlcixcblx0XHR2aWV3TW9kZWw6IE1lcmdlRWRpdG9yVmlld01vZGVsLFxuXHRcdGlucHV0MUVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0aW5wdXQxVmlld1pvbmVBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IsXG5cdFx0aW5wdXQyRWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRpbnB1dDJWaWV3Wm9uZUFjY2Vzc29yOiBJVmlld1pvbmVDaGFuZ2VBY2Nlc3Nvcixcblx0XHRiYXNlRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCxcblx0XHRiYXNlVmlld1pvbmVBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IgfCB1bmRlZmluZWQsXG5cdFx0c2hvdWxkQWxpZ25CYXNlOiBib29sZWFuLFxuXHRcdHJlc3VsdEVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cmVzdWx0Vmlld1pvbmVBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IsXG5cdFx0c2hvdWxkQWxpZ25SZXN1bHQ6IGJvb2xlYW4sXG5cdCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBpbnB1dDFWaWV3Wm9uZUlkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbnB1dDJWaWV3Wm9uZUlkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBiYXNlVmlld1pvbmVJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0Vmlld1pvbmVJZHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCB2aWV3Wm9uZXMgPSB0aGlzLnZpZXdab25lQ29tcHV0ZXIuY29tcHV0ZVZpZXdab25lcyhyZWFkZXIsIHZpZXdNb2RlbCwge1xuXHRcdFx0Y29kZUxlbnNlc1Zpc2libGU6IHRydWUsXG5cdFx0XHRzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzOiB0aGlzLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXMucmVhZChyZWFkZXIpLFxuXHRcdFx0c2hvdWxkQWxpZ25CYXNlLFxuXHRcdFx0c2hvdWxkQWxpZ25SZXN1bHQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRpZiAoYmFzZVZpZXdab25lQWNjZXNzb3IpIHtcblx0XHRcdGZvciAoY29uc3QgdiBvZiB2aWV3Wm9uZXMuYmFzZVZpZXdab25lcykge1xuXHRcdFx0XHR2LmNyZWF0ZShiYXNlVmlld1pvbmVBY2Nlc3NvciwgYmFzZVZpZXdab25lSWRzLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdiBvZiB2aWV3Wm9uZXMucmVzdWx0Vmlld1pvbmVzKSB7XG5cdFx0XHR2LmNyZWF0ZShyZXN1bHRWaWV3Wm9uZUFjY2Vzc29yLCByZXN1bHRWaWV3Wm9uZUlkcywgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHYgb2Ygdmlld1pvbmVzLmlucHV0MVZpZXdab25lcykge1xuXHRcdFx0di5jcmVhdGUoaW5wdXQxVmlld1pvbmVBY2Nlc3NvciwgaW5wdXQxVmlld1pvbmVJZHMsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB2IG9mIHZpZXdab25lcy5pbnB1dDJWaWV3Wm9uZXMpIHtcblx0XHRcdHYuY3JlYXRlKGlucHV0MlZpZXdab25lQWNjZXNzb3IsIGlucHV0MlZpZXdab25lSWRzLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpbnB1dDFFZGl0b3IuY2hhbmdlVmlld1pvbmVzKGEgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgem9uZSBvZiBpbnB1dDFWaWV3Wm9uZUlkcykge1xuXHRcdFx0XHRcdFx0YS5yZW1vdmVab25lKHpvbmUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlucHV0MkVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB6b25lIG9mIGlucHV0MlZpZXdab25lSWRzKSB7XG5cdFx0XHRcdFx0XHRhLnJlbW92ZVpvbmUoem9uZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YmFzZUVkaXRvcj8uY2hhbmdlVmlld1pvbmVzKGEgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgem9uZSBvZiBiYXNlVmlld1pvbmVJZHMpIHtcblx0XHRcdFx0XHRcdGEucmVtb3ZlWm9uZSh6b25lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXN1bHRFZGl0b3IuY2hhbmdlVmlld1pvbmVzKGEgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgem9uZSBvZiByZXN1bHRWaWV3Wm9uZUlkcykge1xuXHRcdFx0XHRcdFx0YS5yZW1vdmVab25lKHpvbmUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZVN0b3JlO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRzdXBlci5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdGFwcGx5VGV4dEVkaXRvck9wdGlvbnMob3B0aW9ucywgdGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGZvciAoY29uc3QgeyBlZGl0b3IgfSBvZiBbdGhpcy5pbnB1dDFWaWV3LCB0aGlzLmlucHV0MlZpZXcsIHRoaXMuaW5wdXRSZXN1bHRWaWV3XSkge1xuXHRcdFx0ZWRpdG9yLnNldE1vZGVsKG51bGwpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHQodGhpcy5nZXRDb250cm9sKCkgPz8gdGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yKS5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciB9IG9mIFt0aGlzLmlucHV0MVZpZXcsIHRoaXMuaW5wdXQyVmlldywgdGhpcy5pbnB1dFJlc3VsdFZpZXddKSB7XG5cdFx0XHRpZiAoZWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuaGFzRm9jdXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRFZGl0b3JWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5zZXRFZGl0b3JWaXNpYmxlKHZpc2libGUpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciB9IG9mIFt0aGlzLmlucHV0MVZpZXcsIHRoaXMuaW5wdXQyVmlldywgdGhpcy5pbnB1dFJlc3VsdFZpZXddKSB7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRlZGl0b3Iub25WaXNpYmxlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlZGl0b3Iub25IaWRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3R4SXNNZXJnZUVkaXRvci5zZXQodmlzaWJsZSk7XG5cdH1cblxuXHQvLyAtLS0tIGludGVyYWN0IHdpdGggXCJvdXRzaWRlIHdvcmxkXCIgdmlhYGdldENvbnRyb2xgLCBgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VgOiB3ZSBvbmx5IGV4cG9zZSB0aGUgcmVzdWx0LWVkaXRvciBrZWVwIHRoZSBvdGhlcnMgaW50ZXJuYWxcblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCk6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29udHJvbCA9IHRoaXMuZ2V0Q29udHJvbCgpO1xuXHRcdHJldHVybiBjb250cm9sPy5pbnZva2VXaXRoaW5Db250ZXh0KGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKTtcblx0fVxuXG5cdC8vIC0tLSBsYXlvdXRcblxuXHRwdWJsaWMgdG9nZ2xlQmFzZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNldExheW91dCh7XG5cdFx0XHQuLi50aGlzLl9sYXlvdXRNb2RlLnZhbHVlLFxuXHRcdFx0c2hvd0Jhc2U6ICF0aGlzLl9sYXlvdXRNb2RlLnZhbHVlLnNob3dCYXNlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgdG9nZ2xlU2hvd0Jhc2VUb3AoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvd0Jhc2VUb3AgPSB0aGlzLl9sYXlvdXRNb2RlLnZhbHVlLnNob3dCYXNlICYmIHRoaXMuX2xheW91dE1vZGUudmFsdWUuc2hvd0Jhc2VBdFRvcDtcblx0XHR0aGlzLnNldExheW91dCh7XG5cdFx0XHQuLi50aGlzLl9sYXlvdXRNb2RlLnZhbHVlLFxuXHRcdFx0c2hvd0Jhc2VBdFRvcDogdHJ1ZSxcblx0XHRcdHNob3dCYXNlOiAhc2hvd0Jhc2VUb3AsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgdG9nZ2xlU2hvd0Jhc2VDZW50ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvd0Jhc2VDZW50ZXIgPSB0aGlzLl9sYXlvdXRNb2RlLnZhbHVlLnNob3dCYXNlICYmICF0aGlzLl9sYXlvdXRNb2RlLnZhbHVlLnNob3dCYXNlQXRUb3A7XG5cdFx0dGhpcy5zZXRMYXlvdXQoe1xuXHRcdFx0Li4udGhpcy5fbGF5b3V0TW9kZS52YWx1ZSxcblx0XHRcdHNob3dCYXNlQXRUb3A6IGZhbHNlLFxuXHRcdFx0c2hvd0Jhc2U6ICFzaG93QmFzZUNlbnRlcixcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRMYXlvdXRLaW5kKGtpbmQ6IE1lcmdlRWRpdG9yTGF5b3V0S2luZCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0TGF5b3V0KHtcblx0XHRcdC4uLnRoaXMuX2xheW91dE1vZGUudmFsdWUsXG5cdFx0XHRraW5kXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0TGF5b3V0KG5ld0xheW91dDogSU1lcmdlRWRpdG9yTGF5b3V0KTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9sYXlvdXRNb2RlLnZhbHVlO1xuXHRcdGlmIChKU09OLnN0cmluZ2lmeSh2YWx1ZSkgPT09IEpTT04uc3RyaW5naWZ5KG5ld0xheW91dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5tb2RlbD8udGVsZW1ldHJ5LnJlcG9ydExheW91dENoYW5nZSh7XG5cdFx0XHRiYXNlVG9wOiBuZXdMYXlvdXQuc2hvd0Jhc2VBdFRvcCxcblx0XHRcdGJhc2VWaXNpYmxlOiBuZXdMYXlvdXQuc2hvd0Jhc2UsXG5cdFx0XHRpc0NvbHVtblZpZXc6IG5ld0xheW91dC5raW5kID09PSAnY29sdW1ucycsXG5cdFx0fSk7XG5cdFx0dGhpcy5hcHBseUxheW91dChuZXdMYXlvdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBiYXNlVmlld0Rpc3Bvc2FibGVzO1xuXG5cdHByaXZhdGUgYXBwbHlMYXlvdXQobGF5b3V0OiBJTWVyZ2VFZGl0b3JMYXlvdXQpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGFwcGx5TGF5b3V0ICovXG5cblx0XHRcdGlmIChsYXlvdXQuc2hvd0Jhc2UgJiYgIXRoaXMuYmFzZVZpZXcuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5iYXNlVmlld0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdGNvbnN0IGJhc2VWaWV3ID0gdGhpcy5iYXNlVmlld0Rpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0QmFzZUNvZGVFZGl0b3JWaWV3LFxuXHRcdFx0XHRcdFx0dGhpcy52aWV3TW9kZWxcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuYmFzZVZpZXdEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIGJhc2UgdmlldyBvcHRpb25zICovXG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuYmFzZVZpZXdPcHRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0XHRcdFx0YmFzZVZpZXcudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5iYXNlVmlldy5zZXQoYmFzZVZpZXcsIHR4KTtcblx0XHRcdH0gZWxzZSBpZiAoIWxheW91dC5zaG93QmFzZSAmJiB0aGlzLmJhc2VWaWV3LmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuYmFzZVZpZXcuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHR0aGlzLmJhc2VWaWV3RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGxheW91dC5raW5kID09PSAnbWl4ZWQnKSB7XG5cdFx0XHRcdHRoaXMuc2V0R3JpZChbXG5cdFx0XHRcdFx0bGF5b3V0LnNob3dCYXNlQXRUb3AgJiYgbGF5b3V0LnNob3dCYXNlID8ge1xuXHRcdFx0XHRcdFx0c2l6ZTogMzgsXG5cdFx0XHRcdFx0XHRkYXRhOiB0aGlzLmJhc2VWaWV3LmdldCgpIS52aWV3XG5cdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzaXplOiAzOCxcblx0XHRcdFx0XHRcdGdyb3VwczogW1xuXHRcdFx0XHRcdFx0XHR7IGRhdGE6IHRoaXMuaW5wdXQxVmlldy52aWV3IH0sXG5cdFx0XHRcdFx0XHRcdCFsYXlvdXQuc2hvd0Jhc2VBdFRvcCAmJiBsYXlvdXQuc2hvd0Jhc2UgPyB7IGRhdGE6IHRoaXMuYmFzZVZpZXcuZ2V0KCkhLnZpZXcgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0eyBkYXRhOiB0aGlzLmlucHV0MlZpZXcudmlldyB9XG5cdFx0XHRcdFx0XHRdLmZpbHRlcihpc0RlZmluZWQpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzaXplOiA2Mixcblx0XHRcdFx0XHRcdGRhdGE6IHRoaXMuaW5wdXRSZXN1bHRWaWV3LnZpZXdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLmZpbHRlcihpc0RlZmluZWQpKTtcblx0XHRcdH0gZWxzZSBpZiAobGF5b3V0LmtpbmQgPT09ICdjb2x1bW5zJykge1xuXHRcdFx0XHR0aGlzLnNldEdyaWQoW1xuXHRcdFx0XHRcdGxheW91dC5zaG93QmFzZSA/IHtcblx0XHRcdFx0XHRcdHNpemU6IDQwLFxuXHRcdFx0XHRcdFx0ZGF0YTogdGhpcy5iYXNlVmlldy5nZXQoKSEudmlld1xuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2l6ZTogNjAsXG5cdFx0XHRcdFx0XHRncm91cHM6IFt7IGRhdGE6IHRoaXMuaW5wdXQxVmlldy52aWV3IH0sIHsgZGF0YTogdGhpcy5pbnB1dFJlc3VsdFZpZXcudmlldyB9LCB7IGRhdGE6IHRoaXMuaW5wdXQyVmlldy52aWV3IH1dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XS5maWx0ZXIoaXNEZWZpbmVkKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xheW91dE1vZGUudmFsdWUgPSBsYXlvdXQ7XG5cdFx0XHR0aGlzLl9jdHhVc2VzQ29sdW1uTGF5b3V0LnNldChsYXlvdXQua2luZCk7XG5cdFx0XHR0aGlzLl9jdHhTaG93QmFzZS5zZXQobGF5b3V0LnNob3dCYXNlKTtcblx0XHRcdHRoaXMuX2N0eFNob3dCYXNlQXRUb3Auc2V0KGxheW91dC5zaG93QmFzZUF0VG9wKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLmZpcmUoKTtcblx0XHRcdHRoaXMuX2xheW91dE1vZGVPYnMuc2V0KGxheW91dCwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRHcmlkKGRlc2NyaXB0b3I6IEdyaWROb2RlRGVzY3JpcHRvcjxhbnk+W10pIHtcblx0XHRsZXQgd2lkdGggPSAtMTtcblx0XHRsZXQgaGVpZ2h0ID0gLTE7XG5cdFx0aWYgKHRoaXMuX2dyaWQudmFsdWUpIHtcblx0XHRcdHdpZHRoID0gdGhpcy5fZ3JpZC52YWx1ZS53aWR0aDtcblx0XHRcdGhlaWdodCA9IHRoaXMuX2dyaWQudmFsdWUuaGVpZ2h0O1xuXHRcdH1cblx0XHR0aGlzLl9ncmlkLnZhbHVlID0gU2VyaWFsaXphYmxlR3JpZC5mcm9tPGFueT4oe1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0c2l6ZTogMTAwLFxuXHRcdFx0Z3JvdXBzOiBkZXNjcmlwdG9yLFxuXHRcdH0sIHtcblx0XHRcdHN0eWxlczogeyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMudGhlbWUuZ2V0Q29sb3Ioc2V0dGluZ3NTYXNoQm9yZGVyKSA/PyBDb2xvci50cmFuc3BhcmVudCB9LFxuXHRcdFx0cHJvcG9ydGlvbmFsTGF5b3V0OiB0cnVlXG5cdFx0fSk7XG5cblx0XHRyZXNldCh0aGlzLnJvb3RIdG1sRWxlbWVudCEsIHRoaXMuX2dyaWQudmFsdWUuZWxlbWVudCk7XG5cdFx0Ly8gT25seSBjYWxsIGxheW91dCBhZnRlciB0aGUgZWxlbWVudHMgaGF2ZSBiZWVuIGFkZGVkIHRvIHRoZSBET00sXG5cdFx0Ly8gc28gdGhhdCB0aGV5IGhhdmUgYSBkZWZpbmVkIHNpemUuXG5cdFx0aWYgKHdpZHRoICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fZ3JpZC52YWx1ZS5sYXlvdXQod2lkdGgsIGhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlWaWV3U3RhdGUoc3RhdGU6IElNZXJnZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yLnJlc3RvcmVWaWV3U3RhdGUoc3RhdGUpO1xuXHRcdGlmIChzdGF0ZS5pbnB1dDFTdGF0ZSkge1xuXHRcdFx0dGhpcy5pbnB1dDFWaWV3LmVkaXRvci5yZXN0b3JlVmlld1N0YXRlKHN0YXRlLmlucHV0MVN0YXRlKTtcblx0XHR9XG5cdFx0aWYgKHN0YXRlLmlucHV0MlN0YXRlKSB7XG5cdFx0XHR0aGlzLmlucHV0MlZpZXcuZWRpdG9yLnJlc3RvcmVWaWV3U3RhdGUoc3RhdGUuaW5wdXQyU3RhdGUpO1xuXHRcdH1cblx0XHRpZiAoc3RhdGUuZm9jdXNJbmRleCA+PSAwKSB7XG5cdFx0XHRbdGhpcy5pbnB1dDFWaWV3LmVkaXRvciwgdGhpcy5pbnB1dDJWaWV3LmVkaXRvciwgdGhpcy5pbnB1dFJlc3VsdFZpZXcuZWRpdG9yXVtzdGF0ZS5mb2N1c0luZGV4XS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBjb21wdXRlRWRpdG9yVmlld1N0YXRlKHJlc291cmNlOiBVUkkpOiBJTWVyZ2VFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNFcXVhbCh0aGlzLmlucHV0TW9kZWwuZ2V0KCk/LnJlc3VsdFVyaSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmlucHV0UmVzdWx0Vmlldy5lZGl0b3Iuc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dDFTdGF0ZSA9IHRoaXMuaW5wdXQxVmlldy5lZGl0b3Iuc2F2ZVZpZXdTdGF0ZSgpID8/IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbnB1dDJTdGF0ZSA9IHRoaXMuaW5wdXQyVmlldy5lZGl0b3Iuc2F2ZVZpZXdTdGF0ZSgpID8/IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb2N1c0luZGV4ID0gW3RoaXMuaW5wdXQxVmlldy5lZGl0b3IsIHRoaXMuaW5wdXQyVmlldy5lZGl0b3IsIHRoaXMuaW5wdXRSZXN1bHRWaWV3LmVkaXRvcl0uZmluZEluZGV4KGVkaXRvciA9PiBlZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSk7XG5cdFx0cmV0dXJuIHsgLi4ucmVzdWx0LCBpbnB1dDFTdGF0ZSwgaW5wdXQyU3RhdGUsIGZvY3VzSW5kZXggfTtcblx0fVxuXG5cblx0cHJvdGVjdGVkIHRyYWNrc0VkaXRvclZpZXdTdGF0ZShpbnB1dDogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaW5wdXQgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcklucHV0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzU3RvcmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcztcblxuXHRwdWJsaWMgdG9nZ2xlU2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcygpOiB2b2lkIHtcblx0XHR0aGlzLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXMuc2V0KCF0aGlzLnNob3dOb25Db25mbGljdGluZ0NoYW5nZXMuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzU3RvcmUuc2V0KHRoaXMuc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcy5nZXQoKSk7XG5cdFx0dGhpcy5fY3R4U2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcy5zZXQodGhpcy5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLmdldCgpKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZXJnZUVkaXRvckxheW91dCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE1lcmdlRWRpdG9yTGF5b3V0S2luZDtcblx0cmVhZG9ubHkgc2hvd0Jhc2U6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dCYXNlQXRUb3A6IGJvb2xlYW47XG59XG5cbi8vIFRPRE8gdXNlIFBlcnNpc3RlbnRTdG9yZVxuY2xhc3MgTWVyZ2VFZGl0b3JMYXlvdXRTdG9yZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9rZXkgPSAnbWVyZ2VFZGl0b3IvbGF5b3V0Jztcblx0cHJpdmF0ZSBfdmFsdWU6IElNZXJnZUVkaXRvckxheW91dCA9IHsga2luZDogJ21peGVkJywgc2hvd0Jhc2U6IGZhbHNlLCBzaG93QmFzZUF0VG9wOiB0cnVlIH07XG5cblx0Y29uc3RydWN0b3IoQElTdG9yYWdlU2VydmljZSBwcml2YXRlIF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0Y29uc3QgdmFsdWUgPSBfc3RvcmFnZVNlcnZpY2UuZ2V0KE1lcmdlRWRpdG9yTGF5b3V0U3RvcmUuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdtaXhlZCcpO1xuXG5cdFx0aWYgKHZhbHVlID09PSAnbWl4ZWQnIHx8IHZhbHVlID09PSAnY29sdW1ucycpIHtcblx0XHRcdHRoaXMuX3ZhbHVlID0geyBraW5kOiB2YWx1ZSwgc2hvd0Jhc2U6IGZhbHNlLCBzaG93QmFzZUF0VG9wOiB0cnVlIH07XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fdmFsdWUgPSBKU09OLnBhcnNlKHZhbHVlKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZTtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogSU1lcmdlRWRpdG9yTGF5b3V0KSB7XG5cdFx0aWYgKHRoaXMuX3ZhbHVlICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKE1lcmdlRWRpdG9yTGF5b3V0U3RvcmUuX2tleSwgSlNPTi5zdHJpbmdpZnkodGhpcy5fdmFsdWUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1lcmdlRWRpdG9yT3BlbkhhbmRsZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckNvZGVFZGl0b3JPcGVuSGFuZGxlcih0aGlzLm9wZW5Db2RlRWRpdG9yRnJvbU1lcmdlRWRpdG9yLmJpbmQodGhpcykpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkNvZGVFZGl0b3JGcm9tTWVyZ2VFZGl0b3IoaW5wdXQ6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgX3NvdXJjZTogSUNvZGVFZGl0b3IgfCBudWxsLCBzaWRlQnlTaWRlPzogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUNvZGVFZGl0b3IgfCBudWxsPiB7XG5cdFx0Y29uc3QgYWN0aXZlUGFuZSA9IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIXNpZGVCeVNpZGVcblx0XHRcdCYmIGlucHV0Lm9wdGlvbnNcblx0XHRcdCYmIGFjdGl2ZVBhbmUgaW5zdGFuY2VvZiBNZXJnZUVkaXRvclxuXHRcdFx0JiYgYWN0aXZlUGFuZS5nZXRDb250cm9sKClcblx0XHRcdCYmIGFjdGl2ZVBhbmUuaW5wdXQgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcklucHV0XG5cdFx0XHQmJiBpc0VxdWFsKGlucHV0LnJlc291cmNlLCBhY3RpdmVQYW5lLmlucHV0LnJlc3VsdClcblx0XHQpIHtcblx0XHRcdC8vIFNwZWNpYWw6IHN0YXkgaW5zaWRlIHRoZSBtZXJnZSBlZGl0b3Igd2hlbiBpdCBpcyBhY3RpdmUgYW5kIHdoZW4gdGhlIGlucHV0XG5cdFx0XHQvLyB0YXJnZXRzIHRoZSByZXN1bHQgZWRpdG9yIG9mIHRoZSBtZXJnZSBlZGl0b3IuXG5cdFx0XHRjb25zdCB0YXJnZXRFZGl0b3IgPSA8SUNvZGVFZGl0b3I+YWN0aXZlUGFuZS5nZXRDb250cm9sKCkhO1xuXHRcdFx0YXBwbHlUZXh0RWRpdG9yT3B0aW9ucyhpbnB1dC5vcHRpb25zLCB0YXJnZXRFZGl0b3IsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdHJldHVybiB0YXJnZXRFZGl0b3I7XG5cdFx0fVxuXG5cdFx0Ly8gY2Fubm90IGhhbmRsZSB0aGlzXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1lcmdlRWRpdG9yUmVzb2x2ZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubWVyZ2VFZGl0b3JSZXNvbHZlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG1lcmdlRWRpdG9ySW5wdXRGYWN0b3J5OiBNZXJnZUVkaXRvcklucHV0RmFjdG9yeUZ1bmN0aW9uID0gKG1lcmdlRWRpdG9yOiBJUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0KTogRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0b3I6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdE1lcmdlRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0bWVyZ2VFZGl0b3IuYmFzZS5yZXNvdXJjZSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1cmk6IG1lcmdlRWRpdG9yLmlucHV0MS5yZXNvdXJjZSxcblx0XHRcdFx0XHRcdHRpdGxlOiBtZXJnZUVkaXRvci5pbnB1dDEubGFiZWwgPz8gYmFzZW5hbWUobWVyZ2VFZGl0b3IuaW5wdXQxLnJlc291cmNlKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBtZXJnZUVkaXRvci5pbnB1dDEuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IG1lcmdlRWRpdG9yLmlucHV0MS5kZXRhaWxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHVyaTogbWVyZ2VFZGl0b3IuaW5wdXQyLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0dGl0bGU6IG1lcmdlRWRpdG9yLmlucHV0Mi5sYWJlbCA/PyBiYXNlbmFtZShtZXJnZUVkaXRvci5pbnB1dDIucmVzb3VyY2UpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG1lcmdlRWRpdG9yLmlucHV0Mi5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdGRldGFpbDogbWVyZ2VFZGl0b3IuaW5wdXQyLmRldGFpbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVyZ2VFZGl0b3IucmVzdWx0LnJlc291cmNlXG5cdFx0XHRcdClcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcihcblx0XHRcdGAqYCxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkLFxuXHRcdFx0XHRsYWJlbDogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uZGlzcGxheU5hbWUsXG5cdFx0XHRcdGRldGFpbDogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04ucHJvdmlkZXJEaXNwbGF5TmFtZSxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZU1lcmdlRWRpdG9ySW5wdXQ6IG1lcmdlRWRpdG9ySW5wdXRGYWN0b3J5XG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cbn1cblxudHlwZSBJTWVyZ2VFZGl0b3JWaWV3U3RhdGUgPSBJQ29kZUVkaXRvclZpZXdTdGF0ZSAmIHtcblx0cmVhZG9ubHkgaW5wdXQxU3RhdGU/OiBJQ29kZUVkaXRvclZpZXdTdGF0ZTtcblx0cmVhZG9ubHkgaW5wdXQyU3RhdGU/OiBJQ29kZUVkaXRvclZpZXdTdGF0ZTtcblx0cmVhZG9ubHkgZm9jdXNJbmRleDogbnVtYmVyO1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBb0IsYUFBYTtBQUNqQyxTQUEwQyx3QkFBd0I7QUFDbEUsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CLHlCQUF5QjtBQUN0RCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG1CQUFtQixvQkFBb0I7QUFDN0csU0FBUyxTQUFTLGtCQUF3QyxpQkFBaUIsbUJBQW1CO0FBQzlGLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsaUJBQWlCO0FBRTFCLE9BQU87QUFFUCxTQUFTLDBCQUEwQjtBQUVuQyxTQUErQixrQkFBa0I7QUFFakQsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBc0IsMEJBQTBCO0FBRWhELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NBQXlHO0FBRWxILFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsb0JBQW9CLDJCQUEyQjtBQUN4RCxTQUFTLHdCQUF3QjtBQUdqQyxTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCLGlCQUFpQixzQkFBc0Isd0JBQXdCLDZCQUE2Qix5Q0FBeUMseUJBQWdEO0FBQ2hOLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXVCLDRCQUE0QjtBQUNuRCxTQUFTLHdCQUF5RCxnQ0FBZ0M7QUFDbEcsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTztBQUNQ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
