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
import "./media/statusbarpart.css";
import { localize } from "../../../../nls.js";
import { Disposable, DisposableStore, disposeIfDisposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { MultiWindowParts, Part } from "../../part.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { StatusbarAlignment, IStatusbarService, isStatusbarEntryLocation, isStatusbarEntryPriority } from "../../../services/statusbar/browser/statusbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { STATUS_BAR_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_ITEM_HOVER_BACKGROUND, STATUS_BAR_BORDER, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_NO_FOLDER_BORDER, STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND, STATUS_BAR_ITEM_FOCUS_BORDER, STATUS_BAR_FOCUS_BORDER } from "../../../common/theme.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { contrastBorder, activeContrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { EventHelper, addDisposableListener, EventType, clearNode, getWindow, isHTMLElement, $ } from "../../../../base/browser/dom.js";
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { Parts, IWorkbenchLayoutService, LayoutSettings } from "../../../services/layout/browser/layoutService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { equals } from "../../../../base/common/arrays.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ToggleStatusbarVisibilityAction } from "../../actions/layoutActions.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { hash } from "../../../../base/common/hash.js";
import { WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { HideStatusbarEntryAction, ManageExtensionAction, ToggleStatusbarEntryVisibilityAction } from "./statusbarActions.js";
import { StatusbarViewModel } from "./statusbarModel.js";
import { StatusbarEntryItem } from "./statusbarItem.js";
import { StatusBarFocused } from "../../../common/contextkeys.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { isManagedHoverTooltipHTMLElement, isManagedHoverTooltipMarkdownString } from "../../../../base/browser/ui/hover/hover.js";
let StatusbarPart = class extends Part {
  constructor(id, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.instantiationService = instantiationService;
    this.contextService = contextService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.minimumWidth = 0;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    this.pendingEntries = [];
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.onDidOverrideEntry = this._register(new Emitter());
    this.entryOverrides = /* @__PURE__ */ new Map();
    this.compactEntriesDisposable = this._register(new MutableDisposable());
    this.styleOverrides = /* @__PURE__ */ new Set();
    this.viewModel = this._register(new StatusbarViewModel(storageService));
    this.onDidChangeEntryVisibility = this.viewModel.onDidChangeEntryVisibility;
    this.hoverDelegate = this._register(this.instantiationService.createInstance(WorkbenchHoverDelegate, "element", {
      instantHover: true,
      dynamicDelay(content) {
        if (typeof content === "function" || isHTMLElement(content) || isManagedHoverTooltipMarkdownString(content) && typeof content.markdown === "function" || isManagedHoverTooltipHTMLElement(content)) {
          return 500;
        }
        return void 0;
      }
    }, (_, focus) => ({
      persistence: {
        hideOnKeyDown: true,
        sticky: focus
      },
      appearance: {
        maxHeightRatio: 0.9
      }
    })));
    this.registerListeners();
  }
  //#region IView
  get floatingBottomPadding() {
    return this.getId() === Parts.STATUSBAR_PART && this.layoutService.isFloatingPanelsEnabled() ? StatusbarPart.FLOATING_BOTTOM_PADDING : 0;
  }
  get minimumHeight() {
    return StatusbarPart.HEIGHT + this.floatingBottomPadding;
  }
  get maximumHeight() {
    return StatusbarPart.HEIGHT + this.floatingBottomPadding;
  }
  registerListeners() {
    this._register(this.onDidChangeEntryVisibility(() => this.updateCompactEntries()));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateStyles()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (this.getId() === Parts.STATUSBAR_PART && e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        this._onDidChange.fire(void 0);
        if (this.element) {
          this.updateStyles();
        }
      }
    }));
  }
  overrideEntry(id, override) {
    this.entryOverrides.set(id, override);
    this.onDidOverrideEntry.fire(id);
    return toDisposable(() => {
      const currentOverride = this.entryOverrides.get(id);
      if (currentOverride === override) {
        this.entryOverrides.delete(id);
        this.onDidOverrideEntry.fire(id);
      }
    });
  }
  withEntryOverride(entry, id) {
    const override = this.entryOverrides.get(id);
    if (override) {
      entry = { ...entry, ...override };
    }
    return entry;
  }
  addEntry(entry, id, alignment, priorityOrLocation = 0) {
    let priority;
    if (isStatusbarEntryPriority(priorityOrLocation)) {
      priority = priorityOrLocation;
    } else {
      priority = {
        primary: priorityOrLocation,
        secondary: hash(id)
        // derive from identifier to accomplish uniqueness
      };
    }
    if (!this.element) {
      return this.doAddPendingEntry(entry, id, alignment, priority);
    }
    return this.doAddEntry(entry, id, alignment, priority);
  }
  doAddPendingEntry(entry, id, alignment, priority) {
    const pendingEntry = { entry, id, alignment, priority };
    this.pendingEntries.push(pendingEntry);
    const accessor = {
      update: (entry2) => {
        if (pendingEntry.accessor) {
          pendingEntry.accessor.update(entry2);
        } else {
          pendingEntry.entry = entry2;
        }
      },
      dispose: () => {
        if (pendingEntry.accessor) {
          pendingEntry.accessor.dispose();
        } else {
          this.pendingEntries = this.pendingEntries.filter((entry2) => entry2 !== pendingEntry);
        }
      }
    };
    return accessor;
  }
  doAddEntry(entry, id, alignment, priority) {
    const disposables = new DisposableStore();
    const itemContainer = this.doCreateStatusItem(id, alignment);
    const item = disposables.add(this.instantiationService.createInstance(StatusbarEntryItem, itemContainer, this.withEntryOverride(entry, id), this.hoverDelegate));
    const viewModelEntry = new class {
      constructor() {
        this.id = id;
        this.extensionId = entry.extensionId;
        this.alignment = alignment;
        this.priority = priority;
        this.container = itemContainer;
        this.labelContainer = item.labelContainer;
      }
      get name() {
        return item.name;
      }
      get hasCommand() {
        return item.hasCommand;
      }
    }();
    const { needsFullRefresh } = this.doAddOrRemoveModelEntry(viewModelEntry, true);
    if (needsFullRefresh) {
      this.appendStatusbarEntries();
    } else {
      this.appendStatusbarEntry(viewModelEntry);
    }
    let lastEntry = entry;
    const accessor = {
      update: (entry2) => {
        lastEntry = entry2;
        const hadBackgroundColor = itemContainer.classList.contains("has-background-color");
        item.update(this.withEntryOverride(entry2, id));
        if (hadBackgroundColor !== itemContainer.classList.contains("has-background-color")) {
          this.updateVisibleBackgroundColorNeighbors();
        }
      },
      dispose: () => {
        const { needsFullRefresh: needsFullRefresh2 } = this.doAddOrRemoveModelEntry(viewModelEntry, false);
        if (needsFullRefresh2) {
          this.appendStatusbarEntries();
        } else {
          itemContainer.remove();
          this.updateCompactEntries();
        }
        disposables.dispose();
      }
    };
    disposables.add(this.onDidOverrideEntry.event((overrideEntryId) => {
      if (overrideEntryId === id) {
        accessor.update(lastEntry);
      }
    }));
    return accessor;
  }
  doCreateStatusItem(id, alignment, ...extraClasses) {
    const itemContainer = $(".statusbar-item", { id });
    if (extraClasses) {
      itemContainer.classList.add(...extraClasses);
    }
    if (alignment === StatusbarAlignment.RIGHT) {
      itemContainer.classList.add("right");
    } else {
      itemContainer.classList.add("left");
    }
    return itemContainer;
  }
  doAddOrRemoveModelEntry(entry, add) {
    const entriesBefore = this.viewModel.entries;
    if (add) {
      this.viewModel.add(entry);
    } else {
      this.viewModel.remove(entry);
    }
    const entriesAfter = this.viewModel.entries;
    if (add) {
      entriesBefore.splice(entriesAfter.indexOf(entry), 0, entry);
    } else {
      entriesBefore.splice(entriesBefore.indexOf(entry), 1);
    }
    const needsFullRefresh = !equals(entriesBefore, entriesAfter);
    return { needsFullRefresh };
  }
  isEntryVisible(id) {
    return !this.viewModel.isHidden(id);
  }
  updateEntryVisibility(id, visible) {
    if (visible) {
      this.viewModel.show(id);
    } else {
      this.viewModel.hide(id);
    }
  }
  focusNextEntry() {
    this.viewModel.focusNextEntry();
  }
  focusPreviousEntry() {
    this.viewModel.focusPreviousEntry();
  }
  isEntryFocused() {
    return this.viewModel.isEntryFocused();
  }
  focus(preserveEntryFocus = true) {
    this.getContainer()?.focus();
    const lastFocusedEntry = this.viewModel.lastFocusedEntry;
    if (preserveEntryFocus && lastFocusedEntry) {
      setTimeout(() => lastFocusedEntry.labelContainer.focus(), 0);
    }
  }
  createContentArea(parent) {
    this.element = parent;
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
    StatusBarFocused.bindTo(scopedContextKeyService).set(true);
    this.leftItemsContainer = $(".left-items.items-container");
    this.element.appendChild(this.leftItemsContainer);
    this.element.tabIndex = 0;
    this.rightItemsContainer = $(".right-items.items-container");
    this.element.appendChild(this.rightItemsContainer);
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(e)));
    this._register(Gesture.addTarget(parent));
    this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(e)));
    this.createInitialStatusbarEntries();
    return this.element;
  }
  createInitialStatusbarEntries() {
    this.appendStatusbarEntries();
    while (this.pendingEntries.length) {
      const pending = this.pendingEntries.shift();
      if (pending) {
        pending.accessor = this.addEntry(pending.entry, pending.id, pending.alignment, pending.priority.primary);
      }
    }
  }
  appendStatusbarEntries() {
    const leftItemsContainer = assertReturnsDefined(this.leftItemsContainer);
    const rightItemsContainer = assertReturnsDefined(this.rightItemsContainer);
    clearNode(leftItemsContainer);
    clearNode(rightItemsContainer);
    for (const entry of [
      ...this.viewModel.getEntries(StatusbarAlignment.LEFT),
      ...this.viewModel.getEntries(StatusbarAlignment.RIGHT).reverse()
      // reversing due to flex: row-reverse
    ]) {
      const target = entry.alignment === StatusbarAlignment.LEFT ? leftItemsContainer : rightItemsContainer;
      target.appendChild(entry.container);
    }
    this.updateCompactEntries();
  }
  appendStatusbarEntry(entry) {
    const entries = this.viewModel.getEntries(entry.alignment);
    if (entry.alignment === StatusbarAlignment.RIGHT) {
      entries.reverse();
    }
    const target = assertReturnsDefined(entry.alignment === StatusbarAlignment.LEFT ? this.leftItemsContainer : this.rightItemsContainer);
    const index = entries.indexOf(entry);
    if (index + 1 === entries.length) {
      target.appendChild(entry.container);
    } else {
      target.insertBefore(entry.container, entries[index + 1].container);
    }
    this.updateCompactEntries();
  }
  updateCompactEntries() {
    const entries = this.viewModel.entries;
    const mapIdToVisibleEntry = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      if (!this.viewModel.isHidden(entry.id)) {
        mapIdToVisibleEntry.set(entry.id, entry);
      }
      entry.container.classList.remove("compact-left", "compact-right");
    }
    const compactEntryGroups = /* @__PURE__ */ new Map();
    for (const entry of mapIdToVisibleEntry.values()) {
      if (isStatusbarEntryLocation(entry.priority.primary) && // entry references another entry as location
      entry.priority.primary.compact) {
        const locationId = entry.priority.primary.location.id;
        const location = mapIdToVisibleEntry.get(locationId);
        if (!location) {
          continue;
        }
        let compactEntryGroup = compactEntryGroups.get(locationId);
        if (!compactEntryGroup) {
          for (const group of compactEntryGroups.values()) {
            if (group.has(locationId)) {
              compactEntryGroup = group;
              break;
            }
          }
          if (!compactEntryGroup) {
            compactEntryGroup = /* @__PURE__ */ new Map();
            compactEntryGroups.set(locationId, compactEntryGroup);
          }
        }
        compactEntryGroup.set(entry.id, entry);
        compactEntryGroup.set(location.id, location);
        if (entry.priority.primary.alignment === StatusbarAlignment.LEFT) {
          location.container.classList.add("compact-left");
          entry.container.classList.add("compact-right");
        } else {
          location.container.classList.add("compact-right");
          entry.container.classList.add("compact-left");
        }
      }
    }
    const statusBarItemHoverBackground = this.getColor(STATUS_BAR_ITEM_HOVER_BACKGROUND);
    const statusBarItemCompactHoverBackground = this.getColor(STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND);
    this.compactEntriesDisposable.value = new DisposableStore();
    if (statusBarItemHoverBackground && statusBarItemCompactHoverBackground && !isHighContrast(this.theme.type)) {
      for (const [, compactEntryGroup] of compactEntryGroups) {
        for (const compactEntry of compactEntryGroup.values()) {
          if (!compactEntry.hasCommand) {
            continue;
          }
          this.compactEntriesDisposable.value.add(addDisposableListener(compactEntry.labelContainer, EventType.MOUSE_OVER, () => {
            compactEntryGroup.forEach((compactEntry2) => compactEntry2.labelContainer.style.backgroundColor = statusBarItemHoverBackground);
            compactEntry.labelContainer.style.backgroundColor = statusBarItemCompactHoverBackground;
          }));
          this.compactEntriesDisposable.value.add(addDisposableListener(compactEntry.labelContainer, EventType.MOUSE_OUT, () => {
            compactEntryGroup.forEach((compactEntry2) => compactEntry2.labelContainer.style.backgroundColor = "");
          }));
        }
      }
    }
    this.updateVisibleBackgroundColorNeighbors();
  }
  updateVisibleBackgroundColorNeighbors() {
    this.doUpdateVisibleBackgroundColorNeighbors(this.viewModel.getEntries(StatusbarAlignment.LEFT), StatusbarAlignment.LEFT);
    this.doUpdateVisibleBackgroundColorNeighbors(this.viewModel.getEntries(StatusbarAlignment.RIGHT).reverse(), StatusbarAlignment.RIGHT);
  }
  doUpdateVisibleBackgroundColorNeighbors(entries, alignment) {
    let previousVisibleEntry;
    for (const entry of entries) {
      entry.container.classList.remove("visible-background-color-neighbor");
      if (this.viewModel.isHidden(entry.id)) {
        continue;
      }
      const isCompactNeighbor = alignment === StatusbarAlignment.LEFT ? previousVisibleEntry?.container.classList.contains("compact-right") && entry.container.classList.contains("compact-left") : previousVisibleEntry?.container.classList.contains("compact-left") && entry.container.classList.contains("compact-right");
      if (previousVisibleEntry?.container.classList.contains("has-background-color") && entry.container.classList.contains("has-background-color") && !isCompactNeighbor) {
        entry.container.classList.add("visible-background-color-neighbor");
      }
      previousVisibleEntry = entry;
    }
  }
  showContextMenu(e) {
    EventHelper.stop(e, true);
    const event = new StandardMouseEvent(getWindow(this.element), e);
    let actions = void 0;
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => {
        actions = this.getContextMenuActions(event);
        return actions;
      },
      onHide: () => {
        if (actions) {
          disposeIfDisposable(actions);
        }
      }
    });
  }
  getContextMenuActions(event) {
    const actions = [];
    actions.push(toAction({ id: ToggleStatusbarVisibilityAction.ID, label: localize("hideStatusBar", "Hide Status Bar"), run: () => this.instantiationService.invokeFunction((accessor) => new ToggleStatusbarVisibilityAction().run(accessor)) }));
    actions.push(new Separator());
    const handledEntries = /* @__PURE__ */ new Set();
    for (const entry of this.viewModel.entries) {
      if (!handledEntries.has(entry.id)) {
        actions.push(new ToggleStatusbarEntryVisibilityAction(entry.id, entry.name, this.viewModel));
        handledEntries.add(entry.id);
      }
    }
    let statusEntryUnderMouse = void 0;
    for (let element = event.target; element; element = element.parentElement) {
      const entry = this.viewModel.findEntry(element);
      if (entry) {
        statusEntryUnderMouse = entry;
        break;
      }
    }
    if (statusEntryUnderMouse) {
      actions.push(new Separator());
      if (statusEntryUnderMouse.extensionId) {
        actions.push(this.instantiationService.createInstance(ManageExtensionAction, statusEntryUnderMouse.extensionId));
      }
      actions.push(new HideStatusbarEntryAction(statusEntryUnderMouse.id, statusEntryUnderMouse.name, this.viewModel));
    }
    return actions;
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    const styleOverride = [...this.styleOverrides].sort((a, b) => a.priority - b.priority)[0];
    const backgroundColor = this.getColor(styleOverride?.background ?? (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_BACKGROUND : STATUS_BAR_NO_FOLDER_BACKGROUND)) || "";
    container.style.backgroundColor = backgroundColor;
    container.style.boxShadow = this.getId() === Parts.STATUSBAR_PART && this.layoutService.isFloatingPanelsEnabled() && !isHighContrast(this.theme.type) && backgroundColor ? `0 1px 0 ${backgroundColor}` : "";
    const foregroundColor = this.getColor(styleOverride?.foreground ?? (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_FOREGROUND : STATUS_BAR_NO_FOLDER_FOREGROUND)) || "";
    container.style.color = foregroundColor;
    const itemBorderColor = this.getColor(STATUS_BAR_ITEM_FOCUS_BORDER);
    this.updateCompactEntries();
    const borderColor = this.getColor(styleOverride?.border ?? (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_BORDER : STATUS_BAR_NO_FOLDER_BORDER)) || this.getColor(contrastBorder);
    if (borderColor) {
      container.classList.add("status-border-top");
      container.style.setProperty("--status-border-top-color", borderColor);
    } else {
      container.classList.remove("status-border-top");
      container.style.removeProperty("--status-border-top-color");
    }
    const statusBarFocusColor = this.getColor(STATUS_BAR_FOCUS_BORDER);
    if (!this.styleElement) {
      this.styleElement = createStyleSheet(container, void 0, this._store);
    }
    this.styleElement.textContent = `

				/* Status bar focus outline */
				.monaco-workbench .part.statusbar:focus {
					outline-color: ${statusBarFocusColor};
				}

				/* Status bar item focus outline */
				.monaco-workbench .part.statusbar > .items-container > .statusbar-item a:focus-visible {
					outline: 1px solid ${this.getColor(activeContrastBorder) ?? itemBorderColor};
					outline-offset: ${borderColor ? "-2px" : "-1px"};
				}

				/* Notification Beak */
				.monaco-workbench .part.statusbar > .items-container > .statusbar-item.has-beak > .status-bar-item-beak-container:before {
					border-bottom-color: ${borderColor ?? backgroundColor};
				}
			`;
  }
  layout(width, height, top, left) {
    super.layout(width, height, top, left);
    super.layoutContents(width, height);
  }
  overrideStyle(style) {
    this.styleOverrides.add(style);
    this.updateStyles();
    return toDisposable(() => {
      this.styleOverrides.delete(style);
      this.updateStyles();
    });
  }
  toJSON() {
    return {
      type: Parts.STATUSBAR_PART
    };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
};
StatusbarPart.HEIGHT = 22;
/**
 * Vertical padding reserved around the main status bar under the floating panels
 * experiment so its items remain centered. The part grows by this amount and
 * the matching padding is applied in `floatingPanels.css`.
 */
StatusbarPart.FLOATING_BOTTOM_PADDING = 10;
StatusbarPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IConfigurationService)
], StatusbarPart);
let MainStatusbarPart = class extends StatusbarPart {
  constructor(instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService) {
    super(Parts.STATUSBAR_PART, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService);
  }
};
MainStatusbarPart = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IThemeService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IConfigurationService)
], MainStatusbarPart);
let AuxiliaryStatusbarPart = class extends StatusbarPart {
  constructor(container, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService) {
    const id = AuxiliaryStatusbarPart.COUNTER++;
    super(`workbench.parts.auxiliaryStatus.${id}`, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService);
    this.container = container;
    this.height = StatusbarPart.HEIGHT;
  }
};
AuxiliaryStatusbarPart.COUNTER = 1;
AuxiliaryStatusbarPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IConfigurationService)
], AuxiliaryStatusbarPart);
let StatusbarService = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService) {
    super("workbench.statusBarService", themeService, storageService);
    this.instantiationService = instantiationService;
    this._onDidCreateAuxiliaryStatusbarPart = this._register(new Emitter());
    this.onDidCreateAuxiliaryStatusbarPart = this._onDidCreateAuxiliaryStatusbarPart.event;
    this.mainPart = this._register(this.instantiationService.createInstance(MainStatusbarPart));
    this._register(this.registerPart(this.mainPart));
    this.onDidChangeEntryVisibility = this.mainPart.onDidChangeEntryVisibility;
  }
  //#region Auxiliary Statusbar Parts
  createAuxiliaryStatusbarPart(container, instantiationService) {
    const statusbarPartContainer = $("footer.part.statusbar", {
      "role": "status",
      "aria-live": "off",
      "tabIndex": "0"
    });
    statusbarPartContainer.style.position = "relative";
    container.appendChild(statusbarPartContainer);
    const statusbarPart = instantiationService.createInstance(AuxiliaryStatusbarPart, statusbarPartContainer);
    const disposable = this.registerPart(statusbarPart);
    statusbarPart.create(statusbarPartContainer);
    Event.once(statusbarPart.onWillDispose)(() => disposable.dispose());
    this._onDidCreateAuxiliaryStatusbarPart.fire(statusbarPart);
    return statusbarPart;
  }
  createScoped(statusbarEntryContainer, disposables) {
    return disposables.add(this.instantiationService.createInstance(ScopedStatusbarService, statusbarEntryContainer));
  }
  addEntry(entry, id, alignment, priorityOrLocation = 0) {
    if (entry.showInAllWindows) {
      return this.doAddEntryToAllWindows(entry, id, alignment, priorityOrLocation);
    }
    return this.mainPart.addEntry(entry, id, alignment, priorityOrLocation);
  }
  doAddEntryToAllWindows(originalEntry, id, alignment, priorityOrLocation = 0) {
    const entryDisposables = new DisposableStore();
    const accessors = /* @__PURE__ */ new Set();
    let entry = originalEntry;
    function addEntry(part) {
      const partDisposables = new DisposableStore();
      partDisposables.add(part.onWillDispose(() => partDisposables.dispose()));
      const accessor = partDisposables.add(part.addEntry(entry, id, alignment, priorityOrLocation));
      accessors.add(accessor);
      partDisposables.add(toDisposable(() => accessors.delete(accessor)));
      entryDisposables.add(partDisposables);
      partDisposables.add(toDisposable(() => entryDisposables.delete(partDisposables)));
    }
    for (const part of this.parts) {
      addEntry(part);
    }
    entryDisposables.add(this.onDidCreateAuxiliaryStatusbarPart((part) => addEntry(part)));
    return {
      update: (updatedEntry) => {
        entry = updatedEntry;
        for (const update of accessors) {
          update.update(updatedEntry);
        }
      },
      dispose: () => entryDisposables.dispose()
    };
  }
  isEntryVisible(id) {
    return this.mainPart.isEntryVisible(id);
  }
  updateEntryVisibility(id, visible) {
    for (const part of this.parts) {
      part.updateEntryVisibility(id, visible);
    }
  }
  overrideEntry(id, override) {
    const disposables = new DisposableStore();
    for (const part of this.parts) {
      disposables.add(part.overrideEntry(id, override));
    }
    return disposables;
  }
  focus(preserveEntryFocus) {
    this.activePart.focus(preserveEntryFocus);
  }
  focusNextEntry() {
    this.activePart.focusNextEntry();
  }
  focusPreviousEntry() {
    this.activePart.focusPreviousEntry();
  }
  isEntryFocused() {
    return this.activePart.isEntryFocused();
  }
  overrideStyle(style) {
    const disposables = new DisposableStore();
    for (const part of this.parts) {
      disposables.add(part.overrideStyle(style));
    }
    return disposables;
  }
  //#endregion
};
StatusbarService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService)
], StatusbarService);
let ScopedStatusbarService = class extends Disposable {
  constructor(statusbarEntryContainer, statusbarService) {
    super();
    this.statusbarEntryContainer = statusbarEntryContainer;
    this.statusbarService = statusbarService;
    this.onDidChangeEntryVisibility = this.statusbarEntryContainer.onDidChangeEntryVisibility;
  }
  createAuxiliaryStatusbarPart(container, instantiationService) {
    return this.statusbarService.createAuxiliaryStatusbarPart(container, instantiationService);
  }
  createScoped(statusbarEntryContainer, disposables) {
    return this.statusbarService.createScoped(statusbarEntryContainer, disposables);
  }
  getPart() {
    return this.statusbarEntryContainer;
  }
  addEntry(entry, id, alignment, priorityOrLocation = 0) {
    return this.statusbarEntryContainer.addEntry(entry, id, alignment, priorityOrLocation);
  }
  isEntryVisible(id) {
    return this.statusbarEntryContainer.isEntryVisible(id);
  }
  updateEntryVisibility(id, visible) {
    this.statusbarEntryContainer.updateEntryVisibility(id, visible);
  }
  overrideEntry(id, override) {
    return this.statusbarEntryContainer.overrideEntry(id, override);
  }
  focus(preserveEntryFocus) {
    this.statusbarEntryContainer.focus(preserveEntryFocus);
  }
  focusNextEntry() {
    this.statusbarEntryContainer.focusNextEntry();
  }
  focusPreviousEntry() {
    this.statusbarEntryContainer.focusPreviousEntry();
  }
  isEntryFocused() {
    return this.statusbarEntryContainer.isEntryFocused();
  }
  overrideStyle(style) {
    return this.statusbarEntryContainer.overrideStyle(style);
  }
};
ScopedStatusbarService = __decorateClass([
  __decorateParam(1, IStatusbarService)
], ScopedStatusbarService);
registerSingleton(IStatusbarService, StatusbarService, InstantiationType.Eager);
export {
  AuxiliaryStatusbarPart,
  MainStatusbarPart,
  ScopedStatusbarService,
  StatusbarService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxzdGF0dXNiYXJcXHN0YXR1c2JhclBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc3RhdHVzYmFycGFydC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlSWZEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNdWx0aVdpbmRvd1BhcnRzLCBQYXJ0IH0gZnJvbSAnLi4vLi4vcGFydC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmUsIEdlc3R1cmVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFN0YXR1c2JhckFsaWdubWVudCwgSVN0YXR1c2JhclNlcnZpY2UsIElTdGF0dXNiYXJFbnRyeSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTdHlsZU92ZXJyaWRlLCBpc1N0YXR1c2JhckVudHJ5TG9jYXRpb24sIElTdGF0dXNiYXJFbnRyeUxvY2F0aW9uLCBpc1N0YXR1c2JhckVudHJ5UHJpb3JpdHksIElTdGF0dXNiYXJFbnRyeVByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNUQVRVU19CQVJfQkFDS0dST1VORCwgU1RBVFVTX0JBUl9GT1JFR1JPVU5ELCBTVEFUVVNfQkFSX05PX0ZPTERFUl9CQUNLR1JPVU5ELCBTVEFUVVNfQkFSX0lURU1fSE9WRVJfQkFDS0dST1VORCwgU1RBVFVTX0JBUl9CT1JERVIsIFNUQVRVU19CQVJfTk9fRk9MREVSX0ZPUkVHUk9VTkQsIFNUQVRVU19CQVJfTk9fRk9MREVSX0JPUkRFUiwgU1RBVFVTX0JBUl9JVEVNX0NPTVBBQ1RfSE9WRVJfQkFDS0dST1VORCwgU1RBVFVTX0JBUl9JVEVNX0ZPQ1VTX0JPUkRFUiwgU1RBVFVTX0JBUl9GT0NVU19CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyLCBhY3RpdmVDb250cmFzdEJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV2ZW50SGVscGVyLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgY2xlYXJOb2RlLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQsICQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBQYXJ0cywgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIExheW91dFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IFRvZ2dsZVN0YXR1c2JhclZpc2liaWxpdHlBY3Rpb24gfSBmcm9tICcuLi8uLi9hY3Rpb25zL2xheW91dEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGlzSGlnaENvbnRyYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhpZGVTdGF0dXNiYXJFbnRyeUFjdGlvbiwgTWFuYWdlRXh0ZW5zaW9uQWN0aW9uLCBUb2dnbGVTdGF0dXNiYXJFbnRyeVZpc2liaWxpdHlBY3Rpb24gfSBmcm9tICcuL3N0YXR1c2JhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclZpZXdNb2RlbEVudHJ5LCBTdGF0dXNiYXJWaWV3TW9kZWwgfSBmcm9tICcuL3N0YXR1c2Jhck1vZGVsLmpzJztcbmltcG9ydCB7IFN0YXR1c2JhckVudHJ5SXRlbSB9IGZyb20gJy4vc3RhdHVzYmFySXRlbS5qcyc7XG5pbXBvcnQgeyBTdGF0dXNCYXJGb2N1c2VkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IGlzTWFuYWdlZEhvdmVyVG9vbHRpcEhUTUxFbGVtZW50LCBpc01hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0YXR1c2JhckVudHJ5Q29udGFpbmVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IGlzIHRyaWdnZXJlZCB3aGVuIGFuIGVudHJ5J3MgdmlzaWJpbGl0eSBpcyBjaGFuZ2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHk6IEV2ZW50PHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbiB9PjtcblxuXHQvKipcblx0ICogQWRkcyBhbiBlbnRyeSB0byB0aGUgc3RhdHVzYmFyIHdpdGggdGhlIGdpdmVuIGFsaWdubWVudCBhbmQgcHJpb3JpdHkuIFVzZSB0aGUgcmV0dXJuZWQgYWNjZXNzb3Jcblx0ICogdG8gdXBkYXRlIG9yIHJlbW92ZSB0aGUgc3RhdHVzYmFyIGVudHJ5LlxuXHQgKlxuXHQgKiBAcGFyYW0gaWQgaWRlbnRpZmllciBvZiB0aGUgZW50cnkgaXMgbmVlZGVkIHRvIGFsbG93IHVzZXJzIHRvIGhpZGUgZW50cmllcyB2aWEgc2V0dGluZ3Ncblx0ICogQHBhcmFtIGFsaWdubWVudCBlaXRoZXIgTEVGVCBvciBSSUdIVCBzaWRlIGluIHRoZSBzdGF0dXMgYmFyXG5cdCAqIEBwYXJhbSBwcmlvcml0eSBpdGVtcyBnZXQgYXJyYW5nZWQgZnJvbSBoaWdoZXN0IHByaW9yaXR5IHRvIGxvd2VzdCBwcmlvcml0eSBmcm9tIGxlZnQgdG8gcmlnaHRcblx0ICogaW4gdGhlaXIgcmVzcGVjdGl2ZSBhbGlnbm1lbnQgc2xvdFxuXHQgKi9cblx0YWRkRW50cnkoZW50cnk6IElTdGF0dXNiYXJFbnRyeSwgaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIHByaW9yaXR5PzogbnVtYmVyIHwgSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkpOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcjtcblx0YWRkRW50cnkoZW50cnk6IElTdGF0dXNiYXJFbnRyeSwgaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIHByaW9yaXR5PzogbnVtYmVyIHwgSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkgfCBJU3RhdHVzYmFyRW50cnlMb2NhdGlvbik6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yO1xuXG5cdC8qKlxuXHQgKiBBZGRzIGFuIGVudHJ5IHRvIHRoZSBzdGF0dXNiYXIgd2l0aCB0aGUgZ2l2ZW4gYWxpZ25tZW50IHJlbGF0aXZlIHRvIGFub3RoZXIgZW50cnkuIFVzZSB0aGUgcmV0dXJuZWRcblx0ICogYWNjZXNzb3IgdG8gdXBkYXRlIG9yIHJlbW92ZSB0aGUgc3RhdHVzYmFyIGVudHJ5LlxuXHQgKlxuXHQgKiBAcGFyYW0gaWQgaWRlbnRpZmllciBvZiB0aGUgZW50cnkgaXMgbmVlZGVkIHRvIGFsbG93IHVzZXJzIHRvIGhpZGUgZW50cmllcyB2aWEgc2V0dGluZ3Ncblx0ICogQHBhcmFtIGFsaWdubWVudCBlaXRoZXIgTEVGVCBvciBSSUdIVCBzaWRlIGluIHRoZSBzdGF0dXMgYmFyXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBhIHJlZmVyZW5jZSB0byBhbm90aGVyIGVudHJ5IHRvIHBvc2l0aW9uIHJlbGF0aXZlIHRvXG5cdCAqL1xuXHRhZGRFbnRyeShlbnRyeTogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nLCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudCwgbG9jYXRpb24/OiBJU3RhdHVzYmFyRW50cnlMb2NhdGlvbik6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm4gaWYgYW4gZW50cnkgaXMgdmlzaWJsZSBvciBub3QuXG5cdCAqL1xuXHRpc0VudHJ5VmlzaWJsZShpZDogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIHVwZGF0ZSBhbiBlbnRyeSdzIHZpc2liaWxpdHkgd2l0aCB0aGUgcHJvdmlkZWQgSUQuXG5cdCAqL1xuXHR1cGRhdGVFbnRyeVZpc2liaWxpdHkoaWQ6IHN0cmluZywgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byBvdmVycmlkZSB0aGUgYXBwZWFyYW5jZSBvZiBhbiBlbnRyeSB3aXRoIHRoZSBwcm92aWRlZCBJRC5cblx0ICovXG5cdG92ZXJyaWRlRW50cnkoaWQ6IHN0cmluZywgb3ZlcnJpZGU6IFBhcnRpYWw8SVN0YXR1c2JhckVudHJ5Pik6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBGb2N1c2VkIHRoZSBzdGF0dXMgYmFyLiBJZiBvbmUgb2YgdGhlIHN0YXR1cyBiYXIgZW50cmllcyB3YXMgZm9jdXNlZCwgZm9jdXNlcyBpdCBkaXJlY3RseS5cblx0ICovXG5cdGZvY3VzKHByZXNlcnZlRW50cnlGb2N1cz86IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBuZXh0IHN0YXR1cyBiYXIgZW50cnkuIElmIG5vbmUgZm9jdXNlZCwgZm9jdXNlcyB0aGUgZmlyc3QuXG5cdCAqL1xuXHRmb2N1c05leHRFbnRyeSgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBwcmV2aW91cyBzdGF0dXMgYmFyIGVudHJ5LiBJZiBub25lIGZvY3VzZWQsIGZvY3VzZXMgdGhlIGxhc3QuXG5cdCAqL1xuXHRmb2N1c1ByZXZpb3VzRW50cnkoKTogdm9pZDtcblxuXHQvKipcblx0ICpcdFJldHVybnMgdHJ1ZSBpZiBhIHN0YXR1cyBiYXIgZW50cnkgaXMgZm9jdXNlZC5cblx0ICovXG5cdGlzRW50cnlGb2N1c2VkKCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRlbXBvcmFyaWx5IG92ZXJyaWRlIHN0YXR1c2JhciBzdHlsZS5cblx0ICovXG5cdG92ZXJyaWRlU3R5bGUoc3R5bGU6IElTdGF0dXNiYXJTdHlsZU92ZXJyaWRlKTogSURpc3Bvc2FibGU7XG59XG5cbmludGVyZmFjZSBJUGVuZGluZ1N0YXR1c2JhckVudHJ5IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQ7XG5cdHJlYWRvbmx5IHByaW9yaXR5OiBJU3RhdHVzYmFyRW50cnlQcmlvcml0eTtcblxuXHRlbnRyeTogSVN0YXR1c2JhckVudHJ5O1xuXHRhY2Nlc3Nvcj86IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yO1xufVxuXG5jbGFzcyBTdGF0dXNiYXJQYXJ0IGV4dGVuZHMgUGFydCBpbXBsZW1lbnRzIElTdGF0dXNiYXJFbnRyeUNvbnRhaW5lciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IEhFSUdIVCA9IDIyO1xuXG5cdC8qKlxuXHQgKiBWZXJ0aWNhbCBwYWRkaW5nIHJlc2VydmVkIGFyb3VuZCB0aGUgbWFpbiBzdGF0dXMgYmFyIHVuZGVyIHRoZSBmbG9hdGluZyBwYW5lbHNcblx0ICogZXhwZXJpbWVudCBzbyBpdHMgaXRlbXMgcmVtYWluIGNlbnRlcmVkLiBUaGUgcGFydCBncm93cyBieSB0aGlzIGFtb3VudCBhbmRcblx0ICogdGhlIG1hdGNoaW5nIHBhZGRpbmcgaXMgYXBwbGllZCBpbiBgZmxvYXRpbmdQYW5lbHMuY3NzYC5cblx0ICovXG5cdHN0YXRpYyByZWFkb25seSBGTE9BVElOR19CT1RUT01fUEFERElORyA9IDEwO1xuXG5cdC8vI3JlZ2lvbiBJVmlld1xuXG5cdHByaXZhdGUgZ2V0IGZsb2F0aW5nQm90dG9tUGFkZGluZygpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdldElkKCkgPT09IFBhcnRzLlNUQVRVU0JBUl9QQVJUICYmIHRoaXMubGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpID8gU3RhdHVzYmFyUGFydC5GTE9BVElOR19CT1RUT01fUEFERElORyA6IDA7XG5cdH1cblxuXHRyZWFkb25seSBtaW5pbXVtV2lkdGg6IG51bWJlciA9IDA7XG5cdHJlYWRvbmx5IG1heGltdW1XaWR0aDogbnVtYmVyID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gU3RhdHVzYmFyUGFydC5IRUlHSFQgKyB0aGlzLmZsb2F0aW5nQm90dG9tUGFkZGluZzsgfVxuXHRnZXQgbWF4aW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gU3RhdHVzYmFyUGFydC5IRUlHSFQgKyB0aGlzLmZsb2F0aW5nQm90dG9tUGFkZGluZzsgfVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgc3R5bGVFbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcGVuZGluZ0VudHJpZXM6IElQZW5kaW5nU3RhdHVzYmFyRW50cnlbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBTdGF0dXNiYXJWaWV3TW9kZWw7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHk6IEV2ZW50PHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbiB9PjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRPdmVycmlkZUVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbnRyeU92ZXJyaWRlcyA9IG5ldyBNYXA8c3RyaW5nLCBQYXJ0aWFsPElTdGF0dXNiYXJFbnRyeT4+KCk7XG5cblx0cHJpdmF0ZSBsZWZ0SXRlbXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJpZ2h0SXRlbXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZTogV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBhY3RFbnRyaWVzRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0eWxlT3ZlcnJpZGVzID0gbmV3IFNldDxJU3RhdHVzYmFyU3R5bGVPdmVycmlkZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgeyBoYXNUaXRsZTogZmFsc2UgfSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdGF0dXNiYXJWaWV3TW9kZWwoc3RvcmFnZVNlcnZpY2UpKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5ID0gdGhpcy52aWV3TW9kZWwub25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHk7XG5cblx0XHR0aGlzLmhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsICdlbGVtZW50Jywge1xuXHRcdFx0aW5zdGFudEhvdmVyOiB0cnVlLFxuXHRcdFx0ZHluYW1pY0RlbGF5KGNvbnRlbnQpIHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHR5cGVvZiBjb250ZW50ID09PSAnZnVuY3Rpb24nIHx8XG5cdFx0XHRcdFx0aXNIVE1MRWxlbWVudChjb250ZW50KSB8fFxuXHRcdFx0XHRcdChpc01hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyhjb250ZW50KSAmJiB0eXBlb2YgY29udGVudC5tYXJrZG93biA9PT0gJ2Z1bmN0aW9uJykgfHxcblx0XHRcdFx0XHRpc01hbmFnZWRIb3ZlclRvb2x0aXBIVE1MRWxlbWVudChjb250ZW50KVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHQvLyBvdmVycmlkZSB0aGUgZGVsYXkgZm9yIGNvbnRlbnQgdGhhdCBpcyByaWNoIChlLmcuIGh0bWwgb3IgbG9uZyBydW5uaW5nKVxuXHRcdFx0XHRcdC8vIHNvIHRoYXQgaXQgYXBwZWFycyBtb3JlIGluc3RhbnRseS4gdGhlc2UgaG92ZXJzIGNhcnJ5IG1vcmUgaW1wb3J0YW50XG5cdFx0XHRcdFx0Ly8gaW5mb3JtYXRpb24gYW5kIHNob3VsZCBub3QgYmUgZGVsYXllZCBieSBwcmVmZXJlbmNlLlxuXHRcdFx0XHRcdHJldHVybiA1MDA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0sIChfLCBmb2N1cz86IGJvb2xlYW4pID0+IChcblx0XHRcdHtcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHtcblx0XHRcdFx0XHRoaWRlT25LZXlEb3duOiB0cnVlLFxuXHRcdFx0XHRcdHN0aWNreTogZm9jdXNcblx0XHRcdFx0fSxcblx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdG1heEhlaWdodFJhdGlvOiAwLjlcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBFbnRyeSB2aXNpYmlsaXR5IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5KCgpID0+IHRoaXMudXBkYXRlQ29tcGFjdEVudHJpZXMoKSkpO1xuXG5cdFx0Ly8gV29ya2JlbmNoIHN0YXRlIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy51cGRhdGVTdHlsZXMoKSkpO1xuXG5cdFx0Ly8gRmxvYXRpbmcgcGFuZWxzIGNoYW5nZXMgdGhlIHJlc2VydmVkIGJvdHRvbSBwYWRkaW5nIChhbmQgdGhlcmVmb3JlIHRoZVxuXHRcdC8vIHBhcnQgaGVpZ2h0KSBmb3IgdGhlIG1haW4gc3RhdHVzIGJhciBvbmx5OiBzaWduYWwgdGhlIGdyaWQgdGhhdCB0aGUgc2l6ZVxuXHRcdC8vIGNvbnN0cmFpbnQgY2hhbmdlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmICh0aGlzLmdldElkKCkgPT09IFBhcnRzLlNUQVRVU0JBUl9QQVJUICYmIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuTU9ERVJOX1VJKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGVFbnRyeShpZDogc3RyaW5nLCBvdmVycmlkZTogUGFydGlhbDxJU3RhdHVzYmFyRW50cnk+KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuZW50cnlPdmVycmlkZXMuc2V0KGlkLCBvdmVycmlkZSk7XG5cdFx0dGhpcy5vbkRpZE92ZXJyaWRlRW50cnkuZmlyZShpZCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRPdmVycmlkZSA9IHRoaXMuZW50cnlPdmVycmlkZXMuZ2V0KGlkKTtcblx0XHRcdGlmIChjdXJyZW50T3ZlcnJpZGUgPT09IG92ZXJyaWRlKSB7XG5cdFx0XHRcdHRoaXMuZW50cnlPdmVycmlkZXMuZGVsZXRlKGlkKTtcblx0XHRcdFx0dGhpcy5vbkRpZE92ZXJyaWRlRW50cnkuZmlyZShpZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhFbnRyeU92ZXJyaWRlKGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdGNvbnN0IG92ZXJyaWRlID0gdGhpcy5lbnRyeU92ZXJyaWRlcy5nZXQoaWQpO1xuXHRcdGlmIChvdmVycmlkZSkge1xuXHRcdFx0ZW50cnkgPSB7IC4uLmVudHJ5LCAuLi5vdmVycmlkZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdGFkZEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb246IG51bWJlciB8IElTdGF0dXNiYXJFbnRyeUxvY2F0aW9uIHwgSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkgPSAwKTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3Ige1xuXHRcdGxldCBwcmlvcml0eTogSVN0YXR1c2JhckVudHJ5UHJpb3JpdHk7XG5cdFx0aWYgKGlzU3RhdHVzYmFyRW50cnlQcmlvcml0eShwcmlvcml0eU9yTG9jYXRpb24pKSB7XG5cdFx0XHRwcmlvcml0eSA9IHByaW9yaXR5T3JMb2NhdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJpb3JpdHkgPSB7XG5cdFx0XHRcdHByaW1hcnk6IHByaW9yaXR5T3JMb2NhdGlvbixcblx0XHRcdFx0c2Vjb25kYXJ5OiBoYXNoKGlkKSAvLyBkZXJpdmUgZnJvbSBpZGVudGlmaWVyIHRvIGFjY29tcGxpc2ggdW5pcXVlbmVzc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBBcyBsb25nIGFzIHdlIGhhdmUgbm90IGJlZW4gY3JlYXRlZCBpbnRvIGEgY29udGFpbmVyIHlldCwgcmVjb3JkIGFsbCBlbnRyaWVzXG5cdFx0Ly8gdGhhdCBhcmUgcGVuZGluZyBzbyB0aGF0IHRoZXkgY2FuIGdldCBjcmVhdGVkIGF0IGEgbGF0ZXIgcG9pbnRcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9BZGRQZW5kaW5nRW50cnkoZW50cnksIGlkLCBhbGlnbm1lbnQsIHByaW9yaXR5KTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgYWRkIHRvIHZpZXdcblx0XHRyZXR1cm4gdGhpcy5kb0FkZEVudHJ5KGVudHJ5LCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eSk7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkUGVuZGluZ0VudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eTogSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkpOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB7XG5cdFx0Y29uc3QgcGVuZGluZ0VudHJ5OiBJUGVuZGluZ1N0YXR1c2JhckVudHJ5ID0geyBlbnRyeSwgaWQsIGFsaWdubWVudCwgcHJpb3JpdHkgfTtcblx0XHR0aGlzLnBlbmRpbmdFbnRyaWVzLnB1c2gocGVuZGluZ0VudHJ5KTtcblxuXHRcdGNvbnN0IGFjY2Vzc29yOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciA9IHtcblx0XHRcdHVwZGF0ZTogKGVudHJ5OiBJU3RhdHVzYmFyRW50cnkpID0+IHtcblx0XHRcdFx0aWYgKHBlbmRpbmdFbnRyeS5hY2Nlc3Nvcikge1xuXHRcdFx0XHRcdHBlbmRpbmdFbnRyeS5hY2Nlc3Nvci51cGRhdGUoZW50cnkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHBlbmRpbmdFbnRyeS5lbnRyeSA9IGVudHJ5O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChwZW5kaW5nRW50cnkuYWNjZXNzb3IpIHtcblx0XHRcdFx0XHRwZW5kaW5nRW50cnkuYWNjZXNzb3IuZGlzcG9zZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucGVuZGluZ0VudHJpZXMgPSB0aGlzLnBlbmRpbmdFbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeSAhPT0gcGVuZGluZ0VudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gYWNjZXNzb3I7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkRW50cnkoZW50cnk6IElTdGF0dXNiYXJFbnRyeSwgaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIHByaW9yaXR5OiBJU3RhdHVzYmFyRW50cnlQcmlvcml0eSk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIFZpZXcgbW9kZWwgaXRlbVxuXHRcdGNvbnN0IGl0ZW1Db250YWluZXIgPSB0aGlzLmRvQ3JlYXRlU3RhdHVzSXRlbShpZCwgYWxpZ25tZW50KTtcblx0XHRjb25zdCBpdGVtID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhdHVzYmFyRW50cnlJdGVtLCBpdGVtQ29udGFpbmVyLCB0aGlzLndpdGhFbnRyeU92ZXJyaWRlKGVudHJ5LCBpZCksIHRoaXMuaG92ZXJEZWxlZ2F0ZSkpO1xuXG5cdFx0Ly8gVmlldyBtb2RlbCBlbnRyeVxuXHRcdGNvbnN0IHZpZXdNb2RlbEVudHJ5OiBJU3RhdHVzYmFyVmlld01vZGVsRW50cnkgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJU3RhdHVzYmFyVmlld01vZGVsRW50cnkge1xuXHRcdFx0cmVhZG9ubHkgaWQgPSBpZDtcblx0XHRcdHJlYWRvbmx5IGV4dGVuc2lvbklkID0gZW50cnkuZXh0ZW5zaW9uSWQ7XG5cdFx0XHRyZWFkb25seSBhbGlnbm1lbnQgPSBhbGlnbm1lbnQ7XG5cdFx0XHRyZWFkb25seSBwcmlvcml0eSA9IHByaW9yaXR5O1xuXHRcdFx0cmVhZG9ubHkgY29udGFpbmVyID0gaXRlbUNvbnRhaW5lcjtcblx0XHRcdHJlYWRvbmx5IGxhYmVsQ29udGFpbmVyID0gaXRlbS5sYWJlbENvbnRhaW5lcjtcblxuXHRcdFx0Z2V0IG5hbWUoKSB7IHJldHVybiBpdGVtLm5hbWU7IH1cblx0XHRcdGdldCBoYXNDb21tYW5kKCkgeyByZXR1cm4gaXRlbS5oYXNDb21tYW5kOyB9XG5cdFx0fTtcblxuXHRcdC8vIEFkZCB0byB2aWV3IG1vZGVsXG5cdFx0Y29uc3QgeyBuZWVkc0Z1bGxSZWZyZXNoIH0gPSB0aGlzLmRvQWRkT3JSZW1vdmVNb2RlbEVudHJ5KHZpZXdNb2RlbEVudHJ5LCB0cnVlKTtcblx0XHRpZiAobmVlZHNGdWxsUmVmcmVzaCkge1xuXHRcdFx0dGhpcy5hcHBlbmRTdGF0dXNiYXJFbnRyaWVzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXBwZW5kU3RhdHVzYmFyRW50cnkodmlld01vZGVsRW50cnkpO1xuXHRcdH1cblxuXHRcdGxldCBsYXN0RW50cnkgPSBlbnRyeTtcblx0XHRjb25zdCBhY2Nlc3NvcjogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IgPSB7XG5cdFx0XHR1cGRhdGU6IGVudHJ5ID0+IHtcblx0XHRcdFx0bGFzdEVudHJ5ID0gZW50cnk7XG5cdFx0XHRcdGNvbnN0IGhhZEJhY2tncm91bmRDb2xvciA9IGl0ZW1Db250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtYmFja2dyb3VuZC1jb2xvcicpO1xuXHRcdFx0XHRpdGVtLnVwZGF0ZSh0aGlzLndpdGhFbnRyeU92ZXJyaWRlKGVudHJ5LCBpZCkpO1xuXHRcdFx0XHRpZiAoaGFkQmFja2dyb3VuZENvbG9yICE9PSBpdGVtQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGFzLWJhY2tncm91bmQtY29sb3InKSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlVmlzaWJsZUJhY2tncm91bmRDb2xvck5laWdoYm9ycygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG5lZWRzRnVsbFJlZnJlc2ggfSA9IHRoaXMuZG9BZGRPclJlbW92ZU1vZGVsRW50cnkodmlld01vZGVsRW50cnksIGZhbHNlKTtcblx0XHRcdFx0aWYgKG5lZWRzRnVsbFJlZnJlc2gpIHtcblx0XHRcdFx0XHR0aGlzLmFwcGVuZFN0YXR1c2JhckVudHJpZXMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpdGVtQ29udGFpbmVyLnJlbW92ZSgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ29tcGFjdEVudHJpZXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFJlYWN0IHRvIG92ZXJyaWRlc1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkT3ZlcnJpZGVFbnRyeS5ldmVudChvdmVycmlkZUVudHJ5SWQgPT4ge1xuXHRcdFx0aWYgKG92ZXJyaWRlRW50cnlJZCA9PT0gaWQpIHtcblx0XHRcdFx0YWNjZXNzb3IudXBkYXRlKGxhc3RFbnRyeSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGFjY2Vzc29yO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZVN0YXR1c0l0ZW0oaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIC4uLmV4dHJhQ2xhc3Nlczogc3RyaW5nW10pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgaXRlbUNvbnRhaW5lciA9ICQoJy5zdGF0dXNiYXItaXRlbScsIHsgaWQgfSk7XG5cblx0XHRpZiAoZXh0cmFDbGFzc2VzKSB7XG5cdFx0XHRpdGVtQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4uZXh0cmFDbGFzc2VzKTtcblx0XHR9XG5cblx0XHRpZiAoYWxpZ25tZW50ID09PSBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQpIHtcblx0XHRcdGl0ZW1Db250YWluZXIuY2xhc3NMaXN0LmFkZCgncmlnaHQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsZWZ0Jyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGl0ZW1Db250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkT3JSZW1vdmVNb2RlbEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyVmlld01vZGVsRW50cnksIGFkZDogYm9vbGVhbikge1xuXG5cdFx0Ly8gVXBkYXRlIG1vZGVsIGJ1dCByZW1lbWJlciBwcmV2aW91cyBlbnRyaWVzXG5cdFx0Y29uc3QgZW50cmllc0JlZm9yZSA9IHRoaXMudmlld01vZGVsLmVudHJpZXM7XG5cdFx0aWYgKGFkZCkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwuYWRkKGVudHJ5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwucmVtb3ZlKGVudHJ5KTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cmllc0FmdGVyID0gdGhpcy52aWV3TW9kZWwuZW50cmllcztcblxuXHRcdC8vIEFwcGx5IG9wZXJhdGlvbiBvbnRvIHRoZSBlbnRyaWVzIGZyb20gYmVmb3JlXG5cdFx0aWYgKGFkZCkge1xuXHRcdFx0ZW50cmllc0JlZm9yZS5zcGxpY2UoZW50cmllc0FmdGVyLmluZGV4T2YoZW50cnkpLCAwLCBlbnRyeSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVudHJpZXNCZWZvcmUuc3BsaWNlKGVudHJpZXNCZWZvcmUuaW5kZXhPZihlbnRyeSksIDEpO1xuXHRcdH1cblxuXHRcdC8vIEZpZ3VyZSBvdXQgaWYgYSBmdWxsIHJlZnJlc2ggaXMgbmVlZGVkIGJ5IGNvbXBhcmluZyBhcnJheXNcblx0XHRjb25zdCBuZWVkc0Z1bGxSZWZyZXNoID0gIWVxdWFscyhlbnRyaWVzQmVmb3JlLCBlbnRyaWVzQWZ0ZXIpO1xuXG5cdFx0cmV0dXJuIHsgbmVlZHNGdWxsUmVmcmVzaCB9O1xuXHR9XG5cblx0aXNFbnRyeVZpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy52aWV3TW9kZWwuaXNIaWRkZW4oaWQpO1xuXHR9XG5cblx0dXBkYXRlRW50cnlWaXNpYmlsaXR5KGlkOiBzdHJpbmcsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwuc2hvdyhpZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlld01vZGVsLmhpZGUoaWQpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzTmV4dEVudHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsLmZvY3VzTmV4dEVudHJ5KCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzRW50cnkoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWwuZm9jdXNQcmV2aW91c0VudHJ5KCk7XG5cdH1cblxuXHRpc0VudHJ5Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWwuaXNFbnRyeUZvY3VzZWQoKTtcblx0fVxuXG5cdGZvY3VzKHByZXNlcnZlRW50cnlGb2N1cyA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLmdldENvbnRhaW5lcigpPy5mb2N1cygpO1xuXHRcdGNvbnN0IGxhc3RGb2N1c2VkRW50cnkgPSB0aGlzLnZpZXdNb2RlbC5sYXN0Rm9jdXNlZEVudHJ5O1xuXHRcdGlmIChwcmVzZXJ2ZUVudHJ5Rm9jdXMgJiYgbGFzdEZvY3VzZWRFbnRyeSkge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiBsYXN0Rm9jdXNlZEVudHJ5LmxhYmVsQ29udGFpbmVyLmZvY3VzKCksIDApOyAvLyBOZWVkIGEgdGltZW91dCwgZm9yIHNvbWUgcmVhc29uIHdpdGhvdXQgaXQgdGhlIGlubmVyIGxhYmVsIGNvbnRhaW5lciB3aWxsIG5vdCBnZXQgZm9jdXNlZFxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVDb250ZW50QXJlYShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHRoaXMuZWxlbWVudCA9IHBhcmVudDtcblxuXHRcdC8vIFRyYWNrIGZvY3VzIHdpdGhpbiBjb250YWluZXJcblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdFN0YXR1c0JhckZvY3VzZWQuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHQvLyBMZWZ0IGl0ZW1zIGNvbnRhaW5lclxuXHRcdHRoaXMubGVmdEl0ZW1zQ29udGFpbmVyID0gJCgnLmxlZnQtaXRlbXMuaXRlbXMtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMubGVmdEl0ZW1zQ29udGFpbmVyKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXG5cdFx0Ly8gUmlnaHQgaXRlbXMgY29udGFpbmVyXG5cdFx0dGhpcy5yaWdodEl0ZW1zQ29udGFpbmVyID0gJCgnLnJpZ2h0LWl0ZW1zLml0ZW1zLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnJpZ2h0SXRlbXNDb250YWluZXIpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51IHN1cHBvcnRcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFyZW50LCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHRoaXMuc2hvd0NvbnRleHRNZW51KGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQocGFyZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgVG91Y2hFdmVudFR5cGUuQ29udGV4dG1lbnUsIGUgPT4gdGhpcy5zaG93Q29udGV4dE1lbnUoZSkpKTtcblxuXHRcdC8vIEluaXRpYWwgc3RhdHVzIGJhciBlbnRyaWVzXG5cdFx0dGhpcy5jcmVhdGVJbml0aWFsU3RhdHVzYmFyRW50cmllcygpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSW5pdGlhbFN0YXR1c2JhckVudHJpZXMoKTogdm9pZCB7XG5cblx0XHQvLyBBZGQgaXRlbXMgaW4gb3JkZXIgYWNjb3JkaW5nIHRvIGFsaWdubWVudFxuXHRcdHRoaXMuYXBwZW5kU3RhdHVzYmFyRW50cmllcygpO1xuXG5cdFx0Ly8gRmlsbCBpbiBwZW5kaW5nIGVudHJpZXMgaWYgYW55XG5cdFx0d2hpbGUgKHRoaXMucGVuZGluZ0VudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5wZW5kaW5nRW50cmllcy5zaGlmdCgpO1xuXHRcdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdFx0cGVuZGluZy5hY2Nlc3NvciA9IHRoaXMuYWRkRW50cnkocGVuZGluZy5lbnRyeSwgcGVuZGluZy5pZCwgcGVuZGluZy5hbGlnbm1lbnQsIHBlbmRpbmcucHJpb3JpdHkucHJpbWFyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRTdGF0dXNiYXJFbnRyaWVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxlZnRJdGVtc0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMubGVmdEl0ZW1zQ29udGFpbmVyKTtcblx0XHRjb25zdCByaWdodEl0ZW1zQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5yaWdodEl0ZW1zQ29udGFpbmVyKTtcblxuXHRcdC8vIENsZWFyIGNvbnRhaW5lcnNcblx0XHRjbGVhck5vZGUobGVmdEl0ZW1zQ29udGFpbmVyKTtcblx0XHRjbGVhck5vZGUocmlnaHRJdGVtc0NvbnRhaW5lcik7XG5cblx0XHQvLyBBcHBlbmQgYWxsXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBbXG5cdFx0XHQuLi50aGlzLnZpZXdNb2RlbC5nZXRFbnRyaWVzKFN0YXR1c2JhckFsaWdubWVudC5MRUZUKSxcblx0XHRcdC4uLnRoaXMudmlld01vZGVsLmdldEVudHJpZXMoU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUKS5yZXZlcnNlKCkgLy8gcmV2ZXJzaW5nIGR1ZSB0byBmbGV4OiByb3ctcmV2ZXJzZVxuXHRcdF0pIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGVudHJ5LmFsaWdubWVudCA9PT0gU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQgPyBsZWZ0SXRlbXNDb250YWluZXIgOiByaWdodEl0ZW1zQ29udGFpbmVyO1xuXG5cdFx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQoZW50cnkuY29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29tcGFjdCBlbnRyaWVzXG5cdFx0dGhpcy51cGRhdGVDb21wYWN0RW50cmllcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRTdGF0dXNiYXJFbnRyeShlbnRyeTogSVN0YXR1c2JhclZpZXdNb2RlbEVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMudmlld01vZGVsLmdldEVudHJpZXMoZW50cnkuYWxpZ25tZW50KTtcblxuXHRcdGlmIChlbnRyeS5hbGlnbm1lbnQgPT09IFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCkge1xuXHRcdFx0ZW50cmllcy5yZXZlcnNlKCk7IC8vIHJldmVyc2luZyBkdWUgdG8gZmxleDogcm93LXJldmVyc2Vcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChlbnRyeS5hbGlnbm1lbnQgPT09IFN0YXR1c2JhckFsaWdubWVudC5MRUZUID8gdGhpcy5sZWZ0SXRlbXNDb250YWluZXIgOiB0aGlzLnJpZ2h0SXRlbXNDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSBlbnRyaWVzLmluZGV4T2YoZW50cnkpO1xuXHRcdGlmIChpbmRleCArIDEgPT09IGVudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQoZW50cnkuY29udGFpbmVyKTsgLy8gYXBwZW5kIGF0IHRoZSBlbmQgaWYgbGFzdFxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXQuaW5zZXJ0QmVmb3JlKGVudHJ5LmNvbnRhaW5lciwgZW50cmllc1tpbmRleCArIDFdLmNvbnRhaW5lcik7IC8vIGluc2VydCBiZWZvcmUgbmV4dCBlbGVtZW50IG90aGVyd2lzZVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb21wYWN0IGVudHJpZXNcblx0XHR0aGlzLnVwZGF0ZUNvbXBhY3RFbnRyaWVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXBhY3RFbnRyaWVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLnZpZXdNb2RlbC5lbnRyaWVzO1xuXG5cdFx0Ly8gRmluZCB2aXNpYmxlIGVudHJpZXMgYW5kIGNsZWFyIGNvbXBhY3QgcmVsYXRlZCBDU1MgY2xhc3NlcyBpZiBhbnlcblx0XHRjb25zdCBtYXBJZFRvVmlzaWJsZUVudHJ5ID0gbmV3IE1hcDxzdHJpbmcsIElTdGF0dXNiYXJWaWV3TW9kZWxFbnRyeT4oKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGlmICghdGhpcy52aWV3TW9kZWwuaXNIaWRkZW4oZW50cnkuaWQpKSB7XG5cdFx0XHRcdG1hcElkVG9WaXNpYmxlRW50cnkuc2V0KGVudHJ5LmlkLCBlbnRyeSk7XG5cdFx0XHR9XG5cblx0XHRcdGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjb21wYWN0LWxlZnQnLCAnY29tcGFjdC1yaWdodCcpO1xuXHRcdH1cblxuXHRcdC8vIEZpZ3VyZSBvdXQgZ3JvdXBzIG9mIGVudHJpZXMgd2l0aCBgY29tcGFjdGAgYWxpZ25tZW50XG5cdFx0Y29uc3QgY29tcGFjdEVudHJ5R3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIElTdGF0dXNiYXJWaWV3TW9kZWxFbnRyeT4+KCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBtYXBJZFRvVmlzaWJsZUVudHJ5LnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGlzU3RhdHVzYmFyRW50cnlMb2NhdGlvbihlbnRyeS5wcmlvcml0eS5wcmltYXJ5KSAmJiAvLyBlbnRyeSByZWZlcmVuY2VzIGFub3RoZXIgZW50cnkgYXMgbG9jYXRpb25cblx0XHRcdFx0ZW50cnkucHJpb3JpdHkucHJpbWFyeS5jb21wYWN0XHRcdFx0XHRcdFx0Ly8gZW50cnkgd2FudHMgdG8gYmUgY29tcGFjdFxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnN0IGxvY2F0aW9uSWQgPSBlbnRyeS5wcmlvcml0eS5wcmltYXJ5LmxvY2F0aW9uLmlkO1xuXHRcdFx0XHRjb25zdCBsb2NhdGlvbiA9IG1hcElkVG9WaXNpYmxlRW50cnkuZ2V0KGxvY2F0aW9uSWQpO1xuXHRcdFx0XHRpZiAoIWxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgaWYgbG9jYXRpb24gZG9lcyBub3QgZXhpc3Rcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEJ1aWxkIGEgbWFwIG9mIGVudHJpZXMgdGhhdCBhcmUgY29tcGFjdCBhbW9uZyBlYWNoIG90aGVyXG5cdFx0XHRcdGxldCBjb21wYWN0RW50cnlHcm91cCA9IGNvbXBhY3RFbnRyeUdyb3Vwcy5nZXQobG9jYXRpb25JZCk7XG5cdFx0XHRcdGlmICghY29tcGFjdEVudHJ5R3JvdXApIHtcblxuXHRcdFx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgdGhpcyBlbnRyeSByZWZlcmVuY2VzIGFub3RoZXIgZW50cnlcblx0XHRcdFx0XHQvLyB0aGF0IGl0c2VsZiByZWZlcmVuY2VzIGFuIGVudHJ5LiBJbiB0aGF0IGNhc2UsIHdlIHdhbnRcblx0XHRcdFx0XHQvLyB0byBhZGQgaXQgdG8gdGhlIGVudHJpZXMgb2YgdGhlIHJlZmVyZW5jZWQgZW50cnkuXG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGNvbXBhY3RFbnRyeUdyb3Vwcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0aWYgKGdyb3VwLmhhcyhsb2NhdGlvbklkKSkge1xuXHRcdFx0XHRcdFx0XHRjb21wYWN0RW50cnlHcm91cCA9IGdyb3VwO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIWNvbXBhY3RFbnRyeUdyb3VwKSB7XG5cdFx0XHRcdFx0XHRjb21wYWN0RW50cnlHcm91cCA9IG5ldyBNYXA8c3RyaW5nLCBJU3RhdHVzYmFyVmlld01vZGVsRW50cnk+KCk7XG5cdFx0XHRcdFx0XHRjb21wYWN0RW50cnlHcm91cHMuc2V0KGxvY2F0aW9uSWQsIGNvbXBhY3RFbnRyeUdyb3VwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tcGFjdEVudHJ5R3JvdXAuc2V0KGVudHJ5LmlkLCBlbnRyeSk7XG5cdFx0XHRcdGNvbXBhY3RFbnRyeUdyb3VwLnNldChsb2NhdGlvbi5pZCwgbG9jYXRpb24pO1xuXG5cdFx0XHRcdC8vIEFkanVzdCBDU1MgY2xhc3NlcyB0byBtb3ZlIGNvbXBhY3QgaXRlbXMgY2xvc2VyIHRvZ2V0aGVyXG5cdFx0XHRcdGlmIChlbnRyeS5wcmlvcml0eS5wcmltYXJ5LmFsaWdubWVudCA9PT0gU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQpIHtcblx0XHRcdFx0XHRsb2NhdGlvbi5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY29tcGFjdC1sZWZ0Jyk7XG5cdFx0XHRcdFx0ZW50cnkuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbXBhY3QtcmlnaHQnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsb2NhdGlvbi5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY29tcGFjdC1yaWdodCcpO1xuXHRcdFx0XHRcdGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjb21wYWN0LWxlZnQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEluc3RhbGwgbW91c2UgbGlzdGVuZXJzIHRvIHVwZGF0ZSBob3ZlciBmZWVkYmFjayBmb3Jcblx0XHQvLyBhbGwgY29tcGFjdCBlbnRyaWVzIHRoYXQgYmVsb25nIHRvIGVhY2ggb3RoZXJcblx0XHRjb25zdCBzdGF0dXNCYXJJdGVtSG92ZXJCYWNrZ3JvdW5kID0gdGhpcy5nZXRDb2xvcihTVEFUVVNfQkFSX0lURU1fSE9WRVJfQkFDS0dST1VORCk7XG5cdFx0Y29uc3Qgc3RhdHVzQmFySXRlbUNvbXBhY3RIb3ZlckJhY2tncm91bmQgPSB0aGlzLmdldENvbG9yKFNUQVRVU19CQVJfSVRFTV9DT01QQUNUX0hPVkVSX0JBQ0tHUk9VTkQpO1xuXHRcdHRoaXMuY29tcGFjdEVudHJpZXNEaXNwb3NhYmxlLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGlmIChzdGF0dXNCYXJJdGVtSG92ZXJCYWNrZ3JvdW5kICYmIHN0YXR1c0Jhckl0ZW1Db21wYWN0SG92ZXJCYWNrZ3JvdW5kICYmICFpc0hpZ2hDb250cmFzdCh0aGlzLnRoZW1lLnR5cGUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFssIGNvbXBhY3RFbnRyeUdyb3VwXSBvZiBjb21wYWN0RW50cnlHcm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjb21wYWN0RW50cnkgb2YgY29tcGFjdEVudHJ5R3JvdXAudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpZiAoIWNvbXBhY3RFbnRyeS5oYXNDb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gb25seSBzaG93IGhvdmVyIGZlZWRiYWNrIHdoZW4gd2UgaGF2ZSBhIGNvbW1hbmRcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmNvbXBhY3RFbnRyaWVzRGlzcG9zYWJsZS52YWx1ZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbXBhY3RFbnRyeS5sYWJlbENvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX09WRVIsICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbXBhY3RFbnRyeUdyb3VwLmZvckVhY2goY29tcGFjdEVudHJ5ID0+IGNvbXBhY3RFbnRyeS5sYWJlbENvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBzdGF0dXNCYXJJdGVtSG92ZXJCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGNvbXBhY3RFbnRyeS5sYWJlbENvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBzdGF0dXNCYXJJdGVtQ29tcGFjdEhvdmVyQmFja2dyb3VuZDtcblx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHR0aGlzLmNvbXBhY3RFbnRyaWVzRGlzcG9zYWJsZS52YWx1ZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbXBhY3RFbnRyeS5sYWJlbENvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX09VVCwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29tcGFjdEVudHJ5R3JvdXAuZm9yRWFjaChjb21wYWN0RW50cnkgPT4gY29tcGFjdEVudHJ5LmxhYmVsQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcnKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVZpc2libGVCYWNrZ3JvdW5kQ29sb3JOZWlnaGJvcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmlzaWJsZUJhY2tncm91bmRDb2xvck5laWdoYm9ycygpOiB2b2lkIHtcblx0XHR0aGlzLmRvVXBkYXRlVmlzaWJsZUJhY2tncm91bmRDb2xvck5laWdoYm9ycyh0aGlzLnZpZXdNb2RlbC5nZXRFbnRyaWVzKFN0YXR1c2JhckFsaWdubWVudC5MRUZUKSwgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQpO1xuXHRcdHRoaXMuZG9VcGRhdGVWaXNpYmxlQmFja2dyb3VuZENvbG9yTmVpZ2hib3JzKHRoaXMudmlld01vZGVsLmdldEVudHJpZXMoU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUKS5yZXZlcnNlKCksIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCk7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlVmlzaWJsZUJhY2tncm91bmRDb2xvck5laWdoYm9ycyhlbnRyaWVzOiBJU3RhdHVzYmFyVmlld01vZGVsRW50cnlbXSwgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQpOiB2b2lkIHtcblx0XHRsZXQgcHJldmlvdXNWaXNpYmxlRW50cnk6IElTdGF0dXNiYXJWaWV3TW9kZWxFbnRyeSB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0ZW50cnkuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUtYmFja2dyb3VuZC1jb2xvci1uZWlnaGJvcicpO1xuXG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWwuaXNIaWRkZW4oZW50cnkuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0NvbXBhY3ROZWlnaGJvciA9IGFsaWdubWVudCA9PT0gU3RhdHVzYmFyQWxpZ25tZW50LkxFRlRcblx0XHRcdFx0PyBwcmV2aW91c1Zpc2libGVFbnRyeT8uY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnY29tcGFjdC1yaWdodCcpICYmIGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QtbGVmdCcpXG5cdFx0XHRcdDogcHJldmlvdXNWaXNpYmxlRW50cnk/LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QtbGVmdCcpICYmIGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbXBhY3QtcmlnaHQnKTtcblx0XHRcdGlmIChcblx0XHRcdFx0cHJldmlvdXNWaXNpYmxlRW50cnk/LmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hhcy1iYWNrZ3JvdW5kLWNvbG9yJykgJiZcblx0XHRcdFx0ZW50cnkuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnaGFzLWJhY2tncm91bmQtY29sb3InKSAmJlxuXHRcdFx0XHQhaXNDb21wYWN0TmVpZ2hib3Jcblx0XHRcdCkge1xuXHRcdFx0XHRlbnRyeS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgndmlzaWJsZS1iYWNrZ3JvdW5kLWNvbG9yLW5laWdoYm9yJyk7XG5cdFx0XHR9XG5cblx0XHRcdHByZXZpb3VzVmlzaWJsZUVudHJ5ID0gZW50cnk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q29udGV4dE1lbnUoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCk6IHZvaWQge1xuXHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuZWxlbWVudCksIGUpO1xuXG5cdFx0bGV0IGFjdGlvbnM6IElBY3Rpb25bXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0YWN0aW9ucyA9IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGV2ZW50KTtcblxuXHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbnMpIHtcblx0XHRcdFx0XHRkaXNwb3NlSWZEaXNwb3NhYmxlKGFjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRleHRNZW51QWN0aW9ucyhldmVudDogU3RhbmRhcmRNb3VzZUV2ZW50KTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIFByb3ZpZGUgYW4gYWN0aW9uIHRvIGhpZGUgdGhlIHN0YXR1cyBiYXIgYXQgbGFzdFxuXHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uLklELCBsYWJlbDogbG9jYWxpemUoJ2hpZGVTdGF0dXNCYXInLCBcIkhpZGUgU3RhdHVzIEJhclwiKSwgcnVuOiAoKSA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IG5ldyBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uKCkucnVuKGFjY2Vzc29yKSkgfSkpO1xuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXG5cdFx0Ly8gU2hvdyBhbiBlbnRyeSBwZXIga25vd24gc3RhdHVzIGVudHJ5XG5cdFx0Ly8gTm90ZTogZXZlbiB0aG91Z2ggZW50cmllcyBoYXZlIGFuIGlkZW50aWZpZXIsIHRoZXJlIGNhbiBiZSBtdWx0aXBsZSBlbnRyaWVzXG5cdFx0Ly8gaGF2aW5nIHRoZSBzYW1lIGlkZW50aWZpZXIgKGUuZy4gZnJvbSBleHRlbnNpb25zKS4gU28gd2UgbWFrZSBzdXJlIHRvIG9ubHlcblx0XHQvLyBzaG93IGEgc2luZ2xlIGVudHJ5IHBlciBpZGVudGlmaWVyIHdlIGhhbmRsZWQuXG5cdFx0Y29uc3QgaGFuZGxlZEVudHJpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMudmlld01vZGVsLmVudHJpZXMpIHtcblx0XHRcdGlmICghaGFuZGxlZEVudHJpZXMuaGFzKGVudHJ5LmlkKSkge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFRvZ2dsZVN0YXR1c2JhckVudHJ5VmlzaWJpbGl0eUFjdGlvbihlbnRyeS5pZCwgZW50cnkubmFtZSwgdGhpcy52aWV3TW9kZWwpKTtcblx0XHRcdFx0aGFuZGxlZEVudHJpZXMuYWRkKGVudHJ5LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaWd1cmUgb3V0IGlmIG1vdXNlIGlzIG92ZXIgYW4gZW50cnlcblx0XHRsZXQgc3RhdHVzRW50cnlVbmRlck1vdXNlOiBJU3RhdHVzYmFyVmlld01vZGVsRW50cnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gZXZlbnQudGFyZ2V0OyBlbGVtZW50OyBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMudmlld01vZGVsLmZpbmRFbnRyeShlbGVtZW50KTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRzdGF0dXNFbnRyeVVuZGVyTW91c2UgPSBlbnRyeTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXR1c0VudHJ5VW5kZXJNb3VzZSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRpZiAoc3RhdHVzRW50cnlVbmRlck1vdXNlLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hbmFnZUV4dGVuc2lvbkFjdGlvbiwgc3RhdHVzRW50cnlVbmRlck1vdXNlLmV4dGVuc2lvbklkKSk7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IEhpZGVTdGF0dXNiYXJFbnRyeUFjdGlvbihzdGF0dXNFbnRyeVVuZGVyTW91c2UuaWQsIHN0YXR1c0VudHJ5VW5kZXJNb3VzZS5uYW1lLCB0aGlzLnZpZXdNb2RlbCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5nZXRDb250YWluZXIoKSk7XG5cdFx0Y29uc3Qgc3R5bGVPdmVycmlkZTogSVN0YXR1c2JhclN0eWxlT3ZlcnJpZGUgfCB1bmRlZmluZWQgPSBbLi4udGhpcy5zdHlsZU92ZXJyaWRlc10uc29ydCgoYSwgYikgPT4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHkpWzBdO1xuXG5cdFx0Ly8gQmFja2dyb3VuZCAvIGZvcmVncm91bmQgY29sb3JzXG5cdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihzdHlsZU92ZXJyaWRlPy5iYWNrZ3JvdW5kID8/ICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gU1RBVFVTX0JBUl9CQUNLR1JPVU5EIDogU1RBVFVTX0JBUl9OT19GT0xERVJfQkFDS0dST1VORCkpIHx8ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiYWNrZ3JvdW5kQ29sb3I7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmJveFNoYWRvdyA9IHRoaXMuZ2V0SWQoKSA9PT0gUGFydHMuU1RBVFVTQkFSX1BBUlQgJiYgdGhpcy5sYXlvdXRTZXJ2aWNlLmlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCkgJiYgIWlzSGlnaENvbnRyYXN0KHRoaXMudGhlbWUudHlwZSkgJiYgYmFja2dyb3VuZENvbG9yXG5cdFx0XHQ/IGAwIDFweCAwICR7YmFja2dyb3VuZENvbG9yfWBcblx0XHRcdDogJyc7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihzdHlsZU92ZXJyaWRlPy5mb3JlZ3JvdW5kID8/ICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gU1RBVFVTX0JBUl9GT1JFR1JPVU5EIDogU1RBVFVTX0JBUl9OT19GT0xERVJfRk9SRUdST1VORCkpIHx8ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5jb2xvciA9IGZvcmVncm91bmRDb2xvcjtcblx0XHRjb25zdCBpdGVtQm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKFNUQVRVU19CQVJfSVRFTV9GT0NVU19CT1JERVIpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbXBhY3QgZW50cmllcyB0byByZWZyZXNoIGhvdmVyIGNvbG9ycyBiYXNlZCBvbiBjdXJyZW50IHRoZW1lXG5cdFx0dGhpcy51cGRhdGVDb21wYWN0RW50cmllcygpO1xuXG5cdFx0Ly8gQm9yZGVyIGNvbG9yXG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKHN0eWxlT3ZlcnJpZGU/LmJvcmRlciA/PyAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/IFNUQVRVU19CQVJfQk9SREVSIDogU1RBVFVTX0JBUl9OT19GT0xERVJfQk9SREVSKSkgfHwgdGhpcy5nZXRDb2xvcihjb250cmFzdEJvcmRlcik7XG5cdFx0aWYgKGJvcmRlckNvbG9yKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc3RhdHVzLWJvcmRlci10b3AnKTtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1zdGF0dXMtYm9yZGVyLXRvcC1jb2xvcicsIGJvcmRlckNvbG9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3N0YXR1cy1ib3JkZXItdG9wJyk7XG5cdFx0XHRjb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tc3RhdHVzLWJvcmRlci10b3AtY29sb3InKTtcblx0XHR9XG5cblx0XHQvLyBDb2xvcnMgYW5kIGZvY3VzIG91dGxpbmVzIHZpYSBkeW5hbWljIHN0eWxlc2hlZXRcblxuXHRcdGNvbnN0IHN0YXR1c0JhckZvY3VzQ29sb3IgPSB0aGlzLmdldENvbG9yKFNUQVRVU19CQVJfRk9DVVNfQk9SREVSKTtcblxuXHRcdGlmICghdGhpcy5zdHlsZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuc3R5bGVFbGVtZW50ID0gY3JlYXRlU3R5bGVTaGVldChjb250YWluZXIsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gYFxuXG5cdFx0XHRcdC8qIFN0YXR1cyBiYXIgZm9jdXMgb3V0bGluZSAqL1xuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5zdGF0dXNiYXI6Zm9jdXMge1xuXHRcdFx0XHRcdG91dGxpbmUtY29sb3I6ICR7c3RhdHVzQmFyRm9jdXNDb2xvcn07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvKiBTdGF0dXMgYmFyIGl0ZW0gZm9jdXMgb3V0bGluZSAqL1xuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5zdGF0dXNiYXIgPiAuaXRlbXMtY29udGFpbmVyID4gLnN0YXR1c2Jhci1pdGVtIGE6Zm9jdXMtdmlzaWJsZSB7XG5cdFx0XHRcdFx0b3V0bGluZTogMXB4IHNvbGlkICR7dGhpcy5nZXRDb2xvcihhY3RpdmVDb250cmFzdEJvcmRlcikgPz8gaXRlbUJvcmRlckNvbG9yfTtcblx0XHRcdFx0XHRvdXRsaW5lLW9mZnNldDogJHtib3JkZXJDb2xvciA/ICctMnB4JyA6ICctMXB4J307XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvKiBOb3RpZmljYXRpb24gQmVhayAqL1xuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5zdGF0dXNiYXIgPiAuaXRlbXMtY29udGFpbmVyID4gLnN0YXR1c2Jhci1pdGVtLmhhcy1iZWFrID4gLnN0YXR1cy1iYXItaXRlbS1iZWFrLWNvbnRhaW5lcjpiZWZvcmUge1xuXHRcdFx0XHRcdGJvcmRlci1ib3R0b20tY29sb3I6ICR7Ym9yZGVyQ29sb3IgPz8gYmFja2dyb3VuZENvbG9yfTtcblx0XHRcdFx0fVxuXHRcdFx0YDtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dCh3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXHRcdHN1cGVyLmxheW91dENvbnRlbnRzKHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0b3ZlcnJpZGVTdHlsZShzdHlsZTogSVN0YXR1c2JhclN0eWxlT3ZlcnJpZGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5zdHlsZU92ZXJyaWRlcy5hZGQoc3R5bGUpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuc3R5bGVPdmVycmlkZXMuZGVsZXRlKHN0eWxlKTtcblx0XHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogUGFydHMuU1RBVFVTQkFSX1BBUlRcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFpblN0YXR1c2JhclBhcnQgZXh0ZW5kcyBTdGF0dXNiYXJQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihQYXJ0cy5TVEFUVVNCQVJfUEFSVCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29udGV4dFNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQXV4aWxpYXJ5U3RhdHVzYmFyUGFydCBleHRlbmRzIElTdGF0dXNiYXJFbnRyeUNvbnRhaW5lciwgSVZpZXcge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEF1eGlsaWFyeVN0YXR1c2JhclBhcnQgZXh0ZW5kcyBTdGF0dXNiYXJQYXJ0IGltcGxlbWVudHMgSUF1eGlsaWFyeVN0YXR1c2JhclBhcnQge1xuXG5cdHByaXZhdGUgc3RhdGljIENPVU5URVIgPSAxO1xuXG5cdHJlYWRvbmx5IGhlaWdodCA9IFN0YXR1c2JhclBhcnQuSEVJR0hUO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgaWQgPSBBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0LkNPVU5URVIrKztcblx0XHRzdXBlcihgd29ya2JlbmNoLnBhcnRzLmF1eGlsaWFyeVN0YXR1cy4ke2lkfWAsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGF0dXNiYXJTZXJ2aWNlIGV4dGVuZHMgTXVsdGlXaW5kb3dQYXJ0czxTdGF0dXNiYXJQYXJ0PiBpbXBsZW1lbnRzIElTdGF0dXNiYXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBtYWluUGFydDogTWFpblN0YXR1c2JhclBhcnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDcmVhdGVBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QXV4aWxpYXJ5U3RhdHVzYmFyUGFydD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDcmVhdGVBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0ID0gdGhpcy5fb25EaWRDcmVhdGVBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5zdGF0dXNCYXJTZXJ2aWNlJywgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLm1haW5QYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluU3RhdHVzYmFyUGFydCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJQYXJ0KHRoaXMubWFpblBhcnQpKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHkgPSB0aGlzLm1haW5QYXJ0Lm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5O1xuXHR9XG5cblx0Ly8jcmVnaW9uIEF1eGlsaWFyeSBTdGF0dXNiYXIgUGFydHNcblxuXHRjcmVhdGVBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBJQXV4aWxpYXJ5U3RhdHVzYmFyUGFydCB7XG5cblx0XHQvLyBDb250YWluZXJcblx0XHRjb25zdCBzdGF0dXNiYXJQYXJ0Q29udGFpbmVyID0gJCgnZm9vdGVyLnBhcnQuc3RhdHVzYmFyJywge1xuXHRcdFx0J3JvbGUnOiAnc3RhdHVzJyxcblx0XHRcdCdhcmlhLWxpdmUnOiAnb2ZmJyxcblx0XHRcdCd0YWJJbmRleCc6ICcwJ1xuXHRcdH0pO1xuXHRcdHN0YXR1c2JhclBhcnRDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdGF0dXNiYXJQYXJ0Q29udGFpbmVyKTtcblxuXHRcdC8vIFN0YXR1c2JhciBQYXJ0XG5cdFx0Y29uc3Qgc3RhdHVzYmFyUGFydCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1eGlsaWFyeVN0YXR1c2JhclBhcnQsIHN0YXR1c2JhclBhcnRDb250YWluZXIpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLnJlZ2lzdGVyUGFydChzdGF0dXNiYXJQYXJ0KTtcblxuXHRcdHN0YXR1c2JhclBhcnQuY3JlYXRlKHN0YXR1c2JhclBhcnRDb250YWluZXIpO1xuXG5cdFx0RXZlbnQub25jZShzdGF0dXNiYXJQYXJ0Lm9uV2lsbERpc3Bvc2UpKCgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblxuXHRcdC8vIEVtaXQgaW50ZXJuYWwgZXZlbnRcblx0XHR0aGlzLl9vbkRpZENyZWF0ZUF1eGlsaWFyeVN0YXR1c2JhclBhcnQuZmlyZShzdGF0dXNiYXJQYXJ0KTtcblxuXHRcdHJldHVybiBzdGF0dXNiYXJQYXJ0O1xuXHR9XG5cblx0Y3JlYXRlU2NvcGVkKHN0YXR1c2JhckVudHJ5Q29udGFpbmVyOiBJU3RhdHVzYmFyRW50cnlDb250YWluZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBJU3RhdHVzYmFyU2VydmljZSB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNjb3BlZFN0YXR1c2JhclNlcnZpY2UsIHN0YXR1c2JhckVudHJ5Q29udGFpbmVyKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2VydmljZSBJbXBsZW1lbnRhdGlvblxuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5OiBFdmVudDx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW4gfT47XG5cblx0YWRkRW50cnkoZW50cnk6IElTdGF0dXNiYXJFbnRyeSwgaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIHByaW9yaXR5T3JMb2NhdGlvbjogbnVtYmVyIHwgSVN0YXR1c2JhckVudHJ5TG9jYXRpb24gfCBJU3RhdHVzYmFyRW50cnlQcmlvcml0eSA9IDApOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB7XG5cdFx0aWYgKGVudHJ5LnNob3dJbkFsbFdpbmRvd3MpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQWRkRW50cnlUb0FsbFdpbmRvd3MoZW50cnksIGlkLCBhbGlnbm1lbnQsIHByaW9yaXR5T3JMb2NhdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQuYWRkRW50cnkoZW50cnksIGlkLCBhbGlnbm1lbnQsIHByaW9yaXR5T3JMb2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkRW50cnlUb0FsbFdpbmRvd3Mob3JpZ2luYWxFbnRyeTogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nLCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudCwgcHJpb3JpdHlPckxvY2F0aW9uOiBudW1iZXIgfCBJU3RhdHVzYmFyRW50cnlMb2NhdGlvbiB8IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5ID0gMCk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHtcblx0XHRjb25zdCBlbnRyeURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgYWNjZXNzb3JzID0gbmV3IFNldDxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKTtcblxuXHRcdGxldCBlbnRyeSA9IG9yaWdpbmFsRW50cnk7XG5cdFx0ZnVuY3Rpb24gYWRkRW50cnkocGFydDogU3RhdHVzYmFyUGFydCB8IEF1eGlsaWFyeVN0YXR1c2JhclBhcnQpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHBhcnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHBhcnREaXNwb3NhYmxlcy5hZGQocGFydC5vbldpbGxEaXNwb3NlKCgpID0+IHBhcnREaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblxuXHRcdFx0Y29uc3QgYWNjZXNzb3IgPSBwYXJ0RGlzcG9zYWJsZXMuYWRkKHBhcnQuYWRkRW50cnkoZW50cnksIGlkLCBhbGlnbm1lbnQsIHByaW9yaXR5T3JMb2NhdGlvbikpO1xuXHRcdFx0YWNjZXNzb3JzLmFkZChhY2Nlc3Nvcik7XG5cdFx0XHRwYXJ0RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhY2Nlc3NvcnMuZGVsZXRlKGFjY2Vzc29yKSkpO1xuXG5cdFx0XHRlbnRyeURpc3Bvc2FibGVzLmFkZChwYXJ0RGlzcG9zYWJsZXMpO1xuXHRcdFx0cGFydERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZW50cnlEaXNwb3NhYmxlcy5kZWxldGUocGFydERpc3Bvc2FibGVzKSkpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLnBhcnRzKSB7XG5cdFx0XHRhZGRFbnRyeShwYXJ0KTtcblx0XHR9XG5cblx0XHRlbnRyeURpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydChwYXJ0ID0+IGFkZEVudHJ5KHBhcnQpKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXBkYXRlOiAodXBkYXRlZEVudHJ5OiBJU3RhdHVzYmFyRW50cnkpID0+IHtcblx0XHRcdFx0ZW50cnkgPSB1cGRhdGVkRW50cnk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCB1cGRhdGUgb2YgYWNjZXNzb3JzKSB7XG5cdFx0XHRcdFx0dXBkYXRlLnVwZGF0ZSh1cGRhdGVkRW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gZW50cnlEaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHR9O1xuXHR9XG5cblx0aXNFbnRyeVZpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1haW5QYXJ0LmlzRW50cnlWaXNpYmxlKGlkKTtcblx0fVxuXG5cdHVwZGF0ZUVudHJ5VmlzaWJpbGl0eShpZDogc3RyaW5nLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMucGFydHMpIHtcblx0XHRcdHBhcnQudXBkYXRlRW50cnlWaXNpYmlsaXR5KGlkLCB2aXNpYmxlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZUVudHJ5KGlkOiBzdHJpbmcsIG92ZXJyaWRlOiBQYXJ0aWFsPElTdGF0dXNiYXJFbnRyeT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub3ZlcnJpZGVFbnRyeShpZCwgb3ZlcnJpZGUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRmb2N1cyhwcmVzZXJ2ZUVudHJ5Rm9jdXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVQYXJ0LmZvY3VzKHByZXNlcnZlRW50cnlGb2N1cyk7XG5cdH1cblxuXHRmb2N1c05leHRFbnRyeSgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVBhcnQuZm9jdXNOZXh0RW50cnkoKTtcblx0fVxuXG5cdGZvY3VzUHJldmlvdXNFbnRyeSgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVBhcnQuZm9jdXNQcmV2aW91c0VudHJ5KCk7XG5cdH1cblxuXHRpc0VudHJ5Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5hY3RpdmVQYXJ0LmlzRW50cnlGb2N1c2VkKCk7XG5cdH1cblxuXHRvdmVycmlkZVN0eWxlKHN0eWxlOiBJU3RhdHVzYmFyU3R5bGVPdmVycmlkZSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLnBhcnRzKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGFydC5vdmVycmlkZVN0eWxlKHN0eWxlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjbGFzcyBTY29wZWRTdGF0dXNiYXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTdGF0dXNiYXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhckVudHJ5Q29udGFpbmVyOiBJU3RhdHVzYmFyRW50cnlDb250YWluZXIsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHkgPSB0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5O1xuXHR9XG5cblx0Y3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogSUF1eGlsaWFyeVN0YXR1c2JhclBhcnQge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhclNlcnZpY2UuY3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydChjb250YWluZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdGNyZWF0ZVNjb3BlZChzdGF0dXNiYXJFbnRyeUNvbnRhaW5lcjogSVN0YXR1c2JhckVudHJ5Q29udGFpbmVyLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSVN0YXR1c2JhclNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhclNlcnZpY2UuY3JlYXRlU2NvcGVkKHN0YXR1c2JhckVudHJ5Q29udGFpbmVyLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRnZXRQYXJ0KCk6IElTdGF0dXNiYXJFbnRyeUNvbnRhaW5lciB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdHVzYmFyRW50cnlDb250YWluZXI7XG5cdH1cblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUVudHJ5VmlzaWJpbGl0eTogRXZlbnQ8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+O1xuXG5cdGFkZEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb246IG51bWJlciB8IElTdGF0dXNiYXJFbnRyeUxvY2F0aW9uIHwgSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkgPSAwKTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3Ige1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLmFkZEVudHJ5KGVudHJ5LCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb24pO1xuXHR9XG5cblx0aXNFbnRyeVZpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLmlzRW50cnlWaXNpYmxlKGlkKTtcblx0fVxuXG5cdHVwZGF0ZUVudHJ5VmlzaWJpbGl0eShpZDogc3RyaW5nLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci51cGRhdGVFbnRyeVZpc2liaWxpdHkoaWQsIHZpc2libGUpO1xuXHR9XG5cblx0b3ZlcnJpZGVFbnRyeShpZDogc3RyaW5nLCBvdmVycmlkZTogUGFydGlhbDxJU3RhdHVzYmFyRW50cnk+KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLm92ZXJyaWRlRW50cnkoaWQsIG92ZXJyaWRlKTtcblx0fVxuXG5cdGZvY3VzKHByZXNlcnZlRW50cnlGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLmZvY3VzKHByZXNlcnZlRW50cnlGb2N1cyk7XG5cdH1cblxuXHRmb2N1c05leHRFbnRyeSgpOiB2b2lkIHtcblx0XHR0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLmZvY3VzTmV4dEVudHJ5KCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzRW50cnkoKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5mb2N1c1ByZXZpb3VzRW50cnkoKTtcblx0fVxuXG5cdGlzRW50cnlGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyLmlzRW50cnlGb2N1c2VkKCk7XG5cdH1cblxuXHRvdmVycmlkZVN0eWxlKHN0eWxlOiBJU3RhdHVzYmFyU3R5bGVPdmVycmlkZSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5vdmVycmlkZVN0eWxlKHN0eWxlKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLGlCQUFpQixxQkFBa0MsbUJBQW1CLG9CQUFvQjtBQUMvRyxTQUFTLGtCQUFrQixZQUFZO0FBQ3ZDLFNBQVMsYUFBYSxnQkFBZ0IsZUFBNkI7QUFDbkUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0IsbUJBQXNGLDBCQUFtRCxnQ0FBeUQ7QUFDL04sU0FBUywyQkFBMkI7QUFDcEMsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUIsdUJBQXVCLGlDQUFpQyxrQ0FBa0MsbUJBQW1CLGlDQUFpQyw2QkFBNkIsMENBQTBDLDhCQUE4QiwrQkFBK0I7QUFDbFQsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsZ0JBQWdCLDRCQUE0QjtBQUNyRCxTQUFTLGFBQWEsdUJBQXVCLFdBQVcsV0FBVyxXQUFXLGVBQWUsU0FBUztBQUN0RyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLE9BQU8seUJBQXlCLHNCQUFzQjtBQUMvRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQix1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QUNuQyxXQUFPLEtBQUssd0JBQXdCLGVBQWUsRUFBRTtBQUFBLEVBQ3REO0FBQUEsRUFFQSxzQkFBc0IsSUFBWSxTQUF3QjtBQUN6RCxTQUFLLHdCQUF3QixzQkFBc0IsSUFBSSxPQUFPO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLGNBQWMsSUFBWSxVQUFpRDtBQUMxRSxXQUFPLEtBQUssd0JBQXdCLGNBQWMsSUFBSSxRQUFRO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLE1BQU0sb0JBQW9DO0FBQ3pDLFNBQUssd0JBQXdCLE1BQU0sa0JBQWtCO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLGlCQUF1QjtBQUN0QixTQUFLLHdCQUF3QixlQUFlO0FBQUEsRUFDN0M7QUFBQSxFQUVBLHFCQUEyQjtBQUMxQixTQUFLLHdCQUF3QixtQkFBbUI7QUFBQSxFQUNqRDtBQUFBLEVBRUEsaUJBQTBCO0FBQ3pCLFdBQU8sS0FBSyx3QkFBd0IsZUFBZTtBQUFBLEVBQ3BEO0FBQUEsRUFFQSxjQUFjLE9BQTZDO0FBQzFELFdBQU8sS0FBSyx3QkFBd0IsY0FBYyxLQUFLO0FBQUEsRUFDeEQ7QUFDRDtBQTlEYSx5QkFBTjtBQUFBLEVBTUo7QUFBQSxHQU5VO0FBZ0ViLGtCQUFrQixtQkFBbUIsa0JBQWtCLGtCQUFrQixLQUFLOyIsCiAgIm5hbWVzIjogWyJlbnRyeSIsICJuZWVkc0Z1bGxSZWZyZXNoIiwgImNvbXBhY3RFbnRyeSJdCn0K
