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
import "./media/agentFeedbackEditorInput.css";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection, SelectionDirection } from "../../../../editor/common/core/selection.js";
import { addStandardDisposableListener, getWindow, isHTMLElement } from "../../../../base/browser/dom.js";
import { isEqual } from "../../../../base/common/resources.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IAgentFeedbackService } from "./agentFeedbackService.js";
import { createAgentFeedbackContext } from "./agentFeedbackEditorUtils.js";
import { localize, localize2 } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { CHAT_CATEGORY } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { FeedbackInputWidget } from "./feedbackInputWidget.js";
const addFeedbackAtCurrentLineActionId = "agentFeedbackEditor.action.addAtCurrentLine";
const agentFeedbackHoverGlyphClassName = "agent-feedback-glyph";
const hasAgentFeedbackSessionForEditor = new RawContextKey("agentFeedbackEditor.hasSession", false);
const _AgentFeedbackInputWidget = class _AgentFeedbackInputWidget extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    this.allowEditorOverflow = false;
    this._position = null;
    this._core = this._register(new FeedbackInputWidget({
      placeholder: localize("agentFeedback.addFeedback", "Add Feedback"),
      getMaxContentWidth: () => this._computeContentWidth(),
      primaryAction: {
        label: localize("agentFeedback.add", "Add Feedback"),
        icon: Codicon.plus,
        keybindingLabel: localize("enter", "Enter")
      },
      secondaryAction: {
        label: localize("agentFeedback.addAndSubmit", "Add Feedback and Submit"),
        icon: Codicon.send,
        keybindingLabel: localize("altEnter", "Alt+Enter")
      }
    }));
    this.onDidTriggerAdd = this._core.onDidTriggerPrimary;
    this.onDidTriggerAddAndSubmit = this._core.onDidTriggerSecondary;
  }
  getId() {
    return _AgentFeedbackInputWidget._ID;
  }
  getDomNode() {
    return this._core.domNode;
  }
  getPosition() {
    return this._position;
  }
  get inputElement() {
    return this._core.inputElement;
  }
  setPosition(position) {
    this._position = position;
    this._editor.layoutOverlayWidget(this);
  }
  show() {
    this._core.show();
  }
  hide() {
    this._core.hide();
  }
  clearInput() {
    this._core.clearInput();
  }
  setPlaceholder(placeholder) {
    this._core.setPlaceholder(placeholder);
  }
  autoSize() {
    this._core.autoSize();
  }
  updateActionEnabled() {
    this._core.updateActionEnabled();
  }
  _computeContentWidth() {
    const layoutInfo = this._editor.getLayoutInfo();
    return Math.max(0, layoutInfo.width - layoutInfo.contentLeft);
  }
};
_AgentFeedbackInputWidget._ID = "agentFeedback.inputWidget";
let AgentFeedbackInputWidget = _AgentFeedbackInputWidget;
let AgentFeedbackEditorInputContribution = class extends Disposable {
  constructor(_editor, _agentFeedbackService, _codeEditorService, _contextKeyService) {
    super();
    this._editor = _editor;
    this._agentFeedbackService = _agentFeedbackService;
    this._codeEditorService = _codeEditorService;
    this._contextKeyService = _contextKeyService;
    this._visible = false;
    this._mouseDown = false;
    this._suppressSelectionChangeOnce = false;
    this._preferBelow = true;
    this._widgetListeners = this._store.add(new DisposableStore());
    this._hoverDecorations = this._editor.createDecorationsCollection();
    this._store.add({ dispose: () => this._hoverDecorations.clear() });
    this._hasAgentFeedbackSessionContext = hasAgentFeedbackSessionForEditor.bindTo(this._contextKeyService);
    this._store.add(this._editor.onDidChangeCursorSelection(() => this._onSelectionChanged()));
    this._store.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
    this._store.add(this._editor.onDidScrollChange(() => {
      if (this._visible) {
        this._updatePosition();
      }
    }));
    this._store.add(this._editor.onDidLayoutChange(() => {
      if (this._visible && this._widget) {
        this._widget.autoSize();
        this._updatePosition();
      }
    }));
    this._store.add(this._editor.onMouseMove((e) => this._onEditorMouseMove(e)));
    this._store.add(this._editor.onMouseLeave(() => this._clearHoverGlyph()));
    this._store.add(this._editor.onMouseDown((e) => {
      if (this._isWidgetTarget(e.event.target)) {
        return;
      }
      if (this._isHoverGlyphTarget(e)) {
        e.event.preventDefault();
        e.event.stopPropagation();
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber !== void 0) {
          this._selectLine(lineNumber);
        }
        return;
      }
      this._mouseDown = true;
      this._autoHide();
    }));
    this._store.add(this._editor.onMouseUp((e) => {
      this._mouseDown = false;
      if (this._isWidgetTarget(e.event.target)) {
        return;
      }
      if (this._isHoverGlyphTarget(e)) {
        return;
      }
      this._onSelectionChanged();
    }));
    this._store.add(this._editor.onDidBlurEditorWidget(() => {
      if (!this._visible) {
        return;
      }
      getWindow(this._editor.getDomNode()).setTimeout(() => {
        if (!this._visible) {
          return;
        }
        if (this._isWidgetTarget(getWindow(this._editor.getDomNode()).document.activeElement)) {
          return;
        }
        this._autoHide();
      }, 0);
    }));
    this._store.add(this._editor.onDidFocusEditorText(() => this._onSelectionChanged()));
    this._store.add(this._agentFeedbackService.onDidChangeFeedbackScope(() => {
      this._clearHoverGlyph();
      this._sessionResource = this._getSessionForModel();
      if (this._visible && this._widget) {
        if (!this._sessionResource) {
          this._autoHide();
        } else {
          this._widget.setPlaceholder(this._getPlaceholder());
        }
      }
    }));
    this._getSessionForModel();
  }
  _isWidgetTarget(target) {
    return !!this._widget && !!target && this._widget.getDomNode().contains(target);
  }
  _isHoverGlyphTarget(e) {
    return isHTMLElement(e.target.element) && e.target.element.classList.contains(agentFeedbackHoverGlyphClassName);
  }
  _ensureWidget() {
    if (!this._widget) {
      this._widget = new AgentFeedbackInputWidget(this._editor);
      this._store.add(this._widget.onDidTriggerAdd(() => this._addFeedback()));
      this._store.add(this._widget.onDidTriggerAddAndSubmit(() => this._addFeedbackAndSubmit()));
      this._editor.addOverlayWidget(this._widget);
    }
    return this._widget;
  }
  _onModelChanged() {
    this._hide();
    this._clearHoverGlyph();
    this._suppressSelectionChangeOnce = false;
    this._sessionResource = void 0;
    this._getSessionForModel();
  }
  _onEditorMouseMove(e) {
    if (this._visible || this._hasInputText()) {
      this._clearHoverGlyph();
      return;
    }
    this._updateHoverGlyph(e.target.position?.lineNumber);
  }
  _updateHoverGlyph(lineNumber) {
    const model = this._editor.getModel();
    if (lineNumber === void 0 || !model || lineNumber < 1 || lineNumber > model.getLineCount()) {
      this._clearHoverGlyph();
      return;
    }
    if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
      this._clearHoverGlyph();
      return;
    }
    if (this._hoverLineNumber === lineNumber) {
      return;
    }
    const sessionResource = this._getSessionForModel();
    if (!sessionResource) {
      this._clearHoverGlyph();
      return;
    }
    if (this._lineHasExistingFeedback(sessionResource, model.uri, lineNumber)) {
      this._clearHoverGlyph();
      return;
    }
    this._hoverLineNumber = lineNumber;
    this._hoverDecorations.set([{
      range: new Range(lineNumber, 1, lineNumber, 1),
      options: {
        description: "agent-feedback-hover-glyph",
        lineNumberClassName: `${agentFeedbackHoverGlyphClassName} line-hover`,
        lineNumberHoverMessage: new MarkdownString(localize("agentFeedback.add", "Add Feedback"))
      }
    }]);
  }
  _lineHasExistingFeedback(sessionResource, resourceUri, lineNumber) {
    return this._agentFeedbackService.getFeedback(sessionResource).some((feedback) => isEqual(feedback.resourceUri, resourceUri) && lineNumber >= feedback.range.startLineNumber && lineNumber <= feedback.range.endLineNumber);
  }
  _clearHoverGlyph() {
    if (this._hoverLineNumber === void 0) {
      return;
    }
    this._hoverLineNumber = void 0;
    this._hoverDecorations.clear();
  }
  _onSelectionChanged() {
    if (this._suppressSelectionChangeOnce) {
      this._suppressSelectionChangeOnce = false;
      return;
    }
    if (this._mouseDown || !this._editor.hasTextFocus()) {
      return;
    }
    if (this._visible && this._hasInputText()) {
      return;
    }
    const selection = this._editor.getSelection();
    if (!selection || selection.isEmpty()) {
      this._autoHide();
      return;
    }
    const model = this._editor.getModel();
    if (!model) {
      this._autoHide();
      return;
    }
    const sessionResource = this._getSessionForModel();
    if (!sessionResource) {
      this._autoHide();
      return;
    }
    this._sessionResource = sessionResource;
    const preferBelow = selection.getDirection() === SelectionDirection.LTR;
    const anchorPosition = preferBelow ? selection.getEndPosition() : selection.getStartPosition();
    this._show(Range.lift(selection), anchorPosition, preferBelow);
  }
  _show(range, anchorPosition, preferBelow, focusInput = false) {
    const widget = this._ensureWidget();
    this._clearHoverGlyph();
    if (!this._visible) {
      this._visible = true;
      this._registerWidgetListeners(widget);
    }
    this._pinnedRange = range;
    this._anchorPosition = anchorPosition;
    this._preferBelow = preferBelow;
    widget.setPlaceholder(this._getPlaceholder());
    widget.clearInput();
    widget.show();
    this._updatePosition();
    if (focusInput) {
      widget.inputElement.focus();
    }
  }
  _getPlaceholder() {
    const model = this._editor.getModel();
    const hasChanges = !!model && (this._agentFeedbackService.getSessionForFile(model.uri)?.changes.get().length ?? 0) > 0;
    return hasChanges ? localize("agentFeedback.addFeedback", "Add Feedback") : localize("agentFeedback.addComment", "Add Comment");
  }
  _hide() {
    if (!this._visible) {
      return;
    }
    this._visible = false;
    this._pinnedRange = void 0;
    this._anchorPosition = void 0;
    this._widgetListeners.clear();
    if (this._widget) {
      this._widget.hide();
      this._widget.setPosition(null);
      this._widget.clearInput();
    }
  }
  _hasInputText() {
    return !!this._widget && this._widget.inputElement.value.trim().length > 0;
  }
  showAtCurrentLine(focusInput = true) {
    const position = this._editor.getPosition();
    if (!position) {
      return;
    }
    this._showAtLine(position.lineNumber, focusInput);
  }
  _showAtLine(lineNumber, focusInput) {
    if (this._visible && this._hasInputText()) {
      this.focusInput();
      return;
    }
    const model = this._editor.getModel();
    if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) {
      this._autoHide();
      return;
    }
    const sessionResource = this._getSessionForModel();
    if (!sessionResource) {
      this._autoHide();
      return;
    }
    this._sessionResource = sessionResource;
    this._show(new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)), new Position(lineNumber, 1), true, focusInput);
  }
  /**
   * Select the whole line as a result of clicking the gutter glyph. Selecting
   * the line triggers the selection-change handler which opens the feedback
   * input automatically, so we don't open it directly here. Empty lines are
   * ignored as there is nothing to give feedback on.
   */
  _selectLine(lineNumber) {
    if (this._visible && this._hasInputText()) {
      this.focusInput();
      return;
    }
    const model = this._editor.getModel();
    if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) {
      return;
    }
    if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
      return;
    }
    this._editor.setSelection(new Selection(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)));
    this._editor.focus();
    this.focusInput();
  }
  _getSessionForModel() {
    const model = this._editor.getModel();
    if (!model || !this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled)) {
      this._hasAgentFeedbackSessionContext.set(false);
      this._sessionResource = void 0;
      return void 0;
    }
    const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(model.uri);
    this._hasAgentFeedbackSessionContext.set(!!sessionResource);
    this._sessionResource = sessionResource;
    return sessionResource;
  }
  /**
   * Hide the widget unless the user has typed text. When text is present the
   * widget is preserved so the user does not lose their in-progress feedback;
   * they can close it explicitly via Esc.
   */
  _autoHide() {
    if (this._hasInputText()) {
      return;
    }
    this._hide();
  }
  _registerWidgetListeners(widget) {
    this._widgetListeners.clear();
    const editorDomNode = this._editor.getDomNode();
    if (editorDomNode) {
      this._widgetListeners.add(addStandardDisposableListener(editorDomNode, "keydown", (e) => {
        if (!this._visible) {
          return;
        }
        if (!this._editor.hasTextFocus()) {
          return;
        }
        if (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta) {
          return;
        }
        if (e.keyCode === KeyCode.Escape) {
          this._hide();
          this._editor.focus();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.keyCode === KeyCode.KeyI) {
          e.preventDefault();
          e.stopPropagation();
          widget.inputElement.focus();
          return;
        }
        if (e.ctrlKey || e.altKey || e.metaKey) {
          return;
        }
        if (e.keyCode === KeyCode.UpArrow || e.keyCode === KeyCode.DownArrow || e.keyCode === KeyCode.LeftArrow || e.keyCode === KeyCode.RightArrow) {
          return;
        }
        if (!this._editor.getOption(EditorOption.readOnly)) {
          return;
        }
        if (getWindow(widget.inputElement).document.activeElement !== widget.inputElement) {
          widget.inputElement.focus();
        }
      }));
    }
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "keydown", (e) => {
      if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._hide();
        this._editor.focus();
        return;
      }
      if (e.keyCode === KeyCode.Enter && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this._addFeedbackAndSubmit();
        return;
      }
      if (e.keyCode === KeyCode.Enter) {
        e.preventDefault();
        e.stopPropagation();
        this._addFeedback();
        return;
      }
    }));
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "keypress", (e) => {
      e.stopPropagation();
    }));
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "input", () => {
      widget.autoSize();
      widget.updateActionEnabled();
      this._updatePosition();
    }));
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "blur", () => {
      const win = getWindow(widget.inputElement);
      win.setTimeout(() => {
        if (!this._visible) {
          return;
        }
        if (this._editor.hasWidgetFocus()) {
          return;
        }
        this._autoHide();
      }, 0);
    }));
  }
  focusInput() {
    if (this._visible && this._widget) {
      this._widget.inputElement.focus();
    }
  }
  _hideAndRefocusEditor() {
    this._suppressSelectionChangeOnce = true;
    this._hide();
    this._editor.focus();
  }
  _addFeedback() {
    if (!this._widget) {
      return false;
    }
    const text = this._widget.inputElement.value.trim();
    if (!text) {
      return false;
    }
    const range = this._pinnedRange ?? this._editor.getSelection();
    const model = this._editor.getModel();
    if (!range || !model || !this._sessionResource) {
      return false;
    }
    this._agentFeedbackService.addFeedback(this._sessionResource, model.uri, range, text, void 0, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, range));
    this._hideAndRefocusEditor();
    return true;
  }
  _addFeedbackAndSubmit() {
    if (!this._widget) {
      return;
    }
    const text = this._widget.inputElement.value.trim();
    if (!text) {
      return;
    }
    const range = this._pinnedRange ?? this._editor.getSelection();
    const model = this._editor.getModel();
    if (!range || !model || !this._sessionResource) {
      return;
    }
    const sessionResource = this._sessionResource;
    this._hideAndRefocusEditor();
    this._agentFeedbackService.addFeedbackAndSubmit(sessionResource, model.uri, range, text, void 0, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, range));
  }
  _updatePosition() {
    if (!this._widget || !this._visible) {
      return;
    }
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const layoutInfo = this._editor.getLayoutInfo();
    const widgetDom = this._widget.getDomNode();
    const widgetHeight = widgetDom.offsetHeight || 30;
    const widgetWidth = widgetDom.offsetWidth || 150;
    const target = this._getPositioningTarget();
    if (!target) {
      this._autoHide();
      return;
    }
    const scrolledPosition = this._editor.getScrolledVisiblePosition(target.anchorPosition);
    if (!scrolledPosition) {
      this._widget.setPosition(null);
      return;
    }
    let top;
    if (target.preferBelow) {
      top = scrolledPosition.top + lineHeight;
      if (top + widgetHeight > layoutInfo.height) {
        top = scrolledPosition.top - widgetHeight;
      }
    } else {
      top = scrolledPosition.top - widgetHeight;
      if (top < 0) {
        top = scrolledPosition.top + lineHeight;
      }
    }
    top = Math.max(0, Math.min(top, layoutInfo.height - widgetHeight));
    const minLeft = layoutInfo.contentLeft;
    const maxLeft = Math.max(minLeft, layoutInfo.width - widgetWidth);
    const left = Math.max(minLeft, Math.min(scrolledPosition.left, maxLeft));
    this._widget.setPosition({ preference: { top, left } });
  }
  _getPositioningTarget() {
    if (this._pinnedRange && this._anchorPosition) {
      return { anchorPosition: this._anchorPosition, preferBelow: this._preferBelow };
    }
    const selection = this._editor.getSelection();
    if (!selection || selection.isEmpty()) {
      return void 0;
    }
    const preferBelow = selection.getDirection() === SelectionDirection.LTR;
    return {
      anchorPosition: preferBelow ? selection.getEndPosition() : selection.getStartPosition(),
      preferBelow
    };
  }
  dispose() {
    if (this._widget) {
      this._editor.removeOverlayWidget(this._widget);
      this._widget.dispose();
      this._widget = void 0;
    }
    super.dispose();
  }
};
AgentFeedbackEditorInputContribution.ID = "agentFeedback.editorInputContribution";
AgentFeedbackEditorInputContribution = __decorateClass([
  __decorateParam(1, IAgentFeedbackService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, IContextKeyService)
], AgentFeedbackEditorInputContribution);
class AddFeedbackAtCurrentLineAction extends Action2 {
  constructor() {
    super({
      id: addFeedbackAtCurrentLineActionId,
      title: localize2("agentFeedback.addAtCurrentLine", "Add Feedback at Current Line"),
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasAgentFeedbackSessionForEditor),
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, hasAgentFeedbackSessionForEditor)
      }
    });
  }
  run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getFocusedCodeEditor() ?? codeEditorService.getActiveCodeEditor();
    const contribution = editor?.getContribution(AgentFeedbackEditorInputContribution.ID);
    contribution?.showAtCurrentLine(true);
  }
}
registerAction2(AddFeedbackAtCurrentLineAction);
registerEditorContribution(AgentFeedbackEditorInputContribution.ID, AgentFeedbackEditorInputContribution, EditorContributionInstantiation.Eventually);
export {
  AgentFeedbackEditorInputContribution,
  AgentFeedbackInputWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcYnJvd3NlclxcYWdlbnRGZWVkYmFja0VkaXRvcklucHV0Q29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2FnZW50RmVlZGJhY2tFZGl0b3JJbnB1dC5jc3MnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElFZGl0b3JNb3VzZUV2ZW50LCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiwgU2VsZWN0aW9uRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgZ2V0V2luZG93LCBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudEZlZWRiYWNrQ29udGV4dCB9IGZyb20gJy4vYWdlbnRGZWVkYmFja0VkaXRvclV0aWxzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgRmVlZGJhY2tJbnB1dFdpZGdldCB9IGZyb20gJy4vZmVlZGJhY2tJbnB1dFdpZGdldC5qcyc7XG5cbmNvbnN0IGFkZEZlZWRiYWNrQXRDdXJyZW50TGluZUFjdGlvbklkID0gJ2FnZW50RmVlZGJhY2tFZGl0b3IuYWN0aW9uLmFkZEF0Q3VycmVudExpbmUnO1xuY29uc3QgYWdlbnRGZWVkYmFja0hvdmVyR2x5cGhDbGFzc05hbWUgPSAnYWdlbnQtZmVlZGJhY2stZ2x5cGgnO1xuY29uc3QgaGFzQWdlbnRGZWVkYmFja1Nlc3Npb25Gb3JFZGl0b3IgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWdlbnRGZWVkYmFja0VkaXRvci5oYXNTZXNzaW9uJywgZmFsc2UpO1xuXG4vKipcbiAqIFRoZSBpbmxpbmUgXCJBZGQgRmVlZGJhY2tcIiBpbnB1dCBzaG93biBpbiB0aGUgZWRpdG9yIHdoZW4gdGhlIHVzZXIgc2VsZWN0cyBhXG4gKiByYW5nZSB0byBjb21tZW50IG9uLiBFeHBvcnRlZCBzbyBpdCBjYW4gYmUgcmVuZGVyZWQgaW4gYSBjb21wb25lbnQgZml4dHVyZTtcbiAqIGl0IG9ubHkgZGVwZW5kcyBvbiB7QGxpbmsgSUNvZGVFZGl0b3J9IGZvciBpdHMgbGF5b3V0IGdlb21ldHJ5LiBXcmFwcyB0aGVcbiAqIHJldXNhYmxlIHtAbGluayBGZWVkYmFja0lucHV0V2lkZ2V0fSBjb3JlIGFzIGFuIHtAbGluayBJT3ZlcmxheVdpZGdldH0uXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEZlZWRiYWNrSW5wdXRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9JRCA9ICdhZ2VudEZlZWRiYWNrLmlucHV0V2lkZ2V0JztcblxuXHRyZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29yZTogRmVlZGJhY2tJbnB1dFdpZGdldDtcblx0cHJpdmF0ZSBfcG9zaXRpb246IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsID0gbnVsbDtcblxuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJBZGQ6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJBZGRBbmRTdWJtaXQ6IEV2ZW50PHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBGZWVkYmFja0lucHV0V2lkZ2V0KHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5hZGRGZWVkYmFjaycsIFwiQWRkIEZlZWRiYWNrXCIpLFxuXHRcdFx0Z2V0TWF4Q29udGVudFdpZHRoOiAoKSA9PiB0aGlzLl9jb21wdXRlQ29udGVudFdpZHRoKCksXG5cdFx0XHRwcmltYXJ5QWN0aW9uOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5hZGQnLCBcIkFkZCBGZWVkYmFja1wiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWw6IGxvY2FsaXplKCdlbnRlcicsIFwiRW50ZXJcIiksXG5cdFx0XHR9LFxuXHRcdFx0c2Vjb25kYXJ5QWN0aW9uOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5hZGRBbmRTdWJtaXQnLCBcIkFkZCBGZWVkYmFjayBhbmQgU3VibWl0XCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNlbmQsXG5cdFx0XHRcdGtleWJpbmRpbmdMYWJlbDogbG9jYWxpemUoJ2FsdEVudGVyJywgXCJBbHQrRW50ZXJcIiksXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0aGlzLm9uRGlkVHJpZ2dlckFkZCA9IHRoaXMuX2NvcmUub25EaWRUcmlnZ2VyUHJpbWFyeTtcblx0XHR0aGlzLm9uRGlkVHJpZ2dlckFkZEFuZFN1Ym1pdCA9IHRoaXMuX2NvcmUub25EaWRUcmlnZ2VyU2Vjb25kYXJ5O1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQWdlbnRGZWVkYmFja0lucHV0V2lkZ2V0Ll9JRDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jb3JlLmRvbU5vZGU7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bvc2l0aW9uO1xuXHR9XG5cblx0Z2V0IGlucHV0RWxlbWVudCgpOiBIVE1MVGV4dEFyZWFFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29yZS5pbnB1dEVsZW1lbnQ7XG5cdH1cblxuXHRzZXRQb3NpdGlvbihwb3NpdGlvbjogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9wb3NpdGlvbiA9IHBvc2l0aW9uO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3JlLnNob3coKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29yZS5oaWRlKCk7XG5cdH1cblxuXHRjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvcmUuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0c2V0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvcmUuc2V0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXIpO1xuXHR9XG5cblx0YXV0b1NpemUoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29yZS5hdXRvU2l6ZSgpO1xuXHR9XG5cblx0dXBkYXRlQWN0aW9uRW5hYmxlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3JlLnVwZGF0ZUFjdGlvbkVuYWJsZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVDb250ZW50V2lkdGgoKTogbnVtYmVyIHtcblx0XHQvLyBUaGUgd2lkZ2V0IHN0aWNrcyB0byB0aGUgZWRpdG9yJ3MgY29udGVudCBsZWZ0IGVkZ2UsIHNvIHRoZSBzcGFjZSBpdFxuXHRcdC8vIGhhcyBhdmFpbGFibGUgaXMgdGhlIGNvbnRlbnQgYXJlYSB3aWR0aCAodG8gdGhlIHJpZ2h0IG9mIHRoZSBsaW5lXG5cdFx0Ly8gbnVtYmVycy9nbHlwaCBtYXJnaW4pLCBub3QgdGhlIGZ1bGwgZWRpdG9yIHdpZHRoLlxuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHJldHVybiBNYXRoLm1heCgwLCBsYXlvdXRJbmZvLndpZHRoIC0gbGF5b3V0SW5mby5jb250ZW50TGVmdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50RmVlZGJhY2tFZGl0b3JJbnB1dENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnYWdlbnRGZWVkYmFjay5lZGl0b3JJbnB1dENvbnRyaWJ1dGlvbic7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0OiBBZ2VudEZlZWRiYWNrSW5wdXRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Zpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbW91c2VEb3duID0gZmFsc2U7XG5cdHByaXZhdGUgX3N1cHByZXNzU2VsZWN0aW9uQ2hhbmdlT25jZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGlubmVkUmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hbmNob3JQb3NpdGlvbjogUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3ByZWZlckJlbG93ID0gdHJ1ZTtcblx0cHJpdmF0ZSBfaG92ZXJMaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0FnZW50RmVlZGJhY2tTZXNzaW9uQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldExpc3RlbmVycyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElBZ2VudEZlZWRiYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEZlZWRiYWNrU2VydmljZTogSUFnZW50RmVlZGJhY2tTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9ob3ZlckRlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHRoaXMuX2hvdmVyRGVjb3JhdGlvbnMuY2xlYXIoKSB9KTtcblx0XHR0aGlzLl9oYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkNvbnRleHQgPSBoYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkZvckVkaXRvci5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoKSA9PiB0aGlzLl9vblNlbGVjdGlvbkNoYW5nZWQoKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLl9vbk1vZGVsQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZFNjcm9sbENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVQb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl92aXNpYmxlICYmIHRoaXMuX3dpZGdldCkge1xuXHRcdFx0XHQvLyBUaGUgZWRpdG9yIHJlc2l6ZWQ6IHJlLWNsYW1wIHRoZSBpbnB1dCB3aWR0aCB0byB0aGUgbmV3IGVkaXRvclxuXHRcdFx0XHQvLyB3aWR0aCBhbmQgcmVwb3NpdGlvbiBpdC5cblx0XHRcdFx0dGhpcy5fd2lkZ2V0LmF1dG9TaXplKCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVBvc2l0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZU1vdmUoZSA9PiB0aGlzLl9vbkVkaXRvck1vdXNlTW92ZShlKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZUxlYXZlKCgpID0+IHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbk1vdXNlRG93bigoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzV2lkZ2V0VGFyZ2V0KGUuZXZlbnQudGFyZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faXNIb3ZlckdseXBoVGFyZ2V0KGUpKSB7XG5cdFx0XHRcdGUuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5ldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGUudGFyZ2V0LnBvc2l0aW9uPy5saW5lTnVtYmVyO1xuXHRcdFx0XHRpZiAobGluZU51bWJlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0TGluZShsaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tb3VzZURvd24gPSB0cnVlO1xuXHRcdFx0dGhpcy5fYXV0b0hpZGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbk1vdXNlVXAoKGUpID0+IHtcblx0XHRcdHRoaXMuX21vdXNlRG93biA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMuX2lzV2lkZ2V0VGFyZ2V0KGUuZXZlbnQudGFyZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faXNIb3ZlckdseXBoVGFyZ2V0KGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uU2VsZWN0aW9uQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3Zpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRGVmZXIgc28gZm9jdXMgaGFzIHNldHRsZWQgdG8gdGhlIG5ldyB0YXJnZXRcblx0XHRcdGdldFdpbmRvdyh0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpISkuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5faXNXaWRnZXRUYXJnZXQoZ2V0V2luZG93KHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkhKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0fSwgMCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4gdGhpcy5fb25TZWxlY3Rpb25DaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2Uub25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gdGhpcy5fZ2V0U2Vzc2lvbkZvck1vZGVsKCk7XG5cdFx0XHRpZiAodGhpcy5fdmlzaWJsZSAmJiB0aGlzLl93aWRnZXQpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRQbGFjZWhvbGRlcih0aGlzLl9nZXRQbGFjZWhvbGRlcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9nZXRTZXNzaW9uRm9yTW9kZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzV2lkZ2V0VGFyZ2V0KHRhcmdldDogRXZlbnRUYXJnZXQgfCBFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3dpZGdldCAmJiAhIXRhcmdldCAmJiB0aGlzLl93aWRnZXQuZ2V0RG9tTm9kZSgpLmNvbnRhaW5zKHRhcmdldCBhcyBOb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSG92ZXJHbHlwaFRhcmdldChlOiBJRWRpdG9yTW91c2VFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0hUTUxFbGVtZW50KGUudGFyZ2V0LmVsZW1lbnQpICYmIGUudGFyZ2V0LmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKGFnZW50RmVlZGJhY2tIb3ZlckdseXBoQ2xhc3NOYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVdpZGdldCgpOiBBZ2VudEZlZWRiYWNrSW5wdXRXaWRnZXQge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl93aWRnZXQgPSBuZXcgQWdlbnRGZWVkYmFja0lucHV0V2lkZ2V0KHRoaXMuX2VkaXRvcik7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fd2lkZ2V0Lm9uRGlkVHJpZ2dlckFkZCgoKSA9PiB0aGlzLl9hZGRGZWVkYmFjaygpKSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fd2lkZ2V0Lm9uRGlkVHJpZ2dlckFkZEFuZFN1Ym1pdCgoKSA9PiB0aGlzLl9hZGRGZWVkYmFja0FuZFN1Ym1pdCgpKSk7XG5cdFx0XHR0aGlzLl9lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh0aGlzLl93aWRnZXQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Nb2RlbENoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faGlkZSgpO1xuXHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXHRcdHRoaXMuX3N1cHByZXNzU2VsZWN0aW9uQ2hhbmdlT25jZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9nZXRTZXNzaW9uRm9yTW9kZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRWRpdG9yTW91c2VNb3ZlKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Zpc2libGUgfHwgdGhpcy5faGFzSW5wdXRUZXh0KCkpIHtcblx0XHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVIb3ZlckdseXBoKGUudGFyZ2V0LnBvc2l0aW9uPy5saW5lTnVtYmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUhvdmVyR2x5cGgobGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobGluZU51bWJlciA9PT0gdW5kZWZpbmVkIHx8ICFtb2RlbCB8fCBsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IG9mZmVyIGZlZWRiYWNrIG9uIGVtcHR5IGxpbmVzIChub3RoaW5nIHRvIGNvbW1lbnQgb24pLlxuXHRcdGlmIChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpID09PSAwKSB7XG5cdFx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faG92ZXJMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fZ2V0U2Vzc2lvbkZvck1vZGVsKCk7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHJlbmRlciB0aGUgYWRkIGdseXBoIG9uIGxpbmVzIHRoYXQgYWxyZWFkeSBoYXZlIGEgZmVlZGJhY2tcblx0XHQvLyBjb21tZW50LCBvdGhlcndpc2UgdGhlIGFkZCBhZmZvcmRhbmNlIG92ZXJsYXBzIHRoZSBleGlzdGluZyBjb21tZW50J3Ncblx0XHQvLyBndXR0ZXIgZGVjb3JhdGlvbiBhbmQgYm90aCBiZWNvbWUgY2xpY2thYmxlIG9uIHRoZSBzYW1lIHNwb3QuXG5cdFx0aWYgKHRoaXMuX2xpbmVIYXNFeGlzdGluZ0ZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSwgbW9kZWwudXJpLCBsaW5lTnVtYmVyKSkge1xuXHRcdFx0dGhpcy5fY2xlYXJIb3ZlckdseXBoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faG92ZXJMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHR0aGlzLl9ob3ZlckRlY29yYXRpb25zLnNldChbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCAxKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdhZ2VudC1mZWVkYmFjay1ob3Zlci1nbHlwaCcsXG5cdFx0XHRcdGxpbmVOdW1iZXJDbGFzc05hbWU6IGAke2FnZW50RmVlZGJhY2tIb3ZlckdseXBoQ2xhc3NOYW1lfSBsaW5lLWhvdmVyYCxcblx0XHRcdFx0bGluZU51bWJlckhvdmVyTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLmFkZCcsIFwiQWRkIEZlZWRiYWNrXCIpKSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGluZUhhc0V4aXN0aW5nRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIHJlc291cmNlVXJpOiBVUkksIGxpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpLnNvbWUoZmVlZGJhY2sgPT5cblx0XHRcdGlzRXF1YWwoZmVlZGJhY2sucmVzb3VyY2VVcmksIHJlc291cmNlVXJpKVxuXHRcdFx0JiYgbGluZU51bWJlciA+PSBmZWVkYmFjay5yYW5nZS5zdGFydExpbmVOdW1iZXJcblx0XHRcdCYmIGxpbmVOdW1iZXIgPD0gZmVlZGJhY2sucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckhvdmVyR2x5cGgoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hvdmVyTGluZU51bWJlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hvdmVyTGluZU51bWJlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ob3ZlckRlY29yYXRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblNlbGVjdGlvbkNoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N1cHByZXNzU2VsZWN0aW9uQ2hhbmdlT25jZSkge1xuXHRcdFx0dGhpcy5fc3VwcHJlc3NTZWxlY3Rpb25DaGFuZ2VPbmNlID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21vdXNlRG93biB8fCAhdGhpcy5fZWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHdpZGdldCBpcyBvcGVuIGFuZCB0aGUgdXNlciBoYXMgdHlwZWQgdGV4dCwgZnJlZXplIGl0cyBzdGF0ZS5cblx0XHQvLyBBdXRvLWhpZGUgYW5kIGF1dG8tcmVwb3NpdGlvbiBhcmUgc3VwcHJlc3NlZDsgdGhlIHVzZXIgbXVzdCBleHBsaWNpdGx5XG5cdFx0Ly8gY2xvc2UgdGhlIHdpZGdldCB2aWEgRXNjLlxuXHRcdGlmICh0aGlzLl92aXNpYmxlICYmIHRoaXMuX2hhc0lucHV0VGV4dCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghc2VsZWN0aW9uIHx8IHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHRoaXMuX2F1dG9IaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX2dldFNlc3Npb25Gb3JNb2RlbCgpO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBwcmVmZXJCZWxvdyA9IHNlbGVjdGlvbi5nZXREaXJlY3Rpb24oKSA9PT0gU2VsZWN0aW9uRGlyZWN0aW9uLkxUUjtcblx0XHRjb25zdCBhbmNob3JQb3NpdGlvbiA9IHByZWZlckJlbG93ID8gc2VsZWN0aW9uLmdldEVuZFBvc2l0aW9uKCkgOiBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdHRoaXMuX3Nob3coUmFuZ2UubGlmdChzZWxlY3Rpb24pLCBhbmNob3JQb3NpdGlvbiwgcHJlZmVyQmVsb3cpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdyhyYW5nZTogUmFuZ2UsIGFuY2hvclBvc2l0aW9uOiBQb3NpdGlvbiwgcHJlZmVyQmVsb3c6IGJvb2xlYW4sIGZvY3VzSW5wdXQgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2Vuc3VyZVdpZGdldCgpO1xuXHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyV2lkZ2V0TGlzdGVuZXJzKHdpZGdldCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGlubmVkUmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLl9hbmNob3JQb3NpdGlvbiA9IGFuY2hvclBvc2l0aW9uO1xuXHRcdHRoaXMuX3ByZWZlckJlbG93ID0gcHJlZmVyQmVsb3c7XG5cdFx0d2lkZ2V0LnNldFBsYWNlaG9sZGVyKHRoaXMuX2dldFBsYWNlaG9sZGVyKCkpO1xuXHRcdHdpZGdldC5jbGVhcklucHV0KCk7XG5cdFx0d2lkZ2V0LnNob3coKTtcblx0XHR0aGlzLl91cGRhdGVQb3NpdGlvbigpO1xuXHRcdGlmIChmb2N1c0lucHV0KSB7XG5cdFx0XHR3aWRnZXQuaW5wdXRFbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UGxhY2Vob2xkZXIoKTogc3RyaW5nIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGhhc0NoYW5nZXMgPSAhIW1vZGVsICYmICh0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5nZXRTZXNzaW9uRm9yRmlsZShtb2RlbC51cmkpPy5jaGFuZ2VzLmdldCgpLmxlbmd0aCA/PyAwKSA+IDA7XG5cdFx0cmV0dXJuIGhhc0NoYW5nZXNcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suYWRkRmVlZGJhY2snLCBcIkFkZCBGZWVkYmFja1wiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5hZGRDb21tZW50JywgXCJBZGQgQ29tbWVudFwiKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlzaWJsZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3Bpbm5lZFJhbmdlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FuY2hvclBvc2l0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3dpZGdldExpc3RlbmVycy5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMuX3dpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmhpZGUoKTtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRQb3NpdGlvbihudWxsKTtcblx0XHRcdHRoaXMuX3dpZGdldC5jbGVhcklucHV0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzSW5wdXRUZXh0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3dpZGdldCAmJiB0aGlzLl93aWRnZXQuaW5wdXRFbGVtZW50LnZhbHVlLnRyaW0oKS5sZW5ndGggPiAwO1xuXHR9XG5cblx0c2hvd0F0Q3VycmVudExpbmUoZm9jdXNJbnB1dCA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2hvd0F0TGluZShwb3NpdGlvbi5saW5lTnVtYmVyLCBmb2N1c0lucHV0KTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dBdExpbmUobGluZU51bWJlcjogbnVtYmVyLCBmb2N1c0lucHV0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Zpc2libGUgJiYgdGhpcy5faGFzSW5wdXRUZXh0KCkpIHtcblx0XHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCBsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHRoaXMuX2F1dG9IaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fZ2V0U2Vzc2lvbkZvck1vZGVsKCk7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuX2F1dG9IaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuX3Nob3cobmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSksIHRydWUsIGZvY3VzSW5wdXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbGVjdCB0aGUgd2hvbGUgbGluZSBhcyBhIHJlc3VsdCBvZiBjbGlja2luZyB0aGUgZ3V0dGVyIGdseXBoLiBTZWxlY3Rpbmdcblx0ICogdGhlIGxpbmUgdHJpZ2dlcnMgdGhlIHNlbGVjdGlvbi1jaGFuZ2UgaGFuZGxlciB3aGljaCBvcGVucyB0aGUgZmVlZGJhY2tcblx0ICogaW5wdXQgYXV0b21hdGljYWxseSwgc28gd2UgZG9uJ3Qgb3BlbiBpdCBkaXJlY3RseSBoZXJlLiBFbXB0eSBsaW5lcyBhcmVcblx0ICogaWdub3JlZCBhcyB0aGVyZSBpcyBub3RoaW5nIHRvIGdpdmUgZmVlZGJhY2sgb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zZWxlY3RMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlICYmIHRoaXMuX2hhc0lucHV0VGV4dCgpKSB7XG5cdFx0XHR0aGlzLmZvY3VzSW5wdXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwgfHwgbGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcikgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIHNlbGVjdGlvbiBiZWZvcmUgZm9jdXNpbmc6IHRoZSBzZWxlY3Rpb24gY2hhbmdlIHdoaWxlIHRoZVxuXHRcdC8vIGVkaXRvciBpcyB1bmZvY3VzZWQgaXMgaWdub3JlZCwgdGhlbiBmb2N1c2luZyByZS1ldmFsdWF0ZXMgdGhlXG5cdFx0Ly8gc2VsZWN0aW9uIGFuZCBvcGVucyB0aGUgaW5wdXQgZm9yIHRoZSBmcmVzaGx5IHNlbGVjdGVkIGxpbmUuXG5cdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpKTtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblxuXHRcdC8vIEZvY3VzaW5nIHRoZSBlZGl0b3Igc3luY2hyb25vdXNseSBvcGVucyB0aGUgaW5wdXQgdmlhIHRoZVxuXHRcdC8vIHNlbGVjdGlvbi1jaGFuZ2UgaGFuZGxlciwgc28gbW92ZSBmb2N1cyBpbnRvIGl0IG5vdyB0aGF0IGl0IGlzXG5cdFx0Ly8gdmlzaWJsZS4gVGhpcyBsZXRzIHRoZSB1c2VyIHR5cGUgZmVlZGJhY2sgaW1tZWRpYXRlbHkgYWZ0ZXIgY2xpY2tpbmdcblx0XHQvLyB0aGUgZ3V0dGVyIGdseXBoIHdpdGhvdXQgaGF2aW5nIHRvIGNsaWNrIHRoZSBpbnB1dCBmaXJzdC5cblx0XHR0aGlzLmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25Gb3JNb2RlbCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDaGF0Q29udGV4dEtleXMuZW5hYmxlZCkpIHtcblx0XHRcdHRoaXMuX2hhc0FnZW50RmVlZGJhY2tTZXNzaW9uQ29udGV4dC5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuZ2V0RmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UobW9kZWwudXJpKTtcblx0XHR0aGlzLl9oYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkNvbnRleHQuc2V0KCEhc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0cmV0dXJuIHNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlIHRoZSB3aWRnZXQgdW5sZXNzIHRoZSB1c2VyIGhhcyB0eXBlZCB0ZXh0LiBXaGVuIHRleHQgaXMgcHJlc2VudCB0aGVcblx0ICogd2lkZ2V0IGlzIHByZXNlcnZlZCBzbyB0aGUgdXNlciBkb2VzIG5vdCBsb3NlIHRoZWlyIGluLXByb2dyZXNzIGZlZWRiYWNrO1xuXHQgKiB0aGV5IGNhbiBjbG9zZSBpdCBleHBsaWNpdGx5IHZpYSBFc2MuXG5cdCAqL1xuXHRwcml2YXRlIF9hdXRvSGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzSW5wdXRUZXh0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGlkZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJXaWRnZXRMaXN0ZW5lcnMod2lkZ2V0OiBBZ2VudEZlZWRiYWNrSW5wdXRXaWRnZXQpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXRMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdC8vIExpc3RlbiBmb3Iga2V5ZG93biBvbiB0aGUgZWRpdG9yIGRvbSBub2RlIHRvIGRldGVjdCB3aGVuIHRoZSB1c2VyIHN0YXJ0cyB0eXBpbmdcblx0XHRjb25zdCBlZGl0b3JEb21Ob2RlID0gdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKTtcblx0XHRpZiAoZWRpdG9yRG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0TGlzdGVuZXJzLmFkZChhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihlZGl0b3JEb21Ob2RlLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3Zpc2libGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IHN0ZWFsIGZvY3VzIHdoZW4gdGhlIGVkaXRvciB0ZXh0IGFyZWEgaXRzZWxmIGlzIGZvY3VzZWQsXG5cdFx0XHRcdC8vIG5vdCB3aGVuIGFuIG92ZXJsYXkgd2lkZ2V0IChlLmcuIGZpbmQgd2lkZ2V0KSBoYXMgZm9jdXNcblx0XHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEb24ndCBmb2N1cyBpZiBhIG1vZGlmaWVyIGtleSBpcyBwcmVzc2VkIGFsb25lXG5cdFx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuQ3RybCB8fCBlLmtleUNvZGUgPT09IEtleUNvZGUuU2hpZnQgfHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLkFsdCB8fCBlLmtleUNvZGUgPT09IEtleUNvZGUuTWV0YSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERvbid0IGNhcHR1cmUgRXNjYXBlIGF0IHRoaXMgbGV2ZWwgLSBsZXQgaXQgZmFsbCB0aHJvdWdoIHRvIHRoZSBpbnB1dCBoYW5kbGVyIGlmIGZvY3VzZWRcblx0XHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Fc2NhcGUpIHtcblx0XHRcdFx0XHR0aGlzLl9oaWRlKCk7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ3RybCtJIC8gQ21kK0kgZXhwbGljaXRseSBmb2N1c2VzIHRoZSBmZWVkYmFjayBpbnB1dFxuXHRcdFx0XHRpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmIGUua2V5Q29kZSA9PT0gS2V5Q29kZS5LZXlJKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0d2lkZ2V0LmlucHV0RWxlbWVudC5mb2N1cygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERvbid0IGZvY3VzIGlmIGFueSBtb2RpZmllciBpcyBoZWxkIChrZXlib2FyZCBzaG9ydGN1dHMpXG5cdFx0XHRcdGlmIChlLmN0cmxLZXkgfHwgZS5hbHRLZXkgfHwgZS5tZXRhS2V5KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gS2VlcCBjYXJldC9uYXZpZ2F0aW9uIGtleXMgaW4gdGhlIGVkaXRvci4gT25seSBhY3R1YWwgdHlwaW5nIHNob3VsZCBtb3ZlIGZvY3VzLlxuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0ZS5rZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3dcblx0XHRcdFx0XHR8fCBlLmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93XG5cdFx0XHRcdFx0fHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLkxlZnRBcnJvd1xuXHRcdFx0XHRcdHx8IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93XG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9ubHkgYXV0by1mb2N1cyB0aGUgaW5wdXQgb24gdHlwaW5nIHdoZW4gdGhlIGRvY3VtZW50IGlzIHJlYWRvbmx5O1xuXHRcdFx0XHQvLyB3aGVuIGVkaXRhYmxlIHRoZSB1c2VyIG11c3QgY2xpY2sgb3IgdXNlIEN0cmwrSSB0byBmb2N1cy5cblx0XHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB0aGUgaW5wdXQgaXMgbm90IGZvY3VzZWQsIGZvY3VzIGl0IGFuZCBsZXQgdGhlIGtleXN0cm9rZSBnbyB0aHJvdWdoXG5cdFx0XHRcdGlmIChnZXRXaW5kb3cod2lkZ2V0LmlucHV0RWxlbWVudCkuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCAhPT0gd2lkZ2V0LmlucHV0RWxlbWVudCkge1xuXHRcdFx0XHRcdHdpZGdldC5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIExpc3RlbiBmb3Iga2V5ZG93biBvbiB0aGUgaW5wdXQgZWxlbWVudFxuXHRcdHRoaXMuX3dpZGdldExpc3RlbmVycy5hZGQoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIod2lkZ2V0LmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5faGlkZSgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmIGUuYWx0S2V5KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fYWRkRmVlZGJhY2tBbmRTdWJtaXQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fYWRkRmVlZGJhY2soKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN0b3AgcHJvcGFnYXRpb24gb2YgaW5wdXQgZXZlbnRzIHNvIHRoZSBlZGl0b3IgZG9lc24ndCBoYW5kbGUgdGhlbVxuXHRcdHRoaXMuX3dpZGdldExpc3RlbmVycy5hZGQoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIod2lkZ2V0LmlucHV0RWxlbWVudCwgJ2tleXByZXNzJywgZSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG8tc2l6ZSB0aGUgdGV4dGFyZWEgYXMgdGhlIHVzZXIgdHlwZXNcblx0XHR0aGlzLl93aWRnZXRMaXN0ZW5lcnMuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldC5pbnB1dEVsZW1lbnQsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdHdpZGdldC5hdXRvU2l6ZSgpO1xuXHRcdFx0d2lkZ2V0LnVwZGF0ZUFjdGlvbkVuYWJsZWQoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVBvc2l0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGlkZSB3aGVuIGlucHV0IGxvc2VzIGZvY3VzIHRvIHNvbWV0aGluZyBvdXRzaWRlIGJvdGggZWRpdG9yIGFuZCB3aWRnZXRcblx0XHR0aGlzLl93aWRnZXRMaXN0ZW5lcnMuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldC5pbnB1dEVsZW1lbnQsICdibHVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2luID0gZ2V0V2luZG93KHdpZGdldC5pbnB1dEVsZW1lbnQpO1xuXHRcdFx0d2luLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3Zpc2libGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2VkaXRvci5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2F1dG9IaWRlKCk7XG5cdFx0XHR9LCAwKTtcblx0XHR9KSk7XG5cdH1cblxuXHRmb2N1c0lucHV0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlICYmIHRoaXMuX3dpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmlucHV0RWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hpZGVBbmRSZWZvY3VzRWRpdG9yKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1cHByZXNzU2VsZWN0aW9uQ2hhbmdlT25jZSA9IHRydWU7XG5cdFx0dGhpcy5faGlkZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkRmVlZGJhY2soKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl93aWRnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fd2lkZ2V0LmlucHV0RWxlbWVudC52YWx1ZS50cmltKCk7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9waW5uZWRSYW5nZSA/PyB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIXJhbmdlIHx8ICFtb2RlbCB8fCAhdGhpcy5fc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWRkRmVlZGJhY2sodGhpcy5fc2Vzc2lvblJlc291cmNlLCBtb2RlbC51cmksIHJhbmdlLCB0ZXh0LCB1bmRlZmluZWQsIGNyZWF0ZUFnZW50RmVlZGJhY2tDb250ZXh0KHRoaXMuX2VkaXRvciwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UsIG1vZGVsLnVyaSwgcmFuZ2UpKTtcblx0XHR0aGlzLl9oaWRlQW5kUmVmb2N1c0VkaXRvcigpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkRmVlZGJhY2tBbmRTdWJtaXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl93aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fd2lkZ2V0LmlucHV0RWxlbWVudC52YWx1ZS50cmltKCk7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9waW5uZWRSYW5nZSA/PyB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIXJhbmdlIHx8ICFtb2RlbCB8fCAhdGhpcy5fc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuX2hpZGVBbmRSZWZvY3VzRWRpdG9yKCk7XG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWRkRmVlZGJhY2tBbmRTdWJtaXQoc2Vzc2lvblJlc291cmNlLCBtb2RlbC51cmksIHJhbmdlLCB0ZXh0LCB1bmRlZmluZWQsIGNyZWF0ZUFnZW50RmVlZGJhY2tDb250ZXh0KHRoaXMuX2VkaXRvciwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UsIG1vZGVsLnVyaSwgcmFuZ2UpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0IHx8ICF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IHdpZGdldERvbSA9IHRoaXMuX3dpZGdldC5nZXREb21Ob2RlKCk7XG5cdFx0Y29uc3Qgd2lkZ2V0SGVpZ2h0ID0gd2lkZ2V0RG9tLm9mZnNldEhlaWdodCB8fCAzMDtcblx0XHRjb25zdCB3aWRnZXRXaWR0aCA9IHdpZGdldERvbS5vZmZzZXRXaWR0aCB8fCAxNTA7XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9nZXRQb3NpdGlvbmluZ1RhcmdldCgpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbGVkUG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24odGFyZ2V0LmFuY2hvclBvc2l0aW9uKTtcblx0XHRpZiAoIXNjcm9sbGVkUG9zaXRpb24pIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRQb3NpdGlvbihudWxsKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb21wdXRlIHZlcnRpY2FsIHBvc2l0aW9uLCBmbGlwcGluZyBpZiBvdXQgb2YgYm91bmRzXG5cdFx0bGV0IHRvcDogbnVtYmVyO1xuXHRcdGlmICh0YXJnZXQucHJlZmVyQmVsb3cpIHtcblx0XHRcdC8vIEN1cnNvciBhdCBlbmQgKGJvdHRvbSkgb2Ygc2VsZWN0aW9uIFx1MjE5MiBwcmVmZXIgYmVsb3cgdGhlIGN1cnNvciBsaW5lXG5cdFx0XHR0b3AgPSBzY3JvbGxlZFBvc2l0aW9uLnRvcCArIGxpbmVIZWlnaHQ7XG5cdFx0XHRpZiAodG9wICsgd2lkZ2V0SGVpZ2h0ID4gbGF5b3V0SW5mby5oZWlnaHQpIHtcblx0XHRcdFx0Ly8gTm90IGVub3VnaCBzcGFjZSBiZWxvdyBcdTIxOTIgcGxhY2UgYWJvdmUgdGhlIGN1cnNvciBsaW5lXG5cdFx0XHRcdHRvcCA9IHNjcm9sbGVkUG9zaXRpb24udG9wIC0gd2lkZ2V0SGVpZ2h0O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDdXJzb3IgYXQgc3RhcnQgKHRvcCkgb2Ygc2VsZWN0aW9uIFx1MjE5MiBwcmVmZXIgYWJvdmUgdGhlIGN1cnNvciBsaW5lXG5cdFx0XHR0b3AgPSBzY3JvbGxlZFBvc2l0aW9uLnRvcCAtIHdpZGdldEhlaWdodDtcblx0XHRcdGlmICh0b3AgPCAwKSB7XG5cdFx0XHRcdC8vIE5vdCBlbm91Z2ggc3BhY2UgYWJvdmUgXHUyMTkyIHBsYWNlIGJlbG93IHRoZSBjdXJzb3IgbGluZVxuXHRcdFx0XHR0b3AgPSBzY3JvbGxlZFBvc2l0aW9uLnRvcCArIGxpbmVIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xhbXAgdmVydGljYWwgcG9zaXRpb24gd2l0aGluIGVkaXRvciBib3VuZHNcblx0XHR0b3AgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0b3AsIGxheW91dEluZm8uaGVpZ2h0IC0gd2lkZ2V0SGVpZ2h0KSk7XG5cblx0XHQvLyBDbGFtcCBob3Jpem9udGFsIHBvc2l0aW9uIHNvIHRoZSB3aWRnZXQgc3RheXMgd2l0aGluIHRoZSBlZGl0b3IgYW5kXG5cdFx0Ly8gbmV2ZXIgcmVuZGVycyBvbiB0b3Agb2YgdGhlIGxpbmUgbnVtYmVycy9nbHlwaCBtYXJnaW4gKGNvbnRlbnQgbGVmdCkuXG5cdFx0Ly8gV2hlbiB0aGUgZWRpdG9yIGlzIHNjcm9sbGVkIGhvcml6b250YWxseSB0aGUgY3Vyc29yIHBvc2l0aW9uIGNhbiBmYWxsXG5cdFx0Ly8gYmVoaW5kIHRoZSBjb250ZW50IGFyZWEsIHNvIHN0aWNrIHRoZSB3aWRnZXQgdG8gdGhlIGNvbnRlbnQgbGVmdCBlZGdlLlxuXHRcdC8vIEd1YXJkIHRoYXQgdGhlIGxlZnQgZWRnZSAoY29udGVudCBsZWZ0KSBuZXZlciBleGNlZWRzIHRoZSByaWdodC1tb3N0XG5cdFx0Ly8gdmFsaWQgcG9zaXRpb24sIG90aGVyd2lzZSB0aGUgd2lkZ2V0IHdvdWxkIG92ZXJmbG93IHRoZSBlZGl0b3IncyByaWdodFxuXHRcdC8vIGVkZ2Ugb24gdmVyeSBuYXJyb3cgZWRpdG9ycyBvciB3aXRoIGEgd2lkZSB3aWRnZXQuXG5cdFx0Y29uc3QgbWluTGVmdCA9IGxheW91dEluZm8uY29udGVudExlZnQ7XG5cdFx0Y29uc3QgbWF4TGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIGxheW91dEluZm8ud2lkdGggLSB3aWRnZXRXaWR0aCk7XG5cdFx0Y29uc3QgbGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIE1hdGgubWluKHNjcm9sbGVkUG9zaXRpb24ubGVmdCwgbWF4TGVmdCkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0LnNldFBvc2l0aW9uKHsgcHJlZmVyZW5jZTogeyB0b3AsIGxlZnQgfSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFBvc2l0aW9uaW5nVGFyZ2V0KCk6IHsgYW5jaG9yUG9zaXRpb246IFBvc2l0aW9uOyBwcmVmZXJCZWxvdzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcGlubmVkUmFuZ2UgJiYgdGhpcy5fYW5jaG9yUG9zaXRpb24pIHtcblx0XHRcdHJldHVybiB7IGFuY2hvclBvc2l0aW9uOiB0aGlzLl9hbmNob3JQb3NpdGlvbiwgcHJlZmVyQmVsb3c6IHRoaXMuX3ByZWZlckJlbG93IH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmICghc2VsZWN0aW9uIHx8IHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZmVyQmVsb3cgPSBzZWxlY3Rpb24uZ2V0RGlyZWN0aW9uKCkgPT09IFNlbGVjdGlvbkRpcmVjdGlvbi5MVFI7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFuY2hvclBvc2l0aW9uOiBwcmVmZXJCZWxvdyA/IHNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpIDogc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSxcblx0XHRcdHByZWZlckJlbG93LFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93aWRnZXQpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMuX3dpZGdldCk7XG5cdFx0XHR0aGlzLl93aWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQWRkRmVlZGJhY2tBdEN1cnJlbnRMaW5lQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGFkZEZlZWRiYWNrQXRDdXJyZW50TGluZUFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRGZWVkYmFjay5hZGRBdEN1cnJlbnRMaW5lJywgJ0FkZCBGZWVkYmFjayBhdCBDdXJyZW50IExpbmUnKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIGhhc0FnZW50RmVlZGJhY2tTZXNzaW9uRm9yRWRpdG9yKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBoYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkZvckVkaXRvciksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpID8/IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSBlZGl0b3I/LmdldENvbnRyaWJ1dGlvbjxBZ2VudEZlZWRiYWNrRWRpdG9ySW5wdXRDb250cmlidXRpb24+KEFnZW50RmVlZGJhY2tFZGl0b3JJbnB1dENvbnRyaWJ1dGlvbi5JRCk7XG5cdFx0Y29udHJpYnV0aW9uPy5zaG93QXRDdXJyZW50TGluZSh0cnVlKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoQWRkRmVlZGJhY2tBdEN1cnJlbnRMaW5lQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKEFnZW50RmVlZGJhY2tFZGl0b3JJbnB1dENvbnRyaWJ1dGlvbi5JRCwgQWdlbnRGZWVkYmFja0VkaXRvcklucHV0Q29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLGlDQUFpQyxrQ0FBa0M7QUFDNUUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFh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
