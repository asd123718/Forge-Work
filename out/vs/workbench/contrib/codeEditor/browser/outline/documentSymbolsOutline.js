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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { OutlineConfigCollapseItemsValues, IOutlineService, OutlineConfigKeys, OutlineTarget } from "../../../../services/outline/browser/outline.js";
import { Extensions as WorkbenchExtensions } from "../../../../common/contributions.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../../services/lifecycle/common/lifecycle.js";
import { DocumentSymbolComparator, DocumentSymbolAccessibilityProvider, DocumentSymbolRenderer, DocumentSymbolFilter, DocumentSymbolGroupRenderer, DocumentSymbolIdentityProvider, DocumentSymbolNavigationLabelProvider, DocumentSymbolVirtualDelegate, DocumentSymbolDragAndDrop } from "./documentSymbolsTree.js";
import { isCodeEditor, isDiffEditor } from "../../../../../editor/browser/editorBrowser.js";
import { OutlineGroup, OutlineElement, OutlineModel, TreeElement, IOutlineModelService } from "../../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { raceCancellation, TimeoutTimer, timeout, Barrier } from "../../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { ITextResourceConfigurationService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ScrollType } from "../../../../../editor/common/editorCommon.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { TextEditorSelectionRevealType } from "../../../../../platform/editor/common/editor.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { localize } from "../../../../../nls.js";
import { IMarkerDecorationsService } from "../../../../../editor/common/services/markerDecorations.js";
import { MarkerSeverity } from "../../../../../platform/markers/common/markers.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
let DocumentSymbolBreadcrumbsSource = class {
  constructor(_editor, _textResourceConfigurationService) {
    this._editor = _editor;
    this._textResourceConfigurationService = _textResourceConfigurationService;
    this._breadcrumbs = [];
  }
  getBreadcrumbElements() {
    return this._breadcrumbs;
  }
  clear() {
    this._breadcrumbs = [];
  }
  update(model, position) {
    const newElements = this._computeBreadcrumbs(model, position);
    this._breadcrumbs = newElements.map((element) => ({
      element,
      label: element instanceof OutlineElement ? element.symbol.name : ""
    }));
  }
  _computeBreadcrumbs(model, position) {
    let item = model.getItemEnclosingPosition(position);
    if (!item) {
      return [];
    }
    const chain = [];
    while (item) {
      chain.push(item);
      const parent = item.parent;
      if (parent instanceof OutlineModel) {
        break;
      }
      if (parent instanceof OutlineGroup && parent.parent && parent.parent.children.size === 1) {
        break;
      }
      item = parent;
    }
    const result = [];
    for (let i = chain.length - 1; i >= 0; i--) {
      const element = chain[i];
      if (this._isFiltered(element)) {
        break;
      }
      result.push(element);
    }
    if (result.length === 0) {
      return [];
    }
    return result;
  }
  _isFiltered(element) {
    if (!(element instanceof OutlineElement)) {
      return false;
    }
    const key = `breadcrumbs.${DocumentSymbolFilter.kindToConfigName[element.symbol.kind]}`;
    let uri;
    if (this._editor && this._editor.getModel()) {
      const model = this._editor.getModel();
      uri = model.uri;
    }
    return !this._textResourceConfigurationService.getValue(uri, key);
  }
};
DocumentSymbolBreadcrumbsSource = __decorateClass([
  __decorateParam(1, ITextResourceConfigurationService)
], DocumentSymbolBreadcrumbsSource);
let DocumentSymbolsOutline = class {
  constructor(_editor, target, firstLoadBarrier, _languageFeaturesService, _codeEditorService, _outlineModelService, _configurationService, _markerDecorationsService, textResourceConfigurationService, instantiationService) {
    this._editor = _editor;
    this._languageFeaturesService = _languageFeaturesService;
    this._codeEditorService = _codeEditorService;
    this._outlineModelService = _outlineModelService;
    this._configurationService = _configurationService;
    this._markerDecorationsService = _markerDecorationsService;
    this._disposables = new DisposableStore();
    this._onDidChange = this._disposables.add(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._outlineDisposables = new DisposableStore();
    this.outlineKind = "documentSymbols";
    this._breadcrumbsDataSource = new DocumentSymbolBreadcrumbsSource(_editor, textResourceConfigurationService);
    const delegate = new DocumentSymbolVirtualDelegate();
    const renderers = [new DocumentSymbolGroupRenderer(), instantiationService.createInstance(DocumentSymbolRenderer, true, target)];
    const treeDataSource = {
      getChildren: (parent) => {
        if (parent instanceof OutlineElement || parent instanceof OutlineGroup) {
          return parent.children.values();
        }
        if (parent === this && this._outlineModel) {
          return this._outlineModel.children.values();
        }
        return [];
      }
    };
    const comparator = new DocumentSymbolComparator();
    const initialState = textResourceConfigurationService.getValue(_editor.getModel()?.uri, OutlineConfigKeys.collapseItems);
    const options = {
      collapseByDefault: target === OutlineTarget.Breadcrumbs || target === OutlineTarget.OutlinePane && initialState === OutlineConfigCollapseItemsValues.Collapsed,
      expandOnlyOnTwistieClick: true,
      multipleSelectionSupport: false,
      identityProvider: new DocumentSymbolIdentityProvider(),
      keyboardNavigationLabelProvider: new DocumentSymbolNavigationLabelProvider(),
      accessibilityProvider: new DocumentSymbolAccessibilityProvider(localize("document", "Document Symbols")),
      filter: target === OutlineTarget.OutlinePane ? instantiationService.createInstance(DocumentSymbolFilter, "outline") : target === OutlineTarget.Breadcrumbs ? instantiationService.createInstance(DocumentSymbolFilter, "breadcrumbs") : void 0,
      dnd: instantiationService.createInstance(DocumentSymbolDragAndDrop)
    };
    this.config = {
      breadcrumbsDataSource: this._breadcrumbsDataSource,
      delegate,
      renderers,
      treeDataSource,
      comparator,
      options,
      quickPickDataSource: { getQuickPickElements: () => {
        throw new Error("not implemented");
      } }
    };
    this._disposables.add(_languageFeaturesService.documentSymbolProvider.onDidChange((_) => this._createOutline()));
    this._disposables.add(this._editor.onDidChangeModel((_) => this._createOutline()));
    this._disposables.add(this._editor.onDidChangeModelLanguage((_) => this._createOutline()));
    const updateSoon = new TimeoutTimer();
    this._disposables.add(updateSoon);
    this._disposables.add(this._editor.onDidChangeModelContent((event) => {
      const model = this._editor.getModel();
      if (model) {
        const timeout2 = _outlineModelService.getDebounceValue(model);
        updateSoon.cancelAndSet(() => this._createOutline(event), timeout2);
      }
    }));
    this._disposables.add(this._editor.onDidDispose(() => this._outlineDisposables.clear()));
    this._createOutline().finally(() => firstLoadBarrier.open());
  }
  get activeElement() {
    const posistion = this._editor.getPosition();
    if (!posistion || !this._outlineModel) {
      return void 0;
    } else {
      return this._outlineModel.getItemEnclosingPosition(posistion);
    }
  }
  dispose() {
    this._disposables.dispose();
    this._outlineDisposables.dispose();
  }
  get isEmpty() {
    return !this._outlineModel || TreeElement.empty(this._outlineModel);
  }
  get uri() {
    return this._outlineModel?.uri;
  }
  async reveal(entry, options, sideBySide, select) {
    const model = OutlineModel.get(entry);
    if (!model || !(entry instanceof OutlineElement)) {
      return;
    }
    await this._codeEditorService.openCodeEditor({
      resource: model.uri,
      options: {
        ...options,
        selection: select ? entry.symbol.range : Range.collapseToStart(entry.symbol.selectionRange),
        selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport
      }
    }, this._editor, sideBySide);
  }
  preview(entry) {
    if (!(entry instanceof OutlineElement)) {
      return Disposable.None;
    }
    const { symbol } = entry;
    this._editor.revealRangeInCenterIfOutsideViewport(symbol.range, ScrollType.Smooth);
    const decorationsCollection = this._editor.createDecorationsCollection([{
      range: symbol.range,
      options: {
        description: "document-symbols-outline-range-highlight",
        className: "rangeHighlight",
        isWholeLine: true
      }
    }]);
    return toDisposable(() => decorationsCollection.clear());
  }
  captureViewState() {
    const viewState = this._editor.saveViewState();
    return toDisposable(() => {
      if (viewState) {
        this._editor.restoreViewState(viewState);
      }
    });
  }
  async _createOutline(contentChangeEvent) {
    this._outlineDisposables.clear();
    if (!contentChangeEvent) {
      this._setOutlineModel(void 0);
    }
    if (!this._editor.hasModel()) {
      return;
    }
    const buffer = this._editor.getModel();
    if (!this._languageFeaturesService.documentSymbolProvider.has(buffer)) {
      return;
    }
    const cts = new CancellationTokenSource();
    const versionIdThen = buffer.getVersionId();
    const timeoutTimer = new TimeoutTimer();
    this._outlineDisposables.add(timeoutTimer);
    this._outlineDisposables.add(toDisposable(() => cts.dispose(true)));
    try {
      const model = await this._outlineModelService.getOrCreate(buffer, cts.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (TreeElement.empty(model) || !this._editor.hasModel()) {
        this._setOutlineModel(model);
        return;
      }
      if (contentChangeEvent && this._outlineModel && buffer.getLineCount() >= 25) {
        const newSize = TreeElement.size(model);
        const newLength = buffer.getValueLength();
        const newRatio = newSize / newLength;
        const oldSize = TreeElement.size(this._outlineModel);
        const oldLength = newLength - contentChangeEvent.changes.reduce((prev, value) => prev + value.rangeLength, 0);
        const oldRatio = oldSize / oldLength;
        if (newRatio <= oldRatio * 0.5 || newRatio >= oldRatio * 1.5) {
          const value = await raceCancellation(timeout(2e3).then(() => true), cts.token, false);
          if (!value) {
            return;
          }
        }
      }
      this._applyMarkersToOutline(model);
      this._outlineDisposables.add(this._markerDecorationsService.onDidChangeMarker((textModel) => {
        if (isEqual(model.uri, textModel.uri)) {
          this._applyMarkersToOutline(model);
          this._onDidChange.fire({});
        }
      }));
      this._outlineDisposables.add(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(OutlineConfigKeys.problemsEnabled) || e.affectsConfiguration("problems.visibility")) {
          const problem = this._configurationService.getValue("problems.visibility");
          const config = this._configurationService.getValue(OutlineConfigKeys.problemsEnabled);
          if (!problem || !config) {
            model.updateMarker([]);
          } else {
            this._applyMarkersToOutline(model);
          }
          this._onDidChange.fire({});
        }
        if (e.affectsConfiguration("outline")) {
          this._onDidChange.fire({});
        }
        if (e.affectsConfiguration("breadcrumbs") && this._editor.hasModel()) {
          this._breadcrumbsDataSource.update(model, this._editor.getPosition());
          this._onDidChange.fire({});
        }
      }));
      this._outlineDisposables.add(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(OutlineConfigKeys.icons)) {
          this._onDidChange.fire({});
        }
        if (e.affectsConfiguration("outline")) {
          this._onDidChange.fire({});
        }
      }));
      this._outlineDisposables.add(this._editor.onDidChangeCursorPosition((_) => {
        timeoutTimer.cancelAndSet(() => {
          if (!buffer.isDisposed() && versionIdThen === buffer.getVersionId() && this._editor.hasModel()) {
            this._breadcrumbsDataSource.update(model, this._editor.getPosition());
            this._onDidChange.fire({ affectOnlyActiveElement: true });
          }
        }, 150);
      }));
      this._setOutlineModel(model);
    } catch (err) {
      this._setOutlineModel(void 0);
      onUnexpectedError(err);
    }
  }
  _applyMarkersToOutline(model) {
    const problem = this._configurationService.getValue("problems.visibility");
    const config = this._configurationService.getValue(OutlineConfigKeys.problemsEnabled);
    if (!model || !problem || !config) {
      return;
    }
    const markers = [];
    for (const [range, marker] of this._markerDecorationsService.getLiveMarkers(model.uri)) {
      if (marker.severity === MarkerSeverity.Error || marker.severity === MarkerSeverity.Warning) {
        markers.push({ ...range, severity: marker.severity });
      }
    }
    model.updateMarker(markers);
  }
  _setOutlineModel(model) {
    const position = this._editor.getPosition();
    if (!position || !model) {
      this._outlineModel = void 0;
      this._breadcrumbsDataSource.clear();
    } else {
      if (!this._outlineModel?.merge(model)) {
        this._outlineModel = model;
      }
      this._breadcrumbsDataSource.update(model, position);
    }
    this._onDidChange.fire({});
  }
};
DocumentSymbolsOutline = __decorateClass([
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IOutlineModelService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IMarkerDecorationsService),
  __decorateParam(8, ITextResourceConfigurationService),
  __decorateParam(9, IInstantiationService)
], DocumentSymbolsOutline);
let DocumentSymbolsOutlineCreator = class {
  constructor(outlineService) {
    const reg = outlineService.registerOutlineCreator(this);
    this.dispose = () => reg.dispose();
  }
  matches(candidate) {
    const ctrl = candidate.getControl();
    return isCodeEditor(ctrl) || isDiffEditor(ctrl);
  }
  async createOutline(pane, target, _token) {
    const control = pane.getControl();
    let editor;
    if (isCodeEditor(control)) {
      editor = control;
    } else if (isDiffEditor(control)) {
      editor = control.getModifiedEditor();
    }
    if (!editor) {
      return void 0;
    }
    const firstLoadBarrier = new Barrier();
    const result = editor.invokeWithinContext((accessor) => accessor.get(IInstantiationService).createInstance(DocumentSymbolsOutline, editor, target, firstLoadBarrier));
    await firstLoadBarrier.wait();
    return result;
  }
};
DocumentSymbolsOutlineCreator = __decorateClass([
  __decorateParam(0, IOutlineService)
], DocumentSymbolsOutlineCreator);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DocumentSymbolsOutlineCreator, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXG91dGxpbmVcXGRvY3VtZW50U3ltYm9sc091dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lQ29uZmlnQ29sbGFwc2VJdGVtc1ZhbHVlcywgSUJyZWFkY3J1bWJzRGF0YVNvdXJjZSwgSUJyZWFkY3J1bWJzT3V0bGluZUVsZW1lbnQsIElPdXRsaW5lLCBJT3V0bGluZUNyZWF0b3IsIElPdXRsaW5lTGlzdENvbmZpZywgSU91dGxpbmVTZXJ2aWNlLCBPdXRsaW5lQ2hhbmdlRXZlbnQsIE91dGxpbmVDb25maWdLZXlzLCBPdXRsaW5lVGFyZ2V0LCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IERvY3VtZW50U3ltYm9sQ29tcGFyYXRvciwgRG9jdW1lbnRTeW1ib2xBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsIERvY3VtZW50U3ltYm9sUmVuZGVyZXIsIERvY3VtZW50U3ltYm9sRmlsdGVyLCBEb2N1bWVudFN5bWJvbEdyb3VwUmVuZGVyZXIsIERvY3VtZW50U3ltYm9sSWRlbnRpdHlQcm92aWRlciwgRG9jdW1lbnRTeW1ib2xOYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgRG9jdW1lbnRTeW1ib2xWaXJ0dWFsRGVsZWdhdGUsIERvY3VtZW50U3ltYm9sRHJhZ0FuZERyb3AgfSBmcm9tICcuL2RvY3VtZW50U3ltYm9sc1RyZWUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lR3JvdXAsIE91dGxpbmVFbGVtZW50LCBPdXRsaW5lTW9kZWwsIFRyZWVFbGVtZW50LCBJT3V0bGluZU1hcmtlciwgSU91dGxpbmVNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kb2N1bWVudFN5bWJvbHMvYnJvd3Nlci9vdXRsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24sIFRpbWVvdXRUaW1lciwgdGltZW91dCwgQmFycmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zLCBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tYXJrZXJEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuXG50eXBlIERvY3VtZW50U3ltYm9sSXRlbSA9IE91dGxpbmVHcm91cCB8IE91dGxpbmVFbGVtZW50O1xuXG5jbGFzcyBEb2N1bWVudFN5bWJvbEJyZWFkY3J1bWJzU291cmNlIGltcGxlbWVudHMgSUJyZWFkY3J1bWJzRGF0YVNvdXJjZTxEb2N1bWVudFN5bWJvbEl0ZW0+IHtcblxuXHRwcml2YXRlIF9icmVhZGNydW1iczogSUJyZWFkY3J1bWJzT3V0bGluZUVsZW1lbnQ8RG9jdW1lbnRTeW1ib2xJdGVtPltdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0QnJlYWRjcnVtYkVsZW1lbnRzKCk6IHJlYWRvbmx5IElCcmVhZGNydW1ic091dGxpbmVFbGVtZW50PERvY3VtZW50U3ltYm9sSXRlbT5bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2JyZWFkY3J1bWJzO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnMgPSBbXTtcblx0fVxuXG5cdHVwZGF0ZShtb2RlbDogT3V0bGluZU1vZGVsLCBwb3NpdGlvbjogSVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3RWxlbWVudHMgPSB0aGlzLl9jb21wdXRlQnJlYWRjcnVtYnMobW9kZWwsIHBvc2l0aW9uKTtcblx0XHR0aGlzLl9icmVhZGNydW1icyA9IG5ld0VsZW1lbnRzLm1hcChlbGVtZW50ID0+ICh7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0bGFiZWw6IGVsZW1lbnQgaW5zdGFuY2VvZiBPdXRsaW5lRWxlbWVudCA/IGVsZW1lbnQuc3ltYm9sLm5hbWUgOiAnJ1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVCcmVhZGNydW1icyhtb2RlbDogT3V0bGluZU1vZGVsLCBwb3NpdGlvbjogSVBvc2l0aW9uKTogQXJyYXk8T3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQ+IHtcblx0XHRsZXQgaXRlbTogT3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQgfCB1bmRlZmluZWQgPSBtb2RlbC5nZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBjaGFpbjogQXJyYXk8T3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQ+ID0gW107XG5cdFx0d2hpbGUgKGl0ZW0pIHtcblx0XHRcdGNoYWluLnB1c2goaXRlbSk7XG5cdFx0XHRjb25zdCBwYXJlbnQ6IGFueSA9IGl0ZW0ucGFyZW50O1xuXHRcdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIE91dGxpbmVNb2RlbCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChwYXJlbnQgaW5zdGFuY2VvZiBPdXRsaW5lR3JvdXAgJiYgcGFyZW50LnBhcmVudCAmJiBwYXJlbnQucGFyZW50LmNoaWxkcmVuLnNpemUgPT09IDEpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpdGVtID0gcGFyZW50O1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IEFycmF5PE91dGxpbmVHcm91cCB8IE91dGxpbmVFbGVtZW50PiA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSBjaGFpbi5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGNoYWluW2ldO1xuXHRcdFx0aWYgKHRoaXMuX2lzRmlsdGVyZWQoZWxlbWVudCkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChlbGVtZW50KTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRmlsdGVyZWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgT3V0bGluZUVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IGBicmVhZGNydW1icy4ke0RvY3VtZW50U3ltYm9sRmlsdGVyLmtpbmRUb0NvbmZpZ05hbWVbZWxlbWVudC5zeW1ib2wua2luZF19YDtcblx0XHRsZXQgdXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2VkaXRvciAmJiB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSBhcyBJVGV4dE1vZGVsO1xuXHRcdFx0dXJpID0gbW9kZWwudXJpO1xuXHRcdH1cblx0XHRyZXR1cm4gIXRoaXMuX3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KHVyaSwga2V5KTtcblx0fVxufVxuXG5cbmNsYXNzIERvY3VtZW50U3ltYm9sc091dGxpbmUgaW1wbGVtZW50cyBJT3V0bGluZTxEb2N1bWVudFN5bWJvbEl0ZW0+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8T3V0bGluZUNoYW5nZUV2ZW50PigpKTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8T3V0bGluZUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX291dGxpbmVNb2RlbD86IE91dGxpbmVNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0bGluZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyZWFkY3J1bWJzRGF0YVNvdXJjZTogRG9jdW1lbnRTeW1ib2xCcmVhZGNydW1ic1NvdXJjZTtcblxuXHRyZWFkb25seSBjb25maWc6IElPdXRsaW5lTGlzdENvbmZpZzxEb2N1bWVudFN5bWJvbEl0ZW0+O1xuXG5cdHJlYWRvbmx5IG91dGxpbmVLaW5kID0gJ2RvY3VtZW50U3ltYm9scyc7XG5cblx0Z2V0IGFjdGl2ZUVsZW1lbnQoKTogRG9jdW1lbnRTeW1ib2xJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwb3Npc3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAoIXBvc2lzdGlvbiB8fCAhdGhpcy5fb3V0bGluZU1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3V0bGluZU1vZGVsLmdldEl0ZW1FbmNsb3NpbmdQb3NpdGlvbihwb3Npc3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0dGFyZ2V0OiBPdXRsaW5lVGFyZ2V0LFxuXHRcdGZpcnN0TG9hZEJhcnJpZXI6IEJhcnJpZXIsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASU91dGxpbmVNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3V0bGluZU1vZGVsU2VydmljZTogSU91dGxpbmVNb2RlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlckRlY29yYXRpb25zU2VydmljZTogSU1hcmtlckRlY29yYXRpb25zU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHRoaXMuX2JyZWFkY3J1bWJzRGF0YVNvdXJjZSA9IG5ldyBEb2N1bWVudFN5bWJvbEJyZWFkY3J1bWJzU291cmNlKF9lZGl0b3IsIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBEb2N1bWVudFN5bWJvbFZpcnR1YWxEZWxlZ2F0ZSgpO1xuXHRcdGNvbnN0IHJlbmRlcmVycyA9IFtuZXcgRG9jdW1lbnRTeW1ib2xHcm91cFJlbmRlcmVyKCksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERvY3VtZW50U3ltYm9sUmVuZGVyZXIsIHRydWUsIHRhcmdldCldO1xuXHRcdGNvbnN0IHRyZWVEYXRhU291cmNlOiBJRGF0YVNvdXJjZTx0aGlzLCBEb2N1bWVudFN5bWJvbEl0ZW0+ID0ge1xuXHRcdFx0Z2V0Q2hpbGRyZW46IChwYXJlbnQpID0+IHtcblx0XHRcdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIE91dGxpbmVFbGVtZW50IHx8IHBhcmVudCBpbnN0YW5jZW9mIE91dGxpbmVHcm91cCkge1xuXHRcdFx0XHRcdHJldHVybiBwYXJlbnQuY2hpbGRyZW4udmFsdWVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcmVudCA9PT0gdGhpcyAmJiB0aGlzLl9vdXRsaW5lTW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fb3V0bGluZU1vZGVsLmNoaWxkcmVuLnZhbHVlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXBhcmF0b3IgPSBuZXcgRG9jdW1lbnRTeW1ib2xDb21wYXJhdG9yKCk7XG5cdFx0Y29uc3QgaW5pdGlhbFN0YXRlID0gdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8T3V0bGluZUNvbmZpZ0NvbGxhcHNlSXRlbXNWYWx1ZXM+KF9lZGl0b3IuZ2V0TW9kZWwoKT8udXJpLCBPdXRsaW5lQ29uZmlnS2V5cy5jb2xsYXBzZUl0ZW1zKTtcblx0XHRjb25zdCBvcHRpb25zID0ge1xuXHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IHRhcmdldCA9PT0gT3V0bGluZVRhcmdldC5CcmVhZGNydW1icyB8fCAodGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lICYmIGluaXRpYWxTdGF0ZSA9PT0gT3V0bGluZUNvbmZpZ0NvbGxhcHNlSXRlbXNWYWx1ZXMuQ29sbGFwc2VkKSxcblx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgRG9jdW1lbnRTeW1ib2xJZGVudGl0eVByb3ZpZGVyKCksXG5cdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBuZXcgRG9jdW1lbnRTeW1ib2xOYXZpZ2F0aW9uTGFiZWxQcm92aWRlcigpLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgRG9jdW1lbnRTeW1ib2xBY2Nlc3NpYmlsaXR5UHJvdmlkZXIobG9jYWxpemUoJ2RvY3VtZW50JywgXCJEb2N1bWVudCBTeW1ib2xzXCIpKSxcblx0XHRcdGZpbHRlcjogdGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lXG5cdFx0XHRcdD8gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRG9jdW1lbnRTeW1ib2xGaWx0ZXIsICdvdXRsaW5lJylcblx0XHRcdFx0OiB0YXJnZXQgPT09IE91dGxpbmVUYXJnZXQuQnJlYWRjcnVtYnNcblx0XHRcdFx0XHQ/IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERvY3VtZW50U3ltYm9sRmlsdGVyLCAnYnJlYWRjcnVtYnMnKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0ZG5kOiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEb2N1bWVudFN5bWJvbERyYWdBbmREcm9wKSxcblx0XHR9O1xuXG5cdFx0dGhpcy5jb25maWcgPSB7XG5cdFx0XHRicmVhZGNydW1ic0RhdGFTb3VyY2U6IHRoaXMuX2JyZWFkY3J1bWJzRGF0YVNvdXJjZSxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0cmVuZGVyZXJzLFxuXHRcdFx0dHJlZURhdGFTb3VyY2UsXG5cdFx0XHRjb21wYXJhdG9yLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHF1aWNrUGlja0RhdGFTb3VyY2U6IHsgZ2V0UXVpY2tQaWNrRWxlbWVudHM6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSB9LFxuXHRcdH07XG5cblxuXHRcdC8vIHVwZGF0ZSBhcyBsYW5ndWFnZSwgbW9kZWwsIHByb3ZpZGVycyBjaGFuZ2VzXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLm9uRGlkQ2hhbmdlKF8gPT4gdGhpcy5fY3JlYXRlT3V0bGluZSgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKF8gPT4gdGhpcy5fY3JlYXRlT3V0bGluZSgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoXyA9PiB0aGlzLl9jcmVhdGVPdXRsaW5lKCkpKTtcblxuXHRcdC8vIHVwZGF0ZSBzb29uJ2lzaCBhcyBtb2RlbCBjb250ZW50IGNoYW5nZVxuXHRcdGNvbnN0IHVwZGF0ZVNvb24gPSBuZXcgVGltZW91dFRpbWVyKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHVwZGF0ZVNvb24pO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRjb25zdCB0aW1lb3V0ID0gX291dGxpbmVNb2RlbFNlcnZpY2UuZ2V0RGVib3VuY2VWYWx1ZShtb2RlbCk7XG5cdFx0XHRcdHVwZGF0ZVNvb24uY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuX2NyZWF0ZU91dGxpbmUoZXZlbnQpLCB0aW1lb3V0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBzdG9wIHdoZW4gZWRpdG9yIGRpZXNcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkRGlzcG9zZSgoKSA9PiB0aGlzLl9vdXRsaW5lRGlzcG9zYWJsZXMuY2xlYXIoKSkpO1xuXG5cdFx0Ly8gaW5pdGlhbCBsb2FkXG5cdFx0dGhpcy5fY3JlYXRlT3V0bGluZSgpLmZpbmFsbHkoKCkgPT4gZmlyc3RMb2FkQmFycmllci5vcGVuKCkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb3V0bGluZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fb3V0bGluZU1vZGVsIHx8IFRyZWVFbGVtZW50LmVtcHR5KHRoaXMuX291dGxpbmVNb2RlbCk7XG5cdH1cblxuXHRnZXQgdXJpKCkge1xuXHRcdHJldHVybiB0aGlzLl9vdXRsaW5lTW9kZWw/LnVyaTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbChlbnRyeTogRG9jdW1lbnRTeW1ib2xJdGVtLCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucywgc2lkZUJ5U2lkZTogYm9vbGVhbiwgc2VsZWN0OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBPdXRsaW5lTW9kZWwuZ2V0KGVudHJ5KTtcblx0XHRpZiAoIW1vZGVsIHx8ICEoZW50cnkgaW5zdGFuY2VvZiBPdXRsaW5lRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fY29kZUVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IG1vZGVsLnVyaSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0c2VsZWN0aW9uOiBzZWxlY3QgPyBlbnRyeS5zeW1ib2wucmFuZ2UgOiBSYW5nZS5jb2xsYXBzZVRvU3RhcnQoZW50cnkuc3ltYm9sLnNlbGVjdGlvblJhbmdlKSxcblx0XHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0fVxuXHRcdH0sIHRoaXMuX2VkaXRvciwgc2lkZUJ5U2lkZSk7XG5cdH1cblxuXHRwcmV2aWV3KGVudHJ5OiBEb2N1bWVudFN5bWJvbEl0ZW0pOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCEoZW50cnkgaW5zdGFuY2VvZiBPdXRsaW5lRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzeW1ib2wgfSA9IGVudHJ5O1xuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoc3ltYm9sLnJhbmdlLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnNDb2xsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbihbe1xuXHRcdFx0cmFuZ2U6IHN5bWJvbC5yYW5nZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdkb2N1bWVudC1zeW1ib2xzLW91dGxpbmUtcmFuZ2UtaGlnaGxpZ2h0Jyxcblx0XHRcdFx0Y2xhc3NOYW1lOiAncmFuZ2VIaWdobGlnaHQnLFxuXHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZVxuXHRcdFx0fVxuXHRcdH1dKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IGRlY29yYXRpb25zQ29sbGVjdGlvbi5jbGVhcigpKTtcblx0fVxuXG5cdGNhcHR1cmVWaWV3U3RhdGUoKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMuX2VkaXRvci5zYXZlVmlld1N0YXRlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodmlld1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5yZXN0b3JlVmlld1N0YXRlKHZpZXdTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVPdXRsaW5lKGNvbnRlbnRDaGFuZ2VFdmVudD86IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdHRoaXMuX291dGxpbmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGlmICghY29udGVudENoYW5nZUV2ZW50KSB7XG5cdFx0XHR0aGlzLl9zZXRPdXRsaW5lTW9kZWwodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5oYXMoYnVmZmVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHZlcnNpb25JZFRoZW4gPSBidWZmZXIuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgdGltZW91dFRpbWVyID0gbmV3IFRpbWVvdXRUaW1lcigpO1xuXG5cdFx0dGhpcy5fb3V0bGluZURpc3Bvc2FibGVzLmFkZCh0aW1lb3V0VGltZXIpO1xuXHRcdHRoaXMuX291dGxpbmVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLl9vdXRsaW5lTW9kZWxTZXJ2aWNlLmdldE9yQ3JlYXRlKGJ1ZmZlciwgY3RzLnRva2VuKTtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0Ly8gY2FuY2VsbGVkIC0+IGRvIG5vdGhpbmdcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoVHJlZUVsZW1lbnQuZW1wdHkobW9kZWwpIHx8ICF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHQvLyBlbXB0eSAtPiBubyBvdXRsaW5lIGVsZW1lbnRzXG5cdFx0XHRcdHRoaXMuX3NldE91dGxpbmVNb2RlbChtb2RlbCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaGV1cmlzdGljOiB3aGVuIHRoZSBzeW1ib2xzLXRvLWxpbmVzIHJhdGlvIGNoYW5nZXMgYnkgNTAlIGJldHdlZW4gZWRpdHNcblx0XHRcdC8vIHdhaXQgYSBsaXR0bGUgKGFuZCBob3BlIHRoYXQgdGhlIG5leHQgY2hhbmdlIGlzbid0IGFzIGRyYXN0aWMpLlxuXHRcdFx0aWYgKGNvbnRlbnRDaGFuZ2VFdmVudCAmJiB0aGlzLl9vdXRsaW5lTW9kZWwgJiYgYnVmZmVyLmdldExpbmVDb3VudCgpID49IDI1KSB7XG5cdFx0XHRcdGNvbnN0IG5ld1NpemUgPSBUcmVlRWxlbWVudC5zaXplKG1vZGVsKTtcblx0XHRcdFx0Y29uc3QgbmV3TGVuZ3RoID0gYnVmZmVyLmdldFZhbHVlTGVuZ3RoKCk7XG5cdFx0XHRcdGNvbnN0IG5ld1JhdGlvID0gbmV3U2l6ZSAvIG5ld0xlbmd0aDtcblx0XHRcdFx0Y29uc3Qgb2xkU2l6ZSA9IFRyZWVFbGVtZW50LnNpemUodGhpcy5fb3V0bGluZU1vZGVsKTtcblx0XHRcdFx0Y29uc3Qgb2xkTGVuZ3RoID0gbmV3TGVuZ3RoIC0gY29udGVudENoYW5nZUV2ZW50LmNoYW5nZXMucmVkdWNlKChwcmV2LCB2YWx1ZSkgPT4gcHJldiArIHZhbHVlLnJhbmdlTGVuZ3RoLCAwKTtcblx0XHRcdFx0Y29uc3Qgb2xkUmF0aW8gPSBvbGRTaXplIC8gb2xkTGVuZ3RoO1xuXHRcdFx0XHRpZiAobmV3UmF0aW8gPD0gb2xkUmF0aW8gKiAwLjUgfHwgbmV3UmF0aW8gPj0gb2xkUmF0aW8gKiAxLjUpIHtcblx0XHRcdFx0XHQvLyB3YWl0IGZvciBhIGJldHRlciBzdGF0ZSBhbmQgaWdub3JlIGN1cnJlbnQgbW9kZWwgd2hlbiBtb3JlXG5cdFx0XHRcdFx0Ly8gdHlwaW5nIGhhcyBoYXBwZW5lZFxuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbih0aW1lb3V0KDIwMDApLnRoZW4oKCkgPT4gdHJ1ZSksIGN0cy50b2tlbiwgZmFsc2UpO1xuXHRcdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gZmVhdHVyZTogc2hvdyBtYXJrZXJzIHdpdGggb3V0bGluZSBlbGVtZW50XG5cdFx0XHR0aGlzLl9hcHBseU1hcmtlcnNUb091dGxpbmUobW9kZWwpO1xuXHRcdFx0dGhpcy5fb3V0bGluZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9tYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VNYXJrZXIodGV4dE1vZGVsID0+IHtcblx0XHRcdFx0aWYgKGlzRXF1YWwobW9kZWwudXJpLCB0ZXh0TW9kZWwudXJpKSkge1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5TWFya2Vyc1RvT3V0bGluZShtb2RlbCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX291dGxpbmVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihPdXRsaW5lQ29uZmlnS2V5cy5wcm9ibGVtc0VuYWJsZWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Byb2JsZW1zLnZpc2liaWxpdHknKSkge1xuXHRcdFx0XHRcdGNvbnN0IHByb2JsZW0gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncHJvYmxlbXMudmlzaWJpbGl0eScpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE91dGxpbmVDb25maWdLZXlzLnByb2JsZW1zRW5hYmxlZCk7XG5cblx0XHRcdFx0XHRpZiAoIXByb2JsZW0gfHwgIWNvbmZpZykge1xuXHRcdFx0XHRcdFx0bW9kZWwudXBkYXRlTWFya2VyKFtdKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fYXBwbHlNYXJrZXJzVG9PdXRsaW5lKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ291dGxpbmUnKSkge1xuXHRcdFx0XHRcdC8vIG91dGxpbmUgZmlsdGVyaW5nLCBwcm9ibGVtcyBvbi9vZmZcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYnJlYWRjcnVtYnMnKSAmJiB0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRcdC8vIGJyZWFkY3J1bWJzIGZpbHRlcmluZ1xuXHRcdFx0XHRcdHRoaXMuX2JyZWFkY3J1bWJzRGF0YVNvdXJjZS51cGRhdGUobW9kZWwsIHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBmZWF0dXJlOiB0b2dnbGUgaWNvbnNcblx0XHRcdHRoaXMuX291dGxpbmVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihPdXRsaW5lQ29uZmlnS2V5cy5pY29ucykpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignb3V0bGluZScpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gZmVhdHVyZTogdXBkYXRlIGFjdGl2ZSB3aGVuIGN1cnNvciBjaGFuZ2VzXG5cdFx0XHR0aGlzLl9vdXRsaW5lRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKF8gPT4ge1xuXHRcdFx0XHR0aW1lb3V0VGltZXIuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWJ1ZmZlci5pc0Rpc3Bvc2VkKCkgJiYgdmVyc2lvbklkVGhlbiA9PT0gYnVmZmVyLmdldFZlcnNpb25JZCgpICYmIHRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9icmVhZGNydW1ic0RhdGFTb3VyY2UudXBkYXRlKG1vZGVsLCB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgYWZmZWN0T25seUFjdGl2ZUVsZW1lbnQ6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxNTApO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyB1cGRhdGUgcHJvcGVydGllcywgc2VuZCBldmVudFxuXHRcdFx0dGhpcy5fc2V0T3V0bGluZU1vZGVsKG1vZGVsKTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fc2V0T3V0bGluZU1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TWFya2Vyc1RvT3V0bGluZShtb2RlbDogT3V0bGluZU1vZGVsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvYmxlbSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdwcm9ibGVtcy52aXNpYmlsaXR5Jyk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoT3V0bGluZUNvbmZpZ0tleXMucHJvYmxlbXNFbmFibGVkKTtcblx0XHRpZiAoIW1vZGVsIHx8ICFwcm9ibGVtIHx8ICFjb25maWcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2VyczogSU91dGxpbmVNYXJrZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3JhbmdlLCBtYXJrZXJdIG9mIHRoaXMuX21hcmtlckRlY29yYXRpb25zU2VydmljZS5nZXRMaXZlTWFya2Vycyhtb2RlbC51cmkpKSB7XG5cdFx0XHRpZiAobWFya2VyLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5FcnJvciB8fCBtYXJrZXIuc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5Lldhcm5pbmcpIHtcblx0XHRcdFx0bWFya2Vycy5wdXNoKHsgLi4ucmFuZ2UsIHNldmVyaXR5OiBtYXJrZXIuc2V2ZXJpdHkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG1vZGVsLnVwZGF0ZU1hcmtlcihtYXJrZXJzKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldE91dGxpbmVNb2RlbChtb2RlbDogT3V0bGluZU1vZGVsIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAoIXBvc2l0aW9uIHx8ICFtb2RlbCkge1xuXHRcdFx0dGhpcy5fb3V0bGluZU1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fYnJlYWRjcnVtYnNEYXRhU291cmNlLmNsZWFyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghdGhpcy5fb3V0bGluZU1vZGVsPy5tZXJnZShtb2RlbCkpIHtcblx0XHRcdFx0dGhpcy5fb3V0bGluZU1vZGVsID0gbW9kZWw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9icmVhZGNydW1ic0RhdGFTb3VyY2UudXBkYXRlKG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoe30pO1xuXHR9XG59XG5cbmNsYXNzIERvY3VtZW50U3ltYm9sc091dGxpbmVDcmVhdG9yIGltcGxlbWVudHMgSU91dGxpbmVDcmVhdG9yPElFZGl0b3JQYW5lLCBEb2N1bWVudFN5bWJvbEl0ZW0+IHtcblxuXHRyZWFkb25seSBkaXNwb3NlOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJT3V0bGluZVNlcnZpY2Ugb3V0bGluZVNlcnZpY2U6IElPdXRsaW5lU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCByZWcgPSBvdXRsaW5lU2VydmljZS5yZWdpc3Rlck91dGxpbmVDcmVhdG9yKHRoaXMpO1xuXHRcdHRoaXMuZGlzcG9zZSA9ICgpID0+IHJlZy5kaXNwb3NlKCk7XG5cdH1cblxuXHRtYXRjaGVzKGNhbmRpZGF0ZTogSUVkaXRvclBhbmUpOiBjYW5kaWRhdGUgaXMgSUVkaXRvclBhbmUge1xuXHRcdGNvbnN0IGN0cmwgPSBjYW5kaWRhdGUuZ2V0Q29udHJvbCgpO1xuXHRcdHJldHVybiBpc0NvZGVFZGl0b3IoY3RybCkgfHwgaXNEaWZmRWRpdG9yKGN0cmwpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlT3V0bGluZShwYW5lOiBJRWRpdG9yUGFuZSwgdGFyZ2V0OiBPdXRsaW5lVGFyZ2V0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJT3V0bGluZTxEb2N1bWVudFN5bWJvbEl0ZW0+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udHJvbCA9IHBhbmUuZ2V0Q29udHJvbCgpO1xuXHRcdGxldCBlZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdGVkaXRvciA9IGNvbnRyb2w7XG5cdFx0fSBlbHNlIGlmIChpc0RpZmZFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdGVkaXRvciA9IGNvbnRyb2wuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHR9XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpcnN0TG9hZEJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGVkaXRvci5pbnZva2VXaXRoaW5Db250ZXh0KGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKERvY3VtZW50U3ltYm9sc091dGxpbmUsIGVkaXRvciwgdGFyZ2V0LCBmaXJzdExvYWRCYXJyaWVyKSk7XG5cdFx0YXdhaXQgZmlyc3RMb2FkQmFycmllci53YWl0KCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRG9jdW1lbnRTeW1ib2xzT3V0bGluZUNyZWF0b3IsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsa0NBQXFJLGlCQUFxQyxtQkFBbUIscUJBQXNCO0FBQzVOLFNBQTBDLGNBQWMsMkJBQTJCO0FBQ25GLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsMEJBQTBCLHFDQUFxQyx3QkFBd0Isc0JBQXNCLDZCQUE2QixnQ0FBZ0MsdUNBQXVDLCtCQUErQixpQ0FBaUM7QUFDMVIsU0FBc0IsY0FBYyxvQkFBb0I7QUFDeEQsU0FBUyxjQUFjLGdCQUFnQixjQUFjLGFBQTZCLDRCQUE0QjtBQUM5RyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxrQkFBa0IsY0FBYyxTQUFTLGVBQWU7QUFDakUsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQXlCLHFDQUFxQztBQUM5RCxTQUFTLDBCQUEwQjtBQUduQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQ0FBZ0M7QUFJekMsSUFBTSxrQ0FBTixNQUE0RjtBQUFBLEVBSTNGLFlBQ2tCLFNBQ21DLG1DQUNuRDtBQUZnQjtBQUNtQztBQUpyRCxTQUFRLGVBQWlFLENBQUM7QUFBQSxFQUt0RTtBQUFBLEVBRUosd0JBQW1GO0FBQ2xGLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLGVBQWUsQ0FBQztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxPQUFPLE9BQXFCLFVBQTJCO0FBQ3RELFVBQU0sY0FBYyxLQUFLLG9CQUFvQixPQUFPLFFBQVE7QUFDNUQsU0FBSyxlQUFlLFlBQVksSUFBSSxjQUFZO0FBQUEsTUFDL0M7QUFBQSxNQUNBLE9BQU8sbUJBQW1CLGlCQUFpQixRQUFRLE9BQU8sT0FBTztBQUFBLElBQ2xFLEVBQUU7QUFBQSxFQUNIO0FBQUEsRUFFUSxvQkFBb0IsT0FBcUIsVUFBMkQ7QUFDM0csUUFBSSxPQUFrRCxNQUFNLHlCQUF5QixRQUFRO0FBQzdGLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sUUFBOEMsQ0FBQztBQUNyRCxXQUFPLE1BQU07QUFDWixZQUFNLEtBQUssSUFBSTtBQUNmLFlBQU0sU0FBYyxLQUFLO0FBQ3pCLFVBQUksa0JBQWtCLGNBQWM7QUFDbkM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxrQkFBa0IsZ0JBQWdCLE9BQU8sVUFBVSxPQUFPLE9BQU8sU0FBUyxTQUFTLEdBQUc7QUFDekY7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQStDLENBQUM7QUFDdEQsYUFBUyxJQUFJLE1BQU0sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzNDLFlBQU0sVUFBVSxNQUFNLENBQUM7QUFDdkIsVUFBSSxLQUFLLFlBQVksT0FBTyxHQUFHO0FBQzlCO0FBQUEsTUFDRDtBQUNBLGFBQU8sS0FBSyxPQUFPO0FBQUEsSUFDcEI7QUFDQSxRQUFJLE9BQU8sV0FBVyxHQUFHO0FBQ3hCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxTQUErQjtBQUNsRCxRQUFJLEVBQUUsbUJBQW1CLGlCQUFpQjtBQUN6QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sTUFBTSxlQUFlLHFCQUFxQixpQkFBaUIsUUFBUSxPQUFPLElBQUksQ0FBQztBQUNyRixRQUFJO0FBQ0osUUFBSSxLQUFLLFdBQVcsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM1QyxZQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsWUFBTSxNQUFNO0FBQUEsSUFDYjtBQUNBLFdBQU8sQ0FBQyxLQUFLLGtDQUFrQyxTQUFrQixLQUFLLEdBQUc7QUFBQSxFQUMxRTtBQUNEO0FBcEVNLGtDQUFOO0FBQUEsRUFNRztBQUFBLEdBTkc7QUF1RU4sSUFBTSx5QkFBTixNQUFxRTtBQUFBLEVBeUJwRSxZQUNrQixTQUNqQixRQUNBLGtCQUMyQywwQkFDTixvQkFDRSxzQkFDQyx1QkFDSSwyQkFDVCxrQ0FDWixzQkFDdEI7QUFWZ0I7QUFHMEI7QUFDTjtBQUNFO0FBQ0M7QUFDSTtBQS9CN0MsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUNwRCxTQUFpQixlQUFlLEtBQUssYUFBYSxJQUFJLElBQUksUUFBNEIsQ0FBQztBQUV2RixTQUFTLGNBQXlDLEtBQUssYUFBYTtBQUdwRSxTQUFpQixzQkFBc0IsSUFBSSxnQkFBZ0I7QUFNM0QsU0FBUyxjQUFjO0FBd0J0QixTQUFLLHlCQUF5QixJQUFJLGdDQUFnQyxTQUFTLGdDQUFnQztBQUMzRyxVQUFNLFdBQVcsSUFBSSw4QkFBOEI7QUFDbkQsVUFBTSxZQUFZLENBQUMsSUFBSSw0QkFBNEIsR0FBRyxxQkFBcUIsZUFBZSx3QkFBd0IsTUFBTSxNQUFNLENBQUM7QUFDL0gsVUFBTSxpQkFBd0Q7QUFBQSxNQUM3RCxhQUFhLENBQUMsV0FBVztBQUN4QixZQUFJLGtCQUFrQixrQkFBa0Isa0JBQWtCLGNBQWM7QUFDdkUsaUJBQU8sT0FBTyxTQUFTLE9BQU87QUFBQSxRQUMvQjtBQUNBLFlBQUksV0FBVyxRQUFRLEtBQUssZUFBZTtBQUMxQyxpQkFBTyxLQUFLLGNBQWMsU0FBUyxPQUFPO0FBQUEsUUFDM0M7QUFDQSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxJQUFJLHlCQUF5QjtBQUNoRCxVQUFNLGVBQWUsaUNBQWlDLFNBQTJDLFFBQVEsU0FBUyxHQUFHLEtBQUssa0JBQWtCLGFBQWE7QUFDekosVUFBTSxVQUFVO0FBQUEsTUFDZixtQkFBbUIsV0FBVyxjQUFjLGVBQWdCLFdBQVcsY0FBYyxlQUFlLGlCQUFpQixpQ0FBaUM7QUFBQSxNQUN0SiwwQkFBMEI7QUFBQSxNQUMxQiwwQkFBMEI7QUFBQSxNQUMxQixrQkFBa0IsSUFBSSwrQkFBK0I7QUFBQSxNQUNyRCxpQ0FBaUMsSUFBSSxzQ0FBc0M7QUFBQSxNQUMzRSx1QkFBdUIsSUFBSSxvQ0FBb0MsU0FBUyxZQUFZLGtCQUFrQixDQUFDO0FBQUEsTUFDdkcsUUFBUSxXQUFXLGNBQWMsY0FDOUIscUJBQXFCLGVBQWUsc0JBQXNCLFNBQVMsSUFDbkUsV0FBVyxjQUFjLGNBQ3hCLHFCQUFxQixlQUFlLHNCQUFzQixhQUFhLElBQ3ZFO0FBQUEsTUFDSixLQUFLLHFCQUFxQixlQUFlLHlCQUF5QjtBQUFBLElBQ25FO0FBRUEsU0FBSyxTQUFTO0FBQUEsTUFDYix1QkFBdUIsS0FBSztBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EscUJBQXFCLEVBQUUsc0JBQXNCLE1BQU07QUFBRSxjQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxNQUFHLEVBQUU7QUFBQSxJQUM1RjtBQUlBLFNBQUssYUFBYSxJQUFJLHlCQUF5Qix1QkFBdUIsWUFBWSxPQUFLLEtBQUssZUFBZSxDQUFDLENBQUM7QUFDN0csU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLGlCQUFpQixPQUFLLEtBQUssZUFBZSxDQUFDLENBQUM7QUFDL0UsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLHlCQUF5QixPQUFLLEtBQUssZUFBZSxDQUFDLENBQUM7QUFHdkYsVUFBTSxhQUFhLElBQUksYUFBYTtBQUNwQyxTQUFLLGFBQWEsSUFBSSxVQUFVO0FBQ2hDLFNBQUssYUFBYSxJQUFJLEtBQUssUUFBUSx3QkFBd0IsV0FBUztBQUNuRSxZQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsVUFBSSxPQUFPO0FBQ1YsY0FBTUEsV0FBVSxxQkFBcUIsaUJBQWlCLEtBQUs7QUFDM0QsbUJBQVcsYUFBYSxNQUFNLEtBQUssZUFBZSxLQUFLLEdBQUdBLFFBQU87QUFBQSxNQUNsRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLGFBQWEsTUFBTSxLQUFLLG9CQUFvQixNQUFNLENBQUMsQ0FBQztBQUd2RixTQUFLLGVBQWUsRUFBRSxRQUFRLE1BQU0saUJBQWlCLEtBQUssQ0FBQztBQUFBLEVBQzVEO0FBQUEsRUFyRkEsSUFBSSxnQkFBZ0Q7QUFDbkQsVUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZO0FBQzNDLFFBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxlQUFlO0FBQ3RDLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixhQUFPLEtBQUssY0FBYyx5QkFBeUIsU0FBUztBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUFBLEVBZ0ZBLFVBQWdCO0FBQ2YsU0FBSyxhQUFhLFFBQVE7QUFDMUIsU0FBSyxvQkFBb0IsUUFBUTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sQ0FBQyxLQUFLLGlCQUFpQixZQUFZLE1BQU0sS0FBSyxhQUFhO0FBQUEsRUFDbkU7QUFBQSxFQUVBLElBQUksTUFBTTtBQUNULFdBQU8sS0FBSyxlQUFlO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQU0sT0FBTyxPQUEyQixTQUF5QixZQUFxQixRQUFnQztBQUNySCxVQUFNLFFBQVEsYUFBYSxJQUFJLEtBQUs7QUFDcEMsUUFBSSxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsaUJBQWlCO0FBQ2pEO0FBQUEsSUFDRDtBQUNBLFVBQU0sS0FBSyxtQkFBbUIsZUFBZTtBQUFBLE1BQzVDLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLFNBQVM7QUFBQSxRQUNSLEdBQUc7QUFBQSxRQUNILFdBQVcsU0FBUyxNQUFNLE9BQU8sUUFBUSxNQUFNLGdCQUFnQixNQUFNLE9BQU8sY0FBYztBQUFBLFFBQzFGLHFCQUFxQiw4QkFBOEI7QUFBQSxNQUNwRDtBQUFBLElBQ0QsR0FBRyxLQUFLLFNBQVMsVUFBVTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxRQUFRLE9BQXdDO0FBQy9DLFFBQUksRUFBRSxpQkFBaUIsaUJBQWlCO0FBQ3ZDLGFBQU8sV0FBVztBQUFBLElBQ25CO0FBRUEsVUFBTSxFQUFFLE9BQU8sSUFBSTtBQUNuQixTQUFLLFFBQVEscUNBQXFDLE9BQU8sT0FBTyxXQUFXLE1BQU07QUFDakYsVUFBTSx3QkFBd0IsS0FBSyxRQUFRLDRCQUE0QixDQUFDO0FBQUEsTUFDdkUsT0FBTyxPQUFPO0FBQUEsTUFDZCxTQUFTO0FBQUEsUUFDUixhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxhQUFhLE1BQU0sc0JBQXNCLE1BQU0sQ0FBQztBQUFBLEVBQ3hEO0FBQUEsRUFFQSxtQkFBZ0M7QUFDL0IsVUFBTSxZQUFZLEtBQUssUUFBUSxjQUFjO0FBQzdDLFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFVBQUksV0FBVztBQUNkLGFBQUssUUFBUSxpQkFBaUIsU0FBUztBQUFBLE1BQ3hDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyxlQUFlLG9CQUErRDtBQUUzRixTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFFBQUksQ0FBQyxvQkFBb0I7QUFDeEIsV0FBSyxpQkFBaUIsTUFBUztBQUFBLElBQ2hDO0FBRUEsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLEtBQUssUUFBUSxTQUFTO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLHlCQUF5Qix1QkFBdUIsSUFBSSxNQUFNLEdBQUc7QUFDdEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLFVBQU0sZ0JBQWdCLE9BQU8sYUFBYTtBQUMxQyxVQUFNLGVBQWUsSUFBSSxhQUFhO0FBRXRDLFNBQUssb0JBQW9CLElBQUksWUFBWTtBQUN6QyxTQUFLLG9CQUFvQixJQUFJLGFBQWEsTUFBTSxJQUFJLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFFbEUsUUFBSTtBQUNILFlBQU0sUUFBUSxNQUFNLEtBQUsscUJBQXFCLFlBQVksUUFBUSxJQUFJLEtBQUs7QUFDM0UsVUFBSSxJQUFJLE1BQU0seUJBQXlCO0FBRXRDO0FBQUEsTUFDRDtBQUVBLFVBQUksWUFBWSxNQUFNLEtBQUssS0FBSyxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFFekQsYUFBSyxpQkFBaUIsS0FBSztBQUMzQjtBQUFBLE1BQ0Q7QUFJQSxVQUFJLHNCQUFzQixLQUFLLGlCQUFpQixPQUFPLGFBQWEsS0FBSyxJQUFJO0FBQzVFLGNBQU0sVUFBVSxZQUFZLEtBQUssS0FBSztBQUN0QyxjQUFNLFlBQVksT0FBTyxlQUFlO0FBQ3hDLGNBQU0sV0FBVyxVQUFVO0FBQzNCLGNBQU0sVUFBVSxZQUFZLEtBQUssS0FBSyxhQUFhO0FBQ25ELGNBQU0sWUFBWSxZQUFZLG1CQUFtQixRQUFRLE9BQU8sQ0FBQyxNQUFNLFVBQVUsT0FBTyxNQUFNLGFBQWEsQ0FBQztBQUM1RyxjQUFNLFdBQVcsVUFBVTtBQUMzQixZQUFJLFlBQVksV0FBVyxPQUFPLFlBQVksV0FBVyxLQUFLO0FBRzdELGdCQUFNLFFBQVEsTUFBTSxpQkFBaUIsUUFBUSxHQUFJLEVBQUUsS0FBSyxNQUFNLElBQUksR0FBRyxJQUFJLE9BQU8sS0FBSztBQUNyRixjQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBR0EsV0FBSyx1QkFBdUIsS0FBSztBQUNqQyxXQUFLLG9CQUFvQixJQUFJLEtBQUssMEJBQTBCLGtCQUFrQixlQUFhO0FBQzFGLFlBQUksUUFBUSxNQUFNLEtBQUssVUFBVSxHQUFHLEdBQUc7QUFDdEMsZUFBSyx1QkFBdUIsS0FBSztBQUNqQyxlQUFLLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxvQkFBb0IsSUFBSSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUNyRixZQUFJLEVBQUUscUJBQXFCLGtCQUFrQixlQUFlLEtBQUssRUFBRSxxQkFBcUIscUJBQXFCLEdBQUc7QUFDL0csZ0JBQU0sVUFBVSxLQUFLLHNCQUFzQixTQUFTLHFCQUFxQjtBQUN6RSxnQkFBTSxTQUFTLEtBQUssc0JBQXNCLFNBQVMsa0JBQWtCLGVBQWU7QUFFcEYsY0FBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRO0FBQ3hCLGtCQUFNLGFBQWEsQ0FBQyxDQUFDO0FBQUEsVUFDdEIsT0FBTztBQUNOLGlCQUFLLHVCQUF1QixLQUFLO0FBQUEsVUFDbEM7QUFDQSxlQUFLLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFBQSxRQUMxQjtBQUNBLFlBQUksRUFBRSxxQkFBcUIsU0FBUyxHQUFHO0FBRXRDLGVBQUssYUFBYSxLQUFLLENBQUMsQ0FBQztBQUFBLFFBQzFCO0FBQ0EsWUFBSSxFQUFFLHFCQUFxQixhQUFhLEtBQUssS0FBSyxRQUFRLFNBQVMsR0FBRztBQUVyRSxlQUFLLHVCQUF1QixPQUFPLE9BQU8sS0FBSyxRQUFRLFlBQVksQ0FBQztBQUNwRSxlQUFLLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBR0YsV0FBSyxvQkFBb0IsSUFBSSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUNyRixZQUFJLEVBQUUscUJBQXFCLGtCQUFrQixLQUFLLEdBQUc7QUFDcEQsZUFBSyxhQUFhLEtBQUssQ0FBQyxDQUFDO0FBQUEsUUFDMUI7QUFDQSxZQUFJLEVBQUUscUJBQXFCLFNBQVMsR0FBRztBQUN0QyxlQUFLLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBR0YsV0FBSyxvQkFBb0IsSUFBSSxLQUFLLFFBQVEsMEJBQTBCLE9BQUs7QUFDeEUscUJBQWEsYUFBYSxNQUFNO0FBQy9CLGNBQUksQ0FBQyxPQUFPLFdBQVcsS0FBSyxrQkFBa0IsT0FBTyxhQUFhLEtBQUssS0FBSyxRQUFRLFNBQVMsR0FBRztBQUMvRixpQkFBSyx1QkFBdUIsT0FBTyxPQUFPLEtBQUssUUFBUSxZQUFZLENBQUM7QUFDcEUsaUJBQUssYUFBYSxLQUFLLEVBQUUseUJBQXlCLEtBQUssQ0FBQztBQUFBLFVBQ3pEO0FBQUEsUUFDRCxHQUFHLEdBQUc7QUFBQSxNQUNQLENBQUMsQ0FBQztBQUdGLFdBQUssaUJBQWlCLEtBQUs7QUFBQSxJQUU1QixTQUFTLEtBQUs7QUFDYixXQUFLLGlCQUFpQixNQUFTO0FBQy9CLHdCQUFrQixHQUFHO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBdUIsT0FBdUM7QUFDckUsVUFBTSxVQUFVLEtBQUssc0JBQXNCLFNBQVMscUJBQXFCO0FBQ3pFLFVBQU0sU0FBUyxLQUFLLHNCQUFzQixTQUFTLGtCQUFrQixlQUFlO0FBQ3BGLFFBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFFBQVE7QUFDbEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUE0QixDQUFDO0FBQ25DLGVBQVcsQ0FBQyxPQUFPLE1BQU0sS0FBSyxLQUFLLDBCQUEwQixlQUFlLE1BQU0sR0FBRyxHQUFHO0FBQ3ZGLFVBQUksT0FBTyxhQUFhLGVBQWUsU0FBUyxPQUFPLGFBQWEsZUFBZSxTQUFTO0FBQzNGLGdCQUFRLEtBQUssRUFBRSxHQUFHLE9BQU8sVUFBVSxPQUFPLFNBQVMsQ0FBQztBQUFBLE1BQ3JEO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxPQUFPO0FBQUEsRUFDM0I7QUFBQSxFQUVRLGlCQUFpQixPQUFpQztBQUN6RCxVQUFNLFdBQVcsS0FBSyxRQUFRLFlBQVk7QUFDMUMsUUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPO0FBQ3hCLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssdUJBQXVCLE1BQU07QUFBQSxJQUNuQyxPQUFPO0FBQ04sVUFBSSxDQUFDLEtBQUssZUFBZSxNQUFNLEtBQUssR0FBRztBQUN0QyxhQUFLLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQ0EsV0FBSyx1QkFBdUIsT0FBTyxPQUFPLFFBQVE7QUFBQSxJQUNuRDtBQUNBLFNBQUssYUFBYSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQzFCO0FBQ0Q7QUE1U00seUJBQU47QUFBQSxFQTZCRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkNHO0FBOFNOLElBQU0sZ0NBQU4sTUFBZ0c7QUFBQSxFQUkvRixZQUNrQixnQkFDaEI7QUFDRCxVQUFNLE1BQU0sZUFBZSx1QkFBdUIsSUFBSTtBQUN0RCxTQUFLLFVBQVUsTUFBTSxJQUFJLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRUEsUUFBUSxXQUFrRDtBQUN6RCxVQUFNLE9BQU8sVUFBVSxXQUFXO0FBQ2xDLFdBQU8sYUFBYSxJQUFJLEtBQUssYUFBYSxJQUFJO0FBQUEsRUFDL0M7QUFBQSxFQUVBLE1BQU0sY0FBYyxNQUFtQixRQUF1QixRQUE4RTtBQUMzSSxVQUFNLFVBQVUsS0FBSyxXQUFXO0FBQ2hDLFFBQUk7QUFDSixRQUFJLGFBQWEsT0FBTyxHQUFHO0FBQzFCLGVBQVM7QUFBQSxJQUNWLFdBQVcsYUFBYSxPQUFPLEdBQUc7QUFDakMsZUFBUyxRQUFRLGtCQUFrQjtBQUFBLElBQ3BDO0FBQ0EsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sbUJBQW1CLElBQUksUUFBUTtBQUNyQyxVQUFNLFNBQVMsT0FBTyxvQkFBb0IsY0FBWSxTQUFTLElBQUkscUJBQXFCLEVBQUUsZUFBZSx3QkFBd0IsUUFBUSxRQUFRLGdCQUFnQixDQUFDO0FBQ2xLLFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWhDTSxnQ0FBTjtBQUFBLEVBS0c7QUFBQSxHQUxHO0FBa0NOLFNBQVMsR0FBb0Msb0JBQW9CLFNBQVMsRUFBRSw4QkFBOEIsK0JBQStCLGVBQWUsVUFBVTsiLAogICJuYW1lcyI6IFsidGltZW91dCJdCn0K
