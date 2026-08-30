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
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { SimpleIconLabel } from "../../../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { toErrorMessage } from "../../../../../../base/common/errorMessage.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { stripIcons } from "../../../../../../base/common/iconLabels.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, dispose } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { isThemeColor } from "../../../../../../editor/common/editorCommon.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { CellFocusMode } from "../../notebookBrowser.js";
import { CellContentPart } from "../cellPart.js";
import { ClickTargetType } from "./cellWidgets.js";
import { CodeCellViewModel } from "../../viewModel/codeCellViewModel.js";
import { CellStatusbarAlignment } from "../../../common/notebookCommon.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { HoverPosition } from "../../../../../../base/browser/ui/hover/hoverWidget.js";
const $ = DOM.$;
let CellEditorStatusBar = class extends CellContentPart {
  constructor(_notebookEditor, _cellContainer, editorPart, _editor, _instantiationService, hoverService, configurationService, _themeService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._cellContainer = _cellContainer;
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this.leftItems = [];
    this.rightItems = [];
    this.width = 0;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this.statusBarContainer = DOM.append(editorPart, $(".cell-statusbar-container"));
    this.statusBarContainer.tabIndex = -1;
    const leftItemsContainer = DOM.append(this.statusBarContainer, $(".cell-status-left"));
    const rightItemsContainer = DOM.append(this.statusBarContainer, $(".cell-status-right"));
    this.leftItemsContainer = DOM.append(leftItemsContainer, $(".cell-contributed-items.cell-contributed-items-left"));
    this.rightItemsContainer = DOM.append(rightItemsContainer, $(".cell-contributed-items.cell-contributed-items-right"));
    this.itemsDisposable = this._register(new DisposableStore());
    this.hoverDelegate = new class {
      constructor() {
        this._lastHoverHideTime = 0;
        this.showHover = (options) => {
          options.position = options.position ?? {};
          options.position.hoverPosition = HoverPosition.ABOVE;
          return hoverService.showInstantHover(options);
        };
        this.placement = "element";
      }
      get delay() {
        return Date.now() - this._lastHoverHideTime < 200 ? 0 : configurationService.getValue("workbench.hover.delay");
      }
      onDidHideHover() {
        this._lastHoverHideTime = Date.now();
      }
    }();
    this._register(this._themeService.onDidColorThemeChange(() => this.currentContext && this.updateContext(this.currentContext)));
    this._register(DOM.addDisposableListener(this.statusBarContainer, DOM.EventType.CLICK, (e) => {
      if (e.target === leftItemsContainer || e.target === rightItemsContainer || e.target === this.statusBarContainer) {
        this._onDidClick.fire({
          type: ClickTargetType.Container,
          event: e
        });
      } else {
        const target = e.target;
        let itemHasCommand = false;
        if (target && DOM.isHTMLElement(target)) {
          const targetElement = target;
          if (targetElement.classList.contains("cell-status-item-has-command")) {
            itemHasCommand = true;
          } else if (targetElement.parentElement && targetElement.parentElement.classList.contains("cell-status-item-has-command")) {
            itemHasCommand = true;
          }
        }
        if (itemHasCommand) {
          this._onDidClick.fire({
            type: ClickTargetType.ContributedCommandItem,
            event: e
          });
        } else {
          this._onDidClick.fire({
            type: ClickTargetType.ContributedTextItem,
            event: e
          });
        }
      }
    }));
  }
  didRenderCell(element) {
    if (this._notebookEditor.hasModel()) {
      const context = {
        ui: true,
        cell: element,
        notebookEditor: this._notebookEditor,
        $mid: MarshalledId.NotebookCellActionContext
      };
      this.updateContext(context);
    }
    if (this._editor) {
      const updateFocusModeForEditorEvent = () => {
        if (this._editor && (this._editor.hasWidgetFocus() || this.statusBarContainer.ownerDocument.activeElement && this.statusBarContainer.contains(this.statusBarContainer.ownerDocument.activeElement))) {
          element.focusMode = CellFocusMode.Editor;
        } else {
          const currentMode = element.focusMode;
          if (currentMode === CellFocusMode.ChatInput) {
            element.focusMode = CellFocusMode.ChatInput;
          } else if (currentMode === CellFocusMode.Output && this._notebookEditor.hasWebviewFocus()) {
            element.focusMode = CellFocusMode.Output;
          } else {
            element.focusMode = CellFocusMode.Container;
          }
        }
      };
      this.cellDisposables.add(this._editor.onDidFocusEditorWidget(() => {
        updateFocusModeForEditorEvent();
      }));
      this.cellDisposables.add(this._editor.onDidBlurEditorWidget(() => {
        if (this._notebookEditor.hasEditorFocus() && !(this.statusBarContainer.ownerDocument.activeElement && this.statusBarContainer.contains(this.statusBarContainer.ownerDocument.activeElement))) {
          updateFocusModeForEditorEvent();
        }
      }));
      this.cellDisposables.add(this.onDidClick((e) => {
        if (this.currentCell instanceof CodeCellViewModel && e.type !== ClickTargetType.ContributedCommandItem && this._editor) {
          const target = this._editor.getTargetAtClientPoint(e.event.clientX, e.event.clientY - this._notebookEditor.notebookOptions.computeEditorStatusbarHeight(this.currentCell.internalMetadata, this.currentCell.uri));
          if (target?.position) {
            this._editor.setPosition(target.position);
            this._editor.focus();
          }
        }
      }));
    }
  }
  updateInternalLayoutNow(element) {
    this._cellContainer.classList.toggle("cell-statusbar-hidden", this._notebookEditor.notebookOptions.computeEditorStatusbarHeight(element.internalMetadata, element.uri) === 0);
    const layoutInfo = element.layoutInfo;
    const width = layoutInfo.editorWidth;
    if (!width) {
      return;
    }
    this.width = width;
    this.statusBarContainer.style.width = `${width}px`;
    const maxItemWidth = this.getMaxItemWidth();
    this.leftItems.forEach((item) => item.maxWidth = maxItemWidth);
    this.rightItems.forEach((item) => item.maxWidth = maxItemWidth);
  }
  getMaxItemWidth() {
    return this.width / 2;
  }
  updateContext(context) {
    this.currentContext = context;
    this.itemsDisposable.clear();
    if (!this.currentContext) {
      return;
    }
    this.itemsDisposable.add(this.currentContext.cell.onDidChangeLayout(() => {
      if (this.currentContext) {
        this.updateInternalLayoutNow(this.currentContext.cell);
      }
    }));
    this.itemsDisposable.add(this.currentContext.cell.onDidChangeCellStatusBarItems(() => this.updateRenderedItems()));
    this.itemsDisposable.add(this.currentContext.notebookEditor.onDidChangeActiveCell(() => this.updateActiveCell()));
    this.updateInternalLayoutNow(this.currentContext.cell);
    this.updateActiveCell();
    this.updateRenderedItems();
  }
  updateActiveCell() {
    const isActiveCell = this.currentContext.notebookEditor.getActiveCell() === this.currentContext?.cell;
    this.statusBarContainer.classList.toggle("is-active-cell", isActiveCell);
  }
  updateRenderedItems() {
    const items = this.currentContext.cell.getCellStatusBarItems();
    items.sort((itemA, itemB) => {
      return (itemB.priority ?? 0) - (itemA.priority ?? 0);
    });
    const maxItemWidth = this.getMaxItemWidth();
    const newLeftItems = items.filter((item) => item.alignment === CellStatusbarAlignment.Left);
    const newRightItems = items.filter((item) => item.alignment === CellStatusbarAlignment.Right).reverse();
    const updateItems = (renderedItems, newItems, container) => {
      if (renderedItems.length > newItems.length) {
        const deleted = renderedItems.splice(newItems.length, renderedItems.length - newItems.length);
        for (const deletedItem of deleted) {
          deletedItem.container.remove();
          deletedItem.dispose();
        }
      }
      newItems.forEach((newLeftItem, i) => {
        const existingItem = renderedItems[i];
        if (existingItem) {
          existingItem.updateItem(newLeftItem, maxItemWidth);
        } else {
          const item = this._instantiationService.createInstance(CellStatusBarItem, this.currentContext, this.hoverDelegate, this._editor, newLeftItem, maxItemWidth);
          renderedItems.push(item);
          container.appendChild(item.container);
        }
      });
    };
    updateItems(this.leftItems, newLeftItems, this.leftItemsContainer);
    updateItems(this.rightItems, newRightItems, this.rightItemsContainer);
  }
  dispose() {
    super.dispose();
    dispose(this.leftItems);
    dispose(this.rightItems);
  }
};
CellEditorStatusBar = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IThemeService)
], CellEditorStatusBar);
let CellStatusBarItem = class extends Disposable {
  constructor(_context, _hoverDelegate, _editor, itemModel, maxWidth, _telemetryService, _commandService, _notificationService, _themeService, _hoverService) {
    super();
    this._context = _context;
    this._hoverDelegate = _hoverDelegate;
    this._editor = _editor;
    this._telemetryService = _telemetryService;
    this._commandService = _commandService;
    this._notificationService = _notificationService;
    this._themeService = _themeService;
    this._hoverService = _hoverService;
    this.container = $(".cell-status-item");
    this._itemDisposables = this._register(new DisposableStore());
    this.updateItem(itemModel, maxWidth);
  }
  set maxWidth(v) {
    this.container.style.maxWidth = v + "px";
  }
  updateItem(item, maxWidth) {
    this._itemDisposables.clear();
    if (!this._currentItem || this._currentItem.text !== item.text) {
      this._itemDisposables.add(new SimpleIconLabel(this.container)).text = item.text.replace(/\n/g, " ");
    }
    const resolveColor = (color) => {
      return isThemeColor(color) ? this._themeService.getColorTheme().getColor(color.id)?.toString() || "" : color;
    };
    this.container.style.color = item.color ? resolveColor(item.color) : "";
    this.container.style.backgroundColor = item.backgroundColor ? resolveColor(item.backgroundColor) : "";
    this.container.style.opacity = item.opacity ? item.opacity : "";
    this.container.classList.toggle("cell-status-item-show-when-active", !!item.onlyShowWhenActive);
    if (typeof maxWidth === "number") {
      this.maxWidth = maxWidth;
    }
    let ariaLabel;
    let role;
    if (item.accessibilityInformation) {
      ariaLabel = item.accessibilityInformation.label;
      role = item.accessibilityInformation.role;
    } else {
      ariaLabel = item.text ? stripIcons(item.text).trim() : "";
    }
    this.container.setAttribute("aria-label", ariaLabel);
    this.container.setAttribute("role", role || "");
    if (item.tooltip) {
      const hoverContent = typeof item.tooltip === "string" ? item.tooltip : { markdown: item.tooltip, markdownNotSupportedFallback: void 0 };
      this._itemDisposables.add(this._hoverService.setupManagedHover(this._hoverDelegate, this.container, hoverContent));
    }
    this.container.classList.toggle("cell-status-item-has-command", !!item.command);
    if (item.command) {
      this.container.tabIndex = 0;
      this._itemDisposables.add(DOM.addDisposableListener(this.container, DOM.EventType.CLICK, (_e) => {
        this.executeCommand();
      }));
      this._itemDisposables.add(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
          this.executeCommand();
        }
      }));
    } else {
      this.container.removeAttribute("tabIndex");
    }
    this._currentItem = item;
  }
  async executeCommand() {
    const command = this._currentItem.command;
    if (!command) {
      return;
    }
    const id = typeof command === "string" ? command : command.id;
    const args = typeof command === "string" ? [] : command.arguments ?? [];
    if (typeof command === "string" || !command.arguments || !Array.isArray(command.arguments) || command.arguments.length === 0) {
      args.unshift(this._context);
    }
    this._telemetryService.publicLog2("workbenchActionExecuted", { id, from: "cell status bar" });
    try {
      this._editor?.focus();
      await this._commandService.executeCommand(id, ...args);
    } catch (error) {
      this._notificationService.error(toErrorMessage(error));
    }
  }
};
CellStatusBarItem = __decorateClass([
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService)
], CellStatusBarItem);
export {
  CellEditorStatusBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFx2aWV3XFxjZWxsUGFydHNcXGNlbGxTdGF0dXNQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgU2ltcGxlSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9zaW1wbGVJY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBpc1RoZW1lQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEZvY3VzTW9kZSwgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxDb250ZW50UGFydCB9IGZyb20gJy4uL2NlbGxQYXJ0LmpzJztcbmltcG9ydCB7IENsaWNrVGFyZ2V0VHlwZSwgSUNsaWNrVGFyZ2V0IH0gZnJvbSAnLi9jZWxsV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LCBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSwgSUhvdmVyRGVsZWdhdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuXG5leHBvcnQgY2xhc3MgQ2VsbEVkaXRvclN0YXR1c0JhciBleHRlbmRzIENlbGxDb250ZW50UGFydCB7XG5cdHJlYWRvbmx5IHN0YXR1c0JhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsZWZ0SXRlbXNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJpZ2h0SXRlbXNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1zRGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHByaXZhdGUgbGVmdEl0ZW1zOiBDZWxsU3RhdHVzQmFySXRlbVtdID0gW107XG5cdHByaXZhdGUgcmlnaHRJdGVtczogQ2VsbFN0YXR1c0Jhckl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHdpZHRoOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgY3VycmVudENvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2xpY2s6IEVtaXR0ZXI8SUNsaWNrVGFyZ2V0PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDbGlja1RhcmdldD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2s6IEV2ZW50PElDbGlja1RhcmdldD4gPSB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvckRlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NlbGxDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGVkaXRvclBhcnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyID0gRE9NLmFwcGVuZChlZGl0b3JQYXJ0LCAkKCcuY2VsbC1zdGF0dXNiYXItY29udGFpbmVyJykpO1xuXHRcdHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLnRhYkluZGV4ID0gLTE7XG5cdFx0Y29uc3QgbGVmdEl0ZW1zQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLnN0YXR1c0JhckNvbnRhaW5lciwgJCgnLmNlbGwtc3RhdHVzLWxlZnQnKSk7XG5cdFx0Y29uc3QgcmlnaHRJdGVtc0NvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zdGF0dXNCYXJDb250YWluZXIsICQoJy5jZWxsLXN0YXR1cy1yaWdodCcpKTtcblx0XHR0aGlzLmxlZnRJdGVtc0NvbnRhaW5lciA9IERPTS5hcHBlbmQobGVmdEl0ZW1zQ29udGFpbmVyLCAkKCcuY2VsbC1jb250cmlidXRlZC1pdGVtcy5jZWxsLWNvbnRyaWJ1dGVkLWl0ZW1zLWxlZnQnKSk7XG5cdFx0dGhpcy5yaWdodEl0ZW1zQ29udGFpbmVyID0gRE9NLmFwcGVuZChyaWdodEl0ZW1zQ29udGFpbmVyLCAkKCcuY2VsbC1jb250cmlidXRlZC1pdGVtcy5jZWxsLWNvbnRyaWJ1dGVkLWl0ZW1zLXJpZ2h0JykpO1xuXG5cdFx0dGhpcy5pdGVtc0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5ob3ZlckRlbGVnYXRlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUhvdmVyRGVsZWdhdGUge1xuXHRcdFx0cHJpdmF0ZSBfbGFzdEhvdmVySGlkZVRpbWU6IG51bWJlciA9IDA7XG5cblx0XHRcdHJlYWRvbmx5IHNob3dIb3ZlciA9IChvcHRpb25zOiBJSG92ZXJEZWxlZ2F0ZU9wdGlvbnMpID0+IHtcblx0XHRcdFx0b3B0aW9ucy5wb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb24gPz8ge307XG5cdFx0XHRcdG9wdGlvbnMucG9zaXRpb24uaG92ZXJQb3NpdGlvbiA9IEhvdmVyUG9zaXRpb24uQUJPVkU7XG5cdFx0XHRcdHJldHVybiBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3ZlcihvcHRpb25zKTtcblx0XHRcdH07XG5cblx0XHRcdHJlYWRvbmx5IHBsYWNlbWVudCA9ICdlbGVtZW50JztcblxuXHRcdFx0Z2V0IGRlbGF5KCk6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy5fbGFzdEhvdmVySGlkZVRpbWUgPCAyMDBcblx0XHRcdFx0XHQ/IDAgIC8vIHNob3cgaW5zdGFudGx5IHdoZW4gYSBob3ZlciB3YXMgcmVjZW50bHkgc2hvd25cblx0XHRcdFx0XHQ6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScpO1xuXHRcdFx0fVxuXG5cdFx0XHRvbkRpZEhpZGVIb3ZlcigpIHtcblx0XHRcdFx0dGhpcy5fbGFzdEhvdmVySGlkZVRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHRoaXMuY3VycmVudENvbnRleHQgJiYgdGhpcy51cGRhdGVDb250ZXh0KHRoaXMuY3VycmVudENvbnRleHQpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLCBET00uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldCA9PT0gbGVmdEl0ZW1zQ29udGFpbmVyIHx8IGUudGFyZ2V0ID09PSByaWdodEl0ZW1zQ29udGFpbmVyIHx8IGUudGFyZ2V0ID09PSB0aGlzLnN0YXR1c0JhckNvbnRhaW5lcikge1xuXHRcdFx0XHQvLyBoaXQgb24gZW1wdHkgc3BhY2Vcblx0XHRcdFx0dGhpcy5fb25EaWRDbGljay5maXJlKHtcblx0XHRcdFx0XHR0eXBlOiBDbGlja1RhcmdldFR5cGUuQ29udGFpbmVyLFxuXHRcdFx0XHRcdGV2ZW50OiBlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cdFx0XHRcdGxldCBpdGVtSGFzQ29tbWFuZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAodGFyZ2V0ICYmIERPTS5pc0hUTUxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRFbGVtZW50ID0gPEhUTUxFbGVtZW50PnRhcmdldDtcblx0XHRcdFx0XHRpZiAodGFyZ2V0RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NlbGwtc3RhdHVzLWl0ZW0taGFzLWNvbW1hbmQnKSkge1xuXHRcdFx0XHRcdFx0aXRlbUhhc0NvbW1hbmQgPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGFyZ2V0RWxlbWVudC5wYXJlbnRFbGVtZW50ICYmIHRhcmdldEVsZW1lbnQucGFyZW50RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2NlbGwtc3RhdHVzLWl0ZW0taGFzLWNvbW1hbmQnKSkge1xuXHRcdFx0XHRcdFx0aXRlbUhhc0NvbW1hbmQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXRlbUhhc0NvbW1hbmQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoe1xuXHRcdFx0XHRcdFx0dHlwZTogQ2xpY2tUYXJnZXRUeXBlLkNvbnRyaWJ1dGVkQ29tbWFuZEl0ZW0sXG5cdFx0XHRcdFx0XHRldmVudDogZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHRleHRcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoe1xuXHRcdFx0XHRcdFx0dHlwZTogQ2xpY2tUYXJnZXRUeXBlLkNvbnRyaWJ1dGVkVGV4dEl0ZW0sXG5cdFx0XHRcdFx0XHRldmVudDogZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblxuXHRvdmVycmlkZSBkaWRSZW5kZXJDZWxsKGVsZW1lbnQ6IElDZWxsVmlld01vZGVsKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IGNvbnRleHQ6IChJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCAmIHsgJG1pZDogbnVtYmVyIH0pID0ge1xuXHRcdFx0XHR1aTogdHJ1ZSxcblx0XHRcdFx0Y2VsbDogZWxlbWVudCxcblx0XHRcdFx0bm90ZWJvb2tFZGl0b3I6IHRoaXMuX25vdGVib29rRWRpdG9yLFxuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dFxuXHRcdFx0fTtcblx0XHRcdHRoaXMudXBkYXRlQ29udGV4dChjb250ZXh0KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZWRpdG9yKSB7XG5cdFx0XHQvLyBGb2N1cyBNb2RlXG5cdFx0XHRjb25zdCB1cGRhdGVGb2N1c01vZGVGb3JFZGl0b3JFdmVudCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2VkaXRvciAmJiAodGhpcy5fZWRpdG9yLmhhc1dpZGdldEZvY3VzKCkgfHwgKHRoaXMuc3RhdHVzQmFyQ29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCAmJiB0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5jb250YWlucyh0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpKSkpIHtcblx0XHRcdFx0XHRlbGVtZW50LmZvY3VzTW9kZSA9IENlbGxGb2N1c01vZGUuRWRpdG9yO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gZWxlbWVudC5mb2N1c01vZGU7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRNb2RlID09PSBDZWxsRm9jdXNNb2RlLkNoYXRJbnB1dCkge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkNoYXRJbnB1dDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRNb2RlID09PSBDZWxsRm9jdXNNb2RlLk91dHB1dCAmJiB0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNXZWJ2aWV3Rm9jdXMoKSkge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLk91dHB1dDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5mb2N1c01vZGUgPSBDZWxsRm9jdXNNb2RlLkNvbnRhaW5lcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHRoaXMuY2VsbERpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRcdHVwZGF0ZUZvY3VzTW9kZUZvckVkaXRvckV2ZW50KCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmNlbGxEaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHRcdC8vIHRoaXMgaXMgZm9yIGEgc3BlY2lhbCBjYXNlOlxuXHRcdFx0XHQvLyB1c2VycyBjbGljayB0aGUgc3RhdHVzIGJhciBlbXB0eSBzcGFjZSwgd2hpY2ggd2Ugd2lsbCB0aGVuIGZvY3VzIHRoZSBlZGl0b3Jcblx0XHRcdFx0Ly8gc28gd2UgZG9uJ3Qgd2FudCB0byB1cGRhdGUgdGhlIGZvY3VzIHN0YXRlIHRvbyBlYWdlcmx5LCBpdCB3aWxsIGJlIHVwZGF0ZWQgd2l0aCBvbkRpZEZvY3VzRWRpdG9yV2lkZ2V0XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNFZGl0b3JGb2N1cygpICYmXG5cdFx0XHRcdFx0ISh0aGlzLnN0YXR1c0JhckNvbnRhaW5lci5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgJiYgdGhpcy5zdGF0dXNCYXJDb250YWluZXIuY29udGFpbnModGhpcy5zdGF0dXNCYXJDb250YWluZXIub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50KSkpIHtcblx0XHRcdFx0XHR1cGRhdGVGb2N1c01vZGVGb3JFZGl0b3JFdmVudCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIE1vdXNlIGNsaWNrIGhhbmRsZXJzXG5cdFx0XHR0aGlzLmNlbGxEaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50Q2VsbCBpbnN0YW5jZW9mIENvZGVDZWxsVmlld01vZGVsICYmIGUudHlwZSAhPT0gQ2xpY2tUYXJnZXRUeXBlLkNvbnRyaWJ1dGVkQ29tbWFuZEl0ZW0gJiYgdGhpcy5fZWRpdG9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZWRpdG9yLmdldFRhcmdldEF0Q2xpZW50UG9pbnQoZS5ldmVudC5jbGllbnRYLCBlLmV2ZW50LmNsaWVudFkgLSB0aGlzLl9ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMuY29tcHV0ZUVkaXRvclN0YXR1c2JhckhlaWdodCh0aGlzLmN1cnJlbnRDZWxsLmludGVybmFsTWV0YWRhdGEsIHRoaXMuY3VycmVudENlbGwudXJpKSk7XG5cdFx0XHRcdFx0aWYgKHRhcmdldD8ucG9zaXRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbih0YXJnZXQucG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlSW50ZXJuYWxMYXlvdXROb3coZWxlbWVudDogSUNlbGxWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHQvLyB0b2RvQHJlYm9ybml4IGxheWVyIGJyZWFrZXJcblx0XHR0aGlzLl9jZWxsQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NlbGwtc3RhdHVzYmFyLWhpZGRlbicsIHRoaXMuX25vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5jb21wdXRlRWRpdG9yU3RhdHVzYmFySGVpZ2h0KGVsZW1lbnQuaW50ZXJuYWxNZXRhZGF0YSwgZWxlbWVudC51cmkpID09PSAwKTtcblxuXHRcdGNvbnN0IGxheW91dEluZm8gPSBlbGVtZW50LmxheW91dEluZm87XG5cdFx0Y29uc3Qgd2lkdGggPSBsYXlvdXRJbmZvLmVkaXRvcldpZHRoO1xuXHRcdGlmICghd2lkdGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLndpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5zdGF0dXNCYXJDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cblx0XHRjb25zdCBtYXhJdGVtV2lkdGggPSB0aGlzLmdldE1heEl0ZW1XaWR0aCgpO1xuXHRcdHRoaXMubGVmdEl0ZW1zLmZvckVhY2goaXRlbSA9PiBpdGVtLm1heFdpZHRoID0gbWF4SXRlbVdpZHRoKTtcblx0XHR0aGlzLnJpZ2h0SXRlbXMuZm9yRWFjaChpdGVtID0+IGl0ZW0ubWF4V2lkdGggPSBtYXhJdGVtV2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXhJdGVtV2lkdGgoKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lkdGggLyAyO1xuXHR9XG5cblx0dXBkYXRlQ29udGV4dChjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdHRoaXMuY3VycmVudENvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMuaXRlbXNEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuY3VycmVudENvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLml0ZW1zRGlzcG9zYWJsZS5hZGQodGhpcy5jdXJyZW50Q29udGV4dC5jZWxsLm9uRGlkQ2hhbmdlTGF5b3V0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRDb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW50ZXJuYWxMYXlvdXROb3codGhpcy5jdXJyZW50Q29udGV4dC5jZWxsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5pdGVtc0Rpc3Bvc2FibGUuYWRkKHRoaXMuY3VycmVudENvbnRleHQuY2VsbC5vbkRpZENoYW5nZUNlbGxTdGF0dXNCYXJJdGVtcygoKSA9PiB0aGlzLnVwZGF0ZVJlbmRlcmVkSXRlbXMoKSkpO1xuXHRcdHRoaXMuaXRlbXNEaXNwb3NhYmxlLmFkZCh0aGlzLmN1cnJlbnRDb250ZXh0Lm5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlQWN0aXZlQ2VsbCgoKSA9PiB0aGlzLnVwZGF0ZUFjdGl2ZUNlbGwoKSkpO1xuXHRcdHRoaXMudXBkYXRlSW50ZXJuYWxMYXlvdXROb3codGhpcy5jdXJyZW50Q29udGV4dC5jZWxsKTtcblx0XHR0aGlzLnVwZGF0ZUFjdGl2ZUNlbGwoKTtcblx0XHR0aGlzLnVwZGF0ZVJlbmRlcmVkSXRlbXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWN0aXZlQ2VsbCgpOiB2b2lkIHtcblx0XHRjb25zdCBpc0FjdGl2ZUNlbGwgPSB0aGlzLmN1cnJlbnRDb250ZXh0IS5ub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCkgPT09IHRoaXMuY3VycmVudENvbnRleHQ/LmNlbGw7XG5cdFx0dGhpcy5zdGF0dXNCYXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaXMtYWN0aXZlLWNlbGwnLCBpc0FjdGl2ZUNlbGwpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZW5kZXJlZEl0ZW1zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5jdXJyZW50Q29udGV4dCEuY2VsbC5nZXRDZWxsU3RhdHVzQmFySXRlbXMoKTtcblx0XHRpdGVtcy5zb3J0KChpdGVtQSwgaXRlbUIpID0+IHtcblx0XHRcdHJldHVybiAoaXRlbUIucHJpb3JpdHkgPz8gMCkgLSAoaXRlbUEucHJpb3JpdHkgPz8gMCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYXhJdGVtV2lkdGggPSB0aGlzLmdldE1heEl0ZW1XaWR0aCgpO1xuXHRcdGNvbnN0IG5ld0xlZnRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0uYWxpZ25tZW50ID09PSBDZWxsU3RhdHVzYmFyQWxpZ25tZW50LkxlZnQpO1xuXHRcdGNvbnN0IG5ld1JpZ2h0SXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLmFsaWdubWVudCA9PT0gQ2VsbFN0YXR1c2JhckFsaWdubWVudC5SaWdodCkucmV2ZXJzZSgpO1xuXG5cdFx0Y29uc3QgdXBkYXRlSXRlbXMgPSAocmVuZGVyZWRJdGVtczogQ2VsbFN0YXR1c0Jhckl0ZW1bXSwgbmV3SXRlbXM6IElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtW10sIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdGlmIChyZW5kZXJlZEl0ZW1zLmxlbmd0aCA+IG5ld0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBkZWxldGVkID0gcmVuZGVyZWRJdGVtcy5zcGxpY2UobmV3SXRlbXMubGVuZ3RoLCByZW5kZXJlZEl0ZW1zLmxlbmd0aCAtIG5ld0l0ZW1zLmxlbmd0aCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZGVsZXRlZEl0ZW0gb2YgZGVsZXRlZCkge1xuXHRcdFx0XHRcdGRlbGV0ZWRJdGVtLmNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdFx0XHRkZWxldGVkSXRlbS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bmV3SXRlbXMuZm9yRWFjaCgobmV3TGVmdEl0ZW0sIGkpID0+IHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdJdGVtID0gcmVuZGVyZWRJdGVtc1tpXTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nSXRlbSkge1xuXHRcdFx0XHRcdGV4aXN0aW5nSXRlbS51cGRhdGVJdGVtKG5ld0xlZnRJdGVtLCBtYXhJdGVtV2lkdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDZWxsU3RhdHVzQmFySXRlbSwgdGhpcy5jdXJyZW50Q29udGV4dCEsIHRoaXMuaG92ZXJEZWxlZ2F0ZSwgdGhpcy5fZWRpdG9yLCBuZXdMZWZ0SXRlbSwgbWF4SXRlbVdpZHRoKTtcblx0XHRcdFx0XHRyZW5kZXJlZEl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGl0ZW0uY29udGFpbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdHVwZGF0ZUl0ZW1zKHRoaXMubGVmdEl0ZW1zLCBuZXdMZWZ0SXRlbXMsIHRoaXMubGVmdEl0ZW1zQ29udGFpbmVyKTtcblx0XHR1cGRhdGVJdGVtcyh0aGlzLnJpZ2h0SXRlbXMsIG5ld1JpZ2h0SXRlbXMsIHRoaXMucmlnaHRJdGVtc0NvbnRhaW5lcik7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlKHRoaXMubGVmdEl0ZW1zKTtcblx0XHRkaXNwb3NlKHRoaXMucmlnaHRJdGVtcyk7XG5cdH1cbn1cblxuY2xhc3MgQ2VsbFN0YXR1c0Jhckl0ZW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBjb250YWluZXIgPSAkKCcuY2VsbC1zdGF0dXMtaXRlbScpO1xuXG5cdHNldCBtYXhXaWR0aCh2OiBudW1iZXIpIHtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5tYXhXaWR0aCA9IHYgKyAncHgnO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3VycmVudEl0ZW0hOiBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdGl0ZW1Nb2RlbDogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0sXG5cdFx0bWF4V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVJdGVtKGl0ZW1Nb2RlbCwgbWF4V2lkdGgpO1xuXHR9XG5cblx0dXBkYXRlSXRlbShpdGVtOiBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSwgbWF4V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50SXRlbSB8fCB0aGlzLl9jdXJyZW50SXRlbS50ZXh0ICE9PSBpdGVtLnRleHQpIHtcblx0XHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5hZGQobmV3IFNpbXBsZUljb25MYWJlbCh0aGlzLmNvbnRhaW5lcikpLnRleHQgPSBpdGVtLnRleHQucmVwbGFjZSgvXFxuL2csICcgJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZUNvbG9yID0gKGNvbG9yOiBUaGVtZUNvbG9yIHwgc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gaXNUaGVtZUNvbG9yKGNvbG9yKSA/XG5cdFx0XHRcdCh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKGNvbG9yLmlkKT8udG9TdHJpbmcoKSB8fCAnJykgOlxuXHRcdFx0XHRjb2xvcjtcblx0XHR9O1xuXG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuY29sb3IgPSBpdGVtLmNvbG9yID8gcmVzb2x2ZUNvbG9yKGl0ZW0uY29sb3IpIDogJyc7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gaXRlbS5iYWNrZ3JvdW5kQ29sb3IgPyByZXNvbHZlQ29sb3IoaXRlbS5iYWNrZ3JvdW5kQ29sb3IpIDogJyc7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUub3BhY2l0eSA9IGl0ZW0ub3BhY2l0eSA/IGl0ZW0ub3BhY2l0eSA6ICcnO1xuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1zdGF0dXMtaXRlbS1zaG93LXdoZW4tYWN0aXZlJywgISFpdGVtLm9ubHlTaG93V2hlbkFjdGl2ZSk7XG5cblx0XHRpZiAodHlwZW9mIG1heFdpZHRoID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5tYXhXaWR0aCA9IG1heFdpZHRoO1xuXHRcdH1cblxuXHRcdGxldCBhcmlhTGFiZWw6IHN0cmluZztcblx0XHRsZXQgcm9sZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpdGVtLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbikge1xuXHRcdFx0YXJpYUxhYmVsID0gaXRlbS5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ubGFiZWw7XG5cdFx0XHRyb2xlID0gaXRlbS5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ucm9sZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJpYUxhYmVsID0gaXRlbS50ZXh0ID8gc3RyaXBJY29ucyhpdGVtLnRleHQpLnRyaW0oKSA6ICcnO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgcm9sZSB8fCAnJyk7XG5cblx0XHRpZiAoaXRlbS50b29sdGlwKSB7XG5cdFx0XHRjb25zdCBob3ZlckNvbnRlbnQgPSB0eXBlb2YgaXRlbS50b29sdGlwID09PSAnc3RyaW5nJyA/IGl0ZW0udG9vbHRpcCA6IHsgbWFya2Rvd246IGl0ZW0udG9vbHRpcCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmc7XG5cdFx0XHR0aGlzLl9pdGVtRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih0aGlzLl9ob3ZlckRlbGVnYXRlLCB0aGlzLmNvbnRhaW5lciwgaG92ZXJDb250ZW50KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2VsbC1zdGF0dXMtaXRlbS1oYXMtY29tbWFuZCcsICEhaXRlbS5jb21tYW5kKTtcblx0XHRpZiAoaXRlbS5jb21tYW5kKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0XHRcdHRoaXMuX2l0ZW1EaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5DTElDSywgX2UgPT4ge1xuXHRcdFx0XHR0aGlzLmV4ZWN1dGVDb21tYW5kKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9pdGVtRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy5leGVjdXRlQ29tbWFuZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgndGFiSW5kZXgnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50SXRlbSA9IGl0ZW07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV4ZWN1dGVDb21tYW5kKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLl9jdXJyZW50SXRlbS5jb21tYW5kO1xuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkID0gdHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnID8gY29tbWFuZCA6IGNvbW1hbmQuaWQ7XG5cdFx0Y29uc3QgYXJncyA9IHR5cGVvZiBjb21tYW5kID09PSAnc3RyaW5nJyA/IFtdIDogY29tbWFuZC5hcmd1bWVudHMgPz8gW107XG5cblx0XHRpZiAodHlwZW9mIGNvbW1hbmQgPT09ICdzdHJpbmcnIHx8ICFjb21tYW5kLmFyZ3VtZW50cyB8fCAhQXJyYXkuaXNBcnJheShjb21tYW5kLmFyZ3VtZW50cykgfHwgY29tbWFuZC5hcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhcmdzLnVuc2hpZnQodGhpcy5fY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQsIGZyb206ICdjZWxsIHN0YXR1cyBiYXInIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9lZGl0b3I/LmZvY3VzKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpZCwgLi4uYXJncyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IodG9FcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsZUFBZTtBQUNyRCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUc5QixTQUFTLHFCQUE4RDtBQUN2RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUFxQztBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDhCQUEwRDtBQUVuRSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUc5QixNQUFNLElBQUksSUFBSTtBQUdQLElBQU0sc0JBQU4sY0FBa0MsZ0JBQWdCO0FBQUEsRUFpQnhELFlBQ2tCLGlCQUNBLGdCQUNqQixZQUNpQixTQUN1Qix1QkFDekIsY0FDUSxzQkFDUyxlQUMvQjtBQUNELFVBQU07QUFUVztBQUNBO0FBRUE7QUFDdUI7QUFHUjtBQWxCakMsU0FBUSxZQUFpQyxDQUFDO0FBQzFDLFNBQVEsYUFBa0MsQ0FBQztBQUMz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
