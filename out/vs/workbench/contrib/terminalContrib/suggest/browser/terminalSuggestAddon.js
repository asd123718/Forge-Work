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
import { Emitter, Event } from "../../../../../base/common/event.js";
import { combinedDisposable, Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { commonPrefixLength } from "../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalStorageKeys } from "../../../terminal/common/terminalStorageKeys.js";
import { terminalSuggestConfigSection, TerminalSuggestSettingId, normalizeQuickSuggestionsConfig } from "../common/terminalSuggestConfiguration.js";
import { LineContext } from "../../../../services/suggest/browser/simpleCompletionModel.js";
import { SimpleSuggestWidget } from "../../../../services/suggest/browser/simpleSuggestWidget.js";
import { ITerminalCompletionService } from "./terminalCompletionService.js";
import { TerminalSettingId, PosixShellType, WindowsShellType, GeneralShellType, ITerminalLogService } from "../../../../../platform/terminal/common/terminal.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { createCancelablePromise, IntervalTimer, TimeoutTimer } from "../../../../../base/common/async.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { ITerminalConfigurationService } from "../../../terminal/browser/terminal.js";
import { GOLDEN_LINE_HEIGHT_RATIO } from "../../../../../editor/common/config/fontInfo.js";
import { TerminalCompletionModel } from "./terminalCompletionModel.js";
import { TerminalCompletionItem, TerminalCompletionItemKind } from "./terminalCompletionItem.js";
import { localize } from "../../../../../nls.js";
import { TerminalSuggestTelemetry } from "./terminalSuggestTelemetry.js";
import { terminalSymbolAliasIcon, terminalSymbolArgumentIcon, terminalSymbolEnumMember, terminalSymbolFileIcon, terminalSymbolFlagIcon, terminalSymbolInlineSuggestionIcon, terminalSymbolMethodIcon, terminalSymbolOptionIcon, terminalSymbolFolderIcon, terminalSymbolSymbolicLinkFileIcon, terminalSymbolSymbolicLinkFolderIcon, terminalSymbolCommitIcon, terminalSymbolBranchIcon, terminalSymbolTagIcon, terminalSymbolStashIcon, terminalSymbolRemoteIcon, terminalSymbolPullRequestIcon, terminalSymbolPullRequestDoneIcon, terminalSymbolSymbolTextIcon } from "./terminalSymbolIcons.js";
import { TerminalSuggestShownTracker } from "./terminalSuggestShownTracker.js";
import { SimpleSuggestDetailsPlacement } from "../../../../services/suggest/browser/simpleSuggestWidgetDetails.js";
import { isString } from "../../../../../base/common/types.js";
function isInlineCompletionSupported(shellType) {
  if (!shellType) {
    return false;
  }
  return shellType === PosixShellType.Bash || shellType === PosixShellType.Zsh || shellType === PosixShellType.Fish || shellType === GeneralShellType.PowerShell || shellType === WindowsShellType.GitBash;
}
let SuggestAddon = class extends Disposable {
  constructor(_sessionId, shellType, _capabilities, _terminalSuggestWidgetVisibleContextKey, _terminalCompletionService, _configurationService, _instantiationService, _terminalConfigurationService, _logService) {
    super();
    this._sessionId = _sessionId;
    this._capabilities = _capabilities;
    this._terminalSuggestWidgetVisibleContextKey = _terminalSuggestWidgetVisibleContextKey;
    this._terminalCompletionService = _terminalCompletionService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._logService = _logService;
    this._promptInputModelSubscriptions = this._register(new MutableDisposable());
    this._enableWidget = true;
    this._isFilteringDirectories = false;
    this._cursorIndexDelta = 0;
    this._requestedCompletionsIndex = 0;
    this._lastUserDataTimestamp = 0;
    this._ignoreFocusEvents = false;
    this._requestCompletionsOnNextSync = false;
    this.isPasting = false;
    this._onBell = this._register(new Emitter());
    this.onBell = this._onBell.event;
    this._onAcceptedCompletion = this._register(new Emitter());
    this.onAcceptedCompletion = this._onAcceptedCompletion.event;
    this._onDidReceiveCompletions = this._register(new Emitter());
    this.onDidReceiveCompletions = this._onDidReceiveCompletions.event;
    this._onDidFontConfigurationChange = this._register(new Emitter());
    this.onDidFontConfigurationChange = this._onDidFontConfigurationChange.event;
    this._kindToIconMap = /* @__PURE__ */ new Map([
      [TerminalCompletionItemKind.File, terminalSymbolFileIcon],
      [TerminalCompletionItemKind.Folder, terminalSymbolFolderIcon],
      [TerminalCompletionItemKind.SymbolicLinkFile, terminalSymbolSymbolicLinkFileIcon],
      [TerminalCompletionItemKind.SymbolicLinkFolder, terminalSymbolSymbolicLinkFolderIcon],
      [TerminalCompletionItemKind.Method, terminalSymbolMethodIcon],
      [TerminalCompletionItemKind.Alias, terminalSymbolAliasIcon],
      [TerminalCompletionItemKind.Argument, terminalSymbolArgumentIcon],
      [TerminalCompletionItemKind.Option, terminalSymbolOptionIcon],
      [TerminalCompletionItemKind.OptionValue, terminalSymbolEnumMember],
      [TerminalCompletionItemKind.Flag, terminalSymbolFlagIcon],
      [TerminalCompletionItemKind.Commit, terminalSymbolCommitIcon],
      [TerminalCompletionItemKind.Branch, terminalSymbolBranchIcon],
      [TerminalCompletionItemKind.Tag, terminalSymbolTagIcon],
      [TerminalCompletionItemKind.Stash, terminalSymbolStashIcon],
      [TerminalCompletionItemKind.Remote, terminalSymbolRemoteIcon],
      [TerminalCompletionItemKind.PullRequest, terminalSymbolPullRequestIcon],
      [TerminalCompletionItemKind.PullRequestDone, terminalSymbolPullRequestDoneIcon],
      [TerminalCompletionItemKind.InlineSuggestion, terminalSymbolInlineSuggestionIcon],
      [TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop, terminalSymbolInlineSuggestionIcon]
    ]);
    this._kindToKindLabelMap = /* @__PURE__ */ new Map([
      [TerminalCompletionItemKind.File, localize("file", "File")],
      [TerminalCompletionItemKind.Folder, localize("folder", "Folder")],
      [TerminalCompletionItemKind.SymbolicLinkFile, localize("symbolicLinkFile", "Symbolic Link File")],
      [TerminalCompletionItemKind.SymbolicLinkFolder, localize("symbolicLinkFolder", "Symbolic Link Folder")],
      [TerminalCompletionItemKind.Method, localize("method", "Method")],
      [TerminalCompletionItemKind.Alias, localize("alias", "Alias")],
      [TerminalCompletionItemKind.Argument, localize("argument", "Argument")],
      [TerminalCompletionItemKind.Option, localize("option", "Option")],
      [TerminalCompletionItemKind.OptionValue, localize("optionValue", "Option Value")],
      [TerminalCompletionItemKind.Flag, localize("flag", "Flag")],
      [TerminalCompletionItemKind.Commit, localize("commit", "Commit")],
      [TerminalCompletionItemKind.Branch, localize("branch", "Branch")],
      [TerminalCompletionItemKind.Tag, localize("tag", "Tag")],
      [TerminalCompletionItemKind.Stash, localize("stash", "Stash")],
      [TerminalCompletionItemKind.Remote, localize("remote", "Remote")],
      [TerminalCompletionItemKind.PullRequest, localize("pullRequest", "Pull Request")],
      [TerminalCompletionItemKind.PullRequestDone, localize("pullRequestDone", "Pull Request (Done)")],
      [TerminalCompletionItemKind.InlineSuggestion, localize("inlineSuggestion", "Inline Suggestion")],
      [TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop, localize("inlineSuggestionAlwaysOnTop", "Inline Suggestion")]
    ]);
    this._inlineCompletion = {
      label: "",
      // Right arrow is used to accept the completion. This is a common keybinding in pwsh, zsh
      // and fish.
      inputData: "\x1B[C",
      replacementRange: [0, 0],
      provider: "core:inlineSuggestion",
      detail: "Inline suggestion",
      kind: TerminalCompletionItemKind.InlineSuggestion,
      kindLabel: "Inline suggestion",
      icon: this._kindToIconMap.get(TerminalCompletionItemKind.InlineSuggestion)
    };
    this._inlineCompletionItem = new TerminalCompletionItem(this._inlineCompletion);
    this._shouldSyncWhenReady = false;
    this.shellType = shellType;
    if (this.shellType) {
      this._shellTypeInit = Promise.resolve();
    } else {
      const intervalTimer = this._register(new IntervalTimer());
      const timeoutTimer = this._register(new TimeoutTimer());
      this._shellTypeInit = new Promise((r) => {
        intervalTimer.cancelAndSet(() => {
          if (this.shellType) {
            r();
          }
        }, 50);
        timeoutTimer.cancelAndSet(r, 5e3);
      }).then(() => {
        this._store.delete(intervalTimer);
        this._store.delete(timeoutTimer);
      });
    }
    this._register(Event.runAndSubscribe(this._capabilities.onDidChangeCapabilities, () => {
      const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
      if (commandDetection) {
        if (this._promptInputModel !== commandDetection.promptInputModel) {
          this._promptInputModel = commandDetection.promptInputModel;
          this._suggestTelemetry = this._register(this._instantiationService.createInstance(TerminalSuggestTelemetry, commandDetection, this._promptInputModel));
          this._promptInputModelSubscriptions.value = combinedDisposable(
            this._promptInputModel.onDidChangeInput((e) => this._sync(e)),
            this._promptInputModel.onDidFinishInput(() => {
              this.hideSuggestWidget(true);
            })
          );
          if (this._shouldSyncWhenReady) {
            this._sync(this._promptInputModel);
            this._shouldSyncWhenReady = false;
          }
        }
      } else {
        this._promptInputModel = void 0;
      }
    }));
    this._register(this._terminalConfigurationService.onConfigChanged(() => this._cachedFontInfo = void 0));
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(TerminalSuggestSettingId.InlineSuggestion)) {
        const value = this._configurationService.getValue(terminalSuggestConfigSection).inlineSuggestion;
        this._inlineCompletionItem.isInvalid = value === "off";
        switch (value) {
          case "alwaysOnTopExceptExactMatch": {
            this._inlineCompletion.kind = TerminalCompletionItemKind.InlineSuggestion;
            break;
          }
          case "alwaysOnTop":
          default: {
            this._inlineCompletion.kind = TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop;
            break;
          }
        }
        this._model?.forceRefilterAll();
      }
    }));
  }
  activate(xterm) {
    this._terminal = xterm;
    this._register(xterm.onKey(async (e) => {
      this._lastUserData = e.key;
      this._lastUserDataTimestamp = Date.now();
    }));
    this._register(xterm.onScroll(() => this.hideSuggestWidget(true)));
    this._register(xterm.onResize(() => this._relayoutOnResize()));
  }
  async _handleCompletionProviders(terminal, token, explicitlyInvoked) {
    this._logService.trace("SuggestAddon#_handleCompletionProviders");
    if (!terminal?.element || !this._enableWidget || !this._promptInputModel) {
      return;
    }
    if (!dom.isAncestorOfActiveElement(terminal.element)) {
      return;
    }
    await this._shellTypeInit;
    let doNotRequestExtensionCompletions = false;
    if (this._promptInputModel.value !== "" && this._lastUserDataTimestamp < SuggestAddon.lastAcceptedCompletionTimestamp) {
      doNotRequestExtensionCompletions = true;
    }
    this._currentPromptInputState = {
      value: this._promptInputModel.value,
      prefix: this._promptInputModel.prefix,
      suffix: this._promptInputModel.suffix,
      cursorIndex: this._promptInputModel.cursorIndex,
      ghostTextIndex: this._promptInputModel.ghostTextIndex
    };
    this._requestedCompletionsIndex = this._currentPromptInputState.cursorIndex;
    if (explicitlyInvoked && this._container) {
      const suggestWidget = this._ensureSuggestWidget(terminal);
      const cursorPosition = this._getCursorPosition(terminal);
      if (cursorPosition) {
        suggestWidget.showTriggered(true, cursorPosition);
      }
    }
    const quickSuggestionsConfig = normalizeQuickSuggestionsConfig(this._configurationService.getValue(terminalSuggestConfigSection).quickSuggestions);
    const allowFallbackCompletions = explicitlyInvoked || quickSuggestionsConfig.unknown === "on";
    this._logService.trace("SuggestAddon#_handleCompletionProviders provideCompletions");
    const ghostTextIndex = this._mostRecentPromptInputState?.ghostTextIndex === void 0 ? -1 : this._mostRecentPromptInputState?.ghostTextIndex;
    const promptValue = ghostTextIndex > -1 ? this._currentPromptInputState.value.substring(0, ghostTextIndex) : this._currentPromptInputState.value;
    const providedCompletions = await this._terminalCompletionService.provideCompletions(promptValue, this._currentPromptInputState.cursorIndex, allowFallbackCompletions, this.shellType, this._capabilities, token, false, doNotRequestExtensionCompletions, explicitlyInvoked);
    this._logService.trace("SuggestAddon#_handleCompletionProviders provideCompletions done");
    if (token.isCancellationRequested) {
      return;
    }
    this._onDidReceiveCompletions.fire();
    this._cursorIndexDelta = this._promptInputModel.cursorIndex - this._requestedCompletionsIndex;
    this._leadingLineContent = this._promptInputModel.prefix.substring(0, this._requestedCompletionsIndex + this._cursorIndexDelta);
    const completions = providedCompletions?.flat() || [];
    if (!explicitlyInvoked && !completions.length) {
      this.hideSuggestWidget(true);
      return;
    }
    const firstChar = this._leadingLineContent.length === 0 ? "" : this._leadingLineContent[0];
    if (this._leadingLineContent.includes(" ") || firstChar === "[") {
      this._leadingLineContent = this._promptInputModel.prefix;
    }
    let normalizedLeadingLineContent = this._leadingLineContent;
    this._isFilteringDirectories = completions.some((e) => e.kind === TerminalCompletionItemKind.Folder);
    if (this._isFilteringDirectories) {
      const firstDir = completions.find((e) => e.kind === TerminalCompletionItemKind.Folder);
      const textLabel = isString(firstDir?.label) ? firstDir.label : firstDir?.label.label;
      const labelSep = textLabel?.match(/(?<sep>[\\\/])/)?.groups?.sep;
      if (labelSep) {
        this._pathSeparator = labelSep;
      }
      if (this._pathSeparator) {
        normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
      }
    }
    this._refreshInlineCompletion(completions);
    for (const completion of completions) {
      if (!completion.icon) {
        if (completion.kind !== void 0) {
          completion.icon = this._kindToIconMap.get(completion.kind);
          completion.kindLabel = this._kindToKindLabelMap.get(completion.kind);
        } else {
          completion.icon = terminalSymbolSymbolTextIcon;
        }
      }
    }
    const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
    const items = completions.filter((c) => !!c.label).map((c) => new TerminalCompletionItem(c, this._pathSeparator));
    if (isInlineCompletionSupported(this.shellType)) {
      items.push(this._inlineCompletionItem);
    }
    this._logService.trace("TerminalCompletionService#_collectCompletions create model");
    const model = new TerminalCompletionModel(
      items,
      lineContext
    );
    this._logService.trace("TerminalCompletionService#_collectCompletions create model done");
    if (token.isCancellationRequested) {
      this._completionRequestTimestamp = void 0;
      return;
    }
    this._showCompletions(model, explicitlyInvoked);
  }
  setContainerWithOverflow(container) {
    const containerChanged = this._container !== container;
    const parentChanged = this._suggestWidget?.element.domNode.parentElement !== container;
    if (!containerChanged && !parentChanged) {
      return;
    }
    this._container = container;
    if (this._suggestWidget) {
      container.appendChild(this._suggestWidget.element.domNode);
    }
  }
  setScreen(screen) {
    this._screen = screen;
  }
  toggleExplainMode() {
    this._suggestWidget?.toggleExplainMode();
  }
  toggleSuggestionFocus() {
    this._suggestWidget?.toggleDetailsFocus();
  }
  toggleSuggestionDetails() {
    this._suggestWidget?.toggleDetails();
  }
  resetWidgetSize() {
    this._suggestWidget?.resetWidgetSize();
  }
  async requestCompletions(explicitlyInvoked) {
    this._logService.trace("SuggestAddon#requestCompletions");
    if (!this._promptInputModel) {
      this._shouldSyncWhenReady = true;
      return;
    }
    if (this.isPasting) {
      return;
    }
    if (this._cancellationTokenSource) {
      this._cancellationTokenSource.cancel();
      this._cancellationTokenSource.dispose();
    }
    this._cancellationTokenSource = new CancellationTokenSource();
    const token = this._cancellationTokenSource.token;
    this._completionRequestTimestamp = Date.now();
    await this._handleCompletionProviders(this._terminal, token, explicitlyInvoked);
    if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
      this._completionRequestTimestamp = void 0;
    }
  }
  _addPropertiesToInlineCompletionItem(completions) {
    const inlineCompletionLabel = (isString(this._inlineCompletionItem.completion.label) ? this._inlineCompletionItem.completion.label : this._inlineCompletionItem.completion.label.label).trim();
    const inlineCompletionMatchIndex = completions.findIndex((c) => isString(c.label) ? c.label === inlineCompletionLabel : c.label.label === inlineCompletionLabel);
    if (inlineCompletionMatchIndex !== -1) {
      const richCompletionMatchingInline = completions.splice(inlineCompletionMatchIndex, 1)[0];
      this._inlineCompletionItem.completion.label = richCompletionMatchingInline.label;
      this._inlineCompletionItem.completion.detail = richCompletionMatchingInline.detail;
      this._inlineCompletionItem.completion.documentation = richCompletionMatchingInline.documentation;
    } else if (this._inlineCompletionItem.completion) {
      this._inlineCompletionItem.completion.detail = void 0;
      this._inlineCompletionItem.completion.documentation = void 0;
    }
  }
  _requestTriggerCharQuickSuggestCompletions() {
    if (!this._wasLastInputVerticalArrowKey() && !this._wasLastInputTabKey()) {
      if (!this._wasLastInputIncludedEscape() || this._terminalSuggestWidgetVisibleContextKey.get()) {
        this.requestCompletions();
        return true;
      }
    }
    return false;
  }
  _checkProviderTriggerCharacters(char) {
    for (const provider of this._terminalCompletionService.providers) {
      if (!provider.triggerCharacters) {
        continue;
      }
      for (const triggerChar of provider.triggerCharacters) {
        if (char === triggerChar) {
          return true;
        }
      }
    }
    return false;
  }
  _wasLastInputRightArrowKey() {
    return !!this._lastUserData?.match(/^\x1b[\[O]?C$/);
  }
  _wasLastInputVerticalArrowKey() {
    return !!this._lastUserData?.match(/^\x1b[\[O]?[A-B]$/);
  }
  /**
   * Whether the last input included the escape character. Typically this will mean it was more
   * than just a simple character, such as arrow keys, home, end, etc.
   */
  _wasLastInputIncludedEscape() {
    return !!this._lastUserData?.includes("\x1B");
  }
  _wasLastInputArrowKey() {
    return !!this._lastUserData?.match(/^\x1b[\[O]?[A-D]$/);
  }
  _wasLastInputTabKey() {
    return this._lastUserData === "	";
  }
  _sync(promptInputState) {
    const config = this._configurationService.getValue(terminalSuggestConfigSection);
    const quickSuggestions = normalizeQuickSuggestionsConfig(config.quickSuggestions);
    {
      let sent = false;
      if (this._requestCompletionsOnNextSync) {
        this._requestCompletionsOnNextSync = false;
        sent = this._requestTriggerCharQuickSuggestCompletions();
      }
      if (!this._mostRecentPromptInputState || promptInputState.cursorIndex > this._mostRecentPromptInputState.cursorIndex) {
        if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
          const commandLineHasSpace = promptInputState.prefix.trim().match(/\s/);
          if (!commandLineHasSpace && quickSuggestions.commands === "on" || commandLineHasSpace && quickSuggestions.arguments === "on") {
            if (promptInputState.prefix.match(/[^\s]$/)) {
              sent = this._requestTriggerCharQuickSuggestCompletions();
            }
          }
        }
        if (config.suggestOnTriggerCharacters && !sent) {
          const prefix = promptInputState.prefix;
          if (
            // Only trigger on `-` if it's after a space. This is required to not clear
            // completions when typing the `-` in `git cherry-pick`
            prefix?.match(/\s[\-]$/) || // Only trigger on `\` and `/` if it's a directory. Not doing so causes problems
            // with git branches in particular
            this._isFilteringDirectories && prefix?.match(/[\\\/]$/)
          ) {
            sent = this._requestTriggerCharQuickSuggestCompletions();
          }
          if (!sent) {
            for (const provider of this._terminalCompletionService.providers) {
              if (!provider.triggerCharacters) {
                continue;
              }
              for (const char of provider.triggerCharacters) {
                if (prefix?.endsWith(char)) {
                  sent = this._requestTriggerCharQuickSuggestCompletions();
                  break;
                }
              }
            }
          }
        }
      }
      if (this._mostRecentPromptInputState && promptInputState.cursorIndex < this._mostRecentPromptInputState.cursorIndex && promptInputState.cursorIndex > 0) {
        if (this._terminalSuggestWidgetVisibleContextKey.get()) {
          if (config.suggestOnTriggerCharacters && !sent && this._mostRecentPromptInputState.cursorIndex > 0) {
            const char = this._mostRecentPromptInputState.value[this._mostRecentPromptInputState.cursorIndex - 1];
            if (char && // Only trigger on `\` and `/` if it's a directory. Not doing so causes problems
            // with git branches in particular
            (this._isFilteringDirectories && char.match(/[\\\/]$/) || // Check if the character is a trigger character from providers
            this._checkProviderTriggerCharacters(char))) {
              sent = this._requestTriggerCharQuickSuggestCompletions();
            }
          }
        }
      }
    }
    if (this._wasLastInputRightArrowKey() && this._mostRecentPromptInputState?.ghostTextIndex !== -1 && promptInputState.ghostTextIndex === -1 && this._mostRecentPromptInputState?.value === promptInputState.value) {
      this.hideSuggestWidget(false);
    }
    this._mostRecentPromptInputState = promptInputState;
    if (!this._promptInputModel || !this._terminal || !this._suggestWidget || this._leadingLineContent === void 0) {
      return;
    }
    const previousPromptInputState = this._currentPromptInputState;
    this._currentPromptInputState = promptInputState;
    if (this._currentPromptInputState.cursorIndex > 1 && this._currentPromptInputState.value.at(this._currentPromptInputState.cursorIndex - 1) === " ") {
      if (!this._wasLastInputArrowKey()) {
        this.hideSuggestWidget(false);
        return;
      }
    }
    if (this._currentPromptInputState && this._currentPromptInputState.cursorIndex < this._leadingLineContent.length) {
      if (this._currentPromptInputState.cursorIndex <= 0 || previousPromptInputState?.value[this._currentPromptInputState.cursorIndex]?.match(/[\\\/\s]/)) {
        this.hideSuggestWidget(false);
        return;
      }
    }
    if (this._terminalSuggestWidgetVisibleContextKey.get()) {
      this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - this._requestedCompletionsIndex;
      let normalizedLeadingLineContent = this._currentPromptInputState.value.substring(0, this._requestedCompletionsIndex + this._cursorIndexDelta);
      if (this._isFilteringDirectories && this._pathSeparator) {
        normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
      }
      const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
      this._suggestWidget.setLineContext(lineContext);
    }
    this._refreshInlineCompletion(this._model?.items.map((i) => i.completion) || []);
    if (!this._suggestWidget.hasCompletions()) {
      this.hideSuggestWidget(false);
      return;
    }
    const cursorPosition = this._getCursorPosition(this._terminal);
    if (!cursorPosition) {
      return;
    }
    this._suggestWidget.showSuggestions(0, false, true, cursorPosition);
  }
  _refreshInlineCompletion(completions) {
    if (!isInlineCompletionSupported(this.shellType)) {
      return;
    }
    const oldIsInvalid = this._inlineCompletionItem.isInvalid;
    if (!this._currentPromptInputState || this._currentPromptInputState.ghostTextIndex === -1) {
      this._inlineCompletionItem.isInvalid = true;
    } else {
      this._inlineCompletionItem.isInvalid = false;
      const spaceIndex = this._currentPromptInputState.value.lastIndexOf(" ", this._currentPromptInputState.ghostTextIndex - 1);
      const replacementIndex = spaceIndex === -1 ? 0 : spaceIndex + 1;
      const suggestion = this._currentPromptInputState.value.substring(replacementIndex);
      this._inlineCompletion.label = suggestion;
      const end = this._currentPromptInputState.cursorIndex - this._cursorIndexDelta;
      this._inlineCompletion.replacementRange = [replacementIndex, end];
      this._addPropertiesToInlineCompletionItem(completions);
      const x = new TerminalCompletionItem(this._inlineCompletion, this._pathSeparator);
      this._inlineCompletionItem.idx = x.idx;
      this._inlineCompletionItem.score = x.score;
      this._inlineCompletionItem.labelLow = x.labelLow;
      this._inlineCompletionItem.textLabel = x.textLabel;
      this._inlineCompletionItem.fileExtLow = x.fileExtLow;
      this._inlineCompletionItem.labelLowExcludeFileExt = x.labelLowExcludeFileExt;
      this._inlineCompletionItem.labelLowNormalizedPath = x.labelLowNormalizedPath;
      this._inlineCompletionItem.punctuationPenalty = x.punctuationPenalty;
      this._inlineCompletionItem.word = x.word;
      this._model?.forceRefilterAll();
    }
    if (this._inlineCompletionItem.isInvalid !== oldIsInvalid) {
      this._model?.forceRefilterAll();
    }
  }
  _getTerminalDimensions() {
    const cssCellDims = this._terminal._core._renderService.dimensions.css.cell;
    return {
      width: cssCellDims.width,
      height: cssCellDims.height
    };
  }
  _getCursorPosition(terminal) {
    const dimensions = this._getTerminalDimensions();
    if (!dimensions.width || !dimensions.height) {
      return void 0;
    }
    const xtermBox = this._screen.getBoundingClientRect();
    return {
      left: xtermBox.left + terminal.buffer.active.cursorX * dimensions.width,
      top: xtermBox.top + terminal.buffer.active.cursorY * dimensions.height,
      height: dimensions.height
    };
  }
  _getFontInfo() {
    if (this._cachedFontInfo) {
      return this._cachedFontInfo;
    }
    const core = this._terminal._core;
    const font = this._terminalConfigurationService.getFont(dom.getActiveWindow(), core);
    let lineHeight = font.lineHeight;
    const fontSize = font.fontSize;
    const fontFamily = font.fontFamily;
    const letterSpacing = font.letterSpacing;
    const fontWeight = this._configurationService.getValue("editor.fontWeight");
    lineHeight = lineHeight * fontSize;
    lineHeight = Math.round(lineHeight);
    const minTerminalLineHeight = GOLDEN_LINE_HEIGHT_RATIO * fontSize;
    if (lineHeight < minTerminalLineHeight) {
      lineHeight = minTerminalLineHeight;
    }
    const fontInfo = {
      fontSize,
      lineHeight,
      fontWeight: fontWeight.toString(),
      letterSpacing,
      fontFamily
    };
    this._cachedFontInfo = fontInfo;
    return fontInfo;
  }
  _getAdvancedExplainModeDetails() {
    return `promptInputModel: ${this._promptInputModel?.getCombinedString()}`;
  }
  _showCompletions(model, explicitlyInvoked) {
    this._logService.trace("SuggestAddon#_showCompletions");
    if (!this._terminal?.element || !this._container) {
      return;
    }
    const suggestWidget = this._ensureSuggestWidget(this._terminal);
    this._logService.trace("SuggestAddon#_showCompletions setCompletionModel");
    suggestWidget.setCompletionModel(model);
    if (!this._promptInputModel || !explicitlyInvoked && model.items.length === 0) {
      return;
    }
    this._model = model;
    const cursorPosition = this._getCursorPosition(this._terminal);
    if (!cursorPosition) {
      return;
    }
    if (this._completionRequestTimestamp !== void 0) {
      const completionLatency = Date.now() - this._completionRequestTimestamp;
      if (this._suggestTelemetry && this._discoverability) {
        const firstShown = this._discoverability.getFirstShown(this.shellType);
        this._discoverability.updateShown();
        this._suggestTelemetry.logCompletionLatency(this._sessionId, completionLatency, firstShown);
      }
      this._completionRequestTimestamp = void 0;
    }
    this._logService.trace("SuggestAddon#_showCompletions suggestWidget.showSuggestions");
    suggestWidget.showSuggestions(0, false, !explicitlyInvoked, cursorPosition);
  }
  _ensureSuggestWidget(terminal) {
    if (!this._suggestWidget) {
      this._suggestWidget = this._register(this._instantiationService.createInstance(
        SimpleSuggestWidget,
        this._container,
        this._instantiationService.createInstance(PersistedWidgetSize),
        {
          statusBarMenuId: MenuId.MenubarTerminalSuggestStatusMenu,
          showStatusBarSettingId: TerminalSuggestSettingId.ShowStatusBar,
          selectionModeSettingId: TerminalSuggestSettingId.SelectionMode,
          preventDetailsPlacements: [SimpleSuggestDetailsPlacement.West]
        },
        this._getFontInfo.bind(this),
        this._onDidFontConfigurationChange.event.bind(this),
        this._getAdvancedExplainModeDetails.bind(this)
      ));
      this._register(this._suggestWidget.onDidSelect(async (e) => this.acceptSelectedSuggestion(e)));
      this._register(this._suggestWidget.onDidHide(() => this._terminalSuggestWidgetVisibleContextKey.reset()));
      this._register(this._suggestWidget.onDidShow(() => this._terminalSuggestWidgetVisibleContextKey.set(true)));
      this._register(this._suggestWidget.onDidFocus(() => this._terminal?.focus()));
      this._register(this._configurationService.onDidChangeConfiguration(
        (e) => {
          if (e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight) || e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration("editor.fontSize") || e.affectsConfiguration("editor.fontFamily")) {
            this._onDidFontConfigurationChange.fire();
          }
        }
      ));
      this._register(this._suggestWidget.onDidFocus(async (e) => {
        if (this._ignoreFocusEvents) {
          return;
        }
        const focusedItem = e.item;
        const focusedIndex = e.index;
        if (focusedItem === this._focusedItem) {
          return;
        }
        this._currentSuggestionDetails?.cancel();
        this._currentSuggestionDetails = void 0;
        this._focusedItem = focusedItem;
        if (focusedItem && (!focusedItem.completion.documentation || !focusedItem.completion.detail)) {
          this._currentSuggestionDetails = createCancelablePromise(async (token) => {
            try {
              await focusedItem.resolve(token);
            } catch (error) {
              this._logService.warn(`Failed to resolve suggestion details for item ${focusedItem} at index ${focusedIndex}`, error);
            }
          });
          this._currentSuggestionDetails.then(() => {
            if (focusedItem !== this._focusedItem || !this._suggestWidget?.list || focusedIndex >= this._suggestWidget.list.length) {
              return;
            }
            this._ignoreFocusEvents = true;
            this._suggestWidget.list.splice(focusedIndex, 1, [focusedItem]);
            this._suggestWidget.list.setFocus([focusedIndex]);
            this._ignoreFocusEvents = false;
          });
        }
      }));
      const element = this._terminal?.element?.querySelector(".xterm-helper-textarea");
      if (element) {
        this._register(dom.addDisposableListener(dom.getActiveDocument(), "click", (event) => {
          const target = event.target;
          if (this._terminal?.element?.contains(target)) {
            this._suggestWidget?.hide();
          }
        }));
      }
      this._register(this._suggestWidget.onDidShow(() => this._updateDiscoverabilityState()));
      this._register(this._suggestWidget.onDidBlurDetails((e) => {
        const elt = e.relatedTarget;
        if (this._terminal?.element?.contains(elt)) {
          return;
        }
        this._suggestWidget?.hide();
      }));
      this._terminalSuggestWidgetVisibleContextKey.set(false);
    }
    return this._suggestWidget;
  }
  _updateDiscoverabilityState() {
    if (!this._discoverability) {
      this._discoverability = this._register(this._instantiationService.createInstance(TerminalSuggestShownTracker, this.shellType));
    }
    if (!this._suggestWidget || this._discoverability?.done) {
      return;
    }
    this._discoverability?.update(this._suggestWidget.element.domNode);
  }
  resetDiscoverability() {
    this._discoverability?.resetState();
  }
  selectPreviousSuggestion() {
    this._suggestWidget?.selectPrevious();
  }
  selectPreviousPageSuggestion() {
    this._suggestWidget?.selectPreviousPage();
  }
  selectNextSuggestion() {
    this._suggestWidget?.selectNext();
  }
  selectNextPageSuggestion() {
    this._suggestWidget?.selectNextPage();
  }
  acceptSelectedSuggestion(suggestion, respectRunOnEnter) {
    if (!suggestion) {
      suggestion = this._suggestWidget?.getFocusedItem();
    }
    const initialPromptInputState = this._mostRecentPromptInputState;
    if (!suggestion?.item || !initialPromptInputState || this._leadingLineContent === void 0 || !this._model) {
      this._suggestTelemetry?.acceptCompletion(this._sessionId, void 0, this._mostRecentPromptInputState?.value);
      return;
    }
    SuggestAddon.lastAcceptedCompletionTimestamp = Date.now();
    this._suggestWidget?.hide();
    const currentPromptInputState = this._currentPromptInputState ?? initialPromptInputState;
    const startIndex = suggestion.item.completion.replacementRange?.[0] ?? currentPromptInputState.cursorIndex;
    const replacementText = currentPromptInputState.value.substring(startIndex, currentPromptInputState.cursorIndex);
    let rightSideReplacementText = "";
    if (
      // The line didn't end with ghost text
      (currentPromptInputState.ghostTextIndex === -1 || currentPromptInputState.ghostTextIndex > currentPromptInputState.cursorIndex) && // There is more than one charatcer
      currentPromptInputState.value.length > currentPromptInputState.cursorIndex + 1 && // THe next character is not a space
      currentPromptInputState.value.at(currentPromptInputState.cursorIndex) !== " "
    ) {
      const spaceIndex = currentPromptInputState.value.substring(currentPromptInputState.cursorIndex, currentPromptInputState.ghostTextIndex === -1 ? void 0 : currentPromptInputState.ghostTextIndex).indexOf(" ");
      rightSideReplacementText = currentPromptInputState.value.substring(currentPromptInputState.cursorIndex, spaceIndex === -1 ? void 0 : currentPromptInputState.cursorIndex + spaceIndex);
    }
    const completion = suggestion.item.completion;
    let resultSequence = completion.inputData;
    if (resultSequence === void 0) {
      let completionText = isString(completion.label) ? completion.label : completion.label.label;
      if ((completion.kind === TerminalCompletionItemKind.Folder || completion.isFileOverride) && completionText.includes(" ")) {
        completionText = completionText.replaceAll(" ", "\\ ");
      }
      let runOnEnter = false;
      if (respectRunOnEnter) {
        const runOnEnterConfig = this._configurationService.getValue(terminalSuggestConfigSection).runOnEnter;
        switch (runOnEnterConfig) {
          case "always": {
            runOnEnter = true;
            break;
          }
          case "exactMatch": {
            runOnEnter = replacementText.toLowerCase() === completionText.toLowerCase();
            break;
          }
          case "exactMatchIgnoreExtension": {
            runOnEnter = replacementText.toLowerCase() === completionText.toLowerCase();
            if (completion.isFileOverride) {
              runOnEnter ||= replacementText.toLowerCase() === completionText.toLowerCase().replace(/\.[^\.]+$/, "");
            }
            break;
          }
        }
      }
      const commonPrefixLen = commonPrefixLength(replacementText, completionText);
      const commonPrefix = replacementText.substring(replacementText.length - 1 - commonPrefixLen, replacementText.length - 1);
      const completionSuffix = completionText.substring(commonPrefixLen);
      if (currentPromptInputState.suffix.length > 0 && currentPromptInputState.prefix.endsWith(commonPrefix) && currentPromptInputState.suffix.startsWith(completionSuffix)) {
        resultSequence = "\x1BOC".repeat(completionText.length - commonPrefixLen);
      } else {
        resultSequence = [
          // Backspace (left) to remove all additional input
          "\x7F".repeat(replacementText.length - commonPrefixLen),
          // Delete (right) to remove any additional text in the same word
          "\x1B[3~".repeat(rightSideReplacementText.length),
          // Write the completion
          completionSuffix,
          // Run on enter if needed
          runOnEnter ? "\r" : ""
        ].join("");
      }
    }
    if (completion.kind === TerminalCompletionItemKind.Folder) {
      SuggestAddon.lastAcceptedCompletionTimestamp = 0;
    }
    const config = this._configurationService.getValue(terminalSuggestConfigSection);
    if (config.insertTrailingSpace && completion.kind !== TerminalCompletionItemKind.Folder && completion.kind !== TerminalCompletionItemKind.SymbolicLinkFolder) {
      resultSequence += " ";
      this._lastUserDataTimestamp = Date.now();
      this._requestCompletionsOnNextSync = true;
    }
    this._onAcceptedCompletion.fire(resultSequence);
    this._suggestTelemetry?.acceptCompletion(this._sessionId, completion, this._mostRecentPromptInputState?.value);
    this.hideSuggestWidget(true);
  }
  hideSuggestWidget(cancelAnyRequest) {
    this._discoverability?.resetTimer();
    if (cancelAnyRequest) {
      this._cancellationTokenSource?.dispose(true);
      this._cancellationTokenSource = void 0;
      this._currentSuggestionDetails?.cancel();
      this._currentSuggestionDetails = void 0;
    }
    this._currentPromptInputState = void 0;
    this._leadingLineContent = void 0;
    this._focusedItem = void 0;
    this._suggestWidget?.hide();
  }
  _relayoutOnResize() {
    if (!this._terminalSuggestWidgetVisibleContextKey.get() || !this._terminal) {
      return;
    }
    const cursorPosition = this._getCursorPosition(this._terminal);
    if (!cursorPosition) {
      this.hideSuggestWidget(true);
      return;
    }
    this._suggestWidget?.relayout(cursorPosition);
  }
};
SuggestAddon.lastAcceptedCompletionTimestamp = 0;
SuggestAddon = __decorateClass([
  __decorateParam(4, ITerminalCompletionService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITerminalConfigurationService),
  __decorateParam(8, ITerminalLogService)
], SuggestAddon);
let PersistedWidgetSize = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    this._key = TerminalStorageKeys.TerminalSuggestSize;
  }
  restore() {
    const raw = this._storageService.get(this._key, StorageScope.PROFILE) ?? "";
    try {
      const obj = JSON.parse(raw);
      if (dom.Dimension.is(obj)) {
        return dom.Dimension.lift(obj);
      }
    } catch {
    }
    return void 0;
  }
  store(size) {
    this._storageService.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  reset() {
    this._storageService.remove(this._key, StorageScope.PROFILE);
  }
};
PersistedWidgetSize = __decorateClass([
  __decorateParam(0, IStorageService)
], PersistedWidgetSize);
function normalizePathSeparator(path, sep) {
  if (sep === "/") {
    return path.replaceAll("\\", "/");
  }
  return path.replaceAll("/", "\\");
}
export {
  SuggestAddon,
  isInlineCompletionSupported,
  normalizePathSeparator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3VnZ2VzdFxcYnJvd3NlclxcdGVybWluYWxTdWdnZXN0QWRkb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEFkZG9uLCBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29tbW9uUHJlZml4TGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHksIHR5cGUgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvbXB0SW5wdXRNb2RlbCwgSVByb21wdElucHV0TW9kZWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbi9wcm9tcHRJbnB1dE1vZGVsLmpzJztcbmltcG9ydCB0eXBlIHsgSVh0ZXJtQ29yZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIveHRlcm0tcHJpdmF0ZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0b3JhZ2VLZXlzIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHsgdGVybWluYWxTdWdnZXN0Q29uZmlnU2VjdGlvbiwgVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLCBub3JtYWxpemVRdWlja1N1Z2dlc3Rpb25zQ29uZmlnLCB0eXBlIElUZXJtaW5hbFN1Z2dlc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3VnZ2VzdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTGluZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlQ29tcGxldGlvbk1vZGVsLmpzJztcbmltcG9ydCB7IElTaW1wbGVTZWxlY3RlZFN1Z2dlc3Rpb24sIFNpbXBsZVN1Z2dlc3RXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlU3VnZ2VzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB9IGZyb20gJy4vdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFNldHRpbmdJZCwgVGVybWluYWxTaGVsbFR5cGUsIFBvc2l4U2hlbGxUeXBlLCBXaW5kb3dzU2hlbGxUeXBlLCBHZW5lcmFsU2hlbGxUeXBlLCBJVGVybWluYWxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgQ2FuY2VsYWJsZVByb21pc2UsIEludGVydmFsVGltZXIsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElTaW1wbGVTdWdnZXN0V2lkZ2V0Rm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlU3VnZ2VzdFdpZGdldFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBHT0xERU5fTElORV9IRUlHSFRfUkFUSU8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbCB9IGZyb20gJy4vdGVybWluYWxDb21wbGV0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21wbGV0aW9uSXRlbSwgVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQsIHR5cGUgSVRlcm1pbmFsQ29tcGxldGlvbiB9IGZyb20gJy4vdGVybWluYWxDb21wbGV0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN1Z2dlc3RUZWxlbWV0cnkgfSBmcm9tICcuL3Rlcm1pbmFsU3VnZ2VzdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFN5bWJvbEFsaWFzSWNvbiwgdGVybWluYWxTeW1ib2xBcmd1bWVudEljb24sIHRlcm1pbmFsU3ltYm9sRW51bU1lbWJlciwgdGVybWluYWxTeW1ib2xGaWxlSWNvbiwgdGVybWluYWxTeW1ib2xGbGFnSWNvbiwgdGVybWluYWxTeW1ib2xJbmxpbmVTdWdnZXN0aW9uSWNvbiwgdGVybWluYWxTeW1ib2xNZXRob2RJY29uLCB0ZXJtaW5hbFN5bWJvbE9wdGlvbkljb24sIHRlcm1pbmFsU3ltYm9sRm9sZGVySWNvbiwgdGVybWluYWxTeW1ib2xTeW1ib2xpY0xpbmtGaWxlSWNvbiwgdGVybWluYWxTeW1ib2xTeW1ib2xpY0xpbmtGb2xkZXJJY29uLCB0ZXJtaW5hbFN5bWJvbENvbW1pdEljb24sIHRlcm1pbmFsU3ltYm9sQnJhbmNoSWNvbiwgdGVybWluYWxTeW1ib2xUYWdJY29uLCB0ZXJtaW5hbFN5bWJvbFN0YXNoSWNvbiwgdGVybWluYWxTeW1ib2xSZW1vdGVJY29uLCB0ZXJtaW5hbFN5bWJvbFB1bGxSZXF1ZXN0SWNvbiwgdGVybWluYWxTeW1ib2xQdWxsUmVxdWVzdERvbmVJY29uLCB0ZXJtaW5hbFN5bWJvbFN5bWJvbFRleHRJY29uIH0gZnJvbSAnLi90ZXJtaW5hbFN5bWJvbEljb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3VnZ2VzdFNob3duVHJhY2tlciB9IGZyb20gJy4vdGVybWluYWxTdWdnZXN0U2hvd25UcmFja2VyLmpzJztcbmltcG9ydCB7IFNpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc3VnZ2VzdC9icm93c2VyL3NpbXBsZVN1Z2dlc3RXaWRnZXREZXRhaWxzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdWdnZXN0Q29udHJvbGxlciB7XG5cdGlzUGFzdGluZzogYm9vbGVhbjtcblx0c2VsZWN0UHJldmlvdXNTdWdnZXN0aW9uKCk6IHZvaWQ7XG5cdHNlbGVjdFByZXZpb3VzUGFnZVN1Z2dlc3Rpb24oKTogdm9pZDtcblx0c2VsZWN0TmV4dFN1Z2dlc3Rpb24oKTogdm9pZDtcblx0c2VsZWN0TmV4dFBhZ2VTdWdnZXN0aW9uKCk6IHZvaWQ7XG5cdGFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihzdWdnZXN0aW9uPzogUGljazxJU2ltcGxlU2VsZWN0ZWRTdWdnZXN0aW9uPFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0+LCAnaXRlbScgfCAnbW9kZWwnPik6IHZvaWQ7XG5cdGhpZGVTdWdnZXN0V2lkZ2V0KGNhbmNlbEFueVJlcXVlc3RzOiBib29sZWFuLCB3YXNDbG9zZWRCeVVzZXI/OiBib29sZWFuKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSW5saW5lQ29tcGxldGlvblN1cHBvcnRlZChzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghc2hlbGxUeXBlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBzaGVsbFR5cGUgPT09IFBvc2l4U2hlbGxUeXBlLkJhc2ggfHxcblx0XHRzaGVsbFR5cGUgPT09IFBvc2l4U2hlbGxUeXBlLlpzaCB8fFxuXHRcdHNoZWxsVHlwZSA9PT0gUG9zaXhTaGVsbFR5cGUuRmlzaCB8fFxuXHRcdHNoZWxsVHlwZSA9PT0gR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsIHx8XG5cdFx0c2hlbGxUeXBlID09PSBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2g7XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0QWRkb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsQWRkb24sIElTdWdnZXN0Q29udHJvbGxlciB7XG5cdHByaXZhdGUgX3Rlcm1pbmFsPzogVGVybWluYWw7XG5cblx0cHJpdmF0ZSBfcHJvbXB0SW5wdXRNb2RlbD86IElQcm9tcHRJbnB1dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRJbnB1dE1vZGVsU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF9tb3N0UmVjZW50UHJvbXB0SW5wdXRTdGF0ZT86IElQcm9tcHRJbnB1dE1vZGVsU3RhdGU7XG5cdHByaXZhdGUgX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlPzogSVByb21wdElucHV0TW9kZWxTdGF0ZTtcblx0cHJpdmF0ZSBfbW9kZWw/OiBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbDtcblxuXHRwcml2YXRlIF9jb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc2NyZWVuPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3N1Z2dlc3RXaWRnZXQ/OiBTaW1wbGVTdWdnZXN0V2lkZ2V0PFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsLCBUZXJtaW5hbENvbXBsZXRpb25JdGVtPjtcblx0cHJpdmF0ZSBfY2FjaGVkRm9udEluZm86IElTaW1wbGVTdWdnZXN0V2lkZ2V0Rm9udEluZm8gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VuYWJsZVdpZGdldDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX3BhdGhTZXBhcmF0b3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNGaWx0ZXJpbmdEaXJlY3RvcmllczogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdC8vIFRPRE86IFJlbW92ZSB0aGVzZSBpbiBmYXZvciBvZiBwcm9tcHQgaW5wdXQgc3RhdGVcblx0cHJpdmF0ZSBfbGVhZGluZ0xpbmVDb250ZW50Pzogc3RyaW5nO1xuXHRwcml2YXRlIF9jdXJzb3JJbmRleERlbHRhOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9yZXF1ZXN0ZWRDb21wbGV0aW9uc0luZGV4OiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX2xhc3RVc2VyRGF0YT86IHN0cmluZztcblx0c3RhdGljIGxhc3RBY2NlcHRlZENvbXBsZXRpb25UaW1lc3RhbXA6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2xhc3RVc2VyRGF0YVRpbWVzdGFtcDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZGlzY292ZXJhYmlsaXR5OiBUZXJtaW5hbFN1Z2dlc3RTaG93blRyYWNrZXIgfCB1bmRlZmluZWQ7XG5cblx0Ly8gVGVybWluYWwgc3VnZ2VzdCByZXNvbHV0aW9uIHRyYWNraW5nIChzaW1pbGFyIHRvIGVkaXRvcidzIHN1Z2dlc3Qgd2lkZ2V0KVxuXHRwcml2YXRlIF9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/OiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfZm9jdXNlZEl0ZW0/OiBUZXJtaW5hbENvbXBsZXRpb25JdGVtO1xuXHRwcml2YXRlIF9pZ25vcmVGb2N1c0V2ZW50czogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9yZXF1ZXN0Q29tcGxldGlvbnNPbk5leHRTeW5jOiBib29sZWFuID0gZmFsc2U7XG5cblx0aXNQYXN0aW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NoZWxsVHlwZUluaXQ6IFByb21pc2U8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWxsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVsbCA9IHRoaXMuX29uQmVsbC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25BY2NlcHRlZENvbXBsZXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkFjY2VwdGVkQ29tcGxldGlvbiA9IHRoaXMuX29uQWNjZXB0ZWRDb21wbGV0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVDb21wbGV0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlY2VpdmVDb21wbGV0aW9ucyA9IHRoaXMuX29uRGlkUmVjZWl2ZUNvbXBsZXRpb25zLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvbnRDb25maWd1cmF0aW9uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9udENvbmZpZ3VyYXRpb25DaGFuZ2UgPSB0aGlzLl9vbkRpZEZvbnRDb25maWd1cmF0aW9uQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2tpbmRUb0ljb25NYXAgPSBuZXcgTWFwPG51bWJlciwgVGhlbWVJY29uPihbXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsIHRlcm1pbmFsU3ltYm9sRmlsZUljb25dLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsIHRlcm1pbmFsU3ltYm9sRm9sZGVySWNvbl0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlN5bWJvbGljTGlua0ZpbGUsIHRlcm1pbmFsU3ltYm9sU3ltYm9saWNMaW5rRmlsZUljb25dLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5TeW1ib2xpY0xpbmtGb2xkZXIsIHRlcm1pbmFsU3ltYm9sU3ltYm9saWNMaW5rRm9sZGVySWNvbl0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCwgdGVybWluYWxTeW1ib2xNZXRob2RJY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQWxpYXMsIHRlcm1pbmFsU3ltYm9sQWxpYXNJY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIHRlcm1pbmFsU3ltYm9sQXJndW1lbnRJY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuT3B0aW9uLCB0ZXJtaW5hbFN5bWJvbE9wdGlvbkljb25dLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5PcHRpb25WYWx1ZSwgdGVybWluYWxTeW1ib2xFbnVtTWVtYmVyXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmxhZywgdGVybWluYWxTeW1ib2xGbGFnSWNvbl0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkNvbW1pdCwgdGVybWluYWxTeW1ib2xDb21taXRJY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQnJhbmNoLCB0ZXJtaW5hbFN5bWJvbEJyYW5jaEljb25dLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5UYWcsIHRlcm1pbmFsU3ltYm9sVGFnSWNvbl0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlN0YXNoLCB0ZXJtaW5hbFN5bWJvbFN0YXNoSWNvbl0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlJlbW90ZSwgdGVybWluYWxTeW1ib2xSZW1vdGVJY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuUHVsbFJlcXVlc3QsIHRlcm1pbmFsU3ltYm9sUHVsbFJlcXVlc3RJY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuUHVsbFJlcXVlc3REb25lLCB0ZXJtaW5hbFN5bWJvbFB1bGxSZXF1ZXN0RG9uZUljb25dLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5JbmxpbmVTdWdnZXN0aW9uLCB0ZXJtaW5hbFN5bWJvbElubGluZVN1Z2dlc3Rpb25JY29uXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbkFsd2F5c09uVG9wLCB0ZXJtaW5hbFN5bWJvbElubGluZVN1Z2dlc3Rpb25JY29uXSxcblx0XSk7XG5cblx0cHJpdmF0ZSBfa2luZFRvS2luZExhYmVsTWFwID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oW1xuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlLCBsb2NhbGl6ZSgnZmlsZScsICdGaWxlJyldLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsIGxvY2FsaXplKCdmb2xkZXInLCAnRm9sZGVyJyldLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5TeW1ib2xpY0xpbmtGaWxlLCBsb2NhbGl6ZSgnc3ltYm9saWNMaW5rRmlsZScsICdTeW1ib2xpYyBMaW5rIEZpbGUnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlN5bWJvbGljTGlua0ZvbGRlciwgbG9jYWxpemUoJ3N5bWJvbGljTGlua0ZvbGRlcicsICdTeW1ib2xpYyBMaW5rIEZvbGRlcicpXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kLCBsb2NhbGl6ZSgnbWV0aG9kJywgJ01ldGhvZCcpXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQWxpYXMsIGxvY2FsaXplKCdhbGlhcycsICdBbGlhcycpXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxvY2FsaXplKCdhcmd1bWVudCcsICdBcmd1bWVudCcpXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuT3B0aW9uLCBsb2NhbGl6ZSgnb3B0aW9uJywgJ09wdGlvbicpXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuT3B0aW9uVmFsdWUsIGxvY2FsaXplKCdvcHRpb25WYWx1ZScsICdPcHRpb24gVmFsdWUnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZsYWcsIGxvY2FsaXplKCdmbGFnJywgJ0ZsYWcnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkNvbW1pdCwgbG9jYWxpemUoJ2NvbW1pdCcsICdDb21taXQnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkJyYW5jaCwgbG9jYWxpemUoJ2JyYW5jaCcsICdCcmFuY2gnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlRhZywgbG9jYWxpemUoJ3RhZycsICdUYWcnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlN0YXNoLCBsb2NhbGl6ZSgnc3Rhc2gnLCAnU3Rhc2gnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlJlbW90ZSwgbG9jYWxpemUoJ3JlbW90ZScsICdSZW1vdGUnKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLlB1bGxSZXF1ZXN0LCBsb2NhbGl6ZSgncHVsbFJlcXVlc3QnLCAnUHVsbCBSZXF1ZXN0JyldLFxuXHRcdFtUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5QdWxsUmVxdWVzdERvbmUsIGxvY2FsaXplKCdwdWxsUmVxdWVzdERvbmUnLCAnUHVsbCBSZXF1ZXN0IChEb25lKScpXSxcblx0XHRbVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbiwgbG9jYWxpemUoJ2lubGluZVN1Z2dlc3Rpb24nLCAnSW5saW5lIFN1Z2dlc3Rpb24nKV0sXG5cdFx0W1Rlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLklubGluZVN1Z2dlc3Rpb25BbHdheXNPblRvcCwgbG9jYWxpemUoJ2lubGluZVN1Z2dlc3Rpb25BbHdheXNPblRvcCcsICdJbmxpbmUgU3VnZ2VzdGlvbicpXSxcblx0XSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lQ29tcGxldGlvbjogSVRlcm1pbmFsQ29tcGxldGlvbiA9IHtcblx0XHRsYWJlbDogJycsXG5cdFx0Ly8gUmlnaHQgYXJyb3cgaXMgdXNlZCB0byBhY2NlcHQgdGhlIGNvbXBsZXRpb24uIFRoaXMgaXMgYSBjb21tb24ga2V5YmluZGluZyBpbiBwd3NoLCB6c2hcblx0XHQvLyBhbmQgZmlzaC5cblx0XHRpbnB1dERhdGE6ICdcXHgxYltDJyxcblx0XHRyZXBsYWNlbWVudFJhbmdlOiBbMCwgMF0sXG5cdFx0cHJvdmlkZXI6ICdjb3JlOmlubGluZVN1Z2dlc3Rpb24nLFxuXHRcdGRldGFpbDogJ0lubGluZSBzdWdnZXN0aW9uJyxcblx0XHRraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5JbmxpbmVTdWdnZXN0aW9uLFxuXHRcdGtpbmRMYWJlbDogJ0lubGluZSBzdWdnZXN0aW9uJyxcblx0XHRpY29uOiB0aGlzLl9raW5kVG9JY29uTWFwLmdldChUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5JbmxpbmVTdWdnZXN0aW9uKSxcblx0fTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lQ29tcGxldGlvbkl0ZW0gPSBuZXcgVGVybWluYWxDb21wbGV0aW9uSXRlbSh0aGlzLl9pbmxpbmVDb21wbGV0aW9uKTtcblxuXHRwcml2YXRlIF9zaG91bGRTeW5jV2hlblJlYWR5OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3N1Z2dlc3RUZWxlbWV0cnk6IFRlcm1pbmFsU3VnZ2VzdFRlbGVtZXRyeSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jb21wbGV0aW9uUmVxdWVzdFRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nLFxuXHRcdHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FwYWJpbGl0aWVzOiBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTdWdnZXN0V2lkZ2V0VmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+LFxuXHRcdEBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBzaGVsbCB0eXBlLCBpbmNsdWRpbmcgYSBwcm9taXNlIHRoYXQgY29tcGxldGlvbnMgY2FuIGF3YWl0IGZvciB0aGF0IHJlc29sdmVzOlxuXHRcdC8vIC0gaW1tZWRpYXRlbHkgaWYgc2hlbGwgdHlwZVxuXHRcdC8vIC0gYWZ0ZXIgYSBzaG9ydCBkZWxheSBpZiBzaGVsbCB0eXBlIGdldHMgc2V0XG5cdFx0Ly8gLSBhZnRlciBhIGxvbmcgZGVsYXkgaWYgaXQgZG9lc24ndCBnZXQgc2V0XG5cdFx0dGhpcy5zaGVsbFR5cGUgPSBzaGVsbFR5cGU7XG5cdFx0aWYgKHRoaXMuc2hlbGxUeXBlKSB7XG5cdFx0XHR0aGlzLl9zaGVsbFR5cGVJbml0ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGludGVydmFsVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJ2YWxUaW1lcigpKTtcblx0XHRcdGNvbnN0IHRpbWVvdXRUaW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaW1lb3V0VGltZXIoKSk7XG5cdFx0XHR0aGlzLl9zaGVsbFR5cGVJbml0ID0gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7XG5cdFx0XHRcdGludGVydmFsVGltZXIuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5zaGVsbFR5cGUpIHtcblx0XHRcdFx0XHRcdHIoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDUwKTtcblx0XHRcdFx0dGltZW91dFRpbWVyLmNhbmNlbEFuZFNldChyLCA1MDAwKTtcblx0XHRcdH0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUoaW50ZXJ2YWxUaW1lcik7XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZSh0aW1lb3V0VGltZXIpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2NhcGFiaWxpdGllcy5vbkRpZENoYW5nZUNhcGFiaWxpdGllcywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHRoaXMuX2NhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdFx0aWYgKGNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0aWYgKHRoaXMuX3Byb21wdElucHV0TW9kZWwgIT09IGNvbW1hbmREZXRlY3Rpb24ucHJvbXB0SW5wdXRNb2RlbCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWwgPSBjb21tYW5kRGV0ZWN0aW9uLnByb21wdElucHV0TW9kZWw7XG5cdFx0XHRcdFx0dGhpcy5fc3VnZ2VzdFRlbGVtZXRyeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU3VnZ2VzdFRlbGVtZXRyeSwgY29tbWFuZERldGVjdGlvbiwgdGhpcy5fcHJvbXB0SW5wdXRNb2RlbCkpO1xuXHRcdFx0XHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWxTdWJzY3JpcHRpb25zLnZhbHVlID0gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0XHRcdFx0dGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5vbkRpZENoYW5nZUlucHV0KGUgPT4gdGhpcy5fc3luYyhlKSksXG5cdFx0XHRcdFx0XHR0aGlzLl9wcm9tcHRJbnB1dE1vZGVsLm9uRGlkRmluaXNoSW5wdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhpZGVTdWdnZXN0V2lkZ2V0KHRydWUpO1xuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAodGhpcy5fc2hvdWxkU3luY1doZW5SZWFkeSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3luYyh0aGlzLl9wcm9tcHRJbnB1dE1vZGVsKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3VsZFN5bmNXaGVuUmVhZHkgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2Uub25Db25maWdDaGFuZ2VkKCgpID0+IHRoaXMuX2NhY2hlZEZvbnRJbmZvID0gdW5kZWZpbmVkKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiB7XG5cdFx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFN1Z2dlc3RTZXR0aW5nSWQuSW5saW5lU3VnZ2VzdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxTdWdnZXN0Q29uZmlndXJhdGlvbj4odGVybWluYWxTdWdnZXN0Q29uZmlnU2VjdGlvbikuaW5saW5lU3VnZ2VzdGlvbjtcblx0XHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uaXNJbnZhbGlkID0gdmFsdWUgPT09ICdvZmYnO1xuXHRcdFx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnYWx3YXlzT25Ub3BFeGNlcHRFeGFjdE1hdGNoJzoge1xuXHRcdFx0XHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbi5raW5kID0gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdhbHdheXNPblRvcCc6XG5cdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbi5raW5kID0gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbkFsd2F5c09uVG9wO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX21vZGVsPy5mb3JjZVJlZmlsdGVyQWxsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YWN0aXZhdGUoeHRlcm06IFRlcm1pbmFsKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWwgPSB4dGVybTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5vbktleShhc3luYyBlID0+IHtcblx0XHRcdHRoaXMuX2xhc3RVc2VyRGF0YSA9IGUua2V5O1xuXHRcdFx0dGhpcy5fbGFzdFVzZXJEYXRhVGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeHRlcm0ub25TY3JvbGwoKCkgPT4gdGhpcy5oaWRlU3VnZ2VzdFdpZGdldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLm9uUmVzaXplKCgpID0+IHRoaXMuX3JlbGF5b3V0T25SZXNpemUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29tcGxldGlvblByb3ZpZGVycyh0ZXJtaW5hbDogVGVybWluYWwgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZXhwbGljaXRseUludm9rZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnU3VnZ2VzdEFkZG9uI19oYW5kbGVDb21wbGV0aW9uUHJvdmlkZXJzJyk7XG5cblx0XHQvLyBOb3RoaW5nIHRvIGhhbmRsZSBpZiB0aGUgdGVybWluYWwgaXMgbm90IGF0dGFjaGVkXG5cdFx0aWYgKCF0ZXJtaW5hbD8uZWxlbWVudCB8fCAhdGhpcy5fZW5hYmxlV2lkZ2V0IHx8ICF0aGlzLl9wcm9tcHRJbnB1dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBzaG93IHRoZSBzdWdnZXN0IHdpZGdldCBpZiB0aGUgdGVybWluYWwgaXMgZm9jdXNlZFxuXHRcdGlmICghZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGVybWluYWwuZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgc2hlbGwgdHlwZSB0byBpbml0aWFsaXplLiBUaGlzIHdpbGwgd2FpdCBhIHNob3J0IHBlcmlvZCBhZnRlciBsYXVuY2hpbmcgdG9cblx0XHQvLyBhbGxvdyB0aGUgc2hlbGwgdHlwZSB0byBiZSBzZXQgaWYgcG9zc2libGUuIFRoaXMgcHJldmVudHMgdXNlciByZXF1ZXN0cyBzb21ldGltZXMgZ2V0dGluZ1xuXHRcdC8vIGxvc3QgaWYgcmVxdWVzdGVkIHNob3J0bHkgYWZ0ZXIgdGhlIHRlcm1pbmFsIGlzIGNyZWF0ZWQuIENvbXBsZXRpb24gcHJvdmlkZXJzIGNhbiBzdGlsbFxuXHRcdC8vIHdvcmsgd2l0aCB1bmRlZmluZWQgc2hlbGwgdHlwZXMgc3VjaCBhcyBQc2V1ZG90ZXJtaW5hbC1iYXNlZCBleHRlbnNpb24gdGVybWluYWxzLlxuXHRcdGF3YWl0IHRoaXMuX3NoZWxsVHlwZUluaXQ7XG5cblx0XHRsZXQgZG9Ob3RSZXF1ZXN0RXh0ZW5zaW9uQ29tcGxldGlvbnMgPSBmYWxzZTtcblx0XHQvLyBFbnN1cmUgdGhhdCBhIGtleSBoYXMgYmVlbiBwcmVzc2VkIHNpbmNlIHRoZSBsYXN0IGFjY2VwdGVkIGNvbXBsZXRpb24gaW4gb3JkZXIgdG8gcHJldmVudFxuXHRcdC8vIGNvbXBsZXRpb25zIGJlaW5nIHJlcXVlc3RlZCBhZ2FpbiByaWdodCBhZnRlciBhY2NlcHRpbmcgYSBjb21wbGV0aW9uXG5cdFx0aWYgKHRoaXMuX3Byb21wdElucHV0TW9kZWwudmFsdWUgIT09ICcnICYmIHRoaXMuX2xhc3RVc2VyRGF0YVRpbWVzdGFtcCA8IFN1Z2dlc3RBZGRvbi5sYXN0QWNjZXB0ZWRDb21wbGV0aW9uVGltZXN0YW1wKSB7XG5cdFx0XHRkb05vdFJlcXVlc3RFeHRlbnNpb25Db21wbGV0aW9ucyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudFByb21wdElucHV0U3RhdGUgPSB7XG5cdFx0XHR2YWx1ZTogdGhpcy5fcHJvbXB0SW5wdXRNb2RlbC52YWx1ZSxcblx0XHRcdHByZWZpeDogdGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5wcmVmaXgsXG5cdFx0XHRzdWZmaXg6IHRoaXMuX3Byb21wdElucHV0TW9kZWwuc3VmZml4LFxuXHRcdFx0Y3Vyc29ySW5kZXg6IHRoaXMuX3Byb21wdElucHV0TW9kZWwuY3Vyc29ySW5kZXgsXG5cdFx0XHRnaG9zdFRleHRJbmRleDogdGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5naG9zdFRleHRJbmRleFxuXHRcdH07XG5cdFx0dGhpcy5fcmVxdWVzdGVkQ29tcGxldGlvbnNJbmRleCA9IHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmN1cnNvckluZGV4O1xuXG5cdFx0Ly8gU2hvdyBsb2FkaW5nIGluZGljYXRvciBiZWZvcmUgbWFraW5nIGFzeW5jIGNvbXBsZXRpb24gcmVxdWVzdCAob25seSBmb3IgZXhwbGljaXQgaW52b2NhdGlvbnMpXG5cdFx0aWYgKGV4cGxpY2l0bHlJbnZva2VkICYmIHRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0Y29uc3Qgc3VnZ2VzdFdpZGdldCA9IHRoaXMuX2Vuc3VyZVN1Z2dlc3RXaWRnZXQodGVybWluYWwpO1xuXHRcdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSB0aGlzLl9nZXRDdXJzb3JQb3NpdGlvbih0ZXJtaW5hbCk7XG5cdFx0XHRpZiAoY3Vyc29yUG9zaXRpb24pIHtcblx0XHRcdFx0c3VnZ2VzdFdpZGdldC5zaG93VHJpZ2dlcmVkKHRydWUsIGN1cnNvclBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBxdWlja1N1Z2dlc3Rpb25zQ29uZmlnID0gbm9ybWFsaXplUXVpY2tTdWdnZXN0aW9uc0NvbmZpZyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxTdWdnZXN0Q29uZmlndXJhdGlvbj4odGVybWluYWxTdWdnZXN0Q29uZmlnU2VjdGlvbikucXVpY2tTdWdnZXN0aW9ucyk7XG5cdFx0Y29uc3QgYWxsb3dGYWxsYmFja0NvbXBsZXRpb25zID0gZXhwbGljaXRseUludm9rZWQgfHwgcXVpY2tTdWdnZXN0aW9uc0NvbmZpZy51bmtub3duID09PSAnb24nO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1N1Z2dlc3RBZGRvbiNfaGFuZGxlQ29tcGxldGlvblByb3ZpZGVycyBwcm92aWRlQ29tcGxldGlvbnMnKTtcblx0XHQvLyBUcmltIGdob3N0IHRleHQgZnJvbSB0aGUgcHJvbXB0IHZhbHVlIHdoZW4gcmVxdWVzdGluZyBjb21wbGV0aW9uc1xuXHRcdGNvbnN0IGdob3N0VGV4dEluZGV4ID0gdGhpcy5fbW9zdFJlY2VudFByb21wdElucHV0U3RhdGU/Lmdob3N0VGV4dEluZGV4ID09PSB1bmRlZmluZWQgPyAtMSA6IHRoaXMuX21vc3RSZWNlbnRQcm9tcHRJbnB1dFN0YXRlPy5naG9zdFRleHRJbmRleDtcblx0XHRjb25zdCBwcm9tcHRWYWx1ZSA9IGdob3N0VGV4dEluZGV4ID4gLTEgPyB0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5zdWJzdHJpbmcoMCwgZ2hvc3RUZXh0SW5kZXgpIDogdGhpcy5fY3VycmVudFByb21wdElucHV0U3RhdGUudmFsdWU7XG5cdFx0Y29uc3QgcHJvdmlkZWRDb21wbGV0aW9ucyA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucHJvdmlkZUNvbXBsZXRpb25zKHByb21wdFZhbHVlLCB0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleCwgYWxsb3dGYWxsYmFja0NvbXBsZXRpb25zLCB0aGlzLnNoZWxsVHlwZSwgdGhpcy5fY2FwYWJpbGl0aWVzLCB0b2tlbiwgZmFsc2UsIGRvTm90UmVxdWVzdEV4dGVuc2lvbkNvbXBsZXRpb25zLCBleHBsaWNpdGx5SW52b2tlZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnU3VnZ2VzdEFkZG9uI19oYW5kbGVDb21wbGV0aW9uUHJvdmlkZXJzIHByb3ZpZGVDb21wbGV0aW9ucyBkb25lJyk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRSZWNlaXZlQ29tcGxldGlvbnMuZmlyZSgpO1xuXG5cdFx0dGhpcy5fY3Vyc29ySW5kZXhEZWx0YSA9IHRoaXMuX3Byb21wdElucHV0TW9kZWwuY3Vyc29ySW5kZXggLSB0aGlzLl9yZXF1ZXN0ZWRDb21wbGV0aW9uc0luZGV4O1xuXHRcdHRoaXMuX2xlYWRpbmdMaW5lQ29udGVudCA9IHRoaXMuX3Byb21wdElucHV0TW9kZWwucHJlZml4LnN1YnN0cmluZygwLCB0aGlzLl9yZXF1ZXN0ZWRDb21wbGV0aW9uc0luZGV4ICsgdGhpcy5fY3Vyc29ySW5kZXhEZWx0YSk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IHByb3ZpZGVkQ29tcGxldGlvbnM/LmZsYXQoKSB8fCBbXTtcblx0XHRpZiAoIWV4cGxpY2l0bHlJbnZva2VkICYmICFjb21wbGV0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuaGlkZVN1Z2dlc3RXaWRnZXQodHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RDaGFyID0gdGhpcy5fbGVhZGluZ0xpbmVDb250ZW50Lmxlbmd0aCA9PT0gMCA/ICcnIDogdGhpcy5fbGVhZGluZ0xpbmVDb250ZW50WzBdO1xuXHRcdC8vIFRoaXMgaXMgYSBUYWJFeHBhbnNpb24yIHJlc3VsdFxuXHRcdGlmICh0aGlzLl9sZWFkaW5nTGluZUNvbnRlbnQuaW5jbHVkZXMoJyAnKSB8fCBmaXJzdENoYXIgPT09ICdbJykge1xuXHRcdFx0dGhpcy5fbGVhZGluZ0xpbmVDb250ZW50ID0gdGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5wcmVmaXg7XG5cdFx0fVxuXG5cdFx0bGV0IG5vcm1hbGl6ZWRMZWFkaW5nTGluZUNvbnRlbnQgPSB0aGlzLl9sZWFkaW5nTGluZUNvbnRlbnQ7XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBhIHNpbmdsZSBkaXJlY3RvcnkgaW4gdGhlIGNvbXBsZXRpb25zOlxuXHRcdC8vIC0gYFxcYCBhbmQgYC9gIGFyZSBub3JtYWxpemVkIHN1Y2ggdGhhdCBlaXRoZXIgY2FuIGJlIHVzZWRcblx0XHQvLyAtIFVzaW5nIGBcXGAgb3IgYC9gIHdpbGwgcmVxdWVzdCBuZXcgY29tcGxldGlvbnMuIEl0J3MgaW1wb3J0YW50IHRoYXQgdGhpcyBvbmx5IG9jY3Vyc1xuXHRcdC8vICAgd2hlbiBhIGRpcmVjdG9yeSBpcyBwcmVzZW50LCBpZiBub3QgY29tcGxldGlvbnMgbGlrZSBnaXQgYnJhbmNoZXMgY291bGQgYmUgcmVxdWVzdGVkXG5cdFx0Ly8gICB3aGljaCBsZWFkcyB0byBmbGlja2VyaW5nXG5cdFx0dGhpcy5faXNGaWx0ZXJpbmdEaXJlY3RvcmllcyA9IGNvbXBsZXRpb25zLnNvbWUoZSA9PiBlLmtpbmQgPT09IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcik7XG5cdFx0aWYgKHRoaXMuX2lzRmlsdGVyaW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdGNvbnN0IGZpcnN0RGlyID0gY29tcGxldGlvbnMuZmluZChlID0+IGUua2luZCA9PT0gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyKTtcblx0XHRcdGNvbnN0IHRleHRMYWJlbCA9IGlzU3RyaW5nKGZpcnN0RGlyPy5sYWJlbCkgPyBmaXJzdERpci5sYWJlbCA6IGZpcnN0RGlyPy5sYWJlbC5sYWJlbDtcblx0XHRcdC8vIEdldCBwYXRoIHNlcGFyYXRvciBmcm9tIHRoZSBjb21wbGV0aW9uIGxhYmVsLCB3aGljaCBpcyBjb21pbmcgZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdGNvbnN0IGxhYmVsU2VwID0gdGV4dExhYmVsPy5tYXRjaCgvKD88c2VwPltcXFxcXFwvXSkvKT8uZ3JvdXBzPy5zZXA7XG5cdFx0XHRpZiAobGFiZWxTZXApIHtcblx0XHRcdFx0dGhpcy5fcGF0aFNlcGFyYXRvciA9IGxhYmVsU2VwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BhdGhTZXBhcmF0b3IpIHtcblx0XHRcdFx0bm9ybWFsaXplZExlYWRpbmdMaW5lQ29udGVudCA9IG5vcm1hbGl6ZVBhdGhTZXBhcmF0b3Iobm9ybWFsaXplZExlYWRpbmdMaW5lQ29udGVudCwgdGhpcy5fcGF0aFNlcGFyYXRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGFueSBcImdob3N0IHRleHRcIiBzdWdnZXN0aW9uIHN1Z2dlc3RlZCBieSB0aGUgc2hlbGwuIFRoaXMgYWxpZ25zIHdpdGggYmVoYXZpb3Igb2YgdGhlXG5cdFx0Ly8gZWRpdG9yIGFuZCBob3cgaXQgaW50ZXJhY3RzIHdpdGggaW5saW5lIGNvbXBsZXRpb25zLiBUaGlzIG9iamVjdCBpcyB0cmFja2VkIGFuZCByZXVzZWQgYXNcblx0XHQvLyBpdCBtYXkgY2hhbmdlIG9uIGlucHV0LlxuXHRcdHRoaXMuX3JlZnJlc2hJbmxpbmVDb21wbGV0aW9uKGNvbXBsZXRpb25zKTtcblxuXHRcdC8vIEFkZCBhbnkgbWlzc2luZyBpY29ucyBiYXNlZCBvbiB0aGUgY29tcGxldGlvbiBpdGVtIGtpbmRcblx0XHRmb3IgKGNvbnN0IGNvbXBsZXRpb24gb2YgY29tcGxldGlvbnMpIHtcblx0XHRcdGlmICghY29tcGxldGlvbi5pY29uKSB7XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uLmtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbXBsZXRpb24uaWNvbiA9IHRoaXMuX2tpbmRUb0ljb25NYXAuZ2V0KGNvbXBsZXRpb24ua2luZCk7XG5cdFx0XHRcdFx0Y29tcGxldGlvbi5raW5kTGFiZWwgPSB0aGlzLl9raW5kVG9LaW5kTGFiZWxNYXAuZ2V0KGNvbXBsZXRpb24ua2luZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29tcGxldGlvbi5pY29uID0gdGVybWluYWxTeW1ib2xTeW1ib2xUZXh0SWNvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVDb250ZXh0ID0gbmV3IExpbmVDb250ZXh0KG5vcm1hbGl6ZWRMZWFkaW5nTGluZUNvbnRlbnQsIHRoaXMuX2N1cnNvckluZGV4RGVsdGEpO1xuXHRcdGNvbnN0IGl0ZW1zID0gY29tcGxldGlvbnMuZmlsdGVyKGMgPT4gISFjLmxhYmVsKS5tYXAoYyA9PiBuZXcgVGVybWluYWxDb21wbGV0aW9uSXRlbShjLCB0aGlzLl9wYXRoU2VwYXJhdG9yKSk7XG5cdFx0aWYgKGlzSW5saW5lQ29tcGxldGlvblN1cHBvcnRlZCh0aGlzLnNoZWxsVHlwZSkpIHtcblx0XHRcdGl0ZW1zLnB1c2godGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UjX2NvbGxlY3RDb21wbGV0aW9ucyBjcmVhdGUgbW9kZWwnKTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChcblx0XHRcdGl0ZW1zLFxuXHRcdFx0bGluZUNvbnRleHRcblx0XHQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UjX2NvbGxlY3RDb21wbGV0aW9ucyBjcmVhdGUgbW9kZWwgZG9uZScpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uUmVxdWVzdFRpbWVzdGFtcCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zaG93Q29tcGxldGlvbnMobW9kZWwsIGV4cGxpY2l0bHlJbnZva2VkKTtcblx0fVxuXG5cdHNldENvbnRhaW5lcldpdGhPdmVyZmxvdyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyQ2hhbmdlZCA9IHRoaXMuX2NvbnRhaW5lciAhPT0gY29udGFpbmVyO1xuXHRcdGNvbnN0IHBhcmVudENoYW5nZWQgPSB0aGlzLl9zdWdnZXN0V2lkZ2V0Py5lbGVtZW50LmRvbU5vZGUucGFyZW50RWxlbWVudCAhPT0gY29udGFpbmVyO1xuXHRcdGlmICghY29udGFpbmVyQ2hhbmdlZCAmJiAhcGFyZW50Q2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0aWYgKHRoaXMuX3N1Z2dlc3RXaWRnZXQpIHtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9zdWdnZXN0V2lkZ2V0LmVsZW1lbnQuZG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0U2NyZWVuKHNjcmVlbjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JlZW4gPSBzY3JlZW47XG5cdH1cblxuXHR0b2dnbGVFeHBsYWluTW9kZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdWdnZXN0V2lkZ2V0Py50b2dnbGVFeHBsYWluTW9kZSgpO1xuXHR9XG5cblx0dG9nZ2xlU3VnZ2VzdGlvbkZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1Z2dlc3RXaWRnZXQ/LnRvZ2dsZURldGFpbHNGb2N1cygpO1xuXHR9XG5cblx0dG9nZ2xlU3VnZ2VzdGlvbkRldGFpbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8udG9nZ2xlRGV0YWlscygpO1xuXHR9XG5cblx0cmVzZXRXaWRnZXRTaXplKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1Z2dlc3RXaWRnZXQ/LnJlc2V0V2lkZ2V0U2l6ZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdENvbXBsZXRpb25zKGV4cGxpY2l0bHlJbnZva2VkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1N1Z2dlc3RBZGRvbiNyZXF1ZXN0Q29tcGxldGlvbnMnKTtcblx0XHRpZiAoIXRoaXMuX3Byb21wdElucHV0TW9kZWwpIHtcblx0XHRcdHRoaXMuX3Nob3VsZFN5bmNXaGVuUmVhZHkgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzUGFzdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpIHtcblx0XHRcdHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW47XG5cblx0XHQvLyBUcmFjayB0aGUgdGltZSB3aGVuIGNvbXBsZXRpb25zIGFyZSByZXF1ZXN0ZWRcblx0XHR0aGlzLl9jb21wbGV0aW9uUmVxdWVzdFRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cblx0XHRhd2FpdCB0aGlzLl9oYW5kbGVDb21wbGV0aW9uUHJvdmlkZXJzKHRoaXMuX3Rlcm1pbmFsLCB0b2tlbiwgZXhwbGljaXRseUludm9rZWQpO1xuXG5cdFx0Ly8gSWYgY29tcGxldGlvbnMgYXJlIG5vdCBzaG93biAod2lkZ2V0IG5vdCB2aXNpYmxlKSwgcmVzZXQgdGhlIHRyYWNrZXJcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsU3VnZ2VzdFdpZGdldFZpc2libGVDb250ZXh0S2V5LmdldCgpKSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uUmVxdWVzdFRpbWVzdGFtcCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRQcm9wZXJ0aWVzVG9JbmxpbmVDb21wbGV0aW9uSXRlbShjb21wbGV0aW9uczogSVRlcm1pbmFsQ29tcGxldGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5saW5lQ29tcGxldGlvbkxhYmVsID0gKGlzU3RyaW5nKHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLmNvbXBsZXRpb24ubGFiZWwpID8gdGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uY29tcGxldGlvbi5sYWJlbCA6IHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLmNvbXBsZXRpb24ubGFiZWwubGFiZWwpLnRyaW0oKTtcblx0XHRjb25zdCBpbmxpbmVDb21wbGV0aW9uTWF0Y2hJbmRleCA9IGNvbXBsZXRpb25zLmZpbmRJbmRleChjID0+IGlzU3RyaW5nKGMubGFiZWwpID8gYy5sYWJlbCA9PT0gaW5saW5lQ29tcGxldGlvbkxhYmVsIDogYy5sYWJlbC5sYWJlbCA9PT0gaW5saW5lQ29tcGxldGlvbkxhYmVsKTtcblx0XHRpZiAoaW5saW5lQ29tcGxldGlvbk1hdGNoSW5kZXggIT09IC0xKSB7XG5cdFx0XHQvLyBSZW1vdmUgdGhlIGV4aXN0aW5nIGlubGluZSBjb21wbGV0aW9uIGl0ZW0gZnJvbSB0aGUgY29tcGxldGlvbnMgbGlzdFxuXHRcdFx0Y29uc3QgcmljaENvbXBsZXRpb25NYXRjaGluZ0lubGluZSA9IGNvbXBsZXRpb25zLnNwbGljZShpbmxpbmVDb21wbGV0aW9uTWF0Y2hJbmRleCwgMSlbMF07XG5cdFx0XHQvLyBBcHBseSBpdHMgcHJvcGVydGllcyB0byB0aGUgaW5saW5lIGNvbXBsZXRpb24gaXRlbVxuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uY29tcGxldGlvbi5sYWJlbCA9IHJpY2hDb21wbGV0aW9uTWF0Y2hpbmdJbmxpbmUubGFiZWw7XG5cdFx0XHR0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbS5jb21wbGV0aW9uLmRldGFpbCA9IHJpY2hDb21wbGV0aW9uTWF0Y2hpbmdJbmxpbmUuZGV0YWlsO1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uY29tcGxldGlvbi5kb2N1bWVudGF0aW9uID0gcmljaENvbXBsZXRpb25NYXRjaGluZ0lubGluZS5kb2N1bWVudGF0aW9uO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uY29tcGxldGlvbikge1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uY29tcGxldGlvbi5kZXRhaWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbS5jb21wbGV0aW9uLmRvY3VtZW50YXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWVzdFRyaWdnZXJDaGFyUXVpY2tTdWdnZXN0Q29tcGxldGlvbnMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl93YXNMYXN0SW5wdXRWZXJ0aWNhbEFycm93S2V5KCkgJiYgIXRoaXMuX3dhc0xhc3RJbnB1dFRhYktleSgpKSB7XG5cdFx0XHQvLyBPbmx5IHJlcXVlc3Qgb24gdHJpZ2dlciBjaGFyYWN0ZXIgd2hlbiBpdCdzIGEgcmVndWxhciBpbnB1dCwgb3Igb24gYW4gYXJyb3cgaWYgdGhlIHdpZGdldFxuXHRcdFx0Ly8gaXMgYWxyZWFkeSB2aXNpYmxlXG5cdFx0XHRpZiAoIXRoaXMuX3dhc0xhc3RJbnB1dEluY2x1ZGVkRXNjYXBlKCkgfHwgdGhpcy5fdGVybWluYWxTdWdnZXN0V2lkZ2V0VmlzaWJsZUNvbnRleHRLZXkuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5yZXF1ZXN0Q29tcGxldGlvbnMoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrUHJvdmlkZXJUcmlnZ2VyQ2hhcmFjdGVycyhjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnRyaWdnZXJDaGFyYWN0ZXJzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0cmlnZ2VyQ2hhciBvZiBwcm92aWRlci50cmlnZ2VyQ2hhcmFjdGVycykge1xuXHRcdFx0XHRpZiAoY2hhciA9PT0gdHJpZ2dlckNoYXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF93YXNMYXN0SW5wdXRSaWdodEFycm93S2V5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2xhc3RVc2VyRGF0YT8ubWF0Y2goL15cXHgxYltcXFtPXT9DJC8pO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FzTGFzdElucHV0VmVydGljYWxBcnJvd0tleSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9sYXN0VXNlckRhdGE/Lm1hdGNoKC9eXFx4MWJbXFxbT10/W0EtQl0kLyk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgbGFzdCBpbnB1dCBpbmNsdWRlZCB0aGUgZXNjYXBlIGNoYXJhY3Rlci4gVHlwaWNhbGx5IHRoaXMgd2lsbCBtZWFuIGl0IHdhcyBtb3JlXG5cdCAqIHRoYW4ganVzdCBhIHNpbXBsZSBjaGFyYWN0ZXIsIHN1Y2ggYXMgYXJyb3cga2V5cywgaG9tZSwgZW5kLCBldGMuXG5cdCAqL1xuXHRwcml2YXRlIF93YXNMYXN0SW5wdXRJbmNsdWRlZEVzY2FwZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9sYXN0VXNlckRhdGE/LmluY2x1ZGVzKCdcXHgxYicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FzTGFzdElucHV0QXJyb3dLZXkoKTogYm9vbGVhbiB7XG5cdFx0Ly8gTmV2ZXIgcmVxdWVzdCBjb21wbGV0aW9ucyBpZiB0aGUgbGFzdCBrZXkgc2VxdWVuY2Ugd2FzIHVwIG9yIGRvd24gYXMgdGhlIHVzZXIgd2FzIGxpa2VseVxuXHRcdC8vIG5hdmlnYXRpbmcgaGlzdG9yeVxuXHRcdHJldHVybiAhIXRoaXMuX2xhc3RVc2VyRGF0YT8ubWF0Y2goL15cXHgxYltcXFtPXT9bQS1EXSQvKTtcblx0fVxuXG5cdHByaXZhdGUgX3dhc0xhc3RJbnB1dFRhYktleSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFVzZXJEYXRhID09PSAnXFx0Jztcblx0fVxuXG5cdHByaXZhdGUgX3N5bmMocHJvbXB0SW5wdXRTdGF0ZTogSVByb21wdElucHV0TW9kZWxTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbFN1Z2dlc3RDb25maWd1cmF0aW9uPih0ZXJtaW5hbFN1Z2dlc3RDb25maWdTZWN0aW9uKTtcblx0XHRjb25zdCBxdWlja1N1Z2dlc3Rpb25zID0gbm9ybWFsaXplUXVpY2tTdWdnZXN0aW9uc0NvbmZpZyhjb25maWcucXVpY2tTdWdnZXN0aW9ucyk7XG5cdFx0e1xuXHRcdFx0bGV0IHNlbnQgPSBmYWxzZTtcblxuXHRcdFx0Ly8gSWYgY29tcGxldGlvbnMgd2VyZSByZXF1ZXN0ZWQgZnJvbSB0aGUgYWRkb25cblx0XHRcdGlmICh0aGlzLl9yZXF1ZXN0Q29tcGxldGlvbnNPbk5leHRTeW5jKSB7XG5cdFx0XHRcdHRoaXMuX3JlcXVlc3RDb21wbGV0aW9uc09uTmV4dFN5bmMgPSBmYWxzZTtcblx0XHRcdFx0c2VudCA9IHRoaXMuX3JlcXVlc3RUcmlnZ2VyQ2hhclF1aWNrU3VnZ2VzdENvbXBsZXRpb25zKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBjdXJzb3IgbW92ZWQgdG8gdGhlIHJpZ2h0XG5cdFx0XHRpZiAoIXRoaXMuX21vc3RSZWNlbnRQcm9tcHRJbnB1dFN0YXRlIHx8IHByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXggPiB0aGlzLl9tb3N0UmVjZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleCkge1xuXHRcdFx0XHQvLyBRdWljayBzdWdnZXN0aW9ucyAtIFRyaWdnZXIgd2hlbmV2ZXIgYSBuZXcgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVyIGlzIHVzZWRcblx0XHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hbFN1Z2dlc3RXaWRnZXRWaXNpYmxlQ29udGV4dEtleS5nZXQoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lSGFzU3BhY2UgPSBwcm9tcHRJbnB1dFN0YXRlLnByZWZpeC50cmltKCkubWF0Y2goL1xccy8pO1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdCghY29tbWFuZExpbmVIYXNTcGFjZSAmJiBxdWlja1N1Z2dlc3Rpb25zLmNvbW1hbmRzID09PSAnb24nKSB8fFxuXHRcdFx0XHRcdFx0KGNvbW1hbmRMaW5lSGFzU3BhY2UgJiYgcXVpY2tTdWdnZXN0aW9ucy5hcmd1bWVudHMgPT09ICdvbicpXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRpZiAocHJvbXB0SW5wdXRTdGF0ZS5wcmVmaXgubWF0Y2goL1teXFxzXSQvKSkge1xuXHRcdFx0XHRcdFx0XHRzZW50ID0gdGhpcy5fcmVxdWVzdFRyaWdnZXJDaGFyUXVpY2tTdWdnZXN0Q29tcGxldGlvbnMoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUcmlnZ2VyIGNoYXJhY3RlcnMgLSB0aGlzIGhhcHBlbnMgZXZlbiBpZiB0aGUgd2lkZ2V0IGlzIHNob3dpbmdcblx0XHRcdFx0aWYgKGNvbmZpZy5zdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycyAmJiAhc2VudCkge1xuXHRcdFx0XHRcdGNvbnN0IHByZWZpeCA9IHByb21wdElucHV0U3RhdGUucHJlZml4O1xuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdC8vIE9ubHkgdHJpZ2dlciBvbiBgLWAgaWYgaXQncyBhZnRlciBhIHNwYWNlLiBUaGlzIGlzIHJlcXVpcmVkIHRvIG5vdCBjbGVhclxuXHRcdFx0XHRcdFx0Ly8gY29tcGxldGlvbnMgd2hlbiB0eXBpbmcgdGhlIGAtYCBpbiBgZ2l0IGNoZXJyeS1waWNrYFxuXHRcdFx0XHRcdFx0cHJlZml4Py5tYXRjaCgvXFxzW1xcLV0kLykgfHxcblx0XHRcdFx0XHRcdC8vIE9ubHkgdHJpZ2dlciBvbiBgXFxgIGFuZCBgL2AgaWYgaXQncyBhIGRpcmVjdG9yeS4gTm90IGRvaW5nIHNvIGNhdXNlcyBwcm9ibGVtc1xuXHRcdFx0XHRcdFx0Ly8gd2l0aCBnaXQgYnJhbmNoZXMgaW4gcGFydGljdWxhclxuXHRcdFx0XHRcdFx0dGhpcy5faXNGaWx0ZXJpbmdEaXJlY3RvcmllcyAmJiBwcmVmaXg/Lm1hdGNoKC9bXFxcXFxcL10kLylcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdHNlbnQgPSB0aGlzLl9yZXF1ZXN0VHJpZ2dlckNoYXJRdWlja1N1Z2dlc3RDb21wbGV0aW9ucygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXNlbnQpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5wcm92aWRlcnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKCFwcm92aWRlci50cmlnZ2VyQ2hhcmFjdGVycykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgY2hhciBvZiBwcm92aWRlci50cmlnZ2VyQ2hhcmFjdGVycykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwcmVmaXg/LmVuZHNXaXRoKGNoYXIpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZW50ID0gdGhpcy5fcmVxdWVzdFRyaWdnZXJDaGFyUXVpY2tTdWdnZXN0Q29tcGxldGlvbnMoKTtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGUgY3Vyc29yIG1vdmVkIHRvIHRoZSBsZWZ0XG5cdFx0XHRpZiAodGhpcy5fbW9zdFJlY2VudFByb21wdElucHV0U3RhdGUgJiYgcHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleCA8IHRoaXMuX21vc3RSZWNlbnRQcm9tcHRJbnB1dFN0YXRlLmN1cnNvckluZGV4ICYmIHByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXggPiAwKSB7XG5cdFx0XHRcdC8vIFdlIG9ubHkgd2FudCB0byByZWZyZXNoIHZpYSB0cmlnZ2VyIGNoYXJhY3RlcnMgaW4gdGhpcyBjYXNlIGlmIHRoZSB3aWRnZXQgaXNcblx0XHRcdFx0Ly8gYWxyZWFkeSB2aXNpYmxlXG5cdFx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbFN1Z2dlc3RXaWRnZXRWaXNpYmxlQ29udGV4dEtleS5nZXQoKSkge1xuXHRcdFx0XHRcdC8vIEJhY2tzcGFjZSBvciBsZWZ0IHBhc3QgYSB0cmlnZ2VyIGNoYXJhY3RlclxuXHRcdFx0XHRcdGlmIChjb25maWcuc3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnMgJiYgIXNlbnQgJiYgdGhpcy5fbW9zdFJlY2VudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFyID0gdGhpcy5fbW9zdFJlY2VudFByb21wdElucHV0U3RhdGUudmFsdWVbdGhpcy5fbW9zdFJlY2VudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXggLSAxXTtcblx0XHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdFx0Y2hhciAmJiAoXG5cdFx0XHRcdFx0XHRcdFx0Ly8gT25seSB0cmlnZ2VyIG9uIGBcXGAgYW5kIGAvYCBpZiBpdCdzIGEgZGlyZWN0b3J5LiBOb3QgZG9pbmcgc28gY2F1c2VzIHByb2JsZW1zXG5cdFx0XHRcdFx0XHRcdFx0Ly8gd2l0aCBnaXQgYnJhbmNoZXMgaW4gcGFydGljdWxhclxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2lzRmlsdGVyaW5nRGlyZWN0b3JpZXMgJiYgY2hhci5tYXRjaCgvW1xcXFxcXC9dJC8pIHx8XG5cdFx0XHRcdFx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGNoYXJhY3RlciBpcyBhIHRyaWdnZXIgY2hhcmFjdGVyIGZyb20gcHJvdmlkZXJzXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fY2hlY2tQcm92aWRlclRyaWdnZXJDaGFyYWN0ZXJzKGNoYXIpXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0XHRzZW50ID0gdGhpcy5fcmVxdWVzdFRyaWdnZXJDaGFyUXVpY2tTdWdnZXN0Q29tcGxldGlvbnMoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIaWRlIHRoZSB3aWRnZXQgaWYgZ2hvc3QgdGV4dCB3YXMganVzdCBjb21wbGV0ZWQgdmlhIHJpZ2h0IGFycm93XG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5fd2FzTGFzdElucHV0UmlnaHRBcnJvd0tleSgpICYmXG5cdFx0XHR0aGlzLl9tb3N0UmVjZW50UHJvbXB0SW5wdXRTdGF0ZT8uZ2hvc3RUZXh0SW5kZXggIT09IC0xICYmXG5cdFx0XHRwcm9tcHRJbnB1dFN0YXRlLmdob3N0VGV4dEluZGV4ID09PSAtMSAmJlxuXHRcdFx0dGhpcy5fbW9zdFJlY2VudFByb21wdElucHV0U3RhdGU/LnZhbHVlID09PSBwcm9tcHRJbnB1dFN0YXRlLnZhbHVlXG5cdFx0KSB7XG5cdFx0XHR0aGlzLmhpZGVTdWdnZXN0V2lkZ2V0KGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9tb3N0UmVjZW50UHJvbXB0SW5wdXRTdGF0ZSA9IHByb21wdElucHV0U3RhdGU7XG5cdFx0aWYgKCF0aGlzLl9wcm9tcHRJbnB1dE1vZGVsIHx8ICF0aGlzLl90ZXJtaW5hbCB8fCAhdGhpcy5fc3VnZ2VzdFdpZGdldCB8fCB0aGlzLl9sZWFkaW5nTGluZUNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzUHJvbXB0SW5wdXRTdGF0ZSA9IHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlO1xuXHRcdHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlID0gcHJvbXB0SW5wdXRTdGF0ZTtcblxuXHRcdC8vIEhpZGUgdGhlIHdpZGdldCBpZiB0aGUgbGF0ZXN0IGNoYXJhY3RlciB3YXMgYSBzcGFjZVxuXHRcdGlmICh0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleCA+IDEgJiYgdGhpcy5fY3VycmVudFByb21wdElucHV0U3RhdGUudmFsdWUuYXQodGhpcy5fY3VycmVudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXggLSAxKSA9PT0gJyAnKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3dhc0xhc3RJbnB1dEFycm93S2V5KCkpIHtcblx0XHRcdFx0dGhpcy5oaWRlU3VnZ2VzdFdpZGdldChmYWxzZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIaWRlIHRoZSB3aWRnZXQgaWYgdGhlIGN1cnNvciBtb3ZlcyB0byB0aGUgbGVmdCBhbmQgaW52YWxpZGF0ZXMgdGhlIGNvbXBsZXRpb25zLlxuXHRcdC8vIE9yaWdpbmFsbHkgdGhpcyB3YXMgdG8gdGhlIGxlZnQgb2YgdGhlIGluaXRpYWwgcG9zaXRpb24gdGhhdCB0aGUgY29tcGxldGlvbnMgd2VyZVxuXHRcdC8vIHJlcXVlc3RlZCwgYnV0IHNpbmNlIGV4dGVuc2lvbnMgYXJlIGV4cGVjdGVkIHRvIGFsbG93IHRoZSBjbGllbnQtc2lkZSB0byBmaWx0ZXIsIHRoZXkgYXJlXG5cdFx0Ly8gb25seSBpbnZhbGlkYXRlZCB3aGVuIHdoaXRlc3BhY2UgaXMgZW5jb3VudGVyZWQuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlICYmIHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmN1cnNvckluZGV4IDwgdGhpcy5fbGVhZGluZ0xpbmVDb250ZW50Lmxlbmd0aCkge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmN1cnNvckluZGV4IDw9IDAgfHwgcHJldmlvdXNQcm9tcHRJbnB1dFN0YXRlPy52YWx1ZVt0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleF0/Lm1hdGNoKC9bXFxcXFxcL1xcc10vKSkge1xuXHRcdFx0XHR0aGlzLmhpZGVTdWdnZXN0V2lkZ2V0KGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbFN1Z2dlc3RXaWRnZXRWaXNpYmxlQ29udGV4dEtleS5nZXQoKSkge1xuXHRcdFx0dGhpcy5fY3Vyc29ySW5kZXhEZWx0YSA9IHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmN1cnNvckluZGV4IC0gKHRoaXMuX3JlcXVlc3RlZENvbXBsZXRpb25zSW5kZXgpO1xuXHRcdFx0bGV0IG5vcm1hbGl6ZWRMZWFkaW5nTGluZUNvbnRlbnQgPSB0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5zdWJzdHJpbmcoMCwgdGhpcy5fcmVxdWVzdGVkQ29tcGxldGlvbnNJbmRleCArIHRoaXMuX2N1cnNvckluZGV4RGVsdGEpO1xuXHRcdFx0aWYgKHRoaXMuX2lzRmlsdGVyaW5nRGlyZWN0b3JpZXMgJiYgdGhpcy5fcGF0aFNlcGFyYXRvcikge1xuXHRcdFx0XHRub3JtYWxpemVkTGVhZGluZ0xpbmVDb250ZW50ID0gbm9ybWFsaXplUGF0aFNlcGFyYXRvcihub3JtYWxpemVkTGVhZGluZ0xpbmVDb250ZW50LCB0aGlzLl9wYXRoU2VwYXJhdG9yKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVDb250ZXh0ID0gbmV3IExpbmVDb250ZXh0KG5vcm1hbGl6ZWRMZWFkaW5nTGluZUNvbnRlbnQsIHRoaXMuX2N1cnNvckluZGV4RGVsdGEpO1xuXHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldC5zZXRMaW5lQ29udGV4dChsaW5lQ29udGV4dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVmcmVzaElubGluZUNvbXBsZXRpb24odGhpcy5fbW9kZWw/Lml0ZW1zLm1hcChpID0+IGkuY29tcGxldGlvbikgfHwgW10pO1xuXG5cdFx0Ly8gSGlkZSBhbmQgY2xlYXIgbW9kZWwgaWYgdGhlcmUgYXJlIG5vIG1vcmUgaXRlbXNcblx0XHRpZiAoIXRoaXMuX3N1Z2dlc3RXaWRnZXQuaGFzQ29tcGxldGlvbnMoKSkge1xuXHRcdFx0dGhpcy5oaWRlU3VnZ2VzdFdpZGdldChmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSB0aGlzLl9nZXRDdXJzb3JQb3NpdGlvbih0aGlzLl90ZXJtaW5hbCk7XG5cdFx0aWYgKCFjdXJzb3JQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdWdnZXN0V2lkZ2V0LnNob3dTdWdnZXN0aW9ucygwLCBmYWxzZSwgdHJ1ZSwgY3Vyc29yUG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaElubGluZUNvbXBsZXRpb24oY29tcGxldGlvbnM6IElUZXJtaW5hbENvbXBsZXRpb25bXSk6IHZvaWQge1xuXHRcdGlmICghaXNJbmxpbmVDb21wbGV0aW9uU3VwcG9ydGVkKHRoaXMuc2hlbGxUeXBlKSkge1xuXHRcdFx0Ly8gSWYgdGhlIHNoZWxsIHR5cGUgaXMgbm90IHN1cHBvcnRlZCwgdGhlIGlubGluZSBjb21wbGV0aW9uIGl0ZW0gaXMgaW52YWxpZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvbGRJc0ludmFsaWQgPSB0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbS5pc0ludmFsaWQ7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZSB8fCB0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5naG9zdFRleHRJbmRleCA9PT0gLTEpIHtcblx0XHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLmlzSW52YWxpZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLmlzSW52YWxpZCA9IGZhbHNlO1xuXHRcdFx0Ly8gVXBkYXRlIHByb3BlcnRpZXNcblx0XHRcdGNvbnN0IHNwYWNlSW5kZXggPSB0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5sYXN0SW5kZXhPZignICcsIHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmdob3N0VGV4dEluZGV4IC0gMSk7XG5cdFx0XHRjb25zdCByZXBsYWNlbWVudEluZGV4ID0gc3BhY2VJbmRleCA9PT0gLTEgPyAwIDogc3BhY2VJbmRleCArIDE7XG5cdFx0XHRjb25zdCBzdWdnZXN0aW9uID0gdGhpcy5fY3VycmVudFByb21wdElucHV0U3RhdGUudmFsdWUuc3Vic3RyaW5nKHJlcGxhY2VtZW50SW5kZXgpO1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbi5sYWJlbCA9IHN1Z2dlc3Rpb247XG5cdFx0XHQvLyBVcGRhdGUgcmVwbGFjZW1lbnRSYW5nZSAoaW5jbHVzaXZlIHN0YXJ0LCBleGNsdXNpdmUgZW5kKSBmb3IgcmVwbGFjZW1lbnRcblx0XHRcdGNvbnN0IGVuZCA9IHRoaXMuX2N1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmN1cnNvckluZGV4IC0gdGhpcy5fY3Vyc29ySW5kZXhEZWx0YTtcblx0XHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb24ucmVwbGFjZW1lbnRSYW5nZSA9IFtyZXBsYWNlbWVudEluZGV4LCBlbmRdO1xuXHRcdFx0Ly8gUmVzZXQgdGhlIGNvbXBsZXRpb24gaXRlbSBhcyB0aGUgb2JqZWN0IHJlZmVyZW5jZSBtdXN0IHJlbWFpbiB0aGUgc2FtZSBidXQgaXRzXG5cdFx0XHQvLyBjb250ZW50cyB3aWxsIGRpZmZlciBhY3Jvc3Mgc3luY3MuIFRoaXMgaXMgZG9uZSBzbyB3ZSBkb24ndCBuZWVkIHRvIHJlYXNzaWduIHRoZVxuXHRcdFx0Ly8gbW9kZWwgYW5kIHRoZSBzbG93ZG93bi9mbGlja2VyaW5nIHRoYXQgY291bGQgcG90ZW50aWFsbHkgY2F1c2UuXG5cdFx0XHR0aGlzLl9hZGRQcm9wZXJ0aWVzVG9JbmxpbmVDb21wbGV0aW9uSXRlbShjb21wbGV0aW9ucyk7XG5cblx0XHRcdGNvbnN0IHggPSBuZXcgVGVybWluYWxDb21wbGV0aW9uSXRlbSh0aGlzLl9pbmxpbmVDb21wbGV0aW9uLCB0aGlzLl9wYXRoU2VwYXJhdG9yKTtcblx0XHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLmlkeCA9IHguaWR4O1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uc2NvcmUgPSB4LnNjb3JlO1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0ubGFiZWxMb3cgPSB4LmxhYmVsTG93O1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0udGV4dExhYmVsID0geC50ZXh0TGFiZWw7XG5cdFx0XHR0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbS5maWxlRXh0TG93ID0geC5maWxlRXh0TG93O1xuXHRcdFx0dGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0ubGFiZWxMb3dFeGNsdWRlRmlsZUV4dCA9IHgubGFiZWxMb3dFeGNsdWRlRmlsZUV4dDtcblx0XHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLmxhYmVsTG93Tm9ybWFsaXplZFBhdGggPSB4LmxhYmVsTG93Tm9ybWFsaXplZFBhdGg7XG5cdFx0XHR0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbS5wdW5jdHVhdGlvblBlbmFsdHkgPSB4LnB1bmN0dWF0aW9uUGVuYWx0eTtcblx0XHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtLndvcmQgPSB4LndvcmQ7XG5cdFx0XHR0aGlzLl9tb2RlbD8uZm9yY2VSZWZpbHRlckFsbCgpO1xuXHRcdH1cblxuXHRcdC8vIEZvcmNlIGEgZmlsdGVyIGFsbCBpbiBvcmRlciB0byByZS1ldmFsdWF0ZSB0aGUgaW5saW5lIGNvbXBsZXRpb25cblx0XHRpZiAodGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW0uaXNJbnZhbGlkICE9PSBvbGRJc0ludmFsaWQpIHtcblx0XHRcdHRoaXMuX21vZGVsPy5mb3JjZVJlZmlsdGVyQWxsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGVybWluYWxEaW1lbnNpb25zKCk6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0aW50ZXJmYWNlIFh0ZXJtV2l0aENvcmUgZXh0ZW5kcyBUZXJtaW5hbCB7XG5cdFx0XHRfY29yZTogSVh0ZXJtQ29yZTtcblx0XHR9XG5cdFx0Y29uc3QgY3NzQ2VsbERpbXMgPSAodGhpcy5fdGVybWluYWwgYXMgWHRlcm1XaXRoQ29yZSkuX2NvcmUuX3JlbmRlclNlcnZpY2UuZGltZW5zaW9ucy5jc3MuY2VsbDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkdGg6IGNzc0NlbGxEaW1zLndpZHRoLFxuXHRcdFx0aGVpZ2h0OiBjc3NDZWxsRGltcy5oZWlnaHQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1cnNvclBvc2l0aW9uKHRlcm1pbmFsOiBUZXJtaW5hbCk6IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGltZW5zaW9ucyA9IHRoaXMuX2dldFRlcm1pbmFsRGltZW5zaW9ucygpO1xuXHRcdGlmICghZGltZW5zaW9ucy53aWR0aCB8fCAhZGltZW5zaW9ucy5oZWlnaHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHh0ZXJtQm94ID0gdGhpcy5fc2NyZWVuIS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGVmdDogeHRlcm1Cb3gubGVmdCArIHRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWCAqIGRpbWVuc2lvbnMud2lkdGgsXG5cdFx0XHR0b3A6IHh0ZXJtQm94LnRvcCArIHRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSAqIGRpbWVuc2lvbnMuaGVpZ2h0LFxuXHRcdFx0aGVpZ2h0OiBkaW1lbnNpb25zLmhlaWdodFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGb250SW5mbygpOiBJU2ltcGxlU3VnZ2VzdFdpZGdldEZvbnRJbmZvIHtcblx0XHRpZiAodGhpcy5fY2FjaGVkRm9udEluZm8pIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZWRGb250SW5mbztcblx0XHR9XG5cblx0XHRpbnRlcmZhY2UgWHRlcm1XaXRoQ29yZSBleHRlbmRzIFRlcm1pbmFsIHtcblx0XHRcdF9jb3JlOiBJWHRlcm1Db3JlO1xuXHRcdH1cblx0XHRjb25zdCBjb3JlID0gKHRoaXMuX3Rlcm1pbmFsIGFzIFh0ZXJtV2l0aENvcmUpLl9jb3JlO1xuXHRcdGNvbnN0IGZvbnQgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZG9tLmdldEFjdGl2ZVdpbmRvdygpLCBjb3JlKTtcblx0XHRsZXQgbGluZUhlaWdodDogbnVtYmVyID0gZm9udC5saW5lSGVpZ2h0O1xuXHRcdGNvbnN0IGZvbnRTaXplOiBudW1iZXIgPSBmb250LmZvbnRTaXplO1xuXHRcdGNvbnN0IGZvbnRGYW1pbHk6IHN0cmluZyA9IGZvbnQuZm9udEZhbWlseTtcblx0XHRjb25zdCBsZXR0ZXJTcGFjaW5nOiBudW1iZXIgPSBmb250LmxldHRlclNwYWNpbmc7XG5cdFx0Y29uc3QgZm9udFdlaWdodDogc3RyaW5nID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5mb250V2VpZ2h0Jyk7XG5cblx0XHQvLyBVbmxpa2UgZWRpdG9yIHN1Z2dlc3Rpb25zLCBsaW5lIGhlaWdodCBpbiB0ZXJtaW5hbCBpcyBhbHdheXMgbXVsdGlwbGllZCB0byB0aGUgZm9udCBzaXplLlxuXHRcdC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHN0aWxsIGVuZm9yY2UgYSBtaW5pbXVtIGxpbmUgaGVpZ2h0IHRvIGF2b2lkIGNvbnRlbnQgZnJvbSBiZWluZyBjbGlwcGVkLlxuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU1ODUxXG5cdFx0bGluZUhlaWdodCA9IGxpbmVIZWlnaHQgKiBmb250U2l6ZTtcblxuXHRcdC8vIEVuZm9yY2UgaW50ZWdlciwgbWluaW11bSBjb25zdHJhaW50c1xuXHRcdGxpbmVIZWlnaHQgPSBNYXRoLnJvdW5kKGxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IG1pblRlcm1pbmFsTGluZUhlaWdodCA9IEdPTERFTl9MSU5FX0hFSUdIVF9SQVRJTyAqIGZvbnRTaXplO1xuXHRcdGlmIChsaW5lSGVpZ2h0IDwgbWluVGVybWluYWxMaW5lSGVpZ2h0KSB7XG5cdFx0XHRsaW5lSGVpZ2h0ID0gbWluVGVybWluYWxMaW5lSGVpZ2h0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbnRJbmZvID0ge1xuXHRcdFx0Zm9udFNpemUsXG5cdFx0XHRsaW5lSGVpZ2h0LFxuXHRcdFx0Zm9udFdlaWdodDogZm9udFdlaWdodC50b1N0cmluZygpLFxuXHRcdFx0bGV0dGVyU3BhY2luZyxcblx0XHRcdGZvbnRGYW1pbHlcblx0XHR9O1xuXG5cdFx0dGhpcy5fY2FjaGVkRm9udEluZm8gPSBmb250SW5mbztcblxuXHRcdHJldHVybiBmb250SW5mbztcblx0fVxuXG5cdHByaXZhdGUgX2dldEFkdmFuY2VkRXhwbGFpbk1vZGVEZXRhaWxzKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGBwcm9tcHRJbnB1dE1vZGVsOiAke3RoaXMuX3Byb21wdElucHV0TW9kZWw/LmdldENvbWJpbmVkU3RyaW5nKCl9YDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dDb21wbGV0aW9ucyhtb2RlbDogVGVybWluYWxDb21wbGV0aW9uTW9kZWwsIGV4cGxpY2l0bHlJbnZva2VkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1N1Z2dlc3RBZGRvbiNfc2hvd0NvbXBsZXRpb25zJyk7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbD8uZWxlbWVudCB8fCAhdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN1Z2dlc3RXaWRnZXQgPSB0aGlzLl9lbnN1cmVTdWdnZXN0V2lkZ2V0KHRoaXMuX3Rlcm1pbmFsKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1N1Z2dlc3RBZGRvbiNfc2hvd0NvbXBsZXRpb25zIHNldENvbXBsZXRpb25Nb2RlbCcpO1xuXHRcdHN1Z2dlc3RXaWRnZXQuc2V0Q29tcGxldGlvbk1vZGVsKG1vZGVsKTtcblxuXHRcdGlmICghdGhpcy5fcHJvbXB0SW5wdXRNb2RlbCB8fCAhZXhwbGljaXRseUludm9rZWQgJiYgbW9kZWwuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSB0aGlzLl9nZXRDdXJzb3JQb3NpdGlvbih0aGlzLl90ZXJtaW5hbCk7XG5cdFx0aWYgKCFjdXJzb3JQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUcmFjayB0aGUgdGltZSB3aGVuIGNvbXBsZXRpb25zIGFyZSBzaG93biBmb3IgdGhlIGZpcnN0IHRpbWVcblx0XHRpZiAodGhpcy5fY29tcGxldGlvblJlcXVlc3RUaW1lc3RhbXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY29tcGxldGlvbkxhdGVuY3kgPSBEYXRlLm5vdygpIC0gdGhpcy5fY29tcGxldGlvblJlcXVlc3RUaW1lc3RhbXA7XG5cdFx0XHRpZiAodGhpcy5fc3VnZ2VzdFRlbGVtZXRyeSAmJiB0aGlzLl9kaXNjb3ZlcmFiaWxpdHkpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3RTaG93biA9IHRoaXMuX2Rpc2NvdmVyYWJpbGl0eS5nZXRGaXJzdFNob3duKHRoaXMuc2hlbGxUeXBlKTtcblx0XHRcdFx0dGhpcy5fZGlzY292ZXJhYmlsaXR5LnVwZGF0ZVNob3duKCk7XG5cdFx0XHRcdHRoaXMuX3N1Z2dlc3RUZWxlbWV0cnkubG9nQ29tcGxldGlvbkxhdGVuY3kodGhpcy5fc2Vzc2lvbklkLCBjb21wbGV0aW9uTGF0ZW5jeSwgZmlyc3RTaG93bik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uUmVxdWVzdFRpbWVzdGFtcCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnU3VnZ2VzdEFkZG9uI19zaG93Q29tcGxldGlvbnMgc3VnZ2VzdFdpZGdldC5zaG93U3VnZ2VzdGlvbnMnKTtcblx0XHRzdWdnZXN0V2lkZ2V0LnNob3dTdWdnZXN0aW9ucygwLCBmYWxzZSwgIWV4cGxpY2l0bHlJbnZva2VkLCBjdXJzb3JQb3NpdGlvbik7XG5cdH1cblxuXG5cdHByaXZhdGUgX2Vuc3VyZVN1Z2dlc3RXaWRnZXQodGVybWluYWw6IFRlcm1pbmFsKTogU2ltcGxlU3VnZ2VzdFdpZGdldDxUZXJtaW5hbENvbXBsZXRpb25Nb2RlbCwgVGVybWluYWxDb21wbGV0aW9uSXRlbT4ge1xuXHRcdGlmICghdGhpcy5fc3VnZ2VzdFdpZGdldCkge1xuXHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRTaW1wbGVTdWdnZXN0V2lkZ2V0LFxuXHRcdFx0XHR0aGlzLl9jb250YWluZXIhLFxuXHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQZXJzaXN0ZWRXaWRnZXRTaXplKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHN0YXR1c0Jhck1lbnVJZDogTWVudUlkLk1lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51LFxuXHRcdFx0XHRcdHNob3dTdGF0dXNCYXJTZXR0aW5nSWQ6IFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TaG93U3RhdHVzQmFyLFxuXHRcdFx0XHRcdHNlbGVjdGlvbk1vZGVTZXR0aW5nSWQ6IFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5TZWxlY3Rpb25Nb2RlLFxuXHRcdFx0XHRcdHByZXZlbnREZXRhaWxzUGxhY2VtZW50czogW1NpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50Lldlc3RdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGlzLl9nZXRGb250SW5mby5iaW5kKHRoaXMpLFxuXHRcdFx0XHR0aGlzLl9vbkRpZEZvbnRDb25maWd1cmF0aW9uQ2hhbmdlLmV2ZW50LmJpbmQodGhpcyksXG5cdFx0XHRcdHRoaXMuX2dldEFkdmFuY2VkRXhwbGFpbk1vZGVEZXRhaWxzLmJpbmQodGhpcylcblx0XHRcdCkpIGFzIHVua25vd24gYXMgU2ltcGxlU3VnZ2VzdFdpZGdldDxUZXJtaW5hbENvbXBsZXRpb25Nb2RlbCwgVGVybWluYWxDb21wbGV0aW9uSXRlbT47XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdWdnZXN0V2lkZ2V0Lm9uRGlkU2VsZWN0KGFzeW5jIGUgPT4gdGhpcy5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24oZSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N1Z2dlc3RXaWRnZXQub25EaWRIaWRlKCgpID0+IHRoaXMuX3Rlcm1pbmFsU3VnZ2VzdFdpZGdldFZpc2libGVDb250ZXh0S2V5LnJlc2V0KCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N1Z2dlc3RXaWRnZXQub25EaWRTaG93KCgpID0+IHRoaXMuX3Rlcm1pbmFsU3VnZ2VzdFdpZGdldFZpc2libGVDb250ZXh0S2V5LnNldCh0cnVlKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3VnZ2VzdFdpZGdldC5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX3Rlcm1pbmFsPy5mb2N1cygpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHkpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuRm9udFNpemUpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuTGluZUhlaWdodCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5Gb250RmFtaWx5KSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuZm9udFNpemUnKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuZm9udEZhbWlseScpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRGb250Q29uZmlndXJhdGlvbkNoYW5nZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdCkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdWdnZXN0V2lkZ2V0Lm9uRGlkRm9jdXMoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRJdGVtID0gZS5pdGVtO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkSW5kZXggPSBlLmluZGV4O1xuXG5cdFx0XHRcdGlmIChmb2N1c2VkSXRlbSA9PT0gdGhpcy5fZm9jdXNlZEl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDYW5jZWwgYW55IHByZXZpb3VzIHJlc29sdXRpb25cblx0XHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzPy5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IGZvY3VzZWRJdGVtO1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBpdGVtIG5lZWRzIHJlc29sdXRpb24gYW5kIGhhc24ndCBiZWVuIHJlc29sdmVkIHlldFxuXHRcdFx0XHRpZiAoZm9jdXNlZEl0ZW0gJiYgKCFmb2N1c2VkSXRlbS5jb21wbGV0aW9uLmRvY3VtZW50YXRpb24gfHwgIWZvY3VzZWRJdGVtLmNvbXBsZXRpb24uZGV0YWlsKSkge1xuXG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgZm9jdXNlZEl0ZW0ucmVzb2x2ZSh0b2tlbik7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHQvLyBTaWxlbnRseSBmYWlsIC0gdGhlIGl0ZW0gaXMgc3RpbGwgdXNhYmxlIHdpdGhvdXQgZGV0YWlsc1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEZhaWxlZCB0byByZXNvbHZlIHN1Z2dlc3Rpb24gZGV0YWlscyBmb3IgaXRlbSAke2ZvY3VzZWRJdGVtfSBhdCBpbmRleCAke2ZvY3VzZWRJbmRleH1gLCBlcnJvcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIHN0aWxsIHRoZSBmb2N1c2VkIGl0ZW0gYW5kIGl0J3Mgc3RpbGwgaW4gdGhlIGxpc3Rcblx0XHRcdFx0XHRcdGlmIChmb2N1c2VkSXRlbSAhPT0gdGhpcy5fZm9jdXNlZEl0ZW0gfHwgIXRoaXMuX3N1Z2dlc3RXaWRnZXQ/Lmxpc3QgfHwgZm9jdXNlZEluZGV4ID49IHRoaXMuX3N1Z2dlc3RXaWRnZXQubGlzdC5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBSZS1yZW5kZXIgdGhlIHNwZWNpZmljIGl0ZW0gdG8gc2hvdyByZXNvbHZlZCBkZXRhaWxzIChsaWtlIGVkaXRvciBkb2VzKVxuXHRcdFx0XHRcdFx0dGhpcy5faWdub3JlRm9jdXNFdmVudHMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Ly8gVXNlIHNwbGljZSB0byByZXBsYWNlIHRoZSBpdGVtIGFuZCB0cmlnZ2VyIHJlLXJlbmRlclxuXHRcdFx0XHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldC5saXN0LnNwbGljZShmb2N1c2VkSW5kZXgsIDEsIFtmb2N1c2VkSXRlbV0pO1xuXHRcdFx0XHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldC5saXN0LnNldEZvY3VzKFtmb2N1c2VkSW5kZXhdKTtcblx0XHRcdFx0XHRcdHRoaXMuX2lnbm9yZUZvY3VzRXZlbnRzID0gZmFsc2U7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl90ZXJtaW5hbD8uZWxlbWVudD8ucXVlcnlTZWxlY3RvcignLnh0ZXJtLWhlbHBlci10ZXh0YXJlYScpO1xuXHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkb20uZ2V0QWN0aXZlRG9jdW1lbnQoKSwgJ2NsaWNrJywgKGV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbD8uZWxlbWVudD8uY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uaGlkZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdWdnZXN0V2lkZ2V0Lm9uRGlkU2hvdygoKSA9PiB0aGlzLl91cGRhdGVEaXNjb3ZlcmFiaWxpdHlTdGF0ZSgpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdWdnZXN0V2lkZ2V0Lm9uRGlkQmx1ckRldGFpbHMoKGUpID0+IHtcblx0XHRcdFx0Y29uc3QgZWx0ID0gZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRpZiAodGhpcy5fdGVybWluYWw/LmVsZW1lbnQ/LmNvbnRhaW5zKGVsdCkpIHtcblx0XHRcdFx0XHQvLyBEbyBub3RoaW5nLCBqdXN0IHRoZSB0ZXJtaW5hbCBnZXR0aW5nIGZvY3VzZWRcblx0XHRcdFx0XHQvLyBJZiB0aGVyZSB3YXMgYSBtb3VzZSBjbGljaywgdGhlIHN1Z2dlc3Qgd2lkZ2V0IHdpbGwgYmVcblx0XHRcdFx0XHQvLyBoaWRkZW4gYWJvdmVcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uaGlkZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxTdWdnZXN0V2lkZ2V0VmlzaWJsZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N1Z2dlc3RXaWRnZXQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEaXNjb3ZlcmFiaWxpdHlTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2Rpc2NvdmVyYWJpbGl0eSkge1xuXHRcdFx0dGhpcy5fZGlzY292ZXJhYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTdWdnZXN0U2hvd25UcmFja2VyLCB0aGlzLnNoZWxsVHlwZSkpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc3VnZ2VzdFdpZGdldCB8fCB0aGlzLl9kaXNjb3ZlcmFiaWxpdHk/LmRvbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzY292ZXJhYmlsaXR5Py51cGRhdGUodGhpcy5fc3VnZ2VzdFdpZGdldC5lbGVtZW50LmRvbU5vZGUpO1xuXHR9XG5cblx0cmVzZXREaXNjb3ZlcmFiaWxpdHkoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzY292ZXJhYmlsaXR5Py5yZXNldFN0YXRlKCk7XG5cdH1cblxuXHRzZWxlY3RQcmV2aW91c1N1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uc2VsZWN0UHJldmlvdXMoKTtcblx0fVxuXG5cdHNlbGVjdFByZXZpb3VzUGFnZVN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uc2VsZWN0UHJldmlvdXNQYWdlKCk7XG5cdH1cblxuXHRzZWxlY3ROZXh0U3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9zdWdnZXN0V2lkZ2V0Py5zZWxlY3ROZXh0KCk7XG5cdH1cblxuXHRzZWxlY3ROZXh0UGFnZVN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uc2VsZWN0TmV4dFBhZ2UoKTtcblx0fVxuXG5cdGFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihzdWdnZXN0aW9uPzogUGljazxJU2ltcGxlU2VsZWN0ZWRTdWdnZXN0aW9uPFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0+LCAnaXRlbScgfCAnbW9kZWwnPiwgcmVzcGVjdFJ1bk9uRW50ZXI/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFzdWdnZXN0aW9uKSB7XG5cdFx0XHRzdWdnZXN0aW9uID0gdGhpcy5fc3VnZ2VzdFdpZGdldD8uZ2V0Rm9jdXNlZEl0ZW0oKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbml0aWFsUHJvbXB0SW5wdXRTdGF0ZSA9IHRoaXMuX21vc3RSZWNlbnRQcm9tcHRJbnB1dFN0YXRlO1xuXHRcdGlmICghc3VnZ2VzdGlvbj8uaXRlbSB8fCAhaW5pdGlhbFByb21wdElucHV0U3RhdGUgfHwgdGhpcy5fbGVhZGluZ0xpbmVDb250ZW50ID09PSB1bmRlZmluZWQgfHwgIXRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLl9zdWdnZXN0VGVsZW1ldHJ5Py5hY2NlcHRDb21wbGV0aW9uKHRoaXMuX3Nlc3Npb25JZCwgdW5kZWZpbmVkLCB0aGlzLl9tb3N0UmVjZW50UHJvbXB0SW5wdXRTdGF0ZT8udmFsdWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRTdWdnZXN0QWRkb24ubGFzdEFjY2VwdGVkQ29tcGxldGlvblRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uaGlkZSgpO1xuXG5cdFx0Y29uc3QgY3VycmVudFByb21wdElucHV0U3RhdGUgPSB0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZSA/PyBpbml0aWFsUHJvbXB0SW5wdXRTdGF0ZTtcblxuXHRcdC8vIFRoZSByZXBsYWNlbWVudCB0ZXh0IGlzIGFueSB0ZXh0IGFmdGVyIHRoZSByZXBsYWNlbWVudCBpbmRleCBmb3IgdGhlIGNvbXBsZXRpb25zLCB0aGlzXG5cdFx0Ly8gaW5jbHVkZXMgYW55IHRleHQgdGhhdCB3YXMgdGhlcmUgYmVmb3JlIHRoZSBjb21wbGV0aW9ucyB3ZXJlIHJlcXVlc3RlZCBhbmQgYW55IHRleHQgYWRkZWRcblx0XHQvLyBzaW5jZSB0byByZWZpbmUgdGhlIGNvbXBsZXRpb24uXG5cdFx0Y29uc3Qgc3RhcnRJbmRleCA9IHN1Z2dlc3Rpb24uaXRlbS5jb21wbGV0aW9uLnJlcGxhY2VtZW50UmFuZ2U/LlswXSA/PyBjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleDtcblx0XHRjb25zdCByZXBsYWNlbWVudFRleHQgPSBjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5zdWJzdHJpbmcoc3RhcnRJbmRleCwgY3VycmVudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXgpO1xuXG5cdFx0Ly8gUmlnaHQgc2lkZSBvZiByZXBsYWNlbWVudCB0ZXh0IGluIHRoZSBzYW1lIHdvcmRcblx0XHRsZXQgcmlnaHRTaWRlUmVwbGFjZW1lbnRUZXh0ID0gJyc7XG5cdFx0aWYgKFxuXHRcdFx0Ly8gVGhlIGxpbmUgZGlkbid0IGVuZCB3aXRoIGdob3N0IHRleHRcblx0XHRcdChjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5naG9zdFRleHRJbmRleCA9PT0gLTEgfHwgY3VycmVudFByb21wdElucHV0U3RhdGUuZ2hvc3RUZXh0SW5kZXggPiBjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleCkgJiZcblx0XHRcdC8vIFRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgY2hhcmF0Y2VyXG5cdFx0XHRjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5sZW5ndGggPiBjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS5jdXJzb3JJbmRleCArIDEgJiZcblx0XHRcdC8vIFRIZSBuZXh0IGNoYXJhY3RlciBpcyBub3QgYSBzcGFjZVxuXHRcdFx0Y3VycmVudFByb21wdElucHV0U3RhdGUudmFsdWUuYXQoY3VycmVudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXgpICE9PSAnICdcblx0XHQpIHtcblx0XHRcdGNvbnN0IHNwYWNlSW5kZXggPSBjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5zdWJzdHJpbmcoY3VycmVudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXgsIGN1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmdob3N0VGV4dEluZGV4ID09PSAtMSA/IHVuZGVmaW5lZCA6IGN1cnJlbnRQcm9tcHRJbnB1dFN0YXRlLmdob3N0VGV4dEluZGV4KS5pbmRleE9mKCcgJyk7XG5cdFx0XHRyaWdodFNpZGVSZXBsYWNlbWVudFRleHQgPSBjdXJyZW50UHJvbXB0SW5wdXRTdGF0ZS52YWx1ZS5zdWJzdHJpbmcoY3VycmVudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXgsIHNwYWNlSW5kZXggPT09IC0xID8gdW5kZWZpbmVkIDogY3VycmVudFByb21wdElucHV0U3RhdGUuY3Vyc29ySW5kZXggKyBzcGFjZUluZGV4KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wbGV0aW9uID0gc3VnZ2VzdGlvbi5pdGVtLmNvbXBsZXRpb247XG5cdFx0bGV0IHJlc3VsdFNlcXVlbmNlID0gY29tcGxldGlvbi5pbnB1dERhdGE7XG5cblx0XHQvLyBVc2UgZm9yIGFtZW5kIHRoZSBsYWJlbCBpZiBpbnB1dERhdGEgaXMgbm90IGRlZmluZWRcblx0XHRpZiAocmVzdWx0U2VxdWVuY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bGV0IGNvbXBsZXRpb25UZXh0ID0gaXNTdHJpbmcoY29tcGxldGlvbi5sYWJlbCkgPyBjb21wbGV0aW9uLmxhYmVsIDogY29tcGxldGlvbi5sYWJlbC5sYWJlbDtcblx0XHRcdGlmICgoY29tcGxldGlvbi5raW5kID09PSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIgfHwgY29tcGxldGlvbi5pc0ZpbGVPdmVycmlkZSkgJiYgY29tcGxldGlvblRleHQuaW5jbHVkZXMoJyAnKSkge1xuXHRcdFx0XHQvLyBFc2NhcGUgc3BhY2VzIGluIGZpbGVzIG9yIGZvbGRlcnMgc28gdGhleSdyZSB2YWxpZCBwYXRoc1xuXHRcdFx0XHRjb21wbGV0aW9uVGV4dCA9IGNvbXBsZXRpb25UZXh0LnJlcGxhY2VBbGwoJyAnLCAnXFxcXCAnKTtcblx0XHRcdH1cblx0XHRcdGxldCBydW5PbkVudGVyID0gZmFsc2U7XG5cdFx0XHRpZiAocmVzcGVjdFJ1bk9uRW50ZXIpIHtcblx0XHRcdFx0Y29uc3QgcnVuT25FbnRlckNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbFN1Z2dlc3RDb25maWd1cmF0aW9uPih0ZXJtaW5hbFN1Z2dlc3RDb25maWdTZWN0aW9uKS5ydW5PbkVudGVyO1xuXHRcdFx0XHRzd2l0Y2ggKHJ1bk9uRW50ZXJDb25maWcpIHtcblx0XHRcdFx0XHRjYXNlICdhbHdheXMnOiB7XG5cdFx0XHRcdFx0XHRydW5PbkVudGVyID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdleGFjdE1hdGNoJzoge1xuXHRcdFx0XHRcdFx0cnVuT25FbnRlciA9IHJlcGxhY2VtZW50VGV4dC50b0xvd2VyQ2FzZSgpID09PSBjb21wbGV0aW9uVGV4dC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2V4YWN0TWF0Y2hJZ25vcmVFeHRlbnNpb24nOiB7XG5cdFx0XHRcdFx0XHRydW5PbkVudGVyID0gcmVwbGFjZW1lbnRUZXh0LnRvTG93ZXJDYXNlKCkgPT09IGNvbXBsZXRpb25UZXh0LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRpZiAoY29tcGxldGlvbi5pc0ZpbGVPdmVycmlkZSkge1xuXHRcdFx0XHRcdFx0XHRydW5PbkVudGVyIHx8PSByZXBsYWNlbWVudFRleHQudG9Mb3dlckNhc2UoKSA9PT0gY29tcGxldGlvblRleHQudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXC5bXlxcLl0rJC8sICcnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tb25QcmVmaXhMZW4gPSBjb21tb25QcmVmaXhMZW5ndGgocmVwbGFjZW1lbnRUZXh0LCBjb21wbGV0aW9uVGV4dCk7XG5cdFx0XHRjb25zdCBjb21tb25QcmVmaXggPSByZXBsYWNlbWVudFRleHQuc3Vic3RyaW5nKHJlcGxhY2VtZW50VGV4dC5sZW5ndGggLSAxIC0gY29tbW9uUHJlZml4TGVuLCByZXBsYWNlbWVudFRleHQubGVuZ3RoIC0gMSk7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uU3VmZml4ID0gY29tcGxldGlvblRleHQuc3Vic3RyaW5nKGNvbW1vblByZWZpeExlbik7XG5cdFx0XHRpZiAoY3VycmVudFByb21wdElucHV0U3RhdGUuc3VmZml4Lmxlbmd0aCA+IDAgJiYgY3VycmVudFByb21wdElucHV0U3RhdGUucHJlZml4LmVuZHNXaXRoKGNvbW1vblByZWZpeCkgJiYgY3VycmVudFByb21wdElucHV0U3RhdGUuc3VmZml4LnN0YXJ0c1dpdGgoY29tcGxldGlvblN1ZmZpeCkpIHtcblx0XHRcdFx0Ly8gTW92ZSByaWdodCB0byB0aGUgZW5kIG9mIHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdHJlc3VsdFNlcXVlbmNlID0gJ1xceDFiT0MnLnJlcGVhdChjb21wbGV0aW9uVGV4dC5sZW5ndGggLSBjb21tb25QcmVmaXhMZW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0U2VxdWVuY2UgPSBbXG5cdFx0XHRcdFx0Ly8gQmFja3NwYWNlIChsZWZ0KSB0byByZW1vdmUgYWxsIGFkZGl0aW9uYWwgaW5wdXRcblx0XHRcdFx0XHQnXFx4N0YnLnJlcGVhdChyZXBsYWNlbWVudFRleHQubGVuZ3RoIC0gY29tbW9uUHJlZml4TGVuKSxcblx0XHRcdFx0XHQvLyBEZWxldGUgKHJpZ2h0KSB0byByZW1vdmUgYW55IGFkZGl0aW9uYWwgdGV4dCBpbiB0aGUgc2FtZSB3b3JkXG5cdFx0XHRcdFx0J1xceDFiWzN+Jy5yZXBlYXQocmlnaHRTaWRlUmVwbGFjZW1lbnRUZXh0Lmxlbmd0aCksXG5cdFx0XHRcdFx0Ly8gV3JpdGUgdGhlIGNvbXBsZXRpb25cblx0XHRcdFx0XHRjb21wbGV0aW9uU3VmZml4LFxuXHRcdFx0XHRcdC8vIFJ1biBvbiBlbnRlciBpZiBuZWVkZWRcblx0XHRcdFx0XHRydW5PbkVudGVyID8gJ1xccicgOiAnJ1xuXHRcdFx0XHRdLmpvaW4oJycpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZvciBmb2xkZXJzLCBhbGxvdyB0aGUgbmV4dCBjb21wbGV0aW9uIHJlcXVlc3QgdG8gZ2V0IGNvbXBsZXRpb25zIGZvciB0aGF0IGZvbGRlclxuXHRcdGlmIChjb21wbGV0aW9uLmtpbmQgPT09IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcikge1xuXHRcdFx0U3VnZ2VzdEFkZG9uLmxhc3RBY2NlcHRlZENvbXBsZXRpb25UaW1lc3RhbXAgPSAwO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0cmFpbGluZyBzcGFjZSBpZiBlbmFibGVkIGFuZCBub3QgYSBmb2xkZXIgb3Igc3ltYm9saWMgbGluayBmb2xkZXJcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxTdWdnZXN0Q29uZmlndXJhdGlvbj4odGVybWluYWxTdWdnZXN0Q29uZmlnU2VjdGlvbik7XG5cdFx0aWYgKGNvbmZpZy5pbnNlcnRUcmFpbGluZ1NwYWNlICYmIGNvbXBsZXRpb24ua2luZCAhPT0gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyICYmIGNvbXBsZXRpb24ua2luZCAhPT0gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuU3ltYm9saWNMaW5rRm9sZGVyKSB7XG5cdFx0XHRyZXN1bHRTZXF1ZW5jZSArPSAnICc7XG5cdFx0XHR0aGlzLl9sYXN0VXNlckRhdGFUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXHRcdFx0dGhpcy5fcmVxdWVzdENvbXBsZXRpb25zT25OZXh0U3luYyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gU2VuZCB0aGUgY29tcGxldGlvblxuXHRcdHRoaXMuX29uQWNjZXB0ZWRDb21wbGV0aW9uLmZpcmUocmVzdWx0U2VxdWVuY2UpO1xuXHRcdHRoaXMuX3N1Z2dlc3RUZWxlbWV0cnk/LmFjY2VwdENvbXBsZXRpb24odGhpcy5fc2Vzc2lvbklkLCBjb21wbGV0aW9uLCB0aGlzLl9tb3N0UmVjZW50UHJvbXB0SW5wdXRTdGF0ZT8udmFsdWUpO1xuXHRcdHRoaXMuaGlkZVN1Z2dlc3RXaWRnZXQodHJ1ZSk7XG5cdH1cblxuXHRoaWRlU3VnZ2VzdFdpZGdldChjYW5jZWxBbnlSZXF1ZXN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzY292ZXJhYmlsaXR5Py5yZXNldFRpbWVyKCk7XG5cdFx0aWYgKGNhbmNlbEFueVJlcXVlc3QpIHtcblx0XHRcdHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlPy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0dGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBBbHNvIGNhbmNlbCBhbnkgcGVuZGluZyByZXNvbHV0aW9uIHJlcXVlc3RzXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50UHJvbXB0SW5wdXRTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sZWFkaW5nTGluZUNvbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3VnZ2VzdFdpZGdldD8uaGlkZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVsYXlvdXRPblJlc2l6ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsU3VnZ2VzdFdpZGdldFZpc2libGVDb250ZXh0S2V5LmdldCgpIHx8ICF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IHRoaXMuX2dldEN1cnNvclBvc2l0aW9uKHRoaXMuX3Rlcm1pbmFsKTtcblx0XHRpZiAoIWN1cnNvclBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLmhpZGVTdWdnZXN0V2lkZ2V0KHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdWdnZXN0V2lkZ2V0Py5yZWxheW91dChjdXJzb3JQb3NpdGlvbik7XG5cdH1cbn1cblxuY2xhc3MgUGVyc2lzdGVkV2lkZ2V0U2l6ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfa2V5ID0gVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbFN1Z2dlc3RTaXplO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHJlc3RvcmUoKTogZG9tLkRpbWVuc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID8/ICcnO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvYmogPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoZG9tLkRpbWVuc2lvbi5pcyhvYmopKSB7XG5cdFx0XHRcdHJldHVybiBkb20uRGltZW5zaW9uLmxpZnQob2JqKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c3RvcmUoc2l6ZTogZG9tLkRpbWVuc2lvbikge1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuX2tleSwgSlNPTi5zdHJpbmdpZnkoc2l6ZSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHRoaXMuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVQYXRoU2VwYXJhdG9yKHBhdGg6IHN0cmluZywgc2VwOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoc2VwID09PSAnLycpIHtcblx0XHRyZXR1cm4gcGF0aC5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKTtcblx0fVxuXHRyZXR1cm4gcGF0aC5yZXBsYWNlQWxsKCcvJywgJ1xcXFwnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsb0JBQW9CLFlBQVkseUJBQXlCO0FBQ2xFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJB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
