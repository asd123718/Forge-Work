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
import "./media/paneviewlet.css";
import * as nls from "../../../../nls.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { asCssVariable, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { after, append, $, trackFocus, EventType, addDisposableListener, Dimension, reset, isAncestorOfActiveElement, isActiveElement } from "../../../../base/browser/dom.js";
import { createCSSRule } from "../../../../base/browser/domStylesheets.js";
import { asCssValueWithDefault, asCSSUrl } from "../../../../base/browser/cssValue.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Action } from "../../../../base/common/actions.js";
import { ActionsOrientation, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Pane } from "../../../../base/browser/ui/splitview/paneview.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ViewContainerExtensions, IViewDescriptorService, ViewContainerLocation, defaultViewIcon, ViewContainerLocationToString } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { MenuId, Action2, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { AbstractProgressScope, ScopedProgressIndicator } from "../../../services/progress/browser/progressIndicator.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { URI } from "../../../../base/common/uri.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { FilterWidget } from "./viewFilter.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { defaultButtonStyles, defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { PANEL_BACKGROUND, PANEL_SECTION_DRAG_AND_DROP_BACKGROUND, PANEL_STICKY_SCROLL_BACKGROUND, PANEL_STICKY_SCROLL_BORDER, PANEL_STICKY_SCROLL_SHADOW, SIDE_BAR_BACKGROUND, SIDE_BAR_DRAG_AND_DROP_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BACKGROUND, SIDE_BAR_STICKY_SCROLL_BORDER, SIDE_BAR_STICKY_SCROLL_SHADOW } from "../../../common/theme.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ViewMenuActions } from "./viewMenuActions.js";
var ViewPaneShowActions = /* @__PURE__ */ ((ViewPaneShowActions2) => {
  ViewPaneShowActions2[ViewPaneShowActions2["Default"] = 0] = "Default";
  ViewPaneShowActions2[ViewPaneShowActions2["WhenExpanded"] = 1] = "WhenExpanded";
  ViewPaneShowActions2[ViewPaneShowActions2["Always"] = 2] = "Always";
  return ViewPaneShowActions2;
})(ViewPaneShowActions || {});
const VIEWPANE_FILTER_ACTION = new Action("viewpane.action.filter");
const viewPaneContainerExpandedIcon = registerIcon("view-pane-container-expanded", Codicon.chevronDown, nls.localize("viewPaneContainerExpandedIcon", "Icon for an expanded view pane container."));
const viewPaneContainerCollapsedIcon = registerIcon("view-pane-container-collapsed", Codicon.chevronRight, nls.localize("viewPaneContainerCollapsedIcon", "Icon for a collapsed view pane container."));
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
let ViewWelcomeController = class {
  constructor(container, delegate, instantiationService, openerService, contextKeyService, lifecycleService) {
    this.container = container;
    this.delegate = delegate;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.contextKeyService = contextKeyService;
    this.items = [];
    this._enabled = false;
    this._wide = false;
    this.disposables = new DisposableStore();
    this.enabledDisposables = this.disposables.add(new DisposableStore());
    this.renderDisposables = this.disposables.add(new DisposableStore());
    this.disposables.add(Event.runAndSubscribe(this.delegate.onDidChangeViewWelcomeState, () => this.onDidChangeViewWelcomeState()));
    this.disposables.add(lifecycleService.onWillShutdown(() => this.dispose()));
  }
  get enabled() {
    return this._enabled;
  }
  layout(height, width) {
    if (!this._enabled) {
      return;
    }
    this.element.style.height = `${height}px`;
    this.element.style.width = `${width}px`;
    this._wide = width > 640;
    this.element.classList.toggle("wide", this._wide);
    this.scrollableElement.scanDomNode();
  }
  focus() {
    if (!this._enabled) {
      return;
    }
    this.element.focus();
  }
  onDidChangeViewWelcomeState() {
    const enabled = this.delegate.shouldShowWelcome();
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    if (!enabled) {
      this.enabledDisposables.clear();
      return;
    }
    this.container.classList.add("welcome");
    const viewWelcomeContainer = append(this.container, $(".welcome-view"));
    this.element = $(".welcome-view-content", { tabIndex: 0, role: "region", "aria-label": nls.localize("welcomeViewAriaLabel", "Welcome") });
    if (this._wide) {
      this.element.classList.add("wide");
    }
    this.scrollableElement = new DomScrollableElement(this.element, { alwaysConsumeMouseWheel: true, horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Visible });
    append(viewWelcomeContainer, this.scrollableElement.getDomNode());
    this.enabledDisposables.add(toDisposable(() => {
      this.container.classList.remove("welcome");
      this.scrollableElement.dispose();
      viewWelcomeContainer.remove();
      this.scrollableElement = void 0;
      this.element = void 0;
    }));
    this.contextKeyService.onDidChangeContext(this.onDidChangeContext, this, this.enabledDisposables);
    Event.chain(viewsRegistry.onDidChangeViewWelcomeContent, ($2) => $2.filter((id) => id === this.delegate.id))(this.onDidChangeViewWelcomeContent, this, this.enabledDisposables);
    this.onDidChangeViewWelcomeContent();
  }
  onDidChangeViewWelcomeContent() {
    const descriptors = viewsRegistry.getViewWelcomeContent(this.delegate.id);
    this.items = [];
    for (const descriptor of descriptors) {
      if (descriptor.when === "default") {
        this.defaultItem = { descriptor, visible: true };
      } else {
        const visible = descriptor.when ? this.contextKeyService.contextMatchesRules(descriptor.when) : true;
        this.items.push({ descriptor, visible });
      }
    }
    this.render();
  }
  onDidChangeContext() {
    let didChange = false;
    for (const item of this.items) {
      if (!item.descriptor.when || item.descriptor.when === "default") {
        continue;
      }
      const visible = this.contextKeyService.contextMatchesRules(item.descriptor.when);
      if (item.visible === visible) {
        continue;
      }
      item.visible = visible;
      didChange = true;
    }
    if (didChange) {
      this.render();
    }
  }
  render() {
    this.renderDisposables.clear();
    this.element.textContent = "";
    const contents = this.getContentDescriptors();
    if (contents.length === 0) {
      this.container.classList.remove("welcome");
      this.scrollableElement.scanDomNode();
      return;
    }
    let buttonsCount = 0;
    for (const { content, precondition, renderSecondaryButtons } of contents) {
      const lines = content.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (!line) {
          continue;
        }
        const linkedText = parseLinkedText(line);
        if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== "string") {
          const node = linkedText.nodes[0];
          const buttonContainer = append(this.element, $(".button-container"));
          const button = new Button(buttonContainer, { title: node.title, supportIcons: true, secondary: !!(renderSecondaryButtons && buttonsCount > 0), ...defaultButtonStyles });
          button.label = node.label;
          button.onDidClick((_) => {
            this.openerService.open(node.href, { allowCommands: true });
          }, null, this.renderDisposables);
          this.renderDisposables.add(button);
          buttonsCount++;
          if (precondition) {
            const updateEnablement = () => button.enabled = this.contextKeyService.contextMatchesRules(precondition);
            updateEnablement();
            const keys = new Set(precondition.keys());
            const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(keys));
            onDidChangeContext(updateEnablement, null, this.renderDisposables);
          }
        } else {
          const p = append(this.element, $("p"));
          for (const node of linkedText.nodes) {
            if (typeof node === "string") {
              append(p, ...renderLabelWithIcons(node));
            } else {
              const link = this.renderDisposables.add(this.instantiationService.createInstance(Link, p, node, {}));
              if (precondition && node.href.startsWith("command:")) {
                const updateEnablement = () => link.enabled = this.contextKeyService.contextMatchesRules(precondition);
                updateEnablement();
                const keys = new Set(precondition.keys());
                const onDidChangeContext = Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(keys));
                onDidChangeContext(updateEnablement, null, this.renderDisposables);
              }
            }
          }
        }
      }
    }
    this.container.classList.add("welcome");
    this.scrollableElement.scanDomNode();
  }
  getContentDescriptors() {
    const visibleItems = this.items.filter((v) => v.visible);
    if (visibleItems.length === 0 && this.defaultItem) {
      return [this.defaultItem.descriptor];
    }
    return visibleItems.map((v) => v.descriptor);
  }
  dispose() {
    this.disposables.dispose();
  }
};
ViewWelcomeController = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, ILifecycleService)
], ViewWelcomeController);
let ViewPane = class extends Pane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewInformationService) {
    super({ ...options, ...{ orientation: viewDescriptorService.getViewLocationById(options.id) === ViewContainerLocation.Panel ? Orientation.HORIZONTAL : Orientation.VERTICAL } });
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.viewDescriptorService = viewDescriptorService;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.themeService = themeService;
    this.hoverService = hoverService;
    this.accessibleViewInformationService = accessibleViewInformationService;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onDidChangeBodyVisibility = this._register(new Emitter());
    this.onDidChangeBodyVisibility = this._onDidChangeBodyVisibility.event;
    this._onDidChangeTitleArea = this._register(new Emitter());
    this.onDidChangeTitleArea = this._onDidChangeTitleArea.event;
    this._onDidChangeViewWelcomeState = this._register(new Emitter());
    this.onDidChangeViewWelcomeState = this._onDidChangeViewWelcomeState.event;
    this._isVisible = false;
    this.headerActionViewItems = this._register(new DisposableMap());
    this.id = options.id;
    this._title = options.title;
    this._titleDescription = options.titleDescription;
    this._singleViewPaneContainerTitle = options.singleViewPaneContainerTitle;
    this.showActions = options.showActions ?? 0 /* Default */;
    this.scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
    this.scopedContextKeyService.createKey("view", this.id);
    const viewLocationKey = this.scopedContextKeyService.createKey("viewLocation", ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)));
    this._register(Event.filter(viewDescriptorService.onDidChangeLocation, (e) => e.views.some((view) => view.id === this.id))(() => viewLocationKey.set(ViewContainerLocationToString(viewDescriptorService.getViewLocationById(this.id)))));
    const childInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this.menuActions = this._register(childInstantiationService.createInstance(ViewMenuActions, options.titleMenuId ?? MenuId.ViewTitle, MenuId.ViewTitleContext, { shouldForwardArgs: !options.donotForwardArgs, renderShortTitle: true }, { primaryActionGroups: this.primaryActionGroups }));
    this._register(this.menuActions.onDidChange(() => this.updateActions()));
  }
  get title() {
    return this._title;
  }
  get titleDescription() {
    return this._titleDescription;
  }
  get singleViewPaneContainerTitle() {
    return this._singleViewPaneContainerTitle;
  }
  /**
   * Additional menu groups (beyond `navigation`) whose actions should be
   * rendered as primary (inline) actions in the title action bar. Separators
   * are rendered between groups in the primary actions. Subclasses can
   * override this to customize grouping in the title action bar.
   */
  get primaryActionGroups() {
    return void 0;
  }
  get headerVisible() {
    return super.headerVisible;
  }
  set headerVisible(visible) {
    super.headerVisible = visible;
    this.element.classList.toggle("merged-header", !visible);
  }
  setVisible(visible) {
    if (this._isVisible !== visible) {
      this._isVisible = visible;
      if (this.isExpanded()) {
        this._onDidChangeBodyVisibility.fire(visible);
      }
    }
  }
  isVisible() {
    return this._isVisible;
  }
  isBodyVisible() {
    return this._isVisible && this.isExpanded();
  }
  setExpanded(expanded) {
    const changed = super.setExpanded(expanded);
    if (changed) {
      this._onDidChangeBodyVisibility.fire(expanded);
    }
    this.updateTwistyIcon();
    return changed;
  }
  render() {
    super.render();
    const focusTracker = trackFocus(this.element);
    this._register(focusTracker);
    this._register(focusTracker.onDidFocus(() => this._onDidFocus.fire()));
    this._register(focusTracker.onDidBlur(() => this._onDidBlur.fire()));
  }
  renderHeader(container) {
    this.headerContainer = container;
    this.twistiesContainer = append(container, $(`.twisty-container${ThemeIcon.asCSSSelector(this.getTwistyIcon(this.isExpanded()))}`));
    this.renderHeaderTitle(container, this.title);
    const actions = append(container, $(".actions"));
    actions.classList.toggle("show-always", this.showActions === 2 /* Always */);
    actions.classList.toggle("show-expanded", this.showActions === 1 /* WhenExpanded */);
    this.toolbar = this.instantiationService.createInstance(WorkbenchToolBar, actions, {
      orientation: ActionsOrientation.HORIZONTAL,
      actionViewItemProvider: (action, options) => {
        const item = this.createActionViewItem(action, options);
        if (item) {
          this.headerActionViewItems.set(item.action.id, item);
        }
        return item;
      },
      ariaLabel: nls.localize("viewToolbarAriaLabel", "{0} actions", this.title),
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      renderDropdownAsChildElement: true,
      actionRunner: this.getActionRunner(),
      resetMenu: this.menuActions.menuId
    });
    this._register(this.toolbar);
    this.setActions();
    this._register(addDisposableListener(actions, EventType.CLICK, (e) => e.preventDefault()));
    const viewContainerModel = this.viewDescriptorService.getViewContainerByViewId(this.id);
    if (viewContainerModel) {
      this._register(this.viewDescriptorService.getViewContainerModel(viewContainerModel).onDidChangeContainerInfo(({ title }) => this.updateTitle(this.title)));
    } else {
      console.error(`View container model not found for view ${this.id}`);
    }
    const onDidRelevantConfigurationChange = Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ViewPane.AlwaysShowActionsConfig));
    this._register(onDidRelevantConfigurationChange(this.updateActionsVisibility, this));
    this.updateActionsVisibility();
  }
  updateHeader() {
    super.updateHeader();
    this.updateTwistyIcon();
  }
  updateTwistyIcon() {
    if (this.twistiesContainer) {
      this.twistiesContainer.classList.remove(...ThemeIcon.asClassNameArray(this.getTwistyIcon(!this._expanded)));
      this.twistiesContainer.classList.add(...ThemeIcon.asClassNameArray(this.getTwistyIcon(this._expanded)));
    }
  }
  getTwistyIcon(expanded) {
    return expanded ? viewPaneContainerExpandedIcon : viewPaneContainerCollapsedIcon;
  }
  style(styles) {
    super.style(styles);
    const icon = this.getIcon();
    if (this.iconContainer) {
      const fgColor = asCssValueWithDefault(styles.headerForeground, asCssVariable(foreground));
      if (URI.isUri(icon)) {
        this.iconContainer.style.backgroundColor = fgColor;
        this.iconContainer.style.color = "";
      } else {
        this.iconContainer.style.color = fgColor;
        this.iconContainer.style.backgroundColor = "";
      }
    }
  }
  getIcon() {
    return this.viewDescriptorService.getViewDescriptorById(this.id)?.containerIcon || defaultViewIcon;
  }
  renderHeaderTitle(container, title) {
    this.iconContainer = append(container, $(".icon", void 0));
    const icon = this.getIcon();
    let cssClass = void 0;
    if (URI.isUri(icon)) {
      cssClass = `view-${this.id.replace(/[\.\:]/g, "-")}`;
      const iconClass = `.pane-header .icon.${cssClass}`;
      createCSSRule(iconClass, `
				mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				mask-size: 24px;
				-webkit-mask: ${asCSSUrl(icon)} no-repeat 50% 50%;
				-webkit-mask-size: 16px;
			`);
    } else if (ThemeIcon.isThemeIcon(icon)) {
      cssClass = ThemeIcon.asClassName(icon);
    }
    if (cssClass) {
      this.iconContainer.classList.add(...cssClass.split(" "));
    }
    const calculatedTitle = this.calculateTitle(title);
    this.titleContainer = append(container, $("h3.title", {}, calculatedTitle));
    this.titleContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.titleContainer, calculatedTitle));
    if (this._titleDescription) {
      this.setTitleDescription(this._titleDescription);
    }
    this.iconContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.iconContainer, calculatedTitle));
    this.iconContainer.setAttribute("aria-label", this._getAriaLabel(calculatedTitle, this._titleDescription));
  }
  _getAriaLabel(title, description) {
    const viewHasAccessibilityHelpContent = this.viewDescriptorService.getViewDescriptorById(this.id)?.accessibilityHelpContent;
    const accessibleViewHasShownForView = this.accessibleViewInformationService?.hasShownAccessibleView(this.id);
    if (!viewHasAccessibilityHelpContent || accessibleViewHasShownForView) {
      if (description) {
        return `${title} - ${description}`;
      } else {
        return title;
      }
    }
    return nls.localize("viewAccessibilityHelp", "Use Alt+F1 for accessibility help {0}", title);
  }
  updateTitle(title) {
    const calculatedTitle = this.calculateTitle(title);
    if (this.titleContainer) {
      this.titleContainer.textContent = calculatedTitle;
      this.titleContainerHover?.update(calculatedTitle);
    }
    this.updateAriaHeaderLabel(calculatedTitle, this._titleDescription);
    this._title = title;
    this._onDidChangeTitleArea.fire();
  }
  updateAriaHeaderLabel(title, description) {
    const ariaLabel = this._getAriaLabel(title, description);
    if (this.iconContainer) {
      this.iconContainerHover?.update(title);
      this.iconContainer.setAttribute("aria-label", ariaLabel);
    }
    this.ariaHeaderLabel = this.getAriaHeaderLabel(ariaLabel);
  }
  setTitleDescription(description) {
    if (this.titleDescriptionContainer) {
      this.titleDescriptionContainer.textContent = description ?? "";
      this.titleDescriptionContainerHover?.update(description ?? "");
    } else if (description && this.titleContainer) {
      this.titleDescriptionContainer = after(this.titleContainer, $("span.description", {}, description));
      this.titleDescriptionContainerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.titleDescriptionContainer, description));
    }
  }
  updateTitleDescription(description) {
    this.setTitleDescription(description);
    this.updateAriaHeaderLabel(this._title, description);
    this._titleDescription = description;
    this._onDidChangeTitleArea.fire();
  }
  calculateTitle(title) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(this.id);
    const model = this.viewDescriptorService.getViewContainerModel(viewContainer);
    const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(this.id);
    const isDefault = this.viewDescriptorService.getDefaultContainerById(this.id) === viewContainer;
    if (!isDefault && viewDescriptor?.containerTitle && model.title !== viewDescriptor.containerTitle && title !== viewDescriptor.containerTitle) {
      return `${viewDescriptor.containerTitle}: ${title}`;
    }
    return title;
  }
  renderBody(container) {
    this.viewWelcomeController = this._register(this.instantiationService.createInstance(ViewWelcomeController, container, this));
  }
  layoutBody(height, width) {
    this.viewWelcomeController?.layout(height, width);
  }
  onDidScrollRoot() {
  }
  getProgressIndicator() {
    if (this.progressBar === void 0) {
      this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
      this.progressBar.hide();
    }
    if (this.progressIndicator === void 0) {
      const that = this;
      this.progressIndicator = this._register(new ScopedProgressIndicator(assertReturnsDefined(this.progressBar), this._register(new class extends AbstractProgressScope {
        constructor() {
          super(that.id, that.isBodyVisible());
          this._register(that.onDidChangeBodyVisibility((isVisible) => isVisible ? this.onScopeOpened(that.id) : this.onScopeClosed(that.id)));
        }
      }())));
    }
    return this.progressIndicator;
  }
  getProgressLocation() {
    return this.viewDescriptorService.getViewContainerByViewId(this.id).id;
  }
  getLocationBasedColors() {
    return getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id));
  }
  focus() {
    if (this.viewWelcomeController?.enabled) {
      this.viewWelcomeController.focus();
    } else if (this.element) {
      this.element.focus();
    }
    if (isActiveElement(this.element) || isAncestorOfActiveElement(this.element)) {
      this._onDidFocus.fire();
    }
  }
  setActions() {
    if (this.toolbar) {
      const primaryActions = [...this.menuActions.getPrimaryActions()];
      if (this.shouldShowFilterInHeader()) {
        primaryActions.unshift(VIEWPANE_FILTER_ACTION);
      }
      this.toolbar.setActions(prepareActions(primaryActions), prepareActions(this.menuActions.getSecondaryActions()));
      this.toolbar.context = this.getActionsContext();
    }
  }
  updateActionsVisibility() {
    if (!this.headerContainer) {
      return;
    }
    const shouldAlwaysShowActions = this.configurationService.getValue("workbench.view.alwaysShowHeaderActions");
    this.headerContainer.classList.toggle("actions-always-visible", shouldAlwaysShowActions);
  }
  updateActions() {
    this.setActions();
    this._onDidChangeTitleArea.fire();
  }
  createActionViewItem(action, options) {
    if (action.id === VIEWPANE_FILTER_ACTION.id) {
      const that = this;
      return new class extends BaseActionViewItem {
        constructor() {
          super(null, action);
        }
        setFocusable() {
        }
        get trapsArrowNavigation() {
          return true;
        }
        render(container) {
          container.classList.add("viewpane-filter-container");
          const filter = that.getFilterWidget();
          append(container, filter.element);
          filter.relayout();
        }
      }();
    }
    return createActionViewItem(this.instantiationService, action, { ...options, ...{ menuAsChild: action instanceof SubmenuItemAction } });
  }
  getActionsContext() {
    return void 0;
  }
  getActionRunner() {
    return void 0;
  }
  getOptimalWidth() {
    return 0;
  }
  saveState() {
  }
  shouldShowWelcome() {
    return false;
  }
  getFilterWidget() {
    return void 0;
  }
  shouldShowFilterInHeader() {
    return false;
  }
};
ViewPane.AlwaysShowActionsConfig = "workbench.view.alwaysShowHeaderActions";
ViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService)
], ViewPane);
let FilterViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
    const childInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this.filterWidget = this._register(childInstantiationService.createInstance(FilterWidget, options.filterOptions));
    this._register(this.filterWidget.onDidAcceptFilterText(() => this.focusBodyContent()));
  }
  getFilterWidget() {
    return this.filterWidget;
  }
  renderBody(container) {
    super.renderBody(container);
    this.filterContainer = append(container, $(".viewpane-filter-container"));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.dimension = new Dimension(width, height);
    const wasFilterShownInHeader = !this.filterContainer?.hasChildNodes();
    const shouldShowFilterInHeader = this.shouldShowFilterInHeader();
    if (wasFilterShownInHeader !== shouldShowFilterInHeader) {
      if (shouldShowFilterInHeader) {
        reset(this.filterContainer);
      }
      this.updateActions();
      if (!shouldShowFilterInHeader) {
        append(this.filterContainer, this.filterWidget.element);
      }
    }
    if (!shouldShowFilterInHeader) {
      height = height - 44;
    }
    this.filterWidget.layout(width);
    this.layoutBodyContent(height, width);
  }
  shouldShowFilterInHeader() {
    return !(this.dimension && this.dimension.width < 600 && this.dimension.height > 100);
  }
  focusBodyContent() {
    this.focus();
  }
};
FilterViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService)
], FilterViewPane);
function getLocationBasedViewColors(location) {
  let background, overlayBackground, stickyScrollBackground, stickyScrollBorder, stickyScrollShadow;
  switch (location) {
    case ViewContainerLocation.Panel:
      background = PANEL_BACKGROUND;
      overlayBackground = PANEL_SECTION_DRAG_AND_DROP_BACKGROUND;
      stickyScrollBackground = PANEL_STICKY_SCROLL_BACKGROUND;
      stickyScrollBorder = PANEL_STICKY_SCROLL_BORDER;
      stickyScrollShadow = PANEL_STICKY_SCROLL_SHADOW;
      break;
    case ViewContainerLocation.Sidebar:
    case ViewContainerLocation.AuxiliaryBar:
    default:
      background = SIDE_BAR_BACKGROUND;
      overlayBackground = SIDE_BAR_DRAG_AND_DROP_BACKGROUND;
      stickyScrollBackground = SIDE_BAR_STICKY_SCROLL_BACKGROUND;
      stickyScrollBorder = SIDE_BAR_STICKY_SCROLL_BORDER;
      stickyScrollShadow = SIDE_BAR_STICKY_SCROLL_SHADOW;
  }
  return {
    background,
    overlayBackground,
    listOverrideStyles: {
      listBackground: background,
      treeStickyScrollBackground: stickyScrollBackground,
      treeStickyScrollBorder: stickyScrollBorder,
      treeStickyScrollShadow: stickyScrollShadow
    }
  };
}
class ViewAction extends Action2 {
  constructor(desc) {
    super(desc);
    this.desc = desc;
  }
  run(accessor, ...args) {
    const view = accessor.get(IViewsService).getActiveViewWithId(this.desc.viewId);
    if (view) {
      return this.runInView(accessor, view, ...args);
    }
    return void 0;
  }
}
export {
  FilterViewPane,
  VIEWPANE_FILTER_ACTION,
  ViewAction,
  ViewPane,
  ViewPaneShowActions,
  getLocationBasedViewColors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFx2aWV3c1xcdmlld1BhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvcGFuZXZpZXdsZXQuY3NzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBmb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYWZ0ZXIsIGFwcGVuZCwgJCwgdHJhY2tGb2N1cywgRXZlbnRUeXBlLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIERpbWVuc2lvbiwgcmVzZXQsIGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQsIGlzQWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlQ1NTUnVsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQsIGFzQ1NTVXJsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uc09yaWVudGF0aW9uLCBJQWN0aW9uVmlld0l0ZW0sIHByZXBhcmVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVBhbmVPcHRpb25zLCBQYW5lLCBJUGFuZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvcGFuZXZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBJVmlldywgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld3NSZWdpc3RyeSwgSVZpZXdDb250ZW50RGVzY3JpcHRvciwgZGVmYXVsdFZpZXdJY29uLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkLCBQYXJ0aWFsRXhjZXB0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2Jyb3dzZXIvbGluay5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQcm9ncmVzc1Njb3BlLCBTY29wZWRQcm9ncmVzc0luZGljYXRvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Byb2dyZXNzL2Jyb3dzZXIvcHJvZ3Jlc3NJbmRpY2F0b3IuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzSW5kaWNhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJXaWRnZXQsIElGaWx0ZXJXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi92aWV3RmlsdGVyLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdFByb2dyZXNzQmFyU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5ELCBQQU5FTF9TRUNUSU9OX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCwgUEFORUxfU1RJQ0tZX1NDUk9MTF9CQUNLR1JPVU5ELCBQQU5FTF9TVElDS1lfU0NST0xMX0JPUkRFUiwgUEFORUxfU1RJQ0tZX1NDUk9MTF9TSEFET1csIFNJREVfQkFSX0JBQ0tHUk9VTkQsIFNJREVfQkFSX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCwgU0lERV9CQVJfU1RJQ0tZX1NDUk9MTF9CQUNLR1JPVU5ELCBTSURFX0JBUl9TVElDS1lfU0NST0xMX0JPUkRFUiwgU0lERV9CQVJfU1RJQ0tZX1NDUk9MTF9TSEFET1cgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgVmlld01lbnVBY3Rpb25zIH0gZnJvbSAnLi92aWV3TWVudUFjdGlvbnMuanMnO1xuXG5leHBvcnQgZW51bSBWaWV3UGFuZVNob3dBY3Rpb25zIHtcblx0LyoqIFNob3cgdGhlIGFjdGlvbnMgd2hlbiB0aGUgdmlldyBpcyBob3ZlcmVkLiBUaGlzIGlzIHRoZSBkZWZhdWx0IGJlaGF2aW9yLiAqL1xuXHREZWZhdWx0LFxuXG5cdC8qKiBBbHdheXMgc2hvd3MgdGhlIGFjdGlvbnMgd2hlbiB0aGUgdmlldyBpcyBleHBhbmRlZCAqL1xuXHRXaGVuRXhwYW5kZWQsXG5cblx0LyoqIEFsd2F5cyBzaG93cyB0aGUgYWN0aW9ucyAqL1xuXHRBbHdheXMsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpZXdQYW5lT3B0aW9ucyBleHRlbmRzIElQYW5lT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNob3dBY3Rpb25zPzogVmlld1BhbmVTaG93QWN0aW9ucztcblx0cmVhZG9ubHkgdGl0bGVNZW51SWQ/OiBNZW51SWQ7XG5cdHJlYWRvbmx5IGRvbm90Rm9yd2FyZEFyZ3M/OiBib29sZWFuO1xuXHQvLyBUaGUgdGl0bGUgb2YgdGhlIGNvbnRhaW5lciBwYW5lIHdoZW4gaXQgaXMgbWVyZ2VkIHdpdGggdGhlIHZpZXcgY29udGFpbmVyXG5cdHJlYWRvbmx5IHNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbHRlclZpZXdQYW5lT3B0aW9ucyBleHRlbmRzIElWaWV3UGFuZU9wdGlvbnMge1xuXHRmaWx0ZXJPcHRpb25zOiBJRmlsdGVyV2lkZ2V0T3B0aW9ucztcbn1cblxuZXhwb3J0IGNvbnN0IFZJRVdQQU5FX0ZJTFRFUl9BQ1RJT04gPSBuZXcgQWN0aW9uKCd2aWV3cGFuZS5hY3Rpb24uZmlsdGVyJyk7XG5cbmNvbnN0IHZpZXdQYW5lQ29udGFpbmVyRXhwYW5kZWRJY29uID0gcmVnaXN0ZXJJY29uKCd2aWV3LXBhbmUtY29udGFpbmVyLWV4cGFuZGVkJywgQ29kaWNvbi5jaGV2cm9uRG93biwgbmxzLmxvY2FsaXplKCd2aWV3UGFuZUNvbnRhaW5lckV4cGFuZGVkSWNvbicsICdJY29uIGZvciBhbiBleHBhbmRlZCB2aWV3IHBhbmUgY29udGFpbmVyLicpKTtcbmNvbnN0IHZpZXdQYW5lQ29udGFpbmVyQ29sbGFwc2VkSWNvbiA9IHJlZ2lzdGVySWNvbigndmlldy1wYW5lLWNvbnRhaW5lci1jb2xsYXBzZWQnLCBDb2RpY29uLmNoZXZyb25SaWdodCwgbmxzLmxvY2FsaXplKCd2aWV3UGFuZUNvbnRhaW5lckNvbGxhcHNlZEljb24nLCAnSWNvbiBmb3IgYSBjb2xsYXBzZWQgdmlldyBwYW5lIGNvbnRhaW5lci4nKSk7XG5cbmNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cbmludGVyZmFjZSBJSXRlbSB7XG5cdHJlYWRvbmx5IGRlc2NyaXB0b3I6IElWaWV3Q29udGVudERlc2NyaXB0b3I7XG5cdHZpc2libGU6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJVmlld1dlbGNvbWVEZWxlZ2F0ZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZTogRXZlbnQ8dm9pZD47XG5cdHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW47XG59XG5cbmNsYXNzIFZpZXdXZWxjb21lQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBkZWZhdWx0SXRlbTogSUl0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXRlbXM6IElJdGVtW10gPSBbXTtcblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2VuYWJsZWQ7IH1cblx0cHJpdmF0ZSBfZW5hYmxlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNjcm9sbGFibGVFbGVtZW50OiBEb21TY3JvbGxhYmxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2lkZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW5hYmxlZERpc3Bvc2FibGVzID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElWaWV3V2VsY29tZURlbGVnYXRlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcm90ZWN0ZWQgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmRlbGVnYXRlLm9uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZSwgKCkgPT4gdGhpcy5vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUoKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4gdGhpcy5kaXNwb3NlKCkpKTsgLy8gRml4ZXMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwODg3OFxuXHR9XG5cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKSB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50IS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMuZWxlbWVudCEuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0dGhpcy5fd2lkZSA9IHdpZHRoID4gNjQwO1xuXHRcdHRoaXMuZWxlbWVudCEuY2xhc3NMaXN0LnRvZ2dsZSgnd2lkZScsIHRoaXMuX3dpZGUpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQhLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQhLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5kZWxlZ2F0ZS5zaG91bGRTaG93V2VsY29tZSgpO1xuXG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQgPT09IGVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbmFibGVkID0gZW5hYmxlZDtcblxuXHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGVkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd3ZWxjb21lJyk7XG5cdFx0Y29uc3Qgdmlld1dlbGNvbWVDb250YWluZXIgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJy53ZWxjb21lLXZpZXcnKSk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLndlbGNvbWUtdmlldy1jb250ZW50JywgeyB0YWJJbmRleDogMCwgcm9sZTogJ3JlZ2lvbicsICdhcmlhLWxhYmVsJzogbmxzLmxvY2FsaXplKCd3ZWxjb21lVmlld0FyaWFMYWJlbCcsIFwiV2VsY29tZVwiKSB9KTtcblx0XHRpZiAodGhpcy5fd2lkZSkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dpZGUnKTtcblx0XHR9XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLmVsZW1lbnQsIHsgYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsIGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLCB2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlLCB9KTtcblx0XHRhcHBlbmQodmlld1dlbGNvbWVDb250YWluZXIsIHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnd2VsY29tZScpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCEuZGlzcG9zZSgpO1xuXHRcdFx0dmlld1dlbGNvbWVDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KHRoaXMub25EaWRDaGFuZ2VDb250ZXh0LCB0aGlzLCB0aGlzLmVuYWJsZWREaXNwb3NhYmxlcyk7XG5cdFx0RXZlbnQuY2hhaW4odmlld3NSZWdpc3RyeS5vbkRpZENoYW5nZVZpZXdXZWxjb21lQ29udGVudCwgJCA9PiAkLmZpbHRlcihpZCA9PiBpZCA9PT0gdGhpcy5kZWxlZ2F0ZS5pZCkpXG5cdFx0XHQodGhpcy5vbkRpZENoYW5nZVZpZXdXZWxjb21lQ29udGVudCwgdGhpcywgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VWaWV3V2VsY29tZUNvbnRlbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VWaWV3V2VsY29tZUNvbnRlbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvcnMgPSB2aWV3c1JlZ2lzdHJ5LmdldFZpZXdXZWxjb21lQ29udGVudCh0aGlzLmRlbGVnYXRlLmlkKTtcblxuXHRcdHRoaXMuaXRlbXMgPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZGVzY3JpcHRvciBvZiBkZXNjcmlwdG9ycykge1xuXHRcdFx0aWYgKGRlc2NyaXB0b3Iud2hlbiA9PT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHRcdHRoaXMuZGVmYXVsdEl0ZW0gPSB7IGRlc2NyaXB0b3IsIHZpc2libGU6IHRydWUgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHZpc2libGUgPSBkZXNjcmlwdG9yLndoZW4gPyB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZGVzY3JpcHRvci53aGVuKSA6IHRydWU7XG5cdFx0XHRcdHRoaXMuaXRlbXMucHVzaCh7IGRlc2NyaXB0b3IsIHZpc2libGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VDb250ZXh0KCk6IHZvaWQge1xuXHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLml0ZW1zKSB7XG5cdFx0XHRpZiAoIWl0ZW0uZGVzY3JpcHRvci53aGVuIHx8IGl0ZW0uZGVzY3JpcHRvci53aGVuID09PSAnZGVmYXVsdCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpc2libGUgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoaXRlbS5kZXNjcmlwdG9yLndoZW4pO1xuXG5cdFx0XHRpZiAoaXRlbS52aXNpYmxlID09PSB2aXNpYmxlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtLnZpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoZGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVsZW1lbnQhLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IHRoaXMuZ2V0Q29udGVudERlc2NyaXB0b3JzKCk7XG5cblx0XHRpZiAoY29udGVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCd3ZWxjb21lJyk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50IS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBidXR0b25zQ291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgeyBjb250ZW50LCBwcmVjb25kaXRpb24sIHJlbmRlclNlY29uZGFyeUJ1dHRvbnMgfSBvZiBjb250ZW50cykge1xuXHRcdFx0Y29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcblxuXHRcdFx0Zm9yIChsZXQgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0XHRsaW5lID0gbGluZS50cmltKCk7XG5cblx0XHRcdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsaW5rZWRUZXh0ID0gcGFyc2VMaW5rZWRUZXh0KGxpbmUpO1xuXG5cdFx0XHRcdGlmIChsaW5rZWRUZXh0Lm5vZGVzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgbGlua2VkVGV4dC5ub2Rlc1swXSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb25zdCBub2RlID0gbGlua2VkVGV4dC5ub2Rlc1swXTtcblx0XHRcdFx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50ISwgJCgnLmJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0XHRcdFx0Y29uc3QgYnV0dG9uID0gbmV3IEJ1dHRvbihidXR0b25Db250YWluZXIsIHsgdGl0bGU6IG5vZGUudGl0bGUsIHN1cHBvcnRJY29uczogdHJ1ZSwgc2Vjb25kYXJ5OiAhIShyZW5kZXJTZWNvbmRhcnlCdXR0b25zICYmIGJ1dHRvbnNDb3VudCA+IDApLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCB9KTtcblx0XHRcdFx0XHRidXR0b24ubGFiZWwgPSBub2RlLmxhYmVsO1xuXHRcdFx0XHRcdGJ1dHRvbi5vbkRpZENsaWNrKF8gPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obm9kZS5ocmVmLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0fSwgbnVsbCwgdGhpcy5yZW5kZXJEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYnV0dG9uKTtcblx0XHRcdFx0XHRidXR0b25zQ291bnQrKztcblxuXHRcdFx0XHRcdGlmIChwcmVjb25kaXRpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZUVuYWJsZW1lbnQgPSAoKSA9PiBidXR0b24uZW5hYmxlZCA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhwcmVjb25kaXRpb24pO1xuXHRcdFx0XHRcdFx0dXBkYXRlRW5hYmxlbWVudCgpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBrZXlzID0gbmV3IFNldChwcmVjb25kaXRpb24ua2V5cygpKTtcblx0XHRcdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ29udGV4dCA9IEV2ZW50LmZpbHRlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCwgZSA9PiBlLmFmZmVjdHNTb21lKGtleXMpKTtcblx0XHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ29udGV4dCh1cGRhdGVFbmFibGVtZW50LCBudWxsLCB0aGlzLnJlbmRlckRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQhLCAkKCdwJykpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGxpbmtlZFRleHQubm9kZXMpIHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0YXBwZW5kKHAsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKG5vZGUpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmsgPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIHAsIG5vZGUsIHt9KSk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKHByZWNvbmRpdGlvbiAmJiBub2RlLmhyZWYuc3RhcnRzV2l0aCgnY29tbWFuZDonKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZUVuYWJsZW1lbnQgPSAoKSA9PiBsaW5rLmVuYWJsZWQgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMocHJlY29uZGl0aW9uKTtcblx0XHRcdFx0XHRcdFx0XHR1cGRhdGVFbmFibGVtZW50KCk7XG5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCBrZXlzID0gbmV3IFNldChwcmVjb25kaXRpb24ua2V5cygpKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZUNvbnRleHQgPSBFdmVudC5maWx0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsIGUgPT4gZS5hZmZlY3RzU29tZShrZXlzKSk7XG5cdFx0XHRcdFx0XHRcdFx0b25EaWRDaGFuZ2VDb250ZXh0KHVwZGF0ZUVuYWJsZW1lbnQsIG51bGwsIHRoaXMucmVuZGVyRGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnd2VsY29tZScpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQhLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRlbnREZXNjcmlwdG9ycygpOiBJVmlld0NvbnRlbnREZXNjcmlwdG9yW10ge1xuXHRcdGNvbnN0IHZpc2libGVJdGVtcyA9IHRoaXMuaXRlbXMuZmlsdGVyKHYgPT4gdi52aXNpYmxlKTtcblxuXHRcdGlmICh2aXNpYmxlSXRlbXMubGVuZ3RoID09PSAwICYmIHRoaXMuZGVmYXVsdEl0ZW0pIHtcblx0XHRcdHJldHVybiBbdGhpcy5kZWZhdWx0SXRlbS5kZXNjcmlwdG9yXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlzaWJsZUl0ZW1zLm1hcCh2ID0+IHYuZGVzY3JpcHRvcik7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBWaWV3UGFuZSBleHRlbmRzIFBhbmUgaW1wbGVtZW50cyBJVmlldyB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQWx3YXlzU2hvd0FjdGlvbnNDb25maWcgPSAnd29ya2JlbmNoLnZpZXcuYWx3YXlzU2hvd0hlYWRlckFjdGlvbnMnO1xuXG5cdHByaXZhdGUgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQmx1ciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEJsdXI6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRCbHVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByb3RlY3RlZCBfb25EaWRDaGFuZ2VUaXRsZUFyZWEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUaXRsZUFyZWE6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VUaXRsZUFyZWEuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIF9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nO1xuXHRwdWJsaWMgZ2V0IHRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGl0bGVEZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IHRpdGxlRGVzY3JpcHRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGl0bGVEZXNjcmlwdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX3NpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU7XG5cdH1cblxuXHRyZWFkb25seSBtZW51QWN0aW9uczogVmlld01lbnVBY3Rpb25zO1xuXG5cdC8qKlxuXHQgKiBBZGRpdGlvbmFsIG1lbnUgZ3JvdXBzIChiZXlvbmQgYG5hdmlnYXRpb25gKSB3aG9zZSBhY3Rpb25zIHNob3VsZCBiZVxuXHQgKiByZW5kZXJlZCBhcyBwcmltYXJ5IChpbmxpbmUpIGFjdGlvbnMgaW4gdGhlIHRpdGxlIGFjdGlvbiBiYXIuIFNlcGFyYXRvcnNcblx0ICogYXJlIHJlbmRlcmVkIGJldHdlZW4gZ3JvdXBzIGluIHRoZSBwcmltYXJ5IGFjdGlvbnMuIFN1YmNsYXNzZXMgY2FuXG5cdCAqIG92ZXJyaWRlIHRoaXMgdG8gY3VzdG9taXplIGdyb3VwaW5nIGluIHRoZSB0aXRsZSBhY3Rpb24gYmFyLlxuXHQgKi9cblx0cHJvdGVjdGVkIGdldCBwcmltYXJ5QWN0aW9uR3JvdXBzKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBwcm9ncmVzc0Jhcj86IFByb2dyZXNzQmFyO1xuXHRwcml2YXRlIHByb2dyZXNzSW5kaWNhdG9yPzogSVByb2dyZXNzSW5kaWNhdG9yO1xuXG5cdHByaXZhdGUgdG9vbGJhcj86IFdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2hvd0FjdGlvbnM6IFZpZXdQYW5lU2hvd0FjdGlvbnM7XG5cdHByaXZhdGUgaGVhZGVyQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGl0bGVDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0aXRsZUNvbnRhaW5lckhvdmVyPzogSU1hbmFnZWRIb3Zlcjtcblx0cHJpdmF0ZSB0aXRsZURlc2NyaXB0aW9uQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lckhvdmVyPzogSU1hbmFnZWRIb3Zlcjtcblx0cHJpdmF0ZSBpY29uQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgaWNvbkNvbnRhaW5lckhvdmVyPzogSU1hbmFnZWRIb3Zlcjtcblx0cHJvdGVjdGVkIHR3aXN0aWVzQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdmlld1dlbGNvbWVDb250cm9sbGVyPzogVmlld1dlbGNvbWVDb250cm9sbGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGVhZGVyQWN0aW9uVmlld0l0ZW1zOiBEaXNwb3NhYmxlTWFwPHN0cmluZywgSUFjdGlvblZpZXdJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwKCkpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBzY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcm90ZWN0ZWQgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcm90ZWN0ZWQgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcm90ZWN0ZWQgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByb3RlY3RlZCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcm90ZWN0ZWQgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlPzogSUFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHsgLi4ub3B0aW9ucywgLi4ueyBvcmllbnRhdGlvbjogdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQob3B0aW9ucy5pZCkgPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTCB9IH0pO1xuXG5cdFx0dGhpcy5pZCA9IG9wdGlvbnMuaWQ7XG5cdFx0dGhpcy5fdGl0bGUgPSBvcHRpb25zLnRpdGxlO1xuXHRcdHRoaXMuX3RpdGxlRGVzY3JpcHRpb24gPSBvcHRpb25zLnRpdGxlRGVzY3JpcHRpb247XG5cdFx0dGhpcy5fc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZSA9IG9wdGlvbnMuc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZTtcblx0XHR0aGlzLnNob3dBY3Rpb25zID0gb3B0aW9ucy5zaG93QWN0aW9ucyA/PyBWaWV3UGFuZVNob3dBY3Rpb25zLkRlZmF1bHQ7XG5cblx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCd2aWV3JywgdGhpcy5pZCk7XG5cdFx0Y29uc3Qgdmlld0xvY2F0aW9uS2V5ID0gdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ3ZpZXdMb2NhdGlvbicsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpISkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih2aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VMb2NhdGlvbiwgZSA9PiBlLnZpZXdzLnNvbWUodmlldyA9PiB2aWV3LmlkID09PSB0aGlzLmlkKSkoKCkgPT4gdmlld0xvY2F0aW9uS2V5LnNldChWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyh2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSEpKSkpO1xuXG5cdFx0Y29uc3QgY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMubWVudUFjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihjaGlsZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXdNZW51QWN0aW9ucywgb3B0aW9ucy50aXRsZU1lbnVJZCA/PyBNZW51SWQuVmlld1RpdGxlLCBNZW51SWQuVmlld1RpdGxlQ29udGV4dCwgeyBzaG91bGRGb3J3YXJkQXJnczogIW9wdGlvbnMuZG9ub3RGb3J3YXJkQXJncywgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9LCB7IHByaW1hcnlBY3Rpb25Hcm91cHM6IHRoaXMucHJpbWFyeUFjdGlvbkdyb3VwcyB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51QWN0aW9ucy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZUFjdGlvbnMoKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGhlYWRlclZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHN1cGVyLmhlYWRlclZpc2libGU7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgaGVhZGVyVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0c3VwZXIuaGVhZGVyVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ21lcmdlZC1oZWFkZXInLCAhdmlzaWJsZSk7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNWaXNpYmxlICE9PSB2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9pc1Zpc2libGUgPSB2aXNpYmxlO1xuXG5cdFx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eS5maXJlKHZpc2libGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNWaXNpYmxlO1xuXHR9XG5cblx0aXNCb2R5VmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNWaXNpYmxlICYmIHRoaXMuaXNFeHBhbmRlZCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0RXhwYW5kZWQoZXhwYW5kZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VkID0gc3VwZXIuc2V0RXhwYW5kZWQoZXhwYW5kZWQpO1xuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5LmZpcmUoZXhwYW5kZWQpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVR3aXN0eUljb24oKTtcblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoKTtcblxuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHRyYWNrRm9jdXModGhpcy5lbGVtZW50KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLl9vbkRpZEJsdXIuZmlyZSgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVySGVhZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblxuXHRcdHRoaXMudHdpc3RpZXNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKGAudHdpc3R5LWNvbnRhaW5lciR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IodGhpcy5nZXRUd2lzdHlJY29uKHRoaXMuaXNFeHBhbmRlZCgpKSl9YCkpO1xuXG5cdFx0dGhpcy5yZW5kZXJIZWFkZXJUaXRsZShjb250YWluZXIsIHRoaXMudGl0bGUpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGFwcGVuZChjb250YWluZXIsICQoJy5hY3Rpb25zJykpO1xuXHRcdGFjdGlvbnMuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy1hbHdheXMnLCB0aGlzLnNob3dBY3Rpb25zID09PSBWaWV3UGFuZVNob3dBY3Rpb25zLkFsd2F5cyk7XG5cdFx0YWN0aW9ucy5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWV4cGFuZGVkJywgdGhpcy5zaG93QWN0aW9ucyA9PT0gVmlld1BhbmVTaG93QWN0aW9ucy5XaGVuRXhwYW5kZWQpO1xuXHRcdHRoaXMudG9vbGJhciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgYWN0aW9ucywge1xuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5jcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRcdHRoaXMuaGVhZGVyQWN0aW9uVmlld0l0ZW1zLnNldChpdGVtLmFjdGlvbi5pZCwgaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHR9LFxuXHRcdFx0YXJpYUxhYmVsOiBubHMubG9jYWxpemUoJ3ZpZXdUb29sYmFyQXJpYUxhYmVsJywgXCJ7MH0gYWN0aW9uc1wiLCB0aGlzLnRpdGxlKSxcblx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSxcblx0XHRcdHJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQ6IHRydWUsXG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuZ2V0QWN0aW9uUnVubmVyKCksXG5cdFx0XHRyZXNldE1lbnU6IHRoaXMubWVudUFjdGlvbnMubWVudUlkXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvb2xiYXIpO1xuXHRcdHRoaXMuc2V0QWN0aW9ucygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFjdGlvbnMsIEV2ZW50VHlwZS5DTElDSywgZSA9PiBlLnByZXZlbnREZWZhdWx0KCkpKTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXJNb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh0aGlzLmlkKTtcblx0XHRpZiAodmlld0NvbnRhaW5lck1vZGVsKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lck1vZGVsKS5vbkRpZENoYW5nZUNvbnRhaW5lckluZm8oKHsgdGl0bGUgfSkgPT4gdGhpcy51cGRhdGVUaXRsZSh0aGlzLnRpdGxlKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGBWaWV3IGNvbnRhaW5lciBtb2RlbCBub3QgZm91bmQgZm9yIHZpZXcgJHt0aGlzLmlkfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRGlkUmVsZXZhbnRDb25maWd1cmF0aW9uQ2hhbmdlID0gRXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVmlld1BhbmUuQWx3YXlzU2hvd0FjdGlvbnNDb25maWcpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFJlbGV2YW50Q29uZmlndXJhdGlvbkNoYW5nZSh0aGlzLnVwZGF0ZUFjdGlvbnNWaXNpYmlsaXR5LCB0aGlzKSk7XG5cdFx0dGhpcy51cGRhdGVBY3Rpb25zVmlzaWJpbGl0eSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUhlYWRlcigpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVIZWFkZXIoKTtcblx0XHR0aGlzLnVwZGF0ZVR3aXN0eUljb24oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVHdpc3R5SWNvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50d2lzdGllc0NvbnRhaW5lcikge1xuXHRcdFx0dGhpcy50d2lzdGllc0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuZ2V0VHdpc3R5SWNvbighdGhpcy5fZXhwYW5kZWQpKSk7XG5cdFx0XHR0aGlzLnR3aXN0aWVzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy5nZXRUd2lzdHlJY29uKHRoaXMuX2V4cGFuZGVkKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUd2lzdHlJY29uKGV4cGFuZGVkOiBib29sZWFuKTogVGhlbWVJY29uIHtcblx0XHRyZXR1cm4gZXhwYW5kZWQgPyB2aWV3UGFuZUNvbnRhaW5lckV4cGFuZGVkSWNvbiA6IHZpZXdQYW5lQ29udGFpbmVyQ29sbGFwc2VkSWNvbjtcblx0fVxuXG5cdG92ZXJyaWRlIHN0eWxlKHN0eWxlczogSVBhbmVTdHlsZXMpOiB2b2lkIHtcblx0XHRzdXBlci5zdHlsZShzdHlsZXMpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuZ2V0SWNvbigpO1xuXHRcdGlmICh0aGlzLmljb25Db250YWluZXIpIHtcblx0XHRcdGNvbnN0IGZnQ29sb3IgPSBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoc3R5bGVzLmhlYWRlckZvcmVncm91bmQsIGFzQ3NzVmFyaWFibGUoZm9yZWdyb3VuZCkpO1xuXHRcdFx0aWYgKFVSSS5pc1VyaShpY29uKSkge1xuXHRcdFx0XHQvLyBBcHBseSBiYWNrZ3JvdW5kIGNvbG9yIHRvIGFjdGl2aXR5IGJhciBpdGVtIHByb3ZpZGVkIHdpdGggaWNvblVybHNcblx0XHRcdFx0dGhpcy5pY29uQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGZnQ29sb3I7XG5cdFx0XHRcdHRoaXMuaWNvbkNvbnRhaW5lci5zdHlsZS5jb2xvciA9ICcnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQXBwbHkgZm9yZWdyb3VuZCBjb2xvciB0byBhY3Rpdml0eSBiYXIgaXRlbXMgcHJvdmlkZWQgd2l0aCBjb2RpY29uc1xuXHRcdFx0XHR0aGlzLmljb25Db250YWluZXIuc3R5bGUuY29sb3IgPSBmZ0NvbG9yO1xuXHRcdFx0XHR0aGlzLmljb25Db250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRJY29uKCk6IFRoZW1lSWNvbiB8IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZCh0aGlzLmlkKT8uY29udGFpbmVySWNvbiB8fCBkZWZhdWx0Vmlld0ljb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuaWNvbkNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5pY29uJywgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuZ2V0SWNvbigpO1xuXG5cdFx0bGV0IGNzc0NsYXNzOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKFVSSS5pc1VyaShpY29uKSkge1xuXHRcdFx0Y3NzQ2xhc3MgPSBgdmlldy0ke3RoaXMuaWQucmVwbGFjZSgvW1xcLlxcOl0vZywgJy0nKX1gO1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzID0gYC5wYW5lLWhlYWRlciAuaWNvbi4ke2Nzc0NsYXNzfWA7XG5cblx0XHRcdGNyZWF0ZUNTU1J1bGUoaWNvbkNsYXNzLCBgXG5cdFx0XHRcdG1hc2s6ICR7YXNDU1NVcmwoaWNvbil9IG5vLXJlcGVhdCA1MCUgNTAlO1xuXHRcdFx0XHRtYXNrLXNpemU6IDI0cHg7XG5cdFx0XHRcdC13ZWJraXQtbWFzazogJHthc0NTU1VybChpY29uKX0gbm8tcmVwZWF0IDUwJSA1MCU7XG5cdFx0XHRcdC13ZWJraXQtbWFzay1zaXplOiAxNnB4O1xuXHRcdFx0YCk7XG5cdFx0fSBlbHNlIGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbikpIHtcblx0XHRcdGNzc0NsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pO1xuXHRcdH1cblxuXHRcdGlmIChjc3NDbGFzcykge1xuXHRcdFx0dGhpcy5pY29uQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoLi4uY3NzQ2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FsY3VsYXRlZFRpdGxlID0gdGhpcy5jYWxjdWxhdGVUaXRsZSh0aXRsZSk7XG5cdFx0dGhpcy50aXRsZUNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJ2gzLnRpdGxlJywge30sIGNhbGN1bGF0ZWRUaXRsZSkpO1xuXHRcdHRoaXMudGl0bGVDb250YWluZXJIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLnRpdGxlQ29udGFpbmVyLCBjYWxjdWxhdGVkVGl0bGUpKTtcblxuXHRcdGlmICh0aGlzLl90aXRsZURlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlRGVzY3JpcHRpb24odGhpcy5fdGl0bGVEZXNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5pY29uQ29udGFpbmVySG92ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5pY29uQ29udGFpbmVyLCBjYWxjdWxhdGVkVGl0bGUpKTtcblx0XHR0aGlzLmljb25Db250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5fZ2V0QXJpYUxhYmVsKGNhbGN1bGF0ZWRUaXRsZSwgdGhpcy5fdGl0bGVEZXNjcmlwdGlvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXJpYUxhYmVsKHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHZpZXdIYXNBY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQodGhpcy5pZCk/LmFjY2Vzc2liaWxpdHlIZWxwQ29udGVudDtcblx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld0hhc1Nob3duRm9yVmlldyA9IHRoaXMuYWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2U/Lmhhc1Nob3duQWNjZXNzaWJsZVZpZXcodGhpcy5pZCk7XG5cdFx0aWYgKCF2aWV3SGFzQWNjZXNzaWJpbGl0eUhlbHBDb250ZW50IHx8IGFjY2Vzc2libGVWaWV3SGFzU2hvd25Gb3JWaWV3KSB7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGAke3RpdGxlfSAtICR7ZGVzY3JpcHRpb259YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0aXRsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCd2aWV3QWNjZXNzaWJpbGl0eUhlbHAnLCAnVXNlIEFsdCtGMSBmb3IgYWNjZXNzaWJpbGl0eSBoZWxwIHswfScsIHRpdGxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FsY3VsYXRlZFRpdGxlID0gdGhpcy5jYWxjdWxhdGVUaXRsZSh0aXRsZSk7XG5cdFx0aWYgKHRoaXMudGl0bGVDb250YWluZXIpIHtcblx0XHRcdHRoaXMudGl0bGVDb250YWluZXIudGV4dENvbnRlbnQgPSBjYWxjdWxhdGVkVGl0bGU7XG5cdFx0XHR0aGlzLnRpdGxlQ29udGFpbmVySG92ZXI/LnVwZGF0ZShjYWxjdWxhdGVkVGl0bGUpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlQXJpYUhlYWRlckxhYmVsKGNhbGN1bGF0ZWRUaXRsZSwgdGhpcy5fdGl0bGVEZXNjcmlwdGlvbik7XG5cblx0XHR0aGlzLl90aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGl0bGVBcmVhLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQXJpYUhlYWRlckxhYmVsKHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBhcmlhTGFiZWwgPSB0aGlzLl9nZXRBcmlhTGFiZWwodGl0bGUsIGRlc2NyaXB0aW9uKTtcblx0XHRpZiAodGhpcy5pY29uQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmljb25Db250YWluZXJIb3Zlcj8udXBkYXRlKHRpdGxlKTtcblx0XHRcdHRoaXMuaWNvbkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXHRcdH1cblx0XHR0aGlzLmFyaWFIZWFkZXJMYWJlbCA9IHRoaXMuZ2V0QXJpYUhlYWRlckxhYmVsKGFyaWFMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFRpdGxlRGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLnRpdGxlRGVzY3JpcHRpb25Db250YWluZXIpIHtcblx0XHRcdHRoaXMudGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lci50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uID8/ICcnO1xuXHRcdFx0dGhpcy50aXRsZURlc2NyaXB0aW9uQ29udGFpbmVySG92ZXI/LnVwZGF0ZShkZXNjcmlwdGlvbiA/PyAnJyk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKGRlc2NyaXB0aW9uICYmIHRoaXMudGl0bGVDb250YWluZXIpIHtcblx0XHRcdHRoaXMudGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lciA9IGFmdGVyKHRoaXMudGl0bGVDb250YWluZXIsICQoJ3NwYW4uZGVzY3JpcHRpb24nLCB7fSwgZGVzY3JpcHRpb24pKTtcblx0XHRcdHRoaXMudGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lckhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMudGl0bGVEZXNjcmlwdGlvbkNvbnRhaW5lciwgZGVzY3JpcHRpb24pKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlVGl0bGVEZXNjcmlwdGlvbihkZXNjcmlwdGlvbj86IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0VGl0bGVEZXNjcmlwdGlvbihkZXNjcmlwdGlvbik7XG5cdFx0dGhpcy51cGRhdGVBcmlhSGVhZGVyTGFiZWwodGhpcy5fdGl0bGUsIGRlc2NyaXB0aW9uKTtcblx0XHR0aGlzLl90aXRsZURlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUaXRsZUFyZWEuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVUaXRsZSh0aXRsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpITtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZCh0aGlzLmlkKTtcblx0XHRjb25zdCBpc0RlZmF1bHQgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Q29udGFpbmVyQnlJZCh0aGlzLmlkKSA9PT0gdmlld0NvbnRhaW5lcjtcblxuXHRcdGlmICghaXNEZWZhdWx0ICYmIHZpZXdEZXNjcmlwdG9yPy5jb250YWluZXJUaXRsZSAmJiBtb2RlbC50aXRsZSAhPT0gdmlld0Rlc2NyaXB0b3IuY29udGFpbmVyVGl0bGUgJiYgdGl0bGUgIT09IHZpZXdEZXNjcmlwdG9yLmNvbnRhaW5lclRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gYCR7dmlld0Rlc2NyaXB0b3IuY29udGFpbmVyVGl0bGV9OiAke3RpdGxlfWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRpdGxlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMudmlld1dlbGNvbWVDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3V2VsY29tZUNvbnRyb2xsZXIsIGNvbnRhaW5lciwgdGhpcykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdXZWxjb21lQ29udHJvbGxlcj8ubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0b25EaWRTY3JvbGxSb290KCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdGdldFByb2dyZXNzSW5kaWNhdG9yKCkge1xuXHRcdGlmICh0aGlzLnByb2dyZXNzQmFyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvZ3Jlc3NCYXIodGhpcy5lbGVtZW50LCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMpKTtcblx0XHRcdHRoaXMucHJvZ3Jlc3NCYXIuaGlkZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnByb2dyZXNzSW5kaWNhdG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5wcm9ncmVzc0luZGljYXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTY29wZWRQcm9ncmVzc0luZGljYXRvcihhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnByb2dyZXNzQmFyKSwgdGhpcy5fcmVnaXN0ZXIobmV3IGNsYXNzIGV4dGVuZHMgQWJzdHJhY3RQcm9ncmVzc1Njb3BlIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIodGhhdC5pZCwgdGhhdC5pc0JvZHlWaXNpYmxlKCkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoYXQub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eShpc1Zpc2libGUgPT4gaXNWaXNpYmxlID8gdGhpcy5vblNjb3BlT3BlbmVkKHRoYXQuaWQpIDogdGhpcy5vblNjb3BlQ2xvc2VkKHRoYXQuaWQpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucHJvZ3Jlc3NJbmRpY2F0b3I7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UHJvZ3Jlc3NMb2NhdGlvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodGhpcy5pZCkhLmlkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldExvY2F0aW9uQmFzZWRDb2xvcnMoKTogSVZpZXdQYW5lTG9jYXRpb25Db2xvcnMge1xuXHRcdHJldHVybiBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycyh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpZXdXZWxjb21lQ29udHJvbGxlcj8uZW5hYmxlZCkge1xuXHRcdFx0dGhpcy52aWV3V2VsY29tZUNvbnRyb2xsZXIuZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHRcdGlmIChpc0FjdGl2ZUVsZW1lbnQodGhpcy5lbGVtZW50KSB8fCBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0QWN0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50b29sYmFyKSB7XG5cdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9ucyA9IFsuLi50aGlzLm1lbnVBY3Rpb25zLmdldFByaW1hcnlBY3Rpb25zKCldO1xuXHRcdFx0aWYgKHRoaXMuc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKCkpIHtcblx0XHRcdFx0cHJpbWFyeUFjdGlvbnMudW5zaGlmdChWSUVXUEFORV9GSUxURVJfQUNUSU9OKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudG9vbGJhci5zZXRBY3Rpb25zKHByZXBhcmVBY3Rpb25zKHByaW1hcnlBY3Rpb25zKSwgcHJlcGFyZUFjdGlvbnModGhpcy5tZW51QWN0aW9ucy5nZXRTZWNvbmRhcnlBY3Rpb25zKCkpKTtcblx0XHRcdHRoaXMudG9vbGJhci5jb250ZXh0ID0gdGhpcy5nZXRBY3Rpb25zQ29udGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWN0aW9uc1Zpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhlYWRlckNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzaG91bGRBbHdheXNTaG93QWN0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC52aWV3LmFsd2F5c1Nob3dIZWFkZXJBY3Rpb25zJyk7XG5cdFx0dGhpcy5oZWFkZXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aW9ucy1hbHdheXMtdmlzaWJsZScsIHNob3VsZEFsd2F5c1Nob3dBY3Rpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVBY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0QWN0aW9ucygpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGl0bGVBcmVhLmZpcmUoKTtcblx0fVxuXG5cdGNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9ucz86IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChhY3Rpb24uaWQgPT09IFZJRVdQQU5FX0ZJTFRFUl9BQ1RJT04uaWQpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihudWxsLCBhY3Rpb24pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHNldEZvY3VzYWJsZSgpOiB2b2lkIHsgLyogbm9vcCBpbnB1dCBlbGVtZW50cyBhcmUgZm9jdXNhYmxlIGJ5IGRlZmF1bHQgKi8gfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgdHJhcHNBcnJvd05hdmlnYXRpb24oKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3ZpZXdwYW5lLWZpbHRlci1jb250YWluZXInKTtcblx0XHRcdFx0XHRjb25zdCBmaWx0ZXIgPSB0aGF0LmdldEZpbHRlcldpZGdldCgpITtcblx0XHRcdFx0XHRhcHBlbmQoY29udGFpbmVyLCBmaWx0ZXIuZWxlbWVudCk7XG5cdFx0XHRcdFx0ZmlsdGVyLnJlbGF5b3V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgLi4ueyBtZW51QXNDaGlsZDogYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24gfSB9KTtcblx0fVxuXG5cdGdldEFjdGlvbnNDb250ZXh0KCk6IHVua25vd24ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRBY3Rpb25SdW5uZXIoKTogSUFjdGlvblJ1bm5lciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldE9wdGltYWxXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0c2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdC8vIFN1YmNsYXNzZXMgdG8gaW1wbGVtZW50IGZvciBzYXZpbmcgc3RhdGVcblx0fVxuXG5cdHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldEZpbHRlcldpZGdldCgpOiBGaWx0ZXJXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzaG91bGRTaG93RmlsdGVySW5IZWFkZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBGaWx0ZXJWaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRyZWFkb25seSBmaWx0ZXJXaWRnZXQ6IEZpbHRlcldpZGdldDtcblx0cHJpdmF0ZSBkaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIGZpbHRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSUZpbHRlclZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRhY2Nlc3NpYmxlVmlld1NlcnZpY2U/OiBJQWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGlsZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoY2hpbGRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWx0ZXJXaWRnZXQsIG9wdGlvbnMuZmlsdGVyT3B0aW9ucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyV2lkZ2V0Lm9uRGlkQWNjZXB0RmlsdGVyVGV4dCgoKSA9PiB0aGlzLmZvY3VzQm9keUNvbnRlbnQoKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0RmlsdGVyV2lkZ2V0KCk6IEZpbHRlcldpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsdGVyV2lkZ2V0O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHR0aGlzLmZpbHRlckNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy52aWV3cGFuZS1maWx0ZXItY29udGFpbmVyJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXG5cdFx0dGhpcy5kaW1lbnNpb24gPSBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdGNvbnN0IHdhc0ZpbHRlclNob3duSW5IZWFkZXIgPSAhdGhpcy5maWx0ZXJDb250YWluZXI/Lmhhc0NoaWxkTm9kZXMoKTtcblx0XHRjb25zdCBzaG91bGRTaG93RmlsdGVySW5IZWFkZXIgPSB0aGlzLnNob3VsZFNob3dGaWx0ZXJJbkhlYWRlcigpO1xuXHRcdGlmICh3YXNGaWx0ZXJTaG93bkluSGVhZGVyICE9PSBzaG91bGRTaG93RmlsdGVySW5IZWFkZXIpIHtcblx0XHRcdGlmIChzaG91bGRTaG93RmlsdGVySW5IZWFkZXIpIHtcblx0XHRcdFx0cmVzZXQodGhpcy5maWx0ZXJDb250YWluZXIhKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXHRcdFx0aWYgKCFzaG91bGRTaG93RmlsdGVySW5IZWFkZXIpIHtcblx0XHRcdFx0YXBwZW5kKHRoaXMuZmlsdGVyQ29udGFpbmVyISwgdGhpcy5maWx0ZXJXaWRnZXQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKSB7XG5cdFx0XHRoZWlnaHQgPSBoZWlnaHQgLSA0NDtcblx0XHR9XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQubGF5b3V0KHdpZHRoKTtcblx0XHR0aGlzLmxheW91dEJvZHlDb250ZW50KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkU2hvd0ZpbHRlckluSGVhZGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhKHRoaXMuZGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uLndpZHRoIDwgNjAwICYmIHRoaXMuZGltZW5zaW9uLmhlaWdodCA+IDEwMCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgbGF5b3V0Qm9keUNvbnRlbnQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBmb2N1c0JvZHlDb250ZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuZm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3UGFuZUxvY2F0aW9uQ29sb3JzIHtcblx0YmFja2dyb3VuZDogc3RyaW5nO1xuXHRvdmVybGF5QmFja2dyb3VuZDogc3RyaW5nO1xuXHRsaXN0T3ZlcnJpZGVTdHlsZXM6IFBhcnRpYWxFeGNlcHQ8SUxpc3RTdHlsZXMsICdsaXN0QmFja2dyb3VuZCcgfCAndHJlZVN0aWNreVNjcm9sbEJhY2tncm91bmQnPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvY2F0aW9uQmFzZWRWaWV3Q29sb3JzKGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfCBudWxsKTogSVZpZXdQYW5lTG9jYXRpb25Db2xvcnMge1xuXHRsZXQgYmFja2dyb3VuZCwgb3ZlcmxheUJhY2tncm91bmQsIHN0aWNreVNjcm9sbEJhY2tncm91bmQsIHN0aWNreVNjcm9sbEJvcmRlciwgc3RpY2t5U2Nyb2xsU2hhZG93O1xuXG5cdHN3aXRjaCAobG9jYXRpb24pIHtcblx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDpcblx0XHRcdGJhY2tncm91bmQgPSBQQU5FTF9CQUNLR1JPVU5EO1xuXHRcdFx0b3ZlcmxheUJhY2tncm91bmQgPSBQQU5FTF9TRUNUSU9OX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORDtcblx0XHRcdHN0aWNreVNjcm9sbEJhY2tncm91bmQgPSBQQU5FTF9TVElDS1lfU0NST0xMX0JBQ0tHUk9VTkQ7XG5cdFx0XHRzdGlja3lTY3JvbGxCb3JkZXIgPSBQQU5FTF9TVElDS1lfU0NST0xMX0JPUkRFUjtcblx0XHRcdHN0aWNreVNjcm9sbFNoYWRvdyA9IFBBTkVMX1NUSUNLWV9TQ1JPTExfU0hBRE9XO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyOlxuXHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjpcblx0XHRkZWZhdWx0OlxuXHRcdFx0YmFja2dyb3VuZCA9IFNJREVfQkFSX0JBQ0tHUk9VTkQ7XG5cdFx0XHRvdmVybGF5QmFja2dyb3VuZCA9IFNJREVfQkFSX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORDtcblx0XHRcdHN0aWNreVNjcm9sbEJhY2tncm91bmQgPSBTSURFX0JBUl9TVElDS1lfU0NST0xMX0JBQ0tHUk9VTkQ7XG5cdFx0XHRzdGlja3lTY3JvbGxCb3JkZXIgPSBTSURFX0JBUl9TVElDS1lfU0NST0xMX0JPUkRFUjtcblx0XHRcdHN0aWNreVNjcm9sbFNoYWRvdyA9IFNJREVfQkFSX1NUSUNLWV9TQ1JPTExfU0hBRE9XO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRiYWNrZ3JvdW5kLFxuXHRcdG92ZXJsYXlCYWNrZ3JvdW5kLFxuXHRcdGxpc3RPdmVycmlkZVN0eWxlczoge1xuXHRcdFx0bGlzdEJhY2tncm91bmQ6IGJhY2tncm91bmQsXG5cdFx0XHR0cmVlU3RpY2t5U2Nyb2xsQmFja2dyb3VuZDogc3RpY2t5U2Nyb2xsQmFja2dyb3VuZCxcblx0XHRcdHRyZWVTdGlja3lTY3JvbGxCb3JkZXI6IHN0aWNreVNjcm9sbEJvcmRlcixcblx0XHRcdHRyZWVTdGlja3lTY3JvbGxTaGFkb3c6IHN0aWNreVNjcm9sbFNoYWRvd1xuXHRcdH1cblx0fTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFZpZXdBY3Rpb248VCBleHRlbmRzIElWaWV3PiBleHRlbmRzIEFjdGlvbjIge1xuXHRvdmVycmlkZSByZWFkb25seSBkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+ICYgeyB2aWV3SWQ6IHN0cmluZyB9O1xuXHRjb25zdHJ1Y3RvcihkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+ICYgeyB2aWV3SWQ6IHN0cmluZyB9KSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdFx0dGhpcy5kZXNjID0gZGVzYztcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdW5rbm93biB7XG5cdFx0Y29uc3QgdmlldyA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5nZXRBY3RpdmVWaWV3V2l0aElkKHRoaXMuZGVzYy52aWV3SWQpO1xuXHRcdGlmICh2aWV3KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ydW5JblZpZXcoYWNjZXNzb3IsIDxUPnZpZXcsIC4uLmFyZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YWJzdHJhY3QgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBULCAuLi5hcmdzOiB1bmtub3duW10pOiB1bmtub3duO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsZUFBZSxrQkFBa0I7QUFDMUMsU0FBUyxPQUFPLFFBQVEsR0FBRyxZQUFZLFdBQVcsdUJBQXVCLFdBQVcsT0FBTywyQkFBMkIsdUJBQXVCO0FBQzdJLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCLGdCQUFnQjtBQUNoRCxTQUFTLGVBQWUsaUJBQWlCLG9CQUFvQjtBQUM3RCxTQUFTLGNBQXNDO0FBQy9DLFNBQVMsb0JBQXFDLHNCQUFzQjtBQUNwRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBC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QUFBQSxNQUM1QjtBQUNBLFdBQUssY0FBYztBQUNuQixVQUFJLENBQUMsMEJBQTBCO0FBQzlCLGVBQU8sS0FBSyxpQkFBa0IsS0FBSyxhQUFhLE9BQU87QUFBQSxNQUN4RDtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsMEJBQTBCO0FBQzlCLGVBQVMsU0FBUztBQUFBLElBQ25CO0FBQ0EsU0FBSyxhQUFhLE9BQU8sS0FBSztBQUM5QixTQUFLLGtCQUFrQixRQUFRLEtBQUs7QUFBQSxFQUNyQztBQUFBLEVBRVMsMkJBQW9DO0FBQzVDLFdBQU8sRUFBRSxLQUFLLGFBQWEsS0FBSyxVQUFVLFFBQVEsT0FBTyxLQUFLLFVBQVUsU0FBUztBQUFBLEVBQ2xGO0FBQUEsRUFJVSxtQkFBeUI7QUFDbEMsU0FBSyxNQUFNO0FBQUEsRUFDWjtBQUNEO0FBakVzQixpQkFBZjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEJtQjtBQXlFZixTQUFTLDJCQUEyQixVQUFpRTtBQUMzRyxNQUFJLFlBQVksbUJBQW1CLHdCQUF3QixvQkFBb0I7QUFFL0UsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSyxzQkFBc0I7QUFDMUIsbUJBQWE7QUFDYiwwQkFBb0I7QUFDcEIsK0JBQXlCO0FBQ3pCLDJCQUFxQjtBQUNyQiwyQkFBcUI7QUFDckI7QUFBQSxJQUVELEtBQUssc0JBQXNCO0FBQUEsSUFDM0IsS0FBSyxzQkFBc0I7QUFBQSxJQUMzQjtBQUNDLG1CQUFhO0FBQ2IsMEJBQW9CO0FBQ3BCLCtCQUF5QjtBQUN6QiwyQkFBcUI7QUFDckIsMkJBQXFCO0FBQUEsRUFDdkI7QUFFQSxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLG9CQUFvQjtBQUFBLE1BQ25CLGdCQUFnQjtBQUFBLE1BQ2hCLDRCQUE0QjtBQUFBLE1BQzVCLHdCQUF3QjtBQUFBLE1BQ3hCLHdCQUF3QjtBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBZSxtQkFBb0MsUUFBUTtBQUFBLEVBRWpFLFlBQVksTUFBc0Q7QUFDakUsVUFBTSxJQUFJO0FBQ1YsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxhQUErQixNQUEwQjtBQUM1RCxVQUFNLE9BQU8sU0FBUyxJQUFJLGFBQWEsRUFBRSxvQkFBb0IsS0FBSyxLQUFLLE1BQU07QUFDN0UsUUFBSSxNQUFNO0FBQ1QsYUFBTyxLQUFLLFVBQVUsVUFBYSxNQUFNLEdBQUcsSUFBSTtBQUFBLElBQ2pEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFHRDsiLAogICJuYW1lcyI6IFsiVmlld1BhbmVTaG93QWN0aW9ucyIsICIkIl0KfQo=
