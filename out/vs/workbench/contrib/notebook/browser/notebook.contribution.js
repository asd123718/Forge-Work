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
import { Schemas } from "../../../../base/common/network.js";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { toFormattedString } from "../../../../base/common/jsonFormatter.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as nls from "../../../../nls.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { NotebookEditor } from "./notebookEditor.js";
import { NotebookEditorInput } from "../common/notebookEditorInput.js";
import { INotebookService } from "../common/notebookService.js";
import { NotebookService } from "./services/notebookServiceImpl.js";
import { CellKind, CellUri, NotebookWorkingCopyTypeIdentifier, NotebookSetting, NotebookCellsChangeType, NotebookMetadataUri } from "../common/notebookCommon.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { INotebookEditorModelResolverService } from "../common/notebookEditorModelResolverService.js";
import { NotebookDiffEditorInput } from "../common/notebookDiffEditorInput.js";
import { NotebookTextDiffEditor } from "./diff/notebookDiffEditor.js";
import { INotebookEditorWorkerService } from "../common/services/notebookWorkerService.js";
import { NotebookEditorWorkerServiceImpl } from "./services/notebookWorkerServiceImpl.js";
import { INotebookCellStatusBarService } from "../common/notebookCellStatusBarService.js";
import { NotebookCellStatusBarService } from "./services/notebookCellStatusBarServiceImpl.js";
import { INotebookEditorService } from "./services/notebookEditorService.js";
import { NotebookEditorWidgetService } from "./services/notebookEditorServiceImpl.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Event } from "../../../../base/common/event.js";
import { getFormattedOutputJSON, getStreamOutputData } from "./diff/diffElementViewModel.js";
import { NotebookModelResolverServiceImpl } from "../common/notebookEditorModelResolverServiceImpl.js";
import { INotebookKernelHistoryService, INotebookKernelService } from "../common/notebookKernelService.js";
import { NotebookKernelService } from "./services/notebookKernelServiceImpl.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { NotebookRendererMessagingService } from "./services/notebookRendererMessagingServiceImpl.js";
import { INotebookRendererMessagingService } from "../common/notebookRendererMessagingService.js";
import { INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory } from "./viewModel/notebookOutlineDataSourceFactory.js";
import "./controller/coreActions.js";
import "./controller/insertCellActions.js";
import "./controller/executeActions.js";
import "./controller/sectionActions.js";
import "./controller/layoutActions.js";
import "./controller/editActions.js";
import "./controller/cellOutputActions.js";
import "./controller/apiActions.js";
import "./controller/foldingController.js";
import "./controller/chat/notebook.chat.contribution.js";
import "./controller/variablesActions.js";
import "./contrib/editorHint/emptyCellEditorHint.js";
import "./contrib/clipboard/notebookClipboard.js";
import "./contrib/find/notebookFind.js";
import "./contrib/format/formatting.js";
import "./contrib/saveParticipants/saveParticipants.js";
import "./contrib/gettingStarted/notebookGettingStarted.js";
import "./contrib/layout/layoutActions.js";
import "./contrib/marker/markerProvider.js";
import "./contrib/navigation/arrow.js";
import "./contrib/outline/notebookOutline.js";
import "./contrib/profile/notebookProfile.js";
import "./contrib/cellStatusBar/statusBarProviders.js";
import "./contrib/cellStatusBar/contributedStatusBarItemController.js";
import "./contrib/cellStatusBar/executionStatusBarItemController.js";
import "./contrib/editorStatusBar/editorStatusBar.js";
import "./contrib/undoRedo/notebookUndoRedo.js";
import "./contrib/cellCommands/cellCommands.js";
import "./contrib/viewportWarmup/viewportWarmup.js";
import "./contrib/troubleshoot/layout.js";
import "./contrib/debug/notebookBreakpoints.js";
import "./contrib/debug/notebookCellPausing.js";
import "./contrib/debug/notebookDebugDecorations.js";
import "./contrib/execute/executionEditorProgress.js";
import "./contrib/kernelDetection/notebookKernelDetection.js";
import "./contrib/cellDiagnostics/cellDiagnostics.js";
import "./contrib/multicursor/notebookMulticursor.js";
import "./contrib/multicursor/notebookSelectionHighlight.js";
import "./contrib/notebookVariables/notebookInlineVariables.js";
import "./diff/notebookDiffActions.js";
import { editorOptionsRegistry } from "../../../../editor/common/config/editorOptions.js";
import { NotebookExecutionStateService } from "./services/notebookExecutionStateServiceImpl.js";
import { NotebookExecutionService } from "./services/notebookExecutionServiceImpl.js";
import { INotebookExecutionService } from "../common/notebookExecutionService.js";
import { INotebookKeymapService } from "../common/notebookKeymapService.js";
import { NotebookKeymapService } from "./services/notebookKeymapServiceImpl.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { INotebookExecutionStateService } from "../common/notebookExecutionStateService.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { COMMENTEDITOR_DECORATION_KEY } from "../../comments/browser/commentReply.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { NotebookKernelHistoryService } from "./services/notebookKernelHistoryServiceImpl.js";
import { INotebookLoggingService } from "../common/notebookLoggingService.js";
import { NotebookLoggingService } from "./services/notebookLoggingServiceImpl.js";
import product from "../../../../platform/product/common/product.js";
import { NotebookVariables } from "./contrib/notebookVariables/notebookVariables.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { NotebookAccessibilityHelp } from "./notebookAccessibilityHelp.js";
import { NotebookAccessibleView } from "./notebookAccessibleView.js";
import { DefaultFormatter } from "../../format/browser/formatActionsMultiple.js";
import { NotebookMultiTextDiffEditor } from "./diff/notebookMultiDiffEditor.js";
import { NotebookMultiDiffEditorInput } from "./diff/notebookMultiDiffEditorInput.js";
import { getFormattedMetadataJSON } from "../common/model/notebookCellTextModel.js";
import { INotebookOutlineEntryFactory, NotebookOutlineEntryFactory } from "./viewModel/notebookOutlineEntryFactory.js";
import { getFormattedNotebookMetadataJSON } from "../common/model/notebookMetadataTextModel.js";
import { NotebookOutputEditor } from "./outputEditor/notebookOutputEditor.js";
import { NotebookOutputEditorInput } from "./outputEditor/notebookOutputEditorInput.js";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookEditor,
    NotebookEditor.ID,
    "Notebook Editor"
  ),
  [
    new SyncDescriptor(NotebookEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookTextDiffEditor,
    NotebookTextDiffEditor.ID,
    "Notebook Diff Editor"
  ),
  [
    new SyncDescriptor(NotebookDiffEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookOutputEditor,
    NotebookOutputEditor.ID,
    "Notebook Output Editor"
  ),
  [
    new SyncDescriptor(NotebookOutputEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    NotebookMultiTextDiffEditor,
    NotebookMultiTextDiffEditor.ID,
    "Notebook Diff Editor"
  ),
  [
    new SyncDescriptor(NotebookMultiDiffEditorInput)
  ]
);
let NotebookDiffEditorSerializer = class {
  constructor(_configurationService) {
    this._configurationService = _configurationService;
  }
  canSerialize() {
    return true;
  }
  serialize(input) {
    assertType(input instanceof NotebookDiffEditorInput);
    return JSON.stringify({
      resource: input.resource,
      originalResource: input.original.resource,
      name: input.getName(),
      originalName: input.original.getName(),
      textDiffName: input.getName(),
      viewType: input.viewType
    });
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, originalResource, name, viewType } = data;
    if (!data || !URI.isUri(resource) || !URI.isUri(originalResource) || typeof name !== "string" || typeof viewType !== "string") {
      return void 0;
    }
    if (this._configurationService.getValue("notebook.experimental.enableNewDiffEditor")) {
      return NotebookMultiDiffEditorInput.create(instantiationService, resource, name, void 0, originalResource, viewType);
    } else {
      return NotebookDiffEditorInput.create(instantiationService, resource, name, void 0, originalResource, viewType);
    }
  }
  static canResolveBackup(editorInput, backupResource) {
    return false;
  }
};
NotebookDiffEditorSerializer = __decorateClass([
  __decorateParam(0, IConfigurationService)
], NotebookDiffEditorSerializer);
class NotebookEditorSerializer {
  canSerialize(input) {
    return input.typeId === NotebookEditorInput.ID;
  }
  serialize(input) {
    assertType(input instanceof NotebookEditorInput);
    const data = {
      resource: input.resource,
      preferredResource: input.preferredResource,
      viewType: input.viewType,
      options: input.options
    };
    return JSON.stringify(data);
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const { resource, preferredResource, viewType, options } = data;
    if (!data || !URI.isUri(resource) || typeof viewType !== "string") {
      return void 0;
    }
    const input = NotebookEditorInput.getOrCreate(instantiationService, resource, preferredResource, viewType, options);
    return input;
  }
}
class NotebookOutputEditorSerializer {
  canSerialize(input) {
    return input.typeId === NotebookOutputEditorInput.ID;
  }
  serialize(input) {
    assertType(input instanceof NotebookOutputEditorInput);
    const data = input.getSerializedData();
    if (!data) {
      return void 0;
    }
    return JSON.stringify(data);
  }
  deserialize(instantiationService, raw) {
    const data = parse(raw);
    if (!data) {
      return void 0;
    }
    const input = instantiationService.createInstance(NotebookOutputEditorInput, data.notebookUri, data.cellIndex, void 0, data.outputIndex);
    return input;
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  NotebookEditorInput.ID,
  NotebookEditorSerializer
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  NotebookDiffEditorInput.ID,
  NotebookDiffEditorSerializer
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(
  NotebookOutputEditorInput.ID,
  NotebookOutputEditorSerializer
);
let NotebookContribution = class extends Disposable {
  constructor(undoRedoService, configurationService, codeEditorService) {
    super();
    this.codeEditorService = codeEditorService;
    this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.undoRedoPerCell)) {
        this.updateCellUndoRedoComparisonKey(configurationService, undoRedoService);
      }
    }));
    this._register(this.codeEditorService.registerDecorationType("comment-controller", COMMENTEDITOR_DECORATION_KEY, {}));
  }
  // Add or remove the cell undo redo comparison key based on the user setting
  updateCellUndoRedoComparisonKey(configurationService, undoRedoService) {
    const undoRedoPerCell = configurationService.getValue(NotebookSetting.undoRedoPerCell);
    if (!undoRedoPerCell) {
      if (!this._uriComparisonKeyComputer) {
        this._uriComparisonKeyComputer = undoRedoService.registerUriComparisonKeyComputer(CellUri.scheme, {
          getComparisonKey: (uri) => {
            if (undoRedoPerCell) {
              return uri.toString();
            }
            return NotebookContribution._getCellUndoRedoComparisonKey(uri);
          }
        });
      }
    } else {
      this._uriComparisonKeyComputer?.dispose();
      this._uriComparisonKeyComputer = void 0;
    }
  }
  static _getCellUndoRedoComparisonKey(uri) {
    const data = CellUri.parse(uri);
    if (!data) {
      return uri.toString();
    }
    return data.notebook.toString();
  }
  dispose() {
    super.dispose();
    this._uriComparisonKeyComputer?.dispose();
  }
};
NotebookContribution.ID = "workbench.contrib.notebook";
NotebookContribution = __decorateClass([
  __decorateParam(0, IUndoRedoService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ICodeEditorService)
], NotebookContribution);
let CellContentProvider = class {
  constructor(textModelService, _modelService, _languageService, _notebookModelResolverService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._registration = textModelService.registerTextModelContentProvider(CellUri.scheme, this);
  }
  dispose() {
    this._registration.dispose();
  }
  async provideTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parse(resource);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    let result = null;
    if (!ref.object.isResolved()) {
      return null;
    }
    for (const cell of ref.object.notebook.cells) {
      if (cell.uri.toString() === resource.toString()) {
        const bufferFactory = {
          create: (defaultEOL) => {
            return { textBuffer: cell.textBuffer, disposable: Disposable.None };
          },
          getFirstLineText: (limit) => {
            return cell.textBuffer.getLineContent(1).substring(0, limit);
          }
        };
        const languageId = this._languageService.getLanguageIdByLanguageName(cell.language);
        const languageSelection = languageId ? this._languageService.createById(languageId) : cell.cellKind === CellKind.Markup ? this._languageService.createById("markdown") : this._languageService.createByFilepathOrFirstLine(resource, cell.textBuffer.getLineContent(1));
        result = this._modelService.createModel(
          bufferFactory,
          languageSelection,
          resource
        );
        break;
      }
    }
    if (!result) {
      ref.dispose();
      return null;
    }
    const once = Event.any(result.onWillDispose, ref.object.notebook.onWillDispose)(() => {
      once.dispose();
      ref.dispose();
    });
    return result;
  }
};
CellContentProvider.ID = "workbench.contrib.cellContentProvider";
CellContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, INotebookEditorModelResolverService)
], CellContentProvider);
let CellInfoContentProvider = class {
  constructor(textModelService, _modelService, _languageService, _labelService, _notebookModelResolverService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._labelService = _labelService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._disposables = [];
    this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellMetadata, {
      provideTextContent: this.provideMetadataTextContent.bind(this)
    }));
    this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellOutput, {
      provideTextContent: this.provideOutputTextContent.bind(this)
    }));
    this._disposables.push(this._labelService.registerFormatter({
      scheme: Schemas.vscodeNotebookCellMetadata,
      formatting: {
        label: "${path} (metadata)",
        separator: "/"
      }
    }));
    this._disposables.push(this._labelService.registerFormatter({
      scheme: Schemas.vscodeNotebookCellOutput,
      formatting: {
        label: "${path} (output)",
        separator: "/"
      }
    }));
  }
  dispose() {
    dispose(this._disposables);
  }
  async provideMetadataTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellMetadata);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    let result = null;
    const mode = this._languageService.createById("json");
    const disposables = new DisposableStore();
    for (const cell of ref.object.notebook.cells) {
      if (cell.handle === data.handle) {
        const cellIndex = ref.object.notebook.cells.indexOf(cell);
        const metadataSource = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language, true);
        result = this._modelService.createModel(
          metadataSource,
          mode,
          resource
        );
        this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent((e) => {
          if (result && e.rawEvents.some((event) => (event.kind === NotebookCellsChangeType.ChangeCellMetadata || event.kind === NotebookCellsChangeType.ChangeCellLanguage) && event.index === cellIndex)) {
            const value = getFormattedMetadataJSON(ref.object.notebook.transientOptions.transientCellMetadata, cell.metadata, cell.language, true);
            if (result.getValue() !== value) {
              result.setValue(value);
            }
          }
        })));
        break;
      }
    }
    if (!result) {
      ref.dispose();
      return null;
    }
    const once = result.onWillDispose(() => {
      disposables.dispose();
      once.dispose();
      ref.dispose();
    });
    return result;
  }
  parseStreamOutput(op) {
    if (!op) {
      return;
    }
    const streamOutputData = getStreamOutputData(op.outputs);
    if (streamOutputData) {
      return {
        content: streamOutputData,
        mode: this._languageService.createById(PLAINTEXT_LANGUAGE_ID)
      };
    }
    return;
  }
  _getResult(data, cell) {
    let result = void 0;
    const mode = this._languageService.createById("json");
    const op = cell.outputs.find((op2) => op2.outputId === data.outputId || op2.alternativeOutputId === data.outputId);
    const streamOutputData = this.parseStreamOutput(op);
    if (streamOutputData) {
      result = streamOutputData;
      return result;
    }
    const obj = cell.outputs.map((output) => ({
      metadata: output.metadata,
      outputItems: output.outputs.map((opit) => ({
        mimeType: opit.mime,
        data: opit.data.toString()
      }))
    }));
    const outputSource = toFormattedString(obj, {});
    result = {
      content: outputSource,
      mode
    };
    return result;
  }
  async provideOutputsTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellOutput);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    const cell = ref.object.notebook.cells.find((cell2) => cell2.handle === data.handle);
    if (!cell) {
      ref.dispose();
      return null;
    }
    const mode = this._languageService.createById("json");
    const model = this._modelService.createModel(getFormattedOutputJSON(cell.outputs || []), mode, resource, true);
    const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
      model.setValue(getFormattedOutputJSON(cell.outputs || []));
    });
    const once = model.onWillDispose(() => {
      once.dispose();
      cellModelListener.dispose();
      ref.dispose();
    });
    return model;
  }
  async provideOutputTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = CellUri.parseCellOutputUri(resource);
    if (!data) {
      return this.provideOutputsTextContent(resource);
    }
    const ref = await this._notebookModelResolverService.resolve(data.notebook);
    const cell = ref.object.notebook.cells.find((cell2) => !!cell2.outputs.find((op) => op.outputId === data.outputId || op.alternativeOutputId === data.outputId));
    if (!cell) {
      ref.dispose();
      return null;
    }
    const result = this._getResult(data, cell);
    if (!result) {
      ref.dispose();
      return null;
    }
    const model = this._modelService.createModel(result.content, result.mode, resource);
    const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
      const newResult = this._getResult(data, cell);
      if (!newResult) {
        return;
      }
      model.setValue(newResult.content);
      model.setLanguage(newResult.mode.languageId);
    });
    const once = model.onWillDispose(() => {
      once.dispose();
      cellModelListener.dispose();
      ref.dispose();
    });
    return model;
  }
};
CellInfoContentProvider.ID = "workbench.contrib.cellInfoContentProvider";
CellInfoContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, INotebookEditorModelResolverService)
], CellInfoContentProvider);
let NotebookMetadataContentProvider = class {
  constructor(textModelService, _modelService, _languageService, _labelService, _notebookModelResolverService) {
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._labelService = _labelService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._disposables = [];
    this._disposables.push(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookMetadata, {
      provideTextContent: this.provideMetadataTextContent.bind(this)
    }));
    this._disposables.push(this._labelService.registerFormatter({
      scheme: Schemas.vscodeNotebookMetadata,
      formatting: {
        label: "${path} (metadata)",
        separator: "/"
      }
    }));
  }
  dispose() {
    dispose(this._disposables);
  }
  async provideMetadataTextContent(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    const data = NotebookMetadataUri.parse(resource);
    if (!data) {
      return null;
    }
    const ref = await this._notebookModelResolverService.resolve(data);
    let result = null;
    const mode = this._languageService.createById("json");
    const disposables = new DisposableStore();
    const metadataSource = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
    result = this._modelService.createModel(
      metadataSource,
      mode,
      resource
    );
    if (!result) {
      ref.dispose();
      return null;
    }
    this._disposables.push(disposables.add(ref.object.notebook.onDidChangeContent((e) => {
      if (result && e.rawEvents.some((event) => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ChangeDocumentMetadata || event.kind === NotebookCellsChangeType.ModelChange)) {
        const value = getFormattedNotebookMetadataJSON(ref.object.notebook.transientOptions.transientDocumentMetadata, ref.object.notebook.metadata);
        if (result.getValue() !== value) {
          result.setValue(value);
        }
      }
    })));
    const once = result.onWillDispose(() => {
      disposables.dispose();
      once.dispose();
      ref.dispose();
    });
    return result;
  }
};
NotebookMetadataContentProvider.ID = "workbench.contrib.notebookMetadataContentProvider";
NotebookMetadataContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, INotebookEditorModelResolverService)
], NotebookMetadataContentProvider);
class RegisterSchemasContribution extends Disposable {
  constructor() {
    super();
    this.registerMetadataSchemas();
  }
  registerMetadataSchemas() {
    const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
    const metadataSchema = {
      properties: {
        ["language"]: {
          type: "string",
          description: "The language for the cell"
        }
      },
      // patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    jsonRegistry.registerSchema("vscode://schemas/notebook/cellmetadata", metadataSchema);
  }
}
RegisterSchemasContribution.ID = "workbench.contrib.registerCellSchemas";
let NotebookEditorManager = class {
  constructor(_editorService, _notebookEditorModelService, editorGroups) {
    this._editorService = _editorService;
    this._notebookEditorModelService = _notebookEditorModelService;
    this._disposables = new DisposableStore();
    this._disposables.add(Event.debounce(
      this._notebookEditorModelService.onDidChangeDirty,
      (last, current) => !last ? [current] : [...last, current],
      100
    )(this._openMissingDirtyNotebookEditors, this));
    this._disposables.add(_notebookEditorModelService.onWillFailWithConflict((e) => {
      for (const group of editorGroups.groups) {
        const conflictInputs = group.editors.filter((input) => input instanceof NotebookEditorInput && input.viewType !== e.viewType && isEqual(input.resource, e.resource));
        const p = group.closeEditors(conflictInputs);
        e.waitUntil(p);
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
  }
  _openMissingDirtyNotebookEditors(models) {
    const result = [];
    for (const model of models) {
      if (model.isDirty() && !this._editorService.isOpened({ resource: model.resource, typeId: NotebookEditorInput.ID, editorId: model.viewType }) && extname(model.resource) !== ".interactive") {
        result.push({
          resource: model.resource,
          options: { inactive: true, preserveFocus: true, pinned: true, override: model.viewType }
        });
      }
    }
    if (result.length > 0) {
      this._editorService.openEditors(result);
    }
  }
};
NotebookEditorManager.ID = "workbench.contrib.notebookEditorManager";
NotebookEditorManager = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, INotebookEditorModelResolverService),
  __decorateParam(2, IEditorGroupsService)
], NotebookEditorManager);
let SimpleNotebookWorkingCopyEditorHandler = class extends Disposable {
  constructor(_instantiationService, _workingCopyEditorService, _extensionService, _notebookService) {
    super();
    this._instantiationService = _instantiationService;
    this._workingCopyEditorService = _workingCopyEditorService;
    this._extensionService = _extensionService;
    this._notebookService = _notebookService;
    this._installHandler();
  }
  async handles(workingCopy) {
    const viewType = this.handlesSync(workingCopy);
    if (!viewType) {
      return false;
    }
    return this._notebookService.canResolve(viewType);
  }
  handlesSync(workingCopy) {
    const viewType = this._getViewType(workingCopy);
    if (!viewType || viewType === "interactive") {
      return void 0;
    }
    return viewType;
  }
  isOpen(workingCopy, editor) {
    if (!this.handlesSync(workingCopy)) {
      return false;
    }
    return editor instanceof NotebookEditorInput && editor.viewType === this._getViewType(workingCopy) && isEqual(workingCopy.resource, editor.resource);
  }
  createEditor(workingCopy) {
    return NotebookEditorInput.getOrCreate(this._instantiationService, workingCopy.resource, void 0, this._getViewType(workingCopy));
  }
  async _installHandler() {
    await this._extensionService.whenInstalledExtensionsRegistered();
    this._register(this._workingCopyEditorService.registerHandler(this));
  }
  _getViewType(workingCopy) {
    const notebookType = NotebookWorkingCopyTypeIdentifier.parse(workingCopy.typeId);
    if (notebookType && notebookType.viewType === notebookType.notebookType) {
      return notebookType?.viewType;
    }
    return void 0;
  }
};
SimpleNotebookWorkingCopyEditorHandler.ID = "workbench.contrib.simpleNotebookWorkingCopyEditorHandler";
SimpleNotebookWorkingCopyEditorHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyEditorService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, INotebookService)
], SimpleNotebookWorkingCopyEditorHandler);
let NotebookLanguageSelectorScoreRefine = class {
  constructor(_notebookService, languageFeaturesService) {
    this._notebookService = _notebookService;
    languageFeaturesService.setNotebookTypeResolver(this._getNotebookInfo.bind(this));
  }
  _getNotebookInfo(uri) {
    const cellUri = CellUri.parse(uri);
    if (!cellUri) {
      return void 0;
    }
    const notebook = this._notebookService.getNotebookTextModel(cellUri.notebook);
    if (!notebook) {
      return void 0;
    }
    return {
      uri: notebook.uri,
      type: notebook.viewType
    };
  }
};
NotebookLanguageSelectorScoreRefine.ID = "workbench.contrib.notebookLanguageSelectorScoreRefine";
NotebookLanguageSelectorScoreRefine = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, ILanguageFeaturesService)
], NotebookLanguageSelectorScoreRefine);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(NotebookContribution.ID, NotebookContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(CellContentProvider.ID, CellContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(CellInfoContentProvider.ID, CellInfoContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(NotebookMetadataContentProvider.ID, NotebookMetadataContentProvider, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterSchemasContribution.ID, RegisterSchemasContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(NotebookEditorManager.ID, NotebookEditorManager, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(NotebookLanguageSelectorScoreRefine.ID, NotebookLanguageSelectorScoreRefine, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SimpleNotebookWorkingCopyEditorHandler.ID, SimpleNotebookWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookVariables, LifecyclePhase.Eventually);
AccessibleViewRegistry.register(new NotebookAccessibleView());
AccessibleViewRegistry.register(new NotebookAccessibilityHelp());
registerSingleton(INotebookService, NotebookService, InstantiationType.Delayed);
registerSingleton(INotebookEditorWorkerService, NotebookEditorWorkerServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookEditorModelResolverService, NotebookModelResolverServiceImpl, InstantiationType.Delayed);
registerSingleton(INotebookCellStatusBarService, NotebookCellStatusBarService, InstantiationType.Delayed);
registerSingleton(INotebookEditorService, NotebookEditorWidgetService, InstantiationType.Delayed);
registerSingleton(INotebookKernelService, NotebookKernelService, InstantiationType.Delayed);
registerSingleton(INotebookKernelHistoryService, NotebookKernelHistoryService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionService, NotebookExecutionService, InstantiationType.Delayed);
registerSingleton(INotebookExecutionStateService, NotebookExecutionStateService, InstantiationType.Delayed);
registerSingleton(INotebookRendererMessagingService, NotebookRendererMessagingService, InstantiationType.Delayed);
registerSingleton(INotebookKeymapService, NotebookKeymapService, InstantiationType.Delayed);
registerSingleton(INotebookLoggingService, NotebookLoggingService, InstantiationType.Delayed);
registerSingleton(INotebookCellOutlineDataSourceFactory, NotebookCellOutlineDataSourceFactory, InstantiationType.Delayed);
registerSingleton(INotebookOutlineEntryFactory, NotebookOutlineEntryFactory, InstantiationType.Delayed);
const schemas = {};
function isConfigurationPropertySchema(x) {
  return typeof x.type !== "undefined" || typeof x.anyOf !== "undefined";
}
for (const editorOption of editorOptionsRegistry) {
  const schema = editorOption.schema;
  if (schema) {
    if (isConfigurationPropertySchema(schema)) {
      schemas[`editor.${editorOption.name}`] = schema;
    } else {
      for (const key in schema) {
        if (Object.hasOwnProperty.call(schema, key)) {
          schemas[key] = schema[key];
        }
      }
    }
  }
}
const editorOptionsCustomizationSchema = {
  description: nls.localize("notebook.editorOptions.experimentalCustomization", "Settings for code editors used in notebooks. This can be used to customize most editor.* settings."),
  default: {},
  allOf: [
    {
      properties: schemas
    }
    // , {
    // 	patternProperties: {
    // 		'^\\[.*\\]$': {
    // 			type: 'object',
    // 			default: {},
    // 			properties: schemas
    // 		}
    // 	}
    // }
  ],
  tags: ["notebookLayout"]
};
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "notebook",
  order: 100,
  title: nls.localize("notebookConfigurationTitle", "Notebook"),
  type: "object",
  properties: {
    [NotebookSetting.displayOrder]: {
      description: nls.localize("notebook.displayOrder.description", "Priority list for output mime types"),
      type: "array",
      items: {
        type: "string"
      },
      default: []
    },
    [NotebookSetting.cellToolbarLocation]: {
      description: nls.localize("notebook.cellToolbarLocation.description", "Where the cell toolbar should be shown, or whether it should be hidden."),
      type: "object",
      additionalProperties: {
        markdownDescription: nls.localize("notebook.cellToolbarLocation.viewType", "Configure the cell toolbar position for specific file types"),
        type: "string",
        enum: ["left", "right", "hidden"]
      },
      default: {
        "default": "right"
      },
      tags: ["notebookLayout"]
    },
    [NotebookSetting.showCellStatusBar]: {
      description: nls.localize("notebook.showCellStatusbar.description", "Whether the cell status bar should be shown."),
      type: "string",
      enum: ["hidden", "visible", "visibleAfterExecute"],
      enumDescriptions: [
        nls.localize("notebook.showCellStatusbar.hidden.description", "The cell status bar is always hidden."),
        nls.localize("notebook.showCellStatusbar.visible.description", "The cell status bar is always visible."),
        nls.localize("notebook.showCellStatusbar.visibleAfterExecute.description", "The cell status bar is hidden until the cell has executed. Then it becomes visible to show the execution status.")
      ],
      default: "visible",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.cellExecutionTimeVerbosity]: {
      description: nls.localize("notebook.cellExecutionTimeVerbosity.description", "Controls the verbosity of the cell execution time in the cell status bar."),
      type: "string",
      enum: ["default", "verbose"],
      enumDescriptions: [
        nls.localize("notebook.cellExecutionTimeVerbosity.default.description", "The cell execution duration is visible, with advanced information in the hover tooltip."),
        nls.localize("notebook.cellExecutionTimeVerbosity.verbose.description", "The cell last execution timestamp and duration are visible, with advanced information in the hover tooltip.")
      ],
      default: "default",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.textDiffEditorPreview]: {
      description: nls.localize("notebook.diff.enablePreview.description", "Whether to use the enhanced text diff editor for notebook."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.diffOverviewRuler]: {
      description: nls.localize("notebook.diff.enableOverviewRuler.description", "Whether to render the overview ruler in the diff editor for notebook."),
      type: "boolean",
      default: false,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.cellToolbarVisibility]: {
      markdownDescription: nls.localize("notebook.cellToolbarVisibility.description", "Whether the cell toolbar should appear on hover or click."),
      type: "string",
      enum: ["hover", "click"],
      default: "click",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.undoRedoPerCell]: {
      description: nls.localize("notebook.undoRedoPerCell.description", "Whether to use separate undo/redo stack for each cell."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.compactView]: {
      description: nls.localize("notebook.compactView.description", "Control whether the notebook editor should be rendered in a compact form. For example, when turned on, it will decrease the left margin width."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.focusIndicator]: {
      description: nls.localize("notebook.focusIndicator.description", "Controls where the focus indicator is rendered, either along the cell borders or on the left gutter."),
      type: "string",
      enum: ["border", "gutter"],
      default: "gutter",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.insertToolbarLocation]: {
      description: nls.localize("notebook.insertToolbarPosition.description", "Control where the insert cell actions should appear."),
      type: "string",
      enum: ["betweenCells", "notebookToolbar", "both", "hidden"],
      enumDescriptions: [
        nls.localize("insertToolbarLocation.betweenCells", "A toolbar that appears on hover between cells."),
        nls.localize("insertToolbarLocation.notebookToolbar", "The toolbar at the top of the notebook editor."),
        nls.localize("insertToolbarLocation.both", "Both toolbars."),
        nls.localize("insertToolbarLocation.hidden", "The insert actions don't appear anywhere.")
      ],
      default: "both",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.globalToolbar]: {
      description: nls.localize("notebook.globalToolbar.description", "Control whether to render a global toolbar inside the notebook editor."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.stickyScrollEnabled]: {
      description: nls.localize("notebook.stickyScrollEnabled.description", "Experimental. Control whether to render notebook Sticky Scroll headers in the notebook editor."),
      type: "boolean",
      default: false,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.stickyScrollMode]: {
      description: nls.localize("notebook.stickyScrollMode.description", "Control whether nested sticky lines appear to stack flat or indented."),
      type: "string",
      enum: ["flat", "indented"],
      enumDescriptions: [
        nls.localize("notebook.stickyScrollMode.flat", "Nested sticky lines appear flat."),
        nls.localize("notebook.stickyScrollMode.indented", "Nested sticky lines appear indented.")
      ],
      default: "indented",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.consolidatedOutputButton]: {
      description: nls.localize("notebook.consolidatedOutputButton.description", "Control whether outputs action should be rendered in the output toolbar."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    // [NotebookSetting.openOutputInPreviewEditor]: {
    // 	description: nls.localize('notebook.output.openInPreviewEditor.description', "Controls whether or not the action to open a cell output in a preview editor is enabled. This action can be used via the cell output menu."),
    // 	type: 'boolean',
    // 	default: false,
    // 	tags: ['preview']
    // },
    [NotebookSetting.showFoldingControls]: {
      description: nls.localize("notebook.showFoldingControls.description", "Controls when the Markdown header folding arrow is shown."),
      type: "string",
      enum: ["always", "never", "mouseover"],
      enumDescriptions: [
        nls.localize("showFoldingControls.always", "The folding controls are always visible."),
        nls.localize("showFoldingControls.never", "Never show the folding controls and reduce the gutter size."),
        nls.localize("showFoldingControls.mouseover", "The folding controls are visible only on mouseover.")
      ],
      default: "mouseover",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.dragAndDropEnabled]: {
      description: nls.localize("notebook.dragAndDrop.description", "Control whether the notebook editor should allow moving cells through drag and drop."),
      type: "boolean",
      default: true,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.consolidatedRunButton]: {
      description: nls.localize("notebook.consolidatedRunButton.description", "Control whether extra actions are shown in a dropdown next to the run button."),
      type: "boolean",
      default: false,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.globalToolbarShowLabel]: {
      description: nls.localize("notebook.globalToolbarShowLabel", "Control whether the actions on the notebook toolbar should render label or not."),
      type: "string",
      enum: ["always", "never", "dynamic"],
      default: "always",
      tags: ["notebookLayout"]
    },
    [NotebookSetting.textOutputLineLimit]: {
      markdownDescription: nls.localize("notebook.textOutputLineLimit", "Controls how many lines of text are displayed in a text output. If {0} is enabled, this setting is used to determine the scroll height of the output.", "`#notebook.output.scrolling#`"),
      type: "number",
      default: 30,
      tags: ["notebookLayout", "notebookOutputLayout"],
      minimum: 1
    },
    [NotebookSetting.LinkifyOutputFilePaths]: {
      description: nls.localize("notebook.disableOutputFilePathLinks", "Control whether to disable filepath links in the output of notebook cells."),
      type: "boolean",
      default: true,
      tags: ["notebookOutputLayout"]
    },
    [NotebookSetting.minimalErrorRendering]: {
      description: nls.localize("notebook.minimalErrorRendering", "Control whether to render error output in a minimal style."),
      type: "boolean",
      default: false,
      tags: ["notebookOutputLayout"]
    },
    [NotebookSetting.markupFontSize]: {
      markdownDescription: nls.localize("notebook.markup.fontSize", "Controls the font size in pixels of rendered markup in notebooks. When set to {0}, 120% of {1} is used.", "`0`", "`#editor.fontSize#`"),
      type: "number",
      default: 0,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.markdownLineHeight]: {
      markdownDescription: nls.localize("notebook.markdown.lineHeight", "Controls the line height in pixels of markdown cells in notebooks. When set to {0}, {1} will be used", "`0`", "`normal`"),
      type: "number",
      default: 0,
      tags: ["notebookLayout"]
    },
    [NotebookSetting.cellEditorOptionsCustomizations]: editorOptionsCustomizationSchema,
    [NotebookSetting.interactiveWindowCollapseCodeCells]: {
      markdownDescription: nls.localize("notebook.interactiveWindow.collapseCodeCells", "Controls whether code cells in the interactive window are collapsed by default."),
      type: "string",
      enum: ["always", "never", "fromEditor"],
      default: "fromEditor"
    },
    [NotebookSetting.outputLineHeight]: {
      markdownDescription: nls.localize("notebook.outputLineHeight", "Line height of the output text within notebook cells.\n - When set to 0, editor line height is used.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values."),
      type: "number",
      default: 0,
      tags: ["notebookLayout", "notebookOutputLayout"]
    },
    [NotebookSetting.outputFontSize]: {
      markdownDescription: nls.localize("notebook.outputFontSize", "Font size for the output text within notebook cells. When set to 0, {0} is used.", "`#editor.fontSize#`"),
      type: "number",
      default: 0,
      tags: ["notebookLayout", "notebookOutputLayout"]
    },
    [NotebookSetting.outputFontFamily]: {
      markdownDescription: nls.localize("notebook.outputFontFamily", "The font family of the output text within notebook cells. When set to empty, the {0} is used.", "`#editor.fontFamily#`"),
      type: "string",
      tags: ["notebookLayout", "notebookOutputLayout"]
    },
    [NotebookSetting.outputScrolling]: {
      markdownDescription: nls.localize("notebook.outputScrolling", "Initially render notebook outputs in a scrollable region when longer than the limit."),
      type: "boolean",
      tags: ["notebookLayout", "notebookOutputLayout"],
      default: typeof product.quality === "string" && product.quality !== "stable"
      // only enable as default in insiders
    },
    [NotebookSetting.outputWordWrap]: {
      markdownDescription: nls.localize("notebook.outputWordWrap", "Controls whether the lines in output should wrap."),
      type: "boolean",
      tags: ["notebookLayout", "notebookOutputLayout"],
      default: false
    },
    [NotebookSetting.defaultFormatter]: {
      description: nls.localize("notebookFormatter.default", "Defines a default notebook formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
      type: ["string", "null"],
      default: null,
      enum: DefaultFormatter.extensionIds,
      enumItemLabels: DefaultFormatter.extensionItemLabels,
      markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
    },
    [NotebookSetting.formatOnSave]: {
      markdownDescription: nls.localize("notebook.formatOnSave", "Format a notebook on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.", "`#files.autoSave#`"),
      type: "boolean",
      tags: ["notebookLayout"],
      default: false
    },
    [NotebookSetting.insertFinalNewline]: {
      markdownDescription: nls.localize("notebook.insertFinalNewline", "When enabled, insert a final new line into the end of code cells when saving a notebook."),
      type: "boolean",
      tags: ["notebookLayout"],
      default: false
    },
    [NotebookSetting.formatOnCellExecution]: {
      markdownDescription: nls.localize("notebook.formatOnCellExecution", "Format a notebook cell upon execution. A formatter must be available."),
      type: "boolean",
      default: false
    },
    [NotebookSetting.confirmDeleteRunningCell]: {
      markdownDescription: nls.localize("notebook.confirmDeleteRunningCell", "Control whether a confirmation prompt is required to delete a running cell."),
      type: "boolean",
      default: true
    },
    [NotebookSetting.findFilters]: {
      markdownDescription: nls.localize("notebook.findFilters", "Customize the Find Widget behavior for searching within notebook cells. When both markup source and markup preview are enabled, the Find Widget will search either the source code or preview based on the current state of the cell."),
      type: "object",
      properties: {
        markupSource: {
          type: "boolean",
          default: true
        },
        markupPreview: {
          type: "boolean",
          default: true
        },
        codeSource: {
          type: "boolean",
          default: true
        },
        codeOutput: {
          type: "boolean",
          default: true
        }
      },
      default: {
        markupSource: true,
        markupPreview: true,
        codeSource: true,
        codeOutput: true
      },
      tags: ["notebookLayout"]
    },
    [NotebookSetting.remoteSaving]: {
      markdownDescription: nls.localize("notebook.remoteSaving", "Enables the incremental saving of notebooks between processes and across Remote connections. When enabled, only the changes to the notebook are sent to the extension host, improving performance for large notebooks and slow network connections."),
      type: "boolean",
      default: typeof product.quality === "string" && product.quality !== "stable",
      // only enable as default in insiders
      tags: ["experimental"]
    },
    [NotebookSetting.scrollToRevealCell]: {
      markdownDescription: nls.localize("notebook.scrolling.revealNextCellOnExecute.description", "How far to scroll when revealing the next cell upon running {0}.", "notebook.cell.executeAndSelectBelow"),
      type: "string",
      enum: ["fullCell", "firstLine", "none"],
      markdownEnumDescriptions: [
        nls.localize("notebook.scrolling.revealNextCellOnExecute.fullCell.description", "Scroll to fully reveal the next cell."),
        nls.localize("notebook.scrolling.revealNextCellOnExecute.firstLine.description", "Scroll to reveal the first line of the next cell."),
        nls.localize("notebook.scrolling.revealNextCellOnExecute.none.description", "Do not scroll.")
      ],
      default: "fullCell"
    },
    [NotebookSetting.cellGenerate]: {
      markdownDescription: nls.localize("notebook.cellGenerate", "Enable experimental generate action to create code cell with inline chat enabled."),
      type: "boolean",
      default: true
    },
    [NotebookSetting.notebookVariablesView]: {
      markdownDescription: nls.localize("notebook.VariablesView.description", "Enable the experimental notebook variables view within the debug panel."),
      type: "boolean",
      default: false
    },
    [NotebookSetting.notebookInlineValues]: {
      markdownDescription: nls.localize("notebook.inlineValues.description", "Control whether to show inline values within notebook code cells after cell execution. Values will remain until the cell is edited, re-executed, or explicitly cleared via the Clear All Outputs toolbar button or the `Notebook: Clear Inline Values` command."),
      type: "string",
      enum: ["on", "auto", "off"],
      enumDescriptions: [
        nls.localize("notebook.inlineValues.on", "Always show inline values, with a regex fallback if no inline value provider is registered. Note: There may be a performance impact in larger cells if the fallback is used."),
        nls.localize("notebook.inlineValues.auto", "Show inline values only when an inline value provider is registered."),
        nls.localize("notebook.inlineValues.off", "Never show inline values.")
      ],
      default: "off"
    },
    [NotebookSetting.cellFailureDiagnostics]: {
      markdownDescription: nls.localize("notebook.cellFailureDiagnostics", "Show available diagnostics for cell failures."),
      type: "boolean",
      default: true
    },
    [NotebookSetting.outputBackupSizeLimit]: {
      markdownDescription: nls.localize("notebook.backup.sizeLimit", "The limit of notebook output size in kilobytes (KB) where notebook files will no longer be backed up for hot reload. Use 0 for unlimited."),
      type: "number",
      default: 1e4
    },
    [NotebookSetting.multiCursor]: {
      markdownDescription: nls.localize("notebook.multiCursor.enabled", "Experimental. Enables a limited set of multi cursor controls across multiple cells in the notebook editor. Currently supported are core editor actions (typing/cut/copy/paste/composition) and a limited subset of editor commands."),
      type: "boolean",
      default: false
    },
    [NotebookSetting.markupFontFamily]: {
      markdownDescription: nls.localize("notebook.markup.fontFamily", "Controls the font family of rendered markup in notebooks. When left blank, this will fall back to the default workbench font family."),
      type: "string",
      default: "",
      tags: ["notebookLayout"]
    }
  }
});
export {
  NotebookContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxub3RlYm9vay5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHRvRm9ybWF0dGVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBJVGV4dEJ1ZmZlckZhY3RvcnksIElUZXh0QnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZWxlY3Rpb24sIElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcmlhbGl6ZXIsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvciB9IGZyb20gJy4vbm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCwgTm90ZWJvb2tFZGl0b3JJbnB1dE9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIENlbGxVcmksIElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwsIE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllciwgTm90ZWJvb2tTZXR0aW5nLCBJQ2VsbE91dHB1dCwgSUNlbGwsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va01ldGFkYXRhVXJpIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yTW9kZWxSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0RpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHREaWZmRWRpdG9yIH0gZnJvbSAnLi9kaWZmL25vdGVib29rRGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3NlcnZpY2VzL25vdGVib29rV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2VJbXBsIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va1dvcmtlclNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yV2lkZ2V0U2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZ2V0Rm9ybWF0dGVkT3V0cHV0SlNPTiwgZ2V0U3RyZWFtT3V0cHV0RGF0YSB9IGZyb20gJy4vZGlmZi9kaWZmRWxlbWVudFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlSW1wbCB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxIaXN0b3J5U2VydmljZSwgSU5vdGVib29rS2VybmVsU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va0tlcm5lbFNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciwgSVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rUmVuZGVyZXJNZXNzYWdpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnksIE5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlRmFjdG9yeSB9IGZyb20gJy4vdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5LmpzJztcblxuLy8gRWRpdG9yIENvbnRyb2xsZXJcbmltcG9ydCAnLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL2luc2VydENlbGxBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL2V4ZWN1dGVBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL3NlY3Rpb25BY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL2xheW91dEFjdGlvbnMuanMnO1xuaW1wb3J0ICcuL2NvbnRyb2xsZXIvZWRpdEFjdGlvbnMuanMnO1xuaW1wb3J0ICcuL2NvbnRyb2xsZXIvY2VsbE91dHB1dEFjdGlvbnMuanMnO1xuaW1wb3J0ICcuL2NvbnRyb2xsZXIvYXBpQWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci9mb2xkaW5nQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgJy4vY29udHJvbGxlci9jaGF0L25vdGVib29rLmNoYXQuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi9jb250cm9sbGVyL3ZhcmlhYmxlc0FjdGlvbnMuanMnO1xuXG4vLyBFZGl0b3IgQ29udHJpYnV0aW9uXG5pbXBvcnQgJy4vY29udHJpYi9lZGl0b3JIaW50L2VtcHR5Q2VsbEVkaXRvckhpbnQuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvY2xpcGJvYXJkL25vdGVib29rQ2xpcGJvYXJkLmpzJztcbmltcG9ydCAnLi9jb250cmliL2ZpbmQvbm90ZWJvb2tGaW5kLmpzJztcbmltcG9ydCAnLi9jb250cmliL2Zvcm1hdC9mb3JtYXR0aW5nLmpzJztcbmltcG9ydCAnLi9jb250cmliL3NhdmVQYXJ0aWNpcGFudHMvc2F2ZVBhcnRpY2lwYW50cy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9nZXR0aW5nU3RhcnRlZC9ub3RlYm9va0dldHRpbmdTdGFydGVkLmpzJztcbmltcG9ydCAnLi9jb250cmliL2xheW91dC9sYXlvdXRBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9jb250cmliL21hcmtlci9tYXJrZXJQcm92aWRlci5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9uYXZpZ2F0aW9uL2Fycm93LmpzJztcbmltcG9ydCAnLi9jb250cmliL291dGxpbmUvbm90ZWJvb2tPdXRsaW5lLmpzJztcbmltcG9ydCAnLi9jb250cmliL3Byb2ZpbGUvbm90ZWJvb2tQcm9maWxlLmpzJztcbmltcG9ydCAnLi9jb250cmliL2NlbGxTdGF0dXNCYXIvc3RhdHVzQmFyUHJvdmlkZXJzLmpzJztcbmltcG9ydCAnLi9jb250cmliL2NlbGxTdGF0dXNCYXIvY29udHJpYnV0ZWRTdGF0dXNCYXJJdGVtQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9jZWxsU3RhdHVzQmFyL2V4ZWN1dGlvblN0YXR1c0Jhckl0ZW1Db250cm9sbGVyLmpzJztcbmltcG9ydCAnLi9jb250cmliL2VkaXRvclN0YXR1c0Jhci9lZGl0b3JTdGF0dXNCYXIuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvdW5kb1JlZG8vbm90ZWJvb2tVbmRvUmVkby5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9jZWxsQ29tbWFuZHMvY2VsbENvbW1hbmRzLmpzJztcbmltcG9ydCAnLi9jb250cmliL3ZpZXdwb3J0V2FybXVwL3ZpZXdwb3J0V2FybXVwLmpzJztcbmltcG9ydCAnLi9jb250cmliL3Ryb3VibGVzaG9vdC9sYXlvdXQuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvZGVidWcvbm90ZWJvb2tCcmVha3BvaW50cy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9kZWJ1Zy9ub3RlYm9va0NlbGxQYXVzaW5nLmpzJztcbmltcG9ydCAnLi9jb250cmliL2RlYnVnL25vdGVib29rRGVidWdEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9leGVjdXRlL2V4ZWN1dGlvbkVkaXRvclByb2dyZXNzLmpzJztcbmltcG9ydCAnLi9jb250cmliL2tlcm5lbERldGVjdGlvbi9ub3RlYm9va0tlcm5lbERldGVjdGlvbi5qcyc7XG5pbXBvcnQgJy4vY29udHJpYi9jZWxsRGlhZ25vc3RpY3MvY2VsbERpYWdub3N0aWNzLmpzJztcbmltcG9ydCAnLi9jb250cmliL211bHRpY3Vyc29yL25vdGVib29rTXVsdGljdXJzb3IuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvbXVsdGljdXJzb3Ivbm90ZWJvb2tTZWxlY3Rpb25IaWdobGlnaHQuanMnO1xuaW1wb3J0ICcuL2NvbnRyaWIvbm90ZWJvb2tWYXJpYWJsZXMvbm90ZWJvb2tJbmxpbmVWYXJpYWJsZXMuanMnO1xuXG4vLyBEaWZmIEVkaXRvciBDb250cmlidXRpb25cbmltcG9ydCAnLi9kaWZmL25vdGVib29rRGlmZkFjdGlvbnMuanMnO1xuXG4vLyBTZXJ2aWNlc1xuaW1wb3J0IHsgZWRpdG9yT3B0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IE5vdGVib29rRXhlY3V0aW9uU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXltYXBTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rS2V5bWFwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0tleW1hcFNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rS2V5bWFwU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IE5vdGVib29rSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ09NTUVOVEVESVRPUl9ERUNPUkFUSU9OX0tFWSB9IGZyb20gJy4uLy4uL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFJlcGx5LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL25vdGVib29rS2VybmVsSGlzdG9yeVNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tMb2dnaW5nU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbm90ZWJvb2tMb2dnaW5nU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1ZhcmlhYmxlcyB9IGZyb20gJy4vY29udHJpYi9ub3RlYm9va1ZhcmlhYmxlcy9ub3RlYm9va1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tBY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4vbm90ZWJvb2tBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0FjY2Vzc2libGVWaWV3IH0gZnJvbSAnLi9ub3RlYm9va0FjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IERlZmF1bHRGb3JtYXR0ZXIgfSBmcm9tICcuLi8uLi9mb3JtYXQvYnJvd3Nlci9mb3JtYXRBY3Rpb25zTXVsdGlwbGUuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yIH0gZnJvbSAnLi9kaWZmL25vdGVib29rTXVsdGlEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuL2RpZmYvbm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBnZXRGb3JtYXR0ZWRNZXRhZGF0YUpTT04gfSBmcm9tICcuLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnksIE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeSB9IGZyb20gJy4vdmlld01vZGVsL25vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBnZXRGb3JtYXR0ZWROb3RlYm9va01ldGFkYXRhSlNPTiB9IGZyb20gJy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va01ldGFkYXRhVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3V0cHV0RWRpdG9yIH0gZnJvbSAnLi9vdXRwdXRFZGl0b3Ivbm90ZWJvb2tPdXRwdXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPdXRwdXRFZGl0b3JJbnB1dCB9IGZyb20gJy4vb3V0cHV0RWRpdG9yL25vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQuanMnO1xuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSAqL1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdE5vdGVib29rRWRpdG9yLFxuXHRcdE5vdGVib29rRWRpdG9yLklELFxuXHRcdCdOb3RlYm9vayBFZGl0b3InXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoTm90ZWJvb2tFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHROb3RlYm9va1RleHREaWZmRWRpdG9yLFxuXHRcdE5vdGVib29rVGV4dERpZmZFZGl0b3IuSUQsXG5cdFx0J05vdGVib29rIERpZmYgRWRpdG9yJ1xuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKE5vdGVib29rRGlmZkVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdE5vdGVib29rT3V0cHV0RWRpdG9yLFxuXHRcdE5vdGVib29rT3V0cHV0RWRpdG9yLklELFxuXHRcdCdOb3RlYm9vayBPdXRwdXQgRWRpdG9yJ1xuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKE5vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0Tm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLFxuXHRcdE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCxcblx0XHQnTm90ZWJvb2sgRGlmZiBFZGl0b3InXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoTm90ZWJvb2tNdWx0aURpZmZFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuY2xhc3MgTm90ZWJvb2tEaWZmRWRpdG9yU2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y29uc3RydWN0b3IoQElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7IH1cblx0Y2FuU2VyaWFsaXplKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0YXNzZXJ0VHlwZShpbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRGlmZkVkaXRvcklucHV0KTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0cmVzb3VyY2U6IGlucHV0LnJlc291cmNlLFxuXHRcdFx0b3JpZ2luYWxSZXNvdXJjZTogaW5wdXQub3JpZ2luYWwucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiBpbnB1dC5nZXROYW1lKCksXG5cdFx0XHRvcmlnaW5hbE5hbWU6IGlucHV0Lm9yaWdpbmFsLmdldE5hbWUoKSxcblx0XHRcdHRleHREaWZmTmFtZTogaW5wdXQuZ2V0TmFtZSgpLFxuXHRcdFx0dmlld1R5cGU6IGlucHV0LnZpZXdUeXBlLFxuXHRcdH0pO1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmF3OiBzdHJpbmcpIHtcblx0XHR0eXBlIERhdGEgPSB7IHJlc291cmNlOiBVUkk7IG9yaWdpbmFsUmVzb3VyY2U6IFVSSTsgbmFtZTogc3RyaW5nOyBvcmlnaW5hbE5hbWU6IHN0cmluZzsgdmlld1R5cGU6IHN0cmluZzsgdGV4dERpZmZOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGdyb3VwOiBudW1iZXIgfTtcblx0XHRjb25zdCBkYXRhID0gPERhdGE+cGFyc2UocmF3KTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgcmVzb3VyY2UsIG9yaWdpbmFsUmVzb3VyY2UsIG5hbWUsIHZpZXdUeXBlIH0gPSBkYXRhO1xuXHRcdGlmICghZGF0YSB8fCAhVVJJLmlzVXJpKHJlc291cmNlKSB8fCAhVVJJLmlzVXJpKG9yaWdpbmFsUmVzb3VyY2UpIHx8IHR5cGVvZiBuYW1lICE9PSAnc3RyaW5nJyB8fCB0eXBlb2Ygdmlld1R5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnbm90ZWJvb2suZXhwZXJpbWVudGFsLmVuYWJsZU5ld0RpZmZFZGl0b3InKSkge1xuXHRcdFx0cmV0dXJuIE5vdGVib29rTXVsdGlEaWZmRWRpdG9ySW5wdXQuY3JlYXRlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvdXJjZSwgbmFtZSwgdW5kZWZpbmVkLCBvcmlnaW5hbFJlc291cmNlLCB2aWV3VHlwZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBOb3RlYm9va0RpZmZFZGl0b3JJbnB1dC5jcmVhdGUoaW5zdGFudGlhdGlvblNlcnZpY2UsIHJlc291cmNlLCBuYW1lLCB1bmRlZmluZWQsIG9yaWdpbmFsUmVzb3VyY2UsIHZpZXdUeXBlKTtcblx0XHR9XG5cdH1cblxuXHRzdGF0aWMgY2FuUmVzb2x2ZUJhY2t1cChlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQsIGJhY2t1cFJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxufVxudHlwZSBTZXJpYWxpemVkTm90ZWJvb2tFZGl0b3JEYXRhID0geyByZXNvdXJjZTogVVJJOyBwcmVmZXJyZWRSZXNvdXJjZTogVVJJOyB2aWV3VHlwZTogc3RyaW5nOyBvcHRpb25zPzogTm90ZWJvb2tFZGl0b3JJbnB1dE9wdGlvbnMgfTtcbmNsYXNzIE5vdGVib29rRWRpdG9yU2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dC50eXBlSWQgPT09IE5vdGVib29rRWRpdG9ySW5wdXQuSUQ7XG5cdH1cblx0c2VyaWFsaXplKGlucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0YXNzZXJ0VHlwZShpbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpO1xuXHRcdGNvbnN0IGRhdGE6IFNlcmlhbGl6ZWROb3RlYm9va0VkaXRvckRhdGEgPSB7XG5cdFx0XHRyZXNvdXJjZTogaW5wdXQucmVzb3VyY2UsXG5cdFx0XHRwcmVmZXJyZWRSZXNvdXJjZTogaW5wdXQucHJlZmVycmVkUmVzb3VyY2UsXG5cdFx0XHR2aWV3VHlwZTogaW5wdXQudmlld1R5cGUsXG5cdFx0XHRvcHRpb25zOiBpbnB1dC5vcHRpb25zXG5cdFx0fTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZGF0YSk7XG5cdH1cblx0ZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmF3OiBzdHJpbmcpIHtcblx0XHRjb25zdCBkYXRhID0gPFNlcmlhbGl6ZWROb3RlYm9va0VkaXRvckRhdGE+cGFyc2UocmF3KTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgcmVzb3VyY2UsIHByZWZlcnJlZFJlc291cmNlLCB2aWV3VHlwZSwgb3B0aW9ucyB9ID0gZGF0YTtcblx0XHRpZiAoIWRhdGEgfHwgIVVSSS5pc1VyaShyZXNvdXJjZSkgfHwgdHlwZW9mIHZpZXdUeXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IE5vdGVib29rRWRpdG9ySW5wdXQuZ2V0T3JDcmVhdGUoaW5zdGFudGlhdGlvblNlcnZpY2UsIHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgdmlld1R5cGUsIG9wdGlvbnMpO1xuXHRcdHJldHVybiBpbnB1dDtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBTZXJpYWxpemVkTm90ZWJvb2tPdXRwdXRFZGl0b3JEYXRhID0geyBub3RlYm9va1VyaTogVVJJOyBjZWxsSW5kZXg6IG51bWJlcjsgb3V0cHV0SW5kZXg6IG51bWJlciB9O1xuY2xhc3MgTm90ZWJvb2tPdXRwdXRFZGl0b3JTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRjYW5TZXJpYWxpemUoaW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlucHV0LnR5cGVJZCA9PT0gTm90ZWJvb2tPdXRwdXRFZGl0b3JJbnB1dC5JRDtcblx0fVxuXHRzZXJpYWxpemUoaW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRhc3NlcnRUeXBlKGlucHV0IGluc3RhbmNlb2YgTm90ZWJvb2tPdXRwdXRFZGl0b3JJbnB1dCk7XG5cblx0XHRjb25zdCBkYXRhID0gaW5wdXQuZ2V0U2VyaWFsaXplZERhdGEoKTsgLy8gaW4gY2FzZSBvZiBjZWxsIG1vdmVtZW50IGV0YyBnZXQgbGF0ZXN0IGluZGljZXNcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGRhdGEpO1xuXHR9XG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJhdzogc3RyaW5nKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRhdGEgPSA8U2VyaWFsaXplZE5vdGVib29rT3V0cHV0RWRpdG9yRGF0YT5wYXJzZShyYXcpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3V0cHV0RWRpdG9ySW5wdXQsIGRhdGEubm90ZWJvb2tVcmksIGRhdGEuY2VsbEluZGV4LCB1bmRlZmluZWQsIGRhdGEub3V0cHV0SW5kZXgpO1xuXHRcdHJldHVybiBpbnB1dDtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihcblx0Tm90ZWJvb2tFZGl0b3JJbnB1dC5JRCxcblx0Tm90ZWJvb2tFZGl0b3JTZXJpYWxpemVyXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihcblx0Tm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQuSUQsXG5cdE5vdGVib29rRGlmZkVkaXRvclNlcmlhbGl6ZXJcbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFxuXHROb3RlYm9va091dHB1dEVkaXRvcklucHV0LklELFxuXHROb3RlYm9va091dHB1dEVkaXRvclNlcmlhbGl6ZXJcbik7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubm90ZWJvb2snO1xuXG5cdHByaXZhdGUgX3VyaUNvbXBhcmlzb25LZXlDb21wdXRlcj86IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHVuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNlbGxVbmRvUmVkb0NvbXBhcmlzb25LZXkoY29uZmlndXJhdGlvblNlcnZpY2UsIHVuZG9SZWRvU2VydmljZSk7XG5cblx0XHQvLyBXYXRjaCBmb3IgY2hhbmdlcyB0byB1bmRvUmVkb1BlckNlbGwgc2V0dGluZ1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy51bmRvUmVkb1BlckNlbGwpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2VsbFVuZG9SZWRvQ29tcGFyaXNvbktleShjb25maWd1cmF0aW9uU2VydmljZSwgdW5kb1JlZG9TZXJ2aWNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyByZWdpc3RlciBjb21tZW50IGRlY29yYXRpb25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoJ2NvbW1lbnQtY29udHJvbGxlcicsIENPTU1FTlRFRElUT1JfREVDT1JBVElPTl9LRVksIHt9KSk7XG5cdH1cblxuXHQvLyBBZGQgb3IgcmVtb3ZlIHRoZSBjZWxsIHVuZG8gcmVkbyBjb21wYXJpc29uIGtleSBiYXNlZCBvbiB0aGUgdXNlciBzZXR0aW5nXG5cdHByaXZhdGUgdXBkYXRlQ2VsbFVuZG9SZWRvQ29tcGFyaXNvbktleShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB1bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UpIHtcblx0XHRjb25zdCB1bmRvUmVkb1BlckNlbGwgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcudW5kb1JlZG9QZXJDZWxsKTtcblxuXHRcdGlmICghdW5kb1JlZG9QZXJDZWxsKSB7XG5cdFx0XHQvLyBBZGQgY29tcGFyaXNvbiBrZXkgdG8gbWFwIGNlbGwgPT4gbWFpbiBkb2N1bWVudFxuXHRcdFx0aWYgKCF0aGlzLl91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXIpIHtcblx0XHRcdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyID0gdW5kb1JlZG9TZXJ2aWNlLnJlZ2lzdGVyVXJpQ29tcGFyaXNvbktleUNvbXB1dGVyKENlbGxVcmkuc2NoZW1lLCB7XG5cdFx0XHRcdFx0Z2V0Q29tcGFyaXNvbktleTogKHVyaTogVVJJKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRcdGlmICh1bmRvUmVkb1BlckNlbGwpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIE5vdGVib29rQ29udHJpYnV0aW9uLl9nZXRDZWxsVW5kb1JlZG9Db21wYXJpc29uS2V5KHVyaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGlzcG9zZSBjb21wYXJpc29uIGtleVxuXHRcdFx0dGhpcy5fdXJpQ29tcGFyaXNvbktleUNvbXB1dGVyPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldENlbGxVbmRvUmVkb0NvbXBhcmlzb25LZXkodXJpOiBVUkkpIHtcblx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5wYXJzZSh1cmkpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHVyaS50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdHJldHVybiBkYXRhLm5vdGVib29rLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl91cmlDb21wYXJpc29uS2V5Q29tcHV0ZXI/LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBDZWxsQ29udGVudFByb3ZpZGVyIGltcGxlbWVudHMgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNlbGxDb250ZW50UHJvdmlkZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJhdGlvbjogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2U6IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb24gPSB0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKENlbGxVcmkuc2NoZW1lLCB0aGlzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IENlbGxVcmkucGFyc2UocmVzb3VyY2UpO1xuXHRcdC8vIGNvbnN0IGRhdGEgPSBwYXJzZUNlbGxVcmkocmVzb3VyY2UpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKGRhdGEubm90ZWJvb2spO1xuXHRcdGxldCByZXN1bHQ6IElUZXh0TW9kZWwgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmICghcmVmLm9iamVjdC5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2VsbCBvZiByZWYub2JqZWN0Lm5vdGVib29rLmNlbGxzKSB7XG5cdFx0XHRpZiAoY2VsbC51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRjb25zdCBidWZmZXJGYWN0b3J5OiBJVGV4dEJ1ZmZlckZhY3RvcnkgPSB7XG5cdFx0XHRcdFx0Y3JlYXRlOiAoZGVmYXVsdEVPTCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdGV4dEJ1ZmZlcjogY2VsbC50ZXh0QnVmZmVyIGFzIElUZXh0QnVmZmVyLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlLk5vbmUgfTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldEZpcnN0TGluZVRleHQ6IChsaW1pdDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb250ZW50KDEpLnN1YnN0cmluZygwLCBsaW1pdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShjZWxsLmxhbmd1YWdlKTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSBsYW5ndWFnZUlkID8gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQobGFuZ3VhZ2VJZCkgOiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwID8gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ21hcmtkb3duJykgOiB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlLCBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUNvbnRlbnQoMSkpKTtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0XHRcdGJ1ZmZlckZhY3RvcnksXG5cdFx0XHRcdFx0bGFuZ3VhZ2VTZWxlY3Rpb24sXG5cdFx0XHRcdFx0cmVzb3VyY2Vcblx0XHRcdFx0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBvbmNlID0gRXZlbnQuYW55KHJlc3VsdC5vbldpbGxEaXNwb3NlLCByZWYub2JqZWN0Lm5vdGVib29rLm9uV2lsbERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdG9uY2UuZGlzcG9zZSgpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgQ2VsbEluZm9Db250ZW50UHJvdmlkZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jZWxsSW5mb0NvbnRlbnRQcm92aWRlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2U6IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxNZXRhZGF0YSwge1xuXHRcdFx0cHJvdmlkZVRleHRDb250ZW50OiB0aGlzLnByb3ZpZGVNZXRhZGF0YVRleHRDb250ZW50LmJpbmQodGhpcylcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQsIHtcblx0XHRcdHByb3ZpZGVUZXh0Q29udGVudDogdGhpcy5wcm92aWRlT3V0cHV0VGV4dENvbnRlbnQuYmluZCh0aGlzKVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnB1c2godGhpcy5fbGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxNZXRhZGF0YSxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke3BhdGh9IChtZXRhZGF0YSknLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJ1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnB1c2godGhpcy5fbGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxPdXRwdXQsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofSAob3V0cHV0KScsXG5cdFx0XHRcdHNlcGFyYXRvcjogJy8nXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVNZXRhZGF0YVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBDZWxsVXJpLnBhcnNlQ2VsbFByb3BlcnR5VXJpKHJlc291cmNlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE1ldGFkYXRhKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2UucmVzb2x2ZShkYXRhLm5vdGVib29rKTtcblx0XHRsZXQgcmVzdWx0OiBJVGV4dE1vZGVsIHwgbnVsbCA9IG51bGw7XG5cblx0XHRjb25zdCBtb2RlID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ2pzb24nKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgcmVmLm9iamVjdC5ub3RlYm9vay5jZWxscykge1xuXHRcdFx0aWYgKGNlbGwuaGFuZGxlID09PSBkYXRhLmhhbmRsZSkge1xuXHRcdFx0XHRjb25zdCBjZWxsSW5kZXggPSByZWYub2JqZWN0Lm5vdGVib29rLmNlbGxzLmluZGV4T2YoY2VsbCk7XG5cdFx0XHRcdGNvbnN0IG1ldGFkYXRhU291cmNlID0gZ2V0Rm9ybWF0dGVkTWV0YWRhdGFKU09OKHJlZi5vYmplY3Qubm90ZWJvb2sudHJhbnNpZW50T3B0aW9ucy50cmFuc2llbnRDZWxsTWV0YWRhdGEsIGNlbGwubWV0YWRhdGEsIGNlbGwubGFuZ3VhZ2UsIHRydWUpO1xuXHRcdFx0XHRyZXN1bHQgPSB0aGlzLl9tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoXG5cdFx0XHRcdFx0bWV0YWRhdGFTb3VyY2UsXG5cdFx0XHRcdFx0bW9kZSxcblx0XHRcdFx0XHRyZXNvdXJjZVxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKGRpc3Bvc2FibGVzLmFkZChyZWYub2JqZWN0Lm5vdGVib29rLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHtcblx0XHRcdFx0XHRpZiAocmVzdWx0ICYmIGUucmF3RXZlbnRzLnNvbWUoZXZlbnQgPT4gKGV2ZW50LmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNZXRhZGF0YSB8fCBldmVudC5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2UpICYmIGV2ZW50LmluZGV4ID09PSBjZWxsSW5kZXgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGdldEZvcm1hdHRlZE1ldGFkYXRhSlNPTihyZWYub2JqZWN0Lm5vdGVib29rLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50Q2VsbE1ldGFkYXRhLCBjZWxsLm1ldGFkYXRhLCBjZWxsLmxhbmd1YWdlLCB0cnVlKTtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQuZ2V0VmFsdWUoKSAhPT0gdmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnNldFZhbHVlKHZhbHVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25jZSA9IHJlc3VsdC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdG9uY2UuZGlzcG9zZSgpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlU3RyZWFtT3V0cHV0KG9wPzogSUNlbGxPdXRwdXQpOiB7IGNvbnRlbnQ6IHN0cmluZzsgbW9kZTogSUxhbmd1YWdlU2VsZWN0aW9uIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghb3ApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdHJlYW1PdXRwdXREYXRhID0gZ2V0U3RyZWFtT3V0cHV0RGF0YShvcC5vdXRwdXRzKTtcblx0XHRpZiAoc3RyZWFtT3V0cHV0RGF0YSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogc3RyZWFtT3V0cHV0RGF0YSxcblx0XHRcdFx0bW9kZTogdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoUExBSU5URVhUX0xBTkdVQUdFX0lEKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXN1bHQoZGF0YToge1xuXHRcdG5vdGVib29rOiBVUkk7XG5cdFx0b3V0cHV0SWQ/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdH0sIGNlbGw6IElDZWxsKSB7XG5cdFx0bGV0IHJlc3VsdDogeyBjb250ZW50OiBzdHJpbmc7IG1vZGU6IElMYW5ndWFnZVNlbGVjdGlvbiB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdqc29uJyk7XG5cdFx0Y29uc3Qgb3AgPSBjZWxsLm91dHB1dHMuZmluZChvcCA9PiBvcC5vdXRwdXRJZCA9PT0gZGF0YS5vdXRwdXRJZCB8fCBvcC5hbHRlcm5hdGl2ZU91dHB1dElkID09PSBkYXRhLm91dHB1dElkKTtcblx0XHRjb25zdCBzdHJlYW1PdXRwdXREYXRhID0gdGhpcy5wYXJzZVN0cmVhbU91dHB1dChvcCk7XG5cdFx0aWYgKHN0cmVhbU91dHB1dERhdGEpIHtcblx0XHRcdHJlc3VsdCA9IHN0cmVhbU91dHB1dERhdGE7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IG9iaiA9IGNlbGwub3V0cHV0cy5tYXAob3V0cHV0ID0+ICh7XG5cdFx0XHRtZXRhZGF0YTogb3V0cHV0Lm1ldGFkYXRhLFxuXHRcdFx0b3V0cHV0SXRlbXM6IG91dHB1dC5vdXRwdXRzLm1hcChvcGl0ID0+ICh7XG5cdFx0XHRcdG1pbWVUeXBlOiBvcGl0Lm1pbWUsXG5cdFx0XHRcdGRhdGE6IG9waXQuZGF0YS50b1N0cmluZygpXG5cdFx0XHR9KSlcblx0XHR9KSk7XG5cblx0XHRjb25zdCBvdXRwdXRTb3VyY2UgPSB0b0Zvcm1hdHRlZFN0cmluZyhvYmosIHt9KTtcblx0XHRyZXN1bHQgPSB7XG5cdFx0XHRjb250ZW50OiBvdXRwdXRTb3VyY2UsXG5cdFx0XHRtb2RlXG5cdFx0fTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlT3V0cHV0c1RleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBDZWxsVXJpLnBhcnNlQ2VsbFByb3BlcnR5VXJpKHJlc291cmNlLCBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE91dHB1dCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmUoZGF0YS5ub3RlYm9vayk7XG5cdFx0Y29uc3QgY2VsbCA9IHJlZi5vYmplY3Qubm90ZWJvb2suY2VsbHMuZmluZChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBkYXRhLmhhbmRsZSk7XG5cblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ2pzb24nKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbChnZXRGb3JtYXR0ZWRPdXRwdXRKU09OKGNlbGwub3V0cHV0cyB8fCBbXSksIG1vZGUsIHJlc291cmNlLCB0cnVlKTtcblx0XHRjb25zdCBjZWxsTW9kZWxMaXN0ZW5lciA9IEV2ZW50LmFueShjZWxsLm9uRGlkQ2hhbmdlT3V0cHV0cyA/PyBFdmVudC5Ob25lLCBjZWxsLm9uRGlkQ2hhbmdlT3V0cHV0SXRlbXMgPz8gRXZlbnQuTm9uZSkoKCkgPT4ge1xuXHRcdFx0bW9kZWwuc2V0VmFsdWUoZ2V0Rm9ybWF0dGVkT3V0cHV0SlNPTihjZWxsLm91dHB1dHMgfHwgW10pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9uY2UgPSBtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdG9uY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y2VsbE1vZGVsTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVPdXRwdXRUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5wYXJzZUNlbGxPdXRwdXRVcmkocmVzb3VyY2UpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZU91dHB1dHNUZXh0Q29udGVudChyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKGRhdGEubm90ZWJvb2spO1xuXHRcdGNvbnN0IGNlbGwgPSByZWYub2JqZWN0Lm5vdGVib29rLmNlbGxzLmZpbmQoY2VsbCA9PiAhIWNlbGwub3V0cHV0cy5maW5kKG9wID0+IG9wLm91dHB1dElkID09PSBkYXRhLm91dHB1dElkIHx8IG9wLmFsdGVybmF0aXZlT3V0cHV0SWQgPT09IGRhdGEub3V0cHV0SWQpKTtcblxuXHRcdGlmICghY2VsbCkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2dldFJlc3VsdChkYXRhLCBjZWxsKTtcblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwocmVzdWx0LmNvbnRlbnQsIHJlc3VsdC5tb2RlLCByZXNvdXJjZSk7XG5cdFx0Y29uc3QgY2VsbE1vZGVsTGlzdGVuZXIgPSBFdmVudC5hbnkoY2VsbC5vbkRpZENoYW5nZU91dHB1dHMgPz8gRXZlbnQuTm9uZSwgY2VsbC5vbkRpZENoYW5nZU91dHB1dEl0ZW1zID8/IEV2ZW50Lk5vbmUpKCgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1Jlc3VsdCA9IHRoaXMuX2dldFJlc3VsdChkYXRhLCBjZWxsKTtcblxuXHRcdFx0aWYgKCFuZXdSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZShuZXdSZXN1bHQuY29udGVudCk7XG5cdFx0XHRtb2RlbC5zZXRMYW5ndWFnZShuZXdSZXN1bHQubW9kZS5sYW5ndWFnZUlkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9uY2UgPSBtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdG9uY2UuZGlzcG9zZSgpO1xuXHRcdFx0Y2VsbE1vZGVsTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va01ldGFkYXRhQ29udGVudFByb3ZpZGVyIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5vdGVib29rTWV0YWRhdGFDb250ZW50UHJvdmlkZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMucHVzaCh0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFNjaGVtYXMudnNjb2RlTm90ZWJvb2tNZXRhZGF0YSwge1xuXHRcdFx0cHJvdmlkZVRleHRDb250ZW50OiB0aGlzLnByb3ZpZGVNZXRhZGF0YVRleHRDb250ZW50LmJpbmQodGhpcylcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2xhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tNZXRhZGF0YSxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0bGFiZWw6ICcke3BhdGh9IChtZXRhZGF0YSknLFxuXHRcdFx0XHRzZXBhcmF0b3I6ICcvJ1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlTWV0YWRhdGFUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gTm90ZWJvb2tNZXRhZGF0YVVyaS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9ub3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmUoZGF0YSk7XG5cdFx0bGV0IHJlc3VsdDogSVRleHRNb2RlbCB8IG51bGwgPSBudWxsO1xuXG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5jcmVhdGVCeUlkKCdqc29uJyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbWV0YWRhdGFTb3VyY2UgPSBnZXRGb3JtYXR0ZWROb3RlYm9va01ldGFkYXRhSlNPTihyZWYub2JqZWN0Lm5vdGVib29rLnRyYW5zaWVudE9wdGlvbnMudHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YSwgcmVmLm9iamVjdC5ub3RlYm9vay5tZXRhZGF0YSk7XG5cdFx0cmVzdWx0ID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0bWV0YWRhdGFTb3VyY2UsXG5cdFx0XHRtb2RlLFxuXHRcdFx0cmVzb3VyY2Vcblx0XHQpO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5wdXNoKGRpc3Bvc2FibGVzLmFkZChyZWYub2JqZWN0Lm5vdGVib29rLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHtcblx0XHRcdGlmIChyZXN1bHQgJiYgZS5yYXdFdmVudHMuc29tZShldmVudCA9PiAoZXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQgfHwgZXZlbnQua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlRG9jdW1lbnRNZXRhZGF0YSB8fCBldmVudC5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSkpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gZ2V0Rm9ybWF0dGVkTm90ZWJvb2tNZXRhZGF0YUpTT04ocmVmLm9iamVjdC5ub3RlYm9vay50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEsIHJlZi5vYmplY3Qubm90ZWJvb2subWV0YWRhdGEpO1xuXHRcdFx0XHRpZiAocmVzdWx0LmdldFZhbHVlKCkgIT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnNldFZhbHVlKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBvbmNlID0gcmVzdWx0Lm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0b25jZS5kaXNwb3NlKCk7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBSZWdpc3RlclNjaGVtYXNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnJlZ2lzdGVyQ2VsbFNjaGVtYXMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3Rlck1ldGFkYXRhU2NoZW1hcygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1ldGFkYXRhU2NoZW1hcygpOiB2b2lkIHtcblx0XHRjb25zdCBqc29uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0XHRjb25zdCBtZXRhZGF0YVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFsnbGFuZ3VhZ2UnXToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGxhbmd1YWdlIGZvciB0aGUgY2VsbCdcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdC8vIHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHR9O1xuXG5cdFx0anNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKCd2c2NvZGU6Ly9zY2hlbWFzL25vdGVib29rL2NlbGxtZXRhZGF0YScsIG1ldGFkYXRhU2NoZW1hKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0VkaXRvck1hbmFnZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubm90ZWJvb2tFZGl0b3JNYW5hZ2VyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRWRpdG9yTW9kZWxTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JNb2RlbFJlc29sdmVyU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBzOiBJRWRpdG9yR3JvdXBzU2VydmljZVxuXHQpIHtcblx0XHQvLyBPUEVOIG5vdGVib29rIGVkaXRvciBmb3IgbW9kZWxzIHRoYXQgaGF2ZSB0dXJuZWQgZGlydHkgd2l0aG91dCBiZWluZyB2aXNpYmxlIGluIGFuIGVkaXRvclxuXHRcdHR5cGUgRSA9IElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWw7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlPEUsIEVbXT4oXG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvck1vZGVsU2VydmljZS5vbkRpZENoYW5nZURpcnR5LFxuXHRcdFx0KGxhc3QsIGN1cnJlbnQpID0+ICFsYXN0ID8gW2N1cnJlbnRdIDogWy4uLmxhc3QsIGN1cnJlbnRdLFxuXHRcdFx0MTAwXG5cdFx0KSh0aGlzLl9vcGVuTWlzc2luZ0RpcnR5Tm90ZWJvb2tFZGl0b3JzLCB0aGlzKSk7XG5cblx0XHQvLyBDTE9TRSBlZGl0b3JzIHdoZW4gd2UgYXJlIGFib3V0IHRvIG9wZW4gY29uZmxpY3Rpbmcgbm90ZWJvb2tzXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKF9ub3RlYm9va0VkaXRvck1vZGVsU2VydmljZS5vbldpbGxGYWlsV2l0aENvbmZsaWN0KGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JHcm91cHMuZ3JvdXBzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZsaWN0SW5wdXRzID0gZ3JvdXAuZWRpdG9ycy5maWx0ZXIoaW5wdXQgPT4gaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0ICYmIGlucHV0LnZpZXdUeXBlICE9PSBlLnZpZXdUeXBlICYmIGlzRXF1YWwoaW5wdXQucmVzb3VyY2UsIGUucmVzb3VyY2UpKTtcblx0XHRcdFx0Y29uc3QgcCA9IGdyb3VwLmNsb3NlRWRpdG9ycyhjb25mbGljdElucHV0cyk7XG5cdFx0XHRcdGUud2FpdFVudGlsKHApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3Blbk1pc3NpbmdEaXJ0eU5vdGVib29rRWRpdG9ycyhtb2RlbHM6IElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWxbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlc291cmNlRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbW9kZWxzKSB7XG5cdFx0XHRpZiAobW9kZWwuaXNEaXJ0eSgpICYmICF0aGlzLl9lZGl0b3JTZXJ2aWNlLmlzT3BlbmVkKHsgcmVzb3VyY2U6IG1vZGVsLnJlc291cmNlLCB0eXBlSWQ6IE5vdGVib29rRWRpdG9ySW5wdXQuSUQsIGVkaXRvcklkOiBtb2RlbC52aWV3VHlwZSB9KSAmJiBleHRuYW1lKG1vZGVsLnJlc291cmNlKSAhPT0gJy5pbnRlcmFjdGl2ZScpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHJlc291cmNlOiBtb2RlbC5yZXNvdXJjZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IGluYWN0aXZlOiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBwaW5uZWQ6IHRydWUsIG92ZXJyaWRlOiBtb2RlbC52aWV3VHlwZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMocmVzdWx0KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU2ltcGxlTm90ZWJvb2tXb3JraW5nQ29weUVkaXRvckhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtpbmdDb3B5RWRpdG9ySGFuZGxlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNpbXBsZU5vdGVib29rV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlOiBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2luc3RhbGxIYW5kbGVyKCk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVzKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgdmlld1R5cGUgPSB0aGlzLmhhbmRsZXNTeW5jKHdvcmtpbmdDb3B5KTtcblx0XHRpZiAoIXZpZXdUeXBlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX25vdGVib29rU2VydmljZS5jYW5SZXNvbHZlKHZpZXdUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlc1N5bmMod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBzdHJpbmcgLyogdmlld1R5cGUgKi8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZpZXdUeXBlID0gdGhpcy5fZ2V0Vmlld1R5cGUod29ya2luZ0NvcHkpO1xuXHRcdGlmICghdmlld1R5cGUgfHwgdmlld1R5cGUgPT09ICdpbnRlcmFjdGl2ZScpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXdUeXBlO1xuXHR9XG5cblx0aXNPcGVuKHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmhhbmRsZXNTeW5jKHdvcmtpbmdDb3B5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0ICYmIGVkaXRvci52aWV3VHlwZSA9PT0gdGhpcy5fZ2V0Vmlld1R5cGUod29ya2luZ0NvcHkpICYmIGlzRXF1YWwod29ya2luZ0NvcHkucmVzb3VyY2UsIGVkaXRvci5yZXNvdXJjZSk7XG5cdH1cblxuXHRjcmVhdGVFZGl0b3Iod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIE5vdGVib29rRWRpdG9ySW5wdXQuZ2V0T3JDcmVhdGUodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIHdvcmtpbmdDb3B5LnJlc291cmNlLCB1bmRlZmluZWQsIHRoaXMuX2dldFZpZXdUeXBlKHdvcmtpbmdDb3B5KSEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW5zdGFsbEhhbmRsZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5yZWdpc3RlckhhbmRsZXIodGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld1R5cGUod29ya2luZ0NvcHk6IElXb3JraW5nQ29weUlkZW50aWZpZXIpIHtcblx0XHRjb25zdCBub3RlYm9va1R5cGUgPSBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIucGFyc2Uod29ya2luZ0NvcHkudHlwZUlkKTtcblx0XHRpZiAobm90ZWJvb2tUeXBlICYmIG5vdGVib29rVHlwZS52aWV3VHlwZSA9PT0gbm90ZWJvb2tUeXBlLm5vdGVib29rVHlwZSkge1xuXHRcdFx0cmV0dXJuIG5vdGVib29rVHlwZT8udmlld1R5cGU7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tMYW5ndWFnZVNlbGVjdG9yU2NvcmVSZWZpbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5ub3RlYm9va0xhbmd1YWdlU2VsZWN0b3JTY29yZVJlZmluZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RlYm9va1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0KSB7XG5cdFx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2V0Tm90ZWJvb2tUeXBlUmVzb2x2ZXIodGhpcy5fZ2V0Tm90ZWJvb2tJbmZvLmJpbmQodGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Tm90ZWJvb2tJbmZvKHVyaTogVVJJKTogTm90ZWJvb2tJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjZWxsVXJpID0gQ2VsbFVyaS5wYXJzZSh1cmkpO1xuXHRcdGlmICghY2VsbFVyaSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UuZ2V0Tm90ZWJvb2tUZXh0TW9kZWwoY2VsbFVyaS5ub3RlYm9vayk7XG5cdFx0aWYgKCFub3RlYm9vaykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogbm90ZWJvb2sudXJpLFxuXHRcdFx0dHlwZTogbm90ZWJvb2sudmlld1R5cGVcblx0XHR9O1xuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihOb3RlYm9va0NvbnRyaWJ1dGlvbi5JRCwgTm90ZWJvb2tDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2VsbENvbnRlbnRQcm92aWRlci5JRCwgQ2VsbENvbnRlbnRQcm92aWRlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDZWxsSW5mb0NvbnRlbnRQcm92aWRlci5JRCwgQ2VsbEluZm9Db250ZW50UHJvdmlkZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tNZXRhZGF0YUNvbnRlbnRQcm92aWRlci5JRCwgTm90ZWJvb2tNZXRhZGF0YUNvbnRlbnRQcm92aWRlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihSZWdpc3RlclNjaGVtYXNDb250cmlidXRpb24uSUQsIFJlZ2lzdGVyU2NoZW1hc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihOb3RlYm9va0VkaXRvck1hbmFnZXIuSUQsIE5vdGVib29rRWRpdG9yTWFuYWdlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihOb3RlYm9va0xhbmd1YWdlU2VsZWN0b3JTY29yZVJlZmluZS5JRCwgTm90ZWJvb2tMYW5ndWFnZVNlbGVjdG9yU2NvcmVSZWZpbmUsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoU2ltcGxlTm90ZWJvb2tXb3JraW5nQ29weUVkaXRvckhhbmRsZXIuSUQsIFNpbXBsZU5vdGVib29rV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xud29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE5vdGVib29rVmFyaWFibGVzLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcblxuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgTm90ZWJvb2tBY2Nlc3NpYmxlVmlldygpKTtcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IE5vdGVib29rQWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va1NlcnZpY2UsIE5vdGVib29rU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2VJbXBsLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLCBOb3RlYm9va01vZGVsUmVzb2x2ZXJTZXJ2aWNlSW1wbCwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZSwgTm90ZWJvb2tDZWxsU3RhdHVzQmFyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLCBOb3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rS2VybmVsU2VydmljZSwgTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlLCBOb3RlYm9va0tlcm5lbEhpc3RvcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va1JlbmRlcmVyTWVzc2FnaW5nU2VydmljZSwgTm90ZWJvb2tSZW5kZXJlck1lc3NhZ2luZ1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGVib29rS2V5bWFwU2VydmljZSwgTm90ZWJvb2tLZXltYXBTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlLCBOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnksIE5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlRmFjdG9yeSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LCBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnksIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuXG5jb25zdCBzY2hlbWFzOiBJSlNPTlNjaGVtYU1hcCA9IHt9O1xuZnVuY3Rpb24gaXNDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEoeDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHsgW3BhdGg6IHN0cmluZ106IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSk6IHggaXMgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB7XG5cdHJldHVybiAodHlwZW9mIHgudHlwZSAhPT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIHguYW55T2YgIT09ICd1bmRlZmluZWQnKTtcbn1cbmZvciAoY29uc3QgZWRpdG9yT3B0aW9uIG9mIGVkaXRvck9wdGlvbnNSZWdpc3RyeSkge1xuXHRjb25zdCBzY2hlbWEgPSBlZGl0b3JPcHRpb24uc2NoZW1hO1xuXHRpZiAoc2NoZW1hKSB7XG5cdFx0aWYgKGlzQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdHNjaGVtYXNbYGVkaXRvci4ke2VkaXRvck9wdGlvbi5uYW1lfWBdID0gc2NoZW1hO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBzY2hlbWEpIHtcblx0XHRcdFx0aWYgKE9iamVjdC5oYXNPd25Qcm9wZXJ0eS5jYWxsKHNjaGVtYSwga2V5KSkge1xuXHRcdFx0XHRcdHNjaGVtYXNba2V5XSA9IHNjaGVtYVtrZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9uU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5lZGl0b3JPcHRpb25zLmV4cGVyaW1lbnRhbEN1c3RvbWl6YXRpb24nLCAnU2V0dGluZ3MgZm9yIGNvZGUgZWRpdG9ycyB1c2VkIGluIG5vdGVib29rcy4gVGhpcyBjYW4gYmUgdXNlZCB0byBjdXN0b21pemUgbW9zdCBlZGl0b3IuKiBzZXR0aW5ncy4nKSxcblx0ZGVmYXVsdDoge30sXG5cdGFsbE9mOiBbXG5cdFx0e1xuXHRcdFx0cHJvcGVydGllczogc2NoZW1hcyxcblx0XHR9XG5cdFx0Ly8gLCB7XG5cdFx0Ly8gXHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdC8vIFx0XHQnXlxcXFxbLipcXFxcXSQnOiB7XG5cdFx0Ly8gXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0Ly8gXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0Ly8gXHRcdFx0cHJvcGVydGllczogc2NoZW1hc1xuXHRcdC8vIFx0XHR9XG5cdFx0Ly8gXHR9XG5cdFx0Ly8gfVxuXHRdLFxuXHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cbn07XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdub3RlYm9vaycsXG5cdG9yZGVyOiAxMDAsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ25vdGVib29rQ29uZmlndXJhdGlvblRpdGxlJywgXCJOb3RlYm9va1wiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmRpc3BsYXlPcmRlcl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmRpc3BsYXlPcmRlci5kZXNjcmlwdGlvbicsIFwiUHJpb3JpdHkgbGlzdCBmb3Igb3V0cHV0IG1pbWUgdHlwZXNcIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiBbXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jZWxsVG9vbGJhckxvY2F0aW9uXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbFRvb2xiYXJMb2NhdGlvbi5kZXNjcmlwdGlvbicsIFwiV2hlcmUgdGhlIGNlbGwgdG9vbGJhciBzaG91bGQgYmUgc2hvd24sIG9yIHdoZXRoZXIgaXQgc2hvdWxkIGJlIGhpZGRlbi5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbFRvb2xiYXJMb2NhdGlvbi52aWV3VHlwZScsIFwiQ29uZmlndXJlIHRoZSBjZWxsIHRvb2xiYXIgcG9zaXRpb24gZm9yIHNwZWNpZmljIGZpbGUgdHlwZXNcIiksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ2xlZnQnLCAncmlnaHQnLCAnaGlkZGVuJ11cblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdkZWZhdWx0JzogJ3JpZ2h0J1xuXHRcdFx0fSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5zaG93Q2VsbFN0YXR1c0Jhcl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnNob3dDZWxsU3RhdHVzYmFyLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRoZSBjZWxsIHN0YXR1cyBiYXIgc2hvdWxkIGJlIHNob3duLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydoaWRkZW4nLCAndmlzaWJsZScsICd2aXNpYmxlQWZ0ZXJFeGVjdXRlJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2hvd0NlbGxTdGF0dXNiYXIuaGlkZGVuLmRlc2NyaXB0aW9uJywgXCJUaGUgY2VsbCBzdGF0dXMgYmFyIGlzIGFsd2F5cyBoaWRkZW4uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLnNob3dDZWxsU3RhdHVzYmFyLnZpc2libGUuZGVzY3JpcHRpb24nLCBcIlRoZSBjZWxsIHN0YXR1cyBiYXIgaXMgYWx3YXlzIHZpc2libGUuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLnNob3dDZWxsU3RhdHVzYmFyLnZpc2libGVBZnRlckV4ZWN1dGUuZGVzY3JpcHRpb24nLCBcIlRoZSBjZWxsIHN0YXR1cyBiYXIgaXMgaGlkZGVuIHVudGlsIHRoZSBjZWxsIGhhcyBleGVjdXRlZC4gVGhlbiBpdCBiZWNvbWVzIHZpc2libGUgdG8gc2hvdyB0aGUgZXhlY3V0aW9uIHN0YXR1cy5cIildLFxuXHRcdFx0ZGVmYXVsdDogJ3Zpc2libGUnLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmNlbGxFeGVjdXRpb25UaW1lVmVyYm9zaXR5XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbEV4ZWN1dGlvblRpbWVWZXJib3NpdHkuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHRoZSB2ZXJib3NpdHkgb2YgdGhlIGNlbGwgZXhlY3V0aW9uIHRpbWUgaW4gdGhlIGNlbGwgc3RhdHVzIGJhci5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZGVmYXVsdCcsICd2ZXJib3NlJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY2VsbEV4ZWN1dGlvblRpbWVWZXJib3NpdHkuZGVmYXVsdC5kZXNjcmlwdGlvbicsIFwiVGhlIGNlbGwgZXhlY3V0aW9uIGR1cmF0aW9uIGlzIHZpc2libGUsIHdpdGggYWR2YW5jZWQgaW5mb3JtYXRpb24gaW4gdGhlIGhvdmVyIHRvb2x0aXAuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxFeGVjdXRpb25UaW1lVmVyYm9zaXR5LnZlcmJvc2UuZGVzY3JpcHRpb24nLCBcIlRoZSBjZWxsIGxhc3QgZXhlY3V0aW9uIHRpbWVzdGFtcCBhbmQgZHVyYXRpb24gYXJlIHZpc2libGUsIHdpdGggYWR2YW5jZWQgaW5mb3JtYXRpb24gaW4gdGhlIGhvdmVyIHRvb2x0aXAuXCIpXSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy50ZXh0RGlmZkVkaXRvclByZXZpZXddOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5kaWZmLmVuYWJsZVByZXZpZXcuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdG8gdXNlIHRoZSBlbmhhbmNlZCB0ZXh0IGRpZmYgZWRpdG9yIGZvciBub3RlYm9vay5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmRpZmZPdmVydmlld1J1bGVyXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5lbmFibGVPdmVydmlld1J1bGVyLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRvIHJlbmRlciB0aGUgb3ZlcnZpZXcgcnVsZXIgaW4gdGhlIGRpZmYgZWRpdG9yIGZvciBub3RlYm9vay5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jZWxsVG9vbGJhclZpc2liaWxpdHldOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNlbGxUb29sYmFyVmlzaWJpbGl0eS5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0aGUgY2VsbCB0b29sYmFyIHNob3VsZCBhcHBlYXIgb24gaG92ZXIgb3IgY2xpY2suXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2hvdmVyJywgJ2NsaWNrJ10sXG5cdFx0XHRkZWZhdWx0OiAnY2xpY2snLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnVuZG9SZWRvUGVyQ2VsbF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnVuZG9SZWRvUGVyQ2VsbC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0byB1c2Ugc2VwYXJhdGUgdW5kby9yZWRvIHN0YWNrIGZvciBlYWNoIGNlbGwuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jb21wYWN0Vmlld106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmNvbXBhY3RWaWV3LmRlc2NyaXB0aW9uJywgXCJDb250cm9sIHdoZXRoZXIgdGhlIG5vdGVib29rIGVkaXRvciBzaG91bGQgYmUgcmVuZGVyZWQgaW4gYSBjb21wYWN0IGZvcm0uIEZvciBleGFtcGxlLCB3aGVuIHR1cm5lZCBvbiwgaXQgd2lsbCBkZWNyZWFzZSB0aGUgbGVmdCBtYXJnaW4gd2lkdGguXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5mb2N1c0luZGljYXRvcl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmZvY3VzSW5kaWNhdG9yLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGVyZSB0aGUgZm9jdXMgaW5kaWNhdG9yIGlzIHJlbmRlcmVkLCBlaXRoZXIgYWxvbmcgdGhlIGNlbGwgYm9yZGVycyBvciBvbiB0aGUgbGVmdCBndXR0ZXIuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2JvcmRlcicsICdndXR0ZXInXSxcblx0XHRcdGRlZmF1bHQ6ICdndXR0ZXInLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmluc2VydFRvb2xiYXJMb2NhdGlvbl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmluc2VydFRvb2xiYXJQb3NpdGlvbi5kZXNjcmlwdGlvbicsIFwiQ29udHJvbCB3aGVyZSB0aGUgaW5zZXJ0IGNlbGwgYWN0aW9ucyBzaG91bGQgYXBwZWFyLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydiZXR3ZWVuQ2VsbHMnLCAnbm90ZWJvb2tUb29sYmFyJywgJ2JvdGgnLCAnaGlkZGVuJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnaW5zZXJ0VG9vbGJhckxvY2F0aW9uLmJldHdlZW5DZWxscycsIFwiQSB0b29sYmFyIHRoYXQgYXBwZWFycyBvbiBob3ZlciBiZXR3ZWVuIGNlbGxzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdpbnNlcnRUb29sYmFyTG9jYXRpb24ubm90ZWJvb2tUb29sYmFyJywgXCJUaGUgdG9vbGJhciBhdCB0aGUgdG9wIG9mIHRoZSBub3RlYm9vayBlZGl0b3IuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2luc2VydFRvb2xiYXJMb2NhdGlvbi5ib3RoJywgXCJCb3RoIHRvb2xiYXJzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdpbnNlcnRUb29sYmFyTG9jYXRpb24uaGlkZGVuJywgXCJUaGUgaW5zZXJ0IGFjdGlvbnMgZG9uJ3QgYXBwZWFyIGFueXdoZXJlLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnYm90aCcsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZ2xvYmFsVG9vbGJhcl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmdsb2JhbFRvb2xiYXIuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciB0byByZW5kZXIgYSBnbG9iYWwgdG9vbGJhciBpbnNpZGUgdGhlIG5vdGVib29rIGVkaXRvci5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnN0aWNreVNjcm9sbEVuYWJsZWRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5zdGlja3lTY3JvbGxFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJFeHBlcmltZW50YWwuIENvbnRyb2wgd2hldGhlciB0byByZW5kZXIgbm90ZWJvb2sgU3RpY2t5IFNjcm9sbCBoZWFkZXJzIGluIHRoZSBub3RlYm9vayBlZGl0b3IuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuc3RpY2t5U2Nyb2xsTW9kZV06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnN0aWNreVNjcm9sbE1vZGUuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciBuZXN0ZWQgc3RpY2t5IGxpbmVzIGFwcGVhciB0byBzdGFjayBmbGF0IG9yIGluZGVudGVkLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydmbGF0JywgJ2luZGVudGVkJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc3RpY2t5U2Nyb2xsTW9kZS5mbGF0JywgXCJOZXN0ZWQgc3RpY2t5IGxpbmVzIGFwcGVhciBmbGF0LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zdGlja3lTY3JvbGxNb2RlLmluZGVudGVkJywgXCJOZXN0ZWQgc3RpY2t5IGxpbmVzIGFwcGVhciBpbmRlbnRlZC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2luZGVudGVkJyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRPdXRwdXRCdXR0b25dOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24uZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciBvdXRwdXRzIGFjdGlvbiBzaG91bGQgYmUgcmVuZGVyZWQgaW4gdGhlIG91dHB1dCB0b29sYmFyLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdC8vIFtOb3RlYm9va1NldHRpbmcub3Blbk91dHB1dEluUHJldmlld0VkaXRvcl06IHtcblx0XHQvLyBcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLm91dHB1dC5vcGVuSW5QcmV2aWV3RWRpdG9yLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIG9yIG5vdCB0aGUgYWN0aW9uIHRvIG9wZW4gYSBjZWxsIG91dHB1dCBpbiBhIHByZXZpZXcgZWRpdG9yIGlzIGVuYWJsZWQuIFRoaXMgYWN0aW9uIGNhbiBiZSB1c2VkIHZpYSB0aGUgY2VsbCBvdXRwdXQgbWVudS5cIiksXG5cdFx0Ly8gXHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0Ly8gXHRkZWZhdWx0OiBmYWxzZSxcblx0XHQvLyBcdHRhZ3M6IFsncHJldmlldyddXG5cdFx0Ly8gfSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLnNob3dGb2xkaW5nQ29udHJvbHNdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5zaG93Rm9sZGluZ0NvbnRyb2xzLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGVuIHRoZSBNYXJrZG93biBoZWFkZXIgZm9sZGluZyBhcnJvdyBpcyBzaG93bi5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWx3YXlzJywgJ25ldmVyJywgJ21vdXNlb3ZlciddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dGb2xkaW5nQ29udHJvbHMuYWx3YXlzJywgXCJUaGUgZm9sZGluZyBjb250cm9scyBhcmUgYWx3YXlzIHZpc2libGUuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dGb2xkaW5nQ29udHJvbHMubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIGZvbGRpbmcgY29udHJvbHMgYW5kIHJlZHVjZSB0aGUgZ3V0dGVyIHNpemUuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dGb2xkaW5nQ29udHJvbHMubW91c2VvdmVyJywgXCJUaGUgZm9sZGluZyBjb250cm9scyBhcmUgdmlzaWJsZSBvbmx5IG9uIG1vdXNlb3Zlci5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ21vdXNlb3ZlcicsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZHJhZ0FuZERyb3BFbmFibGVkXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZHJhZ0FuZERyb3AuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciB0aGUgbm90ZWJvb2sgZWRpdG9yIHNob3VsZCBhbGxvdyBtb3ZpbmcgY2VsbHMgdGhyb3VnaCBkcmFnIGFuZCBkcm9wLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkUnVuQnV0dG9uXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY29uc29saWRhdGVkUnVuQnV0dG9uLmRlc2NyaXB0aW9uJywgXCJDb250cm9sIHdoZXRoZXIgZXh0cmEgYWN0aW9ucyBhcmUgc2hvd24gaW4gYSBkcm9wZG93biBuZXh0IHRvIHRoZSBydW4gYnV0dG9uLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmdsb2JhbFRvb2xiYXJTaG93TGFiZWxdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5nbG9iYWxUb29sYmFyU2hvd0xhYmVsJywgXCJDb250cm9sIHdoZXRoZXIgdGhlIGFjdGlvbnMgb24gdGhlIG5vdGVib29rIHRvb2xiYXIgc2hvdWxkIHJlbmRlciBsYWJlbCBvciBub3QuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICduZXZlcicsICdkeW5hbWljJ10sXG5cdFx0XHRkZWZhdWx0OiAnYWx3YXlzJyxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy50ZXh0T3V0cHV0TGluZUxpbWl0XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay50ZXh0T3V0cHV0TGluZUxpbWl0JywgXCJDb250cm9scyBob3cgbWFueSBsaW5lcyBvZiB0ZXh0IGFyZSBkaXNwbGF5ZWQgaW4gYSB0ZXh0IG91dHB1dC4gSWYgezB9IGlzIGVuYWJsZWQsIHRoaXMgc2V0dGluZyBpcyB1c2VkIHRvIGRldGVybWluZSB0aGUgc2Nyb2xsIGhlaWdodCBvZiB0aGUgb3V0cHV0LlwiLCAnYCNub3RlYm9vay5vdXRwdXQuc2Nyb2xsaW5nI2AnKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMzAsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0JywgJ25vdGVib29rT3V0cHV0TGF5b3V0J10sXG5cdFx0XHRtaW5pbXVtOiAxLFxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5MaW5raWZ5T3V0cHV0RmlsZVBhdGhzXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZGlzYWJsZU91dHB1dEZpbGVQYXRoTGlua3MnLCBcIkNvbnRyb2wgd2hldGhlciB0byBkaXNhYmxlIGZpbGVwYXRoIGxpbmtzIGluIHRoZSBvdXRwdXQgb2Ygbm90ZWJvb2sgY2VsbHMuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tPdXRwdXRMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5taW5pbWFsRXJyb3JSZW5kZXJpbmddOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5taW5pbWFsRXJyb3JSZW5kZXJpbmcnLCBcIkNvbnRyb2wgd2hldGhlciB0byByZW5kZXIgZXJyb3Igb3V0cHV0IGluIGEgbWluaW1hbCBzdHlsZS5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tPdXRwdXRMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5tYXJrdXBGb250U2l6ZV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2subWFya3VwLmZvbnRTaXplJywgXCJDb250cm9scyB0aGUgZm9udCBzaXplIGluIHBpeGVscyBvZiByZW5kZXJlZCBtYXJrdXAgaW4gbm90ZWJvb2tzLiBXaGVuIHNldCB0byB7MH0sIDEyMCUgb2YgezF9IGlzIHVzZWQuXCIsICdgMGAnLCAnYCNlZGl0b3IuZm9udFNpemUjYCcpLFxuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAwLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm1hcmtkb3duTGluZUhlaWdodF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2subWFya2Rvd24ubGluZUhlaWdodCcsIFwiQ29udHJvbHMgdGhlIGxpbmUgaGVpZ2h0IGluIHBpeGVscyBvZiBtYXJrZG93biBjZWxscyBpbiBub3RlYm9va3MuIFdoZW4gc2V0IHRvIHswfSwgezF9IHdpbGwgYmUgdXNlZFwiLCAnYDBgJywgJ2Bub3JtYWxgJyksXG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuY2VsbEVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9uc106IGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9uU2NoZW1hLFxuXHRcdFtOb3RlYm9va1NldHRpbmcuaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxsc106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suaW50ZXJhY3RpdmVXaW5kb3cuY29sbGFwc2VDb2RlQ2VsbHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY29kZSBjZWxscyBpbiB0aGUgaW50ZXJhY3RpdmUgd2luZG93IGFyZSBjb2xsYXBzZWQgYnkgZGVmYXVsdC5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWx3YXlzJywgJ25ldmVyJywgJ2Zyb21FZGl0b3InXSxcblx0XHRcdGRlZmF1bHQ6ICdmcm9tRWRpdG9yJ1xuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRwdXRMaW5lSGVpZ2h0XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5vdXRwdXRMaW5lSGVpZ2h0JywgXCJMaW5lIGhlaWdodCBvZiB0aGUgb3V0cHV0IHRleHQgd2l0aGluIG5vdGVib29rIGNlbGxzLlxcbiAtIFdoZW4gc2V0IHRvIDAsIGVkaXRvciBsaW5lIGhlaWdodCBpcyB1c2VkLlxcbiAtIFZhbHVlcyBiZXR3ZWVuIDAgYW5kIDggd2lsbCBiZSB1c2VkIGFzIGEgbXVsdGlwbGllciB3aXRoIHRoZSBmb250IHNpemUuXFxuIC0gVmFsdWVzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byA4IHdpbGwgYmUgdXNlZCBhcyBlZmZlY3RpdmUgdmFsdWVzLlwiKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnLCAnbm90ZWJvb2tPdXRwdXRMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRwdXRGb250U2l6ZV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0Rm9udFNpemUnLCBcIkZvbnQgc2l6ZSBmb3IgdGhlIG91dHB1dCB0ZXh0IHdpdGhpbiBub3RlYm9vayBjZWxscy4gV2hlbiBzZXQgdG8gMCwgezB9IGlzIHVzZWQuXCIsICdgI2VkaXRvci5mb250U2l6ZSNgJyksXG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0JywgJ25vdGVib29rT3V0cHV0TGF5b3V0J11cblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcub3V0cHV0Rm9udEZhbWlseV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0Rm9udEZhbWlseScsIFwiVGhlIGZvbnQgZmFtaWx5IG9mIHRoZSBvdXRwdXQgdGV4dCB3aXRoaW4gbm90ZWJvb2sgY2VsbHMuIFdoZW4gc2V0IHRvIGVtcHR5LCB0aGUgezB9IGlzIHVzZWQuXCIsICdgI2VkaXRvci5mb250RmFtaWx5I2AnKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCcsICdub3RlYm9va091dHB1dExheW91dCddXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm91dHB1dFNjcm9sbGluZ106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2sub3V0cHV0U2Nyb2xsaW5nJywgXCJJbml0aWFsbHkgcmVuZGVyIG5vdGVib29rIG91dHB1dHMgaW4gYSBzY3JvbGxhYmxlIHJlZ2lvbiB3aGVuIGxvbmdlciB0aGFuIHRoZSBsaW1pdC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0JywgJ25vdGVib29rT3V0cHV0TGF5b3V0J10sXG5cdFx0XHRkZWZhdWx0OiB0eXBlb2YgcHJvZHVjdC5xdWFsaXR5ID09PSAnc3RyaW5nJyAmJiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnIC8vIG9ubHkgZW5hYmxlIGFzIGRlZmF1bHQgaW4gaW5zaWRlcnNcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcub3V0cHV0V29yZFdyYXBdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLm91dHB1dFdvcmRXcmFwJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBsaW5lcyBpbiBvdXRwdXQgc2hvdWxkIHdyYXAuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCcsICdub3RlYm9va091dHB1dExheW91dCddLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZGVmYXVsdEZvcm1hdHRlcl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rRm9ybWF0dGVyLmRlZmF1bHQnLCBcIkRlZmluZXMgYSBkZWZhdWx0IG5vdGVib29rIGZvcm1hdHRlciB3aGljaCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYWxsIG90aGVyIGZvcm1hdHRlciBzZXR0aW5ncy4gTXVzdCBiZSB0aGUgaWRlbnRpZmllciBvZiBhbiBleHRlbnNpb24gY29udHJpYnV0aW5nIGEgZm9ybWF0dGVyLlwiKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHRlbnVtOiBEZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbklkcyxcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBEZWZhdWx0Rm9ybWF0dGVyLmV4dGVuc2lvbkl0ZW1MYWJlbHMsXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IERlZmF1bHRGb3JtYXR0ZXIuZXh0ZW5zaW9uRGVzY3JpcHRpb25zXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmZvcm1hdE9uU2F2ZV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZm9ybWF0T25TYXZlJywgXCJGb3JtYXQgYSBub3RlYm9vayBvbiBzYXZlLiBBIGZvcm1hdHRlciBtdXN0IGJlIGF2YWlsYWJsZSBhbmQgdGhlIGVkaXRvciBtdXN0IG5vdCBiZSBzaHV0dGluZyBkb3duLiBXaGVuIHswfSBpcyBzZXQgdG8gYGFmdGVyRGVsYXlgLCB0aGUgZmlsZSB3aWxsIG9ubHkgYmUgZm9ybWF0dGVkIHdoZW4gc2F2ZWQgZXhwbGljaXRseS5cIiwgJ2AjZmlsZXMuYXV0b1NhdmUjYCcpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuaW5zZXJ0RmluYWxOZXdsaW5lXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5pbnNlcnRGaW5hbE5ld2xpbmUnLCBcIldoZW4gZW5hYmxlZCwgaW5zZXJ0IGEgZmluYWwgbmV3IGxpbmUgaW50byB0aGUgZW5kIG9mIGNvZGUgY2VsbHMgd2hlbiBzYXZpbmcgYSBub3RlYm9vay5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ25vdGVib29rTGF5b3V0J10sXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5mb3JtYXRPbkNlbGxFeGVjdXRpb25dOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmZvcm1hdE9uQ2VsbEV4ZWN1dGlvbicsIFwiRm9ybWF0IGEgbm90ZWJvb2sgY2VsbCB1cG9uIGV4ZWN1dGlvbi4gQSBmb3JtYXR0ZXIgbXVzdCBiZSBhdmFpbGFibGUuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuY29uZmlybURlbGV0ZVJ1bm5pbmdDZWxsXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jb25maXJtRGVsZXRlUnVubmluZ0NlbGwnLCBcIkNvbnRyb2wgd2hldGhlciBhIGNvbmZpcm1hdGlvbiBwcm9tcHQgaXMgcmVxdWlyZWQgdG8gZGVsZXRlIGEgcnVubmluZyBjZWxsLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZmluZEZpbHRlcnNdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLmZpbmRGaWx0ZXJzJywgXCJDdXN0b21pemUgdGhlIEZpbmQgV2lkZ2V0IGJlaGF2aW9yIGZvciBzZWFyY2hpbmcgd2l0aGluIG5vdGVib29rIGNlbGxzLiBXaGVuIGJvdGggbWFya3VwIHNvdXJjZSBhbmQgbWFya3VwIHByZXZpZXcgYXJlIGVuYWJsZWQsIHRoZSBGaW5kIFdpZGdldCB3aWxsIHNlYXJjaCBlaXRoZXIgdGhlIHNvdXJjZSBjb2RlIG9yIHByZXZpZXcgYmFzZWQgb24gdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIGNlbGwuXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG1hcmt1cFNvdXJjZToge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmt1cFByZXZpZXc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb2RlU291cmNlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29kZU91dHB1dDoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdG1hcmt1cFNvdXJjZTogdHJ1ZSxcblx0XHRcdFx0bWFya3VwUHJldmlldzogdHJ1ZSxcblx0XHRcdFx0Y29kZVNvdXJjZTogdHJ1ZSxcblx0XHRcdFx0Y29kZU91dHB1dDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHRhZ3M6IFsnbm90ZWJvb2tMYXlvdXQnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5yZW1vdGVTYXZpbmddOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnJlbW90ZVNhdmluZycsIFwiRW5hYmxlcyB0aGUgaW5jcmVtZW50YWwgc2F2aW5nIG9mIG5vdGVib29rcyBiZXR3ZWVuIHByb2Nlc3NlcyBhbmQgYWNyb3NzIFJlbW90ZSBjb25uZWN0aW9ucy4gV2hlbiBlbmFibGVkLCBvbmx5IHRoZSBjaGFuZ2VzIHRvIHRoZSBub3RlYm9vayBhcmUgc2VudCB0byB0aGUgZXh0ZW5zaW9uIGhvc3QsIGltcHJvdmluZyBwZXJmb3JtYW5jZSBmb3IgbGFyZ2Ugbm90ZWJvb2tzIGFuZCBzbG93IG5ldHdvcmsgY29ubmVjdGlvbnMuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHlwZW9mIHByb2R1Y3QucXVhbGl0eSA9PT0gJ3N0cmluZycgJiYgcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJywgLy8gb25seSBlbmFibGUgYXMgZGVmYXVsdCBpbiBpbnNpZGVyc1xuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5zY3JvbGxUb1JldmVhbENlbGxdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLnNjcm9sbGluZy5yZXZlYWxOZXh0Q2VsbE9uRXhlY3V0ZS5kZXNjcmlwdGlvbicsIFwiSG93IGZhciB0byBzY3JvbGwgd2hlbiByZXZlYWxpbmcgdGhlIG5leHQgY2VsbCB1cG9uIHJ1bm5pbmcgezB9LlwiLCAnbm90ZWJvb2suY2VsbC5leGVjdXRlQW5kU2VsZWN0QmVsb3cnKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydmdWxsQ2VsbCcsICdmaXJzdExpbmUnLCAnbm9uZSddLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suc2Nyb2xsaW5nLnJldmVhbE5leHRDZWxsT25FeGVjdXRlLmZ1bGxDZWxsLmRlc2NyaXB0aW9uJywgJ1Njcm9sbCB0byBmdWxseSByZXZlYWwgdGhlIG5leHQgY2VsbC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zY3JvbGxpbmcucmV2ZWFsTmV4dENlbGxPbkV4ZWN1dGUuZmlyc3RMaW5lLmRlc2NyaXB0aW9uJywgJ1Njcm9sbCB0byByZXZlYWwgdGhlIGZpcnN0IGxpbmUgb2YgdGhlIG5leHQgY2VsbC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5zY3JvbGxpbmcucmV2ZWFsTmV4dENlbGxPbkV4ZWN1dGUubm9uZS5kZXNjcmlwdGlvbicsICdEbyBub3Qgc2Nyb2xsLicpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdmdWxsQ2VsbCdcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuY2VsbEdlbmVyYXRlXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsR2VuZXJhdGUnLCBcIkVuYWJsZSBleHBlcmltZW50YWwgZ2VuZXJhdGUgYWN0aW9uIHRvIGNyZWF0ZSBjb2RlIGNlbGwgd2l0aCBpbmxpbmUgY2hhdCBlbmFibGVkLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcubm90ZWJvb2tWYXJpYWJsZXNWaWV3XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5WYXJpYWJsZXNWaWV3LmRlc2NyaXB0aW9uJywgXCJFbmFibGUgdGhlIGV4cGVyaW1lbnRhbCBub3RlYm9vayB2YXJpYWJsZXMgdmlldyB3aXRoaW4gdGhlIGRlYnVnIHBhbmVsLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm5vdGVib29rSW5saW5lVmFsdWVzXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5pbmxpbmVWYWx1ZXMuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2wgd2hldGhlciB0byBzaG93IGlubGluZSB2YWx1ZXMgd2l0aGluIG5vdGVib29rIGNvZGUgY2VsbHMgYWZ0ZXIgY2VsbCBleGVjdXRpb24uIFZhbHVlcyB3aWxsIHJlbWFpbiB1bnRpbCB0aGUgY2VsbCBpcyBlZGl0ZWQsIHJlLWV4ZWN1dGVkLCBvciBleHBsaWNpdGx5IGNsZWFyZWQgdmlhIHRoZSBDbGVhciBBbGwgT3V0cHV0cyB0b29sYmFyIGJ1dHRvbiBvciB0aGUgYE5vdGVib29rOiBDbGVhciBJbmxpbmUgVmFsdWVzYCBjb21tYW5kLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvbicsICdhdXRvJywgJ29mZiddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ25vdGVib29rLmlubGluZVZhbHVlcy5vbicsIFwiQWx3YXlzIHNob3cgaW5saW5lIHZhbHVlcywgd2l0aCBhIHJlZ2V4IGZhbGxiYWNrIGlmIG5vIGlubGluZSB2YWx1ZSBwcm92aWRlciBpcyByZWdpc3RlcmVkLiBOb3RlOiBUaGVyZSBtYXkgYmUgYSBwZXJmb3JtYW5jZSBpbXBhY3QgaW4gbGFyZ2VyIGNlbGxzIGlmIHRoZSBmYWxsYmFjayBpcyB1c2VkLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdub3RlYm9vay5pbmxpbmVWYWx1ZXMuYXV0bycsIFwiU2hvdyBpbmxpbmUgdmFsdWVzIG9ubHkgd2hlbiBhbiBpbmxpbmUgdmFsdWUgcHJvdmlkZXIgaXMgcmVnaXN0ZXJlZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suaW5saW5lVmFsdWVzLm9mZicsIFwiTmV2ZXIgc2hvdyBpbmxpbmUgdmFsdWVzLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnb2ZmJ1xuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5jZWxsRmFpbHVyZURpYWdub3N0aWNzXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jZWxsRmFpbHVyZURpYWdub3N0aWNzJywgXCJTaG93IGF2YWlsYWJsZSBkaWFnbm9zdGljcyBmb3IgY2VsbCBmYWlsdXJlcy5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm91dHB1dEJhY2t1cFNpemVMaW1pdF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suYmFja3VwLnNpemVMaW1pdCcsIFwiVGhlIGxpbWl0IG9mIG5vdGVib29rIG91dHB1dCBzaXplIGluIGtpbG9ieXRlcyAoS0IpIHdoZXJlIG5vdGVib29rIGZpbGVzIHdpbGwgbm8gbG9uZ2VyIGJlIGJhY2tlZCB1cCBmb3IgaG90IHJlbG9hZC4gVXNlIDAgZm9yIHVubGltaXRlZC5cIiksXG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDEwMDAwXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm11bHRpQ3Vyc29yXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgXCJFeHBlcmltZW50YWwuIEVuYWJsZXMgYSBsaW1pdGVkIHNldCBvZiBtdWx0aSBjdXJzb3IgY29udHJvbHMgYWNyb3NzIG11bHRpcGxlIGNlbGxzIGluIHRoZSBub3RlYm9vayBlZGl0b3IuIEN1cnJlbnRseSBzdXBwb3J0ZWQgYXJlIGNvcmUgZWRpdG9yIGFjdGlvbnMgKHR5cGluZy9jdXQvY29weS9wYXN0ZS9jb21wb3NpdGlvbikgYW5kIGEgbGltaXRlZCBzdWJzZXQgb2YgZWRpdG9yIGNvbW1hbmRzLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm1hcmt1cEZvbnRGYW1pbHldOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ25vdGVib29rLm1hcmt1cC5mb250RmFtaWx5JywgXCJDb250cm9scyB0aGUgZm9udCBmYW1pbHkgb2YgcmVuZGVyZWQgbWFya3VwIGluIG5vdGVib29rcy4gV2hlbiBsZWZ0IGJsYW5rLCB0aGlzIHdpbGwgZmFsbCBiYWNrIHRvIHRoZSBkZWZhdWx0IHdvcmtiZW5jaCBmb250IGZhbWlseS5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0dGFnczogWydub3RlYm9va0xheW91dCddXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQXNCLFlBQVksaUJBQWlCLGVBQWU7QUFDbEUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUE2Qix3QkFBd0I7QUFDckQsU0FBb0MseUJBQXlCO0FBQzdELFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUF3RTtBQUNqRixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaUQ7QUFDMUQsU0FBUyxjQUFjLHFCQUE4RSxnQkFBZ0Isc0NBQXNDO0FBQzNKLFNBQW9ELHdCQUF3QjtBQUU1RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUF1RDtBQUNoRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFVBQVUsU0FBdUMsbUNBQW1DLGlCQUFxQyx5QkFBeUIsMkJBQTJCO0FBQ3RMLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNB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
