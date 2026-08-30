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
import { addDisposableListener, Dimension, $, getWindow } from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { renderMarkdown, renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Emitter } from "../../../../base/common/event.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { assertType } from "../../../../base/common/types.js";
import { StableEditorBottomScrollState } from "../../../../editor/browser/stableEditorScroll.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { ZoneWidget } from "../../../../editor/contrib/zoneWidget/browser/zoneWidget.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ChatMode } from "../../chat/common/chatModes.js";
import { CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, MENU_INLINE_CHAT_SIDE, MENU_INLINE_CHAT_WIDGET_SECONDARY } from "../common/inlineChat.js";
import { EditorBasedInlineChatWidget } from "./inlineChatWidget.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
const _StatusPlaceholder = class _StatusPlaceholder extends Action2 {
  constructor() {
    super({
      id: _StatusPlaceholder.Id,
      title: "",
      precondition: ContextKeyExpr.false(),
      menu: {
        id: MenuId.ChatInput,
        when: ContextKeyExpr.and(ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline), _StatusPlaceholder.CtxHasStatus),
        group: "navigation",
        order: Number.MAX_SAFE_INTEGER
      }
    });
  }
  run() {
  }
};
_StatusPlaceholder.Id = "inlineChatWidget.statusPlaceholder";
_StatusPlaceholder.CtxHasStatus = new RawContextKey("inlineChatHasStatus", false);
let StatusPlaceholder = _StatusPlaceholder;
registerAction2(StatusPlaceholder);
let InlineChatZoneWidget = class extends ZoneWidget {
  constructor(location, options, editors, clearDelegate, instaService, actionViewItemService, logService, contextKeyService) {
    super(editors.editor, InlineChatZoneWidget.#options);
    this.status = observableValue(this, "");
    this.#terminationStore = new DisposableStore();
    this.notebookEditor = editors.notebookEditor;
    this.#logService = logService;
    this.#terminationCard = $("div.inline-chat-terminated-card.hidden");
    this.#terminationMarkdownContainer = $("div.markdown-scroll-container");
    this.#terminationMarkdownMessage = $("div.markdown-message");
    this.#terminationMarkdownContainer.appendChild(this.#terminationMarkdownMessage);
    this.#terminationMarkdownScrollable = this._disposables.add(new DomScrollableElement(this.#terminationMarkdownContainer, {
      consumeMouseWheelIfScrollbarIsNeeded: true,
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    this.#terminationCard.appendChild(this.#terminationMarkdownScrollable.getDomNode());
    const contentRow = $("div.content-row");
    this.#terminationToolbar = $("div.toolbar");
    contentRow.appendChild(this.#terminationToolbar);
    this.#terminationCard.appendChild(contentRow);
    this._disposables.add(this.#terminationStore);
    this.#ctxCursorPosition = CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.bindTo(contextKeyService);
    this.#ctxHasStatus = StatusPlaceholder.CtxHasStatus.bindTo(contextKeyService);
    this._disposables.add(toDisposable(() => {
      this.#ctxCursorPosition.reset();
      this.#ctxHasStatus.reset();
    }));
    this._disposables.add(autorun((r) => {
      this.#ctxHasStatus.set(!!this.status.read(r));
    }));
    InlineChatZoneWidget.#instances.add(this);
    this._disposables.add(toDisposable(() => {
      InlineChatZoneWidget.#instances.delete(this);
      if (InlineChatZoneWidget.#instances.size === 0) {
        InlineChatZoneWidget.#factoryRegistration?.dispose();
        InlineChatZoneWidget.#factoryRegistration = void 0;
      }
    }));
    this._disposables.add(autorun((r) => {
      this.status.read(r);
      InlineChatZoneWidget.#statusDidChange.fire();
    }));
    if (!InlineChatZoneWidget.#factoryRegistration) {
      InlineChatZoneWidget.#factoryRegistration = actionViewItemService.register(MenuId.ChatInput, StatusPlaceholder.Id, (action, options2) => {
        const item = new class extends ActionViewItem {
          render(container) {
            super.render(container);
            container.classList.add("status-placeholder");
            const targetWindow = getWindow(container);
            let handle = targetWindow.requestAnimationFrame(() => {
              handle = 0;
              const widget = InlineChatZoneWidget.#findByDom(container);
              if (widget) {
                this._store.add(autorun((r) => {
                  const value = widget.status.read(r) ?? "";
                  this.action.label = value;
                  this.updateLabel();
                }));
              }
            });
            this._store.add(toDisposable(() => {
              if (handle) {
                targetWindow.cancelAnimationFrame(handle);
              }
            }));
          }
        }(void 0, action, { ...options2, icon: false, label: true });
        return item;
      }, InlineChatZoneWidget.#statusDidChange.event);
    }
    this.widget = instaService.createInstance(EditorBasedInlineChatWidget, location, this.editor, {
      secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
      inZoneWidget: true,
      chatWidgetViewOptions: {
        menus: {
          telemetrySource: "interactiveEditorWidget-toolbar",
          inputSideToolbar: MENU_INLINE_CHAT_SIDE
        },
        clear: clearDelegate,
        ...options,
        rendererOptions: {
          renderTextEditsAsSummary: (uri) => {
            return isEqual(uri, editors.editor.getModel()?.uri);
          },
          renderDetectedCommandsWithRequest: true,
          ...options?.rendererOptions
        },
        defaultMode: ChatMode.Ask
      }
    });
    this._disposables.add(this.widget);
    let revealFn;
    this._disposables.add(this.widget.chatWidget.onWillMaybeChangeHeight(() => {
      if (this.position) {
        revealFn = this.#createZoneAndScrollRestoreFn(this.position);
      }
    }));
    this._disposables.add(this.widget.onDidChangeHeight(() => {
      if (this.position && !this._usesResizeHeight) {
        revealFn ??= this.#createZoneAndScrollRestoreFn(this.position);
        const height = this.#computeHeight();
        this._relayout(height.linesValue);
        revealFn?.();
        revealFn = void 0;
      }
    }));
    this.create();
    this._disposables.add(autorun((r) => {
      const isBusy = this.widget.requestInProgress.read(r);
      this.domNode.firstElementChild?.classList.toggle("busy", isBusy);
    }));
    this._disposables.add(addDisposableListener(this.domNode, "click", (e) => {
      if (!this.editor.hasWidgetFocus() && !this.widget.hasFocus()) {
        this.editor.focus();
      }
    }, true));
    const updateCursorIsAboveContextKey = () => {
      if (!this.position || !this.editor.hasModel()) {
        this.#ctxCursorPosition.reset();
      } else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
        this.#ctxCursorPosition.set("above");
      } else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
        this.#ctxCursorPosition.set("below");
      } else {
        this.#ctxCursorPosition.reset();
      }
    };
    this._disposables.add(this.editor.onDidChangeCursorPosition((e) => updateCursorIsAboveContextKey()));
    this._disposables.add(this.editor.onDidFocusEditorText((e) => updateCursorIsAboveContextKey()));
    updateCursorIsAboveContextKey();
  }
  static #options = {
    showFrame: true,
    frameWidth: 1,
    // frameColor: 'var(--vscode-inlineChat-border)',
    isResizeable: true,
    showArrow: false,
    isAccessible: true,
    className: "inline-chat-widget",
    keepEditorSelection: true,
    showInHiddenAreas: true,
    ordinal: 5e4
  };
  static #instances = /* @__PURE__ */ new Set();
  static #statusDidChange = new Emitter();
  static #factoryRegistration;
  static #findByDom(element) {
    const widgetDom = element.closest(".inline-chat-widget");
    if (widgetDom) {
      for (const instance of InlineChatZoneWidget.#instances) {
        if (instance.domNode === widgetDom) {
          return instance;
        }
      }
    }
    return void 0;
  }
  #ctxCursorPosition;
  #ctxHasStatus;
  #dimension;
  #logService;
  #terminationCard;
  #terminationMarkdownContainer;
  #terminationMarkdownMessage;
  #terminationMarkdownScrollable;
  #terminationToolbar;
  #terminationStore;
  _fillContainer(container) {
    container.style.setProperty("--vscode-inlineChat-background", "var(--vscode-editor-background)");
    container.appendChild(this.widget.domNode);
    container.appendChild(this.#terminationCard);
  }
  showTerminationCard(message, instaService) {
    this.#terminationStore.clear();
    const markdownMessage = typeof message === "string" ? new MarkdownString(message, { supportThemeIcons: true }) : message;
    const text = renderAsPlaintext(typeof message === "string" ? new MarkdownString(message) : message);
    this.#terminationMarkdownMessage.replaceChildren();
    const rendered = this.#terminationStore.add(renderMarkdown(markdownMessage));
    this.#terminationMarkdownMessage.appendChild(rendered.element);
    this.#terminationMarkdownScrollable.getDomNode().classList.remove("hidden");
    this.#terminationMarkdownScrollable.scanDomNode();
    const editor = this.editor;
    const actionRunner = this.#terminationStore.add(new class extends ActionRunner {
      async runAction(action, context) {
        editor.focus();
        return super.runAction(action, context);
      }
    }());
    this.#terminationToolbar.replaceChildren();
    this.#terminationStore.add(instaService.createInstance(MenuWorkbenchToolBar, this.#terminationToolbar, MenuId.ChatEditorInlineExecute, {
      telemetrySource: "inlineChatZone.terminationToolbar",
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      actionRunner,
      toolbarOptions: {
        primaryGroup: () => true,
        useSeparatorsInPrimaryActions: true
      },
      menuOptions: { renderShortTitle: true }
    }));
    this.widget.domNode.style.display = "none";
    this.#terminationCard.classList.remove("hidden");
    aria.status(text);
    if (this.position) {
      const revealFn = this.#createZoneAndScrollRestoreFn(this.position);
      const height = this.#computeHeight();
      this._relayout(height.linesValue);
      revealFn();
    }
  }
  hideTerminationCard() {
    this.#terminationStore.clear();
    this.#terminationCard.classList.add("hidden");
    this.widget.domNode.style.display = "";
    if (this.position) {
      const revealFn = this.#createZoneAndScrollRestoreFn(this.position);
      const height = this.#computeHeight();
      this._relayout(height.linesValue);
      revealFn();
    }
  }
  get isShowingTerminationCard() {
    return !this.#terminationCard.classList.contains("hidden");
  }
  _doLayout(heightInPixel) {
    this.#updatePadding();
    const info = this.editor.getLayoutInfo();
    const width = info.contentWidth - info.verticalScrollbarWidth;
    this.#dimension = new Dimension(width, heightInPixel);
    this.widget.layout(this.#dimension);
    if (this.isShowingTerminationCard) {
      const maxHeight = Math.max(50, heightInPixel - 40);
      this.#terminationMarkdownScrollable.getDomNode().style.maxHeight = `${maxHeight}px`;
      this.#terminationMarkdownContainer.style.maxHeight = `${maxHeight}px`;
      this.#terminationMarkdownScrollable.scanDomNode();
    }
  }
  #computeHeight() {
    const editorHeight = this.notebookEditor?.getLayoutInfo().height ?? this.editor.getLayoutInfo().height;
    let innerHeight;
    if (this.isShowingTerminationCard) {
      innerHeight = this.#terminationCard.offsetHeight || 80;
    } else {
      innerHeight = this.widget.contentHeight;
    }
    const contentHeight = this._decoratingElementsHeight() + Math.min(innerHeight, Math.max(this.widget.minHeight, editorHeight * 0.42));
    const heightInLines = contentHeight / this.editor.getOption(EditorOption.lineHeight);
    return { linesValue: heightInLines, pixelsValue: contentHeight };
  }
  _getResizeBounds() {
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const decoHeight = this._decoratingElementsHeight();
    const minHeightPx = decoHeight + this.widget.minHeight;
    const maxHeightPx = decoHeight + this.widget.contentHeight;
    return {
      minLines: minHeightPx / lineHeight,
      maxLines: maxHeightPx / lineHeight
    };
  }
  _onWidth(_widthInPixel) {
    if (this.#dimension) {
      this._doLayout(this.#dimension.height);
    }
  }
  show(position) {
    assertType(this.container);
    this.#updatePadding();
    const revealZone = this.#createZoneAndScrollRestoreFn(position);
    super.show(position, this.#computeHeight().linesValue);
    this.widget.chatWidget.setVisible(true);
    this.widget.focus();
    revealZone();
  }
  #updatePadding() {
    assertType(this.container);
    const info = this.editor.getLayoutInfo();
    const marginWithoutIndentation = info.glyphMarginWidth + info.lineNumbersWidth + info.decorationsWidth;
    this.container.style.paddingLeft = `${marginWithoutIndentation}px`;
  }
  reveal(position) {
    const stickyScroll = this.editor.getOption(EditorOption.stickyScroll);
    const magicValue = stickyScroll.enabled ? stickyScroll.maxLineCount : 0;
    this.editor.revealLines(position.lineNumber + magicValue, position.lineNumber + magicValue, ScrollType.Immediate);
    this.updatePositionAndHeight(position);
  }
  updatePositionAndHeight(position) {
    const revealZone = this.#createZoneAndScrollRestoreFn(position);
    super.updatePositionAndHeight(position, !this._usesResizeHeight ? this.#computeHeight().linesValue : void 0);
    revealZone();
  }
  #createZoneAndScrollRestoreFn(position) {
    const scrollState = StableEditorBottomScrollState.capture(this.editor);
    const lineNumber = position.lineNumber <= 1 ? 1 : 1 + position.lineNumber;
    return () => {
      scrollState.restore(this.editor);
      const scrollTop = this.editor.getScrollTop();
      const lineTop = this.editor.getTopForLineNumber(lineNumber);
      const zoneTop = lineTop - this.#computeHeight().pixelsValue;
      const editorHeight = this.editor.getLayoutInfo().height;
      const lineBottom = this.editor.getBottomForLineNumber(lineNumber);
      let newScrollTop = zoneTop;
      let forceScrollTop = false;
      if (lineBottom >= scrollTop + editorHeight) {
        newScrollTop = lineBottom - editorHeight;
        forceScrollTop = true;
      }
      if (newScrollTop < scrollTop || forceScrollTop) {
        this.#logService.trace("[IE] REVEAL zone", { zoneTop, lineTop, lineBottom, scrollTop, newScrollTop, forceScrollTop });
        this.editor.setScrollTop(newScrollTop, ScrollType.Immediate);
      }
    };
  }
  revealRange(range, isLastLine) {
  }
  hide() {
    const scrollState = StableEditorBottomScrollState.capture(this.editor);
    this.#ctxCursorPosition.reset();
    this.#terminationStore.clear();
    this.#terminationCard.classList.add("hidden");
    this.widget.domNode.style.display = "";
    this.widget.chatWidget.setVisible(false);
    super.hide();
    aria.status(localize("inlineChatClosed", "Closed inline chat widget"));
    scrollState.restore(this.editor);
  }
};
InlineChatZoneWidget = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IActionViewItemService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IContextKeyService)
], InlineChatZoneWidget);
export {
  InlineChatZoneWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXRab25lV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRGltZW5zaW9uLCAkLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biwgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFN0YWJsZUVkaXRvckJvdHRvbVNjcm9sbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc3RhYmxlRWRpdG9yU2Nyb2xsLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElPcHRpb25zLCBab25lV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvem9uZVdpZGdldC9icm93c2VyL3pvbmVXaWRnZXQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDVFhfSU5MSU5FX0NIQVRfT1VURVJfQ1VSU09SX1BPU0lUSU9OLCBNRU5VX0lOTElORV9DSEFUX1NJREUsIE1FTlVfSU5MSU5FX0NIQVRfV0lER0VUX1NFQ09OREFSWSB9IGZyb20gJy4uL2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IEVkaXRvckJhc2VkSW5saW5lQ2hhdFdpZGdldCB9IGZyb20gJy4vaW5saW5lQ2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5cbi8vIGEgXCJjcmVhdGl2ZVwiIHdheSBvZiBhZGRpbmcgY3VzdG9tIFVJIGludG8gdGhlIGNoYXQgaW5wdXQgcGFydFxuLy8gd2l0aG91dCBrbm93aW5nL21vZGlmeWluZyBpdHMgZG9tLXN0cnVjdHVyZVxuY2xhc3MgU3RhdHVzUGxhY2Vob2xkZXIgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAnaW5saW5lQ2hhdFdpZGdldC5zdGF0dXNQbGFjZWhvbGRlcic7XG5cdHN0YXRpYyByZWFkb25seSBDdHhIYXNTdGF0dXMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaW5saW5lQ2hhdEhhc1N0YXR1cycsIGZhbHNlKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3RhdHVzUGxhY2Vob2xkZXIuSWQsXG5cdFx0XHR0aXRsZTogJycsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmZhbHNlKCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5rZXksIENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksIFN0YXR1c1BsYWNlaG9sZGVyLkN0eEhhc1N0YXR1cyksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKCkgeyB9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihTdGF0dXNQbGFjZWhvbGRlcik7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVDaGF0Wm9uZVdpZGdldCBleHRlbmRzIFpvbmVXaWRnZXQge1xuXG5cdHN0YXRpYyByZWFkb25seSAjb3B0aW9uczogSU9wdGlvbnMgPSB7XG5cdFx0c2hvd0ZyYW1lOiB0cnVlLFxuXHRcdGZyYW1lV2lkdGg6IDEsXG5cdFx0Ly8gZnJhbWVDb2xvcjogJ3ZhcigtLXZzY29kZS1pbmxpbmVDaGF0LWJvcmRlciknLFxuXHRcdGlzUmVzaXplYWJsZTogdHJ1ZSxcblx0XHRzaG93QXJyb3c6IGZhbHNlLFxuXHRcdGlzQWNjZXNzaWJsZTogdHJ1ZSxcblx0XHRjbGFzc05hbWU6ICdpbmxpbmUtY2hhdC13aWRnZXQnLFxuXHRcdGtlZXBFZGl0b3JTZWxlY3Rpb246IHRydWUsXG5cdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0b3JkaW5hbDogNTAwMDAsXG5cdH07XG5cblx0c3RhdGljIHJlYWRvbmx5ICNpbnN0YW5jZXMgPSBuZXcgU2V0PElubGluZUNoYXRab25lV2lkZ2V0PigpO1xuXHRzdGF0aWMgcmVhZG9ubHkgI3N0YXR1c0RpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHN0YXRpYyAjZmFjdG9yeVJlZ2lzdHJhdGlvbjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0c3RhdGljICNmaW5kQnlEb20oZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJbmxpbmVDaGF0Wm9uZVdpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0RG9tID0gZWxlbWVudC5jbG9zZXN0KCcuaW5saW5lLWNoYXQtd2lkZ2V0Jyk7XG5cdFx0aWYgKHdpZGdldERvbSkge1xuXHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBJbmxpbmVDaGF0Wm9uZVdpZGdldC4jaW5zdGFuY2VzKSB7XG5cdFx0XHRcdGlmIChpbnN0YW5jZS5kb21Ob2RlID09PSB3aWRnZXREb20pIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlYWRvbmx5IHdpZGdldDogRWRpdG9yQmFzZWRJbmxpbmVDaGF0V2lkZ2V0O1xuXG5cdHJlYWRvbmx5IHN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAnJyk7XG5cblx0cmVhZG9ubHkgI2N0eEN1cnNvclBvc2l0aW9uOiBJQ29udGV4dEtleTwnYWJvdmUnIHwgJ2JlbG93JyB8ICcnPjtcblx0cmVhZG9ubHkgI2N0eEhhc1N0YXR1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdCNkaW1lbnNpb24/OiBEaW1lbnNpb247XG5cdHByaXZhdGUgbm90ZWJvb2tFZGl0b3I/OiBJTm90ZWJvb2tFZGl0b3I7XG5cblx0cmVhZG9ubHkgI2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXG5cdHJlYWRvbmx5ICN0ZXJtaW5hdGlvbkNhcmQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSAjdGVybWluYXRpb25NYXJrZG93bkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5ICN0ZXJtaW5hdGlvbk1hcmtkb3duTWVzc2FnZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5ICN0ZXJtaW5hdGlvbk1hcmtkb3duU2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHJlYWRvbmx5ICN0ZXJtaW5hdGlvblRvb2xiYXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSAjdGVybWluYXRpb25TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsb2NhdGlvbjogSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMsXG5cdFx0b3B0aW9uczogSUNoYXRXaWRnZXRWaWV3T3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRlZGl0b3JzOiB7IGVkaXRvcjogSUNvZGVFZGl0b3I7IG5vdGVib29rRWRpdG9yPzogSU5vdGVib29rRWRpdG9yIH0sXG5cdFx0LyoqIEBkZXByZWNhdGVkIHNob3VsZCBnbyBhd2F5IHdpdGggaW5saW5lMiAqL1xuXHRcdGNsZWFyRGVsZWdhdGU6ICgpID0+IFByb21pc2U8dm9pZD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9ycy5lZGl0b3IsIElubGluZUNoYXRab25lV2lkZ2V0LiNvcHRpb25zKTtcblx0XHR0aGlzLm5vdGVib29rRWRpdG9yID0gZWRpdG9ycy5ub3RlYm9va0VkaXRvcjtcblxuXHRcdHRoaXMuI2xvZ1NlcnZpY2UgPSBsb2dTZXJ2aWNlO1xuXG5cdFx0Ly8gQnVpbGQgdGVybWluYXRpb24gY2FyZCBET01cblx0XHR0aGlzLiN0ZXJtaW5hdGlvbkNhcmQgPSAkKCdkaXYuaW5saW5lLWNoYXQtdGVybWluYXRlZC1jYXJkLmhpZGRlbicpO1xuXG5cdFx0Ly8gTWFya2Rvd24gc2Nyb2xsYWJsZSBhcmVhXG5cdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93bkNvbnRhaW5lciA9ICQoJ2Rpdi5tYXJrZG93bi1zY3JvbGwtY29udGFpbmVyJyk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93bk1lc3NhZ2UgPSAkKCdkaXYubWFya2Rvd24tbWVzc2FnZScpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25Db250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4jdGVybWluYXRpb25NYXJrZG93bk1lc3NhZ2UpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25TY3JvbGxhYmxlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duQ29udGFpbmVyLCB7XG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0fSkpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uQ2FyZC5hcHBlbmRDaGlsZCh0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpO1xuXG5cdFx0Ly8gVG9vbGJhciByb3dcblx0XHRjb25zdCBjb250ZW50Um93ID0gJCgnZGl2LmNvbnRlbnQtcm93Jyk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25Ub29sYmFyID0gJCgnZGl2LnRvb2xiYXInKTtcblx0XHRjb250ZW50Um93LmFwcGVuZENoaWxkKHRoaXMuI3Rlcm1pbmF0aW9uVG9vbGJhcik7XG5cdFx0dGhpcy4jdGVybWluYXRpb25DYXJkLmFwcGVuZENoaWxkKGNvbnRlbnRSb3cpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLiN0ZXJtaW5hdGlvblN0b3JlKTtcblxuXHRcdHRoaXMuI2N0eEN1cnNvclBvc2l0aW9uID0gQ1RYX0lOTElORV9DSEFUX09VVEVSX0NVUlNPUl9QT1NJVElPTi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuI2N0eEhhc1N0YXR1cyA9IFN0YXR1c1BsYWNlaG9sZGVyLkN0eEhhc1N0YXR1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLiNjdHhDdXJzb3JQb3NpdGlvbi5yZXNldCgpO1xuXHRcdFx0dGhpcy4jY3R4SGFzU3RhdHVzLnJlc2V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHR0aGlzLiNjdHhIYXNTdGF0dXMuc2V0KCEhdGhpcy5zdGF0dXMucmVhZChyKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJhY2sgdGhpcyBpbnN0YW5jZSBzbyB0aGUgc2luZ2xldG9uIGZhY3RvcnkgY2FuIGRpc3BhdGNoIGJ5IERPTSBjb250YWlubWVudFxuXHRcdElubGluZUNoYXRab25lV2lkZ2V0LiNpbnN0YW5jZXMuYWRkKHRoaXMpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0SW5saW5lQ2hhdFpvbmVXaWRnZXQuI2luc3RhbmNlcy5kZWxldGUodGhpcyk7XG5cdFx0XHRpZiAoSW5saW5lQ2hhdFpvbmVXaWRnZXQuI2luc3RhbmNlcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdElubGluZUNoYXRab25lV2lkZ2V0LiNmYWN0b3J5UmVnaXN0cmF0aW9uPy5kaXNwb3NlKCk7XG5cdFx0XHRcdElubGluZUNoYXRab25lV2lkZ2V0LiNmYWN0b3J5UmVnaXN0cmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdHRoaXMuc3RhdHVzLnJlYWQocik7XG5cdFx0XHRJbmxpbmVDaGF0Wm9uZVdpZGdldC4jc3RhdHVzRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBhIHNpbmdsZSBmYWN0b3J5IGZvciB0aGUgc3RhdHVzIHBsYWNlaG9sZGVyIGFjdGlvbi4gTXVsdGlwbGUgem9uZSB3aWRnZXRcblx0XHQvLyBpbnN0YW5jZXMgY2FuIGNvZXhpc3QgKG9uZSBwZXIgZWRpdG9yKSBzbyB0aGUgZmFjdG9yeSB1c2VzIERPTSBjb250YWlubWVudCB0byBmaW5kXG5cdFx0Ly8gdGhlIG93bmluZyB3aWRnZXQgYW5kIG9ic2VydmUgaXRzIHN0YXR1cy5cblx0XHRpZiAoIUlubGluZUNoYXRab25lV2lkZ2V0LiNmYWN0b3J5UmVnaXN0cmF0aW9uKSB7XG5cdFx0XHRJbmxpbmVDaGF0Wm9uZVdpZGdldC4jZmFjdG9yeVJlZ2lzdHJhdGlvbiA9IGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51SWQuQ2hhdElucHV0LCBTdGF0dXNQbGFjZWhvbGRlci5JZCwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gbmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzdGF0dXMtcGxhY2Vob2xkZXInKTtcblx0XHRcdFx0XHRcdC8vIERlZmVyIHRoZSBET00tYmFzZWQgd2lkZ2V0IGxvb2t1cCB0byB0aGUgbmV4dCBhbmltYXRpb24gZnJhbWVcblx0XHRcdFx0XHRcdC8vIGJlY2F1c2UgYWN0aW9uYmFyIGNhbGxzIHJlbmRlcigpIGJlZm9yZSBhcHBlbmRpbmcgdGhlIGVsZW1lbnRcblx0XHRcdFx0XHRcdC8vIHRvIHRoZSBET00sIHNvIGNsb3Nlc3QoKSB3b3VsZCBmYWlsIGR1cmluZyByZW5kZXIoKS5cblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdFx0XHRcdFx0bGV0IGhhbmRsZSA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRoYW5kbGUgPSAwO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB3aWRnZXQgPSBJbmxpbmVDaGF0Wm9uZVdpZGdldC4jZmluZEJ5RG9tKGNvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gd2lkZ2V0LnN0YXR1cy5yZWFkKHIpID8/ICcnO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5hY3Rpb24ubGFiZWwgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChoYW5kbGUpIHtcblx0XHRcdFx0XHRcdFx0XHR0YXJnZXRXaW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoaGFuZGxlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSh1bmRlZmluZWQsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fSwgSW5saW5lQ2hhdFpvbmVXaWRnZXQuI3N0YXR1c0RpZENoYW5nZS5ldmVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy53aWRnZXQgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yQmFzZWRJbmxpbmVDaGF0V2lkZ2V0LCBsb2NhdGlvbiwgdGhpcy5lZGl0b3IsIHtcblx0XHRcdHNlY29uZGFyeU1lbnVJZDogTUVOVV9JTkxJTkVfQ0hBVF9XSURHRVRfU0VDT05EQVJZLFxuXHRcdFx0aW5ab25lV2lkZ2V0OiB0cnVlLFxuXHRcdFx0Y2hhdFdpZGdldFZpZXdPcHRpb25zOiB7XG5cdFx0XHRcdG1lbnVzOiB7XG5cdFx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnaW50ZXJhY3RpdmVFZGl0b3JXaWRnZXQtdG9vbGJhcicsXG5cdFx0XHRcdFx0aW5wdXRTaWRlVG9vbGJhcjogTUVOVV9JTkxJTkVfQ0hBVF9TSURFXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNsZWFyOiBjbGVhckRlbGVnYXRlLFxuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRyZW5kZXJlck9wdGlvbnM6IHtcblx0XHRcdFx0XHRyZW5kZXJUZXh0RWRpdHNBc1N1bW1hcnk6ICh1cmkpID0+IHtcblx0XHRcdFx0XHRcdC8vIHJlbmRlciB3aGVuIGRlYWxpbmcgd2l0aCB0aGUgY3VycmVudCBmaWxlIGluIHRoZSBlZGl0b3Jcblx0XHRcdFx0XHRcdHJldHVybiBpc0VxdWFsKHVyaSwgZWRpdG9ycy5lZGl0b3IuZ2V0TW9kZWwoKT8udXJpKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlbmRlckRldGVjdGVkQ29tbWFuZHNXaXRoUmVxdWVzdDogdHJ1ZSxcblx0XHRcdFx0XHQuLi5vcHRpb25zPy5yZW5kZXJlck9wdGlvbnNcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdE1vZGU6IENoYXRNb2RlLkFza1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLndpZGdldCk7XG5cblx0XHRsZXQgcmV2ZWFsRm46ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQuY2hhdFdpZGdldC5vbldpbGxNYXliZUNoYW5nZUhlaWdodCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5wb3NpdGlvbikge1xuXHRcdFx0XHRyZXZlYWxGbiA9IHRoaXMuI2NyZWF0ZVpvbmVBbmRTY3JvbGxSZXN0b3JlRm4odGhpcy5wb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLndpZGdldC5vbkRpZENoYW5nZUhlaWdodCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5wb3NpdGlvbiAmJiAhdGhpcy5fdXNlc1Jlc2l6ZUhlaWdodCkge1xuXHRcdFx0XHQvLyBvbmx5IHJlbGF5b3V0IHdoZW4gdmlzaWJsZVxuXHRcdFx0XHRyZXZlYWxGbiA/Pz0gdGhpcy4jY3JlYXRlWm9uZUFuZFNjcm9sbFJlc3RvcmVGbih0aGlzLnBvc2l0aW9uKTtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy4jY29tcHV0ZUhlaWdodCgpO1xuXHRcdFx0XHR0aGlzLl9yZWxheW91dChoZWlnaHQubGluZXNWYWx1ZSk7XG5cdFx0XHRcdHJldmVhbEZuPy4oKTtcblx0XHRcdFx0cmV2ZWFsRm4gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgaXNCdXN5ID0gdGhpcy53aWRnZXQucmVxdWVzdEluUHJvZ3Jlc3MucmVhZChyKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5maXJzdEVsZW1lbnRDaGlsZD8uY2xhc3NMaXN0LnRvZ2dsZSgnYnVzeScsIGlzQnVzeSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNXaWRnZXRGb2N1cygpICYmICF0aGlzLndpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSwgdHJ1ZSkpO1xuXG5cblx0XHQvLyB0b2RvQGpyaWVrZW4gbGlzdGVuIE9OTFkgd2hlbiBzaG93aW5nXG5cdFx0Y29uc3QgdXBkYXRlQ3Vyc29ySXNBYm92ZUNvbnRleHRLZXkgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMucG9zaXRpb24gfHwgIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy4jY3R4Q3Vyc29yUG9zaXRpb24ucmVzZXQoKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5wb3NpdGlvbi5saW5lTnVtYmVyID09PSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0dGhpcy4jY3R4Q3Vyc29yUG9zaXRpb24uc2V0KCdhYm92ZScpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnBvc2l0aW9uLmxpbmVOdW1iZXIgKyAxID09PSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0dGhpcy4jY3R4Q3Vyc29yUG9zaXRpb24uc2V0KCdiZWxvdycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy4jY3R4Q3Vyc29yUG9zaXRpb24ucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKGUgPT4gdXBkYXRlQ3Vyc29ySXNBYm92ZUNvbnRleHRLZXkoKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvci5vbkRpZEZvY3VzRWRpdG9yVGV4dChlID0+IHVwZGF0ZUN1cnNvcklzQWJvdmVDb250ZXh0S2V5KCkpKTtcblx0XHR1cGRhdGVDdXJzb3JJc0Fib3ZlQ29udGV4dEtleSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsQ29udGFpbmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblxuXHRcdGNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtaW5saW5lQ2hhdC1iYWNrZ3JvdW5kJywgJ3ZhcigtLXZzY29kZS1lZGl0b3ItYmFja2dyb3VuZCknKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLndpZGdldC5kb21Ob2RlKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy4jdGVybWluYXRpb25DYXJkKTtcblx0fVxuXG5cdHNob3dUZXJtaW5hdGlvbkNhcmQobWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLCBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uU3RvcmUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IG1hcmtkb3duTWVzc2FnZSA9IHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KVxuXHRcdFx0OiBtZXNzYWdlO1xuXHRcdGNvbnN0IHRleHQgPSByZW5kZXJBc1BsYWludGV4dCh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcobWVzc2FnZSkgOiBtZXNzYWdlKTtcblxuXHRcdC8vIE1hcmtkb3duIHJlbmRlcmluZyB3aXRoICQoaW5mbykgaWNvbiBwcmVmaXggaW4gc2Nyb2xsYWJsZSBhcmVhXG5cdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93bk1lc3NhZ2UucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLiN0ZXJtaW5hdGlvblN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bk1lc3NhZ2UpKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duTWVzc2FnZS5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93blNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblxuXHRcdC8vIFRvb2xiYXIgLSBmb2N1cyB0aGUgb3duaW5nIGVkaXRvciBiZWZvcmUgcnVubmluZyBhbnkgYWN0aW9uIHNvIHRoYXRcblx0XHQvLyBFZGl0b3JBY3Rpb24yLWJhc2VkIGFjdGlvbnMgcmVzb2x2ZSB0aGUgY29ycmVjdCBlZGl0b3IgaW5zdGFuY2UuXG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gdGhpcy4jdGVybWluYXRpb25TdG9yZS5hZGQobmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uVG9vbGJhci5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvblN0b3JlLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRoaXMuI3Rlcm1pbmF0aW9uVG9vbGJhciwgTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLCB7XG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdpbmxpbmVDaGF0Wm9uZS50ZXJtaW5hdGlvblRvb2xiYXInLFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHR1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9uczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBGbGlwIHZpc2liaWxpdHlcblx0XHR0aGlzLndpZGdldC5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy4jdGVybWluYXRpb25DYXJkLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXG5cdFx0Ly8gQW5ub3VuY2UgZm9yIHNjcmVlbiByZWFkZXJzXG5cdFx0YXJpYS5zdGF0dXModGV4dCk7XG5cblx0XHQvLyBSZWxheW91dFxuXHRcdGlmICh0aGlzLnBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCByZXZlYWxGbiA9IHRoaXMuI2NyZWF0ZVpvbmVBbmRTY3JvbGxSZXN0b3JlRm4odGhpcy5wb3NpdGlvbik7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLiNjb21wdXRlSGVpZ2h0KCk7XG5cdFx0XHR0aGlzLl9yZWxheW91dChoZWlnaHQubGluZXNWYWx1ZSk7XG5cdFx0XHRyZXZlYWxGbigpO1xuXHRcdH1cblx0fVxuXG5cdGhpZGVUZXJtaW5hdGlvbkNhcmQoKTogdm9pZCB7XG5cdFx0dGhpcy4jdGVybWluYXRpb25TdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uQ2FyZC5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0aGlzLndpZGdldC5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblxuXHRcdC8vIFJlbGF5b3V0XG5cdFx0aWYgKHRoaXMucG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IHJldmVhbEZuID0gdGhpcy4jY3JlYXRlWm9uZUFuZFNjcm9sbFJlc3RvcmVGbih0aGlzLnBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuI2NvbXB1dGVIZWlnaHQoKTtcblx0XHRcdHRoaXMuX3JlbGF5b3V0KGhlaWdodC5saW5lc1ZhbHVlKTtcblx0XHRcdHJldmVhbEZuKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlzU2hvd2luZ1Rlcm1pbmF0aW9uQ2FyZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuI3Rlcm1pbmF0aW9uQ2FyZC5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9kb0xheW91dChoZWlnaHRJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdHRoaXMuI3VwZGF0ZVBhZGRpbmcoKTtcblxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3Qgd2lkdGggPSBpbmZvLmNvbnRlbnRXaWR0aCAtIGluZm8udmVydGljYWxTY3JvbGxiYXJXaWR0aDtcblx0XHQvLyB3aWR0aCA9IE1hdGgubWluKDg1MCwgd2lkdGgpO1xuXG5cdFx0dGhpcy4jZGltZW5zaW9uID0gbmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0SW5QaXhlbCk7XG5cdFx0dGhpcy53aWRnZXQubGF5b3V0KHRoaXMuI2RpbWVuc2lvbik7XG5cblx0XHRpZiAodGhpcy5pc1Nob3dpbmdUZXJtaW5hdGlvbkNhcmQpIHtcblx0XHRcdC8vIFNldCBleHBsaWNpdCBtYXhIZWlnaHQgb24gdGhlIHNjcm9sbGFibGUgYW5kIGl0cyBjb250YWluZXIgc28gRG9tU2Nyb2xsYWJsZUVsZW1lbnRcblx0XHRcdC8vIGtub3dzIGl0IG5lZWRzIHRvIHNob3cgYSBzY3JvbGxiYXIgKHNhbWUgcGF0dGVybiBhcyB0aGUgb3ZlcmxheSB3aWRnZXQpXG5cdFx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1heCg1MCwgaGVpZ2h0SW5QaXhlbCAtIDQwKTsgLy8gcmVzZXJ2ZSBzcGFjZSBmb3IgdG9vbGJhciByb3dcblx0XHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25TY3JvbGxhYmxlLmdldERvbU5vZGUoKS5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93bkNvbnRhaW5lci5zdHlsZS5tYXhIZWlnaHQgPSBgJHttYXhIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93blNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHR9XG5cdH1cblxuXHQjY29tcHV0ZUhlaWdodCgpOiB7IGxpbmVzVmFsdWU6IG51bWJlcjsgcGl4ZWxzVmFsdWU6IG51bWJlciB9IHtcblx0XHRjb25zdCBlZGl0b3JIZWlnaHQgPSB0aGlzLm5vdGVib29rRWRpdG9yPy5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0ID8/IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQ7XG5cblx0XHRsZXQgaW5uZXJIZWlnaHQ6IG51bWJlcjtcblx0XHRpZiAodGhpcy5pc1Nob3dpbmdUZXJtaW5hdGlvbkNhcmQpIHtcblx0XHRcdGlubmVySGVpZ2h0ID0gdGhpcy4jdGVybWluYXRpb25DYXJkLm9mZnNldEhlaWdodCB8fCA4MDsgLy8gZmFsbGJhY2sgYmVmb3JlIGZpcnN0IGxheW91dFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbm5lckhlaWdodCA9IHRoaXMud2lkZ2V0LmNvbnRlbnRIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuX2RlY29yYXRpbmdFbGVtZW50c0hlaWdodCgpICsgTWF0aC5taW4oaW5uZXJIZWlnaHQsIE1hdGgubWF4KHRoaXMud2lkZ2V0Lm1pbkhlaWdodCwgZWRpdG9ySGVpZ2h0ICogMC40MikpO1xuXHRcdGNvbnN0IGhlaWdodEluTGluZXMgPSBjb250ZW50SGVpZ2h0IC8gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRyZXR1cm4geyBsaW5lc1ZhbHVlOiBoZWlnaHRJbkxpbmVzLCBwaXhlbHNWYWx1ZTogY29udGVudEhlaWdodCB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRSZXNpemVCb3VuZHMoKTogeyBtaW5MaW5lczogbnVtYmVyOyBtYXhMaW5lczogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IGRlY29IZWlnaHQgPSB0aGlzLl9kZWNvcmF0aW5nRWxlbWVudHNIZWlnaHQoKTtcblxuXHRcdGNvbnN0IG1pbkhlaWdodFB4ID0gZGVjb0hlaWdodCArIHRoaXMud2lkZ2V0Lm1pbkhlaWdodDtcblx0XHRjb25zdCBtYXhIZWlnaHRQeCA9IGRlY29IZWlnaHQgKyB0aGlzLndpZGdldC5jb250ZW50SGVpZ2h0O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1pbkxpbmVzOiBtaW5IZWlnaHRQeCAvIGxpbmVIZWlnaHQsXG5cdFx0XHRtYXhMaW5lczogbWF4SGVpZ2h0UHggLyBsaW5lSGVpZ2h0XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25XaWR0aChfd2lkdGhJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy4jZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9kb0xheW91dCh0aGlzLiNkaW1lbnNpb24uaGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzaG93KHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGFzc2VydFR5cGUodGhpcy5jb250YWluZXIpO1xuXG5cdFx0dGhpcy4jdXBkYXRlUGFkZGluZygpO1xuXG5cdFx0Y29uc3QgcmV2ZWFsWm9uZSA9IHRoaXMuI2NyZWF0ZVpvbmVBbmRTY3JvbGxSZXN0b3JlRm4ocG9zaXRpb24pO1xuXHRcdHN1cGVyLnNob3cocG9zaXRpb24sIHRoaXMuI2NvbXB1dGVIZWlnaHQoKS5saW5lc1ZhbHVlKTtcblx0XHR0aGlzLndpZGdldC5jaGF0V2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cdFx0dGhpcy53aWRnZXQuZm9jdXMoKTtcblxuXHRcdHJldmVhbFpvbmUoKTtcblx0fVxuXG5cdCN1cGRhdGVQYWRkaW5nKCkge1xuXHRcdGFzc2VydFR5cGUodGhpcy5jb250YWluZXIpO1xuXG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCBtYXJnaW5XaXRob3V0SW5kZW50YXRpb24gPSBpbmZvLmdseXBoTWFyZ2luV2lkdGggKyBpbmZvLmxpbmVOdW1iZXJzV2lkdGggKyBpbmZvLmRlY29yYXRpb25zV2lkdGg7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUucGFkZGluZ0xlZnQgPSBgJHttYXJnaW5XaXRob3V0SW5kZW50YXRpb259cHhgO1xuXHR9XG5cblx0cmV2ZWFsKHBvc2l0aW9uOiBQb3NpdGlvbikge1xuXHRcdGNvbnN0IHN0aWNreVNjcm9sbCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKTtcblx0XHRjb25zdCBtYWdpY1ZhbHVlID0gc3RpY2t5U2Nyb2xsLmVuYWJsZWQgPyBzdGlja3lTY3JvbGwubWF4TGluZUNvdW50IDogMDtcblx0XHR0aGlzLmVkaXRvci5yZXZlYWxMaW5lcyhwb3NpdGlvbi5saW5lTnVtYmVyICsgbWFnaWNWYWx1ZSwgcG9zaXRpb24ubGluZU51bWJlciArIG1hZ2ljVmFsdWUsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHR0aGlzLnVwZGF0ZVBvc2l0aW9uQW5kSGVpZ2h0KHBvc2l0aW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVBvc2l0aW9uQW5kSGVpZ2h0KHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHJldmVhbFpvbmUgPSB0aGlzLiNjcmVhdGVab25lQW5kU2Nyb2xsUmVzdG9yZUZuKHBvc2l0aW9uKTtcblx0XHRzdXBlci51cGRhdGVQb3NpdGlvbkFuZEhlaWdodChwb3NpdGlvbiwgIXRoaXMuX3VzZXNSZXNpemVIZWlnaHQgPyB0aGlzLiNjb21wdXRlSGVpZ2h0KCkubGluZXNWYWx1ZSA6IHVuZGVmaW5lZCk7XG5cdFx0cmV2ZWFsWm9uZSgpO1xuXHR9XG5cblx0I2NyZWF0ZVpvbmVBbmRTY3JvbGxSZXN0b3JlRm4ocG9zaXRpb246IFBvc2l0aW9uKTogKCkgPT4gdm9pZCB7XG5cblx0XHRjb25zdCBzY3JvbGxTdGF0ZSA9IFN0YWJsZUVkaXRvckJvdHRvbVNjcm9sbFN0YXRlLmNhcHR1cmUodGhpcy5lZGl0b3IpO1xuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXIgPD0gMSA/IDEgOiAxICsgcG9zaXRpb24ubGluZU51bWJlcjtcblxuXHRcdHJldHVybiAoKSA9PiB7XG5cdFx0XHRzY3JvbGxTdGF0ZS5yZXN0b3JlKHRoaXMuZWRpdG9yKTtcblxuXHRcdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5lZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0XHRjb25zdCBsaW5lVG9wID0gdGhpcy5lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHpvbmVUb3AgPSBsaW5lVG9wIC0gdGhpcy4jY29tcHV0ZUhlaWdodCgpLnBpeGVsc1ZhbHVlO1xuXHRcdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodDtcblx0XHRcdGNvbnN0IGxpbmVCb3R0b20gPSB0aGlzLmVkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXG5cdFx0XHRsZXQgbmV3U2Nyb2xsVG9wID0gem9uZVRvcDtcblx0XHRcdGxldCBmb3JjZVNjcm9sbFRvcCA9IGZhbHNlO1xuXG5cdFx0XHRpZiAobGluZUJvdHRvbSA+PSAoc2Nyb2xsVG9wICsgZWRpdG9ySGVpZ2h0KSkge1xuXHRcdFx0XHQvLyByZXZlYWxpbmcgdGhlIHRvcCBvZiB0aGUgem9uZSB3b3VsZCBwdXNoIG91dCB0aGUgbGluZSB3ZSBhcmUgaW50ZXJlc3RlZCBpbiBhbmRcblx0XHRcdFx0Ly8gdGhlcmVmb3JlIHdlIGtlZXAgdGhlIGxpbmUgaW4gdGhlIHZpZXdwb3J0XG5cdFx0XHRcdG5ld1Njcm9sbFRvcCA9IGxpbmVCb3R0b20gLSBlZGl0b3JIZWlnaHQ7XG5cdFx0XHRcdGZvcmNlU2Nyb2xsVG9wID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld1Njcm9sbFRvcCA8IHNjcm9sbFRvcCB8fCBmb3JjZVNjcm9sbFRvcCkge1xuXHRcdFx0XHR0aGlzLiNsb2dTZXJ2aWNlLnRyYWNlKCdbSUVdIFJFVkVBTCB6b25lJywgeyB6b25lVG9wLCBsaW5lVG9wLCBsaW5lQm90dG9tLCBzY3JvbGxUb3AsIG5ld1Njcm9sbFRvcCwgZm9yY2VTY3JvbGxUb3AgfSk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnNldFNjcm9sbFRvcChuZXdTY3JvbGxUb3AsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJldmVhbFJhbmdlKHJhbmdlOiBSYW5nZSwgaXNMYXN0TGluZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdG92ZXJyaWRlIGhpZGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsU3RhdGUgPSBTdGFibGVFZGl0b3JCb3R0b21TY3JvbGxTdGF0ZS5jYXB0dXJlKHRoaXMuZWRpdG9yKTtcblx0XHR0aGlzLiNjdHhDdXJzb3JQb3NpdGlvbi5yZXNldCgpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbkNhcmQuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy53aWRnZXQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy53aWRnZXQuY2hhdFdpZGdldC5zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRzdXBlci5oaWRlKCk7XG5cdFx0YXJpYS5zdGF0dXMobG9jYWxpemUoJ2lubGluZUNoYXRDbG9zZWQnLCAnQ2xvc2VkIGlubGluZSBjaGF0IHdpZGdldCcpKTtcblx0XHRzY3JvbGxTdGF0ZS5yZXN0b3JlKHRoaXMuZWRpdG9yKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFTLHVCQUF1QixXQUFXLEdBQUcsaUJBQWlCO0FBQy9ELFlBQVksVUFBVTtBQUN0QixTQUFTLGdCQUFnQix5QkFBeUI7QUFDbEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBNkI7QUFDdEMsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxvQkFBb0I7QUFHN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBbUIsa0JBQWtCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0IsNEJBQTRCO0FBQ3pELFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLDhCQUE4QjtBQUd2QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHVDQUF1Qyx1QkFBdUIseUNBQXlDO0FBQ2hILFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBSWhDLE1BQU0scUJBQU4sTUFBTSwyQkFBMEIsUUFBUTtBQUFBLEVBS3ZDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLG1CQUFrQjtBQUFBLE1BQ3RCLE9BQU87QUFBQSxNQUNQLGNBQWMsZUFBZSxNQUFNO0FBQUEsTUFDbkMsTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWUsSUFBSSxlQUFlLE9BQU8sZ0JBQWdCLFNBQVMsS0FBSyxrQkFBa0IsWUFBWSxHQUFHLG1CQUFrQixZQUFZO0FBQUEsUUFDNUksT0FBTztBQUFBLFFBQ1AsT0FBTyxPQUFPO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU07QUFBQSxFQUFFO0FBQ1Q7QUFwQk0sbUJBRVcsS0FBSztBQUZoQixtQkFHVyxlQUFlLElBQUksY0FBdUIsdUJBQXVCLEtBQUs7QUFIdkYsSUFBTSxvQkFBTjtBQXNCQSxnQkFBZ0IsaUJBQWlCO0FBRTFCLElBQU0sdUJBQU4sY0FBbUMsV0FBVztBQUFBLEVBaURwRCxZQUNDLFVBQ0EsU0FDQSxTQUVBLGVBQ3VCLGNBQ0MsdUJBQ1gsWUFDTyxtQkFDbkI7QUFDRCxVQUFNLFFBQVEsUUFBUSxxQkFBcUIsUUFBUTtBQTNCcEQsU0FBUyxTQUFTLGdCQUFnQixNQUFNLEVBQUU7QUFjMUMsU0FBUyxvQkFBb0IsSUFBSSxnQkFBZ0I7QUFjaEQsU0FBSyxpQkFBaUIsUUFBUTtBQUU5QixTQUFLLGNBQWM7QUFHbkIsU0FBSyxtQkFBbUIsRUFBRSx3Q0FBd0M7QUFHbEUsU0FBSyxnQ0FBZ0MsRUFBRSwrQkFBK0I7QUFDdEUsU0FBSyw4QkFBOEIsRUFBRSxzQkFBc0I7QUFDM0QsU0FBSyw4QkFBOEIsWUFBWSxLQUFLLDJCQUEyQjtBQUMvRSxTQUFLLGlDQUFpQyxLQUFLLGFBQWEsSUFBSSxJQUFJLHFCQUFxQixLQUFLLCtCQUErQjtBQUFBLE1BQ3hILHNDQUFzQztBQUFBLE1BQ3RDLFlBQVksb0JBQW9CO0FBQUEsTUFDaEMsVUFBVSxvQkFBb0I7QUFBQSxJQUMvQixDQUFDLENBQUM7QUFDRixTQUFLLGlCQUFpQixZQUFZLEtBQUssK0JBQStCLFdBQVcsQ0FBQztBQUdsRixVQUFNLGFBQWEsRUFBRSxpQkFBaUI7QUFDdEMsU0FBSyxzQkFBc0IsRUFBRSxhQUFhO0FBQzFDLGVBQVcsWUFBWSxLQUFLLG1CQUFtQjtBQUMvQyxTQUFLLGlCQUFpQixZQUFZLFVBQVU7QUFDNUMsU0FBSyxhQUFhLElBQUksS0FBSyxpQkFBaUI7QUFFNUMsU0FBSyxxQkFBcUIsc0NBQXNDLE9BQU8saUJBQWlCO0FBQ3hGLFNBQUssZ0JBQWdCLGtCQUFrQixhQUFhLE9BQU8saUJBQWlCO0FBRTVFLFNBQUssYUFBYSxJQUFJLGFBQWEsTUFBTTtBQUN4QyxXQUFLLG1CQUFtQixNQUFNO0FBQzlCLFdBQUssY0FBYyxNQUFNO0FBQUEsSUFDMUIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhLElBQUksUUFBUSxPQUFLO0FBQ2xDLFdBQUssY0FBYyxJQUFJLENBQUMsQ0FBQyxLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFBQSxJQUM3QyxDQUFDLENBQUM7QUFHRix5QkFBcUIsV0FBVyxJQUFJLElBQUk7QUFDeEMsU0FBSyxhQUFhLElBQUksYUFBYSxNQUFNO0FBQ3hDLDJCQUFxQixXQUFXLE9BQU8sSUFBSTtBQUMzQyxVQUFJLHFCQUFxQixXQUFXLFNBQVMsR0FBRztBQUMvQyw2QkFBcUIsc0JBQXNCLFFBQVE7QUFDbkQsNkJBQXFCLHVCQUF1QjtBQUFBLE1BQzdDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLGFBQWEsSUFBSSxRQUFRLE9BQUs7QUFDbEMsV0FBSyxPQUFPLEtBQUssQ0FBQztBQUNsQiwyQkFBcUIsaUJBQWlCLEtBQUs7QUFBQSxJQUM1QyxDQUFDLENBQUM7QUFLRixRQUFJLENBQUMscUJBQXFCLHNCQUFzQjtBQUMvQywyQkFBcUIsdUJBQXVCLHNCQUFzQixTQUFTLE9BQU8sV0FBVyxrQkFBa0IsSUFBSSxDQUFDLFFBQVFBLGFBQVk7QUFDdkksY0FBTSxPQUFPLElBQUksY0FBYyxlQUFlO0FBQUEsVUFDcEMsT0FBTyxXQUE4QjtBQUM3QyxrQkFBTSxPQUFPLFNBQVM7QUFDdEIsc0JBQVUsVUFBVSxJQUFJLG9CQUFvQjtBQUk1QyxrQkFBTSxlQUFlLFVBQVUsU0FBUztBQUN4QyxnQkFBSSxTQUFTLGFBQWEsc0JBQXNCLE1BQU07QUFDckQsdUJBQVM7QUFDVCxvQkFBTSxTQUFTLHFCQUFxQixXQUFXLFNBQVM7QUFDeEQsa0JBQUksUUFBUTtBQUNYLHFCQUFLLE9BQU8sSUFBSSxRQUFRLE9BQUs7QUFDNUIsd0JBQU0sUUFBUSxPQUFPLE9BQU8sS0FBSyxDQUFDLEtBQUs7QUFDdkMsdUJBQUssT0FBTyxRQUFRO0FBQ3BCLHVCQUFLLFlBQVk7QUFBQSxnQkFDbEIsQ0FBQyxDQUFDO0FBQUEsY0FDSDtBQUFBLFlBQ0QsQ0FBQztBQUNELGlCQUFLLE9BQU8sSUFBSSxhQUFhLE1BQU07QUFDbEMsa0JBQUksUUFBUTtBQUNYLDZCQUFhLHFCQUFxQixNQUFNO0FBQUEsY0FDekM7QUFBQSxZQUNELENBQUMsQ0FBQztBQUFBLFVBQ0g7QUFBQSxRQUNELEVBQUUsUUFBVyxRQUFRLEVBQUUsR0FBR0EsVUFBUyxNQUFNLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFDN0QsZUFBTztBQUFBLE1BQ1IsR0FBRyxxQkFBcUIsaUJBQWlCLEtBQUs7QUFBQSxJQUMvQztBQUVBLFNBQUssU0FBUyxhQUFhLGVBQWUsNkJBQTZCLFVBQVUsS0FBSyxRQUFRO0FBQUEsTUFDN0YsaUJBQWlCO0FBQUEsTUFDakIsY0FBYztBQUFBLE1BQ2QsdUJBQXVCO0FBQUEsUUFDdEIsT0FBTztBQUFBLFVBQ04saUJBQWlCO0FBQUEsVUFDakIsa0JBQWtCO0FBQUEsUUFDbkI7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLEdBQUc7QUFBQSxRQUNILGlCQUFpQjtBQUFBLFVBQ2hCLDBCQUEwQixDQUFDLFFBQVE7QUFFbEMsbUJBQU8sUUFBUSxLQUFLLFFBQVEsT0FBTyxTQUFTLEdBQUcsR0FBRztBQUFBLFVBQ25EO0FBQUEsVUFDQSxtQ0FBbUM7QUFBQSxVQUNuQyxHQUFHLFNBQVM7QUFBQSxRQUNiO0FBQUEsUUFDQSxhQUFhLFNBQVM7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssYUFBYSxJQUFJLEtBQUssTUFBTTtBQUVqQyxRQUFJO0FBQ0osU0FBSyxhQUFhLElBQUksS0FBSyxPQUFPLFdBQVcsd0JBQXdCLE1BQU07QUFDMUUsVUFBSSxLQUFLLFVBQVU7QUFDbEIsbUJBQVcsS0FBSyw4QkFBOEIsS0FBSyxRQUFRO0FBQUEsTUFDNUQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssYUFBYSxJQUFJLEtBQUssT0FBTyxrQkFBa0IsTUFBTTtBQUN6RCxVQUFJLEtBQUssWUFBWSxDQUFDLEtBQUssbUJBQW1CO0FBRTdDLHFCQUFhLEtBQUssOEJBQThCLEtBQUssUUFBUTtBQUM3RCxjQUFNLFNBQVMsS0FBSyxlQUFlO0FBQ25DLGFBQUssVUFBVSxPQUFPLFVBQVU7QUFDaEMsbUJBQVc7QUFDWCxtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssT0FBTztBQUVaLFNBQUssYUFBYSxJQUFJLFFBQVEsT0FBSztBQUNsQyxZQUFNLFNBQVMsS0FBSyxPQUFPLGtCQUFrQixLQUFLLENBQUM7QUFDbkQsV0FBSyxRQUFRLG1CQUFtQixVQUFVLE9BQU8sUUFBUSxNQUFNO0FBQUEsSUFDaEUsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhLElBQUksc0JBQXNCLEtBQUssU0FBUyxTQUFTLE9BQUs7QUFDdkUsVUFBSSxDQUFDLEtBQUssT0FBTyxlQUFlLEtBQUssQ0FBQyxLQUFLLE9BQU8sU0FBUyxHQUFHO0FBQzdELGFBQUssT0FBTyxNQUFNO0FBQUEsTUFDbkI7QUFBQSxJQUNELEdBQUcsSUFBSSxDQUFDO0FBSVIsVUFBTSxnQ0FBZ0MsTUFBTTtBQUMzQyxVQUFJLENBQUMsS0FBSyxZQUFZLENBQUMsS0FBSyxPQUFPLFNBQVMsR0FBRztBQUM5QyxhQUFLLG1CQUFtQixNQUFNO0FBQUEsTUFDL0IsV0FBVyxLQUFLLFNBQVMsZUFBZSxLQUFLLE9BQU8sWUFBWSxFQUFFLFlBQVk7QUFDN0UsYUFBSyxtQkFBbUIsSUFBSSxPQUFPO0FBQUEsTUFDcEMsV0FBVyxLQUFLLFNBQVMsYUFBYSxNQUFNLEtBQUssT0FBTyxZQUFZLEVBQUUsWUFBWTtBQUNqRixhQUFLLG1CQUFtQixJQUFJLE9BQU87QUFBQSxNQUNwQyxPQUFPO0FBQ04sYUFBSyxtQkFBbUIsTUFBTTtBQUFBLE1BQy9CO0FBQUEsSUFDRDtBQUNBLFNBQUssYUFBYSxJQUFJLEtBQUssT0FBTywwQkFBMEIsT0FBSyw4QkFBOEIsQ0FBQyxDQUFDO0FBQ2pHLFNBQUssYUFBYSxJQUFJLEtBQUssT0FBTyxxQkFBcUIsT0FBSyw4QkFBOEIsQ0FBQyxDQUFDO0FBQzVGLGtDQUE4QjtBQUFBLEVBQy9CO0FBQUEsRUF0TkEsT0FBZ0IsV0FBcUI7QUFBQSxJQUNwQyxXQUFXO0FBQUEsSUFDWCxZQUFZO0FBQUE7QUFBQSxJQUVaLGNBQWM7QUFBQSxJQUNkLFdBQVc7QUFBQSxJQUNYLGNBQWM7QUFBQSxJQUNkLFdBQVc7QUFBQSxJQUNYLHFCQUFxQjtBQUFBLElBQ3JCLG1CQUFtQjtBQUFBLElBQ25CLFNBQVM7QUFBQSxFQUNWO0FBQUEsRUFFQSxPQUFnQixhQUFhLG9CQUFJLElBQTBCO0FBQUEsRUFDM0QsT0FBZ0IsbUJBQW1CLElBQUksUUFBYztBQUFBLEVBQ3JELE9BQU87QUFBQSxFQUVQLE9BQU8sV0FBVyxTQUF3RDtBQUN6RSxVQUFNLFlBQVksUUFBUSxRQUFRLHFCQUFxQjtBQUN2RCxRQUFJLFdBQVc7QUFDZCxpQkFBVyxZQUFZLHFCQUFxQixZQUFZO0FBQ3ZELFlBQUksU0FBUyxZQUFZLFdBQVc7QUFDbkMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBTVM7QUFBQSxFQUNBO0FBQUEsRUFDVDtBQUFBLEVBR1M7QUFBQSxFQUVBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQTJLVSxlQUFlLFdBQThCO0FBRS9ELGNBQVUsTUFBTSxZQUFZLGtDQUFrQyxpQ0FBaUM7QUFFL0YsY0FBVSxZQUFZLEtBQUssT0FBTyxPQUFPO0FBQ3pDLGNBQVUsWUFBWSxLQUFLLGdCQUFnQjtBQUFBLEVBQzVDO0FBQUEsRUFFQSxvQkFBb0IsU0FBbUMsY0FBMkM7QUFDakcsU0FBSyxrQkFBa0IsTUFBTTtBQUU3QixVQUFNLGtCQUFrQixPQUFPLFlBQVksV0FDeEMsSUFBSSxlQUFlLFNBQVMsRUFBRSxtQkFBbUIsS0FBSyxDQUFDLElBQ3ZEO0FBQ0gsVUFBTSxPQUFPLGtCQUFrQixPQUFPLFlBQVksV0FBVyxJQUFJLGVBQWUsT0FBTyxJQUFJLE9BQU87QUFHbEcsU0FBSyw0QkFBNEIsZ0JBQWdCO0FBQ2pELFVBQU0sV0FBVyxLQUFLLGtCQUFrQixJQUFJLGVBQWUsZUFBZSxDQUFDO0FBQzNFLFNBQUssNEJBQTRCLFlBQVksU0FBUyxPQUFPO0FBQzdELFNBQUssK0JBQStCLFdBQVcsRUFBRSxVQUFVLE9BQU8sUUFBUTtBQUMxRSxTQUFLLCtCQUErQixZQUFZO0FBSWhELFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQU0sZUFBZSxLQUFLLGtCQUFrQixJQUFJLElBQUksY0FBYyxhQUFhO0FBQUEsTUFDOUUsTUFBeUIsVUFBVSxRQUFpQixTQUFrQztBQUNyRixlQUFPLE1BQU07QUFDYixlQUFPLE1BQU0sVUFBVSxRQUFRLE9BQU87QUFBQSxNQUN2QztBQUFBLElBQ0QsR0FBQztBQUNELFNBQUssb0JBQW9CLGdCQUFnQjtBQUN6QyxTQUFLLGtCQUFrQixJQUFJLGFBQWEsZUFBZSxzQkFBc0IsS0FBSyxxQkFBcUIsT0FBTyx5QkFBeUI7QUFBQSxNQUN0SSxpQkFBaUI7QUFBQSxNQUNqQixvQkFBb0IsbUJBQW1CO0FBQUEsTUFDdkM7QUFBQSxNQUNBLGdCQUFnQjtBQUFBLFFBQ2YsY0FBYyxNQUFNO0FBQUEsUUFDcEIsK0JBQStCO0FBQUEsTUFDaEM7QUFBQSxNQUNBLGFBQWEsRUFBRSxrQkFBa0IsS0FBSztBQUFBLElBQ3ZDLENBQUMsQ0FBQztBQUdGLFNBQUssT0FBTyxRQUFRLE1BQU0sVUFBVTtBQUNwQyxTQUFLLGlCQUFpQixVQUFVLE9BQU8sUUFBUTtBQUcvQyxTQUFLLE9BQU8sSUFBSTtBQUdoQixRQUFJLEtBQUssVUFBVTtBQUNsQixZQUFNLFdBQVcsS0FBSyw4QkFBOEIsS0FBSyxRQUFRO0FBQ2pFLFlBQU0sU0FBUyxLQUFLLGVBQWU7QUFDbkMsV0FBSyxVQUFVLE9BQU8sVUFBVTtBQUNoQyxlQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHNCQUE0QjtBQUMzQixTQUFLLGtCQUFrQixNQUFNO0FBQzdCLFNBQUssaUJBQWlCLFVBQVUsSUFBSSxRQUFRO0FBQzVDLFNBQUssT0FBTyxRQUFRLE1BQU0sVUFBVTtBQUdwQyxRQUFJLEtBQUssVUFBVTtBQUNsQixZQUFNLFdBQVcsS0FBSyw4QkFBOEIsS0FBSyxRQUFRO0FBQ2pFLFlBQU0sU0FBUyxLQUFLLGVBQWU7QUFDbkMsV0FBSyxVQUFVLE9BQU8sVUFBVTtBQUNoQyxlQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksMkJBQW9DO0FBQ3ZDLFdBQU8sQ0FBQyxLQUFLLGlCQUFpQixVQUFVLFNBQVMsUUFBUTtBQUFBLEVBQzFEO0FBQUEsRUFFbUIsVUFBVSxlQUE2QjtBQUV6RCxTQUFLLGVBQWU7QUFFcEIsVUFBTSxPQUFPLEtBQUssT0FBTyxjQUFjO0FBQ3ZDLFVBQU0sUUFBUSxLQUFLLGVBQWUsS0FBSztBQUd2QyxTQUFLLGFBQWEsSUFBSSxVQUFVLE9BQU8sYUFBYTtBQUNwRCxTQUFLLE9BQU8sT0FBTyxLQUFLLFVBQVU7QUFFbEMsUUFBSSxLQUFLLDBCQUEwQjtBQUdsQyxZQUFNLFlBQVksS0FBSyxJQUFJLElBQUksZ0JBQWdCLEVBQUU7QUFDakQsV0FBSywrQkFBK0IsV0FBVyxFQUFFLE1BQU0sWUFBWSxHQUFHLFNBQVM7QUFDL0UsV0FBSyw4QkFBOEIsTUFBTSxZQUFZLEdBQUcsU0FBUztBQUNqRSxXQUFLLCtCQUErQixZQUFZO0FBQUEsSUFDakQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQkFBOEQ7QUFDN0QsVUFBTSxlQUFlLEtBQUssZ0JBQWdCLGNBQWMsRUFBRSxVQUFVLEtBQUssT0FBTyxjQUFjLEVBQUU7QUFFaEcsUUFBSTtBQUNKLFFBQUksS0FBSywwQkFBMEI7QUFDbEMsb0JBQWMsS0FBSyxpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDckQsT0FBTztBQUNOLG9CQUFjLEtBQUssT0FBTztBQUFBLElBQzNCO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSywwQkFBMEIsSUFBSSxLQUFLLElBQUksYUFBYSxLQUFLLElBQUksS0FBSyxPQUFPLFdBQVcsZUFBZSxJQUFJLENBQUM7QUFDbkksVUFBTSxnQkFBZ0IsZ0JBQWdCLEtBQUssT0FBTyxVQUFVLGFBQWEsVUFBVTtBQUNuRixXQUFPLEVBQUUsWUFBWSxlQUFlLGFBQWEsY0FBYztBQUFBLEVBQ2hFO0FBQUEsRUFFbUIsbUJBQTJEO0FBQzdFLFVBQU0sYUFBYSxLQUFLLE9BQU8sVUFBVSxhQUFhLFVBQVU7QUFDaEUsVUFBTSxhQUFhLEtBQUssMEJBQTBCO0FBRWxELFVBQU0sY0FBYyxhQUFhLEtBQUssT0FBTztBQUM3QyxVQUFNLGNBQWMsYUFBYSxLQUFLLE9BQU87QUFFN0MsV0FBTztBQUFBLE1BQ04sVUFBVSxjQUFjO0FBQUEsTUFDeEIsVUFBVSxjQUFjO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFbUIsU0FBUyxlQUE2QjtBQUN4RCxRQUFJLEtBQUssWUFBWTtBQUNwQixXQUFLLFVBQVUsS0FBSyxXQUFXLE1BQU07QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQSxFQUVTLEtBQUssVUFBMEI7QUFDdkMsZUFBVyxLQUFLLFNBQVM7QUFFekIsU0FBSyxlQUFlO0FBRXBCLFVBQU0sYUFBYSxLQUFLLDhCQUE4QixRQUFRO0FBQzlELFVBQU0sS0FBSyxVQUFVLEtBQUssZUFBZSxFQUFFLFVBQVU7QUFDckQsU0FBSyxPQUFPLFdBQVcsV0FBVyxJQUFJO0FBQ3RDLFNBQUssT0FBTyxNQUFNO0FBRWxCLGVBQVc7QUFBQSxFQUNaO0FBQUEsRUFFQSxpQkFBaUI7QUFDaEIsZUFBVyxLQUFLLFNBQVM7QUFFekIsVUFBTSxPQUFPLEtBQUssT0FBTyxjQUFjO0FBQ3ZDLFVBQU0sMkJBQTJCLEtBQUssbUJBQW1CLEtBQUssbUJBQW1CLEtBQUs7QUFDdEYsU0FBSyxVQUFVLE1BQU0sY0FBYyxHQUFHLHdCQUF3QjtBQUFBLEVBQy9EO0FBQUEsRUFFQSxPQUFPLFVBQW9CO0FBQzFCLFVBQU0sZUFBZSxLQUFLLE9BQU8sVUFBVSxhQUFhLFlBQVk7QUFDcEUsVUFBTSxhQUFhLGFBQWEsVUFBVSxhQUFhLGVBQWU7QUFDdEUsU0FBSyxPQUFPLFlBQVksU0FBUyxhQUFhLFlBQVksU0FBUyxhQUFhLFlBQVksV0FBVyxTQUFTO0FBQ2hILFNBQUssd0JBQXdCLFFBQVE7QUFBQSxFQUN0QztBQUFBLEVBRVMsd0JBQXdCLFVBQTBCO0FBQzFELFVBQU0sYUFBYSxLQUFLLDhCQUE4QixRQUFRO0FBQzlELFVBQU0sd0JBQXdCLFVBQVUsQ0FBQyxLQUFLLG9CQUFvQixLQUFLLGVBQWUsRUFBRSxhQUFhLE1BQVM7QUFDOUcsZUFBVztBQUFBLEVBQ1o7QUFBQSxFQUVBLDhCQUE4QixVQUFnQztBQUU3RCxVQUFNLGNBQWMsOEJBQThCLFFBQVEsS0FBSyxNQUFNO0FBRXJFLFVBQU0sYUFBYSxTQUFTLGNBQWMsSUFBSSxJQUFJLElBQUksU0FBUztBQUUvRCxXQUFPLE1BQU07QUFDWixrQkFBWSxRQUFRLEtBQUssTUFBTTtBQUUvQixZQUFNLFlBQVksS0FBSyxPQUFPLGFBQWE7QUFDM0MsWUFBTSxVQUFVLEtBQUssT0FBTyxvQkFBb0IsVUFBVTtBQUMxRCxZQUFNLFVBQVUsVUFBVSxLQUFLLGVBQWUsRUFBRTtBQUNoRCxZQUFNLGVBQWUsS0FBSyxPQUFPLGNBQWMsRUFBRTtBQUNqRCxZQUFNLGFBQWEsS0FBSyxPQUFPLHVCQUF1QixVQUFVO0FBRWhFLFVBQUksZUFBZTtBQUNuQixVQUFJLGlCQUFpQjtBQUVyQixVQUFJLGNBQWUsWUFBWSxjQUFlO0FBRzdDLHVCQUFlLGFBQWE7QUFDNUIseUJBQWlCO0FBQUEsTUFDbEI7QUFFQSxVQUFJLGVBQWUsYUFBYSxnQkFBZ0I7QUFDL0MsYUFBSyxZQUFZLE1BQU0sb0JBQW9CLEVBQUUsU0FBUyxTQUFTLFlBQVksV0FBVyxjQUFjLGVBQWUsQ0FBQztBQUNwSCxhQUFLLE9BQU8sYUFBYSxjQUFjLFdBQVcsU0FBUztBQUFBLE1BQzVEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVtQixZQUFZLE9BQWMsWUFBMkI7QUFBQSxFQUV4RTtBQUFBLEVBRVMsT0FBYTtBQUNyQixVQUFNLGNBQWMsOEJBQThCLFFBQVEsS0FBSyxNQUFNO0FBQ3JFLFNBQUssbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxrQkFBa0IsTUFBTTtBQUM3QixTQUFLLGlCQUFpQixVQUFVLElBQUksUUFBUTtBQUM1QyxTQUFLLE9BQU8sUUFBUSxNQUFNLFVBQVU7QUFDcEMsU0FBSyxPQUFPLFdBQVcsV0FBVyxLQUFLO0FBQ3ZDLFVBQU0sS0FBSztBQUNYLFNBQUssT0FBTyxTQUFTLG9CQUFvQiwyQkFBMkIsQ0FBQztBQUNyRSxnQkFBWSxRQUFRLEtBQUssTUFBTTtBQUFBLEVBQ2hDO0FBQ0Q7QUFoYmEsdUJBQU47QUFBQSxFQXVESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBMURVOyIsCiAgIm5hbWVzIjogWyJvcHRpb25zIl0KfQo=
