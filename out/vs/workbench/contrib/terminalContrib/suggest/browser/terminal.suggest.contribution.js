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
import * as dom from "../../../../../base/browser/dom.js";
import { Event } from "../../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { DisposableStore, MutableDisposable, toDisposable, Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { localize2 } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { TerminalLocation } from "../../../../../platform/terminal/common/terminal.js";
import { registerActiveInstanceAction, registerTerminalAction } from "../../../terminal/browser/terminalActions.js";
import { registerTerminalContribution } from "../../../terminal/browser/terminalExtensions.js";
import { TerminalContextKeys } from "../../../terminal/common/terminalContextKey.js";
import { TerminalSuggestCommandId } from "../common/terminal.suggest.js";
import { terminalSuggestConfigSection, TerminalSuggestSettingId, registerTerminalSuggestProvidersConfiguration } from "../common/terminalSuggestConfiguration.js";
import { ITerminalCompletionService, TerminalCompletionService } from "./terminalCompletionService.js";
import { ITerminalContributionService } from "../../../terminal/common/terminalExtensionPoints.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { SuggestAddon } from "./terminalSuggestAddon.js";
import { TerminalClipboardContribution } from "../../clipboard/browser/terminal.clipboard.contribution.js";
import { SimpleSuggestContext } from "../../../../services/suggest/browser/simpleSuggestWidget.js";
import { SuggestDetailsClassName } from "../../../../services/suggest/browser/simpleSuggestWidgetDetails.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import "./terminalSymbolIcons.js";
import { LspCompletionProviderAddon } from "./lspCompletionProviderAddon.js";
import { createTerminalLanguageVirtualUri, LspTerminalModelContentProvider } from "./lspTerminalModelContentProvider.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { getTerminalLspSupportedLanguageObj } from "./lspTerminalUtil.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { Codicon } from "../../../../../base/common/codicons.js";
registerSingleton(ITerminalCompletionService, TerminalCompletionService, InstantiationType.Delayed);
let TerminalSuggestContribution = class extends DisposableStore {
  constructor(_ctx, _contextKeyService, _configurationService, _instantiationService, _terminalCompletionService, _textModelService, _languageFeaturesService) {
    super();
    this._ctx = _ctx;
    this._contextKeyService = _contextKeyService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._terminalCompletionService = _terminalCompletionService;
    this._textModelService = _textModelService;
    this._languageFeaturesService = _languageFeaturesService;
    this._addon = new MutableDisposable();
    this._lspAddons = this.add(new DisposableMap());
    this._lspModelProvider = new MutableDisposable();
    this.add(toDisposable(() => {
      this._addon?.dispose();
      this._lspModelProvider?.value?.dispose();
      this._lspModelProvider?.dispose();
    }));
    this._terminalSuggestWidgetVisibleContextKey = TerminalContextKeys.suggestWidgetVisible.bindTo(this._contextKeyService);
    this.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSuggestSettingId.Enabled)) {
        const completionsEnabled = this._configurationService.getValue(terminalSuggestConfigSection).enabled;
        if (!completionsEnabled) {
          this._addon.clear();
          this._lspAddons.clearAndDisposeAll();
        }
        const xtermRaw = this._ctx.instance.xterm?.raw;
        if (!!xtermRaw && completionsEnabled) {
          this._loadAddons(xtermRaw);
        }
      }
    }));
    TerminalSuggestProvidersConfigurationManager.initialize(this._instantiationService);
    this.add(this._ctx.instance.onDidChangeTarget((target) => {
      this._updateContainerForTarget(target);
    }));
    this.add(this._ctx.instance.onDidFocus(() => {
      const xtermRaw = this._ctx.instance.xterm?.raw;
      if (xtermRaw) {
        this._prepareAddonLayout(xtermRaw);
      }
    }));
  }
  static get(instance) {
    return instance.getContribution(TerminalSuggestContribution.ID);
  }
  get addon() {
    return this._addon.value;
  }
  get lspAddons() {
    return Array.from(this._lspAddons.values());
  }
  xtermOpen(xterm) {
    const config = this._configurationService.getValue(terminalSuggestConfigSection);
    const enabled = config.enabled;
    if (!enabled) {
      return;
    }
    this._loadAddons(xterm.raw);
    this.add(Event.runAndSubscribe(this._ctx.instance.onDidChangeShellType, async () => {
      this._refreshAddons();
      this._lspModelProvider.value?.shellTypeChanged(this._ctx.instance.shellType);
    }));
  }
  async _loadLspCompletionAddon(xterm) {
    let lspTerminalObj = void 0;
    if (!this._ctx.instance.shellType || !(lspTerminalObj = getTerminalLspSupportedLanguageObj(this._ctx.instance.shellType))) {
      this._lspAddons.clearAndDisposeAll();
      return;
    }
    const virtualTerminalDocumentUri = createTerminalLanguageVirtualUri(this._ctx.instance.instanceId, lspTerminalObj.extension);
    this._lspModelProvider.value = this._instantiationService.createInstance(LspTerminalModelContentProvider, this._ctx.instance.capabilities, this._ctx.instance.instanceId, virtualTerminalDocumentUri, this._ctx.instance.shellType);
    this.add(this._lspModelProvider.value);
    const textVirtualModel = await this._textModelService.createModelReference(virtualTerminalDocumentUri);
    this.add(textVirtualModel);
    const virtualProviders = this._languageFeaturesService.completionProvider.all(textVirtualModel.object.textEditorModel);
    const filteredProviders = virtualProviders.filter((p) => p._debugDisplayName !== "wordbasedCompletions");
    for (const provider of filteredProviders) {
      const lspCompletionProviderAddon = this._instantiationService.createInstance(LspCompletionProviderAddon, provider, textVirtualModel, this._lspModelProvider.value);
      this._lspAddons.set(provider._debugDisplayName, lspCompletionProviderAddon);
      xterm.loadAddon(lspCompletionProviderAddon);
      this.add(this._terminalCompletionService.registerTerminalCompletionProvider(
        "lsp",
        lspCompletionProviderAddon.id,
        lspCompletionProviderAddon,
        ...lspCompletionProviderAddon.triggerCharacters ?? []
      ));
    }
  }
  _loadAddons(xterm) {
    if (this._addon.value) {
      return;
    }
    const addon = this._addon.value = this._instantiationService.createInstance(SuggestAddon, this._ctx.instance.sessionId, this._ctx.instance.shellType, this._ctx.instance.capabilities, this._terminalSuggestWidgetVisibleContextKey);
    xterm.loadAddon(addon);
    this._loadLspCompletionAddon(xterm);
    this._prepareAddonLayout(xterm);
    this.add(dom.addDisposableListener(this._ctx.instance.domElement, dom.EventType.FOCUS_OUT, (e) => {
      const focusedElement = e.relatedTarget;
      if (focusedElement?.classList.contains(SuggestDetailsClassName)) {
        return;
      }
      addon.hideSuggestWidget(true);
    }));
    this.add(addon.onAcceptedCompletion(async (text) => {
      this._ctx.instance.focus();
      this._ctx.instance.sendText(text, false);
    }));
    const clipboardContrib = TerminalClipboardContribution.get(this._ctx.instance);
    this.add(clipboardContrib.onWillPaste(() => addon.isPasting = true));
    this.add(clipboardContrib.onDidPaste(() => {
      setTimeout(() => addon.isPasting = false, 100);
    }));
    if (!isWindows) {
      let barrier;
      this.add(addon.onDidReceiveCompletions(() => {
        barrier?.open();
        barrier = void 0;
      }));
    }
  }
  _refreshAddons() {
    const addon = this._addon.value;
    if (!addon) {
      return;
    }
    addon.shellType = this._ctx.instance.shellType;
    if (!this._ctx.instance.xterm?.raw) {
      return;
    }
    this._loadLspCompletionAddon(this._ctx.instance.xterm.raw);
  }
  _updateContainerForTarget(target) {
    const addon = this._addon.value;
    if (!addon || !this._ctx.instance.xterm?.raw) {
      return;
    }
    this._prepareAddonLayout(this._ctx.instance.xterm.raw);
  }
  async _prepareAddonLayout(xterm) {
    const addon = this._addon.value;
    if (!addon || this.isDisposed) {
      return;
    }
    const xtermElement = xterm.element ?? await this._waitForXtermElement(xterm);
    if (!xtermElement || this.isDisposed || addon !== this._addon.value) {
      return;
    }
    const container = this._resolveAddonContainer(xtermElement);
    addon.setContainerWithOverflow(container);
    const screenElement = xtermElement?.querySelector(".xterm-screen");
    if (dom.isHTMLElement(screenElement)) {
      addon.setScreen(screenElement);
    }
  }
  async _waitForXtermElement(xterm) {
    if (xterm.element) {
      return xterm.element;
    }
    await Promise.race([
      Event.toPromise(Event.filter(this._ctx.instance.onDidChangeVisibility, (visible) => visible)),
      Event.toPromise(this._ctx.instance.onDisposed)
    ]);
    if (this.isDisposed || this._ctx.instance.isDisposed) {
      return void 0;
    }
    return xterm.element ?? void 0;
  }
  _resolveAddonContainer(xtermElement) {
    if (this._ctx.instance.target === TerminalLocation.Editor) {
      return xtermElement;
    }
    return dom.findParentWithClass(xtermElement, "panel") ?? xtermElement;
  }
};
TerminalSuggestContribution.ID = "terminal.suggest";
TerminalSuggestContribution = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITerminalCompletionService),
  __decorateParam(5, ITextModelService),
  __decorateParam(6, ILanguageFeaturesService)
], TerminalSuggestContribution);
registerTerminalContribution(TerminalSuggestContribution.ID, TerminalSuggestContribution);
registerTerminalAction({
  id: TerminalSuggestCommandId.ChangeSelectionModeNever,
  title: localize2("workbench.action.terminal.changeSelectionMode.never", "Selection Mode: None"),
  tooltip: localize2("workbench.action.terminal.changeSelectionMode.never.tooltip", "Do not select the top suggestion until down is pressed, at which point Tab or Enter will accept the suggestion. Activate to change."),
  f1: false,
  precondition: ContextKeyExpr.and(
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalContextKeys.focus,
    TerminalContextKeys.isOpen,
    TerminalContextKeys.suggestWidgetVisible,
    ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SelectionMode}`, "never")
  ),
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SelectionMode}`, "never"),
      ContextKeyExpr.or(
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}`, true),
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SuggestOnTriggerCharacters}`, true)
      )
    )
  },
  run: (c, accessor) => {
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.SelectionMode, "partial");
  }
});
registerTerminalAction({
  id: TerminalSuggestCommandId.ChangeSelectionModePartial,
  title: localize2("workbench.action.terminal.changeSelectionMode.partial", "Selection Mode: Partial (Tab)"),
  tooltip: localize2("workbench.action.terminal.changeSelectionMode.partial.tooltip", "Partially select the top suggestion, Tab will accept a suggestion when visible. Activate to change."),
  f1: false,
  precondition: ContextKeyExpr.and(
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalContextKeys.focus,
    TerminalContextKeys.isOpen,
    TerminalContextKeys.suggestWidgetVisible,
    ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SelectionMode}`, "partial")
  ),
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SelectionMode}`, "partial"),
      ContextKeyExpr.or(
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}`, true),
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SuggestOnTriggerCharacters}`, true)
      )
    )
  },
  run: (c, accessor) => {
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.SelectionMode, "always");
  }
});
registerTerminalAction({
  id: TerminalSuggestCommandId.ChangeSelectionModeAlways,
  title: localize2("workbench.action.terminal.changeSelectionMode.always", "Selection Mode: Always (Tab or Enter)"),
  tooltip: localize2("workbench.action.terminal.changeSelectionMode.always.tooltip", "Always select the top suggestion, Tab or Enter will accept a suggestion when visible. Activate to change."),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(
      ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SelectionMode}`, "always"),
      ContextKeyExpr.or(
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}`, true),
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SuggestOnTriggerCharacters}`, true)
      )
    )
  },
  run: (c, accessor) => {
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.SelectionMode, "never");
  }
});
registerTerminalAction({
  id: TerminalSuggestCommandId.DoNotShowOnType,
  title: localize2("workbench.action.terminal.doNotShowSuggestOnType", "Don't show IntelliSense unless triggered explicitly. This disables the quick suggestions and suggest on trigger characters settings."),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  icon: Codicon.eye,
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "right",
    order: 1,
    when: ContextKeyExpr.and(
      ContextKeyExpr.or(
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}.commands`, "on"),
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}.arguments`, "on")
      ),
      ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SuggestOnTriggerCharacters}`, true)
    )
  },
  run: (c, accessor) => {
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.QuickSuggestions, { commands: "off", arguments: "off", unknown: "off" });
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.SuggestOnTriggerCharacters, false);
  }
});
registerTerminalAction({
  id: TerminalSuggestCommandId.ShowOnType,
  title: localize2("workbench.action.terminal.showSuggestOnType", "Show IntelliSense while typing. This enables the quick suggestions for commands and arguments, and suggest on trigger characters settings."),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  icon: Codicon.eyeClosed,
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "right",
    order: 1,
    when: ContextKeyExpr.or(
      ContextKeyExpr.and(
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}.commands`, "off"),
        ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.QuickSuggestions}.arguments`, "off")
      ),
      ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.SuggestOnTriggerCharacters}`, false)
    )
  },
  run: (c, accessor) => {
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.QuickSuggestions, { commands: "on", arguments: "on", unknown: "off" });
    accessor.get(IConfigurationService).updateValue(TerminalSuggestSettingId.SuggestOnTriggerCharacters, true);
  }
});
registerTerminalAction({
  id: TerminalSuggestCommandId.LearnMore,
  title: localize2("workbench.action.terminal.learnMore", "Learn More"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  icon: Codicon.question,
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "right",
    order: 2
  },
  run: (c, accessor) => {
    accessor.get(IOpenerService).open("https://aka.ms/vscode-terminal-intellisense");
  }
});
registerTerminalAction({
  id: TerminalSuggestCommandId.ConfigureSettings,
  title: localize2("workbench.action.terminal.configureSuggestSettings", "Configure"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  icon: Codicon.gear,
  menu: {
    id: MenuId.MenubarTerminalSuggestStatusMenu,
    group: "right",
    order: 3
  },
  run: (c, accessor) => accessor.get(IPreferencesService).openSettings({ query: terminalSuggestConfigSection })
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.TriggerSuggest,
  title: localize2("workbench.action.terminal.triggerSuggest", "Trigger Suggest"),
  f1: false,
  keybinding: {
    primary: KeyMod.CtrlCmd | KeyCode.Space,
    mac: { primary: KeyMod.WinCtrl | KeyCode.Space },
    weight: KeybindingWeight.WorkbenchContrib + 1,
    when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.suggestWidgetVisible.negate(), ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.Enabled}`, true))
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.requestCompletions(true)
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.ResetWidgetSize,
  title: localize2("workbench.action.terminal.resetSuggestWidgetSize", "Reset Suggest Widget Size"),
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.resetWidgetSize()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.SelectPrevSuggestion,
  title: localize2("workbench.action.terminal.selectPrevSuggestion", "Select the Previous Suggestion"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    // Up is bound to other workbench keybindings that this needs to beat
    primary: KeyCode.UpArrow,
    weight: KeybindingWeight.WorkbenchContrib + 1,
    when: ContextKeyExpr.or(SimpleSuggestContext.HasNavigated, ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.UpArrowNavigatesHistory}`, false))
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectPreviousSuggestion()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.SelectPrevPageSuggestion,
  title: localize2("workbench.action.terminal.selectPrevPageSuggestion", "Select the Previous Page Suggestion"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    // Up is bound to other workbench keybindings that this needs to beat
    primary: KeyCode.PageUp,
    weight: KeybindingWeight.WorkbenchContrib + 1
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectPreviousPageSuggestion()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.SelectNextSuggestion,
  title: localize2("workbench.action.terminal.selectNextSuggestion", "Select the Next Suggestion"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    // Down is bound to other workbench keybindings that this needs to beat
    primary: KeyCode.DownArrow,
    weight: KeybindingWeight.WorkbenchContrib + 1
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectNextSuggestion()
});
registerActiveInstanceAction({
  id: "terminalSuggestToggleExplainMode",
  title: localize2("workbench.action.terminal.suggestToggleExplainMode", "Suggest Toggle Explain Modes"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    // Down is bound to other workbench keybindings that this needs to beat
    weight: KeybindingWeight.WorkbenchContrib + 1,
    primary: KeyMod.CtrlCmd | KeyCode.Slash
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleExplainMode()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.ToggleDetailsFocus,
  title: localize2("workbench.action.terminal.suggestToggleDetailsFocus", "Suggest Toggle Suggestion Focus"),
  f1: false,
  // HACK: This does not work with a precondition of `TerminalContextKeys.suggestWidgetVisible`, so make sure to not override the editor's keybinding
  precondition: EditorContextKeys.textInputFocus.negate(),
  keybinding: {
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space,
    mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Space }
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleSuggestionFocus()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.ToggleDetails,
  title: localize2("workbench.action.terminal.suggestToggleDetails", "Suggest Toggle Details"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.isOpen, TerminalContextKeys.focus, TerminalContextKeys.suggestWidgetVisible, SimpleSuggestContext.HasFocusedSuggestion),
  keybinding: {
    // HACK: Force weight to be higher than that to start terminal chat
    weight: KeybindingWeight.ExternalExtension + 2,
    primary: KeyMod.CtrlCmd | KeyCode.Space,
    secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
    mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.toggleSuggestionDetails()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.SelectNextPageSuggestion,
  title: localize2("workbench.action.terminal.selectNextPageSuggestion", "Select the Next Page Suggestion"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    // Down is bound to other workbench keybindings that this needs to beat
    primary: KeyCode.PageDown,
    weight: KeybindingWeight.WorkbenchContrib + 1
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.selectNextPageSuggestion()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.AcceptSelectedSuggestion,
  title: localize2("workbench.action.terminal.acceptSelectedSuggestion", "Insert"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: [
    {
      primary: KeyCode.Tab,
      // Tab is bound to other workbench keybindings that this needs to beat
      weight: KeybindingWeight.WorkbenchContrib + 2,
      when: ContextKeyExpr.and(SimpleSuggestContext.HasFocusedSuggestion)
    },
    {
      primary: KeyCode.Enter,
      // Enter accepts when: explicitly invoked (ctrl+space), OR not in partial mode, OR not first suggestion, OR user has navigated
      when: ContextKeyExpr.and(SimpleSuggestContext.HasFocusedSuggestion, ContextKeyExpr.or(SimpleSuggestContext.ExplicitlyInvoked, ContextKeyExpr.notEquals(`config.${TerminalSuggestSettingId.SelectionMode}`, "partial"), SimpleSuggestContext.FirstSuggestionFocused.toNegated(), SimpleSuggestContext.HasNavigated)),
      weight: KeybindingWeight.WorkbenchContrib + 1
    }
  ],
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion()
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.AcceptSelectedSuggestionEnter,
  title: localize2("workbench.action.terminal.acceptSelectedSuggestionEnter", "Accept Selected Suggestion (Enter)"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    primary: KeyCode.Enter,
    // Enter is bound to other workbench keybindings that this needs to beat
    weight: KeybindingWeight.WorkbenchContrib + 1,
    when: ContextKeyExpr.notEquals(`config.${TerminalSuggestSettingId.RunOnEnter}`, "never")
  },
  run: async (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.acceptSelectedSuggestion(void 0, true)
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.HideSuggestWidget,
  title: localize2("workbench.action.terminal.hideSuggestWidget", "Hide Suggest Widget"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    primary: KeyCode.Escape,
    // Escape is bound to other workbench keybindings that this needs to beat
    weight: KeybindingWeight.WorkbenchContrib + 1
  },
  run: (activeInstance) => TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget(true)
});
registerActiveInstanceAction({
  id: TerminalSuggestCommandId.HideSuggestWidgetAndNavigateHistory,
  title: localize2("workbench.action.terminal.hideSuggestWidgetAndNavigateHistory", "Hide Suggest Widget and Navigate History"),
  f1: false,
  precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.focus, TerminalContextKeys.isOpen, TerminalContextKeys.suggestWidgetVisible),
  keybinding: {
    primary: KeyCode.UpArrow,
    when: ContextKeyExpr.and(SimpleSuggestContext.HasNavigated.negate(), ContextKeyExpr.equals(`config.${TerminalSuggestSettingId.UpArrowNavigatesHistory}`, true)),
    weight: KeybindingWeight.WorkbenchContrib + 2
  },
  run: (activeInstance) => {
    TerminalSuggestContribution.get(activeInstance)?.addon?.hideSuggestWidget(true);
    activeInstance.sendText("\x1B[A", false);
  }
});
let TerminalSuggestProvidersConfigurationManager = class extends Disposable {
  constructor(_terminalCompletionService, _terminalContributionService) {
    super();
    this._terminalCompletionService = _terminalCompletionService;
    this._terminalContributionService = _terminalContributionService;
    this._register(this._terminalCompletionService.onDidChangeProviders(() => {
      this._updateConfiguration();
    }));
    this._register(this._terminalContributionService.onDidChangeTerminalCompletionProviders(() => {
      this._updateConfiguration();
    }));
    this._updateConfiguration();
  }
  static initialize(instantiationService) {
    if (!this._instance) {
      this._instance = instantiationService.createInstance(TerminalSuggestProvidersConfigurationManager);
    }
  }
  _updateConfiguration() {
    const providers = /* @__PURE__ */ new Map();
    this._terminalContributionService.terminalCompletionProviders.forEach((o) => providers.set(o.extensionIdentifier, { ...o, id: o.extensionIdentifier }));
    for (const { id } of this._terminalCompletionService.providers) {
      if (id && !providers.has(id)) {
        providers.set(id, { id });
      }
    }
    registerTerminalSuggestProvidersConfiguration(providers);
  }
};
TerminalSuggestProvidersConfigurationManager = __decorateClass([
  __decorateParam(0, ITerminalCompletionService),
  __decorateParam(1, ITerminalContributionService)
], TerminalSuggestProvidersConfigurationManager);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3VnZ2VzdFxcYnJvd3NlclxcdGVybWluYWwuc3VnZ2VzdC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIGFzIFJhd1h0ZXJtVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQXV0b09wZW5CYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb250cmlidXRpb24sIElUZXJtaW5hbEluc3RhbmNlLCBJWHRlcm1UZXJtaW5hbCB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbiwgcmVnaXN0ZXJUZXJtaW5hbEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGVybWluYWxDb250cmlidXRpb24sIHR5cGUgSVRlcm1pbmFsQ29udHJpYnV0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5zdWdnZXN0LmpzJztcbmltcG9ydCB7IHRlcm1pbmFsU3VnZ2VzdENvbmZpZ1NlY3Rpb24sIFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZCwgdHlwZSBJVGVybWluYWxTdWdnZXN0Q29uZmlndXJhdGlvbiwgcmVnaXN0ZXJUZXJtaW5hbFN1Z2dlc3RQcm92aWRlcnNDb25maWd1cmF0aW9uLCB0eXBlIElUZXJtaW5hbFN1Z2dlc3RQcm92aWRlckluZm8gfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdWdnZXN0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSwgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB9IGZyb20gJy4vdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb250cmlidXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsRXh0ZW5zaW9uUG9pbnRzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEFkZG9uIH0gZnJvbSAnLi90ZXJtaW5hbFN1Z2dlc3RBZGRvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENsaXBib2FyZENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2NsaXBib2FyZC9icm93c2VyL3Rlcm1pbmFsLmNsaXBib2FyZC5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgU2ltcGxlU3VnZ2VzdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlU3VnZ2VzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0RGV0YWlsc0NsYXNzTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3N1Z2dlc3QvYnJvd3Nlci9zaW1wbGVTdWdnZXN0V2lkZ2V0RGV0YWlscy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCAnLi90ZXJtaW5hbFN5bWJvbEljb25zLmpzJztcbmltcG9ydCB7IExzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uIH0gZnJvbSAnLi9sc3BDb21wbGV0aW9uUHJvdmlkZXJBZGRvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXJtaW5hbExhbmd1YWdlVmlydHVhbFVyaSwgTHNwVGVybWluYWxNb2RlbENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4vbHNwVGVybWluYWxNb2RlbENvbnRlbnRQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBnZXRUZXJtaW5hbExzcFN1cHBvcnRlZExhbmd1YWdlT2JqIH0gZnJvbSAnLi9sc3BUZXJtaW5hbFV0aWwuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSwgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8vICNyZWdpb24gVGVybWluYWwgQ29udHJpYnV0aW9uc1xuXG5jbGFzcyBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlU3RvcmUgaW1wbGVtZW50cyBJVGVybWluYWxDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndGVybWluYWwuc3VnZ2VzdCc7XG5cblx0c3RhdGljIGdldChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gaW5zdGFuY2UuZ2V0Q29udHJpYnV0aW9uPFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbj4oVGVybWluYWxTdWdnZXN0Q29udHJpYnV0aW9uLklEKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FkZG9uOiBNdXRhYmxlRGlzcG9zYWJsZTxTdWdnZXN0QWRkb24+ID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xzcEFkZG9uczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIExzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uPiA9IHRoaXMuYWRkKG5ldyBEaXNwb3NhYmxlTWFwKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sc3BNb2RlbFByb3ZpZGVyOiBNdXRhYmxlRGlzcG9zYWJsZTxMc3BUZXJtaW5hbE1vZGVsQ29udGVudFByb3ZpZGVyPiA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFN1Z2dlc3RXaWRnZXRWaXNpYmxlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Z2V0IGFkZG9uKCk6IFN1Z2dlc3RBZGRvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9hZGRvbi52YWx1ZTsgfVxuXHRnZXQgbHNwQWRkb25zKCk6IExzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uW10geyByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9sc3BBZGRvbnMudmFsdWVzKCkpOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY3R4OiBJVGVybWluYWxDb250cmlidXRpb25Db250ZXh0LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hZGRvbj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbHNwTW9kZWxQcm92aWRlcj8udmFsdWU/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2xzcE1vZGVsUHJvdmlkZXI/LmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdGVybWluYWxTdWdnZXN0V2lkZ2V0VmlzaWJsZUNvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLkVuYWJsZWQpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRpb25zRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbFN1Z2dlc3RDb25maWd1cmF0aW9uPih0ZXJtaW5hbFN1Z2dlc3RDb25maWdTZWN0aW9uKS5lbmFibGVkO1xuXHRcdFx0XHRpZiAoIWNvbXBsZXRpb25zRW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2FkZG9uLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fbHNwQWRkb25zLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHh0ZXJtUmF3ID0gdGhpcy5fY3R4Lmluc3RhbmNlLnh0ZXJtPy5yYXc7XG5cdFx0XHRcdGlmICghIXh0ZXJtUmF3ICYmIGNvbXBsZXRpb25zRW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvYWRBZGRvbnMoeHRlcm1SYXcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgZHluYW1pYyBwcm92aWRlcnMgY29uZmlndXJhdGlvbiBtYW5hZ2VyXG5cdFx0VGVybWluYWxTdWdnZXN0UHJvdmlkZXJzQ29uZmlndXJhdGlvbk1hbmFnZXIuaW5pdGlhbGl6ZSh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHRlcm1pbmFsIGxvY2F0aW9uIGNoYW5nZXMgdG8gdXBkYXRlIHRoZSBzdWdnZXN0IHdpZGdldCBjb250YWluZXJcblx0XHR0aGlzLmFkZCh0aGlzLl9jdHguaW5zdGFuY2Uub25EaWRDaGFuZ2VUYXJnZXQoKHRhcmdldCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29udGFpbmVyRm9yVGFyZ2V0KHRhcmdldCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGhlIHRlcm1pbmFsIHZpZXcgY2FuIGJlIHJlcGFyZW50ZWQgKGZvciBleGFtcGxlIHdoZW4gbW92ZWQgaW50byBhIG5ldyB2aWV3KS4gRW5zdXJlIHRoZVxuXHRcdC8vIHN1Z2dlc3Qgd2lkZ2V0IGZvbGxvd3MgdGhlIHRlcm1pbmFsJ3MgRE9NIHdoZW4gZm9jdXMgcmV0dXJucyB0byB0aGUgaW5zdGFuY2UuXG5cdFx0dGhpcy5hZGQodGhpcy5fY3R4Lmluc3RhbmNlLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgeHRlcm1SYXcgPSB0aGlzLl9jdHguaW5zdGFuY2UueHRlcm0/LnJhdztcblx0XHRcdGlmICh4dGVybVJhdykge1xuXHRcdFx0XHR0aGlzLl9wcmVwYXJlQWRkb25MYXlvdXQoeHRlcm1SYXcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHh0ZXJtT3Blbih4dGVybTogSVh0ZXJtVGVybWluYWwgJiB7IHJhdzogUmF3WHRlcm1UZXJtaW5hbCB9KTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVRlcm1pbmFsU3VnZ2VzdENvbmZpZ3VyYXRpb24+KHRlcm1pbmFsU3VnZ2VzdENvbmZpZ1NlY3Rpb24pO1xuXHRcdGNvbnN0IGVuYWJsZWQgPSBjb25maWcuZW5hYmxlZDtcblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9hZEFkZG9ucyh4dGVybS5yYXcpO1xuXHRcdHRoaXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9jdHguaW5zdGFuY2Uub25EaWRDaGFuZ2VTaGVsbFR5cGUsIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hBZGRvbnMoKTtcblx0XHRcdHRoaXMuX2xzcE1vZGVsUHJvdmlkZXIudmFsdWU/LnNoZWxsVHlwZUNoYW5nZWQodGhpcy5fY3R4Lmluc3RhbmNlLnNoZWxsVHlwZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZExzcENvbXBsZXRpb25BZGRvbih4dGVybTogUmF3WHRlcm1UZXJtaW5hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBsc3BUZXJtaW5hbE9iaiA9IHVuZGVmaW5lZDtcblx0XHQvLyBUT0RPOiBDaGFuZ2UgdG8gYWx3YXlzIGxvYWQgYWZ0ZXIgc2V0dGluZ3MgdXBkYXRlIGZvciB0ZXJtaW5hbCBzdWdnZXN0IHByb3ZpZGVyXG5cdFx0aWYgKCF0aGlzLl9jdHguaW5zdGFuY2Uuc2hlbGxUeXBlIHx8ICEobHNwVGVybWluYWxPYmogPSBnZXRUZXJtaW5hbExzcFN1cHBvcnRlZExhbmd1YWdlT2JqKHRoaXMuX2N0eC5pbnN0YW5jZS5zaGVsbFR5cGUpKSkge1xuXHRcdFx0dGhpcy5fbHNwQWRkb25zLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpcnR1YWxUZXJtaW5hbERvY3VtZW50VXJpID0gY3JlYXRlVGVybWluYWxMYW5ndWFnZVZpcnR1YWxVcmkodGhpcy5fY3R4Lmluc3RhbmNlLmluc3RhbmNlSWQsIGxzcFRlcm1pbmFsT2JqLmV4dGVuc2lvbik7XG5cblx0XHQvLyBMb2FkIGFuZCByZWdpc3RlciB0aGUgTFNQIGNvbXBsZXRpb24gcHJvdmlkZXJzIChvbmUgcGVyIGxhbmd1YWdlIHNlcnZlcilcblx0XHR0aGlzLl9sc3BNb2RlbFByb3ZpZGVyLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTHNwVGVybWluYWxNb2RlbENvbnRlbnRQcm92aWRlciwgdGhpcy5fY3R4Lmluc3RhbmNlLmNhcGFiaWxpdGllcywgdGhpcy5fY3R4Lmluc3RhbmNlLmluc3RhbmNlSWQsIHZpcnR1YWxUZXJtaW5hbERvY3VtZW50VXJpLCB0aGlzLl9jdHguaW5zdGFuY2Uuc2hlbGxUeXBlKTtcblx0XHR0aGlzLmFkZCh0aGlzLl9sc3BNb2RlbFByb3ZpZGVyLnZhbHVlKTtcblxuXHRcdGNvbnN0IHRleHRWaXJ0dWFsTW9kZWwgPSBhd2FpdCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHZpcnR1YWxUZXJtaW5hbERvY3VtZW50VXJpKTtcblx0XHR0aGlzLmFkZCh0ZXh0VmlydHVhbE1vZGVsKTtcblxuXHRcdGNvbnN0IHZpcnR1YWxQcm92aWRlcnMgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIuYWxsKHRleHRWaXJ0dWFsTW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0Y29uc3QgZmlsdGVyZWRQcm92aWRlcnMgPSB2aXJ0dWFsUHJvdmlkZXJzLmZpbHRlcihwID0+IHAuX2RlYnVnRGlzcGxheU5hbWUgIT09ICd3b3JkYmFzZWRDb21wbGV0aW9ucycpO1xuXG5cdFx0Ly8gSXRlcmF0ZSB0aHJvdWdoIGFsbCBhdmFpbGFibGUgcHJvdmlkZXJzXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBmaWx0ZXJlZFByb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgbHNwQ29tcGxldGlvblByb3ZpZGVyQWRkb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMc3BDb21wbGV0aW9uUHJvdmlkZXJBZGRvbiwgcHJvdmlkZXIsIHRleHRWaXJ0dWFsTW9kZWwsIHRoaXMuX2xzcE1vZGVsUHJvdmlkZXIudmFsdWUpO1xuXHRcdFx0dGhpcy5fbHNwQWRkb25zLnNldChwcm92aWRlci5fZGVidWdEaXNwbGF5TmFtZSwgbHNwQ29tcGxldGlvblByb3ZpZGVyQWRkb24pO1xuXHRcdFx0eHRlcm0ubG9hZEFkZG9uKGxzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uKTtcblx0XHRcdHRoaXMuYWRkKHRoaXMuX3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcihcblx0XHRcdFx0J2xzcCcsXG5cdFx0XHRcdGxzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uLmlkLFxuXHRcdFx0XHRsc3BDb21wbGV0aW9uUHJvdmlkZXJBZGRvbixcblx0XHRcdFx0Li4uKGxzcENvbXBsZXRpb25Qcm92aWRlckFkZG9uLnRyaWdnZXJDaGFyYWN0ZXJzID8/IFtdKVxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZEFkZG9ucyh4dGVybTogUmF3WHRlcm1UZXJtaW5hbCk6IHZvaWQge1xuXHRcdC8vIERvbid0IHJlLWNyZWF0ZSB0aGUgYWRkb25cblx0XHRpZiAodGhpcy5fYWRkb24udmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRvbiA9IHRoaXMuX2FkZG9uLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdEFkZG9uLCB0aGlzLl9jdHguaW5zdGFuY2Uuc2Vzc2lvbklkLCB0aGlzLl9jdHguaW5zdGFuY2Uuc2hlbGxUeXBlLCB0aGlzLl9jdHguaW5zdGFuY2UuY2FwYWJpbGl0aWVzLCB0aGlzLl90ZXJtaW5hbFN1Z2dlc3RXaWRnZXRWaXNpYmxlQ29udGV4dEtleSk7XG5cdFx0eHRlcm0ubG9hZEFkZG9uKGFkZG9uKTtcblx0XHR0aGlzLl9sb2FkTHNwQ29tcGxldGlvbkFkZG9uKHh0ZXJtKTtcblxuXHRcdHRoaXMuX3ByZXBhcmVBZGRvbkxheW91dCh4dGVybSk7XG5cblx0XHR0aGlzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2N0eC5pbnN0YW5jZS5kb21FbGVtZW50LCBkb20uRXZlbnRUeXBlLkZPQ1VTX09VVCwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0aWYgKGZvY3VzZWRFbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoU3VnZ2VzdERldGFpbHNDbGFzc05hbWUpKSB7XG5cdFx0XHRcdC8vIERvbid0IGhpZGUgdGhlIHN1Z2dlc3Qgd2lkZ2V0IGlmIHRoZSBmb2N1cyBpcyBtb3ZpbmcgdG8gdGhlIGRldGFpbHNcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YWRkb24uaGlkZVN1Z2dlc3RXaWRnZXQodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5hZGQoYWRkb24ub25BY2NlcHRlZENvbXBsZXRpb24oYXN5bmMgdGV4dCA9PiB7XG5cdFx0XHR0aGlzLl9jdHguaW5zdGFuY2UuZm9jdXMoKTtcblx0XHRcdHRoaXMuX2N0eC5pbnN0YW5jZS5zZW5kVGV4dCh0ZXh0LCBmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGNsaXBib2FyZENvbnRyaWIgPSBUZXJtaW5hbENsaXBib2FyZENvbnRyaWJ1dGlvbi5nZXQodGhpcy5fY3R4Lmluc3RhbmNlKSE7XG5cdFx0dGhpcy5hZGQoY2xpcGJvYXJkQ29udHJpYi5vbldpbGxQYXN0ZSgoKSA9PiBhZGRvbi5pc1Bhc3RpbmcgPSB0cnVlKSk7XG5cdFx0dGhpcy5hZGQoY2xpcGJvYXJkQ29udHJpYi5vbkRpZFBhc3RlKCgpID0+IHtcblx0XHRcdC8vIERlbGF5IHRoaXMgc2xpZ2h0bHkgYXMgc3luY2hyb25pemluZyB0aGUgcHJvbXB0IGlucHV0IGlzIGRlYm91bmNlZFxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiBhZGRvbi5pc1Bhc3RpbmcgPSBmYWxzZSwgMTAwKTtcblx0XHR9KSk7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGxldCBiYXJyaWVyOiBBdXRvT3BlbkJhcnJpZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmFkZChhZGRvbi5vbkRpZFJlY2VpdmVDb21wbGV0aW9ucygoKSA9PiB7XG5cdFx0XHRcdGJhcnJpZXI/Lm9wZW4oKTtcblx0XHRcdFx0YmFycmllciA9IHVuZGVmaW5lZDtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoQWRkb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZG9uID0gdGhpcy5fYWRkb24udmFsdWU7XG5cdFx0aWYgKCFhZGRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhZGRvbi5zaGVsbFR5cGUgPSB0aGlzLl9jdHguaW5zdGFuY2Uuc2hlbGxUeXBlO1xuXHRcdGlmICghdGhpcy5fY3R4Lmluc3RhbmNlLnh0ZXJtPy5yYXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmVsaWVzIG9uIHNoZWxsIHR5cGUgYmVpbmcgc2V0XG5cdFx0dGhpcy5fbG9hZExzcENvbXBsZXRpb25BZGRvbih0aGlzLl9jdHguaW5zdGFuY2UueHRlcm0ucmF3KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbnRhaW5lckZvclRhcmdldCh0YXJnZXQ6IFRlcm1pbmFsTG9jYXRpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBhZGRvbiA9IHRoaXMuX2FkZG9uLnZhbHVlO1xuXHRcdGlmICghYWRkb24gfHwgIXRoaXMuX2N0eC5pbnN0YW5jZS54dGVybT8ucmF3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJlcGFyZUFkZG9uTGF5b3V0KHRoaXMuX2N0eC5pbnN0YW5jZS54dGVybS5yYXcpO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF9wcmVwYXJlQWRkb25MYXlvdXQoeHRlcm06IFJhd1h0ZXJtVGVybWluYWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhZGRvbiA9IHRoaXMuX2FkZG9uLnZhbHVlO1xuXHRcdGlmICghYWRkb24gfHwgdGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeHRlcm1FbGVtZW50ID0geHRlcm0uZWxlbWVudCA/PyBhd2FpdCB0aGlzLl93YWl0Rm9yWHRlcm1FbGVtZW50KHh0ZXJtKTtcblx0XHRpZiAoIXh0ZXJtRWxlbWVudCB8fCB0aGlzLmlzRGlzcG9zZWQgfHwgYWRkb24gIT09IHRoaXMuX2FkZG9uLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5fcmVzb2x2ZUFkZG9uQ29udGFpbmVyKHh0ZXJtRWxlbWVudCk7XG5cdFx0YWRkb24uc2V0Q29udGFpbmVyV2l0aE92ZXJmbG93KGNvbnRhaW5lcik7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgc2NyZWVuRWxlbWVudCA9IHh0ZXJtRWxlbWVudD8ucXVlcnlTZWxlY3RvcignLnh0ZXJtLXNjcmVlbicpO1xuXHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChzY3JlZW5FbGVtZW50KSkge1xuXHRcdFx0YWRkb24uc2V0U2NyZWVuKHNjcmVlbkVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JYdGVybUVsZW1lbnQoeHRlcm06IFJhd1h0ZXJtVGVybWluYWwpOiBQcm9taXNlPEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHh0ZXJtLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB4dGVybS5lbGVtZW50O1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRoaXMuX2N0eC5pbnN0YW5jZS5vbkRpZENoYW5nZVZpc2liaWxpdHksIHZpc2libGUgPT4gdmlzaWJsZSkpLFxuXHRcdFx0RXZlbnQudG9Qcm9taXNlKHRoaXMuX2N0eC5pbnN0YW5jZS5vbkRpc3Bvc2VkKVxuXHRcdF0pO1xuXG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCB8fCB0aGlzLl9jdHguaW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4geHRlcm0uZWxlbWVudCA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQWRkb25Db250YWluZXIoeHRlcm1FbGVtZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAodGhpcy5fY3R4Lmluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdHJldHVybiB4dGVybUVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRvbS5maW5kUGFyZW50V2l0aENsYXNzKHh0ZXJtRWxlbWVudCwgJ3BhbmVsJykgPz8geHRlcm1FbGVtZW50O1xuXHR9XG59XG5cbnJlZ2lzdGVyVGVybWluYWxDb250cmlidXRpb24oVGVybWluYWxTdWdnZXN0Q29udHJpYnV0aW9uLklELCBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24pO1xuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gQWN0aW9uc1xuXG5yZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5DaGFuZ2VTZWxlY3Rpb25Nb2RlTmV2ZXIsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhbmdlU2VsZWN0aW9uTW9kZS5uZXZlcicsICdTZWxlY3Rpb24gTW9kZTogTm9uZScpLFxuXHR0b29sdGlwOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhbmdlU2VsZWN0aW9uTW9kZS5uZXZlci50b29sdGlwJywgJ0RvIG5vdCBzZWxlY3QgdGhlIHRvcCBzdWdnZXN0aW9uIHVudGlsIGRvd24gaXMgcHJlc3NlZCwgYXQgd2hpY2ggcG9pbnQgVGFiIG9yIEVudGVyIHdpbGwgYWNjZXB0IHRoZSBzdWdnZXN0aW9uLiBBY3RpdmF0ZSB0byBjaGFuZ2UuJyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLFxuXHRcdFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0VGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4sXG5cdFx0VGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TZWxlY3Rpb25Nb2RlfWAsICduZXZlcicpXG5cdCksXG5cdG1lbnU6IHtcblx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51LFxuXHRcdGdyb3VwOiAnbGVmdCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuU2VsZWN0aW9uTW9kZX1gLCAnbmV2ZXInKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5RdWlja1N1Z2dlc3Rpb25zfWAsIHRydWUpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVyc31gLCB0cnVlKSxcblx0XHRcdClcblx0XHQpXG5cdH0sXG5cdHJ1bjogKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkudXBkYXRlVmFsdWUoVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlNlbGVjdGlvbk1vZGUsICdwYXJ0aWFsJyk7XG5cdH1cbn0pO1xucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbFN1Z2dlc3RDb21tYW5kSWQuQ2hhbmdlU2VsZWN0aW9uTW9kZVBhcnRpYWwsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhbmdlU2VsZWN0aW9uTW9kZS5wYXJ0aWFsJywgJ1NlbGVjdGlvbiBNb2RlOiBQYXJ0aWFsIChUYWIpJyksXG5cdHRvb2x0aXA6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGFuZ2VTZWxlY3Rpb25Nb2RlLnBhcnRpYWwudG9vbHRpcCcsICdQYXJ0aWFsbHkgc2VsZWN0IHRoZSB0b3Agc3VnZ2VzdGlvbiwgVGFiIHdpbGwgYWNjZXB0IGEgc3VnZ2VzdGlvbiB3aGVuIHZpc2libGUuIEFjdGl2YXRlIHRvIGNoYW5nZS4nKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksXG5cdFx0VGVybWluYWxDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRUZXJtaW5hbENvbnRleHRLZXlzLmlzT3Blbixcblx0XHRUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlNlbGVjdGlvbk1vZGV9YCwgJ3BhcnRpYWwnKVxuXHQpLFxuXHRtZW51OiB7XG5cdFx0aWQ6IE1lbnVJZC5NZW51YmFyVGVybWluYWxTdWdnZXN0U3RhdHVzTWVudSxcblx0XHRncm91cDogJ2xlZnQnLFxuXHRcdG9yZGVyOiAxLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlNlbGVjdGlvbk1vZGV9YCwgJ3BhcnRpYWwnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5RdWlja1N1Z2dlc3Rpb25zfWAsIHRydWUpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVyc31gLCB0cnVlKSxcblx0XHRcdClcblx0XHQpXG5cdH0sXG5cdHJ1bjogKGMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkudXBkYXRlVmFsdWUoVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlNlbGVjdGlvbk1vZGUsICdhbHdheXMnKTtcblx0fVxufSk7XG5yZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5DaGFuZ2VTZWxlY3Rpb25Nb2RlQWx3YXlzLFxuXHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZVNlbGVjdGlvbk1vZGUuYWx3YXlzJywgJ1NlbGVjdGlvbiBNb2RlOiBBbHdheXMgKFRhYiBvciBFbnRlciknKSxcblx0dG9vbHRpcDogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZVNlbGVjdGlvbk1vZGUuYWx3YXlzLnRvb2x0aXAnLCAnQWx3YXlzIHNlbGVjdCB0aGUgdG9wIHN1Z2dlc3Rpb24sIFRhYiBvciBFbnRlciB3aWxsIGFjY2VwdCBhIHN1Z2dlc3Rpb24gd2hlbiB2aXNpYmxlLiBBY3RpdmF0ZSB0byBjaGFuZ2UuJyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiwgVGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSksXG5cdG1lbnU6IHtcblx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51LFxuXHRcdGdyb3VwOiAnbGVmdCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuU2VsZWN0aW9uTW9kZX1gLCAnYWx3YXlzJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUXVpY2tTdWdnZXN0aW9uc31gLCB0cnVlKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuU3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnN9YCwgdHJ1ZSksXG5cdFx0XHQpXG5cdFx0KVxuXHR9LFxuXHRydW46IChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TZWxlY3Rpb25Nb2RlLCAnbmV2ZXInKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyVGVybWluYWxBY3Rpb24oe1xuXHRpZDogVGVybWluYWxTdWdnZXN0Q29tbWFuZElkLkRvTm90U2hvd09uVHlwZSxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5kb05vdFNob3dTdWdnZXN0T25UeXBlJywgJ0RvblxcJ3Qgc2hvdyBJbnRlbGxpU2Vuc2UgdW5sZXNzIHRyaWdnZXJlZCBleHBsaWNpdGx5LiBUaGlzIGRpc2FibGVzIHRoZSBxdWljayBzdWdnZXN0aW9ucyBhbmQgc3VnZ2VzdCBvbiB0cmlnZ2VyIGNoYXJhY3RlcnMgc2V0dGluZ3MuJyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiwgVGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSksXG5cdGljb246IENvZGljb24uZXllLFxuXHRtZW51OiB7XG5cdFx0aWQ6IE1lbnVJZC5NZW51YmFyVGVybWluYWxTdWdnZXN0U3RhdHVzTWVudSxcblx0XHRncm91cDogJ3JpZ2h0Jyxcblx0XHRvcmRlcjogMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUXVpY2tTdWdnZXN0aW9uc30uY29tbWFuZHNgLCAnb24nKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUXVpY2tTdWdnZXN0aW9uc30uYXJndW1lbnRzYCwgJ29uJyksXG5cdFx0XHQpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuU3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnN9YCwgdHJ1ZSksXG5cdFx0KSxcblx0fSxcblx0cnVuOiAoYywgYWNjZXNzb3IpID0+IHtcblx0XHRhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKS51cGRhdGVWYWx1ZShUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUXVpY2tTdWdnZXN0aW9ucywgeyBjb21tYW5kczogJ29mZicsIGFyZ3VtZW50czogJ29mZicsIHVua25vd246ICdvZmYnIH0pO1xuXHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycywgZmFsc2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbFN1Z2dlc3RDb21tYW5kSWQuU2hvd09uVHlwZSxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zaG93U3VnZ2VzdE9uVHlwZScsICdTaG93IEludGVsbGlTZW5zZSB3aGlsZSB0eXBpbmcuIFRoaXMgZW5hYmxlcyB0aGUgcXVpY2sgc3VnZ2VzdGlvbnMgZm9yIGNvbW1hbmRzIGFuZCBhcmd1bWVudHMsIGFuZCBzdWdnZXN0IG9uIHRyaWdnZXIgY2hhcmFjdGVycyBzZXR0aW5ncy4nKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuLCBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlKSxcblx0aWNvbjogQ29kaWNvbi5leWVDbG9zZWQsXG5cdG1lbnU6IHtcblx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51LFxuXHRcdGdyb3VwOiAncmlnaHQnLFxuXHRcdG9yZGVyOiAxLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5RdWlja1N1Z2dlc3Rpb25zfS5jb21tYW5kc2AsICdvZmYnKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuUXVpY2tTdWdnZXN0aW9uc30uYXJndW1lbnRzYCwgJ29mZicpLFxuXHRcdFx0KSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzfWAsIGZhbHNlKSxcblx0XHQpLFxuXHR9LFxuXHRydW46IChjLCBhY2Nlc3NvcikgPT4ge1xuXHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5RdWlja1N1Z2dlc3Rpb25zLCB7IGNvbW1hbmRzOiAnb24nLCBhcmd1bWVudHM6ICdvbicsIHVua25vd246ICdvZmYnIH0pO1xuXHRcdGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycywgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlclRlcm1pbmFsQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5MZWFybk1vcmUsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubGVhcm5Nb3JlJywgJ0xlYXJuIE1vcmUnKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuLCBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlKSxcblx0aWNvbjogQ29kaWNvbi5xdWVzdGlvbixcblx0bWVudToge1xuXHRcdGlkOiBNZW51SWQuTWVudWJhclRlcm1pbmFsU3VnZ2VzdFN0YXR1c01lbnUsXG5cdFx0Z3JvdXA6ICdyaWdodCcsXG5cdFx0b3JkZXI6IDJcblx0fSxcblx0cnVuOiAoYywgYWNjZXNzb3IpID0+IHtcblx0XHQoYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKSkub3BlbignaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXRlcm1pbmFsLWludGVsbGlzZW5zZScpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJUZXJtaW5hbEFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbFN1Z2dlc3RDb21tYW5kSWQuQ29uZmlndXJlU2V0dGluZ3MsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29uZmlndXJlU3VnZ2VzdFNldHRpbmdzJywgJ0NvbmZpZ3VyZScpLFxuXHRmMTogZmFsc2UsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSwgVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4sIFRlcm1pbmFsQ29udGV4dEtleXMuc3VnZ2VzdFdpZGdldFZpc2libGUpLFxuXHRpY29uOiBDb2RpY29uLmdlYXIsXG5cdG1lbnU6IHtcblx0XHRpZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51LFxuXHRcdGdyb3VwOiAncmlnaHQnLFxuXHRcdG9yZGVyOiAzXG5cdH0sXG5cdHJ1bjogKGMsIGFjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblNldHRpbmdzKHsgcXVlcnk6IHRlcm1pbmFsU3VnZ2VzdENvbmZpZ1NlY3Rpb24gfSlcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5UcmlnZ2VyU3VnZ2VzdCxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC50cmlnZ2VyU3VnZ2VzdCcsICdUcmlnZ2VyIFN1Z2dlc3QnKSxcblx0ZjE6IGZhbHNlLFxuXHRrZXliaW5kaW5nOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuU3BhY2UgfSxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuc3VnZ2VzdFdpZGdldFZpc2libGUubmVnYXRlKCksIENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7VGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLkVuYWJsZWR9YCwgdHJ1ZSkpXG5cdH0sXG5cdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24uZ2V0KGFjdGl2ZUluc3RhbmNlKT8uYWRkb24/LnJlcXVlc3RDb21wbGV0aW9ucyh0cnVlKVxufSk7XG5cbnJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRpZDogVGVybWluYWxTdWdnZXN0Q29tbWFuZElkLlJlc2V0V2lkZ2V0U2l6ZSxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXNldFN1Z2dlc3RXaWRnZXRTaXplJywgJ1Jlc2V0IFN1Z2dlc3QgV2lkZ2V0IFNpemUnKSxcblx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5hZGRvbj8ucmVzZXRXaWRnZXRTaXplKClcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5TZWxlY3RQcmV2U3VnZ2VzdGlvbixcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZWxlY3RQcmV2U3VnZ2VzdGlvbicsICdTZWxlY3QgdGhlIFByZXZpb3VzIFN1Z2dlc3Rpb24nKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuLCBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlKSxcblx0a2V5YmluZGluZzoge1xuXHRcdC8vIFVwIGlzIGJvdW5kIHRvIG90aGVyIHdvcmtiZW5jaCBrZXliaW5kaW5ncyB0aGF0IHRoaXMgbmVlZHMgdG8gYmVhdFxuXHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoU2ltcGxlU3VnZ2VzdENvbnRleHQuSGFzTmF2aWdhdGVkLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5VcEFycm93TmF2aWdhdGVzSGlzdG9yeX1gLCBmYWxzZSkpXG5cdH0sXG5cdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24uZ2V0KGFjdGl2ZUluc3RhbmNlKT8uYWRkb24/LnNlbGVjdFByZXZpb3VzU3VnZ2VzdGlvbigpXG59KTtcblxucmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbFN1Z2dlc3RDb21tYW5kSWQuU2VsZWN0UHJldlBhZ2VTdWdnZXN0aW9uLFxuXHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdFByZXZQYWdlU3VnZ2VzdGlvbicsICdTZWxlY3QgdGhlIFByZXZpb3VzIFBhZ2UgU3VnZ2VzdGlvbicpLFxuXHRmMTogZmFsc2UsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSwgVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4sIFRlcm1pbmFsQ29udGV4dEtleXMuc3VnZ2VzdFdpZGdldFZpc2libGUpLFxuXHRrZXliaW5kaW5nOiB7XG5cdFx0Ly8gVXAgaXMgYm91bmQgdG8gb3RoZXIgd29ya2JlbmNoIGtleWJpbmRpbmdzIHRoYXQgdGhpcyBuZWVkcyB0byBiZWF0XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlVXAsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxXG5cdH0sXG5cdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24uZ2V0KGFjdGl2ZUluc3RhbmNlKT8uYWRkb24/LnNlbGVjdFByZXZpb3VzUGFnZVN1Z2dlc3Rpb24oKVxufSk7XG5cbnJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRpZDogVGVybWluYWxTdWdnZXN0Q29tbWFuZElkLlNlbGVjdE5leHRTdWdnZXN0aW9uLFxuXHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbGVjdE5leHRTdWdnZXN0aW9uJywgJ1NlbGVjdCB0aGUgTmV4dCBTdWdnZXN0aW9uJyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiwgVGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSksXG5cdGtleWJpbmRpbmc6IHtcblx0XHQvLyBEb3duIGlzIGJvdW5kIHRvIG90aGVyIHdvcmtiZW5jaCBrZXliaW5kaW5ncyB0aGF0IHRoaXMgbmVlZHMgdG8gYmVhdFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMVxuXHR9LFxuXHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4gVGVybWluYWxTdWdnZXN0Q29udHJpYnV0aW9uLmdldChhY3RpdmVJbnN0YW5jZSk/LmFkZG9uPy5zZWxlY3ROZXh0U3VnZ2VzdGlvbigpXG59KTtcblxucmVnaXN0ZXJBY3RpdmVJbnN0YW5jZUFjdGlvbih7XG5cdGlkOiAndGVybWluYWxTdWdnZXN0VG9nZ2xlRXhwbGFpbk1vZGUnLFxuXHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN1Z2dlc3RUb2dnbGVFeHBsYWluTW9kZScsICdTdWdnZXN0IFRvZ2dsZSBFeHBsYWluIE1vZGVzJyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiwgVGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSksXG5cdGtleWJpbmRpbmc6IHtcblx0XHQvLyBEb3duIGlzIGJvdW5kIHRvIG90aGVyIHdvcmtiZW5jaCBrZXliaW5kaW5ncyB0aGF0IHRoaXMgbmVlZHMgdG8gYmVhdFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gsXG5cdH0sXG5cdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24uZ2V0KGFjdGl2ZUluc3RhbmNlKT8uYWRkb24/LnRvZ2dsZUV4cGxhaW5Nb2RlKClcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5Ub2dnbGVEZXRhaWxzRm9jdXMsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3VnZ2VzdFRvZ2dsZURldGFpbHNGb2N1cycsICdTdWdnZXN0IFRvZ2dsZSBTdWdnZXN0aW9uIEZvY3VzJyksXG5cdGYxOiBmYWxzZSxcblx0Ly8gSEFDSzogVGhpcyBkb2VzIG5vdCB3b3JrIHdpdGggYSBwcmVjb25kaXRpb24gb2YgYFRlcm1pbmFsQ29udGV4dEtleXMuc3VnZ2VzdFdpZGdldFZpc2libGVgLCBzbyBtYWtlIHN1cmUgdG8gbm90IG92ZXJyaWRlIHRoZSBlZGl0b3IncyBrZXliaW5kaW5nXG5cdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMubmVnYXRlKCksXG5cdGtleWJpbmRpbmc6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlNwYWNlIH1cblx0fSxcblx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5hZGRvbj8udG9nZ2xlU3VnZ2VzdGlvbkZvY3VzKClcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5Ub2dnbGVEZXRhaWxzLFxuXHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN1Z2dlc3RUb2dnbGVEZXRhaWxzJywgJ1N1Z2dlc3QgVG9nZ2xlIERldGFpbHMnKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlLCBTaW1wbGVTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbiksXG5cdGtleWJpbmRpbmc6IHtcblx0XHQvLyBIQUNLOiBGb3JjZSB3ZWlnaHQgdG8gYmUgaGlnaGVyIHRoYW4gdGhhdCB0byBzdGFydCB0ZXJtaW5hbCBjaGF0XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkV4dGVybmFsRXh0ZW5zaW9uICsgMixcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU3BhY2UsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUldLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuU3BhY2UsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXSB9XG5cdH0sXG5cdHJ1bjogKGFjdGl2ZUluc3RhbmNlKSA9PiBUZXJtaW5hbFN1Z2dlc3RDb250cmlidXRpb24uZ2V0KGFjdGl2ZUluc3RhbmNlKT8uYWRkb24/LnRvZ2dsZVN1Z2dlc3Rpb25EZXRhaWxzKClcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5TZWxlY3ROZXh0UGFnZVN1Z2dlc3Rpb24sXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0TmV4dFBhZ2VTdWdnZXN0aW9uJywgJ1NlbGVjdCB0aGUgTmV4dCBQYWdlIFN1Z2dlc3Rpb24nKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuLCBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlKSxcblx0a2V5YmluZGluZzoge1xuXHRcdC8vIERvd24gaXMgYm91bmQgdG8gb3RoZXIgd29ya2JlbmNoIGtleWJpbmRpbmdzIHRoYXQgdGhpcyBuZWVkcyB0byBiZWF0XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlRG93bixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0fSxcblx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5hZGRvbj8uc2VsZWN0TmV4dFBhZ2VTdWdnZXN0aW9uKClcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5BY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24sXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uJywgJ0luc2VydCcpLFxuXHRmMTogZmFsc2UsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSwgVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cywgVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4sIFRlcm1pbmFsQ29udGV4dEtleXMuc3VnZ2VzdFdpZGdldFZpc2libGUpLFxuXHRrZXliaW5kaW5nOiBbe1xuXHRcdHByaW1hcnk6IEtleUNvZGUuVGFiLFxuXHRcdC8vIFRhYiBpcyBib3VuZCB0byBvdGhlciB3b3JrYmVuY2gga2V5YmluZGluZ3MgdGhhdCB0aGlzIG5lZWRzIHRvIGJlYXRcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNpbXBsZVN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uKVxuXHR9LFxuXHR7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHQvLyBFbnRlciBhY2NlcHRzIHdoZW46IGV4cGxpY2l0bHkgaW52b2tlZCAoY3RybCtzcGFjZSksIE9SIG5vdCBpbiBwYXJ0aWFsIG1vZGUsIE9SIG5vdCBmaXJzdCBzdWdnZXN0aW9uLCBPUiB1c2VyIGhhcyBuYXZpZ2F0ZWRcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2ltcGxlU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24sIENvbnRleHRLZXlFeHByLm9yKFNpbXBsZVN1Z2dlc3RDb250ZXh0LkV4cGxpY2l0bHlJbnZva2VkLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TZWxlY3Rpb25Nb2RlfWAsICdwYXJ0aWFsJyksIFNpbXBsZVN1Z2dlc3RDb250ZXh0LkZpcnN0U3VnZ2VzdGlvbkZvY3VzZWQudG9OZWdhdGVkKCksIFNpbXBsZVN1Z2dlc3RDb250ZXh0Lkhhc05hdmlnYXRlZCkpLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMVxuXHR9XSxcblx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5hZGRvbj8uYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKClcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5BY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb25FbnRlcixcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb25FbnRlcicsICdBY2NlcHQgU2VsZWN0ZWQgU3VnZ2VzdGlvbiAoRW50ZXIpJyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiwgVGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSksXG5cdGtleWJpbmRpbmc6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdC8vIEVudGVyIGlzIGJvdW5kIHRvIG90aGVyIHdvcmtiZW5jaCBrZXliaW5kaW5ncyB0aGF0IHRoaXMgbmVlZHMgdG8gYmVhdFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke1Rlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5SdW5PbkVudGVyfWAsICduZXZlcicpLFxuXHR9LFxuXHRydW46IGFzeW5jIChhY3RpdmVJbnN0YW5jZSkgPT4gVGVybWluYWxTdWdnZXN0Q29udHJpYnV0aW9uLmdldChhY3RpdmVJbnN0YW5jZSk/LmFkZG9uPy5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24odW5kZWZpbmVkLCB0cnVlKVxufSk7XG5cbnJlZ2lzdGVyQWN0aXZlSW5zdGFuY2VBY3Rpb24oe1xuXHRpZDogVGVybWluYWxTdWdnZXN0Q29tbWFuZElkLkhpZGVTdWdnZXN0V2lkZ2V0LFxuXHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmhpZGVTdWdnZXN0V2lkZ2V0JywgJ0hpZGUgU3VnZ2VzdCBXaWRnZXQnKSxcblx0ZjE6IGZhbHNlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksIFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ29udGV4dEtleXMuaXNPcGVuLCBUZXJtaW5hbENvbnRleHRLZXlzLnN1Z2dlc3RXaWRnZXRWaXNpYmxlKSxcblx0a2V5YmluZGluZzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdC8vIEVzY2FwZSBpcyBib3VuZCB0byBvdGhlciB3b3JrYmVuY2gga2V5YmluZGluZ3MgdGhhdCB0aGlzIG5lZWRzIHRvIGJlYXRcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0fSxcblx0cnVuOiAoYWN0aXZlSW5zdGFuY2UpID0+IFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5hZGRvbj8uaGlkZVN1Z2dlc3RXaWRnZXQodHJ1ZSlcbn0pO1xuXG5yZWdpc3RlckFjdGl2ZUluc3RhbmNlQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsU3VnZ2VzdENvbW1hbmRJZC5IaWRlU3VnZ2VzdFdpZGdldEFuZE5hdmlnYXRlSGlzdG9yeSxcblx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5oaWRlU3VnZ2VzdFdpZGdldEFuZE5hdmlnYXRlSGlzdG9yeScsICdIaWRlIFN1Z2dlc3QgV2lkZ2V0IGFuZCBOYXZpZ2F0ZSBIaXN0b3J5JyksXG5cdGYxOiBmYWxzZSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLCBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLCBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3BlbiwgVGVybWluYWxDb250ZXh0S2V5cy5zdWdnZXN0V2lkZ2V0VmlzaWJsZSksXG5cdGtleWJpbmRpbmc6XG5cdHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNpbXBsZVN1Z2dlc3RDb250ZXh0Lkhhc05hdmlnYXRlZC5uZWdhdGUoKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuVXBBcnJvd05hdmlnYXRlc0hpc3Rvcnl9YCwgdHJ1ZSkpLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMlxuXHR9LFxuXHRydW46IChhY3RpdmVJbnN0YW5jZSkgPT4ge1xuXHRcdFRlcm1pbmFsU3VnZ2VzdENvbnRyaWJ1dGlvbi5nZXQoYWN0aXZlSW5zdGFuY2UpPy5hZGRvbj8uaGlkZVN1Z2dlc3RXaWRnZXQodHJ1ZSk7XG5cdFx0YWN0aXZlSW5zdGFuY2Uuc2VuZFRleHQoJ1xcdTAwMWJbQScsIGZhbHNlKTsgLy8gVXAgYXJyb3dcblx0fVxufSk7XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBEeW5hbWljIFByb3ZpZGVycyBDb25maWd1cmF0aW9uXG5cbmNsYXNzIFRlcm1pbmFsU3VnZ2VzdFByb3ZpZGVyc0NvbmZpZ3VyYXRpb25NYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIF9pbnN0YW5jZTogVGVybWluYWxTdWdnZXN0UHJvdmlkZXJzQ29uZmlndXJhdGlvbk1hbmFnZXIgfCB1bmRlZmluZWQ7XG5cblx0c3RhdGljIGluaXRpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX2luc3RhbmNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTdWdnZXN0UHJvdmlkZXJzQ29uZmlndXJhdGlvbk1hbmFnZXIpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29udHJpYnV0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbnRyaWJ1dGlvblNlcnZpY2U6IElUZXJtaW5hbENvbnRyaWJ1dGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvdmlkZXJzKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxDb250cmlidXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXJzKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0Ly8gSW5pdGlhbCBjb25maWd1cmF0aW9uXG5cdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29uZmlndXJhdGlvbigpOiB2b2lkIHtcblx0XHQvLyBBZGQgc3RhdGljYWxseSBkZWNsYXJlZCBwcm92aWRlcnMgZnJvbSBwYWNrYWdlLmpzb24gY29udHJpYnV0aW9uc1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJVGVybWluYWxTdWdnZXN0UHJvdmlkZXJJbmZvPigpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ29udHJpYnV0aW9uU2VydmljZS50ZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcnMuZm9yRWFjaChvID0+IHByb3ZpZGVycy5zZXQoby5leHRlbnNpb25JZGVudGlmaWVyLCB7IC4uLm8sIGlkOiBvLmV4dGVuc2lvbklkZW50aWZpZXIgfSkpO1xuXG5cdFx0Ly8gQWRkIGR5bmFtaWNhbGx5IHJlZ2lzdGVyZWQgcHJvdmlkZXJzICh0aGF0IGFyZW4ndCBhbHJlYWR5IGRlY2xhcmVkIHN0YXRpY2FsbHkpXG5cdFx0Zm9yIChjb25zdCB7IGlkIH0gb2YgdGhpcy5fdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5wcm92aWRlcnMpIHtcblx0XHRcdGlmIChpZCAmJiAhcHJvdmlkZXJzLmhhcyhpZCkpIHtcblx0XHRcdFx0cHJvdmlkZXJzLnNldChpZCwgeyBpZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZWdpc3RlclRlcm1pbmFsU3VnZ2VzdFByb3ZpZGVyc0NvbmZpZ3VyYXRpb24ocHJvdmlkZXJzKTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFlBQVksU0FBUztBQUVyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxpQkFBaUIsbUJBQW1CLGNBQWMsWUFBWSxxQkFBcUI7QUFDNUYsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsOEJBQThCLDhCQUE4QjtBQUNyRSxTQUFTLG9DQUF1RTtBQUNoRixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhCQUE4QiwwQkFBOEQscURBQXdGO0FBQzdMLFNBQVMsNEJBQTRCLGlDQUFpQztBQUN0RSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQ0FBcUM7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
