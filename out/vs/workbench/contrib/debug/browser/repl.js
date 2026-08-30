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
import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { memoize } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { HistoryNavigator } from "../../../../base/common/history.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI as uri } from "../../../../base/common/uri.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../editor/common/config/fontInfo.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CompletionItemInsertTextRule, CompletionItemKind, CompletionItemKinds } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize, localize2 } from "../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { editorForeground, resolveColorValue } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { FilterViewPane, ViewAction } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_REPL, CONTEXT_MULTI_SESSION_REPL, DEBUG_SCHEME, IDebugService, REPL_VIEW_ID, State, getStateLabel } from "../common/debug.js";
import { Variable } from "../common/debugModel.js";
import { resolveChildSession } from "../common/debugUtils.js";
import { ReplEvaluationResult, ReplGroup } from "../common/replModel.js";
import { FocusSessionActionViewItem } from "./debugActionViewItems.js";
import { DEBUG_COMMAND_CATEGORY, FOCUS_REPL_ID } from "./debugCommands.js";
import { DebugExpressionRenderer } from "./debugExpressionRenderer.js";
import { debugConsoleClearAll, debugConsoleEvaluationPrompt } from "./debugIcons.js";
import "./media/repl.css";
import { ReplFilter } from "./replFilter.js";
import { ReplAccessibilityProvider, ReplDataSource, ReplDelegate, ReplEvaluationInputsRenderer, ReplEvaluationResultsRenderer, ReplGroupRenderer, ReplOutputElementRenderer, ReplRawObjectsRenderer, ReplVariablesRenderer } from "./replViewer.js";
const $ = dom.$;
const HISTORY_STORAGE_KEY = "debug.repl.history";
const FILTER_HISTORY_STORAGE_KEY = "debug.repl.filterHistory";
const FILTER_VALUE_STORAGE_KEY = "debug.repl.filterValue";
const DECORATION_KEY = "replinputdecoration";
function revealLastElement(tree) {
  tree.scrollTop = tree.scrollHeight - tree.renderHeight;
}
const sessionsToIgnore = /* @__PURE__ */ new Set();
const identityProvider = { getId: (element) => element.getId() };
let Repl = class extends FilterViewPane {
  constructor(options, debugService, instantiationService, storageService, themeService, modelService, contextKeyService, codeEditorService, viewDescriptorService, contextMenuService, configurationService, textResourcePropertiesService, editorService, keybindingService, openerService, hoverService, menuService, languageFeaturesService, logService) {
    const filterText = storageService.get(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE, "");
    super({
      ...options,
      filterOptions: {
        placeholder: localize({ key: "workbench.debug.filter.placeholder", comment: ["Text in the brackets after e.g. is not localizable"] }, "Filter (e.g. text, !exclude, \\escape)"),
        text: filterText,
        history: JSON.parse(storageService.get(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, "[]"))
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.debugService = debugService;
    this.storageService = storageService;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.textResourcePropertiesService = textResourcePropertiesService;
    this.editorService = editorService;
    this.keybindingService = keybindingService;
    this.languageFeaturesService = languageFeaturesService;
    this.logService = logService;
    this.previousTreeScrollHeight = 0;
    this.styleChangedWhenInvisible = false;
    this.modelChangeListener = Disposable.None;
    this.findIsOpen = false;
    this.menu = menuService.createMenu(MenuId.DebugConsoleContext, contextKeyService);
    this._register(this.menu);
    this.history = this._register(new HistoryNavigator(new Set(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, "[]"))), 100));
    this.filter = new ReplFilter();
    this.filter.filterQuery = filterText;
    this.multiSessionRepl = CONTEXT_MULTI_SESSION_REPL.bindTo(contextKeyService);
    this.replOptions = this._register(this.instantiationService.createInstance(ReplOptions, this.id, () => this.getLocationBasedColors().background));
    this._register(this.replOptions.onDidChange(() => this.onDidStyleChange()));
    this._register(codeEditorService.registerDecorationType("repl-decoration", DECORATION_KEY, {}));
    this.multiSessionRepl.set(this.isMultiSessionView);
    this.registerListeners();
  }
  registerListeners() {
    if (this.debugService.getViewModel().focusedSession) {
      this.onDidFocusSession(this.debugService.getViewModel().focusedSession);
    }
    this._register(this.debugService.getViewModel().onDidFocusSession((session) => {
      this.onDidFocusSession(session);
    }));
    this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
      if (e instanceof Variable && this.tree?.hasNode(e)) {
        await this.tree.updateChildren(e, false, true);
        await this.tree.expand(e);
      }
    }));
    this._register(this.debugService.onWillNewSession(async (newSession) => {
      const input = this.tree?.getInput();
      if (!input || input.state === State.Inactive) {
        await this.selectSession(newSession);
      }
      this.multiSessionRepl.set(this.isMultiSessionView);
    }));
    this._register(this.debugService.onDidEndSession(async () => {
      await Promise.resolve();
      this.multiSessionRepl.set(this.isMultiSessionView);
    }));
    this._register(this.themeService.onDidColorThemeChange(() => {
      this.refreshReplElements(false);
      if (this.isVisible()) {
        this.updateInputDecoration();
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (!visible) {
        return;
      }
      if (!this.model) {
        this.model = this.modelService.getModel(Repl.URI) || this.modelService.createModel("", null, Repl.URI, true);
      }
      const focusedSession = this.debugService.getViewModel().focusedSession;
      if (this.tree && this.tree.getInput() !== focusedSession) {
        this.onDidFocusSession(focusedSession);
      }
      this.setMode();
      this.replInput.setModel(this.model);
      this.updateInputDecoration();
      this.refreshReplElements(true);
      if (this.styleChangedWhenInvisible) {
        this.styleChangedWhenInvisible = false;
        if (this.tree?.getInput()) {
          this.tree.updateChildren(void 0, true, false);
        }
        this.onDidStyleChange();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.console.wordWrap") && this.tree) {
        this.tree.dispose();
        this.treeContainer.innerText = "";
        dom.clearNode(this.treeContainer);
        this.createReplTree();
      }
      if (e.affectsConfiguration("debug.console.acceptSuggestionOnEnter")) {
        const config = this.configurationService.getValue("debug");
        this.replInput.updateOptions({
          acceptSuggestionOnEnter: config.console.acceptSuggestionOnEnter === "on" ? "on" : "off"
        });
      }
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this.setMode();
    }));
    this._register(this.filterWidget.onDidChangeFilterText(() => {
      this.filter.filterQuery = this.filterWidget.getFilterText();
      if (this.tree) {
        this.tree.refilter();
        revealLastElement(this.tree);
      }
    }));
  }
  async onDidFocusSession(session) {
    if (session) {
      sessionsToIgnore.delete(session);
      this.completionItemProvider?.dispose();
      if (session.capabilities.supportsCompletionsRequest) {
        this.completionItemProvider = this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, pattern: "**/replinput", hasAccessToAllModels: true }, {
          _debugDisplayName: "debugConsole",
          triggerCharacters: session.capabilities.completionTriggerCharacters || ["."],
          provideCompletionItems: async (_, position, _context, token) => {
            this.setHistoryNavigationEnablement(false);
            const model = this.replInput.getModel();
            if (model) {
              const text = model.getValue();
              const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
              const frameId = focusedStackFrame ? focusedStackFrame.frameId : void 0;
              const response = await session.completions(frameId, focusedStackFrame?.thread.threadId || 0, text, position, token);
              const suggestions = [];
              const computeRange = (length) => Range.fromPositions(position.delta(0, -length), position);
              if (response && response.body && response.body.targets) {
                response.body.targets.forEach((item) => {
                  if (item && item.label) {
                    let insertTextRules = void 0;
                    let insertText = item.text || item.label;
                    if (typeof item.selectionStart === "number") {
                      insertTextRules = CompletionItemInsertTextRule.InsertAsSnippet;
                      const selectionLength = typeof item.selectionLength === "number" ? item.selectionLength : 0;
                      const placeholder = selectionLength > 0 ? "${1:" + insertText.substring(item.selectionStart, item.selectionStart + selectionLength) + "}$0" : "$0";
                      insertText = insertText.substring(0, item.selectionStart) + placeholder + insertText.substring(item.selectionStart + selectionLength);
                    }
                    const label = item.detail ? { label: item.label, description: item.detail } : item.label;
                    suggestions.push({
                      label,
                      insertText,
                      kind: CompletionItemKinds.fromString(item.type || "property"),
                      filterText: item.start && item.length ? text.substring(item.start, item.start + item.length).concat(item.label) : void 0,
                      range: computeRange(item.length || 0),
                      sortText: item.sortText,
                      insertTextRules
                    });
                  }
                });
              }
              if (this.configurationService.getValue("debug").console.historySuggestions) {
                const history = this.history.getHistory();
                const idxLength = String(history.length).length;
                history.forEach((h, i) => suggestions.push({
                  label: h,
                  insertText: h,
                  kind: CompletionItemKind.Text,
                  range: computeRange(h.length),
                  sortText: "ZZZ" + String(history.length - i).padStart(idxLength, "0")
                }));
              }
              return { suggestions };
            }
            return Promise.resolve({ suggestions: [] });
          }
        });
      }
    }
    await this.selectSession();
  }
  getFilterStats() {
    return {
      total: this.tree?.getNode().children.length ?? 0,
      filtered: this.tree?.getNode().children.filter((c) => c.visible).length ?? 0
    };
  }
  get isReadonly() {
    const session = this.tree?.getInput();
    if (session && session.state !== State.Inactive) {
      return false;
    }
    return true;
  }
  showPreviousValue() {
    if (!this.isReadonly) {
      this.navigateHistory(true);
    }
  }
  showNextValue() {
    if (!this.isReadonly) {
      this.navigateHistory(false);
    }
  }
  focusFilter() {
    this.filterWidget.focus();
  }
  openFind() {
    this.tree?.openFind();
  }
  setMode() {
    if (!this.isVisible()) {
      return;
    }
    const activeEditorControl = this.editorService.activeTextEditorControl;
    if (isCodeEditor(activeEditorControl)) {
      this.modelChangeListener.dispose();
      this.modelChangeListener = activeEditorControl.onDidChangeModelLanguage(() => this.setMode());
      if (this.model && activeEditorControl.hasModel()) {
        this.model.setLanguage(activeEditorControl.getModel().getLanguageId());
      }
    }
  }
  onDidStyleChange() {
    if (!this.isVisible()) {
      this.styleChangedWhenInvisible = true;
      return;
    }
    if (this.styleElement) {
      this.replInput.updateOptions({
        fontSize: this.replOptions.replConfiguration.fontSize,
        lineHeight: this.replOptions.replConfiguration.lineHeight,
        fontFamily: this.replOptions.replConfiguration.fontFamily === "default" ? EDITOR_FONT_DEFAULTS.fontFamily : this.replOptions.replConfiguration.fontFamily
      });
      const replInputLineHeight = this.replInput.getOption(EditorOption.lineHeight);
      this.styleElement.textContent = `
				.repl .repl-input-wrapper .repl-input-chevron {
					line-height: ${replInputLineHeight}px
				}

				.repl .repl-input-wrapper .monaco-editor .lines-content {
					background-color: ${this.replOptions.replConfiguration.backgroundColor};
				}
			`;
      const cssFontFamily = this.replOptions.replConfiguration.fontFamily === "default" ? "var(--monaco-monospace-font)" : this.replOptions.replConfiguration.fontFamily;
      this.container.style.setProperty(`--vscode-repl-font-family`, cssFontFamily);
      this.container.style.setProperty(`--vscode-repl-font-size`, `${this.replOptions.replConfiguration.fontSize}px`);
      this.container.style.setProperty(`--vscode-repl-font-size-for-twistie`, `${this.replOptions.replConfiguration.fontSizeForTwistie}px`);
      this.container.style.setProperty(`--vscode-repl-line-height`, this.replOptions.replConfiguration.cssLineHeight);
      this.tree?.rerender();
      if (this.bodyContentDimension) {
        this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
      }
    }
  }
  navigateHistory(previous) {
    const historyInput = (previous ? this.history.previous() ?? this.history.first() : this.history.next()) ?? "";
    this.replInput.setValue(historyInput);
    aria.status(historyInput);
    this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
    this.setHistoryNavigationEnablement(true);
  }
  async selectSession(session) {
    const treeInput = this.tree?.getInput();
    if (!session) {
      const focusedSession = this.debugService.getViewModel().focusedSession;
      if (focusedSession) {
        session = focusedSession;
      } else if (!treeInput || sessionsToIgnore.has(treeInput)) {
        session = this.debugService.getModel().getSessions(true).find((s) => !sessionsToIgnore.has(s));
      }
    }
    if (session) {
      this.replElementsChangeListener?.dispose();
      this.replElementsChangeListener = session.onDidChangeReplElements(() => {
        this.refreshReplElements(session.getReplElements().length === 0);
      });
      if (this.tree && treeInput !== session) {
        try {
          await this.tree.setInput(session);
        } catch (err) {
          this.logService.error(err);
        }
        revealLastElement(this.tree);
      }
    }
    this.replInput?.updateOptions({ readOnly: this.isReadonly });
    this.updateInputDecoration();
  }
  async clearRepl() {
    const session = this.tree?.getInput();
    if (session) {
      session.removeReplExpressions();
      if (session.state === State.Inactive) {
        sessionsToIgnore.add(session);
        await this.selectSession();
        this.multiSessionRepl.set(this.isMultiSessionView);
      }
    }
    this.replInput.focus();
  }
  acceptReplInput() {
    const session = this.tree?.getInput();
    if (session && !this.isReadonly) {
      session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
      revealLastElement(this.tree);
      this.history.add(this.replInput.getValue());
      this.replInput.setValue("");
      if (this.bodyContentDimension) {
        this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
      }
    }
  }
  sendReplInput(input) {
    const session = this.tree?.getInput();
    if (session && !this.isReadonly) {
      session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, input);
      revealLastElement(this.tree);
      this.history.add(input);
    }
  }
  getVisibleContent() {
    let text = "";
    if (this.model && this.tree) {
      const lineDelimiter = this.textResourcePropertiesService.getEOL(this.model.uri);
      const traverseAndAppend = (node) => {
        node.children.forEach((child) => {
          if (child.visible) {
            text += child.element.toString().trimRight() + lineDelimiter;
            if (!child.collapsed && child.children.length) {
              traverseAndAppend(child);
            }
          }
        });
      };
      traverseAndAppend(this.tree.getNode());
    }
    return removeAnsiEscapeCodes(text);
  }
  layoutBodyContent(height, width) {
    this.bodyContentDimension = new dom.Dimension(width, height);
    const replInputHeight = Math.min(this.replInput.getContentHeight(), height);
    if (this.tree) {
      const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
      const treeHeight = height - replInputHeight;
      this.tree.getHTMLElement().style.height = `${treeHeight}px`;
      this.tree.layout(treeHeight, width);
      if (lastElementVisible) {
        revealLastElement(this.tree);
      }
    }
    this.replInputContainer.style.height = `${replInputHeight}px`;
    this.replInput.layout({ width: width - 30, height: replInputHeight });
  }
  collapseAll() {
    this.tree?.collapseAll();
  }
  getDebugSession() {
    return this.tree?.getInput();
  }
  getReplInput() {
    return this.replInput;
  }
  getReplDataSource() {
    return this.replDataSource;
  }
  getFocusedElement() {
    return this.tree?.getFocus()?.[0];
  }
  focusTree() {
    this.tree?.domFocus();
  }
  async focus() {
    super.focus();
    await timeout(0);
    this.replInput.focus();
  }
  createActionViewItem(action) {
    if (action.id === selectReplCommandId) {
      const session = (this.tree ? this.tree.getInput() : void 0) ?? this.debugService.getViewModel().focusedSession;
      return this.instantiationService.createInstance(SelectReplActionViewItem, action, session);
    }
    return super.createActionViewItem(action);
  }
  get isMultiSessionView() {
    return this.debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl() && !sessionsToIgnore.has(s)).length > 1;
  }
  get refreshScheduler() {
    const autoExpanded = /* @__PURE__ */ new Set();
    return new RunOnceScheduler(async () => {
      if (!this.tree || !this.tree.getInput() || !this.isVisible()) {
        return;
      }
      await this.tree.updateChildren(void 0, true, false, { diffIdentityProvider: identityProvider });
      const session = this.tree.getInput();
      if (session) {
        const autoExpandElements = async (elements) => {
          for (const element of elements) {
            if (element instanceof ReplGroup) {
              if (element.autoExpand && !autoExpanded.has(element.getId())) {
                autoExpanded.add(element.getId());
                await this.tree.expand(element);
              }
              if (!this.tree.isCollapsed(element)) {
                await autoExpandElements(element.getChildren());
              }
            }
          }
        };
        await autoExpandElements(session.getReplElements());
      }
      const { total, filtered } = this.getFilterStats();
      this.filterWidget.updateBadge(total === filtered || total === 0 ? void 0 : localize("showing filtered repl lines", "Showing {0} of {1}", filtered, total));
    }, Repl.REFRESH_DELAY);
  }
  // --- Creation
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "repl",
      focusNotifiers: [this, this.filterWidget],
      focusNextWidget: () => {
        const element = this.tree?.getHTMLElement();
        if (this.filterWidget.hasFocus()) {
          this.tree?.domFocus();
        } else if (element && dom.isActiveElement(element)) {
          this.focus();
        }
      },
      focusPreviousWidget: () => {
        const element = this.tree?.getHTMLElement();
        if (this.replInput.hasTextFocus()) {
          this.tree?.domFocus();
        } else if (element && dom.isActiveElement(element)) {
          this.focusFilter();
        }
      }
    }));
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.container = dom.append(parent, $(".repl"));
    this.treeContainer = dom.append(this.container, $(`.repl-tree.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
    this.createReplInput(this.container);
    this.createReplTree();
  }
  createReplTree() {
    this.replDelegate = new ReplDelegate(this.configurationService, this.replOptions);
    const wordWrap = this.configurationService.getValue("debug").console.wordWrap;
    this.treeContainer.classList.toggle("word-wrap", wordWrap);
    const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
    this.replDataSource = new ReplDataSource();
    const tree = this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "DebugRepl",
      this.treeContainer,
      this.replDelegate,
      [
        this.instantiationService.createInstance(ReplVariablesRenderer, expressionRenderer),
        this.instantiationService.createInstance(ReplOutputElementRenderer, expressionRenderer),
        new ReplEvaluationInputsRenderer(),
        this.instantiationService.createInstance(ReplGroupRenderer, expressionRenderer),
        new ReplEvaluationResultsRenderer(expressionRenderer),
        new ReplRawObjectsRenderer(expressionRenderer)
      ],
      this.replDataSource,
      {
        filter: this.filter,
        accessibilityProvider: new ReplAccessibilityProvider(),
        identityProvider,
        userSelection: true,
        mouseSupport: false,
        findWidgetEnabled: true,
        keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.toString(true) },
        horizontalScrolling: !wordWrap,
        setRowLineHeight: false,
        supportDynamicHeights: wordWrap,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    this._register(tree.onDidChangeContentHeight(() => {
      if (tree.scrollHeight !== this.previousTreeScrollHeight) {
        const lastElementWasVisible = tree.scrollTop + tree.renderHeight >= this.previousTreeScrollHeight - 2;
        if (lastElementWasVisible) {
          setTimeout(() => {
            revealLastElement(tree);
          }, 0);
        }
      }
      this.previousTreeScrollHeight = tree.scrollHeight;
    }));
    this._register(tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(tree.onDidChangeFindOpenState((open) => this.findIsOpen = open));
    let lastSelectedString;
    this._register(tree.onMouseClick(() => {
      if (this.findIsOpen) {
        return;
      }
      const selection = dom.getWindow(this.treeContainer).getSelection();
      if (!selection || selection.type !== "Range" || lastSelectedString === selection.toString()) {
        this.replInput.focus();
      }
      lastSelectedString = selection ? selection.toString() : "";
    }));
    this.selectSession();
    this.styleElement = domStylesheetsJs.createStyleSheet(this.container, void 0, this._store);
    this.onDidStyleChange();
  }
  createReplInput(container) {
    this.replInputContainer = dom.append(container, $(".repl-input-wrapper"));
    dom.append(this.replInputContainer, $(".repl-input-chevron" + ThemeIcon.asCSSSelector(debugConsoleEvaluationPrompt)));
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(this.scopedContextKeyService, this));
    this.setHistoryNavigationEnablement = (enabled) => {
      historyNavigationBackwardsEnablement.set(enabled);
      historyNavigationForwardsEnablement.set(enabled);
    };
    CONTEXT_IN_DEBUG_REPL.bindTo(this.scopedContextKeyService).set(true);
    this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    const options = getSimpleEditorOptions(this.configurationService);
    options.readOnly = true;
    options.suggest = { showStatusBar: true };
    const config = this.configurationService.getValue("debug");
    options.acceptSuggestionOnEnter = config.console.acceptSuggestionOnEnter === "on" ? "on" : "off";
    options.ariaLabel = this.getAriaLabel();
    this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());
    let lastContentHeight = -1;
    this._register(this.replInput.onDidChangeModelContent(() => {
      const model = this.replInput.getModel();
      this.setHistoryNavigationEnablement(!!model && model.getValue() === "");
      const contentHeight = this.replInput.getContentHeight();
      if (contentHeight !== lastContentHeight) {
        lastContentHeight = contentHeight;
        if (this.bodyContentDimension) {
          this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
        }
      }
    }));
    this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
    this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));
    this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => this.replInputContainer.classList.add("synthetic-focus")));
    this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => this.replInputContainer.classList.remove("synthetic-focus")));
  }
  getAriaLabel() {
    let ariaLabel = localize("debugConsole", "Debug Console");
    if (!this.configurationService.getValue(AccessibilityVerbositySettingId.Debug)) {
      return ariaLabel;
    }
    const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
    if (keybinding) {
      ariaLabel = localize("commentLabelWithKeybinding", "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
    } else {
      ariaLabel = localize("commentLabelWithKeybindingNoKeybinding", "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
    }
    return ariaLabel;
  }
  onContextMenu(e) {
    const actions = getFlatContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }));
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      getActionsContext: () => e.element
    });
  }
  // --- Update
  refreshReplElements(noDelay) {
    if (this.tree && this.isVisible()) {
      if (this.refreshScheduler.isScheduled()) {
        return;
      }
      this.refreshScheduler.schedule(noDelay ? 0 : void 0);
    }
  }
  updateInputDecoration() {
    if (!this.replInput) {
      return;
    }
    const decorations = [];
    if (this.isReadonly && this.replInput.hasTextFocus() && !this.replInput.getValue()) {
      const transparentForeground = resolveColorValue(editorForeground, this.themeService.getColorTheme())?.transparent(0.4);
      decorations.push({
        range: {
          startLineNumber: 0,
          endLineNumber: 0,
          startColumn: 0,
          endColumn: 1
        },
        renderOptions: {
          after: {
            contentText: localize("startDebugFirst", "Please start a debug session to evaluate expressions"),
            color: transparentForeground ? transparentForeground.toString() : void 0
          }
        }
      });
    }
    this.replInput.setDecorationsByType("repl-decoration", DECORATION_KEY, decorations);
  }
  saveState() {
    const replHistory = this.history.getHistory();
    if (replHistory.length) {
      this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(replHistory), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
    }
    const filterHistory = this.filterWidget.getHistory();
    if (filterHistory.length) {
      this.storageService.store(FILTER_HISTORY_STORAGE_KEY, JSON.stringify(filterHistory), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
    }
    const filterValue = this.filterWidget.getFilterText();
    if (filterValue) {
      this.storageService.store(FILTER_VALUE_STORAGE_KEY, filterValue, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE);
    }
    super.saveState();
  }
  dispose() {
    this.replInput?.dispose();
    this.replElementsChangeListener?.dispose();
    this.refreshScheduler.dispose();
    this.modelChangeListener.dispose();
    super.dispose();
  }
};
Repl.REFRESH_DELAY = 50;
// delay in ms to refresh the repl for new elements to show
Repl.URI = uri.parse(`${DEBUG_SCHEME}:replinput`);
__decorateClass([
  memoize
], Repl.prototype, "refreshScheduler", 1);
Repl = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IModelService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ICodeEditorService),
  __decorateParam(8, IViewDescriptorService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ITextResourcePropertiesService),
  __decorateParam(12, IEditorService),
  __decorateParam(13, IKeybindingService),
  __decorateParam(14, IOpenerService),
  __decorateParam(15, IHoverService),
  __decorateParam(16, IMenuService),
  __decorateParam(17, ILanguageFeaturesService),
  __decorateParam(18, ILogService)
], Repl);
let ReplOptions = class extends Disposable {
  constructor(viewId, backgroundColorDelegate, configurationService, themeService, viewDescriptorService) {
    super();
    this.backgroundColorDelegate = backgroundColorDelegate;
    this.configurationService = configurationService;
    this.themeService = themeService;
    this.viewDescriptorService = viewDescriptorService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(this.themeService.onDidColorThemeChange((e) => this.update()));
    this._register(this.viewDescriptorService.onDidChangeLocation((e) => {
      if (e.views.some((v) => v.id === viewId)) {
        this.update();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.console.lineHeight") || e.affectsConfiguration("debug.console.fontSize") || e.affectsConfiguration("debug.console.fontFamily")) {
        this.update();
      }
    }));
    this.update();
  }
  get replConfiguration() {
    return this._replConfig;
  }
  update() {
    const debugConsole = this.configurationService.getValue("debug").console;
    this._replConfig = {
      fontSize: debugConsole.fontSize,
      fontFamily: debugConsole.fontFamily,
      lineHeight: debugConsole.lineHeight ? debugConsole.lineHeight : ReplOptions.lineHeightEm * debugConsole.fontSize,
      cssLineHeight: debugConsole.lineHeight ? `${debugConsole.lineHeight}px` : `${ReplOptions.lineHeightEm}em`,
      backgroundColor: this.themeService.getColorTheme().getColor(this.backgroundColorDelegate()),
      fontSizeForTwistie: debugConsole.fontSize * ReplOptions.lineHeightEm / 2 - 8
    };
    this._onDidChange.fire();
  }
};
ReplOptions.lineHeightEm = 1.4;
ReplOptions = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IViewDescriptorService)
], ReplOptions);
class AcceptReplInputAction extends EditorAction {
  constructor() {
    super({
      id: "repl.action.acceptInput",
      label: localize2({ key: "actions.repl.acceptInput", comment: ["Apply input from the debug console input box"] }, "Debug Console: Accept Input"),
      precondition: CONTEXT_IN_DEBUG_REPL,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    SuggestController.get(editor)?.cancelSuggestWidget();
    const repl = getReplView(accessor.get(IViewsService));
    repl?.acceptReplInput();
  }
}
class FilterReplAction extends ViewAction {
  constructor() {
    super({
      viewId: REPL_VIEW_ID,
      id: "repl.action.filter",
      title: localize("repl.action.filter", "Debug Console: Focus Filter"),
      precondition: CONTEXT_IN_DEBUG_REPL,
      keybinding: [{
        when: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.KeyF,
        weight: KeybindingWeight.EditorContrib
      }]
    });
  }
  runInView(accessor, repl) {
    repl.focusFilter();
  }
}
class FindReplAction extends ViewAction {
  constructor() {
    super({
      viewId: REPL_VIEW_ID,
      id: "repl.action.find",
      title: localize("repl.action.find", "Debug Console: Focus Find"),
      precondition: CONTEXT_IN_DEBUG_REPL,
      keybinding: [{
        when: ContextKeyExpr.or(CONTEXT_IN_DEBUG_REPL, ContextKeyExpr.equals("focusedView", "workbench.panel.repl.view")),
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
        weight: KeybindingWeight.EditorContrib
      }],
      icon: Codicon.search,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", REPL_VIEW_ID),
        order: 15
      }, {
        id: MenuId.DebugConsoleContext,
        group: "z_commands",
        order: 25
      }]
    });
  }
  runInView(accessor, view) {
    view.openFind();
  }
}
class ReplCopyAllAction extends EditorAction {
  constructor() {
    super({
      id: "repl.action.copyAll",
      label: localize("actions.repl.copyAll", "Debug: Console Copy All"),
      alias: "Debug Console Copy All",
      precondition: CONTEXT_IN_DEBUG_REPL
    });
  }
  run(accessor, editor) {
    const clipboardService = accessor.get(IClipboardService);
    const repl = getReplView(accessor.get(IViewsService));
    if (repl) {
      return clipboardService.writeText(repl.getVisibleContent());
    }
  }
}
registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);
registerAction2(FilterReplAction);
registerAction2(FindReplAction);
class SelectReplActionViewItem extends FocusSessionActionViewItem {
  getSessions() {
    return this.debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl() && !sessionsToIgnore.has(s));
  }
  mapFocusedSessionToSelected(focusedSession) {
    while (focusedSession.parentSession && !focusedSession.hasSeparateRepl()) {
      focusedSession = focusedSession.parentSession;
    }
    return focusedSession;
  }
}
function getReplView(viewsService) {
  return viewsService.getActiveViewWithId(REPL_VIEW_ID) ?? void 0;
}
const selectReplCommandId = "workbench.action.debug.selectRepl";
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: selectReplCommandId,
      viewId: REPL_VIEW_ID,
      title: localize("selectRepl", "Select Debug Console"),
      f1: false,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", REPL_VIEW_ID), CONTEXT_MULTI_SESSION_REPL),
        order: 20
      }
    });
  }
  async runInView(accessor, view, session) {
    const debugService = accessor.get(IDebugService);
    if (session && session.state !== State.Inactive && session !== debugService.getViewModel().focusedSession) {
      session = resolveChildSession(session, debugService.getModel().getSessions());
      await debugService.focusStackFrame(void 0, void 0, session, { explicit: true });
    }
    await view.selectSession(session);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.debug.panel.action.clearReplAction",
      viewId: REPL_VIEW_ID,
      title: localize2("clearRepl", "Clear Console"),
      metadata: {
        description: localize2("clearRepl.descriotion", "Clears all program output from your debug REPL")
      },
      f1: true,
      icon: debugConsoleClearAll,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", REPL_VIEW_ID),
        order: 30
      }, {
        id: MenuId.DebugConsoleContext,
        group: "z_commands",
        order: 20
      }],
      keybinding: [{
        primary: 0,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
        // Weight is higher than work workbench contributions so the keybinding remains
        // highest priority when chords are registered afterwards
        weight: KeybindingWeight.WorkbenchContrib + 1,
        when: ContextKeyExpr.equals("focusedView", "workbench.panel.repl.view")
      }]
    });
  }
  runInView(_accessor, view) {
    const accessibilitySignalService = _accessor.get(IAccessibilitySignalService);
    view.clearRepl();
    accessibilitySignalService.playSignal(AccessibilitySignal.clear);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.collapseRepl",
      title: localize("collapse", "Collapse All"),
      viewId: REPL_VIEW_ID,
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "z_commands",
        order: 10
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
    view.focus();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "debug.replPaste",
      title: localize("paste", "Paste"),
      viewId: REPL_VIEW_ID,
      precondition: CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Inactive)),
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "2_cutcopypaste",
        order: 30
      }
    });
  }
  async runInView(accessor, view) {
    const clipboardService = accessor.get(IClipboardService);
    const clipboardText = await clipboardService.readText();
    if (clipboardText) {
      const replInput = view.getReplInput();
      replInput.setValue(replInput.getValue().concat(clipboardText));
      view.focus();
      const model = replInput.getModel();
      const lineNumber = model ? model.getLineCount() : 0;
      const column = model?.getLineMaxColumn(lineNumber);
      if (typeof lineNumber === "number" && typeof column === "number") {
        replInput.setPosition({ lineNumber, column });
      }
    }
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.debug.action.copyAll",
      title: localize("copyAll", "Copy All"),
      viewId: REPL_VIEW_ID,
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "2_cutcopypaste",
        order: 20
      }
    });
  }
  async runInView(accessor, view) {
    const clipboardService = accessor.get(IClipboardService);
    await clipboardService.writeText(view.getVisibleContent());
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "debug.replCopy",
      title: localize("copy", "Copy"),
      menu: {
        id: MenuId.DebugConsoleContext,
        group: "2_cutcopypaste",
        order: 10
      }
    });
  }
  async run(accessor, element) {
    const clipboardService = accessor.get(IClipboardService);
    const debugService = accessor.get(IDebugService);
    const nativeSelection = dom.getActiveWindow().getSelection();
    const selectedText = nativeSelection?.toString();
    if (selectedText && selectedText.length > 0) {
      return clipboardService.writeText(selectedText);
    } else if (element) {
      const retValue = await this.tryEvaluateAndCopy(debugService, element);
      const textToCopy = retValue || removeAnsiEscapeCodes(element.toString());
      return clipboardService.writeText(textToCopy);
    }
  }
  async tryEvaluateAndCopy(debugService, element) {
    if (!(element instanceof ReplEvaluationResult)) {
      return;
    }
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    const session = debugService.getViewModel().focusedSession;
    if (!stackFrame || !session || !session.capabilities.supportsClipboardContext) {
      return;
    }
    try {
      const evaluation = await session.evaluate(element.originalExpression, stackFrame.frameId, "clipboard");
      return evaluation?.body.result;
    } catch (e) {
      return;
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: FOCUS_REPL_ID,
      category: DEBUG_COMMAND_CATEGORY,
      title: localize2({ comment: ["Debug is a noun in this context, not a verb."], key: "debugFocusConsole" }, "Focus on Debug Console View")
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const repl = await viewsService.openView(REPL_VIEW_ID);
    await repl?.focus();
  }
});
export {
  Repl,
  getReplView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxyZXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IE1PVVNFX0NVUlNPUl9URVhUX0NTU19DTEFTU19OQU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL21vdXNlQ3Vyc29yL21vdXNlQ3Vyc29yLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBIaXN0b3J5TmF2aWdhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZW1vdmVBbnNpRXNjYXBlQ29kZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgYXMgdXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25JdGVtS2luZHMsIENvbXBsZXRpb25JdGVtTGFiZWwsIENvbXBsZXRpb25MaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZWRpdG9yRm9yZWdyb3VuZCwgcmVzb2x2ZUNvbG9yVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aWRnZXROYXZpZ2F0aW9uQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRmlsdGVyVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMsIFZpZXdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLCBnZXRTaW1wbGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9ERUJVR19TVEFURSwgQ09OVEVYVF9JTl9ERUJVR19SRVBMLCBDT05URVhUX01VTFRJX1NFU1NJT05fUkVQTCwgREVCVUdfU0NIRU1FLCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJUmVwbENvbmZpZ3VyYXRpb24sIElSZXBsRWxlbWVudCwgSVJlcGxPcHRpb25zLCBSRVBMX1ZJRVdfSUQsIFN0YXRlLCBnZXRTdGF0ZUxhYmVsIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IFZhcmlhYmxlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNoaWxkU2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IFJlcGxFdmFsdWF0aW9uUmVzdWx0LCBSZXBsR3JvdXAgfSBmcm9tICcuLi9jb21tb24vcmVwbE1vZGVsLmpzJztcbmltcG9ydCB7IEZvY3VzU2Vzc2lvbkFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9kZWJ1Z0FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBERUJVR19DT01NQU5EX0NBVEVHT1JZLCBGT0NVU19SRVBMX0lEIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IERlYnVnRXhwcmVzc2lvblJlbmRlcmVyIH0gZnJvbSAnLi9kZWJ1Z0V4cHJlc3Npb25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBkZWJ1Z0NvbnNvbGVDbGVhckFsbCwgZGVidWdDb25zb2xlRXZhbHVhdGlvblByb21wdCB9IGZyb20gJy4vZGVidWdJY29ucy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvcmVwbC5jc3MnO1xuaW1wb3J0IHsgUmVwbEZpbHRlciB9IGZyb20gJy4vcmVwbEZpbHRlci5qcyc7XG5pbXBvcnQgeyBSZXBsQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBSZXBsRGF0YVNvdXJjZSwgUmVwbERlbGVnYXRlLCBSZXBsRXZhbHVhdGlvbklucHV0c1JlbmRlcmVyLCBSZXBsRXZhbHVhdGlvblJlc3VsdHNSZW5kZXJlciwgUmVwbEdyb3VwUmVuZGVyZXIsIFJlcGxPdXRwdXRFbGVtZW50UmVuZGVyZXIsIFJlcGxSYXdPYmplY3RzUmVuZGVyZXIsIFJlcGxWYXJpYWJsZXNSZW5kZXJlciB9IGZyb20gJy4vcmVwbFZpZXdlci5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgSElTVE9SWV9TVE9SQUdFX0tFWSA9ICdkZWJ1Zy5yZXBsLmhpc3RvcnknO1xuY29uc3QgRklMVEVSX0hJU1RPUllfU1RPUkFHRV9LRVkgPSAnZGVidWcucmVwbC5maWx0ZXJIaXN0b3J5JztcbmNvbnN0IEZJTFRFUl9WQUxVRV9TVE9SQUdFX0tFWSA9ICdkZWJ1Zy5yZXBsLmZpbHRlclZhbHVlJztcbmNvbnN0IERFQ09SQVRJT05fS0VZID0gJ3JlcGxpbnB1dGRlY29yYXRpb24nO1xuXG5mdW5jdGlvbiByZXZlYWxMYXN0RWxlbWVudCh0cmVlOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPGFueSwgYW55LCBhbnk+KSB7XG5cdHRyZWUuc2Nyb2xsVG9wID0gdHJlZS5zY3JvbGxIZWlnaHQgLSB0cmVlLnJlbmRlckhlaWdodDtcblx0Ly8gdHJlZS5zY3JvbGxUb3AgPSAxZTY7XG59XG5cbmNvbnN0IHNlc3Npb25zVG9JZ25vcmUgPSBuZXcgU2V0PElEZWJ1Z1Nlc3Npb24+KCk7XG5jb25zdCBpZGVudGl0eVByb3ZpZGVyID0geyBnZXRJZDogKGVsZW1lbnQ6IElSZXBsRWxlbWVudCkgPT4gZWxlbWVudC5nZXRJZCgpIH07XG5cbmV4cG9ydCBjbGFzcyBSZXBsIGV4dGVuZHMgRmlsdGVyVmlld1BhbmUgaW1wbGVtZW50cyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUZSRVNIX0RFTEFZID0gNTA7IC8vIGRlbGF5IGluIG1zIHRvIHJlZnJlc2ggdGhlIHJlcGwgZm9yIG5ldyBlbGVtZW50cyB0byBzaG93XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVSSSA9IHVyaS5wYXJzZShgJHtERUJVR19TQ0hFTUV9OnJlcGxpbnB1dGApO1xuXG5cdHByaXZhdGUgaGlzdG9yeTogSGlzdG9yeU5hdmlnYXRvcjxzdHJpbmc+O1xuXHRwcml2YXRlIHRyZWU/OiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElEZWJ1Z1Nlc3Npb24sIElSZXBsRWxlbWVudCwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgcmVwbE9wdGlvbnM6IFJlcGxPcHRpb25zO1xuXHRwcml2YXRlIHByZXZpb3VzVHJlZVNjcm9sbEhlaWdodDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZXBsRGVsZWdhdGUhOiBSZXBsRGVsZWdhdGU7XG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlcGxJbnB1dCE6IENvZGVFZGl0b3JXaWRnZXQ7XG5cdHByaXZhdGUgcmVwbElucHV0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYm9keUNvbnRlbnREaW1lbnNpb246IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2V0SGlzdG9yeU5hdmlnYXRpb25FbmFibGVtZW50ITogKGVuYWJsZWQ6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdHByaXZhdGUgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UhOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgcmVwbEVsZW1lbnRzQ2hhbmdlTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0eWxlRWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdHlsZUNoYW5nZWRXaGVuSW52aXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgY29tcGxldGlvbkl0ZW1Qcm92aWRlcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW9kZWxDaGFuZ2VMaXN0ZW5lcjogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgZmlsdGVyOiBSZXBsRmlsdGVyO1xuXHRwcml2YXRlIG11bHRpU2Vzc2lvblJlcGw6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIG1lbnU6IElNZW51O1xuXHRwcml2YXRlIHJlcGxEYXRhU291cmNlOiBJQXN5bmNEYXRhU291cmNlPElEZWJ1Z1Nlc3Npb24sIElSZXBsRWxlbWVudD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmluZElzT3BlbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2U6IElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBmaWx0ZXJUZXh0ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KEZJTFRFUl9WQUxVRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJycpO1xuXHRcdHN1cGVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRmaWx0ZXJPcHRpb25zOiB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSh7IGtleTogJ3dvcmtiZW5jaC5kZWJ1Zy5maWx0ZXIucGxhY2Vob2xkZXInLCBjb21tZW50OiBbJ1RleHQgaW4gdGhlIGJyYWNrZXRzIGFmdGVyIGUuZy4gaXMgbm90IGxvY2FsaXphYmxlJ10gfSwgXCJGaWx0ZXIgKGUuZy4gdGV4dCwgIWV4Y2x1ZGUsIFxcXFxlc2NhcGUpXCIpLFxuXHRcdFx0XHR0ZXh0OiBmaWx0ZXJUZXh0LFxuXHRcdFx0XHRoaXN0b3J5OiBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldChGSUxURVJfSElTVE9SWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ1tdJykpIGFzIHN0cmluZ1tdLFxuXHRcdFx0fVxuXHRcdH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5tZW51ID0gbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuRGVidWdDb25zb2xlQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudSk7XG5cdFx0dGhpcy5oaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEhJU1RPUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICdbXScpKSksIDEwMCkpO1xuXHRcdHRoaXMuZmlsdGVyID0gbmV3IFJlcGxGaWx0ZXIoKTtcblx0XHR0aGlzLmZpbHRlci5maWx0ZXJRdWVyeSA9IGZpbHRlclRleHQ7XG5cdFx0dGhpcy5tdWx0aVNlc3Npb25SZXBsID0gQ09OVEVYVF9NVUxUSV9TRVNTSU9OX1JFUEwuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlcGxPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsT3B0aW9ucywgdGhpcy5pZCwgKCkgPT4gdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkuYmFja2dyb3VuZCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbE9wdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5vbkRpZFN0eWxlQ2hhbmdlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoJ3JlcGwtZGVjb3JhdGlvbicsIERFQ09SQVRJT05fS0VZLCB7fSkpO1xuXHRcdHRoaXMubXVsdGlTZXNzaW9uUmVwbC5zZXQodGhpcy5pc011bHRpU2Vzc2lvblZpZXcpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLm9uRGlkRm9jdXNTZXNzaW9uKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU2Vzc2lvbihzZXNzaW9uID0+IHtcblx0XHRcdHRoaXMub25EaWRGb2N1c1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRXZhbHVhdGVMYXp5RXhwcmVzc2lvbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgVmFyaWFibGUgJiYgdGhpcy50cmVlPy5oYXNOb2RlKGUpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbihlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLm9uV2lsbE5ld1Nlc3Npb24oYXN5bmMgbmV3U2Vzc2lvbiA9PiB7XG5cdFx0XHQvLyBOZWVkIHRvIGxpc3RlbiB0byBvdXRwdXQgZXZlbnRzIGZvciBzZXNzaW9ucyB3aGljaCBhcmUgbm90IHlldCBmdWxseSBpbml0aWFsaXNlZFxuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLnRyZWU/LmdldElucHV0KCk7XG5cdFx0XHRpZiAoIWlucHV0IHx8IGlucHV0LnN0YXRlID09PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlbGVjdFNlc3Npb24obmV3U2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm11bHRpU2Vzc2lvblJlcGwuc2V0KHRoaXMuaXNNdWx0aVNlc3Npb25WaWV3KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRFbmRTZXNzaW9uKGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFVwZGF0ZSB2aWV3LCBzaW5jZSBvcnBoYW5lZCBzZXNzaW9ucyBtaWdodCBub3cgYmUgc2VwYXJhdGVcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpOyAvLyBhbGxvdyBvdGhlciBsaXN0ZW5lcnMgdG8gZ28gZmlyc3QsIHNvIHNlc3Npb25zIGNhbiB1cGRhdGUgcGFyZW50c1xuXHRcdFx0dGhpcy5tdWx0aVNlc3Npb25SZXBsLnNldCh0aGlzLmlzTXVsdGlTZXNzaW9uVmlldyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZnJlc2hSZXBsRWxlbWVudHMoZmFsc2UpO1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVJbnB1dERlY29yYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0XHR0aGlzLm1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwoUmVwbC5VUkkpIHx8IHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBudWxsLCBSZXBsLlVSSSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvY3VzZWRTZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0XHRpZiAodGhpcy50cmVlICYmIHRoaXMudHJlZS5nZXRJbnB1dCgpICE9PSBmb2N1c2VkU2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLm9uRGlkRm9jdXNTZXNzaW9uKGZvY3VzZWRTZXNzaW9uKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXRNb2RlKCk7XG5cdFx0XHR0aGlzLnJlcGxJbnB1dC5zZXRNb2RlbCh0aGlzLm1vZGVsKTtcblx0XHRcdHRoaXMudXBkYXRlSW5wdXREZWNvcmF0aW9uKCk7XG5cdFx0XHR0aGlzLnJlZnJlc2hSZXBsRWxlbWVudHModHJ1ZSk7XG5cblx0XHRcdGlmICh0aGlzLnN0eWxlQ2hhbmdlZFdoZW5JbnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5zdHlsZUNoYW5nZWRXaGVuSW52aXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdC8vIE9ubHkgdXBkYXRlIGNoaWxkcmVuIHdoZW4gdGhlIHRyZWUgaGFzIGFuIGlucHV0IC0gaXQgbWF5IG5vdCB5ZXRcblx0XHRcdFx0Ly8gKG5vIGRlYnVnIHNlc3Npb24gaGFzIGJlZW4gZm9jdXNlZCBzaW5jZSB0aGlzIHZpZXcgd2FzIGNyZWF0ZWQpLFxuXHRcdFx0XHQvLyBpbiB3aGljaCBjYXNlIGBfdXBkYXRlQ2hpbGRyZW5gIHdvdWxkIHRocm93IGBUcmVlIGlucHV0IG5vdCBzZXRgLlxuXHRcdFx0XHRpZiAodGhpcy50cmVlPy5nZXRJbnB1dCgpKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKHVuZGVmaW5lZCwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMub25EaWRTdHlsZUNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5jb25zb2xlLndvcmRXcmFwJykgJiYgdGhpcy50cmVlKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblx0XHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLnRyZWVDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVJlcGxUcmVlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuY29uc29sZS5hY2NlcHRTdWdnZXN0aW9uT25FbnRlcicpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJyk7XG5cdFx0XHRcdHRoaXMucmVwbElucHV0LnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRcdGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyOiBjb25maWcuY29uc29sZS5hY2NlcHRTdWdnZXN0aW9uT25FbnRlciA9PT0gJ29uJyA/ICdvbicgOiAnb2ZmJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXRNb2RlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWx0ZXJXaWRnZXQub25EaWRDaGFuZ2VGaWx0ZXJUZXh0KCgpID0+IHtcblx0XHRcdHRoaXMuZmlsdGVyLmZpbHRlclF1ZXJ5ID0gdGhpcy5maWx0ZXJXaWRnZXQuZ2V0RmlsdGVyVGV4dCgpO1xuXHRcdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0XHR0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0XHRcdFx0cmV2ZWFsTGFzdEVsZW1lbnQodGhpcy50cmVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkRm9jdXNTZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0c2Vzc2lvbnNUb0lnbm9yZS5kZWxldGUoc2Vzc2lvbik7XG5cdFx0XHR0aGlzLmNvbXBsZXRpb25JdGVtUHJvdmlkZXI/LmRpc3Bvc2UoKTtcblx0XHRcdGlmIChzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbXBsZXRpb25zUmVxdWVzdCkge1xuXHRcdFx0XHR0aGlzLmNvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogREVCVUdfU0NIRU1FLCBwYXR0ZXJuOiAnKiovcmVwbGlucHV0JywgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnZGVidWdDb25zb2xlJyxcblx0XHRcdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogc2Vzc2lvbi5jYXBhYmlsaXRpZXMuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzIHx8IFsnLiddLFxuXHRcdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChfOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdD4gPT4ge1xuXHRcdFx0XHRcdFx0Ly8gRGlzYWJsZSBoaXN0b3J5IG5hdmlnYXRpb24gYmVjYXVzZSB1cCBhbmQgZG93biBhcmUgdXNlZCB0byBuYXZpZ2F0ZSB0aHJvdWdoIHRoZSBzdWdnZXN0IHdpZGdldFxuXHRcdFx0XHRcdFx0dGhpcy5zZXRIaXN0b3J5TmF2aWdhdGlvbkVuYWJsZW1lbnQoZmFsc2UpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMucmVwbElucHV0LmdldE1vZGVsKCk7XG5cdFx0XHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZvY3VzZWRTdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZyYW1lSWQgPSBmb2N1c2VkU3RhY2tGcmFtZSA/IGZvY3VzZWRTdGFja0ZyYW1lLmZyYW1lSWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5jb21wbGV0aW9ucyhmcmFtZUlkLCBmb2N1c2VkU3RhY2tGcmFtZT8udGhyZWFkLnRocmVhZElkIHx8IDAsIHRleHQsIHBvc2l0aW9uLCB0b2tlbik7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29tcHV0ZVJhbmdlID0gKGxlbmd0aDogbnVtYmVyKSA9PiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uLmRlbHRhKDAsIC1sZW5ndGgpLCBwb3NpdGlvbik7XG5cdFx0XHRcdFx0XHRcdGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5ICYmIHJlc3BvbnNlLmJvZHkudGFyZ2V0cykge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3BvbnNlLmJvZHkudGFyZ2V0cy5mb3JFYWNoKGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGl0ZW0gJiYgaXRlbS5sYWJlbCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsZXQgaW5zZXJ0VGV4dFJ1bGVzOiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsZXQgaW5zZXJ0VGV4dCA9IGl0ZW0udGV4dCB8fCBpdGVtLmxhYmVsO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIGl0ZW0uc2VsZWN0aW9uU3RhcnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gSWYgYSBkZWJ1ZyBjb21wbGV0aW9uIGl0ZW0gc2V0cyBhIHNlbGVjdGlvbiB3ZSBuZWVkIHRvIHVzZSBzbmlwcGV0cyB0byBtYWtlIHN1cmUgdGhlIHNlbGVjdGlvbiBpcyBzZWxlY3RlZCAjOTA5NzRcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0UnVsZXMgPSBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25MZW5ndGggPSB0eXBlb2YgaXRlbS5zZWxlY3Rpb25MZW5ndGggPT09ICdudW1iZXInID8gaXRlbS5zZWxlY3Rpb25MZW5ndGggOiAwO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gc2VsZWN0aW9uTGVuZ3RoID4gMCA/ICckezE6JyArIGluc2VydFRleHQuc3Vic3RyaW5nKGl0ZW0uc2VsZWN0aW9uU3RhcnQsIGl0ZW0uc2VsZWN0aW9uU3RhcnQgKyBzZWxlY3Rpb25MZW5ndGgpICsgJ30kMCcgOiAnJDAnO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGluc2VydFRleHQgPSBpbnNlcnRUZXh0LnN1YnN0cmluZygwLCBpdGVtLnNlbGVjdGlvblN0YXJ0KSArIHBsYWNlaG9sZGVyICsgaW5zZXJ0VGV4dC5zdWJzdHJpbmcoaXRlbS5zZWxlY3Rpb25TdGFydCArIHNlbGVjdGlvbkxlbmd0aCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbDogc3RyaW5nIHwgQ29tcGxldGlvbkl0ZW1MYWJlbCA9IGl0ZW0uZGV0YWlsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0PyB7IGxhYmVsOiBpdGVtLmxhYmVsLCBkZXNjcmlwdGlvbjogaXRlbS5kZXRhaWwgfVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdDogaXRlbS5sYWJlbDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmRzLmZyb21TdHJpbmcoaXRlbS50eXBlIHx8ICdwcm9wZXJ0eScpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IChpdGVtLnN0YXJ0ICYmIGl0ZW0ubGVuZ3RoKSA/IHRleHQuc3Vic3RyaW5nKGl0ZW0uc3RhcnQsIGl0ZW0uc3RhcnQgKyBpdGVtLmxlbmd0aCkuY29uY2F0KGl0ZW0ubGFiZWwpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBjb21wdXRlUmFuZ2UoaXRlbS5sZW5ndGggfHwgMCksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c29ydFRleHQ6IGl0ZW0uc29ydFRleHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dFJ1bGVzXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuY29uc29sZS5oaXN0b3J5U3VnZ2VzdGlvbnMpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBoaXN0b3J5ID0gdGhpcy5oaXN0b3J5LmdldEhpc3RvcnkoKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBpZHhMZW5ndGggPSBTdHJpbmcoaGlzdG9yeS5sZW5ndGgpLmxlbmd0aDtcblx0XHRcdFx0XHRcdFx0XHRoaXN0b3J5LmZvckVhY2goKGgsIGkpID0+IHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGgsXG5cdFx0XHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBoLFxuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRcdFx0XHRyYW5nZTogY29tcHV0ZVJhbmdlKGgubGVuZ3RoKSxcblx0XHRcdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiAnWlpaJyArIFN0cmluZyhoaXN0b3J5Lmxlbmd0aCAtIGkpLnBhZFN0YXJ0KGlkeExlbmd0aCwgJzAnKVxuXHRcdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zIH07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBzdWdnZXN0aW9uczogW10gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnNlbGVjdFNlc3Npb24oKTtcblx0fVxuXG5cdGdldEZpbHRlclN0YXRzKCk6IHsgdG90YWw6IG51bWJlcjsgZmlsdGVyZWQ6IG51bWJlciB9IHtcblx0XHQvLyBUaGlzIGNvdWxkIGJlIGNhbGxlZCBiZWZvcmUgdGhlIHRyZWUgaXMgY3JlYXRlZCB3aGVuIHNldHRpbmcgdGhpcy5maWx0ZXJTdGF0ZS5maWx0ZXJUZXh0IHZhbHVlXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvdGFsOiB0aGlzLnRyZWU/LmdldE5vZGUoKS5jaGlsZHJlbi5sZW5ndGggPz8gMCxcblx0XHRcdGZpbHRlcmVkOiB0aGlzLnRyZWU/LmdldE5vZGUoKS5jaGlsZHJlbi5maWx0ZXIoYyA9PiBjLnZpc2libGUpLmxlbmd0aCA/PyAwXG5cdFx0fTtcblx0fVxuXG5cdGdldCBpc1JlYWRvbmx5KCk6IGJvb2xlYW4ge1xuXHRcdC8vIERvIG5vdCBhbGxvdyB0byBlZGl0IGluYWN0aXZlIHNlc3Npb25zXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMudHJlZT8uZ2V0SW5wdXQoKTtcblx0XHRpZiAoc2Vzc2lvbiAmJiBzZXNzaW9uLnN0YXRlICE9PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2hvd1ByZXZpb3VzVmFsdWUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUmVhZG9ubHkpIHtcblx0XHRcdHRoaXMubmF2aWdhdGVIaXN0b3J5KHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHNob3dOZXh0VmFsdWUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzUmVhZG9ubHkpIHtcblx0XHRcdHRoaXMubmF2aWdhdGVIaXN0b3J5KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c0ZpbHRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlcldpZGdldC5mb2N1cygpO1xuXHR9XG5cblx0b3BlbkZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlPy5vcGVuRmluZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRNb2RlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckNvbnRyb2wgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0dGhpcy5tb2RlbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMubW9kZWxDaGFuZ2VMaXN0ZW5lciA9IGFjdGl2ZUVkaXRvckNvbnRyb2wub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKCgpID0+IHRoaXMuc2V0TW9kZSgpKTtcblx0XHRcdGlmICh0aGlzLm1vZGVsICYmIGFjdGl2ZUVkaXRvckNvbnRyb2wuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldExhbmd1YWdlKGFjdGl2ZUVkaXRvckNvbnRyb2wuZ2V0TW9kZWwoKS5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRTdHlsZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuc3R5bGVDaGFuZ2VkV2hlbkludmlzaWJsZSA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0eWxlRWxlbWVudCkge1xuXHRcdFx0dGhpcy5yZXBsSW5wdXQudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdGZvbnRTaXplOiB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRTaXplLFxuXHRcdFx0XHRsaW5lSGVpZ2h0OiB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmxpbmVIZWlnaHQsXG5cdFx0XHRcdGZvbnRGYW1pbHk6IHRoaXMucmVwbE9wdGlvbnMucmVwbENvbmZpZ3VyYXRpb24uZm9udEZhbWlseSA9PT0gJ2RlZmF1bHQnID8gRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSA6IHRoaXMucmVwbE9wdGlvbnMucmVwbENvbmZpZ3VyYXRpb24uZm9udEZhbWlseVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlcGxJbnB1dExpbmVIZWlnaHQgPSB0aGlzLnJlcGxJbnB1dC5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXG5cdFx0XHQvLyBTZXQgdGhlIGZvbnQgc2l6ZSwgZm9udCBmYW1pbHksIGxpbmUgaGVpZ2h0IGFuZCBhbGlnbiB0aGUgdHdpc3RpZSB0byBiZSBjZW50ZXJlZCwgYW5kIGlucHV0IHRoZW1lIGNvbG9yXG5cdFx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGBcblx0XHRcdFx0LnJlcGwgLnJlcGwtaW5wdXQtd3JhcHBlciAucmVwbC1pbnB1dC1jaGV2cm9uIHtcblx0XHRcdFx0XHRsaW5lLWhlaWdodDogJHtyZXBsSW5wdXRMaW5lSGVpZ2h0fXB4XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQucmVwbCAucmVwbC1pbnB1dC13cmFwcGVyIC5tb25hY28tZWRpdG9yIC5saW5lcy1jb250ZW50IHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke3RoaXMucmVwbE9wdGlvbnMucmVwbENvbmZpZ3VyYXRpb24uYmFja2dyb3VuZENvbG9yfTtcblx0XHRcdFx0fVxuXHRcdFx0YDtcblx0XHRcdGNvbnN0IGNzc0ZvbnRGYW1pbHkgPSB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRGYW1pbHkgPT09ICdkZWZhdWx0JyA/ICd2YXIoLS1tb25hY28tbW9ub3NwYWNlLWZvbnQpJyA6IHRoaXMucmVwbE9wdGlvbnMucmVwbENvbmZpZ3VyYXRpb24uZm9udEZhbWlseTtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KGAtLXZzY29kZS1yZXBsLWZvbnQtZmFtaWx5YCwgY3NzRm9udEZhbWlseSk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eShgLS12c2NvZGUtcmVwbC1mb250LXNpemVgLCBgJHt0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRTaXplfXB4YCk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eShgLS12c2NvZGUtcmVwbC1mb250LXNpemUtZm9yLXR3aXN0aWVgLCBgJHt0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmZvbnRTaXplRm9yVHdpc3RpZX1weGApO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoYC0tdnNjb2RlLXJlcGwtbGluZS1oZWlnaHRgLCB0aGlzLnJlcGxPcHRpb25zLnJlcGxDb25maWd1cmF0aW9uLmNzc0xpbmVIZWlnaHQpO1xuXG5cdFx0XHR0aGlzLnRyZWU/LnJlcmVuZGVyKCk7XG5cblx0XHRcdGlmICh0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0Qm9keUNvbnRlbnQodGhpcy5ib2R5Q29udGVudERpbWVuc2lvbi5oZWlnaHQsIHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24ud2lkdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbmF2aWdhdGVIaXN0b3J5KHByZXZpb3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgaGlzdG9yeUlucHV0ID0gKHByZXZpb3VzID9cblx0XHRcdCh0aGlzLmhpc3RvcnkucHJldmlvdXMoKSA/PyB0aGlzLmhpc3RvcnkuZmlyc3QoKSkgOiB0aGlzLmhpc3RvcnkubmV4dCgpKVxuXHRcdFx0Pz8gJyc7XG5cdFx0dGhpcy5yZXBsSW5wdXQuc2V0VmFsdWUoaGlzdG9yeUlucHV0KTtcblx0XHRhcmlhLnN0YXR1cyhoaXN0b3J5SW5wdXQpO1xuXHRcdC8vIGFsd2F5cyBsZWF2ZSBjdXJzb3IgYXQgdGhlIGVuZC5cblx0XHR0aGlzLnJlcGxJbnB1dC5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogaGlzdG9yeUlucHV0Lmxlbmd0aCArIDEgfSk7XG5cdFx0dGhpcy5zZXRIaXN0b3J5TmF2aWdhdGlvbkVuYWJsZW1lbnQodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBzZWxlY3RTZXNzaW9uKHNlc3Npb24/OiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdHJlZUlucHV0ID0gdGhpcy50cmVlPy5nZXRJbnB1dCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgZm9jdXNlZFNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRcdC8vIElmIHRoZXJlIGlzIGEgZm9jdXNlZFNlc3Npb24gZm9jdXMgb24gdGhhdCBvbmUsIG90aGVyd2lzZSBqdXN0IHNob3cgYW55IG90aGVyIG5vdCBpZ25vcmVkIHNlc3Npb25cblx0XHRcdGlmIChmb2N1c2VkU2Vzc2lvbikge1xuXHRcdFx0XHRzZXNzaW9uID0gZm9jdXNlZFNlc3Npb247XG5cdFx0XHR9IGVsc2UgaWYgKCF0cmVlSW5wdXQgfHwgc2Vzc2lvbnNUb0lnbm9yZS5oYXModHJlZUlucHV0KSkge1xuXHRcdFx0XHRzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucyh0cnVlKS5maW5kKHMgPT4gIXNlc3Npb25zVG9JZ25vcmUuaGFzKHMpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRoaXMucmVwbEVsZW1lbnRzQ2hhbmdlTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucmVwbEVsZW1lbnRzQ2hhbmdlTGlzdGVuZXIgPSBzZXNzaW9uLm9uRGlkQ2hhbmdlUmVwbEVsZW1lbnRzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoUmVwbEVsZW1lbnRzKHNlc3Npb24uZ2V0UmVwbEVsZW1lbnRzKCkubGVuZ3RoID09PSAwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy50cmVlICYmIHRyZWVJbnB1dCAhPT0gc2Vzc2lvbikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5zZXRJbnB1dChzZXNzaW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gSWdub3JlIGVycm9yIGJlY2F1c2UgdGhpcyBtYXkgaGFwcGVuIG11bHRpcGxlIHRpbWVzIHdoaWxlIHJlZnJlc2hpbmcsXG5cdFx0XHRcdFx0Ly8gdGhlbiBjaGFuZ2luZyB0aGUgcm9vdCBtYXkgZmFpbC4gTG9nIHRvIGhlbHAgd2l0aCBkZWJ1Z2dpbmcgaWYgbmVlZGVkLlxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldmVhbExhc3RFbGVtZW50KHRoaXMudHJlZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXBsSW5wdXQ/LnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogdGhpcy5pc1JlYWRvbmx5IH0pO1xuXHRcdHRoaXMudXBkYXRlSW5wdXREZWNvcmF0aW9uKCk7XG5cdH1cblxuXHRhc3luYyBjbGVhclJlcGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMudHJlZT8uZ2V0SW5wdXQoKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0c2Vzc2lvbi5yZW1vdmVSZXBsRXhwcmVzc2lvbnMoKTtcblx0XHRcdGlmIChzZXNzaW9uLnN0YXRlID09PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdFx0XHQvLyBJZ25vcmUgaW5hY3RpdmUgc2Vzc2lvbnMgd2hpY2ggZ290IGNsZWFyZWQgLSBzbyB0aGV5IGFyZSBub3Qgc2hvd24gYW55IG1vcmVcblx0XHRcdFx0c2Vzc2lvbnNUb0lnbm9yZS5hZGQoc2Vzc2lvbik7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VsZWN0U2Vzc2lvbigpO1xuXHRcdFx0XHR0aGlzLm11bHRpU2Vzc2lvblJlcGwuc2V0KHRoaXMuaXNNdWx0aVNlc3Npb25WaWV3KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZXBsSW5wdXQuZm9jdXMoKTtcblx0fVxuXG5cdGFjY2VwdFJlcGxJbnB1dCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy50cmVlPy5nZXRJbnB1dCgpO1xuXHRcdGlmIChzZXNzaW9uICYmICF0aGlzLmlzUmVhZG9ubHkpIHtcblx0XHRcdHNlc3Npb24uYWRkUmVwbEV4cHJlc3Npb24odGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWUsIHRoaXMucmVwbElucHV0LmdldFZhbHVlKCkpO1xuXHRcdFx0cmV2ZWFsTGFzdEVsZW1lbnQodGhpcy50cmVlISk7XG5cdFx0XHR0aGlzLmhpc3RvcnkuYWRkKHRoaXMucmVwbElucHV0LmdldFZhbHVlKCkpO1xuXHRcdFx0dGhpcy5yZXBsSW5wdXQuc2V0VmFsdWUoJycpO1xuXHRcdFx0aWYgKHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24pIHtcblx0XHRcdFx0Ly8gVHJpZ2dlciBhIGxheW91dCB0byBzaHJpbmsgYSBwb3RlbnRpYWwgbXVsdGkgbGluZSBpbnB1dFxuXHRcdFx0XHR0aGlzLmxheW91dEJvZHlDb250ZW50KHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24uaGVpZ2h0LCB0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uLndpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZW5kUmVwbElucHV0KGlucHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy50cmVlPy5nZXRJbnB1dCgpO1xuXHRcdGlmIChzZXNzaW9uICYmICF0aGlzLmlzUmVhZG9ubHkpIHtcblx0XHRcdHNlc3Npb24uYWRkUmVwbEV4cHJlc3Npb24odGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWUsIGlucHV0KTtcblx0XHRcdHJldmVhbExhc3RFbGVtZW50KHRoaXMudHJlZSEpO1xuXHRcdFx0dGhpcy5oaXN0b3J5LmFkZChpbnB1dCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VmlzaWJsZUNvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRsZXQgdGV4dCA9ICcnO1xuXHRcdGlmICh0aGlzLm1vZGVsICYmIHRoaXMudHJlZSkge1xuXHRcdFx0Y29uc3QgbGluZURlbGltaXRlciA9IHRoaXMudGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UuZ2V0RU9MKHRoaXMubW9kZWwudXJpKTtcblx0XHRcdGNvbnN0IHRyYXZlcnNlQW5kQXBwZW5kID0gKG5vZGU6IElUcmVlTm9kZTxJUmVwbEVsZW1lbnQsIEZ1enp5U2NvcmU+KSA9PiB7XG5cdFx0XHRcdG5vZGUuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB7XG5cdFx0XHRcdFx0aWYgKGNoaWxkLnZpc2libGUpIHtcblx0XHRcdFx0XHRcdHRleHQgKz0gY2hpbGQuZWxlbWVudC50b1N0cmluZygpLnRyaW1SaWdodCgpICsgbGluZURlbGltaXRlcjtcblx0XHRcdFx0XHRcdGlmICghY2hpbGQuY29sbGFwc2VkICYmIGNoaWxkLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHR0cmF2ZXJzZUFuZEFwcGVuZChjaGlsZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cdFx0XHR0cmF2ZXJzZUFuZEFwcGVuZCh0aGlzLnRyZWUuZ2V0Tm9kZSgpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKHRleHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGxheW91dEJvZHlDb250ZW50KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5ib2R5Q29udGVudERpbWVuc2lvbiA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdGNvbnN0IHJlcGxJbnB1dEhlaWdodCA9IE1hdGgubWluKHRoaXMucmVwbElucHV0LmdldENvbnRlbnRIZWlnaHQoKSwgaGVpZ2h0KTtcblx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHRjb25zdCBsYXN0RWxlbWVudFZpc2libGUgPSB0aGlzLnRyZWUuc2Nyb2xsVG9wICsgdGhpcy50cmVlLnJlbmRlckhlaWdodCA+PSB0aGlzLnRyZWUuc2Nyb2xsSGVpZ2h0O1xuXHRcdFx0Y29uc3QgdHJlZUhlaWdodCA9IGhlaWdodCAtIHJlcGxJbnB1dEhlaWdodDtcblx0XHRcdHRoaXMudHJlZS5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLmhlaWdodCA9IGAke3RyZWVIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy50cmVlLmxheW91dCh0cmVlSGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHRpZiAobGFzdEVsZW1lbnRWaXNpYmxlKSB7XG5cdFx0XHRcdHJldmVhbExhc3RFbGVtZW50KHRoaXMudHJlZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMucmVwbElucHV0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3JlcGxJbnB1dEhlaWdodH1weGA7XG5cblx0XHR0aGlzLnJlcGxJbnB1dC5sYXlvdXQoeyB3aWR0aDogd2lkdGggLSAzMCwgaGVpZ2h0OiByZXBsSW5wdXRIZWlnaHQgfSk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWU/LmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHRnZXREZWJ1Z1Nlc3Npb24oKTogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZT8uZ2V0SW5wdXQoKTtcblx0fVxuXG5cdGdldFJlcGxJbnB1dCgpOiBDb2RlRWRpdG9yV2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsSW5wdXQ7XG5cdH1cblxuXHRnZXRSZXBsRGF0YVNvdXJjZSgpOiBJQXN5bmNEYXRhU291cmNlPElEZWJ1Z1Nlc3Npb24sIElSZXBsRWxlbWVudD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJlcGxEYXRhU291cmNlO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZEVsZW1lbnQoKTogSVJlcGxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlPy5nZXRGb2N1cygpPy5bMF07XG5cdH1cblxuXHRmb2N1c1RyZWUoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlPy5kb21Gb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZm9jdXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyB3YWl0IGEgdGFzayBmb3IgdGhlIHJlcGwgdG8gZ2V0IGF0dGFjaGVkIHRvIHRoZSBET00sICM4MzM4N1xuXHRcdHRoaXMucmVwbElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb246IElBY3Rpb24pOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChhY3Rpb24uaWQgPT09IHNlbGVjdFJlcGxDb21tYW5kSWQpIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSAodGhpcy50cmVlID8gdGhpcy50cmVlLmdldElucHV0KCkgOiB1bmRlZmluZWQpID8/IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VsZWN0UmVwbEFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5jcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaXNNdWx0aVNlc3Npb25WaWV3KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKHRydWUpLmZpbHRlcihzID0+IHMuaGFzU2VwYXJhdGVSZXBsKCkgJiYgIXNlc3Npb25zVG9JZ25vcmUuaGFzKHMpKS5sZW5ndGggPiAxO1xuXHR9XG5cblx0Ly8gLS0tIENhY2hlZCBsb2NhbHNcblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIGdldCByZWZyZXNoU2NoZWR1bGVyKCk6IFJ1bk9uY2VTY2hlZHVsZXIge1xuXHRcdGNvbnN0IGF1dG9FeHBhbmRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHJldHVybiBuZXcgUnVuT25jZVNjaGVkdWxlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudHJlZSB8fCAhdGhpcy50cmVlLmdldElucHV0KCkgfHwgIXRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4odW5kZWZpbmVkLCB0cnVlLCBmYWxzZSwgeyBkaWZmSWRlbnRpdHlQcm92aWRlcjogaWRlbnRpdHlQcm92aWRlciB9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMudHJlZS5nZXRJbnB1dCgpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0Ly8gQXV0b21hdGljYWxseSBleHBhbmQgcmVwbCBncm91cCBlbGVtZW50cyB3aGVuIHNwZWNpZmllZFxuXHRcdFx0XHRjb25zdCBhdXRvRXhwYW5kRWxlbWVudHMgPSBhc3luYyAoZWxlbWVudHM6IElSZXBsRWxlbWVudFtdKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlcGxHcm91cCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5hdXRvRXhwYW5kICYmICFhdXRvRXhwYW5kZWQuaGFzKGVsZW1lbnQuZ2V0SWQoKSkpIHtcblx0XHRcdFx0XHRcdFx0XHRhdXRvRXhwYW5kZWQuYWRkKGVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlIS5leHBhbmQoZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCF0aGlzLnRyZWUhLmlzQ29sbGFwc2VkKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gUmVwbCBncm91cHMgY2FuIGhhdmUgY2hpbGRyZW4gd2hpY2ggYXJlIHJlcGwgZ3JvdXBzIHRodXMgd2UgbWlnaHQgbmVlZCB0byBleHBhbmQgdGhvc2UgYXMgd2VsbFxuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGF1dG9FeHBhbmRFbGVtZW50cyhlbGVtZW50LmdldENoaWxkcmVuKCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRhd2FpdCBhdXRvRXhwYW5kRWxlbWVudHMoc2Vzc2lvbi5nZXRSZXBsRWxlbWVudHMoKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZXBsIGVsZW1lbnRzIGNvdW50IGNoYW5nZWQsIG5lZWQgdG8gdXBkYXRlIGZpbHRlciBzdGF0cyBvbiB0aGUgYmFkZ2Vcblx0XHRcdGNvbnN0IHsgdG90YWwsIGZpbHRlcmVkIH0gPSB0aGlzLmdldEZpbHRlclN0YXRzKCk7XG5cdFx0XHR0aGlzLmZpbHRlcldpZGdldC51cGRhdGVCYWRnZSh0b3RhbCA9PT0gZmlsdGVyZWQgfHwgdG90YWwgPT09IDAgPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSgnc2hvd2luZyBmaWx0ZXJlZCByZXBsIGxpbmVzJywgXCJTaG93aW5nIHswfSBvZiB7MX1cIiwgZmlsdGVyZWQsIHRvdGFsKSk7XG5cdFx0fSwgUmVwbC5SRUZSRVNIX0RFTEFZKTtcblx0fVxuXG5cdC8vIC0tLSBDcmVhdGlvblxuXG5cdG92ZXJyaWRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lcih7XG5cdFx0XHRuYW1lOiAncmVwbCcsXG5cdFx0XHRmb2N1c05vdGlmaWVyczogW3RoaXMsIHRoaXMuZmlsdGVyV2lkZ2V0XSxcblx0XHRcdGZvY3VzTmV4dFdpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy50cmVlPy5nZXRIVE1MRWxlbWVudCgpO1xuXHRcdFx0XHRpZiAodGhpcy5maWx0ZXJXaWRnZXQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZT8uZG9tRm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbGVtZW50ICYmIGRvbS5pc0FjdGl2ZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRmb2N1c1ByZXZpb3VzV2lkZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnRyZWU/LmdldEhUTUxFbGVtZW50KCk7XG5cdFx0XHRcdGlmICh0aGlzLnJlcGxJbnB1dC5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZT8uZG9tRm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbGVtZW50ICYmIGRvbS5pc0FjdGl2ZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzRmlsdGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShwYXJlbnQpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsICQoJy5yZXBsJykpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoYC5yZXBsLXRyZWUuJHtNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRX1gKSk7XG5cdFx0dGhpcy5jcmVhdGVSZXBsSW5wdXQodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuY3JlYXRlUmVwbFRyZWUoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVwbFRyZWUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsRGVsZWdhdGUgPSBuZXcgUmVwbERlbGVnYXRlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMucmVwbE9wdGlvbnMpO1xuXHRcdGNvbnN0IHdvcmRXcmFwID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5jb25zb2xlLndvcmRXcmFwO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd3b3JkLXdyYXAnLCB3b3JkV3JhcCk7XG5cdFx0Y29uc3QgZXhwcmVzc2lvblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z0V4cHJlc3Npb25SZW5kZXJlcik7XG5cdFx0dGhpcy5yZXBsRGF0YVNvdXJjZSA9IG5ldyBSZXBsRGF0YVNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElEZWJ1Z1Nlc3Npb24sIElSZXBsRWxlbWVudCwgRnV6enlTY29yZT4sXG5cdFx0XHQnRGVidWdSZXBsJyxcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lcixcblx0XHRcdHRoaXMucmVwbERlbGVnYXRlLFxuXHRcdFx0W1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcGxWYXJpYWJsZXNSZW5kZXJlciwgZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBsT3V0cHV0RWxlbWVudFJlbmRlcmVyLCBleHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdFx0XHRuZXcgUmVwbEV2YWx1YXRpb25JbnB1dHNSZW5kZXJlcigpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlcGxHcm91cFJlbmRlcmVyLCBleHByZXNzaW9uUmVuZGVyZXIpLFxuXHRcdFx0XHRuZXcgUmVwbEV2YWx1YXRpb25SZXN1bHRzUmVuZGVyZXIoZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdFx0bmV3IFJlcGxSYXdPYmplY3RzUmVuZGVyZXIoZXhwcmVzc2lvblJlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLnJlcGxEYXRhU291cmNlLFxuXHRcdFx0e1xuXHRcdFx0XHRmaWx0ZXI6IHRoaXMuZmlsdGVyLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBSZXBsQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRcdHVzZXJTZWxlY3Rpb246IHRydWUsXG5cdFx0XHRcdG1vdXNlU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdGZpbmRXaWRnZXRFbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7IGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZTogSVJlcGxFbGVtZW50KSA9PiBlLnRvU3RyaW5nKHRydWUpIH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6ICF3b3JkV3JhcCxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogd29yZFdyYXAsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKHRyZWUuc2Nyb2xsSGVpZ2h0ICE9PSB0aGlzLnByZXZpb3VzVHJlZVNjcm9sbEhlaWdodCkge1xuXHRcdFx0XHQvLyBEdWUgdG8gcm91bmRpbmcsIHRoZSBzY3JvbGxUb3AgKyByZW5kZXJIZWlnaHQgd2lsbCBub3QgZXhhY3RseSBtYXRjaCB0aGUgc2Nyb2xsSGVpZ2h0LlxuXHRcdFx0XHQvLyBDb25zaWRlciB0aGUgdHJlZSB0byBiZSBzY3JvbGxlZCBhbGwgdGhlIHdheSBkb3duIGlmIGl0IGlzIHdpdGhpbiAycHggb2YgdGhlIGJvdHRvbS5cblx0XHRcdFx0Y29uc3QgbGFzdEVsZW1lbnRXYXNWaXNpYmxlID0gdHJlZS5zY3JvbGxUb3AgKyB0cmVlLnJlbmRlckhlaWdodCA+PSB0aGlzLnByZXZpb3VzVHJlZVNjcm9sbEhlaWdodCAtIDI7XG5cdFx0XHRcdGlmIChsYXN0RWxlbWVudFdhc1Zpc2libGUpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdC8vIENhbid0IHNldCBzY3JvbGxUb3AgZHVyaW5nIHRoaXMgZXZlbnQgbGlzdGVuZXIsIHRoZSBsaXN0IG1pZ2h0IG92ZXJ3cml0ZSB0aGUgY2hhbmdlXG5cdFx0XHRcdFx0XHRyZXZlYWxMYXN0RWxlbWVudCh0cmVlKTtcblx0XHRcdFx0XHR9LCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByZXZpb3VzVHJlZVNjcm9sbEhlaWdodCA9IHRyZWUuc2Nyb2xsSGVpZ2h0O1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUub25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlKChvcGVuKSA9PiB0aGlzLmZpbmRJc09wZW4gPSBvcGVuKSk7XG5cblx0XHRsZXQgbGFzdFNlbGVjdGVkU3RyaW5nOiBzdHJpbmc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodHJlZS5vbk1vdXNlQ2xpY2soKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZmluZElzT3Blbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBkb20uZ2V0V2luZG93KHRoaXMudHJlZUNvbnRhaW5lcikuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoIXNlbGVjdGlvbiB8fCBzZWxlY3Rpb24udHlwZSAhPT0gJ1JhbmdlJyB8fCBsYXN0U2VsZWN0ZWRTdHJpbmcgPT09IHNlbGVjdGlvbi50b1N0cmluZygpKSB7XG5cdFx0XHRcdC8vIG9ubHkgZm9jdXMgdGhlIGlucHV0IGlmIHRoZSB1c2VyIGlzIG5vdCBjdXJyZW50bHkgc2VsZWN0aW5nIGFuZCBmaW5kIGlzbid0IG9wZW4uXG5cdFx0XHRcdHRoaXMucmVwbElucHV0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRsYXN0U2VsZWN0ZWRTdHJpbmcgPSBzZWxlY3Rpb24gPyBzZWxlY3Rpb24udG9TdHJpbmcoKSA6ICcnO1xuXHRcdH0pKTtcblx0XHQvLyBNYWtlIHN1cmUgdG8gc2VsZWN0IHRoZSBzZXNzaW9uIGlmIGRlYnVnZ2luZyBpcyBhbHJlYWR5IGFjdGl2ZVxuXHRcdHRoaXMuc2VsZWN0U2Vzc2lvbigpO1xuXHRcdHRoaXMuc3R5bGVFbGVtZW50ID0gZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KHRoaXMuY29udGFpbmVyLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLm9uRGlkU3R5bGVDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVwbElucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlcGxJbnB1dENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcucmVwbC1pbnB1dC13cmFwcGVyJykpO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5yZXBsSW5wdXRDb250YWluZXIsICQoJy5yZXBsLWlucHV0LWNoZXZyb24nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZGVidWdDb25zb2xlRXZhbHVhdGlvblByb21wdCkpKTtcblxuXHRcdGNvbnN0IHsgaGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50LCBoaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudCB9ID0gdGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBbmRDcmVhdGVIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHQodGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgdGhpcykpO1xuXHRcdHRoaXMuc2V0SGlzdG9yeU5hdmlnYXRpb25FbmFibGVtZW50ID0gZW5hYmxlZCA9PiB7XG5cdFx0XHRoaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQuc2V0KGVuYWJsZWQpO1xuXHRcdFx0aGlzdG9yeU5hdmlnYXRpb25Gb3J3YXJkc0VuYWJsZW1lbnQuc2V0KGVuYWJsZWQpO1xuXHRcdH07XG5cdFx0Q09OVEVYVF9JTl9ERUJVR19SRVBMLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0b3B0aW9ucy5yZWFkT25seSA9IHRydWU7XG5cdFx0b3B0aW9ucy5zdWdnZXN0ID0geyBzaG93U3RhdHVzQmFyOiB0cnVlIH07XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKTtcblx0XHRvcHRpb25zLmFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyID0gY29uZmlnLmNvbnNvbGUuYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIgPT09ICdvbicgPyAnb24nIDogJ29mZic7XG5cdFx0b3B0aW9ucy5hcmlhTGFiZWwgPSB0aGlzLmdldEFyaWFMYWJlbCgpO1xuXG5cdFx0dGhpcy5yZXBsSW5wdXQgPSB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIHRoaXMucmVwbElucHV0Q29udGFpbmVyLCBvcHRpb25zLCBnZXRTaW1wbGVDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucygpKTtcblxuXHRcdGxldCBsYXN0Q29udGVudEhlaWdodCA9IC0xO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbElucHV0Lm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5yZXBsSW5wdXQuZ2V0TW9kZWwoKTtcblx0XHRcdHRoaXMuc2V0SGlzdG9yeU5hdmlnYXRpb25FbmFibGVtZW50KCEhbW9kZWwgJiYgbW9kZWwuZ2V0VmFsdWUoKSA9PT0gJycpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5yZXBsSW5wdXQuZ2V0Q29udGVudEhlaWdodCgpO1xuXHRcdFx0aWYgKGNvbnRlbnRIZWlnaHQgIT09IGxhc3RDb250ZW50SGVpZ2h0KSB7XG5cdFx0XHRcdGxhc3RDb250ZW50SGVpZ2h0ID0gY29udGVudEhlaWdodDtcblx0XHRcdFx0aWYgKHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLmxheW91dEJvZHlDb250ZW50KHRoaXMuYm9keUNvbnRlbnREaW1lbnNpb24uaGVpZ2h0LCB0aGlzLmJvZHlDb250ZW50RGltZW5zaW9uLndpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBXZSBhZGQgdGhlIGlucHV0IGRlY29yYXRpb24gb25seSB3aGVuIHRoZSBmb2N1cyBpcyBpbiB0aGUgaW5wdXQgIzYxMTI2XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXBsSW5wdXQub25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4gdGhpcy51cGRhdGVJbnB1dERlY29yYXRpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbElucHV0Lm9uRGlkQmx1ckVkaXRvclRleHQoKCkgPT4gdGhpcy51cGRhdGVJbnB1dERlY29yYXRpb24oKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucmVwbElucHV0Q29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkZPQ1VTLCAoKSA9PiB0aGlzLnJlcGxJbnB1dENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzeW50aGV0aWMtZm9jdXMnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJlcGxJbnB1dENvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5CTFVSLCAoKSA9PiB0aGlzLnJlcGxJbnB1dENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzeW50aGV0aWMtZm9jdXMnKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRsZXQgYXJpYUxhYmVsID0gbG9jYWxpemUoJ2RlYnVnQ29uc29sZScsIFwiRGVidWcgQ29uc29sZVwiKTtcblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5EZWJ1ZykpIHtcblx0XHRcdHJldHVybiBhcmlhTGFiZWw7XG5cdFx0fVxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHApPy5nZXRBcmlhTGFiZWwoKTtcblx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NvbW1lbnRMYWJlbFdpdGhLZXliaW5kaW5nJywgXCJ7MH0sIHVzZSAoezF9KSBmb3IgYWNjZXNzaWJpbGl0eSBoZWxwXCIsIGFyaWFMYWJlbCwga2V5YmluZGluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjb21tZW50TGFiZWxXaXRoS2V5YmluZGluZ05vS2V5YmluZGluZycsIFwiezB9LCBydW4gdGhlIGNvbW1hbmQgT3BlbiBBY2Nlc3NpYmlsaXR5IEhlbHAgd2hpY2ggaXMgY3VycmVudGx5IG5vdCB0cmlnZ2VyYWJsZSB2aWEga2V5YmluZGluZy5cIiwgYXJpYUxhYmVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJpYUxhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxJUmVwbEVsZW1lbnQ+KTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5tZW51LmdldEFjdGlvbnMoeyBhcmc6IGUuZWxlbWVudCwgc2hvdWxkRm9yd2FyZEFyZ3M6IGZhbHNlIH0pKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZS5lbGVtZW50XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gVXBkYXRlXG5cblx0cHJpdmF0ZSByZWZyZXNoUmVwbEVsZW1lbnRzKG5vRGVsYXk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy50cmVlICYmIHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdGlmICh0aGlzLnJlZnJlc2hTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVmcmVzaFNjaGVkdWxlci5zY2hlZHVsZShub0RlbGF5ID8gMCA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dERlY29yYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlcGxJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlY29yYXRpb25zOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSA9IFtdO1xuXHRcdGlmICh0aGlzLmlzUmVhZG9ubHkgJiYgdGhpcy5yZXBsSW5wdXQuaGFzVGV4dEZvY3VzKCkgJiYgIXRoaXMucmVwbElucHV0LmdldFZhbHVlKCkpIHtcblx0XHRcdGNvbnN0IHRyYW5zcGFyZW50Rm9yZWdyb3VuZCA9IHJlc29sdmVDb2xvclZhbHVlKGVkaXRvckZvcmVncm91bmQsIHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk/LnRyYW5zcGFyZW50KDAuNCk7XG5cdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDAsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMCxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVuZGVyT3B0aW9uczoge1xuXHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHRjb250ZW50VGV4dDogbG9jYWxpemUoJ3N0YXJ0RGVidWdGaXJzdCcsIFwiUGxlYXNlIHN0YXJ0IGEgZGVidWcgc2Vzc2lvbiB0byBldmFsdWF0ZSBleHByZXNzaW9uc1wiKSxcblx0XHRcdFx0XHRcdGNvbG9yOiB0cmFuc3BhcmVudEZvcmVncm91bmQgPyB0cmFuc3BhcmVudEZvcmVncm91bmQudG9TdHJpbmcoKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXBsSW5wdXQuc2V0RGVjb3JhdGlvbnNCeVR5cGUoJ3JlcGwtZGVjb3JhdGlvbicsIERFQ09SQVRJT05fS0VZLCBkZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVwbEhpc3RvcnkgPSB0aGlzLmhpc3RvcnkuZ2V0SGlzdG9yeSgpO1xuXHRcdGlmIChyZXBsSGlzdG9yeS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoSElTVE9SWV9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkocmVwbEhpc3RvcnkpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShISVNUT1JZX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsdGVySGlzdG9yeSA9IHRoaXMuZmlsdGVyV2lkZ2V0LmdldEhpc3RvcnkoKTtcblx0XHRpZiAoZmlsdGVySGlzdG9yeS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRklMVEVSX0hJU1RPUllfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGZpbHRlckhpc3RvcnkpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShGSUxURVJfSElTVE9SWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbHRlclZhbHVlID0gdGhpcy5maWx0ZXJXaWRnZXQuZ2V0RmlsdGVyVGV4dCgpO1xuXHRcdGlmIChmaWx0ZXJWYWx1ZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShGSUxURVJfVkFMVUVfU1RPUkFHRV9LRVksIGZpbHRlclZhbHVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShGSUxURVJfVkFMVUVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblxuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlcGxJbnB1dD8uZGlzcG9zZSgpOyAvLyBEaXNwb3NlZCBiZWZvcmUgcmVuZGVyZWQ/ICMxNzQ1NThcblx0XHR0aGlzLnJlcGxFbGVtZW50c0NoYW5nZUxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5yZWZyZXNoU2NoZWR1bGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1vZGVsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBSZXBsT3B0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVwbE9wdGlvbnMge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBsaW5lSGVpZ2h0RW0gPSAxLjQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9yZXBsQ29uZmlnITogSVJlcGxDb25maWd1cmF0aW9uO1xuXHRwdWJsaWMgZ2V0IHJlcGxDb25maWd1cmF0aW9uKCk6IElSZXBsQ29uZmlndXJhdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcGxDb25maWc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR2aWV3SWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJhY2tncm91bmRDb2xvckRlbGVnYXRlOiAoKSA9PiBzdHJpbmcsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZShlID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUxvY2F0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUudmlld3Muc29tZSh2ID0+IHYuaWQgPT09IHZpZXdJZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuY29uc29sZS5saW5lSGVpZ2h0JykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGVidWcuY29uc29sZS5mb250U2l6ZScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLmNvbnNvbGUuZm9udEZhbWlseScpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZSgpIHtcblx0XHRjb25zdCBkZWJ1Z0NvbnNvbGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmNvbnNvbGU7XG5cdFx0dGhpcy5fcmVwbENvbmZpZyA9IHtcblx0XHRcdGZvbnRTaXplOiBkZWJ1Z0NvbnNvbGUuZm9udFNpemUsXG5cdFx0XHRmb250RmFtaWx5OiBkZWJ1Z0NvbnNvbGUuZm9udEZhbWlseSxcblx0XHRcdGxpbmVIZWlnaHQ6IGRlYnVnQ29uc29sZS5saW5lSGVpZ2h0ID8gZGVidWdDb25zb2xlLmxpbmVIZWlnaHQgOiBSZXBsT3B0aW9ucy5saW5lSGVpZ2h0RW0gKiBkZWJ1Z0NvbnNvbGUuZm9udFNpemUsXG5cdFx0XHRjc3NMaW5lSGVpZ2h0OiBkZWJ1Z0NvbnNvbGUubGluZUhlaWdodCA/IGAke2RlYnVnQ29uc29sZS5saW5lSGVpZ2h0fXB4YCA6IGAke1JlcGxPcHRpb25zLmxpbmVIZWlnaHRFbX1lbWAsXG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcih0aGlzLmJhY2tncm91bmRDb2xvckRlbGVnYXRlKCkpLFxuXHRcdFx0Zm9udFNpemVGb3JUd2lzdGllOiBkZWJ1Z0NvbnNvbGUuZm9udFNpemUgKiBSZXBsT3B0aW9ucy5saW5lSGVpZ2h0RW0gLyAyIC0gOFxuXHRcdH07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG59XG5cbi8vIFJlcGwgYWN0aW9ucyBhbmQgY29tbWFuZHNcblxuY2xhc3MgQWNjZXB0UmVwbElucHV0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3JlcGwuYWN0aW9uLmFjY2VwdElucHV0Jyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZTIoeyBrZXk6ICdhY3Rpb25zLnJlcGwuYWNjZXB0SW5wdXQnLCBjb21tZW50OiBbJ0FwcGx5IGlucHV0IGZyb20gdGhlIGRlYnVnIGNvbnNvbGUgaW5wdXQgYm94J10gfSwgXCJEZWJ1ZyBDb25zb2xlOiBBY2NlcHQgSW5wdXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSU5fREVCVUdfUkVQTCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdFN1Z2dlc3RDb250cm9sbGVyLmdldChlZGl0b3IpPy5jYW5jZWxTdWdnZXN0V2lkZ2V0KCk7XG5cdFx0Y29uc3QgcmVwbCA9IGdldFJlcGxWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0cmVwbD8uYWNjZXB0UmVwbElucHV0KCk7XG5cdH1cbn1cblxuY2xhc3MgRmlsdGVyUmVwbEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248UmVwbD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHZpZXdJZDogUkVQTF9WSUVXX0lELFxuXHRcdFx0aWQ6ICdyZXBsLmFjdGlvbi5maWx0ZXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZXBsLmFjdGlvbi5maWx0ZXInLCBcIkRlYnVnIENvbnNvbGU6IEZvY3VzIEZpbHRlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9JTl9ERUJVR19SRVBMLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVwbDogUmVwbCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXBsLmZvY3VzRmlsdGVyKCk7XG5cdH1cbn1cblxuXG5jbGFzcyBGaW5kUmVwbEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248UmVwbD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHZpZXdJZDogUkVQTF9WSUVXX0lELFxuXHRcdFx0aWQ6ICdyZXBsLmFjdGlvbi5maW5kJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVwbC5hY3Rpb24uZmluZCcsIFwiRGVidWcgQ29uc29sZTogRm9jdXMgRmluZFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9JTl9ERUJVR19SRVBMLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ09OVEVYVF9JTl9ERUJVR19SRVBMLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2ZvY3VzZWRWaWV3JywgJ3dvcmtiZW5jaC5wYW5lbC5yZXBsLnZpZXcnKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1dLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZWFyY2gsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgUkVQTF9WSUVXX0lEKSxcblx0XHRcdFx0b3JkZXI6IDE1XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdDb25zb2xlQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NvbW1hbmRzJyxcblx0XHRcdFx0b3JkZXI6IDI1XG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogUmVwbCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHR2aWV3Lm9wZW5GaW5kKCk7XG5cdH1cbn1cblxuY2xhc3MgUmVwbENvcHlBbGxBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAncmVwbC5hY3Rpb24uY29weUFsbCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FjdGlvbnMucmVwbC5jb3B5QWxsJywgXCJEZWJ1ZzogQ29uc29sZSBDb3B5IEFsbFwiKSxcblx0XHRcdGFsaWFzOiAnRGVidWcgQ29uc29sZSBDb3B5IEFsbCcsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfSU5fREVCVUdfUkVQTCxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRjb25zdCByZXBsID0gZ2V0UmVwbFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAocmVwbCkge1xuXHRcdFx0cmV0dXJuIGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHJlcGwuZ2V0VmlzaWJsZUNvbnRlbnQoKSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEFjY2VwdFJlcGxJbnB1dEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihSZXBsQ29weUFsbEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRmlsdGVyUmVwbEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRmluZFJlcGxBY3Rpb24pO1xuXG5jbGFzcyBTZWxlY3RSZXBsQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBGb2N1c1Nlc3Npb25BY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IFJlYWRvbmx5QXJyYXk8SURlYnVnU2Vzc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKHRydWUpLmZpbHRlcihzID0+IHMuaGFzU2VwYXJhdGVSZXBsKCkgJiYgIXNlc3Npb25zVG9JZ25vcmUuaGFzKHMpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBtYXBGb2N1c2VkU2Vzc2lvblRvU2VsZWN0ZWQoZm9jdXNlZFNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBJRGVidWdTZXNzaW9uIHtcblx0XHR3aGlsZSAoZm9jdXNlZFNlc3Npb24ucGFyZW50U2Vzc2lvbiAmJiAhZm9jdXNlZFNlc3Npb24uaGFzU2VwYXJhdGVSZXBsKCkpIHtcblx0XHRcdGZvY3VzZWRTZXNzaW9uID0gZm9jdXNlZFNlc3Npb24ucGFyZW50U2Vzc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuIGZvY3VzZWRTZXNzaW9uO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXBsVmlldyh2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UpOiBSZXBsIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkKFJFUExfVklFV19JRCkgYXMgUmVwbCA/PyB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IHNlbGVjdFJlcGxDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zZWxlY3RSZXBsJztcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248UmVwbD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogc2VsZWN0UmVwbENvbW1hbmRJZCxcblx0XHRcdHZpZXdJZDogUkVQTF9WSUVXX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZWxlY3RSZXBsJywgXCJTZWxlY3QgRGVidWcgQ29uc29sZVwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBSRVBMX1ZJRVdfSUQpLCBDT05URVhUX01VTFRJX1NFU1NJT05fUkVQTCksXG5cdFx0XHRcdG9yZGVyOiAyMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBSZXBsLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdC8vIElmIHNlc3Npb24gaXMgYWxyZWFkeSB0aGUgZm9jdXNlZCBzZXNzaW9uIHdlIG5lZWQgdG8gbWFudWFseSB1cGRhdGUgdGhlIHRyZWUgc2luY2UgdmlldyBtb2RlbCB3aWxsIG5vdCBzZW5kIGEgZm9jdXNlZCBjaGFuZ2UgZXZlbnRcblx0XHRpZiAoc2Vzc2lvbiAmJiBzZXNzaW9uLnN0YXRlICE9PSBTdGF0ZS5JbmFjdGl2ZSAmJiBzZXNzaW9uICE9PSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24gPSByZXNvbHZlQ2hpbGRTZXNzaW9uKHNlc3Npb24sIGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkpO1xuXHRcdFx0YXdhaXQgZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2Vzc2lvbiwgeyBleHBsaWNpdDogdHJ1ZSB9KTtcblx0XHR9XG5cdFx0Ly8gTmVlZCB0byBzZWxlY3QgdGhlIHNlc3Npb24gaW4gdGhlIHZpZXcgc2luY2UgdGhlIGZvY3Vzc2VkIHNlc3Npb24gbWlnaHQgbm90IGhhdmUgY2hhbmdlZFxuXHRcdGF3YWl0IHZpZXcuc2VsZWN0U2Vzc2lvbihzZXNzaW9uKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248UmVwbD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5kZWJ1Zy5wYW5lbC5hY3Rpb24uY2xlYXJSZXBsQWN0aW9uJyxcblx0XHRcdHZpZXdJZDogUkVQTF9WSUVXX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2xlYXJSZXBsJywgJ0NsZWFyIENvbnNvbGUnKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ2NsZWFyUmVwbC5kZXNjcmlvdGlvbicsICdDbGVhcnMgYWxsIHByb2dyYW0gb3V0cHV0IGZyb20geW91ciBkZWJ1ZyBSRVBMJylcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IGRlYnVnQ29uc29sZUNsZWFyQWxsLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFJFUExfVklFV19JRCksXG5cdFx0XHRcdG9yZGVyOiAzMFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ29uc29sZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAyMFxuXHRcdFx0fV0sXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUsgfSxcblx0XHRcdFx0Ly8gV2VpZ2h0IGlzIGhpZ2hlciB0aGFuIHdvcmsgd29ya2JlbmNoIGNvbnRyaWJ1dGlvbnMgc28gdGhlIGtleWJpbmRpbmcgcmVtYWluc1xuXHRcdFx0XHQvLyBoaWdoZXN0IHByaW9yaXR5IHdoZW4gY2hvcmRzIGFyZSByZWdpc3RlcmVkIGFmdGVyd2FyZHNcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2ZvY3VzZWRWaWV3JywgJ3dvcmtiZW5jaC5wYW5lbC5yZXBsLnZpZXcnKVxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBSZXBsKTogdm9pZCB7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgPSBfYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cdFx0dmlldy5jbGVhclJlcGwoKTtcblx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuY2xlYXIpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxSZXBsPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcuY29sbGFwc2VSZXBsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdHZpZXdJZDogUkVQTF9WSUVXX0lELFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ29uc29sZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnel9jb21tYW5kcycsXG5cdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuSW5WaWV3KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogUmVwbCk6IHZvaWQge1xuXHRcdHZpZXcuY29sbGFwc2VBbGwoKTtcblx0XHR2aWV3LmZvY3VzKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPFJlcGw+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdkZWJ1Zy5yZXBsUGFzdGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdwYXN0ZScsIFwiUGFzdGVcIiksXG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9ERUJVR19TVEFURS5ub3RFcXVhbHNUbyhnZXRTdGF0ZUxhYmVsKFN0YXRlLkluYWN0aXZlKSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRGVidWdDb25zb2xlQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcyX2N1dGNvcHlwYXN0ZScsXG5cdFx0XHRcdG9yZGVyOiAzMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBSZXBsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgY2xpcGJvYXJkVGV4dCA9IGF3YWl0IGNsaXBib2FyZFNlcnZpY2UucmVhZFRleHQoKTtcblx0XHRpZiAoY2xpcGJvYXJkVGV4dCkge1xuXHRcdFx0Y29uc3QgcmVwbElucHV0ID0gdmlldy5nZXRSZXBsSW5wdXQoKTtcblx0XHRcdHJlcGxJbnB1dC5zZXRWYWx1ZShyZXBsSW5wdXQuZ2V0VmFsdWUoKS5jb25jYXQoY2xpcGJvYXJkVGV4dCkpO1xuXHRcdFx0dmlldy5mb2N1cygpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSByZXBsSW5wdXQuZ2V0TW9kZWwoKTtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBtb2RlbCA/IG1vZGVsLmdldExpbmVDb3VudCgpIDogMDtcblx0XHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsPy5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKHR5cGVvZiBsaW5lTnVtYmVyID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgY29sdW1uID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXBsSW5wdXQuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxSZXBsPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmRlYnVnLmFjdGlvbi5jb3B5QWxsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29weUFsbCcsIFwiQ29weSBBbGxcIiksXG5cdFx0XHR2aWV3SWQ6IFJFUExfVklFV19JRCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5EZWJ1Z0NvbnNvbGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY3V0Y29weXBhc3RlJyxcblx0XHRcdFx0b3JkZXI6IDIwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFJlcGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh2aWV3LmdldFZpc2libGVDb250ZW50KCkpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZGVidWcucmVwbENvcHknLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb3B5JywgXCJDb3B5XCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkRlYnVnQ29uc29sZUNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMl9jdXRjb3B5cGFzdGUnLFxuXHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWxlbWVudDogSVJlcGxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cdFx0Y29uc3QgZGVidWdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWJ1Z1NlcnZpY2UpO1xuXHRcdGNvbnN0IG5hdGl2ZVNlbGVjdGlvbiA9IGRvbS5nZXRBY3RpdmVXaW5kb3coKS5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSBuYXRpdmVTZWxlY3Rpb24/LnRvU3RyaW5nKCk7XG5cdFx0aWYgKHNlbGVjdGVkVGV4dCAmJiBzZWxlY3RlZFRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHNlbGVjdGVkVGV4dCk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50KSB7XG5cdFx0XHRjb25zdCByZXRWYWx1ZSA9IGF3YWl0IHRoaXMudHJ5RXZhbHVhdGVBbmRDb3B5KGRlYnVnU2VydmljZSwgZWxlbWVudCk7XG5cdFx0XHRjb25zdCB0ZXh0VG9Db3B5ID0gcmV0VmFsdWUgfHwgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKGVsZW1lbnQudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4gY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGV4dFRvQ29weSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cnlFdmFsdWF0ZUFuZENvcHkoZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLCBlbGVtZW50OiBJUmVwbEVsZW1lbnQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIHRvZG86IHdlIHNob3VsZCBleHBhbmQgREFQIHRvIGFsbG93IGNvcHlpbmcgbW9yZSB0eXBlcyBoZXJlICgjMTg3Nzg0KVxuXHRcdGlmICghKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXBsRXZhbHVhdGlvblJlc3VsdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFja0ZyYW1lID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0aWYgKCFzdGFja0ZyYW1lIHx8ICFzZXNzaW9uIHx8ICFzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NsaXBib2FyZENvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXZhbHVhdGlvbiA9IGF3YWl0IHNlc3Npb24uZXZhbHVhdGUoZWxlbWVudC5vcmlnaW5hbEV4cHJlc3Npb24sIHN0YWNrRnJhbWUuZnJhbWVJZCwgJ2NsaXBib2FyZCcpO1xuXHRcdFx0cmV0dXJuIGV2YWx1YXRpb24/LmJvZHkucmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZPQ1VTX1JFUExfSUQsXG5cdFx0XHRjYXRlZ29yeTogREVCVUdfQ09NTUFORF9DQVRFR09SWSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoeyBjb21tZW50OiBbJ0RlYnVnIGlzIGEgbm91biBpbiB0aGlzIGNvbnRleHQsIG5vdCBhIHZlcmIuJ10sIGtleTogJ2RlYnVnRm9jdXNDb25zb2xlJyB9LCBcIkZvY3VzIG9uIERlYnVnIENvbnNvbGUgVmlld1wiKSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCByZXBsID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3PFJlcGw+KFJFUExfVklFV19JRCk7XG5cdFx0YXdhaXQgcmVwbD8uZm9jdXMoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLHNCQUFzQjtBQUdsQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyx3Q0FBd0M7QUFHakQsU0FBUyxrQkFBa0IsZUFBZTtBQUUxQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUV4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGtCQUErQjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLE9BQU8sV0FBVztBQUMzQixTQUFzQixvQkFBb0I7QUFDMUMsU0FBUyxjQUFjLDRCQUE0QjtBQUNuRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBNEMsOEJBQThCLG9CQUFvQiwyQkFBZ0U7QUFFOUosU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxTQUFnQixjQUFjLFFBQVEsdUJBQXVCO0FBQ3RFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQTZCLDBCQUEwQjtBQUNoRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlEQUFpRDtB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
