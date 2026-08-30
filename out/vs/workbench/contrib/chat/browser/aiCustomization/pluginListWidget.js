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
import "./media/aiCustomizationManagement.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable, isDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Button, ButtonWithDropdown } from "../../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { autorun, runOnChange } from "../../../../../base/common/observable.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { URI } from "../../../../../base/common/uri.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { isContributionEnabled } from "../../common/enablement.js";
import { getInstalledPluginContextMenuActions } from "../agentPluginActions.js";
import { IPluginMarketplaceService } from "../../common/plugins/pluginMarketplaceService.js";
import { IPluginInstallService } from "../../common/plugins/pluginInstallService.js";
import { AgentPluginItemKind } from "../agentPluginEditor/agentPluginItems.js";
import { pluginIcon } from "./aiCustomizationIcons.js";
import { formatDisplayName, truncateToFirstLine } from "./aiCustomizationListWidget.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from "./customizationGroupHeaderRenderer.js";
import { getCustomizationDisabledLabel, ICustomizationHarnessService, isPluginCustomizationItem } from "../../common/customizationHarnessService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../common/constants.js";
import { IAICustomizationItemsModel } from "./aiCustomizationItemsModel.js";
import { GalleryItemInstallState, GalleryItemRenderer } from "./galleryItemRenderer.js";
import { UpdateAgentPluginsCommandId } from "../chat.js";
const $ = DOM.$;
const PLUGIN_ITEM_HEIGHT = 36;
class PluginItemDelegate {
  getHeight(element) {
    if (element.type === "group-header") {
      return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
    }
    if (element.type === "marketplace-item") {
      return 62;
    }
    return PLUGIN_ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (element.type === "group-header") {
      return "pluginGroupHeader";
    }
    if (element.type === "marketplace-item") {
      return PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID;
    }
    if (element.type === "remote-item") {
      return "pluginRemoteItem";
    }
    return "pluginInstalledItem";
  }
}
class PluginInstalledItemRenderer {
  constructor() {
    this.templateId = "pluginInstalledItem";
  }
  renderTemplate(container) {
    container.classList.add("mcp-server-item");
    const typeIcon = DOM.append(container, $(".mcp-server-icon"));
    typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
    const details = DOM.append(container, $(".mcp-server-details"));
    const name = DOM.append(details, $(".mcp-server-name"));
    const description = DOM.append(details, $(".mcp-server-description"));
    return { container, typeIcon, name, description, disposables: new DisposableStore() };
  }
  renderElement(element, _index, templateData) {
    templateData.disposables.clear();
    templateData.name.textContent = formatDisplayName(element.item.name);
    if (element.item.description) {
      templateData.description.textContent = truncateToFirstLine(element.item.description);
      templateData.description.style.display = "";
    } else {
      templateData.description.style.display = "none";
    }
    templateData.disposables.add(autorun((reader) => {
      const enabled = isContributionEnabled(element.item.plugin.enablement.read(reader));
      templateData.container.classList.toggle("disabled", !enabled);
    }));
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
class PluginRemoteItemRenderer {
  constructor() {
    this.templateId = "pluginRemoteItem";
  }
  renderTemplate(container) {
    container.classList.add("mcp-server-item");
    const typeIcon = DOM.append(container, $(".mcp-server-icon"));
    typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
    const details = DOM.append(container, $(".mcp-server-details"));
    const nameRow = DOM.append(details, $(".mcp-server-name"));
    const name = DOM.append(nameRow, $("span"));
    const badge = DOM.append(nameRow, $(".inline-badge.item-badge"));
    const description = DOM.append(details, $(".mcp-server-description"));
    const status = DOM.append(container, $(".mcp-server-status"));
    return { container, typeIcon, name, badge, description, status };
  }
  renderElement(element, _index, templateData) {
    templateData.name.textContent = formatDisplayName(element.item.name);
    if (element.item.badge) {
      templateData.badge.textContent = element.item.badge;
      templateData.badge.style.display = "";
      templateData.badge.title = element.item.badgeTooltip ?? "";
    } else {
      templateData.badge.textContent = "";
      templateData.badge.style.display = "none";
      templateData.badge.title = "";
    }
    if (element.item.description) {
      templateData.description.textContent = truncateToFirstLine(element.item.description);
      templateData.description.style.display = "";
    } else {
      templateData.description.textContent = "";
      templateData.description.style.display = "none";
    }
    templateData.container.classList.toggle("disabled", element.item.enabled === false);
    templateData.status.className = "mcp-server-status";
    if (element.item.enabled === false) {
      templateData.status.textContent = getRemotePluginDisabledLabel(element.item);
      templateData.status.classList.add("disabled");
      return;
    }
    switch (element.item.status) {
      case "loading":
        templateData.status.textContent = localize("remotePluginLoading", "Loading");
        templateData.status.classList.add("running");
        break;
      case "loaded":
        templateData.status.textContent = localize("remotePluginLoaded", "Loaded");
        templateData.status.classList.add("running");
        break;
      case "degraded":
        templateData.status.textContent = localize("remotePluginDegraded", "Warning");
        templateData.status.classList.add("disabled");
        break;
      case "error":
        templateData.status.textContent = localize("remotePluginError", "Error");
        templateData.status.classList.add("disabled");
        break;
      default:
        templateData.status.textContent = "";
        break;
    }
  }
  disposeTemplate(_templateData) {
  }
}
function getRemotePluginDisabledLabel(item) {
  return getCustomizationDisabledLabel(item.disabledReason);
}
const PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID = "pluginMarketplaceItem";
class PluginMarketplaceItemProvider {
  constructor(pluginInstallService, agentPluginService) {
    this.pluginInstallService = pluginInstallService;
    this.agentPluginService = agentPluginService;
  }
  getLabel(element) {
    return element.item.name;
  }
  getPublisherDisplayName(element) {
    return element.item.marketplace;
  }
  getDescription(element) {
    return element.item.description;
  }
  getInstallState(element) {
    const installUri = this.pluginInstallService.getPluginInstallUri(this._toInstallable(element.item));
    const isInstalled = this.agentPluginService.plugins.get().some((p) => isEqual(p.uri, installUri));
    return isInstalled ? GalleryItemInstallState.Installed : GalleryItemInstallState.Uninstalled;
  }
  async install(element) {
    await this.pluginInstallService.installPlugin({ ...this._toInstallable(element.item), readmeUri: element.item.readmeUri });
  }
  onDidChangeInstallState(_element, listener) {
    return runOnChange(this.agentPluginService.plugins, () => listener());
  }
  _toInstallable(item) {
    return {
      name: item.name,
      description: item.description,
      version: "",
      sourceDescriptor: item.sourceDescriptor,
      source: item.source,
      marketplace: item.marketplace,
      marketplaceReference: item.marketplaceReference,
      marketplaceType: item.marketplaceType
    };
  }
}
function installedPluginToItem(plugin, labelService) {
  const name = plugin.label || basename(plugin.uri);
  const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
  const marketplace = plugin.fromMarketplace?.marketplace;
  return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin };
}
function marketplacePluginToItem(plugin) {
  return {
    kind: AgentPluginItemKind.Marketplace,
    name: plugin.name,
    description: plugin.description,
    source: plugin.source,
    sourceDescriptor: plugin.sourceDescriptor,
    marketplace: plugin.marketplace,
    marketplaceReference: plugin.marketplaceReference,
    marketplaceType: plugin.marketplaceType,
    readmeUri: plugin.readmeUri
  };
}
let PluginListWidget = class extends Disposable {
  constructor(instantiationService, agentPluginService, pluginMarketplaceService, pluginInstallService, openerService, contextViewService, contextMenuService, hoverService, labelService, commandService, harnessService, itemsModel, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.agentPluginService = agentPluginService;
    this.pluginMarketplaceService = pluginMarketplaceService;
    this.pluginInstallService = pluginInstallService;
    this.openerService = openerService;
    this.contextViewService = contextViewService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.commandService = commandService;
    this.harnessService = harnessService;
    this.itemsModel = itemsModel;
    this.configurationService = configurationService;
    this._onDidSelectPlugin = this._register(new Emitter());
    this.onDidSelectPlugin = this._onDidSelectPlugin.event;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this.disabledLinkListener = this._register(new MutableDisposable());
    this.addDropdownActions = this._register(new DisposableStore());
    this.installedItems = [];
    this.remoteItems = [];
    this.displayEntries = [];
    this.marketplaceItems = [];
    this.searchQuery = "";
    this.browseMode = false;
    this.lastHeight = 0;
    this.lastWidth = 0;
    this.lastHeaderHeight = 0;
    this._layoutDeferred = false;
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.delayedFilter = new Delayer(200);
    this.delayedMarketplaceSearch = new Delayer(400);
    this.element = $(".mcp-list-widget");
    this.create();
    this.updateAccessState();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.PluginsEnabled)) {
        this.updateAccessState();
      }
    }));
    this._register({
      dispose: () => {
        this.marketplaceCts?.dispose();
      }
    });
  }
  create() {
    this.sectionTitleHeader = DOM.append(this.element, $(".section-title-header"));
    const titleRow = DOM.append(this.sectionTitleHeader, $(".section-title-row"));
    const sectionTitle = DOM.append(titleRow, $("h2.section-title"));
    sectionTitle.textContent = localize("plugins", "Plugins");
    const sectionTitleDescription = DOM.append(this.sectionTitleHeader, $("p.section-title-description"));
    const sectionTitleDescriptionText = DOM.append(sectionTitleDescription, $("span.section-title-description-text"));
    sectionTitleDescriptionText.textContent = localize("pluginsDescription", "Extend your AI agent with plugins that add commands, skills, agents, hooks, and MCP servers from reusable packages.");
    sectionTitleDescription.appendChild(document.createTextNode(" "));
    this.sectionLink = DOM.append(sectionTitleDescription, $("a.section-title-link"));
    this.sectionLink.textContent = localize("learnMorePlugins", "Learn more about agent plugins");
    this.sectionLink.href = "https://code.visualstudio.com/docs/agent-customization/agent-plugins?referrer=in-product";
    this._register(DOM.addDisposableListener(this.sectionLink, "click", (e) => {
      e.preventDefault();
      const href = this.sectionLink.href;
      if (href) {
        this.openerService.open(URI.parse(href));
      }
    }));
    const targetWindow = DOM.getWindow(this.element);
    const headerObserver = this._register(new DOM.DisposableResizeObserver(
      "PluginListWidget.sectionTitleHeader",
      () => {
        if (this.lastWidth <= 0 || this.lastHeight <= 0) {
          return;
        }
        const headerHeight = this.sectionTitleHeader.offsetHeight;
        if (headerHeight === this.lastHeaderHeight) {
          return;
        }
        this.layout(this.lastHeight, this.lastWidth);
      },
      targetWindow
    ));
    this._register(headerObserver.observe(this.sectionTitleHeader));
    this.searchAndButtonContainer = DOM.append(this.element, $(".list-search-and-button-container"));
    const searchContainer = DOM.append(this.searchAndButtonContainer, $(".list-search-container"));
    this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
      placeholder: localize("searchPluginsPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this._register(this.searchInput.onDidChange(() => {
      this.searchQuery = this.searchInput.value;
      if (this.browseMode) {
        this.delayedMarketplaceSearch.trigger(() => this.queryMarketplace());
      } else {
        this.delayedFilter.trigger(() => this.filterPlugins());
      }
    }));
    this.buttonContainer = DOM.append(this.searchAndButtonContainer, $(".list-button-group"));
    const backButtonContainer = DOM.append(this.buttonContainer, $(".list-add-button-container"));
    const backToInstalledLabel = localize("backToInstalledPlugins", "Back to Installed Plugins");
    this.backButton = this._register(new Button(backButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: backToInstalledLabel, ariaLabel: backToInstalledLabel }));
    this.backButton.label = `$(${Codicon.arrowLeft.id}) ${localize("pluginBrowseBack", "Back")}`;
    this.backButton.element.classList.add("list-add-button");
    backButtonContainer.style.display = "none";
    this._register(this.backButton.onDidClick(() => this.toggleBrowseMode(false)));
    const browseButtonContainer = DOM.append(this.buttonContainer, $(".list-add-button-container"));
    const browseMarketplaceLabel = localize("browseMarketplace", "Browse Marketplace");
    this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseMarketplaceLabel, ariaLabel: browseMarketplaceLabel }));
    this.browseButton.element.classList.add("list-add-button");
    this._register(this.browseButton.onDidClick(() => this.runPrimaryButtonAction()));
    this.addButtonContainer = DOM.append(this.buttonContainer, $(".list-add-button-container"));
    const addPluginLabel = localize("addPlugin", "Add Plugin");
    this.addButtonSimple = this._register(new Button(this.addButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: addPluginLabel, ariaLabel: addPluginLabel }));
    this.addButtonSimple.element.classList.add("list-add-button");
    this._register(this.addButtonSimple.onDidClick(() => this.runPrimaryAddAction()));
    this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true,
      contextMenuProvider: this.contextMenuService,
      addPrimaryActionToDropdown: false,
      actions: { getActions: () => this.getAddDropdownActions() },
      title: addPluginLabel,
      ariaLabel: addPluginLabel
    }));
    this.addButton.element.classList.add("list-add-button");
    this._register(this.addButton.onDidClick(() => this.runPrimaryAddAction()));
    const createPluginLabel = localize("createPlugin", "Create Plugin");
    this.createPluginButton = this._register(new Button(this.buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: createPluginLabel, ariaLabel: createPluginLabel }));
    this.createPluginButton.element.classList.add("list-icon-button");
    this.createPluginButton.label = `$(${Codicon.newFile.id})`;
    this._register(this.createPluginButton.onDidClick(() => this.runCreatePluginAction()));
    const updatePluginsLabel = localize("updatePlugins", "Update Plugins");
    this.updatePluginsButton = this._register(new Button(this.buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: updatePluginsLabel, ariaLabel: updatePluginsLabel }));
    this.updatePluginsButton.element.classList.add("list-icon-button");
    this.updatePluginsButton.label = `$(${Codicon.refresh.id})`;
    this._register(this.updatePluginsButton.onDidClick(() => this.runUpdatePluginsAction()));
    this.emptyContainer = DOM.append(this.element, $(".mcp-empty-state"));
    const emptyHeader = DOM.append(this.emptyContainer, $(".empty-state-header"));
    this.emptyText = DOM.append(emptyHeader, $(".empty-text"));
    this.emptySubtext = DOM.append(this.emptyContainer, $(".empty-subtext"));
    this.disabledContainer = DOM.append(this.element, $(".mcp-disabled-state"));
    const disabledHeader = DOM.append(this.disabledContainer, $(".empty-state-header"));
    this.disabledIcon = DOM.append(disabledHeader, $(".empty-icon"));
    const disabledText = DOM.append(disabledHeader, $(".empty-text"));
    disabledText.textContent = localize("pluginsDisabledTitle", "Plugins are disabled");
    this.disabledMessage = DOM.append(this.disabledContainer, $(".empty-subtext"));
    this.listContainer = DOM.append(this.element, $(".mcp-list-container"));
    const delegate = new PluginItemDelegate();
    const groupHeaderRenderer = new CustomizationGroupHeaderRenderer("pluginGroupHeader", this.hoverService);
    const installedRenderer = new PluginInstalledItemRenderer();
    const remoteRenderer = new PluginRemoteItemRenderer();
    const marketplaceRenderer = new GalleryItemRenderer(PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID, new PluginMarketplaceItemProvider(this.pluginInstallService, this.agentPluginService));
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "PluginManagementList",
      this.listContainer,
      delegate,
      [groupHeaderRenderer, installedRenderer, remoteRenderer, marketplaceRenderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(element) {
            if (element.type === "group-header") {
              return localize("pluginGroupAriaLabel", "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize("collapsed", "collapsed") : localize("expanded", "expanded"));
            }
            const name = formatDisplayName(element.item.name);
            const description = element.item.description ? truncateToFirstLine(element.item.description) : void 0;
            const nameAndDesc = description ? localize("pluginItemAriaLabel", "{0}. {1}", name, description) : name;
            if (element.type === "plugin-item") {
              const enabled = isContributionEnabled(element.item.plugin.enablement.get());
              return enabled ? localize("pluginInstalledItemAriaLabelEnabled", "{0}. Enabled", nameAndDesc) : localize("pluginInstalledItemAriaLabelDisabled", "{0}. Disabled", nameAndDesc);
            }
            return nameAndDesc;
          },
          getWidgetAriaLabel() {
            return localize("pluginsListAriaLabel", "Plugins");
          }
        },
        openOnSingleClick: true,
        identityProvider: {
          getId(element) {
            if (element.type === "group-header") {
              return element.id;
            }
            if (element.type === "marketplace-item") {
              return `marketplace-${element.item.marketplaceReference.canonicalId}/${element.item.source}`;
            }
            if (element.type === "remote-item") {
              return element.item.itemKey ?? `remote-${element.item.groupKey ?? "default"}-${element.item.uri.toString()}`;
            }
            return element.item.plugin.uri.toString();
          }
        }
      }
    ));
    this._register(this.list.onDidOpen((e) => {
      if (e.element) {
        if (e.element.type === "group-header") {
          this.toggleGroup(e.element);
        } else if (e.element.type === "plugin-item") {
          this._onDidSelectPlugin.fire(e.element.item);
        } else if (e.element.type === "remote-item") {
        } else if (e.element.type === "marketplace-item") {
          this._onDidSelectPlugin.fire(e.element.item);
        }
      }
    }));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e)));
    this._register(autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      for (const plugin of plugins) {
        plugin.enablement.read(reader);
      }
      if (!this.browseMode) {
        void this.refresh();
      }
    }));
    this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
      if (!this.browseMode) {
        void this.refresh();
      }
    }));
    this._register(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      this.updateToolbarActions();
      if (!this.browseMode) {
        void this.refresh();
      }
    }));
    const itemProviderChangeDisposable = this._register(new MutableDisposable());
    this._register(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      const itemProvider = this.harnessService.getActiveDescriptor().itemProvider;
      if (itemProvider) {
        itemProviderChangeDisposable.value = itemProvider.onDidChange(() => {
          if (!this.browseMode) {
            void this.refresh();
          }
        });
      } else {
        itemProviderChangeDisposable.clear();
      }
    }));
    this.updateToolbarActions();
    void this.refresh();
  }
  async refresh() {
    if (this.browseMode) {
      await this.queryMarketplace();
    } else {
      this.filterPlugins();
    }
  }
  updateAccessState() {
    const inspect = this.configurationService.inspect(ChatConfiguration.PluginsEnabled);
    const value = inspect.value ?? inspect.defaultValue;
    const disabled = value === false;
    const policyLocked = inspect.policyValue === false;
    this.element.classList.toggle("access-disabled", disabled);
    if (disabled) {
      this.disabledIcon.className = "empty-icon";
      this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : pluginIcon));
      DOM.clearNode(this.disabledMessage);
      this.disabledLinkListener.clear();
      if (policyLocked) {
        this.disabledMessage.textContent = localize("pluginsDisabledByPolicy", "Plugin integration in chat is disabled by your organization. Contact your organization administrator for more information.");
      } else {
        this.disabledMessage.appendChild(document.createTextNode(localize("pluginsDisabledBySettingPrefix", "Plugins are disabled in settings. ")));
        const link = DOM.append(this.disabledMessage, $("a.mcp-disabled-settings-link"));
        link.textContent = localize("pluginsDisabledSettingLink", "Configure in settings.");
        link.href = "#";
        link.setAttribute("role", "button");
        this.disabledLinkListener.value = DOM.addDisposableListener(link, "click", (e) => {
          e.preventDefault();
          this.commandService.executeCommand("workbench.action.openSettings", `@id:${ChatConfiguration.PluginsEnabled}`);
        });
      }
    }
  }
  get pluginActions() {
    return this.harnessService.getActiveDescriptor().pluginActions ?? [];
  }
  formatActionLabel(action, iconOnly = false) {
    if (!action.icon) {
      return action.label;
    }
    return iconOnly ? `$(${action.icon.id})` : `$(${action.icon.id}) ${action.label}`;
  }
  updateToolbarActions() {
    const browseMarketplaceAvailable = this.isBrowseMarketplaceAvailable();
    if (!browseMarketplaceAvailable && this.browseMode) {
      this.toggleBrowseMode(false);
    }
    this.browseButton.element.parentElement.style.display = this.browseMode ? "none" : "";
    this.browseButton.label = `$(${Codicon.library.id}) ${localize("browseMarketplace", "Browse Marketplace")}`;
    this.browseButton.enabled = browseMarketplaceAvailable;
    const browseTitle = browseMarketplaceAvailable ? localize("browseMarketplace", "Browse Marketplace") : localize("browseMarketplaceUnsupportedWeb", "Browse Marketplace is not available in VS Code for the Web.");
    this.browseButton.setTitle(browseTitle);
    this.browseButton.element.setAttribute("aria-label", browseTitle);
    this.updateAddButton();
    this.createPluginButton.enabled = true;
  }
  isBrowseMarketplaceAvailable() {
    return !isWeb;
  }
  updateAddButton() {
    const actions = this.buildAddActions();
    const [primary, ...dropdown] = actions;
    const hasDropdown = dropdown.length > 0;
    this.addButton.element.style.display = hasDropdown ? "" : "none";
    this.addButtonSimple.element.style.display = hasDropdown ? "none" : "";
    if (!primary) {
      this.addButton.element.style.display = "none";
      this.addButtonSimple.element.style.display = "none";
      return;
    }
    if (hasDropdown) {
      this.addButton.label = this.formatActionLabel(primary);
      this.addButton.enabled = primary.enabled !== false;
      const addPrimaryTitle = primary.tooltip ?? primary.label;
      this.addButton.primaryButton.setTitle(addPrimaryTitle);
      this.addButton.primaryButton.element.setAttribute("aria-label", addPrimaryTitle);
      const moreLabel = localize("morePluginAddActions", "More Plugin Add Actions...");
      this.addButton.dropdownButton.setTitle(moreLabel);
      this.addButton.dropdownButton.element.setAttribute("aria-label", moreLabel);
    } else {
      this.addButtonSimple.label = this.formatActionLabel(primary);
      this.addButtonSimple.enabled = primary.enabled !== false;
      const addSimpleTitle = primary.tooltip ?? primary.label;
      this.addButtonSimple.setTitle(addSimpleTitle);
      this.addButtonSimple.element.setAttribute("aria-label", addSimpleTitle);
    }
  }
  buildAddActions() {
    return [
      ...this.pluginActions,
      {
        id: "plugin.installFromSource",
        label: localize("installFromSource", "Install Plugin from Source"),
        tooltip: localize("installFromSource", "Install Plugin from Source"),
        icon: Codicon.add,
        run: async () => {
          const installed = await this.commandService.executeCommand("workbench.action.chat.installPluginFromSource", { skipReveal: true });
          if (installed && this.browseMode) {
            this.exitBrowseMode();
          }
        }
      }
    ];
  }
  getAddDropdownActions() {
    this.addDropdownActions.clear();
    return this.buildAddActions().slice(1).map((action, index) => this.addDropdownActions.add(new Action(`plugin_add_${index}`, this.formatActionLabel(action), void 0, action.enabled !== false, () => this.runPluginAction(action))));
  }
  async runPrimaryButtonAction() {
    if (!this.isBrowseMarketplaceAvailable()) {
      return;
    }
    this.toggleBrowseMode(!this.browseMode);
  }
  async runPrimaryAddAction() {
    const [primary] = this.buildAddActions();
    if (primary) {
      await this.runPluginAction(primary);
    }
  }
  async runCreatePluginAction() {
    await this.commandService.executeCommand("workbench.action.chat.createPlugin");
  }
  async runUpdatePluginsAction() {
    this.updatePluginsButton.enabled = false;
    try {
      await this.commandService.executeCommand(UpdateAgentPluginsCommandId);
    } finally {
      this.updatePluginsButton.enabled = true;
    }
  }
  async runPluginAction(action) {
    if (action.enabled !== false) {
      await action.run();
    }
  }
  showBrowseMarketplace() {
    if (!this.isBrowseMarketplaceAvailable()) {
      return;
    }
    if (!this.browseMode) {
      this.toggleBrowseMode(true);
    }
  }
  toggleBrowseMode(browse) {
    this.browseMode = browse;
    this.searchInput.value = "";
    this.searchQuery = "";
    this.browseButton.element.parentElement.style.display = browse ? "none" : "";
    this.backButton.element.parentElement.style.display = browse ? "" : "none";
    this.searchInput.setPlaceHolder(
      browse ? localize("searchMarketplacePlaceholder", "Search plugin marketplace...") : localize("searchPluginsPlaceholder", "Type to search...")
    );
    if (browse) {
      void this.queryMarketplace();
    } else {
      this.marketplaceCts?.dispose(true);
      this.marketplaceItems = [];
      void this.filterPlugins();
    }
    if (this.lastHeight > 0) {
      this.layout(this.lastHeight, this.lastWidth);
    }
  }
  async queryMarketplace() {
    this.marketplaceCts?.dispose(true);
    const cts = this.marketplaceCts = new CancellationTokenSource();
    this.emptyContainer.style.display = "flex";
    this.listContainer.style.display = "none";
    this.emptyText.textContent = localize("loadingMarketplace", "Loading marketplace...");
    this.emptySubtext.textContent = "";
    try {
      const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      const query = this.searchQuery.toLowerCase().trim();
      const filtered = query ? plugins.filter((p) => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query)) : plugins;
      const installedUris = new Set(this.agentPluginService.plugins.get().map((p) => p.uri.toString()));
      this.marketplaceItems = filtered.filter((p) => {
        const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
        return !installedUris.has(expectedUri.toString());
      }).map(marketplacePluginToItem);
      this.updateMarketplaceList();
    } catch {
      if (!cts.token.isCancellationRequested) {
        this.marketplaceItems = [];
        this.emptyContainer.style.display = "flex";
        this.listContainer.style.display = "none";
        this.emptyText.textContent = localize("marketplaceError", "Unable to load marketplace");
        this.emptySubtext.textContent = localize("tryAgainLater", "Check your connection and try again");
      }
    }
  }
  updateMarketplaceList() {
    if (this.marketplaceItems.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noMarketplaceResults", "No plugins match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        this.emptyText.textContent = localize("emptyMarketplace", "No plugins available");
        this.emptySubtext.textContent = "";
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const entries = this.marketplaceItems.map((item) => ({ type: "marketplace-item", item }));
    this.list.splice(0, this.list.length, entries);
  }
  async getRemotePluginItems(query) {
    if (!this.harnessService.getActiveDescriptor().itemProvider) {
      return [];
    }
    try {
      const provided = await this.itemsModel.getActiveItemSource().fetchProviderItems();
      return provided.filter(
        (item) => isPluginCustomizationItem(item) && (!query || item.name.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.badge?.toLowerCase().includes(query))
      );
    } catch {
      return [];
    }
  }
  getRemoteGroupMetadata(groupKey) {
    return {
      group: groupKey ?? "remote-host",
      label: localize("remoteHostGroup", "Remote"),
      description: localize("remoteHostGroupDescription", "Plugins configured directly on the remote agent host and available without local sync.")
    };
  }
  appendGroup(entries, header, items, isFirst) {
    if (items.length === 0) {
      return isFirst;
    }
    const collapsed = this.collapsedGroups.has(header.group);
    entries.push({
      type: "group-header",
      id: `plugin-group-${header.group}`,
      group: header.group,
      label: header.label,
      icon: pluginIcon,
      count: items.length,
      isFirst,
      description: header.description,
      collapsed
    });
    if (!collapsed) {
      entries.push(...items);
    }
    return false;
  }
  async filterPlugins() {
    const query = this.searchQuery.toLowerCase().trim();
    const allPlugins = this.agentPluginService.plugins.get();
    this.remoteItems = [...await this.getRemotePluginItems(query)];
    this.installedItems = allPlugins.map((p) => installedPluginToItem(p, this.labelService)).filter(
      (item) => !query || item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
    );
    if (this.remoteItems.length === 0 && this.installedItems.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noMatchingPlugins", "No plugins match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else if (this.harnessService.getActiveDescriptor().itemProvider) {
        this.emptyText.textContent = localize("noRemotePlugins", "No plugins configured");
        this.emptySubtext.textContent = localize("addRemotePlugins", "Use the toolbar to add remote plugins or install plugins from a source.");
      } else {
        this.emptyText.textContent = localize("noPlugins", "No plugins installed");
        this.emptySubtext.textContent = localize("browseToAdd", "Browse the marketplace to discover and install plugins");
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const enabledPlugins = this.installedItems.filter((item) => isContributionEnabled(item.plugin.enablement.get()));
    const disabledPlugins = this.installedItems.filter((item) => !isContributionEnabled(item.plugin.enablement.get()));
    const entries = [];
    let isFirst = true;
    const installedNames = new Set(this.installedItems.map((item) => item.name.toLowerCase()));
    const remoteGroups = /* @__PURE__ */ new Map();
    for (const item of this.remoteItems) {
      const key = item.groupKey ?? "remote-host";
      if (key === "remote-client") {
        continue;
      }
      if (item.name && installedNames.has(item.name.toLowerCase())) {
        continue;
      }
      let group = remoteGroups.get(key);
      if (!group) {
        group = [];
        remoteGroups.set(key, group);
      }
      group.push({ type: "remote-item", item });
    }
    for (const [groupKey, items] of remoteGroups) {
      isFirst = this.appendGroup(entries, this.getRemoteGroupMetadata(groupKey), items, isFirst);
    }
    if (enabledPlugins.length > 0) {
      isFirst = this.appendGroup(
        entries,
        {
          group: "enabled",
          label: localize("enabledGroup", "Enabled Locally"),
          description: localize("enabledGroupDescription", "Plugins installed in this client and available for syncing to the remote session.")
        },
        enabledPlugins.map((item) => ({ type: "plugin-item", item })),
        isFirst
      );
    }
    if (disabledPlugins.length > 0) {
      this.appendGroup(
        entries,
        {
          group: "disabled",
          label: localize("disabledGroup", "Disabled Locally"),
          description: localize("disabledGroupDescription", "Plugins installed in this client but currently disabled.")
        },
        disabledPlugins.map((item) => ({ type: "plugin-item", item })),
        isFirst
      );
    }
    this.displayEntries = entries;
    this.list.splice(0, this.list.length, this.displayEntries);
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  /**
   * Gets the total item count from the underlying data array
   * (the same source used to build group headers).
   */
  get itemCount() {
    const installedNames = new Set(this.installedItems.map((item) => item.name.toLowerCase()));
    const uniqueRemote = this.remoteItems.filter((item) => {
      if (item.groupKey === "remote-client") {
        return false;
      }
      if (item.name && installedNames.has(item.name.toLowerCase())) {
        return false;
      }
      return true;
    });
    return uniqueRemote.length + this.installedItems.length;
  }
  /**
   * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
   * to ensure the subscriber receives the latest count.
   */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  toggleGroup(entry) {
    if (this.collapsedGroups.has(entry.group)) {
      this.collapsedGroups.delete(entry.group);
    } else {
      this.collapsedGroups.add(entry.group);
    }
    void this.filterPlugins();
  }
  /**
   * Whether the widget is currently in marketplace browse mode.
   */
  isInBrowseMode() {
    return this.browseMode;
  }
  /**
   * Exits marketplace browse mode and returns to the installed plugins list.
   */
  exitBrowseMode() {
    if (this.browseMode) {
      this.toggleBrowseMode(false);
    }
  }
  layout(height, width) {
    this.lastHeight = height;
    this.lastWidth = width;
    this.element.style.height = `${height}px`;
    const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
    if (searchBarHeight === 0 && !this._layoutDeferred) {
      this._layoutDeferred = true;
      DOM.getWindow(this.element).requestAnimationFrame(() => {
        try {
          this.layout(this.lastHeight, this.lastWidth);
        } finally {
          this._layoutDeferred = false;
        }
      });
      return;
    }
    const headerHeight = this.sectionTitleHeader.offsetHeight;
    this.lastHeaderHeight = headerHeight;
    const listHeight = Math.max(0, height - searchBarHeight - headerHeight);
    this.listContainer.style.height = `${listHeight}px`;
    this.list.layout(listHeight, width);
  }
  focusSearch() {
    this.searchInput.focus();
  }
  revealLastItem() {
    if (this.list.length > 0) {
      this.list.reveal(this.list.length - 1);
    }
  }
  focus() {
    this.list.domFocus();
    if (this.list.length > 0) {
      this.list.setFocus([0]);
    }
  }
  onContextMenu(e) {
    if (!e.element || e.element.type === "group-header" || e.element.type === "marketplace-item") {
      return;
    }
    const entry = e.element;
    const disposables = new DisposableStore();
    const actions = [];
    if (entry.type === "plugin-item") {
      const groups = getInstalledPluginContextMenuActions(entry.item.plugin, this.instantiationService);
      for (const menuActions of groups) {
        for (const menuAction of menuActions) {
          actions.push(menuAction);
          if (isDisposable(menuAction)) {
            disposables.add(menuAction);
          }
        }
        actions.push(new Separator());
      }
      if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
        actions.pop();
      }
    } else {
      const itemActions = entry.item.actions ?? [];
      for (const itemAction of itemActions) {
        actions.push(new Action(
          itemAction.id,
          itemAction.label,
          itemAction.icon ? ThemeIcon.asClassName(itemAction.icon) : void 0,
          itemAction.enabled !== false,
          () => itemAction.run()
        ));
      }
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      onHide: () => disposables.dispose()
    });
  }
};
PluginListWidget = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IAgentPluginService),
  __decorateParam(2, IPluginMarketplaceService),
  __decorateParam(3, IPluginInstallService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IContextViewService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, ICustomizationHarnessService),
  __decorateParam(11, IAICustomizationItemsModel),
  __decorateParam(12, IConfigurationService)
], PluginListWidget);
export {
  PluginListWidget,
  getRemotePluginDisabledLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxccGx1Z2luTGlzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciwgSUxpc3RDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uV2l0aERyb3Bkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbiwgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBnZXRJbnN0YWxsZWRQbHVnaW5Db250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi9hZ2VudFBsdWdpbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtldHBsYWNlUGx1Z2luLCBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkluc3RhbGxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luSXRlbUtpbmQsIElBZ2VudFBsdWdpbkl0ZW0sIElJbnN0YWxsZWRQbHVnaW5JdGVtLCBJTWFya2V0cGxhY2VQbHVnaW5JdGVtIH0gZnJvbSAnLi4vYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5JdGVtcy5qcyc7XG5pbXBvcnQgeyBwbHVnaW5JY29uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBmb3JtYXREaXNwbGF5TmFtZSwgdHJ1bmNhdGVUb0ZpcnN0TGluZSB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25Hcm91cEhlYWRlclJlbmRlcmVyLCBJQ3VzdG9taXphdGlvbkdyb3VwSGVhZGVyRW50cnksIENVU1RPTUlaQVRJT05fR1JPVVBfSEVBREVSX0hFSUdIVCwgQ1VTVE9NSVpBVElPTl9HUk9VUF9IRUFERVJfSEVJR0hUX1dJVEhfU0VQQVJBVE9SIH0gZnJvbSAnLi9jdXN0b21pemF0aW9uR3JvdXBIZWFkZXJSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBnZXRDdXN0b21pemF0aW9uRGlzYWJsZWRMYWJlbCwgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgaXNQbHVnaW5DdXN0b21pemF0aW9uSXRlbSwgdHlwZSBJQ3VzdG9taXphdGlvbkl0ZW0sIHR5cGUgSUN1c3RvbWl6YXRpb25JdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZSwgR2FsbGVyeUl0ZW1SZW5kZXJlciwgSUdhbGxlcnlJdGVtUHJvdmlkZXIgfSBmcm9tICcuL2dhbGxlcnlJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgVXBkYXRlQWdlbnRQbHVnaW5zQ29tbWFuZElkIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgUExVR0lOX0lURU1fSEVJR0hUID0gMzY7XG5cbi8vI3JlZ2lvbiBFbnRyeSB0eXBlc1xuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBjb2xsYXBzaWJsZSBncm91cCBoZWFkZXIgaW4gdGhlIHBsdWdpbiBsaXN0LlxuICovXG5pbnRlcmZhY2UgSVBsdWdpbkdyb3VwSGVhZGVyRW50cnkgZXh0ZW5kcyBJQ3VzdG9taXphdGlvbkdyb3VwSGVhZGVyRW50cnkge1xuXHRyZWFkb25seSBncm91cDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gaW5zdGFsbGVkIHBsdWdpbiBpdGVtIGluIHRoZSBsaXN0LlxuICovXG5pbnRlcmZhY2UgSVBsdWdpbkluc3RhbGxlZEl0ZW1FbnRyeSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdwbHVnaW4taXRlbSc7XG5cdHJlYWRvbmx5IGl0ZW06IElJbnN0YWxsZWRQbHVnaW5JdGVtO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBtYXJrZXRwbGFjZSBwbHVnaW4gaXRlbSBpbiB0aGUgbGlzdCAoYnJvd3NlIG1vZGUpLlxuICovXG5pbnRlcmZhY2UgSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5IHtcblx0cmVhZG9ubHkgdHlwZTogJ21hcmtldHBsYWNlLWl0ZW0nO1xuXHRyZWFkb25seSBpdGVtOiBJTWFya2V0cGxhY2VQbHVnaW5JdGVtO1xufVxuXG5pbnRlcmZhY2UgSVBsdWdpblJlbW90ZUl0ZW1FbnRyeSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdyZW1vdGUtaXRlbSc7XG5cdHJlYWRvbmx5IGl0ZW06IElDdXN0b21pemF0aW9uSXRlbTtcbn1cblxudHlwZSBJUGx1Z2luTGlzdEVudHJ5ID0gSVBsdWdpbkdyb3VwSGVhZGVyRW50cnkgfCBJUGx1Z2luSW5zdGFsbGVkSXRlbUVudHJ5IHwgSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5IHwgSVBsdWdpblJlbW90ZUl0ZW1FbnRyeTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBEZWxlZ2F0ZVxuXG5jbGFzcyBQbHVnaW5JdGVtRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJUGx1Z2luTGlzdEVudHJ5PiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBJUGx1Z2luTGlzdEVudHJ5KTogbnVtYmVyIHtcblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJykge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaXNGaXJzdCA/IENVU1RPTUlaQVRJT05fR1JPVVBfSEVBREVSX0hFSUdIVCA6IENVU1RPTUlaQVRJT05fR1JPVVBfSEVBREVSX0hFSUdIVF9XSVRIX1NFUEFSQVRPUjtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ21hcmtldHBsYWNlLWl0ZW0nKSB7XG5cdFx0XHRyZXR1cm4gNjI7XG5cdFx0fVxuXHRcdHJldHVybiBQTFVHSU5fSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElQbHVnaW5MaXN0RW50cnkpOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRyZXR1cm4gJ3BsdWdpbkdyb3VwSGVhZGVyJztcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ21hcmtldHBsYWNlLWl0ZW0nKSB7XG5cdFx0XHRyZXR1cm4gUExVR0lOX01BUktFVFBMQUNFX0lURU1fVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdyZW1vdGUtaXRlbScpIHtcblx0XHRcdHJldHVybiAncGx1Z2luUmVtb3RlSXRlbSc7XG5cdFx0fVxuXHRcdHJldHVybiAncGx1Z2luSW5zdGFsbGVkSXRlbSc7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSW5zdGFsbGVkIFBsdWdpbiBSZW5kZXJlciAocmV1c2VzIC5tY3Atc2VydmVyLWl0ZW0gQ1NTKVxuXG5pbnRlcmZhY2UgSVBsdWdpbkluc3RhbGxlZEl0ZW1UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0eXBlSWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIFBsdWdpbkluc3RhbGxlZEl0ZW1SZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SVBsdWdpbkluc3RhbGxlZEl0ZW1FbnRyeSwgSVBsdWdpbkluc3RhbGxlZEl0ZW1UZW1wbGF0ZURhdGE+IHtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdwbHVnaW5JbnN0YWxsZWRJdGVtJztcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVBsdWdpbkluc3RhbGxlZEl0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtY3Atc2VydmVyLWl0ZW0nKTtcblxuXHRcdGNvbnN0IHR5cGVJY29uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLWljb24nKSk7XG5cdFx0dHlwZUljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShwbHVnaW5JY29uKSk7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLWRldGFpbHMnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IERPTS5hcHBlbmQoZGV0YWlscywgJCgnLm1jcC1zZXJ2ZXItbmFtZScpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQoZGV0YWlscywgJCgnLm1jcC1zZXJ2ZXItZGVzY3JpcHRpb24nKSk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIHR5cGVJY29uLCBuYW1lLCBkZXNjcmlwdGlvbiwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJUGx1Z2luSW5zdGFsbGVkSXRlbUVudHJ5LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUGx1Z2luSW5zdGFsbGVkSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50Lml0ZW0ubmFtZSk7XG5cblx0XHRpZiAoZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSB0cnVuY2F0ZVRvRmlyc3RMaW5lKGVsZW1lbnQuaXRlbS5kZXNjcmlwdGlvbik7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBSZWZsZWN0IGVuYWJsZWQvZGlzYWJsZWQgc3RhdGUgb24gdGhlIGNvbnRhaW5lciBmb3IgdmlzdWFsIHN0eWxpbmcuIFRoZVxuXHRcdC8vIGlubGluZSBzdGF0dXMgYmFkZ2UgKFwiRW5hYmxlZFwiL1wiRGlzYWJsZWRcIikgaXMgaW50ZW50aW9uYWxseSBvbWl0dGVkIFx1MjAxNFxuXHRcdC8vIGl0ZW1zIGFyZSBhbHJlYWR5IGdyb3VwZWQgdW5kZXIgXCJFbmFibGVkIExvY2FsbHlcIiAvIFwiRGlzYWJsZWQgTG9jYWxseVwiXG5cdFx0Ly8gc2VjdGlvbiBoZWFkZXJzLCBhbmQgdGhlIHJvdydzIGFyaWEtbGFiZWwgY29udmV5cyBzdGF0ZSB0byBzY3JlZW4gcmVhZGVycy5cblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZWxlbWVudC5pdGVtLnBsdWdpbi5lbmFibGVtZW50LnJlYWQocmVhZGVyKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWVuYWJsZWQpO1xuXHRcdH0pKTtcblxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVBsdWdpbkluc3RhbGxlZEl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUmVtb3RlIFBsdWdpbiBSZW5kZXJlclxuXG5pbnRlcmZhY2UgSVBsdWdpblJlbW90ZUl0ZW1UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0eXBlSWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBiYWRnZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3RhdHVzOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgUGx1Z2luUmVtb3RlSXRlbVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJUGx1Z2luUmVtb3RlSXRlbUVudHJ5LCBJUGx1Z2luUmVtb3RlSXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ3BsdWdpblJlbW90ZUl0ZW0nO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUGx1Z2luUmVtb3RlSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21jcC1zZXJ2ZXItaXRlbScpO1xuXG5cdFx0Y29uc3QgdHlwZUljb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1jcC1zZXJ2ZXItaWNvbicpKTtcblx0XHR0eXBlSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHBsdWdpbkljb24pKTtcblxuXHRcdGNvbnN0IGRldGFpbHMgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1jcC1zZXJ2ZXItZGV0YWlscycpKTtcblx0XHRjb25zdCBuYW1lUm93ID0gRE9NLmFwcGVuZChkZXRhaWxzLCAkKCcubWNwLXNlcnZlci1uYW1lJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBET00uYXBwZW5kKG5hbWVSb3csICQoJ3NwYW4nKSk7XG5cdFx0Y29uc3QgYmFkZ2UgPSBET00uYXBwZW5kKG5hbWVSb3csICQoJy5pbmxpbmUtYmFkZ2UuaXRlbS1iYWRnZScpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQoZGV0YWlscywgJCgnLm1jcC1zZXJ2ZXItZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLXN0YXR1cycpKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgdHlwZUljb24sIG5hbWUsIGJhZGdlLCBkZXNjcmlwdGlvbiwgc3RhdHVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElQbHVnaW5SZW1vdGVJdGVtRW50cnksIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQbHVnaW5SZW1vdGVJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50Lml0ZW0ubmFtZSk7XG5cblx0XHRpZiAoZWxlbWVudC5pdGVtLmJhZGdlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSBlbGVtZW50Lml0ZW0uYmFkZ2U7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnRpdGxlID0gZWxlbWVudC5pdGVtLmJhZGdlVG9vbHRpcCA/PyAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRlbXBsYXRlRGF0YS5iYWRnZS50aXRsZSA9ICcnO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50Lml0ZW0uZGVzY3JpcHRpb24pIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IHRydW5jYXRlVG9GaXJzdExpbmUoZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGVsZW1lbnQuaXRlbS5lbmFibGVkID09PSBmYWxzZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy5jbGFzc05hbWUgPSAnbWNwLXNlcnZlci1zdGF0dXMnO1xuXHRcdGlmIChlbGVtZW50Lml0ZW0uZW5hYmxlZCA9PT0gZmFsc2UpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMudGV4dENvbnRlbnQgPSBnZXRSZW1vdGVQbHVnaW5EaXNhYmxlZExhYmVsKGVsZW1lbnQuaXRlbSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChlbGVtZW50Lml0ZW0uc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdsb2FkaW5nJzpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdyZW1vdGVQbHVnaW5Mb2FkaW5nJywgXCJMb2FkaW5nXCIpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLmNsYXNzTGlzdC5hZGQoJ3J1bm5pbmcnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdsb2FkZWQnOlxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3JlbW90ZVBsdWdpbkxvYWRlZCcsIFwiTG9hZGVkXCIpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLmNsYXNzTGlzdC5hZGQoJ3J1bm5pbmcnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdkZWdyYWRlZCc6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncmVtb3RlUGx1Z2luRGVncmFkZWQnLCBcIldhcm5pbmdcIik7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncmVtb3RlUGx1Z2luRXJyb3InLCBcIkVycm9yXCIpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUoX3RlbXBsYXRlRGF0YTogSVBsdWdpblJlbW90ZUl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHsgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVtb3RlUGx1Z2luRGlzYWJsZWRMYWJlbChpdGVtOiBQaWNrPElDdXN0b21pemF0aW9uSXRlbSwgJ2Rpc2FibGVkUmVhc29uJz4pOiBzdHJpbmcge1xuXHRyZXR1cm4gZ2V0Q3VzdG9taXphdGlvbkRpc2FibGVkTGFiZWwoaXRlbS5kaXNhYmxlZFJlYXNvbik7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTWFya2V0cGxhY2UgUGx1Z2luIFJlbmRlcmVyXG5cbmNvbnN0IFBMVUdJTl9NQVJLRVRQTEFDRV9JVEVNX1RFTVBMQVRFX0lEID0gJ3BsdWdpbk1hcmtldHBsYWNlSXRlbSc7XG5cbi8qKiBBZGFwdHMgYSBtYXJrZXRwbGFjZSBwbHVnaW4gZW50cnkgdG8gdGhlIHNoYXJlZCBnYWxsZXJ5IHJvdyByZW5kZXJlci4gKi9cbmNsYXNzIFBsdWdpbk1hcmtldHBsYWNlSXRlbVByb3ZpZGVyIGltcGxlbWVudHMgSUdhbGxlcnlJdGVtUHJvdmlkZXI8SVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwbHVnaW5JbnN0YWxsU2VydmljZTogSVBsdWdpbkluc3RhbGxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGdldExhYmVsKGVsZW1lbnQ6IElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuaXRlbS5uYW1lO1xuXHR9XG5cblx0Z2V0UHVibGlzaGVyRGlzcGxheU5hbWUoZWxlbWVudDogSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWxlbWVudC5pdGVtLm1hcmtldHBsYWNlO1xuXHR9XG5cblx0Z2V0RGVzY3JpcHRpb24oZWxlbWVudDogSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uO1xuXHR9XG5cblx0Z2V0SW5zdGFsbFN0YXRlKGVsZW1lbnQ6IElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeSk6IEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlIHtcblx0XHRjb25zdCBpbnN0YWxsVXJpID0gdGhpcy5wbHVnaW5JbnN0YWxsU2VydmljZS5nZXRQbHVnaW5JbnN0YWxsVXJpKHRoaXMuX3RvSW5zdGFsbGFibGUoZWxlbWVudC5pdGVtKSk7XG5cdFx0Y29uc3QgaXNJbnN0YWxsZWQgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpLnNvbWUocCA9PiBpc0VxdWFsKHAudXJpLCBpbnN0YWxsVXJpKSk7XG5cdFx0cmV0dXJuIGlzSW5zdGFsbGVkID8gR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUuSW5zdGFsbGVkIDogR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKGVsZW1lbnQ6IElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucGx1Z2luSW5zdGFsbFNlcnZpY2UuaW5zdGFsbFBsdWdpbih7IC4uLnRoaXMuX3RvSW5zdGFsbGFibGUoZWxlbWVudC5pdGVtKSwgcmVhZG1lVXJpOiBlbGVtZW50Lml0ZW0ucmVhZG1lVXJpIH0pO1xuXHR9XG5cblx0b25EaWRDaGFuZ2VJbnN0YWxsU3RhdGUoX2VsZW1lbnQ6IElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeSwgbGlzdGVuZXI6ICgpID0+IHZvaWQpIHtcblx0XHRyZXR1cm4gcnVuT25DaGFuZ2UodGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucywgKCkgPT4gbGlzdGVuZXIoKSk7XG5cdH1cblxuXHRwcml2YXRlIF90b0luc3RhbGxhYmxlKGl0ZW06IElNYXJrZXRwbGFjZVBsdWdpbkl0ZW0pIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdHNvdXJjZURlc2NyaXB0b3I6IGl0ZW0uc291cmNlRGVzY3JpcHRvcixcblx0XHRcdHNvdXJjZTogaXRlbS5zb3VyY2UsXG5cdFx0XHRtYXJrZXRwbGFjZTogaXRlbS5tYXJrZXRwbGFjZSxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBpdGVtLm1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdFx0bWFya2V0cGxhY2VUeXBlOiBpdGVtLm1hcmtldHBsYWNlVHlwZSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSGVscGVyc1xuXG5mdW5jdGlvbiBpbnN0YWxsZWRQbHVnaW5Ub0l0ZW0ocGx1Z2luOiBJQWdlbnRQbHVnaW4sIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSk6IElJbnN0YWxsZWRQbHVnaW5JdGVtIHtcblx0Ly8gVXNlIGB8fGAgKG5vdCBgPz9gKSBzbyBhbiBlbXB0eSBgbGFiZWxgIGFsc28gZmFsbHMgYmFjayB0byB0aGUgVVJJIGJhc2VuYW1lLlxuXHQvLyBUaGUgaXRlbXMgbW9kZWwncyBgZ2V0UGx1Z2luQ291bnRgIGRlZHVwZXMgYWdhaW5zdCB0aGlzIHNhbWUgZmFsbGJhY2s7IHVzaW5nXG5cdC8vIGA/P2AgaGVyZSB3b3VsZCBzaWxlbnRseSBicmVhayBkZWR1cCBmb3IgcGx1Z2lucyB3aG9zZSBsYWJlbCBpcyBgJydgLlxuXHRjb25zdCBuYW1lID0gcGx1Z2luLmxhYmVsIHx8IGJhc2VuYW1lKHBsdWdpbi51cmkpO1xuXHRjb25zdCBkZXNjcmlwdGlvbiA9IHBsdWdpbi5mcm9tTWFya2V0cGxhY2U/LmRlc2NyaXB0aW9uID8/IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHBsdWdpbi51cmkpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRjb25zdCBtYXJrZXRwbGFjZSA9IHBsdWdpbi5mcm9tTWFya2V0cGxhY2U/Lm1hcmtldHBsYWNlO1xuXHRyZXR1cm4geyBraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCwgbmFtZSwgZGVzY3JpcHRpb24sIG1hcmtldHBsYWNlLCBwbHVnaW4gfTtcbn1cblxuZnVuY3Rpb24gbWFya2V0cGxhY2VQbHVnaW5Ub0l0ZW0ocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiBJTWFya2V0cGxhY2VQbHVnaW5JdGVtIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLk1hcmtldHBsYWNlLFxuXHRcdG5hbWU6IHBsdWdpbi5uYW1lLFxuXHRcdGRlc2NyaXB0aW9uOiBwbHVnaW4uZGVzY3JpcHRpb24sXG5cdFx0c291cmNlOiBwbHVnaW4uc291cmNlLFxuXHRcdHNvdXJjZURlc2NyaXB0b3I6IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLFxuXHRcdG1hcmtldHBsYWNlOiBwbHVnaW4ubWFya2V0cGxhY2UsXG5cdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSxcblx0XHRtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0cmVhZG1lVXJpOiBwbHVnaW4ucmVhZG1lVXJpLFxuXHR9O1xufVxuXG4vLyNlbmRyZWdpb25cblxuLyoqXG4gKiBXaWRnZXQgdGhhdCBkaXNwbGF5cyBhIGxpc3Qgb2YgYWdlbnQgcGx1Z2lucyB3aXRoIG1hcmtldHBsYWNlIGJyb3dzaW5nLlxuICogRm9sbG93cyB0aGUgc2FtZSBwYXR0ZXJucyBhcyB7QGxpbmsgTWNwTGlzdFdpZGdldH0uXG4gKi9cbmV4cG9ydCBjbGFzcyBQbHVnaW5MaXN0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RQbHVnaW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRQbHVnaW5JdGVtPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RQbHVnaW4gPSB0aGlzLl9vbkRpZFNlbGVjdFBsdWdpbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUl0ZW1Db3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbUNvdW50ID0gdGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBzZWN0aW9uVGl0bGVIZWFkZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWN0aW9uTGluayE6IEhUTUxBbmNob3JFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaElucHV0ITogSW5wdXRCb3g7XG5cdHByaXZhdGUgbGlzdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxpc3QhOiBXb3JrYmVuY2hMaXN0PElQbHVnaW5MaXN0RW50cnk+O1xuXHRwcml2YXRlIGVtcHR5Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZW1wdHlUZXh0ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZW1wdHlTdWJ0ZXh0ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZGlzYWJsZWRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaXNhYmxlZEljb24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaXNhYmxlZE1lc3NhZ2UhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNhYmxlZExpbmtMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBidXR0b25Db250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBicm93c2VCdXR0b24hOiBCdXR0b247XG5cdHByaXZhdGUgYmFja0J1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBhZGRCdXR0b25Db250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBhZGRCdXR0b25TaW1wbGUhOiBCdXR0b247XG5cdHByaXZhdGUgYWRkQnV0dG9uITogQnV0dG9uV2l0aERyb3Bkb3duO1xuXHRwcml2YXRlIGNyZWF0ZVBsdWdpbkJ1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSB1cGRhdGVQbHVnaW5zQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFkZERyb3Bkb3duQWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBpbnN0YWxsZWRJdGVtczogSUluc3RhbGxlZFBsdWdpbkl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHJlbW90ZUl0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIGRpc3BsYXlFbnRyaWVzOiBJUGx1Z2luTGlzdEVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSBtYXJrZXRwbGFjZUl0ZW1zOiBJTWFya2V0cGxhY2VQbHVnaW5JdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBzZWFyY2hRdWVyeTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgYnJvd3NlTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgbGFzdFdpZHRoOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGxhc3RIZWFkZXJIZWlnaHQgPSAwO1xuXHRwcml2YXRlIF9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZEdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIG1hcmtldHBsYWNlQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkRmlsdGVyID0gbmV3IERlbGF5ZXI8dm9pZD4oMjAwKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkTWFya2V0cGxhY2VTZWFyY2ggPSBuZXcgRGVsYXllcjx2b2lkPig0MDApO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHRcdEBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHRcdEBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5JbnN0YWxsU2VydmljZTogSVBsdWdpbkluc3RhbGxTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIHByaXZhdGUgcmVhZG9ubHkgaXRlbXNNb2RlbDogSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLm1jcC1saXN0LXdpZGdldCcpOyAvLyByZXVzZSBNQ1AgbGlzdCB3aWRnZXQgQ1NTXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0XHR0aGlzLnVwZGF0ZUFjY2Vzc1N0YXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2Nlc3NTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMubWFya2V0cGxhY2VDdHM/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXHRcdC8vIFNlY3Rpb24gdGl0bGUgaGVhZGVyICh0aXRsZSArIGRlc2NyaXB0aW9uIHdpdGggaW5saW5lIGxlYXJuIG1vcmUpIGF0IHRoZSB0b3AuXG5cdFx0dGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLnNlY3Rpb24tdGl0bGUtaGVhZGVyJykpO1xuXHRcdGNvbnN0IHRpdGxlUm93ID0gRE9NLmFwcGVuZCh0aGlzLnNlY3Rpb25UaXRsZUhlYWRlciwgJCgnLnNlY3Rpb24tdGl0bGUtcm93JykpO1xuXHRcdGNvbnN0IHNlY3Rpb25UaXRsZSA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJ2gyLnNlY3Rpb24tdGl0bGUnKSk7XG5cdFx0c2VjdGlvblRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BsdWdpbnMnLCBcIlBsdWdpbnNcIik7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlRGVzY3JpcHRpb24gPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyLCAkKCdwLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlRGVzY3JpcHRpb25UZXh0ID0gRE9NLmFwcGVuZChzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnc3Bhbi5zZWN0aW9uLXRpdGxlLWRlc2NyaXB0aW9uLXRleHQnKSk7XG5cdFx0c2VjdGlvblRpdGxlRGVzY3JpcHRpb25UZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BsdWdpbnNEZXNjcmlwdGlvbicsIFwiRXh0ZW5kIHlvdXIgQUkgYWdlbnQgd2l0aCBwbHVnaW5zIHRoYXQgYWRkIGNvbW1hbmRzLCBza2lsbHMsIGFnZW50cywgaG9va3MsIGFuZCBNQ1Agc2VydmVycyBmcm9tIHJldXNhYmxlIHBhY2thZ2VzLlwiKTtcblx0XHQvLyBSZWFsIHdoaXRlc3BhY2UgdGV4dCBub2RlIGJldHdlZW4gZGVzY3JpcHRpb24gYW5kIGxpbmsgc28gdGhlIGdhcCBjb2xsYXBzZXNcblx0XHQvLyB3aGVuIHRoZSBsaW5rIHdyYXBzIHRvIGEgbmV3IGxpbmUgKGEgQ1NTIG1hcmdpbi1sZWZ0IHdvdWxkIHB1c2ggaXQgaW53YXJkKS5cblx0XHRzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHR0aGlzLnNlY3Rpb25MaW5rID0gRE9NLmFwcGVuZChzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnYS5zZWN0aW9uLXRpdGxlLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0dGhpcy5zZWN0aW9uTGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsZWFybk1vcmVQbHVnaW5zJywgXCJMZWFybiBtb3JlIGFib3V0IGFnZW50IHBsdWdpbnNcIik7XG5cdFx0dGhpcy5zZWN0aW9uTGluay5ocmVmID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnQtY3VzdG9taXphdGlvbi9hZ2VudC1wbHVnaW5zP3JlZmVycmVyPWluLXByb2R1Y3QnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWN0aW9uTGluaywgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IGhyZWYgPSB0aGlzLnNlY3Rpb25MaW5rLmhyZWY7XG5cdFx0XHRpZiAoaHJlZikge1xuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoaHJlZikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLWxheW91dCB3aGVuIHRoZSBoZWFkZXIgaGVpZ2h0IGNoYW5nZXMgc28gdGhlIGxpc3QncyBhbGxvdHRlZFxuXHRcdC8vIGhlaWdodCBzdGF5cyBpbiBzeW5jIHdpdGggdGhlIGFjdHVhbCBvbi1zY3JlZW4gaGVhZGVyIHNpemUuIE9ubHlcblx0XHQvLyByZWxheW91dCB3aGVuIHRoZSBoZWFkZXIgaGVpZ2h0IGFjdHVhbGx5IGNoYW5nZWQgdG8gYXZvaWQgcmVkdW5kYW50XG5cdFx0Ly8gd29yayBvbiBEUFIgY2hhbmdlcyBvciB3aWR0aC1vbmx5IHJlc2l6ZXMuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdGNvbnN0IGhlYWRlck9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERPTS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoXG5cdFx0XHQnUGx1Z2luTGlzdFdpZGdldC5zZWN0aW9uVGl0bGVIZWFkZXInLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5sYXN0V2lkdGggPD0gMCB8fCB0aGlzLmxhc3RIZWlnaHQgPD0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLnNlY3Rpb25UaXRsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRcdGlmIChoZWFkZXJIZWlnaHQgPT09IHRoaXMubGFzdEhlYWRlckhlaWdodCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RIZWlnaHQsIHRoaXMubGFzdFdpZHRoKTtcblx0XHRcdH0sXG5cdFx0XHR0YXJnZXRXaW5kb3csXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGVhZGVyT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLnNlY3Rpb25UaXRsZUhlYWRlcikpO1xuXG5cdFx0Ly8gU2VhcmNoIGFuZCBidXR0b24gY29udGFpbmVyXG5cdFx0dGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmxpc3Qtc2VhcmNoLWFuZC1idXR0b24tY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2VhcmNoIGNvbnRhaW5lclxuXHRcdGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIsICQoJy5saXN0LXNlYXJjaC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnB1dEJveChzZWFyY2hDb250YWluZXIsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3NlYXJjaFBsdWdpbnNQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hRdWVyeSA9IHRoaXMuc2VhcmNoSW5wdXQudmFsdWU7XG5cdFx0XHRpZiAodGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdHRoaXMuZGVsYXllZE1hcmtldHBsYWNlU2VhcmNoLnRyaWdnZXIoKCkgPT4gdGhpcy5xdWVyeU1hcmtldHBsYWNlKCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kZWxheWVkRmlsdGVyLnRyaWdnZXIoKCkgPT4gdGhpcy5maWx0ZXJQbHVnaW5zKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJ1dHRvbiBjb250YWluZXIgKEJyb3dzZSBNYXJrZXRwbGFjZSArIEFkZCBhY3Rpb25zICsgQ3JlYXRlIFBsdWdpbiArIFVwZGF0ZSBQbHVnaW5zKVxuXHRcdHRoaXMuYnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLnNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYnV0dG9uLWdyb3VwJykpO1xuXG5cdFx0Ly8gQmFjayBidXR0b24gKHZpc2libGUgb25seSBpbiBtYXJrZXRwbGFjZSBicm93c2UgbW9kZSlcblx0XHRjb25zdCBiYWNrQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYWRkLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYmFja1RvSW5zdGFsbGVkTGFiZWwgPSBsb2NhbGl6ZSgnYmFja1RvSW5zdGFsbGVkUGx1Z2lucycsIFwiQmFjayB0byBJbnN0YWxsZWQgUGx1Z2luc1wiKTtcblx0XHR0aGlzLmJhY2tCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGJhY2tCdXR0b25Db250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBiYWNrVG9JbnN0YWxsZWRMYWJlbCwgYXJpYUxhYmVsOiBiYWNrVG9JbnN0YWxsZWRMYWJlbCB9KSk7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmFycm93TGVmdC5pZH0pICR7bG9jYWxpemUoJ3BsdWdpbkJyb3dzZUJhY2snLCBcIkJhY2tcIil9YDtcblx0XHR0aGlzLmJhY2tCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaXN0LWFkZC1idXR0b24nKTtcblx0XHRiYWNrQnV0dG9uQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5iYWNrQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy50b2dnbGVCcm93c2VNb2RlKGZhbHNlKSkpO1xuXG5cdFx0Y29uc3QgYnJvd3NlQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYWRkLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYnJvd3NlTWFya2V0cGxhY2VMYWJlbCA9IGxvY2FsaXplKCdicm93c2VNYXJrZXRwbGFjZScsIFwiQnJvd3NlIE1hcmtldHBsYWNlXCIpO1xuXHRcdHRoaXMuYnJvd3NlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihicm93c2VCdXR0b25Db250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBicm93c2VNYXJrZXRwbGFjZUxhYmVsLCBhcmlhTGFiZWw6IGJyb3dzZU1hcmtldHBsYWNlTGFiZWwgfSkpO1xuXHRcdHRoaXMuYnJvd3NlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5icm93c2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnJ1blByaW1hcnlCdXR0b25BY3Rpb24oKSkpO1xuXG5cdFx0dGhpcy5hZGRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuYnV0dG9uQ29udGFpbmVyLCAkKCcubGlzdC1hZGQtYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhZGRQbHVnaW5MYWJlbCA9IGxvY2FsaXplKCdhZGRQbHVnaW4nLCBcIkFkZCBQbHVnaW5cIik7XG5cdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogYWRkUGx1Z2luTGFiZWwsIGFyaWFMYWJlbDogYWRkUGx1Z2luTGFiZWwgfSkpO1xuXHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZGRCdXR0b25TaW1wbGUub25EaWRDbGljaygoKSA9PiB0aGlzLnJ1blByaW1hcnlBZGRBY3Rpb24oKSkpO1xuXG5cdFx0dGhpcy5hZGRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uV2l0aERyb3Bkb3duKHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRhY3Rpb25zOiB7IGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0QWRkRHJvcGRvd25BY3Rpb25zKCkgfSxcblx0XHRcdHRpdGxlOiBhZGRQbHVnaW5MYWJlbCxcblx0XHRcdGFyaWFMYWJlbDogYWRkUGx1Z2luTGFiZWwsXG5cdFx0fSkpO1xuXHRcdHRoaXMuYWRkQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZGRCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnJ1blByaW1hcnlBZGRBY3Rpb24oKSkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlUGx1Z2luTGFiZWwgPSBsb2NhbGl6ZSgnY3JlYXRlUGx1Z2luJywgXCJDcmVhdGUgUGx1Z2luXCIpO1xuXHRcdHRoaXMuY3JlYXRlUGx1Z2luQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSwgdGl0bGU6IGNyZWF0ZVBsdWdpbkxhYmVsLCBhcmlhTGFiZWw6IGNyZWF0ZVBsdWdpbkxhYmVsIH0pKTtcblx0XHR0aGlzLmNyZWF0ZVBsdWdpbkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtaWNvbi1idXR0b24nKTtcblx0XHR0aGlzLmNyZWF0ZVBsdWdpbkJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5uZXdGaWxlLmlkfSlgO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlUGx1Z2luQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5DcmVhdGVQbHVnaW5BY3Rpb24oKSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlUGx1Z2luc0xhYmVsID0gbG9jYWxpemUoJ3VwZGF0ZVBsdWdpbnMnLCBcIlVwZGF0ZSBQbHVnaW5zXCIpO1xuXHRcdHRoaXMudXBkYXRlUGx1Z2luc0J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5idXR0b25Db250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiB1cGRhdGVQbHVnaW5zTGFiZWwsIGFyaWFMYWJlbDogdXBkYXRlUGx1Z2luc0xhYmVsIH0pKTtcblx0XHR0aGlzLnVwZGF0ZVBsdWdpbnNCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaXN0LWljb24tYnV0dG9uJyk7XG5cdFx0dGhpcy51cGRhdGVQbHVnaW5zQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLnJlZnJlc2guaWR9KWA7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51cGRhdGVQbHVnaW5zQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5VcGRhdGVQbHVnaW5zQWN0aW9uKCkpKTtcblxuXHRcdC8vIEVtcHR5IHN0YXRlXG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubWNwLWVtcHR5LXN0YXRlJykpO1xuXHRcdGNvbnN0IGVtcHR5SGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCcuZW1wdHktc3RhdGUtaGVhZGVyJykpO1xuXHRcdHRoaXMuZW1wdHlUZXh0ID0gRE9NLmFwcGVuZChlbXB0eUhlYWRlciwgJCgnLmVtcHR5LXRleHQnKSk7XG5cdFx0dGhpcy5lbXB0eVN1YnRleHQgPSBET00uYXBwZW5kKHRoaXMuZW1wdHlDb250YWluZXIsICQoJy5lbXB0eS1zdWJ0ZXh0JykpO1xuXG5cdFx0Ly8gRGlzYWJsZWQgKGFjY2VzcyBibG9ja2VkKSBzdGF0ZSBcdTIwMTQgc2hvd24gd2hlbiBjaGF0LnBsdWdpbnMuZW5hYmxlZCBpcyBmYWxzZSxcblx0XHQvLyBlaXRoZXIgYnkgdXNlciBzZXR0aW5nIG9yIGJ5IGVudGVycHJpc2UgcG9saWN5LlxuXHRcdHRoaXMuZGlzYWJsZWRDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLm1jcC1kaXNhYmxlZC1zdGF0ZScpKTtcblx0XHRjb25zdCBkaXNhYmxlZEhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5kaXNhYmxlZENvbnRhaW5lciwgJCgnLmVtcHR5LXN0YXRlLWhlYWRlcicpKTtcblx0XHR0aGlzLmRpc2FibGVkSWNvbiA9IERPTS5hcHBlbmQoZGlzYWJsZWRIZWFkZXIsICQoJy5lbXB0eS1pY29uJykpO1xuXHRcdGNvbnN0IGRpc2FibGVkVGV4dCA9IERPTS5hcHBlbmQoZGlzYWJsZWRIZWFkZXIsICQoJy5lbXB0eS10ZXh0JykpO1xuXHRcdGRpc2FibGVkVGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwbHVnaW5zRGlzYWJsZWRUaXRsZScsIFwiUGx1Z2lucyBhcmUgZGlzYWJsZWRcIik7XG5cdFx0dGhpcy5kaXNhYmxlZE1lc3NhZ2UgPSBET00uYXBwZW5kKHRoaXMuZGlzYWJsZWRDb250YWluZXIsICQoJy5lbXB0eS1zdWJ0ZXh0JykpO1xuXG5cdFx0Ly8gTGlzdCBjb250YWluZXJcblx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLm1jcC1saXN0LWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIFNlY3Rpb24gZm9vdGVyIChyZW1vdmVkIFx1MjAxNCBzZWUgc2VjdGlvbi10aXRsZS1oZWFkZXIgYXQgdG9wKVxuXG5cdFx0Ly8gQ3JlYXRlIGxpc3Rcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBQbHVnaW5JdGVtRGVsZWdhdGUoKTtcblx0XHRjb25zdCBncm91cEhlYWRlclJlbmRlcmVyID0gbmV3IEN1c3RvbWl6YXRpb25Hcm91cEhlYWRlclJlbmRlcmVyPElQbHVnaW5Hcm91cEhlYWRlckVudHJ5PigncGx1Z2luR3JvdXBIZWFkZXInLCB0aGlzLmhvdmVyU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFsbGVkUmVuZGVyZXIgPSBuZXcgUGx1Z2luSW5zdGFsbGVkSXRlbVJlbmRlcmVyKCk7XG5cdFx0Y29uc3QgcmVtb3RlUmVuZGVyZXIgPSBuZXcgUGx1Z2luUmVtb3RlSXRlbVJlbmRlcmVyKCk7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2VSZW5kZXJlciA9IG5ldyBHYWxsZXJ5SXRlbVJlbmRlcmVyPElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeT4oUExVR0lOX01BUktFVFBMQUNFX0lURU1fVEVNUExBVEVfSUQsIG5ldyBQbHVnaW5NYXJrZXRwbGFjZUl0ZW1Qcm92aWRlcih0aGlzLnBsdWdpbkluc3RhbGxTZXJ2aWNlLCB0aGlzLmFnZW50UGx1Z2luU2VydmljZSkpO1xuXG5cdFx0dGhpcy5saXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaExpc3Q8SVBsdWdpbkxpc3RFbnRyeT4sXG5cdFx0XHQnUGx1Z2luTWFuYWdlbWVudExpc3QnLFxuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRbZ3JvdXBIZWFkZXJSZW5kZXJlciwgaW5zdGFsbGVkUmVuZGVyZXIsIHJlbW90ZVJlbmRlcmVyLCBtYXJrZXRwbGFjZVJlbmRlcmVyXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVBsdWdpbkxpc3RFbnRyeSkge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwbHVnaW5Hcm91cEFyaWFMYWJlbCcsIFwiezB9LCB7MX0gaXRlbXMsIHsyfVwiLCBlbGVtZW50LmxhYmVsLCBlbGVtZW50LmNvdW50LCBlbGVtZW50LmNvbGxhcHNlZCA/IGxvY2FsaXplKCdjb2xsYXBzZWQnLCBcImNvbGxhcHNlZFwiKSA6IGxvY2FsaXplKCdleHBhbmRlZCcsIFwiZXhwYW5kZWRcIikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGZvcm1hdERpc3BsYXlOYW1lKGVsZW1lbnQuaXRlbS5uYW1lKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uID8gdHJ1bmNhdGVUb0ZpcnN0TGluZShlbGVtZW50Lml0ZW0uZGVzY3JpcHRpb24pIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZUFuZERlc2MgPSBkZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdwbHVnaW5JdGVtQXJpYUxhYmVsJywgXCJ7MH0uIHsxfVwiLCBuYW1lLCBkZXNjcmlwdGlvbilcblx0XHRcdFx0XHRcdFx0OiBuYW1lO1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ3BsdWdpbi1pdGVtJykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbmFibGVkID0gaXNDb250cmlidXRpb25FbmFibGVkKGVsZW1lbnQuaXRlbS5wbHVnaW4uZW5hYmxlbWVudC5nZXQoKSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbmFibGVkXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncGx1Z2luSW5zdGFsbGVkSXRlbUFyaWFMYWJlbEVuYWJsZWQnLCBcInswfS4gRW5hYmxlZFwiLCBuYW1lQW5kRGVzYylcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdwbHVnaW5JbnN0YWxsZWRJdGVtQXJpYUxhYmVsRGlzYWJsZWQnLCBcInswfS4gRGlzYWJsZWRcIiwgbmFtZUFuZERlc2MpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIG5hbWVBbmREZXNjO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwbHVnaW5zTGlzdEFyaWFMYWJlbCcsIFwiUGx1Z2luc1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQoZWxlbWVudDogSVBsdWdpbkxpc3RFbnRyeSkge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuaWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnbWFya2V0cGxhY2UtaXRlbScpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBtYXJrZXRwbGFjZS0ke2VsZW1lbnQuaXRlbS5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZH0vJHtlbGVtZW50Lml0ZW0uc291cmNlfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAncmVtb3RlLWl0ZW0nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50Lml0ZW0uaXRlbUtleSA/PyBgcmVtb3RlLSR7ZWxlbWVudC5pdGVtLmdyb3VwS2V5ID8/ICdkZWZhdWx0J30tJHtlbGVtZW50Lml0ZW0udXJpLnRvU3RyaW5nKCl9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50Lml0ZW0ucGx1Z2luLnVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0aWYgKGUuZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJykge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlR3JvdXAoZS5lbGVtZW50KTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ3BsdWdpbi1pdGVtJykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0UGx1Z2luLmZpcmUoZS5lbGVtZW50Lml0ZW0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZWxlbWVudC50eXBlID09PSAncmVtb3RlLWl0ZW0nKSB7XG5cdFx0XHRcdFx0Ly8gS2VlcCByb3cgYWN0aXZhdGlvbiBpbmVydCBmb3IgcmVtb3RlLWNvbmZpZ3VyZWQgcGx1Z2lucy4gTWFuYWdlbWVudFxuXHRcdFx0XHRcdC8vIGFjdGlvbnMgYXJlIHN1cmZhY2VkIHZpYSB0aGUgY29udGV4dCBtZW51IGFuZCB0b29sYmFyLlxuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZWxlbWVudC50eXBlID09PSAnbWFya2V0cGxhY2UtaXRlbScpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFBsdWdpbi5maXJlKGUuZWxlbWVudC5pdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBjb250ZXh0IG1lbnVcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlIGFzIElMaXN0Q29udGV4dE1lbnVFdmVudDxJUGx1Z2luTGlzdEVudHJ5PikpKTtcblxuXHRcdC8vIExpc3RlbiB0byBwbHVnaW4gc2VydmljZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2lucyA9IHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgcGx1Z2lucykge1xuXHRcdFx0XHRwbHVnaW4uZW5hYmxlbWVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5vbkRpZENoYW5nZU1hcmtldHBsYWNlcygoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHRoZSBhY3RpdmUgaGFybmVzcyBjaGFuZ2VzIChzeW5jIGNoZWNrYm94ZXMgbWF5IGFwcGVhci9kaXNhcHBlYXIpXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbGJhckFjdGlvbnMoKTtcblx0XHRcdGlmICghdGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gdGhlIGFjdGl2ZSBoYXJuZXNzJ3MgcmVtb3RlIGl0ZW0gcHJvdmlkZXIgcmVwb3J0cyBjaGFuZ2VzXG5cdFx0Y29uc3QgaXRlbVByb3ZpZGVyQ2hhbmdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXRlbVByb3ZpZGVyID0gdGhpcy5oYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkuaXRlbVByb3ZpZGVyO1xuXHRcdFx0aWYgKGl0ZW1Qcm92aWRlcikge1xuXHRcdFx0XHRpdGVtUHJvdmlkZXJDaGFuZ2VEaXNwb3NhYmxlLnZhbHVlID0gaXRlbVByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLnJlZnJlc2goKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXRlbVByb3ZpZGVyQ2hhbmdlRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlVG9vbGJhckFjdGlvbnMoKTtcblxuXHRcdC8vIEluaXRpYWwgcmVmcmVzaFxuXHRcdHZvaWQgdGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5xdWVyeU1hcmtldHBsYWNlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZmlsdGVyUGx1Z2lucygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWNjZXNzU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5zcGVjdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBpbnNwZWN0LnZhbHVlID8/IGluc3BlY3QuZGVmYXVsdFZhbHVlO1xuXHRcdGNvbnN0IGRpc2FibGVkID0gdmFsdWUgPT09IGZhbHNlO1xuXHRcdGNvbnN0IHBvbGljeUxvY2tlZCA9IGluc3BlY3QucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FjY2Vzcy1kaXNhYmxlZCcsIGRpc2FibGVkKTtcblxuXHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5kaXNhYmxlZEljb24uY2xhc3NOYW1lID0gJ2VtcHR5LWljb24nO1xuXHRcdFx0dGhpcy5kaXNhYmxlZEljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShwb2xpY3lMb2NrZWQgPyBDb2RpY29uLnNoaWVsZCA6IHBsdWdpbkljb24pKTtcblxuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmRpc2FibGVkTWVzc2FnZSk7XG5cdFx0XHR0aGlzLmRpc2FibGVkTGlua0xpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHRpZiAocG9saWN5TG9ja2VkKSB7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZWRNZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BsdWdpbnNEaXNhYmxlZEJ5UG9saWN5JywgXCJQbHVnaW4gaW50ZWdyYXRpb24gaW4gY2hhdCBpcyBkaXNhYmxlZCBieSB5b3VyIG9yZ2FuaXphdGlvbi4gQ29udGFjdCB5b3VyIG9yZ2FuaXphdGlvbiBhZG1pbmlzdHJhdG9yIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZWRNZXNzYWdlLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxvY2FsaXplKCdwbHVnaW5zRGlzYWJsZWRCeVNldHRpbmdQcmVmaXgnLCBcIlBsdWdpbnMgYXJlIGRpc2FibGVkIGluIHNldHRpbmdzLiBcIikpKTtcblx0XHRcdFx0Y29uc3QgbGluayA9IERPTS5hcHBlbmQodGhpcy5kaXNhYmxlZE1lc3NhZ2UsICQoJ2EubWNwLWRpc2FibGVkLXNldHRpbmdzLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0XHRcdGxpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncGx1Z2luc0Rpc2FibGVkU2V0dGluZ0xpbmsnLCBcIkNvbmZpZ3VyZSBpbiBzZXR0aW5ncy5cIik7XG5cdFx0XHRcdGxpbmsuaHJlZiA9ICcjJztcblx0XHRcdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZWRMaW5rTGlzdGVuZXIudmFsdWUgPSBET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgYEBpZDoke0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbnNFbmFibGVkfWApO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBwbHVnaW5BY3Rpb25zKCk6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5oYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkucGx1Z2luQWN0aW9ucyA/PyBbXTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0QWN0aW9uTGFiZWwoYWN0aW9uOiBJQ3VzdG9taXphdGlvbkl0ZW1BY3Rpb24sIGljb25Pbmx5ID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdGlmICghYWN0aW9uLmljb24pIHtcblx0XHRcdHJldHVybiBhY3Rpb24ubGFiZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGljb25Pbmx5XG5cdFx0XHQ/IGAkKCR7YWN0aW9uLmljb24uaWR9KWBcblx0XHRcdDogYCQoJHthY3Rpb24uaWNvbi5pZH0pICR7YWN0aW9uLmxhYmVsfWA7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRvb2xiYXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGJyb3dzZU1hcmtldHBsYWNlQXZhaWxhYmxlID0gdGhpcy5pc0Jyb3dzZU1hcmtldHBsYWNlQXZhaWxhYmxlKCk7XG5cdFx0aWYgKCFicm93c2VNYXJrZXRwbGFjZUF2YWlsYWJsZSAmJiB0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZShmYWxzZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5icm93c2VCdXR0b24uZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gdGhpcy5icm93c2VNb2RlID8gJ25vbmUnIDogJyc7XG5cdFx0dGhpcy5icm93c2VCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24ubGlicmFyeS5pZH0pICR7bG9jYWxpemUoJ2Jyb3dzZU1hcmtldHBsYWNlJywgXCJCcm93c2UgTWFya2V0cGxhY2VcIil9YDtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbmFibGVkID0gYnJvd3NlTWFya2V0cGxhY2VBdmFpbGFibGU7XG5cdFx0Y29uc3QgYnJvd3NlVGl0bGUgPSBicm93c2VNYXJrZXRwbGFjZUF2YWlsYWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnYnJvd3NlTWFya2V0cGxhY2UnLCBcIkJyb3dzZSBNYXJrZXRwbGFjZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYnJvd3NlTWFya2V0cGxhY2VVbnN1cHBvcnRlZFdlYicsIFwiQnJvd3NlIE1hcmtldHBsYWNlIGlzIG5vdCBhdmFpbGFibGUgaW4gVlMgQ29kZSBmb3IgdGhlIFdlYi5cIik7XG5cdFx0dGhpcy5icm93c2VCdXR0b24uc2V0VGl0bGUoYnJvd3NlVGl0bGUpO1xuXHRcdHRoaXMuYnJvd3NlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYnJvd3NlVGl0bGUpO1xuXG5cdFx0dGhpcy51cGRhdGVBZGRCdXR0b24oKTtcblx0XHR0aGlzLmNyZWF0ZVBsdWdpbkJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgaXNCcm93c2VNYXJrZXRwbGFjZUF2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIWlzV2ViO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBZGRCdXR0b24oKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuYnVpbGRBZGRBY3Rpb25zKCk7XG5cdFx0Y29uc3QgW3ByaW1hcnksIC4uLmRyb3Bkb3duXSA9IGFjdGlvbnM7XG5cdFx0Y29uc3QgaGFzRHJvcGRvd24gPSBkcm9wZG93bi5sZW5ndGggPiAwO1xuXG5cdFx0dGhpcy5hZGRCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gaGFzRHJvcGRvd24gPyAnJyA6ICdub25lJztcblx0XHR0aGlzLmFkZEJ1dHRvblNpbXBsZS5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBoYXNEcm9wZG93biA/ICdub25lJyA6ICcnO1xuXG5cdFx0aWYgKCFwcmltYXJ5KSB7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvblNpbXBsZS5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGhhc0Ryb3Bkb3duKSB7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvbi5sYWJlbCA9IHRoaXMuZm9ybWF0QWN0aW9uTGFiZWwocHJpbWFyeSk7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvbi5lbmFibGVkID0gcHJpbWFyeS5lbmFibGVkICE9PSBmYWxzZTtcblx0XHRcdGNvbnN0IGFkZFByaW1hcnlUaXRsZSA9IHByaW1hcnkudG9vbHRpcCA/PyBwcmltYXJ5LmxhYmVsO1xuXHRcdFx0dGhpcy5hZGRCdXR0b24ucHJpbWFyeUJ1dHRvbi5zZXRUaXRsZShhZGRQcmltYXJ5VGl0bGUpO1xuXHRcdFx0dGhpcy5hZGRCdXR0b24ucHJpbWFyeUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFkZFByaW1hcnlUaXRsZSk7XG5cdFx0XHRjb25zdCBtb3JlTGFiZWwgPSBsb2NhbGl6ZSgnbW9yZVBsdWdpbkFkZEFjdGlvbnMnLCBcIk1vcmUgUGx1Z2luIEFkZCBBY3Rpb25zLi4uXCIpO1xuXHRcdFx0dGhpcy5hZGRCdXR0b24uZHJvcGRvd25CdXR0b24uc2V0VGl0bGUobW9yZUxhYmVsKTtcblx0XHRcdHRoaXMuYWRkQnV0dG9uLmRyb3Bkb3duQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbW9yZUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUubGFiZWwgPSB0aGlzLmZvcm1hdEFjdGlvbkxhYmVsKHByaW1hcnkpO1xuXHRcdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUuZW5hYmxlZCA9IHByaW1hcnkuZW5hYmxlZCAhPT0gZmFsc2U7XG5cdFx0XHRjb25zdCBhZGRTaW1wbGVUaXRsZSA9IHByaW1hcnkudG9vbHRpcCA/PyBwcmltYXJ5LmxhYmVsO1xuXHRcdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUuc2V0VGl0bGUoYWRkU2ltcGxlVGl0bGUpO1xuXHRcdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhZGRTaW1wbGVUaXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBidWlsZEFkZEFjdGlvbnMoKTogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtQWN0aW9uW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHQuLi50aGlzLnBsdWdpbkFjdGlvbnMsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAncGx1Z2luLmluc3RhbGxGcm9tU291cmNlJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsRnJvbVNvdXJjZScsIFwiSW5zdGFsbCBQbHVnaW4gZnJvbSBTb3VyY2VcIiksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdpbnN0YWxsRnJvbVNvdXJjZScsIFwiSW5zdGFsbCBQbHVnaW4gZnJvbSBTb3VyY2VcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uYWRkLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPGJvb2xlYW4+KCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaW5zdGFsbFBsdWdpbkZyb21Tb3VyY2UnLCB7IHNraXBSZXZlYWw6IHRydWUgfSk7XG5cdFx0XHRcdFx0Ly8gUmV0dXJuIHRvIHRoZSBpbnN0YWxsZWQgbGlzdCBzbyB0aGUgbmV3bHkgaW5zdGFsbGVkIHBsdWdpbiBpc1xuXHRcdFx0XHRcdC8vIHZpc2libGUgXHUyMDE0IHNvdXJjZS1pbnN0YWxsZWQgcGx1Z2lucyBtYXkgbm90IGFwcGVhciBpbiB0aGUgbWFya2V0cGxhY2UuXG5cdFx0XHRcdFx0aWYgKGluc3RhbGxlZCAmJiB0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuZXhpdEJyb3dzZU1vZGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGdldEFkZERyb3Bkb3duQWN0aW9ucygpOiBBY3Rpb25bXSB7XG5cdFx0dGhpcy5hZGREcm9wZG93bkFjdGlvbnMuY2xlYXIoKTtcblx0XHRyZXR1cm4gdGhpcy5idWlsZEFkZEFjdGlvbnMoKS5zbGljZSgxKS5tYXAoKGFjdGlvbiwgaW5kZXgpID0+IHRoaXMuYWRkRHJvcGRvd25BY3Rpb25zLmFkZChuZXcgQWN0aW9uKGBwbHVnaW5fYWRkXyR7aW5kZXh9YCwgdGhpcy5mb3JtYXRBY3Rpb25MYWJlbChhY3Rpb24pLCB1bmRlZmluZWQsIGFjdGlvbi5lbmFibGVkICE9PSBmYWxzZSwgKCkgPT4gdGhpcy5ydW5QbHVnaW5BY3Rpb24oYWN0aW9uKSkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuUHJpbWFyeUJ1dHRvbkFjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaXNCcm93c2VNYXJrZXRwbGFjZUF2YWlsYWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50b2dnbGVCcm93c2VNb2RlKCF0aGlzLmJyb3dzZU1vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBydW5QcmltYXJ5QWRkQWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IFtwcmltYXJ5XSA9IHRoaXMuYnVpbGRBZGRBY3Rpb25zKCk7XG5cdFx0aWYgKHByaW1hcnkpIHtcblx0XHRcdGF3YWl0IHRoaXMucnVuUGx1Z2luQWN0aW9uKHByaW1hcnkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuQ3JlYXRlUGx1Z2luQWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jcmVhdGVQbHVnaW4nKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuVXBkYXRlUGx1Z2luc0FjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnVwZGF0ZVBsdWdpbnNCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFVwZGF0ZUFnZW50UGx1Z2luc0NvbW1hbmRJZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMudXBkYXRlUGx1Z2luc0J1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1blBsdWdpbkFjdGlvbihhY3Rpb246IElDdXN0b21pemF0aW9uSXRlbUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhY3Rpb24uZW5hYmxlZCAhPT0gZmFsc2UpIHtcblx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvd0Jyb3dzZU1hcmtldHBsYWNlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc0Jyb3dzZU1hcmtldHBsYWNlQXZhaWxhYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUJyb3dzZU1vZGUoYnJvd3NlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5icm93c2VNb2RlID0gYnJvd3NlO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQudmFsdWUgPSAnJztcblx0XHR0aGlzLnNlYXJjaFF1ZXJ5ID0gJyc7XG5cblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbGVtZW50LnBhcmVudEVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLmJhY2tCdXR0b24uZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gYnJvd3NlID8gJycgOiAnbm9uZSc7XG5cblx0XHR0aGlzLnNlYXJjaElucHV0LnNldFBsYWNlSG9sZGVyKGJyb3dzZVxuXHRcdFx0PyBsb2NhbGl6ZSgnc2VhcmNoTWFya2V0cGxhY2VQbGFjZWhvbGRlcicsIFwiU2VhcmNoIHBsdWdpbiBtYXJrZXRwbGFjZS4uLlwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnc2VhcmNoUGx1Z2luc1BsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaC4uLlwiKVxuXHRcdCk7XG5cblx0XHRpZiAoYnJvd3NlKSB7XG5cdFx0XHR2b2lkIHRoaXMucXVlcnlNYXJrZXRwbGFjZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1hcmtldHBsYWNlQ3RzPy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0dGhpcy5tYXJrZXRwbGFjZUl0ZW1zID0gW107XG5cdFx0XHR2b2lkIHRoaXMuZmlsdGVyUGx1Z2lucygpO1xuXHRcdH1cblxuXHRcdC8vIFJlLWxheW91dCB0byBhY2NvdW50IGZvciB0aGUgYmFjayBsaW5rIGhlaWdodCBjaGFuZ2Vcblx0XHRpZiAodGhpcy5sYXN0SGVpZ2h0ID4gMCkge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5sYXN0SGVpZ2h0LCB0aGlzLmxhc3RXaWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeU1hcmtldHBsYWNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubWFya2V0cGxhY2VDdHM/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5tYXJrZXRwbGFjZUN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Ly8gU2hvdyBsb2FkaW5nIHN0YXRlXG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZW1wdHlUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xvYWRpbmdNYXJrZXRwbGFjZScsIFwiTG9hZGluZyBtYXJrZXRwbGFjZS4uLlwiKTtcblx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5mZXRjaE1hcmtldHBsYWNlUGx1Z2lucyhjdHMudG9rZW4pO1xuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFF1ZXJ5LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXHRcdFx0Y29uc3QgZmlsdGVyZWQgPSBxdWVyeVxuXHRcdFx0XHQ/IHBsdWdpbnMuZmlsdGVyKHAgPT4gcC5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpIHx8IHAuZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkpXG5cdFx0XHRcdDogcGx1Z2lucztcblxuXHRcdFx0Ly8gRmlsdGVyIG91dCBhbHJlYWR5LWluc3RhbGxlZCBwbHVnaW5zXG5cdFx0XHRjb25zdCBpbnN0YWxsZWRVcmlzID0gbmV3IFNldCh0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpLm1hcChwID0+IHAudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdHRoaXMubWFya2V0cGxhY2VJdGVtcyA9IGZpbHRlcmVkXG5cdFx0XHRcdC5maWx0ZXIocCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRVcmkgPSB0aGlzLnBsdWdpbkluc3RhbGxTZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkocCk7XG5cdFx0XHRcdFx0cmV0dXJuICFpbnN0YWxsZWRVcmlzLmhhcyhleHBlY3RlZFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0Lm1hcChtYXJrZXRwbGFjZVBsdWdpblRvSXRlbSk7XG5cblx0XHRcdHRoaXMudXBkYXRlTWFya2V0cGxhY2VMaXN0KCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLm1hcmtldHBsYWNlSXRlbXMgPSBbXTtcblx0XHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWFya2V0cGxhY2VFcnJvcicsIFwiVW5hYmxlIHRvIGxvYWQgbWFya2V0cGxhY2VcIik7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RyeUFnYWluTGF0ZXInLCBcIkNoZWNrIHlvdXIgY29ubmVjdGlvbiBhbmQgdHJ5IGFnYWluXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWFya2V0cGxhY2VMaXN0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1hcmtldHBsYWNlSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGlmICh0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub01hcmtldHBsYWNlUmVzdWx0cycsIFwiTm8gcGx1Z2lucyBtYXRjaCAnezB9J1wiLCB0aGlzLnNlYXJjaFF1ZXJ5KTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndHJ5RGlmZmVyZW50U2VhcmNoJywgXCJUcnkgYSBkaWZmZXJlbnQgc2VhcmNoIHRlcm1cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdlbXB0eU1hcmtldHBsYWNlJywgXCJObyBwbHVnaW5zIGF2YWlsYWJsZVwiKTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBJUGx1Z2luTGlzdEVudHJ5W10gPSB0aGlzLm1hcmtldHBsYWNlSXRlbXMubWFwKGl0ZW0gPT4gKHsgdHlwZTogJ21hcmtldHBsYWNlLWl0ZW0nIGFzIGNvbnN0LCBpdGVtIH0pKTtcblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIGVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZW1vdGVQbHVnaW5JdGVtcyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGlmICghdGhpcy5oYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkuaXRlbVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkID0gYXdhaXQgdGhpcy5pdGVtc01vZGVsLmdldEFjdGl2ZUl0ZW1Tb3VyY2UoKS5mZXRjaFByb3ZpZGVySXRlbXMoKTtcblx0XHRcdHJldHVybiBwcm92aWRlZC5maWx0ZXIoaXRlbSA9PlxuXHRcdFx0XHRpc1BsdWdpbkN1c3RvbWl6YXRpb25JdGVtKGl0ZW0pXG5cdFx0XHRcdCYmICghcXVlcnlcblx0XHRcdFx0XHR8fCBpdGVtLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcblx0XHRcdFx0XHR8fCBpdGVtLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KVxuXHRcdFx0XHRcdHx8IGl0ZW0uYmFkZ2U/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpKVxuXHRcdFx0KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlbW90ZUdyb3VwTWV0YWRhdGEoZ3JvdXBLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgZ3JvdXA6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z3JvdXA6IGdyb3VwS2V5ID8/ICdyZW1vdGUtaG9zdCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlbW90ZUhvc3RHcm91cCcsIFwiUmVtb3RlXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVIb3N0R3JvdXBEZXNjcmlwdGlvbicsIFwiUGx1Z2lucyBjb25maWd1cmVkIGRpcmVjdGx5IG9uIHRoZSByZW1vdGUgYWdlbnQgaG9zdCBhbmQgYXZhaWxhYmxlIHdpdGhvdXQgbG9jYWwgc3luYy5cIiksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kR3JvdXAoZW50cmllczogSVBsdWdpbkxpc3RFbnRyeVtdLCBoZWFkZXI6IHsgZ3JvdXA6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9LCBpdGVtczogcmVhZG9ubHkgSVBsdWdpbkxpc3RFbnRyeVtdLCBpc0ZpcnN0OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGlzRmlyc3Q7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5jb2xsYXBzZWRHcm91cHMuaGFzKGhlYWRlci5ncm91cCk7XG5cdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdHR5cGU6ICdncm91cC1oZWFkZXInLFxuXHRcdFx0aWQ6IGBwbHVnaW4tZ3JvdXAtJHtoZWFkZXIuZ3JvdXB9YCxcblx0XHRcdGdyb3VwOiBoZWFkZXIuZ3JvdXAsXG5cdFx0XHRsYWJlbDogaGVhZGVyLmxhYmVsLFxuXHRcdFx0aWNvbjogcGx1Z2luSWNvbixcblx0XHRcdGNvdW50OiBpdGVtcy5sZW5ndGgsXG5cdFx0XHRpc0ZpcnN0LFxuXHRcdFx0ZGVzY3JpcHRpb246IGhlYWRlci5kZXNjcmlwdGlvbixcblx0XHRcdGNvbGxhcHNlZCxcblx0XHR9KTtcblx0XHRpZiAoIWNvbGxhcHNlZCkge1xuXHRcdFx0ZW50cmllcy5wdXNoKC4uLml0ZW1zKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmaWx0ZXJQbHVnaW5zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hRdWVyeS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblx0XHRjb25zdCBhbGxQbHVnaW5zID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKTtcblx0XHR0aGlzLnJlbW90ZUl0ZW1zID0gWy4uLmF3YWl0IHRoaXMuZ2V0UmVtb3RlUGx1Z2luSXRlbXMocXVlcnkpXTtcblxuXHRcdHRoaXMuaW5zdGFsbGVkSXRlbXMgPSBhbGxQbHVnaW5zXG5cdFx0XHQubWFwKHAgPT4gaW5zdGFsbGVkUGx1Z2luVG9JdGVtKHAsIHRoaXMubGFiZWxTZXJ2aWNlKSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiAhcXVlcnkgfHxcblx0XHRcdFx0aXRlbS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpIHx8XG5cdFx0XHRcdGl0ZW0uZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcblx0XHRcdCk7XG5cblx0XHRpZiAodGhpcy5yZW1vdGVJdGVtcy5sZW5ndGggPT09IDAgJiYgdGhpcy5pbnN0YWxsZWRJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hRdWVyeS50cmltKCkpIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9NYXRjaGluZ1BsdWdpbnMnLCBcIk5vIHBsdWdpbnMgbWF0Y2ggJ3swfSdcIiwgdGhpcy5zZWFyY2hRdWVyeSk7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RyeURpZmZlcmVudFNlYXJjaCcsIFwiVHJ5IGEgZGlmZmVyZW50IHNlYXJjaCB0ZXJtXCIpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmhhcm5lc3NTZXJ2aWNlLmdldEFjdGl2ZURlc2NyaXB0b3IoKS5pdGVtUHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9SZW1vdGVQbHVnaW5zJywgXCJObyBwbHVnaW5zIGNvbmZpZ3VyZWRcIik7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FkZFJlbW90ZVBsdWdpbnMnLCBcIlVzZSB0aGUgdG9vbGJhciB0byBhZGQgcmVtb3RlIHBsdWdpbnMgb3IgaW5zdGFsbCBwbHVnaW5zIGZyb20gYSBzb3VyY2UuXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9QbHVnaW5zJywgXCJObyBwbHVnaW5zIGluc3RhbGxlZFwiKTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYnJvd3NlVG9BZGQnLCBcIkJyb3dzZSB0aGUgbWFya2V0cGxhY2UgdG8gZGlzY292ZXIgYW5kIGluc3RhbGwgcGx1Z2luc1wiKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cblx0XHQvLyBHcm91cCBwbHVnaW5zOiBlbmFibGVkIHZzIGRpc2FibGVkXG5cdFx0Y29uc3QgZW5hYmxlZFBsdWdpbnMgPSB0aGlzLmluc3RhbGxlZEl0ZW1zLmZpbHRlcihpdGVtID0+IGlzQ29udHJpYnV0aW9uRW5hYmxlZChpdGVtLnBsdWdpbi5lbmFibGVtZW50LmdldCgpKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRQbHVnaW5zID0gdGhpcy5pbnN0YWxsZWRJdGVtcy5maWx0ZXIoaXRlbSA9PiAhaXNDb250cmlidXRpb25FbmFibGVkKGl0ZW0ucGx1Z2luLmVuYWJsZW1lbnQuZ2V0KCkpKTtcblxuXHRcdGNvbnN0IGVudHJpZXM6IElQbHVnaW5MaXN0RW50cnlbXSA9IFtdO1xuXHRcdGxldCBpc0ZpcnN0ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZE5hbWVzID0gbmV3IFNldCh0aGlzLmluc3RhbGxlZEl0ZW1zLm1hcChpdGVtID0+IGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0Y29uc3QgcmVtb3RlR3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIElQbHVnaW5SZW1vdGVJdGVtRW50cnlbXT4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5yZW1vdGVJdGVtcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gaXRlbS5ncm91cEtleSA/PyAncmVtb3RlLWhvc3QnO1xuXHRcdFx0aWYgKGtleSA9PT0gJ3JlbW90ZS1jbGllbnQnKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBjbGllbnQtc3luY2VkIGl0ZW1zIGFyZSBhbHJlYWR5IHNob3duIGluIFwiRW5hYmxlZCBMb2NhbGx5XCJcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtLm5hbWUgJiYgaW5zdGFsbGVkTmFtZXMuaGFzKGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gcGx1Z2luIGlzIGFsc28gbG9jYWxseSBpbnN0YWxsZWQ7IHNob3cgaXQgb25jZSBpbiBcIkVuYWJsZWQgTG9jYWxseVwiXG5cdFx0XHR9XG5cdFx0XHRsZXQgZ3JvdXAgPSByZW1vdGVHcm91cHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwID0gW107XG5cdFx0XHRcdHJlbW90ZUdyb3Vwcy5zZXQoa2V5LCBncm91cCk7XG5cdFx0XHR9XG5cdFx0XHRncm91cC5wdXNoKHsgdHlwZTogJ3JlbW90ZS1pdGVtJywgaXRlbSB9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXBLZXksIGl0ZW1zXSBvZiByZW1vdGVHcm91cHMpIHtcblx0XHRcdGlzRmlyc3QgPSB0aGlzLmFwcGVuZEdyb3VwKGVudHJpZXMsIHRoaXMuZ2V0UmVtb3RlR3JvdXBNZXRhZGF0YShncm91cEtleSksIGl0ZW1zLCBpc0ZpcnN0KTtcblx0XHR9XG5cblx0XHRpZiAoZW5hYmxlZFBsdWdpbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aXNGaXJzdCA9IHRoaXMuYXBwZW5kR3JvdXAoXG5cdFx0XHRcdGVudHJpZXMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRncm91cDogJ2VuYWJsZWQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZW5hYmxlZEdyb3VwJywgXCJFbmFibGVkIExvY2FsbHlcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlbmFibGVkR3JvdXBEZXNjcmlwdGlvbicsIFwiUGx1Z2lucyBpbnN0YWxsZWQgaW4gdGhpcyBjbGllbnQgYW5kIGF2YWlsYWJsZSBmb3Igc3luY2luZyB0byB0aGUgcmVtb3RlIHNlc3Npb24uXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmFibGVkUGx1Z2lucy5tYXAoaXRlbSA9PiAoeyB0eXBlOiAncGx1Z2luLWl0ZW0nIGFzIGNvbnN0LCBpdGVtIH0pKSxcblx0XHRcdFx0aXNGaXJzdCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRpc2FibGVkUGx1Z2lucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmFwcGVuZEdyb3VwKFxuXHRcdFx0XHRlbnRyaWVzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Z3JvdXA6ICdkaXNhYmxlZCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaXNhYmxlZEdyb3VwJywgXCJEaXNhYmxlZCBMb2NhbGx5XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZWRHcm91cERlc2NyaXB0aW9uJywgXCJQbHVnaW5zIGluc3RhbGxlZCBpbiB0aGlzIGNsaWVudCBidXQgY3VycmVudGx5IGRpc2FibGVkLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzYWJsZWRQbHVnaW5zLm1hcChpdGVtID0+ICh7IHR5cGU6ICdwbHVnaW4taXRlbScgYXMgY29uc3QsIGl0ZW0gfSkpLFxuXHRcdFx0XHRpc0ZpcnN0LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3BsYXlFbnRyaWVzID0gZW50cmllcztcblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIHRoaXMuZGlzcGxheUVudHJpZXMpO1xuXG5cdFx0Ly8gQ29tcHV0ZSBzaWRlYmFyIGJhZGdlIGRpcmVjdGx5IGZyb20gdGhlIGRhdGEgYXJyYXkgKHNhbWUgc291cmNlIGFzIGdyb3VwIGhlYWRlcnMpXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZSh0aGlzLml0ZW1Db3VudCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgdG90YWwgaXRlbSBjb3VudCBmcm9tIHRoZSB1bmRlcmx5aW5nIGRhdGEgYXJyYXlcblx0ICogKHRoZSBzYW1lIHNvdXJjZSB1c2VkIHRvIGJ1aWxkIGdyb3VwIGhlYWRlcnMpLlxuXHQgKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGluc3RhbGxlZE5hbWVzID0gbmV3IFNldCh0aGlzLmluc3RhbGxlZEl0ZW1zLm1hcChpdGVtID0+IGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0Y29uc3QgdW5pcXVlUmVtb3RlID0gdGhpcy5yZW1vdGVJdGVtcy5maWx0ZXIoaXRlbSA9PiB7XG5cdFx0XHRpZiAoaXRlbS5ncm91cEtleSA9PT0gJ3JlbW90ZS1jbGllbnQnKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtLm5hbWUgJiYgaW5zdGFsbGVkTmFtZXMuaGFzKGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdW5pcXVlUmVtb3RlLmxlbmd0aCArIHRoaXMuaW5zdGFsbGVkSXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWZpcmVzIHRoZSBjdXJyZW50IGl0ZW0gY291bnQuIENhbGwgYWZ0ZXIgc3Vic2NyaWJpbmcgdG8gb25EaWRDaGFuZ2VJdGVtQ291bnRcblx0ICogdG8gZW5zdXJlIHRoZSBzdWJzY3JpYmVyIHJlY2VpdmVzIHRoZSBsYXRlc3QgY291bnQuXG5cdCAqL1xuXHRmaXJlSXRlbUNvdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUodGhpcy5pdGVtQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVHcm91cChlbnRyeTogSVBsdWdpbkdyb3VwSGVhZGVyRW50cnkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb2xsYXBzZWRHcm91cHMuaGFzKGVudHJ5Lmdyb3VwKSkge1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuZGVsZXRlKGVudHJ5Lmdyb3VwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuYWRkKGVudHJ5Lmdyb3VwKTtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLmZpbHRlclBsdWdpbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB3aWRnZXQgaXMgY3VycmVudGx5IGluIG1hcmtldHBsYWNlIGJyb3dzZSBtb2RlLlxuXHQgKi9cblx0aXNJbkJyb3dzZU1vZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlTW9kZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeGl0cyBtYXJrZXRwbGFjZSBicm93c2UgbW9kZSBhbmQgcmV0dXJucyB0byB0aGUgaW5zdGFsbGVkIHBsdWdpbnMgbGlzdC5cblx0ICovXG5cdGV4aXRCcm93c2VNb2RlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMubGFzdFdpZHRoID0gd2lkdGg7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRcdC8vIE1lYXN1cmUgc2libGluZyBlbGVtZW50cyB0byBjYWxjdWxhdGUgdGhlIGxpc3QgaGVpZ2h0LlxuXHRcdC8vIFdoZW4gb2Zmc2V0SGVpZ2h0IHJldHVybnMgMCB0aGUgY29udGFpbmVyIG1heSBoYXZlIGp1c3QgYmVjb21lIHZpc2libGVcblx0XHQvLyBhZnRlciBkaXNwbGF5Om5vbmUgYW5kIHRoZSBicm93c2VyIGhhc24ndCByZWZsb3dlZCB5ZXQgXHUyMDE0IGRlZmVyIGxheW91dFxuXHRcdC8vIG9uY2Ugc28gbWVhc3VyZW1lbnRzIGFyZSBhY2N1cmF0ZS4gT25seSByZXRyeSBvbmNlIHRvIGF2b2lkIGFuIGVuZGxlc3Ncblx0XHQvLyBsb29wIHdoZW4gdGhlIHdpZGdldCBpcyBjcmVhdGVkIHdoaWxlIHBlcm1hbmVudGx5IGhpZGRlbi5cblx0XHRjb25zdCBzZWFyY2hCYXJIZWlnaHQgPSB0aGlzLnNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0aWYgKHNlYXJjaEJhckhlaWdodCA9PT0gMCAmJiAhdGhpcy5fbGF5b3V0RGVmZXJyZWQpIHtcblx0XHRcdHRoaXMuX2xheW91dERlZmVycmVkID0gdHJ1ZTtcblx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5lbGVtZW50KS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMubGFzdEhlaWdodCwgdGhpcy5sYXN0V2lkdGgpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2xheW91dERlZmVycmVkID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLnNlY3Rpb25UaXRsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0dGhpcy5sYXN0SGVhZGVySGVpZ2h0ID0gaGVhZGVySGVpZ2h0O1xuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSBNYXRoLm1heCgwLCBoZWlnaHQgLSBzZWFyY2hCYXJIZWlnaHQgLSBoZWFkZXJIZWlnaHQpO1xuXG5cdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2xpc3RIZWlnaHR9cHhgO1xuXHRcdHRoaXMubGlzdC5sYXlvdXQobGlzdEhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0Zm9jdXNTZWFyY2goKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0cmV2ZWFsTGFzdEl0ZW0oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3QucmV2ZWFsKHRoaXMubGlzdC5sZW5ndGggLSAxKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0XHRpZiAodGhpcy5saXN0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SVBsdWdpbkxpc3RFbnRyeT4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCB8fCBlLmVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicgfHwgZS5lbGVtZW50LnR5cGUgPT09ICdtYXJrZXRwbGFjZS1pdGVtJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gZS5lbGVtZW50O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0aWYgKGVudHJ5LnR5cGUgPT09ICdwbHVnaW4taXRlbScpIHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucyhlbnRyeS5pdGVtLnBsdWdpbiwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb25zIG9mIGdyb3Vwcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb24gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobWVudUFjdGlvbik7XG5cdFx0XHRcdFx0aWYgKGlzRGlzcG9zYWJsZShtZW51QWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1lbnVBY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDAgJiYgYWN0aW9uc1thY3Rpb25zLmxlbmd0aCAtIDFdIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGFjdGlvbnMucG9wKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGl0ZW1BY3Rpb25zID0gZW50cnkuaXRlbS5hY3Rpb25zID8/IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtQWN0aW9uIG9mIGl0ZW1BY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdGl0ZW1BY3Rpb24uaWQsXG5cdFx0XHRcdFx0aXRlbUFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRpdGVtQWN0aW9uLmljb24gPyBUaGVtZUljb24uYXNDbGFzc05hbWUoaXRlbUFjdGlvbi5pY29uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpdGVtQWN0aW9uLmVuYWJsZWQgIT09IGZhbHNlLFxuXHRcdFx0XHRcdCgpID0+IGl0ZW1BY3Rpb24ucnVuKCksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFFBQVEsMEJBQTBCO0FBQzNDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsUUFBaUIsaUJBQWlCO0FBQzNDLFNBQVMsVUFBVSxTQUFTLGVBQWU7QUFDM0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQXVCLDJCQUEyQjtBQUNsRCxTQUFTLDZC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
