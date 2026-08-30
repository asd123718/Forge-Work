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
import * as DOM from "../../../../../../base/browser/dom.js";
import { alert as alertFn } from "../../../../../../base/browser/ui/aria/aria.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import * as strings from "../../../../../../base/common/strings.js";
import { MATCHES_LIMIT, CONTEXT_FIND_WIDGET_VISIBLE } from "../../../../../../editor/contrib/find/browser/findModel.js";
import { FindReplaceState } from "../../../../../../editor/contrib/find/browser/findState.js";
import { NLS_MATCHES_LOCATION, NLS_NO_RESULTS } from "../../../../../../editor/contrib/find/browser/findWidget.js";
import { FindWidgetSearchHistory } from "../../../../../../editor/contrib/find/browser/findWidgetSearchHistory.js";
import { ReplaceWidgetHistory } from "../../../../../../editor/contrib/find/browser/replaceWidgetHistory.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { FindModel } from "./findModel.js";
import { SimpleFindReplaceWidget } from "./notebookFindReplaceWidget.js";
import { CellEditState } from "../../notebookBrowser.js";
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED } from "../../../common/notebookContextKeys.js";
const FIND_HIDE_TRANSITION = "find-hide-transition";
const FIND_SHOW_TRANSITION = "find-show-transition";
let MAX_MATCHES_COUNT_WIDTH = 69;
const PROGRESS_BAR_DELAY = 200;
let NotebookFindContrib = class extends Disposable {
  constructor(notebookEditor, instantiationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.instantiationService = instantiationService;
    this._widget = new Lazy(() => this._register(this.instantiationService.createInstance(NotebookFindWidget, this.notebookEditor)));
  }
  get widget() {
    return this._widget.value;
  }
  show(initialInput, options) {
    return this._widget.value.show(initialInput, options);
  }
  hide() {
    this._widget.rawValue?.hide();
  }
  replace(searchString) {
    return this._widget.value.replace(searchString);
  }
  isVisible() {
    return this._widget.rawValue?.isVisible ?? false;
  }
  findNext() {
    if (this._widget.rawValue) {
      this._widget.value.findNext();
    }
  }
  findPrevious() {
    if (this._widget.rawValue) {
      this._widget.value.findPrevious();
    }
  }
};
NotebookFindContrib.id = "workbench.notebook.find";
NotebookFindContrib = __decorateClass([
  __decorateParam(1, IInstantiationService)
], NotebookFindContrib);
let NotebookFindWidget = class extends SimpleFindReplaceWidget {
  constructor(_notebookEditor, contextViewService, contextKeyService, configurationService, contextMenuService, hoverService, instantiationService, storageService) {
    const findSearchHistory = FindWidgetSearchHistory.getOrCreate(storageService);
    const replaceHistory = ReplaceWidgetHistory.getOrCreate(storageService);
    super(contextViewService, contextKeyService, configurationService, contextMenuService, instantiationService, hoverService, new FindReplaceState(), _notebookEditor, findSearchHistory, replaceHistory);
    this._isFocused = false;
    this._showTimeout = null;
    this._hideTimeout = null;
    this._findModel = new FindModel(this._notebookEditor, this._state, this._configurationService);
    DOM.append(this._notebookEditor.getDomNode(), this.getDomNode());
    this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
    this._findWidgetVisible = CONTEXT_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
    this._register(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
    this._register(this._replaceInput.onKeyDown((e) => this._onReplaceInputKeyDown(e)));
    this._register(this._state.onFindReplaceStateChange((e) => {
      this.onInputChanged();
      if (e.isSearching) {
        if (this._state.isSearching) {
          this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
        } else {
          this._progressBar.stop().hide();
        }
      }
      if (this._findModel.currentMatch >= 0) {
        const currentMatch = this._findModel.getCurrentMatch();
        this._replaceBtn.setEnabled(currentMatch.isModelMatch);
      }
      const matches = this._findModel.findMatches;
      this._replaceAllBtn.setEnabled(matches.length > 0 && matches.find((match) => match.webviewMatches.length > 0) === void 0);
      if (e.filters) {
        this._findInput.updateFilterState(this._state.filters?.isModified() ?? false);
      }
    }));
    this._register(DOM.addDisposableListener(this.getDomNode(), DOM.EventType.FOCUS, (e) => {
      this._previousFocusElement = DOM.isHTMLElement(e.relatedTarget) ? e.relatedTarget : void 0;
    }, true));
  }
  get findModel() {
    return this._findModel;
  }
  get isFocused() {
    return this._isFocused;
  }
  _onFindInputKeyDown(e) {
    if (e.equals(KeyCode.Enter)) {
      this.find(false);
      e.preventDefault();
      return;
    } else if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
      this.find(true);
      e.preventDefault();
      return;
    }
  }
  _onReplaceInputKeyDown(e) {
    if (e.equals(KeyCode.Enter)) {
      this.replaceOne();
      e.preventDefault();
      return;
    }
  }
  onInputChanged() {
    this._state.change({ searchString: this.inputValue }, false);
    const findMatches = this._findModel.findMatches;
    if (findMatches && findMatches.length) {
      return true;
    }
    return false;
  }
  findIndex(index) {
    this._findModel.find({ index });
  }
  find(previous) {
    this._findModel.find({ previous });
  }
  findNext() {
    this.find(false);
  }
  findPrevious() {
    this.find(true);
  }
  replaceOne() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    if (!this._findModel.findMatches.length) {
      return;
    }
    this._findModel.ensureFindMatches();
    if (this._findModel.currentMatch < 0) {
      this._findModel.find({ previous: false });
    }
    const currentMatch = this._findModel.getCurrentMatch();
    const cell = currentMatch.cell;
    if (currentMatch.isModelMatch) {
      const match = currentMatch.match;
      this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
      const replacePattern = this.replacePattern;
      const replaceString = replacePattern.buildReplaceString(match.matches, this._state.preserveCase);
      const viewModel = this._notebookEditor.getViewModel();
      viewModel.replaceOne(cell, match.range, replaceString).then(() => {
        this._progressBar.stop();
      });
    } else {
      console.error("Replace does not work for output match");
    }
  }
  replaceAll() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
    const replacePattern = this.replacePattern;
    const cellFindMatches = this._findModel.findMatches;
    const replaceStrings = [];
    cellFindMatches.forEach((cellFindMatch) => {
      cellFindMatch.contentMatches.forEach((match) => {
        const matches = match.matches;
        replaceStrings.push(replacePattern.buildReplaceString(matches, this._state.preserveCase));
      });
    });
    const viewModel = this._notebookEditor.getViewModel();
    viewModel.replaceAll(this._findModel.findMatches, replaceStrings).then(() => {
      this._progressBar.stop();
    });
  }
  findFirst() {
  }
  onFocusTrackerFocus() {
    this._findWidgetFocused.set(true);
    this._isFocused = true;
  }
  onFocusTrackerBlur() {
    this._previousFocusElement = void 0;
    this._findWidgetFocused.reset();
    this._isFocused = false;
  }
  onReplaceInputFocusTrackerFocus() {
  }
  onReplaceInputFocusTrackerBlur() {
  }
  onFindInputFocusTrackerFocus() {
  }
  onFindInputFocusTrackerBlur() {
  }
  async show(initialInput, options) {
    const searchStringUpdate = this._state.searchString !== initialInput;
    super.show(initialInput, options);
    this._state.change({ searchString: initialInput ?? this._state.searchString, isRevealed: true }, false);
    this._findWidgetVisible.set(true);
    if (typeof options?.matchIndex === "number") {
      if (!this._findModel.findMatches.length) {
        await this._findModel.research();
      }
      this.findIndex(options.matchIndex);
    } else if (options?.focus !== false) {
      this._findInput.select();
    }
    if (!searchStringUpdate && options?.searchStringSeededFrom) {
      this._findModel.refreshCurrentMatch(options.searchStringSeededFrom);
    }
    if (this._showTimeout === null) {
      if (this._hideTimeout !== null) {
        DOM.getWindow(this.getDomNode()).clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
        this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
      }
      this._notebookEditor.addClassName(FIND_SHOW_TRANSITION);
      this._showTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
        this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
        this._showTimeout = null;
      }, 200);
    } else {
    }
  }
  replace(initialFindInput, initialReplaceInput) {
    super.showWithReplace(initialFindInput, initialReplaceInput);
    this._state.change({ searchString: initialFindInput ?? "", replaceString: initialReplaceInput ?? "", isRevealed: true }, false);
    this._replaceInput.select();
    if (this._showTimeout === null) {
      if (this._hideTimeout !== null) {
        DOM.getWindow(this.getDomNode()).clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
        this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
      }
      this._notebookEditor.addClassName(FIND_SHOW_TRANSITION);
      this._showTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
        this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
        this._showTimeout = null;
      }, 200);
    } else {
    }
  }
  hide() {
    super.hide();
    this._state.change({ isRevealed: false }, false);
    this._findWidgetVisible.set(false);
    this._findModel.clear();
    this._notebookEditor.findStop();
    this._progressBar.stop();
    if (this._hideTimeout === null) {
      if (this._showTimeout !== null) {
        DOM.getWindow(this.getDomNode()).clearTimeout(this._showTimeout);
        this._showTimeout = null;
        this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
      }
      this._notebookEditor.addClassName(FIND_HIDE_TRANSITION);
      this._hideTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
        this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
      }, 200);
    } else {
    }
    if (this._previousFocusElement && this._previousFocusElement.offsetParent) {
      this._previousFocusElement.focus();
      this._previousFocusElement = void 0;
    }
    if (this._notebookEditor.hasModel()) {
      for (let i = 0; i < this._notebookEditor.getLength(); i++) {
        const cell = this._notebookEditor.cellAt(i);
        if (cell.getEditState() === CellEditState.Editing && cell.editStateSource === "find") {
          cell.updateEditState(CellEditState.Preview, "closeFind");
        }
      }
    }
  }
  _updateMatchesCount() {
    if (!this._findModel || !this._findModel.findMatches) {
      return;
    }
    this._matchesCount.style.minWidth = MAX_MATCHES_COUNT_WIDTH + "px";
    this._matchesCount.title = "";
    this._matchesCount.firstChild?.remove();
    let label;
    if (this._state.matchesCount > 0) {
      let matchesCount = String(this._state.matchesCount);
      if (this._state.matchesCount >= MATCHES_LIMIT) {
        matchesCount += "+";
      }
      const matchesPosition = this._findModel.currentMatch < 0 ? "?" : String(this._findModel.currentMatch + 1);
      label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
    } else {
      label = NLS_NO_RESULTS;
    }
    this._matchesCount.appendChild(document.createTextNode(label));
    alertFn(this._getAriaLabel(label, this._state.currentMatch, this._state.searchString));
    MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.clientWidth);
  }
  _getAriaLabel(label, currentMatch, searchString) {
    if (label === NLS_NO_RESULTS) {
      return searchString === "" ? localize("ariaSearchNoResultEmpty", "{0} found", label) : localize("ariaSearchNoResult", "{0} found for '{1}'", label, searchString);
    }
    return localize("ariaSearchNoResultWithLineNumNoCurrentMatch", "{0} found for '{1}'", label, searchString);
  }
  dispose() {
    this._notebookEditor?.removeClassName(FIND_SHOW_TRANSITION);
    this._notebookEditor?.removeClassName(FIND_HIDE_TRANSITION);
    this._findModel.dispose();
    super.dispose();
  }
};
NotebookFindWidget = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IStorageService)
], NotebookFindWidget);
export {
  NotebookFindContrib
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxmaW5kXFxub3RlYm9va0ZpbmRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IGFsZXJ0IGFzIGFsZXJ0Rm4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTUFUQ0hFU19MSU1JVCwgQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRNb2RlbC5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBOTFNfTUFUQ0hFU19MT0NBVElPTiwgTkxTX05PX1JFU1VMVFMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBSZXBsYWNlV2lkZ2V0SGlzdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9yZXBsYWNlV2lkZ2V0SGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0ZpbmRGaWx0ZXJzIH0gZnJvbSAnLi9maW5kRmlsdGVycy5qcyc7XG5pbXBvcnQgeyBGaW5kTW9kZWwgfSBmcm9tICcuL2ZpbmRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTaW1wbGVGaW5kUmVwbGFjZVdpZGdldCB9IGZyb20gJy4vbm90ZWJvb2tGaW5kUmVwbGFjZVdpZGdldC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFN0YXRlLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRmluZFNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IEtFWUJJTkRJTkdfQ09OVEVYVF9OT1RFQk9PS19GSU5EX1dJREdFVF9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuXG5jb25zdCBGSU5EX0hJREVfVFJBTlNJVElPTiA9ICdmaW5kLWhpZGUtdHJhbnNpdGlvbic7XG5jb25zdCBGSU5EX1NIT1dfVFJBTlNJVElPTiA9ICdmaW5kLXNob3ctdHJhbnNpdGlvbic7XG5sZXQgTUFYX01BVENIRVNfQ09VTlRfV0lEVEggPSA2OTtcbmNvbnN0IFBST0dSRVNTX0JBUl9ERUxBWSA9IDIwMDsgLy8gc2hvdyBwcm9ncmVzcyBmb3IgYXQgbGVhc3QgMjAwbXNcblxuZXhwb3J0IGludGVyZmFjZSBJU2hvd05vdGVib29rRmluZFdpZGdldE9wdGlvbnMge1xuXHRpc1JlZ2V4PzogYm9vbGVhbjtcblx0d2hvbGVXb3JkPzogYm9vbGVhbjtcblx0bWF0Y2hDYXNlPzogYm9vbGVhbjtcblx0bWF0Y2hJbmRleD86IG51bWJlcjtcblx0Zm9jdXM/OiBib29sZWFuO1xuXHRzZWFyY2hTdHJpbmdTZWVkZWRGcm9tPzogeyBjZWxsOiBJQ2VsbFZpZXdNb2RlbDsgcmFuZ2U6IFJhbmdlIH07XG5cdGZpbmRTY29wZT86IElOb3RlYm9va0ZpbmRTY29wZTtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rRmluZENvbnRyaWIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQ6IHN0cmluZyA9ICd3b3JrYmVuY2gubm90ZWJvb2suZmluZCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBMYXp5PE5vdGVib29rRmluZFdpZGdldD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0ID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0ZpbmRXaWRnZXQsIHRoaXMubm90ZWJvb2tFZGl0b3IpKSk7XG5cdH1cblxuXHRnZXQgd2lkZ2V0KCk6IE5vdGVib29rRmluZFdpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC52YWx1ZTtcblx0fVxuXG5cdHNob3coaW5pdGlhbElucHV0Pzogc3RyaW5nLCBvcHRpb25zPzogSVNob3dOb3RlYm9va0ZpbmRXaWRnZXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC52YWx1ZS5zaG93KGluaXRpYWxJbnB1dCwgb3B0aW9ucyk7XG5cdH1cblxuXHRoaWRlKCkge1xuXHRcdHRoaXMuX3dpZGdldC5yYXdWYWx1ZT8uaGlkZSgpO1xuXHR9XG5cblx0cmVwbGFjZShzZWFyY2hTdHJpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQudmFsdWUucmVwbGFjZShzZWFyY2hTdHJpbmcpO1xuXHR9XG5cblx0aXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQucmF3VmFsdWU/LmlzVmlzaWJsZSA/PyBmYWxzZTtcblx0fVxuXG5cdGZpbmROZXh0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93aWRnZXQucmF3VmFsdWUpIHtcblx0XHRcdHRoaXMuX3dpZGdldC52YWx1ZS5maW5kTmV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdGZpbmRQcmV2aW91cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0LnJhd1ZhbHVlKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudmFsdWUuZmluZFByZXZpb3VzKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rRmluZFdpZGdldCBleHRlbmRzIFNpbXBsZUZpbmRSZXBsYWNlV2lkZ2V0IGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHJvdGVjdGVkIF9maW5kV2lkZ2V0Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByb3RlY3RlZCBfZmluZFdpZGdldFZpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9pc0ZvY3VzZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2hvd1RpbWVvdXQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9oaWRlVGltZW91dDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3ByZXZpb3VzRm9jdXNFbGVtZW50PzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2ZpbmRNb2RlbDogRmluZE1vZGVsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgZmluZFNlYXJjaEhpc3RvcnkgPSBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5nZXRPckNyZWF0ZShzdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgcmVwbGFjZUhpc3RvcnkgPSBSZXBsYWNlV2lkZ2V0SGlzdG9yeS5nZXRPckNyZWF0ZShzdG9yYWdlU2VydmljZSk7XG5cblx0XHRzdXBlcihjb250ZXh0Vmlld1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBuZXcgRmluZFJlcGxhY2VTdGF0ZTxOb3RlYm9va0ZpbmRGaWx0ZXJzPigpLCBfbm90ZWJvb2tFZGl0b3IsIGZpbmRTZWFyY2hIaXN0b3J5LCByZXBsYWNlSGlzdG9yeSk7XG5cdFx0dGhpcy5fZmluZE1vZGVsID0gbmV3IEZpbmRNb2RlbCh0aGlzLl9ub3RlYm9va0VkaXRvciwgdGhpcy5fc3RhdGUsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdERPTS5hcHBlbmQodGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0RG9tTm9kZSgpLCB0aGlzLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fZmluZFdpZGdldEZvY3VzZWQgPSBLRVlCSU5ESU5HX0NPTlRFWFRfTk9URUJPT0tfRklORF9XSURHRVRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXRWaXNpYmxlID0gQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Lm9uS2V5RG93bigoZSkgPT4gdGhpcy5fb25GaW5kSW5wdXRLZXlEb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUlucHV0Lm9uS2V5RG93bigoZSkgPT4gdGhpcy5fb25SZXBsYWNlSW5wdXRLZXlEb3duKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoKGUpID0+IHtcblx0XHRcdHRoaXMub25JbnB1dENoYW5nZWQoKTtcblxuXHRcdFx0aWYgKGUuaXNTZWFyY2hpbmcpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlLmlzU2VhcmNoaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KFBST0dSRVNTX0JBUl9ERUxBWSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fZmluZE1vZGVsLmN1cnJlbnRNYXRjaCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRNYXRjaCA9IHRoaXMuX2ZpbmRNb2RlbC5nZXRDdXJyZW50TWF0Y2goKTtcblx0XHRcdFx0dGhpcy5fcmVwbGFjZUJ0bi5zZXRFbmFibGVkKGN1cnJlbnRNYXRjaC5pc01vZGVsTWF0Y2gpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5fZmluZE1vZGVsLmZpbmRNYXRjaGVzO1xuXHRcdFx0dGhpcy5fcmVwbGFjZUFsbEJ0bi5zZXRFbmFibGVkKG1hdGNoZXMubGVuZ3RoID4gMCAmJiBtYXRjaGVzLmZpbmQobWF0Y2ggPT4gbWF0Y2gud2Vidmlld01hdGNoZXMubGVuZ3RoID4gMCkgPT09IHVuZGVmaW5lZCk7XG5cblx0XHRcdGlmIChlLmZpbHRlcnMpIHtcblx0XHRcdFx0dGhpcy5fZmluZElucHV0LnVwZGF0ZUZpbHRlclN0YXRlKHRoaXMuX3N0YXRlLmZpbHRlcnM/LmlzTW9kaWZpZWQoKSA/PyBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmdldERvbU5vZGUoKSwgRE9NLkV2ZW50VHlwZS5GT0NVUywgZSA9PiB7XG5cdFx0XHR0aGlzLl9wcmV2aW91c0ZvY3VzRWxlbWVudCA9IERPTS5pc0hUTUxFbGVtZW50KGUucmVsYXRlZFRhcmdldCkgPyBlLnJlbGF0ZWRUYXJnZXQgOiB1bmRlZmluZWQ7XG5cdFx0fSwgdHJ1ZSkpO1xuXHR9XG5cblx0Z2V0IGZpbmRNb2RlbCgpOiBGaW5kTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9maW5kTW9kZWw7XG5cdH1cblxuXHRnZXQgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0ZvY3VzZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9vbkZpbmRJbnB1dEtleURvd24oZTogSUtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdHRoaXMuZmluZChmYWxzZSk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0dGhpcy5maW5kKHRydWUpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uUmVwbGFjZUlucHV0S2V5RG93bihlOiBJS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0dGhpcy5yZXBsYWNlT25lKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uSW5wdXRDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogdGhpcy5pbnB1dFZhbHVlIH0sIGZhbHNlKTtcblx0XHQvLyB0aGlzLl9maW5kTW9kZWwucmVzZWFyY2goKTtcblx0XHRjb25zdCBmaW5kTWF0Y2hlcyA9IHRoaXMuX2ZpbmRNb2RlbC5maW5kTWF0Y2hlcztcblx0XHRpZiAoZmluZE1hdGNoZXMgJiYgZmluZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRJbmRleChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZE1vZGVsLmZpbmQoeyBpbmRleCB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBmaW5kKHByZXZpb3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZE1vZGVsLmZpbmQoeyBwcmV2aW91cyB9KTtcblx0fVxuXG5cdHB1YmxpYyBmaW5kTmV4dCgpOiB2b2lkIHtcblx0XHR0aGlzLmZpbmQoZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGZpbmRQcmV2aW91cygpOiB2b2lkIHtcblx0XHR0aGlzLmZpbmQodHJ1ZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVwbGFjZU9uZSgpIHtcblx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2ZpbmRNb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9maW5kTW9kZWwuZW5zdXJlRmluZE1hdGNoZXMoKTtcblxuXHRcdGlmICh0aGlzLl9maW5kTW9kZWwuY3VycmVudE1hdGNoIDwgMCkge1xuXHRcdFx0dGhpcy5fZmluZE1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudE1hdGNoID0gdGhpcy5fZmluZE1vZGVsLmdldEN1cnJlbnRNYXRjaCgpO1xuXHRcdGNvbnN0IGNlbGwgPSBjdXJyZW50TWF0Y2guY2VsbDtcblx0XHRpZiAoY3VycmVudE1hdGNoLmlzTW9kZWxNYXRjaCkge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBjdXJyZW50TWF0Y2gubWF0Y2ggYXMgRmluZE1hdGNoO1xuXG5cdFx0XHR0aGlzLl9wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coUFJPR1JFU1NfQkFSX0RFTEFZKTtcblxuXHRcdFx0Y29uc3QgcmVwbGFjZVBhdHRlcm4gPSB0aGlzLnJlcGxhY2VQYXR0ZXJuO1xuXHRcdFx0Y29uc3QgcmVwbGFjZVN0cmluZyA9IHJlcGxhY2VQYXR0ZXJuLmJ1aWxkUmVwbGFjZVN0cmluZyhtYXRjaC5tYXRjaGVzLCB0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UpO1xuXG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKTtcblx0XHRcdHZpZXdNb2RlbC5yZXBsYWNlT25lKGNlbGwsIG1hdGNoLnJhbmdlLCByZXBsYWNlU3RyaW5nKS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuc3RvcCgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHRoaXMgc2hvdWxkIG5vdCB3b3JrXG5cdFx0XHRjb25zb2xlLmVycm9yKCdSZXBsYWNlIGRvZXMgbm90IHdvcmsgZm9yIG91dHB1dCBtYXRjaCcpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCByZXBsYWNlQWxsKCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Byb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdyhQUk9HUkVTU19CQVJfREVMQVkpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZVBhdHRlcm4gPSB0aGlzLnJlcGxhY2VQYXR0ZXJuO1xuXG5cdFx0Y29uc3QgY2VsbEZpbmRNYXRjaGVzID0gdGhpcy5fZmluZE1vZGVsLmZpbmRNYXRjaGVzO1xuXHRcdGNvbnN0IHJlcGxhY2VTdHJpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNlbGxGaW5kTWF0Y2hlcy5mb3JFYWNoKGNlbGxGaW5kTWF0Y2ggPT4ge1xuXHRcdFx0Y2VsbEZpbmRNYXRjaC5jb250ZW50TWF0Y2hlcy5mb3JFYWNoKG1hdGNoID0+IHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hlcyA9IG1hdGNoLm1hdGNoZXM7XG5cdFx0XHRcdHJlcGxhY2VTdHJpbmdzLnB1c2gocmVwbGFjZVBhdHRlcm4uYnVpbGRSZXBsYWNlU3RyaW5nKG1hdGNoZXMsIHRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKTtcblx0XHR2aWV3TW9kZWwucmVwbGFjZUFsbCh0aGlzLl9maW5kTW9kZWwuZmluZE1hdGNoZXMsIHJlcGxhY2VTdHJpbmdzKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb2dyZXNzQmFyLnN0b3AoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBmaW5kRmlyc3QoKTogdm9pZCB7IH1cblxuXHRwcm90ZWN0ZWQgb25Gb2N1c1RyYWNrZXJGb2N1cygpIHtcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5faXNGb2N1c2VkID0gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkZvY3VzVHJhY2tlckJsdXIoKSB7XG5cdFx0dGhpcy5fcHJldmlvdXNGb2N1c0VsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZmluZFdpZGdldEZvY3VzZWQucmVzZXQoKTtcblx0XHR0aGlzLl9pc0ZvY3VzZWQgPSBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvblJlcGxhY2VJbnB1dEZvY3VzVHJhY2tlckZvY3VzKCk6IHZvaWQge1xuXHRcdC8vIHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRwcm90ZWN0ZWQgb25SZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXJCbHVyKCk6IHZvaWQge1xuXHRcdC8vIHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkZpbmRJbnB1dEZvY3VzVHJhY2tlckZvY3VzKCk6IHZvaWQgeyB9XG5cdHByb3RlY3RlZCBvbkZpbmRJbnB1dEZvY3VzVHJhY2tlckJsdXIoKTogdm9pZCB7IH1cblxuXHRvdmVycmlkZSBhc3luYyBzaG93KGluaXRpYWxJbnB1dD86IHN0cmluZywgb3B0aW9ucz86IElTaG93Tm90ZWJvb2tGaW5kV2lkZ2V0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlYXJjaFN0cmluZ1VwZGF0ZSA9IHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZyAhPT0gaW5pdGlhbElucHV0O1xuXHRcdHN1cGVyLnNob3coaW5pdGlhbElucHV0LCBvcHRpb25zKTtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6IGluaXRpYWxJbnB1dCA/PyB0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcsIGlzUmV2ZWFsZWQ6IHRydWUgfSwgZmFsc2UpO1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8ubWF0Y2hJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmICghdGhpcy5fZmluZE1vZGVsLmZpbmRNYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9maW5kTW9kZWwucmVzZWFyY2goKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZmluZEluZGV4KG9wdGlvbnMubWF0Y2hJbmRleCk7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zPy5mb2N1cyAhPT0gZmFsc2UpIHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZWxlY3QoKTtcblx0XHR9XG5cblx0XHRpZiAoIXNlYXJjaFN0cmluZ1VwZGF0ZSAmJiBvcHRpb25zPy5zZWFyY2hTdHJpbmdTZWVkZWRGcm9tKSB7XG5cdFx0XHR0aGlzLl9maW5kTW9kZWwucmVmcmVzaEN1cnJlbnRNYXRjaChvcHRpb25zLnNlYXJjaFN0cmluZ1NlZWRlZEZyb20pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zaG93VGltZW91dCA9PT0gbnVsbCkge1xuXHRcdFx0aWYgKHRoaXMuX2hpZGVUaW1lb3V0ICE9PSBudWxsKSB7XG5cdFx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLmNsZWFyVGltZW91dCh0aGlzLl9oaWRlVGltZW91dCk7XG5cdFx0XHRcdHRoaXMuX2hpZGVUaW1lb3V0ID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IucmVtb3ZlQ2xhc3NOYW1lKEZJTkRfSElERV9UUkFOU0lUSU9OKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuYWRkQ2xhc3NOYW1lKEZJTkRfU0hPV19UUkFOU0lUSU9OKTtcblx0XHRcdHRoaXMuX3Nob3dUaW1lb3V0ID0gRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLnJlbW92ZUNsYXNzTmFtZShGSU5EX1NIT1dfVFJBTlNJVElPTik7XG5cdFx0XHRcdHRoaXMuX3Nob3dUaW1lb3V0ID0gbnVsbDtcblx0XHRcdH0sIDIwMCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG5vIG9wXG5cdFx0fVxuXHR9XG5cblx0cmVwbGFjZShpbml0aWFsRmluZElucHV0Pzogc3RyaW5nLCBpbml0aWFsUmVwbGFjZUlucHV0Pzogc3RyaW5nKSB7XG5cdFx0c3VwZXIuc2hvd1dpdGhSZXBsYWNlKGluaXRpYWxGaW5kSW5wdXQsIGluaXRpYWxSZXBsYWNlSW5wdXQpO1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogaW5pdGlhbEZpbmRJbnB1dCA/PyAnJywgcmVwbGFjZVN0cmluZzogaW5pdGlhbFJlcGxhY2VJbnB1dCA/PyAnJywgaXNSZXZlYWxlZDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNlbGVjdCgpO1xuXG5cdFx0aWYgKHRoaXMuX3Nob3dUaW1lb3V0ID09PSBudWxsKSB7XG5cdFx0XHRpZiAodGhpcy5faGlkZVRpbWVvdXQgIT09IG51bGwpIHtcblx0XHRcdFx0RE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkuY2xlYXJUaW1lb3V0KHRoaXMuX2hpZGVUaW1lb3V0KTtcblx0XHRcdFx0dGhpcy5faGlkZVRpbWVvdXQgPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5yZW1vdmVDbGFzc05hbWUoRklORF9ISURFX1RSQU5TSVRJT04pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5hZGRDbGFzc05hbWUoRklORF9TSE9XX1RSQU5TSVRJT04pO1xuXHRcdFx0dGhpcy5fc2hvd1RpbWVvdXQgPSBET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IucmVtb3ZlQ2xhc3NOYW1lKEZJTkRfU0hPV19UUkFOU0lUSU9OKTtcblx0XHRcdFx0dGhpcy5fc2hvd1RpbWVvdXQgPSBudWxsO1xuXHRcdFx0fSwgMjAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gbm8gb3Bcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBoaWRlKCkge1xuXHRcdHN1cGVyLmhpZGUoKTtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JldmVhbGVkOiBmYWxzZSB9LCBmYWxzZSk7XG5cdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGUuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9maW5kTW9kZWwuY2xlYXIoKTtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5maW5kU3RvcCgpO1xuXHRcdHRoaXMuX3Byb2dyZXNzQmFyLnN0b3AoKTtcblxuXHRcdGlmICh0aGlzLl9oaWRlVGltZW91dCA9PT0gbnVsbCkge1xuXHRcdFx0aWYgKHRoaXMuX3Nob3dUaW1lb3V0ICE9PSBudWxsKSB7XG5cdFx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLmNsZWFyVGltZW91dCh0aGlzLl9zaG93VGltZW91dCk7XG5cdFx0XHRcdHRoaXMuX3Nob3dUaW1lb3V0ID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IucmVtb3ZlQ2xhc3NOYW1lKEZJTkRfU0hPV19UUkFOU0lUSU9OKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmFkZENsYXNzTmFtZShGSU5EX0hJREVfVFJBTlNJVElPTik7XG5cdFx0XHR0aGlzLl9oaWRlVGltZW91dCA9IERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5yZW1vdmVDbGFzc05hbWUoRklORF9ISURFX1RSQU5TSVRJT04pO1xuXHRcdFx0fSwgMjAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gbm8gb3Bcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcHJldmlvdXNGb2N1c0VsZW1lbnQgJiYgdGhpcy5fcHJldmlvdXNGb2N1c0VsZW1lbnQub2Zmc2V0UGFyZW50KSB7XG5cdFx0XHR0aGlzLl9wcmV2aW91c0ZvY3VzRWxlbWVudC5mb2N1cygpO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNGb2N1c0VsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0TGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuY2VsbEF0KGkpO1xuXG5cdFx0XHRcdGlmIChjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmcgJiYgY2VsbC5lZGl0U3RhdGVTb3VyY2UgPT09ICdmaW5kJykge1xuXHRcdFx0XHRcdGNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuUHJldmlldywgJ2Nsb3NlRmluZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF91cGRhdGVNYXRjaGVzQ291bnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9maW5kTW9kZWwgfHwgIXRoaXMuX2ZpbmRNb2RlbC5maW5kTWF0Y2hlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21hdGNoZXNDb3VudC5zdHlsZS5taW5XaWR0aCA9IE1BWF9NQVRDSEVTX0NPVU5UX1dJRFRIICsgJ3B4Jztcblx0XHR0aGlzLl9tYXRjaGVzQ291bnQudGl0bGUgPSAnJztcblxuXHRcdC8vIHJlbW92ZSBwcmV2aW91cyBjb250ZW50XG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LmZpcnN0Q2hpbGQ/LnJlbW92ZSgpO1xuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cblx0XHRpZiAodGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50ID4gMCkge1xuXHRcdFx0bGV0IG1hdGNoZXNDb3VudDogc3RyaW5nID0gU3RyaW5nKHRoaXMuX3N0YXRlLm1hdGNoZXNDb3VudCk7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50ID49IE1BVENIRVNfTElNSVQpIHtcblx0XHRcdFx0bWF0Y2hlc0NvdW50ICs9ICcrJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1hdGNoZXNQb3NpdGlvbjogc3RyaW5nID0gdGhpcy5fZmluZE1vZGVsLmN1cnJlbnRNYXRjaCA8IDAgPyAnPycgOiBTdHJpbmcoKHRoaXMuX2ZpbmRNb2RlbC5jdXJyZW50TWF0Y2ggKyAxKSk7XG5cdFx0XHRsYWJlbCA9IHN0cmluZ3MuZm9ybWF0KE5MU19NQVRDSEVTX0xPQ0FUSU9OLCBtYXRjaGVzUG9zaXRpb24sIG1hdGNoZXNDb3VudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhYmVsID0gTkxTX05PX1JFU1VMVFM7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxhYmVsKSk7XG5cblx0XHRhbGVydEZuKHRoaXMuX2dldEFyaWFMYWJlbChsYWJlbCwgdGhpcy5fc3RhdGUuY3VycmVudE1hdGNoLCB0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcpKTtcblx0XHRNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCA9IE1hdGgubWF4KE1BWF9NQVRDSEVTX0NPVU5UX1dJRFRILCB0aGlzLl9tYXRjaGVzQ291bnQuY2xpZW50V2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcsIGN1cnJlbnRNYXRjaDogUmFuZ2UgfCBudWxsLCBzZWFyY2hTdHJpbmc6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKGxhYmVsID09PSBOTFNfTk9fUkVTVUxUUykge1xuXHRcdFx0cmV0dXJuIHNlYXJjaFN0cmluZyA9PT0gJydcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0RW1wdHknLCBcInswfSBmb3VuZFwiLCBsYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0JywgXCJ7MH0gZm91bmQgZm9yICd7MX0nXCIsIGxhYmVsLCBzZWFyY2hTdHJpbmcpO1xuXHRcdH1cblxuXHRcdC8vIFRPRE9AcmVib3JuaXgsIGFyaWEgZm9yIGBjZWxsICR7aW5kZXh9LCBsaW5lIHtsaW5lfWBcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWFTZWFyY2hOb1Jlc3VsdFdpdGhMaW5lTnVtTm9DdXJyZW50TWF0Y2gnLCBcInswfSBmb3VuZCBmb3IgJ3sxfSdcIiwgbGFiZWwsIHNlYXJjaFN0cmluZyk7XG5cdH1cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvcj8ucmVtb3ZlQ2xhc3NOYW1lKEZJTkRfU0hPV19UUkFOU0lUSU9OKTtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvcj8ucmVtb3ZlQ2xhc3NOYW1lKEZJTkRfSElERV9UUkFOU0lUSU9OKTtcblx0XHR0aGlzLl9maW5kTW9kZWwuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksYUFBYTtBQUd6QixTQUFTLGVBQWUsbUNBQW1DO0FBQzNELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCLHNCQUFzQjtBQUNyRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQW1GO0FBRTVGLFNBQVMsdURBQXVEO0FBRWhFLE1BQU0sdUJBQXVC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
