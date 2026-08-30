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
import { Disposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { clamp } from "../../../../base/common/numbers.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { editorSelectionBackground, editorSelectionForeground } from "../../../../platform/theme/common/colors/editorColors.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { FeedbackInputWidget } from "../../agentFeedback/browser/feedbackInputWidget.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../../../services/sessions/browser/sessionsPartService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { resolveResponseSelection } from "./responseSelectionResolver.js";
import { createAndSendSideChat } from "./sideChatOrchestration.js";
const selectionHighlightName = "chat-response-selection";
registerThemingParticipant((theme, collector) => {
  const background = theme.getColor(editorSelectionBackground);
  if (!background) {
    return;
  }
  const foreground = theme.getColor(editorSelectionForeground);
  collector.addRule(`::highlight(${selectionHighlightName}) {
		background-color: ${background};
		${foreground ? `color: ${foreground};` : ""}
	}`);
});
function getSelectionHighlight(targetWindow) {
  const registry = targetWindow.CSS?.highlights;
  if (!registry) {
    return void 0;
  }
  let highlight = registry.get(selectionHighlightName);
  if (!highlight) {
    highlight = new targetWindow.Highlight();
    registry.set(selectionHighlightName, highlight);
  }
  return highlight;
}
function getVisibleBoundingRect(range) {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  for (const rect of range.getClientRects()) {
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
    left = Math.min(left, rect.left);
  }
  if (bottom === Number.NEGATIVE_INFINITY) {
    const fallback = range.getBoundingClientRect();
    return fallback.width || fallback.height ? fallback : void 0;
  }
  return { top, bottom, left };
}
let ResponseSelectionSideChatController = class extends Disposable {
  constructor(_widget, _sessionsManagementService, _sessionsService, _sessionsPartService, _logService, _notificationService) {
    super();
    this._widget = _widget;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._sessionsPartService = _sessionsPartService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    /** Pins the transcript while a selection or the question input is active. */
    this._autoScrollHold = this._register(new MutableDisposable());
    /** Bumped on a genuine chat navigation/force-dismiss so a stale submission's completion/error handler can no-op. */
    this._generation = 0;
    this._input = this._register(new FeedbackInputWidget({
      placeholder: localize("sessions.selectionSideChat.placeholder", "Ask Question"),
      ariaLabel: localize("sessions.selectionSideChat.ariaLabel", "Ask a question about the selected response text"),
      getMaxContentWidth: () => this._widget.domNode.clientWidth,
      primaryAction: {
        label: localize("sessions.selectionSideChat.ask", "Ask Question"),
        icon: Codicon.arrowUpCompact,
        keybindingLabel: localize("sessions.selectionSideChat.enter", "Enter")
      }
    }));
    this._widget.domNode.appendChild(this._input.domNode);
    this._register(this._input.onDidTriggerPrimary(() => this._submit()));
    this._register(dom.addStandardDisposableListener(this._input.inputElement, "keydown", (e) => {
      if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._dismiss();
        return;
      }
      if (e.keyCode === KeyCode.Enter) {
        if (e.browserEvent.isComposing || e.shiftKey) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._submit();
      }
    }));
    this._register(dom.addStandardDisposableListener(this._input.inputElement, "keypress", (e) => {
      e.stopPropagation();
    }));
    this._register(dom.addStandardDisposableListener(this._input.inputElement, "input", () => {
      this._input.autoSize();
      this._input.updateActionEnabled();
    }));
    const window = dom.getWindow(this._widget.domNode);
    this._register(dom.addDisposableListener(window.document, "selectionchange", () => this._onSelectionChange()));
    this._register(this._widget.onDidScroll(() => this._reposition()));
    this._register(dom.addDisposableListener(this._widget.domNode, "scroll", () => this._reposition(), true));
    this._register(toDisposable(() => this._paintHighlight(void 0)));
  }
  /**
   * Tracks which chat the current transcript belongs to, for side-chat
   * creation. `ChatView` re-invokes this for the same chat on unrelated
   * observable changes, so only force-dismiss on a genuine resource change.
   */
  setChat(chat) {
    const changedChat = !this._chat || this._chat.resource.toString() !== chat.resource.toString();
    this._chat = chat;
    if (changedChat) {
      this._dismiss(true);
    }
  }
  _onSelectionChange() {
    this._updateAutoScrollHold();
    if (dom.isAncestorOfActiveElement(this._input.domNode)) {
      this._syncHighlight();
      return;
    }
    if (this._input.isBusy) {
      this._syncHighlight();
      return;
    }
    const resolved = resolveResponseSelection(this._widget);
    if (!resolved) {
      this._dismiss();
      return;
    }
    this._resolved = resolved;
    this._showFor();
  }
  /**
   * Pins the transcript while the user is working with a selection: a growing
   * response that scrolls itself to the bottom would otherwise drag the text
   * out from under the selection (and the affordance anchored to it). Covers
   * any selection in the transcript, not just ones that resolve to a single
   * response, since auto-scrolling mid-drag is disruptive either way.
   */
  _updateAutoScrollHold() {
    const shouldHold = !!this._resolved || this._hasTranscriptSelection();
    if (shouldHold) {
      this._autoScrollHold.value ??= this._widget.holdAutoScroll();
    } else {
      this._autoScrollHold.clear();
    }
  }
  _hasTranscriptSelection() {
    const selection = dom.getWindow(this._widget.domNode).getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
      return false;
    }
    const range = selection.getRangeAt(0);
    return this._widget.transcriptDomNode.contains(range.commonAncestorContainer);
  }
  /**
   * Keeps the captured selection visible. The native selection disappears as
   * soon as focus moves into the "Ask Question" input, so a CSS custom
   * highlight takes over painting the range for as long as the affordance is
   * open; while the native selection still covers it the browser paints it
   * and the highlight stays off so the two never stack.
   */
  _syncHighlight() {
    const range = this._resolved?.range;
    const nativeSelection = dom.getWindow(this._widget.domNode).getSelection();
    const paintedNatively = !!nativeSelection && !nativeSelection.isCollapsed && !!nativeSelection.toString().trim();
    this._paintHighlight(range && !paintedNatively ? range : void 0);
  }
  _paintHighlight(range) {
    if (this._paintedRange === range) {
      return;
    }
    const highlight = getSelectionHighlight(dom.getWindow(this._widget.domNode));
    if (!highlight) {
      return;
    }
    if (this._paintedRange) {
      highlight.delete(this._paintedRange);
    }
    if (range) {
      highlight.add(range);
    }
    this._paintedRange = range;
  }
  _showFor() {
    this._input.show();
    this._input.autoSize();
    this._input.updateActionEnabled();
    this._syncHighlight();
    this._reposition();
  }
  /**
   * Re-anchors the input to the (live) selection range. Called on every
   * transcript scroll so the overlay tracks the text it belongs to instead of
   * staying pinned where the selection used to be.
   */
  _reposition() {
    const resolved = this._resolved;
    if (!resolved) {
      return;
    }
    const selectionRect = getVisibleBoundingRect(resolved.range);
    if (!selectionRect) {
      this._dismiss();
      return;
    }
    this._input.show();
    const originRect = this._widget.domNode.getBoundingClientRect();
    const bounds = this._transcriptBounds();
    const gap = 4;
    const inputWidth = this._input.domNode.offsetWidth;
    const inputHeight = this._input.domNode.offsetHeight;
    const minLeft = bounds.left - originRect.left;
    const maxLeft = Math.max(minLeft, minLeft + bounds.width - inputWidth);
    const left = clamp(selectionRect.left - originRect.left, minLeft, maxLeft);
    const minTop = bounds.top - originRect.top;
    const maxTop = Math.max(minTop, minTop + bounds.height - inputHeight);
    let top = selectionRect.bottom - originRect.top + gap;
    if (top > maxTop) {
      const aboveTop = selectionRect.top - originRect.top - inputHeight - gap;
      top = aboveTop >= minTop ? aboveTop : maxTop;
    }
    top = clamp(top, minTop, maxTop);
    this._input.domNode.style.top = `${top}px`;
    this._input.domNode.style.left = `${left}px`;
  }
  /**
   * Box the overlay is confined to, in viewport coordinates: the scrollable
   * transcript, further clipped to the window so it can never render out of
   * sight on a small window.
   */
  _transcriptBounds() {
    const rect = this._widget.transcriptDomNode.getBoundingClientRect();
    const viewport = dom.getWindow(this._widget.domNode);
    const top = Math.max(rect.top, 0);
    const left = Math.max(rect.left, 0);
    const bottom = Math.min(rect.top + rect.height, viewport.innerHeight);
    const right = Math.min(rect.left + rect.width, viewport.innerWidth);
    return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  /**
   * Dismisses the input. While a submission is pending (`_input.isBusy`),
   * only a genuine view change (`force`, from {@link setChat}) may dismiss
   * it — outside interactions like Escape or selection invalidation must not
   * race the in-flight create/open/send.
   */
  _dismiss(force = false) {
    if (!force && this._input.isBusy) {
      return;
    }
    if (force) {
      this._generation++;
    }
    const hadFocus = dom.isAncestorOfActiveElement(this._input.domNode);
    this._resolved = void 0;
    this._paintHighlight(void 0);
    this._updateAutoScrollHold();
    this._input.setBusy(false);
    this._input.hide();
    this._input.clearInput();
    if (hadFocus) {
      this._widget.focusResponseItem(true);
    }
  }
  _submit() {
    const resolved = this._resolved;
    const chat = this._chat;
    const query = this._input.inputElement.value.trim();
    if (!resolved || !chat || !query || this._input.isBusy) {
      return;
    }
    const found = this._sessionsManagementService.getSessionForChatResource(chat.resource);
    if (!found) {
      this._notificationService.warn(localize("sessions.selectionSideChat.sessionUnavailable", "A side chat cannot be created from this conversation."));
      return;
    }
    const { session } = found;
    if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
      this._notificationService.warn(localize("sessions.selectionSideChat.unsupported", "This conversation does not support side chats."));
      return;
    }
    this._input.setBusy(true, localize("sessions.selectionSideChat.busy", "Asking question\u2026"));
    const generation = this._generation;
    createAndSendSideChat(this._sessionsManagementService, this._sessionsService, this._sessionsPartService, session, chat.resource, resolved.response.requestId, { query }, { text: resolved.text }).then(() => {
      if (this._generation !== generation) {
        return;
      }
      this._input.setBusy(false);
    }).catch((err) => {
      this._logService.error("[selectionSideChat] Failed to create side chat", err);
      if (this._generation !== generation) {
        return;
      }
      this._notificationService.error(localize("sessions.selectionSideChat.createFailed", "The side chat could not be created."));
      this._input.setBusy(false);
      this._input.inputElement.value = query;
      this._input.autoSize();
      this._input.updateActionEnabled();
      this._input.inputElement.focus();
    });
  }
};
ResponseSelectionSideChatController = __decorateClass([
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, ISessionsPartService),
  __decorateParam(4, ILogService),
  __decorateParam(5, INotificationService)
], ResponseSelectionSideChatController);
export {
  ResponseSelectionSideChatController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxccmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgZWRpdG9yU2VsZWN0aW9uQmFja2dyb3VuZCwgZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvZWRpdG9yQ29sb3JzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IEZlZWRiYWNrSW5wdXRXaWRnZXQgfSBmcm9tICcuLi8uLi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvZmVlZGJhY2tJbnB1dFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXQsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkUmVzcG9uc2VTZWxlY3Rpb24sIHJlc29sdmVSZXNwb25zZVNlbGVjdGlvbiB9IGZyb20gJy4vcmVzcG9uc2VTZWxlY3Rpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBbmRTZW5kU2lkZUNoYXQgfSBmcm9tICcuL3NpZGVDaGF0T3JjaGVzdHJhdGlvbi5qcyc7XG5cbi8qKlxuICogTmFtZSBvZiB0aGUgQ1NTIGN1c3RvbSBoaWdobGlnaHQgdGhhdCBzdGFuZHMgaW4gZm9yIHRoZSBuYXRpdmUgc2VsZWN0aW9uXG4gKiBvbmNlIHRoZSBicm93c2VyIGNvbGxhcHNlcyBpdC5cbiAqL1xuY29uc3Qgc2VsZWN0aW9uSGlnaGxpZ2h0TmFtZSA9ICdjaGF0LXJlc3BvbnNlLXNlbGVjdGlvbic7XG5cbi8vIEhpZ2hsaWdodCBwc2V1ZG8tZWxlbWVudHMgaW5oZXJpdCBjdXN0b20gcHJvcGVydGllcyBmcm9tIHRoZSByb290IGVsZW1lbnRcbi8vIG9ubHksIHNvIHRoZXkgY2Fubm90IHNlZSB0aGUgYC0tdnNjb2RlLSpgIHRoZW1lIHZhcmlhYmxlcyAod2hpY2ggYXJlIHNjb3BlZFxuLy8gdG8gYC5tb25hY28td29ya2JlbmNoYCk7IHRoZSBjb2xvciBoYXMgdG8gYmUgYmFrZWQgaW50byB0aGUgcnVsZSBpbnN0ZWFkLlxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgYmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQpO1xuXHRpZiAoIWJhY2tncm91bmQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Ly8gSGlnaCBjb250cmFzdCB0aGVtZXMgc2VsZWN0IHdpdGggYW4gb3BhcXVlIGJhY2tncm91bmQgYW5kIHJlbHkgb24gdGhlXG5cdC8vIHBhaXJlZCBmb3JlZ3JvdW5kIHRvIGtlZXAgdGhlIHRleHQgcmVhZGFibGUuXG5cdGNvbnN0IGZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JTZWxlY3Rpb25Gb3JlZ3JvdW5kKTtcblx0Y29sbGVjdG9yLmFkZFJ1bGUoYDo6aGlnaGxpZ2h0KCR7c2VsZWN0aW9uSGlnaGxpZ2h0TmFtZX0pIHtcblx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2JhY2tncm91bmR9O1xuXHRcdCR7Zm9yZWdyb3VuZCA/IGBjb2xvcjogJHtmb3JlZ3JvdW5kfTtgIDogJyd9XG5cdH1gKTtcbn0pO1xuXG4vKipcbiAqIFRoZSBoaWdobGlnaHQgcmVnaXN0cnkgaXMgcGVyLXdpbmRvdyBhbmQgc2hhcmVkIGJ5IGV2ZXJ5IGNoYXQgdmlldyBpbiBpdCwgc29cbiAqIGFsbCBjb250cm9sbGVycyBjb250cmlidXRlIHJhbmdlcyB0byBvbmUgcmVnaXN0ZXJlZCB7QGxpbmsgSGlnaGxpZ2h0fSByYXRoZXJcbiAqIHRoYW4gb3ZlcndyaXRpbmcgZWFjaCBvdGhlcidzIGVudHJ5LlxuICovXG5mdW5jdGlvbiBnZXRTZWxlY3Rpb25IaWdobGlnaHQodGFyZ2V0V2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IEhpZ2hsaWdodCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlZ2lzdHJ5ID0gdGFyZ2V0V2luZG93LkNTUz8uaGlnaGxpZ2h0cztcblx0aWYgKCFyZWdpc3RyeSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIENTUyBDdXN0b20gSGlnaGxpZ2h0IEFQSSB1bmF2YWlsYWJsZVxuXHR9XG5cdGxldCBoaWdobGlnaHQgPSByZWdpc3RyeS5nZXQoc2VsZWN0aW9uSGlnaGxpZ2h0TmFtZSk7XG5cdGlmICghaGlnaGxpZ2h0KSB7XG5cdFx0aGlnaGxpZ2h0ID0gbmV3IHRhcmdldFdpbmRvdy5IaWdobGlnaHQoKTtcblx0XHRyZWdpc3RyeS5zZXQoc2VsZWN0aW9uSGlnaGxpZ2h0TmFtZSwgaGlnaGxpZ2h0KTtcblx0fVxuXHRyZXR1cm4gaGlnaGxpZ2h0O1xufVxuXG4vKipcbiAqIEJvdW5kaW5nIGJveCBvZiB0aGUgcmFuZ2UncyAqdmlzaWJsZSogbGluZSBib3hlcy4gYFJhbmdlLmdldEJvdW5kaW5nQ2xpZW50UmVjdGBcbiAqIGluY2x1ZGVzIHRoZSBlbXB0eSBib3ggYSBsaW5lIHNlbGVjdGlvbiBsZWF2ZXMgYXQgdGhlIHN0YXJ0IG9mIHRoZSBmb2xsb3dpbmdcbiAqIGJsb2NrLCB3aGljaCB3b3VsZCBwdXNoIHRoZSBhZmZvcmRhbmNlIGEgbGluZSB0b28gZmFyIGRvd24uXG4gKi9cbmZ1bmN0aW9uIGdldFZpc2libGVCb3VuZGluZ1JlY3QocmFuZ2U6IFJhbmdlKTogeyB0b3A6IG51bWJlcjsgYm90dG9tOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0bGV0IHRvcCA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0bGV0IGJvdHRvbSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblx0bGV0IGxlZnQgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdGZvciAoY29uc3QgcmVjdCBvZiByYW5nZS5nZXRDbGllbnRSZWN0cygpKSB7XG5cdFx0aWYgKHJlY3Qud2lkdGggPT09IDAgfHwgcmVjdC5oZWlnaHQgPT09IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHR0b3AgPSBNYXRoLm1pbih0b3AsIHJlY3QudG9wKTtcblx0XHRib3R0b20gPSBNYXRoLm1heChib3R0b20sIHJlY3QuYm90dG9tKTtcblx0XHRsZWZ0ID0gTWF0aC5taW4obGVmdCwgcmVjdC5sZWZ0KTtcblx0fVxuXHRpZiAoYm90dG9tID09PSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFkpIHtcblx0XHRjb25zdCBmYWxsYmFjayA9IHJhbmdlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHJldHVybiBmYWxsYmFjay53aWR0aCB8fCBmYWxsYmFjay5oZWlnaHQgPyBmYWxsYmFjayA6IHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyB0b3AsIGJvdHRvbSwgbGVmdCB9O1xufVxuXG4vKipcbiAqIEFnZW50cy13aW5kb3ctb25seSBjb250cm9sbGVyIHRoYXQgc2hvd3MgYW4gXCJBc2sgUXVlc3Rpb25cIiBpbnB1dCAocmV1c2luZ1xuICoge0BsaW5rIEZlZWRiYWNrSW5wdXRXaWRnZXR9KSB3aGVuIHRoZSB1c2VyIHNlbGVjdHMgdGV4dCB3aXRoaW4gYSBzaW5nbGVcbiAqIGFzc2lzdGFudCByZXNwb25zZSdzIHJlbmRlcmVkIG1hcmtkb3duLCBhbmQgY3JlYXRlcyBhIHNpZGUgY2hhdCBhbmNob3JlZCB0b1xuICogdGhhdCByZXNwb25zZSB3aGVuIHN1Ym1pdHRlZC4gT3duZWQgYnkgYENoYXRWaWV3YCBzbyB0aGlzIGFmZm9yZGFuY2UgbmV2ZXJcbiAqIGFwcGVhcnMgaW4gdGhlIHJlZ3VsYXIgd29ya2JlbmNoIGNoYXQgc3VyZmFjZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlc3BvbnNlU2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXQ6IEZlZWRiYWNrSW5wdXRXaWRnZXQ7XG5cdHByaXZhdGUgX3Jlc29sdmVkOiBJUmVzb2x2ZWRSZXNwb25zZVNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0LyoqIFJhbmdlIGN1cnJlbnRseSBwYWludGVkIHZpYSB0aGUgQ1NTIGN1c3RvbSBoaWdobGlnaHQsIGlmIGFueS4gKi9cblx0cHJpdmF0ZSBfcGFpbnRlZFJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZDtcblx0LyoqIFBpbnMgdGhlIHRyYW5zY3JpcHQgd2hpbGUgYSBzZWxlY3Rpb24gb3IgdGhlIHF1ZXN0aW9uIGlucHV0IGlzIGFjdGl2ZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b1Njcm9sbEhvbGQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIF9jaGF0OiBJQ2hhdCB8IHVuZGVmaW5lZDtcblx0LyoqIEJ1bXBlZCBvbiBhIGdlbnVpbmUgY2hhdCBuYXZpZ2F0aW9uL2ZvcmNlLWRpc21pc3Mgc28gYSBzdGFsZSBzdWJtaXNzaW9uJ3MgY29tcGxldGlvbi9lcnJvciBoYW5kbGVyIGNhbiBuby1vcC4gKi9cblx0cHJpdmF0ZSBfZ2VuZXJhdGlvbiA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBJQ2hhdFdpZGdldCxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQYXJ0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1BhcnRTZXJ2aWNlOiBJU2Vzc2lvbnNQYXJ0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmVlZGJhY2tJbnB1dFdpZGdldCh7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3Nlc3Npb25zLnNlbGVjdGlvblNpZGVDaGF0LnBsYWNlaG9sZGVyJywgXCJBc2sgUXVlc3Rpb25cIiksXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdzZXNzaW9ucy5zZWxlY3Rpb25TaWRlQ2hhdC5hcmlhTGFiZWwnLCBcIkFzayBhIHF1ZXN0aW9uIGFib3V0IHRoZSBzZWxlY3RlZCByZXNwb25zZSB0ZXh0XCIpLFxuXHRcdFx0Z2V0TWF4Q29udGVudFdpZHRoOiAoKSA9PiB0aGlzLl93aWRnZXQuZG9tTm9kZS5jbGllbnRXaWR0aCxcblx0XHRcdHByaW1hcnlBY3Rpb246IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZXNzaW9ucy5zZWxlY3Rpb25TaWRlQ2hhdC5hc2snLCBcIkFzayBRdWVzdGlvblwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1VwQ29tcGFjdCxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsOiBsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQuZW50ZXInLCBcIkVudGVyXCIpLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fd2lkZ2V0LmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faW5wdXQuZG9tTm9kZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dC5vbkRpZFRyaWdnZXJQcmltYXJ5KCgpID0+IHRoaXMuX3N1Ym1pdCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0LmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fZGlzbWlzcygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdGlmIChlLmJyb3dzZXJFdmVudC5pc0NvbXBvc2luZyB8fCBlLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdFx0Ly8gTGV0IElNRSBjb21wb3NpdGlvbiBmaW5pc2gsIG9yIFNoaWZ0K0VudGVyIGluc2VydCBhIG5ld2xpbmUuXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc3VibWl0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbnB1dC5pbnB1dEVsZW1lbnQsICdrZXlwcmVzcycsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0LmlucHV0RWxlbWVudCwgJ2lucHV0JywgKCkgPT4ge1xuXHRcdFx0dGhpcy5faW5wdXQuYXV0b1NpemUoKTtcblx0XHRcdHRoaXMuX2lucHV0LnVwZGF0ZUFjdGlvbkVuYWJsZWQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3aW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuX3dpZGdldC5kb21Ob2RlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdy5kb2N1bWVudCwgJ3NlbGVjdGlvbmNoYW5nZScsICgpID0+IHRoaXMuX29uU2VsZWN0aW9uQ2hhbmdlKCkpKTtcblx0XHQvLyBUaGUgdHJhbnNjcmlwdCBpcyBhIHZpcnR1YWxpemVkIGxpc3QgdGhhdCBzY3JvbGxzIGJ5IHRyYW5zZm9ybSwgc28gaXRcblx0XHQvLyBuZXZlciBmaXJlcyBhIERPTSBzY3JvbGwgZXZlbnQ7IGZvbGxvdyBpdHMgb3duIHNjcm9sbCBldmVudCBpbnN0ZWFkLlxuXHRcdC8vIFRoZSBjYXB0dXJlLXBoYXNlIERPTSBsaXN0ZW5lciBhZGRpdGlvbmFsbHkgY292ZXJzIG5lc3RlZCBzY3JvbGxlcnNcblx0XHQvLyAoYSBzY3JvbGxhYmxlIGNvZGUgYmxvY2sgd2l0aGluIGEgcmVzcG9uc2UpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpZGdldC5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLl9yZXBvc2l0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3dpZGdldC5kb21Ob2RlLCAnc2Nyb2xsJywgKCkgPT4gdGhpcy5fcmVwb3NpdGlvbigpLCB0cnVlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3BhaW50SGlnaGxpZ2h0KHVuZGVmaW5lZCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFja3Mgd2hpY2ggY2hhdCB0aGUgY3VycmVudCB0cmFuc2NyaXB0IGJlbG9uZ3MgdG8sIGZvciBzaWRlLWNoYXRcblx0ICogY3JlYXRpb24uIGBDaGF0Vmlld2AgcmUtaW52b2tlcyB0aGlzIGZvciB0aGUgc2FtZSBjaGF0IG9uIHVucmVsYXRlZFxuXHQgKiBvYnNlcnZhYmxlIGNoYW5nZXMsIHNvIG9ubHkgZm9yY2UtZGlzbWlzcyBvbiBhIGdlbnVpbmUgcmVzb3VyY2UgY2hhbmdlLlxuXHQgKi9cblx0c2V0Q2hhdChjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWRDaGF0ID0gIXRoaXMuX2NoYXQgfHwgdGhpcy5fY2hhdC5yZXNvdXJjZS50b1N0cmluZygpICE9PSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fY2hhdCA9IGNoYXQ7XG5cdFx0aWYgKGNoYW5nZWRDaGF0KSB7XG5cdFx0XHR0aGlzLl9kaXNtaXNzKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uU2VsZWN0aW9uQ2hhbmdlKCk6IHZvaWQge1xuXHRcdC8vIFJlZmxlY3QgdGhlIG5ldyBzZWxlY3Rpb24gc3RhdGUgZmlyc3Q6IGV2ZXJ5IGJyYW5jaCBiZWxvdyAoaW5jbHVkaW5nXG5cdFx0Ly8gdGhlIGVhcmx5IHJldHVybnMpIG5lZWRzIHRoZSBob2xkIHRvIG1hdGNoIHdoYXQgaXMgY3VycmVudGx5IHNlbGVjdGVkLlxuXHRcdHRoaXMuX3VwZGF0ZUF1dG9TY3JvbGxIb2xkKCk7XG5cdFx0Ly8gVGhlIGJyb3dzZXIgY29sbGFwc2VzIHRoZSBkb2N1bWVudCBzZWxlY3Rpb24gdGhlIG1vbWVudCB0aGUgXCJBc2tcblx0XHQvLyBRdWVzdGlvblwiIHRleHRhcmVhIHJlY2VpdmVzIGZvY3VzICh0ZXh0YXJlYXMgZG9uJ3QgcGFydGljaXBhdGUgaW5cblx0XHQvLyB0aGUgU2VsZWN0aW9uIEFQSSkuIElnbm9yZSBzZWxlY3Rpb25jaGFuZ2UgZW50aXJlbHkgd2hpbGUgZm9jdXMgaXNcblx0XHQvLyBpbnNpZGUgdGhlIGlucHV0IHNvIHR5cGluZyBkb2Vzbid0IGRpc21pc3MgdGhlIHdpZGdldCBpdCBqdXN0XG5cdFx0Ly8gY2FwdHVyZWQ7IGEgcmVhbCBvdXRzaWRlIGludmFsaWRhdGlvbiBpcyBoYW5kbGVkIG9uY2UgZm9jdXNcblx0XHQvLyBhY3R1YWxseSBsZWF2ZXMgKHRoZSBuZXh0IHNlbGVjdGlvbmNoYW5nZSBydW5zIHdpdGggZm9jdXMgb3V0c2lkZSkuXG5cdFx0aWYgKGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuX2lucHV0LmRvbU5vZGUpKSB7XG5cdFx0XHR0aGlzLl9zeW5jSGlnaGxpZ2h0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEEgcGVuZGluZyBzdWJtaXNzaW9uIG93bnMgdGhlIG92ZXJsYXkgdW50aWwgdGhlIHZpZXcgY2hhbmdlcyAoc2VlXG5cdFx0Ly8gYF9kaXNtaXNzYCk7IGRvbid0IGxldCBhbiBpbmNpZGVudGFsIHNlbGVjdGlvbiBjaGFuZ2UgcmVwb3NpdGlvbiBvclxuXHRcdC8vIHN3YXAgdGhlIGNhcHR1cmVkIHNlbGVjdGlvbiBvdXQgZnJvbSB1bmRlciBpdC5cblx0XHRpZiAodGhpcy5faW5wdXQuaXNCdXN5KSB7XG5cdFx0XHR0aGlzLl9zeW5jSGlnaGxpZ2h0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVJlc3BvbnNlU2VsZWN0aW9uKHRoaXMuX3dpZGdldCk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0dGhpcy5fZGlzbWlzcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNvbHZlZCA9IHJlc29sdmVkO1xuXHRcdHRoaXMuX3Nob3dGb3IoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaW5zIHRoZSB0cmFuc2NyaXB0IHdoaWxlIHRoZSB1c2VyIGlzIHdvcmtpbmcgd2l0aCBhIHNlbGVjdGlvbjogYSBncm93aW5nXG5cdCAqIHJlc3BvbnNlIHRoYXQgc2Nyb2xscyBpdHNlbGYgdG8gdGhlIGJvdHRvbSB3b3VsZCBvdGhlcndpc2UgZHJhZyB0aGUgdGV4dFxuXHQgKiBvdXQgZnJvbSB1bmRlciB0aGUgc2VsZWN0aW9uIChhbmQgdGhlIGFmZm9yZGFuY2UgYW5jaG9yZWQgdG8gaXQpLiBDb3ZlcnNcblx0ICogYW55IHNlbGVjdGlvbiBpbiB0aGUgdHJhbnNjcmlwdCwgbm90IGp1c3Qgb25lcyB0aGF0IHJlc29sdmUgdG8gYSBzaW5nbGVcblx0ICogcmVzcG9uc2UsIHNpbmNlIGF1dG8tc2Nyb2xsaW5nIG1pZC1kcmFnIGlzIGRpc3J1cHRpdmUgZWl0aGVyIHdheS5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUF1dG9TY3JvbGxIb2xkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNob3VsZEhvbGQgPSAhIXRoaXMuX3Jlc29sdmVkIHx8IHRoaXMuX2hhc1RyYW5zY3JpcHRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2hvdWxkSG9sZCkge1xuXHRcdFx0dGhpcy5fYXV0b1Njcm9sbEhvbGQudmFsdWUgPz89IHRoaXMuX3dpZGdldC5ob2xkQXV0b1Njcm9sbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hdXRvU2Nyb2xsSG9sZC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc1RyYW5zY3JpcHRTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZG9tLmdldFdpbmRvdyh0aGlzLl93aWRnZXQuZG9tTm9kZSkuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24gfHwgc2VsZWN0aW9uLmlzQ29sbGFwc2VkIHx8ICFzZWxlY3Rpb24ucmFuZ2VDb3VudCB8fCAhc2VsZWN0aW9uLnRvU3RyaW5nKCkudHJpbSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlQXQoMCk7XG5cdFx0Ly8gU2NvcGVkIHRvIHRoZSB0cmFuc2NyaXB0IHNwZWNpZmljYWxseTogc2VsZWN0aW5nIHRleHQgZWxzZXdoZXJlIGluIHRoZVxuXHRcdC8vIGNoYXQgdmlldyAoYSBiYW5uZXIsIHRoZSBpbnB1dCkgc2F5cyBub3RoaW5nIGFib3V0IHdhbnRpbmcgdGhlXG5cdFx0Ly8gdHJhbnNjcmlwdCB0byBob2xkIHN0aWxsLlxuXHRcdHJldHVybiB0aGlzLl93aWRnZXQudHJhbnNjcmlwdERvbU5vZGUuY29udGFpbnMocmFuZ2UuY29tbW9uQW5jZXN0b3JDb250YWluZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXBzIHRoZSBjYXB0dXJlZCBzZWxlY3Rpb24gdmlzaWJsZS4gVGhlIG5hdGl2ZSBzZWxlY3Rpb24gZGlzYXBwZWFycyBhc1xuXHQgKiBzb29uIGFzIGZvY3VzIG1vdmVzIGludG8gdGhlIFwiQXNrIFF1ZXN0aW9uXCIgaW5wdXQsIHNvIGEgQ1NTIGN1c3RvbVxuXHQgKiBoaWdobGlnaHQgdGFrZXMgb3ZlciBwYWludGluZyB0aGUgcmFuZ2UgZm9yIGFzIGxvbmcgYXMgdGhlIGFmZm9yZGFuY2UgaXNcblx0ICogb3Blbjsgd2hpbGUgdGhlIG5hdGl2ZSBzZWxlY3Rpb24gc3RpbGwgY292ZXJzIGl0IHRoZSBicm93c2VyIHBhaW50cyBpdFxuXHQgKiBhbmQgdGhlIGhpZ2hsaWdodCBzdGF5cyBvZmYgc28gdGhlIHR3byBuZXZlciBzdGFjay5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNIaWdobGlnaHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9yZXNvbHZlZD8ucmFuZ2U7XG5cdFx0Y29uc3QgbmF0aXZlU2VsZWN0aW9uID0gZG9tLmdldFdpbmRvdyh0aGlzLl93aWRnZXQuZG9tTm9kZSkuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgcGFpbnRlZE5hdGl2ZWx5ID0gISFuYXRpdmVTZWxlY3Rpb24gJiYgIW5hdGl2ZVNlbGVjdGlvbi5pc0NvbGxhcHNlZCAmJiAhIW5hdGl2ZVNlbGVjdGlvbi50b1N0cmluZygpLnRyaW0oKTtcblx0XHR0aGlzLl9wYWludEhpZ2hsaWdodChyYW5nZSAmJiAhcGFpbnRlZE5hdGl2ZWx5ID8gcmFuZ2UgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFpbnRIaWdobGlnaHQocmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BhaW50ZWRSYW5nZSA9PT0gcmFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ID0gZ2V0U2VsZWN0aW9uSGlnaGxpZ2h0KGRvbS5nZXRXaW5kb3codGhpcy5fd2lkZ2V0LmRvbU5vZGUpKTtcblx0XHRpZiAoIWhpZ2hsaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcGFpbnRlZFJhbmdlKSB7XG5cdFx0XHRoaWdobGlnaHQuZGVsZXRlKHRoaXMuX3BhaW50ZWRSYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0aGlnaGxpZ2h0LmFkZChyYW5nZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BhaW50ZWRSYW5nZSA9IHJhbmdlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0ZvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dC5zaG93KCk7XG5cdFx0dGhpcy5faW5wdXQuYXV0b1NpemUoKTtcblx0XHR0aGlzLl9pbnB1dC51cGRhdGVBY3Rpb25FbmFibGVkKCk7XG5cdFx0dGhpcy5fc3luY0hpZ2hsaWdodCgpO1xuXHRcdHRoaXMuX3JlcG9zaXRpb24oKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1hbmNob3JzIHRoZSBpbnB1dCB0byB0aGUgKGxpdmUpIHNlbGVjdGlvbiByYW5nZS4gQ2FsbGVkIG9uIGV2ZXJ5XG5cdCAqIHRyYW5zY3JpcHQgc2Nyb2xsIHNvIHRoZSBvdmVybGF5IHRyYWNrcyB0aGUgdGV4dCBpdCBiZWxvbmdzIHRvIGluc3RlYWQgb2Zcblx0ICogc3RheWluZyBwaW5uZWQgd2hlcmUgdGhlIHNlbGVjdGlvbiB1c2VkIHRvIGJlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVwb3NpdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVkO1xuXHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uUmVjdCA9IGdldFZpc2libGVCb3VuZGluZ1JlY3QocmVzb2x2ZWQucmFuZ2UpO1xuXHRcdGlmICghc2VsZWN0aW9uUmVjdCkge1xuXHRcdFx0Ly8gVGhlIHRyYW5zY3JpcHQgaXMgdmlydHVhbGl6ZWQsIHNvIHNjcm9sbGluZyBmYXIgZW5vdWdoIHJlbW92ZXMgdGhlXG5cdFx0XHQvLyBzZWxlY3RlZCByb3cuIFJlbW92aW5nIGEgbm9kZSByZS1ob21lcyBhbnkgbGl2ZSByYW5nZSBvbnRvIHRoZVxuXHRcdFx0Ly8gc3Vydml2aW5nIHBhcmVudCwgY29sbGFwc2luZyBpdCwgc28gdGhlIHJhbmdlIHN0aWxsIGxvb2tzIGF0dGFjaGVkXG5cdFx0XHQvLyBidXQgbm8gbG9uZ2VyIGNvdmVycyBhbnl0aGluZy4gVGhlIGFuY2hvcmVkIHRleHQgY2Fubm90IGNvbWUgYmFja1xuXHRcdFx0Ly8gXHUyMDE0IHJlLXJlbmRlcmluZyBidWlsZHMgbmV3IG5vZGVzIFx1MjAxNCBzbyBkaXNtaXNzIHJhdGhlciB0aGFuIGxlYXZlIHRoZVxuXHRcdFx0Ly8gaW5wdXQgcG9pbnRpbmcgYXQgbm90aGluZyBhbmQgdGhlIHRyYW5zY3JpcHQgcGlubmVkIGZvcmV2ZXIuXG5cdFx0XHR0aGlzLl9kaXNtaXNzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lucHV0LnNob3coKTtcblxuXHRcdC8vIFRoZSBvdmVybGF5IGlzIGEgY2hpbGQgb2YgdGhlIHdpZGdldCwgc28gaXRzIGNvb3JkaW5hdGVzIGFyZSByZWxhdGl2ZVxuXHRcdC8vIHRvIHRoYXQsIGJ1dCBpdCBpcyBjb25maW5lZCB0byB0aGUgc2Nyb2xsYWJsZSB0cmFuc2NyaXB0OiBvbmNlIHRoZVxuXHRcdC8vIHNlbGVjdGlvbiBzY3JvbGxzIHBhc3QgYW4gZWRnZSB0aGUgb3ZlcmxheSBwYXJrcyBhdCB0aGF0IGVkZ2UgaW5zdGVhZFxuXHRcdC8vIG9mIGRyaWZ0aW5nIG92ZXIgdGhlIGNoYXQgaW5wdXQgb3Igb2ZmIHRoZSB3aW5kb3cuXG5cdFx0Y29uc3Qgb3JpZ2luUmVjdCA9IHRoaXMuX3dpZGdldC5kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGJvdW5kcyA9IHRoaXMuX3RyYW5zY3JpcHRCb3VuZHMoKTtcblx0XHRjb25zdCBnYXAgPSA0O1xuXHRcdGNvbnN0IGlucHV0V2lkdGggPSB0aGlzLl9pbnB1dC5kb21Ob2RlLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IGlucHV0SGVpZ2h0ID0gdGhpcy5faW5wdXQuZG9tTm9kZS5vZmZzZXRIZWlnaHQ7XG5cblx0XHRjb25zdCBtaW5MZWZ0ID0gYm91bmRzLmxlZnQgLSBvcmlnaW5SZWN0LmxlZnQ7XG5cdFx0Y29uc3QgbWF4TGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIG1pbkxlZnQgKyBib3VuZHMud2lkdGggLSBpbnB1dFdpZHRoKTtcblx0XHRjb25zdCBsZWZ0ID0gY2xhbXAoc2VsZWN0aW9uUmVjdC5sZWZ0IC0gb3JpZ2luUmVjdC5sZWZ0LCBtaW5MZWZ0LCBtYXhMZWZ0KTtcblxuXHRcdGNvbnN0IG1pblRvcCA9IGJvdW5kcy50b3AgLSBvcmlnaW5SZWN0LnRvcDtcblx0XHRjb25zdCBtYXhUb3AgPSBNYXRoLm1heChtaW5Ub3AsIG1pblRvcCArIGJvdW5kcy5oZWlnaHQgLSBpbnB1dEhlaWdodCk7XG5cdFx0bGV0IHRvcCA9IHNlbGVjdGlvblJlY3QuYm90dG9tIC0gb3JpZ2luUmVjdC50b3AgKyBnYXA7XG5cdFx0aWYgKHRvcCA+IG1heFRvcCkge1xuXHRcdFx0Ly8gTm90IGVub3VnaCByb29tIGJlbG93IHRoZSBzZWxlY3Rpb246IHByZWZlciBwbGFjaW5nIGl0IGFib3ZlIGluc3RlYWQuXG5cdFx0XHRjb25zdCBhYm92ZVRvcCA9IHNlbGVjdGlvblJlY3QudG9wIC0gb3JpZ2luUmVjdC50b3AgLSBpbnB1dEhlaWdodCAtIGdhcDtcblx0XHRcdHRvcCA9IGFib3ZlVG9wID49IG1pblRvcCA/IGFib3ZlVG9wIDogbWF4VG9wO1xuXHRcdH1cblx0XHR0b3AgPSBjbGFtcCh0b3AsIG1pblRvcCwgbWF4VG9wKTtcblxuXHRcdHRoaXMuX2lucHV0LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHR0aGlzLl9pbnB1dC5kb21Ob2RlLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblx0fVxuXG5cdC8qKlxuXHQgKiBCb3ggdGhlIG92ZXJsYXkgaXMgY29uZmluZWQgdG8sIGluIHZpZXdwb3J0IGNvb3JkaW5hdGVzOiB0aGUgc2Nyb2xsYWJsZVxuXHQgKiB0cmFuc2NyaXB0LCBmdXJ0aGVyIGNsaXBwZWQgdG8gdGhlIHdpbmRvdyBzbyBpdCBjYW4gbmV2ZXIgcmVuZGVyIG91dCBvZlxuXHQgKiBzaWdodCBvbiBhIHNtYWxsIHdpbmRvdy5cblx0ICovXG5cdHByaXZhdGUgX3RyYW5zY3JpcHRCb3VuZHMoKTogeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHtcblx0XHRjb25zdCByZWN0ID0gdGhpcy5fd2lkZ2V0LnRyYW5zY3JpcHREb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHZpZXdwb3J0ID0gZG9tLmdldFdpbmRvdyh0aGlzLl93aWRnZXQuZG9tTm9kZSk7XG5cdFx0Y29uc3QgdG9wID0gTWF0aC5tYXgocmVjdC50b3AsIDApO1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1heChyZWN0LmxlZnQsIDApO1xuXHRcdGNvbnN0IGJvdHRvbSA9IE1hdGgubWluKHJlY3QudG9wICsgcmVjdC5oZWlnaHQsIHZpZXdwb3J0LmlubmVySGVpZ2h0KTtcblx0XHRjb25zdCByaWdodCA9IE1hdGgubWluKHJlY3QubGVmdCArIHJlY3Qud2lkdGgsIHZpZXdwb3J0LmlubmVyV2lkdGgpO1xuXHRcdHJldHVybiB7IHRvcCwgbGVmdCwgd2lkdGg6IE1hdGgubWF4KDAsIHJpZ2h0IC0gbGVmdCksIGhlaWdodDogTWF0aC5tYXgoMCwgYm90dG9tIC0gdG9wKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc21pc3NlcyB0aGUgaW5wdXQuIFdoaWxlIGEgc3VibWlzc2lvbiBpcyBwZW5kaW5nIChgX2lucHV0LmlzQnVzeWApLFxuXHQgKiBvbmx5IGEgZ2VudWluZSB2aWV3IGNoYW5nZSAoYGZvcmNlYCwgZnJvbSB7QGxpbmsgc2V0Q2hhdH0pIG1heSBkaXNtaXNzXG5cdCAqIGl0IFx1MjAxNCBvdXRzaWRlIGludGVyYWN0aW9ucyBsaWtlIEVzY2FwZSBvciBzZWxlY3Rpb24gaW52YWxpZGF0aW9uIG11c3Qgbm90XG5cdCAqIHJhY2UgdGhlIGluLWZsaWdodCBjcmVhdGUvb3Blbi9zZW5kLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlzbWlzcyhmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCFmb3JjZSAmJiB0aGlzLl9pbnB1dC5pc0J1c3kpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGZvcmNlKSB7XG5cdFx0XHQvLyBBIGdlbnVpbmUgbmF2aWdhdGlvbjogYnVtcCB0aGUgZ2VuZXJhdGlvbiBzbyBhIHN0YWxlIHN1Ym1pc3Npb24ncyBjb21wbGV0aW9uL2Vycm9yIGhhbmRsZXIgbm8tb3BzLlxuXHRcdFx0dGhpcy5fZ2VuZXJhdGlvbisrO1xuXHRcdH1cblx0XHRjb25zdCBoYWRGb2N1cyA9IGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuX2lucHV0LmRvbU5vZGUpO1xuXHRcdHRoaXMuX3Jlc29sdmVkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3BhaW50SGlnaGxpZ2h0KHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdXBkYXRlQXV0b1Njcm9sbEhvbGQoKTtcblx0XHR0aGlzLl9pbnB1dC5zZXRCdXN5KGZhbHNlKTtcblx0XHR0aGlzLl9pbnB1dC5oaWRlKCk7XG5cdFx0dGhpcy5faW5wdXQuY2xlYXJJbnB1dCgpO1xuXHRcdGlmIChoYWRGb2N1cykge1xuXHRcdFx0Ly8gSGlkaW5nIHRoZSBmb2N1c2VkIGlucHV0IHdvdWxkIG90aGVyd2lzZSBsZWF2ZSBmb2N1cyBzdHJhbmRlZCBvblxuXHRcdFx0Ly8gdGhlIGJvZHk7IHJldHVybiBpdCB0byB0aGUgdHJhbnNjcmlwdCBpdCB3YXMgaW52b2tlZCBmcm9tLlxuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzUmVzcG9uc2VJdGVtKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N1Ym1pdCgpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVkO1xuXHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9jaGF0O1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5faW5wdXQuaW5wdXRFbGVtZW50LnZhbHVlLnRyaW0oKTtcblx0XHRpZiAoIXJlc29sdmVkIHx8ICFjaGF0IHx8ICFxdWVyeSB8fCB0aGlzLl9pbnB1dC5pc0J1c3kpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb3VuZCA9IHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZShjaGF0LnJlc291cmNlKTtcblx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3Nlc3Npb25zLnNlbGVjdGlvblNpZGVDaGF0LnNlc3Npb25VbmF2YWlsYWJsZScsIFwiQSBzaWRlIGNoYXQgY2Fubm90IGJlIGNyZWF0ZWQgZnJvbSB0aGlzIGNvbnZlcnNhdGlvbi5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGZvdW5kO1xuXHRcdGlmIChzZXNzaW9uLnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB8fCBzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCkgfHwgIXNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzU2lkZUNoYXQpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQudW5zdXBwb3J0ZWQnLCBcIlRoaXMgY29udmVyc2F0aW9uIGRvZXMgbm90IHN1cHBvcnQgc2lkZSBjaGF0cy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgdGhlIG92ZXJsYXkgdmlzaWJsZSB3aXRoIGEgYnVzeSBzdGF0ZSBpbnN0ZWFkIG9mIGVhZ2VybHlcblx0XHQvLyBkaXNtaXNzaW5nOiBvcGVuaW5nIHRoZSBjcmVhdGVkIHNpZGUgY2hhdCBuYXR1cmFsbHkgZGlzbWlzc2VzIGl0IHZpYVxuXHRcdC8vIGBzZXRDaGF0YDsgb24gZmFpbHVyZSB0aGUgcXVlc3Rpb24gYW5kIG5vcm1hbCBjb250cm9scyBhcmUgcmVzdG9yZWRcblx0XHQvLyBiZWxvdyBzbyB0aGUgdXNlciBjYW4gcmV0cnkuXG5cdFx0dGhpcy5faW5wdXQuc2V0QnVzeSh0cnVlLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQuYnVzeScsIFwiQXNraW5nIHF1ZXN0aW9uXHUyMDI2XCIpKTtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHRjcmVhdGVBbmRTZW5kU2lkZUNoYXQodGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLl9zZXNzaW9uc1BhcnRTZXJ2aWNlLCBzZXNzaW9uLCBjaGF0LnJlc291cmNlLCByZXNvbHZlZC5yZXNwb25zZS5yZXF1ZXN0SWQsIHsgcXVlcnkgfSwgeyB0ZXh0OiByZXNvbHZlZC50ZXh0IH0pXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdC8vIEEgc3RhbGUgY29tcGxldGlvbiBhZnRlciBhIGdlbnVpbmUgbmF2aWdhdGlvbiBmb3JjZS1kaXNtaXNzZWQgdGhpcyBvdmVybGF5IG11c3Qgbm8tb3AuXG5cdFx0XHRcdGlmICh0aGlzLl9nZW5lcmF0aW9uICE9PSBnZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGBzZXRDaGF0YCAoZmlyZWQgYnkgdGhlIHZpZXcgY2hhbmdlIGZyb20gb3BlbmluZyB0aGUgc2lkZVxuXHRcdFx0XHQvLyBjaGF0KSBub3JtYWxseSBkaXNtaXNzZXMgdGhpcyBvdmVybGF5IGFscmVhZHk7IGNsZWFyIGJ1c3lcblx0XHRcdFx0Ly8gZGVmZW5zaXZlbHkgaW4gY2FzZSB0aGF0IGRvZXNuJ3QgaGFwcGVuLlxuXHRcdFx0XHR0aGlzLl9pbnB1dC5zZXRCdXN5KGZhbHNlKTtcblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW3NlbGVjdGlvblNpZGVDaGF0XSBGYWlsZWQgdG8gY3JlYXRlIHNpZGUgY2hhdCcsIGVycik7XG5cdFx0XHRcdGlmICh0aGlzLl9nZW5lcmF0aW9uICE9PSBnZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3Nlc3Npb25zLnNlbGVjdGlvblNpZGVDaGF0LmNyZWF0ZUZhaWxlZCcsIFwiVGhlIHNpZGUgY2hhdCBjb3VsZCBub3QgYmUgY3JlYXRlZC5cIikpO1xuXHRcdFx0XHR0aGlzLl9pbnB1dC5zZXRCdXN5KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5faW5wdXQuaW5wdXRFbGVtZW50LnZhbHVlID0gcXVlcnk7XG5cdFx0XHRcdHRoaXMuX2lucHV0LmF1dG9TaXplKCk7XG5cdFx0XHRcdHRoaXMuX2lucHV0LnVwZGF0ZUFjdGlvbkVuYWJsZWQoKTtcblx0XHRcdFx0dGhpcy5faW5wdXQuaW5wdXRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxZQUF5QixtQkFBbUIsb0JBQW9CO0FBQ3pFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCLGlDQUFpQztBQUNyRSxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFnQixxQkFBcUI7QUFDckMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBcUMsZ0NBQWdDO0FBQ3JFLFNBQVMsNkJBQTZCO0FBTXRDLE1BQU0seUJBQXlCO0FBSy9CLDJCQUEyQixDQUFDLE9BQU8sY0FBYztBQUNoRCxRQUFNLGFBQWEsTUFBTSxTQUFTLHlCQUF5QjtBQUMzRCxNQUFJLENB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
