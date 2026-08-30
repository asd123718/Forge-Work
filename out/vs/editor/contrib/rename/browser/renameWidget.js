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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { getBaseLayerHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegate2.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import * as arrays from "../../../../base/common/arrays.js";
import { DeferredPromise, raceCancellation } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { assertType, isDefined } from "../../../../base/common/types.js";
import "./renameWidget.css";
import * as domFontInfo from "../../../browser/config/domFontInfo.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { NewSymbolNameTag, NewSymbolNameTriggerKind } from "../../../common/languages.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import {
  editorWidgetBackground,
  inputBackground,
  inputBorder,
  inputForeground,
  quickInputListFocusBackground,
  quickInputListFocusForeground,
  widgetBorder,
  widgetShadow
} from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
const _sticky = false;
const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey("renameInputVisible", false, nls.localize("renameInputVisible", "Whether the rename input widget is visible"));
const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey("renameInputFocused", false, nls.localize("renameInputFocused", "Whether the rename input widget is focused"));
let RenameWidget = class {
  constructor(_editor, _acceptKeybindings, _themeService, _keybindingService, contextKeyService, _logService) {
    this._editor = _editor;
    this._acceptKeybindings = _acceptKeybindings;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._logService = _logService;
    // implement IContentWidget
    this.allowEditorOverflow = true;
    this._disposables = new DisposableStore();
    this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
    this._isEditingRenameCandidate = false;
    this._nRenameSuggestionsInvocations = 0;
    this._hadAutomaticRenameSuggestionsInvocation = false;
    this._candidates = /* @__PURE__ */ new Set();
    this._beforeFirstInputFieldEditSW = new StopWatch();
    this._inputWithButton = new InputWithButton();
    this._disposables.add(this._inputWithButton);
    this._editor.addContentWidget(this);
    this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._updateFont();
      }
    }));
    this._disposables.add(_themeService.onDidColorThemeChange(this._updateStyles, this));
  }
  dispose() {
    this._disposables.dispose();
    this._editor.removeContentWidget(this);
  }
  getId() {
    return "__renameInputWidget";
  }
  getDomNode() {
    if (!this._domNode) {
      this._domNode = document.createElement("div");
      this._domNode.className = "monaco-editor rename-box";
      this._domNode.appendChild(this._inputWithButton.domNode);
      this._renameCandidateListView = this._disposables.add(
        new RenameCandidateListView(this._domNode, {
          fontInfo: this._editor.getOption(EditorOption.fontInfo),
          onFocusChange: (newSymbolName) => {
            this._inputWithButton.input.value = newSymbolName;
            this._isEditingRenameCandidate = false;
          },
          onSelectionChange: () => {
            this._isEditingRenameCandidate = false;
            this.acceptInput(false);
          }
        })
      );
      this._disposables.add(
        this._inputWithButton.onDidInputChange(() => {
          if (this._renameCandidateListView?.focusedCandidate !== void 0) {
            this._isEditingRenameCandidate = true;
          }
          this._timeBeforeFirstInputFieldEdit ??= this._beforeFirstInputFieldEditSW.elapsed();
          if (this._renameCandidateProvidersCts?.token.isCancellationRequested === false) {
            this._renameCandidateProvidersCts.cancel();
          }
          this._renameCandidateListView?.clearFocus();
        })
      );
      this._label = document.createElement("div");
      this._label.className = "rename-label";
      this._domNode.appendChild(this._label);
      this._updateFont();
      this._updateStyles(this._themeService.getColorTheme());
    }
    return this._domNode;
  }
  _updateStyles(theme) {
    if (!this._domNode) {
      return;
    }
    const widgetShadowColor = theme.getColor(widgetShadow);
    const widgetBorderColor = theme.getColor(widgetBorder);
    this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? "");
    this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : "";
    this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : "";
    this._domNode.style.color = String(theme.getColor(inputForeground) ?? "");
    const border = theme.getColor(inputBorder);
    this._inputWithButton.domNode.style.backgroundColor = String(theme.getColor(inputBackground) ?? "");
    this._inputWithButton.input.style.backgroundColor = String(theme.getColor(inputBackground) ?? "");
    this._inputWithButton.domNode.style.borderWidth = border ? "1px" : "0px";
    this._inputWithButton.domNode.style.borderStyle = border ? "solid" : "none";
    this._inputWithButton.domNode.style.borderColor = border?.toString() ?? "none";
  }
  _updateFont() {
    if (this._domNode === void 0) {
      return;
    }
    assertType(this._label !== void 0, "RenameWidget#_updateFont: _label must not be undefined given _domNode is defined");
    this._editor.applyFontInfo(this._inputWithButton.input);
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    this._label.style.fontSize = `${this._computeLabelFontSize(fontInfo.fontSize)}px`;
  }
  _computeLabelFontSize(editorFontSize) {
    return editorFontSize * 0.8;
  }
  getPosition() {
    if (!this._visible) {
      return null;
    }
    if (!this._editor.hasModel() || // @ulugbekna: shouldn't happen
    !this._editor.getDomNode()) {
      return null;
    }
    const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
    const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
    const cursorBoxTop = this._getTopForPosition();
    this._nPxAvailableAbove = cursorBoxTop + editorBox.top;
    this._nPxAvailableBelow = bodyBox.height - this._nPxAvailableAbove;
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { totalHeight: candidateViewHeight } = RenameCandidateView.getLayoutInfo({ lineHeight });
    const positionPreference = this._nPxAvailableBelow > candidateViewHeight * 6 ? [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE] : [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];
    return {
      position: this._position,
      preference: positionPreference
    };
  }
  beforeRender() {
    const [accept, preview] = this._acceptKeybindings;
    this._label.innerText = nls.localize({ key: "label", comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());
    this._domNode.style.minWidth = `200px`;
    return null;
  }
  afterRender(position) {
    if (position === null) {
      this.cancelInput(true, "afterRender (because position is null)");
      return;
    }
    if (!this._editor.hasModel() || // shouldn't happen
    !this._editor.getDomNode()) {
      return;
    }
    assertType(this._renameCandidateListView);
    assertType(this._nPxAvailableAbove !== void 0);
    assertType(this._nPxAvailableBelow !== void 0);
    const inputBoxHeight = dom.getTotalHeight(this._inputWithButton.domNode);
    const labelHeight = dom.getTotalHeight(this._label);
    let totalHeightAvailable;
    if (position === ContentWidgetPositionPreference.BELOW) {
      totalHeightAvailable = this._nPxAvailableBelow;
    } else {
      totalHeightAvailable = this._nPxAvailableAbove;
    }
    this._renameCandidateListView.layout({
      height: totalHeightAvailable - labelHeight - inputBoxHeight,
      width: dom.getTotalWidth(this._inputWithButton.domNode)
    });
  }
  acceptInput(wantsPreview) {
    this._trace(`invoking acceptInput`);
    this._currentAcceptInput?.(wantsPreview);
  }
  cancelInput(focusEditor, caller) {
    this._currentCancelInput?.(focusEditor);
  }
  focusNextRenameSuggestion() {
    if (!this._renameCandidateListView?.focusNext()) {
      this._inputWithButton.input.value = this._currentName;
    }
  }
  focusPreviousRenameSuggestion() {
    if (!this._renameCandidateListView?.focusPrevious()) {
      this._inputWithButton.input.value = this._currentName;
    }
  }
  /**
   * @param requestRenameCandidates is `undefined` when there are no rename suggestion providers
   */
  getInput(where, currentName, supportPreview, requestRenameCandidates, cts) {
    const { start: selectionStart, end: selectionEnd } = this._getSelection(where, currentName);
    this._renameCts = cts;
    const disposeOnDone = new DisposableStore();
    this._nRenameSuggestionsInvocations = 0;
    this._hadAutomaticRenameSuggestionsInvocation = false;
    if (requestRenameCandidates === void 0) {
      this._inputWithButton.button.style.display = "none";
    } else {
      this._inputWithButton.button.style.display = "flex";
      this._requestRenameCandidatesOnce = requestRenameCandidates;
      this._requestRenameCandidates(currentName, false);
      disposeOnDone.add(dom.addDisposableListener(
        this._inputWithButton.button,
        "click",
        () => this._requestRenameCandidates(currentName, true)
      ));
      disposeOnDone.add(dom.addDisposableListener(
        this._inputWithButton.button,
        dom.EventType.KEY_DOWN,
        (e) => {
          const keyEvent = new StandardKeyboardEvent(e);
          if (keyEvent.equals(KeyCode.Enter) || keyEvent.equals(KeyCode.Space)) {
            keyEvent.stopPropagation();
            keyEvent.preventDefault();
            this._requestRenameCandidates(currentName, true);
          }
        }
      ));
    }
    this._isEditingRenameCandidate = false;
    this._domNode.classList.toggle("preview", supportPreview);
    this._position = new Position(where.startLineNumber, where.startColumn);
    this._currentName = currentName;
    this._inputWithButton.input.value = currentName;
    this._inputWithButton.input.setAttribute("selectionStart", selectionStart.toString());
    this._inputWithButton.input.setAttribute("selectionEnd", selectionEnd.toString());
    this._inputWithButton.input.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20);
    this._beforeFirstInputFieldEditSW.reset();
    disposeOnDone.add(toDisposable(() => {
      this._renameCts = void 0;
      cts.dispose(true);
    }));
    disposeOnDone.add(toDisposable(() => {
      if (this._renameCandidateProvidersCts !== void 0) {
        this._renameCandidateProvidersCts.dispose(true);
        this._renameCandidateProvidersCts = void 0;
      }
    }));
    disposeOnDone.add(toDisposable(() => this._candidates.clear()));
    const inputResult = new DeferredPromise();
    inputResult.p.finally(() => {
      disposeOnDone.dispose();
      this._hide();
    });
    this._currentCancelInput = (focusEditor) => {
      this._trace("invoking _currentCancelInput");
      this._currentAcceptInput = void 0;
      this._currentCancelInput = void 0;
      this._renameCandidateListView?.clearCandidates();
      inputResult.complete(focusEditor);
      return true;
    };
    this._currentAcceptInput = (wantsPreview) => {
      this._trace("invoking _currentAcceptInput");
      assertType(this._renameCandidateListView !== void 0);
      const nRenameSuggestions = this._renameCandidateListView.nCandidates;
      let newName;
      let source;
      const focusedCandidate = this._renameCandidateListView.focusedCandidate;
      if (focusedCandidate !== void 0) {
        this._trace("using new name from renameSuggestion");
        newName = focusedCandidate;
        source = { k: "renameSuggestion" };
      } else {
        this._trace("using new name from inputField");
        newName = this._inputWithButton.input.value;
        source = this._isEditingRenameCandidate ? { k: "userEditedRenameSuggestion" } : { k: "inputField" };
      }
      if (newName === currentName || newName.trim().length === 0) {
        this.cancelInput(true, "_currentAcceptInput (because newName === value || newName.trim().length === 0)");
        return;
      }
      this._currentAcceptInput = void 0;
      this._currentCancelInput = void 0;
      this._renameCandidateListView.clearCandidates();
      inputResult.complete({
        newName,
        wantsPreview: supportPreview && wantsPreview,
        stats: {
          source,
          nRenameSuggestions,
          timeBeforeFirstInputFieldEdit: this._timeBeforeFirstInputFieldEdit,
          nRenameSuggestionsInvocations: this._nRenameSuggestionsInvocations,
          hadAutomaticRenameSuggestionsInvocation: this._hadAutomaticRenameSuggestionsInvocation
        }
      });
    };
    disposeOnDone.add(cts.token.onCancellationRequested(() => this.cancelInput(true, "cts.token.onCancellationRequested")));
    if (!_sticky) {
      disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus(), "editor.onDidBlurEditorWidget")));
    }
    this._show();
    return inputResult.p;
  }
  _requestRenameCandidates(currentName, isManuallyTriggered) {
    if (this._requestRenameCandidatesOnce === void 0) {
      return;
    }
    if (this._renameCandidateProvidersCts !== void 0) {
      this._renameCandidateProvidersCts.dispose(true);
    }
    assertType(this._renameCts);
    if (this._inputWithButton.buttonState !== "stop") {
      this._renameCandidateProvidersCts = new CancellationTokenSource();
      const triggerKind = isManuallyTriggered ? NewSymbolNameTriggerKind.Invoke : NewSymbolNameTriggerKind.Automatic;
      const candidates = this._requestRenameCandidatesOnce(triggerKind, this._renameCandidateProvidersCts.token);
      if (candidates.length === 0) {
        this._inputWithButton.setSparkleButton();
        return;
      }
      if (!isManuallyTriggered) {
        this._hadAutomaticRenameSuggestionsInvocation = true;
      }
      this._nRenameSuggestionsInvocations += 1;
      this._inputWithButton.setStopButton();
      this._updateRenameCandidates(candidates, currentName, this._renameCts.token);
    }
  }
  /**
   * This allows selecting only part of the symbol name in the input field based on the selection in the editor
   */
  _getSelection(where, currentName) {
    assertType(this._editor.hasModel());
    const selection = this._editor.getSelection();
    let start = 0;
    let end = currentName.length;
    if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(where, selection)) {
      start = Math.max(0, selection.startColumn - where.startColumn);
      end = Math.min(where.endColumn, selection.endColumn) - where.startColumn;
    }
    return { start, end };
  }
  _show() {
    this._trace("invoking _show");
    this._editor.revealLineInCenterIfOutsideViewport(this._position.lineNumber, ScrollType.Smooth);
    this._visible = true;
    this._visibleContextKey.set(true);
    this._editor.layoutContentWidget(this);
    setTimeout(() => {
      this._inputWithButton.input.focus();
      this._inputWithButton.input.setSelectionRange(
        parseInt(this._inputWithButton.input.getAttribute("selectionStart")),
        parseInt(this._inputWithButton.input.getAttribute("selectionEnd"))
      );
    }, 100);
  }
  async _updateRenameCandidates(candidates, currentName, token) {
    const trace = (...args) => this._trace("_updateRenameCandidates", ...args);
    trace("start");
    const namesListResults = await raceCancellation(Promise.allSettled(candidates), token);
    this._inputWithButton.setSparkleButton();
    if (namesListResults === void 0) {
      trace("returning early - received updateRenameCandidates results - undefined");
      return;
    }
    const newNames = namesListResults.flatMap(
      (namesListResult) => namesListResult.status === "fulfilled" && isDefined(namesListResult.value) ? namesListResult.value : []
    );
    trace(`received updateRenameCandidates results - total (unfiltered) ${newNames.length} candidates.`);
    const distinctNames = arrays.distinct(newNames, (v) => v.newSymbolName);
    trace(`distinct candidates - ${distinctNames.length} candidates.`);
    const validDistinctNames = distinctNames.filter(({ newSymbolName }) => newSymbolName.trim().length > 0 && newSymbolName !== this._inputWithButton.input.value && newSymbolName !== currentName && !this._candidates.has(newSymbolName));
    trace(`valid distinct candidates - ${newNames.length} candidates.`);
    validDistinctNames.forEach((n) => this._candidates.add(n.newSymbolName));
    if (validDistinctNames.length < 1) {
      trace("returning early - no valid distinct candidates");
      return;
    }
    trace("setting candidates");
    this._renameCandidateListView.setCandidates(validDistinctNames);
    trace("asking editor to re-layout");
    this._editor.layoutContentWidget(this);
  }
  _hide() {
    this._trace("invoked _hide");
    this._visible = false;
    this._visibleContextKey.reset();
    this._editor.layoutContentWidget(this);
  }
  _getTopForPosition() {
    const visibleRanges = this._editor.getVisibleRanges();
    let firstLineInViewport;
    if (visibleRanges.length > 0) {
      firstLineInViewport = visibleRanges[0].startLineNumber;
    } else {
      this._logService.warn("RenameWidget#_getTopForPosition: this should not happen - visibleRanges is empty");
      firstLineInViewport = Math.max(1, this._position.lineNumber - 5);
    }
    return this._editor.getTopForLineNumber(this._position.lineNumber) - this._editor.getTopForLineNumber(firstLineInViewport);
  }
  _trace(...args) {
    this._logService.trace("RenameWidget", ...args);
  }
};
RenameWidget = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, ILogService)
], RenameWidget);
class RenameCandidateListView {
  // FIXME@ulugbekna: rewrite using event emitters
  constructor(parent, opts) {
    this._disposables = new DisposableStore();
    this._availableHeight = 0;
    this._minimumWidth = 0;
    this._lineHeight = opts.fontInfo.lineHeight;
    this._typicalHalfwidthCharacterWidth = opts.fontInfo.typicalHalfwidthCharacterWidth;
    this._listContainer = document.createElement("div");
    this._listContainer.className = "rename-box rename-candidate-list-container";
    parent.appendChild(this._listContainer);
    this._listWidget = RenameCandidateListView._createListWidget(this._listContainer, this._candidateViewHeight, opts.fontInfo);
    this._disposables.add(this._listWidget.onDidChangeFocus(
      (e) => {
        if (e.elements.length === 1) {
          opts.onFocusChange(e.elements[0].newSymbolName);
        }
      },
      this._disposables
    ));
    this._disposables.add(this._listWidget.onDidChangeSelection(
      (e) => {
        if (e.elements.length === 1) {
          opts.onSelectionChange();
        }
      },
      this._disposables
    ));
    this._disposables.add(
      this._listWidget.onDidBlur((e) => {
        this._listWidget.setFocus([]);
      })
    );
    this._listWidget.style(getListStyles({
      listInactiveFocusForeground: quickInputListFocusForeground,
      listInactiveFocusBackground: quickInputListFocusBackground
    }));
  }
  dispose() {
    this._listWidget.dispose();
    this._disposables.dispose();
  }
  // height - max height allowed by parent element
  layout({ height, width }) {
    this._availableHeight = height;
    this._minimumWidth = width;
  }
  setCandidates(candidates) {
    this._listWidget.splice(0, 0, candidates);
    const height = this._pickListHeight(this._listWidget.length);
    const width = this._pickListWidth(candidates);
    this._listWidget.layout(height, width);
    this._listContainer.style.height = `${height}px`;
    this._listContainer.style.width = `${width}px`;
    aria.status(nls.localize("renameSuggestionsReceivedAria", "Received {0} rename suggestions", candidates.length));
  }
  clearCandidates() {
    this._listContainer.style.height = "0px";
    this._listContainer.style.width = "0px";
    this._listWidget.splice(0, this._listWidget.length, []);
  }
  get nCandidates() {
    return this._listWidget.length;
  }
  get focusedCandidate() {
    if (this._listWidget.length === 0) {
      return;
    }
    const selectedElement = this._listWidget.getSelectedElements()[0];
    if (selectedElement !== void 0) {
      return selectedElement.newSymbolName;
    }
    const focusedElement = this._listWidget.getFocusedElements()[0];
    if (focusedElement !== void 0) {
      return focusedElement.newSymbolName;
    }
    return;
  }
  focusNext() {
    if (this._listWidget.length === 0) {
      return false;
    }
    const focusedIxs = this._listWidget.getFocus();
    if (focusedIxs.length === 0) {
      this._listWidget.focusFirst();
      this._listWidget.reveal(0);
      return true;
    } else {
      if (focusedIxs[0] === this._listWidget.length - 1) {
        this._listWidget.setFocus([]);
        this._listWidget.reveal(0);
        return false;
      } else {
        this._listWidget.focusNext();
        const focused = this._listWidget.getFocus()[0];
        this._listWidget.reveal(focused);
        return true;
      }
    }
  }
  /**
   * @returns true if focus is moved to previous element
   */
  focusPrevious() {
    if (this._listWidget.length === 0) {
      return false;
    }
    const focusedIxs = this._listWidget.getFocus();
    if (focusedIxs.length === 0) {
      this._listWidget.focusLast();
      const focused = this._listWidget.getFocus()[0];
      this._listWidget.reveal(focused);
      return true;
    } else {
      if (focusedIxs[0] === 0) {
        this._listWidget.setFocus([]);
        return false;
      } else {
        this._listWidget.focusPrevious();
        const focused = this._listWidget.getFocus()[0];
        this._listWidget.reveal(focused);
        return true;
      }
    }
  }
  clearFocus() {
    this._listWidget.setFocus([]);
  }
  get _candidateViewHeight() {
    const { totalHeight } = RenameCandidateView.getLayoutInfo({ lineHeight: this._lineHeight });
    return totalHeight;
  }
  _pickListHeight(nCandidates) {
    const heightToFitAllCandidates = this._candidateViewHeight * nCandidates;
    const MAX_N_CANDIDATES = 7;
    const height = Math.min(heightToFitAllCandidates, this._availableHeight, this._candidateViewHeight * MAX_N_CANDIDATES);
    return height;
  }
  _pickListWidth(candidates) {
    const longestCandidateWidth = Math.ceil(Math.max(...candidates.map((c) => c.newSymbolName.length)) * this._typicalHalfwidthCharacterWidth);
    const width = Math.max(
      this._minimumWidth,
      4 + 16 + 5 + longestCandidateWidth + 10
      /* (possibly visible) scrollbar width */
      // TODO@ulugbekna: approximate calc - clean this up
    );
    return width;
  }
  static _createListWidget(container, candidateViewHeight, fontInfo) {
    const virtualDelegate = new class {
      getTemplateId(element) {
        return "candidate";
      }
      getHeight(element) {
        return candidateViewHeight;
      }
    }();
    const renderer = new class {
      constructor() {
        this.templateId = "candidate";
      }
      renderTemplate(container2) {
        return new RenameCandidateView(container2, fontInfo);
      }
      renderElement(candidate, index, templateData) {
        templateData.populate(candidate);
      }
      disposeTemplate(templateData) {
        templateData.dispose();
      }
    }();
    return new List(
      "NewSymbolNameCandidates",
      container,
      virtualDelegate,
      [renderer],
      {
        keyboardSupport: false,
        // @ulugbekna: because we handle keyboard events through proper commands & keybinding service, see `rename.ts`
        mouseSupport: true,
        multipleSelectionSupport: false
      }
    );
  }
}
class InputWithButton {
  constructor() {
    this._buttonHoverContent = "";
    this._disposables = new DisposableStore();
    this._onDidInputChange = this._disposables.add(new Emitter());
    this.onDidInputChange = this._onDidInputChange.event;
  }
  get domNode() {
    if (!this._domNode) {
      this._domNode = document.createElement("div");
      this._domNode.className = "rename-input-with-button";
      this._domNode.style.display = "flex";
      this._domNode.style.flexDirection = "row";
      this._domNode.style.alignItems = "center";
      this._inputNode = document.createElement("input");
      this._inputNode.className = "rename-input";
      this._inputNode.type = "text";
      this._inputNode.style.border = "none";
      this._inputNode.setAttribute("aria-label", nls.localize("renameAriaLabel", "Rename input. Type new name and press Enter to commit."));
      this._domNode.appendChild(this._inputNode);
      this._buttonNode = document.createElement("div");
      this._buttonNode.className = "rename-suggestions-button";
      this._buttonNode.setAttribute("tabindex", "0");
      this._buttonGenHoverText = nls.localize("generateRenameSuggestionsButton", "Generate New Name Suggestions");
      this._buttonCancelHoverText = nls.localize("cancelRenameSuggestionsButton", "Cancel");
      this._buttonHoverContent = this._buttonGenHoverText;
      this._disposables.add(getBaseLayerHoverDelegate().setupDelayedHover(this._buttonNode, () => ({
        content: this._buttonHoverContent,
        style: HoverStyle.Pointer
      })));
      this._domNode.appendChild(this._buttonNode);
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.INPUT, () => this._onDidInputChange.fire()));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.KEY_DOWN, (e) => {
        const keyEvent = new StandardKeyboardEvent(e);
        if (keyEvent.keyCode === KeyCode.LeftArrow || keyEvent.keyCode === KeyCode.RightArrow) {
          this._onDidInputChange.fire();
        }
      }));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.CLICK, () => this._onDidInputChange.fire()));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.FOCUS, () => {
        this.domNode.style.outlineWidth = "1px";
        this.domNode.style.outlineStyle = "solid";
        this.domNode.style.outlineOffset = "-1px";
        this.domNode.style.outlineColor = "var(--vscode-focusBorder)";
      }));
      this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.BLUR, () => {
        this.domNode.style.outline = "none";
      }));
    }
    return this._domNode;
  }
  get input() {
    assertType(this._inputNode);
    return this._inputNode;
  }
  get button() {
    assertType(this._buttonNode);
    return this._buttonNode;
  }
  get buttonState() {
    return this._buttonState;
  }
  setSparkleButton() {
    this._buttonState = "sparkle";
    this._sparkleIcon ??= renderIcon(Codicon.sparkle);
    dom.clearNode(this.button);
    this.button.appendChild(this._sparkleIcon);
    this.button.setAttribute("aria-label", "Generating new name suggestions");
    this._buttonHoverContent = this._buttonGenHoverText;
    this.input.focus();
  }
  setStopButton() {
    this._buttonState = "stop";
    this._stopIcon ??= renderIcon(Codicon.stopCircle);
    dom.clearNode(this.button);
    this.button.appendChild(this._stopIcon);
    this.button.setAttribute("aria-label", "Cancel generating new name suggestions");
    this._buttonHoverContent = this._buttonCancelHoverText;
    this.input.focus();
  }
  dispose() {
    this._disposables.dispose();
  }
}
const _RenameCandidateView = class _RenameCandidateView {
  constructor(parent, fontInfo) {
    this._domNode = document.createElement("div");
    this._domNode.className = "rename-box rename-candidate";
    this._domNode.style.display = `flex`;
    this._domNode.style.columnGap = `5px`;
    this._domNode.style.alignItems = `center`;
    this._domNode.style.height = `${fontInfo.lineHeight}px`;
    this._domNode.style.padding = `${_RenameCandidateView._PADDING}px`;
    const iconContainer = document.createElement("div");
    iconContainer.style.display = `flex`;
    iconContainer.style.alignItems = `center`;
    iconContainer.style.width = iconContainer.style.height = `${fontInfo.lineHeight * 0.8}px`;
    this._domNode.appendChild(iconContainer);
    this._icon = renderIcon(Codicon.sparkle);
    this._icon.style.display = `none`;
    iconContainer.appendChild(this._icon);
    this._label = document.createElement("div");
    domFontInfo.applyFontInfo(this._label, fontInfo);
    this._domNode.appendChild(this._label);
    parent.appendChild(this._domNode);
  }
  populate(value) {
    this._updateIcon(value);
    this._updateLabel(value);
  }
  _updateIcon(value) {
    const isAIGenerated = !!value.tags?.includes(NewSymbolNameTag.AIGenerated);
    this._icon.style.display = isAIGenerated ? "inherit" : "none";
  }
  _updateLabel(value) {
    this._label.innerText = value.newSymbolName;
  }
  static getLayoutInfo({ lineHeight }) {
    const totalHeight = lineHeight + _RenameCandidateView._PADDING * 2;
    return { totalHeight };
  }
  dispose() {
  }
};
_RenameCandidateView._PADDING = 2;
let RenameCandidateView = _RenameCandidateView;
export {
  CONTEXT_RENAME_INPUT_FOCUSED,
  CONTEXT_RENAME_INPUT_VISIBLE,
  RenameWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHJlbmFtZVxcYnJvd3NlclxccmVuYW1lV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlLCBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgJy4vcmVuYW1lV2lkZ2V0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb21Gb250SW5mbyBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvbmZpZy9kb21Gb250SW5mby5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvZGltZW5zaW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IE5ld1N5bWJvbE5hbWUsIE5ld1N5bWJvbE5hbWVUYWcsIE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgUHJvdmlkZXJSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGdldExpc3RTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHtcblx0ZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCxcblx0aW5wdXRCYWNrZ3JvdW5kLFxuXHRpbnB1dEJvcmRlcixcblx0aW5wdXRGb3JlZ3JvdW5kLFxuXHRxdWlja0lucHV0TGlzdEZvY3VzQmFja2dyb3VuZCxcblx0cXVpY2tJbnB1dExpc3RGb2N1c0ZvcmVncm91bmQsXG5cdHdpZGdldEJvcmRlcixcblx0d2lkZ2V0U2hhZG93XG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcblxuLyoqIGZvciBkZWJ1Z2dpbmcgKi9cbmNvbnN0IF9zdGlja3kgPSBmYWxzZVxuXHQvLyB8fCBCb29sZWFuKFwidHJ1ZVwiKSAvLyBkb25lIFwid2VpcmRseVwiIHNvIHRoYXQgYSBsaW50IHdhcm5pbmcgcHJldmVudHMgeW91IGZyb20gcHVzaGluZyB0aGlzXG5cdDtcblxuXG5leHBvcnQgY29uc3QgQ09OVEVYVF9SRU5BTUVfSU5QVVRfVklTSUJMRSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdyZW5hbWVJbnB1dFZpc2libGUnLCBmYWxzZSwgbmxzLmxvY2FsaXplKCdyZW5hbWVJbnB1dFZpc2libGUnLCBcIldoZXRoZXIgdGhlIHJlbmFtZSBpbnB1dCB3aWRnZXQgaXMgdmlzaWJsZVwiKSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9SRU5BTUVfSU5QVVRfRk9DVVNFRCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdyZW5hbWVJbnB1dEZvY3VzZWQnLCBmYWxzZSwgbmxzLmxvY2FsaXplKCdyZW5hbWVJbnB1dEZvY3VzZWQnLCBcIldoZXRoZXIgdGhlIHJlbmFtZSBpbnB1dCB3aWRnZXQgaXMgZm9jdXNlZFwiKSk7XG5cbi8qKlxuICogXCJTb3VyY2VcIiBvZiB0aGUgbmV3IG5hbWU6XG4gKiAtICdpbnB1dEZpZWxkJyAtIHVzZXIgZW50ZXJlZCB0aGUgbmV3IG5hbWVcbiAqIC0gJ3JlbmFtZVN1Z2dlc3Rpb24nIC0gdXNlciBwaWNrZWQgZnJvbSByZW5hbWUgc3VnZ2VzdGlvbnNcbiAqIC0gJ3VzZXJFZGl0ZWRSZW5hbWVTdWdnZXN0aW9uJyAtIHVzZXIgX2xpa2VseV8gZWRpdGVkIGEgcmVuYW1lIHN1Z2dlc3Rpb24gKFwibGlrZWx5XCIgYmVjYXVzZSB3aGVuIGlucHV0IHN0YXJ0ZWQgYmVpbmcgZWRpdGVkLCBhIHJlbmFtZSBzdWdnZXN0aW9uIGhhZCBmb2N1cylcbiAqL1xuZXhwb3J0IHR5cGUgTmV3TmFtZVNvdXJjZSA9XG5cdHwgeyBrOiAnaW5wdXRGaWVsZCcgfVxuXHR8IHsgazogJ3JlbmFtZVN1Z2dlc3Rpb24nIH1cblx0fCB7IGs6ICd1c2VyRWRpdGVkUmVuYW1lU3VnZ2VzdGlvbicgfTtcblxuLyoqXG4gKiBWYXJpb3VzIHN0YXRpc3RpY3MgcmVnYXJkaW5nIHJlbmFtZSBpbnB1dCBmaWVsZFxuICovXG5leHBvcnQgdHlwZSBSZW5hbWVXaWRnZXRTdGF0cyA9IHtcblx0blJlbmFtZVN1Z2dlc3Rpb25zOiBudW1iZXI7XG5cdHNvdXJjZTogTmV3TmFtZVNvdXJjZTtcblx0dGltZUJlZm9yZUZpcnN0SW5wdXRGaWVsZEVkaXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0blJlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbnM6IG51bWJlcjtcblx0aGFkQXV0b21hdGljUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uOiBib29sZWFuO1xufTtcblxuZXhwb3J0IHR5cGUgUmVuYW1lV2lkZ2V0UmVzdWx0ID0ge1xuXHQvKipcblx0ICogVGhlIG5ldyBuYW1lIHRvIGJlIHVzZWRcblx0ICovXG5cdG5ld05hbWU6IHN0cmluZztcblx0d2FudHNQcmV2aWV3PzogYm9vbGVhbjtcblx0c3RhdHM6IFJlbmFtZVdpZGdldFN0YXRzO1xufTtcblxuaW50ZXJmYWNlIElSZW5hbWVXaWRnZXQge1xuXHQvKipcblx0ICogQHJldHVybnMgYSBgYm9vbGVhbmAgc3RhbmRpbmcgZm9yIGBzaG91bGRGb2N1c0VkaXRvcmAsIGlmIHVzZXIgZGlkbid0IHBpY2sgYSBuZXcgbmFtZSwgb3IgYSB7QGxpbmsgUmVuYW1lV2lkZ2V0UmVzdWx0fVxuXHQgKi9cblx0Z2V0SW5wdXQoXG5cdFx0d2hlcmU6IElSYW5nZSxcblx0XHRjdXJyZW50TmFtZTogc3RyaW5nLFxuXHRcdHN1cHBvcnRQcmV2aWV3OiBib29sZWFuLFxuXHRcdHJlcXVlc3RSZW5hbWVTdWdnZXN0aW9uczogKHRyaWdnZXJLaW5kOiBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIGN0czogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb3ZpZGVyUmVzdWx0PE5ld1N5bWJvbE5hbWVbXT5bXSxcblx0XHRjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlXG5cdCk6IFByb21pc2U8UmVuYW1lV2lkZ2V0UmVzdWx0IHwgYm9vbGVhbj47XG5cblx0YWNjZXB0SW5wdXQod2FudHNQcmV2aWV3OiBib29sZWFuKTogdm9pZDtcblx0Y2FuY2VsSW5wdXQoZm9jdXNFZGl0b3I6IGJvb2xlYW4sIGNhbGxlcjogc3RyaW5nKTogdm9pZDtcblxuXHRmb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uKCk6IHZvaWQ7XG5cdGZvY3VzUHJldmlvdXNSZW5hbWVTdWdnZXN0aW9uKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBSZW5hbWVXaWRnZXQgaW1wbGVtZW50cyBJUmVuYW1lV2lkZ2V0LCBJQ29udGVudFdpZGdldCwgSURpc3Bvc2FibGUge1xuXG5cdC8vIGltcGxlbWVudCBJQ29udGVudFdpZGdldFxuXHRyZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93OiBib29sZWFuID0gdHJ1ZTtcblxuXHQvLyBVSSBzdGF0ZVxuXG5cdHByaXZhdGUgX2RvbU5vZGU/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaW5wdXRXaXRoQnV0dG9uOiBJbnB1dFdpdGhCdXR0b247XG5cdHByaXZhdGUgX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3PzogUmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXc7XG5cdHByaXZhdGUgX2xhYmVsPzogSFRNTERpdkVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfblB4QXZhaWxhYmxlQWJvdmU/OiBudW1iZXI7XG5cdHByaXZhdGUgX25QeEF2YWlsYWJsZUJlbG93PzogbnVtYmVyO1xuXG5cdC8vIE1vZGVsIHN0YXRlXG5cblx0cHJpdmF0ZSBfcG9zaXRpb24/OiBQb3NpdGlvbjtcblx0cHJpdmF0ZSBfY3VycmVudE5hbWU/OiBzdHJpbmc7XG5cdC8qKiBJcyB0cnVlIGlmIGlucHV0IGZpZWxkIGdvdCBjaGFuZ2VzIHdoZW4gYSByZW5hbWUgY2FuZGlkYXRlIHdhcyBmb2N1c2VkOyBvdGhlcndpc2UsIGZhbHNlICovXG5cdHByaXZhdGUgX2lzRWRpdGluZ1JlbmFtZUNhbmRpZGF0ZTogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5kaWRhdGVzOiBTZXQ8c3RyaW5nPjtcblxuXHRwcml2YXRlIF92aXNpYmxlPzogYm9vbGVhbjtcblxuXHQvKiogbXVzdCBiZSByZXNldCBhdCBzZXNzaW9uIHN0YXJ0ICovXG5cdHByaXZhdGUgX2JlZm9yZUZpcnN0SW5wdXRGaWVsZEVkaXRTVzogU3RvcFdhdGNoO1xuXG5cdC8qKlxuXHQgKiBNaWxsaXNlY29uZHMgYmVmb3JlIHVzZXIgZWRpdHMgdGhlIGlucHV0IGZpZWxkIGZvciB0aGUgZmlyc3QgdGltZVxuXHQgKiBAcmVtYXJrcyBtdXN0IGJlIHNldCBvbmNlIHBlciBzZXNzaW9uXG5cdCAqL1xuXHRwcml2YXRlIF90aW1lQmVmb3JlRmlyc3RJbnB1dEZpZWxkRWRpdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX25SZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb25zOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBfaGFkQXV0b21hdGljUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbmFtZUN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjY2VwdEtleWJpbmRpbmdzOiBbc3RyaW5nLCBzdHJpbmddLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkgPSBDT05URVhUX1JFTkFNRV9JTlBVVF9WSVNJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9pc0VkaXRpbmdSZW5hbWVDYW5kaWRhdGUgPSBmYWxzZTtcblxuXHRcdHRoaXMuX25SZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb25zID0gMDtcblxuXHRcdHRoaXMuX2hhZEF1dG9tYXRpY1JlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbiA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fY2FuZGlkYXRlcyA9IG5ldyBTZXQoKTtcblxuXHRcdHRoaXMuX2JlZm9yZUZpcnN0SW5wdXRGaWVsZEVkaXRTVyA9IG5ldyBTdG9wV2F0Y2goKTtcblxuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbiA9IG5ldyBJbnB1dFdpdGhCdXR0b24oKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5faW5wdXRXaXRoQnV0dG9uKTtcblxuXHRcdHRoaXMuX2VkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRm9udCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLl91cGRhdGVTdHlsZXMsIHRoaXMpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ19fcmVuYW1lSW5wdXRXaWRnZXQnO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlKSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9ICdtb25hY28tZWRpdG9yIHJlbmFtZS1ib3gnO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5kb21Ob2RlKTtcblxuXHRcdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXcgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRcdG5ldyBSZW5hbWVDYW5kaWRhdGVMaXN0Vmlldyh0aGlzLl9kb21Ob2RlLCB7XG5cdFx0XHRcdFx0Zm9udEluZm86IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSxcblx0XHRcdFx0XHRvbkZvY3VzQ2hhbmdlOiAobmV3U3ltYm9sTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQudmFsdWUgPSBuZXdTeW1ib2xOYW1lO1xuXHRcdFx0XHRcdFx0dGhpcy5faXNFZGl0aW5nUmVuYW1lQ2FuZGlkYXRlID0gZmFsc2U7IC8vIEB1bHVnYmVrbmE6IHJlc2V0XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvblNlbGVjdGlvbkNoYW5nZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5faXNFZGl0aW5nUmVuYW1lQ2FuZGlkYXRlID0gZmFsc2U7IC8vIEB1bHVnYmVrbmE6IGJlY2F1c2UgdXNlciBwaWNrZWQgYSByZW5hbWUgc3VnZ2VzdGlvblxuXHRcdFx0XHRcdFx0dGhpcy5hY2NlcHRJbnB1dChmYWxzZSk7IC8vIHdlIGRvbid0IGFsbG93IHByZXZpZXcgd2l0aCBtb3VzZSBjbGljayBmb3Igbm93XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24ub25EaWRJbnB1dENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3Py5mb2N1c2VkQ2FuZGlkYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2lzRWRpdGluZ1JlbmFtZUNhbmRpZGF0ZSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3RpbWVCZWZvcmVGaXJzdElucHV0RmllbGRFZGl0ID8/PSB0aGlzLl9iZWZvcmVGaXJzdElucHV0RmllbGRFZGl0U1cuZWxhcHNlZCgpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHM/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlUHJvdmlkZXJzQ3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0Vmlldz8uY2xlYXJGb2N1cygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuX2xhYmVsLmNsYXNzTmFtZSA9ICdyZW5hbWUtbGFiZWwnO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9sYWJlbCk7XG5cblx0XHRcdHRoaXMuX3VwZGF0ZUZvbnQoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVN0eWxlcyh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdHlsZXModGhlbWU6IElDb2xvclRoZW1lKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0U2hhZG93Q29sb3IgPSB0aGVtZS5nZXRDb2xvcih3aWRnZXRTaGFkb3cpO1xuXHRcdGNvbnN0IHdpZGdldEJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3Iod2lkZ2V0Qm9yZGVyKTtcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFN0cmluZyh0aGVtZS5nZXRDb2xvcihlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kKSA/PyAnJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5ib3hTaGFkb3cgPSB3aWRnZXRTaGFkb3dDb2xvciA/IGAgMCAwIDhweCAycHggJHt3aWRnZXRTaGFkb3dDb2xvcn1gIDogJyc7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5ib3JkZXIgPSB3aWRnZXRCb3JkZXJDb2xvciA/IGAxcHggc29saWQgJHt3aWRnZXRCb3JkZXJDb2xvcn1gIDogJyc7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5jb2xvciA9IFN0cmluZyh0aGVtZS5nZXRDb2xvcihpbnB1dEZvcmVncm91bmQpID8/ICcnKTtcblxuXHRcdGNvbnN0IGJvcmRlciA9IHRoZW1lLmdldENvbG9yKGlucHV0Qm9yZGVyKTtcblxuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5kb21Ob2RlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFN0cmluZyh0aGVtZS5nZXRDb2xvcihpbnB1dEJhY2tncm91bmQpID8/ICcnKTtcblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gU3RyaW5nKHRoZW1lLmdldENvbG9yKGlucHV0QmFja2dyb3VuZCkgPz8gJycpO1xuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5kb21Ob2RlLnN0eWxlLmJvcmRlcldpZHRoID0gYm9yZGVyID8gJzFweCcgOiAnMHB4Jztcblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uZG9tTm9kZS5zdHlsZS5ib3JkZXJTdHlsZSA9IGJvcmRlciA/ICdzb2xpZCcgOiAnbm9uZSc7XG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmRvbU5vZGUuc3R5bGUuYm9yZGVyQ29sb3IgPSBib3JkZXI/LnRvU3RyaW5nKCkgPz8gJ25vbmUnO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRm9udCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZG9tTm9kZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFzc2VydFR5cGUodGhpcy5fbGFiZWwgIT09IHVuZGVmaW5lZCwgJ1JlbmFtZVdpZGdldCNfdXBkYXRlRm9udDogX2xhYmVsIG11c3Qgbm90IGJlIHVuZGVmaW5lZCBnaXZlbiBfZG9tTm9kZSBpcyBkZWZpbmVkJyk7XG5cblx0XHR0aGlzLl9lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQpO1xuXG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0dGhpcy5fbGFiZWwuc3R5bGUuZm9udFNpemUgPSBgJHt0aGlzLl9jb21wdXRlTGFiZWxGb250U2l6ZShmb250SW5mby5mb250U2l6ZSl9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUxhYmVsRm9udFNpemUoZWRpdG9yRm9udFNpemU6IG51bWJlcikge1xuXHRcdHJldHVybiBlZGl0b3JGb250U2l6ZSAqIDAuODtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX3Zpc2libGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgLy8gQHVsdWdiZWtuYTogc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0IXRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkgLy8gQHVsdWdiZWtuYTogY2FuIGhhcHBlbiBkdXJpbmcgdGVzdHMgYmFzZWQgb24gc3VnZ2VzdFdpZGdldCdzIHNpbWlsYXIgcHJlZGljYXRlIGNoZWNrXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5Qm94ID0gZG9tLmdldENsaWVudEFyZWEodGhpcy5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5ib2R5KTtcblx0XHRjb25zdCBlZGl0b3JCb3ggPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdGNvbnN0IGN1cnNvckJveFRvcCA9IHRoaXMuX2dldFRvcEZvclBvc2l0aW9uKCk7XG5cblx0XHR0aGlzLl9uUHhBdmFpbGFibGVBYm92ZSA9IGN1cnNvckJveFRvcCArIGVkaXRvckJveC50b3A7XG5cdFx0dGhpcy5fblB4QXZhaWxhYmxlQmVsb3cgPSBib2R5Qm94LmhlaWdodCAtIHRoaXMuX25QeEF2YWlsYWJsZUFib3ZlO1xuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IHsgdG90YWxIZWlnaHQ6IGNhbmRpZGF0ZVZpZXdIZWlnaHQgfSA9IFJlbmFtZUNhbmRpZGF0ZVZpZXcuZ2V0TGF5b3V0SW5mbyh7IGxpbmVIZWlnaHQgfSk7XG5cblx0XHRjb25zdCBwb3NpdGlvblByZWZlcmVuY2UgPSB0aGlzLl9uUHhBdmFpbGFibGVCZWxvdyA+IGNhbmRpZGF0ZVZpZXdIZWlnaHQgKiA2IC8qIGFwcHJveGltYXRlICMgb2YgY2FuZGlkYXRlcyB0byBmaXQgaW4gKGluY2x1c2l2ZSBvZiByZW5hbWUgaW5wdXQgYm94ICYgcmVuYW1lIGxhYmVsKSAqL1xuXHRcdFx0PyBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVywgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRV1cblx0XHRcdDogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUsIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1ddO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBvc2l0aW9uOiB0aGlzLl9wb3NpdGlvbiEsXG5cdFx0XHRwcmVmZXJlbmNlOiBwb3NpdGlvblByZWZlcmVuY2UsXG5cdFx0fTtcblx0fVxuXG5cdGJlZm9yZVJlbmRlcigpOiBJRGltZW5zaW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgW2FjY2VwdCwgcHJldmlld10gPSB0aGlzLl9hY2NlcHRLZXliaW5kaW5ncztcblx0XHR0aGlzLl9sYWJlbCEuaW5uZXJUZXh0ID0gbmxzLmxvY2FsaXplKHsga2V5OiAnbGFiZWwnLCBjb21tZW50OiBbJ3BsYWNlaG9sZGVycyBhcmUga2V5YmluZGluZ3MsIGUuZyBcIkYyIHRvIFJlbmFtZSwgU2hpZnQrRjIgdG8gUHJldmlld1wiJ10gfSwgXCJ7MH0gdG8gUmVuYW1lLCB7MX0gdG8gUHJldmlld1wiLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjY2VwdCk/LmdldExhYmVsKCksIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcocHJldmlldyk/LmdldExhYmVsKCkpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSEuc3R5bGUubWluV2lkdGggPSBgMjAwcHhgOyAvLyB0byBwcmV2ZW50IGZyb20gd2lkZW5pbmcgd2hlbiBjYW5kaWRhdGVzIGNvbWUgaW5cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YWZ0ZXJSZW5kZXIocG9zaXRpb246IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfCBudWxsKTogdm9pZCB7XG5cdFx0Ly8gRklYTUVAdWx1Z2Jla25hOiBjb21tZW50aW5nIHRyYWNlIGxvZyBvdXQgdW50aWwgd2Ugc3RhcnQgdW5tb3VudGluZyB0aGUgd2lkZ2V0IGZyb20gZWRpdG9yIHByb3Blcmx5IC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyNjk3NVxuXHRcdC8vIHRoaXMuX3RyYWNlKCdpbnZva2luZyBhZnRlclJlbmRlciwgcG9zaXRpb246ICcsIHBvc2l0aW9uID8gJ25vdCBudWxsJyA6ICdudWxsJyk7XG5cdFx0aWYgKHBvc2l0aW9uID09PSBudWxsKSB7XG5cdFx0XHQvLyBjYW5jZWwgcmVuYW1lIHdoZW4gaW5wdXQgd2lkZ2V0IGlzbid0IHJlbmRlcmVkIGFueW1vcmVcblx0XHRcdHRoaXMuY2FuY2VsSW5wdXQodHJ1ZSwgJ2FmdGVyUmVuZGVyIChiZWNhdXNlIHBvc2l0aW9uIGlzIG51bGwpJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSB8fCAvLyBzaG91bGRuJ3QgaGFwcGVuXG5cdFx0XHQhdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSAvLyBjYW4gaGFwcGVuIGR1cmluZyB0ZXN0cyBiYXNlZCBvbiBzdWdnZXN0V2lkZ2V0J3Mgc2ltaWxhciBwcmVkaWNhdGUgY2hlY2tcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhc3NlcnRUeXBlKHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3KTtcblx0XHRhc3NlcnRUeXBlKHRoaXMuX25QeEF2YWlsYWJsZUFib3ZlICE9PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydFR5cGUodGhpcy5fblB4QXZhaWxhYmxlQmVsb3cgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBpbnB1dEJveEhlaWdodCA9IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLl9pbnB1dFdpdGhCdXR0b24uZG9tTm9kZSk7XG5cblx0XHRjb25zdCBsYWJlbEhlaWdodCA9IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLl9sYWJlbCEpO1xuXG5cdFx0bGV0IHRvdGFsSGVpZ2h0QXZhaWxhYmxlOiBudW1iZXI7XG5cdFx0aWYgKHBvc2l0aW9uID09PSBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XKSB7XG5cdFx0XHR0b3RhbEhlaWdodEF2YWlsYWJsZSA9IHRoaXMuX25QeEF2YWlsYWJsZUJlbG93O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0b3RhbEhlaWdodEF2YWlsYWJsZSA9IHRoaXMuX25QeEF2YWlsYWJsZUFib3ZlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3LmxheW91dCh7XG5cdFx0XHRoZWlnaHQ6IHRvdGFsSGVpZ2h0QXZhaWxhYmxlIC0gbGFiZWxIZWlnaHQgLSBpbnB1dEJveEhlaWdodCxcblx0XHRcdHdpZHRoOiBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9pbnB1dFdpdGhCdXR0b24uZG9tTm9kZSksXG5cdFx0fSk7XG5cdH1cblxuXG5cdHByaXZhdGUgX2N1cnJlbnRBY2NlcHRJbnB1dD86ICh3YW50c1ByZXZpZXc6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRDYW5jZWxJbnB1dD86IChmb2N1c0VkaXRvcjogYm9vbGVhbikgPT4gdm9pZDtcblx0cHJpdmF0ZSBfcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXNPbmNlPzogKHRyaWdnZXJLaW5kOiBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIGN0czogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb3ZpZGVyUmVzdWx0PE5ld1N5bWJvbE5hbWVbXT5bXTtcblxuXHRhY2NlcHRJbnB1dCh3YW50c1ByZXZpZXc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl90cmFjZShgaW52b2tpbmcgYWNjZXB0SW5wdXRgKTtcblx0XHR0aGlzLl9jdXJyZW50QWNjZXB0SW5wdXQ/Lih3YW50c1ByZXZpZXcpO1xuXHR9XG5cblx0Y2FuY2VsSW5wdXQoZm9jdXNFZGl0b3I6IGJvb2xlYW4sIGNhbGxlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gdGhpcy5fdHJhY2UoYGludm9raW5nIGNhbmNlbElucHV0LCBjYWxsZXI6ICR7Y2FsbGVyfSwgX2N1cnJlbnRDYW5jZWxJbnB1dDogJHt0aGlzLl9jdXJyZW50QWNjZXB0SW5wdXQgPyAnbm90IHVuZGVmaW5lZCcgOiAndW5kZWZpbmVkJ31gKTtcblx0XHR0aGlzLl9jdXJyZW50Q2FuY2VsSW5wdXQ/Lihmb2N1c0VkaXRvcik7XG5cdH1cblxuXHRmb2N1c05leHRSZW5hbWVTdWdnZXN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXc/LmZvY3VzTmV4dCgpKSB7XG5cdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQudmFsdWUgPSB0aGlzLl9jdXJyZW50TmFtZSE7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNQcmV2aW91c1JlbmFtZVN1Z2dlc3Rpb24oKSB7IC8vIFRPRE9AdWx1Z2Jla25hOiB0aGlzIGFuZCBmb2N1c05leHQgc2hvdWxkIHNldCB0aGUgb3JpZ2luYWwgbmFtZSBpZiBubyBjYW5kaWRhdGUgaXMgZm9jdXNlZFxuXHRcdGlmICghdGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXc/LmZvY3VzUHJldmlvdXMoKSkge1xuXHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnZhbHVlID0gdGhpcy5fY3VycmVudE5hbWUhO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAcGFyYW0gcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXMgaXMgYHVuZGVmaW5lZGAgd2hlbiB0aGVyZSBhcmUgbm8gcmVuYW1lIHN1Z2dlc3Rpb24gcHJvdmlkZXJzXG5cdCAqL1xuXHRnZXRJbnB1dChcblx0XHR3aGVyZTogSVJhbmdlLFxuXHRcdGN1cnJlbnROYW1lOiBzdHJpbmcsXG5cdFx0c3VwcG9ydFByZXZpZXc6IGJvb2xlYW4sXG5cdFx0cmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXM6IHVuZGVmaW5lZCB8ICgodHJpZ2dlcktpbmQ6IE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCwgY3RzOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvdmlkZXJSZXN1bHQ8TmV3U3ltYm9sTmFtZVtdPltdKSxcblx0XHRjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlXG5cdCk6IFByb21pc2U8UmVuYW1lV2lkZ2V0UmVzdWx0IHwgYm9vbGVhbj4ge1xuXG5cdFx0Y29uc3QgeyBzdGFydDogc2VsZWN0aW9uU3RhcnQsIGVuZDogc2VsZWN0aW9uRW5kIH0gPSB0aGlzLl9nZXRTZWxlY3Rpb24od2hlcmUsIGN1cnJlbnROYW1lKTtcblxuXHRcdHRoaXMuX3JlbmFtZUN0cyA9IGN0cztcblxuXHRcdGNvbnN0IGRpc3Bvc2VPbkRvbmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0aGlzLl9uUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9ucyA9IDA7XG5cblx0XHR0aGlzLl9oYWRBdXRvbWF0aWNSZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb24gPSBmYWxzZTtcblxuXHRcdGlmIChyZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uYnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5idXR0b24uc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuXHRcdFx0dGhpcy5fcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXNPbmNlID0gcmVxdWVzdFJlbmFtZUNhbmRpZGF0ZXM7XG5cblx0XHRcdHRoaXMuX3JlcXVlc3RSZW5hbWVDYW5kaWRhdGVzKGN1cnJlbnROYW1lLCBmYWxzZSk7XG5cblx0XHRcdGRpc3Bvc2VPbkRvbmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoXG5cdFx0XHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5idXR0b24sXG5cdFx0XHRcdCdjbGljaycsXG5cdFx0XHRcdCgpID0+IHRoaXMuX3JlcXVlc3RSZW5hbWVDYW5kaWRhdGVzKGN1cnJlbnROYW1lLCB0cnVlKVxuXHRcdFx0KSk7XG5cdFx0XHRkaXNwb3NlT25Eb25lLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKFxuXHRcdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uYnV0dG9uLFxuXHRcdFx0XHRkb20uRXZlbnRUeXBlLktFWV9ET1dOLFxuXHRcdFx0XHQoZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGtleUV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0XHRcdGlmIChrZXlFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwga2V5RXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdFx0XHRrZXlFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRcdGtleUV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlcyhjdXJyZW50TmFtZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0VkaXRpbmdSZW5hbWVDYW5kaWRhdGUgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2RvbU5vZGUhLmNsYXNzTGlzdC50b2dnbGUoJ3ByZXZpZXcnLCBzdXBwb3J0UHJldmlldyk7XG5cblx0XHR0aGlzLl9wb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih3aGVyZS5zdGFydExpbmVOdW1iZXIsIHdoZXJlLnN0YXJ0Q29sdW1uKTtcblx0XHR0aGlzLl9jdXJyZW50TmFtZSA9IGN1cnJlbnROYW1lO1xuXG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnZhbHVlID0gY3VycmVudE5hbWU7XG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnNldEF0dHJpYnV0ZSgnc2VsZWN0aW9uU3RhcnQnLCBzZWxlY3Rpb25TdGFydC50b1N0cmluZygpKTtcblx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQuc2V0QXR0cmlidXRlKCdzZWxlY3Rpb25FbmQnLCBzZWxlY3Rpb25FbmQudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnNpemUgPSBNYXRoLm1heCgod2hlcmUuZW5kQ29sdW1uIC0gd2hlcmUuc3RhcnRDb2x1bW4pICogMS4xLCAyMCk7IC8vIGRldGVybWluZXMgd2lkdGhcblxuXHRcdHRoaXMuX2JlZm9yZUZpcnN0SW5wdXRGaWVsZEVkaXRTVy5yZXNldCgpO1xuXG5cblx0XHRkaXNwb3NlT25Eb25lLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVuYW1lQ3RzID0gdW5kZWZpbmVkO1xuXHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fSkpOyAvLyBAdWx1Z2Jla25hOiB0aGlzIG1heSByZXN1bHQgaW4gYHRoaXMuY2FuY2VsSW5wdXRgIGJlaW5nIGNhbGxlZCB0d2ljZSwgYnV0IGl0IHNob3VsZCBiZSBzYWZlIHNpbmNlIHdlIHNldCBpdCB0byB1bmRlZmluZWQgYWZ0ZXIgMXN0IGNhbGxcblx0XHRkaXNwb3NlT25Eb25lLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0cy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zZU9uRG9uZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NhbmRpZGF0ZXMuY2xlYXIoKSkpO1xuXG5cdFx0Y29uc3QgaW5wdXRSZXN1bHQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFJlbmFtZVdpZGdldFJlc3VsdCB8IGJvb2xlYW4+KCk7XG5cblx0XHRpbnB1dFJlc3VsdC5wLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZU9uRG9uZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9oaWRlKCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jdXJyZW50Q2FuY2VsSW5wdXQgPSAoZm9jdXNFZGl0b3IpID0+IHtcblx0XHRcdHRoaXMuX3RyYWNlKCdpbnZva2luZyBfY3VycmVudENhbmNlbElucHV0Jyk7XG5cdFx0XHR0aGlzLl9jdXJyZW50QWNjZXB0SW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q2FuY2VsSW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBmaXhtZSBzZXNzaW9uIGNsZWFudXBcblx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3Py5jbGVhckNhbmRpZGF0ZXMoKTtcblx0XHRcdGlucHV0UmVzdWx0LmNvbXBsZXRlKGZvY3VzRWRpdG9yKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cblx0XHR0aGlzLl9jdXJyZW50QWNjZXB0SW5wdXQgPSAod2FudHNQcmV2aWV3KSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZSgnaW52b2tpbmcgX2N1cnJlbnRBY2NlcHRJbnB1dCcpO1xuXHRcdFx0YXNzZXJ0VHlwZSh0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0VmlldyAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3QgblJlbmFtZVN1Z2dlc3Rpb25zID0gdGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXcubkNhbmRpZGF0ZXM7XG5cblx0XHRcdGxldCBuZXdOYW1lOiBzdHJpbmc7XG5cdFx0XHRsZXQgc291cmNlOiBOZXdOYW1lU291cmNlO1xuXHRcdFx0Y29uc3QgZm9jdXNlZENhbmRpZGF0ZSA9IHRoaXMuX3JlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3LmZvY3VzZWRDYW5kaWRhdGU7XG5cdFx0XHRpZiAoZm9jdXNlZENhbmRpZGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3RyYWNlKCd1c2luZyBuZXcgbmFtZSBmcm9tIHJlbmFtZVN1Z2dlc3Rpb24nKTtcblx0XHRcdFx0bmV3TmFtZSA9IGZvY3VzZWRDYW5kaWRhdGU7XG5cdFx0XHRcdHNvdXJjZSA9IHsgazogJ3JlbmFtZVN1Z2dlc3Rpb24nIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl90cmFjZSgndXNpbmcgbmV3IG5hbWUgZnJvbSBpbnB1dEZpZWxkJyk7XG5cdFx0XHRcdG5ld05hbWUgPSB0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQudmFsdWU7XG5cdFx0XHRcdHNvdXJjZSA9IHRoaXMuX2lzRWRpdGluZ1JlbmFtZUNhbmRpZGF0ZSA/IHsgazogJ3VzZXJFZGl0ZWRSZW5hbWVTdWdnZXN0aW9uJyB9IDogeyBrOiAnaW5wdXRGaWVsZCcgfTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld05hbWUgPT09IGN1cnJlbnROYW1lIHx8IG5ld05hbWUudHJpbSgpLmxlbmd0aCA9PT0gMCAvKiBpcyBqdXN0IHdoaXRlc3BhY2UgKi8pIHtcblx0XHRcdFx0dGhpcy5jYW5jZWxJbnB1dCh0cnVlLCAnX2N1cnJlbnRBY2NlcHRJbnB1dCAoYmVjYXVzZSBuZXdOYW1lID09PSB2YWx1ZSB8fCBuZXdOYW1lLnRyaW0oKS5sZW5ndGggPT09IDApJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY3VycmVudEFjY2VwdElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudENhbmNlbElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlTGlzdFZpZXcuY2xlYXJDYW5kaWRhdGVzKCk7XG5cdFx0XHQvLyBmaXhtZSBzZXNzaW9uIGNsZWFudXBcblxuXHRcdFx0aW5wdXRSZXN1bHQuY29tcGxldGUoe1xuXHRcdFx0XHRuZXdOYW1lLFxuXHRcdFx0XHR3YW50c1ByZXZpZXc6IHN1cHBvcnRQcmV2aWV3ICYmIHdhbnRzUHJldmlldyxcblx0XHRcdFx0c3RhdHM6IHtcblx0XHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdFx0blJlbmFtZVN1Z2dlc3Rpb25zLFxuXHRcdFx0XHRcdHRpbWVCZWZvcmVGaXJzdElucHV0RmllbGRFZGl0OiB0aGlzLl90aW1lQmVmb3JlRmlyc3RJbnB1dEZpZWxkRWRpdCxcblx0XHRcdFx0XHRuUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uczogdGhpcy5fblJlbmFtZVN1Z2dlc3Rpb25zSW52b2NhdGlvbnMsXG5cdFx0XHRcdFx0aGFkQXV0b21hdGljUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9uOiB0aGlzLl9oYWRBdXRvbWF0aWNSZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb24sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRkaXNwb3NlT25Eb25lLmFkZChjdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdGhpcy5jYW5jZWxJbnB1dCh0cnVlLCAnY3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkJykpKTtcblx0XHRpZiAoIV9zdGlja3kpIHtcblx0XHRcdGRpc3Bvc2VPbkRvbmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy5jYW5jZWxJbnB1dCghdGhpcy5fZG9tTm9kZT8ub3duZXJEb2N1bWVudC5oYXNGb2N1cygpLCAnZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCcpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2hvdygpO1xuXG5cdFx0cmV0dXJuIGlucHV0UmVzdWx0LnA7XG5cdH1cblxuXHRwcml2YXRlIF9yZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlcyhjdXJyZW50TmFtZTogc3RyaW5nLCBpc01hbnVhbGx5VHJpZ2dlcmVkOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX3JlcXVlc3RSZW5hbWVDYW5kaWRhdGVzT25jZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZW5hbWVDYW5kaWRhdGVQcm92aWRlcnNDdHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVuYW1lQ2FuZGlkYXRlUHJvdmlkZXJzQ3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl9yZW5hbWVDdHMpO1xuXG5cdFx0aWYgKHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5idXR0b25TdGF0ZSAhPT0gJ3N0b3AnKSB7XG5cblx0XHRcdHRoaXMuX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0XHRjb25zdCB0cmlnZ2VyS2luZCA9IGlzTWFudWFsbHlUcmlnZ2VyZWQgPyBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQuSW52b2tlIDogTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLkF1dG9tYXRpYztcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSB0aGlzLl9yZXF1ZXN0UmVuYW1lQ2FuZGlkYXRlc09uY2UodHJpZ2dlcktpbmQsIHRoaXMuX3JlbmFtZUNhbmRpZGF0ZVByb3ZpZGVyc0N0cy50b2tlbik7XG5cblx0XHRcdGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uc2V0U3BhcmtsZUJ1dHRvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNNYW51YWxseVRyaWdnZXJlZCkge1xuXHRcdFx0XHR0aGlzLl9oYWRBdXRvbWF0aWNSZW5hbWVTdWdnZXN0aW9uc0ludm9jYXRpb24gPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9uUmVuYW1lU3VnZ2VzdGlvbnNJbnZvY2F0aW9ucyArPSAxO1xuXG5cdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uc2V0U3RvcEJ1dHRvbigpO1xuXG5cdFx0XHR0aGlzLl91cGRhdGVSZW5hbWVDYW5kaWRhdGVzKGNhbmRpZGF0ZXMsIGN1cnJlbnROYW1lLCB0aGlzLl9yZW5hbWVDdHMudG9rZW4pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGlzIGFsbG93cyBzZWxlY3Rpbmcgb25seSBwYXJ0IG9mIHRoZSBzeW1ib2wgbmFtZSBpbiB0aGUgaW5wdXQgZmllbGQgYmFzZWQgb24gdGhlIHNlbGVjdGlvbiBpbiB0aGUgZWRpdG9yXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRTZWxlY3Rpb24od2hlcmU6IElSYW5nZSwgY3VycmVudE5hbWU6IHN0cmluZyk6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfSB7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IHN0YXJ0ID0gMDtcblx0XHRsZXQgZW5kID0gY3VycmVudE5hbWUubGVuZ3RoO1xuXG5cdFx0aWYgKCFSYW5nZS5pc0VtcHR5KHNlbGVjdGlvbikgJiYgIVJhbmdlLnNwYW5zTXVsdGlwbGVMaW5lcyhzZWxlY3Rpb24pICYmIFJhbmdlLmNvbnRhaW5zUmFuZ2Uod2hlcmUsIHNlbGVjdGlvbikpIHtcblx0XHRcdHN0YXJ0ID0gTWF0aC5tYXgoMCwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uIC0gd2hlcmUuc3RhcnRDb2x1bW4pO1xuXHRcdFx0ZW5kID0gTWF0aC5taW4od2hlcmUuZW5kQ29sdW1uLCBzZWxlY3Rpb24uZW5kQ29sdW1uKSAtIHdoZXJlLnN0YXJ0Q29sdW1uO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHN0YXJ0LCBlbmQgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3coKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhY2UoJ2ludm9raW5nIF9zaG93Jyk7XG5cdFx0dGhpcy5fZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHRoaXMuX3Bvc2l0aW9uIS5saW5lTnVtYmVyLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXG5cdFx0Ly8gVE9ET0B1bHVnYmVrbmE6IGNvdWxkIHRoaXMgYmUgc2ltcGx5IHJ1biBpbiBgYWZ0ZXJSZW5kZXJgP1xuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LmZvY3VzKCk7XG5cdFx0XHR0aGlzLl9pbnB1dFdpdGhCdXR0b24uaW5wdXQuc2V0U2VsZWN0aW9uUmFuZ2UoXG5cdFx0XHRcdHBhcnNlSW50KHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5pbnB1dC5nZXRBdHRyaWJ1dGUoJ3NlbGVjdGlvblN0YXJ0JykhKSxcblx0XHRcdFx0cGFyc2VJbnQodGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LmdldEF0dHJpYnV0ZSgnc2VsZWN0aW9uRW5kJykhKVxuXHRcdFx0KTtcblx0XHR9LCAxMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlUmVuYW1lQ2FuZGlkYXRlcyhjYW5kaWRhdGVzOiBQcm92aWRlclJlc3VsdDxOZXdTeW1ib2xOYW1lW10+W10sIGN1cnJlbnROYW1lOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGNvbnN0IHRyYWNlID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdGhpcy5fdHJhY2UoJ191cGRhdGVSZW5hbWVDYW5kaWRhdGVzJywgLi4uYXJncyk7XG5cblx0XHR0cmFjZSgnc3RhcnQnKTtcblx0XHRjb25zdCBuYW1lc0xpc3RSZXN1bHRzID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbihQcm9taXNlLmFsbFNldHRsZWQoY2FuZGlkYXRlcyksIHRva2VuKTtcblxuXHRcdHRoaXMuX2lucHV0V2l0aEJ1dHRvbi5zZXRTcGFya2xlQnV0dG9uKCk7XG5cblx0XHRpZiAobmFtZXNMaXN0UmVzdWx0cyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cmFjZSgncmV0dXJuaW5nIGVhcmx5IC0gcmVjZWl2ZWQgdXBkYXRlUmVuYW1lQ2FuZGlkYXRlcyByZXN1bHRzIC0gdW5kZWZpbmVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3TmFtZXMgPSBuYW1lc0xpc3RSZXN1bHRzLmZsYXRNYXAobmFtZXNMaXN0UmVzdWx0ID0+XG5cdFx0XHRuYW1lc0xpc3RSZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiBpc0RlZmluZWQobmFtZXNMaXN0UmVzdWx0LnZhbHVlKVxuXHRcdFx0XHQ/IG5hbWVzTGlzdFJlc3VsdC52YWx1ZVxuXHRcdFx0XHQ6IFtdXG5cdFx0KTtcblx0XHR0cmFjZShgcmVjZWl2ZWQgdXBkYXRlUmVuYW1lQ2FuZGlkYXRlcyByZXN1bHRzIC0gdG90YWwgKHVuZmlsdGVyZWQpICR7bmV3TmFtZXMubGVuZ3RofSBjYW5kaWRhdGVzLmApO1xuXG5cdFx0Ly8gZGVkdXBsaWNhdGUgYW5kIGZpbHRlciBvdXQgdGhlIGN1cnJlbnQgdmFsdWVcblxuXHRcdGNvbnN0IGRpc3RpbmN0TmFtZXMgPSBhcnJheXMuZGlzdGluY3QobmV3TmFtZXMsIHYgPT4gdi5uZXdTeW1ib2xOYW1lKTtcblx0XHR0cmFjZShgZGlzdGluY3QgY2FuZGlkYXRlcyAtICR7ZGlzdGluY3ROYW1lcy5sZW5ndGh9IGNhbmRpZGF0ZXMuYCk7XG5cblx0XHRjb25zdCB2YWxpZERpc3RpbmN0TmFtZXMgPSBkaXN0aW5jdE5hbWVzLmZpbHRlcigoeyBuZXdTeW1ib2xOYW1lIH0pID0+IG5ld1N5bWJvbE5hbWUudHJpbSgpLmxlbmd0aCA+IDAgJiYgbmV3U3ltYm9sTmFtZSAhPT0gdGhpcy5faW5wdXRXaXRoQnV0dG9uLmlucHV0LnZhbHVlICYmIG5ld1N5bWJvbE5hbWUgIT09IGN1cnJlbnROYW1lICYmICF0aGlzLl9jYW5kaWRhdGVzLmhhcyhuZXdTeW1ib2xOYW1lKSk7XG5cdFx0dHJhY2UoYHZhbGlkIGRpc3RpbmN0IGNhbmRpZGF0ZXMgLSAke25ld05hbWVzLmxlbmd0aH0gY2FuZGlkYXRlcy5gKTtcblxuXHRcdHZhbGlkRGlzdGluY3ROYW1lcy5mb3JFYWNoKG4gPT4gdGhpcy5fY2FuZGlkYXRlcy5hZGQobi5uZXdTeW1ib2xOYW1lKSk7XG5cblx0XHRpZiAodmFsaWREaXN0aW5jdE5hbWVzLmxlbmd0aCA8IDEpIHtcblx0XHRcdHRyYWNlKCdyZXR1cm5pbmcgZWFybHkgLSBubyB2YWxpZCBkaXN0aW5jdCBjYW5kaWRhdGVzJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gc2hvdyB0aGUgY2FuZGlkYXRlc1xuXHRcdHRyYWNlKCdzZXR0aW5nIGNhbmRpZGF0ZXMnKTtcblx0XHR0aGlzLl9yZW5hbWVDYW5kaWRhdGVMaXN0VmlldyEuc2V0Q2FuZGlkYXRlcyh2YWxpZERpc3RpbmN0TmFtZXMpO1xuXG5cdFx0Ly8gYXNrIGVkaXRvciB0byByZS1sYXlvdXQgZ2l2ZW4gdGhhdCB0aGUgd2lkZ2V0IGlzIG5vdyBvZiBhIGRpZmZlcmVudCBzaXplIGFmdGVyIHJlbmRlcmluZyByZW5hbWUgY2FuZGlkYXRlc1xuXHRcdHRyYWNlKCdhc2tpbmcgZWRpdG9yIHRvIHJlLWxheW91dCcpO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl90cmFjZSgnaW52b2tlZCBfaGlkZScpO1xuXHRcdHRoaXMuX3Zpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl92aXNpYmxlQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VG9wRm9yUG9zaXRpb24oKTogbnVtYmVyIHtcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5fZWRpdG9yLmdldFZpc2libGVSYW5nZXMoKTtcblx0XHRsZXQgZmlyc3RMaW5lSW5WaWV3cG9ydDogbnVtYmVyO1xuXHRcdGlmICh2aXNpYmxlUmFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZpcnN0TGluZUluVmlld3BvcnQgPSB2aXNpYmxlUmFuZ2VzWzBdLnN0YXJ0TGluZU51bWJlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdSZW5hbWVXaWRnZXQjX2dldFRvcEZvclBvc2l0aW9uOiB0aGlzIHNob3VsZCBub3QgaGFwcGVuIC0gdmlzaWJsZVJhbmdlcyBpcyBlbXB0eScpO1xuXHRcdFx0Zmlyc3RMaW5lSW5WaWV3cG9ydCA9IE1hdGgubWF4KDEsIHRoaXMuX3Bvc2l0aW9uIS5saW5lTnVtYmVyIC0gNSk7IC8vIEB1bHVnYmVrbmE6IGZhbGxiYWNrIHRvIGN1cnJlbnQgbGluZSBtaW51cyA1XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcih0aGlzLl9wb3NpdGlvbiEubGluZU51bWJlcikgLSB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihmaXJzdExpbmVJblZpZXdwb3J0KTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYWNlKC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1JlbmFtZVdpZGdldCcsIC4uLmFyZ3MpO1xuXHR9XG59XG5cbmNsYXNzIFJlbmFtZUNhbmRpZGF0ZUxpc3RWaWV3IHtcblxuXHQvKiogUGFyZW50IG5vZGUgb2YgdGhlIGxpc3Qgd2lkZ2V0OyBuZWVkZWQgdG8gY29udHJvbCAjIG9mIGxpc3QgZWxlbWVudHMgdmlzaWJsZSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0Q29udGFpbmVyOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdFdpZGdldDogTGlzdDxOZXdTeW1ib2xOYW1lPjtcblxuXHRwcml2YXRlIF9saW5lSGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgX2F2YWlsYWJsZUhlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIF9taW5pbXVtV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHQvLyBGSVhNRUB1bHVnYmVrbmE6IHJld3JpdGUgdXNpbmcgZXZlbnQgZW1pdHRlcnNcblx0Y29uc3RydWN0b3IocGFyZW50OiBIVE1MRWxlbWVudCwgb3B0czogeyBmb250SW5mbzogRm9udEluZm87IG9uRm9jdXNDaGFuZ2U6IChuZXdTeW1ib2xOYW1lOiBzdHJpbmcpID0+IHZvaWQ7IG9uU2VsZWN0aW9uQ2hhbmdlOiAoKSA9PiB2b2lkIH0pIHtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5fYXZhaWxhYmxlSGVpZ2h0ID0gMDtcblx0XHR0aGlzLl9taW5pbXVtV2lkdGggPSAwO1xuXG5cdFx0dGhpcy5fbGluZUhlaWdodCA9IG9wdHMuZm9udEluZm8ubGluZUhlaWdodDtcblx0XHR0aGlzLl90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSBvcHRzLmZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblxuXHRcdHRoaXMuX2xpc3RDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9saXN0Q29udGFpbmVyLmNsYXNzTmFtZSA9ICdyZW5hbWUtYm94IHJlbmFtZS1jYW5kaWRhdGUtbGlzdC1jb250YWluZXInO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLl9saXN0Q29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2xpc3RXaWRnZXQgPSBSZW5hbWVDYW5kaWRhdGVMaXN0Vmlldy5fY3JlYXRlTGlzdFdpZGdldCh0aGlzLl9saXN0Q29udGFpbmVyLCB0aGlzLl9jYW5kaWRhdGVWaWV3SGVpZ2h0LCBvcHRzLmZvbnRJbmZvKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9saXN0V2lkZ2V0Lm9uRGlkQ2hhbmdlRm9jdXMoXG5cdFx0XHRlID0+IHtcblx0XHRcdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0b3B0cy5vbkZvY3VzQ2hhbmdlKGUuZWxlbWVudHNbMF0ubmV3U3ltYm9sTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlc1xuXHRcdCkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xpc3RXaWRnZXQub25EaWRDaGFuZ2VTZWxlY3Rpb24oXG5cdFx0XHRlID0+IHtcblx0XHRcdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0b3B0cy5vblNlbGVjdGlvbkNoYW5nZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXNcblx0XHQpKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcblx0XHRcdHRoaXMuX2xpc3RXaWRnZXQub25EaWRCbHVyKGUgPT4geyAvLyBAdWx1Z2Jla25hOiBiZWNhdXNlIGxpc3Qgd2lkZ2V0IG90aGVyd2lzZSByZW1lbWJlcnMgbGFzdCBmb2N1c2VkIGVsZW1lbnQgYW5kIHJldHVybnMgaXQgYXMgZm9jdXNlZCBlbGVtZW50XG5cdFx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuc2V0Rm9jdXMoW10pO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5fbGlzdFdpZGdldC5zdHlsZShnZXRMaXN0U3R5bGVzKHtcblx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzRm9yZWdyb3VuZDogcXVpY2tJbnB1dExpc3RGb2N1c0ZvcmVncm91bmQsXG5cdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IHF1aWNrSW5wdXRMaXN0Rm9jdXNCYWNrZ3JvdW5kLFxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fbGlzdFdpZGdldC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8gaGVpZ2h0IC0gbWF4IGhlaWdodCBhbGxvd2VkIGJ5IHBhcmVudCBlbGVtZW50XG5cdHB1YmxpYyBsYXlvdXQoeyBoZWlnaHQsIHdpZHRoIH06IHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX2F2YWlsYWJsZUhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLl9taW5pbXVtV2lkdGggPSB3aWR0aDtcblx0fVxuXG5cdHB1YmxpYyBzZXRDYW5kaWRhdGVzKGNhbmRpZGF0ZXM6IE5ld1N5bWJvbE5hbWVbXSk6IHZvaWQge1xuXG5cdFx0Ly8gaW5zZXJ0IGNhbmRpZGF0ZXMgaW50byBsaXN0IHdpZGdldFxuXHRcdHRoaXMuX2xpc3RXaWRnZXQuc3BsaWNlKDAsIDAsIGNhbmRpZGF0ZXMpO1xuXG5cdFx0Ly8gYWRqdXN0IGxpc3Qgd2lkZ2V0IGxheW91dFxuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuX3BpY2tMaXN0SGVpZ2h0KHRoaXMuX2xpc3RXaWRnZXQubGVuZ3RoKTtcblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX3BpY2tMaXN0V2lkdGgoY2FuZGlkYXRlcyk7XG5cblx0XHR0aGlzLl9saXN0V2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblxuXHRcdC8vIGFkanVzdCBsaXN0IGNvbnRhaW5lciBsYXlvdXRcblx0XHR0aGlzLl9saXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0dGhpcy5fbGlzdENvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblxuXHRcdGFyaWEuc3RhdHVzKG5scy5sb2NhbGl6ZSgncmVuYW1lU3VnZ2VzdGlvbnNSZWNlaXZlZEFyaWEnLCBcIlJlY2VpdmVkIHswfSByZW5hbWUgc3VnZ2VzdGlvbnNcIiwgY2FuZGlkYXRlcy5sZW5ndGgpKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhckNhbmRpZGF0ZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMHB4Jztcblx0XHR0aGlzLl9saXN0Q29udGFpbmVyLnN0eWxlLndpZHRoID0gJzBweCc7XG5cdFx0dGhpcy5fbGlzdFdpZGdldC5zcGxpY2UoMCwgdGhpcy5fbGlzdFdpZGdldC5sZW5ndGgsIFtdKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbkNhbmRpZGF0ZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpc3RXaWRnZXQubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldCBmb2N1c2VkQ2FuZGlkYXRlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2xpc3RXaWRnZXQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGVkRWxlbWVudCA9IHRoaXMuX2xpc3RXaWRnZXQuZ2V0U2VsZWN0ZWRFbGVtZW50cygpWzBdO1xuXHRcdGlmIChzZWxlY3RlZEVsZW1lbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGVkRWxlbWVudC5uZXdTeW1ib2xOYW1lO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHRoaXMuX2xpc3RXaWRnZXQuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF07XG5cdFx0aWYgKGZvY3VzZWRFbGVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmb2N1c2VkRWxlbWVudC5uZXdTeW1ib2xOYW1lO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNOZXh0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9saXN0V2lkZ2V0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c2VkSXhzID0gdGhpcy5fbGlzdFdpZGdldC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1c2VkSXhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbGlzdFdpZGdldC5mb2N1c0ZpcnN0KCk7XG5cdFx0XHR0aGlzLl9saXN0V2lkZ2V0LnJldmVhbCgwKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZm9jdXNlZEl4c1swXSA9PT0gdGhpcy5fbGlzdFdpZGdldC5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuc2V0Rm9jdXMoW10pO1xuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LnJldmVhbCgwKTsgLy8gQHVsdWdiZWtuYTogd2l0aG91dCB0aGlzLCBpdCBzZWVtcyBsaWtlIGZvY3VzZWQgZWxlbWVudCBpcyBvYnN0cnVjdGVkXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuZm9jdXNOZXh0KCk7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0V2lkZ2V0LmdldEZvY3VzKClbMF07XG5cdFx0XHRcdHRoaXMuX2xpc3RXaWRnZXQucmV2ZWFsKGZvY3VzZWQpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgdHJ1ZSBpZiBmb2N1cyBpcyBtb3ZlZCB0byBwcmV2aW91cyBlbGVtZW50XG5cdCAqL1xuXHRwdWJsaWMgZm9jdXNQcmV2aW91cygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbGlzdFdpZGdldC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNlZEl4cyA9IHRoaXMuX2xpc3RXaWRnZXQuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZEl4cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuZm9jdXNMYXN0KCk7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdFdpZGdldC5nZXRGb2N1cygpWzBdO1xuXHRcdFx0dGhpcy5fbGlzdFdpZGdldC5yZXZlYWwoZm9jdXNlZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGZvY3VzZWRJeHNbMF0gPT09IDApIHtcblx0XHRcdFx0dGhpcy5fbGlzdFdpZGdldC5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RXaWRnZXQuZm9jdXNQcmV2aW91cygpO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdFdpZGdldC5nZXRGb2N1cygpWzBdO1xuXHRcdFx0XHR0aGlzLl9saXN0V2lkZ2V0LnJldmVhbChmb2N1c2VkKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFyRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdFdpZGdldC5zZXRGb2N1cyhbXSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfY2FuZGlkYXRlVmlld0hlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHsgdG90YWxIZWlnaHQgfSA9IFJlbmFtZUNhbmRpZGF0ZVZpZXcuZ2V0TGF5b3V0SW5mbyh7IGxpbmVIZWlnaHQ6IHRoaXMuX2xpbmVIZWlnaHQgfSk7XG5cdFx0cmV0dXJuIHRvdGFsSGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGlja0xpc3RIZWlnaHQobkNhbmRpZGF0ZXM6IG51bWJlcikge1xuXHRcdGNvbnN0IGhlaWdodFRvRml0QWxsQ2FuZGlkYXRlcyA9IHRoaXMuX2NhbmRpZGF0ZVZpZXdIZWlnaHQgKiBuQ2FuZGlkYXRlcztcblx0XHRjb25zdCBNQVhfTl9DQU5ESURBVEVTID0gNzsgIC8vIEB1bHVnYmVrbmE6IG1heCAjIG9mIGNhbmRpZGF0ZXMgd2Ugd2FudCB0byBzaG93IGF0IG9uY2Vcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbihoZWlnaHRUb0ZpdEFsbENhbmRpZGF0ZXMsIHRoaXMuX2F2YWlsYWJsZUhlaWdodCwgdGhpcy5fY2FuZGlkYXRlVmlld0hlaWdodCAqIE1BWF9OX0NBTkRJREFURVMpO1xuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9waWNrTGlzdFdpZHRoKGNhbmRpZGF0ZXM6IE5ld1N5bWJvbE5hbWVbXSk6IG51bWJlciB7XG5cdFx0Y29uc3QgbG9uZ2VzdENhbmRpZGF0ZVdpZHRoID0gTWF0aC5jZWlsKE1hdGgubWF4KC4uLmNhbmRpZGF0ZXMubWFwKGMgPT4gYy5uZXdTeW1ib2xOYW1lLmxlbmd0aCkpICogdGhpcy5fdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHRjb25zdCB3aWR0aCA9IE1hdGgubWF4KFxuXHRcdFx0dGhpcy5fbWluaW11bVdpZHRoLFxuXHRcdFx0NCAvKiBwYWRkaW5nICovICsgMTYgLyogc3BhcmtsZSBpY29uICovICsgNSAvKiBtYXJnaW4tbGVmdCAqLyArIGxvbmdlc3RDYW5kaWRhdGVXaWR0aCArIDEwIC8qIChwb3NzaWJseSB2aXNpYmxlKSBzY3JvbGxiYXIgd2lkdGggKi8gLy8gVE9ET0B1bHVnYmVrbmE6IGFwcHJveGltYXRlIGNhbGMgLSBjbGVhbiB0aGlzIHVwXG5cdFx0KTtcblx0XHRyZXR1cm4gd2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlTGlzdFdpZGdldChjb250YWluZXI6IEhUTUxFbGVtZW50LCBjYW5kaWRhdGVWaWV3SGVpZ2h0OiBudW1iZXIsIGZvbnRJbmZvOiBGb250SW5mbykge1xuXHRcdGNvbnN0IHZpcnR1YWxEZWxlZ2F0ZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPE5ld1N5bWJvbE5hbWU+IHtcblx0XHRcdGdldFRlbXBsYXRlSWQoZWxlbWVudDogTmV3U3ltYm9sTmFtZSk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiAnY2FuZGlkYXRlJztcblx0XHRcdH1cblxuXHRcdFx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IE5ld1N5bWJvbE5hbWUpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlVmlld0hlaWdodDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPE5ld1N5bWJvbE5hbWUsIFJlbmFtZUNhbmRpZGF0ZVZpZXc+IHtcblx0XHRcdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnY2FuZGlkYXRlJztcblxuXHRcdFx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFJlbmFtZUNhbmRpZGF0ZVZpZXcge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlbmFtZUNhbmRpZGF0ZVZpZXcoY29udGFpbmVyLCBmb250SW5mbyk7XG5cdFx0XHR9XG5cblx0XHRcdHJlbmRlckVsZW1lbnQoY2FuZGlkYXRlOiBOZXdTeW1ib2xOYW1lLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IFJlbmFtZUNhbmRpZGF0ZVZpZXcpOiB2b2lkIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnBvcHVsYXRlKGNhbmRpZGF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IFJlbmFtZUNhbmRpZGF0ZVZpZXcpOiB2b2lkIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIG5ldyBMaXN0KFxuXHRcdFx0J05ld1N5bWJvbE5hbWVDYW5kaWRhdGVzJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHZpcnR1YWxEZWxlZ2F0ZSxcblx0XHRcdFtyZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsIC8vIEB1bHVnYmVrbmE6IGJlY2F1c2Ugd2UgaGFuZGxlIGtleWJvYXJkIGV2ZW50cyB0aHJvdWdoIHByb3BlciBjb21tYW5kcyAmIGtleWJpbmRpbmcgc2VydmljZSwgc2VlIGByZW5hbWUudHNgXG5cdFx0XHRcdG1vdXNlU3VwcG9ydDogdHJ1ZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG5cbmNsYXNzIElucHV0V2l0aEJ1dHRvbiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9idXR0b25TdGF0ZTogJ3NwYXJrbGUnIHwgJ3N0b3AnIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2RvbU5vZGU6IEhUTUxEaXZFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbnB1dE5vZGU6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2J1dHRvbk5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9idXR0b25Ib3ZlckNvbnRlbnQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIF9idXR0b25HZW5Ib3ZlclRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYnV0dG9uQ2FuY2VsSG92ZXJUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NwYXJrbGVJY29uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RvcEljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5wdXRDaGFuZ2UgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZElucHV0Q2hhbmdlID0gdGhpcy5fb25EaWRJbnB1dENoYW5nZS5ldmVudDtcblxuXHRnZXQgZG9tTm9kZSgpIHtcblx0XHRpZiAoIXRoaXMuX2RvbU5vZGUpIHtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc05hbWUgPSAncmVuYW1lLWlucHV0LXdpdGgtYnV0dG9uJztcblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdyb3cnO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XG5cblx0XHRcdHRoaXMuX2lucHV0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG5cdFx0XHR0aGlzLl9pbnB1dE5vZGUuY2xhc3NOYW1lID0gJ3JlbmFtZS1pbnB1dCc7XG5cdFx0XHR0aGlzLl9pbnB1dE5vZGUudHlwZSA9ICd0ZXh0Jztcblx0XHRcdHRoaXMuX2lucHV0Tm9kZS5zdHlsZS5ib3JkZXIgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9pbnB1dE5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbmxzLmxvY2FsaXplKCdyZW5hbWVBcmlhTGFiZWwnLCBcIlJlbmFtZSBpbnB1dC4gVHlwZSBuZXcgbmFtZSBhbmQgcHJlc3MgRW50ZXIgdG8gY29tbWl0LlwiKSk7XG5cblx0XHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faW5wdXROb2RlKTtcblxuXHRcdFx0dGhpcy5fYnV0dG9uTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fYnV0dG9uTm9kZS5jbGFzc05hbWUgPSAncmVuYW1lLXN1Z2dlc3Rpb25zLWJ1dHRvbic7XG5cdFx0XHR0aGlzLl9idXR0b25Ob2RlLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXG5cdFx0XHR0aGlzLl9idXR0b25HZW5Ib3ZlclRleHQgPSBubHMubG9jYWxpemUoJ2dlbmVyYXRlUmVuYW1lU3VnZ2VzdGlvbnNCdXR0b24nLCBcIkdlbmVyYXRlIE5ldyBOYW1lIFN1Z2dlc3Rpb25zXCIpO1xuXHRcdFx0dGhpcy5fYnV0dG9uQ2FuY2VsSG92ZXJUZXh0ID0gbmxzLmxvY2FsaXplKCdjYW5jZWxSZW5hbWVTdWdnZXN0aW9uc0J1dHRvbicsIFwiQ2FuY2VsXCIpO1xuXHRcdFx0dGhpcy5fYnV0dG9uSG92ZXJDb250ZW50ID0gdGhpcy5fYnV0dG9uR2VuSG92ZXJUZXh0O1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLl9idXR0b25Ob2RlLCAoKSA9PiAoe1xuXHRcdFx0XHRjb250ZW50OiB0aGlzLl9idXR0b25Ib3ZlckNvbnRlbnQsXG5cdFx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHR9KSkpO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2J1dHRvbk5vZGUpO1xuXG5cdFx0XHQvLyBub3RpZnkgaWYgc2VsZWN0aW9uIGNoYW5nZXMgdG8gY2FuY2VsIHJlcXVlc3QgdG8gcmVuYW1lLXN1Z2dlc3Rpb24gcHJvdmlkZXJzXG5cblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuaW5wdXQsIGRvbS5FdmVudFR5cGUuSU5QVVQsICgpID0+IHRoaXMuX29uRGlkSW5wdXRDaGFuZ2UuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmlucHV0LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXlFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChrZXlFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkxlZnRBcnJvdyB8fCBrZXlFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3cpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZElucHV0Q2hhbmdlLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbnB1dCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5fb25EaWRJbnB1dENoYW5nZS5maXJlKCkpKTtcblxuXHRcdFx0Ly8gZm9jdXMgXCJjb250YWluZXJcIiBib3JkZXIgaW5zdGVhZCBvZiBpbnB1dCBib3hcblxuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbnB1dCwgZG9tLkV2ZW50VHlwZS5GT0NVUywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUub3V0bGluZVdpZHRoID0gJzFweCc7XG5cdFx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5vdXRsaW5lU3R5bGUgPSAnc29saWQnO1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUub3V0bGluZU9mZnNldCA9ICctMXB4Jztcblx0XHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm91dGxpbmVDb2xvciA9ICd2YXIoLS12c2NvZGUtZm9jdXNCb3JkZXIpJztcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuaW5wdXQsIGRvbS5FdmVudFR5cGUuQkxVUiwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUub3V0bGluZSA9ICdub25lJztcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRnZXQgaW5wdXQoKSB7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl9pbnB1dE5vZGUpO1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dE5vZGU7XG5cdH1cblxuXHRnZXQgYnV0dG9uKCkge1xuXHRcdGFzc2VydFR5cGUodGhpcy5fYnV0dG9uTm9kZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvbk5vZGU7XG5cdH1cblxuXHRnZXQgYnV0dG9uU3RhdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvblN0YXRlO1xuXHR9XG5cblx0c2V0U3BhcmtsZUJ1dHRvbigpIHtcblx0XHR0aGlzLl9idXR0b25TdGF0ZSA9ICdzcGFya2xlJztcblx0XHR0aGlzLl9zcGFya2xlSWNvbiA/Pz0gcmVuZGVySWNvbihDb2RpY29uLnNwYXJrbGUpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5idXR0b24pO1xuXHRcdHRoaXMuYnV0dG9uLmFwcGVuZENoaWxkKHRoaXMuX3NwYXJrbGVJY29uKTtcblx0XHR0aGlzLmJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnR2VuZXJhdGluZyBuZXcgbmFtZSBzdWdnZXN0aW9ucycpO1xuXHRcdHRoaXMuX2J1dHRvbkhvdmVyQ29udGVudCA9IHRoaXMuX2J1dHRvbkdlbkhvdmVyVGV4dCE7XG5cdFx0dGhpcy5pbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0c2V0U3RvcEJ1dHRvbigpIHtcblx0XHR0aGlzLl9idXR0b25TdGF0ZSA9ICdzdG9wJztcblx0XHR0aGlzLl9zdG9wSWNvbiA/Pz0gcmVuZGVySWNvbihDb2RpY29uLnN0b3BDaXJjbGUpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5idXR0b24pO1xuXHRcdHRoaXMuYnV0dG9uLmFwcGVuZENoaWxkKHRoaXMuX3N0b3BJY29uKTtcblx0XHR0aGlzLmJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnQ2FuY2VsIGdlbmVyYXRpbmcgbmV3IG5hbWUgc3VnZ2VzdGlvbnMnKTtcblx0XHR0aGlzLl9idXR0b25Ib3ZlckNvbnRlbnQgPSB0aGlzLl9idXR0b25DYW5jZWxIb3ZlclRleHQhO1xuXHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFJlbmFtZUNhbmRpZGF0ZVZpZXcge1xuXG5cdHByaXZhdGUgc3RhdGljIF9QQURESU5HOiBudW1iZXIgPSAyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQsIGZvbnRJbmZvOiBGb250SW5mbykge1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ3JlbmFtZS1ib3ggcmVuYW1lLWNhbmRpZGF0ZSc7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gYGZsZXhgO1xuXHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUuY29sdW1uR2FwID0gYDVweGA7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5hbGlnbkl0ZW1zID0gYGNlbnRlcmA7XG5cdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtmb250SW5mby5saW5lSGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLnBhZGRpbmcgPSBgJHtSZW5hbWVDYW5kaWRhdGVWaWV3Ll9QQURESU5HfXB4YDtcblxuXHRcdC8vIEB1bHVnYmVrbmE6IG5lZWRlZCB0byBrZWVwIHNwYWNlIHdoZW4gdGhlIGBpY29uLnN0eWxlLmRpc3BsYXlgIGlzIHNldCB0byBgbm9uZWBcblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0aWNvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gYGZsZXhgO1xuXHRcdGljb25Db250YWluZXIuc3R5bGUuYWxpZ25JdGVtcyA9IGBjZW50ZXJgO1xuXHRcdGljb25Db250YWluZXIuc3R5bGUud2lkdGggPSBpY29uQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2ZvbnRJbmZvLmxpbmVIZWlnaHQgKiAwLjh9cHhgO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQoaWNvbkNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9pY29uID0gcmVuZGVySWNvbihDb2RpY29uLnNwYXJrbGUpO1xuXHRcdHRoaXMuX2ljb24uc3R5bGUuZGlzcGxheSA9IGBub25lYDtcblx0XHRpY29uQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2ljb24pO1xuXG5cdFx0dGhpcy5fbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb21Gb250SW5mby5hcHBseUZvbnRJbmZvKHRoaXMuX2xhYmVsLCBmb250SW5mbyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9sYWJlbCk7XG5cblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5fZG9tTm9kZSk7XG5cdH1cblxuXHRwdWJsaWMgcG9wdWxhdGUodmFsdWU6IE5ld1N5bWJvbE5hbWUpIHtcblx0XHR0aGlzLl91cGRhdGVJY29uKHZhbHVlKTtcblx0XHR0aGlzLl91cGRhdGVMYWJlbCh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJY29uKHZhbHVlOiBOZXdTeW1ib2xOYW1lKSB7XG5cdFx0Y29uc3QgaXNBSUdlbmVyYXRlZCA9ICEhdmFsdWUudGFncz8uaW5jbHVkZXMoTmV3U3ltYm9sTmFtZVRhZy5BSUdlbmVyYXRlZCk7XG5cdFx0dGhpcy5faWNvbi5zdHlsZS5kaXNwbGF5ID0gaXNBSUdlbmVyYXRlZCA/ICdpbmhlcml0JyA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxhYmVsKHZhbHVlOiBOZXdTeW1ib2xOYW1lKSB7XG5cdFx0dGhpcy5fbGFiZWwuaW5uZXJUZXh0ID0gdmFsdWUubmV3U3ltYm9sTmFtZTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0TGF5b3V0SW5mbyh7IGxpbmVIZWlnaHQgfTogeyBsaW5lSGVpZ2h0OiBudW1iZXIgfSk6IHsgdG90YWxIZWlnaHQ6IG51bWJlciB9IHtcblx0XHRjb25zdCB0b3RhbEhlaWdodCA9IGxpbmVIZWlnaHQgKyBSZW5hbWVDYW5kaWRhdGVWaWV3Ll9QQURESU5HICogMiAvKiB0b3AgJiBib3R0b20gcGFkZGluZyAqLztcblx0XHRyZXR1cm4geyB0b3RhbEhlaWdodCB9O1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKSB7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFlBQVksVUFBVTtBQUN0QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLFlBQVk7QUFDckIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsaUJBQWlCLHdCQUF3QjtBQUNsRCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQzNELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsWUFBWSxpQkFBaUI7QUFDdEMsT0FBTztBQUNQLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsdUNBQTRGO0FBQ3JHLFNBQVMsb0JBQW9CO0FBRzdCLFNB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
