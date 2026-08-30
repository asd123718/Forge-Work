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
import "./media/scm.css";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { append, $, Dimension, trackFocus } from "../../../../base/browser/dom.js";
import { InputValidationType, ISCMViewService, SCMInputChangeReason } from "../common/scm.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextViewService, IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { MenuItemAction, IMenuService, registerAction2, MenuId, Action2 } from "../../../../platform/actions/common/actions.js";
import { ActionRunner, Action } from "../../../../base/common/actions.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IConfigurationService, ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { localize } from "../../../../nls.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from "../../codeEditor/browser/simpleEditorOptions.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { MenuPreventer } from "../../codeEditor/browser/menuPreventer.js";
import { SelectionClipboardContributionID } from "../../codeEditor/browser/selectionClipboard.js";
import { EditorDictation } from "../../codeEditor/browser/dictation/editorDictation.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import * as platform from "../../../../base/common/platform.js";
import { format } from "../../../../base/common/strings.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ColorDetector } from "../../../../editor/contrib/colorPicker/browser/colorDetector.js";
import { LinkDetector } from "../../../../editor/contrib/links/browser/links.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { DragAndDropController } from "../../../../editor/contrib/dnd/browser/dnd.js";
import { CopyPasteController } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { DropIntoEditorController } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { MessageController } from "../../../../editor/contrib/message/browser/messageController.js";
import { InlineCompletionsController } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { CodeActionController } from "../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { FormatOnType } from "../../../../editor/contrib/format/browser/formatActions.js";
import { EditorOption, EditorOptions } from "../../../../editor/common/config/editorOptions.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { clamp } from "../../../../base/common/numbers.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { autorun, runOnChange } from "../../../../base/common/observable.js";
import { PlaceholderTextContribution } from "../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import product from "../../../../platform/product/common/product.js";
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from "../../chat/browser/actions/chatActions.js";
const SCMInputContextKeys = {
  SCMInputHasValidationMessage: new RawContextKey("scmInputHasValidationMessage", false)
};
var SCMInputWidgetCommandId = /* @__PURE__ */ ((SCMInputWidgetCommandId2) => {
  SCMInputWidgetCommandId2["CancelAction"] = "scm.input.cancelAction";
  SCMInputWidgetCommandId2["SetupAction"] = "scm.input.triggerSetup";
  return SCMInputWidgetCommandId2;
})(SCMInputWidgetCommandId || {});
var SCMInputWidgetStorageKey = /* @__PURE__ */ ((SCMInputWidgetStorageKey2) => {
  SCMInputWidgetStorageKey2["LastActionId"] = "scm.input.lastActionId";
  return SCMInputWidgetStorageKey2;
})(SCMInputWidgetStorageKey || {});
let SCMInputWidgetActionRunner = class extends ActionRunner {
  constructor(input, storageService) {
    super();
    this.input = input;
    this.storageService = storageService;
    this._runningActions = /* @__PURE__ */ new Set();
  }
  get runningActions() {
    return this._runningActions;
  }
  async runAction(action) {
    try {
      if (this.runningActions.size !== 0) {
        this._cts?.cancel();
        if (action.id === "scm.input.cancelAction" /* CancelAction */) {
          return;
        }
      }
      const context = [];
      for (const group of this.input.repository.provider.groups) {
        context.push({
          resourceGroupId: group.id,
          resources: [...group.resources.map((r) => r.sourceUri)]
        });
      }
      this._runningActions.add(action);
      this._cts = new CancellationTokenSource();
      await action.run(...[this.input.repository.provider.rootUri, context, this._cts.token]);
    } finally {
      this._runningActions.delete(action);
      if (this._runningActions.size === 0) {
        const actionId = action.id === "scm.input.triggerSetup" /* SetupAction */ ? product.defaultChatAgent?.generateCommitMessageCommand ?? action.id : action.id;
        this.storageService.store("scm.input.lastActionId" /* LastActionId */, actionId, StorageScope.PROFILE, StorageTarget.USER);
      }
    }
  }
};
SCMInputWidgetActionRunner = __decorateClass([
  __decorateParam(1, IStorageService)
], SCMInputWidgetActionRunner);
let SCMInputWidgetToolbar = class extends WorkbenchToolBar {
  constructor(container, options, menuService, contextKeyService, contextMenuService, commandService, keybindingService, storageService, telemetryService) {
    super(container, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this._dropdownActions = [];
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._disposables = this._register(new MutableDisposable());
    this._dropdownAction = new Action(
      "scmInputMoreActions",
      localize("scmInputMoreActions", "More Actions..."),
      "codicon-chevron-down"
    );
    this._cancelAction = new MenuItemAction({
      id: "scm.input.cancelAction" /* CancelAction */,
      title: localize("scmInputCancelAction", "Cancel"),
      icon: Codicon.stopCircle
    }, void 0, void 0, void 0, void 0, contextKeyService, commandService);
  }
  get dropdownActions() {
    return this._dropdownActions;
  }
  get dropdownAction() {
    return this._dropdownAction;
  }
  setInput(input) {
    this._disposables.value = new DisposableStore();
    const contextKeyService = this.contextKeyService.createOverlay([
      ["scmProvider", input.repository.provider.providerId],
      ["scmProviderRootUri", input.repository.provider.rootUri?.toString()],
      ["scmProviderHasRootUri", !!input.repository.provider.rootUri]
    ]);
    const menu = this._disposables.value.add(this.menuService.createMenu(MenuId.SCMInputBox, contextKeyService, { emitEventsForSubmenuChanges: true }));
    const isEnabled = () => {
      return input.repository.provider.groups.some((g) => g.resources.length > 0);
    };
    const updateToolbar = () => {
      const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
      for (const action of actions) {
        action.enabled = isEnabled();
      }
      this._dropdownAction.enabled = isEnabled();
      let primaryAction = void 0;
      if (this.actionRunner.runningActions.size !== 0) {
        primaryAction = this._cancelAction;
      } else if (actions.length === 1) {
        primaryAction = actions[0];
      } else if (actions.length > 1) {
        const lastActionId = this.storageService.get("scm.input.lastActionId" /* LastActionId */, StorageScope.PROFILE, "");
        primaryAction = actions.find((a) => a.id === lastActionId) ?? actions[0];
      }
      this._dropdownActions = actions.length === 1 ? [] : actions;
      super.setActions(primaryAction ? [primaryAction] : [], []);
      this._onDidChange.fire();
    };
    this._disposables.value.add(menu.onDidChange(() => updateToolbar()));
    this._disposables.value.add(input.repository.provider.onDidChangeResources(() => updateToolbar()));
    this._disposables.value.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, "scm.input.lastActionId" /* LastActionId */, this._disposables.value)(() => updateToolbar()));
    this.actionRunner = this._disposables.value.add(new SCMInputWidgetActionRunner(input, this.storageService));
    this._disposables.value.add(this.actionRunner.onWillRun((e) => {
      if (this.actionRunner.runningActions.size === 0) {
        super.setActions([this._cancelAction], []);
        this._onDidChange.fire();
      }
    }));
    this._disposables.value.add(this.actionRunner.onDidRun((e) => {
      if (this.actionRunner.runningActions.size === 0) {
        updateToolbar();
      }
    }));
    updateToolbar();
  }
};
SCMInputWidgetToolbar = __decorateClass([
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ITelemetryService)
], SCMInputWidgetToolbar);
class SCMInputWidgetEditorOptions {
  constructor(overflowWidgetsDomNode, configurationService) {
    this.overflowWidgetsDomNode = overflowWidgetsDomNode;
    this.configurationService = configurationService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.defaultInputFontFamily = DEFAULT_FONT_FAMILY;
    this._disposables = new DisposableStore();
    const onDidChangeConfiguration = Event.filter(
      this.configurationService.onDidChangeConfiguration,
      (e) => {
        return e.affectsConfiguration("editor.accessibilitySupport") || e.affectsConfiguration("editor.cursorBlinking") || e.affectsConfiguration("editor.cursorStyle") || e.affectsConfiguration("editor.cursorWidth") || e.affectsConfiguration("editor.emptySelectionClipboard") || e.affectsConfiguration("editor.fontFamily") || e.affectsConfiguration("editor.roundedSelection") || e.affectsConfiguration("editor.rulers") || e.affectsConfiguration("editor.wordWrap") || e.affectsConfiguration("editor.wordSegmenterLocales") || e.affectsConfiguration("scm.inputFontFamily") || e.affectsConfiguration("scm.inputFontSize");
      },
      this._disposables
    );
    this._disposables.add(onDidChangeConfiguration(() => this._onDidChange.fire()));
  }
  getEditorConstructionOptions() {
    return {
      ...getSimpleEditorOptions(this.configurationService),
      ...this.getEditorOptions(),
      dragAndDrop: true,
      dropIntoEditor: { enabled: true },
      formatOnType: true,
      lineDecorationsWidth: 6,
      overflowWidgetsDomNode: this.overflowWidgetsDomNode,
      padding: { top: 2, bottom: 2 },
      quickSuggestions: false,
      renderWhitespace: "none",
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        vertical: "hidden"
      },
      wrappingIndent: "none",
      wrappingStrategy: "advanced"
    };
  }
  getEditorOptions() {
    const fontFamily = this._getEditorFontFamily();
    const fontSize = this._getEditorFontSize();
    const lineHeight = this._getEditorLineHeight(fontSize);
    const wordSegmenterLocales = this.configurationService.getValue("editor.wordSegmenterLocales");
    const accessibilitySupport = this.configurationService.getValue("editor.accessibilitySupport");
    const cursorBlinking = this.configurationService.getValue("editor.cursorBlinking");
    const cursorStyle = this.configurationService.getValue("editor.cursorStyle");
    const cursorWidth = this.configurationService.getValue("editor.cursorWidth") ?? 1;
    const emptySelectionClipboard = this.configurationService.getValue("editor.emptySelectionClipboard") === true;
    const roundedSelection = this.configurationService.getValue("editor.roundedSelection") === true;
    return { ...this._getEditorLanguageConfiguration(), accessibilitySupport, cursorBlinking, cursorStyle, cursorWidth, fontFamily, fontSize, lineHeight, emptySelectionClipboard, roundedSelection, wordSegmenterLocales };
  }
  _getEditorFontFamily() {
    const inputFontFamily = this.configurationService.getValue("scm.inputFontFamily").trim();
    if (inputFontFamily.toLowerCase() === "editor") {
      return this.configurationService.getValue("editor.fontFamily").trim();
    }
    if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== "default") {
      return inputFontFamily;
    }
    return this.defaultInputFontFamily;
  }
  _getEditorFontSize() {
    return this.configurationService.getValue("scm.inputFontSize");
  }
  _getEditorLanguageConfiguration() {
    const rulersConfig = this.configurationService.inspect("editor.rulers", { overrideIdentifier: "scminput" });
    const rulers = rulersConfig.overrideIdentifiers?.includes("scminput") ? EditorOptions.rulers.validate(rulersConfig.value) : [];
    const wordWrapConfig = this.configurationService.inspect("editor.wordWrap", { overrideIdentifier: "scminput" });
    const wordWrap = wordWrapConfig.overrideIdentifiers?.includes("scminput") ? EditorOptions.wordWrap.validate(wordWrapConfig.value) : "on";
    return { rulers, wordWrap };
  }
  _getEditorLineHeight(fontSize) {
    return Math.round(fontSize * 1.5);
  }
  dispose() {
    this._disposables.dispose();
    this._onDidChange.dispose();
  }
}
let SCMInputWidget = class {
  constructor(container, overflowWidgetsDomNode, contextKeyService, instantiationService, modelService, keybindingService, configurationService, scmViewService, contextViewService, openerService, accessibilityService, markdownRendererService) {
    this.modelService = modelService;
    this.keybindingService = keybindingService;
    this.configurationService = configurationService;
    this.scmViewService = scmViewService;
    this.contextViewService = contextViewService;
    this.openerService = openerService;
    this.accessibilityService = accessibilityService;
    this.markdownRendererService = markdownRendererService;
    this.disposables = new DisposableStore();
    this.repositoryDisposables = new DisposableStore();
    this.validationHasFocus = false;
    // This is due to "Setup height change listener on next tick" above
    // https://github.com/microsoft/vscode/issues/108067
    this.lastLayoutWasTrash = false;
    this.shouldFocusAfterLayout = false;
    this.element = append(container, $(".scm-editor"));
    this.editorContainer = append(this.element, $(".scm-editor-container"));
    this.toolbarContainer = append(this.element, $(".scm-editor-toolbar"));
    this.contextKeyService = this.disposables.add(contextKeyService.createScoped(this.element));
    this.repositoryIdContextKey = this.contextKeyService.createKey("scmRepository", void 0);
    this.validationMessageContextKey = SCMInputContextKeys.SCMInputHasValidationMessage.bindTo(this.contextKeyService);
    this.inputEditorOptions = new SCMInputWidgetEditorOptions(overflowWidgetsDomNode, this.configurationService);
    this.disposables.add(this.inputEditorOptions.onDidChange(this.onDidChangeEditorOptions, this));
    this.disposables.add(this.inputEditorOptions);
    const codeEditorWidgetOptions = {
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        CodeActionController.ID,
        ColorDetector.ID,
        ContextMenuController.ID,
        CopyPasteController.ID,
        DragAndDropController.ID,
        DropIntoEditorController.ID,
        EditorDictation.ID,
        FormatOnType.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        InlineCompletionsController.ID,
        LinkDetector.ID,
        MenuPreventer.ID,
        MessageController.ID,
        PlaceholderTextContribution.ID,
        SelectionClipboardContributionID,
        SnippetController2.ID,
        SuggestController.ID
      ]),
      isSimpleWidget: true
    };
    const services = new ServiceCollection([IContextKeyService, this.contextKeyService]);
    const instantiationService2 = instantiationService.createChild(services, this.disposables);
    const editorConstructionOptions = this.inputEditorOptions.getEditorConstructionOptions();
    this.inputEditor = instantiationService2.createInstance(CodeEditorWidget, this.editorContainer, editorConstructionOptions, codeEditorWidgetOptions);
    this.disposables.add(this.inputEditor);
    this.disposables.add(this.inputEditor.onDidFocusEditorText(() => {
      if (this.input?.repository) {
        this.scmViewService.focus(this.input.repository);
      }
      this.element.classList.add("synthetic-focus");
      this.renderValidation();
    }));
    this.disposables.add(this.inputEditor.onDidBlurEditorText(() => {
      this.element.classList.remove("synthetic-focus");
      setTimeout(() => {
        if (!this.validation || !this.validationHasFocus) {
          this.clearValidation();
        }
      }, 0);
    }));
    this.disposables.add(this.inputEditor.onDidBlurEditorWidget(() => {
      CopyPasteController.get(this.inputEditor)?.clearWidgets();
      DropIntoEditorController.get(this.inputEditor)?.clearWidgets();
    }));
    const firstLineKey = this.contextKeyService.createKey("scmInputIsInFirstPosition", false);
    const lastLineKey = this.contextKeyService.createKey("scmInputIsInLastPosition", false);
    this.disposables.add(this.inputEditor.onDidChangeCursorPosition(({ position }) => {
      const viewModel = this.inputEditor._getViewModel();
      const lastLineNumber = viewModel.getLineCount();
      const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
      const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
      firstLineKey.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
      lastLineKey.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
    }));
    this.disposables.add(this.inputEditor.onDidScrollChange((e) => {
      this.toolbarContainer.classList.toggle("scroll-decoration", e.scrollTop > 0);
    }));
    Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.showInputActionButton"))(() => this.layout(), this, this.disposables);
    this.onDidChangeContentHeight = Event.signal(Event.filter(this.inputEditor.onDidContentSizeChange, (e) => e.contentHeightChanged, this.disposables));
    this.toolbar = instantiationService2.createInstance(SCMInputWidgetToolbar, this.toolbarContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction && this.toolbar.dropdownActions.length > 1) {
          return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, this.toolbar.dropdownAction, this.toolbar.dropdownActions, "", { actionRunner: this.toolbar.actionRunner, hoverDelegate: options.hoverDelegate });
        }
        return createActionViewItem(instantiationService, action, options);
      },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      menuOptions: {
        shouldForwardArgs: true
      }
    });
    this.disposables.add(this.toolbar.onDidChange(() => this.layout()));
    this.disposables.add(this.toolbar);
  }
  get input() {
    return this.model?.input;
  }
  set input(input) {
    if (input === this.input) {
      return;
    }
    this.clearValidation();
    this.element.classList.remove("synthetic-focus");
    this.repositoryDisposables.clear();
    this.repositoryIdContextKey.set(input?.repository.id);
    if (!input) {
      this.inputEditor.setModel(void 0);
      this.model = void 0;
      return;
    }
    const textModel = input.repository.provider.inputBoxTextModel;
    this.inputEditor.setModel(textModel);
    if (this.configurationService.getValue("editor.wordBasedSuggestions", { resource: textModel.uri }) !== "off") {
      this.configurationService.updateValue("editor.wordBasedSuggestions", "off", { resource: textModel.uri }, ConfigurationTarget.MEMORY);
    }
    const validationDelayer = new ThrottledDelayer(200);
    const validate = async () => {
      const position = this.inputEditor.getSelection()?.getStartPosition();
      const offset = position && textModel.getOffsetAt(position);
      const value = textModel.getValue();
      this.setValidation(await input.validateInput(value, offset || 0));
    };
    const triggerValidation = () => validationDelayer.trigger(validate);
    this.repositoryDisposables.add(validationDelayer);
    this.repositoryDisposables.add(this.inputEditor.onDidChangeCursorPosition(triggerValidation));
    const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
    const onEnter = Event.filter(this.inputEditor.onKeyDown, (e) => e.keyCode === KeyCode.Enter, this.repositoryDisposables);
    this.repositoryDisposables.add(onEnter(() => textModel.detectIndentation(opts.insertSpaces, opts.tabSize)));
    textModel.setValue(input.value);
    this.repositoryDisposables.add(input.onDidChange(({ value, reason }) => {
      const currentValue = textModel.getValue();
      if (value === currentValue) {
        return;
      }
      textModel.pushStackElement();
      textModel.pushEditOperations(null, [EditOperation.replaceMove(textModel.getFullModelRange(), value)], () => []);
      const position = reason === SCMInputChangeReason.HistoryPrevious ? textModel.getFullModelRange().getStartPosition() : textModel.getFullModelRange().getEndPosition();
      this.inputEditor.setPosition(position);
      this.inputEditor.revealPositionInCenterIfOutsideViewport(position);
    }));
    this.repositoryDisposables.add(input.onDidChangeFocus(() => this.focus()));
    this.repositoryDisposables.add(input.onDidChangeValidationMessage((e) => this.setValidation(e, { focus: true, timeout: true })));
    this.repositoryDisposables.add(input.onDidChangeValidateInput((e) => triggerValidation()));
    this.repositoryDisposables.add(input.onDidClearValidation(() => this.clearValidation()));
    this.repositoryDisposables.add(textModel.onDidChangeContent(() => {
      input.setValue(textModel.getValue(), true);
      triggerValidation();
    }));
    const accessibilityVerbosityConfig = observableConfigValue(
      AccessibilityVerbositySettingId.SourceControl,
      true,
      this.configurationService
    );
    const getAriaLabel = (placeholder, verbosity) => {
      verbosity = verbosity ?? accessibilityVerbosityConfig.get();
      if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
        return placeholder;
      }
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      return kbLabel ? localize("scmInput.accessibilityHelp", "{0}, Use {1} to open Source Control Accessibility Help.", placeholder, kbLabel) : localize("scmInput.accessibilityHelpNoKb", "{0}, Run the Open Accessibility Help command for more information.", placeholder);
    };
    const getPlaceholderText = () => {
      const binding = this.keybindingService.lookupKeybinding("scm.acceptInput");
      const label = binding ? binding.getLabel() : platform.isMacintosh ? "Cmd+Enter" : "Ctrl+Enter";
      return format(input.placeholder, label);
    };
    const updatePlaceholderText = () => {
      const placeholder = getPlaceholderText();
      const ariaLabel = getAriaLabel(placeholder);
      this.inputEditor.updateOptions({ ariaLabel, placeholder });
    };
    this.repositoryDisposables.add(input.onDidChangePlaceholder(updatePlaceholderText));
    this.repositoryDisposables.add(this.keybindingService.onDidUpdateKeybindings(updatePlaceholderText));
    this.repositoryDisposables.add(runOnChange(accessibilityVerbosityConfig, (verbosity) => {
      const placeholder = getPlaceholderText();
      const ariaLabel = getAriaLabel(placeholder, verbosity);
      this.inputEditor.updateOptions({ ariaLabel });
    }));
    updatePlaceholderText();
    let commitTemplate = "";
    this.repositoryDisposables.add(autorun((reader) => {
      if (!input.visible) {
        return;
      }
      const oldCommitTemplate = commitTemplate;
      commitTemplate = input.repository.provider.commitTemplate.read(reader);
      const value = textModel.getValue();
      if (value && value !== oldCommitTemplate) {
        return;
      }
      textModel.setValue(commitTemplate);
    }));
    const updateEnablement = (enabled) => {
      this.inputEditor.updateOptions({ readOnly: !enabled });
    };
    this.repositoryDisposables.add(input.onDidChangeEnablement((enabled) => updateEnablement(enabled)));
    updateEnablement(input.enabled);
    this.toolbar.setInput(input);
    this.model = { input, textModel };
  }
  get selections() {
    return this.inputEditor.getSelections();
  }
  set selections(selections) {
    if (selections) {
      this.inputEditor.setSelections(selections);
    }
  }
  setValidation(validation, options) {
    if (this._validationTimer) {
      clearTimeout(this._validationTimer);
      this._validationTimer = void 0;
    }
    this.validation = validation;
    this.renderValidation();
    if (options?.focus && !this.hasFocus()) {
      this.focus();
    }
    if (validation && options?.timeout) {
      this._validationTimer = setTimeout(() => this.setValidation(void 0), SCMInputWidget.ValidationTimeouts[validation.type]);
    }
  }
  getContentHeight() {
    const lineHeight = this.inputEditor.getOption(EditorOption.lineHeight);
    const { top, bottom } = this.inputEditor.getOption(EditorOption.padding);
    const inputMinLinesConfig = this.configurationService.getValue("scm.inputMinLineCount");
    const inputMinLines = typeof inputMinLinesConfig === "number" ? clamp(inputMinLinesConfig, 1, 50) : 1;
    const editorMinHeight = inputMinLines * lineHeight + top + bottom;
    const inputMaxLinesConfig = this.configurationService.getValue("scm.inputMaxLineCount");
    const inputMaxLines = typeof inputMaxLinesConfig === "number" ? clamp(inputMaxLinesConfig, 1, 50) : 10;
    const editorMaxHeight = inputMaxLines * lineHeight + top + bottom;
    return clamp(this.inputEditor.getContentHeight(), editorMinHeight, editorMaxHeight);
  }
  layout() {
    const editorHeight = this.getContentHeight();
    const toolbarWidth = this.getToolbarWidth();
    const dimension = new Dimension(this.element.clientWidth - toolbarWidth, editorHeight);
    if (dimension.width < 0) {
      this.lastLayoutWasTrash = true;
      return;
    }
    this.lastLayoutWasTrash = false;
    this.inputEditor.layout(dimension);
    this.renderValidation();
    const showInputActionButton = this.configurationService.getValue("scm.showInputActionButton") === true;
    this.toolbarContainer.classList.toggle("hidden", !showInputActionButton || this.toolbar?.isEmpty() === true);
    if (this.shouldFocusAfterLayout) {
      this.shouldFocusAfterLayout = false;
      this.focus();
    }
  }
  focus() {
    if (this.lastLayoutWasTrash) {
      this.lastLayoutWasTrash = false;
      this.shouldFocusAfterLayout = true;
      return;
    }
    this.inputEditor.focus();
    this.element.classList.add("synthetic-focus");
  }
  hasFocus() {
    return this.inputEditor.hasTextFocus();
  }
  onDidChangeEditorOptions() {
    this.inputEditor.updateOptions(this.inputEditorOptions.getEditorOptions());
  }
  renderValidation() {
    this.clearValidation();
    this.element.classList.toggle("validation-info", this.validation?.type === InputValidationType.Information);
    this.element.classList.toggle("validation-warning", this.validation?.type === InputValidationType.Warning);
    this.element.classList.toggle("validation-error", this.validation?.type === InputValidationType.Error);
    if (!this.validation || !this.inputEditor.hasTextFocus()) {
      return;
    }
    this.validationMessageContextKey.set(true);
    const disposables = new DisposableStore();
    this.validationContextView = this.contextViewService.showContextView({
      getAnchor: () => this.element,
      render: (container) => {
        this.element.style.borderBottomLeftRadius = "0";
        this.element.style.borderBottomRightRadius = "0";
        const validationContainer = append(container, $(".scm-editor-validation-container"));
        validationContainer.classList.toggle("validation-info", this.validation.type === InputValidationType.Information);
        validationContainer.classList.toggle("validation-warning", this.validation.type === InputValidationType.Warning);
        validationContainer.classList.toggle("validation-error", this.validation.type === InputValidationType.Error);
        validationContainer.style.width = `${this.element.clientWidth + 2}px`;
        const element = append(validationContainer, $(".scm-editor-validation"));
        const message = this.validation.message;
        if (typeof message === "string") {
          element.textContent = message;
        } else {
          const tracker = trackFocus(element);
          disposables.add(tracker);
          disposables.add(tracker.onDidFocus(() => this.validationHasFocus = true));
          disposables.add(tracker.onDidBlur(() => {
            this.validationHasFocus = false;
            this.element.style.borderBottomLeftRadius = "2px";
            this.element.style.borderBottomRightRadius = "2px";
            this.contextViewService.hideContextView();
          }));
          const renderedMarkdown = this.markdownRendererService.render(message, {
            actionHandler: (link, mdStr) => {
              openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
              this.element.style.borderBottomLeftRadius = "2px";
              this.element.style.borderBottomRightRadius = "2px";
              this.contextViewService.hideContextView();
            }
          });
          disposables.add(renderedMarkdown);
          element.appendChild(renderedMarkdown.element);
        }
        const actionsContainer = append(validationContainer, $(".scm-editor-validation-actions"));
        const actionbar = new ActionBar(actionsContainer);
        const action = new Action("scmInputWidget.validationMessage.close", localize("label.close", "Close"), ThemeIcon.asClassName(Codicon.close), true, () => {
          this.contextViewService.hideContextView();
          this.element.style.borderBottomLeftRadius = "2px";
          this.element.style.borderBottomRightRadius = "2px";
        });
        disposables.add(actionbar);
        actionbar.push(action, { icon: true, label: false });
        return Disposable.None;
      },
      onHide: () => {
        this.validationHasFocus = false;
        this.element.style.borderBottomLeftRadius = "2px";
        this.element.style.borderBottomRightRadius = "2px";
        disposables.dispose();
      },
      anchorAlignment: AnchorAlignment.LEFT
    });
  }
  getToolbarWidth() {
    const showInputActionButton = this.configurationService.getValue("scm.showInputActionButton");
    if (!this.toolbar || !showInputActionButton || this.toolbar?.isEmpty() === true) {
      return 0;
    }
    return this.toolbar.dropdownActions.length === 0 ? 26 : 39;
  }
  clearValidation() {
    this.validationContextView?.close();
    this.validationContextView = void 0;
    this.validationHasFocus = false;
    this.validationMessageContextKey.set(false);
  }
  dispose() {
    this.input = void 0;
    this.repositoryDisposables.dispose();
    this.clearValidation();
    clearTimeout(this._validationTimer);
    this.disposables.dispose();
  }
};
SCMInputWidget.ValidationTimeouts = {
  [InputValidationType.Information]: 5e3,
  [InputValidationType.Warning]: 8e3,
  [InputValidationType.Error]: 1e4
};
SCMInputWidget = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ISCMViewService),
  __decorateParam(8, IContextViewService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IAccessibilityService),
  __decorateParam(11, IMarkdownRendererService)
], SCMInputWidget);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "scm.input.triggerSetup" /* SetupAction */,
      title: localize("scmInputGenerateCommitMessage", "Generate Commit Message"),
      icon: Codicon.sparkle,
      f1: false,
      menu: {
        id: MenuId.SCMInputBox,
        when: ContextKeyExpr.and(
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate(),
          ChatContextKeys.Setup.completed.negate(),
          ContextKeyExpr.equals("scmProvider", "git")
        )
      }
    });
  }
  async run(accessor, ...args) {
    const commandService = accessor.get(ICommandService);
    const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
    if (!result) {
      return;
    }
    const command = product.defaultChatAgent?.generateCommitMessageCommand;
    if (!command) {
      return;
    }
    await commandService.executeCommand(command, ...args);
  }
});
setupSimpleEditorSelectionStyling(".scm-view .scm-editor-container");
export {
  SCMInputContextKeys,
  SCMInputWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtSW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2NtLmNzcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXBwZW5kLCAkLCBEaW1lbnNpb24sIHRyYWNrRm9jdXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElucHV0VmFsaWRhdGlvblR5cGUsIElTQ01JbnB1dCwgSUlucHV0VmFsaWRhdGlvbiwgSVNDTVZpZXdTZXJ2aWNlLCBTQ01JbnB1dENoYW5nZVJlYXNvbiwgSVNDTUlucHV0VmFsdWVQcm92aWRlckNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSwgSUNvbnRleHRNZW51U2VydmljZSwgSU9wZW5Db250ZXh0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleSwgQ29udGV4dEtleUV4cHIsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1lbnVJdGVtQWN0aW9uLCBJTWVudVNlcnZpY2UsIHJlZ2lzdGVyQWN0aW9uMiwgTWVudUlkLCBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBBY3Rpb25SdW5uZXIsIEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQsIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVFZGl0b3JPcHRpb25zLCBzZXR1cFNpbXBsZUVkaXRvclNlbGVjdGlvblN0eWxpbmcgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1lbnVQcmV2ZW50ZXIgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvbWVudVByZXZlbnRlci5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zZWxlY3Rpb25DbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgRWRpdG9yRGljdGF0aW9uIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL2RpY3RhdGlvbi9lZGl0b3JEaWN0YXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29udGV4dG1lbnUvYnJvd3Nlci9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBmb3JtYXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvckRldGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29sb3JQaWNrZXIvYnJvd3Nlci9jb2xvckRldGVjdG9yLmpzJztcbmltcG9ydCB7IExpbmtEZXRlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2xpbmtzL2Jyb3dzZXIvbGlua3MuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0ZPTlRfRkFNSUxZIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2ZvbnRzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSwgb3BlbkxpbmtGcm9tTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRHJhZ0FuZERyb3BDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IENvcHlQYXN0ZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IERyb3BJbnRvRWRpdG9yQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2Ryb3BJbnRvRWRpdG9yQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvaW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IEZvcm1hdE9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBFZGl0b3JPcHRpb25zLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgSU1lbnVXb3JrYmVuY2hUb29sQmFyT3B0aW9ucywgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERyb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9kcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2NvbnRlbnRIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgR2x5cGhIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2dseXBoSG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBQbGFjZWhvbGRlclRleHRDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9wbGFjZWhvbGRlclRleHQvYnJvd3Nlci9wbGFjZWhvbGRlclRleHRDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX1NVUFBPUlRfQU5PTllNT1VTX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcblxuZXhwb3J0IGNvbnN0IFNDTUlucHV0Q29udGV4dEtleXMgPSB7XG5cdFNDTUlucHV0SGFzVmFsaWRhdGlvbk1lc3NhZ2U6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzY21JbnB1dEhhc1ZhbGlkYXRpb25NZXNzYWdlJywgZmFsc2UpLFxufTtcblxuY29uc3QgZW51bSBTQ01JbnB1dFdpZGdldENvbW1hbmRJZCB7XG5cdENhbmNlbEFjdGlvbiA9ICdzY20uaW5wdXQuY2FuY2VsQWN0aW9uJyxcblx0U2V0dXBBY3Rpb24gPSAnc2NtLmlucHV0LnRyaWdnZXJTZXR1cCdcbn1cblxuY29uc3QgZW51bSBTQ01JbnB1dFdpZGdldFN0b3JhZ2VLZXkge1xuXHRMYXN0QWN0aW9uSWQgPSAnc2NtLmlucHV0Lmxhc3RBY3Rpb25JZCdcbn1cblxuY2xhc3MgU0NNSW5wdXRXaWRnZXRBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3J1bm5pbmdBY3Rpb25zID0gbmV3IFNldDxJQWN0aW9uPigpO1xuXHRwdWJsaWMgZ2V0IHJ1bm5pbmdBY3Rpb25zKCk6IFNldDxJQWN0aW9uPiB7IHJldHVybiB0aGlzLl9ydW5uaW5nQWN0aW9uczsgfVxuXG5cdHByaXZhdGUgX2N0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnB1dDogSVNDTUlucHV0LFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBDYW5jZWwgcHJldmlvdXMgYWN0aW9uXG5cdFx0XHRpZiAodGhpcy5ydW5uaW5nQWN0aW9ucy5zaXplICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2N0cz8uY2FuY2VsKCk7XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gU0NNSW5wdXRXaWRnZXRDb21tYW5kSWQuQ2FuY2VsQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSBhY3Rpb24gY29udGV4dFxuXHRcdFx0Y29uc3QgY29udGV4dDogSVNDTUlucHV0VmFsdWVQcm92aWRlckNvbnRleHRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmlucHV0LnJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzKSB7XG5cdFx0XHRcdGNvbnRleHQucHVzaCh7XG5cdFx0XHRcdFx0cmVzb3VyY2VHcm91cElkOiBncm91cC5pZCxcblx0XHRcdFx0XHRyZXNvdXJjZXM6IFsuLi5ncm91cC5yZXNvdXJjZXMubWFwKHIgPT4gci5zb3VyY2VVcmkpXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUnVuIGFjdGlvblxuXHRcdFx0dGhpcy5fcnVubmluZ0FjdGlvbnMuYWRkKGFjdGlvbik7XG5cdFx0XHR0aGlzLl9jdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oLi4uW3RoaXMuaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpLCBjb250ZXh0LCB0aGlzLl9jdHMudG9rZW5dKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcnVubmluZ0FjdGlvbnMuZGVsZXRlKGFjdGlvbik7XG5cblx0XHRcdC8vIFNhdmUgbGFzdCBhY3Rpb25cblx0XHRcdGlmICh0aGlzLl9ydW5uaW5nQWN0aW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbklkID0gYWN0aW9uLmlkID09PSBTQ01JbnB1dFdpZGdldENvbW1hbmRJZC5TZXR1cEFjdGlvblxuXHRcdFx0XHRcdD8gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5nZW5lcmF0ZUNvbW1pdE1lc3NhZ2VDb21tYW5kID8/IGFjdGlvbi5pZFxuXHRcdFx0XHRcdDogYWN0aW9uLmlkO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNDTUlucHV0V2lkZ2V0U3RvcmFnZUtleS5MYXN0QWN0aW9uSWQsIGFjdGlvbklkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxufVxuXG5jbGFzcyBTQ01JbnB1dFdpZGdldFRvb2xiYXIgZXh0ZW5kcyBXb3JrYmVuY2hUb29sQmFyIHtcblxuXHRwcml2YXRlIF9kcm9wZG93bkFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRnZXQgZHJvcGRvd25BY3Rpb25zKCk6IElBY3Rpb25bXSB7IHJldHVybiB0aGlzLl9kcm9wZG93bkFjdGlvbnM7IH1cblxuXHRwcml2YXRlIF9kcm9wZG93bkFjdGlvbjogSUFjdGlvbjtcblx0Z2V0IGRyb3Bkb3duQWN0aW9uKCk6IElBY3Rpb24geyByZXR1cm4gdGhpcy5fZHJvcGRvd25BY3Rpb247IH1cblxuXHRwcml2YXRlIF9jYW5jZWxBY3Rpb246IElBY3Rpb247XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG9wdGlvbnM6IElNZW51V29ya2JlbmNoVG9vbEJhck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250YWluZXIsIG9wdGlvbnMsIG1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZHJvcGRvd25BY3Rpb24gPSBuZXcgQWN0aW9uKFxuXHRcdFx0J3NjbUlucHV0TW9yZUFjdGlvbnMnLFxuXHRcdFx0bG9jYWxpemUoJ3NjbUlucHV0TW9yZUFjdGlvbnMnLCBcIk1vcmUgQWN0aW9ucy4uLlwiKSxcblx0XHRcdCdjb2RpY29uLWNoZXZyb24tZG93bicpO1xuXG5cdFx0dGhpcy5fY2FuY2VsQWN0aW9uID0gbmV3IE1lbnVJdGVtQWN0aW9uKHtcblx0XHRcdGlkOiBTQ01JbnB1dFdpZGdldENvbW1hbmRJZC5DYW5jZWxBY3Rpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NjbUlucHV0Q2FuY2VsQWN0aW9uJywgXCJDYW5jZWxcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnN0b3BDaXJjbGUsXG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjb250ZXh0S2V5U2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIHNldElucHV0KGlucHV0OiBJU0NNSW5wdXQpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFsnc2NtUHJvdmlkZXInLCBpbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLnByb3ZpZGVySWRdLFxuXHRcdFx0WydzY21Qcm92aWRlclJvb3RVcmknLCBpbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmk/LnRvU3RyaW5nKCldLFxuXHRcdFx0WydzY21Qcm92aWRlckhhc1Jvb3RVcmknLCAhIWlucHV0LnJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaV1cblx0XHRdKTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZS5hZGQodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5TQ01JbnB1dEJveCwgY29udGV4dEtleVNlcnZpY2UsIHsgZW1pdEV2ZW50c0ZvclN1Ym1lbnVDaGFuZ2VzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IGlzRW5hYmxlZCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdHJldHVybiBpbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcy5zb21lKGcgPT4gZy5yZXNvdXJjZXMubGVuZ3RoID4gMCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHVwZGF0ZVRvb2xiYXIgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGlvbi5lbmFibGVkID0gaXNFbmFibGVkKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kcm9wZG93bkFjdGlvbi5lbmFibGVkID0gaXNFbmFibGVkKCk7XG5cblx0XHRcdGxldCBwcmltYXJ5QWN0aW9uOiBJQWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoKHRoaXMuYWN0aW9uUnVubmVyIGFzIFNDTUlucHV0V2lkZ2V0QWN0aW9uUnVubmVyKS5ydW5uaW5nQWN0aW9ucy5zaXplICE9PSAwKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb24gPSB0aGlzLl9jYW5jZWxBY3Rpb247XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb24gPSBhY3Rpb25zWzBdO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgbGFzdEFjdGlvbklkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU0NNSW5wdXRXaWRnZXRTdG9yYWdlS2V5Lkxhc3RBY3Rpb25JZCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICcnKTtcblx0XHRcdFx0cHJpbWFyeUFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEuaWQgPT09IGxhc3RBY3Rpb25JZCkgPz8gYWN0aW9uc1swXTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZHJvcGRvd25BY3Rpb25zID0gYWN0aW9ucy5sZW5ndGggPT09IDEgPyBbXSA6IGFjdGlvbnM7XG5cdFx0XHRzdXBlci5zZXRBY3Rpb25zKHByaW1hcnlBY3Rpb24gPyBbcHJpbWFyeUFjdGlvbl0gOiBbXSwgW10pO1xuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlLmFkZChtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZVRvb2xiYXIoKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlLmFkZChpbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLm9uRGlkQ2hhbmdlUmVzb3VyY2VzKCgpID0+IHVwZGF0ZVRvb2xiYXIoKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlLmFkZCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFNDTUlucHV0V2lkZ2V0U3RvcmFnZUtleS5MYXN0QWN0aW9uSWQsIHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlKSgoKSA9PiB1cGRhdGVUb29sYmFyKCkpKTtcblxuXHRcdHRoaXMuYWN0aW9uUnVubmVyID0gdGhpcy5fZGlzcG9zYWJsZXMudmFsdWUuYWRkKG5ldyBTQ01JbnB1dFdpZGdldEFjdGlvblJ1bm5lcihpbnB1dCwgdGhpcy5zdG9yYWdlU2VydmljZSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlLmFkZCh0aGlzLmFjdGlvblJ1bm5lci5vbldpbGxSdW4oZSA9PiB7XG5cdFx0XHRpZiAoKHRoaXMuYWN0aW9uUnVubmVyIGFzIFNDTUlucHV0V2lkZ2V0QWN0aW9uUnVubmVyKS5ydW5uaW5nQWN0aW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHN1cGVyLnNldEFjdGlvbnMoW3RoaXMuX2NhbmNlbEFjdGlvbl0sIFtdKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy52YWx1ZS5hZGQodGhpcy5hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cdFx0XHRpZiAoKHRoaXMuYWN0aW9uUnVubmVyIGFzIFNDTUlucHV0V2lkZ2V0QWN0aW9uUnVubmVyKS5ydW5uaW5nQWN0aW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHVwZGF0ZVRvb2xiYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR1cGRhdGVUb29sYmFyKCk7XG5cdH1cbn1cblxuY2xhc3MgU0NNSW5wdXRXaWRnZXRFZGl0b3JPcHRpb25zIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0SW5wdXRGb250RmFtaWx5ID0gREVGQVVMVF9GT05UX0ZBTUlMWTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkge1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gRXZlbnQuZmlsdGVyKFxuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRlID0+IHtcblx0XHRcdFx0cmV0dXJuIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5hY2Nlc3NpYmlsaXR5U3VwcG9ydCcpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmN1cnNvckJsaW5raW5nJykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuY3Vyc29yU3R5bGUnKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5jdXJzb3JXaWR0aCcpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkJykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuZm9udEZhbWlseScpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnJvdW5kZWRTZWxlY3Rpb24nKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5ydWxlcnMnKSB8fFxuXHRcdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci53b3JkV3JhcCcpIHx8XG5cdFx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLndvcmRTZWdtZW50ZXJMb2NhbGVzJykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uaW5wdXRGb250RmFtaWx5JykgfHxcblx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uaW5wdXRGb250U2l6ZScpO1xuXHRcdFx0fSxcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzXG5cdFx0KTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cdH1cblxuXHRnZXRFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zKCk6IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdC4uLnRoaXMuZ2V0RWRpdG9yT3B0aW9ucygpLFxuXHRcdFx0ZHJhZ0FuZERyb3A6IHRydWUsXG5cdFx0XHRkcm9wSW50b0VkaXRvcjogeyBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XHRmb3JtYXRPblR5cGU6IHRydWUsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogNixcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IHRoaXMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSxcblx0XHRcdHBhZGRpbmc6IHsgdG9wOiAyLCBib3R0b206IDIgfSxcblx0XHRcdHF1aWNrU3VnZ2VzdGlvbnM6IGZhbHNlLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ25vbmUnLFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0dmVydGljYWw6ICdoaWRkZW4nXG5cdFx0XHR9LFxuXHRcdFx0d3JhcHBpbmdJbmRlbnQ6ICdub25lJyxcblx0XHRcdHdyYXBwaW5nU3RyYXRlZ3k6ICdhZHZhbmNlZCcsXG5cdFx0fTtcblx0fVxuXG5cdGdldEVkaXRvck9wdGlvbnMoKTogSUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSB0aGlzLl9nZXRFZGl0b3JGb250RmFtaWx5KCk7XG5cdFx0Y29uc3QgZm9udFNpemUgPSB0aGlzLl9nZXRFZGl0b3JGb250U2l6ZSgpO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9nZXRFZGl0b3JMaW5lSGVpZ2h0KGZvbnRTaXplKTtcblx0XHRjb25zdCB3b3JkU2VnbWVudGVyTG9jYWxlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgc3RyaW5nW10+KCdlZGl0b3Iud29yZFNlZ21lbnRlckxvY2FsZXMnKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U3VwcG9ydCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2F1dG8nIHwgJ29mZicgfCAnb24nPignZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0Jyk7XG5cdFx0Y29uc3QgY3Vyc29yQmxpbmtpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdibGluaycgfCAnc21vb3RoJyB8ICdwaGFzZScgfCAnZXhwYW5kJyB8ICdzb2xpZCc+KCdlZGl0b3IuY3Vyc29yQmxpbmtpbmcnKTtcblx0XHRjb25zdCBjdXJzb3JTdHlsZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnNbJ2N1cnNvclN0eWxlJ10+KCdlZGl0b3IuY3Vyc29yU3R5bGUnKTtcblx0XHRjb25zdCBjdXJzb3JXaWR0aCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnNbJ2N1cnNvcldpZHRoJ10+KCdlZGl0b3IuY3Vyc29yV2lkdGgnKSA/PyAxO1xuXHRcdGNvbnN0IGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZWRpdG9yLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkJykgPT09IHRydWU7XG5cdFx0Y29uc3Qgcm91bmRlZFNlbGVjdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5yb3VuZGVkU2VsZWN0aW9uJykgPT09IHRydWU7XG5cblx0XHRyZXR1cm4geyAuLi50aGlzLl9nZXRFZGl0b3JMYW5ndWFnZUNvbmZpZ3VyYXRpb24oKSwgYWNjZXNzaWJpbGl0eVN1cHBvcnQsIGN1cnNvckJsaW5raW5nLCBjdXJzb3JTdHlsZSwgY3Vyc29yV2lkdGgsIGZvbnRGYW1pbHksIGZvbnRTaXplLCBsaW5lSGVpZ2h0LCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCwgcm91bmRlZFNlbGVjdGlvbiwgd29yZFNlZ21lbnRlckxvY2FsZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVkaXRvckZvbnRGYW1pbHkoKTogc3RyaW5nIHtcblx0XHRjb25zdCBpbnB1dEZvbnRGYW1pbHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3NjbS5pbnB1dEZvbnRGYW1pbHknKS50cmltKCk7XG5cblx0XHRpZiAoaW5wdXRGb250RmFtaWx5LnRvTG93ZXJDYXNlKCkgPT09ICdlZGl0b3InKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdlZGl0b3IuZm9udEZhbWlseScpLnRyaW0oKTtcblx0XHR9XG5cblx0XHRpZiAoaW5wdXRGb250RmFtaWx5Lmxlbmd0aCAhPT0gMCAmJiBpbnB1dEZvbnRGYW1pbHkudG9Mb3dlckNhc2UoKSAhPT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHRyZXR1cm4gaW5wdXRGb250RmFtaWx5O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRJbnB1dEZvbnRGYW1pbHk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JGb250U2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3NjbS5pbnB1dEZvbnRTaXplJyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JMYW5ndWFnZUNvbmZpZ3VyYXRpb24oKTogSUVkaXRvck9wdGlvbnMge1xuXHRcdC8vIGVkaXRvci5ydWxlcnNcblx0XHRjb25zdCBydWxlcnNDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoJ2VkaXRvci5ydWxlcnMnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogJ3NjbWlucHV0JyB9KTtcblx0XHRjb25zdCBydWxlcnMgPSBydWxlcnNDb25maWcub3ZlcnJpZGVJZGVudGlmaWVycz8uaW5jbHVkZXMoJ3NjbWlucHV0JykgPyBFZGl0b3JPcHRpb25zLnJ1bGVycy52YWxpZGF0ZShydWxlcnNDb25maWcudmFsdWUpIDogW107XG5cblx0XHQvLyBlZGl0b3Iud29yZFdyYXBcblx0XHRjb25zdCB3b3JkV3JhcENvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJywgeyBvdmVycmlkZUlkZW50aWZpZXI6ICdzY21pbnB1dCcgfSk7XG5cdFx0Y29uc3Qgd29yZFdyYXAgPSB3b3JkV3JhcENvbmZpZy5vdmVycmlkZUlkZW50aWZpZXJzPy5pbmNsdWRlcygnc2NtaW5wdXQnKSA/IEVkaXRvck9wdGlvbnMud29yZFdyYXAudmFsaWRhdGUod29yZFdyYXBDb25maWcudmFsdWUpIDogJ29uJztcblxuXHRcdHJldHVybiB7IHJ1bGVycywgd29yZFdyYXAgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVkaXRvckxpbmVIZWlnaHQoZm9udFNpemU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQoZm9udFNpemUgKiAxLjUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFNDTUlucHV0V2lkZ2V0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBWYWxpZGF0aW9uVGltZW91dHM6IHsgW3NldmVyaXR5OiBudW1iZXJdOiBudW1iZXIgfSA9IHtcblx0XHRbSW5wdXRWYWxpZGF0aW9uVHlwZS5JbmZvcm1hdGlvbl06IDUwMDAsXG5cdFx0W0lucHV0VmFsaWRhdGlvblR5cGUuV2FybmluZ106IDgwMDAsXG5cdFx0W0lucHV0VmFsaWRhdGlvblR5cGUuRXJyb3JdOiAxMDAwMFxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGVkaXRvckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXRFZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXRFZGl0b3JPcHRpb25zOiBTQ01JbnB1dFdpZGdldEVkaXRvck9wdGlvbnM7XG5cdHByaXZhdGUgdG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9vbGJhcjogU0NNSW5wdXRXaWRnZXRUb29sYmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgbW9kZWw6IHsgcmVhZG9ubHkgaW5wdXQ6IElTQ01JbnB1dDsgcmVhZG9ubHkgdGV4dE1vZGVsOiBJVGV4dE1vZGVsIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVwb3NpdG9yeUlkQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSB2YWxpZGF0aW9uTWVzc2FnZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlcG9zaXRvcnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHZhbGlkYXRpb246IElJbnB1dFZhbGlkYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdmFsaWRhdGlvbkNvbnRleHRWaWV3OiBJT3BlbkNvbnRleHRWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZhbGlkYXRpb25IYXNGb2N1czogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF92YWxpZGF0aW9uVGltZXI6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cblx0Ly8gVGhpcyBpcyBkdWUgdG8gXCJTZXR1cCBoZWlnaHQgY2hhbmdlIGxpc3RlbmVyIG9uIG5leHQgdGlja1wiIGFib3ZlXG5cdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDgwNjdcblx0cHJpdmF0ZSBsYXN0TGF5b3V0V2FzVHJhc2ggPSBmYWxzZTtcblx0cHJpdmF0ZSBzaG91bGRGb2N1c0FmdGVyTGF5b3V0ID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0OiBFdmVudDx2b2lkPjtcblxuXHRnZXQgaW5wdXQoKTogSVNDTUlucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbD8uaW5wdXQ7XG5cdH1cblxuXHRzZXQgaW5wdXQoaW5wdXQ6IElTQ01JbnB1dCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChpbnB1dCA9PT0gdGhpcy5pbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2xlYXJWYWxpZGF0aW9uKCk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3N5bnRoZXRpYy1mb2N1cycpO1xuXG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlJZENvbnRleHRLZXkuc2V0KGlucHV0Py5yZXBvc2l0b3J5LmlkKTtcblxuXHRcdGlmICghaW5wdXQpIHtcblx0XHRcdHRoaXMuaW5wdXRFZGl0b3Iuc2V0TW9kZWwodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMubW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gaW5wdXQucmVwb3NpdG9yeS5wcm92aWRlci5pbnB1dEJveFRleHRNb2RlbDtcblx0XHR0aGlzLmlucHV0RWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLndvcmRCYXNlZFN1Z2dlc3Rpb25zJywgeyByZXNvdXJjZTogdGV4dE1vZGVsLnVyaSB9KSAhPT0gJ29mZicpIHtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2VkaXRvci53b3JkQmFzZWRTdWdnZXN0aW9ucycsICdvZmYnLCB7IHJlc291cmNlOiB0ZXh0TW9kZWwudXJpIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0aW9uXG5cdFx0Y29uc3QgdmFsaWRhdGlvbkRlbGF5ZXIgPSBuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPigyMDApO1xuXHRcdGNvbnN0IHZhbGlkYXRlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLmlucHV0RWRpdG9yLmdldFNlbGVjdGlvbigpPy5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSBwb3NpdGlvbiAmJiB0ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQocG9zaXRpb24pO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0ZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblxuXHRcdFx0dGhpcy5zZXRWYWxpZGF0aW9uKGF3YWl0IGlucHV0LnZhbGlkYXRlSW5wdXQodmFsdWUsIG9mZnNldCB8fCAwKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRyaWdnZXJWYWxpZGF0aW9uID0gKCkgPT4gdmFsaWRhdGlvbkRlbGF5ZXIudHJpZ2dlcih2YWxpZGF0ZSk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKHZhbGlkYXRpb25EZWxheWVyKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKHRyaWdnZXJWYWxpZGF0aW9uKSk7XG5cblx0XHQvLyBBZGFwdGl2ZSBpbmRlbnRhdGlvbiBydWxlc1xuXHRcdGNvbnN0IG9wdHMgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRDcmVhdGlvbk9wdGlvbnModGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSwgdGV4dE1vZGVsLnVyaSwgdGV4dE1vZGVsLmlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRjb25zdCBvbkVudGVyID0gRXZlbnQuZmlsdGVyKHRoaXMuaW5wdXRFZGl0b3Iub25LZXlEb3duLCBlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciwgdGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChvbkVudGVyKCgpID0+IHRleHRNb2RlbC5kZXRlY3RJbmRlbnRhdGlvbihvcHRzLmluc2VydFNwYWNlcywgb3B0cy50YWJTaXplKSkpO1xuXG5cdFx0Ly8gS2VlcCBtb2RlbCBpbiBzeW5jIHdpdGggQVBJXG5cdFx0dGV4dE1vZGVsLnNldFZhbHVlKGlucHV0LnZhbHVlKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2UoKHsgdmFsdWUsIHJlYXNvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSB0ZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gY3VycmVudFZhbHVlKSB7IC8vIGNpcmN1aXQgYnJlYWtlclxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRleHRNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHR0ZXh0TW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFtFZGl0T3BlcmF0aW9uLnJlcGxhY2VNb3ZlKHRleHRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB2YWx1ZSldLCAoKSA9PiBbXSk7XG5cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gcmVhc29uID09PSBTQ01JbnB1dENoYW5nZVJlYXNvbi5IaXN0b3J5UHJldmlvdXNcblx0XHRcdFx0PyB0ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKS5nZXRTdGFydFBvc2l0aW9uKClcblx0XHRcdFx0OiB0ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKS5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChwb3NpdGlvbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHRoaXMuZm9jdXMoKSkpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZENoYW5nZVZhbGlkYXRpb25NZXNzYWdlKChlKSA9PiB0aGlzLnNldFZhbGlkYXRpb24oZSwgeyBmb2N1czogdHJ1ZSwgdGltZW91dDogdHJ1ZSB9KSkpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZENoYW5nZVZhbGlkYXRlSW5wdXQoKGUpID0+IHRyaWdnZXJWYWxpZGF0aW9uKCkpKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDbGVhclZhbGlkYXRpb24oKCkgPT4gdGhpcy5jbGVhclZhbGlkYXRpb24oKSkpO1xuXG5cdFx0Ly8gS2VlcCBBUEkgaW4gc3luYyB3aXRoIG1vZGVsIGFuZCB2YWxpZGF0ZVxuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZCh0ZXh0TW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdGlucHV0LnNldFZhbHVlKHRleHRNb2RlbC5nZXRWYWx1ZSgpLCB0cnVlKTtcblx0XHRcdHRyaWdnZXJWYWxpZGF0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQXJpYSBsYWJlbCAmIHBsYWNlaG9sZGVyIHRleHRcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5VmVyYm9zaXR5Q29uZmlnID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKFxuXHRcdFx0QWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Tb3VyY2VDb250cm9sLCB0cnVlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGdldEFyaWFMYWJlbCA9IChwbGFjZWhvbGRlcjogc3RyaW5nLCB2ZXJib3NpdHk/OiBib29sZWFuKSA9PiB7XG5cdFx0XHR2ZXJib3NpdHkgPSB2ZXJib3NpdHkgPz8gYWNjZXNzaWJpbGl0eVZlcmJvc2l0eUNvbmZpZy5nZXQoKTtcblxuXHRcdFx0aWYgKCF2ZXJib3NpdHkgfHwgIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gcGxhY2Vob2xkZXI7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGtiTGFiZWwgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHApPy5nZXRMYWJlbCgpO1xuXHRcdFx0cmV0dXJuIGtiTGFiZWxcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2NtSW5wdXQuYWNjZXNzaWJpbGl0eUhlbHAnLCBcInswfSwgVXNlIHsxfSB0byBvcGVuIFNvdXJjZSBDb250cm9sIEFjY2Vzc2liaWxpdHkgSGVscC5cIiwgcGxhY2Vob2xkZXIsIGtiTGFiZWwpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3NjbUlucHV0LmFjY2Vzc2liaWxpdHlIZWxwTm9LYicsIFwiezB9LCBSdW4gdGhlIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIsIHBsYWNlaG9sZGVyKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0UGxhY2Vob2xkZXJUZXh0ID0gKCk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBiaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdzY20uYWNjZXB0SW5wdXQnKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gYmluZGluZyA/IGJpbmRpbmcuZ2V0TGFiZWwoKSA6IChwbGF0Zm9ybS5pc01hY2ludG9zaCA/ICdDbWQrRW50ZXInIDogJ0N0cmwrRW50ZXInKTtcblx0XHRcdHJldHVybiBmb3JtYXQoaW5wdXQucGxhY2Vob2xkZXIsIGxhYmVsKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlUGxhY2Vob2xkZXJUZXh0ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBnZXRQbGFjZWhvbGRlclRleHQoKTtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IGdldEFyaWFMYWJlbChwbGFjZWhvbGRlcik7XG5cblx0XHRcdHRoaXMuaW5wdXRFZGl0b3IudXBkYXRlT3B0aW9ucyh7IGFyaWFMYWJlbCwgcGxhY2Vob2xkZXIgfSk7XG5cdFx0fTtcblxuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZENoYW5nZVBsYWNlaG9sZGVyKHVwZGF0ZVBsYWNlaG9sZGVyVGV4dCkpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZCh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3ModXBkYXRlUGxhY2Vob2xkZXJUZXh0KSk7XG5cblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQocnVuT25DaGFuZ2UoYWNjZXNzaWJpbGl0eVZlcmJvc2l0eUNvbmZpZywgdmVyYm9zaXR5ID0+IHtcblx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gZ2V0UGxhY2Vob2xkZXJUZXh0KCk7XG5cdFx0XHRjb25zdCBhcmlhTGFiZWwgPSBnZXRBcmlhTGFiZWwocGxhY2Vob2xkZXIsIHZlcmJvc2l0eSk7XG5cblx0XHRcdHRoaXMuaW5wdXRFZGl0b3IudXBkYXRlT3B0aW9ucyh7IGFyaWFMYWJlbCB9KTtcblx0XHR9KSk7XG5cblx0XHR1cGRhdGVQbGFjZWhvbGRlclRleHQoKTtcblxuXHRcdC8vIFVwZGF0ZSBpbnB1dCB0ZW1wbGF0ZVxuXHRcdGxldCBjb21taXRUZW1wbGF0ZSA9ICcnO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIWlucHV0LnZpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvbGRDb21taXRUZW1wbGF0ZSA9IGNvbW1pdFRlbXBsYXRlO1xuXHRcdFx0Y29tbWl0VGVtcGxhdGUgPSBpbnB1dC5yZXBvc2l0b3J5LnByb3ZpZGVyLmNvbW1pdFRlbXBsYXRlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgdmFsdWUgPSB0ZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRcdGlmICh2YWx1ZSAmJiB2YWx1ZSAhPT0gb2xkQ29tbWl0VGVtcGxhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXh0TW9kZWwuc2V0VmFsdWUoY29tbWl0VGVtcGxhdGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBpbnB1dCBlbmFibGVtZW50XG5cdFx0Y29uc3QgdXBkYXRlRW5hYmxlbWVudCA9IChlbmFibGVkOiBib29sZWFuKSA9PiB7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogIWVuYWJsZWQgfSk7XG5cdFx0fTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRDaGFuZ2VFbmFibGVtZW50KGVuYWJsZWQgPT4gdXBkYXRlRW5hYmxlbWVudChlbmFibGVkKSkpO1xuXHRcdHVwZGF0ZUVuYWJsZW1lbnQoaW5wdXQuZW5hYmxlZCk7XG5cblx0XHQvLyBUb29sYmFyXG5cdFx0dGhpcy50b29sYmFyLnNldElucHV0KGlucHV0KTtcblxuXHRcdC8vIFNhdmUgbW9kZWxcblx0XHR0aGlzLm1vZGVsID0geyBpbnB1dCwgdGV4dE1vZGVsIH07XG5cdH1cblxuXHRnZXQgc2VsZWN0aW9ucygpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmlucHV0RWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0fVxuXG5cdHNldCBzZWxlY3Rpb25zKHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgbnVsbCkge1xuXHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRWYWxpZGF0aW9uKHZhbGlkYXRpb246IElJbnB1dFZhbGlkYXRpb24gfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IGZvY3VzPzogYm9vbGVhbjsgdGltZW91dD86IGJvb2xlYW4gfSkge1xuXHRcdGlmICh0aGlzLl92YWxpZGF0aW9uVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl92YWxpZGF0aW9uVGltZXIpO1xuXHRcdFx0dGhpcy5fdmFsaWRhdGlvblRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsaWRhdGlvbiA9IHZhbGlkYXRpb247XG5cdFx0dGhpcy5yZW5kZXJWYWxpZGF0aW9uKCk7XG5cblx0XHRpZiAob3B0aW9ucz8uZm9jdXMgJiYgIXRoaXMuaGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblxuXHRcdGlmICh2YWxpZGF0aW9uICYmIG9wdGlvbnM/LnRpbWVvdXQpIHtcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25UaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5zZXRWYWxpZGF0aW9uKHVuZGVmaW5lZCksIFNDTUlucHV0V2lkZ2V0LlZhbGlkYXRpb25UaW1lb3V0c1t2YWxpZGF0aW9uLnR5cGVdKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20tZWRpdG9yJykpO1xuXHRcdHRoaXMuZWRpdG9yQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLnNjbS1lZGl0b3ItY29udGFpbmVyJykpO1xuXHRcdHRoaXMudG9vbGJhckNvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5zY20tZWRpdG9yLXRvb2xiYXInKSk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdHRoaXMucmVwb3NpdG9yeUlkQ29udGV4dEtleSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdzY21SZXBvc2l0b3J5JywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnZhbGlkYXRpb25NZXNzYWdlQ29udGV4dEtleSA9IFNDTUlucHV0Q29udGV4dEtleXMuU0NNSW5wdXRIYXNWYWxpZGF0aW9uTWVzc2FnZS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmlucHV0RWRpdG9yT3B0aW9ucyA9IG5ldyBTQ01JbnB1dFdpZGdldEVkaXRvck9wdGlvbnMob3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvck9wdGlvbnMub25EaWRDaGFuZ2UodGhpcy5vbkRpZENoYW5nZUVkaXRvck9wdGlvbnMsIHRoaXMpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0RWRpdG9yT3B0aW9ucyk7XG5cblx0XHRjb25zdCBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdFx0Y29udHJpYnV0aW9uczogRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFNvbWVFZGl0b3JDb250cmlidXRpb25zKFtcblx0XHRcdFx0Q29kZUFjdGlvbkNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdENvbG9yRGV0ZWN0b3IuSUQsXG5cdFx0XHRcdENvbnRleHRNZW51Q29udHJvbGxlci5JRCxcblx0XHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5JRCxcblx0XHRcdFx0RHJhZ0FuZERyb3BDb250cm9sbGVyLklELFxuXHRcdFx0XHREcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdEVkaXRvckRpY3RhdGlvbi5JRCxcblx0XHRcdFx0Rm9ybWF0T25UeXBlLklELFxuXHRcdFx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0SW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLklELFxuXHRcdFx0XHRMaW5rRGV0ZWN0b3IuSUQsXG5cdFx0XHRcdE1lbnVQcmV2ZW50ZXIuSUQsXG5cdFx0XHRcdE1lc3NhZ2VDb250cm9sbGVyLklELFxuXHRcdFx0XHRQbGFjZWhvbGRlclRleHRDb250cmlidXRpb24uSUQsXG5cdFx0XHRcdFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklELFxuXHRcdFx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSUQsXG5cdFx0XHRcdFN1Z2dlc3RDb250cm9sbGVyLklEXG5cdFx0XHRdKSxcblx0XHRcdGlzU2ltcGxlV2lkZ2V0OiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2VdKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChzZXJ2aWNlcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgZWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyA9IHRoaXMuaW5wdXRFZGl0b3JPcHRpb25zLmdldEVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMoKTtcblx0XHR0aGlzLmlucHV0RWRpdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UyLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIHRoaXMuZWRpdG9yQ29udGFpbmVyLCBlZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zLCBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnB1dEVkaXRvcik7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0RWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlucHV0Py5yZXBvc2l0b3J5KSB7XG5cdFx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXModGhpcy5pbnB1dC5yZXBvc2l0b3J5KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3N5bnRoZXRpYy1mb2N1cycpO1xuXHRcdFx0dGhpcy5yZW5kZXJWYWxpZGF0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5wdXRFZGl0b3Iub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnc3ludGhldGljLWZvY3VzJyk7XG5cblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMudmFsaWRhdGlvbiB8fCAhdGhpcy52YWxpZGF0aW9uSGFzRm9jdXMpIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFyVmFsaWRhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAwKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0RWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRDb3B5UGFzdGVDb250cm9sbGVyLmdldCh0aGlzLmlucHV0RWRpdG9yKT8uY2xlYXJXaWRnZXRzKCk7XG5cdFx0XHREcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuZ2V0KHRoaXMuaW5wdXRFZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBmaXJzdExpbmVLZXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2NtSW5wdXRJc0luRmlyc3RQb3NpdGlvbicsIGZhbHNlKTtcblx0XHRjb25zdCBsYXN0TGluZUtleSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdzY21JbnB1dElzSW5MYXN0UG9zaXRpb24nLCBmYWxzZSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKHsgcG9zaXRpb24gfSkgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5pbnB1dEVkaXRvci5fZ2V0Vmlld01vZGVsKCkhO1xuXHRcdFx0Y29uc3QgbGFzdExpbmVOdW1iZXIgPSB2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBsYXN0TGluZUNvbCA9IHZpZXdNb2RlbC5nZXRMaW5lTGVuZ3RoKGxhc3RMaW5lTnVtYmVyKSArIDE7XG5cdFx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRmaXJzdExpbmVLZXkuc2V0KHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID09PSAxICYmIHZpZXdQb3NpdGlvbi5jb2x1bW4gPT09IDEpO1xuXHRcdFx0bGFzdExpbmVLZXkuc2V0KHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID09PSBsYXN0TGluZU51bWJlciAmJiB2aWV3UG9zaXRpb24uY29sdW1uID09PSBsYXN0TGluZUNvbCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5wdXRFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLnRvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2Nyb2xsLWRlY29yYXRpb24nLCBlLnNjcm9sbFRvcCA+IDApO1xuXHRcdH0pKTtcblxuXHRcdEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uc2hvd0lucHV0QWN0aW9uQnV0dG9uJykpKCgpID0+IHRoaXMubGF5b3V0KCksIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSBFdmVudC5zaWduYWwoRXZlbnQuZmlsdGVyKHRoaXMuaW5wdXRFZGl0b3Iub25EaWRDb250ZW50U2l6ZUNoYW5nZSwgZSA9PiBlLmNvbnRlbnRIZWlnaHRDaGFuZ2VkLCB0aGlzLmRpc3Bvc2FibGVzKSk7XG5cblx0XHQvLyBUb29sYmFyXG5cdFx0dGhpcy50b29sYmFyID0gaW5zdGFudGlhdGlvblNlcnZpY2UyLmNyZWF0ZUluc3RhbmNlKFNDTUlucHV0V2lkZ2V0VG9vbGJhciwgdGhpcy50b29sYmFyQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiB0aGlzLnRvb2xiYXIuZHJvcGRvd25BY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHRoaXMudG9vbGJhci5kcm9wZG93bkFjdGlvbiwgdGhpcy50b29sYmFyLmRyb3Bkb3duQWN0aW9ucywgJycsIHsgYWN0aW9uUnVubmVyOiB0aGlzLnRvb2xiYXIuYWN0aW9uUnVubmVyLCBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnRvb2xiYXIub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5sYXlvdXQoKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudG9vbGJhcik7XG5cdH1cblxuXHRnZXRDb250ZW50SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuaW5wdXRFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCB7IHRvcCwgYm90dG9tIH0gPSB0aGlzLmlucHV0RWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucGFkZGluZyk7XG5cblx0XHRjb25zdCBpbnB1dE1pbkxpbmVzQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnc2NtLmlucHV0TWluTGluZUNvdW50Jyk7XG5cdFx0Y29uc3QgaW5wdXRNaW5MaW5lcyA9IHR5cGVvZiBpbnB1dE1pbkxpbmVzQ29uZmlnID09PSAnbnVtYmVyJyA/IGNsYW1wKGlucHV0TWluTGluZXNDb25maWcsIDEsIDUwKSA6IDE7XG5cdFx0Y29uc3QgZWRpdG9yTWluSGVpZ2h0ID0gaW5wdXRNaW5MaW5lcyAqIGxpbmVIZWlnaHQgKyB0b3AgKyBib3R0b207XG5cblx0XHRjb25zdCBpbnB1dE1heExpbmVzQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnc2NtLmlucHV0TWF4TGluZUNvdW50Jyk7XG5cdFx0Y29uc3QgaW5wdXRNYXhMaW5lcyA9IHR5cGVvZiBpbnB1dE1heExpbmVzQ29uZmlnID09PSAnbnVtYmVyJyA/IGNsYW1wKGlucHV0TWF4TGluZXNDb25maWcsIDEsIDUwKSA6IDEwO1xuXHRcdGNvbnN0IGVkaXRvck1heEhlaWdodCA9IGlucHV0TWF4TGluZXMgKiBsaW5lSGVpZ2h0ICsgdG9wICsgYm90dG9tO1xuXG5cdFx0cmV0dXJuIGNsYW1wKHRoaXMuaW5wdXRFZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpLCBlZGl0b3JNaW5IZWlnaHQsIGVkaXRvck1heEhlaWdodCk7XG5cdH1cblxuXHRsYXlvdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0Y29uc3QgdG9vbGJhcldpZHRoID0gdGhpcy5nZXRUb29sYmFyV2lkdGgoKTtcblx0XHRjb25zdCBkaW1lbnNpb24gPSBuZXcgRGltZW5zaW9uKHRoaXMuZWxlbWVudC5jbGllbnRXaWR0aCAtIHRvb2xiYXJXaWR0aCwgZWRpdG9ySGVpZ2h0KTtcblxuXHRcdGlmIChkaW1lbnNpb24ud2lkdGggPCAwKSB7XG5cdFx0XHR0aGlzLmxhc3RMYXlvdXRXYXNUcmFzaCA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0TGF5b3V0V2FzVHJhc2ggPSBmYWxzZTtcblx0XHR0aGlzLmlucHV0RWRpdG9yLmxheW91dChkaW1lbnNpb24pO1xuXHRcdHRoaXMucmVuZGVyVmFsaWRhdGlvbigpO1xuXG5cdFx0Y29uc3Qgc2hvd0lucHV0QWN0aW9uQnV0dG9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignc2NtLnNob3dJbnB1dEFjdGlvbkJ1dHRvbicpID09PSB0cnVlO1xuXHRcdHRoaXMudG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvd0lucHV0QWN0aW9uQnV0dG9uIHx8IHRoaXMudG9vbGJhcj8uaXNFbXB0eSgpID09PSB0cnVlKTtcblxuXHRcdGlmICh0aGlzLnNob3VsZEZvY3VzQWZ0ZXJMYXlvdXQpIHtcblx0XHRcdHRoaXMuc2hvdWxkRm9jdXNBZnRlckxheW91dCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxhc3RMYXlvdXRXYXNUcmFzaCkge1xuXHRcdFx0dGhpcy5sYXN0TGF5b3V0V2FzVHJhc2ggPSBmYWxzZTtcblx0XHRcdHRoaXMuc2hvdWxkRm9jdXNBZnRlckxheW91dCA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pbnB1dEVkaXRvci5mb2N1cygpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzeW50aGV0aWMtZm9jdXMnKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlucHV0RWRpdG9yLmhhc1RleHRGb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUVkaXRvck9wdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHRoaXMuaW5wdXRFZGl0b3JPcHRpb25zLmdldEVkaXRvck9wdGlvbnMoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclZhbGlkYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhclZhbGlkYXRpb24oKTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2YWxpZGF0aW9uLWluZm8nLCB0aGlzLnZhbGlkYXRpb24/LnR5cGUgPT09IElucHV0VmFsaWRhdGlvblR5cGUuSW5mb3JtYXRpb24pO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd2YWxpZGF0aW9uLXdhcm5pbmcnLCB0aGlzLnZhbGlkYXRpb24/LnR5cGUgPT09IElucHV0VmFsaWRhdGlvblR5cGUuV2FybmluZyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3ZhbGlkYXRpb24tZXJyb3InLCB0aGlzLnZhbGlkYXRpb24/LnR5cGUgPT09IElucHV0VmFsaWRhdGlvblR5cGUuRXJyb3IpO1xuXG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRpb24gfHwgIXRoaXMuaW5wdXRFZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZhbGlkYXRpb25NZXNzYWdlQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0aGlzLnZhbGlkYXRpb25Db250ZXh0VmlldyA9IHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLnNob3dDb250ZXh0Vmlldyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuZWxlbWVudCxcblx0XHRcdHJlbmRlcjogY29udGFpbmVyID0+IHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlckJvdHRvbUxlZnRSYWRpdXMgPSAnMCc7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21SaWdodFJhZGl1cyA9ICcwJztcblxuXHRcdFx0XHRjb25zdCB2YWxpZGF0aW9uQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNjbS1lZGl0b3ItdmFsaWRhdGlvbi1jb250YWluZXInKSk7XG5cdFx0XHRcdHZhbGlkYXRpb25Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndmFsaWRhdGlvbi1pbmZvJywgdGhpcy52YWxpZGF0aW9uIS50eXBlID09PSBJbnB1dFZhbGlkYXRpb25UeXBlLkluZm9ybWF0aW9uKTtcblx0XHRcdFx0dmFsaWRhdGlvbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd2YWxpZGF0aW9uLXdhcm5pbmcnLCB0aGlzLnZhbGlkYXRpb24hLnR5cGUgPT09IElucHV0VmFsaWRhdGlvblR5cGUuV2FybmluZyk7XG5cdFx0XHRcdHZhbGlkYXRpb25Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndmFsaWRhdGlvbi1lcnJvcicsIHRoaXMudmFsaWRhdGlvbiEudHlwZSA9PT0gSW5wdXRWYWxpZGF0aW9uVHlwZS5FcnJvcik7XG5cdFx0XHRcdHZhbGlkYXRpb25Db250YWluZXIuc3R5bGUud2lkdGggPSBgJHt0aGlzLmVsZW1lbnQuY2xpZW50V2lkdGggKyAyfXB4YDtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZCh2YWxpZGF0aW9uQ29udGFpbmVyLCAkKCcuc2NtLWVkaXRvci12YWxpZGF0aW9uJykpO1xuXG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLnZhbGlkYXRpb24hLm1lc3NhZ2U7XG5cdFx0XHRcdGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRlbGVtZW50LnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCB0cmFja2VyID0gdHJhY2tGb2N1cyhlbGVtZW50KTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodHJhY2tlcik7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRyYWNrZXIub25EaWRGb2N1cygoKSA9PiAodGhpcy52YWxpZGF0aW9uSGFzRm9jdXMgPSB0cnVlKSkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnZhbGlkYXRpb25IYXNGb2N1cyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlckJvdHRvbUxlZnRSYWRpdXMgPSAnMnB4Jztcblx0XHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21SaWdodFJhZGl1cyA9ICcycHgnO1xuXHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1lc3NhZ2UsIHtcblx0XHRcdFx0XHRcdGFjdGlvbkhhbmRsZXI6IChsaW5rLCBtZFN0cikgPT4ge1xuXHRcdFx0XHRcdFx0XHRvcGVuTGlua0Zyb21NYXJrZG93bih0aGlzLm9wZW5lclNlcnZpY2UsIGxpbmssIG1kU3RyLmlzVHJ1c3RlZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21MZWZ0UmFkaXVzID0gJzJweCc7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21SaWdodFJhZGl1cyA9ICcycHgnO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkTWFya2Rvd24pO1xuXHRcdFx0XHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQocmVuZGVyZWRNYXJrZG93bi5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKHZhbGlkYXRpb25Db250YWluZXIsICQoJy5zY20tZWRpdG9yLXZhbGlkYXRpb24tYWN0aW9ucycpKTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uYmFyID0gbmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyKTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbignc2NtSW5wdXRXaWRnZXQudmFsaWRhdGlvbk1lc3NhZ2UuY2xvc2UnLCBsb2NhbGl6ZSgnbGFiZWwuY2xvc2UnLCBcIkNsb3NlXCIpLCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksIHRydWUsICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tTGVmdFJhZGl1cyA9ICcycHgnO1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b21SaWdodFJhZGl1cyA9ICcycHgnO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFjdGlvbmJhcik7XG5cdFx0XHRcdGFjdGlvbmJhci5wdXNoKGFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cblx0XHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0aW9uSGFzRm9jdXMgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlckJvdHRvbUxlZnRSYWRpdXMgPSAnMnB4Jztcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlckJvdHRvbVJpZ2h0UmFkaXVzID0gJzJweCc7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0sXG5cdFx0XHRhbmNob3JBbGlnbm1lbnQ6IEFuY2hvckFsaWdubWVudC5MRUZUXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRvb2xiYXJXaWR0aCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHNob3dJbnB1dEFjdGlvbkJ1dHRvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3NjbS5zaG93SW5wdXRBY3Rpb25CdXR0b24nKTtcblx0XHRpZiAoIXRoaXMudG9vbGJhciB8fCAhc2hvd0lucHV0QWN0aW9uQnV0dG9uIHx8IHRoaXMudG9vbGJhcj8uaXNFbXB0eSgpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50b29sYmFyLmRyb3Bkb3duQWN0aW9ucy5sZW5ndGggPT09IDAgP1xuXHRcdFx0MjYgLyogMjJweCBhY3Rpb24gKyA0cHggbWFyZ2luICovIDpcblx0XHRcdDM5IC8qIDM1cHggYWN0aW9uICsgNHB4IG1hcmdpbiAqLztcblx0fVxuXG5cdGNsZWFyVmFsaWRhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnZhbGlkYXRpb25Db250ZXh0Vmlldz8uY2xvc2UoKTtcblx0XHR0aGlzLnZhbGlkYXRpb25Db250ZXh0VmlldyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnZhbGlkYXRpb25IYXNGb2N1cyA9IGZhbHNlO1xuXHRcdHRoaXMudmFsaWRhdGlvbk1lc3NhZ2VDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2xlYXJWYWxpZGF0aW9uKCk7XG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3ZhbGlkYXRpb25UaW1lcik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTQ01JbnB1dFdpZGdldENvbW1hbmRJZC5TZXR1cEFjdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2NtSW5wdXRHZW5lcmF0ZUNvbW1pdE1lc3NhZ2UnLCBcIkdlbmVyYXRlIENvbW1pdCBNZXNzYWdlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zcGFya2xlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlNDTUlucHV0Qm94LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuY29tcGxldGVkLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnc2NtUHJvdmlkZXInLCAnZ2l0Jylcblx0XHRcdFx0KVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9TVVBQT1JUX0FOT05ZTU9VU19BQ1RJT05fSUQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZCA9IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uZ2VuZXJhdGVDb21taXRNZXNzYWdlQ29tbWFuZDtcblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kLCAuLi5hcmdzKTtcblx0fVxufSk7XG5cbnNldHVwU2ltcGxlRWRpdG9yU2VsZWN0aW9uU3R5bGluZygnLnNjbS12aWV3IC5zY20tZWRpdG9yLWNvbnRhaW5lcicpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxRQUFRLEdBQUcsV0FBVyxrQkFBa0I7QUFDakQsU0FBUyxxQkFBa0QsaUJBQWlCLDRCQUEyRDtBQUN2SSxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHFCQUFxQiwyQkFBNkM7QUFDM0UsU0FBUyxvQkFBaUMsZ0JBQWdCLHFCQUFxQjtBQUMvRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQixjQUFjLGlCQUFpQixRQUFRLGVBQWU7QUFDL0UsU0FBa0IsY0FBYyxjQUFjO0FB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RUEsVUFBZ0I7QUFDZixTQUFLLFFBQVE7QUFDYixTQUFLLHNCQUFzQixRQUFRO0FBQ25DLFNBQUssZ0JBQWdCO0FBQ3JCLGlCQUFhLEtBQUssZ0JBQWdCO0FBQ2xDLFNBQUssWUFBWSxRQUFRO0FBQUEsRUFDMUI7QUFDRDtBQXBlYSxlQUVZLHFCQUFxRDtBQUFBLEVBQzVFLENBQUMsb0JBQW9CLFdBQVcsR0FBRztBQUFBLEVBQ25DLENBQUMsb0JBQW9CLE9BQU8sR0FBRztBQUFBLEVBQy9CLENBQUMsb0JBQW9CLEtBQUssR0FBRztBQUM5QjtBQU5ZLGlCQUFOO0FBQUEsRUF1Tko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhPVTtBQXNlYixnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUyxpQ0FBaUMseUJBQXlCO0FBQUEsTUFDMUUsTUFBTSxRQUFRO0FBQUEsTUFDZCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU0sZUFBZTtBQUFBLFVBQ3BCLGdCQUFnQixNQUFNLE9BQU8sT0FBTztBQUFBLFVBQ3BDLGdCQUFnQixNQUFNLG9CQUFvQixPQUFPO0FBQUEsVUFDakQsZ0JBQWdCLE1BQU0sVUFBVSxPQUFPO0FBQUEsVUFDdkMsZUFBZSxPQUFPLGVBQWUsS0FBSztBQUFBLFFBQzNDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsSUFBSSxhQUErQixNQUFnQztBQUNqRixVQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUVuRCxVQUFNLFNBQVMsTUFBTSxlQUFlLGVBQWUsc0NBQXNDO0FBQ3pGLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLFFBQVEsa0JBQWtCO0FBQzFDLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLGVBQWUsU0FBUyxHQUFHLElBQUk7QUFBQSxFQUNyRDtBQUNELENBQUM7QUFFRCxrQ0FBa0MsaUNBQWlDOyIsCiAgIm5hbWVzIjogWyJTQ01JbnB1dFdpZGdldENvbW1hbmRJZCIsICJTQ01JbnB1dFdpZGdldFN0b3JhZ2VLZXkiXQp9Cg==
