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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, disposeIfDisposable, isDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { autorun, derived } from "../../../../base/common/observable.js";
import { PagedModel } from "../../../../base/common/paging.js";
import { dirname } from "../../../../base/common/resources.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchPagedList } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { getLocationBasedViewColors } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService, Extensions as ViewExtensions } from "../../../common/views.js";
import { getWorkbenchMenuMotionContextMenuOptions } from "../../../browser/actions/menuMotion.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VIEW_CONTAINER } from "../../extensions/browser/extensions.contribution.js";
import { manageExtensionIcon } from "../../extensions/browser/extensionsIcons.js";
import { AbstractExtensionsListView } from "../../extensions/browser/extensionsViews.js";
import { DefaultViewsContext, extensionsFilterSubMenu, IExtensionsWorkbenchService, SearchAgentPluginsContext } from "../../extensions/common/extensions.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { IAgentPluginService } from "../common/plugins/agentPluginService.js";
import { isContributionEnabled } from "../common/enablement.js";
import { IPluginInstallService } from "../common/plugins/pluginInstallService.js";
import { hasSourceChanged, IPluginMarketplaceService } from "../common/plugins/pluginMarketplaceService.js";
import { AgentPluginEditorInput } from "./agentPluginEditor/agentPluginEditorInput.js";
import { AgentPluginItemKind } from "./agentPluginEditor/agentPluginItems.js";
import { getInstalledPluginContextMenuActions, InstallPluginAction, OpenPluginReadmeAction } from "./agentPluginActions.js";
import { HasInstalledAgentPluginsContext, InstalledAgentPluginsViewId, RefreshAgentPluginMarketplacesCommandId } from "./chat.js";
function installedPluginToItem(plugin, labelService, outdated) {
  const name = plugin.label;
  const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
  const marketplace = plugin.fromMarketplace?.marketplace;
  return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin, outdated };
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
let UpdatePluginAction = class extends Action {
  constructor(plugin, liveMarketplacePlugin, pluginInstallService, pluginMarketplaceService) {
    super(UpdatePluginAction.ID, localize("update", "Update"), "extension-action label prominent install");
    this.plugin = plugin;
    this.liveMarketplacePlugin = liveMarketplacePlugin;
    this.pluginInstallService = pluginInstallService;
    this.pluginMarketplaceService = pluginMarketplaceService;
  }
  async run() {
    if (await this.pluginInstallService.updatePlugin(this.liveMarketplacePlugin)) {
      this.pluginMarketplaceService.addInstalledPlugin(this.plugin.uri, this.liveMarketplacePlugin);
    }
  }
};
UpdatePluginAction.ID = "agentPlugin.update";
UpdatePluginAction = __decorateClass([
  __decorateParam(2, IPluginInstallService),
  __decorateParam(3, IPluginMarketplaceService)
], UpdatePluginAction);
let ManagePluginAction = class extends Action {
  constructor(getActionGroups, instantiationService) {
    super(ManagePluginAction.ID, "", ManagePluginAction.CLASS, true);
    this.getActionGroups = getActionGroups;
    this.instantiationService = instantiationService;
    this._actionViewItem = null;
    this.tooltip = localize("manage", "Manage");
  }
  createActionViewItem(options) {
    this._actionViewItem = this.instantiationService.createInstance(DropDownActionViewItem, this, options);
    return this._actionViewItem;
  }
  async run() {
    this._actionViewItem?.showMenu(this.getActionGroups());
  }
};
ManagePluginAction.ID = "agentPlugin.manage";
ManagePluginAction.CLASS = `extension-action icon manage ${ThemeIcon.asClassName(manageExtensionIcon)}`;
ManagePluginAction = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ManagePluginAction);
let DropDownActionViewItem = class extends ActionViewItem {
  constructor(action, options, contextMenuService) {
    super(null, action, { ...options, icon: true, label: false });
    this.contextMenuService = contextMenuService;
  }
  showMenu(actionGroups) {
    if (!this.element) {
      return;
    }
    const actions = actionGroups.flatMap((group) => [...group, new Separator()]);
    if (actions.length > 0) {
      actions.pop();
    }
    this.contextMenuService.showContextMenu({
      ...getWorkbenchMenuMotionContextMenuOptions(this.element),
      getActions: () => actions,
      onHide: () => disposeIfDisposable(actions)
    });
  }
};
DropDownActionViewItem = __decorateClass([
  __decorateParam(2, IContextMenuService)
], DropDownActionViewItem);
let AgentPluginRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = AgentPluginRenderer.templateId;
  }
  renderTemplate(root) {
    const element = dom.append(root, dom.$(".agent-plugin-item.extension-list-item"));
    const details = dom.append(element, dom.$(".details"));
    const headerContainer = dom.append(details, dom.$(".header-container"));
    const header = dom.append(headerContainer, dom.$(".header"));
    const name = dom.append(header, dom.$("span.name"));
    const description = dom.append(details, dom.$(".description.ellipsis"));
    const footer = dom.append(details, dom.$(".footer"));
    const detailContainer = dom.append(footer, dom.$(".publisher-container"));
    const detail = dom.append(detailContainer, dom.$("span.publisher-name"));
    const actionbar = new ActionBar(footer, {
      focusOnlyEnabledItems: true,
      actionViewItemProvider: (action, options) => {
        if (action instanceof ManagePluginAction) {
          return action.createActionViewItem(options);
        }
        return void 0;
      }
    });
    actionbar.setFocusable(false);
    return { root, name, description, detail, actionbar, disposables: [actionbar], elementDisposables: [] };
  }
  renderPlaceholder(_index, data) {
    data.name.textContent = "";
    data.description.textContent = "";
    data.detail.textContent = "";
    data.actionbar.clear();
    this.disposeElement(void 0, 0, data);
  }
  renderElement(element, _index, data) {
    this.disposeElement(void 0, 0, data);
    data.name.textContent = element.name;
    data.description.textContent = element.description;
    data.elementDisposables.push(autorun((reader) => {
      data.root.classList.toggle("disabled", element.kind === AgentPluginItemKind.Installed && !isContributionEnabled(element.plugin.enablement.read(reader)));
    }));
    const updateActions = (reader) => {
      data.actionbar.clear();
      if (element.kind === AgentPluginItemKind.Marketplace) {
        data.detail.textContent = element.marketplace;
        const installAction = this.instantiationService.createInstance(InstallPluginAction, element);
        reader.store.add(installAction);
        data.actionbar.push([installAction], { icon: true, label: true });
      } else {
        data.detail.textContent = element.marketplace ?? "";
        const actions = [];
        const livePlugin = element.outdated?.read(reader);
        if (livePlugin) {
          const updateAction = this.instantiationService.createInstance(UpdatePluginAction, element.plugin, livePlugin);
          reader.store.add(updateAction);
          actions.push(updateAction);
        }
        const manageAction = this.instantiationService.createInstance(
          ManagePluginAction,
          () => getInstalledPluginContextMenuActions(element.plugin, this.instantiationService)
        );
        reader.store.add(manageAction);
        actions.push(manageAction);
        data.actionbar.push(actions, { icon: true, label: true });
      }
    };
    data.elementDisposables.push(autorun(updateActions));
  }
  disposeElement(_element, _index, data) {
    for (const d of data.elementDisposables) {
      d.dispose();
    }
    data.elementDisposables = [];
  }
  disposeTemplate(data) {
    for (const d of data.disposables) {
      d.dispose();
    }
    this.disposeElement(void 0, 0, data);
  }
};
AgentPluginRenderer.templateId = "agentPlugin";
AgentPluginRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AgentPluginRenderer);
let AgentPluginsListView = class extends AbstractExtensionsListView {
  constructor(listOptions, options, keybindingService, contextMenuService, instantiationService, themeService, hoverService, configurationService, contextKeyService, viewDescriptorService, openerService, agentPluginService, pluginMarketplaceService, pluginInstallService, labelService, editorService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.listOptions = listOptions;
    this.agentPluginService = agentPluginService;
    this.pluginMarketplaceService = pluginMarketplaceService;
    this.pluginInstallService = pluginInstallService;
    this.labelService = labelService;
    this.editorService = editorService;
    this.actionStore = this._register(new DisposableStore());
    this.queryCts = new MutableDisposable();
    this.list = null;
    this.listContainer = null;
    this.currentQuery = "@agentPlugins";
    this.refreshOnPluginsChangedScheduler = this._register(new RunOnceScheduler(() => {
      if (this.list) {
        void this.show(this.currentQuery);
      }
    }, 0));
    this._register(autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      for (const plugin of plugins) {
        plugin.enablement.read(reader);
      }
      if (this.list && this.isBodyVisible()) {
        this.refreshOnPluginsChangedScheduler.schedule();
      }
    }));
    this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
      if (this.list && this.isBodyVisible()) {
        this.refreshOnPluginsChangedScheduler.schedule();
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    const messageContainer = dom.append(container, dom.$(".message-container"));
    const messageBox = dom.append(messageContainer, dom.$(".message"));
    const pluginsList = dom.$(".agent-plugins-list");
    this.bodyTemplate = { pluginsList, messageBox, messageContainer };
    this.listContainer = dom.append(container, pluginsList);
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchPagedList,
      `${this.id}-Agent-Plugins`,
      this.listContainer,
      {
        getHeight() {
          return 72;
        },
        getTemplateId: () => AgentPluginRenderer.templateId
      },
      [this.instantiationService.createInstance(AgentPluginRenderer)],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(item) {
            return item?.name ?? "";
          },
          getWidgetAriaLabel() {
            return localize("agentPlugins", "Agent Plugins");
          }
        },
        overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles
      }
    ));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e), this));
    this._register(Event.debounce(Event.filter(this.list.onDidOpen, (e) => e.element !== null), (_, event) => event, 75, true)((options) => {
      this.editorService.openEditor(
        this.instantiationService.createInstance(AgentPluginEditorInput, options.element),
        options.editorOptions
      );
    }));
  }
  onContextMenu(e) {
    if (!e.element) {
      return;
    }
    const actions = this.getContextMenuActions(e.element);
    if (actions.length === 0) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions
    });
  }
  getContextMenuActions(item) {
    let actions;
    if (item.kind === AgentPluginItemKind.Installed) {
      const groups = getInstalledPluginContextMenuActions(item.plugin, this.instantiationService);
      actions = groups.flatMap((group) => [...group, new Separator()]);
      if (actions.length > 0) {
        actions.pop();
      }
    } else {
      actions = [];
      if (item.readmeUri) {
        actions.push(this.instantiationService.createInstance(OpenPluginReadmeAction, item.readmeUri));
      }
      actions.push(this.instantiationService.createInstance(InstallPluginAction, item));
    }
    this.actionStore.clear();
    for (const action of actions) {
      if (isDisposable(action)) {
        this.actionStore.add(action);
      }
    }
    return actions;
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.list?.layout(height, width);
  }
  async show(query) {
    this.currentQuery = query;
    const stripped = query.replace(/@agentPlugins/i, "").trim();
    const isRecommended = /^@recommended$/i.test(stripped);
    const isInstalled = /(?:^|\s)@installed(?:\s|$)/i.test(stripped);
    const text = isRecommended ? "" : stripped.replace(/(?:^|\s)@installed(?:\s|$)/gi, " ").trim().toLowerCase();
    let installed = this.queryInstalled();
    if (text) {
      installed = installed.filter(
        (p) => p.name.toLowerCase().includes(text) || p.description.toLowerCase().includes(text) || (p.marketplace ?? "").toLowerCase().includes(text)
      );
    }
    if (isRecommended) {
      const recommended = this.pluginMarketplaceService.recommendedPlugins.get();
      installed = installed.filter((p) => {
        const marketplace = p.plugin.fromMarketplace;
        if (!marketplace) {
          return false;
        }
        const key = `${marketplace.name}@${marketplace.marketplace}`;
        return recommended.has(key);
      });
    }
    let items = installed;
    if (!this.listOptions.installedOnly && !isInstalled) {
      const marketplacePlugins = await this.queryMarketplacePlugins();
      let filteredMp = marketplacePlugins;
      if (isRecommended) {
        const recommended = this.pluginMarketplaceService.recommendedPlugins.get();
        filteredMp = filteredMp.filter((p) => {
          const key = `${p.name}@${p.marketplace}`;
          return recommended.has(key);
        });
      } else {
        const lowerText = text.toLowerCase();
        filteredMp = filteredMp.filter((p) => p.name.toLowerCase().includes(lowerText) || p.description.toLowerCase().includes(lowerText) || p.marketplace.toLowerCase().includes(lowerText));
      }
      const marketplace = filteredMp.map(marketplacePluginToItem);
      const installedPaths = new Set(installed.map((i) => i.plugin.uri.toString()));
      const filteredMarketplace = marketplace.filter((m) => {
        const expectedUri = this.pluginInstallService.getPluginInstallUri({
          name: m.name,
          description: m.description,
          version: "",
          source: m.source,
          sourceDescriptor: m.sourceDescriptor,
          marketplace: m.marketplace,
          marketplaceReference: m.marketplaceReference,
          marketplaceType: m.marketplaceType
        });
        return !installedPaths.has(expectedUri.toString());
      });
      items = [...installed, ...filteredMarketplace];
    }
    const model = new PagedModel(items);
    if (this.list) {
      this.list.model = model;
    }
    this.updateBody(model.length);
    return model;
  }
  /**
   * Builds the installed plugin list using only cached marketplace data
   * (no IO). The cached data is populated by {@link fetchMarketplacePlugins}
   * and exposed via the {@link IPluginMarketplaceService.lastFetchedPlugins}
   * observable, which the view's autorun subscribes to for reactivity.
   */
  queryInstalled() {
    const marketplaceObs = derived((reader) => {
      const cachedMarketplace = this.pluginMarketplaceService.lastFetchedPlugins.read(reader);
      const marketplaceByKey = /* @__PURE__ */ new Map();
      for (const mp of cachedMarketplace) {
        marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
      }
      const installedByUri = /* @__PURE__ */ new Map();
      for (const entry of this.pluginMarketplaceService.installedPlugins.read(reader)) {
        installedByUri.set(entry.pluginUri.toString(), entry.plugin);
      }
      return { marketplaceByKey, installedByUri };
    });
    const plugins = this.agentPluginService.plugins.get();
    return plugins.map((p) => {
      const isOutdated = derived((reader) => {
        const { marketplaceByKey, installedByUri } = marketplaceObs.read(reader);
        const storedPlugin = installedByUri.get(p.uri.toString()) ?? p.fromMarketplace;
        if (storedPlugin) {
          const key = `${storedPlugin.marketplaceReference.canonicalId}::${storedPlugin.name}`;
          const live = marketplaceByKey.get(key);
          if (live && hasSourceChanged(storedPlugin.sourceDescriptor, live.sourceDescriptor)) {
            return live;
          }
        }
        return void 0;
      });
      return installedPluginToItem(p, this.labelService, isOutdated);
    });
  }
  async queryMarketplacePlugins() {
    this.queryCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this.queryCts.value = cts;
    try {
      return await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
    } catch {
      return [];
    }
  }
  updateBody(count) {
    if (this.bodyTemplate) {
      this.bodyTemplate.pluginsList.classList.toggle("hidden", count === 0);
      this.bodyTemplate.messageContainer.classList.toggle("hidden", count > 0);
      if (count === 0 && this.isBodyVisible()) {
        this.bodyTemplate.messageBox.textContent = localize("noAgentPlugins", "No agent plugins found.");
      }
    }
  }
};
AgentPluginsListView = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IAgentPluginService),
  __decorateParam(12, IPluginMarketplaceService),
  __decorateParam(13, IPluginInstallService),
  __decorateParam(14, ILabelService),
  __decorateParam(15, IEditorService)
], AgentPluginsListView);
class AgentPluginsBrowseCommand extends Action2 {
  constructor() {
    super({
      id: "workbench.agentPlugins.browse",
      title: localize2("agentPlugins.browse", "Agent Plugins"),
      tooltip: localize2("agentPlugins.browse.tooltip", "Browse Agent Plugins"),
      icon: Codicon.search,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: [{
        id: extensionsFilterSubMenu,
        group: "1_predefined",
        order: 2,
        when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
      }, {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", InstalledAgentPluginsViewId), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        group: "navigation"
      }]
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch("@agentPlugins ");
  }
}
class RefreshPluginMarketplacesCommand extends Action2 {
  constructor() {
    super({
      id: RefreshAgentPluginMarketplacesCommandId,
      title: localize2("agentPlugins.refreshMarketplaces", "Refresh Plugin Marketplaces"),
      category: localize2("chat.category", "Chat"),
      icon: Codicon.refresh,
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  async run(accessor) {
    const marketplaceService = accessor.get(IPluginMarketplaceService);
    const notificationService = accessor.get(INotificationService);
    const progressService = accessor.get(IProgressService);
    const cts = new CancellationTokenSource();
    const failedLabels = [];
    try {
      await progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          title: localize("agentPlugins.refreshingMarketplaces", "Refreshing plugin marketplaces..."),
          cancellable: true
        },
        () => marketplaceService.fetchMarketplacePlugins(cts.token, void 0, {
          refresh: true,
          onMarketplaceError: (reference) => failedLabels.push(reference.displayLabel)
        }),
        () => cts.dispose(true)
      );
      if (cts.token.isCancellationRequested) {
        return;
      }
      if (failedLabels.length > 0) {
        notificationService.warn(localize("agentPlugins.marketplacesRefreshedWithErrors", "Refreshed plugin marketplaces, but {0} could not be read: {1}", failedLabels.length, failedLabels.join(", ")));
      } else {
        notificationService.info(localize("agentPlugins.marketplacesRefreshed", "Plugin marketplaces refreshed."));
      }
    } catch (error) {
      notificationService.error(localize("agentPlugins.refreshMarketplacesFailed", "Failed to refresh plugin marketplaces: {0}", getErrorMessage(error)));
      throw error;
    } finally {
      cts.dispose();
    }
  }
}
let AgentPluginsViewsContribution = class extends Disposable {
  constructor(contextKeyService, agentPluginService) {
    super();
    const hasInstalledKey = HasInstalledAgentPluginsContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      hasInstalledKey.set(agentPluginService.plugins.read(reader).length > 0);
    }));
    registerAction2(AgentPluginsBrowseCommand);
    registerAction2(RefreshPluginMarketplacesCommand);
    Registry.as(ViewExtensions.ViewsRegistry).registerViews([
      {
        id: InstalledAgentPluginsViewId,
        name: localize2("agent-plugins-installed", "Agent Plugins - Installed"),
        ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{ installedOnly: true }]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledAgentPluginsContext, ChatContextKeys.Setup.hidden.negate()),
        weight: 30,
        order: 5,
        canToggleVisibility: true
      },
      {
        id: "workbench.views.agentPlugins.default.marketplace",
        name: localize2("agent-plugins", "Agent Plugins"),
        ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledAgentPluginsContext.toNegated(), ChatContextKeys.Setup.hidden.negate()),
        weight: 30,
        order: 5,
        canToggleVisibility: true,
        hideByDefault: true
      },
      {
        id: "workbench.views.agentPlugins.marketplace",
        name: localize2("agent-plugins", "Agent Plugins"),
        ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{}]),
        when: ContextKeyExpr.and(SearchAgentPluginsContext, ChatContextKeys.Setup.hidden.negate())
      }
    ], VIEW_CONTAINER);
  }
};
AgentPluginsViewsContribution.ID = "workbench.chat.agentPlugins.views.contribution";
AgentPluginsViewsContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IAgentPluginService)
], AgentPluginsViewsContribution);
export {
  AgentPluginsListView,
  AgentPluginsViewsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50UGx1Z2luc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElMaXN0Q29udGV4dE1lbnVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVBhZ2VkUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0UGFnaW5nLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZUlmRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJUmVhZGVyV2l0aFN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJUGFnZWRNb2RlbCwgUGFnZWRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hQYWdlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSVZpZXdzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgZ2V0V29ya2JlbmNoTWVudU1vdGlvbkNvbnRleHRNZW51T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9tZW51TW90aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZJRVdfQ09OVEFJTkVSIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IG1hbmFnZUV4dGVuc2lvbkljb24gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uc0xpc3RWaWV3IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNWaWV3cy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Vmlld3NDb250ZXh0LCBleHRlbnNpb25zRmlsdGVyU3ViTWVudSwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBTZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luLCBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ29udHJpYnV0aW9uRW5hYmxlZCB9IGZyb20gJy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkluc3RhbGxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc1NvdXJjZUNoYW5nZWQsIElNYXJrZXRwbGFjZVBsdWdpbiwgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkVkaXRvcklucHV0IH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luSXRlbUtpbmQsIElBZ2VudFBsdWdpbkl0ZW0sIElJbnN0YWxsZWRQbHVnaW5JdGVtLCBJTWFya2V0cGxhY2VQbHVnaW5JdGVtIH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkl0ZW1zLmpzJztcbmltcG9ydCB7IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucywgSW5zdGFsbFBsdWdpbkFjdGlvbiwgT3BlblBsdWdpblJlYWRtZUFjdGlvbiB9IGZyb20gJy4vYWdlbnRQbHVnaW5BY3Rpb25zLmpzJztcbmltcG9ydCB7IEhhc0luc3RhbGxlZEFnZW50UGx1Z2luc0NvbnRleHQsIEluc3RhbGxlZEFnZW50UGx1Z2luc1ZpZXdJZCwgUmVmcmVzaEFnZW50UGx1Z2luTWFya2V0cGxhY2VzQ29tbWFuZElkIH0gZnJvbSAnLi9jaGF0LmpzJztcblxuLy8jcmVnaW9uIEl0ZW0gbW9kZWxcblxuZnVuY3Rpb24gaW5zdGFsbGVkUGx1Z2luVG9JdGVtKHBsdWdpbjogSUFnZW50UGx1Z2luLCBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsIG91dGRhdGVkPzogSU9ic2VydmFibGU8SU1hcmtldHBsYWNlUGx1Z2luIHwgdW5kZWZpbmVkPik6IElJbnN0YWxsZWRQbHVnaW5JdGVtIHtcblx0Y29uc3QgbmFtZSA9IHBsdWdpbi5sYWJlbDtcblx0Y29uc3QgZGVzY3JpcHRpb24gPSBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5kZXNjcmlwdGlvbiA/PyBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShwbHVnaW4udXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0Y29uc3QgbWFya2V0cGxhY2UgPSBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5tYXJrZXRwbGFjZTtcblx0cmV0dXJuIHsga2luZDogQWdlbnRQbHVnaW5JdGVtS2luZC5JbnN0YWxsZWQsIG5hbWUsIGRlc2NyaXB0aW9uLCBtYXJrZXRwbGFjZSwgcGx1Z2luLCBvdXRkYXRlZCB9O1xufVxuXG5mdW5jdGlvbiBtYXJrZXRwbGFjZVBsdWdpblRvSXRlbShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IElNYXJrZXRwbGFjZVBsdWdpbkl0ZW0ge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuTWFya2V0cGxhY2UsXG5cdFx0bmFtZTogcGx1Z2luLm5hbWUsXG5cdFx0ZGVzY3JpcHRpb246IHBsdWdpbi5kZXNjcmlwdGlvbixcblx0XHRzb3VyY2U6IHBsdWdpbi5zb3VyY2UsXG5cdFx0c291cmNlRGVzY3JpcHRvcjogcGx1Z2luLnNvdXJjZURlc2NyaXB0b3IsXG5cdFx0bWFya2V0cGxhY2U6IHBsdWdpbi5tYXJrZXRwbGFjZSxcblx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSxcblx0XHRyZWFkbWVVcmk6IHBsdWdpbi5yZWFkbWVVcmksXG5cdH07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQWN0aW9uc1xuXG4vLyNyZWdpb24gQWN0aW9uc1xuXG5jbGFzcyBVcGRhdGVQbHVnaW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnYWdlbnRQbHVnaW4udXBkYXRlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogSUFnZW50UGx1Z2luLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGl2ZU1hcmtldHBsYWNlUGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4sXG5cdFx0QElQbHVnaW5JbnN0YWxsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkluc3RhbGxTZXJ2aWNlOiBJUGx1Z2luSW5zdGFsbFNlcnZpY2UsXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U6IElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFVwZGF0ZVBsdWdpbkFjdGlvbi5JRCwgbG9jYWxpemUoJ3VwZGF0ZScsIFwiVXBkYXRlXCIpLCAnZXh0ZW5zaW9uLWFjdGlvbiBsYWJlbCBwcm9taW5lbnQgaW5zdGFsbCcpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhd2FpdCB0aGlzLnBsdWdpbkluc3RhbGxTZXJ2aWNlLnVwZGF0ZVBsdWdpbih0aGlzLmxpdmVNYXJrZXRwbGFjZVBsdWdpbikpIHtcblx0XHRcdHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmFkZEluc3RhbGxlZFBsdWdpbih0aGlzLnBsdWdpbi51cmksIHRoaXMubGl2ZU1hcmtldHBsYWNlUGx1Z2luKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTWFuYWdlUGx1Z2luQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50UGx1Z2luLm1hbmFnZSc7XG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGBleHRlbnNpb24tYWN0aW9uIGljb24gbWFuYWdlICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKG1hbmFnZUV4dGVuc2lvbkljb24pfWA7XG5cblx0cHJpdmF0ZSBfYWN0aW9uVmlld0l0ZW06IERyb3BEb3duQWN0aW9uVmlld0l0ZW0gfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldEFjdGlvbkdyb3VwczogKCkgPT4gSUFjdGlvbltdW10sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKE1hbmFnZVBsdWdpbkFjdGlvbi5JRCwgJycsIE1hbmFnZVBsdWdpbkFjdGlvbi5DTEFTUywgdHJ1ZSk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ21hbmFnZScsIFwiTWFuYWdlXCIpO1xuXHR9XG5cblx0Y3JlYXRlQWN0aW9uVmlld0l0ZW0ob3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IERyb3BEb3duQWN0aW9uVmlld0l0ZW0ge1xuXHRcdHRoaXMuX2FjdGlvblZpZXdJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wRG93bkFjdGlvblZpZXdJdGVtLCB0aGlzLCBvcHRpb25zKTtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uVmlld0l0ZW07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYWN0aW9uVmlld0l0ZW0/LnNob3dNZW51KHRoaXMuZ2V0QWN0aW9uR3JvdXBzKCkpO1xuXHR9XG59XG5cbmNsYXNzIERyb3BEb3duQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG5cblx0c2hvd01lbnUoYWN0aW9uR3JvdXBzOiBJQWN0aW9uW11bXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbnMgPSBhY3Rpb25Hcm91cHMuZmxhdE1hcChncm91cCA9PiBbLi4uZ3JvdXAsIG5ldyBTZXBhcmF0b3IoKV0pO1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGFjdGlvbnMucG9wKCk7XG5cdFx0fVxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHQuLi5nZXRXb3JrYmVuY2hNZW51TW90aW9uQ29udGV4dE1lbnVPcHRpb25zKHRoaXMuZWxlbWVudCksXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NlSWZEaXNwb3NhYmxlKGFjdGlvbnMpLFxuXHRcdH0pO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUmVuZGVyZXJcblxuaW50ZXJmYWNlIElBZ2VudFBsdWdpblRlbXBsYXRlRGF0YSB7XG5cdHJvb3Q6IEhUTUxFbGVtZW50O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0ZGVzY3JpcHRpb246IEhUTUxFbGVtZW50O1xuXHRkZXRhaWw6IEhUTUxFbGVtZW50O1xuXHRhY3Rpb25iYXI6IEFjdGlvbkJhcjtcblx0ZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107XG5cdGVsZW1lbnREaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcbn1cblxuY2xhc3MgQWdlbnRQbHVnaW5SZW5kZXJlciBpbXBsZW1lbnRzIElQYWdlZFJlbmRlcmVyPElBZ2VudFBsdWdpbkl0ZW0sIElBZ2VudFBsdWdpblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2FnZW50UGx1Z2luJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IEFnZW50UGx1Z2luUmVuZGVyZXIudGVtcGxhdGVJZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShyb290OiBIVE1MRWxlbWVudCk6IElBZ2VudFBsdWdpblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5hZ2VudC1wbHVnaW4taXRlbS5leHRlbnNpb24tbGlzdC1pdGVtJykpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcuZGV0YWlscycpKTtcblx0XHRjb25zdCBoZWFkZXJDb250YWluZXIgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcuaGVhZGVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgZG9tLiQoJy5oZWFkZXInKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZG9tLmFwcGVuZChkZXRhaWxzLCBkb20uJCgnLmRlc2NyaXB0aW9uLmVsbGlwc2lzJykpO1xuXHRcdGNvbnN0IGZvb3RlciA9IGRvbS5hcHBlbmQoZGV0YWlscywgZG9tLiQoJy5mb290ZXInKSk7XG5cdFx0Y29uc3QgZGV0YWlsQ29udGFpbmVyID0gZG9tLmFwcGVuZChmb290ZXIsIGRvbS4kKCcucHVibGlzaGVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBkZXRhaWwgPSBkb20uYXBwZW5kKGRldGFpbENvbnRhaW5lciwgZG9tLiQoJ3NwYW4ucHVibGlzaGVyLW5hbWUnKSk7XG5cdFx0Y29uc3QgYWN0aW9uYmFyID0gbmV3IEFjdGlvbkJhcihmb290ZXIsIHtcblx0XHRcdGZvY3VzT25seUVuYWJsZWRJdGVtczogdHJ1ZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1hbmFnZVBsdWdpbkFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBhY3Rpb24uY3JlYXRlQWN0aW9uVmlld0l0ZW0ob3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhY3Rpb25iYXIuc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRyZXR1cm4geyByb290LCBuYW1lLCBkZXNjcmlwdGlvbiwgZGV0YWlsLCBhY3Rpb25iYXIsIGRpc3Bvc2FibGVzOiBbYWN0aW9uYmFyXSwgZWxlbWVudERpc3Bvc2FibGVzOiBbXSB9O1xuXHR9XG5cblx0cmVuZGVyUGxhY2Vob2xkZXIoX2luZGV4OiBudW1iZXIsIGRhdGE6IElBZ2VudFBsdWdpblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGRhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSAnJztcblx0XHRkYXRhLmRldGFpbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGRhdGEuYWN0aW9uYmFyLmNsZWFyKCk7XG5cdFx0dGhpcy5kaXNwb3NlRWxlbWVudCh1bmRlZmluZWQsIDAsIGRhdGEpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJQWdlbnRQbHVnaW5JdGVtLCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUFnZW50UGx1Z2luVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlRWxlbWVudCh1bmRlZmluZWQsIDAsIGRhdGEpO1xuXG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gZWxlbWVudC5uYW1lO1xuXHRcdGRhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBlbGVtZW50LmRlc2NyaXB0aW9uO1xuXG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMucHVzaChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRkYXRhLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBlbGVtZW50LmtpbmQgPT09IEFnZW50UGx1Z2luSXRlbUtpbmQuSW5zdGFsbGVkICYmICFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZWxlbWVudC5wbHVnaW4uZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVBY3Rpb25zID0gKHJlYWRlcjogSVJlYWRlcldpdGhTdG9yZSkgPT4ge1xuXHRcdFx0ZGF0YS5hY3Rpb25iYXIuY2xlYXIoKTtcblx0XHRcdGlmIChlbGVtZW50LmtpbmQgPT09IEFnZW50UGx1Z2luSXRlbUtpbmQuTWFya2V0cGxhY2UpIHtcblx0XHRcdFx0ZGF0YS5kZXRhaWwudGV4dENvbnRlbnQgPSBlbGVtZW50Lm1hcmtldHBsYWNlO1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsUGx1Z2luQWN0aW9uLCBlbGVtZW50KTtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChpbnN0YWxsQWN0aW9uKTtcblx0XHRcdFx0ZGF0YS5hY3Rpb25iYXIucHVzaChbaW5zdGFsbEFjdGlvbl0sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkYXRhLmRldGFpbC50ZXh0Q29udGVudCA9IGVsZW1lbnQubWFya2V0cGxhY2UgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnM6IEFjdGlvbltdID0gW107XG5cdFx0XHRcdGNvbnN0IGxpdmVQbHVnaW4gPSBlbGVtZW50Lm91dGRhdGVkPy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChsaXZlUGx1Z2luKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXBkYXRlQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVcGRhdGVQbHVnaW5BY3Rpb24sIGVsZW1lbnQucGx1Z2luLCBsaXZlUGx1Z2luKTtcblx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHVwZGF0ZUFjdGlvbik7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHVwZGF0ZUFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWFuYWdlQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYW5hZ2VQbHVnaW5BY3Rpb24sXG5cdFx0XHRcdFx0KCkgPT4gZ2V0SW5zdGFsbGVkUGx1Z2luQ29udGV4dE1lbnVBY3Rpb25zKGVsZW1lbnQucGx1Z2luLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQobWFuYWdlQWN0aW9uKTtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKG1hbmFnZUFjdGlvbik7XG5cdFx0XHRcdGRhdGEuYWN0aW9uYmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMucHVzaChhdXRvcnVuKHVwZGF0ZUFjdGlvbnMpKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KF9lbGVtZW50OiBJQWdlbnRQbHVnaW5JdGVtIHwgdW5kZWZpbmVkLCBfaW5kZXg6IG51bWJlciwgZGF0YTogSUFnZW50UGx1Z2luVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBkIG9mIGRhdGEuZWxlbWVudERpc3Bvc2FibGVzKSB7XG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMgPSBbXTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShkYXRhOiBJQWdlbnRQbHVnaW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGQgb2YgZGF0YS5kaXNwb3NhYmxlcykge1xuXHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuZGlzcG9zZUVsZW1lbnQodW5kZWZpbmVkLCAwLCBkYXRhKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIExpc3QgVmlld1xuXG5pbnRlcmZhY2UgSUFnZW50UGx1Z2luc0xpc3RWaWV3T3B0aW9ucyB7XG5cdGluc3RhbGxlZE9ubHk/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRQbHVnaW5zTGlzdFZpZXcgZXh0ZW5kcyBBYnN0cmFjdEV4dGVuc2lvbnNMaXN0VmlldzxJQWdlbnRQbHVnaW5JdGVtPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcXVlcnlDdHMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cdHByaXZhdGUgbGlzdDogV29ya2JlbmNoUGFnZWRMaXN0PElBZ2VudFBsdWdpbkl0ZW0+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgbGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBjdXJyZW50UXVlcnkgPSAnQGFnZW50UGx1Z2lucyc7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVmcmVzaE9uUGx1Z2luc0NoYW5nZWRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0aWYgKHRoaXMubGlzdCkge1xuXHRcdFx0dm9pZCB0aGlzLnNob3codGhpcy5jdXJyZW50UXVlcnkpO1xuXHRcdH1cblx0fSwgMCkpO1xuXHRwcml2YXRlIGJvZHlUZW1wbGF0ZToge1xuXHRcdG1lc3NhZ2VDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRcdG1lc3NhZ2VCb3g6IEhUTUxFbGVtZW50O1xuXHRcdHBsdWdpbnNMaXN0OiBIVE1MRWxlbWVudDtcblx0fSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RPcHRpb25zOiBJQWdlbnRQbHVnaW5zTGlzdFZpZXdPcHRpb25zLFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2U6IElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsXG5cdFx0QElQbHVnaW5JbnN0YWxsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkluc3RhbGxTZXJ2aWNlOiBJUGx1Z2luSW5zdGFsbFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2lucyA9IHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgcGx1Z2lucykge1xuXHRcdFx0XHRwbHVnaW4uZW5hYmxlbWVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5saXN0ICYmIHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaE9uUGx1Z2luc0NoYW5nZWRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5vbkRpZENoYW5nZU1hcmtldHBsYWNlcygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5saXN0ICYmIHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaE9uUGx1Z2luc0NoYW5nZWRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLm1lc3NhZ2UtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IG1lc3NhZ2VCb3ggPSBkb20uYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsIGRvbS4kKCcubWVzc2FnZScpKTtcblx0XHRjb25zdCBwbHVnaW5zTGlzdCA9IGRvbS4kKCcuYWdlbnQtcGx1Z2lucy1saXN0Jyk7XG5cblx0XHR0aGlzLmJvZHlUZW1wbGF0ZSA9IHsgcGx1Z2luc0xpc3QsIG1lc3NhZ2VCb3gsIG1lc3NhZ2VDb250YWluZXIgfTtcblxuXHRcdHRoaXMubGlzdENvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBwbHVnaW5zTGlzdCk7XG5cdFx0dGhpcy5saXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hQYWdlZExpc3QsXG5cdFx0XHRgJHt0aGlzLmlkfS1BZ2VudC1QbHVnaW5zYCxcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0Z2V0SGVpZ2h0KCkgeyByZXR1cm4gNzI7IH0sXG5cdFx0XHRcdGdldFRlbXBsYXRlSWQ6ICgpID0+IEFnZW50UGx1Z2luUmVuZGVyZXIudGVtcGxhdGVJZCxcblx0XHRcdH0sXG5cdFx0XHRbdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFBsdWdpblJlbmRlcmVyKV0sXG5cdFx0XHR7XG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsKGl0ZW06IElBZ2VudFBsdWdpbkl0ZW0gfCBudWxsKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtPy5uYW1lID8/ICcnO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50UGx1Z2lucycsIFwiQWdlbnQgUGx1Z2luc1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycyh0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHR9KSBhcyBXb3JrYmVuY2hQYWdlZExpc3Q8SUFnZW50UGx1Z2luSXRlbT4pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSksIHRoaXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKEV2ZW50LmZpbHRlcih0aGlzLmxpc3Qub25EaWRPcGVuLCBlID0+IGUuZWxlbWVudCAhPT0gbnVsbCksIChfLCBldmVudCkgPT4gZXZlbnQsIDc1LCB0cnVlKShvcHRpb25zID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50UGx1Z2luRWRpdG9ySW5wdXQsIG9wdGlvbnMuZWxlbWVudCEpLFxuXHRcdFx0XHRvcHRpb25zLmVkaXRvck9wdGlvbnNcblx0XHRcdCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxJQWdlbnRQbHVnaW5JdGVtPik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGUuZWxlbWVudCk7XG5cdFx0aWYgKGFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZXh0TWVudUFjdGlvbnMoaXRlbTogSUFnZW50UGx1Z2luSXRlbSk6IElBY3Rpb25bXSB7XG5cdFx0bGV0IGFjdGlvbnM6IElBY3Rpb25bXTtcblx0XHRpZiAoaXRlbS5raW5kID09PSBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCkge1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gZ2V0SW5zdGFsbGVkUGx1Z2luQ29udGV4dE1lbnVBY3Rpb25zKGl0ZW0ucGx1Z2luLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdGFjdGlvbnMgPSBncm91cHMuZmxhdE1hcChncm91cCA9PiBbLi4uZ3JvdXAsIG5ldyBTZXBhcmF0b3IoKV0pO1xuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRhY3Rpb25zLnBvcCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3Rpb25zID0gW107XG5cdFx0XHRpZiAoaXRlbS5yZWFkbWVVcmkpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3BlblBsdWdpblJlYWRtZUFjdGlvbiwgaXRlbS5yZWFkbWVVcmkpKTtcblx0XHRcdH1cblx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxQbHVnaW5BY3Rpb24sIGl0ZW0pKTtcblx0XHR9XG5cblx0XHR0aGlzLmFjdGlvblN0b3JlLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0aWYgKGlzRGlzcG9zYWJsZShhY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uU3RvcmUuYWRkKGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5saXN0Py5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRhc3luYyBzaG93KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElQYWdlZE1vZGVsPElBZ2VudFBsdWdpbkl0ZW0+PiB7XG5cdFx0dGhpcy5jdXJyZW50UXVlcnkgPSBxdWVyeTtcblx0XHRjb25zdCBzdHJpcHBlZCA9IHF1ZXJ5LnJlcGxhY2UoL0BhZ2VudFBsdWdpbnMvaSwgJycpLnRyaW0oKTtcblx0XHRjb25zdCBpc1JlY29tbWVuZGVkID0gL15AcmVjb21tZW5kZWQkL2kudGVzdChzdHJpcHBlZCk7XG5cdFx0Y29uc3QgaXNJbnN0YWxsZWQgPSAvKD86XnxcXHMpQGluc3RhbGxlZCg/Olxcc3wkKS9pLnRlc3Qoc3RyaXBwZWQpO1xuXHRcdGNvbnN0IHRleHQgPSBpc1JlY29tbWVuZGVkID8gJycgOiBzdHJpcHBlZC5yZXBsYWNlKC8oPzpefFxccylAaW5zdGFsbGVkKD86XFxzfCQpL2dpLCAnICcpLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0bGV0IGluc3RhbGxlZCA9IHRoaXMucXVlcnlJbnN0YWxsZWQoKTtcblx0XHRpZiAodGV4dCkge1xuXHRcdFx0aW5zdGFsbGVkID0gaW5zdGFsbGVkLmZpbHRlcihwID0+XG5cdFx0XHRcdHAubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHRleHQpIHx8XG5cdFx0XHRcdHAuZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXh0KSB8fFxuXHRcdFx0XHQocC5tYXJrZXRwbGFjZSA/PyAnJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXh0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIEByZWNvbW1lbmRlZCwgZmlsdGVyIHRvIHBsdWdpbnMgbGlzdGVkIGluIHdvcmtzcGFjZSByZWNvbW1lbmRhdGlvbnMuXG5cdFx0aWYgKGlzUmVjb21tZW5kZWQpIHtcblx0XHRcdGNvbnN0IHJlY29tbWVuZGVkID0gdGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UucmVjb21tZW5kZWRQbHVnaW5zLmdldCgpO1xuXHRcdFx0aW5zdGFsbGVkID0gaW5zdGFsbGVkLmZpbHRlcihwID0+IHtcblx0XHRcdFx0Y29uc3QgbWFya2V0cGxhY2UgPSBwLnBsdWdpbi5mcm9tTWFya2V0cGxhY2U7XG5cdFx0XHRcdGlmICghbWFya2V0cGxhY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qga2V5ID0gYCR7bWFya2V0cGxhY2UubmFtZX1AJHttYXJrZXRwbGFjZS5tYXJrZXRwbGFjZX1gO1xuXHRcdFx0XHRyZXR1cm4gcmVjb21tZW5kZWQuaGFzKGtleSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRsZXQgaXRlbXM6IElBZ2VudFBsdWdpbkl0ZW1bXSA9IGluc3RhbGxlZDtcblxuXHRcdGlmICghdGhpcy5saXN0T3B0aW9ucy5pbnN0YWxsZWRPbmx5ICYmICFpc0luc3RhbGxlZCkge1xuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2VQbHVnaW5zID0gYXdhaXQgdGhpcy5xdWVyeU1hcmtldHBsYWNlUGx1Z2lucygpO1xuXHRcdFx0bGV0IGZpbHRlcmVkTXAgPSBtYXJrZXRwbGFjZVBsdWdpbnM7XG5cblx0XHRcdGlmIChpc1JlY29tbWVuZGVkKSB7XG5cdFx0XHRcdC8vIFdoZW4gQHJlY29tbWVuZGVkLCBmaWx0ZXIgbWFya2V0cGxhY2UgcGx1Z2lucyB0byB0aG9zZSBpbiByZWNvbW1lbmRhdGlvbnMuXG5cdFx0XHRcdGNvbnN0IHJlY29tbWVuZGVkID0gdGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UucmVjb21tZW5kZWRQbHVnaW5zLmdldCgpO1xuXHRcdFx0XHRmaWx0ZXJlZE1wID0gZmlsdGVyZWRNcC5maWx0ZXIocCA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gYCR7cC5uYW1lfUAke3AubWFya2V0cGxhY2V9YDtcblx0XHRcdFx0XHRyZXR1cm4gcmVjb21tZW5kZWQuaGFzKGtleSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbG93ZXJUZXh0ID0gdGV4dC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRmaWx0ZXJlZE1wID0gZmlsdGVyZWRNcC5maWx0ZXIocCA9PiBwLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhsb3dlclRleHQpIHx8IHAuZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhsb3dlclRleHQpIHx8IHAubWFya2V0cGxhY2UudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhsb3dlclRleHQpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2UgPSBmaWx0ZXJlZE1wLm1hcChtYXJrZXRwbGFjZVBsdWdpblRvSXRlbSk7XG5cblx0XHRcdC8vIEZpbHRlciBvdXQgbWFya2V0cGxhY2UgaXRlbXMgdGhhdCBhcmUgYWxyZWFkeSBpbnN0YWxsZWRcblx0XHRcdGNvbnN0IGluc3RhbGxlZFBhdGhzID0gbmV3IFNldChpbnN0YWxsZWQubWFwKGkgPT4gaS5wbHVnaW4udXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdGNvbnN0IGZpbHRlcmVkTWFya2V0cGxhY2UgPSBtYXJrZXRwbGFjZS5maWx0ZXIobSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkVXJpID0gdGhpcy5wbHVnaW5JbnN0YWxsU2VydmljZS5nZXRQbHVnaW5JbnN0YWxsVXJpKHtcblx0XHRcdFx0XHRuYW1lOiBtLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0dmVyc2lvbjogJycsXG5cdFx0XHRcdFx0c291cmNlOiBtLnNvdXJjZSxcblx0XHRcdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiBtLnNvdXJjZURlc2NyaXB0b3IsXG5cdFx0XHRcdFx0bWFya2V0cGxhY2U6IG0ubWFya2V0cGxhY2UsXG5cdFx0XHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IG0ubWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0XHRcdFx0bWFya2V0cGxhY2VUeXBlOiBtLm1hcmtldHBsYWNlVHlwZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiAhaW5zdGFsbGVkUGF0aHMuaGFzKGV4cGVjdGVkVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGl0ZW1zID0gWy4uLmluc3RhbGxlZCwgLi4uZmlsdGVyZWRNYXJrZXRwbGFjZV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgUGFnZWRNb2RlbChpdGVtcyk7XG5cdFx0aWYgKHRoaXMubGlzdCkge1xuXHRcdFx0dGhpcy5saXN0Lm1vZGVsID0gbW9kZWw7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQm9keShtb2RlbC5sZW5ndGgpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIGluc3RhbGxlZCBwbHVnaW4gbGlzdCB1c2luZyBvbmx5IGNhY2hlZCBtYXJrZXRwbGFjZSBkYXRhXG5cdCAqIChubyBJTykuIFRoZSBjYWNoZWQgZGF0YSBpcyBwb3B1bGF0ZWQgYnkge0BsaW5rIGZldGNoTWFya2V0cGxhY2VQbHVnaW5zfVxuXHQgKiBhbmQgZXhwb3NlZCB2aWEgdGhlIHtAbGluayBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmxhc3RGZXRjaGVkUGx1Z2luc31cblx0ICogb2JzZXJ2YWJsZSwgd2hpY2ggdGhlIHZpZXcncyBhdXRvcnVuIHN1YnNjcmliZXMgdG8gZm9yIHJlYWN0aXZpdHkuXG5cdCAqL1xuXHRwcml2YXRlIHF1ZXJ5SW5zdGFsbGVkKCk6IElJbnN0YWxsZWRQbHVnaW5JdGVtW10ge1xuXHRcdGNvbnN0IG1hcmtldHBsYWNlT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkTWFya2V0cGxhY2UgPSB0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5sYXN0RmV0Y2hlZFBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbWFya2V0cGxhY2VCeUtleSA9IG5ldyBNYXA8c3RyaW5nLCBJTWFya2V0cGxhY2VQbHVnaW4+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IG1wIG9mIGNhY2hlZE1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdG1hcmtldHBsYWNlQnlLZXkuc2V0KGAke21wLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkfTo6JHttcC5uYW1lfWAsIG1wKTtcblx0XHRcdH1cblxuXG5cdFx0XHQvLyBSZWFkIGZyZXNoIGluc3RhbGxlZCBwbHVnaW4gbWV0YWRhdGEgZnJvbSB0aGUgc3RvcmUgKG5vdCBmcm9tXG5cdFx0XHQvLyBJQWdlbnRQbHVnaW4uZnJvbU1hcmtldHBsYWNlIHdoaWNoIG1heSBiZSBzdGFsZSBhZnRlciBhbiB1cGRhdGUpLlxuXHRcdFx0Y29uc3QgaW5zdGFsbGVkQnlVcmkgPSBuZXcgTWFwPHN0cmluZywgSU1hcmtldHBsYWNlUGx1Z2luPigpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRpbnN0YWxsZWRCeVVyaS5zZXQoZW50cnkucGx1Z2luVXJpLnRvU3RyaW5nKCksIGVudHJ5LnBsdWdpbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IG1hcmtldHBsYWNlQnlLZXksIGluc3RhbGxlZEJ5VXJpIH07XG5cdFx0fSk7XG5cblxuXHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpO1xuXHRcdHJldHVybiBwbHVnaW5zLm1hcChwID0+IHtcblx0XHRcdGNvbnN0IGlzT3V0ZGF0ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgbWFya2V0cGxhY2VCeUtleSwgaW5zdGFsbGVkQnlVcmkgfSA9IG1hcmtldHBsYWNlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3Qgc3RvcmVkUGx1Z2luID0gaW5zdGFsbGVkQnlVcmkuZ2V0KHAudXJpLnRvU3RyaW5nKCkpID8/IHAuZnJvbU1hcmtldHBsYWNlO1xuXHRcdFx0XHRpZiAoc3RvcmVkUGx1Z2luKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gYCR7c3RvcmVkUGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLmNhbm9uaWNhbElkfTo6JHtzdG9yZWRQbHVnaW4ubmFtZX1gO1xuXHRcdFx0XHRcdGNvbnN0IGxpdmUgPSBtYXJrZXRwbGFjZUJ5S2V5LmdldChrZXkpO1xuXHRcdFx0XHRcdGlmIChsaXZlICYmIGhhc1NvdXJjZUNoYW5nZWQoc3RvcmVkUGx1Z2luLnNvdXJjZURlc2NyaXB0b3IsIGxpdmUuc291cmNlRGVzY3JpcHRvcikpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsaXZlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBpbnN0YWxsZWRQbHVnaW5Ub0l0ZW0ocCwgdGhpcy5sYWJlbFNlcnZpY2UsIGlzT3V0ZGF0ZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeU1hcmtldHBsYWNlUGx1Z2lucygpOiBQcm9taXNlPElNYXJrZXRwbGFjZVBsdWdpbltdPiB7XG5cdFx0dGhpcy5xdWVyeUN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5xdWVyeUN0cy52YWx1ZSA9IGN0cztcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnMoY3RzLnRva2VuKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUJvZHkoY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJvZHlUZW1wbGF0ZSkge1xuXHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUucGx1Z2luc0xpc3QuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgY291bnQgPT09IDApO1xuXHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBjb3VudCA+IDApO1xuXHRcdFx0aWYgKGNvdW50ID09PSAwICYmIHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VCb3gudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9BZ2VudFBsdWdpbnMnLCBcIk5vIGFnZW50IHBsdWdpbnMgZm91bmQuXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEJyb3dzZSBjb21tYW5kXG5cbmNsYXNzIEFnZW50UGx1Z2luc0Jyb3dzZUNvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWdlbnRQbHVnaW5zLmJyb3dzZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudFBsdWdpbnMuYnJvd3NlJywgXCJBZ2VudCBQbHVnaW5zXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUyKCdhZ2VudFBsdWdpbnMuYnJvd3NlLnRvb2x0aXAnLCBcIkJyb3dzZSBBZ2VudCBQbHVnaW5zXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZWFyY2gsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogZXh0ZW5zaW9uc0ZpbHRlclN1Yk1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV9wcmVkZWZpbmVkJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgSW5zdGFsbGVkQWdlbnRQbHVnaW5zVmlld0lkKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKCdAYWdlbnRQbHVnaW5zICcpO1xuXHR9XG59XG5cbmNsYXNzIFJlZnJlc2hQbHVnaW5NYXJrZXRwbGFjZXNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZWZyZXNoQWdlbnRQbHVnaW5NYXJrZXRwbGFjZXNDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudFBsdWdpbnMucmVmcmVzaE1hcmtldHBsYWNlcycsIFwiUmVmcmVzaCBQbHVnaW4gTWFya2V0cGxhY2VzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignY2hhdC5jYXRlZ29yeScsIFwiQ2hhdFwiKSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdC8vIFNlcnZpY2VzIG11c3QgYmUgcmVzb2x2ZWQgc3luY2hyb25vdXNseSBcdTIwMTQgdGhlIGFjY2Vzc29yIGlzIGludmFsaWRhdGVkXG5cdFx0Ly8gYXMgc29vbiBhcyB0aGlzIG1ldGhvZCByZXR1cm5zIGl0cyBwcm9taXNlLlxuXHRcdGNvbnN0IG1hcmtldHBsYWNlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBmYWlsZWRMYWJlbHM6IHN0cmluZ1tdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudFBsdWdpbnMucmVmcmVzaGluZ01hcmtldHBsYWNlcycsIFwiUmVmcmVzaGluZyBwbHVnaW4gbWFya2V0cGxhY2VzLi4uXCIpLFxuXHRcdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiBtYXJrZXRwbGFjZVNlcnZpY2UuZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnMoY3RzLnRva2VuLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRyZWZyZXNoOiB0cnVlLFxuXHRcdFx0XHRcdG9uTWFya2V0cGxhY2VFcnJvcjogcmVmZXJlbmNlID0+IGZhaWxlZExhYmVscy5wdXNoKHJlZmVyZW5jZS5kaXNwbGF5TGFiZWwpLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0KCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSksXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5kaXZpZHVhbCBtYXJrZXRwbGFjZSBmYWlsdXJlcyBkb24ndCByZWplY3QgdGhlIGZldGNoLCBzbyByZXBvcnRcblx0XHRcdC8vIHRoZW0gZXhwbGljaXRseSByYXRoZXIgdGhhbiBjbGFpbWluZyBhbiB1bnF1YWxpZmllZCBzdWNjZXNzLlxuXHRcdFx0aWYgKGZhaWxlZExhYmVscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnYWdlbnRQbHVnaW5zLm1hcmtldHBsYWNlc1JlZnJlc2hlZFdpdGhFcnJvcnMnLCBcIlJlZnJlc2hlZCBwbHVnaW4gbWFya2V0cGxhY2VzLCBidXQgezB9IGNvdWxkIG5vdCBiZSByZWFkOiB7MX1cIiwgZmFpbGVkTGFiZWxzLmxlbmd0aCwgZmFpbGVkTGFiZWxzLmpvaW4oJywgJykpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnYWdlbnRQbHVnaW5zLm1hcmtldHBsYWNlc1JlZnJlc2hlZCcsIFwiUGx1Z2luIG1hcmtldHBsYWNlcyByZWZyZXNoZWQuXCIpKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnYWdlbnRQbHVnaW5zLnJlZnJlc2hNYXJrZXRwbGFjZXNGYWlsZWQnLCBcIkZhaWxlZCB0byByZWZyZXNoIHBsdWdpbiBtYXJrZXRwbGFjZXM6IHswfVwiLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKSk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4vLyNyZWdpb24gVmlld3MgY29udHJpYnV0aW9uXG5cbmV4cG9ydCBjbGFzcyBBZ2VudFBsdWdpbnNWaWV3c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgSUQgPSAnd29ya2JlbmNoLmNoYXQuYWdlbnRQbHVnaW5zLnZpZXdzLmNvbnRyaWJ1dGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5TZXJ2aWNlIGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGhhc0luc3RhbGxlZEtleSA9IEhhc0luc3RhbGxlZEFnZW50UGx1Z2luc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRoYXNJbnN0YWxsZWRLZXkuc2V0KGFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLnJlYWQocmVhZGVyKS5sZW5ndGggPiAwKTtcblx0XHR9KSk7XG5cblx0XHRyZWdpc3RlckFjdGlvbjIoQWdlbnRQbHVnaW5zQnJvd3NlQ29tbWFuZCk7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKFJlZnJlc2hQbHVnaW5NYXJrZXRwbGFjZXNDb21tYW5kKTtcblxuXHRcdFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3RXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdzKFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IEluc3RhbGxlZEFnZW50UGx1Z2luc1ZpZXdJZCxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdhZ2VudC1wbHVnaW5zLWluc3RhbGxlZCcsIFwiQWdlbnQgUGx1Z2lucyAtIEluc3RhbGxlZFwiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihBZ2VudFBsdWdpbnNMaXN0VmlldywgW3sgaW5zdGFsbGVkT25seTogdHJ1ZSB9XSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBIYXNJbnN0YWxsZWRBZ2VudFBsdWdpbnNDb250ZXh0LCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpKSxcblx0XHRcdFx0d2VpZ2h0OiAzMCxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5hZ2VudFBsdWdpbnMuZGVmYXVsdC5tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplMignYWdlbnQtcGx1Z2lucycsIFwiQWdlbnQgUGx1Z2luc1wiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihBZ2VudFBsdWdpbnNMaXN0VmlldywgW3t9XSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBIYXNJbnN0YWxsZWRBZ2VudFBsdWdpbnNDb250ZXh0LnRvTmVnYXRlZCgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpKSxcblx0XHRcdFx0d2VpZ2h0OiAzMCxcblx0XHRcdFx0b3JkZXI6IDUsXG5cdFx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHRcdGhpZGVCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5hZ2VudFBsdWdpbnMubWFya2V0cGxhY2UnLFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2FnZW50LXBsdWdpbnMnLCBcIkFnZW50IFBsdWdpbnNcIiksXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoQWdlbnRQbHVnaW5zTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoQWdlbnRQbHVnaW5zQ29udGV4dCwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSksXG5cdFx0XHR9LFxuXHRcdF0sIFZJRVdfQ09OVEFJTkVSKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsc0JBQThDO0FBR3ZELFNBQVMsUUFBaUIsaUJBQWlCO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGlCQUFpQixxQkFBa0MsY0FBYyx5QkFBeUI7QUFDL0csU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGVBQThDO0FBQ2hFLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtDQUFrQztBQUczQyxTQUFTLHdCQUF3QyxjQUFjLHNCQUFzQjtB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
