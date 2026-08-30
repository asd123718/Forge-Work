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
import * as touch from "../../../../base/browser/touch.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { toAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { TabbedActionListWidget } from "../../../../platform/actionWidget/browser/tabbedActionListWidget.js";
import { IMenuService, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../platform/agentHost/common/remoteAgentHostService.js";
import { TUNNEL_ADDRESS_PREFIX } from "../../../../platform/agentHost/common/tunnelAgentHost.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from "../../../services/sessions/common/session.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsRecentWorkspacesService, isWorktreeWorkspaceUri } from "../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { isAgentHostProvider } from "../../../common/agentHostSessionsProvider.js";
import { SessionWorkspacePickerGroupContext } from "../../../common/contextkeys.js";
import { getStatusHover, getStatusLabel, removeRemoteHost, showRemoteHostOptions } from "../../providers/remoteAgentHost/browser/remoteHostOptions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { reportNewChatPickerClosed } from "./newChatPickerTelemetry.js";
import { Menus } from "../../../browser/menus.js";
import { markOnboardingTarget } from "../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { NewSessionWorkspacePreselectionSource } from "./newSessionComposerService.js";
import { SessionWorkspaceFallback } from "./sessionWorkspaceFallback.js";
import { buildSessionWorkspacePickerCatalog } from "./sessionWorkspacePickerModel.js";
const FILTER_THRESHOLD = 10;
const TABBED_PICKER_WIDTH = 360;
const RESTORE_CONNECT_GRACE_MS = 5e3;
let WorkspacePicker = class extends Disposable {
  constructor(options, actionWidgetService, uriIdentityService, sessionsProvidersService, recentWorkspacesService, remoteAgentHostService, configurationService, commandService, menuService, contextKeyService, instantiationService, fileDialogService, telemetryService, notificationService) {
    super();
    this.options = options;
    this.actionWidgetService = actionWidgetService;
    this.uriIdentityService = uriIdentityService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.recentWorkspacesService = recentWorkspacesService;
    this.remoteAgentHostService = remoteAgentHostService;
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.fileDialogService = fileDialogService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
    this._onDidSelectWorkspace = this._register(new Emitter());
    this.onDidSelectWorkspace = this._onDidSelectWorkspace.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
    this._selectionGeneration = 0;
    this._sessionRestoreGeneration = 0;
    /**
     * Set to `true` once the user has explicitly picked or cleared a workspace.
     * Until then, late-arriving provider registrations are allowed to upgrade
     * the current (auto-restored) selection to the user's stored "checked"
     * entry. After the user has acted, providers coming and going never move
     * the selection out from under them.
     */
    this._userHasPicked = false;
    /**
     * Watches the connection status of a restored remote workspace. Cleared when
     * the user explicitly picks, when the connection succeeds, or when it fails
     * and we fall back.
     */
    this._connectionStatusWatch = this._register(new MutableDisposable());
    this._localBrowseAction = {
      label: localize("workspacePicker.browseSelectLocal", "Select..."),
      group: SESSION_WORKSPACE_GROUP_LOCAL,
      icon: Codicon.folderOpened,
      providerId: "",
      run: async () => (await this._browseForLocalFolder())?.workspace
    };
    /** All live trigger elements. Label updates fan out to every entry. */
    this._triggerElements = /* @__PURE__ */ new Set();
    this._renderDisposables = this._register(new DisposableStore());
    /**
     * Whether the user explicitly clicked a tab while the picker was open.
     * Reset on each fresh open so the picker re-defaults to the selected
     * workspace's group between opens.
     */
    this._userPickedTab = false;
    this._tabbedWidget = this._register(this.instantiationService.createInstance(TabbedActionListWidget));
    this._pickerGroupContext = SessionWorkspacePickerGroupContext.bindTo(this.contextKeyService);
    this._register(this._tabbedWidget.onDidChangeTab((tab) => this._selectWorkspaceGroup(tab)));
    this._register(this._tabbedWidget.onDidHide(() => {
      this._pickerGroupContext.reset();
    }));
    this._sessionWorkspaceFallback = this.options.restoreFromSessions === false ? void 0 : this._register(this.instantiationService.createInstance(SessionWorkspaceFallback, {
      canUseProvider: (providerId) => this._canRestoreProviderWorkspace(providerId),
      isProviderUnavailable: (providerId) => this._isProviderUnavailable(providerId),
      resolveWorkspace: (folderUri, preferredProviderId) => this._resolveFolder(folderUri, preferredProviderId)
    }));
    if (this._sessionWorkspaceFallback) {
      this._register(this._sessionWorkspaceFallback.onDidChange(() => this._restoreAutomaticSelection()));
    }
    const restored = this._restoreSelectedWorkspace();
    this._applySelection(restored?.resolved, restored?.source);
    if (this._selectedResolved) {
      this._watchForConnectionFailure(this._selectedResolved);
    } else {
      this._scheduleSessionWorkspaceRestore();
    }
    this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
      this._sessionWorkspaceFallback?.refreshProviders();
      if (this._selectedFolderUri) {
        const reresolved = this._resolveFolder(this._selectedFolderUri);
        if (!reresolved) {
          this._selectedFolderUri = void 0;
          this._selectedResolved = void 0;
          this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
          this._connectionStatusWatch.clear();
          this._updateTriggerLabel();
          this._onDidChangeSelection.fire();
          this._onDidSelectWorkspace.fire(void 0);
        } else {
          this._selectedResolved = reresolved;
        }
      }
      this._restoreAutomaticSelection();
    }));
    this._register(this.recentWorkspacesService.onDidChangeRecentWorkspaces(() => {
      this._restoreAutomaticSelection();
    }));
    this._register(this.onDidSelectWorkspace((selection) => {
      if (selection && !this.actionWidgetService.isVisible && !this._tabbedWidget.isVisible) {
        this._userPickedTab = false;
      }
    }));
  }
  get selectedFolderUri() {
    return this._selectedFolderUri;
  }
  /**
   * Returns the currently selected folder resolved to a workspace via the
   * first provider that can resolve it. Used internally for rendering
   * (label, icon, group). The provider association is not part of the
   * picker's public contract — callers should use {@link selectedFolderUri}
   * and let the management service rediscover the provider.
   */
  get selectedResolved() {
    return this._selectedResolved;
  }
  get preselectionSource() {
    return this._preselectionSource;
  }
  _selectWorkspaceGroup(group) {
    this._activeTab = group;
    this._userPickedTab = true;
    this._pickerGroupContext.set(group);
  }
  /**
   * Renders the project picker trigger button into the given container.
   * Returns the container element.
   *
   * Calling it again replaces the trigger created by the previous
   * {@link render} call.
   */
  render(container) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-workspace-picker"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    this._renderDisposables.add(this._addTrigger(slot));
    return slot;
  }
  /**
   * Shared trigger-creation core for {@link render}. Wires up the click /
   * keyboard / touch handlers and the per-trigger lifecycle.
   */
  _addTrigger(slot) {
    const triggerDisposables = new DisposableStore();
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    this._triggerElements.add(trigger);
    this._triggerElement = trigger;
    this._renderTriggerLabel(trigger);
    triggerDisposables.add(markOnboardingTarget(trigger, "sessions.newSession.workspacePicker", {
      open: () => this.showPicker(false, trigger)
    }));
    triggerDisposables.add(touch.Gesture.addTarget(trigger));
    [dom.EventType.CLICK, touch.EventType.Tap].forEach((eventType) => {
      triggerDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this.showPicker(false, trigger);
      }));
    });
    triggerDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this.showPicker(false, trigger);
      }
    }));
    triggerDisposables.add({
      dispose: () => {
        this._triggerElements.delete(trigger);
        if (this._triggerElement === trigger) {
          this._triggerElement = this._triggerElements.values().next().value;
        }
      }
    });
    return triggerDisposables;
  }
  /**
   * Shows the workspace picker dropdown anchored to a trigger element.
   *
   * @param force When true, re-show even if the picker is already visible.
   *              Used internally when swapping items in place after a tab
   *              change.
   * @param anchor The specific trigger element to anchor the popup to. When
   *               omitted, defaults to the most-recently rendered trigger.
   *               Pass through when more than one trigger is live and the
   *               popup should align with the one the user actually clicked.
   */
  showPicker(force = false, anchor) {
    const triggerElement = anchor ?? this._triggerElement;
    if (!triggerElement) {
      return;
    }
    const alreadyVisible = this.actionWidgetService.isVisible || this._tabbedWidget.isVisible;
    if (!force && alreadyVisible) {
      return;
    }
    const tabs = this._showTabs() ? this._getAvailableTabs() : [];
    if (tabs.length > 0) {
      const selectedGroup = this._selectedResolved?.workspace.group;
      if (!this._userPickedTab && selectedGroup && tabs.some((t) => t.id === selectedGroup)) {
        this._activeTab = selectedGroup;
      }
      if (!this._activeTab || !tabs.some((t) => t.id === this._activeTab)) {
        this._activeTab = tabs[0].id;
      }
    }
    const tabbed = tabs.length > 1;
    if (tabbed) {
      this._showTabbedPicker(tabs, triggerElement);
    } else {
      this._activeTab = void 0;
      this._showFlatPicker(triggerElement);
    }
  }
  /**
   * Subclasses may opt out of the categorical tab bar (e.g. when scoped to
   * a single host).
   */
  _showTabs() {
    return true;
  }
  _getAvailableTabs() {
    return [...buildSessionWorkspacePickerCatalog({
      providers: this.sessionsProvidersService.getProviders(),
      remoteAgentHostsEnabled: this.configurationService.getValue(RemoteAgentHostsEnabledSettingId)
    }).tabs];
  }
  /**
   * Builds the shared `IActionListDelegate` used by both the flat and
   * tabbed presentations.
   */
  _buildDelegate(triggerElement, hide) {
    return {
      onSelect: (item) => {
        hide();
        void this._dispatchPickerItem(item);
      },
      onHide: () => {
        triggerElement.setAttribute("aria-expanded", "false");
        triggerElement.focus();
      }
    };
  }
  _buildListOptions(items, pickerWidth) {
    const showFilter = items.filter((i) => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
    return showFilter ? { showFilter: true, filterPlaceholder: localize("workspacePicker.filter", "Search Workspaces..."), reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth, hideDefaultKeybindingTooltip: true } : { reserveSubmenuSpace: false, inlineDescription: true, showGroupTitleOnFirstItem: true, minWidth: pickerWidth, maxWidth: pickerWidth, hideDefaultKeybindingTooltip: true };
  }
  /**
   * Flat (no-tabs) presentation. Delegates rendering to the shared
   * `IActionWidgetService` so we benefit from its keybindings, focus
   * tracking and submenu chrome.
   */
  _showFlatPicker(triggerElement) {
    this._tabbedWidget.hide();
    const items = this._buildItems();
    const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
    triggerElement.setAttribute("aria-expanded", "true");
    this.actionWidgetService.show(
      "workspacePicker",
      false,
      items,
      delegate,
      triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("workspacePicker.ariaLabel", "Workspace Picker")
      },
      this._buildListOptions(items, void 0)
    );
  }
  /**
   * Tabbed presentation. Delegates rendering and lifecycle to the
   * platform `TabbedActionListWidget`; this picker only owns the data
   * and selection logic.
   */
  _showTabbedPicker(tabs, triggerElement) {
    if (this.actionWidgetService.isVisible) {
      this.actionWidgetService.hide();
    }
    const delegate = this._buildDelegate(triggerElement, () => this._hidePicker());
    const accessibilityProvider = {
      getAriaLabel: (item) => item.label ?? "",
      getWidgetAriaLabel: () => localize("workspacePicker.ariaLabel", "Workspace Picker")
    };
    triggerElement.setAttribute("aria-expanded", "true");
    this._pickerGroupContext.set(this._activeTab ?? tabs[0].id);
    this._tabbedWidget.show({
      user: "workspacePicker",
      anchor: triggerElement,
      tabs,
      initialTab: this._activeTab ?? tabs[0].id,
      createActionList: (tab) => {
        this._activeTab = tab;
        const items = this._buildItems();
        return { items, listOptions: { inlineDescription: true, showGroupTitleOnFirstItem: true, hideDefaultKeybindingTooltip: true } };
      },
      delegate,
      accessibilityProvider,
      width: TABBED_PICKER_WIDTH,
      tabBarClassName: "sessions-workspace-picker-tabbar"
    });
  }
  /**
   * Dispatch logic for a picker item once the user picks it. Shared
   * between the desktop action-widget delegate and any mobile sheet
   * subclass that opts to render a different UI but reuse the
   * selection semantics. Treats unavailable workspaces as a no-op.
   */
  async _dispatchPickerItem(item) {
    const generation = ++this._selectionGeneration;
    this._reportPickerClosed(item);
    if (item.run) {
      item.run();
      return true;
    } else if (item.commandId) {
      void this.commandService.executeCommand(item.commandId);
      return true;
    } else if (item.folderUri && item.providerId && this._isProviderUnavailable(item.providerId)) {
      return false;
    }
    if (item.browseActionIndex !== void 0) {
      const selection = await this._executeBrowseAction(item.browseActionIndex);
      const folderUri = selection?.workspace.folders[0]?.root;
      if (!folderUri || generation !== this._selectionGeneration) {
        return false;
      }
      if (!await this._canSelectWorkspace(folderUri, selection.providerId)) {
        return false;
      }
      if (generation !== this._selectionGeneration) {
        return false;
      }
      this._selectFolder(folderUri, true, selection.providerId);
      return true;
    } else if (item.folderUri) {
      if (item.providerId && !await this._connectProviderOnDemand(item.providerId)) {
        return false;
      }
      if (generation !== this._selectionGeneration) {
        return false;
      }
      if (!await this._canSelectWorkspace(item.folderUri, item.providerId)) {
        return false;
      }
      if (generation !== this._selectionGeneration) {
        return false;
      }
      this._selectFolder(item.folderUri, true, item.providerId);
      return true;
    }
    return false;
  }
  /**
   * Emits `newChatPickerClosed` telemetry on user selection. The
   * "before" value is read from storage (the currently-checked recent
   * workspace) if available, otherwise from the in-memory selection.
   * The "after" value comes from the item the user picked — undefined
   * when the item is a browse action or command rather than a workspace.
   */
  _reportPickerClosed(item) {
    const beforeFromStorage = this._restoreCheckedWorkspace();
    const before = beforeFromStorage ?? this._selectedResolved;
    const afterUri = item.folderUri;
    const afterResolved = afterUri ? this._resolveFolder(afterUri) : void 0;
    reportNewChatPickerClosed(this.telemetryService, {
      id: "NewChatWorkspacePicker",
      name: "NewChatWorkspacePicker",
      optionIdBefore: before?.workspace?.uri.toString(),
      optionIdAfter: afterResolved?.workspace?.uri.toString(),
      optionLabelBefore: before?.workspace?.label,
      optionLabelAfter: afterResolved?.workspace?.label,
      isPII: true
    });
  }
  /**
   * Programmatically set the selected workspace by folder URI.
   * @param folderUri The folder URI to select.
   * @param options.fireEvent Whether to fire the onDidSelectWorkspace event. Defaults to true.
   * @param options.providerId Optional providerId hint that wins over any historical
   *        recent entry's provider. Use when the caller knows which provider should
   *        own the resulting session (e.g. "New Session" invoked from a workspace
   *        section in the sessions list, where the existing sessions for the
   *        workspace were created by a specific provider).
   * @param options.persist Whether to persist the selection as a recent workspace. Defaults to true.
   */
  setSelectedWorkspace(folderUri, options) {
    this._selectFolder(
      folderUri,
      options?.fireEvent ?? true,
      options?.providerId,
      options?.persist ?? true,
      NewSessionWorkspacePreselectionSource.ProvidedWorkspace
    );
  }
  /**
   * Hides whichever popup variant is currently visible — the shared
   * action-widget-service flat picker or our own context-view-driven
   * tabbed picker.
   */
  _hidePicker() {
    this._tabbedWidget.hide();
    if (this.actionWidgetService.isVisible) {
      this.actionWidgetService.hide();
    }
  }
  /**
   * Clears the selected project.
   */
  clearSelection() {
    this._selectionGeneration++;
    this._hidePicker();
    this._userHasPicked = true;
    this._connectionStatusWatch.clear();
    this._selectedFolderUri = void 0;
    this._selectedResolved = void 0;
    this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
    if (this._shouldPersistSelection()) {
      this.recentWorkspacesService.clearCheckedWorkspace();
    }
    this._updateTriggerLabel();
    this._onDidChangeSelection.fire();
  }
  /**
   * Clears the selection if it matches the given URI.
   */
  removeFromRecents(uri) {
    if (this._selectedFolderUri && this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, uri)) {
      this.clearSelection();
    }
  }
  _selectFolder(folderUri, fireEvent = true, providerIdHint, persist = true, source = NewSessionWorkspacePreselectionSource.User) {
    this._selectionGeneration++;
    this._userHasPicked = true;
    this._connectionStatusWatch.clear();
    const storedProviderId = this.recentWorkspacesService.getRecentWorkspaces().find((r) => this.uriIdentityService.extUri.isEqual(r.workspace.folders[0]?.root, folderUri))?.providerId;
    const resolved = this._resolveFolder(folderUri, providerIdHint ?? storedProviderId);
    this._selectedFolderUri = folderUri;
    this._selectedResolved = resolved;
    this._preselectionSource = source;
    if (persist && this._shouldPersistSelection()) {
      this.recentWorkspacesService.addRecentWorkspace(folderUri, resolved?.providerId, true);
    }
    this._updateTriggerLabel();
    this._onDidChangeSelection.fire();
    if (fireEvent) {
      this._onDidSelectWorkspace.fire(folderUri);
    }
  }
  _shouldPersistSelection() {
    return true;
  }
  /**
   * Apply a restored selection without firing events or persisting. Used
   * during construction and after provider list changes.
   */
  _applySelection(resolved, source = NewSessionWorkspacePreselectionSource.None) {
    this._selectedResolved = resolved;
    this._selectedFolderUri = resolved?.workspace.folders[0]?.root;
    this._preselectionSource = resolved ? source : NewSessionWorkspacePreselectionSource.None;
  }
  /**
   * Iterate providers and return the first resolution of the folder URI.
   * When `preferredProviderId` is given, that provider is tried first so a
   * user's historical pick survives provider iteration order changes.
   */
  _resolveFolder(folderUri, preferredProviderId) {
    if (preferredProviderId) {
      const preferred = this.sessionsProvidersService.getProvider(preferredProviderId);
      const workspace = preferred?.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: preferredProviderId, workspace };
      }
    }
    for (const provider of this.sessionsProvidersService.getProviders()) {
      const workspace = provider.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: provider.id, workspace };
      }
    }
    return void 0;
  }
  /**
   * Executes a browse action from a provider, identified by index.
   */
  async _executeBrowseAction(actionIndex) {
    const allActions = this._getAllBrowseActions();
    const action = allActions[actionIndex];
    if (!action) {
      return void 0;
    }
    try {
      if (action === this._localBrowseAction) {
        return await this._browseForLocalFolder();
      }
      const workspace = await action.run();
      return workspace ? { workspace, providerId: action.providerId } : void 0;
    } catch {
    }
    return void 0;
  }
  async _canSelectWorkspace(folderUri, providerId) {
    return !this.options.canSelectWorkspace || await this.options.canSelectWorkspace(folderUri, providerId);
  }
  /**
   * Collects browse actions from all registered providers, scoped to the
   * currently active tab when tabs are shown.
   */
  _getAllBrowseActions() {
    const providers = this.sessionsProvidersService.getProviders();
    const catalog = buildSessionWorkspacePickerCatalog({
      providers,
      localBrowseAction: providers.some((provider) => provider.supportsLocalWorkspaces) ? this._localBrowseAction : void 0,
      remoteAgentHostsEnabled: this.configurationService.getValue(RemoteAgentHostsEnabledSettingId),
      activeGroup: this._isTabFiltered() ? this._activeTab : void 0
    });
    return [...catalog.browseActions];
  }
  /**
   * Opens a folder picker dialog and returns the chosen URI. The folder's
   * provider is rediscovered later by the management service when the
   * session is created — no provider quick-pick is needed here.
   */
  async _browseForLocalFolder() {
    const localProviders = this.sessionsProvidersService.getProviders().filter((p) => p.supportsLocalWorkspaces);
    if (localProviders.length === 0) {
      return void 0;
    }
    const result = await this.fileDialogService.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!result?.length) {
      return void 0;
    }
    for (const provider of localProviders) {
      const workspace = provider.resolveWorkspace(result[0]);
      if (workspace) {
        return { workspace, providerId: provider.id };
      }
    }
    return void 0;
  }
  /** True when the picker is currently scoped to a single tab. */
  _isTabFiltered() {
    return this._showTabs() && !!this._activeTab && this._getAvailableTabs().length > 1;
  }
  /**
   * Builds the picker items list from recent workspaces.
   *
   * Items are shown in a flat recency-sorted list (most recently used first)
   * without source grouping. Own recents come first, followed by VS Code
   * recent folders.
   */
  _buildItems() {
    const items = [];
    const allProviders = this.sessionsProvidersService.getProviders();
    const availableTabs = this._getAvailableTabs();
    const activeGroup = this._activeTab ?? (availableTabs.length === 1 ? availableTabs[0].id : void 0);
    const workspaceGroupAction = this.options.getWorkspaceGroupAction?.(activeGroup);
    const catalog = buildSessionWorkspacePickerCatalog({
      providers: allProviders,
      recentWorkspaces: this._getRecentWorkspaces(),
      localBrowseAction: allProviders.some((provider) => provider.supportsLocalWorkspaces) ? this._localBrowseAction : void 0,
      remoteAgentHostsEnabled: this.configurationService.getValue(RemoteAgentHostsEnabledSettingId),
      activeGroup: this._isTabFiltered() ? this._activeTab : void 0
    });
    const recentWorkspaces = workspaceGroupAction?.hideWorkspaceItems ? [] : catalog.workspaces;
    for (const { workspace, providerId } of recentWorkspaces) {
      const folderUri = workspace.folders[0]?.root;
      if (!folderUri) {
        continue;
      }
      const selected = this._isSelectedFolder(folderUri);
      items.push({
        kind: ActionListItemKind.Action,
        label: workspace.label,
        description: workspace.description,
        group: { title: "", icon: workspace.icon },
        disabled: this._isProviderUnavailable(providerId),
        item: { folderUri, providerId, checked: selected || void 0 },
        onRemove: () => this._removeRecentWorkspace(folderUri)
      });
    }
    const allBrowseActions = workspaceGroupAction?.hideWorkspaceItems ? [] : catalog.browseActions;
    const remoteProviders = allProviders.filter(isAgentHostProvider).filter((p) => p.connectionStatus !== void 0);
    const includeRemoteProviders = this._activeTab === SESSION_WORKSPACE_GROUP_REMOTE;
    if (items.length > 0 && (workspaceGroupAction || allBrowseActions.length > 0)) {
      items.push({ kind: ActionListItemKind.Separator, label: "" });
    }
    if (workspaceGroupAction) {
      items.push({
        kind: ActionListItemKind.Action,
        label: workspaceGroupAction.label,
        description: workspaceGroupAction.description,
        group: { title: "", icon: workspaceGroupAction.icon },
        item: { commandId: workspaceGroupAction.commandId }
      });
    }
    allBrowseActions.forEach((action, index) => {
      const provider = allProviders.find((p) => p.id === action.providerId);
      const agentHostProvider = provider && isAgentHostProvider(provider) ? provider : void 0;
      const connectionStatus = agentHostProvider?.connectionStatus?.get();
      const isIncompatible = RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus);
      const isUnavailable = isIncompatible || !!connectionStatus && !RemoteAgentHostConnectionStatus.isConnected(connectionStatus) && !agentHostProvider?.canConnectOnDemand;
      items.push({
        kind: ActionListItemKind.Action,
        label: localize("workspacePicker.browseSelectAction", "Select..."),
        description: action.description,
        group: { title: "", icon: action.icon },
        disabled: isUnavailable,
        item: { browseActionIndex: index }
      });
    });
    const manageActions = [];
    if (includeRemoteProviders) {
      for (const provider of remoteProviders) {
        const status2 = provider.connectionStatus.get();
        const isTunnel = provider.remoteAddress?.startsWith(TUNNEL_ADDRESS_PREFIX);
        const action = toAction({
          id: `workspacePicker.remote.${provider.id}`,
          label: provider.label,
          tooltip: getStatusLabel(status2),
          enabled: true,
          run: () => {
            this._hidePicker();
            this._showRemoteHostOptionsDelayed(provider);
          }
        });
        const extended = action;
        extended.icon = RemoteAgentHostConnectionStatus.isIncompatible(status2) ? Codicon.warning : isTunnel ? Codicon.cloud : Codicon.remote;
        extended.hoverContent = getStatusHover(status2, provider.remoteAddress);
        if (provider.remoteAddress) {
          extended.onRemove = async () => {
            await removeRemoteHost(provider, this.remoteAgentHostService);
          };
        }
        manageActions.push(action);
      }
    }
    const menuActions = this.menuService.getMenuActions(Menus.SessionWorkspaceManage, this.contextKeyService, { renderShortTitle: true });
    for (const [, actions] of menuActions) {
      for (const menuAction of actions) {
        if (menuAction instanceof MenuItemAction) {
          const icon = ThemeIcon.isThemeIcon(menuAction.item.icon) ? menuAction.item.icon : void 0;
          manageActions.push(Object.assign(menuAction, { icon }));
        }
      }
    }
    if (manageActions.length > 0) {
      if (items.length > 0 && items[items.length - 1].kind !== ActionListItemKind.Separator) {
        items.push({ kind: ActionListItemKind.Separator, label: "" });
      }
      for (const action of manageActions) {
        const extended = action;
        items.push({
          kind: ActionListItemKind.Action,
          label: action.label,
          description: extended.onRemove ? action.tooltip || void 0 : void 0,
          group: { title: "", icon: extended.icon ?? Codicon.settingsGear },
          item: { run: () => action.run(), commandId: action.id },
          onRemove: extended.onRemove
        });
      }
    }
    return items;
  }
  _showRemoteHostOptionsDelayed(provider) {
    const timeout = setTimeout(() => {
      this.instantiationService.invokeFunction((accessor) => showRemoteHostOptions(accessor, provider));
    }, 1);
    this._renderDisposables.add({ dispose: () => clearTimeout(timeout) });
  }
  _updateTriggerLabel() {
    for (const trigger of this._triggerElements) {
      this._renderTriggerLabel(trigger);
    }
  }
  _renderTriggerLabel(trigger) {
    dom.clearNode(trigger);
    const workspace = this._selectedResolved?.workspace;
    const label = workspace ? workspace.label : localize("pickWorkspace", "workspace");
    const icon = workspace ? workspace.icon : Codicon.project;
    trigger.setAttribute("aria-label", workspace ? localize("workspacePicker.selectedAriaLabel", "New session in {0}", label) : localize("workspacePicker.pickAriaLabel", "Start by picking a workspace"));
    dom.append(trigger, renderIcon(icon));
    const labelSpan = dom.append(trigger, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = label;
    dom.append(trigger, renderIcon(Codicon.chevronDownCompact)).classList.add("sessions-chat-dropdown-chevron");
  }
  /**
   * Returns whether the given provider is a remote that is currently unavailable
   * (incompatible, or disconnected/still connecting without on-demand connect).
   * Returns false for providers without connection status (e.g. local providers).
   */
  _isProviderUnavailable(providerId) {
    const provider = this.sessionsProvidersService.getProvider(providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return false;
    }
    const connectionStatus = provider.connectionStatus.get();
    return RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus) || !RemoteAgentHostConnectionStatus.isConnected(connectionStatus) && !provider.canConnectOnDemand;
  }
  async _connectProviderOnDemand(providerId) {
    const provider = this.sessionsProvidersService.getProvider(providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return true;
    }
    const connectionStatus = provider.connectionStatus.get();
    if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
      return true;
    }
    if (RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus) || !provider.canConnectOnDemand || !provider.connect) {
      return false;
    }
    const initialMessage = localize("workspacePicker.connectingRemoteAgentHost", "Connecting to {0}...", provider.label);
    const handle = this.notificationService.notify({
      severity: Severity.Info,
      message: initialMessage,
      progress: { infinite: true }
    });
    status(initialMessage);
    const progressListener = provider.onDidReportConnectProgress?.((progress) => {
      if (!provider.remoteAddress || progress.connectionKey === provider.remoteAddress) {
        handle.updateMessage(progress.message);
        status(progress.message);
      }
    });
    let connected = false;
    try {
      await provider.connect();
      connected = RemoteAgentHostConnectionStatus.isConnected(provider.connectionStatus.get());
    } catch {
    } finally {
      progressListener?.dispose();
      handle.close();
    }
    if (connected) {
      return true;
    }
    const message = localize("workspacePicker.connectRemoteAgentHostFailed", "Failed to connect to {0}.", provider.label);
    this.notificationService.error(message);
    status(message);
    return false;
  }
  _isSelectedFolder(folderUri) {
    if (!this._selectedFolderUri || !folderUri) {
      return false;
    }
    return this.uriIdentityService.extUri.isEqual(this._selectedFolderUri, folderUri);
  }
  _restoreSelectedWorkspace() {
    try {
      const restored = buildSessionWorkspacePickerCatalog({
        providers: this.sessionsProvidersService.getProviders(),
        recentWorkspaces: this.recentWorkspacesService.getRecentWorkspaces(),
        ownRecentWorkspaces: this.recentWorkspacesService.getRecentWorkspaces(false),
        remoteAgentHostsEnabled: this.configurationService.getValue(RemoteAgentHostsEnabledSettingId),
        canUseProvider: (providerId) => this._canRestoreProviderWorkspace(providerId),
        isProviderUnavailable: (providerId) => this._isProviderUnavailable(providerId)
      }).defaultWorkspace;
      return restored ? {
        resolved: restored,
        source: restored.checked ? NewSessionWorkspacePreselectionSource.CheckedWorkspace : NewSessionWorkspacePreselectionSource.RecentWorkspace
      } : void 0;
    } catch {
      return void 0;
    }
  }
  _resetAutomaticSelection() {
    this._selectionGeneration++;
    this._sessionRestoreGeneration++;
    this._userHasPicked = false;
    this._connectionStatusWatch.clear();
    this._applySelection(void 0);
    this._updateTriggerLabel();
    this._onDidChangeSelection.fire();
    this._onDidSelectWorkspace.fire(void 0);
    this._sessionWorkspaceFallback?.refreshProviders();
    this._restoreAutomaticSelection();
  }
  /** Re-runs automatic selection and reports whether it changed synchronously. */
  refreshAutomaticSelection() {
    return this._restoreAutomaticSelection();
  }
  _restoreAutomaticSelection() {
    if (this._userHasPicked || !this._canRestoreWorkspace()) {
      return false;
    }
    const restored = this._restoreSelectedWorkspace();
    if (!restored) {
      if (!this._selectedFolderUri || this._preselectionSource === NewSessionWorkspacePreselectionSource.ExistingSessions) {
        this._scheduleSessionWorkspaceRestore();
      }
      return false;
    }
    this._sessionRestoreGeneration++;
    if (this._isSelectedFolder(restored.resolved.workspace.folders[0]?.root)) {
      this._selectedResolved = restored.resolved;
      this._preselectionSource = restored.source;
      return false;
    }
    this._applySelection(restored.resolved, restored.source);
    this._updateTriggerLabel();
    this._onDidChangeSelection.fire();
    this._onDidSelectWorkspace.fire(this._selectedFolderUri);
    this._watchForConnectionFailure(restored.resolved);
    return true;
  }
  _scheduleSessionWorkspaceRestore() {
    if (!this._sessionWorkspaceFallback || this._userHasPicked || !this._canRestoreWorkspace()) {
      return;
    }
    const restoreGeneration = ++this._sessionRestoreGeneration;
    const selectionGeneration = this._selectionGeneration;
    void this._sessionWorkspaceFallback.findWorkspace().then((restored) => {
      if (restoreGeneration !== this._sessionRestoreGeneration || selectionGeneration !== this._selectionGeneration || this._userHasPicked || !this._canRestoreWorkspace()) {
        return;
      }
      if (this._restoreSelectedWorkspace()) {
        this._restoreAutomaticSelection();
        return;
      }
      if (!restored) {
        if (this._preselectionSource === NewSessionWorkspacePreselectionSource.ExistingSessions) {
          this._applySelection(void 0);
          this._updateTriggerLabel();
          this._onDidChangeSelection.fire();
          this._onDidSelectWorkspace.fire(void 0);
        }
        return;
      }
      const folderUri = restored.workspace.folders[0]?.root;
      if (this._isSelectedFolder(folderUri)) {
        this._selectedResolved = restored;
        this._preselectionSource = NewSessionWorkspacePreselectionSource.ExistingSessions;
        return;
      }
      this._applySelection(restored, NewSessionWorkspacePreselectionSource.ExistingSessions);
      this._updateTriggerLabel();
      this._onDidChangeSelection.fire();
      this._onDidSelectWorkspace.fire(this._selectedFolderUri);
      this._watchForConnectionFailure(restored);
    }).catch(onUnexpectedError);
  }
  _canRestoreProviderWorkspace(providerId) {
    return !this.options.sessionWorkspaceProviderFilter || this.options.sessionWorkspaceProviderFilter(providerId);
  }
  _canRestoreWorkspace() {
    return this.options.canRestoreWorkspace?.() ?? true;
  }
  /**
   * Restore only the checked (previously selected) workspace if any
   * provider can resolve its URI. The provider's connection status is
   * intentionally NOT checked — we honor the user's explicit pick even
   * if the remote is still connecting or currently disconnected. The
   * trigger label reflects the connection state separately
   * (spinner / grayed).
   */
  _restoreCheckedWorkspace() {
    try {
      return this.recentWorkspacesService.getRecentWorkspaces(false).find((recent) => {
        const folderUri = recent.workspace.folders[0]?.root;
        return recent.checked && !!folderUri && !isWorktreeWorkspaceUri(folderUri);
      });
    } catch {
      return void 0;
    }
  }
  /**
   * When restoring a workspace whose provider isn't currently Connected,
   * watch the connection status. Fires `onDidSelectWorkspace(undefined)`
   * (which the view pane converts to `unsetNewSession()`) if:
   *   - the status transitions to Disconnected after we start watching, or
   *   - the status is still not Connected after a short grace period.
   *
   * The grace period covers a race: provider state can transition synchronously
   * inside provider registration before our autorun's first read, so we may
   * never observe an explicit Disconnected transition. The timer ensures we
   * eventually fall back instead of leaving the picker showing an unreachable
   * remote with no session.
   *
   * Has no effect once the user makes an explicit pick (`_userHasPicked`).
   */
  _watchForConnectionFailure(resolved) {
    const provider = this.sessionsProvidersService.getProvider(resolved.providerId);
    if (!provider || !isAgentHostProvider(provider) || !provider.connectionStatus) {
      return;
    }
    const connStatus = provider.connectionStatus;
    if (RemoteAgentHostConnectionStatus.isConnected(connStatus.get())) {
      return;
    }
    const folderUri = resolved.workspace.folders[0]?.root;
    if (!folderUri) {
      return;
    }
    const store = new DisposableStore();
    this._connectionStatusWatch.value = store;
    const fallback = () => {
      this._connectionStatusWatch.clear();
      if (!this._userHasPicked && this._isSelectedFolder(folderUri)) {
        this._selectedFolderUri = void 0;
        this._selectedResolved = void 0;
        this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
        this._updateTriggerLabel();
        this._onDidChangeSelection.fire();
        this._onDidSelectWorkspace.fire(void 0);
      }
    };
    let isFirstRun = true;
    store.add(autorun((reader) => {
      const status2 = connStatus.read(reader);
      if (RemoteAgentHostConnectionStatus.isConnected(status2)) {
        this._connectionStatusWatch.clear();
      } else if ((RemoteAgentHostConnectionStatus.isDisconnected(status2) || RemoteAgentHostConnectionStatus.isIncompatible(status2)) && !isFirstRun) {
        fallback();
      }
      isFirstRun = false;
    }));
    disposableTimeout(() => {
      if (!RemoteAgentHostConnectionStatus.isConnected(connStatus.get())) {
        fallback();
      }
    }, RESTORE_CONNECT_GRACE_MS, store);
  }
  // -- Recent workspaces (sessions' own history) --
  _getRecentWorkspaces() {
    return this.recentWorkspacesService.getRecentWorkspaces();
  }
  _removeRecentWorkspace(folderUri) {
    this.recentWorkspacesService.removeRecentWorkspace(folderUri);
    if (this._isSelectedFolder(folderUri)) {
      this._hidePicker();
      this._selectedFolderUri = void 0;
      this._selectedResolved = void 0;
      this._preselectionSource = NewSessionWorkspacePreselectionSource.None;
      this._updateTriggerLabel();
      this._onDidSelectWorkspace.fire(void 0);
    }
  }
};
WorkspacePicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, ISessionsProvidersService),
  __decorateParam(4, ISessionsRecentWorkspacesService),
  __decorateParam(5, IRemoteAgentHostService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IFileDialogService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, INotificationService)
], WorkspacePicker);
export {
  WorkspacePicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcc2Vzc2lvbldvcmtzcGFjZVBpY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIHRvdWNoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJVGFiRGVzY3JpcHRvciwgVGFiYmVkQWN0aW9uTGlzdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL3RhYmJlZEFjdGlvbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRVTk5FTF9BRERSRVNTX1BSRUZJWCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbldvcmtzcGFjZSwgSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24sIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlY2VudFdvcmtzcGFjZSwgSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UsIGlzV29ya3RyZWVXb3Jrc3BhY2VVcmkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIGlzQWdlbnRIb3N0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uV29ya3NwYWNlUGlja2VyR3JvdXBDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJucyAtLSBUT0RPOiBtb3ZlIHJlbW90ZSBob3N0IG9wdGlvbnMgb3V0IG9mIHByb3ZpZGVyc1xuaW1wb3J0IHsgZ2V0U3RhdHVzSG92ZXIsIGdldFN0YXR1c0xhYmVsLCByZW1vdmVSZW1vdGVIb3N0LCBzaG93UmVtb3RlSG9zdE9wdGlvbnMgfSBmcm9tICcuLi8uLi9wcm92aWRlcnMvcmVtb3RlQWdlbnRIb3N0L2Jyb3dzZXIvcmVtb3RlSG9zdE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuL25ld0NoYXRQaWNrZXJUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IG1hcmtPbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9icm93c2VyL3Nwb3RsaWdodC9vbmJvYXJkaW5nVGFyZ2V0LmpzJztcbmltcG9ydCB7IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UgfSBmcm9tICcuL25ld1Nlc3Npb25Db21wb3NlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJUmVzb2x2ZWRGb2xkZXJXb3Jrc3BhY2UsIFNlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjayB9IGZyb20gJy4vc2Vzc2lvbldvcmtzcGFjZUZhbGxiYWNrLmpzJztcbmltcG9ydCB7IGJ1aWxkU2Vzc2lvbldvcmtzcGFjZVBpY2tlckNhdGFsb2cgfSBmcm9tICcuL3Nlc3Npb25Xb3Jrc3BhY2VQaWNrZXJNb2RlbC5qcyc7XG5cbmV4cG9ydCB0eXBlIHsgSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlIH0gZnJvbSAnLi9zZXNzaW9uV29ya3NwYWNlRmFsbGJhY2suanMnO1xuXG5jb25zdCBGSUxURVJfVEhSRVNIT0xEID0gMTA7XG5cbi8qKlxuICogRml4ZWQgcGlja2VyIHdpZHRoIHdoZW4gdGhlIGNhdGVnb3JpY2FsIHRhYiBiYXIgaXMgc2hvd24uIEtlZXBzIHRoZSB0YWJcbiAqIHJvdyBhbmQgdGhlIGxpc3QgYWxpZ25lZCBhbmQgcHJldmVudHMgaG9yaXpvbnRhbCBqaXR0ZXIgd2hlbiBzd2l0Y2hpbmdcbiAqIHRhYnMuXG4gKi9cbmNvbnN0IFRBQkJFRF9QSUNLRVJfV0lEVEggPSAzNjA7XG5cbi8qKlxuICogR3JhY2UgcGVyaW9kIGZvciBhIHJlc3RvcmVkIHJlbW90ZSB3b3Jrc3BhY2UncyBwcm92aWRlciB0byByZWFjaCBDb25uZWN0ZWRcbiAqIGJlZm9yZSB3ZSBmYWxsIGJhY2sgdG8gbm8gc2VsZWN0aW9uLiBTU0ggdHVubmVscyB0eXBpY2FsbHkgY29ubmVjdCB3aXRoaW5cbiAqIGEgY291cGxlIHNlY29uZHM7IGlmIGl0IGhhc24ndCBjb25uZWN0ZWQgYnkgdGhlbiwgd2UnZCByYXRoZXIgc2hvdyBub1xuICogc2VsZWN0aW9uIHRoYW4gbGVhdmUgdGhlIHVzZXIgc3RhcmluZyBhdCBhbiB1bnJlYWNoYWJsZSB3b3Jrc3BhY2UuXG4gKi9cbmNvbnN0IFJFU1RPUkVfQ09OTkVDVF9HUkFDRV9NUyA9IDUwMDA7XG5cbi8qKlxuICogSXRlbSB0eXBlIHVzZWQgaW4gdGhlIGFjdGlvbiBsaXN0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VQaWNrZXJJdGVtIHtcblx0cmVhZG9ubHkgZm9sZGVyVXJpPzogVVJJO1xuXHQvKiogVGhlIHJlc29sdmVkIHdvcmtzcGFjZSAodXNlZCBmb3IgdW5hdmFpbGFibGUtcHJvdmlkZXIgY2hlY2tzKS4gKi9cblx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0cmVhZG9ubHkgYnJvd3NlQWN0aW9uSW5kZXg/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNoZWNrZWQ/OiBib29sZWFuO1xuXHQvKiogQ29tbWFuZCB0byBleGVjdXRlIHdoZW4gdGhpcyBpdGVtIGlzIHNlbGVjdGVkLiAqL1xuXHRyZWFkb25seSBjb21tYW5kSWQ/OiBzdHJpbmc7XG5cdC8qKiBJbmxpbmUgYWN0aW9uIHRvIHJ1biB3aGVuIHRoaXMgaXRlbSBpcyBzZWxlY3RlZC4gKi9cblx0cmVhZG9ubHkgcnVuPzogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlUGlja2VyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNhblNlbGVjdFdvcmtzcGFjZT86IChmb2xkZXJVcmk6IFVSSSwgcHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBQcm9taXNlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBjYW5SZXN0b3JlV29ya3NwYWNlPzogKCkgPT4gYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVzdG9yZUZyb21TZXNzaW9ucz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNlc3Npb25Xb3Jrc3BhY2VQcm92aWRlckZpbHRlcj86IChwcm92aWRlcklkOiBzdHJpbmcpID0+IGJvb2xlYW47XG5cdHJlYWRvbmx5IGdldFdvcmtzcGFjZUdyb3VwQWN0aW9uPzogKGdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IElXb3Jrc3BhY2VQaWNrZXJHcm91cEFjdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlUGlja2VyR3JvdXBBY3Rpb24ge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBjb21tYW5kSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaGlkZVdvcmtzcGFjZUl0ZW1zPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElCcm93c2VkV29ya3NwYWNlU2VsZWN0aW9uIHtcblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZTtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJlc3RvcmVkV29ya3NwYWNlU2VsZWN0aW9uIHtcblx0cmVhZG9ubHkgcmVzb2x2ZWQ6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZTtcblx0cmVhZG9ubHkgc291cmNlOiBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlO1xufVxuXG50eXBlIElXb3Jrc3BhY2VQaWNrZXJBY3Rpb24gPSBJQWN0aW9uICYgeyBpY29uPzogVGhlbWVJY29uOyBob3ZlckNvbnRlbnQ/OiBzdHJpbmc7IG9uUmVtb3ZlPzogKCkgPT4gdm9pZCB9O1xuXG4vKipcbiAqIEEgdW5pZmllZCB3b3Jrc3BhY2UgcGlja2VyIHRoYXQgc2hvd3Mgd29ya3NwYWNlcyBmcm9tIGFsbCByZWdpc3RlcmVkIHNlc3Npb25cbiAqIHByb3ZpZGVycyBpbiBhIHNpbmdsZSBkcm9wZG93bi5cbiAqXG4gKiBCcm93c2UgYWN0aW9ucyBmcm9tIHByb3ZpZGVycyBhcmUgYXBwZW5kZWQgYXQgdGhlIGJvdHRvbSBvZiB0aGUgbGlzdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTZWxlY3RXb3Jrc3BhY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkkgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdFdvcmtzcGFjZTogRXZlbnQ8VVJJIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmV2ZW50O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2VsZWN0aW9uOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3NlbGVjdGVkRm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NlbGVjdGVkUmVzb2x2ZWQ6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJlc2VsZWN0aW9uU291cmNlID0gTmV3U2Vzc2lvbldvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZS5Ob25lO1xuXHRwcml2YXRlIF9zZWxlY3Rpb25HZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSBfc2Vzc2lvblJlc3RvcmVHZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbldvcmtzcGFjZUZhbGxiYWNrOiBTZXNzaW9uV29ya3NwYWNlRmFsbGJhY2sgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNldCB0byBgdHJ1ZWAgb25jZSB0aGUgdXNlciBoYXMgZXhwbGljaXRseSBwaWNrZWQgb3IgY2xlYXJlZCBhIHdvcmtzcGFjZS5cblx0ICogVW50aWwgdGhlbiwgbGF0ZS1hcnJpdmluZyBwcm92aWRlciByZWdpc3RyYXRpb25zIGFyZSBhbGxvd2VkIHRvIHVwZ3JhZGVcblx0ICogdGhlIGN1cnJlbnQgKGF1dG8tcmVzdG9yZWQpIHNlbGVjdGlvbiB0byB0aGUgdXNlcidzIHN0b3JlZCBcImNoZWNrZWRcIlxuXHQgKiBlbnRyeS4gQWZ0ZXIgdGhlIHVzZXIgaGFzIGFjdGVkLCBwcm92aWRlcnMgY29taW5nIGFuZCBnb2luZyBuZXZlciBtb3ZlXG5cdCAqIHRoZSBzZWxlY3Rpb24gb3V0IGZyb20gdW5kZXIgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgX3VzZXJIYXNQaWNrZWQgPSBmYWxzZTtcblxuXHQvKipcblx0ICogV2F0Y2hlcyB0aGUgY29ubmVjdGlvbiBzdGF0dXMgb2YgYSByZXN0b3JlZCByZW1vdGUgd29ya3NwYWNlLiBDbGVhcmVkIHdoZW5cblx0ICogdGhlIHVzZXIgZXhwbGljaXRseSBwaWNrcywgd2hlbiB0aGUgY29ubmVjdGlvbiBzdWNjZWVkcywgb3Igd2hlbiBpdCBmYWlsc1xuXHQgKiBhbmQgd2UgZmFsbCBiYWNrLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvblN0YXR1c1dhdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbEJyb3dzZUFjdGlvbjogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24gPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuYnJvd3NlU2VsZWN0TG9jYWwnLCBcIlNlbGVjdC4uLlwiKSxcblx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQsXG5cdFx0cHJvdmlkZXJJZDogJycsXG5cdFx0cnVuOiBhc3luYyAoKSA9PiAoYXdhaXQgdGhpcy5fYnJvd3NlRm9yTG9jYWxGb2xkZXIoKSk/LndvcmtzcGFjZSxcblx0fTtcblxuXHQvKipcblx0ICogXCJQcmltYXJ5XCIgdHJpZ2dlci4gVGhpcyBpcyB0aGUgbW9zdCByZWNlbnRseSBjcmVhdGVkIGVudHJ5LiBQcmVzZXJ2ZWQgZm9yIHN1YmNsYXNzXG5cdCAqIHJlYWQgYWNjZXNzIChlLmcuIHtAbGluayBXZWJXb3Jrc3BhY2VQaWNrZXJ9IGFuY2hvcnMgaXRzIG1vYmlsZSBzaGVldCBoZXJlKSBhbmQgZm9yXG5cdCAqIHtAbGluayBzaG93UGlja2VyfSBjYWxscyB0aGF0IGRvIG5vdCBzdXBwbHkgYW4gYW5jaG9yLlxuXHQgKi9cblx0cHJvdGVjdGVkIF90cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBBbGwgbGl2ZSB0cmlnZ2VyIGVsZW1lbnRzLiBMYWJlbCB1cGRhdGVzIGZhbiBvdXQgdG8gZXZlcnkgZW50cnkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyaWdnZXJFbGVtZW50cyA9IG5ldyBTZXQ8SFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFiYmVkV2lkZ2V0OiBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waWNrZXJHcm91cENvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIEN1cnJlbnRseSBhY3RpdmUgd29ya3NwYWNlIHRhYiAoYSBncm91cCBsYWJlbCBjb250cmlidXRlZCBieSBhXG5cdCAqIHByb3ZpZGVyLCBlLmcuIGBcIkxvY2FsXCJgIC8gYFwiQ2xvdWRcImAgLyBgXCJSZW1vdGVcImApLlxuXHQgKi9cblx0cHJpdmF0ZSBfYWN0aXZlVGFiOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHVzZXIgZXhwbGljaXRseSBjbGlja2VkIGEgdGFiIHdoaWxlIHRoZSBwaWNrZXIgd2FzIG9wZW4uXG5cdCAqIFJlc2V0IG9uIGVhY2ggZnJlc2ggb3BlbiBzbyB0aGUgcGlja2VyIHJlLWRlZmF1bHRzIHRvIHRoZSBzZWxlY3RlZFxuXHQgKiB3b3Jrc3BhY2UncyBncm91cCBiZXR3ZWVuIG9wZW5zLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXNlclBpY2tlZFRhYiA9IGZhbHNlO1xuXG5cdGdldCBzZWxlY3RlZEZvbGRlclVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZEZvbGRlclVyaTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgZm9sZGVyIHJlc29sdmVkIHRvIGEgd29ya3NwYWNlIHZpYSB0aGVcblx0ICogZmlyc3QgcHJvdmlkZXIgdGhhdCBjYW4gcmVzb2x2ZSBpdC4gVXNlZCBpbnRlcm5hbGx5IGZvciByZW5kZXJpbmdcblx0ICogKGxhYmVsLCBpY29uLCBncm91cCkuIFRoZSBwcm92aWRlciBhc3NvY2lhdGlvbiBpcyBub3QgcGFydCBvZiB0aGVcblx0ICogcGlja2VyJ3MgcHVibGljIGNvbnRyYWN0IFx1MjAxNCBjYWxsZXJzIHNob3VsZCB1c2Uge0BsaW5rIHNlbGVjdGVkRm9sZGVyVXJpfVxuXHQgKiBhbmQgbGV0IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2UgcmVkaXNjb3ZlciB0aGUgcHJvdmlkZXIuXG5cdCAqL1xuXHRnZXQgc2VsZWN0ZWRSZXNvbHZlZCgpOiBJUmVzb2x2ZWRGb2xkZXJXb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZFJlc29sdmVkO1xuXHR9XG5cblx0Z2V0IHByZXNlbGVjdGlvblNvdXJjZSgpOiBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJlc2VsZWN0aW9uU291cmNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJV29ya3NwYWNlUGlja2VyT3B0aW9ucyxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVjZW50V29ya3NwYWNlc1NlcnZpY2U6IElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdGFiYmVkV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0KSk7XG5cdFx0dGhpcy5fcGlja2VyR3JvdXBDb250ZXh0ID0gU2Vzc2lvbldvcmtzcGFjZVBpY2tlckdyb3VwQ29udGV4dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFiYmVkV2lkZ2V0Lm9uRGlkQ2hhbmdlVGFiKHRhYiA9PiB0aGlzLl9zZWxlY3RXb3Jrc3BhY2VHcm91cCh0YWIpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFiYmVkV2lkZ2V0Lm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9waWNrZXJHcm91cENvbnRleHQucmVzZXQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zZXNzaW9uV29ya3NwYWNlRmFsbGJhY2sgPSB0aGlzLm9wdGlvbnMucmVzdG9yZUZyb21TZXNzaW9ucyA9PT0gZmFsc2Vcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbldvcmtzcGFjZUZhbGxiYWNrLCB7XG5cdFx0XHRcdGNhblVzZVByb3ZpZGVyOiBwcm92aWRlcklkID0+IHRoaXMuX2NhblJlc3RvcmVQcm92aWRlcldvcmtzcGFjZShwcm92aWRlcklkKSxcblx0XHRcdFx0aXNQcm92aWRlclVuYXZhaWxhYmxlOiBwcm92aWRlcklkID0+IHRoaXMuX2lzUHJvdmlkZXJVbmF2YWlsYWJsZShwcm92aWRlcklkKSxcblx0XHRcdFx0cmVzb2x2ZVdvcmtzcGFjZTogKGZvbGRlclVyaSwgcHJlZmVycmVkUHJvdmlkZXJJZCkgPT4gdGhpcy5fcmVzb2x2ZUZvbGRlcihmb2xkZXJVcmksIHByZWZlcnJlZFByb3ZpZGVySWQpLFxuXHRcdFx0fSkpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uV29ya3NwYWNlRmFsbGJhY2spIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjay5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9yZXN0b3JlQXV0b21hdGljU2VsZWN0aW9uKCkpKTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHNlbGVjdGVkIHdvcmtzcGFjZSBmcm9tIHN0b3JhZ2Vcblx0XHRjb25zdCByZXN0b3JlZCA9IHRoaXMuX3Jlc3RvcmVTZWxlY3RlZFdvcmtzcGFjZSgpO1xuXHRcdHRoaXMuX2FwcGx5U2VsZWN0aW9uKHJlc3RvcmVkPy5yZXNvbHZlZCwgcmVzdG9yZWQ/LnNvdXJjZSk7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQpIHtcblx0XHRcdHRoaXMuX3dhdGNoRm9yQ29ubmVjdGlvbkZhaWx1cmUodGhpcy5fc2VsZWN0ZWRSZXNvbHZlZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlU2Vzc2lvbldvcmtzcGFjZVJlc3RvcmUoKTtcblx0XHR9XG5cblx0XHQvLyBSZWFjdCB0byBwcm92aWRlciByZWdpc3RyYXRpb25zL3JlbW92YWxzOiByZS12YWxpZGF0ZSB0aGUgY3VycmVudFxuXHRcdC8vIHNlbGVjdGlvbiwgYW5kIGlmIHRoZSB1c2VyIGhhc24ndCBleHBsaWNpdGx5IHBpY2tlZCB5ZXQsIHJlLXJlc3RvcmVcblx0XHQvLyBmcm9tIHN0b3JhZ2Ugc28gd2UgdXBncmFkZSBmcm9tIGFueSBmYWxsYmFjayB0byB0aGUgdXNlcidzIGFjdHVhbFxuXHRcdC8vIHN0b3JlZCBzZWxlY3Rpb24gb25jZSBpdHMgcHJvdmlkZXIgYXJyaXZlcy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uV29ya3NwYWNlRmFsbGJhY2s/LnJlZnJlc2hQcm92aWRlcnMoKTtcblx0XHRcdGlmICh0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSkge1xuXHRcdFx0XHQvLyBSZS1yZXNvbHZlIGluIGNhc2UgdGhlIHByZXZpb3VzIHJlc29sdmluZyBwcm92aWRlciB3YXMgcmVtb3ZlZC5cblx0XHRcdFx0Y29uc3QgcmVyZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVGb2xkZXIodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXHRcdFx0XHRpZiAoIXJlcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3RlZFJlc29sdmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX3ByZXNlbGVjdGlvblNvdXJjZSA9IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuTm9uZTtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uU3RhdHVzV2F0Y2guY2xlYXIoKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSByZXJlc29sdmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZXN0b3JlQXV0b21hdGljU2VsZWN0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVlMgQ29kZSdzIHJlY2VudC13b3Jrc3BhY2UgaGlzdG9yeSBpcyBsb2FkZWQgYXN5bmNocm9ub3VzbHkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5vbkRpZENoYW5nZVJlY2VudFdvcmtzcGFjZXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVzdG9yZUF1dG9tYXRpY1NlbGVjdGlvbigpO1xuXHRcdH0pKTtcblx0XHQvLyBSZS1hcm0gYXV0by10YWIgd2hlbmV2ZXIgdGhlIHdvcmtzcGFjZSBzZWxlY3Rpb24gY2hhbmdlcyB0byBhIG5ld1xuXHRcdC8vIHZhbHVlLCBidXQgb25seSB3aGlsZSB0aGUgcGlja2VyIGlzIGNsb3NlZC4gVGhpcyB3YXkgcGlja2luZyBhIHRhYlxuXHRcdC8vIGFuZCB0aGVuIGEgd29ya3NwYWNlIHdpdGhpbiB0aGUgc2FtZSBvcGVuIGtlZXBzIHRoYXQgdGFiIGFjdGl2ZSBmb3Jcblx0XHQvLyB0aGUgY3VycmVudCBzZXNzaW9uLCB3aGlsZSB0aGUgbmV4dCBmcmVzaCBvcGVuIGZvbGxvd3MgdGhlIGxhdGVzdFxuXHRcdC8vIHNlbGVjdGlvbidzIGNhdGVnb3J5LiBDbGVhcnMgKGB1bmRlZmluZWRgKSBhcmUgaWdub3JlZCBzbyB0aGVcblx0XHQvLyBwcmV2aW91c2x5LWFjdGl2ZSB0YWIgaXMgcHJlc2VydmVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRTZWxlY3RXb3Jrc3BhY2Uoc2VsZWN0aW9uID0+IHtcblx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUgJiYgIXRoaXMuX3RhYmJlZFdpZGdldC5pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fdXNlclBpY2tlZFRhYiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2VsZWN0V29ya3NwYWNlR3JvdXAoZ3JvdXA6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVRhYiA9IGdyb3VwO1xuXHRcdHRoaXMuX3VzZXJQaWNrZWRUYWIgPSB0cnVlO1xuXHRcdHRoaXMuX3BpY2tlckdyb3VwQ29udGV4dC5zZXQoZ3JvdXApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIHByb2plY3QgcGlja2VyIHRyaWdnZXIgYnV0dG9uIGludG8gdGhlIGdpdmVuIGNvbnRhaW5lci5cblx0ICogUmV0dXJucyB0aGUgY29udGFpbmVyIGVsZW1lbnQuXG5cdCAqXG5cdCAqIENhbGxpbmcgaXQgYWdhaW4gcmVwbGFjZXMgdGhlIHRyaWdnZXIgY3JlYXRlZCBieSB0aGUgcHJldmlvdXNcblx0ICoge0BsaW5rIHJlbmRlcn0gY2FsbC5cblx0ICovXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBzbG90ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdC5zZXNzaW9ucy1jaGF0LXdvcmtzcGFjZS1waWNrZXInKSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5fYWRkVHJpZ2dlcihzbG90KSk7XG5cblx0XHRyZXR1cm4gc2xvdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaGFyZWQgdHJpZ2dlci1jcmVhdGlvbiBjb3JlIGZvciB7QGxpbmsgcmVuZGVyfS4gV2lyZXMgdXAgdGhlIGNsaWNrIC9cblx0ICoga2V5Ym9hcmQgLyB0b3VjaCBoYW5kbGVycyBhbmQgdGhlIHBlci10cmlnZ2VyIGxpZmVjeWNsZS5cblx0ICovXG5cdHByaXZhdGUgX2FkZFRyaWdnZXIoc2xvdDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdHJpZ2dlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IGRvbS5hcHBlbmQoc2xvdCwgZG9tLiQoJ2EuYWN0aW9uLWxhYmVsJykpO1xuXHRcdHRyaWdnZXIudGFiSW5kZXggPSAwO1xuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2xpc3Rib3gnKTtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnRzLmFkZCh0cmlnZ2VyKTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCA9IHRyaWdnZXI7XG5cdFx0dGhpcy5fcmVuZGVyVHJpZ2dlckxhYmVsKHRyaWdnZXIpO1xuXHRcdC8vIE9uYm9hcmRpbmcgc3BvdGxpZ2h0IHRhcmdldCBcdTIwMTQgaWQgaXMgcmVmZXJlbmNlZCBieSB0aGUgXCJuZXcgc2Vzc2lvblwiIHRvdXJcblx0XHQvLyBpbiB2cy9zZXNzaW9ucy9jb250cmliL29uYm9hcmRpbmdUb3Vycy5cblx0XHR0cmlnZ2VyRGlzcG9zYWJsZXMuYWRkKG1hcmtPbmJvYXJkaW5nVGFyZ2V0KHRyaWdnZXIsICdzZXNzaW9ucy5uZXdTZXNzaW9uLndvcmtzcGFjZVBpY2tlcicsIHtcblx0XHRcdG9wZW46ICgpID0+IHRoaXMuc2hvd1BpY2tlcihmYWxzZSwgdHJpZ2dlciksXG5cdFx0fSkpO1xuXG5cdFx0dHJpZ2dlckRpc3Bvc2FibGVzLmFkZCh0b3VjaC5HZXN0dXJlLmFkZFRhcmdldCh0cmlnZ2VyKSk7XG5cdFx0W2RvbS5FdmVudFR5cGUuQ0xJQ0ssIHRvdWNoLkV2ZW50VHlwZS5UYXBdLmZvckVhY2goZXZlbnRUeXBlID0+IHtcblx0XHRcdHRyaWdnZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBldmVudFR5cGUsIChlKSA9PiB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNob3dQaWNrZXIoZmFsc2UsIHRyaWdnZXIpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHRcdHRyaWdnZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1BpY2tlcihmYWxzZSwgdHJpZ2dlcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dHJpZ2dlckRpc3Bvc2FibGVzLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50cy5kZWxldGUodHJpZ2dlcik7XG5cdFx0XHRcdGlmICh0aGlzLl90cmlnZ2VyRWxlbWVudCA9PT0gdHJpZ2dlcikge1xuXHRcdFx0XHRcdC8vIERlbW90ZSB0byBhbnkgb3RoZXIgbGl2ZSB0cmlnZ2VyIHNvIHN1YmNsYXNzZXMgdGhhdCByZWFkXG5cdFx0XHRcdFx0Ly8gYF90cmlnZ2VyRWxlbWVudGAgKGUuZy4gV2ViV29ya3NwYWNlUGlja2VyJ3MgbW9iaWxlIHNoZWV0XG5cdFx0XHRcdFx0Ly8gcGF0aCkgZG9uJ3QgZGVyZWZlcmVuY2UgYSByZW1vdmVkIG5vZGUuXG5cdFx0XHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQgPSB0aGlzLl90cmlnZ2VyRWxlbWVudHMudmFsdWVzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRyaWdnZXJEaXNwb3NhYmxlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyB0aGUgd29ya3NwYWNlIHBpY2tlciBkcm9wZG93biBhbmNob3JlZCB0byBhIHRyaWdnZXIgZWxlbWVudC5cblx0ICpcblx0ICogQHBhcmFtIGZvcmNlIFdoZW4gdHJ1ZSwgcmUtc2hvdyBldmVuIGlmIHRoZSBwaWNrZXIgaXMgYWxyZWFkeSB2aXNpYmxlLlxuXHQgKiAgICAgICAgICAgICAgVXNlZCBpbnRlcm5hbGx5IHdoZW4gc3dhcHBpbmcgaXRlbXMgaW4gcGxhY2UgYWZ0ZXIgYSB0YWJcblx0ICogICAgICAgICAgICAgIGNoYW5nZS5cblx0ICogQHBhcmFtIGFuY2hvciBUaGUgc3BlY2lmaWMgdHJpZ2dlciBlbGVtZW50IHRvIGFuY2hvciB0aGUgcG9wdXAgdG8uIFdoZW5cblx0ICogICAgICAgICAgICAgICBvbWl0dGVkLCBkZWZhdWx0cyB0byB0aGUgbW9zdC1yZWNlbnRseSByZW5kZXJlZCB0cmlnZ2VyLlxuXHQgKiAgICAgICAgICAgICAgIFBhc3MgdGhyb3VnaCB3aGVuIG1vcmUgdGhhbiBvbmUgdHJpZ2dlciBpcyBsaXZlIGFuZCB0aGVcblx0ICogICAgICAgICAgICAgICBwb3B1cCBzaG91bGQgYWxpZ24gd2l0aCB0aGUgb25lIHRoZSB1c2VyIGFjdHVhbGx5IGNsaWNrZWQuXG5cdCAqL1xuXHRzaG93UGlja2VyKGZvcmNlID0gZmFsc2UsIGFuY2hvcj86IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdHJpZ2dlckVsZW1lbnQgPSBhbmNob3IgPz8gdGhpcy5fdHJpZ2dlckVsZW1lbnQ7XG5cdFx0aWYgKCF0cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhbHJlYWR5VmlzaWJsZSA9IHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUgfHwgdGhpcy5fdGFiYmVkV2lkZ2V0LmlzVmlzaWJsZTtcblx0XHRpZiAoIWZvcmNlICYmIGFscmVhZHlWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFicyA9IHRoaXMuX3Nob3dUYWJzKCkgPyB0aGlzLl9nZXRBdmFpbGFibGVUYWJzKCkgOiBbXTtcblxuXHRcdC8vIERlZmF1bHQgdGhlIGFjdGl2ZSB0YWIgdG8gdGhlIGdyb3VwIG9mIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWRcblx0XHQvLyB3b3Jrc3BhY2UuIFRoZSB1c2VyLXBpY2sgbGF0Y2ggaXMgcmVzZXQgb24gZXZlcnkgc2VsZWN0aW9uIGNoYW5nZSxcblx0XHQvLyBzbyBwaWNraW5nIGEgdGFiIGR1cmluZyBvbmUgb3BlbiBvZiB0aGUgcGlja2VyIGRvZXNuJ3QgcGVybWFuZW50bHlcblx0XHQvLyBvdmVycmlkZSBhdXRvLXRhYi5cblx0XHRpZiAodGFicy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZEdyb3VwID0gdGhpcy5fc2VsZWN0ZWRSZXNvbHZlZD8ud29ya3NwYWNlLmdyb3VwO1xuXHRcdFx0aWYgKCF0aGlzLl91c2VyUGlja2VkVGFiICYmIHNlbGVjdGVkR3JvdXAgJiYgdGFicy5zb21lKHQgPT4gdC5pZCA9PT0gc2VsZWN0ZWRHcm91cCkpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlVGFiID0gc2VsZWN0ZWRHcm91cDtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fYWN0aXZlVGFiIHx8ICF0YWJzLnNvbWUodCA9PiB0LmlkID09PSB0aGlzLl9hY3RpdmVUYWIpKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVRhYiA9IHRhYnNbMF0uaWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFiYmVkID0gdGFicy5sZW5ndGggPiAxO1xuXHRcdGlmICh0YWJiZWQpIHtcblx0XHRcdHRoaXMuX3Nob3dUYWJiZWRQaWNrZXIodGFicywgdHJpZ2dlckVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVUYWIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zaG93RmxhdFBpY2tlcih0cmlnZ2VyRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN1YmNsYXNzZXMgbWF5IG9wdCBvdXQgb2YgdGhlIGNhdGVnb3JpY2FsIHRhYiBiYXIgKGUuZy4gd2hlbiBzY29wZWQgdG9cblx0ICogYSBzaW5nbGUgaG9zdCkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3Nob3dUYWJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBdmFpbGFibGVUYWJzKCk6IElUYWJEZXNjcmlwdG9yW10ge1xuXHRcdHJldHVybiBbLi4uYnVpbGRTZXNzaW9uV29ya3NwYWNlUGlja2VyQ2F0YWxvZyh7XG5cdFx0XHRwcm92aWRlcnM6IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpLFxuXHRcdFx0cmVtb3RlQWdlbnRIb3N0c0VuYWJsZWQ6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpLFxuXHRcdH0pLnRhYnNdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgc2hhcmVkIGBJQWN0aW9uTGlzdERlbGVnYXRlYCB1c2VkIGJ5IGJvdGggdGhlIGZsYXQgYW5kXG5cdCAqIHRhYmJlZCBwcmVzZW50YXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGREZWxlZ2F0ZSh0cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQsIGhpZGU6ICgpID0+IHZvaWQpOiBJQWN0aW9uTGlzdERlbGVnYXRlPElXb3Jrc3BhY2VQaWNrZXJJdGVtPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uU2VsZWN0OiAoaXRlbSkgPT4ge1xuXHRcdFx0XHRoaWRlKCk7XG5cdFx0XHRcdHZvaWQgdGhpcy5fZGlzcGF0Y2hQaWNrZXJJdGVtKGl0ZW0pO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0dHJpZ2dlckVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkTGlzdE9wdGlvbnMoaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJV29ya3NwYWNlUGlja2VySXRlbT5bXSwgcGlja2VyV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZCk6IElBY3Rpb25MaXN0T3B0aW9ucyB7XG5cdFx0Y29uc3Qgc2hvd0ZpbHRlciA9IGl0ZW1zLmZpbHRlcihpID0+IGkua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbikubGVuZ3RoID4gRklMVEVSX1RIUkVTSE9MRDtcblx0XHRyZXR1cm4gc2hvd0ZpbHRlclxuXHRcdFx0PyB7IHNob3dGaWx0ZXI6IHRydWUsIGZpbHRlclBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmZpbHRlcicsIFwiU2VhcmNoIFdvcmtzcGFjZXMuLi5cIiksIHJlc2VydmVTdWJtZW51U3BhY2U6IGZhbHNlLCBpbmxpbmVEZXNjcmlwdGlvbjogdHJ1ZSwgc2hvd0dyb3VwVGl0bGVPbkZpcnN0SXRlbTogdHJ1ZSwgbWluV2lkdGg6IHBpY2tlcldpZHRoLCBtYXhXaWR0aDogcGlja2VyV2lkdGgsIGhpZGVEZWZhdWx0S2V5YmluZGluZ1Rvb2x0aXA6IHRydWUgfVxuXHRcdFx0OiB7IHJlc2VydmVTdWJtZW51U3BhY2U6IGZhbHNlLCBpbmxpbmVEZXNjcmlwdGlvbjogdHJ1ZSwgc2hvd0dyb3VwVGl0bGVPbkZpcnN0SXRlbTogdHJ1ZSwgbWluV2lkdGg6IHBpY2tlcldpZHRoLCBtYXhXaWR0aDogcGlja2VyV2lkdGgsIGhpZGVEZWZhdWx0S2V5YmluZGluZ1Rvb2x0aXA6IHRydWUgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGbGF0IChuby10YWJzKSBwcmVzZW50YXRpb24uIERlbGVnYXRlcyByZW5kZXJpbmcgdG8gdGhlIHNoYXJlZFxuXHQgKiBgSUFjdGlvbldpZGdldFNlcnZpY2VgIHNvIHdlIGJlbmVmaXQgZnJvbSBpdHMga2V5YmluZGluZ3MsIGZvY3VzXG5cdCAqIHRyYWNraW5nIGFuZCBzdWJtZW51IGNocm9tZS5cblx0ICovXG5cdHByaXZhdGUgX3Nob3dGbGF0UGlja2VyKHRyaWdnZXJFbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIFRlYXIgZG93biBhbnkgcHJldmlvdXMgdGFiYmVkIHBvcHVwIGJlZm9yZSBkZWxlZ2F0aW5nIHRvIHRoZVxuXHRcdC8vIHNoYXJlZCBzZXJ2aWNlIFx1MjAxNCB0aGUgdHdvIHByZXNlbnRhdGlvbnMgZG9uJ3QgY28tZXhpc3QuXG5cdFx0dGhpcy5fdGFiYmVkV2lkZ2V0LmhpZGUoKTtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2J1aWxkSXRlbXMoKTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2J1aWxkRGVsZWdhdGUodHJpZ2dlckVsZW1lbnQsICgpID0+IHRoaXMuX2hpZGVQaWNrZXIoKSk7XG5cdFx0dHJpZ2dlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblxuXHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93PElXb3Jrc3BhY2VQaWNrZXJJdGVtPihcblx0XHRcdCd3b3Jrc3BhY2VQaWNrZXInLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRpdGVtcyxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0dHJpZ2dlckVsZW1lbnQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoaXRlbSkgPT4gaXRlbS5sYWJlbCA/PyAnJyxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmFyaWFMYWJlbCcsIFwiV29ya3NwYWNlIFBpY2tlclwiKSxcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9idWlsZExpc3RPcHRpb25zKGl0ZW1zLCB1bmRlZmluZWQpLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogVGFiYmVkIHByZXNlbnRhdGlvbi4gRGVsZWdhdGVzIHJlbmRlcmluZyBhbmQgbGlmZWN5Y2xlIHRvIHRoZVxuXHQgKiBwbGF0Zm9ybSBgVGFiYmVkQWN0aW9uTGlzdFdpZGdldGA7IHRoaXMgcGlja2VyIG9ubHkgb3ducyB0aGUgZGF0YVxuXHQgKiBhbmQgc2VsZWN0aW9uIGxvZ2ljLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvd1RhYmJlZFBpY2tlcih0YWJzOiByZWFkb25seSBJVGFiRGVzY3JpcHRvcltdLCB0cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBIaWRlIHRoZSBmbGF0IHBpY2tlciBpZiBpdCdzIHZpc2libGUgXHUyMDE0IHRoZSB0d28gcHJlc2VudGF0aW9uc1xuXHRcdC8vIGRvbid0IGNvLWV4aXN0LlxuXHRcdGlmICh0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGVnYXRlID0gdGhpcy5fYnVpbGREZWxlZ2F0ZSh0cmlnZ2VyRWxlbWVudCwgKCkgPT4gdGhpcy5faGlkZVBpY2tlcigpKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08SVdvcmtzcGFjZVBpY2tlckl0ZW0+KSA9PiBpdGVtLmxhYmVsID8/ICcnLFxuXHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLmFyaWFMYWJlbCcsIFwiV29ya3NwYWNlIFBpY2tlclwiKSxcblx0XHR9O1xuXG5cdFx0dHJpZ2dlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHR0aGlzLl9waWNrZXJHcm91cENvbnRleHQuc2V0KHRoaXMuX2FjdGl2ZVRhYiA/PyB0YWJzWzBdLmlkKTtcblx0XHR0aGlzLl90YWJiZWRXaWRnZXQuc2hvdzxJV29ya3NwYWNlUGlja2VySXRlbT4oe1xuXHRcdFx0dXNlcjogJ3dvcmtzcGFjZVBpY2tlcicsXG5cdFx0XHRhbmNob3I6IHRyaWdnZXJFbGVtZW50LFxuXHRcdFx0dGFicyxcblx0XHRcdGluaXRpYWxUYWI6IHRoaXMuX2FjdGl2ZVRhYiA/PyB0YWJzWzBdLmlkLFxuXHRcdFx0Y3JlYXRlQWN0aW9uTGlzdDogKHRhYikgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVUYWIgPSB0YWI7XG5cdFx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fYnVpbGRJdGVtcygpO1xuXHRcdFx0XHRyZXR1cm4geyBpdGVtcywgbGlzdE9wdGlvbnM6IHsgaW5saW5lRGVzY3JpcHRpb246IHRydWUsIHNob3dHcm91cFRpdGxlT25GaXJzdEl0ZW06IHRydWUsIGhpZGVEZWZhdWx0S2V5YmluZGluZ1Rvb2x0aXA6IHRydWUgfSB9O1xuXHRcdFx0fSxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyLFxuXHRcdFx0d2lkdGg6IFRBQkJFRF9QSUNLRVJfV0lEVEgsXG5cdFx0XHR0YWJCYXJDbGFzc05hbWU6ICdzZXNzaW9ucy13b3Jrc3BhY2UtcGlja2VyLXRhYmJhcicsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcGF0Y2ggbG9naWMgZm9yIGEgcGlja2VyIGl0ZW0gb25jZSB0aGUgdXNlciBwaWNrcyBpdC4gU2hhcmVkXG5cdCAqIGJldHdlZW4gdGhlIGRlc2t0b3AgYWN0aW9uLXdpZGdldCBkZWxlZ2F0ZSBhbmQgYW55IG1vYmlsZSBzaGVldFxuXHQgKiBzdWJjbGFzcyB0aGF0IG9wdHMgdG8gcmVuZGVyIGEgZGlmZmVyZW50IFVJIGJ1dCByZXVzZSB0aGVcblx0ICogc2VsZWN0aW9uIHNlbWFudGljcy4gVHJlYXRzIHVuYXZhaWxhYmxlIHdvcmtzcGFjZXMgYXMgYSBuby1vcC5cblx0ICovXG5cdHByb3RlY3RlZCBhc3luYyBfZGlzcGF0Y2hQaWNrZXJJdGVtKGl0ZW06IElXb3Jrc3BhY2VQaWNrZXJJdGVtKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrdGhpcy5fc2VsZWN0aW9uR2VuZXJhdGlvbjtcblx0XHR0aGlzLl9yZXBvcnRQaWNrZXJDbG9zZWQoaXRlbSk7XG5cdFx0aWYgKGl0ZW0ucnVuKSB7XG5cdFx0XHRpdGVtLnJ1bigpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIGlmIChpdGVtLmNvbW1hbmRJZCkge1xuXHRcdFx0dm9pZCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGl0ZW0uY29tbWFuZElkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoaXRlbS5mb2xkZXJVcmkgJiYgaXRlbS5wcm92aWRlcklkICYmIHRoaXMuX2lzUHJvdmlkZXJVbmF2YWlsYWJsZShpdGVtLnByb3ZpZGVySWQpKSB7XG5cdFx0XHQvLyBXb3Jrc3BhY2UgYmVsb25ncyB0byBhbiB1bmF2YWlsYWJsZSByZW1vdGUgXHUyMDE0IGlnbm9yZSBzZWxlY3Rpb25cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0uYnJvd3NlQWN0aW9uSW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgdGhpcy5fZXhlY3V0ZUJyb3dzZUFjdGlvbihpdGVtLmJyb3dzZUFjdGlvbkluZGV4KTtcblx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHNlbGVjdGlvbj8ud29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0XHRpZiAoIWZvbGRlclVyaSB8fCBnZW5lcmF0aW9uICE9PSB0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghYXdhaXQgdGhpcy5fY2FuU2VsZWN0V29ya3NwYWNlKGZvbGRlclVyaSwgc2VsZWN0aW9uLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlbGVjdEZvbGRlcihmb2xkZXJVcmksIHRydWUsIHNlbGVjdGlvbi5wcm92aWRlcklkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoaXRlbS5mb2xkZXJVcmkpIHtcblx0XHRcdGlmIChpdGVtLnByb3ZpZGVySWQgJiYgIWF3YWl0IHRoaXMuX2Nvbm5lY3RQcm92aWRlck9uRGVtYW5kKGl0ZW0ucHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX3NlbGVjdGlvbkdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9jYW5TZWxlY3RXb3Jrc3BhY2UoaXRlbS5mb2xkZXJVcmksIGl0ZW0ucHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX3NlbGVjdGlvbkdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2VsZWN0Rm9sZGVyKGl0ZW0uZm9sZGVyVXJpLCB0cnVlLCBpdGVtLnByb3ZpZGVySWQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbWl0cyBgbmV3Q2hhdFBpY2tlckNsb3NlZGAgdGVsZW1ldHJ5IG9uIHVzZXIgc2VsZWN0aW9uLiBUaGVcblx0ICogXCJiZWZvcmVcIiB2YWx1ZSBpcyByZWFkIGZyb20gc3RvcmFnZSAodGhlIGN1cnJlbnRseS1jaGVja2VkIHJlY2VudFxuXHQgKiB3b3Jrc3BhY2UpIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZyb20gdGhlIGluLW1lbW9yeSBzZWxlY3Rpb24uXG5cdCAqIFRoZSBcImFmdGVyXCIgdmFsdWUgY29tZXMgZnJvbSB0aGUgaXRlbSB0aGUgdXNlciBwaWNrZWQgXHUyMDE0IHVuZGVmaW5lZFxuXHQgKiB3aGVuIHRoZSBpdGVtIGlzIGEgYnJvd3NlIGFjdGlvbiBvciBjb21tYW5kIHJhdGhlciB0aGFuIGEgd29ya3NwYWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVwb3J0UGlja2VyQ2xvc2VkKGl0ZW06IElXb3Jrc3BhY2VQaWNrZXJJdGVtKTogdm9pZCB7XG5cdFx0Y29uc3QgYmVmb3JlRnJvbVN0b3JhZ2UgPSB0aGlzLl9yZXN0b3JlQ2hlY2tlZFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IGJlZm9yZSA9IGJlZm9yZUZyb21TdG9yYWdlID8/IHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQ7XG5cdFx0Y29uc3QgYWZ0ZXJVcmkgPSBpdGVtLmZvbGRlclVyaTtcblx0XHRjb25zdCBhZnRlclJlc29sdmVkID0gYWZ0ZXJVcmkgPyB0aGlzLl9yZXNvbHZlRm9sZGVyKGFmdGVyVXJpKSA6IHVuZGVmaW5lZDtcblx0XHRyZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkKHRoaXMudGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0aWQ6ICdOZXdDaGF0V29ya3NwYWNlUGlja2VyJyxcblx0XHRcdG5hbWU6ICdOZXdDaGF0V29ya3NwYWNlUGlja2VyJyxcblx0XHRcdG9wdGlvbklkQmVmb3JlOiBiZWZvcmU/LndvcmtzcGFjZT8udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRvcHRpb25JZEFmdGVyOiBhZnRlclJlc29sdmVkPy53b3Jrc3BhY2U/LnVyaS50b1N0cmluZygpLFxuXHRcdFx0b3B0aW9uTGFiZWxCZWZvcmU6IGJlZm9yZT8ud29ya3NwYWNlPy5sYWJlbCxcblx0XHRcdG9wdGlvbkxhYmVsQWZ0ZXI6IGFmdGVyUmVzb2x2ZWQ/LndvcmtzcGFjZT8ubGFiZWwsXG5cdFx0XHRpc1BJSTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9ncmFtbWF0aWNhbGx5IHNldCB0aGUgc2VsZWN0ZWQgd29ya3NwYWNlIGJ5IGZvbGRlciBVUkkuXG5cdCAqIEBwYXJhbSBmb2xkZXJVcmkgVGhlIGZvbGRlciBVUkkgdG8gc2VsZWN0LlxuXHQgKiBAcGFyYW0gb3B0aW9ucy5maXJlRXZlbnQgV2hldGhlciB0byBmaXJlIHRoZSBvbkRpZFNlbGVjdFdvcmtzcGFjZSBldmVudC4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICogQHBhcmFtIG9wdGlvbnMucHJvdmlkZXJJZCBPcHRpb25hbCBwcm92aWRlcklkIGhpbnQgdGhhdCB3aW5zIG92ZXIgYW55IGhpc3RvcmljYWxcblx0ICogICAgICAgIHJlY2VudCBlbnRyeSdzIHByb3ZpZGVyLiBVc2Ugd2hlbiB0aGUgY2FsbGVyIGtub3dzIHdoaWNoIHByb3ZpZGVyIHNob3VsZFxuXHQgKiAgICAgICAgb3duIHRoZSByZXN1bHRpbmcgc2Vzc2lvbiAoZS5nLiBcIk5ldyBTZXNzaW9uXCIgaW52b2tlZCBmcm9tIGEgd29ya3NwYWNlXG5cdCAqICAgICAgICBzZWN0aW9uIGluIHRoZSBzZXNzaW9ucyBsaXN0LCB3aGVyZSB0aGUgZXhpc3Rpbmcgc2Vzc2lvbnMgZm9yIHRoZVxuXHQgKiAgICAgICAgd29ya3NwYWNlIHdlcmUgY3JlYXRlZCBieSBhIHNwZWNpZmljIHByb3ZpZGVyKS5cblx0ICogQHBhcmFtIG9wdGlvbnMucGVyc2lzdCBXaGV0aGVyIHRvIHBlcnNpc3QgdGhlIHNlbGVjdGlvbiBhcyBhIHJlY2VudCB3b3Jrc3BhY2UuIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzZXRTZWxlY3RlZFdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSwgb3B0aW9ucz86IHsgZmlyZUV2ZW50PzogYm9vbGVhbjsgcHJvdmlkZXJJZD86IHN0cmluZzsgcGVyc2lzdD86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdEZvbGRlcihcblx0XHRcdGZvbGRlclVyaSxcblx0XHRcdG9wdGlvbnM/LmZpcmVFdmVudCA/PyB0cnVlLFxuXHRcdFx0b3B0aW9ucz8ucHJvdmlkZXJJZCxcblx0XHRcdG9wdGlvbnM/LnBlcnNpc3QgPz8gdHJ1ZSxcblx0XHRcdE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuUHJvdmlkZWRXb3Jrc3BhY2UsXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlcyB3aGljaGV2ZXIgcG9wdXAgdmFyaWFudCBpcyBjdXJyZW50bHkgdmlzaWJsZSBcdTIwMTQgdGhlIHNoYXJlZFxuXHQgKiBhY3Rpb24td2lkZ2V0LXNlcnZpY2UgZmxhdCBwaWNrZXIgb3Igb3VyIG93biBjb250ZXh0LXZpZXctZHJpdmVuXG5cdCAqIHRhYmJlZCBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9oaWRlUGlja2VyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RhYmJlZFdpZGdldC5oaWRlKCk7XG5cdFx0aWYgKHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgc2VsZWN0ZWQgcHJvamVjdC5cblx0ICovXG5cdGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbkdlbmVyYXRpb24rKztcblx0XHR0aGlzLl9oaWRlUGlja2VyKCk7XG5cdFx0dGhpcy5fdXNlckhhc1BpY2tlZCA9IHRydWU7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXR1c1dhdGNoLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2VsZWN0ZWRSZXNvbHZlZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wcmVzZWxlY3Rpb25Tb3VyY2UgPSBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlLk5vbmU7XG5cdFx0aWYgKHRoaXMuX3Nob3VsZFBlcnNpc3RTZWxlY3Rpb24oKSkge1xuXHRcdFx0dGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5jbGVhckNoZWNrZWRXb3Jrc3BhY2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgc2VsZWN0aW9uIGlmIGl0IG1hdGNoZXMgdGhlIGdpdmVuIFVSSS5cblx0ICovXG5cdHJlbW92ZUZyb21SZWNlbnRzKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpLCB1cmkpKSB7XG5cdFx0XHR0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0Rm9sZGVyKFxuXHRcdGZvbGRlclVyaTogVVJJLFxuXHRcdGZpcmVFdmVudCA9IHRydWUsXG5cdFx0cHJvdmlkZXJJZEhpbnQ/OiBzdHJpbmcsXG5cdFx0cGVyc2lzdCA9IHRydWUsXG5cdFx0c291cmNlID0gTmV3U2Vzc2lvbldvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZS5Vc2VyLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fdXNlckhhc1BpY2tlZCA9IHRydWU7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXR1c1dhdGNoLmNsZWFyKCk7XG5cdFx0Ly8gUHJlZmVyIHRoZSBjYWxsZXItc3VwcGxpZWQgcHJvdmlkZXJJZCBoaW50LCB0aGVuIHRoZSBoaXN0b3JpY2FsXG5cdFx0Ly8gcHJvdmlkZXJJZCBzdG9yZWQgaW4gdGhlIHJlY2VudHMgZm9yIHRoaXMgVVJJLCBzbyByZS1waWNraW5nIGFcblx0XHQvLyBMb2NhbCBBZ2VudCBIb3N0IGZvbGRlciByZXN0b3JlcyB0aGUgTG9jYWwgQWdlbnQgSG9zdCBhc3NvY2lhdGlvblxuXHRcdC8vIGV2ZW4gd2hlbiBhbm90aGVyIHByb3ZpZGVyIGFsc28gcmVzb2x2ZXMgdGhlIFVSSS5cblx0XHRjb25zdCBzdG9yZWRQcm92aWRlcklkID0gdGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKClcblx0XHRcdC5maW5kKHIgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoci53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdCwgZm9sZGVyVXJpKSlcblx0XHRcdD8ucHJvdmlkZXJJZDtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVGb2xkZXIoZm9sZGVyVXJpLCBwcm92aWRlcklkSGludCA/PyBzdG9yZWRQcm92aWRlcklkKTtcblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IGZvbGRlclVyaTtcblx0XHR0aGlzLl9zZWxlY3RlZFJlc29sdmVkID0gcmVzb2x2ZWQ7XG5cdFx0dGhpcy5fcHJlc2VsZWN0aW9uU291cmNlID0gc291cmNlO1xuXHRcdGlmIChwZXJzaXN0ICYmIHRoaXMuX3Nob3VsZFBlcnNpc3RTZWxlY3Rpb24oKSkge1xuXHRcdFx0dGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5hZGRSZWNlbnRXb3Jrc3BhY2UoZm9sZGVyVXJpLCByZXNvbHZlZD8ucHJvdmlkZXJJZCwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoKTtcblx0XHRpZiAoZmlyZUV2ZW50KSB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFdvcmtzcGFjZS5maXJlKGZvbGRlclVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9zaG91bGRQZXJzaXN0U2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGx5IGEgcmVzdG9yZWQgc2VsZWN0aW9uIHdpdGhvdXQgZmlyaW5nIGV2ZW50cyBvciBwZXJzaXN0aW5nLiBVc2VkXG5cdCAqIGR1cmluZyBjb25zdHJ1Y3Rpb24gYW5kIGFmdGVyIHByb3ZpZGVyIGxpc3QgY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U2VsZWN0aW9uKHJlc29sdmVkOiBJUmVzb2x2ZWRGb2xkZXJXb3Jrc3BhY2UgfCB1bmRlZmluZWQsIHNvdXJjZSA9IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuTm9uZSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSByZXNvbHZlZDtcblx0XHR0aGlzLl9zZWxlY3RlZEZvbGRlclVyaSA9IHJlc29sdmVkPy53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0XHR0aGlzLl9wcmVzZWxlY3Rpb25Tb3VyY2UgPSByZXNvbHZlZCA/IHNvdXJjZSA6IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuTm9uZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJdGVyYXRlIHByb3ZpZGVycyBhbmQgcmV0dXJuIHRoZSBmaXJzdCByZXNvbHV0aW9uIG9mIHRoZSBmb2xkZXIgVVJJLlxuXHQgKiBXaGVuIGBwcmVmZXJyZWRQcm92aWRlcklkYCBpcyBnaXZlbiwgdGhhdCBwcm92aWRlciBpcyB0cmllZCBmaXJzdCBzbyBhXG5cdCAqIHVzZXIncyBoaXN0b3JpY2FsIHBpY2sgc3Vydml2ZXMgcHJvdmlkZXIgaXRlcmF0aW9uIG9yZGVyIGNoYW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlRm9sZGVyKGZvbGRlclVyaTogVVJJLCBwcmVmZXJyZWRQcm92aWRlcklkPzogc3RyaW5nKTogSVJlc29sdmVkRm9sZGVyV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocHJlZmVycmVkUHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocHJlZmVycmVkUHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcmVmZXJyZWQ/LnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJJZDogcHJlZmVycmVkUHJvdmlkZXJJZCwgd29ya3NwYWNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIHdvcmtzcGFjZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4ZWN1dGVzIGEgYnJvd3NlIGFjdGlvbiBmcm9tIGEgcHJvdmlkZXIsIGlkZW50aWZpZWQgYnkgaW5kZXguXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlQnJvd3NlQWN0aW9uKGFjdGlvbkluZGV4OiBudW1iZXIpOiBQcm9taXNlPElCcm93c2VkV29ya3NwYWNlU2VsZWN0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWxsQWN0aW9ucyA9IHRoaXMuX2dldEFsbEJyb3dzZUFjdGlvbnMoKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhbGxBY3Rpb25zW2FjdGlvbkluZGV4XTtcblx0XHRpZiAoIWFjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKGFjdGlvbiA9PT0gdGhpcy5fbG9jYWxCcm93c2VBY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2Jyb3dzZUZvckxvY2FsRm9sZGVyKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlID8geyB3b3Jrc3BhY2UsIHByb3ZpZGVySWQ6IGFjdGlvbi5wcm92aWRlcklkIH0gOiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBicm93c2UgYWN0aW9uIHdhcyBjYW5jZWxsZWQgb3IgZmFpbGVkXG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYW5TZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkksIHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiAhdGhpcy5vcHRpb25zLmNhblNlbGVjdFdvcmtzcGFjZVxuXHRcdFx0fHwgYXdhaXQgdGhpcy5vcHRpb25zLmNhblNlbGVjdFdvcmtzcGFjZShmb2xkZXJVcmksIHByb3ZpZGVySWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbGxlY3RzIGJyb3dzZSBhY3Rpb25zIGZyb20gYWxsIHJlZ2lzdGVyZWQgcHJvdmlkZXJzLCBzY29wZWQgdG8gdGhlXG5cdCAqIGN1cnJlbnRseSBhY3RpdmUgdGFiIHdoZW4gdGFicyBhcmUgc2hvd24uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2dldEFsbEJyb3dzZUFjdGlvbnMoKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb25bXSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCk7XG5cdFx0Y29uc3QgY2F0YWxvZyA9IGJ1aWxkU2Vzc2lvbldvcmtzcGFjZVBpY2tlckNhdGFsb2coe1xuXHRcdFx0cHJvdmlkZXJzLFxuXHRcdFx0bG9jYWxCcm93c2VBY3Rpb246IHByb3ZpZGVycy5zb21lKHByb3ZpZGVyID0+IHByb3ZpZGVyLnN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzKSA/IHRoaXMuX2xvY2FsQnJvd3NlQWN0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVtb3RlQWdlbnRIb3N0c0VuYWJsZWQ6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpLFxuXHRcdFx0YWN0aXZlR3JvdXA6IHRoaXMuX2lzVGFiRmlsdGVyZWQoKSA/IHRoaXMuX2FjdGl2ZVRhYiA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRyZXR1cm4gWy4uLmNhdGFsb2cuYnJvd3NlQWN0aW9uc107XG5cdH1cblxuXHQvKipcblx0ICogT3BlbnMgYSBmb2xkZXIgcGlja2VyIGRpYWxvZyBhbmQgcmV0dXJucyB0aGUgY2hvc2VuIFVSSS4gVGhlIGZvbGRlcidzXG5cdCAqIHByb3ZpZGVyIGlzIHJlZGlzY292ZXJlZCBsYXRlciBieSB0aGUgbWFuYWdlbWVudCBzZXJ2aWNlIHdoZW4gdGhlXG5cdCAqIHNlc3Npb24gaXMgY3JlYXRlZCBcdTIwMTQgbm8gcHJvdmlkZXIgcXVpY2stcGljayBpcyBuZWVkZWQgaGVyZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Jyb3dzZUZvckxvY2FsRm9sZGVyKCk6IFByb21pc2U8SUJyb3dzZWRXb3Jrc3BhY2VTZWxlY3Rpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBsb2NhbFByb3ZpZGVycyA9IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpLmZpbHRlcihwID0+IHAuc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXMpO1xuXHRcdGlmIChsb2NhbFByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0aWYgKCFyZXN1bHQ/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHRocm91Z2ggYW55IGxvY2FsIHByb3ZpZGVyIHNvIHRoZSByZXR1cm5lZCBJU2Vzc2lvbldvcmtzcGFjZVxuXHRcdC8vIGNhcnJpZXMgYSBsYWJlbC9pY29uIGZvciB0aGUgYnJvd3NlLWFjdGlvbiBoYW5kc2hha2U7IHRoZSBhY3R1YWxcblx0XHQvLyBwcm92aWRlciB1c2VkIHRvIGNyZWF0ZSB0aGUgc2Vzc2lvbiBpcyByZWRpc2NvdmVyZWQgYXQgY3JlYXRpb24gdGltZS5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGxvY2FsUHJvdmlkZXJzKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKHJlc3VsdFswXSk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB7IHdvcmtzcGFjZSwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBUcnVlIHdoZW4gdGhlIHBpY2tlciBpcyBjdXJyZW50bHkgc2NvcGVkIHRvIGEgc2luZ2xlIHRhYi4gKi9cblx0cHJvdGVjdGVkIF9pc1RhYkZpbHRlcmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zaG93VGFicygpICYmICEhdGhpcy5fYWN0aXZlVGFiICYmIHRoaXMuX2dldEF2YWlsYWJsZVRhYnMoKS5sZW5ndGggPiAxO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgcGlja2VyIGl0ZW1zIGxpc3QgZnJvbSByZWNlbnQgd29ya3NwYWNlcy5cblx0ICpcblx0ICogSXRlbXMgYXJlIHNob3duIGluIGEgZmxhdCByZWNlbmN5LXNvcnRlZCBsaXN0IChtb3N0IHJlY2VudGx5IHVzZWQgZmlyc3QpXG5cdCAqIHdpdGhvdXQgc291cmNlIGdyb3VwaW5nLiBPd24gcmVjZW50cyBjb21lIGZpcnN0LCBmb2xsb3dlZCBieSBWUyBDb2RlXG5cdCAqIHJlY2VudCBmb2xkZXJzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9idWlsZEl0ZW1zKCk6IElBY3Rpb25MaXN0SXRlbTxJV29ya3NwYWNlUGlja2VySXRlbT5bXSB7XG5cdFx0Y29uc3QgaXRlbXM6IElBY3Rpb25MaXN0SXRlbTxJV29ya3NwYWNlUGlja2VySXRlbT5bXSA9IFtdO1xuXG5cdFx0Ly8gQ29sbGVjdCByZWNlbnQgd29ya3NwYWNlcyBmcm9tIHBpY2tlciBzdG9yYWdlIGFjcm9zcyBhbGwgcHJvdmlkZXJzXG5cdFx0Y29uc3QgYWxsUHJvdmlkZXJzID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlVGFicyA9IHRoaXMuX2dldEF2YWlsYWJsZVRhYnMoKTtcblx0XHRjb25zdCBhY3RpdmVHcm91cCA9IHRoaXMuX2FjdGl2ZVRhYiA/PyAoYXZhaWxhYmxlVGFicy5sZW5ndGggPT09IDEgPyBhdmFpbGFibGVUYWJzWzBdLmlkIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VHcm91cEFjdGlvbiA9IHRoaXMub3B0aW9ucy5nZXRXb3Jrc3BhY2VHcm91cEFjdGlvbj8uKGFjdGl2ZUdyb3VwKTtcblx0XHRjb25zdCBjYXRhbG9nID0gYnVpbGRTZXNzaW9uV29ya3NwYWNlUGlja2VyQ2F0YWxvZyh7XG5cdFx0XHRwcm92aWRlcnM6IGFsbFByb3ZpZGVycyxcblx0XHRcdHJlY2VudFdvcmtzcGFjZXM6IHRoaXMuX2dldFJlY2VudFdvcmtzcGFjZXMoKSxcblx0XHRcdGxvY2FsQnJvd3NlQWN0aW9uOiBhbGxQcm92aWRlcnMuc29tZShwcm92aWRlciA9PiBwcm92aWRlci5zdXBwb3J0c0xvY2FsV29ya3NwYWNlcykgPyB0aGlzLl9sb2NhbEJyb3dzZUFjdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHJlbW90ZUFnZW50SG9zdHNFbmFibGVkOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSxcblx0XHRcdGFjdGl2ZUdyb3VwOiB0aGlzLl9pc1RhYkZpbHRlcmVkKCkgPyB0aGlzLl9hY3RpdmVUYWIgOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVjZW50V29ya3NwYWNlcyA9IHdvcmtzcGFjZUdyb3VwQWN0aW9uPy5oaWRlV29ya3NwYWNlSXRlbXNcblx0XHRcdD8gW11cblx0XHRcdDogY2F0YWxvZy53b3Jrc3BhY2VzO1xuXG5cdFx0Ly8gQnVpbGQgZmxhdCBsaXN0IGluIHJlY2VuY3kgb3JkZXIgKG5vIHNvdXJjZSBncm91cGluZylcblx0XHRmb3IgKGNvbnN0IHsgd29ya3NwYWNlLCBwcm92aWRlcklkIH0gb2YgcmVjZW50V29ya3NwYWNlcykge1xuXHRcdFx0Y29uc3QgZm9sZGVyVXJpID0gd29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0XHRpZiAoIWZvbGRlclVyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5faXNTZWxlY3RlZEZvbGRlcihmb2xkZXJVcmkpO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiB3b3Jrc3BhY2UubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB3b3Jrc3BhY2UuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogd29ya3NwYWNlLmljb24gfSxcblx0XHRcdFx0ZGlzYWJsZWQ6IHRoaXMuX2lzUHJvdmlkZXJVbmF2YWlsYWJsZShwcm92aWRlcklkKSxcblx0XHRcdFx0aXRlbTogeyBmb2xkZXJVcmksIHByb3ZpZGVySWQsIGNoZWNrZWQ6IHNlbGVjdGVkIHx8IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRvblJlbW92ZTogKCkgPT4gdGhpcy5fcmVtb3ZlUmVjZW50V29ya3NwYWNlKGZvbGRlclVyaSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBCcm93c2UgYWN0aW9ucyBmcm9tIGFsbCBwcm92aWRlcnMgKGZpbHRlcmVkIHRvIHRoZSBhY3RpdmUgdGFiKVxuXHRcdGNvbnN0IGFsbEJyb3dzZUFjdGlvbnMgPSB3b3Jrc3BhY2VHcm91cEFjdGlvbj8uaGlkZVdvcmtzcGFjZUl0ZW1zID8gW10gOiBjYXRhbG9nLmJyb3dzZUFjdGlvbnM7XG5cdFx0Ly8gUmVtb3RlIHByb3ZpZGVycyB3aXRoIGNvbm5lY3Rpb24gc3RhdHVzIFx1MjAxNCBzaG93biBhcyBkeW5hbWljIHJvd3Ncblx0XHQvLyBpbiB0aGUgTWFuYWdlIHN1Ym1lbnUgb24gdGhlIFJlbW90ZSB0YWIuXG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXJzID0gYWxsUHJvdmlkZXJzLmZpbHRlcihpc0FnZW50SG9zdFByb3ZpZGVyKS5maWx0ZXIocCA9PiBwLmNvbm5lY3Rpb25TdGF0dXMgIT09IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaW5jbHVkZVJlbW90ZVByb3ZpZGVycyA9IHRoaXMuX2FjdGl2ZVRhYiA9PT0gU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFO1xuXG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDAgJiYgKHdvcmtzcGFjZUdyb3VwQWN0aW9uIHx8IGFsbEJyb3dzZUFjdGlvbnMubGVuZ3RoID4gMCkpIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmtzcGFjZUdyb3VwQWN0aW9uKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0bGFiZWw6IHdvcmtzcGFjZUdyb3VwQWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogd29ya3NwYWNlR3JvdXBBY3Rpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogd29ya3NwYWNlR3JvdXBBY3Rpb24uaWNvbiB9LFxuXHRcdFx0XHRpdGVtOiB7IGNvbW1hbmRJZDogd29ya3NwYWNlR3JvdXBBY3Rpb24uY29tbWFuZElkIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSZW5kZXIgZWFjaCBicm93c2UgYWN0aW9uIGluZGl2aWR1YWxseS4gV2l0aGluIGEgdGFiLCBhY3Rpb25zIGFyZVxuXHRcdC8vIGFscmVhZHkgY29uc3RyYWluZWQgdG8gYSBzaW5nbGUgY2F0ZWdvcnksIHNvIGNyb3NzLXByb3ZpZGVyXG5cdFx0Ly8gbWVyZ2luZyBpcyBubyBsb25nZXIgbWVhbmluZ2Z1bC5cblx0XHRhbGxCcm93c2VBY3Rpb25zLmZvckVhY2goKGFjdGlvbiwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gYWxsUHJvdmlkZXJzLmZpbmQocCA9PiBwLmlkID09PSBhY3Rpb24ucHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBhZ2VudEhvc3RQcm92aWRlciA9IHByb3ZpZGVyICYmIGlzQWdlbnRIb3N0UHJvdmlkZXIocHJvdmlkZXIpID8gcHJvdmlkZXIgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uU3RhdHVzID0gYWdlbnRIb3N0UHJvdmlkZXI/LmNvbm5lY3Rpb25TdGF0dXM/LmdldCgpO1xuXHRcdFx0Ly8gYGluY29tcGF0aWJsZWAgYWx3YXlzIGRpc2FibGVzIHRoZSBhY3Rpb24gXHUyMDE0IHRoZSB1c2VyIGNhbid0IGZpeFxuXHRcdFx0Ly8gYSBwcm90b2NvbCBtaXNtYXRjaCBieSBjbGlja2luZy4gT3RoZXJ3aXNlLCBpZiB0aGUgcHJvdmlkZXJcblx0XHRcdC8vIHN1cHBvcnRzIGNvbm5lY3Qtb24tZGVtYW5kIChlLmcuIFdTTCBib290cyB0aGUgZGlzdHJvIG9uIGZpcnN0XG5cdFx0XHQvLyBicm93c2UpLCBrZWVwIHRoZSBhY3Rpb24gbGl2ZSBldmVuIHdoaWxlIGRpc2Nvbm5lY3RlZC5cblx0XHRcdGNvbnN0IGlzSW5jb21wYXRpYmxlID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShjb25uZWN0aW9uU3RhdHVzKTtcblx0XHRcdGNvbnN0IGlzVW5hdmFpbGFibGUgPSBpc0luY29tcGF0aWJsZVxuXHRcdFx0XHR8fCAoISFjb25uZWN0aW9uU3RhdHVzXG5cdFx0XHRcdFx0JiYgIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoY29ubmVjdGlvblN0YXR1cylcblx0XHRcdFx0XHQmJiAhYWdlbnRIb3N0UHJvdmlkZXI/LmNhbkNvbm5lY3RPbkRlbWFuZCk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuYnJvd3NlU2VsZWN0QWN0aW9uJywgXCJTZWxlY3QuLi5cIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBhY3Rpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogYWN0aW9uLmljb24gfSxcblx0XHRcdFx0ZGlzYWJsZWQ6IGlzVW5hdmFpbGFibGUsXG5cdFx0XHRcdGl0ZW06IHsgYnJvd3NlQWN0aW9uSW5kZXg6IGluZGV4IH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIElubGluZSBcIk1hbmFnZVwiIGVudHJpZXM6IGR5bmFtaWMgcmVtb3RlIHByb3ZpZGVyIHJvd3MgKHNjb3BlZCB0b1xuXHRcdC8vIHRoZSBSZW1vdGUgdGFiKSArIG1lbnUtY29udHJpYnV0ZWQgYWN0aW9ucyAoZmlsdGVyZWQgYnkgdGhlXG5cdFx0Ly8gYHNlc3Npb25Xb3Jrc3BhY2VQaWNrZXJHcm91cGAgY29udGV4dCBrZXkpLlxuXHRcdGNvbnN0IG1hbmFnZUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChpbmNsdWRlUmVtb3RlUHJvdmlkZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHJlbW90ZVByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSBwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzIS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgaXNUdW5uZWwgPSBwcm92aWRlci5yZW1vdGVBZGRyZXNzPy5zdGFydHNXaXRoKFRVTk5FTF9BRERSRVNTX1BSRUZJWCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogYHdvcmtzcGFjZVBpY2tlci5yZW1vdGUuJHtwcm92aWRlci5pZH1gLFxuXHRcdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0XHR0b29sdGlwOiBnZXRTdGF0dXNMYWJlbChzdGF0dXMpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9oaWRlUGlja2VyKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zaG93UmVtb3RlSG9zdE9wdGlvbnNEZWxheWVkKHByb3ZpZGVyKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5kZWQgPSBhY3Rpb24gYXMgSVdvcmtzcGFjZVBpY2tlckFjdGlvbjtcblx0XHRcdFx0ZXh0ZW5kZWQuaWNvbiA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoc3RhdHVzKVxuXHRcdFx0XHRcdD8gQ29kaWNvbi53YXJuaW5nXG5cdFx0XHRcdFx0OiAoaXNUdW5uZWwgPyBDb2RpY29uLmNsb3VkIDogQ29kaWNvbi5yZW1vdGUpO1xuXHRcdFx0XHRleHRlbmRlZC5ob3ZlckNvbnRlbnQgPSBnZXRTdGF0dXNIb3ZlcihzdGF0dXMsIHByb3ZpZGVyLnJlbW90ZUFkZHJlc3MpO1xuXHRcdFx0XHRpZiAocHJvdmlkZXIucmVtb3RlQWRkcmVzcykge1xuXHRcdFx0XHRcdGV4dGVuZGVkLm9uUmVtb3ZlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgcmVtb3ZlUmVtb3RlSG9zdChwcm92aWRlciwgdGhpcy5yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hbmFnZUFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51cy5TZXNzaW9uV29ya3NwYWNlTWFuYWdlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSk7XG5cdFx0Zm9yIChjb25zdCBbLCBhY3Rpb25zXSBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBtZW51QWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKG1lbnVBY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGljb24gPSBUaGVtZUljb24uaXNUaGVtZUljb24obWVudUFjdGlvbi5pdGVtLmljb24pID8gbWVudUFjdGlvbi5pdGVtLmljb24gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bWFuYWdlQWN0aW9ucy5wdXNoKE9iamVjdC5hc3NpZ24obWVudUFjdGlvbiwgeyBpY29uIH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtYW5hZ2VBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwICYmIGl0ZW1zW2l0ZW1zLmxlbmd0aCAtIDFdLmtpbmQgIT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiAnJyB9KTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIG1hbmFnZUFjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5kZWQgPSBhY3Rpb24gYXMgSVdvcmtzcGFjZVBpY2tlckFjdGlvbjtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBleHRlbmRlZC5vblJlbW92ZSA/IGFjdGlvbi50b29sdGlwIHx8IHVuZGVmaW5lZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IGV4dGVuZGVkLmljb24gPz8gQ29kaWNvbi5zZXR0aW5nc0dlYXIgfSxcblx0XHRcdFx0XHRpdGVtOiB7IHJ1bjogKCkgPT4gYWN0aW9uLnJ1bigpLCBjb21tYW5kSWQ6IGFjdGlvbi5pZCB9LFxuXHRcdFx0XHRcdG9uUmVtb3ZlOiBleHRlbmRlZC5vblJlbW92ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1JlbW90ZUhvc3RPcHRpb25zRGVsYXllZChwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIpOiB2b2lkIHtcblx0XHQvLyBEZWZlciBvbmUgdGljayBzbyB0aGUgYWN0aW9uIHdpZGdldCBmdWxseSB0ZWFycyBkb3duIChmb2N1cy9ET00gY2xlYW51cClcblx0XHQvLyBiZWZvcmUgdGhlIFF1aWNrUGljayBvcGVucyBhbmQgY2xhaW1zIGZvY3VzLlxuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gc2hvd1JlbW90ZUhvc3RPcHRpb25zKGFjY2Vzc29yLCBwcm92aWRlcikpO1xuXHRcdH0sIDEpO1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGNsZWFyVGltZW91dCh0aW1lb3V0KSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfdXBkYXRlVHJpZ2dlckxhYmVsKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdHJpZ2dlciBvZiB0aGlzLl90cmlnZ2VyRWxlbWVudHMpIHtcblx0XHRcdHRoaXMuX3JlbmRlclRyaWdnZXJMYWJlbCh0cmlnZ2VyKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlbmRlclRyaWdnZXJMYWJlbCh0cmlnZ2VyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodHJpZ2dlcik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5fc2VsZWN0ZWRSZXNvbHZlZD8ud29ya3NwYWNlO1xuXHRcdGNvbnN0IGxhYmVsID0gd29ya3NwYWNlID8gd29ya3NwYWNlLmxhYmVsIDogbG9jYWxpemUoJ3BpY2tXb3Jrc3BhY2UnLCBcIndvcmtzcGFjZVwiKTtcblx0XHRjb25zdCBpY29uID0gd29ya3NwYWNlID8gd29ya3NwYWNlLmljb24gOiBDb2RpY29uLnByb2plY3Q7XG5cblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHdvcmtzcGFjZVxuXHRcdFx0PyBsb2NhbGl6ZSgnd29ya3NwYWNlUGlja2VyLnNlbGVjdGVkQXJpYUxhYmVsJywgXCJOZXcgc2Vzc2lvbiBpbiB7MH1cIiwgbGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIucGlja0FyaWFMYWJlbCcsIFwiU3RhcnQgYnkgcGlja2luZyBhIHdvcmtzcGFjZVwiKSk7XG5cblx0XHRkb20uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24oaWNvbikpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodHJpZ2dlciwgZG9tLiQoJ3NwYW4uc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1sYWJlbCcpKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRkb20uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bkNvbXBhY3QpKS5jbGFzc0xpc3QuYWRkKCdzZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWNoZXZyb24nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIHByb3ZpZGVyIGlzIGEgcmVtb3RlIHRoYXQgaXMgY3VycmVudGx5IHVuYXZhaWxhYmxlXG5cdCAqIChpbmNvbXBhdGlibGUsIG9yIGRpc2Nvbm5lY3RlZC9zdGlsbCBjb25uZWN0aW5nIHdpdGhvdXQgb24tZGVtYW5kIGNvbm5lY3QpLlxuXHQgKiBSZXR1cm5zIGZhbHNlIGZvciBwcm92aWRlcnMgd2l0aG91dCBjb25uZWN0aW9uIHN0YXR1cyAoZS5nLiBsb2NhbCBwcm92aWRlcnMpLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pc1Byb3ZpZGVyVW5hdmFpbGFibGUocHJvdmlkZXJJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSB8fCAhcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uU3RhdHVzID0gcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cy5nZXQoKTtcblx0XHRyZXR1cm4gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShjb25uZWN0aW9uU3RhdHVzKVxuXHRcdFx0fHwgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGNvbm5lY3Rpb25TdGF0dXMpICYmICFwcm92aWRlci5jYW5Db25uZWN0T25EZW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29ubmVjdFByb3ZpZGVyT25EZW1hbmQocHJvdmlkZXJJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSB8fCAhcHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm5lY3Rpb25TdGF0dXMgPSBwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzLmdldCgpO1xuXHRcdGlmIChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGNvbm5lY3Rpb25TdGF0dXMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoY29ubmVjdGlvblN0YXR1cykgfHwgIXByb3ZpZGVyLmNhbkNvbm5lY3RPbkRlbWFuZCB8fCAhcHJvdmlkZXIuY29ubmVjdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsTWVzc2FnZSA9IGxvY2FsaXplKCd3b3Jrc3BhY2VQaWNrZXIuY29ubmVjdGluZ1JlbW90ZUFnZW50SG9zdCcsIFwiQ29ubmVjdGluZyB0byB7MH0uLi5cIiwgcHJvdmlkZXIubGFiZWwpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBpbml0aWFsTWVzc2FnZSxcblx0XHRcdHByb2dyZXNzOiB7IGluZmluaXRlOiB0cnVlIH0sXG5cdFx0fSk7XG5cdFx0c3RhdHVzKGluaXRpYWxNZXNzYWdlKTtcblx0XHRjb25zdCBwcm9ncmVzc0xpc3RlbmVyID0gcHJvdmlkZXIub25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3M/Lihwcm9ncmVzcyA9PiB7XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnJlbW90ZUFkZHJlc3MgfHwgcHJvZ3Jlc3MuY29ubmVjdGlvbktleSA9PT0gcHJvdmlkZXIucmVtb3RlQWRkcmVzcykge1xuXHRcdFx0XHRoYW5kbGUudXBkYXRlTWVzc2FnZShwcm9ncmVzcy5tZXNzYWdlKTtcblx0XHRcdFx0c3RhdHVzKHByb2dyZXNzLm1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGxldCBjb25uZWN0ZWQgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuY29ubmVjdCgpO1xuXHRcdFx0Y29ubmVjdGVkID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzLmdldCgpKTtcblx0XHR9IGNhdGNoIHtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJvZ3Jlc3NMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0aGFuZGxlLmNsb3NlKCk7XG5cdFx0fVxuXHRcdGlmIChjb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ3dvcmtzcGFjZVBpY2tlci5jb25uZWN0UmVtb3RlQWdlbnRIb3N0RmFpbGVkJywgXCJGYWlsZWQgdG8gY29ubmVjdCB0byB7MH0uXCIsIHByb3ZpZGVyLmxhYmVsKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobWVzc2FnZSk7XG5cdFx0c3RhdHVzKG1lc3NhZ2UpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfaXNTZWxlY3RlZEZvbGRlcihmb2xkZXJVcmk6IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgfHwgIWZvbGRlclVyaSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmksIGZvbGRlclVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlU2VsZWN0ZWRXb3Jrc3BhY2UoKTogSVJlc3RvcmVkV29ya3NwYWNlU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSBidWlsZFNlc3Npb25Xb3Jrc3BhY2VQaWNrZXJDYXRhbG9nKHtcblx0XHRcdFx0cHJvdmlkZXJzOiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSxcblx0XHRcdFx0cmVjZW50V29ya3NwYWNlczogdGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKCksXG5cdFx0XHRcdG93blJlY2VudFdvcmtzcGFjZXM6IHRoaXMucmVjZW50V29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50V29ya3NwYWNlcyhmYWxzZSksXG5cdFx0XHRcdHJlbW90ZUFnZW50SG9zdHNFbmFibGVkOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSxcblx0XHRcdFx0Y2FuVXNlUHJvdmlkZXI6IHByb3ZpZGVySWQgPT4gdGhpcy5fY2FuUmVzdG9yZVByb3ZpZGVyV29ya3NwYWNlKHByb3ZpZGVySWQpLFxuXHRcdFx0XHRpc1Byb3ZpZGVyVW5hdmFpbGFibGU6IHByb3ZpZGVySWQgPT4gdGhpcy5faXNQcm92aWRlclVuYXZhaWxhYmxlKHByb3ZpZGVySWQpLFxuXHRcdFx0fSkuZGVmYXVsdFdvcmtzcGFjZTtcblx0XHRcdHJldHVybiByZXN0b3JlZCA/IHtcblx0XHRcdFx0cmVzb2x2ZWQ6IHJlc3RvcmVkLFxuXHRcdFx0XHRzb3VyY2U6IHJlc3RvcmVkLmNoZWNrZWRcblx0XHRcdFx0XHQ/IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuQ2hlY2tlZFdvcmtzcGFjZVxuXHRcdFx0XHRcdDogTmV3U2Vzc2lvbldvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZS5SZWNlbnRXb3Jrc3BhY2UsXG5cdFx0XHR9IDogdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Jlc2V0QXV0b21hdGljU2VsZWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbkdlbmVyYXRpb24rKztcblx0XHR0aGlzLl9zZXNzaW9uUmVzdG9yZUdlbmVyYXRpb24rKztcblx0XHR0aGlzLl91c2VySGFzUGlja2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXR1c1dhdGNoLmNsZWFyKCk7XG5cdFx0dGhpcy5fYXBwbHlTZWxlY3Rpb24odW5kZWZpbmVkKTtcblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3Nlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjaz8ucmVmcmVzaFByb3ZpZGVycygpO1xuXHRcdHRoaXMuX3Jlc3RvcmVBdXRvbWF0aWNTZWxlY3Rpb24oKTtcblx0fVxuXG5cdC8qKiBSZS1ydW5zIGF1dG9tYXRpYyBzZWxlY3Rpb24gYW5kIHJlcG9ydHMgd2hldGhlciBpdCBjaGFuZ2VkIHN5bmNocm9ub3VzbHkuICovXG5cdHJlZnJlc2hBdXRvbWF0aWNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc3RvcmVBdXRvbWF0aWNTZWxlY3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVBdXRvbWF0aWNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3VzZXJIYXNQaWNrZWQgfHwgIXRoaXMuX2NhblJlc3RvcmVXb3Jrc3BhY2UoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCByZXN0b3JlZCA9IHRoaXMuX3Jlc3RvcmVTZWxlY3RlZFdvcmtzcGFjZSgpO1xuXHRcdGlmICghcmVzdG9yZWQpIHtcblx0XHRcdGlmICghdGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgfHwgdGhpcy5fcHJlc2VsZWN0aW9uU291cmNlID09PSBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlLkV4aXN0aW5nU2Vzc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVTZXNzaW9uV29ya3NwYWNlUmVzdG9yZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uUmVzdG9yZUdlbmVyYXRpb24rKztcblx0XHRpZiAodGhpcy5faXNTZWxlY3RlZEZvbGRlcihyZXN0b3JlZC5yZXNvbHZlZC53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdCkpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSByZXN0b3JlZC5yZXNvbHZlZDtcblx0XHRcdHRoaXMuX3ByZXNlbGVjdGlvblNvdXJjZSA9IHJlc3RvcmVkLnNvdXJjZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlTZWxlY3Rpb24ocmVzdG9yZWQucmVzb2x2ZWQsIHJlc3RvcmVkLnNvdXJjZSk7XG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXHRcdHRoaXMuX3dhdGNoRm9yQ29ubmVjdGlvbkZhaWx1cmUocmVzdG9yZWQucmVzb2x2ZWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVTZXNzaW9uV29ya3NwYWNlUmVzdG9yZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjayB8fCB0aGlzLl91c2VySGFzUGlja2VkIHx8ICF0aGlzLl9jYW5SZXN0b3JlV29ya3NwYWNlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdG9yZUdlbmVyYXRpb24gPSArK3RoaXMuX3Nlc3Npb25SZXN0b3JlR2VuZXJhdGlvbjtcblx0XHRjb25zdCBzZWxlY3Rpb25HZW5lcmF0aW9uID0gdGhpcy5fc2VsZWN0aW9uR2VuZXJhdGlvbjtcblx0XHR2b2lkIHRoaXMuX3Nlc3Npb25Xb3Jrc3BhY2VGYWxsYmFjay5maW5kV29ya3NwYWNlKCkudGhlbihyZXN0b3JlZCA9PiB7XG5cdFx0XHRpZiAocmVzdG9yZUdlbmVyYXRpb24gIT09IHRoaXMuX3Nlc3Npb25SZXN0b3JlR2VuZXJhdGlvblxuXHRcdFx0XHR8fCBzZWxlY3Rpb25HZW5lcmF0aW9uICE9PSB0aGlzLl9zZWxlY3Rpb25HZW5lcmF0aW9uXG5cdFx0XHRcdHx8IHRoaXMuX3VzZXJIYXNQaWNrZWRcblx0XHRcdFx0fHwgIXRoaXMuX2NhblJlc3RvcmVXb3Jrc3BhY2UoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fcmVzdG9yZVNlbGVjdGVkV29ya3NwYWNlKCkpIHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZUF1dG9tYXRpY1NlbGVjdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc3RvcmVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9wcmVzZWxlY3Rpb25Tb3VyY2UgPT09IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuRXhpc3RpbmdTZXNzaW9ucykge1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5U2VsZWN0aW9uKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSgpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0V29ya3NwYWNlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSByZXN0b3JlZC53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0XHRcdGlmICh0aGlzLl9pc1NlbGVjdGVkRm9sZGVyKGZvbGRlclVyaSkpIHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRSZXNvbHZlZCA9IHJlc3RvcmVkO1xuXHRcdFx0XHR0aGlzLl9wcmVzZWxlY3Rpb25Tb3VyY2UgPSBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlLkV4aXN0aW5nU2Vzc2lvbnM7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FwcGx5U2VsZWN0aW9uKHJlc3RvcmVkLCBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlLkV4aXN0aW5nU2Vzc2lvbnMpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFdvcmtzcGFjZS5maXJlKHRoaXMuX3NlbGVjdGVkRm9sZGVyVXJpKTtcblx0XHRcdHRoaXMuX3dhdGNoRm9yQ29ubmVjdGlvbkZhaWx1cmUocmVzdG9yZWQpO1xuXHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhblJlc3RvcmVQcm92aWRlcldvcmtzcGFjZShwcm92aWRlcklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMub3B0aW9ucy5zZXNzaW9uV29ya3NwYWNlUHJvdmlkZXJGaWx0ZXIgfHwgdGhpcy5vcHRpb25zLnNlc3Npb25Xb3Jrc3BhY2VQcm92aWRlckZpbHRlcihwcm92aWRlcklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhblJlc3RvcmVXb3Jrc3BhY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5jYW5SZXN0b3JlV29ya3NwYWNlPy4oKSA/PyB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RvcmUgb25seSB0aGUgY2hlY2tlZCAocHJldmlvdXNseSBzZWxlY3RlZCkgd29ya3NwYWNlIGlmIGFueVxuXHQgKiBwcm92aWRlciBjYW4gcmVzb2x2ZSBpdHMgVVJJLiBUaGUgcHJvdmlkZXIncyBjb25uZWN0aW9uIHN0YXR1cyBpc1xuXHQgKiBpbnRlbnRpb25hbGx5IE5PVCBjaGVja2VkIFx1MjAxNCB3ZSBob25vciB0aGUgdXNlcidzIGV4cGxpY2l0IHBpY2sgZXZlblxuXHQgKiBpZiB0aGUgcmVtb3RlIGlzIHN0aWxsIGNvbm5lY3Rpbmcgb3IgY3VycmVudGx5IGRpc2Nvbm5lY3RlZC4gVGhlXG5cdCAqIHRyaWdnZXIgbGFiZWwgcmVmbGVjdHMgdGhlIGNvbm5lY3Rpb24gc3RhdGUgc2VwYXJhdGVseVxuXHQgKiAoc3Bpbm5lciAvIGdyYXllZCkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXN0b3JlQ2hlY2tlZFdvcmtzcGFjZSgpOiBJUmVzb2x2ZWRGb2xkZXJXb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKGZhbHNlKS5maW5kKHJlY2VudCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlclVyaSA9IHJlY2VudC53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0XHRcdFx0cmV0dXJuIHJlY2VudC5jaGVja2VkICYmICEhZm9sZGVyVXJpICYmICFpc1dvcmt0cmVlV29ya3NwYWNlVXJpKGZvbGRlclVyaSk7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdoZW4gcmVzdG9yaW5nIGEgd29ya3NwYWNlIHdob3NlIHByb3ZpZGVyIGlzbid0IGN1cnJlbnRseSBDb25uZWN0ZWQsXG5cdCAqIHdhdGNoIHRoZSBjb25uZWN0aW9uIHN0YXR1cy4gRmlyZXMgYG9uRGlkU2VsZWN0V29ya3NwYWNlKHVuZGVmaW5lZClgXG5cdCAqICh3aGljaCB0aGUgdmlldyBwYW5lIGNvbnZlcnRzIHRvIGB1bnNldE5ld1Nlc3Npb24oKWApIGlmOlxuXHQgKiAgIC0gdGhlIHN0YXR1cyB0cmFuc2l0aW9ucyB0byBEaXNjb25uZWN0ZWQgYWZ0ZXIgd2Ugc3RhcnQgd2F0Y2hpbmcsIG9yXG5cdCAqICAgLSB0aGUgc3RhdHVzIGlzIHN0aWxsIG5vdCBDb25uZWN0ZWQgYWZ0ZXIgYSBzaG9ydCBncmFjZSBwZXJpb2QuXG5cdCAqXG5cdCAqIFRoZSBncmFjZSBwZXJpb2QgY292ZXJzIGEgcmFjZTogcHJvdmlkZXIgc3RhdGUgY2FuIHRyYW5zaXRpb24gc3luY2hyb25vdXNseVxuXHQgKiBpbnNpZGUgcHJvdmlkZXIgcmVnaXN0cmF0aW9uIGJlZm9yZSBvdXIgYXV0b3J1bidzIGZpcnN0IHJlYWQsIHNvIHdlIG1heVxuXHQgKiBuZXZlciBvYnNlcnZlIGFuIGV4cGxpY2l0IERpc2Nvbm5lY3RlZCB0cmFuc2l0aW9uLiBUaGUgdGltZXIgZW5zdXJlcyB3ZVxuXHQgKiBldmVudHVhbGx5IGZhbGwgYmFjayBpbnN0ZWFkIG9mIGxlYXZpbmcgdGhlIHBpY2tlciBzaG93aW5nIGFuIHVucmVhY2hhYmxlXG5cdCAqIHJlbW90ZSB3aXRoIG5vIHNlc3Npb24uXG5cdCAqXG5cdCAqIEhhcyBubyBlZmZlY3Qgb25jZSB0aGUgdXNlciBtYWtlcyBhbiBleHBsaWNpdCBwaWNrIChgX3VzZXJIYXNQaWNrZWRgKS5cblx0ICovXG5cdHByaXZhdGUgX3dhdGNoRm9yQ29ubmVjdGlvbkZhaWx1cmUocmVzb2x2ZWQ6IElSZXNvbHZlZEZvbGRlcldvcmtzcGFjZSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb2x2ZWQucHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFwcm92aWRlciB8fCAhaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgfHwgIXByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29ublN0YXR1cyA9IHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXM7XG5cdFx0aWYgKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoY29ublN0YXR1cy5nZXQoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJVcmkgPSByZXNvbHZlZC53b3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0XHRpZiAoIWZvbGRlclVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25TdGF0dXNXYXRjaC52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0Y29uc3QgZmFsbGJhY2sgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uU3RhdHVzV2F0Y2guY2xlYXIoKTtcblx0XHRcdGlmICghdGhpcy5fdXNlckhhc1BpY2tlZCAmJiB0aGlzLl9pc1NlbGVjdGVkRm9sZGVyKGZvbGRlclVyaSkpIHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGVkUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3ByZXNlbGVjdGlvblNvdXJjZSA9IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuTm9uZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RXb3Jrc3BhY2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgaXNGaXJzdFJ1biA9IHRydWU7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IGNvbm5TdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoc3RhdHVzKSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uU3RhdHVzV2F0Y2guY2xlYXIoKTtcblx0XHRcdH0gZWxzZSBpZiAoKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNEaXNjb25uZWN0ZWQoc3RhdHVzKSB8fCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHN0YXR1cykpICYmICFpc0ZpcnN0UnVuKSB7XG5cdFx0XHRcdGZhbGxiYWNrKCk7XG5cdFx0XHR9XG5cdFx0XHRpc0ZpcnN0UnVuID0gZmFsc2U7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2FmZXR5IG5ldDogaWYgdGhlIGNvbm5lY3Rpb24gaGFzbid0IHN1Y2NlZWRlZCBieSB0aGUgZ3JhY2UgcGVyaW9kLFxuXHRcdC8vIGZhbGwgYmFjay4gQ2F0Y2hlcyB0aGUgY2FzZSB3aGVyZSB0aGUgcHJvdmlkZXIncyBzdGF0dXMgZmxpcHMgYmVmb3JlXG5cdFx0Ly8gb3VyIGF1dG9ydW4gc3Vic2NyaWJlcyAoc28gd2UgbmV2ZXIgb2JzZXJ2ZSBhIHRyYW5zaXRpb24pLlxuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uU3RhdHVzLmdldCgpKSkge1xuXHRcdFx0XHRmYWxsYmFjaygpO1xuXHRcdFx0fVxuXHRcdH0sIFJFU1RPUkVfQ09OTkVDVF9HUkFDRV9NUywgc3RvcmUpO1xuXHR9XG5cblx0Ly8gLS0gUmVjZW50IHdvcmtzcGFjZXMgKHNlc3Npb25zJyBvd24gaGlzdG9yeSkgLS1cblxuXHRwcm90ZWN0ZWQgX2dldFJlY2VudFdvcmtzcGFjZXMoKTogSVJlY2VudFdvcmtzcGFjZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5yZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlbW92ZVJlY2VudFdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMucmVjZW50V29ya3NwYWNlc1NlcnZpY2UucmVtb3ZlUmVjZW50V29ya3NwYWNlKGZvbGRlclVyaSk7XG5cblx0XHQvLyBDbGVhciBjdXJyZW50IHNlbGVjdGlvbiBpZiBpdCB3YXMgdGhlIHJlbW92ZWQgd29ya3NwYWNlXG5cdFx0aWYgKHRoaXMuX2lzU2VsZWN0ZWRGb2xkZXIoZm9sZGVyVXJpKSkge1xuXHRcdFx0dGhpcy5faGlkZVBpY2tlcigpO1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRGb2xkZXJVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZFJlc29sdmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcHJlc2VsZWN0aW9uU291cmNlID0gTmV3U2Vzc2lvbldvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZS5Ob25lO1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFdvcmtzcGFjZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksV0FBVztBQUN2QixTQUFTLGNBQWM7QUFDdkIsU0FBa0IsZ0JBQWdCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBRTVFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUFvRjtBQUM3RixTQUF5Qiw4QkFBOEI7QUFDdkQsU0FBUyxjQUFjLHNCQUFzQjtBQUM3QyxTQUFTLHlCQUF5QixpQ0FBaUMsd0NBQXdDO0FBQzNHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQXVDO0FBQ2hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUEyRCwrQkFBK0Isc0NBQXNDO0FBQ2hJLFNBQVMsaUNBQWlDO0FBQzFDLFNBQTJCLGtDQUFrQyw4QkFBOEI7QUFDM0YsU0FBcUMsMkJBQTJCO0FBQ2hFLFNBQVMsMENBQTBDO0FBRW5ELFNBQVMsZ0JBQWdCLGdCQUFnQixrQkFBa0IsNkJBQTZCO0FBQ3hGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsYUFBYTtBQUN0QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZDQUE2QztBQUN0RCxTQUF3QyxnQ0FBZ0M7QUFDeEUs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
