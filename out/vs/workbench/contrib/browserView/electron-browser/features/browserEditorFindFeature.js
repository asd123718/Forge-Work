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
import { localize, localize2 } from "../../../../../nls.js";
import { $, DisposableResizeObserver, getWindow } from "../../../../../base/browser/dom.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { Action2, registerAction2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Emitter } from "../../../../../base/common/event.js";
import { BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { SimpleFindWidget } from "../../../codeEditor/browser/find/simpleFindWidget.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL } from "../browserEditor.js";
import { Codicon } from "../../../../../base/common/codicons.js";
const CONTEXT_BROWSER_FIND_WIDGET_VISIBLE = new RawContextKey("browserFindWidgetVisible", false, localize("browser.findWidgetVisible", "Whether the browser find widget is visible"));
const CONTEXT_BROWSER_FIND_WIDGET_FOCUSED = new RawContextKey("browserFindWidgetFocused", false, localize("browser.findWidgetFocused", "Whether the browser find widget is focused"));
let BrowserFindWidget = class extends SimpleFindWidget {
  constructor(container, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService) {
    super({
      showCommonFindToggles: true,
      checkImeCompletionState: true,
      showResultCount: true,
      enableSash: true,
      initialWidth: 350,
      previousMatchActionId: BrowserViewCommandId.FindPrevious,
      nextMatchActionId: BrowserViewCommandId.FindNext,
      closeWidgetActionId: BrowserViewCommandId.HideFind
    }, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService);
    this._modelDisposables = this._register(new DisposableStore());
    this._hasFoundMatch = false;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._findWidgetVisible = CONTEXT_BROWSER_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
    this._findWidgetFocused = CONTEXT_BROWSER_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
    const domNode = this.getDomNode();
    container.appendChild(domNode);
    let lastHeight = domNode.offsetHeight;
    const resizeObserver = this._register(new DisposableResizeObserver("BrowserEditorFindFeature.heightChange", () => {
      const newHeight = domNode.offsetHeight;
      if (newHeight !== lastHeight) {
        lastHeight = newHeight;
        this._onDidChangeHeight.fire();
      }
    }, getWindow(container)));
    this._register(resizeObserver.observe(domNode));
  }
  /**
   * Set the browser view model to use for find operations.
   * This should be called whenever the editor input changes.
   */
  setModel(model) {
    this._modelDisposables.clear();
    this._model = model;
    this._lastFindResult = void 0;
    this._hasFoundMatch = false;
    if (model) {
      this._modelDisposables.add(model.onDidFindInPage((result) => {
        this._lastFindResult = {
          resultIndex: result.activeMatchOrdinal - 1,
          // Convert to 0-based index
          resultCount: result.matches
        };
        this._hasFoundMatch = result.matches > 0;
        this.updateButtons(this._hasFoundMatch);
        this.updateResultCount();
      }));
      this._modelDisposables.add(model.onWillDispose(() => {
        this.setModel(void 0);
      }));
    }
  }
  reveal(initialInput) {
    const wasVisible = this.isVisible();
    super.reveal(initialInput);
    this._findWidgetVisible.set(true);
    this.focusFindBox();
    if (this.inputValue && !wasVisible) {
      this._onInputChanged();
    }
  }
  hide() {
    super.hide(false);
    this._findWidgetVisible.reset();
    this._model?.stopFindInPage(true);
    this._model?.focus();
    this._lastFindResult = void 0;
    this._hasFoundMatch = false;
  }
  find(previous) {
    const value = this.inputValue;
    if (value && this._model) {
      this._model.findInPage(value, {
        forward: !previous,
        recompute: false,
        matchCase: this._getCaseSensitiveValue()
      });
    }
  }
  findFirst() {
    const value = this.inputValue;
    if (value && this._model) {
      this._model.findInPage(value, {
        forward: true,
        recompute: true,
        matchCase: this._getCaseSensitiveValue()
      });
    }
  }
  clear() {
    if (this._model) {
      this._model.stopFindInPage(false);
      this._lastFindResult = void 0;
      this._hasFoundMatch = false;
    }
  }
  _onInputChanged() {
    if (this.inputValue) {
      this.findFirst();
    } else if (this._model) {
      this.clear();
    }
    return false;
  }
  async _getResultCount() {
    return this._lastFindResult;
  }
  _onFocusTrackerFocus() {
    this._findWidgetFocused.set(true);
  }
  _onFocusTrackerBlur() {
    this._findWidgetFocused.reset();
  }
  _onFindInputFocusTrackerFocus() {
  }
  _onFindInputFocusTrackerBlur() {
  }
};
BrowserFindWidget = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IAccessibilityService)
], BrowserFindWidget);
let BrowserEditorFindContribution = class extends BrowserEditorContribution {
  constructor(editor, instantiationService) {
    super(editor);
    this.instantiationService = instantiationService;
    this._findWidgetContainer = $(".browser-find-widget-wrapper");
    this._findWidget = new Lazy(() => {
      const findWidget = this.instantiationService.createInstance(
        BrowserFindWidget,
        this._findWidgetContainer
      );
      if (editor.model) {
        findWidget.setModel(editor.model);
      }
      findWidget.onDidChangeHeight(() => {
        editor.layoutBrowserContainer();
      });
      return findWidget;
    });
    this._register(toDisposable(() => this._findWidget.rawValue?.dispose()));
  }
  /**
   * The container element to insert below the toolbar.
   */
  get widgets() {
    return [{ location: BrowserWidgetLocation.Toolbar, element: this._findWidgetContainer, order: 0 }];
  }
  onModelAttached(model, _store) {
    this._findWidget.rawValue?.setModel(model);
  }
  onModelDetached() {
    this._findWidget.rawValue?.setModel(void 0);
    this._findWidget.rawValue?.hide();
  }
  onPaneResized(width) {
    this._findWidget.rawValue?.layout(width);
  }
  /**
   * Show the find widget, optionally pre-populated with selected text from the browser view
   */
  async showFind() {
    const selectedText = (await this.editor.model?.getSelectedText())?.trim();
    const textToReveal = selectedText && !/[\r\n]/.test(selectedText) ? selectedText : void 0;
    this._findWidget.value.reveal(textToReveal);
    this._findWidget.value.layout(this._findWidgetContainer.clientWidth);
  }
  /**
   * Hide the find widget
   */
  hideFind() {
    this._findWidget.rawValue?.hide();
  }
  /**
   * Find the next match
   */
  findNext() {
    this._findWidget.rawValue?.find(false);
  }
  /**
   * Find the previous match
   */
  findPrevious() {
    this._findWidget.rawValue?.find(true);
  }
};
BrowserEditorFindContribution = __decorateClass([
  __decorateParam(1, IInstantiationService)
], BrowserEditorFindContribution);
BrowserEditor.registerContribution(BrowserEditorFindContribution);
const _ShowBrowserFindAction = class _ShowBrowserFindAction extends Action2 {
  constructor() {
    super({
      id: _ShowBrowserFindAction.ID,
      title: localize2("browser.showFindAction", "Find in Page"),
      category: BrowserActionCategory,
      icon: Codicon.search,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Tools,
        order: 0,
        isHiddenByDefault: true
      },
      keybinding: {
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyF
      }
    });
  }
  run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      void browserEditor.getContribution(BrowserEditorFindContribution)?.showFind();
    }
  }
};
_ShowBrowserFindAction.ID = BrowserViewCommandId.ShowFind;
let ShowBrowserFindAction = _ShowBrowserFindAction;
const _HideBrowserFindAction = class _HideBrowserFindAction extends Action2 {
  constructor() {
    super({
      id: _HideBrowserFindAction.ID,
      title: localize2("browser.hideFindAction", "Close Find Widget"),
      category: BrowserActionCategory,
      f1: false,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE),
      keybinding: {
        weight: KeybindingWeight.EditorContrib + 5,
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const browserEditor = accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserEditorFindContribution)?.hideFind();
    }
  }
};
_HideBrowserFindAction.ID = BrowserViewCommandId.HideFind;
let HideBrowserFindAction = _HideBrowserFindAction;
const _BrowserFindNextAction = class _BrowserFindNextAction extends Action2 {
  constructor() {
    super({
      id: _BrowserFindNextAction.ID,
      title: localize2("browser.findNextAction", "Find Next"),
      category: BrowserActionCategory,
      f1: false,
      precondition: BROWSER_EDITOR_ACTIVE,
      keybinding: [{
        when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Enter
      }, {
        when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.F3,
        mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG }
      }]
    });
  }
  run(accessor) {
    const browserEditor = accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserEditorFindContribution)?.findNext();
    }
  }
};
_BrowserFindNextAction.ID = BrowserViewCommandId.FindNext;
let BrowserFindNextAction = _BrowserFindNextAction;
const _BrowserFindPreviousAction = class _BrowserFindPreviousAction extends Action2 {
  constructor() {
    super({
      id: _BrowserFindPreviousAction.ID,
      title: localize2("browser.findPreviousAction", "Find Previous"),
      category: BrowserActionCategory,
      f1: false,
      precondition: BROWSER_EDITOR_ACTIVE,
      keybinding: [{
        when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.Shift | KeyCode.Enter
      }, {
        when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.Shift | KeyCode.F3,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG }
      }]
    });
  }
  run(accessor) {
    const browserEditor = accessor.get(IEditorService).activeEditorPane;
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserEditorFindContribution)?.findPrevious();
    }
  }
};
_BrowserFindPreviousAction.ID = BrowserViewCommandId.FindPrevious;
let BrowserFindPreviousAction = _BrowserFindPreviousAction;
registerAction2(ShowBrowserFindAction);
registerAction2(HideBrowserFindAction);
registerAction2(BrowserFindNextAction);
registerAction2(BrowserFindPreviousAction);
export {
  BrowserEditorFindContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlckVkaXRvckZpbmRGZWF0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyAkLCBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgQ29udGV4dEtleUV4cHIsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgU2ltcGxlRmluZFdpZGdldCB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9maW5kL3NpbXBsZUZpbmRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvciwgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiwgQnJvd3NlcldpZGdldExvY2F0aW9uLCBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIEJyb3dzZXJBY3Rpb25DYXRlZ29yeSwgQnJvd3NlckFjdGlvbkdyb3VwLCBDT05URVhUX0JST1dTRVJfSEFTX0VSUk9SLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCwgSUJyb3dzZXJFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi9icm93c2VyRWRpdG9yLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5cbmNvbnN0IENPTlRFWFRfQlJPV1NFUl9GSU5EX1dJREdFVF9WSVNJQkxFID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Jyb3dzZXJGaW5kV2lkZ2V0VmlzaWJsZScsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5maW5kV2lkZ2V0VmlzaWJsZScsIFwiV2hldGhlciB0aGUgYnJvd3NlciBmaW5kIHdpZGdldCBpcyB2aXNpYmxlXCIpKTtcbmNvbnN0IENPTlRFWFRfQlJPV1NFUl9GSU5EX1dJREdFVF9GT0NVU0VEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Jyb3dzZXJGaW5kV2lkZ2V0Rm9jdXNlZCcsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5maW5kV2lkZ2V0Rm9jdXNlZCcsIFwiV2hldGhlciB0aGUgYnJvd3NlciBmaW5kIHdpZGdldCBpcyBmb2N1c2VkXCIpKTtcblxuLyoqXG4gKiBGaW5kIHdpZGdldCBmb3IgdGhlIGludGVncmF0ZWQgYnJvd3NlciB2aWV3LlxuICogVXNlcyB0aGUgU2ltcGxlRmluZFdpZGdldCBiYXNlIGNsYXNzIGFuZCBjb21tdW5pY2F0ZXMgd2l0aCB0aGUgYnJvd3NlciB2aWV3IG1vZGVsXG4gKiB0byBwZXJmb3JtIGZpbmQgb3BlcmF0aW9ucyBpbiB0aGUgcmVuZGVyZWQgd2ViIHBhZ2UuXG4gKi9cbmNsYXNzIEJyb3dzZXJGaW5kV2lkZ2V0IGV4dGVuZHMgU2ltcGxlRmluZFdpZGdldCB7XG5cdHByaXZhdGUgX21vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRXaWRnZXRWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZmluZFdpZGdldEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9sYXN0RmluZFJlc3VsdDogeyByZXN1bHRJbmRleDogbnVtYmVyOyByZXN1bHRDb3VudDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hhc0ZvdW5kTWF0Y2ggPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHNob3dDb21tb25GaW5kVG9nZ2xlczogdHJ1ZSxcblx0XHRcdGNoZWNrSW1lQ29tcGxldGlvblN0YXRlOiB0cnVlLFxuXHRcdFx0c2hvd1Jlc3VsdENvdW50OiB0cnVlLFxuXHRcdFx0ZW5hYmxlU2FzaDogdHJ1ZSxcblx0XHRcdGluaXRpYWxXaWR0aDogMzUwLFxuXHRcdFx0cHJldmlvdXNNYXRjaEFjdGlvbklkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5GaW5kUHJldmlvdXMsXG5cdFx0XHRuZXh0TWF0Y2hBY3Rpb25JZDogQnJvd3NlclZpZXdDb21tYW5kSWQuRmluZE5leHQsXG5cdFx0XHRjbG9zZVdpZGdldEFjdGlvbklkOiBCcm93c2VyVmlld0NvbW1hbmRJZC5IaWRlRmluZFxuXHRcdH0sIGNvbnRleHRWaWV3U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGhvdmVyU2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cblx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZSA9IENPTlRFWFRfQlJPV1NFUl9GSU5EX1dJREdFVF9WSVNJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZmluZFdpZGdldEZvY3VzZWQgPSBDT05URVhUX0JST1dTRVJfRklORF9XSURHRVRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuZ2V0RG9tTm9kZSgpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb21Ob2RlKTtcblxuXHRcdGxldCBsYXN0SGVpZ2h0ID0gZG9tTm9kZS5vZmZzZXRIZWlnaHQ7XG5cdFx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdCcm93c2VyRWRpdG9yRmluZEZlYXR1cmUuaGVpZ2h0Q2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3SGVpZ2h0ID0gZG9tTm9kZS5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRpZiAobmV3SGVpZ2h0ICE9PSBsYXN0SGVpZ2h0KSB7XG5cdFx0XHRcdGxhc3RIZWlnaHQgPSBuZXdIZWlnaHQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9LCBnZXRXaW5kb3coY29udGFpbmVyKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2l6ZU9ic2VydmVyLm9ic2VydmUoZG9tTm9kZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgYnJvd3NlciB2aWV3IG1vZGVsIHRvIHVzZSBmb3IgZmluZCBvcGVyYXRpb25zLlxuXHQgKiBUaGlzIHNob3VsZCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIGVkaXRvciBpbnB1dCBjaGFuZ2VzLlxuXHQgKi9cblx0c2V0TW9kZWwobW9kZWw6IElCcm93c2VyVmlld01vZGVsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fbGFzdEZpbmRSZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faGFzRm91bmRNYXRjaCA9IGZhbHNlO1xuXG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZEZpbmRJblBhZ2UocmVzdWx0ID0+IHtcblx0XHRcdFx0dGhpcy5fbGFzdEZpbmRSZXN1bHQgPSB7XG5cdFx0XHRcdFx0cmVzdWx0SW5kZXg6IHJlc3VsdC5hY3RpdmVNYXRjaE9yZGluYWwgLSAxLCAvLyBDb252ZXJ0IHRvIDAtYmFzZWQgaW5kZXhcblx0XHRcdFx0XHRyZXN1bHRDb3VudDogcmVzdWx0Lm1hdGNoZXNcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5faGFzRm91bmRNYXRjaCA9IHJlc3VsdC5tYXRjaGVzID4gMDtcblx0XHRcdFx0dGhpcy51cGRhdGVCdXR0b25zKHRoaXMuX2hhc0ZvdW5kTWF0Y2gpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVJlc3VsdENvdW50KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNldE1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgcmV2ZWFsKGluaXRpYWxJbnB1dD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHdhc1Zpc2libGUgPSB0aGlzLmlzVmlzaWJsZSgpO1xuXHRcdHN1cGVyLnJldmVhbChpbml0aWFsSW5wdXQpO1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblxuXHRcdC8vIEZvY3VzIHRoZSBmaW5kIGlucHV0XG5cdFx0dGhpcy5mb2N1c0ZpbmRCb3goKTtcblxuXHRcdC8vIElmIHRoZXJlJ3MgZXhpc3RpbmcgaW5wdXQgYW5kIHRoZSB3aWRnZXQgd2Fzbid0IGFscmVhZHkgdmlzaWJsZSwgdHJpZ2dlciBhIHNlYXJjaFxuXHRcdGlmICh0aGlzLmlucHV0VmFsdWUgJiYgIXdhc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29uSW5wdXRDaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgaGlkZSgpOiB2b2lkIHtcblx0XHRzdXBlci5oaWRlKGZhbHNlKTtcblx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZS5yZXNldCgpO1xuXG5cdFx0Ly8gU3RvcCBmaW5kIGFuZCBjbGVhciBoaWdobGlnaHRzIGluIHRoZSBicm93c2VyIHZpZXdcblx0XHR0aGlzLl9tb2RlbD8uc3RvcEZpbmRJblBhZ2UodHJ1ZSk7XG5cdFx0dGhpcy5fbW9kZWw/LmZvY3VzKCk7XG5cdFx0dGhpcy5fbGFzdEZpbmRSZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faGFzRm91bmRNYXRjaCA9IGZhbHNlO1xuXHR9XG5cblx0ZmluZChwcmV2aW91czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5pbnB1dFZhbHVlO1xuXHRcdGlmICh2YWx1ZSAmJiB0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwuZmluZEluUGFnZSh2YWx1ZSwge1xuXHRcdFx0XHRmb3J3YXJkOiAhcHJldmlvdXMsXG5cdFx0XHRcdHJlY29tcHV0ZTogZmFsc2UsXG5cdFx0XHRcdG1hdGNoQ2FzZTogdGhpcy5fZ2V0Q2FzZVNlbnNpdGl2ZVZhbHVlKClcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGZpbmRGaXJzdCgpOiB2b2lkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuaW5wdXRWYWx1ZTtcblx0XHRpZiAodmFsdWUgJiYgdGhpcy5fbW9kZWwpIHtcblx0XHRcdHRoaXMuX21vZGVsLmZpbmRJblBhZ2UodmFsdWUsIHtcblx0XHRcdFx0Zm9yd2FyZDogdHJ1ZSxcblx0XHRcdFx0cmVjb21wdXRlOiB0cnVlLFxuXHRcdFx0XHRtYXRjaENhc2U6IHRoaXMuX2dldENhc2VTZW5zaXRpdmVWYWx1ZSgpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbW9kZWwpIHtcblx0XHRcdHRoaXMuX21vZGVsLnN0b3BGaW5kSW5QYWdlKGZhbHNlKTtcblx0XHRcdHRoaXMuX2xhc3RGaW5kUmVzdWx0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5faGFzRm91bmRNYXRjaCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfb25JbnB1dENoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaW5wdXRWYWx1ZSkge1xuXHRcdFx0dGhpcy5maW5kRmlyc3QoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX21vZGVsKSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfZ2V0UmVzdWx0Q291bnQoKTogUHJvbWlzZTx7IHJlc3VsdEluZGV4OiBudW1iZXI7IHJlc3VsdENvdW50OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0RmluZFJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25Gb2N1c1RyYWNrZXJGb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uRm9jdXNUcmFja2VyQmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZC5yZXNldCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbkZpbmRJbnB1dEZvY3VzVHJhY2tlckZvY3VzKCk6IHZvaWQge1xuXHRcdC8vIE5vLW9wXG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uRmluZElucHV0Rm9jdXNUcmFja2VyQmx1cigpOiB2b2lkIHtcblx0XHQvLyBOby1vcFxuXHR9XG59XG5cbi8qKlxuICogQnJvd3NlciBlZGl0b3IgY29udHJpYnV0aW9uIHRoYXQgbWFuYWdlcyB0aGUgZmluZC1pbi1wYWdlIHdpZGdldC5cbiAqXG4gKiBDcmVhdGVzIGEgY29udGFpbmVyIGp1c3QgYmVsb3cgdGhlIHRvb2xiYXIgYW5kIGxhemlseSBpbnN0YW50aWF0ZXMgdGhlXG4gKiB7QGxpbmsgQnJvd3NlckZpbmRXaWRnZXR9LiAgV2hlbiB0aGUgZmluZCB3aWRnZXQncyBoZWlnaHQgY2hhbmdlcyB0aGVcbiAqIGJyb3dzZXIgY29udGFpbmVyIGlzIHJlLWxhaWQtb3V0IHNvIHRoYXQgdGhlIHdlYi1jb250ZW50cyB2aWV3IHN0YXlzIGluXG4gKiBzeW5jLlxuICovXG5leHBvcnQgY2xhc3MgQnJvd3NlckVkaXRvckZpbmRDb250cmlidXRpb24gZXh0ZW5kcyBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZmluZFdpZGdldENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRXaWRnZXQ6IExhenk8QnJvd3NlckZpbmRXaWRnZXQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yKTtcblxuXHRcdHRoaXMuX2ZpbmRXaWRnZXRDb250YWluZXIgPSAkKCcuYnJvd3Nlci1maW5kLXdpZGdldC13cmFwcGVyJyk7XG5cblx0XHR0aGlzLl9maW5kV2lkZ2V0ID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmluZFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEJyb3dzZXJGaW5kV2lkZ2V0LFxuXHRcdFx0XHR0aGlzLl9maW5kV2lkZ2V0Q29udGFpbmVyXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGVkaXRvci5tb2RlbCkge1xuXHRcdFx0XHRmaW5kV2lkZ2V0LnNldE1vZGVsKGVkaXRvci5tb2RlbCk7XG5cdFx0XHR9XG5cdFx0XHRmaW5kV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHtcblx0XHRcdFx0ZWRpdG9yLmxheW91dEJyb3dzZXJDb250YWluZXIoKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGZpbmRXaWRnZXQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2ZpbmRXaWRnZXQucmF3VmFsdWU/LmRpc3Bvc2UoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBjb250YWluZXIgZWxlbWVudCB0byBpbnNlcnQgYmVsb3cgdGhlIHRvb2xiYXIuXG5cdCAqL1xuXHRvdmVycmlkZSBnZXQgd2lkZ2V0cygpOiByZWFkb25seSBJQnJvd3NlckVkaXRvcldpZGdldFtdIHtcblx0XHRyZXR1cm4gW3sgbG9jYXRpb246IEJyb3dzZXJXaWRnZXRMb2NhdGlvbi5Ub29sYmFyLCBlbGVtZW50OiB0aGlzLl9maW5kV2lkZ2V0Q29udGFpbmVyLCBvcmRlcjogMCB9XTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQobW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBfc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXQucmF3VmFsdWU/LnNldE1vZGVsKG1vZGVsKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uTW9kZWxEZXRhY2hlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kV2lkZ2V0LnJhd1ZhbHVlPy5zZXRNb2RlbCh1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXQucmF3VmFsdWU/LmhpZGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uUGFuZVJlc2l6ZWQod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXQucmF3VmFsdWU/LmxheW91dCh3aWR0aCk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvdyB0aGUgZmluZCB3aWRnZXQsIG9wdGlvbmFsbHkgcHJlLXBvcHVsYXRlZCB3aXRoIHNlbGVjdGVkIHRleHQgZnJvbSB0aGUgYnJvd3NlciB2aWV3XG5cdCAqL1xuXHRhc3luYyBzaG93RmluZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSAoYXdhaXQgdGhpcy5lZGl0b3IubW9kZWw/LmdldFNlbGVjdGVkVGV4dCgpKT8udHJpbSgpO1xuXHRcdGNvbnN0IHRleHRUb1JldmVhbCA9IHNlbGVjdGVkVGV4dCAmJiAhL1tcXHJcXG5dLy50ZXN0KHNlbGVjdGVkVGV4dCkgPyBzZWxlY3RlZFRleHQgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZmluZFdpZGdldC52YWx1ZS5yZXZlYWwodGV4dFRvUmV2ZWFsKTtcblx0XHR0aGlzLl9maW5kV2lkZ2V0LnZhbHVlLmxheW91dCh0aGlzLl9maW5kV2lkZ2V0Q29udGFpbmVyLmNsaWVudFdpZHRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlIHRoZSBmaW5kIHdpZGdldFxuXHQgKi9cblx0aGlkZUZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZFdpZGdldC5yYXdWYWx1ZT8uaGlkZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIG5leHQgbWF0Y2hcblx0ICovXG5cdGZpbmROZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXQucmF3VmFsdWU/LmZpbmQoZmFsc2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIHByZXZpb3VzIG1hdGNoXG5cdCAqL1xuXHRmaW5kUHJldmlvdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZFdpZGdldC5yYXdWYWx1ZT8uZmluZCh0cnVlKTtcblx0fVxufVxuXG5Ccm93c2VyRWRpdG9yLnJlZ2lzdGVyQ29udHJpYnV0aW9uKEJyb3dzZXJFZGl0b3JGaW5kQ29udHJpYnV0aW9uKTtcblxuLy8gLS0gQWN0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIFNob3dCcm93c2VyRmluZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5TaG93RmluZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2hvd0Jyb3dzZXJGaW5kQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5zaG93RmluZEFjdGlvbicsICdGaW5kIGluIFBhZ2UnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNlYXJjaCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCwgQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUi5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3NlckFjdGlvbnNUb29sYmFyLFxuXHRcdFx0XHRncm91cDogQnJvd3NlckFjdGlvbkdyb3VwLlRvb2xzLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUZcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IHZvaWQge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0dm9pZCBicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yRmluZENvbnRyaWJ1dGlvbik/LnNob3dGaW5kKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEhpZGVCcm93c2VyRmluZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5IaWRlRmluZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSGlkZUJyb3dzZXJGaW5kQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5oaWRlRmluZEFjdGlvbicsICdDbG9zZSBGaW5kIFdpZGdldCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0ZJTkRfV0lER0VUX1ZJU0lCTEUpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3NlckVkaXRvckZpbmRDb250cmlidXRpb24pPy5oaWRlRmluZCgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBCcm93c2VyRmluZE5leHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuRmluZE5leHQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEJyb3dzZXJGaW5kTmV4dEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuZmluZE5leHRBY3Rpb24nLCAnRmluZCBOZXh0JyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBDT05URVhUX0JST1dTRVJfRklORF9XSURHRVRfRk9DVVNFRCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXJcblx0XHRcdH0sIHtcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUk9XU0VSX0ZJTkRfV0lER0VUX1ZJU0lCTEUsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkYzLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUcgfVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yRmluZENvbnRyaWJ1dGlvbik/LmZpbmROZXh0KCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEJyb3dzZXJGaW5kUHJldmlvdXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuRmluZFByZXZpb3VzO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBCcm93c2VyRmluZFByZXZpb3VzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5maW5kUHJldmlvdXNBY3Rpb24nLCAnRmluZCBQcmV2aW91cycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUk9XU0VSX0ZJTkRfV0lER0VUX0ZPQ1VTRUQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHdoZW46IENPTlRFWFRfQlJPV1NFUl9GSU5EX1dJREdFVF9WSVNJQkxFLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GMyxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlHIH1cblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3NlckVkaXRvckZpbmRDb250cmlidXRpb24pPy5maW5kUHJldmlvdXMoKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFNob3dCcm93c2VyRmluZEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoSGlkZUJyb3dzZXJGaW5kQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihCcm93c2VyRmluZE5leHRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEJyb3dzZXJGaW5kUHJldmlvdXNBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsR0FBRywwQkFBMEIsaUJBQWlCO0FBQ3ZELFNBQXNCLG9CQUFvQixnQkFBZ0IscUJBQXFCO0FBQy9FLFNBQVMsU0FB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
