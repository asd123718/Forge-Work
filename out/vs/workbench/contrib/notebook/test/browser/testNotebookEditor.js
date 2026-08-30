import * as DOM from "../../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { NotImplementedError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../../editor/common/languages/languageConfigurationRegistry.js";
import { LanguageService } from "../../../../../editor/common/services/languageService.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ModelService } from "../../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { TestLanguageConfigurationService } from "../../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { TestClipboardService } from "../../../../../platform/clipboard/test/common/testClipboardService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { MockKeybindingService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../../../platform/undoRedo/common/undoRedoService.js";
import { IWorkspaceTrustRequestService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { EditorModel } from "../../../../common/editor/editorModel.js";
import { CellFocusMode } from "../../browser/notebookBrowser.js";
import { NotebookCellStatusBarService } from "../../browser/services/notebookCellStatusBarServiceImpl.js";
import { ListViewInfoAccessor, NotebookCellList } from "../../browser/view/notebookCellList.js";
import { NotebookEventDispatcher } from "../../browser/viewModel/eventDispatcher.js";
import { NotebookViewModel } from "../../browser/viewModel/notebookViewModelImpl.js";
import { ViewContext } from "../../browser/viewModel/viewContext.js";
import { NotebookCellTextModel } from "../../common/model/notebookCellTextModel.js";
import { NotebookTextModel } from "../../common/model/notebookTextModel.js";
import { INotebookCellStatusBarService } from "../../common/notebookCellStatusBarService.js";
import { CellUri, NotebookCellExecutionState, SelectionStateType } from "../../common/notebookCommon.js";
import { INotebookExecutionStateService } from "../../common/notebookExecutionStateService.js";
import { NotebookOptions } from "../../browser/notebookOptions.js";
import { TextModelResolverService } from "../../../../services/textmodelResolver/common/textModelResolverService.js";
import { TestLayoutService } from "../../../../test/browser/workbenchTestServices.js";
import { TestStorageService, TestTextResourcePropertiesService, TestWorkspaceTrustRequestService } from "../../../../test/common/workbenchTestServices.js";
import { FontInfo } from "../../../../../editor/common/config/fontInfo.js";
import { EditorFontLigatures, EditorFontVariations } from "../../../../../editor/common/config/editorOptions.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { TestCodeEditorService } from "../../../../../editor/test/browser/editorTestServices.js";
import { INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory } from "../../browser/viewModel/notebookOutlineDataSourceFactory.js";
import { ILanguageDetectionService } from "../../../../services/languageDetection/common/languageDetectionWorkerService.js";
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from "../../browser/viewModel/notebookOutlineEntryFactory.js";
import { IOutlineService } from "../../../../services/outline/browser/outline.js";
import { DefaultEndOfLine } from "../../../../../editor/common/model.js";
import { ITextResourcePropertiesService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { INotebookLoggingService } from "../../common/notebookLoggingService.js";
class NullNotebookLoggingService {
  info(category, output) {
  }
  warn(category, output) {
  }
  error(category, output) {
  }
  debug(category, output) {
  }
  trace(category, message) {
  }
}
class TestCell extends NotebookCellTextModel {
  constructor(viewType, handle, source, language, cellKind, outputs, languageService) {
    super(
      CellUri.generate(URI.parse("test:///fake/notebook"), handle),
      handle,
      {
        source,
        language,
        mime: Mimes.text,
        cellKind,
        outputs,
        metadata: void 0,
        internalMetadata: void 0,
        collapseState: void 0
      },
      { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} },
      languageService,
      DefaultEndOfLine.LF,
      void 0,
      // defaultCollapseConfig
      void 0,
      // languageDetectionService
      new NullNotebookLoggingService()
    );
    this.viewType = viewType;
    this.source = source;
  }
}
class NotebookEditorTestModel extends EditorModel {
  constructor(_notebook) {
    super();
    this._notebook = _notebook;
    this._dirty = false;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this._onDidChangeDirty = this._register(new Emitter());
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this.onDidChangeOrphaned = Event.None;
    this.onDidChangeReadonly = Event.None;
    this.onDidRevertUntitled = Event.None;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    if (_notebook && _notebook.onDidChangeContent) {
      this._register(_notebook.onDidChangeContent(() => {
        this._dirty = true;
        this._onDidChangeDirty.fire();
        this._onDidChangeContent.fire();
      }));
    }
  }
  get viewType() {
    return this._notebook.viewType;
  }
  get resource() {
    return this._notebook.uri;
  }
  get notebook() {
    return this._notebook;
  }
  isReadonly() {
    return false;
  }
  isOrphaned() {
    return false;
  }
  hasAssociatedFilePath() {
    return false;
  }
  isDirty() {
    return this._dirty;
  }
  get hasErrorState() {
    return false;
  }
  isModified() {
    return this._dirty;
  }
  getNotebook() {
    return this._notebook;
  }
  async load() {
    return this;
  }
  async save() {
    if (this._notebook) {
      this._dirty = false;
      this._onDidChangeDirty.fire();
      this._onDidSave.fire({});
      return true;
    }
    return false;
  }
  saveAs() {
    throw new NotImplementedError();
  }
  revert() {
    throw new NotImplementedError();
  }
}
function setupInstantiationService(disposables) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const testThemeService = new TestThemeService();
  instantiationService.stub(ILanguageService, disposables.add(new LanguageService()));
  instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
  instantiationService.stub(IConfigurationService, new TestConfigurationService());
  instantiationService.stub(IThemeService, testThemeService);
  instantiationService.stub(ILanguageConfigurationService, disposables.add(new TestLanguageConfigurationService()));
  instantiationService.stub(ITextResourcePropertiesService, instantiationService.createInstance(TestTextResourcePropertiesService));
  instantiationService.stub(IModelService, disposables.add(instantiationService.createInstance(ModelService)));
  instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
  instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
  instantiationService.stub(IListService, disposables.add(instantiationService.createInstance(ListService)));
  instantiationService.stub(ILayoutService, new TestLayoutService());
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IClipboardService, TestClipboardService);
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IWorkspaceTrustRequestService, disposables.add(new TestWorkspaceTrustRequestService(true)));
  instantiationService.stub(INotebookExecutionStateService, new TestNotebookExecutionStateService());
  instantiationService.stub(IKeybindingService, new MockKeybindingService());
  instantiationService.stub(INotebookCellStatusBarService, disposables.add(new NotebookCellStatusBarService()));
  instantiationService.stub(ICodeEditorService, disposables.add(new TestCodeEditorService(testThemeService)));
  instantiationService.stub(IOutlineService, new class extends mock() {
    registerOutlineCreator() {
      return { dispose() {
      } };
    }
  }());
  instantiationService.stub(INotebookCellOutlineDataSourceFactory, instantiationService.createInstance(NotebookCellOutlineDataSourceFactory));
  instantiationService.stub(INotebookOutlineEntryFactory, instantiationService.createInstance(NotebookOutlineEntryFactory));
  instantiationService.stub(INotebookLoggingService, new NullNotebookLoggingService());
  instantiationService.stub(ILanguageDetectionService, new class MockLanguageDetectionService {
    isEnabledForLanguage(languageId) {
      return false;
    }
    async detectLanguage(resource, supportedLangs) {
      return void 0;
    }
  }());
  return instantiationService;
}
function _createTestNotebookEditor(instantiationService, disposables, cells) {
  const viewType = "notebook";
  const notebook = disposables.add(instantiationService.createInstance(NotebookTextModel, viewType, URI.parse("test://test"), cells.map((cell) => {
    return {
      source: cell[0],
      mime: void 0,
      language: cell[1],
      cellKind: cell[2],
      outputs: cell[3] ?? [],
      metadata: cell[4]
    };
  }), {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }));
  const model = disposables.add(new NotebookEditorTestModel(notebook));
  const notebookOptions = disposables.add(new NotebookOptions(mainWindow, false, void 0, instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), instantiationService.get(ICodeEditorService)));
  const baseCellEditorOptions = new class extends mock() {
  }();
  const viewContext = new ViewContext(notebookOptions, disposables.add(new NotebookEventDispatcher()), () => baseCellEditorOptions);
  const viewModel = disposables.add(instantiationService.createInstance(NotebookViewModel, viewType, model.notebook, viewContext, null, { isReadOnly: false }));
  const cellList = disposables.add(createNotebookCellList(instantiationService, disposables, viewContext));
  cellList.attachViewModel(viewModel);
  const listViewInfoAccessor = disposables.add(new ListViewInfoAccessor(cellList));
  let visibleRanges = [{ start: 0, end: 100 }];
  const id = Date.now().toString();
  const notebookEditor = new class extends mock() {
    constructor() {
      super(...arguments);
      this.notebookOptions = notebookOptions;
      this.onDidChangeModel = new Emitter().event;
      this.onDidChangeCellState = new Emitter().event;
      this.textModel = viewModel.notebookDocument;
      this.onDidChangeVisibleRanges = Event.None;
    }
    // eslint-disable-next-line local/code-must-use-super-dispose
    dispose() {
      viewModel.dispose();
    }
    getViewModel() {
      return viewModel;
    }
    hasModel() {
      return !!viewModel;
    }
    getLength() {
      return viewModel.length;
    }
    getFocus() {
      return viewModel.getFocus();
    }
    getSelections() {
      return viewModel.getSelections();
    }
    setFocus(focus) {
      viewModel.updateSelectionsState({
        kind: SelectionStateType.Index,
        focus,
        selections: viewModel.getSelections()
      });
    }
    setSelections(selections) {
      viewModel.updateSelectionsState({
        kind: SelectionStateType.Index,
        focus: viewModel.getFocus(),
        selections
      });
    }
    getViewIndexByModelIndex(index) {
      return listViewInfoAccessor.getViewIndex(viewModel.viewCells[index]);
    }
    getCellRangeFromViewRange(startIndex, endIndex) {
      return listViewInfoAccessor.getCellRangeFromViewRange(startIndex, endIndex);
    }
    revealCellRangeInView() {
    }
    async revealInView() {
    }
    setHiddenAreas(_ranges) {
      return cellList.setHiddenAreas(_ranges, true);
    }
    getActiveCell() {
      const elements = cellList.getFocusedElements();
      if (elements && elements.length) {
        return elements[0];
      }
      return void 0;
    }
    hasOutputTextSelection() {
      return false;
    }
    changeModelDecorations() {
      return null;
    }
    focusElement() {
    }
    setCellEditorSelection() {
    }
    async revealRangeInCenterIfOutsideViewportAsync() {
    }
    async layoutNotebookCell() {
    }
    async createOutput() {
    }
    async removeInset() {
    }
    async focusNotebookCell(cell, focusItem) {
      cell.focusMode = focusItem === "editor" ? CellFocusMode.Editor : focusItem === "output" ? CellFocusMode.Output : CellFocusMode.Container;
    }
    cellAt(index) {
      return viewModel.cellAt(index);
    }
    getCellIndex(cell) {
      return viewModel.getCellIndex(cell);
    }
    getCellsInRange(range) {
      return viewModel.getCellsInRange(range);
    }
    getCellByHandle(handle) {
      return viewModel.getCellByHandle(handle);
    }
    getNextVisibleCellIndex(index) {
      return viewModel.getNextVisibleCellIndex(index);
    }
    getControl() {
      return this;
    }
    get onDidChangeSelection() {
      return viewModel.onDidChangeSelection;
    }
    get onDidChangeOptions() {
      return viewModel.onDidChangeOptions;
    }
    get onDidChangeViewCells() {
      return viewModel.onDidChangeViewCells;
    }
    async find(query, options) {
      const findMatches = viewModel.find(query, options).filter((match) => match.length > 0);
      return findMatches;
    }
    deltaCellDecorations() {
      return [];
    }
    get visibleRanges() {
      return visibleRanges;
    }
    set visibleRanges(_ranges) {
      visibleRanges = _ranges;
    }
    getId() {
      return id;
    }
    setScrollTop(scrollTop) {
      cellList.scrollTop = scrollTop;
    }
    get scrollTop() {
      return cellList.scrollTop;
    }
    getLayoutInfo() {
      return {
        width: 0,
        height: 0,
        scrollHeight: cellList.getScrollHeight(),
        fontInfo: new FontInfo({
          pixelRatio: 1,
          fontFamily: "mockFont",
          fontWeight: "normal",
          fontSize: 14,
          fontFeatureSettings: EditorFontLigatures.OFF,
          fontVariationSettings: EditorFontVariations.OFF,
          lineHeight: 19,
          letterSpacing: 1.5,
          isMonospace: true,
          typicalHalfwidthCharacterWidth: 10,
          typicalFullwidthCharacterWidth: 20,
          canUseHalfwidthRightwardsArrow: true,
          spaceWidth: 10,
          middotWidth: 10,
          wsmiddotWidth: 10,
          maxDigitWidth: 10
        }, true),
        stickyHeight: 0,
        listViewOffsetTop: 0
      };
    }
  }();
  return { editor: notebookEditor, viewModel };
}
function createTestNotebookEditor(instantiationService, disposables, cells) {
  return _createTestNotebookEditor(instantiationService, disposables, cells);
}
async function withTestNotebookDiffModel(originalCells, modifiedCells, callback) {
  const disposables = new DisposableStore();
  const instantiationService = setupInstantiationService(disposables);
  const originalNotebook = createTestNotebookEditor(instantiationService, disposables, originalCells);
  const modifiedNotebook = createTestNotebookEditor(instantiationService, disposables, modifiedCells);
  const originalResource = new class extends mock() {
    get notebook() {
      return originalNotebook.viewModel.notebookDocument;
    }
    get resource() {
      return originalNotebook.viewModel.notebookDocument.uri;
    }
  }();
  const modifiedResource = new class extends mock() {
    get notebook() {
      return modifiedNotebook.viewModel.notebookDocument;
    }
    get resource() {
      return modifiedNotebook.viewModel.notebookDocument.uri;
    }
  }();
  const model = new class extends mock() {
    get original() {
      return originalResource;
    }
    get modified() {
      return modifiedResource;
    }
  }();
  const res = await callback(model, disposables, instantiationService);
  if (res instanceof Promise) {
    res.finally(() => {
      originalNotebook.editor.dispose();
      originalNotebook.viewModel.notebookDocument.dispose();
      originalNotebook.viewModel.dispose();
      modifiedNotebook.editor.dispose();
      modifiedNotebook.viewModel.notebookDocument.dispose();
      modifiedNotebook.viewModel.dispose();
      disposables.dispose();
    });
  } else {
    originalNotebook.editor.dispose();
    originalNotebook.viewModel.notebookDocument.dispose();
    originalNotebook.viewModel.dispose();
    modifiedNotebook.editor.dispose();
    modifiedNotebook.viewModel.notebookDocument.dispose();
    modifiedNotebook.viewModel.dispose();
    disposables.dispose();
  }
  return res;
}
async function withTestNotebook(cells, callback, accessor) {
  const disposables = new DisposableStore();
  const instantiationService = accessor ?? setupInstantiationService(disposables);
  const notebookEditor = _createTestNotebookEditor(instantiationService, disposables, cells);
  return runWithFakedTimers({ useFakeTimers: true }, async () => {
    const res = await callback(notebookEditor.editor, notebookEditor.viewModel, disposables, instantiationService);
    if (res instanceof Promise) {
      res.finally(() => {
        notebookEditor.editor.dispose();
        notebookEditor.viewModel.dispose();
        notebookEditor.editor.textModel.dispose();
        disposables.dispose();
      });
    } else {
      notebookEditor.editor.dispose();
      notebookEditor.viewModel.dispose();
      notebookEditor.editor.textModel.dispose();
      disposables.dispose();
    }
    return res;
  });
}
function createNotebookCellList(instantiationService, disposables, viewContext) {
  const delegate = {
    getHeight(element) {
      return element.getHeight(17);
    },
    getTemplateId() {
      return "template";
    }
  };
  const baseCellRenderTemplate = new class extends mock() {
  }();
  const renderer = {
    templateId: "template",
    renderTemplate() {
      return baseCellRenderTemplate;
    },
    renderElement() {
    },
    disposeTemplate() {
    }
  };
  const notebookOptions = !!viewContext ? viewContext.notebookOptions : disposables.add(new NotebookOptions(mainWindow, false, void 0, instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), instantiationService.get(ICodeEditorService)));
  const cellList = disposables.add(instantiationService.createInstance(
    NotebookCellList,
    "NotebookCellList",
    DOM.$("container"),
    notebookOptions,
    delegate,
    [renderer],
    instantiationService.get(IContextKeyService),
    {
      supportDynamicHeights: true,
      multipleSelectionSupport: true
    }
  ));
  return cellList;
}
function valueBytesFromString(value) {
  return VSBuffer.fromString(value);
}
class TestCellExecution {
  constructor(notebook, cellHandle, onComplete) {
    this.notebook = notebook;
    this.cellHandle = cellHandle;
    this.onComplete = onComplete;
    this.state = NotebookCellExecutionState.Unconfirmed;
    this.didPause = false;
    this.isPaused = false;
  }
  confirm() {
  }
  update(updates) {
  }
  complete(complete) {
    this.onComplete();
  }
}
class TestNotebookExecutionStateService {
  constructor() {
    this._executions = new ResourceMap();
    this.onDidChangeExecution = new Emitter().event;
    this.onDidChangeLastRunFailState = new Emitter().event;
  }
  forceCancelNotebookExecutions(notebookUri) {
  }
  getCellExecutionsForNotebook(notebook) {
    return [];
  }
  getCellExecution(cellUri) {
    return this._executions.get(cellUri);
  }
  createCellExecution(notebook, cellHandle) {
    const onComplete = () => this._executions.delete(CellUri.generate(notebook, cellHandle));
    const exe = new TestCellExecution(notebook, cellHandle, onComplete);
    this._executions.set(CellUri.generate(notebook, cellHandle), exe);
    return exe;
  }
  getCellExecutionsByHandleForNotebook(notebook) {
    return;
  }
  getLastFailedCellForNotebook(notebook) {
    return;
  }
  getLastCompletedCellForNotebook(notebook) {
    return;
  }
  getExecution(notebook) {
    return;
  }
  createExecution(notebook) {
    throw new Error("Method not implemented.");
  }
}
export {
  NotebookEditorTestModel,
  TestCell,
  TestNotebookExecutionStateService,
  createNotebookCellList,
  createTestNotebookEditor,
  setupInstantiationService,
  valueBytesFromString,
  withTestNotebook,
  withTestNotebookDiffModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFx0ZXN0Tm90ZWJvb2tFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgTm90SW1wbGVtZW50ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvdGVzdC9jb21tb24vdGVzdENsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTW9ja0tleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkb1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEZpbmRNYXRjaFdpdGhJbmRleCwgQ2VsbEZvY3VzTW9kZSwgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUsIElCYXNlQ2VsbEVkaXRvck9wdGlvbnMsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFN0YXRlQ2hhbmdlZEV2ZW50LCBOb3RlYm9va0xheW91dEluZm8gfSBmcm9tICcuLi8uLi9icm93c2VyL25vdGVib29rVmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBMaXN0Vmlld0luZm9BY2Nlc3NvciwgTm90ZWJvb2tDZWxsTGlzdCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlldy9ub3RlYm9va0NlbGxMaXN0LmpzJztcbmltcG9ydCB7IEJhc2VDZWxsUmVuZGVyVGVtcGxhdGUgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXcvbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFdmVudERpc3BhdGNoZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdNb2RlbC9ldmVudERpc3BhdGNoZXIuanMnO1xuaW1wb3J0IHsgQ2VsbFZpZXdNb2RlbCwgTm90ZWJvb2tWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIENlbGxVcmksIElDZWxsRHRvMiwgSU5vdGVib29rRGlmZkVkaXRvck1vZGVsLCBJTm90ZWJvb2tFZGl0b3JNb2RlbCwgSU5vdGVib29rRmluZE9wdGlvbnMsIElPdXRwdXREdG8sIElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwsIE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlLCBOb3RlYm9va0NlbGxNZXRhZGF0YSwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElDZWxsRXhlY3V0ZVVwZGF0ZSwgSUNlbGxFeGVjdXRpb25Db21wbGV0ZSwgSUNlbGxFeGVjdXRpb25TdGF0ZUNoYW5nZWRFdmVudCwgSUV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50LCBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uLCBJTm90ZWJvb2tFeGVjdXRpb24sIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgSU5vdGVib29rRmFpbFN0YXRlQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbm90ZWJvb2tPcHRpb25zLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0bW9kZWxSZXNvbHZlci9jb21tb24vdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNhdmVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBUZXN0TGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlLCBUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIFRlc3RXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgRWRpdG9yRm9udExpZ2F0dXJlcywgRWRpdG9yRm9udFZhcmlhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IFRlc3RDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvZWRpdG9yVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnksIE5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlRmFjdG9yeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYW5ndWFnZURldGVjdGlvbi9jb21tb24vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnksIE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL25vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0RW5kT2ZMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5cbmNsYXNzIE51bGxOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIGltcGxlbWVudHMgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGluZm8oY2F0ZWdvcnk6IHN0cmluZywgb3V0cHV0OiBzdHJpbmcpOiB2b2lkIHsgfVxuXHR3YXJuKGNhdGVnb3J5OiBzdHJpbmcsIG91dHB1dDogc3RyaW5nKTogdm9pZCB7IH1cblx0ZXJyb3IoY2F0ZWdvcnk6IHN0cmluZywgb3V0cHV0OiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRkZWJ1ZyhjYXRlZ29yeTogc3RyaW5nLCBvdXRwdXQ6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHRyYWNlKGNhdGVnb3J5OiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0Q2VsbCBleHRlbmRzIE5vdGVib29rQ2VsbFRleHRNb2RlbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyB2aWV3VHlwZTogc3RyaW5nLFxuXHRcdGhhbmRsZTogbnVtYmVyLFxuXHRcdHB1YmxpYyBzb3VyY2U6IHN0cmluZyxcblx0XHRsYW5ndWFnZTogc3RyaW5nLFxuXHRcdGNlbGxLaW5kOiBDZWxsS2luZCxcblx0XHRvdXRwdXRzOiBJT3V0cHV0RHRvW10sXG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdENlbGxVcmkuZ2VuZXJhdGUoVVJJLnBhcnNlKCd0ZXN0Oi8vL2Zha2Uvbm90ZWJvb2snKSwgaGFuZGxlKSxcblx0XHRcdGhhbmRsZSxcblx0XHRcdHtcblx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0bWltZTogTWltZXMudGV4dCxcblx0XHRcdFx0Y2VsbEtpbmQsXG5cdFx0XHRcdG91dHB1dHMsXG5cdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29sbGFwc2VTdGF0ZTogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0eyB0cmFuc2llbnRDZWxsTWV0YWRhdGE6IHt9LCB0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50T3V0cHV0czogZmFsc2UsIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRsYW5ndWFnZVNlcnZpY2UsXG5cdFx0XHREZWZhdWx0RW5kT2ZMaW5lLkxGLFxuXHRcdFx0dW5kZWZpbmVkLCAvLyBkZWZhdWx0Q29sbGFwc2VDb25maWdcblx0XHRcdHVuZGVmaW5lZCwgIC8vIGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZVxuXHRcdFx0bmV3IE51bGxOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlKClcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0VkaXRvclRlc3RNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yTW9kZWwge1xuXHRwcml2YXRlIF9kaXJ0eSA9IGZhbHNlO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtpbmdDb3B5U2F2ZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTYXZlID0gdGhpcy5fb25EaWRTYXZlLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VEaXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURpcnR5ID0gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5ldmVudDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZU9ycGhhbmVkID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkUmV2ZXJ0VW50aXRsZWQgPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXG5cblx0Z2V0IHZpZXdUeXBlKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9vay52aWV3VHlwZTtcblx0fVxuXG5cdGdldCByZXNvdXJjZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2sudXJpO1xuXHR9XG5cblx0Z2V0IG5vdGVib29rKCk6IE5vdGVib29rVGV4dE1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2s7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9ub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChfbm90ZWJvb2sgJiYgX25vdGVib29rLm9uRGlkQ2hhbmdlQ29udGVudCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoX25vdGVib29rLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0aXNSZWFkb25seSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpc09ycGhhbmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGhhc0Fzc29jaWF0ZWRGaWxlUGF0aCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpc0RpcnR5KCkge1xuXHRcdHJldHVybiB0aGlzLl9kaXJ0eTtcblx0fVxuXG5cdGdldCBoYXNFcnJvclN0YXRlKCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlzTW9kaWZpZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RpcnR5O1xuXHR9XG5cblx0Z2V0Tm90ZWJvb2soKTogTm90ZWJvb2tUZXh0TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9vaztcblx0fVxuXG5cdGFzeW5jIGxvYWQoKTogUHJvbWlzZTxJUmVzb2x2ZWROb3RlYm9va0VkaXRvck1vZGVsPiB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRhc3luYyBzYXZlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9ub3RlYm9vaykge1xuXHRcdFx0dGhpcy5fZGlydHkgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRTYXZlLmZpcmUoe30pO1xuXHRcdFx0Ly8gdG9kbywgZmx1c2ggYWxsIHN0YXRlc1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0c2F2ZUFzKCk6IFByb21pc2U8RWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHR0aHJvdyBuZXcgTm90SW1wbGVtZW50ZWRFcnJvcigpO1xuXHR9XG5cblx0cmV2ZXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0Y29uc3QgdGVzdFRoZW1lU2VydmljZSA9IG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVbmRvUmVkb1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVuZG9SZWRvU2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGhlbWVTZXJ2aWNlLCB0ZXN0VGhlbWVTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTW9kZWxTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXh0TW9kZWxTZXJ2aWNlLCA8SVRleHRNb2RlbFNlcnZpY2U+ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbFJlc29sdmVyU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0S2V5U2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlzdFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaXN0U2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGF5b3V0U2VydmljZSwgbmV3IFRlc3RMYXlvdXRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsaXBib2FyZFNlcnZpY2UsIFRlc3RDbGlwYm9hcmRTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSh0cnVlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgbmV3IFRlc3ROb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJS2V5YmluZGluZ1NlcnZpY2UsIG5ldyBNb2NrS2V5YmluZGluZ1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvZGVFZGl0b3JTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDb2RlRWRpdG9yU2VydmljZSh0ZXN0VGhlbWVTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElPdXRsaW5lU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJT3V0bGluZVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWdpc3Rlck91dGxpbmVDcmVhdG9yKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH0gfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlRmFjdG9yeSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5KSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UsIG5ldyBOdWxsTm90ZWJvb2tMb2dnaW5nU2VydmljZSgpKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UsIG5ldyBjbGFzcyBNb2NrTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIGltcGxlbWVudHMgSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdGlzRW5hYmxlZEZvckxhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhc3luYyBkZXRlY3RMYW5ndWFnZShyZXNvdXJjZTogVVJJLCBzdXBwb3J0ZWRMYW5ncz86IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIF9jcmVhdGVUZXN0Tm90ZWJvb2tFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgY2VsbHM6IE1vY2tOb3RlYm9va0NlbGxbXSk6IHsgZWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZTsgdmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCB9IHtcblxuXHRjb25zdCB2aWV3VHlwZSA9ICdub3RlYm9vayc7XG5cdGNvbnN0IG5vdGVib29rID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rVGV4dE1vZGVsLCB2aWV3VHlwZSwgVVJJLnBhcnNlKCd0ZXN0Oi8vdGVzdCcpLCBjZWxscy5tYXAoKGNlbGwpOiBJQ2VsbER0bzIgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzb3VyY2U6IGNlbGxbMF0sXG5cdFx0XHRtaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRsYW5ndWFnZTogY2VsbFsxXSxcblx0XHRcdGNlbGxLaW5kOiBjZWxsWzJdLFxuXHRcdFx0b3V0cHV0czogY2VsbFszXSA/PyBbXSxcblx0XHRcdG1ldGFkYXRhOiBjZWxsWzRdXG5cdFx0fTtcblx0fSksIHt9LCB7IHRyYW5zaWVudENlbGxNZXRhZGF0YToge30sIHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IHt9LCBjZWxsQ29udGVudE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50T3V0cHV0czogZmFsc2UgfSkpO1xuXG5cdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0VkaXRvclRlc3RNb2RlbChub3RlYm9vaykpO1xuXHRjb25zdCBub3RlYm9va09wdGlvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rT3B0aW9ucyhtYWluV2luZG93LCBmYWxzZSwgdW5kZWZpbmVkLCBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29kZUVkaXRvclNlcnZpY2UpKSk7XG5cdGNvbnN0IGJhc2VDZWxsRWRpdG9yT3B0aW9ucyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUJhc2VDZWxsRWRpdG9yT3B0aW9ucz4oKSB7IH07XG5cdGNvbnN0IHZpZXdDb250ZXh0ID0gbmV3IFZpZXdDb250ZXh0KG5vdGVib29rT3B0aW9ucywgZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0V2ZW50RGlzcGF0Y2hlcigpKSwgKCkgPT4gYmFzZUNlbGxFZGl0b3JPcHRpb25zKTtcblx0Y29uc3Qgdmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va1ZpZXdNb2RlbCwgdmlld1R5cGUsIG1vZGVsLm5vdGVib29rLCB2aWV3Q29udGV4dCwgbnVsbCwgeyBpc1JlYWRPbmx5OiBmYWxzZSB9KSk7XG5cblx0Y29uc3QgY2VsbExpc3QgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMsIHZpZXdDb250ZXh0KSk7XG5cdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRjb25zdCBsaXN0Vmlld0luZm9BY2Nlc3NvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGlzdFZpZXdJbmZvQWNjZXNzb3IoY2VsbExpc3QpKTtcblxuXHRsZXQgdmlzaWJsZVJhbmdlczogSUNlbGxSYW5nZVtdID0gW3sgc3RhcnQ6IDAsIGVuZDogMTAwIH1dO1xuXG5cdGNvbnN0IGlkID0gRGF0ZS5ub3coKS50b1N0cmluZygpO1xuXHRjb25zdCBub3RlYm9va0VkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlPigpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1tdXN0LXVzZS1zdXBlci1kaXNwb3NlXG5cdFx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRcdHZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIG5vdGVib29rT3B0aW9ucyA9IG5vdGVib29rT3B0aW9ucztcblx0XHRvdmVycmlkZSBvbkRpZENoYW5nZU1vZGVsOiBFdmVudDxOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZD4gPSBuZXcgRW1pdHRlcjxOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZD4oKS5ldmVudDtcblx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUNlbGxTdGF0ZTogRXZlbnQ8Tm90ZWJvb2tDZWxsU3RhdGVDaGFuZ2VkRXZlbnQ+ID0gbmV3IEVtaXR0ZXI8Tm90ZWJvb2tDZWxsU3RhdGVDaGFuZ2VkRXZlbnQ+KCkuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgZ2V0Vmlld01vZGVsKCk6IE5vdGVib29rVmlld01vZGVsIHtcblx0XHRcdHJldHVybiB2aWV3TW9kZWw7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIHRleHRNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXHRcdG92ZXJyaWRlIGhhc01vZGVsKCk6IHRoaXMgaXMgSUFjdGl2ZU5vdGVib29rRWRpdG9yRGVsZWdhdGUge1xuXHRcdFx0cmV0dXJuICEhdmlld01vZGVsO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRMZW5ndGgoKSB7IHJldHVybiB2aWV3TW9kZWwubGVuZ3RoOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0Rm9jdXMoKSB7IHJldHVybiB2aWV3TW9kZWwuZ2V0Rm9jdXMoKTsgfVxuXHRcdG92ZXJyaWRlIGdldFNlbGVjdGlvbnMoKSB7IHJldHVybiB2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpOyB9XG5cdFx0b3ZlcnJpZGUgc2V0Rm9jdXMoZm9jdXM6IElDZWxsUmFuZ2UpIHtcblx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoe1xuXHRcdFx0XHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsXG5cdFx0XHRcdGZvY3VzOiBmb2N1cyxcblx0XHRcdFx0c2VsZWN0aW9uczogdmlld01vZGVsLmdldFNlbGVjdGlvbnMoKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIHNldFNlbGVjdGlvbnMoc2VsZWN0aW9uczogSUNlbGxSYW5nZVtdKSB7XG5cdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHtcblx0XHRcdFx0a2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LFxuXHRcdFx0XHRmb2N1czogdmlld01vZGVsLmdldEZvY3VzKCksXG5cdFx0XHRcdHNlbGVjdGlvbnM6IHNlbGVjdGlvbnNcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRWaWV3SW5kZXhCeU1vZGVsSW5kZXgoaW5kZXg6IG51bWJlcikgeyByZXR1cm4gbGlzdFZpZXdJbmZvQWNjZXNzb3IuZ2V0Vmlld0luZGV4KHZpZXdNb2RlbC52aWV3Q2VsbHNbaW5kZXhdKTsgfVxuXHRcdG92ZXJyaWRlIGdldENlbGxSYW5nZUZyb21WaWV3UmFuZ2Uoc3RhcnRJbmRleDogbnVtYmVyLCBlbmRJbmRleDogbnVtYmVyKSB7IHJldHVybiBsaXN0Vmlld0luZm9BY2Nlc3Nvci5nZXRDZWxsUmFuZ2VGcm9tVmlld1JhbmdlKHN0YXJ0SW5kZXgsIGVuZEluZGV4KTsgfVxuXHRcdG92ZXJyaWRlIHJldmVhbENlbGxSYW5nZUluVmlldygpIHsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJldmVhbEluVmlldygpIHsgfVxuXHRcdG92ZXJyaWRlIHNldEhpZGRlbkFyZWFzKF9yYW5nZXM6IElDZWxsUmFuZ2VbXSk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIGNlbGxMaXN0LnNldEhpZGRlbkFyZWFzKF9yYW5nZXMsIHRydWUpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRBY3RpdmVDZWxsKCkge1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBjZWxsTGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblxuXHRcdFx0aWYgKGVsZW1lbnRzICYmIGVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudHNbMF07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGhhc091dHB1dFRleHRTZWxlY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGNoYW5nZU1vZGVsRGVjb3JhdGlvbnMoKSB7IHJldHVybiBudWxsOyB9XG5cdFx0b3ZlcnJpZGUgZm9jdXNFbGVtZW50KCkgeyB9XG5cdFx0b3ZlcnJpZGUgc2V0Q2VsbEVkaXRvclNlbGVjdGlvbigpIHsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydEFzeW5jKCkgeyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgbGF5b3V0Tm90ZWJvb2tDZWxsKCkgeyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlT3V0cHV0KCkgeyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVtb3ZlSW5zZXQoKSB7IH1cblx0XHRvdmVycmlkZSBhc3luYyBmb2N1c05vdGVib29rQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCwgZm9jdXNJdGVtOiAnZWRpdG9yJyB8ICdjb250YWluZXInIHwgJ291dHB1dCcpIHtcblx0XHRcdGNlbGwuZm9jdXNNb2RlID0gZm9jdXNJdGVtID09PSAnZWRpdG9yJyA/IENlbGxGb2N1c01vZGUuRWRpdG9yXG5cdFx0XHRcdDogZm9jdXNJdGVtID09PSAnb3V0cHV0JyA/IENlbGxGb2N1c01vZGUuT3V0cHV0XG5cdFx0XHRcdFx0OiBDZWxsRm9jdXNNb2RlLkNvbnRhaW5lcjtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgY2VsbEF0KGluZGV4OiBudW1iZXIpIHsgcmV0dXJuIHZpZXdNb2RlbC5jZWxsQXQoaW5kZXgpITsgfVxuXHRcdG92ZXJyaWRlIGdldENlbGxJbmRleChjZWxsOiBJQ2VsbFZpZXdNb2RlbCkgeyByZXR1cm4gdmlld01vZGVsLmdldENlbGxJbmRleChjZWxsKTsgfVxuXHRcdG92ZXJyaWRlIGdldENlbGxzSW5SYW5nZShyYW5nZT86IElDZWxsUmFuZ2UpIHsgcmV0dXJuIHZpZXdNb2RlbC5nZXRDZWxsc0luUmFuZ2UocmFuZ2UpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0Q2VsbEJ5SGFuZGxlKGhhbmRsZTogbnVtYmVyKSB7IHJldHVybiB2aWV3TW9kZWwuZ2V0Q2VsbEJ5SGFuZGxlKGhhbmRsZSk7IH1cblx0XHRvdmVycmlkZSBnZXROZXh0VmlzaWJsZUNlbGxJbmRleChpbmRleDogbnVtYmVyKSB7IHJldHVybiB2aWV3TW9kZWwuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoaW5kZXgpOyB9XG5cdFx0Z2V0Q29udHJvbCgpIHsgcmV0dXJuIHRoaXM7IH1cblx0XHRvdmVycmlkZSBnZXQgb25EaWRDaGFuZ2VTZWxlY3Rpb24oKSB7IHJldHVybiB2aWV3TW9kZWwub25EaWRDaGFuZ2VTZWxlY3Rpb24gYXMgRXZlbnQ8YW55PjsgfVxuXHRcdG92ZXJyaWRlIGdldCBvbkRpZENoYW5nZU9wdGlvbnMoKSB7IHJldHVybiB2aWV3TW9kZWwub25EaWRDaGFuZ2VPcHRpb25zOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IG9uRGlkQ2hhbmdlVmlld0NlbGxzKCkgeyByZXR1cm4gdmlld01vZGVsLm9uRGlkQ2hhbmdlVmlld0NlbGxzOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZmluZChxdWVyeTogc3RyaW5nLCBvcHRpb25zOiBJTm90ZWJvb2tGaW5kT3B0aW9ucyk6IFByb21pc2U8Q2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdPiB7XG5cdFx0XHRjb25zdCBmaW5kTWF0Y2hlcyA9IHZpZXdNb2RlbC5maW5kKHF1ZXJ5LCBvcHRpb25zKS5maWx0ZXIobWF0Y2ggPT4gbWF0Y2gubGVuZ3RoID4gMCk7XG5cdFx0XHRyZXR1cm4gZmluZE1hdGNoZXM7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGRlbHRhQ2VsbERlY29yYXRpb25zKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBvbkRpZENoYW5nZVZpc2libGVSYW5nZXMgPSBFdmVudC5Ob25lO1xuXG5cdFx0b3ZlcnJpZGUgZ2V0IHZpc2libGVSYW5nZXMoKSB7XG5cdFx0XHRyZXR1cm4gdmlzaWJsZVJhbmdlcztcblx0XHR9XG5cblx0XHRvdmVycmlkZSBzZXQgdmlzaWJsZVJhbmdlcyhfcmFuZ2VzOiBJQ2VsbFJhbmdlW10pIHtcblx0XHRcdHZpc2libGVSYW5nZXMgPSBfcmFuZ2VzO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldElkKCk6IHN0cmluZyB7IHJldHVybiBpZDsgfVxuXHRcdG92ZXJyaWRlIHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0Y2VsbExpc3Quc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0XHRyZXR1cm4gY2VsbExpc3Quc2Nyb2xsVG9wO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRMYXlvdXRJbmZvKCk6IE5vdGVib29rTGF5b3V0SW5mbyB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiAwLFxuXHRcdFx0XHRzY3JvbGxIZWlnaHQ6IGNlbGxMaXN0LmdldFNjcm9sbEhlaWdodCgpLFxuXHRcdFx0XHRmb250SW5mbzogbmV3IEZvbnRJbmZvKHtcblx0XHRcdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdFx0XHRcdGZvbnRGYW1pbHk6ICdtb2NrRm9udCcsXG5cdFx0XHRcdFx0Zm9udFdlaWdodDogJ25vcm1hbCcsXG5cdFx0XHRcdFx0Zm9udFNpemU6IDE0LFxuXHRcdFx0XHRcdGZvbnRGZWF0dXJlU2V0dGluZ3M6IEVkaXRvckZvbnRMaWdhdHVyZXMuT0ZGLFxuXHRcdFx0XHRcdGZvbnRWYXJpYXRpb25TZXR0aW5nczogRWRpdG9yRm9udFZhcmlhdGlvbnMuT0ZGLFxuXHRcdFx0XHRcdGxpbmVIZWlnaHQ6IDE5LFxuXHRcdFx0XHRcdGxldHRlclNwYWNpbmc6IDEuNSxcblx0XHRcdFx0XHRpc01vbm9zcGFjZTogdHJ1ZSxcblx0XHRcdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0XHRcdHR5cGljYWxGdWxsd2lkdGhDaGFyYWN0ZXJXaWR0aDogMjAsXG5cdFx0XHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiB0cnVlLFxuXHRcdFx0XHRcdHNwYWNlV2lkdGg6IDEwLFxuXHRcdFx0XHRcdG1pZGRvdFdpZHRoOiAxMCxcblx0XHRcdFx0XHR3c21pZGRvdFdpZHRoOiAxMCxcblx0XHRcdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdFx0fSwgdHJ1ZSksXG5cdFx0XHRcdHN0aWNreUhlaWdodDogMCxcblx0XHRcdFx0bGlzdFZpZXdPZmZzZXRUb3A6IDAsXG5cdFx0XHR9O1xuXHRcdH1cblx0fTtcblxuXHRyZXR1cm4geyBlZGl0b3I6IG5vdGVib29rRWRpdG9yLCB2aWV3TW9kZWwgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRlc3ROb3RlYm9va0VkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBjZWxsczogW3NvdXJjZTogc3RyaW5nLCBsYW5nOiBzdHJpbmcsIGtpbmQ6IENlbGxLaW5kLCBvdXRwdXQ/OiBJT3V0cHV0RHRvW10sIG1ldGFkYXRhPzogTm90ZWJvb2tDZWxsTWV0YWRhdGFdW10pOiB7IGVkaXRvcjogSU5vdGVib29rRWRpdG9yRGVsZWdhdGU7IHZpZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwgfSB7XG5cdHJldHVybiBfY3JlYXRlVGVzdE5vdGVib29rRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcywgY2VsbHMpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbDxSID0gYW55PihvcmlnaW5hbENlbGxzOiBbc291cmNlOiBzdHJpbmcsIGxhbmc6IHN0cmluZywga2luZDogQ2VsbEtpbmQsIG91dHB1dD86IElPdXRwdXREdG9bXSwgbWV0YWRhdGE/OiBOb3RlYm9va0NlbGxNZXRhZGF0YV1bXSwgbW9kaWZpZWRDZWxsczogW3NvdXJjZTogc3RyaW5nLCBsYW5nOiBzdHJpbmcsIGtpbmQ6IENlbGxLaW5kLCBvdXRwdXQ/OiBJT3V0cHV0RHRvW10sIG1ldGFkYXRhPzogTm90ZWJvb2tDZWxsTWV0YWRhdGFdW10sIGNhbGxiYWNrOiAoZGlmZk1vZGVsOiBJTm90ZWJvb2tEaWZmRWRpdG9yTW9kZWwsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIGFjY2Vzc29yOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UpID0+IFByb21pc2U8Uj4gfCBSKTogUHJvbWlzZTxSPiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRjb25zdCBvcmlnaW5hbE5vdGVib29rID0gY3JlYXRlVGVzdE5vdGVib29rRWRpdG9yKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcywgb3JpZ2luYWxDZWxscyk7XG5cdGNvbnN0IG1vZGlmaWVkTm90ZWJvb2sgPSBjcmVhdGVUZXN0Tm90ZWJvb2tFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzLCBtb2RpZmllZENlbGxzKTtcblx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbD4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0IG5vdGVib29rKCkge1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsTm90ZWJvb2sudmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldCByZXNvdXJjZSgpIHtcblx0XHRcdHJldHVybiBvcmlnaW5hbE5vdGVib29rLnZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50LnVyaTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgbW9kaWZpZWRSZXNvdXJjZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbD4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0IG5vdGVib29rKCkge1xuXHRcdFx0cmV0dXJuIG1vZGlmaWVkTm90ZWJvb2sudmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldCByZXNvdXJjZSgpIHtcblx0XHRcdHJldHVybiBtb2RpZmllZE5vdGVib29rLnZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50LnVyaTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgbW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0RpZmZFZGl0b3JNb2RlbD4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0IG9yaWdpbmFsKCkge1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsUmVzb3VyY2U7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldCBtb2RpZmllZCgpIHtcblx0XHRcdHJldHVybiBtb2RpZmllZFJlc291cmNlO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCByZXMgPSBhd2FpdCBjYWxsYmFjayhtb2RlbCwgZGlzcG9zYWJsZXMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0aWYgKHJlcyBpbnN0YW5jZW9mIFByb21pc2UpIHtcblx0XHRyZXMuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRvcmlnaW5hbE5vdGVib29rLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0XHRvcmlnaW5hbE5vdGVib29rLnZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50LmRpc3Bvc2UoKTtcblx0XHRcdG9yaWdpbmFsTm90ZWJvb2sudmlld01vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdG1vZGlmaWVkTm90ZWJvb2suZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRcdG1vZGlmaWVkTm90ZWJvb2sudmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQuZGlzcG9zZSgpO1xuXHRcdFx0bW9kaWZpZWROb3RlYm9vay52aWV3TW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdG9yaWdpbmFsTm90ZWJvb2suZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRvcmlnaW5hbE5vdGVib29rLnZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50LmRpc3Bvc2UoKTtcblx0XHRvcmlnaW5hbE5vdGVib29rLnZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdFx0bW9kaWZpZWROb3RlYm9vay5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdG1vZGlmaWVkTm90ZWJvb2sudmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQuZGlzcG9zZSgpO1xuXHRcdG1vZGlmaWVkTm90ZWJvb2sudmlld01vZGVsLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblx0cmV0dXJuIHJlcztcbn1cblxuaW50ZXJmYWNlIElBY3RpdmVUZXN0Tm90ZWJvb2tFZGl0b3JEZWxlZ2F0ZSBleHRlbmRzIElBY3RpdmVOb3RlYm9va0VkaXRvckRlbGVnYXRlIHtcblx0dmlzaWJsZVJhbmdlczogSUNlbGxSYW5nZVtdO1xufVxuXG5leHBvcnQgdHlwZSBNb2NrTm90ZWJvb2tDZWxsID0gW1xuXHRzb3VyY2U6IHN0cmluZyxcblx0bGFuZzogc3RyaW5nLFxuXHRraW5kOiBDZWxsS2luZCxcblx0b3V0cHV0PzogSU91dHB1dER0b1tdLFxuXHRtZXRhZGF0YT86IE5vdGVib29rQ2VsbE1ldGFkYXRhLFxuXTtcblxuZXhwb3J0IHR5cGUgTW9ja0RvY3VtZW50U3ltYm9sID0ge1xuXHRuYW1lOiBzdHJpbmc7XG5cdHJhbmdlOiB7fTtcblx0a2luZD86IG51bWJlcjtcblx0Y2hpbGRyZW4/OiBNb2NrRG9jdW1lbnRTeW1ib2xbXTtcbn07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3aXRoVGVzdE5vdGVib29rPFIgPSBhbnk+KGNlbGxzOiBNb2NrTm90ZWJvb2tDZWxsW10sIGNhbGxiYWNrOiAoZWRpdG9yOiBJQWN0aXZlVGVzdE5vdGVib29rRWRpdG9yRGVsZWdhdGUsIHZpZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIGFjY2Vzc29yOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UpID0+IFByb21pc2U8Uj4gfCBSLCBhY2Nlc3Nvcj86IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSk6IFByb21pc2U8Uj4ge1xuXHRjb25zdCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yID8/IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRjb25zdCBub3RlYm9va0VkaXRvciA9IF9jcmVhdGVUZXN0Tm90ZWJvb2tFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzLCBjZWxscyk7XG5cblx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IGNhbGxiYWNrKG5vdGVib29rRWRpdG9yLmVkaXRvciwgbm90ZWJvb2tFZGl0b3Iudmlld01vZGVsLCBkaXNwb3NhYmxlcywgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChyZXMgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRyZXMuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLnZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yLmVkaXRvci50ZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bm90ZWJvb2tFZGl0b3IuZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRcdG5vdGVib29rRWRpdG9yLnZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRub3RlYm9va0VkaXRvci5lZGl0b3IudGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCB2aWV3Q29udGV4dD86IFZpZXdDb250ZXh0KSB7XG5cdGNvbnN0IGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxDZWxsVmlld01vZGVsPiA9IHtcblx0XHRnZXRIZWlnaHQoZWxlbWVudDogQ2VsbFZpZXdNb2RlbCkgeyByZXR1cm4gZWxlbWVudC5nZXRIZWlnaHQoMTcpOyB9LFxuXHRcdGdldFRlbXBsYXRlSWQoKSB7IHJldHVybiAndGVtcGxhdGUnOyB9XG5cdH07XG5cblx0Y29uc3QgYmFzZUNlbGxSZW5kZXJUZW1wbGF0ZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8QmFzZUNlbGxSZW5kZXJUZW1wbGF0ZT4oKSB7IH07XG5cdGNvbnN0IHJlbmRlcmVyOiBJTGlzdFJlbmRlcmVyPENlbGxWaWV3TW9kZWwsIEJhc2VDZWxsUmVuZGVyVGVtcGxhdGU+ID0ge1xuXHRcdHRlbXBsYXRlSWQ6ICd0ZW1wbGF0ZScsXG5cdFx0cmVuZGVyVGVtcGxhdGUoKSB7IHJldHVybiBiYXNlQ2VsbFJlbmRlclRlbXBsYXRlOyB9LFxuXHRcdHJlbmRlckVsZW1lbnQoKSB7IH0sXG5cdFx0ZGlzcG9zZVRlbXBsYXRlKCkgeyB9XG5cdH07XG5cblx0Y29uc3Qgbm90ZWJvb2tPcHRpb25zID0gISF2aWV3Q29udGV4dCA/IHZpZXdDb250ZXh0Lm5vdGVib29rT3B0aW9uc1xuXHRcdDogZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va09wdGlvbnMobWFpbldpbmRvdywgZmFsc2UsIHVuZGVmaW5lZCwgaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpLCBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKSkpO1xuXHRjb25zdCBjZWxsTGlzdDogTm90ZWJvb2tDZWxsTGlzdCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHROb3RlYm9va0NlbGxMaXN0LFxuXHRcdCdOb3RlYm9va0NlbGxMaXN0Jyxcblx0XHRET00uJCgnY29udGFpbmVyJyksXG5cdFx0bm90ZWJvb2tPcHRpb25zLFxuXHRcdGRlbGVnYXRlLFxuXHRcdFtyZW5kZXJlcl0sXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0PElDb250ZXh0S2V5U2VydmljZT4oSUNvbnRleHRLZXlTZXJ2aWNlKSxcblx0XHR7XG5cdFx0XHRzdXBwb3J0RHluYW1pY0hlaWdodHM6IHRydWUsXG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0fVxuXHQpKTtcblxuXHRyZXR1cm4gY2VsbExpc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB2YWx1ZUJ5dGVzRnJvbVN0cmluZyh2YWx1ZTogc3RyaW5nKTogVlNCdWZmZXIge1xuXHRyZXR1cm4gVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSk7XG59XG5cbmNsYXNzIFRlc3RDZWxsRXhlY3V0aW9uIGltcGxlbWVudHMgSU5vdGVib29rQ2VsbEV4ZWN1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5vdGVib29rOiBVUkksXG5cdFx0cmVhZG9ubHkgY2VsbEhhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgb25Db21wbGV0ZTogKCkgPT4gdm9pZCxcblx0KSB7IH1cblxuXHRyZWFkb25seSBzdGF0ZTogTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUgPSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5VbmNvbmZpcm1lZDtcblxuXHRyZWFkb25seSBkaWRQYXVzZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRyZWFkb25seSBpc1BhdXNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbmZpcm0oKTogdm9pZCB7XG5cdH1cblxuXHR1cGRhdGUodXBkYXRlczogSUNlbGxFeGVjdXRlVXBkYXRlW10pOiB2b2lkIHtcblx0fVxuXG5cdGNvbXBsZXRlKGNvbXBsZXRlOiBJQ2VsbEV4ZWN1dGlvbkNvbXBsZXRlKTogdm9pZCB7XG5cdFx0dGhpcy5vbkNvbXBsZXRlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3ROb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBpbXBsZW1lbnRzIElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9leGVjdXRpb25zID0gbmV3IFJlc291cmNlTWFwPElOb3RlYm9va0NlbGxFeGVjdXRpb24+KCk7XG5cblx0b25EaWRDaGFuZ2VFeGVjdXRpb24gPSBuZXcgRW1pdHRlcjxJQ2VsbEV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50IHwgSUV4ZWN1dGlvblN0YXRlQ2hhbmdlZEV2ZW50PigpLmV2ZW50O1xuXHRvbkRpZENoYW5nZUxhc3RSdW5GYWlsU3RhdGUgPSBuZXcgRW1pdHRlcjxJTm90ZWJvb2tGYWlsU3RhdGVDaGFuZ2VkRXZlbnQ+KCkuZXZlbnQ7XG5cblx0Zm9yY2VDYW5jZWxOb3RlYm9va0V4ZWN1dGlvbnMobm90ZWJvb2tVcmk6IFVSSSk6IHZvaWQge1xuXHR9XG5cblx0Z2V0Q2VsbEV4ZWN1dGlvbnNGb3JOb3RlYm9vayhub3RlYm9vazogVVJJKTogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbltdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRnZXRDZWxsRXhlY3V0aW9uKGNlbGxVcmk6IFVSSSk6IElOb3RlYm9va0NlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9leGVjdXRpb25zLmdldChjZWxsVXJpKTtcblx0fVxuXG5cdGNyZWF0ZUNlbGxFeGVjdXRpb24obm90ZWJvb2s6IFVSSSwgY2VsbEhhbmRsZTogbnVtYmVyKTogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbiB7XG5cdFx0Y29uc3Qgb25Db21wbGV0ZSA9ICgpID0+IHRoaXMuX2V4ZWN1dGlvbnMuZGVsZXRlKENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2ssIGNlbGxIYW5kbGUpKTtcblx0XHRjb25zdCBleGUgPSBuZXcgVGVzdENlbGxFeGVjdXRpb24obm90ZWJvb2ssIGNlbGxIYW5kbGUsIG9uQ29tcGxldGUpO1xuXHRcdHRoaXMuX2V4ZWN1dGlvbnMuc2V0KENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2ssIGNlbGxIYW5kbGUpLCBleGUpO1xuXHRcdHJldHVybiBleGU7XG5cdH1cblxuXHRnZXRDZWxsRXhlY3V0aW9uc0J5SGFuZGxlRm9yTm90ZWJvb2sobm90ZWJvb2s6IFVSSSk6IE1hcDxudW1iZXIsIElOb3RlYm9va0NlbGxFeGVjdXRpb24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRnZXRMYXN0RmFpbGVkQ2VsbEZvck5vdGVib29rKG5vdGVib29rOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybjtcblx0fVxuXHRnZXRMYXN0Q29tcGxldGVkQ2VsbEZvck5vdGVib29rKG5vdGVib29rOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybjtcblx0fVxuXHRnZXRFeGVjdXRpb24obm90ZWJvb2s6IFVSSSk6IElOb3RlYm9va0V4ZWN1dGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNyZWF0ZUV4ZWN1dGlvbihub3RlYm9vazogVVJJKTogSU5vdGVib29rRXhlY3V0aW9uIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQu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
