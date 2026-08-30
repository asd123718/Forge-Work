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
import { mainWindow } from "../../../base/browser/window.js";
import { timeout } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { isValidBasename } from "../../../base/common/extpath.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { observableValue } from "../../../base/common/observable.js";
import { posix, win32 } from "../../../base/common/path.js";
import { isWindows } from "../../../base/common/platform.js";
import { env } from "../../../base/common/process.js";
import { basename, isEqual } from "../../../base/common/resources.js";
import { newWriteableStream } from "../../../base/common/stream.js";
import { assertReturnsDefined, upcast } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { ICodeEditorService } from "../../../editor/browser/services/codeEditorService.js";
import { Position as EditorPosition } from "../../../editor/common/core/position.js";
import { Range } from "../../../editor/common/core/range.js";
import { Selection } from "../../../editor/common/core/selection.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../editor/common/languages/languageConfigurationRegistry.js";
import { DefaultEndOfLine, EndOfLinePreference } from "../../../editor/common/model.js";
import { createTextBufferFactoryFromStream } from "../../../editor/common/model/textModel.js";
import { IEditorWorkerService } from "../../../editor/common/services/editorWorker.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../editor/common/services/languageFeaturesService.js";
import { LanguageService } from "../../../editor/common/services/languageService.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ModelService } from "../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../editor/common/services/resolverService.js";
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from "../../../editor/common/services/textResourceConfiguration.js";
import { ITreeSitterLibraryService } from "../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { TestCodeEditor } from "../../../editor/test/browser/testCodeEditor.js";
import { TestLanguageConfigurationService } from "../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { TestEditorWorkerService } from "../../../editor/test/common/services/testEditorWorkerService.js";
import { TestTreeSitterLibraryService } from "../../../editor/test/common/services/testTreeSitterLibraryService.js";
import { IAccessibilityService } from "../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IAccessibilitySignalService } from "../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IActionViewItemService, NullActionViewItemService } from "../../../platform/actions/browser/actionViewItemService.js";
import { IMenuService } from "../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { ContextMenuService } from "../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService, IContextViewService } from "../../../platform/contextview/browser/contextView.js";
import { ContextViewService } from "../../../platform/contextview/browser/contextViewService.js";
import { IDialogService, IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../platform/dialogs/test/common/testDialogService.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { TargetPlatform } from "../../../platform/extensions/common/extensions.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../platform/files/common/files.js";
import { FileService } from "../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../platform/files/common/inMemoryFilesystemProvider.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { NullHoverService } from "../../../platform/hover/test/browser/nullHoverService.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { MockContextKeyService, MockKeybindingService } from "../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { IListService } from "../../../platform/list/browser/listService.js";
import { ILoggerService, ILogService, NullLogService } from "../../../platform/log/common/log.js";
import { IMarkdownRendererService, MarkdownRendererService } from "../../../platform/markdown/browser/markdownRenderer.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../platform/notification/test/common/testNotificationService.js";
import product from "../../../platform/product/common/product.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IProgressService, Progress } from "../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from "../../../platform/remote/common/remoteSocketFactoryService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../platform/telemetry/common/telemetryUtils.js";
import { ITerminalLogService } from "../../../platform/terminal/common/terminal.js";
import { TerminalLogService } from "../../../platform/terminal/common/terminalLogService.js";
import { ColorScheme } from "../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../platform/undoRedo/common/undoRedoService.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../platform/uriIdentity/common/uriIdentityService.js";
import { IUserDataProfilesService, UserDataProfilesService } from "../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../platform/workspace/common/workspaceTrust.js";
import { TestWorkspace } from "../../../platform/workspace/test/common/testWorkspace.js";
import { IWorkspacesService } from "../../../platform/workspaces/common/workspaces.js";
import { EditorPaneDescriptor } from "../../browser/editor.js";
import { Extensions as PaneCompositeExtensions } from "../../browser/panecomposite.js";
import { DEFAULT_EDITOR_PART_OPTIONS } from "../../browser/parts/editor/editor.js";
import { EditorPane } from "../../browser/parts/editor/editorPane.js";
import { MainEditorPart } from "../../browser/parts/editor/editorPart.js";
import { EditorParts } from "../../browser/parts/editor/editorParts.js";
import { SideBySideEditor } from "../../browser/parts/editor/sideBySideEditor.js";
import { TextEditorPaneSelection } from "../../browser/parts/editor/textEditor.js";
import { TextResourceEditor } from "../../browser/parts/editor/textResourceEditor.js";
import { EditorExtensions, EditorInputCapabilities, EditorExtensions as Extensions } from "../../common/editor.js";
import { EditorInput } from "../../common/editor/editorInput.js";
import { SideBySideEditorInput } from "../../common/editor/sideBySideEditorInput.js";
import { TextResourceEditorInput } from "../../common/editor/textResourceEditorInput.js";
import { ViewContainerLocation } from "../../common/views.js";
import { IChatWidgetService } from "../../contrib/chat/browser/chat.js";
import { FileEditorInput } from "../../contrib/files/browser/editors/fileEditorInput.js";
import { TextFileEditor } from "../../contrib/files/browser/editors/textFileEditor.js";
import { FILE_EDITOR_INPUT_ID } from "../../contrib/files/common/files.js";
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService } from "../../contrib/terminal/browser/terminal.js";
import { TerminalConfigurationService } from "../../contrib/terminal/browser/terminalConfigurationService.js";
import { IEnvironmentVariableService } from "../../contrib/terminal/common/environmentVariable.js";
import { EnvironmentVariableService } from "../../contrib/terminal/common/environmentVariableService.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../../contrib/terminal/common/terminal.js";
import { IChatEntitlementService } from "../../services/chat/common/chatEntitlementService.js";
import { IDecorationsService } from "../../services/decorations/common/decorations.js";
import { CodeEditorService } from "../../services/editor/browser/codeEditorService.js";
import { EditorPaneService } from "../../services/editor/browser/editorPaneService.js";
import { EditorResolverService } from "../../services/editor/browser/editorResolverService.js";
import { CustomEditorLabelService, ICustomEditorLabelService } from "../../services/editor/common/customEditorLabelService.js";
import { GroupOrientation, IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorPaneService } from "../../services/editor/common/editorPaneService.js";
import { IEditorResolverService } from "../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { BrowserWorkbenchEnvironmentService } from "../../services/environment/browser/environmentService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { EnablementState } from "../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { BrowserElevatedFileService } from "../../services/files/browser/elevatedFileService.js";
import { IElevatedFileService } from "../../services/files/common/elevatedFileService.js";
import { FilesConfigurationService, IFilesConfigurationService } from "../../services/filesConfiguration/common/filesConfigurationService.js";
import { IHistoryService } from "../../services/history/common/history.js";
import { IHostService } from "../../services/host/browser/host.js";
import { LabelService } from "../../services/label/common/labelService.js";
import { ILanguageDetectionService } from "../../services/languageDetection/common/languageDetectionWorkerService.js";
import { IWorkbenchLayoutService, Parts } from "../../services/layout/browser/layoutService.js";
import { ILifecycleService, ShutdownReason } from "../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { IPathService } from "../../services/path/common/pathService.js";
import { QuickInputService } from "../../services/quickinput/browser/quickInputService.js";
import { IRemoteAgentService } from "../../services/remote/common/remoteAgentService.js";
import { BrowserTextFileService } from "../../services/textfile/browser/browserTextFileService.js";
import { EncodingOracle } from "../../services/textfile/browser/textFileService.js";
import { UTF16be, UTF16le, UTF8_with_bom } from "../../services/textfile/common/encoding.js";
import { ITextEditorService, TextEditorService } from "../../services/textfile/common/textEditorService.js";
import { TextFileEditorModel } from "../../services/textfile/common/textFileEditorModel.js";
import { ITextFileService } from "../../services/textfile/common/textfiles.js";
import { TextModelResolverService } from "../../services/textmodelResolver/common/textModelResolverService.js";
import { UntitledTextEditorInput } from "../../services/untitled/common/untitledTextEditorInput.js";
import { IUntitledTextEditorService, UntitledTextEditorService } from "../../services/untitled/common/untitledTextEditorService.js";
import { IUserDataProfileService } from "../../services/userDataProfile/common/userDataProfile.js";
import { UserDataProfileService } from "../../services/userDataProfile/common/userDataProfileService.js";
import { BrowserWorkingCopyBackupService } from "../../services/workingCopy/browser/workingCopyBackupService.js";
import { IWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackup.js";
import { InMemoryWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackupService.js";
import { IWorkingCopyEditorService, WorkingCopyEditorService } from "../../services/workingCopy/common/workingCopyEditorService.js";
import { IWorkingCopyFileService, WorkingCopyFileService } from "../../services/workingCopy/common/workingCopyFileService.js";
import { IWorkingCopyService, WorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { TestChatEntitlementService, TestContextService, TestExtensionService, TestFileService, TestHistoryService, TestLifecycleService, TestLoggerService, TestMarkerService, TestProductService, TestStorageService, TestTextResourcePropertiesService, TestWorkspaceTrustManagementService, TestWorkspaceTrustRequestService } from "../common/workbenchTestServices.js";
import { DefaultAccountService } from "../../services/accounts/browser/defaultAccount.js";
function createFileEditorInput(instantiationService, resource) {
  return instantiationService.createInstance(FileEditorInput, resource, void 0, void 0, void 0, void 0, void 0, void 0);
}
Registry.as(EditorExtensions.EditorFactory).registerFileEditorFactory({
  typeId: FILE_EDITOR_INPUT_ID,
  createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService) => {
    return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
  },
  isFileEditor: (obj) => {
    return obj instanceof FileEditorInput;
  }
});
class TestTextResourceEditor extends TextResourceEditor {
  createEditorControl(parent, configuration) {
    this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, {}));
  }
}
class TestTextFileEditor extends TextFileEditor {
  createEditorControl(parent, configuration) {
    this.editorControl = this._register(this.instantiationService.createInstance(TestCodeEditor, parent, configuration, { contributions: [] }));
  }
  setSelection(selection, reason) {
    this._options = selection ? upcast({ selection }) : void 0;
    this._onDidChangeSelection.fire({ reason });
  }
  getSelection() {
    const options = this.options;
    if (!options) {
      return void 0;
    }
    const textSelection = options.selection;
    if (!textSelection) {
      return void 0;
    }
    return new TextEditorPaneSelection(new Selection(textSelection.startLineNumber, textSelection.startColumn, textSelection.endLineNumber ?? textSelection.startLineNumber, textSelection.endColumn ?? textSelection.startColumn));
  }
}
class TestWorkingCopyService extends WorkingCopyService {
  testUnregisterWorkingCopy(workingCopy) {
    return super.unregisterWorkingCopy(workingCopy);
  }
}
function workbenchInstantiationService(overrides, disposables = new DisposableStore()) {
  const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
    [ILifecycleService, disposables.add(new TestLifecycleService())],
    [IActionViewItemService, new SyncDescriptor(NullActionViewItemService)]
  )));
  instantiationService.stub(IProductService, TestProductService);
  instantiationService.stub(IEditorWorkerService, new TestEditorWorkerService());
  instantiationService.stub(IWorkingCopyService, disposables.add(new TestWorkingCopyService()));
  const environmentService = overrides?.environmentService ? overrides.environmentService(instantiationService) : TestEnvironmentService;
  instantiationService.stub(IEnvironmentService, environmentService);
  instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
  instantiationService.stub(ILogService, new NullLogService());
  const contextKeyService = overrides?.contextKeyService ? overrides.contextKeyService(instantiationService) : instantiationService.createInstance(MockContextKeyService);
  instantiationService.stub(IContextKeyService, contextKeyService);
  instantiationService.stub(IProgressService, new TestProgressService());
  const workspaceContextService = new TestContextService(TestWorkspace);
  instantiationService.stub(IWorkspaceContextService, workspaceContextService);
  const configService = overrides?.configurationService ? overrides.configurationService(instantiationService) : new TestConfigurationService({
    files: {
      participants: {
        timeout: 6e4
      }
    }
  });
  instantiationService.stub(IConfigurationService, configService);
  const textResourceConfigurationService = new TestTextResourceConfigurationService(configService);
  instantiationService.stub(ITextResourceConfigurationService, textResourceConfigurationService);
  instantiationService.stub(IUntitledTextEditorService, disposables.add(instantiationService.createInstance(UntitledTextEditorService)));
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IRemoteAgentService, new TestRemoteAgentService());
  instantiationService.stub(ILanguageDetectionService, new TestLanguageDetectionService());
  instantiationService.stub(IPathService, overrides?.pathService ? overrides.pathService(instantiationService) : new TestPathService());
  const layoutService = new TestLayoutService();
  instantiationService.stub(IWorkbenchLayoutService, layoutService);
  instantiationService.stub(IDialogService, new TestDialogService());
  const accessibilityService = new TestAccessibilityService();
  instantiationService.stub(IAccessibilityService, accessibilityService);
  instantiationService.stub(IAccessibilitySignalService, {
    playSignal: async () => {
    },
    isSoundEnabled(signal) {
      return false;
    }
  });
  instantiationService.stub(IFileDialogService, instantiationService.createInstance(TestFileDialogService));
  instantiationService.stub(ILanguageService, disposables.add(instantiationService.createInstance(LanguageService)));
  instantiationService.stub(ILanguageFeaturesService, new LanguageFeaturesService());
  instantiationService.stub(ILanguageFeatureDebounceService, instantiationService.createInstance(LanguageFeatureDebounceService));
  instantiationService.stub(IHistoryService, new TestHistoryService());
  instantiationService.stub(ITextResourcePropertiesService, new TestTextResourcePropertiesService(configService));
  instantiationService.stub(IUndoRedoService, instantiationService.createInstance(UndoRedoService));
  const themeService = new TestThemeService();
  instantiationService.stub(IThemeService, themeService);
  instantiationService.stub(ILanguageConfigurationService, disposables.add(new TestLanguageConfigurationService()));
  instantiationService.stub(ITreeSitterLibraryService, new TestTreeSitterLibraryService());
  instantiationService.stub(IModelService, disposables.add(instantiationService.createInstance(ModelService)));
  const fileService = overrides?.fileService ? overrides.fileService(instantiationService) : disposables.add(new TestFileService());
  instantiationService.stub(IFileService, fileService);
  instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
  const markerService = new TestMarkerService();
  instantiationService.stub(IMarkerService, markerService);
  instantiationService.stub(IFilesConfigurationService, disposables.add(instantiationService.createInstance(TestFilesConfigurationService)));
  const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(instantiationService.createInstance(UserDataProfilesService)));
  instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(userDataProfilesService.defaultProfile)));
  instantiationService.stub(IWorkingCopyBackupService, overrides?.workingCopyBackupService ? overrides?.workingCopyBackupService(instantiationService) : disposables.add(new TestWorkingCopyBackupService()));
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  instantiationService.stub(INotificationService, new TestNotificationService());
  instantiationService.stub(IUntitledTextEditorService, disposables.add(instantiationService.createInstance(UntitledTextEditorService)));
  instantiationService.stub(IMenuService, new TestMenuService());
  const keybindingService = new MockKeybindingService();
  instantiationService.stub(IKeybindingService, keybindingService);
  instantiationService.stub(IDecorationsService, new TestDecorationsService());
  instantiationService.stub(IExtensionService, new TestExtensionService());
  instantiationService.stub(IWorkingCopyFileService, disposables.add(instantiationService.createInstance(WorkingCopyFileService)));
  instantiationService.stub(ITextFileService, overrides?.textFileService ? overrides.textFileService(instantiationService) : disposables.add(instantiationService.createInstance(TestTextFileService)));
  instantiationService.stub(IHostService, instantiationService.createInstance(TestHostService));
  instantiationService.stub(ITextModelService, disposables.add(instantiationService.createInstance(TextModelResolverService)));
  instantiationService.stub(ILoggerService, disposables.add(new TestLoggerService(TestEnvironmentService.logsHome)));
  const editorGroupService = new TestEditorGroupsService([new TestEditorGroupView(0)]);
  instantiationService.stub(IEditorGroupsService, editorGroupService);
  instantiationService.stub(ILabelService, disposables.add(instantiationService.createInstance(LabelService)));
  const editorService = overrides?.editorService ? overrides.editorService(instantiationService) : disposables.add(new TestEditorService(editorGroupService));
  instantiationService.stub(IEditorService, editorService);
  instantiationService.stub(IEditorPaneService, new EditorPaneService());
  instantiationService.stub(IWorkingCopyEditorService, disposables.add(instantiationService.createInstance(WorkingCopyEditorService)));
  instantiationService.stub(IEditorResolverService, disposables.add(instantiationService.createInstance(EditorResolverService)));
  const textEditorService = overrides?.textEditorService ? overrides.textEditorService(instantiationService) : disposables.add(instantiationService.createInstance(TextEditorService));
  instantiationService.stub(ITextEditorService, textEditorService);
  instantiationService.stub(ICodeEditorService, disposables.add(new CodeEditorService(editorService, themeService, configService)));
  instantiationService.stub(IPaneCompositePartService, disposables.add(new TestPaneCompositeService()));
  instantiationService.stub(IListService, new TestListService());
  instantiationService.stub(IContextViewService, disposables.add(instantiationService.createInstance(ContextViewService)));
  instantiationService.stub(IContextMenuService, disposables.add(instantiationService.createInstance(ContextMenuService)));
  instantiationService.stub(IQuickInputService, disposables.add(new QuickInputService(configService, instantiationService, keybindingService, contextKeyService, themeService, layoutService)));
  instantiationService.stub(IWorkspacesService, new TestWorkspacesService());
  instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
  instantiationService.stub(IWorkspaceTrustRequestService, disposables.add(new TestWorkspaceTrustRequestService(false)));
  instantiationService.stub(ITerminalInstanceService, new TestTerminalInstanceService());
  instantiationService.stub(ITerminalEditorService, new TestTerminalEditorService());
  instantiationService.stub(ITerminalGroupService, new TestTerminalGroupService());
  instantiationService.stub(ITerminalProfileService, new TestTerminalProfileService());
  instantiationService.stub(ITerminalProfileResolverService, new TestTerminalProfileResolverService());
  instantiationService.stub(ITerminalConfigurationService, disposables.add(instantiationService.createInstance(TestTerminalConfigurationService)));
  instantiationService.stub(ITerminalLogService, disposables.add(instantiationService.createInstance(TerminalLogService)));
  instantiationService.stub(IEnvironmentVariableService, disposables.add(instantiationService.createInstance(EnvironmentVariableService)));
  instantiationService.stub(IElevatedFileService, new BrowserElevatedFileService());
  instantiationService.stub(IRemoteSocketFactoryService, new RemoteSocketFactoryService());
  instantiationService.stub(ICustomEditorLabelService, disposables.add(new CustomEditorLabelService(configService, workspaceContextService)));
  instantiationService.stub(IHoverService, NullHoverService);
  instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
  instantiationService.stub(IMarkdownRendererService, instantiationService.createInstance(MarkdownRendererService));
  instantiationService.stub(IChatWidgetService, instantiationService.createInstance(TestChatWidgetService));
  instantiationService.stub(IDefaultAccountService, DefaultAccountService);
  return instantiationService;
}
let TestServiceAccessor = class {
  constructor(lifecycleService, textFileService, textEditorService, workingCopyFileService, filesConfigurationService, contextService, modelService, fileService, fileDialogService, dialogService, workingCopyService, editorService, editorPaneService, environmentService, pathService, editorGroupService, editorResolverService, languageService, textModelResolverService, untitledTextEditorService, testConfigurationService, workingCopyBackupService, hostService, quickInputService, labelService, logService, uriIdentityService, instantitionService, notificationService, workingCopyEditorService, instantiationService, elevatedFileService, workspaceTrustRequestService, decorationsService, progressService) {
    this.lifecycleService = lifecycleService;
    this.textFileService = textFileService;
    this.textEditorService = textEditorService;
    this.workingCopyFileService = workingCopyFileService;
    this.filesConfigurationService = filesConfigurationService;
    this.contextService = contextService;
    this.modelService = modelService;
    this.fileService = fileService;
    this.fileDialogService = fileDialogService;
    this.dialogService = dialogService;
    this.workingCopyService = workingCopyService;
    this.editorService = editorService;
    this.editorPaneService = editorPaneService;
    this.environmentService = environmentService;
    this.pathService = pathService;
    this.editorGroupService = editorGroupService;
    this.editorResolverService = editorResolverService;
    this.languageService = languageService;
    this.textModelResolverService = textModelResolverService;
    this.untitledTextEditorService = untitledTextEditorService;
    this.testConfigurationService = testConfigurationService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.hostService = hostService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    this.instantitionService = instantitionService;
    this.notificationService = notificationService;
    this.workingCopyEditorService = workingCopyEditorService;
    this.instantiationService = instantiationService;
    this.elevatedFileService = elevatedFileService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.decorationsService = decorationsService;
    this.progressService = progressService;
  }
};
TestServiceAccessor = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, ITextEditorService),
  __decorateParam(3, IWorkingCopyFileService),
  __decorateParam(4, IFilesConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IModelService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IFileDialogService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, IWorkingCopyService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IEditorPaneService),
  __decorateParam(13, IWorkbenchEnvironmentService),
  __decorateParam(14, IPathService),
  __decorateParam(15, IEditorGroupsService),
  __decorateParam(16, IEditorResolverService),
  __decorateParam(17, ILanguageService),
  __decorateParam(18, ITextModelService),
  __decorateParam(19, IUntitledTextEditorService),
  __decorateParam(20, IConfigurationService),
  __decorateParam(21, IWorkingCopyBackupService),
  __decorateParam(22, IHostService),
  __decorateParam(23, IQuickInputService),
  __decorateParam(24, ILabelService),
  __decorateParam(25, ILogService),
  __decorateParam(26, IUriIdentityService),
  __decorateParam(27, IInstantiationService),
  __decorateParam(28, INotificationService),
  __decorateParam(29, IWorkingCopyEditorService),
  __decorateParam(30, IInstantiationService),
  __decorateParam(31, IElevatedFileService),
  __decorateParam(32, IWorkspaceTrustRequestService),
  __decorateParam(33, IDecorationsService),
  __decorateParam(34, IProgressService)
], TestServiceAccessor);
let TestTextFileService = class extends BrowserTextFileService {
  constructor(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService) {
    super(
      fileService,
      untitledTextEditorService,
      lifecycleService,
      instantiationService,
      modelService,
      environmentService,
      dialogService,
      fileDialogService,
      textResourceConfigurationService,
      filesConfigurationService,
      codeEditorService,
      pathService,
      workingCopyFileService,
      uriIdentityService,
      languageService,
      elevatedFileService,
      logService,
      decorationsService
    );
    this.readStreamError = void 0;
    this.writeError = void 0;
  }
  setReadStreamErrorOnce(error) {
    this.readStreamError = error;
  }
  async readStream(resource, options) {
    if (this.readStreamError) {
      const error = this.readStreamError;
      this.readStreamError = void 0;
      throw error;
    }
    const content = await this.fileService.readFileStream(resource, options);
    return {
      resource: content.resource,
      name: content.name,
      mtime: content.mtime,
      ctime: content.ctime,
      etag: content.etag,
      encoding: "utf8",
      value: await createTextBufferFactoryFromStream(content.value),
      size: 10,
      readonly: false,
      locked: false,
      executable: false
    };
  }
  setWriteErrorOnce(error) {
    this.writeError = error;
  }
  async write(resource, value, options) {
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = void 0;
      throw error;
    }
    return super.write(resource, value, options);
  }
};
TestTextFileService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUntitledTextEditorService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, ITextResourceConfigurationService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, ICodeEditorService),
  __decorateParam(11, IPathService),
  __decorateParam(12, IWorkingCopyFileService),
  __decorateParam(13, IUriIdentityService),
  __decorateParam(14, ILanguageService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IElevatedFileService),
  __decorateParam(17, IDecorationsService)
], TestTextFileService);
class TestBrowserTextFileServiceWithEncodingOverrides extends BrowserTextFileService {
  get encoding() {
    if (!this._testEncoding) {
      this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
    }
    return this._testEncoding;
  }
}
class TestEncodingOracle extends EncodingOracle {
  get encodingOverrides() {
    return [
      { extension: "utf16le", encoding: UTF16le },
      { extension: "utf16be", encoding: UTF16be },
      { extension: "utf8bom", encoding: UTF8_with_bom }
    ];
  }
  set encodingOverrides(overrides) {
  }
}
class TestEnvironmentServiceWithArgs extends BrowserWorkbenchEnvironmentService {
  constructor() {
    super(...arguments);
    this.args = [];
  }
}
const TestEnvironmentService = new TestEnvironmentServiceWithArgs("", URI.file("tests").with({ scheme: "vscode-tests" }), /* @__PURE__ */ Object.create(null), TestProductService);
class TestProgressService {
  withProgress(options, task, onDidCancel) {
    return task(Progress.None);
  }
}
class TestDecorationsService {
  constructor() {
    this.onDidChangeDecorations = Event.None;
  }
  registerDecorationsProvider(_provider) {
    return Disposable.None;
  }
  getDecoration(_uri, _includeChildren, _overwrite) {
    return void 0;
  }
}
class TestMenuService {
  createMenu(_id, _scopedKeybindingService) {
    return {
      onDidChange: Event.None,
      dispose: () => void 0,
      getActions: () => []
    };
  }
  getMenuActions(id, contextKeyService, options) {
    return [];
  }
  getMenuContexts(id) {
    return /* @__PURE__ */ new Set();
  }
  resetHiddenStates() {
  }
}
let TestFileDialogService = class {
  constructor(pathService) {
    this.pathService = pathService;
  }
  async defaultFilePath(_schemeFilter) {
    return this.pathService.userHome();
  }
  async defaultFolderPath(_schemeFilter) {
    return this.pathService.userHome();
  }
  async defaultWorkspacePath(_schemeFilter) {
    return this.pathService.userHome();
  }
  async preferredHome(_schemeFilter) {
    return this.pathService.userHome();
  }
  pickFileFolderAndOpen(_options) {
    return Promise.resolve(0);
  }
  pickFileAndOpen(_options) {
    return Promise.resolve(0);
  }
  pickFolderAndOpen(_options) {
    return Promise.resolve(0);
  }
  pickWorkspaceAndOpen(_options) {
    return Promise.resolve(0);
  }
  setPickFileToSave(path) {
    this.fileToSave = path;
  }
  pickFileToSave(defaultUri, availableFileSystems) {
    return Promise.resolve(this.fileToSave);
  }
  showSaveDialog(_options) {
    return Promise.resolve(void 0);
  }
  showOpenDialog(_options) {
    return Promise.resolve(void 0);
  }
  setConfirmResult(result) {
    this.confirmResult = result;
  }
  showSaveConfirm(fileNamesOrResources) {
    return Promise.resolve(this.confirmResult);
  }
};
TestFileDialogService = __decorateClass([
  __decorateParam(0, IPathService)
], TestFileDialogService);
class TestLayoutService {
  constructor() {
    this.openedDefaultEditors = false;
    this.mainContainerDimension = { width: 800, height: 600 };
    this.activeContainerDimension = { width: 800, height: 600 };
    this.mainContainerOffset = { top: 0, quickPickTop: 0 };
    this.activeContainerOffset = { top: 0, quickPickTop: 0 };
    this.mainContainer = mainWindow.document.body;
    this.containers = [mainWindow.document.body];
    this.activeContainer = mainWindow.document.body;
    this.onDidChangeZenMode = Event.None;
    this.onDidChangeMainEditorCenteredLayout = Event.None;
    this.onDidChangeWindowMaximized = Event.None;
    this.onDidChangePanelPosition = Event.None;
    this.onDidChangePanelAlignment = Event.None;
    this.onDidChangePartVisibility = Event.None;
    this.onDidLayoutMainContainer = Event.None;
    this.onDidLayoutActiveContainer = Event.None;
    this.onDidLayoutContainer = Event.None;
    this.onDidChangeNotificationsVisibility = Event.None;
    this.onDidAddContainer = Event.None;
    this.onDidChangeActiveContainer = Event.None;
    this.onDidChangeAuxiliaryBarMaximized = Event.None;
    this.whenReady = Promise.resolve(void 0);
    this.whenRestored = Promise.resolve(void 0);
  }
  layout() {
  }
  isRestored() {
    return true;
  }
  hasFocus(_part) {
    return false;
  }
  isFloatingPanelsEnabled() {
    return false;
  }
  focusPart(_part) {
  }
  hasMainWindowBorder() {
    return false;
  }
  getMainWindowBorderRadius() {
    return void 0;
  }
  isVisible(_part) {
    return true;
  }
  getContainer() {
    return mainWindow.document.body;
  }
  whenContainerStylesLoaded() {
    return void 0;
  }
  isTitleBarHidden() {
    return false;
  }
  isStatusBarHidden() {
    return false;
  }
  isActivityBarHidden() {
    return false;
  }
  setActivityBarHidden(_hidden) {
  }
  setBannerHidden(_hidden) {
  }
  isSideBarHidden() {
    return false;
  }
  async setEditorHidden(_hidden) {
  }
  async setSideBarHidden(_hidden) {
  }
  async setAuxiliaryBarHidden(_hidden) {
  }
  async setPartHidden(_hidden, part) {
  }
  isSecondarySideBarVisible() {
    return false;
  }
  toggleSecondarySideBar() {
  }
  isPanelHidden() {
    return false;
  }
  async setPanelHidden(_hidden) {
  }
  toggleMaximizedPanel() {
  }
  isPanelMaximized() {
    return false;
  }
  toggleMaximizedAuxiliaryBar() {
  }
  setAuxiliaryBarMaximized(maximized) {
    return false;
  }
  isAuxiliaryBarMaximized() {
    return false;
  }
  getMenubarVisibility() {
    throw new Error("not implemented");
  }
  toggleMenuBar() {
  }
  getSideBarPosition() {
    return 0;
  }
  getPanelPosition() {
    return 0;
  }
  getPanelAlignment() {
    return "center";
  }
  async setPanelPosition(_position) {
  }
  async setPanelAlignment(_alignment) {
  }
  addClass(_clazz) {
  }
  removeClass(_clazz) {
  }
  getMaximumEditorDimensions() {
    throw new Error("not implemented");
  }
  toggleZenMode() {
  }
  isMainEditorLayoutCentered() {
    return false;
  }
  centerMainEditorLayout(_active) {
  }
  resizePart(_part, _sizeChangeWidth, _sizeChangeHeight) {
  }
  getSize(part) {
    throw new Error("Method not implemented.");
  }
  setSize(part, size) {
    throw new Error("Method not implemented.");
  }
  registerPart(part) {
    return Disposable.None;
  }
  isWindowMaximized(targetWindow) {
    return false;
  }
  updateWindowMaximizedState(targetWindow, maximized) {
  }
  getVisibleNeighborPart(part, direction) {
    return void 0;
  }
  focus() {
  }
}
const activeViewlet = {};
class TestPaneCompositeService extends Disposable {
  constructor() {
    super();
    this.parts = /* @__PURE__ */ new Map();
    this.parts.set(ViewContainerLocation.Panel, new TestPanelPart());
    this.parts.set(ViewContainerLocation.Sidebar, new TestSideBarPart());
    this.onDidPaneCompositeOpen = Event.any(...[ViewContainerLocation.Panel, ViewContainerLocation.Sidebar].map((loc) => Event.map(this.parts.get(loc).onDidPaneCompositeOpen, (composite) => {
      return { composite, viewContainerLocation: loc };
    })));
    this.onDidPaneCompositeClose = Event.any(...[ViewContainerLocation.Panel, ViewContainerLocation.Sidebar].map((loc) => Event.map(this.parts.get(loc).onDidPaneCompositeClose, (composite) => {
      return { composite, viewContainerLocation: loc };
    })));
  }
  getPartId(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).partId;
  }
  getRegistryId(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).registryId;
  }
  openPaneComposite(id, viewContainerLocation, focus) {
    return this.getPartByLocation(viewContainerLocation).openPaneComposite(id, focus);
  }
  getActivePaneComposite(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getActivePaneComposite();
  }
  getPaneComposite(id, viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getPaneComposite(id);
  }
  getPaneComposites(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getPaneComposites();
  }
  getProgressIndicator(id, viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getProgressIndicator(id);
  }
  hideActivePaneComposite(viewContainerLocation) {
    this.getPartByLocation(viewContainerLocation).hideActivePaneComposite();
  }
  getLastActivePaneCompositeId(viewContainerLocation) {
    return this.getPartByLocation(viewContainerLocation).getLastActivePaneCompositeId();
  }
  getPinnedPaneCompositeIds(viewContainerLocation) {
    throw new Error("Method not implemented.");
  }
  getVisiblePaneCompositeIds(viewContainerLocation) {
    throw new Error("Method not implemented.");
  }
  getPaneCompositeIds(viewContainerLocation) {
    throw new Error("Method not implemented.");
  }
  getPartByLocation(viewContainerLocation) {
    return assertReturnsDefined(this.parts.get(viewContainerLocation));
  }
}
class TestSideBarPart {
  constructor() {
    this.onDidViewletRegisterEmitter = new Emitter();
    this.onDidViewletDeregisterEmitter = new Emitter();
    this.onDidViewletOpenEmitter = new Emitter();
    this.onDidViewletCloseEmitter = new Emitter();
    this.partId = Parts.SIDEBAR_PART;
    this.registryId = PaneCompositeExtensions.Viewlets;
    this.element = void 0;
    this.minimumWidth = 0;
    this.maximumWidth = 0;
    this.minimumHeight = 0;
    this.maximumHeight = 0;
    this.onDidChange = Event.None;
    this.onDidPaneCompositeOpen = this.onDidViewletOpenEmitter.event;
    this.onDidPaneCompositeClose = this.onDidViewletCloseEmitter.event;
  }
  openPaneComposite(id, focus) {
    return Promise.resolve(void 0);
  }
  getPaneComposites() {
    return [];
  }
  getAllViewlets() {
    return [];
  }
  getActivePaneComposite() {
    return activeViewlet;
  }
  getDefaultViewletId() {
    return "workbench.view.explorer";
  }
  getPaneComposite(id) {
    return void 0;
  }
  getProgressIndicator(id) {
    return void 0;
  }
  hideActivePaneComposite() {
  }
  getLastActivePaneCompositeId() {
    return void 0;
  }
  dispose() {
  }
  getPinnedPaneCompositeIds() {
    return [];
  }
  getVisiblePaneCompositeIds() {
    return [];
  }
  getPaneCompositeIds() {
    return [];
  }
  layout(width, height, top, left) {
  }
}
class TestPanelPart {
  constructor() {
    this.element = void 0;
    this.minimumWidth = 0;
    this.maximumWidth = 0;
    this.minimumHeight = 0;
    this.maximumHeight = 0;
    this.onDidChange = Event.None;
    this.onDidPaneCompositeOpen = new Emitter().event;
    this.onDidPaneCompositeClose = new Emitter().event;
    this.partId = Parts.AUXILIARYBAR_PART;
    this.registryId = PaneCompositeExtensions.Auxiliary;
  }
  async openPaneComposite(id, focus) {
    return void 0;
  }
  getPaneComposite(id) {
    return activeViewlet;
  }
  getPaneComposites() {
    return [];
  }
  getPinnedPaneCompositeIds() {
    return [];
  }
  getVisiblePaneCompositeIds() {
    return [];
  }
  getPaneCompositeIds() {
    return [];
  }
  getActivePaneComposite() {
    return activeViewlet;
  }
  setPanelEnablement(id, enabled) {
  }
  dispose() {
  }
  getProgressIndicator(id) {
    return null;
  }
  hideActivePaneComposite() {
  }
  getLastActivePaneCompositeId() {
    return void 0;
  }
  layout(width, height, top, left) {
  }
}
class TestViewsService {
  constructor() {
    this.onDidChangeViewContainerVisibility = new Emitter().event;
    this.onDidChangeViewVisibilityEmitter = new Emitter();
    this.onDidChangeViewVisibility = this.onDidChangeViewVisibilityEmitter.event;
    this.onDidChangeFocusedViewEmitter = new Emitter();
    this.onDidChangeFocusedView = this.onDidChangeFocusedViewEmitter.event;
  }
  isViewContainerVisible(id) {
    return true;
  }
  isViewContainerActive(id) {
    return true;
  }
  getVisibleViewContainer() {
    return null;
  }
  openViewContainer(id, focus) {
    return Promise.resolve(null);
  }
  closeViewContainer(id) {
  }
  isViewVisible(id) {
    return true;
  }
  getActiveViewWithId(id) {
    return null;
  }
  getViewWithId(id) {
    return null;
  }
  openView(id, focus) {
    return Promise.resolve(null);
  }
  closeView(id) {
  }
  getViewProgressIndicator(id) {
    return null;
  }
  getActiveViewPaneContainerWithId(id) {
    return null;
  }
  getFocusedViewName() {
    return "";
  }
  getFocusedView() {
    return null;
  }
}
class TestEditorGroupsService {
  constructor(groups = []) {
    this.groups = groups;
    this.parts = [this];
    this.windowId = mainWindow.vscodeWindowId;
    this.onDidCreateAuxiliaryEditorPart = Event.None;
    this.onDidChangeActiveGroup = Event.None;
    this.onDidActivateGroup = Event.None;
    this.onDidAddGroup = Event.None;
    this.onDidRemoveGroup = Event.None;
    this.onDidMoveGroup = Event.None;
    this.onDidChangeGroupIndex = Event.None;
    this.onDidChangeGroupLabel = Event.None;
    this.onDidChangeGroupLocked = Event.None;
    this.onDidChangeGroupMaximized = Event.None;
    this.onDidLayout = Event.None;
    this.onDidChangeEditorPartOptions = Event.None;
    this.onDidScroll = Event.None;
    this.onWillDispose = Event.None;
    this.orientation = GroupOrientation.HORIZONTAL;
    this.isReady = true;
    this.whenReady = Promise.resolve(void 0);
    this.whenRestored = Promise.resolve(void 0);
    this.hasRestorableState = false;
    this.contentDimension = { width: 800, height: 600 };
    this.mainPart = this;
    this.activeModalEditorPart = void 0;
  }
  get activeGroup() {
    return this.groups[0];
  }
  get sideGroup() {
    return this.groups[0];
  }
  get count() {
    return this.groups.length;
  }
  getPart(group) {
    return this;
  }
  saveWorkingSet(name) {
    throw new Error("Method not implemented.");
  }
  getWorkingSets() {
    throw new Error("Method not implemented.");
  }
  applyWorkingSet(workingSet, options) {
    throw new Error("Method not implemented.");
  }
  deleteWorkingSet(workingSet) {
    throw new Error("Method not implemented.");
  }
  getGroups(_order) {
    return this.groups;
  }
  getGroup(identifier) {
    return this.groups.find((group) => group.id === identifier);
  }
  getLabel(_identifier) {
    return "Group 1";
  }
  findGroup(_scope, _source, _wrap) {
    throw new Error("not implemented");
  }
  activateGroup(_group) {
    throw new Error("not implemented");
  }
  restoreGroup(_group) {
    throw new Error("not implemented");
  }
  getSize(_group) {
    return { width: 100, height: 100 };
  }
  setSize(_group, _size) {
  }
  arrangeGroups(_arrangement) {
  }
  toggleMaximizeGroup() {
  }
  hasMaximizedGroup() {
    throw new Error("not implemented");
  }
  toggleExpandGroup() {
  }
  applyLayout(_layout) {
  }
  getLayout() {
    throw new Error("not implemented");
  }
  setGroupOrientation(_orientation) {
  }
  addGroup(_location, _direction) {
    throw new Error("not implemented");
  }
  removeGroup(_group) {
  }
  moveGroup(_group, _location, _direction) {
    throw new Error("not implemented");
  }
  mergeGroup(_group, _target, _options) {
    throw new Error("not implemented");
  }
  mergeAllGroups(_group, _options) {
    throw new Error("not implemented");
  }
  copyGroup(_group, _location, _direction) {
    throw new Error("not implemented");
  }
  centerLayout(active) {
  }
  isLayoutCentered() {
    return false;
  }
  createEditorDropTarget(container, delegate) {
    return Disposable.None;
  }
  registerContextKeyProvider(_provider) {
    throw new Error("not implemented");
  }
  getScopedInstantiationService(part) {
    throw new Error("Method not implemented.");
  }
  enforcePartOptions(options) {
    return Disposable.None;
  }
  registerEditorPart(part) {
    return Disposable.None;
  }
  createAuxiliaryEditorPart() {
    throw new Error("Method not implemented.");
  }
  createModalEditorPart() {
    throw new Error("Method not implemented.");
  }
}
class TestEditorGroupView {
  constructor(id) {
    this.id = id;
    this.windowId = mainWindow.vscodeWindowId;
    this.groupsView = void 0;
    this.selectedEditors = [];
    this.editors = [];
    this.whenRestored = Promise.resolve(void 0);
    this.isEmpty = true;
    this.onWillDispose = Event.None;
    this.onDidModelChange = Event.None;
    this.onWillCloseEditor = Event.None;
    this.onDidCloseEditor = Event.None;
    this.onDidOpenEditorFail = Event.None;
    this.onDidFocus = Event.None;
    this.onDidChange = Event.None;
    this.onWillMoveEditor = Event.None;
    this.onWillOpenEditor = Event.None;
    this.onDidActiveEditorChange = Event.None;
  }
  getEditors(_order) {
    return [];
  }
  findEditors(_resource) {
    return [];
  }
  getEditorByIndex(_index) {
    throw new Error("not implemented");
  }
  getIndexOfEditor(_editor) {
    return -1;
  }
  isFirst(editor) {
    return false;
  }
  isLast(editor) {
    return false;
  }
  openEditor(_editor, _options) {
    throw new Error("not implemented");
  }
  openEditors(_editors) {
    throw new Error("not implemented");
  }
  isPinned(_editor) {
    return false;
  }
  isSticky(_editor) {
    return false;
  }
  isTransient(_editor) {
    return false;
  }
  isActive(_editor) {
    return false;
  }
  setSelection(_activeSelectedEditor, _inactiveSelectedEditors) {
    throw new Error("not implemented");
  }
  isSelected(_editor) {
    return false;
  }
  contains(candidate) {
    return false;
  }
  moveEditor(_editor, _target, _options) {
    return true;
  }
  moveEditors(_editors, _target) {
    return true;
  }
  copyEditor(_editor, _target, _options) {
  }
  copyEditors(_editors, _target) {
  }
  async closeEditor(_editor, options) {
    return true;
  }
  async closeEditors(_editors, options) {
    return true;
  }
  closeAllEditors(options) {
    return true;
  }
  async replaceEditors(_editors) {
  }
  pinEditor(_editor) {
  }
  stickEditor(editor) {
  }
  unstickEditor(editor) {
  }
  lock(locked) {
  }
  focus() {
  }
  get scopedContextKeyService() {
    throw new Error("not implemented");
  }
  setActive(_isActive) {
  }
  notifyIndexChanged(_index) {
  }
  notifyLabelChanged(_label) {
  }
  dispose() {
  }
  toJSON() {
    return /* @__PURE__ */ Object.create(null);
  }
  layout(_width, _height) {
  }
  relayout() {
  }
  createEditorActions(_menuDisposable) {
    throw new Error("not implemented");
  }
}
class TestEditorGroupAccessor {
  constructor() {
    this.label = "";
    this.windowId = mainWindow.vscodeWindowId;
    this.groups = [];
    this.partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };
    this.onDidChangeEditorPartOptions = Event.None;
    this.onDidVisibilityChange = Event.None;
  }
  getGroup(identifier) {
    throw new Error("Method not implemented.");
  }
  getGroups(order) {
    throw new Error("Method not implemented.");
  }
  activateGroup(identifier) {
    throw new Error("Method not implemented.");
  }
  restoreGroup(identifier) {
    throw new Error("Method not implemented.");
  }
  addGroup(location, direction) {
    throw new Error("Method not implemented.");
  }
  mergeGroup(group, target, options) {
    throw new Error("Method not implemented.");
  }
  moveGroup(group, location, direction) {
    throw new Error("Method not implemented.");
  }
  copyGroup(group, location, direction) {
    throw new Error("Method not implemented.");
  }
  removeGroup(group) {
    throw new Error("Method not implemented.");
  }
  arrangeGroups(arrangement, target) {
    throw new Error("Method not implemented.");
  }
  toggleMaximizeGroup(group) {
    throw new Error("Method not implemented.");
  }
  toggleExpandGroup(group) {
    throw new Error("Method not implemented.");
  }
}
class TestEditorService extends Disposable {
  constructor(editorGroupService) {
    super();
    this.editorGroupService = editorGroupService;
    this.onDidActiveEditorChange = Event.None;
    this.onDidVisibleEditorsChange = Event.None;
    this.onDidEditorsChange = Event.None;
    this.onWillOpenEditor = Event.None;
    this.onDidCloseEditor = Event.None;
    this.onDidOpenEditorFail = Event.None;
    this.onDidMostRecentlyActiveEditorsChange = Event.None;
    this.editors = [];
    this.mostRecentlyActiveEditors = [];
    this.visibleEditorPanes = [];
    this.visibleTextEditorControls = [];
    this.visibleEditors = [];
    this.count = this.editors.length;
  }
  get activeTextEditorControl() {
    return this._activeTextEditorControl;
  }
  set activeTextEditorControl(value) {
    this._activeTextEditorControl = value;
  }
  get activeEditor() {
    return this._activeEditor;
  }
  set activeEditor(value) {
    this._activeEditor = value;
  }
  getVisibleTextEditorControls(order) {
    return this.visibleTextEditorControls;
  }
  createScoped(editorGroupsContainer) {
    return this;
  }
  getEditors() {
    return [];
  }
  // eslint-disable-next-line local/code-no-any-casts
  findEditors() {
    return [];
  }
  async openEditor(editor, optionsOrGroup, group) {
    if ("dispose" in editor) {
      this._register(editor);
    }
    return void 0;
  }
  async closeEditor(editor, options) {
  }
  async closeEditors(editors, options) {
  }
  doResolveEditorOpenRequest(editor) {
    if (!this.editorGroupService) {
      return void 0;
    }
    return [this.editorGroupService.activeGroup, editor, void 0];
  }
  openEditors(_editors, _group) {
    throw new Error("not implemented");
  }
  isOpened(_editor) {
    return false;
  }
  isVisible(_editor) {
    return false;
  }
  replaceEditors(_editors, _group) {
    return Promise.resolve(void 0);
  }
  save(editors, options) {
    throw new Error("Method not implemented.");
  }
  saveAll(options) {
    throw new Error("Method not implemented.");
  }
  revert(editors, options) {
    throw new Error("Method not implemented.");
  }
  revertAll(options) {
    throw new Error("Method not implemented.");
  }
}
class TestWorkingCopyBackupService extends InMemoryWorkingCopyBackupService {
  constructor() {
    super();
    this.resolved = /* @__PURE__ */ new Set();
  }
  parseBackupContent(textBufferFactory) {
    const textBuffer = textBufferFactory.create(DefaultEndOfLine.LF).textBuffer;
    const lineCount = textBuffer.getLineCount();
    const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
    return textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
  }
  async resolve(identifier) {
    this.resolved.add(identifier);
    return super.resolve(identifier);
  }
}
function toUntypedWorkingCopyId(resource) {
  return toTypedWorkingCopyId(resource, "");
}
function toTypedWorkingCopyId(resource, typeId = "testBackupTypeId") {
  return { typeId, resource };
}
class InMemoryTestWorkingCopyBackupService extends BrowserWorkingCopyBackupService {
  constructor() {
    const disposables = new DisposableStore();
    const environmentService = TestEnvironmentService;
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
    disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new InMemoryFileSystemProvider())));
    super(new TestContextService(TestWorkspace), environmentService, fileService, logService);
    this.backupResourceJoiners = [];
    this.discardBackupJoiners = [];
    this.discardedBackups = [];
    this._register(disposables);
  }
  testGetFileService() {
    return this.fileService;
  }
  joinBackupResource() {
    return new Promise((resolve) => this.backupResourceJoiners.push(resolve));
  }
  joinDiscardBackup() {
    return new Promise((resolve) => this.discardBackupJoiners.push(resolve));
  }
  async backup(identifier, content, versionId, meta, token) {
    await super.backup(identifier, content, versionId, meta, token);
    while (this.backupResourceJoiners.length) {
      this.backupResourceJoiners.pop()();
    }
  }
  async discardBackup(identifier) {
    await super.discardBackup(identifier);
    this.discardedBackups.push(identifier);
    while (this.discardBackupJoiners.length) {
      this.discardBackupJoiners.pop()();
    }
  }
  async getBackupContents(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const fileContents = await this.fileService.readFile(backupResource);
    return fileContents.value.toString();
  }
}
class TestBeforeShutdownEvent {
  constructor() {
    this.reason = ShutdownReason.CLOSE;
  }
  veto(value) {
    this.value = value;
  }
  finalVeto(vetoFn) {
    this.value = vetoFn();
    this.finalValue = vetoFn;
  }
}
class TestWillShutdownEvent {
  constructor() {
    this.value = [];
    this.joiners = () => [];
    this.reason = ShutdownReason.CLOSE;
    this.token = CancellationToken.None;
  }
  join(promise, joiner) {
    this.value.push(typeof promise === "function" ? promise() : promise);
  }
  force() {
  }
}
class TestTextResourceConfigurationService {
  constructor(configurationService = new TestConfigurationService()) {
    this.configurationService = configurationService;
  }
  onDidChangeConfiguration() {
    return { dispose() {
    } };
  }
  getValue(resource, arg2, arg3) {
    const position = EditorPosition.isIPosition(arg2) ? arg2 : null;
    const section = position ? typeof arg3 === "string" ? arg3 : void 0 : typeof arg2 === "string" ? arg2 : void 0;
    return this.configurationService.getValue(section, { resource });
  }
  inspect(resource, position, section) {
    return this.configurationService.inspect(section, { resource });
  }
  updateValue(resource, key, value, configurationTarget) {
    return this.configurationService.updateValue(key, value);
  }
}
class RemoteFileSystemProvider {
  constructor(wrappedFsp, remoteAuthority) {
    this.wrappedFsp = wrappedFsp;
    this.remoteAuthority = remoteAuthority;
    this.capabilities = this.wrappedFsp.capabilities;
    this.onDidChangeCapabilities = this.wrappedFsp.onDidChangeCapabilities;
    this.onDidChangeFile = Event.map(this.wrappedFsp.onDidChangeFile, (changes) => changes.map((c) => {
      return {
        type: c.type,
        resource: c.resource.with({ scheme: Schemas.vscodeRemote, authority: this.remoteAuthority })
      };
    }));
  }
  watch(resource, opts) {
    return this.wrappedFsp.watch(this.toFileResource(resource), opts);
  }
  stat(resource) {
    return this.wrappedFsp.stat(this.toFileResource(resource));
  }
  mkdir(resource) {
    return this.wrappedFsp.mkdir(this.toFileResource(resource));
  }
  readdir(resource) {
    return this.wrappedFsp.readdir(this.toFileResource(resource));
  }
  delete(resource, opts) {
    return this.wrappedFsp.delete(this.toFileResource(resource), opts);
  }
  rename(from, to, opts) {
    return this.wrappedFsp.rename(this.toFileResource(from), this.toFileResource(to), opts);
  }
  copy(from, to, opts) {
    return this.wrappedFsp.copy(this.toFileResource(from), this.toFileResource(to), opts);
  }
  readFile(resource) {
    return this.wrappedFsp.readFile(this.toFileResource(resource));
  }
  writeFile(resource, content, opts) {
    return this.wrappedFsp.writeFile(this.toFileResource(resource), content, opts);
  }
  open(resource, opts) {
    return this.wrappedFsp.open(this.toFileResource(resource), opts);
  }
  close(fd) {
    return this.wrappedFsp.close(fd);
  }
  read(fd, pos, data, offset, length) {
    return this.wrappedFsp.read(fd, pos, data, offset, length);
  }
  write(fd, pos, data, offset, length) {
    return this.wrappedFsp.write(fd, pos, data, offset, length);
  }
  readFileStream(resource, opts, token) {
    return this.wrappedFsp.readFileStream(this.toFileResource(resource), opts, token);
  }
  toFileResource(resource) {
    return resource.with({ scheme: Schemas.file, authority: "" });
  }
}
class TestInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
  get capabilities() {
    return FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive | FileSystemProviderCapabilities.FileReadStream;
  }
  readFileStream(resource) {
    const BUFFER_SIZE = 64 * 1024;
    const stream = newWriteableStream((data) => VSBuffer.concat(data.map((data2) => VSBuffer.wrap(data2))).buffer);
    (async () => {
      try {
        const data = await this.readFile(resource);
        let offset = 0;
        while (offset < data.length) {
          await timeout(0);
          await stream.write(data.subarray(offset, offset + BUFFER_SIZE));
          offset += BUFFER_SIZE;
        }
        await timeout(0);
        stream.end();
      } catch (error) {
        stream.end(error);
      }
    })();
    return stream;
  }
}
const productService = { _serviceBrand: void 0, ...product };
class TestHostService {
  constructor() {
    this._hasFocus = true;
    this._onDidChangeFocus = new Emitter();
    this.onDidChangeFocus = this._onDidChangeFocus.event;
    this._onDidChangeWindow = new Emitter();
    this.onDidChangeActiveWindow = this._onDidChangeWindow.event;
    this.onDidChangeFullScreen = Event.None;
    this.colorScheme = ColorScheme.DARK;
    this.onDidChangeColorScheme = Event.None;
  }
  get hasFocus() {
    return this._hasFocus;
  }
  async hadLastFocus() {
    return this._hasFocus;
  }
  setFocus(focus) {
    this._hasFocus = focus;
    this._onDidChangeFocus.fire(this._hasFocus);
  }
  async restart() {
  }
  async reload() {
  }
  async close() {
  }
  async shutdown() {
  }
  async withExpectedShutdown(expectedShutdownTask) {
    return await expectedShutdownTask();
  }
  async focus() {
  }
  async moveTop() {
  }
  async getCursorScreenPoint() {
    return void 0;
  }
  async getWindowPosition() {
    return void 0;
  }
  async getWindows(options) {
    return [];
  }
  async openWindow(arg1, arg2) {
  }
  async toggleFullScreen() {
  }
  async getScreenshot(rect) {
    return void 0;
  }
  async getNativeWindowHandle(_windowId) {
    return void 0;
  }
  async showToast(_options, token) {
    return { supported: false, clicked: false };
  }
  async setWindowDimmed(_targetWindow, _dimmed) {
  }
}
class TestFilesConfigurationService extends FilesConfigurationService {
  testOnFilesConfigurationChange(configuration) {
    super.onFilesConfigurationChange(configuration, true);
  }
}
class TestReadonlyTextFileEditorModel extends TextFileEditorModel {
  isReadonly() {
    return true;
  }
}
class TestEditorInput extends EditorInput {
  constructor(resource, _typeId) {
    super();
    this.resource = resource;
    this._typeId = _typeId;
  }
  get typeId() {
    return this._typeId;
  }
  get editorId() {
    return this._typeId;
  }
  resolve() {
    return Promise.resolve(null);
  }
}
function registerTestEditor(id, inputs, serializerInputId) {
  const disposables = new DisposableStore();
  class TestEditor extends EditorPane {
    constructor(group) {
      super(id, group, NullTelemetryService, new TestThemeService(), disposables.add(new TestStorageService()));
      this._scopedContextKeyService = new MockContextKeyService();
    }
    async setInput(input, options, context, token) {
      super.setInput(input, options, context, token);
      await input.resolve();
    }
    getId() {
      return id;
    }
    layout() {
    }
    createEditor() {
    }
    get scopedContextKeyService() {
      return this._scopedContextKeyService;
    }
  }
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestEditor, id, "Test Editor Control"), inputs));
  if (serializerInputId) {
    class EditorsObserverTestEditorInputSerializer {
      canSerialize(editorInput) {
        return true;
      }
      serialize(editorInput) {
        const testEditorInput = editorInput;
        const testInput = {
          resource: testEditorInput.resource.toString()
        };
        return JSON.stringify(testInput);
      }
      deserialize(instantiationService, serializedEditorInput) {
        const testInput = JSON.parse(serializedEditorInput);
        return new TestFileEditorInput(URI.parse(testInput.resource), serializerInputId);
      }
    }
    disposables.add(Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(serializerInputId, EditorsObserverTestEditorInputSerializer));
  }
  return disposables;
}
function registerTestFileEditor() {
  const disposables = new DisposableStore();
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
      TestTextFileEditor,
      TestTextFileEditor.ID,
      "Text File Editor"
    ),
    [new SyncDescriptor(FileEditorInput)]
  ));
  return disposables;
}
function registerTestResourceEditor() {
  const disposables = new DisposableStore();
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
      TestTextResourceEditor,
      TestTextResourceEditor.ID,
      "Text Editor"
    ),
    [
      new SyncDescriptor(UntitledTextEditorInput),
      new SyncDescriptor(TextResourceEditorInput)
    ]
  ));
  return disposables;
}
function registerTestSideBySideEditor() {
  const disposables = new DisposableStore();
  disposables.add(Registry.as(Extensions.EditorPane).registerEditorPane(
    EditorPaneDescriptor.create(
      SideBySideEditor,
      SideBySideEditor.ID,
      "Text Editor"
    ),
    [
      new SyncDescriptor(SideBySideEditorInput)
    ]
  ));
  return disposables;
}
class TestFileEditorInput extends EditorInput {
  constructor(resource, _typeId) {
    super();
    this.resource = resource;
    this._typeId = _typeId;
    this.gotDisposed = false;
    this.gotSaved = false;
    this.gotSavedAs = false;
    this.gotReverted = false;
    this.dirty = false;
    this.fails = false;
    this.disableToUntyped = false;
    this._capabilities = EditorInputCapabilities.None;
    this.movedEditor = void 0;
    this.moveDisabledReason = void 0;
    this.preferredResource = this.resource;
  }
  get typeId() {
    return this._typeId;
  }
  get editorId() {
    return this._typeId;
  }
  get capabilities() {
    return this._capabilities;
  }
  set capabilities(capabilities) {
    if (this._capabilities !== capabilities) {
      this._capabilities = capabilities;
      this._onDidChangeCapabilities.fire();
    }
  }
  resolve() {
    return !this.fails ? Promise.resolve(null) : Promise.reject(new Error("fails"));
  }
  matches(other) {
    if (super.matches(other)) {
      return true;
    }
    if (other instanceof EditorInput) {
      return !!(other?.resource && this.resource.toString() === other.resource.toString() && other instanceof TestFileEditorInput && other.typeId === this.typeId);
    }
    return isEqual(this.resource, other.resource) && (this.editorId === other.options?.override || other.options?.override === void 0);
  }
  setPreferredResource(resource) {
  }
  async setEncoding(encoding) {
  }
  getEncoding() {
    return void 0;
  }
  setPreferredName(name) {
  }
  setPreferredDescription(description) {
  }
  setPreferredEncoding(encoding) {
  }
  setPreferredContents(contents) {
  }
  setLanguageId(languageId, source) {
  }
  setPreferredLanguageId(languageId) {
  }
  setForceOpenAsBinary() {
  }
  setFailToOpen() {
    this.fails = true;
  }
  async save(groupId, options) {
    this.gotSaved = true;
    this.dirty = false;
    return this;
  }
  async saveAs(groupId, options) {
    this.gotSavedAs = true;
    return this;
  }
  async revert(group, options) {
    this.gotReverted = true;
    this.gotSaved = false;
    this.gotSavedAs = false;
    this.dirty = false;
  }
  toUntyped() {
    if (this.disableToUntyped) {
      return void 0;
    }
    return { resource: this.resource };
  }
  setModified() {
    this.modified = true;
  }
  isModified() {
    return this.modified === void 0 ? this.dirty : this.modified;
  }
  setDirty() {
    this.dirty = true;
  }
  isDirty() {
    return this.dirty;
  }
  isResolved() {
    return false;
  }
  dispose() {
    super.dispose();
    this.gotDisposed = true;
  }
  async rename() {
    return this.movedEditor;
  }
  setMoveDisabled(reason) {
    this.moveDisabledReason = reason;
  }
  canMove(sourceGroup, targetGroup) {
    if (typeof this.moveDisabledReason === "string") {
      return this.moveDisabledReason;
    }
    return super.canMove(sourceGroup, targetGroup);
  }
}
class TestForceRevealFileEditorInput extends TestFileEditorInput {
  get capabilities() {
    return EditorInputCapabilities.ForceReveal;
  }
}
class TestEditorPart extends MainEditorPart {
  constructor() {
    super(...arguments);
    this.mainPart = this;
    this.parts = [this];
    this.activeModalEditorPart = void 0;
    this.onDidCreateAuxiliaryEditorPart = Event.None;
  }
  testSaveState() {
    return super.saveState();
  }
  clearState() {
    const workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    for (const key of Object.keys(workspaceMemento)) {
      delete workspaceMemento[key];
    }
    const profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    for (const key of Object.keys(profileMemento)) {
      delete profileMemento[key];
    }
  }
  registerEditorPart(part) {
    return Disposable.None;
  }
  createAuxiliaryEditorPart() {
    throw new Error("Method not implemented.");
  }
  createModalEditorPart() {
    throw new Error("Method not implemented.");
  }
  getScopedInstantiationService(part) {
    throw new Error("Method not implemented.");
  }
  getPart(group) {
    return this;
  }
  saveWorkingSet(name) {
    throw new Error("Method not implemented.");
  }
  getWorkingSets() {
    throw new Error("Method not implemented.");
  }
  applyWorkingSet(workingSet, options) {
    throw new Error("Method not implemented.");
  }
  deleteWorkingSet(workingSet) {
    throw new Error("Method not implemented.");
  }
  registerContextKeyProvider(provider) {
    throw new Error("Method not implemented.");
  }
}
class TestEditorParts extends EditorParts {
  createMainEditorPart() {
    this.testMainPart = this.instantiationService.createInstance(TestEditorPart, this);
    return this.testMainPart;
  }
}
async function createEditorParts(instantiationService, disposables) {
  const parts = instantiationService.createInstance(TestEditorParts);
  const part = disposables.add(parts).testMainPart;
  part.create(document.createElement("div"));
  part.layout(1080, 800, 0, 0);
  await parts.whenReady;
  return parts;
}
async function createEditorPart(instantiationService, disposables) {
  return (await createEditorParts(instantiationService, disposables)).testMainPart;
}
class TestListService {
  constructor() {
    this.lastFocusedList = void 0;
  }
  register() {
    return Disposable.None;
  }
}
class TestPathService {
  constructor(fallbackUserHome = URI.from({ scheme: Schemas.file, path: "/" }), defaultUriScheme = Schemas.file) {
    this.fallbackUserHome = fallbackUserHome;
    this.defaultUriScheme = defaultUriScheme;
  }
  hasValidBasename(resource, arg2, name) {
    if (typeof arg2 === "string" || typeof arg2 === "undefined") {
      return isValidBasename(arg2 ?? basename(resource));
    }
    return isValidBasename(name ?? basename(resource));
  }
  get path() {
    return Promise.resolve(isWindows ? win32 : posix);
  }
  userHome(options) {
    return options?.preferLocal ? this.fallbackUserHome : Promise.resolve(this.fallbackUserHome);
  }
  get resolvedUserHome() {
    return this.fallbackUserHome;
  }
  async fileURI(path) {
    return URI.file(path);
  }
}
function getLastResolvedFileStat(model) {
  const candidate = model;
  return candidate?.lastResolvedFileStat;
}
class TestWorkspacesService {
  constructor() {
    this.onDidChangeRecentlyOpened = Event.None;
  }
  async createUntitledWorkspace(folders, remoteAuthority) {
    throw new Error("Method not implemented.");
  }
  async deleteUntitledWorkspace(workspace) {
  }
  async addRecentlyOpened(recents) {
  }
  async removeRecentlyOpened(workspaces) {
  }
  async clearRecentlyOpened() {
  }
  async getRecentlyOpened() {
    return { files: [], workspaces: [] };
  }
  async getDirtyWorkspaces() {
    return [];
  }
  async enterWorkspace(path) {
    throw new Error("Method not implemented.");
  }
  async getWorkspaceIdentifier(workspacePath) {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalInstanceService {
  constructor() {
    this.onDidCreateInstance = Event.None;
    this.onDidRegisterBackend = Event.None;
  }
  convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile, cwd) {
    throw new Error("Method not implemented.");
  }
  preparePathForTerminalAsync(path, executable, title, shellType, remoteAuthority) {
    throw new Error("Method not implemented.");
  }
  createInstance(options, target) {
    throw new Error("Method not implemented.");
  }
  async getBackend(remoteAuthority) {
    throw new Error("Method not implemented.");
  }
  didRegisterBackend(backend) {
    throw new Error("Method not implemented.");
  }
  getRegisteredBackends() {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalEditorService {
  constructor() {
    this.instances = [];
    this.onDidDisposeInstance = Event.None;
    this.onDidFocusInstance = Event.None;
    this.onDidChangeInstanceCapability = Event.None;
    this.onDidChangeActiveInstance = Event.None;
    this.onDidChangeInstances = Event.None;
  }
  openEditor(instance, editorOptions) {
    throw new Error("Method not implemented.");
  }
  detachInstance(instance) {
    throw new Error("Method not implemented.");
  }
  splitInstance(instanceToSplit, shellLaunchConfig) {
    throw new Error("Method not implemented.");
  }
  revealActiveEditor(preserveFocus) {
    throw new Error("Method not implemented.");
  }
  resolveResource(instance) {
    throw new Error("Method not implemented.");
  }
  reviveInput(deserializedInput) {
    throw new Error("Method not implemented.");
  }
  getInputFromResource(resource) {
    throw new Error("Method not implemented.");
  }
  setActiveInstance(instance) {
    throw new Error("Method not implemented.");
  }
  focusActiveInstance() {
    throw new Error("Method not implemented.");
  }
  async focusInstance(instance) {
    throw new Error("Method not implemented.");
  }
  getInstanceFromResource(resource) {
    throw new Error("Method not implemented.");
  }
  focusFindWidget() {
    throw new Error("Method not implemented.");
  }
  hideFindWidget() {
    throw new Error("Method not implemented.");
  }
  findNext() {
    throw new Error("Method not implemented.");
  }
  findPrevious() {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalGroupService {
  constructor() {
    this.instances = [];
    this.groups = [];
    this.activeGroupIndex = 0;
    this.lastAccessedMenu = "inline-tab";
    this.onDidChangeActiveGroup = Event.None;
    this.onDidDisposeGroup = Event.None;
    this.onDidShow = Event.None;
    this.onDidChangeGroups = Event.None;
    this.onDidChangePanelOrientation = Event.None;
    this.onDidDisposeInstance = Event.None;
    this.onDidFocusInstance = Event.None;
    this.onDidChangeInstanceCapability = Event.None;
    this.onDidChangeActiveInstance = Event.None;
    this.onDidChangeInstances = Event.None;
  }
  createGroup(instance) {
    throw new Error("Method not implemented.");
  }
  getGroupForInstance(instance) {
    throw new Error("Method not implemented.");
  }
  moveGroup(source, target) {
    throw new Error("Method not implemented.");
  }
  moveGroupToEnd(source) {
    throw new Error("Method not implemented.");
  }
  moveInstance(source, target, side) {
    throw new Error("Method not implemented.");
  }
  unsplitInstance(instance) {
    throw new Error("Method not implemented.");
  }
  joinInstances(instances) {
    throw new Error("Method not implemented.");
  }
  instanceIsSplit(instance) {
    throw new Error("Method not implemented.");
  }
  getGroupLabels() {
    throw new Error("Method not implemented.");
  }
  setActiveGroupByIndex(index) {
    throw new Error("Method not implemented.");
  }
  setActiveGroupToNext() {
    throw new Error("Method not implemented.");
  }
  setActiveGroupToPrevious() {
    throw new Error("Method not implemented.");
  }
  setActiveInstanceByIndex(terminalIndex) {
    throw new Error("Method not implemented.");
  }
  setContainer(container) {
    throw new Error("Method not implemented.");
  }
  showPanel(focus) {
    throw new Error("Method not implemented.");
  }
  hidePanel() {
    throw new Error("Method not implemented.");
  }
  focusTabs() {
    throw new Error("Method not implemented.");
  }
  focusHover() {
    throw new Error("Method not implemented.");
  }
  setActiveInstance(instance) {
    throw new Error("Method not implemented.");
  }
  focusActiveInstance() {
    throw new Error("Method not implemented.");
  }
  async focusInstance(instance) {
    throw new Error("Method not implemented.");
  }
  getInstanceFromResource(resource) {
    throw new Error("Method not implemented.");
  }
  focusFindWidget() {
    throw new Error("Method not implemented.");
  }
  hideFindWidget() {
    throw new Error("Method not implemented.");
  }
  findNext() {
    throw new Error("Method not implemented.");
  }
  findPrevious() {
    throw new Error("Method not implemented.");
  }
  updateVisibility() {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalProfileService {
  constructor() {
    this.availableProfiles = [];
    this.contributedProfiles = [];
    this.profilesReady = Promise.resolve();
    this.onDidChangeAvailableProfiles = Event.None;
  }
  getPlatformKey() {
    throw new Error("Method not implemented.");
  }
  refreshAvailableProfiles() {
    throw new Error("Method not implemented.");
  }
  getDefaultProfileName() {
    throw new Error("Method not implemented.");
  }
  getDefaultProfile() {
    throw new Error("Method not implemented.");
  }
  getContributedDefaultProfile(shellLaunchConfig) {
    throw new Error("Method not implemented.");
  }
  registerContributedProfile(args) {
    throw new Error("Method not implemented.");
  }
  registerInternalContributedProfile(_profile) {
    return Disposable.None;
  }
  getContributedProfileProvider(extensionIdentifier, id) {
    throw new Error("Method not implemented.");
  }
  registerTerminalProfileProvider(extensionIdentifier, id, profileProvider) {
    throw new Error("Method not implemented.");
  }
  overrideDefaultProfile(extensionIdentifier, id) {
    return Disposable.None;
  }
}
class TestTerminalProfileResolverService {
  constructor() {
    this.defaultProfileName = "";
  }
  resolveIcon(shellLaunchConfig) {
  }
  async resolveShellLaunchConfig(shellLaunchConfig, options) {
  }
  async getDefaultProfile(options) {
    return { path: "/default", profileName: "Default", isDefault: true };
  }
  async getDefaultShell(options) {
    return "/default";
  }
  async getDefaultShellArgs(options) {
    return [];
  }
  getDefaultIcon() {
    return Codicon.terminal;
  }
  async getEnvironment() {
    return env;
  }
  getSafeConfigValue(key, os) {
    return void 0;
  }
  getSafeConfigValueFullKey(key) {
    return void 0;
  }
  createProfileFromShellAndShellArgs(shell, shellArgs) {
    throw new Error("Method not implemented.");
  }
}
class TestTerminalConfigurationService extends TerminalConfigurationService {
  get fontMetrics() {
    return this._fontMetrics;
  }
  // eslint-disable-next-line local/code-no-any-casts
  setConfig(config) {
    this._config = config;
  }
}
class TestQuickInputService {
  constructor() {
    this.onShow = Event.None;
    this.onHide = Event.None;
    this.alignment = observableValue("TestQuickInputService.alignment", "top");
    this.currentQuickInput = void 0;
    this.quickAccess = void 0;
  }
  async pick(picks, options, token) {
    if (Array.isArray(picks)) {
      return { label: "selectedPick", description: "pick description", value: "selectedPick" };
    } else {
      return void 0;
    }
  }
  async input(options, token) {
    return options ? "resolved" + options.prompt : "resolved";
  }
  createQuickPick() {
    throw new Error("not implemented.");
  }
  createInputBox() {
    throw new Error("not implemented.");
  }
  createQuickWidget() {
    throw new Error("Method not implemented.");
  }
  createQuickTree() {
    throw new Error("not implemented.");
  }
  focus() {
    throw new Error("not implemented.");
  }
  toggle() {
    throw new Error("not implemented.");
  }
  navigate(next, quickNavigate) {
    throw new Error("not implemented.");
  }
  accept() {
    throw new Error("not implemented.");
  }
  back() {
    throw new Error("not implemented.");
  }
  cancel() {
    throw new Error("not implemented.");
  }
  setAlignment(alignment) {
    throw new Error("not implemented.");
  }
  toggleHover() {
    throw new Error("not implemented.");
  }
}
class TestLanguageDetectionService {
  isEnabledForLanguage(languageId) {
    return false;
  }
  async detectLanguage(resource, supportedLangs) {
    return void 0;
  }
}
class TestRemoteAgentService {
  getConnection() {
    return null;
  }
  async getEnvironment() {
    return null;
  }
  async getRawEnvironment() {
    return null;
  }
  async getExtensionHostExitInfo(reconnectionToken) {
    return null;
  }
  async getDiagnosticInfo(options) {
    return void 0;
  }
  async updateTelemetryLevel(telemetryLevel) {
  }
  async logTelemetry(eventName, data) {
  }
  async flushTelemetry() {
  }
  async getRoundTripTime() {
    return void 0;
  }
  async endConnection() {
  }
}
class TestRemoteExtensionsScannerService {
  async whenExtensionsReady() {
    return { failed: [] };
  }
  scanExtensions() {
    throw new Error("Method not implemented.");
  }
}
class TestWorkbenchExtensionEnablementService {
  constructor() {
    this.onEnablementChanged = Event.None;
  }
  getEnablementState(extension) {
    return EnablementState.EnabledGlobally;
  }
  getEnablementStates(extensions, workspaceTypeOverrides) {
    return [];
  }
  getDependenciesEnablementStates(extension) {
    return [];
  }
  canChangeEnablement(extension) {
    return true;
  }
  canChangeWorkspaceEnablement(extension) {
    return true;
  }
  isEnabled(extension) {
    return true;
  }
  isEnabledEnablementState(enablementState) {
    return true;
  }
  isDisabledGlobally(extension) {
    return false;
  }
  async setEnablement(extensions, state) {
    return [];
  }
  async updateExtensionsEnablementsWhenWorkspaceTrustChanges() {
  }
}
class TestWorkbenchExtensionManagementService {
  constructor() {
    this.onInstallExtension = Event.None;
    this.onDidInstallExtensions = Event.None;
    this.onUninstallExtension = Event.None;
    this.onDidUninstallExtension = Event.None;
    this.onDidUpdateExtensionMetadata = Event.None;
    this.onProfileAwareInstallExtension = Event.None;
    this.onProfileAwareDidInstallExtensions = Event.None;
    this.onProfileAwareUninstallExtension = Event.None;
    this.onProfileAwareDidUninstallExtension = Event.None;
    this.onDidProfileAwareUninstallExtensions = Event.None;
    this.onProfileAwareDidUpdateExtensionMetadata = Event.None;
    this.onDidChangeProfile = Event.None;
    this.onDidEnableExtensions = Event.None;
    this.preferPreReleases = true;
  }
  installVSIX(location, manifest, installOptions) {
    throw new Error("Method not implemented.");
  }
  installFromLocation(location) {
    throw new Error("Method not implemented.");
  }
  installGalleryExtensions(extensions) {
    throw new Error("Method not implemented.");
  }
  async updateFromGallery(gallery, extension, installOptions) {
    return extension;
  }
  zip(extension) {
    throw new Error("Method not implemented.");
  }
  getManifest(vsix) {
    throw new Error("Method not implemented.");
  }
  install(vsix, options) {
    throw new Error("Method not implemented.");
  }
  isAllowed() {
    return true;
  }
  async canInstall(extension) {
    return true;
  }
  installFromGallery(extension, options) {
    throw new Error("Method not implemented.");
  }
  uninstall(extension, options) {
    throw new Error("Method not implemented.");
  }
  uninstallExtensions(extensions) {
    throw new Error("Method not implemented.");
  }
  async getInstalled(type) {
    return [];
  }
  getExtensionsControlManifest() {
    throw new Error("Method not implemented.");
  }
  async updateMetadata(local, metadata) {
    return local;
  }
  registerParticipant(pariticipant) {
  }
  async getTargetPlatform() {
    return TargetPlatform.UNDEFINED;
  }
  async cleanUp() {
  }
  download() {
    throw new Error("Method not implemented.");
  }
  copyExtensions() {
    throw new Error("Not Supported");
  }
  toggleApplicationScope() {
    throw new Error("Not Supported");
  }
  installExtensionsFromProfile() {
    throw new Error("Not Supported");
  }
  whenProfileChanged(from, to) {
    throw new Error("Not Supported");
  }
  getInstalledWorkspaceExtensionLocations() {
    throw new Error("Method not implemented.");
  }
  getInstalledWorkspaceExtensions() {
    throw new Error("Method not implemented.");
  }
  installResourceExtension() {
    throw new Error("Method not implemented.");
  }
  getExtensions() {
    throw new Error("Method not implemented.");
  }
  resetPinnedStateForAllUserExtensions(pinned) {
    throw new Error("Method not implemented.");
  }
  getInstallableServers(extension) {
    throw new Error("Method not implemented.");
  }
  isPublisherTrusted(extension) {
    return false;
  }
  getTrustedPublishers() {
    return [];
  }
  trustPublishers() {
  }
  untrustPublishers() {
  }
  async requestPublisherTrust(extensions) {
  }
}
class TestWebExtensionsScannerService {
  constructor() {
    this.onDidChangeProfile = Event.None;
  }
  async scanSystemExtensions() {
    return [];
  }
  async scanUserExtensions() {
    return [];
  }
  async scanExtensionsUnderDevelopment() {
    return [];
  }
  async copyExtensions() {
    throw new Error("Method not implemented.");
  }
  scanExistingExtension(extensionLocation, extensionType) {
    throw new Error("Method not implemented.");
  }
  addExtension(location, metadata) {
    throw new Error("Method not implemented.");
  }
  addExtensionFromGallery(galleryExtension, metadata) {
    throw new Error("Method not implemented.");
  }
  removeExtension() {
    throw new Error("Method not implemented.");
  }
  updateMetadata(extension, metaData, profileLocation) {
    throw new Error("Method not implemented.");
  }
  scanExtensionManifest(extensionLocation) {
    throw new Error("Method not implemented.");
  }
}
async function workbenchTeardown(instantiationService) {
  return instantiationService.invokeFunction(async (accessor) => {
    const workingCopyService = accessor.get(IWorkingCopyService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    for (const workingCopy of workingCopyService.workingCopies) {
      await workingCopy.revert();
    }
    for (const group of editorGroupService.groups) {
      await group.closeAllEditors();
    }
    for (const group of editorGroupService.groups) {
      editorGroupService.removeGroup(group);
    }
  });
}
class TestContextMenuService {
  constructor() {
    this.onDidShowContextMenu = Event.None;
    this.onDidHideContextMenu = Event.None;
  }
  showContextMenu(delegate) {
    throw new Error("Method not implemented.");
  }
}
class TestChatWidgetService {
  constructor() {
    this.onDidAddWidget = Event.None;
    this.onDidRemoveWidget = Event.None;
    this.onDidChangeWidgetVisibility = Event.None;
    this.onDidBackgroundSession = Event.None;
    this.onDidChangeFocusedWidget = Event.None;
    this.onDidChangeFocusedSession = Event.None;
  }
  async reveal(widget, preserveFocus) {
    return false;
  }
  async revealWidget(preserveFocus) {
    return void 0;
  }
  getAllWidgets() {
    return [];
  }
  getWidgetByInputUri(uri) {
    return void 0;
  }
  async openSession(sessionResource, target, options) {
    return void 0;
  }
  getWidgetBySessionResource(sessionResource) {
    return void 0;
  }
  getWidgetsByLocations(location) {
    return [];
  }
  register(newWidget) {
    return Disposable.None;
  }
}
export {
  InMemoryTestWorkingCopyBackupService,
  RemoteFileSystemProvider,
  TestBeforeShutdownEvent,
  TestBrowserTextFileServiceWithEncodingOverrides,
  TestChatWidgetService,
  TestContextMenuService,
  TestDecorationsService,
  TestEditorGroupAccessor,
  TestEditorGroupView,
  TestEditorGroupsService,
  TestEditorInput,
  TestEditorPart,
  TestEditorParts,
  TestEditorService,
  TestEncodingOracle,
  TestEnvironmentService,
  TestFileDialogService,
  TestFileEditorInput,
  TestFileService,
  TestFilesConfigurationService,
  TestForceRevealFileEditorInput,
  TestHostService,
  TestInMemoryFileSystemProvider,
  TestLayoutService,
  TestLifecycleService,
  TestListService,
  TestMenuService,
  TestPaneCompositeService,
  TestPanelPart,
  TestPathService,
  TestProgressService,
  TestQuickInputService,
  TestReadonlyTextFileEditorModel,
  TestRemoteAgentService,
  TestRemoteExtensionsScannerService,
  TestServiceAccessor,
  TestSideBarPart,
  TestTerminalConfigurationService,
  TestTerminalEditorService,
  TestTerminalGroupService,
  TestTerminalInstanceService,
  TestTerminalProfileResolverService,
  TestTerminalProfileService,
  TestTextFileEditor,
  TestTextFileService,
  TestTextResourceConfigurationService,
  TestTextResourceEditor,
  TestViewsService,
  TestWebExtensionsScannerService,
  TestWillShutdownEvent,
  TestWorkbenchExtensionEnablementService,
  TestWorkbenchExtensionManagementService,
  TestWorkingCopyBackupService,
  TestWorkingCopyService,
  TestWorkspacesService,
  createEditorPart,
  createEditorParts,
  createFileEditorInput,
  getLastResolvedFileStat,
  productService,
  registerTestEditor,
  registerTestFileEditor,
  registerTestResourceEditor,
  registerTestSideBySideEditor,
  toTypedWorkingCopyId,
  toUntypedWorkingCopyId,
  workbenchInstantiationService,
  workbenchTeardown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHdvcmtiZW5jaFRlc3RTZXJ2aWNlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElDb250ZXh0TWVudURlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IElEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpcmVjdGlvbiwgSVZpZXdTaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGUsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNWYWxpZEJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgcG9zaXgsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVudiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbmV3V3JpdGVhYmxlU3RyZWFtLCBSZWFkYWJsZVN0cmVhbUV2ZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQsIHVwY2FzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gYXMgRWRpdG9yUG9zaXRpb24sIElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yLCBJRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEVuZE9mTGluZSwgRW5kT2ZMaW5lUHJlZmVyZW5jZSwgSVRleHRCdWZmZXJGYWN0b3J5LCBJVGV4dFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0RWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXN0RWRpdG9yV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3NlcnZpY2VzL3Rlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSwgTnVsbEFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51QWN0aW9uT3B0aW9ucywgSU1lbnVDaGFuZ2VFdmVudCwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZvbGRlckJhY2t1cEluZm8sIElXb3Jrc3BhY2VCYWNrdXBJbmZvIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYmFja3VwL2NvbW1vbi9iYWNrdXAuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5VmFsdWUsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRNZW51U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVNZW51RGVsZWdhdGUsIElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IENvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFnbm9zdGljSW5mbywgSURpYWdub3N0aWNJbmZvT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBDb25maXJtUmVzdWx0LCBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlLCBJT3BlbkRpYWxvZ09wdGlvbnMsIElQaWNrQW5kT3Blbk9wdGlvbnMsIElTYXZlRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zLCBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBJVGV4dEVkaXRvck9wdGlvbnMsIElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRQYXJ0aWNpcGFudCwgSUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QsIElHYWxsZXJ5RXh0ZW5zaW9uLCBJR2FsbGVyeU1ldGFkYXRhLCBJTG9jYWxFeHRlbnNpb24sIEluc3RhbGxFeHRlbnNpb25JbmZvLCBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0LCBJbnN0YWxsRXh0ZW5zaW9uU3VtbWFyeSwgSW5zdGFsbE9wdGlvbnMsIE1ldGFkYXRhLCBVbmluc3RhbGxFeHRlbnNpb25JbmZvLCBVbmluc3RhbGxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3QsIFRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgRmlsZVR5cGUsIElGaWxlQ2hhbmdlLCBJRmlsZURlbGV0ZU9wdGlvbnMsIElGaWxlT3Blbk9wdGlvbnMsIElGaWxlT3ZlcndyaXRlT3B0aW9ucywgSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIElGaWxlU3lzdGVtUHJvdmlkZXIsIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRTdHJlYW1DYXBhYmlsaXR5LCBJRmlsZVdyaXRlT3B0aW9ucywgSVN0YXQsIElXYXRjaE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgTnVsbEhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL3Rlc3QvYnJvd3Nlci9udWxsSG92ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSwgTW9ja0tleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0T2Zmc2V0SW5mbyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dnZXJTZXJ2aWNlLCBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NDb21wb3NpdGVPcHRpb25zLCBJUHJvZ3Jlc3NEaWFsb2dPcHRpb25zLCBJUHJvZ3Jlc3NJbmRpY2F0b3IsIElQcm9ncmVzc05vdGlmaWNhdGlvbk9wdGlvbnMsIElQcm9ncmVzc09wdGlvbnMsIElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1N0ZXAsIElQcm9ncmVzc1dpbmRvd09wdGlvbnMsIFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElJbnB1dEJveCwgSUlucHV0T3B0aW9ucywgSVBpY2tPcHRpb25zLCBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tOYXZpZ2F0ZUNvbmZpZ3VyYXRpb24sIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tUcmVlLCBJUXVpY2tUcmVlSXRlbSwgSVF1aWNrV2lkZ2V0LCBRdWlja0lucHV0QWxpZ25tZW50LCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50RW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMnO1xuaW1wb3J0IHsgSVJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlLCBSZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhLCBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSwgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxMb2dTZXJ2aWNlLCBJVGVybWluYWxQcm9maWxlLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsTG9jYXRpb24sIFRlcm1pbmFsU2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbExvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29sb3JTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMsIElPcGVuV2luZG93T3B0aW9ucywgSVJlY3RhbmdsZSwgSVdpbmRvd09wZW5hYmxlLCBNZW51QmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IFRlc3RXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRW50ZXJXb3Jrc3BhY2VSZXN1bHQsIElSZWNlbnQsIElSZWNlbnRseU9wZW5lZCwgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSwgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IFBhbmVDb21wb3NpdGUsIFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yLCBFeHRlbnNpb25zIGFzIFBhbmVDb21wb3NpdGVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IFBhcnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnQuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfUEFSVF9PUFRJT05TLCBFZGl0b3JTZXJ2aWNlSW1wbCwgSUVkaXRvckdyb3Vwc1ZpZXcsIElFZGl0b3JHcm91cFRpdGxlSGVpZ2h0LCBJRWRpdG9yR3JvdXBWaWV3IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IE1haW5FZGl0b3JQYXJ0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFydC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYXJ0cyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhcnRzLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9yLmpzJztcbmltcG9ydCB7IFRleHRFZGl0b3JQYW5lU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvdGV4dEVkaXRvci5qcyc7XG5pbXBvcnQgeyBUZXh0UmVzb3VyY2VFZGl0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0UmVzb3VyY2VFZGl0b3IuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wYXJ0cy9wYW5lQ29tcG9zaXRlUGFydC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgRWRpdG9ySW5wdXRXaXRoT3B0aW9ucywgRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbiwgRWRpdG9yc09yZGVyLCBFZGl0b3JFeHRlbnNpb25zIGFzIEV4dGVuc2lvbnMsIEdyb3VwSWRlbnRpZmllciwgSUFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50LCBJRWRpdG9yQ2xvc2VFdmVudCwgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgSUVkaXRvcklkZW50aWZpZXIsIElFZGl0b3JPcGVuQ29udGV4dCwgSUVkaXRvclBhbmUsIElFZGl0b3JQYW5lU2VsZWN0aW9uLCBJRWRpdG9yUGFydE9wdGlvbnMsIElFZGl0b3JTZXJpYWxpemVyLCBJRWRpdG9yV2lsbE1vdmVFdmVudCwgSUVkaXRvcldpbGxPcGVuRXZlbnQsIElGaWxlRWRpdG9ySW5wdXQsIElNb3ZlUmVzdWx0LCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElSZXZlcnRPcHRpb25zLCBJU2F2ZU9wdGlvbnMsIElUZXh0RGlmZkVkaXRvclBhbmUsIElUb29sYmFyQWN0aW9ucywgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9ySW5wdXQsIElWaXNpYmxlRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVZpZXcsIElWaWV3RGVzY3JpcHRvciwgVmlld0NvbnRhaW5lciwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9yLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9maWxlcy9icm93c2VyL2VkaXRvcnMvZmlsZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yIH0gZnJvbSAnLi4vLi4vY29udHJpYi9maWxlcy9icm93c2VyL2VkaXRvcnMvdGV4dEZpbGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgRklMRV9FRElUT1JfSU5QVVRfSUQgfSBmcm9tICcuLi8uLi9jb250cmliL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlVGVybWluYWxPcHRpb25zLCBJRGVzZXJpYWxpemVkVGVybWluYWxFZGl0b3JJbnB1dCwgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIElUZXJtaW5hbEVkaXRvclNlcnZpY2UsIElUZXJtaW5hbEdyb3VwLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIFRlcm1pbmFsRWRpdG9yTG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlZ2lzdGVyQ29udHJpYnV0ZWRQcm9maWxlQXJncywgSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMsIElUZXJtaW5hbFByb2ZpbGVQcm92aWRlciwgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsIHR5cGUgSVRlcm1pbmFsQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbiwgSURlY29yYXRpb25EYXRhLCBJRGVjb3JhdGlvbnNQcm92aWRlciwgSURlY29yYXRpb25zU2VydmljZSwgSVJlc291cmNlRGVjb3JhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2Jyb3dzZXIvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JQYW5lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvYnJvd3Nlci9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLCBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBMYXlvdXQsIEdyb3VwRGlyZWN0aW9uLCBHcm91cE9yaWVudGF0aW9uLCBHcm91cHNBcnJhbmdlbWVudCwgR3JvdXBzT3JkZXIsIElBdXhpbGlhcnlFZGl0b3JQYXJ0LCBJQ2xvc2VBbGxFZGl0b3JzT3B0aW9ucywgSUNsb3NlRWRpdG9yT3B0aW9ucywgSUNsb3NlRWRpdG9yc0ZpbHRlciwgSUVkaXRvckRyb3BUYXJnZXREZWxlZ2F0ZSwgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBBY3RpdmF0aW9uRXZlbnQsIElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlciwgSUVkaXRvckdyb3Vwc0NvbnRhaW5lciwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JQYXJ0LCBJRWRpdG9yUmVwbGFjZW1lbnQsIElFZGl0b3JXb3JraW5nU2V0LCBJRWRpdG9yV29ya2luZ1NldE9wdGlvbnMsIElGaW5kR3JvdXBTY29wZSwgSU1lcmdlR3JvdXBPcHRpb25zLCBJTW9kYWxFZGl0b3JQYXJ0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUGFuZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JzQ2hhbmdlRXZlbnQsIElFZGl0b3JTZXJ2aWNlLCBJUmV2ZXJ0QWxsRWRpdG9yc09wdGlvbnMsIElTYXZlRWRpdG9yc09wdGlvbnMsIElTYXZlRWRpdG9yc1Jlc3VsdCwgSVZpc2libGVFZGl0b3JzQ2hhbmdlRXZlbnQsIFByZWZlcnJlZEdyb3VwIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbmFibGVtZW50U3RhdGUsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBJUmVzb3VyY2VFeHRlbnNpb24sIElTY2FubmVkRXh0ZW5zaW9uLCBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFbGV2YXRlZEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZmlsZXMvYnJvd3Nlci9lbGV2YXRlZEZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbGV2YXRlZEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZmlsZXMvY29tbW9uL2VsZXZhdGVkRmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSwgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UsIElUb2FzdE9wdGlvbnMsIElUb2FzdFJlc3VsdCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IExhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xhYmVsL2NvbW1vbi9sYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlRGV0ZWN0aW9uL2NvbW1vbi9sYW5ndWFnZURldGVjdGlvbldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYW5lbEFsaWdubWVudCwgUG9zaXRpb24gYXMgUGFydFBvc2l0aW9uLCBQYXJ0cywgU0lOR0xFX1dJTkRPV19QQVJUUyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIEludGVybmFsQmVmb3JlU2h1dGRvd25FdmVudCwgSVdpbGxTaHV0ZG93bkV2ZW50Sm9pbmVyLCBTaHV0ZG93blJlYXNvbiwgV2lsbFNodXRkb3duRXZlbnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tJbnB1dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RFeGl0SW5mbywgSVJlbW90ZUFnZW50Q29ubmVjdGlvbiwgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9icm93c2VyL2Jyb3dzZXJUZXh0RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW5jb2RpbmdPcmFjbGUsIElFbmNvZGluZ092ZXJyaWRlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvYnJvd3Nlci90ZXh0RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVRGMTZiZSwgVVRGMTZsZSwgVVRGOF93aXRoX2JvbSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi9lbmNvZGluZy5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvclNlcnZpY2UsIFRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEZpbGVFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmVhZFRleHRGaWxlT3B0aW9ucywgSVRleHRGaWxlRWRpdG9yTW9kZWwsIElUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciwgSVRleHRGaWxlU2VydmljZSwgSVRleHRGaWxlU3RyZWFtQ29udGVudCwgSVdyaXRlVGV4dEZpbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0bW9kZWxSZXNvbHZlci9jb21tb24vdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVudGl0bGVkVGV4dEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElVbnRpdGxlZFRleHRFZGl0b3JNb2RlbE1hbmFnZXIsIElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLCBVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9icm93c2VyL3dvcmtpbmdDb3B5QmFja3VwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHksIElXb3JraW5nQ29weUJhY2t1cE1ldGEsIElXb3JraW5nQ29weUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkV29ya2luZ0NvcHlCYWNrdXAsIElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UsIFdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIFdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlLCBXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RFeHRlbnNpb25TZXJ2aWNlLCBUZXN0RmlsZVNlcnZpY2UsIFRlc3RIaXN0b3J5U2VydmljZSwgVGVzdExpZmVjeWNsZVNlcnZpY2UsIFRlc3RMb2dnZXJTZXJ2aWNlLCBUZXN0TWFya2VyU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UsIFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSwgVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIFRlc3RXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hY2NvdW50cy9icm93c2VyL2RlZmF1bHRBY2NvdW50LmpzJztcblxuLy8gQmFja2NvbXBhdCBleHBvcnRcbmV4cG9ydCB7IFRlc3RGaWxlU2VydmljZSwgVGVzdExpZmVjeWNsZVNlcnZpY2UgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUZpbGVFZGl0b3JJbnB1dChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvdXJjZTogVVJJKTogRmlsZUVkaXRvcklucHV0IHtcblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVFZGl0b3JJbnB1dCwgcmVzb3VyY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xufVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRmlsZUVkaXRvckZhY3Rvcnkoe1xuXG5cdHR5cGVJZDogRklMRV9FRElUT1JfSU5QVVRfSUQsXG5cblx0Y3JlYXRlRmlsZUVkaXRvcjogKHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgcHJlZmVycmVkTmFtZSwgcHJlZmVycmVkRGVzY3JpcHRpb24sIHByZWZlcnJlZEVuY29kaW5nLCBwcmVmZXJyZWRMYW5ndWFnZUlkLCBwcmVmZXJyZWRDb250ZW50cywgaW5zdGFudGlhdGlvblNlcnZpY2UpOiBJRmlsZUVkaXRvcklucHV0ID0+IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRvcklucHV0LCByZXNvdXJjZSwgcHJlZmVycmVkUmVzb3VyY2UsIHByZWZlcnJlZE5hbWUsIHByZWZlcnJlZERlc2NyaXB0aW9uLCBwcmVmZXJyZWRFbmNvZGluZywgcHJlZmVycmVkTGFuZ3VhZ2VJZCwgcHJlZmVycmVkQ29udGVudHMpO1xuXHR9LFxuXG5cdGlzRmlsZUVkaXRvcjogKG9iaik6IG9iaiBpcyBJRmlsZUVkaXRvcklucHV0ID0+IHtcblx0XHRyZXR1cm4gb2JqIGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0O1xuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIFRlc3RUZXh0UmVzb3VyY2VFZGl0b3IgZXh0ZW5kcyBUZXh0UmVzb3VyY2VFZGl0b3Ige1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3JDb250cm9sKHBhcmVudDogSFRNTEVsZW1lbnQsIGNvbmZpZ3VyYXRpb246IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yQ29udHJvbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdENvZGVFZGl0b3IsIHBhcmVudCwgY29uZmlndXJhdGlvbiwge30pKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRleHRGaWxlRWRpdG9yIGV4dGVuZHMgVGV4dEZpbGVFZGl0b3Ige1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3JDb250cm9sKHBhcmVudDogSFRNTEVsZW1lbnQsIGNvbmZpZ3VyYXRpb246IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yQ29udHJvbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdENvZGVFZGl0b3IsIHBhcmVudCwgY29uZmlndXJhdGlvbiwgeyBjb250cmlidXRpb25zOiBbXSB9KSk7XG5cdH1cblxuXHRzZXRTZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24gfCB1bmRlZmluZWQsIHJlYXNvbjogRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbik6IHZvaWQge1xuXHRcdHRoaXMuX29wdGlvbnMgPSBzZWxlY3Rpb24gPyB1cGNhc3Q8SUVkaXRvck9wdGlvbnMsIElUZXh0RWRpdG9yT3B0aW9ucz4oeyBzZWxlY3Rpb24gfSkgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHsgcmVhc29uIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2VsZWN0aW9uKCk6IElFZGl0b3JQYW5lU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXHRcdGlmICghb3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0U2VsZWN0aW9uID0gKG9wdGlvbnMgYXMgSVRleHRFZGl0b3JPcHRpb25zKS5zZWxlY3Rpb247XG5cdFx0aWYgKCF0ZXh0U2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgVGV4dEVkaXRvclBhbmVTZWxlY3Rpb24obmV3IFNlbGVjdGlvbih0ZXh0U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgdGV4dFNlbGVjdGlvbi5zdGFydENvbHVtbiwgdGV4dFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID8/IHRleHRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB0ZXh0U2VsZWN0aW9uLmVuZENvbHVtbiA/PyB0ZXh0U2VsZWN0aW9uLnN0YXJ0Q29sdW1uKSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIGV4dGVuZHMgSUluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0c3R1YjxUPihzZXJ2aWNlOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgY3RvcjogYW55KTogVDtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RXb3JraW5nQ29weVNlcnZpY2UgZXh0ZW5kcyBXb3JraW5nQ29weVNlcnZpY2Uge1xuXHR0ZXN0VW5yZWdpc3RlcldvcmtpbmdDb3B5KHdvcmtpbmdDb3B5OiBJV29ya2luZ0NvcHkpOiB2b2lkIHtcblx0XHRyZXR1cm4gc3VwZXIudW5yZWdpc3RlcldvcmtpbmdDb3B5KHdvcmtpbmdDb3B5KTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UoXG5cdG92ZXJyaWRlcz86IHtcblx0XHRlbnZpcm9ubWVudFNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUVudmlyb25tZW50U2VydmljZTtcblx0XHRmaWxlU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJRmlsZVNlcnZpY2U7XG5cdFx0d29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2U7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRleHRGaWxlU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJVGV4dEZpbGVTZXJ2aWNlO1xuXHRcdHBhdGhTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElQYXRoU2VydmljZTtcblx0XHRlZGl0b3JTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElFZGl0b3JTZXJ2aWNlO1xuXHRcdGNvbnRleHRLZXlTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElDb250ZXh0S2V5U2VydmljZTtcblx0XHR0ZXh0RWRpdG9yU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJVGV4dEVkaXRvclNlcnZpY2U7XG5cdH0sXG5cdGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+ID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpXG4pOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRbSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSldLFxuXHRcdFtJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTnVsbEFjdGlvblZpZXdJdGVtU2VydmljZSldLFxuXHQpKSk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvcldvcmtlclNlcnZpY2UsIG5ldyBUZXN0RWRpdG9yV29ya2VyU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya2luZ0NvcHlTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RXb3JraW5nQ29weVNlcnZpY2UoKSkpO1xuXHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBvdmVycmlkZXM/LmVudmlyb25tZW50U2VydmljZSA/IG92ZXJyaWRlcy5lbnZpcm9ubWVudFNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogVGVzdEVudmlyb25tZW50U2VydmljZTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBvdmVycmlkZXM/LmNvbnRleHRLZXlTZXJ2aWNlID8gb3ZlcnJpZGVzLmNvbnRleHRLZXlTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSA6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vY2tDb250ZXh0S2V5U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZShUZXN0V29ya3NwYWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlnU2VydmljZSA9IG92ZXJyaWRlcz8uY29uZmlndXJhdGlvblNlcnZpY2UgPyBvdmVycmlkZXMuY29uZmlndXJhdGlvblNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0ZmlsZXM6IHtcblx0XHRcdHBhcnRpY2lwYW50czoge1xuXHRcdFx0XHR0aW1lb3V0OiA2MDAwMFxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblx0Y29uc3QgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGNvbmZpZ1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRTZXJ2aWNlLCBuZXcgVGVzdFJlbW90ZUFnZW50U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLCBuZXcgVGVzdExhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGF0aFNlcnZpY2UsIG92ZXJyaWRlcz8ucGF0aFNlcnZpY2UgPyBvdmVycmlkZXMucGF0aFNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogbmV3IFRlc3RQYXRoU2VydmljZSgpKTtcblx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBUZXN0TGF5b3V0U2VydmljZSgpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwgbmV3IFRlc3REaWFsb2dTZXJ2aWNlKCkpO1xuXHRjb25zdCBhY2Nlc3NpYmlsaXR5U2VydmljZSA9IG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UoKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCB7XG5cdFx0cGxheVNpZ25hbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGlzU291bmRFbmFibGVkKHNpZ25hbDogdW5rbm93bikgeyByZXR1cm4gZmFsc2U7IH0sXG5cdH0gYXMgYW55KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZURpYWxvZ1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RGaWxlRGlhbG9nU2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZVNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhpc3RvcnlTZXJ2aWNlLCBuZXcgVGVzdEhpc3RvcnlTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSwgbmV3IFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZShjb25maWdTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVuZG9SZWRvU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5kb1JlZG9TZXJ2aWNlKSk7XG5cdGNvbnN0IHRoZW1lU2VydmljZSA9IG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRoZW1lU2VydmljZSwgdGhlbWVTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgbmV3IFRlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1vZGVsU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsU2VydmljZSkpKTtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBvdmVycmlkZXM/LmZpbGVTZXJ2aWNlID8gb3ZlcnJpZGVzLmZpbGVTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSA6IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSkpO1xuXHRjb25zdCBtYXJrZXJTZXJ2aWNlID0gbmV3IFRlc3RNYXJrZXJTZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1hcmtlclNlcnZpY2UsIG1hcmtlclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UpKSk7XG5cdGNvbnN0IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVByb2ZpbGVzU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsIG92ZXJyaWRlcz8ud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlID8gb3ZlcnJpZGVzPy53b3JraW5nQ29weUJhY2t1cFNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpIDogZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZW51U2VydmljZSwgbmV3IFRlc3RNZW51U2VydmljZSgpKTtcblx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBuZXcgTW9ja0tleWJpbmRpbmdTZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUtleWJpbmRpbmdTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURlY29yYXRpb25zU2VydmljZSwgbmV3IFRlc3REZWNvcmF0aW9uc1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBUZXN0RXh0ZW5zaW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya2luZ0NvcHlGaWxlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtpbmdDb3B5RmlsZVNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRleHRGaWxlU2VydmljZSwgb3ZlcnJpZGVzPy50ZXh0RmlsZVNlcnZpY2UgPyBvdmVycmlkZXMudGV4dEZpbGVTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSA6IGRpc3Bvc2FibGVzLmFkZCg8SVRleHRGaWxlU2VydmljZT5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGV4dEZpbGVTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3N0U2VydmljZSwgPElIb3N0U2VydmljZT5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0SG9zdFNlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dE1vZGVsU2VydmljZSwgPElUZXh0TW9kZWxTZXJ2aWNlPmRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ2dlclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExvZ2dlclNlcnZpY2UoVGVzdEVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSkpKTtcblx0Y29uc3QgZWRpdG9yR3JvdXBTZXJ2aWNlID0gbmV3IFRlc3RFZGl0b3JHcm91cHNTZXJ2aWNlKFtuZXcgVGVzdEVkaXRvckdyb3VwVmlldygwKV0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBlZGl0b3JHcm91cFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIDxJTGFiZWxTZXJ2aWNlPmRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYWJlbFNlcnZpY2UpKSk7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBvdmVycmlkZXM/LmVkaXRvclNlcnZpY2UgPyBvdmVycmlkZXMuZWRpdG9yU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkgOiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlKGVkaXRvckdyb3VwU2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yUGFuZVNlcnZpY2UsIG5ldyBFZGl0b3JQYW5lU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JSZXNvbHZlclNlcnZpY2UpKSk7XG5cdGNvbnN0IHRleHRFZGl0b3JTZXJ2aWNlID0gb3ZlcnJpZGVzPy50ZXh0RWRpdG9yU2VydmljZSA/IG92ZXJyaWRlcy50ZXh0RWRpdG9yU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkgOiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dEVkaXRvclNlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dEVkaXRvclNlcnZpY2UsIHRleHRFZGl0b3JTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29kZUVkaXRvclNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQ29kZUVkaXRvclNlcnZpY2UoZWRpdG9yU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb25maWdTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFBhbmVDb21wb3NpdGVTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlzdFNlcnZpY2UsIG5ldyBUZXN0TGlzdFNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRWaWV3U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRWaWV3U2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dE1lbnVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29udGV4dE1lbnVTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBRdWlja0lucHV0U2VydmljZShjb25maWdTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZXNTZXJ2aWNlLCBuZXcgVGVzdFdvcmtzcGFjZXNTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZShmYWxzZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIG5ldyBUZXN0VGVybWluYWxJbnN0YW5jZVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsRWRpdG9yU2VydmljZSwgbmV3IFRlc3RUZXJtaW5hbEVkaXRvclNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBuZXcgVGVzdFRlcm1pbmFsR3JvdXBTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLCBuZXcgVGVzdFRlcm1pbmFsUHJvZmlsZVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgbmV3IFRlc3RUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxMb2dTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2dTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbGV2YXRlZEZpbGVTZXJ2aWNlLCBuZXcgQnJvd3NlckVsZXZhdGVkRmlsZVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlLCBuZXcgUmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UoY29uZmlnU2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgTnVsbEhvdmVyU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIG5ldyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0Q2hhdFdpZGdldFNlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCBEZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXG5cdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZTtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RTZXJ2aWNlQWNjZXNzb3Ige1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHVibGljIGxpZmVjeWNsZVNlcnZpY2U6IFRlc3RMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHB1YmxpYyB0ZXh0RmlsZVNlcnZpY2U6IFRlc3RUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RWRpdG9yU2VydmljZSBwdWJsaWMgdGV4dEVkaXRvclNlcnZpY2U6IElUZXh0RWRpdG9yU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHVibGljIHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwdWJsaWMgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogVGVzdEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwdWJsaWMgY29udGV4dFNlcnZpY2U6IFRlc3RDb250ZXh0U2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwdWJsaWMgbW9kZWxTZXJ2aWNlOiBNb2RlbFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwdWJsaWMgZmlsZVNlcnZpY2U6IFRlc3RGaWxlU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHB1YmxpYyBmaWxlRGlhbG9nU2VydmljZTogVGVzdEZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwdWJsaWMgZGlhbG9nU2VydmljZTogVGVzdERpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHVibGljIHdvcmtpbmdDb3B5U2VydmljZTogVGVzdFdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHVibGljIGVkaXRvclNlcnZpY2U6IFRlc3RFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUGFuZVNlcnZpY2UgcHVibGljIGVkaXRvclBhbmVTZXJ2aWNlOiBJRWRpdG9yUGFuZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHVibGljIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHB1YmxpYyBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwdWJsaWMgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwdWJsaWMgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHB1YmxpYyBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHB1YmxpYyB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSBwdWJsaWMgdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZTogVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHB1YmxpYyB0ZXN0Q29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBwdWJsaWMgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlOiBUZXN0V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHVibGljIGhvc3RTZXJ2aWNlOiBUZXN0SG9zdFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwdWJsaWMgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwdWJsaWMgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwdWJsaWMgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHVibGljIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHB1YmxpYyBpbnN0YW50aXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHB1YmxpYyBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSBwdWJsaWMgd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlOiBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHVibGljIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFbGV2YXRlZEZpbGVTZXJ2aWNlIHB1YmxpYyBlbGV2YXRlZEZpbGVTZXJ2aWNlOiBJRWxldmF0ZWRGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHVibGljIHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IFRlc3RXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHB1YmxpYyBkZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHVibGljIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RUZXh0RmlsZVNlcnZpY2UgZXh0ZW5kcyBCcm93c2VyVGV4dEZpbGVTZXJ2aWNlIHtcblx0cHJpdmF0ZSByZWFkU3RyZWFtRXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3cml0ZUVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlOiBJVW50aXRsZWRUZXh0RWRpdG9yTW9kZWxNYW5hZ2VyLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2Ugd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbGV2YXRlZEZpbGVTZXJ2aWNlIGVsZXZhdGVkRmlsZVNlcnZpY2U6IElFbGV2YXRlZEZpbGVTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIGRlY29yYXRpb25zU2VydmljZTogSURlY29yYXRpb25zU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0dW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSxcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG1vZGVsU2VydmljZSxcblx0XHRcdGVudmlyb25tZW50U2VydmljZSxcblx0XHRcdGRpYWxvZ1NlcnZpY2UsXG5cdFx0XHRmaWxlRGlhbG9nU2VydmljZSxcblx0XHRcdHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdFx0cGF0aFNlcnZpY2UsXG5cdFx0XHR3b3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdFx0bGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0ZWxldmF0ZWRGaWxlU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRkZWNvcmF0aW9uc1NlcnZpY2Vcblx0XHQpO1xuXHR9XG5cblx0c2V0UmVhZFN0cmVhbUVycm9yT25jZShlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy5yZWFkU3RyZWFtRXJyb3IgPSBlcnJvcjtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlYWRTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxJVGV4dEZpbGVTdHJlYW1Db250ZW50PiB7XG5cdFx0aWYgKHRoaXMucmVhZFN0cmVhbUVycm9yKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHRoaXMucmVhZFN0cmVhbUVycm9yO1xuXHRcdFx0dGhpcy5yZWFkU3RyZWFtRXJyb3IgPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IGNvbnRlbnQucmVzb3VyY2UsXG5cdFx0XHRuYW1lOiBjb250ZW50Lm5hbWUsXG5cdFx0XHRtdGltZTogY29udGVudC5tdGltZSxcblx0XHRcdGN0aW1lOiBjb250ZW50LmN0aW1lLFxuXHRcdFx0ZXRhZzogY29udGVudC5ldGFnLFxuXHRcdFx0ZW5jb2Rpbmc6ICd1dGY4Jyxcblx0XHRcdHZhbHVlOiBhd2FpdCBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0oY29udGVudC52YWx1ZSksXG5cdFx0XHRzaXplOiAxMCxcblx0XHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRleGVjdXRhYmxlOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRzZXRXcml0ZUVycm9yT25jZShlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy53cml0ZUVycm9yID0gZXJyb3I7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB3cml0ZShyZXNvdXJjZTogVVJJLCB2YWx1ZTogc3RyaW5nIHwgSVRleHRTbmFwc2hvdCwgb3B0aW9ucz86IElXcml0ZVRleHRGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7XG5cdFx0aWYgKHRoaXMud3JpdGVFcnJvcikge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSB0aGlzLndyaXRlRXJyb3I7XG5cdFx0XHR0aGlzLndyaXRlRXJyb3IgPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci53cml0ZShyZXNvdXJjZSwgdmFsdWUsIG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0QnJvd3NlclRleHRGaWxlU2VydmljZVdpdGhFbmNvZGluZ092ZXJyaWRlcyBleHRlbmRzIEJyb3dzZXJUZXh0RmlsZVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgX3Rlc3RFbmNvZGluZzogVGVzdEVuY29kaW5nT3JhY2xlIHwgdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBnZXQgZW5jb2RpbmcoKTogVGVzdEVuY29kaW5nT3JhY2xlIHtcblx0XHRpZiAoIXRoaXMuX3Rlc3RFbmNvZGluZykge1xuXHRcdFx0dGhpcy5fdGVzdEVuY29kaW5nID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0RW5jb2RpbmdPcmFjbGUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdGVzdEVuY29kaW5nO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RW5jb2RpbmdPcmFjbGUgZXh0ZW5kcyBFbmNvZGluZ09yYWNsZSB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBlbmNvZGluZ092ZXJyaWRlcygpOiBJRW5jb2RpbmdPdmVycmlkZVtdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBleHRlbnNpb246ICd1dGYxNmxlJywgZW5jb2Rpbmc6IFVURjE2bGUgfSxcblx0XHRcdHsgZXh0ZW5zaW9uOiAndXRmMTZiZScsIGVuY29kaW5nOiBVVEYxNmJlIH0sXG5cdFx0XHR7IGV4dGVuc2lvbjogJ3V0Zjhib20nLCBlbmNvZGluZzogVVRGOF93aXRoX2JvbSB9XG5cdFx0XTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXQgZW5jb2RpbmdPdmVycmlkZXMob3ZlcnJpZGVzOiBJRW5jb2RpbmdPdmVycmlkZVtdKSB7IH1cbn1cblxuY2xhc3MgVGVzdEVudmlyb25tZW50U2VydmljZVdpdGhBcmdzIGV4dGVuZHMgQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB7XG5cdGFyZ3MgPSBbXTtcbn1cblxuZXhwb3J0IGNvbnN0IFRlc3RFbnZpcm9ubWVudFNlcnZpY2UgPSBuZXcgVGVzdEVudmlyb25tZW50U2VydmljZVdpdGhBcmdzKCcnLCBVUkkuZmlsZSgndGVzdHMnKS53aXRoKHsgc2NoZW1lOiAndnNjb2RlLXRlc3RzJyB9KSwgT2JqZWN0LmNyZWF0ZShudWxsKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuZXhwb3J0IGNsYXNzIFRlc3RQcm9ncmVzc1NlcnZpY2UgaW1wbGVtZW50cyBJUHJvZ3Jlc3NTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHR3aXRoUHJvZ3Jlc3MoXG5cdFx0b3B0aW9uczogSVByb2dyZXNzT3B0aW9ucyB8IElQcm9ncmVzc0RpYWxvZ09wdGlvbnMgfCBJUHJvZ3Jlc3NXaW5kb3dPcHRpb25zIHwgSVByb2dyZXNzTm90aWZpY2F0aW9uT3B0aW9ucyB8IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsXG5cdFx0dGFzazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFByb21pc2U8YW55Pixcblx0XHRvbkRpZENhbmNlbD86ICgoY2hvaWNlPzogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB2b2lkKSB8IHVuZGVmaW5lZFxuXHQpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiB0YXNrKFByb2dyZXNzLk5vbmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RGVjb3JhdGlvbnNTZXJ2aWNlIGltcGxlbWVudHMgSURlY29yYXRpb25zU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWNvcmF0aW9uczogRXZlbnQ8SVJlc291cmNlRGVjb3JhdGlvbkNoYW5nZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cblx0cmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKF9wcm92aWRlcjogSURlY29yYXRpb25zUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0Z2V0RGVjb3JhdGlvbihfdXJpOiBVUkksIF9pbmNsdWRlQ2hpbGRyZW46IGJvb2xlYW4sIF9vdmVyd3JpdGU/OiBJRGVjb3JhdGlvbkRhdGEpOiBJRGVjb3JhdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RNZW51U2VydmljZSBpbXBsZW1lbnRzIElNZW51U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y3JlYXRlTWVudShfaWQ6IE1lbnVJZCwgX3Njb3BlZEtleWJpbmRpbmdTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJTWVudSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW11cblx0XHR9O1xuXHR9XG5cblx0Z2V0TWVudUFjdGlvbnMoaWQ6IE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgb3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucyk6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRnZXRNZW51Q29udGV4dHMoaWQ6IE1lbnVJZCk6IFJlYWRvbmx5U2V0PHN0cmluZz4ge1xuXHRcdHJldHVybiBuZXcgU2V0PHN0cmluZz4oKTtcblx0fVxuXG5cdHJlc2V0SGlkZGVuU3RhdGVzKCk6IHZvaWQge1xuXHRcdC8vIG5vdGhpbmdcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEZpbGVEaWFsb2dTZXJ2aWNlIGltcGxlbWVudHMgSUZpbGVEaWFsb2dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNvbmZpcm1SZXN1bHQhOiBDb25maXJtUmVzdWx0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlXG5cdCkgeyB9XG5cdGFzeW5jIGRlZmF1bHRGaWxlUGF0aChfc2NoZW1lRmlsdGVyPzogc3RyaW5nKTogUHJvbWlzZTxVUkk+IHsgcmV0dXJuIHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTsgfVxuXHRhc3luYyBkZWZhdWx0Rm9sZGVyUGF0aChfc2NoZW1lRmlsdGVyPzogc3RyaW5nKTogUHJvbWlzZTxVUkk+IHsgcmV0dXJuIHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTsgfVxuXHRhc3luYyBkZWZhdWx0V29ya3NwYWNlUGF0aChfc2NoZW1lRmlsdGVyPzogc3RyaW5nKTogUHJvbWlzZTxVUkk+IHsgcmV0dXJuIHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTsgfVxuXHRhc3luYyBwcmVmZXJyZWRIb21lKF9zY2hlbWVGaWx0ZXI/OiBzdHJpbmcpOiBQcm9taXNlPFVSST4geyByZXR1cm4gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpOyB9XG5cdHBpY2tGaWxlRm9sZGVyQW5kT3Blbihfb3B0aW9uczogSVBpY2tBbmRPcGVuT3B0aW9ucyk6IFByb21pc2U8YW55PiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoMCk7IH1cblx0cGlja0ZpbGVBbmRPcGVuKF9vcHRpb25zOiBJUGlja0FuZE9wZW5PcHRpb25zKTogUHJvbWlzZTxhbnk+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgwKTsgfVxuXHRwaWNrRm9sZGVyQW5kT3Blbihfb3B0aW9uczogSVBpY2tBbmRPcGVuT3B0aW9ucyk6IFByb21pc2U8YW55PiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoMCk7IH1cblx0cGlja1dvcmtzcGFjZUFuZE9wZW4oX29wdGlvbnM6IElQaWNrQW5kT3Blbk9wdGlvbnMpOiBQcm9taXNlPGFueT4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKDApOyB9XG5cblx0cHJpdmF0ZSBmaWxlVG9TYXZlITogVVJJO1xuXHRzZXRQaWNrRmlsZVRvU2F2ZShwYXRoOiBVUkkpOiB2b2lkIHsgdGhpcy5maWxlVG9TYXZlID0gcGF0aDsgfVxuXHRwaWNrRmlsZVRvU2F2ZShkZWZhdWx0VXJpOiBVUkksIGF2YWlsYWJsZUZpbGVTeXN0ZW1zPzogc3RyaW5nW10pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZmlsZVRvU2F2ZSk7IH1cblxuXHRzaG93U2F2ZURpYWxvZyhfb3B0aW9uczogSVNhdmVEaWFsb2dPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG5cdHNob3dPcGVuRGlhbG9nKF9vcHRpb25zOiBJT3BlbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPFVSSVtdIHwgdW5kZWZpbmVkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgfVxuXG5cdHNldENvbmZpcm1SZXN1bHQocmVzdWx0OiBDb25maXJtUmVzdWx0KTogdm9pZCB7IHRoaXMuY29uZmlybVJlc3VsdCA9IHJlc3VsdDsgfVxuXHRzaG93U2F2ZUNvbmZpcm0oZmlsZU5hbWVzT3JSZXNvdXJjZXM6IChzdHJpbmcgfCBVUkkpW10pOiBQcm9taXNlPENvbmZpcm1SZXN1bHQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbmZpcm1SZXN1bHQpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TGF5b3V0U2VydmljZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRvcGVuZWREZWZhdWx0RWRpdG9ycyA9IGZhbHNlO1xuXG5cdG1haW5Db250YWluZXJEaW1lbnNpb246IElEaW1lbnNpb24gPSB7IHdpZHRoOiA4MDAsIGhlaWdodDogNjAwIH07XG5cdGFjdGl2ZUNvbnRhaW5lckRpbWVuc2lvbjogSURpbWVuc2lvbiA9IHsgd2lkdGg6IDgwMCwgaGVpZ2h0OiA2MDAgfTtcblx0bWFpbkNvbnRhaW5lck9mZnNldDogSUxheW91dE9mZnNldEluZm8gPSB7IHRvcDogMCwgcXVpY2tQaWNrVG9wOiAwIH07XG5cdGFjdGl2ZUNvbnRhaW5lck9mZnNldDogSUxheW91dE9mZnNldEluZm8gPSB7IHRvcDogMCwgcXVpY2tQaWNrVG9wOiAwIH07XG5cblx0bWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmJvZHk7XG5cdGNvbnRhaW5lcnMgPSBbbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5XTtcblx0YWN0aXZlQ29udGFpbmVyOiBIVE1MRWxlbWVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVplbk1vZGU6IEV2ZW50PGJvb2xlYW4+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNYWluRWRpdG9yQ2VudGVyZWRMYXlvdXQ6IEV2ZW50PGJvb2xlYW4+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VXaW5kb3dNYXhpbWl6ZWQ6IEV2ZW50PHsgd2luZG93SWQ6IG51bWJlcjsgbWF4aW1pemVkOiBib29sZWFuIH0+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbFBvc2l0aW9uOiBFdmVudDxzdHJpbmc+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYW5lbEFsaWdubWVudDogRXZlbnQ8UGFuZWxBbGlnbm1lbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eTogRXZlbnQ8SVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0b25EaWRMYXlvdXRNYWluQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0b25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIgPSBFdmVudC5Ob25lO1xuXHRvbkRpZExheW91dENvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlTm90aWZpY2F0aW9uc1Zpc2liaWxpdHkgPSBFdmVudC5Ob25lO1xuXHRvbkRpZEFkZENvbnRhaW5lciA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VBdXhpbGlhcnlCYXJNYXhpbWl6ZWQgPSBFdmVudC5Ob25lO1xuXG5cdGxheW91dCgpOiB2b2lkIHsgfVxuXHRpc1Jlc3RvcmVkKCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHR3aGVuUmVhZHk6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0d2hlblJlc3RvcmVkOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdGhhc0ZvY3VzKF9wYXJ0OiBQYXJ0cyk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRmb2N1c1BhcnQoX3BhcnQ6IFBhcnRzKTogdm9pZCB7IH1cblx0aGFzTWFpbldpbmRvd0JvcmRlcigpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGdldE1haW5XaW5kb3dCb3JkZXJSYWRpdXMoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRpc1Zpc2libGUoX3BhcnQ6IFBhcnRzKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGdldENvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7IHJldHVybiBtYWluV2luZG93LmRvY3VtZW50LmJvZHk7IH1cblx0d2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRpc1RpdGxlQmFySGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNTdGF0dXNCYXJIaWRkZW4oKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc0FjdGl2aXR5QmFySGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0c2V0QWN0aXZpdHlCYXJIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IHZvaWQgeyB9XG5cdHNldEJhbm5lckhpZGRlbihfaGlkZGVuOiBib29sZWFuKTogdm9pZCB7IH1cblx0aXNTaWRlQmFySGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgc2V0RWRpdG9ySGlkZGVuKF9oaWRkZW46IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzZXRTaWRlQmFySGlkZGVuKF9oaWRkZW46IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzZXRBdXhpbGlhcnlCYXJIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldFBhcnRIaWRkZW4oX2hpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRpc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0dG9nZ2xlU2Vjb25kYXJ5U2lkZUJhcigpOiB2b2lkIHsgfVxuXHRpc1BhbmVsSGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgc2V0UGFuZWxIaWRkZW4oX2hpZGRlbjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB9XG5cdHRvZ2dsZU1heGltaXplZFBhbmVsKCk6IHZvaWQgeyB9XG5cdGlzUGFuZWxNYXhpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHR0b2dnbGVNYXhpbWl6ZWRBdXhpbGlhcnlCYXIoKTogdm9pZCB7IH1cblx0c2V0QXV4aWxpYXJ5QmFyTWF4aW1pemVkKG1heGltaXplZDogYm9vbGVhbik6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRnZXRNZW51YmFyVmlzaWJpbGl0eSgpOiBNZW51QmFyVmlzaWJpbGl0eSB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0dG9nZ2xlTWVudUJhcigpOiB2b2lkIHsgfVxuXHRnZXRTaWRlQmFyUG9zaXRpb24oKSB7IHJldHVybiAwOyB9XG5cdGdldFBhbmVsUG9zaXRpb24oKSB7IHJldHVybiAwOyB9XG5cdGdldFBhbmVsQWxpZ25tZW50KCk6IFBhbmVsQWxpZ25tZW50IHsgcmV0dXJuICdjZW50ZXInOyB9XG5cdGFzeW5jIHNldFBhbmVsUG9zaXRpb24oX3Bvc2l0aW9uOiBQYXJ0UG9zaXRpb24pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzZXRQYW5lbEFsaWdubWVudChfYWxpZ25tZW50OiBQYW5lbEFsaWdubWVudCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFkZENsYXNzKF9jbGF6ejogc3RyaW5nKTogdm9pZCB7IH1cblx0cmVtb3ZlQ2xhc3MoX2NsYXp6OiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRnZXRNYXhpbXVtRWRpdG9yRGltZW5zaW9ucygpOiBJRGltZW5zaW9uIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHR0b2dnbGVaZW5Nb2RlKCk6IHZvaWQgeyB9XG5cdGlzTWFpbkVkaXRvckxheW91dENlbnRlcmVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Y2VudGVyTWFpbkVkaXRvckxheW91dChfYWN0aXZlOiBib29sZWFuKTogdm9pZCB7IH1cblx0cmVzaXplUGFydChfcGFydDogUGFydHMsIF9zaXplQ2hhbmdlV2lkdGg6IG51bWJlciwgX3NpemVDaGFuZ2VIZWlnaHQ6IG51bWJlcik6IHZvaWQgeyB9XG5cdGdldFNpemUocGFydDogUGFydHMpOiBJVmlld1NpemUgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0U2l6ZShwYXJ0OiBQYXJ0cywgc2l6ZTogSVZpZXdTaXplKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRyZWdpc3RlclBhcnQocGFydDogUGFydCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHRpc1dpbmRvd01heGltaXplZCh0YXJnZXRXaW5kb3c6IFdpbmRvdykgeyByZXR1cm4gZmFsc2U7IH1cblx0dXBkYXRlV2luZG93TWF4aW1pemVkU3RhdGUodGFyZ2V0V2luZG93OiBXaW5kb3csIG1heGltaXplZDogYm9vbGVhbik6IHZvaWQgeyB9XG5cdGdldFZpc2libGVOZWlnaGJvclBhcnQocGFydDogUGFydHMsIGRpcmVjdGlvbjogRGlyZWN0aW9uKTogUGFydHMgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGZvY3VzKCkgeyB9XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuY29uc3QgYWN0aXZlVmlld2xldDogUGFuZUNvbXBvc2l0ZSA9IHt9IGFzIGFueTtcblxuZXhwb3J0IGNsYXNzIFRlc3RQYW5lQ29tcG9zaXRlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRQYW5lQ29tcG9zaXRlT3BlbjogRXZlbnQ8eyBjb21wb3NpdGU6IElQYW5lQ29tcG9zaXRlOyB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9Pjtcblx0cmVhZG9ubHkgb25EaWRQYW5lQ29tcG9zaXRlQ2xvc2U6IEV2ZW50PHsgY29tcG9zaXRlOiBJUGFuZUNvbXBvc2l0ZTsgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT47XG5cblx0cHJpdmF0ZSBwYXJ0cyA9IG5ldyBNYXA8Vmlld0NvbnRhaW5lckxvY2F0aW9uLCBJUGFuZUNvbXBvc2l0ZVBhcnQ+KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucGFydHMuc2V0KFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgbmV3IFRlc3RQYW5lbFBhcnQoKSk7XG5cdFx0dGhpcy5wYXJ0cy5zZXQoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIG5ldyBUZXN0U2lkZUJhclBhcnQoKSk7XG5cblx0XHR0aGlzLm9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4gPSBFdmVudC5hbnkoLi4uKFtWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyXS5tYXAobG9jID0+IEV2ZW50Lm1hcCh0aGlzLnBhcnRzLmdldChsb2MpIS5vbkRpZFBhbmVDb21wb3NpdGVPcGVuLCBjb21wb3NpdGUgPT4geyByZXR1cm4geyBjb21wb3NpdGUsIHZpZXdDb250YWluZXJMb2NhdGlvbjogbG9jIH07IH0pKSkpO1xuXHRcdHRoaXMub25EaWRQYW5lQ29tcG9zaXRlQ2xvc2UgPSBFdmVudC5hbnkoLi4uKFtWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyXS5tYXAobG9jID0+IEV2ZW50Lm1hcCh0aGlzLnBhcnRzLmdldChsb2MpIS5vbkRpZFBhbmVDb21wb3NpdGVDbG9zZSwgY29tcG9zaXRlID0+IHsgcmV0dXJuIHsgY29tcG9zaXRlLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IGxvYyB9OyB9KSkpKTtcblx0fVxuXG5cdGdldFBhcnRJZCh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IFNJTkdMRV9XSU5ET1dfUEFSVFMge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikucGFydElkO1xuXHR9XG5cdGdldFJlZ2lzdHJ5SWQodmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikucmVnaXN0cnlJZDtcblx0fVxuXHRvcGVuUGFuZUNvbXBvc2l0ZShpZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiwgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikub3BlblBhbmVDb21wb3NpdGUoaWQsIGZvY3VzKTtcblx0fVxuXHRnZXRBY3RpdmVQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogSVBhbmVDb21wb3NpdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpO1xuXHR9XG5cdGdldFBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZywgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5nZXRQYW5lQ29tcG9zaXRlKGlkKTtcblx0fVxuXHRnZXRQYW5lQ29tcG9zaXRlcyh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yW10ge1xuXHRcdHJldHVybiB0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikuZ2V0UGFuZUNvbXBvc2l0ZXMoKTtcblx0fVxuXHRnZXRQcm9ncmVzc0luZGljYXRvcihpZDogc3RyaW5nLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IElQcm9ncmVzc0luZGljYXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGFydEJ5TG9jYXRpb24odmlld0NvbnRhaW5lckxvY2F0aW9uKS5nZXRQcm9ncmVzc0luZGljYXRvcihpZCk7XG5cdH1cblx0aGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLmdldFBhcnRCeUxvY2F0aW9uKHZpZXdDb250YWluZXJMb2NhdGlvbikuaGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoKTtcblx0fVxuXHRnZXRMYXN0QWN0aXZlUGFuZUNvbXBvc2l0ZUlkKHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRQYXJ0QnlMb2NhdGlvbih2aWV3Q29udGFpbmVyTG9jYXRpb24pLmdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoKTtcblx0fVxuXG5cdGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHModmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBzdHJpbmdbXSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHModmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBzdHJpbmdbXSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcyh2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHN0cmluZ1tdIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRnZXRQYXJ0QnlMb2NhdGlvbih2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IElQYW5lQ29tcG9zaXRlUGFydCB7XG5cdFx0cmV0dXJuIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucGFydHMuZ2V0KHZpZXdDb250YWluZXJMb2NhdGlvbikpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0U2lkZUJhclBhcnQgaW1wbGVtZW50cyBJUGFuZUNvbXBvc2l0ZVBhcnQge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRvbkRpZFZpZXdsZXRSZWdpc3RlckVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxQYW5lQ29tcG9zaXRlRGVzY3JpcHRvcj4oKTtcblx0b25EaWRWaWV3bGV0RGVyZWdpc3RlckVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxQYW5lQ29tcG9zaXRlRGVzY3JpcHRvcj4oKTtcblx0b25EaWRWaWV3bGV0T3BlbkVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJUGFuZUNvbXBvc2l0ZT4oKTtcblx0b25EaWRWaWV3bGV0Q2xvc2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVBhbmVDb21wb3NpdGU+KCk7XG5cblx0cmVhZG9ubHkgcGFydElkID0gUGFydHMuU0lERUJBUl9QQVJUO1xuXHRyZWFkb25seSByZWdpc3RyeUlkID0gUGFuZUNvbXBvc2l0ZUV4dGVuc2lvbnMuVmlld2xldHM7XG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50ID0gdW5kZWZpbmVkITtcblx0bWluaW11bVdpZHRoID0gMDtcblx0bWF4aW11bVdpZHRoID0gMDtcblx0bWluaW11bUhlaWdodCA9IDA7XG5cdG1heGltdW1IZWlnaHQgPSAwO1xuXHRvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkUGFuZUNvbXBvc2l0ZU9wZW4gPSB0aGlzLm9uRGlkVmlld2xldE9wZW5FbWl0dGVyLmV2ZW50O1xuXHRvbkRpZFBhbmVDb21wb3NpdGVDbG9zZSA9IHRoaXMub25EaWRWaWV3bGV0Q2xvc2VFbWl0dGVyLmV2ZW50O1xuXG5cdG9wZW5QYW5lQ29tcG9zaXRlKGlkOiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8SVBhbmVDb21wb3NpdGUgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG5cdGdldFBhbmVDb21wb3NpdGVzKCk6IFBhbmVDb21wb3NpdGVEZXNjcmlwdG9yW10geyByZXR1cm4gW107IH1cblx0Z2V0QWxsVmlld2xldHMoKTogUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3JbXSB7IHJldHVybiBbXTsgfVxuXHRnZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCk6IElQYW5lQ29tcG9zaXRlIHsgcmV0dXJuIGFjdGl2ZVZpZXdsZXQ7IH1cblx0Z2V0RGVmYXVsdFZpZXdsZXRJZCgpOiBzdHJpbmcgeyByZXR1cm4gJ3dvcmtiZW5jaC52aWV3LmV4cGxvcmVyJzsgfVxuXHRnZXRQYW5lQ29tcG9zaXRlKGlkOiBzdHJpbmcpOiBQYW5lQ29tcG9zaXRlRGVzY3JpcHRvciB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0UHJvZ3Jlc3NJbmRpY2F0b3IoaWQ6IHN0cmluZykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGhpZGVBY3RpdmVQYW5lQ29tcG9zaXRlKCk6IHZvaWQgeyB9XG5cdGdldExhc3RBY3RpdmVQYW5lQ29tcG9zaXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIHVuZGVmaW5lZCE7IH1cblx0ZGlzcG9zZSgpIHsgfVxuXHRnZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKCkgeyByZXR1cm4gW107IH1cblx0Z2V0VmlzaWJsZVBhbmVDb21wb3NpdGVJZHMoKSB7IHJldHVybiBbXTsgfVxuXHRnZXRQYW5lQ29tcG9zaXRlSWRzKCkgeyByZXR1cm4gW107IH1cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZCB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RQYW5lbFBhcnQgaW1wbGVtZW50cyBJUGFuZUNvbXBvc2l0ZVBhcnQge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRlbGVtZW50OiBIVE1MRWxlbWVudCA9IHVuZGVmaW5lZCE7XG5cdG1pbmltdW1XaWR0aCA9IDA7XG5cdG1heGltdW1XaWR0aCA9IDA7XG5cdG1pbmltdW1IZWlnaHQgPSAwO1xuXHRtYXhpbXVtSGVpZ2h0ID0gMDtcblx0b25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZFBhbmVDb21wb3NpdGVPcGVuID0gbmV3IEVtaXR0ZXI8SVBhbmVDb21wb3NpdGU+KCkuZXZlbnQ7XG5cdG9uRGlkUGFuZUNvbXBvc2l0ZUNsb3NlID0gbmV3IEVtaXR0ZXI8SVBhbmVDb21wb3NpdGU+KCkuZXZlbnQ7XG5cdHJlYWRvbmx5IHBhcnRJZCA9IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUO1xuXHRyZWFkb25seSByZWdpc3RyeUlkID0gUGFuZUNvbXBvc2l0ZUV4dGVuc2lvbnMuQXV4aWxpYXJ5O1xuXG5cdGFzeW5jIG9wZW5QYW5lQ29tcG9zaXRlKGlkPzogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldFBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IGFueSB7IHJldHVybiBhY3RpdmVWaWV3bGV0OyB9XG5cdGdldFBhbmVDb21wb3NpdGVzKCkgeyByZXR1cm4gW107IH1cblx0Z2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcygpIHsgcmV0dXJuIFtdOyB9XG5cdGdldFZpc2libGVQYW5lQ29tcG9zaXRlSWRzKCkgeyByZXR1cm4gW107IH1cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcygpIHsgcmV0dXJuIFtdOyB9XG5cdGdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKTogSVBhbmVDb21wb3NpdGUgeyByZXR1cm4gYWN0aXZlVmlld2xldDsgfVxuXHRzZXRQYW5lbEVuYWJsZW1lbnQoaWQ6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQgeyB9XG5cdGRpc3Bvc2UoKSB7IH1cblx0Z2V0UHJvZ3Jlc3NJbmRpY2F0b3IoaWQ6IHN0cmluZykgeyByZXR1cm4gbnVsbCE7IH1cblx0aGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUoKTogdm9pZCB7IH1cblx0Z2V0TGFzdEFjdGl2ZVBhbmVDb21wb3NpdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gdW5kZWZpbmVkITsgfVxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFZpZXdzU2VydmljZSBpbXBsZW1lbnRzIElWaWV3c1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXG5cdG9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkgPSBuZXcgRW1pdHRlcjx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW47IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT4oKS5ldmVudDtcblx0aXNWaWV3Q29udGFpbmVyVmlzaWJsZShpZDogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGlzVmlld0NvbnRhaW5lckFjdGl2ZShpZDogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGdldFZpc2libGVWaWV3Q29udGFpbmVyKCk6IFZpZXdDb250YWluZXIgfCBudWxsIHsgcmV0dXJuIG51bGw7IH1cblx0b3BlblZpZXdDb250YWluZXIoaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IG51bGw+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTsgfVxuXHRjbG9zZVZpZXdDb250YWluZXIoaWQ6IHN0cmluZyk6IHZvaWQgeyB9XG5cblx0b25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW4gfT4oKTtcblx0b25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eSA9IHRoaXMub25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eUVtaXR0ZXIuZXZlbnQ7XG5cdG9uRGlkQ2hhbmdlRm9jdXNlZFZpZXdFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0b25EaWRDaGFuZ2VGb2N1c2VkVmlldyA9IHRoaXMub25EaWRDaGFuZ2VGb2N1c2VkVmlld0VtaXR0ZXIuZXZlbnQ7XG5cdGlzVmlld1Zpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRnZXRBY3RpdmVWaWV3V2l0aElkPFQgZXh0ZW5kcyBJVmlldz4oaWQ6IHN0cmluZyk6IFQgfCBudWxsIHsgcmV0dXJuIG51bGw7IH1cblx0Z2V0Vmlld1dpdGhJZDxUIGV4dGVuZHMgSVZpZXc+KGlkOiBzdHJpbmcpOiBUIHwgbnVsbCB7IHJldHVybiBudWxsOyB9XG5cdG9wZW5WaWV3PFQgZXh0ZW5kcyBJVmlldz4oaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxUIHwgbnVsbD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpOyB9XG5cdGNsb3NlVmlldyhpZDogc3RyaW5nKTogdm9pZCB7IH1cblx0Z2V0Vmlld1Byb2dyZXNzSW5kaWNhdG9yKGlkOiBzdHJpbmcpIHsgcmV0dXJuIG51bGwhOyB9XG5cdGdldEFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyV2l0aElkKGlkOiBzdHJpbmcpIHsgcmV0dXJuIG51bGw7IH1cblx0Z2V0Rm9jdXNlZFZpZXdOYW1lKCk6IHN0cmluZyB7IHJldHVybiAnJzsgfVxuXHRnZXRGb2N1c2VkVmlldygpOiBJVmlld0Rlc2NyaXB0b3IgfCBudWxsIHsgcmV0dXJuIG51bGw7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFZGl0b3JHcm91cHNTZXJ2aWNlIGltcGxlbWVudHMgSUVkaXRvckdyb3Vwc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBncm91cHM6IFRlc3RFZGl0b3JHcm91cFZpZXdbXSA9IFtdKSB7IH1cblxuXHRyZWFkb25seSBwYXJ0czogcmVhZG9ubHkgSUVkaXRvclBhcnRbXSA9IFt0aGlzXTtcblxuXHR3aW5kb3dJZCA9IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0OiBFdmVudDxJQXV4aWxpYXJ5RWRpdG9yUGFydD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUdyb3VwOiBFdmVudDxJRWRpdG9yR3JvdXA+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRBY3RpdmF0ZUdyb3VwOiBFdmVudDxJRWRpdG9yR3JvdXBBY3RpdmF0aW9uRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRBZGRHcm91cDogRXZlbnQ8SUVkaXRvckdyb3VwPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlR3JvdXA6IEV2ZW50PElFZGl0b3JHcm91cD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZE1vdmVHcm91cDogRXZlbnQ8SUVkaXRvckdyb3VwPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBJbmRleDogRXZlbnQ8SUVkaXRvckdyb3VwPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBMYWJlbDogRXZlbnQ8SUVkaXRvckdyb3VwPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBMb2NrZWQ6IEV2ZW50PElFZGl0b3JHcm91cD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkOiBFdmVudDxib29sZWFuPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0OiBFdmVudDxJRGltZW5zaW9uPiA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRvbkRpZFNjcm9sbCA9IEV2ZW50Lk5vbmU7XG5cdG9uV2lsbERpc3Bvc2UgPSBFdmVudC5Ob25lO1xuXG5cdG9yaWVudGF0aW9uID0gR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMO1xuXHRpc1JlYWR5ID0gdHJ1ZTtcblx0d2hlblJlYWR5OiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdHdoZW5SZXN0b3JlZDogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRoYXNSZXN0b3JhYmxlU3RhdGUgPSBmYWxzZTtcblxuXHRjb250ZW50RGltZW5zaW9uID0geyB3aWR0aDogODAwLCBoZWlnaHQ6IDYwMCB9O1xuXG5cdGdldCBhY3RpdmVHcm91cCgpOiBJRWRpdG9yR3JvdXAgeyByZXR1cm4gdGhpcy5ncm91cHNbMF07IH1cblx0Z2V0IHNpZGVHcm91cCgpOiBJRWRpdG9yR3JvdXAgeyByZXR1cm4gdGhpcy5ncm91cHNbMF07IH1cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyb3Vwcy5sZW5ndGg7IH1cblxuXHRnZXRQYXJ0KGdyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXApOiBJRWRpdG9yUGFydCB7IHJldHVybiB0aGlzOyB9XG5cdHNhdmVXb3JraW5nU2V0KG5hbWU6IHN0cmluZyk6IElFZGl0b3JXb3JraW5nU2V0IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldFdvcmtpbmdTZXRzKCk6IElFZGl0b3JXb3JraW5nU2V0W10geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXBwbHlXb3JraW5nU2V0KHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0IHwgJ2VtcHR5Jywgb3B0aW9ucz86IElFZGl0b3JXb3JraW5nU2V0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZGVsZXRlV29ya2luZ1NldCh3b3JraW5nU2V0OiBJRWRpdG9yV29ya2luZ1NldCk6IFByb21pc2U8Ym9vbGVhbj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0R3JvdXBzKF9vcmRlcj86IEdyb3Vwc09yZGVyKTogcmVhZG9ubHkgSUVkaXRvckdyb3VwW10geyByZXR1cm4gdGhpcy5ncm91cHM7IH1cblx0Z2V0R3JvdXAoaWRlbnRpZmllcjogbnVtYmVyKTogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuaWQgPT09IGlkZW50aWZpZXIpOyB9XG5cdGdldExhYmVsKF9pZGVudGlmaWVyOiBudW1iZXIpOiBzdHJpbmcgeyByZXR1cm4gJ0dyb3VwIDEnOyB9XG5cdGZpbmRHcm91cChfc2NvcGU6IElGaW5kR3JvdXBTY29wZSwgX3NvdXJjZT86IG51bWJlciB8IElFZGl0b3JHcm91cCwgX3dyYXA/OiBib29sZWFuKTogSUVkaXRvckdyb3VwIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRhY3RpdmF0ZUdyb3VwKF9ncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwKTogSUVkaXRvckdyb3VwIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRyZXN0b3JlR3JvdXAoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXApOiBJRWRpdG9yR3JvdXAgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGdldFNpemUoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXApOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0geyByZXR1cm4geyB3aWR0aDogMTAwLCBoZWlnaHQ6IDEwMCB9OyB9XG5cdHNldFNpemUoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9zaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiB2b2lkIHsgfVxuXHRhcnJhbmdlR3JvdXBzKF9hcnJhbmdlbWVudDogR3JvdXBzQXJyYW5nZW1lbnQpOiB2b2lkIHsgfVxuXHR0b2dnbGVNYXhpbWl6ZUdyb3VwKCk6IHZvaWQgeyB9XG5cdGhhc01heGltaXplZEdyb3VwKCk6IGJvb2xlYW4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdHRvZ2dsZUV4cGFuZEdyb3VwKCk6IHZvaWQgeyB9XG5cdGFwcGx5TGF5b3V0KF9sYXlvdXQ6IEVkaXRvckdyb3VwTGF5b3V0KTogdm9pZCB7IH1cblx0Z2V0TGF5b3V0KCk6IEVkaXRvckdyb3VwTGF5b3V0IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRzZXRHcm91cE9yaWVudGF0aW9uKF9vcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbik6IHZvaWQgeyB9XG5cdGFkZEdyb3VwKF9sb2NhdGlvbjogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0cmVtb3ZlR3JvdXAoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXApOiB2b2lkIHsgfVxuXHRtb3ZlR3JvdXAoX2dyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9sb2NhdGlvbjogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0bWVyZ2VHcm91cChfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCwgX3RhcmdldDogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfb3B0aW9ucz86IElNZXJnZUdyb3VwT3B0aW9ucyk6IGJvb2xlYW4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdG1lcmdlQWxsR3JvdXBzKF9ncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwLCBfb3B0aW9ucz86IElNZXJnZUdyb3VwT3B0aW9ucyk6IGJvb2xlYW4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGNvcHlHcm91cChfZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCwgX2xvY2F0aW9uOiBudW1iZXIgfCBJRWRpdG9yR3JvdXAsIF9kaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxuXHRjZW50ZXJMYXlvdXQoYWN0aXZlOiBib29sZWFuKTogdm9pZCB7IH1cblx0aXNMYXlvdXRDZW50ZXJlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGNyZWF0ZUVkaXRvckRyb3BUYXJnZXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGVsZWdhdGU6IElFZGl0b3JEcm9wVGFyZ2V0RGVsZWdhdGUpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0cmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXI8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oX3Byb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8VD4pOiBJRGlzcG9zYWJsZSB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0Z2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UocGFydDogSUVkaXRvclBhcnQpOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblxuXHRwYXJ0T3B0aW9ucyE6IElFZGl0b3JQYXJ0T3B0aW9ucztcblx0ZW5mb3JjZVBhcnRPcHRpb25zKG9wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucyk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXG5cdHJlYWRvbmx5IG1haW5QYXJ0ID0gdGhpcztcblx0cmVhZG9ubHkgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0OiBJTW9kYWxFZGl0b3JQYXJ0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRyZWdpc3RlckVkaXRvclBhcnQocGFydDogYW55KTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdGNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnQoKTogUHJvbWlzZTxJQXV4aWxpYXJ5RWRpdG9yUGFydD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Y3JlYXRlTW9kYWxFZGl0b3JQYXJ0KCk6IFByb21pc2U8SU1vZGFsRWRpdG9yUGFydD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFZGl0b3JHcm91cFZpZXcgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBWaWV3IHtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgaWQ6IG51bWJlcikgeyB9XG5cblx0d2luZG93SWQgPSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkO1xuXHRncm91cHNWaWV3OiBJRWRpdG9yR3JvdXBzVmlldyA9IHVuZGVmaW5lZCE7XG5cdGFjdGl2ZUVkaXRvclBhbmUhOiBJVmlzaWJsZUVkaXRvclBhbmU7XG5cdGFjdGl2ZUVkaXRvciE6IEVkaXRvcklucHV0O1xuXHRzZWxlY3RlZEVkaXRvcnM6IEVkaXRvcklucHV0W10gPSBbXTtcblx0cHJldmlld0VkaXRvciE6IEVkaXRvcklucHV0O1xuXHRjb3VudCE6IG51bWJlcjtcblx0c3RpY2t5Q291bnQhOiBudW1iZXI7XG5cdGRpc3Bvc2VkITogYm9vbGVhbjtcblx0ZWRpdG9yczogcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRsYWJlbCE6IHN0cmluZztcblx0aXNMb2NrZWQhOiBib29sZWFuO1xuXHRhcmlhTGFiZWwhOiBzdHJpbmc7XG5cdGluZGV4ITogbnVtYmVyO1xuXHR3aGVuUmVzdG9yZWQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0ZWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRtaW5pbXVtV2lkdGghOiBudW1iZXI7XG5cdG1heGltdW1XaWR0aCE6IG51bWJlcjtcblx0bWluaW11bUhlaWdodCE6IG51bWJlcjtcblx0bWF4aW11bUhlaWdodCE6IG51bWJlcjtcblxuXHR0aXRsZUhlaWdodCE6IElFZGl0b3JHcm91cFRpdGxlSGVpZ2h0O1xuXG5cdGlzRW1wdHkgPSB0cnVlO1xuXG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRNb2RlbENoYW5nZTogRXZlbnQ8SUdyb3VwTW9kZWxDaGFuZ2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbldpbGxDbG9zZUVkaXRvcjogRXZlbnQ8SUVkaXRvckNsb3NlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZUVkaXRvcjogRXZlbnQ8SUVkaXRvckNsb3NlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRPcGVuRWRpdG9yRmFpbDogRXZlbnQ8RWRpdG9ySW5wdXQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRGb2N1czogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uV2lsbE1vdmVFZGl0b3I6IEV2ZW50PElFZGl0b3JXaWxsTW92ZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uV2lsbE9wZW5FZGl0b3I6IEV2ZW50PElFZGl0b3JXaWxsT3BlbkV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlOiBFdmVudDxJQWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblxuXHRnZXRFZGl0b3JzKF9vcmRlcj86IEVkaXRvcnNPcmRlcik6IHJlYWRvbmx5IEVkaXRvcklucHV0W10geyByZXR1cm4gW107IH1cblx0ZmluZEVkaXRvcnMoX3Jlc291cmNlOiBVUkkpOiByZWFkb25seSBFZGl0b3JJbnB1dFtdIHsgcmV0dXJuIFtdOyB9XG5cdGdldEVkaXRvckJ5SW5kZXgoX2luZGV4OiBudW1iZXIpOiBFZGl0b3JJbnB1dCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0Z2V0SW5kZXhPZkVkaXRvcihfZWRpdG9yOiBFZGl0b3JJbnB1dCk6IG51bWJlciB7IHJldHVybiAtMTsgfVxuXHRpc0ZpcnN0KGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGlzTGFzdChlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRvcGVuRWRpdG9yKF9lZGl0b3I6IEVkaXRvcklucHV0LCBfb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogUHJvbWlzZTxJRWRpdG9yUGFuZT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdG9wZW5FZGl0b3JzKF9lZGl0b3JzOiBFZGl0b3JJbnB1dFdpdGhPcHRpb25zW10pOiBQcm9taXNlPElFZGl0b3JQYW5lPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0aXNQaW5uZWQoX2VkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGlzU3RpY2t5KF9lZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRpc1RyYW5zaWVudChfZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNBY3RpdmUoX2VkaXRvcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRzZXRTZWxlY3Rpb24oX2FjdGl2ZVNlbGVjdGVkRWRpdG9yOiBFZGl0b3JJbnB1dCwgX2luYWN0aXZlU2VsZWN0ZWRFZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0aXNTZWxlY3RlZChfZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Y29udGFpbnMoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdG1vdmVFZGl0b3IoX2VkaXRvcjogRWRpdG9ySW5wdXQsIF90YXJnZXQ6IElFZGl0b3JHcm91cCwgX29wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucyk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRtb3ZlRWRpdG9ycyhfZWRpdG9yczogRWRpdG9ySW5wdXRXaXRoT3B0aW9uc1tdLCBfdGFyZ2V0OiBJRWRpdG9yR3JvdXApOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0Y29weUVkaXRvcihfZWRpdG9yOiBFZGl0b3JJbnB1dCwgX3RhcmdldDogSUVkaXRvckdyb3VwLCBfb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogdm9pZCB7IH1cblx0Y29weUVkaXRvcnMoX2VkaXRvcnM6IEVkaXRvcklucHV0V2l0aE9wdGlvbnNbXSwgX3RhcmdldDogSUVkaXRvckdyb3VwKTogdm9pZCB7IH1cblx0YXN5bmMgY2xvc2VFZGl0b3IoX2VkaXRvcj86IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBjbG9zZUVkaXRvcnMoX2VkaXRvcnM6IEVkaXRvcklucHV0W10gfCBJQ2xvc2VFZGl0b3JzRmlsdGVyLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gdHJ1ZTsgfVxuXHRjbG9zZUFsbEVkaXRvcnMob3B0aW9ucz86IElDbG9zZUFsbEVkaXRvcnNPcHRpb25zKTogYW55IHsgcmV0dXJuIHRydWU7IH1cblx0YXN5bmMgcmVwbGFjZUVkaXRvcnMoX2VkaXRvcnM6IElFZGl0b3JSZXBsYWNlbWVudFtdKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0cGluRWRpdG9yKF9lZGl0b3I/OiBFZGl0b3JJbnB1dCk6IHZvaWQgeyB9XG5cdHN0aWNrRWRpdG9yKGVkaXRvcj86IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogdm9pZCB7IH1cblx0dW5zdGlja0VkaXRvcihlZGl0b3I/OiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCk6IHZvaWQgeyB9XG5cdGxvY2sobG9ja2VkOiBib29sZWFuKTogdm9pZCB7IH1cblx0Zm9jdXMoKTogdm9pZCB7IH1cblx0Z2V0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0c2V0QWN0aXZlKF9pc0FjdGl2ZTogYm9vbGVhbik6IHZvaWQgeyB9XG5cdG5vdGlmeUluZGV4Q2hhbmdlZChfaW5kZXg6IG51bWJlcik6IHZvaWQgeyB9XG5cdG5vdGlmeUxhYmVsQ2hhbmdlZChfbGFiZWw6IHN0cmluZyk6IHZvaWQgeyB9XG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cblx0dG9KU09OKCk6IG9iamVjdCB7IHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpOyB9XG5cdGxheW91dChfd2lkdGg6IG51bWJlciwgX2hlaWdodDogbnVtYmVyKTogdm9pZCB7IH1cblx0cmVsYXlvdXQoKSB7IH1cblx0Y3JlYXRlRWRpdG9yQWN0aW9ucyhfbWVudURpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogeyBhY3Rpb25zOiBJVG9vbGJhckFjdGlvbnM7IG9uRGlkQ2hhbmdlOiBFdmVudDxJTWVudUNoYW5nZUV2ZW50PiB9IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEVkaXRvckdyb3VwQWNjZXNzb3IgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBzVmlldyB7XG5cblx0bGFiZWw6IHN0cmluZyA9ICcnO1xuXHR3aW5kb3dJZCA9IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQ7XG5cblx0Z3JvdXBzOiBJRWRpdG9yR3JvdXBWaWV3W10gPSBbXTtcblx0YWN0aXZlR3JvdXAhOiBJRWRpdG9yR3JvdXBWaWV3O1xuXG5cdHBhcnRPcHRpb25zOiBJRWRpdG9yUGFydE9wdGlvbnMgPSB7IC4uLkRFRkFVTFRfRURJVE9SX1BBUlRfT1BUSU9OUyB9O1xuXG5cdG9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRvbkRpZFZpc2liaWxpdHlDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXG5cdGdldEdyb3VwKGlkZW50aWZpZXI6IG51bWJlcik6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0R3JvdXBzKG9yZGVyOiBHcm91cHNPcmRlcik6IElFZGl0b3JHcm91cFZpZXdbXSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhY3RpdmF0ZUdyb3VwKGlkZW50aWZpZXI6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcpOiBJRWRpdG9yR3JvdXBWaWV3IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlc3RvcmVHcm91cChpZGVudGlmaWVyOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3KTogSUVkaXRvckdyb3VwVmlldyB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhZGRHcm91cChsb2NhdGlvbjogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldywgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0bWVyZ2VHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldywgdGFyZ2V0OiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3LCBvcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRtb3ZlR3JvdXAoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcsIGxvY2F0aW9uOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3LCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwVmlldyB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjb3B5R3JvdXAoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcsIGxvY2F0aW9uOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3LCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uKTogSUVkaXRvckdyb3VwVmlldyB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRyZW1vdmVHcm91cChncm91cDogbnVtYmVyIHwgSUVkaXRvckdyb3VwVmlldyk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXJyYW5nZUdyb3VwcyhhcnJhbmdlbWVudDogR3JvdXBzQXJyYW5nZW1lbnQsIHRhcmdldD86IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZU1heGltaXplR3JvdXAoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cFZpZXcpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZUV4cGFuZEdyb3VwKGdyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdEVkaXRvclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgRWRpdG9yU2VydmljZUltcGwge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2U6IEV2ZW50PElWaXNpYmxlRWRpdG9yc0NoYW5nZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkRWRpdG9yc0NoYW5nZTogRXZlbnQ8SUVkaXRvcnNDaGFuZ2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbldpbGxPcGVuRWRpdG9yOiBFdmVudDxJRWRpdG9yV2lsbE9wZW5FdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENsb3NlRWRpdG9yOiBFdmVudDxJRWRpdG9yQ2xvc2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZE9wZW5FZGl0b3JGYWlsOiBFdmVudDxJRWRpdG9ySWRlbnRpZmllcj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIF9hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDogSUNvZGVFZGl0b3IgfCBJRGlmZkVkaXRvciB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCgpOiBJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZVRleHRFZGl0b3JDb250cm9sOyB9XG5cdHB1YmxpYyBzZXQgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wodmFsdWU6IElDb2RlRWRpdG9yIHwgSURpZmZFZGl0b3IgfCB1bmRlZmluZWQpIHsgdGhpcy5fYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wgPSB2YWx1ZTsgfVxuXG5cdGFjdGl2ZUVkaXRvclBhbmU6IElWaXNpYmxlRWRpdG9yUGFuZSB8IHVuZGVmaW5lZDtcblx0YWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9hY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGFjdGl2ZUVkaXRvcigpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9hY3RpdmVFZGl0b3I7IH1cblx0cHVibGljIHNldCBhY3RpdmVFZGl0b3IodmFsdWU6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKSB7IHRoaXMuX2FjdGl2ZUVkaXRvciA9IHZhbHVlOyB9XG5cblx0ZWRpdG9yczogcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRtb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdHZpc2libGVFZGl0b3JQYW5lczogcmVhZG9ubHkgSVZpc2libGVFZGl0b3JQYW5lW10gPSBbXTtcblx0dmlzaWJsZVRleHRFZGl0b3JDb250cm9scyA9IFtdO1xuXHRnZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKG9yZGVyOiBFZGl0b3JzT3JkZXIpOiByZWFkb25seSAoSUVkaXRvciB8IElEaWZmRWRpdG9yKVtdIHsgcmV0dXJuIHRoaXMudmlzaWJsZVRleHRFZGl0b3JDb250cm9sczsgfVxuXHR2aXNpYmxlRWRpdG9yczogcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRjb3VudCA9IHRoaXMuZWRpdG9ycy5sZW5ndGg7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBlZGl0b3JHcm91cFNlcnZpY2U/OiBJRWRpdG9yR3JvdXBzU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0Y3JlYXRlU2NvcGVkKGVkaXRvckdyb3Vwc0NvbnRhaW5lcjogSUVkaXRvckdyb3Vwc0NvbnRhaW5lcik6IElFZGl0b3JTZXJ2aWNlIHsgcmV0dXJuIHRoaXM7IH1cblx0Z2V0RWRpdG9ycygpIHsgcmV0dXJuIFtdOyB9XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRmaW5kRWRpdG9ycygpIHsgcmV0dXJuIFtdIGFzIGFueTsgfVxuXHRvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRvcGVuRWRpdG9yKGVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXQgfCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRvcGVuRWRpdG9yKGVkaXRvcjogSVJlc291cmNlRGlmZkVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJVGV4dERpZmZFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPjtcblx0YXN5bmMgb3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCwgb3B0aW9uc09yR3JvdXA/OiBJRWRpdG9yT3B0aW9ucyB8IFByZWZlcnJlZEdyb3VwLCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIG9wZW5FZGl0b3IgdGFrZXMgb3duZXJzaGlwIG9mIHRoZSBpbnB1dCwgcmVnaXN0ZXIgaXQgdG8gdGhlIFRlc3RFZGl0b3JTZXJ2aWNlXG5cdFx0Ly8gc28gaXQncyBub3QgbWFya2VkIGFzIGxlYWtlZCBkdXJpbmcgdGVzdHMuXG5cdFx0aWYgKCdkaXNwb3NlJyBpbiBlZGl0b3IpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvcik7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0YXN5bmMgY2xvc2VFZGl0b3IoZWRpdG9yOiBJRWRpdG9ySWRlbnRpZmllciwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBjbG9zZUVkaXRvcnMoZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRkb1Jlc29sdmVFZGl0b3JPcGVuUmVxdWVzdChlZGl0b3I6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IFtJRWRpdG9yR3JvdXAsIEVkaXRvcklucHV0LCBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZF0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFt0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCwgZWRpdG9yIGFzIEVkaXRvcklucHV0LCB1bmRlZmluZWRdO1xuXHR9XG5cdG9wZW5FZGl0b3JzKF9lZGl0b3JzOiBhbnksIF9ncm91cD86IGFueSk6IFByb21pc2U8SUVkaXRvclBhbmVbXT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9XG5cdGlzT3BlbmVkKF9lZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllcik6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0aXNWaXNpYmxlKF9lZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRyZXBsYWNlRWRpdG9ycyhfZWRpdG9yczogYW55LCBfZ3JvdXA6IGFueSkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7IH1cblx0c2F2ZShlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdLCBvcHRpb25zPzogSVNhdmVFZGl0b3JzT3B0aW9ucyk6IFByb21pc2U8SVNhdmVFZGl0b3JzUmVzdWx0PiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzYXZlQWxsKG9wdGlvbnM/OiBJU2F2ZUVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxJU2F2ZUVkaXRvcnNSZXN1bHQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJldmVydChlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJldmVydEFsbChvcHRpb25zPzogSVJldmVydEFsbEVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBleHRlbmRzIEluTWVtb3J5V29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHtcblxuXHRyZWFkb25seSByZXNvbHZlZDogU2V0PElXb3JraW5nQ29weUlkZW50aWZpZXI+ID0gbmV3IFNldCgpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwYXJzZUJhY2t1cENvbnRlbnQodGV4dEJ1ZmZlckZhY3Rvcnk6IElUZXh0QnVmZmVyRmFjdG9yeSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IHRleHRCdWZmZXJGYWN0b3J5LmNyZWF0ZShEZWZhdWx0RW5kT2ZMaW5lLkxGKS50ZXh0QnVmZmVyO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgbGluZUNvdW50LCB0ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgobGluZUNvdW50KSArIDEpO1xuXG5cdFx0cmV0dXJuIHRleHRCdWZmZXIuZ2V0VmFsdWVJblJhbmdlKHJhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmU8VCBleHRlbmRzIElXb3JraW5nQ29weUJhY2t1cE1ldGE+KGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPElSZXNvbHZlZFdvcmtpbmdDb3B5QmFja3VwPFQ+IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5yZXNvbHZlZC5hZGQoaWRlbnRpZmllcik7XG5cblx0XHRyZXR1cm4gc3VwZXIucmVzb2x2ZShpZGVudGlmaWVyKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9VbnR5cGVkV29ya2luZ0NvcHlJZChyZXNvdXJjZTogVVJJKTogSVdvcmtpbmdDb3B5SWRlbnRpZmllciB7XG5cdHJldHVybiB0b1R5cGVkV29ya2luZ0NvcHlJZChyZXNvdXJjZSwgJycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9UeXBlZFdvcmtpbmdDb3B5SWQocmVzb3VyY2U6IFVSSSwgdHlwZUlkID0gJ3Rlc3RCYWNrdXBUeXBlSWQnKTogSVdvcmtpbmdDb3B5SWRlbnRpZmllciB7XG5cdHJldHVybiB7IHR5cGVJZCwgcmVzb3VyY2UgfTtcbn1cblxuZXhwb3J0IGNsYXNzIEluTWVtb3J5VGVzdFdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBleHRlbmRzIEJyb3dzZXJXb3JraW5nQ29weUJhY2t1cFNlcnZpY2Uge1xuXG5cdHByaXZhdGUgYmFja3VwUmVzb3VyY2VKb2luZXJzOiBGdW5jdGlvbltdO1xuXHRwcml2YXRlIGRpc2NhcmRCYWNrdXBKb2luZXJzOiBGdW5jdGlvbltdO1xuXG5cdGRpc2NhcmRlZEJhY2t1cHM6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdHN1cGVyKG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoVGVzdFdvcmtzcGFjZSksIGVudmlyb25tZW50U2VydmljZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5iYWNrdXBSZXNvdXJjZUpvaW5lcnMgPSBbXTtcblx0XHR0aGlzLmRpc2NhcmRCYWNrdXBKb2luZXJzID0gW107XG5cdFx0dGhpcy5kaXNjYXJkZWRCYWNrdXBzID0gW107XG5cblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHR0ZXN0R2V0RmlsZVNlcnZpY2UoKTogSUZpbGVTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZTtcblx0fVxuXG5cdGpvaW5CYWNrdXBSZXNvdXJjZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycy5wdXNoKHJlc29sdmUpKTtcblx0fVxuXG5cdGpvaW5EaXNjYXJkQmFja3VwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMucHVzaChyZXNvbHZlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBiYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllciwgY29udGVudD86IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlLCB2ZXJzaW9uSWQ/OiBudW1iZXIsIG1ldGE/OiBhbnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5iYWNrdXAoaWRlbnRpZmllciwgY29udGVudCwgdmVyc2lvbklkLCBtZXRhLCB0b2tlbik7XG5cblx0XHR3aGlsZSAodGhpcy5iYWNrdXBSZXNvdXJjZUpvaW5lcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycy5wb3AoKSEoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkaXNjYXJkQmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5kaXNjYXJkQmFja3VwKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuZGlzY2FyZGVkQmFja3Vwcy5wdXNoKGlkZW50aWZpZXIpO1xuXG5cdFx0d2hpbGUgKHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmRpc2NhcmRCYWNrdXBKb2luZXJzLnBvcCgpISgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEJhY2t1cENvbnRlbnRzKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGJhY2t1cFJlc291cmNlID0gdGhpcy50b0JhY2t1cFJlc291cmNlKGlkZW50aWZpZXIpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShiYWNrdXBSZXNvdXJjZSk7XG5cblx0XHRyZXR1cm4gZmlsZUNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RCZWZvcmVTaHV0ZG93bkV2ZW50IGltcGxlbWVudHMgSW50ZXJuYWxCZWZvcmVTaHV0ZG93bkV2ZW50IHtcblxuXHR2YWx1ZTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdGZpbmFsVmFsdWU6ICgoKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPikgfCB1bmRlZmluZWQ7XG5cdHJlYXNvbiA9IFNodXRkb3duUmVhc29uLkNMT1NFO1xuXG5cdHZldG8odmFsdWU6IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KTogdm9pZCB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG5cblx0ZmluYWxWZXRvKHZldG9GbjogKCkgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pOiB2b2lkIHtcblx0XHR0aGlzLnZhbHVlID0gdmV0b0ZuKCk7XG5cdFx0dGhpcy5maW5hbFZhbHVlID0gdmV0b0ZuO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V2lsbFNodXRkb3duRXZlbnQgaW1wbGVtZW50cyBXaWxsU2h1dGRvd25FdmVudCB7XG5cblx0dmFsdWU6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRqb2luZXJzID0gKCkgPT4gW107XG5cdHJlYXNvbiA9IFNodXRkb3duUmVhc29uLkNMT1NFO1xuXHR0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmU7XG5cblx0am9pbihwcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgKCgpID0+IFByb21pc2U8dm9pZD4pLCBqb2luZXI6IElXaWxsU2h1dGRvd25FdmVudEpvaW5lcik6IHZvaWQge1xuXHRcdHRoaXMudmFsdWUucHVzaCh0eXBlb2YgcHJvbWlzZSA9PT0gJ2Z1bmN0aW9uJyA/IHByb21pc2UoKSA6IHByb21pc2UpO1xuXHR9XG5cblx0Zm9yY2UoKSB7IC8qIE5vLU9wIGluIHRlc3RzICovIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBpbXBsZW1lbnRzIElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkgeyB9XG5cblx0b25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCkge1xuXHRcdHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTtcblx0fVxuXG5cdGdldFZhbHVlPFQ+KHJlc291cmNlOiBVUkksIGFyZzI/OiBhbnksIGFyZzM/OiBhbnkpOiBUIHtcblx0XHRjb25zdCBwb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCA9IEVkaXRvclBvc2l0aW9uLmlzSVBvc2l0aW9uKGFyZzIpID8gYXJnMiA6IG51bGw7XG5cdFx0Y29uc3Qgc2VjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gcG9zaXRpb24gPyAodHlwZW9mIGFyZzMgPT09ICdzdHJpbmcnID8gYXJnMyA6IHVuZGVmaW5lZCkgOiAodHlwZW9mIGFyZzIgPT09ICdzdHJpbmcnID8gYXJnMiA6IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoc2VjdGlvbiwgeyByZXNvdXJjZSB9KSBhcyBUO1xuXHR9XG5cblx0aW5zcGVjdDxUPihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBwb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCwgc2VjdGlvbjogc3RyaW5nKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxSZWFkb25seTxUPj4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8VD4oc2VjdGlvbiwgeyByZXNvdXJjZSB9KTtcblx0fVxuXG5cdHVwZGF0ZVZhbHVlKHJlc291cmNlOiBVUkksIGtleTogc3RyaW5nLCB2YWx1ZTogYW55LCBjb25maWd1cmF0aW9uVGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGtleSwgdmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVGaWxlU3lzdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBJRmlsZVN5c3RlbVByb3ZpZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdyYXBwZWRGc3A6IElGaWxlU3lzdGVtUHJvdmlkZXIsIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmNhcGFiaWxpdGllcyA9IHRoaXMud3JhcHBlZEZzcC5jYXBhYmlsaXRpZXM7XG5cdFx0dGhpcy5vbkRpZENoYW5nZUNhcGFiaWxpdGllcyA9IHRoaXMud3JhcHBlZEZzcC5vbkRpZENoYW5nZUNhcGFiaWxpdGllcztcblx0XHR0aGlzLm9uRGlkQ2hhbmdlRmlsZSA9IEV2ZW50Lm1hcCh0aGlzLndyYXBwZWRGc3Aub25EaWRDaGFuZ2VGaWxlLCBjaGFuZ2VzID0+IGNoYW5nZXMubWFwKGMgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYy50eXBlLFxuXHRcdFx0XHRyZXNvdXJjZTogYy5yZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgYXV0aG9yaXR5OiB0aGlzLnJlbW90ZUF1dGhvcml0eSB9KSxcblx0XHRcdH07XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXM7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzOiBFdmVudDx2b2lkPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGU6IEV2ZW50PHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+O1xuXHR3YXRjaChyZXNvdXJjZTogVVJJLCBvcHRzOiBJV2F0Y2hPcHRpb25zKTogSURpc3Bvc2FibGUgeyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLndhdGNoKHRoaXMudG9GaWxlUmVzb3VyY2UocmVzb3VyY2UpLCBvcHRzKTsgfVxuXG5cdHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVN0YXQ+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5zdGF0KHRoaXMudG9GaWxlUmVzb3VyY2UocmVzb3VyY2UpKTsgfVxuXHRta2RpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3AubWtkaXIodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSkpOyB9XG5cdHJlYWRkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8W3N0cmluZywgRmlsZVR5cGVdW10+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5yZWFkZGlyKHRoaXMudG9GaWxlUmVzb3VyY2UocmVzb3VyY2UpKTsgfVxuXHRkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3AuZGVsZXRlKHRoaXMudG9GaWxlUmVzb3VyY2UocmVzb3VyY2UpLCBvcHRzKTsgfVxuXG5cdHJlbmFtZShmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLnJlbmFtZSh0aGlzLnRvRmlsZVJlc291cmNlKGZyb20pLCB0aGlzLnRvRmlsZVJlc291cmNlKHRvKSwgb3B0cyk7IH1cblx0Y29weShmcm9tOiBVUkksIHRvOiBVUkksIG9wdHM6IElGaWxlT3ZlcndyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLmNvcHkhKHRoaXMudG9GaWxlUmVzb3VyY2UoZnJvbSksIHRoaXMudG9GaWxlUmVzb3VyY2UodG8pLCBvcHRzKTsgfVxuXG5cdHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5yZWFkRmlsZSEodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSkpOyB9XG5cdHdyaXRlRmlsZShyZXNvdXJjZTogVVJJLCBjb250ZW50OiBVaW50OEFycmF5LCBvcHRzOiBJRmlsZVdyaXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLndyaXRlRmlsZSEodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSksIGNvbnRlbnQsIG9wdHMpOyB9XG5cblx0b3BlbihyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZU9wZW5PcHRpb25zKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5vcGVuISh0aGlzLnRvRmlsZVJlc291cmNlKHJlc291cmNlKSwgb3B0cyk7IH1cblx0Y2xvc2UoZmQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy53cmFwcGVkRnNwLmNsb3NlIShmZCk7IH1cblx0cmVhZChmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5yZWFkIShmZCwgcG9zLCBkYXRhLCBvZmZzZXQsIGxlbmd0aCk7IH1cblx0d3JpdGUoZmQ6IG51bWJlciwgcG9zOiBudW1iZXIsIGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7IHJldHVybiB0aGlzLndyYXBwZWRGc3Aud3JpdGUhKGZkLCBwb3MsIGRhdGEsIG9mZnNldCwgbGVuZ3RoKTsgfVxuXG5cdHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFVpbnQ4QXJyYXk+IHsgcmV0dXJuIHRoaXMud3JhcHBlZEZzcC5yZWFkRmlsZVN0cmVhbSEodGhpcy50b0ZpbGVSZXNvdXJjZShyZXNvdXJjZSksIG9wdHMsIHRva2VuKTsgfVxuXG5cdHByaXZhdGUgdG9GaWxlUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IFVSSSB7IHJldHVybiByZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIGF1dGhvcml0eTogJycgfSk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIGltcGxlbWVudHMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHkge1xuXHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlXG5cdFx0XHR8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZVxuXHRcdFx0fCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW07XG5cdH1cblxuXHRvdmVycmlkZSByZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IEJVRkZFUl9TSVpFID0gNjQgKiAxMDI0O1xuXHRcdGNvbnN0IHN0cmVhbSA9IG5ld1dyaXRlYWJsZVN0cmVhbTxVaW50OEFycmF5PihkYXRhID0+IFZTQnVmZmVyLmNvbmNhdChkYXRhLm1hcChkYXRhID0+IFZTQnVmZmVyLndyYXAoZGF0YSkpKS5idWZmZXIpO1xuXG5cdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLnJlYWRGaWxlKHJlc291cmNlKTtcblxuXHRcdFx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRcdFx0d2hpbGUgKG9mZnNldCA8IGRhdGEubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0XHRhd2FpdCBzdHJlYW0ud3JpdGUoZGF0YS5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIEJVRkZFUl9TSVpFKSk7XG5cdFx0XHRcdFx0b2Zmc2V0ICs9IEJVRkZFUl9TSVpFO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0c3RyZWFtLmVuZCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0c3RyZWFtLmVuZChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiBzdHJlYW07XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgLi4ucHJvZHVjdCB9O1xuXG5leHBvcnQgY2xhc3MgVGVzdEhvc3RTZXJ2aWNlIGltcGxlbWVudHMgSUhvc3RTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9oYXNGb2N1cyA9IHRydWU7XG5cdGdldCBoYXNGb2N1cygpIHsgcmV0dXJuIHRoaXMuX2hhc0ZvY3VzOyB9XG5cdGFzeW5jIGhhZExhc3RGb2N1cygpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuX2hhc0ZvY3VzOyB9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VGb2N1cyA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXMgPSB0aGlzLl9vbkRpZENoYW5nZUZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlV2luZG93ID0gbmV3IEVtaXR0ZXI8bnVtYmVyPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVdpbmRvdyA9IHRoaXMuX29uRGlkQ2hhbmdlV2luZG93LmV2ZW50O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRnVsbFNjcmVlbjogRXZlbnQ8eyB3aW5kb3dJZDogbnVtYmVyOyBmdWxsc2NyZWVuOiBib29sZWFuIH0+ID0gRXZlbnQuTm9uZTtcblxuXHRzZXRGb2N1cyhmb2N1czogYm9vbGVhbikge1xuXHRcdHRoaXMuX2hhc0ZvY3VzID0gZm9jdXM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VGb2N1cy5maXJlKHRoaXMuX2hhc0ZvY3VzKTtcblx0fVxuXG5cdGFzeW5jIHJlc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVsb2FkKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHdpdGhFeHBlY3RlZFNodXRkb3duPFQ+KGV4cGVjdGVkU2h1dGRvd25UYXNrOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIGF3YWl0IGV4cGVjdGVkU2h1dGRvd25UYXNrKCk7XG5cdH1cblxuXHRhc3luYyBmb2N1cygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBtb3ZlVG9wKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdldEN1cnNvclNjcmVlblBvaW50KCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0V2luZG93UG9zaXRpb24oKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIGdldFdpbmRvd3Mob3B0aW9uczogdW5rbm93bikgeyByZXR1cm4gW107IH1cblxuXHRhc3luYyBvcGVuV2luZG93KGFyZzE/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyB8IElXaW5kb3dPcGVuYWJsZVtdLCBhcmcyPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyB0b2dnbGVGdWxsU2NyZWVuKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgZ2V0U2NyZWVuc2hvdChyZWN0PzogSVJlY3RhbmdsZSk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIGdldE5hdGl2ZVdpbmRvd0hhbmRsZShfd2luZG93SWQ6IG51bWJlcik6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdGFzeW5jIHNob3dUb2FzdChfb3B0aW9uczogSVRvYXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9hc3RSZXN1bHQ+IHsgcmV0dXJuIHsgc3VwcG9ydGVkOiBmYWxzZSwgY2xpY2tlZDogZmFsc2UgfTsgfVxuXG5cdGFzeW5jIHNldFdpbmRvd0RpbW1lZChfdGFyZ2V0V2luZG93OiBXaW5kb3csIF9kaW1tZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdHJlYWRvbmx5IGNvbG9yU2NoZW1lID0gQ29sb3JTY2hlbWUuREFSSztcblx0b25EaWRDaGFuZ2VDb2xvclNjaGVtZSA9IEV2ZW50Lk5vbmU7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdHRlc3RPbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uOiBhbnkpOiB2b2lkIHtcblx0XHRzdXBlci5vbkZpbGVzQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uLCB0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlYWRvbmx5VGV4dEZpbGVFZGl0b3JNb2RlbCBleHRlbmRzIFRleHRGaWxlRWRpdG9yTW9kZWwge1xuXG5cdG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVzb3VyY2U6IFVSSSwgcHJpdmF0ZSByZWFkb25seSBfdHlwZUlkOiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl90eXBlSWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdHlwZUlkO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVzb2x2ZSgpOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgbnVsbD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVzdEVkaXRvcihpZDogc3RyaW5nLCBpbnB1dHM6IFN5bmNEZXNjcmlwdG9yPEVkaXRvcklucHV0PltdLCBzZXJpYWxpemVySW5wdXRJZD86IHN0cmluZyk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y2xhc3MgVGVzdEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdFx0cHJpdmF0ZSBfc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRcdGNvbnN0cnVjdG9yKGdyb3VwOiBJRWRpdG9yR3JvdXApIHtcblx0XHRcdHN1cGVyKGlkLCBncm91cCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCksIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0XHRhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgZ2V0SWQoKTogc3RyaW5nIHsgcmV0dXJuIGlkOyB9XG5cdFx0bGF5b3V0KCk6IHZvaWQgeyB9XG5cdFx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcigpOiB2b2lkIHsgfVxuXG5cdFx0b3ZlcnJpZGUgZ2V0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2FibGVzLmFkZChSZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoVGVzdEVkaXRvciwgaWQsICdUZXN0IEVkaXRvciBDb250cm9sJyksIGlucHV0cykpO1xuXG5cdGlmIChzZXJpYWxpemVySW5wdXRJZCkge1xuXG5cdFx0aW50ZXJmYWNlIElTZXJpYWxpemVkVGVzdElucHV0IHtcblx0XHRcdHJlc291cmNlOiBzdHJpbmc7XG5cdFx0fVxuXG5cdFx0Y2xhc3MgRWRpdG9yc09ic2VydmVyVGVzdEVkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRcdFx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0c2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IHN0cmluZyB7XG5cdFx0XHRcdGNvbnN0IHRlc3RFZGl0b3JJbnB1dCA9IDxUZXN0RmlsZUVkaXRvcklucHV0PmVkaXRvcklucHV0O1xuXHRcdFx0XHRjb25zdCB0ZXN0SW5wdXQ6IElTZXJpYWxpemVkVGVzdElucHV0ID0ge1xuXHRcdFx0XHRcdHJlc291cmNlOiB0ZXN0RWRpdG9ySW5wdXQucmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0ZXN0SW5wdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9ySW5wdXQ6IHN0cmluZyk6IEVkaXRvcklucHV0IHtcblx0XHRcdFx0Y29uc3QgdGVzdElucHV0OiBJU2VyaWFsaXplZFRlc3RJbnB1dCA9IEpTT04ucGFyc2Uoc2VyaWFsaXplZEVkaXRvcklucHV0KTtcblxuXHRcdFx0XHRyZXR1cm4gbmV3IFRlc3RGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHRlc3RJbnB1dC5yZXNvdXJjZSksIHNlcmlhbGl6ZXJJbnB1dElkISk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKHNlcmlhbGl6ZXJJbnB1dElkLCBFZGl0b3JzT2JzZXJ2ZXJUZXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyKSk7XG5cdH1cblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlc3RGaWxlRWRpdG9yKCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKFJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRcdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRcdFRlc3RUZXh0RmlsZUVkaXRvcixcblx0XHRcdFRlc3RUZXh0RmlsZUVkaXRvci5JRCxcblx0XHRcdCdUZXh0IEZpbGUgRWRpdG9yJ1xuXHRcdCksXG5cdFx0W25ldyBTeW5jRGVzY3JpcHRvcihGaWxlRWRpdG9ySW5wdXQpXVxuXHQpKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlc3RSZXNvdXJjZUVkaXRvcigpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZChSZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0XHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0XHRUZXN0VGV4dFJlc291cmNlRWRpdG9yLFxuXHRcdFx0VGVzdFRleHRSZXNvdXJjZUVkaXRvci5JRCxcblx0XHRcdCdUZXh0IEVkaXRvcidcblx0XHQpLFxuXHRcdFtcblx0XHRcdG5ldyBTeW5jRGVzY3JpcHRvcihVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCksXG5cdFx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpXG5cdFx0XVxuXHQpKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRlc3RTaWRlQnlTaWRlRWRpdG9yKCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKFJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRcdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRcdFNpZGVCeVNpZGVFZGl0b3IsXG5cdFx0XHRTaWRlQnlTaWRlRWRpdG9yLklELFxuXHRcdFx0J1RleHQgRWRpdG9yJ1xuXHRcdCksXG5cdFx0W1xuXHRcdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFNpZGVCeVNpZGVFZGl0b3JJbnB1dClcblx0XHRdXG5cdCkpO1xuXG5cdHJldHVybiBkaXNwb3NhYmxlcztcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RGaWxlRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElGaWxlRWRpdG9ySW5wdXQge1xuXG5cdHJlYWRvbmx5IHByZWZlcnJlZFJlc291cmNlO1xuXG5cdGdvdERpc3Bvc2VkID0gZmFsc2U7XG5cdGdvdFNhdmVkID0gZmFsc2U7XG5cdGdvdFNhdmVkQXMgPSBmYWxzZTtcblx0Z290UmV2ZXJ0ZWQgPSBmYWxzZTtcblx0ZGlydHkgPSBmYWxzZTtcblx0bW9kaWZpZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmFpbHMgPSBmYWxzZTtcblxuXHRkaXNhYmxlVG9VbnR5cGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSBfdHlwZUlkOiBzdHJpbmdcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucHJlZmVycmVkUmVzb3VyY2UgPSB0aGlzLnJlc291cmNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpIHsgcmV0dXJuIHRoaXMuX3R5cGVJZDsgfVxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKSB7IHJldHVybiB0aGlzLl90eXBlSWQ7IH1cblxuXHRwcml2YXRlIF9jYXBhYmlsaXRpZXM6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuTm9uZTtcblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7IHJldHVybiB0aGlzLl9jYXBhYmlsaXRpZXM7IH1cblx0b3ZlcnJpZGUgc2V0IGNhcGFiaWxpdGllcyhjYXBhYmlsaXRpZXM6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzKSB7XG5cdFx0aWYgKHRoaXMuX2NhcGFiaWxpdGllcyAhPT0gY2FwYWJpbGl0aWVzKSB7XG5cdFx0XHR0aGlzLl9jYXBhYmlsaXRpZXMgPSBjYXBhYmlsaXRpZXM7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgcmVzb2x2ZSgpOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgbnVsbD4geyByZXR1cm4gIXRoaXMuZmFpbHMgPyBQcm9taXNlLnJlc29sdmUobnVsbCkgOiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2ZhaWxzJykpOyB9XG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXI6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQgfCBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdXBlci5tYXRjaGVzKG90aGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gISEob3RoZXI/LnJlc291cmNlICYmIHRoaXMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gb3RoZXIucmVzb3VyY2UudG9TdHJpbmcoKSAmJiBvdGhlciBpbnN0YW5jZW9mIFRlc3RGaWxlRWRpdG9ySW5wdXQgJiYgb3RoZXIudHlwZUlkID09PSB0aGlzLnR5cGVJZCk7XG5cdFx0fVxuXHRcdHJldHVybiBpc0VxdWFsKHRoaXMucmVzb3VyY2UsIG90aGVyLnJlc291cmNlKSAmJiAodGhpcy5lZGl0b3JJZCA9PT0gb3RoZXIub3B0aW9ucz8ub3ZlcnJpZGUgfHwgb3RoZXIub3B0aW9ucz8ub3ZlcnJpZGUgPT09IHVuZGVmaW5lZCk7XG5cdH1cblx0c2V0UHJlZmVycmVkUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHZvaWQgeyB9XG5cdGFzeW5jIHNldEVuY29kaW5nKGVuY29kaW5nOiBzdHJpbmcpIHsgfVxuXHRnZXRFbmNvZGluZygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRzZXRQcmVmZXJyZWROYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHNldFByZWZlcnJlZERlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRzZXRQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZzogc3RyaW5nKSB7IH1cblx0c2V0UHJlZmVycmVkQ29udGVudHMoY29udGVudHM6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHNldExhbmd1YWdlSWQobGFuZ3VhZ2VJZDogc3RyaW5nLCBzb3VyY2U/OiBzdHJpbmcpIHsgfVxuXHRzZXRQcmVmZXJyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZykgeyB9XG5cdHNldEZvcmNlT3BlbkFzQmluYXJ5KCk6IHZvaWQgeyB9XG5cdHNldEZhaWxUb09wZW4oKTogdm9pZCB7XG5cdFx0dGhpcy5mYWlscyA9IHRydWU7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZShncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5nb3RTYXZlZCA9IHRydWU7XG5cdFx0dGhpcy5kaXJ0eSA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHNhdmVBcyhncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5nb3RTYXZlZEFzID0gdHJ1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXHRvdmVycmlkZSBhc3luYyByZXZlcnQoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5nb3RSZXZlcnRlZCA9IHRydWU7XG5cdFx0dGhpcy5nb3RTYXZlZCA9IGZhbHNlO1xuXHRcdHRoaXMuZ290U2F2ZWRBcyA9IGZhbHNlO1xuXHRcdHRoaXMuZGlydHkgPSBmYWxzZTtcblx0fVxuXHRvdmVycmlkZSB0b1VudHlwZWQoKTogSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZGlzYWJsZVRvVW50eXBlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHRoaXMucmVzb3VyY2UgfTtcblx0fVxuXHRzZXRNb2RpZmllZCgpOiB2b2lkIHsgdGhpcy5tb2RpZmllZCA9IHRydWU7IH1cblx0b3ZlcnJpZGUgaXNNb2RpZmllZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RpZmllZCA9PT0gdW5kZWZpbmVkID8gdGhpcy5kaXJ0eSA6IHRoaXMubW9kaWZpZWQ7XG5cdH1cblx0c2V0RGlydHkoKTogdm9pZCB7IHRoaXMuZGlydHkgPSB0cnVlOyB9XG5cdG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlydHk7XG5cdH1cblx0aXNSZXNvbHZlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZ290RGlzcG9zZWQgPSB0cnVlO1xuXHR9XG5cdG1vdmVkRWRpdG9yOiBJTW92ZVJlc3VsdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgYXN5bmMgcmVuYW1lKCk6IFByb21pc2U8SU1vdmVSZXN1bHQgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMubW92ZWRFZGl0b3I7IH1cblxuXHRwcml2YXRlIG1vdmVEaXNhYmxlZFJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRzZXRNb3ZlRGlzYWJsZWQocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1vdmVEaXNhYmxlZFJlYXNvbiA9IHJlYXNvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbk1vdmUoc291cmNlR3JvdXA6IEdyb3VwSWRlbnRpZmllciwgdGFyZ2V0R3JvdXA6IEdyb3VwSWRlbnRpZmllcik6IHN0cmluZyB8IHRydWUge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5tb3ZlRGlzYWJsZWRSZWFzb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb3ZlRGlzYWJsZWRSZWFzb247XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5jYW5Nb3ZlKHNvdXJjZUdyb3VwLCB0YXJnZXRHcm91cCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RGb3JjZVJldmVhbEZpbGVFZGl0b3JJbnB1dCBleHRlbmRzIFRlc3RGaWxlRWRpdG9ySW5wdXQge1xuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgeyByZXR1cm4gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRm9yY2VSZXZlYWw7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RFZGl0b3JQYXJ0IGV4dGVuZHMgTWFpbkVkaXRvclBhcnQgaW1wbGVtZW50cyBJRWRpdG9yR3JvdXBzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpblBhcnQgPSB0aGlzO1xuXHRyZWFkb25seSBwYXJ0czogcmVhZG9ubHkgSUVkaXRvclBhcnRbXSA9IFt0aGlzXTtcblx0cmVhZG9ubHkgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0OiBJTW9kYWxFZGl0b3JQYXJ0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydDogRXZlbnQ8SUF1eGlsaWFyeUVkaXRvclBhcnQ+ID0gRXZlbnQuTm9uZTtcblxuXHR0ZXN0U2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdHJldHVybiBzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdGNsZWFyU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlTWVtZW50byA9IHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHdvcmtzcGFjZU1lbWVudG8pKSB7XG5cdFx0XHRkZWxldGUgd29ya3NwYWNlTWVtZW50b1trZXldO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVNZW1lbnRvID0gdGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHByb2ZpbGVNZW1lbnRvKSkge1xuXHRcdFx0ZGVsZXRlIHByb2ZpbGVNZW1lbnRvW2tleV07XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJFZGl0b3JQYXJ0KHBhcnQ6IElFZGl0b3JQYXJ0KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRjcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KCk6IFByb21pc2U8SUF1eGlsaWFyeUVkaXRvclBhcnQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRjcmVhdGVNb2RhbEVkaXRvclBhcnQoKTogUHJvbWlzZTxJTW9kYWxFZGl0b3JQYXJ0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0Z2V0U2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UocGFydDogSUVkaXRvclBhcnQpOiBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGdldFBhcnQoZ3JvdXA6IG51bWJlciB8IElFZGl0b3JHcm91cCk6IElFZGl0b3JQYXJ0IHsgcmV0dXJuIHRoaXM7IH1cblxuXHRzYXZlV29ya2luZ1NldChuYW1lOiBzdHJpbmcpOiBJRWRpdG9yV29ya2luZ1NldCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRXb3JraW5nU2V0cygpOiBJRWRpdG9yV29ya2luZ1NldFtdIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFwcGx5V29ya2luZ1NldCh3b3JraW5nU2V0OiBJRWRpdG9yV29ya2luZ1NldCB8ICdlbXB0eScsIG9wdGlvbnM/OiBJRWRpdG9yV29ya2luZ1NldE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGRlbGV0ZVdvcmtpbmdTZXQod29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQpOiBQcm9taXNlPGJvb2xlYW4+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cblx0cmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXI8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4ocHJvdmlkZXI6IElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlcjxUPik6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RWRpdG9yUGFydHMgZXh0ZW5kcyBFZGl0b3JQYXJ0cyB7XG5cdHRlc3RNYWluUGFydCE6IFRlc3RFZGl0b3JQYXJ0O1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVNYWluRWRpdG9yUGFydCgpOiBNYWluRWRpdG9yUGFydCB7XG5cdFx0dGhpcy50ZXN0TWFpblBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RFZGl0b3JQYXJ0LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzLnRlc3RNYWluUGFydDtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlRWRpdG9yUGFydHMoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8VGVzdEVkaXRvclBhcnRzPiB7XG5cdGNvbnN0IHBhcnRzID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEVkaXRvclBhcnRzKTtcblx0Y29uc3QgcGFydCA9IGRpc3Bvc2FibGVzLmFkZChwYXJ0cykudGVzdE1haW5QYXJ0O1xuXHRwYXJ0LmNyZWF0ZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdHBhcnQubGF5b3V0KDEwODAsIDgwMCwgMCwgMCk7XG5cblx0YXdhaXQgcGFydHMud2hlblJlYWR5O1xuXG5cdHJldHVybiBwYXJ0cztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUVkaXRvclBhcnQoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8VGVzdEVkaXRvclBhcnQ+IHtcblx0cmV0dXJuIChhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0cyhpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpKS50ZXN0TWFpblBhcnQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TGlzdFNlcnZpY2UgaW1wbGVtZW50cyBJTGlzdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRsYXN0Rm9jdXNlZExpc3Q6IGFueSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRyZWdpc3RlcigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFBhdGhTZXJ2aWNlIGltcGxlbWVudHMgSVBhdGhTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGZhbGxiYWNrVXNlckhvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvJyB9KSwgcHVibGljIGRlZmF1bHRVcmlTY2hlbWUgPSBTY2hlbWFzLmZpbGUpIHsgfVxuXG5cdGhhc1ZhbGlkQmFzZW5hbWUocmVzb3VyY2U6IFVSSSwgYmFzZW5hbWU/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRoYXNWYWxpZEJhc2VuYW1lKHJlc291cmNlOiBVUkksIG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGJhc2VuYW1lPzogc3RyaW5nKTogYm9vbGVhbjtcblx0aGFzVmFsaWRCYXNlbmFtZShyZXNvdXJjZTogVVJJLCBhcmcyPzogc3RyaW5nIHwgT3BlcmF0aW5nU3lzdGVtLCBuYW1lPzogc3RyaW5nKTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGFyZzIgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gaXNWYWxpZEJhc2VuYW1lKGFyZzIgPz8gYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNWYWxpZEJhc2VuYW1lKG5hbWUgPz8gYmFzZW5hbWUocmVzb3VyY2UpKTtcblx0fVxuXG5cdGdldCBwYXRoKCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGlzV2luZG93cyA/IHdpbjMyIDogcG9zaXgpOyB9XG5cblx0dXNlckhvbWUob3B0aW9ucz86IHsgcHJlZmVyTG9jYWw6IGJvb2xlYW4gfSk6IFByb21pc2U8VVJJPjtcblx0dXNlckhvbWUob3B0aW9uczogeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KTogVVJJO1xuXHR1c2VySG9tZShvcHRpb25zPzogeyBwcmVmZXJMb2NhbDogYm9vbGVhbiB9KTogUHJvbWlzZTxVUkk+IHwgVVJJIHtcblx0XHRyZXR1cm4gb3B0aW9ucz8ucHJlZmVyTG9jYWwgPyB0aGlzLmZhbGxiYWNrVXNlckhvbWUgOiBQcm9taXNlLnJlc29sdmUodGhpcy5mYWxsYmFja1VzZXJIb21lKTtcblx0fVxuXG5cdGdldCByZXNvbHZlZFVzZXJIb21lKCkgeyByZXR1cm4gdGhpcy5mYWxsYmFja1VzZXJIb21lOyB9XG5cblx0YXN5bmMgZmlsZVVSSShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiBVUkkuZmlsZShwYXRoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0VGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIgZXh0ZW5kcyBJVGV4dEZpbGVFZGl0b3JNb2RlbE1hbmFnZXIsIElEaXNwb3NhYmxlIHtcblx0YWRkKHJlc291cmNlOiBVUkksIG1vZGVsOiBUZXh0RmlsZUVkaXRvck1vZGVsKTogdm9pZDtcblx0cmVtb3ZlKHJlc291cmNlOiBVUkkpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSVRlc3RUZXh0RmlsZUVkaXRvck1vZGVsIGV4dGVuZHMgSVRleHRGaWxlRWRpdG9yTW9kZWwge1xuXHRyZWFkb25seSBsYXN0UmVzb2x2ZWRGaWxlU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFzdFJlc29sdmVkRmlsZVN0YXQobW9kZWw6IHVua25vd24pOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBtb2RlbCBhcyBJVGVzdFRleHRGaWxlRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIGNhbmRpZGF0ZT8ubGFzdFJlc29sdmVkRmlsZVN0YXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0V29ya3NwYWNlc1NlcnZpY2UgaW1wbGVtZW50cyBJV29ya3NwYWNlc1NlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCA9IEV2ZW50Lk5vbmU7XG5cblx0YXN5bmMgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoZm9sZGVycz86IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogUHJvbWlzZTxJV29ya3NwYWNlSWRlbnRpZmllcj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGFkZFJlY2VudGx5T3BlbmVkKHJlY2VudHM6IElSZWNlbnRbXSk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHJlbW92ZVJlY2VudGx5T3BlbmVkKHdvcmtzcGFjZXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgY2xlYXJSZWNlbnRseU9wZW5lZCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRSZWNlbnRseU9wZW5lZCgpOiBQcm9taXNlPElSZWNlbnRseU9wZW5lZD4geyByZXR1cm4geyBmaWxlczogW10sIHdvcmtzcGFjZXM6IFtdIH07IH1cblx0YXN5bmMgZ2V0RGlydHlXb3Jrc3BhY2VzKCk6IFByb21pc2U8KElGb2xkZXJCYWNrdXBJbmZvIHwgSVdvcmtzcGFjZUJhY2t1cEluZm8pW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGVudGVyV29ya3NwYWNlKHBhdGg6IFVSSSk6IFByb21pc2U8SUVudGVyV29ya3NwYWNlUmVzdWx0IHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBnZXRXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZVBhdGg6IFVSSSk6IFByb21pc2U8SVdvcmtzcGFjZUlkZW50aWZpZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGVybWluYWxJbnN0YW5jZVNlcnZpY2UgaW1wbGVtZW50cyBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2Uge1xuXHRvbkRpZENyZWF0ZUluc3RhbmNlID0gRXZlbnQuTm9uZTtcblx0b25EaWRSZWdpc3RlckJhY2tlbmQgPSBFdmVudC5Ob25lO1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb252ZXJ0UHJvZmlsZVRvU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWdPclByb2ZpbGU/OiBJU2hlbGxMYXVuY2hDb25maWcgfCBJVGVybWluYWxQcm9maWxlLCBjd2Q/OiBzdHJpbmcgfCBVUkkpOiBJU2hlbGxMYXVuY2hDb25maWcgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cHJlcGFyZVBhdGhGb3JUZXJtaW5hbEFzeW5jKHBhdGg6IHN0cmluZywgZXhlY3V0YWJsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0aXRsZTogc3RyaW5nLCBzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlLCByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjcmVhdGVJbnN0YW5jZShvcHRpb25zOiBJQ3JlYXRlVGVybWluYWxPcHRpb25zLCB0YXJnZXQ6IFRlcm1pbmFsTG9jYXRpb24pOiBJVGVybWluYWxJbnN0YW5jZSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBnZXRCYWNrZW5kKHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsQmFja2VuZCB8IHVuZGVmaW5lZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZGlkUmVnaXN0ZXJCYWNrZW5kKGJhY2tlbmQ6IElUZXJtaW5hbEJhY2tlbmQpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldFJlZ2lzdGVyZWRCYWNrZW5kcygpOiBJdGVyYWJsZUl0ZXJhdG9yPElUZXJtaW5hbEJhY2tlbmQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGVybWluYWxFZGl0b3JTZXJ2aWNlIGltcGxlbWVudHMgSVRlcm1pbmFsRWRpdG9yU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YWN0aXZlSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRpbnN0YW5jZXM6IHJlYWRvbmx5IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0b25EaWREaXNwb3NlSW5zdGFuY2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZEZvY3VzSW5zdGFuY2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZUluc3RhbmNlcyA9IEV2ZW50Lk5vbmU7XG5cdG9wZW5FZGl0b3IoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBlZGl0b3JPcHRpb25zPzogVGVybWluYWxFZGl0b3JMb2NhdGlvbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZGV0YWNoSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzcGxpdEluc3RhbmNlKGluc3RhbmNlVG9TcGxpdDogSVRlcm1pbmFsSW5zdGFuY2UsIHNoZWxsTGF1bmNoQ29uZmlnPzogSVNoZWxsTGF1bmNoQ29uZmlnKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0cmV2ZWFsQWN0aXZlRWRpdG9yKHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRyZXNvbHZlUmVzb3VyY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogVVJJIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJldml2ZUlucHV0KGRlc2VyaWFsaXplZElucHV0OiBJRGVzZXJpYWxpemVkVGVybWluYWxFZGl0b3JJbnB1dCk6IFRlcm1pbmFsRWRpdG9ySW5wdXQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0SW5wdXRGcm9tUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IFRlcm1pbmFsRWRpdG9ySW5wdXQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRmb2N1c0FjdGl2ZUluc3RhbmNlKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMgZm9jdXNJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEluc3RhbmNlRnJvbVJlc291cmNlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRmb2N1c0ZpbmRXaWRnZXQoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRoaWRlRmluZFdpZGdldCgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGZpbmROZXh0KCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0ZmluZFByZXZpb3VzKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RUZXJtaW5hbEdyb3VwU2VydmljZSBpbXBsZW1lbnRzIElUZXJtaW5hbEdyb3VwU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YWN0aXZlSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRpbnN0YW5jZXM6IHJlYWRvbmx5IElUZXJtaW5hbEluc3RhbmNlW10gPSBbXTtcblx0Z3JvdXBzOiByZWFkb25seSBJVGVybWluYWxHcm91cFtdID0gW107XG5cdGFjdGl2ZUdyb3VwOiBJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZDtcblx0YWN0aXZlR3JvdXBJbmRleDogbnVtYmVyID0gMDtcblx0bGFzdEFjY2Vzc2VkTWVudTogJ2lubGluZS10YWInIHwgJ3RhYi1saXN0JyA9ICdpbmxpbmUtdGFiJztcblx0b25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkRGlzcG9zZUdyb3VwID0gRXZlbnQuTm9uZTtcblx0b25EaWRTaG93ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VHcm91cHMgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZVBhbmVsT3JpZW50YXRpb24gPSBFdmVudC5Ob25lO1xuXHRvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkRm9jdXNJbnN0YW5jZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlSW5zdGFuY2VzID0gRXZlbnQuTm9uZTtcblx0Y3JlYXRlR3JvdXAoaW5zdGFuY2U/OiBhbnkpOiBJVGVybWluYWxHcm91cCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG1vdmVHcm91cChzb3VyY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgSVRlcm1pbmFsSW5zdGFuY2VbXSwgdGFyZ2V0OiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0bW92ZUdyb3VwVG9FbmQoc291cmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IElUZXJtaW5hbEluc3RhbmNlW10pOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG1vdmVJbnN0YW5jZShzb3VyY2U6IElUZXJtaW5hbEluc3RhbmNlLCB0YXJnZXQ6IElUZXJtaW5hbEluc3RhbmNlLCBzaWRlOiAnYmVmb3JlJyB8ICdhZnRlcicpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHVuc3BsaXRJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGpvaW5JbnN0YW5jZXMoaW5zdGFuY2VzOiBJVGVybWluYWxJbnN0YW5jZVtdKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRpbnN0YW5jZUlzU3BsaXQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRHcm91cExhYmVscygpOiBzdHJpbmdbXSB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRBY3RpdmVHcm91cEJ5SW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0QWN0aXZlR3JvdXBUb05leHQoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRBY3RpdmVHcm91cFRvUHJldmlvdXMoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgodGVybWluYWxJbmRleDogbnVtYmVyKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRzZXRDb250YWluZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2hvd1BhbmVsKGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aGlkZVBhbmVsKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNUYWJzKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNIb3ZlcigpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNBY3RpdmVJbnN0YW5jZSgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGFzeW5jIGZvY3VzSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRJbnN0YW5jZUZyb21SZXNvdXJjZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXNGaW5kV2lkZ2V0KCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aGlkZUZpbmRXaWRnZXQoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRmaW5kTmV4dCgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGZpbmRQcmV2aW91cygpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHVwZGF0ZVZpc2liaWxpdHkoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgaW1wbGVtZW50cyBJVGVybWluYWxQcm9maWxlU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YXZhaWxhYmxlUHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSA9IFtdO1xuXHRjb250cmlidXRlZFByb2ZpbGVzOiBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlW10gPSBbXTtcblx0cHJvZmlsZXNSZWFkeTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRvbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzID0gRXZlbnQuTm9uZTtcblx0Z2V0UGxhdGZvcm1LZXkoKTogUHJvbWlzZTxzdHJpbmc+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZnJlc2hBdmFpbGFibGVQcm9maWxlcygpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldERlZmF1bHRQcm9maWxlTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Z2V0RGVmYXVsdFByb2ZpbGUoKTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRDb250cmlidXRlZERlZmF1bHRQcm9maWxlKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpOiBQcm9taXNlPElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVyQ29udHJpYnV0ZWRQcm9maWxlKGFyZ3M6IElSZWdpc3RlckNvbnRyaWJ1dGVkUHJvZmlsZUFyZ3MpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVySW50ZXJuYWxDb250cmlidXRlZFByb2ZpbGUoX3Byb2ZpbGU6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0Z2V0Q29udHJpYnV0ZWRQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nKTogSVRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyIHwgdW5kZWZpbmVkIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlZ2lzdGVyVGVybWluYWxQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nLCBwcm9maWxlUHJvdmlkZXI6IElUZXJtaW5hbFByb2ZpbGVQcm92aWRlcik6IElEaXNwb3NhYmxlIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdG92ZXJyaWRlRGVmYXVsdFByb2ZpbGUoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nKTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIGltcGxlbWVudHMgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0ZGVmYXVsdFByb2ZpbGVOYW1lID0gJyc7XG5cdHJlc29sdmVJY29uKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpOiB2b2lkIHsgfVxuXHRhc3luYyByZXNvbHZlU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgb3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXREZWZhdWx0UHJvZmlsZShvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4geyByZXR1cm4geyBwYXRoOiAnL2RlZmF1bHQnLCBwcm9maWxlTmFtZTogJ0RlZmF1bHQnLCBpc0RlZmF1bHQ6IHRydWUgfTsgfVxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGwob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJy9kZWZhdWx0JzsgfVxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGxBcmdzKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxzdHJpbmcgfCBzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblx0Z2V0RGVmYXVsdEljb24oKTogVGVybWluYWxJY29uICYgVGhlbWVJY29uIHsgcmV0dXJuIENvZGljb24udGVybWluYWw7IH1cblx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7IHJldHVybiBlbnY7IH1cblx0Z2V0U2FmZUNvbmZpZ1ZhbHVlKGtleTogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtKTogdW5rbm93biB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0U2FmZUNvbmZpZ1ZhbHVlRnVsbEtleShrZXk6IHN0cmluZyk6IHVua25vd24gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNyZWF0ZVByb2ZpbGVGcm9tU2hlbGxBbmRTaGVsbEFyZ3Moc2hlbGw/OiB1bmtub3duLCBzaGVsbEFyZ3M/OiB1bmtub3duKTogUHJvbWlzZTxzdHJpbmcgfCBJVGVybWluYWxQcm9maWxlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0Z2V0IGZvbnRNZXRyaWNzKCkgeyByZXR1cm4gdGhpcy5fZm9udE1ldHJpY3M7IH1cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdHNldENvbmZpZyhjb25maWc6IFBhcnRpYWw8SVRlcm1pbmFsQ29uZmlndXJhdGlvbj4pIHsgdGhpcy5fY29uZmlnID0gY29uZmlnIGFzIGFueTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFF1aWNrSW5wdXRTZXJ2aWNlIGltcGxlbWVudHMgSVF1aWNrSW5wdXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25TaG93ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25IaWRlID0gRXZlbnQuTm9uZTtcblxuXHRyZWFkb25seSBhbGlnbm1lbnQgPSBvYnNlcnZhYmxlVmFsdWUoJ1Rlc3RRdWlja0lucHV0U2VydmljZS5hbGlnbm1lbnQnLCAndG9wJyBhcyBRdWlja0lucHV0QWxpZ25tZW50KTtcblx0cmVhZG9ubHkgY3VycmVudFF1aWNrSW5wdXQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHF1aWNrQWNjZXNzID0gdW5kZWZpbmVkITtcblx0YmFja0J1dHRvbiE6IElRdWlja0lucHV0QnV0dG9uO1xuXG5cdHBpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihwaWNrczogUHJvbWlzZTxRdWlja1BpY2tJbnB1dDxUPltdPiB8IFF1aWNrUGlja0lucHV0PFQ+W10sIG9wdGlvbnM/OiBJUGlja09wdGlvbnM8VD4gJiB7IGNhblBpY2tNYW55OiB0cnVlIH0sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRbXT47XG5cdHBpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihwaWNrczogUHJvbWlzZTxRdWlja1BpY2tJbnB1dDxUPltdPiB8IFF1aWNrUGlja0lucHV0PFQ+W10sIG9wdGlvbnM/OiBJUGlja09wdGlvbnM8VD4gJiB7IGNhblBpY2tNYW55OiBmYWxzZSB9LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUPjtcblx0YXN5bmMgcGljazxUIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0+KHBpY2tzOiBQcm9taXNlPFF1aWNrUGlja0lucHV0PFQ+W10+IHwgUXVpY2tQaWNrSW5wdXQ8VD5bXSwgb3B0aW9ucz86IE9taXQ8SVBpY2tPcHRpb25zPFQ+LCAnY2FuUGlja01hbnknPiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHBpY2tzKSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gPGFueT57IGxhYmVsOiAnc2VsZWN0ZWRQaWNrJywgZGVzY3JpcHRpb246ICdwaWNrIGRlc2NyaXB0aW9uJywgdmFsdWU6ICdzZWxlY3RlZFBpY2snIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgaW5wdXQob3B0aW9ucz86IElJbnB1dE9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gb3B0aW9ucyA/ICdyZXNvbHZlZCcgKyBvcHRpb25zLnByb21wdCA6ICdyZXNvbHZlZCc7IH1cblxuXHRjcmVhdGVRdWlja1BpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPigpOiBJUXVpY2tQaWNrPFQsIHsgdXNlU2VwYXJhdG9yczogYm9vbGVhbiB9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNyZWF0ZUlucHV0Qm94KCk6IElJbnB1dEJveCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNyZWF0ZVF1aWNrV2lkZ2V0KCk6IElRdWlja1dpZGdldCB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRjcmVhdGVRdWlja1RyZWU8VCBleHRlbmRzIElRdWlja1RyZWVJdGVtPigpOiBJUXVpY2tUcmVlPFQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0Zm9jdXMoKTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZSgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0bmF2aWdhdGUobmV4dDogYm9vbGVhbiwgcXVpY2tOYXZpZ2F0ZT86IElRdWlja05hdmlnYXRlQ29uZmlndXJhdGlvbik6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhY2NlcHQoKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGJhY2soKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGNhbmNlbCgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0c2V0QWxpZ25tZW50KGFsaWdubWVudDogJ3RvcCcgfCAnY2VudGVyJyB8IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9KTogdm9pZCB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHRvZ2dsZUhvdmVyKCk6IHZvaWQgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5jbGFzcyBUZXN0TGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIGltcGxlbWVudHMgSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0aXNFbmFibGVkRm9yTGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBkZXRlY3RMYW5ndWFnZShyZXNvdXJjZTogVVJJLCBzdXBwb3J0ZWRMYW5ncz86IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlbW90ZUFnZW50U2VydmljZSBpbXBsZW1lbnRzIElSZW1vdGVBZ2VudFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGdldENvbm5lY3Rpb24oKTogSVJlbW90ZUFnZW50Q29ubmVjdGlvbiB8IG51bGwgeyByZXR1cm4gbnVsbDsgfVxuXHRhc3luYyBnZXRFbnZpcm9ubWVudCgpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4geyByZXR1cm4gbnVsbDsgfVxuXHRhc3luYyBnZXRSYXdFbnZpcm9ubWVudCgpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4geyByZXR1cm4gbnVsbDsgfVxuXHRhc3luYyBnZXRFeHRlbnNpb25Ib3N0RXhpdEluZm8ocmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUV4dGVuc2lvbkhvc3RFeGl0SW5mbyB8IG51bGw+IHsgcmV0dXJuIG51bGw7IH1cblx0YXN5bmMgZ2V0RGlhZ25vc3RpY0luZm8ob3B0aW9uczogSURpYWdub3N0aWNJbmZvT3B0aW9ucyk6IFByb21pc2U8SURpYWdub3N0aWNJbmZvIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXBkYXRlVGVsZW1ldHJ5TGV2ZWwodGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgbG9nVGVsZW1ldHJ5KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogSVRlbGVtZXRyeURhdGEpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBmbHVzaFRlbGVtZXRyeSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRSb3VuZFRyaXBUaW1lKCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZW5kQ29ubmVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBpbXBsZW1lbnRzIElSZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0YXN5bmMgd2hlbkV4dGVuc2lvbnNSZWFkeSgpOiBQcm9taXNlPEluc3RhbGxFeHRlbnNpb25TdW1tYXJ5PiB7IHJldHVybiB7IGZhaWxlZDogW10gfTsgfVxuXHRzY2FuRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRvbkVuYWJsZW1lbnRDaGFuZ2VkID0gRXZlbnQuTm9uZTtcblx0Z2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IEVuYWJsZW1lbnRTdGF0ZSB7IHJldHVybiBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5OyB9XG5cdGdldEVuYWJsZW1lbnRTdGF0ZXMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCB3b3Jrc3BhY2VUeXBlT3ZlcnJpZGVzPzogeyB0cnVzdGVkPzogYm9vbGVhbiB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkKTogRW5hYmxlbWVudFN0YXRlW10geyByZXR1cm4gW107IH1cblx0Z2V0RGVwZW5kZW5jaWVzRW5hYmxlbWVudFN0YXRlcyhleHRlbnNpb246IElFeHRlbnNpb24pOiBbSUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlXVtdIHsgcmV0dXJuIFtdOyB9XG5cdGNhbkNoYW5nZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGNhbkNoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGlzRW5hYmxlZChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0aXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdGlzRGlzYWJsZWRHbG9iYWxseShleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBzdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogUHJvbWlzZTxib29sZWFuW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIHVwZGF0ZUV4dGVuc2lvbnNFbmFibGVtZW50c1doZW5Xb3Jrc3BhY2VUcnVzdENoYW5nZXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0b25JbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25EaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG9uVW5pbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25EaWRVbmluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5Ob25lO1xuXHRvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gRXZlbnQuTm9uZTtcblx0b25Qcm9maWxlQXdhcmVJbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25Qcm9maWxlQXdhcmVEaWRJbnN0YWxsRXh0ZW5zaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG9uUHJvZmlsZUF3YXJlVW5pbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuTm9uZTtcblx0b25Qcm9maWxlQXdhcmVEaWRVbmluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5Ob25lO1xuXHRvbkRpZFByb2ZpbGVBd2FyZVVuaW5zdGFsbEV4dGVuc2lvbnMgPSBFdmVudC5Ob25lO1xuXHRvblByb2ZpbGVBd2FyZURpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VQcm9maWxlID0gRXZlbnQuTm9uZTtcblx0b25EaWRFbmFibGVFeHRlbnNpb25zID0gRXZlbnQuTm9uZTtcblx0cHJlZmVyUHJlUmVsZWFzZXMgPSB0cnVlO1xuXHRpbnN0YWxsVlNJWChsb2NhdGlvbjogVVJJLCBtYW5pZmVzdDogUmVhZG9ubHk8SVJlbGF4ZWRFeHRlbnNpb25NYW5pZmVzdD4sIGluc3RhbGxPcHRpb25zPzogSW5zdGFsbE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGFzeW5jIHVwZGF0ZUZyb21HYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uLCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHJldHVybiBleHRlbnNpb247IH1cblx0emlwKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0Z2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxSZWFkb25seTxJUmVsYXhlZEV4dGVuc2lvbk1hbmlmZXN0Pj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRpbnN0YWxsKHZzaXg6IFVSSSwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0aXNBbGxvd2VkKCk6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcgeyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBjYW5JbnN0YWxsKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pOiBQcm9taXNlPHRydWU+IHsgcmV0dXJuIHRydWU7IH1cblx0aW5zdGFsbEZyb21HYWxsZXJ5KGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0dW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBVbmluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0YXN5bmMgZ2V0SW5zdGFsbGVkKHR5cGU/OiBFeHRlbnNpb25UeXBlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyByZXR1cm4gW107IH1cblx0Z2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpOiBQcm9taXNlPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHJldHVybiBsb2NhbDsgfVxuXHRyZWdpc3RlclBhcnRpY2lwYW50KHBhcml0aWNpcGFudDogSUV4dGVuc2lvbk1hbmFnZW1lbnRQYXJ0aWNpcGFudCk6IHZvaWQgeyB9XG5cdGFzeW5jIGdldFRhcmdldFBsYXRmb3JtKCk6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+IHsgcmV0dXJuIFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRDsgfVxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGRvd25sb2FkKCk6IFByb21pc2U8VVJJPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdGNvcHlFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHR0b2dnbGVBcHBsaWNhdGlvblNjb3BlKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cdGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXHR3aGVuUHJvZmlsZUNoYW5nZWQoZnJvbTogSVVzZXJEYXRhUHJvZmlsZSwgdG86IElVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblx0Z2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9uTG9jYXRpb25zKCk6IFVSSVtdIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnMoKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0aW5zdGFsbFJlc291cmNlRXh0ZW5zaW9uKCk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRnZXRFeHRlbnNpb25zKCk6IFByb21pc2U8SVJlc291cmNlRXh0ZW5zaW9uW10+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdHJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdGdldEluc3RhbGxhYmxlU2VydmVycyhleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcltdPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRpc1B1Ymxpc2hlclRydXN0ZWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0VHJ1c3RlZFB1Ymxpc2hlcnMoKSB7IHJldHVybiBbXTsgfVxuXHR0cnVzdFB1Ymxpc2hlcnMoKTogdm9pZCB7IH1cblx0dW50cnVzdFB1Ymxpc2hlcnMoKTogdm9pZCB7IH1cblx0YXN5bmMgcmVxdWVzdFB1Ymxpc2hlclRydXN0KGV4dGVuc2lvbnM6IEluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIFRlc3RXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgaW1wbGVtZW50cyBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRvbkRpZENoYW5nZVByb2ZpbGUgPSBFdmVudC5Ob25lO1xuXHRhc3luYyBzY2FuU3lzdGVtRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25bXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgc2NhblVzZXJFeHRlbnNpb25zKCk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb25bXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgc2NhbkV4dGVuc2lvbnNVbmRlckRldmVsb3BtZW50KCk6IFByb21pc2U8SUV4dGVuc2lvbltdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBjb3B5RXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2NhbkV4aXN0aW5nRXh0ZW5zaW9uKGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvblR5cGU6IEV4dGVuc2lvblR5cGUpOiBQcm9taXNlPElTY2FubmVkRXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRhZGRFeHRlbnNpb24obG9jYXRpb246IFVSSSwgbWV0YWRhdGE/OiBQYXJ0aWFsPElHYWxsZXJ5TWV0YWRhdGEgJiB7IGlzQXBwbGljYXRpb25TY29wZWQ6IGJvb2xlYW47IGlzTWFjaGluZVNjb3BlZDogYm9vbGVhbjsgaXNCdWlsdGluOiBib29sZWFuOyBpc1N5c3RlbTogYm9vbGVhbjsgdXBkYXRlZDogYm9vbGVhbjsgcHJlUmVsZWFzZTogYm9vbGVhbjsgaW5zdGFsbGVkVGltZXN0YW1wOiBudW1iZXIgfT4gfCB1bmRlZmluZWQpOiBQcm9taXNlPElFeHRlbnNpb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0YWRkRXh0ZW5zaW9uRnJvbUdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG1ldGFkYXRhPzogUGFydGlhbDxJR2FsbGVyeU1ldGFkYXRhICYgeyBpc0FwcGxpY2F0aW9uU2NvcGVkOiBib29sZWFuOyBpc01hY2hpbmVTY29wZWQ6IGJvb2xlYW47IGlzQnVpbHRpbjogYm9vbGVhbjsgaXNTeXN0ZW06IGJvb2xlYW47IHVwZGF0ZWQ6IGJvb2xlYW47IHByZVJlbGVhc2U6IGJvb2xlYW47IGluc3RhbGxlZFRpbWVzdGFtcDogbnVtYmVyIH0+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRXh0ZW5zaW9uPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHJlbW92ZUV4dGVuc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0dXBkYXRlTWV0YWRhdGEoZXh0ZW5zaW9uOiBJU2Nhbm5lZEV4dGVuc2lvbiwgbWV0YURhdGE6IFBhcnRpYWw8TWV0YWRhdGE+LCBwcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SVNjYW5uZWRFeHRlbnNpb24+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2NhbkV4dGVuc2lvbk1hbmlmZXN0KGV4dGVuc2lvbkxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPFJlYWRvbmx5PElSZWxheGVkRXh0ZW5zaW9uTWFuaWZlc3Q+IHwgbnVsbD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd29ya2JlbmNoVGVhcmRvd24oaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcykge1xuXHRcdFx0YXdhaXQgd29ya2luZ0NvcHkucmV2ZXJ0KCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRhd2FpdCBncm91cC5jbG9zZUFsbEVkaXRvcnMoKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGVkaXRvckdyb3VwU2VydmljZS5yZW1vdmVHcm91cChncm91cCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RDb250ZXh0TWVudVNlcnZpY2UgaW1wbGVtZW50cyBJQ29udGV4dE1lbnVTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRTaG93Q29udGV4dE1lbnUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEhpZGVDb250ZXh0TWVudSA9IEV2ZW50Lk5vbmU7XG5cblx0c2hvd0NvbnRleHRNZW51KGRlbGVnYXRlOiBJQ29udGV4dE1lbnVEZWxlZ2F0ZSB8IElDb250ZXh0TWVudU1lbnVEZWxlZ2F0ZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdENoYXRXaWRnZXRTZXJ2aWNlIGltcGxlbWVudHMgSUNoYXRXaWRnZXRTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0bGFzdEZvY3VzZWRXaWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdG9uRGlkQWRkV2lkZ2V0ID0gRXZlbnQuTm9uZTtcblx0b25EaWRSZW1vdmVXaWRnZXQgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZVdpZGdldFZpc2liaWxpdHkgPSBFdmVudC5Ob25lO1xuXHRvbkRpZEJhY2tncm91bmRTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VGb2N1c2VkV2lkZ2V0ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cblx0YXN5bmMgcmV2ZWFsKHdpZGdldDogSUNoYXRXaWRnZXQsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyByZXZlYWxXaWRnZXQocHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0QWxsV2lkZ2V0cygpOiBSZWFkb25seUFycmF5PElDaGF0V2lkZ2V0PiB7IHJldHVybiBbXTsgfVxuXHRnZXRXaWRnZXRCeUlucHV0VXJpKHVyaTogVVJJKTogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdG9wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD47XG5cdG9wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0YXJnZXQ/OiBQcmVmZXJyZWRHcm91cCwgb3B0aW9ucz86IElDaGF0RWRpdG9yT3B0aW9ucyk6IFByb21pc2U8SUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBvcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IHVua25vd24sIHRhcmdldD86IHVua25vd24sIG9wdGlvbnM/OiB1bmtub3duKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldFdpZGdldHNCeUxvY2F0aW9ucyhsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24pOiBSZWFkb25seUFycmF5PElDaGF0V2lkZ2V0PiB7IHJldHVybiBbXTsgfVxuXHRyZWdpc3RlcihuZXdXaWRnZXQ6IElDaGF0V2lkZ2V0KTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVFBLFNBQVMsa0JBQWtCO0FB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
