import "./media/chatEditingExplanationWidget.css";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Event } from "../../../../../base/common/event.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { $, addDisposableListener, clearNode, getTotalWidth } from "../../../../../base/browser/dom.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { overviewRulerRangeHighlight } from "../../../../../editor/common/core/editorColorRegistry.js";
import { OverviewRulerLane } from "../../../../../editor/common/model.js";
import { themeColorFromId } from "../../../../../platform/theme/common/themeService.js";
import { ChatViewId } from "../chat.js";
import * as nls from "../../../../../nls.js";
import { autorun } from "../../../../../base/common/observable.js";
function getChangeTexts(change, diffInfo) {
  const originalLines = [];
  const modifiedLines = [];
  for (let i = change.original.startLineNumber; i < change.original.endLineNumberExclusive; i++) {
    const line = diffInfo.originalModel.getLineContent(i);
    originalLines.push(line);
  }
  for (let i = change.modified.startLineNumber; i < change.modified.endLineNumberExclusive; i++) {
    const line = diffInfo.modifiedModel.getLineContent(i);
    modifiedLines.push(line);
  }
  return {
    originalText: originalLines.join("\n"),
    modifiedText: modifiedLines.join("\n")
  };
}
function groupNearbyChanges(changes, lineThreshold = 5) {
  if (changes.length === 0) {
    return [];
  }
  const groups = [];
  let currentGroup = [changes[0]];
  for (let i = 1; i < changes.length; i++) {
    const firstChange = currentGroup[0];
    const currentChange = changes[i];
    const widgetLine = firstChange.modified.startLineNumber;
    const lastLine = currentChange.modified.startLineNumber;
    const verticalSpan = lastLine - widgetLine;
    if (verticalSpan <= lineThreshold) {
      currentGroup.push(currentChange);
    } else {
      groups.push(currentGroup);
      currentGroup = [currentChange];
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}
const _ChatEditingExplanationWidget = class _ChatEditingExplanationWidget extends Disposable {
  constructor(_editor, _changes, diffInfo, _chatWidgetService, _viewsService, _chatSessionResource) {
    super();
    this._editor = _editor;
    this._changes = _changes;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
    this._chatSessionResource = _chatSessionResource;
    this._id = `chat-explanation-widget-${_ChatEditingExplanationWidget._idPool++}`;
    this._explanationItems = /* @__PURE__ */ new Map();
    this._position = null;
    this._explanations = [];
    this._isExpanded = true;
    this._isAllRead = false;
    this._disposed = false;
    this._startLineNumber = 1;
    this._eventStore = this._register(new DisposableStore());
    this._uri = diffInfo.modifiedModel.uri;
    this._rangeHighlightDecoration = this._editor.createDecorationsCollection();
    this._explanations = this._changes.map((change) => {
      const { originalText, modifiedText } = getChangeTexts(change, diffInfo);
      return {
        startLineNumber: change.modified.startLineNumber,
        endLineNumber: change.modified.endLineNumberExclusive - 1,
        explanation: nls.localize("generatingExplanation", "Generating explanation..."),
        read: false,
        loading: true,
        originalText,
        modifiedText
      };
    });
    this._domNode = $("div.chat-explanation-widget");
    this._headerNode = $("div.chat-explanation-header");
    this._readIndicator = $("div.chat-explanation-read-indicator");
    this._updateReadIndicator();
    this._headerNode.appendChild(this._readIndicator);
    this._titleNode = $("span.chat-explanation-title");
    this._updateTitle();
    this._headerNode.appendChild(this._titleNode);
    this._headerNode.appendChild($("span.chat-explanation-spacer"));
    this._toggleButton = $("div.chat-explanation-toggle");
    this._updateToggleButton();
    this._headerNode.appendChild(this._toggleButton);
    this._dismissButton = $("div.chat-explanation-dismiss");
    this._dismissButton.appendChild(renderIcon(Codicon.closeSmall));
    this._dismissButton.title = nls.localize("dismiss", "Dismiss");
    this._headerNode.appendChild(this._dismissButton);
    this._domNode.appendChild(this._headerNode);
    this._bodyNode = $("div.chat-explanation-body");
    this._buildExplanationItems();
    this._domNode.appendChild(this._bodyNode);
    const arrow = $("div.chat-explanation-arrow");
    this._domNode.appendChild(arrow);
    this._setupEventHandlers();
    this._domNode.classList.add("visible");
    this._editor.addOverlayWidget(this);
  }
  _setupEventHandlers() {
    this._eventStore.add(addDisposableListener(this._readIndicator, "click", (e) => {
      e.stopPropagation();
      this._isAllRead = !this._isAllRead;
      for (const exp of this._explanations) {
        exp.read = this._isAllRead;
      }
      this._updateReadIndicator();
      this._updateExplanationItemsReadState();
    }));
    this._eventStore.add(addDisposableListener(this._toggleButton, "click", (e) => {
      e.stopPropagation();
      this._toggleExpanded();
    }));
    this._eventStore.add(addDisposableListener(this._headerNode, "click", () => {
      this._toggleExpanded();
    }));
    this._eventStore.add(addDisposableListener(this._dismissButton, "click", (e) => {
      e.stopPropagation();
      this._dismiss();
    }));
  }
  _toggleExpanded() {
    this._isExpanded = !this._isExpanded;
    this._bodyNode.classList.toggle("collapsed", !this._isExpanded);
    this._updateToggleButton();
    this._editor.layoutOverlayWidget(this);
  }
  _dismiss() {
    this._domNode.classList.add("fadeOut");
    const dispose = () => {
      this.dispose();
    };
    const handle = setTimeout(dispose, 150);
    this._domNode.addEventListener("animationend", () => {
      clearTimeout(handle);
      dispose();
    }, { once: true });
  }
  _updateReadIndicator() {
    clearNode(this._readIndicator);
    const allRead = this._explanations.every((e) => e.read);
    const someRead = this._explanations.some((e) => e.read);
    this._isAllRead = allRead;
    if (allRead) {
      this._readIndicator.appendChild(renderIcon(Codicon.circle));
      this._readIndicator.classList.add("read");
      this._readIndicator.classList.remove("partial", "unread");
      this._readIndicator.title = nls.localize("markAsUnread", "Mark as unread");
    } else if (someRead) {
      this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
      this._readIndicator.classList.remove("read", "unread");
      this._readIndicator.classList.add("partial");
      this._readIndicator.title = nls.localize("markAllAsRead", "Mark all as read");
    } else {
      this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
      this._readIndicator.classList.remove("read", "partial");
      this._readIndicator.classList.add("unread");
      this._readIndicator.title = nls.localize("markAsRead", "Mark as read");
    }
  }
  _updateTitle() {
    const count = this._explanations.length;
    if (count === 1) {
      this._titleNode.textContent = nls.localize("oneChange", "1 change");
    } else {
      this._titleNode.textContent = nls.localize("nChanges", "{0} changes", count);
    }
  }
  _updateToggleButton() {
    clearNode(this._toggleButton);
    if (this._isExpanded) {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronUp));
      this._toggleButton.title = nls.localize("collapse", "Collapse");
    } else {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronDown));
      this._toggleButton.title = nls.localize("expand", "Expand");
    }
  }
  _buildExplanationItems() {
    clearNode(this._bodyNode);
    this._explanationItems.clear();
    for (let i = 0; i < this._explanations.length; i++) {
      const exp = this._explanations[i];
      const item = $("div.chat-explanation-item");
      const lineInfo = $("span.chat-explanation-line-info");
      if (exp.startLineNumber === exp.endLineNumber) {
        lineInfo.textContent = nls.localize("lineNumber", "Line {0}", exp.startLineNumber);
      } else {
        lineInfo.textContent = nls.localize("lineRange", "Lines {0}-{1}", exp.startLineNumber, exp.endLineNumber);
      }
      item.appendChild(lineInfo);
      const text = $("span.chat-explanation-text");
      if (exp.loading) {
        const loadingIcon = renderIcon(ThemeIcon.modify(Codicon.loading, "spin"));
        loadingIcon.classList.add("chat-explanation-loading");
        text.appendChild(loadingIcon);
        const loadingText = document.createTextNode(" " + exp.explanation);
        text.appendChild(loadingText);
      } else {
        text.textContent = exp.explanation;
      }
      item.appendChild(text);
      const itemReadIndicator = $("div.chat-explanation-item-read");
      this._updateItemReadIndicator(itemReadIndicator, exp.read);
      item.appendChild(itemReadIndicator);
      const replyButton = $("div.chat-explanation-reply-button");
      replyButton.appendChild(renderIcon(Codicon.arrowRight));
      replyButton.title = nls.localize("followUpOnChange", "Follow up on this change");
      item.appendChild(replyButton);
      this._eventStore.add(addDisposableListener(replyButton, "click", async (e) => {
        e.stopPropagation();
        const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, 1);
        let chatWidget;
        if (this._chatSessionResource) {
          chatWidget = await this._chatWidgetService.openSession(this._chatSessionResource);
        } else {
          await this._viewsService.openView(ChatViewId, true);
          chatWidget = this._chatWidgetService.lastFocusedWidget;
        }
        if (chatWidget) {
          chatWidget.attachmentModel.addContext(
            chatWidget.attachmentModel.asFileVariableEntry(this._uri, range)
          );
        }
      }));
      this._eventStore.add(addDisposableListener(item, "click", (e) => {
        e.stopPropagation();
        exp.read = !exp.read;
        this._updateItemReadIndicator(itemReadIndicator, exp.read);
        this._updateReadIndicator();
      }));
      this._eventStore.add(addDisposableListener(item, "mouseenter", () => {
        const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, this._editor.getModel()?.getLineMaxColumn(exp.endLineNumber) ?? 1);
        this._rangeHighlightDecoration.set([
          // Line highlight with gutter decoration
          {
            range,
            options: {
              description: "chat-explanation-range-highlight",
              className: "rangeHighlight",
              isWholeLine: true,
              linesDecorationsClassName: "chat-explanation-range-glyph"
            }
          },
          // Overview ruler indicator
          {
            range,
            options: {
              description: "chat-explanation-range-highlight-overview",
              overviewRuler: {
                color: themeColorFromId(overviewRulerRangeHighlight),
                position: OverviewRulerLane.Full
              }
            }
          }
        ]);
      }));
      this._eventStore.add(addDisposableListener(item, "mouseleave", () => {
        this._rangeHighlightDecoration.clear();
      }));
      this._explanationItems.set(i, { item, readIndicator: itemReadIndicator, textElement: text });
      this._bodyNode.appendChild(item);
    }
  }
  /**
   * Sets the explanation for a change matching the given line number range.
   * @returns true if a matching explanation was found and updated
   */
  setExplanationByLineNumber(startLineNumber, endLineNumber, explanation) {
    for (let i = 0; i < this._explanations.length; i++) {
      const exp = this._explanations[i];
      if (exp.startLineNumber === startLineNumber && exp.endLineNumber === endLineNumber) {
        exp.explanation = explanation;
        exp.loading = false;
        this._updateExplanationText(i);
        return true;
      }
    }
    return false;
  }
  /**
   * Gets the number of explanations in this widget.
   */
  get explanationCount() {
    return this._explanations.length;
  }
  _updateExplanationText(index) {
    const itemData = this._explanationItems.get(index);
    const exp = this._explanations[index];
    if (itemData && exp) {
      clearNode(itemData.textElement);
      itemData.textElement.textContent = exp.explanation;
    }
  }
  _updateItemReadIndicator(element, read) {
    clearNode(element);
    if (read) {
      element.appendChild(renderIcon(Codicon.circle));
      element.classList.add("read");
      element.classList.remove("unread");
    } else {
      element.appendChild(renderIcon(Codicon.circleFilled));
      element.classList.remove("read");
      element.classList.add("unread");
    }
  }
  _updateExplanationItemsReadState() {
    this._explanationItems.forEach(({ readIndicator }, index) => {
      const exp = this._explanations[index];
      this._updateItemReadIndicator(readIndicator, exp.read);
    });
  }
  /**
   * Updates the widget position and layout
   */
  layout(startLineNumber) {
    if (this._disposed) {
      return;
    }
    this._startLineNumber = startLineNumber;
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const scrollTop = this._editor.getScrollTop();
    const widgetWidth = getTotalWidth(this._domNode) || 280;
    this._position = {
      stackOrdinal: 2,
      preference: {
        top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - lineHeight,
        left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)
      }
    };
    this._editor.layoutOverlayWidget(this);
  }
  /**
   * Shows or hides the widget
   */
  toggle(show) {
    this._domNode.classList.toggle("visible", show);
    if (show && this._explanations.length > 0) {
      this.layout(this._explanations[0].startLineNumber);
    }
  }
  /**
   * Relayouts the widget at its current line number
   */
  relayout() {
    if (this._startLineNumber) {
      this.layout(this._startLineNumber);
    }
  }
  // IOverlayWidget implementation
  getId() {
    return this._id;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return this._position;
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._rangeHighlightDecoration.clear();
    this._editor.removeOverlayWidget(this);
    super.dispose();
  }
};
_ChatEditingExplanationWidget._idPool = 0;
let ChatEditingExplanationWidget = _ChatEditingExplanationWidget;
class ChatEditingExplanationWidgetManager extends Disposable {
  constructor(_editor, _chatWidgetService, _viewsService, modelManager, _modelUri) {
    super();
    this._editor = _editor;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
    this._modelUri = _modelUri;
    this._widgets = [];
    this._visible = false;
    this._register(this._editor.onDidChangeModel(() => {
      const newUri = this._editor.getModel()?.uri;
      if (this._modelUri) {
        if (newUri && newUri.toString() === this._modelUri.toString()) {
          for (const widget of this._widgets) {
            widget.toggle(this._visible);
            widget.relayout();
          }
        } else {
          for (const widget of this._widgets) {
            widget.toggle(false);
          }
        }
      }
    }));
    this._register(autorun((r) => {
      const state = modelManager.state.read(r);
      const uriState = state.get(this._modelUri);
      if (uriState) {
        this._diffInfo = uriState.diffInfo;
        this._chatSessionResource = uriState.chatSessionResource;
        if (this._widgets.length === 0 && this._diffInfo) {
          this._createWidgets(this._diffInfo, this._chatSessionResource);
        }
        if (uriState.progress === "complete") {
          this._handleExplanations(this._modelUri, uriState.explanations);
        }
        this.show();
      } else {
        this.hide();
      }
    }));
  }
  _createWidgets(diffInfo, chatSessionResource) {
    if (diffInfo.identical || diffInfo.changes.length === 0) {
      return;
    }
    const groups = groupNearbyChanges(diffInfo.changes, 5);
    for (const group of groups) {
      const widget = new ChatEditingExplanationWidget(
        this._editor,
        group,
        diffInfo,
        this._chatWidgetService,
        this._viewsService,
        chatSessionResource
      );
      this._widgets.push(widget);
      this._register(widget);
      widget.layout(group[0].modified.startLineNumber);
    }
    this._register(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
      for (const widget of this._widgets) {
        widget.relayout();
      }
    }));
  }
  _handleExplanations(uri, explanations) {
    if (!this._modelUri || uri.toString() !== this._modelUri.toString()) {
      return;
    }
    for (const explanation of explanations) {
      for (const widget of this._widgets) {
        if (widget.setExplanationByLineNumber(
          explanation.startLineNumber,
          explanation.endLineNumber,
          explanation.explanation
        )) {
          break;
        }
      }
    }
  }
  /**
   * Shows all widgets
   */
  show() {
    this._visible = true;
    for (const widget of this._widgets) {
      widget.toggle(true);
      widget.relayout();
    }
  }
  /**
   * Hides all widgets
   */
  hide() {
    this._visible = false;
    for (const widget of this._widgets) {
      widget.toggle(false);
    }
  }
  _clearWidgets() {
    for (const widget of this._widgets) {
      widget.dispose();
    }
    this._widgets.length = 0;
  }
  dispose() {
    this._clearWidgets();
    super.dispose();
  }
}
export {
  ChatEditingExplanationWidget,
  ChatEditingExplanationWidgetManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXQuY3NzJztcblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBjbGVhck5vZGUsIGdldFRvdGFsV2lkdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgb3ZlcnZpZXdSdWxlclJhbmdlSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFeHBsYW5hdGlvbkRpZmZJbmZvLCBJQ2hhbmdlRXhwbGFuYXRpb24gYXMgSUNoYW5nZUV4cGxhbmF0aW9uTW9kZWwsIElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuLyoqXG4gKiBFeHBsYW5hdGlvbiBkYXRhIGZvciBhIHNpbmdsZSBjaGFuZ2UgaHVua1xuICovXG5pbnRlcmZhY2UgSUNoYW5nZUV4cGxhbmF0aW9uIHtcblx0cmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0ZXhwbGFuYXRpb246IHN0cmluZztcblx0cmVhZDogYm9vbGVhbjtcblx0bG9hZGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3JpZ2luYWxUZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGlmaWVkVGV4dDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdldHMgdGhlIHRleHQgY29udGVudCBmb3IgYSBjaGFuZ2VcbiAqL1xuZnVuY3Rpb24gZ2V0Q2hhbmdlVGV4dHMoY2hhbmdlOiBMaW5lUmFuZ2VNYXBwaW5nIHwgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLCBkaWZmSW5mbzogSUV4cGxhbmF0aW9uRGlmZkluZm8pOiB7IG9yaWdpbmFsVGV4dDogc3RyaW5nOyBtb2RpZmllZFRleHQ6IHN0cmluZyB9IHtcblx0Y29uc3Qgb3JpZ2luYWxMaW5lczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgbW9kaWZpZWRMaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHQvLyBHZXQgb3JpZ2luYWwgdGV4dFxuXHRmb3IgKGxldCBpID0gY2hhbmdlLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcjsgaSA8IGNoYW5nZS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gZGlmZkluZm8ub3JpZ2luYWxNb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRvcmlnaW5hbExpbmVzLnB1c2gobGluZSk7XG5cdH1cblxuXHQvLyBHZXQgbW9kaWZpZWQgdGV4dFxuXHRmb3IgKGxldCBpID0gY2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjsgaSA8IGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gZGlmZkluZm8ubW9kaWZpZWRNb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRtb2RpZmllZExpbmVzLnB1c2gobGluZSk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdG9yaWdpbmFsVGV4dDogb3JpZ2luYWxMaW5lcy5qb2luKCdcXG4nKSxcblx0XHRtb2RpZmllZFRleHQ6IG1vZGlmaWVkTGluZXMuam9pbignXFxuJylcblx0fTtcbn1cblxuLyoqXG4gKiBHcm91cHMgbmVhcmJ5IGNoYW5nZXMgd2l0aGluIGEgdGhyZXNob2xkIG51bWJlciBvZiBsaW5lc1xuICogVXNlcyB0aGUgdmVydGljYWwgc3BhbiBmcm9tIHdpZGdldCBwb3NpdGlvbiB0byBsYXN0IGxpbmUgaXQgcmVmZXJzIHRvXG4gKi9cbmZ1bmN0aW9uIGdyb3VwTmVhcmJ5Q2hhbmdlczxUIGV4dGVuZHMgTGluZVJhbmdlTWFwcGluZz4oY2hhbmdlczogcmVhZG9ubHkgVFtdLCBsaW5lVGhyZXNob2xkOiBudW1iZXIgPSA1KTogVFtdW10ge1xuXHRpZiAoY2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBncm91cHM6IFRbXVtdID0gW107XG5cdGxldCBjdXJyZW50R3JvdXA6IFRbXSA9IFtjaGFuZ2VzWzBdXTtcblxuXHRmb3IgKGxldCBpID0gMTsgaSA8IGNoYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBmaXJzdENoYW5nZSA9IGN1cnJlbnRHcm91cFswXTtcblx0XHRjb25zdCBjdXJyZW50Q2hhbmdlID0gY2hhbmdlc1tpXTtcblxuXHRcdC8vIENhbGN1bGF0ZSB2ZXJ0aWNhbCBzcGFuIGZyb20gd2lkZ2V0IHBvc2l0aW9uIChmaXJzdCBjaGFuZ2UpIHRvIHN0YXJ0IG9mIGN1cnJlbnQgY2hhbmdlXG5cdFx0Y29uc3Qgd2lkZ2V0TGluZSA9IGZpcnN0Q2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBsYXN0TGluZSA9IGN1cnJlbnRDaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHZlcnRpY2FsU3BhbiA9IGxhc3RMaW5lIC0gd2lkZ2V0TGluZTtcblxuXHRcdGlmICh2ZXJ0aWNhbFNwYW4gPD0gbGluZVRocmVzaG9sZCkge1xuXHRcdFx0Y3VycmVudEdyb3VwLnB1c2goY3VycmVudENoYW5nZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3Vwcy5wdXNoKGN1cnJlbnRHcm91cCk7XG5cdFx0XHRjdXJyZW50R3JvdXAgPSBbY3VycmVudENoYW5nZV07XG5cdFx0fVxuXHR9XG5cblx0aWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XG5cdFx0Z3JvdXBzLnB1c2goY3VycmVudEdyb3VwKTtcblx0fVxuXG5cdHJldHVybiBncm91cHM7XG59XG5cbi8qKlxuICogV2lkZ2V0IHRoYXQgZGlzcGxheXMgZXhwbGFuYXRvcnkgY29tbWVudHMgZm9yIGNoYXQtbWFkZSBjaGFuZ2VzXG4gKiBQb3NpdGlvbmVkIG9uIHRoZSByaWdodCBzaWRlIG9mIHRoZSBlZGl0b3IgbGlrZSBhIHNwZWVjaCBidWJibGVcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9pZFBvb2wgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nID0gYGNoYXQtZXhwbGFuYXRpb24td2lkZ2V0LSR7Q2hhdEVkaXRpbmdFeHBsYW5hdGlvbldpZGdldC5faWRQb29sKyt9YDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVyTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWRJbmRpY2F0b3I6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNtaXNzQnV0dG9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9nZ2xlQnV0dG9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYm9keU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBsYW5hdGlvbkl0ZW1zOiBNYXA8bnVtYmVyLCB7IGl0ZW06IEhUTUxFbGVtZW50OyByZWFkSW5kaWNhdG9yOiBIVE1MRWxlbWVudDsgdGV4dEVsZW1lbnQ6IEhUTUxFbGVtZW50IH0+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgX3Bvc2l0aW9uOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2V4cGxhbmF0aW9uczogSUNoYW5nZUV4cGxhbmF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfaXNFeHBhbmRlZDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX2lzQWxsUmVhZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdGFydExpbmVOdW1iZXI6IG51bWJlciA9IDE7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VyaTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yYW5nZUhpZ2hsaWdodERlY29yYXRpb246IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXZlbnRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIF9jaGFuZ2VzOiByZWFkb25seSAoTGluZVJhbmdlTWFwcGluZyB8IERldGFpbGVkTGluZVJhbmdlTWFwcGluZylbXSxcblx0XHRkaWZmSW5mbzogSUV4cGxhbmF0aW9uRGlmZkluZm8sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25SZXNvdXJjZT86IFVSSSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3VyaSA9IGRpZmZJbmZvLm1vZGlmaWVkTW9kZWwudXJpO1xuXG5cdFx0Ly8gQ3JlYXRlIGRlY29yYXRpb24gY29sbGVjdGlvbiBmb3IgcmFuZ2UgaGlnaGxpZ2h0aW5nIG9uIGhvdmVyXG5cdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXG5cdFx0Ly8gQnVpbGQgZXhwbGFuYXRpb25zIGZyb20gY2hhbmdlcyB3aXRoIGxvYWRpbmcgc3RhdGVcblx0XHR0aGlzLl9leHBsYW5hdGlvbnMgPSB0aGlzLl9jaGFuZ2VzLm1hcChjaGFuZ2UgPT4ge1xuXHRcdFx0Y29uc3QgeyBvcmlnaW5hbFRleHQsIG1vZGlmaWVkVGV4dCB9ID0gZ2V0Q2hhbmdlVGV4dHMoY2hhbmdlLCBkaWZmSW5mbyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGNoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0ZXhwbGFuYXRpb246IG5scy5sb2NhbGl6ZSgnZ2VuZXJhdGluZ0V4cGxhbmF0aW9uJywgXCJHZW5lcmF0aW5nIGV4cGxhbmF0aW9uLi4uXCIpLFxuXHRcdFx0XHRyZWFkOiBmYWxzZSxcblx0XHRcdFx0bG9hZGluZzogdHJ1ZSxcblx0XHRcdFx0b3JpZ2luYWxUZXh0LFxuXHRcdFx0XHRtb2RpZmllZFRleHQsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIERPTSBzdHJ1Y3R1cmVcblx0XHR0aGlzLl9kb21Ob2RlID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24td2lkZ2V0Jyk7XG5cblx0XHQvLyBIZWFkZXJcblx0XHR0aGlzLl9oZWFkZXJOb2RlID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24taGVhZGVyJyk7XG5cblx0XHQvLyBSZWFkIGluZGljYXRvciAoY2hlY2tib3gtbGlrZSlcblx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24tcmVhZC1pbmRpY2F0b3InKTtcblx0XHR0aGlzLl91cGRhdGVSZWFkSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9yZWFkSW5kaWNhdG9yKTtcblxuXHRcdC8vIFRpdGxlIHNob3dpbmcgY2hhbmdlIGNvdW50XG5cdFx0dGhpcy5fdGl0bGVOb2RlID0gJCgnc3Bhbi5jaGF0LWV4cGxhbmF0aW9uLXRpdGxlJyk7XG5cdFx0dGhpcy5fdXBkYXRlVGl0bGUoKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKHRoaXMuX3RpdGxlTm9kZSk7XG5cblx0XHQvLyBTcGFjZXJcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hhdC1leHBsYW5hdGlvbi1zcGFjZXInKSk7XG5cblx0XHQvLyBUb2dnbGUgZXhwYW5kL2NvbGxhcHNlIGJ1dHRvblxuXHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbiA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLXRvZ2dsZScpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvZ2dsZUJ1dHRvbigpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9nZ2xlQnV0dG9uKTtcblxuXHRcdC8vIERpc21pc3MgYnV0dG9uXG5cdFx0dGhpcy5fZGlzbWlzc0J1dHRvbiA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLWRpc21pc3MnKTtcblx0XHR0aGlzLl9kaXNtaXNzQnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jbG9zZVNtYWxsKSk7XG5cdFx0dGhpcy5fZGlzbWlzc0J1dHRvbi50aXRsZSA9IG5scy5sb2NhbGl6ZSgnZGlzbWlzcycsIFwiRGlzbWlzc1wiKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKHRoaXMuX2Rpc21pc3NCdXR0b24pO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9oZWFkZXJOb2RlKTtcblxuXHRcdC8vIEJvZHkgKGNvbGxhcHNpYmxlKVxuXHRcdHRoaXMuX2JvZHlOb2RlID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24tYm9keScpO1xuXHRcdC8vIEJvZHkgc3RhcnRzIGV4cGFuZGVkIGJ5IGRlZmF1bHRcblx0XHR0aGlzLl9idWlsZEV4cGxhbmF0aW9uSXRlbXMoKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2JvZHlOb2RlKTtcblxuXHRcdC8vIEFycm93IHBvaW50ZXJcblx0XHRjb25zdCBhcnJvdyA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLWFycm93Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZChhcnJvdyk7XG5cblx0XHQvLyBFdmVudCBoYW5kbGVyc1xuXHRcdHRoaXMuX3NldHVwRXZlbnRIYW5kbGVycygpO1xuXG5cdFx0Ly8gQWRkIHZpc2libGUgY2xhc3MgZm9yIGluaXRpYWwgZGlzcGxheVxuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXG5cdFx0Ly8gQWRkIHRvIGVkaXRvclxuXHRcdHRoaXMuX2VkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBFdmVudEhhbmRsZXJzKCk6IHZvaWQge1xuXHRcdC8vIFJlYWQgaW5kaWNhdG9yIGNsaWNrIC0gdG9nZ2xlIGFsbCByZWFkL3VucmVhZFxuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9yZWFkSW5kaWNhdG9yLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX2lzQWxsUmVhZCA9ICF0aGlzLl9pc0FsbFJlYWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGV4cCBvZiB0aGlzLl9leHBsYW5hdGlvbnMpIHtcblx0XHRcdFx0ZXhwLnJlYWQgPSB0aGlzLl9pc0FsbFJlYWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVSZWFkSW5kaWNhdG9yKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVFeHBsYW5hdGlvbkl0ZW1zUmVhZFN0YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVG9nZ2xlIGJ1dHRvbiBjbGljayAtIGV4cGFuZC9jb2xsYXBzZVxuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90b2dnbGVCdXR0b24sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fdG9nZ2xlRXhwYW5kZWQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIZWFkZXIgY2xpY2sgLSBhbHNvIHRvZ2dsZXMgZXhwYW5kL2NvbGxhcHNlXG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2hlYWRlck5vZGUsICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuX3RvZ2dsZUV4cGFuZGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlzbWlzcyBidXR0b24gY2xpY2tcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZGlzbWlzc0J1dHRvbiwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9kaXNtaXNzKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9nZ2xlRXhwYW5kZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNFeHBhbmRlZCA9ICF0aGlzLl9pc0V4cGFuZGVkO1xuXHRcdHRoaXMuX2JvZHlOb2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsICF0aGlzLl9pc0V4cGFuZGVkKTtcblx0XHR0aGlzLl91cGRhdGVUb2dnbGVCdXR0b24oKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc21pc3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdmYWRlT3V0Jyk7XG5cblx0XHRjb25zdCBkaXNwb3NlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0fTtcblxuXHRcdC8vIExpc3RlbiBmb3IgYW5pbWF0aW9uIGVuZFxuXHRcdGNvbnN0IGhhbmRsZSA9IHNldFRpbWVvdXQoZGlzcG9zZSwgMTUwKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFkZEV2ZW50TGlzdGVuZXIoJ2FuaW1hdGlvbmVuZCcsICgpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dChoYW5kbGUpO1xuXHRcdFx0ZGlzcG9zZSgpO1xuXHRcdH0sIHsgb25jZTogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlYWRJbmRpY2F0b3IoKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuX3JlYWRJbmRpY2F0b3IpO1xuXHRcdGNvbnN0IGFsbFJlYWQgPSB0aGlzLl9leHBsYW5hdGlvbnMuZXZlcnkoZSA9PiBlLnJlYWQpO1xuXHRcdGNvbnN0IHNvbWVSZWFkID0gdGhpcy5fZXhwbGFuYXRpb25zLnNvbWUoZSA9PiBlLnJlYWQpO1xuXHRcdHRoaXMuX2lzQWxsUmVhZCA9IGFsbFJlYWQ7XG5cblx0XHRpZiAoYWxsUmVhZCkge1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2lyY2xlKSk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoJ3JlYWQnKTtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IuY2xhc3NMaXN0LnJlbW92ZSgncGFydGlhbCcsICd1bnJlYWQnKTtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IudGl0bGUgPSBubHMubG9jYWxpemUoJ21hcmtBc1VucmVhZCcsIFwiTWFyayBhcyB1bnJlYWRcIik7XG5cdFx0fSBlbHNlIGlmIChzb21lUmVhZCkge1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2lyY2xlRmlsbGVkKSk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLmNsYXNzTGlzdC5yZW1vdmUoJ3JlYWQnLCAndW5yZWFkJyk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoJ3BhcnRpYWwnKTtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IudGl0bGUgPSBubHMubG9jYWxpemUoJ21hcmtBbGxBc1JlYWQnLCBcIk1hcmsgYWxsIGFzIHJlYWRcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNpcmNsZUZpbGxlZCkpO1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci5jbGFzc0xpc3QucmVtb3ZlKCdyZWFkJywgJ3BhcnRpYWwnKTtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IuY2xhc3NMaXN0LmFkZCgndW5yZWFkJyk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLnRpdGxlID0gbmxzLmxvY2FsaXplKCdtYXJrQXNSZWFkJywgXCJNYXJrIGFzIHJlYWRcIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY291bnQgPSB0aGlzLl9leHBsYW5hdGlvbnMubGVuZ3RoO1xuXHRcdGlmIChjb3VudCA9PT0gMSkge1xuXHRcdFx0dGhpcy5fdGl0bGVOb2RlLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdvbmVDaGFuZ2UnLCBcIjEgY2hhbmdlXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90aXRsZU5vZGUudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ25DaGFuZ2VzJywgXCJ7MH0gY2hhbmdlc1wiLCBjb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVG9nZ2xlQnV0dG9uKCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0aGlzLl90b2dnbGVCdXR0b24pO1xuXHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl90b2dnbGVCdXR0b24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25VcCkpO1xuXHRcdFx0dGhpcy5fdG9nZ2xlQnV0dG9uLnRpdGxlID0gbmxzLmxvY2FsaXplKCdjb2xsYXBzZScsIFwiQ29sbGFwc2VcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2hldnJvbkRvd24pKTtcblx0XHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbi50aXRsZSA9IG5scy5sb2NhbGl6ZSgnZXhwYW5kJywgXCJFeHBhbmRcIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRFeHBsYW5hdGlvbkl0ZW1zKCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0aGlzLl9ib2R5Tm9kZSk7XG5cdFx0dGhpcy5fZXhwbGFuYXRpb25JdGVtcy5jbGVhcigpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9leHBsYW5hdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGV4cCA9IHRoaXMuX2V4cGxhbmF0aW9uc1tpXTtcblx0XHRcdGNvbnN0IGl0ZW0gPSAkKCdkaXYuY2hhdC1leHBsYW5hdGlvbi1pdGVtJyk7XG5cblx0XHRcdC8vIExpbmUgaW5kaWNhdG9yXG5cdFx0XHRjb25zdCBsaW5lSW5mbyA9ICQoJ3NwYW4uY2hhdC1leHBsYW5hdGlvbi1saW5lLWluZm8nKTtcblx0XHRcdGlmIChleHAuc3RhcnRMaW5lTnVtYmVyID09PSBleHAuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRsaW5lSW5mby50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbGluZU51bWJlcicsIFwiTGluZSB7MH1cIiwgZXhwLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsaW5lSW5mby50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbGluZVJhbmdlJywgXCJMaW5lcyB7MH0tezF9XCIsIGV4cC5zdGFydExpbmVOdW1iZXIsIGV4cC5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdGl0ZW0uYXBwZW5kQ2hpbGQobGluZUluZm8pO1xuXG5cdFx0XHQvLyBFeHBsYW5hdGlvbiB0ZXh0IHdpdGggbG9hZGluZyBpbmRpY2F0b3Jcblx0XHRcdGNvbnN0IHRleHQgPSAkKCdzcGFuLmNoYXQtZXhwbGFuYXRpb24tdGV4dCcpO1xuXHRcdFx0aWYgKGV4cC5sb2FkaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGxvYWRpbmdJY29uID0gcmVuZGVySWNvbihUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSk7XG5cdFx0XHRcdGxvYWRpbmdJY29uLmNsYXNzTGlzdC5hZGQoJ2NoYXQtZXhwbGFuYXRpb24tbG9hZGluZycpO1xuXHRcdFx0XHR0ZXh0LmFwcGVuZENoaWxkKGxvYWRpbmdJY29uKTtcblx0XHRcdFx0Y29uc3QgbG9hZGluZ1RleHQgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcgKyBleHAuZXhwbGFuYXRpb24pO1xuXHRcdFx0XHR0ZXh0LmFwcGVuZENoaWxkKGxvYWRpbmdUZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRleHQudGV4dENvbnRlbnQgPSBleHAuZXhwbGFuYXRpb247XG5cdFx0XHR9XG5cdFx0XHRpdGVtLmFwcGVuZENoaWxkKHRleHQpO1xuXG5cdFx0XHQvLyBJdGVtIHJlYWQgaW5kaWNhdG9yXG5cdFx0XHRjb25zdCBpdGVtUmVhZEluZGljYXRvciA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLWl0ZW0tcmVhZCcpO1xuXHRcdFx0dGhpcy5fdXBkYXRlSXRlbVJlYWRJbmRpY2F0b3IoaXRlbVJlYWRJbmRpY2F0b3IsIGV4cC5yZWFkKTtcblx0XHRcdGl0ZW0uYXBwZW5kQ2hpbGQoaXRlbVJlYWRJbmRpY2F0b3IpO1xuXG5cdFx0XHQvLyBSZXBseSBidXR0b24gdG8gYWRkIGNvbnRleHQgdG8gY2hhdFxuXHRcdFx0Y29uc3QgcmVwbHlCdXR0b24gPSAkKCdkaXYuY2hhdC1leHBsYW5hdGlvbi1yZXBseS1idXR0b24nKTtcblx0XHRcdHJlcGx5QnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5hcnJvd1JpZ2h0KSk7XG5cdFx0XHRyZXBseUJ1dHRvbi50aXRsZSA9IG5scy5sb2NhbGl6ZSgnZm9sbG93VXBPbkNoYW5nZScsIFwiRm9sbG93IHVwIG9uIHRoaXMgY2hhbmdlXCIpO1xuXHRcdFx0aXRlbS5hcHBlbmRDaGlsZChyZXBseUJ1dHRvbik7XG5cblx0XHRcdC8vIFJlcGx5IGJ1dHRvbiBjbGljayBoYW5kbGVyXG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocmVwbHlCdXR0b24sICdjbGljaycsIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGV4cC5zdGFydExpbmVOdW1iZXIsIDEsIGV4cC5lbmRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0bGV0IGNoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQgPSBhd2FpdCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbih0aGlzLl9jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoQ2hhdFZpZXdJZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjaGF0V2lkZ2V0KSB7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChcblx0XHRcdFx0XHRcdGNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmFzRmlsZVZhcmlhYmxlRW50cnkodGhpcy5fdXJpLCByYW5nZSlcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIENsaWNrIG9uIGl0ZW0gdG8gbWFyayBhcyByZWFkXG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbSwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZXhwLnJlYWQgPSAhZXhwLnJlYWQ7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUl0ZW1SZWFkSW5kaWNhdG9yKGl0ZW1SZWFkSW5kaWNhdG9yLCBleHAucmVhZCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVJlYWRJbmRpY2F0b3IoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gSG92ZXIgaGFuZGxlcnMgZm9yIHJhbmdlIGhpZ2hsaWdodGluZ1xuXHRcdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGl0ZW0sICdtb3VzZWVudGVyJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShleHAuc3RhcnRMaW5lTnVtYmVyLCAxLCBleHAuZW5kTGluZU51bWJlciwgdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LmdldExpbmVNYXhDb2x1bW4oZXhwLmVuZExpbmVOdW1iZXIpID8/IDEpO1xuXHRcdFx0XHR0aGlzLl9yYW5nZUhpZ2hsaWdodERlY29yYXRpb24uc2V0KFtcblx0XHRcdFx0XHQvLyBMaW5lIGhpZ2hsaWdodCB3aXRoIGd1dHRlciBkZWNvcmF0aW9uXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhdC1leHBsYW5hdGlvbi1yYW5nZS1oaWdobGlnaHQnLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6ICdyYW5nZUhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRsaW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lOiAnY2hhdC1leHBsYW5hdGlvbi1yYW5nZS1nbHlwaCcsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQvLyBPdmVydmlldyBydWxlciBpbmRpY2F0b3Jcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdjaGF0LWV4cGxhbmF0aW9uLXJhbmdlLWhpZ2hsaWdodC1vdmVydmlldycsXG5cdFx0XHRcdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChvdmVydmlld1J1bGVyUmFuZ2VIaWdobGlnaHQpLFxuXHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5GdWxsLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGl0ZW0sICdtb3VzZWxlYXZlJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9yYW5nZUhpZ2hsaWdodERlY29yYXRpb24uY2xlYXIoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fZXhwbGFuYXRpb25JdGVtcy5zZXQoaSwgeyBpdGVtLCByZWFkSW5kaWNhdG9yOiBpdGVtUmVhZEluZGljYXRvciwgdGV4dEVsZW1lbnQ6IHRleHQgfSk7XG5cdFx0XHR0aGlzLl9ib2R5Tm9kZS5hcHBlbmRDaGlsZChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgZXhwbGFuYXRpb24gZm9yIGEgY2hhbmdlIG1hdGNoaW5nIHRoZSBnaXZlbiBsaW5lIG51bWJlciByYW5nZS5cblx0ICogQHJldHVybnMgdHJ1ZSBpZiBhIG1hdGNoaW5nIGV4cGxhbmF0aW9uIHdhcyBmb3VuZCBhbmQgdXBkYXRlZFxuXHQgKi9cblx0c2V0RXhwbGFuYXRpb25CeUxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZXhwbGFuYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZXhwbGFuYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBleHAgPSB0aGlzLl9leHBsYW5hdGlvbnNbaV07XG5cdFx0XHRpZiAoZXhwLnN0YXJ0TGluZU51bWJlciA9PT0gc3RhcnRMaW5lTnVtYmVyICYmIGV4cC5lbmRMaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGV4cC5leHBsYW5hdGlvbiA9IGV4cGxhbmF0aW9uO1xuXHRcdFx0XHRleHAubG9hZGluZyA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVFeHBsYW5hdGlvblRleHQoaSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgbnVtYmVyIG9mIGV4cGxhbmF0aW9ucyBpbiB0aGlzIHdpZGdldC5cblx0ICovXG5cdGdldCBleHBsYW5hdGlvbkNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4cGxhbmF0aW9ucy5sZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFeHBsYW5hdGlvblRleHQoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1EYXRhID0gdGhpcy5fZXhwbGFuYXRpb25JdGVtcy5nZXQoaW5kZXgpO1xuXHRcdGNvbnN0IGV4cCA9IHRoaXMuX2V4cGxhbmF0aW9uc1tpbmRleF07XG5cdFx0aWYgKGl0ZW1EYXRhICYmIGV4cCkge1xuXHRcdFx0Y2xlYXJOb2RlKGl0ZW1EYXRhLnRleHRFbGVtZW50KTtcblx0XHRcdGl0ZW1EYXRhLnRleHRFbGVtZW50LnRleHRDb250ZW50ID0gZXhwLmV4cGxhbmF0aW9uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUl0ZW1SZWFkSW5kaWNhdG9yKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCByZWFkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKGVsZW1lbnQpO1xuXHRcdGlmIChyZWFkKSB7XG5cdFx0XHRlbGVtZW50LmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGUpKTtcblx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgncmVhZCcpO1xuXHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCd1bnJlYWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWxlbWVudC5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2lyY2xlRmlsbGVkKSk7XG5cdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3JlYWQnKTtcblx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgndW5yZWFkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRXhwbGFuYXRpb25JdGVtc1JlYWRTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9leHBsYW5hdGlvbkl0ZW1zLmZvckVhY2goKHsgcmVhZEluZGljYXRvciB9LCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwID0gdGhpcy5fZXhwbGFuYXRpb25zW2luZGV4XTtcblx0XHRcdHRoaXMuX3VwZGF0ZUl0ZW1SZWFkSW5kaWNhdG9yKHJlYWRJbmRpY2F0b3IsIGV4cC5yZWFkKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWRnZXQgcG9zaXRpb24gYW5kIGxheW91dFxuXHQgKi9cblx0bGF5b3V0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhcnRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IHsgY29udGVudExlZnQsIGNvbnRlbnRXaWR0aCwgdmVydGljYWxTY3JvbGxiYXJXaWR0aCB9ID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cblx0XHQvLyBQb3NpdGlvbiBhdCByaWdodCBlZGdlIGxpa2UgRGlmZkh1bmtXaWRnZXRcblx0XHRjb25zdCB3aWRnZXRXaWR0aCA9IGdldFRvdGFsV2lkdGgodGhpcy5fZG9tTm9kZSkgfHwgMjgwO1xuXG5cdFx0dGhpcy5fcG9zaXRpb24gPSB7XG5cdFx0XHRzdGFja09yZGluYWw6IDIsXG5cdFx0XHRwcmVmZXJlbmNlOiB7XG5cdFx0XHRcdHRvcDogdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyKSAtIHNjcm9sbFRvcCAtIGxpbmVIZWlnaHQsXG5cdFx0XHRcdGxlZnQ6IGNvbnRlbnRMZWZ0ICsgY29udGVudFdpZHRoIC0gKDIgKiB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoICsgd2lkZ2V0V2lkdGgpXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIG9yIGhpZGVzIHRoZSB3aWRnZXRcblx0ICovXG5cdHRvZ2dsZShzaG93OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgc2hvdyk7XG5cdFx0aWYgKHNob3cgJiYgdGhpcy5fZXhwbGFuYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2V4cGxhbmF0aW9uc1swXS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxheW91dHMgdGhlIHdpZGdldCBhdCBpdHMgY3VycmVudCBsaW5lIG51bWJlclxuXHQgKi9cblx0cmVsYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHQvLyBJT3ZlcmxheVdpZGdldCBpbXBsZW1lbnRhdGlvblxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bvc2l0aW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3JhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIE1hbmFnZXIgZm9yIGV4cGxhbmF0aW9uIHdpZGdldHMgaW4gYW4gZWRpdG9yXG4gKiBHcm91cHMgY2hhbmdlcyBhbmQgY3JlYXRlcyBjb21iaW5lZCB3aWRnZXRzIGZvciBuZWFyYnkgY2hhbmdlc1xuICovXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdFeHBsYW5hdGlvbldpZGdldE1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXRzOiBDaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0W10gPSBbXTtcblx0cHJpdmF0ZSBfdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2NoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlmZkluZm86IElFeHBsYW5hdGlvbkRpZmZJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0bW9kZWxNYW5hZ2VyOiBJQ2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFVyaTogVVJJLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBtb2RlbCBjaGFuZ2VzIC0gaGlkZS9zaG93IHdpZGdldHMgYmFzZWQgb24gd2hldGhlciBjdXJyZW50IG1vZGVsIG1hdGNoZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmkgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsVXJpKSB7XG5cdFx0XHRcdGlmIChuZXdVcmkgJiYgbmV3VXJpLnRvU3RyaW5nKCkgPT09IHRoaXMuX21vZGVsVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHQvLyBTd2l0Y2hlZCBiYWNrIHRvIHRoZSBmaWxlIC0gc2hvdyB3aWRnZXRzXG5cdFx0XHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0XHRcdFx0d2lkZ2V0LnRvZ2dsZSh0aGlzLl92aXNpYmxlKTtcblx0XHRcdFx0XHRcdHdpZGdldC5yZWxheW91dCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBTd2l0Y2hlZCB0byBhIGRpZmZlcmVudCBmaWxlIC0gaGlkZSB3aWRnZXRzXG5cdFx0XHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0XHRcdFx0d2lkZ2V0LnRvZ2dsZShmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT2JzZXJ2ZSBzdGF0ZSBmcm9tIG1vZGVsIG1hbmFnZXJcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtb2RlbE1hbmFnZXIuc3RhdGUucmVhZChyKTtcblx0XHRcdGNvbnN0IHVyaVN0YXRlID0gc3RhdGUuZ2V0KHRoaXMuX21vZGVsVXJpKTtcblxuXHRcdFx0aWYgKHVyaVN0YXRlKSB7XG5cdFx0XHRcdC8vIFVwZGF0ZSBkaWZmSW5mbyBhbmQgY2hhdFNlc3Npb25SZXNvdXJjZSBmcm9tIHN0YXRlXG5cdFx0XHRcdHRoaXMuX2RpZmZJbmZvID0gdXJpU3RhdGUuZGlmZkluZm87XG5cdFx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uUmVzb3VyY2UgPSB1cmlTdGF0ZS5jaGF0U2Vzc2lvblJlc291cmNlO1xuXG5cdFx0XHRcdC8vIEVuc3VyZSB3aWRnZXRzIGFyZSBjcmVhdGVkXG5cdFx0XHRcdGlmICh0aGlzLl93aWRnZXRzLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl9kaWZmSW5mbykge1xuXHRcdFx0XHRcdHRoaXMuX2NyZWF0ZVdpZGdldHModGhpcy5fZGlmZkluZm8sIHRoaXMuX2NoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhhbmRsZSBleHBsYW5hdGlvbiBzdGF0ZSBjaGFuZ2VzXG5cdFx0XHRcdGlmICh1cmlTdGF0ZS5wcm9ncmVzcyA9PT0gJ2NvbXBsZXRlJykge1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZUV4cGxhbmF0aW9ucyh0aGlzLl9tb2RlbFVyaSwgdXJpU3RhdGUuZXhwbGFuYXRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNob3coKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVdpZGdldHMoZGlmZkluZm86IElFeHBsYW5hdGlvbkRpZmZJbmZvLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoZGlmZkluZm8uaWRlbnRpY2FsIHx8IGRpZmZJbmZvLmNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR3JvdXAgbmVhcmJ5IGNoYW5nZXNcblx0XHRjb25zdCBncm91cHMgPSBncm91cE5lYXJieUNoYW5nZXMoZGlmZkluZm8uY2hhbmdlcywgNSk7XG5cblx0XHQvLyBDcmVhdGUgYSB3aWRnZXQgZm9yIGVhY2ggZ3JvdXBcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gbmV3IENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXQoXG5cdFx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdFx0Z3JvdXAsXG5cdFx0XHRcdGRpZmZJbmZvLFxuXHRcdFx0XHR0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSxcblx0XHRcdFx0dGhpcy5fdmlld3NTZXJ2aWNlLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX3dpZGdldHMucHVzaCh3aWRnZXQpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIod2lkZ2V0KTtcblxuXHRcdFx0Ly8gTGF5b3V0IGF0IHRoZSBmaXJzdCBjaGFuZ2UgaW4gdGhlIGdyb3VwXG5cdFx0XHR3aWRnZXQubGF5b3V0KGdyb3VwWzBdLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0Ly8gUmVsYXlvdXQgb24gc2Nyb2xsL2xheW91dCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMuX2VkaXRvci5vbkRpZFNjcm9sbENoYW5nZSwgdGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLl93aWRnZXRzKSB7XG5cdFx0XHRcdHdpZGdldC5yZWxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUV4cGxhbmF0aW9ucyh1cmk6IFVSSSwgZXhwbGFuYXRpb25zOiByZWFkb25seSBJQ2hhbmdlRXhwbGFuYXRpb25Nb2RlbFtdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbFVyaSB8fCB1cmkudG9TdHJpbmcoKSAhPT0gdGhpcy5fbW9kZWxVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE1hcCBleHBsYW5hdGlvbnMgdG8gd2lkZ2V0cyBieSBtYXRjaGluZyBsaW5lIG51bWJlcnNcblx0XHRmb3IgKGNvbnN0IGV4cGxhbmF0aW9uIG9mIGV4cGxhbmF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0XHQvLyBUcnkgdG8gc2V0IHRoZSBleHBsYW5hdGlvbiBvbiB0aGUgd2lkZ2V0IC0gaXQgd2lsbCBtYXRjaCBieSBsaW5lIG51bWJlclxuXHRcdFx0XHRpZiAod2lkZ2V0LnNldEV4cGxhbmF0aW9uQnlMaW5lTnVtYmVyKFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRleHBsYW5hdGlvbi5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uLmV4cGxhbmF0aW9uXG5cdFx0XHRcdCkpIHtcblx0XHRcdFx0XHRicmVhazsgLy8gRm91bmQgdGhlIG1hdGNoaW5nIHdpZGdldCwgbm8gbmVlZCB0byBjaGVjayBvdGhlcnNcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyBhbGwgd2lkZ2V0c1xuXHQgKi9cblx0c2hvdygpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLl93aWRnZXRzKSB7XG5cdFx0XHR3aWRnZXQudG9nZ2xlKHRydWUpO1xuXHRcdFx0d2lkZ2V0LnJlbGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGVzIGFsbCB3aWRnZXRzXG5cdCAqL1xuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLl93aWRnZXRzKSB7XG5cdFx0XHR3aWRnZXQudG9nZ2xlKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhcldpZGdldHMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0d2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fd2lkZ2V0cy5sZW5ndGggPSAwO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhcldpZGdl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
