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
import "../media/sessionsList.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { pauseCSSAnimationsWhenHidden, synchronizeCSSAnimations } from "../../../../../base/browser/animationSync.js";
import { Gesture } from "../../../../../base/browser/touch.js";
import { ListDragOverEffectPosition, ListDragOverEffectType, NotSelectableGroupId } from "../../../../../base/browser/ui/list/list.js";
import { ObjectTreeElementCollapseState } from "../../../../../base/browser/ui/tree/tree.js";
import { RenderIndentGuides, TreeFindMode } from "../../../../../base/browser/ui/tree/abstractTree.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { createMatches } from "../../../../../base/common/filters.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { autorun, derived, observableSignalFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { fromNow } from "../../../../../base/common/date.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { localize } from "../../../../../nls.js";
import { MenuId, IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { SessionProviderIdContext, SessionSupportsDeleteContext, SessionSupportsRenameContext, SessionTypeContext, IsPhoneLayoutContext, SessionIsArchivedContext, SessionIsReadContext, SessionHasPullRequestContext } from "../../../../common/contextkeys.js";
import { RENAME_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { defaultButtonStyles, defaultFindWidgetStyles, defaultInputBoxStyles, defaultToggleStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
import { chartsOrange } from "../../../../../platform/theme/common/colors/chartsColors.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchivedSectionLabel, getChatSessionArchiveActionWording } from "../../../../../platform/chat/common/sessionArchiveActions.js";
import { getSessionStatusMessage, getSessionWorkspaceKind, GITHUB_REMOTE_FILE_SCHEME, SessionStatus, SessionWorkspaceKind } from "../../../../services/sessions/common/session.js";
import { AgentSessionApprovalModel, agentSessionApprovalId } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { IVoicePlaybackService } from "../../../../../workbench/contrib/chat/common/voicePlaybackService.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { ActionRunner, Separator, SubmenuAction, toAction } from "../../../../../base/common/actions.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { HoverStyle } from "../../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsListModelService } from "../../../../services/sessions/browser/sessionsListModelService.js";
import { ISessionGroupsService } from "../../../../services/sessions/browser/sessionGroupsService.js";
import { ISessionSectionOrderService } from "../../../../services/sessions/browser/sessionSectionOrderService.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { IWorkbenchAssignmentService } from "../../../../../workbench/services/assignment/common/assignmentService.js";
import { IAgentSessionsService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { LocalSelectionTransfer } from "../../../../../platform/dnd/browser/dnd.js";
import { DraggedSessionIdentifier, SessionsDataTransfers } from "../../../../browser/dnd.js";
import { ElementsDragAndDropData, ListViewTargetSector } from "../../../../../base/browser/ui/list/listView.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { buildSessionHoverContent } from "../sessionHoverContent.js";
import { SessionStatusIcon } from "../../../../browser/sessionStatusIcon.js";
import { ChatAutomationsEnabledContext } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { AUTOMATIONS_CUSTOM_VIEW_ID } from "../automationsConstants.js";
const $ = DOM.$;
const AUTOMATIONS_SECTION_ID = "automations";
const SESSION_SECTION_FOCUS_FROM_POINTER_CLASS = "session-section-focus-from-pointer";
const SESSION_HEADER_DROP_TARGET_CLASS = "session-header-drop-target";
const SessionItemToolbarMenuId = new MenuId("SessionItemToolbar");
const SessionItemContextMenuId = MenuId.SessionItemContextMenu;
const SessionSectionToolbarMenuId = new MenuId("SessionSectionToolbar");
const SessionGroupToolbarMenuId = new MenuId("SessionGroupToolbar");
const SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING = "sessions.list.showEmptyDefaultGroups";
const IsSessionPinnedContext = new RawContextKey("sessionItem.isPinned", false);
const SessionItemHasBranchNameContext = new RawContextKey("sessionItem.hasBranchName", false);
const SessionItemStatusContext = new RawContextKey("sessionItem.status", SessionStatus.Completed);
const SessionItemInGroupContext = new RawContextKey("sessionItem.inGroup", false);
const SessionSectionTypeContext = new RawContextKey("sessionSection.type", "");
const SessionSectionHasGitHubRepositoryContext = new RawContextKey("sessionSection.hasGitHubRepository", false);
const SessionSectionHasNonCloudRepositoryContext = new RawContextKey("sessionSection.hasNonCloudRepository", false);
const SessionGroupHasVisibleSessionsContext = new RawContextKey("sessionGroup.hasVisibleSessions", false);
const SessionGroupIsEmptyContext = new RawContextKey("sessionGroup.isEmpty", false);
var SessionsGrouping = /* @__PURE__ */ ((SessionsGrouping2) => {
  SessionsGrouping2["Workspace"] = "workspace";
  SessionsGrouping2["Date"] = "date";
  return SessionsGrouping2;
})(SessionsGrouping || {});
var SessionsSorting = /* @__PURE__ */ ((SessionsSorting2) => {
  SessionsSorting2["Created"] = "created";
  SessionsSorting2["Updated"] = "updated";
  return SessionsSorting2;
})(SessionsSorting || {});
function sortingToMode(sorting) {
  return sorting === "updated" /* Updated */ ? "updated" : "created";
}
const SORT_FALLBACK_STEP_MS = 6e4;
function isSessionGroupItem(item) {
  return "group" in item;
}
function isSessionSection(item) {
  return !isSessionGroupItem(item) && "sessions" in item && Array.isArray(item.sessions);
}
function isSessionShowMore(item) {
  return "showMore" in item && item.showMore === true;
}
function isSessionPlaceholder(item) {
  return "placeholder" in item && item.placeholder === true;
}
function isSessionItem(item) {
  return !isSessionGroupItem(item) && !isSessionSection(item) && !isSessionShowMore(item) && !isSessionPlaceholder(item);
}
const SHOW_MORE_FOLDERS_LABEL = "__more_folders__";
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1e3;
const DEFAULT_APPROVAL_ROW_MAX_LINES = 3;
const _SessionsTreeDelegate = class _SessionsTreeDelegate {
  constructor(_approvalModel, _isPhone, _approvalRowMaxLines = DEFAULT_APPROVAL_ROW_MAX_LINES, _ciFixModel = void 0) {
    this._approvalModel = _approvalModel;
    this._isPhone = _isPhone;
    this._approvalRowMaxLines = _approvalRowMaxLines;
    this._ciFixModel = _ciFixModel;
  }
  getHeight(element) {
    if (isSessionSection(element) || isSessionGroupItem(element)) {
      return _SessionsTreeDelegate.SECTION_HEIGHT;
    }
    if (isSessionShowMore(element)) {
      return _SessionsTreeDelegate.SHOW_MORE_HEIGHT;
    }
    if (isSessionPlaceholder(element)) {
      return _SessionsTreeDelegate.PLACEHOLDER_HEIGHT;
    }
    let height;
    if (this._isPhone()) {
      height = _SessionsTreeDelegate.ITEM_HEIGHT_PHONE;
    } else if (isQuickChatSession(element)) {
      height = _SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT;
    } else {
      height = _SessionsTreeDelegate.ITEM_HEIGHT;
    }
    if (this._approvalModel) {
      const approval = getFirstApprovalAcrossChats(this._approvalModel, element, void 0);
      if (approval) {
        height += SessionItemRenderer.getApprovalRowHeight(approval.label, this._approvalRowMaxLines);
      }
    }
    if (this._ciFixModel && this._ciFixModel.getCIFix(element).get()) {
      height += SessionItemRenderer.CI_ROW_HEIGHT;
    }
    return height;
  }
  hasDynamicHeight(element) {
    return (!!this._approvalModel || !!this._ciFixModel) && isSessionItem(element);
  }
  getTemplateId(element) {
    if (isSessionGroupItem(element)) {
      return SessionGroupRenderer.TEMPLATE_ID;
    }
    if (isSessionSection(element)) {
      return SessionSectionRenderer.TEMPLATE_ID;
    }
    if (isSessionShowMore(element)) {
      return SessionShowMoreRenderer.TEMPLATE_ID;
    }
    if (isSessionPlaceholder(element)) {
      return SessionPlaceholderRenderer.TEMPLATE_ID;
    }
    return SessionItemRenderer.TEMPLATE_ID;
  }
};
_SessionsTreeDelegate.ITEM_HEIGHT = 54;
/** Quick-chat rows are single-line — see the `.session-item.quick-chat` rules in `sessionsList.css`. */
_SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT = 28;
/**
 * Phone layout uses a taller row so the inline action toolbar can
 * meet the 44px minimum touch target without overflowing. Sized to
 * fit a 44px toolbar centered between the title and details rows.
 * Keep in sync with the `.phone-layout .session-item` rules in
 * `sessionsList.css`.
 */
_SessionsTreeDelegate.ITEM_HEIGHT_PHONE = 76;
_SessionsTreeDelegate.SECTION_HEIGHT = 26;
_SessionsTreeDelegate.SHOW_MORE_HEIGHT = 26;
_SessionsTreeDelegate.PLACEHOLDER_HEIGHT = 26;
let SessionsTreeDelegate = _SessionsTreeDelegate;
class SessionItemActionRunner extends ActionRunner {
  constructor(getMultiSelectedSessions, handleAction) {
    super();
    this.getMultiSelectedSessions = getMultiSelectedSessions;
    this.handleAction = handleAction;
  }
  async runAction(action, context) {
    if (context && !Array.isArray(context)) {
      if (this.handleAction && await this.handleAction(action, context)) {
        return;
      }
      await super.runAction(action, this.getMultiSelectedSessions(context));
      return;
    }
    await super.runAction(action, context);
  }
}
const SESSION_TITLE_SHIMMER_ANIMATION_NAME = "session-title-shimmer";
const SESSION_TITLE_SHIMMER_ANIMATION_NAMES = /* @__PURE__ */ new Set([SESSION_TITLE_SHIMMER_ANIMATION_NAME]);
const SESSION_TITLE_SHIMMER_PAUSED_CLASS = "session-title-shimmer-paused";
const _SessionItemRenderer = class _SessionItemRenderer {
  constructor(options, approvalModel, ciFixModel, instantiationService, contextKeyService, markdownRendererService, hoverService, sessionsProvidersService, agentSessionsService, _voicePlaybackService) {
    this.options = options;
    this.approvalModel = approvalModel;
    this.ciFixModel = ciFixModel;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.markdownRendererService = markdownRendererService;
    this.hoverService = hoverService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.agentSessionsService = agentSessionsService;
    this._voicePlaybackService = _voicePlaybackService;
    this.templateId = _SessionItemRenderer.TEMPLATE_ID;
    this.rowClassName = "session-list-inset-row";
    this._onDidChangeItemHeight = new Emitter();
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    this._onDidApproveSession = new Emitter();
    /** Fires when the user approves a session's pending action via its "Allow" button. */
    this.onDidApproveSession = this._onDidApproveSession.event;
  }
  static getApprovalRowHeight(label, maxLines = DEFAULT_APPROVAL_ROW_MAX_LINES) {
    const lineCount = Math.min(label.split(/\r?\n/).length, maxLines);
    return lineCount * _SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + _SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    container.classList.add("session-item");
    const iconContainer = DOM.append(container, $(".session-icon"));
    const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
    const mainCol = DOM.append(container, $(".session-main"));
    const titleRow = DOM.append(mainCol, $(".session-title-row"));
    const titleContainer = DOM.append(titleRow, $(".session-title"));
    const title = disposables.add(new HighlightedLabel(titleContainer));
    disposables.add(DOM.addDisposableListener(titleContainer, DOM.EventType.ANIMATION_START, (e) => {
      if (e.target === titleContainer && e.animationName === SESSION_TITLE_SHIMMER_ANIMATION_NAME) {
        synchronizeCSSAnimations(titleContainer, { animationNames: SESSION_TITLE_SHIMMER_ANIMATION_NAMES });
      }
    }));
    disposables.add(pauseCSSAnimationsWhenHidden(titleContainer, {
      pausedClass: SESSION_TITLE_SHIMMER_PAUSED_CLASS,
      animationNames: SESSION_TITLE_SHIMMER_ANIMATION_NAMES
    }));
    const titleToolbarContainer = DOM.append(titleRow, $(".session-title-toolbar"));
    const pendingVoiceIndicator = DOM.append(titleRow, $(".session-pending-voice-indicator"));
    for (const eventType of ["pointerdown", "pointerup", "click", "dblclick"]) {
      disposables.add(DOM.addDisposableListener(titleToolbarContainer, eventType, (e) => e.stopPropagation()));
    }
    disposables.add(Gesture.ignoreTarget(titleToolbarContainer));
    const detailsRow = DOM.append(mainCol, $(".session-details-row"));
    const approvalRow = DOM.append(mainCol, $(".session-approval-row"));
    const approvalLabel = DOM.append(approvalRow, $("span.session-approval-label"));
    const approvalButtonContainer = DOM.append(approvalRow, $(".session-approval-button"));
    const ciRow = DOM.append(mainCol, $(".session-ci-row"));
    const ciLabel = DOM.append(ciRow, $("span.session-ci-label"));
    const ciButtonContainer = DOM.append(ciRow, $(".session-ci-button"));
    for (const eventType of ["pointerdown", "pointerup", "click", "dblclick"]) {
      disposables.add(DOM.addDisposableListener(ciRow, eventType, (e) => e.stopPropagation()));
    }
    disposables.add(Gesture.ignoreTarget(ciRow));
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
    const statusContext = SessionItemStatusContext.bindTo(contextKeyService);
    const isReadContext = SessionIsReadContext.bindTo(contextKeyService);
    const supportsDeleteContext = SessionSupportsDeleteContext.bindTo(contextKeyService);
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    let titleToolbar;
    if (this.options.toolbarMenuId) {
      const actionRunner = disposables.add(new SessionItemActionRunner(this.options.getMultiSelectedSessions, this.options.handleToolbarAction));
      titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, this.options.toolbarMenuId, {
        menuOptions: { shouldForwardArgs: true },
        actionRunner
      }));
    }
    return { container, statusIcon, title, titleContainer, titleToolbar, pendingVoiceIndicator, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, ciRow, ciLabel, ciButtonContainer, contextKeyService, statusContext, isReadContext, supportsDeleteContext, disposables, elementDisposables };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionItem(element)) {
      return;
    }
    this.renderSession(element, template, createMatches(node.filterData));
  }
  renderSession(element, template, matches) {
    template.elementDisposables.clear();
    if (this.options.onDidRequestRename) {
      template.elementDisposables.add(DOM.addDisposableListener(template.title.element, DOM.EventType.DBLCLICK, (event) => {
        if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !element.capabilities.get().supportsRename) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.options.onDidRequestRename?.(element);
      }));
    }
    this.agentSessionsService.model.observeSession(element.resource);
    if (this.options.showHover) {
      template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => ({
        content: buildSessionHoverContent(element, this.sessionsProvidersService),
        appearance: { showPointer: true },
        position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
        persistence: { hideOnHover: false }
      }), { groupId: "sessions-list" }));
    }
    const pendingVoiceResource = element.resource;
    template.pendingVoiceIndicator.className = "session-pending-voice-indicator " + ThemeIcon.asClassName(Codicon.unmute);
    template.elementDisposables.add(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      template.pendingVoiceIndicator,
      localize("pendingVoiceResponse", "Voice response ready")
    ));
    template.elementDisposables.add(autorun((reader) => {
      this._voicePlaybackService.pendingResponseVersion.read(reader);
      template.pendingVoiceIndicator.classList.toggle("visible", this._voicePlaybackService.hasPendingResponse(pendingVoiceResource));
    }));
    if (template.titleToolbar) {
      template.titleToolbar.context = element;
    }
    const isPinned = this.options.isPinned(element);
    IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
    SessionIsArchivedContext.bindTo(template.contextKeyService).set(element.isArchived.get());
    SessionItemHasBranchNameContext.bindTo(template.contextKeyService).set(!!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim());
    template.elementDisposables.add(autorun((reader) => {
      const isArchived = element.isArchived.read(reader);
      template.container.classList.toggle("archived", isArchived);
      template.container.classList.toggle("pinned", isPinned && !isArchived);
    }));
    template.elementDisposables.add(autorun((reader) => {
      const wrapper = this.options.visibleSessions.read(reader).find((s) => s?.sessionId === element.sessionId);
      const isSticky = wrapper ? wrapper.sticky.read(reader) : false;
      template.container.classList.toggle("sticky", isSticky);
    }));
    template.elementDisposables.add(autorun((reader) => {
      const sessionStatus = element.status.read(reader);
      template.statusContext.set(sessionStatus);
      const isRead = element.isRead.read(reader);
      template.isReadContext.set(isRead);
      const isArchived = element.isArchived.read(reader);
      const capabilities = element.capabilities.read(reader);
      template.supportsDeleteContext.set(capabilities.supportsDelete === true);
      const gitHubInfo = element.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
      const isQuickChat = element.isQuickChat?.read(reader) ?? false;
      const completedStateIcon = element.completedStateIcon?.read(reader) ?? gitHubInfo?.pullRequest?.icon;
      template.statusIcon.setStatus(sessionStatus, isRead, isArchived, completedStateIcon, element.resource);
      template.container.classList.toggle("in-progress", sessionStatus === SessionStatus.InProgress);
      template.container.classList.toggle("needs-input", sessionStatus === SessionStatus.NeedsInput);
      template.container.classList.toggle("unread", !isRead && !isArchived);
      template.container.classList.toggle("quick-chat", isQuickChat);
    }));
    template.elementDisposables.add(autorun((reader) => {
      const titleText = element.title.read(reader);
      template.title.set(titleText, matches);
    }));
    const timeDisposable = template.elementDisposables.add(new MutableDisposable());
    const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
    template.elementDisposables.add(autorun((reader) => {
      const sessionStatus = element.status.read(reader);
      const workspace = element.workspace.read(reader);
      const description = element.description.read(reader);
      const isQuickChat = element.isQuickChat?.read(reader) ?? false;
      DOM.clearNode(template.detailsRow);
      if (isQuickChat) {
        descriptionDisposable.clear();
        timeDisposable.clear();
        return;
      }
      const changes = element.changes.read(reader);
      const changesSummary = element.changesSummary?.read(reader);
      let timeDate;
      const hideDetails = sessionStatus === SessionStatus.InProgress || sessionStatus === SessionStatus.NeedsInput;
      if (!hideDetails) {
        timeDate = element.updatedAt.read(reader);
      }
      const parts = [];
      if (sessionStatus !== SessionStatus.InProgress) {
        const kind = getSessionWorkspaceKind(workspace, element.worktreePending?.read(reader));
        const icon = workspace?.typeIcon ?? (kind === SessionWorkspaceKind.Virtual ? Codicon.cloudCompact : kind === SessionWorkspaceKind.Folder ? Codicon.folderCompact : Codicon.worktreeCompact);
        const typeIconEl = DOM.append(template.detailsRow, $("span.session-details-icon"));
        DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(icon)}`));
        parts.push(typeIconEl);
      }
      if (!hideDetails && workspace && (this.options.grouping() !== "workspace" /* Workspace */ || this.options.isPinned(element) || element.isArchived.read(reader) || this.options.isRenderedInCustomGroup?.(element))) {
        const badgeLabel = getWorkspaceBadgeLabel(workspace);
        if (badgeLabel) {
          const badgeEl = DOM.append(template.detailsRow, $("span.session-badge"));
          badgeEl.textContent = badgeLabel;
          parts.push(badgeEl);
        }
      }
      if (!hideDetails && (changesSummary || changes.length > 0)) {
        let insertions = 0, deletions = 0;
        if (changesSummary) {
          insertions = changesSummary.additions;
          deletions = changesSummary.deletions;
        } else if (changes.length > 0) {
          for (const change of changes) {
            insertions += change.insertions;
            deletions += change.deletions;
          }
        }
        if (insertions > 0 || deletions > 0) {
          if (parts.length > 0) {
            DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
          }
          const diffEl = DOM.append(template.detailsRow, $("span.session-diff"));
          DOM.append(diffEl, $("span.session-diff-added")).textContent = `+${insertions}`;
          DOM.append(diffEl, $("span.session-diff-removed")).textContent = `-${deletions}`;
          parts.push(diffEl);
        }
      }
      const statusMessage = getSessionStatusMessage(sessionStatus, description);
      if (statusMessage !== void 0) {
        if (parts.length > 0) {
          DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
        }
        const statusEl = DOM.append(template.detailsRow, $("span.session-description"));
        if (typeof statusMessage === "string") {
          descriptionDisposable.clear();
          statusEl.textContent = statusMessage;
        } else {
          descriptionDisposable.value = this.markdownRendererService.render(statusMessage, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
        }
        parts.push(statusEl);
      } else {
        descriptionDisposable.clear();
      }
      if (!hideDetails && timeDate) {
        if (parts.length > 0) {
          DOM.append(template.detailsRow, $("span.session-separator.has-separator"));
        }
        const timeEl = DOM.append(template.detailsRow, $("span.session-time"));
        const definiteTimeDate = timeDate;
        const formatTime = () => {
          const seconds = Math.round((Date.now() - definiteTimeDate.getTime()) / 1e3);
          return seconds < 60 ? localize("secondsDuration", "now") : fromNow(definiteTimeDate, true);
        };
        timeEl.textContent = formatTime();
        const targetWindow = DOM.getWindow(timeEl);
        const interval = targetWindow.setInterval(() => {
          timeEl.textContent = formatTime();
        }, 6e4);
        timeDisposable.value = toDisposable(() => targetWindow.clearInterval(interval));
      } else {
        timeDisposable.clear();
      }
    }));
    if (this.approvalModel) {
      this.renderApprovalRow(element, template);
    }
    if (this.ciFixModel) {
      this.renderCIRow(element, template);
    }
  }
  renderApprovalRow(element, template) {
    if (!this.approvalModel) {
      return;
    }
    const approvalModel = this.approvalModel;
    const initialInfo = getFirstApprovalAcrossChats(approvalModel, element, void 0);
    let wasVisible = !!initialInfo;
    template.approvalRow.classList.toggle("visible", wasVisible);
    const buttonStore = template.elementDisposables.add(new DisposableStore());
    template.elementDisposables.add(autorun((reader) => {
      buttonStore.clear();
      const info = getFirstApprovalAcrossChats(approvalModel, element, reader);
      const visible = !!info;
      template.approvalRow.classList.toggle("visible", visible);
      if (info) {
        const lines = info.label.split("\n");
        const maxLines = this.options.approvalRowMaxLines;
        const visibleLines = lines.slice(0, maxLines);
        if (lines.length > maxLines) {
          visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
        }
        const langId = info.languageId ?? "json";
        const labelContent = new MarkdownString();
        for (const line of visibleLines) {
          labelContent.appendCodeblock(langId, line);
        }
        template.approvalLabel.textContent = "";
        buttonStore.add(this.markdownRendererService.render(labelContent, {}, template.approvalLabel));
        if (this.options.showHover) {
          const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? "json", info.label);
          buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
            content: fullContent,
            style: HoverStyle.Pointer,
            position: { hoverPosition: HoverPosition.BELOW }
          }));
        }
        template.approvalButtonContainer.textContent = "";
        const button = buttonStore.add(new Button(template.approvalButtonContainer, {
          title: localize("allowActionOnce", "Allow once"),
          secondary: true,
          ...defaultButtonStyles
        }));
        button.label = localize("allowAction", "Allow");
        buttonStore.add(button.onDidClick(() => {
          const approvalId = agentSessionApprovalId(info);
          info.confirm();
          this._onDidApproveSession.fire({ session: element, approvalId });
        }));
      }
      if (wasVisible !== visible) {
        wasVisible = visible;
        this._onDidChangeItemHeight.fire(element);
      }
    }));
  }
  renderCIRow(element, template) {
    if (!this.ciFixModel) {
      return;
    }
    const ciFixModel = this.ciFixModel;
    const stateObs = ciFixModel.getCIFix(element);
    let wasVisible = !!stateObs.get();
    template.ciRow.classList.toggle("visible", wasVisible);
    const buttonStore = template.elementDisposables.add(new DisposableStore());
    template.elementDisposables.add(autorun((reader) => {
      buttonStore.clear();
      const state = stateObs.read(reader);
      const visible = !!state;
      template.ciRow.classList.toggle("visible", visible);
      if (state) {
        template.ciLabel.textContent = localize("ci.blockedRow", "{0} checks failed, {1} pending", state.failed, state.pending);
        template.ciButtonContainer.textContent = "";
        const button = buttonStore.add(new Button(template.ciButtonContainer, {
          title: localize("ci.fixCITooltip", "Fix failing CI checks"),
          ...defaultButtonStyles,
          buttonBackground: asCssVariable(chartsOrange),
          buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
          buttonBorder: asCssVariable(chartsOrange)
        }));
        button.label = localize("ci.fixCI", "Fix CI");
        buttonStore.add(button.onDidClick(() => ciFixModel.fixCI(element)));
      }
      if (wasVisible !== visible) {
        wasVisible = visible;
        this._onDidChangeItemHeight.fire(element);
      }
    }));
  }
  disposeElement(node, _index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.disposables.dispose();
  }
};
_SessionItemRenderer.TEMPLATE_ID = "session-item";
_SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT = 18;
_SessionItemRenderer._APPROVAL_ROW_OVERHEAD = 14;
/** Height of the single-line "Fix CI" row (label + orange button), including its top margin. */
_SessionItemRenderer.CI_ROW_HEIGHT = 32;
let SessionItemRenderer = _SessionItemRenderer;
function getWorkspaceBadgeLabel(workspace) {
  const folder = workspace.folders[0];
  if (folder?.root.scheme === GITHUB_REMOTE_FILE_SCHEME) {
    const parts = folder.root.path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }
  return workspace.label;
}
function renderSessionHeaderToolbar(template, element, select) {
  template.elementDisposables.add(DOM.addDisposableListener(template.toolbarContainer, DOM.EventType.CONTEXT_MENU, (event) => select(element, event), true));
  template.toolbar.context = element;
}
const _SessionSectionRenderer = class _SessionSectionRenderer {
  constructor(hideSectionCount, select, instantiationService, contextKeyService, automationService, automationSessions, uriIdentityService, customViewService) {
    this.hideSectionCount = hideSectionCount;
    this.select = select;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.automationService = automationService;
    this.automationSessions = automationSessions;
    this.uriIdentityService = uriIdentityService;
    this.customViewService = customViewService;
    this.templateId = _SessionSectionRenderer.TEMPLATE_ID;
    this.templatesByElement = /* @__PURE__ */ new WeakMap();
    this.templatesById = /* @__PURE__ */ new Map();
    // TODO@BenV: Move automation-specific code into an AutomationSectionRenderer subclass.
    this.automationStatus = derived(this, (reader) => {
      const runs = this.automationService.runs.read(reader);
      const automationSessions = this.automationSessions.read(reader);
      const hasNeedsInput = runs.some((run) => {
        if (run.status !== "running" || !run.sessionResource) {
          return false;
        }
        const session = automationSessions.find((candidate) => this.uriIdentityService.extUri.isEqual(candidate.resource, run.sessionResource));
        return !!session && session.status.read(reader) === SessionStatus.NeedsInput;
      });
      if (hasNeedsInput) {
        return SessionStatus.NeedsInput;
      }
      if (runs.some((run) => run.status === "pending" || run.status === "running")) {
        return SessionStatus.InProgress;
      }
      const hasUnreadRun = runs.some((run) => {
        if (run.status !== "completed" && run.status !== "failed" || !run.sessionResource) {
          return false;
        }
        const sessionResource = run.sessionResource;
        const session = automationSessions.find((candidate) => this.uriIdentityService.extUri.isEqual(candidate.resource, sessionResource));
        return !!session && !session.isRead.read(reader);
      });
      if (hasUnreadRun) {
        return SessionStatus.Completed;
      }
      return void 0;
    });
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = disposables.add(new DisposableStore());
    container.classList.add("session-section");
    const icon = DOM.append(container, $("span.session-section-icon"));
    icon.setAttribute("aria-hidden", "true");
    const label = DOM.append(container, $("span.session-section-label"));
    const statusIndicator = DOM.append(container, $("span.session-section-status-indicator"));
    statusIndicator.setAttribute("aria-hidden", "true");
    const count = DOM.append(container, $("span.session-section-count"));
    const toolbarContainer = DOM.append(container, $(".session-section-toolbar"));
    const chevron = DOM.append(container, $("span.session-section-chevron"));
    chevron.setAttribute("aria-hidden", "true");
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionSectionToolbarMenuId, {
      menuOptions: { shouldForwardArgs: true }
    }));
    return { container, icon, statusIndicator, label, count, toolbarContainer, toolbar, chevron, contextKeyService, elementDisposables, disposables };
  }
  renderElement(node, _index, template) {
    template.elementDisposables.clear();
    const element = node.element;
    if (!isSessionSection(element)) {
      return;
    }
    renderSessionHeaderToolbar(template, element, this.select);
    this.templatesByElement.set(element, template);
    this.templatesById.set(element.id, template);
    template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
    template.container.classList.remove("session-section-shortcut");
    if (element.id === AUTOMATIONS_SECTION_ID) {
      template.container.classList.add("session-section-shortcut");
    }
    const sectionIcon = element.id === QUICK_CHATS_SECTION_ID ? Codicon.commentDiscussion : element.id === "pinned" ? Codicon.pinned : element.id === AUTOMATIONS_SECTION_ID ? Codicon.watch : void 0;
    template.icon.className = sectionIcon ? `session-section-icon ${ThemeIcon.asClassName(sectionIcon)}` : "session-section-icon";
    template.icon.style.display = sectionIcon ? "" : "none";
    if (element.id === AUTOMATIONS_SECTION_ID) {
      template.elementDisposables.add(autorun((reader) => {
        const activeCustomView = this.customViewService.activeCustomView.read(reader);
        template.container.classList.toggle("active", activeCustomView?.id === AUTOMATIONS_CUSTOM_VIEW_ID);
      }));
      DOM.clearNode(template.statusIndicator);
      const statusIcon = template.elementDisposables.add(this.instantiationService.createInstance(SessionStatusIcon, template.statusIndicator));
      template.elementDisposables.add(autorun((reader) => {
        const automationStatus = this.automationStatus.read(reader);
        if (automationStatus === SessionStatus.NeedsInput) {
          template.statusIndicator.style.display = "";
          statusIcon.setStatus(SessionStatus.NeedsInput, true, false);
        } else if (automationStatus === SessionStatus.InProgress) {
          template.statusIndicator.style.display = "";
          statusIcon.setStatus(SessionStatus.InProgress, true, false);
        } else if (automationStatus === SessionStatus.Completed) {
          template.statusIndicator.style.display = "";
          statusIcon.setStatus(SessionStatus.Completed, false, false);
        } else {
          template.statusIndicator.style.display = "none";
        }
      }));
    } else {
      template.statusIndicator.style.display = "none";
      DOM.clearNode(template.statusIndicator);
    }
    template.label.textContent = element.label;
    if (this.hideSectionCount || element.id === AUTOMATIONS_SECTION_ID) {
      template.count.textContent = "";
      template.count.style.display = "none";
    } else {
      template.count.textContent = String(element.sessions.length);
      template.count.style.display = "";
    }
    this.updateChevron(template, node.collapsible, node.collapsed);
    const sectionType = element.id.startsWith("workspace:") ? "workspace" : element.id;
    SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
    const hasGitHubRepository = SessionSectionHasGitHubRepositoryContext.bindTo(template.contextKeyService);
    const hasNonCloudRepository = SessionSectionHasNonCloudRepositoryContext.bindTo(template.contextKeyService);
    template.elementDisposables.add(autorun((reader) => {
      let hasGitHub = false;
      let hasNonCloudWorkspace = false;
      for (const session of element.sessions) {
        for (const folder of session.workspace.read(reader)?.folders ?? []) {
          if (folder.gitRepository?.gitHubInfo.read(reader) !== void 0) {
            hasGitHub = true;
          }
          hasNonCloudWorkspace ||= folder.root.scheme !== GITHUB_REMOTE_FILE_SCHEME;
        }
      }
      hasGitHubRepository.set(hasGitHub);
      hasNonCloudRepository.set(hasNonCloudWorkspace);
    }));
  }
  /**
   * Updates the expand/collapse chevron for an already-rendered section. The
   * tree only re-invokes `renderTwistie` (not `renderElement`) when a section's
   * collapse state toggles, so the owning list forwards collapse changes here.
   */
  updateCollapseState(element, collapsed) {
    const template = this.templatesByElement.get(element);
    if (template) {
      this.updateChevron(template, true, collapsed);
    }
  }
  setDropTarget(sectionId, active) {
    const template = this.templatesById.get(sectionId);
    template?.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
  }
  updateChevron(template, collapsible, collapsed) {
    template.chevron.className = "session-section-chevron";
    if (collapsible) {
      template.chevron.classList.add("collapsible");
      const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
  }
  disposeElement(node, _index, template) {
    template.elementDisposables.clear();
    if (isSessionSection(node.element)) {
      this.templatesByElement.delete(node.element);
      this.templatesById.delete(node.element.id);
    }
  }
  disposeTemplate(template) {
    template.disposables.dispose();
  }
};
_SessionSectionRenderer.TEMPLATE_ID = "session-section";
let SessionSectionRenderer = _SessionSectionRenderer;
const _SessionGroupRenderer = class _SessionGroupRenderer {
  constructor(delegate, instantiationService, contextKeyService) {
    this.delegate = delegate;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = _SessionGroupRenderer.TEMPLATE_ID;
    this.templatesByElement = /* @__PURE__ */ new WeakMap();
    this.templatesById = /* @__PURE__ */ new Map();
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    container.classList.add("session-section", "session-group");
    const label = DOM.append(container, $("span.session-section-label"));
    const inputContainer = DOM.append(container, $(".session-group-input"));
    const toolbarContainer = DOM.append(container, $(".session-section-toolbar"));
    const chevron = DOM.append(container, $("span.session-section-chevron"));
    chevron.setAttribute("aria-hidden", "true");
    const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
    const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionGroupToolbarMenuId, {
      menuOptions: { shouldForwardArgs: true }
    }));
    return { container, label, inputContainer, toolbarContainer, toolbar, chevron, contextKeyService, disposables, elementDisposables: disposables.add(new DisposableStore()) };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionGroupItem(element)) {
      return;
    }
    template.elementDisposables.clear();
    renderSessionHeaderToolbar(template, element, this.delegate.select);
    this.templatesByElement.set(element, template);
    this.templatesById.set(element.group.id, template);
    template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);
    template.label.textContent = element.group.name;
    this.updateChevron(template, node.collapsible, node.collapsed);
    SessionGroupHasVisibleSessionsContext.bindTo(template.contextKeyService).set(element.sessions.length > 0);
    SessionGroupIsEmptyContext.bindTo(template.contextKeyService).set(element.isEmpty);
    template.container.classList.toggle("session-group-editing", element.editing);
    if (element.editing) {
      this.renderInput(element, template);
    } else {
      template.inputContainer.style.display = "none";
      template.label.style.display = "";
    }
  }
  renderInput(element, template) {
    template.label.style.display = "none";
    template.inputContainer.style.display = "";
    DOM.clearNode(template.inputContainer);
    const input = template.elementDisposables.add(new InputBox(template.inputContainer, void 0, {
      inputBoxStyles: defaultInputBoxStyles,
      ariaLabel: localize("sessionGroupName", "Group name")
    }));
    input.value = element.group.name;
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) {
        return;
      }
      done = true;
      this.delegate.commitEdit(element.group, input.value.trim());
    };
    const cancel = () => {
      if (done) {
        return;
      }
      done = true;
      this.delegate.cancelEdit(element.group);
    };
    template.elementDisposables.add(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.equals(KeyCode.Escape)) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    }));
    template.elementDisposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.BLUR, () => commit()));
  }
  /** Forwarded from the owning list when the group's collapse state toggles. */
  updateCollapseState(element, collapsed) {
    const template = this.templatesByElement.get(element);
    if (template) {
      this.updateChevron(template, true, collapsed);
    }
  }
  setDropTarget(groupId, active) {
    const template = this.templatesById.get(groupId);
    template?.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
  }
  updateChevron(template, collapsible, collapsed) {
    template.chevron.className = "session-section-chevron";
    if (collapsible) {
      template.chevron.classList.add("collapsible");
      const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
  }
  disposeElement(node, _index, template) {
    if (isSessionGroupItem(node.element)) {
      this.templatesByElement.delete(node.element);
      this.templatesById.delete(node.element.group.id);
    }
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.disposables.dispose();
  }
};
_SessionGroupRenderer.TEMPLATE_ID = "session-group";
let SessionGroupRenderer = _SessionGroupRenderer;
const _SessionShowMoreRenderer = class _SessionShowMoreRenderer {
  constructor() {
    this.templateId = _SessionShowMoreRenderer.TEMPLATE_ID;
    this.rowClassName = "session-list-inset-row";
  }
  renderTemplate(container) {
    container.classList.add("session-show-more");
    return DOM.append(container, $("span.session-show-more-label"));
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionShowMore(element)) {
      return;
    }
    const container = template.parentElement;
    container?.classList.toggle("session-show-more-folders", element.kind === "folders");
    if (element.mode === "less") {
      template.textContent = element.kind === "folders" ? localize("showLessWorkspacesCompact", "Show fewer workspaces") : localize("showLessCompact", "Show less");
    } else {
      template.textContent = element.kind === "folders" ? element.remainingCount === 1 ? localize("showMoreWorkspaceCompact", "+{0} more workspace", element.remainingCount) : localize("showMoreWorkspacesCompact", "+{0} more workspaces", element.remainingCount) : localize("showMoreCompact", "+{0} more", element.remainingCount);
    }
  }
  disposeTemplate(_template) {
  }
};
_SessionShowMoreRenderer.TEMPLATE_ID = "session-show-more";
let SessionShowMoreRenderer = _SessionShowMoreRenderer;
const _SessionPlaceholderRenderer = class _SessionPlaceholderRenderer {
  constructor(hoverService) {
    this.hoverService = hoverService;
    this.templateId = _SessionPlaceholderRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("session-placeholder");
    return {
      container,
      label: DOM.append(container, $("span.session-placeholder-label")),
      hover: new MutableDisposable()
    };
  }
  renderElement(node, _index, template) {
    const element = node.element;
    if (!isSessionPlaceholder(element)) {
      return;
    }
    template.label.textContent = element.label;
    template.hover.value = element.hover ? this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), template.container, element.hover) : void 0;
  }
  disposeTemplate(template) {
    template.hover.dispose();
  }
};
_SessionPlaceholderRenderer.TEMPLATE_ID = "session-placeholder";
let SessionPlaceholderRenderer = _SessionPlaceholderRenderer;
class SessionsAccessibilityProvider {
  constructor(automationStatus, workspaceBadgeOptions) {
    this.automationStatus = automationStatus;
    this.workspaceBadgeOptions = workspaceBadgeOptions;
  }
  getWidgetAriaLabel() {
    return localize("sessionsList", "Sessions");
  }
  getAriaLabel(element) {
    if (isSessionGroupItem(element)) {
      return `${element.group.name}, ${element.sessions.length}`;
    }
    if (isSessionSection(element)) {
      if (element.id === AUTOMATIONS_SECTION_ID) {
        return this.automationStatus ? derived(this, (reader) => {
          switch (this.automationStatus?.read(reader)) {
            case SessionStatus.NeedsInput:
              return localize("automationsNeedsInputAria", "{0}, run needs input", element.label);
            case SessionStatus.InProgress:
              return localize("automationsActiveAria", "{0}, run in progress", element.label);
            case SessionStatus.Completed:
              return localize("automationsUnreadRunAria", "{0}, unread run", element.label);
            default:
              return element.label;
          }
        }) : element.label;
      }
      return `${element.label}, ${element.sessions.length}`;
    }
    if (isSessionShowMore(element)) {
      if (element.mode === "less") {
        return element.kind === "folders" ? localize("showLessWorkspacesAria", "Show fewer workspaces") : localize("showLessAria", "Show fewer sessions");
      }
      return element.kind === "folders" ? element.remainingCount === 1 ? localize("showMoreWorkspaceAria", "Show {0} more workspace", element.remainingCount) : localize("showMoreWorkspacesAria", "Show {0} more workspaces", element.remainingCount) : localize("showMoreAria", "Show {0} more sessions", element.remainingCount);
    }
    if (isSessionPlaceholder(element)) {
      return element.hover ? localize("sessionPlaceholderAria", "{0}. {1}", element.label, element.hover) : element.label;
    }
    return derived(this, (reader) => {
      const title = element.title.read(reader);
      const updated = fromNow(element.updatedAt.read(reader), true);
      let label = element.worktreePending?.read(reader) ? localize("sessionItemWorktreePendingAria", "{0}, creating worktree, updated {1}", title, updated) : localize("sessionItemAria", "{0}, updated {1}", title, updated);
      const status = element.status.read(reader);
      const workspace = element.workspace.read(reader);
      const workspaceLabel = workspace ? getWorkspaceBadgeLabel(workspace) : void 0;
      if (this.workspaceBadgeOptions && status !== SessionStatus.InProgress && status !== SessionStatus.NeedsInput && workspaceLabel && (this.workspaceBadgeOptions.grouping() !== "workspace" /* Workspace */ || this.workspaceBadgeOptions.isPinned(element) || element.isArchived.read(reader) || this.workspaceBadgeOptions.isRenderedInCustomGroup?.(element))) {
        label = localize("sessionItemWorkspaceAria", "{0}, in {1}", label, workspaceLabel);
      }
      return label;
    });
  }
}
class SessionsListDragAndDrop extends Disposable {
  constructor(delegate) {
    super();
    this.delegate = delegate;
    this._transfer = LocalSelectionTransfer.getInstance();
  }
  getDragURI(element) {
    if (isSessionGroupItem(element)) {
      return `sessionGroup:${element.group.id}`;
    }
    if (isSessionSection(element)) {
      return element.id.startsWith("workspace:") ? `sessionWorkspace:${element.id}` : null;
    }
    if (isSessionShowMore(element)) {
      return null;
    }
    if (isSessionPlaceholder(element)) {
      return null;
    }
    return element.resource.toString();
  }
  getDragLabel(elements) {
    const groupItem = elements.find(isSessionGroupItem);
    if (groupItem) {
      return groupItem.group.name;
    }
    const workspaceSection = elements.find((e) => isSessionSection(e) && e.id.startsWith("workspace:"));
    if (workspaceSection) {
      return workspaceSection.label;
    }
    const sessions = this.toSessions(elements);
    if (sessions.length === 0) {
      return void 0;
    }
    if (sessions.length === 1) {
      return sessions[0].title.get();
    }
    return localize("sessions.dragLabel", "{0} sessions", sessions.length);
  }
  onDragStart(data, originalEvent) {
    const sessions = this.toSessions(data instanceof ElementsDragAndDropData ? data.elements : []);
    if (sessions.length === 0) {
      return;
    }
    const identifiers = sessions.map((s) => new DraggedSessionIdentifier(s.sessionId, s.resource));
    this._transfer.setData(identifiers, DraggedSessionIdentifier.prototype);
    if (originalEvent.dataTransfer) {
      const payload = JSON.stringify({ sessionId: sessions[0].sessionId, resource: sessions[0].resource.toString() });
      originalEvent.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
    }
  }
  onDragEnd() {
    this._transfer.clearData(DraggedSessionIdentifier.prototype);
    this.delegate.setDropTargetHeader(void 0);
  }
  onDragOver(data, targetElement, _targetIndex, targetSector) {
    const draggedHeader = this.draggedHeader(data);
    if (draggedHeader) {
      this.delegate.setDropTargetHeader(void 0);
      return this.onHeaderDragOver(draggedHeader, targetElement, targetSector);
    }
    const pinTarget = this.resolvePinTarget(data, targetElement, targetSector);
    if (pinTarget) {
      this.delegate.setDropTargetHeader(pinTarget.header);
      return this.toMembershipDropReaction(pinTarget);
    }
    const addToGroupTarget = this.resolveAddToGroupTarget(data, targetElement, targetSector);
    if (addToGroupTarget) {
      this.delegate.setDropTargetHeader(addToGroupTarget.header);
      return this.toMembershipDropReaction(addToGroupTarget);
    }
    this.delegate.setDropTargetHeader(void 0);
    const target = this.resolveReorderTarget(data, targetElement);
    if (!target) {
      return false;
    }
    const position = sectorToPosition(targetSector);
    return {
      accept: true,
      effect: {
        type: ListDragOverEffectType.Move,
        position: position === "after" ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before
      }
    };
  }
  drop(data, targetElement, _targetIndex, targetSector) {
    this.delegate.setDropTargetHeader(void 0);
    try {
      const draggedHeader = this.draggedHeader(data);
      if (draggedHeader) {
        if (targetElement) {
          const targetRef = this.headerRefOf(targetElement);
          if (targetRef && targetRef !== draggedHeader.id) {
            this.delegate.reorderSection(draggedHeader.id, targetRef, sectorToPosition(targetSector), draggedHeader.isWorkspace);
          }
        }
        return;
      }
      const pinTarget = this.resolvePinTarget(data, targetElement, targetSector);
      if (pinTarget) {
        this.delegate.pinSessions(pinTarget.sessions, pinTarget.target, pinTarget.position);
        return;
      }
      const addToGroupTarget = this.resolveAddToGroupTarget(data, targetElement, targetSector);
      if (addToGroupTarget) {
        this.delegate.addSessionsToGroup(addToGroupTarget.sessions, addToGroupTarget.groupId, addToGroupTarget.target, addToGroupTarget.position);
        return;
      }
      const target = this.resolveReorderTarget(data, targetElement);
      if (!target) {
        return;
      }
      this.delegate.reorder(this.draggedSessions(data), target, sectorToPosition(targetSector));
    } finally {
      this.delegate.setDropTargetHeader(void 0);
    }
  }
  onHeaderDragOver(draggedHeader, targetElement, targetSector) {
    if (!targetElement) {
      return false;
    }
    const targetRef = this.headerRefOf(targetElement);
    if (!targetRef || targetRef === draggedHeader.id) {
      return false;
    }
    const position = sectorToPosition(targetSector);
    return {
      accept: true,
      effect: {
        type: ListDragOverEffectType.Move,
        position: position === "after" ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before
      }
    };
  }
  resolvePinTarget(data, targetElement, targetSector) {
    if (!targetElement) {
      return void 0;
    }
    let target;
    if (isSessionSection(targetElement)) {
      if (targetElement.id !== "pinned") {
        return void 0;
      }
    } else if (isSessionItem(targetElement) && this.delegate.isSessionPinned(targetElement)) {
      target = targetElement;
    } else {
      return void 0;
    }
    const dragged = this.draggedSessions(data);
    const hasArchived = dragged.some((session) => session.isArchived.get());
    const allPinned = dragged.every((session) => this.delegate.isSessionPinned(session));
    if (dragged.length === 0 || hasArchived || allPinned) {
      return void 0;
    }
    if (target && dragged.some((session) => session.sessionId === target.sessionId)) {
      return void 0;
    }
    return {
      sessions: dragged,
      header: { kind: "section", id: "pinned" },
      target,
      position: target ? sectorToPosition(targetSector) : void 0
    };
  }
  resolveAddToGroupTarget(data, targetElement, targetSector) {
    if (!targetElement) {
      return void 0;
    }
    let groupId;
    let target;
    if (isSessionGroupItem(targetElement)) {
      groupId = targetElement.group.id;
    } else if (isSessionPlaceholder(targetElement) && targetElement.sectionId.startsWith("group:")) {
      groupId = targetElement.sectionId.slice("group:".length);
    } else if (isSessionItem(targetElement)) {
      groupId = this.delegate.getGroupIdOfSession(targetElement);
      target = groupId === void 0 ? void 0 : targetElement;
    }
    if (groupId === void 0) {
      return void 0;
    }
    const dragged = this.draggedSessions(data);
    const hasArchived = dragged.some((session) => session.isArchived.get());
    const allInGroup = dragged.every((session) => this.delegate.getGroupIdOfSession(session) === groupId);
    if (dragged.length === 0 || hasArchived || allInGroup) {
      return void 0;
    }
    if (target && dragged.some((session) => session.sessionId === target.sessionId)) {
      return void 0;
    }
    return {
      sessions: dragged,
      groupId,
      header: { kind: "group", id: groupId },
      target,
      position: target ? sectorToPosition(targetSector) : void 0
    };
  }
  /**
   * Resolve the session the drop should be positioned against, or `undefined`
   * if the current drag is not a valid in-list reorder.
   */
  resolveReorderTarget(data, targetElement) {
    if (!targetElement || !isSessionItem(targetElement)) {
      return void 0;
    }
    const target = targetElement;
    if (!this.delegate.isReorderable(target)) {
      return void 0;
    }
    const dragged = this.draggedSessions(data);
    if (dragged.length === 0 || dragged.some((s) => s.sessionId === target.sessionId)) {
      return void 0;
    }
    if (dragged.some((s) => !this.delegate.isReorderable(s))) {
      return void 0;
    }
    if (!this.delegate.canDropOn(dragged, target)) {
      return void 0;
    }
    return target;
  }
  toMembershipDropReaction(target) {
    let position = ListDragOverEffectPosition.Over;
    if (target.position === "after") {
      position = ListDragOverEffectPosition.After;
    } else if (target.position === "before") {
      position = ListDragOverEffectPosition.Before;
    }
    return {
      accept: true,
      effect: {
        type: ListDragOverEffectType.Move,
        position
      }
    };
  }
  draggedHeader(data) {
    if (!(data instanceof ElementsDragAndDropData)) {
      return void 0;
    }
    const elements = data.elements;
    const groupItem = elements.find(isSessionGroupItem);
    if (groupItem) {
      return { id: `group:${groupItem.group.id}`, isWorkspace: false };
    }
    const workspaceSection = elements.find((e) => isSessionSection(e) && e.id.startsWith("workspace:"));
    if (workspaceSection) {
      return { id: workspaceSection.id, isWorkspace: true };
    }
    return void 0;
  }
  /** The reorder identity of a top-level header element, or `undefined` when it is not reorderable. */
  headerRefOf(element) {
    if (isSessionGroupItem(element)) {
      return `group:${element.group.id}`;
    }
    if (isSessionSection(element) && element.id.startsWith("workspace:")) {
      return element.id;
    }
    return void 0;
  }
  draggedSessions(data) {
    return this.toSessions(data instanceof ElementsDragAndDropData ? data.elements : []);
  }
  toSessions(elements) {
    return elements.filter(isSessionItem);
  }
}
function sectorToPosition(sector) {
  return sector !== void 0 && sector >= ListViewTargetSector.CENTER_BOTTOM ? "after" : "before";
}
let SessionsList = class extends Disposable {
  constructor(container, options, _sessionsManagementService, _sessionsService, customViewService, _sessionsListModelService, _sessionGroupsService, _sessionSectionOrderService, _agentHostFilterService, instantiationService, contextKeyService, storageService, contextMenuService, menuService, keybindingService, commandService, automationService, _listVoicePlaybackService, assignmentService, configurationService, uriIdentityService) {
    super();
    this.options = options;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this.customViewService = customViewService;
    this._sessionsListModelService = _sessionsListModelService;
    this._sessionGroupsService = _sessionGroupsService;
    this._sessionSectionOrderService = _sessionSectionOrderService;
    this._agentHostFilterService = _agentHostFilterService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.keybindingService = keybindingService;
    this.commandService = commandService;
    this.automationService = automationService;
    this._listVoicePlaybackService = _listVoicePlaybackService;
    this.assignmentService = assignmentService;
    this.configurationService = configurationService;
    this.uriIdentityService = uriIdentityService;
    this.sessions = [];
    this.automationSessions = observableValue(this, []);
    this.visible = true;
    /**
     * Maximum number of sessions shown per workspace section or user group.
     */
    this.sessionGroupLimit = observableValue(this, SessionsList.DEFAULT_SESSION_GROUP_LIMIT);
    this.expandedSessionGroups = /* @__PURE__ */ new Set();
    this.expandedMoreFolders = false;
    this.hasFindPattern = false;
    this.suspendCollapseStatePersistence = false;
    /**
     * Snapshot of the currently-rendered reorderable top-level headers (groups
     * and, in workspace mode, workspace sections) in display order, by reorder
     * identity. Captured each render and used as the basis for drag-reorder math.
     */
    this._topLevelOrder = [];
    this._onDidUpdate = this._register(new Emitter());
    this.onDidUpdate = this._onDidUpdate.event;
    this._onDidChangeFindOpenState = this._register(new Emitter());
    this.onDidChangeFindOpenState = this._onDidChangeFindOpenState.event;
    this.excludedSessionTypes = this.loadExcludedSessionTypes();
    this.excludedStatuses = this.loadExcludedStatuses();
    this._excludeArchived = this.storageService.getBoolean(SessionsList.EXCLUDE_ARCHIVED_KEY, StorageScope.PROFILE, true);
    this._excludeRead = this.storageService.getBoolean(SessionsList.EXCLUDE_READ_KEY, StorageScope.PROFILE, false);
    this.workspaceGroupCapped = this.storageService.getBoolean(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, StorageScope.PROFILE, true);
    this.listContainer = DOM.append(container, $(".sessions-list-control"));
    this._register(DOM.addDisposableListener(this.listContainer, DOM.EventType.POINTER_DOWN, () => {
      this.listContainer.classList.add(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
    }));
    this._register(DOM.addDisposableListener(this.listContainer.ownerDocument, DOM.EventType.KEY_DOWN, () => {
      this.listContainer.classList.remove(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
    }, true));
    const approvalModel = this._register(instantiationService.createInstance(AgentSessionApprovalModel));
    const markdownRendererService = instantiationService.invokeFunction((accessor) => accessor.get(IMarkdownRendererService));
    const hoverService = instantiationService.invokeFunction((accessor) => accessor.get(IHoverService));
    const sessionsProvidersService = instantiationService.invokeFunction((accessor) => accessor.get(ISessionsProvidersService));
    this._sessionsProvidersService = sessionsProvidersService;
    const providerCapabilityListeners = this._register(new DisposableStore());
    const subscribeProviderCapabilities = () => {
      providerCapabilityListeners.clear();
      for (const provider of sessionsProvidersService.getProviders()) {
        if (provider.onDidChangeCapabilities) {
          providerCapabilityListeners.add(provider.onDidChangeCapabilities(() => this.update()));
        }
      }
    };
    subscribeProviderCapabilities();
    this._register(sessionsProvidersService.onDidChangeProviders(() => {
      subscribeProviderCapabilities();
      this.update();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING) || e.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
        this.update();
      }
    }));
    const agentSessionsService = instantiationService.invokeFunction((accessor) => accessor.get(IAgentSessionsService));
    const voicePlaybackService = instantiationService.invokeFunction((accessor) => accessor.get(IVoicePlaybackService));
    const sessionRenderer = new SessionItemRenderer(
      {
        grouping: this.options.grouping,
        isPinned: (s) => this.isSessionPinned(s),
        isRenderedInCustomGroup: (s) => this.isRenderedInCustomGroup(s),
        visibleSessions: this._sessionsService.visibleSessions,
        getMultiSelectedSessions: (s) => this.getMultiSelectedSessions(s),
        showHover: true,
        approvalRowMaxLines: DEFAULT_APPROVAL_ROW_MAX_LINES,
        toolbarMenuId: SessionItemToolbarMenuId,
        onDidRequestRename: (session) => {
          this.commandService.executeCommand(RENAME_SESSION_COMMAND_ID, session).catch(onUnexpectedError);
        }
      },
      approvalModel,
      void 0,
      instantiationService,
      contextKeyService,
      markdownRendererService,
      hoverService,
      sessionsProvidersService,
      agentSessionsService,
      voicePlaybackService
    );
    const showMoreRenderer = new SessionShowMoreRenderer();
    const placeholderRenderer = new SessionPlaceholderRenderer(hoverService);
    const selectHeader = (element, event) => {
      this.tree.setFocus([element], event);
      this.tree.setSelection([element], event);
    };
    const sectionRenderer = new SessionSectionRenderer(true, selectHeader, instantiationService, contextKeyService, this.automationService, this.automationSessions, this.uriIdentityService, this.customViewService);
    this._sectionRenderer = sectionRenderer;
    const groupRenderer = new SessionGroupRenderer({
      commitEdit: (group, name) => this.commitGroupEdit(group, name),
      cancelEdit: (group) => this.cancelGroupEdit(group),
      select: selectHeader
    }, instantiationService, contextKeyService);
    this._groupRenderer = groupRenderer;
    const delegate = new SessionsTreeDelegate(approvalModel, () => !!IsPhoneLayoutContext.getValue(contextKeyService));
    this.tree = this._register(instantiationService.createInstance(
      WorkbenchObjectTree,
      "SessionsListTree",
      this.listContainer,
      delegate,
      [
        sessionRenderer,
        sectionRenderer,
        groupRenderer,
        showMoreRenderer,
        placeholderRenderer
      ],
      {
        accessibilityProvider: new SessionsAccessibilityProvider(sectionRenderer.automationStatus, {
          grouping: this.options.grouping,
          isPinned: (session) => this.isSessionPinned(session),
          isRenderedInCustomGroup: (session) => this.isRenderedInCustomGroup(session)
        }),
        dnd: this._register(new SessionsListDragAndDrop({
          isReorderable: (session) => this.isReorderable(session),
          isSessionPinned: (session) => this.isSessionPinned(session),
          canDropOn: (dragged, target) => this.canReorderOnto(dragged, target),
          reorder: (dragged, target, position) => this.reorderSessions(dragged, target, position),
          getGroupIdOfSession: (session) => this._sessionGroupsService.getGroupOfSession(session.sessionId),
          addSessionsToGroup: (sessions, groupId, target, position) => this.addSessionsToGroup(sessions, groupId, target, position),
          pinSessions: (sessions, target, position) => this.pinSessions(sessions, target, position),
          setDropTargetHeader: (header) => this.setDropTargetHeader(header),
          reorderSection: (draggedId, targetId, position, isWorkspace) => this.reorderSection(draggedId, targetId, position, isWorkspace)
        })),
        identityProvider: {
          getId: (element) => {
            if (isSessionGroupItem(element)) {
              return `group:${element.group.id}`;
            }
            if (isSessionSection(element)) {
              return `section:${element.id}`;
            }
            if (isSessionShowMore(element)) {
              return `show-more:${element.kind}:${element.mode}:${element.sectionId}`;
            }
            if (isSessionPlaceholder(element)) {
              return `placeholder:${element.sectionId}`;
            }
            return element.resource.toString();
          },
          getGroupId: (element) => {
            if (isSessionGroupItem(element)) {
              return NotSelectableGroupId;
            }
            if (isSessionSection(element)) {
              return NotSelectableGroupId;
            }
            if (isSessionShowMore(element)) {
              return NotSelectableGroupId;
            }
            if (isSessionPlaceholder(element)) {
              return NotSelectableGroupId;
            }
            return element.isArchived.get() ? 2 : 1;
          }
        },
        horizontalScrolling: false,
        multipleSelectionSupport: true,
        indent: 0,
        findWidgetEnabled: true,
        defaultFindMode: TreeFindMode.Filter,
        findWidgetContainer: this.options.findWidgetContainer,
        findWidgetStyles: {
          ...defaultFindWidgetStyles,
          toggleStyles: {
            ...defaultToggleStyles,
            inputActiveOptionBorder: "transparent"
          }
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            if (isSessionGroupItem(element)) {
              return element.group.name;
            }
            if (isSessionSection(element)) {
              return element.label;
            }
            if (isSessionShowMore(element)) {
              return element.sectionLabel;
            }
            if (isSessionPlaceholder(element)) {
              return element.label;
            }
            return element.title.get();
          }
        },
        overrideStyles: this.options.overrideStyles,
        renderIndentGuides: RenderIndentGuides.None,
        twistieAdditionalCssClass: () => "force-no-twistie"
      }
    ));
    this._register(this.tree.onDidOpen((e) => {
      const element = e.element;
      if (!element) {
        return;
      }
      if (isSessionShowMore(element)) {
        if (element.kind === "folders") {
          this.expandedMoreFolders = element.mode === "more";
        } else {
          if (element.mode === "more") {
            this.expandedSessionGroups.add(element.sectionId);
          } else {
            this.expandedSessionGroups.delete(element.sectionId);
          }
        }
        this.update();
        return;
      }
      if (isSessionPlaceholder(element)) {
        return;
      }
      if (isSessionSection(element) && element.id === AUTOMATIONS_SECTION_ID) {
        this.tree.setSelection([]);
        this.commandService.executeCommand("sessionsView.manageAutomations");
        return;
      }
      if (!isSessionSection(element) && !isSessionGroupItem(element)) {
        this.markRead(element);
        const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
        const preserveFocus = isLeftClick ? false : e.editorOptions.preserveFocus ?? false;
        this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
        if (this._listVoicePlaybackService.hasPendingResponse(element.resource)) {
          this.commandService.executeCommand("_chat.voice.activateSession", element.resource.toString());
        }
      }
    }));
    this._register(sessionRenderer.onDidChangeItemHeight((session) => {
      if (this.tree.hasElement(session)) {
        this.tree.updateElementHeight(session, delegate.getHeight(session));
      }
    }));
    const phoneKeys = /* @__PURE__ */ new Set([IsPhoneLayoutContext.key]);
    const automationKeys = /* @__PURE__ */ new Set([ChatAutomationsEnabledContext.key]);
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(automationKeys)) {
        this.update();
      }
      if (!e.affectsSome(phoneKeys)) {
        return;
      }
      for (const session of this.sessions) {
        if (this.tree.hasElement(session)) {
          this.tree.updateElementHeight(session, delegate.getHeight(session));
        }
      }
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const element = e.node.element;
      if (element && isSessionGroupItem(element)) {
        this._groupRenderer.updateCollapseState(element, e.node.collapsed);
        if (!this.suspendCollapseStatePersistence) {
          this.saveSectionCollapseState(`group:${element.group.id}`, e.node.collapsed);
        }
      } else if (element && isSessionSection(element)) {
        sectionRenderer.updateCollapseState(element, e.node.collapsed);
        if (!this.suspendCollapseStatePersistence) {
          this.saveSectionCollapseState(element.id, e.node.collapsed);
        }
      }
    }));
    let isFindOpen = false;
    let findPattern = "";
    const updateFindPatternState = () => {
      const hasFindPattern = isFindOpen && findPattern.length > 0;
      if (hasFindPattern !== this.hasFindPattern) {
        this.hasFindPattern = hasFindPattern;
        this.update();
      }
    };
    this._register(this.tree.onDidChangeFindOpenState((open) => {
      isFindOpen = open;
      this._onDidChangeFindOpenState.fire(open);
      updateFindPatternState();
    }));
    this._register(this.tree.onDidChangeFindPattern((pattern) => {
      findPattern = pattern;
      updateFindPatternState();
    }));
    this._register(this._sessionsManagementService.onDidChangeSessions((e) => {
      if (this.visible) {
        this.refresh();
      }
      if (e.removed.length > 0) {
        this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
      }
    }));
    this._register(this._sessionsListModelService.onDidChange(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this._register(this._sessionGroupsService.onDidChange((e) => {
      if (this.visible) {
        this.update();
      }
      if (e.groupsChanged) {
        this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
      }
    }));
    this._register(this._sessionSectionOrderService.onDidChange(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this._register(this._agentHostFilterService.onDidChange(() => {
      if (this.visible) {
        this.update();
      }
    }));
    this._register(autorun((reader) => {
      this._sessionsService.activeSession.read(reader);
      if (this.visible) {
        this.update();
      }
    }));
    const assignmentRefetchSignal = observableSignalFromEvent(this, this.assignmentService.onDidRefetchAssignments);
    this._register(autorun((reader) => {
      assignmentRefetchSignal.read(reader);
      this.updateSessionGroupLimit();
    }));
    this.refresh();
  }
  get element() {
    return this.listContainer;
  }
  /**
   * Fetches the session group limit treatment and updates the backing
   * observable. Invalid or unset treatments fall back to the default limit.
   */
  updateSessionGroupLimit() {
    this.assignmentService.getTreatment(SessionsList.SESSION_GROUP_LIMIT_TREATMENT).then((value) => {
      const limit = typeof value === "number" && Number.isInteger(value) && value > 0 ? value : SessionsList.DEFAULT_SESSION_GROUP_LIMIT;
      if (this.sessionGroupLimit.get() !== limit) {
        this.sessionGroupLimit.set(limit, void 0);
        if (this.visible) {
          this.update();
        }
      }
    });
  }
  refresh() {
    this.sessions = this._sessionsManagementService.getSessions();
    this.automationSessions.set(this.sessions, void 0);
    for (const session of this.sessions) {
      this._sessionsListModelService.migrateLegacyReadState(session);
    }
    this.update();
  }
  update(expandAll) {
    const activeSession = this._sessionsService.activeSession.get();
    let filtered = this.sessions.filter((session) => !isAutomationSession(session));
    const hostFilter = this._agentHostFilterService.selectedProviderId;
    if (hostFilter !== void 0) {
      filtered = filtered.filter((s) => s.providerId === hostFilter);
    }
    if (this.excludedSessionTypes.size > 0) {
      filtered = filtered.filter((s) => !this.excludedSessionTypes.has(s.sessionType));
    }
    if (this.excludedStatuses.size > 0) {
      filtered = filtered.filter((s) => !this.excludedStatuses.has(s.status.get()));
    }
    if (this._excludeArchived) {
      filtered = filtered.filter((s) => !s.isArchived.get());
    }
    if (this._excludeRead) {
      filtered = filtered.filter((s) => !s.isRead.get());
    }
    if (activeSession && !filtered.some((s) => s.sessionId === activeSession.sessionId)) {
      const match = this.sessions.find((s) => s.sessionId === activeSession.sessionId && !isAutomationSession(s));
      if (match) {
        filtered = [...filtered, match];
      }
    }
    const grouping = this.options.grouping();
    const sorting = this.options.sorting();
    const sortKeyForGrouping = (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt));
    const groupedMembers = /* @__PURE__ */ new Map();
    const groupedRegularIds = /* @__PURE__ */ new Set();
    for (const s of filtered) {
      const group = this.getRenderedSessionGroup(s);
      if (group) {
        let members = groupedMembers.get(group.id);
        if (!members) {
          members = [];
          groupedMembers.set(group.id, members);
        }
        members.push(s);
        groupedRegularIds.add(s.sessionId);
      }
    }
    const forSections = groupedRegularIds.size > 0 ? filtered.filter((s) => !groupedRegularIds.has(s.sessionId)) : filtered;
    const groupItemsById = /* @__PURE__ */ new Map();
    for (const group of this._sessionGroupsService.getGroups()) {
      const members = groupedMembers.get(group.id) ?? [];
      const sortedMembers = sortSessions(members, sorting, sortKeyForGrouping);
      groupItemsById.set(group.id, {
        group,
        sessions: sortedMembers,
        isEmpty: this._sessionGroupsService.getSessionIdsInGroup(group.id).length === 0,
        editing: group.id === this._editingGroupId
      });
    }
    const defaultGroupIds = [...groupItemsById.values()].sort((a, b) => b.group.createdAt - a.group.createdAt).map((item) => `group:${item.group.id}`);
    const sections = groupSessionsForList(forSections, grouping, sorting, (session) => this.isSessionPinned(session), (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt)), getChatSessionArchivedSectionLabel(getChatSessionArchiveActionWording(this.configurationService)));
    const hasRecentSessions = sections.some((s) => s.id === "recent" && s.sessions.length > 0);
    const showEmptyDefaultGroups = this.configurationService.getValue(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING);
    if (showEmptyDefaultGroups && this._someProviderSupportsQuickChats() && !sections.some((s) => s.id === QUICK_CHATS_SECTION_ID)) {
      sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize("chatsSection", "Chats"), sessions: [] });
    }
    const partitionFolders = grouping === "workspace" /* Workspace */ && !this.hasFindPattern && this.workspaceGroupCapped;
    const moreFolderSectionIds = /* @__PURE__ */ new Set();
    if (partitionFolders) {
      const workspaceSections = sections.filter((s) => s.id.startsWith("workspace:"));
      if (workspaceSections.length > 0) {
        const now = Date.now();
        const isRecent = (section) => section.sessions.some((s) => s.updatedAt.get().getTime() >= now - FOUR_DAYS_MS);
        const isOpenWindow = (section) => !!this.openWindowSourceFolder && section.sessions.some((s) => sessionMatchesFolder(s, this.openWindowSourceFolder));
        const meetsCriteria = (section) => isRecent(section) || isOpenWindow(section);
        let anyMeets = false;
        for (const section of workspaceSections) {
          if (meetsCriteria(section)) {
            anyMeets = true;
            break;
          }
        }
        let fallbackId;
        if (!anyMeets) {
          let bestTime = -Infinity;
          for (const section of workspaceSections) {
            for (const s of section.sessions) {
              const t = s.updatedAt.get().getTime();
              if (t > bestTime) {
                bestTime = t;
                fallbackId = section.id;
              }
            }
          }
        }
        for (const section of workspaceSections) {
          if (!meetsCriteria(section) && section.id !== fallbackId && !this._sessionSectionOrderService.isPromoted(section.id)) {
            moreFolderSectionIds.add(section.id);
          }
        }
      }
    }
    const children = [];
    const sessionGroupLimit = this.sessionGroupLimit.get();
    const toSessionChildren = (sessions) => sessions.map((session) => ({ element: session }));
    const renderSessionChildren = (sessions, sectionId, sectionLabel, enabled) => {
      const limited = limitSessionsForList(sessions, sessionGroupLimit, {
        enabled,
        expanded: this.expandedSessionGroups.has(sectionId),
        sectionId,
        sectionLabel
      });
      const children2 = toSessionChildren(limited.sessions);
      if (limited.showMore) {
        children2.push({ element: limited.showMore });
      }
      return children2;
    };
    const renderSection = (section) => {
      if (section.id === AUTOMATIONS_SECTION_ID) {
        return {
          element: section,
          children: [],
          collapsible: false
        };
      }
      const isWorkspaceGroup = grouping === "workspace" /* Workspace */ && section.id.startsWith("workspace:");
      const limitSessions = isWorkspaceGroup && !this.hasFindPattern && this.workspaceGroupCapped;
      let sectionChildren = renderSessionChildren(section.sessions, section.id, section.label, limitSessions);
      if (section.id === QUICK_CHATS_SECTION_ID && section.sessions.length === 0) {
        sectionChildren = [{ element: { placeholder: true, sectionId: section.id, label: localize("noChats", "No chats") } }];
      }
      let defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrExpanded;
      if (grouping === "date" /* Date */ && hasRecentSessions) {
        const olderSections = ["older", "archived"];
        if (olderSections.includes(section.id)) {
          defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
        }
      }
      if (section.id === "archived") {
        defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
      }
      if (section.id === "pinned" || section.id === QUICK_CHATS_SECTION_ID) {
        defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
      }
      return {
        element: section,
        collapsible: true,
        collapsed: this.getSavedCollapseState(section.id) ?? defaultCollapsed,
        children: sectionChildren
      };
    };
    const renderGroup = (groupItem) => {
      const sectionId = `group:${groupItem.group.id}`;
      const groupChildren = groupItem.sessions.length === 0 ? [{
        element: {
          placeholder: true,
          sectionId,
          label: localize("noSessionInGroup", "No session"),
          hover: localize("noSessionInGroupHover", "Use Add to Group from a session's context menu, or drag it into this group.")
        }
      }] : renderSessionChildren(groupItem.sessions, sectionId, groupItem.group.name, !this.hasFindPattern && this.workspaceGroupCapped);
      return {
        element: groupItem,
        collapsible: true,
        collapsed: this.getSavedCollapseState(sectionId) ?? ObjectTreeElementCollapseState.PreserveOrExpanded,
        children: groupChildren
      };
    };
    if (this.contextKeyService.getContextKeyValue(ChatAutomationsEnabledContext.key)) {
      children.push(renderSection({ id: AUTOMATIONS_SECTION_ID, label: localize("automations", "Automations"), sessions: [] }));
    }
    const pinnedSection = sections.find((s) => s.id === "pinned");
    if (pinnedSection) {
      children.push(renderSection(pinnedSection));
    }
    const quickChatsSection = sections.find((s) => s.id === QUICK_CHATS_SECTION_ID);
    if (quickChatsSection) {
      children.push(renderSection(quickChatsSection));
    }
    const renderGroupById = (id) => {
      const groupItem = groupItemsById.get(id.slice("group:".length));
      if (groupItem) {
        children.push(renderGroup(groupItem));
      }
    };
    if (grouping === "date" /* Date */) {
      const resolvedGroupIds = this._sessionSectionOrderService.resolveOrder(defaultGroupIds);
      this._topLevelOrder = resolvedGroupIds;
      for (const id of resolvedGroupIds) {
        renderGroupById(id);
      }
      for (const section of sections) {
        if (section.id === "pinned" || section.id === "archived" || section.id === QUICK_CHATS_SECTION_ID) {
          continue;
        }
        children.push(renderSection(section));
      }
      const archived = sections.find((s) => s.id === "archived");
      if (archived) {
        children.push(renderSection(archived));
      }
    } else {
      const workspaceSections = sections.filter((s) => s.id.startsWith("workspace:"));
      const sectionById = new Map(workspaceSections.map((s) => [s.id, s]));
      const primaryWorkspaceIds = workspaceSections.filter((s) => !moreFolderSectionIds.has(s.id)).map((s) => s.id);
      const defaultOrder = [...defaultGroupIds, ...primaryWorkspaceIds];
      const resolvedIds = this._sessionSectionOrderService.resolveOrder(defaultOrder);
      this._topLevelOrder = resolvedIds;
      for (const id of resolvedIds) {
        if (id.startsWith("group:")) {
          renderGroupById(id);
        } else {
          const section = sectionById.get(id);
          if (section) {
            children.push(renderSection(section));
          }
        }
      }
      const moreFolderSections = workspaceSections.filter((s) => moreFolderSectionIds.has(s.id));
      if (moreFolderSections.length > 0) {
        if (this.expandedMoreFolders) {
          for (const section of moreFolderSections) {
            children.push(renderSection(section));
          }
          children.push({
            element: { showMore: true, kind: "folders", mode: "less", sectionId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: 0 }
          });
        } else {
          children.push({
            element: { showMore: true, kind: "folders", mode: "more", sectionId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: moreFolderSections.length }
          });
        }
      }
      const archivedSection = sections.find((s) => s.id === "archived");
      if (archivedSection) {
        children.push(renderSection(archivedSection));
      }
    }
    this.tree.setChildren(null, children);
    this._onDidUpdate.fire();
  }
  getVisibleSessions() {
    const sessions = new Set(this.sessions);
    const visibleSessions = [];
    const collect = (node) => {
      if (!node.visible) {
        return;
      }
      if (node.element && sessions.has(node.element)) {
        visibleSessions.push(node.element);
      }
      if (node.collapsed) {
        return;
      }
      for (const child of node.children) {
        collect(child);
      }
    };
    const root = this.tree.getNode();
    for (const child of root.children) {
      collect(child);
    }
    return visibleSessions;
  }
  reveal(sessionResource) {
    const resourceStr = sessionResource.toString();
    for (const session of this.sessions) {
      if (session.resource.toString() === resourceStr) {
        if (this.tree.hasElement(session)) {
          if (this.tree.getRelativeTop(session) === null) {
            this.tree.reveal(session, 0.5);
          }
          this.tree.setFocus([session]);
          this.tree.setSelection([session]);
          return true;
        }
      }
    }
    return false;
  }
  clearFocus() {
    this.tree.setFocus([]);
    this.tree.setSelection([]);
  }
  hasFocusOrSelection() {
    return this.tree.getFocus().length > 0 || this.tree.getSelection().length > 0;
  }
  setVisible(visible) {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    if (this.visible) {
      this.refresh();
    }
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  focus() {
    this.tree.domFocus();
    if (this.tree.getFocus().length === 0) {
      this.tree.focusFirst();
    }
  }
  openFind() {
    this.tree.openFind();
  }
  closeFind() {
    this.tree.closeFind();
  }
  // Context menu
  /**
   * Whether a session may participate in manual reordering. Archived (Done)
   * sessions keep their fixed section.
   */
  isReorderable(session) {
    return !session.isArchived.get();
  }
  /**
   * Whether the dragged sessions can be reordered relative to the target.
   * Reordering stays within the same scope: dragged sessions must share the
   * target's group membership, and (when grouping by workspace) its workspace.
   */
  canReorderOnto(dragged, target) {
    const targetPinned = this.isSessionPinned(target);
    if (dragged.some((s) => this.isSessionPinned(s) !== targetPinned)) {
      return false;
    }
    if (targetPinned) {
      return true;
    }
    const targetGroup = this._sessionGroupsService.getGroupOfSession(target.sessionId);
    if (dragged.some((s) => this._sessionGroupsService.getGroupOfSession(s.sessionId) !== targetGroup)) {
      return false;
    }
    if (targetGroup === void 0 && this.options.grouping() === "workspace" /* Workspace */) {
      const targetLabel = sessionWorkspaceLabel(target);
      return dragged.every((s) => sessionWorkspaceLabel(s) === targetLabel);
    }
    return true;
  }
  /**
   * Reorder the dragged sessions so they land as a contiguous block before or
   * after the target session, persisting a synthetic sort key (the midpoint of
   * the surrounding sessions' keys). When the dragged sessions' natural
   * timestamps already sort them into the dropped slot, any stored override is
   * dropped instead so the list falls back to natural ordering.
   */
  reorderSessions(dragged, target, position) {
    const mode = sortingToMode(this.options.sorting());
    const grouping = this.options.grouping();
    const getKey = (s) => this._sessionsListModelService.getSortKey(s, mode);
    const targetPinned = this.isSessionPinned(target);
    let scope = this.getVisibleSessions().filter((s) => this.isReorderable(s));
    scope = scope.filter((s) => this.isSessionPinned(s) === targetPinned);
    if (!targetPinned) {
      const targetGroup = this._sessionGroupsService.getGroupOfSession(target.sessionId);
      scope = scope.filter((s) => this._sessionGroupsService.getGroupOfSession(s.sessionId) === targetGroup);
      if (targetGroup === void 0 && grouping === "workspace" /* Workspace */) {
        const targetLabel = sessionWorkspaceLabel(target);
        scope = scope.filter((s) => sessionWorkspaceLabel(s) === targetLabel);
      }
    }
    const draggedIds = new Set(dragged.map((s) => s.sessionId));
    const draggedOrdered = scope.filter((s) => draggedIds.has(s.sessionId));
    if (draggedOrdered.length === 0) {
      return;
    }
    const remaining = scope.filter((s) => !draggedIds.has(s.sessionId));
    const targetIndex = remaining.findIndex((s) => s.sessionId === target.sessionId);
    if (targetIndex === -1) {
      return;
    }
    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    const above = remaining[insertIndex - 1];
    const below = remaining[insertIndex];
    const { set, clear } = computeReorderSortChanges({
      draggedIds: draggedOrdered.map((s) => s.sessionId),
      naturalKeys: draggedOrdered.map((s) => this._sessionsListModelService.getNaturalSortKey(s, mode)),
      aboveKey: above ? getKey(above) : void 0,
      belowKey: below ? getKey(below) : void 0,
      now: Date.now(),
      fallbackStep: SORT_FALLBACK_STEP_MS
    });
    this._sessionsListModelService.applySortChanges(mode, set, clear);
  }
  // -- Groups --
  /**
   * Create a new group containing the given sessions and start renaming it.
   * Archived (Done) sessions are ignored.
   */
  createGroupFromSessions(sessions) {
    const groupSessions = sessions.filter((session) => !session.isArchived.get());
    if (groupSessions.length === 0) {
      return;
    }
    this.createGroup(groupSessions);
  }
  createGroup(groupSessions) {
    this._sessionsListModelService.unpinSessions(groupSessions);
    const group = this._sessionGroupsService.createGroup(localize("newGroupName", "New Group"), groupSessions.map((s) => s.sessionId));
    this._editingGroupId = group.id;
    this.update();
    this.revealGroup(group.id);
  }
  /** Scroll the group's header into view so its inline name editor is visible. */
  revealGroup(groupId) {
    const root = this.tree.getNode();
    for (const node of root.children) {
      const element = node.element;
      if (element && isSessionGroupItem(element) && element.group.id === groupId) {
        if (this.tree.hasElement(element) && this.tree.getRelativeTop(element) === null) {
          this.tree.reveal(element, 0.5);
        }
        return;
      }
    }
  }
  /** Begin inline renaming of the group's header. */
  beginRenameGroup(groupId) {
    if (!this._sessionGroupsService.getGroup(groupId)) {
      return;
    }
    this._editingGroupId = groupId;
    this.update();
  }
  addSessionsToGroup(sessions, groupId, target, position) {
    const groupSessions = sessions.filter((session) => !session.isArchived.get());
    this._sessionsListModelService.unpinSessions(groupSessions);
    this._sessionGroupsService.addToGroup(groupSessions.map((s) => s.sessionId), groupId);
    if (target && position) {
      this.reorderSessions(groupSessions, target, position);
    }
  }
  commitGroupEdit(group, name) {
    this._editingGroupId = void 0;
    const trimmed = name.trim();
    if (trimmed) {
      this._sessionGroupsService.renameGroup(group.id, trimmed);
    }
    this.update();
  }
  cancelGroupEdit(_group) {
    this._editingGroupId = void 0;
    this.update();
  }
  /**
   * Reorder a top-level header (group or workspace section) so it lands
   * before/after the target header. The new order is persisted to the
   * section-order service. When the dragged header is a workspace it is also
   * promoted so it stays visible (escapes the "+N more workspaces" capping).
   */
  reorderSection(draggedId, targetId, position, isWorkspace) {
    this._sessionSectionOrderService.reorder(this._topLevelOrder, draggedId, targetId, position, isWorkspace ? draggedId : void 0);
  }
  /**
   * Groups in their current top-to-bottom display order. Groups are fully
   * user-managed (see {@link ISessionSectionOrderService}); the order defaults
   * to newest-first and is shared with the list. Used to keep the "Add to
   * Group" / "Move to Group" menu consistent with the rendered order.
   */
  getGroupsInDisplayOrder() {
    const groups = this._sessionGroupsService.getGroups();
    const byId = new Map(groups.map((g) => [`group:${g.id}`, g]));
    const defaultIds = [...groups].sort((a, b) => b.createdAt - a.createdAt).map((g) => `group:${g.id}`);
    return this._sessionSectionOrderService.resolveOrder(defaultIds).map((id) => byId.get(id)).filter((g) => !!g);
  }
  /**
   * The set of top-level reorder identities that currently exist (every group,
   * plus every workspace label present across all sessions, regardless of
   * grouping mode or capping). Used to garbage-collect stale manual order and
   * promotion entries. Reads sessions fresh from the management service so it
   * reflects the latest loaded state even when the list is not visible.
   */
  liveSectionOrderIds() {
    const ids = /* @__PURE__ */ new Set();
    for (const group of this._sessionGroupsService.getGroups()) {
      ids.add(`group:${group.id}`);
    }
    for (const session of this._sessionsManagementService.getSessions()) {
      ids.add(`workspace:${sessionWorkspaceLabel(session)}`);
    }
    return ids;
  }
  setDropTargetHeader(header) {
    const current = this._dropTargetHeader;
    if (current?.kind === header?.kind && current?.id === header?.id) {
      this.toggleDropTargetHeader(header, header !== void 0);
      return;
    }
    this.toggleDropTargetHeader(current, false);
    this._dropTargetHeader = header;
    this.toggleDropTargetHeader(header, true);
  }
  toggleDropTargetHeader(header, active) {
    if (!header) {
      return;
    }
    if (header.kind === "group") {
      this._groupRenderer.setDropTarget(header.id, active);
    } else {
      this._sectionRenderer.setDropTarget(header.id, active);
    }
  }
  getMultiSelectedSessions(session) {
    const selection = this.tree.getSelection().filter((s) => !!s && isSessionItem(s));
    return selection.includes(session) ? [session, ...selection.filter((s) => s !== session)] : [session];
  }
  onContextMenu(e) {
    const element = e.element;
    if (!element || isSessionSection(element) || isSessionShowMore(element) || isSessionPlaceholder(element)) {
      this.showCreateGroupContextMenu(e.anchor);
      return;
    }
    if (isSessionGroupItem(element)) {
      this.showGroupContextMenu(element, e.anchor);
      return;
    }
    const selectedSessions = this.getMultiSelectedSessions(element);
    const inGroup = this._sessionGroupsService.getGroupOfSession(element.sessionId) !== void 0;
    const contextOverlay = [
      [IsSessionPinnedContext.key, this.isSessionPinned(element)],
      [SessionIsArchivedContext.key, element.isArchived.get()],
      [SessionIsReadContext.key, element.isRead.get()],
      [SessionItemHasBranchNameContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim()],
      [SessionItemInGroupContext.key, inGroup],
      [SessionTypeContext.key, element.sessionType],
      [SessionProviderIdContext.key, element.providerId],
      [SessionSupportsRenameContext.key, element.capabilities.get().supportsRename ?? false],
      [SessionSupportsDeleteContext.key, element.capabilities.get().supportsDelete ?? false],
      [SessionHasPullRequestContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest]
    ];
    const disposables = new DisposableStore();
    const menu = disposables.add(this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay)));
    const marshalledArg = {
      $mid: MarshalledId.AgentSessionContext,
      session: { resource: element.resource },
      sessions: selectedSessions.map((s) => ({ resource: s.resource }))
    };
    const wrapForExtensions = (action) => {
      if (!(action instanceof MenuItemAction) || !action.item.source) {
        return action;
      }
      return toAction({
        id: action.id,
        label: action.label,
        class: action.class,
        enabled: action.enabled,
        tooltip: action.tooltip,
        checked: action.checked,
        run: () => this.commandService.executeCommand(action.id, marshalledArg)
      });
    };
    const baseActions = Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions2]) => actions2.map(wrapForExtensions)));
    const groupActions = this.getGroupSessionActions(selectedSessions);
    const actions = groupActions.length > 0 ? [...baseActions, new Separator(), ...groupActions] : baseActions;
    if (actions.length === 0) {
      disposables.dispose();
      return;
    }
    this.contextMenuService.showContextMenu({
      getActions: () => actions,
      getAnchor: () => e.anchor,
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? void 0,
      onHide: () => disposables.dispose()
    });
  }
  /**
   * Build the group-related context menu actions for the given session(s):
   * "Create Group", an "Add to Group"/"Move to Group" submenu listing the
   * groups in display order, and "Remove from Group" when applicable.
   */
  getGroupSessionActions(selected) {
    const actions = [];
    if (selected.some((session) => session.isArchived.get())) {
      return actions;
    }
    actions.push(this.getCreateGroupAction(selected));
    const currentGroupIds = new Set(selected.map((s) => this._sessionGroupsService.getGroupOfSession(s.sessionId)));
    const currentGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : void 0;
    const targetGroups = this.getGroupsInDisplayOrder().filter((g) => g.id !== currentGroupId);
    if (targetGroups.length > 0) {
      const subActions = targetGroups.map((g) => toAction({
        id: `sessions.addToGroup.${g.id}`,
        label: g.name,
        run: () => this.addSessionsToGroup(selected, g.id)
      }));
      const label = currentGroupId !== void 0 ? localize("moveToGroupAction", "Move to Group") : localize("addToGroupAction", "Add to Group");
      actions.push(new SubmenuAction("sessions.addToGroupSubmenu", label, subActions));
    }
    if (currentGroupId !== void 0) {
      actions.push(toAction({
        id: "sessions.removeFromGroup",
        label: localize("removeFromGroupAction", "Remove from Group"),
        run: () => {
          for (const session of selected) {
            this._sessionGroupsService.removeFromGroup(session.sessionId);
          }
        }
      }));
    }
    return actions;
  }
  getCreateGroupAction(sessions) {
    return toAction({
      id: "sessions.createGroup",
      label: localize("createGroupAction", "Create Group"),
      run: () => {
        if (sessions) {
          this.createGroupFromSessions(sessions);
        } else {
          this.createGroup([]);
        }
      }
    });
  }
  showCreateGroupContextMenu(anchor) {
    this.contextMenuService.showContextMenu({
      getActions: () => [this.getCreateGroupAction()],
      getAnchor: () => anchor
    });
  }
  showGroupContextMenu(groupItem, anchor) {
    const actions = [
      this.getCreateGroupAction(),
      new Separator(),
      toAction({
        id: "sessions.renameGroupAction",
        label: localize("renameGroupAction", "Rename..."),
        run: () => this.beginRenameGroup(groupItem.group.id)
      }),
      toAction({
        id: "sessions.deleteGroupAction",
        label: localize("deleteGroupAction", "Delete Group"),
        run: () => this._sessionGroupsService.deleteGroup(groupItem.group.id)
      })
    ];
    this.contextMenuService.showContextMenu({
      getActions: () => actions,
      getAnchor: () => anchor
    });
  }
  resetSectionCollapseState() {
    this.storageService.remove(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
  }
  // -- Pinning --
  pinSession(session) {
    this._sessionsListModelService.pinSession(session);
  }
  pinSessions(sessions, target, position) {
    const pinnable = sessions.filter((session) => !session.isArchived.get());
    for (const session of pinnable) {
      this._sessionsListModelService.pinSession(session);
    }
    if (target && position) {
      this.reorderSessions(pinnable, target, position);
    }
  }
  unpinSession(session) {
    this._sessionsListModelService.unpinSession(session);
  }
  isSessionPinned(session) {
    return this._sessionsListModelService.isSessionPinned(session);
  }
  getRenderedSessionGroup(session) {
    if (session.isArchived.get() || this.isSessionPinned(session)) {
      return void 0;
    }
    const groupId = this._sessionGroupsService.getGroupOfSession(session.sessionId);
    return groupId === void 0 ? void 0 : this._sessionGroupsService.getGroup(groupId);
  }
  isRenderedInCustomGroup(session) {
    return this.getRenderedSessionGroup(session) !== void 0;
  }
  /** Whether any registered provider can create quick chats (gates the always-visible "Chats" section). */
  _someProviderSupportsQuickChats() {
    return this._sessionsProvidersService.getProviders().some((p) => !!p.supportsQuickChats);
  }
  // -- Read/Unread --
  markRead(session) {
    this._sessionsManagementService.markRead(session);
  }
  markUnread(session) {
    this._sessionsManagementService.markUnread(session);
  }
  // -- Session type filtering --
  setSessionTypeExcluded(sessionTypeId, excluded) {
    if (excluded) {
      this.excludedSessionTypes.add(sessionTypeId);
    } else {
      this.excludedSessionTypes.delete(sessionTypeId);
    }
    this.saveExcludedSessionTypes();
    this.update();
  }
  isSessionTypeExcluded(sessionTypeId) {
    return this.excludedSessionTypes.has(sessionTypeId);
  }
  loadExcludedSessionTypes() {
    const raw = this.storageService.get(SessionsList.EXCLUDED_TYPES_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch {
      }
    }
    return /* @__PURE__ */ new Set();
  }
  saveExcludedSessionTypes() {
    if (this.excludedSessionTypes.size === 0) {
      this.storageService.remove(SessionsList.EXCLUDED_TYPES_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(SessionsList.EXCLUDED_TYPES_KEY, JSON.stringify([...this.excludedSessionTypes]), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  // -- Status filtering --
  setStatusExcluded(status, excluded) {
    if (excluded) {
      this.excludedStatuses.add(status);
    } else {
      this.excludedStatuses.delete(status);
    }
    this.saveExcludedStatuses();
    this.update();
  }
  isStatusExcluded(status) {
    return this.excludedStatuses.has(status);
  }
  loadExcludedStatuses() {
    const raw = this.storageService.get(SessionsList.EXCLUDED_STATUSES_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      } catch {
      }
    }
    return /* @__PURE__ */ new Set();
  }
  saveExcludedStatuses() {
    if (this.excludedStatuses.size === 0) {
      this.storageService.remove(SessionsList.EXCLUDED_STATUSES_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(SessionsList.EXCLUDED_STATUSES_KEY, JSON.stringify([...this.excludedStatuses]), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
  // -- Archived / Read filtering --
  setExcludeArchived(exclude) {
    this._excludeArchived = exclude;
    this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
    this.update();
  }
  isExcludeArchived() {
    return this._excludeArchived;
  }
  setExcludeRead(exclude) {
    this._excludeRead = exclude;
    this.storageService.store(SessionsList.EXCLUDE_READ_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
    this.update();
  }
  isExcludeRead() {
    return this._excludeRead;
  }
  resetFilters() {
    this.excludedSessionTypes.clear();
    this.saveExcludedSessionTypes();
    this.excludedStatuses.clear();
    this.saveExcludedStatuses();
    this._excludeArchived = true;
    this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
    this._excludeRead = false;
    this.storageService.store(SessionsList.EXCLUDE_READ_KEY, false, StorageScope.PROFILE, StorageTarget.USER);
    this.workspaceGroupCapped = true;
    this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
    this.expandedSessionGroups.clear();
    this.expandedMoreFolders = false;
    this.update();
  }
  // Session group capping
  setWorkspaceGroupCapped(capped) {
    this.workspaceGroupCapped = capped;
    this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, capped, StorageScope.PROFILE, StorageTarget.USER);
    if (capped) {
      this.expandedSessionGroups.clear();
    }
    this.update();
  }
  isWorkspaceGroupCapped() {
    return this.workspaceGroupCapped;
  }
  setOpenWindowSourceFolder(folder) {
    const before = this.openWindowSourceFolder?.toString();
    const after = folder?.toString();
    if (before === after) {
      return;
    }
    this.openWindowSourceFolder = folder;
    this.update();
  }
  collapseAllSections() {
    this.suspendCollapseStatePersistence = true;
    try {
      this.tree.collapseAll();
    } finally {
      this.suspendCollapseStatePersistence = false;
    }
    this.saveBulkCollapseState(true);
  }
  // -- Section collapse persistence --
  getSavedCollapseState(sectionId) {
    const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const state = JSON.parse(raw);
        if (typeof state[sectionId] === "boolean") {
          return state[sectionId];
        }
      } catch {
      }
    }
    return void 0;
  }
  saveSectionCollapseState(sectionId, collapsed) {
    let state = {};
    const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          state = parsed;
        }
      } catch {
      }
    }
    state[sectionId] = collapsed;
    this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
  }
  saveBulkCollapseState(collapsed) {
    const state = {};
    for (const child of this.tree.getNode(null).children) {
      if (child.element && isSessionSection(child.element)) {
        state[child.element.id] = collapsed;
      }
    }
    this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
  }
};
SessionsList.SECTION_COLLAPSE_STATE_KEY = "sessionsListControl.sectionCollapseState";
SessionsList.EXCLUDED_TYPES_KEY = "sessionsListControl.excludedSessionTypes";
SessionsList.EXCLUDED_STATUSES_KEY = "sessionsListControl.excludedStatuses";
SessionsList.EXCLUDE_ARCHIVED_KEY = "sessionsListControl.excludeArchived";
SessionsList.EXCLUDE_READ_KEY = "sessionsListControl.excludeRead";
SessionsList.WORKSPACE_GROUP_CAPPED_KEY = "sessionsListControl.workspaceGroupCapped";
SessionsList.DEFAULT_SESSION_GROUP_LIMIT = 5;
/**
 * Experiment treatment that overrides how many sessions are shown per group
 * before the "show more" affordance appears.
 */
SessionsList.SESSION_GROUP_LIMIT_TREATMENT = "sessions.workspaceGroupLimit";
SessionsList = __decorateClass([
  __decorateParam(2, ISessionsManagementService),
  __decorateParam(3, ISessionsService),
  __decorateParam(4, ICustomViewService),
  __decorateParam(5, ISessionsListModelService),
  __decorateParam(6, ISessionGroupsService),
  __decorateParam(7, ISessionSectionOrderService),
  __decorateParam(8, IAgentHostFilterService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IContextMenuService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, ICommandService),
  __decorateParam(16, IAutomationService),
  __decorateParam(17, IVoicePlaybackService),
  __decorateParam(18, IWorkbenchAssignmentService),
  __decorateParam(19, IConfigurationService),
  __decorateParam(20, IUriIdentityService)
], SessionsList);
function getFirstApprovalAcrossChats(approvalModel, session, reader) {
  let oldest;
  for (const chat of session.chats.read(reader)) {
    const approval = approvalModel.getApproval(chat.resource).read(reader);
    if (approval && (!oldest || approval.since.getTime() < oldest.since.getTime())) {
      oldest = approval;
    }
  }
  return oldest;
}
function sessionMatchesFolder(session, folder) {
  const workspace = session.workspace.get();
  if (!workspace) {
    return false;
  }
  const folderStr = folder.toString();
  for (const folder2 of workspace.folders) {
    if (folder2.workingDirectory?.toString() === folderStr || folder2.root.toString() === folderStr) {
      return true;
    }
  }
  return false;
}
function sortSessions(sessions, sorting, getSortKey) {
  const key = getSortKey ?? defaultSortKey;
  return [...sessions].sort((a, b) => key(b, sorting) - key(a, sorting));
}
function limitSessionsForList(sessions, limit, options) {
  if (!options.enabled || sessions.length <= limit) {
    return { sessions, showMore: void 0 };
  }
  if (options.expanded) {
    return {
      sessions,
      showMore: {
        showMore: true,
        kind: "sessions",
        mode: "less",
        sectionId: options.sectionId,
        sectionLabel: options.sectionLabel,
        remainingCount: 0
      }
    };
  }
  return {
    sessions: sessions.slice(0, limit),
    showMore: {
      showMore: true,
      kind: "sessions",
      mode: "more",
      sectionId: options.sectionId,
      sectionLabel: options.sectionLabel,
      remainingCount: sessions.length - limit
    }
  };
}
function defaultSortKey(session, sorting) {
  if (sorting === "updated" /* Updated */) {
    return session.updatedAt.get().getTime();
  }
  return session.createdAt.getTime();
}
function computeReorderSortChanges(input) {
  const { draggedIds, naturalKeys, aboveKey, belowKey, now, fallbackStep } = input;
  const count = draggedIds.length;
  const upperFit = aboveKey ?? Number.POSITIVE_INFINITY;
  const lowerFit = belowKey ?? Number.NEGATIVE_INFINITY;
  let naturalFits = true;
  for (let i = 0; i < count; i++) {
    if (!(naturalKeys[i] < upperFit && naturalKeys[i] > lowerFit)) {
      naturalFits = false;
      break;
    }
    if (i > 0 && !(naturalKeys[i] < naturalKeys[i - 1])) {
      naturalFits = false;
      break;
    }
  }
  const set = /* @__PURE__ */ new Map();
  const clear = [];
  if (naturalFits) {
    for (const id of draggedIds) {
      clear.push(id);
    }
  } else {
    const upper = aboveKey ?? now;
    const lower = belowKey ?? upper - (count + 1) * fallbackStep;
    const step = (upper - lower) / (count + 1);
    for (let i = 0; i < count; i++) {
      set.set(draggedIds[i], upper - (i + 1) * step);
    }
  }
  return { set, clear };
}
const QUICK_CHATS_SECTION_ID = "quickchats";
function isQuickChatSession(session) {
  return session.isQuickChat?.get() ?? false;
}
function isAutomationSession(session) {
  return session.isAutomation?.get() ?? false;
}
function groupSessionsForList(sessions, grouping, sorting, isSessionPinned, getSortKey, archivedSectionLabel = getChatSessionArchivedSectionLabel(ChatSessionArchiveActionWording.MarkAsDone)) {
  const sorted = sortSessions(sessions.filter((session) => !isAutomationSession(session)), sorting, getSortKey);
  const pinned = [];
  const archived = [];
  const quickChats = [];
  const regular = [];
  for (const session of sorted) {
    if (session.isArchived.get()) {
      archived.push(session);
    } else if (isSessionPinned(session)) {
      pinned.push(session);
    } else if (isQuickChatSession(session)) {
      quickChats.push(session);
    } else {
      regular.push(session);
    }
  }
  const sections = [];
  if (pinned.length > 0) {
    sections.push({ id: "pinned", label: localize("pinned", "Pinned"), sessions: pinned });
  }
  if (quickChats.length > 0) {
    sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize("chatsSection", "Chats"), sessions: quickChats });
  }
  sections.push(...grouping === "workspace" /* Workspace */ ? groupByWorkspace(regular) : groupByDate(regular, sorting, getSortKey));
  if (archived.length > 0) {
    sections.push({ id: "archived", label: archivedSectionLabel, sessions: archived });
  }
  return sections;
}
function sessionWorkspaceLabel(session) {
  return session.workspace.get()?.label || localize("unknown", "Unknown");
}
function groupByWorkspace(sessions) {
  const groups = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const label = sessionWorkspaceLabel(session);
    let group = groups.get(label);
    if (!group) {
      group = [];
      groups.set(label, group);
    }
    group.push(session);
  }
  const unknownWorkspaceLabel = localize("unknown", "Unknown");
  const order = [...groups.keys()].filter((k) => k !== unknownWorkspaceLabel).sort((a, b) => a.localeCompare(b));
  const result = order.map((label) => ({
    id: `workspace:${label}`,
    label,
    sessions: groups.get(label)
  }));
  const unknownWorkspace = groups.get(unknownWorkspaceLabel);
  if (unknownWorkspace) {
    result.push({ id: `workspace:${unknownWorkspaceLabel}`, label: unknownWorkspaceLabel, sessions: unknownWorkspace });
  }
  return result;
}
const RECENT_SESSIONS_LIMIT = 10;
function groupByDate(sessions, sorting, getSortKey) {
  const key = getSortKey ?? defaultSortKey;
  const now = /* @__PURE__ */ new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 7 * 864e5;
  const recent = [];
  const older = [];
  for (const session of sessions) {
    const time = key(session, sorting);
    if (time >= startOfWeek && recent.length < RECENT_SESSIONS_LIMIT) {
      recent.push(session);
    } else {
      older.push(session);
    }
  }
  const sections = [];
  const addGroup = (id, label, groupSessions) => {
    if (groupSessions.length > 0) {
      sections.push({ id, label, sessions: groupSessions });
    }
  };
  addGroup("recent", localize("recent", "Recent"), recent);
  addGroup("older", localize("older", "Older"), older);
  return sections;
}
let SessionsFlatList = class extends Disposable {
  constructor(container, options, _sessionsService, _sessionsListModelService, _sessionsManagementService, instantiationService, contextKeyService, markdownRendererService, hoverService, sessionsProvidersService, voicePlaybackService) {
    super();
    this.options = options;
    this._sessionsService = _sessionsService;
    this._sessionsListModelService = _sessionsListModelService;
    this._sessionsManagementService = _sessionsManagementService;
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidApproveSession = this._register(new Emitter());
    /** Fires when a session's pending action is approved from its "Allow" button. */
    this.onDidApproveSession = this._onDidApproveSession.event;
    this._sessions = [];
    const listRoot = DOM.append(container, $(".sessions-list-control"));
    const approvalModel = this.options.approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
    const agentSessionsService = instantiationService.invokeFunction((accessor) => accessor.get(IAgentSessionsService));
    const sessionRenderer = new SessionItemRenderer(
      {
        grouping: () => "date" /* Date */,
        isPinned: (s) => this._sessionsListModelService.isSessionPinned(s),
        visibleSessions: this._sessionsService.visibleSessions,
        getMultiSelectedSessions: (s) => [s],
        showHover: this.options.showSessionHover ?? true,
        approvalRowMaxLines: this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES,
        toolbarMenuId: this.options.toolbarMenuId ?? SessionItemToolbarMenuId,
        handleToolbarAction: this.options.onToolbarAction
      },
      approvalModel,
      this.options.ciFixModel,
      instantiationService,
      contextKeyService,
      markdownRendererService,
      hoverService,
      sessionsProvidersService,
      agentSessionsService,
      voicePlaybackService
    );
    this._delegate = new SessionsTreeDelegate(approvalModel, () => false, this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES, this.options.ciFixModel);
    this.tree = this._register(instantiationService.createInstance(
      WorkbenchObjectTree,
      "SessionsFlatList",
      listRoot,
      this._delegate,
      [sessionRenderer],
      {
        accessibilityProvider: new SessionsAccessibilityProvider(void 0, {
          grouping: () => "date" /* Date */,
          isPinned: (session) => this._sessionsListModelService.isSessionPinned(session)
        }),
        identityProvider: {
          getId: (element) => element.resource.toString()
        },
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: this.options.alwaysConsumeMouseWheel ?? true,
        multipleSelectionSupport: false,
        indent: 0,
        overrideStyles: this.options.overrideStyles,
        renderIndentGuides: RenderIndentGuides.None,
        twistieAdditionalCssClass: () => "force-no-twistie"
      }
    ));
    this._register(this.tree.onDidOpen((e) => {
      const element = e.element;
      if (!element || !isSessionItem(element)) {
        return;
      }
      if (this.options.markSessionReadOnOpen !== false) {
        this._sessionsManagementService.markRead(element);
      }
      const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
      const preserveFocus = isLeftClick ? false : e.editorOptions.preserveFocus ?? false;
      this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
    }));
    this._register(sessionRenderer.onDidChangeItemHeight((session) => {
      if (this.tree.hasElement(session)) {
        this.tree.updateElementHeight(session, this._delegate.getHeight(session));
        this._onDidChangeContentHeight.fire();
      }
    }));
    this._register(sessionRenderer.onDidApproveSession((approved) => this._onDidApproveSession.fire(approved)));
  }
  setSessions(sessions) {
    this._sessions = sessions;
    this.tree.setChildren(null, sessions.map((session) => ({ element: session })));
  }
  /** The total pixel height required to render all current rows without scrolling. */
  getContentHeight() {
    return this._sessions.reduce((total, session) => total + this._delegate.getHeight(session), 0);
  }
  getRowHeight() {
    return SessionsFlatList.ROW_HEIGHT;
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  focus() {
    this.tree.domFocus();
  }
  focusSession(session) {
    if (!this.tree.hasElement(session)) {
      return;
    }
    this.tree.setFocus([session]);
    this.tree.domFocus();
  }
};
SessionsFlatList.ROW_HEIGHT = 54;
SessionsFlatList = __decorateClass([
  __decorateParam(2, ISessionsService),
  __decorateParam(3, ISessionsListModelService),
  __decorateParam(4, ISessionsManagementService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IMarkdownRendererService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, ISessionsProvidersService),
  __decorateParam(10, IVoicePlaybackService)
], SessionsFlatList);
export {
  IsSessionPinnedContext,
  QUICK_CHATS_SECTION_ID,
  SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING,
  SessionGroupHasVisibleSessionsContext,
  SessionGroupIsEmptyContext,
  SessionGroupToolbarMenuId,
  SessionItemContextMenuId,
  SessionItemHasBranchNameContext,
  SessionItemInGroupContext,
  SessionItemStatusContext,
  SessionItemToolbarMenuId,
  SessionSectionHasGitHubRepositoryContext,
  SessionSectionHasNonCloudRepositoryContext,
  SessionSectionRenderer,
  SessionSectionToolbarMenuId,
  SessionSectionTypeContext,
  SessionsFlatList,
  SessionsGrouping,
  SessionsList,
  SessionsSorting,
  computeReorderSortChanges,
  getFirstApprovalAcrossChats,
  groupByDate,
  groupByWorkspace,
  groupSessionsForList,
  isAutomationSession,
  isQuickChatSession,
  limitSessionsForList,
  sortSessions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHZpZXdzXFxzZXNzaW9uc0xpc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL21lZGlhL3Nlc3Npb25zTGlzdC5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcGF1c2VDU1NBbmltYXRpb25zV2hlbkhpZGRlbiwgc3luY2hyb25pemVDU1NBbmltYXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2FuaW1hdGlvblN5bmMuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24sIExpc3REcmFnT3ZlckVmZmVjdFR5cGUsIE5vdFNlbGVjdGFibGVHcm91cElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSU9iamVjdFRyZWVFbGVtZW50LCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLCBJVHJlZURyYWdBbmREcm9wLCBJVHJlZURyYWdPdmVyUmVhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFJlbmRlckluZGVudEd1aWRlcywgVHJlZUZpbmRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1hdGNoZXMsIEZ1enp5U2NvcmUsIElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJUmVhZGVyLCBhdXRvcnVuLCBkZXJpdmVkLCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgSU1lbnVTZXJ2aWNlLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblByb3ZpZGVySWRDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNEZWxldGVDb250ZXh0LCBTZXNzaW9uU3VwcG9ydHNSZW5hbWVDb250ZXh0LCBTZXNzaW9uVHlwZUNvbnRleHQsIElzUGhvbmVMYXlvdXRDb250ZXh0LCBTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQsIFNlc3Npb25Jc1JlYWRDb250ZXh0LCBTZXNzaW9uSGFzUHVsbFJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0eWxlT3ZlcnJpZGUsIGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRGaW5kV2lkZ2V0U3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IGNoYXJ0c09yYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvY2hhcnRzQ29sb3JzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZywgQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZ1NldHRpbmdJZCwgZ2V0Q2hhdFNlc3Npb25BcmNoaXZlZFNlY3Rpb25MYWJlbCwgZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL3Nlc3Npb25BcmNoaXZlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRTZXNzaW9uU3RhdHVzTWVzc2FnZSwgZ2V0U2Vzc2lvbldvcmtzcGFjZUtpbmQsIEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvblN0YXR1cywgU2Vzc2lvbldvcmtzcGFjZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBhZ2VudFNlc3Npb25BcHByb3ZhbElkLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVm9pY2VQbGF5YmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi92b2ljZVBsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSwgU2Vzc2lvblNvcnRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Hcm91cCwgSVNlc3Npb25Hcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVEVNUE9SQVJZICh0cmFja2VkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjA0ODApXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gYElBZ2VudFNlc3Npb25zU2VydmljZWAgaXMgYSBDb3BpbG90LXByb3ZpZGVyIGludGVybmFsIGFuZCBtdXN0IG5vcm1hbGx5IG9ubHlcbi8vIGJlIGNvbnN1bWVkIGJ5IHRoZSBDb3BpbG90IGNoYXQgc2Vzc2lvbnMgcHJvdmlkZXIgXHUyMDE0IHRoZSByZXN0IG9mIHRoZSBBZ2VudHNcbi8vIHdpbmRvdyBzdGF5cyBwcm92aWRlci1hZ25vc3RpYyAoc2VlIFNFU1NJT05TLm1kKS4gVGhpcyBzaW5nbGUsIGRlbGliZXJhdGVcbi8vIGV4Y2VwdGlvbiBsZXRzIHRoZSBzZXNzaW9ucyBsaXN0IHRyaWdnZXIgbGF6eSByZXNvbHV0aW9uIG9mIGV4cGVuc2l2ZSBzZXNzaW9uXG4vLyBwcm9wZXJ0aWVzIChlLmcuIGNoYW5nZXMpIGZvciByb3dzIHRoYXQgc2Nyb2xsIGludG8gdmlldywgdW50aWwgRG9uXG4vLyByZS1pbXBsZW1lbnRzIGl0IHRoZSByaWdodCB3YXkgKGRyaXZlbiBmcm9tIGluc2lkZSB0aGUgQ29waWxvdCBwcm92aWRlciwgb3Jcbi8vIHZpYSBhIHByb3ZpZGVyLWFnbm9zdGljIHZpc2liaWxpdHkgc2lnbmFsIG9uIHRoZSBzaGFyZWQgc2VydmljZXMpLlxuLy8gRE8gTk9UIGFkZCBmdXJ0aGVyIHVzYWdlcyBvZiB0aGlzIGltcG9ydCBpbiB0aGUgc2Vzc2lvbnMgd29ya2JlbmNoLCBhbmQgRE8gTk9UXG4vLyBjb3B5IHRoaXMgc3VwcHJlc3Npb24gZWxzZXdoZXJlLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLWltcG9ydHNcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0RmlsdGVyL2NvbW1vbi9hZ2VudEhvc3RGaWx0ZXIuanMnO1xuaW1wb3J0IHsgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIsIFNlc3Npb25zRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25Ib3ZlckNvbnRlbnQgfSBmcm9tICcuLi9zZXNzaW9uSG92ZXJDb250ZW50LmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXNJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXNzaW9uU3RhdHVzSWNvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zRW5hYmxlZC5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jdXN0b21WaWV3L2Jyb3dzZXIvY3VzdG9tVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQgfSBmcm9tICcuLi9hdXRvbWF0aW9uc0NvbnN0YW50cy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgQVVUT01BVElPTlNfU0VDVElPTl9JRCA9ICdhdXRvbWF0aW9ucyc7XG5jb25zdCBTRVNTSU9OX1NFQ1RJT05fRk9DVVNfRlJPTV9QT0lOVEVSX0NMQVNTID0gJ3Nlc3Npb24tc2VjdGlvbi1mb2N1cy1mcm9tLXBvaW50ZXInO1xuY29uc3QgU0VTU0lPTl9IRUFERVJfRFJPUF9UQVJHRVRfQ0xBU1MgPSAnc2Vzc2lvbi1oZWFkZXItZHJvcC10YXJnZXQnO1xuXG5leHBvcnQgY29uc3QgU2Vzc2lvbkl0ZW1Ub29sYmFyTWVudUlkID0gbmV3IE1lbnVJZCgnU2Vzc2lvbkl0ZW1Ub29sYmFyJyk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbkl0ZW1Db250ZXh0TWVudUlkID0gTWVudUlkLlNlc3Npb25JdGVtQ29udGV4dE1lbnU7XG5leHBvcnQgY29uc3QgU2Vzc2lvblNlY3Rpb25Ub29sYmFyTWVudUlkID0gbmV3IE1lbnVJZCgnU2Vzc2lvblNlY3Rpb25Ub29sYmFyJyk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbkdyb3VwVG9vbGJhck1lbnVJZCA9IG5ldyBNZW51SWQoJ1Nlc3Npb25Hcm91cFRvb2xiYXInKTtcblxuLyoqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGVtcHR5IGRlZmF1bHQgQ2hhdHMgZ3JvdXAgaXMgc2hvd24gaW4gdGhlIHNlc3Npb25zIGxpc3QuICovXG5leHBvcnQgY29uc3QgU0VTU0lPTlNfTElTVF9TSE9XX0VNUFRZX0RFRkFVTFRfR1JPVVBTX1NFVFRJTkcgPSAnc2Vzc2lvbnMubGlzdC5zaG93RW1wdHlEZWZhdWx0R3JvdXBzJztcblxuZXhwb3J0IGNvbnN0IElzU2Vzc2lvblBpbm5lZENvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbkl0ZW0uaXNQaW5uZWQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbkl0ZW1IYXNCcmFuY2hOYW1lQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uSXRlbS5oYXNCcmFuY2hOYW1lJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFNlc3Npb25JdGVtU3RhdHVzQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PFNlc3Npb25TdGF0dXM+KCdzZXNzaW9uSXRlbS5zdGF0dXMnLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG4vKiogV2hldGhlciB0aGUgZm9jdXNlZCBzZXNzaW9uIGl0ZW0gY3VycmVudGx5IGJlbG9uZ3MgdG8gYSB1c2VyIGdyb3VwLiAqL1xuZXhwb3J0IGNvbnN0IFNlc3Npb25JdGVtSW5Hcm91cENvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbkl0ZW0uaW5Hcm91cCcsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uU2VjdGlvblR5cGVDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignc2Vzc2lvblNlY3Rpb24udHlwZScsICcnKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uU2VjdGlvbkhhc0dpdEh1YlJlcG9zaXRvcnlDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25TZWN0aW9uLmhhc0dpdEh1YlJlcG9zaXRvcnknLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgU2Vzc2lvblNlY3Rpb25IYXNOb25DbG91ZFJlcG9zaXRvcnlDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25TZWN0aW9uLmhhc05vbkNsb3VkUmVwb3NpdG9yeScsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uR3JvdXBIYXNWaXNpYmxlU2Vzc2lvbnNDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25Hcm91cC5oYXNWaXNpYmxlU2Vzc2lvbnMnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbkdyb3VwSXNFbXB0eUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2Vzc2lvbkdyb3VwLmlzRW1wdHknLCBmYWxzZSk7XG5cbi8vI3JlZ2lvbiBUeXBlc1xuXG5leHBvcnQgZW51bSBTZXNzaW9uc0dyb3VwaW5nIHtcblx0V29ya3NwYWNlID0gJ3dvcmtzcGFjZScsXG5cdERhdGUgPSAnZGF0ZScsXG59XG5cbmV4cG9ydCBlbnVtIFNlc3Npb25zU29ydGluZyB7XG5cdENyZWF0ZWQgPSAnY3JlYXRlZCcsXG5cdFVwZGF0ZWQgPSAndXBkYXRlZCcsXG59XG5cbmZ1bmN0aW9uIHNvcnRpbmdUb01vZGUoc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nKTogU2Vzc2lvblNvcnRNb2RlIHtcblx0cmV0dXJuIHNvcnRpbmcgPT09IFNlc3Npb25zU29ydGluZy5VcGRhdGVkID8gJ3VwZGF0ZWQnIDogJ2NyZWF0ZWQnO1xufVxuXG4vKiogRmFsbGJhY2sgc3BhY2luZyAobXMpIHVzZWQgd2hlbiBhc3NpZ25pbmcgc3ludGhldGljIHNvcnQga2V5cyBwYXN0IGFuIG9wZW4gYm91bmRhcnkuICovXG5jb25zdCBTT1JUX0ZBTExCQUNLX1NURVBfTVMgPSA2MF8wMDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25TZWN0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvbnM6IElTZXNzaW9uW107XG59XG5cbi8qKlxuICogQSB1c2VyLWNyZWF0ZWQgZ3JvdXAgcmVuZGVyZWQgYXMgYSBzZWN0aW9uLWxpa2UgaGVhZGVyLiBDYXJyaWVzIHRoZSBiYWNraW5nXG4gKiB7QGxpbmsgSVNlc3Npb25Hcm91cH0gcGx1cyBpdHMgY3VycmVudGx5LXZpc2libGUgbWVtYmVyIHNlc3Npb25zIGFuZCB3aGV0aGVyXG4gKiB0aGUgaGVhZGVyIHNob3VsZCByZW5kZXIgaXRzIGlubGluZSBuYW1lIGVkaXRvci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkdyb3VwSXRlbSB7XG5cdHJlYWRvbmx5IGdyb3VwOiBJU2Vzc2lvbkdyb3VwO1xuXHRyZWFkb25seSBzZXNzaW9uczogSVNlc3Npb25bXTtcblx0cmVhZG9ubHkgaXNFbXB0eTogYm9vbGVhbjtcblx0cmVhZG9ubHkgZWRpdGluZzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblNob3dNb3JlIHtcblx0cmVhZG9ubHkgc2hvd01vcmU6IHRydWU7XG5cdHJlYWRvbmx5IGtpbmQ6ICdzZXNzaW9ucycgfCAnZm9sZGVycyc7XG5cdHJlYWRvbmx5IG1vZGU6ICdtb3JlJyB8ICdsZXNzJztcblx0cmVhZG9ubHkgc2VjdGlvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlY3Rpb25MYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSByZW1haW5pbmdDb3VudDogbnVtYmVyO1xufVxuXG4vKiogU3ludGhldGljIG11dGVkIHJvdyBzaG93biB3aGVuIGEgc2VjdGlvbiBpcyBlbXB0eS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25QbGFjZWhvbGRlciB7XG5cdHJlYWRvbmx5IHBsYWNlaG9sZGVyOiB0cnVlO1xuXHRyZWFkb25seSBzZWN0aW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaG92ZXI/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFNlc3Npb25MaXN0SXRlbSA9IElTZXNzaW9uIHwgSVNlc3Npb25TZWN0aW9uIHwgSVNlc3Npb25Hcm91cEl0ZW0gfCBJU2Vzc2lvblNob3dNb3JlIHwgSVNlc3Npb25QbGFjZWhvbGRlcjtcblxuZnVuY3Rpb24gaXNTZXNzaW9uR3JvdXBJdGVtKGl0ZW06IFNlc3Npb25MaXN0SXRlbSk6IGl0ZW0gaXMgSVNlc3Npb25Hcm91cEl0ZW0ge1xuXHRyZXR1cm4gJ2dyb3VwJyBpbiBpdGVtO1xufVxuXG5mdW5jdGlvbiBpc1Nlc3Npb25TZWN0aW9uKGl0ZW06IFNlc3Npb25MaXN0SXRlbSk6IGl0ZW0gaXMgSVNlc3Npb25TZWN0aW9uIHtcblx0cmV0dXJuICFpc1Nlc3Npb25Hcm91cEl0ZW0oaXRlbSkgJiYgJ3Nlc3Npb25zJyBpbiBpdGVtICYmIEFycmF5LmlzQXJyYXkoKGl0ZW0gYXMgSVNlc3Npb25TZWN0aW9uKS5zZXNzaW9ucyk7XG59XG5cbmZ1bmN0aW9uIGlzU2Vzc2lvblNob3dNb3JlKGl0ZW06IFNlc3Npb25MaXN0SXRlbSk6IGl0ZW0gaXMgSVNlc3Npb25TaG93TW9yZSB7XG5cdHJldHVybiAnc2hvd01vcmUnIGluIGl0ZW0gJiYgKGl0ZW0gYXMgSVNlc3Npb25TaG93TW9yZSkuc2hvd01vcmUgPT09IHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzU2Vzc2lvblBsYWNlaG9sZGVyKGl0ZW06IFNlc3Npb25MaXN0SXRlbSk6IGl0ZW0gaXMgSVNlc3Npb25QbGFjZWhvbGRlciB7XG5cdHJldHVybiAncGxhY2Vob2xkZXInIGluIGl0ZW0gJiYgKGl0ZW0gYXMgSVNlc3Npb25QbGFjZWhvbGRlcikucGxhY2Vob2xkZXIgPT09IHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzU2Vzc2lvbkl0ZW0oaXRlbTogU2Vzc2lvbkxpc3RJdGVtKTogaXRlbSBpcyBJU2Vzc2lvbiB7XG5cdHJldHVybiAhaXNTZXNzaW9uR3JvdXBJdGVtKGl0ZW0pICYmICFpc1Nlc3Npb25TZWN0aW9uKGl0ZW0pICYmICFpc1Nlc3Npb25TaG93TW9yZShpdGVtKSAmJiAhaXNTZXNzaW9uUGxhY2Vob2xkZXIoaXRlbSk7XG59XG5cbmNvbnN0IFNIT1dfTU9SRV9GT0xERVJTX0xBQkVMID0gJ19fbW9yZV9mb2xkZXJzX18nO1xuY29uc3QgRk9VUl9EQVlTX01TID0gNCAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cbi8qKlxuICogRGVmYXVsdCBudW1iZXIgb2YgdGVybWluYWwtY29tbWFuZCBsaW5lcyBzaG93biBpbiBhIHNlc3Npb24gcm93J3MgYXBwcm92YWxcbiAqIHByb21wdC4gVGhlIGJsb2NrZWQtc2Vzc2lvbnMgZHJvcGRvd24gb3ZlcnJpZGVzIHRoaXMgdG8gc2hvdyBtb3JlIGxpbmVzLlxuICovXG5jb25zdCBERUZBVUxUX0FQUFJPVkFMX1JPV19NQVhfTElORVMgPSAzO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFRyZWUgRGVsZWdhdGVcblxuY2xhc3MgU2Vzc2lvbnNUcmVlRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxTZXNzaW9uTGlzdEl0ZW0+IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSVRFTV9IRUlHSFQgPSA1NDtcblx0LyoqIFF1aWNrLWNoYXQgcm93cyBhcmUgc2luZ2xlLWxpbmUgXHUyMDE0IHNlZSB0aGUgYC5zZXNzaW9uLWl0ZW0ucXVpY2stY2hhdGAgcnVsZXMgaW4gYHNlc3Npb25zTGlzdC5jc3NgLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJVEVNX0hFSUdIVF9RVUlDS19DSEFUID0gMjg7XG5cdC8qKlxuXHQgKiBQaG9uZSBsYXlvdXQgdXNlcyBhIHRhbGxlciByb3cgc28gdGhlIGlubGluZSBhY3Rpb24gdG9vbGJhciBjYW5cblx0ICogbWVldCB0aGUgNDRweCBtaW5pbXVtIHRvdWNoIHRhcmdldCB3aXRob3V0IG92ZXJmbG93aW5nLiBTaXplZCB0b1xuXHQgKiBmaXQgYSA0NHB4IHRvb2xiYXIgY2VudGVyZWQgYmV0d2VlbiB0aGUgdGl0bGUgYW5kIGRldGFpbHMgcm93cy5cblx0ICogS2VlcCBpbiBzeW5jIHdpdGggdGhlIGAucGhvbmUtbGF5b3V0IC5zZXNzaW9uLWl0ZW1gIHJ1bGVzIGluXG5cdCAqIGBzZXNzaW9uc0xpc3QuY3NzYC5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElURU1fSEVJR0hUX1BIT05FID0gNzY7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFQ1RJT05fSEVJR0hUID0gMjY7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNIT1dfTU9SRV9IRUlHSFQgPSAyNjtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUExBQ0VIT0xERVJfSEVJR0hUID0gMjY7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXBwcm92YWxNb2RlbDogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pc1Bob25lOiAoKSA9PiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FwcHJvdmFsUm93TWF4TGluZXM6IG51bWJlciA9IERFRkFVTFRfQVBQUk9WQUxfUk9XX01BWF9MSU5FUyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaUZpeE1vZGVsOiBJU2Vzc2lvbkNJRml4TW9kZWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSk6IG51bWJlciB7XG5cdFx0aWYgKGlzU2Vzc2lvblNlY3Rpb24oZWxlbWVudCkgfHwgaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvbnNUcmVlRGVsZWdhdGUuU0VDVElPTl9IRUlHSFQ7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25zVHJlZURlbGVnYXRlLlNIT1dfTU9SRV9IRUlHSFQ7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25zVHJlZURlbGVnYXRlLlBMQUNFSE9MREVSX0hFSUdIVDtcblx0XHR9XG5cblx0XHRsZXQgaGVpZ2h0OiBudW1iZXI7XG5cdFx0aWYgKHRoaXMuX2lzUGhvbmUoKSkge1xuXHRcdFx0aGVpZ2h0ID0gU2Vzc2lvbnNUcmVlRGVsZWdhdGUuSVRFTV9IRUlHSFRfUEhPTkU7XG5cdFx0fSBlbHNlIGlmIChpc1F1aWNrQ2hhdFNlc3Npb24oZWxlbWVudCBhcyBJU2Vzc2lvbikpIHtcblx0XHRcdGhlaWdodCA9IFNlc3Npb25zVHJlZURlbGVnYXRlLklURU1fSEVJR0hUX1FVSUNLX0NIQVQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhlaWdodCA9IFNlc3Npb25zVHJlZURlbGVnYXRlLklURU1fSEVJR0hUO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYXBwcm92YWxNb2RlbCkge1xuXHRcdFx0Y29uc3QgYXBwcm92YWwgPSBnZXRGaXJzdEFwcHJvdmFsQWNyb3NzQ2hhdHModGhpcy5fYXBwcm92YWxNb2RlbCwgZWxlbWVudCBhcyBJU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChhcHByb3ZhbCkge1xuXHRcdFx0XHRoZWlnaHQgKz0gU2Vzc2lvbkl0ZW1SZW5kZXJlci5nZXRBcHByb3ZhbFJvd0hlaWdodChhcHByb3ZhbC5sYWJlbCwgdGhpcy5fYXBwcm92YWxSb3dNYXhMaW5lcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jaUZpeE1vZGVsICYmIHRoaXMuX2NpRml4TW9kZWwuZ2V0Q0lGaXgoZWxlbWVudCBhcyBJU2Vzc2lvbikuZ2V0KCkpIHtcblx0XHRcdGhlaWdodCArPSBTZXNzaW9uSXRlbVJlbmRlcmVyLkNJX1JPV19IRUlHSFQ7XG5cdFx0fVxuXHRcdHJldHVybiBoZWlnaHQ7XG5cdH1cblxuXHRoYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoISF0aGlzLl9hcHByb3ZhbE1vZGVsIHx8ICEhdGhpcy5fY2lGaXhNb2RlbCkgJiYgaXNTZXNzaW9uSXRlbShlbGVtZW50KTtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvbkdyb3VwUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvblNlY3Rpb25SZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gU2Vzc2lvblNob3dNb3JlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25QbGFjZWhvbGRlclJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH1cblx0XHRyZXR1cm4gU2Vzc2lvbkl0ZW1SZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlc3Npb24gSXRlbSBSZW5kZXJlclxuXG4vKipcbiAqIFJlc29sdmVzIGlubGluZSB0b29sYmFyIGFjdGlvbnMgYWdhaW5zdCBlaXRoZXIgYSBmb2N1c2VkLWxpc3QgaGFuZGxlciBvciB0aGVcbiAqIGN1cnJlbnQgbXVsdGktc2VsZWN0aW9uLlxuICovXG5jbGFzcyBTZXNzaW9uSXRlbUFjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnZXRNdWx0aVNlbGVjdGVkU2Vzc2lvbnM6IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gSVNlc3Npb25bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhhbmRsZUFjdGlvbj86IChhY3Rpb246IElBY3Rpb24sIHNlc3Npb246IElTZXNzaW9uKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0ICYmICFBcnJheS5pc0FycmF5KGNvbnRleHQpKSB7XG5cdFx0XHRpZiAodGhpcy5oYW5kbGVBY3Rpb24gJiYgYXdhaXQgdGhpcy5oYW5kbGVBY3Rpb24oYWN0aW9uLCBjb250ZXh0IGFzIElTZXNzaW9uKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCB0aGlzLmdldE11bHRpU2VsZWN0ZWRTZXNzaW9ucyhjb250ZXh0IGFzIElTZXNzaW9uKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHN1cGVyLnJ1bkFjdGlvbihhY3Rpb24sIGNvbnRleHQpO1xuXHR9XG59XG5cbi8vIEtleWZyYW1lcyBuYW1lIG9mIHRoZSBpbi1wcm9ncmVzcyB0aXRsZSBzaGltbWVyIChzZWUgYHNlc3Npb24tdGl0bGUtc2hpbW1lcmBcbi8vIGluIHNlc3Npb25zTGlzdC5jc3MpLiBVc2VkIHRvIHBoYXNlLWFsaWduIHRoZSBzaGltbWVyIGFjcm9zcyByb3dzLlxuY29uc3QgU0VTU0lPTl9USVRMRV9TSElNTUVSX0FOSU1BVElPTl9OQU1FID0gJ3Nlc3Npb24tdGl0bGUtc2hpbW1lcic7XG5jb25zdCBTRVNTSU9OX1RJVExFX1NISU1NRVJfQU5JTUFUSU9OX05BTUVTID0gbmV3IFNldChbU0VTU0lPTl9USVRMRV9TSElNTUVSX0FOSU1BVElPTl9OQU1FXSk7XG5jb25zdCBTRVNTSU9OX1RJVExFX1NISU1NRVJfUEFVU0VEX0NMQVNTID0gJ3Nlc3Npb24tdGl0bGUtc2hpbW1lci1wYXVzZWQnO1xuXG5pbnRlcmZhY2UgSVNlc3Npb25JdGVtVGVtcGxhdGUge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzdGF0dXNJY29uOiBTZXNzaW9uU3RhdHVzSWNvbjtcblx0cmVhZG9ubHkgdGl0bGU6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdHJlYWRvbmx5IHRpdGxlQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGl0bGVUb29sYmFyOiBNZW51V29ya2JlbmNoVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGVuZGluZ1ZvaWNlSW5kaWNhdG9yOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGV0YWlsc1JvdzogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFwcHJvdmFsUm93OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYXBwcm92YWxMYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFwcHJvdmFsQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2lSb3c6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjaUxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2lCdXR0b25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRyZWFkb25seSBzdGF0dXNDb250ZXh0OiBJQ29udGV4dEtleTxTZXNzaW9uU3RhdHVzPjtcblx0cmVhZG9ubHkgaXNSZWFkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHN1cHBvcnRzRGVsZXRlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG4vKiogUGF5bG9hZCBlbWl0dGVkIHdoZW4gdGhlIHVzZXIgYXBwcm92ZXMgYSBzZXNzaW9uJ3MgcGVuZGluZyBhY3Rpb24uICovXG5leHBvcnQgaW50ZXJmYWNlIElBcHByb3ZlZFNlc3Npb24ge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJU2Vzc2lvbjtcblx0LyoqXG5cdCAqIElkZW50aXR5IG9mIHRoZSBhcHByb3ZhbCB0aGF0IHdhcyBhbGxvd2VkLCBzbyBjb25zdW1lcnMgY2FuIHRlbGwgdGhpcyBleGFjdFxuXHQgKiBhcHByb3ZhbCBhcGFydCBmcm9tIGEgbGF0ZXIsIGRpc3RpbmN0IG9uZSBvbiB0aGUgc2FtZSBzZXNzaW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgYXBwcm92YWxJZDogc3RyaW5nO1xufVxuXG4vKiogU3VtbWFyeSBvZiBhIHNlc3Npb24ncyBmYWlsaW5nIENJIGNoZWNrcywgYmFja2luZyBpdHMgXCJGaXggQ0lcIiByb3cuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uQ0lGaXhTdGF0ZSB7XG5cdC8qKiBOdW1iZXIgb2YgY2hlY2tzIHRoYXQgaGF2ZSBjb21wbGV0ZWQgd2l0aCBhIGZhaWxpbmcgY29uY2x1c2lvbi4gKi9cblx0cmVhZG9ubHkgZmFpbGVkOiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgY2hlY2tzIHN0aWxsIHJ1bm5pbmcgb3IgcXVldWVkLiAqL1xuXHRyZWFkb25seSBwZW5kaW5nOiBudW1iZXI7XG59XG5cbi8qKlxuICogU3VwcGxpZXMgdGhlIHBlci1zZXNzaW9uIFwiRml4IENJXCIgcm93IHNob3duIGZvciBibG9ja2VkIHNlc3Npb25zIHdob3NlIHB1bGxcbiAqIHJlcXVlc3QgaGFzIGZhaWxpbmcgQ0kgY2hlY2tzLiBPbmx5IHRoZSBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIHByb3ZpZGVzIG9uZVxuICogKHZpYSB7QGxpbmsgSVNlc3Npb25zRmxhdExpc3RPcHRpb25zLmNpRml4TW9kZWx9KSwgc28gdGhlIHJvdyBuZXZlciBhcHBlYXJzIGluXG4gKiBhbnkgb3RoZXIgc2Vzc2lvbiBsaXN0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uQ0lGaXhNb2RlbCB7XG5cdC8qKlxuXHQgKiBPYnNlcnZhYmxlIENJLWZhaWx1cmUgc3VtbWFyeSBmb3IgYSBzZXNzaW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIGl0IGhhcyBub1xuXHQgKiBmYWlsaW5nIGNoZWNrcyAob3IgdGhlIHVzZXIgYWxyZWFkeSByZXF1ZXN0ZWQgYSBmaXggZm9yIHRoZSBjdXJyZW50IGNvbW1pdCkuXG5cdCAqL1xuXHRnZXRDSUZpeChzZXNzaW9uOiBJU2Vzc2lvbik6IElPYnNlcnZhYmxlPElTZXNzaW9uQ0lGaXhTdGF0ZSB8IHVuZGVmaW5lZD47XG5cdC8qKiBLaWNrIG9mZiB0aGUgZml4LUNJIGZsb3cgZm9yIHRoZSBzZXNzaW9uIGluIHRoZSBiYWNrZ3JvdW5kIChubyBzZXNzaW9uIGlzIG9wZW5lZCkuICovXG5cdGZpeENJKHNlc3Npb246IElTZXNzaW9uKTogdm9pZDtcbn1cblxuY2xhc3MgU2Vzc2lvbkl0ZW1SZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlLCBJU2Vzc2lvbkl0ZW1UZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc2Vzc2lvbi1pdGVtJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25JdGVtUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdHJlYWRvbmx5IHJvd0NsYXNzTmFtZSA9ICdzZXNzaW9uLWxpc3QtaW5zZXQtcm93JztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfQVBQUk9WQUxfUk9XX0xJTkVfSEVJR0hUID0gMTg7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9BUFBST1ZBTF9ST1dfT1ZFUkhFQUQgPSAxNDtcblxuXHQvKiogSGVpZ2h0IG9mIHRoZSBzaW5nbGUtbGluZSBcIkZpeCBDSVwiIHJvdyAobGFiZWwgKyBvcmFuZ2UgYnV0dG9uKSwgaW5jbHVkaW5nIGl0cyB0b3AgbWFyZ2luLiAqL1xuXHRzdGF0aWMgcmVhZG9ubHkgQ0lfUk9XX0hFSUdIVCA9IDMyO1xuXG5cdHN0YXRpYyBnZXRBcHByb3ZhbFJvd0hlaWdodChsYWJlbDogc3RyaW5nLCBtYXhMaW5lczogbnVtYmVyID0gREVGQVVMVF9BUFBST1ZBTF9ST1dfTUFYX0xJTkVTKTogbnVtYmVyIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBNYXRoLm1pbihsYWJlbC5zcGxpdCgvXFxyP1xcbi8pLmxlbmd0aCwgbWF4TGluZXMpO1xuXHRcdHJldHVybiBsaW5lQ291bnQgKiBTZXNzaW9uSXRlbVJlbmRlcmVyLl9BUFBST1ZBTF9ST1dfTElORV9IRUlHSFQgKyBTZXNzaW9uSXRlbVJlbmRlcmVyLl9BUFBST1ZBTF9ST1dfT1ZFUkhFQUQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUl0ZW1IZWlnaHQgPSBuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtSGVpZ2h0OiBFdmVudDxJU2Vzc2lvbj4gPSB0aGlzLl9vbkRpZENoYW5nZUl0ZW1IZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBcHByb3ZlU2Vzc2lvbiA9IG5ldyBFbWl0dGVyPElBcHByb3ZlZFNlc3Npb24+KCk7XG5cdC8qKiBGaXJlcyB3aGVuIHRoZSB1c2VyIGFwcHJvdmVzIGEgc2Vzc2lvbidzIHBlbmRpbmcgYWN0aW9uIHZpYSBpdHMgXCJBbGxvd1wiIGJ1dHRvbi4gKi9cblx0cmVhZG9ubHkgb25EaWRBcHByb3ZlU2Vzc2lvbjogRXZlbnQ8SUFwcHJvdmVkU2Vzc2lvbj4gPSB0aGlzLl9vbkRpZEFwcHJvdmVTZXNzaW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogeyBncm91cGluZzogKCkgPT4gU2Vzc2lvbnNHcm91cGluZzsgaXNQaW5uZWQ6IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gYm9vbGVhbjsgaXNSZW5kZXJlZEluQ3VzdG9tR3JvdXA/OiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW47IHZpc2libGVTZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPjsgZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IElTZXNzaW9uW107IHNob3dIb3ZlcjogYm9vbGVhbjsgYXBwcm92YWxSb3dNYXhMaW5lczogbnVtYmVyOyB0b29sYmFyTWVudUlkOiBNZW51SWQgfCB1bmRlZmluZWQ7IGhhbmRsZVRvb2xiYXJBY3Rpb24/OiAoYWN0aW9uOiBJQWN0aW9uLCBzZXNzaW9uOiBJU2Vzc2lvbikgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj47IG9uRGlkUmVxdWVzdFJlbmFtZT86IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gdm9pZCB9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYXBwcm92YWxNb2RlbDogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNpRml4TW9kZWw6IElTZXNzaW9uQ0lGaXhNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHQvLyBURU1QT1JBUlkgXHUyMDE0IHNlZSB0aGUgbm90ZSBvbiB0aGUgYElBZ2VudFNlc3Npb25zU2VydmljZWAgaW1wb3J0IGFib3ZlICgjMzIwNDgwKS5cblx0XHRwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdm9pY2VQbGF5YmFja1NlcnZpY2U6IElWb2ljZVBsYXliYWNrU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNlc3Npb25JdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb24taXRlbScpO1xuXG5cdFx0Y29uc3QgaWNvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbi1pY29uJykpO1xuXHRcdGNvbnN0IHN0YXR1c0ljb24gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uU3RhdHVzSWNvbiwgaWNvbkNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IG1haW5Db2wgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tbWFpbicpKTtcblx0XHRjb25zdCB0aXRsZVJvdyA9IERPTS5hcHBlbmQobWFpbkNvbCwgJCgnLnNlc3Npb24tdGl0bGUtcm93JykpO1xuXHRcdGNvbnN0IHRpdGxlQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aXRsZVJvdywgJCgnLnNlc3Npb24tdGl0bGUnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwodGl0bGVDb250YWluZXIpKTtcblx0XHQvLyBUaGUgc2hpbW1lcidzIENTUyBhbmltYXRpb24gcmVzdGFydHMgZnJvbSB6ZXJvIHdoZW5ldmVyIGl0IChyZSlzdGFydHMgXHUyMDE0XG5cdFx0Ly8gZS5nLiBzZWxlY3RpbmcgdGhlbiBkZXNlbGVjdGluZyBhbiBpbi1wcm9ncmVzcyByb3cgcmUtYWRkcyB0aGUgYW5pbWF0aW9uXG5cdFx0Ly8gdmlhIHRoZSBgOm5vdCguc2VsZWN0ZWQpYCBzZWxlY3RvciwgYW5kIHJvd3MgYWxyZWFkeSBzaGltbWVyaW5nIGF0IGZpcnN0XG5cdFx0Ly8gcmVuZGVyIGVhY2ggc3RhcnRlZCBvbiB0aGVpciBvd24gY2xvY2suIEFuY2hvciBldmVyeSAocmUpc3RhcnQgdG8gdGhlXG5cdFx0Ly8gc2hhcmVkIGRvY3VtZW50IHRpbWVsaW5lIHNvIGFsbCByb3dzIHN0YXkgcGVyZmVjdGx5IGluIHBoYXNlLiBUaGlzIGZpcmVzXG5cdFx0Ly8gb25jZSBwZXIgc3RhcnQgKG5vdCBwZXIgZnJhbWUpLCBzbyBpdCBpcyBlZmZlY3RpdmVseSBmcmVlLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlQ29udGFpbmVyLCBET00uRXZlbnRUeXBlLkFOSU1BVElPTl9TVEFSVCwgKGU6IEFuaW1hdGlvbkV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IHRpdGxlQ29udGFpbmVyICYmIGUuYW5pbWF0aW9uTmFtZSA9PT0gU0VTU0lPTl9USVRMRV9TSElNTUVSX0FOSU1BVElPTl9OQU1FKSB7XG5cdFx0XHRcdHN5bmNocm9uaXplQ1NTQW5pbWF0aW9ucyh0aXRsZUNvbnRhaW5lciwgeyBhbmltYXRpb25OYW1lczogU0VTU0lPTl9USVRMRV9TSElNTUVSX0FOSU1BVElPTl9OQU1FUyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhdXNlQ1NTQW5pbWF0aW9uc1doZW5IaWRkZW4odGl0bGVDb250YWluZXIsIHtcblx0XHRcdHBhdXNlZENsYXNzOiBTRVNTSU9OX1RJVExFX1NISU1NRVJfUEFVU0VEX0NMQVNTLFxuXHRcdFx0YW5pbWF0aW9uTmFtZXM6IFNFU1NJT05fVElUTEVfU0hJTU1FUl9BTklNQVRJT05fTkFNRVMsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHRpdGxlVG9vbGJhckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJy5zZXNzaW9uLXRpdGxlLXRvb2xiYXInKSk7XG5cdFx0Ly8gU2hvd24gd2hlbiBhIHZvaWNlIHJlc3BvbnNlIGFycml2ZWQgd2hpbGUgdGhpcyBzZXNzaW9uIHdhcyB1bmZvY3VzZWQgYW5kXG5cdFx0Ly8gaXMgaGVsZCB1bnRpbCBpdCBpcyAobWlycm9ycyB0aGUgbWFpbiB3aW5kb3cncyBzZXNzaW9ucyB2aWV3ZXIpLlxuXHRcdGNvbnN0IHBlbmRpbmdWb2ljZUluZGljYXRvciA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJy5zZXNzaW9uLXBlbmRpbmctdm9pY2UtaW5kaWNhdG9yJykpO1xuXHRcdC8vIFRoZSBsaXN0IG9wZW5zIGEgc2Vzc2lvbiBvbiBjbGljayBhbmQgb24gR2VzdHVyZSBgdGFwYCAodG91Y2gpLlxuXHRcdC8vIERPTSBldmVudCBwcm9wYWdhdGlvbiBzdG9wcyBvbmx5IGNvdmVyIG1vdXNlL3BvaW50ZXIgZXZlbnRzOyB0aGVcblx0XHQvLyBsaXN0J3MgdGFwIGhhbmRsZXIgcmVhZHMgZnJvbSBgR2VzdHVyZWAgZGlyZWN0bHksIGJ5cGFzc2luZ1xuXHRcdC8vIGJ1YmJsaW5nLiBDb21iaW5lIGJvdGg6IHN0b3AgcG9pbnRlci9jbGljayBmb3IgbW91c2UsIGFuZFxuXHRcdC8vIHJlZ2lzdGVyIHRoZSB0b29sYmFyIHdpdGggYEdlc3R1cmUuaWdub3JlVGFyZ2V0YCBzbyBzeW50aGVzaXplZFxuXHRcdC8vIHRhcCBldmVudHMgb24gdG91Y2ggbmV2ZXIgcmVhY2ggdGhlIGxpc3QgZWl0aGVyLlxuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFsncG9pbnRlcmRvd24nLCAncG9pbnRlcnVwJywgJ2NsaWNrJywgJ2RibGNsaWNrJ10gYXMgY29uc3QpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRpdGxlVG9vbGJhckNvbnRhaW5lciwgZXZlbnRUeXBlLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblx0XHR9XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuaWdub3JlVGFyZ2V0KHRpdGxlVG9vbGJhckNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IGRldGFpbHNSb3cgPSBET00uYXBwZW5kKG1haW5Db2wsICQoJy5zZXNzaW9uLWRldGFpbHMtcm93JykpO1xuXG5cdFx0Ly8gQXBwcm92YWwgcm93XG5cdFx0Y29uc3QgYXBwcm92YWxSb3cgPSBET00uYXBwZW5kKG1haW5Db2wsICQoJy5zZXNzaW9uLWFwcHJvdmFsLXJvdycpKTtcblx0XHRjb25zdCBhcHByb3ZhbExhYmVsID0gRE9NLmFwcGVuZChhcHByb3ZhbFJvdywgJCgnc3Bhbi5zZXNzaW9uLWFwcHJvdmFsLWxhYmVsJykpO1xuXHRcdGNvbnN0IGFwcHJvdmFsQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChhcHByb3ZhbFJvdywgJCgnLnNlc3Npb24tYXBwcm92YWwtYnV0dG9uJykpO1xuXG5cdFx0Ly8gRml4LUNJIHJvdyBcdTIwMTQgc2hvd24gb25seSBpbiB0aGUgYmxvY2tlZC1zZXNzaW9ucyBsaXN0IGZvciBzZXNzaW9ucyB3aG9zZVxuXHRcdC8vIHB1bGwgcmVxdWVzdCBoYXMgZmFpbGluZyBDSSBjaGVja3MuIFN0eWxlZCBsaWtlIHRoZSBjaGF0IGlucHV0J3MgQ0kgYmFubmVyLlxuXHRcdGNvbnN0IGNpUm93ID0gRE9NLmFwcGVuZChtYWluQ29sLCAkKCcuc2Vzc2lvbi1jaS1yb3cnKSk7XG5cdFx0Y29uc3QgY2lMYWJlbCA9IERPTS5hcHBlbmQoY2lSb3csICQoJ3NwYW4uc2Vzc2lvbi1jaS1sYWJlbCcpKTtcblx0XHRjb25zdCBjaUJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoY2lSb3csICQoJy5zZXNzaW9uLWNpLWJ1dHRvbicpKTtcblx0XHQvLyBUaGUgbGlzdCBvcGVucyBhIHNlc3Npb24gb24gY2xpY2svdGFwLiBUaGUgXCJGaXggQ0lcIiBidXR0b24gb3BlbnMgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBpdHNlbGYgYXMgcGFydCBvZiBpdHMgZmxvdywgc28gc3dhbGxvdyByb3cgY2xpY2tzIGhlcmUgdG8gc3RvcFxuXHRcdC8vIHRoZW0gYnViYmxpbmcgdG8gdGhlIHRyZWUgYW5kIHRyaWdnZXJpbmcgYSBzZWNvbmQsIHJhY2luZyBvcGVuLlxuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFsncG9pbnRlcmRvd24nLCAncG9pbnRlcnVwJywgJ2NsaWNrJywgJ2RibGNsaWNrJ10gYXMgY29uc3QpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNpUm93LCBldmVudFR5cGUsIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHRcdH1cblx0XHRkaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5pZ25vcmVUYXJnZXQoY2lSb3cpKTtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRhaW5lcikpO1xuXHRcdGNvbnN0IHN0YXR1c0NvbnRleHQgPSBTZXNzaW9uSXRlbVN0YXR1c0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBpc1JlYWRDb250ZXh0ID0gU2Vzc2lvbklzUmVhZENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzdXBwb3J0c0RlbGV0ZUNvbnRleHQgPSBTZXNzaW9uU3VwcG9ydHNEZWxldGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGxldCB0aXRsZVRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMudG9vbGJhck1lbnVJZCkge1xuXHRcdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uSXRlbUFjdGlvblJ1bm5lcih0aGlzLm9wdGlvbnMuZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zLCB0aGlzLm9wdGlvbnMuaGFuZGxlVG9vbGJhckFjdGlvbikpO1xuXHRcdFx0dGl0bGVUb29sYmFyID0gZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aXRsZVRvb2xiYXJDb250YWluZXIsIHRoaXMub3B0aW9ucy50b29sYmFyTWVudUlkLCB7XG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIHN0YXR1c0ljb24sIHRpdGxlLCB0aXRsZUNvbnRhaW5lciwgdGl0bGVUb29sYmFyLCBwZW5kaW5nVm9pY2VJbmRpY2F0b3IsIGRldGFpbHNSb3csIGFwcHJvdmFsUm93LCBhcHByb3ZhbExhYmVsLCBhcHByb3ZhbEJ1dHRvbkNvbnRhaW5lciwgY2lSb3csIGNpTGFiZWwsIGNpQnV0dG9uQ29udGFpbmVyLCBjb250ZXh0S2V5U2VydmljZSwgc3RhdHVzQ29udGV4dCwgaXNSZWFkQ29udGV4dCwgc3VwcG9ydHNEZWxldGVDb250ZXh0LCBkaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblx0XHRpZiAoIWlzU2Vzc2lvbkl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJTZXNzaW9uKGVsZW1lbnQsIHRlbXBsYXRlLCBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXNzaW9uKGVsZW1lbnQ6IElTZXNzaW9uLCB0ZW1wbGF0ZTogSVNlc3Npb25JdGVtVGVtcGxhdGUsIG1hdGNoZXM/OiBJTWF0Y2hbXSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5vbkRpZFJlcXVlc3RSZW5hbWUpIHtcblx0XHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZS50aXRsZS5lbGVtZW50LCBET00uRXZlbnRUeXBlLkRCTENMSUNLLCAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGV2ZW50LmJ1dHRvbiAhPT0gMCB8fFxuXHRcdFx0XHRcdGV2ZW50LmFsdEtleSB8fFxuXHRcdFx0XHRcdGV2ZW50LmN0cmxLZXkgfHxcblx0XHRcdFx0XHRldmVudC5tZXRhS2V5IHx8XG5cdFx0XHRcdFx0ZXZlbnQuc2hpZnRLZXkgfHxcblx0XHRcdFx0XHQhZWxlbWVudC5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNSZW5hbWVcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5vbkRpZFJlcXVlc3RSZW5hbWU/LihlbGVtZW50KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBURU1QT1JBUlkgKCMzMjA0ODApOiB0cmlnZ2VyIGxhenkgcmVzb2x2ZSBvZiBleHBlbnNpdmUgc2Vzc2lvblxuXHRcdC8vIHByb3BlcnRpZXMgKGUuZy4gY2hhbmdlcykgZm9yIHJvd3MgdGhhdCBzY3JvbGwgaW50byB2aWV3LCBzbyBwcm92aWRlcnNcblx0XHQvLyB0aGF0IHBvcHVsYXRlIHRoZW0gb24gZGVtYW5kIGRlbGl2ZXIgZnJlc2ggZGF0YSBieSB0aGUgdGltZSB0aGUgcm93XG5cdFx0Ly8gcmVuZGVycy4gVGhpcyByZWFjaGVzIGludG8gYSBDb3BpbG90LXByb3ZpZGVyIGludGVybmFsIGFuZCBtdXN0IGJlXG5cdFx0Ly8gbW92ZWQgaW50byB0aGUgcHJvdmlkZXIgXHUyMDE0IHNlZSB0aGUgbm90ZSBvbiB0aGUgaW1wb3J0IGFib3ZlLlxuXHRcdHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub2JzZXJ2ZVNlc3Npb24oZWxlbWVudC5yZXNvdXJjZSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dIb3Zlcikge1xuXHRcdFx0Ly8gUmljaCBob3ZlciBvbiB0aGUgcm93IHNob3dpbmcgZm9sZGVyLCBicmFuY2gsIGRpZmYgc3RhdHMgYW5kIHByb3ZpZGVyLlxuXHRcdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZS5jb250YWluZXIsICgpID0+ICh7XG5cdFx0XHRcdGNvbnRlbnQ6IGJ1aWxkU2Vzc2lvbkhvdmVyQ29udGVudChlbGVtZW50LCB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZSksXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUgfSxcblx0XHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVCwgZm9yY2VQb3NpdGlvbjogdHJ1ZSB9LFxuXHRcdFx0XHRwZXJzaXN0ZW5jZTogeyBoaWRlT25Ib3ZlcjogZmFsc2UgfSxcblx0XHRcdH0pLCB7IGdyb3VwSWQ6ICdzZXNzaW9ucy1saXN0JyB9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gUGVuZGluZyB2b2ljZSByZXNwb25zZSBpbmRpY2F0b3I6IGEgcmVzcG9uc2UgYXJyaXZlZCB3aGlsZSB0aGlzIHNlc3Npb25cblx0XHQvLyB3YXMgdW5mb2N1c2VkIGFuZCBpcyBoZWxkIHVudGlsIGl0IGlzLlxuXHRcdGNvbnN0IHBlbmRpbmdWb2ljZVJlc291cmNlID0gZWxlbWVudC5yZXNvdXJjZTtcblx0XHR0ZW1wbGF0ZS5wZW5kaW5nVm9pY2VJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ3Nlc3Npb24tcGVuZGluZy12b2ljZS1pbmRpY2F0b3IgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnVubXV0ZSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLFxuXHRcdFx0dGVtcGxhdGUucGVuZGluZ1ZvaWNlSW5kaWNhdG9yLFxuXHRcdFx0bG9jYWxpemUoJ3BlbmRpbmdWb2ljZVJlc3BvbnNlJywgXCJWb2ljZSByZXNwb25zZSByZWFkeVwiKSxcblx0XHQpKTtcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3ZvaWNlUGxheWJhY2tTZXJ2aWNlLnBlbmRpbmdSZXNwb25zZVZlcnNpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGVtcGxhdGUucGVuZGluZ1ZvaWNlSW5kaWNhdG9yLmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB0aGlzLl92b2ljZVBsYXliYWNrU2VydmljZS5oYXNQZW5kaW5nUmVzcG9uc2UocGVuZGluZ1ZvaWNlUmVzb3VyY2UpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUb29sYmFyIGNvbnRleHRcblx0XHRpZiAodGVtcGxhdGUudGl0bGVUb29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZS50aXRsZVRvb2xiYXIuY29udGV4dCA9IGVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGV4dCBrZXlzXG5cdFx0Y29uc3QgaXNQaW5uZWQgPSB0aGlzLm9wdGlvbnMuaXNQaW5uZWQoZWxlbWVudCk7XG5cdFx0SXNTZXNzaW9uUGlubmVkQ29udGV4dC5iaW5kVG8odGVtcGxhdGUuY29udGV4dEtleVNlcnZpY2UpLnNldChpc1Bpbm5lZCk7XG5cdFx0U2Vzc2lvbklzQXJjaGl2ZWRDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGVsZW1lbnQuaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0U2Vzc2lvbkl0ZW1IYXNCcmFuY2hOYW1lQ29udGV4dC5iaW5kVG8odGVtcGxhdGUuY29udGV4dEtleVNlcnZpY2UpLnNldCghIWVsZW1lbnQud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5icmFuY2hOYW1lPy50cmltKCkpO1xuXG5cdFx0Ly8gUGlubmVkICYgYXJjaGl2ZWQgc3R5bGluZyBcdTIwMTQgcmVhY3RpdmVcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzQXJjaGl2ZWQgPSBlbGVtZW50LmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FyY2hpdmVkJywgaXNBcmNoaXZlZCk7XG5cdFx0XHQvLyBPbmx5IGFwcGx5IHBpbm5lZCBzdHlsaW5nIHdoZW4gbm90IGFyY2hpdmVkIHRvIGF2b2lkIHBlcnNpc3RlbnQgdG9vbGJhcnMgb24gYXJjaGl2ZWQgc2Vzc2lvbnNcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdwaW5uZWQnLCBpc1Bpbm5lZCAmJiAhaXNBcmNoaXZlZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RpY2t5IHN0eWxpbmcgXHUyMDE0IHJlYWN0aXZlIG9uIHRoZSB3cmFwcGVyJ3Mgc3RpY2t5IG9ic2VydmFibGVcblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHdyYXBwZXIgPSB0aGlzLm9wdGlvbnMudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKS5maW5kKHMgPT4gcz8uc2Vzc2lvbklkID09PSBlbGVtZW50LnNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBpc1N0aWNreSA9IHdyYXBwZXIgPyB3cmFwcGVyLnN0aWNreS5yZWFkKHJlYWRlcikgOiBmYWxzZTtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzdGlja3knLCBpc1N0aWNreSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSWNvbiBcdTIwMTQgcmVhY3RpdmUgYmFzZWQgb24gc3RhdHVzLCByZWFkIHN0YXRlLCBQUiwgYW5kIG1vdGlvbiBwcmVmZXJlbmNlLlxuXHRcdC8vIFRoZSBjdXJyZW50IGljb24gQ1NTIHNlbGVjdG9yIGlzIHN0b3JlZCBvbiB0aGUgdGVtcGxhdGUgKG5vdCBhIGxvY2FsXG5cdFx0Ly8gdmFyaWFibGUpIHNvIGl0IHN1cnZpdmVzIGFjcm9zcyByZW5kZXJTZXNzaW9uIGNhbGxzIFx1MjAxNCB0aGUgdHJlZSByZS1yZW5kZXJzXG5cdFx0Ly8gYWxsIHZpc2libGUgcm93cyBvbiBldmVyeSBzcGxpY2UsIHdoaWNoIGNsZWFycyBlbGVtZW50RGlzcG9zYWJsZXMgYW5kXG5cdFx0Ly8gcmVjcmVhdGVzIHRoZSBhdXRvcnVuLiBXaXRob3V0IHRlbXBsYXRlLWxldmVsIHRyYWNraW5nLCB0aGUgc2VsZWN0b3Jcblx0XHQvLyByZXNldHMgdG8gdW5kZWZpbmVkIGFuZCB0aGUgRE9NIGlzIHJlYnVpbHQgZXZlcnkgdGltZSwgcmVzdGFydGluZyB0aGVcblx0XHQvLyBDU1Mgc3BpbiBhbmltYXRpb24uXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RhdHVzID0gZWxlbWVudC5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGVtcGxhdGUuc3RhdHVzQ29udGV4dC5zZXQoc2Vzc2lvblN0YXR1cyk7XG5cdFx0XHRjb25zdCBpc1JlYWQgPSBlbGVtZW50LmlzUmVhZC5yZWFkKHJlYWRlcik7XG5cdFx0XHR0ZW1wbGF0ZS5pc1JlYWRDb250ZXh0LnNldChpc1JlYWQpO1xuXHRcdFx0Y29uc3QgaXNBcmNoaXZlZCA9IGVsZW1lbnQuaXNBcmNoaXZlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBlbGVtZW50LmNhcGFiaWxpdGllcy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0ZW1wbGF0ZS5zdXBwb3J0c0RlbGV0ZUNvbnRleHQuc2V0KGNhcGFiaWxpdGllcy5zdXBwb3J0c0RlbGV0ZSA9PT0gdHJ1ZSk7XG5cdFx0XHRjb25zdCBnaXRIdWJJbmZvID0gZWxlbWVudC53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gZWxlbWVudC5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkU3RhdGVJY29uID0gZWxlbWVudC5jb21wbGV0ZWRTdGF0ZUljb24/LnJlYWQocmVhZGVyKSA/PyBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdD8uaWNvbjtcblxuXHRcdFx0Ly8gVGhlIHN0YXR1cyBpY29uIHdpZGdldCBzbmFwcyBvbiByb3cgcmVjeWNsaW5nIGFuZCBjcm9zcy1mYWRlcyByZWFsIHN0YXRlIGNoYW5nZXMuXG5cdFx0XHR0ZW1wbGF0ZS5zdGF0dXNJY29uLnNldFN0YXR1cyhzZXNzaW9uU3RhdHVzLCBpc1JlYWQsIGlzQXJjaGl2ZWQsIGNvbXBsZXRlZFN0YXRlSWNvbiwgZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHQvLyBUaGUgdGl0bGUgc2hpbW1lciAodG9nZ2xlZCBieSB0aGUgYGluLXByb2dyZXNzYCBjbGFzcykgaXMgcGhhc2UtYWxpZ25lZFxuXHRcdFx0Ly8gYWNyb3NzIHJvd3MgdmlhIGFuIGBhbmltYXRpb25zdGFydGAgaGFuZGxlciBvbiB0aGUgdGl0bGUgZWxlbWVudCwgc28gbm9cblx0XHRcdC8vIHBlci1zdGF0ZSB3b3JrIGlzIG5lZWRlZCBoZXJlLlxuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2luLXByb2dyZXNzJywgc2Vzc2lvblN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCduZWVkcy1pbnB1dCcsIHNlc3Npb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCk7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndW5yZWFkJywgIWlzUmVhZCAmJiAhaXNBcmNoaXZlZCk7XG5cdFx0XHQvLyBRdWljay1jaGF0IHJvd3MgdXNlIGEgbW9yZSBjb21wYWN0IGxheW91dCAoc21hbGxlciBpY29uLCB0aWdodGVyIHJvdyBoZWlnaHQpLlxuXHRcdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3F1aWNrLWNoYXQnLCBpc1F1aWNrQ2hhdCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGl0bGUgXHUyMDE0IHJlYWN0aXZlXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZVRleHQgPSBlbGVtZW50LnRpdGxlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRlbXBsYXRlLnRpdGxlLnNldCh0aXRsZVRleHQsIG1hdGNoZXMpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERldGFpbHMgcm93IFx1MjAxNCByZWFjdGl2ZTogYmFkZ2UgXHUwMEI3IGRpZmYgc3RhdHMgXHUwMEI3IHRpbWUgXHUwMEI3IHN0YXR1cyBkZXNjcmlwdGlvblxuXHRcdC8vIChxdWljayBjaGF0cyB1c2UgYSBtb3JlIGNvbXBhY3Qgcm93OiBubyBkaWZmIHN0YXRzL3RpbWUvdHlwZS1pY29uLCBhbmRcblx0XHQvLyBubyBcIldvcmtpbmcuLi5cIiB0ZXh0IHNpbmNlIHRoZWlyIHNwaW5uZXIgc3RhdHVzIGljb24gYWxyZWFkeSBjb252ZXlzIGl0KVxuXHRcdGNvbnN0IHRpbWVEaXNwb3NhYmxlID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25EaXNwb3NhYmxlID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RhdHVzID0gZWxlbWVudC5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gZWxlbWVudC53b3Jrc3BhY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBlbGVtZW50LmRlc2NyaXB0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gZWxlbWVudC5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXG5cdFx0XHQvLyBDbGVhciBhbmQgcmVidWlsZCBkZXRhaWxzIHJvd1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZS5kZXRhaWxzUm93KTtcblxuXHRcdFx0Ly8gUXVpY2sgY2hhdHMgYXJlIHNpbmdsZS1saW5lIHJvd3Mgd2l0aCBubyBkZXRhaWxzIHJvdyBhdCBhbGwgKGhpZGRlblxuXHRcdFx0Ly8gdmlhIENTUykgXHUyMDE0IHNraXAgYnVpbGRpbmcgaXRzIGNvbnRlbnQgZW50aXJlbHkuXG5cdFx0XHRpZiAoaXNRdWlja0NoYXQpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25EaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRcdHRpbWVEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGVsZW1lbnQuY2hhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjaGFuZ2VzU3VtbWFyeSA9IGVsZW1lbnQuY2hhbmdlc1N1bW1hcnk/LnJlYWQocmVhZGVyKTtcblx0XHRcdGxldCB0aW1lRGF0ZTogRGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gV2hlbiB0aGUgc2Vzc2lvbiBpcyBJblByb2dyZXNzIG9yIE5lZWRzSW5wdXQsIGhpZGUgd29ya3NwYWNlL2RpZmYvdGltZSBkZXRhaWxzIGluIHRoaXMgcm93XG5cdFx0XHRjb25zdCBoaWRlRGV0YWlscyA9IHNlc3Npb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB8fCBzZXNzaW9uU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cblx0XHRcdGlmICghaGlkZURldGFpbHMpIHtcblx0XHRcdFx0dGltZURhdGUgPSBlbGVtZW50LnVwZGF0ZWRBdC5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cblx0XHRcdC8vIFR5cGUgaWNvbiAoZm9sZGVyL3dvcmt0cmVlL2Nsb3VkKSBcdTIwMTQgcmVndWxhciBzZXNzaW9ucyBvbmx5LiBRdWlja1xuXHRcdFx0Ly8gY2hhdHMgc2hvdyB0aGVpciBjaGF0IGljb24gb24gdGhlIHN0YXR1cyBpY29uIGluc3RlYWQgKHNlZSBhYm92ZSkuXG5cdFx0XHRpZiAoc2Vzc2lvblN0YXR1cyAhPT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB7XG5cdFx0XHRcdGNvbnN0IGtpbmQgPSBnZXRTZXNzaW9uV29ya3NwYWNlS2luZCh3b3Jrc3BhY2UsIGVsZW1lbnQud29ya3RyZWVQZW5kaW5nPy5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHRjb25zdCBpY29uID0gd29ya3NwYWNlPy50eXBlSWNvbiA/PyAoa2luZCA9PT0gU2Vzc2lvbldvcmtzcGFjZUtpbmQuVmlydHVhbCA/IENvZGljb24uY2xvdWRDb21wYWN0IDoga2luZCA9PT0gU2Vzc2lvbldvcmtzcGFjZUtpbmQuRm9sZGVyID8gQ29kaWNvbi5mb2xkZXJDb21wYWN0IDogQ29kaWNvbi53b3JrdHJlZUNvbXBhY3QpO1xuXHRcdFx0XHRjb25zdCB0eXBlSWNvbkVsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tZGV0YWlscy1pY29uJykpO1xuXHRcdFx0XHRET00uYXBwZW5kKHR5cGVJY29uRWwsICQoYHNwYW4ke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGljb24pfWApKTtcblx0XHRcdFx0cGFydHMucHVzaCh0eXBlSWNvbkVsKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdyB0aGUgd29ya3NwYWNlIHdoZW4gdGhlIHNlY3Rpb24gaGVhZGVyIGRvZXMgbm90OiBkYXRlLCBjdXN0b20gZ3JvdXAsIHBpbm5lZCwgb3IgYXJjaGl2ZWQuXG5cdFx0XHRpZiAoIWhpZGVEZXRhaWxzICYmIHdvcmtzcGFjZSAmJiAoXG5cdFx0XHRcdHRoaXMub3B0aW9ucy5ncm91cGluZygpICE9PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSB8fFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMuaXNQaW5uZWQoZWxlbWVudCkgfHxcblx0XHRcdFx0ZWxlbWVudC5pc0FyY2hpdmVkLnJlYWQocmVhZGVyKSB8fFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMuaXNSZW5kZXJlZEluQ3VzdG9tR3JvdXA/LihlbGVtZW50KVxuXHRcdFx0KSkge1xuXHRcdFx0XHRjb25zdCBiYWRnZUxhYmVsID0gZ2V0V29ya3NwYWNlQmFkZ2VMYWJlbCh3b3Jrc3BhY2UpO1xuXHRcdFx0XHRpZiAoYmFkZ2VMYWJlbCkge1xuXHRcdFx0XHRcdGNvbnN0IGJhZGdlRWwgPSBET00uYXBwZW5kKHRlbXBsYXRlLmRldGFpbHNSb3csICQoJ3NwYW4uc2Vzc2lvbi1iYWRnZScpKTtcblx0XHRcdFx0XHRiYWRnZUVsLnRleHRDb250ZW50ID0gYmFkZ2VMYWJlbDtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGJhZGdlRWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpZmYgc3RhdHNcblx0XHRcdGlmICghaGlkZURldGFpbHMgJiYgKGNoYW5nZXNTdW1tYXJ5IHx8IGNoYW5nZXMubGVuZ3RoID4gMCkpIHtcblx0XHRcdFx0bGV0IGluc2VydGlvbnMgPSAwLCBkZWxldGlvbnMgPSAwO1xuXG5cdFx0XHRcdGlmIChjaGFuZ2VzU3VtbWFyeSkge1xuXHRcdFx0XHRcdGluc2VydGlvbnMgPSBjaGFuZ2VzU3VtbWFyeS5hZGRpdGlvbnM7XG5cdFx0XHRcdFx0ZGVsZXRpb25zID0gY2hhbmdlc1N1bW1hcnkuZGVsZXRpb25zO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0XHRcdGluc2VydGlvbnMgKz0gY2hhbmdlLmluc2VydGlvbnM7XG5cdFx0XHRcdFx0XHRkZWxldGlvbnMgKz0gY2hhbmdlLmRlbGV0aW9ucztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaW5zZXJ0aW9ucyA+IDAgfHwgZGVsZXRpb25zID4gMCkge1xuXHRcdFx0XHRcdGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRET00uYXBwZW5kKHRlbXBsYXRlLmRldGFpbHNSb3csICQoJ3NwYW4uc2Vzc2lvbi1zZXBhcmF0b3IuaGFzLXNlcGFyYXRvcicpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZGlmZkVsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tZGlmZicpKTtcblx0XHRcdFx0XHRET00uYXBwZW5kKGRpZmZFbCwgJCgnc3Bhbi5zZXNzaW9uLWRpZmYtYWRkZWQnKSkudGV4dENvbnRlbnQgPSBgKyR7aW5zZXJ0aW9uc31gO1xuXHRcdFx0XHRcdERPTS5hcHBlbmQoZGlmZkVsLCAkKCdzcGFuLnNlc3Npb24tZGlmZi1yZW1vdmVkJykpLnRleHRDb250ZW50ID0gYC0ke2RlbGV0aW9uc31gO1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goZGlmZkVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0dXNNZXNzYWdlID0gZ2V0U2Vzc2lvblN0YXR1c01lc3NhZ2Uoc2Vzc2lvblN0YXR1cywgZGVzY3JpcHRpb24pO1xuXHRcdFx0aWYgKHN0YXR1c01lc3NhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAocGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdERPTS5hcHBlbmQodGVtcGxhdGUuZGV0YWlsc1JvdywgJCgnc3Bhbi5zZXNzaW9uLXNlcGFyYXRvci5oYXMtc2VwYXJhdG9yJykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0YXR1c0VsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tZGVzY3JpcHRpb24nKSk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc3RhdHVzTWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbkRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdFx0XHRzdGF0dXNFbC50ZXh0Q29udGVudCA9IHN0YXR1c01lc3NhZ2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25EaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoc3RhdHVzTWVzc2FnZSwgeyBzYW5pdGl6ZXJDb25maWc6IHsgcmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWUgfSB9LCBzdGF0dXNFbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFydHMucHVzaChzdGF0dXNFbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXNjcmlwdGlvbkRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGltZXN0YW1wIFx1MjAxNCB2aXNpYmxlIHdoZW4gbm90IGhpZGluZyBkZXRhaWxzXG5cdFx0XHRpZiAoIWhpZGVEZXRhaWxzICYmIHRpbWVEYXRlKSB7XG5cdFx0XHRcdGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0RE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tc2VwYXJhdG9yLmhhcy1zZXBhcmF0b3InKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGltZUVsID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZS5kZXRhaWxzUm93LCAkKCdzcGFuLnNlc3Npb24tdGltZScpKTtcblx0XHRcdFx0Y29uc3QgZGVmaW5pdGVUaW1lRGF0ZSA9IHRpbWVEYXRlO1xuXHRcdFx0XHRjb25zdCBmb3JtYXRUaW1lID0gKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlY29uZHMgPSBNYXRoLnJvdW5kKChEYXRlLm5vdygpIC0gZGVmaW5pdGVUaW1lRGF0ZS5nZXRUaW1lKCkpIC8gMTAwMCk7XG5cdFx0XHRcdFx0cmV0dXJuIHNlY29uZHMgPCA2MCA/IGxvY2FsaXplKCdzZWNvbmRzRHVyYXRpb24nLCBcIm5vd1wiKSA6IGZyb21Ob3coZGVmaW5pdGVUaW1lRGF0ZSwgdHJ1ZSk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRpbWVFbC50ZXh0Q29udGVudCA9IGZvcm1hdFRpbWUoKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aW1lRWwpO1xuXHRcdFx0XHRjb25zdCBpbnRlcnZhbCA9IHRhcmdldFdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdFx0dGltZUVsLnRleHRDb250ZW50ID0gZm9ybWF0VGltZSgpO1xuXHRcdFx0XHR9LCA2MF8wMDApO1xuXHRcdFx0XHR0aW1lRGlzcG9zYWJsZS52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB0YXJnZXRXaW5kb3cuY2xlYXJJbnRlcnZhbChpbnRlcnZhbCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGltZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBcHByb3ZhbCByb3cgXHUyMDE0IHJlYWN0aXZlXG5cdFx0aWYgKHRoaXMuYXBwcm92YWxNb2RlbCkge1xuXHRcdFx0dGhpcy5yZW5kZXJBcHByb3ZhbFJvdyhlbGVtZW50LCB0ZW1wbGF0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRml4LUNJIHJvdyBcdTIwMTQgcmVhY3RpdmUgKG9ubHkgc3VwcGxpZWQgYnkgdGhlIGJsb2NrZWQtc2Vzc2lvbnMgbGlzdClcblx0XHRpZiAodGhpcy5jaUZpeE1vZGVsKSB7XG5cdFx0XHR0aGlzLnJlbmRlckNJUm93KGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFwcHJvdmFsUm93KGVsZW1lbnQ6IElTZXNzaW9uLCB0ZW1wbGF0ZTogSVNlc3Npb25JdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYXBwcm92YWxNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSB0aGlzLmFwcHJvdmFsTW9kZWw7XG5cdFx0Y29uc3QgaW5pdGlhbEluZm8gPSBnZXRGaXJzdEFwcHJvdmFsQWNyb3NzQ2hhdHMoYXBwcm92YWxNb2RlbCwgZWxlbWVudCwgdW5kZWZpbmVkKTtcblx0XHRsZXQgd2FzVmlzaWJsZSA9ICEhaW5pdGlhbEluZm87XG5cdFx0dGVtcGxhdGUuYXBwcm92YWxSb3cuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHdhc1Zpc2libGUpO1xuXG5cdFx0Y29uc3QgYnV0dG9uU3RvcmUgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGJ1dHRvblN0b3JlLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IGluZm8gPSBnZXRGaXJzdEFwcHJvdmFsQWNyb3NzQ2hhdHMoYXBwcm92YWxNb2RlbCwgZWxlbWVudCwgcmVhZGVyKTtcblx0XHRcdGNvbnN0IHZpc2libGUgPSAhIWluZm87XG5cblx0XHRcdHRlbXBsYXRlLmFwcHJvdmFsUm93LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB2aXNpYmxlKTtcblxuXHRcdFx0aWYgKGluZm8pIHtcblx0XHRcdFx0Ly8gUmVuZGVyIHVwIHRvIGBtYXhMaW5lc2AgbGluZXMgYXMgc2VwYXJhdGUgY29kZSBibG9ja3Ncblx0XHRcdFx0Y29uc3QgbGluZXMgPSBpbmZvLmxhYmVsLnNwbGl0KCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWF4TGluZXMgPSB0aGlzLm9wdGlvbnMuYXBwcm92YWxSb3dNYXhMaW5lcztcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUxpbmVzID0gbGluZXMuc2xpY2UoMCwgbWF4TGluZXMpO1xuXHRcdFx0XHRpZiAobGluZXMubGVuZ3RoID4gbWF4TGluZXMpIHtcblx0XHRcdFx0XHR2aXNpYmxlTGluZXNbbWF4TGluZXMgLSAxXSA9IGAke3Zpc2libGVMaW5lc1ttYXhMaW5lcyAtIDFdfSBcXHUyMDI2YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsYW5nSWQgPSBpbmZvLmxhbmd1YWdlSWQgPz8gJ2pzb24nO1xuXHRcdFx0XHRjb25zdCBsYWJlbENvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIHZpc2libGVMaW5lcykge1xuXHRcdFx0XHRcdGxhYmVsQ29udGVudC5hcHBlbmRDb2RlYmxvY2sobGFuZ0lkLCBsaW5lKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRlbXBsYXRlLmFwcHJvdmFsTGFiZWwudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0YnV0dG9uU3RvcmUuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGxhYmVsQ29udGVudCwge30sIHRlbXBsYXRlLmFwcHJvdmFsTGFiZWwpKTtcblxuXHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dIb3Zlcikge1xuXHRcdFx0XHRcdGNvbnN0IGZ1bGxDb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKGluZm8ubGFuZ3VhZ2VJZCA/PyAnanNvbicsIGluZm8ubGFiZWwpO1xuXHRcdFx0XHRcdGJ1dHRvblN0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZS5hcHByb3ZhbExhYmVsLCB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBmdWxsQ29udGVudCxcblx0XHRcdFx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XIH0sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGVtcGxhdGUuYXBwcm92YWxCdXR0b25Db250YWluZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0Y29uc3QgYnV0dG9uID0gYnV0dG9uU3RvcmUuYWRkKG5ldyBCdXR0b24odGVtcGxhdGUuYXBwcm92YWxCdXR0b25Db250YWluZXIsIHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FsbG93QWN0aW9uT25jZScsIFwiQWxsb3cgb25jZVwiKSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlc1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdhbGxvd0FjdGlvbicsIFwiQWxsb3dcIik7XG5cdFx0XHRcdGJ1dHRvblN0b3JlLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gQ2FwdHVyZSB0aGUgYXBwcm92YWwncyBpZGVudGl0eSBCRUZPUkUgY29uZmlybWluZzogYGNvbmZpcm0oKWAgbWF5XG5cdFx0XHRcdFx0Ly8gc3luY2hyb25vdXNseSBjbGVhciB0aGUgcGVuZGluZyBhcHByb3ZhbCwgc28gd2UgY2FuJ3QgcmVhZCBpdCBhZnRlci5cblx0XHRcdFx0XHRjb25zdCBhcHByb3ZhbElkID0gYWdlbnRTZXNzaW9uQXBwcm92YWxJZChpbmZvKTtcblx0XHRcdFx0XHRpbmZvLmNvbmZpcm0oKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEFwcHJvdmVTZXNzaW9uLmZpcmUoeyBzZXNzaW9uOiBlbGVtZW50LCBhcHByb3ZhbElkIH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh3YXNWaXNpYmxlICE9PSB2aXNpYmxlKSB7XG5cdFx0XHRcdHdhc1Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1IZWlnaHQuZmlyZShlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNJUm93KGVsZW1lbnQ6IElTZXNzaW9uLCB0ZW1wbGF0ZTogSVNlc3Npb25JdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2lGaXhNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNpRml4TW9kZWwgPSB0aGlzLmNpRml4TW9kZWw7XG5cdFx0Y29uc3Qgc3RhdGVPYnMgPSBjaUZpeE1vZGVsLmdldENJRml4KGVsZW1lbnQpO1xuXHRcdGxldCB3YXNWaXNpYmxlID0gISFzdGF0ZU9icy5nZXQoKTtcblx0XHR0ZW1wbGF0ZS5jaVJvdy5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgd2FzVmlzaWJsZSk7XG5cblx0XHRjb25zdCBidXR0b25TdG9yZSA9IHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0YnV0dG9uU3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gISFzdGF0ZTtcblxuXHRcdFx0dGVtcGxhdGUuY2lSb3cuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHZpc2libGUpO1xuXG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0dGVtcGxhdGUuY2lMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaS5ibG9ja2VkUm93JywgXCJ7MH0gY2hlY2tzIGZhaWxlZCwgezF9IHBlbmRpbmdcIiwgc3RhdGUuZmFpbGVkLCBzdGF0ZS5wZW5kaW5nKTtcblxuXHRcdFx0XHR0ZW1wbGF0ZS5jaUJ1dHRvbkNvbnRhaW5lci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHQvLyBNYXRjaCB0aGUgY2hhdCBpbnB1dCBDSSBiYW5uZXIncyBwcm9taW5lbnQgb3JhbmdlIGFjdGlvbiBidXR0b24uXG5cdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IGJ1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uKHRlbXBsYXRlLmNpQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaS5maXhDSVRvb2x0aXAnLCBcIkZpeCBmYWlsaW5nIENJIGNoZWNrc1wiKSxcblx0XHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoY2hhcnRzT3JhbmdlKSxcblx0XHRcdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IGBjb2xvci1taXgoaW4gc3JnYiwgJHthc0Nzc1ZhcmlhYmxlKGNoYXJ0c09yYW5nZSl9IDg4JSwgYmxhY2spYCxcblx0XHRcdFx0XHRidXR0b25Cb3JkZXI6IGFzQ3NzVmFyaWFibGUoY2hhcnRzT3JhbmdlKSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRidXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY2kuZml4Q0knLCBcIkZpeCBDSVwiKTtcblx0XHRcdFx0YnV0dG9uU3RvcmUuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IGNpRml4TW9kZWwuZml4Q0koZWxlbWVudCkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHdhc1Zpc2libGUgIT09IHZpc2libGUpIHtcblx0XHRcdFx0d2FzVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5maXJlKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IElTZXNzaW9uSXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFdvcmtzcGFjZUJhZGdlTGFiZWwod29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZvbGRlciA9IHdvcmtzcGFjZS5mb2xkZXJzWzBdO1xuXHRpZiAoZm9sZGVyPy5yb290LnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdGNvbnN0IHBhcnRzID0gZm9sZGVyLnJvb3QucGF0aC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcblx0XHRpZiAocGFydHMubGVuZ3RoID49IDIpIHtcblx0XHRcdHJldHVybiBgJHtwYXJ0c1swXX0vJHtwYXJ0c1sxXX1gO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gd29ya3NwYWNlLmxhYmVsO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlY3Rpb24gSGVhZGVyIFJlbmRlcmVyXG5cbmludGVyZmFjZSBJU2Vzc2lvbkhlYWRlclRlbXBsYXRlIHtcblx0cmVhZG9ubHkgdG9vbGJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyU2Vzc2lvbkhlYWRlclRvb2xiYXI8VD4odGVtcGxhdGU6IElTZXNzaW9uSGVhZGVyVGVtcGxhdGUsIGVsZW1lbnQ6IFQsIHNlbGVjdDogKGVsZW1lbnQ6IFQsIGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkKTogdm9pZCB7XG5cdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZS50b29sYmFyQ29udGFpbmVyLCBET00uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZXZlbnQgPT4gc2VsZWN0KGVsZW1lbnQsIGV2ZW50KSwgdHJ1ZSkpO1xuXHR0ZW1wbGF0ZS50b29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xufVxuXG5pbnRlcmZhY2UgSVNlc3Npb25TZWN0aW9uVGVtcGxhdGUgZXh0ZW5kcyBJU2Vzc2lvbkhlYWRlclRlbXBsYXRlIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHN0YXR1c0luZGljYXRvcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY291bnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjaGV2cm9uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25TZWN0aW9uUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZSwgSVNlc3Npb25TZWN0aW9uVGVtcGxhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Nlc3Npb24tc2VjdGlvbic7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBTZXNzaW9uU2VjdGlvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVzQnlFbGVtZW50ID0gbmV3IFdlYWtNYXA8SVNlc3Npb25TZWN0aW9uLCBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZXNCeUlkID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uU2VjdGlvblRlbXBsYXRlPigpO1xuXHQvLyBUT0RPQEJlblY6IE1vdmUgYXV0b21hdGlvbi1zcGVjaWZpYyBjb2RlIGludG8gYW4gQXV0b21hdGlvblNlY3Rpb25SZW5kZXJlciBzdWJjbGFzcy5cblx0cmVhZG9ubHkgYXV0b21hdGlvblN0YXR1cyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBydW5zID0gdGhpcy5hdXRvbWF0aW9uU2VydmljZS5ydW5zLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2Vzc2lvbnMgPSB0aGlzLmF1dG9tYXRpb25TZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cblx0XHQvLyBOZWVkc0lucHV0IHRha2VzIHByaW9yaXR5OiBhbnkgcnVubmluZyBhdXRvbWF0aW9uIHdob3NlIHNlc3Npb24gaXMgd2FpdGluZyBmb3IgaW5wdXQuXG5cdFx0Y29uc3QgaGFzTmVlZHNJbnB1dCA9IHJ1bnMuc29tZShydW4gPT4ge1xuXHRcdFx0aWYgKHJ1bi5zdGF0dXMgIT09ICdydW5uaW5nJyB8fCAhcnVuLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXV0b21hdGlvblNlc3Npb25zLmZpbmQoY2FuZGlkYXRlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGNhbmRpZGF0ZS5yZXNvdXJjZSwgcnVuLnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0cmV0dXJuICEhc2Vzc2lvbiAmJiBzZXNzaW9uLnN0YXR1cy5yZWFkKHJlYWRlcikgPT09IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblx0XHR9KTtcblx0XHRpZiAoaGFzTmVlZHNJbnB1dCkge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblx0XHR9XG5cblx0XHRpZiAocnVucy5zb21lKHJ1biA9PiBydW4uc3RhdHVzID09PSAncGVuZGluZycgfHwgcnVuLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSkge1xuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHR9XG5cdFx0Y29uc3QgaGFzVW5yZWFkUnVuID0gcnVucy5zb21lKHJ1biA9PiB7XG5cdFx0XHRpZiAoKHJ1bi5zdGF0dXMgIT09ICdjb21wbGV0ZWQnICYmIHJ1bi5zdGF0dXMgIT09ICdmYWlsZWQnKSB8fCAhcnVuLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBydW4uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF1dG9tYXRpb25TZXNzaW9ucy5maW5kKGNhbmRpZGF0ZSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChjYW5kaWRhdGUucmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0cmV0dXJuICEhc2Vzc2lvbiAmJiAhc2Vzc2lvbi5pc1JlYWQucmVhZChyZWFkZXIpO1xuXHRcdH0pO1xuXHRcdGlmIChoYXNVbnJlYWRSdW4pIHtcblx0XHRcdHJldHVybiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBoaWRlU2VjdGlvbkNvdW50OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VsZWN0OiAoZWxlbWVudDogSVNlc3Npb25TZWN0aW9uLCBldmVudDogTW91c2VFdmVudCkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblNlcnZpY2U6IElBdXRvbWF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25bXT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjdXN0b21WaWV3U2VydmljZTogSUN1c3RvbVZpZXdTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbi1zZWN0aW9uJyk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb24tc2VjdGlvbi1pY29uJykpO1xuXHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3QgbGFiZWwgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXNlY3Rpb24tbGFiZWwnKSk7XG5cdFx0Y29uc3Qgc3RhdHVzSW5kaWNhdG9yID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2Vzc2lvbi1zZWN0aW9uLXN0YXR1cy1pbmRpY2F0b3InKSk7XG5cdFx0c3RhdHVzSW5kaWNhdG9yLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IGNvdW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2Vzc2lvbi1zZWN0aW9uLWNvdW50JykpO1xuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tc2VjdGlvbi10b29sYmFyJykpO1xuXHRcdGNvbnN0IGNoZXZyb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXNlY3Rpb24tY2hldnJvbicpKTtcblx0XHRjaGV2cm9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGNvbnN0IHRvb2xiYXIgPSBkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRvb2xiYXJDb250YWluZXIsIFNlc3Npb25TZWN0aW9uVG9vbGJhck1lbnVJZCwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIGljb24sIHN0YXR1c0luZGljYXRvciwgbGFiZWwsIGNvdW50LCB0b29sYmFyQ29udGFpbmVyLCB0b29sYmFyLCBjaGV2cm9uLCBjb250ZXh0S2V5U2VydmljZSwgZWxlbWVudERpc3Bvc2FibGVzLCBkaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0aWYgKCFpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJlbmRlclNlc3Npb25IZWFkZXJUb29sYmFyKHRlbXBsYXRlLCBlbGVtZW50LCB0aGlzLnNlbGVjdCk7XG5cdFx0dGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuc2V0KGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR0aGlzLnRlbXBsYXRlc0J5SWQuc2V0KGVsZW1lbnQuaWQsIHRlbXBsYXRlKTtcblx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShTRVNTSU9OX0hFQURFUl9EUk9QX1RBUkdFVF9DTEFTUyk7XG5cdFx0dGVtcGxhdGUuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Nlc3Npb24tc2VjdGlvbi1zaG9ydGN1dCcpO1xuXHRcdGlmIChlbGVtZW50LmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbi1zZWN0aW9uLXNob3J0Y3V0Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gTGVhZGluZyBpY29uIGZvciB0aGUgXCJQaW5uZWRcIiBhbmQgXCJDaGF0c1wiIChxdWljayBjaGF0cykgc2VjdGlvbiBoZWFkZXJzLlxuXHRcdC8vIFRlbXBsYXRlcyBhcmUgcmV1c2VkIGFjcm9zcyByb3dzLCBzbyByZWNvbXB1dGUgdGhlIGljb24gZXZlcnkgcmVuZGVyLlxuXHRcdGNvbnN0IHNlY3Rpb25JY29uID0gZWxlbWVudC5pZCA9PT0gUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCA/IENvZGljb24uY29tbWVudERpc2N1c3Npb25cblx0XHRcdDogZWxlbWVudC5pZCA9PT0gJ3Bpbm5lZCcgPyBDb2RpY29uLnBpbm5lZFxuXHRcdFx0XHQ6IGVsZW1lbnQuaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQgPyBDb2RpY29uLndhdGNoXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGUuaWNvbi5jbGFzc05hbWUgPSBzZWN0aW9uSWNvbiA/IGBzZXNzaW9uLXNlY3Rpb24taWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShzZWN0aW9uSWNvbil9YCA6ICdzZXNzaW9uLXNlY3Rpb24taWNvbic7XG5cdFx0dGVtcGxhdGUuaWNvbi5zdHlsZS5kaXNwbGF5ID0gc2VjdGlvbkljb24gPyAnJyA6ICdub25lJztcblxuXHRcdGlmIChlbGVtZW50LmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlQ3VzdG9tVmlldyA9IHRoaXMuY3VzdG9tVmlld1NlcnZpY2UuYWN0aXZlQ3VzdG9tVmlldy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBhY3RpdmVDdXN0b21WaWV3Py5pZCA9PT0gQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3IpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzSWNvbiA9IHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uU3RhdHVzSWNvbiwgdGVtcGxhdGUuc3RhdHVzSW5kaWNhdG9yKSk7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgYXV0b21hdGlvblN0YXR1cyA9IHRoaXMuYXV0b21hdGlvblN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChhdXRvbWF0aW9uU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHN0YXR1c0ljb24uc2V0U3RhdHVzKFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGF1dG9tYXRpb25TdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykge1xuXHRcdFx0XHRcdHRlbXBsYXRlLnN0YXR1c0luZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0c3RhdHVzSWNvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYXV0b21hdGlvblN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHN0YXR1c0ljb24uc2V0U3RhdHVzKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRlbXBsYXRlLnN0YXR1c0luZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLnN0YXR1c0luZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZS5zdGF0dXNJbmRpY2F0b3IpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlLmxhYmVsLnRleHRDb250ZW50ID0gZWxlbWVudC5sYWJlbDtcblx0XHRpZiAodGhpcy5oaWRlU2VjdGlvbkNvdW50IHx8IGVsZW1lbnQuaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQpIHtcblx0XHRcdHRlbXBsYXRlLmNvdW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZS5jb3VudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5jb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhlbGVtZW50LnNlc3Npb25zLmxlbmd0aCk7XG5cdFx0XHR0ZW1wbGF0ZS5jb3VudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVDaGV2cm9uKHRlbXBsYXRlLCBub2RlLmNvbGxhcHNpYmxlLCBub2RlLmNvbGxhcHNlZCk7XG5cblx0XHQvLyBTZXQgY29udGV4dCBrZXkgZm9yIHNlY3Rpb24gdHlwZSBzbyB0b29sYmFyIGFjdGlvbnMgY2FuIHVzZSB3aGVuIGNsYXVzZXNcblx0XHRjb25zdCBzZWN0aW9uVHlwZSA9IGVsZW1lbnQuaWQuc3RhcnRzV2l0aCgnd29ya3NwYWNlOicpID8gJ3dvcmtzcGFjZScgOiBlbGVtZW50LmlkO1xuXHRcdFNlc3Npb25TZWN0aW9uVHlwZUNvbnRleHQuYmluZFRvKHRlbXBsYXRlLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoc2VjdGlvblR5cGUpO1xuXHRcdGNvbnN0IGhhc0dpdEh1YlJlcG9zaXRvcnkgPSBTZXNzaW9uU2VjdGlvbkhhc0dpdEh1YlJlcG9zaXRvcnlDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgaGFzTm9uQ2xvdWRSZXBvc2l0b3J5ID0gU2Vzc2lvblNlY3Rpb25IYXNOb25DbG91ZFJlcG9zaXRvcnlDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRsZXQgaGFzR2l0SHViID0gZmFsc2U7XG5cdFx0XHRsZXQgaGFzTm9uQ2xvdWRXb3Jrc3BhY2UgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBlbGVtZW50LnNlc3Npb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHNlc3Npb24ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVycyA/PyBbXSkge1xuXHRcdFx0XHRcdGlmIChmb2xkZXIuZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5yZWFkKHJlYWRlcikgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0aGFzR2l0SHViID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aGFzTm9uQ2xvdWRXb3Jrc3BhY2UgfHw9IGZvbGRlci5yb290LnNjaGVtZSAhPT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aGFzR2l0SHViUmVwb3NpdG9yeS5zZXQoaGFzR2l0SHViKTtcblx0XHRcdGhhc05vbkNsb3VkUmVwb3NpdG9yeS5zZXQoaGFzTm9uQ2xvdWRXb3Jrc3BhY2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBleHBhbmQvY29sbGFwc2UgY2hldnJvbiBmb3IgYW4gYWxyZWFkeS1yZW5kZXJlZCBzZWN0aW9uLiBUaGVcblx0ICogdHJlZSBvbmx5IHJlLWludm9rZXMgYHJlbmRlclR3aXN0aWVgIChub3QgYHJlbmRlckVsZW1lbnRgKSB3aGVuIGEgc2VjdGlvbidzXG5cdCAqIGNvbGxhcHNlIHN0YXRlIHRvZ2dsZXMsIHNvIHRoZSBvd25pbmcgbGlzdCBmb3J3YXJkcyBjb2xsYXBzZSBjaGFuZ2VzIGhlcmUuXG5cdCAqL1xuXHR1cGRhdGVDb2xsYXBzZVN0YXRlKGVsZW1lbnQ6IElTZXNzaW9uU2VjdGlvbiwgY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLnRlbXBsYXRlc0J5RWxlbWVudC5nZXQoZWxlbWVudCk7XG5cdFx0aWYgKHRlbXBsYXRlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNoZXZyb24odGVtcGxhdGUsIHRydWUsIGNvbGxhcHNlZCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0RHJvcFRhcmdldChzZWN0aW9uSWQ6IHN0cmluZywgYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLnRlbXBsYXRlc0J5SWQuZ2V0KHNlY3Rpb25JZCk7XG5cdFx0dGVtcGxhdGU/LmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKFNFU1NJT05fSEVBREVSX0RST1BfVEFSR0VUX0NMQVNTLCBhY3RpdmUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGV2cm9uKHRlbXBsYXRlOiBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSwgY29sbGFwc2libGU6IGJvb2xlYW4sIGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmNoZXZyb24uY2xhc3NOYW1lID0gJ3Nlc3Npb24tc2VjdGlvbi1jaGV2cm9uJztcblx0XHRpZiAoY29sbGFwc2libGUpIHtcblx0XHRcdHRlbXBsYXRlLmNoZXZyb24uY2xhc3NMaXN0LmFkZCgnY29sbGFwc2libGUnKTtcblx0XHRcdGNvbnN0IGljb24gPSBjb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd247XG5cdFx0XHR0ZW1wbGF0ZS5jaGV2cm9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uU2VjdGlvblRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKGlzU2Vzc2lvblNlY3Rpb24obm9kZS5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuZGVsZXRlKG5vZGUuZWxlbWVudCk7XG5cdFx0XHR0aGlzLnRlbXBsYXRlc0J5SWQuZGVsZXRlKG5vZGUuZWxlbWVudC5pZCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBJU2Vzc2lvblNlY3Rpb25UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlc3Npb24gR3JvdXAgUmVuZGVyZXJcblxuaW50ZXJmYWNlIElTZXNzaW9uR3JvdXBUZW1wbGF0ZSBleHRlbmRzIElTZXNzaW9uSGVhZGVyVGVtcGxhdGUge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGlucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hldnJvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbi8qKlxuICogQ2FsbGJhY2tzIHRoZSBncm91cCByZW5kZXJlciB1c2VzIHRvIGNvbW1pdCBvciBjYW5jZWwgaW5saW5lIHJlbmFtaW5nLlxuICovXG5pbnRlcmZhY2UgSVNlc3Npb25Hcm91cFJlbmRlcmVyRGVsZWdhdGUge1xuXHRjb21taXRFZGl0KGdyb3VwOiBJU2Vzc2lvbkdyb3VwLCBuYW1lOiBzdHJpbmcpOiB2b2lkO1xuXHRjYW5jZWxFZGl0KGdyb3VwOiBJU2Vzc2lvbkdyb3VwKTogdm9pZDtcblx0c2VsZWN0KGVsZW1lbnQ6IElTZXNzaW9uR3JvdXBJdGVtLCBldmVudDogTW91c2VFdmVudCk6IHZvaWQ7XG59XG5cbmNsYXNzIFNlc3Npb25Hcm91cFJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmUsIElTZXNzaW9uR3JvdXBUZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc2Vzc2lvbi1ncm91cCc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBTZXNzaW9uR3JvdXBSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlc0J5RWxlbWVudCA9IG5ldyBXZWFrTWFwPElTZXNzaW9uR3JvdXBJdGVtLCBJU2Vzc2lvbkdyb3VwVGVtcGxhdGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVzQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbkdyb3VwVGVtcGxhdGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSVNlc3Npb25Hcm91cFJlbmRlcmVyRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNlc3Npb25Hcm91cFRlbXBsYXRlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXNzaW9uLXNlY3Rpb24nLCAnc2Vzc2lvbi1ncm91cCcpO1xuXHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc2Vzc2lvbi1zZWN0aW9uLWxhYmVsJykpO1xuXHRcdGNvbnN0IGlucHV0Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9uLWdyb3VwLWlucHV0JykpO1xuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNlc3Npb24tc2VjdGlvbi10b29sYmFyJykpO1xuXHRcdGNvbnN0IGNoZXZyb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXNlY3Rpb24tY2hldnJvbicpKTtcblx0XHRjaGV2cm9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoY29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdGNvbnN0IHRvb2xiYXIgPSBkaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRvb2xiYXJDb250YWluZXIsIFNlc3Npb25Hcm91cFRvb2xiYXJNZW51SWQsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCBsYWJlbCwgaW5wdXRDb250YWluZXIsIHRvb2xiYXJDb250YWluZXIsIHRvb2xiYXIsIGNoZXZyb24sIGNvbnRleHRLZXlTZXJ2aWNlLCBkaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzOiBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJU2Vzc2lvbkdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGlmICghaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHJlbmRlclNlc3Npb25IZWFkZXJUb29sYmFyKHRlbXBsYXRlLCBlbGVtZW50LCB0aGlzLmRlbGVnYXRlLnNlbGVjdCk7XG5cdFx0dGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuc2V0KGVsZW1lbnQsIHRlbXBsYXRlKTtcblx0XHR0aGlzLnRlbXBsYXRlc0J5SWQuc2V0KGVsZW1lbnQuZ3JvdXAuaWQsIHRlbXBsYXRlKTtcblx0XHR0ZW1wbGF0ZS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShTRVNTSU9OX0hFQURFUl9EUk9QX1RBUkdFVF9DTEFTUyk7XG5cblx0XHR0ZW1wbGF0ZS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQuZ3JvdXAubmFtZTtcblx0XHR0aGlzLnVwZGF0ZUNoZXZyb24odGVtcGxhdGUsIG5vZGUuY29sbGFwc2libGUsIG5vZGUuY29sbGFwc2VkKTtcblx0XHRTZXNzaW9uR3JvdXBIYXNWaXNpYmxlU2Vzc2lvbnNDb250ZXh0LmJpbmRUbyh0ZW1wbGF0ZS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGVsZW1lbnQuc2Vzc2lvbnMubGVuZ3RoID4gMCk7XG5cdFx0U2Vzc2lvbkdyb3VwSXNFbXB0eUNvbnRleHQuYmluZFRvKHRlbXBsYXRlLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZWxlbWVudC5pc0VtcHR5KTtcblxuXHRcdHRlbXBsYXRlLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzZXNzaW9uLWdyb3VwLWVkaXRpbmcnLCBlbGVtZW50LmVkaXRpbmcpO1xuXHRcdGlmIChlbGVtZW50LmVkaXRpbmcpIHtcblx0XHRcdHRoaXMucmVuZGVySW5wdXQoZWxlbWVudCwgdGVtcGxhdGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5pbnB1dENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGVtcGxhdGUubGFiZWwuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW5wdXQoZWxlbWVudDogSVNlc3Npb25Hcm91cEl0ZW0sIHRlbXBsYXRlOiBJU2Vzc2lvbkdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5sYWJlbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlLmlucHV0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlLmlucHV0Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgSW5wdXRCb3godGVtcGxhdGUuaW5wdXRDb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3Nlc3Npb25Hcm91cE5hbWUnLCBcIkdyb3VwIG5hbWVcIiksXG5cdFx0fSkpO1xuXHRcdGlucHV0LnZhbHVlID0gZWxlbWVudC5ncm91cC5uYW1lO1xuXHRcdGlucHV0LmZvY3VzKCk7XG5cdFx0aW5wdXQuc2VsZWN0KCk7XG5cblx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvbW1pdCA9ICgpID0+IHtcblx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5jb21taXRFZGl0KGVsZW1lbnQuZ3JvdXAsIGlucHV0LnZhbHVlLnRyaW0oKSk7XG5cdFx0fTtcblx0XHRjb25zdCBjYW5jZWwgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdHRoaXMuZGVsZWdhdGUuY2FuY2VsRWRpdChlbGVtZW50Lmdyb3VwKTtcblx0XHR9O1xuXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXQuaW5wdXRFbGVtZW50LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNvbW1pdCgpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0LmlucHV0RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5CTFVSLCAoKSA9PiBjb21taXQoKSkpO1xuXHR9XG5cblx0LyoqIEZvcndhcmRlZCBmcm9tIHRoZSBvd25pbmcgbGlzdCB3aGVuIHRoZSBncm91cCdzIGNvbGxhcHNlIHN0YXRlIHRvZ2dsZXMuICovXG5cdHVwZGF0ZUNvbGxhcHNlU3RhdGUoZWxlbWVudDogSVNlc3Npb25Hcm91cEl0ZW0sIGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy50ZW1wbGF0ZXNCeUVsZW1lbnQuZ2V0KGVsZW1lbnQpO1xuXHRcdGlmICh0ZW1wbGF0ZSkge1xuXHRcdFx0dGhpcy51cGRhdGVDaGV2cm9uKHRlbXBsYXRlLCB0cnVlLCBjb2xsYXBzZWQpO1xuXHRcdH1cblx0fVxuXG5cdHNldERyb3BUYXJnZXQoZ3JvdXBJZDogc3RyaW5nLCBhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHRoaXMudGVtcGxhdGVzQnlJZC5nZXQoZ3JvdXBJZCk7XG5cdFx0dGVtcGxhdGU/LmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKFNFU1NJT05fSEVBREVSX0RST1BfVEFSR0VUX0NMQVNTLCBhY3RpdmUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGV2cm9uKHRlbXBsYXRlOiBJU2Vzc2lvbkdyb3VwVGVtcGxhdGUsIGNvbGxhcHNpYmxlOiBib29sZWFuLCBjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5jaGV2cm9uLmNsYXNzTmFtZSA9ICdzZXNzaW9uLXNlY3Rpb24tY2hldnJvbic7XG5cdFx0aWYgKGNvbGxhcHNpYmxlKSB7XG5cdFx0XHR0ZW1wbGF0ZS5jaGV2cm9uLmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNpYmxlJyk7XG5cdFx0XHRjb25zdCBpY29uID0gY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duO1xuXHRcdFx0dGVtcGxhdGUuY2hldnJvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBJU2Vzc2lvbkdyb3VwVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKG5vZGUuZWxlbWVudCkpIHtcblx0XHRcdHRoaXMudGVtcGxhdGVzQnlFbGVtZW50LmRlbGV0ZShub2RlLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy50ZW1wbGF0ZXNCeUlkLmRlbGV0ZShub2RlLmVsZW1lbnQuZ3JvdXAuaWQpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZTogSVNlc3Npb25Hcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2hvdyBNb3JlIFJlbmRlcmVyXG5cbmNsYXNzIFNlc3Npb25TaG93TW9yZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmUsIEhUTUxFbGVtZW50PiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdzZXNzaW9uLXNob3ctbW9yZSc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBTZXNzaW9uU2hvd01vcmVSZW5kZXJlci5URU1QTEFURV9JRDtcblx0cmVhZG9ubHkgcm93Q2xhc3NOYW1lID0gJ3Nlc3Npb24tbGlzdC1pbnNldC1yb3cnO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb24tc2hvdy1tb3JlJyk7XG5cdFx0cmV0dXJuIERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLnNlc3Npb24tc2hvdy1tb3JlLWxhYmVsJykpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0aWYgKCFpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250YWluZXIgPSB0ZW1wbGF0ZS5wYXJlbnRFbGVtZW50O1xuXHRcdGNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnc2Vzc2lvbi1zaG93LW1vcmUtZm9sZGVycycsIGVsZW1lbnQua2luZCA9PT0gJ2ZvbGRlcnMnKTtcblx0XHRpZiAoZWxlbWVudC5tb2RlID09PSAnbGVzcycpIHtcblx0XHRcdHRlbXBsYXRlLnRleHRDb250ZW50ID0gZWxlbWVudC5raW5kID09PSAnZm9sZGVycydcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2hvd0xlc3NXb3Jrc3BhY2VzQ29tcGFjdCcsIFwiU2hvdyBmZXdlciB3b3Jrc3BhY2VzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dMZXNzQ29tcGFjdCcsIFwiU2hvdyBsZXNzXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS50ZXh0Q29udGVudCA9IGVsZW1lbnQua2luZCA9PT0gJ2ZvbGRlcnMnXG5cdFx0XHRcdD8gZWxlbWVudC5yZW1haW5pbmdDb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Nob3dNb3JlV29ya3NwYWNlQ29tcGFjdCcsIFwiK3swfSBtb3JlIHdvcmtzcGFjZVwiLCBlbGVtZW50LnJlbWFpbmluZ0NvdW50KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dNb3JlV29ya3NwYWNlc0NvbXBhY3QnLCBcIit7MH0gbW9yZSB3b3Jrc3BhY2VzXCIsIGVsZW1lbnQucmVtYWluaW5nQ291bnQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dNb3JlQ29tcGFjdCcsIFwiK3swfSBtb3JlXCIsIGVsZW1lbnQucmVtYWluaW5nQ291bnQpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShfdGVtcGxhdGU6IEhUTUxFbGVtZW50KTogdm9pZCB7IH1cbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uUGxhY2Vob2xkZXJUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaG92ZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPjtcbn1cblxuY2xhc3MgU2Vzc2lvblBsYWNlaG9sZGVyUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZSwgSVNlc3Npb25QbGFjZWhvbGRlclRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdzZXNzaW9uLXBsYWNlaG9sZGVyJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IFNlc3Npb25QbGFjZWhvbGRlclJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2Vzc2lvblBsYWNlaG9sZGVyVGVtcGxhdGUge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzZXNzaW9uLXBsYWNlaG9sZGVyJyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGxhYmVsOiBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5zZXNzaW9uLXBsYWNlaG9sZGVyLWxhYmVsJykpLFxuXHRcdFx0aG92ZXI6IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpLFxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxTZXNzaW9uTGlzdEl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElTZXNzaW9uUGxhY2Vob2xkZXJUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0aWYgKCFpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQubGFiZWw7XG5cdFx0dGVtcGxhdGUuaG92ZXIudmFsdWUgPSBlbGVtZW50LmhvdmVyXG5cdFx0XHQ/IHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRlbXBsYXRlLmNvbnRhaW5lciwgZWxlbWVudC5ob3Zlcilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBJU2Vzc2lvblBsYWNlaG9sZGVyVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5ob3Zlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIEFjY2Vzc2liaWxpdHlcblxuY2xhc3MgU2Vzc2lvbnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TdGF0dXM/OiBJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUJhZGdlT3B0aW9ucz86IHsgZ3JvdXBpbmc6ICgpID0+IFNlc3Npb25zR3JvdXBpbmc7IGlzUGlubmVkOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW47IGlzUmVuZGVyZWRJbkN1c3RvbUdyb3VwPzogKHNlc3Npb246IElTZXNzaW9uKSA9PiBib29sZWFuIH0sXG5cdCkgeyB9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzZXNzaW9uc0xpc3QnLCBcIlNlc3Npb25zXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSk6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz4gfCBudWxsIHtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYCR7ZWxlbWVudC5ncm91cC5uYW1lfSwgJHtlbGVtZW50LnNlc3Npb25zLmxlbmd0aH1gO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuYXV0b21hdGlvblN0YXR1c1xuXHRcdFx0XHRcdD8gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0c3dpdGNoICh0aGlzLmF1dG9tYXRpb25TdGF0dXM/LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0XHRjYXNlIFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb25zTmVlZHNJbnB1dEFyaWEnLCBcInswfSwgcnVuIG5lZWRzIGlucHV0XCIsIGVsZW1lbnQubGFiZWwpO1xuXHRcdFx0XHRcdFx0XHRjYXNlIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzczpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb25zQWN0aXZlQXJpYScsIFwiezB9LCBydW4gaW4gcHJvZ3Jlc3NcIiwgZWxlbWVudC5sYWJlbCk7XG5cdFx0XHRcdFx0XHRcdGNhc2UgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ6XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uc1VucmVhZFJ1bkFyaWEnLCBcInswfSwgdW5yZWFkIHJ1blwiLCBlbGVtZW50LmxhYmVsKTtcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdDogZWxlbWVudC5sYWJlbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBgJHtlbGVtZW50LmxhYmVsfSwgJHtlbGVtZW50LnNlc3Npb25zLmxlbmd0aH1gO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkpIHtcblx0XHRcdGlmIChlbGVtZW50Lm1vZGUgPT09ICdsZXNzJykge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5raW5kID09PSAnZm9sZGVycydcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzaG93TGVzc1dvcmtzcGFjZXNBcmlhJywgXCJTaG93IGZld2VyIHdvcmtzcGFjZXNcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdzaG93TGVzc0FyaWEnLCBcIlNob3cgZmV3ZXIgc2Vzc2lvbnNcIik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5raW5kID09PSAnZm9sZGVycydcblx0XHRcdFx0PyBlbGVtZW50LnJlbWFpbmluZ0NvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2hvd01vcmVXb3Jrc3BhY2VBcmlhJywgXCJTaG93IHswfSBtb3JlIHdvcmtzcGFjZVwiLCBlbGVtZW50LnJlbWFpbmluZ0NvdW50KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3Nob3dNb3JlV29ya3NwYWNlc0FyaWEnLCBcIlNob3cgezB9IG1vcmUgd29ya3NwYWNlc1wiLCBlbGVtZW50LnJlbWFpbmluZ0NvdW50KVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzaG93TW9yZUFyaWEnLCBcIlNob3cgezB9IG1vcmUgc2Vzc2lvbnNcIiwgZWxlbWVudC5yZW1haW5pbmdDb3VudCk7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaG92ZXJcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2Vzc2lvblBsYWNlaG9sZGVyQXJpYScsIFwiezB9LiB7MX1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5ob3Zlcilcblx0XHRcdFx0OiBlbGVtZW50LmxhYmVsO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBlbGVtZW50LnRpdGxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBmcm9tTm93KGVsZW1lbnQudXBkYXRlZEF0LnJlYWQocmVhZGVyKSwgdHJ1ZSk7XG5cdFx0XHRsZXQgbGFiZWwgPSBlbGVtZW50Lndvcmt0cmVlUGVuZGluZz8ucmVhZChyZWFkZXIpXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3Nlc3Npb25JdGVtV29ya3RyZWVQZW5kaW5nQXJpYScsIFwiezB9LCBjcmVhdGluZyB3b3JrdHJlZSwgdXBkYXRlZCB7MX1cIiwgdGl0bGUsIHVwZGF0ZWQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Nlc3Npb25JdGVtQXJpYScsIFwiezB9LCB1cGRhdGVkIHsxfVwiLCB0aXRsZSwgdXBkYXRlZCk7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBlbGVtZW50LnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBlbGVtZW50LndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VMYWJlbCA9IHdvcmtzcGFjZSA/IGdldFdvcmtzcGFjZUJhZGdlTGFiZWwod29ya3NwYWNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VCYWRnZU9wdGlvbnMgJiZcblx0XHRcdFx0c3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgJiZcblx0XHRcdFx0c3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQgJiZcblx0XHRcdFx0d29ya3NwYWNlTGFiZWwgJiZcblx0XHRcdFx0KFxuXHRcdFx0XHRcdHRoaXMud29ya3NwYWNlQmFkZ2VPcHRpb25zLmdyb3VwaW5nKCkgIT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlIHx8XG5cdFx0XHRcdFx0dGhpcy53b3Jrc3BhY2VCYWRnZU9wdGlvbnMuaXNQaW5uZWQoZWxlbWVudCkgfHxcblx0XHRcdFx0XHRlbGVtZW50LmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpIHx8XG5cdFx0XHRcdFx0dGhpcy53b3Jrc3BhY2VCYWRnZU9wdGlvbnMuaXNSZW5kZXJlZEluQ3VzdG9tR3JvdXA/LihlbGVtZW50KVxuXHRcdFx0XHQpXG5cdFx0XHQpIHtcblx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnc2Vzc2lvbkl0ZW1Xb3Jrc3BhY2VBcmlhJywgXCJ7MH0sIGluIHsxfVwiLCBsYWJlbCwgd29ya3NwYWNlTGFiZWwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxhYmVsO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRHJhZyBhbmQgRHJvcFxuXG4vKipcbiAqIENhbGxiYWNrcyB0aGUgc2Vzc2lvbnMgbGlzdCBwcm92aWRlcyB0byBpdHMgZHJhZy1hbmQtZHJvcCBjb250cm9sbGVyIHNvIHRoZVxuICogY29udHJvbGxlciBjYW4gdmFsaWRhdGUgYW5kIGFwcGx5IG1hbnVhbCByZW9yZGVyaW5nIHdpdGhvdXQgb3duaW5nIHRoZSBsaXN0XG4gKiBtb2RlbCBpdHNlbGYuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvbnNMaXN0RG5kRGVsZWdhdGUge1xuXHQvKiogV2hldGhlciBhIHNlc3Npb24gbWF5IHBhcnRpY2lwYXRlIGluIHJlb3JkZXJpbmcgd2l0aGluIGl0cyBjdXJyZW50IHNlY3Rpb24uICovXG5cdGlzUmVvcmRlcmFibGUoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuO1xuXHQvKiogV2hldGhlciBhIHNlc3Npb24gY3VycmVudGx5IHJlbmRlcnMgaW4gdGhlIFBpbm5lZCBzZWN0aW9uLiAqL1xuXHRpc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgZHJhZ2dlZCBzZXNzaW9ucyBtYXkgYmUgcmVvcmRlcmVkIHJlbGF0aXZlIHRvIHRoZSBnaXZlbiB0YXJnZXQuICovXG5cdGNhbkRyb3BPbihkcmFnZ2VkOiBJU2Vzc2lvbltdLCB0YXJnZXQ6IElTZXNzaW9uKTogYm9vbGVhbjtcblx0LyoqIEFwcGx5IHRoZSByZW9yZGVyLCBwbGFjaW5nIHRoZSBkcmFnZ2VkIHNlc3Npb25zIGJlZm9yZS9hZnRlciB0aGUgdGFyZ2V0LiAqL1xuXHRyZW9yZGVyKGRyYWdnZWQ6IElTZXNzaW9uW10sIHRhcmdldDogSVNlc3Npb24sIHBvc2l0aW9uOiAnYmVmb3JlJyB8ICdhZnRlcicpOiB2b2lkO1xuXHQvKiogVGhlIGlkIG9mIHRoZSBncm91cCB0aGUgc2Vzc2lvbiBiZWxvbmdzIHRvLCBvciBgdW5kZWZpbmVkYC4gKi9cblx0Z2V0R3JvdXBJZE9mU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIEFkZCB0aGUgZ2l2ZW4gc2Vzc2lvbnMgdG8gdGhlIGdyb3VwLiAqL1xuXHRhZGRTZXNzaW9uc1RvR3JvdXAoc2Vzc2lvbnM6IElTZXNzaW9uW10sIGdyb3VwSWQ6IHN0cmluZywgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdC8qKiBQaW4gdGhlIGdpdmVuIHNlc3Npb25zLCBvcHRpb25hbGx5IHBsYWNpbmcgdGhlbSBiZWZvcmUvYWZ0ZXIgYSBwaW5uZWQgdGFyZ2V0LiAqL1xuXHRwaW5TZXNzaW9ucyhzZXNzaW9uczogSVNlc3Npb25bXSwgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdC8qKiBIaWdobGlnaHQgb25seSB0aGUgaGVhZGVyIHRoYXQgd2lsbCByZWNlaXZlIHRoZSBkcmFnZ2VkIHNlc3Npb25zLiAqL1xuXHRzZXREcm9wVGFyZ2V0SGVhZGVyKGhlYWRlcjogSVNlc3Npb25Ecm9wVGFyZ2V0SGVhZGVyIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0LyoqIFJlb3JkZXIgYSB0b3AtbGV2ZWwgaGVhZGVyIChncm91cCBvciB3b3Jrc3BhY2Ugc2VjdGlvbikgYmVmb3JlL2FmdGVyIGFub3RoZXIuICovXG5cdHJlb3JkZXJTZWN0aW9uKGRyYWdnZWRJZDogc3RyaW5nLCB0YXJnZXRJZDogc3RyaW5nLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInLCBpc1dvcmtzcGFjZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJU2Vzc2lvbkRyb3BUYXJnZXRIZWFkZXIge1xuXHRyZWFkb25seSBraW5kOiAnZ3JvdXAnIHwgJ3NlY3Rpb24nO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVNlc3Npb25NZW1iZXJzaGlwRHJvcFRhcmdldCB7XG5cdHJlYWRvbmx5IHNlc3Npb25zOiBJU2Vzc2lvbltdO1xuXHRyZWFkb25seSBoZWFkZXI6IElTZXNzaW9uRHJvcFRhcmdldEhlYWRlcjtcblx0cmVhZG9ubHkgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElTZXNzaW9uQWRkVG9Hcm91cERyb3BUYXJnZXQgZXh0ZW5kcyBJU2Vzc2lvbk1lbWJlcnNoaXBEcm9wVGFyZ2V0IHtcblx0cmVhZG9ubHkgZ3JvdXBJZDogc3RyaW5nO1xufVxuXG4vKiogQSB0b3AtbGV2ZWwgaGVhZGVyIChncm91cCBvciB3b3Jrc3BhY2Ugc2VjdGlvbikgY3VycmVudGx5IGJlaW5nIGRyYWdnZWQgdG8gcmVvcmRlci4gKi9cbmludGVyZmFjZSBJRHJhZ2dlZEhlYWRlciB7XG5cdC8qKiBUaGUgcmVvcmRlciBpZGVudGl0eSAoYGdyb3VwOjxpZD5gIG9yIGB3b3Jrc3BhY2U6PGxhYmVsPmApLiAqL1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHQvKiogV2hldGhlciB0aGUgZHJhZ2dlZCBoZWFkZXIgaXMgYSB3b3Jrc3BhY2Ugc2VjdGlvbiAodnMuIGEgdXNlciBncm91cCkuICovXG5cdHJlYWRvbmx5IGlzV29ya3NwYWNlOiBib29sZWFuO1xufVxuXG5jbGFzcyBTZXNzaW9uc0xpc3REcmFnQW5kRHJvcCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPFNlc3Npb25MaXN0SXRlbT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zZmVyID0gTG9jYWxTZWxlY3Rpb25UcmFuc2Zlci5nZXRJbnN0YW5jZTxEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXI+KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSVNlc3Npb25zTGlzdERuZERlbGVnYXRlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldERyYWdVUkkoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGlzU2Vzc2lvbkdyb3VwSXRlbShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGBzZXNzaW9uR3JvdXA6JHtlbGVtZW50Lmdyb3VwLmlkfWA7XG5cdFx0fVxuXHRcdGlmIChpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBPbmx5IHdvcmtzcGFjZSBzZWN0aW9ucyBhcmUgcmVvcmRlcmFibGU7IFBpbm5lZCwgRG9uZSBhbmQgdGhlIGRhdGVcblx0XHRcdC8vIHNlY3Rpb25zIHN0YXkgZml4ZWQgYW5kIGFyZSB0aGVyZWZvcmUgbm90IGRyYWdnYWJsZS5cblx0XHRcdHJldHVybiBlbGVtZW50LmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSA/IGBzZXNzaW9uV29ya3NwYWNlOiR7ZWxlbWVudC5pZH1gIDogbnVsbDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0fVxuXG5cdGdldERyYWdMYWJlbChlbGVtZW50czogU2Vzc2lvbkxpc3RJdGVtW10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGdyb3VwSXRlbSA9IGVsZW1lbnRzLmZpbmQoaXNTZXNzaW9uR3JvdXBJdGVtKTtcblx0XHRpZiAoZ3JvdXBJdGVtKSB7XG5cdFx0XHRyZXR1cm4gZ3JvdXBJdGVtLmdyb3VwLm5hbWU7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtzcGFjZVNlY3Rpb24gPSBlbGVtZW50cy5maW5kKChlKTogZSBpcyBJU2Vzc2lvblNlY3Rpb24gPT4gaXNTZXNzaW9uU2VjdGlvbihlKSAmJiBlLmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSk7XG5cdFx0aWYgKHdvcmtzcGFjZVNlY3Rpb24pIHtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2VTZWN0aW9uLmxhYmVsO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMudG9TZXNzaW9ucyhlbGVtZW50cyk7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25zWzBdLnRpdGxlLmdldCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25zLmRyYWdMYWJlbCcsIFwiezB9IHNlc3Npb25zXCIsIHNlc3Npb25zLmxlbmd0aCk7XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMudG9TZXNzaW9ucyhkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEgPyBkYXRhLmVsZW1lbnRzIGFzIFNlc3Npb25MaXN0SXRlbVtdIDogW10pO1xuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpZGVudGlmaWVycyA9IHNlc3Npb25zLm1hcChzID0+IG5ldyBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIocy5zZXNzaW9uSWQsIHMucmVzb3VyY2UpKTtcblx0XHR0aGlzLl90cmFuc2Zlci5zZXREYXRhKGlkZW50aWZpZXJzLCBEcmFnZ2VkU2Vzc2lvbklkZW50aWZpZXIucHJvdG90eXBlKTtcblxuXHRcdGlmIChvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0Ly8gRXhwb3NlIHRoZSBmaXJzdCBkcmFnZ2VkIHNlc3Npb24gYXMgYSB0eXBlZCBwYXlsb2FkIGFzIHdlbGwgc28gZXh0ZXJuYWxcblx0XHRcdC8vIGRyb3AgaGFuZGxlcnMgY2FuIHJlYWQgaXQgd2l0aG91dCB1c2luZyB0aGUgbG9jYWwgdHJhbnNmZXIuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uSWQ6IHNlc3Npb25zWzBdLnNlc3Npb25JZCwgcmVzb3VyY2U6IHNlc3Npb25zWzBdLnJlc291cmNlLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKFNlc3Npb25zRGF0YVRyYW5zZmVycy5TRVNTSU9OLCBwYXlsb2FkKTtcblx0XHR9XG5cdH1cblxuXHRvbkRyYWdFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRTZXNzaW9uSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdHRoaXMuZGVsZWdhdGUuc2V0RHJvcFRhcmdldEhlYWRlcih1bmRlZmluZWQpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0gfCB1bmRlZmluZWQsIF90YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0Y29uc3QgZHJhZ2dlZEhlYWRlciA9IHRoaXMuZHJhZ2dlZEhlYWRlcihkYXRhKTtcblx0XHRpZiAoZHJhZ2dlZEhlYWRlcikge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5vbkhlYWRlckRyYWdPdmVyKGRyYWdnZWRIZWFkZXIsIHRhcmdldEVsZW1lbnQsIHRhcmdldFNlY3Rvcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGluVGFyZ2V0ID0gdGhpcy5yZXNvbHZlUGluVGFyZ2V0KGRhdGEsIHRhcmdldEVsZW1lbnQsIHRhcmdldFNlY3Rvcik7XG5cdFx0aWYgKHBpblRhcmdldCkge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKHBpblRhcmdldC5oZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9NZW1iZXJzaGlwRHJvcFJlYWN0aW9uKHBpblRhcmdldCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkVG9Hcm91cFRhcmdldCA9IHRoaXMucmVzb2x2ZUFkZFRvR3JvdXBUYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0U2VjdG9yKTtcblx0XHRpZiAoYWRkVG9Hcm91cFRhcmdldCkge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKGFkZFRvR3JvdXBUYXJnZXQuaGVhZGVyKTtcblx0XHRcdHJldHVybiB0aGlzLnRvTWVtYmVyc2hpcERyb3BSZWFjdGlvbihhZGRUb0dyb3VwVGFyZ2V0KTtcblx0XHR9XG5cblx0XHR0aGlzLmRlbGVnYXRlLnNldERyb3BUYXJnZXRIZWFkZXIodW5kZWZpbmVkKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnJlc29sdmVSZW9yZGVyVGFyZ2V0KGRhdGEsIHRhcmdldEVsZW1lbnQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY2NlcHQ6IHRydWUsXG5cdFx0XHRlZmZlY3Q6IHtcblx0XHRcdFx0dHlwZTogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlLFxuXHRcdFx0XHRwb3NpdGlvbjogcG9zaXRpb24gPT09ICdhZnRlcicgPyBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5BZnRlciA6IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtIHwgdW5kZWZpbmVkLCBfdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZGVsZWdhdGUuc2V0RHJvcFRhcmdldEhlYWRlcih1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkcmFnZ2VkSGVhZGVyID0gdGhpcy5kcmFnZ2VkSGVhZGVyKGRhdGEpO1xuXHRcdFx0aWYgKGRyYWdnZWRIZWFkZXIpIHtcblx0XHRcdFx0aWYgKHRhcmdldEVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRSZWYgPSB0aGlzLmhlYWRlclJlZk9mKHRhcmdldEVsZW1lbnQpO1xuXHRcdFx0XHRcdGlmICh0YXJnZXRSZWYgJiYgdGFyZ2V0UmVmICE9PSBkcmFnZ2VkSGVhZGVyLmlkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlbGVnYXRlLnJlb3JkZXJTZWN0aW9uKGRyYWdnZWRIZWFkZXIuaWQsIHRhcmdldFJlZiwgc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpLCBkcmFnZ2VkSGVhZGVyLmlzV29ya3NwYWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaW5UYXJnZXQgPSB0aGlzLnJlc29sdmVQaW5UYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0U2VjdG9yKTtcblx0XHRcdGlmIChwaW5UYXJnZXQpIHtcblx0XHRcdFx0dGhpcy5kZWxlZ2F0ZS5waW5TZXNzaW9ucyhwaW5UYXJnZXQuc2Vzc2lvbnMsIHBpblRhcmdldC50YXJnZXQsIHBpblRhcmdldC5wb3NpdGlvbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWRkVG9Hcm91cFRhcmdldCA9IHRoaXMucmVzb2x2ZUFkZFRvR3JvdXBUYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0U2VjdG9yKTtcblx0XHRcdGlmIChhZGRUb0dyb3VwVGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMuZGVsZWdhdGUuYWRkU2Vzc2lvbnNUb0dyb3VwKGFkZFRvR3JvdXBUYXJnZXQuc2Vzc2lvbnMsIGFkZFRvR3JvdXBUYXJnZXQuZ3JvdXBJZCwgYWRkVG9Hcm91cFRhcmdldC50YXJnZXQsIGFkZFRvR3JvdXBUYXJnZXQucG9zaXRpb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMucmVzb2x2ZVJlb3JkZXJUYXJnZXQoZGF0YSwgdGFyZ2V0RWxlbWVudCk7XG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRlbGVnYXRlLnJlb3JkZXIodGhpcy5kcmFnZ2VkU2Vzc2lvbnMoZGF0YSksIHRhcmdldCwgc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXREcm9wVGFyZ2V0SGVhZGVyKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkhlYWRlckRyYWdPdmVyKGRyYWdnZWRIZWFkZXI6IElEcmFnZ2VkSGVhZGVyLCB0YXJnZXRFbGVtZW50OiBTZXNzaW9uTGlzdEl0ZW0gfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQpOiBib29sZWFuIHwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRpZiAoIXRhcmdldEVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0UmVmID0gdGhpcy5oZWFkZXJSZWZPZih0YXJnZXRFbGVtZW50KTtcblx0XHRpZiAoIXRhcmdldFJlZiB8fCB0YXJnZXRSZWYgPT09IGRyYWdnZWRIZWFkZXIuaWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBzZWN0b3JUb1Bvc2l0aW9uKHRhcmdldFNlY3Rvcik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjY2VwdDogdHJ1ZSxcblx0XHRcdGVmZmVjdDoge1xuXHRcdFx0XHR0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUsXG5cdFx0XHRcdHBvc2l0aW9uOiBwb3NpdGlvbiA9PT0gJ2FmdGVyJyA/IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkFmdGVyIDogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQmVmb3JlLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlUGluVGFyZ2V0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCk6IElTZXNzaW9uTWVtYmVyc2hpcERyb3BUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGFyZ2V0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbih0YXJnZXRFbGVtZW50KSkge1xuXHRcdFx0aWYgKHRhcmdldEVsZW1lbnQuaWQgIT09ICdwaW5uZWQnKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1Nlc3Npb25JdGVtKHRhcmdldEVsZW1lbnQpICYmIHRoaXMuZGVsZWdhdGUuaXNTZXNzaW9uUGlubmVkKHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHR0YXJnZXQgPSB0YXJnZXRFbGVtZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWQgPSB0aGlzLmRyYWdnZWRTZXNzaW9ucyhkYXRhKTtcblx0XHRjb25zdCBoYXNBcmNoaXZlZCA9IGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0Y29uc3QgYWxsUGlubmVkID0gZHJhZ2dlZC5ldmVyeShzZXNzaW9uID0+IHRoaXMuZGVsZWdhdGUuaXNTZXNzaW9uUGlubmVkKHNlc3Npb24pKTtcblx0XHRpZiAoZHJhZ2dlZC5sZW5ndGggPT09IDAgfHwgaGFzQXJjaGl2ZWQgfHwgYWxsUGlubmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ICYmIGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSB0YXJnZXQuc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25zOiBkcmFnZ2VkLFxuXHRcdFx0aGVhZGVyOiB7IGtpbmQ6ICdzZWN0aW9uJywgaWQ6ICdwaW5uZWQnIH0sXG5cdFx0XHR0YXJnZXQsXG5cdFx0XHRwb3NpdGlvbjogdGFyZ2V0ID8gc2VjdG9yVG9Qb3NpdGlvbih0YXJnZXRTZWN0b3IpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVBZGRUb0dyb3VwVGFyZ2V0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCk6IElTZXNzaW9uQWRkVG9Hcm91cERyb3BUYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGFyZ2V0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGdyb3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdGFyZ2V0OiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHRncm91cElkID0gdGFyZ2V0RWxlbWVudC5ncm91cC5pZDtcblx0XHR9IGVsc2UgaWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKHRhcmdldEVsZW1lbnQpICYmIHRhcmdldEVsZW1lbnQuc2VjdGlvbklkLnN0YXJ0c1dpdGgoJ2dyb3VwOicpKSB7XG5cdFx0XHRncm91cElkID0gdGFyZ2V0RWxlbWVudC5zZWN0aW9uSWQuc2xpY2UoJ2dyb3VwOicubGVuZ3RoKTtcblx0XHR9IGVsc2UgaWYgKGlzU2Vzc2lvbkl0ZW0odGFyZ2V0RWxlbWVudCkpIHtcblx0XHRcdGdyb3VwSWQgPSB0aGlzLmRlbGVnYXRlLmdldEdyb3VwSWRPZlNlc3Npb24odGFyZ2V0RWxlbWVudCk7XG5cdFx0XHR0YXJnZXQgPSBncm91cElkID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB0YXJnZXRFbGVtZW50O1xuXHRcdH1cblx0XHRpZiAoZ3JvdXBJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWQgPSB0aGlzLmRyYWdnZWRTZXNzaW9ucyhkYXRhKTtcblx0XHRjb25zdCBoYXNBcmNoaXZlZCA9IGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0Y29uc3QgYWxsSW5Hcm91cCA9IGRyYWdnZWQuZXZlcnkoc2Vzc2lvbiA9PiB0aGlzLmRlbGVnYXRlLmdldEdyb3VwSWRPZlNlc3Npb24oc2Vzc2lvbikgPT09IGdyb3VwSWQpO1xuXHRcdGlmIChkcmFnZ2VkLmxlbmd0aCA9PT0gMCB8fCBoYXNBcmNoaXZlZCB8fCBhbGxJbkdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ICYmIGRyYWdnZWQuc29tZShzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbklkID09PSB0YXJnZXQuc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25zOiBkcmFnZ2VkLFxuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdGhlYWRlcjogeyBraW5kOiAnZ3JvdXAnLCBpZDogZ3JvdXBJZCB9LFxuXHRcdFx0dGFyZ2V0LFxuXHRcdFx0cG9zaXRpb246IHRhcmdldCA/IHNlY3RvclRvUG9zaXRpb24odGFyZ2V0U2VjdG9yKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHNlc3Npb24gdGhlIGRyb3Agc2hvdWxkIGJlIHBvc2l0aW9uZWQgYWdhaW5zdCwgb3IgYHVuZGVmaW5lZGBcblx0ICogaWYgdGhlIGN1cnJlbnQgZHJhZyBpcyBub3QgYSB2YWxpZCBpbi1saXN0IHJlb3JkZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVSZW9yZGVyVGFyZ2V0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSB8IHVuZGVmaW5lZCk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRhcmdldEVsZW1lbnQgfHwgIWlzU2Vzc2lvbkl0ZW0odGFyZ2V0RWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldEVsZW1lbnQ7XG5cdFx0aWYgKCF0aGlzLmRlbGVnYXRlLmlzUmVvcmRlcmFibGUodGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZHJhZ2dlZCA9IHRoaXMuZHJhZ2dlZFNlc3Npb25zKGRhdGEpO1xuXHRcdGlmIChkcmFnZ2VkLmxlbmd0aCA9PT0gMCB8fCBkcmFnZ2VkLnNvbWUocyA9PiBzLnNlc3Npb25JZCA9PT0gdGFyZ2V0LnNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChkcmFnZ2VkLnNvbWUocyA9PiAhdGhpcy5kZWxlZ2F0ZS5pc1Jlb3JkZXJhYmxlKHMpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmRlbGVnYXRlLmNhbkRyb3BPbihkcmFnZ2VkLCB0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0cHJpdmF0ZSB0b01lbWJlcnNoaXBEcm9wUmVhY3Rpb24odGFyZ2V0OiBJU2Vzc2lvbk1lbWJlcnNoaXBEcm9wVGFyZ2V0KTogSVRyZWVEcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRsZXQgcG9zaXRpb24gPSBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5PdmVyO1xuXHRcdGlmICh0YXJnZXQucG9zaXRpb24gPT09ICdhZnRlcicpIHtcblx0XHRcdHBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXI7XG5cdFx0fSBlbHNlIGlmICh0YXJnZXQucG9zaXRpb24gPT09ICdiZWZvcmUnKSB7XG5cdFx0XHRwb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjY2VwdDogdHJ1ZSxcblx0XHRcdGVmZmVjdDoge1xuXHRcdFx0XHR0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUsXG5cdFx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBkcmFnZ2VkSGVhZGVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEpOiBJRHJhZ2dlZEhlYWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCEoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBkYXRhLmVsZW1lbnRzIGFzIFNlc3Npb25MaXN0SXRlbVtdO1xuXHRcdGNvbnN0IGdyb3VwSXRlbSA9IGVsZW1lbnRzLmZpbmQoaXNTZXNzaW9uR3JvdXBJdGVtKTtcblx0XHRpZiAoZ3JvdXBJdGVtKSB7XG5cdFx0XHRyZXR1cm4geyBpZDogYGdyb3VwOiR7Z3JvdXBJdGVtLmdyb3VwLmlkfWAsIGlzV29ya3NwYWNlOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCB3b3Jrc3BhY2VTZWN0aW9uID0gZWxlbWVudHMuZmluZCgoZSk6IGUgaXMgSVNlc3Npb25TZWN0aW9uID0+IGlzU2Vzc2lvblNlY3Rpb24oZSkgJiYgZS5pZC5zdGFydHNXaXRoKCd3b3Jrc3BhY2U6JykpO1xuXHRcdGlmICh3b3Jrc3BhY2VTZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBpZDogd29ya3NwYWNlU2VjdGlvbi5pZCwgaXNXb3Jrc3BhY2U6IHRydWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBUaGUgcmVvcmRlciBpZGVudGl0eSBvZiBhIHRvcC1sZXZlbCBoZWFkZXIgZWxlbWVudCwgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCBpcyBub3QgcmVvcmRlcmFibGUuICovXG5cdHByaXZhdGUgaGVhZGVyUmVmT2YoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYGdyb3VwOiR7ZWxlbWVudC5ncm91cC5pZH1gO1xuXHRcdH1cblx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSAmJiBlbGVtZW50LmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGRyYWdnZWRTZXNzaW9ucyhkYXRhOiBJRHJhZ0FuZERyb3BEYXRhKTogSVNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMudG9TZXNzaW9ucyhkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEgPyBkYXRhLmVsZW1lbnRzIGFzIFNlc3Npb25MaXN0SXRlbVtdIDogW10pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1Nlc3Npb25zKGVsZW1lbnRzOiBTZXNzaW9uTGlzdEl0ZW1bXSk6IElTZXNzaW9uW10ge1xuXHRcdHJldHVybiBlbGVtZW50cy5maWx0ZXIoaXNTZXNzaW9uSXRlbSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2VjdG9yVG9Qb3NpdGlvbihzZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkKTogJ2JlZm9yZScgfCAnYWZ0ZXInIHtcblx0cmV0dXJuIHNlY3RvciAhPT0gdW5kZWZpbmVkICYmIHNlY3RvciA+PSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NID8gJ2FmdGVyJyA6ICdiZWZvcmUnO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlc3Npb25zIExpc3QgQ29udHJvbFxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc0xpc3RDb250cm9sT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+O1xuXHRyZWFkb25seSBncm91cGluZzogKCkgPT4gU2Vzc2lvbnNHcm91cGluZztcblx0cmVhZG9ubHkgc29ydGluZzogKCkgPT4gU2Vzc2lvbnNTb3J0aW5nO1xuXHRyZWFkb25seSBmaW5kV2lkZ2V0Q29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdG9uU2Vzc2lvbk9wZW4ocmVzb3VyY2U6IFVSSSwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgc2lkZUJ5U2lkZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgVXNlIHtAbGluayBJU2Vzc2lvbnNMaXN0Q29udHJvbE9wdGlvbnN9IGluc3RlYWQuXG4gKi9cbmV4cG9ydCB0eXBlIElTZXNzaW9uc0xpc3RPcHRpb25zID0gSVNlc3Npb25zTGlzdENvbnRyb2xPcHRpb25zO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uc0xpc3Qge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGU6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRPcGVuU3RhdGU6IEV2ZW50PGJvb2xlYW4+O1xuXHRyZWZyZXNoKCk6IHZvaWQ7XG5cdHJldmVhbChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzZXNzaW9ucyBjdXJyZW50bHkgdmlzaWJsZSBpbiB0aGUgbGlzdCwgaW4gZGlzcGxheSBvcmRlci5cblx0ICogU2Vzc2lvbnMgaGlkZGVuIGJ5IHNlY3Rpb24gY2FwcGluZyAoXCJzaG93IG1vcmVcIikgYXJlIGV4Y2x1ZGVkLlxuXHQgKi9cblx0Z2V0VmlzaWJsZVNlc3Npb25zKCk6IHJlYWRvbmx5IElTZXNzaW9uW107XG5cdGNsZWFyRm9jdXMoKTogdm9pZDtcblx0aGFzRm9jdXNPclNlbGVjdGlvbigpOiBib29sZWFuO1xuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkO1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkO1xuXHRmb2N1cygpOiB2b2lkO1xuXHR1cGRhdGUoZXhwYW5kQWxsPzogYm9vbGVhbik6IHZvaWQ7XG5cdG9wZW5GaW5kKCk6IHZvaWQ7XG5cdGNsb3NlRmluZCgpOiB2b2lkO1xuXHRyZXNldFNlY3Rpb25Db2xsYXBzZVN0YXRlKCk6IHZvaWQ7XG5cdHBpblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkO1xuXHR1bnBpblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkO1xuXHRpc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuO1xuXHRzZXRTZXNzaW9uVHlwZUV4Y2x1ZGVkKHNlc3Npb25UeXBlSWQ6IHN0cmluZywgZXhjbHVkZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXHRpc1Nlc3Npb25UeXBlRXhjbHVkZWQoc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogYm9vbGVhbjtcblx0c2V0U3RhdHVzRXhjbHVkZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBleGNsdWRlZDogYm9vbGVhbik6IHZvaWQ7XG5cdGlzU3RhdHVzRXhjbHVkZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogYm9vbGVhbjtcblx0c2V0RXhjbHVkZUFyY2hpdmVkKGV4Y2x1ZGU6IGJvb2xlYW4pOiB2b2lkO1xuXHRpc0V4Y2x1ZGVBcmNoaXZlZCgpOiBib29sZWFuO1xuXHRzZXRFeGNsdWRlUmVhZChleGNsdWRlOiBib29sZWFuKTogdm9pZDtcblx0aXNFeGNsdWRlUmVhZCgpOiBib29sZWFuO1xuXHRyZXNldEZpbHRlcnMoKTogdm9pZDtcblx0c2V0V29ya3NwYWNlR3JvdXBDYXBwZWQoY2FwcGVkOiBib29sZWFuKTogdm9pZDtcblx0aXNXb3Jrc3BhY2VHcm91cENhcHBlZCgpOiBib29sZWFuO1xuXHRzZXRPcGVuV2luZG93U291cmNlRm9sZGVyKGZvbGRlcjogVVJJIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0Y29sbGFwc2VBbGxTZWN0aW9ucygpOiB2b2lkO1xuXHRjcmVhdGVHcm91cEZyb21TZXNzaW9ucyhzZXNzaW9uczogSVNlc3Npb25bXSk6IHZvaWQ7XG5cdGJlZ2luUmVuYW1lR3JvdXAoZ3JvdXBJZDogc3RyaW5nKTogdm9pZDtcblx0YWRkU2Vzc2lvbnNUb0dyb3VwKHNlc3Npb25zOiBJU2Vzc2lvbltdLCBncm91cElkOiBzdHJpbmcsIHRhcmdldD86IElTZXNzaW9uLCBwb3NpdGlvbj86ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IHZvaWQ7XG5cdGdldEdyb3Vwc0luRGlzcGxheU9yZGVyKCk6IElTZXNzaW9uR3JvdXBbXTtcbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25zTGlzdCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNMaXN0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSA9ICdzZXNzaW9uc0xpc3RDb250cm9sLnNlY3Rpb25Db2xsYXBzZVN0YXRlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRVhDTFVERURfVFlQRVNfS0VZID0gJ3Nlc3Npb25zTGlzdENvbnRyb2wuZXhjbHVkZWRTZXNzaW9uVHlwZXMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFWENMVURFRF9TVEFUVVNFU19LRVkgPSAnc2Vzc2lvbnNMaXN0Q29udHJvbC5leGNsdWRlZFN0YXR1c2VzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRVhDTFVERV9BUkNISVZFRF9LRVkgPSAnc2Vzc2lvbnNMaXN0Q29udHJvbC5leGNsdWRlQXJjaGl2ZWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFWENMVURFX1JFQURfS0VZID0gJ3Nlc3Npb25zTGlzdENvbnRyb2wuZXhjbHVkZVJlYWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBXT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSA9ICdzZXNzaW9uc0xpc3RDb250cm9sLndvcmtzcGFjZUdyb3VwQ2FwcGVkJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9TRVNTSU9OX0dST1VQX0xJTUlUID0gNTtcblxuXHQvKipcblx0ICogRXhwZXJpbWVudCB0cmVhdG1lbnQgdGhhdCBvdmVycmlkZXMgaG93IG1hbnkgc2Vzc2lvbnMgYXJlIHNob3duIHBlciBncm91cFxuXHQgKiBiZWZvcmUgdGhlIFwic2hvdyBtb3JlXCIgYWZmb3JkYW5jZSBhcHBlYXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTl9HUk9VUF9MSU1JVF9UUkVBVE1FTlQgPSAnc2Vzc2lvbnMud29ya3NwYWNlR3JvdXBMaW1pdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlOiBXb3JrYmVuY2hPYmplY3RUcmVlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT47XG5cdHByaXZhdGUgc2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uU2Vzc2lvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25bXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHZpc2libGUgPSB0cnVlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4Y2x1ZGVkU2Vzc2lvblR5cGVzOiBTZXQ8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBleGNsdWRlZFN0YXR1c2VzOiBTZXQ8U2Vzc2lvblN0YXR1cz47XG5cdHByaXZhdGUgX2V4Y2x1ZGVBcmNoaXZlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfZXhjbHVkZVJlYWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgd29ya3NwYWNlR3JvdXBDYXBwZWQ6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIE1heGltdW0gbnVtYmVyIG9mIHNlc3Npb25zIHNob3duIHBlciB3b3Jrc3BhY2Ugc2VjdGlvbiBvciB1c2VyIGdyb3VwLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uR3JvdXBMaW1pdCA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KHRoaXMsIFNlc3Npb25zTGlzdC5ERUZBVUxUX1NFU1NJT05fR1JPVVBfTElNSVQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4cGFuZGVkU2Vzc2lvbkdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIGV4cGFuZGVkTW9yZUZvbGRlcnMgPSBmYWxzZTtcblx0cHJpdmF0ZSBvcGVuV2luZG93U291cmNlRm9sZGVyOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGFzRmluZFBhdHRlcm4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzdXNwZW5kQ29sbGFwc2VTdGF0ZVBlcnNpc3RlbmNlID0gZmFsc2U7XG5cblx0LyoqIFRoZSBncm91cCB3aG9zZSBoZWFkZXIgaXMgY3VycmVudGx5IHNob3dpbmcgaXRzIGlubGluZSBuYW1lIGVkaXRvci4gKi9cblx0cHJpdmF0ZSBfZWRpdGluZ0dyb3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZ3JvdXBSZW5kZXJlciE6IFNlc3Npb25Hcm91cFJlbmRlcmVyO1xuXHRwcml2YXRlIF9zZWN0aW9uUmVuZGVyZXIhOiBTZXNzaW9uU2VjdGlvblJlbmRlcmVyO1xuXHRwcml2YXRlIF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UhOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xuXHRwcml2YXRlIF9kcm9wVGFyZ2V0SGVhZGVyOiBJU2Vzc2lvbkRyb3BUYXJnZXRIZWFkZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNuYXBzaG90IG9mIHRoZSBjdXJyZW50bHktcmVuZGVyZWQgcmVvcmRlcmFibGUgdG9wLWxldmVsIGhlYWRlcnMgKGdyb3Vwc1xuXHQgKiBhbmQsIGluIHdvcmtzcGFjZSBtb2RlLCB3b3Jrc3BhY2Ugc2VjdGlvbnMpIGluIGRpc3BsYXkgb3JkZXIsIGJ5IHJlb3JkZXJcblx0ICogaWRlbnRpdHkuIENhcHR1cmVkIGVhY2ggcmVuZGVyIGFuZCB1c2VkIGFzIHRoZSBiYXNpcyBmb3IgZHJhZy1yZW9yZGVyIG1hdGguXG5cdCAqL1xuXHRwcml2YXRlIF90b3BMZXZlbE9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkVXBkYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRPcGVuU3RhdGU6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlLmV2ZW50O1xuXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMubGlzdENvbnRhaW5lcjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJU2Vzc2lvbnNMaXN0Q29udHJvbE9wdGlvbnMsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUN1c3RvbVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tVmlld1NlcnZpY2U6IElDdXN0b21WaWV3U2VydmljZSxcblx0XHRASVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2U6IElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uR3JvdXBzU2VydmljZTogSVNlc3Npb25Hcm91cHNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2U6IElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZSxcblx0XHRASUFnZW50SG9zdEZpbHRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0RmlsdGVyU2VydmljZTogSUFnZW50SG9zdEZpbHRlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQXV0b21hdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uU2VydmljZTogSUF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdEBJVm9pY2VQbGF5YmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlzdFZvaWNlUGxheWJhY2tTZXJ2aWNlOiBJVm9pY2VQbGF5YmFja1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBMb2FkIGV4Y2x1ZGVkIHNlc3Npb24gdHlwZXMgZnJvbSBzdG9yYWdlXG5cdFx0dGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcyA9IHRoaXMubG9hZEV4Y2x1ZGVkU2Vzc2lvblR5cGVzKCk7XG5cblx0XHQvLyBMb2FkIGV4Y2x1ZGVkIHN0YXR1c2VzIGZyb20gc3RvcmFnZVxuXHRcdHRoaXMuZXhjbHVkZWRTdGF0dXNlcyA9IHRoaXMubG9hZEV4Y2x1ZGVkU3RhdHVzZXMoKTtcblxuXHRcdC8vIExvYWQgYXJjaGl2ZWQvcmVhZCBmaWx0ZXIgc3RhdGVcblx0XHR0aGlzLl9leGNsdWRlQXJjaGl2ZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oU2Vzc2lvbnNMaXN0LkVYQ0xVREVfQVJDSElWRURfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgdHJ1ZSk7XG5cdFx0dGhpcy5fZXhjbHVkZVJlYWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oU2Vzc2lvbnNMaXN0LkVYQ0xVREVfUkVBRF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBmYWxzZSk7XG5cdFx0dGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihTZXNzaW9uc0xpc3QuV09SS1NQQUNFX0dST1VQX0NBUFBFRF9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB0cnVlKTtcblxuXHRcdHRoaXMubGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2Vzc2lvbnMtbGlzdC1jb250cm9sJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5saXN0Q29udGFpbmVyLCBET00uRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoU0VTU0lPTl9TRUNUSU9OX0ZPQ1VTX0ZST01fUE9JTlRFUl9DTEFTUyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5saXN0Q29udGFpbmVyLm93bmVyRG9jdW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sICgpID0+IHtcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFNFU1NJT05fU0VDVElPTl9GT0NVU19GUk9NX1BPSU5URVJfQ0xBU1MpO1xuXHRcdH0sIHRydWUpKTtcblxuXHRcdGNvbnN0IGFwcHJvdmFsTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsKSk7XG5cdFx0Y29uc3QgbWFya2Rvd25SZW5kZXJlclNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaG92ZXJTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElIb3ZlclNlcnZpY2UpKTtcblx0XHRjb25zdCBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSkpO1xuXHRcdHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTtcblx0XHQvLyBSZS1yZW5kZXIgc28gdGhlIGFsd2F5cy12aXNpYmxlIFwiQ2hhdHNcIiBzZWN0aW9uIGFwcGVhcnMvZGlzYXBwZWFycyB3aGVuIGFcblx0XHQvLyBxdWljay1jaGF0LWNhcGFibGUgcHJvdmlkZXIgaXMgKGRlKXJlZ2lzdGVyZWQgKGUuZy4gYWdlbnQgaG9zdCB0b2dnbGVkKSxcblx0XHQvLyBvciB3aGVuIGEgcmVnaXN0ZXJlZCBwcm92aWRlciB0b2dnbGVzIGEgY2FwYWJpbGl0eSBhdCBydW50aW1lIChlLmcuIGl0c1xuXHRcdC8vIGBzdXBwb3J0c1F1aWNrQ2hhdHNgIGZsaXBzIHdpdGggYWdlbnQtaG9zdCBlbmFibGVtZW50KS5cblx0XHRjb25zdCBwcm92aWRlckNhcGFiaWxpdHlMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHN1YnNjcmliZVByb3ZpZGVyQ2FwYWJpbGl0aWVzID0gKCkgPT4ge1xuXHRcdFx0cHJvdmlkZXJDYXBhYmlsaXR5TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMpIHtcblx0XHRcdFx0XHRwcm92aWRlckNhcGFiaWxpdHlMaXN0ZW5lcnMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0c3Vic2NyaWJlUHJvdmlkZXJDYXBhYmlsaXRpZXMoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoKCkgPT4ge1xuXHRcdFx0c3Vic2NyaWJlUHJvdmlkZXJDYXBhYmlsaXRpZXMoKTtcblx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oU0VTU0lPTlNfTElTVF9TSE9XX0VNUFRZX0RFRkFVTFRfR1JPVVBTX1NFVFRJTkcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZ1NldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gVEVNUE9SQVJZICgjMzIwNDgwKTogc2VlIHRoZSBub3RlIG9uIHRoZSBgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlYCBpbXBvcnQuXG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgdm9pY2VQbGF5YmFja1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVZvaWNlUGxheWJhY2tTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlbmRlcmVyID0gbmV3IFNlc3Npb25JdGVtUmVuZGVyZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGdyb3VwaW5nOiB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcsXG5cdFx0XHRcdGlzUGlubmVkOiBzID0+IHRoaXMuaXNTZXNzaW9uUGlubmVkKHMpLFxuXHRcdFx0XHRpc1JlbmRlcmVkSW5DdXN0b21Hcm91cDogcyA9PiB0aGlzLmlzUmVuZGVyZWRJbkN1c3RvbUdyb3VwKHMpLFxuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbnM6IHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMsXG5cdFx0XHRcdGdldE11bHRpU2VsZWN0ZWRTZXNzaW9uczogcyA9PiB0aGlzLmdldE11bHRpU2VsZWN0ZWRTZXNzaW9ucyhzKSxcblx0XHRcdFx0c2hvd0hvdmVyOiB0cnVlLFxuXHRcdFx0XHRhcHByb3ZhbFJvd01heExpbmVzOiBERUZBVUxUX0FQUFJPVkFMX1JPV19NQVhfTElORVMsXG5cdFx0XHRcdHRvb2xiYXJNZW51SWQ6IFNlc3Npb25JdGVtVG9vbGJhck1lbnVJZCxcblx0XHRcdFx0b25EaWRSZXF1ZXN0UmVuYW1lOiBzZXNzaW9uID0+IHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQsIHNlc3Npb24pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRhcHByb3ZhbE1vZGVsLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0c2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHR2b2ljZVBsYXliYWNrU2VydmljZSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2hvd01vcmVSZW5kZXJlciA9IG5ldyBTZXNzaW9uU2hvd01vcmVSZW5kZXJlcigpO1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVyUmVuZGVyZXIgPSBuZXcgU2Vzc2lvblBsYWNlaG9sZGVyUmVuZGVyZXIoaG92ZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBzZWxlY3RIZWFkZXIgPSAoZWxlbWVudDogSVNlc3Npb25TZWN0aW9uIHwgSVNlc3Npb25Hcm91cEl0ZW0sIGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW2VsZW1lbnRdLCBldmVudCk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtlbGVtZW50XSwgZXZlbnQpO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2VjdGlvblJlbmRlcmVyID0gbmV3IFNlc3Npb25TZWN0aW9uUmVuZGVyZXIodHJ1ZSAvKiBoaWRlU2VjdGlvbkNvdW50ICovLCBzZWxlY3RIZWFkZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGhpcy5hdXRvbWF0aW9uU2VydmljZSwgdGhpcy5hdXRvbWF0aW9uU2Vzc2lvbnMsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLmN1c3RvbVZpZXdTZXJ2aWNlKTtcblx0XHR0aGlzLl9zZWN0aW9uUmVuZGVyZXIgPSBzZWN0aW9uUmVuZGVyZXI7XG5cdFx0Y29uc3QgZ3JvdXBSZW5kZXJlciA9IG5ldyBTZXNzaW9uR3JvdXBSZW5kZXJlcih7XG5cdFx0XHRjb21taXRFZGl0OiAoZ3JvdXAsIG5hbWUpID0+IHRoaXMuY29tbWl0R3JvdXBFZGl0KGdyb3VwLCBuYW1lKSxcblx0XHRcdGNhbmNlbEVkaXQ6IGdyb3VwID0+IHRoaXMuY2FuY2VsR3JvdXBFZGl0KGdyb3VwKSxcblx0XHRcdHNlbGVjdDogc2VsZWN0SGVhZGVyLFxuXHRcdH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZ3JvdXBSZW5kZXJlciA9IGdyb3VwUmVuZGVyZXI7XG5cblx0XHQvLyBSZWFkIChkb24ndCBiaW5kKSBgSXNQaG9uZUxheW91dENvbnRleHRgIGZyb20gdGhlIHBhcmVudCBjb250ZXh0IHNvIHdlXG5cdFx0Ly8gb2JzZXJ2ZSB0aGUgd29ya2JlbmNoJ3MgdmFsdWUgcmF0aGVyIHRoYW4gc2hhZG93aW5nIGl0IHdpdGggYSBmcmVzaFxuXHRcdC8vIHNjb3BlZCBkZWZhdWx0IG9mIGBmYWxzZWAuIFRoZSByZWFjdGl2ZSBoZWlnaHQgcmVmcmVzaCBiZWxvdyBsaXN0ZW5zXG5cdFx0Ly8gb24gdGhlIHNhbWUgc2NvcGVkIHNlcnZpY2UgZm9yIGNoYW5nZXMuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgU2Vzc2lvbnNUcmVlRGVsZWdhdGUoYXBwcm92YWxNb2RlbCwgKCkgPT4gISFJc1Bob25lTGF5b3V0Q29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT4sXG5cdFx0XHQnU2Vzc2lvbnNMaXN0VHJlZScsXG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdFtcblx0XHRcdFx0c2Vzc2lvblJlbmRlcmVyLFxuXHRcdFx0XHRzZWN0aW9uUmVuZGVyZXIsXG5cdFx0XHRcdGdyb3VwUmVuZGVyZXIsXG5cdFx0XHRcdHNob3dNb3JlUmVuZGVyZXIsXG5cdFx0XHRcdHBsYWNlaG9sZGVyUmVuZGVyZXIsXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBTZXNzaW9uc0FjY2Vzc2liaWxpdHlQcm92aWRlcihzZWN0aW9uUmVuZGVyZXIuYXV0b21hdGlvblN0YXR1cywge1xuXHRcdFx0XHRcdGdyb3VwaW5nOiB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcsXG5cdFx0XHRcdFx0aXNQaW5uZWQ6IHNlc3Npb24gPT4gdGhpcy5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksXG5cdFx0XHRcdFx0aXNSZW5kZXJlZEluQ3VzdG9tR3JvdXA6IHNlc3Npb24gPT4gdGhpcy5pc1JlbmRlcmVkSW5DdXN0b21Hcm91cChzZXNzaW9uKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGRuZDogdGhpcy5fcmVnaXN0ZXIobmV3IFNlc3Npb25zTGlzdERyYWdBbmREcm9wKHtcblx0XHRcdFx0XHRpc1Jlb3JkZXJhYmxlOiBzZXNzaW9uID0+IHRoaXMuaXNSZW9yZGVyYWJsZShzZXNzaW9uKSxcblx0XHRcdFx0XHRpc1Nlc3Npb25QaW5uZWQ6IHNlc3Npb24gPT4gdGhpcy5pc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbiksXG5cdFx0XHRcdFx0Y2FuRHJvcE9uOiAoZHJhZ2dlZCwgdGFyZ2V0KSA9PiB0aGlzLmNhblJlb3JkZXJPbnRvKGRyYWdnZWQsIHRhcmdldCksXG5cdFx0XHRcdFx0cmVvcmRlcjogKGRyYWdnZWQsIHRhcmdldCwgcG9zaXRpb24pID0+IHRoaXMucmVvcmRlclNlc3Npb25zKGRyYWdnZWQsIHRhcmdldCwgcG9zaXRpb24pLFxuXHRcdFx0XHRcdGdldEdyb3VwSWRPZlNlc3Npb246IHNlc3Npb24gPT4gdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0XHRcdGFkZFNlc3Npb25zVG9Hcm91cDogKHNlc3Npb25zLCBncm91cElkLCB0YXJnZXQsIHBvc2l0aW9uKSA9PiB0aGlzLmFkZFNlc3Npb25zVG9Hcm91cChzZXNzaW9ucywgZ3JvdXBJZCwgdGFyZ2V0LCBwb3NpdGlvbiksXG5cdFx0XHRcdFx0cGluU2Vzc2lvbnM6IChzZXNzaW9ucywgdGFyZ2V0LCBwb3NpdGlvbikgPT4gdGhpcy5waW5TZXNzaW9ucyhzZXNzaW9ucywgdGFyZ2V0LCBwb3NpdGlvbiksXG5cdFx0XHRcdFx0c2V0RHJvcFRhcmdldEhlYWRlcjogaGVhZGVyID0+IHRoaXMuc2V0RHJvcFRhcmdldEhlYWRlcihoZWFkZXIpLFxuXHRcdFx0XHRcdHJlb3JkZXJTZWN0aW9uOiAoZHJhZ2dlZElkLCB0YXJnZXRJZCwgcG9zaXRpb24sIGlzV29ya3NwYWNlKSA9PiB0aGlzLnJlb3JkZXJTZWN0aW9uKGRyYWdnZWRJZCwgdGFyZ2V0SWQsIHBvc2l0aW9uLCBpc1dvcmtzcGFjZSksXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgZ3JvdXA6JHtlbGVtZW50Lmdyb3VwLmlkfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYHNlY3Rpb246JHtlbGVtZW50LmlkfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBzaG93LW1vcmU6JHtlbGVtZW50LmtpbmR9OiR7ZWxlbWVudC5tb2RlfToke2VsZW1lbnQuc2VjdGlvbklkfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uUGxhY2Vob2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBwbGFjZWhvbGRlcjoke2VsZW1lbnQuc2VjdGlvbklkfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0R3JvdXBJZDogKGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzU2Vzc2lvbkdyb3VwSXRlbShlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gTm90U2VsZWN0YWJsZUdyb3VwSWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gTm90U2VsZWN0YWJsZUdyb3VwSWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uU2hvd01vcmUoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIE5vdFNlbGVjdGFibGVHcm91cElkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBOb3RTZWxlY3RhYmxlR3JvdXBJZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdC8vIFVzZSBhIGRpc3RpbmN0IGdyb3VwIGZvciBhcmNoaXZlZCAoZG9uZSkgc2Vzc2lvbnMgc28gdGhhdFxuXHRcdFx0XHRcdFx0Ly8gbXVsdGktc2VsZWN0aW9uIGNhbm5vdCBzcGFuIHRoZSB3b3Jrc3BhY2UgYW5kIGRvbmUgc2VjdGlvbnMuXG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pc0FyY2hpdmVkLmdldCgpID8gMiA6IDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0cnVlLFxuXHRcdFx0XHRpbmRlbnQ6IDAsXG5cdFx0XHRcdGZpbmRXaWRnZXRFbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRkZWZhdWx0RmluZE1vZGU6IFRyZWVGaW5kTW9kZS5GaWx0ZXIsXG5cdFx0XHRcdGZpbmRXaWRnZXRDb250YWluZXI6IHRoaXMub3B0aW9ucy5maW5kV2lkZ2V0Q29udGFpbmVyLFxuXHRcdFx0XHRmaW5kV2lkZ2V0U3R5bGVzOiB7XG5cdFx0XHRcdFx0Li4uZGVmYXVsdEZpbmRXaWRnZXRTdHlsZXMsXG5cdFx0XHRcdFx0dG9nZ2xlU3R5bGVzOiB7XG5cdFx0XHRcdFx0XHQuLi5kZWZhdWx0VG9nZ2xlU3R5bGVzLFxuXHRcdFx0XHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6ICd0cmFuc3BhcmVudCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZWxlbWVudDogU2Vzc2lvbkxpc3RJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50Lmdyb3VwLm5hbWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5zZWN0aW9uTGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uUGxhY2Vob2xkZXIoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC50aXRsZS5nZXQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLm9wdGlvbnMub3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHRcdHR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M6ICgpID0+ICdmb3JjZS1uby10d2lzdGllJyxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpc1Nlc3Npb25TaG93TW9yZShlbGVtZW50KSkge1xuXHRcdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSAnZm9sZGVycycpIHtcblx0XHRcdFx0XHR0aGlzLmV4cGFuZGVkTW9yZUZvbGRlcnMgPSBlbGVtZW50Lm1vZGUgPT09ICdtb3JlJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoZWxlbWVudC5tb2RlID09PSAnbW9yZScpIHtcblx0XHRcdFx0XHRcdHRoaXMuZXhwYW5kZWRTZXNzaW9uR3JvdXBzLmFkZChlbGVtZW50LnNlY3Rpb25JZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuZXhwYW5kZWRTZXNzaW9uR3JvdXBzLmRlbGV0ZShlbGVtZW50LnNlY3Rpb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpc1Nlc3Npb25QbGFjZWhvbGRlcihlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNTZXNzaW9uU2VjdGlvbihlbGVtZW50KSAmJiBlbGVtZW50LmlkID09PSBBVVRPTUFUSU9OU19TRUNUSU9OX0lEKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdzZXNzaW9uc1ZpZXcubWFuYWdlQXV0b21hdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpICYmICFpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdFx0dGhpcy5tYXJrUmVhZChlbGVtZW50KTtcblx0XHRcdFx0Ly8gQSBkZWxpYmVyYXRlIGxlZnQgbW91c2UgY2xpY2sgb24gYSBzZXNzaW9uIHNob3VsZCBtb3ZlIGtleWJvYXJkXG5cdFx0XHRcdC8vIGZvY3VzIGludG8gdGhlIGNoYXQgaW5wdXQgc28gdGhlIHVzZXIgY2FuIHN0YXJ0IHR5cGluZyByaWdodFxuXHRcdFx0XHQvLyBhd2F5LiBBIHNpbmdsZSBjbGljayBhbHdheXMgcmVwb3J0cyBgcHJlc2VydmVGb2N1czogdHJ1ZWAsIHNvXG5cdFx0XHRcdC8vIGRldGVjdCB0aGUgbW91c2UgY2xpY2sgZXhwbGljaXRseS4gS2V5Ym9hcmQgbmF2aWdhdGlvbiBrZWVwc1xuXHRcdFx0XHQvLyBgcHJlc2VydmVGb2N1c2AgYXMgcmVwb3J0ZWQgc28gYnJvd3NpbmcgdGhlIGxpc3QgbmV2ZXIgc3RlYWxzXG5cdFx0XHRcdC8vIGZvY3VzIGZyb20gaXQuXG5cdFx0XHRcdGNvbnN0IGlzTGVmdENsaWNrID0gRE9NLmlzTW91c2VFdmVudChlLmJyb3dzZXJFdmVudCkgJiYgZS5icm93c2VyRXZlbnQuYnV0dG9uID09PSAwO1xuXHRcdFx0XHRjb25zdCBwcmVzZXJ2ZUZvY3VzID0gaXNMZWZ0Q2xpY2sgPyBmYWxzZSA6IChlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyA/PyBmYWxzZSk7XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5vblNlc3Npb25PcGVuKGVsZW1lbnQucmVzb3VyY2UsIHByZXNlcnZlRm9jdXMsIGUuc2lkZUJ5U2lkZSk7XG5cdFx0XHRcdC8vIElmIHRoaXMgc2Vzc2lvbiBoYXMgYW4gdW5oZWFyZCB2b2ljZSByZXNwb25zZSwgb3BlbmluZyBpdCBtYXkgbm90XG5cdFx0XHRcdC8vIGNoYW5nZSB0aGUgYWN0aXZlLXNlc3Npb24gb2JzZXJ2YWJsZSAoaXQgY2FuIGFscmVhZHkgYmUgdGhlIGFjdGl2ZVxuXHRcdFx0XHQvLyBzZXNzaW9uLCBqdXN0IG5vdCBmb2N1c2VkKSwgc28gdGhlIHZvaWNlIGNvbnRyb2xsZXIgd291bGQgbmV2ZXJcblx0XHRcdFx0Ly8gcmUtYWN0aXZhdGUgaXQuIEFzayBpdCB0byBuYXJyYXRlIHRoZSBwZW5kaW5nIGl0ZW0gZXhwbGljaXRseS5cblx0XHRcdFx0aWYgKHRoaXMuX2xpc3RWb2ljZVBsYXliYWNrU2VydmljZS5oYXNQZW5kaW5nUmVzcG9uc2UoZWxlbWVudC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfY2hhdC52b2ljZS5hY3RpdmF0ZVNlc3Npb24nLCBlbGVtZW50LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvblJlbmRlcmVyLm9uRGlkQ2hhbmdlSXRlbUhlaWdodChzZXNzaW9uID0+IHtcblx0XHRcdGlmICh0aGlzLnRyZWUuaGFzRWxlbWVudChzZXNzaW9uKSkge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlRWxlbWVudEhlaWdodChzZXNzaW9uLCBkZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlYWN0IHRvIHBob25lIDwtPiBkZXNrdG9wIHZpZXdwb3J0IHRyYW5zaXRpb25zOiByZWZyZXNoIGhlaWdodHNcblx0XHQvLyBmb3IgYWxsIGtub3duIHNlc3Npb25zIHNvIHRoZSB2aXJ0dWFsIGxpc3QgcmVzZXJ2ZXMgdGhlIGNvcnJlY3Rcblx0XHQvLyBzcGFjZSBmb3IgdGhlIG5ldyBsYXlvdXQuIEl0ZXJhdGVzIGB0aGlzLnNlc3Npb25zYCAoYWxsIGtub3duXG5cdFx0Ly8gc2Vzc2lvbnMpIFx1MjAxNCBhIHBob25lL2Rlc2t0b3AgdHJhbnNpdGlvbiBpcyBhIHJhcmUgZXZlbnQgc28gdGhlXG5cdFx0Ly8gZXh0cmEgd29yayBvdmVyIGZpbHRlcmVkLW91dCBzZXNzaW9ucyBpcyBuZWdsaWdpYmxlLiBSZWxpZXMgb25cblx0XHQvLyB0aGUgYElzUGhvbmVMYXlvdXRDb250ZXh0YCByZWFjdGl2ZSBzaWduYWwgYWxyZWFkeSBtYWludGFpbmVkIGJ5XG5cdFx0Ly8gdGhlIGFnZW50cyB3b3JrYmVuY2guXG5cdFx0Y29uc3QgcGhvbmVLZXlzID0gbmV3IFNldDxzdHJpbmc+KFtJc1Bob25lTGF5b3V0Q29udGV4dC5rZXldKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPihbQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQua2V5XSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShhdXRvbWF0aW9uS2V5cykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHRcdGlmICghZS5hZmZlY3RzU29tZShwaG9uZUtleXMpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLnNlc3Npb25zKSB7XG5cdFx0XHRcdGlmICh0aGlzLnRyZWUuaGFzRWxlbWVudChzZXNzaW9uKSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KHNlc3Npb24sIGRlbGVnYXRlLmdldEhlaWdodChzZXNzaW9uKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZShlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLm5vZGUuZWxlbWVudDtcblx0XHRcdGlmIChlbGVtZW50ICYmIGlzU2Vzc2lvbkdyb3VwSXRlbShlbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLl9ncm91cFJlbmRlcmVyLnVwZGF0ZUNvbGxhcHNlU3RhdGUoZWxlbWVudCwgZS5ub2RlLmNvbGxhcHNlZCk7XG5cdFx0XHRcdGlmICghdGhpcy5zdXNwZW5kQ29sbGFwc2VTdGF0ZVBlcnNpc3RlbmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5zYXZlU2VjdGlvbkNvbGxhcHNlU3RhdGUoYGdyb3VwOiR7ZWxlbWVudC5ncm91cC5pZH1gLCBlLm5vZGUuY29sbGFwc2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlbGVtZW50ICYmIGlzU2Vzc2lvblNlY3Rpb24oZWxlbWVudCkpIHtcblx0XHRcdFx0c2VjdGlvblJlbmRlcmVyLnVwZGF0ZUNvbGxhcHNlU3RhdGUoZWxlbWVudCwgZS5ub2RlLmNvbGxhcHNlZCk7XG5cdFx0XHRcdGlmICghdGhpcy5zdXNwZW5kQ29sbGFwc2VTdGF0ZVBlcnNpc3RlbmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5zYXZlU2VjdGlvbkNvbGxhcHNlU3RhdGUoZWxlbWVudC5pZCwgZS5ub2RlLmNvbGxhcHNlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgaXNGaW5kT3BlbiA9IGZhbHNlO1xuXHRcdGxldCBmaW5kUGF0dGVybiA9ICcnO1xuXHRcdGNvbnN0IHVwZGF0ZUZpbmRQYXR0ZXJuU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYXNGaW5kUGF0dGVybiA9IGlzRmluZE9wZW4gJiYgZmluZFBhdHRlcm4ubGVuZ3RoID4gMDtcblx0XHRcdGlmIChoYXNGaW5kUGF0dGVybiAhPT0gdGhpcy5oYXNGaW5kUGF0dGVybikge1xuXHRcdFx0XHR0aGlzLmhhc0ZpbmRQYXR0ZXJuID0gaGFzRmluZFBhdHRlcm47XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUZpbmRPcGVuU3RhdGUob3BlbiA9PiB7XG5cdFx0XHRpc0ZpbmRPcGVuID0gb3Blbjtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZS5maXJlKG9wZW4pO1xuXHRcdFx0dXBkYXRlRmluZFBhdHRlcm5TdGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIE9ubHkgdHJlYXQgdGhlIGZpbmQgYXMgXCJhY3RpdmVcIiBmb3IgbGF5b3V0IHB1cnBvc2VzIChieXBhc3Npbmcgd29ya3NwYWNlXG5cdFx0Ly8gY2FwcGluZyBhbmQgcGVyLWdyb3VwIGxpbWl0cykgb25jZSB0aGUgdXNlciBoYXMgYWN0dWFsbHkgdHlwZWQgYSBwYXR0ZXJuXG5cdFx0Ly8gYW5kIHRoZSBmaW5kIHdpZGdldCBpcyBvcGVuLiBPcGVuaW5nIHRoZSBlbXB0eSBmaW5kIHdpZGdldCBzaG91bGQgbm90XG5cdFx0Ly8gcmVvcmRlciB0aGUgbGlzdCwgYW5kIGNsb3NpbmcgZmluZCBzaG91bGQgcmVzdG9yZSB0aGUgY2FwcGVkIGxheW91dC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VGaW5kUGF0dGVybihwYXR0ZXJuID0+IHtcblx0XHRcdGZpbmRQYXR0ZXJuID0gcGF0dGVybjtcblx0XHRcdHVwZGF0ZUZpbmRQYXR0ZXJuU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQSByZW1vdmVkIHNlc3Npb24gbWF5IGhhdmUgYmVlbiB0aGUgbGFzdCBvbmUgaW4gaXRzIHdvcmtzcGFjZS5cblx0XHRcdC8vIEdhcmJhZ2UtY29sbGVjdCBtYW51YWwgb3JkZXIgLyBwcm9tb3Rpb24gZW50cmllcyBmb3IgaWRlbnRpdGllc1xuXHRcdFx0Ly8gdGhhdCBubyBsb25nZXIgZXhpc3QuIFRoaXMgcnVucyBvbmx5IG9uIHJlbW92YWxzIChuZXZlciBvblxuXHRcdFx0Ly8gYWRkaXRpb25zIG9yIHRoZSBpbml0aWFsIGxvYWQpIHNvIHRoYXQgYXN5bmNocm9ub3VzIHNlc3Npb25cblx0XHRcdC8vIGxvYWRpbmcgb24gYSB3aW5kb3cgcmVsb2FkIGNhbiBuZXZlciBwcnVuZSB0aGUgdXNlcidzIG1hbnVhbFxuXHRcdFx0Ly8gb3JkZXJpbmcgb2Ygd29ya3NwYWNlcyByZWxhdGl2ZSB0byBncm91cHMgYmVmb3JlIHRoZWlyIHNlc3Npb25zXG5cdFx0XHQvLyBoYXZlIGxvYWRlZC5cblx0XHRcdGlmIChlLnJlbW92ZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5yZXRhaW4odGhpcy5saXZlU2VjdGlvbk9yZGVySWRzKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2Uub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBHYXJiYWdlLWNvbGxlY3QgbWFudWFsIG9yZGVyIC8gcHJvbW90aW9uIGVudHJpZXMgd2hlbiBncm91cHMgYXJlXG5cdFx0XHQvLyBkZWxldGVkLiBHcm91cCBjaGFuZ2VzIGFyZSB1c2VyLWRyaXZlbiBhbmQgaGFwcGVuIGFmdGVyXG5cdFx0XHQvLyBzZXNzaW9ucyBoYXZlIGxvYWRlZCwgc28gcHJ1bmluZyBoZXJlIGlzIHNhZmUgKHVubGlrZSBhdCByZW5kZXJcblx0XHRcdC8vIHRpbWUgZHVyaW5nIHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbCBsb2FkKS5cblx0XHRcdGlmIChlLmdyb3Vwc0NoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UucmV0YWluKHRoaXMubGl2ZVNlY3Rpb25PcmRlcklkcygpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRIb3N0RmlsdGVyU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGNoYW5nZXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc29sdmUgdGhlIHBlci1ncm91cCBzZXNzaW9uIGxpbWl0IGZyb20gdGhlIGV4cGVyaW1lbnQgc2VydmljZSBhbmRcblx0XHQvLyBrZWVwIGl0IGN1cnJlbnQgd2hlbiB0cmVhdG1lbnRzIGFyZSByZWZldGNoZWQuIFRoZSBhc3luYyBmZXRjaCBpc1xuXHRcdC8vIGNvbmZpbmVkIHRvIGB1cGRhdGVTZXNzaW9uR3JvdXBMaW1pdGA7IHRoZSByZXN0IG9mIHRoZSBsaXN0IHJlYWRzIHRoZVxuXHRcdC8vIHJlc29sdmVkIHZhbHVlIHN5bmNocm9ub3VzbHkgb2ZmIGBzZXNzaW9uR3JvdXBMaW1pdGAuIFRoZSBhdXRvcnVuIHJ1bnNcblx0XHQvLyBpbW1lZGlhdGVseSBmb3IgdGhlIGluaXRpYWwgZmV0Y2ggYW5kIGFnYWluIHdoZW5ldmVyIHRyZWF0bWVudHMgcmVmZXRjaC5cblx0XHRjb25zdCBhc3NpZ25tZW50UmVmZXRjaFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5hc3NpZ25tZW50U2VydmljZS5vbkRpZFJlZmV0Y2hBc3NpZ25tZW50cyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0YXNzaWdubWVudFJlZmV0Y2hTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy51cGRhdGVTZXNzaW9uR3JvdXBMaW1pdCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZldGNoZXMgdGhlIHNlc3Npb24gZ3JvdXAgbGltaXQgdHJlYXRtZW50IGFuZCB1cGRhdGVzIHRoZSBiYWNraW5nXG5cdCAqIG9ic2VydmFibGUuIEludmFsaWQgb3IgdW5zZXQgdHJlYXRtZW50cyBmYWxsIGJhY2sgdG8gdGhlIGRlZmF1bHQgbGltaXQuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNlc3Npb25Hcm91cExpbWl0KCk6IHZvaWQge1xuXHRcdHRoaXMuYXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PG51bWJlcj4oU2Vzc2lvbnNMaXN0LlNFU1NJT05fR1JPVVBfTElNSVRfVFJFQVRNRU5UKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdGNvbnN0IGxpbWl0ID0gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+IDBcblx0XHRcdFx0PyB2YWx1ZVxuXHRcdFx0XHQ6IFNlc3Npb25zTGlzdC5ERUZBVUxUX1NFU1NJT05fR1JPVVBfTElNSVQ7XG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uR3JvdXBMaW1pdC5nZXQoKSAhPT0gbGltaXQpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uR3JvdXBMaW1pdC5zZXQobGltaXQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnMgPSB0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25zKCk7XG5cdFx0dGhpcy5hdXRvbWF0aW9uU2Vzc2lvbnMuc2V0KHRoaXMuc2Vzc2lvbnMsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuc2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5taWdyYXRlTGVnYWN5UmVhZFN0YXRlKHNlc3Npb24pO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKGV4cGFuZEFsbD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cblx0XHQvLyBGaWx0ZXIgYnkgc2Vzc2lvbiB0eXBlIGFuZCBzdGF0dXNcblx0XHRsZXQgZmlsdGVyZWQgPSB0aGlzLnNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+ICFpc0F1dG9tYXRpb25TZXNzaW9uKHNlc3Npb24pKTtcblx0XHRjb25zdCBob3N0RmlsdGVyID0gdGhpcy5fYWdlbnRIb3N0RmlsdGVyU2VydmljZS5zZWxlY3RlZFByb3ZpZGVySWQ7XG5cdFx0aWYgKGhvc3RGaWx0ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZmlsdGVyZWQgPSBmaWx0ZXJlZC5maWx0ZXIocyA9PiBzLnByb3ZpZGVySWQgPT09IGhvc3RGaWx0ZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5zaXplID4gMCkge1xuXHRcdFx0ZmlsdGVyZWQgPSBmaWx0ZXJlZC5maWx0ZXIocyA9PiAhdGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5oYXMocy5zZXNzaW9uVHlwZSkpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leGNsdWRlZFN0YXR1c2VzLnNpemUgPiAwKSB7XG5cdFx0XHRmaWx0ZXJlZCA9IGZpbHRlcmVkLmZpbHRlcihzID0+ICF0aGlzLmV4Y2x1ZGVkU3RhdHVzZXMuaGFzKHMuc3RhdHVzLmdldCgpKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9leGNsdWRlQXJjaGl2ZWQpIHtcblx0XHRcdGZpbHRlcmVkID0gZmlsdGVyZWQuZmlsdGVyKHMgPT4gIXMuaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9leGNsdWRlUmVhZCkge1xuXHRcdFx0ZmlsdGVyZWQgPSBmaWx0ZXJlZC5maWx0ZXIocyA9PiAhcy5pc1JlYWQuZ2V0KCkpO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgdGhlIGFjdGl2ZSB1c2VyLWZhY2luZyBzZXNzaW9uIHZpc2libGUgZXZlbiB3aGVuIGFub3RoZXIgZmlsdGVyIGV4Y2x1ZGVzIGl0LlxuXHRcdGlmIChhY3RpdmVTZXNzaW9uICYmICFmaWx0ZXJlZC5zb21lKHMgPT4gcy5zZXNzaW9uSWQgPT09IGFjdGl2ZVNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLnNlc3Npb25zLmZpbmQocyA9PiBzLnNlc3Npb25JZCA9PT0gYWN0aXZlU2Vzc2lvbi5zZXNzaW9uSWQgJiYgIWlzQXV0b21hdGlvblNlc3Npb24ocykpO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdGZpbHRlcmVkID0gWy4uLmZpbHRlcmVkLCBtYXRjaF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXBpbmcgPSB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcoKTtcblx0XHRjb25zdCBzb3J0aW5nID0gdGhpcy5vcHRpb25zLnNvcnRpbmcoKTtcblx0XHRjb25zdCBzb3J0S2V5Rm9yR3JvdXBpbmcgPSAoczogSVNlc3Npb24sIHNydDogU2Vzc2lvbnNTb3J0aW5nKSA9PiB0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuZ2V0U29ydEtleShzLCBzb3J0aW5nVG9Nb2RlKHNydCkpO1xuXG5cdFx0Ly8gUHVsbCByZWd1bGFyIChub24tcGlubmVkLCBub24tYXJjaGl2ZWQpIGdyb3VwZWQgc2Vzc2lvbnMgb3V0IG9mIHRoZVxuXHRcdC8vIG5vcm1hbCBkYXRlL3dvcmtzcGFjZSBzZWN0aW9uaW5nIHNvIHRoZXkgcmVuZGVyIHVuZGVyIHRoZWlyIGdyb3VwLlxuXHRcdC8vIFBpbm5lZCBhbmQgYXJjaGl2ZWQgc2Vzc2lvbnMga2VlcCB0aGVpciBwcmVjZWRlbmNlIGFuZCBzdGF5IGluIHRoZWlyXG5cdFx0Ly8gc2VjdGlvbnMgZXZlbiB3aGVuIHRoZXkgYmVsb25nIHRvIGEgZ3JvdXAgKHRoZWlyIG1lbWJlcnNoaXAgaXNcblx0XHQvLyByZXRhaW5lZCBzbyB0aGV5IHJldHVybiB0byB0aGUgZ3JvdXAgb25jZSB1bnBpbm5lZC9yZXN0b3JlZCkuXG5cdFx0Y29uc3QgZ3JvdXBlZE1lbWJlcnMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb25bXT4oKTtcblx0XHRjb25zdCBncm91cGVkUmVndWxhcklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcyBvZiBmaWx0ZXJlZCkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmdldFJlbmRlcmVkU2Vzc2lvbkdyb3VwKHMpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGxldCBtZW1iZXJzID0gZ3JvdXBlZE1lbWJlcnMuZ2V0KGdyb3VwLmlkKTtcblx0XHRcdFx0aWYgKCFtZW1iZXJzKSB7XG5cdFx0XHRcdFx0bWVtYmVycyA9IFtdO1xuXHRcdFx0XHRcdGdyb3VwZWRNZW1iZXJzLnNldChncm91cC5pZCwgbWVtYmVycyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWVtYmVycy5wdXNoKHMpO1xuXHRcdFx0XHRncm91cGVkUmVndWxhcklkcy5hZGQocy5zZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBmb3JTZWN0aW9ucyA9IGdyb3VwZWRSZWd1bGFySWRzLnNpemUgPiAwID8gZmlsdGVyZWQuZmlsdGVyKHMgPT4gIWdyb3VwZWRSZWd1bGFySWRzLmhhcyhzLnNlc3Npb25JZCkpIDogZmlsdGVyZWQ7XG5cblx0XHQvLyBCdWlsZCB0aGUgZ3JvdXAgYmxvY2tzIHdpdGggbWVtYmVycyBzb3J0ZWQgYnkgdGhlIG5vcm1hbCBzb3J0IGxvZ2ljLlxuXHRcdC8vIEdyb3VwcyBhcmUgZnVsbHkgdXNlci1tYW5hZ2VkOiB0aGVpciBvcmRlciBpcyBvd25lZCBieSB0aGUgc2VjdGlvbi1vcmRlclxuXHRcdC8vIHNlcnZpY2UgKGRlZmF1bHRpbmcgdG8gbmV3ZXN0LWZpcnN0KSwgaW5kZXBlbmRlbnQgb2YgdGhlaXIgbWVtYmVycydcblx0XHQvLyByZWNlbmN5LCBhbmQgaXMgc2hhcmVkIGFjcm9zcyBib3RoIGdyb3VwaW5nIG1vZGVzLlxuXHRcdGNvbnN0IGdyb3VwSXRlbXNCeUlkID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uR3JvdXBJdGVtPigpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKCkpIHtcblx0XHRcdGNvbnN0IG1lbWJlcnMgPSBncm91cGVkTWVtYmVycy5nZXQoZ3JvdXAuaWQpID8/IFtdO1xuXHRcdFx0Y29uc3Qgc29ydGVkTWVtYmVycyA9IHNvcnRTZXNzaW9ucyhtZW1iZXJzLCBzb3J0aW5nLCBzb3J0S2V5Rm9yR3JvdXBpbmcpO1xuXHRcdFx0Z3JvdXBJdGVtc0J5SWQuc2V0KGdyb3VwLmlkLCB7XG5cdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRzZXNzaW9uczogc29ydGVkTWVtYmVycyxcblx0XHRcdFx0aXNFbXB0eTogdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0U2Vzc2lvbklkc0luR3JvdXAoZ3JvdXAuaWQpLmxlbmd0aCA9PT0gMCxcblx0XHRcdFx0ZWRpdGluZzogZ3JvdXAuaWQgPT09IHRoaXMuX2VkaXRpbmdHcm91cElkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlZmF1bHRHcm91cElkcyA9IFsuLi5ncm91cEl0ZW1zQnlJZC52YWx1ZXMoKV1cblx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLmdyb3VwLmNyZWF0ZWRBdCAtIGEuZ3JvdXAuY3JlYXRlZEF0KVxuXHRcdFx0Lm1hcChpdGVtID0+IGBncm91cDoke2l0ZW0uZ3JvdXAuaWR9YCk7XG5cblx0XHRjb25zdCBzZWN0aW9ucyA9IGdyb3VwU2Vzc2lvbnNGb3JMaXN0KGZvclNlY3Rpb25zLCBncm91cGluZywgc29ydGluZywgc2Vzc2lvbiA9PiB0aGlzLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKSwgKHMsIHNydCkgPT4gdGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmdldFNvcnRLZXkocywgc29ydGluZ1RvTW9kZShzcnQpKSwgZ2V0Q2hhdFNlc3Npb25BcmNoaXZlZFNlY3Rpb25MYWJlbChnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSk7XG5cblx0XHRjb25zdCBoYXNSZWNlbnRTZXNzaW9ucyA9IHNlY3Rpb25zLnNvbWUocyA9PiBzLmlkID09PSAncmVjZW50JyAmJiBzLnNlc3Npb25zLmxlbmd0aCA+IDApO1xuXG5cdFx0Ly8gS2VlcCB0aGUgXCJDaGF0c1wiIGRlZmF1bHQgc2VjdGlvbiB2aXNpYmxlIGV2ZW4gd2hlbiBlbXB0eSBzbyBpdCBzdGF5c1xuXHRcdC8vIGRpc2NvdmVyYWJsZSwgdW5sZXNzIHRoZSB1c2VyIG9wdHMgb3V0IHZpYSB0aGUgc2V0dGluZy4gVGhlIFwiUGlubmVkXCJcblx0XHQvLyBzZWN0aW9uIGlzIG9ubHkgc2hvd24gd2hlbiBpdCBhY3R1YWxseSBoYXMgcGlubmVkIHNlc3Npb25zLlxuXHRcdGNvbnN0IHNob3dFbXB0eURlZmF1bHRHcm91cHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFNFU1NJT05TX0xJU1RfU0hPV19FTVBUWV9ERUZBVUxUX0dST1VQU19TRVRUSU5HKTtcblxuXHRcdC8vIEtlZXAgdGhlIFwiQ2hhdHNcIiBzZWN0aW9uIGFsd2F5cyB2aXNpYmxlIChldmVuIHdpdGggbm8gcXVpY2sgY2hhdHMpIHNvIGl0c1xuXHRcdC8vIGhlYWRlciBcdTIwMTQgbGVhZGluZyBjaGF0IGljb24sIGxhYmVsLCBhbmQgdGhlIFwiK1wiIGNyZWF0ZSBhY3Rpb24gXHUyMDE0IGlzIGFsd2F5c1xuXHRcdC8vIHJlYWNoYWJsZS4gT25seSB3aGVuIGEgcHJvdmlkZXIgY2FuIGFjdHVhbGx5IHNlcnZlIHF1aWNrIGNoYXRzLlxuXHRcdGlmIChzaG93RW1wdHlEZWZhdWx0R3JvdXBzICYmIHRoaXMuX3NvbWVQcm92aWRlclN1cHBvcnRzUXVpY2tDaGF0cygpICYmICFzZWN0aW9ucy5zb21lKHMgPT4gcy5pZCA9PT0gUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCkpIHtcblx0XHRcdHNlY3Rpb25zLnB1c2goeyBpZDogUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCwgbGFiZWw6IGxvY2FsaXplKCdjaGF0c1NlY3Rpb24nLCBcIkNoYXRzXCIpLCBzZXNzaW9uczogW10gfSk7XG5cdFx0fVxuXG5cdFx0Ly8gUGFydGl0aW9uIHdvcmtzcGFjZSBzZWN0aW9ucyBpbnRvIFwicHJpbWFyeVwiIChtZWV0cyBjcml0ZXJpYSkgYW5kIFwibW9yZVwiXG5cdFx0Ly8gd2hlbiBncm91cGluZyBieSB3b3Jrc3BhY2UuIEFuIGFjdGl2ZSBmaW5kIHBhdHRlcm4gYnlwYXNzZXMgcGFydGl0aW9uaW5nXG5cdFx0Ly8gc28gYWxsIG1hdGNoaW5nIHNlc3Npb25zIGFyZSB2aXNpYmxlLiBXaGVuIHRoZSB1c2VyIGhhcyBjaG9zZW5cblx0XHQvLyBcIlNob3cgQWxsIFNlc3Npb25zXCIgKHVuY2FwcGVkKSwgc2hvdyBldmVyeSB3b3Jrc3BhY2UgZ3JvdXAgaW5saW5lIGluc3RlYWRcblx0XHQvLyBvZiBoaWRpbmcgc29tZSBiZWhpbmQgYSBcIm1vcmUgd29ya3NwYWNlc1wiIGVudHJ5LlxuXHRcdGNvbnN0IHBhcnRpdGlvbkZvbGRlcnMgPSBncm91cGluZyA9PT0gU2Vzc2lvbnNHcm91cGluZy5Xb3Jrc3BhY2UgJiYgIXRoaXMuaGFzRmluZFBhdHRlcm4gJiYgdGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZDtcblx0XHRjb25zdCBtb3JlRm9sZGVyU2VjdGlvbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGlmIChwYXJ0aXRpb25Gb2xkZXJzKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VTZWN0aW9ucyA9IHNlY3Rpb25zLmZpbHRlcihzID0+IHMuaWQuc3RhcnRzV2l0aCgnd29ya3NwYWNlOicpKTtcblx0XHRcdGlmICh3b3Jrc3BhY2VTZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRcdGNvbnN0IGlzUmVjZW50ID0gKHNlY3Rpb246IElTZXNzaW9uU2VjdGlvbikgPT5cblx0XHRcdFx0XHRzZWN0aW9uLnNlc3Npb25zLnNvbWUocyA9PiBzLnVwZGF0ZWRBdC5nZXQoKS5nZXRUaW1lKCkgPj0gbm93IC0gRk9VUl9EQVlTX01TKTtcblx0XHRcdFx0Y29uc3QgaXNPcGVuV2luZG93ID0gKHNlY3Rpb246IElTZXNzaW9uU2VjdGlvbikgPT5cblx0XHRcdFx0XHQhIXRoaXMub3BlbldpbmRvd1NvdXJjZUZvbGRlciAmJiBzZWN0aW9uLnNlc3Npb25zLnNvbWUocyA9PiBzZXNzaW9uTWF0Y2hlc0ZvbGRlcihzLCB0aGlzLm9wZW5XaW5kb3dTb3VyY2VGb2xkZXIhKSk7XG5cdFx0XHRcdGNvbnN0IG1lZXRzQ3JpdGVyaWEgPSAoc2VjdGlvbjogSVNlc3Npb25TZWN0aW9uKSA9PiBpc1JlY2VudChzZWN0aW9uKSB8fCBpc09wZW5XaW5kb3coc2VjdGlvbik7XG5cblx0XHRcdFx0bGV0IGFueU1lZXRzID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB3b3Jrc3BhY2VTZWN0aW9ucykge1xuXHRcdFx0XHRcdGlmIChtZWV0c0NyaXRlcmlhKHNlY3Rpb24pKSB7XG5cdFx0XHRcdFx0XHRhbnlNZWV0cyA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgZmFsbGJhY2tJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIWFueU1lZXRzKSB7XG5cdFx0XHRcdFx0Ly8gQ3JpdGVyaW9uIDM6IHBpY2sgdGhlIGZvbGRlciB3aXRoIHRoZSBtb3N0IHJlY2VudGx5IHVwZGF0ZWQgc2Vzc2lvbi5cblx0XHRcdFx0XHRsZXQgYmVzdFRpbWUgPSAtSW5maW5pdHk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHdvcmtzcGFjZVNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc2VjdGlvbi5zZXNzaW9ucykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0ID0gcy51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpO1xuXHRcdFx0XHRcdFx0XHRpZiAodCA+IGJlc3RUaW1lKSB7XG5cdFx0XHRcdFx0XHRcdFx0YmVzdFRpbWUgPSB0O1xuXHRcdFx0XHRcdFx0XHRcdGZhbGxiYWNrSWQgPSBzZWN0aW9uLmlkO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHdvcmtzcGFjZVNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0aWYgKCFtZWV0c0NyaXRlcmlhKHNlY3Rpb24pICYmIHNlY3Rpb24uaWQgIT09IGZhbGxiYWNrSWQgJiYgIXRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLmlzUHJvbW90ZWQoc2VjdGlvbi5pZCkpIHtcblx0XHRcdFx0XHRcdG1vcmVGb2xkZXJTZWN0aW9uSWRzLmFkZChzZWN0aW9uLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZHJlbjogSU9iamVjdFRyZWVFbGVtZW50PFNlc3Npb25MaXN0SXRlbT5bXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkdyb3VwTGltaXQgPSB0aGlzLnNlc3Npb25Hcm91cExpbWl0LmdldCgpO1xuXG5cdFx0Y29uc3QgdG9TZXNzaW9uQ2hpbGRyZW4gPSAoc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10pOiBJT2JqZWN0VHJlZUVsZW1lbnQ8U2Vzc2lvbkxpc3RJdGVtPltdID0+XG5cdFx0XHRzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiAoeyBlbGVtZW50OiBzZXNzaW9uIGFzIFNlc3Npb25MaXN0SXRlbSB9KSk7XG5cblx0XHRjb25zdCByZW5kZXJTZXNzaW9uQ2hpbGRyZW4gPSAoc2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10sIHNlY3Rpb25JZDogc3RyaW5nLCBzZWN0aW9uTGFiZWw6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbik6IElPYmplY3RUcmVlRWxlbWVudDxTZXNzaW9uTGlzdEl0ZW0+W10gPT4ge1xuXHRcdFx0Y29uc3QgbGltaXRlZCA9IGxpbWl0U2Vzc2lvbnNGb3JMaXN0KHNlc3Npb25zLCBzZXNzaW9uR3JvdXBMaW1pdCwge1xuXHRcdFx0XHRlbmFibGVkLFxuXHRcdFx0XHRleHBhbmRlZDogdGhpcy5leHBhbmRlZFNlc3Npb25Hcm91cHMuaGFzKHNlY3Rpb25JZCksXG5cdFx0XHRcdHNlY3Rpb25JZCxcblx0XHRcdFx0c2VjdGlvbkxhYmVsLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IHRvU2Vzc2lvbkNoaWxkcmVuKGxpbWl0ZWQuc2Vzc2lvbnMpO1xuXHRcdFx0aWYgKGxpbWl0ZWQuc2hvd01vcmUpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCh7IGVsZW1lbnQ6IGxpbWl0ZWQuc2hvd01vcmUgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlclNlY3Rpb24gPSAoc2VjdGlvbjogSVNlc3Npb25TZWN0aW9uKTogSU9iamVjdFRyZWVFbGVtZW50PFNlc3Npb25MaXN0SXRlbT4gPT4ge1xuXHRcdFx0aWYgKHNlY3Rpb24uaWQgPT09IEFVVE9NQVRJT05TX1NFQ1RJT05fSUQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlbGVtZW50OiBzZWN0aW9uIGFzIFNlc3Npb25MaXN0SXRlbSxcblx0XHRcdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc1dvcmtzcGFjZUdyb3VwID0gZ3JvdXBpbmcgPT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlXG5cdFx0XHRcdCYmIHNlY3Rpb24uaWQuc3RhcnRzV2l0aCgnd29ya3NwYWNlOicpO1xuXHRcdFx0Y29uc3QgbGltaXRTZXNzaW9ucyA9IGlzV29ya3NwYWNlR3JvdXBcblx0XHRcdFx0JiYgIXRoaXMuaGFzRmluZFBhdHRlcm5cblx0XHRcdFx0JiYgdGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZDtcblx0XHRcdGxldCBzZWN0aW9uQ2hpbGRyZW4gPSByZW5kZXJTZXNzaW9uQ2hpbGRyZW4oc2VjdGlvbi5zZXNzaW9ucywgc2VjdGlvbi5pZCwgc2VjdGlvbi5sYWJlbCwgbGltaXRTZXNzaW9ucyk7XG5cblx0XHRcdC8vIFRoZSBhbHdheXMtdmlzaWJsZSBcIkNoYXRzXCIgc2VjdGlvbiBzaG93cyBhIG11dGVkIHBsYWNlaG9sZGVyIHJvd1xuXHRcdFx0Ly8gd2hlbiBpdCBoYXMgbm8gc2Vzc2lvbnMgeWV0LlxuXHRcdFx0aWYgKHNlY3Rpb24uaWQgPT09IFFVSUNLX0NIQVRTX1NFQ1RJT05fSUQgJiYgc2VjdGlvbi5zZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0c2VjdGlvbkNoaWxkcmVuID0gW3sgZWxlbWVudDogeyBwbGFjZWhvbGRlcjogdHJ1ZSBhcyBjb25zdCwgc2VjdGlvbklkOiBzZWN0aW9uLmlkLCBsYWJlbDogbG9jYWxpemUoJ25vQ2hhdHMnLCBcIk5vIGNoYXRzXCIpIH0gfV07XG5cdFx0XHR9XG5cblx0XHRcdC8vIERlZmF1bHQgY29sbGFwc2Ugc3RhdGUgZm9yIG9sZGVyIHRpbWUgc2VjdGlvbnNcblx0XHRcdGxldCBkZWZhdWx0Q29sbGFwc2VkOiBib29sZWFuIHwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlID0gT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZDtcblx0XHRcdGlmIChncm91cGluZyA9PT0gU2Vzc2lvbnNHcm91cGluZy5EYXRlICYmIGhhc1JlY2VudFNlc3Npb25zKSB7XG5cdFx0XHRcdGNvbnN0IG9sZGVyU2VjdGlvbnMgPSBbJ29sZGVyJywgJ2FyY2hpdmVkJ107XG5cdFx0XHRcdGlmIChvbGRlclNlY3Rpb25zLmluY2x1ZGVzKHNlY3Rpb24uaWQpKSB7XG5cdFx0XHRcdFx0ZGVmYXVsdENvbGxhcHNlZCA9IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VjdGlvbi5pZCA9PT0gJ2FyY2hpdmVkJykge1xuXHRcdFx0XHRkZWZhdWx0Q29sbGFwc2VkID0gT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBcIlBpbm5lZFwiIGFuZCBcIkNoYXRzXCIgc2VjdGlvbnMgc3RhcnQgY29sbGFwc2VkIG9uIGZpcnN0IG9wZW47IHRoZVxuXHRcdFx0Ly8gdXNlcidzIGxhdGVyIGNob2ljZSBpcyBwZXJzaXN0ZWQgYW5kIGhvbm9yZWQgdmlhIGdldFNhdmVkQ29sbGFwc2VTdGF0ZS5cblx0XHRcdGlmIChzZWN0aW9uLmlkID09PSAncGlubmVkJyB8fCBzZWN0aW9uLmlkID09PSBRVUlDS19DSEFUU19TRUNUSU9OX0lEKSB7XG5cdFx0XHRcdGRlZmF1bHRDb2xsYXBzZWQgPSBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWxlbWVudDogc2VjdGlvbiBhcyBTZXNzaW9uTGlzdEl0ZW0sXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiB0cnVlLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IHRoaXMuZ2V0U2F2ZWRDb2xsYXBzZVN0YXRlKHNlY3Rpb24uaWQpID8/IGRlZmF1bHRDb2xsYXBzZWQsXG5cdFx0XHRcdGNoaWxkcmVuOiBzZWN0aW9uQ2hpbGRyZW4sXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCByZW5kZXJHcm91cCA9IChncm91cEl0ZW06IElTZXNzaW9uR3JvdXBJdGVtKTogSU9iamVjdFRyZWVFbGVtZW50PFNlc3Npb25MaXN0SXRlbT4gPT4ge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbklkID0gYGdyb3VwOiR7Z3JvdXBJdGVtLmdyb3VwLmlkfWA7XG5cdFx0XHRjb25zdCBncm91cENoaWxkcmVuID0gZ3JvdXBJdGVtLnNlc3Npb25zLmxlbmd0aCA9PT0gMFxuXHRcdFx0XHQ/IFt7XG5cdFx0XHRcdFx0ZWxlbWVudDoge1xuXHRcdFx0XHRcdFx0cGxhY2Vob2xkZXI6IHRydWUgYXMgY29uc3QsXG5cdFx0XHRcdFx0XHRzZWN0aW9uSWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vU2Vzc2lvbkluR3JvdXAnLCBcIk5vIHNlc3Npb25cIiksXG5cdFx0XHRcdFx0XHRob3ZlcjogbG9jYWxpemUoJ25vU2Vzc2lvbkluR3JvdXBIb3ZlcicsIFwiVXNlIEFkZCB0byBHcm91cCBmcm9tIGEgc2Vzc2lvbidzIGNvbnRleHQgbWVudSwgb3IgZHJhZyBpdCBpbnRvIHRoaXMgZ3JvdXAuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdFx0OiByZW5kZXJTZXNzaW9uQ2hpbGRyZW4oZ3JvdXBJdGVtLnNlc3Npb25zLCBzZWN0aW9uSWQsIGdyb3VwSXRlbS5ncm91cC5uYW1lLCAhdGhpcy5oYXNGaW5kUGF0dGVybiAmJiB0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVsZW1lbnQ6IGdyb3VwSXRlbSxcblx0XHRcdFx0Y29sbGFwc2libGU6IHRydWUsXG5cdFx0XHRcdGNvbGxhcHNlZDogdGhpcy5nZXRTYXZlZENvbGxhcHNlU3RhdGUoc2VjdGlvbklkKSA/PyBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckV4cGFuZGVkLFxuXHRcdFx0XHRjaGlsZHJlbjogZ3JvdXBDaGlsZHJlbixcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5rZXkpKSB7XG5cdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlclNlY3Rpb24oeyBpZDogQVVUT01BVElPTlNfU0VDVElPTl9JRCwgbGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9ucycsIFwiQXV0b21hdGlvbnNcIiksIHNlc3Npb25zOiBbXSB9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlubmVkU2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLmlkID09PSAncGlubmVkJyk7XG5cdFx0aWYgKHBpbm5lZFNlY3Rpb24pIHtcblx0XHRcdGNoaWxkcmVuLnB1c2gocmVuZGVyU2VjdGlvbihwaW5uZWRTZWN0aW9uKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUXVpY2sgY2hhdHMgcmVuZGVyIGFzIGEgc2luZ2xlIFwiQ2hhdHNcIiBlbnRyeSBkaXJlY3RseSBiZWxvdyBQaW5uZWQgKGFib3ZlXG5cdFx0Ly8gdGhlIHdvcmtzcGFjZS9kYXRlIGdyb3VwcykgaW4gYm90aCBncm91cGluZyBtb2Rlcy5cblx0XHRjb25zdCBxdWlja0NoYXRzU2VjdGlvbiA9IHNlY3Rpb25zLmZpbmQocyA9PiBzLmlkID09PSBRVUlDS19DSEFUU19TRUNUSU9OX0lEKTtcblx0XHRpZiAocXVpY2tDaGF0c1NlY3Rpb24pIHtcblx0XHRcdGNoaWxkcmVuLnB1c2gocmVuZGVyU2VjdGlvbihxdWlja0NoYXRzU2VjdGlvbikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlckdyb3VwQnlJZCA9IChpZDogc3RyaW5nKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCBncm91cEl0ZW0gPSBncm91cEl0ZW1zQnlJZC5nZXQoaWQuc2xpY2UoJ2dyb3VwOicubGVuZ3RoKSk7XG5cdFx0XHRpZiAoZ3JvdXBJdGVtKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gocmVuZGVyR3JvdXAoZ3JvdXBJdGVtKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmIChncm91cGluZyA9PT0gU2Vzc2lvbnNHcm91cGluZy5EYXRlKSB7XG5cdFx0XHQvLyBHcm91cHMgZm9ybSBhIGNvbnRpZ3VvdXMsIGZ1bGx5IHVzZXItb3JkZXJlZCBibG9jayByaWdodCBiZWxvdyB0aGVcblx0XHRcdC8vIFBpbm5lZCBzZWN0aW9uLiBUaGV5IG5vIGxvbmdlciBpbnRlcmxlYXZlIHdpdGggdGhlIGRhdGUgc2VjdGlvbnMgYnlcblx0XHRcdC8vIHJlY2VuY3kgYW5kIG5ldmVyIG1peCBpbnRvIFRvZGF5L1llc3RlcmRheS9ldGMuIFBpbm5lZCBzdGF5cyBhdCB0aGVcblx0XHRcdC8vIHRvcCwgRG9uZSAoYXJjaGl2ZWQpIHN0YXlzIGF0IHRoZSBib3R0b20uXG5cdFx0XHRjb25zdCByZXNvbHZlZEdyb3VwSWRzID0gdGhpcy5fc2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UucmVzb2x2ZU9yZGVyKGRlZmF1bHRHcm91cElkcyk7XG5cdFx0XHR0aGlzLl90b3BMZXZlbE9yZGVyID0gcmVzb2x2ZWRHcm91cElkcztcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgcmVzb2x2ZWRHcm91cElkcykge1xuXHRcdFx0XHRyZW5kZXJHcm91cEJ5SWQoaWQpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNlY3Rpb25zKSB7XG5cdFx0XHRcdGlmIChzZWN0aW9uLmlkID09PSAncGlubmVkJyB8fCBzZWN0aW9uLmlkID09PSAnYXJjaGl2ZWQnIHx8IHNlY3Rpb24uaWQgPT09IFFVSUNLX0NIQVRTX1NFQ1RJT05fSUQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlclNlY3Rpb24oc2VjdGlvbikpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXJjaGl2ZWQgPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5pZCA9PT0gJ2FyY2hpdmVkJyk7XG5cdFx0XHRpZiAoYXJjaGl2ZWQpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaChyZW5kZXJTZWN0aW9uKGFyY2hpdmVkKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFdvcmtzcGFjZSBncm91cGluZzogZ3JvdXBzIGFuZCAocHJpbWFyeSkgd29ya3NwYWNlIHNlY3Rpb25zIHNoYXJlIG9uZVxuXHRcdFx0Ly8gZnJlZWx5LXJlb3JkZXJhYmxlLCB1c2VyLW1hbmFnZWQgb3JkZXIgcmlnaHQgYmVsb3cgUGlubmVkLiBHcm91cHNcblx0XHRcdC8vIGRlZmF1bHQgYWJvdmUgd29ya3NwYWNlczsgd29ya3NwYWNlcyBkZWZhdWx0IHRvIHRoZWlyIGFscGhhYmV0aWNhbFxuXHRcdFx0Ly8gb3JkZXIuIFBpbm5lZCBzdGF5cyBmaXJzdCwgRG9uZSBsYXN0LCBhbmQgaGlkZGVuIChcIitOIG1vcmVcIilcblx0XHRcdC8vIHdvcmtzcGFjZXMgYXJlIGFwcGVuZGVkIGJlbG93IHRoZSBvcmRlcmVkIGJsb2NrLlxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU2VjdGlvbnMgPSBzZWN0aW9ucy5maWx0ZXIocyA9PiBzLmlkLnN0YXJ0c1dpdGgoJ3dvcmtzcGFjZTonKSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uQnlJZCA9IG5ldyBNYXAod29ya3NwYWNlU2VjdGlvbnMubWFwKHMgPT4gW3MuaWQsIHNdIGFzIGNvbnN0KSk7XG5cdFx0XHRjb25zdCBwcmltYXJ5V29ya3NwYWNlSWRzID0gd29ya3NwYWNlU2VjdGlvbnNcblx0XHRcdFx0LmZpbHRlcihzID0+ICFtb3JlRm9sZGVyU2VjdGlvbklkcy5oYXMocy5pZCkpXG5cdFx0XHRcdC5tYXAocyA9PiBzLmlkKTtcblxuXHRcdFx0Y29uc3QgZGVmYXVsdE9yZGVyID0gWy4uLmRlZmF1bHRHcm91cElkcywgLi4ucHJpbWFyeVdvcmtzcGFjZUlkc107XG5cdFx0XHRjb25zdCByZXNvbHZlZElkcyA9IHRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLnJlc29sdmVPcmRlcihkZWZhdWx0T3JkZXIpO1xuXHRcdFx0dGhpcy5fdG9wTGV2ZWxPcmRlciA9IHJlc29sdmVkSWRzO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiByZXNvbHZlZElkcykge1xuXHRcdFx0XHRpZiAoaWQuc3RhcnRzV2l0aCgnZ3JvdXA6JykpIHtcblx0XHRcdFx0XHRyZW5kZXJHcm91cEJ5SWQoaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHNlY3Rpb24gPSBzZWN0aW9uQnlJZC5nZXQoaWQpO1xuXHRcdFx0XHRcdGlmIChzZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlclNlY3Rpb24oc2VjdGlvbikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb3JlRm9sZGVyU2VjdGlvbnMgPSB3b3Jrc3BhY2VTZWN0aW9ucy5maWx0ZXIocyA9PiBtb3JlRm9sZGVyU2VjdGlvbklkcy5oYXMocy5pZCkpO1xuXHRcdFx0aWYgKG1vcmVGb2xkZXJTZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4cGFuZGVkTW9yZUZvbGRlcnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgbW9yZUZvbGRlclNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHJlbmRlclNlY3Rpb24oc2VjdGlvbikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IHsgc2hvd01vcmU6IHRydWUgYXMgY29uc3QsIGtpbmQ6ICdmb2xkZXJzJyBhcyBjb25zdCwgbW9kZTogJ2xlc3MnIGFzIGNvbnN0LCBzZWN0aW9uSWQ6IFNIT1dfTU9SRV9GT0xERVJTX0xBQkVMLCBzZWN0aW9uTGFiZWw6IFNIT1dfTU9SRV9GT0xERVJTX0xBQkVMLCByZW1haW5pbmdDb3VudDogMCB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogeyBzaG93TW9yZTogdHJ1ZSBhcyBjb25zdCwga2luZDogJ2ZvbGRlcnMnIGFzIGNvbnN0LCBtb2RlOiAnbW9yZScgYXMgY29uc3QsIHNlY3Rpb25JZDogU0hPV19NT1JFX0ZPTERFUlNfTEFCRUwsIHNlY3Rpb25MYWJlbDogU0hPV19NT1JFX0ZPTERFUlNfTEFCRUwsIHJlbWFpbmluZ0NvdW50OiBtb3JlRm9sZGVyU2VjdGlvbnMubGVuZ3RoIH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlIGFyY2hpdmVkIHNlY3Rpb24gaXMgYWx3YXlzIHRoZSB2ZXJ5IGxhc3QgZW50cnkuXG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlY3Rpb24gPSBzZWN0aW9ucy5maW5kKHMgPT4gcy5pZCA9PT0gJ2FyY2hpdmVkJyk7XG5cdFx0XHRpZiAoYXJjaGl2ZWRTZWN0aW9uKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gocmVuZGVyU2VjdGlvbihhcmNoaXZlZFNlY3Rpb24pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgY2hpbGRyZW4pO1xuXHRcdHRoaXMuX29uRGlkVXBkYXRlLmZpcmUoKTtcblx0fVxuXG5cdGdldFZpc2libGVTZXNzaW9ucygpOiByZWFkb25seSBJU2Vzc2lvbltdIHtcblx0XHQvLyBEZXJpdmUgdGhlIHZpc2libGUgc2Vzc2lvbiBsaXN0IGZyb20gdGhlIHRyZWUgbW9kZWwgc28gdGhhdCBpbmRleC1iYXNlZFxuXHRcdC8vIG5hdmlnYXRpb24gbWF0Y2hlcyB3aGF0IHRoZSB1c2VyIGFjdHVhbGx5IHNlZXM6IHRoaXMgcmVzcGVjdHMgY29sbGFwc2VkXG5cdFx0Ly8gc2VjdGlvbnMsIGZpbmQtd2lkZ2V0IGZpbHRlcmluZywgYW5kIGV4Y2x1ZGVzIHNlY3Rpb24gLyBzaG93LW1vcmUgbm9kZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgU2V0PElTZXNzaW9uPih0aGlzLnNlc3Npb25zKTtcblx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGNvbGxlY3QgPSAobm9kZTogSVRyZWVOb2RlPFNlc3Npb25MaXN0SXRlbSB8IG51bGwsIEZ1enp5U2NvcmUgfCB1bmRlZmluZWQ+KTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoIW5vZGUudmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAobm9kZS5lbGVtZW50ICYmIHNlc3Npb25zLmhhcyhub2RlLmVsZW1lbnQgYXMgSVNlc3Npb24pKSB7XG5cdFx0XHRcdHZpc2libGVTZXNzaW9ucy5wdXNoKG5vZGUuZWxlbWVudCBhcyBJU2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbGxlY3QoY2hpbGQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByb290ID0gdGhpcy50cmVlLmdldE5vZGUoKTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGNvbGxlY3QoY2hpbGQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB2aXNpYmxlU2Vzc2lvbnM7XG5cdH1cblxuXHRyZXZlYWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXNvdXJjZVN0ciA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLnNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZVN0cikge1xuXHRcdFx0XHRpZiAodGhpcy50cmVlLmhhc0VsZW1lbnQoc2Vzc2lvbikpIHtcblx0XHRcdFx0XHRpZiAodGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKHNlc3Npb24pID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHNlc3Npb24sIDAuNSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbc2Vzc2lvbl0pO1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW3Nlc3Npb25dKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjbGVhckZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdH1cblxuXHRoYXNGb2N1c09yU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0Rm9jdXMoKS5sZW5ndGggPiAwIHx8IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKS5sZW5ndGggPiAwO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnZpc2libGUgPSB2aXNpYmxlO1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblxuXHRcdGlmICh0aGlzLnRyZWUuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMudHJlZS5mb2N1c0ZpcnN0KCk7XG5cdFx0fVxuXHR9XG5cblx0b3BlbkZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLm9wZW5GaW5kKCk7XG5cdH1cblxuXHRjbG9zZUZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmNsb3NlRmluZCgpO1xuXHR9XG5cblx0Ly8gQ29udGV4dCBtZW51XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBzZXNzaW9uIG1heSBwYXJ0aWNpcGF0ZSBpbiBtYW51YWwgcmVvcmRlcmluZy4gQXJjaGl2ZWQgKERvbmUpXG5cdCAqIHNlc3Npb25zIGtlZXAgdGhlaXIgZml4ZWQgc2VjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgaXNSZW9yZGVyYWJsZShzZXNzaW9uOiBJU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGRyYWdnZWQgc2Vzc2lvbnMgY2FuIGJlIHJlb3JkZXJlZCByZWxhdGl2ZSB0byB0aGUgdGFyZ2V0LlxuXHQgKiBSZW9yZGVyaW5nIHN0YXlzIHdpdGhpbiB0aGUgc2FtZSBzY29wZTogZHJhZ2dlZCBzZXNzaW9ucyBtdXN0IHNoYXJlIHRoZVxuXHQgKiB0YXJnZXQncyBncm91cCBtZW1iZXJzaGlwLCBhbmQgKHdoZW4gZ3JvdXBpbmcgYnkgd29ya3NwYWNlKSBpdHMgd29ya3NwYWNlLlxuXHQgKi9cblx0cHJpdmF0ZSBjYW5SZW9yZGVyT250byhkcmFnZ2VkOiBJU2Vzc2lvbltdLCB0YXJnZXQ6IElTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGFyZ2V0UGlubmVkID0gdGhpcy5pc1Nlc3Npb25QaW5uZWQodGFyZ2V0KTtcblx0XHRpZiAoZHJhZ2dlZC5zb21lKHMgPT4gdGhpcy5pc1Nlc3Npb25QaW5uZWQocykgIT09IHRhcmdldFBpbm5lZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldFBpbm5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbih0YXJnZXQuc2Vzc2lvbklkKTtcblx0XHRpZiAoZHJhZ2dlZC5zb21lKHMgPT4gdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24ocy5zZXNzaW9uSWQpICE9PSB0YXJnZXRHcm91cCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldEdyb3VwID09PSB1bmRlZmluZWQgJiYgdGhpcy5vcHRpb25zLmdyb3VwaW5nKCkgPT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRMYWJlbCA9IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbCh0YXJnZXQpO1xuXHRcdFx0cmV0dXJuIGRyYWdnZWQuZXZlcnkocyA9PiBzZXNzaW9uV29ya3NwYWNlTGFiZWwocykgPT09IHRhcmdldExhYmVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogUmVvcmRlciB0aGUgZHJhZ2dlZCBzZXNzaW9ucyBzbyB0aGV5IGxhbmQgYXMgYSBjb250aWd1b3VzIGJsb2NrIGJlZm9yZSBvclxuXHQgKiBhZnRlciB0aGUgdGFyZ2V0IHNlc3Npb24sIHBlcnNpc3RpbmcgYSBzeW50aGV0aWMgc29ydCBrZXkgKHRoZSBtaWRwb2ludCBvZlxuXHQgKiB0aGUgc3Vycm91bmRpbmcgc2Vzc2lvbnMnIGtleXMpLiBXaGVuIHRoZSBkcmFnZ2VkIHNlc3Npb25zJyBuYXR1cmFsXG5cdCAqIHRpbWVzdGFtcHMgYWxyZWFkeSBzb3J0IHRoZW0gaW50byB0aGUgZHJvcHBlZCBzbG90LCBhbnkgc3RvcmVkIG92ZXJyaWRlIGlzXG5cdCAqIGRyb3BwZWQgaW5zdGVhZCBzbyB0aGUgbGlzdCBmYWxscyBiYWNrIHRvIG5hdHVyYWwgb3JkZXJpbmcuXG5cdCAqL1xuXHRwcml2YXRlIHJlb3JkZXJTZXNzaW9ucyhkcmFnZ2VkOiBJU2Vzc2lvbltdLCB0YXJnZXQ6IElTZXNzaW9uLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZSA9IHNvcnRpbmdUb01vZGUodGhpcy5vcHRpb25zLnNvcnRpbmcoKSk7XG5cdFx0Y29uc3QgZ3JvdXBpbmcgPSB0aGlzLm9wdGlvbnMuZ3JvdXBpbmcoKTtcblx0XHRjb25zdCBnZXRLZXkgPSAoczogSVNlc3Npb24pID0+IHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5nZXRTb3J0S2V5KHMsIG1vZGUpO1xuXG5cdFx0Ly8gRGVyaXZlIG5laWdoYm91cnMgZnJvbSB0aGUgYWN0dWFsIHZpc2libGUgZGlzcGxheSBvcmRlciAod2hpY2ggYWxyZWFkeVxuXHRcdC8vIHJlc3BlY3RzIGZpbHRlcmluZyBhbmQgZ3JvdXBpbmcpIHNvIHRoZSBkcm9wIHNsb3QgbWF0Y2hlcyB3aGF0IHRoZSB1c2VyXG5cdFx0Ly8gc2Vlcy5cblx0XHRjb25zdCB0YXJnZXRQaW5uZWQgPSB0aGlzLmlzU2Vzc2lvblBpbm5lZCh0YXJnZXQpO1xuXHRcdGxldCBzY29wZSA9IHRoaXMuZ2V0VmlzaWJsZVNlc3Npb25zKCkuZmlsdGVyKHMgPT4gdGhpcy5pc1Jlb3JkZXJhYmxlKHMpKTtcblx0XHRzY29wZSA9IHNjb3BlLmZpbHRlcihzID0+IHRoaXMuaXNTZXNzaW9uUGlubmVkKHMpID09PSB0YXJnZXRQaW5uZWQpO1xuXHRcdGlmICghdGFyZ2V0UGlubmVkKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKHRhcmdldC5zZXNzaW9uSWQpO1xuXHRcdFx0c2NvcGUgPSBzY29wZS5maWx0ZXIocyA9PiB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbihzLnNlc3Npb25JZCkgPT09IHRhcmdldEdyb3VwKTtcblx0XHRcdGlmICh0YXJnZXRHcm91cCA9PT0gdW5kZWZpbmVkICYmIGdyb3VwaW5nID09PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRMYWJlbCA9IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbCh0YXJnZXQpO1xuXHRcdFx0XHRzY29wZSA9IHNjb3BlLmZpbHRlcihzID0+IHNlc3Npb25Xb3Jrc3BhY2VMYWJlbChzKSA9PT0gdGFyZ2V0TGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRyYWdnZWRJZHMgPSBuZXcgU2V0KGRyYWdnZWQubWFwKHMgPT4gcy5zZXNzaW9uSWQpKTtcblx0XHRjb25zdCBkcmFnZ2VkT3JkZXJlZCA9IHNjb3BlLmZpbHRlcihzID0+IGRyYWdnZWRJZHMuaGFzKHMuc2Vzc2lvbklkKSk7XG5cdFx0aWYgKGRyYWdnZWRPcmRlcmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZW1haW5pbmcgPSBzY29wZS5maWx0ZXIocyA9PiAhZHJhZ2dlZElkcy5oYXMocy5zZXNzaW9uSWQpKTtcblxuXHRcdGNvbnN0IHRhcmdldEluZGV4ID0gcmVtYWluaW5nLmZpbmRJbmRleChzID0+IHMuc2Vzc2lvbklkID09PSB0YXJnZXQuc2Vzc2lvbklkKTtcblx0XHRpZiAodGFyZ2V0SW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zZXJ0SW5kZXggPSBwb3NpdGlvbiA9PT0gJ2JlZm9yZScgPyB0YXJnZXRJbmRleCA6IHRhcmdldEluZGV4ICsgMTtcblx0XHRjb25zdCBhYm92ZSA9IHJlbWFpbmluZ1tpbnNlcnRJbmRleCAtIDFdO1xuXHRcdGNvbnN0IGJlbG93ID0gcmVtYWluaW5nW2luc2VydEluZGV4XTtcblxuXHRcdGNvbnN0IHsgc2V0LCBjbGVhciB9ID0gY29tcHV0ZVJlb3JkZXJTb3J0Q2hhbmdlcyh7XG5cdFx0XHRkcmFnZ2VkSWRzOiBkcmFnZ2VkT3JkZXJlZC5tYXAocyA9PiBzLnNlc3Npb25JZCksXG5cdFx0XHRuYXR1cmFsS2V5czogZHJhZ2dlZE9yZGVyZWQubWFwKHMgPT4gdGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmdldE5hdHVyYWxTb3J0S2V5KHMsIG1vZGUpKSxcblx0XHRcdGFib3ZlS2V5OiBhYm92ZSA/IGdldEtleShhYm92ZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRiZWxvd0tleTogYmVsb3cgPyBnZXRLZXkoYmVsb3cpIDogdW5kZWZpbmVkLFxuXHRcdFx0bm93OiBEYXRlLm5vdygpLFxuXHRcdFx0ZmFsbGJhY2tTdGVwOiBTT1JUX0ZBTExCQUNLX1NURVBfTVMsXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmFwcGx5U29ydENoYW5nZXMobW9kZSwgc2V0LCBjbGVhcik7XG5cdH1cblxuXHQvLyAtLSBHcm91cHMgLS1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGdyb3VwIGNvbnRhaW5pbmcgdGhlIGdpdmVuIHNlc3Npb25zIGFuZCBzdGFydCByZW5hbWluZyBpdC5cblx0ICogQXJjaGl2ZWQgKERvbmUpIHNlc3Npb25zIGFyZSBpZ25vcmVkLlxuXHQgKi9cblx0Y3JlYXRlR3JvdXBGcm9tU2Vzc2lvbnMoc2Vzc2lvbnM6IElTZXNzaW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBncm91cFNlc3Npb25zID0gc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gIXNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0aWYgKGdyb3VwU2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY3JlYXRlR3JvdXAoZ3JvdXBTZXNzaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUdyb3VwKGdyb3VwU2Vzc2lvbnM6IElTZXNzaW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudW5waW5TZXNzaW9ucyhncm91cFNlc3Npb25zKTtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmNyZWF0ZUdyb3VwKGxvY2FsaXplKCduZXdHcm91cE5hbWUnLCBcIk5ldyBHcm91cFwiKSwgZ3JvdXBTZXNzaW9ucy5tYXAocyA9PiBzLnNlc3Npb25JZCkpO1xuXHRcdHRoaXMuX2VkaXRpbmdHcm91cElkID0gZ3JvdXAuaWQ7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLnJldmVhbEdyb3VwKGdyb3VwLmlkKTtcblx0fVxuXG5cdC8qKiBTY3JvbGwgdGhlIGdyb3VwJ3MgaGVhZGVyIGludG8gdmlldyBzbyBpdHMgaW5saW5lIG5hbWUgZWRpdG9yIGlzIHZpc2libGUuICovXG5cdHByaXZhdGUgcmV2ZWFsR3JvdXAoZ3JvdXBJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMudHJlZS5nZXROb2RlKCk7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCAmJiBpc1Nlc3Npb25Hcm91cEl0ZW0oZWxlbWVudCkgJiYgZWxlbWVudC5ncm91cC5pZCA9PT0gZ3JvdXBJZCkge1xuXHRcdFx0XHRpZiAodGhpcy50cmVlLmhhc0VsZW1lbnQoZWxlbWVudCkgJiYgdGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGVsZW1lbnQpID09PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnJldmVhbChlbGVtZW50LCAwLjUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogQmVnaW4gaW5saW5lIHJlbmFtaW5nIG9mIHRoZSBncm91cCdzIGhlYWRlci4gKi9cblx0YmVnaW5SZW5hbWVHcm91cChncm91cElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwKGdyb3VwSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRpbmdHcm91cElkID0gZ3JvdXBJZDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0YWRkU2Vzc2lvbnNUb0dyb3VwKHNlc3Npb25zOiBJU2Vzc2lvbltdLCBncm91cElkOiBzdHJpbmcsIHRhcmdldD86IElTZXNzaW9uLCBwb3NpdGlvbj86ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwU2Vzc2lvbnMgPSBzZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpKTtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UudW5waW5TZXNzaW9ucyhncm91cFNlc3Npb25zKTtcblx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5hZGRUb0dyb3VwKGdyb3VwU2Vzc2lvbnMubWFwKHMgPT4gcy5zZXNzaW9uSWQpLCBncm91cElkKTtcblx0XHRpZiAodGFyZ2V0ICYmIHBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLnJlb3JkZXJTZXNzaW9ucyhncm91cFNlc3Npb25zLCB0YXJnZXQsIHBvc2l0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbW1pdEdyb3VwRWRpdChncm91cDogSVNlc3Npb25Hcm91cCwgbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdGluZ0dyb3VwSWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IG5hbWUudHJpbSgpO1xuXHRcdGlmICh0cmltbWVkKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5yZW5hbWVHcm91cChncm91cC5pZCwgdHJpbW1lZCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbEdyb3VwRWRpdChfZ3JvdXA6IElTZXNzaW9uR3JvdXApOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0aW5nR3JvdXBJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlb3JkZXIgYSB0b3AtbGV2ZWwgaGVhZGVyIChncm91cCBvciB3b3Jrc3BhY2Ugc2VjdGlvbikgc28gaXQgbGFuZHNcblx0ICogYmVmb3JlL2FmdGVyIHRoZSB0YXJnZXQgaGVhZGVyLiBUaGUgbmV3IG9yZGVyIGlzIHBlcnNpc3RlZCB0byB0aGVcblx0ICogc2VjdGlvbi1vcmRlciBzZXJ2aWNlLiBXaGVuIHRoZSBkcmFnZ2VkIGhlYWRlciBpcyBhIHdvcmtzcGFjZSBpdCBpcyBhbHNvXG5cdCAqIHByb21vdGVkIHNvIGl0IHN0YXlzIHZpc2libGUgKGVzY2FwZXMgdGhlIFwiK04gbW9yZSB3b3Jrc3BhY2VzXCIgY2FwcGluZykuXG5cdCAqL1xuXHRwcml2YXRlIHJlb3JkZXJTZWN0aW9uKGRyYWdnZWRJZDogc3RyaW5nLCB0YXJnZXRJZDogc3RyaW5nLCBwb3NpdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInLCBpc1dvcmtzcGFjZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLnJlb3JkZXIodGhpcy5fdG9wTGV2ZWxPcmRlciwgZHJhZ2dlZElkLCB0YXJnZXRJZCwgcG9zaXRpb24sIGlzV29ya3NwYWNlID8gZHJhZ2dlZElkIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHcm91cHMgaW4gdGhlaXIgY3VycmVudCB0b3AtdG8tYm90dG9tIGRpc3BsYXkgb3JkZXIuIEdyb3VwcyBhcmUgZnVsbHlcblx0ICogdXNlci1tYW5hZ2VkIChzZWUge0BsaW5rIElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZX0pOyB0aGUgb3JkZXIgZGVmYXVsdHNcblx0ICogdG8gbmV3ZXN0LWZpcnN0IGFuZCBpcyBzaGFyZWQgd2l0aCB0aGUgbGlzdC4gVXNlZCB0byBrZWVwIHRoZSBcIkFkZCB0b1xuXHQgKiBHcm91cFwiIC8gXCJNb3ZlIHRvIEdyb3VwXCIgbWVudSBjb25zaXN0ZW50IHdpdGggdGhlIHJlbmRlcmVkIG9yZGVyLlxuXHQgKi9cblx0Z2V0R3JvdXBzSW5EaXNwbGF5T3JkZXIoKTogSVNlc3Npb25Hcm91cFtdIHtcblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cHMoKTtcblx0XHRjb25zdCBieUlkID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uR3JvdXA+KGdyb3Vwcy5tYXAoZyA9PiBbYGdyb3VwOiR7Zy5pZH1gLCBnXSkpO1xuXHRcdGNvbnN0IGRlZmF1bHRJZHMgPSBbLi4uZ3JvdXBzXVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGIuY3JlYXRlZEF0IC0gYS5jcmVhdGVkQXQpXG5cdFx0XHQubWFwKGcgPT4gYGdyb3VwOiR7Zy5pZH1gKTtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UucmVzb2x2ZU9yZGVyKGRlZmF1bHRJZHMpXG5cdFx0XHQubWFwKGlkID0+IGJ5SWQuZ2V0KGlkKSlcblx0XHRcdC5maWx0ZXIoKGcpOiBnIGlzIElTZXNzaW9uR3JvdXAgPT4gISFnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2V0IG9mIHRvcC1sZXZlbCByZW9yZGVyIGlkZW50aXRpZXMgdGhhdCBjdXJyZW50bHkgZXhpc3QgKGV2ZXJ5IGdyb3VwLFxuXHQgKiBwbHVzIGV2ZXJ5IHdvcmtzcGFjZSBsYWJlbCBwcmVzZW50IGFjcm9zcyBhbGwgc2Vzc2lvbnMsIHJlZ2FyZGxlc3Mgb2Zcblx0ICogZ3JvdXBpbmcgbW9kZSBvciBjYXBwaW5nKS4gVXNlZCB0byBnYXJiYWdlLWNvbGxlY3Qgc3RhbGUgbWFudWFsIG9yZGVyIGFuZFxuXHQgKiBwcm9tb3Rpb24gZW50cmllcy4gUmVhZHMgc2Vzc2lvbnMgZnJlc2ggZnJvbSB0aGUgbWFuYWdlbWVudCBzZXJ2aWNlIHNvIGl0XG5cdCAqIHJlZmxlY3RzIHRoZSBsYXRlc3QgbG9hZGVkIHN0YXRlIGV2ZW4gd2hlbiB0aGUgbGlzdCBpcyBub3QgdmlzaWJsZS5cblx0ICovXG5cdHByaXZhdGUgbGl2ZVNlY3Rpb25PcmRlcklkcygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cHMoKSkge1xuXHRcdFx0aWRzLmFkZChgZ3JvdXA6JHtncm91cC5pZH1gKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbnMoKSkge1xuXHRcdFx0aWRzLmFkZChgd29ya3NwYWNlOiR7c2Vzc2lvbldvcmtzcGFjZUxhYmVsKHNlc3Npb24pfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gaWRzO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXREcm9wVGFyZ2V0SGVhZGVyKGhlYWRlcjogSVNlc3Npb25Ecm9wVGFyZ2V0SGVhZGVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2Ryb3BUYXJnZXRIZWFkZXI7XG5cdFx0aWYgKGN1cnJlbnQ/LmtpbmQgPT09IGhlYWRlcj8ua2luZCAmJiBjdXJyZW50Py5pZCA9PT0gaGVhZGVyPy5pZCkge1xuXHRcdFx0dGhpcy50b2dnbGVEcm9wVGFyZ2V0SGVhZGVyKGhlYWRlciwgaGVhZGVyICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvZ2dsZURyb3BUYXJnZXRIZWFkZXIoY3VycmVudCwgZmFsc2UpO1xuXHRcdHRoaXMuX2Ryb3BUYXJnZXRIZWFkZXIgPSBoZWFkZXI7XG5cdFx0dGhpcy50b2dnbGVEcm9wVGFyZ2V0SGVhZGVyKGhlYWRlciwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZURyb3BUYXJnZXRIZWFkZXIoaGVhZGVyOiBJU2Vzc2lvbkRyb3BUYXJnZXRIZWFkZXIgfCB1bmRlZmluZWQsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghaGVhZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChoZWFkZXIua2luZCA9PT0gJ2dyb3VwJykge1xuXHRcdFx0dGhpcy5fZ3JvdXBSZW5kZXJlci5zZXREcm9wVGFyZ2V0KGhlYWRlci5pZCwgYWN0aXZlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2VjdGlvblJlbmRlcmVyLnNldERyb3BUYXJnZXQoaGVhZGVyLmlkLCBhY3RpdmUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TXVsdGlTZWxlY3RlZFNlc3Npb25zKHNlc3Npb246IElTZXNzaW9uKTogSVNlc3Npb25bXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpLmZpbHRlcigocyk6IHMgaXMgSVNlc3Npb24gPT4gISFzICYmIGlzU2Vzc2lvbkl0ZW0ocykpO1xuXHRcdHJldHVybiBzZWxlY3Rpb24uaW5jbHVkZXMoc2Vzc2lvbikgPyBbc2Vzc2lvbiwgLi4uc2VsZWN0aW9uLmZpbHRlcihzID0+IHMgIT09IHNlc3Npb24pXSA6IFtzZXNzaW9uXTtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8U2Vzc2lvbkxpc3RJdGVtIHwgbnVsbD4pOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdGlmICghZWxlbWVudCB8fCBpc1Nlc3Npb25TZWN0aW9uKGVsZW1lbnQpIHx8IGlzU2Vzc2lvblNob3dNb3JlKGVsZW1lbnQpIHx8IGlzU2Vzc2lvblBsYWNlaG9sZGVyKGVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnNob3dDcmVhdGVHcm91cENvbnRleHRNZW51KGUuYW5jaG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNTZXNzaW9uR3JvdXBJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnNob3dHcm91cENvbnRleHRNZW51KGVsZW1lbnQsIGUuYW5jaG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZFNlc3Npb25zID0gdGhpcy5nZXRNdWx0aVNlbGVjdGVkU2Vzc2lvbnMoZWxlbWVudCk7XG5cblx0XHRjb25zdCBpbkdyb3VwID0gdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBPZlNlc3Npb24oZWxlbWVudC5zZXNzaW9uSWQpICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29udGV4dE92ZXJsYXk6IFtzdHJpbmcsIGJvb2xlYW4gfCBzdHJpbmddW10gPSBbXG5cdFx0XHRbSXNTZXNzaW9uUGlubmVkQ29udGV4dC5rZXksIHRoaXMuaXNTZXNzaW9uUGlubmVkKGVsZW1lbnQpXSxcblx0XHRcdFtTZXNzaW9uSXNBcmNoaXZlZENvbnRleHQua2V5LCBlbGVtZW50LmlzQXJjaGl2ZWQuZ2V0KCldLFxuXHRcdFx0W1Nlc3Npb25Jc1JlYWRDb250ZXh0LmtleSwgZWxlbWVudC5pc1JlYWQuZ2V0KCldLFxuXHRcdFx0W1Nlc3Npb25JdGVtSGFzQnJhbmNoTmFtZUNvbnRleHQua2V5LCAhIWVsZW1lbnQud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5icmFuY2hOYW1lPy50cmltKCldLFxuXHRcdFx0W1Nlc3Npb25JdGVtSW5Hcm91cENvbnRleHQua2V5LCBpbkdyb3VwXSxcblx0XHRcdFtTZXNzaW9uVHlwZUNvbnRleHQua2V5LCBlbGVtZW50LnNlc3Npb25UeXBlXSxcblx0XHRcdFtTZXNzaW9uUHJvdmlkZXJJZENvbnRleHQua2V5LCBlbGVtZW50LnByb3ZpZGVySWRdLFxuXHRcdFx0W1Nlc3Npb25TdXBwb3J0c1JlbmFtZUNvbnRleHQua2V5LCBlbGVtZW50LmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c1JlbmFtZSA/PyBmYWxzZV0sXG5cdFx0XHRbU2Vzc2lvblN1cHBvcnRzRGVsZXRlQ29udGV4dC5rZXksIGVsZW1lbnQuY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzRGVsZXRlID8/IGZhbHNlXSxcblx0XHRcdFtTZXNzaW9uSGFzUHVsbFJlcXVlc3RDb250ZXh0LmtleSwgISFlbGVtZW50LndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKT8ucHVsbFJlcXVlc3RdLFxuXHRcdF07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtZW51ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShTZXNzaW9uSXRlbUNvbnRleHRNZW51SWQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShjb250ZXh0T3ZlcmxheSkpKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBjb250cmlidXRpb25zIG9uIHRoaXMgbWVudSBuZWVkIGEgbWFyc2hhbGxlZCBBZ2VudFNlc3Npb25Db250ZXh0IGFyZzsgYnVpbHQtaW4gYWN0aW9ucyB0YWtlIElTZXNzaW9uW10uXG5cdFx0Y29uc3QgbWFyc2hhbGxlZEFyZyA9IHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5BZ2VudFNlc3Npb25Db250ZXh0LFxuXHRcdFx0c2Vzc2lvbjogeyByZXNvdXJjZTogZWxlbWVudC5yZXNvdXJjZSB9LFxuXHRcdFx0c2Vzc2lvbnM6IHNlbGVjdGVkU2Vzc2lvbnMubWFwKHMgPT4gKHsgcmVzb3VyY2U6IHMucmVzb3VyY2UgfSkpLFxuXHRcdH07XG5cdFx0Y29uc3Qgd3JhcEZvckV4dGVuc2lvbnMgPSAoYWN0aW9uOiBJQWN0aW9uKTogSUFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikgfHwgIWFjdGlvbi5pdGVtLnNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6IGFjdGlvbi5pZCxcblx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0Y2xhc3M6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0ZW5hYmxlZDogYWN0aW9uLmVuYWJsZWQsXG5cdFx0XHRcdHRvb2x0aXA6IGFjdGlvbi50b29sdGlwLFxuXHRcdFx0XHRjaGVja2VkOiBhY3Rpb24uY2hlY2tlZCxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGFjdGlvbi5pZCwgbWFyc2hhbGxlZEFyZyksXG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYmFzZUFjdGlvbnMgPSBTZXBhcmF0b3Iuam9pbiguLi5tZW51LmdldEFjdGlvbnMoeyBhcmc6IHNlbGVjdGVkU2Vzc2lvbnMsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLm1hcCgoWywgYWN0aW9uc10pID0+IGFjdGlvbnMubWFwKHdyYXBGb3JFeHRlbnNpb25zKSkpO1xuXHRcdGNvbnN0IGdyb3VwQWN0aW9ucyA9IHRoaXMuZ2V0R3JvdXBTZXNzaW9uQWN0aW9ucyhzZWxlY3RlZFNlc3Npb25zKTtcblx0XHRjb25zdCBhY3Rpb25zID0gZ3JvdXBBY3Rpb25zLmxlbmd0aCA+IDAgPyBbLi4uYmFzZUFjdGlvbnMsIG5ldyBTZXBhcmF0b3IoKSwgLi4uZ3JvdXBBY3Rpb25zXSA6IGJhc2VBY3Rpb25zO1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEtleUJpbmRpbmc6IChhY3Rpb24pID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpID8/IHVuZGVmaW5lZCxcblx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSBncm91cC1yZWxhdGVkIGNvbnRleHQgbWVudSBhY3Rpb25zIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbihzKTpcblx0ICogXCJDcmVhdGUgR3JvdXBcIiwgYW4gXCJBZGQgdG8gR3JvdXBcIi9cIk1vdmUgdG8gR3JvdXBcIiBzdWJtZW51IGxpc3RpbmcgdGhlXG5cdCAqIGdyb3VwcyBpbiBkaXNwbGF5IG9yZGVyLCBhbmQgXCJSZW1vdmUgZnJvbSBHcm91cFwiIHdoZW4gYXBwbGljYWJsZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0R3JvdXBTZXNzaW9uQWN0aW9ucyhzZWxlY3RlZDogSVNlc3Npb25bXSk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0aWYgKHNlbGVjdGVkLnNvbWUoc2Vzc2lvbiA9PiBzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCkpKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cblx0XHRhY3Rpb25zLnB1c2godGhpcy5nZXRDcmVhdGVHcm91cEFjdGlvbihzZWxlY3RlZCkpO1xuXG5cdFx0Y29uc3QgY3VycmVudEdyb3VwSWRzID0gbmV3IFNldChzZWxlY3RlZC5tYXAocyA9PiB0aGlzLl9zZXNzaW9uR3JvdXBzU2VydmljZS5nZXRHcm91cE9mU2Vzc2lvbihzLnNlc3Npb25JZCkpKTtcblx0XHRjb25zdCBjdXJyZW50R3JvdXBJZCA9IGN1cnJlbnRHcm91cElkcy5zaXplID09PSAxID8gWy4uLmN1cnJlbnRHcm91cElkc11bMF0gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB0YXJnZXRHcm91cHMgPSB0aGlzLmdldEdyb3Vwc0luRGlzcGxheU9yZGVyKCkuZmlsdGVyKGcgPT4gZy5pZCAhPT0gY3VycmVudEdyb3VwSWQpO1xuXHRcdGlmICh0YXJnZXRHcm91cHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3ViQWN0aW9ucyA9IHRhcmdldEdyb3Vwcy5tYXAoZyA9PiB0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiBgc2Vzc2lvbnMuYWRkVG9Hcm91cC4ke2cuaWR9YCxcblx0XHRcdFx0bGFiZWw6IGcubmFtZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmFkZFNlc3Npb25zVG9Hcm91cChzZWxlY3RlZCwgZy5pZCksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGN1cnJlbnRHcm91cElkICE9PSB1bmRlZmluZWQgPyBsb2NhbGl6ZSgnbW92ZVRvR3JvdXBBY3Rpb24nLCBcIk1vdmUgdG8gR3JvdXBcIikgOiBsb2NhbGl6ZSgnYWRkVG9Hcm91cEFjdGlvbicsIFwiQWRkIHRvIEdyb3VwXCIpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdzZXNzaW9ucy5hZGRUb0dyb3VwU3VibWVudScsIGxhYmVsLCBzdWJBY3Rpb25zKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRHcm91cElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnc2Vzc2lvbnMucmVtb3ZlRnJvbUdyb3VwJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZW1vdmVGcm9tR3JvdXBBY3Rpb24nLCBcIlJlbW92ZSBmcm9tIEdyb3VwXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2VsZWN0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLnJlbW92ZUZyb21Hcm91cChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDcmVhdGVHcm91cEFjdGlvbihzZXNzaW9ucz86IElTZXNzaW9uW10pOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5jcmVhdGVHcm91cCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NyZWF0ZUdyb3VwQWN0aW9uJywgXCJDcmVhdGUgR3JvdXBcIiksXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0aWYgKHNlc3Npb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVHcm91cEZyb21TZXNzaW9ucyhzZXNzaW9ucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVHcm91cChbXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dDcmVhdGVHcm91cENvbnRleHRNZW51KGFuY2hvcjogSVRyZWVDb250ZXh0TWVudUV2ZW50PFNlc3Npb25MaXN0SXRlbSB8IG51bGw+WydhbmNob3InXSk6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBbdGhpcy5nZXRDcmVhdGVHcm91cEFjdGlvbigpXSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93R3JvdXBDb250ZXh0TWVudShncm91cEl0ZW06IElTZXNzaW9uR3JvdXBJdGVtLCBhbmNob3I6IElUcmVlQ29udGV4dE1lbnVFdmVudDxTZXNzaW9uTGlzdEl0ZW0+WydhbmNob3InXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtcblx0XHRcdHRoaXMuZ2V0Q3JlYXRlR3JvdXBBY3Rpb24oKSxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdzZXNzaW9ucy5yZW5hbWVHcm91cEFjdGlvbicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVuYW1lR3JvdXBBY3Rpb24nLCBcIlJlbmFtZS4uLlwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmJlZ2luUmVuYW1lR3JvdXAoZ3JvdXBJdGVtLmdyb3VwLmlkKSxcblx0XHRcdH0pLFxuXHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ3Nlc3Npb25zLmRlbGV0ZUdyb3VwQWN0aW9uJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkZWxldGVHcm91cEFjdGlvbicsIFwiRGVsZXRlIEdyb3VwXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmRlbGV0ZUdyb3VwKGdyb3VwSXRlbS5ncm91cC5pZCksXG5cdFx0XHR9KSxcblx0XHRdO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0fSk7XG5cdH1cblxuXHRyZXNldFNlY3Rpb25Db2xsYXBzZVN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFNlc3Npb25zTGlzdC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHR9XG5cblx0Ly8gLS0gUGlubmluZyAtLVxuXG5cdHBpblNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgcGluU2Vzc2lvbnMoc2Vzc2lvbnM6IElTZXNzaW9uW10sIHRhcmdldD86IElTZXNzaW9uLCBwb3NpdGlvbj86ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IHZvaWQge1xuXHRcdGNvbnN0IHBpbm5hYmxlID0gc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4gIXNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHBpbm5hYmxlKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UucGluU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCAmJiBwb3NpdGlvbikge1xuXHRcdFx0dGhpcy5yZW9yZGVyU2Vzc2lvbnMocGlubmFibGUsIHRhcmdldCwgcG9zaXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHVucGluU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS51bnBpblNlc3Npb24oc2Vzc2lvbik7XG5cdH1cblxuXHRpc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbjogSVNlc3Npb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKTtcblx0fVxuXG5cdGdldFJlbmRlcmVkU2Vzc2lvbkdyb3VwKHNlc3Npb246IElTZXNzaW9uKTogSVNlc3Npb25Hcm91cCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSB8fCB0aGlzLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZ3JvdXBJZCA9IHRoaXMuX3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmdldEdyb3VwT2ZTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gZ3JvdXBJZCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogdGhpcy5fc2Vzc2lvbkdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdH1cblxuXHRpc1JlbmRlcmVkSW5DdXN0b21Hcm91cChzZXNzaW9uOiBJU2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldFJlbmRlcmVkU2Vzc2lvbkdyb3VwKHNlc3Npb24pICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogV2hldGhlciBhbnkgcmVnaXN0ZXJlZCBwcm92aWRlciBjYW4gY3JlYXRlIHF1aWNrIGNoYXRzIChnYXRlcyB0aGUgYWx3YXlzLXZpc2libGUgXCJDaGF0c1wiIHNlY3Rpb24pLiAqL1xuXHRwcml2YXRlIF9zb21lUHJvdmlkZXJTdXBwb3J0c1F1aWNrQ2hhdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKS5zb21lKHAgPT4gISFwLnN1cHBvcnRzUXVpY2tDaGF0cyk7XG5cdH1cblxuXHQvLyAtLSBSZWFkL1VucmVhZCAtLVxuXG5cdG1hcmtSZWFkKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrUmVhZChzZXNzaW9uKTtcblx0fVxuXG5cdG1hcmtVbnJlYWQoc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtVbnJlYWQoc2Vzc2lvbik7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIHR5cGUgZmlsdGVyaW5nIC0tXG5cblx0c2V0U2Vzc2lvblR5cGVFeGNsdWRlZChzZXNzaW9uVHlwZUlkOiBzdHJpbmcsIGV4Y2x1ZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGV4Y2x1ZGVkKSB7XG5cdFx0XHR0aGlzLmV4Y2x1ZGVkU2Vzc2lvblR5cGVzLmFkZChzZXNzaW9uVHlwZUlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5kZWxldGUoc2Vzc2lvblR5cGVJZCk7XG5cdFx0fVxuXHRcdHRoaXMuc2F2ZUV4Y2x1ZGVkU2Vzc2lvblR5cGVzKCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGlzU2Vzc2lvblR5cGVFeGNsdWRlZChzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5oYXMoc2Vzc2lvblR5cGVJZCk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRFeGNsdWRlZFNlc3Npb25UeXBlcygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU2Vzc2lvbnNMaXN0LkVYQ0xVREVEX1RZUEVTX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFyciA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJyKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgU2V0KGFycik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVFeGNsdWRlZFNlc3Npb25UeXBlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5leGNsdWRlZFNlc3Npb25UeXBlcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTZXNzaW9uc0xpc3QuRVhDTFVERURfVFlQRVNfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVEX1RZUEVTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMuZXhjbHVkZWRTZXNzaW9uVHlwZXNdKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0gU3RhdHVzIGZpbHRlcmluZyAtLVxuXG5cdHNldFN0YXR1c0V4Y2x1ZGVkKHN0YXR1czogU2Vzc2lvblN0YXR1cywgZXhjbHVkZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZXhjbHVkZWQpIHtcblx0XHRcdHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5hZGQoc3RhdHVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leGNsdWRlZFN0YXR1c2VzLmRlbGV0ZShzdGF0dXMpO1xuXHRcdH1cblx0XHR0aGlzLnNhdmVFeGNsdWRlZFN0YXR1c2VzKCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGlzU3RhdHVzRXhjbHVkZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5oYXMoc3RhdHVzKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEV4Y2x1ZGVkU3RhdHVzZXMoKTogU2V0PFNlc3Npb25TdGF0dXM+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTZXNzaW9uc0xpc3QuRVhDTFVERURfU1RBVFVTRVNfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYXJyID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhcnIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBTZXQoYXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjb3JydXB0IGRhdGFcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZUV4Y2x1ZGVkU3RhdHVzZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTZXNzaW9uc0xpc3QuRVhDTFVERURfU1RBVFVTRVNfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVEX1NUQVRVU0VTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnRoaXMuZXhjbHVkZWRTdGF0dXNlc10pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBBcmNoaXZlZCAvIFJlYWQgZmlsdGVyaW5nIC0tXG5cblx0c2V0RXhjbHVkZUFyY2hpdmVkKGV4Y2x1ZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9leGNsdWRlQXJjaGl2ZWQgPSBleGNsdWRlO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVfQVJDSElWRURfS0VZLCBleGNsdWRlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0aXNFeGNsdWRlQXJjaGl2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4Y2x1ZGVBcmNoaXZlZDtcblx0fVxuXG5cdHNldEV4Y2x1ZGVSZWFkKGV4Y2x1ZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9leGNsdWRlUmVhZCA9IGV4Y2x1ZGU7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTZXNzaW9uc0xpc3QuRVhDTFVERV9SRUFEX0tFWSwgZXhjbHVkZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGlzRXhjbHVkZVJlYWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4Y2x1ZGVSZWFkO1xuXHR9XG5cblx0cmVzZXRGaWx0ZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuZXhjbHVkZWRTZXNzaW9uVHlwZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNhdmVFeGNsdWRlZFNlc3Npb25UeXBlcygpO1xuXHRcdHRoaXMuZXhjbHVkZWRTdGF0dXNlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2F2ZUV4Y2x1ZGVkU3RhdHVzZXMoKTtcblx0XHR0aGlzLl9leGNsdWRlQXJjaGl2ZWQgPSB0cnVlO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVfQVJDSElWRURfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLl9leGNsdWRlUmVhZCA9IGZhbHNlO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU2Vzc2lvbnNMaXN0LkVYQ0xVREVfUkVBRF9LRVksIGZhbHNlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkID0gdHJ1ZTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNlc3Npb25zTGlzdC5XT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0dGhpcy5leHBhbmRlZFNlc3Npb25Hcm91cHMuY2xlYXIoKTtcblx0XHR0aGlzLmV4cGFuZGVkTW9yZUZvbGRlcnMgPSBmYWxzZTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Ly8gU2Vzc2lvbiBncm91cCBjYXBwaW5nXG5cblx0c2V0V29ya3NwYWNlR3JvdXBDYXBwZWQoY2FwcGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZCA9IGNhcHBlZDtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNlc3Npb25zTGlzdC5XT1JLU1BBQ0VfR1JPVVBfQ0FQUEVEX0tFWSwgY2FwcGVkLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRpZiAoY2FwcGVkKSB7XG5cdFx0XHR0aGlzLmV4cGFuZGVkU2Vzc2lvbkdyb3Vwcy5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0aXNXb3Jrc3BhY2VHcm91cENhcHBlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VHcm91cENhcHBlZDtcblx0fVxuXG5cdHNldE9wZW5XaW5kb3dTb3VyY2VGb2xkZXIoZm9sZGVyOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBiZWZvcmUgPSB0aGlzLm9wZW5XaW5kb3dTb3VyY2VGb2xkZXI/LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBmb2xkZXI/LnRvU3RyaW5nKCk7XG5cdFx0aWYgKGJlZm9yZSA9PT0gYWZ0ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5vcGVuV2luZG93U291cmNlRm9sZGVyID0gZm9sZGVyO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbFNlY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuc3VzcGVuZENvbGxhcHNlU3RhdGVQZXJzaXN0ZW5jZSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnN1c3BlbmRDb2xsYXBzZVN0YXRlUGVyc2lzdGVuY2UgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5zYXZlQnVsa0NvbGxhcHNlU3RhdGUodHJ1ZSk7XG5cdH1cblxuXHQvLyAtLSBTZWN0aW9uIGNvbGxhcHNlIHBlcnNpc3RlbmNlIC0tXG5cblx0cHJpdmF0ZSBnZXRTYXZlZENvbGxhcHNlU3RhdGUoc2VjdGlvbklkOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTZXNzaW9uc0xpc3QuU0VDVElPTl9DT0xMQVBTRV9TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc3RhdGVbc2VjdGlvbklkXSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlW3NlY3Rpb25JZF07XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVTZWN0aW9uQ29sbGFwc2VTdGF0ZShzZWN0aW9uSWQ6IHN0cmluZywgY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0bGV0IHN0YXRlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNlc3Npb25zTGlzdC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChyYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0aWYgKHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnICYmIHBhcnNlZCAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdFx0c3RhdGUgPSBwYXJzZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgY29ycnVwdCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN0YXRlW3NlY3Rpb25JZF0gPSBjb2xsYXBzZWQ7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTZXNzaW9uc0xpc3QuU0VDVElPTl9DT0xMQVBTRV9TVEFURV9LRVksIEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVCdWxrQ29sbGFwc2VTdGF0ZShjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZTogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMudHJlZS5nZXROb2RlKG51bGwpLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQuZWxlbWVudCAmJiBpc1Nlc3Npb25TZWN0aW9uKGNoaWxkLmVsZW1lbnQpKSB7XG5cdFx0XHRcdHN0YXRlW2NoaWxkLmVsZW1lbnQuaWRdID0gY29sbGFwc2VkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNlc3Npb25zTGlzdC5TRUNUSU9OX0NPTExBUFNFX1NUQVRFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQXBwcm92YWwgSGVscGVyc1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Rmlyc3RBcHByb3ZhbEFjcm9zc0NoYXRzKGFwcHJvdmFsTW9kZWw6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwsIHNlc3Npb246IElTZXNzaW9uLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQsKTogSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZCB7XG5cdGxldCBvbGRlc3Q6IElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgY2hhdCBvZiBzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKSkge1xuXHRcdGNvbnN0IGFwcHJvdmFsID0gYXBwcm92YWxNb2RlbC5nZXRBcHByb3ZhbChjaGF0LnJlc291cmNlKS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGFwcHJvdmFsICYmICghb2xkZXN0IHx8IGFwcHJvdmFsLnNpbmNlLmdldFRpbWUoKSA8IG9sZGVzdC5zaW5jZS5nZXRUaW1lKCkpKSB7XG5cdFx0XHRvbGRlc3QgPSBhcHByb3ZhbDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG9sZGVzdDtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBGb2xkZXIgTWF0Y2hpbmdcblxuZnVuY3Rpb24gc2Vzc2lvbk1hdGNoZXNGb2xkZXIoc2Vzc2lvbjogSVNlc3Npb24sIGZvbGRlcjogVVJJKTogYm9vbGVhbiB7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpO1xuXHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBmb2xkZXJTdHIgPSBmb2xkZXIudG9TdHJpbmcoKTtcblx0Zm9yIChjb25zdCBmb2xkZXIgb2Ygd29ya3NwYWNlLmZvbGRlcnMpIHtcblx0XHRpZiAoZm9sZGVyLndvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCkgPT09IGZvbGRlclN0ciB8fCBmb2xkZXIucm9vdC50b1N0cmluZygpID09PSBmb2xkZXJTdHIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU29ydGluZyAmIEdyb3VwaW5nIEhlbHBlcnNcblxuZXhwb3J0IGZ1bmN0aW9uIHNvcnRTZXNzaW9ucyhzZXNzaW9uczogSVNlc3Npb25bXSwgc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nLCBnZXRTb3J0S2V5PzogKHNlc3Npb246IElTZXNzaW9uLCBzb3J0aW5nOiBTZXNzaW9uc1NvcnRpbmcpID0+IG51bWJlcik6IElTZXNzaW9uW10ge1xuXHRjb25zdCBrZXkgPSBnZXRTb3J0S2V5ID8/IGRlZmF1bHRTb3J0S2V5O1xuXHRyZXR1cm4gWy4uLnNlc3Npb25zXS5zb3J0KChhLCBiKSA9PiBrZXkoYiwgc29ydGluZykgLSBrZXkoYSwgc29ydGluZykpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uTGltaXRSZXN1bHQge1xuXHRyZWFkb25seSBzZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXTtcblx0cmVhZG9ubHkgc2hvd01vcmU6IElTZXNzaW9uU2hvd01vcmUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaW1pdFNlc3Npb25zRm9yTGlzdChcblx0c2Vzc2lvbnM6IHJlYWRvbmx5IElTZXNzaW9uW10sXG5cdGxpbWl0OiBudW1iZXIsXG5cdG9wdGlvbnM6IHsgcmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjsgcmVhZG9ubHkgZXhwYW5kZWQ6IGJvb2xlYW47IHJlYWRvbmx5IHNlY3Rpb25JZDogc3RyaW5nOyByZWFkb25seSBzZWN0aW9uTGFiZWw6IHN0cmluZyB9LFxuKTogSVNlc3Npb25MaW1pdFJlc3VsdCB7XG5cdGlmICghb3B0aW9ucy5lbmFibGVkIHx8IHNlc3Npb25zLmxlbmd0aCA8PSBsaW1pdCkge1xuXHRcdHJldHVybiB7IHNlc3Npb25zLCBzaG93TW9yZTogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRpZiAob3B0aW9ucy5leHBhbmRlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9ucyxcblx0XHRcdHNob3dNb3JlOiB7XG5cdFx0XHRcdHNob3dNb3JlOiB0cnVlLFxuXHRcdFx0XHRraW5kOiAnc2Vzc2lvbnMnLFxuXHRcdFx0XHRtb2RlOiAnbGVzcycsXG5cdFx0XHRcdHNlY3Rpb25JZDogb3B0aW9ucy5zZWN0aW9uSWQsXG5cdFx0XHRcdHNlY3Rpb25MYWJlbDogb3B0aW9ucy5zZWN0aW9uTGFiZWwsXG5cdFx0XHRcdHJlbWFpbmluZ0NvdW50OiAwLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uczogc2Vzc2lvbnMuc2xpY2UoMCwgbGltaXQpLFxuXHRcdHNob3dNb3JlOiB7XG5cdFx0XHRzaG93TW9yZTogdHJ1ZSxcblx0XHRcdGtpbmQ6ICdzZXNzaW9ucycsXG5cdFx0XHRtb2RlOiAnbW9yZScsXG5cdFx0XHRzZWN0aW9uSWQ6IG9wdGlvbnMuc2VjdGlvbklkLFxuXHRcdFx0c2VjdGlvbkxhYmVsOiBvcHRpb25zLnNlY3Rpb25MYWJlbCxcblx0XHRcdHJlbWFpbmluZ0NvdW50OiBzZXNzaW9ucy5sZW5ndGggLSBsaW1pdCxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0U29ydEtleShzZXNzaW9uOiBJU2Vzc2lvbiwgc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nKTogbnVtYmVyIHtcblx0aWYgKHNvcnRpbmcgPT09IFNlc3Npb25zU29ydGluZy5VcGRhdGVkKSB7XG5cdFx0cmV0dXJuIHNlc3Npb24udXBkYXRlZEF0LmdldCgpLmdldFRpbWUoKTtcblx0fVxuXHRyZXR1cm4gc2Vzc2lvbi5jcmVhdGVkQXQuZ2V0VGltZSgpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW9yZGVyU29ydElucHV0IHtcblx0LyoqIERyYWdnZWQgc2Vzc2lvbiBpZHMgaW4gZGlzcGxheSAoZGVzY2VuZGluZy1rZXkpIG9yZGVyLiAqL1xuXHRyZWFkb25seSBkcmFnZ2VkSWRzOiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIE5hdHVyYWwgc29ydCBrZXkgcGVyIGRyYWdnZWQgc2Vzc2lvbiAoc2FtZSBvcmRlciBhcyB7QGxpbmsgZHJhZ2dlZElkc30pLiAqL1xuXHRyZWFkb25seSBuYXR1cmFsS2V5czogcmVhZG9ubHkgbnVtYmVyW107XG5cdC8qKiBFZmZlY3RpdmUga2V5IG9mIHRoZSBuZWlnaGJvdXIgYWJvdmUgdGhlIGRyb3AgcG9pbnQgKGhpZ2hlciksIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgYWJvdmVLZXk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIEVmZmVjdGl2ZSBrZXkgb2YgdGhlIG5laWdoYm91ciBiZWxvdyB0aGUgZHJvcCBwb2ludCAobG93ZXIpLCBpZiBhbnkuICovXG5cdHJlYWRvbmx5IGJlbG93S2V5OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBDdXJyZW50IHRpbWUsIHVzZWQgd2hlbiBkcm9wcGluZyBhYm92ZSB0aGUgZmlyc3Qgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgbm93OiBudW1iZXI7XG5cdC8qKiBTcGFjaW5nIHVzZWQgd2hlbiBzdGVwcGluZyBwYXN0IGFuIG9wZW4gYm91bmRhcnkuICovXG5cdHJlYWRvbmx5IGZhbGxiYWNrU3RlcDogbnVtYmVyO1xufVxuXG4vKipcbiAqIENvbXB1dGUgdGhlIG1hbnVhbCBzb3J0LW92ZXJyaWRlIGNoYW5nZXMgZm9yIGEgcmVvcmRlciBkcm9wLiBBc3NpZ25zIHRoZVxuICogZHJhZ2dlZCBibG9jayBzdHJpY3RseS1kZXNjZW5kaW5nIHN5bnRoZXRpYyBrZXlzIHNwcmVhZCBiZXR3ZWVuIHRoZVxuICogc3Vycm91bmRpbmcgbmVpZ2hib3VycywgZXhjZXB0IHdoZW4gdGhlIHNlc3Npb25zJyBuYXR1cmFsIGtleXMgYWxyZWFkeSBzb3J0XG4gKiB0aGVtIGludG8gdGhlIGRyb3BwZWQgc2xvdCBcdTIwMTQgaW4gd2hpY2ggY2FzZSBhbnkgZXhpc3Rpbmcgb3ZlcnJpZGUgaXMgZHJvcHBlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVSZW9yZGVyU29ydENoYW5nZXMoaW5wdXQ6IElSZW9yZGVyU29ydElucHV0KTogeyBzZXQ6IE1hcDxzdHJpbmcsIG51bWJlcj47IGNsZWFyOiBzdHJpbmdbXSB9IHtcblx0Y29uc3QgeyBkcmFnZ2VkSWRzLCBuYXR1cmFsS2V5cywgYWJvdmVLZXksIGJlbG93S2V5LCBub3csIGZhbGxiYWNrU3RlcCB9ID0gaW5wdXQ7XG5cdGNvbnN0IGNvdW50ID0gZHJhZ2dlZElkcy5sZW5ndGg7XG5cblx0Ly8gXCJEcm9wIHRoZSBmYWtlIHZhbHVlXCI6IHdoZW4gZXZlcnkgZHJhZ2dlZCBzZXNzaW9uJ3MgbmF0dXJhbCBrZXkgYWxyZWFkeVxuXHQvLyBsYW5kcyBzdHJpY3RseSBpbnNpZGUgdGhlIHN1cnJvdW5kaW5nIGdhcCAoYW5kIGluIGRlc2NlbmRpbmcgZGlzcGxheVxuXHQvLyBvcmRlciksIGNsZWFyIG92ZXJyaWRlcyBpbnN0ZWFkIG9mIHN0b3Jpbmcgc3ludGhldGljIGtleXMuXG5cdGNvbnN0IHVwcGVyRml0ID0gYWJvdmVLZXkgPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRjb25zdCBsb3dlckZpdCA9IGJlbG93S2V5ID8/IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblx0bGV0IG5hdHVyYWxGaXRzID0gdHJ1ZTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0aWYgKCEobmF0dXJhbEtleXNbaV0gPCB1cHBlckZpdCAmJiBuYXR1cmFsS2V5c1tpXSA+IGxvd2VyRml0KSkge1xuXHRcdFx0bmF0dXJhbEZpdHMgPSBmYWxzZTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpZiAoaSA+IDAgJiYgIShuYXR1cmFsS2V5c1tpXSA8IG5hdHVyYWxLZXlzW2kgLSAxXSkpIHtcblx0XHRcdG5hdHVyYWxGaXRzID0gZmFsc2U7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBzZXQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRjb25zdCBjbGVhcjogc3RyaW5nW10gPSBbXTtcblx0aWYgKG5hdHVyYWxGaXRzKSB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBkcmFnZ2VkSWRzKSB7XG5cdFx0XHRjbGVhci5wdXNoKGlkKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gU3ByZWFkIGBjb3VudGAgc3RyaWN0bHktZGVzY2VuZGluZyBzeW50aGV0aWMga2V5cyBhY3Jvc3MgdGhlIGdhcC4gQW5cblx0XHQvLyBvcGVuIHRvcCBib3VuZGFyeSB1c2VzIHRoZSBjdXJyZW50IHRpbWUgc28gdGhlIGJsb2NrIHNvcnRzIHRvIHRoZSB2ZXJ5XG5cdFx0Ly8gdG9wOyBhbiBvcGVuIGJvdHRvbSBib3VuZGFyeSBzdGVwcyBiZWxvdyB0aGUgbGFzdCBrZXkuXG5cdFx0Y29uc3QgdXBwZXIgPSBhYm92ZUtleSA/PyBub3c7XG5cdFx0Y29uc3QgbG93ZXIgPSBiZWxvd0tleSA/PyAodXBwZXIgLSAoY291bnQgKyAxKSAqIGZhbGxiYWNrU3RlcCk7XG5cdFx0Y29uc3Qgc3RlcCA9ICh1cHBlciAtIGxvd2VyKSAvIChjb3VudCArIDEpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0c2V0LnNldChkcmFnZ2VkSWRzW2ldLCB1cHBlciAtIChpICsgMSkgKiBzdGVwKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgc2V0LCBjbGVhciB9O1xufVxuXG4vKiogRml4ZWQgc2VjdGlvbiBpZCBmb3Igd29ya3NwYWNlLWxlc3MgXCJxdWljayBjaGF0XCIgc2Vzc2lvbnMuICovXG5leHBvcnQgY29uc3QgUVVJQ0tfQ0hBVFNfU0VDVElPTl9JRCA9ICdxdWlja2NoYXRzJztcblxuLyoqXG4gKiBXaGV0aGVyIGEgc2Vzc2lvbiBpcyBhIHdvcmtzcGFjZS1sZXNzIFwicXVpY2sgY2hhdFwiLCBwZXIgdGhlIHNlc3Npb24ncyBvd25cbiAqIHtAbGluayBJU2Vzc2lvbi5pc1F1aWNrQ2hhdH0gZmxhZyAoYWJzZW50IG1lYW5zIGBmYWxzZWApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNRdWlja0NoYXRTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSA/PyBmYWxzZTtcbn1cblxuLyoqIFdoZXRoZXIgYSBzZXNzaW9uIGlzIGFzc29jaWF0ZWQgd2l0aCBhbiBhdXRvbWF0aW9uIHJ1bi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0F1dG9tYXRpb25TZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXNzaW9uLmlzQXV0b21hdGlvbj8uZ2V0KCkgPz8gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBncm91cFNlc3Npb25zRm9yTGlzdChcblx0c2Vzc2lvbnM6IElTZXNzaW9uW10sXG5cdGdyb3VwaW5nOiBTZXNzaW9uc0dyb3VwaW5nLFxuXHRzb3J0aW5nOiBTZXNzaW9uc1NvcnRpbmcsXG5cdGlzU2Vzc2lvblBpbm5lZDogKHNlc3Npb246IElTZXNzaW9uKSA9PiBib29sZWFuLFxuXHRnZXRTb3J0S2V5PzogKHNlc3Npb246IElTZXNzaW9uLCBzb3J0aW5nOiBTZXNzaW9uc1NvcnRpbmcpID0+IG51bWJlcixcblx0YXJjaGl2ZWRTZWN0aW9uTGFiZWw6IHN0cmluZyA9IGdldENoYXRTZXNzaW9uQXJjaGl2ZWRTZWN0aW9uTGFiZWwoQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lKSxcbik6IElTZXNzaW9uU2VjdGlvbltdIHtcblx0Y29uc3Qgc29ydGVkID0gc29ydFNlc3Npb25zKHNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+ICFpc0F1dG9tYXRpb25TZXNzaW9uKHNlc3Npb24pKSwgc29ydGluZywgZ2V0U29ydEtleSk7XG5cblx0Ly8gQXJjaGl2ZWQgd2lucyBvdmVyIHBpbm5lZCAoZG9uZSBzZXNzaW9ucyBzdGF5IGdyb3VwZWQpOyBwaW5uZWQgd2lucyBvdmVyIHRoZVxuXHQvLyBxdWljay1jaGF0cyBidWNrZXQgc28gYSBwaW5uZWQgcXVpY2sgY2hhdCBzdGlsbCBzdXJmYWNlcyBpbiBQaW5uZWQuXG5cdGNvbnN0IHBpbm5lZDogSVNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCBhcmNoaXZlZDogSVNlc3Npb25bXSA9IFtdO1xuXHRjb25zdCBxdWlja0NoYXRzOiBJU2Vzc2lvbltdID0gW107XG5cdGNvbnN0IHJlZ3VsYXI6IElTZXNzaW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNvcnRlZCkge1xuXHRcdGlmIChzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCkpIHtcblx0XHRcdGFyY2hpdmVkLnB1c2goc2Vzc2lvbik7XG5cdFx0fSBlbHNlIGlmIChpc1Nlc3Npb25QaW5uZWQoc2Vzc2lvbikpIHtcblx0XHRcdHBpbm5lZC5wdXNoKHNlc3Npb24pO1xuXHRcdH0gZWxzZSBpZiAoaXNRdWlja0NoYXRTZXNzaW9uKHNlc3Npb24pKSB7XG5cdFx0XHRxdWlja0NoYXRzLnB1c2goc2Vzc2lvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlZ3VsYXIucHVzaChzZXNzaW9uKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBzZWN0aW9uczogSVNlc3Npb25TZWN0aW9uW10gPSBbXTtcblx0aWYgKHBpbm5lZC5sZW5ndGggPiAwKSB7XG5cdFx0c2VjdGlvbnMucHVzaCh7IGlkOiAncGlubmVkJywgbGFiZWw6IGxvY2FsaXplKCdwaW5uZWQnLCBcIlBpbm5lZFwiKSwgc2Vzc2lvbnM6IHBpbm5lZCB9KTtcblx0fVxuXG5cdC8vIFF1aWNrIGNoYXRzIHJlbmRlciBhcyBhIHNpbmdsZSBcIkNoYXRzXCIgZW50cnkgZGlyZWN0bHkgYmVsb3cgUGlubmVkIChhYm92ZVxuXHQvLyB0aGUgd29ya3NwYWNlL2RhdGUgZ3JvdXBzKSwgcmVnYXJkbGVzcyBvZiBncm91cGluZyBtb2RlLlxuXHRpZiAocXVpY2tDaGF0cy5sZW5ndGggPiAwKSB7XG5cdFx0c2VjdGlvbnMucHVzaCh7IGlkOiBRVUlDS19DSEFUU19TRUNUSU9OX0lELCBsYWJlbDogbG9jYWxpemUoJ2NoYXRzU2VjdGlvbicsIFwiQ2hhdHNcIiksIHNlc3Npb25zOiBxdWlja0NoYXRzIH0pO1xuXHR9XG5cblx0c2VjdGlvbnMucHVzaCguLi4oZ3JvdXBpbmcgPT09IFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlXG5cdFx0PyBncm91cEJ5V29ya3NwYWNlKHJlZ3VsYXIpXG5cdFx0OiBncm91cEJ5RGF0ZShyZWd1bGFyLCBzb3J0aW5nLCBnZXRTb3J0S2V5KSkpO1xuXG5cdGlmIChhcmNoaXZlZC5sZW5ndGggPiAwKSB7XG5cdFx0c2VjdGlvbnMucHVzaCh7IGlkOiAnYXJjaGl2ZWQnLCBsYWJlbDogYXJjaGl2ZWRTZWN0aW9uTGFiZWwsIHNlc3Npb25zOiBhcmNoaXZlZCB9KTtcblx0fVxuXG5cdHJldHVybiBzZWN0aW9ucztcbn1cblxuLyoqIFRoZSB3b3Jrc3BhY2UgZ3JvdXAgbGFiZWwgYSBzZXNzaW9uIGJlbG9uZ3MgdG8gKG1hdGNoZXMge0BsaW5rIGdyb3VwQnlXb3Jrc3BhY2V9KS4gKi9cbmZ1bmN0aW9uIHNlc3Npb25Xb3Jrc3BhY2VMYWJlbChzZXNzaW9uOiBJU2Vzc2lvbik6IHN0cmluZyB7XG5cdHJldHVybiBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8ubGFiZWwgfHwgbG9jYWxpemUoJ3Vua25vd24nLCBcIlVua25vd25cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBncm91cEJ5V29ya3NwYWNlKHNlc3Npb25zOiBJU2Vzc2lvbltdKTogSVNlc3Npb25TZWN0aW9uW10ge1xuXHRjb25zdCBncm91cHMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb25bXT4oKTtcblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0Y29uc3QgbGFiZWwgPSBzZXNzaW9uV29ya3NwYWNlTGFiZWwoc2Vzc2lvbik7XG5cdFx0bGV0IGdyb3VwID0gZ3JvdXBzLmdldChsYWJlbCk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0Z3JvdXAgPSBbXTtcblx0XHRcdGdyb3Vwcy5zZXQobGFiZWwsIGdyb3VwKTtcblx0XHR9XG5cdFx0Z3JvdXAucHVzaChzZXNzaW9uKTtcblx0fVxuXG5cdGNvbnN0IHVua25vd25Xb3Jrc3BhY2VMYWJlbCA9IGxvY2FsaXplKCd1bmtub3duJywgXCJVbmtub3duXCIpO1xuXHRjb25zdCBvcmRlciA9IFsuLi5ncm91cHMua2V5cygpXVxuXHRcdC5maWx0ZXIoayA9PiBrICE9PSB1bmtub3duV29ya3NwYWNlTGFiZWwpXG5cdFx0LnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cblx0Y29uc3QgcmVzdWx0OiBJU2Vzc2lvblNlY3Rpb25bXSA9IG9yZGVyLm1hcChsYWJlbCA9PiAoe1xuXHRcdGlkOiBgd29ya3NwYWNlOiR7bGFiZWx9YCxcblx0XHRsYWJlbCxcblx0XHRzZXNzaW9uczogZ3JvdXBzLmdldChsYWJlbCkhLFxuXHR9KSk7XG5cblx0Ly8gXCJVbmtub3duIFdvcmtzcGFjZVwiIGFsd2F5cyBhdCB0aGUgYm90dG9tXG5cdGNvbnN0IHVua25vd25Xb3Jrc3BhY2UgPSBncm91cHMuZ2V0KHVua25vd25Xb3Jrc3BhY2VMYWJlbCk7XG5cdGlmICh1bmtub3duV29ya3NwYWNlKSB7XG5cdFx0cmVzdWx0LnB1c2goeyBpZDogYHdvcmtzcGFjZToke3Vua25vd25Xb3Jrc3BhY2VMYWJlbH1gLCBsYWJlbDogdW5rbm93bldvcmtzcGFjZUxhYmVsLCBzZXNzaW9uczogdW5rbm93bldvcmtzcGFjZSB9KTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBNYXhpbXVtIG51bWJlciBvZiBzZXNzaW9ucyBzaG93biBpbiB0aGUgXCJSZWNlbnRcIiBkYXRlIHNlY3Rpb24uICovXG5jb25zdCBSRUNFTlRfU0VTU0lPTlNfTElNSVQgPSAxMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdyb3VwQnlEYXRlKHNlc3Npb25zOiBJU2Vzc2lvbltdLCBzb3J0aW5nOiBTZXNzaW9uc1NvcnRpbmcsIGdldFNvcnRLZXk/OiAoc2Vzc2lvbjogSVNlc3Npb24sIHNvcnRpbmc6IFNlc3Npb25zU29ydGluZykgPT4gbnVtYmVyKTogSVNlc3Npb25TZWN0aW9uW10ge1xuXHRjb25zdCBrZXkgPSBnZXRTb3J0S2V5ID8/IGRlZmF1bHRTb3J0S2V5O1xuXHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuXHRjb25zdCBzdGFydE9mVG9kYXkgPSBuZXcgRGF0ZShub3cuZ2V0RnVsbFllYXIoKSwgbm93LmdldE1vbnRoKCksIG5vdy5nZXREYXRlKCkpLmdldFRpbWUoKTtcblx0Y29uc3Qgc3RhcnRPZldlZWsgPSBzdGFydE9mVG9kYXkgLSA3ICogODZfNDAwXzAwMDtcblxuXHRjb25zdCByZWNlbnQ6IElTZXNzaW9uW10gPSBbXTtcblx0Y29uc3Qgb2xkZXI6IElTZXNzaW9uW10gPSBbXTtcblxuXHQvLyBgc2Vzc2lvbnNgIGFycml2ZSBzb3J0ZWQgbW9zdC1yZWNlbnQtZmlyc3QsIHNvIHRoZSBmaXJzdCBzZXNzaW9ucyB3aXRoaW5cblx0Ly8gdGhlIGxhc3QgNyBkYXlzIChjYXBwZWQgYXQgUkVDRU5UX1NFU1NJT05TX0xJTUlUKSBmb3JtIHRoZSBcIlJlY2VudFwiXG5cdC8vIHNlY3Rpb247IGV2ZXJ5dGhpbmcgZWxzZSBmYWxscyBpbnRvIFwiT2xkZXJcIi5cblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0Y29uc3QgdGltZSA9IGtleShzZXNzaW9uLCBzb3J0aW5nKTtcblxuXHRcdGlmICh0aW1lID49IHN0YXJ0T2ZXZWVrICYmIHJlY2VudC5sZW5ndGggPCBSRUNFTlRfU0VTU0lPTlNfTElNSVQpIHtcblx0XHRcdHJlY2VudC5wdXNoKHNlc3Npb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvbGRlci5wdXNoKHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHNlY3Rpb25zOiBJU2Vzc2lvblNlY3Rpb25bXSA9IFtdO1xuXHRjb25zdCBhZGRHcm91cCA9IChpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBncm91cFNlc3Npb25zOiBJU2Vzc2lvbltdKSA9PiB7XG5cdFx0aWYgKGdyb3VwU2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0c2VjdGlvbnMucHVzaCh7IGlkLCBsYWJlbCwgc2Vzc2lvbnM6IGdyb3VwU2Vzc2lvbnMgfSk7XG5cdFx0fVxuXHR9O1xuXG5cdGFkZEdyb3VwKCdyZWNlbnQnLCBsb2NhbGl6ZSgncmVjZW50JywgXCJSZWNlbnRcIiksIHJlY2VudCk7XG5cdGFkZEdyb3VwKCdvbGRlcicsIGxvY2FsaXplKCdvbGRlcicsIFwiT2xkZXJcIiksIG9sZGVyKTtcblxuXHRyZXR1cm4gc2VjdGlvbnM7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRmxhdCBMaXN0XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25zRmxhdExpc3RPcHRpb25zIHtcblx0cmVhZG9ubHkgb3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG5cdHJlYWRvbmx5IHNob3dTZXNzaW9uSG92ZXI/OiBib29sZWFuO1xuXHQvKiogQ2FsbGVkIHdoZW4gYSBzZXNzaW9uIHJvdyBpcyBvcGVuZWQgKGNsaWNrZWQgLyBhY3RpdmF0ZWQpLiAqL1xuXHRvblNlc3Npb25PcGVuKHJlc291cmNlOiBVUkksIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4sIHNpZGVCeVNpZGU6IGJvb2xlYW4pOiB2b2lkO1xuXHQvKipcblx0ICogQXBwcm92YWwgbW9kZWwgdHJhY2tpbmcgcGVuZGluZyB0b29sIGNvbmZpcm1hdGlvbnMgZm9yIHRoZSBzaG93biBzZXNzaW9ucy5cblx0ICogV2hlbiBvbWl0dGVkIHRoZSBsaXN0IGNyZWF0ZXMgYW5kIG93bnMgaXRzIG93bjsgaW5qZWN0YWJsZSBzbyB0ZXN0cyBhbmRcblx0ICogZml4dHVyZXMgY2FuIHN1cHBseSBwZW5kaW5nIGFwcHJvdmFscyB3aXRob3V0IGEgbGl2ZSBjaGF0IHNlc3Npb24uXG5cdCAqL1xuXHRyZWFkb25seSBhcHByb3ZhbE1vZGVsPzogQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbDtcblx0LyoqXG5cdCAqIFN1cHBsaWVzIHRoZSBwZXItc2Vzc2lvbiBcIkZpeCBDSVwiIHJvdyBmb3Igc2Vzc2lvbnMgd2hvc2UgcHVsbCByZXF1ZXN0IGhhc1xuXHQgKiBmYWlsaW5nIENJIGNoZWNrcy4gT25seSB0aGUgYmxvY2tlZC1zZXNzaW9ucyBkcm9wZG93biBwYXNzZXMgb25lLCBzbyB0aGUgcm93XG5cdCAqIG5ldmVyIGFwcGVhcnMgaW4gb3RoZXIgbGlzdHMuIFdoZW4gb21pdHRlZCBubyBmaXgtQ0kgcm93cyBhcmUgcmVuZGVyZWQuXG5cdCAqL1xuXHRyZWFkb25seSBjaUZpeE1vZGVsPzogSVNlc3Npb25DSUZpeE1vZGVsO1xuXHQvKipcblx0ICogTWF4aW11bSBudW1iZXIgb2YgdGVybWluYWwtY29tbWFuZCBsaW5lcyBzaG93biBpbiBhIHNlc3Npb24ncyBhcHByb3ZhbFxuXHQgKiBwcm9tcHQuIERlZmF1bHRzIHRvIHRoZSBzYW1lIGxpbWl0IGFzIHRoZSBtYWluIHNlc3Npb25zIGxpc3Q7IHRoZVxuXHQgKiBibG9ja2VkLXNlc3Npb25zIGRyb3Bkb3duIHBhc3NlcyBhIGxhcmdlciB2YWx1ZS5cblx0ICovXG5cdHJlYWRvbmx5IGFwcHJvdmFsUm93TWF4TGluZXM/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBNZW51IHVzZWQgYnkgZWFjaCBzZXNzaW9uIHJvdydzIGlubGluZSB0b29sYmFyLiBEZWZhdWx0cyB0byB0aGUgbWFpbiBzZXNzaW9uc1xuXHQgKiBpdGVtIHRvb2xiYXIgbWVudS5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xiYXJNZW51SWQ/OiBNZW51SWQ7XG5cdC8qKiBBbGxvd3MgZm9jdXNlZCBsaXN0IHN1cmZhY2VzIHRvIGhhbmRsZSBhY3Rpb25zIGZyb20gdGhlaXIgY3VzdG9tIHRvb2xiYXIgbWVudS4gKi9cblx0cmVhZG9ubHkgb25Ub29sYmFyQWN0aW9uPzogKGFjdGlvbjogSUFjdGlvbiwgc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+O1xuXHQvKiogV2hldGhlciBvcGVuaW5nIGEgcm93IGltbWVkaWF0ZWx5IG1hcmtzIGl0cyBzZXNzaW9uIGFzIHJlYWQuIERlZmF1bHRzIHRvIGB0cnVlYC4gKi9cblx0cmVhZG9ubHkgbWFya1Nlc3Npb25SZWFkT25PcGVuPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gYGZhbHNlYCB3aGVlbCBldmVudHMgYnViYmxlIHRvIHRoZSBwYXJlbnQgc2Nyb2xsZXIgaW5zdGVhZCBvZiBiZWluZ1xuXHQgKiBjb25zdW1lZCBieSB0aGUgZW1iZWRkZWQgdHJlZS4gRGVmYXVsdHMgdG8gYHRydWVgIChzdGFuZGFyZCBsaXN0IGJlaGF2aW9yKS5cblx0ICovXG5cdHJlYWRvbmx5IGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBBIGxpZ2h0d2VpZ2h0LCBmbGF0IHNlc3Npb25zIGxpc3QgdGhhdCByZW5kZXJzIHNlc3Npb24gcm93cyBleGFjdGx5IGxpa2UgdGhlXG4gKiBtYWluIHtAbGluayBTZXNzaW9uc0xpc3R9IGJ1dCB3aXRob3V0IGFueSBzZWN0aW9ucywgZ3JvdXBzIG9yIHdvcmtzcGFjZVxuICogaGVhZGVycy4gT25seSB0aGUgc2Vzc2lvbnMgcGFzc2VkIHRvIHtAbGluayBzZXRTZXNzaW9uc30gYXJlIHNob3duLiBVc2VkIGJ5XG4gKiBzdXJmYWNlcyB0aGF0IG5lZWQgYSBmb2N1c2VkLCBzZWN0aW9ubGVzcyB2aWV3IG9mIGEgc3BlY2lmaWMgc2V0IG9mIHNlc3Npb25zXG4gKiAoZS5nLiB0aGUgdGl0bGViYXIgXCJOIGJsb2NrZWRcIiBob3ZlcikuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc0ZsYXRMaXN0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUk9XX0hFSUdIVCA9IDU0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQXBwcm92ZVNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQXBwcm92ZWRTZXNzaW9uPigpKTtcblx0LyoqIEZpcmVzIHdoZW4gYSBzZXNzaW9uJ3MgcGVuZGluZyBhY3Rpb24gaXMgYXBwcm92ZWQgZnJvbSBpdHMgXCJBbGxvd1wiIGJ1dHRvbi4gKi9cblx0cmVhZG9ubHkgb25EaWRBcHByb3ZlU2Vzc2lvbjogRXZlbnQ8SUFwcHJvdmVkU2Vzc2lvbj4gPSB0aGlzLl9vbkRpZEFwcHJvdmVTZXNzaW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyZWU6IFdvcmtiZW5jaE9iamVjdFRyZWU8U2Vzc2lvbkxpc3RJdGVtLCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVsZWdhdGU6IFNlc3Npb25zVHJlZURlbGVnYXRlO1xuXHRwcml2YXRlIF9zZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJU2Vzc2lvbnNGbGF0TGlzdE9wdGlvbnMsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZTogSVNlc3Npb25zTGlzdE1vZGVsU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHNlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASVZvaWNlUGxheWJhY2tTZXJ2aWNlIHZvaWNlUGxheWJhY2tTZXJ2aWNlOiBJVm9pY2VQbGF5YmFja1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBXcmFwIGluIGAuc2Vzc2lvbnMtbGlzdC1jb250cm9sYCBzbyB0aGUgcm93IHN0eWxlcyBzY29wZWQgdG8gdGhhdCBjbGFzc1xuXHRcdC8vIChuZWVkcy1pbnB1dC9waW5uZWQgcm93IGhpZ2hsaWdodHMpIGFwcGx5IGV4YWN0bHkgbGlrZSB0aGUgbWFpbiBsaXN0LlxuXHRcdGNvbnN0IGxpc3RSb290ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXNzaW9ucy1saXN0LWNvbnRyb2wnKSk7XG5cdFx0Y29uc3QgYXBwcm92YWxNb2RlbCA9IHRoaXMub3B0aW9ucy5hcHByb3ZhbE1vZGVsID8/IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwpKTtcblxuXHRcdC8vIFRFTVBPUkFSWSAoIzMyMDQ4MCk6IHRoZSByb3cgcmVuZGVyZXIgcmVhY2hlcyBpbnRvIGEgQ29waWxvdC1wcm92aWRlclxuXHRcdC8vIGludGVybmFsIHRvIGxhemlseSByZXNvbHZlIGV4cGVuc2l2ZSBzZXNzaW9uIHByb3BlcnRpZXMuIFJlc29sdmVkIHZpYVxuXHRcdC8vIHRoZSBpbnN0YW50aWF0aW9uIHNlcnZpY2Ugc28gdGhpcyBmaWxlJ3Mgc2luZ2xlIHN1cHByZXNzZWQgaW1wb3J0IHN0YXlzXG5cdFx0Ly8gdGhlIG9ubHkgcmVmZXJlbmNlLiBTZWUgdGhlIG5vdGUgb24gdGhlIGBJQWdlbnRTZXNzaW9uc1NlcnZpY2VgIGltcG9ydC5cblx0XHRjb25zdCBhZ2VudFNlc3Npb25zU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJQWdlbnRTZXNzaW9uc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHNlc3Npb25SZW5kZXJlciA9IG5ldyBTZXNzaW9uSXRlbVJlbmRlcmVyKFxuXHRcdFx0e1xuXHRcdFx0XHRncm91cGluZzogKCkgPT4gU2Vzc2lvbnNHcm91cGluZy5EYXRlLFxuXHRcdFx0XHRpc1Bpbm5lZDogcyA9PiB0aGlzLl9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuaXNTZXNzaW9uUGlubmVkKHMpLFxuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbnM6IHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMsXG5cdFx0XHRcdGdldE11bHRpU2VsZWN0ZWRTZXNzaW9uczogcyA9PiBbc10sXG5cdFx0XHRcdHNob3dIb3ZlcjogdGhpcy5vcHRpb25zLnNob3dTZXNzaW9uSG92ZXIgPz8gdHJ1ZSxcblx0XHRcdFx0YXBwcm92YWxSb3dNYXhMaW5lczogdGhpcy5vcHRpb25zLmFwcHJvdmFsUm93TWF4TGluZXMgPz8gREVGQVVMVF9BUFBST1ZBTF9ST1dfTUFYX0xJTkVTLFxuXHRcdFx0XHR0b29sYmFyTWVudUlkOiB0aGlzLm9wdGlvbnMudG9vbGJhck1lbnVJZCA/PyBTZXNzaW9uSXRlbVRvb2xiYXJNZW51SWQsXG5cdFx0XHRcdGhhbmRsZVRvb2xiYXJBY3Rpb246IHRoaXMub3B0aW9ucy5vblRvb2xiYXJBY3Rpb24sXG5cdFx0XHR9LFxuXHRcdFx0YXBwcm92YWxNb2RlbCxcblx0XHRcdHRoaXMub3B0aW9ucy5jaUZpeE1vZGVsLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0XHRcdG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0aG92ZXJTZXJ2aWNlLFxuXHRcdFx0c2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHR2b2ljZVBsYXliYWNrU2VydmljZSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBuZXcgU2Vzc2lvbnNUcmVlRGVsZWdhdGUoYXBwcm92YWxNb2RlbCwgKCkgPT4gZmFsc2UsIHRoaXMub3B0aW9ucy5hcHByb3ZhbFJvd01heExpbmVzID8/IERFRkFVTFRfQVBQUk9WQUxfUk9XX01BWF9MSU5FUywgdGhpcy5vcHRpb25zLmNpRml4TW9kZWwpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPFNlc3Npb25MaXN0SXRlbSwgRnV6enlTY29yZT4sXG5cdFx0XHQnU2Vzc2lvbnNGbGF0TGlzdCcsXG5cdFx0XHRsaXN0Um9vdCxcblx0XHRcdHRoaXMuX2RlbGVnYXRlLFxuXHRcdFx0W3Nlc3Npb25SZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFNlc3Npb25zQWNjZXNzaWJpbGl0eVByb3ZpZGVyKHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdGdyb3VwaW5nOiAoKSA9PiBTZXNzaW9uc0dyb3VwaW5nLkRhdGUsXG5cdFx0XHRcdFx0aXNQaW5uZWQ6IHNlc3Npb24gPT4gdGhpcy5fc2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLmlzU2Vzc2lvblBpbm5lZChzZXNzaW9uKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQ6IFNlc3Npb25MaXN0SXRlbSkgPT4gKGVsZW1lbnQgYXMgSVNlc3Npb24pLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdGhpcy5vcHRpb25zLmFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsID8/IHRydWUsXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdGluZGVudDogMCxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMub3B0aW9ucy5vdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0cmVuZGVySW5kZW50R3VpZGVzOiBSZW5kZXJJbmRlbnRHdWlkZXMuTm9uZSxcblx0XHRcdFx0dHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzczogKCkgPT4gJ2ZvcmNlLW5vLXR3aXN0aWUnLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoIWVsZW1lbnQgfHwgIWlzU2Vzc2lvbkl0ZW0oZWxlbWVudCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5tYXJrU2Vzc2lvblJlYWRPbk9wZW4gIT09IGZhbHNlKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UubWFya1JlYWQoZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0xlZnRDbGljayA9IERPTS5pc01vdXNlRXZlbnQoZS5icm93c2VyRXZlbnQpICYmIGUuYnJvd3NlckV2ZW50LmJ1dHRvbiA9PT0gMDtcblx0XHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSBpc0xlZnRDbGljayA/IGZhbHNlIDogKGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzID8/IGZhbHNlKTtcblx0XHRcdHRoaXMub3B0aW9ucy5vblNlc3Npb25PcGVuKGVsZW1lbnQucmVzb3VyY2UsIHByZXNlcnZlRm9jdXMsIGUuc2lkZUJ5U2lkZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvblJlbmRlcmVyLm9uRGlkQ2hhbmdlSXRlbUhlaWdodChzZXNzaW9uID0+IHtcblx0XHRcdGlmICh0aGlzLnRyZWUuaGFzRWxlbWVudChzZXNzaW9uKSkge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlRWxlbWVudEhlaWdodChzZXNzaW9uLCB0aGlzLl9kZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbikpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25SZW5kZXJlci5vbkRpZEFwcHJvdmVTZXNzaW9uKGFwcHJvdmVkID0+IHRoaXMuX29uRGlkQXBwcm92ZVNlc3Npb24uZmlyZShhcHByb3ZlZCkpKTtcblx0fVxuXG5cdHNldFNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMgPSBzZXNzaW9ucztcblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gKHsgZWxlbWVudDogc2Vzc2lvbiB9KSkpO1xuXHR9XG5cblx0LyoqIFRoZSB0b3RhbCBwaXhlbCBoZWlnaHQgcmVxdWlyZWQgdG8gcmVuZGVyIGFsbCBjdXJyZW50IHJvd3Mgd2l0aG91dCBzY3JvbGxpbmcuICovXG5cdGdldENvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMucmVkdWNlKCh0b3RhbCwgc2Vzc2lvbikgPT4gdG90YWwgKyB0aGlzLl9kZWxlZ2F0ZS5nZXRIZWlnaHQoc2Vzc2lvbiksIDApO1xuXHR9XG5cblx0Z2V0Um93SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFNlc3Npb25zRmxhdExpc3QuUk9XX0hFSUdIVDtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlLmhhc0VsZW1lbnQoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy50cmVlLnNldEZvY3VzKFtzZXNzaW9uXSk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyw4QkFBOEIsZ0NBQWdDO0FBQ3ZFLFNBQVMsZUFBZTtBQUN4QixTQUErQiw0QkFBNEIsd0JBQXdCLDRCQUE0QjtBQUUvRyxTQUE4RSxzQ0FBK0U7QUFDN0osU0FBUyxvQkFBb0Isb0JBQW9CO0FBQ2pELFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMs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LGFBQWEsV0FBVztBQUNsRixZQUFNLGdCQUFnQixjQUFjLFFBQVMsRUFBRSxjQUFjLGlCQUFpQjtBQUM5RSxXQUFLLFFBQVEsY0FBYyxRQUFRLFVBQVUsZUFBZSxFQUFFLFVBQVU7QUFBQSxJQUN6RSxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsZ0JBQWdCLHNCQUFzQixhQUFXO0FBQy9ELFVBQUksS0FBSyxLQUFLLFdBQVcsT0FBTyxHQUFHO0FBQ2xDLGFBQUssS0FBSyxvQkFBb0IsU0FBUyxLQUFLLFVBQVUsVUFBVSxPQUFPLENBQUM7QUFDeEUsYUFBSywwQkFBMEIsS0FBSztBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsZ0JBQWdCLG9CQUFvQixjQUFZLEtBQUsscUJBQXFCLEtBQUssUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN6RztBQUFBLEVBRUEsWUFBWSxVQUFxQztBQUNoRCxTQUFLLFlBQVk7QUFDakIsU0FBSyxLQUFLLFlBQVksTUFBTSxTQUFTLElBQUksY0FBWSxFQUFFLFNBQVMsUUFBUSxFQUFFLENBQUM7QUFBQSxFQUM1RTtBQUFBO0FBQUEsRUFHQSxtQkFBMkI7QUFDMUIsV0FBTyxLQUFLLFVBQVUsT0FBTyxDQUFDLE9BQU8sWUFBWSxRQUFRLEtBQUssVUFBVSxVQUFVLE9BQU8sR0FBRyxDQUFDO0FBQUEsRUFDOUY7QUFBQSxFQUVBLGVBQXVCO0FBQ3RCLFdBQU8saUJBQWlCO0FBQUEsRUFDekI7QUFBQSxFQUVBLE9BQU8sUUFBZ0IsT0FBcUI7QUFDM0MsU0FBSyxLQUFLLE9BQU8sUUFBUSxLQUFLO0FBQUEsRUFDL0I7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLEtBQUssU0FBUztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxhQUFhLFNBQXlCO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLEtBQUssV0FBVyxPQUFPLEdBQUc7QUFDbkM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxLQUFLLFNBQVMsQ0FBQyxPQUFPLENBQUM7QUFDNUIsU0FBSyxLQUFLLFNBQVM7QUFBQSxFQUNwQjtBQUNEO0FBM0lhLGlCQUVZLGFBQWE7QUFGekIsbUJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4QlU7IiwKICAibmFtZXMiOiBbIlNlc3Npb25zR3JvdXBpbmciLCAiU2Vzc2lvbnNTb3J0aW5nIiwgImNoaWxkcmVuIiwgImFjdGlvbnMiLCAiZm9sZGVyIl0KfQo=
