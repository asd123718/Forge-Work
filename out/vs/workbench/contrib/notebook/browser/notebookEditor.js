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
import * as DOM from "../../../../base/browser/dom.js";
import { toAction } from "../../../../base/common/actions.js";
import { timeout } from "../../../../base/common/async.js";
import { isWeb } from "../../../../base/common/platform.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ByteSize, FileOperationResult, IFileService, TooLargeFileOperationError } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorPaneSelectionChangeReason, EditorPaneSelectionCompareResult, EditorResourceAccessor, createEditorOpenError, createTooLargeFileError, isEditorOpenError } from "../../../common/editor.js";
import { SELECT_KERNEL_ID } from "./controller/coreActions.js";
import { INotebookEditorService } from "./services/notebookEditorService.js";
import { NotebooKernelActionViewItem } from "./viewParts/notebookKernelView.js";
import { CellKind, NOTEBOOK_EDITOR_ID, NotebookWorkingCopyTypeIdentifier } from "../common/notebookCommon.js";
import { NotebookEditorInput } from "../common/notebookEditorInput.js";
import { NotebookPerfMarks } from "../common/notebookPerformance.js";
import { GroupsOrder, IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { InstallRecommendedExtensionAction } from "../../extensions/browser/extensionsActions.js";
import { INotebookService } from "../common/notebookService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { EnablementState } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IWorkingCopyBackupService } from "../../../services/workingCopy/common/workingCopyBackup.js";
import { streamToBuffer } from "../../../../base/common/buffer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
const NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY = "NotebookEditorViewState";
const NOTEBOOK_WEB_HOST_OPEN_CONFIRMED_KEY = "notebook.webHost.openConfirmed";
const confirmedWebHostNotebooks = /* @__PURE__ */ new Set();
let NotebookEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, _instantiationService, _storageService, _editorService, _editorGroupService, _notebookWidgetService, _contextKeyService, _fileService, configurationService, _editorProgressService, _notebookService, _extensionsWorkbenchService, _workingCopyBackupService, logService, _preferencesService, _dialogService, _environmentService) {
    super(NotebookEditor.ID, group, telemetryService, themeService, _storageService);
    this._instantiationService = _instantiationService;
    this._storageService = _storageService;
    this._editorService = _editorService;
    this._editorGroupService = _editorGroupService;
    this._notebookWidgetService = _notebookWidgetService;
    this._contextKeyService = _contextKeyService;
    this._fileService = _fileService;
    this._editorProgressService = _editorProgressService;
    this._notebookService = _notebookService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._workingCopyBackupService = _workingCopyBackupService;
    this.logService = logService;
    this._preferencesService = _preferencesService;
    this._dialogService = _dialogService;
    this._environmentService = _environmentService;
    this._groupListener = this._register(new DisposableStore());
    this._widgetDisposableStore = this._register(new DisposableStore());
    this._widget = { value: void 0 };
    this._inputListener = this._register(new MutableDisposable());
    // override onDidFocus and onDidBlur to be based on the NotebookEditorWidget element
    this._onDidFocusWidget = this._register(new Emitter());
    this._onDidBlurWidget = this._register(new Emitter());
    this._onDidChangeModel = this._register(new Emitter());
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeScroll = this._register(new Emitter());
    this.onDidChangeScroll = this._onDidChangeScroll.event;
    this._editorMemento = this.getEditorMemento(_editorGroupService, configurationService, NOTEBOOK_EDITOR_VIEW_STATE_PREFERENCE_KEY);
    this._register(this._fileService.onDidChangeFileSystemProviderCapabilities((e) => this._onDidChangeFileSystemProvider(e.scheme)));
    this._register(this._fileService.onDidChangeFileSystemProviderRegistrations((e) => this._onDidChangeFileSystemProvider(e.scheme)));
  }
  get onDidFocus() {
    return this._onDidFocusWidget.event;
  }
  get onDidBlur() {
    return this._onDidBlurWidget.event;
  }
  _onDidChangeFileSystemProvider(scheme) {
    if (this.input instanceof NotebookEditorInput && this.input.resource?.scheme === scheme) {
      this._updateReadonly(this.input);
    }
  }
  _onDidChangeInputCapabilities(input) {
    if (this.input === input) {
      this._updateReadonly(input);
    }
  }
  _updateReadonly(input) {
    this._widget.value?.setOptions({ isReadOnly: !!input.isReadonly() });
  }
  get textModel() {
    return this._widget.value?.textModel;
  }
  get minimumWidth() {
    return 220;
  }
  get maximumWidth() {
    return Number.POSITIVE_INFINITY;
  }
  // these setters need to exist because this extends from EditorPane
  set minimumWidth(value) {
  }
  set maximumWidth(value) {
  }
  //#region Editor Core
  get scopedContextKeyService() {
    return this._widget.value?.scopedContextKeyService;
  }
  createEditor(parent) {
    this._rootElement = DOM.append(parent, DOM.$(".notebook-editor"));
    this._rootElement.id = `notebook-editor-element-${generateUuid()}`;
  }
  getActionViewItem(action, options) {
    if (action.id === SELECT_KERNEL_ID) {
      return this._register(this._instantiationService.createInstance(NotebooKernelActionViewItem, action, this, options));
    }
    return void 0;
  }
  getControl() {
    return this._widget.value;
  }
  setVisible(visible) {
    super.setVisible(visible);
    if (!visible) {
      this._widget.value?.onWillHide();
    }
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    this._groupListener.clear();
    this._groupListener.add(this.group.onWillCloseEditor((e) => this._saveEditorViewState(e.editor)));
    this._groupListener.add(this.group.onDidModelChange(() => {
      if (this._editorGroupService.activeGroup !== this.group) {
        this._widget?.value?.updateEditorFocus();
      }
    }));
    if (!visible) {
      this._saveEditorViewState(this.input);
      if (this.input && this._widget.value) {
        this._widget.value.onWillHide();
      }
    }
  }
  focus() {
    super.focus();
    this._widget.value?.focus();
  }
  hasFocus() {
    const value = this._widget.value;
    if (!value) {
      return false;
    }
    return !!value && DOM.isAncestorOfActiveElement(value.getDomNode() || DOM.isAncestorOfActiveElement(value.getOverflowContainerDomNode()));
  }
  /**
   * When running serverless on the web (i.e. in the browser with no remote server
   * connected), prompt the user to confirm that they really want to open the notebook.
   * The confirmation is only shown the first time a given notebook is opened in the
   * session (so switching back to an already-open notebook does not re-prompt), and the
   * choice can be remembered for the whole workspace via a "Don't ask again" checkbox.
   */
  async _confirmOpenOnWebHost(input) {
    const isServerlessWeb = isWeb && !this._environmentService.remoteAuthority;
    if (!isServerlessWeb) {
      return;
    }
    if (this._storageService.getBoolean(NOTEBOOK_WEB_HOST_OPEN_CONFIRMED_KEY, StorageScope.WORKSPACE, false)) {
      return;
    }
    const resourceKey = input.resource.toString();
    if (confirmedWebHostNotebooks.has(resourceKey)) {
      return;
    }
    const { confirmed, checkboxChecked } = await this._dialogService.confirm({
      type: "warning",
      message: localize("notebook.webHost.confirm", "Do you trust the authors of this notebook?"),
      detail: localize("notebook.webHost.detail", "Notebooks can run code that has access to your browser session, including any signed-in accounts. Only open notebooks from authors you trust."),
      primaryButton: localize("notebook.webHost.open", "Open Notebook"),
      checkbox: { label: localize("notebook.webHost.remember", "Don't ask me again") }
    });
    if (!confirmed) {
      throw createEditorOpenError(localize("notebook.webHost.declined", "The notebook was not opened because its authors are not trusted."), [
        toAction({
          id: "workbench.notebook.action.openAsText",
          label: localize("notebookOpenAsText", "Open As Text"),
          run: async () => {
            this._editorService.openEditor({ resource: input.resource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true } });
          }
        })
      ], { forceMessage: true });
    }
    confirmedWebHostNotebooks.add(resourceKey);
    if (checkboxChecked) {
      this._storageService.store(NOTEBOOK_WEB_HOST_OPEN_CONFIRMED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  async setInput(input, options, context, token, noRetry) {
    await this._confirmOpenOnWebHost(input);
    try {
      let perfMarksCaptured = false;
      const fileOpenMonitor = timeout(1e4);
      fileOpenMonitor.then(() => {
        perfMarksCaptured = true;
        this._handlePerfMark(perf, input);
      });
      const perf = new NotebookPerfMarks();
      perf.mark("startTime");
      this._inputListener.value = input.onDidChangeCapabilities(() => this._onDidChangeInputCapabilities(input));
      this._widgetDisposableStore.clear();
      this._widget.value?.onWillHide();
      this._widget = this._instantiationService.invokeFunction(this._notebookWidgetService.retrieveWidget, this.group.id, input, void 0, this._pagePosition?.dimension, this.window);
      if (this._rootElement && this._widget.value.getDomNode()) {
        this._rootElement.setAttribute("aria-flowto", this._widget.value.getDomNode().id || "");
        DOM.setParentFlowTo(this._widget.value.getDomNode(), this._rootElement);
      }
      this._widgetDisposableStore.add(this._widget.value.onDidChangeModel(() => this._onDidChangeModel.fire()));
      this._widgetDisposableStore.add(this._widget.value.onDidChangeActiveCell(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.USER })));
      if (this._pagePosition) {
        this._widget.value.layout(this._pagePosition.dimension, this._rootElement, this._pagePosition.position);
      }
      await super.setInput(input, options, context, token);
      const model = await input.resolve(options, perf);
      perf.mark("inputLoaded");
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (!this._widget.value) {
        if (noRetry) {
          return void 0;
        }
        return this.setInput(input, options, context, token, true);
      }
      if (model === null) {
        const knownProvider = this._notebookService.getViewTypeProvider(input.viewType);
        if (!knownProvider) {
          throw new Error(localize("fail.noEditor", "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType));
        }
        await this._extensionsWorkbenchService.whenInitialized;
        const extensionInfo = this._extensionsWorkbenchService.local.find((e) => e.identifier.id === knownProvider);
        throw createEditorOpenError(new Error(localize("fail.noEditor.extensionMissing", "Cannot open resource with notebook editor type '{0}', please check if you have the right extension installed and enabled.", input.viewType)), [
          toAction({
            id: "workbench.notebook.action.installOrEnableMissing",
            label: extensionInfo ? localize("notebookOpenEnableMissingViewType", "Enable extension for '{0}'", input.viewType) : localize("notebookOpenInstallMissingViewType", "Install extension for '{0}'", input.viewType),
            run: async () => {
              const d = this._notebookService.onAddViewType((viewType) => {
                if (viewType === input.viewType) {
                  this._editorService.openEditor({ resource: input.resource });
                  d.dispose();
                }
              });
              const extensionInfo2 = this._extensionsWorkbenchService.local.find((e) => e.identifier.id === knownProvider);
              try {
                if (extensionInfo2) {
                  await this._extensionsWorkbenchService.setEnablement(extensionInfo2, extensionInfo2.enablementState === EnablementState.DisabledWorkspace ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
                } else {
                  await this._instantiationService.createInstance(InstallRecommendedExtensionAction, knownProvider).run();
                }
              } catch (ex) {
                this.logService.error(`Failed to install or enable extension ${knownProvider}`, ex);
                d.dispose();
              }
            }
          }),
          toAction({
            id: "workbench.notebook.action.openAsText",
            label: localize("notebookOpenAsText", "Open As Text"),
            run: async () => {
              const backup = await this._workingCopyBackupService.resolve({ resource: input.resource, typeId: NotebookWorkingCopyTypeIdentifier.create(input.viewType) });
              if (backup) {
                const contents = await streamToBuffer(backup.value);
                this._editorService.openEditor({ resource: void 0, contents: contents.toString() });
              } else {
                this._editorService.openEditor({ resource: input.resource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id, pinned: true } });
              }
            }
          })
        ], { allowDialog: true });
      }
      this._widgetDisposableStore.add(model.notebook.onDidChangeContent(() => this._onDidChangeSelection.fire({ reason: EditorPaneSelectionChangeReason.EDIT })));
      const viewState = options?.viewState ?? this._loadNotebookEditorViewState(input);
      this._widget.value.setParentContextKeyService(this._contextKeyService);
      this._widget.value.setEditorProgressService(this._editorProgressService);
      await this._widget.value.setModel(model.notebook, viewState, perf);
      const isReadOnly = !!input.isReadonly();
      await this._widget.value.setOptions({ ...options, isReadOnly });
      this._widgetDisposableStore.add(this._widget.value.onDidFocusWidget(() => this._onDidFocusWidget.fire()));
      this._widgetDisposableStore.add(this._widget.value.onDidBlurWidget(() => this._onDidBlurWidget.fire()));
      this._widgetDisposableStore.add(this._editorGroupService.createEditorDropTarget(this._widget.value.getDomNode(), {
        containsGroup: (group) => this.group.id === group.id
      }));
      this._widgetDisposableStore.add(this._widget.value.onDidScroll(() => {
        this._onDidChangeScroll.fire();
      }));
      perf.mark("editorLoaded");
      fileOpenMonitor.cancel();
      if (perfMarksCaptured) {
        return;
      }
      this._handlePerfMark(perf, input, model.notebook);
      this._onDidChangeControl.fire();
    } catch (e) {
      this.logService.warn("NotebookEditorWidget#setInput failed", e);
      if (isEditorOpenError(e)) {
        throw e;
      }
      if (e.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
        let message;
        if (e instanceof TooLargeFileOperationError) {
          message = localize("notebookTooLargeForHeapErrorWithSize", "The notebook is not displayed in the notebook editor because it is very large ({0}).", ByteSize.formatSize(e.size));
        } else {
          message = localize("notebookTooLargeForHeapErrorWithoutSize", "The notebook is not displayed in the notebook editor because it is very large.");
        }
        throw createTooLargeFileError(this.group, input, options, message, this._preferencesService);
      }
      const error = createEditorOpenError(e instanceof Error ? e : new Error(e ? e.message : ""), [
        toAction({
          id: "workbench.notebook.action.openInTextEditor",
          label: localize("notebookOpenInTextEditor", "Open in Text Editor"),
          run: async () => {
            const activeEditorPane = this._editorService.activeEditorPane;
            if (!activeEditorPane) {
              return;
            }
            const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
            if (!activeEditorResource) {
              return;
            }
            if (activeEditorResource.toString() === input.resource?.toString()) {
              return this._editorService.openEditor({
                resource: activeEditorResource,
                options: {
                  override: DEFAULT_EDITOR_ASSOCIATION.id,
                  pinned: true
                  // new file gets pinned by default
                }
              });
            }
            return;
          }
        })
      ], { allowDialog: true });
      throw error;
    }
  }
  _handlePerfMark(perf, input, notebook) {
    const perfMarks = perf.value;
    const startTime = perfMarks["startTime"];
    const extensionActivated = perfMarks["extensionActivated"];
    const inputLoaded = perfMarks["inputLoaded"];
    const webviewCommLoaded = perfMarks["webviewCommLoaded"];
    const customMarkdownLoaded = perfMarks["customMarkdownLoaded"];
    const editorLoaded = perfMarks["editorLoaded"];
    let extensionActivationTimespan = -1;
    let inputLoadingTimespan = -1;
    let webviewCommLoadingTimespan = -1;
    let customMarkdownLoadingTimespan = -1;
    let editorLoadingTimespan = -1;
    if (startTime !== void 0 && extensionActivated !== void 0) {
      extensionActivationTimespan = extensionActivated - startTime;
      if (inputLoaded !== void 0) {
        inputLoadingTimespan = inputLoaded - extensionActivated;
      }
      if (webviewCommLoaded !== void 0) {
        webviewCommLoadingTimespan = webviewCommLoaded - extensionActivated;
      }
      if (customMarkdownLoaded !== void 0) {
        customMarkdownLoadingTimespan = customMarkdownLoaded - startTime;
      }
      if (editorLoaded !== void 0) {
        editorLoadingTimespan = editorLoaded - startTime;
      }
    }
    let codeCellCount = void 0;
    let mdCellCount = void 0;
    let outputCount = void 0;
    let outputBytes = void 0;
    let codeLength = void 0;
    let markdownLength = void 0;
    let notebookStatsLoaded = void 0;
    if (notebook) {
      const stopWatch = new StopWatch();
      for (const cell of notebook.cells) {
        if (cell.cellKind === CellKind.Code) {
          codeCellCount = (codeCellCount || 0) + 1;
          codeLength = (codeLength || 0) + cell.getTextLength();
          outputCount = (outputCount || 0) + cell.outputs.length;
          outputBytes = (outputBytes || 0) + cell.outputs.reduce((prev, cur) => prev + cur.outputs.reduce((size, item) => size + item.data.byteLength, 0), 0);
        } else {
          mdCellCount = (mdCellCount || 0) + 1;
          markdownLength = (codeLength || 0) + cell.getTextLength();
        }
      }
      notebookStatsLoaded = stopWatch.elapsed();
    }
    this.logService.trace(`[NotebookEditor] open notebook perf ${notebook?.uri.toString() ?? ""} - extensionActivation: ${extensionActivationTimespan}, inputLoad: ${inputLoadingTimespan}, webviewComm: ${webviewCommLoadingTimespan}, customMarkdown: ${customMarkdownLoadingTimespan}, editorLoad: ${editorLoadingTimespan}`);
    this.telemetryService.publicLog2("notebook/editorOpenPerf", {
      scheme: input.resource.scheme,
      ext: extname(input.resource),
      viewType: input.viewType,
      extensionActivated: extensionActivationTimespan,
      inputLoaded: inputLoadingTimespan,
      webviewCommLoaded: webviewCommLoadingTimespan,
      customMarkdownLoaded: customMarkdownLoadingTimespan,
      editorLoaded: editorLoadingTimespan,
      codeCellCount,
      mdCellCount,
      outputCount,
      outputBytes,
      codeLength,
      markdownLength,
      notebookStatsLoaded
    });
  }
  clearInput() {
    this._inputListener.clear();
    if (this._widget.value) {
      this._saveEditorViewState(this.input);
      this._widget.value.onWillHide();
    }
    super.clearInput();
  }
  setOptions(options) {
    this._widget.value?.setOptions(options);
    super.setOptions(options);
  }
  saveState() {
    this._saveEditorViewState(this.input);
    super.saveState();
  }
  getViewState() {
    const input = this.input;
    if (!(input instanceof NotebookEditorInput)) {
      return void 0;
    }
    this._saveEditorViewState(input);
    return this._loadNotebookEditorViewState(input);
  }
  getSelection() {
    if (this._widget.value) {
      const activeCell = this._widget.value.getActiveCell();
      if (activeCell) {
        const cellUri = activeCell.uri;
        return new NotebookEditorSelection(cellUri, activeCell.getSelections());
      }
    }
    return void 0;
  }
  getScrollPosition() {
    const widget = this.getControl();
    if (!widget) {
      throw new Error("Notebook widget has not yet been initialized");
    }
    return {
      scrollTop: widget.scrollTop,
      scrollLeft: 0
    };
  }
  setScrollPosition(scrollPosition) {
    const editor = this.getControl();
    if (!editor) {
      throw new Error("Control has not yet been initialized");
    }
    editor.setScrollTop(scrollPosition.scrollTop);
  }
  _saveEditorViewState(input) {
    if (this._widget.value && input instanceof NotebookEditorInput) {
      if (this._widget.value.isDisposed) {
        return;
      }
      const state = this._widget.value.getEditorViewState();
      this._editorMemento.saveEditorState(this.group, input.resource, state);
    }
  }
  _loadNotebookEditorViewState(input) {
    const result = this._editorMemento.loadEditorState(this.group, input.resource);
    if (result) {
      return result;
    }
    for (const group of this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (group.activeEditorPane !== this && group.activeEditorPane instanceof NotebookEditor && group.activeEditor?.matches(input)) {
        return group.activeEditorPane._widget.value?.getEditorViewState();
      }
    }
    return;
  }
  layout(dimension, position) {
    this._rootElement.classList.toggle("mid-width", dimension.width < 1e3 && dimension.width >= 600);
    this._rootElement.classList.toggle("narrow-width", dimension.width < 600);
    this._pagePosition = { dimension, position };
    if (!this._widget.value || !(this.input instanceof NotebookEditorInput)) {
      return;
    }
    if (this.input.resource.toString() !== this.textModel?.uri.toString() && this._widget.value?.hasModel()) {
      return;
    }
    if (this.isVisible()) {
      this._widget.value.layout(dimension, this._rootElement, position);
    }
  }
  //#endregion
};
NotebookEditor.ID = NOTEBOOK_EDITOR_ID;
NotebookEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, INotebookEditorService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IFileService),
  __decorateParam(10, ITextResourceConfigurationService),
  __decorateParam(11, IEditorProgressService),
  __decorateParam(12, INotebookService),
  __decorateParam(13, IExtensionsWorkbenchService),
  __decorateParam(14, IWorkingCopyBackupService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IPreferencesService),
  __decorateParam(17, IDialogService),
  __decorateParam(18, IWorkbenchEnvironmentService)
], NotebookEditor);
class NotebookEditorSelection {
  constructor(cellUri, selections) {
    this.cellUri = cellUri;
    this.selections = selections;
  }
  compare(other) {
    if (!(other instanceof NotebookEditorSelection)) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    if (isEqual(this.cellUri, other.cellUri)) {
      return EditorPaneSelectionCompareResult.IDENTICAL;
    }
    return EditorPaneSelectionCompareResult.DIFFERENT;
  }
  restore(options) {
    const notebookOptions = {
      cellOptions: {
        resource: this.cellUri,
        options: {
          selection: this.selections[0]
        }
      }
    };
    Object.assign(notebookOptions, options);
    return notebookOptions;
  }
  log() {
    return this.cellUri.fragment;
  }
}
function isNotebookContainingCellEditor(editor, codeEditor) {
  if (editor?.getId() === NotebookEditor.ID) {
    const notebookWidget = editor.getControl();
    if (notebookWidget) {
      for (const [_, editor2] of notebookWidget.codeEditors) {
        if (editor2 === codeEditor) {
          return true;
        }
      }
    }
  }
  return false;
}
export {
  NotebookEditor,
  isNotebookContainingCellEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxub3RlYm9va0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbiwgRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElFZGl0b3JNZW1lbnRvLCBJRWRpdG9yT3BlbkNvbnRleHQsIElFZGl0b3JQYW5lLCBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uLCBJRWRpdG9yUGFuZVNlbGVjdGlvbiwgSUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudCwgSUVkaXRvclBhbmVXaXRoU2Nyb2xsaW5nLCBjcmVhdGVFZGl0b3JPcGVuRXJyb3IsIGNyZWF0ZVRvb0xhcmdlRmlsZUVycm9yLCBpc0VkaXRvck9wZW5FcnJvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNFTEVDVF9LRVJORUxfSUQgfSBmcm9tICcuL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yT3B0aW9ucywgSU5vdGVib29rRWRpdG9yUGFuZSwgSU5vdGVib29rRWRpdG9yVmlld1N0YXRlIH0gZnJvbSAnLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUJvcnJvd1ZhbHVlLCBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXaWRnZXQgfSBmcm9tICcuL25vdGVib29rRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IE5vdGVib29LZXJuZWxBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vdmlld1BhcnRzL25vdGVib29rS2VybmVsVmlldy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgTk9URUJPT0tfRURJVE9SX0lELCBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE5vdGVib29rUGVyZk1hcmtzIH0gZnJvbSAnLi4vY29tbW9uL25vdGVib29rUGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgR3JvdXBzT3JkZXIsIElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25BY3Rpb24gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgc3RyZWFtVG9CdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcblxuY29uc3QgTk9URUJPT0tfRURJVE9SX1ZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVkgPSAnTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUnO1xuY29uc3QgTk9URUJPT0tfV0VCX0hPU1RfT1BFTl9DT05GSVJNRURfS0VZID0gJ25vdGVib29rLndlYkhvc3Qub3BlbkNvbmZpcm1lZCc7XG5cbi8qKlxuICogTm90ZWJvb2sgcmVzb3VyY2VzIHRoYXQgaGF2ZSBhbHJlYWR5IGJlZW4gY29uZmlybWVkIGZvciBvcGVuaW5nIGluIGEgc2VydmVybGVzcyB3ZWJcbiAqIHNlc3Npb24uIFRoaXMgcHJldmVudHMgcmUtcHJvbXB0aW5nIHdoZW4gdGhlIHVzZXIgc3dpdGNoZXMgYmFjayB0byBhbiBhbHJlYWR5LW9wZW5cbiAqIG5vdGVib29rLCB3aGlsZSBzdGlsbCBnYXRpbmcgdGhlIGZpcnN0IG9wZW4gb2YgZWFjaCBub3RlYm9vay5cbiAqL1xuY29uc3QgY29uZmlybWVkV2ViSG9zdE5vdGVib29rcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0VkaXRvciBleHRlbmRzIEVkaXRvclBhbmUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JQYW5lLCBJRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9IE5PVEVCT09LX0VESVRPUl9JRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JNZW1lbnRvOiBJRWRpdG9yTWVtZW50bzxJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0RGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF93aWRnZXQ6IElCb3Jyb3dWYWx1ZTxOb3RlYm9va0VkaXRvcldpZGdldD4gPSB7IHZhbHVlOiB1bmRlZmluZWQgfTtcblx0cHJpdmF0ZSBfcm9vdEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfcGFnZVBvc2l0aW9uPzogeyByZWFkb25seSBkaW1lbnNpb246IERPTS5EaW1lbnNpb247IHJlYWRvbmx5IHBvc2l0aW9uOiBET00uSURvbVBvc2l0aW9uIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvLyBvdmVycmlkZSBvbkRpZEZvY3VzIGFuZCBvbkRpZEJsdXIgdG8gYmUgYmFzZWQgb24gdGhlIE5vdGVib29rRWRpdG9yV2lkZ2V0IGVsZW1lbnRcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1c1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRvdmVycmlkZSBnZXQgb25EaWRGb2N1cygpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZEZvY3VzV2lkZ2V0LmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1cldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRvdmVycmlkZSBnZXQgb25EaWRCbHVyKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQmx1cldpZGdldC5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNjcm9sbCA9IHRoaXMuX29uRGlkQ2hhbmdlU2Nyb2xsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1dpZGdldFNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKE5vdGVib29rRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBfc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX2VkaXRvck1lbWVudG8gPSB0aGlzLmdldEVkaXRvck1lbWVudG88SU5vdGVib29rRWRpdG9yVmlld1N0YXRlPihfZWRpdG9yR3JvdXBTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgTk9URUJPT0tfRURJVE9SX1ZJRVdfU1RBVEVfUFJFRkVSRU5DRV9LRVkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMoZSA9PiB0aGlzLl9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlcihlLnNjaGVtZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZSA9PiB0aGlzLl9vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlcihlLnNjaGVtZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyKHNjaGVtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0ICYmIHRoaXMuaW5wdXQucmVzb3VyY2U/LnNjaGVtZSA9PT0gc2NoZW1lKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVSZWFkb25seSh0aGlzLmlucHV0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUlucHV0Q2FwYWJpbGl0aWVzKGlucHV0OiBOb3RlYm9va0VkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW5wdXQgPT09IGlucHV0KSB7XG5cdFx0XHR0aGlzLl91cGRhdGVSZWFkb25seShpbnB1dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVhZG9ubHkoaW5wdXQ6IE5vdGVib29rRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQudmFsdWU/LnNldE9wdGlvbnMoeyBpc1JlYWRPbmx5OiAhIWlucHV0LmlzUmVhZG9ubHkoKSB9KTtcblx0fVxuXG5cdGdldCB0ZXh0TW9kZWwoKTogTm90ZWJvb2tUZXh0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQudmFsdWU/LnRleHRNb2RlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBtaW5pbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIDIyMDsgfVxuXHRvdmVycmlkZSBnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7IH1cblxuXHQvLyB0aGVzZSBzZXR0ZXJzIG5lZWQgdG8gZXhpc3QgYmVjYXVzZSB0aGlzIGV4dGVuZHMgZnJvbSBFZGl0b3JQYW5lXG5cdG92ZXJyaWRlIHNldCBtaW5pbXVtV2lkdGgodmFsdWU6IG51bWJlcikgeyAvKm5vb3AqLyB9XG5cdG92ZXJyaWRlIHNldCBtYXhpbXVtV2lkdGgodmFsdWU6IG51bWJlcikgeyAvKm5vb3AqLyB9XG5cblx0Ly8jcmVnaW9uIEVkaXRvciBDb3JlXG5cdG92ZXJyaWRlIGdldCBzY29wZWRDb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQudmFsdWU/LnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJy5ub3RlYm9vay1lZGl0b3InKSk7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQuaWQgPSBgbm90ZWJvb2stZWRpdG9yLWVsZW1lbnQtJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYWN0aW9uLmlkID09PSBTRUxFQ1RfS0VSTkVMX0lEKSB7XG5cdFx0XHQvLyB0aGlzIGlzIGJlaW5nIGRpc3Bvc2VkIGJ5IHRoZSBjb25zdW1lclxuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29LZXJuZWxBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB0aGlzLCBvcHRpb25zKSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCk6IE5vdGVib29rRWRpdG9yV2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnZhbHVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuX3dpZGdldC52YWx1ZT8ub25XaWxsSGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRFZGl0b3JWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5zZXRFZGl0b3JWaXNpYmxlKHZpc2libGUpO1xuXHRcdHRoaXMuX2dyb3VwTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR0aGlzLl9ncm91cExpc3RlbmVyLmFkZCh0aGlzLmdyb3VwLm9uV2lsbENsb3NlRWRpdG9yKGUgPT4gdGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZShlLmVkaXRvcikpKTtcblx0XHR0aGlzLl9ncm91cExpc3RlbmVyLmFkZCh0aGlzLmdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCAhPT0gdGhpcy5ncm91cCkge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQ/LnZhbHVlPy51cGRhdGVFZGl0b3JGb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRcdGlmICh0aGlzLmlucHV0ICYmIHRoaXMuX3dpZGdldC52YWx1ZSkge1xuXHRcdFx0XHQvLyB0aGUgd2lkZ2V0IGlzIG5vdCB0cmFuc2ZlcmVkIHRvIG90aGVyIGVkaXRvciBpbnB1dHNcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlLm9uV2lsbEhpZGUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuX3dpZGdldC52YWx1ZT8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fd2lkZ2V0LnZhbHVlO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISF2YWx1ZSAmJiAoRE9NLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodmFsdWUuZ2V0RG9tTm9kZSgpIHx8IERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHZhbHVlLmdldE92ZXJmbG93Q29udGFpbmVyRG9tTm9kZSgpKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZW4gcnVubmluZyBzZXJ2ZXJsZXNzIG9uIHRoZSB3ZWIgKGkuZS4gaW4gdGhlIGJyb3dzZXIgd2l0aCBubyByZW1vdGUgc2VydmVyXG5cdCAqIGNvbm5lY3RlZCksIHByb21wdCB0aGUgdXNlciB0byBjb25maXJtIHRoYXQgdGhleSByZWFsbHkgd2FudCB0byBvcGVuIHRoZSBub3RlYm9vay5cblx0ICogVGhlIGNvbmZpcm1hdGlvbiBpcyBvbmx5IHNob3duIHRoZSBmaXJzdCB0aW1lIGEgZ2l2ZW4gbm90ZWJvb2sgaXMgb3BlbmVkIGluIHRoZVxuXHQgKiBzZXNzaW9uIChzbyBzd2l0Y2hpbmcgYmFjayB0byBhbiBhbHJlYWR5LW9wZW4gbm90ZWJvb2sgZG9lcyBub3QgcmUtcHJvbXB0KSwgYW5kIHRoZVxuXHQgKiBjaG9pY2UgY2FuIGJlIHJlbWVtYmVyZWQgZm9yIHRoZSB3aG9sZSB3b3Jrc3BhY2UgdmlhIGEgXCJEb24ndCBhc2sgYWdhaW5cIiBjaGVja2JveC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbmZpcm1PcGVuT25XZWJIb3N0KGlucHV0OiBOb3RlYm9va0VkaXRvcklucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXNTZXJ2ZXJsZXNzV2ViID0gaXNXZWIgJiYgIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0aWYgKCFpc1NlcnZlcmxlc3NXZWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihOT1RFQk9PS19XRUJfSE9TVF9PUEVOX0NPTkZJUk1FRF9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlS2V5ID0gaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAoY29uZmlybWVkV2ViSG9zdE5vdGVib29rcy5oYXMocmVzb3VyY2VLZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBjb25maXJtZWQsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdub3RlYm9vay53ZWJIb3N0LmNvbmZpcm0nLCBcIkRvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGlzIG5vdGVib29rP1wiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ25vdGVib29rLndlYkhvc3QuZGV0YWlsJywgXCJOb3RlYm9va3MgY2FuIHJ1biBjb2RlIHRoYXQgaGFzIGFjY2VzcyB0byB5b3VyIGJyb3dzZXIgc2Vzc2lvbiwgaW5jbHVkaW5nIGFueSBzaWduZWQtaW4gYWNjb3VudHMuIE9ubHkgb3BlbiBub3RlYm9va3MgZnJvbSBhdXRob3JzIHlvdSB0cnVzdC5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnbm90ZWJvb2sud2ViSG9zdC5vcGVuJywgXCJPcGVuIE5vdGVib29rXCIpLFxuXHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IGxvY2FsaXplKCdub3RlYm9vay53ZWJIb3N0LnJlbWVtYmVyJywgXCJEb24ndCBhc2sgbWUgYWdhaW5cIikgfVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHRocm93IGNyZWF0ZUVkaXRvck9wZW5FcnJvcihsb2NhbGl6ZSgnbm90ZWJvb2sud2ViSG9zdC5kZWNsaW5lZCcsIFwiVGhlIG5vdGVib29rIHdhcyBub3Qgb3BlbmVkIGJlY2F1c2UgaXRzIGF1dGhvcnMgYXJlIG5vdCB0cnVzdGVkLlwiKSwgW1xuXHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2suYWN0aW9uLm9wZW5Bc1RleHQnLCBsYWJlbDogbG9jYWxpemUoJ25vdGVib29rT3BlbkFzVGV4dCcsIFwiT3BlbiBBcyBUZXh0XCIpLCBydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgb3B0aW9uczogeyBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsIHBpbm5lZDogdHJ1ZSB9IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdF0sIHsgZm9yY2VNZXNzYWdlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGNvbmZpcm1lZFdlYkhvc3ROb3RlYm9va3MuYWRkKHJlc291cmNlS2V5KTtcblxuXHRcdGlmIChjaGVja2JveENoZWNrZWQpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKE5PVEVCT09LX1dFQl9IT1NUX09QRU5fQ09ORklSTUVEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogTm90ZWJvb2tFZGl0b3JJbnB1dCwgb3B0aW9uczogSU5vdGVib29rRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG5vUmV0cnk/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY29uZmlybU9wZW5PbldlYkhvc3QoaW5wdXQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBwZXJmTWFya3NDYXB0dXJlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZmlsZU9wZW5Nb25pdG9yID0gdGltZW91dCgxMDAwMCk7XG5cdFx0XHRmaWxlT3Blbk1vbml0b3IudGhlbigoKSA9PiB7XG5cdFx0XHRcdHBlcmZNYXJrc0NhcHR1cmVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5faGFuZGxlUGVyZk1hcmsocGVyZiwgaW5wdXQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHBlcmYgPSBuZXcgTm90ZWJvb2tQZXJmTWFya3MoKTtcblx0XHRcdHBlcmYubWFyaygnc3RhcnRUaW1lJyk7XG5cblx0XHRcdHRoaXMuX2lucHV0TGlzdGVuZXIudmFsdWUgPSBpbnB1dC5vbkRpZENoYW5nZUNhcGFiaWxpdGllcygoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUlucHV0Q2FwYWJpbGl0aWVzKGlucHV0KSk7XG5cblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXG5cdFx0XHQvLyB0aGVyZSBjdXJyZW50bHkgaXMgYSB3aWRnZXQgd2hpY2ggd2Ugc3RpbGwgb3duIHNvXG5cdFx0XHQvLyB3ZSBuZWVkIHRvIGhpZGUgaXQgYmVmb3JlIGdldHRpbmcgYSBuZXcgd2lkZ2V0XG5cdFx0XHR0aGlzLl93aWRnZXQudmFsdWU/Lm9uV2lsbEhpZGUoKTtcblxuXHRcdFx0dGhpcy5fd2lkZ2V0ID0gPElCb3Jyb3dWYWx1ZTxOb3RlYm9va0VkaXRvcldpZGdldD4+dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5fbm90ZWJvb2tXaWRnZXRTZXJ2aWNlLnJldHJpZXZlV2lkZ2V0LCB0aGlzLmdyb3VwLmlkLCBpbnB1dCwgdW5kZWZpbmVkLCB0aGlzLl9wYWdlUG9zaXRpb24/LmRpbWVuc2lvbiwgdGhpcy53aW5kb3cpO1xuXG5cdFx0XHRpZiAodGhpcy5fcm9vdEVsZW1lbnQgJiYgdGhpcy5fd2lkZ2V0LnZhbHVlIS5nZXREb21Ob2RlKCkpIHtcblx0XHRcdFx0dGhpcy5fcm9vdEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWZsb3d0bycsIHRoaXMuX3dpZGdldC52YWx1ZSEuZ2V0RG9tTm9kZSgpLmlkIHx8ICcnKTtcblx0XHRcdFx0RE9NLnNldFBhcmVudEZsb3dUbyh0aGlzLl93aWRnZXQudmFsdWUhLmdldERvbU5vZGUoKSwgdGhpcy5fcm9vdEVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl93aWRnZXREaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX3dpZGdldC52YWx1ZSEub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0RGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl93aWRnZXQudmFsdWUhLm9uRGlkQ2hhbmdlQWN0aXZlQ2VsbCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgcmVhc29uOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLlVTRVIgfSkpKTtcblxuXHRcdFx0aWYgKHRoaXMuX3BhZ2VQb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQudmFsdWUhLmxheW91dCh0aGlzLl9wYWdlUG9zaXRpb24uZGltZW5zaW9uLCB0aGlzLl9yb290RWxlbWVudCwgdGhpcy5fcGFnZVBvc2l0aW9uLnBvc2l0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gb25seSBub3cgYHNldElucHV0YCBhbmQgeWllbGQvYXdhaXQuIHRoaXMgaXMgQUZURVIgdGhlIGFjdHVhbCB3aWRnZXQgaXMgcmVhZHkuIFRoaXMgaXMgdmVyeSBpbXBvcnRhbnRcblx0XHRcdC8vIHNvIHRoYXQgb3RoZXJzIHN5bmNocm9ub3VzbHkgcmVjZWl2ZSBhIG5vdGVib29rIGVkaXRvciB3aXRoIHRoZSBjb3JyZWN0IHdpZGdldCBiZWluZyBzZXRcblx0XHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IGlucHV0LnJlc29sdmUob3B0aW9ucywgcGVyZik7XG5cdFx0XHRwZXJmLm1hcmsoJ2lucHV0TG9hZGVkJyk7XG5cblx0XHRcdC8vIENoZWNrIGZvciBjYW5jZWxsYXRpb25cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGUgd2lkZ2V0IGhhcyBiZWVuIHRha2VuIGF3YXkgYWdhaW4uIFRoaXMgY2FuIGhhcHBlbiB3aGVuIHRoZSB0YWIgaGFzIGJlZW4gY2xvc2VkIHdoaWxlXG5cdFx0XHQvLyBsb2FkaW5nIHdhcyBpbiBwcm9ncmVzcywgaW4gcGFydGljdWxhciB3aGVuIG9wZW4gdGhlIHNhbWUgcmVzb3VyY2UgYXMgZGlmZmVyZW50IHZpZXcgdHlwZS5cblx0XHRcdC8vIFdoZW4gdGhpcyBoYXBwZW4sIHJldHJ5IG9uY2Vcblx0XHRcdGlmICghdGhpcy5fd2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRcdGlmIChub1JldHJ5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4sIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZWwgPT09IG51bGwpIHtcblx0XHRcdFx0Y29uc3Qga25vd25Qcm92aWRlciA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXRWaWV3VHlwZVByb3ZpZGVyKGlucHV0LnZpZXdUeXBlKTtcblxuXHRcdFx0XHRpZiAoIWtub3duUHJvdmlkZXIpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2ZhaWwubm9FZGl0b3InLCBcIkNhbm5vdCBvcGVuIHJlc291cmNlIHdpdGggbm90ZWJvb2sgZWRpdG9yIHR5cGUgJ3swfScsIHBsZWFzZSBjaGVjayBpZiB5b3UgaGF2ZSB0aGUgcmlnaHQgZXh0ZW5zaW9uIGluc3RhbGxlZCBhbmQgZW5hYmxlZC5cIiwgaW5wdXQudmlld1R5cGUpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLndoZW5Jbml0aWFsaXplZDtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5mbyA9IHRoaXMuX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQoZSA9PiBlLmlkZW50aWZpZXIuaWQgPT09IGtub3duUHJvdmlkZXIpO1xuXG5cdFx0XHRcdHRocm93IGNyZWF0ZUVkaXRvck9wZW5FcnJvcihuZXcgRXJyb3IobG9jYWxpemUoJ2ZhaWwubm9FZGl0b3IuZXh0ZW5zaW9uTWlzc2luZycsIFwiQ2Fubm90IG9wZW4gcmVzb3VyY2Ugd2l0aCBub3RlYm9vayBlZGl0b3IgdHlwZSAnezB9JywgcGxlYXNlIGNoZWNrIGlmIHlvdSBoYXZlIHRoZSByaWdodCBleHRlbnNpb24gaW5zdGFsbGVkIGFuZCBlbmFibGVkLlwiLCBpbnB1dC52aWV3VHlwZSkpLCBbXG5cdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2suYWN0aW9uLmluc3RhbGxPckVuYWJsZU1pc3NpbmcnLCBsYWJlbDpcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSW5mb1xuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ25vdGVib29rT3BlbkVuYWJsZU1pc3NpbmdWaWV3VHlwZScsIFwiRW5hYmxlIGV4dGVuc2lvbiBmb3IgJ3swfSdcIiwgaW5wdXQudmlld1R5cGUpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbm90ZWJvb2tPcGVuSW5zdGFsbE1pc3NpbmdWaWV3VHlwZScsIFwiSW5zdGFsbCBleHRlbnNpb24gZm9yICd7MH0nXCIsIGlucHV0LnZpZXdUeXBlKVxuXHRcdFx0XHRcdFx0LCBydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZCA9IHRoaXMuX25vdGVib29rU2VydmljZS5vbkFkZFZpZXdUeXBlKHZpZXdUeXBlID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodmlld1R5cGUgPT09IGlucHV0LnZpZXdUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBzZXJpYWxpemVyIGlzIHJlZ2lzdGVyZWQsIHRyeSB0byBvcGVuIGFnYWluXG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogaW5wdXQucmVzb3VyY2UgfSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25JbmZvID0gdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChlID0+IGUuaWRlbnRpZmllci5pZCA9PT0ga25vd25Qcm92aWRlcik7XG5cblx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5mbykge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudChleHRlbnNpb25JbmZvLCBleHRlbnNpb25JbmZvLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlID8gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgOiBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5KTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLCBrbm93blByb3ZpZGVyKS5ydW4oKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gaW5zdGFsbCBvciBlbmFibGUgZXh0ZW5zaW9uICR7a25vd25Qcm92aWRlcn1gLCBleCk7XG5cdFx0XHRcdFx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5ub3RlYm9vay5hY3Rpb24ub3BlbkFzVGV4dCcsIGxhYmVsOiBsb2NhbGl6ZSgnbm90ZWJvb2tPcGVuQXNUZXh0JywgXCJPcGVuIEFzIFRleHRcIiksIHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCB0aGlzLl93b3JraW5nQ29weUJhY2t1cFNlcnZpY2UucmVzb2x2ZSh7IHJlc291cmNlOiBpbnB1dC5yZXNvdXJjZSwgdHlwZUlkOiBOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIuY3JlYXRlKGlucHV0LnZpZXdUeXBlKSB9KTtcblx0XHRcdFx0XHRcdFx0aWYgKGJhY2t1cCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHdpdGggYSBiYWNrdXAgcHJlc2VudCwgd2UgbXVzdCByZXNvcnQgdG8gb3BlbmluZyB0aGUgYmFja3VwIGNvbnRlbnRzXG5cdFx0XHRcdFx0XHRcdFx0Ly8gYXMgdW50aXRsZWQgdGV4dCBmaWxlIHRvIG5vdCBzaG93IHRoZSB3cm9uZyBkYXRhIHRvIHRoZSB1c2VyXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihiYWNrdXAudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1bmRlZmluZWQsIGNvbnRlbnRzOiBjb250ZW50cy50b1N0cmluZygpIH0pO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHdpdGhvdXQgYSBiYWNrdXAgcHJlc2VudCwgd2UgY2FuIG9wZW4gdGhlIG9yaWdpbmFsIHJlc291cmNlXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGlucHV0LnJlc291cmNlLCBvcHRpb25zOiB7IG92ZXJyaWRlOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCwgcGlubmVkOiB0cnVlIH0gfSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdLCB7IGFsbG93RGlhbG9nOiB0cnVlIH0pO1xuXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQobW9kZWwubm90ZWJvb2sub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoeyByZWFzb246IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uRURJVCB9KSkpO1xuXG5cdFx0XHRjb25zdCB2aWV3U3RhdGUgPSBvcHRpb25zPy52aWV3U3RhdGUgPz8gdGhpcy5fbG9hZE5vdGVib29rRWRpdG9yVmlld1N0YXRlKGlucHV0KTtcblxuXHRcdFx0Ly8gV2UgbWlnaHQgYmUgbW92aW5nIHRoZSBub3RlYm9vayB3aWRnZXQgYmV0d2VlbiBncm91cHMsIGFuZCB0aGVzZSBzZXJ2aWNlcyBhcmUgdGllZCB0byB0aGUgZ3JvdXBcblx0XHRcdHRoaXMuX3dpZGdldC52YWx1ZS5zZXRQYXJlbnRDb250ZXh0S2V5U2VydmljZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLl93aWRnZXQudmFsdWUuc2V0RWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlKHRoaXMuX2VkaXRvclByb2dyZXNzU2VydmljZSk7XG5cblx0XHRcdGF3YWl0IHRoaXMuX3dpZGdldC52YWx1ZS5zZXRNb2RlbChtb2RlbC5ub3RlYm9vaywgdmlld1N0YXRlLCBwZXJmKTtcblx0XHRcdGNvbnN0IGlzUmVhZE9ubHkgPSAhIWlucHV0LmlzUmVhZG9ubHkoKTtcblx0XHRcdGF3YWl0IHRoaXMuX3dpZGdldC52YWx1ZS5zZXRPcHRpb25zKHsgLi4ub3B0aW9ucywgaXNSZWFkT25seSB9KTtcblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fd2lkZ2V0LnZhbHVlLm9uRGlkRm9jdXNXaWRnZXQoKCkgPT4gdGhpcy5fb25EaWRGb2N1c1dpZGdldC5maXJlKCkpKTtcblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fd2lkZ2V0LnZhbHVlLm9uRGlkQmx1cldpZGdldCgoKSA9PiB0aGlzLl9vbkRpZEJsdXJXaWRnZXQuZmlyZSgpKSk7XG5cblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLmNyZWF0ZUVkaXRvckRyb3BUYXJnZXQodGhpcy5fd2lkZ2V0LnZhbHVlLmdldERvbU5vZGUoKSwge1xuXHRcdFx0XHRjb250YWluc0dyb3VwOiAoZ3JvdXApID0+IHRoaXMuZ3JvdXAuaWQgPT09IGdyb3VwLmlkXG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3dpZGdldERpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fd2lkZ2V0LnZhbHVlLm9uRGlkU2Nyb2xsKCgpID0+IHsgdGhpcy5fb25EaWRDaGFuZ2VTY3JvbGwuZmlyZSgpOyB9KSk7XG5cblx0XHRcdHBlcmYubWFyaygnZWRpdG9yTG9hZGVkJyk7XG5cblx0XHRcdGZpbGVPcGVuTW9uaXRvci5jYW5jZWwoKTtcblx0XHRcdGlmIChwZXJmTWFya3NDYXB0dXJlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2hhbmRsZVBlcmZNYXJrKHBlcmYsIGlucHV0LCBtb2RlbC5ub3RlYm9vayk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRyb2wuZmlyZSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdOb3RlYm9va0VkaXRvcldpZGdldCNzZXRJbnB1dCBmYWlsZWQnLCBlKTtcblx0XHRcdGlmIChpc0VkaXRvck9wZW5FcnJvcihlKSkge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgY2FzZSB3aGVyZSBhIGZpbGUgaXMgdG9vIGxhcmdlIHRvIG9wZW4gd2l0aG91dCBjb25maXJtYXRpb25cblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lKS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFKSB7XG5cdFx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgVG9vTGFyZ2VGaWxlT3BlcmF0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ25vdGVib29rVG9vTGFyZ2VGb3JIZWFwRXJyb3JXaXRoU2l6ZScsIFwiVGhlIG5vdGVib29rIGlzIG5vdCBkaXNwbGF5ZWQgaW4gdGhlIG5vdGVib29rIGVkaXRvciBiZWNhdXNlIGl0IGlzIHZlcnkgbGFyZ2UgKHswfSkuXCIsIEJ5dGVTaXplLmZvcm1hdFNpemUoZS5zaXplKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdub3RlYm9va1Rvb0xhcmdlRm9ySGVhcEVycm9yV2l0aG91dFNpemUnLCBcIlRoZSBub3RlYm9vayBpcyBub3QgZGlzcGxheWVkIGluIHRoZSBub3RlYm9vayBlZGl0b3IgYmVjYXVzZSBpdCBpcyB2ZXJ5IGxhcmdlLlwiKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IGNyZWF0ZVRvb0xhcmdlRmlsZUVycm9yKHRoaXMuZ3JvdXAsIGlucHV0LCBvcHRpb25zLCBtZXNzYWdlLCB0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlcnJvciA9IGNyZWF0ZUVkaXRvck9wZW5FcnJvcihlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKChlID8gZS5tZXNzYWdlIDogJycpKSwgW1xuXHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gubm90ZWJvb2suYWN0aW9uLm9wZW5JblRleHRFZGl0b3InLCBsYWJlbDogbG9jYWxpemUoJ25vdGVib29rT3BlbkluVGV4dEVkaXRvcicsIFwiT3BlbiBpbiBUZXh0IEVkaXRvclwiKSwgcnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdFx0XHRcdFx0aWYgKCFhY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yUmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShhY3RpdmVFZGl0b3JQYW5lLmlucHV0KTtcblx0XHRcdFx0XHRcdGlmICghYWN0aXZlRWRpdG9yUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoYWN0aXZlRWRpdG9yUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gaW5wdXQucmVzb3VyY2U/LnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgY3VycmVudCBlZGl0b3Igd2l0aCB0aGUgdGV4dCBlZGl0b3Jcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IGFjdGl2ZUVkaXRvclJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdG92ZXJyaWRlOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCxcblx0XHRcdFx0XHRcdFx0XHRcdHBpbm5lZDogdHJ1ZSAvLyBuZXcgZmlsZSBnZXRzIHBpbm5lZCBieSBkZWZhdWx0XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdF0sIHsgYWxsb3dEaWFsb2c6IHRydWUgfSk7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVBlcmZNYXJrKHBlcmY6IE5vdGVib29rUGVyZk1hcmtzLCBpbnB1dDogTm90ZWJvb2tFZGl0b3JJbnB1dCwgbm90ZWJvb2s/OiBOb3RlYm9va1RleHRNb2RlbCkge1xuXHRcdGNvbnN0IHBlcmZNYXJrcyA9IHBlcmYudmFsdWU7XG5cblx0XHR0eXBlIFdvcmtiZW5jaE5vdGVib29rT3BlbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdyZWJvcm5peCc7XG5cdFx0XHRjb21tZW50OiAnVGhlIG5vdGVib29rIGZpbGUgb3BlbiBtZXRyaWNzLiBVc2VkIHRvIGdldCBhIGJldHRlciB1bmRlcnN0YW5kaW5nIG9mIHRoZSBwZXJmb3JtYW5jZSBvZiBub3RlYm9vayBmaWxlIG9wZW5pbmcnO1xuXHRcdFx0c2NoZW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBzeXN0ZW0gcHJvdmlkZXIgc2NoZW1lIGZvciB0aGUgbm90ZWJvb2sgcmVzb3VyY2UnIH07XG5cdFx0XHRleHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGaWxlIGV4dGVuc2lvbiBmb3IgdGhlIG5vdGVib29rIHJlc291cmNlJyB9O1xuXHRcdFx0dmlld1R5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdmlldyB0eXBlIG9mIHRoZSBub3RlYm9vayBlZGl0b3InIH07XG5cdFx0XHRleHRlbnNpb25BY3RpdmF0ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeHRlbnNpb24gYWN0aXZhdGlvbiB0aW1lIGZvciB0aGUgcmVzb3VyY2Ugb3BlbmluZycgfTtcblx0XHRcdGlucHV0TG9hZGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRWRpdG9yIElucHV0IGxvYWRpbmcgdGltZSBmb3IgdGhlIHJlc291cmNlIG9wZW5pbmcnIH07XG5cdFx0XHR3ZWJ2aWV3Q29tbUxvYWRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1dlYnZpZXcgaW5pdGlhbGl6YXRpb24gdGltZSBmb3IgdGhlIHJlc291cmNlIG9wZW5pbmcnIH07XG5cdFx0XHRjdXN0b21NYXJrZG93bkxvYWRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0N1c3RvbSBtYXJrZG93biBsb2FkaW5nIHRpbWUgZm9yIHRoZSByZXNvdXJjZSBvcGVuaW5nJyB9O1xuXHRcdFx0ZWRpdG9yTG9hZGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnT3ZlcmFsbCBlZGl0b3IgbG9hZGluZyB0aW1lIGZvciB0aGUgcmVzb3VyY2Ugb3BlbmluZycgfTtcblx0XHRcdGNvZGVDZWxsQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgY29kZSBjZWxsJyB9O1xuXHRcdFx0bWRDZWxsQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgbWFya2Rvd24gY2VsbCcgfTtcblx0XHRcdG91dHB1dENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG90YWwgbnVtYmVyIG9mIGNlbGwgb3V0cHV0cycgfTtcblx0XHRcdG91dHB1dEJ5dGVzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG90YWwgbnVtYmVyIG9mIGJ5dGVzIGZvciBhbGwgb3V0cHV0cycgfTtcblx0XHRcdGNvZGVMZW5ndGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdMZW5ndGggb2YgdGV4dCBpbiBhbGwgY29kZSBjZWxscycgfTtcblx0XHRcdG1hcmtkb3duTGVuZ3RoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTGVuZ3RoIG9mIHRleHQgaW4gYWxsIG1hcmtkb3duIGNlbGxzJyB9O1xuXHRcdFx0bm90ZWJvb2tTdGF0c0xvYWRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RpbWUgZm9yIGdlbmVyYXRpbmcgdGhlIG5vdGVib29rIGxldmVsIGluZm9ybWF0aW9uIGZvciB0ZWxlbWV0cnknIH07XG5cdFx0fTtcblxuXHRcdHR5cGUgV29ya2JlbmNoTm90ZWJvb2tPcGVuRXZlbnQgPSB7XG5cdFx0XHRzY2hlbWU6IHN0cmluZztcblx0XHRcdGV4dDogc3RyaW5nO1xuXHRcdFx0dmlld1R5cGU6IHN0cmluZztcblx0XHRcdGV4dGVuc2lvbkFjdGl2YXRlZDogbnVtYmVyO1xuXHRcdFx0aW5wdXRMb2FkZWQ6IG51bWJlcjtcblx0XHRcdHdlYnZpZXdDb21tTG9hZGVkOiBudW1iZXI7XG5cdFx0XHRjdXN0b21NYXJrZG93bkxvYWRlZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZWRpdG9yTG9hZGVkOiBudW1iZXI7XG5cdFx0XHRjb2RlQ2VsbENvdW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRtZENlbGxDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0b3V0cHV0Q291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdG91dHB1dEJ5dGVzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb2RlTGVuZ3RoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRtYXJrZG93bkxlbmd0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0bm90ZWJvb2tTdGF0c0xvYWRlZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBzdGFydFRpbWUgPSBwZXJmTWFya3NbJ3N0YXJ0VGltZSddO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkFjdGl2YXRlZCA9IHBlcmZNYXJrc1snZXh0ZW5zaW9uQWN0aXZhdGVkJ107XG5cdFx0Y29uc3QgaW5wdXRMb2FkZWQgPSBwZXJmTWFya3NbJ2lucHV0TG9hZGVkJ107XG5cdFx0Y29uc3Qgd2Vidmlld0NvbW1Mb2FkZWQgPSBwZXJmTWFya3NbJ3dlYnZpZXdDb21tTG9hZGVkJ107XG5cdFx0Y29uc3QgY3VzdG9tTWFya2Rvd25Mb2FkZWQgPSBwZXJmTWFya3NbJ2N1c3RvbU1hcmtkb3duTG9hZGVkJ107XG5cdFx0Y29uc3QgZWRpdG9yTG9hZGVkID0gcGVyZk1hcmtzWydlZGl0b3JMb2FkZWQnXTtcblxuXHRcdGxldCBleHRlbnNpb25BY3RpdmF0aW9uVGltZXNwYW4gPSAtMTtcblx0XHRsZXQgaW5wdXRMb2FkaW5nVGltZXNwYW4gPSAtMTtcblx0XHRsZXQgd2Vidmlld0NvbW1Mb2FkaW5nVGltZXNwYW4gPSAtMTtcblx0XHRsZXQgY3VzdG9tTWFya2Rvd25Mb2FkaW5nVGltZXNwYW4gPSAtMTtcblx0XHRsZXQgZWRpdG9yTG9hZGluZ1RpbWVzcGFuID0gLTE7XG5cblx0XHRpZiAoc3RhcnRUaW1lICE9PSB1bmRlZmluZWQgJiYgZXh0ZW5zaW9uQWN0aXZhdGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc3BhbiA9IGV4dGVuc2lvbkFjdGl2YXRlZCAtIHN0YXJ0VGltZTtcblxuXHRcdFx0aWYgKGlucHV0TG9hZGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aW5wdXRMb2FkaW5nVGltZXNwYW4gPSBpbnB1dExvYWRlZCAtIGV4dGVuc2lvbkFjdGl2YXRlZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHdlYnZpZXdDb21tTG9hZGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0d2Vidmlld0NvbW1Mb2FkaW5nVGltZXNwYW4gPSB3ZWJ2aWV3Q29tbUxvYWRlZCAtIGV4dGVuc2lvbkFjdGl2YXRlZDtcblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VzdG9tTWFya2Rvd25Mb2FkZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjdXN0b21NYXJrZG93bkxvYWRpbmdUaW1lc3BhbiA9IGN1c3RvbU1hcmtkb3duTG9hZGVkIC0gc3RhcnRUaW1lO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdG9yTG9hZGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZWRpdG9yTG9hZGluZ1RpbWVzcGFuID0gZWRpdG9yTG9hZGVkIC0gc3RhcnRUaW1lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vdGVib29rIGluZm9ybWF0aW9uXG5cdFx0bGV0IGNvZGVDZWxsQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbWRDZWxsQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgb3V0cHV0Q291bnQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgb3V0cHV0Qnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgY29kZUxlbmd0aDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBtYXJrZG93bkxlbmd0aDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBub3RlYm9va1N0YXRzTG9hZGVkOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKG5vdGVib29rKSB7XG5cdFx0XHRjb25zdCBzdG9wV2F0Y2ggPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2Ygbm90ZWJvb2suY2VsbHMpIHtcblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0XHRjb2RlQ2VsbENvdW50ID0gKGNvZGVDZWxsQ291bnQgfHwgMCkgKyAxO1xuXHRcdFx0XHRcdGNvZGVMZW5ndGggPSAoY29kZUxlbmd0aCB8fCAwKSArIGNlbGwuZ2V0VGV4dExlbmd0aCgpO1xuXHRcdFx0XHRcdG91dHB1dENvdW50ID0gKG91dHB1dENvdW50IHx8IDApICsgY2VsbC5vdXRwdXRzLmxlbmd0aDtcblx0XHRcdFx0XHRvdXRwdXRCeXRlcyA9IChvdXRwdXRCeXRlcyB8fCAwKSArIGNlbGwub3V0cHV0cy5yZWR1Y2UoKHByZXYsIGN1cikgPT4gcHJldiArIGN1ci5vdXRwdXRzLnJlZHVjZSgoc2l6ZSwgaXRlbSkgPT4gc2l6ZSArIGl0ZW0uZGF0YS5ieXRlTGVuZ3RoLCAwKSwgMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWRDZWxsQ291bnQgPSAobWRDZWxsQ291bnQgfHwgMCkgKyAxO1xuXHRcdFx0XHRcdG1hcmtkb3duTGVuZ3RoID0gKGNvZGVMZW5ndGggfHwgMCkgKyBjZWxsLmdldFRleHRMZW5ndGgoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bm90ZWJvb2tTdGF0c0xvYWRlZCA9IHN0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbTm90ZWJvb2tFZGl0b3JdIG9wZW4gbm90ZWJvb2sgcGVyZiAke25vdGVib29rPy51cmkudG9TdHJpbmcoKSA/PyAnJ30gLSBleHRlbnNpb25BY3RpdmF0aW9uOiAke2V4dGVuc2lvbkFjdGl2YXRpb25UaW1lc3Bhbn0sIGlucHV0TG9hZDogJHtpbnB1dExvYWRpbmdUaW1lc3Bhbn0sIHdlYnZpZXdDb21tOiAke3dlYnZpZXdDb21tTG9hZGluZ1RpbWVzcGFufSwgY3VzdG9tTWFya2Rvd246ICR7Y3VzdG9tTWFya2Rvd25Mb2FkaW5nVGltZXNwYW59LCBlZGl0b3JMb2FkOiAke2VkaXRvckxvYWRpbmdUaW1lc3Bhbn1gKTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaE5vdGVib29rT3BlbkV2ZW50LCBXb3JrYmVuY2hOb3RlYm9va09wZW5DbGFzc2lmaWNhdGlvbj4oJ25vdGVib29rL2VkaXRvck9wZW5QZXJmJywge1xuXHRcdFx0c2NoZW1lOiBpbnB1dC5yZXNvdXJjZS5zY2hlbWUsXG5cdFx0XHRleHQ6IGV4dG5hbWUoaW5wdXQucmVzb3VyY2UpLFxuXHRcdFx0dmlld1R5cGU6IGlucHV0LnZpZXdUeXBlLFxuXHRcdFx0ZXh0ZW5zaW9uQWN0aXZhdGVkOiBleHRlbnNpb25BY3RpdmF0aW9uVGltZXNwYW4sXG5cdFx0XHRpbnB1dExvYWRlZDogaW5wdXRMb2FkaW5nVGltZXNwYW4sXG5cdFx0XHR3ZWJ2aWV3Q29tbUxvYWRlZDogd2Vidmlld0NvbW1Mb2FkaW5nVGltZXNwYW4sXG5cdFx0XHRjdXN0b21NYXJrZG93bkxvYWRlZDogY3VzdG9tTWFya2Rvd25Mb2FkaW5nVGltZXNwYW4sXG5cdFx0XHRlZGl0b3JMb2FkZWQ6IGVkaXRvckxvYWRpbmdUaW1lc3Bhbixcblx0XHRcdGNvZGVDZWxsQ291bnQsXG5cdFx0XHRtZENlbGxDb3VudCxcblx0XHRcdG91dHB1dENvdW50LFxuXHRcdFx0b3V0cHV0Qnl0ZXMsXG5cdFx0XHRjb2RlTGVuZ3RoLFxuXHRcdFx0bWFya2Rvd25MZW5ndGgsXG5cdFx0XHRub3RlYm9va1N0YXRzTG9hZGVkXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2lucHV0TGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLl93aWRnZXQudmFsdWUpIHtcblx0XHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUodGhpcy5pbnB1dCk7XG5cdFx0XHR0aGlzLl93aWRnZXQudmFsdWUub25XaWxsSGlkZSgpO1xuXHRcdH1cblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRPcHRpb25zKG9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQudmFsdWU/LnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0c3VwZXIuc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2F2ZUVkaXRvclZpZXdTdGF0ZSh0aGlzLmlucHV0KTtcblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFZpZXdTdGF0ZSgpOiBJTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnB1dDtcblx0XHRpZiAoIShpbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NhdmVFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHRcdHJldHVybiB0aGlzLl9sb2FkTm90ZWJvb2tFZGl0b3JWaWV3U3RhdGUoaW5wdXQpO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uKCk6IElFZGl0b3JQYW5lU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0LnZhbHVlKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVDZWxsID0gdGhpcy5fd2lkZ2V0LnZhbHVlLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRcdGlmIChhY3RpdmVDZWxsKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGxVcmkgPSBhY3RpdmVDZWxsLnVyaTtcblx0XHRcdFx0cmV0dXJuIG5ldyBOb3RlYm9va0VkaXRvclNlbGVjdGlvbihjZWxsVXJpLCBhY3RpdmVDZWxsLmdldFNlbGVjdGlvbnMoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFNjcm9sbFBvc2l0aW9uKCk6IElFZGl0b3JQYW5lU2Nyb2xsUG9zaXRpb24ge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuZ2V0Q29udHJvbCgpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdGVib29rIHdpZGdldCBoYXMgbm90IHlldCBiZWVuIGluaXRpYWxpemVkJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbFRvcDogd2lkZ2V0LnNjcm9sbFRvcCxcblx0XHRcdHNjcm9sbExlZnQ6IDAsXG5cdFx0fTtcblx0fVxuXG5cdHNldFNjcm9sbFBvc2l0aW9uKHNjcm9sbFBvc2l0aW9uOiBJRWRpdG9yUGFuZVNjcm9sbFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5nZXRDb250cm9sKCk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29udHJvbCBoYXMgbm90IHlldCBiZWVuIGluaXRpYWxpemVkJyk7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLnNldFNjcm9sbFRvcChzY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3ApO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZUVkaXRvclZpZXdTdGF0ZShpbnB1dDogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0LnZhbHVlICYmIGlucHV0IGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCkge1xuXHRcdFx0aWYgKHRoaXMuX3dpZGdldC52YWx1ZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl93aWRnZXQudmFsdWUuZ2V0RWRpdG9yVmlld1N0YXRlKCk7XG5cdFx0XHR0aGlzLl9lZGl0b3JNZW1lbnRvLnNhdmVFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCBpbnB1dC5yZXNvdXJjZSwgc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWROb3RlYm9va0VkaXRvclZpZXdTdGF0ZShpbnB1dDogTm90ZWJvb2tFZGl0b3JJbnB1dCk6IElOb3RlYm9va0VkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fZWRpdG9yTWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgaW5wdXQucmVzb3VyY2UpO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdC8vIHdoZW4gd2UgZG9uJ3QgaGF2ZSBhIHZpZXcgc3RhdGUgZm9yIHRoZSBncm91cC9pbnB1dC10dXBsZSB0aGVuIHdlIHRyeSB0byB1c2UgYW4gZXhpc3Rpbmdcblx0XHQvLyBlZGl0b3IgZm9yIHRoZSBzYW1lIHJlc291cmNlLlxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdGlmIChncm91cC5hY3RpdmVFZGl0b3JQYW5lICE9PSB0aGlzICYmIGdyb3VwLmFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvciAmJiBncm91cC5hY3RpdmVFZGl0b3I/Lm1hdGNoZXMoaW5wdXQpKSB7XG5cdFx0XHRcdHJldHVybiBncm91cC5hY3RpdmVFZGl0b3JQYW5lLl93aWRnZXQudmFsdWU/LmdldEVkaXRvclZpZXdTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uLCBwb3NpdGlvbjogRE9NLklEb21Qb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ21pZC13aWR0aCcsIGRpbWVuc2lvbi53aWR0aCA8IDEwMDAgJiYgZGltZW5zaW9uLndpZHRoID49IDYwMCk7XG5cdFx0dGhpcy5fcm9vdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93LXdpZHRoJywgZGltZW5zaW9uLndpZHRoIDwgNjAwKTtcblx0XHR0aGlzLl9wYWdlUG9zaXRpb24gPSB7IGRpbWVuc2lvbiwgcG9zaXRpb24gfTtcblxuXHRcdGlmICghdGhpcy5fd2lkZ2V0LnZhbHVlIHx8ICEodGhpcy5pbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gdGhpcy50ZXh0TW9kZWw/LnVyaS50b1N0cmluZygpICYmIHRoaXMuX3dpZGdldC52YWx1ZT8uaGFzTW9kZWwoKSkge1xuXHRcdFx0Ly8gaW5wdXQgYW5kIHdpZGdldCBtaXNtYXRjaFxuXHRcdFx0Ly8gdGhpcyBoYXBwZW5zIHdoZW5cblx0XHRcdC8vIDEuIG9wZW4gZG9jdW1lbnQgQSwgcGluIHRoZSBkb2N1bWVudFxuXHRcdFx0Ly8gMi4gb3BlbiBkb2N1bWVudCBCXG5cdFx0XHQvLyAzLiBjbG9zZSBkb2N1bWVudCBCXG5cdFx0XHQvLyA0LiBhIGxheW91dCBpcyB0cmlnZ2VyZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlLmxheW91dChkaW1lbnNpb24sIHRoaXMuX3Jvb3RFbGVtZW50LCBwb3NpdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmNsYXNzIE5vdGVib29rRWRpdG9yU2VsZWN0aW9uIGltcGxlbWVudHMgSUVkaXRvclBhbmVTZWxlY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2VsbFVyaTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VsZWN0aW9uczogU2VsZWN0aW9uW11cblx0KSB7IH1cblxuXHRjb21wYXJlKG90aGVyOiBJRWRpdG9yUGFuZVNlbGVjdGlvbik6IEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0IHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9yU2VsZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LkRJRkZFUkVOVDtcblx0XHR9XG5cblx0XHRpZiAoaXNFcXVhbCh0aGlzLmNlbGxVcmksIG90aGVyLmNlbGxVcmkpKSB7XG5cdFx0XHRyZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuSURFTlRJQ0FMO1xuXHRcdH1cblxuXHRcdHJldHVybiBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdC5ESUZGRVJFTlQ7XG5cdH1cblxuXHRyZXN0b3JlKG9wdGlvbnM6IElFZGl0b3JPcHRpb25zKTogSU5vdGVib29rRWRpdG9yT3B0aW9ucyB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tPcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0Y2VsbE9wdGlvbnM6IHtcblx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuY2VsbFVyaSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNlbGVjdGlvbjogdGhpcy5zZWxlY3Rpb25zWzBdXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0T2JqZWN0LmFzc2lnbihub3RlYm9va09wdGlvbnMsIG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIG5vdGVib29rT3B0aW9ucztcblx0fVxuXG5cdGxvZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmNlbGxVcmkuZnJhZ21lbnQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTm90ZWJvb2tDb250YWluaW5nQ2VsbEVkaXRvcihlZGl0b3I6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkLCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcik6IGJvb2xlYW4ge1xuXHRpZiAoZWRpdG9yPy5nZXRJZCgpID09PSBOb3RlYm9va0VkaXRvci5JRCkge1xuXHRcdGNvbnN0IG5vdGVib29rV2lkZ2V0ID0gZWRpdG9yLmdldENvbnRyb2woKSBhcyBOb3RlYm9va0VkaXRvcldpZGdldDtcblx0XHRpZiAobm90ZWJvb2tXaWRnZXQpIHtcblx0XHRcdGZvciAoY29uc3QgW18sIGVkaXRvcl0gb2Ygbm90ZWJvb2tXaWRnZXQuY29kZUVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGVkaXRvciA9PT0gY29kZUVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQWtCLGdCQUFnQjtBQUNsQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxpQkFBaUIseUJBQXlCO0FBQ25ELFNBQVMsU0FBUyxlQUFlO0FBRWpDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsVUFBOEIscUJBQXFCLGNBQWMsa0NBQWtDO0FBQzVHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNEJBQTRCLGlDQUFpQyxrQ0FBa0Msd0JBQXFMLHVCQUF1Qix5QkFBeUIseUJBQXlCO0FBRXRXLFNBQVMsd0JBQXdCO0FBRWpDLFNBQXVCLDhCQUE4QjtBQUVyRCxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLFVBQVUsb0JBQW9CLHlDQUF5QztBQUNoRixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQTJCLDRCQUE0QjtBQUNoRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGlCQUFpQjtBQUcxQixNQUFNLDRDQUE0QztBQUNsRCxNQUFNLHVDQUF1QztBQU83QyxNQUFNLDRCQUE0QixvQkFBSSxJQUFZO0FBRzNDLElBQU0saUJBQU4sY0FBNkIsV0FBb0U7QUFBQSxFQTJCdkcsWUFDQyxPQUNtQixrQkFDSixjQUN5Qix1QkFDTixpQkFDRCxnQkFDTSxxQkFDRSx3QkFDSixvQkFDTixjQUNJLHNCQUNNLHdCQUNOLGtCQUNXLDZCQUNGLDJCQUNkLFlBQ1EscUJBQ0wsZ0JBQ2MscUJBQzlDO0FBQ0QsVUFBTSxlQUFlLElBQUksT0FBTyxrQkFBa0IsY0FBYyxlQUFlO0FBakJ2QztBQUNOO0FBQ0Q7QUFDTTtBQUNFO0FBQ0o7QUFDTjtBQUVVO0FBQ047QUFDVztBQUNGO0FBQ2Q7QUFDUTtBQUNMO0FBQ2M7QUExQ2hELFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUN0RSxTQUFpQix5QkFBMEMsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDL0YsU0FBUSxVQUE4QyxFQUFFLE9BQU8sT0FBVTtBQUl6RSxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFHeEU7QUFBQSxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBRXZFLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFHdEUsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN2RSxTQUFTLG1CQUFnQyxLQUFLLGtCQUFrQjtBQUVoRSxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBeUMsQ0FBQztBQUN0RyxTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUUzRCxTQUFtQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzFFLFNBQVMsb0JBQW9CLEtBQUssbUJBQW1CO0FBd0JwRCxTQUFLLGlCQUFpQixLQUFLLGlCQUEyQyxxQkFBcUIsc0JBQXNCLHlDQUF5QztBQUUxSixTQUFLLFVBQVUsS0FBSyxhQUFhLDBDQUEwQyxPQUFLLEtBQUssK0JBQStCLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDOUgsU0FBSyxVQUFVLEtBQUssYUFBYSwyQ0FBMkMsT0FBSyxLQUFLLCtCQUErQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQUEsRUFDaEk7QUFBQSxFQXZDQSxJQUFhLGFBQTBCO0FBQUUsV0FBTyxLQUFLLGtCQUFrQjtBQUFBLEVBQU87QUFBQSxFQUU5RSxJQUFhLFlBQXlCO0FBQUUsV0FBTyxLQUFLLGlCQUFpQjtBQUFBLEVBQU87QUFBQSxFQXVDcEUsK0JBQStCLFFBQXNCO0FBQzVELFFBQUksS0FBSyxpQkFBaUIsdUJBQXVCLEtBQUssTUFBTSxVQUFVLFdBQVcsUUFBUTtBQUN4RixXQUFLLGdCQUFnQixLQUFLLEtBQUs7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDhCQUE4QixPQUFrQztBQUN2RSxRQUFJLEtBQUssVUFBVSxPQUFPO0FBQ3pCLFdBQUssZ0JBQWdCLEtBQUs7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixPQUFrQztBQUN6RCxTQUFLLFFBQVEsT0FBTyxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUMsTUFBTSxXQUFXLEVBQUUsQ0FBQztBQUFBLEVBQ3BFO0FBQUEsRUFFQSxJQUFJLFlBQTJDO0FBQzlDLFdBQU8sS0FBSyxRQUFRLE9BQU87QUFBQSxFQUM1QjtBQUFBLEVBRUEsSUFBYSxlQUF1QjtBQUFFLFdBQU87QUFBQSxFQUFLO0FBQUEsRUFDbEQsSUFBYSxlQUF1QjtBQUFFLFdBQU8sT0FBTztBQUFBLEVBQW1CO0FBQUE7QUFBQSxFQUd2RSxJQUFhLGFBQWEsT0FBZTtBQUFBLEVBQVc7QUFBQSxFQUNwRCxJQUFhLGFBQWEsT0FBZTtBQUFBLEVBQVc7QUFBQTtBQUFBLEVBR3BELElBQWEsMEJBQTBEO0FBQ3RFLFdBQU8sS0FBSyxRQUFRLE9BQU87QUFBQSxFQUM1QjtBQUFBLEVBRVUsYUFBYSxRQUEyQjtBQUNqRCxTQUFLLGVBQWUsSUFBSSxPQUFPLFFBQVEsSUFBSSxFQUFFLGtCQUFrQixDQUFDO0FBQ2hFLFNBQUssYUFBYSxLQUFLLDJCQUEyQixhQUFhLENBQUM7QUFBQSxFQUNqRTtBQUFBLEVBRVMsa0JBQWtCLFFBQWlCLFNBQThEO0FBQ3pHLFFBQUksT0FBTyxPQUFPLGtCQUFrQjtBQUVuQyxhQUFPLEtBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLDZCQUE2QixRQUFRLE1BQU0sT0FBTyxDQUFDO0FBQUEsSUFDcEg7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVMsYUFBK0M7QUFDdkQsV0FBTyxLQUFLLFFBQVE7QUFBQSxFQUNyQjtBQUFBLEVBRVMsV0FBVyxTQUF3QjtBQUMzQyxVQUFNLFdBQVcsT0FBTztBQUN4QixRQUFJLENBQUMsU0FBUztBQUNiLFdBQUssUUFBUSxPQUFPLFdBQVc7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQUVtQixpQkFBaUIsU0FBd0I7QUFDM0QsVUFBTSxpQkFBaUIsT0FBTztBQUM5QixTQUFLLGVBQWUsTUFBTTtBQUMxQixTQUFLLGVBQWUsSUFBSSxLQUFLLE1BQU0sa0JBQWtCLE9BQUssS0FBSyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUM5RixTQUFLLGVBQWUsSUFBSSxLQUFLLE1BQU0saUJBQWlCLE1BQU07QUFDekQsVUFBSSxLQUFLLG9CQUFvQixnQkFBZ0IsS0FBSyxPQUFPO0FBQ3hELGFBQUssU0FBUyxPQUFPLGtCQUFrQjtBQUFBLE1BQ3hDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixRQUFJLENBQUMsU0FBUztBQUNiLFdBQUsscUJBQXFCLEtBQUssS0FBSztBQUNwQyxVQUFJLEtBQUssU0FBUyxLQUFLLFFBQVEsT0FBTztBQUVyQyxhQUFLLFFBQVEsTUFBTSxXQUFXO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVMsUUFBUTtBQUNoQixVQUFNLE1BQU07QUFDWixTQUFLLFFBQVEsT0FBTyxNQUFNO0FBQUEsRUFDM0I7QUFBQSxFQUVTLFdBQW9CO0FBQzVCLFVBQU0sUUFBUSxLQUFLLFFBQVE7QUFDM0IsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sQ0FBQyxDQUFDLFNBQVUsSUFBSSwwQkFBMEIsTUFBTSxXQUFXLEtBQUssSUFBSSwwQkFBMEIsTUFBTSw0QkFBNEIsQ0FBQyxDQUFDO0FBQUEsRUFDMUk7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU0EsTUFBYyxzQkFBc0IsT0FBMkM7QUFDOUUsVUFBTSxrQkFBa0IsU0FBUyxDQUFDLEtBQUssb0JBQW9CO0FBQzNELFFBQUksQ0FBQyxpQkFBaUI7QUFDckI7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLGdCQUFnQixXQUFXLHNDQUFzQyxhQUFhLFdBQVcsS0FBSyxHQUFHO0FBQ3pHO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyxNQUFNLFNBQVMsU0FBUztBQUM1QyxRQUFJLDBCQUEwQixJQUFJLFdBQVcsR0FBRztBQUMvQztBQUFBLElBQ0Q7QUFFQSxVQUFNLEVBQUUsV0FBVyxnQkFBZ0IsSUFBSSxNQUFNLEtBQUssZUFBZSxRQUFRO0FBQUEsTUFDeEUsTUFBTTtBQUFBLE1BQ04sU0FBUyxTQUFTLDRCQUE0Qiw0Q0FBNEM7QUFBQSxNQUMxRixRQUFRLFNBQVMsMkJBQTJCLCtJQUErSTtBQUFBLE1BQzNMLGVBQWUsU0FBUyx5QkFBeUIsZUFBZTtBQUFBLE1BQ2hFLFVBQVUsRUFBRSxPQUFPLFNBQVMsNkJBQTZCLG9CQUFvQixFQUFFO0FBQUEsSUFDaEYsQ0FBQztBQUVELFFBQUksQ0FBQyxXQUFXO0FBQ2YsWUFBTSxzQkFBc0IsU0FBUyw2QkFBNkIsa0VBQWtFLEdBQUc7QUFBQSxRQUN0SSxTQUFTO0FBQUEsVUFDUixJQUFJO0FBQUEsVUFBd0MsT0FBTyxTQUFTLHNCQUFzQixjQUFjO0FBQUEsVUFBRyxLQUFLLFlBQVk7QUFDbkgsaUJBQUssZUFBZSxXQUFXLEVBQUUsVUFBVSxNQUFNLFVBQVUsU0FBUyxFQUFFLFVBQVUsMkJBQTJCLElBQUksUUFBUSxLQUFLLEVBQUUsQ0FBQztBQUFBLFVBQ2hJO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixHQUFHLEVBQUUsY0FBYyxLQUFLLENBQUM7QUFBQSxJQUMxQjtBQUVBLDhCQUEwQixJQUFJLFdBQVc7QUFFekMsUUFBSSxpQkFBaUI7QUFDcEIsV0FBSyxnQkFBZ0IsTUFBTSxzQ0FBc0MsTUFBTSxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsSUFDckg7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFlLFNBQVMsT0FBNEIsU0FBNkMsU0FBNkIsT0FBMEIsU0FBa0M7QUFDekwsVUFBTSxLQUFLLHNCQUFzQixLQUFLO0FBRXRDLFFBQUk7QUFDSCxVQUFJLG9CQUFvQjtBQUN4QixZQUFNLGtCQUFrQixRQUFRLEdBQUs7QUFDckMsc0JBQWdCLEtBQUssTUFBTTtBQUMxQiw0QkFBb0I7QUFDcEIsYUFBSyxnQkFBZ0IsTUFBTSxLQUFLO0FBQUEsTUFDakMsQ0FBQztBQUVELFlBQU0sT0FBTyxJQUFJLGtCQUFrQjtBQUNuQyxXQUFLLEtBQUssV0FBVztBQUVyQixXQUFLLGVBQWUsUUFBUSxNQUFNLHdCQUF3QixNQUFNLEtBQUssOEJBQThCLEtBQUssQ0FBQztBQUV6RyxXQUFLLHVCQUF1QixNQUFNO0FBSWxDLFdBQUssUUFBUSxPQUFPLFdBQVc7QUFFL0IsV0FBSyxVQUE4QyxLQUFLLHNCQUFzQixlQUFlLEtBQUssdUJBQXVCLGdCQUFnQixLQUFLLE1BQU0sSUFBSSxPQUFPLFFBQVcsS0FBSyxlQUFlLFdBQVcsS0FBSyxNQUFNO0FBRXBOLFVBQUksS0FBSyxnQkFBZ0IsS0FBSyxRQUFRLE1BQU8sV0FBVyxHQUFHO0FBQzFELGFBQUssYUFBYSxhQUFhLGVBQWUsS0FBSyxRQUFRLE1BQU8sV0FBVyxFQUFFLE1BQU0sRUFBRTtBQUN2RixZQUFJLGdCQUFnQixLQUFLLFFBQVEsTUFBTyxXQUFXLEdBQUcsS0FBSyxZQUFZO0FBQUEsTUFDeEU7QUFFQSxXQUFLLHVCQUF1QixJQUFJLEtBQUssUUFBUSxNQUFPLGlCQUFpQixNQUFNLEtBQUssa0JBQWtCLEtBQUssQ0FBQyxDQUFDO0FBQ3pHLFdBQUssdUJBQXVCLElBQUksS0FBSyxRQUFRLE1BQU8sc0JBQXNCLE1BQU0sS0FBSyxzQkFBc0IsS0FBSyxFQUFFLFFBQVEsZ0NBQWdDLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFFbEssVUFBSSxLQUFLLGVBQWU7QUFDdkIsYUFBSyxRQUFRLE1BQU8sT0FBTyxLQUFLLGNBQWMsV0FBVyxLQUFLLGNBQWMsS0FBSyxjQUFjLFFBQVE7QUFBQSxNQUN4RztBQUlBLFlBQU0sTUFBTSxTQUFTLE9BQU8sU0FBUyxTQUFTLEtBQUs7QUFDbkQsWUFBTSxRQUFRLE1BQU0sTUFBTSxRQUFRLFNBQVMsSUFBSTtBQUMvQyxXQUFLLEtBQUssYUFBYTtBQUd2QixVQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGVBQU87QUFBQSxNQUNSO0FBS0EsVUFBSSxDQUFDLEtBQUssUUFBUSxPQUFPO0FBQ3hCLFlBQUksU0FBUztBQUNaLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU8sS0FBSyxTQUFTLE9BQU8sU0FBUyxTQUFTLE9BQU8sSUFBSTtBQUFBLE1BQzFEO0FBRUEsVUFBSSxVQUFVLE1BQU07QUFDbkIsY0FBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsb0JBQW9CLE1BQU0sUUFBUTtBQUU5RSxZQUFJLENBQUMsZUFBZTtBQUNuQixnQkFBTSxJQUFJLE1BQU0sU0FBUyxpQkFBaUIsNkhBQTZILE1BQU0sUUFBUSxDQUFDO0FBQUEsUUFDdkw7QUFFQSxjQUFNLEtBQUssNEJBQTRCO0FBQ3ZDLGNBQU0sZ0JBQWdCLEtBQUssNEJBQTRCLE1BQU0sS0FBSyxPQUFLLEVBQUUsV0FBVyxPQUFPLGFBQWE7QUFFeEcsY0FBTSxzQkFBc0IsSUFBSSxNQUFNLFNBQVMsa0NBQWtDLDZIQUE2SCxNQUFNLFFBQVEsQ0FBQyxHQUFHO0FBQUEsVUFDL04sU0FBUztBQUFBLFlBQ1IsSUFBSTtBQUFBLFlBQW9ELE9BQ3ZELGdCQUNHLFNBQVMscUNBQXFDLDhCQUE4QixNQUFNLFFBQVEsSUFDMUYsU0FBUyxzQ0FBc0MsK0JBQStCLE1BQU0sUUFBUTtBQUFBLFlBQzlGLEtBQUssWUFBWTtBQUNsQixvQkFBTSxJQUFJLEtBQUssaUJBQWlCLGNBQWMsY0FBWTtBQUN6RCxvQkFBSSxhQUFhLE1BQU0sVUFBVTtBQUVoQyx1QkFBSyxlQUFlLFdBQVcsRUFBRSxVQUFVLE1BQU0sU0FBUyxDQUFDO0FBQzNELG9CQUFFLFFBQVE7QUFBQSxnQkFDWDtBQUFBLGNBQ0QsQ0FBQztBQUNELG9CQUFNQSxpQkFBZ0IsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLE9BQUssRUFBRSxXQUFXLE9BQU8sYUFBYTtBQUV4RyxrQkFBSTtBQUNILG9CQUFJQSxnQkFBZTtBQUNsQix3QkFBTSxLQUFLLDRCQUE0QixjQUFjQSxnQkFBZUEsZUFBYyxvQkFBb0IsZ0JBQWdCLG9CQUFvQixnQkFBZ0IsbUJBQW1CLGdCQUFnQixlQUFlO0FBQUEsZ0JBQzdNLE9BQU87QUFDTix3QkFBTSxLQUFLLHNCQUFzQixlQUFlLG1DQUFtQyxhQUFhLEVBQUUsSUFBSTtBQUFBLGdCQUN2RztBQUFBLGNBQ0QsU0FBUyxJQUFJO0FBQ1oscUJBQUssV0FBVyxNQUFNLHlDQUF5QyxhQUFhLElBQUksRUFBRTtBQUNsRixrQkFBRSxRQUFRO0FBQUEsY0FDWDtBQUFBLFlBQ0Q7QUFBQSxVQUNELENBQUM7QUFBQSxVQUNELFNBQVM7QUFBQSxZQUNSLElBQUk7QUFBQSxZQUF3QyxPQUFPLFNBQVMsc0JBQXNCLGNBQWM7QUFBQSxZQUFHLEtBQUssWUFBWTtBQUNuSCxvQkFBTSxTQUFTLE1BQU0sS0FBSywwQkFBMEIsUUFBUSxFQUFFLFVBQVUsTUFBTSxVQUFVLFFBQVEsa0NBQWtDLE9BQU8sTUFBTSxRQUFRLEVBQUUsQ0FBQztBQUMxSixrQkFBSSxRQUFRO0FBR1gsc0JBQU0sV0FBVyxNQUFNLGVBQWUsT0FBTyxLQUFLO0FBQ2xELHFCQUFLLGVBQWUsV0FBVyxFQUFFLFVBQVUsUUFBVyxVQUFVLFNBQVMsU0FBUyxFQUFFLENBQUM7QUFBQSxjQUN0RixPQUFPO0FBRU4scUJBQUssZUFBZSxXQUFXLEVBQUUsVUFBVSxNQUFNLFVBQVUsU0FBUyxFQUFFLFVBQVUsMkJBQTJCLElBQUksUUFBUSxLQUFLLEVBQUUsQ0FBQztBQUFBLGNBQ2hJO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsR0FBRyxFQUFFLGFBQWEsS0FBSyxDQUFDO0FBQUEsTUFFekI7QUFFQSxXQUFLLHVCQUF1QixJQUFJLE1BQU0sU0FBUyxtQkFBbUIsTUFBTSxLQUFLLHNCQUFzQixLQUFLLEVBQUUsUUFBUSxnQ0FBZ0MsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUUxSixZQUFNLFlBQVksU0FBUyxhQUFhLEtBQUssNkJBQTZCLEtBQUs7QUFHL0UsV0FBSyxRQUFRLE1BQU0sMkJBQTJCLEtBQUssa0JBQWtCO0FBQ3JFLFdBQUssUUFBUSxNQUFNLHlCQUF5QixLQUFLLHNCQUFzQjtBQUV2RSxZQUFNLEtBQUssUUFBUSxNQUFNLFNBQVMsTUFBTSxVQUFVLFdBQVcsSUFBSTtBQUNqRSxZQUFNLGFBQWEsQ0FBQyxDQUFDLE1BQU0sV0FBVztBQUN0QyxZQUFNLEtBQUssUUFBUSxNQUFNLFdBQVcsRUFBRSxHQUFHLFNBQVMsV0FBVyxDQUFDO0FBQzlELFdBQUssdUJBQXVCLElBQUksS0FBSyxRQUFRLE1BQU0saUJBQWlCLE1BQU0sS0FBSyxrQkFBa0IsS0FBSyxDQUFDLENBQUM7QUFDeEcsV0FBSyx1QkFBdUIsSUFBSSxLQUFLLFFBQVEsTUFBTSxnQkFBZ0IsTUFBTSxLQUFLLGlCQUFpQixLQUFLLENBQUMsQ0FBQztBQUV0RyxXQUFLLHVCQUF1QixJQUFJLEtBQUssb0JBQW9CLHVCQUF1QixLQUFLLFFBQVEsTUFBTSxXQUFXLEdBQUc7QUFBQSxRQUNoSCxlQUFlLENBQUMsVUFBVSxLQUFLLE1BQU0sT0FBTyxNQUFNO0FBQUEsTUFDbkQsQ0FBQyxDQUFDO0FBRUYsV0FBSyx1QkFBdUIsSUFBSSxLQUFLLFFBQVEsTUFBTSxZQUFZLE1BQU07QUFBRSxhQUFLLG1CQUFtQixLQUFLO0FBQUEsTUFBRyxDQUFDLENBQUM7QUFFekcsV0FBSyxLQUFLLGNBQWM7QUFFeEIsc0JBQWdCLE9BQU87QUFDdkIsVUFBSSxtQkFBbUI7QUFDdEI7QUFBQSxNQUNEO0FBRUEsV0FBSyxnQkFBZ0IsTUFBTSxPQUFPLE1BQU0sUUFBUTtBQUNoRCxXQUFLLG9CQUFvQixLQUFLO0FBQUEsSUFDL0IsU0FBUyxHQUFHO0FBQ1gsV0FBSyxXQUFXLEtBQUssd0NBQXdDLENBQUM7QUFDOUQsVUFBSSxrQkFBa0IsQ0FBQyxHQUFHO0FBQ3pCLGNBQU07QUFBQSxNQUNQO0FBR0EsVUFBeUIsRUFBRyx3QkFBd0Isb0JBQW9CLGdCQUFnQjtBQUN2RixZQUFJO0FBQ0osWUFBSSxhQUFhLDRCQUE0QjtBQUM1QyxvQkFBVSxTQUFTLHdDQUF3Qyx3RkFBd0YsU0FBUyxXQUFXLEVBQUUsSUFBSSxDQUFDO0FBQUEsUUFDL0ssT0FBTztBQUNOLG9CQUFVLFNBQVMsMkNBQTJDLGdGQUFnRjtBQUFBLFFBQy9JO0FBRUEsY0FBTSx3QkFBd0IsS0FBSyxPQUFPLE9BQU8sU0FBUyxTQUFTLEtBQUssbUJBQW1CO0FBQUEsTUFDNUY7QUFFQSxZQUFNLFFBQVEsc0JBQXNCLGFBQWEsUUFBUSxJQUFJLElBQUksTUFBTyxJQUFJLEVBQUUsVUFBVSxFQUFHLEdBQUc7QUFBQSxRQUM3RixTQUFTO0FBQUEsVUFDUixJQUFJO0FBQUEsVUFBOEMsT0FBTyxTQUFTLDRCQUE0QixxQkFBcUI7QUFBQSxVQUFHLEtBQUssWUFBWTtBQUN0SSxrQkFBTSxtQkFBbUIsS0FBSyxlQUFlO0FBQzdDLGdCQUFJLENBQUMsa0JBQWtCO0FBQ3RCO0FBQUEsWUFDRDtBQUVBLGtCQUFNLHVCQUF1Qix1QkFBdUIsZ0JBQWdCLGlCQUFpQixLQUFLO0FBQzFGLGdCQUFJLENBQUMsc0JBQXNCO0FBQzFCO0FBQUEsWUFDRDtBQUVBLGdCQUFJLHFCQUFxQixTQUFTLE1BQU0sTUFBTSxVQUFVLFNBQVMsR0FBRztBQUVuRSxxQkFBTyxLQUFLLGVBQWUsV0FBVztBQUFBLGdCQUNyQyxVQUFVO0FBQUEsZ0JBQ1YsU0FBUztBQUFBLGtCQUNSLFVBQVUsMkJBQTJCO0FBQUEsa0JBQ3JDLFFBQVE7QUFBQTtBQUFBLGdCQUNUO0FBQUEsY0FDRCxDQUFDO0FBQUEsWUFDRjtBQUVBO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsR0FBRyxFQUFFLGFBQWEsS0FBSyxDQUFDO0FBRXhCLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE1BQXlCLE9BQTRCLFVBQThCO0FBQzFHLFVBQU0sWUFBWSxLQUFLO0FBd0N2QixVQUFNLFlBQVksVUFBVSxXQUFXO0FBQ3ZDLFVBQU0scUJBQXFCLFVBQVUsb0JBQW9CO0FBQ3pELFVBQU0sY0FBYyxVQUFVLGFBQWE7QUFDM0MsVUFBTSxvQkFBb0IsVUFBVSxtQkFBbUI7QUFDdkQsVUFBTSx1QkFBdUIsVUFBVSxzQkFBc0I7QUFDN0QsVUFBTSxlQUFlLFVBQVUsY0FBYztBQUU3QyxRQUFJLDhCQUE4QjtBQUNsQyxRQUFJLHVCQUF1QjtBQUMzQixRQUFJLDZCQUE2QjtBQUNqQyxRQUFJLGdDQUFnQztBQUNwQyxRQUFJLHdCQUF3QjtBQUU1QixRQUFJLGNBQWMsVUFBYSx1QkFBdUIsUUFBVztBQUNoRSxvQ0FBOEIscUJBQXFCO0FBRW5ELFVBQUksZ0JBQWdCLFFBQVc7QUFDOUIsK0JBQXVCLGNBQWM7QUFBQSxNQUN0QztBQUVBLFVBQUksc0JBQXNCLFFBQVc7QUFDcEMscUNBQTZCLG9CQUFvQjtBQUFBLE1BRWxEO0FBRUEsVUFBSSx5QkFBeUIsUUFBVztBQUN2Qyx3Q0FBZ0MsdUJBQXVCO0FBQUEsTUFDeEQ7QUFFQSxVQUFJLGlCQUFpQixRQUFXO0FBQy9CLGdDQUF3QixlQUFlO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBR0EsUUFBSSxnQkFBb0M7QUFDeEMsUUFBSSxjQUFrQztBQUN0QyxRQUFJLGNBQWtDO0FBQ3RDLFFBQUksY0FBa0M7QUFDdEMsUUFBSSxhQUFpQztBQUNyQyxRQUFJLGlCQUFxQztBQUN6QyxRQUFJLHNCQUEwQztBQUM5QyxRQUFJLFVBQVU7QUFDYixZQUFNLFlBQVksSUFBSSxVQUFVO0FBQ2hDLGlCQUFXLFFBQVEsU0FBUyxPQUFPO0FBQ2xDLFlBQUksS0FBSyxhQUFhLFNBQVMsTUFBTTtBQUNwQywyQkFBaUIsaUJBQWlCLEtBQUs7QUFDdkMsd0JBQWMsY0FBYyxLQUFLLEtBQUssY0FBYztBQUNwRCx5QkFBZSxlQUFlLEtBQUssS0FBSyxRQUFRO0FBQ2hELHlCQUFlLGVBQWUsS0FBSyxLQUFLLFFBQVEsT0FBTyxDQUFDLE1BQU0sUUFBUSxPQUFPLElBQUksUUFBUSxPQUFPLENBQUMsTUFBTSxTQUFTLE9BQU8sS0FBSyxLQUFLLFlBQVksQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUNuSixPQUFPO0FBQ04seUJBQWUsZUFBZSxLQUFLO0FBQ25DLDRCQUFrQixjQUFjLEtBQUssS0FBSyxjQUFjO0FBQUEsUUFDekQ7QUFBQSxNQUNEO0FBQ0EsNEJBQXNCLFVBQVUsUUFBUTtBQUFBLElBQ3pDO0FBRUEsU0FBSyxXQUFXLE1BQU0sdUNBQXVDLFVBQVUsSUFBSSxTQUFTLEtBQUssRUFBRSwyQkFBMkIsMkJBQTJCLGdCQUFnQixvQkFBb0Isa0JBQWtCLDBCQUEwQixxQkFBcUIsNkJBQTZCLGlCQUFpQixxQkFBcUIsRUFBRTtBQUUzVCxTQUFLLGlCQUFpQixXQUE0RSwyQkFBMkI7QUFBQSxNQUM1SCxRQUFRLE1BQU0sU0FBUztBQUFBLE1BQ3ZCLEtBQUssUUFBUSxNQUFNLFFBQVE7QUFBQSxNQUMzQixVQUFVLE1BQU07QUFBQSxNQUNoQixvQkFBb0I7QUFBQSxNQUNwQixhQUFhO0FBQUEsTUFDYixtQkFBbUI7QUFBQSxNQUNuQixzQkFBc0I7QUFBQSxNQUN0QixjQUFjO0FBQUEsTUFDZDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLGFBQW1CO0FBQzNCLFNBQUssZUFBZSxNQUFNO0FBRTFCLFFBQUksS0FBSyxRQUFRLE9BQU87QUFDdkIsV0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQ3BDLFdBQUssUUFBUSxNQUFNLFdBQVc7QUFBQSxJQUMvQjtBQUNBLFVBQU0sV0FBVztBQUFBLEVBQ2xCO0FBQUEsRUFFUyxXQUFXLFNBQW1EO0FBQ3RFLFNBQUssUUFBUSxPQUFPLFdBQVcsT0FBTztBQUN0QyxVQUFNLFdBQVcsT0FBTztBQUFBLEVBQ3pCO0FBQUEsRUFFbUIsWUFBa0I7QUFDcEMsU0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQ3BDLFVBQU0sVUFBVTtBQUFBLEVBQ2pCO0FBQUEsRUFFUyxlQUFxRDtBQUM3RCxVQUFNLFFBQVEsS0FBSztBQUNuQixRQUFJLEVBQUUsaUJBQWlCLHNCQUFzQjtBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUsscUJBQXFCLEtBQUs7QUFDL0IsV0FBTyxLQUFLLDZCQUE2QixLQUFLO0FBQUEsRUFDL0M7QUFBQSxFQUVBLGVBQWlEO0FBQ2hELFFBQUksS0FBSyxRQUFRLE9BQU87QUFDdkIsWUFBTSxhQUFhLEtBQUssUUFBUSxNQUFNLGNBQWM7QUFDcEQsVUFBSSxZQUFZO0FBQ2YsY0FBTSxVQUFVLFdBQVc7QUFDM0IsZUFBTyxJQUFJLHdCQUF3QixTQUFTLFdBQVcsY0FBYyxDQUFDO0FBQUEsTUFDdkU7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLG9CQUErQztBQUM5QyxVQUFNLFNBQVMsS0FBSyxXQUFXO0FBQy9CLFFBQUksQ0FBQyxRQUFRO0FBQ1osWUFBTSxJQUFJLE1BQU0sOENBQThDO0FBQUEsSUFDL0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixXQUFXLE9BQU87QUFBQSxNQUNsQixZQUFZO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGtCQUFrQixnQkFBaUQ7QUFDbEUsVUFBTSxTQUFTLEtBQUssV0FBVztBQUMvQixRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLHNDQUFzQztBQUFBLElBQ3ZEO0FBRUEsV0FBTyxhQUFhLGVBQWUsU0FBUztBQUFBLEVBQzdDO0FBQUEsRUFFUSxxQkFBcUIsT0FBc0M7QUFDbEUsUUFBSSxLQUFLLFFBQVEsU0FBUyxpQkFBaUIscUJBQXFCO0FBQy9ELFVBQUksS0FBSyxRQUFRLE1BQU0sWUFBWTtBQUNsQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLFFBQVEsS0FBSyxRQUFRLE1BQU0sbUJBQW1CO0FBQ3BELFdBQUssZUFBZSxnQkFBZ0IsS0FBSyxPQUFPLE1BQU0sVUFBVSxLQUFLO0FBQUEsSUFDdEU7QUFBQSxFQUNEO0FBQUEsRUFFUSw2QkFBNkIsT0FBa0U7QUFDdEcsVUFBTSxTQUFTLEtBQUssZUFBZSxnQkFBZ0IsS0FBSyxPQUFPLE1BQU0sUUFBUTtBQUM3RSxRQUFJLFFBQVE7QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUdBLGVBQVcsU0FBUyxLQUFLLG9CQUFvQixVQUFVLFlBQVksb0JBQW9CLEdBQUc7QUFDekYsVUFBSSxNQUFNLHFCQUFxQixRQUFRLE1BQU0sNEJBQTRCLGtCQUFrQixNQUFNLGNBQWMsUUFBUSxLQUFLLEdBQUc7QUFDOUgsZUFBTyxNQUFNLGlCQUFpQixRQUFRLE9BQU8sbUJBQW1CO0FBQUEsTUFDakU7QUFBQSxJQUNEO0FBQ0E7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFPLFdBQTBCLFVBQWtDO0FBQ2xFLFNBQUssYUFBYSxVQUFVLE9BQU8sYUFBYSxVQUFVLFFBQVEsT0FBUSxVQUFVLFNBQVMsR0FBRztBQUNoRyxTQUFLLGFBQWEsVUFBVSxPQUFPLGdCQUFnQixVQUFVLFFBQVEsR0FBRztBQUN4RSxTQUFLLGdCQUFnQixFQUFFLFdBQVcsU0FBUztBQUUzQyxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsRUFBRSxLQUFLLGlCQUFpQixzQkFBc0I7QUFDeEU7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLE1BQU0sU0FBUyxTQUFTLE1BQU0sS0FBSyxXQUFXLElBQUksU0FBUyxLQUFLLEtBQUssUUFBUSxPQUFPLFNBQVMsR0FBRztBQU94RztBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssVUFBVSxHQUFHO0FBQ3JCLFdBQUssUUFBUSxNQUFNLE9BQU8sV0FBVyxLQUFLLGNBQWMsUUFBUTtBQUFBLElBQ2pFO0FBQUEsRUFDRDtBQUFBO0FBR0Q7QUExbUJhLGVBQ0ksS0FBYTtBQURqQixpQkFBTjtBQUFBLEVBNkJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTlDVTtBQTRtQmIsTUFBTSx3QkFBd0Q7QUFBQSxFQUU3RCxZQUNrQixTQUNBLFlBQ2hCO0FBRmdCO0FBQ0E7QUFBQSxFQUNkO0FBQUEsRUFFSixRQUFRLE9BQStEO0FBQ3RFLFFBQUksRUFBRSxpQkFBaUIsMEJBQTBCO0FBQ2hELGFBQU8saUNBQWlDO0FBQUEsSUFDekM7QUFFQSxRQUFJLFFBQVEsS0FBSyxTQUFTLE1BQU0sT0FBTyxHQUFHO0FBQ3pDLGFBQU8saUNBQWlDO0FBQUEsSUFDekM7QUFFQSxXQUFPLGlDQUFpQztBQUFBLEVBQ3pDO0FBQUEsRUFFQSxRQUFRLFNBQWlEO0FBQ3hELFVBQU0sa0JBQTBDO0FBQUEsTUFDL0MsYUFBYTtBQUFBLFFBQ1osVUFBVSxLQUFLO0FBQUEsUUFDZixTQUFTO0FBQUEsVUFDUixXQUFXLEtBQUssV0FBVyxDQUFDO0FBQUEsUUFDN0I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sT0FBTyxpQkFBaUIsT0FBTztBQUV0QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYztBQUNiLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFDRDtBQUVPLFNBQVMsK0JBQStCLFFBQWlDLFlBQWtDO0FBQ2pILE1BQUksUUFBUSxNQUFNLE1BQU0sZUFBZSxJQUFJO0FBQzFDLFVBQU0saUJBQWlCLE9BQU8sV0FBVztBQUN6QyxRQUFJLGdCQUFnQjtBQUNuQixpQkFBVyxDQUFDLEdBQUdDLE9BQU0sS0FBSyxlQUFlLGFBQWE7QUFDckQsWUFBSUEsWUFBVyxZQUFZO0FBQzFCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiZXh0ZW5zaW9uSW5mbyIsICJlZGl0b3IiXQp9Cg==
