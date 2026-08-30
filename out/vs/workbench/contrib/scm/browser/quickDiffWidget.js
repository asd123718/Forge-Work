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
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { Action, ActionRunner } from "../../../../base/common/actions.js";
import { Event } from "../../../../base/common/event.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { SelectActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { IMenuService, MenuId, MenuItemAction, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction } from "../../../../editor/browser/editorExtensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { IQuickDiffModelService } from "./quickDiffModel.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { rot } from "../../../../base/common/numbers.js";
import { ChangeType, getChangeHeight, getChangeType, getChangeTypeColor, getModifiedEndLineNumber, IQuickDiffService, lineIntersectsChange } from "../common/quickDiff.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { TextCompareEditorActiveContext } from "../../../common/contextkeys.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { basename } from "../../../../base/common/resources.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { gotoNextLocation, gotoPreviousLocation } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Color } from "../../../../base/common/color.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { getOuterEditor } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { quickDiffDecorationCount } from "./quickDiffDecorator.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
const isQuickDiffVisible = new RawContextKey("dirtyDiffVisible", false);
let QuickDiffPickerViewItem = class extends SelectActionViewItem {
  constructor(action, contextViewService, themeService, configurationService) {
    const styles = { ...defaultSelectBoxStyles };
    const theme = themeService.getColorTheme();
    const editorBackgroundColor = theme.getColor(editorBackground);
    const peekTitleColor = theme.getColor(peekViewTitleBackground);
    const opaqueTitleColor = peekTitleColor?.makeOpaque(editorBackgroundColor) ?? editorBackgroundColor;
    styles.selectBackground = opaqueTitleColor.lighten(0.6).toString();
    super(null, action, [], 0, contextViewService, styles, { ariaLabel: nls.localize("remotes", "Switch quick diff base"), useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this.optionsItems = [];
  }
  setSelection(quickDiffs, providerId) {
    this.optionsItems = quickDiffs.map((quickDiff) => ({ providerId: quickDiff.id, text: quickDiff.label }));
    const index = this.optionsItems.findIndex((item) => item.providerId === providerId);
    this.setOptions(this.optionsItems, index);
  }
  getActionContext(_, index) {
    return this.optionsItems[index];
  }
  render(container) {
    super.render(container);
    this.setFocusable(true);
  }
};
QuickDiffPickerViewItem = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService)
], QuickDiffPickerViewItem);
const _QuickDiffPickerBaseAction = class _QuickDiffPickerBaseAction extends Action {
  constructor(callback) {
    super(_QuickDiffPickerBaseAction.ID, _QuickDiffPickerBaseAction.LABEL, void 0, void 0);
    this.callback = callback;
  }
  async run(event) {
    return this.callback(event);
  }
};
_QuickDiffPickerBaseAction.ID = "quickDiff.base.switch";
_QuickDiffPickerBaseAction.LABEL = nls.localize("quickDiff.base.switch", "Switch Quick Diff Base");
let QuickDiffPickerBaseAction = _QuickDiffPickerBaseAction;
class QuickDiffWidgetActionRunner extends ActionRunner {
  runAction(action, context) {
    if (action instanceof MenuItemAction) {
      return action.run(...context);
    }
    return super.runAction(action, context);
  }
}
let QuickDiffWidgetEditorAction = class extends Action {
  constructor(editor, action, cssClass, keybindingService, instantiationService) {
    const label = keybindingService.appendKeybinding(action.label, action.id);
    super(action.id, label, cssClass);
    this.instantiationService = instantiationService;
    this.action = action;
    this.editor = editor;
  }
  run() {
    return Promise.resolve(this.instantiationService.invokeFunction((accessor) => this.action.run(accessor, this.editor, null)));
  }
};
QuickDiffWidgetEditorAction = __decorateClass([
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IInstantiationService)
], QuickDiffWidgetEditorAction);
let QuickDiffWidget = class extends PeekViewWidget {
  constructor(editor, model, themeService, instantiationService, menuService, contextKeyService, quickDiffService) {
    super(editor, { isResizeable: true, frameWidth: 1, keepEditorSelection: true, className: "dirty-diff" }, instantiationService);
    this.model = model;
    this.themeService = themeService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.quickDiffService = quickDiffService;
    this._index = 0;
    this._providerId = "";
    this.height = void 0;
    this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
    this._applyTheme(themeService.getColorTheme());
    if (!Iterable.isEmpty(this.model.originalTextModels)) {
      contextKeyService = contextKeyService.createOverlay([
        ["originalResourceScheme", Iterable.first(this.model.originalTextModels)?.uri.scheme],
        ["originalResourceSchemes", Iterable.map(this.model.originalTextModels, (textModel) => textModel.uri.scheme)]
      ]);
    }
    this.create();
    if (editor.hasModel()) {
      this.title = basename(editor.getModel().uri);
    } else {
      this.title = "";
    }
    this.setTitle(this.title);
  }
  get providerId() {
    return this._providerId;
  }
  get index() {
    return this._index;
  }
  get visibleRange() {
    const visibleRanges = this.diffEditor.getModifiedEditor().getVisibleRanges();
    return visibleRanges.length >= 0 ? visibleRanges[0] : void 0;
  }
  showChange(index, usePosition = true) {
    const labeledChange = this.model.changes[index];
    const change = labeledChange.change;
    this._index = index;
    this.contextKeyService.createKey("originalResource", this.model.changes[index].original.toString());
    this.contextKeyService.createKey("originalResourceScheme", this.model.changes[index].original.scheme);
    this.updateActions();
    this.change = change;
    this._providerId = labeledChange.providerId;
    if (Iterable.isEmpty(this.model.originalTextModels)) {
      return;
    }
    const onFirstDiffUpdate = Event.once(this.diffEditor.onDidUpdateDiff);
    onFirstDiffUpdate(() => setTimeout(() => this.revealChange(change), 0));
    const diffEditorModel = this.model.getDiffEditorModel(labeledChange.original);
    if (!diffEditorModel) {
      return;
    }
    this.diffEditor.setModel(diffEditorModel);
    const position = new Position(getModifiedEndLineNumber(change), 1);
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const editorHeight = this.editor.getLayoutInfo().height;
    const editorHeightInLines = Math.floor(editorHeight / lineHeight);
    const height = Math.min(
      getChangeHeight(change) + 2 + 6,
      Math.floor(editorHeightInLines / 3)
    );
    this.renderTitle();
    this.updateDropdown();
    const changeType = getChangeType(change);
    const changeTypeColor = getChangeTypeColor(this.themeService.getColorTheme(), changeType);
    this.style({ frameColor: changeTypeColor, arrowColor: changeTypeColor });
    const providerSpecificChanges = [];
    let contextIndex = index;
    for (const change2 of this.model.changes) {
      if (change2.providerId === this.model.changes[this._index].providerId) {
        providerSpecificChanges.push(change2.change);
        if (labeledChange === change2) {
          contextIndex = providerSpecificChanges.length - 1;
        }
      }
    }
    this._actionbarWidget.context = [diffEditorModel.modified.uri, providerSpecificChanges, contextIndex];
    if (usePosition) {
      this.show(position, height + 1 / lineHeight);
      this.editor.setPosition(position);
      this.editor.focus();
    }
  }
  renderTitle() {
    const providerChanges = this.model.quickDiffChanges.get(this._providerId);
    const providerIndex = providerChanges.indexOf(this._index);
    let detail;
    if (!this.shouldUseDropdown()) {
      const label = this.model.quickDiffs.find((quickDiff) => quickDiff.id === this._providerId)?.label ?? "";
      detail = this.model.changes.length > 1 ? nls.localize("changes", "{0} - {1} of {2} changes", label, providerIndex + 1, providerChanges.length) : nls.localize("change", "{0} - {1} of {2} change", label, providerIndex + 1, providerChanges.length);
      this.dropdownContainer.style.display = "none";
    } else {
      detail = this.model.changes.length > 1 ? nls.localize("multiChanges", "{0} of {1} changes", providerIndex + 1, providerChanges.length) : nls.localize("multiChange", "{0} of {1} change", providerIndex + 1, providerChanges.length);
      this.dropdownContainer.style.display = "inherit";
    }
    this.setTitle(this.title, detail);
  }
  switchQuickDiff(event) {
    const newProviderId = event?.providerId;
    if (newProviderId === this.model.changes[this._index].providerId) {
      return;
    }
    let closestGreaterIndex = this._index < this.model.changes.length - 1 ? this._index + 1 : 0;
    for (let i = closestGreaterIndex; i !== this._index; i < this.model.changes.length - 1 ? i++ : i = 0) {
      if (this.model.changes[i].providerId === newProviderId) {
        closestGreaterIndex = i;
        break;
      }
    }
    let closestLesserIndex = this._index > 0 ? this._index - 1 : this.model.changes.length - 1;
    for (let i = closestLesserIndex; i !== this._index; i > 0 ? i-- : i = this.model.changes.length - 1) {
      if (this.model.changes[i].providerId === newProviderId) {
        closestLesserIndex = i;
        break;
      }
    }
    const closestIndex = Math.abs(this.model.changes[closestGreaterIndex].change.modifiedEndLineNumber - this.model.changes[this._index].change.modifiedEndLineNumber) < Math.abs(this.model.changes[closestLesserIndex].change.modifiedEndLineNumber - this.model.changes[this._index].change.modifiedEndLineNumber) ? closestGreaterIndex : closestLesserIndex;
    this.showChange(closestIndex, false);
  }
  shouldUseDropdown() {
    const quickDiffs = this.getQuickDiffsContainingChange();
    return quickDiffs.length > 1;
  }
  updateActions() {
    if (!this._actionbarWidget) {
      return;
    }
    const previous = this.instantiationService.createInstance(QuickDiffWidgetEditorAction, this.editor, new ShowPreviousChangeAction(this.editor), ThemeIcon.asClassName(gotoPreviousLocation));
    const next = this.instantiationService.createInstance(QuickDiffWidgetEditorAction, this.editor, new ShowNextChangeAction(this.editor), ThemeIcon.asClassName(gotoNextLocation));
    this._disposables.add(previous);
    this._disposables.add(next);
    if (this.menu) {
      this.menu.dispose();
    }
    this.menu = this.menuService.createMenu(MenuId.SCMChangeContext, this.contextKeyService);
    const actions = getFlatActionBarActions(this.menu.getActions({ shouldForwardArgs: true }));
    this._actionbarWidget.clear();
    this._actionbarWidget.push(actions.reverse(), { label: false, icon: true });
    this._actionbarWidget.push([next, previous], { label: false, icon: true });
    this._actionbarWidget.push(this._disposables.add(new Action("peekview.close", nls.localize("label.close", "Close"), ThemeIcon.asClassName(Codicon.close), true, () => this.dispose())), { label: false, icon: true });
  }
  updateDropdown() {
    const quickDiffs = this.getQuickDiffsContainingChange();
    this.dropdown?.setSelection(quickDiffs, this._providerId);
  }
  getQuickDiffsContainingChange() {
    const change = this.model.changes[this._index];
    const quickDiffsWithChange = this.model.changes.filter((c) => change.change2.modified.intersectsOrTouches(c.change2.modified)).map((c) => c.providerId);
    return this.model.quickDiffs.filter((quickDiff) => quickDiffsWithChange.includes(quickDiff.id) && this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id));
  }
  _fillHead(container) {
    super._fillHead(container, true);
    const action = new QuickDiffPickerBaseAction((event) => this.switchQuickDiff(event));
    this._disposables.add(action);
    this.dropdownContainer = dom.prepend(this._titleElement, dom.$(".dropdown"));
    this.dropdown = this.instantiationService.createInstance(QuickDiffPickerViewItem, action);
    this.dropdown.render(this.dropdownContainer);
  }
  _getActionBarOptions() {
    const actionRunner = new QuickDiffWidgetActionRunner();
    this._disposables.add(actionRunner);
    this._disposables.add(actionRunner.onDidRun((e) => {
      if (!(e.action instanceof QuickDiffWidgetEditorAction) && !e.error) {
        this.dispose();
      }
    }));
    return {
      ...super._getActionBarOptions(),
      actionRunner
    };
  }
  _fillBody(container) {
    const options = {
      diffAlgorithm: "advanced",
      fixedOverflowWidgets: true,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false },
      readOnly: false,
      renderGutterMenu: false,
      renderIndicators: false,
      renderOverviewRuler: false,
      renderSideBySide: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false
      },
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false }
    };
    this.diffEditor = this.instantiationService.createInstance(EmbeddedDiffEditorWidget, container, options, {}, this.editor);
    this._disposables.add(this.diffEditor);
  }
  _onWidth(width) {
    if (typeof this.height === "undefined") {
      return;
    }
    this.diffEditor.layout({ height: this.height, width });
  }
  _doLayoutBody(height, width) {
    super._doLayoutBody(height, width);
    this.diffEditor.layout({ height, width });
    if (typeof this.height === "undefined" && this.change) {
      this.revealChange(this.change);
    }
    this.height = height;
  }
  revealChange(change) {
    let start, end;
    if (change.modifiedEndLineNumber === 0) {
      start = change.modifiedStartLineNumber;
      end = change.modifiedStartLineNumber + 1;
    } else if (change.originalEndLineNumber > 0) {
      start = change.modifiedStartLineNumber - 1;
      end = change.modifiedEndLineNumber + 1;
    } else {
      start = change.modifiedStartLineNumber;
      end = change.modifiedEndLineNumber;
    }
    this.diffEditor.revealLinesInCenter(start, end, ScrollType.Immediate);
  }
  _applyTheme(theme) {
    const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
      primaryHeadingColor: theme.getColor(peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
    });
  }
  revealRange(range) {
    this.editor.revealLineInCenterIfOutsideViewport(range.endLineNumber, ScrollType.Smooth);
  }
  hasFocus() {
    return this.diffEditor.hasTextFocus();
  }
  toggleFocus() {
    if (this.diffEditor.hasTextFocus()) {
      this.editor.focus();
    } else {
      this.diffEditor.focus();
    }
  }
  dispose() {
    this.dropdown?.dispose();
    this.menu?.dispose();
    super.dispose();
  }
};
QuickDiffWidget = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IQuickDiffService)
], QuickDiffWidget);
let QuickDiffEditorController = class extends Disposable {
  constructor(editor, contextKeyService, configurationService, quickDiffModelService, instantiationService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.quickDiffModelService = quickDiffModelService;
    this.instantiationService = instantiationService;
    this.model = null;
    this.widget = null;
    this.session = Disposable.None;
    this.mouseDownInfo = null;
    this.enabled = false;
    this.gutterActionDisposables = new DisposableStore();
    this.enabled = !contextKeyService.getContextKeyValue("isInDiffEditor");
    this.stylesheet = domStylesheetsJs.createStyleSheet(void 0, void 0, this._store);
    if (this.enabled) {
      this.isQuickDiffVisible = isQuickDiffVisible.bindTo(contextKeyService);
      this._register(editor.onDidChangeModel(() => this.close()));
      const onDidChangeGutterAction = Event.filter(configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.diffDecorationsGutterAction"));
      this._register(onDidChangeGutterAction(this.onDidChangeGutterAction, this));
      this.onDidChangeGutterAction();
    }
  }
  static get(editor) {
    return editor.getContribution(QuickDiffEditorController.ID);
  }
  onDidChangeGutterAction() {
    const gutterAction = this.configurationService.getValue("scm.diffDecorationsGutterAction");
    this.gutterActionDisposables.clear();
    if (gutterAction === "diff") {
      this.gutterActionDisposables.add(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
      this.gutterActionDisposables.add(this.editor.onMouseUp((e) => this.onEditorMouseUp(e)));
      this.stylesheet.textContent = `
				.monaco-editor .dirty-diff-glyph {
					cursor: pointer;
				}

				.monaco-editor .margin-view-overlays .dirty-diff-glyph:hover::before {
					height: 100%;
					width: 6px;
					left: -6px;
				}

				.monaco-editor .margin-view-overlays .dirty-diff-deleted:hover::after {
					bottom: 0;
					border-top-width: 0;
					border-bottom-width: 0;
				}
			`;
    } else {
      this.stylesheet.textContent = ``;
    }
  }
  canNavigate() {
    return !this.widget || this.widget?.index === -1 || !!this.model && this.model.changes.length > 1;
  }
  refresh() {
    this.widget?.showChange(this.widget.index, false);
  }
  toggleFocus() {
    if (this.widget) {
      this.widget.toggleFocus();
    }
  }
  next(lineNumber) {
    if (!this.assertWidget()) {
      return;
    }
    if (!this.widget || !this.model) {
      return;
    }
    let index;
    if (this.editor.hasModel() && (typeof lineNumber === "number" || !this.widget.providerId)) {
      index = this.model.findNextClosestChange(typeof lineNumber === "number" ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.providerId);
    } else {
      const providerChanges = this.model.quickDiffChanges.get(this.widget.providerId) ?? this.model.quickDiffChanges.values().next().value;
      const mapIndex = providerChanges.findIndex((value) => value === this.widget.index);
      index = providerChanges[rot(mapIndex + 1, providerChanges.length)];
    }
    this.widget.showChange(index);
  }
  previous(lineNumber) {
    if (!this.assertWidget()) {
      return;
    }
    if (!this.widget || !this.model) {
      return;
    }
    let index;
    if (this.editor.hasModel() && (typeof lineNumber === "number" || !this.widget.providerId)) {
      index = this.model.findPreviousClosestChange(typeof lineNumber === "number" ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.providerId);
    } else {
      const providerChanges = this.model.quickDiffChanges.get(this.widget.providerId) ?? this.model.quickDiffChanges.values().next().value;
      const mapIndex = providerChanges.findIndex((value) => value === this.widget.index);
      index = providerChanges[rot(mapIndex - 1, providerChanges.length)];
    }
    this.widget.showChange(index);
  }
  close() {
    this.session.dispose();
    this.session = Disposable.None;
  }
  assertWidget() {
    if (!this.enabled) {
      return false;
    }
    if (this.widget) {
      if (!this.model || this.model.changes.length === 0) {
        this.close();
        return false;
      }
      return true;
    }
    const editorModel = this.editor.getModel();
    if (!editorModel) {
      return false;
    }
    const modelRef = this.quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
    if (!modelRef) {
      return false;
    }
    if (modelRef.object.changes.length === 0) {
      modelRef.dispose();
      return false;
    }
    this.model = modelRef.object;
    this.widget = this.instantiationService.createInstance(QuickDiffWidget, this.editor, this.model);
    this.isQuickDiffVisible.set(true);
    const disposables = new DisposableStore();
    disposables.add(Event.once(this.widget.onDidClose)(this.close, this));
    const onDidModelChange = Event.chain(
      this.model.onDidChange,
      ($) => $.filter((e) => e.diff.length > 0).map((e) => e.diff)
    );
    onDidModelChange(this.onDidModelChange, this, disposables);
    disposables.add(modelRef);
    disposables.add(this.widget);
    disposables.add(toDisposable(() => {
      this.model = null;
      this.widget = null;
      this.isQuickDiffVisible.set(false);
      this.editor.focus();
    }));
    this.session = disposables;
    return true;
  }
  onDidModelChange(splices) {
    if (!this.model || !this.widget || this.widget.hasFocus()) {
      return;
    }
    for (const splice of splices) {
      if (splice.start <= this.widget.index) {
        this.next();
        return;
      }
    }
    this.refresh();
  }
  onEditorMouseDown(e) {
    this.mouseDownInfo = null;
    const range = e.target.range;
    if (!range) {
      return;
    }
    if (!e.event.leftButton) {
      return;
    }
    if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
      return;
    }
    if (!e.target.element) {
      return;
    }
    if (e.target.element.className.indexOf("dirty-diff-glyph") < 0) {
      return;
    }
    const data = e.target.detail;
    const offsetLeftInGutter = e.target.element.offsetLeft;
    const gutterOffsetX = data.offsetX - offsetLeftInGutter;
    if (gutterOffsetX < -3 || gutterOffsetX > 3) {
      return;
    }
    this.mouseDownInfo = { lineNumber: range.startLineNumber };
  }
  onEditorMouseUp(e) {
    if (!this.mouseDownInfo) {
      return;
    }
    const { lineNumber } = this.mouseDownInfo;
    this.mouseDownInfo = null;
    const range = e.target.range;
    if (!range || range.startLineNumber !== lineNumber) {
      return;
    }
    if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
      return;
    }
    const editorModel = this.editor.getModel();
    if (!editorModel) {
      return;
    }
    const modelRef = this.quickDiffModelService.createQuickDiffModelReference(editorModel.uri);
    if (!modelRef) {
      return;
    }
    try {
      const index = modelRef.object.changes.findIndex((change) => lineIntersectsChange(lineNumber, change.change));
      if (index < 0) {
        return;
      }
      if (index === this.widget?.index) {
        this.close();
      } else {
        this.next(lineNumber);
      }
    } finally {
      modelRef.dispose();
    }
  }
  dispose() {
    this.gutterActionDisposables.dispose();
    super.dispose();
  }
};
QuickDiffEditorController.ID = "editor.contrib.quickdiff";
QuickDiffEditorController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickDiffModelService),
  __decorateParam(4, IInstantiationService)
], QuickDiffEditorController);
class ShowPreviousChangeAction extends EditorAction {
  constructor(outerEditor) {
    super({
      id: "editor.action.dirtydiff.previous",
      label: nls.localize2("show previous change", "Show Previous Change"),
      precondition: TextCompareEditorActiveContext.toNegated(),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
    });
    this.outerEditor = outerEditor;
  }
  run(accessor) {
    const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    if (!controller.canNavigate()) {
      return;
    }
    controller.previous();
  }
}
registerEditorAction(ShowPreviousChangeAction);
class ShowNextChangeAction extends EditorAction {
  constructor(outerEditor) {
    super({
      id: "editor.action.dirtydiff.next",
      label: nls.localize2("show next change", "Show Next Change"),
      precondition: TextCompareEditorActiveContext.toNegated(),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
    });
    this.outerEditor = outerEditor;
  }
  run(accessor) {
    const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    if (!controller.canNavigate()) {
      return;
    }
    controller.next();
  }
}
registerEditorAction(ShowNextChangeAction);
class GotoPreviousChangeAction extends EditorAction {
  constructor() {
    super({
      id: "workbench.action.editor.previousChange",
      label: nls.localize2("move to previous change", "Go to Previous Change"),
      precondition: ContextKeyExpr.and(TextCompareEditorActiveContext.toNegated(), quickDiffDecorationCount.notEqualsTo(0)),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
    });
  }
  async run(accessor) {
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    const accessibilityService = accessor.get(IAccessibilityService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const quickDiffModelService = accessor.get(IQuickDiffModelService);
    if (!outerEditor || !outerEditor.hasModel()) {
      return;
    }
    const modelRef = quickDiffModelService.createQuickDiffModelReference(outerEditor.getModel().uri);
    try {
      if (!modelRef || modelRef.object.changes.length === 0) {
        return;
      }
      const lineNumber = outerEditor.getPosition().lineNumber;
      const index = modelRef.object.findPreviousClosestChange(lineNumber, false);
      const change = modelRef.object.changes[index];
      await playAccessibilitySymbolForChange(change.change, accessibilitySignalService);
      setPositionAndSelection(change.change, outerEditor, accessibilityService, codeEditorService);
    } finally {
      modelRef?.dispose();
    }
  }
}
registerEditorAction(GotoPreviousChangeAction);
class GotoNextChangeAction extends EditorAction {
  constructor() {
    super({
      id: "workbench.action.editor.nextChange",
      label: nls.localize2("move to next change", "Go to Next Change"),
      precondition: ContextKeyExpr.and(TextCompareEditorActiveContext.toNegated(), quickDiffDecorationCount.notEqualsTo(0)),
      kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
    });
  }
  async run(accessor) {
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    const accessibilityService = accessor.get(IAccessibilityService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const quickDiffModelService = accessor.get(IQuickDiffModelService);
    if (!outerEditor || !outerEditor.hasModel()) {
      return;
    }
    const modelRef = quickDiffModelService.createQuickDiffModelReference(outerEditor.getModel().uri);
    try {
      if (!modelRef || modelRef.object.changes.length === 0) {
        return;
      }
      const lineNumber = outerEditor.getPosition().lineNumber;
      const index = modelRef.object.findNextClosestChange(lineNumber, false);
      const change = modelRef.object.changes[index].change;
      await playAccessibilitySymbolForChange(change, accessibilitySignalService);
      setPositionAndSelection(change, outerEditor, accessibilityService, codeEditorService);
    } finally {
      modelRef?.dispose();
    }
  }
}
registerEditorAction(GotoNextChangeAction);
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "7_change_nav",
  command: {
    id: "editor.action.dirtydiff.next",
    title: nls.localize({ key: "miGotoNextChange", comment: ["&& denotes a mnemonic"] }, "Next &&Change")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "7_change_nav",
  command: {
    id: "editor.action.dirtydiff.previous",
    title: nls.localize({ key: "miGotoPreviousChange", comment: ["&& denotes a mnemonic"] }, "Previous &&Change")
  },
  order: 2
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "closeQuickDiff",
  weight: KeybindingWeight.EditorContrib + 50,
  primary: KeyCode.Escape,
  secondary: [KeyMod.Shift | KeyCode.Escape],
  when: ContextKeyExpr.and(isQuickDiffVisible),
  handler: (accessor) => {
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    controller.close();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "toggleQuickDiffWidgetFocus",
  weight: KeybindingWeight.EditorContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F2),
  when: isQuickDiffVisible,
  handler: (accessor) => {
    const outerEditor = getOuterEditorFromDiffEditor(accessor);
    if (!outerEditor) {
      return;
    }
    const controller = QuickDiffEditorController.get(outerEditor);
    if (!controller) {
      return;
    }
    controller.toggleFocus();
  }
});
function setPositionAndSelection(change, editor, accessibilityService, codeEditorService) {
  const position = new Position(change.modifiedStartLineNumber, 1);
  editor.setPosition(position);
  editor.revealPositionInCenter(position);
  if (accessibilityService.isScreenReaderOptimized()) {
    editor.setSelection({ startLineNumber: change.modifiedStartLineNumber, startColumn: 0, endLineNumber: change.modifiedStartLineNumber, endColumn: Number.MAX_VALUE });
    codeEditorService.getActiveCodeEditor()?.writeScreenReaderContent("diff-navigation");
  }
}
async function playAccessibilitySymbolForChange(change, accessibilitySignalService) {
  const changeType = getChangeType(change);
  switch (changeType) {
    case ChangeType.Add:
      accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { allowManyInParallel: true, source: "quickDiffDecoration" });
      break;
    case ChangeType.Delete:
      accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { allowManyInParallel: true, source: "quickDiffDecoration" });
      break;
    case ChangeType.Modify:
      accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { allowManyInParallel: true, source: "quickDiffDecoration" });
      break;
  }
}
function getOuterEditorFromDiffEditor(accessor) {
  const diffEditors = accessor.get(ICodeEditorService).listDiffEditors();
  for (const diffEditor of diffEditors) {
    if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
      return diffEditor.getParentEditor();
    }
  }
  return getOuterEditor(accessor);
}
export {
  GotoNextChangeAction,
  GotoPreviousChangeAction,
  QuickDiffEditorController,
  QuickDiffPickerBaseAction,
  QuickDiffPickerViewItem,
  ShowNextChangeAction,
  ShowPreviousChangeAction,
  isQuickDiffVisible
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3NlclxccXVpY2tEaWZmV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIEFjdGlvblJ1bm5lciwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IFNlbGVjdEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcGVla1ZpZXdCb3JkZXIsIHBlZWtWaWV3VGl0bGVCYWNrZ3JvdW5kLCBwZWVrVmlld1RpdGxlRm9yZWdyb3VuZCwgcGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kLCBQZWVrVmlld1dpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElFZGl0b3JNb3VzZUV2ZW50LCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9lbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElRdWlja0RpZmZNb2RlbFNlcnZpY2UsIFF1aWNrRGlmZk1vZGVsIH0gZnJvbSAnLi9xdWlja0RpZmZNb2RlbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgcm90IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBJU3BsaWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgQ2hhbmdlVHlwZSwgZ2V0Q2hhbmdlSGVpZ2h0LCBnZXRDaGFuZ2VUeXBlLCBnZXRDaGFuZ2VUeXBlQ29sb3IsIGdldE1vZGlmaWVkRW5kTGluZU51bWJlciwgSVF1aWNrRGlmZlNlcnZpY2UsIGxpbmVJbnRlcnNlY3RzQ2hhbmdlLCBRdWlja0RpZmYsIFF1aWNrRGlmZkNoYW5nZSB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0RpZmYuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2xlZ2FjeUxpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBY3Rpb25CYXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGdvdG9OZXh0TG9jYXRpb24sIGdvdG9QcmV2aW91c0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgZ2V0T3V0ZXJFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgcXVpY2tEaWZmRGVjb3JhdGlvbkNvdW50IH0gZnJvbSAnLi9xdWlja0RpZmZEZWNvcmF0b3IuanMnO1xuaW1wb3J0IHsgaGFzTmF0aXZlQ29udGV4dE1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5cbmV4cG9ydCBjb25zdCBpc1F1aWNrRGlmZlZpc2libGUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZGlydHlEaWZmVmlzaWJsZScsIGZhbHNlKTtcblxuZXhwb3J0IGludGVyZmFjZSBJUXVpY2tEaWZmU2VsZWN0SXRlbSBleHRlbmRzIElTZWxlY3RPcHRpb25JdGVtIHtcblx0cHJvdmlkZXJJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tEaWZmUGlja2VyVmlld0l0ZW0gZXh0ZW5kcyBTZWxlY3RBY3Rpb25WaWV3SXRlbTxJUXVpY2tEaWZmU2VsZWN0SXRlbT4ge1xuXHRwcml2YXRlIG9wdGlvbnNJdGVtczogSVF1aWNrRGlmZlNlbGVjdEl0ZW1bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgc3R5bGVzID0geyAuLi5kZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH07XG5cdFx0Y29uc3QgdGhlbWUgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRcdGNvbnN0IHBlZWtUaXRsZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUJhY2tncm91bmQpO1xuXHRcdGNvbnN0IG9wYXF1ZVRpdGxlQ29sb3IgPSBwZWVrVGl0bGVDb2xvcj8ubWFrZU9wYXF1ZShlZGl0b3JCYWNrZ3JvdW5kQ29sb3IhKSA/PyBlZGl0b3JCYWNrZ3JvdW5kQ29sb3IhO1xuXHRcdHN0eWxlcy5zZWxlY3RCYWNrZ3JvdW5kID0gb3BhcXVlVGl0bGVDb2xvci5saWdodGVuKC42KS50b1N0cmluZygpO1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgW10sIDAsIGNvbnRleHRWaWV3U2VydmljZSwgc3R5bGVzLCB7IGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGVzJywgJ1N3aXRjaCBxdWljayBkaWZmIGJhc2UnKSwgdXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudShjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9uKHF1aWNrRGlmZnM6IFF1aWNrRGlmZltdLCBwcm92aWRlcklkOiBzdHJpbmcpIHtcblx0XHR0aGlzLm9wdGlvbnNJdGVtcyA9IHF1aWNrRGlmZnMubWFwKHF1aWNrRGlmZiA9PiAoeyBwcm92aWRlcklkOiBxdWlja0RpZmYuaWQsIHRleHQ6IHF1aWNrRGlmZi5sYWJlbCB9KSk7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm9wdGlvbnNJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnByb3ZpZGVySWQgPT09IHByb3ZpZGVySWQpO1xuXHRcdHRoaXMuc2V0T3B0aW9ucyh0aGlzLm9wdGlvbnNJdGVtcywgaW5kZXgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEFjdGlvbkNvbnRleHQoXzogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogSVF1aWNrRGlmZlNlbGVjdEl0ZW0ge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnNJdGVtc1tpbmRleF07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMuc2V0Rm9jdXNhYmxlKHRydWUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja0RpZmZQaWNrZXJCYXNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3F1aWNrRGlmZi5iYXNlLnN3aXRjaCc7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBubHMubG9jYWxpemUoJ3F1aWNrRGlmZi5iYXNlLnN3aXRjaCcsIFwiU3dpdGNoIFF1aWNrIERpZmYgQmFzZVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNhbGxiYWNrOiAoZXZlbnQ/OiBJUXVpY2tEaWZmU2VsZWN0SXRlbSkgPT4gdm9pZCkge1xuXHRcdHN1cGVyKFF1aWNrRGlmZlBpY2tlckJhc2VBY3Rpb24uSUQsIFF1aWNrRGlmZlBpY2tlckJhc2VBY3Rpb24uTEFCRUwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihldmVudD86IElRdWlja0RpZmZTZWxlY3RJdGVtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FsbGJhY2soZXZlbnQpO1xuXHR9XG59XG5cbmNsYXNzIFF1aWNrRGlmZldpZGdldEFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJ1bkFjdGlvbihhY3Rpb246IElBY3Rpb24sIGNvbnRleHQ6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0cmV0dXJuIGFjdGlvbi5ydW4oLi4uY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIGNvbnRleHQpO1xuXHR9XG59XG5cbmNsYXNzIFF1aWNrRGlmZldpZGdldEVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0cHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIGFjdGlvbjogRWRpdG9yQWN0aW9uO1xuXHRwcml2YXRlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRhY3Rpb246IEVkaXRvckFjdGlvbixcblx0XHRjc3NDbGFzczogc3RyaW5nLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgbGFiZWwgPSBrZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKGFjdGlvbi5sYWJlbCwgYWN0aW9uLmlkKTtcblxuXHRcdHN1cGVyKGFjdGlvbi5pZCwgbGFiZWwsIGNzc0NsYXNzKTtcblxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHR0aGlzLmFjdGlvbiA9IGFjdGlvbjtcblx0XHR0aGlzLmVkaXRvciA9IGVkaXRvcjtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gdGhpcy5hY3Rpb24ucnVuKGFjY2Vzc29yLCB0aGlzLmVkaXRvciwgbnVsbCkpKTtcblx0fVxufVxuXG5jbGFzcyBRdWlja0RpZmZXaWRnZXQgZXh0ZW5kcyBQZWVrVmlld1dpZGdldCB7XG5cblx0cHJpdmF0ZSBkaWZmRWRpdG9yITogRW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIHRpdGxlOiBzdHJpbmc7XG5cdHByaXZhdGUgbWVudTogSU1lbnUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2luZGV4OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9wcm92aWRlcklkOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBjaGFuZ2U6IElDaGFuZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZHJvcGRvd246IFF1aWNrRGlmZlBpY2tlclZpZXdJdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRyb3Bkb3duQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgbW9kZWw6IFF1aWNrRGlmZk1vZGVsLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVF1aWNrRGlmZlNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0RpZmZTZXJ2aWNlOiBJUXVpY2tEaWZmU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IsIHsgaXNSZXNpemVhYmxlOiB0cnVlLCBmcmFtZVdpZHRoOiAxLCBrZWVwRWRpdG9yU2VsZWN0aW9uOiB0cnVlLCBjbGFzc05hbWU6ICdkaXJ0eS1kaWZmJyB9LCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLl9hcHBseVRoZW1lLCB0aGlzKSk7XG5cdFx0dGhpcy5fYXBwbHlUaGVtZSh0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblxuXHRcdGlmICghSXRlcmFibGUuaXNFbXB0eSh0aGlzLm1vZGVsLm9yaWdpbmFsVGV4dE1vZGVscykpIHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRcdFsnb3JpZ2luYWxSZXNvdXJjZVNjaGVtZScsIEl0ZXJhYmxlLmZpcnN0KHRoaXMubW9kZWwub3JpZ2luYWxUZXh0TW9kZWxzKT8udXJpLnNjaGVtZV0sXG5cdFx0XHRcdFsnb3JpZ2luYWxSZXNvdXJjZVNjaGVtZXMnLCBJdGVyYWJsZS5tYXAodGhpcy5tb2RlbC5vcmlnaW5hbFRleHRNb2RlbHMsIHRleHRNb2RlbCA9PiB0ZXh0TW9kZWwudXJpLnNjaGVtZSldXSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0XHRpZiAoZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMudGl0bGUgPSBiYXNlbmFtZShlZGl0b3IuZ2V0TW9kZWwoKS51cmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRpdGxlID0gJyc7XG5cdFx0fVxuXHRcdHRoaXMuc2V0VGl0bGUodGhpcy50aXRsZSk7XG5cdH1cblxuXHRnZXQgcHJvdmlkZXJJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlcklkO1xuXHR9XG5cblx0Z2V0IGluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2luZGV4O1xuXHR9XG5cblx0Z2V0IHZpc2libGVSYW5nZSgpOiBSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuZGlmZkVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmdldFZpc2libGVSYW5nZXMoKTtcblx0XHRyZXR1cm4gdmlzaWJsZVJhbmdlcy5sZW5ndGggPj0gMCA/IHZpc2libGVSYW5nZXNbMF0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzaG93Q2hhbmdlKGluZGV4OiBudW1iZXIsIHVzZVBvc2l0aW9uOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGxhYmVsZWRDaGFuZ2UgPSB0aGlzLm1vZGVsLmNoYW5nZXNbaW5kZXhdO1xuXHRcdGNvbnN0IGNoYW5nZSA9IGxhYmVsZWRDaGFuZ2UuY2hhbmdlO1xuXHRcdHRoaXMuX2luZGV4ID0gaW5kZXg7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ29yaWdpbmFsUmVzb3VyY2UnLCB0aGlzLm1vZGVsLmNoYW5nZXNbaW5kZXhdLm9yaWdpbmFsLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdvcmlnaW5hbFJlc291cmNlU2NoZW1lJywgdGhpcy5tb2RlbC5jaGFuZ2VzW2luZGV4XS5vcmlnaW5hbC5zY2hlbWUpO1xuXHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXG5cdFx0dGhpcy5jaGFuZ2UgPSBjaGFuZ2U7XG5cdFx0dGhpcy5fcHJvdmlkZXJJZCA9IGxhYmVsZWRDaGFuZ2UucHJvdmlkZXJJZDtcblxuXHRcdGlmIChJdGVyYWJsZS5pc0VtcHR5KHRoaXMubW9kZWwub3JpZ2luYWxUZXh0TW9kZWxzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRmlyc3REaWZmVXBkYXRlID0gRXZlbnQub25jZSh0aGlzLmRpZmZFZGl0b3Iub25EaWRVcGRhdGVEaWZmKTtcblxuXHRcdC8vIFRPRE9Aam9hbyBUT0RPQGFsZXggbmVlZCB0aGlzIHNldFRpbWVvdXQgcHJvYmFibHkgYmVjYXVzZSB0aGVcblx0XHQvLyBub24tc2lkZS1ieS1zaWRlIGRpZmYgc3RpbGwgaGFzbid0IGNyZWF0ZWQgdGhlIHZpZXcgem9uZXNcblx0XHRvbkZpcnN0RGlmZlVwZGF0ZSgoKSA9PiBzZXRUaW1lb3V0KCgpID0+IHRoaXMucmV2ZWFsQ2hhbmdlKGNoYW5nZSksIDApKTtcblxuXHRcdGNvbnN0IGRpZmZFZGl0b3JNb2RlbCA9IHRoaXMubW9kZWwuZ2V0RGlmZkVkaXRvck1vZGVsKGxhYmVsZWRDaGFuZ2Uub3JpZ2luYWwpO1xuXHRcdGlmICghZGlmZkVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGlmZkVkaXRvci5zZXRNb2RlbChkaWZmRWRpdG9yTW9kZWwpO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oZ2V0TW9kaWZpZWRFbmRMaW5lTnVtYmVyKGNoYW5nZSksIDEpO1xuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodDtcblx0XHRjb25zdCBlZGl0b3JIZWlnaHRJbkxpbmVzID0gTWF0aC5mbG9vcihlZGl0b3JIZWlnaHQgLyBsaW5lSGVpZ2h0KTtcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbihcblx0XHRcdGdldENoYW5nZUhlaWdodChjaGFuZ2UpICsgMiAvKiBhcnJvdywgZnJhbWUsIGhlYWRlciAqLyArIDYgLyogMyBsaW5lcyBhYm92ZS9iZWxvdyB0aGUgY2hhbmdlICovLFxuXHRcdFx0TWF0aC5mbG9vcihlZGl0b3JIZWlnaHRJbkxpbmVzIC8gMykpO1xuXG5cdFx0dGhpcy5yZW5kZXJUaXRsZSgpO1xuXHRcdHRoaXMudXBkYXRlRHJvcGRvd24oKTtcblxuXHRcdGNvbnN0IGNoYW5nZVR5cGUgPSBnZXRDaGFuZ2VUeXBlKGNoYW5nZSk7XG5cdFx0Y29uc3QgY2hhbmdlVHlwZUNvbG9yID0gZ2V0Q2hhbmdlVHlwZUNvbG9yKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSwgY2hhbmdlVHlwZSk7XG5cdFx0dGhpcy5zdHlsZSh7IGZyYW1lQ29sb3I6IGNoYW5nZVR5cGVDb2xvciwgYXJyb3dDb2xvcjogY2hhbmdlVHlwZUNvbG9yIH0pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJTcGVjaWZpY0NoYW5nZXM6IElDaGFuZ2VbXSA9IFtdO1xuXHRcdGxldCBjb250ZXh0SW5kZXggPSBpbmRleDtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiB0aGlzLm1vZGVsLmNoYW5nZXMpIHtcblx0XHRcdGlmIChjaGFuZ2UucHJvdmlkZXJJZCA9PT0gdGhpcy5tb2RlbC5jaGFuZ2VzW3RoaXMuX2luZGV4XS5wcm92aWRlcklkKSB7XG5cdFx0XHRcdHByb3ZpZGVyU3BlY2lmaWNDaGFuZ2VzLnB1c2goY2hhbmdlLmNoYW5nZSk7XG5cdFx0XHRcdGlmIChsYWJlbGVkQ2hhbmdlID09PSBjaGFuZ2UpIHtcblx0XHRcdFx0XHRjb250ZXh0SW5kZXggPSBwcm92aWRlclNwZWNpZmljQ2hhbmdlcy5sZW5ndGggLSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGlvbmJhcldpZGdldCEuY29udGV4dCA9IFtkaWZmRWRpdG9yTW9kZWwubW9kaWZpZWQudXJpLCBwcm92aWRlclNwZWNpZmljQ2hhbmdlcywgY29udGV4dEluZGV4XTtcblx0XHRpZiAodXNlUG9zaXRpb24pIHtcblx0XHRcdC8vIEluIG9yZGVyIHRvIGFjY291bnQgZm9yIHRoZSAxcHggYm9yZGVyLXRvcCBvZiB0aGUgY29udGVudCBlbGVtZW50IHdlXG5cdFx0XHQvLyBoYXZlIHRvIGFkZCAxcHguIFRoZSBwaXhlbCB2YWx1ZSBuZWVkcyB0byBiZSBleHByZXNzZWQgYXMgYSBmcmFjdGlvblxuXHRcdFx0Ly8gb2YgdGhlIGxpbmUgaGVpZ2h0LlxuXHRcdFx0dGhpcy5zaG93KHBvc2l0aW9uLCBoZWlnaHQgKyAoMSAvIGxpbmVIZWlnaHQpKTtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUaXRsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlckNoYW5nZXMgPSB0aGlzLm1vZGVsLnF1aWNrRGlmZkNoYW5nZXMuZ2V0KHRoaXMuX3Byb3ZpZGVySWQpITtcblx0XHRjb25zdCBwcm92aWRlckluZGV4ID0gcHJvdmlkZXJDaGFuZ2VzLmluZGV4T2YodGhpcy5faW5kZXgpO1xuXG5cdFx0bGV0IGRldGFpbDogc3RyaW5nO1xuXHRcdGlmICghdGhpcy5zaG91bGRVc2VEcm9wZG93bigpKSB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMubW9kZWwucXVpY2tEaWZmc1xuXHRcdFx0XHQuZmluZChxdWlja0RpZmYgPT4gcXVpY2tEaWZmLmlkID09PSB0aGlzLl9wcm92aWRlcklkKT8ubGFiZWwgPz8gJyc7XG5cblx0XHRcdGRldGFpbCA9IHRoaXMubW9kZWwuY2hhbmdlcy5sZW5ndGggPiAxXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdjaGFuZ2VzJywgXCJ7MH0gLSB7MX0gb2YgezJ9IGNoYW5nZXNcIiwgbGFiZWwsIHByb3ZpZGVySW5kZXggKyAxLCBwcm92aWRlckNoYW5nZXMubGVuZ3RoKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY2hhbmdlJywgXCJ7MH0gLSB7MX0gb2YgezJ9IGNoYW5nZVwiLCBsYWJlbCwgcHJvdmlkZXJJbmRleCArIDEsIHByb3ZpZGVyQ2hhbmdlcy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5kcm9wZG93bkNvbnRhaW5lciEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGV0YWlsID0gdGhpcy5tb2RlbC5jaGFuZ2VzLmxlbmd0aCA+IDFcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ211bHRpQ2hhbmdlcycsIFwiezB9IG9mIHsxfSBjaGFuZ2VzXCIsIHByb3ZpZGVySW5kZXggKyAxLCBwcm92aWRlckNoYW5nZXMubGVuZ3RoKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbXVsdGlDaGFuZ2UnLCBcInswfSBvZiB7MX0gY2hhbmdlXCIsIHByb3ZpZGVySW5kZXggKyAxLCBwcm92aWRlckNoYW5nZXMubGVuZ3RoKTtcblx0XHRcdHRoaXMuZHJvcGRvd25Db250YWluZXIhLnN0eWxlLmRpc3BsYXkgPSAnaW5oZXJpdCc7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRUaXRsZSh0aGlzLnRpdGxlLCBkZXRhaWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBzd2l0Y2hRdWlja0RpZmYoZXZlbnQ/OiBJUXVpY2tEaWZmU2VsZWN0SXRlbSkge1xuXHRcdGNvbnN0IG5ld1Byb3ZpZGVySWQgPSBldmVudD8ucHJvdmlkZXJJZDtcblx0XHRpZiAobmV3UHJvdmlkZXJJZCA9PT0gdGhpcy5tb2RlbC5jaGFuZ2VzW3RoaXMuX2luZGV4XS5wcm92aWRlcklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBjbG9zZXN0R3JlYXRlckluZGV4ID0gdGhpcy5faW5kZXggPCB0aGlzLm1vZGVsLmNoYW5nZXMubGVuZ3RoIC0gMSA/IHRoaXMuX2luZGV4ICsgMSA6IDA7XG5cdFx0Zm9yIChsZXQgaSA9IGNsb3Nlc3RHcmVhdGVySW5kZXg7IGkgIT09IHRoaXMuX2luZGV4OyBpIDwgdGhpcy5tb2RlbC5jaGFuZ2VzLmxlbmd0aCAtIDEgPyBpKysgOiBpID0gMCkge1xuXHRcdFx0aWYgKHRoaXMubW9kZWwuY2hhbmdlc1tpXS5wcm92aWRlcklkID09PSBuZXdQcm92aWRlcklkKSB7XG5cdFx0XHRcdGNsb3Nlc3RHcmVhdGVySW5kZXggPSBpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IGNsb3Nlc3RMZXNzZXJJbmRleCA9IHRoaXMuX2luZGV4ID4gMCA/IHRoaXMuX2luZGV4IC0gMSA6IHRoaXMubW9kZWwuY2hhbmdlcy5sZW5ndGggLSAxO1xuXHRcdGZvciAobGV0IGkgPSBjbG9zZXN0TGVzc2VySW5kZXg7IGkgIT09IHRoaXMuX2luZGV4OyBpID4gMCA/IGktLSA6IGkgPSB0aGlzLm1vZGVsLmNoYW5nZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0aWYgKHRoaXMubW9kZWwuY2hhbmdlc1tpXS5wcm92aWRlcklkID09PSBuZXdQcm92aWRlcklkKSB7XG5cdFx0XHRcdGNsb3Nlc3RMZXNzZXJJbmRleCA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjbG9zZXN0SW5kZXggPSBNYXRoLmFicyh0aGlzLm1vZGVsLmNoYW5nZXNbY2xvc2VzdEdyZWF0ZXJJbmRleF0uY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlciAtIHRoaXMubW9kZWwuY2hhbmdlc1t0aGlzLl9pbmRleF0uY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlcilcblx0XHRcdDwgTWF0aC5hYnModGhpcy5tb2RlbC5jaGFuZ2VzW2Nsb3Nlc3RMZXNzZXJJbmRleF0uY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlciAtIHRoaXMubW9kZWwuY2hhbmdlc1t0aGlzLl9pbmRleF0uY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlcilcblx0XHRcdD8gY2xvc2VzdEdyZWF0ZXJJbmRleCA6IGNsb3Nlc3RMZXNzZXJJbmRleDtcblx0XHR0aGlzLnNob3dDaGFuZ2UoY2xvc2VzdEluZGV4LCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFVzZURyb3Bkb3duKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHF1aWNrRGlmZnMgPSB0aGlzLmdldFF1aWNrRGlmZnNDb250YWluaW5nQ2hhbmdlKCk7XG5cdFx0cmV0dXJuIHF1aWNrRGlmZnMubGVuZ3RoID4gMTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWN0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2FjdGlvbmJhcldpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tEaWZmV2lkZ2V0RWRpdG9yQWN0aW9uLCB0aGlzLmVkaXRvciwgbmV3IFNob3dQcmV2aW91c0NoYW5nZUFjdGlvbih0aGlzLmVkaXRvciksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShnb3RvUHJldmlvdXNMb2NhdGlvbikpO1xuXHRcdGNvbnN0IG5leHQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRGlmZldpZGdldEVkaXRvckFjdGlvbiwgdGhpcy5lZGl0b3IsIG5ldyBTaG93TmV4dENoYW5nZUFjdGlvbih0aGlzLmVkaXRvciksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShnb3RvTmV4dExvY2F0aW9uKSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQocHJldmlvdXMpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXh0KTtcblxuXHRcdGlmICh0aGlzLm1lbnUpIHtcblx0XHRcdHRoaXMubWVudS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMubWVudSA9IHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuU0NNQ2hhbmdlQ29udGV4dCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKHRoaXMubWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdHRoaXMuX2FjdGlvbmJhcldpZGdldC5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGlvbmJhcldpZGdldC5wdXNoKGFjdGlvbnMucmV2ZXJzZSgpLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQucHVzaChbbmV4dCwgcHJldmlvdXNdLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQucHVzaCh0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbigncGVla3ZpZXcuY2xvc2UnLCBubHMubG9jYWxpemUoJ2xhYmVsLmNsb3NlJywgXCJDbG9zZVwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLCB0cnVlLCAoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRHJvcGRvd24oKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVpY2tEaWZmcyA9IHRoaXMuZ2V0UXVpY2tEaWZmc0NvbnRhaW5pbmdDaGFuZ2UoKTtcblx0XHR0aGlzLmRyb3Bkb3duPy5zZXRTZWxlY3Rpb24ocXVpY2tEaWZmcywgdGhpcy5fcHJvdmlkZXJJZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFF1aWNrRGlmZnNDb250YWluaW5nQ2hhbmdlKCk6IFF1aWNrRGlmZltdIHtcblx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLm1vZGVsLmNoYW5nZXNbdGhpcy5faW5kZXhdO1xuXG5cdFx0Y29uc3QgcXVpY2tEaWZmc1dpdGhDaGFuZ2UgPSB0aGlzLm1vZGVsLmNoYW5nZXNcblx0XHRcdC5maWx0ZXIoYyA9PiBjaGFuZ2UuY2hhbmdlMi5tb2RpZmllZC5pbnRlcnNlY3RzT3JUb3VjaGVzKGMuY2hhbmdlMi5tb2RpZmllZCkpXG5cdFx0XHQubWFwKGMgPT4gYy5wcm92aWRlcklkKTtcblxuXHRcdHJldHVybiB0aGlzLm1vZGVsLnF1aWNrRGlmZnNcblx0XHRcdC5maWx0ZXIocXVpY2tEaWZmID0+IHF1aWNrRGlmZnNXaXRoQ2hhbmdlLmluY2x1ZGVzKHF1aWNrRGlmZi5pZCkgJiZcblx0XHRcdFx0dGhpcy5xdWlja0RpZmZTZXJ2aWNlLmlzUXVpY2tEaWZmUHJvdmlkZXJWaXNpYmxlKHF1aWNrRGlmZi5pZCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsSGVhZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuX2ZpbGxIZWFkKGNvbnRhaW5lciwgdHJ1ZSk7XG5cblx0XHQvLyBSZW5kZXIgYW4gZW1wdHkgcGlja2VyIHdoaWNoIHdpbGwgYmUgcG9wdWxhdGVkIGxhdGVyXG5cdFx0Y29uc3QgYWN0aW9uID0gbmV3IFF1aWNrRGlmZlBpY2tlckJhc2VBY3Rpb24oKGV2ZW50PzogSVF1aWNrRGlmZlNlbGVjdEl0ZW0pID0+IHRoaXMuc3dpdGNoUXVpY2tEaWZmKGV2ZW50KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGFjdGlvbik7XG5cblx0XHR0aGlzLmRyb3Bkb3duQ29udGFpbmVyID0gZG9tLnByZXBlbmQodGhpcy5fdGl0bGVFbGVtZW50ISwgZG9tLiQoJy5kcm9wZG93bicpKTtcblx0XHR0aGlzLmRyb3Bkb3duID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0RpZmZQaWNrZXJWaWV3SXRlbSwgYWN0aW9uKTtcblx0XHR0aGlzLmRyb3Bkb3duLnJlbmRlcih0aGlzLmRyb3Bkb3duQ29udGFpbmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0QWN0aW9uQmFyT3B0aW9ucygpOiBJQWN0aW9uQmFyT3B0aW9ucyB7XG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gbmV3IFF1aWNrRGlmZldpZGdldEFjdGlvblJ1bm5lcigpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhY3Rpb25SdW5uZXIpO1xuXG5cdFx0Ly8gY2xvc2Ugd2lkZ2V0IG9uIHN1Y2Nlc3NmdWwgYWN0aW9uXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGFjdGlvblJ1bm5lci5vbkRpZFJ1bihlID0+IHtcblx0XHRcdGlmICghKGUuYWN0aW9uIGluc3RhbmNlb2YgUXVpY2tEaWZmV2lkZ2V0RWRpdG9yQWN0aW9uKSAmJiAhZS5lcnJvcikge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc3VwZXIuX2dldEFjdGlvbkJhck9wdGlvbnMoKSxcblx0XHRcdGFjdGlvblJ1bm5lclxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2ZpbGxCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zOiBJRGlmZkVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRkaWZmQWxnb3JpdGhtOiAnYWR2YW5jZWQnLFxuXHRcdFx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHRydWUsXG5cdFx0XHRpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRyZWFkT25seTogZmFsc2UsXG5cdFx0XHRyZW5kZXJHdXR0ZXJNZW51OiBmYWxzZSxcblx0XHRcdHJlbmRlckluZGljYXRvcnM6IGZhbHNlLFxuXHRcdFx0cmVuZGVyT3ZlcnZpZXdSdWxlcjogZmFsc2UsXG5cdFx0XHRyZW5kZXJTaWRlQnlTaWRlOiBmYWxzZSxcblx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDE0LFxuXHRcdFx0XHRob3Jpem9udGFsOiAnYXV0bycsXG5cdFx0XHRcdHVzZVNoYWRvd3M6IHRydWUsXG5cdFx0XHRcdHZlcnRpY2FsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbEhhc0Fycm93czogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRzdGlja3lTY3JvbGw6IHsgZW5hYmxlZDogZmFsc2UgfVxuXHRcdH07XG5cblx0XHR0aGlzLmRpZmZFZGl0b3IgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldCwgY29udGFpbmVyLCBvcHRpb25zLCB7fSwgdGhpcy5lZGl0b3IpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmRpZmZFZGl0b3IpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuaGVpZ2h0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlmZkVkaXRvci5sYXlvdXQoeyBoZWlnaHQ6IHRoaXMuaGVpZ2h0LCB3aWR0aCB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIuX2RvTGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLmRpZmZFZGl0b3IubGF5b3V0KHsgaGVpZ2h0LCB3aWR0aCB9KTtcblxuXHRcdGlmICh0eXBlb2YgdGhpcy5oZWlnaHQgPT09ICd1bmRlZmluZWQnICYmIHRoaXMuY2hhbmdlKSB7XG5cdFx0XHR0aGlzLnJldmVhbENoYW5nZSh0aGlzLmNoYW5nZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIHJldmVhbENoYW5nZShjaGFuZ2U6IElDaGFuZ2UpOiB2b2lkIHtcblx0XHRsZXQgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXI7XG5cblx0XHRpZiAoY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlciA9PT0gMCkgeyAvLyBkZWxldGlvblxuXHRcdFx0c3RhcnQgPSBjaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRlbmQgPSBjaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgKyAxO1xuXHRcdH0gZWxzZSBpZiAoY2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlciA+IDApIHsgLy8gbW9kaWZpY2F0aW9uXG5cdFx0XHRzdGFydCA9IGNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlciAtIDE7XG5cdFx0XHRlbmQgPSBjaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyICsgMTtcblx0XHR9IGVsc2UgeyAvLyBpbnNlcnRpb25cblx0XHRcdHN0YXJ0ID0gY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0ZW5kID0gY2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlcjtcblx0XHR9XG5cblx0XHR0aGlzLmRpZmZFZGl0b3IucmV2ZWFsTGluZXNJbkNlbnRlcihzdGFydCwgZW5kLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRoZW1lKHRoZW1lOiBJQ29sb3JUaGVtZSkge1xuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdCb3JkZXIpIHx8IENvbG9yLnRyYW5zcGFyZW50O1xuXHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0YXJyb3dDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRmcmFtZUNvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdGhlYWRlckJhY2tncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUJhY2tncm91bmQpIHx8IENvbG9yLnRyYW5zcGFyZW50LFxuXHRcdFx0cHJpbWFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUZvcmVncm91bmQpLFxuXHRcdFx0c2Vjb25kYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlld1RpdGxlSW5mb0ZvcmVncm91bmQpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmV2ZWFsUmFuZ2UocmFuZ2U6IFJhbmdlKSB7XG5cdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocmFuZ2UuZW5kTGluZU51bWJlciwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvci5oYXNUZXh0Rm9jdXMoKTtcblx0fVxuXG5cdHRvZ2dsZUZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpZmZFZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlmZkVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5kcm9wZG93bj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMubWVudT8uZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tEaWZmRWRpdG9yQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLnF1aWNrZGlmZic7XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogUXVpY2tEaWZmRWRpdG9yQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXI+KFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBtb2RlbDogUXVpY2tEaWZmTW9kZWwgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB3aWRnZXQ6IFF1aWNrRGlmZldpZGdldCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzUXVpY2tEaWZmVmlzaWJsZSE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHNlc3Npb246IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIG1vdXNlRG93bkluZm86IHsgbGluZU51bWJlcjogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBlbmFibGVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ3V0dGVyQWN0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgc3R5bGVzaGVldDogSFRNTFN0eWxlRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tEaWZmTW9kZWxTZXJ2aWNlOiBJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbmFibGVkID0gIWNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZSgnaXNJbkRpZmZFZGl0b3InKTtcblx0XHR0aGlzLnN0eWxlc2hlZXQgPSBkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKTtcblxuXHRcdGlmICh0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHRoaXMuaXNRdWlja0RpZmZWaXNpYmxlID0gaXNRdWlja0RpZmZWaXNpYmxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLmNsb3NlKCkpKTtcblxuXHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VHdXR0ZXJBY3Rpb24gPSBFdmVudC5maWx0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJBY3Rpb24nKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZUd1dHRlckFjdGlvbih0aGlzLm9uRGlkQ2hhbmdlR3V0dGVyQWN0aW9uLCB0aGlzKSk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlR3V0dGVyQWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUd1dHRlckFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBndXR0ZXJBY3Rpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdkaWZmJyB8ICdub25lJz4oJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJBY3Rpb24nKTtcblxuXHRcdHRoaXMuZ3V0dGVyQWN0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmIChndXR0ZXJBY3Rpb24gPT09ICdkaWZmJykge1xuXHRcdFx0dGhpcy5ndXR0ZXJBY3Rpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25Nb3VzZURvd24oZSA9PiB0aGlzLm9uRWRpdG9yTW91c2VEb3duKGUpKSk7XG5cdFx0XHR0aGlzLmd1dHRlckFjdGlvbkRpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvci5vbk1vdXNlVXAoZSA9PiB0aGlzLm9uRWRpdG9yTW91c2VVcChlKSkpO1xuXHRcdFx0dGhpcy5zdHlsZXNoZWV0LnRleHRDb250ZW50ID0gYFxuXHRcdFx0XHQubW9uYWNvLWVkaXRvciAuZGlydHktZGlmZi1nbHlwaCB7XG5cdFx0XHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Lm1vbmFjby1lZGl0b3IgLm1hcmdpbi12aWV3LW92ZXJsYXlzIC5kaXJ0eS1kaWZmLWdseXBoOmhvdmVyOjpiZWZvcmUge1xuXHRcdFx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdFx0XHR3aWR0aDogNnB4O1xuXHRcdFx0XHRcdGxlZnQ6IC02cHg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQubW9uYWNvLWVkaXRvciAubWFyZ2luLXZpZXctb3ZlcmxheXMgLmRpcnR5LWRpZmYtZGVsZXRlZDpob3Zlcjo6YWZ0ZXIge1xuXHRcdFx0XHRcdGJvdHRvbTogMDtcblx0XHRcdFx0XHRib3JkZXItdG9wLXdpZHRoOiAwO1xuXHRcdFx0XHRcdGJvcmRlci1ib3R0b20td2lkdGg6IDA7XG5cdFx0XHRcdH1cblx0XHRcdGA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3R5bGVzaGVldC50ZXh0Q29udGVudCA9IGBgO1xuXHRcdH1cblx0fVxuXG5cdGNhbk5hdmlnYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy53aWRnZXQgfHwgKHRoaXMud2lkZ2V0Py5pbmRleCA9PT0gLTEpIHx8ICghIXRoaXMubW9kZWwgJiYgdGhpcy5tb2RlbC5jaGFuZ2VzLmxlbmd0aCA+IDEpO1xuXHR9XG5cblx0cmVmcmVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldD8uc2hvd0NoYW5nZSh0aGlzLndpZGdldC5pbmRleCwgZmFsc2UpO1xuXHR9XG5cblx0dG9nZ2xlRm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud2lkZ2V0KSB7XG5cdFx0XHR0aGlzLndpZGdldC50b2dnbGVGb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG5leHQobGluZU51bWJlcj86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5hc3NlcnRXaWRnZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMud2lkZ2V0IHx8ICF0aGlzLm1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGluZGV4OiBudW1iZXI7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLmhhc01vZGVsKCkgJiYgKHR5cGVvZiBsaW5lTnVtYmVyID09PSAnbnVtYmVyJyB8fCAhdGhpcy53aWRnZXQucHJvdmlkZXJJZCkpIHtcblx0XHRcdGluZGV4ID0gdGhpcy5tb2RlbC5maW5kTmV4dENsb3Nlc3RDaGFuZ2UodHlwZW9mIGxpbmVOdW1iZXIgPT09ICdudW1iZXInID8gbGluZU51bWJlciA6IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkubGluZU51bWJlciwgdHJ1ZSwgdGhpcy53aWRnZXQucHJvdmlkZXJJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyQ2hhbmdlczogbnVtYmVyW10gPSB0aGlzLm1vZGVsLnF1aWNrRGlmZkNoYW5nZXMuZ2V0KHRoaXMud2lkZ2V0LnByb3ZpZGVySWQpID8/IHRoaXMubW9kZWwucXVpY2tEaWZmQ2hhbmdlcy52YWx1ZXMoKS5uZXh0KCkudmFsdWUhO1xuXHRcdFx0Y29uc3QgbWFwSW5kZXggPSBwcm92aWRlckNoYW5nZXMuZmluZEluZGV4KHZhbHVlID0+IHZhbHVlID09PSB0aGlzLndpZGdldCEuaW5kZXgpO1xuXHRcdFx0aW5kZXggPSBwcm92aWRlckNoYW5nZXNbcm90KG1hcEluZGV4ICsgMSwgcHJvdmlkZXJDaGFuZ2VzLmxlbmd0aCldO1xuXHRcdH1cblxuXHRcdHRoaXMud2lkZ2V0LnNob3dDaGFuZ2UoaW5kZXgpO1xuXHR9XG5cblx0cHJldmlvdXMobGluZU51bWJlcj86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5hc3NlcnRXaWRnZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMud2lkZ2V0IHx8ICF0aGlzLm1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGluZGV4OiBudW1iZXI7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLmhhc01vZGVsKCkgJiYgKHR5cGVvZiBsaW5lTnVtYmVyID09PSAnbnVtYmVyJyB8fCAhdGhpcy53aWRnZXQucHJvdmlkZXJJZCkpIHtcblx0XHRcdGluZGV4ID0gdGhpcy5tb2RlbC5maW5kUHJldmlvdXNDbG9zZXN0Q2hhbmdlKHR5cGVvZiBsaW5lTnVtYmVyID09PSAnbnVtYmVyJyA/IGxpbmVOdW1iZXIgOiB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIsIHRydWUsIHRoaXMud2lkZ2V0LnByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcm92aWRlckNoYW5nZXM6IG51bWJlcltdID0gdGhpcy5tb2RlbC5xdWlja0RpZmZDaGFuZ2VzLmdldCh0aGlzLndpZGdldC5wcm92aWRlcklkKSA/PyB0aGlzLm1vZGVsLnF1aWNrRGlmZkNoYW5nZXMudmFsdWVzKCkubmV4dCgpLnZhbHVlITtcblx0XHRcdGNvbnN0IG1hcEluZGV4ID0gcHJvdmlkZXJDaGFuZ2VzLmZpbmRJbmRleCh2YWx1ZSA9PiB2YWx1ZSA9PT0gdGhpcy53aWRnZXQhLmluZGV4KTtcblx0XHRcdGluZGV4ID0gcHJvdmlkZXJDaGFuZ2VzW3JvdChtYXBJbmRleCAtIDEsIHByb3ZpZGVyQ2hhbmdlcy5sZW5ndGgpXTtcblx0XHR9XG5cblx0XHR0aGlzLndpZGdldC5zaG93Q2hhbmdlKGluZGV4KTtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXNzaW9uID0gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3NlcnRXaWRnZXQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy53aWRnZXQpIHtcblx0XHRcdGlmICghdGhpcy5tb2RlbCB8fCB0aGlzLm1vZGVsLmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRpZiAoIWVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLnF1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShlZGl0b3JNb2RlbC51cmkpO1xuXG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbFJlZi5vYmplY3QuY2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLm1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXHRcdHRoaXMud2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0RpZmZXaWRnZXQsIHRoaXMuZWRpdG9yLCB0aGlzLm1vZGVsKTtcblx0XHR0aGlzLmlzUXVpY2tEaWZmVmlzaWJsZS5zZXQodHJ1ZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZSh0aGlzLndpZGdldC5vbkRpZENsb3NlKSh0aGlzLmNsb3NlLCB0aGlzKSk7XG5cdFx0Y29uc3Qgb25EaWRNb2RlbENoYW5nZSA9IEV2ZW50LmNoYWluKHRoaXMubW9kZWwub25EaWRDaGFuZ2UsICQgPT5cblx0XHRcdCQuZmlsdGVyKGUgPT4gZS5kaWZmLmxlbmd0aCA+IDApXG5cdFx0XHRcdC5tYXAoZSA9PiBlLmRpZmYpXG5cdFx0KTtcblxuXHRcdG9uRGlkTW9kZWxDaGFuZ2UodGhpcy5vbkRpZE1vZGVsQ2hhbmdlLCB0aGlzLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWxSZWYpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLndpZGdldCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLm1vZGVsID0gbnVsbDtcblx0XHRcdHRoaXMud2lkZ2V0ID0gbnVsbDtcblx0XHRcdHRoaXMuaXNRdWlja0RpZmZWaXNpYmxlLnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2Vzc2lvbiA9IGRpc3Bvc2FibGVzO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZE1vZGVsQ2hhbmdlKHNwbGljZXM6IElTcGxpY2U8UXVpY2tEaWZmQ2hhbmdlPltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1vZGVsIHx8ICF0aGlzLndpZGdldCB8fCB0aGlzLndpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzcGxpY2Ugb2Ygc3BsaWNlcykge1xuXHRcdFx0aWYgKHNwbGljZS5zdGFydCA8PSB0aGlzLndpZGdldC5pbmRleCkge1xuXHRcdFx0XHR0aGlzLm5leHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlRG93bihlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMubW91c2VEb3duSW5mbyA9IG51bGw7XG5cblx0XHRjb25zdCByYW5nZSA9IGUudGFyZ2V0LnJhbmdlO1xuXG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghZS5ldmVudC5sZWZ0QnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWUudGFyZ2V0LmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGUudGFyZ2V0LmVsZW1lbnQuY2xhc3NOYW1lLmluZGV4T2YoJ2RpcnR5LWRpZmYtZ2x5cGgnKSA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gZS50YXJnZXQuZGV0YWlsO1xuXHRcdGNvbnN0IG9mZnNldExlZnRJbkd1dHRlciA9IGUudGFyZ2V0LmVsZW1lbnQub2Zmc2V0TGVmdDtcblx0XHRjb25zdCBndXR0ZXJPZmZzZXRYID0gZGF0YS5vZmZzZXRYIC0gb2Zmc2V0TGVmdEluR3V0dGVyO1xuXG5cdFx0Ly8gVE9ET0Bqb2FvIFRPRE9AYWxleCBUT0RPQG1hcnRpbiB0aGlzIGlzIHN1Y2ggdGhhdCB3ZSBkb24ndCBjb2xsaWRlIHdpdGggZm9sZGluZ1xuXHRcdGlmIChndXR0ZXJPZmZzZXRYIDwgLTMgfHwgZ3V0dGVyT2Zmc2V0WCA+IDMpIHsgLy8gZGlydHkgZGlmZiBkZWNvcmF0aW9uIG9uIGhvdmVyIGlzIDZweCB3aWRlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5tb3VzZURvd25JbmZvID0geyBsaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZVVwKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1vdXNlRG93bkluZm8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGxpbmVOdW1iZXIgfSA9IHRoaXMubW91c2VEb3duSW5mbztcblx0XHR0aGlzLm1vdXNlRG93bkluZm8gPSBudWxsO1xuXG5cdFx0Y29uc3QgcmFuZ2UgPSBlLnRhcmdldC5yYW5nZTtcblxuXHRcdGlmICghcmFuZ2UgfHwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGlmICghZWRpdG9yTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMucXVpY2tEaWZmTW9kZWxTZXJ2aWNlLmNyZWF0ZVF1aWNrRGlmZk1vZGVsUmVmZXJlbmNlKGVkaXRvck1vZGVsLnVyaSk7XG5cblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbW9kZWxSZWYub2JqZWN0LmNoYW5nZXNcblx0XHRcdFx0LmZpbmRJbmRleChjaGFuZ2UgPT4gbGluZUludGVyc2VjdHNDaGFuZ2UobGluZU51bWJlciwgY2hhbmdlLmNoYW5nZSkpO1xuXG5cdFx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLndpZGdldD8uaW5kZXgpIHtcblx0XHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5uZXh0KGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmd1dHRlckFjdGlvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dQcmV2aW91c0NoYW5nZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvdXRlckVkaXRvcj86IElDb2RlRWRpdG9yKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmRpcnR5ZGlmZi5wcmV2aW91cycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc2hvdyBwcmV2aW91cyBjaGFuZ2UnLCBcIlNob3cgUHJldmlvdXMgQ2hhbmdlXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRrYk9wdHM6IHsga2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkYzLCB3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiB9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBvdXRlckVkaXRvciA9IHRoaXMub3V0ZXJFZGl0b3IgPz8gZ2V0T3V0ZXJFZGl0b3JGcm9tRGlmZkVkaXRvcihhY2Nlc3Nvcik7XG5cblx0XHRpZiAoIW91dGVyRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXIuZ2V0KG91dGVyRWRpdG9yKTtcblxuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghY29udHJvbGxlci5jYW5OYXZpZ2F0ZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29udHJvbGxlci5wcmV2aW91cygpO1xuXHR9XG59XG5yZWdpc3RlckVkaXRvckFjdGlvbihTaG93UHJldmlvdXNDaGFuZ2VBY3Rpb24pO1xuXG5leHBvcnQgY2xhc3MgU2hvd05leHRDaGFuZ2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgb3V0ZXJFZGl0b3I/OiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5kaXJ0eWRpZmYubmV4dCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc2hvdyBuZXh0IGNoYW5nZScsIFwiU2hvdyBOZXh0IENoYW5nZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0a2JPcHRzOiB7IGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLCBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMywgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgfVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3V0ZXJFZGl0b3IgPSB0aGlzLm91dGVyRWRpdG9yID8/IGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3IpO1xuXG5cdFx0aWYgKCFvdXRlckVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBRdWlja0RpZmZFZGl0b3JDb250cm9sbGVyLmdldChvdXRlckVkaXRvcik7XG5cblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWNvbnRyb2xsZXIuY2FuTmF2aWdhdGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRyb2xsZXIubmV4dCgpO1xuXHR9XG59XG5yZWdpc3RlckVkaXRvckFjdGlvbihTaG93TmV4dENoYW5nZUFjdGlvbik7XG5cbmV4cG9ydCBjbGFzcyBHb3RvUHJldmlvdXNDaGFuZ2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3IucHJldmlvdXNDaGFuZ2UnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ21vdmUgdG8gcHJldmlvdXMgY2hhbmdlJywgXCJHbyB0byBQcmV2aW91cyBDaGFuZ2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQudG9OZWdhdGVkKCksIHF1aWNrRGlmZkRlY29yYXRpb25Db3VudC5ub3RFcXVhbHNUbygwKSksXG5cdFx0XHRrYk9wdHM6IHsga2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY1LCB3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiB9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvdXRlckVkaXRvciA9IGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrRGlmZk1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlKTtcblxuXHRcdGlmICghb3V0ZXJFZGl0b3IgfHwgIW91dGVyRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IHF1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShvdXRlckVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghbW9kZWxSZWYgfHwgbW9kZWxSZWYub2JqZWN0LmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IG91dGVyRWRpdG9yLmdldFBvc2l0aW9uKCkubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGluZGV4ID0gbW9kZWxSZWYub2JqZWN0LmZpbmRQcmV2aW91c0Nsb3Nlc3RDaGFuZ2UobGluZU51bWJlciwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gbW9kZWxSZWYub2JqZWN0LmNoYW5nZXNbaW5kZXhdO1xuXHRcdFx0YXdhaXQgcGxheUFjY2Vzc2liaWxpdHlTeW1ib2xGb3JDaGFuZ2UoY2hhbmdlLmNoYW5nZSwgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdFx0c2V0UG9zaXRpb25BbmRTZWxlY3Rpb24oY2hhbmdlLmNoYW5nZSwgb3V0ZXJFZGl0b3IsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBjb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5yZWdpc3RlckVkaXRvckFjdGlvbihHb3RvUHJldmlvdXNDaGFuZ2VBY3Rpb24pO1xuXG5leHBvcnQgY2xhc3MgR290b05leHRDaGFuZ2VBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5lZGl0b3IubmV4dENoYW5nZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbW92ZSB0byBuZXh0IGNoYW5nZScsIFwiR28gdG8gTmV4dCBDaGFuZ2VcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQudG9OZWdhdGVkKCksIHF1aWNrRGlmZkRlY29yYXRpb25Db3VudC5ub3RFcXVhbHNUbygwKSksXG5cdFx0XHRrYk9wdHM6IHsga2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsIHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY1LCB3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiB9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UpO1xuXHRcdGNvbnN0IG91dGVyRWRpdG9yID0gZ2V0T3V0ZXJFZGl0b3JGcm9tRGlmZkVkaXRvcihhY2Nlc3Nvcik7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrRGlmZk1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tEaWZmTW9kZWxTZXJ2aWNlKTtcblxuXHRcdGlmICghb3V0ZXJFZGl0b3IgfHwgIW91dGVyRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IHF1aWNrRGlmZk1vZGVsU2VydmljZS5jcmVhdGVRdWlja0RpZmZNb2RlbFJlZmVyZW5jZShvdXRlckVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghbW9kZWxSZWYgfHwgbW9kZWxSZWYub2JqZWN0LmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IG91dGVyRWRpdG9yLmdldFBvc2l0aW9uKCkubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGluZGV4ID0gbW9kZWxSZWYub2JqZWN0LmZpbmROZXh0Q2xvc2VzdENoYW5nZShsaW5lTnVtYmVyLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBjaGFuZ2UgPSBtb2RlbFJlZi5vYmplY3QuY2hhbmdlc1tpbmRleF0uY2hhbmdlO1xuXHRcdFx0YXdhaXQgcGxheUFjY2Vzc2liaWxpdHlTeW1ib2xGb3JDaGFuZ2UoY2hhbmdlLCBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSk7XG5cdFx0XHRzZXRQb3NpdGlvbkFuZFNlbGVjdGlvbihjaGFuZ2UsIG91dGVyRWRpdG9yLCBhY2Nlc3NpYmlsaXR5U2VydmljZSwgY29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRtb2RlbFJlZj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oR290b05leHRDaGFuZ2VBY3Rpb24pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJHb01lbnUsIHtcblx0Z3JvdXA6ICc3X2NoYW5nZV9uYXYnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmRpcnR5ZGlmZi5uZXh0Jyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvTmV4dENoYW5nZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJOZXh0ICYmQ2hhbmdlXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyR29NZW51LCB7XG5cdGdyb3VwOiAnN19jaGFuZ2VfbmF2Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5kaXJ0eWRpZmYucHJldmlvdXMnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvdG9QcmV2aW91c0NoYW5nZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJQcmV2aW91cyAmJkNoYW5nZVwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2Nsb3NlUXVpY2tEaWZmJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1MCxcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGlzUXVpY2tEaWZmVmlzaWJsZSksXG5cdGhhbmRsZXI6IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IG91dGVyRWRpdG9yID0gZ2V0T3V0ZXJFZGl0b3JGcm9tRGlmZkVkaXRvcihhY2Nlc3Nvcik7XG5cblx0XHRpZiAoIW91dGVyRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFF1aWNrRGlmZkVkaXRvckNvbnRyb2xsZXIuZ2V0KG91dGVyRWRpdG9yKTtcblxuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRyb2xsZXIuY2xvc2UoKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3RvZ2dsZVF1aWNrRGlmZldpZGdldEZvY3VzJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLkYyKSxcblx0d2hlbjogaXNRdWlja0RpZmZWaXNpYmxlLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBvdXRlckVkaXRvciA9IGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGlmICghb3V0ZXJFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gUXVpY2tEaWZmRWRpdG9yQ29udHJvbGxlci5nZXQob3V0ZXJFZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRyb2xsZXIudG9nZ2xlRm9jdXMoKTtcblx0fVxufSk7XG5cbmZ1bmN0aW9uIHNldFBvc2l0aW9uQW5kU2VsZWN0aW9uKGNoYW5nZTogSUNoYW5nZSwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSwgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSkge1xuXHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihjaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIsIDEpO1xuXHRlZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRlZGl0b3IucmV2ZWFsUG9zaXRpb25JbkNlbnRlcihwb3NpdGlvbik7XG5cdGlmIChhY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7IHN0YXJ0TGluZU51bWJlcjogY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogMCwgZW5kTGluZU51bWJlcjogY2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IE51bWJlci5NQVhfVkFMVUUgfSk7XG5cdFx0Y29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpPy53cml0ZVNjcmVlblJlYWRlckNvbnRlbnQoJ2RpZmYtbmF2aWdhdGlvbicpO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBsYXlBY2Nlc3NpYmlsaXR5U3ltYm9sRm9yQ2hhbmdlKGNoYW5nZTogSUNoYW5nZSwgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSkge1xuXHRjb25zdCBjaGFuZ2VUeXBlID0gZ2V0Q2hhbmdlVHlwZShjaGFuZ2UpO1xuXHRzd2l0Y2ggKGNoYW5nZVR5cGUpIHtcblx0XHRjYXNlIENoYW5nZVR5cGUuQWRkOlxuXHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lSW5zZXJ0ZWQsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSwgc291cmNlOiAncXVpY2tEaWZmRGVjb3JhdGlvbicgfSk7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIENoYW5nZVR5cGUuRGVsZXRlOlxuXHRcdFx0YWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lRGVsZXRlZCwgeyBhbGxvd01hbnlJblBhcmFsbGVsOiB0cnVlLCBzb3VyY2U6ICdxdWlja0RpZmZEZWNvcmF0aW9uJyB9KTtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgQ2hhbmdlVHlwZS5Nb2RpZnk6XG5cdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVNb2RpZmllZCwgeyBhbGxvd01hbnlJblBhcmFsbGVsOiB0cnVlLCBzb3VyY2U6ICdxdWlja0RpZmZEZWNvcmF0aW9uJyB9KTtcblx0XHRcdGJyZWFrO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE91dGVyRWRpdG9yRnJvbURpZmZFZGl0b3IoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBJQ29kZUVkaXRvciB8IG51bGwge1xuXHRjb25zdCBkaWZmRWRpdG9ycyA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmxpc3REaWZmRWRpdG9ycygpO1xuXG5cdGZvciAoY29uc3QgZGlmZkVkaXRvciBvZiBkaWZmRWRpdG9ycykge1xuXHRcdGlmIChkaWZmRWRpdG9yLmhhc1RleHRGb2N1cygpICYmIGRpZmZFZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybiBkaWZmRWRpdG9yLmdldFBhcmVudEVkaXRvcigpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBnZXRPdXRlckVkaXRvcihhY2Nlc3Nvcik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsU0FBUyxRQUFRLG9CQUE2QjtBQUM5QyxTQUFTLGFBQWE7QUFDdEIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBc0IscUJBQXFCO0FBQzNDLFNBQVMsZ0JBQWdCLHlCQUF5Qix5QkFBeUIsNkJBQTZCLHNCQUFzQjtBQUM5SCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFnQixjQUFjLFFBQVEsZ0JBQWdCLG9CQUFvQjtBQUMxRSxTQUF5Qyx1QkFBdUI7QUFDaEUsU0FBUyxjQUFjLDRCQUE0QjtBQUNuRCxTQUFTLDZCQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUE4QixrQkFBa0I7QUFDaEQsU0FBUyw4QkFBOEM7QUFDdkQsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxnQkFBNkIsb0JBQW9CLHFCQUFxQjtBQUMvRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxZQUFZLGlCQUFpQixlQUFlLG9CQUFvQiwwQkFBMEIsbUJBQW1CLDRCQUF3RDtBQUM5SyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQix3QkFBd0I7QUFFdEQsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNB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QUFTLENBQUMsYUFBK0I7QUFDeEMsVUFBTSxjQUFjLDZCQUE2QixRQUFRO0FBQ3pELFFBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSwwQkFBMEIsSUFBSSxXQUFXO0FBQzVELFFBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLGVBQVcsWUFBWTtBQUFBLEVBQ3hCO0FBQ0QsQ0FBQztBQUVELFNBQVMsd0JBQXdCLFFBQWlCLFFBQXFCLHNCQUE2QyxtQkFBdUM7QUFDMUosUUFBTSxXQUFXLElBQUksU0FBUyxPQUFPLHlCQUF5QixDQUFDO0FBQy9ELFNBQU8sWUFBWSxRQUFRO0FBQzNCLFNBQU8sdUJBQXVCLFFBQVE7QUFDdEMsTUFBSSxxQkFBcUIsd0JBQXdCLEdBQUc7QUFDbkQsV0FBTyxhQUFhLEVBQUUsaUJBQWlCLE9BQU8seUJBQXlCLGFBQWEsR0FBRyxlQUFlLE9BQU8seUJBQXlCLFdBQVcsT0FBTyxVQUFVLENBQUM7QUFDbkssc0JBQWtCLG9CQUFvQixHQUFHLHlCQUF5QixpQkFBaUI7QUFBQSxFQUNwRjtBQUNEO0FBRUEsZUFBZSxpQ0FBaUMsUUFBaUIsNEJBQXlEO0FBQ3pILFFBQU0sYUFBYSxjQUFjLE1BQU07QUFDdkMsVUFBUSxZQUFZO0FBQUEsSUFDbkIsS0FBSyxXQUFXO0FBQ2YsaUNBQTJCLFdBQVcsb0JBQW9CLGtCQUFrQixFQUFFLHFCQUFxQixNQUFNLFFBQVEsc0JBQXNCLENBQUM7QUFDeEk7QUFBQSxJQUNELEtBQUssV0FBVztBQUNmLGlDQUEyQixXQUFXLG9CQUFvQixpQkFBaUIsRUFBRSxxQkFBcUIsTUFBTSxRQUFRLHNCQUFzQixDQUFDO0FBQ3ZJO0FBQUEsSUFDRCxLQUFLLFdBQVc7QUFDZixpQ0FBMkIsV0FBVyxvQkFBb0Isa0JBQWtCLEVBQUUscUJBQXFCLE1BQU0sUUFBUSxzQkFBc0IsQ0FBQztBQUN4STtBQUFBLEVBQ0Y7QUFDRDtBQUVBLFNBQVMsNkJBQTZCLFVBQWdEO0FBQ3JGLFFBQU0sY0FBYyxTQUFTLElBQUksa0JBQWtCLEVBQUUsZ0JBQWdCO0FBRXJFLGFBQVcsY0FBYyxhQUFhO0FBQ3JDLFFBQUksV0FBVyxhQUFhLEtBQUssc0JBQXNCLDBCQUEwQjtBQUNoRixhQUFPLFdBQVcsZ0JBQWdCO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBRUEsU0FBTyxlQUFlLFFBQVE7QUFDL0I7IiwKICAibmFtZXMiOiBbImNoYW5nZSJdCn0K
