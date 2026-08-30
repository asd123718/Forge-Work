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
import "./media/chatDebug.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../../browser/parts/editor/editorPane.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { AgentHostAgentDebugLogEnabledSettingId, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from "../../common/promptSyntax/promptTypes.js";
import { IChatWidgetService } from "../chat.js";
import { ViewState, CHAT_DEBUG_ACTIVE_SESSION_IS_AGENT_HOST } from "./chatDebugTypes.js";
import { ChatDebugFilterState, registerFilterMenuItems } from "./chatDebugFilters.js";
import { isAgentHostSession } from "./agentHostLogSources.js";
import { isChatDebugLoggingEnabledForSession, isWireLogLoggingEnabled, renderChatDebugLoggingDisabledMessage, renderWireLogLoggingDisabledMessage } from "./chatDebugEnablement.js";
import { ChatDebugHomeView } from "./chatDebugHomeView.js";
import { ChatDebugOverviewView, OverviewNavigation } from "./chatDebugOverviewView.js";
import { ChatDebugLogsView, LogsNavigation } from "./chatDebugLogsView.js";
import { ChatDebugFlowChartView, FlowChartNavigation } from "./chatDebugFlowChartView.js";
import { ChatDebugCacheExplorerView, CacheExplorerNavigation } from "./chatDebugCacheExplorerView.js";
import { ChatDebugWireLogView, WireLogNavigation } from "./chatDebugWireLogView.js";
const $ = DOM.$;
let ChatDebugEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, chatDebugService, chatWidgetService, chatService, contextKeyService, configurationService, preferencesService) {
    super(ChatDebugEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.chatDebugService = chatDebugService;
    this.chatWidgetService = chatWidgetService;
    this.chatService = chatService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
    this.viewState = ViewState.Home;
    this.disabledOverlayDisposables = this._register(new DisposableStore());
    this.sessionModelListener = this._register(new MutableDisposable());
    this.modelChangeListeners = this._register(new DisposableMap());
  }
  get scopedContextKeyService() {
    return this._scopedContextKeyService;
  }
  /**
   * Stops the streaming pipeline and clears cached events for the
   * active session. Called when navigating away from a session or
   * when the editor becomes hidden.
   */
  endActiveSession() {
    const sessionResource = this.chatDebugService.activeSessionResource;
    if (sessionResource) {
      this.chatDebugService.endSession(sessionResource);
    }
    this.chatDebugService.activeSessionResource = void 0;
    this._activeSessionIsAgentHostContextKey?.set(false);
  }
  createEditor(parent) {
    this.container = DOM.append(parent, $(".chat-debug-editor"));
    this.filterState = this._register(new ChatDebugFilterState());
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    this._scopedContextKeyService = scopedContextKeyService;
    this._activeSessionIsAgentHostContextKey = CHAT_DEBUG_ACTIVE_SESSION_IS_AGENT_HOST.bindTo(scopedContextKeyService);
    this._register(registerFilterMenuItems(this.filterState, scopedContextKeyService));
    this.homeView = this._register(this.instantiationService.createInstance(ChatDebugHomeView, this.container));
    this._register(this.homeView.onNavigateToSession((sessionResource) => {
      this.navigateToSession(sessionResource);
    }));
    this.overviewView = this._register(this.instantiationService.createInstance(ChatDebugOverviewView, this.container));
    this._register(this.overviewView.onNavigate((nav) => {
      switch (nav) {
        case OverviewNavigation.Home:
          this.endActiveSession();
          this.showView(ViewState.Home);
          break;
        case OverviewNavigation.Logs:
          this.showView(ViewState.Logs);
          break;
        case OverviewNavigation.FlowChart:
          this.showView(ViewState.FlowChart);
          break;
        case OverviewNavigation.CacheExplorer:
          this.showView(ViewState.CacheExplorer);
          break;
        case OverviewNavigation.WireLog:
          this.showView(ViewState.WireLog);
          break;
      }
    }));
    this.logsView = this._register(this.instantiationService.createInstance(ChatDebugLogsView, this.container, this.filterState));
    this._register(this.logsView.onNavigate((nav) => {
      switch (nav) {
        case LogsNavigation.Home:
          this.endActiveSession();
          this.showView(ViewState.Home);
          break;
        case LogsNavigation.Overview:
          this.showView(ViewState.Overview);
          break;
      }
    }));
    this.flowChartView = this._register(this.instantiationService.createInstance(ChatDebugFlowChartView, this.container, this.filterState));
    this._register(this.flowChartView.onNavigate((nav) => {
      switch (nav) {
        case FlowChartNavigation.Home:
          this.endActiveSession();
          this.showView(ViewState.Home);
          break;
        case FlowChartNavigation.Overview:
          this.showView(ViewState.Overview);
          break;
      }
    }));
    this.cacheExplorerView = this._register(this.instantiationService.createInstance(ChatDebugCacheExplorerView, this.container));
    this._register(this.cacheExplorerView.onNavigate((nav) => {
      switch (nav) {
        case CacheExplorerNavigation.Home:
          this.endActiveSession();
          this.showView(ViewState.Home);
          break;
        case CacheExplorerNavigation.Overview:
          this.showView(ViewState.Overview);
          break;
      }
    }));
    this.wireLogView = this._register(this.instantiationService.createInstance(ChatDebugWireLogView, this.container));
    this._register(this.wireLogView.onNavigate((nav) => {
      switch (nav) {
        case WireLogNavigation.Home:
          this.endActiveSession();
          this.showView(ViewState.Home);
          break;
        case WireLogNavigation.Overview:
          this.showView(ViewState.Overview);
          break;
      }
    }));
    this._register(this.chatDebugService.onDidAddEvent((event) => {
      if (this.viewState === ViewState.Home) {
        this.homeView?.render();
      } else if (this.chatDebugService.activeSessionResource && event.sessionResource.toString() === this.chatDebugService.activeSessionResource.toString()) {
        if (this.viewState === ViewState.Overview) {
          this.overviewView?.refresh();
        } else if (this.viewState === ViewState.FlowChart) {
          this.flowChartView?.refresh();
        } else if (this.viewState === ViewState.CacheExplorer) {
          this.cacheExplorerView?.refresh();
        } else if (this.viewState === ViewState.WireLog) {
          this.wireLogView?.refresh();
        }
      }
    }));
    this._register(this.chatWidgetService.onDidChangeFocusedSession(() => {
      if (this.viewState === ViewState.Home) {
        this.homeView?.render();
      }
    }));
    this._register(this.chatService.onDidCreateModel((model) => {
      const key = model.sessionResource.toString();
      this.modelChangeListeners.set(key, model.onDidChange((e) => {
        if (e.kind === "setCustomTitle") {
          if (this.viewState === ViewState.Home) {
            this.homeView?.render();
          } else if (this.viewState === ViewState.Overview || this.viewState === ViewState.Logs || this.viewState === ViewState.FlowChart || this.viewState === ViewState.CacheExplorer || this.viewState === ViewState.WireLog) {
            this.overviewView?.updateBreadcrumb();
            this.logsView?.updateBreadcrumb();
            this.flowChartView?.updateBreadcrumb();
            this.cacheExplorerView?.updateBreadcrumb();
            this.wireLogView?.updateBreadcrumb();
          }
        }
      }));
    }));
    this._register(this.chatService.onDidDisposeSession(() => {
      if (this.viewState === ViewState.Home) {
        this.homeView?.render();
      }
    }));
    this.disabledOverlay = DOM.append(this.container, $(".chat-debug-disabled-overlay"));
    DOM.hide(this.disabledOverlay);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AgentHostAgentDebugLogEnabledSettingId) || e.affectsConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING) || e.affectsConfiguration(AgentHostAhpJsonlLoggingSettingId)) {
        this.displayView(this.viewState);
      }
    }));
    this.showView(ViewState.Home);
  }
  // =====================================================================
  // View switching
  // =====================================================================
  showView(state) {
    this.viewState = state;
    this.telemetryService.publicLog2("chatDebugViewSwitched", {
      viewState: state
    });
    this.displayView(state);
  }
  displayView(state) {
    const session = this.chatDebugService.activeSessionResource;
    const dataViewDisabled = (state === ViewState.Logs || state === ViewState.FlowChart || state === ViewState.CacheExplorer) && !isChatDebugLoggingEnabledForSession(this.configurationService, session);
    const wireLogDisabled = state === ViewState.WireLog && isAgentHostSession(session) && !isWireLogLoggingEnabled(this.configurationService);
    if (state === ViewState.Home) {
      this.homeView?.show();
    } else {
      this.homeView?.hide();
    }
    if (state === ViewState.Overview) {
      this.overviewView?.show();
    } else {
      this.overviewView?.hide();
    }
    if (state === ViewState.Logs && !dataViewDisabled) {
      this.logsView?.show();
      this.doLayout();
      this.logsView?.focus();
    } else {
      this.logsView?.hide();
    }
    if (state === ViewState.FlowChart && !dataViewDisabled) {
      this.flowChartView?.show();
    } else {
      this.flowChartView?.hide();
    }
    if (state === ViewState.CacheExplorer && !dataViewDisabled) {
      this.cacheExplorerView?.show();
    } else {
      this.cacheExplorerView?.hide();
    }
    if (state === ViewState.WireLog && !wireLogDisabled) {
      this.wireLogView?.show();
      this.doLayout();
    } else {
      this.wireLogView?.hide();
    }
    this.updateDisabledOverlay(wireLogDisabled ? "wirelog" : dataViewDisabled ? "data" : void 0);
  }
  updateDisabledOverlay(kind) {
    if (!this.disabledOverlay) {
      return;
    }
    this.disabledOverlayDisposables.clear();
    DOM.clearNode(this.disabledOverlay);
    if (kind === "wirelog") {
      renderWireLogLoggingDisabledMessage(this.disabledOverlay, this.preferencesService, this.disabledOverlayDisposables);
      DOM.show(this.disabledOverlay);
    } else if (kind === "data") {
      renderChatDebugLoggingDisabledMessage(this.disabledOverlay, this.chatDebugService.activeSessionResource, this.preferencesService, this.disabledOverlayDisposables);
      DOM.show(this.disabledOverlay);
    } else {
      DOM.hide(this.disabledOverlay);
    }
  }
  navigateToSession(sessionResource, view) {
    const previousSessionResource = this.chatDebugService.activeSessionResource;
    if (previousSessionResource && previousSessionResource.toString() !== sessionResource.toString()) {
      this.chatDebugService.endSession(previousSessionResource);
    }
    this.chatDebugService.activeSessionResource = sessionResource;
    this._activeSessionIsAgentHostContextKey?.set(isAgentHostSession(sessionResource));
    if (!this.chatDebugService.hasInvokedProviders(sessionResource)) {
      this.chatDebugService.invokeProviders(sessionResource);
    }
    this.trackSessionModelChanges(sessionResource);
    this.overviewView?.setSession(sessionResource);
    this.logsView?.setSession(sessionResource);
    this.flowChartView?.setSession(sessionResource);
    this.cacheExplorerView?.setSession(sessionResource);
    this.wireLogView?.setSession(sessionResource);
    const targetState = view === "logs" ? ViewState.Logs : view === "flowchart" ? ViewState.FlowChart : view === "cache" ? ViewState.CacheExplorer : view === "wirelog" ? ViewState.WireLog : ViewState.Overview;
    this.showView(targetState);
  }
  trackSessionModelChanges(sessionResource) {
    const model = this.chatService.getSession(sessionResource);
    if (!model) {
      this.sessionModelListener.clear();
      return;
    }
    this.sessionModelListener.value = model.onDidChange((e) => {
      if (e.kind === "addRequest" || e.kind === "completedRequest") {
        if (this.viewState === ViewState.Overview) {
          this.overviewView?.refresh();
        }
      }
    });
  }
  // =====================================================================
  // EditorPane overrides
  // =====================================================================
  focus() {
    if (this.viewState === ViewState.Logs) {
      this.logsView?.focus();
    } else {
      this.container?.focus();
    }
  }
  clearInput() {
    this.endActiveSession();
    super.clearInput();
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (options) {
      this._applyNavigationOptions(options);
    }
  }
  setOptions(options) {
    super.setOptions(options);
    if (options) {
      this._applyNavigationOptions(options);
    }
  }
  /**
   * The panel is enabled when either local file logging or agent-host (Copilot
   * CLI) debug logging is on. Each provider self-gates on its own setting, so
   * this only decides whether to fall back to the home view.
   */
  _isDebugEnabled() {
    return this.configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING) || this.configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId);
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    if (visible) {
      this.telemetryService.publicLog2("chatDebugPanelOpened");
      if (!this._isDebugEnabled()) {
        this.endActiveSession();
        this.showView(ViewState.Home);
        return;
      }
      this.showView(this.viewState);
    }
  }
  _applyNavigationOptions(options) {
    if (!this._isDebugEnabled()) {
      this.endActiveSession();
      this.showView(ViewState.Home);
      return;
    }
    const { sessionResource, viewHint, filter } = options;
    if (viewHint === "logs" && sessionResource) {
      this.navigateToSession(sessionResource, "logs");
    } else if (viewHint === "flowchart" && sessionResource) {
      this.navigateToSession(sessionResource, "flowchart");
    } else if (viewHint === "cache" && sessionResource) {
      this.navigateToSession(sessionResource, "cache");
    } else if (viewHint === "overview" && sessionResource) {
      this.navigateToSession(sessionResource, "overview");
    } else if (viewHint === "wirelog" && sessionResource) {
      this.navigateToSession(sessionResource, "wirelog");
    } else if (viewHint === "home") {
      this.endActiveSession();
      this.showView(ViewState.Home);
    } else if (sessionResource) {
      this.navigateToSession(sessionResource, "overview");
    } else if (this.viewState === ViewState.Home) {
      this.showView(ViewState.Home);
    }
    if (filter !== void 0 && this.filterState) {
      this.filterState.setTextFilter(filter);
      this.logsView?.setFilterText(filter);
    }
  }
  layout(dimension) {
    this.currentDimension = dimension;
    if (this.container) {
      this.container.style.width = `${dimension.width}px`;
      this.container.style.height = `${dimension.height}px`;
    }
    this.doLayout();
  }
  doLayout() {
    if (!this.currentDimension) {
      return;
    }
    if (this.viewState === ViewState.Logs) {
      this.logsView?.layout(this.currentDimension);
    } else if (this.viewState === ViewState.WireLog) {
      this.wireLogView?.layout();
    }
  }
};
ChatDebugEditor.ID = "workbench.editor.chatDebug";
ChatDebugEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IChatDebugService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, IChatService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IPreferencesService)
], ChatDebugEditor);
export {
  ChatDebugEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXREZWJ1Zy5jc3MnO1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFocEpzb25sTG9nZ2luZ1NldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBZ2VudERlYnVnTG9nRW5hYmxlZFNldHRpbmdJZCwgQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgVmlld1N0YXRlLCBJQ2hhdERlYnVnRWRpdG9yT3B0aW9ucywgQ0hBVF9ERUJVR19BQ1RJVkVfU0VTU0lPTl9JU19BR0VOVF9IT1NUIH0gZnJvbSAnLi9jaGF0RGVidWdUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdGaWx0ZXJTdGF0ZSwgcmVnaXN0ZXJGaWx0ZXJNZW51SXRlbXMgfSBmcm9tICcuL2NoYXREZWJ1Z0ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RTZXNzaW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RMb2dTb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzQ2hhdERlYnVnTG9nZ2luZ0VuYWJsZWRGb3JTZXNzaW9uLCBpc1dpcmVMb2dMb2dnaW5nRW5hYmxlZCwgcmVuZGVyQ2hhdERlYnVnTG9nZ2luZ0Rpc2FibGVkTWVzc2FnZSwgcmVuZGVyV2lyZUxvZ0xvZ2dpbmdEaXNhYmxlZE1lc3NhZ2UgfSBmcm9tICcuL2NoYXREZWJ1Z0VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnSG9tZVZpZXcgfSBmcm9tICcuL2NoYXREZWJ1Z0hvbWVWaWV3LmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z092ZXJ2aWV3VmlldywgT3ZlcnZpZXdOYXZpZ2F0aW9uIH0gZnJvbSAnLi9jaGF0RGVidWdPdmVydmlld1ZpZXcuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnTG9nc1ZpZXcsIExvZ3NOYXZpZ2F0aW9uIH0gZnJvbSAnLi9jaGF0RGVidWdMb2dzVmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdGbG93Q2hhcnRWaWV3LCBGbG93Q2hhcnROYXZpZ2F0aW9uIH0gZnJvbSAnLi9jaGF0RGVidWdGbG93Q2hhcnRWaWV3LmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0NhY2hlRXhwbG9yZXJWaWV3LCBDYWNoZUV4cGxvcmVyTmF2aWdhdGlvbiB9IGZyb20gJy4vY2hhdERlYnVnQ2FjaGVFeHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnV2lyZUxvZ1ZpZXcsIFdpcmVMb2dOYXZpZ2F0aW9uIH0gZnJvbSAnLi9jaGF0RGVidWdXaXJlTG9nVmlldy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxudHlwZSBDaGF0RGVidWdQYW5lbE9wZW5lZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3ZpamF5dSc7XG5cdGNvbW1lbnQ6ICdFdmVudCBmaXJlZCB3aGVuIHRoZSBhZ2VudCBkZWJ1ZyBsb2dzIHBhbmVsIGlzIG9wZW5lZCc7XG59O1xuXG50eXBlIENoYXREZWJ1Z1ZpZXdTd2l0Y2hlZEV2ZW50ID0ge1xuXHR2aWV3U3RhdGU6IHN0cmluZztcbn07XG5cbnR5cGUgQ2hhdERlYnVnVmlld1N3aXRjaGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdHZpZXdTdGF0ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB2aWV3IHRoZSB1c2VyIG5hdmlnYXRlZCB0byAoaG9tZSwgb3ZlcnZpZXcsIGxvZ3MsIGZsb3djaGFydCwgY2FjaGUpLicgfTtcblx0b3duZXI6ICd2aWpheXUnO1xuXHRjb21tZW50OiAnVHJhY2tzIHdoaWNoIHZpZXdzIHVzZXJzIG5hdmlnYXRlIHRvIGluIHRoZSBBZ2VudCBEZWJ1ZyBMb2dzLic7XG59O1xuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci5jaGF0RGVidWcnO1xuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB2aWV3U3RhdGU6IFZpZXdTdGF0ZSA9IFZpZXdTdGF0ZS5Ib21lO1xuXG5cdHByaXZhdGUgaG9tZVZpZXc6IENoYXREZWJ1Z0hvbWVWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG92ZXJ2aWV3VmlldzogQ2hhdERlYnVnT3ZlcnZpZXdWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxvZ3NWaWV3OiBDaGF0RGVidWdMb2dzVmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmbG93Q2hhcnRWaWV3OiBDaGF0RGVidWdGbG93Q2hhcnRWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhY2hlRXhwbG9yZXJWaWV3OiBDaGF0RGVidWdDYWNoZUV4cGxvcmVyVmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3aXJlTG9nVmlldzogQ2hhdERlYnVnV2lyZUxvZ1ZpZXcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmlsdGVyU3RhdGU6IENoYXREZWJ1Z0ZpbHRlclN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVNlc3Npb25Jc0FnZW50SG9zdENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTaGFyZWQgb3ZlcmxheSBzaG93biBpbiBwbGFjZSBvZiBhIHNlc3Npb24gc3ViLXZpZXcgKExvZ3MsIEZsb3cgQ2hhcnQsXG5cdCAqIENhY2hlIEV4cGxvcmVyKSB3aGVuIGFnZW50IGRlYnVnIGxvZ2dpbmcgaXMgZGlzYWJsZWQgZm9yIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBkaXNhYmxlZE92ZXJsYXk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc2FibGVkT3ZlcmxheURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRvdmVycmlkZSBnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25Nb2RlbExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsQ2hhbmdlTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblxuXHQvKipcblx0ICogU3RvcHMgdGhlIHN0cmVhbWluZyBwaXBlbGluZSBhbmQgY2xlYXJzIGNhY2hlZCBldmVudHMgZm9yIHRoZVxuXHQgKiBhY3RpdmUgc2Vzc2lvbi4gQ2FsbGVkIHdoZW4gbmF2aWdhdGluZyBhd2F5IGZyb20gYSBzZXNzaW9uIG9yXG5cdCAqIHdoZW4gdGhlIGVkaXRvciBiZWNvbWVzIGhpZGRlbi5cblx0ICovXG5cdHByaXZhdGUgZW5kQWN0aXZlU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlO1xuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuY2hhdERlYnVnU2VydmljZS5lbmRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHRoaXMuY2hhdERlYnVnU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbklzQWdlbnRIb3N0Q29udGV4dEtleT8uc2V0KGZhbHNlKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKENoYXREZWJ1Z0VkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmNoYXQtZGVidWctZWRpdG9yJykpO1xuXG5cdFx0Ly8gU2hhcmVkIGZpbHRlciBzdGF0ZSB1c2VkIGJ5IGJvdGggTG9ncyBhbmQgRmxvd0NoYXJ0IHZpZXdzXG5cdFx0dGhpcy5maWx0ZXJTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGF0RGVidWdGaWx0ZXJTdGF0ZSgpKTtcblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuY29udGFpbmVyKSk7XG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSBzY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uSXNBZ2VudEhvc3RDb250ZXh0S2V5ID0gQ0hBVF9ERUJVR19BQ1RJVkVfU0VTU0lPTl9JU19BR0VOVF9IT1NULmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJGaWx0ZXJNZW51SXRlbXModGhpcy5maWx0ZXJTdGF0ZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRcdC8vIENyZWF0ZSBzdWItdmlld3MgdmlhIERJXG5cdFx0dGhpcy5ob21lVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdERlYnVnSG9tZVZpZXcsIHRoaXMuY29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob21lVmlldy5vbk5hdmlnYXRlVG9TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSA9PiB7XG5cdFx0XHR0aGlzLm5hdmlnYXRlVG9TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5vdmVydmlld1ZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXREZWJ1Z092ZXJ2aWV3VmlldywgdGhpcy5jb250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm92ZXJ2aWV3Vmlldy5vbk5hdmlnYXRlKG5hdiA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5hdikge1xuXHRcdFx0XHRjYXNlIE92ZXJ2aWV3TmF2aWdhdGlvbi5Ib21lOlxuXHRcdFx0XHRcdHRoaXMuZW5kQWN0aXZlU2Vzc2lvbigpO1xuXHRcdFx0XHRcdHRoaXMuc2hvd1ZpZXcoVmlld1N0YXRlLkhvbWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE92ZXJ2aWV3TmF2aWdhdGlvbi5Mb2dzOlxuXHRcdFx0XHRcdHRoaXMuc2hvd1ZpZXcoVmlld1N0YXRlLkxvZ3MpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE92ZXJ2aWV3TmF2aWdhdGlvbi5GbG93Q2hhcnQ6XG5cdFx0XHRcdFx0dGhpcy5zaG93VmlldyhWaWV3U3RhdGUuRmxvd0NoYXJ0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdmVydmlld05hdmlnYXRpb24uQ2FjaGVFeHBsb3Jlcjpcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5DYWNoZUV4cGxvcmVyKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdmVydmlld05hdmlnYXRpb24uV2lyZUxvZzpcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5XaXJlTG9nKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmxvZ3NWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RGVidWdMb2dzVmlldywgdGhpcy5jb250YWluZXIsIHRoaXMuZmlsdGVyU3RhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxvZ3NWaWV3Lm9uTmF2aWdhdGUobmF2ID0+IHtcblx0XHRcdHN3aXRjaCAobmF2KSB7XG5cdFx0XHRcdGNhc2UgTG9nc05hdmlnYXRpb24uSG9tZTpcblx0XHRcdFx0XHR0aGlzLmVuZEFjdGl2ZVNlc3Npb24oKTtcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5Ib21lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBMb2dzTmF2aWdhdGlvbi5PdmVydmlldzpcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5PdmVydmlldyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5mbG93Q2hhcnRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RGVidWdGbG93Q2hhcnRWaWV3LCB0aGlzLmNvbnRhaW5lciwgdGhpcy5maWx0ZXJTdGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmxvd0NoYXJ0Vmlldy5vbk5hdmlnYXRlKG5hdiA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5hdikge1xuXHRcdFx0XHRjYXNlIEZsb3dDaGFydE5hdmlnYXRpb24uSG9tZTpcblx0XHRcdFx0XHR0aGlzLmVuZEFjdGl2ZVNlc3Npb24oKTtcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5Ib21lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBGbG93Q2hhcnROYXZpZ2F0aW9uLk92ZXJ2aWV3OlxuXHRcdFx0XHRcdHRoaXMuc2hvd1ZpZXcoVmlld1N0YXRlLk92ZXJ2aWV3KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNhY2hlRXhwbG9yZXJWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RGVidWdDYWNoZUV4cGxvcmVyVmlldywgdGhpcy5jb250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNhY2hlRXhwbG9yZXJWaWV3Lm9uTmF2aWdhdGUobmF2ID0+IHtcblx0XHRcdHN3aXRjaCAobmF2KSB7XG5cdFx0XHRcdGNhc2UgQ2FjaGVFeHBsb3Jlck5hdmlnYXRpb24uSG9tZTpcblx0XHRcdFx0XHR0aGlzLmVuZEFjdGl2ZVNlc3Npb24oKTtcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5Ib21lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDYWNoZUV4cGxvcmVyTmF2aWdhdGlvbi5PdmVydmlldzpcblx0XHRcdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5PdmVydmlldyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy53aXJlTG9nVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdERlYnVnV2lyZUxvZ1ZpZXcsIHRoaXMuY29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aXJlTG9nVmlldy5vbk5hdmlnYXRlKG5hdiA9PiB7XG5cdFx0XHRzd2l0Y2ggKG5hdikge1xuXHRcdFx0XHRjYXNlIFdpcmVMb2dOYXZpZ2F0aW9uLkhvbWU6XG5cdFx0XHRcdFx0dGhpcy5lbmRBY3RpdmVTZXNzaW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5zaG93VmlldyhWaWV3U3RhdGUuSG9tZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgV2lyZUxvZ05hdmlnYXRpb24uT3ZlcnZpZXc6XG5cdFx0XHRcdFx0dGhpcy5zaG93VmlldyhWaWV3U3RhdGUuT3ZlcnZpZXcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gbmV3IGRlYnVnIGV2ZW50cyBhcnJpdmUsIHJlZnJlc2ggdGhlIGFjdGl2ZSBzZXNzaW9uIHZpZXdcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXREZWJ1Z1NlcnZpY2Uub25EaWRBZGRFdmVudChldmVudCA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5Ib21lKSB7XG5cdFx0XHRcdHRoaXMuaG9tZVZpZXc/LnJlbmRlcigpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlICYmIGV2ZW50LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSB0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0aWYgKHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuT3ZlcnZpZXcpIHtcblx0XHRcdFx0XHR0aGlzLm92ZXJ2aWV3Vmlldz8ucmVmcmVzaCgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuRmxvd0NoYXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5mbG93Q2hhcnRWaWV3Py5yZWZyZXNoKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5DYWNoZUV4cGxvcmVyKSB7XG5cdFx0XHRcdFx0dGhpcy5jYWNoZUV4cGxvcmVyVmlldz8ucmVmcmVzaCgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuV2lyZUxvZykge1xuXHRcdFx0XHRcdHRoaXMud2lyZUxvZ1ZpZXc/LnJlZnJlc2goKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBOb3RlOiBMb2dzIHZpZXcgaXMgaW50ZW50aW9uYWxseSBvbWl0dGVkIGhlcmUgXHUyMDE0IGl0IGhhbmRsZXNcblx0XHRcdFx0Ly8gb25EaWRBZGRFdmVudCBpbnRlcm5hbGx5IHZpYSBsb2FkRXZlbnRzKCkgXHUyMTkyIGFkZEV2ZW50KCkgXHUyMTkyXG5cdFx0XHRcdC8vIHNjaGVkdWxlUmVmcmVzaCgpIHRvIGF2b2lkIGEgcmVkdW5kYW50IGZ1bGwgcmVmcmVzaC5cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIHRoZSBmb2N1c2VkIGNoYXQgd2lkZ2V0IGNoYW5nZXMsIHJlZnJlc2ggaG9tZSB2aWV3IHNlc3Npb24gbGlzdFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5Ib21lKSB7XG5cdFx0XHRcdHRoaXMuaG9tZVZpZXc/LnJlbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRDcmVhdGVNb2RlbChtb2RlbCA9PiB7XG5cdFx0XHQvLyBUcmFjayB0aXRsZSBjaGFuZ2VzIHBlciBtb2RlbCwgZGlzcG9zaW5nIHRoZSBwcmV2aW91cyBsaXN0ZW5lclxuXHRcdFx0Ly8gZm9yIHRoZSBzYW1lIG1vZGVsIFVSSSB0byBhdm9pZCBsZWFrcy5cblx0XHRcdGNvbnN0IGtleSA9IG1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0dGhpcy5tb2RlbENoYW5nZUxpc3RlbmVycy5zZXQoa2V5LCBtb2RlbC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdFx0aWYgKGUua2luZCA9PT0gJ3NldEN1c3RvbVRpdGxlJykge1xuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXdTdGF0ZSA9PT0gVmlld1N0YXRlLkhvbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuaG9tZVZpZXc/LnJlbmRlcigpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5PdmVydmlldyB8fCB0aGlzLnZpZXdTdGF0ZSA9PT0gVmlld1N0YXRlLkxvZ3MgfHwgdGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5GbG93Q2hhcnQgfHwgdGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5DYWNoZUV4cGxvcmVyIHx8IHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuV2lyZUxvZykge1xuXHRcdFx0XHRcdFx0dGhpcy5vdmVydmlld1ZpZXc/LnVwZGF0ZUJyZWFkY3J1bWIoKTtcblx0XHRcdFx0XHRcdHRoaXMubG9nc1ZpZXc/LnVwZGF0ZUJyZWFkY3J1bWIoKTtcblx0XHRcdFx0XHRcdHRoaXMuZmxvd0NoYXJ0Vmlldz8udXBkYXRlQnJlYWRjcnVtYigpO1xuXHRcdFx0XHRcdFx0dGhpcy5jYWNoZUV4cGxvcmVyVmlldz8udXBkYXRlQnJlYWRjcnVtYigpO1xuXHRcdFx0XHRcdFx0dGhpcy53aXJlTG9nVmlldz8udXBkYXRlQnJlYWRjcnVtYigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5Ib21lKSB7XG5cdFx0XHRcdHRoaXMuaG9tZVZpZXc/LnJlbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNoYXJlZCBvdmVybGF5IHNob3duIHdoZW4gYWdlbnQgZGVidWcgbG9nZ2luZyBpcyBkaXNhYmxlZCBmb3IgdGhlXG5cdFx0Ly8gY3VycmVudCBzZXNzaW9uLiBBcHBlbmRlZCBsYXN0IHNvIGl0IHN0YWNrcyBhYm92ZSB0aGUgc3ViLXZpZXdzLlxuXHRcdHRoaXMuZGlzYWJsZWRPdmVybGF5ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLmNoYXQtZGVidWctZGlzYWJsZWQtb3ZlcmxheScpKTtcblx0XHRET00uaGlkZSh0aGlzLmRpc2FibGVkT3ZlcmxheSk7XG5cblx0XHQvLyBSZS1ldmFsdWF0ZSB0aGUgYWN0aXZlIHZpZXcgd2hlbiBhbiBlbmFibGVtZW50IHNldHRpbmcgY2hhbmdlcyBzbyB0aGVcblx0XHQvLyBkaXNhYmxlZCBtZXNzYWdlIGFwcGVhcnMvZGlzYXBwZWFycyB3aXRob3V0IG5lZWRpbmcgdG8gcmUtbmF2aWdhdGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBZ2VudEhvc3RBZ2VudERlYnVnTG9nRW5hYmxlZFNldHRpbmdJZClcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORylcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuZGlzcGxheVZpZXcodGhpcy52aWV3U3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2hvd1ZpZXcoVmlld1N0YXRlLkhvbWUpO1xuXHR9XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIFZpZXcgc3dpdGNoaW5nXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgc2hvd1ZpZXcoc3RhdGU6IFZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMudmlld1N0YXRlID0gc3RhdGU7XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0RGVidWdWaWV3U3dpdGNoZWRFdmVudCwgQ2hhdERlYnVnVmlld1N3aXRjaGVkQ2xhc3NpZmljYXRpb24+KCdjaGF0RGVidWdWaWV3U3dpdGNoZWQnLCB7XG5cdFx0XHR2aWV3U3RhdGU6IHN0YXRlLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5kaXNwbGF5VmlldyhzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlWaWV3KHN0YXRlOiBWaWV3U3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5jaGF0RGVidWdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZTtcblxuXHRcdC8vIFRoZSBkYXRhIHN1Yi12aWV3cyAoTG9ncywgRmxvdyBDaGFydCwgQ2FjaGUgRXhwbG9yZXIpIGFyZSBnYXRlZCBvbiB0aGVcblx0XHQvLyBhZ2VudCBkZWJ1ZyBsb2dnaW5nIHNldHRpbmc7IHRoZSBBSFAgKHdpcmUpIGxvZyBpcyBnYXRlZCBvbiBpdHMgb3duXG5cdFx0Ly8gQUhQIGxvZ2dpbmcgc2V0dGluZy4gV2hlbiB0aGUgZ292ZXJuaW5nIHNldHRpbmcgaXMgb2ZmIHRoZXJlIGlzXG5cdFx0Ly8gbm90aGluZyB0byBzaG93LCBzbyB3ZSByZW5kZXIgYSBzaGFyZWQgXCJlbmFibGUgdGhlIHNldHRpbmdcIiBvdmVybGF5XG5cdFx0Ly8gaW5zdGVhZCBvZiB0aGUgKGVtcHR5KSB2aWV3IGNvbnRlbnQuIFRoZSBPdmVydmlldyBrZWVwcyBpdHMgYnV0dG9uc1xuXHRcdC8vIGFuZCByZW5kZXJzIHRoZSBoaW50IGlubGluZS5cblx0XHRjb25zdCBkYXRhVmlld0Rpc2FibGVkID0gKHN0YXRlID09PSBWaWV3U3RhdGUuTG9ncyB8fCBzdGF0ZSA9PT0gVmlld1N0YXRlLkZsb3dDaGFydCB8fCBzdGF0ZSA9PT0gVmlld1N0YXRlLkNhY2hlRXhwbG9yZXIpXG5cdFx0XHQmJiAhaXNDaGF0RGVidWdMb2dnaW5nRW5hYmxlZEZvclNlc3Npb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgc2Vzc2lvbik7XG5cdFx0Y29uc3Qgd2lyZUxvZ0Rpc2FibGVkID0gc3RhdGUgPT09IFZpZXdTdGF0ZS5XaXJlTG9nXG5cdFx0XHQmJiBpc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvbilcblx0XHRcdCYmICFpc1dpcmVMb2dMb2dnaW5nRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGlmIChzdGF0ZSA9PT0gVmlld1N0YXRlLkhvbWUpIHtcblx0XHRcdHRoaXMuaG9tZVZpZXc/LnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ob21lVmlldz8uaGlkZSgpO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ZSA9PT0gVmlld1N0YXRlLk92ZXJ2aWV3KSB7XG5cdFx0XHR0aGlzLm92ZXJ2aWV3Vmlldz8uc2hvdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm92ZXJ2aWV3Vmlldz8uaGlkZSgpO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ZSA9PT0gVmlld1N0YXRlLkxvZ3MgJiYgIWRhdGFWaWV3RGlzYWJsZWQpIHtcblx0XHRcdHRoaXMubG9nc1ZpZXc/LnNob3coKTtcblx0XHRcdHRoaXMuZG9MYXlvdXQoKTtcblx0XHRcdHRoaXMubG9nc1ZpZXc/LmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nc1ZpZXc/LmhpZGUoKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUgPT09IFZpZXdTdGF0ZS5GbG93Q2hhcnQgJiYgIWRhdGFWaWV3RGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuZmxvd0NoYXJ0Vmlldz8uc2hvdygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZsb3dDaGFydFZpZXc/LmhpZGUoKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUgPT09IFZpZXdTdGF0ZS5DYWNoZUV4cGxvcmVyICYmICFkYXRhVmlld0Rpc2FibGVkKSB7XG5cdFx0XHR0aGlzLmNhY2hlRXhwbG9yZXJWaWV3Py5zaG93KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2FjaGVFeHBsb3JlclZpZXc/LmhpZGUoKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUgPT09IFZpZXdTdGF0ZS5XaXJlTG9nICYmICF3aXJlTG9nRGlzYWJsZWQpIHtcblx0XHRcdHRoaXMud2lyZUxvZ1ZpZXc/LnNob3coKTtcblx0XHRcdHRoaXMuZG9MYXlvdXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53aXJlTG9nVmlldz8uaGlkZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRGlzYWJsZWRPdmVybGF5KHdpcmVMb2dEaXNhYmxlZCA/ICd3aXJlbG9nJyA6IGRhdGFWaWV3RGlzYWJsZWQgPyAnZGF0YScgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEaXNhYmxlZE92ZXJsYXkoa2luZDogJ2RhdGEnIHwgJ3dpcmVsb2cnIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmRpc2FibGVkT3ZlcmxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRpc2FibGVkT3ZlcmxheURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmRpc2FibGVkT3ZlcmxheSk7XG5cdFx0aWYgKGtpbmQgPT09ICd3aXJlbG9nJykge1xuXHRcdFx0cmVuZGVyV2lyZUxvZ0xvZ2dpbmdEaXNhYmxlZE1lc3NhZ2UodGhpcy5kaXNhYmxlZE92ZXJsYXksIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLCB0aGlzLmRpc2FibGVkT3ZlcmxheURpc3Bvc2FibGVzKTtcblx0XHRcdERPTS5zaG93KHRoaXMuZGlzYWJsZWRPdmVybGF5KTtcblx0XHR9IGVsc2UgaWYgKGtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0cmVuZGVyQ2hhdERlYnVnTG9nZ2luZ0Rpc2FibGVkTWVzc2FnZSh0aGlzLmRpc2FibGVkT3ZlcmxheSwgdGhpcy5jaGF0RGVidWdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZSwgdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2UsIHRoaXMuZGlzYWJsZWRPdmVybGF5RGlzcG9zYWJsZXMpO1xuXHRcdFx0RE9NLnNob3codGhpcy5kaXNhYmxlZE92ZXJsYXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRET00uaGlkZSh0aGlzLmRpc2FibGVkT3ZlcmxheSk7XG5cdFx0fVxuXHR9XG5cblx0bmF2aWdhdGVUb1Nlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIHZpZXc/OiAnbG9ncycgfCAnb3ZlcnZpZXcnIHwgJ2Zsb3djaGFydCcgfCAnY2FjaGUnIHwgJ3dpcmVsb2cnKTogdm9pZCB7XG5cdFx0Ly8gRW5kIHRoZSBwcmV2aW91cyBzZXNzaW9uJ3Mgc3RyZWFtaW5nIHBpcGVsaW5lIGJlZm9yZSBzd2l0Y2hpbmdcblx0XHRjb25zdCBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZSA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKHByZXZpb3VzU2Vzc2lvblJlc291cmNlICYmIHByZXZpb3VzU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgIT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHR0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZW5kU2Vzc2lvbihwcmV2aW91c1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGF0RGVidWdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uSXNBZ2VudEhvc3RDb250ZXh0S2V5Py5zZXQoaXNBZ2VudEhvc3RTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGlmICghdGhpcy5jaGF0RGVidWdTZXJ2aWNlLmhhc0ludm9rZWRQcm92aWRlcnMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5jaGF0RGVidWdTZXJ2aWNlLmludm9rZVByb3ZpZGVycyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHR0aGlzLnRyYWNrU2Vzc2lvbk1vZGVsQ2hhbmdlcyhzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0dGhpcy5vdmVydmlld1ZpZXc/LnNldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLmxvZ3NWaWV3Py5zZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5mbG93Q2hhcnRWaWV3Py5zZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5jYWNoZUV4cGxvcmVyVmlldz8uc2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMud2lyZUxvZ1ZpZXc/LnNldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdGNvbnN0IHRhcmdldFN0YXRlID0gdmlldyA9PT0gJ2xvZ3MnID8gVmlld1N0YXRlLkxvZ3Ncblx0XHRcdDogdmlldyA9PT0gJ2Zsb3djaGFydCcgPyBWaWV3U3RhdGUuRmxvd0NoYXJ0XG5cdFx0XHRcdDogdmlldyA9PT0gJ2NhY2hlJyA/IFZpZXdTdGF0ZS5DYWNoZUV4cGxvcmVyXG5cdFx0XHRcdFx0OiB2aWV3ID09PSAnd2lyZWxvZycgPyBWaWV3U3RhdGUuV2lyZUxvZ1xuXHRcdFx0XHRcdFx0OiBWaWV3U3RhdGUuT3ZlcnZpZXc7XG5cdFx0dGhpcy5zaG93Vmlldyh0YXJnZXRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNrU2Vzc2lvbk1vZGVsQ2hhbmdlcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5zZXNzaW9uTW9kZWxMaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNlc3Npb25Nb2RlbExpc3RlbmVyLnZhbHVlID0gbW9kZWwub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAnYWRkUmVxdWVzdCcgfHwgZS5raW5kID09PSAnY29tcGxldGVkUmVxdWVzdCcpIHtcblx0XHRcdFx0aWYgKHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuT3ZlcnZpZXcpIHtcblx0XHRcdFx0XHR0aGlzLm92ZXJ2aWV3Vmlldz8ucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gRWRpdG9yUGFuZSBvdmVycmlkZXNcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuTG9ncykge1xuXHRcdFx0dGhpcy5sb2dzVmlldz8uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250YWluZXI/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHQvLyBUZWFyIGRvd24gdGhlIGFjdGl2ZSBzZXNzaW9uJ3Mgc3RyZWFtaW5nIHBpcGVsaW5lIGFuZCBsaXZlIGZpbGVcblx0XHQvLyB3YXRjaGVyIHdoZW4gdGhlIGVkaXRvciBpbnB1dCBpcyByZW1vdmVkICh0YWIgY2xvc2VkIG9yIHJlcGxhY2VkKSxcblx0XHQvLyBzbyBub3RoaW5nIGtlZXBzIHJlYWRpbmcgdGhlIHNlc3Npb24ncyBldmVudHMuanNvbmwgaW4gdGhlXG5cdFx0Ly8gYmFja2dyb3VuZCB3aGlsZSB0aGUgcGFuZWwgaXMgbm90IG9wZW4uIFJlLW9wZW5pbmcgdGhlIGVkaXRvciBydW5zXG5cdFx0Ly8gc2V0SW5wdXQgXHUyMTkyIF9hcHBseU5hdmlnYXRpb25PcHRpb25zIFx1MjE5MiBuYXZpZ2F0ZVRvU2Vzc2lvbiwgd2hpY2hcblx0XHQvLyByZS1pbnZva2VzIHByb3ZpZGVycyBhbmQgcmUtYXJtcyB0aGUgd2F0Y2hlci5cblx0XHR0aGlzLmVuZEFjdGl2ZVNlc3Npb24oKTtcblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdHRoaXMuX2FwcGx5TmF2aWdhdGlvbk9wdGlvbnMob3B0aW9ucyBhcyBJQ2hhdERlYnVnRWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0T3B0aW9ucyhvcHRpb25zOiBJQ2hhdERlYnVnRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdHRoaXMuX2FwcGx5TmF2aWdhdGlvbk9wdGlvbnMob3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBwYW5lbCBpcyBlbmFibGVkIHdoZW4gZWl0aGVyIGxvY2FsIGZpbGUgbG9nZ2luZyBvciBhZ2VudC1ob3N0IChDb3BpbG90XG5cdCAqIENMSSkgZGVidWcgbG9nZ2luZyBpcyBvbi4gRWFjaCBwcm92aWRlciBzZWxmLWdhdGVzIG9uIGl0cyBvd24gc2V0dGluZywgc29cblx0ICogdGhpcyBvbmx5IGRlY2lkZXMgd2hldGhlciB0byBmYWxsIGJhY2sgdG8gdGhlIGhvbWUgdmlldy5cblx0ICovXG5cdHByaXZhdGUgX2lzRGVidWdFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFHRU5UX0RFQlVHX0xPR19GSUxFX0xPR0dJTkdfRU5BQkxFRF9TRVRUSU5HKVxuXHRcdFx0fHwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBZ2VudERlYnVnTG9nRW5hYmxlZFNldHRpbmdJZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIENoYXREZWJ1Z1BhbmVsT3BlbmVkQ2xhc3NpZmljYXRpb24+KCdjaGF0RGVidWdQYW5lbE9wZW5lZCcpO1xuXHRcdFx0Ly8gSWYgZGVidWcgbG9nZ2luZyBpcyBkaXNhYmxlZCwgYWx3YXlzIHJlc2V0IHRvIHRoZSBob21lIHZpZXdcblx0XHRcdGlmICghdGhpcy5faXNEZWJ1Z0VuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLmVuZEFjdGl2ZVNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5zaG93VmlldyhWaWV3U3RhdGUuSG9tZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJlLXNob3cgdGhlIGN1cnJlbnQgdmlldyBzbyBpdCByZWxvYWRzIGV2ZW50cyBmcm9tIHNjcmF0Y2gsXG5cdFx0XHQvLyBlbnN1cmluZyBjb3JyZWN0IG9yZGVyaW5nIGFuZCBubyBzdGFsZSBkdXBsaWNhdGVzLlxuXHRcdFx0Ly8gTmF2aWdhdGlvbiBmcm9tIG5ldyBvcGVuRWRpdG9yKCkgb3B0aW9ucyBpcyBoYW5kbGVkIGJ5XG5cdFx0XHQvLyBzZXRPcHRpb25zIFx1MjE5MiBfYXBwbHlOYXZpZ2F0aW9uT3B0aW9ucyAoZmlyZXMgYWZ0ZXIgdGhpcykuXG5cdFx0XHR0aGlzLnNob3dWaWV3KHRoaXMudmlld1N0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseU5hdmlnYXRpb25PcHRpb25zKG9wdGlvbnM6IElDaGF0RGVidWdFZGl0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0Ly8gSWYgZGVidWcgbG9nZ2luZyBpcyBkaXNhYmxlZCwgYWx3YXlzIHNob3cgdGhlIGhvbWUgdmlld1xuXHRcdGlmICghdGhpcy5faXNEZWJ1Z0VuYWJsZWQoKSkge1xuXHRcdFx0dGhpcy5lbmRBY3RpdmVTZXNzaW9uKCk7XG5cdFx0XHR0aGlzLnNob3dWaWV3KFZpZXdTdGF0ZS5Ib21lKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IHNlc3Npb25SZXNvdXJjZSwgdmlld0hpbnQsIGZpbHRlciB9ID0gb3B0aW9ucztcblx0XHRpZiAodmlld0hpbnQgPT09ICdsb2dzJyAmJiBzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMubmF2aWdhdGVUb1Nlc3Npb24oc2Vzc2lvblJlc291cmNlLCAnbG9ncycpO1xuXHRcdH0gZWxzZSBpZiAodmlld0hpbnQgPT09ICdmbG93Y2hhcnQnICYmIHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5uYXZpZ2F0ZVRvU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsICdmbG93Y2hhcnQnKTtcblx0XHR9IGVsc2UgaWYgKHZpZXdIaW50ID09PSAnY2FjaGUnICYmIHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5uYXZpZ2F0ZVRvU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsICdjYWNoZScpO1xuXHRcdH0gZWxzZSBpZiAodmlld0hpbnQgPT09ICdvdmVydmlldycgJiYgc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLm5hdmlnYXRlVG9TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgJ292ZXJ2aWV3Jyk7XG5cdFx0fSBlbHNlIGlmICh2aWV3SGludCA9PT0gJ3dpcmVsb2cnICYmIHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5uYXZpZ2F0ZVRvU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsICd3aXJlbG9nJyk7XG5cdFx0fSBlbHNlIGlmICh2aWV3SGludCA9PT0gJ2hvbWUnKSB7XG5cdFx0XHR0aGlzLmVuZEFjdGl2ZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuc2hvd1ZpZXcoVmlld1N0YXRlLkhvbWUpO1xuXHRcdH0gZWxzZSBpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLm5hdmlnYXRlVG9TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgJ292ZXJ2aWV3Jyk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnZpZXdTdGF0ZSA9PT0gVmlld1N0YXRlLkhvbWUpIHtcblx0XHRcdHRoaXMuc2hvd1ZpZXcoVmlld1N0YXRlLkhvbWUpO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IGZpbHRlciB0ZXh0IGlmIHByb3ZpZGVkIChlLmcuIGZyb20gZGVidWcgZXZlbnRzIHNuYXBzaG90KVxuXHRcdGlmIChmaWx0ZXIgIT09IHVuZGVmaW5lZCAmJiB0aGlzLmZpbHRlclN0YXRlKSB7XG5cdFx0XHR0aGlzLmZpbHRlclN0YXRlLnNldFRleHRGaWx0ZXIoZmlsdGVyKTtcblx0XHRcdHRoaXMubG9nc1ZpZXc/LnNldEZpbHRlclRleHQoZmlsdGVyKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmN1cnJlbnREaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbi53aWR0aH1weGA7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0fXB4YDtcblx0XHR9XG5cdFx0dGhpcy5kb0xheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0xheW91dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudERpbWVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3U3RhdGUgPT09IFZpZXdTdGF0ZS5Mb2dzKSB7XG5cdFx0XHR0aGlzLmxvZ3NWaWV3Py5sYXlvdXQodGhpcy5jdXJyZW50RGltZW5zaW9uKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudmlld1N0YXRlID09PSBWaWV3U3RhdGUuV2lyZUxvZykge1xuXHRcdFx0dGhpcy53aXJlTG9nVmlldz8ubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFFUCxZQUFZLFNBQVM7QUFHckIsU0FBUyxlQUFlLGlCQUFp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
