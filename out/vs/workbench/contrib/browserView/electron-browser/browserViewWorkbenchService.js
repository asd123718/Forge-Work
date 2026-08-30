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
import { BrowserViewCommandId, BrowserViewStorageScope, ipcBrowserViewChannelName } from "../../../../platform/browserView/common/browserView.js";
import { BrowserViewModel } from "../common/browserView.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { Emitter } from "../../../../base/common/event.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { process } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService, SIDE_GROUP, USE_MODAL_EDITOR_SETTING } from "../../../services/editor/common/editorService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { BrowserEditorInput } from "../common/browserEditorInput.js";
import { IEditorGroupsService, preferredSideBySideGroupDirection } from "../../../services/editor/common/editorGroupsService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { ChatConfiguration } from "../../chat/common/constants.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { contrastBorder, descriptionForeground, focusBorder } from "../../../../platform/theme/common/colors/baseColors.js";
import { buttonForeground, buttonBackground, inputPlaceholderForeground } from "../../../../platform/theme/common/colors/inputColors.js";
import { editorWidgetBackground, editorWidgetBorder, editorWidgetForeground, toolbarHoverBackground, widgetShadow } from "../../../../platform/theme/common/colors/editorColors.js";
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { findGroup } from "../../../services/editor/common/editorGroupFinder.js";
import { ChatEditorInput } from "../../chat/browser/widgetHosts/editor/chatEditorInput.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { URI } from "../../../../base/common/uri.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { getCopilotRootPaths } from "../../../../platform/agentHost/common/copilotHome.js";
import { localChatSessionType } from "../../chat/common/chatSessionsService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
const BrowserMaxHistoryEntriesSettingId = "workbench.browser.maxHistoryEntries";
const BrowserRemoteProxyEnabledSettingId = "workbench.browser.enableRemoteProxy";
const BrowserNewTabPlacementSettingId = "workbench.browser.newTabPlacement";
const browserViewContextMenuCommands = [
  BrowserViewCommandId.GoBack,
  BrowserViewCommandId.GoForward,
  BrowserViewCommandId.Reload
];
let BrowserViewWorkbenchService = class extends Disposable {
  constructor(mainProcessService, instantiationService, workspaceContextService, keybindingService, editorService, editorGroupsService, configurationService, workspaceTrustManagementService, workspaceTrustEnablementService, logService, contextKeyService, environmentService, themeService, chatWidgetService, accessibilityService) {
    super();
    this.instantiationService = instantiationService;
    this.workspaceContextService = workspaceContextService;
    this.keybindingService = keybindingService;
    this.editorService = editorService;
    this.editorGroupsService = editorGroupsService;
    this.configurationService = configurationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.themeService = themeService;
    this.chatWidgetService = chatWidgetService;
    this.accessibilityService = accessibilityService;
    this._known = /* @__PURE__ */ new Map();
    this._contextualFilters = /* @__PURE__ */ new Set();
    this._openHandlers = /* @__PURE__ */ new Set();
    this._onDidChangeBrowserViews = this._register(new Emitter());
    this.onDidChangeBrowserViews = this._onDidChangeBrowserViews.event;
    this._isSharingAvailable = false;
    this._onDidChangeSharingAvailable = this._register(new Emitter());
    this.onDidChangeSharingAvailable = this._onDidChangeSharingAvailable.event;
    const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
    this._browserViewService = ProxyChannel.toService(channel);
    this._mainWindowId = mainWindow.vscodeWindowId;
    this._updateWindowConfiguration();
    const chatEnabledKeys = new Set(ChatContextKeys.enabled.keys());
    this._register(this.keybindingService.onDidUpdateKeybindings(() => this._updateWindowConfiguration()));
    this._register(this.themeService.onDidColorThemeChange(() => this._updateWindowConfiguration()));
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => this._updateWindowConfiguration()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this._updateWindowConfiguration()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this._updateWindowConfiguration()));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateWindowConfiguration()));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(chatEnabledKeys)) {
        this._updateWindowConfiguration();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(BrowserMaxHistoryEntriesSettingId) || e.affectsConfiguration(BrowserRemoteProxyEnabledSettingId)) {
        this._updateWindowConfiguration();
      }
    }));
    this._isSharingAvailable = this.contextKeyService.contextMatchesRules(BrowserViewWorkbenchService._sharingAvailableContext);
    const sharingKeys = new Set(BrowserViewWorkbenchService._sharingAvailableContext.keys());
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(sharingKeys)) {
        const was = this._isSharingAvailable;
        this._isSharingAvailable = this.contextKeyService.contextMatchesRules(BrowserViewWorkbenchService._sharingAvailableContext);
        if (was !== this._isSharingAvailable) {
          this._onDidChangeSharingAvailable.fire(this._isSharingAvailable);
        }
      }
    }));
    void this._initializeExistingViews().catch((e) => {
      this.logService.error("[BrowserViewWorkbenchService] Failed to initialize existing browser views.", e);
    });
    this._register(this._browserViewService.onDidCreateBrowserView((e) => {
      if (e.info.owner.mainWindowId !== this._mainWindowId) {
        return;
      }
      this._createModel(e.info);
      const editor = this._known.get(e.info.id);
      if (editor && e.openOptions) {
        void this._openEditorForCreatedView(editor, e.info.owner, e.openOptions).catch((error) => {
          this.logService.error("[BrowserViewWorkbenchService] Failed to open editor for created browser view.", error);
        });
      }
    }));
  }
  get isSharingAvailable() {
    return this._isSharingAvailable;
  }
  willUseRemoteProxy() {
    if (!this.environmentService.remoteAuthority) {
      return false;
    }
    if (!this.configurationService.getValue(BrowserRemoteProxyEnabledSettingId)) {
      return false;
    }
    return true;
  }
  setRemoteProxyInfo(info) {
    this._remoteProxyInfo = info;
    this._updateWindowConfiguration();
  }
  getKnownBrowserViews() {
    return this._known;
  }
  registerContextualFilter(filter) {
    this._contextualFilters.add(filter);
    const changeListener = filter.onDidChange?.(() => this._onDidChangeBrowserViews.fire());
    this._onDidChangeBrowserViews.fire();
    return toDisposable(() => {
      this._contextualFilters.delete(filter);
      changeListener?.dispose();
      this._onDidChangeBrowserViews.fire();
    });
  }
  getContextualBrowserViews(context) {
    if (this._contextualFilters.size === 0) {
      return this._known;
    }
    const filters = [...this._contextualFilters];
    const result = /* @__PURE__ */ new Map();
    for (const [id, input] of this._known) {
      if (filters.every((filter) => filter.include(input, { ...context }))) {
        result.set(id, input);
      }
    }
    return result;
  }
  async getPreferredGroup(preferredGroup) {
    if (preferredGroup === SIDE_GROUP) {
      return this._getOrCreateDedicatedGroup("sideGroup");
    }
    if (preferredGroup !== void 0 && preferredGroup !== ACTIVE_GROUP) {
      return preferredGroup;
    }
    const placement = this.configurationService.getValue(BrowserNewTabPlacementSettingId);
    if (placement === "sideGroup" || placement === "window") {
      return this._getOrCreateDedicatedGroup(placement);
    }
    if (this.configurationService.getValue(USE_MODAL_EDITOR_SETTING) === "all") {
      return this.editorGroupsService.mainPart.activeGroup;
    }
    return preferredGroup;
  }
  /**
   * Resolve the dedicated editor group for the given placement, reusing an
   * existing locked browser group if one is found (so it survives window
   * reloads) or creating and locking a new one otherwise. Side-group creation
   * is synchronous; window creation is asynchronous.
   */
  _getOrCreateDedicatedGroup(placement) {
    const existing = this._findDedicatedGroup(placement);
    if (existing) {
      return existing;
    }
    if (placement === "sideGroup") {
      const direction = preferredSideBySideGroupDirection(this.configurationService);
      const group = this.editorGroupsService.addGroup(this.editorGroupsService.activeGroup, direction);
      group.lock(true);
      return group;
    }
    if (!this._dedicatedWindowGroupPromise) {
      this._dedicatedWindowGroupPromise = this.editorGroupsService.createAuxiliaryEditorPart().then((part) => {
        part.activeGroup.lock(true);
        return part.activeGroup;
      }).finally(() => this._dedicatedWindowGroupPromise = void 0);
    }
    return this._dedicatedWindowGroupPromise;
  }
  /**
   * Find an existing dedicated browser group for the given placement. A group
   * qualifies when it is locked and contains a browser editor (or is empty),
   * which lets us rediscover the dedicated group after a window reload
   * without tracking it in memory. Side groups live in the main editor part;
   * window groups live in an auxiliary editor part.
   */
  _findDedicatedGroup(placement) {
    const mainPart = this.editorGroupsService.mainPart;
    for (const group of this.editorGroupsService.groups) {
      if (!group.isLocked) {
        continue;
      }
      if (group.editors.length > 0 && !group.editors.some((editor) => editor instanceof BrowserEditorInput)) {
        continue;
      }
      const inMainPart = this.editorGroupsService.getPart(group) === mainPart;
      const matchesPlacement = placement === "sideGroup" ? inMainPart : !inMainPart;
      if (matchesPlacement) {
        return group;
      }
    }
    return void 0;
  }
  registerOpenHandler(handler) {
    this._openHandlers.add(handler);
    return toDisposable(() => {
      this._openHandlers.delete(handler);
    });
  }
  getOrCreateLazy(id, initialState, associatedResource, model) {
    if (!this._known.has(id)) {
      const input = this.instantiationService.createInstance(BrowserEditorInput, { id, ...initialState, associatedResource }, async () => {
        const info = await this._browserViewService.getOrCreateBrowserView(
          id,
          {
            owner: this._getDefaultOwner(),
            associatedResource,
            sessionOptions: {
              scope: await this._resolveStorageScope()
            },
            initialState: {
              url: initialState?.url,
              title: initialState?.title,
              lastFavicon: initialState?.favicon
            }
          }
        );
        return this._createModel(info);
      });
      input.onWillDispose(() => {
        this._known.delete(id);
        this._onDidChangeBrowserViews.fire();
      });
      if (model) {
        input.model = model;
      }
      this._known.set(id, input);
      this._onDidChangeBrowserViews.fire();
    }
    return this._known.get(id);
  }
  async clearGlobalStorage() {
    return this._browserViewService.clearGlobalStorage();
  }
  async clearWorkspaceStorage() {
    const workspaceId = this.workspaceContextService.getWorkspace().id;
    return this._browserViewService.clearWorkspaceStorage(workspaceId);
  }
  _getDefaultOwner() {
    return { mainWindowId: this._mainWindowId };
  }
  async _resolveStorageScope() {
    let dataStorage = this.configurationService.getValue(
      "workbench.browser.dataStorage"
    ) ?? "default";
    await this.workspaceTrustManagementService.workspaceTrustInitialized;
    const isWorkspaceUntrusted = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && !this.workspaceTrustManagementService.isWorkspaceTrusted();
    if (isWorkspaceUntrusted) {
      dataStorage = BrowserViewStorageScope.Ephemeral;
    } else if (dataStorage === "default") {
      dataStorage = this.environmentService.remoteAuthority ? BrowserViewStorageScope.Workspace : BrowserViewStorageScope.Global;
    }
    return dataStorage;
  }
  /**
   * Fetch all views owned by this window from the main service and create
   * models for them so they are available synchronously.
   */
  async _initializeExistingViews() {
    const views = await this._browserViewService.getBrowserViews(this._mainWindowId);
    for (const info of views) {
      this._createModel(info);
    }
  }
  _createModel(info) {
    const associatedResource = URI.revive(info.associatedResource);
    const existing = this._known.get(info.id)?.model;
    if (existing) {
      return existing;
    }
    const model = this.instantiationService.createInstance(BrowserViewModel, info.id, info.owner, associatedResource, info.state, this._browserViewService);
    this.getOrCreateLazy(info.id, {}, associatedResource, model).model = model;
    this._onDidChangeBrowserViews.fire();
    return model;
  }
  /**
   * Open an editor tab for a newly created browser view.
   */
  async _openEditorForCreatedView(view, owner, openOptions) {
    const opts = openOptions;
    for (const handler of this._openHandlers) {
      if (!handler.shouldOpenEditor(view, owner, opts)) {
        return;
      }
    }
    let targetGroup;
    if (opts.auxiliaryWindow) {
      targetGroup = AUX_WINDOW_GROUP;
    } else if (opts.parentViewId) {
      targetGroup = this._findEditorGroupForView(opts.parentViewId);
      if (targetGroup === void 0) {
        return;
      }
    } else {
      targetGroup = await this.getPreferredGroup();
    }
    const editorOptions = {
      inactive: opts.background,
      preserveFocus: opts.preserveFocus,
      pinned: opts.pinned,
      auxiliary: opts.auxiliaryWindow ? { bounds: opts.auxiliaryWindow, compact: true } : void 0
    };
    const [group] = await this.instantiationService.invokeFunction(findGroup, { editor: view, options: editorOptions }, targetGroup);
    if (owner.sessionId) {
      const sessionResource = URI.parse(owner.sessionId);
      const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
      const isWidgetVisible = !!widget && widget.domNode.offsetParent !== null;
      const activeIsSameSession = group.activeEditor instanceof ChatEditorInput && isEqual(group.activeEditor.sessionResource, sessionResource);
      if (!isWidgetVisible || activeIsSameSession) {
        editorOptions.inactive = true;
      }
    }
    void this.editorService.openEditor(view, editorOptions, group);
  }
  /**
   * Find the editor group that currently contains a browser view with the
   * given ID, or undefined if not open in any group.
   */
  _findEditorGroupForView(viewId) {
    for (const group of this.editorGroupsService.groups) {
      for (const editor of group.editors) {
        if (editor instanceof BrowserEditorInput && editor.id === viewId) {
          return group.id;
        }
      }
    }
    return void 0;
  }
  _updateWindowConfiguration() {
    void this._browserViewService.updateWindowConfiguration(this._mainWindowId, {
      theme: this._getTheme(),
      keybindings: this._getKeybindings(),
      aiFeaturesDisabled: !this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled),
      maxHistoryEntries: this.configurationService.getValue(BrowserMaxHistoryEntriesSettingId),
      proxyInfo: this._remoteProxyInfo,
      trustedFileRoots: this._getTrustedFileRoots(),
      trustAllFiles: !this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()
    });
  }
  _getKeybindings() {
    const keybindings = /* @__PURE__ */ Object.create(null);
    for (const commandId of browserViewContextMenuCommands) {
      const binding = this.keybindingService.lookupKeybinding(commandId);
      const accelerator = binding?.getElectronAccelerator();
      if (accelerator) {
        keybindings[commandId] = accelerator;
      }
    }
    return keybindings;
  }
  _getTheme() {
    const theme = this.themeService.getColorTheme();
    return {
      focusBorder: theme.getColor(focusBorder)?.toString(),
      buttonBackground: theme.getColor(buttonBackground)?.toString(),
      buttonForeground: theme.getColor(buttonForeground)?.toString(),
      widgetBackground: theme.getColor(editorWidgetBackground)?.toString(),
      widgetForeground: theme.getColor(editorWidgetForeground)?.toString(),
      widgetBorder: theme.getColor(editorWidgetBorder)?.toString(),
      widgetShadow: theme.getColor(widgetShadow)?.toString(),
      contrastBorder: theme.getColor(contrastBorder)?.toString(),
      descriptionForeground: theme.getColor(descriptionForeground)?.toString(),
      inputPlaceholderForeground: theme.getColor(inputPlaceholderForeground)?.toString(),
      toolbarHoverBackground: theme.getColor(toolbarHoverBackground)?.toString(),
      font: DEFAULT_FONT_FAMILY,
      reducedMotion: this.accessibilityService.isMotionReduced()
    };
  }
  _getTrustedFileRoots() {
    const roots = new Set(getCopilotRootPaths(this.environmentService.userHome.fsPath, process.env));
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      for (const folder of this.workspaceContextService.getWorkspace().folders) {
        if (folder.uri.scheme === Schemas.file) {
          roots.add(folder.uri.fsPath);
        }
      }
    }
    for (const uri of this.workspaceTrustManagementService.getTrustedUris()) {
      if (uri.scheme === Schemas.file) {
        roots.add(uri.fsPath);
      }
    }
    return [...roots];
  }
};
BrowserViewWorkbenchService._sharingAvailableContext = ContextKeyExpr.and(
  ChatContextKeys.enabled,
  ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
  ContextKeyExpr.has(`config.workbench.browser.enableChatTools`),
  // If we're in Sessions Window, we require some additional conditions.
  ContextKeyExpr.or(
    IsSessionsWindowContext.negate(),
    ContextKeyExpr.or(
      ContextKeyExpr.equals("sessionType", localChatSessionType),
      ContextKeyExpr.equals("sessions.isAgentHostSession", true)
    )
  )
);
BrowserViewWorkbenchService = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IWorkspaceTrustEnablementService),
  __decorateParam(9, ILogService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, INativeWorkbenchEnvironmentService),
  __decorateParam(12, IThemeService),
  __decorateParam(13, IChatWidgetService),
  __decorateParam(14, IAccessibilityService)
], BrowserViewWorkbenchService);
export {
  BrowserMaxHistoryEntriesSettingId,
  BrowserNewTabPlacementSettingId,
  BrowserRemoteProxyEnabledSettingId,
  BrowserViewWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxicm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCcm93c2VyVmlld0NvbW1hbmRJZCwgQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUsIElCcm93c2VyVmlld0luZm8sIElCcm93c2VyVmlld09wZW5PcHRpb25zLCBJQnJvd3NlclZpZXdPd25lciwgSUJyb3dzZXJWaWV3U2VydmljZSwgSUJyb3dzZXJWaWV3VGhlbWUsIGlwY0Jyb3dzZXJWaWV3Q2hhbm5lbE5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSwgSUJyb3dzZXJWaWV3TW9kZWwsIEJyb3dzZXJWaWV3TW9kZWwsIElCcm93c2VyRWRpdG9yVmlld1N0YXRlLCBJQnJvd3NlclZpZXdDb250ZXh0dWFsRmlsdGVyLCBJQnJvd3NlclZpZXdGaWx0ZXJDb250ZXh0LCBJQnJvd3NlclZpZXdPcGVuSGFuZGxlciB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBJTWFpblByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2NvbW1vbi9tYWluUHJvY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwcm9jZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L2VsZWN0cm9uLWJyb3dzZXIvZ2xvYmFscy5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIEFVWF9XSU5ET1dfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBQcmVmZXJyZWRHcm91cCwgU0lERV9HUk9VUCwgVVNFX01PREFMX0VESVRPUl9TRVRUSU5HLCBVc2VNb2RhbEVkaXRvck1vZGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSwgcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29udHJhc3RCb3JkZXIsIGRlc2NyaXB0aW9uRm9yZWdyb3VuZCwgZm9jdXNCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2Jhc2VDb2xvcnMuanMnO1xuaW1wb3J0IHsgYnV0dG9uRm9yZWdyb3VuZCwgYnV0dG9uQmFja2dyb3VuZCwgaW5wdXRQbGFjZWhvbGRlckZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2lucHV0Q29sb3JzLmpzJztcbmltcG9ydCB7IGVkaXRvcldpZGdldEJhY2tncm91bmQsIGVkaXRvcldpZGdldEJvcmRlciwgZWRpdG9yV2lkZ2V0Rm9yZWdyb3VuZCwgdG9vbGJhckhvdmVyQmFja2dyb3VuZCwgd2lkZ2V0U2hhZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9lZGl0b3JDb2xvcnMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9GT05UX0ZBTUlMWSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyBmaW5kR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwRmluZGVyLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZ2V0Q29waWxvdFJvb3RQYXRocyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29waWxvdEhvbWUuanMnO1xuaW1wb3J0IHsgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHVubmVsUHJveHlJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWxQcm94eS5qcyc7XG5cbmV4cG9ydCBjb25zdCBCcm93c2VyTWF4SGlzdG9yeUVudHJpZXNTZXR0aW5nSWQgPSAnd29ya2JlbmNoLmJyb3dzZXIubWF4SGlzdG9yeUVudHJpZXMnO1xuZXhwb3J0IGNvbnN0IEJyb3dzZXJSZW1vdGVQcm94eUVuYWJsZWRTZXR0aW5nSWQgPSAnd29ya2JlbmNoLmJyb3dzZXIuZW5hYmxlUmVtb3RlUHJveHknO1xuZXhwb3J0IGNvbnN0IEJyb3dzZXJOZXdUYWJQbGFjZW1lbnRTZXR0aW5nSWQgPSAnd29ya2JlbmNoLmJyb3dzZXIubmV3VGFiUGxhY2VtZW50JztcblxuLyoqXG4gKiBXaGVyZSBuZXcgaW50ZWdyYXRlZCBicm93c2VyIHRhYnMgYXJlIG9wZW5lZC5cbiAqIC0gYGFjdGl2ZUdyb3VwYDogdGhlIGN1cnJlbnRseSBhY3RpdmUgZWRpdG9yIGdyb3VwIChkZWZhdWx0KS5cbiAqIC0gYHNpZGVHcm91cGA6IGEgZGVkaWNhdGVkIGVkaXRvciBncm91cCB0byB0aGUgc2lkZSwgbG9ja2VkIHNvIHRoYXQgb3RoZXIgZWRpdG9ycyBhcmUgbm90IG9wZW5lZCBpbnRvIGl0LlxuICogLSBgd2luZG93YDogYSBkZWRpY2F0ZWQgYXV4aWxpYXJ5IHdpbmRvdywgbG9ja2VkIHNvIHRoYXQgb3RoZXIgZWRpdG9ycyBhcmUgbm90IG9wZW5lZCBpbnRvIGl0LlxuICovXG5leHBvcnQgdHlwZSBCcm93c2VyTmV3VGFiUGxhY2VtZW50ID0gJ2FjdGl2ZUdyb3VwJyB8ICdzaWRlR3JvdXAnIHwgJ3dpbmRvdyc7XG5cbi8qKiBUaGUgcGxhY2VtZW50IGtpbmRzIHRoYXQgcmVzb2x2ZSB0byBhIG5ldyBncm91cC4gKi9cbnR5cGUgRGVkaWNhdGVkR3JvdXBQbGFjZW1lbnQgPSBFeGNsdWRlPEJyb3dzZXJOZXdUYWJQbGFjZW1lbnQsICdhY3RpdmVHcm91cCc+O1xuXG4vKiogQ29tbWFuZCBJRHMgd2hvc2UgYWNjZWxlcmF0b3JzIGFyZSBzaG93biBpbiBicm93c2VyIHZpZXcgY29udGV4dCBtZW51cy4gKi9cbmNvbnN0IGJyb3dzZXJWaWV3Q29udGV4dE1lbnVDb21tYW5kcyA9IFtcblx0QnJvd3NlclZpZXdDb21tYW5kSWQuR29CYWNrLFxuXHRCcm93c2VyVmlld0NvbW1hbmRJZC5Hb0ZvcndhcmQsXG5cdEJyb3dzZXJWaWV3Q29tbWFuZElkLlJlbG9hZCxcbl07XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jyb3dzZXJWaWV3U2VydmljZTogSUJyb3dzZXJWaWV3U2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfa25vd24gPSBuZXcgTWFwPHN0cmluZywgQnJvd3NlckVkaXRvcklucHV0PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0dWFsRmlsdGVycyA9IG5ldyBTZXQ8SUJyb3dzZXJWaWV3Q29udGV4dHVhbEZpbHRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3BlbkhhbmRsZXJzID0gbmV3IFNldDxJQnJvd3NlclZpZXdPcGVuSGFuZGxlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpbldpbmRvd0lkOiBudW1iZXI7XG5cblx0LyoqIExhdGVzdCB0dW5uZWwtcHJveHkgY3JlZGVudGlhbHMgcHVzaGVkIGZyb20gdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0LiAqL1xuXHRwcml2YXRlIF9yZW1vdGVQcm94eUluZm86IElUdW5uZWxQcm94eUluZm8gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEluLWZsaWdodCBjcmVhdGlvbiBvZiB0aGUgZGVkaWNhdGVkIGJyb3dzZXIgd2luZG93IGdyb3VwLCB1c2VkIHRvIGNvYWxlc2NlXG5cdCAqIGNvbmN1cnJlbnQgcmVxdWVzdHMgc28gd2UgZG9uJ3Qgc3Bhd24gbXVsdGlwbGUgYXV4aWxpYXJ5IHdpbmRvd3MuIFRoZSBncm91cFxuXHQgKiBpdHNlbGYgaXMgbm90IHRyYWNrZWQgaW4gbWVtb3J5OiBpdCBpcyByZWRpc2NvdmVyZWQgZHluYW1pY2FsbHkgdmlhXG5cdCAqIHtAbGluayBfZmluZERlZGljYXRlZEdyb3VwfSBzbyB0aGF0IGl0IHN1cnZpdmVzIHdpbmRvdyByZWxvYWRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVkaWNhdGVkV2luZG93R3JvdXBQcm9taXNlOiBQcm9taXNlPElFZGl0b3JHcm91cD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VCcm93c2VyVmlld3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VCcm93c2VyVmlld3M6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VCcm93c2VyVmlld3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3NoYXJpbmdBdmFpbGFibGVDb250ZXh0ID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdENvbnRleHRLZXlFeHByLmhhcyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkfWApLFxuXHRcdENvbnRleHRLZXlFeHByLmhhcyhgY29uZmlnLndvcmtiZW5jaC5icm93c2VyLmVuYWJsZUNoYXRUb29sc2ApLFxuXHRcdC8vIElmIHdlJ3JlIGluIFNlc3Npb25zIFdpbmRvdywgd2UgcmVxdWlyZSBzb21lIGFkZGl0aW9uYWwgY29uZGl0aW9ucy5cblx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnc2Vzc2lvblR5cGUnLCBsb2NhbENoYXRTZXNzaW9uVHlwZSksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnc2Vzc2lvbnMuaXNBZ2VudEhvc3RTZXNzaW9uJywgdHJ1ZSksXG5cdFx0XHQpLFxuXHRcdCksXG5cdCkhO1xuXG5cdHByaXZhdGUgX2lzU2hhcmluZ0F2YWlsYWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2hhcmluZ0F2YWlsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoYXJpbmdBdmFpbGFibGU6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VTaGFyaW5nQXZhaWxhYmxlLmV2ZW50O1xuXG5cdGdldCBpc1NoYXJpbmdBdmFpbGFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzU2hhcmluZ0F2YWlsYWJsZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWFpblByb2Nlc3NTZXJ2aWNlIG1haW5Qcm9jZXNzU2VydmljZTogSU1haW5Qcm9jZXNzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBjaGFubmVsID0gbWFpblByb2Nlc3NTZXJ2aWNlLmdldENoYW5uZWwoaXBjQnJvd3NlclZpZXdDaGFubmVsTmFtZSk7XG5cdFx0dGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJQnJvd3NlclZpZXdTZXJ2aWNlPihjaGFubmVsKTtcblx0XHR0aGlzLl9tYWluV2luZG93SWQgPSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkO1xuXG5cdFx0Ly8gU2VuZCB0aGUgZnVsbCBwZXItd2luZG93IGNvbmZpZ3VyYXRpb24gYXMgYSBzaW5nbGUgdW5pdCwgYW5kIHJlc2VuZCBpdFxuXHRcdC8vIHdoZW5ldmVyIGFueSBvZiBpdHMgaW5wdXRzIGNoYW5nZS5cblx0XHR0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCk7XG5cdFx0Y29uc3QgY2hhdEVuYWJsZWRLZXlzID0gbmV3IFNldChDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXlzKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMua2V5YmluZGluZ1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncygoKSA9PiB0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24oKCkgPT4gdGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMoKCkgPT4gdGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoKCkgPT4gdGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShjaGF0RW5hYmxlZEtleXMpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVdpbmRvd0NvbmZpZ3VyYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihCcm93c2VyTWF4SGlzdG9yeUVudHJpZXNTZXR0aW5nSWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQnJvd3NlclJlbW90ZVByb3h5RW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIHNoYXJpbmcgYXZhaWxhYmlsaXR5IGZyb20gY29udGV4dCBrZXlzXG5cdFx0dGhpcy5faXNTaGFyaW5nQXZhaWxhYmxlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKEJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5fc2hhcmluZ0F2YWlsYWJsZUNvbnRleHQpO1xuXHRcdGNvbnN0IHNoYXJpbmdLZXlzID0gbmV3IFNldChCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuX3NoYXJpbmdBdmFpbGFibGVDb250ZXh0LmtleXMoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShzaGFyaW5nS2V5cykpIHtcblx0XHRcdFx0Y29uc3Qgd2FzID0gdGhpcy5faXNTaGFyaW5nQXZhaWxhYmxlO1xuXHRcdFx0XHR0aGlzLl9pc1NoYXJpbmdBdmFpbGFibGUgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLl9zaGFyaW5nQXZhaWxhYmxlQ29udGV4dCk7XG5cdFx0XHRcdGlmICh3YXMgIT09IHRoaXMuX2lzU2hhcmluZ0F2YWlsYWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2hhcmluZ0F2YWlsYWJsZS5maXJlKHRoaXMuX2lzU2hhcmluZ0F2YWlsYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTdGFydCBhc3luY2hyb25vdXNseSBjcmVhdGluZyBtb2RlbHMgZm9yIGFsbCB2aWV3cyB3ZSBhbHJlYWR5IG93bi5cblx0XHR2b2lkIHRoaXMuX2luaXRpYWxpemVFeGlzdGluZ1ZpZXdzKCkuY2F0Y2goZSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2VdIEZhaWxlZCB0byBpbml0aWFsaXplIGV4aXN0aW5nIGJyb3dzZXIgdmlld3MuJywgZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIG5ldyBicm93c2VyIHZpZXdzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlLm9uRGlkQ3JlYXRlQnJvd3NlclZpZXcoZSA9PiB7XG5cdFx0XHRpZiAoZS5pbmZvLm93bmVyLm1haW5XaW5kb3dJZCAhPT0gdGhpcy5fbWFpbldpbmRvd0lkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gTm90IGZvciB0aGlzIHdpbmRvd1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFYWdlcmx5IGNyZWF0ZSB0aGUgbW9kZWwgZnJvbSB0aGUgc3RhdGUgd2UgYWxyZWFkeSBoYXZlXG5cdFx0XHR0aGlzLl9jcmVhdGVNb2RlbChlLmluZm8pO1xuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9rbm93bi5nZXQoZS5pbmZvLmlkKTtcblx0XHRcdGlmIChlZGl0b3IgJiYgZS5vcGVuT3B0aW9ucykge1xuXHRcdFx0XHR2b2lkIHRoaXMuX29wZW5FZGl0b3JGb3JDcmVhdGVkVmlldyhlZGl0b3IsIGUuaW5mby5vd25lciwgZS5vcGVuT3B0aW9ucykuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0Jyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZV0gRmFpbGVkIHRvIG9wZW4gZWRpdG9yIGZvciBjcmVhdGVkIGJyb3dzZXIgdmlldy4nLCBlcnJvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHdpbGxVc2VSZW1vdGVQcm94eSgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQnJvd3NlclJlbW90ZVByb3h5RW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXRSZW1vdGVQcm94eUluZm8oaW5mbzogSVR1bm5lbFByb3h5SW5mbyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW90ZVByb3h5SW5mbyA9IGluZm87XG5cdFx0dGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0Z2V0S25vd25Ccm93c2VyVmlld3MoKTogTWFwPHN0cmluZywgQnJvd3NlckVkaXRvcklucHV0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2tub3duO1xuXHR9XG5cblx0cmVnaXN0ZXJDb250ZXh0dWFsRmlsdGVyKGZpbHRlcjogSUJyb3dzZXJWaWV3Q29udGV4dHVhbEZpbHRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jb250ZXh0dWFsRmlsdGVycy5hZGQoZmlsdGVyKTtcblx0XHRjb25zdCBjaGFuZ2VMaXN0ZW5lciA9IGZpbHRlci5vbkRpZENoYW5nZT8uKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcm93c2VyVmlld3MuZmlyZSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGV4dHVhbEZpbHRlcnMuZGVsZXRlKGZpbHRlcik7XG5cdFx0XHRjaGFuZ2VMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcm93c2VyVmlld3MuZmlyZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0Q29udGV4dHVhbEJyb3dzZXJWaWV3cyhjb250ZXh0PzogSUJyb3dzZXJWaWV3RmlsdGVyQ29udGV4dCk6IE1hcDxzdHJpbmcsIEJyb3dzZXJFZGl0b3JJbnB1dD4ge1xuXHRcdGlmICh0aGlzLl9jb250ZXh0dWFsRmlsdGVycy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fa25vd247XG5cdFx0fVxuXHRcdGNvbnN0IGZpbHRlcnMgPSBbLi4udGhpcy5fY29udGV4dHVhbEZpbHRlcnNdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBCcm93c2VyRWRpdG9ySW5wdXQ+KCk7XG5cdFx0Zm9yIChjb25zdCBbaWQsIGlucHV0XSBvZiB0aGlzLl9rbm93bikge1xuXHRcdFx0aWYgKGZpbHRlcnMuZXZlcnkoZmlsdGVyID0+IGZpbHRlci5pbmNsdWRlKGlucHV0LCB7IC4uLmNvbnRleHQgfSkpKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQoaWQsIGlucHV0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGdldFByZWZlcnJlZEdyb3VwKHByZWZlcnJlZEdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPFByZWZlcnJlZEdyb3VwIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gXCJPcGVuIHRvIHNpZGVcIiByZXF1ZXN0cyBhcmUgcm91dGVkIGludG8gdGhlIGRlZGljYXRlZCBzaWRlIGdyb3VwLlxuXHRcdGlmIChwcmVmZXJyZWRHcm91cCA9PT0gU0lERV9HUk9VUCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE9yQ3JlYXRlRGVkaWNhdGVkR3JvdXAoJ3NpZGVHcm91cCcpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyIGV4cGxpY2l0IHBsYWNlbWVudHMgYXJlIGFsd2F5cyBob25vcmVkIGFzLWlzLlxuXHRcdGlmIChwcmVmZXJyZWRHcm91cCAhPT0gdW5kZWZpbmVkICYmIHByZWZlcnJlZEdyb3VwICE9PSBBQ1RJVkVfR1JPVVApIHtcblx0XHRcdHJldHVybiBwcmVmZXJyZWRHcm91cDtcblx0XHR9XG5cblx0XHQvLyBIb25vciB0aGUgdXNlci1jb25maWd1cmVkIGRlZmF1bHQgZm9yIG5ldyBicm93c2VyIHRhYnMuXG5cdFx0Y29uc3QgcGxhY2VtZW50ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxCcm93c2VyTmV3VGFiUGxhY2VtZW50PihCcm93c2VyTmV3VGFiUGxhY2VtZW50U2V0dGluZ0lkKTtcblx0XHRpZiAocGxhY2VtZW50ID09PSAnc2lkZUdyb3VwJyB8fCBwbGFjZW1lbnQgPT09ICd3aW5kb3cnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0T3JDcmVhdGVEZWRpY2F0ZWRHcm91cChwbGFjZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gZWRpdG9ycyBhcmUgZm9yY2VkIG1vZGFsIHZpYSBgd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbDogJ2FsbCdgLFxuXHRcdC8vIHJlZGlyZWN0IGFjdGl2ZS91bnNwZWNpZmllZCBicm93c2VyIG9wZW5zIHRvIHRoZSBtYWluIGVkaXRvciBhcmVhIHNvIHRoZVxuXHRcdC8vIGJyb3dzZXIgZG9ja3MgaW5zdGVhZCBvZiBvcGVuaW5nIGFzIGEgbW9kYWwgb3ZlcmxheS5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxVc2VNb2RhbEVkaXRvck1vZGU+KFVTRV9NT0RBTF9FRElUT1JfU0VUVElORykgPT09ICdhbGwnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLm1haW5QYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmZXJyZWRHcm91cDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBkZWRpY2F0ZWQgZWRpdG9yIGdyb3VwIGZvciB0aGUgZ2l2ZW4gcGxhY2VtZW50LCByZXVzaW5nIGFuXG5cdCAqIGV4aXN0aW5nIGxvY2tlZCBicm93c2VyIGdyb3VwIGlmIG9uZSBpcyBmb3VuZCAoc28gaXQgc3Vydml2ZXMgd2luZG93XG5cdCAqIHJlbG9hZHMpIG9yIGNyZWF0aW5nIGFuZCBsb2NraW5nIGEgbmV3IG9uZSBvdGhlcndpc2UuIFNpZGUtZ3JvdXAgY3JlYXRpb25cblx0ICogaXMgc3luY2hyb25vdXM7IHdpbmRvdyBjcmVhdGlvbiBpcyBhc3luY2hyb25vdXMuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRPckNyZWF0ZURlZGljYXRlZEdyb3VwKHBsYWNlbWVudDogRGVkaWNhdGVkR3JvdXBQbGFjZW1lbnQpOiBJRWRpdG9yR3JvdXAgfCBQcm9taXNlPElFZGl0b3JHcm91cD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZmluZERlZGljYXRlZEdyb3VwKHBsYWNlbWVudCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlbWVudCA9PT0gJ3NpZGVHcm91cCcpIHtcblx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cCwgZGlyZWN0aW9uKTtcblx0XHRcdC8vIExvY2sgdGhlIGdyb3VwIHNvIHRoYXQgb3RoZXIgKG5vbi1icm93c2VyKSBlZGl0b3JzIGFyZSBub3Qgb3BlbmVkXG5cdFx0XHQvLyBpbnRvIGl0LiBCcm93c2VyIHRhYnMgc3RpbGwgb3BlbiBoZXJlIGJlY2F1c2Ugd2UgdGFyZ2V0IGl0IGRpcmVjdGx5LlxuXHRcdFx0Z3JvdXAubG9jayh0cnVlKTtcblx0XHRcdHJldHVybiBncm91cDtcblx0XHR9XG5cblx0XHQvLyBBdXhpbGlhcnktd2luZG93IGNyZWF0aW9uIGlzIGFzeW5jOyBjb2FsZXNjZSBjb25jdXJyZW50IHJlcXVlc3RzIHNvIHdlIGRvbid0IHNwYXduIG11bHRpcGxlIHdpbmRvd3MuXG5cdFx0aWYgKCF0aGlzLl9kZWRpY2F0ZWRXaW5kb3dHcm91cFByb21pc2UpIHtcblx0XHRcdHRoaXMuX2RlZGljYXRlZFdpbmRvd0dyb3VwUHJvbWlzZSA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5jcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KClcblx0XHRcdFx0LnRoZW4ocGFydCA9PiB7XG5cdFx0XHRcdFx0cGFydC5hY3RpdmVHcm91cC5sb2NrKHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQuZmluYWxseSgoKSA9PiB0aGlzLl9kZWRpY2F0ZWRXaW5kb3dHcm91cFByb21pc2UgPSB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVkaWNhdGVkV2luZG93R3JvdXBQcm9taXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgYW4gZXhpc3RpbmcgZGVkaWNhdGVkIGJyb3dzZXIgZ3JvdXAgZm9yIHRoZSBnaXZlbiBwbGFjZW1lbnQuIEEgZ3JvdXBcblx0ICogcXVhbGlmaWVzIHdoZW4gaXQgaXMgbG9ja2VkIGFuZCBjb250YWlucyBhIGJyb3dzZXIgZWRpdG9yIChvciBpcyBlbXB0eSksXG5cdCAqIHdoaWNoIGxldHMgdXMgcmVkaXNjb3ZlciB0aGUgZGVkaWNhdGVkIGdyb3VwIGFmdGVyIGEgd2luZG93IHJlbG9hZFxuXHQgKiB3aXRob3V0IHRyYWNraW5nIGl0IGluIG1lbW9yeS4gU2lkZSBncm91cHMgbGl2ZSBpbiB0aGUgbWFpbiBlZGl0b3IgcGFydDtcblx0ICogd2luZG93IGdyb3VwcyBsaXZlIGluIGFuIGF1eGlsaWFyeSBlZGl0b3IgcGFydC5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmREZWRpY2F0ZWRHcm91cChwbGFjZW1lbnQ6IERlZGljYXRlZEdyb3VwUGxhY2VtZW50KTogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYWluUGFydCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydDtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGlmICghZ3JvdXAuaXNMb2NrZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ3JvdXAuZWRpdG9ycy5sZW5ndGggPiAwICYmICFncm91cC5lZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbk1haW5QYXJ0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmdldFBhcnQoZ3JvdXApID09PSBtYWluUGFydDtcblx0XHRcdGNvbnN0IG1hdGNoZXNQbGFjZW1lbnQgPSBwbGFjZW1lbnQgPT09ICdzaWRlR3JvdXAnID8gaW5NYWluUGFydCA6ICFpbk1haW5QYXJ0O1xuXHRcdFx0aWYgKG1hdGNoZXNQbGFjZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVnaXN0ZXJPcGVuSGFuZGxlcihoYW5kbGVyOiBJQnJvd3NlclZpZXdPcGVuSGFuZGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9vcGVuSGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb3BlbkhhbmRsZXJzLmRlbGV0ZShoYW5kbGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldE9yQ3JlYXRlTGF6eShpZDogc3RyaW5nLCBpbml0aWFsU3RhdGU/OiBJQnJvd3NlckVkaXRvclZpZXdTdGF0ZSwgYXNzb2NpYXRlZFJlc291cmNlPzogVVJJLCBtb2RlbD86IElCcm93c2VyVmlld01vZGVsKTogQnJvd3NlckVkaXRvcklucHV0IHtcblx0XHRpZiAoIXRoaXMuX2tub3duLmhhcyhpZCkpIHtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyRWRpdG9ySW5wdXQsIHsgaWQsIC4uLmluaXRpYWxTdGF0ZSwgYXNzb2NpYXRlZFJlc291cmNlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5nZXRPckNyZWF0ZUJyb3dzZXJWaWV3KFxuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG93bmVyOiB0aGlzLl9nZXREZWZhdWx0T3duZXIoKSxcblx0XHRcdFx0XHRcdGFzc29jaWF0ZWRSZXNvdXJjZSxcblx0XHRcdFx0XHRcdHNlc3Npb25PcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHNjb3BlOiBhd2FpdCB0aGlzLl9yZXNvbHZlU3RvcmFnZVNjb3BlKClcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRpbml0aWFsU3RhdGU6IHtcblx0XHRcdFx0XHRcdFx0dXJsOiBpbml0aWFsU3RhdGU/LnVybCxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IGluaXRpYWxTdGF0ZT8udGl0bGUsXG5cdFx0XHRcdFx0XHRcdGxhc3RGYXZpY29uOiBpbml0aWFsU3RhdGU/LmZhdmljb25cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVNb2RlbChpbmZvKTtcblx0XHRcdH0pO1xuXHRcdFx0aW5wdXQub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2tub3duLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGlucHV0Lm1vZGVsID0gbW9kZWw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9rbm93bi5zZXQoaWQsIGlucHV0KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fa25vd24uZ2V0KGlkKSE7XG5cdH1cblxuXHRhc3luYyBjbGVhckdsb2JhbFN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5jbGVhckdsb2JhbFN0b3JhZ2UoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyV29ya3NwYWNlU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VJZCA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQ7XG5cdFx0cmV0dXJuIHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5jbGVhcldvcmtzcGFjZVN0b3JhZ2Uod29ya3NwYWNlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdE93bmVyKCk6IElCcm93c2VyVmlld093bmVyIHtcblx0XHRyZXR1cm4geyBtYWluV2luZG93SWQ6IHRoaXMuX21haW5XaW5kb3dJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVN0b3JhZ2VTY29wZSgpOiBQcm9taXNlPEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlPiB7XG5cdFx0bGV0IGRhdGFTdG9yYWdlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxCcm93c2VyVmlld1N0b3JhZ2VTY29wZSB8ICdkZWZhdWx0Jz4oXG5cdFx0XHQnd29ya2JlbmNoLmJyb3dzZXIuZGF0YVN0b3JhZ2UnXG5cdFx0KSA/PyAnZGVmYXVsdCc7XG5cblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZDtcblxuXHRcdGNvbnN0IGlzV29ya3NwYWNlVW50cnVzdGVkID1cblx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgJiZcblx0XHRcdCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cblx0XHRpZiAoaXNXb3Jrc3BhY2VVbnRydXN0ZWQpIHtcblx0XHRcdC8vIEFsd2F5cyB1c2UgZXBoZW1lcmFsIHNlc3Npb25zIGZvciB1bnRydXN0ZWQgd29ya3NwYWNlc1xuXHRcdFx0ZGF0YVN0b3JhZ2UgPSBCcm93c2VyVmlld1N0b3JhZ2VTY29wZS5FcGhlbWVyYWw7XG5cdFx0fSBlbHNlIGlmIChkYXRhU3RvcmFnZSA9PT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHQvLyBXb3Jrc3BhY2Utc2NvcGVkIGZvciByZW1vdGUgd29ya3NwYWNlcy5cblx0XHRcdGRhdGFTdG9yYWdlID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdD8gQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUuV29ya3NwYWNlXG5cdFx0XHRcdDogQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUuR2xvYmFsO1xuXHRcdH1cblxuXHRcdHJldHVybiBkYXRhU3RvcmFnZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGZXRjaCBhbGwgdmlld3Mgb3duZWQgYnkgdGhpcyB3aW5kb3cgZnJvbSB0aGUgbWFpbiBzZXJ2aWNlIGFuZCBjcmVhdGVcblx0ICogbW9kZWxzIGZvciB0aGVtIHNvIHRoZXkgYXJlIGF2YWlsYWJsZSBzeW5jaHJvbm91c2x5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaW5pdGlhbGl6ZUV4aXN0aW5nVmlld3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld3MgPSBhd2FpdCB0aGlzLl9icm93c2VyVmlld1NlcnZpY2UuZ2V0QnJvd3NlclZpZXdzKHRoaXMuX21haW5XaW5kb3dJZCk7XG5cdFx0Zm9yIChjb25zdCBpbmZvIG9mIHZpZXdzKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVNb2RlbChpbmZvKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVNb2RlbChpbmZvOiBJQnJvd3NlclZpZXdJbmZvKTogSUJyb3dzZXJWaWV3TW9kZWwge1xuXHRcdGNvbnN0IGFzc29jaWF0ZWRSZXNvdXJjZSA9IFVSSS5yZXZpdmUoaW5mby5hc3NvY2lhdGVkUmVzb3VyY2UpO1xuXHRcdC8vIERvbid0IGRvdWJsZS1jcmVhdGVcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2tub3duLmdldChpbmZvLmlkKT8ubW9kZWw7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyb3dzZXJWaWV3TW9kZWwsIGluZm8uaWQsIGluZm8ub3duZXIsIGFzc29jaWF0ZWRSZXNvdXJjZSwgaW5mby5zdGF0ZSwgdGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlKTtcblxuXHRcdC8vIFNhbml0eTogYm90aCBwYXNzIGFuZCBhc3NpZ24gdGhlIG1vZGVsIHRvIGJlIHN1cmUuIEl0IHdpbGwgbm8tb3AgaWYgYWxyZWFkeSBzZXQuXG5cdFx0dGhpcy5nZXRPckNyZWF0ZUxhenkoaW5mby5pZCwge30sIGFzc29jaWF0ZWRSZXNvdXJjZSwgbW9kZWwpLm1vZGVsID0gbW9kZWw7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyb3dzZXJWaWV3cy5maXJlKCk7XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiBhbiBlZGl0b3IgdGFiIGZvciBhIG5ld2x5IGNyZWF0ZWQgYnJvd3NlciB2aWV3LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkVkaXRvckZvckNyZWF0ZWRWaWV3KHZpZXc6IEJyb3dzZXJFZGl0b3JJbnB1dCwgb3duZXI6IElCcm93c2VyVmlld093bmVyLCBvcGVuT3B0aW9uczogSUJyb3dzZXJWaWV3T3Blbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcHRzID0gb3Blbk9wdGlvbnM7XG5cblx0XHQvLyBHaXZlIHJlZ2lzdGVyZWQgaGFuZGxlcnMgYSBjaGFuY2UgdG8gcHJldmVudCB0aGUgZWRpdG9yIGZyb20gb3BlbmluZy5cblx0XHRmb3IgKGNvbnN0IGhhbmRsZXIgb2YgdGhpcy5fb3BlbkhhbmRsZXJzKSB7XG5cdFx0XHRpZiAoIWhhbmRsZXIuc2hvdWxkT3BlbkVkaXRvcih2aWV3LCBvd25lciwgb3B0cykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGFyZ2V0IGdyb3VwOiBhdXhpbGlhcnkgd2luZG93LCBwYXJlbnQncyBncm91cCwgb3IgZGVmYXVsdFxuXHRcdGxldCB0YXJnZXRHcm91cDogUHJlZmVycmVkR3JvdXAgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdHMuYXV4aWxpYXJ5V2luZG93KSB7XG5cdFx0XHR0YXJnZXRHcm91cCA9IEFVWF9XSU5ET1dfR1JPVVA7XG5cdFx0fSBlbHNlIGlmIChvcHRzLnBhcmVudFZpZXdJZCkge1xuXHRcdFx0dGFyZ2V0R3JvdXAgPSB0aGlzLl9maW5kRWRpdG9yR3JvdXBGb3JWaWV3KG9wdHMucGFyZW50Vmlld0lkKTtcblx0XHRcdGlmICh0YXJnZXRHcm91cCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gSWYgdGhlIHBhcmVudCBpc24ndCBvcGVuLCBkb24ndCBvcGVuIHRoZSBjaGlsZCBlaXRoZXJcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gS2VlcCB0aGUgYnJvd3NlciBkb2NrZWQgaW4gdGhlIG1haW4gZWRpdG9yIGFyZWEgZXZlbiB3aGVuIGVkaXRvcnNcblx0XHRcdC8vIGFyZSBmb3JjZWQgbW9kYWwgdmlhIGB3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsOiAnYWxsJ2AuXG5cdFx0XHR0YXJnZXRHcm91cCA9IGF3YWl0IHRoaXMuZ2V0UHJlZmVycmVkR3JvdXAoKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0aW5hY3RpdmU6IG9wdHMuYmFja2dyb3VuZCxcblx0XHRcdHByZXNlcnZlRm9jdXM6IG9wdHMucHJlc2VydmVGb2N1cyxcblx0XHRcdHBpbm5lZDogb3B0cy5waW5uZWQsXG5cdFx0XHRhdXhpbGlhcnk6IG9wdHMuYXV4aWxpYXJ5V2luZG93XG5cdFx0XHRcdD8geyBib3VuZHM6IG9wdHMuYXV4aWxpYXJ5V2luZG93LCBjb21wYWN0OiB0cnVlIH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdC8vIElmIHRoZSBicm93c2VyIGlzIG9wZW5lZCBieSBhIGNoYXQgc2Vzc2lvbixcblx0XHQvLyBvbmx5IG9wZW4gaW4gdGhlIGZvcmVncm91bmQgaWYgdGhlIHNlc3Npb24ncyB3aWRnZXQgaXMgY3VycmVudGx5IHZpc2libGVcblx0XHQvLyBhbmQgbm90IHRoZSBhY3RpdmUgZWRpdG9yIGluIHRoZSB0YXJnZXQgZ3JvdXAuXG5cdFx0Y29uc3QgW2dyb3VwXSA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmluZEdyb3VwLCB7IGVkaXRvcjogdmlldywgb3B0aW9uczogZWRpdG9yT3B0aW9ucyB9LCB0YXJnZXRHcm91cCk7XG5cdFx0aWYgKG93bmVyLnNlc3Npb25JZCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKG93bmVyLnNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBpc1dpZGdldFZpc2libGUgPSAhIXdpZGdldCAmJiB3aWRnZXQuZG9tTm9kZS5vZmZzZXRQYXJlbnQgIT09IG51bGw7XG5cdFx0XHRjb25zdCBhY3RpdmVJc1NhbWVTZXNzaW9uID0gZ3JvdXAuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0XG5cdFx0XHRcdCYmIGlzRXF1YWwoZ3JvdXAuYWN0aXZlRWRpdG9yLnNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghaXNXaWRnZXRWaXNpYmxlIHx8IGFjdGl2ZUlzU2FtZVNlc3Npb24pIHtcblx0XHRcdFx0ZWRpdG9yT3B0aW9ucy5pbmFjdGl2ZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dm9pZCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih2aWV3LCBlZGl0b3JPcHRpb25zLCBncm91cCk7XG5cdH1cblxuXHQvKipcblx0ICogRmluZCB0aGUgZWRpdG9yIGdyb3VwIHRoYXQgY3VycmVudGx5IGNvbnRhaW5zIGEgYnJvd3NlciB2aWV3IHdpdGggdGhlXG5cdCAqIGdpdmVuIElELCBvciB1bmRlZmluZWQgaWYgbm90IG9wZW4gaW4gYW55IGdyb3VwLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmluZEVkaXRvckdyb3VwRm9yVmlldyh2aWV3SWQ6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5lZGl0b3JzKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9ySW5wdXQgJiYgZWRpdG9yLmlkID09PSB2aWV3SWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZ3JvdXAuaWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVdpbmRvd0NvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0dm9pZCB0aGlzLl9icm93c2VyVmlld1NlcnZpY2UudXBkYXRlV2luZG93Q29uZmlndXJhdGlvbih0aGlzLl9tYWluV2luZG93SWQsIHtcblx0XHRcdHRoZW1lOiB0aGlzLl9nZXRUaGVtZSgpLFxuXHRcdFx0a2V5YmluZGluZ3M6IHRoaXMuX2dldEtleWJpbmRpbmdzKCksXG5cdFx0XHRhaUZlYXR1cmVzRGlzYWJsZWQ6ICF0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQpLFxuXHRcdFx0bWF4SGlzdG9yeUVudHJpZXM6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihCcm93c2VyTWF4SGlzdG9yeUVudHJpZXNTZXR0aW5nSWQpLFxuXHRcdFx0cHJveHlJbmZvOiB0aGlzLl9yZW1vdGVQcm94eUluZm8sXG5cdFx0XHR0cnVzdGVkRmlsZVJvb3RzOiB0aGlzLl9nZXRUcnVzdGVkRmlsZVJvb3RzKCksXG5cdFx0XHR0cnVzdEFsbEZpbGVzOiAhdGhpcy53b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRLZXliaW5kaW5ncygpOiB7IFtjb21tYW5kSWQ6IHN0cmluZ106IHN0cmluZyB9IHtcblx0XHRjb25zdCBrZXliaW5kaW5nczogeyBbY29tbWFuZElkOiBzdHJpbmddOiBzdHJpbmcgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kSWQgb2YgYnJvd3NlclZpZXdDb250ZXh0TWVudUNvbW1hbmRzKSB7XG5cdFx0XHRjb25zdCBiaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRJZCk7XG5cdFx0XHRjb25zdCBhY2NlbGVyYXRvciA9IGJpbmRpbmc/LmdldEVsZWN0cm9uQWNjZWxlcmF0b3IoKTtcblx0XHRcdGlmIChhY2NlbGVyYXRvcikge1xuXHRcdFx0XHRrZXliaW5kaW5nc1tjb21tYW5kSWRdID0gYWNjZWxlcmF0b3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBrZXliaW5kaW5ncztcblx0fVxuXG5cdHByaXZhdGUgX2dldFRoZW1lKCk6IElCcm93c2VyVmlld1RoZW1lIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9jdXNCb3JkZXI6IHRoZW1lLmdldENvbG9yKGZvY3VzQm9yZGVyKT8udG9TdHJpbmcoKSxcblx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKGJ1dHRvbkJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0YnV0dG9uRm9yZWdyb3VuZDogdGhlbWUuZ2V0Q29sb3IoYnV0dG9uRm9yZWdyb3VuZCk/LnRvU3RyaW5nKCksXG5cdFx0XHR3aWRnZXRCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihlZGl0b3JXaWRnZXRCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdHdpZGdldEZvcmVncm91bmQ6IHRoZW1lLmdldENvbG9yKGVkaXRvcldpZGdldEZvcmVncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0d2lkZ2V0Qm9yZGVyOiB0aGVtZS5nZXRDb2xvcihlZGl0b3JXaWRnZXRCb3JkZXIpPy50b1N0cmluZygpLFxuXHRcdFx0d2lkZ2V0U2hhZG93OiB0aGVtZS5nZXRDb2xvcih3aWRnZXRTaGFkb3cpPy50b1N0cmluZygpLFxuXHRcdFx0Y29udHJhc3RCb3JkZXI6IHRoZW1lLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKT8udG9TdHJpbmcoKSxcblx0XHRcdGRlc2NyaXB0aW9uRm9yZWdyb3VuZDogdGhlbWUuZ2V0Q29sb3IoZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdGlucHV0UGxhY2Vob2xkZXJGb3JlZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihpbnB1dFBsYWNlaG9sZGVyRm9yZWdyb3VuZCk/LnRvU3RyaW5nKCksXG5cdFx0XHR0b29sYmFySG92ZXJCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcih0b29sYmFySG92ZXJCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdGZvbnQ6IERFRkFVTFRfRk9OVF9GQU1JTFksXG5cdFx0XHRyZWR1Y2VkTW90aW9uOiB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUcnVzdGVkRmlsZVJvb3RzKCk6IHN0cmluZ1tdIHtcblx0XHQvLyBUcnVzdCBDb3BpbG90IHJvb3RzIHNvIGFnZW50cyBjYW4gY3JlYXRlIEhUTUwgZmlsZXMgYW5kIG9wZW4gdGhlbSBpbiB0aGUgYnJvd3Nlci5cblx0XHRjb25zdCByb290cyA9IG5ldyBTZXQoZ2V0Q29waWxvdFJvb3RQYXRocyh0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgsIHByb2Nlc3MuZW52KSk7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRcdGlmIChmb2xkZXIudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdFx0cm9vdHMuYWRkKGZvbGRlci51cmkuZnNQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VHJ1c3RlZFVyaXMoKSkge1xuXHRcdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0XHRyb290cy5hZGQodXJpLmZzUGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4ucm9vdHNdO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQXNCLHlCQUErSCxpQ0FBaUM7QUFDL0wsU0FBMEQsd0JBQW1JO0FBQzdMLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWMsa0JBQWtCLGdCQUFnQyxZQUFZLGdDQUFvRDtBQUN6SSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxT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
