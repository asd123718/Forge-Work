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
import "./media/inlineChatEditorAffordance.css";
import * as dom from "../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ContentWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { SelectionDirection } from "../../../../editor/common/core/selection.js";
import { computeIndentLevel } from "../../../../editor/common/model/utils.js";
import { autorun } from "../../../../base/common/observable.js";
import { MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { quickFixCommandId } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionController } from "../../../../editor/contrib/codeAction/browser/codeActionController.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ACTION_START, ACTION_ASK_IN_CHAT } from "../common/inlineChat.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
let QuickFixActionViewItem = class extends MenuEntryActionViewItem {
  #lightBulbStore = this._store.add(new MutableDisposable());
  #currentTitle;
  #editor;
  constructor(action, editor, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService, commandService) {
    const wrappedAction = new class extends MenuItemAction {
      constructor() {
        super(action.item, action.alt?.item, {}, action.hideActions, action.menuKeybinding, contextKeyService, commandService);
        this.elementGetter = () => void 0;
      }
      async run(...args) {
        const controller = CodeActionController.get(editor);
        const info = controller?.lightBulbState.get();
        const element = this.elementGetter();
        if (controller && info && element) {
          const { bottom, left } = element.getBoundingClientRect();
          await controller.showCodeActions(info.trigger, info.actions, { x: left, y: bottom });
        }
      }
    }();
    super(wrappedAction, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
    this.#editor = editor;
    wrappedAction.elementGetter = () => this.element;
  }
  render(container) {
    super.render(container);
    this.#updateFromLightBulb();
  }
  getTooltip() {
    return this.#currentTitle ?? super.getTooltip();
  }
  #updateFromLightBulb() {
    const controller = CodeActionController.get(this.#editor);
    if (!controller) {
      return;
    }
    const store = new DisposableStore();
    this.#lightBulbStore.value = store;
    store.add(autorun((reader) => {
      const info = controller.lightBulbState.read(reader);
      if (this.label) {
        const icon = info?.icon ?? Codicon.lightBulb;
        const iconClasses = ThemeIcon.asClassNameArray(icon);
        this.label.className = "";
        this.label.classList.add("codicon", "action-label", ...iconClasses);
      }
      this.#currentTitle = info?.title;
      this.updateTooltip();
    }));
  }
};
QuickFixActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, ICommandService)
], QuickFixActionViewItem);
let LabelWithKeybindingActionViewItem = class extends MenuEntryActionViewItem {
  #kbLabel;
  constructor(action, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService) {
    super(action, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
    this.options.label = true;
    this.options.icon = false;
    this.#kbLabel = keybindingService.lookupKeybinding(action.id)?.getLabel() ?? void 0;
  }
  updateLabel() {
    if (this.label) {
      dom.reset(
        this.label,
        this.action.label,
        ...this.#kbLabel ? [dom.$("span.inline-chat-keybinding", void 0, this.#kbLabel)] : []
      );
    }
  }
};
LabelWithKeybindingActionViewItem = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IAccessibilityService)
], LabelWithKeybindingActionViewItem);
let InlineChatAffordanceWidget = class extends Disposable {
  constructor(editor, selection, instantiationService) {
    super();
    this.#id = `inline-chat-content-widget-${InlineChatAffordanceWidget.#idPool++}`;
    this.#position = null;
    this.#isVisible = false;
    this.#onDidRunAction = this._store.add(new Emitter());
    this.onDidRunAction = this.#onDidRunAction.event;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = false;
    this.#editor = editor;
    this.#domNode = dom.$(".inline-chat-content-widget");
    const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this.#domNode, MenuId.InlineChatEditorAffordance, {
      telemetrySource: "inlineChatEditorAffordance",
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      menuOptions: { renderShortTitle: true },
      toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
      actionViewItemProvider: (action) => {
        if (action instanceof MenuItemAction && action.id === quickFixCommandId) {
          return instantiationService.createInstance(QuickFixActionViewItem, action, this.#editor);
        }
        if (action instanceof MenuItemAction && (action.id === ACTION_START || action.id === ACTION_ASK_IN_CHAT || action.id === "inlineChat.fixDiagnostics")) {
          return instantiationService.createInstance(LabelWithKeybindingActionViewItem, action);
        }
        return void 0;
      }
    }));
    this._store.add(toolbar.actionRunner.onDidRun((e) => {
      this.#onDidRunAction.fire(e.action.id);
      this.#hide();
    }));
    this._store.add(autorun((r) => {
      const sel = selection.read(r);
      if (sel) {
        this.#show(sel);
      } else {
        this.#hide();
      }
    }));
    this._store.add(this.#editor.onDidScrollChange(() => {
      const sel = selection.get();
      if (!sel) {
        return;
      }
      const isInViewport = this.#isPositionInViewport();
      if (isInViewport && !this.#isVisible) {
        this.#show(sel);
      } else if (!isInViewport && this.#isVisible) {
        this.#hide();
      }
    }));
  }
  static #idPool = 0;
  #id;
  #domNode;
  #position;
  #isVisible;
  #onDidRunAction;
  #editor;
  #show(selection) {
    if (selection.isEmpty()) {
      this.#showAtLineStart(selection.getPosition().lineNumber);
    } else {
      this.#showAtSelection(selection);
    }
    if (this.#isVisible) {
      this.#editor.layoutContentWidget(this);
    } else {
      this.#editor.addContentWidget(this);
      this.#isVisible = true;
    }
  }
  #showAtSelection(selection) {
    const cursorPosition = selection.getPosition();
    const direction = selection.getDirection();
    const preference = direction === SelectionDirection.RTL ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
    this.#position = {
      position: cursorPosition,
      preference: [preference]
    };
  }
  #showAtLineStart(lineNumber) {
    const model = this.#editor.getModel();
    if (!model) {
      return;
    }
    const tabSize = model.getOptions().tabSize;
    const fontInfo = this.#editor.getOptions().get(EditorOption.fontInfo);
    const lineContent = model.getLineContent(lineNumber);
    const indent = computeIndentLevel(lineContent, tabSize);
    const lineHasSpace = indent < 0 ? true : fontInfo.spaceWidth * indent > 22;
    let effectiveLineNumber = lineNumber;
    if (!lineHasSpace) {
      const isLineEmptyOrIndented = (ln) => {
        const content = model.getLineContent(ln);
        return /^\s*$|^\s+/.test(content);
      };
      const lineCount = model.getLineCount();
      if (lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1)) {
        effectiveLineNumber = lineNumber - 1;
      } else if (lineNumber < lineCount && isLineEmptyOrIndented(lineNumber + 1)) {
        effectiveLineNumber = lineNumber + 1;
      }
    }
    const effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
    this.#position = {
      position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  #isPositionInViewport() {
    const widgetPosition = this.#position?.position;
    if (!widgetPosition) {
      return false;
    }
    const visibleRanges = this.#editor.getVisibleRanges();
    const isLineVisible = visibleRanges.some(
      (range) => widgetPosition.lineNumber >= range.startLineNumber && widgetPosition.lineNumber <= range.endLineNumber
    );
    if (!isLineVisible) {
      return false;
    }
    const scrolledPos = this.#editor.getScrolledVisiblePosition(widgetPosition);
    if (!scrolledPos) {
      return false;
    }
    const layoutInfo = this.#editor.getOptions().get(EditorOption.layoutInfo);
    return scrolledPos.left >= 0 && scrolledPos.left <= layoutInfo.width;
  }
  #hide() {
    if (this.#isVisible) {
      this.#isVisible = false;
      this.#editor.removeContentWidget(this);
    }
  }
  getId() {
    return this.#id;
  }
  getDomNode() {
    return this.#domNode;
  }
  getPosition() {
    return this.#position;
  }
  beforeRender() {
    const position = this.#editor.getPosition();
    const lineHeight = position ? this.#editor.getLineHeightForPosition(position) : this.#editor.getOption(EditorOption.lineHeight);
    this.#domNode.style.setProperty("--vscode-inline-chat-affordance-height", `${lineHeight}px`);
    return null;
  }
  dispose() {
    if (this.#isVisible) {
      this.#editor.removeContentWidget(this);
    }
    super.dispose();
  }
};
InlineChatAffordanceWidget = __decorateClass([
  __decorateParam(2, IInstantiationService)
], InlineChatAffordanceWidget);
export {
  InlineChatAffordanceWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXRBZmZvcmRhbmNlV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2lubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlLmNzcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiwgU2VsZWN0aW9uRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBjb21wdXRlSW5kZW50TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3V0aWxzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBxdWlja0ZpeENvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fU1RBUlQsIEFDVElPTl9BU0tfSU5fQ0hBVCB9IGZyb20gJy4uL2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5cbmNsYXNzIFF1aWNrRml4QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cblx0cmVhZG9ubHkgI2xpZ2h0QnVsYlN0b3JlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHQjY3VycmVudFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5ICNlZGl0b3I6IElDb2RlRWRpdG9yO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3Qgd3JhcHBlZEFjdGlvbiA9IG5ldyBjbGFzcyBleHRlbmRzIE1lbnVJdGVtQWN0aW9uIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihhY3Rpb24uaXRlbSwgYWN0aW9uLmFsdD8uaXRlbSwge30sIGFjdGlvbi5oaWRlQWN0aW9ucywgYWN0aW9uLm1lbnVLZXliaW5kaW5nLCBjb250ZXh0S2V5U2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRlbGVtZW50R2V0dGVyOiAoKSA9PiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCA9ICgpID0+IHVuZGVmaW5lZDtcblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gQ29kZUFjdGlvbkNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSBjb250cm9sbGVyPy5saWdodEJ1bGJTdGF0ZS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZWxlbWVudEdldHRlcigpO1xuXHRcdFx0XHRpZiAoY29udHJvbGxlciAmJiBpbmZvICYmIGVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCB7IGJvdHRvbSwgbGVmdCB9ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnNob3dDb2RlQWN0aW9ucyhpbmZvLnRyaWdnZXIsIGluZm8uYWN0aW9ucywgeyB4OiBsZWZ0LCB5OiBib3R0b20gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3VwZXIod3JhcHBlZEFjdGlvbiwgeyBkcmFnZ2FibGU6IGZhbHNlIH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuI2VkaXRvciA9IGVkaXRvcjtcblx0XHR3cmFwcGVkQWN0aW9uLmVsZW1lbnRHZXR0ZXIgPSAoKSA9PiB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMuI3VwZGF0ZUZyb21MaWdodEJ1bGIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuI2N1cnJlbnRUaXRsZSA/PyBzdXBlci5nZXRUb29sdGlwKCk7XG5cdH1cblxuXHQjdXBkYXRlRnJvbUxpZ2h0QnVsYigpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29kZUFjdGlvbkNvbnRyb2xsZXIuZ2V0KHRoaXMuI2VkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy4jbGlnaHRCdWxiU3RvcmUudmFsdWUgPSBzdG9yZTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpbmZvID0gY29udHJvbGxlci5saWdodEJ1bGJTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0XHQvLyBVcGRhdGUgaWNvblxuXHRcdFx0XHRjb25zdCBpY29uID0gaW5mbz8uaWNvbiA/PyBDb2RpY29uLmxpZ2h0QnVsYjtcblx0XHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKTtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc05hbWUgPSAnJztcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QuYWRkKCdjb2RpY29uJywgJ2FjdGlvbi1sYWJlbCcsIC4uLmljb25DbGFzc2VzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIHRvb2x0aXBcblx0XHRcdHRoaXMuI2N1cnJlbnRUaXRsZSA9IGluZm8/LnRpdGxlO1xuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIExhYmVsV2l0aEtleWJpbmRpbmdBY3Rpb25WaWV3SXRlbSBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblxuXHRyZWFkb25seSAja2JMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLCB7IGRyYWdnYWJsZTogZmFsc2UgfSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHRcdHRoaXMub3B0aW9ucy5sYWJlbCA9IHRydWU7XG5cdFx0dGhpcy5vcHRpb25zLmljb24gPSBmYWxzZTtcblx0XHR0aGlzLiNrYkxhYmVsID0ga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpPy5nZXRMYWJlbCgpID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0ZG9tLnJlc2V0KHRoaXMubGFiZWwsXG5cdFx0XHRcdHRoaXMuYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHQuLi4odGhpcy4ja2JMYWJlbCA/IFtkb20uJCgnc3Bhbi5pbmxpbmUtY2hhdC1rZXliaW5kaW5nJywgdW5kZWZpbmVkLCB0aGlzLiNrYkxhYmVsKV0gOiBbXSlcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQ29udGVudCB3aWRnZXQgdGhhdCBzaG93cyBhIHNtYWxsIHNwYXJrbGUgaWNvbiBhdCB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICogV2hlbiBjbGlja2VkLCBpdCBzaG93cyB0aGUgb3ZlcmxheSB3aWRnZXQgZm9yIGlubGluZSBjaGF0LlxuICovXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdEFmZm9yZGFuY2VXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbnRlbnRXaWRnZXQge1xuXG5cdHN0YXRpYyAjaWRQb29sID0gMDtcblxuXHRyZWFkb25seSAjaWQgPSBgaW5saW5lLWNoYXQtY29udGVudC13aWRnZXQtJHtJbmxpbmVDaGF0QWZmb3JkYW5jZVdpZGdldC4jaWRQb29sKyt9YDtcblx0cmVhZG9ubHkgI2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHQjcG9zaXRpb246IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsID0gbnVsbDtcblx0I2lzVmlzaWJsZSA9IGZhbHNlO1xuXG5cdHJlYWRvbmx5ICNvbkRpZFJ1bkFjdGlvbiA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJ1bkFjdGlvbjogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuI29uRGlkUnVuQWN0aW9uLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3cgPSB0cnVlO1xuXHRyZWFkb25seSBzdXBwcmVzc01vdXNlRG93biA9IGZhbHNlO1xuXG5cdHJlYWRvbmx5ICNlZGl0b3I6IElDb2RlRWRpdG9yO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0c2VsZWN0aW9uOiBJT2JzZXJ2YWJsZTxTZWxlY3Rpb24gfCB1bmRlZmluZWQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuI2VkaXRvciA9IGVkaXRvcjtcblxuXHRcdC8vIENyZWF0ZSB0aGUgd2lkZ2V0IERPTVxuXHRcdHRoaXMuI2RvbU5vZGUgPSBkb20uJCgnLmlubGluZS1jaGF0LWNvbnRlbnQtd2lkZ2V0Jyk7XG5cblx0XHQvLyBDcmVhdGUgdG9vbGJhciB3aXRoIHRoZSBpbmxpbmUgY2hhdCBzdGFydCBhY3Rpb25cblx0XHRjb25zdCB0b29sYmFyID0gdGhpcy5fc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLiNkb21Ob2RlLCBNZW51SWQuSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UsIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2lubGluZUNoYXRFZGl0b3JBZmZvcmRhbmNlJyxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSwgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IHRydWUgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24pID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uICYmIGFjdGlvbi5pZCA9PT0gcXVpY2tGaXhDb21tYW5kSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tGaXhBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB0aGlzLiNlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiAoYWN0aW9uLmlkID09PSBBQ1RJT05fU1RBUlQgfHwgYWN0aW9uLmlkID09PSBBQ1RJT05fQVNLX0lOX0NIQVQgfHwgYWN0aW9uLmlkID09PSAnaW5saW5lQ2hhdC5maXhEaWFnbm9zdGljcycpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhYmVsV2l0aEtleWJpbmRpbmdBY3Rpb25WaWV3SXRlbSwgYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodG9vbGJhci5hY3Rpb25SdW5uZXIub25EaWRSdW4oKGUpID0+IHtcblx0XHRcdHRoaXMuI29uRGlkUnVuQWN0aW9uLmZpcmUoZS5hY3Rpb24uaWQpO1xuXHRcdFx0dGhpcy4jaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsID0gc2VsZWN0aW9uLnJlYWQocik7XG5cdFx0XHRpZiAoc2VsKSB7XG5cdFx0XHRcdHRoaXMuI3Nob3coc2VsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuI2hpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy4jZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IHNlbCA9IHNlbGVjdGlvbi5nZXQoKTtcblx0XHRcdGlmICghc2VsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzSW5WaWV3cG9ydCA9IHRoaXMuI2lzUG9zaXRpb25JblZpZXdwb3J0KCk7XG5cdFx0XHRpZiAoaXNJblZpZXdwb3J0ICYmICF0aGlzLiNpc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy4jc2hvdyhzZWwpO1xuXHRcdFx0fSBlbHNlIGlmICghaXNJblZpZXdwb3J0ICYmIHRoaXMuI2lzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLiNoaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0I3Nob3coc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblxuXHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHR0aGlzLiNzaG93QXRMaW5lU3RhcnQoc2VsZWN0aW9uLmdldFBvc2l0aW9uKCkubGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuI3Nob3dBdFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLiNpc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuI2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLiNlZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHRcdHRoaXMuI2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0I3Nob3dBdFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgZGlyZWN0aW9uID0gc2VsZWN0aW9uLmdldERpcmVjdGlvbigpO1xuXG5cdFx0Y29uc3QgcHJlZmVyZW5jZSA9IGRpcmVjdGlvbiA9PT0gU2VsZWN0aW9uRGlyZWN0aW9uLlJUTFxuXHRcdFx0PyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFXG5cdFx0XHQ6IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1c7XG5cblx0XHR0aGlzLiNwb3NpdGlvbiA9IHtcblx0XHRcdHBvc2l0aW9uOiBjdXJzb3JQb3NpdGlvbixcblx0XHRcdHByZWZlcmVuY2U6IFtwcmVmZXJlbmNlXSxcblx0XHR9O1xuXHR9XG5cblx0I3Nob3dBdExpbmVTdGFydChsaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuI2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YWJTaXplID0gbW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLiNlZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0Y29uc3QgaW5kZW50ID0gY29tcHV0ZUluZGVudExldmVsKGxpbmVDb250ZW50LCB0YWJTaXplKTtcblx0XHRjb25zdCBsaW5lSGFzU3BhY2UgPSBpbmRlbnQgPCAwID8gdHJ1ZSA6IGZvbnRJbmZvLnNwYWNlV2lkdGggKiBpbmRlbnQgPiAyMjtcblxuXHRcdGxldCBlZmZlY3RpdmVMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblxuXHRcdGlmICghbGluZUhhc1NwYWNlKSB7XG5cdFx0XHRjb25zdCBpc0xpbmVFbXB0eU9ySW5kZW50ZWQgPSAobG46IG51bWJlcik6IGJvb2xlYW4gPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobG4pO1xuXHRcdFx0XHRyZXR1cm4gL15cXHMqJHxeXFxzKy8udGVzdChjb250ZW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPiAxICYmIGlzTGluZUVtcHR5T3JJbmRlbnRlZChsaW5lTnVtYmVyIC0gMSkpIHtcblx0XHRcdFx0ZWZmZWN0aXZlTGluZU51bWJlciA9IGxpbmVOdW1iZXIgLSAxO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lTnVtYmVyIDwgbGluZUNvdW50ICYmIGlzTGluZUVtcHR5T3JJbmRlbnRlZChsaW5lTnVtYmVyICsgMSkpIHtcblx0XHRcdFx0ZWZmZWN0aXZlTGluZU51bWJlciA9IGxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVmZmVjdGl2ZUNvbHVtbk51bWJlciA9IC9eXFxTXFxzKiQvLnRlc3QobW9kZWwuZ2V0TGluZUNvbnRlbnQoZWZmZWN0aXZlTGluZU51bWJlcikpID8gMiA6IDE7XG5cblx0XHR0aGlzLiNwb3NpdGlvbiA9IHtcblx0XHRcdHBvc2l0aW9uOiB7IGxpbmVOdW1iZXI6IGVmZmVjdGl2ZUxpbmVOdW1iZXIsIGNvbHVtbjogZWZmZWN0aXZlQ29sdW1uTnVtYmVyIH0sXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVF0sXG5cdFx0fTtcblx0fVxuXG5cdCNpc1Bvc2l0aW9uSW5WaWV3cG9ydCgpOiBib29sZWFuIHtcblx0XHRjb25zdCB3aWRnZXRQb3NpdGlvbiA9IHRoaXMuI3Bvc2l0aW9uPy5wb3NpdGlvbjtcblx0XHRpZiAoIXdpZGdldFBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdmVydGljYWwgdmlzaWJpbGl0eVxuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLiNlZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHRcdGNvbnN0IGlzTGluZVZpc2libGUgPSB2aXNpYmxlUmFuZ2VzLnNvbWUocmFuZ2UgPT5cblx0XHRcdHdpZGdldFBvc2l0aW9uLmxpbmVOdW1iZXIgPj0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIHdpZGdldFBvc2l0aW9uLmxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlclxuXHRcdCk7XG5cdFx0aWYgKCFpc0xpbmVWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaG9yaXpvbnRhbCB2aXNpYmlsaXR5XG5cdFx0Y29uc3Qgc2Nyb2xsZWRQb3MgPSB0aGlzLiNlZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24od2lkZ2V0UG9zaXRpb24pO1xuXHRcdGlmICghc2Nyb2xsZWRQb3MpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuI2VkaXRvci5nZXRPcHRpb25zKCkuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRyZXR1cm4gc2Nyb2xsZWRQb3MubGVmdCA+PSAwICYmIHNjcm9sbGVkUG9zLmxlZnQgPD0gbGF5b3V0SW5mby53aWR0aDtcblx0fVxuXG5cdCNoaWRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLiNpc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuI2lzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy4jZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy4jaWQ7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy4jZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy4jcG9zaXRpb247XG5cdH1cblxuXHRiZWZvcmVSZW5kZXIoKTogSURpbWVuc2lvbiB8IG51bGwge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy4jZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHBvc2l0aW9uID8gdGhpcy4jZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihwb3NpdGlvbikgOiB0aGlzLiNlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblxuXHRcdHRoaXMuI2RvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWlubGluZS1jaGF0LWFmZm9yZGFuY2UtaGVpZ2h0JywgYCR7bGluZUhlaWdodH1weGApO1xuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLiNpc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuI2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUVQLFlBQVksU0FBUztBQUNyQixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUNBQTRGO0FBQ3JHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQW9CLDBCQUEwQjtBQUM5QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsUUFBUSxzQkFBc0I7QUFDdkMsU0FBUyxvQkFBb0IsNEJBQTRCO0FB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
