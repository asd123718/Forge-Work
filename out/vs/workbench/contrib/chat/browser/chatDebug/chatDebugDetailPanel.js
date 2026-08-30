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
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Orientation, Sash, SashState } from "../../../../../base/browser/ui/sash/sash.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { formatEventDetail } from "./chatDebugEventDetailRenderer.js";
import { renderCustomizationDiscoveryContent, fileListToPlainText, renderCustomizationSummaryContent, customizationSummaryToPlainText } from "./chatCustomizationDiscoveryRenderer.js";
import { renderUserMessageContent, renderAgentResponseContent, messageEventToPlainText, renderResolvedMessageContent, resolvedMessageToPlainText } from "./chatDebugMessageContentRenderer.js";
import { renderToolCallContent, toolCallContentToPlainText } from "./chatDebugToolCallContentRenderer.js";
import { renderModelTurnContent, modelTurnContentToPlainText } from "./chatDebugModelTurnContentRenderer.js";
import { renderHookContent, hookContentToPlainText } from "./chatDebugHookContentRenderer.js";
const $ = DOM.$;
const DETAIL_PANEL_DEFAULT_WIDTH = 350;
const DETAIL_PANEL_MIN_WIDTH = 200;
const DETAIL_PANEL_MAX_WIDTH = 800;
let ChatDebugDetailPanel = class extends Disposable {
  constructor(parent, chatDebugService, instantiationService, editorService, clipboardService, hoverService, openerService, languageService) {
    super();
    this.chatDebugService = chatDebugService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.clipboardService = clipboardService;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.languageService = languageService;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._onDidChangeWidth = this._register(new Emitter());
    this.onDidChangeWidth = this._onDidChangeWidth.event;
    this.detailDisposables = this._register(new DisposableStore());
    this.currentDetailText = "";
    this._width = DETAIL_PANEL_DEFAULT_WIDTH;
    this.element = DOM.append(parent, $(".chat-debug-detail-panel"));
    this.contentContainer = $(".chat-debug-detail-content");
    this.scrollable = this._register(new DomScrollableElement(this.contentContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    this.element.style.width = `${this._width}px`;
    DOM.hide(this.element);
    this.sash = this._register(new Sash(parent, {
      getVerticalSashLeft: () => parent.offsetWidth - this._width
    }, { orientation: Orientation.VERTICAL }));
    this.sash.state = SashState.Disabled;
    let sashStartWidth;
    this._register(this.sash.onDidStart(() => sashStartWidth = this._width));
    this._register(this.sash.onDidEnd(() => {
      sashStartWidth = void 0;
      this.sash.layout();
    }));
    this._register(this.sash.onDidChange((e) => {
      if (sashStartWidth === void 0) {
        return;
      }
      const delta = e.startX - e.currentX;
      const newWidth = Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(DETAIL_PANEL_MAX_WIDTH, sashStartWidth + delta));
      this._width = newWidth;
      this.element.style.width = `${newWidth}px`;
      this.sash.layout();
      this._onDidChangeWidth.fire(newWidth);
    }));
    this._register(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        const target = e.target;
        if (target && this.element.contains(target)) {
          e.preventDefault();
          const targetWindow = DOM.getWindow(target);
          const selection = targetWindow.getSelection();
          if (selection) {
            const range = targetWindow.document.createRange();
            range.selectNodeContents(target);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }));
  }
  get width() {
    return this._width;
  }
  async show(event) {
    if (event.id && event.id === this.currentDetailEventId) {
      return;
    }
    this.currentDetailEventId = event.id;
    const resolved = event.id ? await this.chatDebugService.resolveEvent(event.id) : void 0;
    DOM.show(this.element);
    this.sash.state = SashState.Enabled;
    this.sash.layout();
    DOM.clearNode(this.element);
    DOM.clearNode(this.contentContainer);
    this.detailDisposables.clear();
    const header = DOM.append(this.element, $(".chat-debug-detail-header"));
    this.headerElement = header;
    this.element.appendChild(this.scrollable.getDomNode());
    const fullScreenButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize("chatDebug.openInEditor", "Open in Editor"), title: localize("chatDebug.openInEditor", "Open in Editor") }));
    fullScreenButton.element.classList.add("chat-debug-detail-button");
    fullScreenButton.icon = Codicon.goToFile;
    this.firstFocusableElement = fullScreenButton.element;
    this.detailDisposables.add(fullScreenButton.onDidClick(() => {
      this.editorService.openEditor({ contents: this.currentDetailText, resource: void 0 });
    }));
    const copyButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize("chatDebug.copyToClipboard", "Copy"), title: localize("chatDebug.copyToClipboard", "Copy") }));
    copyButton.element.classList.add("chat-debug-detail-button");
    copyButton.icon = Codicon.copy;
    this.detailDisposables.add(copyButton.onDidClick(() => {
      this.clipboardService.writeText(this.currentDetailText);
    }));
    const closeButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize("chatDebug.closeDetail", "Close"), title: localize("chatDebug.closeDetail", "Close") }));
    closeButton.element.classList.add("chat-debug-detail-button");
    closeButton.icon = Codicon.closeSmall;
    this.detailDisposables.add(closeButton.onDidClick(() => {
      this.hide();
    }));
    if (resolved && resolved.kind === "fileList") {
      this.currentDetailText = fileListToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = this.instantiationService.invokeFunction(
        (accessor) => renderCustomizationDiscoveryContent(resolved, this.openerService, accessor.get(IModelService), this.languageService, this.hoverService, accessor.get(ILabelService), this.scrollable)
      );
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "customizationSummary") {
      this.currentDetailText = customizationSummaryToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = this.instantiationService.invokeFunction(
        (accessor) => renderCustomizationSummaryContent(resolved, this.openerService, accessor.get(IModelService), this.languageService, this.hoverService, accessor.get(ILabelService), this.scrollable)
      );
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "toolCall") {
      this.currentDetailText = toolCallContentToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderToolCallContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "message") {
      this.currentDetailText = resolvedMessageToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderResolvedMessageContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "modelTurn") {
      this.currentDetailText = modelTurnContentToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderModelTurnContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "hook") {
      this.currentDetailText = hookContentToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderHookContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (event.kind === "userMessage") {
      this.currentDetailText = messageEventToPlainText(event);
      const { element: contentEl, disposables: contentDisposables } = await renderUserMessageContent(event, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (event.kind === "agentResponse") {
      this.currentDetailText = messageEventToPlainText(event);
      const { element: contentEl, disposables: contentDisposables } = await renderAgentResponseContent(event, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else {
      const pre = DOM.append(this.contentContainer, $("pre"));
      pre.tabIndex = 0;
      if (resolved) {
        this.currentDetailText = resolved.value;
      } else {
        this.currentDetailText = formatEventDetail(event);
      }
      pre.textContent = this.currentDetailText;
    }
    const parentHeight = this.element.parentElement?.clientHeight ?? 0;
    if (parentHeight > 0) {
      this.layout(parentHeight);
    } else {
      this.scrollable.scanDomNode();
    }
  }
  get isVisible() {
    return this.element.style.display !== "none";
  }
  focus() {
    this.firstFocusableElement?.focus();
  }
  /**
   * Set explicit dimensions on the scrollable element so the scrollbar
   * can compute its size. Call after the panel is shown and whenever
   * the available space changes.
   */
  layout(height) {
    const headerHeight = this.headerElement?.offsetHeight ?? 0;
    const scrollableHeight = Math.max(0, height - headerHeight);
    const scrollPos = this.scrollable.getScrollPosition();
    this.contentContainer.style.height = `${scrollableHeight}px`;
    this.scrollable.scanDomNode();
    this.scrollable.setScrollPosition({ scrollTop: scrollPos.scrollTop });
    this.sash.layout();
  }
  layoutSash() {
    this.sash.layout();
  }
  hide() {
    this.currentDetailEventId = void 0;
    this.firstFocusableElement = void 0;
    this.headerElement = void 0;
    DOM.hide(this.element);
    this.sash.state = SashState.Disabled;
    DOM.clearNode(this.element);
    DOM.clearNode(this.contentContainer);
    this.detailDisposables.clear();
    this._onDidHide.fire();
  }
};
ChatDebugDetailPanel = __decorateClass([
  __decorateParam(1, IChatDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IClipboardService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, ILanguageService)
], ChatDebugDetailPanel);
export {
  ChatDebugDetailPanel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnRGV0YWlsUGFuZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2FzaCwgU2FzaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnRXZlbnQsIElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0RXZlbnREZXRhaWwgfSBmcm9tICcuL2NoYXREZWJ1Z0V2ZW50RGV0YWlsUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyQ3VzdG9taXphdGlvbkRpc2NvdmVyeUNvbnRlbnQsIGZpbGVMaXN0VG9QbGFpblRleHQsIHJlbmRlckN1c3RvbWl6YXRpb25TdW1tYXJ5Q29udGVudCwgY3VzdG9taXphdGlvblN1bW1hcnlUb1BsYWluVGV4dCB9IGZyb20gJy4vY2hhdEN1c3RvbWl6YXRpb25EaXNjb3ZlcnlSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyByZW5kZXJVc2VyTWVzc2FnZUNvbnRlbnQsIHJlbmRlckFnZW50UmVzcG9uc2VDb250ZW50LCBtZXNzYWdlRXZlbnRUb1BsYWluVGV4dCwgcmVuZGVyUmVzb2x2ZWRNZXNzYWdlQ29udGVudCwgcmVzb2x2ZWRNZXNzYWdlVG9QbGFpblRleHQgfSBmcm9tICcuL2NoYXREZWJ1Z01lc3NhZ2VDb250ZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyVG9vbENhbGxDb250ZW50LCB0b29sQ2FsbENvbnRlbnRUb1BsYWluVGV4dCB9IGZyb20gJy4vY2hhdERlYnVnVG9vbENhbGxDb250ZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyTW9kZWxUdXJuQ29udGVudCwgbW9kZWxUdXJuQ29udGVudFRvUGxhaW5UZXh0IH0gZnJvbSAnLi9jaGF0RGVidWdNb2RlbFR1cm5Db250ZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVySG9va0NvbnRlbnQsIGhvb2tDb250ZW50VG9QbGFpblRleHQgfSBmcm9tICcuL2NoYXREZWJ1Z0hvb2tDb250ZW50UmVuZGVyZXIuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmNvbnN0IERFVEFJTF9QQU5FTF9ERUZBVUxUX1dJRFRIID0gMzUwO1xuY29uc3QgREVUQUlMX1BBTkVMX01JTl9XSURUSCA9IDIwMDtcbmNvbnN0IERFVEFJTF9QQU5FTF9NQVhfV0lEVEggPSA4MDA7XG5cbi8qKlxuICogUmV1c2FibGUgZGV0YWlsIHBhbmVsIHRoYXQgcmVzb2x2ZXMgYW5kIGRpc3BsYXlzIHRoZSBjb250ZW50IG9mIGFcbiAqIHNpbmdsZSB7QGxpbmsgSUNoYXREZWJ1Z0V2ZW50fS4gVXNlZCBieSBib3RoIHRoZSBsb2dzIHZpZXcgYW5kIHRoZVxuICogZmxvdyBjaGFydCB2aWV3LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRGV0YWlsUGFuZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRIaWRlID0gdGhpcy5fb25EaWRIaWRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV2lkdGggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVdpZHRoID0gdGhpcy5fb25EaWRDaGFuZ2VXaWR0aC5ldmVudDtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzY3JvbGxhYmxlOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzYXNoOiBTYXNoO1xuXHRwcml2YXRlIGhlYWRlckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRldGFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBjdXJyZW50RGV0YWlsVGV4dDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgY3VycmVudERldGFpbEV2ZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmaXJzdEZvY3VzYWJsZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93aWR0aDogbnVtYmVyID0gREVUQUlMX1BBTkVMX0RFRkFVTFRfV0lEVEg7XG5cblx0Z2V0IHdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZHRoO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmNoYXQtZGVidWctZGV0YWlsLXBhbmVsJykpO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9ICQoJy5jaGF0LWRlYnVnLWRldGFpbC1jb250ZW50Jyk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuY29udGVudENvbnRhaW5lciwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdH0pKTtcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHt0aGlzLl93aWR0aH1weGA7XG5cdFx0RE9NLmhpZGUodGhpcy5lbGVtZW50KTtcblxuXHRcdC8vIFNhc2ggb24gdGhlIHBhcmVudCBjb250YWluZXIsIHBvc2l0aW9uZWQgYXQgdGhlIGxlZnQgZWRnZSBvZiB0aGUgZGV0YWlsIHBhbmVsXG5cdFx0dGhpcy5zYXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNhc2gocGFyZW50LCB7XG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiBwYXJlbnQub2Zmc2V0V2lkdGggLSB0aGlzLl93aWR0aCxcblx0XHR9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCB9KSk7XG5cdFx0dGhpcy5zYXNoLnN0YXRlID0gU2FzaFN0YXRlLkRpc2FibGVkO1xuXG5cdFx0bGV0IHNhc2hTdGFydFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zYXNoLm9uRGlkU3RhcnQoKCkgPT4gc2FzaFN0YXJ0V2lkdGggPSB0aGlzLl93aWR0aCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2FzaC5vbkRpZEVuZCgoKSA9PiB7XG5cdFx0XHRzYXNoU3RhcnRXaWR0aCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2FzaC5sYXlvdXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zYXNoLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKHNhc2hTdGFydFdpZHRoID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRHJhZ2dpbmcgbGVmdCAobmVnYXRpdmUgY3VycmVudFggZGVsdGEpIHNob3VsZCBpbmNyZWFzZSB3aWR0aFxuXHRcdFx0Y29uc3QgZGVsdGEgPSBlLnN0YXJ0WCAtIGUuY3VycmVudFg7XG5cdFx0XHRjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KERFVEFJTF9QQU5FTF9NSU5fV0lEVEgsIE1hdGgubWluKERFVEFJTF9QQU5FTF9NQVhfV0lEVEgsIHNhc2hTdGFydFdpZHRoICsgZGVsdGEpKTtcblx0XHRcdHRoaXMuX3dpZHRoID0gbmV3V2lkdGg7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtuZXdXaWR0aH1weGA7XG5cdFx0XHR0aGlzLnNhc2gubGF5b3V0KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdpZHRoLmZpcmUobmV3V2lkdGgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBDdHJsK0EgLyBDbWQrQSB0byBzZWxlY3QgYWxsIHdpdGhpbiB0aGUgZGV0YWlsIHBhbmVsXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmIGUua2V5ID09PSAnYScpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0XHRpZiAodGFyZ2V0ICYmIHRoaXMuZWxlbWVudC5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IERPTS5nZXRXaW5kb3codGFyZ2V0KTtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0YXJnZXRXaW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0XHRcdFx0XHRcdHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0YXJnZXQpO1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLmFkZFJhbmdlKHJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBzaG93KGV2ZW50OiBJQ2hhdERlYnVnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTa2lwIHJlLXJlbmRlcmluZyBpZiB3ZSdyZSBhbHJlYWR5IHNob3dpbmcgdGhpcyBldmVudCdzIGRldGFpbFxuXHRcdGlmIChldmVudC5pZCAmJiBldmVudC5pZCA9PT0gdGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkID0gZXZlbnQuaWQ7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGV2ZW50LmlkID8gYXdhaXQgdGhpcy5jaGF0RGVidWdTZXJ2aWNlLnJlc29sdmVFdmVudChldmVudC5pZCkgOiB1bmRlZmluZWQ7XG5cblx0XHRET00uc2hvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdHRoaXMuc2FzaC5zdGF0ZSA9IFNhc2hTdGF0ZS5FbmFibGVkO1xuXHRcdHRoaXMuc2FzaC5sYXlvdXQoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZWxlbWVudCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnRDb250YWluZXIpO1xuXHRcdHRoaXMuZGV0YWlsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIEhlYWRlciB3aXRoIGFjdGlvbiBidXR0b25zXG5cdFx0Y29uc3QgaGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jaGF0LWRlYnVnLWRldGFpbC1oZWFkZXInKSk7XG5cdFx0dGhpcy5oZWFkZXJFbGVtZW50ID0gaGVhZGVyO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdGNvbnN0IGZ1bGxTY3JlZW5CdXR0b24gPSB0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcub3BlbkluRWRpdG9yJywgXCJPcGVuIGluIEVkaXRvclwiKSwgdGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcub3BlbkluRWRpdG9yJywgXCJPcGVuIGluIEVkaXRvclwiKSB9KSk7XG5cdFx0ZnVsbFNjcmVlbkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctZGV0YWlsLWJ1dHRvbicpO1xuXHRcdGZ1bGxTY3JlZW5CdXR0b24uaWNvbiA9IENvZGljb24uZ29Ub0ZpbGU7XG5cdFx0dGhpcy5maXJzdEZvY3VzYWJsZUVsZW1lbnQgPSBmdWxsU2NyZWVuQnV0dG9uLmVsZW1lbnQ7XG5cdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoZnVsbFNjcmVlbkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgY29udGVudHM6IHRoaXMuY3VycmVudERldGFpbFRleHQsIHJlc291cmNlOiB1bmRlZmluZWQgfSBzYXRpc2ZpZXMgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvcHlCdXR0b24gPSB0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY29weVRvQ2xpcGJvYXJkJywgXCJDb3B5XCIpLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jb3B5VG9DbGlwYm9hcmQnLCBcIkNvcHlcIikgfSkpO1xuXHRcdGNvcHlCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLWRldGFpbC1idXR0b24nKTtcblx0XHRjb3B5QnV0dG9uLmljb24gPSBDb2RpY29uLmNvcHk7XG5cdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29weUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGhpcy5jdXJyZW50RGV0YWlsVGV4dCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2xvc2VCdXR0b24gPSB0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2xvc2VEZXRhaWwnLCBcIkNsb3NlXCIpLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jbG9zZURldGFpbCcsIFwiQ2xvc2VcIikgfSkpO1xuXHRcdGNsb3NlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1kZXRhaWwtYnV0dG9uJyk7XG5cdFx0Y2xvc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2xvc2VTbWFsbDtcblx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjbG9zZUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdGlmIChyZXNvbHZlZCAmJiByZXNvbHZlZC5raW5kID09PSAnZmlsZUxpc3QnKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gZmlsZUxpc3RUb1BsYWluVGV4dChyZXNvbHZlZCk7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQ6IGNvbnRlbnRFbCwgZGlzcG9zYWJsZXM6IGNvbnRlbnREaXNwb3NhYmxlcyB9ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PlxuXHRcdFx0XHRyZW5kZXJDdXN0b21pemF0aW9uRGlzY292ZXJ5Q29udGVudChyZXNvbHZlZCwgdGhpcy5vcGVuZXJTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSksIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmhvdmVyU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpLCB0aGlzLnNjcm9sbGFibGUpXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAocmVzb2x2ZWQgJiYgcmVzb2x2ZWQua2luZCA9PT0gJ2N1c3RvbWl6YXRpb25TdW1tYXJ5Jykge1xuXHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IGN1c3RvbWl6YXRpb25TdW1tYXJ5VG9QbGFpblRleHQocmVzb2x2ZWQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT5cblx0XHRcdFx0cmVuZGVyQ3VzdG9taXphdGlvblN1bW1hcnlDb250ZW50KHJlc29sdmVkLCB0aGlzLm9wZW5lclNlcnZpY2UsIGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMuaG92ZXJTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSksIHRoaXMuc2Nyb2xsYWJsZSlcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnRFbCk7XG5cdFx0fSBlbHNlIGlmIChyZXNvbHZlZCAmJiByZXNvbHZlZC5raW5kID09PSAndG9vbENhbGwnKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gdG9vbENhbGxDb250ZW50VG9QbGFpblRleHQocmVzb2x2ZWQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IGF3YWl0IHJlbmRlclRvb2xDYWxsQ29udGVudChyZXNvbHZlZCwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMuY2xpcGJvYXJkU2VydmljZSwgdGhpcy5zY3JvbGxhYmxlKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkICE9PSBldmVudC5pZCkge1xuXHRcdFx0XHQvLyBBbm90aGVyIGV2ZW50IHdhcyBzZWxlY3RlZCB3aGlsZSB3ZSB3ZXJlIHJlbmRlcmluZ1xuXHRcdFx0XHRjb250ZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnRFbCk7XG5cdFx0fSBlbHNlIGlmIChyZXNvbHZlZCAmJiByZXNvbHZlZC5raW5kID09PSAnbWVzc2FnZScpIHtcblx0XHRcdHRoaXMuY3VycmVudERldGFpbFRleHQgPSByZXNvbHZlZE1lc3NhZ2VUb1BsYWluVGV4dChyZXNvbHZlZCk7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQ6IGNvbnRlbnRFbCwgZGlzcG9zYWJsZXM6IGNvbnRlbnREaXNwb3NhYmxlcyB9ID0gYXdhaXQgcmVuZGVyUmVzb2x2ZWRNZXNzYWdlQ29udGVudChyZXNvbHZlZCwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMuY2xpcGJvYXJkU2VydmljZSwgdGhpcy5zY3JvbGxhYmxlKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkICE9PSBldmVudC5pZCkge1xuXHRcdFx0XHRjb250ZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnRFbCk7XG5cdFx0fSBlbHNlIGlmIChyZXNvbHZlZCAmJiByZXNvbHZlZC5raW5kID09PSAnbW9kZWxUdXJuJykge1xuXHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IG1vZGVsVHVybkNvbnRlbnRUb1BsYWluVGV4dChyZXNvbHZlZCk7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQ6IGNvbnRlbnRFbCwgZGlzcG9zYWJsZXM6IGNvbnRlbnREaXNwb3NhYmxlcyB9ID0gYXdhaXQgcmVuZGVyTW9kZWxUdXJuQ29udGVudChyZXNvbHZlZCwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMuY2xpcGJvYXJkU2VydmljZSwgdGhpcy5zY3JvbGxhYmxlKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkICE9PSBldmVudC5pZCkge1xuXHRcdFx0XHQvLyBBbm90aGVyIGV2ZW50IHdhcyBzZWxlY3RlZCB3aGlsZSB3ZSB3ZXJlIHJlbmRlcmluZ1xuXHRcdFx0XHRjb250ZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnRFbCk7XG5cdFx0fSBlbHNlIGlmIChyZXNvbHZlZCAmJiByZXNvbHZlZC5raW5kID09PSAnaG9vaycpIHtcblx0XHRcdHRoaXMuY3VycmVudERldGFpbFRleHQgPSBob29rQ29udGVudFRvUGxhaW5UZXh0KHJlc29sdmVkKTtcblx0XHRcdGNvbnN0IHsgZWxlbWVudDogY29udGVudEVsLCBkaXNwb3NhYmxlczogY29udGVudERpc3Bvc2FibGVzIH0gPSBhd2FpdCByZW5kZXJIb29rQ29udGVudChyZXNvbHZlZCwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMuY2xpcGJvYXJkU2VydmljZSwgdGhpcy5zY3JvbGxhYmxlKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkICE9PSBldmVudC5pZCkge1xuXHRcdFx0XHQvLyBBbm90aGVyIGV2ZW50IHdhcyBzZWxlY3RlZCB3aGlsZSB3ZSB3ZXJlIHJlbmRlcmluZ1xuXHRcdFx0XHRjb250ZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnRFbCk7XG5cdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSAndXNlck1lc3NhZ2UnKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gbWVzc2FnZUV2ZW50VG9QbGFpblRleHQoZXZlbnQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IGF3YWl0IHJlbmRlclVzZXJNZXNzYWdlQ29udGVudChldmVudCwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHRoaXMuY2xpcGJvYXJkU2VydmljZSwgdGhpcy5zY3JvbGxhYmxlKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkICE9PSBldmVudC5pZCkge1xuXHRcdFx0XHRjb250ZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChjb250ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRlbnRFbCk7XG5cdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSAnYWdlbnRSZXNwb25zZScpIHtcblx0XHRcdHRoaXMuY3VycmVudERldGFpbFRleHQgPSBtZXNzYWdlRXZlbnRUb1BsYWluVGV4dChldmVudCk7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQ6IGNvbnRlbnRFbCwgZGlzcG9zYWJsZXM6IGNvbnRlbnREaXNwb3NhYmxlcyB9ID0gYXdhaXQgcmVuZGVyQWdlbnRSZXNwb25zZUNvbnRlbnQoZXZlbnQsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmNsaXBib2FyZFNlcnZpY2UsIHRoaXMuc2Nyb2xsYWJsZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCAhPT0gZXZlbnQuaWQpIHtcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcmUgPSBET00uYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgncHJlJykpO1xuXHRcdFx0cHJlLnRhYkluZGV4ID0gMDtcblx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gcmVzb2x2ZWQudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gZm9ybWF0RXZlbnREZXRhaWwoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdFx0cHJlLnRleHRDb250ZW50ID0gdGhpcy5jdXJyZW50RGV0YWlsVGV4dDtcblx0XHR9XG5cblx0XHQvLyBDb21wdXRlIGhlaWdodCBmcm9tIHRoZSBwYXJlbnQgY29udGFpbmVyIGFuZCBzZXQgZXhwbGljaXRcblx0XHQvLyBkaW1lbnNpb25zIHNvIHRoZSBzY3JvbGxhYmxlIGVsZW1lbnQgY2FuIHNob3cgcHJvcGVyIHNjcm9sbGJhcnMuXG5cdFx0Y29uc3QgcGFyZW50SGVpZ2h0ID0gdGhpcy5lbGVtZW50LnBhcmVudEVsZW1lbnQ/LmNsaWVudEhlaWdodCA/PyAwO1xuXHRcdGlmIChwYXJlbnRIZWlnaHQgPiAwKSB7XG5cdFx0XHR0aGlzLmxheW91dChwYXJlbnRIZWlnaHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5maXJzdEZvY3VzYWJsZUVsZW1lbnQ/LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IGV4cGxpY2l0IGRpbWVuc2lvbnMgb24gdGhlIHNjcm9sbGFibGUgZWxlbWVudCBzbyB0aGUgc2Nyb2xsYmFyXG5cdCAqIGNhbiBjb21wdXRlIGl0cyBzaXplLiBDYWxsIGFmdGVyIHRoZSBwYW5lbCBpcyBzaG93biBhbmQgd2hlbmV2ZXJcblx0ICogdGhlIGF2YWlsYWJsZSBzcGFjZSBjaGFuZ2VzLlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5oZWFkZXJFbGVtZW50Py5vZmZzZXRIZWlnaHQgPz8gMDtcblx0XHRjb25zdCBzY3JvbGxhYmxlSGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gaGVhZGVySGVpZ2h0KTtcblx0XHQvLyBQcmVzZXJ2ZSBzY3JvbGwgcG9zaXRpb24gYWNyb3NzIGxheW91dCBjaGFuZ2VzIChlLmcuIHdoZW4gb3BlbmluZ1xuXHRcdC8vIGFuIGVkaXRvciBjYXVzZXMgdGhlIHdvcmtiZW5jaCB0byByZS1sYXlvdXQgdGhpcyBwYW5lbCkuXG5cdFx0Y29uc3Qgc2Nyb2xsUG9zID0gdGhpcy5zY3JvbGxhYmxlLmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3Njcm9sbGFibGVIZWlnaHR9cHhgO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsUG9zLnNjcm9sbFRvcCB9KTtcblx0XHR0aGlzLnNhc2gubGF5b3V0KCk7XG5cdH1cblxuXHRsYXlvdXRTYXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2FzaC5sYXlvdXQoKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmZpcnN0Rm9jdXNhYmxlRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmhlYWRlckVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0RE9NLmhpZGUodGhpcy5lbGVtZW50KTtcblx0XHR0aGlzLnNhc2guc3RhdGUgPSBTYXNoU3RhdGUuRGlzYWJsZWQ7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmVsZW1lbnQpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5jb250ZW50Q29udGFpbmVyKTtcblx0XHR0aGlzLmRldGFpbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWRIaWRlLmZpcmUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsYUFBYSxNQUFNLGlCQUFpQjtBQUM3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMEIseUJBQXlCO0FBQ25ELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDLHFCQUFxQixtQ0FBbUMsdUNBQXVDO0FBQzdJLFNBQVMsMEJBQTBCLDRCQUE0Qix5QkFBeUIsOEJBQThCLGtDQUFrQztBQUN4SixTQUFTLHVCQUF1QixrQ0FBa0M7QUFDbEUsU0FBUyx3QkFBd0IsbUNBQW1DO0FBQ3BFLFNBQVMsbUJBQW1CLDhCQUE4QjtBQUUxRCxNQUFNLElBQUksSUFBSTtBQUVkLE1BQU0sNkJBQTZCO0FBQ25DLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0seUJBQXlCO0FBT3hCLElBQU0sdUJBQU4sY0FBbUMsV0FBVztBQUFBLEVBdUJwRCxZQUNDLFFBQ29D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
