import * as DOM from "../../dom.js";
import { ActionBar, ActionsOrientation } from "../actionbar/actionbar.js";
import { DropdownMenuActionViewItem } from "../dropdown/dropdownActionViewItem.js";
import { Action, Separator, SubmenuAction } from "../../../common/actions.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { EventMultiplexer } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import "./toolbar.css";
import * as nls from "../../../../nls.js";
import { createInstantHoverDelegate } from "../hover/hoverDelegateFactory.js";
const ACTION_MIN_WIDTH = 20;
const ACTION_PADDING = 4;
const ACTION_MIN_WIDTH_VAR = "--vscode-toolbar-action-min-width";
class ToolBar extends Disposable {
  constructor(container, contextMenuProvider, options = { orientation: ActionsOrientation.HORIZONTAL }) {
    super();
    this.container = container;
    this.submenuActionViewItems = [];
    this.hasSecondaryActions = false;
    this._onDidChangeDropdownVisibility = this._register(new EventMultiplexer());
    this.originalPrimaryActions = [];
    this.originalSecondaryActions = [];
    this.hiddenActions = [];
    this.disposables = this._register(new DisposableStore());
    options.hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());
    this.options = options;
    this.toggleMenuAction = this._register(new ToggleMenuAction(() => this.toggleMenuActionViewItem?.show(), options.toggleMenuTitle));
    this.element = document.createElement("div");
    this.element.className = "monaco-toolbar";
    container.appendChild(this.element);
    this.actionBar = this._register(new ActionBar(this.element, {
      orientation: options.orientation,
      ariaLabel: options.ariaLabel,
      actionRunner: options.actionRunner,
      allowContextMenu: options.allowContextMenu,
      highlightToggledItems: options.highlightToggledItems,
      hoverDelegate: options.hoverDelegate,
      actionViewItemProvider: (action, viewItemOptions) => {
        if (action.id === ToggleMenuAction.ID) {
          this.toggleMenuActionViewItem = new DropdownMenuActionViewItem(
            action,
            { getActions: () => this.toggleMenuAction.menuActions },
            contextMenuProvider,
            {
              actionViewItemProvider: this.options.actionViewItemProvider,
              actionRunner: this.actionRunner,
              keybindingProvider: this.options.getKeyBinding,
              classNames: ThemeIcon.asClassNameArray(options.moreIcon ?? Codicon.toolBarMore),
              menuClassName: this.options.dropdownMenuClassName,
              closeAnimation: this.options.dropdownMenuCloseAnimation,
              anchorAlignmentProvider: this.options.anchorAlignmentProvider,
              menuAsChild: !!this.options.renderDropdownAsChildElement,
              skipTelemetry: this.options.skipTelemetry,
              isMenu: true,
              hoverDelegate: this.options.hoverDelegate
            }
          );
          this.toggleMenuActionViewItem.setActionContext(this.actionBar.context);
          this.disposables.add(this._onDidChangeDropdownVisibility.add(this.toggleMenuActionViewItem.onDidChangeVisibility));
          return this.toggleMenuActionViewItem;
        }
        if (options.actionViewItemProvider) {
          const result = options.actionViewItemProvider(action, viewItemOptions);
          if (result) {
            return result;
          }
        }
        if (action instanceof SubmenuAction) {
          const result = new DropdownMenuActionViewItem(
            action,
            action.actions,
            contextMenuProvider,
            {
              actionViewItemProvider: this.options.actionViewItemProvider,
              actionRunner: this.actionRunner,
              keybindingProvider: this.options.getKeyBinding,
              classNames: action.class,
              menuClassName: this.options.dropdownMenuClassName,
              closeAnimation: this.options.dropdownMenuCloseAnimation,
              anchorAlignmentProvider: this.options.anchorAlignmentProvider,
              menuAsChild: !!this.options.renderDropdownAsChildElement,
              skipTelemetry: this.options.skipTelemetry,
              hoverDelegate: this.options.hoverDelegate
            }
          );
          result.setActionContext(this.actionBar.context);
          this.submenuActionViewItems.push(result);
          this.disposables.add(this._onDidChangeDropdownVisibility.add(result.onDidChangeVisibility));
          return result;
        }
        return void 0;
      }
    }));
    if (this.options.responsiveBehavior?.enabled) {
      this.element.classList.toggle("responsive", true);
      this.element.classList.toggle("responsive-all", this.options.responsiveBehavior.kind === "all");
      this.element.classList.toggle("responsive-last", this.options.responsiveBehavior.kind === "last");
      this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, `${this.getConfiguredActionMinWidth()}px`);
      const observer = new ResizeObserver(() => {
        this.updateActions(this.getAvailableWidth());
      });
      observer.observe(this.options.responsiveBehavior?.observedElement ?? this.element);
      this._store.add(toDisposable(() => observer.disconnect()));
    }
  }
  get onDidChangeDropdownVisibility() {
    return this._onDidChangeDropdownVisibility.event;
  }
  set actionRunner(actionRunner) {
    this.actionBar.actionRunner = actionRunner;
  }
  get actionRunner() {
    return this.actionBar.actionRunner;
  }
  set context(context) {
    this.actionBar.context = context;
    this.toggleMenuActionViewItem?.setActionContext(context);
    for (const actionViewItem of this.submenuActionViewItems) {
      actionViewItem.setActionContext(context);
    }
  }
  getElement() {
    return this.element;
  }
  focus() {
    this.actionBar.focus();
  }
  getItemsWidth() {
    let itemsWidth = 0;
    for (let i = 0; i < this.actionBar.length(); i++) {
      itemsWidth += this.actionBar.getWidth(i);
    }
    return itemsWidth;
  }
  getItemAction(indexOrElement) {
    return this.actionBar.getAction(indexOrElement);
  }
  getItemWidth(index) {
    return this.actionBar.getWidth(index);
  }
  getUnshrunkItemWidth(index) {
    const actionItem = this.actionBar.getContainer().firstElementChild?.children.item(index);
    if (!DOM.isHTMLElement(actionItem)) {
      return this.actionBar.getWidth(index);
    }
    const previousFlexShrink = actionItem.style.flexShrink;
    const previousMinWidth = actionItem.style.minWidth;
    try {
      actionItem.style.flexShrink = "0";
      if (!previousMinWidth) {
        actionItem.style.minWidth = "0";
      }
      return this.actionBar.getWidth(index);
    } finally {
      actionItem.style.flexShrink = previousFlexShrink;
      actionItem.style.minWidth = previousMinWidth;
    }
  }
  getItemsLength() {
    return this.actionBar.length();
  }
  setAriaLabel(label) {
    this.actionBar.setAriaLabel(label);
  }
  /**
   * Force the responsive overflow logic to re-evaluate item visibility.
   * Call this after action view items change their rendered size externally
   * (e.g. label text changes) without the toolbar being notified.
   */
  relayout() {
    if (this.options.responsiveBehavior?.enabled) {
      const width = this.getAvailableWidth();
      this.updateActions(width);
    }
  }
  setActions(primaryActions, secondaryActions) {
    this.clear();
    this.originalPrimaryActions = primaryActions ? primaryActions.slice(0) : [];
    this.originalSecondaryActions = secondaryActions ? secondaryActions.slice(0) : [];
    const primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];
    this.hasSecondaryActions = !!(secondaryActions && secondaryActions.length > 0);
    if (this.hasSecondaryActions && secondaryActions) {
      this.toggleMenuAction.menuActions = secondaryActions.slice(0);
      primaryActionsToSet.push(this.toggleMenuAction);
    }
    if (primaryActionsToSet.length > 0 && this.options.trailingSeparator) {
      primaryActionsToSet.push(new Separator());
    }
    primaryActionsToSet.forEach((action) => {
      this.actionBar.push(action, { icon: this.options.icon ?? true, label: this.options.label ?? false, keybinding: this.getKeybindingLabel(action) });
    });
    this.updateOverflowClassName();
    this.applyResponsiveActionMinWidths();
    if (this.options.responsiveBehavior?.enabled) {
      this.hiddenActions.length = 0;
      if (this.options.responsiveBehavior?.minItems !== void 0) {
        const itemCount = this.options.responsiveBehavior.minItems;
        const primaryActionsMinWidth = this.originalPrimaryActions.slice(0, itemCount).reduce((total, action) => total + this.getActionMinWidth(action), 0);
        let overflowWidth = 0;
        if (this.originalSecondaryActions.length > 0 || itemCount < this.originalPrimaryActions.length) {
          overflowWidth = ACTION_MIN_WIDTH + ACTION_PADDING;
        }
        this.container.style.minWidth = `${primaryActionsMinWidth + overflowWidth}px`;
        this.element.style.minWidth = `${primaryActionsMinWidth + overflowWidth}px`;
      } else {
        const minimumActionWidth = this.originalPrimaryActions.length > 0 ? this.getActionMinWidth(this.originalPrimaryActions[0]) : ACTION_MIN_WIDTH + ACTION_PADDING;
        this.container.style.minWidth = `${minimumActionWidth}px`;
        this.element.style.minWidth = `${minimumActionWidth}px`;
      }
      this.updateActions(this.getAvailableWidth());
    }
  }
  isEmpty() {
    return this.actionBar.isEmpty();
  }
  getKeybindingLabel(action) {
    const key = this.options.getKeyBinding?.(action);
    return key?.getLabel() ?? void 0;
  }
  getConfiguredActionMinWidth(action) {
    if (action?.id === ToggleMenuAction.ID) {
      return ACTION_MIN_WIDTH;
    }
    return this.options.responsiveBehavior?.getActionMinWidth?.(action ?? this.toggleMenuAction) ?? this.options.responsiveBehavior?.actionMinWidth ?? ACTION_MIN_WIDTH;
  }
  getActionMinWidth(action) {
    return this.getConfiguredActionMinWidth(action) + ACTION_PADDING;
  }
  getAvailableWidth() {
    if (this.options.responsiveBehavior?.getAvailableWidth) {
      return this.options.responsiveBehavior.getAvailableWidth();
    }
    return this.element.getBoundingClientRect().width;
  }
  applyResponsiveActionMinWidths() {
    if (!this.options.responsiveBehavior?.enabled) {
      return;
    }
    if (this.options.responsiveBehavior.kind === "last") {
      const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
      const shrinkableIndex = hasToggleMenuAction ? this.actionBar.length() - 2 : this.actionBar.length() - 1;
      const shrinkableAction = shrinkableIndex >= 0 ? this.actionBar.getAction(shrinkableIndex) : void 0;
      const minWidth = `${this.getConfiguredActionMinWidth(shrinkableAction)}px`;
      if (this.element.style.getPropertyValue(ACTION_MIN_WIDTH_VAR) !== minWidth) {
        this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, minWidth);
      }
      return;
    }
    const actionsContainer = this.actionBar.getContainer().firstElementChild;
    if (!DOM.isHTMLElement(actionsContainer)) {
      return;
    }
    for (let i = 0; i < actionsContainer.children.length; i++) {
      const actionItem = actionsContainer.children.item(i);
      if (!DOM.isHTMLElement(actionItem)) {
        continue;
      }
      const action = this.actionBar.getAction(i);
      const minWidth = `${this.getConfiguredActionMinWidth(action)}px`;
      if (actionItem.style.minWidth !== minWidth) {
        actionItem.style.minWidth = minWidth;
      }
    }
  }
  updateActions(containerWidth) {
    if (this.actionBar.isEmpty()) {
      return;
    }
    this.applyResponsiveActionMinWidths();
    const parsedMinWidth = parseInt(this.element.style.minWidth);
    containerWidth = Math.max(containerWidth, Number.isNaN(parsedMinWidth) ? 0 : parsedMinWidth);
    const actionBarMinimumWidth = () => {
      if (this.options.responsiveBehavior?.kind === "last") {
        const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
        const primaryActionsCount = hasToggleMenuAction ? this.actionBar.length() - 1 : this.actionBar.length();
        if (primaryActionsCount === 0) {
          return hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0;
        }
        let itemsWidth = 0;
        for (let i = 0; i < primaryActionsCount - 1; i++) {
          itemsWidth += this.actionBar.getWidth(i) + ACTION_PADDING;
        }
        const action = this.actionBar.getAction(primaryActionsCount - 1);
        itemsWidth += this.getActionMinWidth(action);
        itemsWidth += hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0;
        return itemsWidth;
      } else {
        let itemsWidth = 0;
        for (let i = 0; i < this.actionBar.length(); i++) {
          itemsWidth += this.getActionMinWidth(this.actionBar.getAction(i));
        }
        return itemsWidth;
      }
    };
    const projectedActionBarMinimumWidth = (actionToAdd, keepToggleMenuAction) => {
      let itemsWidth = this.getActionMinWidth(actionToAdd);
      if (this.options.responsiveBehavior?.kind === "last") {
        const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
        const primaryActionsCount = hasToggleMenuAction ? this.actionBar.length() - 1 : this.actionBar.length();
        for (let i = 0; i < primaryActionsCount; i++) {
          const itemWidth = i === primaryActionsCount - 1 ? this.getUnshrunkItemWidth(i) : this.actionBar.getWidth(i);
          itemsWidth += itemWidth + ACTION_PADDING;
        }
      } else {
        for (let i = 0; i < this.actionBar.length(); i++) {
          const action = this.actionBar.getAction(i);
          if (action && action !== this.toggleMenuAction) {
            itemsWidth += this.getActionMinWidth(action);
          }
        }
      }
      if (keepToggleMenuAction) {
        itemsWidth += ACTION_MIN_WIDTH + ACTION_PADDING;
      }
      return itemsWidth;
    };
    let minimumWidth = actionBarMinimumWidth();
    if (minimumWidth <= containerWidth && this.hiddenActions.length === 0) {
      return;
    }
    if (minimumWidth > containerWidth) {
      if (this.options.responsiveBehavior?.minItems !== void 0) {
        const primaryActionsCount = this.actionBar.hasAction(this.toggleMenuAction) ? this.actionBar.length() - 1 : this.actionBar.length();
        if (primaryActionsCount <= this.options.responsiveBehavior.minItems) {
          return;
        }
      }
      while (minimumWidth > containerWidth && this.actionBar.length() > 0) {
        const index = this.originalPrimaryActions.length - this.hiddenActions.length - 1;
        if (index < 0) {
          break;
        }
        const action = this.originalPrimaryActions[index];
        this.hiddenActions.unshift(action);
        this.actionBar.pull(index);
        if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 1) {
          this.actionBar.push(this.toggleMenuAction, {
            icon: this.options.icon ?? true,
            label: this.options.label ?? false,
            keybinding: this.getKeybindingLabel(this.toggleMenuAction)
          });
          this.updateOverflowClassName();
        }
        this.applyResponsiveActionMinWidths();
        minimumWidth = actionBarMinimumWidth();
      }
    } else {
      while (this.hiddenActions.length > 0) {
        const action = this.hiddenActions.shift();
        const keepToggleMenuAction = this.originalSecondaryActions.length > 0 || this.hiddenActions.length > 0;
        if (projectedActionBarMinimumWidth(action, keepToggleMenuAction) > containerWidth) {
          this.hiddenActions.unshift(action);
          break;
        }
        this.actionBar.push(action, {
          icon: this.options.icon ?? true,
          label: this.options.label ?? false,
          keybinding: this.getKeybindingLabel(action),
          index: this.originalPrimaryActions.length - this.hiddenActions.length - 1
        });
        if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 0) {
          this.toggleMenuAction.menuActions = [];
          this.actionBar.pull(this.actionBar.length() - 1);
          this.updateOverflowClassName();
        }
        this.applyResponsiveActionMinWidths();
      }
    }
    const hiddenActions = this.hiddenActions.slice(0);
    if (this.originalSecondaryActions.length > 0 || hiddenActions.length > 0) {
      const secondaryActions = this.originalSecondaryActions.slice(0);
      this.toggleMenuAction.menuActions = Separator.join(hiddenActions, secondaryActions);
    }
    this.updateOverflowClassName();
    this.applyResponsiveActionMinWidths();
  }
  updateOverflowClassName() {
    this.actionBar.domNode.classList.toggle("has-overflow", this.actionBar.hasAction(this.toggleMenuAction));
  }
  clear() {
    this.submenuActionViewItems = [];
    this.disposables.clear();
    this.actionBar.clear();
  }
  dispose() {
    this.clear();
    this.disposables.dispose();
    this.element.remove();
    super.dispose();
  }
}
const _ToggleMenuAction = class _ToggleMenuAction extends Action {
  constructor(toggleDropdownMenu, title) {
    title = title || nls.localize("moreActions", "More Actions...");
    super(_ToggleMenuAction.ID, title, void 0, true);
    this._menuActions = [];
    this.toggleDropdownMenu = toggleDropdownMenu;
  }
  async run() {
    this.toggleDropdownMenu();
  }
  get menuActions() {
    return this._menuActions;
  }
  set menuActions(actions) {
    this._menuActions = actions;
  }
};
_ToggleMenuAction.ID = "toolbar.toggle.more";
let ToggleMenuAction = _ToggleMenuAction;
export {
  ToggleMenuAction,
  ToolBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcdG9vbGJhclxcdG9vbGJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElDb250ZXh0TWVudVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29udGV4dG1lbnUuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiwgSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgSUNvbnRleHRWaWV3Q2xvc2VBbmltYXRpb24gfSBmcm9tICcuLi9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBJQWN0aW9uUnVubmVyLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRXZlbnRNdWx0aXBsZXhlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAnLi90b29sYmFyLmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcblxuY29uc3QgQUNUSU9OX01JTl9XSURUSCA9IDIwOyAvKiAyMHB4IGNvZGljb24gKi9cbmNvbnN0IEFDVElPTl9QQURESU5HID0gNDsgLyogNHB4IHBhZGRpbmcgKi9cblxuY29uc3QgQUNUSU9OX01JTl9XSURUSF9WQVIgPSAnLS12c2NvZGUtdG9vbGJhci1hY3Rpb24tbWluLXdpZHRoJztcblxuZXhwb3J0IGludGVyZmFjZSBJVG9vbEJhclJlc3BvbnNpdmVCZWhhdmlvck9wdGlvbnMge1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBraW5kOiAnbGFzdCcgfCAnYWxsJztcblx0cmVhZG9ubHkgbWluSXRlbXM/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFjdGlvbk1pbldpZHRoPzogbnVtYmVyO1xuXHRyZWFkb25seSBnZXRBY3Rpb25NaW5XaWR0aD86IChhY3Rpb246IElBY3Rpb24pID0+IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb2JzZXJ2ZWRFbGVtZW50PzogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGdldEF2YWlsYWJsZVdpZHRoPzogKCkgPT4gbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUb29sQmFyT3B0aW9ucyB7XG5cdG9yaWVudGF0aW9uPzogQWN0aW9uc09yaWVudGF0aW9uO1xuXHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyPzogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXI7XG5cdGFyaWFMYWJlbD86IHN0cmluZztcblx0Z2V0S2V5QmluZGluZz86IChhY3Rpb246IElBY3Rpb24pID0+IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZDtcblx0YWN0aW9uUnVubmVyPzogSUFjdGlvblJ1bm5lcjtcblx0dG9nZ2xlTWVudVRpdGxlPzogc3RyaW5nO1xuXHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcj86ICgpID0+IEFuY2hvckFsaWdubWVudDtcblx0ZHJvcGRvd25NZW51Q2xhc3NOYW1lPzogc3RyaW5nO1xuXHRkcm9wZG93bk1lbnVDbG9zZUFuaW1hdGlvbj86IElDb250ZXh0Vmlld0Nsb3NlQW5pbWF0aW9uO1xuXHRyZW5kZXJEcm9wZG93bkFzQ2hpbGRFbGVtZW50PzogYm9vbGVhbjtcblx0bW9yZUljb24/OiBUaGVtZUljb247XG5cdGFsbG93Q29udGV4dE1lbnU/OiBib29sZWFuO1xuXHRza2lwVGVsZW1ldHJ5PzogYm9vbGVhbjtcblx0aG92ZXJEZWxlZ2F0ZT86IElIb3ZlckRlbGVnYXRlO1xuXHR0cmFpbGluZ1NlcGFyYXRvcj86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIHRydWUsIHRvZ2dsZWQgcHJpbWFyeSBpdGVtcyBhcmUgaGlnaGxpZ2h0ZWQgd2l0aCBhIGJhY2tncm91bmQgY29sb3IuXG5cdCAqL1xuXHRoaWdobGlnaHRUb2dnbGVkSXRlbXM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZW5kZXIgYWN0aW9uIHdpdGggaWNvbnMgKGRlZmF1bHQ6IGB0cnVlYClcblx0ICovXG5cdGljb24/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZW5kZXIgYWN0aW9uIHdpdGggbGFiZWwgKGRlZmF1bHQ6IGBmYWxzZWApXG5cdCAqL1xuXHRsYWJlbD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSByZXNwb25zaXZlIGJlaGF2aW9yIG9mIHRoZSBwcmltYXJ5IGdyb3VwIG9mIHRoZSB0b29sYmFyLlxuXHQgKiAtIGBlbmFibGVkYDogV2hldGhlciB0aGUgcmVzcG9uc2l2ZSBiZWhhdmlvciBpcyBlbmFibGVkLlxuXHQgKiAtIGBraW5kYDogVGhlIGtpbmQgb2YgcmVzcG9uc2l2ZSBiZWhhdmlvciB0byBhcHBseS4gQ2FuIGJlIGVpdGhlciBgbGFzdGAgdG8gb25seSBzaHJpbmsgdGhlIGxhc3QgaXRlbSwgb3IgYGFsbGAgdG8gc2hyaW5rIGFsbCBpdGVtcyBlcXVhbGx5LlxuXHQgKiAtIGBtaW5JdGVtc2A6IFRoZSBtaW5pbXVtIG51bWJlciBvZiBpdGVtcyB0aGF0IHNob3VsZCBhbHdheXMgYmUgdmlzaWJsZS5cblx0ICogLSBgYWN0aW9uTWluV2lkdGhgOiBUaGUgbWluaW11bSB3aWR0aCBvZiBlYWNoIGFjdGlvbiBpdGVtLiBEZWZhdWx0cyB0byBgQUNUSU9OX01JTl9XSURUSGAgKDI0cHgpLlxuXHQgKiAtIGBnZXRBY3Rpb25NaW5XaWR0aGA6IE9wdGlvbmFsIHBlci1hY3Rpb24gbWluaW11bSB3aWR0aCBvdmVycmlkZSBpbiBwaXhlbHMuXG5cdCAqL1xuXHRyZXNwb25zaXZlQmVoYXZpb3I/OiBJVG9vbEJhclJlc3BvbnNpdmVCZWhhdmlvck9wdGlvbnM7XG59XG5cbi8qKlxuICogQSB3aWRnZXQgdGhhdCBjb21iaW5lcyBhbiBhY3Rpb24gYmFyIGZvciBwcmltYXJ5IGFjdGlvbnMgYW5kIGEgZHJvcGRvd24gZm9yIHNlY29uZGFyeSBhY3Rpb25zLlxuICovXG5leHBvcnQgY2xhc3MgVG9vbEJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIG9wdGlvbnM6IElUb29sQmFyT3B0aW9ucztcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRwcml2YXRlIHRvZ2dsZU1lbnVBY3Rpb246IFRvZ2dsZU1lbnVBY3Rpb247XG5cdHByaXZhdGUgdG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtOiBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdWJtZW51QWN0aW9uVmlld0l0ZW1zOiBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbVtdID0gW107XG5cdHByaXZhdGUgaGFzU2Vjb25kYXJ5QWN0aW9uczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV2ZW50TXVsdGlwbGV4ZXI8Ym9vbGVhbj4oKSk7XG5cdGdldCBvbkRpZENoYW5nZURyb3Bkb3duVmlzaWJpbGl0eSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5LmV2ZW50OyB9XG5cdHByaXZhdGUgb3JpZ2luYWxQcmltYXJ5QWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPiA9IFtdO1xuXHRwcml2YXRlIG9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPiA9IFtdO1xuXHRwcml2YXRlIGhpZGRlbkFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGNvbnRleHRNZW51UHJvdmlkZXI6IElDb250ZXh0TWVudVByb3ZpZGVyLCBvcHRpb25zOiBJVG9vbEJhck9wdGlvbnMgPSB7IG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA9IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA/PyB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXG5cdFx0dGhpcy50b2dnbGVNZW51QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvZ2dsZU1lbnVBY3Rpb24oKCkgPT4gdGhpcy50b2dnbGVNZW51QWN0aW9uVmlld0l0ZW0/LnNob3coKSwgb3B0aW9ucy50b2dnbGVNZW51VGl0bGUpKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSAnbW9uYWNvLXRvb2xiYXInO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5hY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0b3JpZW50YXRpb246IG9wdGlvbnMub3JpZW50YXRpb24sXG5cdFx0XHRhcmlhTGFiZWw6IG9wdGlvbnMuYXJpYUxhYmVsLFxuXHRcdFx0YWN0aW9uUnVubmVyOiBvcHRpb25zLmFjdGlvblJ1bm5lcixcblx0XHRcdGFsbG93Q29udGV4dE1lbnU6IG9wdGlvbnMuYWxsb3dDb250ZXh0TWVudSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogb3B0aW9ucy5oaWdobGlnaHRUb2dnbGVkSXRlbXMsXG5cdFx0XHRob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCB2aWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gVG9nZ2xlTWVudUFjdGlvbi5JRCkge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtID0gbmV3IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0eyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLnRvZ2dsZU1lbnVBY3Rpb24ubWVudUFjdGlvbnMgfSxcblx0XHRcdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXIsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IHRoaXMub3B0aW9ucy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuYWN0aW9uUnVubmVyLFxuXHRcdFx0XHRcdFx0XHRrZXliaW5kaW5nUHJvdmlkZXI6IHRoaXMub3B0aW9ucy5nZXRLZXlCaW5kaW5nLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWVzOiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShvcHRpb25zLm1vcmVJY29uID8/IENvZGljb24udG9vbEJhck1vcmUpLFxuXHRcdFx0XHRcdFx0XHRtZW51Q2xhc3NOYW1lOiB0aGlzLm9wdGlvbnMuZHJvcGRvd25NZW51Q2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRjbG9zZUFuaW1hdGlvbjogdGhpcy5vcHRpb25zLmRyb3Bkb3duTWVudUNsb3NlQW5pbWF0aW9uLFxuXHRcdFx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogdGhpcy5vcHRpb25zLmFuY2hvckFsaWdubWVudFByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0XHRtZW51QXNDaGlsZDogISF0aGlzLm9wdGlvbnMucmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudCxcblx0XHRcdFx0XHRcdFx0c2tpcFRlbGVtZXRyeTogdGhpcy5vcHRpb25zLnNraXBUZWxlbWV0cnksXG5cdFx0XHRcdFx0XHRcdGlzTWVudTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtLnNldEFjdGlvbkNvbnRleHQodGhpcy5hY3Rpb25CYXIuY29udGV4dCk7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5fb25EaWRDaGFuZ2VEcm9wZG93blZpc2liaWxpdHkuYWRkKHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcikge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIHZpZXdJdGVtT3B0aW9ucyk7XG5cblx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51QWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0YWN0aW9uLmFjdGlvbnMsXG5cdFx0XHRcdFx0XHRjb250ZXh0TWVudVByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB0aGlzLm9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRcdFx0XHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRcdFx0a2V5YmluZGluZ1Byb3ZpZGVyOiB0aGlzLm9wdGlvbnMuZ2V0S2V5QmluZGluZyxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lczogYWN0aW9uLmNsYXNzLFxuXHRcdFx0XHRcdFx0XHRtZW51Q2xhc3NOYW1lOiB0aGlzLm9wdGlvbnMuZHJvcGRvd25NZW51Q2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRjbG9zZUFuaW1hdGlvbjogdGhpcy5vcHRpb25zLmRyb3Bkb3duTWVudUNsb3NlQW5pbWF0aW9uLFxuXHRcdFx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogdGhpcy5vcHRpb25zLmFuY2hvckFsaWdubWVudFByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0XHRtZW51QXNDaGlsZDogISF0aGlzLm9wdGlvbnMucmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudCxcblx0XHRcdFx0XHRcdFx0c2tpcFRlbGVtZXRyeTogdGhpcy5vcHRpb25zLnNraXBUZWxlbWV0cnksXG5cdFx0XHRcdFx0XHRcdGhvdmVyRGVsZWdhdGU6IHRoaXMub3B0aW9ucy5ob3ZlckRlbGVnYXRlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRyZXN1bHQuc2V0QWN0aW9uQ29udGV4dCh0aGlzLmFjdGlvbkJhci5jb250ZXh0KTtcblx0XHRcdFx0XHR0aGlzLnN1Ym1lbnVBY3Rpb25WaWV3SXRlbXMucHVzaChyZXN1bHQpO1xuXHRcdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuX29uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5LmFkZChyZXN1bHQub25EaWRDaGFuZ2VWaXNpYmlsaXR5KSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXNwb25zaXZlIHN1cHBvcnRcblx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8uZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Jlc3BvbnNpdmUnLCB0cnVlKTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdyZXNwb25zaXZlLWFsbCcsIHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3Iua2luZCA9PT0gJ2FsbCcpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Jlc3BvbnNpdmUtbGFzdCcsIHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3Iua2luZCA9PT0gJ2xhc3QnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShBQ1RJT05fTUlOX1dJRFRIX1ZBUiwgYCR7dGhpcy5nZXRDb25maWd1cmVkQWN0aW9uTWluV2lkdGgoKX1weGApO1xuXG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucyh0aGlzLmdldEF2YWlsYWJsZVdpZHRoKCkpO1xuXHRcdFx0fSk7XG5cdFx0XHRvYnNlcnZlci5vYnNlcnZlKHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/Lm9ic2VydmVkRWxlbWVudCA/PyB0aGlzLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0XHR9XG5cdH1cblxuXHRzZXQgYWN0aW9uUnVubmVyKGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcikge1xuXHRcdHRoaXMuYWN0aW9uQmFyLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdGdldCBhY3Rpb25SdW5uZXIoKTogSUFjdGlvblJ1bm5lciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdHNldCBjb250ZXh0KGNvbnRleHQ6IHVua25vd24pIHtcblx0XHR0aGlzLmFjdGlvbkJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLnRvZ2dsZU1lbnVBY3Rpb25WaWV3SXRlbT8uc2V0QWN0aW9uQ29udGV4dChjb250ZXh0KTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvblZpZXdJdGVtIG9mIHRoaXMuc3VibWVudUFjdGlvblZpZXdJdGVtcykge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW0uc2V0QWN0aW9uQ29udGV4dChjb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRnZXRFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50O1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25CYXIuZm9jdXMoKTtcblx0fVxuXG5cdGdldEl0ZW1zV2lkdGgoKTogbnVtYmVyIHtcblx0XHRsZXQgaXRlbXNXaWR0aCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRpdGVtc1dpZHRoICs9IHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGkpO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXNXaWR0aDtcblx0fVxuXG5cdGdldEl0ZW1BY3Rpb24oaW5kZXhPckVsZW1lbnQ6IG51bWJlciB8IEhUTUxFbGVtZW50KSB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmdldEFjdGlvbihpbmRleE9yRWxlbWVudCk7XG5cdH1cblxuXHRnZXRJdGVtV2lkdGgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VW5zaHJ1bmtJdGVtV2lkdGgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgYWN0aW9uSXRlbSA9IHRoaXMuYWN0aW9uQmFyLmdldENvbnRhaW5lcigpLmZpcnN0RWxlbWVudENoaWxkPy5jaGlsZHJlbi5pdGVtKGluZGV4KTtcblx0XHRpZiAoIURPTS5pc0hUTUxFbGVtZW50KGFjdGlvbkl0ZW0pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY3Rpb25CYXIuZ2V0V2lkdGgoaW5kZXgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzRmxleFNocmluayA9IGFjdGlvbkl0ZW0uc3R5bGUuZmxleFNocmluaztcblx0XHRjb25zdCBwcmV2aW91c01pbldpZHRoID0gYWN0aW9uSXRlbS5zdHlsZS5taW5XaWR0aDtcblx0XHR0cnkge1xuXHRcdFx0YWN0aW9uSXRlbS5zdHlsZS5mbGV4U2hyaW5rID0gJzAnO1xuXHRcdFx0aWYgKCFwcmV2aW91c01pbldpZHRoKSB7XG5cdFx0XHRcdGFjdGlvbkl0ZW0uc3R5bGUubWluV2lkdGggPSAnMCc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5hY3Rpb25CYXIuZ2V0V2lkdGgoaW5kZXgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY3Rpb25JdGVtLnN0eWxlLmZsZXhTaHJpbmsgPSBwcmV2aW91c0ZsZXhTaHJpbms7XG5cdFx0XHRhY3Rpb25JdGVtLnN0eWxlLm1pbldpZHRoID0gcHJldmlvdXNNaW5XaWR0aDtcblx0XHR9XG5cdH1cblxuXHRnZXRJdGVtc0xlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKTtcblx0fVxuXG5cdHNldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25CYXIuc2V0QXJpYUxhYmVsKGxhYmVsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3JjZSB0aGUgcmVzcG9uc2l2ZSBvdmVyZmxvdyBsb2dpYyB0byByZS1ldmFsdWF0ZSBpdGVtIHZpc2liaWxpdHkuXG5cdCAqIENhbGwgdGhpcyBhZnRlciBhY3Rpb24gdmlldyBpdGVtcyBjaGFuZ2UgdGhlaXIgcmVuZGVyZWQgc2l6ZSBleHRlcm5hbGx5XG5cdCAqIChlLmcuIGxhYmVsIHRleHQgY2hhbmdlcykgd2l0aG91dCB0aGUgdG9vbGJhciBiZWluZyBub3RpZmllZC5cblx0ICovXG5cdHJlbGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yPy5lbmFibGVkKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuZ2V0QXZhaWxhYmxlV2lkdGgoKTtcblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucyh3aWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0QWN0aW9ucyhwcmltYXJ5QWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPiwgc2Vjb25kYXJ5QWN0aW9ucz86IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4pOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHQvLyBTdG9yZSBwcmltYXJ5IGFuZCBzZWNvbmRhcnkgYWN0aW9ucyBhcyByZW5kZXJlZCBpbml0aWFsbHlcblx0XHR0aGlzLm9yaWdpbmFsUHJpbWFyeUFjdGlvbnMgPSBwcmltYXJ5QWN0aW9ucyA/IHByaW1hcnlBY3Rpb25zLnNsaWNlKDApIDogW107XG5cdFx0dGhpcy5vcmlnaW5hbFNlY29uZGFyeUFjdGlvbnMgPSBzZWNvbmRhcnlBY3Rpb25zID8gc2Vjb25kYXJ5QWN0aW9ucy5zbGljZSgwKSA6IFtdO1xuXG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnNUb1NldCA9IHByaW1hcnlBY3Rpb25zID8gcHJpbWFyeUFjdGlvbnMuc2xpY2UoMCkgOiBbXTtcblxuXHRcdC8vIEluamVjdCBhZGRpdGlvbmFsIGFjdGlvbiB0byBvcGVuIHNlY29uZGFyeSBhY3Rpb25zIGlmIHByZXNlbnRcblx0XHR0aGlzLmhhc1NlY29uZGFyeUFjdGlvbnMgPSAhIShzZWNvbmRhcnlBY3Rpb25zICYmIHNlY29uZGFyeUFjdGlvbnMubGVuZ3RoID4gMCk7XG5cdFx0aWYgKHRoaXMuaGFzU2Vjb25kYXJ5QWN0aW9ucyAmJiBzZWNvbmRhcnlBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZU1lbnVBY3Rpb24ubWVudUFjdGlvbnMgPSBzZWNvbmRhcnlBY3Rpb25zLnNsaWNlKDApO1xuXHRcdFx0cHJpbWFyeUFjdGlvbnNUb1NldC5wdXNoKHRoaXMudG9nZ2xlTWVudUFjdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHByaW1hcnlBY3Rpb25zVG9TZXQubGVuZ3RoID4gMCAmJiB0aGlzLm9wdGlvbnMudHJhaWxpbmdTZXBhcmF0b3IpIHtcblx0XHRcdHByaW1hcnlBY3Rpb25zVG9TZXQucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblxuXHRcdHByaW1hcnlBY3Rpb25zVG9TZXQuZm9yRWFjaChhY3Rpb24gPT4ge1xuXHRcdFx0dGhpcy5hY3Rpb25CYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdGhpcy5vcHRpb25zLmljb24gPz8gdHJ1ZSwgbGFiZWw6IHRoaXMub3B0aW9ucy5sYWJlbCA/PyBmYWxzZSwga2V5YmluZGluZzogdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwoYWN0aW9uKSB9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMudXBkYXRlT3ZlcmZsb3dDbGFzc05hbWUoKTtcblx0XHR0aGlzLmFwcGx5UmVzcG9uc2l2ZUFjdGlvbk1pbldpZHRocygpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/LmVuYWJsZWQpIHtcblx0XHRcdC8vIFJlc2V0IGhpZGRlbiBhY3Rpb25zXG5cdFx0XHR0aGlzLmhpZGRlbkFjdGlvbnMubGVuZ3RoID0gMDtcblxuXHRcdFx0Ly8gU2V0IHRoZSBtaW5pbXVtIHdpZHRoXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8ubWluSXRlbXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBpdGVtQ291bnQgPSB0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yLm1pbkl0ZW1zO1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9uc01pbldpZHRoID0gdGhpcy5vcmlnaW5hbFByaW1hcnlBY3Rpb25zXG5cdFx0XHRcdFx0LnNsaWNlKDAsIGl0ZW1Db3VudClcblx0XHRcdFx0XHQucmVkdWNlKCh0b3RhbCwgYWN0aW9uKSA9PiB0b3RhbCArIHRoaXMuZ2V0QWN0aW9uTWluV2lkdGgoYWN0aW9uKSwgMCk7XG5cblx0XHRcdFx0Ly8gQWNjb3VudCBmb3Igb3ZlcmZsb3cgbWVudVxuXHRcdFx0XHRsZXQgb3ZlcmZsb3dXaWR0aCA9IDA7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLm9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9ucy5sZW5ndGggPiAwIHx8XG5cdFx0XHRcdFx0aXRlbUNvdW50IDwgdGhpcy5vcmlnaW5hbFByaW1hcnlBY3Rpb25zLmxlbmd0aFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRvdmVyZmxvd1dpZHRoID0gQUNUSU9OX01JTl9XSURUSCArIEFDVElPTl9QQURESU5HO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUubWluV2lkdGggPSBgJHtwcmltYXJ5QWN0aW9uc01pbldpZHRoICsgb3ZlcmZsb3dXaWR0aH1weGA7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5taW5XaWR0aCA9IGAke3ByaW1hcnlBY3Rpb25zTWluV2lkdGggKyBvdmVyZmxvd1dpZHRofXB4YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1pbmltdW1BY3Rpb25XaWR0aCA9IHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9ucy5sZW5ndGggPiAwID8gdGhpcy5nZXRBY3Rpb25NaW5XaWR0aCh0aGlzLm9yaWdpbmFsUHJpbWFyeUFjdGlvbnNbMF0pIDogQUNUSU9OX01JTl9XSURUSCArIEFDVElPTl9QQURESU5HO1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5taW5XaWR0aCA9IGAke21pbmltdW1BY3Rpb25XaWR0aH1weGA7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5taW5XaWR0aCA9IGAke21pbmltdW1BY3Rpb25XaWR0aH1weGA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSB0b29sYmFyIGFjdGlvbnMgdG8gZml0IHdpdGggY29udGFpbmVyIHdpZHRoXG5cdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnModGhpcy5nZXRBdmFpbGFibGVXaWR0aCgpKTtcblx0XHR9XG5cdH1cblxuXHRpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbkJhci5pc0VtcHR5KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdMYWJlbChhY3Rpb246IElBY3Rpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMub3B0aW9ucy5nZXRLZXlCaW5kaW5nPy4oYWN0aW9uKTtcblxuXHRcdHJldHVybiBrZXk/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmVkQWN0aW9uTWluV2lkdGgoYWN0aW9uPzogSUFjdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKGFjdGlvbj8uaWQgPT09IFRvZ2dsZU1lbnVBY3Rpb24uSUQpIHtcblx0XHRcdHJldHVybiBBQ1RJT05fTUlOX1dJRFRIO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yPy5nZXRBY3Rpb25NaW5XaWR0aD8uKGFjdGlvbiA/PyB0aGlzLnRvZ2dsZU1lbnVBY3Rpb24pXG5cdFx0XHQ/PyB0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yPy5hY3Rpb25NaW5XaWR0aFxuXHRcdFx0Pz8gQUNUSU9OX01JTl9XSURUSDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9uTWluV2lkdGgoYWN0aW9uPzogSUFjdGlvbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29uZmlndXJlZEFjdGlvbk1pbldpZHRoKGFjdGlvbikgKyBBQ1RJT05fUEFERElORztcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXZhaWxhYmxlV2lkdGgoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8uZ2V0QXZhaWxhYmxlV2lkdGgpIHtcblx0XHRcdHJldHVybiB0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yLmdldEF2YWlsYWJsZVdpZHRoKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkud2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5UmVzcG9uc2l2ZUFjdGlvbk1pbldpZHRocygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/LmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvci5raW5kID09PSAnbGFzdCcpIHtcblx0XHRcdGNvbnN0IGhhc1RvZ2dsZU1lbnVBY3Rpb24gPSB0aGlzLmFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy50b2dnbGVNZW51QWN0aW9uKTtcblx0XHRcdGNvbnN0IHNocmlua2FibGVJbmRleCA9IGhhc1RvZ2dsZU1lbnVBY3Rpb24gPyB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKSAtIDIgOiB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKSAtIDE7XG5cdFx0XHRjb25zdCBzaHJpbmthYmxlQWN0aW9uID0gc2hyaW5rYWJsZUluZGV4ID49IDAgPyB0aGlzLmFjdGlvbkJhci5nZXRBY3Rpb24oc2hyaW5rYWJsZUluZGV4KSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1pbldpZHRoID0gYCR7dGhpcy5nZXRDb25maWd1cmVkQWN0aW9uTWluV2lkdGgoc2hyaW5rYWJsZUFjdGlvbil9cHhgO1xuXHRcdFx0aWYgKHRoaXMuZWxlbWVudC5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKEFDVElPTl9NSU5fV0lEVEhfVkFSKSAhPT0gbWluV2lkdGgpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KEFDVElPTl9NSU5fV0lEVEhfVkFSLCBtaW5XaWR0aCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IHRoaXMuYWN0aW9uQmFyLmdldENvbnRhaW5lcigpLmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdGlmICghRE9NLmlzSFRNTEVsZW1lbnQoYWN0aW9uc0NvbnRhaW5lcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdGlvbnNDb250YWluZXIuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGFjdGlvbkl0ZW0gPSBhY3Rpb25zQ29udGFpbmVyLmNoaWxkcmVuLml0ZW0oaSk7XG5cdFx0XHRpZiAoIURPTS5pc0hUTUxFbGVtZW50KGFjdGlvbkl0ZW0pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbkJhci5nZXRBY3Rpb24oaSk7XG5cdFx0XHRjb25zdCBtaW5XaWR0aCA9IGAke3RoaXMuZ2V0Q29uZmlndXJlZEFjdGlvbk1pbldpZHRoKGFjdGlvbil9cHhgO1xuXHRcdFx0aWYgKGFjdGlvbkl0ZW0uc3R5bGUubWluV2lkdGggIT09IG1pbldpZHRoKSB7XG5cdFx0XHRcdGFjdGlvbkl0ZW0uc3R5bGUubWluV2lkdGggPSBtaW5XaWR0aDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjdGlvbnMoY29udGFpbmVyV2lkdGg6IG51bWJlcikge1xuXHRcdC8vIEFjdGlvbnMgYmFyIGlzIGVtcHR5XG5cdFx0aWYgKHRoaXMuYWN0aW9uQmFyLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYXBwbHlSZXNwb25zaXZlQWN0aW9uTWluV2lkdGhzKCk7XG5cblx0XHQvLyBFbnN1cmUgdGhhdCB0aGUgY29udGFpbmVyIHdpZHRoIHJlc3BlY3RzIHRoZSBtaW5pbXVtIHdpZHRoIG9mIHRoZVxuXHRcdC8vIGVsZW1lbnQgd2hpY2ggaXMgc2V0IGJhc2VkIG9uIHRoZSBgcmVzcG9uc2l2ZUJlaGF2aW9yLm1pbkl0ZW1zYCBvcHRpb25cblx0XHRjb25zdCBwYXJzZWRNaW5XaWR0aCA9IHBhcnNlSW50KHRoaXMuZWxlbWVudC5zdHlsZS5taW5XaWR0aCk7XG5cdFx0Y29udGFpbmVyV2lkdGggPSBNYXRoLm1heChjb250YWluZXJXaWR0aCwgTnVtYmVyLmlzTmFOKHBhcnNlZE1pbldpZHRoKSA/IDAgOiBwYXJzZWRNaW5XaWR0aCk7XG5cblx0XHQvLyBFYWNoIGFjdGlvbiBpcyBhc3N1bWVkIHRvIGhhdmUgYSBtaW5pbXVtIHdpZHRoIHNvIHRoYXQgYWN0aW9ucyB3aXRoIGEgbGFiZWxcblx0XHQvLyBjYW4gc2hyaW5rIHRvIHRoZSBhY3Rpb24ncyBtaW5pbXVtIHdpZHRoLiBXZSBkbyB0aGlzIHNvIHRoYXQgYWN0aW9uIHZpc2liaWxpdHlcblx0XHQvLyB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGFjdGlvbiBsYWJlbC5cblx0XHRjb25zdCBhY3Rpb25CYXJNaW5pbXVtV2lkdGggPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8ua2luZCA9PT0gJ2xhc3QnKSB7XG5cdFx0XHRcdGNvbnN0IGhhc1RvZ2dsZU1lbnVBY3Rpb24gPSB0aGlzLmFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy50b2dnbGVNZW51QWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnNDb3VudCA9IGhhc1RvZ2dsZU1lbnVBY3Rpb25cblx0XHRcdFx0XHQ/IHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpIC0gMVxuXHRcdFx0XHRcdDogdGhpcy5hY3Rpb25CYXIubGVuZ3RoKCk7XG5cdFx0XHRcdGlmIChwcmltYXJ5QWN0aW9uc0NvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGhhc1RvZ2dsZU1lbnVBY3Rpb24gPyBBQ1RJT05fTUlOX1dJRFRIICsgQUNUSU9OX1BBRERJTkcgOiAwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGl0ZW1zV2lkdGggPSAwO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHByaW1hcnlBY3Rpb25zQ291bnQgLSAxOyBpKyspIHtcblx0XHRcdFx0XHRpdGVtc1dpZHRoICs9IHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGkpICsgQUNUSU9OX1BBRERJTkc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbkJhci5nZXRBY3Rpb24ocHJpbWFyeUFjdGlvbnNDb3VudCAtIDEpO1xuXHRcdFx0XHRpdGVtc1dpZHRoICs9IHRoaXMuZ2V0QWN0aW9uTWluV2lkdGgoYWN0aW9uKTsgLy8gaXRlbSB0byBzaHJpbmtcblx0XHRcdFx0aXRlbXNXaWR0aCArPSBoYXNUb2dnbGVNZW51QWN0aW9uID8gQUNUSU9OX01JTl9XSURUSCArIEFDVElPTl9QQURESU5HIDogMDsgLy8gdG9nZ2xlIG1lbnUgYWN0aW9uXG5cblx0XHRcdFx0cmV0dXJuIGl0ZW1zV2lkdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgaXRlbXNXaWR0aCA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5hY3Rpb25CYXIubGVuZ3RoKCk7IGkrKykge1xuXHRcdFx0XHRcdGl0ZW1zV2lkdGggKz0gdGhpcy5nZXRBY3Rpb25NaW5XaWR0aCh0aGlzLmFjdGlvbkJhci5nZXRBY3Rpb24oaSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpdGVtc1dpZHRoO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm9qZWN0ZWRBY3Rpb25CYXJNaW5pbXVtV2lkdGggPSAoYWN0aW9uVG9BZGQ6IElBY3Rpb24sIGtlZXBUb2dnbGVNZW51QWN0aW9uOiBib29sZWFuKSA9PiB7XG5cdFx0XHRsZXQgaXRlbXNXaWR0aCA9IHRoaXMuZ2V0QWN0aW9uTWluV2lkdGgoYWN0aW9uVG9BZGQpO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/LmtpbmQgPT09ICdsYXN0Jykge1xuXHRcdFx0XHRjb25zdCBoYXNUb2dnbGVNZW51QWN0aW9uID0gdGhpcy5hY3Rpb25CYXIuaGFzQWN0aW9uKHRoaXMudG9nZ2xlTWVudUFjdGlvbik7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zQ291bnQgPSBoYXNUb2dnbGVNZW51QWN0aW9uXG5cdFx0XHRcdFx0PyB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKSAtIDFcblx0XHRcdFx0XHQ6IHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHByaW1hcnlBY3Rpb25zQ291bnQ7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW1XaWR0aCA9IGkgPT09IHByaW1hcnlBY3Rpb25zQ291bnQgLSAxXG5cdFx0XHRcdFx0XHQ/IHRoaXMuZ2V0VW5zaHJ1bmtJdGVtV2lkdGgoaSlcblx0XHRcdFx0XHRcdDogdGhpcy5hY3Rpb25CYXIuZ2V0V2lkdGgoaSk7XG5cdFx0XHRcdFx0aXRlbXNXaWR0aCArPSBpdGVtV2lkdGggKyBBQ1RJT05fUEFERElORztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5hY3Rpb25CYXIuZ2V0QWN0aW9uKGkpO1xuXHRcdFx0XHRcdGlmIChhY3Rpb24gJiYgYWN0aW9uICE9PSB0aGlzLnRvZ2dsZU1lbnVBY3Rpb24pIHtcblx0XHRcdFx0XHRcdGl0ZW1zV2lkdGggKz0gdGhpcy5nZXRBY3Rpb25NaW5XaWR0aChhY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGtlZXBUb2dnbGVNZW51QWN0aW9uKSB7XG5cdFx0XHRcdGl0ZW1zV2lkdGggKz0gQUNUSU9OX01JTl9XSURUSCArIEFDVElPTl9QQURESU5HO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGl0ZW1zV2lkdGg7XG5cdFx0fTtcblxuXHRcdGxldCBtaW5pbXVtV2lkdGggPSBhY3Rpb25CYXJNaW5pbXVtV2lkdGgoKTtcblxuXHRcdC8vIEFjdGlvbiBiYXIgZml0cyBhbmQgdGhlcmUgYXJlIG5vIGhpZGRlbiBhY3Rpb25zIHRvIHNob3dcblx0XHRpZiAobWluaW11bVdpZHRoIDw9IGNvbnRhaW5lcldpZHRoICYmIHRoaXMuaGlkZGVuQWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobWluaW11bVdpZHRoID4gY29udGFpbmVyV2lkdGgpIHtcblx0XHRcdC8vIENoZWNrIGZvciBtYXggaXRlbXMgbGltaXRcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yPy5taW5JdGVtcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zQ291bnQgPSB0aGlzLmFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy50b2dnbGVNZW51QWN0aW9uKVxuXHRcdFx0XHRcdD8gdGhpcy5hY3Rpb25CYXIubGVuZ3RoKCkgLSAxXG5cdFx0XHRcdFx0OiB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKTtcblxuXHRcdFx0XHRpZiAocHJpbWFyeUFjdGlvbnNDb3VudCA8PSB0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yLm1pbkl0ZW1zKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhpZGUgYWN0aW9ucyBmcm9tIHRoZSByaWdodFxuXHRcdFx0d2hpbGUgKG1pbmltdW1XaWR0aCA+IGNvbnRhaW5lcldpZHRoICYmIHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpID4gMCkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9ucy5sZW5ndGggLSB0aGlzLmhpZGRlbkFjdGlvbnMubGVuZ3RoIC0gMTtcblx0XHRcdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9uc1tpbmRleF07XG5cdFx0XHRcdHRoaXMuaGlkZGVuQWN0aW9ucy51bnNoaWZ0KGFjdGlvbik7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSBhY3Rpb25cblx0XHRcdFx0dGhpcy5hY3Rpb25CYXIucHVsbChpbmRleCk7XG5cblx0XHRcdFx0Ly8gVGhlcmUgYXJlIG5vIHNlY29uZGFyeSBhY3Rpb25zLCBidXQgd2UgaGF2ZSBhY3Rpb25zIHRoYXQgd2UgbmVlZCB0byBoaWRlIHNvIHdlXG5cdFx0XHRcdC8vIGNyZWF0ZSB0aGUgb3ZlcmZsb3cgbWVudS4gVGhpcyB3aWxsIGVuc3VyZSB0aGF0IGFub3RoZXIgcHJpbWFyeSBhY3Rpb24gd2lsbCBiZVxuXHRcdFx0XHQvLyByZW1vdmVkIG1ha2luZyBzcGFjZSBmb3IgdGhlIG92ZXJmbG93IG1lbnUuXG5cdFx0XHRcdGlmICh0aGlzLm9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9ucy5sZW5ndGggPT09IDAgJiYgdGhpcy5oaWRkZW5BY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHRoaXMuYWN0aW9uQmFyLnB1c2godGhpcy50b2dnbGVNZW51QWN0aW9uLCB7XG5cdFx0XHRcdFx0XHRpY29uOiB0aGlzLm9wdGlvbnMuaWNvbiA/PyB0cnVlLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHRoaXMub3B0aW9ucy5sYWJlbCA/PyBmYWxzZSxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmc6IHRoaXMuZ2V0S2V5YmluZGluZ0xhYmVsKHRoaXMudG9nZ2xlTWVudUFjdGlvbiksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVPdmVyZmxvd0NsYXNzTmFtZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5hcHBseVJlc3BvbnNpdmVBY3Rpb25NaW5XaWR0aHMoKTtcblx0XHRcdFx0bWluaW11bVdpZHRoID0gYWN0aW9uQmFyTWluaW11bVdpZHRoKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNob3cgYWN0aW9ucyBmcm9tIHRoZSB0b3Agb2YgdGhlIHRvZ2dsZSBtZW51XG5cdFx0XHR3aGlsZSAodGhpcy5oaWRkZW5BY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5oaWRkZW5BY3Rpb25zLnNoaWZ0KCkhO1xuXHRcdFx0XHRjb25zdCBrZWVwVG9nZ2xlTWVudUFjdGlvbiA9IHRoaXMub3JpZ2luYWxTZWNvbmRhcnlBY3Rpb25zLmxlbmd0aCA+IDAgfHwgdGhpcy5oaWRkZW5BY3Rpb25zLmxlbmd0aCA+IDA7XG5cdFx0XHRcdGlmIChwcm9qZWN0ZWRBY3Rpb25CYXJNaW5pbXVtV2lkdGgoYWN0aW9uLCBrZWVwVG9nZ2xlTWVudUFjdGlvbikgPiBjb250YWluZXJXaWR0aCkge1xuXHRcdFx0XHRcdC8vIE5vdCBlbm91Z2ggc3BhY2UgdG8gc2hvdyB0aGUgYWN0aW9uXG5cdFx0XHRcdFx0dGhpcy5oaWRkZW5BY3Rpb25zLnVuc2hpZnQoYWN0aW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFkZCB0aGUgYWN0aW9uXG5cdFx0XHRcdHRoaXMuYWN0aW9uQmFyLnB1c2goYWN0aW9uLCB7XG5cdFx0XHRcdFx0aWNvbjogdGhpcy5vcHRpb25zLmljb24gPz8gdHJ1ZSxcblx0XHRcdFx0XHRsYWJlbDogdGhpcy5vcHRpb25zLmxhYmVsID8/IGZhbHNlLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHRoaXMuZ2V0S2V5YmluZGluZ0xhYmVsKGFjdGlvbiksXG5cdFx0XHRcdFx0aW5kZXg6IHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9ucy5sZW5ndGggLSB0aGlzLmhpZGRlbkFjdGlvbnMubGVuZ3RoIC0gMVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBUaGVyZSBhcmUgbm8gc2Vjb25kYXJ5IGFjdGlvbnMsIGFuZCB0aGVyZSBpcyBvbmx5IG9uZSBoaWRkZW4gaXRlbSBsZWZ0IHNvIHdlXG5cdFx0XHRcdC8vIHJlbW92ZSB0aGUgb3ZlcmZsb3cgbWVudSBtYWtpbmcgc3BhY2UgZm9yIHRoZSBsYXN0IGhpZGRlbiBhY3Rpb24gdG8gYmUgc2hvd24uXG5cdFx0XHRcdGlmICh0aGlzLm9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9ucy5sZW5ndGggPT09IDAgJiYgdGhpcy5oaWRkZW5BY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvbi5tZW51QWN0aW9ucyA9IFtdO1xuXHRcdFx0XHRcdHRoaXMuYWN0aW9uQmFyLnB1bGwodGhpcy5hY3Rpb25CYXIubGVuZ3RoKCkgLSAxKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZU92ZXJmbG93Q2xhc3NOYW1lKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmFwcGx5UmVzcG9uc2l2ZUFjdGlvbk1pbldpZHRocygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBvdmVyZmxvdyBtZW51XG5cdFx0Y29uc3QgaGlkZGVuQWN0aW9ucyA9IHRoaXMuaGlkZGVuQWN0aW9ucy5zbGljZSgwKTtcblx0XHRpZiAodGhpcy5vcmlnaW5hbFNlY29uZGFyeUFjdGlvbnMubGVuZ3RoID4gMCB8fCBoaWRkZW5BY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnMgPSB0aGlzLm9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9ucy5zbGljZSgwKTtcblx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvbi5tZW51QWN0aW9ucyA9IFNlcGFyYXRvci5qb2luKGhpZGRlbkFjdGlvbnMsIHNlY29uZGFyeUFjdGlvbnMpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlT3ZlcmZsb3dDbGFzc05hbWUoKTtcblx0XHR0aGlzLmFwcGx5UmVzcG9uc2l2ZUFjdGlvbk1pbldpZHRocygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVPdmVyZmxvd0NsYXNzTmFtZSgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGlvbkJhci5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1vdmVyZmxvdycsIHRoaXMuYWN0aW9uQmFyLmhhc0FjdGlvbih0aGlzLnRvZ2dsZU1lbnVBY3Rpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5zdWJtZW51QWN0aW9uVmlld0l0ZW1zID0gW107XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVNZW51QWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAndG9vbGJhci50b2dnbGUubW9yZSc7XG5cblx0cHJpdmF0ZSBfbWVudUFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj47XG5cdHByaXZhdGUgdG9nZ2xlRHJvcGRvd25NZW51OiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKHRvZ2dsZURyb3Bkb3duTWVudTogKCkgPT4gdm9pZCwgdGl0bGU/OiBzdHJpbmcpIHtcblx0XHR0aXRsZSA9IHRpdGxlIHx8IG5scy5sb2NhbGl6ZSgnbW9yZUFjdGlvbnMnLCBcIk1vcmUgQWN0aW9ucy4uLlwiKTtcblx0XHRzdXBlcihUb2dnbGVNZW51QWN0aW9uLklELCB0aXRsZSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdHRoaXMuX21lbnVBY3Rpb25zID0gW107XG5cdFx0dGhpcy50b2dnbGVEcm9wZG93bk1lbnUgPSB0b2dnbGVEcm9wZG93bk1lbnU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50b2dnbGVEcm9wZG93bk1lbnUoKTtcblx0fVxuXG5cdGdldCBtZW51QWN0aW9ucygpOiBSZWFkb25seUFycmF5PElBY3Rpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWVudUFjdGlvbnM7XG5cdH1cblxuXHRzZXQgbWVudUFjdGlvbnMoYWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPikge1xuXHRcdHRoaXMuX21lbnVBY3Rpb25zID0gYWN0aW9ucztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsV0FBVywwQkFBbUQ7QUFFdkUsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxRQUFnQyxXQUFXLHFCQUFxQjtBQUN6RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsT0FBTztBQUNQLFlBQVksU0FBUztBQUVyQixTQUFTLGtDQUFrQztBQUUzQyxNQUFNLG1CQUFtQjtBQUN6QixNQUFNLGlCQUFpQjtBQUV2QixNQUFNLHVCQUF1QjtBQTBEdEIsTUFBTSxnQkFBZ0IsV0FBVztBQUFBLEVBZ0J2QyxZQUE2QixXQUF3QixxQkFBMkMsVUFB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
