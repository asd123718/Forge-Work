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
import { localize } from "../../../nls.js";
import { Action, Separator } from "../../../base/common/actions.js";
import { $, addDisposableListener, append, clearNode, EventHelper, EventType, getDomNodePagePosition, hide, show } from "../../../base/browser/dom.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { toDisposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { NumberBadge, ProgressBadge, IconBadge } from "../../services/activity/common/activity.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DelayedDragHandler } from "../../../base/browser/dnd.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../dnd.js";
import { BaseActionViewItem } from "../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { badgeBackground, badgeForeground, contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { Action2 } from "../../../platform/actions/common/actions.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { createConfigureKeybindingAction } from "../../../platform/actions/common/menuService.js";
import { HoverStyle } from "../../../base/browser/ui/hover/hover.js";
class CompositeBarAction extends Action {
  constructor(item) {
    super(item.id, item.name, item.classNames?.join(" "), true);
    this.item = item;
    this._onDidChangeCompositeBarActionItem = this._register(new Emitter());
    this.onDidChangeCompositeBarActionItem = this._onDidChangeCompositeBarActionItem.event;
    this._onDidChangeActivity = this._register(new Emitter());
    this.onDidChangeActivity = this._onDidChangeActivity.event;
    this._activities = [];
  }
  get compositeBarActionItem() {
    return this.item;
  }
  set compositeBarActionItem(item) {
    this._label = item.name;
    this.item = item;
    this._onDidChangeCompositeBarActionItem.fire(this);
  }
  get activities() {
    return this._activities;
  }
  set activities(activities) {
    this._activities = activities;
    this._onDidChangeActivity.fire(activities);
  }
  activate() {
    if (!this.checked) {
      this._setChecked(true);
    }
  }
  deactivate() {
    if (this.checked) {
      this._setChecked(false);
    }
  }
}
let CompositeBarActionViewItem = class extends BaseActionViewItem {
  constructor(action, options, badgesEnabled, themeService, hoverService, configurationService, keybindingService) {
    super(null, action, options);
    this.badgesEnabled = badgesEnabled;
    this.themeService = themeService;
    this.hoverService = hoverService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.badgeDisposable = this._register(new MutableDisposable());
    this.options = options;
    this._register(this.themeService.onDidColorThemeChange(this.onThemeChange, this));
    this._register(action.onDidChangeCompositeBarActionItem(() => this.update()));
    this._register(Event.filter(keybindingService.onDidUpdateKeybindings, () => this.keybindingLabel !== this.computeKeybindingLabel())(() => this.updateTitle()));
    this._register(action.onDidChangeActivity(() => this.updateActivity()));
  }
  get compositeBarActionItem() {
    return this._action.compositeBarActionItem;
  }
  updateStyles() {
    const theme = this.themeService.getColorTheme();
    const colors = this.options.colors(theme);
    if (this.label) {
      if (this.options.icon) {
        const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
        if (this.compositeBarActionItem.iconUrl) {
          this.label.style.backgroundColor = foreground ? foreground.toString() : "";
          this.label.style.color = "";
        } else {
          this.label.style.color = foreground ? foreground.toString() : "";
          this.label.style.backgroundColor = "";
        }
      } else {
        const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
        const borderBottomColor = this._action.checked ? colors.activeBorderBottomColor : null;
        this.label.style.color = foreground ? foreground.toString() : "";
        this.label.style.borderBottomColor = borderBottomColor ? borderBottomColor.toString() : "";
      }
      this.container.style.setProperty("--insert-border-color", colors.dragAndDropBorder ? colors.dragAndDropBorder.toString() : "");
    }
    if (this.badgeContent) {
      const badgeStyles = this.getActivities()[0]?.badge.getColors(theme);
      const badgeFg = badgeStyles?.badgeForeground ?? colors.badgeForeground ?? theme.getColor(badgeForeground);
      const badgeBg = badgeStyles?.badgeBackground ?? colors.badgeBackground ?? theme.getColor(badgeBackground);
      const contrastBorderColor = badgeStyles?.badgeBorder ?? theme.getColor(contrastBorder);
      this.badgeContent.style.color = badgeFg ? badgeFg.toString() : "";
      this.badgeContent.style.backgroundColor = badgeBg ? badgeBg.toString() : "";
      this.badgeContent.style.borderStyle = contrastBorderColor && !this.options.compact ? "solid" : "";
      this.badgeContent.style.borderWidth = contrastBorderColor ? "1px" : "";
      this.badgeContent.style.borderColor = contrastBorderColor ? contrastBorderColor.toString() : "";
    }
  }
  render(container) {
    super.render(container);
    this.container = container;
    if (this.options.icon) {
      this.container.classList.add("icon");
    }
    const role = this.options.isTabList || !this.options.hasPopup ? "tab" : "button";
    this.container.setAttribute("role", role);
    if (this.options.hasPopup) {
      this.container.setAttribute("aria-haspopup", "true");
    }
    this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, () => {
      this.container.classList.add("clicked");
    }));
    this._register(addDisposableListener(this.container, EventType.MOUSE_UP, () => {
      if (this.mouseUpTimeout) {
        clearTimeout(this.mouseUpTimeout);
      }
      this.mouseUpTimeout = setTimeout(() => {
        this.container.classList.remove("clicked");
      }, 800);
    }));
    this._register(this.hoverService.setupDelayedHover(this.container, () => ({
      content: this.computeTitle(),
      style: HoverStyle.Pointer,
      position: {
        hoverPosition: this.options.hoverOptions.position()
      },
      persistence: {
        hideOnKeyDown: true
      }
    }), { groupId: "composite-bar-actions" }));
    this.label = append(container, $("a"));
    this.badge = append(container, $(".badge"));
    this.badgeContent = append(this.badge, $(".badge-content"));
    append(container, $(".active-item-indicator"));
    hide(this.badge);
    this.update();
    this.updateStyles();
    this.updateTitle();
  }
  onThemeChange(theme) {
    this.updateStyles();
  }
  update() {
    this.updateLabel();
    this.updateActivity();
    this.updateTitle();
    this.updateStyles();
  }
  getActivities() {
    if (this._action instanceof CompositeBarAction) {
      return this._action.activities;
    }
    return [];
  }
  updateActivity() {
    if (!this.badge || !this.badgeContent || !(this._action instanceof CompositeBarAction)) {
      return;
    }
    const { badges, type } = this.getVisibleBadges(this.getActivities());
    this.badgeDisposable.value = new DisposableStore();
    clearNode(this.badgeContent);
    hide(this.badge);
    const shouldRenderBadges = this.badgesEnabled(this.compositeBarActionItem.id);
    if (badges.length > 0 && shouldRenderBadges) {
      const classes = [];
      if (this.options.compact) {
        classes.push("compact");
      }
      if (type === "progress") {
        show(this.badge);
        classes.push("progress-badge");
      } else if (type === "number") {
        const total = badges.reduce((r, b) => r + (b instanceof NumberBadge ? b.number : 0), 0);
        if (total > 0) {
          let badgeNumber = total.toString();
          if (total > 999) {
            const noOfThousands = total / 1e3;
            const floor = Math.floor(noOfThousands);
            badgeNumber = noOfThousands > floor ? `${floor}K+` : `${noOfThousands}K`;
          }
          if (this.options.compact && badgeNumber.length >= 3) {
            classes.push("compact-content");
          }
          this.badgeContent.textContent = badgeNumber;
          show(this.badge);
        }
      } else if (type === "icon") {
        classes.push("icon-badge");
        const badgeContentClassess = ["icon-overlay", ...ThemeIcon.asClassNameArray(badges[0].icon)];
        this.badgeContent.classList.add(...badgeContentClassess);
        this.badgeDisposable.value.add(toDisposable(() => this.badgeContent?.classList.remove(...badgeContentClassess)));
        show(this.badge);
      }
      if (classes.length) {
        this.badge.classList.add(...classes);
        this.badgeDisposable.value.add(toDisposable(() => this.badge.classList.remove(...classes)));
      }
    }
    this.updateTitle();
    this.updateStyles();
  }
  getVisibleBadges(activities) {
    const progressBadges = activities.filter((activity) => activity.badge instanceof ProgressBadge).map((activity) => activity.badge);
    if (progressBadges.length > 0) {
      return { badges: progressBadges, type: "progress" };
    }
    const iconBadges = activities.filter((activity) => activity.badge instanceof IconBadge).map((activity) => activity.badge);
    if (iconBadges.length > 0) {
      return { badges: iconBadges, type: "icon" };
    }
    const numberBadges = activities.filter((activity) => activity.badge instanceof NumberBadge).map((activity) => activity.badge);
    if (numberBadges.length > 0) {
      return { badges: numberBadges, type: "number" };
    }
    return { badges: [], type: void 0 };
  }
  updateLabel() {
    this.label.className = "action-label";
    if (this.compositeBarActionItem.classNames) {
      this.label.classList.add(...this.compositeBarActionItem.classNames);
    }
    if (!this.options.icon) {
      this.label.textContent = this.action.label;
    }
  }
  updateTitle() {
    const title = this.computeTitle();
    [this.label, this.badge, this.container].forEach((element) => {
      if (element) {
        element.setAttribute("aria-label", title);
        element.setAttribute("title", "");
        element.removeAttribute("title");
      }
    });
  }
  computeTitle() {
    this.keybindingLabel = this.computeKeybindingLabel();
    let title = this.keybindingLabel ? localize("titleKeybinding", "{0} ({1})", this.compositeBarActionItem.name, this.keybindingLabel) : this.compositeBarActionItem.name;
    const badges = this.getVisibleBadges(this.action.activities).badges;
    for (const badge of badges) {
      const description = badge.getDescription();
      if (!description) {
        continue;
      }
      title = `${title} - ${badge.getDescription()}`;
    }
    return title;
  }
  computeKeybindingLabel() {
    const keybinding = this.compositeBarActionItem.keybindingId ? this.keybindingService.lookupKeybinding(this.compositeBarActionItem.keybindingId) : null;
    return keybinding?.getLabel();
  }
  dispose() {
    super.dispose();
    if (this.mouseUpTimeout) {
      clearTimeout(this.mouseUpTimeout);
    }
    this.badge.remove();
  }
};
CompositeBarActionViewItem = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IKeybindingService)
], CompositeBarActionViewItem);
class CompositeOverflowActivityAction extends CompositeBarAction {
  constructor(showMenu) {
    super({
      id: "additionalComposites.action",
      name: localize("additionalViews", "Additional Views"),
      classNames: ThemeIcon.asClassNameArray(Codicon.more)
    });
    this.showMenu = showMenu;
  }
  async run() {
    this.showMenu();
  }
}
let CompositeOverflowActivityActionViewItem = class extends CompositeBarActionViewItem {
  constructor(action, getOverflowingComposites, getActiveCompositeId, getBadge, getCompositeOpenAction, colors, hoverOptions, contextMenuService, themeService, hoverService, configurationService, keybindingService) {
    super(action, { icon: true, colors, hasPopup: true, hoverOptions, isTabList: true }, () => true, themeService, hoverService, configurationService, keybindingService);
    this.getOverflowingComposites = getOverflowingComposites;
    this.getActiveCompositeId = getActiveCompositeId;
    this.getBadge = getBadge;
    this.getCompositeOpenAction = getCompositeOpenAction;
    this.contextMenuService = contextMenuService;
  }
  showMenu() {
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.container,
      getActions: () => this.getActions(),
      getCheckedActionsRepresentation: () => "radio"
    });
  }
  getActions() {
    return this.getOverflowingComposites().map((composite) => {
      const action = this.getCompositeOpenAction(composite.id);
      action.checked = this.getActiveCompositeId() === action.id;
      const badge = this.getBadge(composite.id);
      let suffix;
      if (badge instanceof NumberBadge) {
        suffix = badge.number;
      }
      if (suffix) {
        action.label = localize("numberBadge", "{0} ({1})", composite.name, suffix);
      } else {
        action.label = composite.name || "";
      }
      return action;
    });
  }
};
CompositeOverflowActivityActionViewItem = __decorateClass([
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IKeybindingService)
], CompositeOverflowActivityActionViewItem);
let CompositeActionViewItem = class extends CompositeBarActionViewItem {
  constructor(options, compositeActivityAction, toggleCompositePinnedAction, toggleCompositeBadgeAction, compositeContextMenuActionsProvider, contextMenuActionsProvider, dndHandler, compositeBar, contextMenuService, keybindingService, instantiationService, themeService, hoverService, configurationService, commandService) {
    super(
      compositeActivityAction,
      options,
      compositeBar.areBadgesEnabled.bind(compositeBar),
      themeService,
      hoverService,
      configurationService,
      keybindingService
    );
    this.toggleCompositePinnedAction = toggleCompositePinnedAction;
    this.toggleCompositeBadgeAction = toggleCompositeBadgeAction;
    this.compositeContextMenuActionsProvider = compositeContextMenuActionsProvider;
    this.contextMenuActionsProvider = contextMenuActionsProvider;
    this.dndHandler = dndHandler;
    this.compositeBar = compositeBar;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
  }
  render(container) {
    super.render(container);
    this.updateChecked();
    this.updateEnabled();
    this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, (e) => {
      EventHelper.stop(e, true);
      this.showContextMenu(container);
    }));
    let insertDropBefore = void 0;
    this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.container, () => {
      return { type: "composite", id: this.compositeBarActionItem.id };
    }, {
      onDragOver: (e) => {
        const isValidMove = e.dragAndDropData.getData().id !== this.compositeBarActionItem.id && this.dndHandler.onDragOver(e.dragAndDropData, this.compositeBarActionItem.id, e.eventData);
        toggleDropEffect(e.eventData.dataTransfer, "move", isValidMove);
        insertDropBefore = this.updateFromDragging(container, isValidMove, e.eventData);
      },
      onDragLeave: (e) => {
        insertDropBefore = this.updateFromDragging(container, false, e.eventData);
      },
      onDragEnd: (e) => {
        insertDropBefore = this.updateFromDragging(container, false, e.eventData);
      },
      onDrop: (e) => {
        EventHelper.stop(e.eventData, true);
        this.dndHandler.drop(e.dragAndDropData, this.compositeBarActionItem.id, e.eventData, insertDropBefore);
        insertDropBefore = this.updateFromDragging(container, false, e.eventData);
      },
      onDragStart: (e) => {
        if (e.dragAndDropData.getData().id !== this.compositeBarActionItem.id) {
          return;
        }
        if (e.eventData.dataTransfer) {
          e.eventData.dataTransfer.effectAllowed = "move";
        }
        this.blur();
      }
    }));
    [this.badge, this.label].forEach((element) => this._register(new DelayedDragHandler(element, () => {
      if (!this.action.checked) {
        this.action.run();
      }
    })));
    this.updateStyles();
  }
  updateFromDragging(element, showFeedback, event) {
    const rect = element.getBoundingClientRect();
    const posX = event.clientX;
    const posY = event.clientY;
    const height = rect.bottom - rect.top;
    const width = rect.right - rect.left;
    const forceTop = posY <= rect.top + height * 0.4;
    const forceBottom = posY > rect.bottom - height * 0.4;
    const preferTop = posY <= rect.top + height * 0.5;
    const forceLeft = posX <= rect.left + width * 0.4;
    const forceRight = posX > rect.right - width * 0.4;
    const preferLeft = posX <= rect.left + width * 0.5;
    const classes = element.classList;
    const lastClasses = {
      vertical: classes.contains("top") ? "top" : classes.contains("bottom") ? "bottom" : void 0,
      horizontal: classes.contains("left") ? "left" : classes.contains("right") ? "right" : void 0
    };
    const top = forceTop || preferTop && !lastClasses.vertical || !forceBottom && lastClasses.vertical === "top";
    const bottom = forceBottom || !preferTop && !lastClasses.vertical || !forceTop && lastClasses.vertical === "bottom";
    const left = forceLeft || preferLeft && !lastClasses.horizontal || !forceRight && lastClasses.horizontal === "left";
    const right = forceRight || !preferLeft && !lastClasses.horizontal || !forceLeft && lastClasses.horizontal === "right";
    element.classList.toggle("top", showFeedback && top);
    element.classList.toggle("bottom", showFeedback && bottom);
    element.classList.toggle("left", showFeedback && left);
    element.classList.toggle("right", showFeedback && right);
    if (!showFeedback) {
      return void 0;
    }
    return { verticallyBefore: top, horizontallyBefore: left };
  }
  showContextMenu(container) {
    const actions = [];
    if (this.compositeBarActionItem.keybindingId) {
      actions.push(createConfigureKeybindingAction(this.commandService, this.keybindingService, this.compositeBarActionItem.keybindingId));
    }
    actions.push(this.toggleCompositePinnedAction, this.toggleCompositeBadgeAction);
    const compositeContextMenuActions = this.compositeContextMenuActionsProvider(this.compositeBarActionItem.id);
    if (compositeContextMenuActions.length) {
      actions.push(...compositeContextMenuActions);
    }
    const isPinned = this.compositeBar.isPinned(this.compositeBarActionItem.id);
    if (isPinned) {
      this.toggleCompositePinnedAction.label = localize("hide", "Hide '{0}'", this.compositeBarActionItem.name);
      this.toggleCompositePinnedAction.checked = false;
      this.toggleCompositePinnedAction.enabled = this.compositeBar.getPinnedCompositeIds().length > 1;
    } else {
      this.toggleCompositePinnedAction.label = localize("keep", "Keep '{0}'", this.compositeBarActionItem.name);
      this.toggleCompositePinnedAction.enabled = true;
    }
    const isBadgeEnabled = this.compositeBar.areBadgesEnabled(this.compositeBarActionItem.id);
    if (isBadgeEnabled) {
      this.toggleCompositeBadgeAction.label = localize("hideBadge", "Hide Badge");
    } else {
      this.toggleCompositeBadgeAction.label = localize("showBadge", "Show Badge");
    }
    const otherActions = this.contextMenuActionsProvider();
    if (otherActions.length) {
      actions.push(new Separator());
      actions.push(...otherActions);
    }
    const elementPosition = getDomNodePagePosition(container);
    const anchor = {
      x: Math.floor(elementPosition.left + elementPosition.width / 2),
      y: elementPosition.top + elementPosition.height
    };
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => actions,
      getActionsContext: () => this.compositeBarActionItem.id
    });
  }
  updateChecked() {
    if (this.action.checked) {
      this.container.classList.add("checked");
      this.container.setAttribute("aria-label", this.getTooltip() ?? this.container.title);
      this.container.setAttribute("aria-expanded", "true");
      this.container.setAttribute("aria-selected", "true");
    } else {
      this.container.classList.remove("checked");
      this.container.setAttribute("aria-label", this.getTooltip() ?? this.container.title);
      this.container.setAttribute("aria-expanded", "false");
      this.container.setAttribute("aria-selected", "false");
    }
    this.updateStyles();
  }
  updateEnabled() {
    if (!this.element) {
      return;
    }
    if (this.action.enabled) {
      this.element.classList.remove("disabled");
    } else {
      this.element.classList.add("disabled");
    }
  }
  dispose() {
    super.dispose();
    this.label.remove();
  }
};
CompositeActionViewItem = __decorateClass([
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, ICommandService)
], CompositeActionViewItem);
class ToggleCompositePinnedAction extends Action {
  constructor(activity, compositeBar) {
    super("show.toggleCompositePinned", activity ? activity.name : localize("toggle", "Toggle View Pinned"));
    this.activity = activity;
    this.compositeBar = compositeBar;
    this.checked = !!this.activity && this.compositeBar.isPinned(this.activity.id);
  }
  async run(context) {
    const id = this.activity ? this.activity.id : context;
    if (this.compositeBar.isPinned(id)) {
      this.compositeBar.unpin(id);
    } else {
      this.compositeBar.pin(id);
    }
  }
}
class ToggleCompositeBadgeAction extends Action {
  constructor(compositeBarActionItem, compositeBar) {
    super("show.toggleCompositeBadge", compositeBarActionItem ? compositeBarActionItem.name : localize("toggleBadge", "Toggle View Badge"));
    this.compositeBarActionItem = compositeBarActionItem;
    this.compositeBar = compositeBar;
    this.checked = false;
  }
  async run(context) {
    const id = this.compositeBarActionItem ? this.compositeBarActionItem.id : context;
    this.compositeBar.toggleBadgeEnablement(id);
  }
}
class SwitchCompositeViewAction extends Action2 {
  constructor(desc, location, offset) {
    super(desc);
    this.location = location;
    this.offset = offset;
  }
  async run(accessor) {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const activeComposite = paneCompositeService.getActivePaneComposite(this.location);
    if (!activeComposite) {
      return;
    }
    let targetCompositeId;
    const visibleCompositeIds = paneCompositeService.getVisiblePaneCompositeIds(this.location);
    for (let i = 0; i < visibleCompositeIds.length; i++) {
      if (visibleCompositeIds[i] === activeComposite.getId()) {
        targetCompositeId = visibleCompositeIds[(i + visibleCompositeIds.length + this.offset) % visibleCompositeIds.length];
        break;
      }
    }
    if (typeof targetCompositeId !== "undefined") {
      await paneCompositeService.openPaneComposite(targetCompositeId, this.location, true);
    }
  }
}
export {
  CompositeActionViewItem,
  CompositeBarAction,
  CompositeBarActionViewItem,
  CompositeOverflowActivityAction,
  CompositeOverflowActivityActionViewItem,
  SwitchCompositeViewAction,
  ToggleCompositeBadgeAction,
  ToggleCompositePinnedAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxjb21wb3NpdGVCYXJBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBjbGVhck5vZGUsIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIGdldERvbU5vZGVQYWdlUG9zaXRpb24sIGhpZGUsIHNob3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgSUNvbG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bWJlckJhZGdlLCBJQmFkZ2UsIElBY3Rpdml0eSwgUHJvZ3Jlc3NCYWRnZSwgSWNvbkJhZGdlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRGVsYXllZERyYWdIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlciwgSUNvbXBvc2l0ZURyYWdBbmREcm9wLCBCZWZvcmUyRCwgdG9nZ2xlRHJvcEVmZmVjdCB9IGZyb20gJy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBiYWRnZUJhY2tncm91bmQsIGJhZGdlRm9yZWdyb3VuZCwgY29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29uZmlndXJlS2V5YmluZGluZ0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL21lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVCYXIge1xuXG5cdC8qKlxuXHQgKiBVbnBpbnMgYSBjb21wb3NpdGUgZnJvbSB0aGUgY29tcG9zaXRlIGJhci5cblx0ICovXG5cdHVucGluKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBQaW4gYSBjb21wb3NpdGUgaW5zaWRlIHRoZSBjb21wb3NpdGUgYmFyLlxuXHQgKi9cblx0cGluKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBGaW5kIG91dCBpZiBhIGNvbXBvc2l0ZSBpcyBwaW5uZWQgaW4gdGhlIGNvbXBvc2l0ZSBiYXIuXG5cdCAqL1xuXHRpc1Bpbm5lZChjb21wb3NpdGVJZDogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogR2V0IHBpbm5lZCBjb21wb3NpdGUgaWRzIGluIHRoZSBjb21wb3NpdGUgYmFyLlxuXHQgKi9cblx0Z2V0UGlubmVkQ29tcG9zaXRlSWRzKCk6IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGlmIGJhZGdlcyBhcmUgZW5hYmxlZCBmb3IgdGhhdCBzcGVjaWZpZWQgY29tcG9zaXRlLlxuXHQgKiBAcGFyYW0gY29tcG9zaXRlSWQgVGhlIGlkIG9mIHRoZSBjb21wb3NpdGUgdG8gY2hlY2tcblx0ICovXG5cdGFyZUJhZGdlc0VuYWJsZWQoY29tcG9zaXRlSWQ6IHN0cmluZyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRvZ2dsZXMgd2hldGhlciBvciBub3QgYmFkZ2VzIGFyZSBzaG93biBvbiB0aGF0IHBhcnRpY3VsYXIgY29tcG9zaXRlLlxuXHQgKiBAcGFyYW0gY29tcG9zaXRlSWQgVGhlIGNvbXBvc2l0ZSB0byB0b2dnbGUgYmFkZ2UgZW5hYmxlbWVudCBmb3Jcblx0ICovXG5cdHRvZ2dsZUJhZGdlRW5hYmxlbWVudChjb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogUmVvcmRlciBjb21wb3NpdGUgb3JkZXJpbmcgYnkgbW92aW5nIGEgY29tcG9zaXRlIHRvIHRoZSBsb2NhdGlvbiBvZiBhbm90aGVyIGNvbXBvc2l0ZS5cblx0ICovXG5cdG1vdmUoY29tcG9zaXRlSWQ6IHN0cmluZywgdG9jb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB7XG5cdGlkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0a2V5YmluZGluZ0lkPzogc3RyaW5nO1xuXHRjbGFzc05hbWVzPzogc3RyaW5nW107XG5cdGljb25Vcmw/OiBVUkk7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVCYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPENvbXBvc2l0ZUJhckFjdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSA9IHRoaXMuX29uRGlkQ2hhbmdlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2aXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFjdGl2aXR5W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2aXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3Rpdml0eS5ldmVudDtcblxuXHRwcml2YXRlIF9hY3Rpdml0aWVzOiBJQWN0aXZpdHlbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgaXRlbTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0pIHtcblx0XHRzdXBlcihpdGVtLmlkLCBpdGVtLm5hbWUsIGl0ZW0uY2xhc3NOYW1lcz8uam9pbignICcpLCB0cnVlKTtcblx0fVxuXG5cdGdldCBjb21wb3NpdGVCYXJBY3Rpb25JdGVtKCk6IElDb21wb3NpdGVCYXJBY3Rpb25JdGVtIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtO1xuXHR9XG5cblx0c2V0IGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0oaXRlbTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0pIHtcblx0XHR0aGlzLl9sYWJlbCA9IGl0ZW0ubmFtZTtcblx0XHR0aGlzLml0ZW0gPSBpdGVtO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbS5maXJlKHRoaXMpO1xuXHR9XG5cblx0Z2V0IGFjdGl2aXRpZXMoKTogSUFjdGl2aXR5W10ge1xuXHRcdHJldHVybiB0aGlzLl9hY3Rpdml0aWVzO1xuXHR9XG5cblx0c2V0IGFjdGl2aXRpZXMoYWN0aXZpdGllczogSUFjdGl2aXR5W10pIHtcblx0XHR0aGlzLl9hY3Rpdml0aWVzID0gYWN0aXZpdGllcztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2aXR5LmZpcmUoYWN0aXZpdGllcyk7XG5cdH1cblxuXHRhY3RpdmF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2hlY2tlZCkge1xuXHRcdFx0dGhpcy5fc2V0Q2hlY2tlZCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRkZWFjdGl2YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNoZWNrZWQpIHtcblx0XHRcdHRoaXMuX3NldENoZWNrZWQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZUJhckNvbG9ycyB7XG5cdHJlYWRvbmx5IGFjdGl2ZUJhY2tncm91bmRDb2xvcj86IENvbG9yO1xuXHRyZWFkb25seSBpbmFjdGl2ZUJhY2tncm91bmRDb2xvcj86IENvbG9yO1xuXHRyZWFkb25seSBhY3RpdmVCb3JkZXJDb2xvcj86IENvbG9yO1xuXHRyZWFkb25seSBhY3RpdmVCYWNrZ3JvdW5kPzogQ29sb3I7XG5cdHJlYWRvbmx5IGFjdGl2ZUJvcmRlckJvdHRvbUNvbG9yPzogQ29sb3I7XG5cdHJlYWRvbmx5IGFjdGl2ZUZvcmVncm91bmRDb2xvcj86IENvbG9yO1xuXHRyZWFkb25seSBpbmFjdGl2ZUZvcmVncm91bmRDb2xvcj86IENvbG9yO1xuXHRyZWFkb25seSBiYWRnZUJhY2tncm91bmQ/OiBDb2xvcjtcblx0cmVhZG9ubHkgYmFkZ2VGb3JlZ3JvdW5kPzogQ29sb3I7XG5cdHJlYWRvbmx5IGRyYWdBbmREcm9wQm9yZGVyPzogQ29sb3I7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGl2aXR5SG92ZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgcG9zaXRpb246ICgpID0+IEhvdmVyUG9zaXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtT3B0aW9ucyBleHRlbmRzIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMge1xuXHRyZWFkb25seSBpY29uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29sb3JzOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiBJQ29tcG9zaXRlQmFyQ29sb3JzO1xuXG5cdHJlYWRvbmx5IGhvdmVyT3B0aW9uczogSUFjdGl2aXR5SG92ZXJPcHRpb25zO1xuXHRyZWFkb25seSBoYXNQb3B1cD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbXBhY3Q/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByb3RlY3RlZCBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIGxhYmVsITogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCBiYWRnZSE6IEhUTUxFbGVtZW50O1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgb3B0aW9uczogSUNvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtT3B0aW9ucztcblxuXHRwcml2YXRlIGJhZGdlQ29udGVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYmFkZ2VEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgbW91c2VVcFRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUga2V5YmluZGluZ0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogQ29tcG9zaXRlQmFyQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBiYWRnZXNFbmFibGVkOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gYm9vbGVhbixcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhpcy5vblRoZW1lQ2hhbmdlLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uLm9uRGlkQ2hhbmdlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKGtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MsICgpID0+IHRoaXMua2V5YmluZGluZ0xhYmVsICE9PSB0aGlzLmNvbXB1dGVLZXliaW5kaW5nTGFiZWwoKSkoKCkgPT4gdGhpcy51cGRhdGVUaXRsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uLm9uRGlkQ2hhbmdlQWN0aXZpdHkoKCkgPT4gdGhpcy51cGRhdGVBY3Rpdml0eSgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0oKTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ge1xuXHRcdHJldHVybiAodGhpcy5fYWN0aW9uIGFzIENvbXBvc2l0ZUJhckFjdGlvbikuY29tcG9zaXRlQmFyQWN0aW9uSXRlbTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhlbWUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgY29sb3JzID0gdGhpcy5vcHRpb25zLmNvbG9ycyh0aGVtZSk7XG5cblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5pY29uKSB7XG5cdFx0XHRcdGNvbnN0IGZvcmVncm91bmQgPSB0aGlzLl9hY3Rpb24uY2hlY2tlZCA/IGNvbG9ycy5hY3RpdmVGb3JlZ3JvdW5kQ29sb3IgOiBjb2xvcnMuaW5hY3RpdmVGb3JlZ3JvdW5kQ29sb3I7XG5cdFx0XHRcdGlmICh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWNvblVybCkge1xuXHRcdFx0XHRcdC8vIEFwcGx5IGJhY2tncm91bmQgY29sb3IgdG8gYWN0aXZpdHkgYmFyIGl0ZW0gcHJvdmlkZWQgd2l0aCBpY29uVXJsc1xuXHRcdFx0XHRcdHRoaXMubGFiZWwuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gZm9yZWdyb3VuZCA/IGZvcmVncm91bmQudG9TdHJpbmcoKSA6ICcnO1xuXHRcdFx0XHRcdHRoaXMubGFiZWwuc3R5bGUuY29sb3IgPSAnJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBBcHBseSBmb3JlZ3JvdW5kIGNvbG9yIHRvIGFjdGl2aXR5IGJhciBpdGVtcyBwcm92aWRlZCB3aXRoIGNvZGljb25zXG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5zdHlsZS5jb2xvciA9IGZvcmVncm91bmQgPyBmb3JlZ3JvdW5kLnRvU3RyaW5nKCkgOiAnJztcblx0XHRcdFx0XHR0aGlzLmxhYmVsLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBmb3JlZ3JvdW5kID0gdGhpcy5fYWN0aW9uLmNoZWNrZWQgPyBjb2xvcnMuYWN0aXZlRm9yZWdyb3VuZENvbG9yIDogY29sb3JzLmluYWN0aXZlRm9yZWdyb3VuZENvbG9yO1xuXHRcdFx0XHRjb25zdCBib3JkZXJCb3R0b21Db2xvciA9IHRoaXMuX2FjdGlvbi5jaGVja2VkID8gY29sb3JzLmFjdGl2ZUJvcmRlckJvdHRvbUNvbG9yIDogbnVsbDtcblx0XHRcdFx0dGhpcy5sYWJlbC5zdHlsZS5jb2xvciA9IGZvcmVncm91bmQgPyBmb3JlZ3JvdW5kLnRvU3RyaW5nKCkgOiAnJztcblx0XHRcdFx0dGhpcy5sYWJlbC5zdHlsZS5ib3JkZXJCb3R0b21Db2xvciA9IGJvcmRlckJvdHRvbUNvbG9yID8gYm9yZGVyQm90dG9tQ29sb3IudG9TdHJpbmcoKSA6ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1pbnNlcnQtYm9yZGVyLWNvbG9yJywgY29sb3JzLmRyYWdBbmREcm9wQm9yZGVyID8gY29sb3JzLmRyYWdBbmREcm9wQm9yZGVyLnRvU3RyaW5nKCkgOiAnJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQmFkZ2Vcblx0XHRpZiAodGhpcy5iYWRnZUNvbnRlbnQpIHtcblx0XHRcdGNvbnN0IGJhZGdlU3R5bGVzID0gdGhpcy5nZXRBY3Rpdml0aWVzKClbMF0/LmJhZGdlLmdldENvbG9ycyh0aGVtZSk7XG5cdFx0XHRjb25zdCBiYWRnZUZnID0gYmFkZ2VTdHlsZXM/LmJhZGdlRm9yZWdyb3VuZCA/PyBjb2xvcnMuYmFkZ2VGb3JlZ3JvdW5kID8/IHRoZW1lLmdldENvbG9yKGJhZGdlRm9yZWdyb3VuZCk7XG5cdFx0XHRjb25zdCBiYWRnZUJnID0gYmFkZ2VTdHlsZXM/LmJhZGdlQmFja2dyb3VuZCA/PyBjb2xvcnMuYmFkZ2VCYWNrZ3JvdW5kID8/IHRoZW1lLmdldENvbG9yKGJhZGdlQmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCBjb250cmFzdEJvcmRlckNvbG9yID0gYmFkZ2VTdHlsZXM/LmJhZGdlQm9yZGVyID8/IHRoZW1lLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKTtcblxuXHRcdFx0dGhpcy5iYWRnZUNvbnRlbnQuc3R5bGUuY29sb3IgPSBiYWRnZUZnID8gYmFkZ2VGZy50b1N0cmluZygpIDogJyc7XG5cdFx0XHR0aGlzLmJhZGdlQ29udGVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiYWRnZUJnID8gYmFkZ2VCZy50b1N0cmluZygpIDogJyc7XG5cblx0XHRcdHRoaXMuYmFkZ2VDb250ZW50LnN0eWxlLmJvcmRlclN0eWxlID0gY29udHJhc3RCb3JkZXJDb2xvciAmJiAhdGhpcy5vcHRpb25zLmNvbXBhY3QgPyAnc29saWQnIDogJyc7XG5cdFx0XHR0aGlzLmJhZGdlQ29udGVudC5zdHlsZS5ib3JkZXJXaWR0aCA9IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPyAnMXB4JyA6ICcnO1xuXHRcdFx0dGhpcy5iYWRnZUNvbnRlbnQuc3R5bGUuYm9yZGVyQ29sb3IgPSBjb250cmFzdEJvcmRlckNvbG9yID8gY29udHJhc3RCb3JkZXJDb2xvci50b1N0cmluZygpIDogJyc7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuaWNvbikge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaWNvbicpO1xuXHRcdH1cblxuXHRcdC8vIFVzZSAndGFiJyBpbnNpZGUgdGFibGlzdCwgJ2J1dHRvbicgZm9yIHBvcHVwIGl0ZW1zIG91dHNpZGUgdGFibGlzdFxuXHRcdGNvbnN0IHJvbGUgPSB0aGlzLm9wdGlvbnMuaXNUYWJMaXN0IHx8ICF0aGlzLm9wdGlvbnMuaGFzUG9wdXAgPyAndGFiJyA6ICdidXR0b24nO1xuXHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsIHJvbGUpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuaGFzUG9wdXApIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IGhhcmQgdG8gcHJldmVudCBrZXlib2FyZCBvbmx5IGZvY3VzIGZlZWRiYWNrIHdoZW4gdXNpbmcgbW91c2Vcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjbGlja2VkJyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfVVAsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLm1vdXNlVXBUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aGlzLm1vdXNlVXBUaW1lb3V0KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5tb3VzZVVwVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjbGlja2VkJyk7XG5cdFx0XHR9LCA4MDApOyAvLyBkZWxheWVkIHRvIHByZXZlbnQgZm9jdXMgZmVlZGJhY2sgZnJvbSBzaG93aW5nIG9uIG1vdXNlIHVwXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5jb250YWluZXIsICgpID0+ICh7XG5cdFx0XHRjb250ZW50OiB0aGlzLmNvbXB1dGVUaXRsZSgpLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdGhvdmVyUG9zaXRpb246IHRoaXMub3B0aW9ucy5ob3Zlck9wdGlvbnMucG9zaXRpb24oKSxcblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZW5jZToge1xuXHRcdFx0XHRoaWRlT25LZXlEb3duOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KSwgeyBncm91cElkOiAnY29tcG9zaXRlLWJhci1hY3Rpb25zJyB9KSk7XG5cblx0XHQvLyBMYWJlbFxuXHRcdHRoaXMubGFiZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdhJykpO1xuXG5cdFx0Ly8gQmFkZ2Vcblx0XHR0aGlzLmJhZGdlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJhZGdlJykpO1xuXHRcdHRoaXMuYmFkZ2VDb250ZW50ID0gYXBwZW5kKHRoaXMuYmFkZ2UsICQoJy5iYWRnZS1jb250ZW50JykpO1xuXG5cdFx0Ly8gcGFuZSBjb21wb3NpdGUgYmFyIGFjdGl2ZSBib3JkZXIgKyBiYWNrZ3JvdW5kXG5cdFx0YXBwZW5kKGNvbnRhaW5lciwgJCgnLmFjdGl2ZS1pdGVtLWluZGljYXRvcicpKTtcblxuXHRcdGhpZGUodGhpcy5iYWRnZSk7XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRoZW1lQ2hhbmdlKHRoZW1lOiBJQ29sb3JUaGVtZSk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHR0aGlzLnVwZGF0ZUFjdGl2aXR5KCk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2aXRpZXMoKTogSUFjdGl2aXR5W10ge1xuXHRcdGlmICh0aGlzLl9hY3Rpb24gaW5zdGFuY2VvZiBDb21wb3NpdGVCYXJBY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3Rpb24uYWN0aXZpdGllcztcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUFjdGl2aXR5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5iYWRnZSB8fCAhdGhpcy5iYWRnZUNvbnRlbnQgfHwgISh0aGlzLl9hY3Rpb24gaW5zdGFuY2VvZiBDb21wb3NpdGVCYXJBY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBiYWRnZXMsIHR5cGUgfSA9IHRoaXMuZ2V0VmlzaWJsZUJhZGdlcyh0aGlzLmdldEFjdGl2aXRpZXMoKSk7XG5cblx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNsZWFyTm9kZSh0aGlzLmJhZGdlQ29udGVudCk7XG5cdFx0aGlkZSh0aGlzLmJhZGdlKTtcblxuXHRcdGNvbnN0IHNob3VsZFJlbmRlckJhZGdlcyA9IHRoaXMuYmFkZ2VzRW5hYmxlZCh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQpO1xuXG5cdFx0aWYgKGJhZGdlcy5sZW5ndGggPiAwICYmIHNob3VsZFJlbmRlckJhZGdlcykge1xuXG5cdFx0XHRjb25zdCBjbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmNvbXBhY3QpIHtcblx0XHRcdFx0Y2xhc3Nlcy5wdXNoKCdjb21wYWN0Jyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByb2dyZXNzXG5cdFx0XHRpZiAodHlwZSA9PT0gJ3Byb2dyZXNzJykge1xuXHRcdFx0XHRzaG93KHRoaXMuYmFkZ2UpO1xuXHRcdFx0XHRjbGFzc2VzLnB1c2goJ3Byb2dyZXNzLWJhZGdlJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE51bWJlclxuXHRcdFx0ZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0Y29uc3QgdG90YWwgPSBiYWRnZXMucmVkdWNlKChyLCBiKSA9PiByICsgKGIgaW5zdGFuY2VvZiBOdW1iZXJCYWRnZSA/IGIubnVtYmVyIDogMCksIDApO1xuXHRcdFx0XHRpZiAodG90YWwgPiAwKSB7XG5cdFx0XHRcdFx0bGV0IGJhZGdlTnVtYmVyID0gdG90YWwudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRpZiAodG90YWwgPiA5OTkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5vT2ZUaG91c2FuZHMgPSB0b3RhbCAvIDEwMDA7XG5cdFx0XHRcdFx0XHRjb25zdCBmbG9vciA9IE1hdGguZmxvb3Iobm9PZlRob3VzYW5kcyk7XG5cdFx0XHRcdFx0XHRiYWRnZU51bWJlciA9IG5vT2ZUaG91c2FuZHMgPiBmbG9vciA/IGAke2Zsb29yfUsrYCA6IGAke25vT2ZUaG91c2FuZHN9S2A7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdCAmJiBiYWRnZU51bWJlci5sZW5ndGggPj0gMykge1xuXHRcdFx0XHRcdFx0Y2xhc3Nlcy5wdXNoKCdjb21wYWN0LWNvbnRlbnQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5iYWRnZUNvbnRlbnQudGV4dENvbnRlbnQgPSBiYWRnZU51bWJlcjtcblx0XHRcdFx0XHRzaG93KHRoaXMuYmFkZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEljb25cblx0XHRcdGVsc2UgaWYgKHR5cGUgPT09ICdpY29uJykge1xuXHRcdFx0XHRjbGFzc2VzLnB1c2goJ2ljb24tYmFkZ2UnKTtcblx0XHRcdFx0Y29uc3QgYmFkZ2VDb250ZW50Q2xhc3Nlc3MgPSBbJ2ljb24tb3ZlcmxheScsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KChiYWRnZXNbMF0gYXMgSWNvbkJhZGdlKS5pY29uKV07XG5cdFx0XHRcdHRoaXMuYmFkZ2VDb250ZW50LmNsYXNzTGlzdC5hZGQoLi4uYmFkZ2VDb250ZW50Q2xhc3Nlc3MpO1xuXHRcdFx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuYmFkZ2VDb250ZW50Py5jbGFzc0xpc3QucmVtb3ZlKC4uLmJhZGdlQ29udGVudENsYXNzZXNzKSkpO1xuXHRcdFx0XHRzaG93KHRoaXMuYmFkZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2xhc3Nlcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5iYWRnZS5jbGFzc0xpc3QuYWRkKC4uLmNsYXNzZXMpO1xuXHRcdFx0XHR0aGlzLmJhZGdlRGlzcG9zYWJsZS52YWx1ZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuYmFkZ2UuY2xhc3NMaXN0LnJlbW92ZSguLi5jbGFzc2VzKSkpO1xuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpc2libGVCYWRnZXMoYWN0aXZpdGllczogSUFjdGl2aXR5W10pOiB7IGJhZGdlczogSUJhZGdlW107IHR5cGU6ICdwcm9ncmVzcycgfCAnaWNvbicgfCAnbnVtYmVyJyB8IHVuZGVmaW5lZCB9IHtcblx0XHRjb25zdCBwcm9ncmVzc0JhZGdlcyA9IGFjdGl2aXRpZXMuZmlsdGVyKGFjdGl2aXR5ID0+IGFjdGl2aXR5LmJhZGdlIGluc3RhbmNlb2YgUHJvZ3Jlc3NCYWRnZSkubWFwKGFjdGl2aXR5ID0+IGFjdGl2aXR5LmJhZGdlKTtcblx0XHRpZiAocHJvZ3Jlc3NCYWRnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHsgYmFkZ2VzOiBwcm9ncmVzc0JhZGdlcywgdHlwZTogJ3Byb2dyZXNzJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGljb25CYWRnZXMgPSBhY3Rpdml0aWVzLmZpbHRlcihhY3Rpdml0eSA9PiBhY3Rpdml0eS5iYWRnZSBpbnN0YW5jZW9mIEljb25CYWRnZSkubWFwKGFjdGl2aXR5ID0+IGFjdGl2aXR5LmJhZGdlKTtcblx0XHRpZiAoaWNvbkJhZGdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4geyBiYWRnZXM6IGljb25CYWRnZXMsIHR5cGU6ICdpY29uJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG51bWJlckJhZGdlcyA9IGFjdGl2aXRpZXMuZmlsdGVyKGFjdGl2aXR5ID0+IGFjdGl2aXR5LmJhZGdlIGluc3RhbmNlb2YgTnVtYmVyQmFkZ2UpLm1hcChhY3Rpdml0eSA9PiBhY3Rpdml0eS5iYWRnZSk7XG5cdFx0aWYgKG51bWJlckJhZGdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4geyBiYWRnZXM6IG51bWJlckJhZGdlcywgdHlwZTogJ251bWJlcicgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBiYWRnZXM6IFtdLCB0eXBlOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHR0aGlzLmxhYmVsLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGFiZWwnO1xuXG5cdFx0aWYgKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5jbGFzc05hbWVzKSB7XG5cdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoLi4udGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmNsYXNzTmFtZXMpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5vcHRpb25zLmljb24pIHtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmFjdGlvbi5sYWJlbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5jb21wdXRlVGl0bGUoKTtcblx0XHRbdGhpcy5sYWJlbCwgdGhpcy5iYWRnZSwgdGhpcy5jb250YWluZXJdLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpdGxlKTtcblx0XHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RpdGxlJywgJycpO1xuXHRcdFx0XHRlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgndGl0bGUnKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb21wdXRlVGl0bGUoKTogc3RyaW5nIHtcblx0XHR0aGlzLmtleWJpbmRpbmdMYWJlbCA9IHRoaXMuY29tcHV0ZUtleWJpbmRpbmdMYWJlbCgpO1xuXHRcdGxldCB0aXRsZSA9IHRoaXMua2V5YmluZGluZ0xhYmVsID8gbG9jYWxpemUoJ3RpdGxlS2V5YmluZGluZycsIFwiezB9ICh7MX0pXCIsIHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5uYW1lLCB0aGlzLmtleWJpbmRpbmdMYWJlbCkgOiB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ubmFtZTtcblxuXHRcdGNvbnN0IGJhZGdlcyA9IHRoaXMuZ2V0VmlzaWJsZUJhZGdlcygodGhpcy5hY3Rpb24gYXMgQ29tcG9zaXRlQmFyQWN0aW9uKS5hY3Rpdml0aWVzKS5iYWRnZXM7XG5cdFx0Zm9yIChjb25zdCBiYWRnZSBvZiBiYWRnZXMpIHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYmFkZ2UuZ2V0RGVzY3JpcHRpb24oKTtcblx0XHRcdGlmICghZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aXRsZSA9IGAke3RpdGxlfSAtICR7YmFkZ2UuZ2V0RGVzY3JpcHRpb24oKX1gO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUtleWJpbmRpbmdMYWJlbCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsIHtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmtleWJpbmRpbmdJZCA/IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ua2V5YmluZGluZ0lkKSA6IG51bGw7XG5cblx0XHRyZXR1cm4ga2V5YmluZGluZz8uZ2V0TGFiZWwoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHRoaXMubW91c2VVcFRpbWVvdXQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLm1vdXNlVXBUaW1lb3V0KTtcblx0XHR9XG5cblx0XHR0aGlzLmJhZGdlLnJlbW92ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uIGV4dGVuZHMgQ29tcG9zaXRlQmFyQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNob3dNZW51OiAoKSA9PiB2b2lkXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYWRkaXRpb25hbENvbXBvc2l0ZXMuYWN0aW9uJyxcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdhZGRpdGlvbmFsVmlld3MnLCBcIkFkZGl0aW9uYWwgVmlld3NcIiksXG5cdFx0XHRjbGFzc05hbWVzOiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLm1vcmUpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zaG93TWVudSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBDb21wb3NpdGVCYXJBY3Rpb24sXG5cdFx0cHJpdmF0ZSBnZXRPdmVyZmxvd2luZ0NvbXBvc2l0ZXM6ICgpID0+IHsgaWQ6IHN0cmluZzsgbmFtZT86IHN0cmluZyB9W10sXG5cdFx0cHJpdmF0ZSBnZXRBY3RpdmVDb21wb3NpdGVJZDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgZ2V0QmFkZ2U6IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQmFkZ2UsXG5cdFx0cHJpdmF0ZSBnZXRDb21wb3NpdGVPcGVuQWN0aW9uOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gSUFjdGlvbixcblx0XHRjb2xvcnM6ICh0aGVtZTogSUNvbG9yVGhlbWUpID0+IElDb21wb3NpdGVCYXJDb2xvcnMsXG5cdFx0aG92ZXJPcHRpb25zOiBJQWN0aXZpdHlIb3Zlck9wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgY29sb3JzLCBoYXNQb3B1cDogdHJ1ZSwgaG92ZXJPcHRpb25zLCBpc1RhYkxpc3Q6IHRydWUgfSwgKCkgPT4gdHJ1ZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSk7XG5cdH1cblxuXHRzaG93TWVudSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLmNvbnRhaW5lcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0QWN0aW9ucygpLFxuXHRcdFx0Z2V0Q2hlY2tlZEFjdGlvbnNSZXByZXNlbnRhdGlvbjogKCkgPT4gJ3JhZGlvJyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLmdldE92ZXJmbG93aW5nQ29tcG9zaXRlcygpLm1hcChjb21wb3NpdGUgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5nZXRDb21wb3NpdGVPcGVuQWN0aW9uKGNvbXBvc2l0ZS5pZCk7XG5cdFx0XHRhY3Rpb24uY2hlY2tlZCA9IHRoaXMuZ2V0QWN0aXZlQ29tcG9zaXRlSWQoKSA9PT0gYWN0aW9uLmlkO1xuXG5cdFx0XHRjb25zdCBiYWRnZSA9IHRoaXMuZ2V0QmFkZ2UoY29tcG9zaXRlLmlkKTtcblx0XHRcdGxldCBzdWZmaXg6IHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChiYWRnZSBpbnN0YW5jZW9mIE51bWJlckJhZGdlKSB7XG5cdFx0XHRcdHN1ZmZpeCA9IGJhZGdlLm51bWJlcjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN1ZmZpeCkge1xuXHRcdFx0XHRhY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgnbnVtYmVyQmFkZ2UnLCBcInswfSAoezF9KVwiLCBjb21wb3NpdGUubmFtZSwgc3VmZml4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFjdGlvbi5sYWJlbCA9IGNvbXBvc2l0ZS5uYW1lIHx8ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVBY3Rpb25WaWV3SXRlbSBleHRlbmRzIENvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdGNvbXBvc2l0ZUFjdGl2aXR5QWN0aW9uOiBDb21wb3NpdGVCYXJBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0b2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0b2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gSUFjdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXI6ICgpID0+IElBY3Rpb25bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRuZEhhbmRsZXI6IElDb21wb3NpdGVEcmFnQW5kRHJvcCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUJhcjogSUNvbXBvc2l0ZUJhcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0Y29tcG9zaXRlQWN0aXZpdHlBY3Rpb24sXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0Y29tcG9zaXRlQmFyLmFyZUJhZGdlc0VuYWJsZWQuYmluZChjb21wb3NpdGVCYXIpLFxuXHRcdFx0dGhlbWVTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZVxuXHRcdCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy51cGRhdGVDaGVja2VkKCk7XG5cdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0dGhpcy5zaG93Q29udGV4dE1lbnUoY29udGFpbmVyKTtcblx0XHR9KSk7XG5cblx0XHQvLyBBbGxvdyB0byBkcmFnXG5cdFx0bGV0IGluc2VydERyb3BCZWZvcmU6IEJlZm9yZTJEIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIuSU5TVEFOQ0UucmVnaXN0ZXJEcmFnZ2FibGUodGhpcy5jb250YWluZXIsICgpID0+IHsgcmV0dXJuIHsgdHlwZTogJ2NvbXBvc2l0ZScsIGlkOiB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQgfTsgfSwge1xuXHRcdFx0b25EcmFnT3ZlcjogZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzVmFsaWRNb3ZlID0gZS5kcmFnQW5kRHJvcERhdGEuZ2V0RGF0YSgpLmlkICE9PSB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQgJiYgdGhpcy5kbmRIYW5kbGVyLm9uRHJhZ092ZXIoZS5kcmFnQW5kRHJvcERhdGEsIHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCwgZS5ldmVudERhdGEpO1xuXHRcdFx0XHR0b2dnbGVEcm9wRWZmZWN0KGUuZXZlbnREYXRhLmRhdGFUcmFuc2ZlciwgJ21vdmUnLCBpc1ZhbGlkTW92ZSk7XG5cdFx0XHRcdGluc2VydERyb3BCZWZvcmUgPSB0aGlzLnVwZGF0ZUZyb21EcmFnZ2luZyhjb250YWluZXIsIGlzVmFsaWRNb3ZlLCBlLmV2ZW50RGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnTGVhdmU6IGUgPT4ge1xuXHRcdFx0XHRpbnNlcnREcm9wQmVmb3JlID0gdGhpcy51cGRhdGVGcm9tRHJhZ2dpbmcoY29udGFpbmVyLCBmYWxzZSwgZS5ldmVudERhdGEpO1xuXHRcdFx0fSxcblx0XHRcdG9uRHJhZ0VuZDogZSA9PiB7XG5cdFx0XHRcdGluc2VydERyb3BCZWZvcmUgPSB0aGlzLnVwZGF0ZUZyb21EcmFnZ2luZyhjb250YWluZXIsIGZhbHNlLCBlLmV2ZW50RGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0b25Ecm9wOiBlID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLmV2ZW50RGF0YSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuZG5kSGFuZGxlci5kcm9wKGUuZHJhZ0FuZERyb3BEYXRhLCB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQsIGUuZXZlbnREYXRhLCBpbnNlcnREcm9wQmVmb3JlKTtcblx0XHRcdFx0aW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKGNvbnRhaW5lciwgZmFsc2UsIGUuZXZlbnREYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdTdGFydDogZSA9PiB7XG5cdFx0XHRcdGlmIChlLmRyYWdBbmREcm9wRGF0YS5nZXREYXRhKCkuaWQgIT09IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlLmV2ZW50RGF0YS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRlLmV2ZW50RGF0YS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdtb3ZlJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuYmx1cigpOyAvLyBSZW1vdmUgZm9jdXMgaW5kaWNhdG9yIHdoZW4gZHJhZ2dpbmdcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBY3RpdmF0ZSBvbiBkcmFnIG92ZXIgdG8gcmV2ZWFsIHRhcmdldHNcblx0XHRbdGhpcy5iYWRnZSwgdGhpcy5sYWJlbF0uZm9yRWFjaChlbGVtZW50ID0+IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVkRHJhZ0hhbmRsZXIoZWxlbWVudCwgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmFjdGlvbi5jaGVja2VkKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uLnJ1bigpO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGcm9tRHJhZ2dpbmcoZWxlbWVudDogSFRNTEVsZW1lbnQsIHNob3dGZWVkYmFjazogYm9vbGVhbiwgZXZlbnQ6IERyYWdFdmVudCk6IEJlZm9yZTJEIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWN0ID0gZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBwb3NYID0gZXZlbnQuY2xpZW50WDtcblx0XHRjb25zdCBwb3NZID0gZXZlbnQuY2xpZW50WTtcblx0XHRjb25zdCBoZWlnaHQgPSByZWN0LmJvdHRvbSAtIHJlY3QudG9wO1xuXHRcdGNvbnN0IHdpZHRoID0gcmVjdC5yaWdodCAtIHJlY3QubGVmdDtcblxuXHRcdGNvbnN0IGZvcmNlVG9wID0gcG9zWSA8PSByZWN0LnRvcCArIGhlaWdodCAqIDAuNDtcblx0XHRjb25zdCBmb3JjZUJvdHRvbSA9IHBvc1kgPiByZWN0LmJvdHRvbSAtIGhlaWdodCAqIDAuNDtcblx0XHRjb25zdCBwcmVmZXJUb3AgPSBwb3NZIDw9IHJlY3QudG9wICsgaGVpZ2h0ICogMC41O1xuXG5cdFx0Y29uc3QgZm9yY2VMZWZ0ID0gcG9zWCA8PSByZWN0LmxlZnQgKyB3aWR0aCAqIDAuNDtcblx0XHRjb25zdCBmb3JjZVJpZ2h0ID0gcG9zWCA+IHJlY3QucmlnaHQgLSB3aWR0aCAqIDAuNDtcblx0XHRjb25zdCBwcmVmZXJMZWZ0ID0gcG9zWCA8PSByZWN0LmxlZnQgKyB3aWR0aCAqIDAuNTtcblxuXHRcdGNvbnN0IGNsYXNzZXMgPSBlbGVtZW50LmNsYXNzTGlzdDtcblx0XHRjb25zdCBsYXN0Q2xhc3NlcyA9IHtcblx0XHRcdHZlcnRpY2FsOiBjbGFzc2VzLmNvbnRhaW5zKCd0b3AnKSA/ICd0b3AnIDogKGNsYXNzZXMuY29udGFpbnMoJ2JvdHRvbScpID8gJ2JvdHRvbScgOiB1bmRlZmluZWQpLFxuXHRcdFx0aG9yaXpvbnRhbDogY2xhc3Nlcy5jb250YWlucygnbGVmdCcpID8gJ2xlZnQnIDogKGNsYXNzZXMuY29udGFpbnMoJ3JpZ2h0JykgPyAncmlnaHQnIDogdW5kZWZpbmVkKVxuXHRcdH07XG5cblx0XHRjb25zdCB0b3AgPSBmb3JjZVRvcCB8fCAocHJlZmVyVG9wICYmICFsYXN0Q2xhc3Nlcy52ZXJ0aWNhbCkgfHwgKCFmb3JjZUJvdHRvbSAmJiBsYXN0Q2xhc3Nlcy52ZXJ0aWNhbCA9PT0gJ3RvcCcpO1xuXHRcdGNvbnN0IGJvdHRvbSA9IGZvcmNlQm90dG9tIHx8ICghcHJlZmVyVG9wICYmICFsYXN0Q2xhc3Nlcy52ZXJ0aWNhbCkgfHwgKCFmb3JjZVRvcCAmJiBsYXN0Q2xhc3Nlcy52ZXJ0aWNhbCA9PT0gJ2JvdHRvbScpO1xuXHRcdGNvbnN0IGxlZnQgPSBmb3JjZUxlZnQgfHwgKHByZWZlckxlZnQgJiYgIWxhc3RDbGFzc2VzLmhvcml6b250YWwpIHx8ICghZm9yY2VSaWdodCAmJiBsYXN0Q2xhc3Nlcy5ob3Jpem9udGFsID09PSAnbGVmdCcpO1xuXHRcdGNvbnN0IHJpZ2h0ID0gZm9yY2VSaWdodCB8fCAoIXByZWZlckxlZnQgJiYgIWxhc3RDbGFzc2VzLmhvcml6b250YWwpIHx8ICghZm9yY2VMZWZ0ICYmIGxhc3RDbGFzc2VzLmhvcml6b250YWwgPT09ICdyaWdodCcpO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCd0b3AnLCBzaG93RmVlZGJhY2sgJiYgdG9wKTtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2JvdHRvbScsIHNob3dGZWVkYmFjayAmJiBib3R0b20pO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbGVmdCcsIHNob3dGZWVkYmFjayAmJiBsZWZ0KTtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3JpZ2h0Jywgc2hvd0ZlZWRiYWNrICYmIHJpZ2h0KTtcblxuXHRcdGlmICghc2hvd0ZlZWRiYWNrKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHZlcnRpY2FsbHlCZWZvcmU6IHRvcCwgaG9yaXpvbnRhbGx5QmVmb3JlOiBsZWZ0IH07XG5cdH1cblxuXHRwcml2YXRlIHNob3dDb250ZXh0TWVudShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRpZiAodGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmtleWJpbmRpbmdJZCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZUNvbmZpZ3VyZUtleWJpbmRpbmdBY3Rpb24odGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmtleWJpbmRpbmdJZCkpO1xuXHRcdH1cblxuXHRcdGFjdGlvbnMucHVzaCh0aGlzLnRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbiwgdGhpcy50b2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbik7XG5cblx0XHRjb25zdCBjb21wb3NpdGVDb250ZXh0TWVudUFjdGlvbnMgPSB0aGlzLmNvbXBvc2l0ZUNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCk7XG5cdFx0aWYgKGNvbXBvc2l0ZUNvbnRleHRNZW51QWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5jb21wb3NpdGVDb250ZXh0TWVudUFjdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzUGlubmVkID0gdGhpcy5jb21wb3NpdGVCYXIuaXNQaW5uZWQodGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkKTtcblx0XHRpZiAoaXNQaW5uZWQpIHtcblx0XHRcdHRoaXMudG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uLmxhYmVsID0gbG9jYWxpemUoJ2hpZGUnLCBcIkhpZGUgJ3swfSdcIiwgdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLm5hbWUpO1xuXHRcdFx0dGhpcy50b2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24uY2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy50b2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24uZW5hYmxlZCA9IHRoaXMuY29tcG9zaXRlQmFyLmdldFBpbm5lZENvbXBvc2l0ZUlkcygpLmxlbmd0aCA+IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uLmxhYmVsID0gbG9jYWxpemUoJ2tlZXAnLCBcIktlZXAgJ3swfSdcIiwgdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLm5hbWUpO1xuXHRcdFx0dGhpcy50b2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNCYWRnZUVuYWJsZWQgPSB0aGlzLmNvbXBvc2l0ZUJhci5hcmVCYWRnZXNFbmFibGVkKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCk7XG5cdFx0aWYgKGlzQmFkZ2VFbmFibGVkKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uLmxhYmVsID0gbG9jYWxpemUoJ2hpZGVCYWRnZScsIFwiSGlkZSBCYWRnZVwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50b2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbi5sYWJlbCA9IGxvY2FsaXplKCdzaG93QmFkZ2UnLCBcIlNob3cgQmFkZ2VcIik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3RoZXJBY3Rpb25zID0gdGhpcy5jb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcigpO1xuXHRcdGlmIChvdGhlckFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5vdGhlckFjdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnRQb3NpdGlvbiA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24oY29udGFpbmVyKTtcblx0XHRjb25zdCBhbmNob3IgPSB7XG5cdFx0XHR4OiBNYXRoLmZsb29yKGVsZW1lbnRQb3NpdGlvbi5sZWZ0ICsgKGVsZW1lbnRQb3NpdGlvbi53aWR0aCAvIDIpKSxcblx0XHRcdHk6IGVsZW1lbnRQb3NpdGlvbi50b3AgKyBlbGVtZW50UG9zaXRpb24uaGVpZ2h0XG5cdFx0fTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2hlY2tlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hY3Rpb24uY2hlY2tlZCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hlY2tlZCcpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5nZXRUb29sdGlwKCkgPz8gdGhpcy5jb250YWluZXIudGl0bGUpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsICd0cnVlJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoZWNrZWQnKTtcblx0XHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuZ2V0VG9vbHRpcCgpID8/IHRoaXMuY29udGFpbmVyLnRpdGxlKTtcblx0XHRcdHRoaXMuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ2ZhbHNlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMubGFiZWwucmVtb3ZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBhY3Rpdml0eTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBjb21wb3NpdGVCYXI6IElDb21wb3NpdGVCYXJcblx0KSB7XG5cdFx0c3VwZXIoJ3Nob3cudG9nZ2xlQ29tcG9zaXRlUGlubmVkJywgYWN0aXZpdHkgPyBhY3Rpdml0eS5uYW1lIDogbG9jYWxpemUoJ3RvZ2dsZScsIFwiVG9nZ2xlIFZpZXcgUGlubmVkXCIpKTtcblxuXHRcdHRoaXMuY2hlY2tlZCA9ICEhdGhpcy5hY3Rpdml0eSAmJiB0aGlzLmNvbXBvc2l0ZUJhci5pc1Bpbm5lZCh0aGlzLmFjdGl2aXR5LmlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihjb250ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpZCA9IHRoaXMuYWN0aXZpdHkgPyB0aGlzLmFjdGl2aXR5LmlkIDogY29udGV4dDtcblxuXHRcdGlmICh0aGlzLmNvbXBvc2l0ZUJhci5pc1Bpbm5lZChpZCkpIHtcblx0XHRcdHRoaXMuY29tcG9zaXRlQmFyLnVucGluKGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIucGluKGlkKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBjb21wb3NpdGVCYXJBY3Rpb25JdGVtOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIGNvbXBvc2l0ZUJhcjogSUNvbXBvc2l0ZUJhclxuXHQpIHtcblx0XHRzdXBlcignc2hvdy50b2dnbGVDb21wb3NpdGVCYWRnZScsIGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0gPyBjb21wb3NpdGVCYXJBY3Rpb25JdGVtLm5hbWUgOiBsb2NhbGl6ZSgndG9nZ2xlQmFkZ2UnLCBcIlRvZ2dsZSBWaWV3IEJhZGdlXCIpKTtcblxuXHRcdHRoaXMuY2hlY2tlZCA9IGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtID8gdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkIDogY29udGV4dDtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhci50b2dnbGVCYWRnZUVuYWJsZW1lbnQoaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTd2l0Y2hDb21wb3NpdGVWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb2Zmc2V0OiBudW1iZXJcblx0KSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNvbXBvc2l0ZSA9IHBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUodGhpcy5sb2NhdGlvbik7XG5cdFx0aWYgKCFhY3RpdmVDb21wb3NpdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdGFyZ2V0Q29tcG9zaXRlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHZpc2libGVDb21wb3NpdGVJZHMgPSBwYW5lQ29tcG9zaXRlU2VydmljZS5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcyh0aGlzLmxvY2F0aW9uKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpc2libGVDb21wb3NpdGVJZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh2aXNpYmxlQ29tcG9zaXRlSWRzW2ldID09PSBhY3RpdmVDb21wb3NpdGUuZ2V0SWQoKSkge1xuXHRcdFx0XHR0YXJnZXRDb21wb3NpdGVJZCA9IHZpc2libGVDb21wb3NpdGVJZHNbKGkgKyB2aXNpYmxlQ29tcG9zaXRlSWRzLmxlbmd0aCArIHRoaXMub2Zmc2V0KSAlIHZpc2libGVDb21wb3NpdGVJZHMubGVuZ3RoXTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0YXJnZXRDb21wb3NpdGVJZCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGF3YWl0IHBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKHRhcmdldENvbXBvc2l0ZUlkLCB0aGlzLmxvY2F0aW9uLCB0cnVlKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxRQUFpQixpQkFBaUI7QUFDM0MsU0FBUyxHQUFHLHVCQUF1QixRQUFRLFdBQVcsYUFBYSxXQUFXLHdCQUF3QixNQUFNLFlBQVk7QUFDeEgsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjLGlCQUFpQix5QkFBeUI7QUFDakUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBa0M7QUFDM0MsU0FBUyxhQUFnQyxlQUFlLGlCQUFpQjtBQUN6RSxTQUFTLDZCQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLDhCQUErRCx3QkFBd0I7QUFFaEcsU0FBUywwQkFBa0Q7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsaUJBQWlCLGlCQUFpQixzQkFBc0I7QUFDakUsU0FBUyxlQUFnQztBQUV6QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGtCQUFrQjtBQWtEcEIsTUFBTSwyQkFBMkIsT0FBTztBQUFBLEVBVTlDLFlBQW9CLE1BQStCO0FBQ2xELFVBQU0sS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLFlBQVksS0FBSyxHQUFHLEdBQUcsSUFBSTtBQUR2QztBQVJwQixTQUFp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
