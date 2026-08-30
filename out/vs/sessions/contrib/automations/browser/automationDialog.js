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
import * as DOM from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { WorkspacePicker } from "../../chat/browser/sessionWorkspacePicker.js";
import { BranchPicker } from "../../chat/browser/branchPicker.js";
import { MobileSessionTypePicker } from "../../chat/browser/mobile/mobileSessionTypePicker.js";
import { isMobilePickerSheetTarget } from "../../../browser/parts/mobile/mobilePickerSheet.js";
import { SESSION_WORKSPACE_GROUP_LOCAL } from "../../../services/sessions/common/session.js";
import { IGitService } from "../../../../workbench/contrib/git/common/gitService.js";
import { DAYS_OF_WEEK } from "../../../../workbench/contrib/chat/common/automations/schedule.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatAgentLocation, isChatPermissionLevel } from "../../../../workbench/contrib/chat/common/constants.js";
import { ChatInputPart } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js";
import { isModeConsideredBuiltIn } from "../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js";
import { AutomationIsolationModel, normalizeAutomationBranchNames } from "../common/isolationGroupModel.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { showMobileWorkspacePickerSheet, shouldUseMobileWorkspacePickerSheet } from "../../chat/browser/mobile/mobileWorkspacePickerSheet.js";
const $ = DOM.$;
const INTERVALS = [
  { value: "manual", label: localize("automation.interval.manual", "Manual") },
  { value: "hourly", label: localize("automation.interval.hourly", "Hourly") },
  { value: "daily", label: localize("automation.interval.daily", "Daily") },
  { value: "weekly", label: localize("automation.interval.weekly", "Weekly") }
];
function isAutomationDialogPopupTarget(relatedTarget) {
  return isMobilePickerSheetTarget(relatedTarget) || !!relatedTarget.closest(
    ".context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content"
  );
}
function isAutomationDialogEditCommand(commandId, target) {
  return (commandId === "undo" || commandId === "redo") && DOM.isEditableElement(target);
}
async function canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService) {
  const resolved = sessionsManagementService.resolveWorkspace(folderUri, preferredProviderId);
  if (!resolved) {
    return false;
  }
  if (!resolved.workspace.requiresWorkspaceTrust) {
    return true;
  }
  return !!await workspaceTrustRequestService.requestResourcesTrust({
    uri: folderUri,
    message: localize("automation.form.trustFolderMessage", "An agent session will be able to read files, run commands, and make changes in this folder.")
  });
}
function registerAutomationDialogKeyboardNavigation(targetWindow, getFocusableElements, isPopupTarget) {
  const store = new DisposableStore();
  let suppressPopupEscapeKeyUp = false;
  const visibleFocusableElements = () => getFocusableElements().filter((element) => {
    if (!element.isConnected || element.tabIndex < 0 || element.hasAttribute("disabled")) {
      return false;
    }
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style = targetWindow.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    }
    return true;
  });
  store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (event) => {
    const target = event.target;
    if (target instanceof targetWindow.HTMLElement && isPopupTarget(target)) {
      suppressPopupEscapeKeyUp = event.key === "Escape";
      return;
    }
    suppressPopupEscapeKeyUp = false;
    if (event.key !== "Tab") {
      return;
    }
    const focusableElements = visibleFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }
    const activeElement = targetWindow.document.activeElement;
    let focusedIndex = focusableElements.findIndex((element) => element === activeElement);
    if (focusedIndex < 0) {
      focusedIndex = focusableElements.findIndex((element) => !!activeElement && element.contains(activeElement));
    }
    if (focusedIndex < 0) {
      focusedIndex = event.shiftKey ? 0 : -1;
    }
    const nextIndex = event.shiftKey ? (focusedIndex - 1 + focusableElements.length) % focusableElements.length : (focusedIndex + 1) % focusableElements.length;
    event.preventDefault();
    event.stopImmediatePropagation();
    focusableElements[nextIndex].focus();
  }, true));
  store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, (event) => {
    if (event.key === "Escape" && suppressPopupEscapeKeyUp) {
      suppressPopupEscapeKeyUp = false;
      event.stopImmediatePropagation();
      return;
    }
    suppressPopupEscapeKeyUp = false;
  }, true));
  return {
    focusFirst: () => visibleFocusableElements()[0]?.focus(),
    dispose: () => store.dispose()
  };
}
class AutomationSessionDraftSynchronizer extends Disposable {
  constructor(sessionsManagementService, canSelectWorkspace, onError) {
    super();
    this.sessionsManagementService = sessionsManagementService;
    this.canSelectWorkspace = canSelectWorkspace;
    this.onError = onError;
    this.generation = 0;
    this.syncScheduled = false;
    this.syncPromise = Promise.resolve();
    this.disposed = false;
  }
  update(target) {
    this.requestedTarget = target;
    this.generation++;
    this.scheduleSync();
  }
  async waitForSync() {
    let pendingSync;
    do {
      pendingSync = this.syncPromise;
      await pendingSync;
    } while (pendingSync !== this.syncPromise);
  }
  scheduleSync() {
    if (this.syncScheduled) {
      return;
    }
    this.syncScheduled = true;
    this.syncPromise = Promise.resolve().then(() => {
      this.syncScheduled = false;
      if (!this.disposed) {
        return this.sync(this.generation);
      }
      return void 0;
    });
  }
  async sync(generation) {
    const target = this.requestedTarget;
    if (!target) {
      this.discardSession();
      return;
    }
    if (this.matchesAppliedTarget(target)) {
      return;
    }
    try {
      if (target.kind === "workspace" && !await this.canSelectWorkspace(target.folderUri, target.providerId)) {
        if (generation === this.generation) {
          this.discardSession();
        }
        return;
      }
      if (this.disposed || generation !== this.generation) {
        return;
      }
      this.session = target.kind === "quickChat" ? this.sessionsManagementService.createAutomationQuickChat({
        providerId: target.providerId,
        sessionTypeId: target.sessionTypeId
      }) : this.sessionsManagementService.createAutomationSession(target.folderUri, {
        providerId: target.providerId,
        sessionTypeId: target.sessionTypeId
      });
      this.appliedTarget = target;
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.discardSession();
        this.onError(error);
      }
    }
  }
  matchesAppliedTarget(target) {
    if (!this.session || !this.appliedTarget || this.sessionsManagementService.automationSession.get()?.sessionId !== this.session.sessionId || this.appliedTarget.kind !== target.kind || this.appliedTarget.providerId !== target.providerId || this.appliedTarget.sessionTypeId !== target.sessionTypeId) {
      return false;
    }
    return target.kind === "quickChat" || this.appliedTarget.kind === "workspace" && isEqual(this.appliedTarget.folderUri, target.folderUri);
  }
  discardSession() {
    if (this.session) {
      this.sessionsManagementService.discardAutomationSession(this.session);
    }
    this.session = void 0;
    this.appliedTarget = void 0;
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.discardSession();
    super.dispose();
  }
}
function resolveAutomationModelIdentifier(languageModelsService, identifier, logicalSessionType, modelTarget) {
  if (!logicalSessionType || !modelTarget) {
    return identifier;
  }
  const sourceModel = languageModelsService.lookupLanguageModel(identifier);
  if (sourceModel?.targetChatSessionType !== logicalSessionType) {
    return identifier;
  }
  return languageModelsService.getLanguageModelIds().find((candidateIdentifier) => {
    const candidate = languageModelsService.lookupLanguageModel(candidateIdentifier);
    return candidate?.targetChatSessionType === modelTarget && candidate.id === sourceModel.id;
  }) ?? identifier;
}
const AUTOMATIONS_HARNESS_CHIP_ACTION_ID = "workbench.action.chat.renderAutomationsHarnessChip";
const AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID = "workbench.action.chat.renderAutomationsWorkspacePicker";
const AUTOMATIONS_ISOLATION_GROUP_ACTION_ID = "workbench.action.chat.renderAutomationsIsolationGroup";
function setAutomationControlVisible(container, visible) {
  container.style.display = visible ? "" : "none";
  if (visible) {
    container.removeAttribute("aria-hidden");
  } else {
    container.setAttribute("aria-hidden", "true");
  }
}
let AutomationIsolationGroupActionViewItem = class extends BaseActionViewItem {
  constructor(action, state, isolationModel, workspaceFolder, onDidChangeTarget, revalidate, options, visible, gitService, sessionsManagementService, pickerLogService, instantiationService) {
    super(void 0, action, options);
    this.state = state;
    this.isolationModel = isolationModel;
    this.workspaceFolder = workspaceFolder;
    this.onDidChangeTarget = onDidChangeTarget;
    this.revalidate = revalidate;
    this.visible = visible;
    this.gitService = gitService;
    this.sessionsManagementService = sessionsManagementService;
    this.pickerLogService = pickerLogService;
    this.renderDisposables = this._register(new DisposableStore());
    this.branchRepoDisposable = this._register(new MutableDisposable());
    this.branchRequest = this._register(new MutableDisposable());
    this.branchRequestId = 0;
    this.branchLoadState = "noFolder";
    this.branches = [];
    this.worktreeCapabilityResolved = false;
    this.branchPicker = this._register(instantiationService.createInstance(BranchPicker, {
      user: "automationBranchPicker",
      slotClassName: "automation-form-branch-picker-slot",
      triggerClassName: "automation-form-branch-slot",
      labelClassName: "automation-form-branch-name",
      descriptionClassName: "automation-form-branch-description",
      keepDisabledFocusable: true,
      renderDisabledAsStatic: true,
      ariaLive: "polite",
      onSelectBranch: (branch) => {
        this.isolationModel.selectBranch(branch);
        this.renderBranchControl();
      },
      onRetry: () => {
        void this.reloadRepository(this.isolationModel.folderUri);
      },
      isolation: {
        label: localize("automation.form.isolation.worktree", "New Worktree"),
        ariaLabel: localize("automation.form.isolation.checkboxAriaLabel", "Worktree isolation"),
        onToggle: (checked) => {
          this.isolationModel.selectIsolationMode(checked ? "worktree" : "workspace");
          this.renderBranchControl();
        }
      }
    }));
  }
  render(container) {
    this.renderDisposables.clear();
    this.branchRepoDisposable.clear();
    this.cancelBranchRequest();
    DOM.clearNode(container);
    container.style.marginLeft = "auto";
    const visible = this.visible;
    if (visible) {
      this.renderDisposables.add(autorun((reader) => {
        setAutomationControlVisible(container, visible.read(reader));
      }));
    }
    const isolationGroup = DOM.append(container, $("span.automation-form-isolation-group"));
    this.branchPicker.render(isolationGroup);
    this.refreshTargetCapability();
    this.renderBranchControl();
    this.renderDisposables.add(autorun((reader) => {
      const folderUri = this.workspaceFolder.read(reader);
      this.refreshTargetAndRender();
      void this.reloadRepository(folderUri);
    }));
    this.renderDisposables.add(this.onDidChangeTarget(() => {
      this.refreshTargetAndRender();
    }));
    this.renderDisposables.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this.refreshTargetAndRender()));
    this.renderDisposables.add({
      dispose: () => {
        this.cancelBranchRequest();
      }
    });
  }
  refreshTargetCapability() {
    const folderUri = this.isolationModel.folderUri;
    const sessionTypeId = this.state.sessionTypeId;
    if (!folderUri || !sessionTypeId) {
      this.worktreeCapabilityResolved = false;
      this.isolationModel.setSupportsWorktreeConfiguration(false);
      return;
    }
    const sessionType = this.sessionsManagementService.getSessionTypesForFolder(folderUri).find(
      (candidate) => candidate.sessionType.id === sessionTypeId && (this.state.providerId === void 0 || candidate.providerId === this.state.providerId)
    )?.sessionType;
    if (!sessionType) {
      this.worktreeCapabilityResolved = false;
      this.isolationModel.setSupportsWorktreeConfiguration(false);
      return;
    }
    this.worktreeCapabilityResolved = true;
    const supportsWorktreeConfiguration = sessionType.supportsWorktreeConfiguration === true;
    this.isolationModel.setSupportsWorktreeConfiguration(supportsWorktreeConfiguration);
    if (!supportsWorktreeConfiguration && this.isolationModel.isolationMode === "worktree") {
      this.isolationModel.selectIsolationMode("workspace");
    }
  }
  refreshTargetAndRender() {
    this.refreshTargetCapability();
    this.renderBranchControl();
  }
  renderBranchControl() {
    const presentation = this.getBranchPresentation();
    const canOpen = this.canOpenBranchPicker();
    const selectedBranch = this.isolationModel.selectedBranch ?? this.isolationModel.headBranch;
    const branches = this.branches.map((branch) => ({
      name: branch,
      selected: branch === selectedBranch
    }));
    if (selectedBranch && !this.branches.includes(selectedBranch)) {
      branches.unshift({
        name: selectedBranch,
        selected: true,
        unavailable: true
      });
    }
    const worktreeUnavailableReason = this.getWorktreeUnavailableReason();
    const isolationState = worktreeUnavailableReason === void 0 ? "enabled" : "disabled";
    this.branchPicker.update({
      label: presentation.label,
      branches,
      status: this.branchLoadState === "loadingRepository" || this.branchLoadState === "loadingBranches" ? "loading" : this.branchLoadState === "error" ? "error" : this.branchLoadState === "ready" ? "ready" : "empty",
      canOpen,
      disabledReason: presentation.reason,
      missing: presentation.missing,
      showChevron: this.isolationModel.branchPickerAvailable || this.branchLoadState === "error",
      isolation: {
        checked: this.isolationModel.isolationMode === "worktree",
        state: isolationState,
        disabledReason: worktreeUnavailableReason
      }
    });
    this.revalidate();
  }
  getBranchPresentation() {
    const displayBranch = this.isolationModel.displayBranch;
    if (!this.isolationModel.folderUri) {
      return {
        label: localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.noFolderReason", "Select a folder to determine its Git branch."),
        missing: true
      };
    }
    if (!this.worktreeCapabilityResolved) {
      return {
        label: displayBranch ?? localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.capabilityLoadingReason", "Session capabilities are loading."),
        missing: !displayBranch
      };
    }
    if (!this.isolationModel.supportsWorktreeConfiguration) {
      return {
        label: displayBranch ?? localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.unsupportedReason", "The selected session type does not support Worktree branch configuration."),
        missing: !displayBranch
      };
    }
    if (this.branchLoadState === "error") {
      return {
        label: displayBranch ?? localize("automation.form.branch.loadError", "Unable to load branches"),
        reason: localize("automation.form.branch.loadErrorReason", "Open the branch picker to retry loading local branches."),
        missing: !displayBranch
      };
    }
    if (this.isolationModel.isolationMode !== "worktree") {
      return {
        label: displayBranch ?? this.detachedCommit ?? localize("automation.form.branch.unknown", "\u2014"),
        reason: localize("automation.form.branch.folderModeReason", "Select Worktree to choose a branch."),
        missing: !displayBranch && !this.detachedCommit
      };
    }
    switch (this.branchLoadState) {
      case "loadingRepository":
      case "loadingBranches":
        return {
          label: displayBranch ?? localize("automation.form.branch.loading", "Loading branches\u2026"),
          reason: localize("automation.form.branch.loadingReason", "Local branches are loading."),
          missing: !displayBranch
        };
      case "noRepository":
        return {
          label: displayBranch ?? localize("automation.form.branch.noRepo", "no git repo"),
          reason: localize("automation.form.branch.noRepoReason", "No Git repository was found for the selected folder."),
          missing: !displayBranch
        };
      case "empty":
        return {
          label: displayBranch ?? localize("automation.form.branch.noBranches", "No local branches"),
          reason: localize("automation.form.branch.noBranchesReason", "No local branches were found in this repository."),
          missing: !displayBranch
        };
      case "ready":
        return {
          label: displayBranch ?? localize("automation.form.branch.select", "Select branch"),
          reason: localize("automation.form.branch.chooseReason", "Choose the local branch to use as the Worktree base."),
          missing: !displayBranch
        };
      case "noFolder":
        return {
          label: localize("automation.form.branch.unknown", "\u2014"),
          reason: localize("automation.form.branch.noFolderReason", "Select a folder to determine its Git branch."),
          missing: true
        };
    }
  }
  canOpenBranchPicker() {
    if (this.branchLoadState === "error") {
      return !!this.isolationModel.folderUri && this.worktreeCapabilityResolved && this.isolationModel.supportsWorktreeConfiguration;
    }
    return this.isolationModel.branchPickerAvailable && this.branchLoadState !== "noFolder" && this.branchLoadState !== "noRepository" && this.branchLoadState !== "loadingRepository" && this.branchLoadState !== "loadingBranches";
  }
  getWorktreeUnavailableReason() {
    if (!this.isolationModel.folderUri) {
      return localize("automation.form.isolation.worktreeNoFolder", "Select a folder to use Worktree isolation.");
    }
    if (!this.worktreeCapabilityResolved) {
      return localize("automation.form.branch.capabilityLoadingReason", "Session capabilities are loading.");
    }
    if (!this.isolationModel.supportsWorktreeConfiguration) {
      return localize("automation.form.isolation.worktreeUnavailable", "Not supported by the selected session type");
    }
    if (this.isolationModel.selectedBranch) {
      return void 0;
    }
    switch (this.branchLoadState) {
      case "loadingRepository":
      case "loadingBranches":
        return localize("automation.form.branch.loadingReason", "Local branches are loading.");
      case "noRepository":
        return localize("automation.form.branch.noRepoReason", "No Git repository was found for the selected folder.");
      case "error":
        return localize("automation.form.branch.loadErrorReason", "Open the branch picker to retry loading local branches.");
      case "empty":
        return localize("automation.form.branch.noBranchesReason", "No local branches were found in this repository.");
      case "ready":
        return this.branches.length > 0 ? void 0 : localize("automation.form.branch.noBranchesReason", "No local branches were found in this repository.");
      case "noFolder":
        return localize("automation.form.isolation.worktreeNoFolder", "Select a folder to use Worktree isolation.");
    }
  }
  cancelBranchRequest() {
    this.branchRequest.value?.cancel();
    this.branchRequest.clear();
  }
  async reloadRepository(folder) {
    const requestId = ++this.branchRequestId;
    this.cancelBranchRequest();
    this.branchRepoDisposable.clear();
    this.repository = void 0;
    this.branches = [];
    this.detachedCommit = void 0;
    if (!folder) {
      this.branchLoadState = "noFolder";
      this.isolationModel.setHeadBranch(void 0);
      this.renderBranchControl();
      return;
    }
    this.branchLoadState = "loadingRepository";
    this.renderBranchControl();
    const cts = new CancellationTokenSource();
    this.branchRequest.value = cts;
    let repo;
    try {
      repo = await this.gitService.openRepository(folder);
    } catch (error) {
      if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
        return;
      }
      this.pickerLogService.error("[AutomationDialog] Failed to open Git repository for branch selection.", error);
      this.branchLoadState = "error";
      this.renderBranchControl();
      return;
    }
    if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
      return;
    }
    if (!repo) {
      this.branchLoadState = "noRepository";
      this.renderBranchControl();
      return;
    }
    this.repository = repo;
    const watcher = new DisposableStore();
    watcher.add(autorun((reader) => {
      const head = repo.state.read(reader).HEAD;
      if (head?.commit && head.name) {
        this.detachedCommit = void 0;
        this.isolationModel.setHeadBranch(head.name);
      } else if (head?.commit) {
        this.detachedCommit = localize("automation.form.branch.detached", "({0})", head.commit.slice(0, 7));
        this.isolationModel.setHeadBranch(void 0);
      } else {
        this.detachedCommit = void 0;
        this.isolationModel.setHeadBranch(void 0);
      }
      this.renderBranchControl();
    }));
    this.branchRepoDisposable.value = watcher;
    this.branchLoadState = "loadingBranches";
    this.renderBranchControl();
    try {
      const refs = await repo.getRefs({ pattern: "refs/heads" }, cts.token);
      if (requestId !== this.branchRequestId || cts.token.isCancellationRequested || this.repository !== repo) {
        return;
      }
      this.branches = normalizeAutomationBranchNames(refs.map((ref) => ref.name));
      this.branchLoadState = this.branches.length > 0 ? "ready" : "empty";
    } catch (error) {
      if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
        return;
      }
      this.pickerLogService.error("[AutomationDialog] Failed to load local branches.", error);
      this.branchLoadState = "error";
    }
    this.renderBranchControl();
  }
};
AutomationIsolationGroupActionViewItem = __decorateClass([
  __decorateParam(8, IGitService),
  __decorateParam(9, ISessionsManagementService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IInstantiationService)
], AutomationIsolationGroupActionViewItem);
class AutomationPickerActionViewItem extends BaseActionViewItem {
  constructor(action, renderPicker, visible, options) {
    super(void 0, action, options);
    this.renderPicker = renderPicker;
    this.visible = visible;
    this.visibilityWatch = this._register(new MutableDisposable());
  }
  render(container) {
    super.render(container);
    DOM.clearNode(container);
    this.renderPicker(container);
    const visible = this.visible;
    this.visibilityWatch.value = visible ? autorun((reader) => {
      setAutomationControlVisible(container, visible.read(reader));
    }) : void 0;
  }
}
registerAction2(class OpenAutomationsHarnessChipAction extends Action2 {
  constructor() {
    super({
      id: AUTOMATIONS_HARNESS_CHIP_ACTION_ID,
      title: localize2("automation.form.harnessChip.action", "Automations Harness Chip"),
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: -1,
        when: ChatContextKeys.inAutomationsDialog
      }]
    });
  }
  async run() {
  }
});
registerAction2(class OpenAutomationsWorkspacePickerAction extends Action2 {
  constructor() {
    super({
      id: AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID,
      title: localize2("automation.form.workspacePicker.action", "Automations Workspace Picker"),
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 0,
        when: ChatContextKeys.inAutomationsDialog
      }]
    });
  }
  async run() {
  }
});
registerAction2(class OpenAutomationsIsolationGroupAction extends Action2 {
  constructor() {
    super({
      id: AUTOMATIONS_ISOLATION_GROUP_ACTION_ID,
      title: localize2("automation.form.isolationGroup.action", "Automations Isolation Group"),
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 2,
        when: ChatContextKeys.inAutomationsDialog
      }]
    });
  }
  async run() {
  }
});
function renderForm(form, state, disposables, validation, revalidate, instantiationService, contextKeyService, contextViewService, configurationService, languageModelsService, layoutService, logService, productService, sessionsManagementService, workspaceTrustRequestService, initialPrompt, initialMode, initialPermissionLevel, initialModelId) {
  const nameRow = DOM.append(form, $(".automation-form-row"));
  DOM.append(nameRow, $("span.automation-form-label", void 0, localize("automation.form.name", "Name")));
  const nameInputContainer = DOM.append(nameRow, $(".automation-form-input-host"));
  const nameInput = disposables.add(new InputBox(nameInputContainer, contextViewService, {
    inputBoxStyles: defaultInputBoxStyles,
    placeholder: localize("automation.form.namePlaceholder", "e.g. Morning standup notes"),
    ariaLabel: localize("automation.form.name", "Name")
  }));
  nameInput.value = state.name;
  disposables.add(nameInput.onDidChange((value) => {
    state.name = value;
    revalidate();
  }));
  const scheduleRow = DOM.append(form, $(".automation-form-row.automation-form-schedule-row"));
  const useCustomDrawn = !hasNativeContextMenu(configurationService);
  const intervalGroup = DOM.append(scheduleRow, $(".automation-form-schedule-group"));
  DOM.append(intervalGroup, $("span.automation-form-label", void 0, localize("automation.form.interval", "Schedule")));
  const intervalOptions = INTERVALS.map((item) => ({ text: item.label }));
  const intervalIndex = Math.max(0, INTERVALS.findIndex((item) => item.value === state.interval));
  const intervalSelect = disposables.add(new SelectBox(
    intervalOptions,
    intervalIndex,
    contextViewService,
    defaultSelectBoxStyles,
    { ariaLabel: localize("automation.form.interval", "Schedule"), useCustomDrawn }
  ));
  const intervalSelectContainer = DOM.append(intervalGroup, $(".automation-form-schedule-select-container"));
  intervalSelect.render(intervalSelectContainer);
  const timeGroup = DOM.append(scheduleRow, $(".automation-form-schedule-group.automation-form-time-group"));
  DOM.append(timeGroup, $("span.automation-form-label", void 0, localize("automation.form.time", "Time")));
  const timeOptions = buildTimeOptions();
  const initialTimeIndex = nearestTimeOptionIndex(state.hour, state.minute);
  state.hour = timeOptions[initialTimeIndex].hour;
  state.minute = timeOptions[initialTimeIndex].minute;
  const timeSelect = disposables.add(new SelectBox(
    timeOptions.map((opt) => ({ text: opt.label })),
    initialTimeIndex,
    contextViewService,
    defaultSelectBoxStyles,
    { ariaLabel: localize("automation.form.time", "Time"), useCustomDrawn }
  ));
  const timeSelectContainer = DOM.append(timeGroup, $(".automation-form-schedule-select-container.automation-form-time-select-container"));
  timeSelect.render(timeSelectContainer);
  disposables.add(timeSelect.onDidSelect((e) => {
    const opt = timeOptions[e.index];
    state.hour = opt.hour;
    state.minute = opt.minute;
  }));
  const dayGroup = DOM.append(scheduleRow, $(".automation-form-schedule-group.automation-form-day-group"));
  DOM.append(dayGroup, $("span.automation-form-label", void 0, localize("automation.form.day", "Day of week")));
  const dayOptions = DAYS_OF_WEEK.map((d) => ({ text: d }));
  const daySelect = disposables.add(new SelectBox(
    dayOptions,
    Math.min(Math.max(state.day, 0), DAYS_OF_WEEK.length - 1),
    contextViewService,
    defaultSelectBoxStyles,
    { ariaLabel: localize("automation.form.day", "Day of week"), useCustomDrawn }
  ));
  const daySelectContainer = DOM.append(dayGroup, $(".automation-form-schedule-select-container"));
  daySelect.render(daySelectContainer);
  disposables.add(daySelect.onDidSelect((e) => {
    state.day = e.index;
  }));
  const applyIntervalVisibility = () => {
    const showTime = state.interval === "daily" || state.interval === "weekly";
    const showDay = state.interval === "weekly";
    timeGroup.style.display = showTime ? "" : "none";
    dayGroup.style.display = showDay ? "" : "none";
  };
  applyIntervalVisibility();
  disposables.add(intervalSelect.onDidSelect((e) => {
    state.interval = INTERVALS[e.index].value;
    applyIntervalVisibility();
  }));
  const isolationModel = new AutomationIsolationModel(state);
  const workspaceControlsVisible = derived((reader) => !isolationModel.isQuickChatObs.read(reader));
  const sessionTypePicker = disposables.add(instantiationService.createInstance(MobileSessionTypePicker, constObservable(void 0), { persistSelection: false, telemetrySource: "AutomationSessionTypePicker", showChevron: false }));
  sessionTypePicker.setQuickChatSource(isolationModel.isQuickChatObs);
  sessionTypePicker.setFolderSource(isolationModel.folderUriObs, {
    initialPick: state.sessionTypeId ? { providerId: state.providerId, sessionTypeId: state.sessionTypeId } : void 0,
    preserveUnavailableInitialPick: true
  });
  const onDidChangeSessionType = disposables.add(new Emitter());
  const onDidChangeSessionTarget = disposables.add(new Emitter());
  const sessionTypeDelegate = {
    getActiveSessionProvider: () => sessionTypePicker.modelTargetChatSessionType.get(),
    onDidChangeActiveSessionProvider: onDidChangeSessionType.event
  };
  const syncStateFromPicker = () => {
    const pick = sessionTypePicker.selectedPick;
    state.providerId = pick?.providerId;
    state.sessionTypeId = pick?.sessionTypeId;
    onDidChangeSessionTarget.fire();
  };
  disposables.add(autorun((reader) => {
    const modelTarget = sessionTypePicker.modelTargetChatSessionType.read(reader);
    if (modelTarget) {
      onDidChangeSessionType.fire(modelTarget);
    }
  }));
  syncStateFromPicker();
  const workspacePicker = disposables.add(instantiationService.createInstance(MobileAutomationsWorkspacePicker, {
    restoreFromSessions: false,
    canSelectWorkspace: (folderUri, preferredProviderId) => canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService)
  }));
  workspacePicker.setTargetModel(isolationModel);
  workspacePicker.setLayoutService(layoutService);
  const automationSessionDraftSynchronizer = disposables.add(new AutomationSessionDraftSynchronizer(
    sessionsManagementService,
    (folderUri, preferredProviderId) => canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService),
    (error) => logService.error("[AutomationDialog] Failed to synchronize the automation session draft.", error)
  ));
  const updateAutomationSessionTarget = () => {
    const folderUri = isolationModel.folderUriObs.get();
    const pick = sessionTypePicker.selectedPick;
    const isQuickChat = isolationModel.isQuickChatObs.get();
    if (!pick || isQuickChat && !pick.providerId || !isQuickChat && !folderUri) {
      automationSessionDraftSynchronizer.update(void 0);
      return;
    }
    if (isQuickChat) {
      const providerId = pick.providerId;
      if (providerId) {
        automationSessionDraftSynchronizer.update({ kind: "quickChat", providerId, sessionTypeId: pick.sessionTypeId });
      }
    } else if (folderUri) {
      automationSessionDraftSynchronizer.update({ kind: "workspace", folderUri, providerId: pick.providerId, sessionTypeId: pick.sessionTypeId });
    }
  };
  disposables.add(sessionTypePicker.onDidChangeSelectedPick(() => {
    syncStateFromPicker();
    updateAutomationSessionTarget();
    revalidate();
  }));
  disposables.add(sessionsManagementService.onDidChangeSessionTypes(() => updateAutomationSessionTarget()));
  if (state.folderUri) {
    workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false, persist: false });
  }
  disposables.add(workspacePicker.onDidSelectWorkspace((uri) => {
    if (isolationModel.setWorkspace(uri)) {
      updateAutomationSessionTarget();
      revalidate();
    }
  }));
  if (!state.isQuickChat && !state.folderUri && workspacePicker.selectedFolderUri) {
    isolationModel.setWorkspace(workspacePicker.selectedFolderUri);
  }
  disposables.add(autorun((reader) => {
    isolationModel.isQuickChatObs.read(reader);
    updateAutomationSessionTarget();
    revalidate();
  }));
  const promptRow = DOM.append(form, $(".automation-form-row"));
  DOM.append(promptRow, $("span.automation-form-label", void 0, localize("automation.form.prompt", "Prompt")));
  const promptHost = DOM.append(promptRow, $(".automation-form-prompt-host.interactive-session"));
  const chatInputStyles = {
    overlayBackground: "var(--vscode-input-background)",
    listForeground: "var(--vscode-foreground)",
    listBackground: "var(--vscode-input-background)"
  };
  const chatInputOptions = {
    renderFollowups: false,
    renderInputToolbarBelowInput: false,
    renderWorkingSet: false,
    enableImplicitContext: false,
    supportsChangingModes: true,
    hideCustomChatModes: true,
    suppressModePreferredModel: true,
    suppressModelPersistence: true,
    menus: {
      executeToolbar: MenuId.AutomationsDialogInput,
      telemetrySource: "automations.dialog"
    },
    widgetViewKindTag: "automations-dialog",
    inputEditorMinLines: 3,
    // The dialog renders the composer flush with its form column (the
    // `.interactive-input-part` margin is zeroed in CSS), so there is no
    // outer horizontal gutter. Without this, ChatInputPart would still
    // reserve the default 24px margin and lay the editor out too narrow,
    // leaving its scrollbar floating ~24px in from the right wall.
    inputPartHorizontalPadding: 0,
    sessionTypePickerDelegate: sessionTypeDelegate,
    secondaryToolbarActionViewItemProvider: (action, itemOptions) => {
      if (action.id === AUTOMATIONS_HARNESS_CHIP_ACTION_ID) {
        return new AutomationPickerActionViewItem(action, (container) => sessionTypePicker.render(container), void 0, itemOptions);
      }
      if (action.id === AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID) {
        return new AutomationPickerActionViewItem(action, (container) => {
          container.classList.add("chat-input-picker-item");
          workspacePicker.render(container);
        }, void 0, itemOptions);
      }
      if (action.id === AUTOMATIONS_ISOLATION_GROUP_ACTION_ID) {
        const item = instantiationService.createInstance(
          AutomationIsolationGroupActionViewItem,
          action,
          state,
          isolationModel,
          isolationModel.folderUriObs,
          onDidChangeSessionTarget.event,
          revalidate,
          itemOptions,
          workspaceControlsVisible
        );
        return item;
      }
      return void 0;
    }
  };
  const stubWidget = {
    onDidChangeViewModel: Event.None,
    viewModel: void 0,
    contribs: [],
    location: ChatAgentLocation.Chat,
    viewContext: {},
    lockToCodingAgent: () => {
    },
    unlockFromCodingAgent: () => {
    }
  };
  const scopedContextKeyService = disposables.add(contextKeyService.createScoped(promptHost));
  ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
  ChatContextKeys.inChatSession.bindTo(scopedContextKeyService).set(true);
  ChatContextKeys.inAutomationsDialog.bindTo(scopedContextKeyService).set(true);
  const scopedInstantiationService = disposables.add(
    instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
  );
  const chatInput = disposables.add(
    scopedInstantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, chatInputOptions, chatInputStyles, false)
  );
  chatInput.render(promptHost, initialPrompt, stubWidget);
  chatInput.inputEditor.updateOptions({ placeholder: localize("automation.form.prompt.placeholder", "Describe what you want to automate") });
  if (initialMode) {
    const getUnfilteredInitialMode = () => {
      const modes = chatInput.currentChatModesObs.get();
      return modes.findModeById(initialMode) ?? modes.findModeByName(initialMode);
    };
    const isHiddenCustomInitialMode = () => {
      const mode = getUnfilteredInitialMode();
      return !!mode && chatInputOptions.hideCustomChatModes && !isModeConsideredBuiltIn(mode, productService);
    };
    if (isHiddenCustomInitialMode()) {
      logService.trace(`[AutomationDialog] Skipping hidden custom initial mode "${initialMode}". Falling back to the default mode.`);
    } else {
      chatInput.setChatMode(
        initialMode,
        /* storeSelection */
        false
      );
    }
    if (chatInput.currentModeObs.get().id !== initialMode && !isHiddenCustomInitialMode()) {
      const baseline = chatInput.currentModeObs.get().id;
      const retry = disposables.add(new MutableDisposable());
      const tryApply = () => {
        if (chatInput.currentModeObs.get().id !== baseline) {
          retry.clear();
          return;
        }
        if (isHiddenCustomInitialMode()) {
          logService.trace(`[AutomationDialog] Skipping hidden custom initial mode "${initialMode}" after modes updated. Falling back to the default mode.`);
          retry.clear();
          return;
        }
        const modes = chatInput.currentChatModesObs.get();
        if (modes.findModeById(initialMode) || modes.findModeByName(initialMode)) {
          chatInput.setChatMode(
            initialMode,
            /* storeSelection */
            false
          );
          if (chatInput.currentModeObs.get().id === initialMode) {
            retry.clear();
          }
        }
      };
      retry.value = autorun((reader) => {
        const modes = chatInput.currentChatModesObs.read(reader);
        reader.store.add(modes.onDidChange(tryApply));
        tryApply();
      });
    }
  }
  if (initialPermissionLevel && isChatPermissionLevel(initialPermissionLevel)) {
    chatInput.setPermissionLevel(initialPermissionLevel);
  }
  chatInput.resetLanguageModelToDefault();
  const resolveInitialModelId = () => initialModelId ? resolveAutomationModelIdentifier(
    languageModelsService,
    initialModelId,
    state.sessionTypeId,
    sessionTypePicker.modelTargetChatSessionType.get()
  ) : void 0;
  const resolvedInitialModelId = resolveInitialModelId();
  if (resolvedInitialModelId && !chatInput.switchModelByIdentifier(
    resolvedInitialModelId,
    /* storeSelection */
    false
  )) {
    const baseline = chatInput.selectedLanguageModel.get()?.identifier;
    const retry = disposables.add(new MutableDisposable());
    retry.value = Event.any(
      languageModelsService.onDidChangeLanguageModels,
      Event.fromObservableLight(sessionTypePicker.modelTargetChatSessionType)
    )(() => {
      if (chatInput.selectedLanguageModel.get()?.identifier !== baseline) {
        retry.clear();
        return;
      }
      const modelIdentifier = resolveInitialModelId();
      if (modelIdentifier && chatInput.switchModelByIdentifier(
        modelIdentifier,
        /* storeSelection */
        false
      )) {
        retry.clear();
      }
    });
  }
  disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
    revalidate();
  }));
  chatInput.layout(580);
  queueMicrotask(() => {
    if (!disposables.isDisposed) {
      chatInput.layout(580);
    }
  });
  const resizeObserver = disposables.add(new DOM.DisposableResizeObserver("automationDialog.promptHost", (entries) => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      if (width > 0) {
        chatInput.layout(width);
      }
    }
  }, DOM.getWindow(promptHost)));
  disposables.add(resizeObserver.observe(promptHost));
  const enabledRow = DOM.append(form, $(".automation-form-row.automation-form-checkbox-row"));
  const enabledLabelText = localize("automation.form.enabled", "Enabled (the scheduler runs this automation when due)");
  const enabledCheckbox = disposables.add(new Checkbox(enabledLabelText, state.enabled, defaultCheckboxStyles));
  DOM.append(enabledRow, enabledCheckbox.domNode);
  const enabledLabel = DOM.append(enabledRow, $("span.automation-form-checkbox-label", void 0, enabledLabelText));
  const setEnabled = (value) => {
    if (enabledCheckbox.checked !== value) {
      enabledCheckbox.checked = value;
    }
    state.enabled = value;
  };
  disposables.add(enabledCheckbox.onChange(() => {
    state.enabled = enabledCheckbox.checked;
  }));
  disposables.add(DOM.addStandardDisposableListener(enabledLabel, "click", () => {
    setEnabled(!enabledCheckbox.checked);
  }));
  return {
    getPrompt: () => chatInput.inputEditor.getValue(),
    getMode: () => chatInput.currentModeObs.get().id,
    getPermissionLevel: () => chatInput.currentPermissionLevelObs.get(),
    getModelId: () => chatInput.selectedLanguageModel.get()?.identifier,
    getBranch: () => isolationModel.persistedBranch,
    waitForAutomationSessionSync: () => {
      updateAutomationSessionTarget();
      return automationSessionDraftSynchronizer.waitForSync();
    },
    getFocusableElements: () => {
      return Array.from(form.querySelectorAll("input, select, textarea, button, a[href], [tabindex]"));
    }
  };
}
function buildTimeOptions() {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const period = hour < 12 ? "AM" : "PM";
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const minuteText = minute.toString().padStart(2, "0");
      options.push({
        hour,
        minute,
        label: `${hour12}:${minuteText} ${period}`
      });
    }
  }
  return options;
}
function nearestTimeOptionIndex(hour, minute) {
  const safeHour = Math.max(0, Math.min(23, hour | 0));
  const safeMinute = Math.max(0, Math.min(59, minute | 0));
  const slot = Math.round(safeMinute / 15) % 4;
  const carriedHour = safeMinute >= 53 && slot === 0 ? (safeHour + 1) % 24 : safeHour;
  return carriedHour * 4 + slot;
}
function updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch) {
  validation.nameError = state.name.trim() === "" ? localize("automation.form.nameRequired", "Name is required.") : void 0;
  validation.promptError = getPrompt().trim() === "" ? localize("automation.form.promptRequired", "Prompt is required.") : void 0;
  validation.folderError = !state.folderUri && !state.isQuickChat ? localize("automation.form.folderRequired", "Workspace folder is required.") : void 0;
  validation.sessionTypeError = !state.sessionTypeId || state.isQuickChat && !state.providerId ? localize("automation.form.sessionTypeRequired", "Session type is required.") : void 0;
  validation.branchError = !state.isQuickChat && state.isolationMode === "worktree" && !getBranch() ? localize("automation.form.branchRequired", "A branch is required for Worktree isolation.") : void 0;
  const valid = !validation.nameError && !validation.promptError && !validation.folderError && !validation.sessionTypeError && !validation.branchError;
  if (saveButton) {
    saveButton.enabled = valid;
  }
  form.classList.toggle("automation-form-invalid", !valid);
}
class AutomationsWorkspacePicker extends WorkspacePicker {
  constructor() {
    super(...arguments);
    this.targetModelWatch = this._register(new MutableDisposable());
  }
  setTargetModel(model) {
    this.targetModel = model;
    this.targetModelWatch.value = autorun((reader) => {
      model.isQuickChatObs.read(reader);
      this._updateTriggerLabel();
    });
  }
  _showTabs() {
    return false;
  }
  _shouldPersistSelection() {
    return false;
  }
  _buildItems() {
    const items = super._buildItems();
    const noWorkspace = {
      kind: ActionListItemKind.Action,
      label: localize("automation.form.noWorkspace", "No workspace"),
      description: localize("automation.form.noWorkspace.description", "Run without a backing workspace"),
      group: { title: "", icon: Codicon.commentDiscussion },
      item: {
        checked: this.targetModel?.isQuickChat || void 0,
        run: () => this.targetModel?.setQuickChat(true)
      }
    };
    return items.length > 0 ? [noWorkspace, { kind: ActionListItemKind.Separator, label: "" }, ...items] : [noWorkspace];
  }
  async _dispatchPickerItem(item) {
    const applied = await super._dispatchPickerItem(item);
    const selectedFolder = this.selectedFolderUri;
    if (applied && selectedFolder && (item.folderUri || item.browseActionIndex !== void 0)) {
      this.targetModel?.setQuickChat(false, selectedFolder);
    }
    return applied;
  }
  _isSelectedFolder(folderUri) {
    return !this.targetModel?.isQuickChat && super._isSelectedFolder(folderUri);
  }
  _renderTriggerLabel(trigger) {
    DOM.clearNode(trigger);
    const workspace = this.selectedResolved?.workspace;
    const noWorkspace = this.targetModel?.isQuickChat === true;
    const label = noWorkspace ? localize("automation.form.noWorkspace", "No workspace") : workspace?.label ?? localize("pickWorkspace", "workspace");
    const icon = noWorkspace ? Codicon.commentDiscussion : workspace?.icon ?? Codicon.project;
    trigger.setAttribute("aria-label", workspace || noWorkspace ? localize("automation.form.workspacePicker.selectedAriaLabel", "Automation target, {0}", label) : localize("automation.form.workspacePicker.pickAriaLabel", "Pick a workspace for this automation"));
    const renderedIcon = DOM.append(trigger, renderIcon(icon));
    renderedIcon.setAttribute("aria-hidden", "true");
    DOM.append(trigger, $("span.sessions-chat-dropdown-label", void 0, label));
    const chevron = DOM.append(trigger, renderIcon(Codicon.chevronDownCompact));
    chevron.classList.add("sessions-chat-dropdown-chevron");
    chevron.setAttribute("aria-hidden", "true");
  }
  _getAllBrowseActions() {
    return super._getAllBrowseActions().filter((a) => a.group === SESSION_WORKSPACE_GROUP_LOCAL);
  }
}
class MobileAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
  setLayoutService(layoutService) {
    this.layoutService = layoutService;
  }
  showPicker(force = false, anchor) {
    const triggerElement = anchor ?? this._triggerElement;
    if (!triggerElement || !this.layoutService || !shouldUseMobileWorkspacePickerSheet(this.layoutService)) {
      super.showPicker(force, anchor);
      return;
    }
    void showMobileWorkspacePickerSheet(
      this.layoutService,
      triggerElement,
      this._buildItems(),
      (item) => {
        void this._dispatchPickerItem(item);
      },
      this._getAllBrowseActions()
    );
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.action.chat.automationsDialog.insertNewline",
  weight: KeybindingWeight.EditorContrib + 100,
  when: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ChatContextKeys.inAutomationsDialog
  ),
  primary: KeyCode.Enter,
  handler: (accessor) => {
    const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    editor?.trigger("keyboard", "type", { text: "\n" });
  }
});
export {
  AutomationIsolationGroupActionViewItem,
  AutomationSessionDraftSynchronizer,
  AutomationsWorkspacePicker,
  MobileAutomationsWorkspacePicker,
  canSelectAutomationWorkspace,
  isAutomationDialogEditCommand,
  isAutomationDialogPopupTarget,
  registerAutomationDialogKeyboardNavigation,
  renderForm,
  resolveAutomationModelIdentifier,
  updateSaveButtonState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXGJyb3dzZXJcXGF1dG9tYXRpb25EaWFsb2cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgaGFzTmF0aXZlQ29udGV4dE1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlUGlja2VySXRlbSwgV29ya3NwYWNlUGlja2VyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3Nlc3Npb25Xb3Jrc3BhY2VQaWNrZXIuanMnO1xuaW1wb3J0IHsgQnJhbmNoUGlja2VyLCBJQnJhbmNoUGlja2VyQnJhbmNoIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2JyYW5jaFBpY2tlci5qcyc7XG5pbXBvcnQgeyBNb2JpbGVTZXNzaW9uVHlwZVBpY2tlciB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9tb2JpbGUvbW9iaWxlU2Vzc2lvblR5cGVQaWNrZXIuanMnO1xuaW1wb3J0IHsgaXNNb2JpbGVQaWNrZXJTaGVldFRhcmdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZVBpY2tlclNoZWV0LmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbiwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJR2l0UmVwb3NpdG9yeSwgSUdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL2dpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbkludGVydmFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBEQVlTX09GX1dFRUsgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9zY2hlZHVsZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIGlzQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJU2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFBhcnQsIElDaGF0SW5wdXRQYXJ0T3B0aW9ucywgSUNoYXRJbnB1dFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0UGFydC5qcyc7XG5pbXBvcnQgeyBpc01vZGVDb25zaWRlcmVkQnVpbHRJbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZVBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwsIG5vcm1hbGl6ZUF1dG9tYXRpb25CcmFuY2hOYW1lcyB9IGZyb20gJy4uL2NvbW1vbi9pc29sYXRpb25Hcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBzaG93TW9iaWxlV29ya3NwYWNlUGlja2VyU2hlZXQsIHNob3VsZFVzZU1vYmlsZVdvcmtzcGFjZVBpY2tlclNoZWV0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL21vYmlsZS9tb2JpbGVXb3Jrc3BhY2VQaWNrZXJTaGVldC5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgSU5URVJWQUxTOiB7IHJlYWRvbmx5IHZhbHVlOiBBdXRvbWF0aW9uSW50ZXJ2YWw7IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgfVtdID0gW1xuXHR7IHZhbHVlOiAnbWFudWFsJywgbGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmludGVydmFsLm1hbnVhbCcsIFwiTWFudWFsXCIpIH0sXG5cdHsgdmFsdWU6ICdob3VybHknLCBsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uaW50ZXJ2YWwuaG91cmx5JywgXCJIb3VybHlcIikgfSxcblx0eyB2YWx1ZTogJ2RhaWx5JywgbGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmludGVydmFsLmRhaWx5JywgXCJEYWlseVwiKSB9LFxuXHR7IHZhbHVlOiAnd2Vla2x5JywgbGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmludGVydmFsLndlZWtseScsIFwiV2Vla2x5XCIpIH0sXG5dO1xuXG4vLyBQaWNrZXIgcG9wdXBzIG1vdW50IG91dHNpZGUgdGhlIGRpYWxvZywgc28gYWxsb3cgdGhlaXIgZm9jdXMgdGFyZ2V0cyB0aHJvdWdoIGl0cyBmb2N1cyB0cmFwLlxuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0b21hdGlvbkRpYWxvZ1BvcHVwVGFyZ2V0KHJlbGF0ZWRUYXJnZXQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc01vYmlsZVBpY2tlclNoZWV0VGFyZ2V0KHJlbGF0ZWRUYXJnZXQpIHx8ICEhcmVsYXRlZFRhcmdldC5jbG9zZXN0KFxuXHRcdCcuY29udGV4dC12aWV3LCAucXVpY2staW5wdXQtd2lkZ2V0LCAubW9uYWNvLW1lbnUtY29udGFpbmVyLCAubW9uYWNvLWhvdmVyLCAubW9uYWNvLWhvdmVyLWNvbnRlbnQnXG5cdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0F1dG9tYXRpb25EaWFsb2dFZGl0Q29tbWFuZChjb21tYW5kSWQ6IHN0cmluZywgdGFyZ2V0OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGNvbW1hbmRJZCA9PT0gJ3VuZG8nIHx8IGNvbW1hbmRJZCA9PT0gJ3JlZG8nKSAmJiBET00uaXNFZGl0YWJsZUVsZW1lbnQodGFyZ2V0KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNhblNlbGVjdEF1dG9tYXRpb25Xb3Jrc3BhY2UoXG5cdGZvbGRlclVyaTogVVJJLFxuXHRwcmVmZXJyZWRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHR3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCByZXNvbHZlZCA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmksIHByZWZlcnJlZFByb3ZpZGVySWQpO1xuXHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghcmVzb2x2ZWQud29ya3NwYWNlLnJlcXVpcmVzV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gISFhd2FpdCB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RSZXNvdXJjZXNUcnVzdCh7XG5cdFx0dXJpOiBmb2xkZXJVcmksXG5cdFx0bWVzc2FnZTogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS50cnVzdEZvbGRlck1lc3NhZ2UnLCBcIkFuIGFnZW50IHNlc3Npb24gd2lsbCBiZSBhYmxlIHRvIHJlYWQgZmlsZXMsIHJ1biBjb21tYW5kcywgYW5kIG1ha2UgY2hhbmdlcyBpbiB0aGlzIGZvbGRlci5cIiksXG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgSUF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGZvY3VzRmlyc3QoKTogdm9pZDtcbn1cblxuLyoqIEtlZXBzIGtleWJvYXJkIGZvY3VzIHdpdGhpbiB0aGUgQXV0b21hdGlvbnMgZm9ybSB3aGlsZSBhbGxvd2luZyBvd25lZCBwb3B1cHMgdG8gaGFuZGxlIEVzY2FwZSBmaXJzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24oXG5cdHRhcmdldFdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMsXG5cdGdldEZvY3VzYWJsZUVsZW1lbnRzOiAoKSA9PiByZWFkb25seSBIVE1MRWxlbWVudFtdLFxuXHRpc1BvcHVwVGFyZ2V0OiAodGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gYm9vbGVhbixcbik6IElBdXRvbWF0aW9uRGlhbG9nS2V5Ym9hcmROYXZpZ2F0aW9uIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBzdXBwcmVzc1BvcHVwRXNjYXBlS2V5VXAgPSBmYWxzZTtcblxuXHRjb25zdCB2aXNpYmxlRm9jdXNhYmxlRWxlbWVudHMgPSAoKTogcmVhZG9ubHkgSFRNTEVsZW1lbnRbXSA9PiBnZXRGb2N1c2FibGVFbGVtZW50cygpLmZpbHRlcihlbGVtZW50ID0+IHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQgfHwgZWxlbWVudC50YWJJbmRleCA8IDAgfHwgZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2Rpc2FibGVkJykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY3VycmVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gZWxlbWVudDsgY3VycmVudDsgY3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudCkge1xuXHRcdFx0aWYgKGN1cnJlbnQuaGlkZGVuIHx8IGN1cnJlbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpID09PSAndHJ1ZScpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3R5bGUgPSB0YXJnZXRXaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShjdXJyZW50KTtcblx0XHRcdGlmIChzdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG5cblx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQ7XG5cdFx0aWYgKHRhcmdldCBpbnN0YW5jZW9mIHRhcmdldFdpbmRvdy5IVE1MRWxlbWVudCAmJiBpc1BvcHVwVGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdHN1cHByZXNzUG9wdXBFc2NhcGVLZXlVcCA9IGV2ZW50LmtleSA9PT0gJ0VzY2FwZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN1cHByZXNzUG9wdXBFc2NhcGVLZXlVcCA9IGZhbHNlO1xuXHRcdGlmIChldmVudC5rZXkgIT09ICdUYWInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNhYmxlRWxlbWVudHMgPSB2aXNpYmxlRm9jdXNhYmxlRWxlbWVudHMoKTtcblx0XHRpZiAoZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcblx0XHRsZXQgZm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMuZmluZEluZGV4KGVsZW1lbnQgPT4gZWxlbWVudCA9PT0gYWN0aXZlRWxlbWVudCk7XG5cdFx0aWYgKGZvY3VzZWRJbmRleCA8IDApIHtcblx0XHRcdGZvY3VzZWRJbmRleCA9IGZvY3VzYWJsZUVsZW1lbnRzLmZpbmRJbmRleChlbGVtZW50ID0+ICEhYWN0aXZlRWxlbWVudCAmJiBlbGVtZW50LmNvbnRhaW5zKGFjdGl2ZUVsZW1lbnQpKTtcblx0XHR9XG5cdFx0aWYgKGZvY3VzZWRJbmRleCA8IDApIHtcblx0XHRcdGZvY3VzZWRJbmRleCA9IGV2ZW50LnNoaWZ0S2V5ID8gMCA6IC0xO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0SW5kZXggPSBldmVudC5zaGlmdEtleVxuXHRcdFx0PyAoZm9jdXNlZEluZGV4IC0gMSArIGZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aCkgJSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGhcblx0XHRcdDogKGZvY3VzZWRJbmRleCArIDEpICUgZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoO1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0Zm9jdXNhYmxlRWxlbWVudHNbbmV4dEluZGV4XS5mb2N1cygpO1xuXHR9LCB0cnVlKSk7XG5cblx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBET00uRXZlbnRUeXBlLktFWV9VUCwgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0aWYgKGV2ZW50LmtleSA9PT0gJ0VzY2FwZScgJiYgc3VwcHJlc3NQb3B1cEVzY2FwZUtleVVwKSB7XG5cdFx0XHRzdXBwcmVzc1BvcHVwRXNjYXBlS2V5VXAgPSBmYWxzZTtcblx0XHRcdGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdXBwcmVzc1BvcHVwRXNjYXBlS2V5VXAgPSBmYWxzZTtcblx0fSwgdHJ1ZSkpO1xuXG5cdHJldHVybiB7XG5cdFx0Zm9jdXNGaXJzdDogKCkgPT4gdmlzaWJsZUZvY3VzYWJsZUVsZW1lbnRzKClbMF0/LmZvY3VzKCksXG5cdFx0ZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLFxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGb3JtU3RhdGUge1xuXHRuYW1lOiBzdHJpbmc7XG5cdGludGVydmFsOiBBdXRvbWF0aW9uSW50ZXJ2YWw7XG5cdGhvdXI6IG51bWJlcjtcblx0bWludXRlOiBudW1iZXI7XG5cdGRheTogbnVtYmVyO1xuXHRpc1F1aWNrQ2hhdDogYm9vbGVhbjtcblx0Zm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2Vzc2lvblR5cGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpc29sYXRpb25Nb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRlbmFibGVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWYWxpZGF0aW9uU3RhdGUge1xuXHRuYW1lRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJvbXB0RXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Zm9sZGVyRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2Vzc2lvblR5cGVFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRicmFuY2hFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSVJlbmRlckZvcm1IYW5kbGUge1xuXHRyZWFkb25seSBnZXRQcm9tcHQ6ICgpID0+IHN0cmluZztcblx0cmVhZG9ubHkgZ2V0TW9kZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnZXRQZXJtaXNzaW9uTGV2ZWw6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2V0TW9kZWxJZDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnZXRCcmFuY2g6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgd2FpdEZvckF1dG9tYXRpb25TZXNzaW9uU3luYzogKCkgPT4gUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgZ2V0Rm9jdXNhYmxlRWxlbWVudHM6ICgpID0+IHJlYWRvbmx5IEhUTUxFbGVtZW50W107XG59XG5cbmV4cG9ydCB0eXBlIEF1dG9tYXRpb25TZXNzaW9uRHJhZnRUYXJnZXQgPVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZSc7IHJlYWRvbmx5IGZvbGRlclVyaTogVVJJOyByZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHJlYWRvbmx5IHNlc3Npb25UeXBlSWQ6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSBraW5kOiAncXVpY2tDaGF0JzsgcmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nOyByZWFkb25seSBzZXNzaW9uVHlwZUlkOiBzdHJpbmcgfTtcblxudHlwZSBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U2VydmljZSA9IFBpY2s8XG5cdElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHQnYXV0b21hdGlvblNlc3Npb24nIHwgJ2NyZWF0ZUF1dG9tYXRpb25TZXNzaW9uJyB8ICdjcmVhdGVBdXRvbWF0aW9uUXVpY2tDaGF0JyB8ICdkaXNjYXJkQXV0b21hdGlvblNlc3Npb24nXG4+O1xuXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvblNlc3Npb25EcmFmdFN5bmNocm9uaXplciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlcXVlc3RlZFRhcmdldDogQXV0b21hdGlvblNlc3Npb25EcmFmdFRhcmdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhcHBsaWVkVGFyZ2V0OiBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0VGFyZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIHN5bmNTY2hlZHVsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBzeW5jUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIGRpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhblNlbGVjdFdvcmtzcGFjZTogKGZvbGRlclVyaTogVVJJLCBwcmVmZXJyZWRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IFByb21pc2U8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvbkVycm9yOiAoZXJyb3I6IHVua25vd24pID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHR1cGRhdGUodGFyZ2V0OiBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0VGFyZ2V0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5yZXF1ZXN0ZWRUYXJnZXQgPSB0YXJnZXQ7XG5cdFx0dGhpcy5nZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5zY2hlZHVsZVN5bmMoKTtcblx0fVxuXG5cdGFzeW5jIHdhaXRGb3JTeW5jKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBwZW5kaW5nU3luYzogUHJvbWlzZTx2b2lkPjtcblx0XHRkbyB7XG5cdFx0XHRwZW5kaW5nU3luYyA9IHRoaXMuc3luY1Byb21pc2U7XG5cdFx0XHRhd2FpdCBwZW5kaW5nU3luYztcblx0XHR9IHdoaWxlIChwZW5kaW5nU3luYyAhPT0gdGhpcy5zeW5jUHJvbWlzZSk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlU3luYygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zeW5jU2NoZWR1bGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc3luY1NjaGVkdWxlZCA9IHRydWU7XG5cdFx0dGhpcy5zeW5jUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5zeW5jU2NoZWR1bGVkID0gZmFsc2U7XG5cdFx0XHRpZiAoIXRoaXMuZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc3luYyh0aGlzLmdlbmVyYXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3luYyhnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnJlcXVlc3RlZFRhcmdldDtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5kaXNjYXJkU2Vzc2lvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tYXRjaGVzQXBwbGllZFRhcmdldCh0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnICYmICFhd2FpdCB0aGlzLmNhblNlbGVjdFdvcmtzcGFjZSh0YXJnZXQuZm9sZGVyVXJpLCB0YXJnZXQucHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0aWYgKGdlbmVyYXRpb24gPT09IHRoaXMuZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuZGlzY2FyZFNlc3Npb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5kaXNwb3NlZCB8fCBnZW5lcmF0aW9uICE9PSB0aGlzLmdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXNzaW9uID0gdGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0XHRcdD8gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb25RdWlja0NoYXQoe1xuXHRcdFx0XHRcdHByb3ZpZGVySWQ6IHRhcmdldC5wcm92aWRlcklkLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlSWQ6IHRhcmdldC5zZXNzaW9uVHlwZUlkLFxuXHRcdFx0XHR9KVxuXHRcdFx0XHQ6IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVBdXRvbWF0aW9uU2Vzc2lvbih0YXJnZXQuZm9sZGVyVXJpLCB7XG5cdFx0XHRcdFx0cHJvdmlkZXJJZDogdGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGVJZDogdGFyZ2V0LnNlc3Npb25UeXBlSWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0dGhpcy5hcHBsaWVkVGFyZ2V0ID0gdGFyZ2V0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIXRoaXMuZGlzcG9zZWQgJiYgZ2VuZXJhdGlvbiA9PT0gdGhpcy5nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuZGlzY2FyZFNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5vbkVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNBcHBsaWVkVGFyZ2V0KHRhcmdldDogQXV0b21hdGlvblNlc3Npb25EcmFmdFRhcmdldCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uXG5cdFx0XHR8fCAhdGhpcy5hcHBsaWVkVGFyZ2V0XG5cdFx0XHR8fCB0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYXV0b21hdGlvblNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCAhPT0gdGhpcy5zZXNzaW9uLnNlc3Npb25JZFxuXHRcdFx0fHwgdGhpcy5hcHBsaWVkVGFyZ2V0LmtpbmQgIT09IHRhcmdldC5raW5kXG5cdFx0XHR8fCB0aGlzLmFwcGxpZWRUYXJnZXQucHJvdmlkZXJJZCAhPT0gdGFyZ2V0LnByb3ZpZGVySWRcblx0XHRcdHx8IHRoaXMuYXBwbGllZFRhcmdldC5zZXNzaW9uVHlwZUlkICE9PSB0YXJnZXQuc2Vzc2lvblR5cGVJZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0XHR8fCAodGhpcy5hcHBsaWVkVGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnICYmIGlzRXF1YWwodGhpcy5hcHBsaWVkVGFyZ2V0LmZvbGRlclVyaSwgdGFyZ2V0LmZvbGRlclVyaSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNjYXJkU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZGlzY2FyZEF1dG9tYXRpb25TZXNzaW9uKHRoaXMuc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmFwcGxpZWRUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuZ2VuZXJhdGlvbisrO1xuXHRcdHRoaXMuZGlzY2FyZFNlc3Npb24oKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVBdXRvbWF0aW9uTW9kZWxJZGVudGlmaWVyKFxuXHRsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IFBpY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZSwgJ2dldExhbmd1YWdlTW9kZWxJZHMnIHwgJ2xvb2t1cExhbmd1YWdlTW9kZWwnPixcblx0aWRlbnRpZmllcjogc3RyaW5nLFxuXHRsb2dpY2FsU2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0bW9kZWxUYXJnZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IHN0cmluZyB7XG5cdGlmICghbG9naWNhbFNlc3Npb25UeXBlIHx8ICFtb2RlbFRhcmdldCkge1xuXHRcdHJldHVybiBpZGVudGlmaWVyO1xuXHR9XG5cdGNvbnN0IHNvdXJjZU1vZGVsID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcik7XG5cdGlmIChzb3VyY2VNb2RlbD8udGFyZ2V0Q2hhdFNlc3Npb25UeXBlICE9PSBsb2dpY2FsU2Vzc2lvblR5cGUpIHtcblx0XHRyZXR1cm4gaWRlbnRpZmllcjtcblx0fVxuXHRyZXR1cm4gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKS5maW5kKGNhbmRpZGF0ZUlkZW50aWZpZXIgPT4ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZSA9IGxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGNhbmRpZGF0ZUlkZW50aWZpZXIpO1xuXHRcdHJldHVybiBjYW5kaWRhdGU/LnRhcmdldENoYXRTZXNzaW9uVHlwZSA9PT0gbW9kZWxUYXJnZXQgJiYgY2FuZGlkYXRlLmlkID09PSBzb3VyY2VNb2RlbC5pZDtcblx0fSkgPz8gaWRlbnRpZmllcjtcbn1cblxuY29uc3QgQVVUT01BVElPTlNfSEFSTkVTU19DSElQX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVuZGVyQXV0b21hdGlvbnNIYXJuZXNzQ2hpcCc7XG5jb25zdCBBVVRPTUFUSU9OU19XT1JLU1BBQ0VfUElDS0VSX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVuZGVyQXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXInO1xuY29uc3QgQVVUT01BVElPTlNfSVNPTEFUSU9OX0dST1VQX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVuZGVyQXV0b21hdGlvbnNJc29sYXRpb25Hcm91cCc7XG5cbnR5cGUgQnJhbmNoTG9hZFN0YXRlID0gJ25vRm9sZGVyJyB8ICdsb2FkaW5nUmVwb3NpdG9yeScgfCAnbm9SZXBvc2l0b3J5JyB8ICdsb2FkaW5nQnJhbmNoZXMnIHwgJ3JlYWR5JyB8ICdlbXB0eScgfCAnZXJyb3InO1xuXG5mdW5jdGlvbiBzZXRBdXRvbWF0aW9uQ29udHJvbFZpc2libGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2libGUgPyAnJyA6ICdub25lJztcblx0aWYgKHZpc2libGUpIHtcblx0XHRjb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWhpZGRlbicpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvbklzb2xhdGlvbkdyb3VwQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBicmFuY2hSZXBvRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJhbmNoUmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdHByaXZhdGUgYnJhbmNoUmVxdWVzdElkID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBicmFuY2hQaWNrZXI6IEJyYW5jaFBpY2tlcjtcblx0cHJpdmF0ZSBicmFuY2hMb2FkU3RhdGU6IEJyYW5jaExvYWRTdGF0ZSA9ICdub0ZvbGRlcic7XG5cdHByaXZhdGUgcmVwb3NpdG9yeTogSUdpdFJlcG9zaXRvcnkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYnJhbmNoZXM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgZGV0YWNoZWRDb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3b3JrdHJlZUNhcGFiaWxpdHlSZXNvbHZlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0YXRlOiBJRm9ybVN0YXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNvbGF0aW9uTW9kZWw6IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUZvbGRlcjogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGFyZ2V0OiBFdmVudDx2b2lkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJldmFsaWRhdGU6ICgpID0+IHZvaWQsXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB8IHVuZGVmaW5lZCxcblx0XHRASUdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnaXRTZXJ2aWNlOiBJR2l0U2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwaWNrZXJMb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR0aGlzLmJyYW5jaFBpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyYW5jaFBpY2tlciwge1xuXHRcdFx0dXNlcjogJ2F1dG9tYXRpb25CcmFuY2hQaWNrZXInLFxuXHRcdFx0c2xvdENsYXNzTmFtZTogJ2F1dG9tYXRpb24tZm9ybS1icmFuY2gtcGlja2VyLXNsb3QnLFxuXHRcdFx0dHJpZ2dlckNsYXNzTmFtZTogJ2F1dG9tYXRpb24tZm9ybS1icmFuY2gtc2xvdCcsXG5cdFx0XHRsYWJlbENsYXNzTmFtZTogJ2F1dG9tYXRpb24tZm9ybS1icmFuY2gtbmFtZScsXG5cdFx0XHRkZXNjcmlwdGlvbkNsYXNzTmFtZTogJ2F1dG9tYXRpb24tZm9ybS1icmFuY2gtZGVzY3JpcHRpb24nLFxuXHRcdFx0a2VlcERpc2FibGVkRm9jdXNhYmxlOiB0cnVlLFxuXHRcdFx0cmVuZGVyRGlzYWJsZWRBc1N0YXRpYzogdHJ1ZSxcblx0XHRcdGFyaWFMaXZlOiAncG9saXRlJyxcblx0XHRcdG9uU2VsZWN0QnJhbmNoOiBicmFuY2ggPT4ge1xuXHRcdFx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNlbGVjdEJyYW5jaChicmFuY2gpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHRcdH0sXG5cdFx0XHRvblJldHJ5OiAoKSA9PiB7XG5cdFx0XHRcdHZvaWQgdGhpcy5yZWxvYWRSZXBvc2l0b3J5KHRoaXMuaXNvbGF0aW9uTW9kZWwuZm9sZGVyVXJpKTtcblx0XHRcdH0sXG5cdFx0XHRpc29sYXRpb246IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uaXNvbGF0aW9uLndvcmt0cmVlJywgXCJOZXcgV29ya3RyZWVcIiksXG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5pc29sYXRpb24uY2hlY2tib3hBcmlhTGFiZWwnLCBcIldvcmt0cmVlIGlzb2xhdGlvblwiKSxcblx0XHRcdFx0b25Ub2dnbGU6IGNoZWNrZWQgPT4ge1xuXHRcdFx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2VsZWN0SXNvbGF0aW9uTW9kZShjaGVja2VkID8gJ3dvcmt0cmVlJyA6ICd3b3Jrc3BhY2UnKTtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5icmFuY2hSZXBvRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMuY2FuY2VsQnJhbmNoUmVxdWVzdCgpO1xuXHRcdERPTS5jbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuc3R5bGUubWFyZ2luTGVmdCA9ICdhdXRvJztcblx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy52aXNpYmxlO1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHNldEF1dG9tYXRpb25Db250cm9sVmlzaWJsZShjb250YWluZXIsIHZpc2libGUucmVhZChyZWFkZXIpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc29sYXRpb25Hcm91cCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLmF1dG9tYXRpb24tZm9ybS1pc29sYXRpb24tZ3JvdXAnKSk7XG5cdFx0dGhpcy5icmFuY2hQaWNrZXIucmVuZGVyKGlzb2xhdGlvbkdyb3VwKTtcblxuXHRcdHRoaXMucmVmcmVzaFRhcmdldENhcGFiaWxpdHkoKTtcblx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSB0aGlzLndvcmtzcGFjZUZvbGRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnJlZnJlc2hUYXJnZXRBbmRSZW5kZXIoKTtcblx0XHRcdHZvaWQgdGhpcy5yZWxvYWRSZXBvc2l0b3J5KGZvbGRlclVyaSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VUYXJnZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWZyZXNoVGFyZ2V0QW5kUmVuZGVyKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB0aGlzLnJlZnJlc2hUYXJnZXRBbmRSZW5kZXIoKSkpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5jYW5jZWxCcmFuY2hSZXF1ZXN0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hUYXJnZXRDYXBhYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IHRoaXMuaXNvbGF0aW9uTW9kZWwuZm9sZGVyVXJpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSB0aGlzLnN0YXRlLnNlc3Npb25UeXBlSWQ7XG5cdFx0aWYgKCFmb2xkZXJVcmkgfHwgIXNlc3Npb25UeXBlSWQpIHtcblx0XHRcdHRoaXMud29ya3RyZWVDYXBhYmlsaXR5UmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2V0U3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24oZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyVXJpKS5maW5kKGNhbmRpZGF0ZSA9PlxuXHRcdFx0Y2FuZGlkYXRlLnNlc3Npb25UeXBlLmlkID09PSBzZXNzaW9uVHlwZUlkXG5cdFx0XHQmJiAodGhpcy5zdGF0ZS5wcm92aWRlcklkID09PSB1bmRlZmluZWQgfHwgY2FuZGlkYXRlLnByb3ZpZGVySWQgPT09IHRoaXMuc3RhdGUucHJvdmlkZXJJZClcblx0XHQpPy5zZXNzaW9uVHlwZTtcblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHR0aGlzLndvcmt0cmVlQ2FwYWJpbGl0eVJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy53b3JrdHJlZUNhcGFiaWxpdHlSZXNvbHZlZCA9IHRydWU7XG5cdFx0Y29uc3Qgc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gPSBzZXNzaW9uVHlwZS5zdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiA9PT0gdHJ1ZTtcblx0XHR0aGlzLmlzb2xhdGlvbk1vZGVsLnNldFN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKTtcblx0XHRpZiAoIXN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uICYmIHRoaXMuaXNvbGF0aW9uTW9kZWwuaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJykge1xuXHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlbC5zZWxlY3RJc29sYXRpb25Nb2RlKCd3b3Jrc3BhY2UnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hUYXJnZXRBbmRSZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWZyZXNoVGFyZ2V0Q2FwYWJpbGl0eSgpO1xuXHRcdHRoaXMucmVuZGVyQnJhbmNoQ29udHJvbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJCcmFuY2hDb250cm9sKCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IHRoaXMuZ2V0QnJhbmNoUHJlc2VudGF0aW9uKCk7XG5cdFx0Y29uc3QgY2FuT3BlbiA9IHRoaXMuY2FuT3BlbkJyYW5jaFBpY2tlcigpO1xuXHRcdGNvbnN0IHNlbGVjdGVkQnJhbmNoID0gdGhpcy5pc29sYXRpb25Nb2RlbC5zZWxlY3RlZEJyYW5jaCA/PyB0aGlzLmlzb2xhdGlvbk1vZGVsLmhlYWRCcmFuY2g7XG5cdFx0Y29uc3QgYnJhbmNoZXM6IElCcmFuY2hQaWNrZXJCcmFuY2hbXSA9IHRoaXMuYnJhbmNoZXMubWFwKGJyYW5jaCA9PiAoe1xuXHRcdFx0bmFtZTogYnJhbmNoLFxuXHRcdFx0c2VsZWN0ZWQ6IGJyYW5jaCA9PT0gc2VsZWN0ZWRCcmFuY2gsXG5cdFx0fSkpO1xuXHRcdGlmIChzZWxlY3RlZEJyYW5jaCAmJiAhdGhpcy5icmFuY2hlcy5pbmNsdWRlcyhzZWxlY3RlZEJyYW5jaCkpIHtcblx0XHRcdGJyYW5jaGVzLnVuc2hpZnQoe1xuXHRcdFx0XHRuYW1lOiBzZWxlY3RlZEJyYW5jaCxcblx0XHRcdFx0c2VsZWN0ZWQ6IHRydWUsXG5cdFx0XHRcdHVuYXZhaWxhYmxlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmt0cmVlVW5hdmFpbGFibGVSZWFzb24gPSB0aGlzLmdldFdvcmt0cmVlVW5hdmFpbGFibGVSZWFzb24oKTtcblx0XHRjb25zdCBpc29sYXRpb25TdGF0ZTogJ2VuYWJsZWQnIHwgJ2Rpc2FibGVkJyB8ICdoaWRkZW4nID1cblx0XHRcdHdvcmt0cmVlVW5hdmFpbGFibGVSZWFzb24gPT09IHVuZGVmaW5lZCA/ICdlbmFibGVkJyA6ICdkaXNhYmxlZCc7XG5cblx0XHR0aGlzLmJyYW5jaFBpY2tlci51cGRhdGUoe1xuXHRcdFx0bGFiZWw6IHByZXNlbnRhdGlvbi5sYWJlbCxcblx0XHRcdGJyYW5jaGVzLFxuXHRcdFx0c3RhdHVzOiB0aGlzLmJyYW5jaExvYWRTdGF0ZSA9PT0gJ2xvYWRpbmdSZXBvc2l0b3J5JyB8fCB0aGlzLmJyYW5jaExvYWRTdGF0ZSA9PT0gJ2xvYWRpbmdCcmFuY2hlcydcblx0XHRcdFx0PyAnbG9hZGluZydcblx0XHRcdFx0OiB0aGlzLmJyYW5jaExvYWRTdGF0ZSA9PT0gJ2Vycm9yJ1xuXHRcdFx0XHRcdD8gJ2Vycm9yJ1xuXHRcdFx0XHRcdDogdGhpcy5icmFuY2hMb2FkU3RhdGUgPT09ICdyZWFkeSdcblx0XHRcdFx0XHRcdD8gJ3JlYWR5J1xuXHRcdFx0XHRcdFx0OiAnZW1wdHknLFxuXHRcdFx0Y2FuT3Blbixcblx0XHRcdGRpc2FibGVkUmVhc29uOiBwcmVzZW50YXRpb24ucmVhc29uLFxuXHRcdFx0bWlzc2luZzogcHJlc2VudGF0aW9uLm1pc3NpbmcsXG5cdFx0XHRzaG93Q2hldnJvbjogdGhpcy5pc29sYXRpb25Nb2RlbC5icmFuY2hQaWNrZXJBdmFpbGFibGUgfHwgdGhpcy5icmFuY2hMb2FkU3RhdGUgPT09ICdlcnJvcicsXG5cdFx0XHRpc29sYXRpb246IHtcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5pc29sYXRpb25Nb2RlbC5pc29sYXRpb25Nb2RlID09PSAnd29ya3RyZWUnLFxuXHRcdFx0XHRzdGF0ZTogaXNvbGF0aW9uU3RhdGUsXG5cdFx0XHRcdGRpc2FibGVkUmVhc29uOiB3b3JrdHJlZVVuYXZhaWxhYmxlUmVhc29uLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHR0aGlzLnJldmFsaWRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QnJhbmNoUHJlc2VudGF0aW9uKCk6IHsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZzsgcmVhZG9ubHkgcmVhc29uOiBzdHJpbmc7IHJlYWRvbmx5IG1pc3Npbmc6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgZGlzcGxheUJyYW5jaCA9IHRoaXMuaXNvbGF0aW9uTW9kZWwuZGlzcGxheUJyYW5jaDtcblx0XHRpZiAoIXRoaXMuaXNvbGF0aW9uTW9kZWwuZm9sZGVyVXJpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gudW5rbm93bicsIFwiXHUyMDE0XCIpLFxuXHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLm5vRm9sZGVyUmVhc29uJywgXCJTZWxlY3QgYSBmb2xkZXIgdG8gZGV0ZXJtaW5lIGl0cyBHaXQgYnJhbmNoLlwiKSxcblx0XHRcdFx0bWlzc2luZzogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmICghdGhpcy53b3JrdHJlZUNhcGFiaWxpdHlSZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGRpc3BsYXlCcmFuY2ggPz8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gudW5rbm93bicsIFwiXHUyMDE0XCIpLFxuXHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmNhcGFiaWxpdHlMb2FkaW5nUmVhc29uJywgXCJTZXNzaW9uIGNhcGFiaWxpdGllcyBhcmUgbG9hZGluZy5cIiksXG5cdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmlzb2xhdGlvbk1vZGVsLnN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogZGlzcGxheUJyYW5jaCA/PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC51bmtub3duJywgXCJcdTIwMTRcIiksXG5cdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gudW5zdXBwb3J0ZWRSZWFzb24nLCBcIlRoZSBzZWxlY3RlZCBzZXNzaW9uIHR5cGUgZG9lcyBub3Qgc3VwcG9ydCBXb3JrdHJlZSBicmFuY2ggY29uZmlndXJhdGlvbi5cIiksXG5cdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYnJhbmNoTG9hZFN0YXRlID09PSAnZXJyb3InKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogZGlzcGxheUJyYW5jaCA/PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5sb2FkRXJyb3InLCBcIlVuYWJsZSB0byBsb2FkIGJyYW5jaGVzXCIpLFxuXHRcdFx0XHRyZWFzb246IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmxvYWRFcnJvclJlYXNvbicsIFwiT3BlbiB0aGUgYnJhbmNoIHBpY2tlciB0byByZXRyeSBsb2FkaW5nIGxvY2FsIGJyYW5jaGVzLlwiKSxcblx0XHRcdFx0bWlzc2luZzogIWRpc3BsYXlCcmFuY2gsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc29sYXRpb25Nb2RlbC5pc29sYXRpb25Nb2RlICE9PSAnd29ya3RyZWUnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogZGlzcGxheUJyYW5jaCA/PyB0aGlzLmRldGFjaGVkQ29tbWl0ID8/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLnVua25vd24nLCBcIlx1MjAxNFwiKSxcblx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5mb2xkZXJNb2RlUmVhc29uJywgXCJTZWxlY3QgV29ya3RyZWUgdG8gY2hvb3NlIGEgYnJhbmNoLlwiKSxcblx0XHRcdFx0bWlzc2luZzogIWRpc3BsYXlCcmFuY2ggJiYgIXRoaXMuZGV0YWNoZWRDb21taXQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRzd2l0Y2ggKHRoaXMuYnJhbmNoTG9hZFN0YXRlKSB7XG5cdFx0XHRjYXNlICdsb2FkaW5nUmVwb3NpdG9yeSc6XG5cdFx0XHRjYXNlICdsb2FkaW5nQnJhbmNoZXMnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBkaXNwbGF5QnJhbmNoID8/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmxvYWRpbmcnLCBcIkxvYWRpbmcgYnJhbmNoZXNcdTIwMjZcIiksXG5cdFx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5sb2FkaW5nUmVhc29uJywgXCJMb2NhbCBicmFuY2hlcyBhcmUgbG9hZGluZy5cIiksXG5cdFx0XHRcdFx0bWlzc2luZzogIWRpc3BsYXlCcmFuY2gsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdub1JlcG9zaXRvcnknOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBkaXNwbGF5QnJhbmNoID8/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLm5vUmVwbycsIFwibm8gZ2l0IHJlcG9cIiksXG5cdFx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5ub1JlcG9SZWFzb24nLCBcIk5vIEdpdCByZXBvc2l0b3J5IHdhcyBmb3VuZCBmb3IgdGhlIHNlbGVjdGVkIGZvbGRlci5cIiksXG5cdFx0XHRcdFx0bWlzc2luZzogIWRpc3BsYXlCcmFuY2gsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdlbXB0eSc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IGRpc3BsYXlCcmFuY2ggPz8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubm9CcmFuY2hlcycsIFwiTm8gbG9jYWwgYnJhbmNoZXNcIiksXG5cdFx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5ub0JyYW5jaGVzUmVhc29uJywgXCJObyBsb2NhbCBicmFuY2hlcyB3ZXJlIGZvdW5kIGluIHRoaXMgcmVwb3NpdG9yeS5cIiksXG5cdFx0XHRcdFx0bWlzc2luZzogIWRpc3BsYXlCcmFuY2gsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdyZWFkeSc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IGRpc3BsYXlCcmFuY2ggPz8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2guc2VsZWN0JywgXCJTZWxlY3QgYnJhbmNoXCIpLFxuXHRcdFx0XHRcdHJlYXNvbjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2guY2hvb3NlUmVhc29uJywgXCJDaG9vc2UgdGhlIGxvY2FsIGJyYW5jaCB0byB1c2UgYXMgdGhlIFdvcmt0cmVlIGJhc2UuXCIpLFxuXHRcdFx0XHRcdG1pc3Npbmc6ICFkaXNwbGF5QnJhbmNoLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnbm9Gb2xkZXInOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC51bmtub3duJywgXCJcdTIwMTRcIiksXG5cdFx0XHRcdFx0cmVhc29uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5ub0ZvbGRlclJlYXNvbicsIFwiU2VsZWN0IGEgZm9sZGVyIHRvIGRldGVybWluZSBpdHMgR2l0IGJyYW5jaC5cIiksXG5cdFx0XHRcdFx0bWlzc2luZzogdHJ1ZSxcblx0XHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNhbk9wZW5CcmFuY2hQaWNrZXIoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuYnJhbmNoTG9hZFN0YXRlID09PSAnZXJyb3InKSB7XG5cdFx0XHRyZXR1cm4gISF0aGlzLmlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaSAmJiB0aGlzLndvcmt0cmVlQ2FwYWJpbGl0eVJlc29sdmVkICYmIHRoaXMuaXNvbGF0aW9uTW9kZWwuc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmlzb2xhdGlvbk1vZGVsLmJyYW5jaFBpY2tlckF2YWlsYWJsZVxuXHRcdFx0JiYgdGhpcy5icmFuY2hMb2FkU3RhdGUgIT09ICdub0ZvbGRlcidcblx0XHRcdCYmIHRoaXMuYnJhbmNoTG9hZFN0YXRlICE9PSAnbm9SZXBvc2l0b3J5J1xuXHRcdFx0JiYgdGhpcy5icmFuY2hMb2FkU3RhdGUgIT09ICdsb2FkaW5nUmVwb3NpdG9yeSdcblx0XHRcdCYmIHRoaXMuYnJhbmNoTG9hZFN0YXRlICE9PSAnbG9hZGluZ0JyYW5jaGVzJztcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya3RyZWVVbmF2YWlsYWJsZVJlYXNvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5pc29sYXRpb25Nb2RlbC5mb2xkZXJVcmkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmlzb2xhdGlvbi53b3JrdHJlZU5vRm9sZGVyJywgXCJTZWxlY3QgYSBmb2xkZXIgdG8gdXNlIFdvcmt0cmVlIGlzb2xhdGlvbi5cIik7XG5cdFx0fVxuXHRcdGlmICghdGhpcy53b3JrdHJlZUNhcGFiaWxpdHlSZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmNhcGFiaWxpdHlMb2FkaW5nUmVhc29uJywgXCJTZXNzaW9uIGNhcGFiaWxpdGllcyBhcmUgbG9hZGluZy5cIik7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5pc29sYXRpb25Nb2RlbC5zdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uaXNvbGF0aW9uLndvcmt0cmVlVW5hdmFpbGFibGUnLCBcIk5vdCBzdXBwb3J0ZWQgYnkgdGhlIHNlbGVjdGVkIHNlc3Npb24gdHlwZVwiKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaXNvbGF0aW9uTW9kZWwuc2VsZWN0ZWRCcmFuY2gpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHN3aXRjaCAodGhpcy5icmFuY2hMb2FkU3RhdGUpIHtcblx0XHRcdGNhc2UgJ2xvYWRpbmdSZXBvc2l0b3J5Jzpcblx0XHRcdGNhc2UgJ2xvYWRpbmdCcmFuY2hlcyc6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaC5sb2FkaW5nUmVhc29uJywgXCJMb2NhbCBicmFuY2hlcyBhcmUgbG9hZGluZy5cIik7XG5cdFx0XHRjYXNlICdub1JlcG9zaXRvcnknOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubm9SZXBvUmVhc29uJywgXCJObyBHaXQgcmVwb3NpdG9yeSB3YXMgZm91bmQgZm9yIHRoZSBzZWxlY3RlZCBmb2xkZXIuXCIpO1xuXHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubG9hZEVycm9yUmVhc29uJywgXCJPcGVuIHRoZSBicmFuY2ggcGlja2VyIHRvIHJldHJ5IGxvYWRpbmcgbG9jYWwgYnJhbmNoZXMuXCIpO1xuXHRcdFx0Y2FzZSAnZW1wdHknOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5icmFuY2gubm9CcmFuY2hlc1JlYXNvbicsIFwiTm8gbG9jYWwgYnJhbmNoZXMgd2VyZSBmb3VuZCBpbiB0aGlzIHJlcG9zaXRvcnkuXCIpO1xuXHRcdFx0Y2FzZSAncmVhZHknOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5icmFuY2hlcy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLm5vQnJhbmNoZXNSZWFzb24nLCBcIk5vIGxvY2FsIGJyYW5jaGVzIHdlcmUgZm91bmQgaW4gdGhpcyByZXBvc2l0b3J5LlwiKTtcblx0XHRcdGNhc2UgJ25vRm9sZGVyJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uaXNvbGF0aW9uLndvcmt0cmVlTm9Gb2xkZXInLCBcIlNlbGVjdCBhIGZvbGRlciB0byB1c2UgV29ya3RyZWUgaXNvbGF0aW9uLlwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbEJyYW5jaFJlcXVlc3QoKTogdm9pZCB7XG5cdFx0dGhpcy5icmFuY2hSZXF1ZXN0LnZhbHVlPy5jYW5jZWwoKTtcblx0XHR0aGlzLmJyYW5jaFJlcXVlc3QuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkUmVwb3NpdG9yeShmb2xkZXI6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9ICsrdGhpcy5icmFuY2hSZXF1ZXN0SWQ7XG5cdFx0dGhpcy5jYW5jZWxCcmFuY2hSZXF1ZXN0KCk7XG5cdFx0dGhpcy5icmFuY2hSZXBvRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMucmVwb3NpdG9yeSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJyYW5jaGVzID0gW107XG5cdFx0dGhpcy5kZXRhY2hlZENvbW1pdCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0dGhpcy5icmFuY2hMb2FkU3RhdGUgPSAnbm9Gb2xkZXInO1xuXHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlbC5zZXRIZWFkQnJhbmNoKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5icmFuY2hMb2FkU3RhdGUgPSAnbG9hZGluZ1JlcG9zaXRvcnknO1xuXHRcdHRoaXMucmVuZGVyQnJhbmNoQ29udHJvbCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuYnJhbmNoUmVxdWVzdC52YWx1ZSA9IGN0cztcblx0XHRsZXQgcmVwbzogSUdpdFJlcG9zaXRvcnkgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlcG8gPSBhd2FpdCB0aGlzLmdpdFNlcnZpY2Uub3BlblJlcG9zaXRvcnkoZm9sZGVyKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5icmFuY2hSZXF1ZXN0SWQgfHwgY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMucGlja2VyTG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25EaWFsb2ddIEZhaWxlZCB0byBvcGVuIEdpdCByZXBvc2l0b3J5IGZvciBicmFuY2ggc2VsZWN0aW9uLicsIGVycm9yKTtcblx0XHRcdHRoaXMuYnJhbmNoTG9hZFN0YXRlID0gJ2Vycm9yJztcblx0XHRcdHRoaXMucmVuZGVyQnJhbmNoQ29udHJvbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocmVxdWVzdElkICE9PSB0aGlzLmJyYW5jaFJlcXVlc3RJZCB8fCBjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFyZXBvKSB7XG5cdFx0XHR0aGlzLmJyYW5jaExvYWRTdGF0ZSA9ICdub1JlcG9zaXRvcnknO1xuXHRcdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucmVwb3NpdG9yeSA9IHJlcG87XG5cdFx0Y29uc3Qgd2F0Y2hlciA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR3YXRjaGVyLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBoZWFkID0gcmVwby5zdGF0ZS5yZWFkKHJlYWRlcikuSEVBRDtcblx0XHRcdGlmIChoZWFkPy5jb21taXQgJiYgaGVhZC5uYW1lKSB7XG5cdFx0XHRcdHRoaXMuZGV0YWNoZWRDb21taXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2V0SGVhZEJyYW5jaChoZWFkLm5hbWUpO1xuXHRcdFx0fSBlbHNlIGlmIChoZWFkPy5jb21taXQpIHtcblx0XHRcdFx0dGhpcy5kZXRhY2hlZENvbW1pdCA9IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uYnJhbmNoLmRldGFjaGVkJywgXCIoezB9KVwiLCBoZWFkLmNvbW1pdC5zbGljZSgwLCA3KSk7XG5cdFx0XHRcdHRoaXMuaXNvbGF0aW9uTW9kZWwuc2V0SGVhZEJyYW5jaCh1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kZXRhY2hlZENvbW1pdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5pc29sYXRpb25Nb2RlbC5zZXRIZWFkQnJhbmNoKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5icmFuY2hSZXBvRGlzcG9zYWJsZS52YWx1ZSA9IHdhdGNoZXI7XG5cdFx0dGhpcy5icmFuY2hMb2FkU3RhdGUgPSAnbG9hZGluZ0JyYW5jaGVzJztcblx0XHR0aGlzLnJlbmRlckJyYW5jaENvbnRyb2woKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVmcyA9IGF3YWl0IHJlcG8uZ2V0UmVmcyh7IHBhdHRlcm46ICdyZWZzL2hlYWRzJyB9LCBjdHMudG9rZW4pO1xuXHRcdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5icmFuY2hSZXF1ZXN0SWQgfHwgY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMucmVwb3NpdG9yeSAhPT0gcmVwbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmJyYW5jaGVzID0gbm9ybWFsaXplQXV0b21hdGlvbkJyYW5jaE5hbWVzKHJlZnMubWFwKHJlZiA9PiByZWYubmFtZSkpO1xuXHRcdFx0dGhpcy5icmFuY2hMb2FkU3RhdGUgPSB0aGlzLmJyYW5jaGVzLmxlbmd0aCA+IDAgPyAncmVhZHknIDogJ2VtcHR5Jztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHJlcXVlc3RJZCAhPT0gdGhpcy5icmFuY2hSZXF1ZXN0SWQgfHwgY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMucGlja2VyTG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25EaWFsb2ddIEZhaWxlZCB0byBsb2FkIGxvY2FsIGJyYW5jaGVzLicsIGVycm9yKTtcblx0XHRcdHRoaXMuYnJhbmNoTG9hZFN0YXRlID0gJ2Vycm9yJztcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJCcmFuY2hDb250cm9sKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZW5kZXJzIGEgZGlhbG9nLW93bmVkIHBpY2tlciBpbnRvIGEgY2hhdCBpbnB1dCBzZWNvbmRhcnktdG9vbGJhciBzbG90LiBUaGVcbiAqIHBpY2tlciBpbnN0YW5jZSBpcyBvd25lZCBieSB0aGUgZGlhbG9nIChyZWdpc3RlcmVkIG9uIGl0cyBkaXNwb3NhYmxlcyk7IHRoaXNcbiAqIHZpZXcgaXRlbSBvbmx5IGluamVjdHMgdGhlIHBpY2tlcidzIERPTSBpbnRvIHRoZSB0b29sYmFyIGNvbnRhaW5lciB2aWEgdGhlXG4gKiBzdXBwbGllZCB7QGxpbmsgcmVuZGVyUGlja2VyfSBjYWxsYmFjay5cbiAqL1xuY2xhc3MgQXV0b21hdGlvblBpY2tlckFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmlsaXR5V2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlclBpY2tlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zPzogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0RE9NLmNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdHRoaXMucmVuZGVyUGlja2VyKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMudmlzaWJsZTtcblx0XHR0aGlzLnZpc2liaWxpdHlXYXRjaC52YWx1ZSA9IHZpc2libGUgPyBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRzZXRBdXRvbWF0aW9uQ29udHJvbFZpc2libGUoY29udGFpbmVyLCB2aXNpYmxlLnJlYWQocmVhZGVyKSk7XG5cdFx0fSkgOiB1bmRlZmluZWQ7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5BdXRvbWF0aW9uc0hhcm5lc3NDaGlwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBVVRPTUFUSU9OU19IQVJORVNTX0NISVBfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYXV0b21hdGlvbi5mb3JtLmhhcm5lc3NDaGlwLmFjdGlvbicsIFwiQXV0b21hdGlvbnMgSGFybmVzcyBDaGlwXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTEsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkF1dG9tYXRpb25zRGlhbG9nLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7IC8qIGhhbmRsZWQgYnkgYWN0aW9uIHZpZXcgaXRlbSAqLyB9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5BdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQVVUT01BVElPTlNfV09SS1NQQUNFX1BJQ0tFUl9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhdXRvbWF0aW9uLmZvcm0ud29ya3NwYWNlUGlja2VyLmFjdGlvbicsIFwiQXV0b21hdGlvbnMgV29ya3NwYWNlIFBpY2tlclwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkF1dG9tYXRpb25zRGlhbG9nLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7IC8qIGhhbmRsZWQgYnkgYWN0aW9uIHZpZXcgaXRlbSAqLyB9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5BdXRvbWF0aW9uc0lzb2xhdGlvbkdyb3VwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBVVRPTUFUSU9OU19JU09MQVRJT05fR1JPVVBfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYXV0b21hdGlvbi5mb3JtLmlzb2xhdGlvbkdyb3VwLmFjdGlvbicsIFwiQXV0b21hdGlvbnMgSXNvbGF0aW9uIEdyb3VwXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2Vjb25kYXJ5LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQXV0b21hdGlvbnNEaWFsb2csXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgLyogaGFuZGxlZCBieSBhY3Rpb24gdmlldyBpdGVtICovIH1cbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyRm9ybShcblx0Zm9ybTogSFRNTEVsZW1lbnQsXG5cdHN0YXRlOiBJRm9ybVN0YXRlLFxuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHR2YWxpZGF0aW9uOiBJVmFsaWRhdGlvblN0YXRlLFxuXHRyZXZhbGlkYXRlOiAoKSA9PiB2b2lkLFxuXHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0bGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0d29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdGluaXRpYWxQcm9tcHQ6IHN0cmluZyxcblx0aW5pdGlhbE1vZGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0aW5pdGlhbFBlcm1pc3Npb25MZXZlbDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRpbml0aWFsTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuKTogSVJlbmRlckZvcm1IYW5kbGUge1xuXHRjb25zdCBuYW1lUm93ID0gRE9NLmFwcGVuZChmb3JtLCAkKCcuYXV0b21hdGlvbi1mb3JtLXJvdycpKTtcblx0RE9NLmFwcGVuZChuYW1lUm93LCAkKCdzcGFuLmF1dG9tYXRpb24tZm9ybS1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5uYW1lJywgXCJOYW1lXCIpKSk7XG5cdGNvbnN0IG5hbWVJbnB1dENvbnRhaW5lciA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnLmF1dG9tYXRpb24tZm9ybS1pbnB1dC1ob3N0JykpO1xuXHRjb25zdCBuYW1lSW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IElucHV0Qm94KG5hbWVJbnB1dENvbnRhaW5lciwgY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5uYW1lUGxhY2Vob2xkZXInLCBcImUuZy4gTW9ybmluZyBzdGFuZHVwIG5vdGVzXCIpLFxuXHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5uYW1lJywgXCJOYW1lXCIpLFxuXHR9KSk7XG5cdG5hbWVJbnB1dC52YWx1ZSA9IHN0YXRlLm5hbWU7XG5cdGRpc3Bvc2FibGVzLmFkZChuYW1lSW5wdXQub25EaWRDaGFuZ2UodmFsdWUgPT4ge1xuXHRcdHN0YXRlLm5hbWUgPSB2YWx1ZTtcblx0XHRyZXZhbGlkYXRlKCk7XG5cdH0pKTtcblxuXHRjb25zdCBzY2hlZHVsZVJvdyA9IERPTS5hcHBlbmQoZm9ybSwgJCgnLmF1dG9tYXRpb24tZm9ybS1yb3cuYXV0b21hdGlvbi1mb3JtLXNjaGVkdWxlLXJvdycpKTtcblx0Y29uc3QgdXNlQ3VzdG9tRHJhd24gPSAhaGFzTmF0aXZlQ29udGV4dE1lbnUoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IGludGVydmFsR3JvdXAgPSBET00uYXBwZW5kKHNjaGVkdWxlUm93LCAkKCcuYXV0b21hdGlvbi1mb3JtLXNjaGVkdWxlLWdyb3VwJykpO1xuXHRET00uYXBwZW5kKGludGVydmFsR3JvdXAsICQoJ3NwYW4uYXV0b21hdGlvbi1mb3JtLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmludGVydmFsJywgXCJTY2hlZHVsZVwiKSkpO1xuXHRjb25zdCBpbnRlcnZhbE9wdGlvbnM6IElTZWxlY3RPcHRpb25JdGVtW10gPSBJTlRFUlZBTFMubWFwKGl0ZW0gPT4gKHsgdGV4dDogaXRlbS5sYWJlbCB9KSk7XG5cdGNvbnN0IGludGVydmFsSW5kZXggPSBNYXRoLm1heCgwLCBJTlRFUlZBTFMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS52YWx1ZSA9PT0gc3RhdGUuaW50ZXJ2YWwpKTtcblx0Y29uc3QgaW50ZXJ2YWxTZWxlY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlbGVjdEJveChcblx0XHRpbnRlcnZhbE9wdGlvbnMsXG5cdFx0aW50ZXJ2YWxJbmRleCxcblx0XHRjb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0ZGVmYXVsdFNlbGVjdEJveFN0eWxlcyxcblx0XHR7IGFyaWFMYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5pbnRlcnZhbCcsIFwiU2NoZWR1bGVcIiksIHVzZUN1c3RvbURyYXduIH0sXG5cdCkpO1xuXHRjb25zdCBpbnRlcnZhbFNlbGVjdENvbnRhaW5lciA9IERPTS5hcHBlbmQoaW50ZXJ2YWxHcm91cCwgJCgnLmF1dG9tYXRpb24tZm9ybS1zY2hlZHVsZS1zZWxlY3QtY29udGFpbmVyJykpO1xuXHRpbnRlcnZhbFNlbGVjdC5yZW5kZXIoaW50ZXJ2YWxTZWxlY3RDb250YWluZXIpO1xuXG5cdGNvbnN0IHRpbWVHcm91cCA9IERPTS5hcHBlbmQoc2NoZWR1bGVSb3csICQoJy5hdXRvbWF0aW9uLWZvcm0tc2NoZWR1bGUtZ3JvdXAuYXV0b21hdGlvbi1mb3JtLXRpbWUtZ3JvdXAnKSk7XG5cdERPTS5hcHBlbmQodGltZUdyb3VwLCAkKCdzcGFuLmF1dG9tYXRpb24tZm9ybS1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS50aW1lJywgXCJUaW1lXCIpKSk7XG5cdGNvbnN0IHRpbWVPcHRpb25zID0gYnVpbGRUaW1lT3B0aW9ucygpO1xuXHRjb25zdCBpbml0aWFsVGltZUluZGV4ID0gbmVhcmVzdFRpbWVPcHRpb25JbmRleChzdGF0ZS5ob3VyLCBzdGF0ZS5taW51dGUpO1xuXHRzdGF0ZS5ob3VyID0gdGltZU9wdGlvbnNbaW5pdGlhbFRpbWVJbmRleF0uaG91cjtcblx0c3RhdGUubWludXRlID0gdGltZU9wdGlvbnNbaW5pdGlhbFRpbWVJbmRleF0ubWludXRlO1xuXHRjb25zdCB0aW1lU2VsZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0dGltZU9wdGlvbnMubWFwKG9wdCA9PiAoeyB0ZXh0OiBvcHQubGFiZWwgfSBzYXRpc2ZpZXMgSVNlbGVjdE9wdGlvbkl0ZW0pKSxcblx0XHRpbml0aWFsVGltZUluZGV4LFxuXHRcdGNvbnRleHRWaWV3U2VydmljZSxcblx0XHRkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLFxuXHRcdHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLnRpbWUnLCBcIlRpbWVcIiksIHVzZUN1c3RvbURyYXduIH0sXG5cdCkpO1xuXHRjb25zdCB0aW1lU2VsZWN0Q29udGFpbmVyID0gRE9NLmFwcGVuZCh0aW1lR3JvdXAsICQoJy5hdXRvbWF0aW9uLWZvcm0tc2NoZWR1bGUtc2VsZWN0LWNvbnRhaW5lci5hdXRvbWF0aW9uLWZvcm0tdGltZS1zZWxlY3QtY29udGFpbmVyJykpO1xuXHR0aW1lU2VsZWN0LnJlbmRlcih0aW1lU2VsZWN0Q29udGFpbmVyKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHRpbWVTZWxlY3Qub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0Y29uc3Qgb3B0ID0gdGltZU9wdGlvbnNbZS5pbmRleF07XG5cdFx0c3RhdGUuaG91ciA9IG9wdC5ob3VyO1xuXHRcdHN0YXRlLm1pbnV0ZSA9IG9wdC5taW51dGU7XG5cdH0pKTtcblxuXHRjb25zdCBkYXlHcm91cCA9IERPTS5hcHBlbmQoc2NoZWR1bGVSb3csICQoJy5hdXRvbWF0aW9uLWZvcm0tc2NoZWR1bGUtZ3JvdXAuYXV0b21hdGlvbi1mb3JtLWRheS1ncm91cCcpKTtcblx0RE9NLmFwcGVuZChkYXlHcm91cCwgJCgnc3Bhbi5hdXRvbWF0aW9uLWZvcm0tbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uZGF5JywgXCJEYXkgb2Ygd2Vla1wiKSkpO1xuXHRjb25zdCBkYXlPcHRpb25zOiBJU2VsZWN0T3B0aW9uSXRlbVtdID0gREFZU19PRl9XRUVLLm1hcChkID0+ICh7IHRleHQ6IGQgfSkpO1xuXHRjb25zdCBkYXlTZWxlY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlbGVjdEJveChcblx0XHRkYXlPcHRpb25zLFxuXHRcdE1hdGgubWluKE1hdGgubWF4KHN0YXRlLmRheSwgMCksIERBWVNfT0ZfV0VFSy5sZW5ndGggLSAxKSxcblx0XHRjb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0ZGVmYXVsdFNlbGVjdEJveFN0eWxlcyxcblx0XHR7IGFyaWFMYWJlbDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5kYXknLCBcIkRheSBvZiB3ZWVrXCIpLCB1c2VDdXN0b21EcmF3biB9LFxuXHQpKTtcblx0Y29uc3QgZGF5U2VsZWN0Q29udGFpbmVyID0gRE9NLmFwcGVuZChkYXlHcm91cCwgJCgnLmF1dG9tYXRpb24tZm9ybS1zY2hlZHVsZS1zZWxlY3QtY29udGFpbmVyJykpO1xuXHRkYXlTZWxlY3QucmVuZGVyKGRheVNlbGVjdENvbnRhaW5lcik7XG5cdGRpc3Bvc2FibGVzLmFkZChkYXlTZWxlY3Qub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0c3RhdGUuZGF5ID0gZS5pbmRleDtcblx0fSkpO1xuXG5cdGNvbnN0IGFwcGx5SW50ZXJ2YWxWaXNpYmlsaXR5ID0gKCkgPT4ge1xuXHRcdGNvbnN0IHNob3dUaW1lID0gc3RhdGUuaW50ZXJ2YWwgPT09ICdkYWlseScgfHwgc3RhdGUuaW50ZXJ2YWwgPT09ICd3ZWVrbHknO1xuXHRcdGNvbnN0IHNob3dEYXkgPSBzdGF0ZS5pbnRlcnZhbCA9PT0gJ3dlZWtseSc7XG5cdFx0dGltZUdyb3VwLnN0eWxlLmRpc3BsYXkgPSBzaG93VGltZSA/ICcnIDogJ25vbmUnO1xuXHRcdGRheUdyb3VwLnN0eWxlLmRpc3BsYXkgPSBzaG93RGF5ID8gJycgOiAnbm9uZSc7XG5cdH07XG5cdGFwcGx5SW50ZXJ2YWxWaXNpYmlsaXR5KCk7XG5cdGRpc3Bvc2FibGVzLmFkZChpbnRlcnZhbFNlbGVjdC5vbkRpZFNlbGVjdChlID0+IHtcblx0XHRzdGF0ZS5pbnRlcnZhbCA9IElOVEVSVkFMU1tlLmluZGV4XS52YWx1ZTtcblx0XHRhcHBseUludGVydmFsVmlzaWJpbGl0eSgpO1xuXHR9KSk7XG5cblx0Ly8gVGhlIHBpY2tlciBpcyBhdXRob3JpdGF0aXZlIGZvciB0aGUgc2Vzc2lvbiB0eXBlXG5cdGNvbnN0IGlzb2xhdGlvbk1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbChzdGF0ZSk7XG5cdGNvbnN0IHdvcmtzcGFjZUNvbnRyb2xzVmlzaWJsZSA9IGRlcml2ZWQocmVhZGVyID0+ICFpc29sYXRpb25Nb2RlbC5pc1F1aWNrQ2hhdE9icy5yZWFkKHJlYWRlcikpO1xuXHRjb25zdCBzZXNzaW9uVHlwZVBpY2tlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2JpbGVTZXNzaW9uVHlwZVBpY2tlciwgY29uc3RPYnNlcnZhYmxlPElTZXNzaW9uIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpLCB7IHBlcnNpc3RTZWxlY3Rpb246IGZhbHNlLCB0ZWxlbWV0cnlTb3VyY2U6ICdBdXRvbWF0aW9uU2Vzc2lvblR5cGVQaWNrZXInLCBzaG93Q2hldnJvbjogZmFsc2UgfSkpO1xuXHRzZXNzaW9uVHlwZVBpY2tlci5zZXRRdWlja0NoYXRTb3VyY2UoaXNvbGF0aW9uTW9kZWwuaXNRdWlja0NoYXRPYnMpO1xuXHRzZXNzaW9uVHlwZVBpY2tlci5zZXRGb2xkZXJTb3VyY2UoaXNvbGF0aW9uTW9kZWwuZm9sZGVyVXJpT2JzLCB7XG5cdFx0aW5pdGlhbFBpY2s6IHN0YXRlLnNlc3Npb25UeXBlSWRcblx0XHRcdD8geyBwcm92aWRlcklkOiBzdGF0ZS5wcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBzdGF0ZS5zZXNzaW9uVHlwZUlkIH1cblx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdHByZXNlcnZlVW5hdmFpbGFibGVJbml0aWFsUGljazogdHJ1ZSxcblx0fSk7XG5cdC8vIFRoZSBkaWFsb2cgaGFzIG5vIHNlc3Npb24sIHNvIHRoZSBpbnB1dCBwYXJ0IHJlYWRzIHRoZSBhY3RpdmUgc2Vzc2lvbiB0eXBlIGZyb20gdGhlIHBpY2tlciB2aWEgdGhpcyBkZWxlZ2F0ZS5cblx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxBZ2VudFNlc3Npb25UYXJnZXQ+KCkpO1xuXHRjb25zdCBvbkRpZENoYW5nZVNlc3Npb25UYXJnZXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGNvbnN0IHNlc3Npb25UeXBlRGVsZWdhdGU6IElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlID0ge1xuXHRcdGdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcjogKCkgPT4gc2Vzc2lvblR5cGVQaWNrZXIubW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUuZ2V0KCksXG5cdFx0b25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXI6IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGUuZXZlbnQsXG5cdH07XG5cdGNvbnN0IHN5bmNTdGF0ZUZyb21QaWNrZXIgPSAoKSA9PiB7XG5cdFx0Y29uc3QgcGljayA9IHNlc3Npb25UeXBlUGlja2VyLnNlbGVjdGVkUGljaztcblx0XHRzdGF0ZS5wcm92aWRlcklkID0gcGljaz8ucHJvdmlkZXJJZDtcblx0XHRzdGF0ZS5zZXNzaW9uVHlwZUlkID0gcGljaz8uc2Vzc2lvblR5cGVJZDtcblx0XHRvbkRpZENoYW5nZVNlc3Npb25UYXJnZXQuZmlyZSgpO1xuXHR9O1xuXHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IG1vZGVsVGFyZ2V0ID0gc2Vzc2lvblR5cGVQaWNrZXIubW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUucmVhZChyZWFkZXIpO1xuXHRcdGlmIChtb2RlbFRhcmdldCkge1xuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uVHlwZS5maXJlKG1vZGVsVGFyZ2V0KTtcblx0XHR9XG5cdH0pKTtcblx0Ly8gU2VlZCBzdGF0ZSBmcm9tIHRoZSBwaWNrZXIncyBpbml0aWFsIGRlZmF1bHQgKGVkaXQ6IHNhdmVkIHR5cGU7IGNyZWF0ZTogZm9sZGVyIGRlZmF1bHQpLlxuXHRzeW5jU3RhdGVGcm9tUGlja2VyKCk7XG5cdC8vIENvdmVycyBib3RoIGV4cGxpY2l0IHVzZXIgcGlja3MgYW5kIHJlY29tcHV0ZXMgKGUuZy4gYW4gYWdlbnQgaG9zdFxuXHQvLyBhZHZlcnRpc2luZyBpdHMgc2Vzc2lvbiB0eXBlcyBhZnRlciB0aGUgZGlhbG9nIG9wZW5lZCksIHNvIHRoZSBzYXZlZFxuXHQvLyBhdXRvbWF0aW9uIGFsd2F5cyBtYXRjaGVzIHRoZSBjaGlwIHRoZSBwaWNrZXIgZGlzcGxheXMuXG5cblx0Y29uc3Qgd29ya3NwYWNlUGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZUF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLCB7XG5cdFx0cmVzdG9yZUZyb21TZXNzaW9uczogZmFsc2UsXG5cdFx0Y2FuU2VsZWN0V29ya3NwYWNlOiAoZm9sZGVyVXJpLCBwcmVmZXJyZWRQcm92aWRlcklkKSA9PlxuXHRcdFx0Y2FuU2VsZWN0QXV0b21hdGlvbldvcmtzcGFjZShmb2xkZXJVcmksIHByZWZlcnJlZFByb3ZpZGVySWQsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UpLFxuXHR9KSk7XG5cdHdvcmtzcGFjZVBpY2tlci5zZXRUYXJnZXRNb2RlbChpc29sYXRpb25Nb2RlbCk7XG5cdHdvcmtzcGFjZVBpY2tlci5zZXRMYXlvdXRTZXJ2aWNlKGxheW91dFNlcnZpY2UpO1xuXG5cdGNvbnN0IGF1dG9tYXRpb25TZXNzaW9uRHJhZnRTeW5jaHJvbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEF1dG9tYXRpb25TZXNzaW9uRHJhZnRTeW5jaHJvbml6ZXIoXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHQoZm9sZGVyVXJpLCBwcmVmZXJyZWRQcm92aWRlcklkKSA9PiBjYW5TZWxlY3RBdXRvbWF0aW9uV29ya3NwYWNlKGZvbGRlclVyaSwgcHJlZmVycmVkUHJvdmlkZXJJZCwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSksXG5cdFx0ZXJyb3IgPT4gbG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25EaWFsb2ddIEZhaWxlZCB0byBzeW5jaHJvbml6ZSB0aGUgYXV0b21hdGlvbiBzZXNzaW9uIGRyYWZ0LicsIGVycm9yKSxcblx0KSk7XG5cdGNvbnN0IHVwZGF0ZUF1dG9tYXRpb25TZXNzaW9uVGFyZ2V0ID0gKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IGlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaU9icy5nZXQoKTtcblx0XHRjb25zdCBwaWNrID0gc2Vzc2lvblR5cGVQaWNrZXIuc2VsZWN0ZWRQaWNrO1xuXHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gaXNvbGF0aW9uTW9kZWwuaXNRdWlja0NoYXRPYnMuZ2V0KCk7XG5cdFx0aWYgKCFwaWNrIHx8IChpc1F1aWNrQ2hhdCAmJiAhcGljay5wcm92aWRlcklkKSB8fCAoIWlzUXVpY2tDaGF0ICYmICFmb2xkZXJVcmkpKSB7XG5cdFx0XHRhdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U3luY2hyb25pemVyLnVwZGF0ZSh1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaXNRdWlja0NoYXQpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVySWQgPSBwaWNrLnByb3ZpZGVySWQ7XG5cdFx0XHRpZiAocHJvdmlkZXJJZCkge1xuXHRcdFx0XHRhdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U3luY2hyb25pemVyLnVwZGF0ZSh7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBwaWNrLnNlc3Npb25UeXBlSWQgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChmb2xkZXJVcmkpIHtcblx0XHRcdGF1dG9tYXRpb25TZXNzaW9uRHJhZnRTeW5jaHJvbml6ZXIudXBkYXRlKHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaSwgcHJvdmlkZXJJZDogcGljay5wcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBwaWNrLnNlc3Npb25UeXBlSWQgfSk7XG5cdFx0fVxuXHR9O1xuXHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvblR5cGVQaWNrZXIub25EaWRDaGFuZ2VTZWxlY3RlZFBpY2soKCkgPT4ge1xuXHRcdHN5bmNTdGF0ZUZyb21QaWNrZXIoKTtcblx0XHR1cGRhdGVBdXRvbWF0aW9uU2Vzc2lvblRhcmdldCgpO1xuXHRcdHJldmFsaWRhdGUoKTtcblx0fSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB1cGRhdGVBdXRvbWF0aW9uU2Vzc2lvblRhcmdldCgpKSk7XG5cblx0aWYgKHN0YXRlLmZvbGRlclVyaSkge1xuXHRcdHdvcmtzcGFjZVBpY2tlci5zZXRTZWxlY3RlZFdvcmtzcGFjZShzdGF0ZS5mb2xkZXJVcmksIHsgZmlyZUV2ZW50OiBmYWxzZSwgcGVyc2lzdDogZmFsc2UgfSk7XG5cdH1cblxuXHRkaXNwb3NhYmxlcy5hZGQod29ya3NwYWNlUGlja2VyLm9uRGlkU2VsZWN0V29ya3NwYWNlKHVyaSA9PiB7XG5cdFx0aWYgKGlzb2xhdGlvbk1vZGVsLnNldFdvcmtzcGFjZSh1cmkpKSB7XG5cdFx0XHR1cGRhdGVBdXRvbWF0aW9uU2Vzc2lvblRhcmdldCgpO1xuXHRcdFx0cmV2YWxpZGF0ZSgpO1xuXHRcdH1cblx0fSkpO1xuXG5cdGlmICghc3RhdGUuaXNRdWlja0NoYXQgJiYgIXN0YXRlLmZvbGRlclVyaSAmJiB3b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmkpIHtcblx0XHRpc29sYXRpb25Nb2RlbC5zZXRXb3Jrc3BhY2Uod29ya3NwYWNlUGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpKTtcblx0fVxuXG5cdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0aXNvbGF0aW9uTW9kZWwuaXNRdWlja0NoYXRPYnMucmVhZChyZWFkZXIpO1xuXHRcdHVwZGF0ZUF1dG9tYXRpb25TZXNzaW9uVGFyZ2V0KCk7XG5cdFx0cmV2YWxpZGF0ZSgpO1xuXHR9KSk7XG5cblx0Y29uc3QgcHJvbXB0Um93ID0gRE9NLmFwcGVuZChmb3JtLCAkKCcuYXV0b21hdGlvbi1mb3JtLXJvdycpKTtcblx0RE9NLmFwcGVuZChwcm9tcHRSb3csICQoJ3NwYW4uYXV0b21hdGlvbi1mb3JtLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLnByb21wdCcsIFwiUHJvbXB0XCIpKSk7XG5cdGNvbnN0IHByb21wdEhvc3QgPSBET00uYXBwZW5kKHByb21wdFJvdywgJCgnLmF1dG9tYXRpb24tZm9ybS1wcm9tcHQtaG9zdC5pbnRlcmFjdGl2ZS1zZXNzaW9uJykpO1xuXG5cdGNvbnN0IGNoYXRJbnB1dFN0eWxlczogSUNoYXRJbnB1dFN0eWxlcyA9IHtcblx0XHRvdmVybGF5QmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1pbnB1dC1iYWNrZ3JvdW5kKScsXG5cdFx0bGlzdEZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknLFxuXHRcdGxpc3RCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWlucHV0LWJhY2tncm91bmQpJyxcblx0fTtcblxuXHRjb25zdCBjaGF0SW5wdXRPcHRpb25zOiBJQ2hhdElucHV0UGFydE9wdGlvbnMgPSB7XG5cdFx0cmVuZGVyRm9sbG93dXBzOiBmYWxzZSxcblx0XHRyZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0OiBmYWxzZSxcblx0XHRyZW5kZXJXb3JraW5nU2V0OiBmYWxzZSxcblx0XHRlbmFibGVJbXBsaWNpdENvbnRleHQ6IGZhbHNlLFxuXHRcdHN1cHBvcnRzQ2hhbmdpbmdNb2RlczogdHJ1ZSxcblx0XHRoaWRlQ3VzdG9tQ2hhdE1vZGVzOiB0cnVlLFxuXHRcdHN1cHByZXNzTW9kZVByZWZlcnJlZE1vZGVsOiB0cnVlLFxuXHRcdHN1cHByZXNzTW9kZWxQZXJzaXN0ZW5jZTogdHJ1ZSxcblx0XHRtZW51czoge1xuXHRcdFx0ZXhlY3V0ZVRvb2xiYXI6IE1lbnVJZC5BdXRvbWF0aW9uc0RpYWxvZ0lucHV0LFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnYXV0b21hdGlvbnMuZGlhbG9nJyxcblx0XHR9LFxuXHRcdHdpZGdldFZpZXdLaW5kVGFnOiAnYXV0b21hdGlvbnMtZGlhbG9nJyxcblx0XHRpbnB1dEVkaXRvck1pbkxpbmVzOiAzLFxuXHRcdC8vIFRoZSBkaWFsb2cgcmVuZGVycyB0aGUgY29tcG9zZXIgZmx1c2ggd2l0aCBpdHMgZm9ybSBjb2x1bW4gKHRoZVxuXHRcdC8vIGAuaW50ZXJhY3RpdmUtaW5wdXQtcGFydGAgbWFyZ2luIGlzIHplcm9lZCBpbiBDU1MpLCBzbyB0aGVyZSBpcyBub1xuXHRcdC8vIG91dGVyIGhvcml6b250YWwgZ3V0dGVyLiBXaXRob3V0IHRoaXMsIENoYXRJbnB1dFBhcnQgd291bGQgc3RpbGxcblx0XHQvLyByZXNlcnZlIHRoZSBkZWZhdWx0IDI0cHggbWFyZ2luIGFuZCBsYXkgdGhlIGVkaXRvciBvdXQgdG9vIG5hcnJvdyxcblx0XHQvLyBsZWF2aW5nIGl0cyBzY3JvbGxiYXIgZmxvYXRpbmcgfjI0cHggaW4gZnJvbSB0aGUgcmlnaHQgd2FsbC5cblx0XHRpbnB1dFBhcnRIb3Jpem9udGFsUGFkZGluZzogMCxcblx0XHRzZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlOiBzZXNzaW9uVHlwZURlbGVnYXRlLFxuXHRcdHNlY29uZGFyeVRvb2xiYXJBY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBpdGVtT3B0aW9ucykgPT4ge1xuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQVVUT01BVElPTlNfSEFSTkVTU19DSElQX0FDVElPTl9JRCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEF1dG9tYXRpb25QaWNrZXJBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGNvbnRhaW5lciA9PiBzZXNzaW9uVHlwZVBpY2tlci5yZW5kZXIoY29udGFpbmVyKSwgdW5kZWZpbmVkLCBpdGVtT3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWN0aW9uLmlkID09PSBBVVRPTUFUSU9OU19XT1JLU1BBQ0VfUElDS0VSX0FDVElPTl9JRCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEF1dG9tYXRpb25QaWNrZXJBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGNvbnRhaW5lciA9PiB7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtaW5wdXQtcGlja2VyLWl0ZW0nKTtcblx0XHRcdFx0XHR3b3Jrc3BhY2VQaWNrZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0XHRcdH0sIHVuZGVmaW5lZCwgaXRlbU9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQVVUT01BVElPTlNfSVNPTEFUSU9OX0dST1VQX0FDVElPTl9JRCkge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0QXV0b21hdGlvbklzb2xhdGlvbkdyb3VwQWN0aW9uVmlld0l0ZW0sXG5cdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdHN0YXRlLFxuXHRcdFx0XHRcdGlzb2xhdGlvbk1vZGVsLFxuXHRcdFx0XHRcdGlzb2xhdGlvbk1vZGVsLmZvbGRlclVyaU9icyxcblx0XHRcdFx0XHRvbkRpZENoYW5nZVNlc3Npb25UYXJnZXQuZXZlbnQsXG5cdFx0XHRcdFx0cmV2YWxpZGF0ZSxcblx0XHRcdFx0XHRpdGVtT3B0aW9ucyxcblx0XHRcdFx0XHR3b3Jrc3BhY2VDb250cm9sc1Zpc2libGUsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9LFxuXHR9O1xuXG5cdC8vIE1pbmltYWwgc3Vic2V0IG9mIElDaGF0V2lkZ2V0IG5lZWRlZCBieSBDaGF0SW5wdXRQYXJ0IGluIGRpYWxvZyBjb250ZXh0XG5cdHR5cGUgSU1pbmltYWxDaGF0V2lkZ2V0ID0gUGljazxJQ2hhdFdpZGdldCwgJ29uRGlkQ2hhbmdlVmlld01vZGVsJyB8ICd2aWV3TW9kZWwnIHwgJ2NvbnRyaWJzJyB8ICdsb2NhdGlvbicgfCAndmlld0NvbnRleHQnIHwgJ2xvY2tUb0NvZGluZ0FnZW50JyB8ICd1bmxvY2tGcm9tQ29kaW5nQWdlbnQnPjtcblxuXHRjb25zdCBzdHViV2lkZ2V0OiBJTWluaW1hbENoYXRXaWRnZXQgPSB7XG5cdFx0b25EaWRDaGFuZ2VWaWV3TW9kZWw6IEV2ZW50Lk5vbmUsXG5cdFx0dmlld01vZGVsOiB1bmRlZmluZWQsXG5cdFx0Y29udHJpYnM6IFtdLFxuXHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdHZpZXdDb250ZXh0OiB7fSxcblx0XHRsb2NrVG9Db2RpbmdBZ2VudDogKCkgPT4geyB9LFxuXHRcdHVubG9ja0Zyb21Db2RpbmdBZ2VudDogKCkgPT4geyB9LFxuXHR9O1xuXG5cdC8vIEJpbmQgY29udGV4dCBrZXlzIHJlcXVpcmVkIGJ5IGNoYXQgaW5wdXQgdG9vbGJhciBgd2hlbmAgY2xhdXNlcy5cblx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHByb21wdEhvc3QpKTtcblx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbi5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0Q2hhdENvbnRleHRLZXlzLmluQXV0b21hdGlvbnNEaWFsb2cuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBzY29wZWRDb250ZXh0S2V5U2VydmljZV0pKVxuXHQpO1xuXG5cdGNvbnN0IGNoYXRJbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChcblx0XHRzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRQYXJ0LCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjaGF0SW5wdXRPcHRpb25zLCBjaGF0SW5wdXRTdHlsZXMsIGZhbHNlKSxcblx0KTtcblx0Y2hhdElucHV0LnJlbmRlcihwcm9tcHRIb3N0LCBpbml0aWFsUHJvbXB0LCBzdHViV2lkZ2V0IGFzIElDaGF0V2lkZ2V0KTtcblx0Y2hhdElucHV0LmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS5wcm9tcHQucGxhY2Vob2xkZXInLCBcIkRlc2NyaWJlIHdoYXQgeW91IHdhbnQgdG8gYXV0b21hdGVcIikgfSk7XG5cblx0aWYgKGluaXRpYWxNb2RlKSB7XG5cdFx0Y29uc3QgZ2V0VW5maWx0ZXJlZEluaXRpYWxNb2RlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZXMgPSBjaGF0SW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5nZXQoKTtcblx0XHRcdHJldHVybiBtb2Rlcy5maW5kTW9kZUJ5SWQoaW5pdGlhbE1vZGUpID8/IG1vZGVzLmZpbmRNb2RlQnlOYW1lKGluaXRpYWxNb2RlKTtcblx0XHR9O1xuXHRcdGNvbnN0IGlzSGlkZGVuQ3VzdG9tSW5pdGlhbE1vZGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlID0gZ2V0VW5maWx0ZXJlZEluaXRpYWxNb2RlKCk7XG5cdFx0XHRyZXR1cm4gISFtb2RlICYmIGNoYXRJbnB1dE9wdGlvbnMuaGlkZUN1c3RvbUNoYXRNb2RlcyAmJiAhaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW4obW9kZSwgcHJvZHVjdFNlcnZpY2UpO1xuXHRcdH07XG5cblx0XHRpZiAoaXNIaWRkZW5DdXN0b21Jbml0aWFsTW9kZSgpKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBbQXV0b21hdGlvbkRpYWxvZ10gU2tpcHBpbmcgaGlkZGVuIGN1c3RvbSBpbml0aWFsIG1vZGUgXCIke2luaXRpYWxNb2RlfVwiLiBGYWxsaW5nIGJhY2sgdG8gdGhlIGRlZmF1bHQgbW9kZS5gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hhdElucHV0LnNldENoYXRNb2RlKGluaXRpYWxNb2RlLCAvKiBzdG9yZVNlbGVjdGlvbiAqLyBmYWxzZSk7XG5cdFx0fVxuXHRcdC8vIFJldHJ5IG9uIGNvbGQtc3RhcnQgd2hlbiBleHRlbnNpb24tY29udHJpYnV0ZWQgbW9kZXMgYXJyaXZlIGxhdGUuXG5cdFx0aWYgKGNoYXRJbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKS5pZCAhPT0gaW5pdGlhbE1vZGUgJiYgIWlzSGlkZGVuQ3VzdG9tSW5pdGlhbE1vZGUoKSkge1xuXHRcdFx0Y29uc3QgYmFzZWxpbmUgPSBjaGF0SW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkuaWQ7XG5cdFx0XHRjb25zdCByZXRyeSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRcdFx0Y29uc3QgdHJ5QXBwbHkgPSAoKSA9PiB7XG5cdFx0XHRcdGlmIChjaGF0SW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkuaWQgIT09IGJhc2VsaW5lKSB7XG5cdFx0XHRcdFx0cmV0cnkuY2xlYXIoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzSGlkZGVuQ3VzdG9tSW5pdGlhbE1vZGUoKSkge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYFtBdXRvbWF0aW9uRGlhbG9nXSBTa2lwcGluZyBoaWRkZW4gY3VzdG9tIGluaXRpYWwgbW9kZSBcIiR7aW5pdGlhbE1vZGV9XCIgYWZ0ZXIgbW9kZXMgdXBkYXRlZC4gRmFsbGluZyBiYWNrIHRvIHRoZSBkZWZhdWx0IG1vZGUuYCk7XG5cdFx0XHRcdFx0cmV0cnkuY2xlYXIoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZXMgPSBjaGF0SW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5nZXQoKTtcblx0XHRcdFx0aWYgKG1vZGVzLmZpbmRNb2RlQnlJZChpbml0aWFsTW9kZSkgfHwgbW9kZXMuZmluZE1vZGVCeU5hbWUoaW5pdGlhbE1vZGUpKSB7XG5cdFx0XHRcdFx0Y2hhdElucHV0LnNldENoYXRNb2RlKGluaXRpYWxNb2RlLCAvKiBzdG9yZVNlbGVjdGlvbiAqLyBmYWxzZSk7XG5cdFx0XHRcdFx0aWYgKGNoYXRJbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKS5pZCA9PT0gaW5pdGlhbE1vZGUpIHtcblx0XHRcdFx0XHRcdHJldHJ5LmNsZWFyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0cmV0cnkudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVzID0gY2hhdElucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKG1vZGVzLm9uRGlkQ2hhbmdlKHRyeUFwcGx5KSk7XG5cdFx0XHRcdHRyeUFwcGx5KCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0aWYgKGluaXRpYWxQZXJtaXNzaW9uTGV2ZWwgJiYgaXNDaGF0UGVybWlzc2lvbkxldmVsKGluaXRpYWxQZXJtaXNzaW9uTGV2ZWwpKSB7XG5cdFx0Y2hhdElucHV0LnNldFBlcm1pc3Npb25MZXZlbChpbml0aWFsUGVybWlzc2lvbkxldmVsKTtcblx0fVxuXHQvLyBPbiBlZGl0LCBhcHBseSB0aGUgc2F2ZWQgbW9kZWwgd2l0aCBsYXRlLWFycml2YWwgcmV0cnkgaWYgbmVlZGVkLlxuXHRjaGF0SW5wdXQucmVzZXRMYW5ndWFnZU1vZGVsVG9EZWZhdWx0KCk7XG5cblx0Y29uc3QgcmVzb2x2ZUluaXRpYWxNb2RlbElkID0gKCkgPT4gaW5pdGlhbE1vZGVsSWQgPyByZXNvbHZlQXV0b21hdGlvbk1vZGVsSWRlbnRpZmllcihcblx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0aW5pdGlhbE1vZGVsSWQsXG5cdFx0c3RhdGUuc2Vzc2lvblR5cGVJZCxcblx0XHRzZXNzaW9uVHlwZVBpY2tlci5tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZS5nZXQoKSxcblx0KSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgcmVzb2x2ZWRJbml0aWFsTW9kZWxJZCA9IHJlc29sdmVJbml0aWFsTW9kZWxJZCgpO1xuXHRpZiAocmVzb2x2ZWRJbml0aWFsTW9kZWxJZCAmJiAhY2hhdElucHV0LnN3aXRjaE1vZGVsQnlJZGVudGlmaWVyKHJlc29sdmVkSW5pdGlhbE1vZGVsSWQsIC8qIHN0b3JlU2VsZWN0aW9uICovIGZhbHNlKSkge1xuXHRcdGNvbnN0IGJhc2VsaW5lID0gY2hhdElucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRjb25zdCByZXRyeSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRcdHJldHJ5LnZhbHVlID0gRXZlbnQuYW55KFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMsXG5cdFx0XHRFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KHNlc3Npb25UeXBlUGlja2VyLm1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlKSxcblx0XHQpKCgpID0+IHtcblx0XHRcdGlmIChjaGF0SW5wdXQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyICE9PSBiYXNlbGluZSkge1xuXHRcdFx0XHRyZXRyeS5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbElkZW50aWZpZXIgPSByZXNvbHZlSW5pdGlhbE1vZGVsSWQoKTtcblx0XHRcdGlmIChtb2RlbElkZW50aWZpZXIgJiYgY2hhdElucHV0LnN3aXRjaE1vZGVsQnlJZGVudGlmaWVyKG1vZGVsSWRlbnRpZmllciwgLyogc3RvcmVTZWxlY3Rpb24gKi8gZmFsc2UpKSB7XG5cdFx0XHRcdHJldHJ5LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NhYmxlcy5hZGQoY2hhdElucHV0LmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRyZXZhbGlkYXRlKCk7XG5cdH0pKTtcblxuXHRjaGF0SW5wdXQubGF5b3V0KDU4MCk7XG5cdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRpZiAoIWRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdGNoYXRJbnB1dC5sYXlvdXQoNTgwKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBET00uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdhdXRvbWF0aW9uRGlhbG9nLnByb21wdEhvc3QnLCBlbnRyaWVzID0+IHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IHdpZHRoID0gZW50cnkuY29udGVudFJlY3Qud2lkdGg7XG5cdFx0XHRpZiAod2lkdGggPiAwKSB7XG5cdFx0XHRcdGNoYXRJbnB1dC5sYXlvdXQod2lkdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSwgRE9NLmdldFdpbmRvdyhwcm9tcHRIb3N0KSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQocmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShwcm9tcHRIb3N0KSk7XG5cblx0Y29uc3QgZW5hYmxlZFJvdyA9IERPTS5hcHBlbmQoZm9ybSwgJCgnLmF1dG9tYXRpb24tZm9ybS1yb3cuYXV0b21hdGlvbi1mb3JtLWNoZWNrYm94LXJvdycpKTtcblx0Y29uc3QgZW5hYmxlZExhYmVsVGV4dCA9IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uZW5hYmxlZCcsIFwiRW5hYmxlZCAodGhlIHNjaGVkdWxlciBydW5zIHRoaXMgYXV0b21hdGlvbiB3aGVuIGR1ZSlcIik7XG5cdGNvbnN0IGVuYWJsZWRDaGVja2JveCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3goZW5hYmxlZExhYmVsVGV4dCwgc3RhdGUuZW5hYmxlZCwgZGVmYXVsdENoZWNrYm94U3R5bGVzKSk7XG5cdERPTS5hcHBlbmQoZW5hYmxlZFJvdywgZW5hYmxlZENoZWNrYm94LmRvbU5vZGUpO1xuXHRjb25zdCBlbmFibGVkTGFiZWwgPSBET00uYXBwZW5kKGVuYWJsZWRSb3csICQoJ3NwYW4uYXV0b21hdGlvbi1mb3JtLWNoZWNrYm94LWxhYmVsJywgdW5kZWZpbmVkLCBlbmFibGVkTGFiZWxUZXh0KSk7XG5cdGNvbnN0IHNldEVuYWJsZWQgPSAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRpZiAoZW5hYmxlZENoZWNrYm94LmNoZWNrZWQgIT09IHZhbHVlKSB7XG5cdFx0XHRlbmFibGVkQ2hlY2tib3guY2hlY2tlZCA9IHZhbHVlO1xuXHRcdH1cblx0XHRzdGF0ZS5lbmFibGVkID0gdmFsdWU7XG5cdH07XG5cdGRpc3Bvc2FibGVzLmFkZChlbmFibGVkQ2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdHN0YXRlLmVuYWJsZWQgPSBlbmFibGVkQ2hlY2tib3guY2hlY2tlZDtcblx0fSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGVuYWJsZWRMYWJlbCwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdHNldEVuYWJsZWQoIWVuYWJsZWRDaGVja2JveC5jaGVja2VkKTtcblx0fSkpO1xuXG5cdHJldHVybiB7XG5cdFx0Z2V0UHJvbXB0OiAoKSA9PiBjaGF0SW5wdXQuaW5wdXRFZGl0b3IuZ2V0VmFsdWUoKSxcblx0XHRnZXRNb2RlOiAoKSA9PiBjaGF0SW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkuaWQsXG5cdFx0Z2V0UGVybWlzc2lvbkxldmVsOiAoKSA9PiBjaGF0SW5wdXQuY3VycmVudFBlcm1pc3Npb25MZXZlbE9icy5nZXQoKSxcblx0XHRnZXRNb2RlbElkOiAoKSA9PiBjaGF0SW5wdXQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdGdldEJyYW5jaDogKCkgPT4gaXNvbGF0aW9uTW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdHdhaXRGb3JBdXRvbWF0aW9uU2Vzc2lvblN5bmM6ICgpID0+IHtcblx0XHRcdHVwZGF0ZUF1dG9tYXRpb25TZXNzaW9uVGFyZ2V0KCk7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblNlc3Npb25EcmFmdFN5bmNocm9uaXplci53YWl0Rm9yU3luYygpO1xuXHRcdH0sXG5cdFx0Z2V0Rm9jdXNhYmxlRWxlbWVudHM6ICgpID0+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheCAtLSB0aGUgZGlhbG9nIG93bnMgdGhpcyBmb3JtIHN1YnRyZWUgYW5kIHN1cHBsaWVzIGl0cyBkeW5hbWljIGZvY3VzIG9yZGVyLlxuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20oZm9ybS5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignaW5wdXQsIHNlbGVjdCwgdGV4dGFyZWEsIGJ1dHRvbiwgYVtocmVmXSwgW3RhYmluZGV4XScpKTtcblx0XHR9LFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVRpbWVPcHRpb24ge1xuXHRyZWFkb25seSBob3VyOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbnV0ZTogbnVtYmVyO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBidWlsZFRpbWVPcHRpb25zKCk6IHJlYWRvbmx5IElUaW1lT3B0aW9uW10ge1xuXHRjb25zdCBvcHRpb25zOiBJVGltZU9wdGlvbltdID0gW107XG5cdGZvciAobGV0IGhvdXIgPSAwOyBob3VyIDwgMjQ7IGhvdXIrKykge1xuXHRcdGZvciAobGV0IG1pbnV0ZSA9IDA7IG1pbnV0ZSA8IDYwOyBtaW51dGUgKz0gMTUpIHtcblx0XHRcdGNvbnN0IHBlcmlvZCA9IGhvdXIgPCAxMiA/ICdBTScgOiAnUE0nO1xuXHRcdFx0Y29uc3QgaG91cjEyID0gaG91ciA9PT0gMCA/IDEyIDogKGhvdXIgPiAxMiA/IGhvdXIgLSAxMiA6IGhvdXIpO1xuXHRcdFx0Y29uc3QgbWludXRlVGV4dCA9IG1pbnV0ZS50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyk7XG5cdFx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0XHRob3VyLFxuXHRcdFx0XHRtaW51dGUsXG5cdFx0XHRcdGxhYmVsOiBgJHtob3VyMTJ9OiR7bWludXRlVGV4dH0gJHtwZXJpb2R9YCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3B0aW9ucztcbn1cblxuZnVuY3Rpb24gbmVhcmVzdFRpbWVPcHRpb25JbmRleChob3VyOiBudW1iZXIsIG1pbnV0ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3Qgc2FmZUhvdXIgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigyMywgaG91ciB8IDApKTtcblx0Y29uc3Qgc2FmZU1pbnV0ZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKDU5LCBtaW51dGUgfCAwKSk7XG5cdGNvbnN0IHNsb3QgPSBNYXRoLnJvdW5kKHNhZmVNaW51dGUgLyAxNSkgJSA0O1xuXHRjb25zdCBjYXJyaWVkSG91ciA9IHNhZmVNaW51dGUgPj0gNTMgJiYgc2xvdCA9PT0gMCA/IChzYWZlSG91ciArIDEpICUgMjQgOiBzYWZlSG91cjtcblx0cmV0dXJuIGNhcnJpZWRIb3VyICogNCArIHNsb3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVTYXZlQnV0dG9uU3RhdGUoXG5cdHNhdmVCdXR0b246IElCdXR0b24gfCB1bmRlZmluZWQsXG5cdHN0YXRlOiBJRm9ybVN0YXRlLFxuXHR2YWxpZGF0aW9uOiBJVmFsaWRhdGlvblN0YXRlLFxuXHRmb3JtOiBIVE1MRWxlbWVudCxcblx0Z2V0UHJvbXB0OiAoKSA9PiBzdHJpbmcsXG5cdGdldEJyYW5jaDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkLFxuKTogdm9pZCB7XG5cdHZhbGlkYXRpb24ubmFtZUVycm9yID0gc3RhdGUubmFtZS50cmltKCkgPT09ICcnXG5cdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLm5hbWVSZXF1aXJlZCcsIFwiTmFtZSBpcyByZXF1aXJlZC5cIilcblx0XHQ6IHVuZGVmaW5lZDtcblx0dmFsaWRhdGlvbi5wcm9tcHRFcnJvciA9IGdldFByb21wdCgpLnRyaW0oKSA9PT0gJydcblx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ucHJvbXB0UmVxdWlyZWQnLCBcIlByb21wdCBpcyByZXF1aXJlZC5cIilcblx0XHQ6IHVuZGVmaW5lZDtcblx0dmFsaWRhdGlvbi5mb2xkZXJFcnJvciA9ICFzdGF0ZS5mb2xkZXJVcmlcblx0XHQmJiAhc3RhdGUuaXNRdWlja0NoYXRcblx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uZm9sZGVyUmVxdWlyZWQnLCBcIldvcmtzcGFjZSBmb2xkZXIgaXMgcmVxdWlyZWQuXCIpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdHZhbGlkYXRpb24uc2Vzc2lvblR5cGVFcnJvciA9ICFzdGF0ZS5zZXNzaW9uVHlwZUlkIHx8IChzdGF0ZS5pc1F1aWNrQ2hhdCAmJiAhc3RhdGUucHJvdmlkZXJJZClcblx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0uc2Vzc2lvblR5cGVSZXF1aXJlZCcsIFwiU2Vzc2lvbiB0eXBlIGlzIHJlcXVpcmVkLlwiKVxuXHRcdDogdW5kZWZpbmVkO1xuXHR2YWxpZGF0aW9uLmJyYW5jaEVycm9yID0gIXN0YXRlLmlzUXVpY2tDaGF0ICYmIHN0YXRlLmlzb2xhdGlvbk1vZGUgPT09ICd3b3JrdHJlZScgJiYgIWdldEJyYW5jaCgpXG5cdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLmJyYW5jaFJlcXVpcmVkJywgXCJBIGJyYW5jaCBpcyByZXF1aXJlZCBmb3IgV29ya3RyZWUgaXNvbGF0aW9uLlwiKVxuXHRcdDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHZhbGlkID0gIXZhbGlkYXRpb24ubmFtZUVycm9yICYmICF2YWxpZGF0aW9uLnByb21wdEVycm9yICYmICF2YWxpZGF0aW9uLmZvbGRlckVycm9yICYmICF2YWxpZGF0aW9uLnNlc3Npb25UeXBlRXJyb3IgJiYgIXZhbGlkYXRpb24uYnJhbmNoRXJyb3I7XG5cdGlmIChzYXZlQnV0dG9uKSB7XG5cdFx0c2F2ZUJ1dHRvbi5lbmFibGVkID0gdmFsaWQ7XG5cdH1cblx0Zm9ybS5jbGFzc0xpc3QudG9nZ2xlKCdhdXRvbWF0aW9uLWZvcm0taW52YWxpZCcsICF2YWxpZCk7XG59XG5cbi8vIExvY2FsLW9ubHkgd29ya3NwYWNlIHBpY2tlcjogaGlkZXMgY2F0ZWdvcnkgdGFicyBhbmQgbm9uLWxvY2FsIGJyb3dzZSBhY3Rpb25zLlxuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyIGV4dGVuZHMgV29ya3NwYWNlUGlja2VyIHtcblx0cHJpdmF0ZSByZWFkb25seSB0YXJnZXRNb2RlbFdhdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSB0YXJnZXRNb2RlbDogQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdHNldFRhcmdldE1vZGVsKG1vZGVsOiBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLnRhcmdldE1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy50YXJnZXRNb2RlbFdhdGNoLnZhbHVlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0bW9kZWwuaXNRdWlja0NoYXRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3Nob3dUYWJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc2hvdWxkUGVyc2lzdFNlbGVjdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2J1aWxkSXRlbXMoKTogSUFjdGlvbkxpc3RJdGVtPElXb3Jrc3BhY2VQaWNrZXJJdGVtPltdIHtcblx0XHRjb25zdCBpdGVtcyA9IHN1cGVyLl9idWlsZEl0ZW1zKCk7XG5cdFx0Y29uc3Qgbm9Xb3Jrc3BhY2U6IElBY3Rpb25MaXN0SXRlbTxJV29ya3NwYWNlUGlja2VySXRlbT4gPSB7XG5cdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubm9Xb3Jrc3BhY2UnLCBcIk5vIHdvcmtzcGFjZVwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLm5vV29ya3NwYWNlLmRlc2NyaXB0aW9uJywgXCJSdW4gd2l0aG91dCBhIGJhY2tpbmcgd29ya3NwYWNlXCIpLFxuXHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uIH0sXG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMudGFyZ2V0TW9kZWw/LmlzUXVpY2tDaGF0IHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnRhcmdldE1vZGVsPy5zZXRRdWlja0NoYXQodHJ1ZSksXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0cmV0dXJuIGl0ZW1zLmxlbmd0aCA+IDBcblx0XHRcdD8gW25vV29ya3NwYWNlLCB7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiAnJyB9LCAuLi5pdGVtc11cblx0XHRcdDogW25vV29ya3NwYWNlXTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfZGlzcGF0Y2hQaWNrZXJJdGVtKGl0ZW06IElXb3Jrc3BhY2VQaWNrZXJJdGVtKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYXBwbGllZCA9IGF3YWl0IHN1cGVyLl9kaXNwYXRjaFBpY2tlckl0ZW0oaXRlbSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRGb2xkZXIgPSB0aGlzLnNlbGVjdGVkRm9sZGVyVXJpO1xuXHRcdGlmIChhcHBsaWVkICYmIHNlbGVjdGVkRm9sZGVyICYmIChpdGVtLmZvbGRlclVyaSB8fCBpdGVtLmJyb3dzZUFjdGlvbkluZGV4ICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHR0aGlzLnRhcmdldE1vZGVsPy5zZXRRdWlja0NoYXQoZmFsc2UsIHNlbGVjdGVkRm9sZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFwcGxpZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2lzU2VsZWN0ZWRGb2xkZXIoZm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMudGFyZ2V0TW9kZWw/LmlzUXVpY2tDaGF0ICYmIHN1cGVyLl9pc1NlbGVjdGVkRm9sZGVyKGZvbGRlclVyaSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3JlbmRlclRyaWdnZXJMYWJlbCh0cmlnZ2VyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdERPTS5jbGVhck5vZGUodHJpZ2dlcik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5zZWxlY3RlZFJlc29sdmVkPy53b3Jrc3BhY2U7XG5cdFx0Y29uc3Qgbm9Xb3Jrc3BhY2UgPSB0aGlzLnRhcmdldE1vZGVsPy5pc1F1aWNrQ2hhdCA9PT0gdHJ1ZTtcblx0XHRjb25zdCBsYWJlbCA9IG5vV29ya3NwYWNlXG5cdFx0XHQ/IGxvY2FsaXplKCdhdXRvbWF0aW9uLmZvcm0ubm9Xb3Jrc3BhY2UnLCBcIk5vIHdvcmtzcGFjZVwiKVxuXHRcdFx0OiB3b3Jrc3BhY2U/LmxhYmVsID8/IGxvY2FsaXplKCdwaWNrV29ya3NwYWNlJywgXCJ3b3Jrc3BhY2VcIik7XG5cdFx0Y29uc3QgaWNvbiA9IG5vV29ya3NwYWNlID8gQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiA6IHdvcmtzcGFjZT8uaWNvbiA/PyBDb2RpY29uLnByb2plY3Q7XG5cblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHdvcmtzcGFjZSB8fCBub1dvcmtzcGFjZVxuXHRcdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5mb3JtLndvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEFyaWFMYWJlbCcsIFwiQXV0b21hdGlvbiB0YXJnZXQsIHswfVwiLCBsYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ2F1dG9tYXRpb24uZm9ybS53b3Jrc3BhY2VQaWNrZXIucGlja0FyaWFMYWJlbCcsIFwiUGljayBhIHdvcmtzcGFjZSBmb3IgdGhpcyBhdXRvbWF0aW9uXCIpKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkSWNvbiA9IERPTS5hcHBlbmQodHJpZ2dlciwgcmVuZGVySWNvbihpY29uKSk7XG5cdFx0cmVuZGVyZWRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdERPTS5hcHBlbmQodHJpZ2dlciwgJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXHRcdGNvbnN0IGNoZXZyb24gPSBET00uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bkNvbXBhY3QpKTtcblx0XHRjaGV2cm9uLmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb25zLWNoYXQtZHJvcGRvd24tY2hldnJvbicpO1xuXHRcdGNoZXZyb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2dldEFsbEJyb3dzZUFjdGlvbnMoKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHN1cGVyLl9nZXRBbGxCcm93c2VBY3Rpb25zKCkuZmlsdGVyKGEgPT4gYS5ncm91cCA9PT0gU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2JpbGVBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlciBleHRlbmRzIEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyIHtcblx0cHJpdmF0ZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRzZXRMYXlvdXRTZXJ2aWNlKGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5sYXlvdXRTZXJ2aWNlID0gbGF5b3V0U2VydmljZTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3dQaWNrZXIoZm9yY2UgPSBmYWxzZSwgYW5jaG9yPzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCB0cmlnZ2VyRWxlbWVudCA9IGFuY2hvciA/PyB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHRpZiAoIXRyaWdnZXJFbGVtZW50IHx8ICF0aGlzLmxheW91dFNlcnZpY2UgfHwgIXNob3VsZFVzZU1vYmlsZVdvcmtzcGFjZVBpY2tlclNoZWV0KHRoaXMubGF5b3V0U2VydmljZSkpIHtcblx0XHRcdHN1cGVyLnNob3dQaWNrZXIoZm9yY2UsIGFuY2hvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZvaWQgc2hvd01vYmlsZVdvcmtzcGFjZVBpY2tlclNoZWV0KFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLFxuXHRcdFx0dHJpZ2dlckVsZW1lbnQsXG5cdFx0XHR0aGlzLl9idWlsZEl0ZW1zKCksXG5cdFx0XHRpdGVtID0+IHsgdm9pZCB0aGlzLl9kaXNwYXRjaFBpY2tlckl0ZW0oaXRlbSk7IH0sXG5cdFx0XHR0aGlzLl9nZXRBbGxCcm93c2VBY3Rpb25zKCksXG5cdFx0KTtcblx0fVxufVxuXG4vLyBNYWtlIEVudGVyIGluc2VydCBhIG5ld2xpbmUgaW4gdGhlIGRpYWxvZydzIGVkaXRvciAob3ZlcnJpZGVzIENoYXRTdWJtaXRBY3Rpb24pLlxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF1dG9tYXRpb25zRGlhbG9nLmluc2VydE5ld2xpbmUnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDEwMCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdENoYXRDb250ZXh0S2V5cy5pbkF1dG9tYXRpb25zRGlhbG9nLFxuXHQpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBlZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpO1xuXHRcdGVkaXRvcj8udHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ1xcbicgfSk7XG5cdH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQXNEO0FBQy9ELFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLGlCQUFpQjtBQUM3QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsU0FBUyxpQkFBaUIsZUFBNEI7QUFDL0QsU0FBUyxlQUFlO0FBRXhCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsMEJBQTJDO0FBRXBELFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUVuRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxtQkFBbUI7QUFHNUIsU0FBUyx1QkFBdUIsdUJBQXVCLDhCQUE4QjtBQUNyRixTQUFTLDRCQUE0QjtBQUNyQyxTQUErQix1QkFBdUI7QUFDdEQsU0FBUyxvQkFBeUM7QUFDbEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBa0QscUNBQXFDO0FBQ3ZGLFNBQXlCLG1CQUFtQjtBQUU1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLG1CQUFtQiw2QkFBNkI7QUFHekQsU0FBUyxxQkFBOEQ7QUFDdkUsU0FBUywrQkFBK0I7QUFFeEMsU0FBUywwQkFBMEIsc0NBQXNDO0FBQ3pFLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsZ0NBQWdDLDJDQUEyQztBQUVwRixNQUFNLElBQUksSUFBSTtBQUVkLE1BQU0sWUFBOEU7QUFBQSxFQUNuRixFQUFFLE9BQU8sVUFBVSxPQUFPLFNBQVMsOEJBQThCLFFBQVEsRUFBRTtBQUFBLEVBQzNFLEVBQUUsT0FBTyxVQUFVLE9BQU8sU0FBUyw4QkFBOEIsUUFBUSxFQUFFO0FBQUEsRUFDM0UsRUFBRSxPQUFPLFNBQVMsT0FBTyxTQUFTLDZCQUE2QixPQUFPLEVBQUU7QUFBQSxFQUN4RSxFQUFFLE9BQU8sVUFBVSxPQUFPLFNBQVMsOEJBQThCLFFBQVEsRUFBRTtBQUM1RTtBQUdPLFNBQVMsOEJBQThCLGVBQXFDO0FBQ2xGLFNBQU8sMEJBQTBCLGFBQWEsS0FBSyxDQUFDLENBQUMsY0FBYztBQUFBLElBQ2xFO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUyw4QkFBOEIsV0FBbUIsUUFBOEI7QUFDOUYsVUFBUSxjQUFjLFVBQVUsY0FBYyxXQUFXLElBQUksa0JBQWtCLE1BQU07QUFDdEY7QUFFQSxlQUFzQiw2QkFDckIsV0FDQSxxQkFDQSwyQkFDQSw4QkFDbUI7QUFDbkIsUUFBTSxXQUFXLDBCQUEwQixpQkFBaUIsV0FBVyxtQkFBbUI7QUFDMUYsTUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksQ0FBQyxTQUFTLFVBQVUsd0JBQXdCO0FBQy9DLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxDQUFDLENBQUMsTUFBTSw2QkFBNkIsc0JBQXNCO0FBQUEsSUFDakUsS0FBSztBQUFBLElBQ0wsU0FBUyxTQUFTLHNDQUFzQyw2RkFBNkY7QUFBQSxFQUN0SixDQUFDO0FBQ0Y7QUFPTyxTQUFTLDJDQUNmLGNBQ0Esc0JBQ0EsZUFDc0M7QUFDdEMsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLE1BQUksMkJBQTJCO0FBRS9CLFFBQU0sMkJBQTJCLE1BQThCLHFCQUFxQixFQUFFLE9BQU8sYUFBVztBQUN2RyxRQUFJLENBQUMsUUFBUSxlQUFlLFFBQVEsV0FBVyxLQUFLLFFBQVEsYUFBYSxVQUFVLEdBQUc7QUFDckYsYUFBTztBQUFBLElBQ1I7QUFDQSxhQUFTLFVBQThCLFNBQVMsU0FBUyxVQUFVLFFBQVEsZUFBZTtBQUN6RixVQUFJLFFBQVEsVUFBVSxRQUFRLGFBQWEsYUFBYSxNQUFNLFFBQVE7QUFDckUsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFFBQVEsYUFBYSxpQkFBaUIsT0FBTztBQUNuRCxVQUFJLE1BQU0sWUFBWSxVQUFVLE1BQU0sZUFBZSxVQUFVO0FBQzlELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSLENBQUM7QUFFRCxRQUFNLElBQUksSUFBSSxzQkFBc0IsY0FBYyxJQUFJLFVBQVUsVUFBVSxDQUFDLFVBQXlCO0FBQ25HLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFFBQUksa0JBQWtCLGFBQWEsZUFBZSxjQUFjLE1BQU0sR0FBRztBQUN4RSxpQ0FBMkIsTUFBTSxRQUFRO0FBQ3pDO0FBQUEsSUFDRDtBQUNBLCtCQUEyQjtBQUMzQixRQUFJLE1BQU0sUUFBUSxPQUFPO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQW9CLHlCQUF5QjtBQUNuRCxRQUFJLGtCQUFrQixXQUFXLEdBQUc7QUFDbkM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxnQkFBZ0IsYUFBYSxTQUFTO0FBQzVDLFFBQUksZUFBZSxrQkFBa0IsVUFBVSxhQUFXLFlBQVksYUFBYTtBQUNuRixRQUFJLGVBQWUsR0FBRztBQUNyQixxQkFBZSxrQkFBa0IsVUFBVSxhQUFXLENBQUMsQ0FBQyxpQkFBaUIsUUFBUSxTQUFTLGFBQWEsQ0FBQztBQUFBLElBQ3pHO0FBQ0EsUUFBSSxlQUFlLEdBQUc7QUFDckIscUJBQWUsTUFBTSxXQUFXLElBQUk7QUFBQSxJQUNyQztBQUNBLFVBQU0sWUFBWSxNQUFNLFlBQ3BCLGVBQWUsSUFBSSxrQkFBa0IsVUFBVSxrQkFBa0IsVUFDakUsZUFBZSxLQUFLLGtCQUFrQjtBQUMxQyxVQUFNLGVBQWU7QUFDckIsVUFBTSx5QkFBeUI7QUFDL0Isc0JBQWtCLFNBQVMsRUFBRSxNQUFNO0FBQUEsRUFDcEMsR0FBRyxJQUFJLENBQUM7QUFFUixRQUFNLElBQUksSUFBSSxzQkFBc0IsY0FBYyxJQUFJLFVBQVUsUUFBUSxDQUFDLFVBQXlCO0FBQ2pHLFFBQUksTUFBTSxRQUFRLFlBQVksMEJBQTBCO0FBQ3ZELGlDQUEyQjtBQUMzQixZQUFNLHlCQUF5QjtBQUMvQjtBQUFBLElBQ0Q7QUFDQSwrQkFBMkI7QUFBQSxFQUM1QixHQUFHLElBQUksQ0FBQztBQUVSLFNBQU87QUFBQSxJQUNOLFlBQVksTUFBTSx5QkFBeUIsRUFBRSxDQUFDLEdBQUcsTUFBTTtBQUFBLElBQ3ZELFNBQVMsTUFBTSxNQUFNLFFBQVE7QUFBQSxFQUM5QjtBQUNEO0FBNENPLE1BQU0sMkNBQTJDLFdBQVc7QUFBQSxFQVNsRSxZQUNrQiwyQkFDQSxvQkFDQSxTQUNoQjtBQUNELFVBQU07QUFKVztBQUNBO0FBQ0E7QUFSbEIsU0FBUSxhQUFhO0FBQ3JCLFNBQVEsZ0JBQWdCO0FBQ3hCLFNBQVEsY0FBYyxRQUFRLFFBQVE7QUFDdEMsU0FBUSxXQUFXO0FBQUEsRUFRbkI7QUFBQSxFQUVBLE9BQU8sUUFBd0Q7QUFDOUQsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSztBQUNMLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxNQUFNLGNBQTZCO0FBQ2xDLFFBQUk7QUFDSixPQUFHO0FBQ0Ysb0JBQWMsS0FBSztBQUNuQixZQUFNO0FBQUEsSUFDUCxTQUFTLGdCQUFnQixLQUFLO0FBQUEsRUFDL0I7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFFBQUksS0FBSyxlQUFlO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssY0FBYyxRQUFRLFFBQVEsRUFBRSxLQUFLLE1BQU07QUFDL0MsV0FBSyxnQkFBZ0I7QUFDckIsVUFBSSxDQUFDLEtBQUssVUFBVTtBQUNuQixlQUFPLEtBQUssS0FBSyxLQUFLLFVBQVU7QUFBQSxNQUNqQztBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLEtBQUssWUFBbUM7QUFDckQsVUFBTSxTQUFTLEtBQUs7QUFDcEIsUUFBSSxDQUFDLFFBQVE7QUFDWixXQUFLLGVBQWU7QUFDcEI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLHFCQUFxQixNQUFNLEdBQUc7QUFDdEM7QUFBQSxJQUNEO0FBQ0EsUUFBSTtBQUNILFVBQUksT0FBTyxTQUFTLGVBQWUsQ0FBQyxNQUFNLEtBQUssbUJBQW1CLE9BQU8sV0FBVyxPQUFPLFVBQVUsR0FBRztBQUN2RyxZQUFJLGVBQWUsS0FBSyxZQUFZO0FBQ25DLGVBQUssZUFBZTtBQUFBLFFBQ3JCO0FBQ0E7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLFlBQVksZUFBZSxLQUFLLFlBQVk7QUFDcEQ7QUFBQSxNQUNEO0FBQ0EsV0FBSyxVQUFVLE9BQU8sU0FBUyxjQUM1QixLQUFLLDBCQUEwQiwwQkFBMEI7QUFBQSxRQUMxRCxZQUFZLE9BQU87QUFBQSxRQUNuQixlQUFlLE9BQU87QUFBQSxNQUN2QixDQUFDLElBQ0MsS0FBSywwQkFBMEIsd0JBQXdCLE9BQU8sV0FBVztBQUFBLFFBQzFFLFlBQVksT0FBTztBQUFBLFFBQ25CLGVBQWUsT0FBTztBQUFBLE1BQ3ZCLENBQUM7QUFDRixXQUFLLGdCQUFnQjtBQUFBLElBQ3RCLFNBQVMsT0FBTztBQUNmLFVBQUksQ0FBQyxLQUFLLFlBQVksZUFBZSxLQUFLLFlBQVk7QUFDckQsYUFBSyxlQUFlO0FBQ3BCLGFBQUssUUFBUSxLQUFLO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLFFBQStDO0FBQzNFLFFBQUksQ0FBQyxLQUFLLFdBQ04sQ0FBQyxLQUFLLGlCQUNOLEtBQUssMEJBQTBCLGtCQUFrQixJQUFJLEdBQUcsY0FBYyxLQUFLLFFBQVEsYUFDbkYsS0FBSyxjQUFjLFNBQVMsT0FBTyxRQUNuQyxLQUFLLGNBQWMsZUFBZSxPQUFPLGNBQ3pDLEtBQUssY0FBYyxrQkFBa0IsT0FBTyxlQUFlO0FBQzlELGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxPQUFPLFNBQVMsZUFDbEIsS0FBSyxjQUFjLFNBQVMsZUFBZSxRQUFRLEtBQUssY0FBYyxXQUFXLE9BQU8sU0FBUztBQUFBLEVBQ3ZHO0FBQUEsRUFFUSxpQkFBdUI7QUFDOUIsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSywwQkFBMEIseUJBQXlCLEtBQUssT0FBTztBQUFBLElBQ3JFO0FBQ0EsU0FBSyxVQUFVO0FBQ2YsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxXQUFXO0FBQ2hCLFNBQUs7QUFDTCxTQUFLLGVBQWU7QUFDcEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBRU8sU0FBUyxpQ0FDZix1QkFDQSxZQUNBLG9CQUNBLGFBQ1M7QUFDVCxNQUFJLENBQUMsc0JBQXNCLENBQUMsYUFBYTtBQUN4QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sY0FBYyxzQkFBc0Isb0JBQW9CLFVBQVU7QUFDeEUsTUFBSSxhQUFhLDBCQUEwQixvQkFBb0I7QUFDOUQsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLHNCQUFzQixvQkFBb0IsRUFBRSxLQUFLLHlCQUF1QjtBQUM5RSxVQUFNLFlBQVksc0JBQXNCLG9CQUFvQixtQkFBbUI7QUFDL0UsV0FBTyxXQUFXLDBCQUEwQixlQUFlLFVBQVUsT0FBTyxZQUFZO0FBQUEsRUFDekYsQ0FBQyxLQUFLO0FBQ1A7QUFFQSxNQUFNLHFDQUFxQztBQUMzQyxNQUFNLHlDQUF5QztBQUMvQyxNQUFNLHdDQUF3QztBQUk5QyxTQUFTLDRCQUE0QixXQUF3QixTQUF3QjtBQUNwRixZQUFVLE1BQU0sVUFBVSxVQUFVLEtBQUs7QUFDekMsTUFBSSxTQUFTO0FBQ1osY0FBVSxnQkFBZ0IsYUFBYTtBQUFBLEVBQ3hDLE9BQU87QUFDTixjQUFVLGFBQWEsZUFBZSxNQUFNO0FBQUEsRUFDN0M7QUFDRDtBQUVPLElBQU0seUNBQU4sY0FBcUQsbUJBQW1CO0FBQUEsRUFZOUUsWUFDQyxRQUNpQixPQUNBLGdCQUNBLGlCQUNBLG1CQUNBLFlBQ2pCLFNBQ2lCLFNBQ2EsWUFDZSwyQkFDZixrQkFDUCxzQkFDdEI7QUFDRCxVQUFNLFFBQVcsUUFBUSxPQUFPO0FBWmY7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ2E7QUFDZTtBQUNmO0FBdEIvQixTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDekUsU0FBaUIsdUJBQXVCLEtBQUssVUFBVSxJQUFJLGtCQUErQixDQUFDO0FBQzNGLFNBQWlCLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxrQkFBMkMsQ0FBQztBQUNoRyxTQUFRLGtCQUFrQjtBQUUxQixTQUFRLGtCQUFtQztBQUUzQyxTQUFRLFdBQThCLENBQUM7QUFFdkMsU0FBUSw2QkFBNkI7QUFpQnBDLFNBQUssZUFBZSxLQUFLLFVBQVUscUJBQXFCLGVBQWUsY0FBYztBQUFBLE1BQ3BGLE1BQU07QUFBQSxNQUNOLGVBQWU7QUFBQSxNQUNmLGtCQUFrQjtBQUFBLE1BQ2xCLGdCQUFnQjtBQUFBLE1BQ2hCLHNCQUFzQjtBQUFBLE1BQ3RCLHVCQUF1QjtBQUFBLE1BQ3ZCLHdCQUF3QjtBQUFBLE1BQ3hCLFVBQVU7QUFBQSxNQUNWLGdCQUFnQixZQUFVO0FBQ3pCLGFBQUssZUFBZSxhQUFhLE1BQU07QUFDdkMsYUFBSyxvQkFBb0I7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsU0FBUyxNQUFNO0FBQ2QsYUFBSyxLQUFLLGlCQUFpQixLQUFLLGVBQWUsU0FBUztBQUFBLE1BQ3pEO0FBQUEsTUFDQSxXQUFXO0FBQUEsUUFDVixPQUFPLFNBQVMsc0NBQXNDLGNBQWM7QUFBQSxRQUNwRSxXQUFXLFNBQVMsK0NBQStDLG9CQUFvQjtBQUFBLFFBQ3ZGLFVBQVUsYUFBVztBQUNwQixlQUFLLGVBQWUsb0JBQW9CLFVBQVUsYUFBYSxXQUFXO0FBQzFFLGVBQUssb0JBQW9CO0FBQUEsUUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxxQkFBcUIsTUFBTTtBQUNoQyxTQUFLLG9CQUFvQjtBQUN6QixRQUFJLFVBQVUsU0FBUztBQUN2QixjQUFVLE1BQU0sYUFBYTtBQUM3QixVQUFNLFVBQVUsS0FBSztBQUNyQixRQUFJLFNBQVM7QUFDWixXQUFLLGtCQUFrQixJQUFJLFFBQVEsWUFBVTtBQUM1QyxvQ0FBNEIsV0FBVyxRQUFRLEtBQUssTUFBTSxDQUFDO0FBQUEsTUFDNUQsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0saUJBQWlCLElBQUksT0FBTyxXQUFXLEVBQUUsc0NBQXNDLENBQUM7QUFDdEYsU0FBSyxhQUFhLE9BQU8sY0FBYztBQUV2QyxTQUFLLHdCQUF3QjtBQUM3QixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLGtCQUFrQixJQUFJLFFBQVEsWUFBVTtBQUM1QyxZQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ2xELFdBQUssdUJBQXVCO0FBQzVCLFdBQUssS0FBSyxpQkFBaUIsU0FBUztBQUFBLElBQ3JDLENBQUMsQ0FBQztBQUNGLFNBQUssa0JBQWtCLElBQUksS0FBSyxrQkFBa0IsTUFBTTtBQUN2RCxXQUFLLHVCQUF1QjtBQUFBLElBQzdCLENBQUMsQ0FBQztBQUNGLFNBQUssa0JBQWtCLElBQUksS0FBSywwQkFBMEIsd0JBQXdCLE1BQU0sS0FBSyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3RILFNBQUssa0JBQWtCLElBQUk7QUFBQSxNQUMxQixTQUFTLE1BQU07QUFDZCxhQUFLLG9CQUFvQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsMEJBQWdDO0FBQ3ZDLFVBQU0sWUFBWSxLQUFLLGVBQWU7QUFDdEMsVUFBTSxnQkFBZ0IsS0FBSyxNQUFNO0FBQ2pDLFFBQUksQ0FBQyxhQUFhLENBQUMsZUFBZTtBQUNqQyxXQUFLLDZCQUE2QjtBQUNsQyxXQUFLLGVBQWUsaUNBQWlDLEtBQUs7QUFDMUQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLEtBQUssMEJBQTBCLHlCQUF5QixTQUFTLEVBQUU7QUFBQSxNQUFLLGVBQzNGLFVBQVUsWUFBWSxPQUFPLGtCQUN6QixLQUFLLE1BQU0sZUFBZSxVQUFhLFVBQVUsZUFBZSxLQUFLLE1BQU07QUFBQSxJQUNoRixHQUFHO0FBQ0gsUUFBSSxDQUFDLGFBQWE7QUFDakIsV0FBSyw2QkFBNkI7QUFDbEMsV0FBSyxlQUFlLGlDQUFpQyxLQUFLO0FBQzFEO0FBQUEsSUFDRDtBQUNBLFNBQUssNkJBQTZCO0FBQ2xDLFVBQU0sZ0NBQWdDLFlBQVksa0NBQWtDO0FBQ3BGLFNBQUssZUFBZSxpQ0FBaUMsNkJBQTZCO0FBQ2xGLFFBQUksQ0FBQyxpQ0FBaUMsS0FBSyxlQUFlLGtCQUFrQixZQUFZO0FBQ3ZGLFdBQUssZUFBZSxvQkFBb0IsV0FBVztBQUFBLElBQ3BEO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQStCO0FBQ3RDLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQSxFQUVRLHNCQUE0QjtBQUNuQyxVQUFNLGVBQWUsS0FBSyxzQkFBc0I7QUFDaEQsVUFBTSxVQUFVLEtBQUssb0JBQW9CO0FBQ3pDLFVBQU0saUJBQWlCLEtBQUssZUFBZSxrQkFBa0IsS0FBSyxlQUFlO0FBQ2pGLFVBQU0sV0FBa0MsS0FBSyxTQUFTLElBQUksYUFBVztBQUFBLE1BQ3BFLE1BQU07QUFBQSxNQUNOLFVBQVUsV0FBVztBQUFBLElBQ3RCLEVBQUU7QUFDRixRQUFJLGtCQUFrQixDQUFDLEtBQUssU0FBUyxTQUFTLGNBQWMsR0FBRztBQUM5RCxlQUFTLFFBQVE7QUFBQSxRQUNoQixNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixhQUFhO0FBQUEsTUFDZCxDQUFDO0FBQUEsSUFDRjtBQUNBLFVBQU0sNEJBQTRCLEtBQUssNkJBQTZCO0FBQ3BFLFVBQU0saUJBQ0wsOEJBQThCLFNBQVksWUFBWTtBQUV2RCxTQUFLLGFBQWEsT0FBTztBQUFBLE1BQ3hCLE9BQU8sYUFBYTtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxRQUFRLEtBQUssb0JBQW9CLHVCQUF1QixLQUFLLG9CQUFvQixvQkFDOUUsWUFDQSxLQUFLLG9CQUFvQixVQUN4QixVQUNBLEtBQUssb0JBQW9CLFVBQ3hCLFVBQ0E7QUFBQSxNQUNMO0FBQUEsTUFDQSxnQkFBZ0IsYUFBYTtBQUFBLE1BQzdCLFNBQVMsYUFBYTtBQUFBLE1BQ3RCLGFBQWEsS0FBSyxlQUFlLHlCQUF5QixLQUFLLG9CQUFvQjtBQUFBLE1BQ25GLFdBQVc7QUFBQSxRQUNWLFNBQVMsS0FBSyxlQUFlLGtCQUFrQjtBQUFBLFFBQy9DLE9BQU87QUFBQSxRQUNQLGdCQUFnQjtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVRLHdCQUF3RztBQUMvRyxVQUFNLGdCQUFnQixLQUFLLGVBQWU7QUFDMUMsUUFBSSxDQUFDLEtBQUssZUFBZSxXQUFXO0FBQ25DLGFBQU87QUFBQSxRQUNOLE9BQU8sU0FBUyxrQ0FBa0MsUUFBRztBQUFBLFFBQ3JELFFBQVEsU0FBUyx5Q0FBeUMsOENBQThDO0FBQUEsUUFDeEcsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLEtBQUssNEJBQTRCO0FBQ3JDLGFBQU87QUFBQSxRQUNOLE9BQU8saUJBQWlCLFNBQVMsa0NBQWtDLFFBQUc7QUFBQSxRQUN0RSxRQUFRLFNBQVMsa0RBQWtELG1DQUFtQztBQUFBLFFBQ3RHLFNBQVMsQ0FBQztBQUFBLE1BQ1g7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLEtBQUssZUFBZSwrQkFBK0I7QUFDdkQsYUFBTztBQUFBLFFBQ04sT0FBTyxpQkFBaUIsU0FBUyxrQ0FBa0MsUUFBRztBQUFBLFFBQ3RFLFFBQVEsU0FBUyw0Q0FBNEMsMkVBQTJFO0FBQUEsUUFDeEksU0FBUyxDQUFDO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssb0JBQW9CLFNBQVM7QUFDckMsYUFBTztBQUFBLFFBQ04sT0FBTyxpQkFBaUIsU0FBUyxvQ0FBb0MseUJBQXlCO0FBQUEsUUFDOUYsUUFBUSxTQUFTLDBDQUEwQyx5REFBeUQ7QUFBQSxRQUNwSCxTQUFTLENBQUM7QUFBQSxNQUNYO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxlQUFlLGtCQUFrQixZQUFZO0FBQ3JELGFBQU87QUFBQSxRQUNOLE9BQU8saUJBQWlCLEtBQUssa0JBQWtCLFNBQVMsa0NBQWtDLFFBQUc7QUFBQSxRQUM3RixRQUFRLFNBQVMsMkNBQTJDLHFDQUFxQztBQUFBLFFBQ2pHLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLO0FBQUEsTUFDbEM7QUFBQSxJQUNEO0FBQ0EsWUFBUSxLQUFLLGlCQUFpQjtBQUFBLE1BQzdCLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFDSixlQUFPO0FBQUEsVUFDTixPQUFPLGlCQUFpQixTQUFTLGtDQUFrQyx3QkFBbUI7QUFBQSxVQUN0RixRQUFRLFNBQVMsd0NBQXdDLDZCQUE2QjtBQUFBLFVBQ3RGLFNBQVMsQ0FBQztBQUFBLFFBQ1g7QUFBQSxNQUNELEtBQUs7QUFDSixlQUFPO0FBQUEsVUFDTixPQUFPLGlCQUFpQixTQUFTLGlDQUFpQyxhQUFhO0FBQUEsVUFDL0UsUUFBUSxTQUFTLHVDQUF1QyxzREFBc0Q7QUFBQSxVQUM5RyxTQUFTLENBQUM7QUFBQSxRQUNYO0FBQUEsTUFDRCxLQUFLO0FBQ0osZUFBTztBQUFBLFVBQ04sT0FBTyxpQkFBaUIsU0FBUyxxQ0FBcUMsbUJBQW1CO0FBQUEsVUFDekYsUUFBUSxTQUFTLDJDQUEyQyxrREFBa0Q7QUFBQSxVQUM5RyxTQUFTLENBQUM7QUFBQSxRQUNYO0FBQUEsTUFDRCxLQUFLO0FBQ0osZUFBTztBQUFBLFVBQ04sT0FBTyxpQkFBaUIsU0FBUyxpQ0FBaUMsZUFBZTtBQUFBLFVBQ2pGLFFBQVEsU0FBUyx1Q0FBdUMsc0RBQXNEO0FBQUEsVUFDOUcsU0FBUyxDQUFDO0FBQUEsUUFDWDtBQUFBLE1BQ0QsS0FBSztBQUNKLGVBQU87QUFBQSxVQUNOLE9BQU8sU0FBUyxrQ0FBa0MsUUFBRztBQUFBLFVBQ3JELFFBQVEsU0FBUyx5Q0FBeUMsOENBQThDO0FBQUEsVUFDeEcsU0FBUztBQUFBLFFBQ1Y7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsc0JBQStCO0FBQ3RDLFFBQUksS0FBSyxvQkFBb0IsU0FBUztBQUNyQyxhQUFPLENBQUMsQ0FBQyxLQUFLLGVBQWUsYUFBYSxLQUFLLDhCQUE4QixLQUFLLGVBQWU7QUFBQSxJQUNsRztBQUNBLFdBQU8sS0FBSyxlQUFlLHlCQUN2QixLQUFLLG9CQUFvQixjQUN6QixLQUFLLG9CQUFvQixrQkFDekIsS0FBSyxvQkFBb0IsdUJBQ3pCLEtBQUssb0JBQW9CO0FBQUEsRUFDOUI7QUFBQSxFQUVRLCtCQUFtRDtBQUMxRCxRQUFJLENBQUMsS0FBSyxlQUFlLFdBQVc7QUFDbkMsYUFBTyxTQUFTLDhDQUE4Qyw0Q0FBNEM7QUFBQSxJQUMzRztBQUNBLFFBQUksQ0FBQyxLQUFLLDRCQUE0QjtBQUNyQyxhQUFPLFNBQVMsa0RBQWtELG1DQUFtQztBQUFBLElBQ3RHO0FBQ0EsUUFBSSxDQUFDLEtBQUssZUFBZSwrQkFBK0I7QUFDdkQsYUFBTyxTQUFTLGlEQUFpRCw0Q0FBNEM7QUFBQSxJQUM5RztBQUNBLFFBQUksS0FBSyxlQUFlLGdCQUFnQjtBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFlBQVEsS0FBSyxpQkFBaUI7QUFBQSxNQUM3QixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osZUFBTyxTQUFTLHdDQUF3Qyw2QkFBNkI7QUFBQSxNQUN0RixLQUFLO0FBQ0osZUFBTyxTQUFTLHVDQUF1QyxzREFBc0Q7QUFBQSxNQUM5RyxLQUFLO0FBQ0osZUFBTyxTQUFTLDBDQUEwQyx5REFBeUQ7QUFBQSxNQUNwSCxLQUFLO0FBQ0osZUFBTyxTQUFTLDJDQUEyQyxrREFBa0Q7QUFBQSxNQUM5RyxLQUFLO0FBQ0osZUFBTyxLQUFLLFNBQVMsU0FBUyxJQUMzQixTQUNBLFNBQVMsMkNBQTJDLGtEQUFrRDtBQUFBLE1BQzFHLEtBQUs7QUFDSixlQUFPLFNBQVMsOENBQThDLDRDQUE0QztBQUFBLElBQzVHO0FBQUEsRUFDRDtBQUFBLEVBRVEsc0JBQTRCO0FBQ25DLFNBQUssY0FBYyxPQUFPLE9BQU87QUFDakMsU0FBSyxjQUFjLE1BQU07QUFBQSxFQUMxQjtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsUUFBd0M7QUFDdEUsVUFBTSxZQUFZLEVBQUUsS0FBSztBQUN6QixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLHFCQUFxQixNQUFNO0FBQ2hDLFNBQUssYUFBYTtBQUNsQixTQUFLLFdBQVcsQ0FBQztBQUNqQixTQUFLLGlCQUFpQjtBQUN0QixRQUFJLENBQUMsUUFBUTtBQUNaLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssZUFBZSxjQUFjLE1BQVM7QUFDM0MsV0FBSyxvQkFBb0I7QUFDekI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxvQkFBb0I7QUFDekIsVUFBTSxNQUFNLElBQUksd0JBQXdCO0FBQ3hDLFNBQUssY0FBYyxRQUFRO0FBQzNCLFFBQUk7QUFDSixRQUFJO0FBQ0gsYUFBTyxNQUFNLEtBQUssV0FBVyxlQUFlLE1BQU07QUFBQSxJQUNuRCxTQUFTLE9BQU87QUFDZixVQUFJLGNBQWMsS0FBSyxtQkFBbUIsSUFBSSxNQUFNLHlCQUF5QjtBQUM1RTtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQixNQUFNLDBFQUEwRSxLQUFLO0FBQzNHLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssb0JBQW9CO0FBQ3pCO0FBQUEsSUFDRDtBQUNBLFFBQUksY0FBYyxLQUFLLG1CQUFtQixJQUFJLE1BQU0seUJBQXlCO0FBQzVFO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxNQUFNO0FBQ1YsV0FBSyxrQkFBa0I7QUFDdkIsV0FBSyxvQkFBb0I7QUFDekI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxhQUFhO0FBQ2xCLFVBQU0sVUFBVSxJQUFJLGdCQUFnQjtBQUNwQyxZQUFRLElBQUksUUFBUSxZQUFVO0FBQzdCLFlBQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxNQUFNLEVBQUU7QUFDckMsVUFBSSxNQUFNLFVBQVUsS0FBSyxNQUFNO0FBQzlCLGFBQUssaUJBQWlCO0FBQ3RCLGFBQUssZUFBZSxjQUFjLEtBQUssSUFBSTtBQUFBLE1BQzVDLFdBQVcsTUFBTSxRQUFRO0FBQ3hCLGFBQUssaUJBQWlCLFNBQVMsbUNBQW1DLFNBQVMsS0FBSyxPQUFPLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDbEcsYUFBSyxlQUFlLGNBQWMsTUFBUztBQUFBLE1BQzVDLE9BQU87QUFDTixhQUFLLGlCQUFpQjtBQUN0QixhQUFLLGVBQWUsY0FBYyxNQUFTO0FBQUEsTUFDNUM7QUFDQSxXQUFLLG9CQUFvQjtBQUFBLElBQzFCLENBQUMsQ0FBQztBQUNGLFNBQUsscUJBQXFCLFFBQVE7QUFDbEMsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxvQkFBb0I7QUFDekIsUUFBSTtBQUNILFlBQU0sT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLFNBQVMsYUFBYSxHQUFHLElBQUksS0FBSztBQUNwRSxVQUFJLGNBQWMsS0FBSyxtQkFBbUIsSUFBSSxNQUFNLDJCQUEyQixLQUFLLGVBQWUsTUFBTTtBQUN4RztBQUFBLE1BQ0Q7QUFDQSxXQUFLLFdBQVcsK0JBQStCLEtBQUssSUFBSSxTQUFPLElBQUksSUFBSSxDQUFDO0FBQ3hFLFdBQUssa0JBQWtCLEtBQUssU0FBUyxTQUFTLElBQUksVUFBVTtBQUFBLElBQzdELFNBQVMsT0FBTztBQUNmLFVBQUksY0FBYyxLQUFLLG1CQUFtQixJQUFJLE1BQU0seUJBQXlCO0FBQzVFO0FBQUEsTUFDRDtBQUNBLFdBQUssaUJBQWlCLE1BQU0scURBQXFELEtBQUs7QUFDdEYsV0FBSyxrQkFBa0I7QUFBQSxJQUN4QjtBQUNBLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFDRDtBQWhXYSx5Q0FBTjtBQUFBLEVBcUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4QlU7QUF3V2IsTUFBTSx1Q0FBdUMsbUJBQW1CO0FBQUEsRUFHL0QsWUFDQyxRQUNpQixjQUNBLFNBQ2pCLFNBQ0M7QUFDRCxVQUFNLFFBQVcsUUFBUSxPQUFPO0FBSmY7QUFDQTtBQUxsQixTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksa0JBQStCLENBQUM7QUFBQSxFQVN0RjtBQUFBLEVBRVMsT0FBTyxXQUE4QjtBQUM3QyxVQUFNLE9BQU8sU0FBUztBQUN0QixRQUFJLFVBQVUsU0FBUztBQUN2QixTQUFLLGFBQWEsU0FBUztBQUMzQixVQUFNLFVBQVUsS0FBSztBQUNyQixTQUFLLGdCQUFnQixRQUFRLFVBQVUsUUFBUSxZQUFVO0FBQ3hELGtDQUE0QixXQUFXLFFBQVEsS0FBSyxNQUFNLENBQUM7QUFBQSxJQUM1RCxDQUFDLElBQUk7QUFBQSxFQUNOO0FBQ0Q7QUFFQSxnQkFBZ0IsTUFBTSx5Q0FBeUMsUUFBUTtBQUFBLEVBQ3RFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsc0NBQXNDLDBCQUEwQjtBQUFBLE1BQ2pGLElBQUk7QUFBQSxNQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDOUIsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLE1BQU0sZ0JBQWdCO0FBQUEsTUFDdkIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWUsTUFBcUI7QUFBQSxFQUFvQztBQUN6RSxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sNkNBQTZDLFFBQVE7QUFBQSxFQUMxRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLDBDQUEwQyw4QkFBOEI7QUFBQSxNQUN6RixJQUFJO0FBQUEsTUFDSixjQUFjLGdCQUFnQjtBQUFBLE1BQzlCLE1BQU0sQ0FBQztBQUFBLFFBQ04sSUFBSSxPQUFPO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGdCQUFnQjtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLE1BQXFCO0FBQUEsRUFBb0M7QUFDekUsQ0FBQztBQUVELGdCQUFnQixNQUFNLDRDQUE0QyxRQUFRO0FBQUEsRUFDekUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSx5Q0FBeUMsNkJBQTZCO0FBQUEsTUFDdkYsSUFBSTtBQUFBLE1BQ0osY0FBYyxnQkFBZ0I7QUFBQSxNQUM5QixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxnQkFBZ0I7QUFBQSxNQUN2QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxNQUFxQjtBQUFBLEVBQW9DO0FBQ3pFLENBQUM7QUFFTSxTQUFTLFdBQ2YsTUFDQSxPQUNBLGFBQ0EsWUFDQSxZQUNBLHNCQUNBLG1CQUNBLG9CQUNBLHNCQUNBLHVCQUNBLGVBQ0EsWUFDQSxnQkFDQSwyQkFDQSw4QkFDQSxlQUNBLGFBQ0Esd0JBQ0EsZ0JBQ29CO0FBQ3BCLFFBQU0sVUFBVSxJQUFJLE9BQU8sTUFBTSxFQUFFLHNCQUFzQixDQUFDO0FBQzFELE1BQUksT0FBTyxTQUFTLEVBQUUsOEJBQThCLFFBQVcsU0FBUyx3QkFBd0IsTUFBTSxDQUFDLENBQUM7QUFDeEcsUUFBTSxxQkFBcUIsSUFBSSxPQUFPLFNBQVMsRUFBRSw2QkFBNkIsQ0FBQztBQUMvRSxRQUFNLFlBQVksWUFBWSxJQUFJLElBQUksU0FBUyxvQkFBb0Isb0JBQW9CO0FBQUEsSUFDdEYsZ0JBQWdCO0FBQUEsSUFDaEIsYUFBYSxTQUFTLG1DQUFtQyw0QkFBNEI7QUFBQSxJQUNyRixXQUFXLFNBQVMsd0JBQXdCLE1BQU07QUFBQSxFQUNuRCxDQUFDLENBQUM7QUFDRixZQUFVLFFBQVEsTUFBTTtBQUN4QixjQUFZLElBQUksVUFBVSxZQUFZLFdBQVM7QUFDOUMsVUFBTSxPQUFPO0FBQ2IsZUFBVztBQUFBLEVBQ1osQ0FBQyxDQUFDO0FBRUYsUUFBTSxjQUFjLElBQUksT0FBTyxNQUFNLEVBQUUsbURBQW1ELENBQUM7QUFDM0YsUUFBTSxpQkFBaUIsQ0FBQyxxQkFBcUIsb0JBQW9CO0FBRWpFLFFBQU0sZ0JBQWdCLElBQUksT0FBTyxhQUFhLEVBQUUsaUNBQWlDLENBQUM7QUFDbEYsTUFBSSxPQUFPLGVBQWUsRUFBRSw4QkFBOEIsUUFBVyxTQUFTLDRCQUE0QixVQUFVLENBQUMsQ0FBQztBQUN0SCxRQUFNLGtCQUF1QyxVQUFVLElBQUksV0FBUyxFQUFFLE1BQU0sS0FBSyxNQUFNLEVBQUU7QUFDekYsUUFBTSxnQkFBZ0IsS0FBSyxJQUFJLEdBQUcsVUFBVSxVQUFVLFVBQVEsS0FBSyxVQUFVLE1BQU0sUUFBUSxDQUFDO0FBQzVGLFFBQU0saUJBQWlCLFlBQVksSUFBSSxJQUFJO0FBQUEsSUFDMUM7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBLEVBQUUsV0FBVyxTQUFTLDRCQUE0QixVQUFVLEdBQUcsZUFBZTtBQUFBLEVBQy9FLENBQUM7QUFDRCxRQUFNLDBCQUEwQixJQUFJLE9BQU8sZUFBZSxFQUFFLDRDQUE0QyxDQUFDO0FBQ3pHLGlCQUFlLE9BQU8sdUJBQXVCO0FBRTdDLFFBQU0sWUFBWSxJQUFJLE9BQU8sYUFBYSxFQUFFLDREQUE0RCxDQUFDO0FBQ3pHLE1BQUksT0FBTyxXQUFXLEVBQUUsOEJBQThCLFFBQVcsU0FBUyx3QkFBd0IsTUFBTSxDQUFDLENBQUM7QUFDMUcsUUFBTSxjQUFjLGlCQUFpQjtBQUNyQyxRQUFNLG1CQUFtQix1QkFBdUIsTUFBTSxNQUFNLE1BQU0sTUFBTTtBQUN4RSxRQUFNLE9BQU8sWUFBWSxnQkFBZ0IsRUFBRTtBQUMzQyxRQUFNLFNBQVMsWUFBWSxnQkFBZ0IsRUFBRTtBQUM3QyxRQUFNLGFBQWEsWUFBWSxJQUFJLElBQUk7QUFBQSxJQUN0QyxZQUFZLElBQUksVUFBUSxFQUFFLE1BQU0sSUFBSSxNQUFNLEVBQThCO0FBQUEsSUFDeEU7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0EsRUFBRSxXQUFXLFNBQVMsd0JBQXdCLE1BQU0sR0FBRyxlQUFlO0FBQUEsRUFDdkUsQ0FBQztBQUNELFFBQU0sc0JBQXNCLElBQUksT0FBTyxXQUFXLEVBQUUsa0ZBQWtGLENBQUM7QUFDdkksYUFBVyxPQUFPLG1CQUFtQjtBQUNyQyxjQUFZLElBQUksV0FBVyxZQUFZLE9BQUs7QUFDM0MsVUFBTSxNQUFNLFlBQVksRUFBRSxLQUFLO0FBQy9CLFVBQU0sT0FBTyxJQUFJO0FBQ2pCLFVBQU0sU0FBUyxJQUFJO0FBQUEsRUFDcEIsQ0FBQyxDQUFDO0FBRUYsUUFBTSxXQUFXLElBQUksT0FBTyxhQUFhLEVBQUUsMkRBQTJELENBQUM7QUFDdkcsTUFBSSxPQUFPLFVBQVUsRUFBRSw4QkFBOEIsUUFBVyxTQUFTLHVCQUF1QixhQUFhLENBQUMsQ0FBQztBQUMvRyxRQUFNLGFBQWtDLGFBQWEsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUU7QUFDM0UsUUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJO0FBQUEsSUFDckM7QUFBQSxJQUNBLEtBQUssSUFBSSxLQUFLLElBQUksTUFBTSxLQUFLLENBQUMsR0FBRyxhQUFhLFNBQVMsQ0FBQztBQUFBLElBQ3hEO0FBQUEsSUFDQTtBQUFBLElBQ0EsRUFBRSxXQUFXLFNBQVMsdUJBQXVCLGFBQWEsR0FBRyxlQUFlO0FBQUEsRUFDN0UsQ0FBQztBQUNELFFBQU0scUJBQXFCLElBQUksT0FBTyxVQUFVLEVBQUUsNENBQTRDLENBQUM7QUFDL0YsWUFBVSxPQUFPLGtCQUFrQjtBQUNuQyxjQUFZLElBQUksVUFBVSxZQUFZLE9BQUs7QUFDMUMsVUFBTSxNQUFNLEVBQUU7QUFBQSxFQUNmLENBQUMsQ0FBQztBQUVGLFFBQU0sMEJBQTBCLE1BQU07QUFDckMsVUFBTSxXQUFXLE1BQU0sYUFBYSxXQUFXLE1BQU0sYUFBYTtBQUNsRSxVQUFNLFVBQVUsTUFBTSxhQUFhO0FBQ25DLGNBQVUsTUFBTSxVQUFVLFdBQVcsS0FBSztBQUMxQyxhQUFTLE1BQU0sVUFBVSxVQUFVLEtBQUs7QUFBQSxFQUN6QztBQUNBLDBCQUF3QjtBQUN4QixjQUFZLElBQUksZUFBZSxZQUFZLE9BQUs7QUFDL0MsVUFBTSxXQUFXLFVBQVUsRUFBRSxLQUFLLEVBQUU7QUFDcEMsNEJBQXdCO0FBQUEsRUFDekIsQ0FBQyxDQUFDO0FBR0YsUUFBTSxpQkFBaUIsSUFBSSx5QkFBeUIsS0FBSztBQUN6RCxRQUFNLDJCQUEyQixRQUFRLFlBQVUsQ0FBQyxlQUFlLGVBQWUsS0FBSyxNQUFNLENBQUM7QUFDOUYsUUFBTSxvQkFBb0IsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixnQkFBc0MsTUFBUyxHQUFHLEVBQUUsa0JBQWtCLE9BQU8saUJBQWlCLCtCQUErQixhQUFhLE1BQU0sQ0FBQyxDQUFDO0FBQ3pQLG9CQUFrQixtQkFBbUIsZUFBZSxjQUFjO0FBQ2xFLG9CQUFrQixnQkFBZ0IsZUFBZSxjQUFjO0FBQUEsSUFDOUQsYUFBYSxNQUFNLGdCQUNoQixFQUFFLFlBQVksTUFBTSxZQUFZLGVBQWUsTUFBTSxjQUFjLElBQ25FO0FBQUEsSUFDSCxnQ0FBZ0M7QUFBQSxFQUNqQyxDQUFDO0FBRUQsUUFBTSx5QkFBeUIsWUFBWSxJQUFJLElBQUksUUFBNEIsQ0FBQztBQUNoRixRQUFNLDJCQUEyQixZQUFZLElBQUksSUFBSSxRQUFjLENBQUM7QUFDcEUsUUFBTSxzQkFBa0Q7QUFBQSxJQUN2RCwwQkFBMEIsTUFBTSxrQkFBa0IsMkJBQTJCLElBQUk7QUFBQSxJQUNqRixrQ0FBa0MsdUJBQXVCO0FBQUEsRUFDMUQ7QUFDQSxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFVBQU0sT0FBTyxrQkFBa0I7QUFDL0IsVUFBTSxhQUFhLE1BQU07QUFDekIsVUFBTSxnQkFBZ0IsTUFBTTtBQUM1Qiw2QkFBeUIsS0FBSztBQUFBLEVBQy9CO0FBQ0EsY0FBWSxJQUFJLFFBQVEsWUFBVTtBQUNqQyxVQUFNLGNBQWMsa0JBQWtCLDJCQUEyQixLQUFLLE1BQU07QUFDNUUsUUFBSSxhQUFhO0FBQ2hCLDZCQUF1QixLQUFLLFdBQVc7QUFBQSxJQUN4QztBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBRUYsc0JBQW9CO0FBS3BCLFFBQU0sa0JBQWtCLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxrQ0FBa0M7QUFBQSxJQUM3RyxxQkFBcUI7QUFBQSxJQUNyQixvQkFBb0IsQ0FBQyxXQUFXLHdCQUMvQiw2QkFBNkIsV0FBVyxxQkFBcUIsMkJBQTJCLDRCQUE0QjtBQUFBLEVBQ3RILENBQUMsQ0FBQztBQUNGLGtCQUFnQixlQUFlLGNBQWM7QUFDN0Msa0JBQWdCLGlCQUFpQixhQUFhO0FBRTlDLFFBQU0scUNBQXFDLFlBQVksSUFBSSxJQUFJO0FBQUEsSUFDOUQ7QUFBQSxJQUNBLENBQUMsV0FBVyx3QkFBd0IsNkJBQTZCLFdBQVcscUJBQXFCLDJCQUEyQiw0QkFBNEI7QUFBQSxJQUN4SixXQUFTLFdBQVcsTUFBTSwwRUFBMEUsS0FBSztBQUFBLEVBQzFHLENBQUM7QUFDRCxRQUFNLGdDQUFnQyxNQUFNO0FBQzNDLFVBQU0sWUFBWSxlQUFlLGFBQWEsSUFBSTtBQUNsRCxVQUFNLE9BQU8sa0JBQWtCO0FBQy9CLFVBQU0sY0FBYyxlQUFlLGVBQWUsSUFBSTtBQUN0RCxRQUFJLENBQUMsUUFBUyxlQUFlLENBQUMsS0FBSyxjQUFnQixDQUFDLGVBQWUsQ0FBQyxXQUFZO0FBQy9FLHlDQUFtQyxPQUFPLE1BQVM7QUFDbkQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxhQUFhO0FBQ2hCLFlBQU0sYUFBYSxLQUFLO0FBQ3hCLFVBQUksWUFBWTtBQUNmLDJDQUFtQyxPQUFPLEVBQUUsTUFBTSxhQUFhLFlBQVksZUFBZSxLQUFLLGNBQWMsQ0FBQztBQUFBLE1BQy9HO0FBQUEsSUFDRCxXQUFXLFdBQVc7QUFDckIseUNBQW1DLE9BQU8sRUFBRSxNQUFNLGFBQWEsV0FBVyxZQUFZLEtBQUssWUFBWSxlQUFlLEtBQUssY0FBYyxDQUFDO0FBQUEsSUFDM0k7QUFBQSxFQUNEO0FBQ0EsY0FBWSxJQUFJLGtCQUFrQix3QkFBd0IsTUFBTTtBQUMvRCx3QkFBb0I7QUFDcEIsa0NBQThCO0FBQzlCLGVBQVc7QUFBQSxFQUNaLENBQUMsQ0FBQztBQUNGLGNBQVksSUFBSSwwQkFBMEIsd0JBQXdCLE1BQU0sOEJBQThCLENBQUMsQ0FBQztBQUV4RyxNQUFJLE1BQU0sV0FBVztBQUNwQixvQkFBZ0IscUJBQXFCLE1BQU0sV0FBVyxFQUFFLFdBQVcsT0FBTyxTQUFTLE1BQU0sQ0FBQztBQUFBLEVBQzNGO0FBRUEsY0FBWSxJQUFJLGdCQUFnQixxQkFBcUIsU0FBTztBQUMzRCxRQUFJLGVBQWUsYUFBYSxHQUFHLEdBQUc7QUFDckMsb0NBQThCO0FBQzlCLGlCQUFXO0FBQUEsSUFDWjtBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBRUYsTUFBSSxDQUFDLE1BQU0sZUFBZSxDQUFDLE1BQU0sYUFBYSxnQkFBZ0IsbUJBQW1CO0FBQ2hGLG1CQUFlLGFBQWEsZ0JBQWdCLGlCQUFpQjtBQUFBLEVBQzlEO0FBRUEsY0FBWSxJQUFJLFFBQVEsWUFBVTtBQUNqQyxtQkFBZSxlQUFlLEtBQUssTUFBTTtBQUN6QyxrQ0FBOEI7QUFDOUIsZUFBVztBQUFBLEVBQ1osQ0FBQyxDQUFDO0FBRUYsUUFBTSxZQUFZLElBQUksT0FBTyxNQUFNLEVBQUUsc0JBQXNCLENBQUM7QUFDNUQsTUFBSSxPQUFPLFdBQVcsRUFBRSw4QkFBOEIsUUFBVyxTQUFTLDBCQUEwQixRQUFRLENBQUMsQ0FBQztBQUM5RyxRQUFNLGFBQWEsSUFBSSxPQUFPLFdBQVcsRUFBRSxrREFBa0QsQ0FBQztBQUU5RixRQUFNLGtCQUFvQztBQUFBLElBQ3pDLG1CQUFtQjtBQUFBLElBQ25CLGdCQUFnQjtBQUFBLElBQ2hCLGdCQUFnQjtBQUFBLEVBQ2pCO0FBRUEsUUFBTSxtQkFBMEM7QUFBQSxJQUMvQyxpQkFBaUI7QUFBQSxJQUNqQiw4QkFBOEI7QUFBQSxJQUM5QixrQkFBa0I7QUFBQSxJQUNsQix1QkFBdUI7QUFBQSxJQUN2Qix1QkFBdUI7QUFBQSxJQUN2QixxQkFBcUI7QUFBQSxJQUNyQiw0QkFBNEI7QUFBQSxJQUM1QiwwQkFBMEI7QUFBQSxJQUMxQixPQUFPO0FBQUEsTUFDTixnQkFBZ0IsT0FBTztBQUFBLE1BQ3ZCLGlCQUFpQjtBQUFBLElBQ2xCO0FBQUEsSUFDQSxtQkFBbUI7QUFBQSxJQUNuQixxQkFBcUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFNckIsNEJBQTRCO0FBQUEsSUFDNUIsMkJBQTJCO0FBQUEsSUFDM0Isd0NBQXdDLENBQUMsUUFBUSxnQkFBZ0I7QUFDaEUsVUFBSSxPQUFPLE9BQU8sb0NBQW9DO0FBQ3JELGVBQU8sSUFBSSwrQkFBK0IsUUFBUSxlQUFhLGtCQUFrQixPQUFPLFNBQVMsR0FBRyxRQUFXLFdBQVc7QUFBQSxNQUMzSDtBQUNBLFVBQUksT0FBTyxPQUFPLHdDQUF3QztBQUN6RCxlQUFPLElBQUksK0JBQStCLFFBQVEsZUFBYTtBQUM5RCxvQkFBVSxVQUFVLElBQUksd0JBQXdCO0FBQ2hELDBCQUFnQixPQUFPLFNBQVM7QUFBQSxRQUNqQyxHQUFHLFFBQVcsV0FBVztBQUFBLE1BQzFCO0FBQ0EsVUFBSSxPQUFPLE9BQU8sdUNBQXVDO0FBQ3hELGNBQU0sT0FBTyxxQkFBcUI7QUFBQSxVQUNqQztBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0EsZUFBZTtBQUFBLFVBQ2YseUJBQXlCO0FBQUEsVUFDekI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUtBLFFBQU0sYUFBaUM7QUFBQSxJQUN0QyxzQkFBc0IsTUFBTTtBQUFBLElBQzVCLFdBQVc7QUFBQSxJQUNYLFVBQVUsQ0FBQztBQUFBLElBQ1gsVUFBVSxrQkFBa0I7QUFBQSxJQUM1QixhQUFhLENBQUM7QUFBQSxJQUNkLG1CQUFtQixNQUFNO0FBQUEsSUFBRTtBQUFBLElBQzNCLHVCQUF1QixNQUFNO0FBQUEsSUFBRTtBQUFBLEVBQ2hDO0FBR0EsUUFBTSwwQkFBMEIsWUFBWSxJQUFJLGtCQUFrQixhQUFhLFVBQVUsQ0FBQztBQUMxRixrQkFBZ0IsU0FBUyxPQUFPLHVCQUF1QixFQUFFLElBQUksa0JBQWtCLElBQUk7QUFDbkYsa0JBQWdCLGNBQWMsT0FBTyx1QkFBdUIsRUFBRSxJQUFJLElBQUk7QUFDdEUsa0JBQWdCLG9CQUFvQixPQUFPLHVCQUF1QixFQUFFLElBQUksSUFBSTtBQUM1RSxRQUFNLDZCQUE2QixZQUFZO0FBQUEsSUFDOUMscUJBQXFCLFlBQVksSUFBSSxrQkFBa0IsQ0FBQyxvQkFBb0IsdUJBQXVCLENBQUMsQ0FBQztBQUFBLEVBQ3RHO0FBRUEsUUFBTSxZQUFZLFlBQVk7QUFBQSxJQUM3QiwyQkFBMkIsZUFBZSxlQUFlLGtCQUFrQixNQUFNLGtCQUFrQixpQkFBaUIsS0FBSztBQUFBLEVBQzFIO0FBQ0EsWUFBVSxPQUFPLFlBQVksZUFBZSxVQUF5QjtBQUNyRSxZQUFVLFlBQVksY0FBYyxFQUFFLGFBQWEsU0FBUyxzQ0FBc0Msb0NBQW9DLEVBQUUsQ0FBQztBQUV6SSxNQUFJLGFBQWE7QUFDaEIsVUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxZQUFNLFFBQVEsVUFBVSxvQkFBb0IsSUFBSTtBQUNoRCxhQUFPLE1BQU0sYUFBYSxXQUFXLEtBQUssTUFBTSxlQUFlLFdBQVc7QUFBQSxJQUMzRTtBQUNBLFVBQU0sNEJBQTRCLE1BQU07QUFDdkMsWUFBTSxPQUFPLHlCQUF5QjtBQUN0QyxhQUFPLENBQUMsQ0FBQyxRQUFRLGlCQUFpQix1QkFBdUIsQ0FBQyx3QkFBd0IsTUFBTSxjQUFjO0FBQUEsSUFDdkc7QUFFQSxRQUFJLDBCQUEwQixHQUFHO0FBQ2hDLGlCQUFXLE1BQU0sMkRBQTJELFdBQVcsc0NBQXNDO0FBQUEsSUFDOUgsT0FBTztBQUNOLGdCQUFVO0FBQUEsUUFBWTtBQUFBO0FBQUEsUUFBa0M7QUFBQSxNQUFLO0FBQUEsSUFDOUQ7QUFFQSxRQUFJLFVBQVUsZUFBZSxJQUFJLEVBQUUsT0FBTyxlQUFlLENBQUMsMEJBQTBCLEdBQUc7QUFDdEYsWUFBTSxXQUFXLFVBQVUsZUFBZSxJQUFJLEVBQUU7QUFDaEQsWUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLGtCQUErQixDQUFDO0FBQ2xFLFlBQU0sV0FBVyxNQUFNO0FBQ3RCLFlBQUksVUFBVSxlQUFlLElBQUksRUFBRSxPQUFPLFVBQVU7QUFDbkQsZ0JBQU0sTUFBTTtBQUNaO0FBQUEsUUFDRDtBQUNBLFlBQUksMEJBQTBCLEdBQUc7QUFDaEMscUJBQVcsTUFBTSwyREFBMkQsV0FBVywwREFBMEQ7QUFDakosZ0JBQU0sTUFBTTtBQUNaO0FBQUEsUUFDRDtBQUNBLGNBQU0sUUFBUSxVQUFVLG9CQUFvQixJQUFJO0FBQ2hELFlBQUksTUFBTSxhQUFhLFdBQVcsS0FBSyxNQUFNLGVBQWUsV0FBVyxHQUFHO0FBQ3pFLG9CQUFVO0FBQUEsWUFBWTtBQUFBO0FBQUEsWUFBa0M7QUFBQSxVQUFLO0FBQzdELGNBQUksVUFBVSxlQUFlLElBQUksRUFBRSxPQUFPLGFBQWE7QUFDdEQsa0JBQU0sTUFBTTtBQUFBLFVBQ2I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUSxRQUFRLFlBQVU7QUFDL0IsY0FBTSxRQUFRLFVBQVUsb0JBQW9CLEtBQUssTUFBTTtBQUN2RCxlQUFPLE1BQU0sSUFBSSxNQUFNLFlBQVksUUFBUSxDQUFDO0FBQzVDLGlCQUFTO0FBQUEsTUFDVixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDQSxNQUFJLDBCQUEwQixzQkFBc0Isc0JBQXNCLEdBQUc7QUFDNUUsY0FBVSxtQkFBbUIsc0JBQXNCO0FBQUEsRUFDcEQ7QUFFQSxZQUFVLDRCQUE0QjtBQUV0QyxRQUFNLHdCQUF3QixNQUFNLGlCQUFpQjtBQUFBLElBQ3BEO0FBQUEsSUFDQTtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sa0JBQWtCLDJCQUEyQixJQUFJO0FBQUEsRUFDbEQsSUFBSTtBQUNKLFFBQU0seUJBQXlCLHNCQUFzQjtBQUNyRCxNQUFJLDBCQUEwQixDQUFDLFVBQVU7QUFBQSxJQUF3QjtBQUFBO0FBQUEsSUFBNkM7QUFBQSxFQUFLLEdBQUc7QUFDckgsVUFBTSxXQUFXLFVBQVUsc0JBQXNCLElBQUksR0FBRztBQUN4RCxVQUFNLFFBQVEsWUFBWSxJQUFJLElBQUksa0JBQStCLENBQUM7QUFDbEUsVUFBTSxRQUFRLE1BQU07QUFBQSxNQUNuQixzQkFBc0I7QUFBQSxNQUN0QixNQUFNLG9CQUFvQixrQkFBa0IsMEJBQTBCO0FBQUEsSUFDdkUsRUFBRSxNQUFNO0FBQ1AsVUFBSSxVQUFVLHNCQUFzQixJQUFJLEdBQUcsZUFBZSxVQUFVO0FBQ25FLGNBQU0sTUFBTTtBQUNaO0FBQUEsTUFDRDtBQUNBLFlBQU0sa0JBQWtCLHNCQUFzQjtBQUM5QyxVQUFJLG1CQUFtQixVQUFVO0FBQUEsUUFBd0I7QUFBQTtBQUFBLFFBQXNDO0FBQUEsTUFBSyxHQUFHO0FBQ3RHLGNBQU0sTUFBTTtBQUFBLE1BQ2I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBRUEsY0FBWSxJQUFJLFVBQVUsWUFBWSx3QkFBd0IsTUFBTTtBQUNuRSxlQUFXO0FBQUEsRUFDWixDQUFDLENBQUM7QUFFRixZQUFVLE9BQU8sR0FBRztBQUNwQixpQkFBZSxNQUFNO0FBQ3BCLFFBQUksQ0FBQyxZQUFZLFlBQVk7QUFDNUIsZ0JBQVUsT0FBTyxHQUFHO0FBQUEsSUFDckI7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxJQUFJLHlCQUF5QiwrQkFBK0IsYUFBVztBQUNqSCxlQUFXLFNBQVMsU0FBUztBQUM1QixZQUFNLFFBQVEsTUFBTSxZQUFZO0FBQ2hDLFVBQUksUUFBUSxHQUFHO0FBQ2Qsa0JBQVUsT0FBTyxLQUFLO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBQUEsRUFDRCxHQUFHLElBQUksVUFBVSxVQUFVLENBQUMsQ0FBQztBQUM3QixjQUFZLElBQUksZUFBZSxRQUFRLFVBQVUsQ0FBQztBQUVsRCxRQUFNLGFBQWEsSUFBSSxPQUFPLE1BQU0sRUFBRSxtREFBbUQsQ0FBQztBQUMxRixRQUFNLG1CQUFtQixTQUFTLDJCQUEyQix1REFBdUQ7QUFDcEgsUUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUksU0FBUyxrQkFBa0IsTUFBTSxTQUFTLHFCQUFxQixDQUFDO0FBQzVHLE1BQUksT0FBTyxZQUFZLGdCQUFnQixPQUFPO0FBQzlDLFFBQU0sZUFBZSxJQUFJLE9BQU8sWUFBWSxFQUFFLHVDQUF1QyxRQUFXLGdCQUFnQixDQUFDO0FBQ2pILFFBQU0sYUFBYSxDQUFDLFVBQW1CO0FBQ3RDLFFBQUksZ0JBQWdCLFlBQVksT0FBTztBQUN0QyxzQkFBZ0IsVUFBVTtBQUFBLElBQzNCO0FBQ0EsVUFBTSxVQUFVO0FBQUEsRUFDakI7QUFDQSxjQUFZLElBQUksZ0JBQWdCLFNBQVMsTUFBTTtBQUM5QyxVQUFNLFVBQVUsZ0JBQWdCO0FBQUEsRUFDakMsQ0FBQyxDQUFDO0FBQ0YsY0FBWSxJQUFJLElBQUksOEJBQThCLGNBQWMsU0FBUyxNQUFNO0FBQzlFLGVBQVcsQ0FBQyxnQkFBZ0IsT0FBTztBQUFBLEVBQ3BDLENBQUMsQ0FBQztBQUVGLFNBQU87QUFBQSxJQUNOLFdBQVcsTUFBTSxVQUFVLFlBQVksU0FBUztBQUFBLElBQ2hELFNBQVMsTUFBTSxVQUFVLGVBQWUsSUFBSSxFQUFFO0FBQUEsSUFDOUMsb0JBQW9CLE1BQU0sVUFBVSwwQkFBMEIsSUFBSTtBQUFBLElBQ2xFLFlBQVksTUFBTSxVQUFVLHNCQUFzQixJQUFJLEdBQUc7QUFBQSxJQUN6RCxXQUFXLE1BQU0sZUFBZTtBQUFBLElBQ2hDLDhCQUE4QixNQUFNO0FBQ25DLG9DQUE4QjtBQUM5QixhQUFPLG1DQUFtQyxZQUFZO0FBQUEsSUFDdkQ7QUFBQSxJQUNBLHNCQUFzQixNQUFNO0FBRTNCLGFBQU8sTUFBTSxLQUFLLEtBQUssaUJBQThCLHNEQUFzRCxDQUFDO0FBQUEsSUFDN0c7QUFBQSxFQUNEO0FBQ0Q7QUFRQSxTQUFTLG1CQUEyQztBQUNuRCxRQUFNLFVBQXlCLENBQUM7QUFDaEMsV0FBUyxPQUFPLEdBQUcsT0FBTyxJQUFJLFFBQVE7QUFDckMsYUFBUyxTQUFTLEdBQUcsU0FBUyxJQUFJLFVBQVUsSUFBSTtBQUMvQyxZQUFNLFNBQVMsT0FBTyxLQUFLLE9BQU87QUFDbEMsWUFBTSxTQUFTLFNBQVMsSUFBSSxLQUFNLE9BQU8sS0FBSyxPQUFPLEtBQUs7QUFDMUQsWUFBTSxhQUFhLE9BQU8sU0FBUyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQ3BELGNBQVEsS0FBSztBQUFBLFFBQ1o7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPLEdBQUcsTUFBTSxJQUFJLFVBQVUsSUFBSSxNQUFNO0FBQUEsTUFDekMsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyx1QkFBdUIsTUFBYyxRQUF3QjtBQUNyRSxRQUFNLFdBQVcsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLElBQUksT0FBTyxDQUFDLENBQUM7QUFDbkQsUUFBTSxhQUFhLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxJQUFJLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZELFFBQU0sT0FBTyxLQUFLLE1BQU0sYUFBYSxFQUFFLElBQUk7QUFDM0MsUUFBTSxjQUFjLGNBQWMsTUFBTSxTQUFTLEtBQUssV0FBVyxLQUFLLEtBQUs7QUFDM0UsU0FBTyxjQUFjLElBQUk7QUFDMUI7QUFFTyxTQUFTLHNCQUNmLFlBQ0EsT0FDQSxZQUNBLE1BQ0EsV0FDQSxXQUNPO0FBQ1AsYUFBVyxZQUFZLE1BQU0sS0FBSyxLQUFLLE1BQU0sS0FDMUMsU0FBUyxnQ0FBZ0MsbUJBQW1CLElBQzVEO0FBQ0gsYUFBVyxjQUFjLFVBQVUsRUFBRSxLQUFLLE1BQU0sS0FDN0MsU0FBUyxrQ0FBa0MscUJBQXFCLElBQ2hFO0FBQ0gsYUFBVyxjQUFjLENBQUMsTUFBTSxhQUM1QixDQUFDLE1BQU0sY0FDUixTQUFTLGtDQUFrQywrQkFBK0IsSUFDMUU7QUFDSCxhQUFXLG1CQUFtQixDQUFDLE1BQU0saUJBQWtCLE1BQU0sZUFBZSxDQUFDLE1BQU0sYUFDaEYsU0FBUyx1Q0FBdUMsMkJBQTJCLElBQzNFO0FBQ0gsYUFBVyxjQUFjLENBQUMsTUFBTSxlQUFlLE1BQU0sa0JBQWtCLGNBQWMsQ0FBQyxVQUFVLElBQzdGLFNBQVMsa0NBQWtDLDhDQUE4QyxJQUN6RjtBQUVILFFBQU0sUUFBUSxDQUFDLFdBQVcsYUFBYSxDQUFDLFdBQVcsZUFBZSxDQUFDLFdBQVcsZUFBZSxDQUFDLFdBQVcsb0JBQW9CLENBQUMsV0FBVztBQUN6SSxNQUFJLFlBQVk7QUFDZixlQUFXLFVBQVU7QUFBQSxFQUN0QjtBQUNBLE9BQUssVUFBVSxPQUFPLDJCQUEyQixDQUFDLEtBQUs7QUFDeEQ7QUFHTyxNQUFNLG1DQUFtQyxnQkFBZ0I7QUFBQSxFQUF6RDtBQUFBO0FBQ04sU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLGtCQUErQixDQUFDO0FBQUE7QUFBQSxFQUd2RixlQUFlLE9BQXVDO0FBQ3JELFNBQUssY0FBYztBQUNuQixTQUFLLGlCQUFpQixRQUFRLFFBQVEsWUFBVTtBQUMvQyxZQUFNLGVBQWUsS0FBSyxNQUFNO0FBQ2hDLFdBQUssb0JBQW9CO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVtQixZQUFxQjtBQUN2QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRW1CLDBCQUFtQztBQUNyRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRW1CLGNBQXVEO0FBQ3pFLFVBQU0sUUFBUSxNQUFNLFlBQVk7QUFDaEMsVUFBTSxjQUFxRDtBQUFBLE1BQzFELE1BQU0sbUJBQW1CO0FBQUEsTUFDekIsT0FBTyxTQUFTLCtCQUErQixjQUFjO0FBQUEsTUFDN0QsYUFBYSxTQUFTLDJDQUEyQyxpQ0FBaUM7QUFBQSxNQUNsRyxPQUFPLEVBQUUsT0FBTyxJQUFJLE1BQU0sUUFBUSxrQkFBa0I7QUFBQSxNQUNwRCxNQUFNO0FBQUEsUUFDTCxTQUFTLEtBQUssYUFBYSxlQUFlO0FBQUEsUUFDMUMsS0FBSyxNQUFNLEtBQUssYUFBYSxhQUFhLElBQUk7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFDQSxXQUFPLE1BQU0sU0FBUyxJQUNuQixDQUFDLGFBQWEsRUFBRSxNQUFNLG1CQUFtQixXQUFXLE9BQU8sR0FBRyxHQUFHLEdBQUcsS0FBSyxJQUN6RSxDQUFDLFdBQVc7QUFBQSxFQUNoQjtBQUFBLEVBRUEsTUFBeUIsb0JBQW9CLE1BQThDO0FBQzFGLFVBQU0sVUFBVSxNQUFNLE1BQU0sb0JBQW9CLElBQUk7QUFDcEQsVUFBTSxpQkFBaUIsS0FBSztBQUM1QixRQUFJLFdBQVcsbUJBQW1CLEtBQUssYUFBYSxLQUFLLHNCQUFzQixTQUFZO0FBQzFGLFdBQUssYUFBYSxhQUFhLE9BQU8sY0FBYztBQUFBLElBQ3JEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixrQkFBa0IsV0FBcUM7QUFDekUsV0FBTyxDQUFDLEtBQUssYUFBYSxlQUFlLE1BQU0sa0JBQWtCLFNBQVM7QUFBQSxFQUMzRTtBQUFBLEVBRW1CLG9CQUFvQixTQUE0QjtBQUNsRSxRQUFJLFVBQVUsT0FBTztBQUNyQixVQUFNLFlBQVksS0FBSyxrQkFBa0I7QUFDekMsVUFBTSxjQUFjLEtBQUssYUFBYSxnQkFBZ0I7QUFDdEQsVUFBTSxRQUFRLGNBQ1gsU0FBUywrQkFBK0IsY0FBYyxJQUN0RCxXQUFXLFNBQVMsU0FBUyxpQkFBaUIsV0FBVztBQUM1RCxVQUFNLE9BQU8sY0FBYyxRQUFRLG9CQUFvQixXQUFXLFFBQVEsUUFBUTtBQUVsRixZQUFRLGFBQWEsY0FBYyxhQUFhLGNBQzdDLFNBQVMscURBQXFELDBCQUEwQixLQUFLLElBQzdGLFNBQVMsaURBQWlELHNDQUFzQyxDQUFDO0FBRXBHLFVBQU0sZUFBZSxJQUFJLE9BQU8sU0FBUyxXQUFXLElBQUksQ0FBQztBQUN6RCxpQkFBYSxhQUFhLGVBQWUsTUFBTTtBQUMvQyxRQUFJLE9BQU8sU0FBUyxFQUFFLHFDQUFxQyxRQUFXLEtBQUssQ0FBQztBQUM1RSxVQUFNLFVBQVUsSUFBSSxPQUFPLFNBQVMsV0FBVyxRQUFRLGtCQUFrQixDQUFDO0FBQzFFLFlBQVEsVUFBVSxJQUFJLGdDQUFnQztBQUN0RCxZQUFRLGFBQWEsZUFBZSxNQUFNO0FBQUEsRUFDM0M7QUFBQSxFQUVtQix1QkFBd0Q7QUFDMUUsV0FBTyxNQUFNLHFCQUFxQixFQUFFLE9BQU8sT0FBSyxFQUFFLFVBQVUsNkJBQTZCO0FBQUEsRUFDMUY7QUFDRDtBQUVPLE1BQU0seUNBQXlDLDJCQUEyQjtBQUFBLEVBR2hGLGlCQUFpQixlQUE4QztBQUM5RCxTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFUyxXQUFXLFFBQVEsT0FBTyxRQUE0QjtBQUM5RCxVQUFNLGlCQUFpQixVQUFVLEtBQUs7QUFDdEMsUUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssaUJBQWlCLENBQUMsb0NBQW9DLEtBQUssYUFBYSxHQUFHO0FBQ3ZHLFlBQU0sV0FBVyxPQUFPLE1BQU07QUFDOUI7QUFBQSxJQUNEO0FBQ0EsU0FBSztBQUFBLE1BQ0osS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBLEtBQUssWUFBWTtBQUFBLE1BQ2pCLFVBQVE7QUFBRSxhQUFLLEtBQUssb0JBQW9CLElBQUk7QUFBQSxNQUFHO0FBQUEsTUFDL0MsS0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFDRDtBQUdBLG9CQUFvQixpQ0FBaUM7QUFBQSxFQUNwRCxJQUFJO0FBQUEsRUFDSixRQUFRLGlCQUFpQixnQkFBZ0I7QUFBQSxFQUN6QyxNQUFNLGVBQWU7QUFBQSxJQUNwQixrQkFBa0I7QUFBQSxJQUNsQixnQkFBZ0I7QUFBQSxFQUNqQjtBQUFBLEVBQ0EsU0FBUyxRQUFRO0FBQUEsRUFDakIsU0FBUyxDQUFDLGFBQWE7QUFDdEIsVUFBTSxTQUFTLFNBQVMsSUFBSSxrQkFBa0IsRUFBRSxxQkFBcUI7QUFDckUsWUFBUSxRQUFRLFlBQVksUUFBUSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDbkQ7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
