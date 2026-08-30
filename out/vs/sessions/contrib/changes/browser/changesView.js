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
import "./media/changesView.css";
import * as dom from "../../../../base/browser/dom.js";
import { ActionViewItem, BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Schemas } from "../../../../base/common/network.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ActionRunner, Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { autorun, derived, derivedObservableWithCache, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { basename, isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { MenuWorkbenchButtonBar, WorkbenchButtonBar } from "../../../../platform/actions/browser/buttonbar.js";
import { getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { ActionWidgetDropdownActionViewItem } from "../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js";
import { MenuId, Action2, MenuItemAction, registerAction2, IMenuService } from "../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { ActiveEditorContext } from "../../../../workbench/common/contextkeys.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { SessionIsActiveContext, SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { SessionChangesEditorInput } from "./sessionChangesEditorInput.js";
import { defaultCountBadgeStyles, defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IWorkspaceContextService, WorkspaceFolder } from "../../../../platform/workspace/common/workspace.js";
import { fillEditorsDragData } from "../../../../workbench/browser/dnd.js";
import { ResourceLabels } from "../../../../workbench/browser/labels.js";
import { ViewPane, ViewAction } from "../../../../workbench/browser/parts/views/viewPane.js";
import { ViewPaneContainer } from "../../../../workbench/browser/parts/views/viewPaneContainer.js";
import { IViewDescriptorService } from "../../../../workbench/common/views.js";
import { CHAT_CATEGORY } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { createFileIconThemableTreeContainerScope } from "../../../../workbench/contrib/files/browser/views/explorerView.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../workbench/services/editor/common/editorService.js";
import { IExtensionService } from "../../../../workbench/services/extensions/common/extensions.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { IWorkspaceFolderLabelService } from "../../../../workbench/services/workspaces/common/workspaceFolderLabelService.js";
import { isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { getChangesEditorLabels } from "./changesEditorLabels.js";
import { ISessionChangesService } from "./sessionChangesService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { CIStatusWidget } from "./checksWidget.js";
import { SessionFilesWidget } from "./sessionFilesWidget.js";
import { SessionFilesViewModel } from "./sessionFilesViewModel.js";
import { GITHUB_REMOTE_FILE_SCHEME, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus } from "../../../services/sessions/common/session.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { LayoutPriority, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../base/common/color.js";
import { PANEL_SECTION_BORDER } from "../../../../workbench/common/theme.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../workbench/common/editor.js";
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from "../../../common/sessionsTelemetry.js";
import { ChecksViewModel } from "./checksViewModel.js";
import { REVEAL_CI_CHECKS_COMMAND_ID } from "./checksActions.js";
import { AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID, isAgentHostSkillButtonId } from "../../providers/agentHost/browser/agentHostSkillButtons.js";
import { ActiveSessionContextKeys, CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from "../common/changes.js";
import { buildTreeChildren, ChangesTreeRenderer, isChangesFileItem, isChangesFileResource, toIChangesFileItem } from "./changesViewRenderer.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { compareFileNames, comparePaths } from "../../../../base/common/comparers.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { ChangesSummaryWidget } from "./changesSummaryWidget.js";
import { Menus } from "../../../browser/menus.js";
const $ = dom.$;
const RUN_SESSION_CODE_REVIEW_ACTION_ID = "sessions.codeReview.run";
const VERSIONS_PICKER_ACTION_ID = "chatEditing.versionsPicker";
const DIFF_STATS_ACTION_ID = "workbench.changesView.action.viewChanges";
const singlePaneChangesEditorHeader = ContextKeyExpr.and(
  SinglePaneLayoutEnabledContext,
  ActiveEditorContext.isEqualTo(SessionChangesEditorInput.EDITOR_ID)
);
const EMPTY_FILE_CHANGES_MIN_HEIGHT = 140;
const TREE_PANE_LIST_BOTTOM_PADDING = 12;
const TREE_PANE_MIN_VISIBLE_ROWS = 5;
let ChangesMenuWorkbenchButtonBarWidget = class extends Disposable {
  constructor(container, hasGitOperationInProgressObs, menuService, changesViewService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService) {
    super();
    this._onDidChangeActions = this._register(new Emitter());
    this.onDidChangeActions = this._onDidChangeActions.event;
    const outgoingChangesObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const activeSessionState = changesViewService.activeSessionStateObs.read(reader);
      const hasGitOperationInProgress = hasGitOperationInProgressObs.read(reader);
      if (hasGitOperationInProgress) {
        return lastValue;
      }
      return activeSessionState?.outgoingChanges;
    });
    const runningLabelObs = observableValue(this, void 0);
    const sessionIsActiveObs = observableFromEvent(contextKeyService.onDidChangeContext, () => SessionIsActiveContext.getValue(contextKeyService) ?? false);
    this._register(autorun((reader) => {
      if (!hasGitOperationInProgressObs.read(reader)) {
        runningLabelObs.set(void 0, void 0);
      }
    }));
    this._register(autorun((reader) => {
      const hasGitOperationInProgress = hasGitOperationInProgressObs.read(reader);
      sessionIsActiveObs.read(reader);
      const sessionResource = changesViewService.activeSessionResourceObs.read(reader);
      const outgoingChanges = outgoingChangesObs.read(reader) ?? 0;
      const buttonBar = new MenuWorkbenchButtonBar(
        container,
        MenuId.AgentsChangesToolbar,
        {
          telemetrySource: "changesView",
          renderSecondaryActions: false,
          menuOptions: sessionResource ? { arg: sessionResource } : { shouldForwardArgs: true },
          buttonConfigProvider: (action, index) => {
            const configuration = this._getButtonConfiguration(action, outgoingChanges, hasGitOperationInProgress, runningLabelObs);
            return index === 0 ? { ...configuration, showIcon: false, showLabel: true } : configuration;
          }
        },
        menuService,
        contextKeyService,
        contextMenuService,
        keybindingService,
        telemetryService,
        hoverService
      );
      reader.store.add(buttonBar.onWillRun((e) => runningLabelObs.set(e.action.label, void 0)));
      this._currentButtonBar = buttonBar;
      reader.store.add(buttonBar.onDidChange(() => this._onDidChangeActions.fire()));
      this._onDidChangeActions.fire();
      reader.store.add(buttonBar);
    }));
  }
  get hasActions() {
    return (this._currentButtonBar?.buttons.length ?? 0) > 0;
  }
  _getButtonConfiguration(action, outgoingChanges, hasGitOperationInProgress, runningLabelObs) {
    if (action.id === "github.copilot.sessions.commit" || action.id === "github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR") {
      if (!hasGitOperationInProgress) {
        return { showIcon: true, showLabel: true, isSecondary: false };
      }
      const customLabelObs = derived((reader) => {
        const running = runningLabelObs.read(reader);
        return `$(loading) ${running ?? action.label}`;
      });
      return { showIcon: false, showLabel: true, isSecondary: false, customLabelObs };
    }
    if (action.id === "github.copilot.sessions.sync" || action.id === "github.copilot.sessions.commitAndSync") {
      const labelWithCount = outgoingChanges > 0 ? `${action.label} ${outgoingChanges}\u2191` : `${action.label}`;
      if (!hasGitOperationInProgress) {
        return { showIcon: true, showLabel: true, isSecondary: false, customLabel: labelWithCount };
      }
      return { showIcon: false, showLabel: true, isSecondary: false, customLabel: `$(loading) ${labelWithCount}` };
    }
    if (action.id === AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID) {
      const customLabel = outgoingChanges > 0 ? `${action.label} ${outgoingChanges}\u2191` : action.label;
      return { customLabel, showIcon: true, showLabel: true, isSecondary: false };
    }
    if (action.id === RUN_SESSION_CODE_REVIEW_ACTION_ID || action.id === "chatEditing.viewAllSessionChanges" || action.id === "github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR") {
      return { showIcon: true, showLabel: false, isSecondary: true };
    }
    if (action.id === "agentFeedbackEditor.action.submitActiveSession") {
      return { showIcon: false, showLabel: true, isSecondary: false };
    }
    if (action.id === "github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR" || action.id === "github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge" || action.id === "github.copilot.chat.checkoutPullRequestReroute" || action.id === "pr.checkoutFromChat" || action.id === "github.copilot.sessions.initializeRepository" || action.id === "agentSession.restore" || action.id === "sessions.action.fixCIChecks" || isAgentHostSkillButtonId(action.id)) {
      return { showIcon: true, showLabel: true, isSecondary: false };
    }
    if (action instanceof MenuItemAction) {
      const icon = action.item.icon;
      if (icon) {
        return { showIcon: true, showLabel: false };
      }
    }
    return void 0;
  }
};
ChangesMenuWorkbenchButtonBarWidget = __decorateClass([
  __decorateParam(2, IMenuService),
  __decorateParam(3, IChangesViewService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IHoverService)
], ChangesMenuWorkbenchButtonBarWidget);
let ChangesWorkbenchButtonBarWidget = class extends Disposable {
  get hasActions() {
    return this._buttonBar.buttons.length > 0;
  }
  constructor(container, menuService, changesViewService, contextKeyService, instantiationService) {
    super();
    const menu = this._register(menuService.createMenu(MenuId.AgentsChangesToolbar, contextKeyService, { emitEventsForSubmenuChanges: true }));
    const buttonBar = this._buttonBar = this._register(instantiationService.createInstance(
      WorkbenchButtonBar,
      container,
      {
        telemetrySource: "changesView",
        renderSecondaryActions: false,
        buttonConfigProvider: (action, index) => {
          return index === 0 ? { showIcon: false, showLabel: true, customLabel: stripIcons(action.label) } : { showIcon: true, showLabel: false };
        }
      }
    ));
    this.onDidChangeActions = Event.signal(buttonBar.onDidChange);
    const menuActionsObs = observableFromEvent(menu.onDidChange, () => {
      return getActionBarActions(menu.getActions({ shouldForwardArgs: true }));
    });
    const operationActionGroupsObs = derived((reader) => {
      const changeset = changesViewService.activeSessionChangesetObs.read(reader);
      if (!changeset) {
        return [];
      }
      const operations = changesViewService.activeSessionChangesetOperationsObs.read(reader);
      const changesetOperations = operations.filter((op) => op.scopes.includes(SessionChangesetOperationScope.Changeset));
      const toOperationAction = (op) => toAction({
        id: op.id,
        label: op.icon ? op.status === SessionChangesetOperationStatus.Running ? `$(loading) ${op.label}` : `$(${op.icon.id}) ${op.label}` : op.status === SessionChangesetOperationStatus.Running ? `$(loading) ${op.label}` : op.label,
        tooltip: op.description ?? op.label,
        enabled: op.status !== SessionChangesetOperationStatus.Disabled && op.status !== SessionChangesetOperationStatus.Running,
        run: () => changeset.invokeOperation(op.id)
      });
      const groups = /* @__PURE__ */ new Map();
      for (const op of changesetOperations) {
        if (op.status === SessionChangesetOperationStatus.Running) {
          continue;
        }
        const action = toOperationAction(op);
        const groupActions = groups.get(op.group);
        if (groupActions) {
          groupActions.push(action);
        } else {
          groups.set(op.group, [action]);
        }
      }
      const runningActions = changesetOperations.filter((op) => op.status === SessionChangesetOperationStatus.Running).map(toOperationAction);
      return [
        ...runningActions.length > 0 ? [runningActions] : [],
        ...groups.values()
      ];
    });
    this._register(autorun((reader) => {
      const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
      if (isLoading) {
        return;
      }
      const operationActionGroups = operationActionGroupsObs.read(reader);
      const menuActions = menuActionsObs.read(reader);
      const primaryActions = [];
      const operationActions = operationActionGroups.flat();
      if (operationActions.length > 1) {
        const primaryAction = operationActions[0];
        const dropdownActions = [];
        for (const group of operationActionGroups) {
          if (dropdownActions.length > 0) {
            dropdownActions.push(new Separator());
          }
          dropdownActions.push(...group);
        }
        primaryActions.push(new SubmenuAction("changesView.operations.primary.dropdown", primaryAction.label, dropdownActions));
      } else {
        primaryActions.push(...operationActions);
      }
      primaryActions.push(...menuActions.primary);
      buttonBar.update(primaryActions, menuActions.secondary);
    }));
  }
};
ChangesWorkbenchButtonBarWidget = __decorateClass([
  __decorateParam(1, IMenuService),
  __decorateParam(2, IChangesViewService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService)
], ChangesWorkbenchButtonBarWidget);
let ChangesActionsBar = class extends Disposable {
  constructor(container, instantiationService, changesViewService, sessionsService, contextKeyService) {
    super();
    container.classList.add("changes-actions-bar");
    const hasGitOperationInProgressGlobalObs = observableFromEvent(contextKeyService.onDidChangeContext, () => contextKeyService.getContextKeyValue("sessions.hasGitOperationInProgress") === true);
    const hasGitOperationInProgressObs = derived((reader) => {
      if (hasGitOperationInProgressGlobalObs.read(reader)) {
        return true;
      }
      return changesViewService.activeSessionStateObs.read(reader)?.hasGitOperationInProgress === true;
    });
    const isAgentHostSessionObs = derived((reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      return activeSession ? isAgentHostProviderId(activeSession.providerId) : false;
    });
    let currentWidget;
    const updateVisibility = () => {
      const visible = currentWidget?.hasActions ?? false;
      dom.setVisibility(visible, container);
    };
    this._register(autorun((reader) => {
      dom.clearNode(container);
      const widget = isAgentHostSessionObs.read(reader) ? instantiationService.createInstance(ChangesWorkbenchButtonBarWidget, container) : instantiationService.createInstance(ChangesMenuWorkbenchButtonBarWidget, container, hasGitOperationInProgressObs);
      reader.store.add(widget);
      currentWidget = widget;
      reader.store.add(widget.onDidChangeActions(() => updateVisibility()));
      updateVisibility();
    }));
    this._register(autorun((reader) => {
      sessionsService.activeSession.read(reader)?.status.read(reader);
      updateVisibility();
    }));
  }
};
ChangesActionsBar = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IChangesViewService),
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IContextKeyService)
], ChangesActionsBar);
const CHANGES_HEADER_ACTIONS_ID = "workbench.changesView.headerActions";
let ChangesActionsBarActionViewItem = class extends BaseActionViewItem {
  constructor(action, options, instantiationService) {
    super(void 0, action, options);
    this.instantiationService = instantiationService;
  }
  render(container) {
    super.render(container);
    this._register(this.instantiationService.createInstance(ChangesActionsBar, container));
  }
};
ChangesActionsBarActionViewItem = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChangesActionsBarActionViewItem);
let ChangesActionViewItemsContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, VERSIONS_PICKER_ACTION_ID, (action, _options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ChangesPickerActionItem, action);
    }, onDidRegister.event));
    this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, DIFF_STATS_ACTION_ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(SinglePaneChangesDiffStatsActionItem, action, options);
    }, onDidRegister.event));
    this._register(actionViewItemService.register(Menus.TitleBarSessionMenu, CHANGES_HEADER_ACTIONS_ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ChangesActionsBarActionViewItem, action, options);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
ChangesActionViewItemsContribution.ID = "workbench.contrib.changesEditorHeader";
ChangesActionViewItemsContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], ChangesActionViewItemsContribution);
registerWorkbenchContribution2(ChangesActionViewItemsContribution.ID, ChangesActionViewItemsContribution, WorkbenchPhase.BlockRestore);
let ChangesViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, changesViewService, editorService, sessionsService, labelService, logService, telemetryService, sessionChangesService, workbenchLayoutService, workspaceFolderLabelService) {
    super({ ...options, titleMenuId: MenuId.ChatEditingSessionTitleToolbar }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.changesViewService = changesViewService;
    this.editorService = editorService;
    this.sessionsService = sessionsService;
    this.labelService = labelService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.sessionChangesService = sessionChangesService;
    this.workbenchLayoutService = workbenchLayoutService;
    this.workspaceFolderLabelService = workspaceFolderLabelService;
    this.treePaneSizeChange = this._register(new Emitter());
    this.sectionPanesUserResized = false;
    this.renderDisposables = this._register(new DisposableStore());
    // Track current body dimensions for list layout
    this.currentBodyHeight = 0;
    this.currentBodyWidth = 0;
    this.isMergeBaseBranchProtectedContextKey = ActiveSessionContextKeys.IsMergeBaseBranchProtected.bindTo(this.scopedContextKeyService);
    this.isolationModeContextKey = ActiveSessionContextKeys.IsolationMode.bindTo(this.scopedContextKeyService);
    this.hasGitRepositoryContextKey = ActiveSessionContextKeys.HasGitRepository.bindTo(this.scopedContextKeyService);
    this.hasUpstreamContextKey = ActiveSessionContextKeys.HasUpstream.bindTo(this.scopedContextKeyService);
    this.hasIncomingChangesContextKey = ActiveSessionContextKeys.HasIncomingChanges.bindTo(this.scopedContextKeyService);
    this.hasOutgoingChangesContextKey = ActiveSessionContextKeys.HasOutgoingChanges.bindTo(this.scopedContextKeyService);
    this.hasUncommittedChangesContextKey = ActiveSessionContextKeys.HasUncommittedChanges.bindTo(this.scopedContextKeyService);
    this.hasBranchChangesContextKey = ActiveSessionContextKeys.HasBranchChanges.bindTo(this.scopedContextKeyService);
    this.hasGitHubRemoteContextKey = ActiveSessionContextKeys.HasGitHubRemote.bindTo(this.scopedContextKeyService);
    this.hasPullRequestContextKey = ActiveSessionContextKeys.HasPullRequest.bindTo(this.scopedContextKeyService);
    this.hasOpenPullRequestContextKey = ActiveSessionContextKeys.HasOpenPullRequest.bindTo(this.scopedContextKeyService);
    this.hasGitOperationInProgressContextKey = ActiveSessionContextKeys.HasGitOperationInProgress.bindTo(this.scopedContextKeyService);
    this._register(bindContextKey(ChangesContextKeys.VersionMode, this.scopedContextKeyService, (reader) => {
      return this.changesViewService.activeSessionChangesetObs.read(reader)?.id ?? "";
    }));
    this._register(bindContextKey(ChangesContextKeys.ViewMode, this.scopedContextKeyService, (reader) => {
      return this.changesViewService.viewModeObs.read(reader);
    }));
    this._register(bindContextKey(ChatContextKeys.agentSessionType, this.scopedContextKeyService, (reader) => {
      return this.changesViewService.activeSessionTypeObs.read(reader) ?? "";
    }));
    const hasGitOperationInProgressGlobalContextObs = observableFromEvent(this.contextKeyService.onDidChangeContext, () => {
      return this.contextKeyService.getContextKeyValue("sessions.hasGitOperationInProgress") === true;
    });
    const hasGitOperationInProgressStateObs = derived((reader) => {
      const activeSessionState = this.changesViewService.activeSessionStateObs.read(reader);
      return activeSessionState?.hasGitOperationInProgress === true;
    });
    this.hasGitOperationInProgressObs = derived((reader) => {
      const hasGitOperationInProgressGlobalContext = hasGitOperationInProgressGlobalContextObs.read(reader);
      const hasGitOperationInProgressState = hasGitOperationInProgressStateObs.read(reader);
      const contextKeyValue = hasGitOperationInProgressGlobalContext === true ? hasGitOperationInProgressGlobalContext : hasGitOperationInProgressState;
      this.hasGitOperationInProgressContextKey.set(contextKeyValue);
      return contextKeyValue;
    });
    const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
    this.scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
    this._register(this.scopedInstantiationService);
  }
  renderBody(container) {
    super.renderBody(container);
    this.bodyContainer = dom.append(container, $(".changes-view-body"));
    this.actionsContainer = dom.append(this.bodyContainer, $(".chat-editing-session-actions.outside-card"));
    this.splitViewContainer = dom.append(this.bodyContainer, $(".changes-splitview-container"));
    this.contentContainer = dom.append(this.splitViewContainer, $(".chat-editing-session-container.show-file-icons"));
    this._register(createFileIconThemableTreeContainerScope(this.contentContainer, this.themeService));
    const updateHasFileIcons = () => {
      this.contentContainer.classList.toggle("has-file-icons", this.themeService.getFileIconTheme().hasFileIcons);
    };
    updateHasFileIcons();
    this._register(this.themeService.onDidFileIconThemeChange(updateHasFileIcons));
    this.createFilesHeader(this.contentContainer);
    const progressContainer = dom.append(this.contentContainer, $(".changes-progress"));
    this.changesProgressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
    this.changesProgressBar.stop().hide();
    this.listContainer = dom.append(this.contentContainer, $(".changes-file-list"));
    this.welcomeContainer = dom.append(this.contentContainer, $(".changes-welcome"));
    this.welcomeContainer.style.display = "none";
    const welcomeMessage = dom.append(this.welcomeContainer, $(".changes-welcome-message"));
    welcomeMessage.textContent = localize("changesView.noChanges", "Changed files and other session artifacts will appear here.");
    this.sessionFilesWidget = this._register(this.scopedInstantiationService.createInstance(SessionFilesWidget, this.splitViewContainer));
    this.ciStatusWidget = this._register(this.scopedInstantiationService.createInstance(CIStatusWidget, this.splitViewContainer));
    this.splitView = this._register(new SplitView(this.splitViewContainer, {
      orientation: Orientation.VERTICAL,
      proportionalLayout: false
    }));
    const sessionFilesWidget = this.sessionFilesWidget;
    const ciWidget = this.ciStatusWidget;
    const ciMinHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.MIN_BODY_HEIGHT;
    const sessionFilesMinHeight = SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.MIN_BODY_HEIGHT;
    const getSessionFilesContentHeight = () => Math.max(SessionFilesWidget.HEADER_HEIGHT, sessionFilesWidget.desiredHeight);
    const getSessionFilesMinimumHeight = () => sessionFilesWidget.collapsed ? SessionFilesWidget.HEADER_HEIGHT : Math.min(sessionFilesMinHeight, getSessionFilesContentHeight());
    const getSessionFilesPreferredHeight = () => Math.max(
      getSessionFilesMinimumHeight(),
      Math.min(getSessionFilesContentHeight(), SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.PREFERRED_BODY_HEIGHT)
    );
    const getCIContentHeight = () => Math.max(CIStatusWidget.HEADER_HEIGHT, ciWidget.desiredHeight);
    const getCIMinimumHeight = () => ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : Math.min(ciMinHeight, getCIContentHeight());
    const getCIPreferredHeight = () => Math.max(
      getCIMinimumHeight(),
      Math.min(getCIContentHeight(), CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT)
    );
    const getReservedSectionHeight = () => (sessionFilesWidget.visible ? getSessionFilesMinimumHeight() : 0) + (ciWidget.visible ? getCIMinimumHeight() : 0);
    this.rebalanceSectionPanes = () => {
      if (!this.splitView || this.sectionPanesUserResized || !ciWidget.visible || ciWidget.collapsed) {
        return;
      }
      this.splitView.resizeView(2, getCIMinimumHeight());
    };
    const thisView = this;
    const treePane = {
      element: this.contentContainer,
      get minimumSize() {
        return thisView.getTreePaneMinimumSize(getReservedSectionHeight());
      },
      get maximumSize() {
        return thisView.getTreePaneMaximumSize();
      },
      onDidChange: this.treePaneSizeChange.event,
      layout: (height) => {
        this.contentContainer.style.height = `${height}px`;
        this._layoutTreeInPane(height);
      }
    };
    const sessionFilesElement = this.sessionFilesWidget.element;
    const sessionFilesPane = {
      element: sessionFilesElement,
      get minimumSize() {
        return getSessionFilesMinimumHeight();
      },
      get maximumSize() {
        return sessionFilesWidget.collapsed ? SessionFilesWidget.HEADER_HEIGHT : getSessionFilesContentHeight();
      },
      priority: LayoutPriority.High,
      onDidChange: Event.map(this.sessionFilesWidget.onDidChangeHeight, () => void 0),
      layout: (height) => {
        sessionFilesElement.style.height = `${height}px`;
        const bodyHeight = Math.max(0, height - SessionFilesWidget.HEADER_HEIGHT);
        sessionFilesWidget.layout(bodyHeight);
      }
    };
    const ciElement = this.ciStatusWidget.element;
    const ciPane = {
      element: ciElement,
      get minimumSize() {
        return getCIMinimumHeight();
      },
      get maximumSize() {
        return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : getCIContentHeight();
      },
      priority: LayoutPriority.Low,
      onDidChange: Event.map(this.ciStatusWidget.onDidChangeHeight, () => void 0),
      layout: (height) => {
        ciElement.style.height = `${height}px`;
        const bodyHeight = Math.max(0, height - CIStatusWidget.HEADER_HEIGHT);
        ciWidget.layout(bodyHeight);
      }
    };
    this.splitView.addView(treePane, Sizing.Distribute, 0, true);
    this.splitView.addView(sessionFilesPane, SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.PREFERRED_BODY_HEIGHT, 1, true);
    this.splitView.addView(ciPane, CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT, 2, true);
    const updateSplitViewStyles = () => {
      const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
      this.splitView.style({ separatorBorder: borderColor ?? Color.transparent });
    };
    updateSplitViewStyles();
    this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));
    this._register(this.splitView.onDidSashChange(() => this.sectionPanesUserResized = true));
    this.splitView.setViewVisible(1, false);
    this.splitView.setViewVisible(2, false);
    this._wireSectionPane(this.sessionFilesWidget, 1, SessionFilesWidget.HEADER_HEIGHT, getSessionFilesPreferredHeight);
    this._register(this.sessionFilesWidget.onDidChangeHeight(() => this.fireTreePaneSizeChange()));
    this._wireSectionPane(this.ciStatusWidget, 2, CIStatusWidget.HEADER_HEIGHT, getCIPreferredHeight);
    this._register(this.ciStatusWidget.onDidChangeHeight(() => this.fireTreePaneSizeChange()));
    this._register(autorun((reader) => {
      const state = this.changesViewService.activeSessionSectionCollapseStateObs.read(reader);
      sessionFilesWidget.setCollapsed(state.otherFiles);
      ciWidget.setCollapsed(state.checks);
    }));
    this._register(sessionFilesWidget.onDidToggleCollapsed((collapsed) => this.setActiveSectionCollapsed("otherFiles", collapsed)));
    this._register(ciWidget.onDidToggleCollapsed((collapsed) => this.setActiveSectionCollapsed("checks", collapsed)));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible) {
        this.onVisible();
      } else {
        this.captureDetailsViewState();
        this.renderDisposables.clear();
      }
    }));
    if (this.isBodyVisible()) {
      this.onVisible();
    }
  }
  getActionsContext() {
    return this.changesViewService.activeSessionResourceObs.get();
  }
  onVisible() {
    this.renderDisposables.clear();
    this.renderDisposables.add(autorun((reader) => {
      this.changesViewService.activeSessionResourceObs.read(reader);
      this.updateActions();
    }));
    this.renderDisposables.add(autorun((reader) => {
      const isLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
      if (isLoading) {
        this.changesProgressBar.infinite().show(200);
      } else {
        this.changesProgressBar.stop().hide();
      }
    }));
    const changesObs = derived((reader) => {
      const changes = this.changesViewService.activeSessionChangesObs.read(reader);
      return toIChangesFileItem(changes);
    });
    const topLevelStats = derivedObservableWithCache(this, (reader, lastValue) => {
      const isLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
      if (isLoading) {
        return lastValue;
      }
      const entries = changesObs.read(reader);
      let added = 0, removed = 0;
      for (const entry of entries) {
        added += entry.linesAdded;
        removed += entry.linesRemoved;
      }
      return { files: entries.length, added, removed };
    });
    if (this.actionsContainer) {
      this._bindContextKeys(topLevelStats);
      this.createActionsButtonBar();
    }
    const activeSessionStatusObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession?.status.read(reader);
    });
    this.renderDisposables.add(autorun((reader) => {
      if (this.changesViewService.activeSessionLoadingObs.read(reader)) {
        return;
      }
      const activeSessionStatus = activeSessionStatusObs.read(reader);
      const isUntitled = activeSessionStatus === SessionStatus.Untitled;
      if (this.actionsContainer) {
        dom.setVisibility(this.isActionsContainerVisible(isUntitled), this.actionsContainer);
      }
      const stats = topLevelStats.read(reader);
      const hasEntries = stats !== void 0 && stats.files > 0;
      if (this.filesHeaderNode) {
        const hasGitRepository = this.changesViewService.activeSessionHasGitRepositoryObs.read(reader);
        dom.setVisibility(!isUntitled && (hasGitRepository || hasEntries), this.filesHeaderNode);
      }
      if (this.fileHeaderToolbarContainer) {
        dom.setVisibility(hasEntries, this.fileHeaderToolbarContainer);
      }
      dom.setVisibility(hasEntries, this.listContainer);
      dom.setVisibility(!hasEntries, this.welcomeContainer);
      this.fireTreePaneSizeChange();
      this.layoutSplitView();
    }));
    if (!this.tree && this.listContainer) {
      this.tree = this.createChangesTree(this.listContainer, this.onDidChangeBodyVisibility, this._store);
    }
    if (this.tree) {
      const tree = this.tree;
      this.renderDisposables.add(tree.onDidChangeContentHeight(() => {
        this.fireTreePaneSizeChange();
        this.layoutSplitView();
      }));
      this.renderDisposables.add(tree.onDidOpen((e) => {
        if (!e.element || !isChangesFileItem(e.element)) {
          return;
        }
        logChangesViewFileSelect(this.telemetryService, e.element.changeType);
        if (this.shouldOpenModalDiff()) {
          const items = changesObs.get();
          this._openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
          return;
        }
        const altKey = !!e.browserEvent?.altKey;
        const openSingleFileDiff = this.shouldOpenSingleFileDiffByDefault() !== altKey;
        if (openSingleFileDiff) {
          const sideBySide = e.sideBySide && !altKey;
          void this._openSingleFileDiffEditor(e.element, sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned);
          return;
        }
        void this._openMultiFileDiffEditor(e.element.uri);
      }));
    }
    if (this.ciStatusWidget) {
      const checksViewModel = this.scopedInstantiationService.createInstance(ChecksViewModel);
      this.renderDisposables.add(checksViewModel);
      this.renderDisposables.add(this.ciStatusWidget.setInput(checksViewModel));
    }
    if (this.sessionFilesWidget) {
      const sessionFilesViewModel = this.scopedInstantiationService.createInstance(SessionFilesViewModel);
      this.renderDisposables.add(sessionFilesViewModel);
      this.renderDisposables.add(this.sessionFilesWidget.setInput(sessionFilesViewModel));
    }
    this.renderDisposables.add(autorun((reader) => {
      const changes = changesObs.read(reader);
      const viewMode = this.changesViewService.viewModeObs.read(reader);
      const activeSessionLoading = this.changesViewService.activeSessionLoadingObs.read(reader);
      const sessionResource = this.changesViewService.activeSessionResourceObs.read(reader);
      this.changesViewService.activeSessionStateObs.read(reader);
      if (!this.tree || activeSessionLoading) {
        return;
      }
      const detailsViewStateTransfer = this.changesViewService.detailsViewStateTransferObs.read(reader);
      if (detailsViewStateTransfer !== this.detailsViewStateTransfer) {
        this.detailsViewStateTransfer = detailsViewStateTransfer;
        if (detailsViewStateTransfer && this.renderedTreeState) {
          const renderedSessionResource = this.renderedTreeState.sessionResource;
          if (isEqual(renderedSessionResource, detailsViewStateTransfer.from)) {
            this.captureDetailsViewState(detailsViewStateTransfer.to);
            this.renderedTreeState = void 0;
            if (sessionResource && isEqual(sessionResource, detailsViewStateTransfer.from)) {
              return;
            }
          } else if (!isEqual(renderedSessionResource, detailsViewStateTransfer.to)) {
            this.captureDetailsViewState();
            if (sessionResource && isEqual(sessionResource, renderedSessionResource)) {
              return;
            }
          }
        }
      } else {
        this.captureDetailsViewState();
      }
      const detailsViewState = sessionResource ? this.changesViewService.getDetailsViewState(sessionResource, viewMode) : void 0;
      this.listContainer?.classList.toggle("list-mode", viewMode === ChangesViewMode.List);
      if (viewMode === ChangesViewMode.Tree) {
        const treeRootInfo = this.getTreeRootInfo(changes);
        const treeChildren = buildTreeChildren(changes, treeRootInfo);
        this.setDetailsTreeChildren(sessionResource, viewMode, detailsViewState, treeChildren);
      } else {
        const listChildren = changes.map((item) => ({
          element: item,
          collapsible: false
        }));
        this.setDetailsTreeChildren(sessionResource, viewMode, detailsViewState, listChildren);
      }
      this.fireTreePaneSizeChange();
      this.layoutSplitView();
    }));
  }
  saveState() {
    this.captureDetailsViewState();
    super.saveState();
  }
  captureDetailsViewState(sessionResource) {
    if (!this.tree || !this.renderedTreeState) {
      return;
    }
    const state = this.tree.getViewState().toJSON();
    this.changesViewService.setDetailsViewState(sessionResource ?? this.renderedTreeState.sessionResource, this.renderedTreeState.viewMode, {
      ...state,
      focus: Array.from(state.focus),
      selection: Array.from(state.selection)
    });
  }
  setDetailsTreeChildren(sessionResource, viewMode, state, children) {
    if (!this.tree) {
      return;
    }
    const elementsById = /* @__PURE__ */ new Map();
    const restoredChildren = this.applyDetailsViewState(children, state, elementsById);
    this.renderedTreeState = void 0;
    this.tree.setChildren(null, restoredChildren);
    this.tree.setFocus(state ? Array.from(state.focus, (id) => elementsById.get(id)).filter((element) => element !== void 0) : []);
    this.tree.setSelection(state ? Array.from(state.selection, (id) => elementsById.get(id)).filter((element) => element !== void 0) : []);
    this.tree.scrollTop = state?.scrollTop ?? 0;
    this.renderedTreeState = sessionResource ? { sessionResource, viewMode } : void 0;
  }
  applyDetailsViewState(children, state, elementsById) {
    return children.map((child) => {
      const id = child.element.uri.toString();
      elementsById.set(id, child.element);
      const restoredChildren = child.children ? this.applyDetailsViewState(Array.from(child.children), state, elementsById) : void 0;
      const expanded = state?.expanded[id];
      return {
        ...child,
        children: restoredChildren,
        collapsed: expanded === void 0 ? child.collapsed : expanded === 0
      };
    });
  }
  _bindContextKeys(topLevelStats) {
    this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, (reader) => {
      const activeSessionStatus = this.sessionsService.activeSession.read(reader)?.status.read(reader);
      return activeSessionStatus !== SessionStatus.Completed && activeSessionStatus !== SessionStatus.Error;
    }));
    this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, this.scopedContextKeyService, (reader) => {
      const stats = topLevelStats.read(reader);
      return stats !== void 0 && stats.files > 0;
    }));
    this.renderDisposables.add(autorun((reader) => {
      const state = this.changesViewService.activeSessionStateObs.read(reader);
      if (!state || state.hasGitOperationInProgress) {
        return;
      }
      this.logService.info(`[ChangesViewPane][_bindContextKeys] Context keys: ${JSON.stringify(state)}`);
      this.scopedContextKeyService.bufferChangeEvents(() => {
        this.isolationModeContextKey.set(state.isolationMode);
        this.hasGitRepositoryContextKey.set(state.hasGitRepository);
        this.isMergeBaseBranchProtectedContextKey.set(state.isMergeBaseBranchProtected === true);
        this.hasGitHubRemoteContextKey.set(state.hasGitHubRemote === true);
        this.hasPullRequestContextKey.set(state.hasPullRequest === true);
        this.hasOpenPullRequestContextKey.set(state.hasOpenPullRequest === true);
        this.hasUpstreamContextKey.set(state.upstreamBranchName !== void 0);
        this.hasIncomingChangesContextKey.set(state.incomingChanges !== void 0 && state.incomingChanges > 0);
        this.hasOutgoingChangesContextKey.set(state.outgoingChanges !== void 0 && state.outgoingChanges > 0);
        this.hasUncommittedChangesContextKey.set(state.uncommittedChanges !== void 0 && state.uncommittedChanges > 0);
        this.hasBranchChangesContextKey.set(state.hasBranchChanges === true);
        this.hasGitOperationInProgressContextKey.set(state.hasGitOperationInProgress === true);
      });
    }));
  }
  /** Layout the tree within its SplitView pane. */
  _layoutTreeInPane(paneHeight) {
    if (!this.tree) {
      return;
    }
    const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
    const treeHeight = Math.max(0, paneHeight - filesHeaderHeight);
    this.tree.layout(treeHeight, this.currentBodyWidth);
    this.tree.getHTMLElement().style.height = `${treeHeight}px`;
  }
  getTreePaneMinimumSize(reservedSectionHeight) {
    if (this.listContainer?.style.display === "none") {
      return EMPTY_FILE_CHANGES_MIN_HEIGHT;
    }
    const desiredSize = Math.max(this.getTreePaneDesiredSize(), this.getTreePaneReservedRowsSize());
    const availableSize = this.getSplitViewAvailableHeight() - reservedSectionHeight;
    return Math.min(desiredSize, Math.max(EMPTY_FILE_CHANGES_MIN_HEIGHT, availableSize));
  }
  getTreePaneDesiredSize() {
    if (this.listContainer?.style.display === "none") {
      return EMPTY_FILE_CHANGES_MIN_HEIGHT;
    }
    const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
    const treeContentHeight = this.tree?.contentHeight ?? 0;
    const bottomPadding = treeContentHeight > 0 ? TREE_PANE_LIST_BOTTOM_PADDING : 0;
    return filesHeaderHeight + treeContentHeight + bottomPadding;
  }
  /** Height needed to show {@link TREE_PANE_MIN_VISIBLE_ROWS} file rows, regardless of how many are listed. */
  getTreePaneReservedRowsSize() {
    const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
    return filesHeaderHeight + TREE_PANE_MIN_VISIBLE_ROWS * ChangesTreeDelegate.ROW_HEIGHT + TREE_PANE_LIST_BOTTOM_PADDING;
  }
  getTreePaneMaximumSize() {
    if (this.listContainer?.style.display === "none") {
      return EMPTY_FILE_CHANGES_MIN_HEIGHT;
    }
    return Math.max(this.getTreePaneDesiredSize(), this.getTreePaneReservedRowsSize());
  }
  fireTreePaneSizeChange() {
    this.treePaneSizeChange.fire(void 0);
  }
  /** Compute the height available to the SplitView within the body. */
  getSplitViewAvailableHeight() {
    const bodyHeight = this.currentBodyHeight;
    if (bodyHeight <= 0) {
      return 0;
    }
    const bodyPadding = 16;
    const actionsHeight = this.actionsContainer?.offsetHeight ?? 0;
    const actionsMargin = actionsHeight > 0 ? 8 : 0;
    return Math.max(0, bodyHeight - bodyPadding - actionsHeight - actionsMargin);
  }
  /** Layout the SplitView to fill available body space. */
  layoutSplitView() {
    if (!this.splitView || !this.splitViewContainer) {
      return;
    }
    const availableHeight = this.getSplitViewAvailableHeight();
    if (availableHeight <= 0) {
      return;
    }
    this.splitViewContainer.style.height = `${availableHeight}px`;
    this.splitView.layout(availableHeight);
    this.rebalanceSectionPanes?.();
  }
  /**
   * Wires a collapsible section widget (CI checks / other files) to its
   * SplitView pane: toggling its header collapses/restores the pane, and
   * changes to its content show/hide the pane and re-layout. Both section
   * widgets share the same structural contract so this logic is reused.
   */
  _wireSectionPane(widget, paneIndex, headerHeight, getPreferredHeight) {
    let savedPaneHeight = getPreferredHeight();
    this._register(widget.onDidToggleCollapsed((collapsed) => {
      if (!this.splitView) {
        return;
      }
      if (collapsed) {
        const currentSize = this.splitView.getViewSize(paneIndex);
        if (currentSize > headerHeight) {
          savedPaneHeight = currentSize;
        }
        this.splitView.resizeView(paneIndex, headerHeight);
      } else {
        this.splitView.resizeView(paneIndex, savedPaneHeight);
      }
      this.layoutSplitView();
    }));
    this._register(widget.onDidChangeHeight(() => {
      if (!this.splitView) {
        return;
      }
      const visible = widget.visible;
      const isCurrentlyVisible = this.splitView.isViewVisible(paneIndex);
      if (visible !== isCurrentlyVisible) {
        this.splitView.setViewVisible(paneIndex, visible);
        if (visible && !widget.collapsed && !this.sectionPanesUserResized) {
          savedPaneHeight = getPreferredHeight();
          this.splitView.resizeView(paneIndex, savedPaneHeight);
        }
      }
      this.layoutSplitView();
    }));
  }
  setActiveSectionCollapsed(section, collapsed) {
    const sessionResource = this.changesViewService.activeSessionResourceObs.get();
    if (sessionResource) {
      this.changesViewService.setSectionCollapsed(sessionResource, section, collapsed);
    }
  }
  getTreeSelection() {
    const selection = this.tree?.getSelection() ?? [];
    return selection.filter((item) => !!item && isChangesFileItem(item));
  }
  getTreeRootInfo(items) {
    if (items.length === 0) {
      return void 0;
    }
    const activeSession = this.sessionsService.activeSession.get();
    const folder = activeSession?.workspace.get()?.folders[0];
    if (!folder) {
      return void 0;
    }
    const workspaceFolderUri = folder.workingDirectory;
    if (workspaceFolderUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      const segments = workspaceFolderUri.path.split("/").filter(Boolean);
      return {
        root: {
          type: "root",
          uri: workspaceFolderUri,
          name: `${segments.slice(0, 2).join("/")} (${decodeURIComponent(segments[2])})`
        },
        resourceTreeRootUri: URI.from({ scheme: Schemas.copilotPr, path: "/" })
      };
    }
    const folderLabel = this.workspaceFolderLabelService.getWorkspaceFolderLabel(
      new WorkspaceFolder({ uri: folder.workingDirectory, name: folder.name, index: 0 }),
      true
    ) ?? folder.name;
    return {
      root: {
        type: "root",
        uri: workspaceFolderUri,
        name: folderLabel
      },
      resourceTreeRootUri: workspaceFolderUri
    };
  }
  getSessionDiscardRef() {
    const changeset = this.changesViewService.activeSessionChangesetObs.get();
    return changeset?.originalCheckpointRef.get() ?? "";
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.currentBodyHeight = height;
    this.currentBodyWidth = width;
    this.layoutSplitView();
  }
  focus() {
    super.focus();
    if (this.tree && this.tree.getNode(null).visibleChildrenCount > 0) {
      this.tree.domFocus();
    }
  }
  renderSidebarList(container, onDidLayout, contextKeyService, items, openFileItem) {
    const disposables = new DisposableStore();
    container.classList.add("changes-file-list");
    const viewMode = this.changesViewService.viewModeObs.get();
    container.classList.toggle("list-mode", viewMode === ChangesViewMode.List);
    const headerNode = dom.append(container, $(".changes-sidebar-header"));
    const headerLabel = dom.append(headerNode, $("span"));
    headerLabel.textContent = localize("changes", "Changes");
    const countBadge = disposables.add(new CountBadge(headerNode, { count: items.length }, defaultCountBadgeStyles));
    countBadge.setCount(items.length);
    const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter((item) => !!item && isChangesFileItem(item)), contextKeyService);
    if (viewMode === ChangesViewMode.Tree) {
      tree.setChildren(null, buildTreeChildren(items, this.getTreeRootInfo(items)));
    } else {
      tree.setChildren(null, items.map((item) => ({ element: item, collapsible: false })));
    }
    let updatingSelection = false;
    disposables.add(tree.onDidOpen((e) => {
      if (e.element && isChangesFileItem(e.element) && !updatingSelection) {
        openFileItem(
          e.element,
          items,
          e.sideBySide,
          !!e.editorOptions.preserveFocus,
          !!e.editorOptions.pinned,
          false
          /* preserve existing sidebar */
        );
      }
    }));
    disposables.add(Event.runAndSubscribe(this.editorService.onDidActiveEditorChange, () => {
      const activeEditor = this.editorService.activeEditor;
      if (!activeEditor) {
        return;
      }
      const primaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      const secondaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
      const index = items.findIndex(
        (i) => primaryResource !== void 0 && isEqual(i.uri, primaryResource) || secondaryResource !== void 0 && i.originalUri !== void 0 && isEqual(i.originalUri, secondaryResource)
      );
      if (index >= 0) {
        updatingSelection = true;
        try {
          tree.setFocus([items[index]]);
          tree.setSelection([items[index]]);
          tree.reveal(items[index]);
        } finally {
          updatingSelection = false;
        }
      }
    }));
    disposables.add(onDidLayout((e) => {
      const headerHeight = headerNode.offsetHeight;
      tree.layout(Math.max(0, e.height - headerHeight), e.width);
    }));
    return disposables;
  }
  createChangesTree(container, onDidChangeVisibility, disposables, getSelection, contextKeyService) {
    const treeInstantiationService = contextKeyService ? disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService]))) : this.instantiationService;
    const resourceLabels = disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility }));
    const actionRunner = disposables.add(new ChangesViewActionRunner(
      () => this.changesViewService.activeSessionResourceObs.get(),
      () => this.getSessionDiscardRef(),
      getSelection ?? (() => this.getTreeSelection())
    ));
    return disposables.add(treeInstantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "ChangesViewTree",
      container,
      new ChangesTreeDelegate(),
      [this.instantiationService.createInstance(
        ChangesTreeRenderer,
        resourceLabels,
        actionRunner,
        () => {
          const activeSession = this.sessionsService.activeSession.get();
          const folder = activeSession?.workspace.get()?.folders[0];
          return folder?.root.scheme === GITHUB_REMOTE_FILE_SCHEME ? URI.from({ scheme: Schemas.copilotPr, path: "/" }) : folder?.workingDirectory;
        }
      )],
      {
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => isChangesFileItem(element) ? basename(element.uri) : element.name,
          getWidgetAriaLabel: () => localize("changesViewTree", "Changes Tree")
        },
        dnd: {
          getDragURI: (element) => element.uri.toString(),
          getDragLabel: (elements) => {
            const uris = elements.map((e) => e.uri);
            if (uris.length === 1) {
              return this.labelService.getUriLabel(uris[0], { relative: true });
            }
            return `${uris.length}`;
          },
          dispose: () => {
          },
          onDragOver: () => false,
          drop: () => {
          },
          onDragStart: (data, originalEvent) => {
            try {
              const elements = data.getData();
              const uris = elements.filter(isChangesFileItem).map((e) => e.uri);
              this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, uris, originalEvent));
            } catch {
            }
          }
        },
        identityProvider: {
          getId: (element) => element.uri.toString()
        },
        indent: this.changesViewService.viewModeObs.get() === ChangesViewMode.List ? 0 : 8,
        compressionEnabled: true,
        sorter: new ChangesTreeSorter(() => this.changesViewService.viewModeObs.get()),
        twistieAdditionalCssClass: (e) => {
          return this.changesViewService.viewModeObs.get() === ChangesViewMode.List ? "force-no-twistie" : void 0;
        }
      }
    ));
  }
  async openChanges(resource) {
    const items = this.changesViewService.activeSessionChangesObs.get();
    if (items.length === 0) {
      return;
    }
    if (this.shouldOpenModalDiff()) {
      const changes = toIChangesFileItem(items);
      const changeToOpen = resource ? changes.find((c) => isEqual(c.uri, resource)) : void 0;
      await this._openFileItem(changeToOpen ?? changes[0], changes, false, false, false, changes.length > 1);
      return;
    }
    await this._openMultiFileDiffEditor(resource);
  }
  /**
   * Renders the files header (Branch Changes dropdown + diff stats) into the panel.
   * Standard layout only; {@link SinglePaneChangesViewPane} overrides this to a no-op
   * because the header lives in the custom Changes editor instead.
   */
  createFilesHeader(contentContainer) {
    this.filesHeaderNode = dom.append(contentContainer, $(".changes-files-header"));
    const filesHeaderToolbarContainer = dom.append(this.filesHeaderNode, $(".changes-files-header-toolbar"));
    this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, filesHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderToolbar, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action) => {
        if (action.id === "chatEditing.versionsPicker" && action instanceof MenuItemAction) {
          return this.scopedInstantiationService.createInstance(ChangesPickerActionItem, action);
        }
        return void 0;
      }
    }));
    this.fileHeaderToolbarContainer = dom.append(this.filesHeaderNode, $(".changes-files-header-right-toolbar"));
    this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.fileHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderRightToolbar, {
      menuOptions: { shouldForwardArgs: true },
      actionViewItemProvider: (action, options) => {
        if (action.id === ChangesDiffStatsAction.ID && action instanceof MenuItemAction) {
          return this.scopedInstantiationService.createInstance(ChangesDiffStatsActionItem, action, options);
        }
        return void 0;
      }
    }));
  }
  /**
   * Renders the Create-PR actions button bar into the actions container. Standard
   * layout only; {@link SinglePaneChangesViewPane} overrides this to a no-op because
   * the actions render in the Changes editor header instead.
   */
  createActionsButtonBar() {
    if (!this.actionsContainer) {
      return;
    }
    const isAgentHostSessionObs = derived((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      return activeSession ? isAgentHostProviderId(activeSession.providerId) : false;
    });
    this.renderDisposables.add(autorun((reader) => {
      dom.clearNode(this.actionsContainer);
      const isAgentHostSession = isAgentHostSessionObs.read(reader);
      const widget = isAgentHostSession ? this.scopedInstantiationService.createInstance(ChangesWorkbenchButtonBarWidget, this.actionsContainer) : this.scopedInstantiationService.createInstance(ChangesMenuWorkbenchButtonBarWidget, this.actionsContainer, this.hasGitOperationInProgressObs);
      reader.store.add(widget);
    }));
  }
  /**
   * Whether the actions container should be shown for the given session state.
   * Standard layout shows it for non-untitled sessions; {@link SinglePaneChangesViewPane}
   * never shows it (the actions live in the Changes editor).
   */
  isActionsContainerVisible(isUntitled) {
    return !isUntitled;
  }
  /**
   * Whether clicking a file opens the modal single-file diff. {@link SinglePaneChangesViewPane}
   * never uses the modal editor.
   */
  shouldOpenModalDiff() {
    return this.configurationService.getValue("workbench.editor.useModal") === "all";
  }
  /**
   * Whether clicking a file opens a single-file diff by default (vs the
   * multi-file diff editor). Alt inverts this.
   */
  shouldOpenSingleFileDiffByDefault() {
    return this.configurationService.getValue(SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING);
  }
  /**
   * Reveal the CI checks section: expand it if collapsed and move keyboard
   * focus into it. No-op when there are no checks to show.
   */
  revealChecks() {
    if (!this.ciStatusWidget || !this.ciStatusWidget.visible) {
      return;
    }
    this.ciStatusWidget.expand();
    this.ciStatusWidget.focus();
  }
  async _openFileItem(item, items, sideBySide, preserveFocus, pinned, includeSidebar) {
    const { uri: modifiedFileUri, originalUri, isDeletion } = item;
    const currentIndex = items.indexOf(item);
    const sidebar = includeSidebar ? {
      render: (container, onDidLayout, contextKeyService) => {
        return this.renderSidebarList(container, onDidLayout, contextKeyService, items, this._openFileItem.bind(this));
      }
    } : void 0;
    const navigation = {
      total: items.length,
      current: currentIndex,
      navigate: (index) => {
        const target = items[index];
        if (target) {
          this._openFileItem(target, items, false, false, false, includeSidebar);
        }
      }
    };
    const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    const labels = getChangesEditorLabels(item.uri, this.labelService);
    if (isDeletion && originalUri) {
      this.editorService.openEditor({
        resource: originalUri,
        ...labels,
        options: { preserveFocus, pinned, modal: { sidebar, navigation } }
      }, group);
      return;
    }
    if (originalUri) {
      this.editorService.openEditor({
        original: { resource: originalUri },
        modified: { resource: modifiedFileUri },
        ...labels,
        options: { preserveFocus, pinned, modal: { sidebar, navigation } }
      }, group);
      return;
    }
    this.editorService.openEditor({
      resource: modifiedFileUri,
      ...labels,
      options: { preserveFocus, pinned, modal: { sidebar, navigation } }
    }, group);
  }
  async _openSingleFileDiffEditor(item, sideBySide, preserveFocus, pinned) {
    const { uri, originalUri, isDeletion } = item;
    const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    const labels = getChangesEditorLabels(uri, this.labelService);
    const modifiedUri = isDeletion ? void 0 : uri;
    const pane = await this.editorService.openEditor({
      original: { resource: originalUri },
      modified: { resource: modifiedUri },
      ...labels,
      options: { preserveFocus, pinned }
    }, group);
    const control = pane?.getControl();
    if (pane && isDiffEditor(control)) {
      const openedInput = pane.input;
      control.updateOptions({ hideUnchangedRegions: { enabled: false } });
      const listener = pane.group.onDidActiveEditorChange(() => {
        if (pane.group.activeEditor === openedInput) {
          return;
        }
        listener.dispose();
        control.updateOptions({ hideUnchangedRegions: { enabled: this.configurationService.getValue("diffEditor.hideUnchangedRegions.enabled") } });
      });
      this._register(listener);
    }
  }
  async _openMultiFileDiffEditor(reveal) {
    const sessionResource = this.changesViewService.activeSessionResourceObs.get();
    const changes = this.changesViewService.activeSessionChangesObs.get();
    if (!sessionResource || changes.length === 0) {
      return;
    }
    this.workbenchLayoutService.revealEditorPartExplicitly();
    let options;
    if (reveal) {
      const target = changes.find((c) => isChangesFileResource(c, reveal));
      if (target) {
        options = {
          viewState: {
            revealData: {
              resource: {
                original: target.originalUri,
                modified: target.modifiedUri
              }
            }
          }
        };
      }
    }
    await this.sessionChangesService.openChangesEditor(sessionResource, options);
  }
  dispose() {
    this.tree = void 0;
    super.dispose();
  }
};
ChangesViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IChangesViewService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, ISessionsService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, ILogService),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, ISessionChangesService),
  __decorateParam(17, IWorkbenchLayoutService),
  __decorateParam(18, IWorkspaceFolderLabelService)
], ChangesViewPane);
class SinglePaneChangesViewPane extends ChangesViewPane {
  createFilesHeader(_contentContainer) {
  }
  createActionsButtonBar() {
  }
  isActionsContainerVisible(_isUntitled) {
    return false;
  }
  shouldOpenModalDiff() {
    return false;
  }
}
let ChangesViewPaneContainer = class extends ViewPaneContainer {
  constructor(layoutService, telemetryService, instantiationService, contextMenuService, themeService, storageService, configurationService, extensionService, contextService, viewDescriptorService, logService) {
    super(CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
  }
  create(parent) {
    super.create(parent);
    parent.classList.add("changes-viewlet");
  }
};
ChangesViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, ILogService)
], ChangesViewPaneContainer);
class ChangesViewActionRunner extends ActionRunner {
  constructor(getSessionResource, getSessionDiscardRef, getSelectedFileItems) {
    super();
    this.getSessionResource = getSessionResource;
    this.getSessionDiscardRef = getSessionDiscardRef;
    this.getSelectedFileItems = getSelectedFileItems;
  }
  async runAction(action, context) {
    if (!(action instanceof MenuItemAction)) {
      return super.runAction(action, context);
    }
    const sessionResource = this.getSessionResource();
    const discardRef = this.getSessionDiscardRef();
    const selection = this.getSelectedFileItems();
    const contextIsSelected = selection.some((s) => s === context);
    const actualContext = contextIsSelected ? selection : [context];
    const args = actualContext.map((e) => {
      if (ResourceTree.isResourceNode(e)) {
        return ResourceTree.collect(e);
      }
      return isChangesFileItem(e) ? [e] : [];
    }).flat();
    await action.run(sessionResource, discardRef, ...args.map((item) => item.uri));
  }
}
const _ChangesTreeDelegate = class _ChangesTreeDelegate {
  getHeight(_element) {
    return _ChangesTreeDelegate.ROW_HEIGHT;
  }
  getTemplateId(_element) {
    return ChangesTreeRenderer.TEMPLATE_ID;
  }
};
_ChangesTreeDelegate.ROW_HEIGHT = 22;
let ChangesTreeDelegate = _ChangesTreeDelegate;
class ChangesTreeSorter {
  constructor(viewMode) {
    this.viewMode = viewMode;
  }
  compare(a, b) {
    if (this.viewMode() === ChangesViewMode.List) {
      const aPath = a.uri.fsPath;
      const bPath = b.uri.fsPath;
      return comparePaths(aPath, bPath);
    }
    const aIsDirectory = ResourceTree.isResourceNode(a);
    const bIsDirectory = ResourceTree.isResourceNode(b);
    if (aIsDirectory !== bIsDirectory) {
      return aIsDirectory ? -1 : 1;
    }
    const aName = ResourceTree.isResourceNode(a) ? a.name : basename(a.uri);
    const bName = ResourceTree.isResourceNode(b) ? b.name : basename(b.uri);
    return compareFileNames(aName, bName);
  }
}
class SetChangesListViewModeAction extends ViewAction {
  constructor() {
    super({
      id: "workbench.changesView.action.setListViewMode",
      title: localize("setListViewMode", "View as List"),
      viewId: CHANGES_VIEW_ID,
      f1: false,
      icon: Codicon.listFlat,
      toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List),
      menu: {
        id: MenuId.ChatEditingSessionTitleToolbar,
        group: "1_viewmode",
        order: 1
      }
    });
  }
  async runInView(accessor, _view) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.List);
  }
}
class SetChangesTreeViewModeAction extends ViewAction {
  constructor() {
    super({
      id: "workbench.changesView.action.setTreeViewMode",
      title: localize("setTreeViewMode", "View as Tree"),
      viewId: CHANGES_VIEW_ID,
      f1: false,
      icon: Codicon.listTree,
      toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree),
      menu: {
        id: MenuId.ChatEditingSessionTitleToolbar,
        group: "1_viewmode",
        order: 2
      }
    });
  }
  async runInView(accessor, _view) {
    logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
    accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
  }
}
registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);
const _VersionsPickerAction = class _VersionsPickerAction extends Action2 {
  constructor() {
    super({
      id: _VersionsPickerAction.ID,
      title: localize2("chatEditing.versionsPicker", "Versions"),
      category: CHAT_CATEGORY,
      icon: Codicon.listFilter,
      f1: false,
      menu: [{
        id: MenuId.ChatEditingSessionChangesFileHeaderToolbar,
        group: "navigation",
        order: 9,
        when: ActiveSessionContextKeys.HasGitRepository
      }, {
        id: Menus.SessionsEditorHeaderPrimary,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.and(singlePaneChangesEditorHeader, ActiveSessionContextKeys.HasGitRepository)
      }]
    });
  }
  async run() {
  }
};
_VersionsPickerAction.ID = "chatEditing.versionsPicker";
let VersionsPickerAction = _VersionsPickerAction;
registerAction2(VersionsPickerAction);
let ChangesPickerActionItem = class extends ActionWidgetDropdownActionViewItem {
  constructor(action, actionWidgetService, keybindingService, contextKeyService, changesViewService, telemetryService) {
    const actionProvider = {
      getActions: () => {
        const changesets = changesViewService.activeSessionChangesetsObs.get() ?? [];
        const selectedChangeset = changesViewService.activeSessionChangesetObs.get();
        return changesets.map((changeset) => ({
          ...action,
          id: `agents.changes.changeset.${changeset.id}`,
          label: changeset.label,
          detail: changeset.description,
          checked: selectedChangeset?.id === changeset.id,
          category: {
            label: changeset.category ?? "",
            showHeader: false,
            order: 0
          },
          enabled: changeset.isEnabled.get(),
          run: async () => {
            changesViewService.setChangesetId(changeset.id);
            logChangesViewVersionModeChange(this.telemetryService, changeset.id);
          }
        }));
      }
    };
    super(action, { actionProvider, listOptions: { detailItemHeight: 44 } }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.changesViewService = changesViewService;
    this.telemetryService = telemetryService;
    this._register(autorun((reader) => {
      changesViewService.activeSessionChangesetObs.read(reader);
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
  }
  render(container) {
    super.render(container);
    container.classList.add("changes-picker-action-rich");
  }
  renderLabel(element) {
    const changeset = this.changesViewService.activeSessionChangesetObs.get();
    if (!changeset) {
      return null;
    }
    dom.reset(element, dom.$("span", void 0, changeset.label), ...renderLabelWithIcons("$(chevron-down)"));
    this.updateAriaLabel();
    return null;
  }
};
ChangesPickerActionItem = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChangesViewService),
  __decorateParam(5, ITelemetryService)
], ChangesPickerActionItem);
const _ChangesDiffStatsAction = class _ChangesDiffStatsAction extends Action2 {
  constructor() {
    super({
      id: _ChangesDiffStatsAction.ID,
      title: localize2("changesView.viewChanges", "View All Changes"),
      f1: false,
      menu: [{
        id: MenuId.ChatEditingSessionChangesFileHeaderRightToolbar,
        group: "navigation",
        order: 1,
        when: ChatContextKeys.hasAgentSessionChanges
      }, {
        id: Menus.SessionsEditorHeaderPrimary,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(singlePaneChangesEditorHeader, ChatContextKeys.hasAgentSessionChanges)
      }]
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(CHANGES_VIEW_ID);
    await view?.openChanges();
  }
};
_ChangesDiffStatsAction.ID = "workbench.changesView.action.viewChanges";
let ChangesDiffStatsAction = _ChangesDiffStatsAction;
registerAction2(ChangesDiffStatsAction);
const _RevealCIChecksAction = class _RevealCIChecksAction extends Action2 {
  constructor() {
    super({
      id: _RevealCIChecksAction.ID,
      title: localize2("revealChecks", "Reveal Checks"),
      category: CHAT_CATEGORY,
      f1: false
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = await viewsService.openView(CHANGES_VIEW_ID, true);
    view?.revealChecks();
  }
};
_RevealCIChecksAction.ID = REVEAL_CI_CHECKS_COMMAND_ID;
let RevealCIChecksAction = _RevealCIChecksAction;
registerAction2(RevealCIChecksAction);
let ChangesDiffStatsActionItem = class extends ActionViewItem {
  constructor(action, options, instantiationService) {
    super(null, action, { ...options, icon: false, label: false });
    this._widget = this._register(instantiationService.createInstance(ChangesSummaryWidget));
    this._register(autorun((reader) => {
      const changesSummary = this._widget.summary.read(reader);
      if (changesSummary === void 0) {
        return;
      }
      this.updateTooltip();
    }));
  }
  render(container) {
    super.render(container);
    container.classList.add("changes-diff-stats-action");
    if (!this.label) {
      return;
    }
    this.renderLabelContents(this.label);
  }
  /**
   * Renders the diff-stats content into the action label. The base shows the
   * animated +/- summary; {@link SinglePaneChangesDiffStatsActionItem} overrides
   * this to a richer "N files +X -Y" label for the single-pane editor header.
   */
  renderLabelContents(label) {
    this._widget.render(label);
  }
  getTooltip() {
    const changesSummary = this._widget.summary.get();
    if (changesSummary === void 0) {
      return void 0;
    }
    const { files, additions, deletions } = changesSummary;
    return localize("changesView.diffStats.label", "{0} files, {1} additions, {2} deletions", files, additions, deletions);
  }
};
ChangesDiffStatsActionItem = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChangesDiffStatsActionItem);
class SinglePaneChangesDiffStatsActionItem extends ChangesDiffStatsActionItem {
  render(container) {
    super.render(container);
    container.classList.add("changes-diff-stats-action-rich");
  }
  renderLabelContents(label) {
    this._register(autorun((reader) => {
      const summary = this._widget.summary.read(reader);
      if (summary === void 0) {
        return;
      }
      const { files, additions, deletions } = summary;
      const filesLabel = files === 1 ? localize("changesView.diffStats.file", "1 file") : localize("changesView.diffStats.files", "{0} files", files);
      dom.reset(
        label,
        dom.$("span.changes-diff-stats-files", void 0, filesLabel),
        dom.$("span.working-set-lines-added", void 0, `+${additions}`),
        dom.$("span.working-set-lines-removed", void 0, `-${deletions}`)
      );
    }));
  }
}
export {
  CHANGES_HEADER_ACTIONS_ID,
  ChangesActionsBar,
  ChangesActionsBarActionViewItem,
  ChangesPickerActionItem,
  ChangesViewPane,
  ChangesViewPaneContainer,
  SinglePaneChangesDiffStatsActionItem,
  SinglePaneChangesViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hhbmdlc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhbmdlc1ZpZXcuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVFbGVtZW50LCBJVHJlZVNvcnRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgc3RyaXBJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoQnV0dG9uQmFyLCBXb3JrYmVuY2hCdXR0b25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYnV0dG9uYmFyLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIEFjdGlvbjIsIE1lbnVJdGVtQWN0aW9uLCByZWdpc3RlckFjdGlvbjIsIElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Jc0FjdGl2ZUNvbnRleHQsIFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0IH0gZnJvbSAnLi9zZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lLCBJVmlld1BhbmVPcHRpb25zLCBWaWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvdmlld3MvZXhwbG9yZXJWaWV3LmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUZvbGRlckxhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvbXVsdGlEaWZmRWRpdG9yV2lkZ2V0SW1wbC5qcyc7XG5pbXBvcnQgeyBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGdldENoYW5nZXNFZGl0b3JMYWJlbHMgfSBmcm9tICcuL2NoYW5nZXNFZGl0b3JMYWJlbHMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGFuZ2VzU2VydmljZSB9IGZyb20gJy4vc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSVN0YXR1c1dpZGdldCB9IGZyb20gJy4vY2hlY2tzV2lkZ2V0LmpzJztcbmltcG9ydCB7IFNlc3Npb25GaWxlc1dpZGdldCB9IGZyb20gJy4vc2Vzc2lvbkZpbGVzV2lkZ2V0LmpzJztcbmltcG9ydCB7IFNlc3Npb25GaWxlc1ZpZXdNb2RlbCB9IGZyb20gJy4vc2Vzc2lvbkZpbGVzVmlld01vZGVsLmpzJztcbmltcG9ydCB7IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uLCBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUsIFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFByb3ZpZGVySWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSVZpZXcsIExheW91dFByaW9yaXR5LCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgUEFORUxfU0VDVElPTl9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBsb2dDaGFuZ2VzVmlld0ZpbGVTZWxlY3QsIGxvZ0NoYW5nZXNWaWV3VmVyc2lvbk1vZGVDaGFuZ2UsIGxvZ0NoYW5nZXNWaWV3Vmlld01vZGVDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Vzc2lvbnNUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hlY2tzVmlld01vZGVsIH0gZnJvbSAnLi9jaGVja3NWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgUkVWRUFMX0NJX0NIRUNLU19DT01NQU5EX0lEIH0gZnJvbSAnLi9jaGVja3NBY3Rpb25zLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJucyAtLSBUT0RPOiBtb3ZlIHNraWxsIGJ1dHRvbiBjb25zdGFudHMgb3V0IG9mIHByb3ZpZGVyc1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TS0lMTF9CVVRUT05fVVBEQVRFX1BSX0lELCBpc0FnZW50SG9zdFNraWxsQnV0dG9uSWQgfSBmcm9tICcuLi8uLi9wcm92aWRlcnMvYWdlbnRIb3N0L2Jyb3dzZXIvYWdlbnRIb3N0U2tpbGxCdXR0b25zLmpzJztcbmltcG9ydCB7IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cywgQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgQ0hBTkdFU19WSUVXX0lELCBDaGFuZ2VzQ29udGV4dEtleXMsIENoYW5nZXNWaWV3TW9kZSwgSXNvbGF0aW9uTW9kZSwgU0VTU0lPTlNfQ0hBTkdFU19PUEVOX1NJTkdMRV9GSUxFX0RJRkZfU0VUVElORyB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzLmpzJztcbmltcG9ydCB7IGJ1aWxkVHJlZUNoaWxkcmVuLCBDaGFuZ2VzVHJlZUVsZW1lbnQsIENoYW5nZXNUcmVlUmVuZGVyZXIsIElDaGFuZ2VzRmlsZUl0ZW0sIElDaGFuZ2VzVHJlZVJvb3RJbmZvLCBpc0NoYW5nZXNGaWxlSXRlbSwgaXNDaGFuZ2VzRmlsZVJlc291cmNlLCB0b0lDaGFuZ2VzRmlsZUl0ZW0gfSBmcm9tICcuL2NoYW5nZXNWaWV3UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VUcmVlLmpzJztcbmltcG9ydCB7IGNvbXBhcmVGaWxlTmFtZXMsIGNvbXBhcmVQYXRocyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbXBhcmVycy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzVmlld1NlY3Rpb24sIElDaGFuZ2VzRGV0YWlsc1ZpZXdTdGF0ZSwgSUNoYW5nZXNEZXRhaWxzVmlld1N0YXRlVHJhbnNmZXIsIElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5V2lkZ2V0IH0gZnJvbSAnLi9jaGFuZ2VzU3VtbWFyeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vLyAtLS0gQ29uc3RhbnRzXG5cbmNvbnN0IFJVTl9TRVNTSU9OX0NPREVfUkVWSUVXX0FDVElPTl9JRCA9ICdzZXNzaW9ucy5jb2RlUmV2aWV3LnJ1bic7XG5jb25zdCBWRVJTSU9OU19QSUNLRVJfQUNUSU9OX0lEID0gJ2NoYXRFZGl0aW5nLnZlcnNpb25zUGlja2VyJztcbmNvbnN0IERJRkZfU1RBVFNfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5jaGFuZ2VzVmlldy5hY3Rpb24udmlld0NoYW5nZXMnO1xuY29uc3Qgc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JIZWFkZXIgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCxcblx0QWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dC5FRElUT1JfSUQpXG4pO1xuY29uc3QgRU1QVFlfRklMRV9DSEFOR0VTX01JTl9IRUlHSFQgPSAxNDA7XG5cbi8qKiBCcmVhdGhpbmcgcm9vbSByZW5kZXJlZCBiZW5lYXRoIHRoZSBsYXN0IGZpbGUgcm93IHdoZW4gdGhlIHdob2xlIGxpc3QgZml0cy4gKi9cbmNvbnN0IFRSRUVfUEFORV9MSVNUX0JPVFRPTV9QQURESU5HID0gMTI7XG5cbi8qKiBUaGUgZmlsZSBjaGFuZ2VzIHNlY3Rpb24gYWx3YXlzIHJlc2VydmVzIHJvb20gZm9yIGF0IGxlYXN0IHRoaXMgbWFueSBmaWxlIHJvd3MuICovXG5jb25zdCBUUkVFX1BBTkVfTUlOX1ZJU0lCTEVfUk9XUyA9IDU7XG5cbi8vIC0tLSBCdXR0b25CYXIgd2lkZ2V0XG5cbi8qKlxuICogQ29tbW9uIHN1cmZhY2UgZm9yIHRoZSBjaGFuZ2VzIGFjdGlvbiBidXR0b24tYmFyIHdpZGdldHMgc28gaG9zdHMgKGUuZy4gdGhlXG4gKiBlZGl0b3ItdGl0bGUgYWN0aW9ucyBiYXIpIGNhbiByZWFjdCB0byBhbmQgcXVlcnkgd2hldGhlciBhbnkgYWN0aW9uIHJlbmRlcmVkLlxuICovXG5pbnRlcmZhY2UgSUNoYW5nZXNCdXR0b25CYXJXaWRnZXQgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdC8qKiBGaXJlcyB3aGVuZXZlciB0aGUgcmVuZGVyZWQgYWN0aW9ucyBjaGFuZ2UuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aW9uczogRXZlbnQ8dm9pZD47XG5cdC8qKiBXaGV0aGVyIHRoZSB3aWRnZXQgY3VycmVudGx5IHJlbmRlcnMgYXQgbGVhc3Qgb25lIGFjdGlvbi4gKi9cblx0cmVhZG9ubHkgaGFzQWN0aW9uczogYm9vbGVhbjtcbn1cblxuY2xhc3MgQ2hhbmdlc01lbnVXb3JrYmVuY2hCdXR0b25CYXJXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYW5nZXNCdXR0b25CYXJXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGlvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY3VycmVudEJ1dHRvbkJhcjogTWVudVdvcmtiZW5jaEJ1dHRvbkJhciB8IHVuZGVmaW5lZDtcblx0Z2V0IGhhc0FjdGlvbnMoKTogYm9vbGVhbiB7IHJldHVybiAodGhpcy5fY3VycmVudEJ1dHRvbkJhcj8uYnV0dG9ucy5sZW5ndGggPz8gMCkgPiAwOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgY2hhbmdlc1ZpZXdTZXJ2aWNlOiBJQ2hhbmdlc1ZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG91dGdvaW5nQ2hhbmdlc09icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPG51bWJlciB8IHVuZGVmaW5lZD4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uU3RhdGUgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblN0YXRlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPSBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uU3RhdGU/Lm91dGdvaW5nQ2hhbmdlcztcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJ1bm5pbmdMYWJlbE9icyA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklzQWN0aXZlT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudChjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsICgpID0+IFNlc3Npb25Jc0FjdGl2ZUNvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpID8/IGZhbHNlKTtcblxuXHRcdC8vIENsZWFyIHRoZSBydW5uaW5nIGxhYmVsIG92ZXJyaWRlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRydW5uaW5nTGFiZWxPYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzID0gaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRzZXNzaW9uSXNBY3RpdmVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBvdXRnb2luZ0NoYW5nZXMgPSBvdXRnb2luZ0NoYW5nZXNPYnMucmVhZChyZWFkZXIpID8/IDA7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbkJhciA9IG5ldyBNZW51V29ya2JlbmNoQnV0dG9uQmFyKFxuXHRcdFx0XHRjb250YWluZXIsXG5cdFx0XHRcdE1lbnVJZC5BZ2VudHNDaGFuZ2VzVG9vbGJhcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NoYW5nZXNWaWV3Jyxcblx0XHRcdFx0XHRyZW5kZXJTZWNvbmRhcnlBY3Rpb25zOiBmYWxzZSxcblx0XHRcdFx0XHRtZW51T3B0aW9uczogc2Vzc2lvblJlc291cmNlXG5cdFx0XHRcdFx0XHQ/IHsgYXJnOiBzZXNzaW9uUmVzb3VyY2UgfVxuXHRcdFx0XHRcdFx0OiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdFx0YnV0dG9uQ29uZmlnUHJvdmlkZXI6IChhY3Rpb24sIGluZGV4KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5fZ2V0QnV0dG9uQ29uZmlndXJhdGlvbihhY3Rpb24sIG91dGdvaW5nQ2hhbmdlcywgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcywgcnVubmluZ0xhYmVsT2JzKTtcblx0XHRcdFx0XHRcdHJldHVybiBpbmRleCA9PT0gMFxuXHRcdFx0XHRcdFx0XHQ/IHsgLi4uY29uZmlndXJhdGlvbiwgc2hvd0ljb246IGZhbHNlLCBzaG93TGFiZWw6IHRydWUgfVxuXHRcdFx0XHRcdFx0XHQ6IGNvbmZpZ3VyYXRpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGhvdmVyU2VydmljZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU2V0IHRoZSBydW5uaW5nIGxhYmVsIG92ZXJyaWRlXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGJ1dHRvbkJhci5vbldpbGxSdW4oZSA9PiBydW5uaW5nTGFiZWxPYnMuc2V0KGUuYWN0aW9uLmxhYmVsLCB1bmRlZmluZWQpKSk7XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRCdXR0b25CYXIgPSBidXR0b25CYXI7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGJ1dHRvbkJhci5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUFjdGlvbnMuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGlvbnMuZmlyZSgpO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGJ1dHRvbkJhcik7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QnV0dG9uQ29uZmlndXJhdGlvbihhY3Rpb246IElBY3Rpb24sIG91dGdvaW5nQ2hhbmdlczogbnVtYmVyLCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzOiBib29sZWFuLCBydW5uaW5nTGFiZWxPYnM6IElPYnNlcnZhYmxlPHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4pOiB7IHNob3dJY29uOiBib29sZWFuOyBzaG93TGFiZWw6IGJvb2xlYW47IGlzU2Vjb25kYXJ5PzogYm9vbGVhbjsgY3VzdG9tTGFiZWw/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7IGN1c3RvbUxhYmVsT2JzPzogSU9ic2VydmFibGU8c3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPjsgY3VzdG9tQ2xhc3M/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKFxuXHRcdFx0YWN0aW9uLmlkID09PSAnZ2l0aHViLmNvcGlsb3Quc2Vzc2lvbnMuY29tbWl0JyB8fFxuXHRcdFx0YWN0aW9uLmlkID09PSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5jcmVhdGVQdWxsUmVxdWVzdENvcGlsb3RDTElBZ2VudFNlc3Npb24uY3JlYXRlUFInXG5cdFx0KSB7XG5cdFx0XHRpZiAoIWhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogdHJ1ZSwgaXNTZWNvbmRhcnk6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXN0b21MYWJlbE9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcnVubmluZyA9IHJ1bm5pbmdMYWJlbE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJldHVybiBgJChsb2FkaW5nKSAke3J1bm5pbmcgPz8gYWN0aW9uLmxhYmVsfWA7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHNob3dJY29uOiBmYWxzZSwgc2hvd0xhYmVsOiB0cnVlLCBpc1NlY29uZGFyeTogZmFsc2UsIGN1c3RvbUxhYmVsT2JzIH07XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LnNlc3Npb25zLnN5bmMnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5zZXNzaW9ucy5jb21taXRBbmRTeW5jJ1xuXHRcdCkge1xuXHRcdFx0Y29uc3QgbGFiZWxXaXRoQ291bnQgPSBvdXRnb2luZ0NoYW5nZXMgPiAwXG5cdFx0XHRcdD8gYCR7YWN0aW9uLmxhYmVsfSAke291dGdvaW5nQ2hhbmdlc31cdTIxOTFgXG5cdFx0XHRcdDogYCR7YWN0aW9uLmxhYmVsfWA7XG5cdFx0XHRpZiAoIWhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogdHJ1ZSwgaXNTZWNvbmRhcnk6IGZhbHNlLCBjdXN0b21MYWJlbDogbGFiZWxXaXRoQ291bnQgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHNob3dJY29uOiBmYWxzZSwgc2hvd0xhYmVsOiB0cnVlLCBpc1NlY29uZGFyeTogZmFsc2UsIGN1c3RvbUxhYmVsOiBgJChsb2FkaW5nKSAke2xhYmVsV2l0aENvdW50fWAgfTtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbi5pZCA9PT0gQUdFTlRfSE9TVF9TS0lMTF9CVVRUT05fVVBEQVRFX1BSX0lEKSB7XG5cdFx0XHRjb25zdCBjdXN0b21MYWJlbCA9IG91dGdvaW5nQ2hhbmdlcyA+IDBcblx0XHRcdFx0PyBgJHthY3Rpb24ubGFiZWx9ICR7b3V0Z29pbmdDaGFuZ2VzfVx1MjE5MWBcblx0XHRcdFx0OiBhY3Rpb24ubGFiZWw7XG5cdFx0XHRyZXR1cm4geyBjdXN0b21MYWJlbCwgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogdHJ1ZSwgaXNTZWNvbmRhcnk6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdGFjdGlvbi5pZCA9PT0gUlVOX1NFU1NJT05fQ09ERV9SRVZJRVdfQUNUSU9OX0lEIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdjaGF0RWRpdGluZy52aWV3QWxsU2Vzc2lvbkNoYW5nZXMnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jaGF0Lm9wZW5QdWxsUmVxdWVzdENvcGlsb3RDTElBZ2VudFNlc3Npb24ub3BlblBSJ1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogZmFsc2UsIGlzU2Vjb25kYXJ5OiB0cnVlIH07XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24uaWQgPT09ICdhZ2VudEZlZWRiYWNrRWRpdG9yLmFjdGlvbi5zdWJtaXRBY3RpdmVTZXNzaW9uJykge1xuXHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IGZhbHNlLCBzaG93TGFiZWw6IHRydWUsIGlzU2Vjb25kYXJ5OiBmYWxzZSB9O1xuXHRcdH1cblx0XHRpZiAoXG5cdFx0XHRhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jaGF0LmNyZWF0ZVB1bGxSZXF1ZXN0Q29waWxvdENMSUFnZW50U2Vzc2lvbi5jcmVhdGVQUicgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQubWVyZ2VDb3BpbG90Q0xJQWdlbnRTZXNzaW9uQ2hhbmdlcy5tZXJnZScgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQuY2hlY2tvdXRQdWxsUmVxdWVzdFJlcm91dGUnIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdwci5jaGVja291dEZyb21DaGF0JyB8fFxuXHRcdFx0YWN0aW9uLmlkID09PSAnZ2l0aHViLmNvcGlsb3Quc2Vzc2lvbnMuaW5pdGlhbGl6ZVJlcG9zaXRvcnknIHx8XG5cdFx0XHRhY3Rpb24uaWQgPT09ICdhZ2VudFNlc3Npb24ucmVzdG9yZScgfHxcblx0XHRcdGFjdGlvbi5pZCA9PT0gJ3Nlc3Npb25zLmFjdGlvbi5maXhDSUNoZWNrcycgfHxcblx0XHRcdGlzQWdlbnRIb3N0U2tpbGxCdXR0b25JZChhY3Rpb24uaWQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiB0cnVlLCBpc1NlY29uZGFyeTogZmFsc2UgfTtcblx0XHR9XG5cblx0XHQvLyBVbmtub3duIGFjdGlvbnMgKGUuZy4gZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkKTogb25seSBoaWRlIHRoZSBsYWJlbCB3aGVuIGFuIGljb24gaXMgcHJlc2VudC5cblx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdGNvbnN0IGljb24gPSBhY3Rpb24uaXRlbS5pY29uO1xuXHRcdFx0aWYgKGljb24pIHtcblx0XHRcdFx0Ly8gSWNvbi1vbmx5IGJ1dHRvbiAobm8gZm9yY2VkIHNlY29uZGFyeSBzdGF0ZSBzbyBwcmltYXJ5L3NlY29uZGFyeSBjYW4gYmUgaW5mZXJyZWQpLlxuXHRcdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjayB0byBkZWZhdWx0IGJ1dHRvbiBiZWhhdmlvciBmb3IgYWN0aW9ucyB3aXRob3V0IGFuIGljb24uXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vLyAtLS0gQnV0dG9uQmFyIHdpZGdldCAoQWdlbnQgSG9zdClcblxuY2xhc3MgQ2hhbmdlc1dvcmtiZW5jaEJ1dHRvbkJhcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhbmdlc0J1dHRvbkJhcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uQmFyOiBXb3JrYmVuY2hCdXR0b25CYXI7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aW9uczogRXZlbnQ8dm9pZD47XG5cdGdldCBoYXNBY3Rpb25zKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYnV0dG9uQmFyLmJ1dHRvbnMubGVuZ3RoID4gMDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX3JlZ2lzdGVyKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkFnZW50c0NoYW5nZXNUb29sYmFyLCBjb250ZXh0S2V5U2VydmljZSwgeyBlbWl0RXZlbnRzRm9yU3VibWVudUNoYW5nZXM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgYnV0dG9uQmFyID0gdGhpcy5fYnV0dG9uQmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hCdXR0b25CYXIsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NoYW5nZXNWaWV3Jyxcblx0XHRcdFx0cmVuZGVyU2Vjb25kYXJ5QWN0aW9uczogZmFsc2UsXG5cdFx0XHRcdGJ1dHRvbkNvbmZpZ1Byb3ZpZGVyOiAoYWN0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBpbmRleCA9PT0gMFxuXHRcdFx0XHRcdFx0PyB7IHNob3dJY29uOiBmYWxzZSwgc2hvd0xhYmVsOiB0cnVlLCBjdXN0b21MYWJlbDogc3RyaXBJY29ucyhhY3Rpb24ubGFiZWwpIH1cblx0XHRcdFx0XHRcdDogeyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiBmYWxzZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZUFjdGlvbnMgPSBFdmVudC5zaWduYWwoYnV0dG9uQmFyLm9uRGlkQ2hhbmdlKTtcblxuXHRcdGNvbnN0IG1lbnVBY3Rpb25zT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudChtZW51Lm9uRGlkQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25BY3Rpb25Hcm91cHNPYnMgPSBkZXJpdmVkPElBY3Rpb25bXVtdPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0ID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjaGFuZ2VzZXQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcGVyYXRpb25zID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25zT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNoYW5nZXNldE9wZXJhdGlvbnMgPSBvcGVyYXRpb25zXG5cdFx0XHRcdC5maWx0ZXIob3AgPT4gb3Auc2NvcGVzLmluY2x1ZGVzKFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5DaGFuZ2VzZXQpKTtcblxuXHRcdFx0Y29uc3QgdG9PcGVyYXRpb25BY3Rpb24gPSAob3A6IElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uKSA9PiB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiBvcC5pZCxcblx0XHRcdFx0bGFiZWw6IG9wLmljb25cblx0XHRcdFx0XHQ/IG9wLnN0YXR1cyA9PT0gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nXG5cdFx0XHRcdFx0XHQ/IGAkKGxvYWRpbmcpICR7b3AubGFiZWx9YFxuXHRcdFx0XHRcdFx0OiBgJCgke29wLmljb24uaWR9KSAke29wLmxhYmVsfWBcblx0XHRcdFx0XHQ6IG9wLnN0YXR1cyA9PT0gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nXG5cdFx0XHRcdFx0XHQ/IGAkKGxvYWRpbmcpICR7b3AubGFiZWx9YFxuXHRcdFx0XHRcdFx0OiBvcC5sYWJlbCxcblx0XHRcdFx0dG9vbHRpcDogb3AuZGVzY3JpcHRpb24gPz8gb3AubGFiZWwsXG5cdFx0XHRcdGVuYWJsZWQ6IG9wLnN0YXR1cyAhPT0gU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5EaXNhYmxlZCAmJiBvcC5zdGF0dXMgIT09IFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuUnVubmluZyxcblx0XHRcdFx0cnVuOiAoKSA9PiBjaGFuZ2VzZXQuaW52b2tlT3BlcmF0aW9uKG9wLmlkKSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBHcm91cCB0aGUgcmVtYWluaW5nIGNoYW5nZXNldC1zY29wZWQgb3BlcmF0aW9ucyBieSB0aGVpclxuXHRcdFx0Ly8gZ3JvdXAgaWRlbnRpZmllciwgcHJlc2VydmluZyB0aGUgb3JkZXIgaW4gd2hpY2ggZ3JvdXBzXG5cdFx0XHQvLyBhcmUgZmlyc3QgZW5jb3VudGVyZWQuXG5cdFx0XHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZyB8IHVuZGVmaW5lZCwgSUFjdGlvbltdPigpO1xuXHRcdFx0Zm9yIChjb25zdCBvcCBvZiBjaGFuZ2VzZXRPcGVyYXRpb25zKSB7XG5cdFx0XHRcdC8vIFNraXAgdGhlIHJ1bm5pbmcgb3BlcmF0aW9ucyBhcyB0aGV5IHdpbGwgYmUgaGFuZGxlZCBzZXBhcmF0ZWx5XG5cdFx0XHRcdGlmIChvcC5zdGF0dXMgPT09IFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuUnVubmluZykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gdG9PcGVyYXRpb25BY3Rpb24ob3ApO1xuXHRcdFx0XHRjb25zdCBncm91cEFjdGlvbnMgPSBncm91cHMuZ2V0KG9wLmdyb3VwKTtcblx0XHRcdFx0aWYgKGdyb3VwQWN0aW9ucykge1xuXHRcdFx0XHRcdGdyb3VwQWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z3JvdXBzLnNldChvcC5ncm91cCwgW2FjdGlvbl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJ1bm5pbmcgb3BlcmF0aW9ucyBhcmUgZXh0cmFjdGVkIGludG8gYSBkZWRpY2F0ZWQgZ3JvdXAgdGhhdCBhcHBlYXJzIGZpcnN0XG5cdFx0XHQvLyBzbyB0aGF0IHRoZSBydW5uaW5nIG9wZXJhdGlvbiBhY3RzIGFzIHRoZSBwcmltYXJ5IGFjdGlvbiBvZiB0aGUgZHJvcGRvd24uXG5cdFx0XHRjb25zdCBydW5uaW5nQWN0aW9ucyA9IGNoYW5nZXNldE9wZXJhdGlvbnNcblx0XHRcdFx0LmZpbHRlcihvcCA9PiBvcC5zdGF0dXMgPT09IFNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuUnVubmluZylcblx0XHRcdFx0Lm1hcCh0b09wZXJhdGlvbkFjdGlvbik7XG5cblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdC4uLihydW5uaW5nQWN0aW9ucy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0PyBbcnVubmluZ0FjdGlvbnNdXG5cdFx0XHRcdFx0OiBbXSksXG5cdFx0XHRcdC4uLmdyb3Vwcy52YWx1ZXMoKSxcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0xvYWRpbmcgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkxvYWRpbmdPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGlzTG9hZGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wZXJhdGlvbkFjdGlvbkdyb3VwcyA9IG9wZXJhdGlvbkFjdGlvbkdyb3Vwc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtZW51QWN0aW9ucyA9IG1lbnVBY3Rpb25zT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uQWN0aW9ucyA9IG9wZXJhdGlvbkFjdGlvbkdyb3Vwcy5mbGF0KCk7XG5cblx0XHRcdGlmIChvcGVyYXRpb25BY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Ly8gVGhlIGFjdGlvbiBncm91cHMgYXJlIGJ1aWxkIHNvIHRoYXQgdGhlXG5cdFx0XHRcdC8vIHJ1bm5pbmcgYWN0aW9uKHMpIGFwcGVhciBpbiB0aGUgZmlyc3QgZ3JvdXBcblx0XHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbiA9IG9wZXJhdGlvbkFjdGlvbnNbMF07XG5cblx0XHRcdFx0Ly8gSm9pbiB0aGUgZ3JvdXBzIHdpdGggc2VwYXJhdG9ycyB0b1xuXHRcdFx0XHQvLyB2aXN1YWxseSBzZXBhcmF0ZSByZWxhdGVkIG9wZXJhdGlvbnMuXG5cdFx0XHRcdGNvbnN0IGRyb3Bkb3duQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2Ygb3BlcmF0aW9uQWN0aW9uR3JvdXBzKSB7XG5cdFx0XHRcdFx0aWYgKGRyb3Bkb3duQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRkcm9wZG93bkFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkcm9wZG93bkFjdGlvbnMucHVzaCguLi5ncm91cCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdjaGFuZ2VzVmlldy5vcGVyYXRpb25zLnByaW1hcnkuZHJvcGRvd24nLCBwcmltYXJ5QWN0aW9uLmxhYmVsLCBkcm9wZG93bkFjdGlvbnMpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goLi4ub3BlcmF0aW9uQWN0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goLi4ubWVudUFjdGlvbnMucHJpbWFyeSk7XG5cdFx0XHRidXR0b25CYXIudXBkYXRlKHByaW1hcnlBY3Rpb25zLCBtZW51QWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdH0pKTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIHNlc3Npb24gY2hhbmdlcyBhY3Rpb24gYnV0dG9uLWJhciAoZS5nLiBcIkNyZWF0ZSBQdWxsIFJlcXVlc3RcIikgaW50b1xuICogYSBjb250YWluZXIsIGNob29zaW5nIHRoZSBhZ2VudC1ob3N0IG9yIGdpdCB2YXJpYW50IGJhc2VkIG9uIHRoZSBhY3RpdmUgc2Vzc2lvbi5cbiAqIFVzZWQgdG8gaG9zdCB0aGUgYWN0aW9ucyBpbiB0aGUgc2luZ2xlLXBhbmUgQ2hhbmdlcyBlZGl0b3IgaGVhZGVyLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhbmdlc0FjdGlvbnNCYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGFuZ2VzVmlld1NlcnZpY2UgY2hhbmdlc1ZpZXdTZXJ2aWNlOiBJQ2hhbmdlc1ZpZXdTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhbmdlcy1hY3Rpb25zLWJhcicpO1xuXG5cdFx0Y29uc3QgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0dsb2JhbE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQoY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCAoKSA9PlxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKCdzZXNzaW9ucy5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzJykgPT09IHRydWUpO1xuXHRcdGNvbnN0IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0dsb2JhbE9icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25TdGF0ZU9icy5yZWFkKHJlYWRlcik/Lmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPT09IHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpc0FnZW50SG9zdFNlc3Npb25PYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGFjdGl2ZVNlc3Npb24gPyBpc0FnZW50SG9zdFByb3ZpZGVySWQoYWN0aXZlU2Vzc2lvbi5wcm92aWRlcklkKSA6IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGN1cnJlbnRXaWRnZXQ6IElDaGFuZ2VzQnV0dG9uQmFyV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHVwZGF0ZVZpc2liaWxpdHkgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gY3VycmVudFdpZGdldD8uaGFzQWN0aW9ucyA/PyBmYWxzZTtcblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KHZpc2libGUsIGNvbnRhaW5lcik7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGRvbS5jbGVhck5vZGUoY29udGFpbmVyKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gaXNBZ2VudEhvc3RTZXNzaW9uT2JzLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQ/IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNXb3JrYmVuY2hCdXR0b25CYXJXaWRnZXQsIGNvbnRhaW5lcilcblx0XHRcdFx0OiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzTWVudVdvcmtiZW5jaEJ1dHRvbkJhcldpZGdldCwgY29udGFpbmVyLCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQod2lkZ2V0KTtcblx0XHRcdGN1cnJlbnRXaWRnZXQgPSB3aWRnZXQ7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHdpZGdldC5vbkRpZENoYW5nZUFjdGlvbnMoKCkgPT4gdXBkYXRlVmlzaWJpbGl0eSgpKSk7XG5cdFx0XHR1cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0c2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpPy5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dXBkYXRlVmlzaWJpbGl0eSgpO1xuXHRcdH0pKTtcblx0fVxuXG59XG5cbi8vIC0tLSBFZGl0b3IgaGVhZGVyIG1lbnVzIChzaW5nbGUtcGFuZSk6IGFjdGlvbnMgY29udHJpYnV0ZSB0byB0aGUgZ3JvdXAtb3duZWRcbi8vIHByaW1hcnkvc2Vjb25kYXJ5IGhlYWRlciBtZW51cyBhbmQgZ2F0ZSB0aGVtc2VsdmVzIHRvIHRoZSBDaGFuZ2VzIGVkaXRvci5cblxuZXhwb3J0IGNvbnN0IENIQU5HRVNfSEVBREVSX0FDVElPTlNfSUQgPSAnd29ya2JlbmNoLmNoYW5nZXNWaWV3LmhlYWRlckFjdGlvbnMnO1xuXG4vKiogUmVuZGVycyB0aGUge0BsaW5rIENoYW5nZXNBY3Rpb25zQmFyfSB3aWRnZXQgYXMgdGhlIENyZWF0ZSBQdWxsIFJlcXVlc3QgdGl0bGUtYmFyIGFjdGlvbiBpdGVtLiAqL1xuZXhwb3J0IGNsYXNzIENoYW5nZXNBY3Rpb25zQmFyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNBY3Rpb25zQmFyLCBjb250YWluZXIpKTtcblx0fVxufVxuXG4vKiogUmVnaXN0ZXJzIGN1c3RvbSBDaGFuZ2VzIGFjdGlvbiB2aWV3IGl0ZW1zLiAqL1xuY2xhc3MgQ2hhbmdlc0FjdGlvblZpZXdJdGVtc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhbmdlc0VkaXRvckhlYWRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgb25EaWRSZWdpc3RlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyUHJpbWFyeSwgVkVSU0lPTlNfUElDS0VSX0FDVElPTl9JRCwgKGFjdGlvbiwgX29wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uKTtcblx0XHR9LCBvbkRpZFJlZ2lzdGVyLmV2ZW50KSk7XG5cblx0XHQvLyBBbHdheXMgcmVuZGVyZWQsIHdoZXRoZXIgdGhlIGVkaXRvciBhcmVhIGlzIHZpc2libGUgb3IgY29sbGFwc2VkOiB0aGUgc2FtZVxuXHRcdC8vIGRpZmYtc3RhdHMgYWN0aW9uIGFzIHRoZSBjbGFzc2ljIENoYW5nZXMgdmlldyBoZWFkZXIgKGNsaWNraW5nIGl0IG9wZW5zIHRoZVxuXHRcdC8vIENoYW5nZXMgZWRpdG9yKSwgYnV0IHdpdGggdGhlIHJpY2hlciBcIk4gZmlsZXMgK1ggLVlcIiByZW5kZXJpbmcuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyUHJpbWFyeSwgRElGRl9TVEFUU19BQ1RJT05fSUQsIChhY3Rpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW5nbGVQYW5lQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbkl0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fSwgb25EaWRSZWdpc3Rlci5ldmVudCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLlRpdGxlQmFyU2Vzc2lvbk1lbnUsIENIQU5HRVNfSEVBREVSX0FDVElPTlNfSUQsIChhY3Rpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzQWN0aW9uc0JhckFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0sIG9uRGlkUmVnaXN0ZXIuZXZlbnQpKTtcblxuXHRcdG9uRGlkUmVnaXN0ZXIuZmlyZSgpO1xuXHR9XG59XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhbmdlc0FjdGlvblZpZXdJdGVtc0NvbnRyaWJ1dGlvbi5JRCwgQ2hhbmdlc0FjdGlvblZpZXdJdGVtc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxuLy8gLS0tIFZpZXcgUGFuZVxuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1ZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgYm9keUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd2VsY29tZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmlsZXNIZWFkZXJOb2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmaWxlSGVhZGVyVG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8vIEFjdGlvbnMgY29udGFpbmVyIGlzIHBvc2l0aW9uZWQgb3V0c2lkZSB0aGUgY2FyZCBmb3IgdGhpcyBsYXlvdXQgZXhwZXJpbWVudFxuXHRwcml2YXRlIGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY2hhbmdlc1Byb2dyZXNzQmFyITogUHJvZ3Jlc3NCYXI7XG5cdHByaXZhdGUgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxDaGFuZ2VzVHJlZUVsZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlbmRlcmVkVHJlZVN0YXRlOiB7IHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJOyByZWFkb25seSB2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyOiBJQ2hhbmdlc0RldGFpbHNWaWV3U3RhdGVUcmFuc2ZlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjaVN0YXR1c1dpZGdldDogQ0lTdGF0dXNXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vzc2lvbkZpbGVzV2lkZ2V0OiBTZXNzaW9uRmlsZXNXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3BsaXRWaWV3OiBTcGxpdFZpZXcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3BsaXRWaWV3Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlUGFuZVNpemVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCkpO1xuXHRwcml2YXRlIHJlYmFsYW5jZVNlY3Rpb25QYW5lczogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlY3Rpb25QYW5lc1VzZXJSZXNpemVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpc01lcmdlQmFzZUJyYW5jaFByb3RlY3RlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzb2xhdGlvbk1vZGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxJc29sYXRpb25Nb2RlPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNHaXRSZXBvc2l0b3J5Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzVXBzdHJlYW1Db250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNJbmNvbWluZ0NoYW5nZXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNPdXRnb2luZ0NoYW5nZXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNVbmNvbW1pdHRlZENoYW5nZXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNCcmFuY2hDaGFuZ2VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzR2l0SHViUmVtb3RlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzUHVsbFJlcXVlc3RDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNPcGVuUHVsbFJlcXVlc3RDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8vIFRyYWNrIGN1cnJlbnQgYm9keSBkaW1lbnNpb25zIGZvciBsaXN0IGxheW91dFxuXHRwcml2YXRlIGN1cnJlbnRCb2R5SGVpZ2h0ID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50Qm9keVdpZHRoID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlc1ZpZXdTZXJ2aWNlOiBJQ2hhbmdlc1ZpZXdTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaExheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlOiBJV29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IC4uLm9wdGlvbnMsIHRpdGxlTWVudUlkOiBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyIH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gQ29udGV4dCBrZXlzXG5cdFx0dGhpcy5pc01lcmdlQmFzZUJyYW5jaFByb3RlY3RlZENvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaXNvbGF0aW9uTW9kZUNvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSXNvbGF0aW9uTW9kZS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNHaXRSZXBvc2l0b3J5Q29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNHaXRSZXBvc2l0b3J5LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc1Vwc3RyZWFtQ29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNVcHN0cmVhbS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNJbmNvbWluZ0NoYW5nZXNDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc0luY29taW5nQ2hhbmdlcy5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNPdXRnb2luZ0NoYW5nZXNDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc091dGdvaW5nQ2hhbmdlcy5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNVbmNvbW1pdHRlZENoYW5nZXNDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc1VuY29tbWl0dGVkQ2hhbmdlcy5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNCcmFuY2hDaGFuZ2VzQ29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNCcmFuY2hDaGFuZ2VzLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc0dpdEh1YlJlbW90ZUNvbnRleHRLZXkgPSBBY3RpdmVTZXNzaW9uQ29udGV4dEtleXMuSGFzR2l0SHViUmVtb3RlLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc1B1bGxSZXF1ZXN0Q29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNQdWxsUmVxdWVzdC5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNPcGVuUHVsbFJlcXVlc3RDb250ZXh0S2V5ID0gQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc09wZW5QdWxsUmVxdWVzdC5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzQ29udGV4dEtleSA9IEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNHaXRPcGVyYXRpb25JblByb2dyZXNzLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFZlcnNpb24gbW9kZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KENoYW5nZXNDb250ZXh0S2V5cy5WZXJzaW9uTW9kZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLnJlYWQocmVhZGVyKT8uaWQgPz8gJyc7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVmlldyBtb2RlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoQ2hhbmdlc0NvbnRleHRLZXlzLlZpZXdNb2RlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLnZpZXdNb2RlT2JzLnJlYWQocmVhZGVyKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgY2hhdFNlc3Npb25UeXBlIG9uIHRoZSB2aWV3J3MgY29udGV4dCBrZXkgc2VydmljZSBzbyBWaWV3VGl0bGUgbWVudSBpdGVtc1xuXHRcdC8vIGNhbiB1c2UgaXQgaW4gdGhlaXIgYHdoZW5gIGNsYXVzZXMuIFVwZGF0ZSByZWFjdGl2ZWx5IHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uXG5cdFx0Ly8gY2hhbmdlcy5cblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uVHlwZU9icy5yZWFkKHJlYWRlcikgPz8gJyc7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gR2l0IG9wZXJhdGlvbiBpbiBwcm9ncmVzcyBzZXQgaW4gdGhlIGdsb2JhbCBjb250ZXh0IGtleSBzZXJ2aWNlIGJ5IHRoZSBleHRlbnNpb25cblx0XHRjb25zdCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzR2xvYmFsQ29udGV4dE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQsICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZSgnc2Vzc2lvbnMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcycpID09PSB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gR2l0IG9wZXJhdGlvbiBpbiBwcm9ncmVzcyBzZXQgaW4gdGhlIHNlc3Npb24gc3RhdGVcblx0XHRjb25zdCBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzU3RhdGVPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uU3RhdGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uU3RhdGVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGFjdGl2ZVNlc3Npb25TdGF0ZT8uaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcyA9PT0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRoaXMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NHbG9iYWxDb250ZXh0ID0gaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0dsb2JhbENvbnRleHRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc1N0YXRlID0gaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc1N0YXRlT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gVGhlIGdsb2JhbCBjb250ZXh0IGtleSBzZXJ2aWNlIGlzIGJlaW5nIHNldCBhcyBzb29uIGFzIHRoZSBjb21tYW5kIHN0YXJ0c1xuXHRcdFx0Ly8gc28gd2UgbmVlZCB0byBwcmVmZXIgaXQgZmlyc3QgYmVmb3JlIGZhbGxpbmcgYmFjayB0byB0aGUgc2Vzc2lvbiBzdGF0ZS5cblx0XHRcdGNvbnN0IGNvbnRleHRLZXlWYWx1ZSA9IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3NHbG9iYWxDb250ZXh0ID09PSB0cnVlXG5cdFx0XHRcdD8gaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0dsb2JhbENvbnRleHRcblx0XHRcdFx0OiBoYXNHaXRPcGVyYXRpb25JblByb2dyZXNzU3RhdGU7XG5cblx0XHRcdC8vIFByb3BhZ2F0ZSBnbG9iYWwgY29udGV4dCBzZXJ2aWNlIHZhbHVlIHRvIHRoZSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZVxuXHRcdFx0Ly8gYXMgdGhlIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIGlzIHdoYXQgaXQgaXMgYmVpbmcgdXNlZCBpbiB0aGUgdmlld1xuXHRcdFx0dGhpcy5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzQ29udGV4dEtleS5zZXQoY29udGV4dEtleVZhbHVlKTtcblxuXHRcdFx0cmV0dXJuIGNvbnRleHRLZXlWYWx1ZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNjb3BlZFNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKTtcblx0XHR0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChzY29wZWRTZXJ2aWNlQ29sbGVjdGlvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5ib2R5Q29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5jaGFuZ2VzLXZpZXctYm9keScpKTtcblxuXHRcdC8vIEFjdGlvbnMgY29udGFpbmVyIC0gcG9zaXRpb25lZCBvdXRzaWRlIGFuZCBhYm92ZSB0aGUgY2FyZFxuXHRcdHRoaXMuYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5ib2R5Q29udGFpbmVyLCAkKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tYWN0aW9ucy5vdXRzaWRlLWNhcmQnKSk7XG5cblx0XHQvLyBTcGxpdFZpZXcgY29udGFpbmVyIGZvciByZXNpemFibGUgZmlsZSB0cmVlIC8gQ0kgY2hlY2tzIHNwbGl0XG5cdFx0dGhpcy5zcGxpdFZpZXdDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuYm9keUNvbnRhaW5lciwgJCgnLmNoYW5nZXMtc3BsaXR2aWV3LWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIE1haW4gY29udGFpbmVyIHdpdGggZmlsZSBpY29ucyBzdXBwb3J0ICh0aGUgXCJjYXJkXCIpIFx1MjAxNCB0b3AgcGFuZVxuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5zcGxpdFZpZXdDb250YWluZXIsICQoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1jb250YWluZXIuc2hvdy1maWxlLWljb25zJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUodGhpcy5jb250ZW50Q29udGFpbmVyLCB0aGlzLnRoZW1lU2VydmljZSkpO1xuXG5cdFx0Ly8gVG9nZ2xlIGNsYXNzIGJhc2VkIG9uIHdoZXRoZXIgdGhlIGZpbGUgaWNvbiB0aGVtZSBoYXMgZmlsZSBpY29uc1xuXHRcdGNvbnN0IHVwZGF0ZUhhc0ZpbGVJY29ucyA9ICgpID0+IHtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lciEuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWZpbGUtaWNvbnMnLCB0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkuaGFzRmlsZUljb25zKTtcblx0XHR9O1xuXHRcdHVwZGF0ZUhhc0ZpbGVJY29ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSh1cGRhdGVIYXNGaWxlSWNvbnMpKTtcblxuXHRcdC8vIEZpbGVzIGhlYWRlciAoQnJhbmNoIENoYW5nZXMgZHJvcGRvd24gKyBkaWZmIHN0YXRzKS4gSW4gdGhlIHNpbmdsZS1wYW5lXG5cdFx0Ly8gcmVkZXNpZ24gdGhlc2UgbGl2ZSBpbiB0aGUgY3VzdG9tIENoYW5nZXMgZWRpdG9yIGluc3RlYWQsIHNvIHRoZSBwYW5lbFxuXHRcdC8vIG9taXRzIGl0cyBoZWFkZXI7IG90aGVyd2lzZSAob3JpZ2luYWwgbGF5b3V0KSB0aGUgaGVhZGVyIGlzIHNob3duIGhlcmUuXG5cdFx0dGhpcy5jcmVhdGVGaWxlc0hlYWRlcih0aGlzLmNvbnRlbnRDb250YWluZXIpO1xuXG5cdFx0Ly8gQ2hhbmdlcyBjYXJkIHByb2dyZXNzIGJhclxuXHRcdGNvbnN0IHByb2dyZXNzQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRlbnRDb250YWluZXIsICQoJy5jaGFuZ2VzLXByb2dyZXNzJykpO1xuXHRcdHRoaXMuY2hhbmdlc1Byb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKHByb2dyZXNzQ29udGFpbmVyLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMpKTtcblx0XHR0aGlzLmNoYW5nZXNQcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXG5cdFx0Ly8gTGlzdCBjb250YWluZXJcblx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgnLmNoYW5nZXMtZmlsZS1saXN0JykpO1xuXG5cdFx0Ly8gV2VsY29tZSBtZXNzYWdlIGZvciBlbXB0eSBzdGF0ZSAoaGlkZGVuIGJ5IGRlZmF1bHQsIHNob3duIHdoZW4gbm8gY2hhbmdlcylcblx0XHR0aGlzLndlbGNvbWVDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgnLmNoYW5nZXMtd2VsY29tZScpKTtcblx0XHR0aGlzLndlbGNvbWVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGNvbnN0IHdlbGNvbWVNZXNzYWdlID0gZG9tLmFwcGVuZCh0aGlzLndlbGNvbWVDb250YWluZXIsICQoJy5jaGFuZ2VzLXdlbGNvbWUtbWVzc2FnZScpKTtcblx0XHR3ZWxjb21lTWVzc2FnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGFuZ2VzVmlldy5ub0NoYW5nZXMnLCBcIkNoYW5nZWQgZmlsZXMgYW5kIG90aGVyIHNlc3Npb24gYXJ0aWZhY3RzIHdpbGwgYXBwZWFyIGhlcmUuXCIpO1xuXG5cdFx0Ly8gT3RoZXIgRmlsZXMgd2lkZ2V0IC0gbWlkZGxlIHBhbmUgKGZpbGVzIGVkaXRlZCBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UpXG5cdFx0dGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25GaWxlc1dpZGdldCwgdGhpcy5zcGxpdFZpZXdDb250YWluZXIpKTtcblxuXHRcdC8vIENJIFN0YXR1cyB3aWRnZXQgXHUyMDE0IGJvdHRvbSBwYW5lXG5cdFx0dGhpcy5jaVN0YXR1c1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ0lTdGF0dXNXaWRnZXQsIHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyKSk7XG5cblx0XHQvLyBDcmVhdGUgU3BsaXRWaWV3XG5cdFx0dGhpcy5zcGxpdFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3BsaXRWaWV3KHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogT3JpZW50YXRpb24uVkVSVElDQUwsXG5cdFx0XHRwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlLFxuXHRcdH0pKTtcblxuXHRcdC8vIFNoYXJlZCBjb25zdGFudHMgZm9yIHBhbmUgc2l6aW5nXG5cdFx0Y29uc3Qgc2Vzc2lvbkZpbGVzV2lkZ2V0ID0gdGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQ7XG5cdFx0Y29uc3QgY2lXaWRnZXQgPSB0aGlzLmNpU3RhdHVzV2lkZ2V0O1xuXHRcdGNvbnN0IGNpTWluSGVpZ2h0ID0gQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIENJU3RhdHVzV2lkZ2V0Lk1JTl9CT0RZX0hFSUdIVDtcblx0XHRjb25zdCBzZXNzaW9uRmlsZXNNaW5IZWlnaHQgPSBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIFNlc3Npb25GaWxlc1dpZGdldC5NSU5fQk9EWV9IRUlHSFQ7XG5cdFx0Y29uc3QgZ2V0U2Vzc2lvbkZpbGVzQ29udGVudEhlaWdodCA9ICgpID0+IE1hdGgubWF4KFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hULCBzZXNzaW9uRmlsZXNXaWRnZXQuZGVzaXJlZEhlaWdodCk7XG5cdFx0Y29uc3QgZ2V0U2Vzc2lvbkZpbGVzTWluaW11bUhlaWdodCA9ICgpID0+IHNlc3Npb25GaWxlc1dpZGdldC5jb2xsYXBzZWQgPyBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCA6IE1hdGgubWluKHNlc3Npb25GaWxlc01pbkhlaWdodCwgZ2V0U2Vzc2lvbkZpbGVzQ29udGVudEhlaWdodCgpKTtcblx0XHRjb25zdCBnZXRTZXNzaW9uRmlsZXNQcmVmZXJyZWRIZWlnaHQgPSAoKSA9PiBNYXRoLm1heChcblx0XHRcdGdldFNlc3Npb25GaWxlc01pbmltdW1IZWlnaHQoKSxcblx0XHRcdE1hdGgubWluKGdldFNlc3Npb25GaWxlc0NvbnRlbnRIZWlnaHQoKSwgU2Vzc2lvbkZpbGVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgKyBTZXNzaW9uRmlsZXNXaWRnZXQuUFJFRkVSUkVEX0JPRFlfSEVJR0hUKVxuXHRcdCk7XG5cdFx0Y29uc3QgZ2V0Q0lDb250ZW50SGVpZ2h0ID0gKCkgPT4gTWF0aC5tYXgoQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCwgY2lXaWRnZXQuZGVzaXJlZEhlaWdodCk7XG5cdFx0Y29uc3QgZ2V0Q0lNaW5pbXVtSGVpZ2h0ID0gKCkgPT4gY2lXaWRnZXQuY29sbGFwc2VkID8gQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCA6IE1hdGgubWluKGNpTWluSGVpZ2h0LCBnZXRDSUNvbnRlbnRIZWlnaHQoKSk7XG5cdFx0Y29uc3QgZ2V0Q0lQcmVmZXJyZWRIZWlnaHQgPSAoKSA9PiBNYXRoLm1heChcblx0XHRcdGdldENJTWluaW11bUhlaWdodCgpLFxuXHRcdFx0TWF0aC5taW4oZ2V0Q0lDb250ZW50SGVpZ2h0KCksIENJU3RhdHVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgKyBDSVN0YXR1c1dpZGdldC5QUkVGRVJSRURfQk9EWV9IRUlHSFQpXG5cdFx0KTtcblx0XHRjb25zdCBnZXRSZXNlcnZlZFNlY3Rpb25IZWlnaHQgPSAoKSA9PlxuXHRcdFx0KHNlc3Npb25GaWxlc1dpZGdldC52aXNpYmxlID8gZ2V0U2Vzc2lvbkZpbGVzTWluaW11bUhlaWdodCgpIDogMCkgK1xuXHRcdFx0KGNpV2lkZ2V0LnZpc2libGUgPyBnZXRDSU1pbmltdW1IZWlnaHQoKSA6IDApO1xuXHRcdHRoaXMucmViYWxhbmNlU2VjdGlvblBhbmVzID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNwbGl0VmlldyB8fCB0aGlzLnNlY3Rpb25QYW5lc1VzZXJSZXNpemVkIHx8ICFjaVdpZGdldC52aXNpYmxlIHx8IGNpV2lkZ2V0LmNvbGxhcHNlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDIsIGdldENJTWluaW11bUhlaWdodCgpKTtcblx0XHR9O1xuXHRcdGNvbnN0IHRoaXNWaWV3ID0gdGhpcztcblxuXHRcdC8vIFRvcCBwYW5lOiBmaWxlIHRyZWVcblx0XHRjb25zdCB0cmVlUGFuZTogSVZpZXcgPSB7XG5cdFx0XHRlbGVtZW50OiB0aGlzLmNvbnRlbnRDb250YWluZXIsXG5cdFx0XHRnZXQgbWluaW11bVNpemUoKSB7IHJldHVybiB0aGlzVmlldy5nZXRUcmVlUGFuZU1pbmltdW1TaXplKGdldFJlc2VydmVkU2VjdGlvbkhlaWdodCgpKTsgfSxcblx0XHRcdGdldCBtYXhpbXVtU2l6ZSgpIHsgcmV0dXJuIHRoaXNWaWV3LmdldFRyZWVQYW5lTWF4aW11bVNpemUoKTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLnRyZWVQYW5lU2l6ZUNoYW5nZS5ldmVudCxcblx0XHRcdGxheW91dDogKGhlaWdodCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIhLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdHRoaXMuX2xheW91dFRyZWVJblBhbmUoaGVpZ2h0KTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIE1pZGRsZSBwYW5lOiBvdGhlciBmaWxlc1xuXHRcdGNvbnN0IHNlc3Npb25GaWxlc0VsZW1lbnQgPSB0aGlzLnNlc3Npb25GaWxlc1dpZGdldC5lbGVtZW50O1xuXHRcdGNvbnN0IHNlc3Npb25GaWxlc1BhbmU6IElWaWV3ID0ge1xuXHRcdFx0ZWxlbWVudDogc2Vzc2lvbkZpbGVzRWxlbWVudCxcblx0XHRcdGdldCBtaW5pbXVtU2l6ZSgpIHsgcmV0dXJuIGdldFNlc3Npb25GaWxlc01pbmltdW1IZWlnaHQoKTsgfSxcblx0XHRcdGdldCBtYXhpbXVtU2l6ZSgpIHsgcmV0dXJuIHNlc3Npb25GaWxlc1dpZGdldC5jb2xsYXBzZWQgPyBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCA6IGdldFNlc3Npb25GaWxlc0NvbnRlbnRIZWlnaHQoKTsgfSxcblx0XHRcdHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eS5IaWdoLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lm1hcCh0aGlzLnNlc3Npb25GaWxlc1dpZGdldC5vbkRpZENoYW5nZUhlaWdodCwgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdGxheW91dDogKGhlaWdodCkgPT4ge1xuXHRcdFx0XHRzZXNzaW9uRmlsZXNFbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdGNvbnN0IGJvZHlIZWlnaHQgPSBNYXRoLm1heCgwLCBoZWlnaHQgLSBTZXNzaW9uRmlsZXNXaWRnZXQuSEVBREVSX0hFSUdIVCk7XG5cdFx0XHRcdHNlc3Npb25GaWxlc1dpZGdldC5sYXlvdXQoYm9keUhlaWdodCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHQvLyBCb3R0b20gcGFuZTogQ0kgY2hlY2tzXG5cdFx0Y29uc3QgY2lFbGVtZW50ID0gdGhpcy5jaVN0YXR1c1dpZGdldC5lbGVtZW50O1xuXHRcdGNvbnN0IGNpUGFuZTogSVZpZXcgPSB7XG5cdFx0XHRlbGVtZW50OiBjaUVsZW1lbnQsXG5cdFx0XHRnZXQgbWluaW11bVNpemUoKSB7IHJldHVybiBnZXRDSU1pbmltdW1IZWlnaHQoKTsgfSxcblx0XHRcdGdldCBtYXhpbXVtU2l6ZSgpIHsgcmV0dXJuIGNpV2lkZ2V0LmNvbGxhcHNlZCA/IENJU3RhdHVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgOiBnZXRDSUNvbnRlbnRIZWlnaHQoKTsgfSxcblx0XHRcdHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eS5Mb3csXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQubWFwKHRoaXMuY2lTdGF0dXNXaWRnZXQub25EaWRDaGFuZ2VIZWlnaHQsICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRsYXlvdXQ6IChoZWlnaHQpID0+IHtcblx0XHRcdFx0Y2lFbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdGNvbnN0IGJvZHlIZWlnaHQgPSBNYXRoLm1heCgwLCBoZWlnaHQgLSBDSVN0YXR1c1dpZGdldC5IRUFERVJfSEVJR0hUKTtcblx0XHRcdFx0Y2lXaWRnZXQubGF5b3V0KGJvZHlIZWlnaHQpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyh0cmVlUGFuZSwgU2l6aW5nLkRpc3RyaWJ1dGUsIDAsIHRydWUpO1xuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcoc2Vzc2lvbkZpbGVzUGFuZSwgU2Vzc2lvbkZpbGVzV2lkZ2V0LkhFQURFUl9IRUlHSFQgKyBTZXNzaW9uRmlsZXNXaWRnZXQuUFJFRkVSUkVEX0JPRFlfSEVJR0hULCAxLCB0cnVlKTtcblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KGNpUGFuZSwgQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCArIENJU3RhdHVzV2lkZ2V0LlBSRUZFUlJFRF9CT0RZX0hFSUdIVCwgMiwgdHJ1ZSk7XG5cblx0XHQvLyBTdHlsZSB0aGUgc2FzaCBhcyBhIHZpc2libGUgc2VwYXJhdG9yIGJldHdlZW4gc2VjdGlvbnNcblx0XHRjb25zdCB1cGRhdGVTcGxpdFZpZXdTdHlsZXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihQQU5FTF9TRUNUSU9OX0JPUkRFUik7XG5cdFx0XHR0aGlzLnNwbGl0VmlldyEuc3R5bGUoeyBzZXBhcmF0b3JCb3JkZXI6IGJvcmRlckNvbG9yID8/IENvbG9yLnRyYW5zcGFyZW50IH0pO1xuXHRcdH07XG5cdFx0dXBkYXRlU3BsaXRWaWV3U3R5bGVzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHVwZGF0ZVNwbGl0Vmlld1N0eWxlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3BsaXRWaWV3Lm9uRGlkU2FzaENoYW5nZSgoKSA9PiB0aGlzLnNlY3Rpb25QYW5lc1VzZXJSZXNpemVkID0gdHJ1ZSkpO1xuXG5cdFx0Ly8gSW5pdGlhbGx5IGhpZGUgdGhlIG90aGVyIGZpbGVzIGFuZCBDSSBwYW5lcyB1bnRpbCBjb250ZW50IGFycml2ZXNcblx0XHR0aGlzLnNwbGl0Vmlldy5zZXRWaWV3VmlzaWJsZSgxLCBmYWxzZSk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuc2V0Vmlld1Zpc2libGUoMiwgZmFsc2UpO1xuXG5cdFx0Ly8gT3RoZXIgZmlsZXMgcGFuZSAoaW5kZXggMSlcblx0XHR0aGlzLl93aXJlU2VjdGlvblBhbmUodGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQsIDEsIFNlc3Npb25GaWxlc1dpZGdldC5IRUFERVJfSEVJR0hULCBnZXRTZXNzaW9uRmlsZXNQcmVmZXJyZWRIZWlnaHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2Vzc2lvbkZpbGVzV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHRoaXMuZmlyZVRyZWVQYW5lU2l6ZUNoYW5nZSgpKSk7XG5cblx0XHQvLyBDSSBjaGVja3MgcGFuZSAoaW5kZXggMilcblx0XHR0aGlzLl93aXJlU2VjdGlvblBhbmUodGhpcy5jaVN0YXR1c1dpZGdldCwgMiwgQ0lTdGF0dXNXaWRnZXQuSEVBREVSX0hFSUdIVCwgZ2V0Q0lQcmVmZXJyZWRIZWlnaHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2lTdGF0dXNXaWRnZXQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4gdGhpcy5maXJlVHJlZVBhbmVTaXplQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25TZWN0aW9uQ29sbGFwc2VTdGF0ZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRzZXNzaW9uRmlsZXNXaWRnZXQuc2V0Q29sbGFwc2VkKHN0YXRlLm90aGVyRmlsZXMpO1xuXHRcdFx0Y2lXaWRnZXQuc2V0Q29sbGFwc2VkKHN0YXRlLmNoZWNrcyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25GaWxlc1dpZGdldC5vbkRpZFRvZ2dsZUNvbGxhcHNlZChjb2xsYXBzZWQgPT4gdGhpcy5zZXRBY3RpdmVTZWN0aW9uQ29sbGFwc2VkKCdvdGhlckZpbGVzJywgY29sbGFwc2VkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNpV2lkZ2V0Lm9uRGlkVG9nZ2xlQ29sbGFwc2VkKGNvbGxhcHNlZCA9PiB0aGlzLnNldEFjdGl2ZVNlY3Rpb25Db2xsYXBzZWQoJ2NoZWNrcycsIGNvbGxhcHNlZCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMub25WaXNpYmxlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVEZXRhaWxzVmlld1N0YXRlKCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUcmlnZ2VyIGluaXRpYWwgcmVuZGVyIGlmIGFscmVhZHkgdmlzaWJsZVxuXHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0dGhpcy5vblZpc2libGUoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBY3Rpb25zQ29udGV4dCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMuZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uVmlzaWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHQvLyBUaXRsZSBhY3Rpb25zXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIExvYWRpbmdcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc0xvYWRpbmcgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0TG9hZGluZ09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNMb2FkaW5nKSB7XG5cdFx0XHRcdHRoaXMuY2hhbmdlc1Byb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdygyMDApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jaGFuZ2VzUHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDaGFuZ2VzXG5cdFx0Y29uc3QgY2hhbmdlc09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdG9JQ2hhbmdlc0ZpbGVJdGVtKGNoYW5nZXMpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ2hhbmdlcyBzdGF0aXN0aWNzXG5cdFx0Y29uc3QgdG9wTGV2ZWxTdGF0cyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPHsgZmlsZXM6IG51bWJlcjsgYWRkZWQ6IG51bWJlcjsgcmVtb3ZlZDogbnVtYmVyIH0gfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgaXNMb2FkaW5nID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmdPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGlzTG9hZGluZykge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbnRyaWVzID0gY2hhbmdlc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBhZGRlZCA9IDAsIHJlbW92ZWQgPSAwO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0YWRkZWQgKz0gZW50cnkubGluZXNBZGRlZDtcblx0XHRcdFx0cmVtb3ZlZCArPSBlbnRyeS5saW5lc1JlbW92ZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGZpbGVzOiBlbnRyaWVzLmxlbmd0aCwgYWRkZWQsIHJlbW92ZWQgfTtcblx0XHR9KTtcblxuXHRcdC8vIFNldHVwIGNvbnRleHQga2V5cyBhbmQgYWN0aW9ucyB0b29sYmFyXG5cdFx0aWYgKHRoaXMuYWN0aW9uc0NvbnRhaW5lcikge1xuXHRcdFx0Ly8gQmluZCBjb250ZXh0IGtleXNcblx0XHRcdHRoaXMuX2JpbmRDb250ZXh0S2V5cyh0b3BMZXZlbFN0YXRzKTtcblxuXHRcdFx0Ly8gSW4gdGhlIHNpbmdsZS1wYW5lIHJlZGVzaWduIHRoZSBDcmVhdGUgUFIgYWN0aW9ucyByZW5kZXIgaW4gdGhlIENoYW5nZXNcblx0XHRcdC8vIGVkaXRvciBoZWFkZXIgaW5zdGVhZCBvZiB0aGUgZGV0YWlsIHBhbmVsLlxuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb25zQnV0dG9uQmFyKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblN0YXR1c09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIHZpc2liaWxpdHkgYmFzZWQgb24gZW50cmllc1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uTG9hZGluZ09icy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIaWRlIHRoZSBhY3Rpb25zIHRvb2xiYXIgZm9yIHVudGl0bGVkIHNlc3Npb25zLlxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblN0YXR1cyA9IGFjdGl2ZVNlc3Npb25TdGF0dXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNVbnRpdGxlZCA9IGFjdGl2ZVNlc3Npb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQ7XG5cdFx0XHRpZiAodGhpcy5hY3Rpb25zQ29udGFpbmVyKSB7XG5cdFx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KHRoaXMuaXNBY3Rpb25zQ29udGFpbmVyVmlzaWJsZShpc1VudGl0bGVkKSwgdGhpcy5hY3Rpb25zQ29udGFpbmVyKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdHMgPSB0b3BMZXZlbFN0YXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGhhc0VudHJpZXMgPSBzdGF0cyAhPT0gdW5kZWZpbmVkICYmIHN0YXRzLmZpbGVzID4gMDtcblxuXHRcdFx0Ly8gRmlsZXMgaGVhZGVyIHZpc2liaWxpdHkgKG9yaWdpbmFsIGxheW91dCBvbmx5OyBhYnNlbnQgaW4gc2luZ2xlLXBhbmUgcmVkZXNpZ24pLlxuXHRcdFx0aWYgKHRoaXMuZmlsZXNIZWFkZXJOb2RlKSB7XG5cdFx0XHRcdGNvbnN0IGhhc0dpdFJlcG9zaXRvcnkgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uSGFzR2l0UmVwb3NpdG9yeU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KCFpc1VudGl0bGVkICYmIChoYXNHaXRSZXBvc2l0b3J5IHx8IGhhc0VudHJpZXMpLCB0aGlzLmZpbGVzSGVhZGVyTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5maWxlSGVhZGVyVG9vbGJhckNvbnRhaW5lcikge1xuXHRcdFx0XHRkb20uc2V0VmlzaWJpbGl0eShoYXNFbnRyaWVzLCB0aGlzLmZpbGVIZWFkZXJUb29sYmFyQ29udGFpbmVyKTtcblx0XHRcdH1cblxuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoaGFzRW50cmllcywgdGhpcy5saXN0Q29udGFpbmVyISk7XG5cdFx0XHRkb20uc2V0VmlzaWJpbGl0eSghaGFzRW50cmllcywgdGhpcy53ZWxjb21lQ29udGFpbmVyISk7XG5cblx0XHRcdHRoaXMuZmlyZVRyZWVQYW5lU2l6ZUNoYW5nZSgpO1xuXHRcdFx0dGhpcy5sYXlvdXRTcGxpdFZpZXcoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHRyZWVcblx0XHRpZiAoIXRoaXMudHJlZSAmJiB0aGlzLmxpc3RDb250YWluZXIpIHtcblx0XHRcdHRoaXMudHJlZSA9IHRoaXMuY3JlYXRlQ2hhbmdlc1RyZWUodGhpcy5saXN0Q29udGFpbmVyLCB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHksIHRoaXMuX3N0b3JlKTtcblx0XHR9XG5cblx0XHQvLyBSZWdpc3RlciB0cmVlIGV2ZW50IGhhbmRsZXJzXG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0Y29uc3QgdHJlZSA9IHRoaXMudHJlZTtcblxuXHRcdFx0Ly8gUmUtbGF5b3V0IHdoZW4gdHJlZSBjb250ZW50IGNoYW5nZXMgc28gdGhlIGNhcmQgaGVpZ2h0IGFkanVzdHNcblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5maXJlVHJlZVBhbmVTaXplQ2hhbmdlKCk7XG5cdFx0XHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRPcGVuKChlKSA9PiB7XG5cdFx0XHRcdGlmICghZS5lbGVtZW50IHx8ICFpc0NoYW5nZXNGaWxlSXRlbShlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bG9nQ2hhbmdlc1ZpZXdGaWxlU2VsZWN0KHRoaXMudGVsZW1ldHJ5U2VydmljZSwgZS5lbGVtZW50LmNoYW5nZVR5cGUpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNob3VsZE9wZW5Nb2RhbERpZmYoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW1zID0gY2hhbmdlc09icy5nZXQoKTtcblx0XHRcdFx0XHR0aGlzLl9vcGVuRmlsZUl0ZW0oZS5lbGVtZW50LCBpdGVtcywgZS5zaWRlQnlTaWRlLCAhIWUuZWRpdG9yT3B0aW9ucz8ucHJlc2VydmVGb2N1cywgISFlLmVkaXRvck9wdGlvbnM/LnBpbm5lZCwgaXRlbXMubGVuZ3RoID4gMSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSG9sZGluZyBBbHQgaW52ZXJ0cyB0aGUgY29uZmlndXJlZCBzaW5nbGUvbXVsdGkgZmlsZSBkaWZmIGJlaGF2aW9yLlxuXHRcdFx0XHRjb25zdCBhbHRLZXkgPSAhIShlLmJyb3dzZXJFdmVudCBhcyBNb3VzZUV2ZW50IHwgS2V5Ym9hcmRFdmVudCB8IHVuZGVmaW5lZCk/LmFsdEtleTtcblx0XHRcdFx0Y29uc3Qgb3BlblNpbmdsZUZpbGVEaWZmID0gdGhpcy5zaG91bGRPcGVuU2luZ2xlRmlsZURpZmZCeURlZmF1bHQoKSAhPT0gYWx0S2V5O1xuXHRcdFx0XHRpZiAob3BlblNpbmdsZUZpbGVEaWZmKSB7XG5cdFx0XHRcdFx0Ly8gQWx0IGhlcmUgb25seSBzd2l0Y2hlcyB0aGUgZGlmZiBtb2RlLCBub3QgdGhlIHRhcmdldCBncm91cC5cblx0XHRcdFx0XHRjb25zdCBzaWRlQnlTaWRlID0gZS5zaWRlQnlTaWRlICYmICFhbHRLZXk7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLl9vcGVuU2luZ2xlRmlsZURpZmZFZGl0b3IoZS5lbGVtZW50LCBzaWRlQnlTaWRlLCAhIWUuZWRpdG9yT3B0aW9ucz8ucHJlc2VydmVGb2N1cywgISFlLmVkaXRvck9wdGlvbnM/LnBpbm5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3BlbiBtdWx0aS1maWxlIGRpZmYgZWRpdG9yXG5cdFx0XHRcdHZvaWQgdGhpcy5fb3Blbk11bHRpRmlsZURpZmZFZGl0b3IoZS5lbGVtZW50LnVyaSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2tzXG5cdFx0aWYgKHRoaXMuY2lTdGF0dXNXaWRnZXQpIHtcblx0XHRcdGNvbnN0IGNoZWNrc1ZpZXdNb2RlbCA9IHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hlY2tzVmlld01vZGVsKTtcblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGNoZWNrc1ZpZXdNb2RlbCk7XG5cblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuY2lTdGF0dXNXaWRnZXQuc2V0SW5wdXQoY2hlY2tzVmlld01vZGVsKSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXIgZmlsZXMgKGZpbGVzIGVkaXRlZCBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgZHVyaW5nIHRoZSBzZXNzaW9uKVxuXHRcdGlmICh0aGlzLnNlc3Npb25GaWxlc1dpZGdldCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkZpbGVzVmlld01vZGVsID0gdGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uRmlsZXNWaWV3TW9kZWwpO1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbkZpbGVzVmlld01vZGVsKTtcblxuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5zZXNzaW9uRmlsZXNXaWRnZXQuc2V0SW5wdXQoc2Vzc2lvbkZpbGVzVmlld01vZGVsKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRyZWUgZGF0YSB3aXRoIGNvbWJpbmVkIGVudHJpZXNcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gY2hhbmdlc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2aWV3TW9kZSA9IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLnZpZXdNb2RlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25Mb2FkaW5nID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkxvYWRpbmdPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gUmVhZCBzZXNzaW9uIHN0YXRlIHNvIHRoaXMgYXV0b3J1biByZS1ydW5zIHdoZW4gZ2l0IHN0YXRlIChlLmcuIGJyYW5jaFxuXHRcdFx0Ly8gbmFtZSkgYXJyaXZlcyBhc3luY2hyb25vdXNseSwgc2luY2UgdGhlIHRyZWUgcm9vdCBsYWJlbCBkZXBlbmRzIG9uIGl0LlxuXHRcdFx0dGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblN0YXRlT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKCF0aGlzLnRyZWUgfHwgYWN0aXZlU2Vzc2lvbkxvYWRpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChkZXRhaWxzVmlld1N0YXRlVHJhbnNmZXIgIT09IHRoaXMuZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyKSB7XG5cdFx0XHRcdHRoaXMuZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyID0gZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyO1xuXHRcdFx0XHRpZiAoZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyICYmIHRoaXMucmVuZGVyZWRUcmVlU3RhdGUpIHtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJlZFNlc3Npb25SZXNvdXJjZSA9IHRoaXMucmVuZGVyZWRUcmVlU3RhdGUuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdGlmIChpc0VxdWFsKHJlbmRlcmVkU2Vzc2lvblJlc291cmNlLCBkZXRhaWxzVmlld1N0YXRlVHJhbnNmZXIuZnJvbSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2FwdHVyZURldGFpbHNWaWV3U3RhdGUoZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyLnRvKTtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyZWRUcmVlU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGlzRXF1YWwoc2Vzc2lvblJlc291cmNlLCBkZXRhaWxzVmlld1N0YXRlVHJhbnNmZXIuZnJvbSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIWlzRXF1YWwocmVuZGVyZWRTZXNzaW9uUmVzb3VyY2UsIGRldGFpbHNWaWV3U3RhdGVUcmFuc2Zlci50bykpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2FwdHVyZURldGFpbHNWaWV3U3RhdGUoKTtcblx0XHRcdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgaXNFcXVhbChzZXNzaW9uUmVzb3VyY2UsIHJlbmRlcmVkU2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVEZXRhaWxzVmlld1N0YXRlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZXRhaWxzVmlld1N0YXRlID0gc2Vzc2lvblJlc291cmNlID8gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuZ2V0RGV0YWlsc1ZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2UsIHZpZXdNb2RlKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gVG9nZ2xlIGxpc3QtbW9kZSBjbGFzcyB0byByZW1vdmUgdHJlZSBpbmRlbnRhdGlvbiBpbiBsaXN0IG1vZGVcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC1tb2RlJywgdmlld01vZGUgPT09IENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblxuXHRcdFx0aWYgKHZpZXdNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuVHJlZSkge1xuXHRcdFx0XHQvLyBUcmVlIG1vZGU6IGJ1aWxkIGhpZXJhcmNoaWNhbCB0cmVlIGZyb20gZmlsZSBlbnRyaWVzXG5cdFx0XHRcdGNvbnN0IHRyZWVSb290SW5mbyA9IHRoaXMuZ2V0VHJlZVJvb3RJbmZvKGNoYW5nZXMpO1xuXHRcdFx0XHRjb25zdCB0cmVlQ2hpbGRyZW4gPSBidWlsZFRyZWVDaGlsZHJlbihjaGFuZ2VzLCB0cmVlUm9vdEluZm8pO1xuXHRcdFx0XHR0aGlzLnNldERldGFpbHNUcmVlQ2hpbGRyZW4oc2Vzc2lvblJlc291cmNlLCB2aWV3TW9kZSwgZGV0YWlsc1ZpZXdTdGF0ZSwgdHJlZUNoaWxkcmVuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIExpc3QgbW9kZTogZmxhdCBsaXN0IG9mIGZpbGUgaXRlbXNcblx0XHRcdFx0Y29uc3QgbGlzdENoaWxkcmVuID0gY2hhbmdlcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IGl0ZW0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJT2JqZWN0VHJlZUVsZW1lbnQ8Q2hhbmdlc1RyZWVFbGVtZW50PikpO1xuXHRcdFx0XHR0aGlzLnNldERldGFpbHNUcmVlQ2hpbGRyZW4oc2Vzc2lvblJlc291cmNlLCB2aWV3TW9kZSwgZGV0YWlsc1ZpZXdTdGF0ZSwgbGlzdENoaWxkcmVuKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5maXJlVHJlZVBhbmVTaXplQ2hhbmdlKCk7XG5cdFx0XHR0aGlzLmxheW91dFNwbGl0VmlldygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhcHR1cmVEZXRhaWxzVmlld1N0YXRlKCk7XG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNhcHR1cmVEZXRhaWxzVmlld1N0YXRlKHNlc3Npb25SZXNvdXJjZT86IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlIHx8ICF0aGlzLnJlbmRlcmVkVHJlZVN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRyZWUuZ2V0Vmlld1N0YXRlKCkudG9KU09OKCk7XG5cdFx0dGhpcy5jaGFuZ2VzVmlld1NlcnZpY2Uuc2V0RGV0YWlsc1ZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2UgPz8gdGhpcy5yZW5kZXJlZFRyZWVTdGF0ZS5zZXNzaW9uUmVzb3VyY2UsIHRoaXMucmVuZGVyZWRUcmVlU3RhdGUudmlld01vZGUsIHtcblx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0Zm9jdXM6IEFycmF5LmZyb20oc3RhdGUuZm9jdXMpLFxuXHRcdFx0c2VsZWN0aW9uOiBBcnJheS5mcm9tKHN0YXRlLnNlbGVjdGlvbiksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNldERldGFpbHNUcmVlQ2hpbGRyZW4oc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHZpZXdNb2RlOiBDaGFuZ2VzVmlld01vZGUsIHN0YXRlOiBJQ2hhbmdlc0RldGFpbHNWaWV3U3RhdGUgfCB1bmRlZmluZWQsIGNoaWxkcmVuOiByZWFkb25seSBJT2JqZWN0VHJlZUVsZW1lbnQ8Q2hhbmdlc1RyZWVFbGVtZW50PltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRyZWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50c0J5SWQgPSBuZXcgTWFwPHN0cmluZywgQ2hhbmdlc1RyZWVFbGVtZW50PigpO1xuXHRcdGNvbnN0IHJlc3RvcmVkQ2hpbGRyZW4gPSB0aGlzLmFwcGx5RGV0YWlsc1ZpZXdTdGF0ZShjaGlsZHJlbiwgc3RhdGUsIGVsZW1lbnRzQnlJZCk7XG5cblx0XHR0aGlzLnJlbmRlcmVkVHJlZVN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbihudWxsLCByZXN0b3JlZENoaWxkcmVuKTtcblx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoc3RhdGUgPyBBcnJheS5mcm9tKHN0YXRlLmZvY3VzLCBpZCA9PiBlbGVtZW50c0J5SWQuZ2V0KGlkKSkuZmlsdGVyKGVsZW1lbnQgPT4gZWxlbWVudCAhPT0gdW5kZWZpbmVkKSA6IFtdKTtcblx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKHN0YXRlID8gQXJyYXkuZnJvbShzdGF0ZS5zZWxlY3Rpb24sIGlkID0+IGVsZW1lbnRzQnlJZC5nZXQoaWQpKS5maWx0ZXIoZWxlbWVudCA9PiBlbGVtZW50ICE9PSB1bmRlZmluZWQpIDogW10pO1xuXHRcdHRoaXMudHJlZS5zY3JvbGxUb3AgPSBzdGF0ZT8uc2Nyb2xsVG9wID8/IDA7XG5cdFx0dGhpcy5yZW5kZXJlZFRyZWVTdGF0ZSA9IHNlc3Npb25SZXNvdXJjZSA/IHsgc2Vzc2lvblJlc291cmNlLCB2aWV3TW9kZSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseURldGFpbHNWaWV3U3RhdGUoXG5cdFx0Y2hpbGRyZW46IHJlYWRvbmx5IElPYmplY3RUcmVlRWxlbWVudDxDaGFuZ2VzVHJlZUVsZW1lbnQ+W10sXG5cdFx0c3RhdGU6IElDaGFuZ2VzRGV0YWlsc1ZpZXdTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRlbGVtZW50c0J5SWQ6IE1hcDxzdHJpbmcsIENoYW5nZXNUcmVlRWxlbWVudD4sXG5cdCk6IElPYmplY3RUcmVlRWxlbWVudDxDaGFuZ2VzVHJlZUVsZW1lbnQ+W10ge1xuXHRcdHJldHVybiBjaGlsZHJlbi5tYXAoY2hpbGQgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBjaGlsZC5lbGVtZW50LnVyaS50b1N0cmluZygpO1xuXHRcdFx0ZWxlbWVudHNCeUlkLnNldChpZCwgY2hpbGQuZWxlbWVudCk7XG5cdFx0XHRjb25zdCByZXN0b3JlZENoaWxkcmVuID0gY2hpbGQuY2hpbGRyZW5cblx0XHRcdFx0PyB0aGlzLmFwcGx5RGV0YWlsc1ZpZXdTdGF0ZShBcnJheS5mcm9tKGNoaWxkLmNoaWxkcmVuKSwgc3RhdGUsIGVsZW1lbnRzQnlJZClcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBleHBhbmRlZCA9IHN0YXRlPy5leHBhbmRlZFtpZF07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5jaGlsZCxcblx0XHRcdFx0Y2hpbGRyZW46IHJlc3RvcmVkQ2hpbGRyZW4sXG5cdFx0XHRcdGNvbGxhcHNlZDogZXhwYW5kZWQgPT09IHVuZGVmaW5lZCA/IGNoaWxkLmNvbGxhcHNlZCA6IGV4cGFuZGVkID09PSAwLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2JpbmRDb250ZXh0S2V5cyh0b3BMZXZlbFN0YXRzOiBJT2JzZXJ2YWJsZTx7IGZpbGVzOiBudW1iZXIgfSB8IHVuZGVmaW5lZD4pOiB2b2lkIHtcblx0XHQvLyBSZXF1ZXN0IGluIHByb2dyZXNzIChjYW4gYmUgdXBkYXRlZCBpbmRlcGVuZGVudGx5IHNpbmNlIGl0IG9ubHkgYWZmZWN0cyBhY3Rpb24gZW5hYmxlbWVudCwgYW5kIG5vdCB2aXNpYmlsaXR5KVxuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0SW5Qcm9ncmVzcywgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TdGF0dXMgPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKT8uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uU3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCAmJiBhY3RpdmVTZXNzaW9uU3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkVycm9yO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhcyBjaGFuZ2VzIChjYW4gYmUgdXBkYXRlZCBpbmRlcGVuZGVudGx5IHNpbmNlIGl0IG9ubHkgYWZmZWN0cyBhY3Rpb24gZW5hYmxlbWVudCwgYW5kIG5vdCB2aXNpYmlsaXR5KVxuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdHMgPSB0b3BMZXZlbFN0YXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBzdGF0cyAhPT0gdW5kZWZpbmVkICYmIHN0YXRzLmZpbGVzID4gMDtcblx0XHR9KSk7XG5cblx0XHQvLyBCdWxrIHVwZGF0ZSB0aGUgY29udGV4dCBrZXlzXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uU3RhdGVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtDaGFuZ2VzVmlld1BhbmVdW19iaW5kQ29udGV4dEtleXNdIENvbnRleHQga2V5czogJHtKU09OLnN0cmluZ2lmeShzdGF0ZSl9YCk7XG5cblx0XHRcdHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlQ29udGV4dEtleS5zZXQoc3RhdGUuaXNvbGF0aW9uTW9kZSk7XG5cdFx0XHRcdHRoaXMuaGFzR2l0UmVwb3NpdG9yeUNvbnRleHRLZXkuc2V0KHN0YXRlLmhhc0dpdFJlcG9zaXRvcnkpO1xuXHRcdFx0XHR0aGlzLmlzTWVyZ2VCYXNlQnJhbmNoUHJvdGVjdGVkQ29udGV4dEtleS5zZXQoc3RhdGUuaXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWQgPT09IHRydWUpO1xuXHRcdFx0XHR0aGlzLmhhc0dpdEh1YlJlbW90ZUNvbnRleHRLZXkuc2V0KHN0YXRlLmhhc0dpdEh1YlJlbW90ZSA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuaGFzUHVsbFJlcXVlc3RDb250ZXh0S2V5LnNldChzdGF0ZS5oYXNQdWxsUmVxdWVzdCA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuaGFzT3BlblB1bGxSZXF1ZXN0Q29udGV4dEtleS5zZXQoc3RhdGUuaGFzT3BlblB1bGxSZXF1ZXN0ID09PSB0cnVlKTtcblx0XHRcdFx0dGhpcy5oYXNVcHN0cmVhbUNvbnRleHRLZXkuc2V0KHN0YXRlLnVwc3RyZWFtQnJhbmNoTmFtZSAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5oYXNJbmNvbWluZ0NoYW5nZXNDb250ZXh0S2V5LnNldChzdGF0ZS5pbmNvbWluZ0NoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS5pbmNvbWluZ0NoYW5nZXMgPiAwKTtcblx0XHRcdFx0dGhpcy5oYXNPdXRnb2luZ0NoYW5nZXNDb250ZXh0S2V5LnNldChzdGF0ZS5vdXRnb2luZ0NoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS5vdXRnb2luZ0NoYW5nZXMgPiAwKTtcblx0XHRcdFx0dGhpcy5oYXNVbmNvbW1pdHRlZENoYW5nZXNDb250ZXh0S2V5LnNldChzdGF0ZS51bmNvbW1pdHRlZENoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBzdGF0ZS51bmNvbW1pdHRlZENoYW5nZXMgPiAwKTtcblx0XHRcdFx0dGhpcy5oYXNCcmFuY2hDaGFuZ2VzQ29udGV4dEtleS5zZXQoc3RhdGUuaGFzQnJhbmNoQ2hhbmdlcyA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuaGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc0NvbnRleHRLZXkuc2V0KHN0YXRlLmhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3MgPT09IHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIExheW91dCB0aGUgdHJlZSB3aXRoaW4gaXRzIFNwbGl0VmlldyBwYW5lLiAqL1xuXHRwcml2YXRlIF9sYXlvdXRUcmVlSW5QYW5lKHBhbmVIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3VidHJhY3QgdGhlIGZpbGVzIGhlYWRlciBoZWlnaHQgKHByZXNlbnQgaW4gdGhlIG9yaWdpbmFsIGxheW91dCBvbmx5KS5cblx0XHRjb25zdCBmaWxlc0hlYWRlckhlaWdodCA9IHRoaXMuZmlsZXNIZWFkZXJOb2RlPy5vZmZzZXRIZWlnaHQgPz8gMDtcblx0XHRjb25zdCB0cmVlSGVpZ2h0ID0gTWF0aC5tYXgoMCwgcGFuZUhlaWdodCAtIGZpbGVzSGVhZGVySGVpZ2h0KTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KHRyZWVIZWlnaHQsIHRoaXMuY3VycmVudEJvZHlXaWR0aCk7XG5cdFx0dGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCkuc3R5bGUuaGVpZ2h0ID0gYCR7dHJlZUhlaWdodH1weGA7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyZWVQYW5lTWluaW11bVNpemUocmVzZXJ2ZWRTZWN0aW9uSGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmxpc3RDb250YWluZXI/LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0cmV0dXJuIEVNUFRZX0ZJTEVfQ0hBTkdFU19NSU5fSEVJR0hUO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlc2lyZWRTaXplID0gTWF0aC5tYXgodGhpcy5nZXRUcmVlUGFuZURlc2lyZWRTaXplKCksIHRoaXMuZ2V0VHJlZVBhbmVSZXNlcnZlZFJvd3NTaXplKCkpO1xuXHRcdGNvbnN0IGF2YWlsYWJsZVNpemUgPSB0aGlzLmdldFNwbGl0Vmlld0F2YWlsYWJsZUhlaWdodCgpIC0gcmVzZXJ2ZWRTZWN0aW9uSGVpZ2h0O1xuXHRcdHJldHVybiBNYXRoLm1pbihkZXNpcmVkU2l6ZSwgTWF0aC5tYXgoRU1QVFlfRklMRV9DSEFOR0VTX01JTl9IRUlHSFQsIGF2YWlsYWJsZVNpemUpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJlZVBhbmVEZXNpcmVkU2l6ZSgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmxpc3RDb250YWluZXI/LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0cmV0dXJuIEVNUFRZX0ZJTEVfQ0hBTkdFU19NSU5fSEVJR0hUO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVzSGVhZGVySGVpZ2h0ID0gdGhpcy5maWxlc0hlYWRlck5vZGU/Lm9mZnNldEhlaWdodCA/PyAwO1xuXHRcdGNvbnN0IHRyZWVDb250ZW50SGVpZ2h0ID0gdGhpcy50cmVlPy5jb250ZW50SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3QgYm90dG9tUGFkZGluZyA9IHRyZWVDb250ZW50SGVpZ2h0ID4gMCA/IFRSRUVfUEFORV9MSVNUX0JPVFRPTV9QQURESU5HIDogMDtcblx0XHRyZXR1cm4gZmlsZXNIZWFkZXJIZWlnaHQgKyB0cmVlQ29udGVudEhlaWdodCArIGJvdHRvbVBhZGRpbmc7XG5cdH1cblxuXHQvKiogSGVpZ2h0IG5lZWRlZCB0byBzaG93IHtAbGluayBUUkVFX1BBTkVfTUlOX1ZJU0lCTEVfUk9XU30gZmlsZSByb3dzLCByZWdhcmRsZXNzIG9mIGhvdyBtYW55IGFyZSBsaXN0ZWQuICovXG5cdHByaXZhdGUgZ2V0VHJlZVBhbmVSZXNlcnZlZFJvd3NTaXplKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZmlsZXNIZWFkZXJIZWlnaHQgPSB0aGlzLmZpbGVzSGVhZGVyTm9kZT8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG5cdFx0cmV0dXJuIGZpbGVzSGVhZGVySGVpZ2h0ICsgVFJFRV9QQU5FX01JTl9WSVNJQkxFX1JPV1MgKiBDaGFuZ2VzVHJlZURlbGVnYXRlLlJPV19IRUlHSFQgKyBUUkVFX1BBTkVfTElTVF9CT1RUT01fUEFERElORztcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJlZVBhbmVNYXhpbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLmxpc3RDb250YWluZXI/LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0cmV0dXJuIEVNUFRZX0ZJTEVfQ0hBTkdFU19NSU5fSEVJR0hUO1xuXHRcdH1cblxuXHRcdHJldHVybiBNYXRoLm1heCh0aGlzLmdldFRyZWVQYW5lRGVzaXJlZFNpemUoKSwgdGhpcy5nZXRUcmVlUGFuZVJlc2VydmVkUm93c1NpemUoKSk7XG5cdH1cblxuXHRwcml2YXRlIGZpcmVUcmVlUGFuZVNpemVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlUGFuZVNpemVDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqIENvbXB1dGUgdGhlIGhlaWdodCBhdmFpbGFibGUgdG8gdGhlIFNwbGl0VmlldyB3aXRoaW4gdGhlIGJvZHkuICovXG5cdHByaXZhdGUgZ2V0U3BsaXRWaWV3QXZhaWxhYmxlSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgYm9keUhlaWdodCA9IHRoaXMuY3VycmVudEJvZHlIZWlnaHQ7XG5cdFx0aWYgKGJvZHlIZWlnaHQgPD0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IGJvZHlQYWRkaW5nID0gMTY7XG5cdFx0Y29uc3QgYWN0aW9uc0hlaWdodCA9IHRoaXMuYWN0aW9uc0NvbnRhaW5lcj8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3QgYWN0aW9uc01hcmdpbiA9IGFjdGlvbnNIZWlnaHQgPiAwID8gOCA6IDA7XG5cdFx0cmV0dXJuIE1hdGgubWF4KDAsIGJvZHlIZWlnaHQgLSBib2R5UGFkZGluZyAtIGFjdGlvbnNIZWlnaHQgLSBhY3Rpb25zTWFyZ2luKTtcblx0fVxuXG5cdC8qKiBMYXlvdXQgdGhlIFNwbGl0VmlldyB0byBmaWxsIGF2YWlsYWJsZSBib2R5IHNwYWNlLiAqL1xuXHRwcml2YXRlIGxheW91dFNwbGl0VmlldygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc3BsaXRWaWV3IHx8ICF0aGlzLnNwbGl0Vmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdmFpbGFibGVIZWlnaHQgPSB0aGlzLmdldFNwbGl0Vmlld0F2YWlsYWJsZUhlaWdodCgpO1xuXHRcdGlmIChhdmFpbGFibGVIZWlnaHQgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNwbGl0Vmlld0NvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHthdmFpbGFibGVIZWlnaHR9cHhgO1xuXHRcdHRoaXMuc3BsaXRWaWV3LmxheW91dChhdmFpbGFibGVIZWlnaHQpO1xuXHRcdHRoaXMucmViYWxhbmNlU2VjdGlvblBhbmVzPy4oKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaXJlcyBhIGNvbGxhcHNpYmxlIHNlY3Rpb24gd2lkZ2V0IChDSSBjaGVja3MgLyBvdGhlciBmaWxlcykgdG8gaXRzXG5cdCAqIFNwbGl0VmlldyBwYW5lOiB0b2dnbGluZyBpdHMgaGVhZGVyIGNvbGxhcHNlcy9yZXN0b3JlcyB0aGUgcGFuZSwgYW5kXG5cdCAqIGNoYW5nZXMgdG8gaXRzIGNvbnRlbnQgc2hvdy9oaWRlIHRoZSBwYW5lIGFuZCByZS1sYXlvdXQuIEJvdGggc2VjdGlvblxuXHQgKiB3aWRnZXRzIHNoYXJlIHRoZSBzYW1lIHN0cnVjdHVyYWwgY29udHJhY3Qgc28gdGhpcyBsb2dpYyBpcyByZXVzZWQuXG5cdCAqL1xuXHRwcml2YXRlIF93aXJlU2VjdGlvblBhbmUoXG5cdFx0d2lkZ2V0OiB7IHJlYWRvbmx5IGNvbGxhcHNlZDogYm9vbGVhbjsgcmVhZG9ubHkgdmlzaWJsZTogYm9vbGVhbjsgcmVhZG9ubHkgb25EaWRUb2dnbGVDb2xsYXBzZWQ6IEV2ZW50PGJvb2xlYW4+OyByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gfSxcblx0XHRwYW5lSW5kZXg6IG51bWJlcixcblx0XHRoZWFkZXJIZWlnaHQ6IG51bWJlcixcblx0XHRnZXRQcmVmZXJyZWRIZWlnaHQ6ICgpID0+IG51bWJlcixcblx0KTogdm9pZCB7XG5cdFx0bGV0IHNhdmVkUGFuZUhlaWdodCA9IGdldFByZWZlcnJlZEhlaWdodCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod2lkZ2V0Lm9uRGlkVG9nZ2xlQ29sbGFwc2VkKGNvbGxhcHNlZCA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuc3BsaXRWaWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChjb2xsYXBzZWQpIHtcblx0XHRcdFx0Ly8gU2F2ZSBjdXJyZW50IHNpemUgYmVmb3JlIGNvbGxhcHNpbmdcblx0XHRcdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZShwYW5lSW5kZXgpO1xuXHRcdFx0XHRpZiAoY3VycmVudFNpemUgPiBoZWFkZXJIZWlnaHQpIHtcblx0XHRcdFx0XHRzYXZlZFBhbmVIZWlnaHQgPSBjdXJyZW50U2l6ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KHBhbmVJbmRleCwgaGVhZGVySGVpZ2h0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFJlc3RvcmUgc2F2ZWQgc2l6ZSBvbiBleHBhbmRcblx0XHRcdFx0dGhpcy5zcGxpdFZpZXcucmVzaXplVmlldyhwYW5lSW5kZXgsIHNhdmVkUGFuZUhlaWdodCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxheW91dFNwbGl0VmlldygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldC5vbkRpZENoYW5nZUhlaWdodCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuc3BsaXRWaWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZpc2libGUgPSB3aWRnZXQudmlzaWJsZTtcblx0XHRcdGNvbnN0IGlzQ3VycmVudGx5VmlzaWJsZSA9IHRoaXMuc3BsaXRWaWV3LmlzVmlld1Zpc2libGUocGFuZUluZGV4KTtcblx0XHRcdGlmICh2aXNpYmxlICE9PSBpc0N1cnJlbnRseVZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5zcGxpdFZpZXcuc2V0Vmlld1Zpc2libGUocGFuZUluZGV4LCB2aXNpYmxlKTtcblx0XHRcdFx0aWYgKHZpc2libGUgJiYgIXdpZGdldC5jb2xsYXBzZWQgJiYgIXRoaXMuc2VjdGlvblBhbmVzVXNlclJlc2l6ZWQpIHtcblx0XHRcdFx0XHRzYXZlZFBhbmVIZWlnaHQgPSBnZXRQcmVmZXJyZWRIZWlnaHQoKTtcblx0XHRcdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KHBhbmVJbmRleCwgc2F2ZWRQYW5lSGVpZ2h0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXlvdXRTcGxpdFZpZXcoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNldEFjdGl2ZVNlY3Rpb25Db2xsYXBzZWQoc2VjdGlvbjogQ2hhbmdlc1ZpZXdTZWN0aW9uLCBjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMuZ2V0KCk7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5jaGFuZ2VzVmlld1NlcnZpY2Uuc2V0U2VjdGlvbkNvbGxhcHNlZChzZXNzaW9uUmVzb3VyY2UsIHNlY3Rpb24sIGNvbGxhcHNlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmVlU2VsZWN0aW9uKCk6IElDaGFuZ2VzRmlsZUl0ZW1bXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlPy5nZXRTZWxlY3Rpb24oKSA/PyBbXTtcblx0XHRyZXR1cm4gc2VsZWN0aW9uLmZpbHRlcihpdGVtID0+ICEhaXRlbSAmJiBpc0NoYW5nZXNGaWxlSXRlbShpdGVtKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyZWVSb290SW5mbyhpdGVtczogcmVhZG9ubHkgSUNoYW5nZXNGaWxlSXRlbVtdKTogSUNoYW5nZXNUcmVlUm9vdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgZm9sZGVyID0gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdO1xuXHRcdGlmICghZm9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlclVyaSA9IGZvbGRlci53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmICh3b3Jrc3BhY2VGb2xkZXJVcmkuc2NoZW1lID09PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FKSB7XG5cdFx0XHRjb25zdCBzZWdtZW50cyA9IHdvcmtzcGFjZUZvbGRlclVyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cm9vdDoge1xuXHRcdFx0XHRcdHR5cGU6ICdyb290Jyxcblx0XHRcdFx0XHR1cmk6IHdvcmtzcGFjZUZvbGRlclVyaSxcblx0XHRcdFx0XHRuYW1lOiBgJHtzZWdtZW50cy5zbGljZSgwLCAyKS5qb2luKCcvJyl9ICgke2RlY29kZVVSSUNvbXBvbmVudChzZWdtZW50c1syXSl9KWBcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzb3VyY2VUcmVlUm9vdFVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuY29waWxvdFByLCBwYXRoOiAnLycgfSlcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9sZGVyTGFiZWwgPSB0aGlzLndvcmtzcGFjZUZvbGRlckxhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXJMYWJlbChcblx0XHRcdG5ldyBXb3Jrc3BhY2VGb2xkZXIoeyB1cmk6IGZvbGRlci53b3JraW5nRGlyZWN0b3J5LCBuYW1lOiBmb2xkZXIubmFtZSwgaW5kZXg6IDAgfSksXG5cdFx0XHR0cnVlXG5cdFx0KSA/PyBmb2xkZXIubmFtZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cm9vdDoge1xuXHRcdFx0XHR0eXBlOiAncm9vdCcsXG5cdFx0XHRcdHVyaTogd29ya3NwYWNlRm9sZGVyVXJpLFxuXHRcdFx0XHRuYW1lOiBmb2xkZXJMYWJlbFxuXHRcdFx0fSxcblx0XHRcdHJlc291cmNlVHJlZVJvb3RVcmk6IHdvcmtzcGFjZUZvbGRlclVyaVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFNlc3Npb25EaXNjYXJkUmVmKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5nZXQoKTtcblx0XHRyZXR1cm4gY2hhbmdlc2V0Py5vcmlnaW5hbENoZWNrcG9pbnRSZWYuZ2V0KCkgPz8gJyc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5jdXJyZW50Qm9keUhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmN1cnJlbnRCb2R5V2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLmxheW91dFNwbGl0VmlldygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdGlmICh0aGlzLnRyZWUgJiYgdGhpcy50cmVlLmdldE5vZGUobnVsbCkudmlzaWJsZUNoaWxkcmVuQ291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNpZGViYXJMaXN0KFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0b25EaWRMYXlvdXQ6IEV2ZW50PHsgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7IHJlYWRvbmx5IHdpZHRoOiBudW1iZXIgfT4sXG5cdFx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRpdGVtczogSUNoYW5nZXNGaWxlSXRlbVtdLFxuXHRcdG9wZW5GaWxlSXRlbTogKGl0ZW06IElDaGFuZ2VzRmlsZUl0ZW0sIGl0ZW1zOiBJQ2hhbmdlc0ZpbGVJdGVtW10sIHNpZGVCeVNpZGU6IGJvb2xlYW4sIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4sIHBpbm5lZDogYm9vbGVhbiwgaW5jbHVkZVNpZGViYXI6IGJvb2xlYW4pID0+IHZvaWQsXG5cdCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGFuZ2VzLWZpbGUtbGlzdCcpO1xuXG5cdFx0Y29uc3Qgdmlld01vZGUgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS52aWV3TW9kZU9icy5nZXQoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC1tb2RlJywgdmlld01vZGUgPT09IENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblxuXHRcdC8vIFwiQ2hhbmdlc1wiIGhlYWRlclxuXHRcdGNvbnN0IGhlYWRlck5vZGUgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNoYW5nZXMtc2lkZWJhci1oZWFkZXInKSk7XG5cdFx0Y29uc3QgaGVhZGVyTGFiZWwgPSBkb20uYXBwZW5kKGhlYWRlck5vZGUsICQoJ3NwYW4nKSk7XG5cdFx0aGVhZGVyTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhbmdlcycsIFwiQ2hhbmdlc1wiKTtcblx0XHRjb25zdCBjb3VudEJhZGdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb3VudEJhZGdlKGhlYWRlck5vZGUsIHsgY291bnQ6IGl0ZW1zLmxlbmd0aCB9LCBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcykpO1xuXHRcdGNvdW50QmFkZ2Uuc2V0Q291bnQoaXRlbXMubGVuZ3RoKTtcblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLmNyZWF0ZUNoYW5nZXNUcmVlKGNvbnRhaW5lciwgRXZlbnQuTm9uZSwgZGlzcG9zYWJsZXMsICgpID0+IHRyZWUuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKGl0ZW0gPT4gISFpdGVtICYmIGlzQ2hhbmdlc0ZpbGVJdGVtKGl0ZW0pKSwgY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0aWYgKHZpZXdNb2RlID09PSBDaGFuZ2VzVmlld01vZGUuVHJlZSkge1xuXHRcdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBidWlsZFRyZWVDaGlsZHJlbihpdGVtcywgdGhpcy5nZXRUcmVlUm9vdEluZm8oaXRlbXMpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgaXRlbXMubWFwKGl0ZW0gPT4gKHsgZWxlbWVudDogaXRlbSBhcyBDaGFuZ2VzVHJlZUVsZW1lbnQsIGNvbGxhcHNpYmxlOiBmYWxzZSB9KSkpO1xuXHRcdH1cblxuXHRcdC8vIE9wZW4gZmlsZSBvbiBzZWxlY3Rpb24uIFRoZSBgdXBkYXRpbmdTZWxlY3Rpb25gIGd1YXJkIHJlbGllcyBvblxuXHRcdC8vIGB0cmVlLnNldEZvY3VzYC9gc2V0U2VsZWN0aW9uYCBmaXJpbmcgZXZlbnRzIHN5bmNocm9ub3VzbHkuXG5cdFx0bGV0IHVwZGF0aW5nU2VsZWN0aW9uID0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCAmJiBpc0NoYW5nZXNGaWxlSXRlbShlLmVsZW1lbnQpICYmICF1cGRhdGluZ1NlbGVjdGlvbikge1xuXHRcdFx0XHRvcGVuRmlsZUl0ZW0oZS5lbGVtZW50LCBpdGVtcywgZS5zaWRlQnlTaWRlLCAhIWUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLCAhIWUuZWRpdG9yT3B0aW9ucy5waW5uZWQsIGZhbHNlIC8qIHByZXNlcnZlIGV4aXN0aW5nIHNpZGViYXIgKi8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGFjdGl2ZSBlZGl0b3IgYW5kIGhpZ2hsaWdodCBpbiBzaWRlYmFyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByaW1hcnlSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5UmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaShhY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuU0VDT05EQVJZIH0pO1xuXG5cdFx0XHRjb25zdCBpbmRleCA9IGl0ZW1zLmZpbmRJbmRleChpID0+XG5cdFx0XHRcdChwcmltYXJ5UmVzb3VyY2UgIT09IHVuZGVmaW5lZCAmJiBpc0VxdWFsKGkudXJpLCBwcmltYXJ5UmVzb3VyY2UpKSB8fFxuXHRcdFx0XHQoc2Vjb25kYXJ5UmVzb3VyY2UgIT09IHVuZGVmaW5lZCAmJiBpLm9yaWdpbmFsVXJpICE9PSB1bmRlZmluZWQgJiYgaXNFcXVhbChpLm9yaWdpbmFsVXJpLCBzZWNvbmRhcnlSZXNvdXJjZSkpXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dXBkYXRpbmdTZWxlY3Rpb24gPSB0cnVlO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRyZWUuc2V0Rm9jdXMoW2l0ZW1zW2luZGV4XV0pO1xuXHRcdFx0XHRcdHRyZWUuc2V0U2VsZWN0aW9uKFtpdGVtc1tpbmRleF1dKTtcblx0XHRcdFx0XHR0cmVlLnJldmVhbChpdGVtc1tpbmRleF0pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHVwZGF0aW5nU2VsZWN0aW9uID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMYXlvdXQgb24gcmVzaXplLCBhY2NvdW50aW5nIGZvciB0aGUgaGVhZGVyIGhlaWdodFxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkRpZExheW91dChlID0+IHtcblx0XHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IGhlYWRlck5vZGUub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0dHJlZS5sYXlvdXQoTWF0aC5tYXgoMCwgZS5oZWlnaHQgLSBoZWFkZXJIZWlnaHQpLCBlLndpZHRoKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNoYW5nZXNUcmVlKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxib29sZWFuPixcblx0XHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdGdldFNlbGVjdGlvbj86ICgpID0+IElDaGFuZ2VzRmlsZUl0ZW1bXSxcblx0XHRjb250ZXh0S2V5U2VydmljZT86IElDb250ZXh0S2V5U2VydmljZSxcblx0KTogV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxDaGFuZ2VzVHJlZUVsZW1lbnQ+IHtcblx0XHQvLyBXaGVuIGEgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgaXMgcHJvdmlkZWQgKGUuZy4gd2hlbiByZW5kZXJpbmcgaW50b1xuXHRcdC8vIHRoZSBtb2RhbCBlZGl0b3Igc2lkZWJhciksIGNyZWF0ZSB0aGUgdHJlZSB3aXRoIGFuIGluc3RhbnRpYXRpb24gc2VydmljZVxuXHRcdC8vIHRoYXQgdXNlcyBpdCBzbyB0aGUgdHJlZSdzIGNvbnRleHQgZGVzY2VuZHMgZnJvbSB0aGUgbW9kYWwuIFRoaXMga2VlcHNcblx0XHQvLyBtb2RhbC1sZXZlbCBjb250ZXh0IGtleXMgKGUuZy4gYGVkaXRvclBhcnRNb2RhbGApIGFjdGl2ZSB3aGlsZSB0aGUgdHJlZVxuXHRcdC8vIGhhcyBmb2N1cy5cblx0XHRjb25zdCB0cmVlSW5zdGFudGlhdGlvblNlcnZpY2UgPSBjb250ZXh0S2V5U2VydmljZVxuXHRcdFx0PyBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpXG5cdFx0XHQ6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRjb25zdCByZXNvdXJjZUxhYmVscyA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSB9KSk7XG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGFuZ2VzVmlld0FjdGlvblJ1bm5lcihcblx0XHRcdCgpID0+IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icy5nZXQoKSxcblx0XHRcdCgpID0+IHRoaXMuZ2V0U2Vzc2lvbkRpc2NhcmRSZWYoKSxcblx0XHRcdGdldFNlbGVjdGlvbiA/PyAoKCkgPT4gdGhpcy5nZXRUcmVlU2VsZWN0aW9uKCkpLFxuXHRcdCkpO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQodHJlZUluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxDaGFuZ2VzVHJlZUVsZW1lbnQ+LFxuXHRcdFx0J0NoYW5nZXNWaWV3VHJlZScsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgQ2hhbmdlc1RyZWVEZWxlZ2F0ZSgpLFxuXHRcdFx0W3RoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc1RyZWVSZW5kZXJlciwgcmVzb3VyY2VMYWJlbHMsIGFjdGlvblJ1bm5lcixcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdC8vIFBhc3MgaW4gdGhlIHRyZWUgcm9vdCB0byBiZSB1c2VkIHRvIGNvbXB1dGUgdGhlIGxhYmVsIGRlc2NyaXB0aW9uXG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdO1xuXHRcdFx0XHRcdHJldHVybiBmb2xkZXI/LnJvb3Quc2NoZW1lID09PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FXG5cdFx0XHRcdFx0XHQ/IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmNvcGlsb3RQciwgcGF0aDogJy8nIH0pXG5cdFx0XHRcdFx0XHQ6IGZvbGRlcj8ud29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdFx0fSldLFxuXHRcdFx0e1xuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGVsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCkgPT4gaXNDaGFuZ2VzRmlsZUl0ZW0oZWxlbWVudCkgPyBiYXNlbmFtZShlbGVtZW50LnVyaSkgOiBlbGVtZW50Lm5hbWUsXG5cdFx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsOiAoKSA9PiBsb2NhbGl6ZSgnY2hhbmdlc1ZpZXdUcmVlJywgXCJDaGFuZ2VzIFRyZWVcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0ZG5kOiB7XG5cdFx0XHRcdFx0Z2V0RHJhZ1VSSTogKGVsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCkgPT4gZWxlbWVudC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRnZXREcmFnTGFiZWw6IChlbGVtZW50cykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpcyA9IGVsZW1lbnRzLm1hcChlID0+IGUudXJpKTtcblx0XHRcdFx0XHRcdGlmICh1cmlzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodXJpc1swXSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBgJHt1cmlzLmxlbmd0aH1gO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHRcdG9uRHJhZ092ZXI6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdGRyb3A6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRvbkRyYWdTdGFydDogKGRhdGEsIG9yaWdpbmFsRXZlbnQpID0+IHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVsZW1lbnRzID0gZGF0YS5nZXREYXRhKCkgYXMgQ2hhbmdlc1RyZWVFbGVtZW50W107XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHVyaXMgPSBlbGVtZW50cy5maWx0ZXIoaXNDaGFuZ2VzRmlsZUl0ZW0pLm1hcChlID0+IGUudXJpKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCB1cmlzLCBvcmlnaW5hbEV2ZW50KSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IENoYW5nZXNUcmVlRWxlbWVudCkgPT4gZWxlbWVudC51cmkudG9TdHJpbmcoKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbmRlbnQ6IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLnZpZXdNb2RlT2JzLmdldCgpID09PSBDaGFuZ2VzVmlld01vZGUuTGlzdCA/IDAgOiA4LFxuXHRcdFx0XHRjb21wcmVzc2lvbkVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNvcnRlcjogbmV3IENoYW5nZXNUcmVlU29ydGVyKCgpID0+IHRoaXMuY2hhbmdlc1ZpZXdTZXJ2aWNlLnZpZXdNb2RlT2JzLmdldCgpKSxcblx0XHRcdFx0dHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzczogKGU6IHVua25vd24pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2Uudmlld01vZGVPYnMuZ2V0KCkgPT09IENoYW5nZXNWaWV3TW9kZS5MaXN0XG5cdFx0XHRcdFx0XHQ/ICdmb3JjZS1uby10d2lzdGllJ1xuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cblxuXHRhc3luYyBvcGVuQ2hhbmdlcyhyZXNvdXJjZT86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNPYnMuZ2V0KCk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNob3VsZE9wZW5Nb2RhbERpZmYoKSkge1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IHRvSUNoYW5nZXNGaWxlSXRlbShpdGVtcyk7XG5cdFx0XHRjb25zdCBjaGFuZ2VUb09wZW4gPSByZXNvdXJjZSA/IGNoYW5nZXMuZmluZChjID0+IGlzRXF1YWwoYy51cmksIHJlc291cmNlKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRhd2FpdCB0aGlzLl9vcGVuRmlsZUl0ZW0oY2hhbmdlVG9PcGVuID8/IGNoYW5nZXNbMF0sIGNoYW5nZXMsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGNoYW5nZXMubGVuZ3RoID4gMSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBtdWx0aS1maWxlIGRpZmYgZWRpdG9yXG5cdFx0YXdhaXQgdGhpcy5fb3Blbk11bHRpRmlsZURpZmZFZGl0b3IocmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIGZpbGVzIGhlYWRlciAoQnJhbmNoIENoYW5nZXMgZHJvcGRvd24gKyBkaWZmIHN0YXRzKSBpbnRvIHRoZSBwYW5lbC5cblx0ICogU3RhbmRhcmQgbGF5b3V0IG9ubHk7IHtAbGluayBTaW5nbGVQYW5lQ2hhbmdlc1ZpZXdQYW5lfSBvdmVycmlkZXMgdGhpcyB0byBhIG5vLW9wXG5cdCAqIGJlY2F1c2UgdGhlIGhlYWRlciBsaXZlcyBpbiB0aGUgY3VzdG9tIENoYW5nZXMgZWRpdG9yIGluc3RlYWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgY3JlYXRlRmlsZXNIZWFkZXIoY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmZpbGVzSGVhZGVyTm9kZSA9IGRvbS5hcHBlbmQoY29udGVudENvbnRhaW5lciwgJCgnLmNoYW5nZXMtZmlsZXMtaGVhZGVyJykpO1xuXG5cdFx0Y29uc3QgZmlsZXNIZWFkZXJUb29sYmFyQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmZpbGVzSGVhZGVyTm9kZSwgJCgnLmNoYW5nZXMtZmlsZXMtaGVhZGVyLXRvb2xiYXInKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgZmlsZXNIZWFkZXJUb29sYmFyQ29udGFpbmVyLCBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc0ZpbGVIZWFkZXJUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSAnY2hhdEVkaXRpbmcudmVyc2lvbnNQaWNrZXInICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhbmdlc1BpY2tlckFjdGlvbkl0ZW0sIGFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5maWxlSGVhZGVyVG9vbGJhckNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5maWxlc0hlYWRlck5vZGUsICQoJy5jaGFuZ2VzLWZpbGVzLWhlYWRlci1yaWdodC10b29sYmFyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRoaXMuZmlsZUhlYWRlclRvb2xiYXJDb250YWluZXIsIE1lbnVJZC5DaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzRmlsZUhlYWRlclJpZ2h0VG9vbGJhciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNEaWZmU3RhdHNBY3Rpb25JdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSBDcmVhdGUtUFIgYWN0aW9ucyBidXR0b24gYmFyIGludG8gdGhlIGFjdGlvbnMgY29udGFpbmVyLiBTdGFuZGFyZFxuXHQgKiBsYXlvdXQgb25seTsge0BsaW5rIFNpbmdsZVBhbmVDaGFuZ2VzVmlld1BhbmV9IG92ZXJyaWRlcyB0aGlzIHRvIGEgbm8tb3AgYmVjYXVzZVxuXHQgKiB0aGUgYWN0aW9ucyByZW5kZXIgaW4gdGhlIENoYW5nZXMgZWRpdG9yIGhlYWRlciBpbnN0ZWFkLlxuXHQgKi9cblx0cHJvdGVjdGVkIGNyZWF0ZUFjdGlvbnNCdXR0b25CYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmFjdGlvbnNDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0FnZW50SG9zdFNlc3Npb25PYnMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbiA/IGlzQWdlbnRIb3N0UHJvdmlkZXJJZChhY3RpdmVTZXNzaW9uLnByb3ZpZGVySWQpIDogZmFsc2U7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuYWN0aW9uc0NvbnRhaW5lciEpO1xuXG5cdFx0XHRjb25zdCBpc0FnZW50SG9zdFNlc3Npb24gPSBpc0FnZW50SG9zdFNlc3Npb25PYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBpc0FnZW50SG9zdFNlc3Npb25cblx0XHRcdFx0PyB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNXb3JrYmVuY2hCdXR0b25CYXJXaWRnZXQsIHRoaXMuYWN0aW9uc0NvbnRhaW5lciEpXG5cdFx0XHRcdDogdGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzTWVudVdvcmtiZW5jaEJ1dHRvbkJhcldpZGdldCwgdGhpcy5hY3Rpb25zQ29udGFpbmVyISwgdGhpcy5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzT2JzKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQod2lkZ2V0KTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgYWN0aW9ucyBjb250YWluZXIgc2hvdWxkIGJlIHNob3duIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbiBzdGF0ZS5cblx0ICogU3RhbmRhcmQgbGF5b3V0IHNob3dzIGl0IGZvciBub24tdW50aXRsZWQgc2Vzc2lvbnM7IHtAbGluayBTaW5nbGVQYW5lQ2hhbmdlc1ZpZXdQYW5lfVxuXHQgKiBuZXZlciBzaG93cyBpdCAodGhlIGFjdGlvbnMgbGl2ZSBpbiB0aGUgQ2hhbmdlcyBlZGl0b3IpLlxuXHQgKi9cblx0cHJvdGVjdGVkIGlzQWN0aW9uc0NvbnRhaW5lclZpc2libGUoaXNVbnRpdGxlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhaXNVbnRpdGxlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGNsaWNraW5nIGEgZmlsZSBvcGVucyB0aGUgbW9kYWwgc2luZ2xlLWZpbGUgZGlmZi4ge0BsaW5rIFNpbmdsZVBhbmVDaGFuZ2VzVmlld1BhbmV9XG5cdCAqIG5ldmVyIHVzZXMgdGhlIG1vZGFsIGVkaXRvci5cblx0ICovXG5cdHByb3RlY3RlZCBzaG91bGRPcGVuTW9kYWxEaWZmKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWwnKSA9PT0gJ2FsbCc7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBjbGlja2luZyBhIGZpbGUgb3BlbnMgYSBzaW5nbGUtZmlsZSBkaWZmIGJ5IGRlZmF1bHQgKHZzIHRoZVxuXHQgKiBtdWx0aS1maWxlIGRpZmYgZWRpdG9yKS4gQWx0IGludmVydHMgdGhpcy5cblx0ICovXG5cdHByb3RlY3RlZCBzaG91bGRPcGVuU2luZ2xlRmlsZURpZmZCeURlZmF1bHQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oU0VTU0lPTlNfQ0hBTkdFU19PUEVOX1NJTkdMRV9GSUxFX0RJRkZfU0VUVElORyk7XG5cdH1cblxuXHQvKipcblx0ICogUmV2ZWFsIHRoZSBDSSBjaGVja3Mgc2VjdGlvbjogZXhwYW5kIGl0IGlmIGNvbGxhcHNlZCBhbmQgbW92ZSBrZXlib2FyZFxuXHQgKiBmb2N1cyBpbnRvIGl0LiBOby1vcCB3aGVuIHRoZXJlIGFyZSBubyBjaGVja3MgdG8gc2hvdy5cblx0ICovXG5cdHJldmVhbENoZWNrcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2lTdGF0dXNXaWRnZXQgfHwgIXRoaXMuY2lTdGF0dXNXaWRnZXQudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNpU3RhdHVzV2lkZ2V0LmV4cGFuZCgpO1xuXHRcdHRoaXMuY2lTdGF0dXNXaWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5GaWxlSXRlbShpdGVtOiBJQ2hhbmdlc0ZpbGVJdGVtLCBpdGVtczogSUNoYW5nZXNGaWxlSXRlbVtdLCBzaWRlQnlTaWRlOiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBwaW5uZWQ6IGJvb2xlYW4sIGluY2x1ZGVTaWRlYmFyOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyB1cmk6IG1vZGlmaWVkRmlsZVVyaSwgb3JpZ2luYWxVcmksIGlzRGVsZXRpb24gfSA9IGl0ZW07XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gaXRlbXMuaW5kZXhPZihpdGVtKTtcblxuXHRcdGNvbnN0IHNpZGViYXIgPSBpbmNsdWRlU2lkZWJhciA/IHtcblx0XHRcdHJlbmRlcjogKGNvbnRhaW5lcjogdW5rbm93biwgb25EaWRMYXlvdXQ6IEV2ZW50PHsgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7IHJlYWRvbmx5IHdpZHRoOiBudW1iZXIgfT4sIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyU2lkZWJhckxpc3QoY29udGFpbmVyIGFzIEhUTUxFbGVtZW50LCBvbkRpZExheW91dCwgY29udGV4dEtleVNlcnZpY2UsIGl0ZW1zLCB0aGlzLl9vcGVuRmlsZUl0ZW0uYmluZCh0aGlzKSk7XG5cdFx0XHR9XG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG5hdmlnYXRpb24gPSB7XG5cdFx0XHR0b3RhbDogaXRlbXMubGVuZ3RoLFxuXHRcdFx0Y3VycmVudDogY3VycmVudEluZGV4LFxuXHRcdFx0bmF2aWdhdGU6IChpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGl0ZW1zW2luZGV4XTtcblx0XHRcdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5GaWxlSXRlbSh0YXJnZXQsIGl0ZW1zLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBpbmNsdWRlU2lkZWJhcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUDtcblx0XHRjb25zdCBsYWJlbHMgPSBnZXRDaGFuZ2VzRWRpdG9yTGFiZWxzKGl0ZW0udXJpLCB0aGlzLmxhYmVsU2VydmljZSk7XG5cblx0XHRpZiAoaXNEZWxldGlvbiAmJiBvcmlnaW5hbFVyaSkge1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogb3JpZ2luYWxVcmksXG5cdFx0XHRcdC4uLmxhYmVscyxcblx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzLCBwaW5uZWQsIG1vZGFsOiB7IHNpZGViYXIsIG5hdmlnYXRpb24gfSB9XG5cdFx0XHR9LCBncm91cCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG9yaWdpbmFsVXJpKSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBvcmlnaW5hbFVyaSB9LFxuXHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogbW9kaWZpZWRGaWxlVXJpIH0sXG5cdFx0XHRcdC4uLmxhYmVscyxcblx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzLCBwaW5uZWQsIG1vZGFsOiB7IHNpZGViYXIsIG5hdmlnYXRpb24gfSB9XG5cdFx0XHR9LCBncm91cCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IG1vZGlmaWVkRmlsZVVyaSxcblx0XHRcdC4uLmxhYmVscyxcblx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1cywgcGlubmVkLCBtb2RhbDogeyBzaWRlYmFyLCBuYXZpZ2F0aW9uIH0gfVxuXHRcdH0sIGdyb3VwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5TaW5nbGVGaWxlRGlmZkVkaXRvcihpdGVtOiBJQ2hhbmdlc0ZpbGVJdGVtLCBzaWRlQnlTaWRlOiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCBwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHVyaSwgb3JpZ2luYWxVcmksIGlzRGVsZXRpb24gfSA9IGl0ZW07XG5cdFx0Y29uc3QgZ3JvdXAgPSBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUDtcblx0XHRjb25zdCBsYWJlbHMgPSBnZXRDaGFuZ2VzRWRpdG9yTGFiZWxzKHVyaSwgdGhpcy5sYWJlbFNlcnZpY2UpO1xuXG5cdFx0Ly8gQWx3YXlzIG9wZW4gYSBkaWZmIGVkaXRvci4gQWRkZWQgZmlsZXMgKG5vIG9yaWdpbmFsKSBhbmQgZGVsZXRlZCBmaWxlc1xuXHRcdC8vIChubyBtb2RpZmllZCkgYXJlIHNob3duIGFzIGEgZGlmZiBhZ2FpbnN0IGFuIGVtcHR5IHNpZGUsIG1hdGNoaW5nIHRoZVxuXHRcdC8vIFwiT3BlbiBDaGFuZ2VzXCIgYWN0aW9uLlxuXHRcdGNvbnN0IG1vZGlmaWVkVXJpID0gaXNEZWxldGlvbiA/IHVuZGVmaW5lZCA6IHVyaTtcblx0XHRjb25zdCBwYW5lID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IG9yaWdpbmFsVXJpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogbW9kaWZpZWRVcmkgfSxcblx0XHRcdC4uLmxhYmVscyxcblx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1cywgcGlubmVkIH1cblx0XHR9LCBncm91cCk7XG5cblx0XHQvLyBTaG93IHRoZSB3aG9sZSBmaWxlIHJhdGhlciB0aGFuIGZvbGRpbmcgdW5jaGFuZ2VkIHJlZ2lvbnMsIHNpbmNlIHRoaXNcblx0XHQvLyBkaWZmIGlzIG9wZW5lZCB0byByZXZpZXcgb25lIHNwZWNpZmljIGZpbGUuIE5vIG9wZW4tY2FsbCBvcHRpb24gZXhpc3RzXG5cdFx0Ly8gZm9yIHRoaXMsIHNvIGFwcGx5IGl0IHZpYSB1cGRhdGVPcHRpb25zKCkgb25jZSB0aGUgcGFuZSByZXNvbHZlcyAtIGJ1dFxuXHRcdC8vIHRoZSBwYW5lJ3MgZGlmZiBlZGl0b3IgY29udHJvbCBpcyByZXVzZWQgYWNyb3NzIGRpZmZlcmVudCBpbnB1dHMsIHNvXG5cdFx0Ly8gcmVzdG9yZSB0aGUgY29uZmlndXJlZCB2YWx1ZSBvbmNlIHRoaXMgaW5wdXQgaXMgbm8gbG9uZ2VyIGFjdGl2ZSxcblx0XHQvLyByYXRoZXIgdGhhbiBsZWF2aW5nIHRoZSBvdmVycmlkZSBzdHVjayBmb3Igd2hhdGV2ZXIgb3BlbnMgbmV4dC5cblx0XHRjb25zdCBjb250cm9sID0gcGFuZT8uZ2V0Q29udHJvbCgpO1xuXHRcdGlmIChwYW5lICYmIGlzRGlmZkVkaXRvcihjb250cm9sKSkge1xuXHRcdFx0Y29uc3Qgb3BlbmVkSW5wdXQgPSBwYW5lLmlucHV0O1xuXHRcdFx0Y29udHJvbC51cGRhdGVPcHRpb25zKHsgaGlkZVVuY2hhbmdlZFJlZ2lvbnM6IHsgZW5hYmxlZDogZmFsc2UgfSB9KTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gcGFuZS5ncm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdGlmIChwYW5lLmdyb3VwLmFjdGl2ZUVkaXRvciA9PT0gb3BlbmVkSW5wdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRjb250cm9sLnVwZGF0ZU9wdGlvbnMoeyBoaWRlVW5jaGFuZ2VkUmVnaW9uczogeyBlbmFibGVkOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLmVuYWJsZWQnKSB9IH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihsaXN0ZW5lcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3Blbk11bHRpRmlsZURpZmZFZGl0b3IocmV2ZWFsPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5jaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzLmdldCgpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc09icy5nZXQoKTtcblxuXHRcdGlmICghc2Vzc2lvblJlc291cmNlIHx8IGNoYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbmluZyBhIGZpbGUgZGlmZiBpcyBhIGRlbGliZXJhdGUgYWN0aW9uLCBzbyByZXZlYWwgdGhlIChwb3NzaWJseSBoaWRkZW4pXG5cdFx0Ly8gZWRpdG9yIGFyZWEgZXhwbGljaXRseSB0byBzaG93IGl0LiBUaGUgQ2hhbmdlcyBlZGl0b3IgaXMgb3RoZXJ3aXNlIGV4Y2x1ZGVkXG5cdFx0Ly8gZnJvbSBhdXRvIHJldmVhbC1vbi1vcGVuLCBhbmQgdGhlIGV4cGxpY2l0IHJldmVhbCBpcyBub3QgdW5kb25lIGJ5IHRoZVxuXHRcdC8vIGF1dG9tYXRpYyBzaW5nbGUtcGFuZSBoaWRlIHJ1bGVzLlxuXHRcdCh0aGlzLndvcmtiZW5jaExheW91dFNlcnZpY2UgYXMgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSkucmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTtcblxuXHRcdC8vIERldGVybWluZSB0aGUgcmV2ZWFsIHRhcmdldCAob3JpZ2luYWwvbW9kaWZpZWQgVVJJIHBhaXIpIGZyb20gdGhlXG5cdFx0Ly8gY3VycmVudCBjaGFuZ2UgbGlzdCwgc28gdGhlIG11bHRpLWRpZmYgZWRpdG9yIGNhbiBuYXZpZ2F0ZSB0byBpdC5cblx0XHRsZXQgb3B0aW9uczogSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJldmVhbCkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY2hhbmdlcy5maW5kKGMgPT4gaXNDaGFuZ2VzRmlsZVJlc291cmNlKGMsIHJldmVhbCkpO1xuXHRcdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0XHRvcHRpb25zID0ge1xuXHRcdFx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRcdFx0cmV2ZWFsRGF0YToge1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZToge1xuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbmFsOiB0YXJnZXQub3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHRhcmdldC5tb2RpZmllZFVyaSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSU11bHRpRGlmZkVkaXRvck9wdGlvbnM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiB0aGUgc2Vzc2lvbiBDaGFuZ2VzIGVkaXRvciB1c2luZyB0aGUgc2Vzc2lvbnMgc291cmNlIFVSSS4gVGhlXG5cdFx0Ly8gcmVzb3VyY2UgbGlzdCBpcyByZXNvbHZlZCB2aWEgYENoYW5nZXNNdWx0aURpZmZTb3VyY2VSZXNvbHZlcmAgYW5kXG5cdFx0Ly8gdXBkYXRlcyByZWFjdGl2ZWx5IGFzIGBhY3RpdmVTZXNzaW9uQ2hhbmdlc09ic2AgY2hhbmdlcy5cblx0XHRhd2FpdCB0aGlzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5vcGVuQ2hhbmdlc0VkaXRvcihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUgPSB1bmRlZmluZWQ7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogQ2hhbmdlcyB2aWV3IGZvciB0aGUgc2luZ2xlLXBhbmUgbGF5b3V0OiB0aGUgZmlsZXMgbGlzdCBsaXZlcyBpbiB0aGUgZG9ja2VkXG4gKiBkZXRhaWwgcGFuZWwgd2hpbGUgdGhlIEJyYW5jaCBDaGFuZ2VzIGhlYWRlciwgQ3JlYXRlLVBSIGFjdGlvbnMsIGFuZCBkaWZmcyBhcmVcbiAqIHNob3duIGluIHRoZSBjdXN0b20gQ2hhbmdlcyBlZGl0b3IuIE92ZXJyaWRlcyB0aGUgc3RhbmRhcmQgaG9va3MgdG8gb21pdCB0aGVcbiAqIGluLXBhbmVsIGhlYWRlci9hY3Rpb25zLlxuICovXG5leHBvcnQgY2xhc3MgU2luZ2xlUGFuZUNoYW5nZXNWaWV3UGFuZSBleHRlbmRzIENoYW5nZXNWaWV3UGFuZSB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUZpbGVzSGVhZGVyKF9jb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIE5vIGluLXBhbmVsIGhlYWRlciBpbiBzaW5nbGUtcGFuZTsgaXQgbGl2ZXMgaW4gdGhlIENoYW5nZXMgZWRpdG9yLlxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUFjdGlvbnNCdXR0b25CYXIoKTogdm9pZCB7XG5cdFx0Ly8gTm8gaW4tcGFuZWwgQ3JlYXRlLVBSIGFjdGlvbnMgaW4gc2luZ2xlLXBhbmU7IHRoZXkgbGl2ZSBpbiB0aGUgQ2hhbmdlcyBlZGl0b3IgaGVhZGVyLlxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGlzQWN0aW9uc0NvbnRhaW5lclZpc2libGUoX2lzVW50aXRsZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2hvdWxkT3Blbk1vZGFsRGlmZigpOiBib29sZWFuIHtcblx0XHQvLyBTaW5nbGUtcGFuZSBuZXZlciB1c2VzIHRoZSBtb2RhbCBlZGl0b3IuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGFuZ2VzVmlld1BhbmVDb250YWluZXIgZXh0ZW5kcyBWaWV3UGFuZUNvbnRhaW5lciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKENIQU5HRVNfVklFV19DT05UQUlORVJfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb250ZXh0U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuY3JlYXRlKHBhcmVudCk7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ2NoYW5nZXMtdmlld2xldCcpO1xuXHR9XG59XG5cbi8vIC0tLSBBY3Rpb24gUnVubmVyXG5cbmNsYXNzIENoYW5nZXNWaWV3QWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldFNlc3Npb25SZXNvdXJjZTogKCkgPT4gVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0U2Vzc2lvbkRpc2NhcmRSZWY6ICgpID0+IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldFNlbGVjdGVkRmlsZUl0ZW1zOiAoKSA9PiBJQ2hhbmdlc0ZpbGVJdGVtW11cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0OiBDaGFuZ2VzVHJlZUVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdHJldHVybiBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmdldFNlc3Npb25SZXNvdXJjZSgpO1xuXHRcdGNvbnN0IGRpc2NhcmRSZWYgPSB0aGlzLmdldFNlc3Npb25EaXNjYXJkUmVmKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3RlZEZpbGVJdGVtcygpO1xuXG5cdFx0Y29uc3QgY29udGV4dElzU2VsZWN0ZWQgPSBzZWxlY3Rpb24uc29tZShzID0+IHMgPT09IGNvbnRleHQpO1xuXHRcdGNvbnN0IGFjdHVhbENvbnRleHQgPSBjb250ZXh0SXNTZWxlY3RlZCA/IHNlbGVjdGlvbiA6IFtjb250ZXh0XTtcblx0XHRjb25zdCBhcmdzID0gYWN0dWFsQ29udGV4dC5tYXAoZSA9PiB7XG5cdFx0XHRpZiAoUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGUpKSB7XG5cdFx0XHRcdHJldHVybiBSZXNvdXJjZVRyZWUuY29sbGVjdChlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGlzQ2hhbmdlc0ZpbGVJdGVtKGUpID8gW2VdIDogW107XG5cdFx0fSkuZmxhdCgpO1xuXHRcdGF3YWl0IGFjdGlvbi5ydW4oc2Vzc2lvblJlc291cmNlLCBkaXNjYXJkUmVmLCAuLi5hcmdzLm1hcChpdGVtID0+IGl0ZW0udXJpKSk7XG5cdH1cbn1cblxuLy8gLS0tIFRyZWUgRGVsZWdhdGUgYW5kIFNvcnRlclxuXG5jbGFzcyBDaGFuZ2VzVHJlZURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8Q2hhbmdlc1RyZWVFbGVtZW50PiB7XG5cdHN0YXRpYyByZWFkb25seSBST1dfSEVJR0hUID0gMjI7XG5cblx0Z2V0SGVpZ2h0KF9lbGVtZW50OiBDaGFuZ2VzVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBDaGFuZ2VzVHJlZURlbGVnYXRlLlJPV19IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKF9lbGVtZW50OiBDaGFuZ2VzVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBDaGFuZ2VzVHJlZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG59XG5cbmNsYXNzIENoYW5nZXNUcmVlU29ydGVyIGltcGxlbWVudHMgSVRyZWVTb3J0ZXI8Q2hhbmdlc1RyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGU6ICgpID0+IENoYW5nZXNWaWV3TW9kZSkgeyB9XG5cblx0Y29tcGFyZShhOiBDaGFuZ2VzVHJlZUVsZW1lbnQsIGI6IENoYW5nZXNUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMudmlld01vZGUoKSA9PT0gQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdC8vIExpc3Rcblx0XHRcdGNvbnN0IGFQYXRoID0gKGEgYXMgSUNoYW5nZXNGaWxlSXRlbSkudXJpLmZzUGF0aDtcblx0XHRcdGNvbnN0IGJQYXRoID0gKGIgYXMgSUNoYW5nZXNGaWxlSXRlbSkudXJpLmZzUGF0aDtcblxuXHRcdFx0cmV0dXJuIGNvbXBhcmVQYXRocyhhUGF0aCwgYlBhdGgpO1xuXHRcdH1cblxuXHRcdC8vIFRyZWVcblx0XHRjb25zdCBhSXNEaXJlY3RvcnkgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoYSk7XG5cdFx0Y29uc3QgYklzRGlyZWN0b3J5ID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGIpO1xuXG5cdFx0aWYgKGFJc0RpcmVjdG9yeSAhPT0gYklzRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gYUlzRGlyZWN0b3J5ID8gLTEgOiAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFOYW1lID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGEpXG5cdFx0XHQ/IGEubmFtZVxuXHRcdFx0OiBiYXNlbmFtZSgoYSBhcyBJQ2hhbmdlc0ZpbGVJdGVtKS51cmkpO1xuXHRcdGNvbnN0IGJOYW1lID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGIpXG5cdFx0XHQ/IGIubmFtZVxuXHRcdFx0OiBiYXNlbmFtZSgoYiBhcyBJQ2hhbmdlc0ZpbGVJdGVtKS51cmkpO1xuXG5cdFx0cmV0dXJuIGNvbXBhcmVGaWxlTmFtZXMoYU5hbWUsIGJOYW1lKTtcblx0fVxufVxuXG4vLyAtLS0gVmlldyBNb2RlIEFjdGlvbnNcblxuY2xhc3MgU2V0Q2hhbmdlc0xpc3RWaWV3TW9kZUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248Q2hhbmdlc1ZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmNoYW5nZXNWaWV3LmFjdGlvbi5zZXRMaXN0Vmlld01vZGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXRMaXN0Vmlld01vZGUnLCBcIlZpZXcgYXMgTGlzdFwiKSxcblx0XHRcdHZpZXdJZDogQ0hBTkdFU19WSUVXX0lELFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0RmxhdCxcblx0XHRcdHRvZ2dsZWQ6IENoYW5nZXNDb250ZXh0S2V5cy5WaWV3TW9kZS5pc0VxdWFsVG8oQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICcxX3ZpZXdtb2RlJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgX3ZpZXc6IENoYW5nZXNWaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxvZ0NoYW5nZXNWaWV3Vmlld01vZGVDaGFuZ2UoYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKSwgQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpO1xuXHRcdGFjY2Vzc29yLmdldChJQ2hhbmdlc1ZpZXdTZXJ2aWNlKS5zZXRWaWV3TW9kZShDaGFuZ2VzVmlld01vZGUuTGlzdCk7XG5cdH1cbn1cblxuY2xhc3MgU2V0Q2hhbmdlc1RyZWVWaWV3TW9kZUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248Q2hhbmdlc1ZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmNoYW5nZXNWaWV3LmFjdGlvbi5zZXRUcmVlVmlld01vZGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXRUcmVlVmlld01vZGUnLCBcIlZpZXcgYXMgVHJlZVwiKSxcblx0XHRcdHZpZXdJZDogQ0hBTkdFU19WSUVXX0lELFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0VHJlZSxcblx0XHRcdHRvZ2dsZWQ6IENoYW5nZXNDb250ZXh0S2V5cy5WaWV3TW9kZS5pc0VxdWFsVG8oQ2hhbmdlc1ZpZXdNb2RlLlRyZWUpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICcxX3ZpZXdtb2RlJyxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgX3ZpZXc6IENoYW5nZXNWaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxvZ0NoYW5nZXNWaWV3Vmlld01vZGVDaGFuZ2UoYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKSwgQ2hhbmdlc1ZpZXdNb2RlLlRyZWUpO1xuXHRcdGFjY2Vzc29yLmdldChJQ2hhbmdlc1ZpZXdTZXJ2aWNlKS5zZXRWaWV3TW9kZShDaGFuZ2VzVmlld01vZGUuVHJlZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFNldENoYW5nZXNMaXN0Vmlld01vZGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNldENoYW5nZXNUcmVlVmlld01vZGVBY3Rpb24pO1xuXG4vLyAtLS0gVmVyc2lvbnMgUGlja2VyIEFjdGlvblxuXG5jbGFzcyBWZXJzaW9uc1BpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdEVkaXRpbmcudmVyc2lvbnNQaWNrZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBWZXJzaW9uc1BpY2tlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRFZGl0aW5nLnZlcnNpb25zUGlja2VyJywgJ1ZlcnNpb25zJyksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24ubGlzdEZpbHRlcixcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc0ZpbGVIZWFkZXJUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogOSxcblx0XHRcdFx0d2hlbjogQWN0aXZlU2Vzc2lvbkNvbnRleHRLZXlzLkhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JIZWFkZXIsIEFjdGl2ZVNlc3Npb25Db250ZXh0S2V5cy5IYXNHaXRSZXBvc2l0b3J5KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5yZWdpc3RlckFjdGlvbjIoVmVyc2lvbnNQaWNrZXJBY3Rpb24pO1xuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1BpY2tlckFjdGlvbkl0ZW0gZXh0ZW5kcyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBNZW51SXRlbUFjdGlvbixcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgYWN0aW9uUHJvdmlkZXI6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzZXRzID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzT2JzLmdldCgpID8/IFtdO1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZENoYW5nZXNldCA9IGNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLmdldCgpO1xuXG5cdFx0XHRcdHJldHVybiBjaGFuZ2VzZXRzLm1hcChjaGFuZ2VzZXQgPT4gKHtcblx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0aWQ6IGBhZ2VudHMuY2hhbmdlcy5jaGFuZ2VzZXQuJHtjaGFuZ2VzZXQuaWR9YCxcblx0XHRcdFx0XHRsYWJlbDogY2hhbmdlc2V0LmxhYmVsLFxuXHRcdFx0XHRcdGRldGFpbDogY2hhbmdlc2V0LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHNlbGVjdGVkQ2hhbmdlc2V0Py5pZCA9PT0gY2hhbmdlc2V0LmlkLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogY2hhbmdlc2V0LmNhdGVnb3J5ID8/ICcnLFxuXHRcdFx0XHRcdFx0c2hvd0hlYWRlcjogZmFsc2UsXG5cdFx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogY2hhbmdlc2V0LmlzRW5hYmxlZC5nZXQoKSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNoYW5nZXNWaWV3U2VydmljZS5zZXRDaGFuZ2VzZXRJZChjaGFuZ2VzZXQuaWQpO1xuXHRcdFx0XHRcdFx0bG9nQ2hhbmdlc1ZpZXdWZXJzaW9uTW9kZUNoYW5nZSh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIGNoYW5nZXNldC5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24pKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHN1cGVyKGFjdGlvbiwgeyBhY3Rpb25Qcm92aWRlciwgbGlzdE9wdGlvbnM6IHsgZGV0YWlsSXRlbUhlaWdodDogNDQgfSB9LCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGFuZ2VzLXBpY2tlci1hY3Rpb24tcmljaCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUgfCBudWxsIHtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSB0aGlzLmNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLmdldCgpO1xuXHRcdGlmICghY2hhbmdlc2V0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRkb20ucmVzZXQoZWxlbWVudCwgZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGNoYW5nZXNldC5sYWJlbCksIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKCckKGNoZXZyb24tZG93biknKSk7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG4vLyAtLS0gRGlmZiBTdGF0cyBBY3Rpb25zXG4vL1xuLy8gVGhlIGVkaXRvci1ncm91cCBoZWFkZXIncyBsZWZ0IHRpdGxlIGJhciAoU2Vzc2lvbnNFZGl0b3JIZWFkZXJQcmltYXJ5KSBhbHdheXMgcmVuZGVyc1xuLy8gdGhlIHNhbWUgZGlmZi1zdGF0cyBhY3Rpb24gKENoYW5nZXNEaWZmU3RhdHNBY3Rpb24pIHRoYXQgdGhlIGNsYXNzaWMgQ2hhbmdlcyB2aWV3XG4vLyBoZWFkZXIgdXNlcyBcdTIwMTQgdGhlIG9uZSBvdGhlcndpc2Ugc2hvd24gb25seSB3aGlsZSB0aGUgZWRpdG9yIGFyZWEgaXMgY29sbGFwc2VkIFx1MjAxNFxuLy8gd2hldGhlciB0aGUgZWRpdG9yIGFyZWEgaXMgdmlzaWJsZSBvciBjbG9zZWQuIENsaWNraW5nIGl0IG9wZW5zIChvciByZS1vcGVucykgdGhlXG4vLyBDaGFuZ2VzIGVkaXRvci4gSXQgdXNlcyBTaW5nbGVQYW5lQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbkl0ZW0sIGEgcmljaGVyIFwiTiBmaWxlcyArWCAtWVwiXG4vLyByZW5kZXJpbmcgKHRoZSBkZXRhaWwtcGFuZWwgaGVhZGVyIHVzZXMgdGhlIGNvbXBhY3QgYW5pbWF0ZWQgYmFzZSByZW5kZXJpbmcgaW5zdGVhZCkuXG5cbmNsYXNzIENoYW5nZXNEaWZmU3RhdHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jaGFuZ2VzVmlldy5hY3Rpb24udmlld0NoYW5nZXMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhbmdlc1ZpZXcudmlld0NoYW5nZXMnLCAnVmlldyBBbGwgQ2hhbmdlcycpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzRmlsZUhlYWRlclJpZ2h0VG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoc2luZ2xlUGFuZUNoYW5nZXNFZGl0b3JIZWFkZXIsIENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzKVxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IHZpZXdzU2VydmljZS5nZXRWaWV3V2l0aElkPENoYW5nZXNWaWV3UGFuZT4oQ0hBTkdFU19WSUVXX0lEKTtcblx0XHRhd2FpdCB2aWV3Py5vcGVuQ2hhbmdlcygpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbik7XG5cbi8qKlxuICogT3BlbnMgdGhlIENoYW5nZXMgdmlldyBhbmQgcmV2ZWFscyAoZXhwYW5kcyArIGZvY3VzZXMpIHRoZSBDSSBjaGVja3Mgc2VjdGlvbi5cbiAqIFVzZWQgYnkgdGhlIENJIGZhaWx1cmVzIGJhbm5lciBhYm92ZSB0aGUgY2hhdCBpbnB1dC5cbiAqL1xuY2xhc3MgUmV2ZWFsQ0lDaGVja3NBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gUkVWRUFMX0NJX0NIRUNLU19DT01NQU5EX0lEO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZXZlYWxDSUNoZWNrc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JldmVhbENoZWNrcycsICdSZXZlYWwgQ2hlY2tzJyksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3PENoYW5nZXNWaWV3UGFuZT4oQ0hBTkdFU19WSUVXX0lELCB0cnVlKTtcblx0XHR2aWV3Py5yZXZlYWxDaGVja3MoKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKFJldmVhbENJQ2hlY2tzQWN0aW9uKTtcblxuY2xhc3MgQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbkl0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdHByb3RlY3RlZCByZWFkb25seSBfd2lkZ2V0OiBDaGFuZ2VzU3VtbWFyeVdpZGdldDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogZmFsc2UsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdHRoaXMuX3dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYW5nZXNTdW1tYXJ5V2lkZ2V0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VzU3VtbWFyeSA9IHRoaXMuX3dpZGdldC5zdW1tYXJ5LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjaGFuZ2VzU3VtbWFyeSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhbmdlcy1kaWZmLXN0YXRzLWFjdGlvbicpO1xuXG5cdFx0aWYgKCF0aGlzLmxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJMYWJlbENvbnRlbnRzKHRoaXMubGFiZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIGRpZmYtc3RhdHMgY29udGVudCBpbnRvIHRoZSBhY3Rpb24gbGFiZWwuIFRoZSBiYXNlIHNob3dzIHRoZVxuXHQgKiBhbmltYXRlZCArLy0gc3VtbWFyeTsge0BsaW5rIFNpbmdsZVBhbmVDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uSXRlbX0gb3ZlcnJpZGVzXG5cdCAqIHRoaXMgdG8gYSByaWNoZXIgXCJOIGZpbGVzICtYIC1ZXCIgbGFiZWwgZm9yIHRoZSBzaW5nbGUtcGFuZSBlZGl0b3IgaGVhZGVyLlxuXHQgKi9cblx0cHJvdGVjdGVkIHJlbmRlckxhYmVsQ29udGVudHMobGFiZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LnJlbmRlcihsYWJlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYW5nZXNTdW1tYXJ5ID0gdGhpcy5fd2lkZ2V0LnN1bW1hcnkuZ2V0KCk7XG5cdFx0aWYgKGNoYW5nZXNTdW1tYXJ5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBmaWxlcywgYWRkaXRpb25zLCBkZWxldGlvbnMgfSA9IGNoYW5nZXNTdW1tYXJ5O1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhbmdlc1ZpZXcuZGlmZlN0YXRzLmxhYmVsJywgJ3swfSBmaWxlcywgezF9IGFkZGl0aW9ucywgezJ9IGRlbGV0aW9ucycsIGZpbGVzLCBhZGRpdGlvbnMsIGRlbGV0aW9ucyk7XG5cdH1cbn1cblxuLyoqXG4gKiBEaWZmLXN0YXRzIGFjdGlvbiBpdGVtIGZvciB0aGUgc2luZ2xlLXBhbmUgQ2hhbmdlcyBlZGl0b3IgaGVhZGVyOiBhIHJpY2hlclxuICogXCJOIGZpbGVzICtYIC1ZXCIgcmVuZGVyaW5nICh0aGUgZGV0YWlsLXBhbmVsIGhlYWRlciB1c2VzIHRoZSBjb21wYWN0IGFuaW1hdGVkXG4gKiBiYXNlIHJlbmRlcmluZykuIFVubGlrZSB0aGUgYmFzZSBpdGVtIHRoaXMgcmVtYWlucyBmdWxseSBpbnRlcmFjdGl2ZSBcdTIwMTQgY2xpY2tpbmdcbiAqIGl0IHJ1bnMgdGhlIGFjdGlvbiAob3BlbnMgdGhlIENoYW5nZXMgZWRpdG9yKSB0aGUgc2FtZSBhcyB0aGUgYmFzZSByZW5kZXJpbmcuXG4gKiBBZGRzIHRoZSBgY2hhbmdlcy1kaWZmLXN0YXRzLWFjdGlvbi1yaWNoYCBtYXJrZXIgY2xhc3Mgc28gaXRzIHN0eWxpbmcgYXBwbGllc1xuICogd2hlcmV2ZXIgaXQgcmVuZGVycyAodGhlIGNsYXNzaWMgaW50ZXJuYWwgaGVhZGVyIG9yIHRoZSBzaW5nbGUtcGFuZSBlZGl0b3ItZ3JvdXBcbiAqIGhlYWRlcikuXG4gKi9cbmV4cG9ydCBjbGFzcyBTaW5nbGVQYW5lQ2hhbmdlc0RpZmZTdGF0c0FjdGlvbkl0ZW0gZXh0ZW5kcyBDaGFuZ2VzRGlmZlN0YXRzQWN0aW9uSXRlbSB7XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhbmdlcy1kaWZmLXN0YXRzLWFjdGlvbi1yaWNoJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyTGFiZWxDb250ZW50cyhsYWJlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gdGhpcy5fd2lkZ2V0LnN1bW1hcnkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHN1bW1hcnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgZmlsZXMsIGFkZGl0aW9ucywgZGVsZXRpb25zIH0gPSBzdW1tYXJ5O1xuXHRcdFx0Y29uc3QgZmlsZXNMYWJlbCA9IGZpbGVzID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYW5nZXNWaWV3LmRpZmZTdGF0cy5maWxlJywgXCIxIGZpbGVcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhbmdlc1ZpZXcuZGlmZlN0YXRzLmZpbGVzJywgXCJ7MH0gZmlsZXNcIiwgZmlsZXMpO1xuXG5cdFx0XHRkb20ucmVzZXQoXG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRkb20uJCgnc3Bhbi5jaGFuZ2VzLWRpZmYtc3RhdHMtZmlsZXMnLCB1bmRlZmluZWQsIGZpbGVzTGFiZWwpLFxuXHRcdFx0XHRkb20uJCgnc3Bhbi53b3JraW5nLXNldC1saW5lcy1hZGRlZCcsIHVuZGVmaW5lZCwgYCske2FkZGl0aW9uc31gKSxcblx0XHRcdFx0ZG9tLiQoJ3NwYW4ud29ya2luZy1zZXQtbGluZXMtcmVtb3ZlZCcsIHVuZGVmaW5lZCwgYC0ke2RlbGV0aW9uc31gKVxuXHRcdFx0KTtcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQiwwQkFBa0Q7QUFDM0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsY0FBdUIsV0FBVyxlQUFlLGdCQUFnQjtBQUMxRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFNBQVMsU0FBUyw0QkFBeUMscUJBQXFCLHVCQUF1QjtBQUNoSCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FB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
