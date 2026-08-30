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
import "../media/automationsCards.css";
import "./automationsAccessibility.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { Button, ButtonBar } from "../../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable, observableSignalFromEvent, observableValue, transaction } from "../../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationRunner } from "../../../../../workbench/contrib/chat/common/automations/automationRunner.js";
import { IAutomationDialogService } from "../../../../../workbench/contrib/chat/common/automations/automationDialogService.js";
import { DAYS_OF_WEEK } from "../../../../../workbench/contrib/chat/common/automations/schedule.js";
import { AgentSessionApprovalModel } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { basename } from "../../../../../base/common/resources.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionStatusIcon } from "../../../../browser/sessionStatusIcon.js";
import { AbstractCustomView } from "../../../../services/customView/browser/customView.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { Menus } from "../../../../browser/menus.js";
import { Action2, MenuItemAction, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AutomationsCustomViewFocusContext, AutomationsHasItemsContext, SessionSupportsDeleteContext } from "../../../../common/contextkeys.js";
import { SessionsFlatList, SessionItemStatusContext } from "./sessionsList.js";
import { AUTOMATIONS_CUSTOM_VIEW_ID } from "../automationsConstants.js";
const $ = DOM.$;
const STOP_AUTOMATION_RUN_SESSION_COMMAND_ID = "sessions.automations.stopRunSession";
const DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID = "sessions.automations.deleteRunSession";
let AutomationsCardsWidget = class extends Disposable {
  constructor(automationService, sessionsManagementService, instantiationService, contextKeyService, uriIdentityService) {
    super();
    this.automationService = automationService;
    this.sessionsManagementService = sessionsManagementService;
    this.uriIdentityService = uriIdentityService;
    this.isMarkingAllRead = observableValue(this, false);
    this.element = $(".automations-cards-widget");
    this.element.tabIndex = -1;
    const focusContext = AutomationsCustomViewFocusContext.bindTo(contextKeyService);
    const focusTracker = this._register(DOM.trackFocus(this.element));
    this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
    this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
    this._register(toDisposable(() => focusContext.reset()));
    const scrollContent = DOM.append(this.element, $(".automations-cards-scroll-content"));
    this.cardsSection = this._register(instantiationService.createInstance(AutomationCardsSection, scrollContent));
    this.historySection = this._register(instantiationService.createInstance(AutomationHistorySection, scrollContent, this.element, this.isMarkingAllRead));
    this._register(autorun((reader) => {
      const items = this.automationService.automations.read(reader);
      this.cardsSection.render(items);
    }));
    const sessionDeleted = observableSignalFromEvent(this, this.sessionsManagementService.onDidDeleteSession);
    const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
    this._register(autorun((reader) => {
      if (this.isMarkingAllRead.read(reader)) {
        return;
      }
      sessionDeleted.read(reader);
      sessionsChanged.read(reader);
      this.automationService.automations.read(reader);
      const allRuns = this.automationService.runs.read(reader);
      const sessionsByResource = new Map(this.sessionsManagementService.getSessions().map((session) => [
        this.uriIdentityService.extUri.getComparisonKey(session.resource),
        session
      ]));
      const sessions = /* @__PURE__ */ new Map();
      for (const run of allRuns) {
        if (!run.sessionResource) {
          continue;
        }
        const session = sessionsByResource.get(this.uriIdentityService.extUri.getComparisonKey(run.sessionResource));
        if (session) {
          sessions.set(run.id, session);
        }
      }
      this.historySection.render(allRuns, sessions);
    }));
  }
  layout(width, height) {
    this.element.style.width = `${width}px`;
    this.historySection.layout();
  }
  focus() {
    this.element.focus();
  }
};
AutomationsCardsWidget = __decorateClass([
  __decorateParam(0, IAutomationService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IUriIdentityService)
], AutomationsCardsWidget);
let AutomationCardsSection = class extends Disposable {
  constructor(parent, automationService, automationRunner, automationDialogService, hoverService, logService, dialogService, configurationService) {
    super();
    this.automationService = automationService;
    this.automationRunner = automationRunner;
    this.automationDialogService = automationDialogService;
    this.hoverService = hoverService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.persistentCards = /* @__PURE__ */ new Map();
    this.latestAutomations = /* @__PURE__ */ new Map();
    this.emptyStateDisposables = this._register(new DisposableStore());
    this.container = DOM.append(parent, $(".automations-cards-grid"));
    this.emptyContainer = DOM.append(parent, $(".automations-cards-empty"));
    this.emptyContainer.style.display = "none";
    this.renderEmptyState();
    this._register(toDisposable(() => {
      for (const card of this.persistentCards.values()) {
        card.disposables.dispose();
        card.element.remove();
      }
      this.persistentCards.clear();
      this.latestAutomations.clear();
    }));
  }
  render(automations) {
    const activeAutomationIds = new Set(automations.map((automation) => automation.id));
    for (const [automationId, card] of this.persistentCards) {
      if (activeAutomationIds.has(automationId)) {
        continue;
      }
      card.disposables.dispose();
      card.element.remove();
      this.persistentCards.delete(automationId);
      this.latestAutomations.delete(automationId);
    }
    let index = 0;
    for (const automation of automations) {
      const prev = this.latestAutomations.get(automation.id);
      this.latestAutomations.set(automation.id, automation);
      let card = this.persistentCards.get(automation.id);
      if (!card) {
        card = this.renderCard(automation);
        this.persistentCards.set(automation.id, card);
      } else if (prev !== automation) {
        this.updateCard(card, automation, prev);
      }
      const currentElement = this.container.children.item(index);
      if (currentElement !== card.element) {
        this.container.insertBefore(card.element, currentElement);
      }
      index++;
    }
    if (automations.length === 0) {
      this.container.style.display = "none";
      this.emptyContainer.style.display = "";
      return;
    }
    this.container.style.display = "";
    this.emptyContainer.style.display = "none";
  }
  renderCard(automation) {
    const disposables = new DisposableStore();
    const wrapper = $(".automations-card-wrapper");
    const card = DOM.append(wrapper, $(".automations-card"));
    card.setAttribute("role", "group");
    disposables.add(Gesture.addTarget(card));
    const main = DOM.append(card, $("button.automations-card-main", {
      type: "button"
    }));
    const nameRow = DOM.append(main, $(".automations-card-name"));
    const nameTextEl = DOM.append(nameRow, $("span.automations-card-name-text"));
    const disabledBadge = DOM.append(nameRow, $("span.automations-card-disabled-badge"));
    disabledBadge.textContent = localize("disabled", "Disabled");
    const metaEl = DOM.append(main, $(".automations-card-meta"));
    const scheduleEl = DOM.append(metaEl, $("span.automations-card-meta-item.automations-card-schedule"));
    const folderEl = DOM.append(metaEl, $("span.automations-card-meta-item.automations-card-folder"));
    const folderHover = disposables.add(new MutableDisposable());
    const promptEl = DOM.append(main, $(".automations-card-prompt"));
    const actions = DOM.append(card, $(".automations-card-actions"));
    actions.setAttribute("role", "group");
    const buttonBar = disposables.add(new ButtonBar(actions));
    const runNowLabel = localize("runNow", "Run now");
    const runningLabel = localize("running", "Running");
    const runBtn = this.createIconButton(buttonBar, Codicon.play, runNowLabel, false);
    runBtn.element.classList.add("automations-card-run-button");
    disposables.add(runBtn.onDidClick((e) => {
      e?.stopPropagation();
      const currentAutomation = this.latestAutomations.get(automation.id);
      if (!currentAutomation) {
        return;
      }
      runBtn.enabled = false;
      runBtn.setAriaLabel(runningLabel);
      runBtn.setTitle(runningLabel);
      disposableTimeout(() => {
        runBtn.enabled = true;
        runBtn.setAriaLabel(runNowLabel);
        runBtn.setTitle(runNowLabel);
      }, 1e4, disposables);
      void this.runNow(currentAutomation);
    }));
    const deleteBtn = this.createIconButton(buttonBar, Codicon.trash, localize("deleteAutomation", "Delete"), false);
    disposables.add(deleteBtn.onDidClick(() => {
      const currentAutomation = this.latestAutomations.get(automation.id);
      if (!currentAutomation) {
        return;
      }
      void this.confirmDelete(currentAutomation);
    }));
    for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
      disposables.add(DOM.addDisposableListener(card, eventType, (event) => {
        const target = event.initialTarget ?? event.target;
        if (target instanceof Node && DOM.isAncestor(target, actions)) {
          return;
        }
        const currentAutomation = this.latestAutomations.get(automation.id);
        if (!currentAutomation) {
          return;
        }
        void this.openEditDialog(currentAutomation);
      }));
    }
    const entry = {
      element: wrapper,
      card,
      main,
      actions,
      nameText: nameTextEl,
      scheduleEl,
      folderEl,
      folderHover,
      promptEl,
      disabledBadge,
      disposables
    };
    this.updateCard(entry, automation);
    return entry;
  }
  updateCard(card, automation, previous) {
    const schedule = formatSchedule(automation);
    const scheduleChanged = !previous || formatSchedule(previous) !== schedule;
    const nameChanged = !previous || previous.name !== automation.name;
    if (nameChanged || scheduleChanged) {
      card.card.setAttribute("aria-label", localize("automationCard", "{0} \u2014 {1}", automation.name, schedule));
    }
    if (nameChanged) {
      card.main.setAttribute("aria-label", localize("editAutomationNamed", "Edit automation {0}", automation.name));
      card.actions.setAttribute("aria-label", localize("automationActions", "Actions for {0}", automation.name));
      card.nameText.textContent = automation.name;
    }
    if (!previous || previous.enabled !== automation.enabled) {
      card.disabledBadge.style.display = automation.enabled ? "none" : "";
    }
    if (scheduleChanged) {
      card.scheduleEl.textContent = schedule;
    }
    const folderLabel = getAutomationTargetLabel(automation.target);
    if (!previous || getAutomationTargetLabel(previous.target) !== folderLabel) {
      card.folderEl.textContent = folderLabel;
      card.folderHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), card.folderEl, folderLabel);
    }
    if (!previous || previous.prompt !== automation.prompt) {
      const maxLength = 120;
      card.promptEl.textContent = automation.prompt.length > maxLength ? automation.prompt.slice(0, maxLength) + "\u2026" : automation.prompt;
    }
  }
  createIconButton(buttonBar, icon, tooltip, disabled) {
    const button = buttonBar.addButton({
      ariaLabel: tooltip,
      disabled,
      supportIcons: true,
      title: tooltip
    });
    button.label = `$(${icon.id})`;
    button.element.classList.add("automations-card-action-button");
    return button;
  }
  async runNow(automation) {
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      const operation = this.automationRunner.runOnce(automation, "manual", 0, CancellationToken.None);
      const dispatch = await operation.whenDispatched;
      switch (dispatch.kind) {
        case "started":
          status(localize("automationStartedStatus", "Started automation {0}", automation.name));
          break;
        case "alreadyRunning":
          status(localize("automationAlreadyRunningStatus", "Automation {0} is already running", automation.name));
          break;
        case "notStarted":
          status(localize("automationNotStartedStatus", "Automation {0} did not start", automation.name));
          break;
      }
      await operation.whenCompleted;
    } catch (error) {
      this.logService.error("[AutomationsCards] Failed to run automation", error);
      await this.dialogService.error(
        localize("automationRunActionFailed", "Failed to run automation."),
        getErrorMessage(error)
      );
    }
  }
  renderEmptyState() {
    const title = DOM.append(this.emptyContainer, $("h3.automations-cards-empty-title"));
    title.textContent = localize("noAutomationsYet", "No automations yet");
    const desc = DOM.append(this.emptyContainer, $("p.automations-cards-empty-description"));
    desc.textContent = localize("noAutomationsDesc", "Create an automation to schedule an agent session to run on a cadence you choose.");
    const createButton = this.emptyStateDisposables.add(new Button(this.emptyContainer, {
      ...defaultButtonStyles,
      title: localize("createAutomation", "Create Automation")
    }));
    createButton.label = localize("createAutomation", "Create Automation");
    createButton.element.classList.add("automations-cards-create-button");
    this.emptyStateDisposables.add(createButton.onDidClick(() => this.openCreateDialog()));
  }
  async openCreateDialog() {
    if (!await this.ensureEnabled()) {
      return;
    }
    const result = await this.automationDialogService.showAutomationDialog({});
    if (!result || result.kind !== "create") {
      return;
    }
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      const created = await this.automationService.createAutomation(result.value, () => this.throwIfDisabled());
      status(localize("automationCreatedStatus", "Created automation {0}", created.name));
    } catch (err) {
      this.logService.error("[AutomationsCards] Failed to create automation", err);
      await this.dialogService.error(
        localize("automationCreateFailed", "Failed to create automation."),
        getErrorMessage(err)
      );
    }
  }
  async openEditDialog(automation) {
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      const result = await this.automationDialogService.showAutomationDialog({ existing: automation });
      if (!result || result.kind !== "update") {
        return;
      }
      if (!await this.ensureEnabled()) {
        return;
      }
      const updateResult = await this.automationService.updateAutomationIfUnchanged(result.id, result.value, automation, () => this.throwIfDisabled());
      if (updateResult.kind === "conflict") {
        throw new Error(updateResult.current ? localize("automationChangedDuringEdit", "This automation changed while the dialog was open. Reopen it to review the latest values.") : localize("automationDeletedDuringEdit", "This automation was deleted while the dialog was open."));
      }
      status(localize("automationUpdatedStatus", "Updated automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[AutomationsCards] Failed to update automation", err);
      await this.dialogService.error(
        localize("automationUpdateFailed", "Failed to update automation."),
        getErrorMessage(err)
      );
    }
  }
  async confirmDelete(automation) {
    if (!await this.ensureEnabled()) {
      return;
    }
    const confirmed = await this.dialogService.confirm({
      message: localize("confirmDeleteAutomation", 'Delete automation "{0}"?', automation.name),
      detail: localize("confirmDeleteDetail", "This will permanently delete the automation and its run history."),
      primaryButton: localize("delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    if (!await this.ensureEnabled()) {
      return;
    }
    try {
      await this.automationService.deleteAutomation(automation.id, () => this.throwIfDisabled());
      status(localize("automationDeletedStatus", "Deleted automation {0}", automation.name));
    } catch (err) {
      this.logService.error("[AutomationsCards] Failed to delete automation", err);
      await this.dialogService.error(
        localize("automationDeleteFailed", "Failed to delete automation."),
        getErrorMessage(err)
      );
    }
  }
  isEnabled() {
    return this.configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
  }
  async ensureEnabled() {
    if (this.isEnabled()) {
      return true;
    }
    await showAutomationsDisabled(this.dialogService);
    return false;
  }
  throwIfDisabled() {
    if (!this.isEnabled()) {
      throw new Error(localize("automationsDisabledBeforeSave", "Automations were disabled before the change could be saved."));
    }
  }
};
AutomationCardsSection = __decorateClass([
  __decorateParam(1, IAutomationService),
  __decorateParam(2, IAutomationRunner),
  __decorateParam(3, IAutomationDialogService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IConfigurationService)
], AutomationCardsSection);
let AutomationHistorySection = class extends Disposable {
  constructor(parent, focusFallback, isMarkingAllRead, automationService, sessionsService, sessionsManagementService, logService, dialogService, instantiationService) {
    super();
    this.focusFallback = focusFallback;
    this.isMarkingAllRead = isMarkingAllRead;
    this.automationService = automationService;
    this.sessionsService = sessionsService;
    this.sessionsManagementService = sessionsManagementService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.instantiationService = instantiationService;
    this.headerDisposables = this._register(new DisposableStore());
    this.persistentGroups = /* @__PURE__ */ new Map();
    this.runFocusTargets = /* @__PURE__ */ new Map();
    this.renderedFocusableRunIds = [];
    this.shouldRestoreFocus = false;
    this.currentRuns = observableValue(this, []);
    this.currentSessions = observableValue(this, /* @__PURE__ */ new Map());
    this.container = DOM.append(parent, $(".automations-history"));
    this.groupsContainer = DOM.append(this.container, $(".automations-history-groups"));
    this.approvalModel = this._register(this.instantiationService.createInstance(AgentSessionApprovalModel));
  }
  dispose() {
    this.disposeAllGroups();
    super.dispose();
  }
  render(runs, sessions) {
    const sessionRuns = runs.filter((run) => sessions.has(run.id));
    const visibleRuns = runs.filter(
      (run) => sessions.has(run.id) || isTemporaryAutomationRun(run) || !!run.sessionResource && !!this.sessionsManagementService.getSession(run.sessionResource)
    );
    transaction((tx) => {
      this.currentRuns.set(sessionRuns, tx);
      this.currentSessions.set(sessions, tx);
    });
    this.runFocusTargets.clear();
    this.renderedFocusableRunIds = [];
    if (visibleRuns.length === 0) {
      this.container.style.display = "none";
      this.disposeAllGroups();
      this.restoreFocusAfterRender();
      return;
    }
    this.container.style.display = "";
    this.ensureHeader();
    const groups = groupRunsByDate(visibleRuns);
    const activeKeys = new Set(groups.map((group) => group.key));
    for (const [key, entry] of this.persistentGroups) {
      if (!activeKeys.has(key)) {
        entry.disposables.dispose();
        entry.element.remove();
        this.persistentGroups.delete(key);
      }
    }
    let index = 0;
    for (const group of groups) {
      const sessionItems = this.resolveSessionItems(group.runs, sessions);
      const temporaryRuns = group.runs.filter((run) => !sessions.has(run.id));
      let entry = this.persistentGroups.get(group.key);
      if (entry) {
        if (entry.header.textContent !== group.label) {
          entry.header.textContent = group.label;
        }
        this.updateTemporaryRuns(entry, temporaryRuns);
        this.updateGroupSessions(entry, sessionItems);
      } else {
        entry = this.createGroup(group.key, group.label, temporaryRuns, sessionItems);
      }
      const currentElement = this.groupsContainer.children.item(index);
      if (currentElement !== entry.element) {
        this.groupsContainer.insertBefore(entry.element, currentElement);
        if (entry.list) {
          this.layoutSessionList(entry.listContainer, entry.list);
        }
      }
      index++;
      for (const item of sessionItems) {
        if (!entry.list) {
          continue;
        }
        this.renderedFocusableRunIds.push(item.run.id);
        this.runFocusTargets.set(item.run.id, { list: entry.list, session: item.session });
      }
    }
    this.restoreFocusAfterRender();
  }
  layout() {
    for (const entry of this.persistentGroups.values()) {
      if (entry.list) {
        this.layoutSessionList(entry.listContainer, entry.list);
      }
    }
  }
  ensureHeader() {
    if (this.headerRow) {
      return;
    }
    this.headerDisposables.clear();
    this.headerRow = DOM.$(".automations-history-header");
    this.container.insertBefore(this.headerRow, this.groupsContainer);
    const headerLabel = DOM.append(this.headerRow, $("span"));
    headerLabel.textContent = localize("historyHeader", "History");
    this.markAllButton = this.headerDisposables.add(new Button(this.headerRow, {
      ...defaultButtonStyles,
      secondary: true,
      title: localize("markAllRead", "Mark all as read")
    }));
    this.markAllButton.label = localize("markAllRead", "Mark all as read");
    this.markAllButton.element.classList.add("automations-mark-all-read");
    this.headerDisposables.add(this.markAllButton.onDidClick(() => {
      void this.markAllRunsRead(this.currentRuns.get());
    }));
    this.headerDisposables.add(autorun((reader) => {
      const runs = this.currentRuns.read(reader);
      const sessions = this.currentSessions.read(reader);
      const isMarkingAllRead = this.isMarkingAllRead.read(reader);
      const hasUnread = runs.some((run) => isUnreadAutomationRun(run, sessions.get(run.id), reader));
      this.markAllButton.element.style.display = hasUnread ? "" : "none";
      this.markAllButton.enabled = hasUnread && !isMarkingAllRead;
    }));
  }
  resolveSessionItems(runs, sessions) {
    const items = [];
    for (const run of runs) {
      const session = sessions.get(run.id);
      if (session) {
        items.push({ run, session });
      }
    }
    return items;
  }
  createGroup(key, label, temporaryRuns, items) {
    const disposables = new DisposableStore();
    const element = $(".automations-history-group");
    const header = DOM.append(element, $(".automations-history-group-header"));
    header.textContent = label;
    const temporaryRowsContainer = DOM.append(element, $(".automations-temporary-runs"));
    const listContainer = DOM.append(element, $(".automations-run-session-list"));
    const runsBySession = /* @__PURE__ */ new Map();
    const entry = {
      element,
      header,
      temporaryRowsContainer,
      temporaryRows: disposables.add(new DisposableMap()),
      listContainer,
      listDisposables: disposables.add(new MutableDisposable()),
      list: void 0,
      runsBySession,
      sessions: [],
      disposables
    };
    this.persistentGroups.set(key, entry);
    this.updateTemporaryRuns(entry, temporaryRuns);
    this.updateGroupSessions(entry, items);
    return entry;
  }
  ensureGroupList(entry) {
    if (entry.list) {
      return entry.list;
    }
    const disposables = new DisposableStore();
    const list = disposables.add(this.instantiationService.createInstance(SessionsFlatList, entry.listContainer, {
      showSessionHover: false,
      alwaysConsumeMouseWheel: false,
      toolbarMenuId: Menus.AutomationsHistoryItem,
      markSessionReadOnOpen: false,
      approvalModel: this.approvalModel,
      onSessionOpen: (resource) => void this.openRunSession(resource),
      onToolbarAction: (action, session) => this.handleSessionToolbarAction(action, session, entry.runsBySession)
    }));
    disposables.add(list.onDidChangeContentHeight(() => this.layoutSessionList(entry.listContainer, list)));
    entry.list = list;
    entry.listDisposables.value = disposables;
    return list;
  }
  updateTemporaryRuns(entry, runs) {
    const activeRunIds = new Set(runs.map((run) => run.id));
    for (const runId of entry.temporaryRows.keys()) {
      if (!activeRunIds.has(runId)) {
        entry.temporaryRows.deleteAndDispose(runId);
      }
    }
    let index = 0;
    for (const run of runs) {
      const title = this.getAutomationName(run);
      let row = entry.temporaryRows.get(run.id);
      if (!row) {
        row = this.createTemporaryRunRow(title);
        entry.temporaryRows.set(run.id, row);
      } else if (row.title.textContent !== title) {
        row.title.textContent = title;
        row.element.setAttribute("aria-label", localize("automationRunWorkingAriaLabel", "{0}, Working...", title));
      }
      const currentElement = entry.temporaryRowsContainer.children.item(index);
      if (currentElement !== row.element) {
        entry.temporaryRowsContainer.insertBefore(row.element, currentElement);
      }
      index++;
    }
  }
  createTemporaryRunRow(title) {
    const disposables = new DisposableStore();
    const element = $(".automations-temporary-run.session-item");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", localize("automationRunWorkingAriaLabel", "{0}, Working...", title));
    const icon = DOM.append(element, $(".session-icon"));
    const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, icon));
    statusIcon.setStatus(SessionStatus.InProgress, true, false);
    const main = DOM.append(element, $(".session-main"));
    const titleRow = DOM.append(main, $(".session-title-row"));
    const titleElement = DOM.append(titleRow, $("span.session-title"));
    titleElement.textContent = title;
    const detailsRow = DOM.append(main, $(".session-details-row"));
    DOM.append(detailsRow, $("span.session-description")).textContent = localize("automationRunWorking", "Working...");
    return {
      element,
      title: titleElement,
      dispose: () => {
        disposables.dispose();
        element.remove();
      }
    };
  }
  updateGroupSessions(entry, items) {
    entry.runsBySession.clear();
    for (const item of items) {
      entry.runsBySession.set(item.session.resource.toString(), item.run);
    }
    const sessions = items.map((item) => item.session);
    if (entry.sessions.length === sessions.length && entry.sessions.every((session, index) => session === sessions[index])) {
      return;
    }
    entry.sessions = sessions;
    if (sessions.length === 0) {
      entry.list = void 0;
      entry.listDisposables.clear();
      DOM.clearNode(entry.listContainer);
      entry.listContainer.style.height = "";
      return;
    }
    const list = this.ensureGroupList(entry);
    list.setSessions(sessions);
    this.layoutSessionList(entry.listContainer, list);
  }
  disposeAllGroups() {
    for (const [key, entry] of this.persistentGroups) {
      entry.disposables.dispose();
      entry.element.remove();
      this.persistentGroups.delete(key);
    }
    if (this.headerRow) {
      this.headerRow.remove();
      this.headerRow = void 0;
      this.markAllButton = void 0;
      this.headerDisposables.clear();
    }
  }
  layoutSessionList(container, list) {
    const height = list.getContentHeight();
    const width = container.clientWidth;
    container.style.height = `${height}px`;
    list.layout(height, width);
  }
  async handleSessionToolbarAction(action, session, runsBySession) {
    const run = runsBySession.get(session.resource.toString());
    if (!run) {
      return false;
    }
    switch (action.id) {
      case STOP_AUTOMATION_RUN_SESSION_COMMAND_ID:
        action.enabled = false;
        await this.stopRunSession(session, this.getAutomationName(run), action);
        return true;
      case DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID:
        await this.confirmDeleteRunSession(run, session, this.getAutomationName(run));
        return true;
      default:
        return false;
    }
  }
  getAutomationName(run) {
    return this.automationService.automations.get().find((automation) => automation.id === run.automationId)?.name ?? localize("unknownAutomation", "Unknown");
  }
  async openRunSession(resource) {
    if (!this.sessionsManagementService.getSession(resource)) {
      return;
    }
    try {
      await this.sessionsService.openSession(resource, { preserveFocus: false });
    } catch (error) {
      this.logService.error("[AutomationsCards] Failed to open automation run", error);
      await this.dialogService.error(
        localize("automationRunOpenFailed", "Failed to open automation run."),
        getErrorMessage(error)
      );
    }
  }
  async stopRunSession(session, automationName, action) {
    try {
      await this.sessionsManagementService.cancelCurrentRequest(session);
      status(localize("automationRunSessionStoppedStatus", "Stopped the session for {0}", automationName));
    } catch (error) {
      action.enabled = true;
      this.logService.error("[AutomationsCards] Failed to stop automation run session", error);
      await this.dialogService.error(
        localize("automationRunSessionStopFailed", "Failed to stop the automation run session."),
        getErrorMessage(error)
      );
    }
  }
  async confirmDeleteRunSession(run, session, automationName) {
    const hadFocus = this.container.contains(DOM.getActiveElement());
    const confirmed = await this.dialogService.confirm({
      message: localize("confirmDeleteAutomationRunSession", 'Delete the session for "{0}"?', automationName),
      detail: localize("confirmDeleteAutomationRunSessionDetail", "This will permanently delete the session and remove this item from run history. This action cannot be undone."),
      primaryButton: localize("delete", "Delete")
    });
    if (!confirmed.confirmed) {
      return;
    }
    const focusRunId = hadFocus ? this.getFocusRunIdAfterDeletion(run.id) : void 0;
    try {
      await this.sessionsManagementService.deleteSession(session);
    } catch (error) {
      this.clearPendingFocus();
      this.logService.error("[AutomationsCards] Failed to delete automation run session", error);
      await this.dialogService.error(
        localize("automationRunSessionDeleteFailed", "Failed to delete the automation run session."),
        getErrorMessage(error)
      );
      return;
    }
    if (hadFocus) {
      this.pendingFocusRunId = focusRunId;
      this.shouldRestoreFocus = true;
    }
    try {
      await this.automationService.deleteRun(run.id);
      this.restoreFocusAfterRender();
      status(localize("automationRunSessionDeletedStatus", "Deleted the session for {0}", automationName));
    } catch (error) {
      this.restoreFocusAfterRender();
      this.logService.error("[AutomationsCards] Failed to remove deleted automation run from history", error);
      await this.dialogService.error(
        localize("automationRunHistoryDeleteFailed", "The session was deleted, but its run history item could not be removed."),
        getErrorMessage(error)
      );
    }
  }
  getFocusRunIdAfterDeletion(runId) {
    const index = this.renderedFocusableRunIds.indexOf(runId);
    return index >= 0 ? this.renderedFocusableRunIds[index + 1] ?? this.renderedFocusableRunIds[index - 1] : void 0;
  }
  restoreFocusAfterRender() {
    if (!this.shouldRestoreFocus) {
      return;
    }
    const target = this.pendingFocusRunId ? this.runFocusTargets.get(this.pendingFocusRunId) : void 0;
    this.clearPendingFocus();
    if (target) {
      target.list.focusSession(target.session);
    } else {
      this.focusFallback.focus();
    }
  }
  clearPendingFocus() {
    this.pendingFocusRunId = void 0;
    this.shouldRestoreFocus = false;
  }
  async markAllRunsRead(runs) {
    this.isMarkingAllRead.set(true, void 0);
    const sessions = /* @__PURE__ */ new Map();
    try {
      for (const run of runs) {
        if ((run.status === "completed" || run.status === "failed") && run.sessionResource) {
          const session = this.sessionsManagementService.getSession(run.sessionResource);
          if (session && !session.isRead.get()) {
            sessions.set(session.resource.toString(), session);
          }
        }
      }
      await this.sessionsManagementService.markAllRead([...sessions.values()]);
    } catch (error) {
      this.logService.error("[AutomationsCards] Failed to mark automation runs read", error);
      await this.dialogService.error(
        localize("automationMarkAllReadFailed", "Failed to mark automation runs as read."),
        getErrorMessage(error)
      );
    } finally {
      this.isMarkingAllRead.set(false, void 0);
    }
  }
};
AutomationHistorySection = __decorateClass([
  __decorateParam(3, IAutomationService),
  __decorateParam(4, ISessionsService),
  __decorateParam(5, ISessionsManagementService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IInstantiationService)
], AutomationHistorySection);
function isUnreadAutomationRun(run, session, reader) {
  return (run.status === "completed" || run.status === "failed") && !!session && !session.isRead.read(reader);
}
function isTemporaryAutomationRun(run) {
  return run.status === "pending" || run.status === "running";
}
function formatSchedule(automation) {
  const { interval, scheduleHour, scheduleMinute } = automation.schedule;
  const time = formatHourMinute(scheduleHour, scheduleMinute);
  switch (interval) {
    case "hourly":
      return localize("scheduleHourly", "Hourly");
    case "daily":
      return localize("scheduleDailyAt", "Daily at {0}", time);
    case "weekly": {
      const day = DAYS_OF_WEEK[(automation.schedule.scheduleDay % 7 + 7) % 7];
      return localize("scheduleWeeklyAt", "{0} at {1}", day, time);
    }
    case "manual":
      return localize("scheduleManual", "Manual");
    default:
      return localize("scheduleManual", "Manual");
  }
}
function formatHourMinute(hour, minute) {
  const date = new Date(Date.UTC(2e3, 0, 1, Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0))));
  return date.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}
function getAutomationTargetLabel(target) {
  return target.kind === "workspace" ? basename(target.folderUri) : localize("quickChat", "Quick Chat");
}
function groupRunsByDate(runs) {
  const now = /* @__PURE__ */ new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const groups = /* @__PURE__ */ new Map();
  for (const run of runs) {
    const t = Date.parse(run.startedAt);
    if (Number.isNaN(t)) {
      continue;
    }
    const date = new Date(t);
    const { key, label, order } = getDateBucket(date, today, yesterday, lastWeekStart);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, order, runs: [] };
      groups.set(key, group);
    }
    group.runs.push(run);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
function getDateBucket(date, today, yesterday, lastWeekStart) {
  if (date >= today) {
    return { key: "today", label: localize("today", "Today"), order: 0 };
  }
  if (date >= yesterday) {
    return { key: "yesterday", label: localize("yesterday", "Yesterday"), order: 1 };
  }
  if (date >= lastWeekStart) {
    return { key: "week", label: localize("lastWeek", "Last week"), order: 2 };
  }
  const monthLabel = date.toLocaleDateString(void 0, { month: "long", year: "numeric" });
  const monthIndex = date.getFullYear() * 12 + date.getMonth();
  const order = 3e4 - monthIndex;
  return { key: `month-${date.getFullYear()}-${date.getMonth()}`, label: monthLabel, order };
}
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function showAutomationsDisabled(dialogService) {
  await dialogService.info(
    localize("automationsDisabledTitle", "Automations are disabled."),
    localize("automationsDisabledDetail", "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING)
  );
}
let AutomationsCustomView = class extends AbstractCustomView {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.title = constObservable(localize("automationsTitle", "Automations"));
    this.description = constObservable(
      localize("automationsDescription", "Schedule agent sessions to run automatically on a cadence you choose.")
    );
  }
  render(container) {
    container.classList.add("automations-cards-content");
    this._widget = this._register(this.instantiationService.createInstance(AutomationsCardsWidget));
    container.appendChild(this._widget.element);
  }
  layout(width, height) {
    this._widget?.layout(width, height);
  }
  focus() {
    this._widget?.focus();
  }
};
AutomationsCustomView = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AutomationsCustomView);
let AutomationsCustomViewContribution = class extends Disposable {
  constructor(customViewService, actionViewItemService, contextKeyService, automationService) {
    super();
    this._register(registerAutomationHistoryItemActions());
    const hasItemsContext = AutomationsHasItemsContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      hasItemsContext.set(automationService.automations.read(reader).length > 0);
    }));
    this._register(customViewService.registerCustomView({
      id: AUTOMATIONS_CUSTOM_VIEW_ID,
      ctor: new SyncDescriptor(AutomationsCustomView),
      actions: { style: "buttonBar", menuId: Menus.CustomViewAutomations }
    }, {
      restore: contextKeyService.getContextKeyValue(ChatAutomationsEnabledContext.key) === true
    }));
    const automationContextKeys = /* @__PURE__ */ new Set([ChatAutomationsEnabledContext.key]);
    this._register(contextKeyService.onDidChangeContext((event) => {
      if (event.affectsSome(automationContextKeys) && !contextKeyService.getContextKeyValue(ChatAutomationsEnabledContext.key) && customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
        customViewService.hideCustomView();
      }
    }));
    this._register(actionViewItemService.register(Menus.CustomViewAutomations, "sessionsView.newAutomation", (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(PrimaryButtonActionViewItem, void 0, action, options);
    }));
  }
};
AutomationsCustomViewContribution.ID = "sessions.contrib.automationsCustomView";
AutomationsCustomViewContribution = __decorateClass([
  __decorateParam(0, ICustomViewService),
  __decorateParam(1, IActionViewItemService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IAutomationService)
], AutomationsCustomViewContribution);
function registerAutomationHistoryItemActions() {
  return combinedDisposable(
    MenuRegistry.appendMenuItem(Menus.AutomationsHistoryItem, {
      command: {
        id: STOP_AUTOMATION_RUN_SESSION_COMMAND_ID,
        title: localize("stopAutomationRunSessionAction", "Stop"),
        icon: Codicon.stopCircle
      },
      group: "navigation",
      order: 1,
      when: ContextKeyExpr.or(
        SessionItemStatusContext.isEqualTo(SessionStatus.InProgress),
        SessionItemStatusContext.isEqualTo(SessionStatus.NeedsInput)
      )
    }),
    MenuRegistry.appendMenuItem(Menus.AutomationsHistoryItem, {
      command: {
        id: DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID,
        title: localize("deleteAutomationRunSessionAction", "Delete"),
        icon: Codicon.trash
      },
      group: "navigation",
      order: 1,
      when: ContextKeyExpr.and(
        SessionSupportsDeleteContext,
        ContextKeyExpr.or(
          SessionItemStatusContext.isEqualTo(SessionStatus.Completed),
          SessionItemStatusContext.isEqualTo(SessionStatus.Error)
        )
      )
    })
  );
}
class PrimaryButtonActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    super(context, action, options);
  }
  render(container) {
    this.element = container;
    container.classList.add("chat-composite-bar-meta-item");
    const button = this.button = this._register(new Button(container, { secondary: false, ...defaultButtonStyles }));
    button.element.classList.add("monaco-text-button", "chat-composite-bar-meta-item-button");
    this._register(button.onDidClick(() => {
      if (this._action.enabled) {
        this.actionRunner.run(this._action, this._context);
      }
    }));
    this.updateLabel();
    this.updateEnabled();
  }
  focus() {
    this.button?.focus();
  }
  blur() {
    if (this.button) {
      this.button.element.tabIndex = -1;
      this.button.element.blur();
    }
  }
  setFocusable(focusable) {
    if (this.button) {
      this.button.element.tabIndex = focusable ? 0 : -1;
    }
  }
  updateEnabled() {
    if (this.button) {
      this.button.enabled = this._action.enabled;
    }
  }
  updateLabel() {
    if (!this.button) {
      return;
    }
    DOM.reset(this.button.element, this._action.label);
  }
}
registerAction2(class NewAutomationAction extends Action2 {
  constructor() {
    super({
      id: "sessionsView.newAutomation",
      title: localize2("newAutomation", "New Automation"),
      precondition: ChatAutomationsEnabledContext,
      menu: [{ id: Menus.CustomViewAutomations, group: "navigation", order: 1, when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationsHasItemsContext) }]
    });
  }
  async run(accessor) {
    const automationDialogService = accessor.get(IAutomationDialogService);
    const automationService = accessor.get(IAutomationService);
    const configurationService = accessor.get(IConfigurationService);
    const dialogService = accessor.get(IDialogService);
    const logService = accessor.get(ILogService);
    const isEnabled = () => configurationService.getValue(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
    if (!isEnabled()) {
      await showAutomationsDisabled(dialogService);
      return;
    }
    const result = await automationDialogService.showAutomationDialog({});
    if (!result || result.kind !== "create") {
      return;
    }
    if (!isEnabled()) {
      await showAutomationsDisabled(dialogService);
      return;
    }
    try {
      await automationService.createAutomation(result.value, () => {
        if (!isEnabled()) {
          throw new Error(localize("automationsDisabledBeforeSave", "Automations were disabled before the change could be saved."));
        }
      });
    } catch (err) {
      logService.error("[Automations] Failed to create automation", err);
      await dialogService.error(
        localize("automationCreateFailed", "Failed to create automation."),
        getErrorMessage(err)
      );
    }
  }
});
export {
  AutomationsCardsWidget,
  AutomationsCustomView,
  AutomationsCustomViewContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHZpZXdzXFxhdXRvbWF0aW9uc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL21lZGlhL2F1dG9tYXRpb25zQ2FyZHMuY3NzJztcbmltcG9ydCAnLi9hdXRvbWF0aW9uc0FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uLCBCdXR0b25CYXIsIElCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB0eXBlIHsgSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBJQXV0b21hdGlvblJ1biwgQXV0b21hdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcsIENoYXRBdXRvbWF0aW9uc0VuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbnNFbmFibGVkLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEQVlTX09GX1dFRUsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9zY2hlZHVsZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgR2VzdHVyZUV2ZW50LCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXNJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXNzaW9uU3RhdHVzSWNvbi5qcyc7XG5cbmltcG9ydCB7IEFic3RyYWN0Q3VzdG9tVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3LmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SXRlbUFjdGlvbiwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25zQ3VzdG9tVmlld0ZvY3VzQ29udGV4dCwgQXV0b21hdGlvbnNIYXNJdGVtc0NvbnRleHQsIFNlc3Npb25TdXBwb3J0c0RlbGV0ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNGbGF0TGlzdCwgU2Vzc2lvbkl0ZW1TdGF0dXNDb250ZXh0IH0gZnJvbSAnLi9zZXNzaW9uc0xpc3QuanMnO1xuaW1wb3J0IHsgQVVUT01BVElPTlNfQ1VTVE9NX1ZJRVdfSUQgfSBmcm9tICcuLi9hdXRvbWF0aW9uc0NvbnN0YW50cy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcbmNvbnN0IFNUT1BfQVVUT01BVElPTl9SVU5fU0VTU0lPTl9DT01NQU5EX0lEID0gJ3Nlc3Npb25zLmF1dG9tYXRpb25zLnN0b3BSdW5TZXNzaW9uJztcbmNvbnN0IERFTEVURV9BVVRPTUFUSU9OX1JVTl9TRVNTSU9OX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnMuYXV0b21hdGlvbnMuZGVsZXRlUnVuU2Vzc2lvbic7XG5cbmludGVyZmFjZSBJQXV0b21hdGlvbkNhcmRFbnRyeSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjYXJkOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbWFpbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBuYW1lVGV4dDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHNjaGVkdWxlRWw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBmb2xkZXJFbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGZvbGRlckhvdmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG5cdHJlYWRvbmx5IHByb21wdEVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGlzYWJsZWRCYWRnZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmludGVyZmFjZSBJQXV0b21hdGlvbkhpc3RvcnlJdGVtIHtcblx0cmVhZG9ubHkgcnVuOiBJQXV0b21hdGlvblJ1bjtcblx0cmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247XG59XG5cbmludGVyZmFjZSBJQXV0b21hdGlvbkhpc3RvcnlHcm91cCB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBoZWFkZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0ZW1wb3JhcnlSb3dzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGVtcG9yYXJ5Um93czogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElBdXRvbWF0aW9uVGVtcG9yYXJ5UnVuUm93Pjtcblx0cmVhZG9ubHkgbGlzdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxpc3REaXNwb3NhYmxlczogTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPjtcblx0bGlzdDogU2Vzc2lvbnNGbGF0TGlzdCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcnVuc0J5U2Vzc2lvbjogTWFwPHN0cmluZywgSUF1dG9tYXRpb25SdW4+O1xuXHRzZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElBdXRvbWF0aW9uVGVtcG9yYXJ5UnVuUm93IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGl0bGU6IEhUTUxFbGVtZW50O1xufVxuXG4vKipcbiAqIENhcmQtc3R5bGUgdmlldyBvZiBhdXRvbWF0aW9ucyBmb3IgdGhlIEFnZW50cyB3aW5kb3cgc2Vzc2lvbnMgZ3JpZC5cbiAqIFVzZXMgbmF0aXZlIFZTIENvZGUgY29tcG9uZW50cyBhbmQgc3R5bGluZyBwYXR0ZXJucyBtYXRjaGluZyB0aGVcbiAqIGF1dG9tYXRpb25zTGlzdFdpZGdldCBpbiBBSSBDdXN0b21pemF0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvbnNDYXJkc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FyZHNTZWN0aW9uOiBBdXRvbWF0aW9uQ2FyZHNTZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpc3RvcnlTZWN0aW9uOiBBdXRvbWF0aW9uSGlzdG9yeVNlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNNYXJraW5nQWxsUmVhZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5hdXRvbWF0aW9ucy1jYXJkcy13aWRnZXQnKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHRjb25zdCBmb2N1c0NvbnRleHQgPSBBdXRvbWF0aW9uc0N1c3RvbVZpZXdGb2N1c0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihET00udHJhY2tGb2N1cyh0aGlzLmVsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiBmb2N1c0NvbnRleHQuc2V0KHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiBmb2N1c0NvbnRleHQuc2V0KGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBmb2N1c0NvbnRleHQucmVzZXQoKSkpO1xuXHRcdGNvbnN0IHNjcm9sbENvbnRlbnQgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmF1dG9tYXRpb25zLWNhcmRzLXNjcm9sbC1jb250ZW50JykpO1xuXG5cdFx0dGhpcy5jYXJkc1NlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRvbWF0aW9uQ2FyZHNTZWN0aW9uLCBzY3JvbGxDb250ZW50KSk7XG5cdFx0dGhpcy5oaXN0b3J5U2VjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1dG9tYXRpb25IaXN0b3J5U2VjdGlvbiwgc2Nyb2xsQ29udGVudCwgdGhpcy5lbGVtZW50LCB0aGlzLmlzTWFya2luZ0FsbFJlYWQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5hdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLmNhcmRzU2VjdGlvbi5yZW5kZXIoaXRlbXMpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlc3Npb25EZWxldGVkID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWREZWxldGVTZXNzaW9uKTtcblx0XHRjb25zdCBzZXNzaW9uc0NoYW5nZWQgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc01hcmtpbmdBbGxSZWFkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9uRGVsZXRlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRzZXNzaW9uc0NoYW5nZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhbGxSdW5zID0gdGhpcy5hdXRvbWF0aW9uU2VydmljZS5ydW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zQnlSZXNvdXJjZSA9IG5ldyBNYXAodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25zKCkubWFwKHNlc3Npb24gPT4gW1xuXHRcdFx0XHR0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleShzZXNzaW9uLnJlc291cmNlKSxcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdF0pKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uPigpO1xuXHRcdFx0Zm9yIChjb25zdCBydW4gb2YgYWxsUnVucykge1xuXHRcdFx0XHRpZiAoIXJ1bi5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNCeVJlc291cmNlLmdldCh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleShydW4uc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbnMuc2V0KHJ1bi5pZCwgc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuaGlzdG9yeVNlY3Rpb24ucmVuZGVyKGFsbFJ1bnMsIHNlc3Npb25zKTtcblx0XHR9KSk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0dGhpcy5oaXN0b3J5U2VjdGlvbi5sYXlvdXQoKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBBdXRvbWF0aW9uQ2FyZHNTZWN0aW9uXG5cbi8qKlxuICogUmVuZGVycyB0aGUgYXV0b21hdGlvbiBjYXJkIGdyaWQgYW5kIGVtcHR5IHN0YXRlLlxuICovXG5jbGFzcyBBdXRvbWF0aW9uQ2FyZHNTZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGVtcHR5Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwZXJzaXN0ZW50Q2FyZHMgPSBuZXcgTWFwPHN0cmluZywgSUF1dG9tYXRpb25DYXJkRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF0ZXN0QXV0b21hdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUF1dG9tYXRpb25EZXNjcmlwdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVtcHR5U3RhdGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUF1dG9tYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblNlcnZpY2U6IElBdXRvbWF0aW9uU2VydmljZSxcblx0XHRASUF1dG9tYXRpb25SdW5uZXIgcHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uUnVubmVyOiBJQXV0b21hdGlvblJ1bm5lcixcblx0XHRASUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2U6IElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuYXV0b21hdGlvbnMtY2FyZHMtZ3JpZCcpKTtcblx0XHR0aGlzLmVtcHR5Q29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5hdXRvbWF0aW9ucy1jYXJkcy1lbXB0eScpKTtcblx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5yZW5kZXJFbXB0eVN0YXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgY2FyZCBvZiB0aGlzLnBlcnNpc3RlbnRDYXJkcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRjYXJkLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y2FyZC5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5wZXJzaXN0ZW50Q2FyZHMuY2xlYXIoKTtcblx0XHRcdHRoaXMubGF0ZXN0QXV0b21hdGlvbnMuY2xlYXIoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRyZW5kZXIoYXV0b21hdGlvbnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uRGVzY3JpcHRvcltdKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlQXV0b21hdGlvbklkcyA9IG5ldyBTZXQoYXV0b21hdGlvbnMubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5pZCkpO1xuXHRcdGZvciAoY29uc3QgW2F1dG9tYXRpb25JZCwgY2FyZF0gb2YgdGhpcy5wZXJzaXN0ZW50Q2FyZHMpIHtcblx0XHRcdGlmIChhY3RpdmVBdXRvbWF0aW9uSWRzLmhhcyhhdXRvbWF0aW9uSWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FyZC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRjYXJkLmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnBlcnNpc3RlbnRDYXJkcy5kZWxldGUoYXV0b21hdGlvbklkKTtcblx0XHRcdHRoaXMubGF0ZXN0QXV0b21hdGlvbnMuZGVsZXRlKGF1dG9tYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0bGV0IGluZGV4ID0gMDtcblxuXHRcdGZvciAoY29uc3QgYXV0b21hdGlvbiBvZiBhdXRvbWF0aW9ucykge1xuXHRcdFx0Y29uc3QgcHJldiA9IHRoaXMubGF0ZXN0QXV0b21hdGlvbnMuZ2V0KGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0dGhpcy5sYXRlc3RBdXRvbWF0aW9ucy5zZXQoYXV0b21hdGlvbi5pZCwgYXV0b21hdGlvbik7XG5cblx0XHRcdGxldCBjYXJkID0gdGhpcy5wZXJzaXN0ZW50Q2FyZHMuZ2V0KGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0aWYgKCFjYXJkKSB7XG5cdFx0XHRcdGNhcmQgPSB0aGlzLnJlbmRlckNhcmQoYXV0b21hdGlvbik7XG5cdFx0XHRcdHRoaXMucGVyc2lzdGVudENhcmRzLnNldChhdXRvbWF0aW9uLmlkLCBjYXJkKTtcblx0XHRcdH0gZWxzZSBpZiAocHJldiAhPT0gYXV0b21hdGlvbikge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNhcmQoY2FyZCwgYXV0b21hdGlvbiwgcHJldik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRFbGVtZW50ID0gdGhpcy5jb250YWluZXIuY2hpbGRyZW4uaXRlbShpbmRleCk7XG5cdFx0XHRpZiAoY3VycmVudEVsZW1lbnQgIT09IGNhcmQuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5pbnNlcnRCZWZvcmUoY2FyZC5lbGVtZW50LCBjdXJyZW50RWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRpbmRleCsrO1xuXHRcdH1cblxuXHRcdGlmIChhdXRvbWF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNhcmQoYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yKTogSUF1dG9tYXRpb25DYXJkRW50cnkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHdyYXBwZXIgPSAkKCcuYXV0b21hdGlvbnMtY2FyZC13cmFwcGVyJyk7XG5cdFx0Y29uc3QgY2FyZCA9IERPTS5hcHBlbmQod3JhcHBlciwgJCgnLmF1dG9tYXRpb25zLWNhcmQnKSk7XG5cdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQoY2FyZCkpO1xuXG5cdFx0Y29uc3QgbWFpbiA9IERPTS5hcHBlbmQoY2FyZCwgJCgnYnV0dG9uLmF1dG9tYXRpb25zLWNhcmQtbWFpbicsIHtcblx0XHRcdHR5cGU6ICdidXR0b24nLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG5hbWVSb3cgPSBET00uYXBwZW5kKG1haW4sICQoJy5hdXRvbWF0aW9ucy1jYXJkLW5hbWUnKSk7XG5cdFx0Y29uc3QgbmFtZVRleHRFbCA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnc3Bhbi5hdXRvbWF0aW9ucy1jYXJkLW5hbWUtdGV4dCcpKTtcblx0XHRjb25zdCBkaXNhYmxlZEJhZGdlID0gRE9NLmFwcGVuZChuYW1lUm93LCAkKCdzcGFuLmF1dG9tYXRpb25zLWNhcmQtZGlzYWJsZWQtYmFkZ2UnKSk7XG5cdFx0ZGlzYWJsZWRCYWRnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdkaXNhYmxlZCcsIFwiRGlzYWJsZWRcIik7XG5cblx0XHRjb25zdCBtZXRhRWwgPSBET00uYXBwZW5kKG1haW4sICQoJy5hdXRvbWF0aW9ucy1jYXJkLW1ldGEnKSk7XG5cdFx0Y29uc3Qgc2NoZWR1bGVFbCA9IERPTS5hcHBlbmQobWV0YUVsLCAkKCdzcGFuLmF1dG9tYXRpb25zLWNhcmQtbWV0YS1pdGVtLmF1dG9tYXRpb25zLWNhcmQtc2NoZWR1bGUnKSk7XG5cdFx0Y29uc3QgZm9sZGVyRWwgPSBET00uYXBwZW5kKG1ldGFFbCwgJCgnc3Bhbi5hdXRvbWF0aW9ucy1jYXJkLW1ldGEtaXRlbS5hdXRvbWF0aW9ucy1jYXJkLWZvbGRlcicpKTtcblx0XHRjb25zdCBmb2xkZXJIb3ZlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0XHRjb25zdCBwcm9tcHRFbCA9IERPTS5hcHBlbmQobWFpbiwgJCgnLmF1dG9tYXRpb25zLWNhcmQtcHJvbXB0JykpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IERPTS5hcHBlbmQoY2FyZCwgJCgnLmF1dG9tYXRpb25zLWNhcmQtYWN0aW9ucycpKTtcblx0XHRhY3Rpb25zLnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdGNvbnN0IGJ1dHRvbkJhciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uQmFyKGFjdGlvbnMpKTtcblx0XHRjb25zdCBydW5Ob3dMYWJlbCA9IGxvY2FsaXplKCdydW5Ob3cnLCBcIlJ1biBub3dcIik7XG5cdFx0Y29uc3QgcnVubmluZ0xhYmVsID0gbG9jYWxpemUoJ3J1bm5pbmcnLCBcIlJ1bm5pbmdcIik7XG5cdFx0Y29uc3QgcnVuQnRuID0gdGhpcy5jcmVhdGVJY29uQnV0dG9uKGJ1dHRvbkJhciwgQ29kaWNvbi5wbGF5LCBydW5Ob3dMYWJlbCwgZmFsc2UpO1xuXHRcdHJ1bkJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2F1dG9tYXRpb25zLWNhcmQtcnVuLWJ1dHRvbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChydW5CdG4ub25EaWRDbGljaygoZSkgPT4ge1xuXHRcdFx0ZT8uc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjb25zdCBjdXJyZW50QXV0b21hdGlvbiA9IHRoaXMubGF0ZXN0QXV0b21hdGlvbnMuZ2V0KGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0aWYgKCFjdXJyZW50QXV0b21hdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRydW5CdG4uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cnVuQnRuLnNldEFyaWFMYWJlbChydW5uaW5nTGFiZWwpO1xuXHRcdFx0cnVuQnRuLnNldFRpdGxlKHJ1bm5pbmdMYWJlbCk7XG5cdFx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHJ1bkJ0bi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0cnVuQnRuLnNldEFyaWFMYWJlbChydW5Ob3dMYWJlbCk7XG5cdFx0XHRcdHJ1bkJ0bi5zZXRUaXRsZShydW5Ob3dMYWJlbCk7XG5cdFx0XHR9LCAxMF8wMDAsIGRpc3Bvc2FibGVzKTtcblx0XHRcdHZvaWQgdGhpcy5ydW5Ob3coY3VycmVudEF1dG9tYXRpb24pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRlbGV0ZUJ0biA9IHRoaXMuY3JlYXRlSWNvbkJ1dHRvbihidXR0b25CYXIsIENvZGljb24udHJhc2gsIGxvY2FsaXplKCdkZWxldGVBdXRvbWF0aW9uJywgXCJEZWxldGVcIiksIGZhbHNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGVsZXRlQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEF1dG9tYXRpb24gPSB0aGlzLmxhdGVzdEF1dG9tYXRpb25zLmdldChhdXRvbWF0aW9uLmlkKTtcblx0XHRcdGlmICghY3VycmVudEF1dG9tYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLmNvbmZpcm1EZWxldGUoY3VycmVudEF1dG9tYXRpb24pO1xuXHRcdH0pKTtcblxuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtET00uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCBldmVudFR5cGUsIGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gKGV2ZW50IGFzIEdlc3R1cmVFdmVudCkuaW5pdGlhbFRhcmdldCA/PyBldmVudC50YXJnZXQ7XG5cdFx0XHRcdGlmICh0YXJnZXQgaW5zdGFuY2VvZiBOb2RlICYmIERPTS5pc0FuY2VzdG9yKHRhcmdldCwgYWN0aW9ucykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3VycmVudEF1dG9tYXRpb24gPSB0aGlzLmxhdGVzdEF1dG9tYXRpb25zLmdldChhdXRvbWF0aW9uLmlkKTtcblx0XHRcdFx0aWYgKCFjdXJyZW50QXV0b21hdGlvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR2b2lkIHRoaXMub3BlbkVkaXREaWFsb2coY3VycmVudEF1dG9tYXRpb24pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0ge1xuXHRcdFx0ZWxlbWVudDogd3JhcHBlcixcblx0XHRcdGNhcmQsXG5cdFx0XHRtYWluLFxuXHRcdFx0YWN0aW9ucyxcblx0XHRcdG5hbWVUZXh0OiBuYW1lVGV4dEVsLFxuXHRcdFx0c2NoZWR1bGVFbCxcblx0XHRcdGZvbGRlckVsLFxuXHRcdFx0Zm9sZGVySG92ZXIsXG5cdFx0XHRwcm9tcHRFbCxcblx0XHRcdGRpc2FibGVkQmFkZ2UsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHR9O1xuXHRcdHRoaXMudXBkYXRlQ2FyZChlbnRyeSwgYXV0b21hdGlvbik7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDYXJkKGNhcmQ6IElBdXRvbWF0aW9uQ2FyZEVudHJ5LCBhdXRvbWF0aW9uOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IsIHByZXZpb3VzPzogSUF1dG9tYXRpb25EZXNjcmlwdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NoZWR1bGUgPSBmb3JtYXRTY2hlZHVsZShhdXRvbWF0aW9uKTtcblx0XHRjb25zdCBzY2hlZHVsZUNoYW5nZWQgPSAhcHJldmlvdXMgfHwgZm9ybWF0U2NoZWR1bGUocHJldmlvdXMpICE9PSBzY2hlZHVsZTtcblx0XHRjb25zdCBuYW1lQ2hhbmdlZCA9ICFwcmV2aW91cyB8fCBwcmV2aW91cy5uYW1lICE9PSBhdXRvbWF0aW9uLm5hbWU7XG5cdFx0aWYgKG5hbWVDaGFuZ2VkIHx8IHNjaGVkdWxlQ2hhbmdlZCkge1xuXHRcdFx0Y2FyZC5jYXJkLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdhdXRvbWF0aW9uQ2FyZCcsIFwiezB9IFx1MjAxNCB7MX1cIiwgYXV0b21hdGlvbi5uYW1lLCBzY2hlZHVsZSkpO1xuXHRcdH1cblx0XHRpZiAobmFtZUNoYW5nZWQpIHtcblx0XHRcdGNhcmQubWFpbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZWRpdEF1dG9tYXRpb25OYW1lZCcsIFwiRWRpdCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRcdGNhcmQuYWN0aW9ucy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYXV0b21hdGlvbkFjdGlvbnMnLCBcIkFjdGlvbnMgZm9yIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRcdGNhcmQubmFtZVRleHQudGV4dENvbnRlbnQgPSBhdXRvbWF0aW9uLm5hbWU7XG5cdFx0fVxuXHRcdGlmICghcHJldmlvdXMgfHwgcHJldmlvdXMuZW5hYmxlZCAhPT0gYXV0b21hdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRjYXJkLmRpc2FibGVkQmFkZ2Uuc3R5bGUuZGlzcGxheSA9IGF1dG9tYXRpb24uZW5hYmxlZCA/ICdub25lJyA6ICcnO1xuXHRcdH1cblx0XHRpZiAoc2NoZWR1bGVDaGFuZ2VkKSB7XG5cdFx0XHRjYXJkLnNjaGVkdWxlRWwudGV4dENvbnRlbnQgPSBzY2hlZHVsZTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJMYWJlbCA9IGdldEF1dG9tYXRpb25UYXJnZXRMYWJlbChhdXRvbWF0aW9uLnRhcmdldCk7XG5cdFx0aWYgKCFwcmV2aW91cyB8fCBnZXRBdXRvbWF0aW9uVGFyZ2V0TGFiZWwocHJldmlvdXMudGFyZ2V0KSAhPT0gZm9sZGVyTGFiZWwpIHtcblx0XHRcdGNhcmQuZm9sZGVyRWwudGV4dENvbnRlbnQgPSBmb2xkZXJMYWJlbDtcblx0XHRcdGNhcmQuZm9sZGVySG92ZXIudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBjYXJkLmZvbGRlckVsLCBmb2xkZXJMYWJlbCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcmV2aW91cyB8fCBwcmV2aW91cy5wcm9tcHQgIT09IGF1dG9tYXRpb24ucHJvbXB0KSB7XG5cdFx0XHRjb25zdCBtYXhMZW5ndGggPSAxMjA7XG5cdFx0XHRjYXJkLnByb21wdEVsLnRleHRDb250ZW50ID0gYXV0b21hdGlvbi5wcm9tcHQubGVuZ3RoID4gbWF4TGVuZ3RoXG5cdFx0XHRcdD8gYXV0b21hdGlvbi5wcm9tcHQuc2xpY2UoMCwgbWF4TGVuZ3RoKSArICdcdTIwMjYnXG5cdFx0XHRcdDogYXV0b21hdGlvbi5wcm9tcHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJY29uQnV0dG9uKGJ1dHRvbkJhcjogQnV0dG9uQmFyLCBpY29uOiBUaGVtZUljb24sIHRvb2x0aXA6IHN0cmluZywgZGlzYWJsZWQ6IGJvb2xlYW4pOiBJQnV0dG9uIHtcblx0XHRjb25zdCBidXR0b24gPSBidXR0b25CYXIuYWRkQnV0dG9uKHtcblx0XHRcdGFyaWFMYWJlbDogdG9vbHRpcCxcblx0XHRcdGRpc2FibGVkLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0dGl0bGU6IHRvb2x0aXAsXG5cdFx0fSk7XG5cdFx0YnV0dG9uLmxhYmVsID0gYCQoJHtpY29uLmlkfSlgO1xuXHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2F1dG9tYXRpb25zLWNhcmQtYWN0aW9uLWJ1dHRvbicpO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1bk5vdyhhdXRvbWF0aW9uOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuZW5zdXJlRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvcGVyYXRpb24gPSB0aGlzLmF1dG9tYXRpb25SdW5uZXIucnVuT25jZShhdXRvbWF0aW9uLCAnbWFudWFsJywgMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBkaXNwYXRjaCA9IGF3YWl0IG9wZXJhdGlvbi53aGVuRGlzcGF0Y2hlZDtcblx0XHRcdHN3aXRjaCAoZGlzcGF0Y2gua2luZCkge1xuXHRcdFx0XHRjYXNlICdzdGFydGVkJzpcblx0XHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25TdGFydGVkU3RhdHVzJywgXCJTdGFydGVkIGF1dG9tYXRpb24gezB9XCIsIGF1dG9tYXRpb24ubmFtZSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdhbHJlYWR5UnVubmluZyc6XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uQWxyZWFkeVJ1bm5pbmdTdGF0dXMnLCBcIkF1dG9tYXRpb24gezB9IGlzIGFscmVhZHkgcnVubmluZ1wiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbm90U3RhcnRlZCc6XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uTm90U3RhcnRlZFN0YXR1cycsIFwiQXV0b21hdGlvbiB7MH0gZGlkIG5vdCBzdGFydFwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF3YWl0IG9wZXJhdGlvbi53aGVuQ29tcGxldGVkO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc0NhcmRzXSBGYWlsZWQgdG8gcnVuIGF1dG9tYXRpb24nLCBlcnJvcik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuQWN0aW9uRmFpbGVkJywgXCJGYWlsZWQgdG8gcnVuIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRnZXRFcnJvck1lc3NhZ2UoZXJyb3IpLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVtcHR5U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGl0bGUgPSBET00uYXBwZW5kKHRoaXMuZW1wdHlDb250YWluZXIsICQoJ2gzLmF1dG9tYXRpb25zLWNhcmRzLWVtcHR5LXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vQXV0b21hdGlvbnNZZXQnLCBcIk5vIGF1dG9tYXRpb25zIHlldFwiKTtcblx0XHRjb25zdCBkZXNjID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCdwLmF1dG9tYXRpb25zLWNhcmRzLWVtcHR5LWRlc2NyaXB0aW9uJykpO1xuXHRcdGRlc2MudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9BdXRvbWF0aW9uc0Rlc2MnLCBcIkNyZWF0ZSBhbiBhdXRvbWF0aW9uIHRvIHNjaGVkdWxlIGFuIGFnZW50IHNlc3Npb24gdG8gcnVuIG9uIGEgY2FkZW5jZSB5b3UgY2hvb3NlLlwiKTtcblxuXHRcdGNvbnN0IGNyZWF0ZUJ1dHRvbiA9IHRoaXMuZW1wdHlTdGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMuZW1wdHlDb250YWluZXIsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NyZWF0ZUF1dG9tYXRpb24nLCBcIkNyZWF0ZSBBdXRvbWF0aW9uXCIpLFxuXHRcdH0pKTtcblx0XHRjcmVhdGVCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY3JlYXRlQXV0b21hdGlvbicsIFwiQ3JlYXRlIEF1dG9tYXRpb25cIik7XG5cdFx0Y3JlYXRlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbnMtY2FyZHMtY3JlYXRlLWJ1dHRvbicpO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZURpc3Bvc2FibGVzLmFkZChjcmVhdGVCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLm9wZW5DcmVhdGVEaWFsb2coKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQ3JlYXRlRGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYXdhaXQgdGhpcy5lbnN1cmVFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5zaG93QXV0b21hdGlvbkRpYWxvZyh7fSk7XG5cdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LmtpbmQgIT09ICdjcmVhdGUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghYXdhaXQgdGhpcy5lbnN1cmVFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24ocmVzdWx0LnZhbHVlLCAoKSA9PiB0aGlzLnRocm93SWZEaXNhYmxlZCgpKTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnYXV0b21hdGlvbkNyZWF0ZWRTdGF0dXMnLCBcIkNyZWF0ZWQgYXV0b21hdGlvbiB7MH1cIiwgY3JlYXRlZC5uYW1lKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc0NhcmRzXSBGYWlsZWQgdG8gY3JlYXRlIGF1dG9tYXRpb24nLCBlcnIpO1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKFxuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b21hdGlvbkNyZWF0ZUZhaWxlZCcsIFwiRmFpbGVkIHRvIGNyZWF0ZSBhdXRvbWF0aW9uLlwiKSxcblx0XHRcdFx0Z2V0RXJyb3JNZXNzYWdlKGVyciksXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkVkaXREaWFsb2coYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5zaG93QXV0b21hdGlvbkRpYWxvZyh7IGV4aXN0aW5nOiBhdXRvbWF0aW9uIH0pO1xuXHRcdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LmtpbmQgIT09ICd1cGRhdGUnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghYXdhaXQgdGhpcy5lbnN1cmVFbmFibGVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlUmVzdWx0ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS51cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQocmVzdWx0LmlkLCByZXN1bHQudmFsdWUsIGF1dG9tYXRpb24sICgpID0+IHRoaXMudGhyb3dJZkRpc2FibGVkKCkpO1xuXHRcdFx0aWYgKHVwZGF0ZVJlc3VsdC5raW5kID09PSAnY29uZmxpY3QnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcih1cGRhdGVSZXN1bHQuY3VycmVudFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb25DaGFuZ2VkRHVyaW5nRWRpdCcsIFwiVGhpcyBhdXRvbWF0aW9uIGNoYW5nZWQgd2hpbGUgdGhlIGRpYWxvZyB3YXMgb3Blbi4gUmVvcGVuIGl0IHRvIHJldmlldyB0aGUgbGF0ZXN0IHZhbHVlcy5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhdXRvbWF0aW9uRGVsZXRlZER1cmluZ0VkaXQnLCBcIlRoaXMgYXV0b21hdGlvbiB3YXMgZGVsZXRlZCB3aGlsZSB0aGUgZGlhbG9nIHdhcyBvcGVuLlwiKSk7XG5cdFx0XHR9XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25VcGRhdGVkU3RhdHVzJywgXCJVcGRhdGVkIGF1dG9tYXRpb24gezB9XCIsIGF1dG9tYXRpb24ubmFtZSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNDYXJkc10gRmFpbGVkIHRvIHVwZGF0ZSBhdXRvbWF0aW9uJywgZXJyKTtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25VcGRhdGVGYWlsZWQnLCBcIkZhaWxlZCB0byB1cGRhdGUgYXV0b21hdGlvbi5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnIpLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbmZpcm1EZWxldGUoYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZUF1dG9tYXRpb24nLCBcIkRlbGV0ZSBhdXRvbWF0aW9uIFxcXCJ7MH1cXFwiP1wiLCBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZURldGFpbCcsIFwiVGhpcyB3aWxsIHBlcm1hbmVudGx5IGRlbGV0ZSB0aGUgYXV0b21hdGlvbiBhbmQgaXRzIHJ1biBoaXN0b3J5LlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSxcblx0XHR9KTtcblx0XHRpZiAoIWNvbmZpcm1lZC5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFhd2FpdCB0aGlzLmVuc3VyZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS5kZWxldGVBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQsICgpID0+IHRoaXMudGhyb3dJZkRpc2FibGVkKCkpO1xuXHRcdFx0c3RhdHVzKGxvY2FsaXplKCdhdXRvbWF0aW9uRGVsZXRlZFN0YXR1cycsIFwiRGVsZXRlZCBhdXRvbWF0aW9uIHswfVwiLCBhdXRvbWF0aW9uLm5hbWUpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25zQ2FyZHNdIEZhaWxlZCB0byBkZWxldGUgYXV0b21hdGlvbicsIGVycik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uRGVsZXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gZGVsZXRlIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRnZXRFcnJvck1lc3NhZ2UoZXJyKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBlbnN1cmVFbmFibGVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0YXdhaXQgc2hvd0F1dG9tYXRpb25zRGlzYWJsZWQodGhpcy5kaWFsb2dTZXJ2aWNlKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHRocm93SWZEaXNhYmxlZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYXV0b21hdGlvbnNEaXNhYmxlZEJlZm9yZVNhdmUnLCBcIkF1dG9tYXRpb25zIHdlcmUgZGlzYWJsZWQgYmVmb3JlIHRoZSBjaGFuZ2UgY291bGQgYmUgc2F2ZWQuXCIpKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBBdXRvbWF0aW9uSGlzdG9yeVNlY3Rpb25cblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBydW4gaGlzdG9yeSBsaXN0IGdyb3VwZWQgYnkgZGF0ZS4gR3JvdXBzIGFyZSBwZXJzaXN0ZW50IHRvIGF2b2lkXG4gKiB0aGUgY29udGV4dC1rZXkgZGVmYXVsdC12YWx1ZSBmbGFzaCB0aGF0IGEgZnVsbCB0ZWFyLWRvd24vcmVidWlsZCB3b3VsZCBjYXVzZS5cbiAqL1xuY2xhc3MgQXV0b21hdGlvbkhpc3RvcnlTZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGdyb3Vwc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGVhZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlcnNpc3RlbnRHcm91cHMgPSBuZXcgTWFwPHN0cmluZywgSUF1dG9tYXRpb25IaXN0b3J5R3JvdXA+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcnVuRm9jdXNUYXJnZXRzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgbGlzdDogU2Vzc2lvbnNGbGF0TGlzdDsgcmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb24gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBhcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsO1xuXHRwcml2YXRlIHJlbmRlcmVkRm9jdXNhYmxlUnVuSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHBlbmRpbmdGb2N1c1J1bklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2hvdWxkUmVzdG9yZUZvY3VzID0gZmFsc2U7XG5cdHByaXZhdGUgaGVhZGVyUm93OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtYXJrQWxsQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFJ1bnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRTZXNzaW9ucyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seU1hcDxzdHJpbmcsIElTZXNzaW9uPj4odGhpcywgbmV3IE1hcCgpKTtcblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zZUFsbEdyb3VwcygpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmb2N1c0ZhbGxiYWNrOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzTWFya2luZ0FsbFJlYWQ6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBJQXV0b21hdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmF1dG9tYXRpb25zLWhpc3RvcnknKSk7XG5cdFx0dGhpcy5ncm91cHNDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbnMtaGlzdG9yeS1ncm91cHMnKSk7XG5cdFx0dGhpcy5hcHByb3ZhbE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsKSk7XG5cdH1cblxuXHRyZW5kZXIocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgc2Vzc2lvbnM6IFJlYWRvbmx5TWFwPHN0cmluZywgSVNlc3Npb24+KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJ1bnMgPSBydW5zLmZpbHRlcihydW4gPT4gc2Vzc2lvbnMuaGFzKHJ1bi5pZCkpO1xuXHRcdGNvbnN0IHZpc2libGVSdW5zID0gcnVucy5maWx0ZXIocnVuID0+XG5cdFx0XHRzZXNzaW9ucy5oYXMocnVuLmlkKVxuXHRcdFx0fHwgaXNUZW1wb3JhcnlBdXRvbWF0aW9uUnVuKHJ1bilcblx0XHRcdHx8ICghIXJ1bi5zZXNzaW9uUmVzb3VyY2UgJiYgISF0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihydW4uc2Vzc2lvblJlc291cmNlKSlcblx0XHQpO1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuY3VycmVudFJ1bnMuc2V0KHNlc3Npb25SdW5zLCB0eCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRTZXNzaW9ucy5zZXQoc2Vzc2lvbnMsIHR4KTtcblx0XHR9KTtcblx0XHR0aGlzLnJ1bkZvY3VzVGFyZ2V0cy5jbGVhcigpO1xuXHRcdHRoaXMucmVuZGVyZWRGb2N1c2FibGVSdW5JZHMgPSBbXTtcblxuXHRcdGlmICh2aXNpYmxlUnVucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmRpc3Bvc2VBbGxHcm91cHMoKTtcblx0XHRcdHRoaXMucmVzdG9yZUZvY3VzQWZ0ZXJSZW5kZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5lbnN1cmVIZWFkZXIoKTtcblxuXHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwUnVuc0J5RGF0ZSh2aXNpYmxlUnVucyk7XG5cdFx0Y29uc3QgYWN0aXZlS2V5cyA9IG5ldyBTZXQoZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5rZXkpKTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiB0aGlzLnBlcnNpc3RlbnRHcm91cHMpIHtcblx0XHRcdGlmICghYWN0aXZlS2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRlbnRyeS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGVudHJ5LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMucGVyc2lzdGVudEdyb3Vwcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgaW5kZXggPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25JdGVtcyA9IHRoaXMucmVzb2x2ZVNlc3Npb25JdGVtcyhncm91cC5ydW5zLCBzZXNzaW9ucyk7XG5cdFx0XHRjb25zdCB0ZW1wb3JhcnlSdW5zID0gZ3JvdXAucnVucy5maWx0ZXIocnVuID0+ICFzZXNzaW9ucy5oYXMocnVuLmlkKSk7XG5cblx0XHRcdGxldCBlbnRyeSA9IHRoaXMucGVyc2lzdGVudEdyb3Vwcy5nZXQoZ3JvdXAua2V5KTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRpZiAoZW50cnkuaGVhZGVyLnRleHRDb250ZW50ICE9PSBncm91cC5sYWJlbCkge1xuXHRcdFx0XHRcdGVudHJ5LmhlYWRlci50ZXh0Q29udGVudCA9IGdyb3VwLmxhYmVsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXBkYXRlVGVtcG9yYXJ5UnVucyhlbnRyeSwgdGVtcG9yYXJ5UnVucyk7XG5cdFx0XHRcdHRoaXMudXBkYXRlR3JvdXBTZXNzaW9ucyhlbnRyeSwgc2Vzc2lvbkl0ZW1zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVudHJ5ID0gdGhpcy5jcmVhdGVHcm91cChncm91cC5rZXksIGdyb3VwLmxhYmVsLCB0ZW1wb3JhcnlSdW5zLCBzZXNzaW9uSXRlbXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50RWxlbWVudCA9IHRoaXMuZ3JvdXBzQ29udGFpbmVyLmNoaWxkcmVuLml0ZW0oaW5kZXgpO1xuXHRcdFx0aWYgKGN1cnJlbnRFbGVtZW50ICE9PSBlbnRyeS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuZ3JvdXBzQ29udGFpbmVyLmluc2VydEJlZm9yZShlbnRyeS5lbGVtZW50LCBjdXJyZW50RWxlbWVudCk7XG5cdFx0XHRcdGlmIChlbnRyeS5saXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRTZXNzaW9uTGlzdChlbnRyeS5saXN0Q29udGFpbmVyLCBlbnRyeS5saXN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aW5kZXgrKztcblxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNlc3Npb25JdGVtcykge1xuXHRcdFx0XHRpZiAoIWVudHJ5Lmxpc3QpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlbmRlcmVkRm9jdXNhYmxlUnVuSWRzLnB1c2goaXRlbS5ydW4uaWQpO1xuXHRcdFx0XHR0aGlzLnJ1bkZvY3VzVGFyZ2V0cy5zZXQoaXRlbS5ydW4uaWQsIHsgbGlzdDogZW50cnkubGlzdCwgc2Vzc2lvbjogaXRlbS5zZXNzaW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVzdG9yZUZvY3VzQWZ0ZXJSZW5kZXIoKTtcblx0fVxuXG5cdGxheW91dCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMucGVyc2lzdGVudEdyb3Vwcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGVudHJ5Lmxpc3QpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXNzaW9uTGlzdChlbnRyeS5saXN0Q29udGFpbmVyLCBlbnRyeS5saXN0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUhlYWRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oZWFkZXJSb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5oZWFkZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuaGVhZGVyUm93ID0gRE9NLiQoJy5hdXRvbWF0aW9ucy1oaXN0b3J5LWhlYWRlcicpO1xuXHRcdHRoaXMuY29udGFpbmVyLmluc2VydEJlZm9yZSh0aGlzLmhlYWRlclJvdywgdGhpcy5ncm91cHNDb250YWluZXIpO1xuXHRcdGNvbnN0IGhlYWRlckxhYmVsID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlclJvdywgJCgnc3BhbicpKTtcblx0XHRoZWFkZXJMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdoaXN0b3J5SGVhZGVyJywgXCJIaXN0b3J5XCIpO1xuXG5cdFx0dGhpcy5tYXJrQWxsQnV0dG9uID0gdGhpcy5oZWFkZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aGlzLmhlYWRlclJvdywge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWFya0FsbFJlYWQnLCBcIk1hcmsgYWxsIGFzIHJlYWRcIiksXG5cdFx0fSkpO1xuXHRcdHRoaXMubWFya0FsbEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdtYXJrQWxsUmVhZCcsIFwiTWFyayBhbGwgYXMgcmVhZFwiKTtcblx0XHR0aGlzLm1hcmtBbGxCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhdXRvbWF0aW9ucy1tYXJrLWFsbC1yZWFkJyk7XG5cdFx0dGhpcy5oZWFkZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrQWxsQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLm1hcmtBbGxSdW5zUmVhZCh0aGlzLmN1cnJlbnRSdW5zLmdldCgpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5oZWFkZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcnVucyA9IHRoaXMuY3VycmVudFJ1bnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmN1cnJlbnRTZXNzaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc01hcmtpbmdBbGxSZWFkID0gdGhpcy5pc01hcmtpbmdBbGxSZWFkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGhhc1VucmVhZCA9IHJ1bnMuc29tZShydW4gPT4gaXNVbnJlYWRBdXRvbWF0aW9uUnVuKHJ1biwgc2Vzc2lvbnMuZ2V0KHJ1bi5pZCksIHJlYWRlcikpO1xuXHRcdFx0dGhpcy5tYXJrQWxsQnV0dG9uIS5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBoYXNVbnJlYWQgPyAnJyA6ICdub25lJztcblx0XHRcdHRoaXMubWFya0FsbEJ1dHRvbiEuZW5hYmxlZCA9IGhhc1VucmVhZCAmJiAhaXNNYXJraW5nQWxsUmVhZDtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVTZXNzaW9uSXRlbXMocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgc2Vzc2lvbnM6IFJlYWRvbmx5TWFwPHN0cmluZywgSVNlc3Npb24+KTogSUF1dG9tYXRpb25IaXN0b3J5SXRlbVtdIHtcblx0XHRjb25zdCBpdGVtczogSUF1dG9tYXRpb25IaXN0b3J5SXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBydW4gb2YgcnVucykge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zLmdldChydW4uaWQpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IHJ1biwgc2Vzc2lvbiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVHcm91cChrZXk6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdGVtcG9yYXJ5UnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgaXRlbXM6IHJlYWRvbmx5IElBdXRvbWF0aW9uSGlzdG9yeUl0ZW1bXSk6IElBdXRvbWF0aW9uSGlzdG9yeUdyb3VwIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gJCgnLmF1dG9tYXRpb25zLWhpc3RvcnktZ3JvdXAnKTtcblx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKGVsZW1lbnQsICQoJy5hdXRvbWF0aW9ucy1oaXN0b3J5LWdyb3VwLWhlYWRlcicpKTtcblx0XHRoZWFkZXIudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRjb25zdCB0ZW1wb3JhcnlSb3dzQ29udGFpbmVyID0gRE9NLmFwcGVuZChlbGVtZW50LCAkKCcuYXV0b21hdGlvbnMtdGVtcG9yYXJ5LXJ1bnMnKSk7XG5cdFx0Y29uc3QgbGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQoZWxlbWVudCwgJCgnLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QnKSk7XG5cblx0XHRjb25zdCBydW5zQnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIElBdXRvbWF0aW9uUnVuPigpO1xuXHRcdGNvbnN0IGVudHJ5OiBJQXV0b21hdGlvbkhpc3RvcnlHcm91cCA9IHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRoZWFkZXIsXG5cdFx0XHR0ZW1wb3JhcnlSb3dzQ29udGFpbmVyLFxuXHRcdFx0dGVtcG9yYXJ5Um93czogZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlTWFwKCkpLFxuXHRcdFx0bGlzdENvbnRhaW5lcixcblx0XHRcdGxpc3REaXNwb3NhYmxlczogZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKSxcblx0XHRcdGxpc3Q6IHVuZGVmaW5lZCxcblx0XHRcdHJ1bnNCeVNlc3Npb24sXG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHR9O1xuXHRcdHRoaXMucGVyc2lzdGVudEdyb3Vwcy5zZXQoa2V5LCBlbnRyeSk7XG5cblx0XHR0aGlzLnVwZGF0ZVRlbXBvcmFyeVJ1bnMoZW50cnksIHRlbXBvcmFyeVJ1bnMpO1xuXHRcdHRoaXMudXBkYXRlR3JvdXBTZXNzaW9ucyhlbnRyeSwgaXRlbXMpO1xuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlR3JvdXBMaXN0KGVudHJ5OiBJQXV0b21hdGlvbkhpc3RvcnlHcm91cCk6IFNlc3Npb25zRmxhdExpc3Qge1xuXHRcdGlmIChlbnRyeS5saXN0KSB7XG5cdFx0XHRyZXR1cm4gZW50cnkubGlzdDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsaXN0ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNGbGF0TGlzdCwgZW50cnkubGlzdENvbnRhaW5lciwge1xuXHRcdFx0c2hvd1Nlc3Npb25Ib3ZlcjogZmFsc2UsXG5cdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHR0b29sYmFyTWVudUlkOiBNZW51cy5BdXRvbWF0aW9uc0hpc3RvcnlJdGVtLFxuXHRcdFx0bWFya1Nlc3Npb25SZWFkT25PcGVuOiBmYWxzZSxcblx0XHRcdGFwcHJvdmFsTW9kZWw6IHRoaXMuYXBwcm92YWxNb2RlbCxcblx0XHRcdG9uU2Vzc2lvbk9wZW46IHJlc291cmNlID0+IHZvaWQgdGhpcy5vcGVuUnVuU2Vzc2lvbihyZXNvdXJjZSksXG5cdFx0XHRvblRvb2xiYXJBY3Rpb246IChhY3Rpb24sIHNlc3Npb24pID0+IHRoaXMuaGFuZGxlU2Vzc2lvblRvb2xiYXJBY3Rpb24oYWN0aW9uLCBzZXNzaW9uLCBlbnRyeS5ydW5zQnlTZXNzaW9uKSxcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxpc3Qub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHRoaXMubGF5b3V0U2Vzc2lvbkxpc3QoZW50cnkubGlzdENvbnRhaW5lciwgbGlzdCkpKTtcblx0XHRlbnRyeS5saXN0ID0gbGlzdDtcblx0XHRlbnRyeS5saXN0RGlzcG9zYWJsZXMudmFsdWUgPSBkaXNwb3NhYmxlcztcblx0XHRyZXR1cm4gbGlzdDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGVtcG9yYXJ5UnVucyhlbnRyeTogSUF1dG9tYXRpb25IaXN0b3J5R3JvdXAsIHJ1bnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10pOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVSdW5JZHMgPSBuZXcgU2V0KHJ1bnMubWFwKHJ1biA9PiBydW4uaWQpKTtcblx0XHRmb3IgKGNvbnN0IHJ1bklkIG9mIGVudHJ5LnRlbXBvcmFyeVJvd3Mua2V5cygpKSB7XG5cdFx0XHRpZiAoIWFjdGl2ZVJ1bklkcy5oYXMocnVuSWQpKSB7XG5cdFx0XHRcdGVudHJ5LnRlbXBvcmFyeVJvd3MuZGVsZXRlQW5kRGlzcG9zZShydW5JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGluZGV4ID0gMDtcblx0XHRmb3IgKGNvbnN0IHJ1biBvZiBydW5zKSB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZ2V0QXV0b21hdGlvbk5hbWUocnVuKTtcblx0XHRcdGxldCByb3cgPSBlbnRyeS50ZW1wb3JhcnlSb3dzLmdldChydW4uaWQpO1xuXHRcdFx0aWYgKCFyb3cpIHtcblx0XHRcdFx0cm93ID0gdGhpcy5jcmVhdGVUZW1wb3JhcnlSdW5Sb3codGl0bGUpO1xuXHRcdFx0XHRlbnRyeS50ZW1wb3JhcnlSb3dzLnNldChydW4uaWQsIHJvdyk7XG5cdFx0XHR9IGVsc2UgaWYgKHJvdy50aXRsZS50ZXh0Q29udGVudCAhPT0gdGl0bGUpIHtcblx0XHRcdFx0cm93LnRpdGxlLnRleHRDb250ZW50ID0gdGl0bGU7XG5cdFx0XHRcdHJvdy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuV29ya2luZ0FyaWFMYWJlbCcsIFwiezB9LCBXb3JraW5nLi4uXCIsIHRpdGxlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRFbGVtZW50ID0gZW50cnkudGVtcG9yYXJ5Um93c0NvbnRhaW5lci5jaGlsZHJlbi5pdGVtKGluZGV4KTtcblx0XHRcdGlmIChjdXJyZW50RWxlbWVudCAhPT0gcm93LmVsZW1lbnQpIHtcblx0XHRcdFx0ZW50cnkudGVtcG9yYXJ5Um93c0NvbnRhaW5lci5pbnNlcnRCZWZvcmUocm93LmVsZW1lbnQsIGN1cnJlbnRFbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdGluZGV4Kys7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUZW1wb3JhcnlSdW5Sb3codGl0bGU6IHN0cmluZyk6IElBdXRvbWF0aW9uVGVtcG9yYXJ5UnVuUm93IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gJCgnLmF1dG9tYXRpb25zLXRlbXBvcmFyeS1ydW4uc2Vzc2lvbi1pdGVtJyk7XG5cdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuV29ya2luZ0FyaWFMYWJlbCcsIFwiezB9LCBXb3JraW5nLi4uXCIsIHRpdGxlKSk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoZWxlbWVudCwgJCgnLnNlc3Npb24taWNvbicpKTtcblx0XHRjb25zdCBzdGF0dXNJY29uID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblN0YXR1c0ljb24sIGljb24pKTtcblx0XHRzdGF0dXNJY29uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHRydWUsIGZhbHNlKTtcblx0XHRjb25zdCBtYWluID0gRE9NLmFwcGVuZChlbGVtZW50LCAkKCcuc2Vzc2lvbi1tYWluJykpO1xuXHRcdGNvbnN0IHRpdGxlUm93ID0gRE9NLmFwcGVuZChtYWluLCAkKCcuc2Vzc2lvbi10aXRsZS1yb3cnKSk7XG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gRE9NLmFwcGVuZCh0aXRsZVJvdywgJCgnc3Bhbi5zZXNzaW9uLXRpdGxlJykpO1xuXHRcdHRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IHRpdGxlO1xuXHRcdGNvbnN0IGRldGFpbHNSb3cgPSBET00uYXBwZW5kKG1haW4sICQoJy5zZXNzaW9uLWRldGFpbHMtcm93JykpO1xuXHRcdERPTS5hcHBlbmQoZGV0YWlsc1JvdywgJCgnc3Bhbi5zZXNzaW9uLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2F1dG9tYXRpb25SdW5Xb3JraW5nJywgXCJXb3JraW5nLi4uXCIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0dGl0bGU6IHRpdGxlRWxlbWVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRlbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVHcm91cFNlc3Npb25zKFxuXHRcdGVudHJ5OiBJQXV0b21hdGlvbkhpc3RvcnlHcm91cCxcblx0XHRpdGVtczogcmVhZG9ubHkgSUF1dG9tYXRpb25IaXN0b3J5SXRlbVtdLFxuXHQpOiB2b2lkIHtcblx0XHRlbnRyeS5ydW5zQnlTZXNzaW9uLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRlbnRyeS5ydW5zQnlTZXNzaW9uLnNldChpdGVtLnNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgaXRlbS5ydW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25zID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5zZXNzaW9uKTtcblx0XHRpZiAoZW50cnkuc2Vzc2lvbnMubGVuZ3RoID09PSBzZXNzaW9ucy5sZW5ndGggJiYgZW50cnkuc2Vzc2lvbnMuZXZlcnkoKHNlc3Npb24sIGluZGV4KSA9PiBzZXNzaW9uID09PSBzZXNzaW9uc1tpbmRleF0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJ5LnNlc3Npb25zID0gc2Vzc2lvbnM7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0ZW50cnkubGlzdCA9IHVuZGVmaW5lZDtcblx0XHRcdGVudHJ5Lmxpc3REaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0RE9NLmNsZWFyTm9kZShlbnRyeS5saXN0Q29udGFpbmVyKTtcblx0XHRcdGVudHJ5Lmxpc3RDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLmVuc3VyZUdyb3VwTGlzdChlbnRyeSk7XG5cdFx0bGlzdC5zZXRTZXNzaW9ucyhzZXNzaW9ucyk7XG5cdFx0dGhpcy5sYXlvdXRTZXNzaW9uTGlzdChlbnRyeS5saXN0Q29udGFpbmVyLCBsaXN0KTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUFsbEdyb3VwcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiB0aGlzLnBlcnNpc3RlbnRHcm91cHMpIHtcblx0XHRcdGVudHJ5LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdGVudHJ5LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnBlcnNpc3RlbnRHcm91cHMuZGVsZXRlKGtleSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmhlYWRlclJvdykge1xuXHRcdFx0dGhpcy5oZWFkZXJSb3cucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLmhlYWRlclJvdyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMubWFya0FsbEJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuaGVhZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFNlc3Npb25MaXN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxpc3Q6IFNlc3Npb25zRmxhdExpc3QpOiB2b2lkIHtcblx0XHRjb25zdCBoZWlnaHQgPSBsaXN0LmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRjb25zdCB3aWR0aCA9IGNvbnRhaW5lci5jbGllbnRXaWR0aDtcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHRsaXN0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlU2Vzc2lvblRvb2xiYXJBY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBzZXNzaW9uOiBJU2Vzc2lvbiwgcnVuc0J5U2Vzc2lvbjogUmVhZG9ubHlNYXA8c3RyaW5nLCBJQXV0b21hdGlvblJ1bj4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBydW4gPSBydW5zQnlTZXNzaW9uLmdldChzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghcnVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHN3aXRjaCAoYWN0aW9uLmlkKSB7XG5cdFx0XHRjYXNlIFNUT1BfQVVUT01BVElPTl9SVU5fU0VTU0lPTl9DT01NQU5EX0lEOlxuXHRcdFx0XHRhY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN0b3BSdW5TZXNzaW9uKHNlc3Npb24sIHRoaXMuZ2V0QXV0b21hdGlvbk5hbWUocnVuKSwgYWN0aW9uKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIERFTEVURV9BVVRPTUFUSU9OX1JVTl9TRVNTSU9OX0NPTU1BTkRfSUQ6XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlybURlbGV0ZVJ1blNlc3Npb24ocnVuLCBzZXNzaW9uLCB0aGlzLmdldEF1dG9tYXRpb25OYW1lKHJ1bikpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEF1dG9tYXRpb25OYW1lKHJ1bjogSUF1dG9tYXRpb25SdW4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLmZpbmQoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkID09PSBydW4uYXV0b21hdGlvbklkKT8ubmFtZVxuXHRcdFx0Pz8gbG9jYWxpemUoJ3Vua25vd25BdXRvbWF0aW9uJywgXCJVbmtub3duXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuUnVuU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLm9wZW5TZXNzaW9uKHJlc291cmNlLCB7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc0NhcmRzXSBGYWlsZWQgdG8gb3BlbiBhdXRvbWF0aW9uIHJ1bicsIGVycm9yKTtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25SdW5PcGVuRmFpbGVkJywgXCJGYWlsZWQgdG8gb3BlbiBhdXRvbWF0aW9uIHJ1bi5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnJvciksXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RvcFJ1blNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24sIGF1dG9tYXRpb25OYW1lOiBzdHJpbmcsIGFjdGlvbjogSUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3Qoc2Vzc2lvbik7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ2F1dG9tYXRpb25SdW5TZXNzaW9uU3RvcHBlZFN0YXR1cycsIFwiU3RvcHBlZCB0aGUgc2Vzc2lvbiBmb3IgezB9XCIsIGF1dG9tYXRpb25OYW1lKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25zQ2FyZHNdIEZhaWxlZCB0byBzdG9wIGF1dG9tYXRpb24gcnVuIHNlc3Npb24nLCBlcnJvcik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuU2Vzc2lvblN0b3BGYWlsZWQnLCBcIkZhaWxlZCB0byBzdG9wIHRoZSBhdXRvbWF0aW9uIHJ1biBzZXNzaW9uLlwiKSxcblx0XHRcdFx0Z2V0RXJyb3JNZXNzYWdlKGVycm9yKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtRGVsZXRlUnVuU2Vzc2lvbihydW46IElBdXRvbWF0aW9uUnVuLCBzZXNzaW9uOiBJU2Vzc2lvbiwgYXV0b21hdGlvbk5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENhcHR1cmUgZm9jdXMgYmVmb3JlIHRoZSBjb25maXJtYXRpb24gZGlhbG9nIG1vdmVzIGl0LlxuXHRcdGNvbnN0IGhhZEZvY3VzID0gdGhpcy5jb250YWluZXIuY29udGFpbnMoRE9NLmdldEFjdGl2ZUVsZW1lbnQoKSk7XG5cdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVBdXRvbWF0aW9uUnVuU2Vzc2lvbicsIFwiRGVsZXRlIHRoZSBzZXNzaW9uIGZvciBcXFwiezB9XFxcIj9cIiwgYXV0b21hdGlvbk5hbWUpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZUF1dG9tYXRpb25SdW5TZXNzaW9uRGV0YWlsJywgXCJUaGlzIHdpbGwgcGVybWFuZW50bHkgZGVsZXRlIHRoZSBzZXNzaW9uIGFuZCByZW1vdmUgdGhpcyBpdGVtIGZyb20gcnVuIGhpc3RvcnkuIFRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuXCIpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2RlbGV0ZScsIFwiRGVsZXRlXCIpLFxuXHRcdH0pO1xuXHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c1J1bklkID0gaGFkRm9jdXMgPyB0aGlzLmdldEZvY3VzUnVuSWRBZnRlckRlbGV0aW9uKHJ1bi5pZCkgOiB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmNsZWFyUGVuZGluZ0ZvY3VzKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc0NhcmRzXSBGYWlsZWQgdG8gZGVsZXRlIGF1dG9tYXRpb24gcnVuIHNlc3Npb24nLCBlcnJvcik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uUnVuU2Vzc2lvbkRlbGV0ZUZhaWxlZCcsIFwiRmFpbGVkIHRvIGRlbGV0ZSB0aGUgYXV0b21hdGlvbiBydW4gc2Vzc2lvbi5cIiksXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnJvciksXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaGFkRm9jdXMpIHtcblx0XHRcdHRoaXMucGVuZGluZ0ZvY3VzUnVuSWQgPSBmb2N1c1J1bklkO1xuXHRcdFx0dGhpcy5zaG91bGRSZXN0b3JlRm9jdXMgPSB0cnVlO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5hdXRvbWF0aW9uU2VydmljZS5kZWxldGVSdW4ocnVuLmlkKTtcblx0XHRcdHRoaXMucmVzdG9yZUZvY3VzQWZ0ZXJSZW5kZXIoKTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnYXV0b21hdGlvblJ1blNlc3Npb25EZWxldGVkU3RhdHVzJywgXCJEZWxldGVkIHRoZSBzZXNzaW9uIGZvciB7MH1cIiwgYXV0b21hdGlvbk5hbWUpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5yZXN0b3JlRm9jdXNBZnRlclJlbmRlcigpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNDYXJkc10gRmFpbGVkIHRvIHJlbW92ZSBkZWxldGVkIGF1dG9tYXRpb24gcnVuIGZyb20gaGlzdG9yeScsIGVycm9yKTtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25SdW5IaXN0b3J5RGVsZXRlRmFpbGVkJywgXCJUaGUgc2Vzc2lvbiB3YXMgZGVsZXRlZCwgYnV0IGl0cyBydW4gaGlzdG9yeSBpdGVtIGNvdWxkIG5vdCBiZSByZW1vdmVkLlwiKSxcblx0XHRcdFx0Z2V0RXJyb3JNZXNzYWdlKGVycm9yKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRGb2N1c1J1bklkQWZ0ZXJEZWxldGlvbihydW5JZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMucmVuZGVyZWRGb2N1c2FibGVSdW5JZHMuaW5kZXhPZihydW5JZCk7XG5cdFx0cmV0dXJuIGluZGV4ID49IDBcblx0XHRcdD8gdGhpcy5yZW5kZXJlZEZvY3VzYWJsZVJ1bklkc1tpbmRleCArIDFdID8/IHRoaXMucmVuZGVyZWRGb2N1c2FibGVSdW5JZHNbaW5kZXggLSAxXVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVGb2N1c0FmdGVyUmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zaG91bGRSZXN0b3JlRm9jdXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5wZW5kaW5nRm9jdXNSdW5JZCA/IHRoaXMucnVuRm9jdXNUYXJnZXRzLmdldCh0aGlzLnBlbmRpbmdGb2N1c1J1bklkKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNsZWFyUGVuZGluZ0ZvY3VzKCk7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0dGFyZ2V0Lmxpc3QuZm9jdXNTZXNzaW9uKHRhcmdldC5zZXNzaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5mb2N1c0ZhbGxiYWNrLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclBlbmRpbmdGb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnBlbmRpbmdGb2N1c1J1bklkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2hvdWxkUmVzdG9yZUZvY3VzID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1hcmtBbGxSdW5zUmVhZChydW5zOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5pc01hcmtpbmdBbGxSZWFkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uPigpO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1biBvZiBydW5zKSB7XG5cdFx0XHRcdGlmICgocnVuLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgfHwgcnVuLnN0YXR1cyA9PT0gJ2ZhaWxlZCcpICYmIHJ1bi5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24ocnVuLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb24gJiYgIXNlc3Npb24uaXNSZWFkLmdldCgpKSB7XG5cdFx0XHRcdFx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZChbLi4uc2Vzc2lvbnMudmFsdWVzKCldKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvbnNDYXJkc10gRmFpbGVkIHRvIG1hcmsgYXV0b21hdGlvbiBydW5zIHJlYWQnLCBlcnJvcik7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uTWFya0FsbFJlYWRGYWlsZWQnLCBcIkZhaWxlZCB0byBtYXJrIGF1dG9tYXRpb24gcnVucyBhcyByZWFkLlwiKSxcblx0XHRcdFx0Z2V0RXJyb3JNZXNzYWdlKGVycm9yKSxcblx0XHRcdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaXNNYXJraW5nQWxsUmVhZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSGVscGVyc1xuXG5mdW5jdGlvbiBpc1VucmVhZEF1dG9tYXRpb25SdW4ocnVuOiBJQXV0b21hdGlvblJ1biwgc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIHJlYWRlcjogSVJlYWRlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKHJ1bi5zdGF0dXMgPT09ICdjb21wbGV0ZWQnIHx8IHJ1bi5zdGF0dXMgPT09ICdmYWlsZWQnKSAmJiAhIXNlc3Npb24gJiYgIXNlc3Npb24uaXNSZWFkLnJlYWQocmVhZGVyKTtcbn1cblxuZnVuY3Rpb24gaXNUZW1wb3JhcnlBdXRvbWF0aW9uUnVuKHJ1bjogSUF1dG9tYXRpb25SdW4pOiBib29sZWFuIHtcblx0cmV0dXJuIHJ1bi5zdGF0dXMgPT09ICdwZW5kaW5nJyB8fCBydW4uc3RhdHVzID09PSAncnVubmluZyc7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFNjaGVkdWxlKGF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvcik6IHN0cmluZyB7XG5cdGNvbnN0IHsgaW50ZXJ2YWwsIHNjaGVkdWxlSG91ciwgc2NoZWR1bGVNaW51dGUgfSA9IGF1dG9tYXRpb24uc2NoZWR1bGU7XG5cdGNvbnN0IHRpbWUgPSBmb3JtYXRIb3VyTWludXRlKHNjaGVkdWxlSG91ciwgc2NoZWR1bGVNaW51dGUpO1xuXHRzd2l0Y2ggKGludGVydmFsKSB7XG5cdFx0Y2FzZSAnaG91cmx5JzogcmV0dXJuIGxvY2FsaXplKCdzY2hlZHVsZUhvdXJseScsIFwiSG91cmx5XCIpO1xuXHRcdGNhc2UgJ2RhaWx5JzogcmV0dXJuIGxvY2FsaXplKCdzY2hlZHVsZURhaWx5QXQnLCBcIkRhaWx5IGF0IHswfVwiLCB0aW1lKTtcblx0XHRjYXNlICd3ZWVrbHknOiB7XG5cdFx0XHRjb25zdCBkYXkgPSBEQVlTX09GX1dFRUtbKChhdXRvbWF0aW9uLnNjaGVkdWxlLnNjaGVkdWxlRGF5ICUgNykgKyA3KSAlIDddO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzY2hlZHVsZVdlZWtseUF0JywgXCJ7MH0gYXQgezF9XCIsIGRheSwgdGltZSk7XG5cdFx0fVxuXHRcdGNhc2UgJ21hbnVhbCc6IHJldHVybiBsb2NhbGl6ZSgnc2NoZWR1bGVNYW51YWwnLCBcIk1hbnVhbFwiKTtcblx0XHRkZWZhdWx0OiByZXR1cm4gbG9jYWxpemUoJ3NjaGVkdWxlTWFudWFsJywgXCJNYW51YWxcIik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0SG91ck1pbnV0ZShob3VyOiBudW1iZXIsIG1pbnV0ZTogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKERhdGUuVVRDKDIwMDAsIDAsIDEsIE1hdGgubWF4KDAsIE1hdGgubWluKDIzLCBob3VyIHwgMCkpLCBNYXRoLm1heCgwLCBNYXRoLm1pbig1OSwgbWludXRlIHwgMCkpKSk7XG5cdHJldHVybiBkYXRlLnRvTG9jYWxlVGltZVN0cmluZyh1bmRlZmluZWQsIHsgaG91cjogJ251bWVyaWMnLCBtaW51dGU6ICcyLWRpZ2l0JywgdGltZVpvbmU6ICdVVEMnIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRBdXRvbWF0aW9uVGFyZ2V0TGFiZWwodGFyZ2V0OiBBdXRvbWF0aW9uVGFyZ2V0KTogc3RyaW5nIHtcblx0cmV0dXJuIHRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJyA/IGJhc2VuYW1lKHRhcmdldC5mb2xkZXJVcmkpIDogbG9jYWxpemUoJ3F1aWNrQ2hhdCcsIFwiUXVpY2sgQ2hhdFwiKTtcbn1cblxuZnVuY3Rpb24gZ3JvdXBSdW5zQnlEYXRlKHJ1bnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10pOiB7IGtleTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBydW5zOiBJQXV0b21hdGlvblJ1bltdIH1bXSB7XG5cdGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cdGNvbnN0IHRvZGF5ID0gbmV3IERhdGUobm93LmdldEZ1bGxZZWFyKCksIG5vdy5nZXRNb250aCgpLCBub3cuZ2V0RGF0ZSgpKTtcblx0Y29uc3QgeWVzdGVyZGF5ID0gbmV3IERhdGUodG9kYXkpO1xuXHR5ZXN0ZXJkYXkuc2V0RGF0ZSh5ZXN0ZXJkYXkuZ2V0RGF0ZSgpIC0gMSk7XG5cdGNvbnN0IGxhc3RXZWVrU3RhcnQgPSBuZXcgRGF0ZSh0b2RheSk7XG5cdGxhc3RXZWVrU3RhcnQuc2V0RGF0ZShsYXN0V2Vla1N0YXJ0LmdldERhdGUoKSAtIDcpO1xuXG5cdGNvbnN0IGdyb3VwczogTWFwPHN0cmluZywgeyBrZXk6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgb3JkZXI6IG51bWJlcjsgcnVuczogSUF1dG9tYXRpb25SdW5bXSB9PiA9IG5ldyBNYXAoKTtcblxuXHRmb3IgKGNvbnN0IHJ1biBvZiBydW5zKSB7XG5cdFx0Y29uc3QgdCA9IERhdGUucGFyc2UocnVuLnN0YXJ0ZWRBdCk7XG5cdFx0aWYgKE51bWJlci5pc05hTih0KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh0KTtcblx0XHRjb25zdCB7IGtleSwgbGFiZWwsIG9yZGVyIH0gPSBnZXREYXRlQnVja2V0KGRhdGUsIHRvZGF5LCB5ZXN0ZXJkYXksIGxhc3RXZWVrU3RhcnQpO1xuXG5cdFx0bGV0IGdyb3VwID0gZ3JvdXBzLmdldChrZXkpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGdyb3VwID0geyBrZXksIGxhYmVsLCBvcmRlciwgcnVuczogW10gfTtcblx0XHRcdGdyb3Vwcy5zZXQoa2V5LCBncm91cCk7XG5cdFx0fVxuXHRcdGdyb3VwLnJ1bnMucHVzaChydW4pO1xuXHR9XG5cblx0cmV0dXJuIFsuLi5ncm91cHMudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKTtcbn1cblxuZnVuY3Rpb24gZ2V0RGF0ZUJ1Y2tldChkYXRlOiBEYXRlLCB0b2RheTogRGF0ZSwgeWVzdGVyZGF5OiBEYXRlLCBsYXN0V2Vla1N0YXJ0OiBEYXRlKTogeyBrZXk6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgb3JkZXI6IG51bWJlciB9IHtcblx0aWYgKGRhdGUgPj0gdG9kYXkpIHtcblx0XHRyZXR1cm4geyBrZXk6ICd0b2RheScsIGxhYmVsOiBsb2NhbGl6ZSgndG9kYXknLCBcIlRvZGF5XCIpLCBvcmRlcjogMCB9O1xuXHR9XG5cdGlmIChkYXRlID49IHllc3RlcmRheSkge1xuXHRcdHJldHVybiB7IGtleTogJ3llc3RlcmRheScsIGxhYmVsOiBsb2NhbGl6ZSgneWVzdGVyZGF5JywgXCJZZXN0ZXJkYXlcIiksIG9yZGVyOiAxIH07XG5cdH1cblx0aWYgKGRhdGUgPj0gbGFzdFdlZWtTdGFydCkge1xuXHRcdHJldHVybiB7IGtleTogJ3dlZWsnLCBsYWJlbDogbG9jYWxpemUoJ2xhc3RXZWVrJywgXCJMYXN0IHdlZWtcIiksIG9yZGVyOiAyIH07XG5cdH1cblx0Y29uc3QgbW9udGhMYWJlbCA9IGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKHVuZGVmaW5lZCwgeyBtb250aDogJ2xvbmcnLCB5ZWFyOiAnbnVtZXJpYycgfSk7XG5cdGNvbnN0IG1vbnRoSW5kZXggPSBkYXRlLmdldEZ1bGxZZWFyKCkgKiAxMiArIGRhdGUuZ2V0TW9udGgoKTtcblx0Y29uc3Qgb3JkZXIgPSAzMDAwMCAtIG1vbnRoSW5kZXg7XG5cdHJldHVybiB7IGtleTogYG1vbnRoLSR7ZGF0ZS5nZXRGdWxsWWVhcigpfS0ke2RhdGUuZ2V0TW9udGgoKX1gLCBsYWJlbDogbW9udGhMYWJlbCwgb3JkZXIgfTtcbn1cblxuZnVuY3Rpb24gZ2V0RXJyb3JNZXNzYWdlKGVycm9yOiB1bmtub3duKTogc3RyaW5nIHtcblx0cmV0dXJuIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hvd0F1dG9tYXRpb25zRGlzYWJsZWQoZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgZGlhbG9nU2VydmljZS5pbmZvKFxuXHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uc0Rpc2FibGVkVGl0bGUnLCBcIkF1dG9tYXRpb25zIGFyZSBkaXNhYmxlZC5cIiksXG5cdFx0bG9jYWxpemUoJ2F1dG9tYXRpb25zRGlzYWJsZWREZXRhaWwnLCBcIkVuYWJsZSBcXHUyMDFDezB9XFx1MjAxRCB0byBtYWtlIGNoYW5nZXMuXCIsIENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HKSxcblx0KTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBBdXRvbWF0aW9uc1ZpZXcgKEN1c3RvbSBWaWV3KVxuXG4vKipcbiAqIEEgY3VzdG9tIHZpZXcgdGhhdCBob3N0cyB0aGUgYXV0b21hdGlvbnMgbWFuYWdlbWVudCBwYWdlIGluc2lkZSB0aGVcbiAqIGFnZW50cyB3aW5kb3csIHVzaW5nIHRoZSBDdXN0b21WaWV3R3JpZFBhcnQgaW5mcmFzdHJ1Y3R1cmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBBdXRvbWF0aW9uc0N1c3RvbVZpZXcgZXh0ZW5kcyBBYnN0cmFjdEN1c3RvbVZpZXcge1xuXG5cdHJlYWRvbmx5IHRpdGxlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+ID0gY29uc3RPYnNlcnZhYmxlKGxvY2FsaXplKCdhdXRvbWF0aW9uc1RpdGxlJywgXCJBdXRvbWF0aW9uc1wiKSk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKFxuXHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uc0Rlc2NyaXB0aW9uJywgXCJTY2hlZHVsZSBhZ2VudCBzZXNzaW9ucyB0byBydW4gYXV0b21hdGljYWxseSBvbiBhIGNhZGVuY2UgeW91IGNob29zZS5cIikpO1xuXG5cdHByaXZhdGUgX3dpZGdldDogQXV0b21hdGlvbnNDYXJkc1dpZGdldCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbnMtY2FyZHMtY29udGVudCcpO1xuXHRcdHRoaXMuX3dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXV0b21hdGlvbnNDYXJkc1dpZGdldCkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl93aWRnZXQuZWxlbWVudCk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQ/LmxheW91dCh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldD8uZm9jdXMoKTtcblx0fVxufVxuXG4vKipcbiAqIFJlZ2lzdGVycyB0aGUgQXV0b21hdGlvbnMgY3VzdG9tIHZpZXcgd2l0aCB0aGUgY3VzdG9tIHZpZXcgc2VydmljZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25zQ3VzdG9tVmlld0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9ucy5jb250cmliLmF1dG9tYXRpb25zQ3VzdG9tVmlldyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDdXN0b21WaWV3U2VydmljZSBjdXN0b21WaWV3U2VydmljZTogSUN1c3RvbVZpZXdTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElBdXRvbWF0aW9uU2VydmljZSBhdXRvbWF0aW9uU2VydmljZTogSUF1dG9tYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBdXRvbWF0aW9uSGlzdG9yeUl0ZW1BY3Rpb25zKCkpO1xuXG5cdFx0Y29uc3QgaGFzSXRlbXNDb250ZXh0ID0gQXV0b21hdGlvbnNIYXNJdGVtc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRoYXNJdGVtc0NvbnRleHQuc2V0KGF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLnJlYWQocmVhZGVyKS5sZW5ndGggPiAwKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihjdXN0b21WaWV3U2VydmljZS5yZWdpc3RlckN1c3RvbVZpZXcoe1xuXHRcdFx0aWQ6IEFVVE9NQVRJT05TX0NVU1RPTV9WSUVXX0lELFxuXHRcdFx0Y3RvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEF1dG9tYXRpb25zQ3VzdG9tVmlldyksXG5cdFx0XHRhY3Rpb25zOiB7IHN0eWxlOiAnYnV0dG9uQmFyJywgbWVudUlkOiBNZW51cy5DdXN0b21WaWV3QXV0b21hdGlvbnMgfSxcblx0XHR9LCB7XG5cdFx0XHRyZXN0b3JlOiBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQua2V5KSA9PT0gdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uQ29udGV4dEtleXMgPSBuZXcgU2V0KFtDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5rZXldKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNTb21lKGF1dG9tYXRpb25Db250ZXh0S2V5cylcblx0XHRcdFx0JiYgIWNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5rZXkpXG5cdFx0XHRcdCYmIGN1c3RvbVZpZXdTZXJ2aWNlLmFjdGl2ZUN1c3RvbVZpZXcuZ2V0KCk/LmlkID09PSBBVVRPTUFUSU9OU19DVVNUT01fVklFV19JRCkge1xuXHRcdFx0XHRjdXN0b21WaWV3U2VydmljZS5oaWRlQ3VzdG9tVmlldygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlbmRlciB0aGUgXCJOZXcgQXV0b21hdGlvblwiIGJ1dHRvbiBhcyBwcmltYXJ5IGluc3RlYWQgb2Ygc2Vjb25kYXJ5XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLkN1c3RvbVZpZXdBdXRvbWF0aW9ucywgJ3Nlc3Npb25zVmlldy5uZXdBdXRvbWF0aW9uJywgKGFjdGlvbiwgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByaW1hcnlCdXR0b25BY3Rpb25WaWV3SXRlbSwgdW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZWdpc3RlckF1dG9tYXRpb25IaXN0b3J5SXRlbUFjdGlvbnMoKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5BdXRvbWF0aW9uc0hpc3RvcnlJdGVtLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBTVE9QX0FVVE9NQVRJT05fUlVOX1NFU1NJT05fQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzdG9wQXV0b21hdGlvblJ1blNlc3Npb25BY3Rpb24nLCBcIlN0b3BcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uc3RvcENpcmNsZSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0U2Vzc2lvbkl0ZW1TdGF0dXNDb250ZXh0LmlzRXF1YWxUbyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpLFxuXHRcdFx0XHRTZXNzaW9uSXRlbVN0YXR1c0NvbnRleHQuaXNFcXVhbFRvKFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCksXG5cdFx0XHQpLFxuXHRcdH0pLFxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51cy5BdXRvbWF0aW9uc0hpc3RvcnlJdGVtLCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBERUxFVEVfQVVUT01BVElPTl9SVU5fU0VTU0lPTl9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2RlbGV0ZUF1dG9tYXRpb25SdW5TZXNzaW9uQWN0aW9uJywgXCJEZWxldGVcIiksXG5cdFx0XHRcdGljb246IENvZGljb24udHJhc2gsXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRTZXNzaW9uU3VwcG9ydHNEZWxldGVDb250ZXh0LFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRTZXNzaW9uSXRlbVN0YXR1c0NvbnRleHQuaXNFcXVhbFRvKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRcdFx0XHRTZXNzaW9uSXRlbVN0YXR1c0NvbnRleHQuaXNFcXVhbFRvKFNlc3Npb25TdGF0dXMuRXJyb3IpLFxuXHRcdFx0XHQpLFxuXHRcdFx0KSxcblx0XHR9KSxcblx0KTtcbn1cblxuY2xhc3MgUHJpbWFyeUJ1dHRvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIGJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IHVua25vd24sIGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdHN1cGVyKGNvbnRleHQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudCA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1jb21wb3NpdGUtYmFyLW1ldGEtaXRlbScpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuYnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihjb250YWluZXIsIHsgc2Vjb25kYXJ5OiBmYWxzZSwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXRleHQtYnV0dG9uJywgJ2NoYXQtY29tcG9zaXRlLWJhci1tZXRhLWl0ZW0tYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uUnVubmVyLnJ1bih0aGlzLl9hY3Rpb24sIHRoaXMuX2NvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHsgdGhpcy5idXR0b24/LmZvY3VzKCk7IH1cblx0b3ZlcnJpZGUgYmx1cigpOiB2b2lkIHsgaWYgKHRoaXMuYnV0dG9uKSB7IHRoaXMuYnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAtMTsgdGhpcy5idXR0b24uZWxlbWVudC5ibHVyKCk7IH0gfVxuXHRvdmVycmlkZSBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7IGlmICh0aGlzLmJ1dHRvbikgeyB0aGlzLmJ1dHRvbi5lbGVtZW50LnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xOyB9IH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5idXR0b24pIHsgdGhpcy5idXR0b24uZW5hYmxlZCA9IHRoaXMuX2FjdGlvbi5lbmFibGVkOyB9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmJ1dHRvbikgeyByZXR1cm47IH1cblx0XHRET00ucmVzZXQodGhpcy5idXR0b24uZWxlbWVudCwgdGhpcy5fYWN0aW9uLmxhYmVsKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3QXV0b21hdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3Nlc3Npb25zVmlldy5uZXdBdXRvbWF0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25ld0F1dG9tYXRpb24nLCBcIk5ldyBBdXRvbWF0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCxcblx0XHRcdG1lbnU6IFt7IGlkOiBNZW51cy5DdXN0b21WaWV3QXV0b21hdGlvbnMsIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxLCB3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdEF1dG9tYXRpb25zRW5hYmxlZENvbnRleHQsIEF1dG9tYXRpb25zSGFzSXRlbXNDb250ZXh0KSB9XSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRvbWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBpc0VuYWJsZWQgPSAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORykgPT09IHRydWU7XG5cdFx0aWYgKCFpc0VuYWJsZWQoKSkge1xuXHRcdFx0YXdhaXQgc2hvd0F1dG9tYXRpb25zRGlzYWJsZWQoZGlhbG9nU2VydmljZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnNob3dBdXRvbWF0aW9uRGlhbG9nKHt9KTtcblx0XHRpZiAoIXJlc3VsdCB8fCByZXN1bHQua2luZCAhPT0gJ2NyZWF0ZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFpc0VuYWJsZWQoKSkge1xuXHRcdFx0YXdhaXQgc2hvd0F1dG9tYXRpb25zRGlzYWJsZWQoZGlhbG9nU2VydmljZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhdXRvbWF0aW9uU2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHJlc3VsdC52YWx1ZSwgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhdXRvbWF0aW9uc0Rpc2FibGVkQmVmb3JlU2F2ZScsIFwiQXV0b21hdGlvbnMgd2VyZSBkaXNhYmxlZCBiZWZvcmUgdGhlIGNoYW5nZSBjb3VsZCBiZSBzYXZlZC5cIikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tBdXRvbWF0aW9uc10gRmFpbGVkIHRvIGNyZWF0ZSBhdXRvbWF0aW9uJywgZXJyKTtcblx0XHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuZXJyb3IoXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uQ3JlYXRlRmFpbGVkJywgXCJGYWlsZWQgdG8gY3JlYXRlIGF1dG9tYXRpb24uXCIpLFxuXHRcdFx0XHRnZXRFcnJvck1lc3NhZ2UoZXJyKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSxpQkFBMEI7QUFDM0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CLFlBQVksZUFBZSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUM3SCxTQUFTLFNBQVMsaUJBQTRELDJCQUEyQixpQkFBaUIsbUJBQW1CO0FBRzdJLFNB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
