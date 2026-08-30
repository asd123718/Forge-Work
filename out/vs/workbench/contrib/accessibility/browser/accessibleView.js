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
import { EventType, addDisposableListener, getActiveWindow, getWindow, isActiveElement } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as marked from "../../../../base/common/marked/marked.js";
import { Schemas } from "../../../../base/common/network.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Position } from "../../../../editor/common/core/position.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { AccessibilityHelpNLS } from "../../../../editor/common/standaloneStrings.js";
import { CodeActionController } from "../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { FloatingEditorToolbar } from "../../../../editor/contrib/floatingMenu/browser/floatingMenu.js";
import { localize } from "../../../../nls.js";
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, ExtensionContentProvider, isIAccessibleViewContentProvider } from "../../../../platform/accessibility/browser/accessibleView.js";
import { ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX, IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { FloatingEditorClickMenu } from "../../../browser/codeeditor.js";
import { IChatCodeBlockContextProviderService } from "../../chat/browser/chat.js";
import { getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { AccessibilityCommandId } from "../common/accessibilityCommands.js";
import { AccessibilityWorkbenchSettingId, accessibilityHelpIsShown, accessibleViewContainsCodeBlocks, accessibleViewCurrentProviderId, accessibleViewGoToSymbolSupported, accessibleViewHasAssignedKeybindings, accessibleViewHasUnassignedKeybindings, accessibleViewInCodeBlock, accessibleViewIsShown, accessibleViewOnLastLine, accessibleViewSupportsNavigation, accessibleViewVerbosityEnabled } from "./accessibilityConfiguration.js";
import { resolveContentAndKeybindingItems } from "./accessibleViewKeybindingResolver.js";
var DIMENSIONS = /* @__PURE__ */ ((DIMENSIONS2) => {
  DIMENSIONS2[DIMENSIONS2["MAX_WIDTH"] = 900] = "MAX_WIDTH";
  DIMENSIONS2[DIMENSIONS2["WIDTH_RATIO"] = 0.75] = "WIDTH_RATIO";
  DIMENSIONS2[DIMENSIONS2["MAX_HEIGHT_RATIO"] = 0.6] = "MAX_HEIGHT_RATIO";
  return DIMENSIONS2;
})(DIMENSIONS || {});
let AccessibleView = class extends Disposable {
  constructor(_openerService, _instantiationService, _configurationService, _modelService, _contextViewService, _contextKeyService, _accessibilityService, _keybindingService, _layoutService, _menuService, _commandService, _codeBlockContextProviderService, _storageService, _quickInputService, _accessibilitySignalService) {
    super();
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._modelService = _modelService;
    this._contextViewService = _contextViewService;
    this._contextKeyService = _contextKeyService;
    this._accessibilityService = _accessibilityService;
    this._keybindingService = _keybindingService;
    this._layoutService = _layoutService;
    this._menuService = _menuService;
    this._commandService = _commandService;
    this._codeBlockContextProviderService = _codeBlockContextProviderService;
    this._storageService = _storageService;
    this._quickInputService = _quickInputService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._isInQuickPick = false;
    this._lastProviderPosition = /* @__PURE__ */ new Map();
    this._accessiblityHelpIsShown = accessibilityHelpIsShown.bindTo(this._contextKeyService);
    this._accessibleViewIsShown = accessibleViewIsShown.bindTo(this._contextKeyService);
    this._accessibleViewSupportsNavigation = accessibleViewSupportsNavigation.bindTo(this._contextKeyService);
    this._accessibleViewVerbosityEnabled = accessibleViewVerbosityEnabled.bindTo(this._contextKeyService);
    this._accessibleViewGoToSymbolSupported = accessibleViewGoToSymbolSupported.bindTo(this._contextKeyService);
    this._accessibleViewCurrentProviderId = accessibleViewCurrentProviderId.bindTo(this._contextKeyService);
    this._accessibleViewInCodeBlock = accessibleViewInCodeBlock.bindTo(this._contextKeyService);
    this._accessibleViewContainsCodeBlocks = accessibleViewContainsCodeBlocks.bindTo(this._contextKeyService);
    this._onLastLine = accessibleViewOnLastLine.bindTo(this._contextKeyService);
    this._hasUnassignedKeybindings = accessibleViewHasUnassignedKeybindings.bindTo(this._contextKeyService);
    this._hasAssignedKeybindings = accessibleViewHasAssignedKeybindings.bindTo(this._contextKeyService);
    this._container = document.createElement("div");
    this._container.classList.add("accessible-view");
    if (this._configurationService.getValue(AccessibilityWorkbenchSettingId.HideAccessibleView)) {
      this._container.classList.add("hide");
    }
    const codeEditorWidgetOptions = {
      contributions: EditorExtensionsRegistry.getEditorContributions().filter((c) => c.id !== CodeActionController.ID && c.id !== FloatingEditorClickMenu.ID && c.id !== FloatingEditorToolbar.ID)
    };
    const titleBar = document.createElement("div");
    titleBar.classList.add("accessible-view-title-bar");
    this._title = document.createElement("div");
    this._title.classList.add("accessible-view-title");
    titleBar.appendChild(this._title);
    const actionBar = document.createElement("div");
    actionBar.classList.add("accessible-view-action-bar");
    titleBar.appendChild(actionBar);
    this._container.appendChild(titleBar);
    this._toolbar = this._register(_instantiationService.createInstance(WorkbenchToolBar, actionBar, { orientation: ActionsOrientation.HORIZONTAL }));
    this._toolbar.context = { viewId: "accessibleView" };
    const toolbarElt = this._toolbar.getElement();
    toolbarElt.tabIndex = 0;
    const editorOptions = {
      ...getSimpleEditorOptions(this._configurationService),
      lineDecorationsWidth: 6,
      dragAndDrop: false,
      cursorWidth: 1,
      wordWrap: "off",
      wrappingStrategy: "advanced",
      wrappingIndent: "none",
      padding: { top: 2, bottom: 2 },
      quickSuggestions: false,
      renderWhitespace: "none",
      dropIntoEditor: { enabled: false },
      readOnly: true,
      fontFamily: "var(--monaco-monospace-font)"
    };
    this._editorWidget = this._register(this._instantiationService.createInstance(CodeEditorWidget, this._container, editorOptions, codeEditorWidgetOptions));
    this._register(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
      if (this._currentProvider && this._accessiblityHelpIsShown.get()) {
        this.show(this._currentProvider);
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (isIAccessibleViewContentProvider(this._currentProvider) && e.affectsConfiguration(this._currentProvider.verbositySettingKey)) {
        if (this._accessiblityHelpIsShown.get()) {
          this.show(this._currentProvider);
        }
        this._accessibleViewVerbosityEnabled.set(this._configurationService.getValue(this._currentProvider.verbositySettingKey));
        this._updateToolbar(this._currentProvider.actions, this._currentProvider.options.type);
      }
      if (e.affectsConfiguration(AccessibilityWorkbenchSettingId.HideAccessibleView)) {
        this._container.classList.toggle("hide", this._configurationService.getValue(AccessibilityWorkbenchSettingId.HideAccessibleView));
      }
    }));
    this._register(this._editorWidget.onDidDispose(() => this._resetContextKeys()));
    this._register(this._editorWidget.onDidChangeCursorPosition(() => {
      this._onLastLine.set(this._editorWidget.getPosition()?.lineNumber === this._editorWidget.getModel()?.getLineCount());
      const cursorPosition = this._editorWidget.getPosition()?.lineNumber;
      if (this._codeBlocks && cursorPosition !== void 0) {
        const inCodeBlock = this._codeBlocks.find((c) => c.startLine <= cursorPosition && c.endLine >= cursorPosition) !== void 0;
        this._accessibleViewInCodeBlock.set(inCodeBlock);
      }
      this._playDiffSignals();
    }));
  }
  get editorWidget() {
    return this._editorWidget;
  }
  _playDiffSignals() {
    if (this._currentProvider?.id !== AccessibleViewProviderId.DiffEditor && this._currentProvider?.id !== AccessibleViewProviderId.InlineCompletions) {
      return;
    }
    const position = this._editorWidget.getPosition();
    const model = this._editorWidget.getModel();
    if (!position || !model) {
      return void 0;
    }
    const lineContent = model.getLineContent(position.lineNumber);
    if (lineContent?.startsWith("+")) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted);
    } else if (lineContent?.startsWith("-")) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted);
    }
  }
  _resetContextKeys() {
    this._accessiblityHelpIsShown.reset();
    this._accessibleViewIsShown.reset();
    this._accessibleViewSupportsNavigation.reset();
    this._accessibleViewVerbosityEnabled.reset();
    this._accessibleViewGoToSymbolSupported.reset();
    this._accessibleViewCurrentProviderId.reset();
    this._hasAssignedKeybindings.reset();
    this._hasUnassignedKeybindings.reset();
  }
  getPosition(id) {
    if (!id || !this._lastProvider || this._lastProvider.id !== id) {
      return void 0;
    }
    return this._editorWidget.getPosition() || void 0;
  }
  setPosition(position, reveal, select) {
    this._editorWidget.setPosition(position);
    if (reveal) {
      this._editorWidget.revealPosition(position);
    }
    if (select) {
      const lineLength = this._editorWidget.getModel()?.getLineLength(position.lineNumber) ?? 0;
      if (lineLength) {
        this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: lineLength + 1 });
      }
    }
  }
  getCodeBlockContext() {
    const position = this._editorWidget.getPosition();
    if (!this._codeBlocks?.length || !position) {
      return;
    }
    const codeBlockIndex = this._codeBlocks?.findIndex((c) => c.startLine <= position?.lineNumber && c.endLine >= position?.lineNumber);
    const codeBlock = codeBlockIndex !== void 0 && codeBlockIndex > -1 ? this._codeBlocks[codeBlockIndex] : void 0;
    if (!codeBlock || codeBlockIndex === void 0) {
      return;
    }
    return { code: codeBlock.code, languageId: codeBlock.languageId, codeBlockIndex, element: void 0, chatSessionResource: codeBlock.chatSessionResource };
  }
  navigateToCodeBlock(type) {
    const position = this._editorWidget.getPosition();
    if (!this._codeBlocks?.length || !position) {
      return;
    }
    let codeBlock;
    const codeBlocks = this._codeBlocks.slice();
    if (type === "previous") {
      codeBlock = codeBlocks.reverse().find((c) => c.endLine < position.lineNumber);
    } else {
      codeBlock = codeBlocks.find((c) => c.startLine > position.lineNumber);
    }
    if (!codeBlock) {
      return;
    }
    this.setPosition(new Position(codeBlock.startLine, 1), true);
  }
  showLastProvider(id) {
    if (!this._lastProvider || this._lastProvider.options.id !== id) {
      return;
    }
    this.show(this._lastProvider);
  }
  getAccessibilityStatus() {
    return {
      providerId: this._currentProvider?.id,
      isInCodeBlock: this._accessibleViewInCodeBlock.get() ?? false,
      onLastLine: this._onLastLine.get() ?? false
    };
  }
  show(provider, symbol, showAccessibleViewHelp, position) {
    provider = provider ?? this._currentProvider;
    if (!provider) {
      return;
    }
    provider.onOpen?.();
    const delegate = {
      getAnchor: () => {
        return { x: getActiveWindow().innerWidth / 2 - Math.min(this._layoutService.activeContainerDimension.width * 0.75 /* WIDTH_RATIO */, 900 /* MAX_WIDTH */) / 2, y: this._layoutService.activeContainerOffset.quickPickTop };
      },
      render: (container) => {
        this._viewContainer = container;
        this._viewContainer.classList.add("accessible-view-container");
        return this._render(provider, container, showAccessibleViewHelp);
      },
      onHide: () => {
        if (!showAccessibleViewHelp) {
          this._updateLastProvider();
          if (this._currentProvider) {
            const currentPosition = this._editorWidget.getPosition();
            if (currentPosition) {
              this._lastProviderPosition.set(this._currentProvider.id, currentPosition);
            }
          }
          this._currentProvider?.dispose();
          this._currentProvider = void 0;
          this._resetContextKeys();
        }
      }
    };
    this._contextViewService.showContextView(delegate);
    if (position) {
      queueMicrotask(() => {
        this._editorWidget.revealLine(position.lineNumber);
        this._editorWidget.setSelection({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column });
      });
    }
    if (symbol && this._currentProvider) {
      this.showSymbol(this._currentProvider, symbol);
    }
    if (provider instanceof AccessibleContentProvider && provider.onDidRequestClearLastProvider) {
      this._register(provider.onDidRequestClearLastProvider((id) => {
        if (this._lastProvider?.options.id === id) {
          this._lastProvider = void 0;
        }
        this._lastProviderPosition.delete(id);
      }));
    }
    if (provider.options.id) {
      this._lastProvider = provider;
    }
    if (provider.id === AccessibleViewProviderId.PanelChat || provider.id === AccessibleViewProviderId.QuickChat) {
      this._register(this._codeBlockContextProviderService.registerProvider({ getCodeBlockContext: () => this.getCodeBlockContext() }, "accessibleView"));
    }
    if (provider instanceof ExtensionContentProvider) {
      this._storageService.store(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${provider.id}`, true, StorageScope.APPLICATION, StorageTarget.USER);
    }
    if (provider.onDidChangeContent) {
      this._register(provider.onDidChangeContent(() => {
        if (this._viewContainer) {
          this._render(provider, this._viewContainer, showAccessibleViewHelp);
        }
      }));
    }
  }
  previous() {
    const newContent = this._currentProvider?.providePreviousContent?.();
    if (!this._currentProvider || !this._viewContainer || !newContent) {
      return;
    }
    this._render(this._currentProvider, this._viewContainer, void 0, newContent);
  }
  next() {
    const newContent = this._currentProvider?.provideNextContent?.();
    if (!this._currentProvider || !this._viewContainer || !newContent) {
      return;
    }
    this._render(this._currentProvider, this._viewContainer, void 0, newContent);
  }
  _verbosityEnabled() {
    if (!this._currentProvider) {
      return false;
    }
    return isIAccessibleViewContentProvider(this._currentProvider) ? this._configurationService.getValue(this._currentProvider.verbositySettingKey) === true : this._storageService.getBoolean(`${ACCESSIBLE_VIEW_SHOWN_STORAGE_PREFIX}${this._currentProvider.id}`, StorageScope.APPLICATION, false);
  }
  goToSymbol() {
    if (!this._currentProvider) {
      return;
    }
    this._isInQuickPick = true;
    this._instantiationService.createInstance(AccessibleViewSymbolQuickPick, this).show(this._currentProvider);
  }
  calculateCodeBlocks(markdown) {
    if (!markdown) {
      return;
    }
    if (this._currentProvider?.id !== AccessibleViewProviderId.PanelChat && this._currentProvider?.id !== AccessibleViewProviderId.QuickChat) {
      return;
    }
    if (this._currentProvider.options.language && this._currentProvider.options.language !== "markdown") {
      return;
    }
    const lines = markdown.split("\n");
    this._codeBlocks = [];
    let inBlock = false;
    let startLine = 0;
    let languageId;
    lines.forEach((line, i) => {
      if (!inBlock && line.startsWith("```")) {
        inBlock = true;
        startLine = i + 1;
        languageId = line.substring(3).trim();
      } else if (inBlock && line.endsWith("```")) {
        inBlock = false;
        const endLine = i;
        const code = lines.slice(startLine, endLine).join("\n");
        this._codeBlocks?.push({ startLine, endLine, code, languageId, chatSessionResource: void 0 });
      }
    });
    this._accessibleViewContainsCodeBlocks.set(this._codeBlocks.length > 0);
  }
  getSymbols() {
    const provider = this._currentProvider ? this._currentProvider : void 0;
    if (!this._currentContent || !provider) {
      return;
    }
    const symbols = "getSymbols" in provider ? provider.getSymbols?.() || [] : [];
    if (symbols?.length) {
      return symbols;
    }
    if (provider.options.language && provider.options.language !== "markdown") {
      return;
    }
    const markdownTokens = marked.marked.lexer(this._currentContent);
    if (!markdownTokens) {
      return;
    }
    this._convertTokensToSymbols(markdownTokens, symbols);
    return symbols.length ? symbols : void 0;
  }
  openHelpLink() {
    if (!this._currentProvider?.options.readMoreUrl) {
      return;
    }
    this._openerService.open(URI.parse(this._currentProvider.options.readMoreUrl));
  }
  configureKeybindings(unassigned) {
    this._isInQuickPick = true;
    const provider = this._updateLastProvider();
    const items = unassigned ? provider?.options?.configureKeybindingItems : provider?.options?.configuredKeybindingItems;
    if (!items) {
      return;
    }
    const disposables = this._register(new DisposableStore());
    const quickPick = disposables.add(this._quickInputService.createQuickPick());
    quickPick.items = items;
    quickPick.title = localize("keybindings", "Configure keybindings");
    quickPick.placeholder = localize("selectKeybinding", "Select a command ID to configure a keybinding for it");
    quickPick.show();
    disposables.add(quickPick.onDidAccept(async () => {
      const item = quickPick.selectedItems[0];
      if (item) {
        await this._commandService.executeCommand("workbench.action.openGlobalKeybindings", item.id);
      }
      quickPick.dispose();
    }));
    disposables.add(quickPick.onDidHide(() => {
      if (!quickPick.selectedItems.length && provider) {
        this.show(provider);
      }
      disposables.dispose();
      this._isInQuickPick = false;
    }));
  }
  _convertTokensToSymbols(tokens, symbols) {
    let firstListItem;
    for (const token of tokens) {
      let label = void 0;
      if ("type" in token) {
        switch (token.type) {
          case "heading":
          case "paragraph":
          case "code":
            label = token.text;
            break;
          case "list": {
            const firstItem = token.items[0];
            if (!firstItem) {
              break;
            }
            firstListItem = `- ${firstItem.text}`;
            label = token.items.map((i) => i.text).join(", ");
            break;
          }
        }
      }
      if (label) {
        symbols.push({ markdownToParse: label, label: localize("symbolLabel", "({0}) {1}", token.type, label), ariaLabel: localize("symbolLabelAria", "({0}) {1}", token.type, label), firstListItem });
        firstListItem = void 0;
      }
    }
  }
  showSymbol(provider, symbol) {
    if (!this._currentContent) {
      return;
    }
    let lineNumber = symbol.lineNumber;
    const markdownToParse = symbol.markdownToParse;
    if (lineNumber === void 0 && markdownToParse === void 0) {
      return;
    }
    if (lineNumber === void 0 && markdownToParse) {
      const index = this._currentContent.split("\n").findIndex((line) => line.includes(markdownToParse.split("\n")[0]) || symbol.firstListItem && line.includes(symbol.firstListItem)) ?? -1;
      if (index >= 0) {
        lineNumber = index + 1;
      }
    }
    if (lineNumber === void 0) {
      return;
    }
    this._isInQuickPick = false;
    this.show(provider, void 0, void 0, { lineNumber, column: 1 });
    this._updateContextKeys(provider, true);
  }
  disableHint() {
    if (!isIAccessibleViewContentProvider(this._currentProvider)) {
      return;
    }
    this._configurationService.updateValue(this._currentProvider?.verbositySettingKey, false);
    alert(localize("disableAccessibilityHelp", "{0} accessibility verbosity is now disabled", this._currentProvider.verbositySettingKey));
  }
  _updateContextKeys(provider, shown) {
    if (provider.options.type === AccessibleViewType.Help) {
      this._accessiblityHelpIsShown.set(shown);
      this._accessibleViewIsShown.reset();
    } else {
      this._accessibleViewIsShown.set(shown);
      this._accessiblityHelpIsShown.reset();
    }
    this._accessibleViewSupportsNavigation.set(provider.provideNextContent !== void 0 || provider.providePreviousContent !== void 0);
    this._accessibleViewVerbosityEnabled.set(this._verbosityEnabled());
    this._accessibleViewGoToSymbolSupported.set(this._goToSymbolsSupported() ? this.getSymbols()?.length > 0 : false);
  }
  _getStableUri(providerId) {
    return URI.from({ path: `accessible-view-${providerId}`, scheme: Schemas.accessibleView });
  }
  _updateContent(provider, updatedContent) {
    let content = updatedContent ?? provider.provideContent();
    if (provider.options.type === AccessibleViewType.View) {
      this._currentContent = content;
      this._hasUnassignedKeybindings.reset();
      this._hasAssignedKeybindings.reset();
      return;
    }
    const readMoreLinkHint = this._readMoreHint(provider);
    const disableHelpHint = this._disableVerbosityHint(provider);
    const screenReaderModeHint = this._screenReaderModeHint(provider);
    const exitThisDialogHint = this._exitDialogHint(provider);
    let configureKbHint = "";
    let configureAssignedKbHint = "";
    const resolvedContent = resolveContentAndKeybindingItems(this._keybindingService, screenReaderModeHint + content + readMoreLinkHint + disableHelpHint + exitThisDialogHint);
    if (resolvedContent) {
      content = resolvedContent.content.value;
      if (resolvedContent.configureKeybindingItems) {
        provider.options.configureKeybindingItems = resolvedContent.configureKeybindingItems;
        this._hasUnassignedKeybindings.set(true);
        configureKbHint = this._configureUnassignedKbHint();
      } else {
        this._hasAssignedKeybindings.reset();
      }
      if (resolvedContent.configuredKeybindingItems) {
        provider.options.configuredKeybindingItems = resolvedContent.configuredKeybindingItems;
        this._hasAssignedKeybindings.set(true);
        configureAssignedKbHint = this._configureAssignedKbHint();
      } else {
        this._hasAssignedKeybindings.reset();
      }
    }
    this._currentContent = content + configureKbHint + configureAssignedKbHint;
  }
  _render(provider, container, showAccessibleViewHelp, updatedContent) {
    const isSameProvider = this._currentProvider?.id === provider.id;
    const previousPosition = isSameProvider ? this._editorWidget.getPosition() : void 0;
    const previousScrollTop = isSameProvider ? this._editorWidget.getScrollTop() : void 0;
    this._currentProvider = provider;
    this._accessibleViewCurrentProviderId.set(provider.id);
    const verbose = this._verbosityEnabled();
    this._updateContent(provider, updatedContent);
    this.calculateCodeBlocks(this._currentContent);
    this._updateContextKeys(provider, true);
    const widgetIsFocused = this._editorWidget.hasTextFocus() || this._editorWidget.hasWidgetFocus();
    const stableUri = this._getStableUri(provider.id);
    this._getTextModel(stableUri).then((model) => {
      if (!model) {
        return;
      }
      const currentContent = this._currentContent ?? "";
      if (model.getValue() !== currentContent) {
        model.setValue(currentContent);
      }
      if (this._editorWidget.getModel() !== model) {
        this._editorWidget.setModel(model);
      }
      const domNode = this._editorWidget.getDomNode();
      if (!domNode) {
        return;
      }
      model.setLanguage(provider.options.language ?? "markdown");
      container.appendChild(this._container);
      let actionsHint = "";
      const hasActions = this._accessibleViewSupportsNavigation.get() || this._accessibleViewVerbosityEnabled.get() || this._accessibleViewGoToSymbolSupported.get() || provider.actions?.length;
      if (verbose && !showAccessibleViewHelp && hasActions) {
        actionsHint = provider.options.position ? localize("ariaAccessibleViewActionsBottom", "Explore actions such as disabling this hint (Shift+Tab), use Escape to exit this dialog.") : localize("ariaAccessibleViewActions", "Explore actions such as disabling this hint (Shift+Tab).");
      }
      let ariaLabel = provider.options.type === AccessibleViewType.Help ? localize("accessibility-help", "Accessibility Help") : localize("accessible-view", "Accessible View");
      this._title.textContent = ariaLabel;
      if (actionsHint && provider.options.type === AccessibleViewType.View) {
        ariaLabel = localize("accessible-view-hint", "Accessible View, {0}", actionsHint);
      } else if (actionsHint) {
        ariaLabel = localize("accessibility-help-hint", "Accessibility Help, {0}", actionsHint);
      }
      if (isWindows && widgetIsFocused) {
        ariaLabel = "";
      }
      this._editorWidget.updateOptions({ ariaLabel });
      this._editorWidget.focus();
      if (this._currentProvider?.options.position) {
        const position = this._editorWidget.getPosition();
        const isDefaultPosition = position?.lineNumber === 1 && position.column === 1;
        const lineCount = this.editorWidget.getModel()?.getLineCount();
        const savedPosition = this._lastProviderPosition.get(provider.id);
        const preservedPosition = this._currentProvider.options.position === "initial-bottom-preserve" ? previousPosition ?? savedPosition : this._currentProvider.options.position === "initial-bottom" && !isSameProvider ? savedPosition : void 0;
        if (preservedPosition && preservedPosition.lineNumber <= (lineCount ?? 0)) {
          this._editorWidget.setPosition(preservedPosition);
          if (this._currentProvider.options.position === "initial-bottom-preserve" && previousScrollTop !== void 0) {
            this._editorWidget.setScrollTop(previousScrollTop);
          } else {
            this._editorWidget.revealLine(preservedPosition.lineNumber);
          }
        } else if (this._currentProvider.options.position === "bottom" || this._currentProvider.options.position === "initial-bottom-preserve" || this._currentProvider.options.position === "initial-bottom" && isDefaultPosition) {
          const lastLine = lineCount;
          const position2 = lastLine !== void 0 && lastLine > 0 ? new Position(lastLine, 1) : void 0;
          if (position2) {
            this._editorWidget.setPosition(position2);
            this._editorWidget.revealLine(position2.lineNumber);
          }
        }
      } else if (previousPosition) {
        this._editorWidget.setPosition(previousPosition);
      } else {
        const savedPosition = this._lastProviderPosition.get(provider.id);
        if (savedPosition) {
          const lineCount = this._editorWidget.getModel()?.getLineCount() ?? 0;
          if (savedPosition.lineNumber <= lineCount) {
            this._editorWidget.setPosition(savedPosition);
            this._editorWidget.revealPosition(savedPosition);
          }
        }
      }
    });
    this._updateToolbar(this._currentProvider.actions, provider.options.type);
    const hide = (e) => {
      const thisWindowIsFocused = getWindow(this._editorWidget.getDomNode()).document.hasFocus();
      if (!thisWindowIsFocused) {
        e?.preventDefault();
        e?.stopPropagation();
        return;
      }
      if (!this._isInQuickPick) {
        provider.onClose();
      }
      e?.stopPropagation();
      this._contextViewService.hideContextView();
      if (this._isInQuickPick) {
        return;
      }
      this._updateContextKeys(provider, false);
      const currentPosition = this._editorWidget.getPosition();
      if (currentPosition) {
        this._lastProviderPosition.set(provider.id, currentPosition);
      }
      this._lastProvider = void 0;
      this._currentContent = void 0;
      this._currentProvider?.dispose();
      this._currentProvider = void 0;
    };
    const disposableStore = new DisposableStore();
    disposableStore.add(this._editorWidget.onKeyDown((e) => {
      if (e.keyCode === KeyCode.Enter) {
        this._commandService.executeCommand("editor.action.openLink");
      } else if (e.keyCode === KeyCode.Escape || shouldHide(e.browserEvent, this._keybindingService, this._configurationService)) {
        hide(e);
      } else if (e.keyCode === KeyCode.KeyH && provider.options.readMoreUrl) {
        const url = provider.options.readMoreUrl;
        alert(AccessibilityHelpNLS.openingDocs);
        this._openerService.open(URI.parse(url));
        e.preventDefault();
        e.stopPropagation();
      }
      if (provider instanceof AccessibleContentProvider) {
        provider.onKeyDown?.(e);
      }
    }));
    disposableStore.add(addDisposableListener(this._toolbar.getElement(), EventType.KEY_DOWN, (e) => {
      const keyboardEvent = new StandardKeyboardEvent(e);
      if (keyboardEvent.equals(KeyCode.Escape)) {
        hide(e);
      }
    }));
    disposableStore.add(this._editorWidget.onDidBlurEditorWidget(() => {
      if (!isActiveElement(this._toolbar.getElement())) {
        hide();
      }
    }));
    disposableStore.add(this._editorWidget.onDidContentSizeChange(() => this._layout()));
    disposableStore.add(this._layoutService.onDidLayoutActiveContainer(() => this._layout()));
    return disposableStore;
  }
  _updateToolbar(providedActions, type) {
    this._toolbar.setAriaLabel(type === AccessibleViewType.Help ? localize("accessibleHelpToolbar", "Accessibility Help") : localize("accessibleViewToolbar", "Accessible View"));
    const toolbarMenu = this._register(this._menuService.createMenu(MenuId.AccessibleView, this._contextKeyService));
    const menuActions = getFlatActionBarActions(toolbarMenu.getActions({}));
    if (providedActions) {
      for (const providedAction of providedActions) {
        providedAction.class = providedAction.class || ThemeIcon.asClassName(Codicon.primitiveSquare);
        providedAction.checked = void 0;
      }
      this._toolbar.setActions([...providedActions, ...menuActions]);
    } else {
      this._toolbar.setActions(menuActions);
    }
  }
  _layout() {
    const dimension = this._layoutService.activeContainerDimension;
    const maxHeight = dimension.height && dimension.height * 0.6 /* MAX_HEIGHT_RATIO */;
    const height = Math.min(maxHeight, this._editorWidget.getContentHeight());
    const width = Math.min(dimension.width * 0.75 /* WIDTH_RATIO */, 900 /* MAX_WIDTH */);
    this._editorWidget.layout({ width, height });
  }
  async _getTextModel(resource) {
    const existing = this._modelService.getModel(resource);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    return this._modelService.createModel("", null, resource, false);
  }
  _goToSymbolsSupported() {
    if (!this._currentProvider) {
      return false;
    }
    return this._currentProvider.options.type === AccessibleViewType.Help || this._currentProvider.options.language === "markdown" || this._currentProvider.options.language === void 0 || this._currentProvider instanceof AccessibleContentProvider && !!this._currentProvider.getSymbols?.();
  }
  _updateLastProvider() {
    const provider = this._currentProvider;
    if (!provider) {
      return;
    }
    const lastProvider = provider instanceof AccessibleContentProvider ? new AccessibleContentProvider(
      provider.id,
      provider.options,
      provider.provideContent.bind(provider),
      provider.onClose.bind(provider),
      provider.verbositySettingKey,
      provider.onOpen?.bind(provider),
      provider.actions,
      provider.provideNextContent?.bind(provider),
      provider.providePreviousContent?.bind(provider),
      provider.onDidChangeContent?.bind(provider),
      provider.onKeyDown?.bind(provider),
      provider.getSymbols?.bind(provider)
    ) : new ExtensionContentProvider(
      provider.id,
      provider.options,
      provider.provideContent.bind(provider),
      provider.onClose.bind(provider),
      provider.onOpen?.bind(provider),
      provider.provideNextContent?.bind(provider),
      provider.providePreviousContent?.bind(provider),
      provider.actions,
      provider.onDidChangeContent?.bind(provider)
    );
    return lastProvider;
  }
  showAccessibleViewHelp() {
    const lastProvider = this._updateLastProvider();
    if (!lastProvider) {
      return;
    }
    let accessibleViewHelpProvider;
    if (lastProvider instanceof AccessibleContentProvider) {
      accessibleViewHelpProvider = new AccessibleContentProvider(
        lastProvider.id,
        { type: AccessibleViewType.Help },
        () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()),
        () => {
          this._contextViewService.hideContextView();
          queueMicrotask(() => this.show(lastProvider));
        },
        lastProvider.verbositySettingKey
      );
    } else {
      accessibleViewHelpProvider = new ExtensionContentProvider(
        lastProvider.id,
        { type: AccessibleViewType.Help },
        () => lastProvider.options.customHelp ? lastProvider?.options.customHelp() : this._accessibleViewHelpDialogContent(this._goToSymbolsSupported()),
        () => {
          this._contextViewService.hideContextView();
          queueMicrotask(() => this.show(lastProvider));
        }
      );
    }
    this._contextViewService.hideContextView();
    if (accessibleViewHelpProvider) {
      queueMicrotask(() => this.show(accessibleViewHelpProvider, void 0, true));
    }
  }
  _accessibleViewHelpDialogContent(providerHasSymbols) {
    const navigationHint = this._navigationHint();
    const goToSymbolHint = this._goToSymbolHint(providerHasSymbols);
    const toolbarHint = localize("toolbar", "Navigate to the toolbar (Shift+Tab).");
    const chatHints = this._getChatHints();
    let hint = localize("intro", "In the accessible view, you can:\n");
    if (navigationHint) {
      hint += " - " + navigationHint + "\n";
    }
    if (goToSymbolHint) {
      hint += " - " + goToSymbolHint + "\n";
    }
    if (toolbarHint) {
      hint += " - " + toolbarHint + "\n";
    }
    if (chatHints) {
      hint += chatHints;
    }
    return hint;
  }
  _getChatHints() {
    if (this._currentProvider?.id !== AccessibleViewProviderId.PanelChat && this._currentProvider?.id !== AccessibleViewProviderId.QuickChat) {
      return;
    }
    return [
      localize("insertAtCursor", " - Insert the code block at the cursor{0}.", "<keybinding:workbench.action.chat.insertCodeBlock>"),
      localize("insertIntoNewFile", " - Insert the code block into a new file{0}.", "<keybinding:workbench.action.chat.insertIntoNewFile>"),
      localize("runInTerminal", " - Run the code block in the terminal{0}.\n", "<keybinding:workbench.action.chat.runInTerminal>")
    ].join("\n");
  }
  _navigationHint() {
    return localize("accessibleViewNextPreviousHint", "Show the next item{0} or previous item{1}.", `<keybinding:${AccessibilityCommandId.ShowNext}>`, `<keybinding:${AccessibilityCommandId.ShowPrevious}>`);
  }
  _disableVerbosityHint(provider) {
    if (provider.options.type === AccessibleViewType.Help && this._verbosityEnabled()) {
      return localize("acessibleViewDisableHint", "\nDisable accessibility verbosity for this feature{0}.", `<keybinding:${AccessibilityCommandId.DisableVerbosityHint}>`);
    }
    return "";
  }
  _goToSymbolHint(providerHasSymbols) {
    if (!providerHasSymbols) {
      return;
    }
    return localize("goToSymbolHint", "Go to a symbol{0}.", `<keybinding:${AccessibilityCommandId.GoToSymbol}>`);
  }
  _configureUnassignedKbHint() {
    const configureKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.AccessibilityHelpConfigureKeybindings)?.getAriaLabel();
    const keybindingToConfigureQuickPick = configureKb ? "(" + configureKb + ")" : "by assigning a keybinding to the command Accessibility Help Configure Unassigned Keybindings.";
    return localize("configureKb", "\nConfigure keybindings for commands that lack them {0}.", keybindingToConfigureQuickPick);
  }
  _configureAssignedKbHint() {
    const configureKb = this._keybindingService.lookupKeybinding(AccessibilityCommandId.AccessibilityHelpConfigureAssignedKeybindings)?.getAriaLabel();
    const keybindingToConfigureQuickPick = configureKb ? "(" + configureKb + ")" : "by assigning a keybinding to the command Accessibility Help Configure Assigned Keybindings.";
    return localize("configureKbAssigned", "\nConfigure keybindings for commands that already have assignments {0}.", keybindingToConfigureQuickPick);
  }
  _screenReaderModeHint(provider) {
    const accessibilitySupport = this._accessibilityService.isScreenReaderOptimized();
    let screenReaderModeHint = "";
    const turnOnMessage = isMacintosh ? AccessibilityHelpNLS.changeConfigToOnMac : AccessibilityHelpNLS.changeConfigToOnWinLinux;
    if (accessibilitySupport && provider.id === AccessibleViewProviderId.Editor) {
      screenReaderModeHint = AccessibilityHelpNLS.auto_on;
      screenReaderModeHint += "\n";
    } else if (!accessibilitySupport) {
      screenReaderModeHint = AccessibilityHelpNLS.auto_off + "\n" + turnOnMessage;
      screenReaderModeHint += "\n";
    }
    return screenReaderModeHint;
  }
  _exitDialogHint(provider) {
    return this._verbosityEnabled() && !provider.options.position ? localize("exit", "\nExit this dialog (Escape).") : "";
  }
  _readMoreHint(provider) {
    return provider.options.readMoreUrl ? localize("openDoc", "\nOpen a browser window with more information related to accessibility{0}.", `<keybinding:${AccessibilityCommandId.AccessibilityHelpOpenHelpLink}>`) : "";
  }
};
AccessibleView = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IModelService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IAccessibilityService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ILayoutService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IChatCodeBlockContextProviderService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IQuickInputService),
  __decorateParam(14, IAccessibilitySignalService)
], AccessibleView);
let AccessibleViewService = class extends Disposable {
  constructor(_instantiationService, _configurationService, _keybindingService) {
    super();
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._keybindingService = _keybindingService;
  }
  show(provider, position) {
    if (!this._accessibleView) {
      this._accessibleView = this._register(this._instantiationService.createInstance(AccessibleView));
    }
    this._accessibleView.show(provider, void 0, void 0, position);
  }
  configureKeybindings(unassigned) {
    this._accessibleView?.configureKeybindings(unassigned);
  }
  openHelpLink() {
    this._accessibleView?.openHelpLink();
  }
  showLastProvider(id) {
    this._accessibleView?.showLastProvider(id);
  }
  next() {
    this._accessibleView?.next();
  }
  previous() {
    this._accessibleView?.previous();
  }
  goToSymbol() {
    this._accessibleView?.goToSymbol();
  }
  getOpenAriaHint(verbositySettingKey) {
    if (!this._configurationService.getValue(verbositySettingKey)) {
      return null;
    }
    const keybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibleView)?.getAriaLabel();
    let hint = null;
    if (keybinding) {
      hint = localize("acessibleViewHint", "Inspect this in the accessible view with {0}", keybinding);
    } else {
      hint = localize("acessibleViewHintNoKbEither", "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
    }
    return hint;
  }
  disableHint() {
    this._accessibleView?.disableHint();
  }
  showAccessibleViewHelp() {
    this._accessibleView?.showAccessibleViewHelp();
  }
  getPosition(id) {
    return this._accessibleView?.getPosition(id) ?? void 0;
  }
  getLastPosition() {
    const lastLine = this._accessibleView?.editorWidget.getModel()?.getLineCount();
    return lastLine !== void 0 && lastLine > 0 ? new Position(lastLine, 1) : void 0;
  }
  setPosition(position, reveal, select) {
    this._accessibleView?.setPosition(position, reveal, select);
  }
  getCodeBlockContext() {
    return this._accessibleView?.getCodeBlockContext();
  }
  navigateToCodeBlock(type) {
    this._accessibleView?.navigateToCodeBlock(type);
  }
};
AccessibleViewService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IKeybindingService)
], AccessibleViewService);
let AccessibleViewSymbolQuickPick = class {
  constructor(_accessibleView, _quickInputService) {
    this._accessibleView = _accessibleView;
    this._quickInputService = _quickInputService;
  }
  show(provider) {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this._quickInputService.createQuickPick());
    quickPick.placeholder = localize("accessibleViewSymbolQuickPickPlaceholder", "Type to search symbols");
    quickPick.title = localize("accessibleViewSymbolQuickPickTitle", "Go to Symbol Accessible View");
    const picks = [];
    const symbols = this._accessibleView.getSymbols();
    if (!symbols) {
      return;
    }
    for (const symbol of symbols) {
      picks.push({
        label: symbol.label,
        ariaLabel: symbol.ariaLabel,
        firstListItem: symbol.firstListItem,
        lineNumber: symbol.lineNumber,
        endLineNumber: symbol.endLineNumber,
        markdownToParse: symbol.markdownToParse
      });
    }
    quickPick.canSelectMany = false;
    quickPick.items = picks;
    quickPick.show();
    disposables.add(quickPick.onDidAccept(() => {
      this._accessibleView.showSymbol(provider, quickPick.selectedItems[0]);
      quickPick.hide();
    }));
    disposables.add(quickPick.onDidHide(() => {
      if (quickPick.selectedItems.length === 0) {
        this._accessibleView.show(provider);
      }
      disposables.dispose();
    }));
  }
};
AccessibleViewSymbolQuickPick = __decorateClass([
  __decorateParam(1, IQuickInputService)
], AccessibleViewSymbolQuickPick);
function shouldHide(event, keybindingService, configurationService) {
  if (!configurationService.getValue(AccessibilityWorkbenchSettingId.AccessibleViewCloseOnKeyPress)) {
    return false;
  }
  const standardKeyboardEvent = new StandardKeyboardEvent(event);
  const resolveResult = keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
  const isValidChord = resolveResult.kind === ResultKind.MoreChordsNeeded;
  if (keybindingService.inChordMode || isValidChord) {
    return false;
  }
  return shouldHandleKey(event) && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}
function shouldHandleKey(event) {
  return !!event.code.match(/^(Key[A-Z]|Digit[0-9]|Equal|Comma|Period|Slash|Quote|Backquote|Backslash|Minus|Semicolon|Space|Enter)$/);
}
export {
  AccessibleView,
  AccessibleViewService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFjY2Vzc2liaWxpdHlcXGJyb3dzZXJcXGFjY2Vzc2libGVWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnRUeXBlLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldEFjdGl2ZVdpbmRvdywgZ2V0V2luZG93LCBpc0FjdGl2ZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50LCBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0LCBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuXG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5SGVscE5MUyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc3RhbmRhbG9uZVN0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRmxvYXRpbmdFZGl0b3JUb29sYmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmxvYXRpbmdNZW51L2Jyb3dzZXIvZmxvYXRpbmdNZW51LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIsIEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCwgQWNjZXNzaWJsZVZpZXdUeXBlLCBFeHRlbnNpb25Db250ZW50UHJvdmlkZXIsIElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsIElBY2Nlc3NpYmxlVmlld1N5bWJvbCwgaXNJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgQUNDRVNTSUJMRV9WSUVXX1NIT1dOX1NUT1JBR0VfUFJFRklYLCBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld0RlbGVnYXRlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRmxvYXRpbmdFZGl0b3JDbGlja01lbnUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvZGVlZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCwgQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZCwgYWNjZXNzaWJpbGl0eUhlbHBJc1Nob3duLCBhY2Nlc3NpYmxlVmlld0NvbnRhaW5zQ29kZUJsb2NrcywgYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZCwgYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkLCBhY2Nlc3NpYmxlVmlld0hhc0Fzc2lnbmVkS2V5YmluZGluZ3MsIGFjY2Vzc2libGVWaWV3SGFzVW5hc3NpZ25lZEtleWJpbmRpbmdzLCBhY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrLCBhY2Nlc3NpYmxlVmlld0lzU2hvd24sIGFjY2Vzc2libGVWaWV3T25MYXN0TGluZSwgYWNjZXNzaWJsZVZpZXdTdXBwb3J0c05hdmlnYXRpb24sIGFjY2Vzc2libGVWaWV3VmVyYm9zaXR5RW5hYmxlZCB9IGZyb20gJy4vYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbnRlbnRBbmRLZXliaW5kaW5nSXRlbXMgfSBmcm9tICcuL2FjY2Vzc2libGVWaWV3S2V5YmluZGluZ1Jlc29sdmVyLmpzJztcblxuY29uc3QgZW51bSBESU1FTlNJT05TIHtcblx0TUFYX1dJRFRIID0gOTAwLFxuXHRXSURUSF9SQVRJTyA9IDAuNzUsXG5cdE1BWF9IRUlHSFRfUkFUSU8gPSAwLjZcbn1cblxuZXhwb3J0IHR5cGUgQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciA9IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIgfCBFeHRlbnNpb25Db250ZW50UHJvdmlkZXI7XG5cbmludGVyZmFjZSBJQ29kZUJsb2NrIHtcblx0c3RhcnRMaW5lOiBudW1iZXI7XG5cdGVuZExpbmU6IG51bWJlcjtcblx0Y29kZTogc3RyaW5nO1xuXHRsYW5ndWFnZUlkPzogc3RyaW5nO1xuXHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBBY2Nlc3NpYmxlVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9lZGl0b3JXaWRnZXQ6IENvZGVFZGl0b3JXaWRnZXQ7XG5cblx0cHJpdmF0ZSBfYWNjZXNzaWJsaXR5SGVscElzU2hvd246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9vbkxhc3RMaW5lOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdJc1Nob3duOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdTdXBwb3J0c05hdmlnYXRpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9hY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9hY2Nlc3NpYmxlVmlld0dvVG9TeW1ib2xTdXBwb3J0ZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9hY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIF9hY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3M6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9oYXNVbmFzc2lnbmVkS2V5YmluZGluZ3M6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9oYXNBc3NpZ25lZEtleWJpbmRpbmdzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9jb2RlQmxvY2tzPzogSUNvZGVCbG9ja1tdO1xuXHRwcml2YXRlIF9pc0luUXVpY2tQaWNrOiBib29sZWFuID0gZmFsc2U7XG5cblx0Z2V0IGVkaXRvcldpZGdldCgpIHsgcmV0dXJuIHRoaXMuX2VkaXRvcldpZGdldDsgfVxuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF90aXRsZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xiYXI6IFdvcmtiZW5jaFRvb2xCYXI7XG5cblx0cHJpdmF0ZSBfY3VycmVudFByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50Q29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2xhc3RQcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFByb3ZpZGVyUG9zaXRpb246IE1hcDxzdHJpbmcsIFBvc2l0aW9uPiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIF92aWV3Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDaGF0Q29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlOiBJQ2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9hY2Nlc3NpYmxpdHlIZWxwSXNTaG93biA9IGFjY2Vzc2liaWxpdHlIZWxwSXNTaG93bi5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3SXNTaG93biA9IGFjY2Vzc2libGVWaWV3SXNTaG93bi5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uID0gYWNjZXNzaWJsZVZpZXdTdXBwb3J0c05hdmlnYXRpb24uYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQgPSBhY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0dvVG9TeW1ib2xTdXBwb3J0ZWQgPSBhY2Nlc3NpYmxlVmlld0dvVG9TeW1ib2xTdXBwb3J0ZWQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkID0gYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2sgPSBhY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3MgPSBhY2Nlc3NpYmxlVmlld0NvbnRhaW5zQ29kZUJsb2Nrcy5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX29uTGFzdExpbmUgPSBhY2Nlc3NpYmxlVmlld09uTGFzdExpbmUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNVbmFzc2lnbmVkS2V5YmluZGluZ3MgPSBhY2Nlc3NpYmxlVmlld0hhc1VuYXNzaWduZWRLZXliaW5kaW5ncy5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0Fzc2lnbmVkS2V5YmluZGluZ3MgPSBhY2Nlc3NpYmxlVmlld0hhc0Fzc2lnbmVkS2V5YmluZGluZ3MuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhY2Nlc3NpYmxlLXZpZXcnKTtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5IaWRlQWNjZXNzaWJsZVZpZXcpKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdH1cblx0XHRjb25zdCBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdFx0Y29udHJpYnV0aW9uczogRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKVxuXHRcdFx0XHQuZmlsdGVyKGMgPT4gYy5pZCAhPT0gQ29kZUFjdGlvbkNvbnRyb2xsZXIuSUQgJiYgYy5pZCAhPT0gRmxvYXRpbmdFZGl0b3JDbGlja01lbnUuSUQgJiYgYy5pZCAhPT0gRmxvYXRpbmdFZGl0b3JUb29sYmFyLklEKVxuXHRcdH07XG5cdFx0Y29uc3QgdGl0bGVCYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aXRsZUJhci5jbGFzc0xpc3QuYWRkKCdhY2Nlc3NpYmxlLXZpZXctdGl0bGUtYmFyJyk7XG5cdFx0dGhpcy5fdGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl90aXRsZS5jbGFzc0xpc3QuYWRkKCdhY2Nlc3NpYmxlLXZpZXctdGl0bGUnKTtcblx0XHR0aXRsZUJhci5hcHBlbmRDaGlsZCh0aGlzLl90aXRsZSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YWN0aW9uQmFyLmNsYXNzTGlzdC5hZGQoJ2FjY2Vzc2libGUtdmlldy1hY3Rpb24tYmFyJyk7XG5cdFx0dGl0bGVCYXIuYXBwZW5kQ2hpbGQoYWN0aW9uQmFyKTtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGl0bGVCYXIpO1xuXHRcdHRoaXMuX3Rvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgYWN0aW9uQmFyLCB7IG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KSk7XG5cdFx0dGhpcy5fdG9vbGJhci5jb250ZXh0ID0geyB2aWV3SWQ6ICdhY2Nlc3NpYmxlVmlldycgfTtcblx0XHRjb25zdCB0b29sYmFyRWx0ID0gdGhpcy5fdG9vbGJhci5nZXRFbGVtZW50KCk7XG5cdFx0dG9vbGJhckVsdC50YWJJbmRleCA9IDA7XG5cblx0XHRjb25zdCBlZGl0b3JPcHRpb25zOiBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyA9IHtcblx0XHRcdC4uLmdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDYsXG5cdFx0XHRkcmFnQW5kRHJvcDogZmFsc2UsXG5cdFx0XHRjdXJzb3JXaWR0aDogMSxcblx0XHRcdHdvcmRXcmFwOiAnb2ZmJyxcblx0XHRcdHdyYXBwaW5nU3RyYXRlZ3k6ICdhZHZhbmNlZCcsXG5cdFx0XHR3cmFwcGluZ0luZGVudDogJ25vbmUnLFxuXHRcdFx0cGFkZGluZzogeyB0b3A6IDIsIGJvdHRvbTogMiB9LFxuXHRcdFx0cXVpY2tTdWdnZXN0aW9uczogZmFsc2UsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnbm9uZScsXG5cdFx0XHRkcm9wSW50b0VkaXRvcjogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRmb250RmFtaWx5OiAndmFyKC0tbW9uYWNvLW1vbm9zcGFjZS1mb250KSdcblx0XHR9O1xuXG5cdFx0dGhpcy5fZWRpdG9yV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgdGhpcy5fY29udGFpbmVyLCBlZGl0b3JPcHRpb25zLCBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50UHJvdmlkZXIgJiYgdGhpcy5fYWNjZXNzaWJsaXR5SGVscElzU2hvd24uZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5zaG93KHRoaXMuX2N1cnJlbnRQcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChpc0lBY2Nlc3NpYmxlVmlld0NvbnRlbnRQcm92aWRlcih0aGlzLl9jdXJyZW50UHJvdmlkZXIpICYmIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24odGhpcy5fY3VycmVudFByb3ZpZGVyLnZlcmJvc2l0eVNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY2Nlc3NpYmxpdHlIZWxwSXNTaG93bi5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2hvdyh0aGlzLl9jdXJyZW50UHJvdmlkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3VmVyYm9zaXR5RW5hYmxlZC5zZXQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodGhpcy5fY3VycmVudFByb3ZpZGVyLnZlcmJvc2l0eVNldHRpbmdLZXkpKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhcih0aGlzLl9jdXJyZW50UHJvdmlkZXIuYWN0aW9ucywgdGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMudHlwZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkhpZGVBY2Nlc3NpYmxlVmlldykpIHtcblx0XHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkhpZGVBY2Nlc3NpYmxlVmlldykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JXaWRnZXQub25EaWREaXNwb3NlKCgpID0+IHRoaXMuX3Jlc2V0Q29udGV4dEtleXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvcldpZGdldC5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHtcblx0XHRcdHRoaXMuX29uTGFzdExpbmUuc2V0KHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpPy5saW5lTnVtYmVyID09PSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0UG9zaXRpb24oKT8ubGluZU51bWJlcjtcblx0XHRcdGlmICh0aGlzLl9jb2RlQmxvY2tzICYmIGN1cnNvclBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgaW5Db2RlQmxvY2sgPSB0aGlzLl9jb2RlQmxvY2tzLmZpbmQoYyA9PiBjLnN0YXJ0TGluZSA8PSBjdXJzb3JQb3NpdGlvbiAmJiBjLmVuZExpbmUgPj0gY3Vyc29yUG9zaXRpb24pICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2suc2V0KGluQ29kZUJsb2NrKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BsYXlEaWZmU2lnbmFscygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3BsYXlEaWZmU2lnbmFscygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyPy5pZCAhPT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLkRpZmZFZGl0b3IgJiYgdGhpcy5fY3VycmVudFByb3ZpZGVyPy5pZCAhPT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLklubGluZUNvbXBsZXRpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIXBvc2l0aW9uIHx8ICFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRpZiAobGluZUNvbnRlbnQ/LnN0YXJ0c1dpdGgoJysnKSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lSW5zZXJ0ZWQpO1xuXHRcdH0gZWxzZSBpZiAobGluZUNvbnRlbnQ/LnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lRGVsZXRlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxpdHlIZWxwSXNTaG93bi5yZXNldCgpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3SXNTaG93bi5yZXNldCgpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uLnJlc2V0KCk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkLnJlc2V0KCk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdHb1RvU3ltYm9sU3VwcG9ydGVkLnJlc2V0KCk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZC5yZXNldCgpO1xuXHRcdHRoaXMuX2hhc0Fzc2lnbmVkS2V5YmluZGluZ3MucmVzZXQoKTtcblx0XHR0aGlzLl9oYXNVbmFzc2lnbmVkS2V5YmluZGluZ3MucmVzZXQoKTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKGlkPzogQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkKTogUG9zaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghaWQgfHwgIXRoaXMuX2xhc3RQcm92aWRlciB8fCB0aGlzLl9sYXN0UHJvdmlkZXIuaWQgIT09IGlkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCkgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0UG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCByZXZlYWw/OiBib29sZWFuLCBzZWxlY3Q/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRpZiAocmV2ZWFsKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQucmV2ZWFsUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdH1cblx0XHRpZiAoc2VsZWN0KSB7XG5cdFx0XHRjb25zdCBsaW5lTGVuZ3RoID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk/LmdldExpbmVMZW5ndGgocG9zaXRpb24ubGluZU51bWJlcikgPz8gMDtcblx0XHRcdGlmIChsaW5lTGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRTZWxlY3Rpb24oeyBzdGFydExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRDb2x1bW46IGxpbmVMZW5ndGggKyAxIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldENvZGVCbG9ja0NvbnRleHQoKTogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKCF0aGlzLl9jb2RlQmxvY2tzPy5sZW5ndGggfHwgIXBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvZGVCbG9ja0luZGV4ID0gdGhpcy5fY29kZUJsb2Nrcz8uZmluZEluZGV4KGMgPT4gYy5zdGFydExpbmUgPD0gcG9zaXRpb24/LmxpbmVOdW1iZXIgJiYgYy5lbmRMaW5lID49IHBvc2l0aW9uPy5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBjb2RlQmxvY2sgPSBjb2RlQmxvY2tJbmRleCAhPT0gdW5kZWZpbmVkICYmIGNvZGVCbG9ja0luZGV4ID4gLTEgPyB0aGlzLl9jb2RlQmxvY2tzW2NvZGVCbG9ja0luZGV4XSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWNvZGVCbG9jayB8fCBjb2RlQmxvY2tJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB7IGNvZGU6IGNvZGVCbG9jay5jb2RlLCBsYW5ndWFnZUlkOiBjb2RlQmxvY2subGFuZ3VhZ2VJZCwgY29kZUJsb2NrSW5kZXgsIGVsZW1lbnQ6IHVuZGVmaW5lZCwgY2hhdFNlc3Npb25SZXNvdXJjZTogY29kZUJsb2NrLmNoYXRTZXNzaW9uUmVzb3VyY2UgfTtcblx0fVxuXG5cdG5hdmlnYXRlVG9Db2RlQmxvY2sodHlwZTogJ25leHQnIHwgJ3ByZXZpb3VzJyk6IHZvaWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWRpdG9yV2lkZ2V0LmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKCF0aGlzLl9jb2RlQmxvY2tzPy5sZW5ndGggfHwgIXBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBjb2RlQmxvY2s7XG5cdFx0Y29uc3QgY29kZUJsb2NrcyA9IHRoaXMuX2NvZGVCbG9ja3Muc2xpY2UoKTtcblx0XHRpZiAodHlwZSA9PT0gJ3ByZXZpb3VzJykge1xuXHRcdFx0Y29kZUJsb2NrID0gY29kZUJsb2Nrcy5yZXZlcnNlKCkuZmluZChjID0+IGMuZW5kTGluZSA8IHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb2RlQmxvY2sgPSBjb2RlQmxvY2tzLmZpbmQoYyA9PiBjLnN0YXJ0TGluZSA+IHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRpZiAoIWNvZGVCbG9jaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbihjb2RlQmxvY2suc3RhcnRMaW5lLCAxKSwgdHJ1ZSk7XG5cdH1cblxuXHRzaG93TGFzdFByb3ZpZGVyKGlkOiBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2xhc3RQcm92aWRlciB8fCB0aGlzLl9sYXN0UHJvdmlkZXIub3B0aW9ucy5pZCAhPT0gaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zaG93KHRoaXMuX2xhc3RQcm92aWRlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWNjZXNzaWJpbGl0eVN0YXR1cygpOiB7IHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgaXNJbkNvZGVCbG9jazogYm9vbGVhbjsgb25MYXN0TGluZTogYm9vbGVhbiB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvdmlkZXJJZDogdGhpcy5fY3VycmVudFByb3ZpZGVyPy5pZCxcblx0XHRcdGlzSW5Db2RlQmxvY2s6IHRoaXMuX2FjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2suZ2V0KCkgPz8gZmFsc2UsXG5cdFx0XHRvbkxhc3RMaW5lOiB0aGlzLl9vbkxhc3RMaW5lLmdldCgpID8/IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHNob3cocHJvdmlkZXI/OiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCBzeW1ib2w/OiBJQWNjZXNzaWJsZVZpZXdTeW1ib2wsIHNob3dBY2Nlc3NpYmxlVmlld0hlbHA/OiBib29sZWFuLCBwb3NpdGlvbj86IElQb3NpdGlvbik6IHZvaWQge1xuXHRcdHByb3ZpZGVyID0gcHJvdmlkZXIgPz8gdGhpcy5fY3VycmVudFByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cHJvdmlkZXIub25PcGVuPy4oKTtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUNvbnRleHRWaWV3RGVsZWdhdGUgPSB7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHsgcmV0dXJuIHsgeDogKGdldEFjdGl2ZVdpbmRvdygpLmlubmVyV2lkdGggLyAyKSAtICgoTWF0aC5taW4odGhpcy5fbGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXJEaW1lbnNpb24ud2lkdGggKiBESU1FTlNJT05TLldJRFRIX1JBVElPLCBESU1FTlNJT05TLk1BWF9XSURUSCkpIC8gMiksIHk6IHRoaXMuX2xheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyT2Zmc2V0LnF1aWNrUGlja1RvcCB9OyB9LFxuXHRcdFx0cmVuZGVyOiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3ZpZXdDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0XHRcdHRoaXMuX3ZpZXdDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWNjZXNzaWJsZS12aWV3LWNvbnRhaW5lcicpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyKHByb3ZpZGVyLCBjb250YWluZXIsIHNob3dBY2Nlc3NpYmxlVmlld0hlbHApO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXNob3dBY2Nlc3NpYmxlVmlld0hlbHApIHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVMYXN0UHJvdmlkZXIoKTtcblx0XHRcdFx0XHQvLyBTYXZlIGN1cnNvciBwb3NpdGlvbiBiZWZvcmUgZGlzcG9zaW5nIHNvIGl0IGNhbiBiZSByZXN0b3JlZCBvbiByZW9wZW5cblx0XHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50UG9zaXRpb24gPSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50UG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGFzdFByb3ZpZGVyUG9zaXRpb24uc2V0KHRoaXMuX2N1cnJlbnRQcm92aWRlci5pZCwgY3VycmVudFBvc2l0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudFByb3ZpZGVyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudFByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc2V0Q29udGV4dEtleXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLnNob3dDb250ZXh0VmlldyhkZWxlZ2F0ZSk7XG5cblx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdC8vIENvbnRleHQgdmlldyB0YWtlcyB0aW1lIHRvIHNob3cgdXAsIHNvIHdlIG5lZWQgdG8gd2FpdCBmb3IgaXQgdG8gc2hvdyB1cCBiZWZvcmUgd2UgY2FuIHNldCB0aGUgcG9zaXRpb25cblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnJldmVhbExpbmUocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRTZWxlY3Rpb24oeyBzdGFydExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sIGVuZExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZENvbHVtbjogcG9zaXRpb24uY29sdW1uIH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHN5bWJvbCAmJiB0aGlzLl9jdXJyZW50UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuc2hvd1N5bWJvbCh0aGlzLl9jdXJyZW50UHJvdmlkZXIsIHN5bWJvbCk7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlciBpbnN0YW5jZW9mIEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIgJiYgcHJvdmlkZXIub25EaWRSZXF1ZXN0Q2xlYXJMYXN0UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHByb3ZpZGVyLm9uRGlkUmVxdWVzdENsZWFyTGFzdFByb3ZpZGVyKChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9sYXN0UHJvdmlkZXI/Lm9wdGlvbnMuaWQgPT09IGlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdFByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xhc3RQcm92aWRlclBvc2l0aW9uLmRlbGV0ZShpZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlci5vcHRpb25zLmlkKSB7XG5cdFx0XHQvLyBvbmx5IGNhY2hlIGEgcHJvdmlkZXIgd2l0aCBhbiBJRCBzbyB0aGF0IGl0IHdpbGwgZXZlbnR1YWxseSBiZSBjbGVhcmVkLlxuXHRcdFx0dGhpcy5fbGFzdFByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlci5pZCA9PT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlBhbmVsQ2hhdCB8fCBwcm92aWRlci5pZCA9PT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlF1aWNrQ2hhdCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHsgZ2V0Q29kZUJsb2NrQ29udGV4dDogKCkgPT4gdGhpcy5nZXRDb2RlQmxvY2tDb250ZXh0KCkgfSwgJ2FjY2Vzc2libGVWaWV3JykpO1xuXHRcdH1cblx0XHRpZiAocHJvdmlkZXIgaW5zdGFuY2VvZiBFeHRlbnNpb25Db250ZW50UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKGAke0FDQ0VTU0lCTEVfVklFV19TSE9XTl9TVE9SQUdFX1BSRUZJWH0ke3Byb3ZpZGVyLmlkfWAsIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ29udGVudCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJvdmlkZXIub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3ZpZXdDb250YWluZXIpIHsgdGhpcy5fcmVuZGVyKHByb3ZpZGVyLCB0aGlzLl92aWV3Q29udGFpbmVyLCBzaG93QWNjZXNzaWJsZVZpZXdIZWxwKTsgfVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByZXZpb3VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSB0aGlzLl9jdXJyZW50UHJvdmlkZXI/LnByb3ZpZGVQcmV2aW91c0NvbnRlbnQ/LigpO1xuXHRcdGlmICghdGhpcy5fY3VycmVudFByb3ZpZGVyIHx8ICF0aGlzLl92aWV3Q29udGFpbmVyIHx8ICFuZXdDb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlcih0aGlzLl9jdXJyZW50UHJvdmlkZXIsIHRoaXMuX3ZpZXdDb250YWluZXIsIHVuZGVmaW5lZCwgbmV3Q29udGVudCk7XG5cdH1cblxuXHRuZXh0KCk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSB0aGlzLl9jdXJyZW50UHJvdmlkZXI/LnByb3ZpZGVOZXh0Q29udGVudD8uKCk7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvdmlkZXIgfHwgIXRoaXMuX3ZpZXdDb250YWluZXIgfHwgIW5ld0NvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyKHRoaXMuX2N1cnJlbnRQcm92aWRlciwgdGhpcy5fdmlld0NvbnRhaW5lciwgdW5kZWZpbmVkLCBuZXdDb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3ZlcmJvc2l0eUVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGlzSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyKHRoaXMuX2N1cnJlbnRQcm92aWRlcikgPyB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSh0aGlzLl9jdXJyZW50UHJvdmlkZXIudmVyYm9zaXR5U2V0dGluZ0tleSkgPT09IHRydWUgOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGAke0FDQ0VTU0lCTEVfVklFV19TSE9XTl9TVE9SQUdFX1BSRUZJWH0ke3RoaXMuX2N1cnJlbnRQcm92aWRlci5pZH1gLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0fVxuXG5cdGdvVG9TeW1ib2woKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNJblF1aWNrUGljayA9IHRydWU7XG5cdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWNjZXNzaWJsZVZpZXdTeW1ib2xRdWlja1BpY2ssIHRoaXMpLnNob3codGhpcy5fY3VycmVudFByb3ZpZGVyKTtcblx0fVxuXG5cdGNhbGN1bGF0ZUNvZGVCbG9ja3MobWFya2Rvd24/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIW1hcmtkb3duKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jdXJyZW50UHJvdmlkZXI/LmlkICE9PSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuUGFuZWxDaGF0ICYmIHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uaWQgIT09IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZC5RdWlja0NoYXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLmxhbmd1YWdlICYmIHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLmxhbmd1YWdlICE9PSAnbWFya2Rvd24nKSB7XG5cdFx0XHQvLyBTeW1ib2xzIGhhdmVuJ3QgYmVlbiBwcm92aWRlZCBhbmQgd2UgY2Fubm90IHBhcnNlIHRoaXMgbGFuZ3VhZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGluZXMgPSBtYXJrZG93bi5zcGxpdCgnXFxuJyk7XG5cdFx0dGhpcy5fY29kZUJsb2NrcyA9IFtdO1xuXHRcdGxldCBpbkJsb2NrID0gZmFsc2U7XG5cdFx0bGV0IHN0YXJ0TGluZSA9IDA7XG5cblx0XHRsZXQgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxpbmVzLmZvckVhY2goKGxpbmUsIGkpID0+IHtcblx0XHRcdGlmICghaW5CbG9jayAmJiBsaW5lLnN0YXJ0c1dpdGgoJ2BgYCcpKSB7XG5cdFx0XHRcdGluQmxvY2sgPSB0cnVlO1xuXHRcdFx0XHRzdGFydExpbmUgPSBpICsgMTtcblx0XHRcdFx0bGFuZ3VhZ2VJZCA9IGxpbmUuc3Vic3RyaW5nKDMpLnRyaW0oKTtcblx0XHRcdH0gZWxzZSBpZiAoaW5CbG9jayAmJiBsaW5lLmVuZHNXaXRoKCdgYGAnKSkge1xuXHRcdFx0XHRpbkJsb2NrID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGVuZExpbmUgPSBpO1xuXHRcdFx0XHRjb25zdCBjb2RlID0gbGluZXMuc2xpY2Uoc3RhcnRMaW5lLCBlbmRMaW5lKS5qb2luKCdcXG4nKTtcblx0XHRcdFx0dGhpcy5fY29kZUJsb2Nrcz8ucHVzaCh7IHN0YXJ0TGluZSwgZW5kTGluZSwgY29kZSwgbGFuZ3VhZ2VJZCwgY2hhdFNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Q29udGFpbnNDb2RlQmxvY2tzLnNldCh0aGlzLl9jb2RlQmxvY2tzLmxlbmd0aCA+IDApO1xuXHR9XG5cblx0Z2V0U3ltYm9scygpOiBJQWNjZXNzaWJsZVZpZXdTeW1ib2xbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jdXJyZW50UHJvdmlkZXIgPyB0aGlzLl9jdXJyZW50UHJvdmlkZXIgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50Q29udGVudCB8fCAhcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3ltYm9sczogSUFjY2Vzc2libGVWaWV3U3ltYm9sW10gPSAnZ2V0U3ltYm9scycgaW4gcHJvdmlkZXIgPyBwcm92aWRlci5nZXRTeW1ib2xzPy4oKSB8fCBbXSA6IFtdO1xuXHRcdGlmIChzeW1ib2xzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBzeW1ib2xzO1xuXHRcdH1cblx0XHRpZiAocHJvdmlkZXIub3B0aW9ucy5sYW5ndWFnZSAmJiBwcm92aWRlci5vcHRpb25zLmxhbmd1YWdlICE9PSAnbWFya2Rvd24nKSB7XG5cdFx0XHQvLyBTeW1ib2xzIGhhdmVuJ3QgYmVlbiBwcm92aWRlZCBhbmQgd2UgY2Fubm90IHBhcnNlIHRoaXMgbGFuZ3VhZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2Rvd25Ub2tlbnM6IG1hcmtlZC5Ub2tlbnNMaXN0IHwgdW5kZWZpbmVkID0gbWFya2VkLm1hcmtlZC5sZXhlcih0aGlzLl9jdXJyZW50Q29udGVudCk7XG5cdFx0aWYgKCFtYXJrZG93blRva2Vucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb252ZXJ0VG9rZW5zVG9TeW1ib2xzKG1hcmtkb3duVG9rZW5zLCBzeW1ib2xzKTtcblx0XHRyZXR1cm4gc3ltYm9scy5sZW5ndGggPyBzeW1ib2xzIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0b3BlbkhlbHBMaW5rKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3VycmVudFByb3ZpZGVyPy5vcHRpb25zLnJlYWRNb3JlVXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMucmVhZE1vcmVVcmwpKTtcblx0fVxuXG5cdGNvbmZpZ3VyZUtleWJpbmRpbmdzKHVuYXNzaWduZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0luUXVpY2tQaWNrID0gdHJ1ZTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3VwZGF0ZUxhc3RQcm92aWRlcigpO1xuXHRcdGNvbnN0IGl0ZW1zID0gdW5hc3NpZ25lZCA/IHByb3ZpZGVyPy5vcHRpb25zPy5jb25maWd1cmVLZXliaW5kaW5nSXRlbXMgOiBwcm92aWRlcj8ub3B0aW9ucz8uY29uZmlndXJlZEtleWJpbmRpbmdJdGVtcztcblx0XHRpZiAoIWl0ZW1zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBxdWlja1BpY2s6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljaygpKTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgna2V5YmluZGluZ3MnLCAnQ29uZmlndXJlIGtleWJpbmRpbmdzJyk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlbGVjdEtleWJpbmRpbmcnLCAnU2VsZWN0IGEgY29tbWFuZCBJRCB0byBjb25maWd1cmUgYSBrZXliaW5kaW5nIGZvciBpdCcpO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0gcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3MnLCBpdGVtLmlkKTtcblx0XHRcdH1cblx0XHRcdHF1aWNrUGljay5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdGlmICghcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMubGVuZ3RoICYmIHByb3ZpZGVyKSB7XG5cdFx0XHRcdHRoaXMuc2hvdyhwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9pc0luUXVpY2tQaWNrID0gZmFsc2U7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29udmVydFRva2Vuc1RvU3ltYm9scyh0b2tlbnM6IG1hcmtlZC5Ub2tlbnNMaXN0LCBzeW1ib2xzOiBJQWNjZXNzaWJsZVZpZXdTeW1ib2xbXSk6IHZvaWQge1xuXHRcdGxldCBmaXJzdExpc3RJdGVtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB0b2tlbiBvZiB0b2tlbnMpIHtcblx0XHRcdGxldCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCd0eXBlJyBpbiB0b2tlbikge1xuXHRcdFx0XHRzd2l0Y2ggKHRva2VuLnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdoZWFkaW5nJzpcblx0XHRcdFx0XHRjYXNlICdwYXJhZ3JhcGgnOlxuXHRcdFx0XHRcdGNhc2UgJ2NvZGUnOlxuXHRcdFx0XHRcdFx0bGFiZWwgPSB0b2tlbi50ZXh0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbGlzdCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGZpcnN0SXRlbSA9ICh0b2tlbiBhcyBtYXJrZWQuVG9rZW5zLkxpc3QpLml0ZW1zWzBdO1xuXHRcdFx0XHRcdFx0aWYgKCFmaXJzdEl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRmaXJzdExpc3RJdGVtID0gYC0gJHtmaXJzdEl0ZW0udGV4dH1gO1xuXHRcdFx0XHRcdFx0bGFiZWwgPSAodG9rZW4gYXMgbWFya2VkLlRva2Vucy5MaXN0KS5pdGVtcy5tYXAoaSA9PiBpLnRleHQpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRzeW1ib2xzLnB1c2goeyBtYXJrZG93blRvUGFyc2U6IGxhYmVsLCBsYWJlbDogbG9jYWxpemUoJ3N5bWJvbExhYmVsJywgXCIoezB9KSB7MX1cIiwgdG9rZW4udHlwZSwgbGFiZWwpLCBhcmlhTGFiZWw6IGxvY2FsaXplKCdzeW1ib2xMYWJlbEFyaWEnLCBcIih7MH0pIHsxfVwiLCB0b2tlbi50eXBlLCBsYWJlbCksIGZpcnN0TGlzdEl0ZW0gfSk7XG5cdFx0XHRcdGZpcnN0TGlzdEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2hvd1N5bWJvbChwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciwgc3ltYm9sOiBJQWNjZXNzaWJsZVZpZXdTeW1ib2wpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRDb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBsaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQgPSBzeW1ib2wubGluZU51bWJlcjtcblx0XHRjb25zdCBtYXJrZG93blRvUGFyc2UgPSBzeW1ib2wubWFya2Rvd25Ub1BhcnNlO1xuXHRcdGlmIChsaW5lTnVtYmVyID09PSB1bmRlZmluZWQgJiYgbWFya2Rvd25Ub1BhcnNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIE5vIHN5bWJvbHMgcHJvdmlkZWQgYW5kIHdlIGNhbm5vdCBwYXJzZSB0aGlzIGxhbmd1YWdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IHVuZGVmaW5lZCAmJiBtYXJrZG93blRvUGFyc2UpIHtcblx0XHRcdC8vIE5vdGUgdGhhdCB0aGlzIHNjYWxlcyBwb29ybHksIHRodXMgaXNuJ3QgdXNlZCBmb3Igd29yc3QgY2FzZSBzY2VuYXJpb3MgbGlrZSB0aGUgdGVybWluYWwsIGZvciB3aGljaCBhIGxpbmUgbnVtYmVyIHdpbGwgYWx3YXlzIGJlIHByb3ZpZGVkLlxuXHRcdFx0Ly8gUGFyc2UgdGhlIG1hcmtkb3duIHRvIGZpbmQgdGhlIGxpbmUgbnVtYmVyXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2N1cnJlbnRDb250ZW50LnNwbGl0KCdcXG4nKS5maW5kSW5kZXgobGluZSA9PiBsaW5lLmluY2x1ZGVzKG1hcmtkb3duVG9QYXJzZS5zcGxpdCgnXFxuJylbMF0pIHx8IChzeW1ib2wuZmlyc3RMaXN0SXRlbSAmJiBsaW5lLmluY2x1ZGVzKHN5bWJvbC5maXJzdExpc3RJdGVtKSkpID8/IC0xO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0bGluZU51bWJlciA9IGluZGV4ICsgMTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0luUXVpY2tQaWNrID0gZmFsc2U7XG5cdFx0dGhpcy5zaG93KHByb3ZpZGVyLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBsaW5lTnVtYmVyLCBjb2x1bW46IDEgfSk7XG5cdFx0dGhpcy5fdXBkYXRlQ29udGV4dEtleXMocHJvdmlkZXIsIHRydWUpO1xuXHR9XG5cblx0ZGlzYWJsZUhpbnQoKTogdm9pZCB7XG5cdFx0aWYgKCFpc0lBY2Nlc3NpYmxlVmlld0NvbnRlbnRQcm92aWRlcih0aGlzLl9jdXJyZW50UHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHRoaXMuX2N1cnJlbnRQcm92aWRlcj8udmVyYm9zaXR5U2V0dGluZ0tleSwgZmFsc2UpO1xuXHRcdGFsZXJ0KGxvY2FsaXplKCdkaXNhYmxlQWNjZXNzaWJpbGl0eUhlbHAnLCAnezB9IGFjY2Vzc2liaWxpdHkgdmVyYm9zaXR5IGlzIG5vdyBkaXNhYmxlZCcsIHRoaXMuX2N1cnJlbnRQcm92aWRlci52ZXJib3NpdHlTZXR0aW5nS2V5KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250ZXh0S2V5cyhwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciwgc2hvd246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAocHJvdmlkZXIub3B0aW9ucy50eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJsaXR5SGVscElzU2hvd24uc2V0KHNob3duKTtcblx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3SXNTaG93bi5yZXNldCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0lzU2hvd24uc2V0KHNob3duKTtcblx0XHRcdHRoaXMuX2FjY2Vzc2libGl0eUhlbHBJc1Nob3duLnJlc2V0KCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3U3VwcG9ydHNOYXZpZ2F0aW9uLnNldChwcm92aWRlci5wcm92aWRlTmV4dENvbnRlbnQgIT09IHVuZGVmaW5lZCB8fCBwcm92aWRlci5wcm92aWRlUHJldmlvdXNDb250ZW50ICE9PSB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3VmVyYm9zaXR5RW5hYmxlZC5zZXQodGhpcy5fdmVyYm9zaXR5RW5hYmxlZCgpKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld0dvVG9TeW1ib2xTdXBwb3J0ZWQuc2V0KHRoaXMuX2dvVG9TeW1ib2xzU3VwcG9ydGVkKCkgPyB0aGlzLmdldFN5bWJvbHMoKT8ubGVuZ3RoISA+IDAgOiBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdGFibGVVcmkocHJvdmlkZXJJZDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBwYXRoOiBgYWNjZXNzaWJsZS12aWV3LSR7cHJvdmlkZXJJZH1gLCBzY2hlbWU6IFNjaGVtYXMuYWNjZXNzaWJsZVZpZXcgfSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250ZW50KHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyLCB1cGRhdGVkQ29udGVudD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCBjb250ZW50ID0gdXBkYXRlZENvbnRlbnQgPz8gcHJvdmlkZXIucHJvdmlkZUNvbnRlbnQoKTtcblx0XHRpZiAocHJvdmlkZXIub3B0aW9ucy50eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuVmlldykge1xuXHRcdFx0dGhpcy5fY3VycmVudENvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0dGhpcy5faGFzVW5hc3NpZ25lZEtleWJpbmRpbmdzLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNBc3NpZ25lZEtleWJpbmRpbmdzLnJlc2V0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlYWRNb3JlTGlua0hpbnQgPSB0aGlzLl9yZWFkTW9yZUhpbnQocHJvdmlkZXIpO1xuXHRcdGNvbnN0IGRpc2FibGVIZWxwSGludCA9IHRoaXMuX2Rpc2FibGVWZXJib3NpdHlIaW50KHByb3ZpZGVyKTtcblx0XHRjb25zdCBzY3JlZW5SZWFkZXJNb2RlSGludCA9IHRoaXMuX3NjcmVlblJlYWRlck1vZGVIaW50KHByb3ZpZGVyKTtcblx0XHRjb25zdCBleGl0VGhpc0RpYWxvZ0hpbnQgPSB0aGlzLl9leGl0RGlhbG9nSGludChwcm92aWRlcik7XG5cdFx0bGV0IGNvbmZpZ3VyZUtiSGludCA9ICcnO1xuXHRcdGxldCBjb25maWd1cmVBc3NpZ25lZEtiSGludCA9ICcnO1xuXHRcdGNvbnN0IHJlc29sdmVkQ29udGVudCA9IHJlc29sdmVDb250ZW50QW5kS2V5YmluZGluZ0l0ZW1zKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCBzY3JlZW5SZWFkZXJNb2RlSGludCArIGNvbnRlbnQgKyByZWFkTW9yZUxpbmtIaW50ICsgZGlzYWJsZUhlbHBIaW50ICsgZXhpdFRoaXNEaWFsb2dIaW50KTtcblx0XHRpZiAocmVzb2x2ZWRDb250ZW50KSB7XG5cdFx0XHRjb250ZW50ID0gcmVzb2x2ZWRDb250ZW50LmNvbnRlbnQudmFsdWU7XG5cdFx0XHRpZiAocmVzb2x2ZWRDb250ZW50LmNvbmZpZ3VyZUtleWJpbmRpbmdJdGVtcykge1xuXHRcdFx0XHRwcm92aWRlci5vcHRpb25zLmNvbmZpZ3VyZUtleWJpbmRpbmdJdGVtcyA9IHJlc29sdmVkQ29udGVudC5jb25maWd1cmVLZXliaW5kaW5nSXRlbXM7XG5cdFx0XHRcdHRoaXMuX2hhc1VuYXNzaWduZWRLZXliaW5kaW5ncy5zZXQodHJ1ZSk7XG5cdFx0XHRcdGNvbmZpZ3VyZUtiSGludCA9IHRoaXMuX2NvbmZpZ3VyZVVuYXNzaWduZWRLYkhpbnQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2hhc0Fzc2lnbmVkS2V5YmluZGluZ3MucmVzZXQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXNvbHZlZENvbnRlbnQuY29uZmlndXJlZEtleWJpbmRpbmdJdGVtcykge1xuXHRcdFx0XHRwcm92aWRlci5vcHRpb25zLmNvbmZpZ3VyZWRLZXliaW5kaW5nSXRlbXMgPSByZXNvbHZlZENvbnRlbnQuY29uZmlndXJlZEtleWJpbmRpbmdJdGVtcztcblx0XHRcdFx0dGhpcy5faGFzQXNzaWduZWRLZXliaW5kaW5ncy5zZXQodHJ1ZSk7XG5cdFx0XHRcdGNvbmZpZ3VyZUFzc2lnbmVkS2JIaW50ID0gdGhpcy5fY29uZmlndXJlQXNzaWduZWRLYkhpbnQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2hhc0Fzc2lnbmVkS2V5YmluZGluZ3MucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudENvbnRlbnQgPSBjb250ZW50ICsgY29uZmlndXJlS2JIaW50ICsgY29uZmlndXJlQXNzaWduZWRLYkhpbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIocHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHNob3dBY2Nlc3NpYmxlVmlld0hlbHA/OiBib29sZWFuLCB1cGRhdGVkQ29udGVudD86IHN0cmluZyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBpc1NhbWVQcm92aWRlciA9IHRoaXMuX2N1cnJlbnRQcm92aWRlcj8uaWQgPT09IHByb3ZpZGVyLmlkO1xuXHRcdGNvbnN0IHByZXZpb3VzUG9zaXRpb24gPSBpc1NhbWVQcm92aWRlciA/IHRoaXMuX2VkaXRvcldpZGdldC5nZXRQb3NpdGlvbigpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByZXZpb3VzU2Nyb2xsVG9wID0gaXNTYW1lUHJvdmlkZXIgPyB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0U2Nyb2xsVG9wKCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3VycmVudFByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZC5zZXQocHJvdmlkZXIuaWQpO1xuXHRcdGNvbnN0IHZlcmJvc2UgPSB0aGlzLl92ZXJib3NpdHlFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29udGVudChwcm92aWRlciwgdXBkYXRlZENvbnRlbnQpO1xuXHRcdHRoaXMuY2FsY3VsYXRlQ29kZUJsb2Nrcyh0aGlzLl9jdXJyZW50Q29udGVudCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29udGV4dEtleXMocHJvdmlkZXIsIHRydWUpO1xuXHRcdGNvbnN0IHdpZGdldElzRm9jdXNlZCA9IHRoaXMuX2VkaXRvcldpZGdldC5oYXNUZXh0Rm9jdXMoKSB8fCB0aGlzLl9lZGl0b3JXaWRnZXQuaGFzV2lkZ2V0Rm9jdXMoKTtcblx0XHRjb25zdCBzdGFibGVVcmkgPSB0aGlzLl9nZXRTdGFibGVVcmkocHJvdmlkZXIuaWQpO1xuXHRcdHRoaXMuX2dldFRleHRNb2RlbChzdGFibGVVcmkpLnRoZW4oKG1vZGVsKSA9PiB7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFVwZGF0ZSB0aGUgY29udGVudCBvZiB0aGUgZXhpc3RpbmcgbW9kZWwgaW5zdGVhZCBvZiBjcmVhdGluZyBhIG5ldyBvbmVcblx0XHRcdC8vIFRoaXMgcHJlc2VydmVzIHRoZSBjdXJzb3IgcG9zaXRpb24gd2hlbiBjb250ZW50IGNoYW5nZXNcblx0XHRcdGNvbnN0IGN1cnJlbnRDb250ZW50ID0gdGhpcy5fY3VycmVudENvbnRlbnQgPz8gJyc7XG5cdFx0XHRpZiAobW9kZWwuZ2V0VmFsdWUoKSAhPT0gY3VycmVudENvbnRlbnQpIHtcblx0XHRcdFx0bW9kZWwuc2V0VmFsdWUoY3VycmVudENvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2VkaXRvcldpZGdldC5nZXRNb2RlbCgpICE9PSBtb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQuc2V0TW9kZWwobW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuX2VkaXRvcldpZGdldC5nZXREb21Ob2RlKCk7XG5cdFx0XHRpZiAoIWRvbU5vZGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuc2V0TGFuZ3VhZ2UocHJvdmlkZXIub3B0aW9ucy5sYW5ndWFnZSA/PyAnbWFya2Rvd24nKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9jb250YWluZXIpO1xuXHRcdFx0bGV0IGFjdGlvbnNIaW50ID0gJyc7XG5cdFx0XHRjb25zdCBoYXNBY3Rpb25zID0gdGhpcy5fYWNjZXNzaWJsZVZpZXdTdXBwb3J0c05hdmlnYXRpb24uZ2V0KCkgfHwgdGhpcy5fYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkLmdldCgpIHx8IHRoaXMuX2FjY2Vzc2libGVWaWV3R29Ub1N5bWJvbFN1cHBvcnRlZC5nZXQoKSB8fCBwcm92aWRlci5hY3Rpb25zPy5sZW5ndGg7XG5cdFx0XHRpZiAodmVyYm9zZSAmJiAhc2hvd0FjY2Vzc2libGVWaWV3SGVscCAmJiBoYXNBY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGlvbnNIaW50ID0gcHJvdmlkZXIub3B0aW9ucy5wb3NpdGlvbiA/IGxvY2FsaXplKCdhcmlhQWNjZXNzaWJsZVZpZXdBY3Rpb25zQm90dG9tJywgJ0V4cGxvcmUgYWN0aW9ucyBzdWNoIGFzIGRpc2FibGluZyB0aGlzIGhpbnQgKFNoaWZ0K1RhYiksIHVzZSBFc2NhcGUgdG8gZXhpdCB0aGlzIGRpYWxvZy4nKSA6IGxvY2FsaXplKCdhcmlhQWNjZXNzaWJsZVZpZXdBY3Rpb25zJywgJ0V4cGxvcmUgYWN0aW9ucyBzdWNoIGFzIGRpc2FibGluZyB0aGlzIGhpbnQgKFNoaWZ0K1RhYikuJyk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXJpYUxhYmVsID0gcHJvdmlkZXIub3B0aW9ucy50eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCA/IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LWhlbHAnLCBcIkFjY2Vzc2liaWxpdHkgSGVscFwiKSA6IGxvY2FsaXplKCdhY2Nlc3NpYmxlLXZpZXcnLCBcIkFjY2Vzc2libGUgVmlld1wiKTtcblx0XHRcdHRoaXMuX3RpdGxlLnRleHRDb250ZW50ID0gYXJpYUxhYmVsO1xuXHRcdFx0aWYgKGFjdGlvbnNIaW50ICYmIHByb3ZpZGVyLm9wdGlvbnMudHlwZSA9PT0gQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXcpIHtcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2FjY2Vzc2libGUtdmlldy1oaW50JywgXCJBY2Nlc3NpYmxlIFZpZXcsIHswfVwiLCBhY3Rpb25zSGludCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbnNIaW50KSB7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LWhlbHAtaGludCcsIFwiQWNjZXNzaWJpbGl0eSBIZWxwLCB7MH1cIiwgYWN0aW9uc0hpbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzV2luZG93cyAmJiB3aWRnZXRJc0ZvY3VzZWQpIHtcblx0XHRcdFx0Ly8gcHJldmVudCB0aGUgc2NyZWVuIHJlYWRlciBvbiB3aW5kb3dzIGZyb20gcmVhZGluZ1xuXHRcdFx0XHQvLyB0aGUgYXJpYSBsYWJlbCBhZ2FpbiB3aGVuIGl0J3MgcmVmb2N1c2VkXG5cdFx0XHRcdGFyaWFMYWJlbCA9ICcnO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWwgfSk7XG5cdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQuZm9jdXMoKTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50UHJvdmlkZXI/Lm9wdGlvbnMucG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0UG9zaXRpb24oKTtcblx0XHRcdFx0Y29uc3QgaXNEZWZhdWx0UG9zaXRpb24gPSBwb3NpdGlvbj8ubGluZU51bWJlciA9PT0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gPT09IDE7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuZWRpdG9yV2lkZ2V0LmdldE1vZGVsKCk/LmdldExpbmVDb3VudCgpO1xuXHRcdFx0XHRjb25zdCBzYXZlZFBvc2l0aW9uID0gdGhpcy5fbGFzdFByb3ZpZGVyUG9zaXRpb24uZ2V0KHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0Y29uc3QgcHJlc2VydmVkUG9zaXRpb24gPSB0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy5wb3NpdGlvbiA9PT0gJ2luaXRpYWwtYm90dG9tLXByZXNlcnZlJ1xuXHRcdFx0XHRcdD8gcHJldmlvdXNQb3NpdGlvbiA/PyBzYXZlZFBvc2l0aW9uXG5cdFx0XHRcdFx0OiB0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy5wb3NpdGlvbiA9PT0gJ2luaXRpYWwtYm90dG9tJyAmJiAhaXNTYW1lUHJvdmlkZXIgPyBzYXZlZFBvc2l0aW9uIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocHJlc2VydmVkUG9zaXRpb24gJiYgcHJlc2VydmVkUG9zaXRpb24ubGluZU51bWJlciA8PSAobGluZUNvdW50ID8/IDApKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnNldFBvc2l0aW9uKHByZXNlcnZlZFBvc2l0aW9uKTtcblx0XHRcdFx0XHQvLyBXaGVuIGFsd2F5cyBwcmVzZXJ2aW5nIHRoZSBjdXJzb3IgcG9zaXRpb24sIGtlZXAgdGhlIGN1cnJlbnQgc2Nyb2xsXG5cdFx0XHRcdFx0Ly8gcG9zaXRpb24gb24gY29udGVudCB1cGRhdGVzIGluc3RlYWQgb2YgcmV2ZWFsaW5nIHRoZSBjdXJzb3IsIHdoaWNoXG5cdFx0XHRcdFx0Ly8gd291bGQgY2F1c2UgdGhlIHZpZXcgdG8ganVtcCB3aGlsZSB0aGUgdXNlciBpcyBzY3JvbGxpbmcuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnBvc2l0aW9uID09PSAnaW5pdGlhbC1ib3R0b20tcHJlc2VydmUnICYmIHByZXZpb3VzU2Nyb2xsVG9wICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRTY3JvbGxUb3AocHJldmlvdXNTY3JvbGxUb3ApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQucmV2ZWFsTGluZShwcmVzZXJ2ZWRQb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyLm9wdGlvbnMucG9zaXRpb24gPT09ICdib3R0b20nIHx8IHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnBvc2l0aW9uID09PSAnaW5pdGlhbC1ib3R0b20tcHJlc2VydmUnIHx8IHRoaXMuX2N1cnJlbnRQcm92aWRlci5vcHRpb25zLnBvc2l0aW9uID09PSAnaW5pdGlhbC1ib3R0b20nICYmIGlzRGVmYXVsdFBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdExpbmUgPSBsaW5lQ291bnQ7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBsYXN0TGluZSAhPT0gdW5kZWZpbmVkICYmIGxhc3RMaW5lID4gMCA/IG5ldyBQb3NpdGlvbihsYXN0TGluZSwgMSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JXaWRnZXQuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnJldmVhbExpbmUocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHByZXZpb3VzUG9zaXRpb24pIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0LnNldFBvc2l0aW9uKHByZXZpb3VzUG9zaXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gUmVzdG9yZSB0aGUgc2F2ZWQgcG9zaXRpb24gZm9yIHRoaXMgcHJvdmlkZXIgaWYgYXZhaWxhYmxlIChlLmcuLCBhZnRlciBjbG9zZSBhbmQgcmVvcGVuKVxuXHRcdFx0XHRjb25zdCBzYXZlZFBvc2l0aW9uID0gdGhpcy5fbGFzdFByb3ZpZGVyUG9zaXRpb24uZ2V0KHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0aWYgKHNhdmVkUG9zaXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCkgPz8gMDtcblx0XHRcdFx0XHQvLyBPbmx5IHJlc3RvcmUgaWYgdGhlIHNhdmVkIHBvc2l0aW9uIGlzIHN0aWxsIHZhbGlkIHdpdGhpbiB0aGUgY3VycmVudCBjb250ZW50XG5cdFx0XHRcdFx0aWYgKHNhdmVkUG9zaXRpb24ubGluZU51bWJlciA8PSBsaW5lQ291bnQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5zZXRQb3NpdGlvbihzYXZlZFBvc2l0aW9uKTtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldC5yZXZlYWxQb3NpdGlvbihzYXZlZFBvc2l0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl91cGRhdGVUb29sYmFyKHRoaXMuX2N1cnJlbnRQcm92aWRlci5hY3Rpb25zLCBwcm92aWRlci5vcHRpb25zLnR5cGUpO1xuXG5cdFx0Y29uc3QgaGlkZSA9IChlPzogS2V5Ym9hcmRFdmVudCB8IElLZXlib2FyZEV2ZW50KTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCB0aGlzV2luZG93SXNGb2N1c2VkID0gZ2V0V2luZG93KHRoaXMuX2VkaXRvcldpZGdldC5nZXREb21Ob2RlKCkpLmRvY3VtZW50Lmhhc0ZvY3VzKCk7XG5cdFx0XHRpZiAoIXRoaXNXaW5kb3dJc0ZvY3VzZWQpIHtcblx0XHRcdFx0Ly8gV2hlbiBzd2l0Y2hpbmcgd2luZG93cywga2VlcCBhY2Nlc3NpYmxlIHZpZXcgb3BlblxuXHRcdFx0XHRlPy5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlPy5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pc0luUXVpY2tQaWNrKSB7XG5cdFx0XHRcdHByb3ZpZGVyLm9uQ2xvc2UoKTtcblx0XHRcdH1cblx0XHRcdGU/LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldygpO1xuXHRcdFx0aWYgKHRoaXMuX2lzSW5RdWlja1BpY2spIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlQ29udGV4dEtleXMocHJvdmlkZXIsIGZhbHNlKTtcblx0XHRcdC8vIFNhdmUgdGhlIGN1cnNvciBwb3NpdGlvbiBmb3IgdGhpcyBwcm92aWRlciBzbyBpdCBjYW4gYmUgcmVzdG9yZWQgb24gcmVvcGVuXG5cdFx0XHRjb25zdCBjdXJyZW50UG9zaXRpb24gPSB0aGlzLl9lZGl0b3JXaWRnZXQuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmIChjdXJyZW50UG9zaXRpb24pIHtcblx0XHRcdFx0dGhpcy5fbGFzdFByb3ZpZGVyUG9zaXRpb24uc2V0KHByb3ZpZGVyLmlkLCBjdXJyZW50UG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdFByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudENvbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50UHJvdmlkZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRQcm92aWRlciA9IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2VkaXRvcldpZGdldC5vbktleURvd24oKGUpID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpIHtcblx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2VkaXRvci5hY3Rpb24ub3BlbkxpbmsnKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSB8fCBzaG91bGRIaWRlKGUuYnJvd3NlckV2ZW50LCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRcdGhpZGUoZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5LZXlIICYmIHByb3ZpZGVyLm9wdGlvbnMucmVhZE1vcmVVcmwpIHtcblx0XHRcdFx0Y29uc3QgdXJsOiBzdHJpbmcgPSBwcm92aWRlci5vcHRpb25zLnJlYWRNb3JlVXJsO1xuXHRcdFx0XHRhbGVydChBY2Nlc3NpYmlsaXR5SGVscE5MUy5vcGVuaW5nRG9jcyk7XG5cdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodXJsKSk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm92aWRlciBpbnN0YW5jZW9mIEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIpIHtcblx0XHRcdFx0cHJvdmlkZXIub25LZXlEb3duPy4oZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3Rvb2xiYXIuZ2V0RWxlbWVudCgpLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0aGlkZShlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9lZGl0b3JXaWRnZXQub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdGlmICghaXNBY3RpdmVFbGVtZW50KHRoaXMuX3Rvb2xiYXIuZ2V0RWxlbWVudCgpKSkge1xuXHRcdFx0XHRoaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fZWRpdG9yV2lkZ2V0Lm9uRGlkQ29udGVudFNpemVDaGFuZ2UoKCkgPT4gdGhpcy5fbGF5b3V0KCkpKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRMYXlvdXRBY3RpdmVDb250YWluZXIoKCkgPT4gdGhpcy5fbGF5b3V0KCkpKTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZVN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVG9vbGJhcihwcm92aWRlZEFjdGlvbnM/OiBJQWN0aW9uW10sIHR5cGU/OiBBY2Nlc3NpYmxlVmlld1R5cGUpOiB2b2lkIHtcblx0XHR0aGlzLl90b29sYmFyLnNldEFyaWFMYWJlbCh0eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCA/IGxvY2FsaXplKCdhY2Nlc3NpYmxlSGVscFRvb2xiYXInLCAnQWNjZXNzaWJpbGl0eSBIZWxwJykgOiBsb2NhbGl6ZSgnYWNjZXNzaWJsZVZpZXdUb29sYmFyJywgXCJBY2Nlc3NpYmxlIFZpZXdcIikpO1xuXHRcdGNvbnN0IHRvb2xiYXJNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuQWNjZXNzaWJsZVZpZXcsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyh0b29sYmFyTWVudS5nZXRBY3Rpb25zKHt9KSk7XG5cdFx0aWYgKHByb3ZpZGVkQWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlZEFjdGlvbiBvZiBwcm92aWRlZEFjdGlvbnMpIHtcblx0XHRcdFx0cHJvdmlkZWRBY3Rpb24uY2xhc3MgPSBwcm92aWRlZEFjdGlvbi5jbGFzcyB8fCBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5wcmltaXRpdmVTcXVhcmUpO1xuXHRcdFx0XHRwcm92aWRlZEFjdGlvbi5jaGVja2VkID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdG9vbGJhci5zZXRBY3Rpb25zKFsuLi5wcm92aWRlZEFjdGlvbnMsIC4uLm1lbnVBY3Rpb25zXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Rvb2xiYXIuc2V0QWN0aW9ucyhtZW51QWN0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpbWVuc2lvbiA9IHRoaXMuX2xheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyRGltZW5zaW9uO1xuXHRcdGNvbnN0IG1heEhlaWdodCA9IGRpbWVuc2lvbi5oZWlnaHQgJiYgZGltZW5zaW9uLmhlaWdodCAqIERJTUVOU0lPTlMuTUFYX0hFSUdIVF9SQVRJTztcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbihtYXhIZWlnaHQsIHRoaXMuX2VkaXRvcldpZGdldC5nZXRDb250ZW50SGVpZ2h0KCkpO1xuXHRcdGNvbnN0IHdpZHRoID0gTWF0aC5taW4oZGltZW5zaW9uLndpZHRoICogRElNRU5TSU9OUy5XSURUSF9SQVRJTywgRElNRU5TSU9OUy5NQVhfV0lEVEgpO1xuXHRcdHRoaXMuX2VkaXRvcldpZGdldC5sYXlvdXQoeyB3aWR0aCwgaGVpZ2h0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VGV4dE1vZGVsKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZyAmJiAhZXhpc3RpbmcuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdC8vIENyZWF0ZSBhbiBlbXB0eSBtb2RlbCAtIGNvbnRlbnQgd2lsbCBiZSBzZXQgdmlhIHNldFZhbHVlKCkgdG8gcHJlc2VydmUgY3Vyc29yIHBvc2l0aW9uXG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgcmVzb3VyY2UsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dvVG9TeW1ib2xzU3VwcG9ydGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fY3VycmVudFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy50eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCB8fCB0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy5sYW5ndWFnZSA9PT0gJ21hcmtkb3duJyB8fCB0aGlzLl9jdXJyZW50UHJvdmlkZXIub3B0aW9ucy5sYW5ndWFnZSA9PT0gdW5kZWZpbmVkIHx8ICh0aGlzLl9jdXJyZW50UHJvdmlkZXIgaW5zdGFuY2VvZiBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyICYmICEhdGhpcy5fY3VycmVudFByb3ZpZGVyLmdldFN5bWJvbHM/LigpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxhc3RQcm92aWRlcigpOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2N1cnJlbnRQcm92aWRlcjtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RQcm92aWRlciA9IHByb3ZpZGVyIGluc3RhbmNlb2YgQWNjZXNzaWJsZUNvbnRlbnRQcm92aWRlciA/IG5ldyBBY2Nlc3NpYmxlQ29udGVudFByb3ZpZGVyKFxuXHRcdFx0cHJvdmlkZXIuaWQsXG5cdFx0XHRwcm92aWRlci5vcHRpb25zLFxuXHRcdFx0cHJvdmlkZXIucHJvdmlkZUNvbnRlbnQuYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5vbkNsb3NlLmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIudmVyYm9zaXR5U2V0dGluZ0tleSxcblx0XHRcdHByb3ZpZGVyLm9uT3Blbj8uYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5hY3Rpb25zLFxuXHRcdFx0cHJvdmlkZXIucHJvdmlkZU5leHRDb250ZW50Py5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLnByb3ZpZGVQcmV2aW91c0NvbnRlbnQ/LmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIub25EaWRDaGFuZ2VDb250ZW50Py5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLm9uS2V5RG93bj8uYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5nZXRTeW1ib2xzPy5iaW5kKHByb3ZpZGVyKSxcblx0XHQpIDogbmV3IEV4dGVuc2lvbkNvbnRlbnRQcm92aWRlcihcblx0XHRcdHByb3ZpZGVyLmlkLFxuXHRcdFx0cHJvdmlkZXIub3B0aW9ucyxcblx0XHRcdHByb3ZpZGVyLnByb3ZpZGVDb250ZW50LmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIub25DbG9zZS5iaW5kKHByb3ZpZGVyKSxcblx0XHRcdHByb3ZpZGVyLm9uT3Blbj8uYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5wcm92aWRlTmV4dENvbnRlbnQ/LmJpbmQocHJvdmlkZXIpLFxuXHRcdFx0cHJvdmlkZXIucHJvdmlkZVByZXZpb3VzQ29udGVudD8uYmluZChwcm92aWRlciksXG5cdFx0XHRwcm92aWRlci5hY3Rpb25zLFxuXHRcdFx0cHJvdmlkZXIub25EaWRDaGFuZ2VDb250ZW50Py5iaW5kKHByb3ZpZGVyKSxcblx0XHQpO1xuXHRcdHJldHVybiBsYXN0UHJvdmlkZXI7XG5cdH1cblxuXHRwdWJsaWMgc2hvd0FjY2Vzc2libGVWaWV3SGVscCgpOiB2b2lkIHtcblx0XHRjb25zdCBsYXN0UHJvdmlkZXIgPSB0aGlzLl91cGRhdGVMYXN0UHJvdmlkZXIoKTtcblx0XHRpZiAoIWxhc3RQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgYWNjZXNzaWJsZVZpZXdIZWxwUHJvdmlkZXI7XG5cdFx0aWYgKGxhc3RQcm92aWRlciBpbnN0YW5jZW9mIEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIpIHtcblx0XHRcdGFjY2Vzc2libGVWaWV3SGVscFByb3ZpZGVyID0gbmV3IEFjY2Vzc2libGVDb250ZW50UHJvdmlkZXIoXG5cdFx0XHRcdGxhc3RQcm92aWRlci5pZCxcblx0XHRcdFx0eyB0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCB9LFxuXHRcdFx0XHQoKSA9PiBsYXN0UHJvdmlkZXIub3B0aW9ucy5jdXN0b21IZWxwID8gbGFzdFByb3ZpZGVyPy5vcHRpb25zLmN1c3RvbUhlbHAoKSA6IHRoaXMuX2FjY2Vzc2libGVWaWV3SGVscERpYWxvZ0NvbnRlbnQodGhpcy5fZ29Ub1N5bWJvbHNTdXBwb3J0ZWQoKSksXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0XHRcdFx0Ly8gSEFDSzogRGVsYXkgdG8gYWxsb3cgdGhlIGNvbnRleHQgdmlldyB0byBoaWRlICMyMDc2Mzhcblx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB0aGlzLnNob3cobGFzdFByb3ZpZGVyKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhc3RQcm92aWRlci52ZXJib3NpdHlTZXR0aW5nS2V5XG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY2Nlc3NpYmxlVmlld0hlbHBQcm92aWRlciA9IG5ldyBFeHRlbnNpb25Db250ZW50UHJvdmlkZXIoXG5cdFx0XHRcdGxhc3RQcm92aWRlci5pZCxcblx0XHRcdFx0eyB0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCB9LFxuXHRcdFx0XHQoKSA9PiBsYXN0UHJvdmlkZXIub3B0aW9ucy5jdXN0b21IZWxwID8gbGFzdFByb3ZpZGVyPy5vcHRpb25zLmN1c3RvbUhlbHAoKSA6IHRoaXMuX2FjY2Vzc2libGVWaWV3SGVscERpYWxvZ0NvbnRlbnQodGhpcy5fZ29Ub1N5bWJvbHNTdXBwb3J0ZWQoKSksXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0XHRcdFx0Ly8gSEFDSzogRGVsYXkgdG8gYWxsb3cgdGhlIGNvbnRleHQgdmlldyB0byBoaWRlICMyMDc2Mzhcblx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB0aGlzLnNob3cobGFzdFByb3ZpZGVyKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KCk7XG5cdFx0Ly8gSEFDSzogRGVsYXkgdG8gYWxsb3cgdGhlIGNvbnRleHQgdmlldyB0byBoaWRlICMxODY1MTRcblx0XHRpZiAoYWNjZXNzaWJsZVZpZXdIZWxwUHJvdmlkZXIpIHtcblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMuc2hvdyhhY2Nlc3NpYmxlVmlld0hlbHBQcm92aWRlciwgdW5kZWZpbmVkLCB0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXNzaWJsZVZpZXdIZWxwRGlhbG9nQ29udGVudChwcm92aWRlckhhc1N5bWJvbHM/OiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRjb25zdCBuYXZpZ2F0aW9uSGludCA9IHRoaXMuX25hdmlnYXRpb25IaW50KCk7XG5cdFx0Y29uc3QgZ29Ub1N5bWJvbEhpbnQgPSB0aGlzLl9nb1RvU3ltYm9sSGludChwcm92aWRlckhhc1N5bWJvbHMpO1xuXHRcdGNvbnN0IHRvb2xiYXJIaW50ID0gbG9jYWxpemUoJ3Rvb2xiYXInLCBcIk5hdmlnYXRlIHRvIHRoZSB0b29sYmFyIChTaGlmdCtUYWIpLlwiKTtcblx0XHRjb25zdCBjaGF0SGludHMgPSB0aGlzLl9nZXRDaGF0SGludHMoKTtcblxuXHRcdGxldCBoaW50ID0gbG9jYWxpemUoJ2ludHJvJywgXCJJbiB0aGUgYWNjZXNzaWJsZSB2aWV3LCB5b3UgY2FuOlxcblwiKTtcblx0XHRpZiAobmF2aWdhdGlvbkhpbnQpIHtcblx0XHRcdGhpbnQgKz0gJyAtICcgKyBuYXZpZ2F0aW9uSGludCArICdcXG4nO1xuXHRcdH1cblx0XHRpZiAoZ29Ub1N5bWJvbEhpbnQpIHtcblx0XHRcdGhpbnQgKz0gJyAtICcgKyBnb1RvU3ltYm9sSGludCArICdcXG4nO1xuXHRcdH1cblx0XHRpZiAodG9vbGJhckhpbnQpIHtcblx0XHRcdGhpbnQgKz0gJyAtICcgKyB0b29sYmFySGludCArICdcXG4nO1xuXHRcdH1cblx0XHRpZiAoY2hhdEhpbnRzKSB7XG5cdFx0XHRoaW50ICs9IGNoYXRIaW50cztcblx0XHR9XG5cdFx0cmV0dXJuIGhpbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGF0SGludHMoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFByb3ZpZGVyPy5pZCAhPT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlBhbmVsQ2hhdCAmJiB0aGlzLl9jdXJyZW50UHJvdmlkZXI/LmlkICE9PSBBY2Nlc3NpYmxlVmlld1Byb3ZpZGVySWQuUXVpY2tDaGF0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiBbbG9jYWxpemUoJ2luc2VydEF0Q3Vyc29yJywgXCIgLSBJbnNlcnQgdGhlIGNvZGUgYmxvY2sgYXQgdGhlIGN1cnNvcnswfS5cIiwgJzxrZXliaW5kaW5nOndvcmtiZW5jaC5hY3Rpb24uY2hhdC5pbnNlcnRDb2RlQmxvY2s+JyksXG5cdFx0bG9jYWxpemUoJ2luc2VydEludG9OZXdGaWxlJywgXCIgLSBJbnNlcnQgdGhlIGNvZGUgYmxvY2sgaW50byBhIG5ldyBmaWxlezB9LlwiLCAnPGtleWJpbmRpbmc6d29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydEludG9OZXdGaWxlPicpLFxuXHRcdGxvY2FsaXplKCdydW5JblRlcm1pbmFsJywgXCIgLSBSdW4gdGhlIGNvZGUgYmxvY2sgaW4gdGhlIHRlcm1pbmFsezB9LlxcblwiLCAnPGtleWJpbmRpbmc6d29ya2JlbmNoLmFjdGlvbi5jaGF0LnJ1bkluVGVybWluYWw+JyldLmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmF2aWdhdGlvbkhpbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2FjY2Vzc2libGVWaWV3TmV4dFByZXZpb3VzSGludCcsIFwiU2hvdyB0aGUgbmV4dCBpdGVtezB9IG9yIHByZXZpb3VzIGl0ZW17MX0uXCIsIGA8a2V5YmluZGluZzoke0FjY2Vzc2liaWxpdHlDb21tYW5kSWQuU2hvd05leHR9PmAsIGA8a2V5YmluZGluZzoke0FjY2Vzc2liaWxpdHlDb21tYW5kSWQuU2hvd1ByZXZpb3VzfT5gKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc2FibGVWZXJib3NpdHlIaW50KHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyKTogc3RyaW5nIHtcblx0XHRpZiAocHJvdmlkZXIub3B0aW9ucy50eXBlID09PSBBY2Nlc3NpYmxlVmlld1R5cGUuSGVscCAmJiB0aGlzLl92ZXJib3NpdHlFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWNlc3NpYmxlVmlld0Rpc2FibGVIaW50JywgXCJcXG5EaXNhYmxlIGFjY2Vzc2liaWxpdHkgdmVyYm9zaXR5IGZvciB0aGlzIGZlYXR1cmV7MH0uXCIsIGA8a2V5YmluZGluZzoke0FjY2Vzc2liaWxpdHlDb21tYW5kSWQuRGlzYWJsZVZlcmJvc2l0eUhpbnR9PmApO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwcml2YXRlIF9nb1RvU3ltYm9sSGludChwcm92aWRlckhhc1N5bWJvbHM/OiBib29sZWFuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXByb3ZpZGVySGFzU3ltYm9scykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2dvVG9TeW1ib2xIaW50JywgJ0dvIHRvIGEgc3ltYm9sezB9LicsIGA8a2V5YmluZGluZzoke0FjY2Vzc2liaWxpdHlDb21tYW5kSWQuR29Ub1N5bWJvbH0+YCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVVbmFzc2lnbmVkS2JIaW50KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29uZmlndXJlS2IgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuQWNjZXNzaWJpbGl0eUhlbHBDb25maWd1cmVLZXliaW5kaW5ncyk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdUb0NvbmZpZ3VyZVF1aWNrUGljayA9IGNvbmZpZ3VyZUtiID8gJygnICsgY29uZmlndXJlS2IgKyAnKScgOiAnYnkgYXNzaWduaW5nIGEga2V5YmluZGluZyB0byB0aGUgY29tbWFuZCBBY2Nlc3NpYmlsaXR5IEhlbHAgQ29uZmlndXJlIFVuYXNzaWduZWQgS2V5YmluZGluZ3MuJztcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbmZpZ3VyZUtiJywgJ1xcbkNvbmZpZ3VyZSBrZXliaW5kaW5ncyBmb3IgY29tbWFuZHMgdGhhdCBsYWNrIHRoZW0gezB9LicsIGtleWJpbmRpbmdUb0NvbmZpZ3VyZVF1aWNrUGljayk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVBc3NpZ25lZEtiSGludCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZUtiID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLkFjY2Vzc2liaWxpdHlIZWxwQ29uZmlndXJlQXNzaWduZWRLZXliaW5kaW5ncyk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdUb0NvbmZpZ3VyZVF1aWNrUGljayA9IGNvbmZpZ3VyZUtiID8gJygnICsgY29uZmlndXJlS2IgKyAnKScgOiAnYnkgYXNzaWduaW5nIGEga2V5YmluZGluZyB0byB0aGUgY29tbWFuZCBBY2Nlc3NpYmlsaXR5IEhlbHAgQ29uZmlndXJlIEFzc2lnbmVkIEtleWJpbmRpbmdzLic7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjb25maWd1cmVLYkFzc2lnbmVkJywgJ1xcbkNvbmZpZ3VyZSBrZXliaW5kaW5ncyBmb3IgY29tbWFuZHMgdGhhdCBhbHJlYWR5IGhhdmUgYXNzaWdubWVudHMgezB9LicsIGtleWJpbmRpbmdUb0NvbmZpZ3VyZVF1aWNrUGljayk7XG5cdH1cblxuXHRwcml2YXRlIF9zY3JlZW5SZWFkZXJNb2RlSGludChwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHRcdGxldCBzY3JlZW5SZWFkZXJNb2RlSGludCA9ICcnO1xuXHRcdGNvbnN0IHR1cm5Pbk1lc3NhZ2UgPSAoXG5cdFx0XHRpc01hY2ludG9zaFxuXHRcdFx0XHQ/IEFjY2Vzc2liaWxpdHlIZWxwTkxTLmNoYW5nZUNvbmZpZ1RvT25NYWNcblx0XHRcdFx0OiBBY2Nlc3NpYmlsaXR5SGVscE5MUy5jaGFuZ2VDb25maWdUb09uV2luTGludXhcblx0XHQpO1xuXHRcdGlmIChhY2Nlc3NpYmlsaXR5U3VwcG9ydCAmJiBwcm92aWRlci5pZCA9PT0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLkVkaXRvcikge1xuXHRcdFx0c2NyZWVuUmVhZGVyTW9kZUhpbnQgPSBBY2Nlc3NpYmlsaXR5SGVscE5MUy5hdXRvX29uO1xuXHRcdFx0c2NyZWVuUmVhZGVyTW9kZUhpbnQgKz0gJ1xcbic7XG5cdFx0fSBlbHNlIGlmICghYWNjZXNzaWJpbGl0eVN1cHBvcnQpIHtcblx0XHRcdHNjcmVlblJlYWRlck1vZGVIaW50ID0gQWNjZXNzaWJpbGl0eUhlbHBOTFMuYXV0b19vZmYgKyAnXFxuJyArIHR1cm5Pbk1lc3NhZ2U7XG5cdFx0XHRzY3JlZW5SZWFkZXJNb2RlSGludCArPSAnXFxuJztcblx0XHR9XG5cdFx0cmV0dXJuIHNjcmVlblJlYWRlck1vZGVIaW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhpdERpYWxvZ0hpbnQocHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl92ZXJib3NpdHlFbmFibGVkKCkgJiYgIXByb3ZpZGVyLm9wdGlvbnMucG9zaXRpb24gPyBsb2NhbGl6ZSgnZXhpdCcsICdcXG5FeGl0IHRoaXMgZGlhbG9nIChFc2NhcGUpLicpIDogJyc7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkTW9yZUhpbnQocHJvdmlkZXI6IEFjY2VzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiBwcm92aWRlci5vcHRpb25zLnJlYWRNb3JlVXJsID8gbG9jYWxpemUoXCJvcGVuRG9jXCIsIFwiXFxuT3BlbiBhIGJyb3dzZXIgd2luZG93IHdpdGggbW9yZSBpbmZvcm1hdGlvbiByZWxhdGVkIHRvIGFjY2Vzc2liaWxpdHl7MH0uXCIsIGA8a2V5YmluZGluZzoke0FjY2Vzc2liaWxpdHlDb21tYW5kSWQuQWNjZXNzaWJpbGl0eUhlbHBPcGVuSGVscExpbmt9PmApIDogJyc7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjY2Vzc2libGVWaWV3U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjY2Vzc2libGVWaWV3OiBBY2Nlc3NpYmxlVmlldyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0c2hvdyhwcm92aWRlcjogQWNjZXNpYmxlVmlld0NvbnRlbnRQcm92aWRlciwgcG9zaXRpb24/OiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWNjZXNzaWJsZVZpZXcpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWNjZXNzaWJsZVZpZXcpKTtcblx0XHR9XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXcuc2hvdyhwcm92aWRlciwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHBvc2l0aW9uKTtcblx0fVxuXHRjb25maWd1cmVLZXliaW5kaW5ncyh1bmFzc2lnbmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXc/LmNvbmZpZ3VyZUtleWJpbmRpbmdzKHVuYXNzaWduZWQpO1xuXHR9XG5cdG9wZW5IZWxwTGluaygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8ub3BlbkhlbHBMaW5rKCk7XG5cdH1cblx0c2hvd0xhc3RQcm92aWRlcihpZDogQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXc/LnNob3dMYXN0UHJvdmlkZXIoaWQpO1xuXHR9XG5cdG5leHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXc/Lm5leHQoKTtcblx0fVxuXHRwcmV2aW91cygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8ucHJldmlvdXMoKTtcblx0fVxuXHRnb1RvU3ltYm9sKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5nb1RvU3ltYm9sKCk7XG5cdH1cblx0Z2V0T3BlbkFyaWFIaW50KHZlcmJvc2l0eVNldHRpbmdLZXk6IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHZlcmJvc2l0eVNldHRpbmdLZXkpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJsZVZpZXcpPy5nZXRBcmlhTGFiZWwoKTtcblx0XHRsZXQgaGludCA9IG51bGw7XG5cdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdGhpbnQgPSBsb2NhbGl6ZSgnYWNlc3NpYmxlVmlld0hpbnQnLCBcIkluc3BlY3QgdGhpcyBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3IHdpdGggezB9XCIsIGtleWJpbmRpbmcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoaW50ID0gbG9jYWxpemUoJ2FjZXNzaWJsZVZpZXdIaW50Tm9LYkVpdGhlcicsIFwiSW5zcGVjdCB0aGlzIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcgdmlhIHRoZSBjb21tYW5kIE9wZW4gQWNjZXNzaWJsZSBWaWV3IHdoaWNoIGlzIGN1cnJlbnRseSBub3QgdHJpZ2dlcmFibGUgdmlhIGtleWJpbmRpbmcuXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gaGludDtcblx0fVxuXHRkaXNhYmxlSGludCgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8uZGlzYWJsZUhpbnQoKTtcblx0fVxuXHRzaG93QWNjZXNzaWJsZVZpZXdIZWxwKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjY2Vzc2libGVWaWV3Py5zaG93QWNjZXNzaWJsZVZpZXdIZWxwKCk7XG5cdH1cblx0Z2V0UG9zaXRpb24oaWQ6IEFjY2Vzc2libGVWaWV3UHJvdmlkZXJJZCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWNjZXNzaWJsZVZpZXc/LmdldFBvc2l0aW9uKGlkKSA/PyB1bmRlZmluZWQ7XG5cdH1cblx0Z2V0TGFzdFBvc2l0aW9uKCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXN0TGluZSA9IHRoaXMuX2FjY2Vzc2libGVWaWV3Py5lZGl0b3JXaWRnZXQuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCk7XG5cdFx0cmV0dXJuIGxhc3RMaW5lICE9PSB1bmRlZmluZWQgJiYgbGFzdExpbmUgPiAwID8gbmV3IFBvc2l0aW9uKGxhc3RMaW5lLCAxKSA6IHVuZGVmaW5lZDtcblx0fVxuXHRzZXRQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIHJldmVhbD86IGJvb2xlYW4sIHNlbGVjdD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8uc2V0UG9zaXRpb24ocG9zaXRpb24sIHJldmVhbCwgc2VsZWN0KTtcblx0fVxuXHRnZXRDb2RlQmxvY2tDb250ZXh0KCk6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWNjZXNzaWJsZVZpZXc/LmdldENvZGVCbG9ja0NvbnRleHQoKTtcblx0fVxuXHRuYXZpZ2F0ZVRvQ29kZUJsb2NrKHR5cGU6ICduZXh0JyB8ICdwcmV2aW91cycpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlldz8ubmF2aWdhdGVUb0NvZGVCbG9jayh0eXBlKTtcblx0fVxufVxuXG5jbGFzcyBBY2Nlc3NpYmxlVmlld1N5bWJvbFF1aWNrUGljayB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX2FjY2Vzc2libGVWaWV3OiBBY2Nlc3NpYmxlVmlldywgQElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlKSB7XG5cblx0fVxuXHRzaG93KHByb3ZpZGVyOiBBY2Nlc2libGVWaWV3Q29udGVudFByb3ZpZGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJQWNjZXNzaWJsZVZpZXdTeW1ib2w+KCkpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdhY2Nlc3NpYmxlVmlld1N5bWJvbFF1aWNrUGlja1BsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaCBzeW1ib2xzXCIpO1xuXHRcdHF1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdhY2Nlc3NpYmxlVmlld1N5bWJvbFF1aWNrUGlja1RpdGxlJywgXCJHbyB0byBTeW1ib2wgQWNjZXNzaWJsZSBWaWV3XCIpO1xuXHRcdGNvbnN0IHBpY2tzID0gW107XG5cdFx0Y29uc3Qgc3ltYm9scyA9IHRoaXMuX2FjY2Vzc2libGVWaWV3LmdldFN5bWJvbHMoKTtcblx0XHRpZiAoIXN5bWJvbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9scykge1xuXHRcdFx0cGlja3MucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBzeW1ib2wubGFiZWwsXG5cdFx0XHRcdGFyaWFMYWJlbDogc3ltYm9sLmFyaWFMYWJlbCxcblx0XHRcdFx0Zmlyc3RMaXN0SXRlbTogc3ltYm9sLmZpcnN0TGlzdEl0ZW0sXG5cdFx0XHRcdGxpbmVOdW1iZXI6IHN5bWJvbC5saW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzeW1ib2wuZW5kTGluZU51bWJlcixcblx0XHRcdFx0bWFya2Rvd25Ub1BhcnNlOiBzeW1ib2wubWFya2Rvd25Ub1BhcnNlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBwaWNrcztcblx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXcuc2hvd1N5bWJvbChwcm92aWRlciwgcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0pO1xuXHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0aWYgKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHQvLyB0aGlzIHdhcyBlc2NhcGVkLCBzbyByZWZvY3VzIHRoZSBhY2Nlc3NpYmxlIHZpZXdcblx0XHRcdFx0dGhpcy5fYWNjZXNzaWJsZVZpZXcuc2hvdyhwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG59XG5cblxuZnVuY3Rpb24gc2hvdWxkSGlkZShldmVudDogS2V5Ym9hcmRFdmVudCwga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IGJvb2xlYW4ge1xuXHRpZiAoIWNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuQWNjZXNzaWJsZVZpZXdDbG9zZU9uS2V5UHJlc3MpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRjb25zdCByZXNvbHZlUmVzdWx0ID0ga2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoKHN0YW5kYXJkS2V5Ym9hcmRFdmVudCwgc3RhbmRhcmRLZXlib2FyZEV2ZW50LnRhcmdldCk7XG5cblx0Y29uc3QgaXNWYWxpZENob3JkID0gcmVzb2x2ZVJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLk1vcmVDaG9yZHNOZWVkZWQ7XG5cdGlmIChrZXliaW5kaW5nU2VydmljZS5pbkNob3JkTW9kZSB8fCBpc1ZhbGlkQ2hvcmQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIHNob3VsZEhhbmRsZUtleShldmVudCkgJiYgIWV2ZW50LmN0cmxLZXkgJiYgIWV2ZW50LmFsdEtleSAmJiAhZXZlbnQubWV0YUtleSAmJiAhZXZlbnQuc2hpZnRLZXk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZEhhbmRsZUtleShldmVudDogS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFldmVudC5jb2RlLm1hdGNoKC9eKEtleVtBLVpdfERpZ2l0WzAtOV18RXF1YWx8Q29tbWF8UGVyaW9kfFNsYXNofFF1b3RlfEJhY2txdW90ZXxCYWNrc2xhc2h8TWludXN8U2VtaWNvbG9ufFNwYWNlfEVudGVyKSQvKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXLHVCQUF1QixpQkFBaUIsV0FBVyx1QkFBdUI7QUFDOUYsU0FBeUIsNkJBQTZCO0FBQ3RELFNBQVMsMEJBQTBCO0FBQ25DLFNB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
