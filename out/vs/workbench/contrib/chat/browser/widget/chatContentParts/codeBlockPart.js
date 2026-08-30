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
import "./media/codeBlockPart.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../../../base/browser/formattedTextRenderer.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { combinedDisposable, Disposable, MutableDisposable, thenRegisterOrDispose } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { DiffEditorWidget } from "../../../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
import { EditorOption } from "../../../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../../../editor/common/config/fontInfo.js";
import { EndOfLinePreference } from "../../../../../../editor/common/model.js";
import { TextEdit } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../../editor/common/languages/modesRegistry.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TextModelText } from "../../../../../../editor/common/model/textModelText.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { DefaultModelSHA1Computer } from "../../../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { BracketMatchingController } from "../../../../../../editor/contrib/bracketMatching/browser/bracketMatching.js";
import { ColorDetector } from "../../../../../../editor/contrib/colorPicker/browser/colorDetector.js";
import { ContextMenuController } from "../../../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { GotoDefinitionAtPositionEditorContribution } from "../../../../../../editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import { ContentHoverController } from "../../../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { LinkDetector } from "../../../../../../editor/contrib/links/browser/links.js";
import { MessageController } from "../../../../../../editor/contrib/message/browser/messageController.js";
import { ViewportSemanticTokensContribution } from "../../../../../../editor/contrib/semanticTokens/browser/viewportSemanticTokens.js";
import { SmartSelectController } from "../../../../../../editor/contrib/smartSelect/browser/smartSelect.js";
import { WordHighlighterContribution } from "../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { ResourceLabel } from "../../../../../browser/labels.js";
import { StaticResourceContextKey } from "../../../../../common/contextkeys.js";
import { AccessibilityVerbositySettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { InspectEditorTokensController } from "../../../../codeEditor/browser/inspectEditorTokens/inspectEditorTokens.js";
import { MenuPreventer } from "../../../../codeEditor/browser/menuPreventer.js";
import { SelectionClipboardContributionID } from "../../../../codeEditor/browser/selectionClipboard.js";
import { getSimpleEditorOptions } from "../../../../codeEditor/browser/simpleEditorOptions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { isRequestVM, isResponseVM } from "../../../common/model/chatViewModel.js";
import { emptyProgressRunner, IEditorProgressService } from "../../../../../../platform/progress/common/progress.js";
import { SuggestController } from "../../../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
const $ = dom.$;
const defaultCodeblockPadding = 10;
const defaultChatScrollbarSize = 7;
let CodeBlockPart = class extends Disposable {
  constructor(editorOptions, menuId, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService, contextKeyService, modelService, languageService, configurationService, accessibilityService, logService, textModelService) {
    super();
    this.editorOptions = editorOptions;
    this.menuId = menuId;
    this.isSimpleWidget = isSimpleWidget;
    this.modelService = modelService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.logService = logService;
    this.textModelService = textModelService;
    this.currentScrollWidth = 0;
    this._isHovered = false;
    this._isDropdownVisible = false;
    this.isDisposed = false;
    this.element = $(".interactive-result-code-block");
    this.resourceContextKey = instantiationService.createInstance(StaticResourceContextKey);
    this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
    const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
    const editorElement = dom.append(this.element, $(".interactive-result-editor"));
    this.editor = this.createEditor(scopedInstantiationService, editorElement, {
      ...getSimpleEditorOptions(this.configurationService),
      readOnly: true,
      lineNumbers: "off",
      selectOnLineNumbers: true,
      scrollBeyondLastLine: false,
      lineDecorationsWidth: 8,
      dragAndDrop: false,
      padding: { top: this.verticalPadding, bottom: this.verticalPadding },
      mouseWheelZoom: false,
      scrollbar: {
        vertical: "hidden",
        alwaysConsumeMouseWheel: false
      },
      definitionLinkOpensInPeek: false,
      gotoLocation: {
        multiple: "goto",
        multipleDeclarations: "goto",
        multipleDefinitions: "goto",
        multipleImplementations: "goto"
      },
      ariaLabel: localize("chat.codeBlockHelp", "Code block"),
      overflowWidgetsDomNode,
      tabFocusMode: true,
      ...this.getEditorOptionsFromConfig()
    });
    const toolbarElement = dom.append(this.element, $(".interactive-result-code-block-toolbar"));
    this._toolbarElement = toolbarElement;
    const editorScopedService = this._register(this.editor.contextKeyService.createScoped(toolbarElement));
    const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
    this._toolbarFactory = () => editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarElement, menuId, {
      menuOptions: {
        shouldForwardArgs: true
      }
    });
    const vulnsContainer = dom.append(this.element, $(".interactive-result-vulns"));
    const vulnsHeaderElement = dom.append(vulnsContainer, $(".interactive-result-vulns-header", void 0));
    this.vulnsButton = this._register(new Button(vulnsHeaderElement, {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      supportIcons: true
    }));
    this.vulnsListElement = dom.append(vulnsContainer, $("ul.interactive-result-vulns-list"));
    this._register(this.vulnsButton.onDidClick(() => {
      const element = this.currentCodeBlockData.element;
      element.vulnerabilitiesListExpanded = !element.vulnerabilitiesListExpanded;
      this.vulnsButton.label = this.getVulnerabilitiesLabel();
      this.element.classList.toggle("chat-vulnerabilities-collapsed", !element.vulnerabilitiesListExpanded);
      this.layout();
    }));
    this._isHovered = false;
    this._register(dom.addDisposableListener(this.element, "mouseenter", () => {
      this._isHovered = true;
      toolbarElement.classList.add("force-visibility");
      this._ensureToolbar();
    }));
    this._register(dom.addDisposableListener(this.element, "mouseleave", () => {
      this._isHovered = false;
      if (!this._isDropdownVisible) {
        toolbarElement.classList.remove("force-visibility");
      }
    }));
    this._configureForScreenReader();
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
        this._configureForScreenReader();
      }
    }));
    this._register(this.editorOptions.onDidChange(() => {
      this.editor.updateOptions(this.getEditorOptionsFromConfig());
    }));
    this._register(this.editor.onDidScrollChange((e) => {
      this.currentScrollWidth = e.scrollWidth;
    }));
    this._register(this.editor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        this.layout();
      }
    }));
    this._register(this.editor.onDidBlurEditorWidget(() => {
      this.element.classList.remove("focused");
      WordHighlighterContribution.get(this.editor)?.stopHighlighting();
      this.clearWidgets();
    }));
    this._register(this.editor.onDidFocusEditorWidget(() => {
      this.element.classList.add("focused");
      this._ensureToolbar();
      WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
    }));
    this._register(Event.any(
      this.editor.onDidChangeModel,
      this.editor.onDidChangeModelContent
    )(() => {
      if (this.currentCodeBlockData) {
        this.updateContexts(this.currentCodeBlockData);
      }
    }));
    if (delegate.onDidScroll) {
      this._register(delegate.onDidScroll((e) => {
        this.clearWidgets();
      }));
    }
    this._textModel = this._register(this.modelService.createModel(
      "",
      null,
      URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: generateUuid() }),
      this.isSimpleWidget
    ));
    thenRegisterOrDispose(this.textModelService.createModelReference(this._textModel.uri), this._store);
    this.editor.setModel(this._textModel);
  }
  /**
   * Compute a pool reuse key for a code block. When the same key is used
   * across render cycles the pool will try to return the same CodeBlockPart,
   * which lets the setText append-optimisation avoid a full model reset.
   */
  static poolKey(elementId, codeBlockIndex) {
    return `${elementId}/${codeBlockIndex}`;
  }
  get verticalPadding() {
    return this.currentCodeBlockData?.renderOptions?.verticalPadding ?? defaultCodeblockPadding;
  }
  dispose() {
    this.isDisposed = true;
    super.dispose();
  }
  get uri() {
    return this.editor.getModel()?.uri;
  }
  createEditor(instantiationService, parent, options) {
    return this._register(instantiationService.createInstance(CodeEditorWidget, parent, options, {
      isSimpleWidget: this.isSimpleWidget,
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        MenuPreventer.ID,
        SelectionClipboardContributionID,
        ContextMenuController.ID,
        WordHighlighterContribution.ID,
        ViewportSemanticTokensContribution.ID,
        BracketMatchingController.ID,
        SmartSelectController.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        MessageController.ID,
        GotoDefinitionAtPositionEditorContribution.ID,
        SuggestController.ID,
        SnippetController2.ID,
        ColorDetector.ID,
        LinkDetector.ID,
        InspectEditorTokensController.ID
      ])
    }));
  }
  focus() {
    this.editor.focus();
  }
  updatePaddingForLayout() {
    const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
    const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
    const bottomPadding = horizontalScrollbarVisible ? Math.max(this.verticalPadding - scrollbarHeight, 2) : this.verticalPadding;
    this.editor.updateOptions({ padding: { top: this.verticalPadding, bottom: bottomPadding } });
  }
  _ensureToolbar() {
    if (this.isDisposed) {
      return void 0;
    }
    if (this.currentCodeBlockData?.renderOptions?.hideToolbar) {
      return void 0;
    }
    if (!this.toolbar) {
      const factory = this._toolbarFactory;
      if (!factory) {
        return void 0;
      }
      this._toolbarFactory = void 0;
      const toolbar = this._register(factory());
      this.toolbar = toolbar;
      this._register(toolbar.onDidChangeDropdownVisibility((e) => {
        this._isDropdownVisible = e;
        this._toolbarElement.classList.toggle("force-visibility", e || this._isHovered);
      }));
      if (this._pendingToolbarAriaLabel !== void 0) {
        toolbar.setAriaLabel(this._pendingToolbarAriaLabel);
        this._pendingToolbarAriaLabel = void 0;
      }
      if (this._pendingToolbarContext !== void 0) {
        toolbar.context = this._pendingToolbarContext;
        this._pendingToolbarContext = void 0;
      }
    }
    return this.toolbar;
  }
  _configureForScreenReader() {
    const hideToolbar = !!this.currentCodeBlockData?.renderOptions?.hideToolbar;
    if (this.accessibilityService.isScreenReaderOptimized()) {
      if (hideToolbar) {
        dom.hide(this._toolbarElement);
      } else {
        this._toolbarElement.style.display = "block";
        if (this.currentCodeBlockData) {
          this._ensureToolbar();
        }
      }
    } else if (hideToolbar) {
      dom.hide(this._toolbarElement);
    } else {
      this._toolbarElement.style.display = "";
    }
  }
  getEditorOptionsFromConfig() {
    const renderOptions = this.currentCodeBlockData?.renderOptions;
    const scrollbar = renderOptions?.maxHeightInLines ? { vertical: "auto", verticalScrollbarSize: defaultChatScrollbarSize, ...renderOptions?.editorOptions?.scrollbar } : void 0;
    return {
      wordWrap: this.editorOptions.configuration.resultEditor.wordWrap,
      fontLigatures: this.editorOptions.configuration.resultEditor.fontLigatures,
      bracketPairColorization: this.editorOptions.configuration.resultEditor.bracketPairColorization,
      fontFamily: this.editorOptions.configuration.resultEditor.fontFamily === "default" ? EDITOR_FONT_DEFAULTS.fontFamily : this.editorOptions.configuration.resultEditor.fontFamily,
      fontSize: this.editorOptions.configuration.resultEditor.fontSize,
      fontWeight: this.editorOptions.configuration.resultEditor.fontWeight,
      lineHeight: this.editorOptions.configuration.resultEditor.lineHeight,
      ...renderOptions?.editorOptions,
      ...scrollbar ? { scrollbar } : {}
    };
  }
  layout(width = this.lastLayoutWidth) {
    if (width === void 0) {
      return;
    }
    this.lastLayoutWidth = width;
    const contentHeight = this.getContentHeight();
    let height = contentHeight;
    if (this.currentCodeBlockData?.renderOptions?.maxHeightInLines) {
      height = Math.min(contentHeight, this.editor.getOption(EditorOption.lineHeight) * this.currentCodeBlockData?.renderOptions?.maxHeightInLines);
    }
    const editorBorder = 2;
    width = width - editorBorder - (this.currentCodeBlockData?.renderOptions?.reserveWidth ?? 0);
    this.editor.layout(
      { width: isRequestVM(this.currentCodeBlockData?.element) ? width * 0.9 : width, height },
      /* postponeRendering */
      true
    );
    this.updatePaddingForLayout();
  }
  getContentHeight() {
    return this.editor.getContentHeight();
  }
  render(data, width) {
    this.currentCodeBlockData = data;
    if (data.parentContextKeyService) {
      this.contextKeyService.updateParent(data.parentContextKeyService);
    }
    if (this.getEditorOptionsFromConfig().wordWrap === "on") {
      this.layout(width);
    }
    const didUpdate = this.updateEditor(data);
    if (!didUpdate || this.isDisposed || this.currentCodeBlockData !== data) {
      return;
    }
    this.editor.updateOptions({
      ...this.getEditorOptionsFromConfig()
    });
    if (!this.editor.getOption(EditorOption.ariaLabel)) {
      this.editor.updateOptions({
        ariaLabel: localize("chat.codeBlockLabel", "Code block {0}", data.codeBlockIndex + 1)
      });
    }
    this.layout(width);
    const toolbarAriaLabel = localize("chat.codeBlockToolbarLabel", "Code block {0}", data.codeBlockIndex + 1);
    if (this.toolbar) {
      this.toolbar.setAriaLabel(toolbarAriaLabel);
    } else {
      this._pendingToolbarAriaLabel = toolbarAriaLabel;
    }
    if (data.renderOptions?.hideToolbar) {
      dom.hide(this._toolbarElement);
    } else {
      dom.show(this._toolbarElement);
      if (this.accessibilityService.isScreenReaderOptimized()) {
        this._ensureToolbar();
      }
    }
    if (data.vulns?.length && isResponseVM(data.element)) {
      dom.clearNode(this.vulnsListElement);
      this.element.classList.remove("no-vulns");
      this.element.classList.toggle("chat-vulnerabilities-collapsed", !data.element.vulnerabilitiesListExpanded);
      dom.append(this.vulnsListElement, ...data.vulns.map((v) => $("li", void 0, $("span.chat-vuln-title", void 0, v.title), " " + v.description)));
      this.vulnsButton.label = this.getVulnerabilitiesLabel();
    } else {
      this.element.classList.add("no-vulns");
    }
    if (this._isHovered) {
      this._toolbarElement.classList.add("force-visibility");
    }
    this.layout();
    this.editor.renderAsync(true);
  }
  reset() {
    this.clearWidgets();
    this.currentCodeBlockData = void 0;
  }
  onDidRemount() {
    if (this.currentCodeBlockData) {
      this.editor.renderAsync(true);
    }
  }
  clearWidgets() {
    ContentHoverController.get(this.editor)?.hideContentHover();
    GlyphHoverController.get(this.editor)?.hideGlyphHover();
  }
  updateEditor(data) {
    if (this.isDisposed || this.currentCodeBlockData !== data) {
      return false;
    }
    this.setText(data.text);
    this.setLanguage(data.languageId);
    this.updateContexts(data);
    return true;
  }
  getVulnerabilitiesLabel() {
    if (!this.currentCodeBlockData || !this.currentCodeBlockData.vulns) {
      return "";
    }
    const referencesLabel = this.currentCodeBlockData.vulns.length > 1 ? localize("vulnerabilitiesPlural", "{0} vulnerabilities", this.currentCodeBlockData.vulns.length) : localize("vulnerabilitiesSingular", "{0} vulnerability", 1);
    const icon = (element) => element.vulnerabilitiesListExpanded ? Codicon.chevronDown : Codicon.chevronRight;
    return `${referencesLabel} $(${icon(this.currentCodeBlockData.element).id})`;
  }
  updateContexts(data) {
    const textModel = this.editor.getModel();
    if (!textModel) {
      return;
    }
    const context = {
      code: textModel.getTextBuffer().getValueInRange(textModel.getFullModelRange(), EndOfLinePreference.TextDefined),
      codeBlockIndex: data.codeBlockIndex,
      element: data.element,
      languageId: textModel.getLanguageId(),
      codemapperUri: data.codemapperUri,
      chatSessionResource: data.chatSessionResource
    };
    if (this.toolbar) {
      this.toolbar.context = context;
    } else {
      this._pendingToolbarContext = context;
    }
    this.resourceContextKey.set(textModel.uri);
  }
  setText(newText) {
    const currentText = this._textModel.getValue(EndOfLinePreference.LF);
    if (newText === currentText) {
      return;
    }
    if (newText.startsWith(currentText)) {
      const text = newText.slice(currentText.length);
      const lastLine = this._textModel.getLineCount();
      const lastCol = this._textModel.getLineMaxColumn(lastLine);
      this._textModel.applyEdits([{ range: new Range(lastLine, lastCol, lastLine, lastCol), text }]);
    } else {
      this.logService.trace("[CodeBlockPart] setText could not optimize, falling back to setValue");
      this._textModel.setValue(newText);
    }
  }
  setLanguage(languageId) {
    const vscodeLanguageId = this.languageService.getLanguageIdByLanguageName(languageId);
    if (vscodeLanguageId && vscodeLanguageId !== this._textModel.getLanguageId()) {
      this._textModel.setLanguage(vscodeLanguageId);
    } else if (!vscodeLanguageId && this._textModel.getLanguageId() !== PLAINTEXT_LANGUAGE_ID) {
      this._textModel.setLanguage(PLAINTEXT_LANGUAGE_ID);
    }
  }
};
CodeBlockPart = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IAccessibilityService),
  __decorateParam(11, ILogService),
  __decorateParam(12, ITextModelService)
], CodeBlockPart);
let ChatCodeBlockContentProvider = class extends Disposable {
  constructor(textModelService, _modelService) {
    super();
    this._modelService = _modelService;
    this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeChatCodeBlock, {
      provideTextContent: (resource) => {
        return Promise.resolve(this._modelService.getModel(resource));
      }
    }));
  }
};
ChatCodeBlockContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService)
], ChatCodeBlockContentProvider);
let CodeCompareBlockPart = class extends Disposable {
  constructor(options, menuId, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService, contextKeyService, modelService, configurationService, accessibilityService, labelService, openerService) {
    super();
    this.options = options;
    this.menuId = menuId;
    this.isSimpleWidget = isSimpleWidget;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.labelService = labelService;
    this.openerService = openerService;
    this._lastDiffEditorViewModel = this._store.add(new MutableDisposable());
    this.currentScrollWidth = 0;
    this.currentHorizontalPadding = 0;
    this.element = $(".interactive-result-code-block");
    this.element.classList.add("compare");
    this.messageElement = dom.append(this.element, $(".message"));
    this.messageElement.setAttribute("role", "status");
    this.messageElement.tabIndex = 0;
    this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
    const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this.contextKeyService],
      [IEditorProgressService, new class {
        show(_total, _delay) {
          return emptyProgressRunner;
        }
        async showWhile(promise, _delay) {
          await promise;
        }
      }()]
    )));
    const editorHeader = this.editorHeader = dom.append(this.element, $(".interactive-result-header.show-file-icons"));
    const editorElement = dom.append(this.element, $(".interactive-result-editor"));
    this.diffEditor = this.createDiffEditor(scopedInstantiationService, editorElement, {
      ...getSimpleEditorOptions(this.configurationService),
      lineNumbers: "on",
      selectOnLineNumbers: true,
      scrollBeyondLastLine: false,
      lineDecorationsWidth: 12,
      dragAndDrop: false,
      padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
      mouseWheelZoom: false,
      scrollbar: {
        vertical: "hidden",
        alwaysConsumeMouseWheel: false
      },
      definitionLinkOpensInPeek: false,
      gotoLocation: {
        multiple: "goto",
        multipleDeclarations: "goto",
        multipleDefinitions: "goto",
        multipleImplementations: "goto"
      },
      ariaLabel: localize("chat.codeBlockHelp", "Code block"),
      overflowWidgetsDomNode,
      ...this.getEditorOptionsFromConfig()
    });
    this.resourceLabel = this._register(scopedInstantiationService.createInstance(ResourceLabel, editorHeader, { supportIcons: true }));
    const editorScopedService = this._register(this.diffEditor.getModifiedEditor().contextKeyService.createScoped(editorHeader));
    const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
    this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, editorHeader, menuId, {
      menuOptions: {
        shouldForwardArgs: true
      }
    }));
    this._configureForScreenReader();
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
        this._configureForScreenReader();
      }
    }));
    this._register(this.options.onDidChange(() => {
      this.diffEditor.updateOptions(this.getEditorOptionsFromConfig());
    }));
    this._register(this.diffEditor.getModifiedEditor().onDidScrollChange((e) => {
      this.currentScrollWidth = e.scrollWidth;
    }));
    this._register(this.diffEditor.getModifiedEditor().onDidBlurEditorWidget(() => {
      this.element.classList.remove("focused");
      WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.stopHighlighting();
      this.clearWidgets();
    }));
    this._register(this.diffEditor.getModifiedEditor().onDidFocusEditorWidget(() => {
      this.element.classList.add("focused");
      WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.restoreViewState(true);
    }));
    if (delegate.onDidScroll) {
      this._register(delegate.onDidScroll((e) => {
        this.clearWidgets();
      }));
    }
  }
  get uri() {
    return this.diffEditor.getModifiedEditor().getModel()?.uri;
  }
  createDiffEditor(instantiationService, parent, options) {
    const widgetOptions = {
      isSimpleWidget: this.isSimpleWidget,
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        MenuPreventer.ID,
        SelectionClipboardContributionID,
        ContextMenuController.ID,
        WordHighlighterContribution.ID,
        ViewportSemanticTokensContribution.ID,
        BracketMatchingController.ID,
        SmartSelectController.ID,
        ContentHoverController.ID,
        GlyphHoverController.ID,
        GotoDefinitionAtPositionEditorContribution.ID
      ])
    };
    return this._register(instantiationService.createInstance(DiffEditorWidget, parent, {
      scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false, ignoreHorizontalScrollbarInContentHeight: true },
      renderMarginRevertIcon: false,
      diffCodeLens: false,
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      originalAriaLabel: localize("original", "Original"),
      modifiedAriaLabel: localize("modified", "Modified"),
      diffAlgorithm: "advanced",
      readOnly: false,
      isInEmbeddedEditor: true,
      useInlineViewWhenSpaceIsLimited: true,
      experimental: {
        useTrueInlineView: true
      },
      renderSideBySideInlineBreakpoint: 300,
      renderOverviewRuler: false,
      compactMode: true,
      hideUnchangedRegions: { enabled: true, contextLineCount: 1 },
      renderGutterMenu: false,
      lineNumbersMinChars: 1,
      ...options
    }, { originalEditor: widgetOptions, modifiedEditor: widgetOptions }));
  }
  focus() {
    this.diffEditor.focus();
  }
  updatePaddingForLayout() {
    const horizontalScrollbarVisible = this.currentScrollWidth > this.diffEditor.getModifiedEditor().getLayoutInfo().contentWidth;
    const scrollbarHeight = this.diffEditor.getModifiedEditor().getLayoutInfo().horizontalScrollbarHeight;
    const bottomPadding = horizontalScrollbarVisible ? Math.max(defaultCodeblockPadding - scrollbarHeight, 2) : defaultCodeblockPadding;
    this.diffEditor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
  }
  _configureForScreenReader() {
    const toolbarElt = this.toolbar.getElement();
    toolbarElt.style.display = "block";
    if (this.accessibilityService.isScreenReaderOptimized()) {
      toolbarElt.ariaLabel = localize("chat.codeBlock.toolbar", "Code block toolbar");
    }
  }
  getEditorOptionsFromConfig() {
    return {
      wordWrap: this.options.configuration.resultEditor.wordWrap,
      fontLigatures: this.options.configuration.resultEditor.fontLigatures,
      bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
      fontFamily: this.options.configuration.resultEditor.fontFamily === "default" ? EDITOR_FONT_DEFAULTS.fontFamily : this.options.configuration.resultEditor.fontFamily,
      fontSize: this.options.configuration.resultEditor.fontSize,
      fontWeight: this.options.configuration.resultEditor.fontWeight,
      lineHeight: this.options.configuration.resultEditor.lineHeight
    };
  }
  layout(width = this.lastLayoutWidth) {
    if (width === void 0) {
      return;
    }
    this.lastLayoutWidth = width;
    const editorBorder = 2;
    const toolbar = dom.getTotalHeight(this.editorHeader);
    const content = this.diffEditor.getModel() ? this.diffEditor.getContentHeight() : dom.getTotalHeight(this.messageElement);
    const dimension = new dom.Dimension(width - editorBorder - this.currentHorizontalPadding * 2, toolbar + content);
    this.element.style.width = `${dimension.width}px`;
    this.diffEditor.layout(dimension.with(void 0, content - editorBorder));
    this.updatePaddingForLayout();
  }
  async render(data, width, token) {
    this.currentHorizontalPadding = data.horizontalPadding || 0;
    if (data.parentContextKeyService) {
      this.contextKeyService.updateParent(data.parentContextKeyService);
    }
    if (this.options.configuration.resultEditor.wordWrap === "on") {
      this.layout(width);
    }
    await this.updateEditor(data, token);
    this.layout(width);
    this.diffEditor.updateOptions({
      ariaLabel: localize("chat.compareCodeBlockLabel", "Code Edits"),
      readOnly: !!data.isReadOnly
    });
    this.resourceLabel.element.setFile(data.edit.uri, {
      fileKind: FileKind.FILE,
      fileDecorations: { colors: true, badges: false }
    });
  }
  reset() {
    this.clearWidgets();
  }
  clearWidgets() {
    ContentHoverController.get(this.diffEditor.getOriginalEditor())?.hideContentHover();
    ContentHoverController.get(this.diffEditor.getModifiedEditor())?.hideContentHover();
    GlyphHoverController.get(this.diffEditor.getOriginalEditor())?.hideGlyphHover();
    GlyphHoverController.get(this.diffEditor.getModifiedEditor())?.hideGlyphHover();
  }
  async updateEditor(data, token) {
    if (!isResponseVM(data.element)) {
      return;
    }
    const isEditApplied = Boolean(data.edit.state?.applied ?? 0);
    ChatContextKeys.editApplied.bindTo(this.contextKeyService).set(isEditApplied);
    this.element.classList.toggle("no-diff", isEditApplied);
    if (isEditApplied) {
      assertType(data.edit.state?.applied);
      const uriLabel = this.labelService.getUriLabel(data.edit.uri, { relative: true, noPrefix: true });
      let template;
      if (data.edit.state.applied === 1) {
        template = localize("chat.edits.1", "Applied 1 change in [[``{0}``]]", uriLabel);
      } else if (data.edit.state.applied < 0) {
        template = localize("chat.edits.rejected", "Edits in [[``{0}``]] have been rejected", uriLabel);
      } else {
        template = localize("chat.edits.N", "Applied {0} changes in [[``{1}``]]", data.edit.state.applied, uriLabel);
      }
      const message = renderFormattedText(template, {
        renderCodeSegments: true,
        actionHandler: {
          callback: () => {
            this.openerService.open(data.edit.uri, { fromUserGesture: true, allowCommands: false });
          },
          disposables: this._store
        }
      });
      dom.reset(this.messageElement, message);
    }
    const diffData = await data.diffData;
    if (token.isCancellationRequested) {
      return;
    }
    if (!isEditApplied && diffData) {
      const viewModel = this.diffEditor.createViewModel({
        original: diffData.original,
        modified: diffData.modified
      });
      await viewModel.waitForDiff();
      if (token.isCancellationRequested) {
        return;
      }
      const listener = Event.any(diffData.original.onWillDispose, diffData.modified.onWillDispose)(() => {
        this.diffEditor.setModel(null);
      });
      this.diffEditor.setModel(viewModel);
      this._lastDiffEditorViewModel.value = combinedDisposable(listener, viewModel);
    } else {
      this.diffEditor.setModel(null);
      this._lastDiffEditorViewModel.value = void 0;
    }
    this.toolbar.context = {
      edit: data.edit,
      element: data.element,
      diffEditor: this.diffEditor,
      toggleDiffViewMode: () => {
        const isCurrentlyInline = !!this.diffEditor.getModifiedEditor().contextKeyService.getContextKeyValue(EditorContextKeys.diffEditorInlineMode.key);
        const renderSideBySide = isCurrentlyInline;
        this.diffEditor.updateOptions({
          renderSideBySide,
          // Make it not-compact in side by side mode, otherwise we may not actually
          // show it side-by-side if it's a simple diff https://github.com/microsoft/vscode/blob/0632563332c7c08656fb47c97bc4328d62ee1d80/src/vs/editor/browser/widget/diffEditor/diffEditorOptions.ts#L35-L39
          compactMode: !renderSideBySide,
          useInlineViewWhenSpaceIsLimited: false
        });
        this.layout();
      }
    };
  }
};
CodeCompareBlockPart = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IModelService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IOpenerService)
], CodeCompareBlockPart);
let DefaultChatTextEditor = class {
  constructor(modelService, editorService, dialogService) {
    this.modelService = modelService;
    this.editorService = editorService;
    this.dialogService = dialogService;
    this._sha1 = new DefaultModelSHA1Computer();
  }
  async apply(response, item, diffEditor) {
    if (!response.response.value.includes(item)) {
      return;
    }
    if (item.state?.applied) {
      return;
    }
    if (!diffEditor) {
      for (const candidate of this.editorService.listDiffEditors()) {
        if (!candidate.getContainerDomNode().isConnected) {
          continue;
        }
        const model = candidate.getModel();
        if (!model || !isEqual(model.original.uri, item.uri) || model.modified.uri.scheme !== Schemas.vscodeChatCodeCompareBlock) {
          diffEditor = candidate;
          break;
        }
      }
    }
    const edits = diffEditor ? await this._applyWithDiffEditor(diffEditor, item) : await this._apply(item);
    response.setEditApplied(item, edits);
  }
  async _applyWithDiffEditor(diffEditor, item) {
    const model = diffEditor.getModel();
    if (!model) {
      return 0;
    }
    const diff = diffEditor.getDiffComputationResult();
    if (!diff || diff.identical) {
      return 0;
    }
    if (!await this._checkSha1(model.original, item)) {
      return 0;
    }
    const modified = new TextModelText(model.modified);
    const edits = diff.changes2.map((i) => i.toRangeMapping().toTextEdit(modified).toSingleEditOperation());
    model.original.pushStackElement();
    model.original.pushEditOperations(null, edits, () => null);
    model.original.pushStackElement();
    return edits.length;
  }
  async _apply(item) {
    const ref = await this.modelService.createModelReference(item.uri);
    try {
      if (!await this._checkSha1(ref.object.textEditorModel, item)) {
        return 0;
      }
      ref.object.textEditorModel.pushStackElement();
      let total = 0;
      for (const group of item.edits) {
        const edits = group.map(TextEdit.asEditOperation);
        ref.object.textEditorModel.pushEditOperations(null, edits, () => null);
        total += edits.length;
      }
      ref.object.textEditorModel.pushStackElement();
      return total;
    } finally {
      ref.dispose();
    }
  }
  async _checkSha1(model, item) {
    if (item.state?.sha1 && this._sha1.computeSHA1(model) && this._sha1.computeSHA1(model) !== item.state.sha1) {
      const result = await this.dialogService.confirm({
        message: localize("interactive.compare.apply.confirm", "The original file has been modified."),
        detail: localize("interactive.compare.apply.confirm.detail", "Do you want to apply the changes anyway?")
      });
      if (!result.confirmed) {
        return false;
      }
    }
    return true;
  }
  discard(response, item) {
    if (!response.response.value.includes(item)) {
      return;
    }
    if (item.state?.applied) {
      return;
    }
    response.setEditApplied(item, -1);
  }
};
DefaultChatTextEditor = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IDialogService)
], DefaultChatTextEditor);
export {
  ChatCodeBlockContentProvider,
  CodeBlockPart,
  CodeCompareBlockPart,
  DefaultChatTextEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY29kZUJsb2NrUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jb2RlQmxvY2tQYXJ0LmNzcyc7XG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRoZW5SZWdpc3Rlck9yRGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQsIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbFRleHQuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgRGVmYXVsdE1vZGVsU0hBMUNvbXB1dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvYnJhY2tldE1hdGNoaW5nL2Jyb3dzZXIvYnJhY2tldE1hdGNoaW5nLmpzJztcbmltcG9ydCB7IENvbG9yRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL2NvbG9yRGV0ZWN0b3IuanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29udGV4dG1lbnUvYnJvd3Nlci9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBHb3RvRGVmaW5pdGlvbkF0UG9zaXRpb25FZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvbGluay9nb1RvRGVmaW5pdGlvbkF0UG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBHbHlwaEhvdmVyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvZ2x5cGhIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgTGlua0RldGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvbGlua3MvYnJvd3Nlci9saW5rcy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL21lc3NhZ2UvYnJvd3Nlci9tZXNzYWdlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBWaWV3cG9ydFNlbWFudGljVG9rZW5zQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc2VtYW50aWNUb2tlbnMvYnJvd3Nlci92aWV3cG9ydFNlbWFudGljVG9rZW5zLmpzJztcbmltcG9ydCB7IFNtYXJ0U2VsZWN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NtYXJ0U2VsZWN0L2Jyb3dzZXIvc21hcnRTZWxlY3QuanMnO1xuaW1wb3J0IHsgV29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvd29yZEhpZ2hsaWdodGVyL2Jyb3dzZXIvd29yZEhpZ2hsaWdodGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBTdGF0aWNSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnNwZWN0RWRpdG9yVG9rZW5zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9pbnNwZWN0RWRpdG9yVG9rZW5zL2luc3BlY3RFZGl0b3JUb2tlbnMuanMnO1xuaW1wb3J0IHsgTWVudVByZXZlbnRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9tZW51UHJldmVudGVyLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NlbGVjdGlvbkNsaXBib2FyZC5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duVnVsbmVyYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvYW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VNb2RlbCwgSUNoYXRUZXh0RWRpdEdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2NoYXRMaXN0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9jaGF0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBlbXB0eVByb2dyZXNzUnVubmVyLCBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlQmxvY2tEYXRhIHtcblx0cmVhZG9ubHkgY29kZUJsb2NrSW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgZWxlbWVudDogSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbDtcblxuXHQvKipcblx0ICogVGV4dCBjb250ZW50IGZvciB0aGUgY29kZSBibG9jay4gVGhlIENvZGVCbG9ja1BhcnQgd2lsbCBtYW5hZ2Vcblx0ICogY3JlYXRpbmcgYW5kIHVwZGF0aW5nIGl0cyBvd24gdGV4dCBtb2RlbCBmcm9tIHRoaXMgdGV4dC5cblx0ICovXG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IGNvZGVtYXBwZXJVcmk/OiBVUkk7XG5cblx0cmVhZG9ubHkgdnVsbnM/OiByZWFkb25seSBJTWFya2Rvd25WdWxuZXJhYmlsaXR5W107XG5cblx0cmVhZG9ubHkgcGFyZW50Q29udGV4dEtleVNlcnZpY2U/OiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHJlYWRvbmx5IHJlbmRlck9wdGlvbnM/OiBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucztcblxuXHRyZWFkb25seSBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQge1xuXHRyZWFkb25seSBjb2RlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvZGVtYXBwZXJVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IGxhbmd1YWdlSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvZGVCbG9ja0luZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IHVua25vd247XG5cblx0cmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlQmxvY2tSZW5kZXJPcHRpb25zIHtcblx0aGlkZVRvb2xiYXI/OiBib29sZWFuO1xuXHR2ZXJ0aWNhbFBhZGRpbmc/OiBudW1iZXI7XG5cdHJlc2VydmVXaWR0aD86IG51bWJlcjtcblx0ZWRpdG9yT3B0aW9ucz86IElFZGl0b3JPcHRpb25zO1xuXHRtYXhIZWlnaHRJbkxpbmVzPzogbnVtYmVyO1xufVxuXG5jb25zdCBkZWZhdWx0Q29kZWJsb2NrUGFkZGluZyA9IDEwO1xuY29uc3QgZGVmYXVsdENoYXRTY3JvbGxiYXJTaXplID0gNztcbmV4cG9ydCBjbGFzcyBDb2RlQmxvY2tQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIENvbXB1dGUgYSBwb29sIHJldXNlIGtleSBmb3IgYSBjb2RlIGJsb2NrLiBXaGVuIHRoZSBzYW1lIGtleSBpcyB1c2VkXG5cdCAqIGFjcm9zcyByZW5kZXIgY3ljbGVzIHRoZSBwb29sIHdpbGwgdHJ5IHRvIHJldHVybiB0aGUgc2FtZSBDb2RlQmxvY2tQYXJ0LFxuXHQgKiB3aGljaCBsZXRzIHRoZSBzZXRUZXh0IGFwcGVuZC1vcHRpbWlzYXRpb24gYXZvaWQgYSBmdWxsIG1vZGVsIHJlc2V0LlxuXHQgKi9cblx0c3RhdGljIHBvb2xLZXkoZWxlbWVudElkOiBzdHJpbmcsIGNvZGVCbG9ja0luZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtlbGVtZW50SWR9LyR7Y29kZUJsb2NrSW5kZXh9YDtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQ7XG5cdHByaXZhdGUgdG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Rvb2xiYXJGYWN0b3J5OiAoKCkgPT4gTWVudVdvcmtiZW5jaFRvb2xCYXIpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZW5kaW5nVG9vbGJhckFyaWFMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZW5kaW5nVG9vbGJhckNvbnRleHQ6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdnVsbnNCdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSB2dWxuc0xpc3RFbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWwhOiBJVGV4dE1vZGVsO1xuXG5cdHByaXZhdGUgY3VycmVudENvZGVCbG9ja0RhdGE6IElDb2RlQmxvY2tEYXRhIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRTY3JvbGxXaWR0aCA9IDA7XG5cdHByaXZhdGUgbGFzdExheW91dFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzSG92ZXJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0Ryb3Bkb3duVmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIF90b29sYmFyRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVzb3VyY2VDb250ZXh0S2V5OiBTdGF0aWNSZXNvdXJjZUNvbnRleHRLZXk7XG5cblx0cHJpdmF0ZSBnZXQgdmVydGljYWxQYWRkaW5nKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGE/LnJlbmRlck9wdGlvbnM/LnZlcnRpY2FsUGFkZGluZyA/PyBkZWZhdWx0Q29kZWJsb2NrUGFkZGluZztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yT3B0aW9uczogQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0cmVhZG9ubHkgbWVudUlkOiBNZW51SWQsXG5cdFx0ZGVsZWdhdGU6IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSxcblx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzU2ltcGxlV2lkZ2V0OiBib29sZWFuID0gZmFsc2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtY29kZS1ibG9jaycpO1xuXG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHRLZXkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdGF0aWNSZXNvdXJjZUNvbnRleHRLZXkpO1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5lbGVtZW50KSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3QgZWRpdG9yRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuaW50ZXJhY3RpdmUtcmVzdWx0LWVkaXRvcicpKTtcblx0XHR0aGlzLmVkaXRvciA9IHRoaXMuY3JlYXRlRWRpdG9yKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3JFbGVtZW50LCB7XG5cdFx0XHQuLi5nZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyczogJ29mZicsXG5cdFx0XHRzZWxlY3RPbkxpbmVOdW1iZXJzOiB0cnVlLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDgsXG5cdFx0XHRkcmFnQW5kRHJvcDogZmFsc2UsXG5cdFx0XHRwYWRkaW5nOiB7IHRvcDogdGhpcy52ZXJ0aWNhbFBhZGRpbmcsIGJvdHRvbTogdGhpcy52ZXJ0aWNhbFBhZGRpbmcgfSxcblx0XHRcdG1vdXNlV2hlZWxab29tOiBmYWxzZSxcblx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHR2ZXJ0aWNhbDogJ2hpZGRlbicsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdGRlZmluaXRpb25MaW5rT3BlbnNJblBlZWs6IGZhbHNlLFxuXHRcdFx0Z290b0xvY2F0aW9uOiB7XG5cdFx0XHRcdG11bHRpcGxlOiAnZ290bycsXG5cdFx0XHRcdG11bHRpcGxlRGVjbGFyYXRpb25zOiAnZ290bycsXG5cdFx0XHRcdG11bHRpcGxlRGVmaW5pdGlvbnM6ICdnb3RvJyxcblx0XHRcdFx0bXVsdGlwbGVJbXBsZW1lbnRhdGlvbnM6ICdnb3RvJyxcblx0XHRcdH0sXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0LmNvZGVCbG9ja0hlbHAnLCAnQ29kZSBibG9jaycpLFxuXHRcdFx0b3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSxcblx0XHRcdHRhYkZvY3VzTW9kZTogdHJ1ZSxcblx0XHRcdC4uLnRoaXMuZ2V0RWRpdG9yT3B0aW9uc0Zyb21Db25maWcoKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2xiYXJFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtY29kZS1ibG9jay10b29sYmFyJykpO1xuXHRcdHRoaXMuX3Rvb2xiYXJFbGVtZW50ID0gdG9vbGJhckVsZW1lbnQ7XG5cdFx0Y29uc3QgZWRpdG9yU2NvcGVkU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0b29sYmFyRWxlbWVudCkpO1xuXHRcdGNvbnN0IGVkaXRvclNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGVkaXRvclNjb3BlZFNlcnZpY2VdKSkpO1xuXHRcdC8vIFRoZSB0b29sYmFyIGl0c2VsZiBjcmVhdGVzIGxpc3RlbmVycyBvbiB0aGUgbWVudSBzZXJ2aWNlIGFuZCBzaGFyZWRcblx0XHQvLyBjb250ZXh0IGtleSBzZXJ2aWNlLiBJbiBsYXJnZSByZXNwb25zZXMgdGhlcmUgY2FuIGJlIG1hbnkgY29kZVxuXHRcdC8vIGJsb2Nrcywgc28gZGVmZXIgY3JlYXRpb24gdW50aWwgdGhlIHVzZXIgYWN0dWFsbHkgaW50ZXJhY3RzIHdpdGhcblx0XHQvLyB0aGlzIGNvZGUgYmxvY2sgKGhvdmVyLCBlZGl0b3IgZm9jdXMsIG9yIHNjcmVlbiByZWFkZXIgbW9kZSkuXG5cdFx0dGhpcy5fdG9vbGJhckZhY3RvcnkgPSAoKSA9PiBlZGl0b3JTY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckVsZW1lbnQsIG1lbnVJZCwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHZ1bG5zQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtdnVsbnMnKSk7XG5cdFx0Y29uc3QgdnVsbnNIZWFkZXJFbGVtZW50ID0gZG9tLmFwcGVuZCh2dWxuc0NvbnRhaW5lciwgJCgnLmludGVyYWN0aXZlLXJlc3VsdC12dWxucy1oZWFkZXInLCB1bmRlZmluZWQpKTtcblx0XHR0aGlzLnZ1bG5zQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih2dWxuc0hlYWRlckVsZW1lbnQsIHtcblx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvbkJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlcGFyYXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy52dWxuc0xpc3RFbGVtZW50ID0gZG9tLmFwcGVuZCh2dWxuc0NvbnRhaW5lciwgJCgndWwuaW50ZXJhY3RpdmUtcmVzdWx0LXZ1bG5zLWxpc3QnKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZ1bG5zQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEhLmVsZW1lbnQgYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbDtcblx0XHRcdGVsZW1lbnQudnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkID0gIWVsZW1lbnQudnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkO1xuXHRcdFx0dGhpcy52dWxuc0J1dHRvbi5sYWJlbCA9IHRoaXMuZ2V0VnVsbmVyYWJpbGl0aWVzTGFiZWwoKTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZ1bG5lcmFiaWxpdGllcy1jb2xsYXBzZWQnLCAhZWxlbWVudC52dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQpO1xuXHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHRcdC8vIHRoaXMudXBkYXRlQXJpYUxhYmVsKGNvbGxhcHNlQnV0dG9uLmVsZW1lbnQsIHJlZmVyZW5jZXNMYWJlbCwgZWxlbWVudC51c2VkUmVmZXJlbmNlc0V4cGFuZGVkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayBob3ZlciBzdGF0ZSB2aWEgSlMgc28gdGhlIHRvb2xiYXIgcmVtYWlucyB2aXNpYmxlIGFuZCBjbGlja2FibGVcblx0XHQvLyBldmVuIHdoZW4gdGhlIGNvZGUgYmxvY2sgRE9NIGVsZW1lbnQgaXMgYnJpZWZseSBkZXRhY2hlZCBhbmQgcmVhdHRhY2hlZFxuXHRcdC8vIGR1cmluZyBzdHJlYW1pbmcgcmUtcmVuZGVycy4gQ1NTIDpob3ZlciBpcyBsb3N0IHdoZW4gYW4gZWxlbWVudCBsZWF2ZXNcblx0XHQvLyB0aGUgRE9NLCB3aGljaCBjYXVzZXMgdGhlIHRvb2xiYXIgdG8gZmxpY2tlciBhbmQgYmVjb21lIHVuY2xpY2thYmxlXG5cdFx0Ly8gYmVjYXVzZSBvZiB0aGUgcG9pbnRlci1ldmVudHM6bm9uZSBydWxlLiBCeSB0cmFja2luZyBob3ZlciBzdGF0ZSB3aXRoIGFcblx0XHQvLyBwZXJzaXN0ZW50IGJvb2xlYW4gYW5kIHRoZSBmb3JjZS12aXNpYmlsaXR5IGNsYXNzLCB0aGUgdG9vbGJhciBzdXJ2aXZlc1xuXHRcdC8vIERPTSByZWF0dGFjaG1lbnQuXG5cdFx0dGhpcy5faXNIb3ZlcmVkID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsICdtb3VzZWVudGVyJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNIb3ZlcmVkID0gdHJ1ZTtcblx0XHRcdHRvb2xiYXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvcmNlLXZpc2liaWxpdHknKTtcblx0XHRcdHRoaXMuX2Vuc3VyZVRvb2xiYXIoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsICdtb3VzZWxlYXZlJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNIb3ZlcmVkID0gZmFsc2U7XG5cdFx0XHRpZiAoIXRoaXMuX2lzRHJvcGRvd25WaXNpYmxlKSB7XG5cdFx0XHRcdHRvb2xiYXJFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvcmNlLXZpc2liaWxpdHknKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb25maWd1cmVGb3JTY3JlZW5SZWFkZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHRoaXMuX2NvbmZpZ3VyZUZvclNjcmVlblJlYWRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdGVkS2V5cy5oYXMoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5DaGF0KSkge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmVGb3JTY3JlZW5SZWFkZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvck9wdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh0aGlzLmdldEVkaXRvck9wdGlvbnNGcm9tQ29uZmlnKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5jdXJyZW50U2Nyb2xsV2lkdGggPSBlLnNjcm9sbFdpZHRoO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENvbnRlbnRTaXplQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuY29udGVudEhlaWdodENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyk7XG5cdFx0XHRXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KHRoaXMuZWRpdG9yKT8uc3RvcEhpZ2hsaWdodGluZygpO1xuXHRcdFx0dGhpcy5jbGVhcldpZGdldHMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZm9jdXNlZCcpO1xuXHRcdFx0Ly8gRWRpdG9yIGZvY3VzIHB1dHMgdGhlIGNvZGUgYmxvY2sgaW50byBrZXlib2FyZCBpbnRlcmFjdGlvbiByYW5nZTtcblx0XHRcdC8vIGNyZWF0ZSB0aGUgdG9vbGJhciBzbyBUYWIgY2FuIHJlYWNoIGl0LlxuXHRcdFx0dGhpcy5fZW5zdXJlVG9vbGJhcigpO1xuXHRcdFx0V29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldCh0aGlzLmVkaXRvcik/LnJlc3RvcmVWaWV3U3RhdGUodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShcblx0XHRcdHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsXG5cdFx0XHR0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudFxuXHRcdCkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb250ZXh0cyh0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBQYXJlbnQgbGlzdCBzY3JvbGxlZFxuXHRcdGlmIChkZWxlZ2F0ZS5vbkRpZFNjcm9sbCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGVsZWdhdGUub25EaWRTY3JvbGwoZSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXJXaWRnZXRzKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGV4dE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsXG5cdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0Q29kZUJsb2NrLCBwYXRoOiBnZW5lcmF0ZVV1aWQoKSB9KSxcblx0XHRcdHRoaXMuaXNTaW1wbGVXaWRnZXRcblx0XHQpKTtcblx0XHQvLyBIb2xkIGEgbW9kZWwgcmVmZXJlbmNlIHRvIHByZXZlbnQgdGhlIFRleHRNb2RlbFJlc29sdmVyU2VydmljZSBmcm9tXG5cdFx0Ly8gZGlzcG9zaW5nIG91ciBtb2RlbCB3aGVuIG90aGVyIGNvbnN1bWVycyAoZS5nLiBXb3JkSGlnaGxpZ2h0ZXIpXG5cdFx0Ly8gYWNxdWlyZSBhbmQgcmVsZWFzZSB0aGVpciByZWZlcmVuY2VzLlxuXHRcdHRoZW5SZWdpc3Rlck9yRGlzcG9zZSh0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodGhpcy5fdGV4dE1vZGVsLnVyaSksIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLmVkaXRvci5zZXRNb2RlbCh0aGlzLl90ZXh0TW9kZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldCB1cmkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcGFyZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogUmVhZG9ubHk8SUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnM+KTogQ29kZUVkaXRvcldpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIHBhcmVudCwgb3B0aW9ucywge1xuXHRcdFx0aXNTaW1wbGVXaWRnZXQ6IHRoaXMuaXNTaW1wbGVXaWRnZXQsXG5cdFx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRNZW51UHJldmVudGVyLklELFxuXHRcdFx0XHRTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCxcblx0XHRcdFx0Q29udGV4dE1lbnVDb250cm9sbGVyLklELFxuXG5cdFx0XHRcdFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0Vmlld3BvcnRTZW1hbnRpY1Rva2Vuc0NvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0QnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5JRCxcblx0XHRcdFx0U21hcnRTZWxlY3RDb250cm9sbGVyLklELFxuXHRcdFx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0TWVzc2FnZUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdEdvdG9EZWZpbml0aW9uQXRQb3NpdGlvbkVkaXRvckNvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0U3VnZ2VzdENvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFNuaXBwZXRDb250cm9sbGVyMi5JRCxcblx0XHRcdFx0Q29sb3JEZXRlY3Rvci5JRCxcblx0XHRcdFx0TGlua0RldGVjdG9yLklELFxuXG5cdFx0XHRcdEluc3BlY3RFZGl0b3JUb2tlbnNDb250cm9sbGVyLklELFxuXHRcdFx0XSlcblx0XHR9KSk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQYWRkaW5nRm9yTGF5b3V0KCkge1xuXHRcdC8vIHNjcm9sbFdpZHRoID0gXCJ0aGUgd2lkdGggb2YgdGhlIGNvbnRlbnQgdGhhdCBuZWVkcyB0byBiZSBzY3JvbGxlZFwiXG5cdFx0Ly8gY29udGVudFdpZHRoID0gXCJ0aGUgd2lkdGggb2YgdGhlIGFyZWEgd2hlcmUgY29udGVudCBpcyBkaXNwbGF5ZWRcIlxuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxiYXJWaXNpYmxlID0gdGhpcy5jdXJyZW50U2Nyb2xsV2lkdGggPiB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuY29udGVudFdpZHRoO1xuXHRcdGNvbnN0IHNjcm9sbGJhckhlaWdodCA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5ob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0O1xuXHRcdGNvbnN0IGJvdHRvbVBhZGRpbmcgPSBob3Jpem9udGFsU2Nyb2xsYmFyVmlzaWJsZSA/XG5cdFx0XHRNYXRoLm1heCh0aGlzLnZlcnRpY2FsUGFkZGluZyAtIHNjcm9sbGJhckhlaWdodCwgMikgOlxuXHRcdFx0dGhpcy52ZXJ0aWNhbFBhZGRpbmc7XG5cdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmc6IHsgdG9wOiB0aGlzLnZlcnRpY2FsUGFkZGluZywgYm90dG9tOiBib3R0b21QYWRkaW5nIH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVUb29sYmFyKCk6IE1lbnVXb3JrYmVuY2hUb29sQmFyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBJZiB0aGUgY3VycmVudCByZW5kZXIgZXhwbGljaXRseSBoaWQgdGhlIHRvb2xiYXIsIGRvbid0IHBheSB0aGUgY29zdFxuXHRcdC8vIG9mIGNyZWF0aW5nIGl0IChhbmQgYWRkaW5nIGxpc3RlbmVycyBvbiB0aGUgc2hhcmVkIG1lbnUgLyBjb250ZXh0XG5cdFx0Ly8ga2V5IHNlcnZpY2VzKS4gSXQgd2lsbCBiZSBjcmVhdGVkIGxhdGVyIGlmIGEgcmVuZGVyIG1ha2VzIGl0IHZpc2libGUuXG5cdFx0aWYgKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGE/LnJlbmRlck9wdGlvbnM/LmhpZGVUb29sYmFyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMudG9vbGJhcikge1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9IHRoaXMuX3Rvb2xiYXJGYWN0b3J5O1xuXHRcdFx0aWYgKCFmYWN0b3J5KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90b29sYmFyRmFjdG9yeSA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihmYWN0b3J5KCkpO1xuXHRcdFx0dGhpcy50b29sYmFyID0gdG9vbGJhcjtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9vbGJhci5vbkRpZENoYW5nZURyb3Bkb3duVmlzaWJpbGl0eShlID0+IHtcblx0XHRcdFx0dGhpcy5faXNEcm9wZG93blZpc2libGUgPSBlO1xuXHRcdFx0XHR0aGlzLl90b29sYmFyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdmb3JjZS12aXNpYmlsaXR5JywgZSB8fCB0aGlzLl9pc0hvdmVyZWQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ1Rvb2xiYXJBcmlhTGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0b29sYmFyLnNldEFyaWFMYWJlbCh0aGlzLl9wZW5kaW5nVG9vbGJhckFyaWFMYWJlbCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdUb29sYmFyQXJpYUxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdUb29sYmFyQ29udGV4dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRvb2xiYXIuY29udGV4dCA9IHRoaXMuX3BlbmRpbmdUb29sYmFyQ29udGV4dDtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Rvb2xiYXJDb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b29sYmFyO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlndXJlRm9yU2NyZWVuUmVhZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhpZGVUb29sYmFyID0gISF0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhPy5yZW5kZXJPcHRpb25zPy5oaWRlVG9vbGJhcjtcblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRpZiAoaGlkZVRvb2xiYXIpIHtcblx0XHRcdFx0Ly8gaGlkZVRvb2xiYXIgaXMgYXV0aG9yaXRhdGl2ZTsgZG9uJ3QgcmV2ZWFsIHRoZSB3cmFwcGVyIGp1c3Rcblx0XHRcdFx0Ly8gYmVjYXVzZSBTUiBtb2RlIGlzIG9uLlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl90b29sYmFyRWxlbWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90b29sYmFyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdFx0Ly8gU2NyZWVuIHJlYWRlcnMgbmVlZCB0aGUgdG9vbGJhciBET00gdG8gZXhpc3Qgc28gaXQgY2FuIGJlXG5cdFx0XHRcdC8vIGFubm91bmNlZCBhbmQgbmF2aWdhdGVkLCBidXQgb25seSBjcmVhdGUgaXQgb25jZSByZW5kZXIgZGF0YVxuXHRcdFx0XHQvLyBpcyBhdmFpbGFibGUgc28gcG9vbGVkIG9yIHJlc2V0IGluc3RhbmNlcyBkb24ndCBlYWdlcmx5XG5cdFx0XHRcdC8vIGF0dGFjaCB0b29sYmFyIGxpc3RlbmVycy5cblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEpIHtcblx0XHRcdFx0XHR0aGlzLl9lbnN1cmVUb29sYmFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGhpZGVUb29sYmFyKSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLl90b29sYmFyRWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Rvb2xiYXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRvck9wdGlvbnNGcm9tQ29uZmlnKCk6IElFZGl0b3JPcHRpb25zIHtcblx0XHRjb25zdCByZW5kZXJPcHRpb25zID0gdGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YT8ucmVuZGVyT3B0aW9ucztcblx0XHQvLyBXaGVuIHRoZSBjb2RlIGJsb2NrIGlzIGhlaWdodC1jYXBwZWQgdmlhIGBtYXhIZWlnaHRJbkxpbmVzYCwgY29udGVudCBjYW5cblx0XHQvLyBleGNlZWQgdGhlIHZpc2libGUgYXJlYS4gSW4gdGhhdCBjYXNlIHRoZSBkZWZhdWx0IGhpZGRlbiB2ZXJ0aWNhbFxuXHRcdC8vIHNjcm9sbGJhciBsZWF2ZXMgdXNlcnMgdW5hYmxlIHRvIHJlYWNoIHRoZSBjbGlwcGVkIGNvbnRlbnQgKHNlZSAjMjgzMjQyKS5cblx0XHQvLyBFbmFibGUgYSBjaGF0LXNpemVkIHZpc2libGUgc2Nyb2xsYmFyLiBDYWxsZXJzIGNhbiBzdGlsbCBvdmVycmlkZVxuXHRcdC8vIHZpYSBgcmVuZGVyT3B0aW9ucy5lZGl0b3JPcHRpb25zLnNjcm9sbGJhcmAuXG5cdFx0Y29uc3Qgc2Nyb2xsYmFyOiBJRWRpdG9yT3B0aW9uc1snc2Nyb2xsYmFyJ10gfCB1bmRlZmluZWQgPSByZW5kZXJPcHRpb25zPy5tYXhIZWlnaHRJbkxpbmVzXG5cdFx0XHQ/IHsgdmVydGljYWw6ICdhdXRvJywgdmVydGljYWxTY3JvbGxiYXJTaXplOiBkZWZhdWx0Q2hhdFNjcm9sbGJhclNpemUsIC4uLnJlbmRlck9wdGlvbnM/LmVkaXRvck9wdGlvbnM/LnNjcm9sbGJhciB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d29yZFdyYXA6IHRoaXMuZWRpdG9yT3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci53b3JkV3JhcCxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRoaXMuZWRpdG9yT3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250TGlnYXR1cmVzLFxuXHRcdFx0YnJhY2tldFBhaXJDb2xvcml6YXRpb246IHRoaXMuZWRpdG9yT3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5icmFja2V0UGFpckNvbG9yaXphdGlvbixcblx0XHRcdGZvbnRGYW1pbHk6IHRoaXMuZWRpdG9yT3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250RmFtaWx5ID09PSAnZGVmYXVsdCcgP1xuXHRcdFx0XHRFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5IDpcblx0XHRcdFx0dGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRGYW1pbHksXG5cdFx0XHRmb250U2l6ZTogdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRTaXplLFxuXHRcdFx0Zm9udFdlaWdodDogdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmZvbnRXZWlnaHQsXG5cdFx0XHRsaW5lSGVpZ2h0OiB0aGlzLmVkaXRvck9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IubGluZUhlaWdodCxcblx0XHRcdC4uLnJlbmRlck9wdGlvbnM/LmVkaXRvck9wdGlvbnMsXG5cdFx0XHQuLi4oc2Nyb2xsYmFyID8geyBzY3JvbGxiYXIgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoID0gdGhpcy5sYXN0TGF5b3V0V2lkdGgpOiB2b2lkIHtcblx0XHRpZiAod2lkdGggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgeWV0IGluIERPTVxuXHRcdH1cblxuXHRcdHRoaXMubGFzdExheW91dFdpZHRoID0gd2lkdGg7XG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuZ2V0Q29udGVudEhlaWdodCgpO1xuXG5cdFx0bGV0IGhlaWdodCA9IGNvbnRlbnRIZWlnaHQ7XG5cdFx0aWYgKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGE/LnJlbmRlck9wdGlvbnM/Lm1heEhlaWdodEluTGluZXMpIHtcblx0XHRcdGhlaWdodCA9IE1hdGgubWluKGNvbnRlbnRIZWlnaHQsIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgKiB0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhPy5yZW5kZXJPcHRpb25zPy5tYXhIZWlnaHRJbkxpbmVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JCb3JkZXIgPSAyO1xuXHRcdHdpZHRoID0gd2lkdGggLSBlZGl0b3JCb3JkZXIgLSAodGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YT8ucmVuZGVyT3B0aW9ucz8ucmVzZXJ2ZVdpZHRoID8/IDApO1xuXHRcdC8vICEhISFcblx0XHQvLyBJbXBvcnRhbnQ6IFVzaW5nIGhlcmUgcG9zdHBvbmVSZW5kZXJpbmcgPSB0cnVlIHRvIGF2b2lkIGRvaW5nIGEgc3luYyBsYXlvdXQgb24gdGhlIGVkaXRvclxuXHRcdC8vIHdoaWNoIGNhbiBiZSB2ZXJ5IGV4cGVuc2l2ZSBpZiB0aGVyZSBhcmUgbWFueSBjb2RlIGJsb2NrcyBiZWluZyBsYWlkIG91dCBhdCBvbmNlLlxuXHRcdC8vIFRoaXMgYWxsb3dzIG11bHRpcGxlIGVkaXRvcnMgdG8gY29vcmRpbmF0ZSBhbmQgcmVuZGVyIHRvZ2V0aGVyIGF0IHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZS5cblx0XHQvLyAhISEhXG5cdFx0dGhpcy5lZGl0b3IubGF5b3V0KHsgd2lkdGg6IGlzUmVxdWVzdFZNKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGE/LmVsZW1lbnQpID8gd2lkdGggKiAwLjkgOiB3aWR0aCwgaGVpZ2h0IH0sIC8qIHBvc3Rwb25lUmVuZGVyaW5nICovIHRydWUpO1xuXHRcdHRoaXMudXBkYXRlUGFkZGluZ0ZvckxheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZW50SGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvci5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdH1cblxuXHRyZW5kZXIoZGF0YTogSUNvZGVCbG9ja0RhdGEsIHdpZHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhID0gZGF0YTtcblx0XHRpZiAoZGF0YS5wYXJlbnRDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS51cGRhdGVQYXJlbnQoZGF0YS5wYXJlbnRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2V0RWRpdG9yT3B0aW9uc0Zyb21Db25maWcoKS53b3JkV3JhcCA9PT0gJ29uJykge1xuXHRcdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgZWRpdG9yIHdpdGggdGhlIG5ldyBwcm9wZXIgd2lkdGggc28gdGhhdCBnZXRDb250ZW50SGVpZ2h0XG5cdFx0XHQvLyB3aWxsIGJlIGNvbXB1dGVkIGNvcnJlY3RseSBpbiB0aGUgbmV4dCBjYWxsIHRvIGxheW91dCgpXG5cdFx0XHR0aGlzLmxheW91dCh3aWR0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlkVXBkYXRlID0gdGhpcy51cGRhdGVFZGl0b3IoZGF0YSk7XG5cdFx0aWYgKCFkaWRVcGRhdGUgfHwgdGhpcy5pc0Rpc3Bvc2VkIHx8IHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEgIT09IGRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdC4uLnRoaXMuZ2V0RWRpdG9yT3B0aW9uc0Zyb21Db25maWcoKSxcblx0XHR9KTtcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXJpYUxhYmVsKSkge1xuXHRcdFx0Ly8gRG9uJ3Qgb3ZlcnJpZGUgdGhlIGFyaWFMYWJlbCBpZiBpdCB3YXMgc2V0IGJ5IHRoZSBlZGl0b3Igb3B0aW9uc1xuXHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2NoYXQuY29kZUJsb2NrTGFiZWwnLCBcIkNvZGUgYmxvY2sgezB9XCIsIGRhdGEuY29kZUJsb2NrSW5kZXggKyAxKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR0aGlzLmxheW91dCh3aWR0aCk7XG5cdFx0Y29uc3QgdG9vbGJhckFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LmNvZGVCbG9ja1Rvb2xiYXJMYWJlbCcsIFwiQ29kZSBibG9jayB7MH1cIiwgZGF0YS5jb2RlQmxvY2tJbmRleCArIDEpO1xuXHRcdGlmICh0aGlzLnRvb2xiYXIpIHtcblx0XHRcdHRoaXMudG9vbGJhci5zZXRBcmlhTGFiZWwodG9vbGJhckFyaWFMYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdUb29sYmFyQXJpYUxhYmVsID0gdG9vbGJhckFyaWFMYWJlbDtcblx0XHR9XG5cdFx0aWYgKGRhdGEucmVuZGVyT3B0aW9ucz8uaGlkZVRvb2xiYXIpIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuX3Rvb2xiYXJFbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9tLnNob3codGhpcy5fdG9vbGJhckVsZW1lbnQpO1xuXHRcdFx0Ly8gSW4gc2NyZWVuIHJlYWRlciBtb2RlIHRoZSB0b29sYmFyIG11c3QgZXhpc3QgaW4gdGhlIERPTSBzbyBpdFxuXHRcdFx0Ly8gY2FuIGJlIGFubm91bmNlZCBhbmQgVGFiLW5hdmlnYXRlZC4gSWYgYSBwcmV2aW91cyByZW5kZXIgaGlkXG5cdFx0XHQvLyB0aGUgdG9vbGJhciwgX2Vuc3VyZVRvb2xiYXIgd291bGQgaGF2ZSBlYXJseS1leGl0ZWQ7IGNyZWF0ZVxuXHRcdFx0Ly8gaXQgbm93IHRoYXQgaXQgaXMgdmlzaWJsZS5cblx0XHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdFx0dGhpcy5fZW5zdXJlVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkYXRhLnZ1bG5zPy5sZW5ndGggJiYgaXNSZXNwb25zZVZNKGRhdGEuZWxlbWVudCkpIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy52dWxuc0xpc3RFbGVtZW50KTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCduby12dWxucycpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdnVsbmVyYWJpbGl0aWVzLWNvbGxhcHNlZCcsICFkYXRhLmVsZW1lbnQudnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkKTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy52dWxuc0xpc3RFbGVtZW50LCAuLi5kYXRhLnZ1bG5zLm1hcCh2ID0+ICQoJ2xpJywgdW5kZWZpbmVkLCAkKCdzcGFuLmNoYXQtdnVsbi10aXRsZScsIHVuZGVmaW5lZCwgdi50aXRsZSksICcgJyArIHYuZGVzY3JpcHRpb24pKSk7XG5cdFx0XHR0aGlzLnZ1bG5zQnV0dG9uLmxhYmVsID0gdGhpcy5nZXRWdWxuZXJhYmlsaXRpZXNMYWJlbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbm8tdnVsbnMnKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHRvb2xiYXIgdmlzaWJpbGl0eSBpZiB0aGUgZWxlbWVudCB3YXMgaG92ZXJlZCBiZWZvcmUgcmUtcmVuZGVyLlxuXHRcdC8vIER1cmluZyBzdHJlYW1pbmcsIGNvZGUgYmxvY2sgZWxlbWVudHMgYXJlIGJyaWVmbHkgZGV0YWNoZWQgZnJvbSBhbmRcblx0XHQvLyByZWF0dGFjaGVkIHRvIHRoZSBET00sIHdoaWNoIGNhdXNlcyB0aGUgYnJvd3NlciB0byBsb3NlIENTUyA6aG92ZXIgc3RhdGUuXG5cdFx0Ly8gVGhlIGZvcmNlLXZpc2liaWxpdHkgY2xhc3MgZW5zdXJlcyB0aGUgdG9vbGJhciByZW1haW5zIGludGVyYWN0aXZlLlxuXHRcdGlmICh0aGlzLl9pc0hvdmVyZWQpIHtcblx0XHRcdHRoaXMuX3Rvb2xiYXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvcmNlLXZpc2liaWxpdHknKTtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dCgpO1xuXG5cdFx0Ly8gVGhlIGVkaXRvciBlbGVtZW50IGlzIHR5cGljYWxseSBub3QgeWV0IGNvbm5lY3RlZCB0byB0aGUgbGl2ZSBET00gYXRcblx0XHQvLyB0aGlzIHBvaW50ICh0aGUgY2FsbGVyIHN0aWxsIG5lZWRzIHRvIGF0dGFjaCBpdCkuIEFueSByZW5kZXIgcGFzc1xuXHRcdC8vIHNjaGVkdWxlZCBieSBzZXRUZXh0L3NldExhbmd1YWdlL2xheW91dCBpcyBzaWxlbnRseSBkcm9wcGVkIGJ5IHRoZVxuXHRcdC8vIGVkaXRvciB2aWV3IHdoZW4gYGlzQ29ubmVjdGVkYCBpcyBmYWxzZS4gU2NoZWR1bGUgYSBkZWZlcnJlZCByZW5kZXJcblx0XHQvLyBzbyB0aGUgdmlldyBsaW5lcyBhcmUgcGFpbnRlZCBvbmNlIHRoZSBlbGVtZW50IGlzIGluIHRoZSBkb2N1bWVudC5cblx0XHR0aGlzLmVkaXRvci5yZW5kZXJBc3luYyh0cnVlKTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuY2xlYXJXaWRnZXRzKCk7XG5cdFx0dGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdG9uRGlkUmVtb3VudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50Q29kZUJsb2NrRGF0YSkge1xuXHRcdFx0Ly8gISEhIVxuXHRcdFx0Ly8gSW1wb3J0YW50OiBpZiB0aGUgZWRpdG9yIHdhcyBvZmYtZG9tIGFuZCBpcyBub3cgY29ubmVjdGVkLCB3ZSBuZWVkIHRvIHJlLXJlbmRlciBpdFxuXHRcdFx0Ly8gISEhIVxuXHRcdFx0dGhpcy5lZGl0b3IucmVuZGVyQXN5bmModHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcldpZGdldHMoKSB7XG5cdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5nZXQodGhpcy5lZGl0b3IpPy5oaWRlQ29udGVudEhvdmVyKCk7XG5cdFx0R2x5cGhIb3ZlckNvbnRyb2xsZXIuZ2V0KHRoaXMuZWRpdG9yKT8uaGlkZUdseXBoSG92ZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWRpdG9yKGRhdGE6IElDb2RlQmxvY2tEYXRhKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCB8fCB0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhICE9PSBkYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRUZXh0KGRhdGEudGV4dCk7XG5cdFx0dGhpcy5zZXRMYW5ndWFnZShkYXRhLmxhbmd1YWdlSWQpO1xuXHRcdHRoaXMudXBkYXRlQ29udGV4dHMoZGF0YSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VnVsbmVyYWJpbGl0aWVzTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEgfHwgIXRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEudnVsbnMpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCByZWZlcmVuY2VzTGFiZWwgPSB0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhLnZ1bG5zLmxlbmd0aCA+IDEgP1xuXHRcdFx0bG9jYWxpemUoJ3Z1bG5lcmFiaWxpdGllc1BsdXJhbCcsIFwiezB9IHZ1bG5lcmFiaWxpdGllc1wiLCB0aGlzLmN1cnJlbnRDb2RlQmxvY2tEYXRhLnZ1bG5zLmxlbmd0aCkgOlxuXHRcdFx0bG9jYWxpemUoJ3Z1bG5lcmFiaWxpdGllc1Npbmd1bGFyJywgXCJ7MH0gdnVsbmVyYWJpbGl0eVwiLCAxKTtcblx0XHRjb25zdCBpY29uID0gKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpID0+IGVsZW1lbnQudnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkID8gQ29kaWNvbi5jaGV2cm9uRG93biA6IENvZGljb24uY2hldnJvblJpZ2h0O1xuXHRcdHJldHVybiBgJHtyZWZlcmVuY2VzTGFiZWx9ICQoJHtpY29uKHRoaXMuY3VycmVudENvZGVCbG9ja0RhdGEuZWxlbWVudCBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKS5pZH0pYDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGV4dHMoZGF0YTogSUNvZGVCbG9ja0RhdGEpIHtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dDogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRjb2RlOiB0ZXh0TW9kZWwuZ2V0VGV4dEJ1ZmZlcigpLmdldFZhbHVlSW5SYW5nZSh0ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCksXG5cdFx0XHRjb2RlQmxvY2tJbmRleDogZGF0YS5jb2RlQmxvY2tJbmRleCxcblx0XHRcdGVsZW1lbnQ6IGRhdGEuZWxlbWVudCxcblx0XHRcdGxhbmd1YWdlSWQ6IHRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCksXG5cdFx0XHRjb2RlbWFwcGVyVXJpOiBkYXRhLmNvZGVtYXBwZXJVcmksXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBkYXRhLmNoYXRTZXNzaW9uUmVzb3VyY2Vcblx0XHR9O1xuXHRcdGlmICh0aGlzLnRvb2xiYXIpIHtcblx0XHRcdHRoaXMudG9vbGJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Rvb2xiYXJDb250ZXh0ID0gY29udGV4dDtcblx0XHR9XG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHRLZXkuc2V0KHRleHRNb2RlbC51cmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRUZXh0KG5ld1RleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRUZXh0ID0gdGhpcy5fdGV4dE1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpO1xuXHRcdGlmIChuZXdUZXh0ID09PSBjdXJyZW50VGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChuZXdUZXh0LnN0YXJ0c1dpdGgoY3VycmVudFRleHQpKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gbmV3VGV4dC5zbGljZShjdXJyZW50VGV4dC5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgbGFzdExpbmUgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBsYXN0Q29sID0gdGhpcy5fdGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4obGFzdExpbmUpO1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZShsYXN0TGluZSwgbGFzdENvbCwgbGFzdExpbmUsIGxhc3RDb2wpLCB0ZXh0IH1dKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbQ29kZUJsb2NrUGFydF0gc2V0VGV4dCBjb3VsZCBub3Qgb3B0aW1pemUsIGZhbGxpbmcgYmFjayB0byBzZXRWYWx1ZScpO1xuXHRcdFx0dGhpcy5fdGV4dE1vZGVsLnNldFZhbHVlKG5ld1RleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdnNjb2RlTGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShsYW5ndWFnZUlkKTtcblx0XHRpZiAodnNjb2RlTGFuZ3VhZ2VJZCAmJiB2c2NvZGVMYW5ndWFnZUlkICE9PSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSB7XG5cdFx0XHR0aGlzLl90ZXh0TW9kZWwuc2V0TGFuZ3VhZ2UodnNjb2RlTGFuZ3VhZ2VJZCk7XG5cdFx0fSBlbHNlIGlmICghdnNjb2RlTGFuZ3VhZ2VJZCAmJiB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpICE9PSBQTEFJTlRFWFRfTEFOR1VBR0VfSUQpIHtcblx0XHRcdHRoaXMuX3RleHRNb2RlbC5zZXRMYW5ndWFnZShQTEFJTlRFWFRfTEFOR1VBR0VfSUQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdENvZGVCbG9ja0NvbnRlbnRQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGV4dE1vZGVsU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihTY2hlbWFzLnZzY29kZUNoYXRDb2RlQmxvY2ssIHtcblx0XHRcdHByb3ZpZGVUZXh0Q29udGVudDogKHJlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuLy9cblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUNvbXBhcmVCbG9ja0FjdGlvbkNvbnRleHQge1xuXHRyZWFkb25seSBlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRyZWFkb25seSBkaWZmRWRpdG9yOiBJRGlmZkVkaXRvcjtcblx0cmVhZG9ubHkgZWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwO1xuXHR0b2dnbGVEaWZmVmlld01vZGUoKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUNvbXBhcmVCbG9ja0RpZmZEYXRhIHtcblx0bW9kaWZpZWQ6IElUZXh0TW9kZWw7XG5cdG9yaWdpbmFsOiBJVGV4dE1vZGVsO1xuXHRvcmlnaW5hbFNoYTE6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUNvbXBhcmVCbG9ja0RhdGEge1xuXHRyZWFkb25seSBlbGVtZW50OiBDaGF0VHJlZUl0ZW07XG5cblx0cmVhZG9ubHkgZWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwO1xuXG5cdHJlYWRvbmx5IGRpZmZEYXRhOiBQcm9taXNlPElDb2RlQ29tcGFyZUJsb2NrRGlmZkRhdGEgfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IHBhcmVudENvbnRleHRLZXlTZXJ2aWNlPzogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdHJlYWRvbmx5IGhvcml6b250YWxQYWRkaW5nPzogbnVtYmVyO1xuXHRyZWFkb25seSBpc1JlYWRPbmx5PzogYm9vbGVhbjtcblx0Ly8gcmVhZG9ubHkgaGlkZVRvb2xiYXI/OiBib29sZWFuO1xufVxuXG5cbi8vIGxvbmctbGl2ZWQgb2JqZWN0IHRoYXQgc2l0cyBpbiB0aGUgRGlmZlBvb2wgYW5kIHRoYXQgZ2V0cyByZXVzZWRcbmV4cG9ydCBjbGFzcyBDb2RlQ29tcGFyZUJsb2NrUGFydCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlmZkVkaXRvcjogRGlmZkVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSByZXNvdXJjZUxhYmVsOiBSZXNvdXJjZUxhYmVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9ySGVhZGVyOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0RGlmZkVkaXRvclZpZXdNb2RlbCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgY3VycmVudFNjcm9sbFdpZHRoID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50SG9yaXpvbnRhbFBhZGRpbmcgPSAwO1xuXG5cdHByaXZhdGUgbGFzdExheW91dFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRyZWFkb25seSBtZW51SWQ6IE1lbnVJZCxcblx0XHRkZWxlZ2F0ZTogSUNoYXRSZW5kZXJlckRlbGVnYXRlLFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNTaW1wbGVXaWRnZXQ6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLmludGVyYWN0aXZlLXJlc3VsdC1jb2RlLWJsb2NrJyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvbXBhcmUnKTtcblxuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLm1lc3NhZ2UnKSk7XG5cdFx0dGhpcy5tZXNzYWdlRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7XG5cdFx0dGhpcy5tZXNzYWdlRWxlbWVudC50YWJJbmRleCA9IDA7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZV0sXG5cdFx0XHRbSUVkaXRvclByb2dyZXNzU2VydmljZSwgbmV3IGNsYXNzIGltcGxlbWVudHMgSUVkaXRvclByb2dyZXNzU2VydmljZSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0c2hvdyhfdG90YWw6IHVua25vd24sIF9kZWxheT86IHVua25vd24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZW1wdHlQcm9ncmVzc1J1bm5lcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3luYyBzaG93V2hpbGUocHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiwgX2RlbGF5PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0KSkpO1xuXHRcdGNvbnN0IGVkaXRvckhlYWRlciA9IHRoaXMuZWRpdG9ySGVhZGVyID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtaGVhZGVyLnNob3ctZmlsZS1pY29ucycpKTtcblx0XHRjb25zdCBlZGl0b3JFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtZWRpdG9yJykpO1xuXHRcdHRoaXMuZGlmZkVkaXRvciA9IHRoaXMuY3JlYXRlRGlmZkVkaXRvcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSwgZWRpdG9yRWxlbWVudCwge1xuXHRcdFx0Li4uZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdGxpbmVOdW1iZXJzOiAnb24nLFxuXHRcdFx0c2VsZWN0T25MaW5lTnVtYmVyczogdHJ1ZSxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMixcblx0XHRcdGRyYWdBbmREcm9wOiBmYWxzZSxcblx0XHRcdHBhZGRpbmc6IHsgdG9wOiBkZWZhdWx0Q29kZWJsb2NrUGFkZGluZywgYm90dG9tOiBkZWZhdWx0Q29kZWJsb2NrUGFkZGluZyB9LFxuXHRcdFx0bW91c2VXaGVlbFpvb206IGZhbHNlLFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdHZlcnRpY2FsOiAnaGlkZGVuJyxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0ZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlazogZmFsc2UsXG5cdFx0XHRnb3RvTG9jYXRpb246IHtcblx0XHRcdFx0bXVsdGlwbGU6ICdnb3RvJyxcblx0XHRcdFx0bXVsdGlwbGVEZWNsYXJhdGlvbnM6ICdnb3RvJyxcblx0XHRcdFx0bXVsdGlwbGVEZWZpbml0aW9uczogJ2dvdG8nLFxuXHRcdFx0XHRtdWx0aXBsZUltcGxlbWVudGF0aW9uczogJ2dvdG8nLFxuXHRcdFx0fSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2NoYXQuY29kZUJsb2NrSGVscCcsICdDb2RlIGJsb2NrJyksXG5cdFx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlLFxuXHRcdFx0Li4udGhpcy5nZXRFZGl0b3JPcHRpb25zRnJvbUNvbmZpZygpLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZXNvdXJjZUxhYmVsID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbCwgZWRpdG9ySGVhZGVyLCB7IHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBlZGl0b3JTY29wZWRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGVkaXRvckhlYWRlcikpO1xuXHRcdGNvbnN0IGVkaXRvclNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGVkaXRvclNjb3BlZFNlcnZpY2VdKSkpO1xuXHRcdHRoaXMudG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKGVkaXRvclNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBlZGl0b3JIZWFkZXIsIG1lbnVJZCwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb25maWd1cmVGb3JTY3JlZW5SZWFkZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHRoaXMuX2NvbmZpZ3VyZUZvclNjcmVlblJlYWRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdGVkS2V5cy5oYXMoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5DaGF0KSkge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmVGb3JTY3JlZW5SZWFkZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9wdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kaWZmRWRpdG9yLnVwZGF0ZU9wdGlvbnModGhpcy5nZXRFZGl0b3JPcHRpb25zRnJvbUNvbmZpZygpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5vbkRpZFNjcm9sbENoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuY3VycmVudFNjcm9sbFdpZHRoID0gZS5zY3JvbGxXaWR0aDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyk7XG5cdFx0XHRXb3JkSGlnaGxpZ2h0ZXJDb250cmlidXRpb24uZ2V0KHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpKT8uc3RvcEhpZ2hsaWdodGluZygpO1xuXHRcdFx0dGhpcy5jbGVhcldpZGdldHMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZm9jdXNlZCcpO1xuXHRcdFx0V29yZEhpZ2hsaWdodGVyQ29udHJpYnV0aW9uLmdldCh0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSk/LnJlc3RvcmVWaWV3U3RhdGUodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cblx0XHQvLyBQYXJlbnQgbGlzdCBzY3JvbGxlZFxuXHRcdGlmIChkZWxlZ2F0ZS5vbkRpZFNjcm9sbCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZGVsZWdhdGUub25EaWRTY3JvbGwoZSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXJXaWRnZXRzKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRNb2RlbCgpPy51cmk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURpZmZFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcGFyZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogUmVhZG9ubHk8SUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnM+KTogRGlmZkVkaXRvcldpZGdldCB7XG5cdFx0Y29uc3Qgd2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdFx0aXNTaW1wbGVXaWRnZXQ6IHRoaXMuaXNTaW1wbGVXaWRnZXQsXG5cdFx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRNZW51UHJldmVudGVyLklELFxuXHRcdFx0XHRTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCxcblx0XHRcdFx0Q29udGV4dE1lbnVDb250cm9sbGVyLklELFxuXG5cdFx0XHRcdFdvcmRIaWdobGlnaHRlckNvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0Vmlld3BvcnRTZW1hbnRpY1Rva2Vuc0NvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0QnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5JRCxcblx0XHRcdFx0U21hcnRTZWxlY3RDb250cm9sbGVyLklELFxuXHRcdFx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLklELFxuXHRcdFx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5JRCxcblx0XHRcdFx0R290b0RlZmluaXRpb25BdFBvc2l0aW9uRWRpdG9yQ29udHJpYnV0aW9uLklELFxuXHRcdFx0XSlcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JXaWRnZXQsIHBhcmVudCwge1xuXHRcdFx0c2Nyb2xsYmFyOiB7IHVzZVNoYWRvd3M6IGZhbHNlLCBhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsIGlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQ6IHRydWUsIH0sXG5cdFx0XHRyZW5kZXJNYXJnaW5SZXZlcnRJY29uOiBmYWxzZSxcblx0XHRcdGRpZmZDb2RlTGVuczogZmFsc2UsXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRzdGlja3lTY3JvbGw6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdG9yaWdpbmFsQXJpYUxhYmVsOiBsb2NhbGl6ZSgnb3JpZ2luYWwnLCAnT3JpZ2luYWwnKSxcblx0XHRcdG1vZGlmaWVkQXJpYUxhYmVsOiBsb2NhbGl6ZSgnbW9kaWZpZWQnLCAnTW9kaWZpZWQnKSxcblx0XHRcdGRpZmZBbGdvcml0aG06ICdhZHZhbmNlZCcsXG5cdFx0XHRyZWFkT25seTogZmFsc2UsXG5cdFx0XHRpc0luRW1iZWRkZWRFZGl0b3I6IHRydWUsXG5cdFx0XHR1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkOiB0cnVlLFxuXHRcdFx0ZXhwZXJpbWVudGFsOiB7XG5cdFx0XHRcdHVzZVRydWVJbmxpbmVWaWV3OiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdHJlbmRlclNpZGVCeVNpZGVJbmxpbmVCcmVha3BvaW50OiAzMDAsXG5cdFx0XHRyZW5kZXJPdmVydmlld1J1bGVyOiBmYWxzZSxcblx0XHRcdGNvbXBhY3RNb2RlOiB0cnVlLFxuXHRcdFx0aGlkZVVuY2hhbmdlZFJlZ2lvbnM6IHsgZW5hYmxlZDogdHJ1ZSwgY29udGV4dExpbmVDb3VudDogMSB9LFxuXHRcdFx0cmVuZGVyR3V0dGVyTWVudTogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAxLFxuXHRcdFx0Li4ub3B0aW9uc1xuXHRcdH0sIHsgb3JpZ2luYWxFZGl0b3I6IHdpZGdldE9wdGlvbnMsIG1vZGlmaWVkRWRpdG9yOiB3aWRnZXRPcHRpb25zIH0pKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlmZkVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQYWRkaW5nRm9yTGF5b3V0KCkge1xuXHRcdC8vIHNjcm9sbFdpZHRoID0gXCJ0aGUgd2lkdGggb2YgdGhlIGNvbnRlbnQgdGhhdCBuZWVkcyB0byBiZSBzY3JvbGxlZFwiXG5cdFx0Ly8gY29udGVudFdpZHRoID0gXCJ0aGUgd2lkdGggb2YgdGhlIGFyZWEgd2hlcmUgY29udGVudCBpcyBkaXNwbGF5ZWRcIlxuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxiYXJWaXNpYmxlID0gdGhpcy5jdXJyZW50U2Nyb2xsV2lkdGggPiB0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRMYXlvdXRJbmZvKCkuY29udGVudFdpZHRoO1xuXHRcdGNvbnN0IHNjcm9sbGJhckhlaWdodCA9IHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmdldExheW91dEluZm8oKS5ob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0O1xuXHRcdGNvbnN0IGJvdHRvbVBhZGRpbmcgPSBob3Jpem9udGFsU2Nyb2xsYmFyVmlzaWJsZSA/XG5cdFx0XHRNYXRoLm1heChkZWZhdWx0Q29kZWJsb2NrUGFkZGluZyAtIHNjcm9sbGJhckhlaWdodCwgMikgOlxuXHRcdFx0ZGVmYXVsdENvZGVibG9ja1BhZGRpbmc7XG5cdFx0dGhpcy5kaWZmRWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBwYWRkaW5nOiB7IHRvcDogZGVmYXVsdENvZGVibG9ja1BhZGRpbmcsIGJvdHRvbTogYm90dG9tUGFkZGluZyB9IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlndXJlRm9yU2NyZWVuUmVhZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xiYXJFbHQgPSB0aGlzLnRvb2xiYXIuZ2V0RWxlbWVudCgpO1xuXHRcdC8vIEFsd2F5cyBzaG93IHRvb2xiYXIsIGJ1dCBhZGQgYXJpYS1sYWJlbCBmb3Igc2NyZWVuIHJlYWRlcnNcblx0XHR0b29sYmFyRWx0LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdHRvb2xiYXJFbHQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuY29kZUJsb2NrLnRvb2xiYXInLCAnQ29kZSBibG9jayB0b29sYmFyJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JPcHRpb25zRnJvbUNvbmZpZygpOiBJRWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdvcmRXcmFwOiB0aGlzLm9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3Iud29yZFdyYXAsXG5cdFx0XHRmb250TGlnYXR1cmVzOiB0aGlzLm9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuZm9udExpZ2F0dXJlcyxcblx0XHRcdGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uOiB0aGlzLm9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuYnJhY2tldFBhaXJDb2xvcml6YXRpb24sXG5cdFx0XHRmb250RmFtaWx5OiB0aGlzLm9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuZm9udEZhbWlseSA9PT0gJ2RlZmF1bHQnID9cblx0XHRcdFx0RURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSA6XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250RmFtaWx5LFxuXHRcdFx0Zm9udFNpemU6IHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250U2l6ZSxcblx0XHRcdGZvbnRXZWlnaHQ6IHRoaXMub3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5mb250V2VpZ2h0LFxuXHRcdFx0bGluZUhlaWdodDogdGhpcy5vcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLmxpbmVIZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdGxheW91dCh3aWR0aCA9IHRoaXMubGFzdExheW91dFdpZHRoKTogdm9pZCB7XG5cdFx0aWYgKHdpZHRoID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IHlldCBpbiBET01cblx0XHR9XG5cblx0XHR0aGlzLmxhc3RMYXlvdXRXaWR0aCA9IHdpZHRoO1xuXG5cdFx0Y29uc3QgZWRpdG9yQm9yZGVyID0gMjtcblxuXHRcdGNvbnN0IHRvb2xiYXIgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5lZGl0b3JIZWFkZXIpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLmRpZmZFZGl0b3IuZ2V0TW9kZWwoKVxuXHRcdFx0PyB0aGlzLmRpZmZFZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpXG5cdFx0XHQ6IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLm1lc3NhZ2VFbGVtZW50KTtcblxuXHRcdGNvbnN0IGRpbWVuc2lvbiA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoIC0gZWRpdG9yQm9yZGVyIC0gdGhpcy5jdXJyZW50SG9yaXpvbnRhbFBhZGRpbmcgKiAyLCB0b29sYmFyICsgY29udGVudCk7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLndpZHRoID0gYCR7ZGltZW5zaW9uLndpZHRofXB4YDtcblx0XHR0aGlzLmRpZmZFZGl0b3IubGF5b3V0KGRpbWVuc2lvbi53aXRoKHVuZGVmaW5lZCwgY29udGVudCAtIGVkaXRvckJvcmRlcikpO1xuXHRcdHRoaXMudXBkYXRlUGFkZGluZ0ZvckxheW91dCgpO1xuXHR9XG5cblxuXHRhc3luYyByZW5kZXIoZGF0YTogSUNvZGVDb21wYXJlQmxvY2tEYXRhLCB3aWR0aDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHR0aGlzLmN1cnJlbnRIb3Jpem9udGFsUGFkZGluZyA9IGRhdGEuaG9yaXpvbnRhbFBhZGRpbmcgfHwgMDtcblxuXHRcdGlmIChkYXRhLnBhcmVudENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLnVwZGF0ZVBhcmVudChkYXRhLnBhcmVudENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmNvbmZpZ3VyYXRpb24ucmVzdWx0RWRpdG9yLndvcmRXcmFwID09PSAnb24nKSB7XG5cdFx0XHQvLyBJbml0aWFsaXplIHRoZSBlZGl0b3Igd2l0aCB0aGUgbmV3IHByb3BlciB3aWR0aCBzbyB0aGF0IGdldENvbnRlbnRIZWlnaHRcblx0XHRcdC8vIHdpbGwgYmUgY29tcHV0ZWQgY29ycmVjdGx5IGluIHRoZSBuZXh0IGNhbGwgdG8gbGF5b3V0KClcblx0XHRcdHRoaXMubGF5b3V0KHdpZHRoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUVkaXRvcihkYXRhLCB0b2tlbik7XG5cblx0XHR0aGlzLmxheW91dCh3aWR0aCk7XG5cdFx0dGhpcy5kaWZmRWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5jb21wYXJlQ29kZUJsb2NrTGFiZWwnLCBcIkNvZGUgRWRpdHNcIiksXG5cdFx0XHRyZWFkT25seTogISFkYXRhLmlzUmVhZE9ubHksXG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlc291cmNlTGFiZWwuZWxlbWVudC5zZXRGaWxlKGRhdGEuZWRpdC51cmksIHtcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogdHJ1ZSwgYmFkZ2VzOiBmYWxzZSB9XG5cdFx0fSk7XG5cdH1cblxuXHRyZXNldCgpIHtcblx0XHR0aGlzLmNsZWFyV2lkZ2V0cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcldpZGdldHMoKSB7XG5cdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5nZXQodGhpcy5kaWZmRWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkpPy5oaWRlQ29udGVudEhvdmVyKCk7XG5cdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5nZXQodGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkpPy5oaWRlQ29udGVudEhvdmVyKCk7XG5cdFx0R2x5cGhIb3ZlckNvbnRyb2xsZXIuZ2V0KHRoaXMuZGlmZkVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpKT8uaGlkZUdseXBoSG92ZXIoKTtcblx0XHRHbHlwaEhvdmVyQ29udHJvbGxlci5nZXQodGhpcy5kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkpPy5oaWRlR2x5cGhIb3ZlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVFZGl0b3IoZGF0YTogSUNvZGVDb21wYXJlQmxvY2tEYXRhLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGlmICghaXNSZXNwb25zZVZNKGRhdGEuZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0VkaXRBcHBsaWVkID0gQm9vbGVhbihkYXRhLmVkaXQuc3RhdGU/LmFwcGxpZWQgPz8gMCk7XG5cblx0XHRDaGF0Q29udGV4dEtleXMuZWRpdEFwcGxpZWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldChpc0VkaXRBcHBsaWVkKTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCduby1kaWZmJywgaXNFZGl0QXBwbGllZCk7XG5cblx0XHRpZiAoaXNFZGl0QXBwbGllZCkge1xuXHRcdFx0YXNzZXJ0VHlwZShkYXRhLmVkaXQuc3RhdGU/LmFwcGxpZWQpO1xuXG5cdFx0XHRjb25zdCB1cmlMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRhdGEuZWRpdC51cmksIHsgcmVsYXRpdmU6IHRydWUsIG5vUHJlZml4OiB0cnVlIH0pO1xuXG5cdFx0XHRsZXQgdGVtcGxhdGU6IHN0cmluZztcblx0XHRcdGlmIChkYXRhLmVkaXQuc3RhdGUuYXBwbGllZCA9PT0gMSkge1xuXHRcdFx0XHR0ZW1wbGF0ZSA9IGxvY2FsaXplKCdjaGF0LmVkaXRzLjEnLCBcIkFwcGxpZWQgMSBjaGFuZ2UgaW4gW1tgYHswfWBgXV1cIiwgdXJpTGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChkYXRhLmVkaXQuc3RhdGUuYXBwbGllZCA8IDApIHtcblx0XHRcdFx0dGVtcGxhdGUgPSBsb2NhbGl6ZSgnY2hhdC5lZGl0cy5yZWplY3RlZCcsIFwiRWRpdHMgaW4gW1tgYHswfWBgXV0gaGF2ZSBiZWVuIHJlamVjdGVkXCIsIHVyaUxhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlID0gbG9jYWxpemUoJ2NoYXQuZWRpdHMuTicsIFwiQXBwbGllZCB7MH0gY2hhbmdlcyBpbiBbW2BgezF9YGBdXVwiLCBkYXRhLmVkaXQuc3RhdGUuYXBwbGllZCwgdXJpTGFiZWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gcmVuZGVyRm9ybWF0dGVkVGV4dCh0ZW1wbGF0ZSwge1xuXHRcdFx0XHRyZW5kZXJDb2RlU2VnbWVudHM6IHRydWUsXG5cdFx0XHRcdGFjdGlvbkhhbmRsZXI6IHtcblx0XHRcdFx0XHRjYWxsYmFjazogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oZGF0YS5lZGl0LnVyaSwgeyBmcm9tVXNlckdlc3R1cmU6IHRydWUsIGFsbG93Q29tbWFuZHM6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZG9tLnJlc2V0KHRoaXMubWVzc2FnZUVsZW1lbnQsIG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpZmZEYXRhID0gYXdhaXQgZGF0YS5kaWZmRGF0YTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWlzRWRpdEFwcGxpZWQgJiYgZGlmZkRhdGEpIHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuZGlmZkVkaXRvci5jcmVhdGVWaWV3TW9kZWwoe1xuXHRcdFx0XHRvcmlnaW5hbDogZGlmZkRhdGEub3JpZ2luYWwsXG5cdFx0XHRcdG1vZGlmaWVkOiBkaWZmRGF0YS5tb2RpZmllZFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHZpZXdNb2RlbC53YWl0Rm9yRGlmZigpO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IEV2ZW50LmFueShkaWZmRGF0YS5vcmlnaW5hbC5vbldpbGxEaXNwb3NlLCBkaWZmRGF0YS5tb2RpZmllZC5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRcdC8vIHRoaXMgYSBiaXQgd2VpcmQgYW5kIGJhc2ljYWxseSBkdXBsaWNhdGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvN2NiY2FmY2JjYzg4Mjk4Y2ZkY2QwMjM4MDE4ZmJiYmE4ZWI2ODUzZS9zcmMvdnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvcldpZGdldC50cyNMMzI4XG5cdFx0XHRcdC8vIHdoaWNoIGNhbm5vdCBjYWxsIGBzZXRNb2RlbChudWxsKWAgd2l0aG91dCBmaXJzdCBjb21wbGFpbmluZ1xuXHRcdFx0XHR0aGlzLmRpZmZFZGl0b3Iuc2V0TW9kZWwobnVsbCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuZGlmZkVkaXRvci5zZXRNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0dGhpcy5fbGFzdERpZmZFZGl0b3JWaWV3TW9kZWwudmFsdWUgPSBjb21iaW5lZERpc3Bvc2FibGUobGlzdGVuZXIsIHZpZXdNb2RlbCk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaWZmRWRpdG9yLnNldE1vZGVsKG51bGwpO1xuXHRcdFx0dGhpcy5fbGFzdERpZmZFZGl0b3JWaWV3TW9kZWwudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy50b29sYmFyLmNvbnRleHQgPSB7XG5cdFx0XHRlZGl0OiBkYXRhLmVkaXQsXG5cdFx0XHRlbGVtZW50OiBkYXRhLmVsZW1lbnQsXG5cdFx0XHRkaWZmRWRpdG9yOiB0aGlzLmRpZmZFZGl0b3IsXG5cdFx0XHR0b2dnbGVEaWZmVmlld01vZGU6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaXNDdXJyZW50bHlJbmxpbmUgPSAhIXRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShFZGl0b3JDb250ZXh0S2V5cy5kaWZmRWRpdG9ySW5saW5lTW9kZS5rZXkpO1xuXHRcdFx0XHRjb25zdCByZW5kZXJTaWRlQnlTaWRlID0gaXNDdXJyZW50bHlJbmxpbmU7XG5cdFx0XHRcdHRoaXMuZGlmZkVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRyZW5kZXJTaWRlQnlTaWRlLFxuXHRcdFx0XHRcdC8vIE1ha2UgaXQgbm90LWNvbXBhY3QgaW4gc2lkZSBieSBzaWRlIG1vZGUsIG90aGVyd2lzZSB3ZSBtYXkgbm90IGFjdHVhbGx5XG5cdFx0XHRcdFx0Ly8gc2hvdyBpdCBzaWRlLWJ5LXNpZGUgaWYgaXQncyBhIHNpbXBsZSBkaWZmIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvMDYzMjU2MzMzMmM3YzA4NjU2ZmI0N2M5N2JjNDMyOGQ2MmVlMWQ4MC9zcmMvdnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvZGlmZkVkaXRvck9wdGlvbnMudHMjTDM1LUwzOVxuXHRcdFx0XHRcdGNvbXBhY3RNb2RlOiAhcmVuZGVyU2lkZUJ5U2lkZSxcblx0XHRcdFx0XHR1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0XHR9LFxuXHRcdH0gc2F0aXNmaWVzIElDb2RlQ29tcGFyZUJsb2NrQWN0aW9uQ29udGV4dDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdENoYXRUZXh0RWRpdG9yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGExID0gbmV3IERlZmF1bHRNb2RlbFNIQTFDb21wdXRlcigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBhcHBseShyZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXRlbTogSUNoYXRUZXh0RWRpdEdyb3VwLCBkaWZmRWRpdG9yOiBJRGlmZkVkaXRvciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKCFyZXNwb25zZS5yZXNwb25zZS52YWx1ZS5pbmNsdWRlcyhpdGVtKSkge1xuXHRcdFx0Ly8gYm9nb3VzIGl0ZW1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXRlbS5zdGF0ZT8uYXBwbGllZCkge1xuXHRcdFx0Ly8gYWxyZWFkeSBhcHBsaWVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFkaWZmRWRpdG9yKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiB0aGlzLmVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKCkpIHtcblx0XHRcdFx0aWYgKCFjYW5kaWRhdGUuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBjYW5kaWRhdGUuZ2V0TW9kZWwoKTtcblx0XHRcdFx0aWYgKCFtb2RlbCB8fCAhaXNFcXVhbChtb2RlbC5vcmlnaW5hbC51cmksIGl0ZW0udXJpKSB8fCBtb2RlbC5tb2RpZmllZC51cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZUNoYXRDb2RlQ29tcGFyZUJsb2NrKSB7XG5cdFx0XHRcdFx0ZGlmZkVkaXRvciA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzID0gZGlmZkVkaXRvclxuXHRcdFx0PyBhd2FpdCB0aGlzLl9hcHBseVdpdGhEaWZmRWRpdG9yKGRpZmZFZGl0b3IsIGl0ZW0pXG5cdFx0XHQ6IGF3YWl0IHRoaXMuX2FwcGx5KGl0ZW0pO1xuXG5cdFx0cmVzcG9uc2Uuc2V0RWRpdEFwcGxpZWQoaXRlbSwgZWRpdHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlXaXRoRGlmZkVkaXRvcihkaWZmRWRpdG9yOiBJRGlmZkVkaXRvciwgaXRlbTogSUNoYXRUZXh0RWRpdEdyb3VwKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaWZmRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZiA9IGRpZmZFZGl0b3IuZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCk7XG5cdFx0aWYgKCFkaWZmIHx8IGRpZmYuaWRlbnRpY2FsKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblxuXHRcdGlmICghYXdhaXQgdGhpcy5fY2hlY2tTaGExKG1vZGVsLm9yaWdpbmFsLCBpdGVtKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBuZXcgVGV4dE1vZGVsVGV4dChtb2RlbC5tb2RpZmllZCk7XG5cdFx0Y29uc3QgZWRpdHMgPSBkaWZmLmNoYW5nZXMyLm1hcChpID0+IGkudG9SYW5nZU1hcHBpbmcoKS50b1RleHRFZGl0KG1vZGlmaWVkKS50b1NpbmdsZUVkaXRPcGVyYXRpb24oKSk7XG5cblx0XHRtb2RlbC5vcmlnaW5hbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0bW9kZWwub3JpZ2luYWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIGVkaXRzLCAoKSA9PiBudWxsKTtcblx0XHRtb2RlbC5vcmlnaW5hbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cblx0XHRyZXR1cm4gZWRpdHMubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHkoaXRlbTogSUNoYXRUZXh0RWRpdEdyb3VwKSB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoaXRlbS51cmkpO1xuXHRcdHRyeSB7XG5cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fY2hlY2tTaGExKHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBpdGVtKSkge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblxuXHRcdFx0cmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0bGV0IHRvdGFsID0gMDtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgaXRlbS5lZGl0cykge1xuXHRcdFx0XHRjb25zdCBlZGl0cyA9IGdyb3VwLm1hcChUZXh0RWRpdC5hc0VkaXRPcGVyYXRpb24pO1xuXHRcdFx0XHRyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgZWRpdHMsICgpID0+IG51bGwpO1xuXHRcdFx0XHR0b3RhbCArPSBlZGl0cy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHRyZXR1cm4gdG90YWw7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jaGVja1NoYTEobW9kZWw6IElUZXh0TW9kZWwsIGl0ZW06IElDaGF0VGV4dEVkaXRHcm91cCkge1xuXHRcdGlmIChpdGVtLnN0YXRlPy5zaGExICYmIHRoaXMuX3NoYTEuY29tcHV0ZVNIQTEobW9kZWwpICYmIHRoaXMuX3NoYTEuY29tcHV0ZVNIQTEobW9kZWwpICE9PSBpdGVtLnN0YXRlLnNoYTEpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2ludGVyYWN0aXZlLmNvbXBhcmUuYXBwbHkuY29uZmlybScsIFwiVGhlIG9yaWdpbmFsIGZpbGUgaGFzIGJlZW4gbW9kaWZpZWQuXCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdpbnRlcmFjdGl2ZS5jb21wYXJlLmFwcGx5LmNvbmZpcm0uZGV0YWlsJywgXCJEbyB5b3Ugd2FudCB0byBhcHBseSB0aGUgY2hhbmdlcyBhbnl3YXk/XCIpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZGlzY2FyZChyZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXRlbTogSUNoYXRUZXh0RWRpdEdyb3VwKSB7XG5cdFx0aWYgKCFyZXNwb25zZS5yZXNwb25zZS52YWx1ZS5pbmNsdWRlcyhpdGVtKSkge1xuXHRcdFx0Ly8gYm9nb3VzIGl0ZW1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXRlbS5zdGF0ZT8uYXBwbGllZCkge1xuXHRcdFx0Ly8gYWxyZWFkeSBhcHBsaWVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmVzcG9uc2Uuc2V0RWRpdEFwcGxpZWQoaXRlbSwgLTEpO1xuXHR9XG5cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBRVAsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsY0FBYztBQUV2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CLFlBQVksbUJBQW1CLDZCQUE2QjtBQUN6RixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUc3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUFrRDtBQUMzRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQztBQUM3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUF1QztBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrREFBa0Q7QUFDM0QsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBd0QsYUFBYSxvQkFBb0I7QUFJekYsU0FBUyxxQkFBcUIsOEJBQThCO0FBQzVELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBRWxDLE1BQU0sSUFBSSxJQUFJO0FBeUNkLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sMkJBQTJCO0FBQzFCLElBQU0sZ0JBQU4sY0FBNEIsV0FBVztBQUFBLEVBd0M3QyxZQUNrQixlQUNSLFFBQ1QsVUFDQSx3QkFDaUIsaUJBQTBCLE9BQ3BCLHNCQUNILG1CQUNjLGNBQ0MsaUJBQ0ssc0JBQ0Esc0JBQ1YsWUFDTSxrQkFDbkM7QUFDRCxVQUFNO0FBZFc7QUFDUjtBQUdRO0FBR2lCO0FBQ0M7QUFDSztBQUNBO0FBQ1Y7QUFDTTtBQTNCckMsU0FBUSxxQkFBcUI7QUFFN0IsU0FBUSxhQUFhO0FBQ3JCLFNBQVEscUJBQXFCO0FBRzdCLFNBQVEsYUFBYTtBQXdCcEIsU0FBSyxVQUFVLEVBQUUsZ0NBQWdDO0FBRWpELFNBQUsscUJBQXFCLHFCQUFxQixlQUFlLHdCQUF3QjtBQUN0RixTQUFLLG9CQUFvQixLQUFLLFVBQVUsa0JBQWtCLGFBQWEsS0FBSyxPQUFPLENBQUM7QUFDcEYsVUFBTSw2QkFBNkIsS0FBSyxVQUFVLHFCQUFxQixZQUFZLElBQUksa0JBQWtCLENBQUMsb0JBQW9CLEtBQUssaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0FBQ3ZKLFVBQU0sZ0JBQWdCLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSw0QkFBNEIsQ0FBQztBQUM5RSxTQUFLLFNBQVMsS0FBSyxhQUFhLDRCQUE0QixlQUFlO0FBQUEsTUFDMUUsR0FBRyx1QkFBdUIsS0FBSyxvQkFBb0I7QUFBQSxNQUNuRCxVQUFVO0FBQUEsTUFDVixhQUFhO0FBQUEsTUFDYixxQkFBcUI7QUFBQSxNQUNyQixzQkFBc0I7QUFBQSxNQUN0QixzQkFBc0I7QUFBQSxNQUN0QixhQUFhO0FBQUEsTUFDYixTQUFTLEVBQUUsS0FBSyxLQUFLLGlCQUFpQixRQUFRLEtBQUssZ0JBQWdCO0FBQUEsTUFDbkUsZ0JBQWdCO0FBQUEsTUFDaEIsV0FBVztBQUFBLFFBQ1YsVUFBVTtBQUFBLFFBQ1YseUJBQXlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLDJCQUEyQjtBQUFBLE1BQzNCLGNBQWM7QUFBQSxRQUNiLFVBQVU7QUFBQSxRQUNWLHNCQUFzQjtBQUFBLFFBQ3RCLHFCQUFxQjtBQUFBLFFBQ3JCLHlCQUF5QjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxXQUFXLFNBQVMsc0JBQXNCLFlBQVk7QUFBQSxNQUN0RDtBQUFBLE1BQ0EsY0FBYztBQUFBLE1BQ2QsR0FBRyxLQUFLLDJCQUEyQjtBQUFBLElBQ3BDLENBQUM7QUFFRCxVQUFNLGlCQUFpQixJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsd0NBQXdDLENBQUM7QUFDM0YsU0FBSyxrQkFBa0I7QUFDdkIsVUFBTSxzQkFBc0IsS0FBSyxVQUFVLEtBQUssT0FBTyxrQkFBa0IsYUFBYSxjQUFjLENBQUM7QUFDckcsVUFBTSxtQ0FBbUMsS0FBSyxVQUFVLDJCQUEyQixZQUFZLElBQUksa0JBQWtCLENBQUMsb0JBQW9CLG1CQUFtQixDQUFDLENBQUMsQ0FBQztBQUtoSyxTQUFLLGtCQUFrQixNQUFNLGlDQUFpQyxlQUFlLHNCQUFzQixnQkFBZ0IsUUFBUTtBQUFBLE1BQzFILGFBQWE7QUFBQSxRQUNaLG1CQUFtQjtBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxpQkFBaUIsSUFBSSxPQUFPLEtBQUssU0FBUyxFQUFFLDJCQUEyQixDQUFDO0FBQzlFLFVBQU0scUJBQXFCLElBQUksT0FBTyxnQkFBZ0IsRUFBRSxvQ0FBb0MsTUFBUyxDQUFDO0FBQ3RHLFNBQUssY0FBYyxLQUFLLFVBQVUsSUFBSSxPQUFPLG9CQUFvQjtBQUFBLE1BQ2hFLGtCQUFrQjtBQUFBLE1BQ2xCLGNBQWM7QUFBQSxNQUNkLGtCQUFrQjtBQUFBLE1BQ2xCLHVCQUF1QjtBQUFBLE1BQ3ZCLDJCQUEyQjtBQUFBLE1BQzNCLDJCQUEyQjtBQUFBLE1BQzNCLGdDQUFnQztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWM7QUFBQSxJQUNmLENBQUMsQ0FBQztBQUVGLFNBQUssbUJBQW1CLElBQUksT0FBTyxnQkFBZ0IsRUFBRSxrQ0FBa0MsQ0FBQztBQUV4RixTQUFLLFVBQVUsS0FBSyxZQUFZLFdBQVcsTUFBTTtBQUNoRCxZQUFNLFVBQVUsS0FBSyxxQkFBc0I7QUFDM0MsY0FBUSw4QkFBOEIsQ0FBQyxRQUFRO0FBQy9DLFdBQUssWUFBWSxRQUFRLEtBQUssd0JBQXdCO0FBQ3RELFdBQUssUUFBUSxVQUFVLE9BQU8sa0NBQWtDLENBQUMsUUFBUSwyQkFBMkI7QUFDcEcsV0FBSyxPQUFPO0FBQUEsSUFFYixDQUFDLENBQUM7QUFTRixTQUFLLGFBQWE7QUFDbEIsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssU0FBUyxjQUFjLE1BQU07QUFDMUUsV0FBSyxhQUFhO0FBQ2xCLHFCQUFlLFVBQVUsSUFBSSxrQkFBa0I7QUFDL0MsV0FBSyxlQUFlO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssU0FBUyxjQUFjLE1BQU07QUFDMUUsV0FBSyxhQUFhO0FBQ2xCLFVBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3Qix1QkFBZSxVQUFVLE9BQU8sa0JBQWtCO0FBQUEsTUFDbkQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssVUFBVSxLQUFLLHFCQUFxQixpQ0FBaUMsTUFBTSxLQUFLLDBCQUEwQixDQUFDLENBQUM7QUFDakgsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixDQUFDLE1BQU07QUFDeEUsVUFBSSxFQUFFLGFBQWEsSUFBSSxnQ0FBZ0MsSUFBSSxHQUFHO0FBQzdELGFBQUssMEJBQTBCO0FBQUEsTUFDaEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLGNBQWMsWUFBWSxNQUFNO0FBQ25ELFdBQUssT0FBTyxjQUFjLEtBQUssMkJBQTJCLENBQUM7QUFBQSxJQUM1RCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxPQUFPLGtCQUFrQixPQUFLO0FBQ2pELFdBQUsscUJBQXFCLEVBQUU7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxPQUFPLHVCQUF1QixPQUFLO0FBQ3RELFVBQUksRUFBRSxzQkFBc0I7QUFDM0IsYUFBSyxPQUFPO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssT0FBTyxzQkFBc0IsTUFBTTtBQUN0RCxXQUFLLFFBQVEsVUFBVSxPQUFPLFNBQVM7QUFDdkMsa0NBQTRCLElBQUksS0FBSyxNQUFNLEdBQUcsaUJBQWlCO0FBQy9ELFdBQUssYUFBYTtBQUFBLElBQ25CLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLE9BQU8sdUJBQXVCLE1BQU07QUFDdkQsV0FBSyxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBR3BDLFdBQUssZUFBZTtBQUNwQixrQ0FBNEIsSUFBSSxLQUFLLE1BQU0sR0FBRyxpQkFBaUIsSUFBSTtBQUFBLElBQ3BFLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxNQUFNO0FBQUEsTUFDcEIsS0FBSyxPQUFPO0FBQUEsTUFDWixLQUFLLE9BQU87QUFBQSxJQUNiLEVBQUUsTUFBTTtBQUNQLFVBQUksS0FBSyxzQkFBc0I7QUFDOUIsYUFBSyxlQUFlLEtBQUssb0JBQW9CO0FBQUEsTUFDOUM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFFBQUksU0FBUyxhQUFhO0FBQ3pCLFdBQUssVUFBVSxTQUFTLFlBQVksT0FBSztBQUN4QyxhQUFLLGFBQWE7QUFBQSxNQUNuQixDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSyxhQUFhLEtBQUssVUFBVSxLQUFLLGFBQWE7QUFBQSxNQUFZO0FBQUEsTUFBSTtBQUFBLE1BQ2xFLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxxQkFBcUIsTUFBTSxhQUFhLEVBQUUsQ0FBQztBQUFBLE1BQ3RFLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFJRCwwQkFBc0IsS0FBSyxpQkFBaUIscUJBQXFCLEtBQUssV0FBVyxHQUFHLEdBQUcsS0FBSyxNQUFNO0FBQ2xHLFNBQUssT0FBTyxTQUFTLEtBQUssVUFBVTtBQUFBLEVBQ3JDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBdE1BLE9BQU8sUUFBUSxXQUFtQixnQkFBZ0M7QUFDakUsV0FBTyxHQUFHLFNBQVMsSUFBSSxjQUFjO0FBQUEsRUFDdEM7QUFBQSxFQTJCQSxJQUFZLGtCQUEwQjtBQUNyQyxXQUFPLEtBQUssc0JBQXNCLGVBQWUsbUJBQW1CO0FBQUEsRUFDckU7QUFBQSxFQXlLUyxVQUFVO0FBQ2xCLFNBQUssYUFBYTtBQUNsQixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQUEsRUFFQSxJQUFJLE1BQXVCO0FBQzFCLFdBQU8sS0FBSyxPQUFPLFNBQVMsR0FBRztBQUFBLEVBQ2hDO0FBQUEsRUFFUSxhQUFhLHNCQUE2QyxRQUFxQixTQUFpRTtBQUN2SixXQUFPLEtBQUssVUFBVSxxQkFBcUIsZUFBZSxrQkFBa0IsUUFBUSxTQUFTO0FBQUEsTUFDNUYsZ0JBQWdCLEtBQUs7QUFBQSxNQUNyQixlQUFlLHlCQUF5QiwyQkFBMkI7QUFBQSxRQUNsRSxjQUFjO0FBQUEsUUFDZDtBQUFBLFFBQ0Esc0JBQXNCO0FBQUEsUUFFdEIsNEJBQTRCO0FBQUEsUUFDNUIsbUNBQW1DO0FBQUEsUUFDbkMsMEJBQTBCO0FBQUEsUUFDMUIsc0JBQXNCO0FBQUEsUUFDdEIsdUJBQXVCO0FBQUEsUUFDdkIscUJBQXFCO0FBQUEsUUFDckIsa0JBQWtCO0FBQUEsUUFDbEIsMkNBQTJDO0FBQUEsUUFDM0Msa0JBQWtCO0FBQUEsUUFDbEIsbUJBQW1CO0FBQUEsUUFDbkIsY0FBYztBQUFBLFFBQ2QsYUFBYTtBQUFBLFFBRWIsOEJBQThCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssT0FBTyxNQUFNO0FBQUEsRUFDbkI7QUFBQSxFQUVRLHlCQUF5QjtBQUdoQyxVQUFNLDZCQUE2QixLQUFLLHFCQUFxQixLQUFLLE9BQU8sY0FBYyxFQUFFO0FBQ3pGLFVBQU0sa0JBQWtCLEtBQUssT0FBTyxjQUFjLEVBQUU7QUFDcEQsVUFBTSxnQkFBZ0IsNkJBQ3JCLEtBQUssSUFBSSxLQUFLLGtCQUFrQixpQkFBaUIsQ0FBQyxJQUNsRCxLQUFLO0FBQ04sU0FBSyxPQUFPLGNBQWMsRUFBRSxTQUFTLEVBQUUsS0FBSyxLQUFLLGlCQUFpQixRQUFRLGNBQWMsRUFBRSxDQUFDO0FBQUEsRUFDNUY7QUFBQSxFQUVRLGlCQUFtRDtBQUMxRCxRQUFJLEtBQUssWUFBWTtBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUlBLFFBQUksS0FBSyxzQkFBc0IsZUFBZSxhQUFhO0FBQzFELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixZQUFNLFVBQVUsS0FBSztBQUNyQixVQUFJLENBQUMsU0FBUztBQUNiLGVBQU87QUFBQSxNQUNSO0FBQ0EsV0FBSyxrQkFBa0I7QUFDdkIsWUFBTSxVQUFVLEtBQUssVUFBVSxRQUFRLENBQUM7QUFDeEMsV0FBSyxVQUFVO0FBRWYsV0FBSyxVQUFVLFFBQVEsOEJBQThCLE9BQUs7QUFDekQsYUFBSyxxQkFBcUI7QUFDMUIsYUFBSyxnQkFBZ0IsVUFBVSxPQUFPLG9CQUFvQixLQUFLLEtBQUssVUFBVTtBQUFBLE1BQy9FLENBQUMsQ0FBQztBQUVGLFVBQUksS0FBSyw2QkFBNkIsUUFBVztBQUNoRCxnQkFBUSxhQUFhLEtBQUssd0JBQXdCO0FBQ2xELGFBQUssMkJBQTJCO0FBQUEsTUFDakM7QUFDQSxVQUFJLEtBQUssMkJBQTJCLFFBQVc7QUFDOUMsZ0JBQVEsVUFBVSxLQUFLO0FBQ3ZCLGFBQUsseUJBQXlCO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsNEJBQWtDO0FBQ3pDLFVBQU0sY0FBYyxDQUFDLENBQUMsS0FBSyxzQkFBc0IsZUFBZTtBQUNoRSxRQUFJLEtBQUsscUJBQXFCLHdCQUF3QixHQUFHO0FBQ3hELFVBQUksYUFBYTtBQUdoQixZQUFJLEtBQUssS0FBSyxlQUFlO0FBQUEsTUFDOUIsT0FBTztBQUNOLGFBQUssZ0JBQWdCLE1BQU0sVUFBVTtBQUtyQyxZQUFJLEtBQUssc0JBQXNCO0FBQzlCLGVBQUssZUFBZTtBQUFBLFFBQ3JCO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FBVyxhQUFhO0FBQ3ZCLFVBQUksS0FBSyxLQUFLLGVBQWU7QUFBQSxJQUM5QixPQUFPO0FBQ04sV0FBSyxnQkFBZ0IsTUFBTSxVQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFUSw2QkFBNkM7QUFDcEQsVUFBTSxnQkFBZ0IsS0FBSyxzQkFBc0I7QUFNakQsVUFBTSxZQUFxRCxlQUFlLG1CQUN2RSxFQUFFLFVBQVUsUUFBUSx1QkFBdUIsMEJBQTBCLEdBQUcsZUFBZSxlQUFlLFVBQVUsSUFDaEg7QUFDSCxXQUFPO0FBQUEsTUFDTixVQUFVLEtBQUssY0FBYyxjQUFjLGFBQWE7QUFBQSxNQUN4RCxlQUFlLEtBQUssY0FBYyxjQUFjLGFBQWE7QUFBQSxNQUM3RCx5QkFBeUIsS0FBSyxjQUFjLGNBQWMsYUFBYTtBQUFBLE1BQ3ZFLFlBQVksS0FBSyxjQUFjLGNBQWMsYUFBYSxlQUFlLFlBQ3hFLHFCQUFxQixhQUNyQixLQUFLLGNBQWMsY0FBYyxhQUFhO0FBQUEsTUFDL0MsVUFBVSxLQUFLLGNBQWMsY0FBYyxhQUFhO0FBQUEsTUFDeEQsWUFBWSxLQUFLLGNBQWMsY0FBYyxhQUFhO0FBQUEsTUFDMUQsWUFBWSxLQUFLLGNBQWMsY0FBYyxhQUFhO0FBQUEsTUFDMUQsR0FBRyxlQUFlO0FBQUEsTUFDbEIsR0FBSSxZQUFZLEVBQUUsVUFBVSxJQUFJLENBQUM7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQU8sUUFBUSxLQUFLLGlCQUF1QjtBQUMxQyxRQUFJLFVBQVUsUUFBVztBQUN4QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGtCQUFrQjtBQUN2QixVQUFNLGdCQUFnQixLQUFLLGlCQUFpQjtBQUU1QyxRQUFJLFNBQVM7QUFDYixRQUFJLEtBQUssc0JBQXNCLGVBQWUsa0JBQWtCO0FBQy9ELGVBQVMsS0FBSyxJQUFJLGVBQWUsS0FBSyxPQUFPLFVBQVUsYUFBYSxVQUFVLElBQUksS0FBSyxzQkFBc0IsZUFBZSxnQkFBZ0I7QUFBQSxJQUM3STtBQUVBLFVBQU0sZUFBZTtBQUNyQixZQUFRLFFBQVEsZ0JBQWdCLEtBQUssc0JBQXNCLGVBQWUsZ0JBQWdCO0FBTTFGLFNBQUssT0FBTztBQUFBLE1BQU8sRUFBRSxPQUFPLFlBQVksS0FBSyxzQkFBc0IsT0FBTyxJQUFJLFFBQVEsTUFBTSxPQUFPLE9BQU87QUFBQTtBQUFBLE1BQTJCO0FBQUEsSUFBSTtBQUN6SSxTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFUSxtQkFBbUI7QUFDMUIsV0FBTyxLQUFLLE9BQU8saUJBQWlCO0FBQUEsRUFDckM7QUFBQSxFQUVBLE9BQU8sTUFBc0IsT0FBZTtBQUMzQyxTQUFLLHVCQUF1QjtBQUM1QixRQUFJLEtBQUsseUJBQXlCO0FBQ2pDLFdBQUssa0JBQWtCLGFBQWEsS0FBSyx1QkFBdUI7QUFBQSxJQUNqRTtBQUVBLFFBQUksS0FBSywyQkFBMkIsRUFBRSxhQUFhLE1BQU07QUFHeEQsV0FBSyxPQUFPLEtBQUs7QUFBQSxJQUNsQjtBQUVBLFVBQU0sWUFBWSxLQUFLLGFBQWEsSUFBSTtBQUN4QyxRQUFJLENBQUMsYUFBYSxLQUFLLGNBQWMsS0FBSyx5QkFBeUIsTUFBTTtBQUN4RTtBQUFBLElBQ0Q7QUFFQSxTQUFLLE9BQU8sY0FBYztBQUFBLE1BQ3pCLEdBQUcsS0FBSywyQkFBMkI7QUFBQSxJQUNwQyxDQUFDO0FBQ0QsUUFBSSxDQUFDLEtBQUssT0FBTyxVQUFVLGFBQWEsU0FBUyxHQUFHO0FBRW5ELFdBQUssT0FBTyxjQUFjO0FBQUEsUUFDekIsV0FBVyxTQUFTLHVCQUF1QixrQkFBa0IsS0FBSyxpQkFBaUIsQ0FBQztBQUFBLE1BQ3JGLENBQUM7QUFBQSxJQUNGO0FBQ0EsU0FBSyxPQUFPLEtBQUs7QUFDakIsVUFBTSxtQkFBbUIsU0FBUyw4QkFBOEIsa0JBQWtCLEtBQUssaUJBQWlCLENBQUM7QUFDekcsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSyxRQUFRLGFBQWEsZ0JBQWdCO0FBQUEsSUFDM0MsT0FBTztBQUNOLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFDQSxRQUFJLEtBQUssZUFBZSxhQUFhO0FBQ3BDLFVBQUksS0FBSyxLQUFLLGVBQWU7QUFBQSxJQUM5QixPQUFPO0FBQ04sVUFBSSxLQUFLLEtBQUssZUFBZTtBQUs3QixVQUFJLEtBQUsscUJBQXFCLHdCQUF3QixHQUFHO0FBQ3hELGFBQUssZUFBZTtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxPQUFPLFVBQVUsYUFBYSxLQUFLLE9BQU8sR0FBRztBQUNyRCxVQUFJLFVBQVUsS0FBSyxnQkFBZ0I7QUFDbkMsV0FBSyxRQUFRLFVBQVUsT0FBTyxVQUFVO0FBQ3hDLFdBQUssUUFBUSxVQUFVLE9BQU8sa0NBQWtDLENBQUMsS0FBSyxRQUFRLDJCQUEyQjtBQUN6RyxVQUFJLE9BQU8sS0FBSyxrQkFBa0IsR0FBRyxLQUFLLE1BQU0sSUFBSSxPQUFLLEVBQUUsTUFBTSxRQUFXLEVBQUUsd0JBQXdCLFFBQVcsRUFBRSxLQUFLLEdBQUcsTUFBTSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ2hKLFdBQUssWUFBWSxRQUFRLEtBQUssd0JBQXdCO0FBQUEsSUFDdkQsT0FBTztBQUNOLFdBQUssUUFBUSxVQUFVLElBQUksVUFBVTtBQUFBLElBQ3RDO0FBTUEsUUFBSSxLQUFLLFlBQVk7QUFDcEIsV0FBSyxnQkFBZ0IsVUFBVSxJQUFJLGtCQUFrQjtBQUFBLElBQ3REO0FBRUEsU0FBSyxPQUFPO0FBT1osU0FBSyxPQUFPLFlBQVksSUFBSTtBQUFBLEVBQzdCO0FBQUEsRUFFQSxRQUFRO0FBQ1AsU0FBSyxhQUFhO0FBQ2xCLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQUVBLGVBQXFCO0FBQ3BCLFFBQUksS0FBSyxzQkFBc0I7QUFJOUIsV0FBSyxPQUFPLFlBQVksSUFBSTtBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZTtBQUN0QiwyQkFBdUIsSUFBSSxLQUFLLE1BQU0sR0FBRyxpQkFBaUI7QUFDMUQseUJBQXFCLElBQUksS0FBSyxNQUFNLEdBQUcsZUFBZTtBQUFBLEVBQ3ZEO0FBQUEsRUFFUSxhQUFhLE1BQStCO0FBQ25ELFFBQUksS0FBSyxjQUFjLEtBQUsseUJBQXlCLE1BQU07QUFDMUQsYUFBTztBQUFBLElBQ1I7QUFFQSxTQUFLLFFBQVEsS0FBSyxJQUFJO0FBQ3RCLFNBQUssWUFBWSxLQUFLLFVBQVU7QUFDaEMsU0FBSyxlQUFlLElBQUk7QUFFeEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDBCQUFrQztBQUN6QyxRQUFJLENBQUMsS0FBSyx3QkFBd0IsQ0FBQyxLQUFLLHFCQUFxQixPQUFPO0FBQ25FLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxrQkFBa0IsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLElBQ2hFLFNBQVMseUJBQXlCLHVCQUF1QixLQUFLLHFCQUFxQixNQUFNLE1BQU0sSUFDL0YsU0FBUywyQkFBMkIscUJBQXFCLENBQUM7QUFDM0QsVUFBTSxPQUFPLENBQUMsWUFBb0MsUUFBUSw4QkFBOEIsUUFBUSxjQUFjLFFBQVE7QUFDdEgsV0FBTyxHQUFHLGVBQWUsTUFBTSxLQUFLLEtBQUsscUJBQXFCLE9BQWlDLEVBQUUsRUFBRTtBQUFBLEVBQ3BHO0FBQUEsRUFFUSxlQUFlLE1BQXNCO0FBQzVDLFVBQU0sWUFBWSxLQUFLLE9BQU8sU0FBUztBQUN2QyxRQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBbUM7QUFBQSxNQUN4QyxNQUFNLFVBQVUsY0FBYyxFQUFFLGdCQUFnQixVQUFVLGtCQUFrQixHQUFHLG9CQUFvQixXQUFXO0FBQUEsTUFDOUcsZ0JBQWdCLEtBQUs7QUFBQSxNQUNyQixTQUFTLEtBQUs7QUFBQSxNQUNkLFlBQVksVUFBVSxjQUFjO0FBQUEsTUFDcEMsZUFBZSxLQUFLO0FBQUEsTUFDcEIscUJBQXFCLEtBQUs7QUFBQSxJQUMzQjtBQUNBLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFdBQUssUUFBUSxVQUFVO0FBQUEsSUFDeEIsT0FBTztBQUNOLFdBQUsseUJBQXlCO0FBQUEsSUFDL0I7QUFDQSxTQUFLLG1CQUFtQixJQUFJLFVBQVUsR0FBRztBQUFBLEVBQzFDO0FBQUEsRUFFUSxRQUFRLFNBQXVCO0FBQ3RDLFVBQU0sY0FBYyxLQUFLLFdBQVcsU0FBUyxvQkFBb0IsRUFBRTtBQUNuRSxRQUFJLFlBQVksYUFBYTtBQUM1QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFFBQVEsV0FBVyxXQUFXLEdBQUc7QUFDcEMsWUFBTSxPQUFPLFFBQVEsTUFBTSxZQUFZLE1BQU07QUFDN0MsWUFBTSxXQUFXLEtBQUssV0FBVyxhQUFhO0FBQzlDLFlBQU0sVUFBVSxLQUFLLFdBQVcsaUJBQWlCLFFBQVE7QUFDekQsV0FBSyxXQUFXLFdBQVcsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLFVBQVUsU0FBUyxVQUFVLE9BQU8sR0FBRyxLQUFLLENBQUMsQ0FBQztBQUFBLElBQzlGLE9BQU87QUFDTixXQUFLLFdBQVcsTUFBTSxzRUFBc0U7QUFDNUYsV0FBSyxXQUFXLFNBQVMsT0FBTztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBRVEsWUFBWSxZQUEwQjtBQUM3QyxVQUFNLG1CQUFtQixLQUFLLGdCQUFnQiw0QkFBNEIsVUFBVTtBQUNwRixRQUFJLG9CQUFvQixxQkFBcUIsS0FBSyxXQUFXLGNBQWMsR0FBRztBQUM3RSxXQUFLLFdBQVcsWUFBWSxnQkFBZ0I7QUFBQSxJQUM3QyxXQUFXLENBQUMsb0JBQW9CLEtBQUssV0FBVyxjQUFjLE1BQU0sdUJBQXVCO0FBQzFGLFdBQUssV0FBVyxZQUFZLHFCQUFxQjtBQUFBLElBQ2xEO0FBQUEsRUFDRDtBQUNEO0FBdGhCYSxnQkFBTjtBQUFBLEVBOENKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckRVO0FBd2hCTixJQUFNLCtCQUFOLGNBQTJDLFdBQVc7QUFBQSxFQUU1RCxZQUNvQixrQkFDYSxlQUMvQjtBQUNELFVBQU07QUFGMEI7QUFHaEMsU0FBSyxVQUFVLGlCQUFpQixpQ0FBaUMsUUFBUSxxQkFBcUI7QUFBQSxNQUM3RixvQkFBb0IsQ0FBQyxhQUFrQjtBQUN0QyxlQUFPLFFBQVEsUUFBUSxLQUFLLGNBQWMsU0FBUyxRQUFRLENBQUM7QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEO0FBYmEsK0JBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSlU7QUE4Q04sSUFBTSx1QkFBTixjQUFtQyxXQUFXO0FBQUEsRUFlcEQsWUFDa0IsU0FDUixRQUNULFVBQ0Esd0JBQ2lCLGlCQUEwQixPQUNwQixzQkFDSCxtQkFDYyxjQUNNLHNCQUNBLHNCQUNSLGNBQ0MsZUFDaEM7QUFDRCxVQUFNO0FBYlc7QUFDUjtBQUdRO0FBR2lCO0FBQ007QUFDQTtBQUNSO0FBQ0M7QUFsQmxDLFNBQWlCLDJCQUEyQixLQUFLLE9BQU8sSUFBSSxJQUFJLGtCQUFrQixDQUFDO0FBQ25GLFNBQVEscUJBQXFCO0FBQzdCLFNBQVEsMkJBQTJCO0FBbUJsQyxTQUFLLFVBQVUsRUFBRSxnQ0FBZ0M7QUFDakQsU0FBSyxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBRXBDLFNBQUssaUJBQWlCLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSxVQUFVLENBQUM7QUFDNUQsU0FBSyxlQUFlLGFBQWEsUUFBUSxRQUFRO0FBQ2pELFNBQUssZUFBZSxXQUFXO0FBRS9CLFNBQUssb0JBQW9CLEtBQUssVUFBVSxrQkFBa0IsYUFBYSxLQUFLLE9BQU8sQ0FBQztBQUNwRixVQUFNLDZCQUE2QixLQUFLLFVBQVUscUJBQXFCLFlBQVksSUFBSTtBQUFBLE1BQ3RGLENBQUMsb0JBQW9CLEtBQUssaUJBQWlCO0FBQUEsTUFDM0MsQ0FBQyx3QkFBd0IsSUFBSSxNQUF3QztBQUFBLFFBRXBFLEtBQUssUUFBaUIsUUFBa0I7QUFDdkMsaUJBQU87QUFBQSxRQUNSO0FBQUEsUUFDQSxNQUFNLFVBQVUsU0FBMkIsUUFBZ0M7QUFDMUUsZ0JBQU07QUFBQSxRQUNQO0FBQUEsTUFDRCxHQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFDRixVQUFNLGVBQWUsS0FBSyxlQUFlLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSw0Q0FBNEMsQ0FBQztBQUNqSCxVQUFNLGdCQUFnQixJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsNEJBQTRCLENBQUM7QUFDOUUsU0FBSyxhQUFhLEtBQUssaUJBQWlCLDRCQUE0QixlQUFlO0FBQUEsTUFDbEYsR0FBRyx1QkFBdUIsS0FBSyxvQkFBb0I7QUFBQSxNQUNuRCxhQUFhO0FBQUEsTUFDYixxQkFBcUI7QUFBQSxNQUNyQixzQkFBc0I7QUFBQSxNQUN0QixzQkFBc0I7QUFBQSxNQUN0QixhQUFhO0FBQUEsTUFDYixTQUFTLEVBQUUsS0FBSyx5QkFBeUIsUUFBUSx3QkFBd0I7QUFBQSxNQUN6RSxnQkFBZ0I7QUFBQSxNQUNoQixXQUFXO0FBQUEsUUFDVixVQUFVO0FBQUEsUUFDVix5QkFBeUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsMkJBQTJCO0FBQUEsTUFDM0IsY0FBYztBQUFBLFFBQ2IsVUFBVTtBQUFBLFFBQ1Ysc0JBQXNCO0FBQUEsUUFDdEIscUJBQXFCO0FBQUEsUUFDckIseUJBQXlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFdBQVcsU0FBUyxzQkFBc0IsWUFBWTtBQUFBLE1BQ3REO0FBQUEsTUFDQSxHQUFHLEtBQUssMkJBQTJCO0FBQUEsSUFDcEMsQ0FBQztBQUVELFNBQUssZ0JBQWdCLEtBQUssVUFBVSwyQkFBMkIsZUFBZSxlQUFlLGNBQWMsRUFBRSxjQUFjLEtBQUssQ0FBQyxDQUFDO0FBRWxJLFVBQU0sc0JBQXNCLEtBQUssVUFBVSxLQUFLLFdBQVcsa0JBQWtCLEVBQUUsa0JBQWtCLGFBQWEsWUFBWSxDQUFDO0FBQzNILFVBQU0sbUNBQW1DLEtBQUssVUFBVSwyQkFBMkIsWUFBWSxJQUFJLGtCQUFrQixDQUFDLG9CQUFvQixtQkFBbUIsQ0FBQyxDQUFDLENBQUM7QUFDaEssU0FBSyxVQUFVLEtBQUssVUFBVSxpQ0FBaUMsZUFBZSxzQkFBc0IsY0FBYyxRQUFRO0FBQUEsTUFDekgsYUFBYTtBQUFBLFFBQ1osbUJBQW1CO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssVUFBVSxLQUFLLHFCQUFxQixpQ0FBaUMsTUFBTSxLQUFLLDBCQUEwQixDQUFDLENBQUM7QUFDakgsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixDQUFDLE1BQU07QUFDeEUsVUFBSSxFQUFFLGFBQWEsSUFBSSxnQ0FBZ0MsSUFBSSxHQUFHO0FBQzdELGFBQUssMEJBQTBCO0FBQUEsTUFDaEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFFBQVEsWUFBWSxNQUFNO0FBQzdDLFdBQUssV0FBVyxjQUFjLEtBQUssMkJBQTJCLENBQUM7QUFBQSxJQUNoRSxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxXQUFXLGtCQUFrQixFQUFFLGtCQUFrQixPQUFLO0FBQ3pFLFdBQUsscUJBQXFCLEVBQUU7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxXQUFXLGtCQUFrQixFQUFFLHNCQUFzQixNQUFNO0FBQzlFLFdBQUssUUFBUSxVQUFVLE9BQU8sU0FBUztBQUN2QyxrQ0FBNEIsSUFBSSxLQUFLLFdBQVcsa0JBQWtCLENBQUMsR0FBRyxpQkFBaUI7QUFDdkYsV0FBSyxhQUFhO0FBQUEsSUFDbkIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssV0FBVyxrQkFBa0IsRUFBRSx1QkFBdUIsTUFBTTtBQUMvRSxXQUFLLFFBQVEsVUFBVSxJQUFJLFNBQVM7QUFDcEMsa0NBQTRCLElBQUksS0FBSyxXQUFXLGtCQUFrQixDQUFDLEdBQUcsaUJBQWlCLElBQUk7QUFBQSxJQUM1RixDQUFDLENBQUM7QUFJRixRQUFJLFNBQVMsYUFBYTtBQUN6QixXQUFLLFVBQVUsU0FBUyxZQUFZLE9BQUs7QUFDeEMsYUFBSyxhQUFhO0FBQUEsTUFDbkIsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksTUFBdUI7QUFDMUIsV0FBTyxLQUFLLFdBQVcsa0JBQWtCLEVBQUUsU0FBUyxHQUFHO0FBQUEsRUFDeEQ7QUFBQSxFQUVRLGlCQUFpQixzQkFBNkMsUUFBcUIsU0FBaUU7QUFDM0osVUFBTSxnQkFBMEM7QUFBQSxNQUMvQyxnQkFBZ0IsS0FBSztBQUFBLE1BQ3JCLGVBQWUseUJBQXlCLDJCQUEyQjtBQUFBLFFBQ2xFLGNBQWM7QUFBQSxRQUNkO0FBQUEsUUFDQSxzQkFBc0I7QUFBQSxRQUV0Qiw0QkFBNEI7QUFBQSxRQUM1QixtQ0FBbUM7QUFBQSxRQUNuQywwQkFBMEI7QUFBQSxRQUMxQixzQkFBc0I7QUFBQSxRQUN0Qix1QkFBdUI7QUFBQSxRQUN2QixxQkFBcUI7QUFBQSxRQUNyQiwyQ0FBMkM7QUFBQSxNQUM1QyxDQUFDO0FBQUEsSUFDRjtBQUVBLFdBQU8sS0FBSyxVQUFVLHFCQUFxQixlQUFlLGtCQUFrQixRQUFRO0FBQUEsTUFDbkYsV0FBVyxFQUFFLFlBQVksT0FBTyx5QkFBeUIsT0FBTywwQ0FBMEMsS0FBTTtBQUFBLE1BQ2hILHdCQUF3QjtBQUFBLE1BQ3hCLGNBQWM7QUFBQSxNQUNkLHNCQUFzQjtBQUFBLE1BQ3RCLGNBQWMsRUFBRSxTQUFTLE1BQU07QUFBQSxNQUMvQixtQkFBbUIsU0FBUyxZQUFZLFVBQVU7QUFBQSxNQUNsRCxtQkFBbUIsU0FBUyxZQUFZLFVBQVU7QUFBQSxNQUNsRCxlQUFlO0FBQUEsTUFDZixVQUFVO0FBQUEsTUFDVixvQkFBb0I7QUFBQSxNQUNwQixpQ0FBaUM7QUFBQSxNQUNqQyxjQUFjO0FBQUEsUUFDYixtQkFBbUI7QUFBQSxNQUNwQjtBQUFBLE1BQ0Esa0NBQWtDO0FBQUEsTUFDbEMscUJBQXFCO0FBQUEsTUFDckIsYUFBYTtBQUFBLE1BQ2Isc0JBQXNCLEVBQUUsU0FBUyxNQUFNLGtCQUFrQixFQUFFO0FBQUEsTUFDM0Qsa0JBQWtCO0FBQUEsTUFDbEIscUJBQXFCO0FBQUEsTUFDckIsR0FBRztBQUFBLElBQ0osR0FBRyxFQUFFLGdCQUFnQixlQUFlLGdCQUFnQixjQUFjLENBQUMsQ0FBQztBQUFBLEVBQ3JFO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxXQUFXLE1BQU07QUFBQSxFQUN2QjtBQUFBLEVBRVEseUJBQXlCO0FBR2hDLFVBQU0sNkJBQTZCLEtBQUsscUJBQXFCLEtBQUssV0FBVyxrQkFBa0IsRUFBRSxjQUFjLEVBQUU7QUFDakgsVUFBTSxrQkFBa0IsS0FBSyxXQUFXLGtCQUFrQixFQUFFLGNBQWMsRUFBRTtBQUM1RSxVQUFNLGdCQUFnQiw2QkFDckIsS0FBSyxJQUFJLDBCQUEwQixpQkFBaUIsQ0FBQyxJQUNyRDtBQUNELFNBQUssV0FBVyxjQUFjLEVBQUUsU0FBUyxFQUFFLEtBQUsseUJBQXlCLFFBQVEsY0FBYyxFQUFFLENBQUM7QUFBQSxFQUNuRztBQUFBLEVBRVEsNEJBQWtDO0FBQ3pDLFVBQU0sYUFBYSxLQUFLLFFBQVEsV0FBVztBQUUzQyxlQUFXLE1BQU0sVUFBVTtBQUMzQixRQUFJLEtBQUsscUJBQXFCLHdCQUF3QixHQUFHO0FBQ3hELGlCQUFXLFlBQVksU0FBUywwQkFBMEIsb0JBQW9CO0FBQUEsSUFDL0U7QUFBQSxFQUNEO0FBQUEsRUFFUSw2QkFBNkM7QUFDcEQsV0FBTztBQUFBLE1BQ04sVUFBVSxLQUFLLFFBQVEsY0FBYyxhQUFhO0FBQUEsTUFDbEQsZUFBZSxLQUFLLFFBQVEsY0FBYyxhQUFhO0FBQUEsTUFDdkQseUJBQXlCLEtBQUssUUFBUSxjQUFjLGFBQWE7QUFBQSxNQUNqRSxZQUFZLEtBQUssUUFBUSxjQUFjLGFBQWEsZUFBZSxZQUNsRSxxQkFBcUIsYUFDckIsS0FBSyxRQUFRLGNBQWMsYUFBYTtBQUFBLE1BQ3pDLFVBQVUsS0FBSyxRQUFRLGNBQWMsYUFBYTtBQUFBLE1BQ2xELFlBQVksS0FBSyxRQUFRLGNBQWMsYUFBYTtBQUFBLE1BQ3BELFlBQVksS0FBSyxRQUFRLGNBQWMsYUFBYTtBQUFBLElBQ3JEO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBTyxRQUFRLEtBQUssaUJBQXVCO0FBQzFDLFFBQUksVUFBVSxRQUFXO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFNBQUssa0JBQWtCO0FBRXZCLFVBQU0sZUFBZTtBQUVyQixVQUFNLFVBQVUsSUFBSSxlQUFlLEtBQUssWUFBWTtBQUNwRCxVQUFNLFVBQVUsS0FBSyxXQUFXLFNBQVMsSUFDdEMsS0FBSyxXQUFXLGlCQUFpQixJQUNqQyxJQUFJLGVBQWUsS0FBSyxjQUFjO0FBRXpDLFVBQU0sWUFBWSxJQUFJLElBQUksVUFBVSxRQUFRLGVBQWUsS0FBSywyQkFBMkIsR0FBRyxVQUFVLE9BQU87QUFDL0csU0FBSyxRQUFRLE1BQU0sUUFBUSxHQUFHLFVBQVUsS0FBSztBQUM3QyxTQUFLLFdBQVcsT0FBTyxVQUFVLEtBQUssUUFBVyxVQUFVLFlBQVksQ0FBQztBQUN4RSxTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFHQSxNQUFNLE9BQU8sTUFBNkIsT0FBZSxPQUEwQjtBQUNsRixTQUFLLDJCQUEyQixLQUFLLHFCQUFxQjtBQUUxRCxRQUFJLEtBQUsseUJBQXlCO0FBQ2pDLFdBQUssa0JBQWtCLGFBQWEsS0FBSyx1QkFBdUI7QUFBQSxJQUNqRTtBQUVBLFFBQUksS0FBSyxRQUFRLGNBQWMsYUFBYSxhQUFhLE1BQU07QUFHOUQsV0FBSyxPQUFPLEtBQUs7QUFBQSxJQUNsQjtBQUVBLFVBQU0sS0FBSyxhQUFhLE1BQU0sS0FBSztBQUVuQyxTQUFLLE9BQU8sS0FBSztBQUNqQixTQUFLLFdBQVcsY0FBYztBQUFBLE1BQzdCLFdBQVcsU0FBUyw4QkFBOEIsWUFBWTtBQUFBLE1BQzlELFVBQVUsQ0FBQyxDQUFDLEtBQUs7QUFBQSxJQUNsQixDQUFDO0FBRUQsU0FBSyxjQUFjLFFBQVEsUUFBUSxLQUFLLEtBQUssS0FBSztBQUFBLE1BQ2pELFVBQVUsU0FBUztBQUFBLE1BQ25CLGlCQUFpQixFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU07QUFBQSxJQUNoRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsUUFBUTtBQUNQLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFUSxlQUFlO0FBQ3RCLDJCQUF1QixJQUFJLEtBQUssV0FBVyxrQkFBa0IsQ0FBQyxHQUFHLGlCQUFpQjtBQUNsRiwyQkFBdUIsSUFBSSxLQUFLLFdBQVcsa0JBQWtCLENBQUMsR0FBRyxpQkFBaUI7QUFDbEYseUJBQXFCLElBQUksS0FBSyxXQUFXLGtCQUFrQixDQUFDLEdBQUcsZUFBZTtBQUM5RSx5QkFBcUIsSUFBSSxLQUFLLFdBQVcsa0JBQWtCLENBQUMsR0FBRyxlQUFlO0FBQUEsRUFDL0U7QUFBQSxFQUVBLE1BQWMsYUFBYSxNQUE2QixPQUF5QztBQUVoRyxRQUFJLENBQUMsYUFBYSxLQUFLLE9BQU8sR0FBRztBQUNoQztBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQixRQUFRLEtBQUssS0FBSyxPQUFPLFdBQVcsQ0FBQztBQUUzRCxvQkFBZ0IsWUFBWSxPQUFPLEtBQUssaUJBQWlCLEVBQUUsSUFBSSxhQUFhO0FBRTVFLFNBQUssUUFBUSxVQUFVLE9BQU8sV0FBVyxhQUFhO0FBRXRELFFBQUksZUFBZTtBQUNsQixpQkFBVyxLQUFLLEtBQUssT0FBTyxPQUFPO0FBRW5DLFlBQU0sV0FBVyxLQUFLLGFBQWEsWUFBWSxLQUFLLEtBQUssS0FBSyxFQUFFLFVBQVUsTUFBTSxVQUFVLEtBQUssQ0FBQztBQUVoRyxVQUFJO0FBQ0osVUFBSSxLQUFLLEtBQUssTUFBTSxZQUFZLEdBQUc7QUFDbEMsbUJBQVcsU0FBUyxnQkFBZ0IsbUNBQW1DLFFBQVE7QUFBQSxNQUNoRixXQUFXLEtBQUssS0FBSyxNQUFNLFVBQVUsR0FBRztBQUN2QyxtQkFBVyxTQUFTLHVCQUF1QiwyQ0FBMkMsUUFBUTtBQUFBLE1BQy9GLE9BQU87QUFDTixtQkFBVyxTQUFTLGdCQUFnQixzQ0FBc0MsS0FBSyxLQUFLLE1BQU0sU0FBUyxRQUFRO0FBQUEsTUFDNUc7QUFFQSxZQUFNLFVBQVUsb0JBQW9CLFVBQVU7QUFBQSxRQUM3QyxvQkFBb0I7QUFBQSxRQUNwQixlQUFlO0FBQUEsVUFDZCxVQUFVLE1BQU07QUFDZixpQkFBSyxjQUFjLEtBQUssS0FBSyxLQUFLLEtBQUssRUFBRSxpQkFBaUIsTUFBTSxlQUFlLE1BQU0sQ0FBQztBQUFBLFVBQ3ZGO0FBQUEsVUFDQSxhQUFhLEtBQUs7QUFBQSxRQUNuQjtBQUFBLE1BQ0QsQ0FBQztBQUVELFVBQUksTUFBTSxLQUFLLGdCQUFnQixPQUFPO0FBQUEsSUFDdkM7QUFFQSxVQUFNLFdBQVcsTUFBTSxLQUFLO0FBQzVCLFFBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLGlCQUFpQixVQUFVO0FBQy9CLFlBQU0sWUFBWSxLQUFLLFdBQVcsZ0JBQWdCO0FBQUEsUUFDakQsVUFBVSxTQUFTO0FBQUEsUUFDbkIsVUFBVSxTQUFTO0FBQUEsTUFDcEIsQ0FBQztBQUVELFlBQU0sVUFBVSxZQUFZO0FBRTVCLFVBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxNQUNEO0FBRUEsWUFBTSxXQUFXLE1BQU0sSUFBSSxTQUFTLFNBQVMsZUFBZSxTQUFTLFNBQVMsYUFBYSxFQUFFLE1BQU07QUFHbEcsYUFBSyxXQUFXLFNBQVMsSUFBSTtBQUFBLE1BQzlCLENBQUM7QUFDRCxXQUFLLFdBQVcsU0FBUyxTQUFTO0FBQ2xDLFdBQUsseUJBQXlCLFFBQVEsbUJBQW1CLFVBQVUsU0FBUztBQUFBLElBRTdFLE9BQU87QUFDTixXQUFLLFdBQVcsU0FBUyxJQUFJO0FBQzdCLFdBQUsseUJBQXlCLFFBQVE7QUFBQSxJQUN2QztBQUVBLFNBQUssUUFBUSxVQUFVO0FBQUEsTUFDdEIsTUFBTSxLQUFLO0FBQUEsTUFDWCxTQUFTLEtBQUs7QUFBQSxNQUNkLFlBQVksS0FBSztBQUFBLE1BQ2pCLG9CQUFvQixNQUFNO0FBQ3pCLGNBQU0sb0JBQW9CLENBQUMsQ0FBQyxLQUFLLFdBQVcsa0JBQWtCLEVBQUUsa0JBQWtCLG1CQUFtQixrQkFBa0IscUJBQXFCLEdBQUc7QUFDL0ksY0FBTSxtQkFBbUI7QUFDekIsYUFBSyxXQUFXLGNBQWM7QUFBQSxVQUM3QjtBQUFBO0FBQUE7QUFBQSxVQUdBLGFBQWEsQ0FBQztBQUFBLFVBQ2QsaUNBQWlDO0FBQUEsUUFDbEMsQ0FBQztBQUNELGFBQUssT0FBTztBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBaFdhLHVCQUFOO0FBQUEsRUFxQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTNCVTtBQWtXTixJQUFNLHdCQUFOLE1BQTRCO0FBQUEsRUFJbEMsWUFDcUMsY0FDQyxlQUNKLGVBQ2hDO0FBSG1DO0FBQ0M7QUFDSjtBQUxsQyxTQUFpQixRQUFRLElBQUkseUJBQXlCO0FBQUEsRUFNbEQ7QUFBQSxFQUVKLE1BQU0sTUFBTSxVQUF1RCxNQUEwQixZQUFvRDtBQUVoSixRQUFJLENBQUMsU0FBUyxTQUFTLE1BQU0sU0FBUyxJQUFJLEdBQUc7QUFFNUM7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLE9BQU8sU0FBUztBQUV4QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsWUFBWTtBQUNoQixpQkFBVyxhQUFhLEtBQUssY0FBYyxnQkFBZ0IsR0FBRztBQUM3RCxZQUFJLENBQUMsVUFBVSxvQkFBb0IsRUFBRSxhQUFhO0FBQ2pEO0FBQUEsUUFDRDtBQUNBLGNBQU0sUUFBUSxVQUFVLFNBQVM7QUFDakMsWUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLE1BQU0sU0FBUyxLQUFLLEtBQUssR0FBRyxLQUFLLE1BQU0sU0FBUyxJQUFJLFdBQVcsUUFBUSw0QkFBNEI7QUFDekgsdUJBQWE7QUFDYjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxhQUNYLE1BQU0sS0FBSyxxQkFBcUIsWUFBWSxJQUFJLElBQ2hELE1BQU0sS0FBSyxPQUFPLElBQUk7QUFFekIsYUFBUyxlQUFlLE1BQU0sS0FBSztBQUFBLEVBQ3BDO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixZQUF5QixNQUEwQjtBQUNyRixVQUFNLFFBQVEsV0FBVyxTQUFTO0FBQ2xDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sV0FBVyx5QkFBeUI7QUFDakQsUUFBSSxDQUFDLFFBQVEsS0FBSyxXQUFXO0FBQzVCLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxDQUFDLE1BQU0sS0FBSyxXQUFXLE1BQU0sVUFBVSxJQUFJLEdBQUc7QUFDakQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsSUFBSSxjQUFjLE1BQU0sUUFBUTtBQUNqRCxVQUFNLFFBQVEsS0FBSyxTQUFTLElBQUksT0FBSyxFQUFFLGVBQWUsRUFBRSxXQUFXLFFBQVEsRUFBRSxzQkFBc0IsQ0FBQztBQUVwRyxVQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFVBQU0sU0FBUyxtQkFBbUIsTUFBTSxPQUFPLE1BQU0sSUFBSTtBQUN6RCxVQUFNLFNBQVMsaUJBQWlCO0FBRWhDLFdBQU8sTUFBTTtBQUFBLEVBQ2Q7QUFBQSxFQUVBLE1BQWMsT0FBTyxNQUEwQjtBQUM5QyxVQUFNLE1BQU0sTUFBTSxLQUFLLGFBQWEscUJBQXFCLEtBQUssR0FBRztBQUNqRSxRQUFJO0FBRUgsVUFBSSxDQUFDLE1BQU0sS0FBSyxXQUFXLElBQUksT0FBTyxpQkFBaUIsSUFBSSxHQUFHO0FBQzdELGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxPQUFPLGdCQUFnQixpQkFBaUI7QUFDNUMsVUFBSSxRQUFRO0FBQ1osaUJBQVcsU0FBUyxLQUFLLE9BQU87QUFDL0IsY0FBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLGVBQWU7QUFDaEQsWUFBSSxPQUFPLGdCQUFnQixtQkFBbUIsTUFBTSxPQUFPLE1BQU0sSUFBSTtBQUNyRSxpQkFBUyxNQUFNO0FBQUEsTUFDaEI7QUFDQSxVQUFJLE9BQU8sZ0JBQWdCLGlCQUFpQjtBQUM1QyxhQUFPO0FBQUEsSUFFUixVQUFFO0FBQ0QsVUFBSSxRQUFRO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsV0FBVyxPQUFtQixNQUEwQjtBQUNyRSxRQUFJLEtBQUssT0FBTyxRQUFRLEtBQUssTUFBTSxZQUFZLEtBQUssS0FBSyxLQUFLLE1BQU0sWUFBWSxLQUFLLE1BQU0sS0FBSyxNQUFNLE1BQU07QUFDM0csWUFBTSxTQUFTLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFBQSxRQUMvQyxTQUFTLFNBQVMscUNBQXFDLHNDQUFzQztBQUFBLFFBQzdGLFFBQVEsU0FBUyw0Q0FBNEMsMENBQTBDO0FBQUEsTUFDeEcsQ0FBQztBQUVELFVBQUksQ0FBQyxPQUFPLFdBQVc7QUFDdEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFFBQVEsVUFBdUQsTUFBMEI7QUFDeEYsUUFBSSxDQUFDLFNBQVMsU0FBUyxNQUFNLFNBQVMsSUFBSSxHQUFHO0FBRTVDO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxPQUFPLFNBQVM7QUFFeEI7QUFBQSxJQUNEO0FBRUEsYUFBUyxlQUFlLE1BQU0sRUFBRTtBQUFBLEVBQ2pDO0FBR0Q7QUF4SGEsd0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
