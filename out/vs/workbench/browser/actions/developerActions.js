import "./media/actions.css";
import { localize, localize2 } from "../../../nls.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { DomEmitter } from "../../../base/browser/event.js";
import { Color } from "../../../base/common/color.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { toDisposable, dispose, DisposableStore, setDisposableTracker, DisposableTracker } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { getDomNodePagePosition, append, $, getActiveDocument, onDidRegisterWindow, getWindows } from "../../../base/browser/dom.js";
import { createCSSRule, createStyleSheet } from "../../../base/browser/domStylesheets.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../platform/contextkey/common/contextkey.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { raceTimeout, RunOnceScheduler } from "../../../base/common/async.js";
import { ILayoutService } from "../../../platform/layout/browser/layoutService.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { registerAction2, Action2, MenuRegistry } from "../../../platform/actions/common/actions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { clamp } from "../../../base/common/numbers.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Extensions as ConfigurationExtensions } from "../../../platform/configuration/common/configurationRegistry.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { IWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackup.js";
import { ResultKind } from "../../../platform/keybinding/common/keybindingResolver.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IOutputService } from "../../services/output/common/output.js";
import { windowLogId } from "../../services/log/common/logConstants.js";
import { ByteSize } from "../../../platform/files/common/files.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IUserDataProfileService } from "../../services/userDataProfile/common/userDataProfile.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import product from "../../../platform/product/common/product.js";
import { CommandsRegistry, ICommandService } from "../../../platform/commands/common/commands.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { IAuthenticationService } from "../../services/authentication/common/authentication.js";
import { IAuthenticationAccessService } from "../../services/authentication/browser/authenticationAccessService.js";
import { IPolicyService, PolicyValueSource } from "../../../platform/policy/common/policy.js";
import { COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_STRICT_MARKETPLACES_KEY, INativeManagedSettingsService, IFileManagedSettingsService, normalizeManagedSettings, projectManagedSettings, pickManagedSettings } from "../../../platform/policy/common/copilotManagedSettings.js";
import { APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, IAccountPolicyGateService } from "../../services/policies/common/accountPolicyService.js";
import { adaptManagedSettings, appendManagedSettingsClientIdentity } from "../../services/accounts/browser/managedSettings.js";
import { isObject } from "../../../base/common/types.js";
import * as json from "../../../base/common/json.js";
import { getParseErrorMessage } from "../../../base/common/jsonErrorMessages.js";
import { IAgentHostService } from "../../../platform/agentHost/common/agentService.js";
import { IAgentHostEnablementService } from "../../../platform/agentHost/common/agentHostEnablementService.js";
import { IProgressService, ProgressLocation } from "../../../platform/progress/common/progress.js";
import { INotificationService } from "../../../platform/notification/common/notification.js";
import { markdownDetails, markdownJsonBlock, markdownTable, markdownText } from "./policyDiagnosticsMarkdown.js";
class InspectContextKeysAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.inspectContextKeys",
      title: localize2("inspect context keys", "Inspect Context Keys"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const contextKeyService = accessor.get(IContextKeyService);
    const disposables = new DisposableStore();
    const stylesheet = createStyleSheet(void 0, void 0, disposables);
    createCSSRule("*", "cursor: crosshair !important;", stylesheet);
    const hoverFeedback = document.createElement("div");
    const activeDocument = getActiveDocument();
    activeDocument.body.appendChild(hoverFeedback);
    disposables.add(toDisposable(() => hoverFeedback.remove()));
    hoverFeedback.style.position = "absolute";
    hoverFeedback.style.pointerEvents = "none";
    hoverFeedback.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
    hoverFeedback.style.zIndex = "1000";
    const onMouseMove = disposables.add(new DomEmitter(activeDocument, "mousemove", true));
    disposables.add(onMouseMove.event((e) => {
      const target = e.target;
      const position = getDomNodePagePosition(target);
      hoverFeedback.style.top = `${position.top}px`;
      hoverFeedback.style.left = `${position.left}px`;
      hoverFeedback.style.width = `${position.width}px`;
      hoverFeedback.style.height = `${position.height}px`;
    }));
    const onMouseDown = disposables.add(new DomEmitter(activeDocument, "mousedown", true));
    Event.once(onMouseDown.event)((e) => {
      e.preventDefault();
      e.stopPropagation();
    }, null, disposables);
    const onMouseUp = disposables.add(new DomEmitter(activeDocument, "mouseup", true));
    Event.once(onMouseUp.event)((e) => {
      e.preventDefault();
      e.stopPropagation();
      const context = contextKeyService.getContext(e.target);
      console.log(context.collectAllValues());
      dispose(disposables);
    }, null, disposables);
  }
}
class ToggleScreencastModeAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleScreencastMode",
      title: localize2("toggle screencast mode", "Toggle Screencast Mode"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    if (ToggleScreencastModeAction.disposable) {
      ToggleScreencastModeAction.disposable.dispose();
      ToggleScreencastModeAction.disposable = void 0;
      return;
    }
    const layoutService = accessor.get(ILayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const keybindingService = accessor.get(IKeybindingService);
    const disposables = new DisposableStore();
    const container = layoutService.activeContainer;
    const mouseMarker = append(container, $(".screencast-mouse"));
    disposables.add(toDisposable(() => mouseMarker.remove()));
    const keyboardMarker = append(container, $(".screencast-keyboard"));
    disposables.add(toDisposable(() => keyboardMarker.remove()));
    const onMouseDown = disposables.add(new Emitter());
    const onMouseUp = disposables.add(new Emitter());
    const onMouseMove = disposables.add(new Emitter());
    function registerContainerListeners(container2, windowDisposables) {
      const listeners = new DisposableStore();
      listeners.add(listeners.add(new DomEmitter(container2, "mousedown", true)).event((e) => onMouseDown.fire(e)));
      listeners.add(listeners.add(new DomEmitter(container2, "mouseup", true)).event((e) => onMouseUp.fire(e)));
      listeners.add(listeners.add(new DomEmitter(container2, "mousemove", true)).event((e) => onMouseMove.fire(e)));
      windowDisposables.add(listeners);
      disposables.add(toDisposable(() => windowDisposables.delete(listeners)));
      disposables.add(listeners);
    }
    for (const { window, disposables: disposables2 } of getWindows()) {
      registerContainerListeners(layoutService.getContainer(window), disposables2);
    }
    disposables.add(onDidRegisterWindow(({ window, disposables: disposables2 }) => registerContainerListeners(layoutService.getContainer(window), disposables2)));
    disposables.add(layoutService.onDidChangeActiveContainer(() => {
      layoutService.activeContainer.appendChild(mouseMarker);
      layoutService.activeContainer.appendChild(keyboardMarker);
    }));
    const updateMouseIndicatorColor = () => {
      mouseMarker.style.borderColor = Color.fromHex(configurationService.getValue("screencastMode.mouseIndicatorColor")).toString();
    };
    let mouseIndicatorSize;
    const updateMouseIndicatorSize = () => {
      mouseIndicatorSize = clamp(configurationService.getValue("screencastMode.mouseIndicatorSize") || 20, 20, 100);
      mouseMarker.style.height = `${mouseIndicatorSize}px`;
      mouseMarker.style.width = `${mouseIndicatorSize}px`;
    };
    updateMouseIndicatorColor();
    updateMouseIndicatorSize();
    disposables.add(onMouseDown.event((e) => {
      mouseMarker.style.top = `${e.clientY - mouseIndicatorSize / 2}px`;
      mouseMarker.style.left = `${e.clientX - mouseIndicatorSize / 2}px`;
      mouseMarker.style.display = "block";
      mouseMarker.style.transform = `scale(${1})`;
      mouseMarker.style.transition = "transform 0.1s";
      const mouseMoveListener = onMouseMove.event((e2) => {
        mouseMarker.style.top = `${e2.clientY - mouseIndicatorSize / 2}px`;
        mouseMarker.style.left = `${e2.clientX - mouseIndicatorSize / 2}px`;
        mouseMarker.style.transform = `scale(${0.8})`;
      });
      Event.once(onMouseUp.event)(() => {
        mouseMarker.style.display = "none";
        mouseMoveListener.dispose();
      });
    }));
    const updateKeyboardFontSize = () => {
      keyboardMarker.style.fontSize = `${clamp(configurationService.getValue("screencastMode.fontSize") || 56, 20, 100)}px`;
    };
    const updateKeyboardMarker = () => {
      keyboardMarker.style.bottom = `${clamp(configurationService.getValue("screencastMode.verticalOffset") || 0, 0, 90)}%`;
    };
    let keyboardMarkerTimeout;
    const updateKeyboardMarkerTimeout = () => {
      keyboardMarkerTimeout = clamp(configurationService.getValue("screencastMode.keyboardOverlayTimeout") || 800, 500, 5e3);
    };
    updateKeyboardFontSize();
    updateKeyboardMarker();
    updateKeyboardMarkerTimeout();
    disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("screencastMode.verticalOffset")) {
        updateKeyboardMarker();
      }
      if (e.affectsConfiguration("screencastMode.fontSize")) {
        updateKeyboardFontSize();
      }
      if (e.affectsConfiguration("screencastMode.keyboardOverlayTimeout")) {
        updateKeyboardMarkerTimeout();
      }
      if (e.affectsConfiguration("screencastMode.mouseIndicatorColor")) {
        updateMouseIndicatorColor();
      }
      if (e.affectsConfiguration("screencastMode.mouseIndicatorSize")) {
        updateMouseIndicatorSize();
      }
    }));
    const onKeyDown = disposables.add(new Emitter());
    const onCompositionStart = disposables.add(new Emitter());
    const onCompositionUpdate = disposables.add(new Emitter());
    const onCompositionEnd = disposables.add(new Emitter());
    function registerWindowListeners(window, windowDisposables) {
      const listeners = new DisposableStore();
      listeners.add(listeners.add(new DomEmitter(window, "keydown", true)).event((e) => onKeyDown.fire(e)));
      listeners.add(listeners.add(new DomEmitter(window, "compositionstart", true)).event((e) => onCompositionStart.fire(e)));
      listeners.add(listeners.add(new DomEmitter(window, "compositionupdate", true)).event((e) => onCompositionUpdate.fire(e)));
      listeners.add(listeners.add(new DomEmitter(window, "compositionend", true)).event((e) => onCompositionEnd.fire(e)));
      windowDisposables.add(listeners);
      disposables.add(toDisposable(() => windowDisposables.delete(listeners)));
      disposables.add(listeners);
    }
    for (const { window, disposables: disposables2 } of getWindows()) {
      registerWindowListeners(window, disposables2);
    }
    disposables.add(onDidRegisterWindow(({ window, disposables: disposables2 }) => registerWindowListeners(window, disposables2)));
    let length = 0;
    let composing = void 0;
    let imeBackSpace = false;
    const clearKeyboardScheduler = disposables.add(new RunOnceScheduler(() => {
      keyboardMarker.textContent = "";
      composing = void 0;
      length = 0;
    }, keyboardMarkerTimeout));
    disposables.add(onCompositionStart.event((e) => {
      imeBackSpace = true;
    }));
    disposables.add(onCompositionUpdate.event((e) => {
      if (e.data && imeBackSpace) {
        if (length > 20) {
          keyboardMarker.innerText = "";
          length = 0;
        }
        composing = composing ?? append(keyboardMarker, $("span.key"));
        composing.textContent = e.data;
      } else if (imeBackSpace) {
        keyboardMarker.innerText = "";
        append(keyboardMarker, $("span.key", {}, `Backspace`));
      }
      clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
    }));
    disposables.add(onCompositionEnd.event((e) => {
      composing = void 0;
      length++;
    }));
    disposables.add(onKeyDown.event((e) => {
      if (e.key === "Process" || /[\uac00-\ud787\u3131-\u314e\u314f-\u3163\u3041-\u3094\u30a1-\u30f4\u30fc\u3005\u3006\u3024\u4e00-\u9fa5]/u.test(e.key)) {
        if (e.code === "Backspace") {
          imeBackSpace = true;
        } else if (!e.code.includes("Key")) {
          composing = void 0;
          imeBackSpace = false;
        } else {
          imeBackSpace = true;
        }
        clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
        return;
      }
      if (e.isComposing) {
        return;
      }
      const options = configurationService.getValue("screencastMode.keyboardOptions");
      const event = new StandardKeyboardEvent(e);
      const shortcut = keybindingService.softDispatch(event, event.target);
      if (shortcut.kind === ResultKind.KbFound && shortcut.commandId && !(options.showSingleEditorCursorMoves ?? true) && ["cursorLeft", "cursorRight", "cursorUp", "cursorDown"].includes(shortcut.commandId)) {
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || length > 20 || event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Escape || event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.RightArrow) {
        keyboardMarker.innerText = "";
        length = 0;
      }
      const keybinding = keybindingService.resolveKeyboardEvent(event);
      const commandDetails = this._isKbFound(shortcut) && shortcut.commandId ? this.getCommandDetails(shortcut.commandId) : void 0;
      let commandAndGroupLabel = commandDetails?.title;
      let keyLabel = keybinding.getLabel();
      if (commandDetails) {
        if ((options.showCommandGroups ?? false) && commandDetails.category) {
          commandAndGroupLabel = `${commandDetails.category}: ${commandAndGroupLabel} `;
        }
        if (this._isKbFound(shortcut) && shortcut.commandId) {
          const keybindings = keybindingService.lookupKeybindings(shortcut.commandId).filter((k) => k.getLabel()?.endsWith(keyLabel ?? ""));
          if (keybindings.length > 0) {
            keyLabel = keybindings[keybindings.length - 1].getLabel();
          }
        }
      }
      if ((options.showCommands ?? true) && commandAndGroupLabel) {
        append(keyboardMarker, $("span.title", {}, `${commandAndGroupLabel} `));
      }
      if ((options.showKeys ?? true) || (options.showKeybindings ?? true) && this._isKbFound(shortcut)) {
        keyLabel = keyLabel?.replace("UpArrow", "\u2191")?.replace("DownArrow", "\u2193")?.replace("LeftArrow", "\u2190")?.replace("RightArrow", "\u2192");
        append(keyboardMarker, $("span.key", {}, keyLabel ?? ""));
      }
      length++;
      clearKeyboardScheduler.schedule(keyboardMarkerTimeout);
    }));
    ToggleScreencastModeAction.disposable = disposables;
  }
  _isKbFound(resolutionResult) {
    return resolutionResult.kind === ResultKind.KbFound;
  }
  getCommandDetails(commandId) {
    const fromMenuRegistry = MenuRegistry.getCommand(commandId);
    if (fromMenuRegistry) {
      return {
        title: typeof fromMenuRegistry.title === "string" ? fromMenuRegistry.title : fromMenuRegistry.title.value,
        category: fromMenuRegistry.category ? typeof fromMenuRegistry.category === "string" ? fromMenuRegistry.category : fromMenuRegistry.category.value : void 0
      };
    }
    const fromCommandsRegistry = CommandsRegistry.getCommand(commandId);
    if (fromCommandsRegistry?.metadata?.description) {
      return { title: typeof fromCommandsRegistry.metadata.description === "string" ? fromCommandsRegistry.metadata.description : fromCommandsRegistry.metadata.description.value };
    }
    return void 0;
  }
}
class LogStorageAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.logStorage",
      title: localize2({ key: "logStorage", comment: ["A developer only action to log the contents of the storage for the current window."] }, "Log Storage Database Contents"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const storageService = accessor.get(IStorageService);
    const dialogService = accessor.get(IDialogService);
    storageService.log();
    dialogService.info(localize("storageLogDialogMessage", "The storage database contents have been logged to the developer tools."), localize("storageLogDialogDetails", "Open developer tools from the menu and select the Console tab."));
  }
}
class LogWorkingCopiesAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.logWorkingCopies",
      title: localize2({ key: "logWorkingCopies", comment: ["A developer only action to log the working copies that exist."] }, "Log Working Copies"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const workingCopyService = accessor.get(IWorkingCopyService);
    const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
    const logService = accessor.get(ILogService);
    const outputService = accessor.get(IOutputService);
    const backups = await workingCopyBackupService.getBackups();
    const msg = [
      ``,
      `[Working Copies]`,
      ...workingCopyService.workingCopies.length > 0 ? workingCopyService.workingCopies.map((workingCopy) => `${workingCopy.isDirty() ? "\u25CF " : ""}${workingCopy.resource.toString(true)} (typeId: ${workingCopy.typeId || "<no typeId>"})`) : ["<none>"],
      ``,
      `[Backups]`,
      ...backups.length > 0 ? backups.map((backup) => `${backup.resource.toString(true)} (typeId: ${backup.typeId || "<no typeId>"})`) : ["<none>"]
    ];
    logService.info(msg.join("\n"));
    outputService.showChannel(windowLogId, true);
  }
}
const _RemoveLargeStorageEntriesAction = class _RemoveLargeStorageEntriesAction extends Action2 {
  // 16kb
  constructor() {
    super({
      id: "workbench.action.removeLargeStorageDatabaseEntries",
      title: localize2("removeLargeStorageDatabaseEntries", "Remove Large Storage Database Entries..."),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const storageService = accessor.get(IStorageService);
    const quickInputService = accessor.get(IQuickInputService);
    const userDataProfileService = accessor.get(IUserDataProfileService);
    const dialogService = accessor.get(IDialogService);
    const environmentService = accessor.get(IEnvironmentService);
    const items = [];
    for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) {
      if (scope === StorageScope.PROFILE && userDataProfileService.currentProfile.isDefault) {
        continue;
      }
      for (const target of [StorageTarget.MACHINE, StorageTarget.USER]) {
        for (const key of storageService.keys(scope, target)) {
          const value = storageService.get(key, scope);
          if (value && (!environmentService.isBuilt || value.length > _RemoveLargeStorageEntriesAction.SIZE_THRESHOLD)) {
            items.push({
              key,
              scope,
              target,
              size: value.length,
              label: key,
              description: ByteSize.formatSize(value.length),
              detail: localize("largeStorageItemDetail", "Scope: {0}, Target: {1}", scope === StorageScope.APPLICATION ? localize("global", "Global") : scope === StorageScope.PROFILE ? localize("profile", "Profile") : localize("workspace", "Workspace"), target === StorageTarget.MACHINE ? localize("machine", "Machine") : localize("user", "User"))
            });
          }
        }
      }
    }
    items.sort((itemA, itemB) => itemB.size - itemA.size);
    const selectedItems = await new Promise((resolve) => {
      const disposables = new DisposableStore();
      const picker = disposables.add(quickInputService.createQuickPick());
      picker.items = items;
      picker.canSelectMany = true;
      picker.ok = false;
      picker.customButton = true;
      picker.hideCheckAll = true;
      picker.customLabel = localize("removeLargeStorageEntriesPickerButton", "Remove");
      picker.placeholder = localize("removeLargeStorageEntriesPickerPlaceholder", "Select large entries to remove from storage");
      if (items.length === 0) {
        picker.description = localize("removeLargeStorageEntriesPickerDescriptionNoEntries", "There are no large storage entries to remove.");
      }
      picker.show();
      disposables.add(picker.onDidCustom(() => {
        resolve(picker.selectedItems);
        picker.hide();
      }));
      disposables.add(picker.onDidHide(() => disposables.dispose()));
    });
    if (selectedItems.length === 0) {
      return;
    }
    const { confirmed } = await dialogService.confirm({
      type: "warning",
      message: localize("removeLargeStorageEntriesConfirmRemove", "Do you want to remove the selected storage entries from the database?"),
      detail: localize("removeLargeStorageEntriesConfirmRemoveDetail", "{0}\n\nThis action is irreversible and may result in data loss!", selectedItems.map((item) => item.label).join("\n")),
      primaryButton: localize({ key: "removeLargeStorageEntriesButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Remove")
    });
    if (!confirmed) {
      return;
    }
    const scopesToOptimize = /* @__PURE__ */ new Set();
    for (const item of selectedItems) {
      storageService.remove(item.key, item.scope);
      scopesToOptimize.add(item.scope);
    }
    for (const scope of scopesToOptimize) {
      await storageService.optimize(scope);
    }
  }
};
_RemoveLargeStorageEntriesAction.SIZE_THRESHOLD = 1024 * 16;
let RemoveLargeStorageEntriesAction = _RemoveLargeStorageEntriesAction;
let tracker = void 0;
let trackedDisposables = /* @__PURE__ */ new Set();
const DisposablesSnapshotStateContext = new RawContextKey("dirtyWorkingCopies", "stopped");
class StartTrackDisposables extends Action2 {
  constructor() {
    super({
      id: "workbench.action.startTrackDisposables",
      title: localize2("startTrackDisposables", "Start Tracking Disposables"),
      category: Categories.Developer,
      f1: true,
      precondition: ContextKeyExpr.and(DisposablesSnapshotStateContext.isEqualTo("pending").negate(), DisposablesSnapshotStateContext.isEqualTo("started").negate())
    });
  }
  run(accessor) {
    const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
    disposablesSnapshotStateContext.set("started");
    trackedDisposables.clear();
    tracker = new DisposableTracker();
    setDisposableTracker(tracker);
  }
}
class SnapshotTrackedDisposables extends Action2 {
  constructor() {
    super({
      id: "workbench.action.snapshotTrackedDisposables",
      title: localize2("snapshotTrackedDisposables", "Snapshot Tracked Disposables"),
      category: Categories.Developer,
      f1: true,
      precondition: DisposablesSnapshotStateContext.isEqualTo("started")
    });
  }
  run(accessor) {
    const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
    disposablesSnapshotStateContext.set("pending");
    trackedDisposables = new Set(tracker?.computeLeakingDisposables(1e3)?.leaks.map((disposable) => disposable.value));
  }
}
class StopTrackDisposables extends Action2 {
  constructor() {
    super({
      id: "workbench.action.stopTrackDisposables",
      title: localize2("stopTrackDisposables", "Stop Tracking Disposables"),
      category: Categories.Developer,
      f1: true,
      precondition: DisposablesSnapshotStateContext.isEqualTo("pending")
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const disposablesSnapshotStateContext = DisposablesSnapshotStateContext.bindTo(accessor.get(IContextKeyService));
    disposablesSnapshotStateContext.set("stopped");
    if (tracker) {
      const disposableLeaks = /* @__PURE__ */ new Set();
      for (const disposable of new Set(tracker.computeLeakingDisposables(1e3)?.leaks) ?? []) {
        if (trackedDisposables.has(disposable.value)) {
          disposableLeaks.add(disposable);
        }
      }
      const leaks = tracker.computeLeakingDisposables(1e3, Array.from(disposableLeaks));
      if (leaks) {
        editorService.openEditor({ resource: void 0, contents: leaks.details });
      }
    }
    setDisposableTracker(null);
    tracker = void 0;
    trackedDisposables.clear();
  }
}
function managedSettingsSourceLabel(source) {
  switch (source) {
    case "server":
      return "GitHub Server API";
    case "nativeMdm":
      return "Native MDM";
    case "file":
      return "File (managed-settings.json)";
    case "none":
      return "None (no managed settings active)";
  }
}
function managedSettingsSourceShortLabel(source) {
  switch (source) {
    case "server":
      return "Server";
    case "nativeMdm":
      return "Native MDM";
    case "file":
      return "File";
    case "none":
      return "None";
  }
}
function policyValueSourceLabel(source) {
  switch (source) {
    case PolicyValueSource.Device:
      return "Device";
    case PolicyValueSource.NativeMdm:
      return "Managed Settings: Native MDM";
    case PolicyValueSource.ServerManagedSettings:
      return "Managed Settings: Server";
    case PolicyValueSource.FileManagedSettings:
      return "Managed Settings: File";
    case PolicyValueSource.MixedManagedSettings:
      return "Managed Settings: Mixed";
    case PolicyValueSource.Account:
      return "Account";
    case PolicyValueSource.AccountGate:
      return "Account Policy Gate";
    case void 0:
      return "Unknown";
  }
}
function managedSettingsPipeline(rawLabel, raw, normalized, projected, rawUnavailableMessage) {
  let content = `**${markdownText(rawLabel)}**

`;
  content += raw === void 0 ? `*${markdownText(rawUnavailableMessage ?? "Unavailable")}*

` : markdownJsonBlock(raw);
  content += "**Normalized bag**\n\n";
  content += markdownJsonBlock(normalized);
  content += "**VS Code policy projection**\n\n";
  content += markdownJsonBlock(projected);
  return markdownDetails("Source, normalized, and VS Code projection", content);
}
function formatDiagnosticValue(value) {
  return JSON.stringify(value) ?? String(value);
}
const AGENT_RUNTIME_DIAGNOSTICS_TIMEOUT = 6e3;
class PolicyDiagnosticsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.showPolicyDiagnostics",
      title: localize2("policyDiagnostics", "Policy Diagnostics"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const commandService = accessor.get(ICommandService);
    const notificationService = accessor.get(INotificationService);
    const configurationService = accessor.get(IConfigurationService);
    const productService = accessor.get(IProductService);
    const defaultAccountService = accessor.get(IDefaultAccountService);
    const authenticationService = accessor.get(IAuthenticationService);
    const authenticationAccessService = accessor.get(IAuthenticationAccessService);
    const policyService = accessor.get(IPolicyService);
    const accountPolicyGateService = accessor.get(IAccountPolicyGateService);
    const agentHostService = accessor.get(IAgentHostService);
    const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
    const progressService = accessor.get(IProgressService);
    let nativeManagedSettingsService;
    try {
      nativeManagedSettingsService = accessor.get(INativeManagedSettingsService);
    } catch {
    }
    let fileManagedSettingsService;
    try {
      fileManagedSettingsService = accessor.get(IFileManagedSettingsService);
    } catch {
    }
    return progressService.withProgress({
      location: ProgressLocation.Notification,
      title: localize("policyDiagnostics.progress", "Generating policy diagnostics..."),
      type: "loading"
    }, () => this.openPolicyDiagnostics({
      editorService,
      commandService,
      notificationService,
      configurationService,
      productService,
      defaultAccountService,
      authenticationService,
      authenticationAccessService,
      policyService,
      accountPolicyGateService,
      agentHostService,
      agentHostEnablementService,
      nativeManagedSettingsService,
      fileManagedSettingsService
    }));
  }
  async openPolicyDiagnostics(services) {
    const {
      editorService,
      commandService,
      notificationService,
      configurationService,
      productService,
      defaultAccountService,
      authenticationService,
      authenticationAccessService,
      policyService,
      accountPolicyGateService,
      agentHostService,
      agentHostEnablementService,
      nativeManagedSettingsService,
      fileManagedSettingsService
    } = services;
    const configurationRegistry2 = Registry.as(ConfigurationExtensions.Configuration);
    const summary = {
      accountPolicyGate: "Unavailable",
      managedSettingsSources: "Unavailable",
      effectiveManagedSettings: "Unavailable",
      managedSettingsIssues: "Unavailable",
      agentRuntime: "Unavailable",
      policyControlledSettings: "Unavailable"
    };
    let content = "";
    content += "## System Information\n\n";
    content += markdownTable(
      ["Property", "Value"],
      [
        ["Generated", (/* @__PURE__ */ new Date()).toISOString()],
        ["Product", `${productService.nameLong} ${productService.version}`],
        ["Commit", productService.commit || "n/a"]
      ]
    );
    content += "## Account Information\n\n";
    try {
      const account = await defaultAccountService.getDefaultAccount();
      const sensitiveKeys = ["sessionId", "analytics_tracking_id"];
      if (account) {
        let username = "Unknown";
        let accountLabel = "Unknown";
        try {
          const providerIds = authenticationService.getProviderIds();
          for (const providerId of providerIds) {
            const sessions = await authenticationService.getSessions(providerId);
            const matchingSession = sessions.find((session) => session.id === account.sessionId);
            if (matchingSession) {
              username = matchingSession.account.id;
              accountLabel = matchingSession.account.label;
              break;
            }
          }
        } catch (error) {
        }
        content += "### Default Account Summary\n\n";
        content += markdownTable(
          ["Property", "Value"],
          [
            ["Account ID/Username", username],
            ["Account Label", accountLabel]
          ]
        );
        const accountPropertyRows = [];
        for (const [key, value] of Object.entries(account)) {
          if (value !== void 0 && value !== null) {
            const displayValue = sensitiveKeys.includes(key) ? "***" : typeof value === "object" ? formatDiagnosticValue(value) : String(value);
            accountPropertyRows.push([key, displayValue]);
          }
        }
        const policyData = defaultAccountService.policyData;
        accountPropertyRows.push(["policyData", policyData ? formatDiagnosticValue(policyData) : "No Policy Data"]);
        content += markdownDetails(
          "Detailed account properties",
          markdownTable(["Property", "Value"], accountPropertyRows)
        );
      } else {
        content += "*No default account configured*\n\n";
      }
    } catch (error) {
      content += `*Error retrieving account information: ${markdownText(getErrorMessage(error))}*

`;
    }
    content += "## Account Policy Gate\n\n";
    try {
      const gateInfo = accountPolicyGateService.gateInfo;
      const approvedOrgsRaw = policyService.getPolicyValue(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME);
      summary.accountPolicyGate = gateInfo.reason ? `${gateInfo.state} (${gateInfo.reason})` : gateInfo.state;
      content += markdownTable(
        ["Property", "Value"],
        [
          ["State", gateInfo.state],
          ["Reason", gateInfo.reason ?? "n/a"],
          [APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, approvedOrgsRaw !== void 0 ? String(approvedOrgsRaw) : "not set"]
        ]
      );
      content += "**Legend**\n\n";
      content += "- `inactive`: gate disabled (no approved orgs configured) \u2014 policies behave as account data dictates.\n";
      content += "- `satisfied`: gate active and approved \u2014 account policy values flow normally.\n";
      content += "- `restricted`: gate active and not satisfied \u2014 opted-in policies forced to their restricted value.\n";
      content += "  - `noAccount`: no default account signed in.\n";
      content += "  - `wrongProvider`: signed in with a non-GitHub provider.\n";
      content += "  - `orgNotApproved`: signed in but account is not a member of any approved organization.\n";
      content += "  - `policyNotResolved`: signed in to an approved org but account-side policy data has not yet been fetched.\n\n";
    } catch (error) {
      content += `*Error retrieving account policy gate info: ${markdownText(getErrorMessage(error))}*

`;
    }
    content += "## Managed Settings\n\n";
    try {
      const policyData = defaultAccountService.policyData;
      const serverManagedSettings = policyData?.managedSettings ?? {};
      const nativeManagedSettings = nativeManagedSettingsService?.managedSettings ?? {};
      const fileManagedSettings = fileManagedSettingsService?.managedSettings ?? {};
      const fileRawManagedSettings = fileManagedSettingsService?.rawManagedSettings;
      const declaredDefinitions = {};
      for (const property of [...Object.values(configurationRegistry2.getConfigurationProperties()), ...Object.values(configurationRegistry2.getExcludedConfigurationProperties())]) {
        const declared = property.policy?.managedSettings;
        if (declared) {
          Object.assign(declaredDefinitions, declared);
        }
      }
      const pick = pickManagedSettings(nativeManagedSettings, serverManagedSettings, fileManagedSettings);
      const parseErrors = [];
      const projectChannel = (channel, values) => projectManagedSettings(
        values,
        declaredDefinitions,
        (message) => parseErrors.push({ stage: `${channel}: project`, message })
      );
      const channelContributes = (channel) => pick.activeSources.includes(channel);
      const nativeProjected = projectChannel("nativeMdm", nativeManagedSettings);
      const serverProjected = projectChannel("server", serverManagedSettings);
      const fileProjected = projectChannel("file", fileManagedSettings);
      const effective = projectManagedSettings(pick.values, declaredDefinitions, (message) => parseErrors.push({ stage: "effective: project", message }));
      const rawResponse = defaultAccountService.managedSettingsRawResponse;
      if (isObject(rawResponse)) {
        adaptManagedSettings(rawResponse, (message) => parseErrors.push({ stage: "adapt", message }));
      }
      if (fileRawManagedSettings) {
        normalizeManagedSettings(fileRawManagedSettings, (message) => parseErrors.push({ stage: "file: normalize", message }));
      }
      for (const key of [COPILOT_ENABLED_PLUGINS_KEY, COPILOT_STRICT_MARKETPLACES_KEY, COPILOT_EXTRA_MARKETPLACES_KEY]) {
        const value = effective[key];
        if (typeof value !== "string") {
          continue;
        }
        const jsonErrors = [];
        json.parse(value, jsonErrors);
        for (const error of jsonErrors) {
          parseErrors.push({ stage: "parse", message: `${key} @ offset ${error.offset}: ${getParseErrorMessage(error.error)}` });
        }
      }
      const activeSources = pick.activeSources.length > 0 ? pick.activeSources.map(managedSettingsSourceLabel).join(", ") : managedSettingsSourceLabel("none");
      const effectiveKeyCount = Object.keys(effective).length;
      summary.managedSettingsSources = activeSources;
      summary.effectiveManagedSettings = `${effectiveKeyCount} ${effectiveKeyCount === 1 ? "key" : "keys"}`;
      summary.managedSettingsIssues = `${parseErrors.length} ${parseErrors.length === 1 ? "issue" : "issues"}`;
      content += markdownTable(
        ["Property", "Value"],
        [
          ["Active sources (precedence order)", activeSources],
          ["Supplied keys", String(pick.resolutions.size)],
          ["Effective VS Code policy keys", String(effectiveKeyCount)]
        ]
      );
      content += "*Precedence is resolved per key: native MDM wins over the server endpoint, which wins over the file on disk. A key left unset by a higher channel is still filled in by a lower one.*\n\n";
      content += "### Effective Resolution\n\n";
      if (pick.resolutions.size > 0) {
        const resolutions = [...pick.resolutions.entries()].sort(([first], [second]) => first.localeCompare(second));
        content += markdownTable(
          ["Key", "Effective Value", "Winning Source"],
          resolutions.map(([key, resolution]) => [
            key,
            formatDiagnosticValue(resolution.value),
            managedSettingsSourceShortLabel(resolution.source)
          ])
        );
        const contributionRows = resolutions.flatMap(([key, resolution]) => resolution.contributions.map((contribution) => [
          key,
          managedSettingsSourceShortLabel(contribution.channel),
          formatDiagnosticValue(contribution.value),
          contribution.channel === resolution.source ? "Effective" : "Overridden"
        ]));
        content += markdownDetails(
          "Per-channel contributions",
          markdownTable(["Key", "Source", "Value", "Status"], contributionRows)
        );
      } else {
        content += "*No managed-settings keys are supplied by any channel.*\n\n";
      }
      content += markdownDetails("Merged normalized bag", markdownJsonBlock(pick.values));
      content += markdownDetails("Effective VS Code policy bag", markdownJsonBlock(effective));
      content += `### Normalization and Parse Issues (${parseErrors.length})

`;
      if (parseErrors.length > 0) {
        content += markdownTable(
          ["Stage", "Message"],
          parseErrors.map(({ stage, message }) => [stage, message])
        );
      } else {
        content += "*None.*\n\n";
      }
      content += "### Delivery Channel Details\n\n";
      content += "#### Native MDM\n\n";
      content += markdownTable(
        ["Property", "Value"],
        [
          ["Available", nativeManagedSettingsService ? "yes" : "no"],
          ["Contributes winning keys", channelContributes("nativeMdm") ? "yes" : "no"]
        ]
      );
      if (nativeManagedSettingsService) {
        content += "*The native policy watcher exposes only declared scalar keys, so its source values are already definition-scoped and canonical.*\n\n";
        content += managedSettingsPipeline("Source values (definition-scoped)", nativeManagedSettings, nativeManagedSettings, nativeProjected);
      }
      const fetchStatus = defaultAccountService.managedSettingsFetchStatus;
      const fetchedAt = defaultAccountService.managedSettingsFetchedAt;
      const clientIdentity = appendManagedSettingsClientIdentity("https://api.github.com/copilot_internal/managed_settings", productService);
      const compatibilityError = defaultAccountService.managedSettingsCompatibilityError;
      content += "#### GitHub Server API\n\n";
      content += markdownTable(
        ["Property", "Value"],
        [
          ["Endpoint", "/copilot_internal/managed_settings"],
          ["Last fetch", fetchStatus === null ? "never" : `${fetchStatus}${fetchedAt ? ` at ${new Date(fetchedAt).toLocaleString()}` : ""}`],
          ["Client identity", new URL(clientIdentity).search.replace(/^\?/, "")],
          ["Compatibility", compatibilityError ? `update required (${compatibilityError.clientVersion ?? "?"} \u2192 ${compatibilityError.minimumClientVersion ?? "?"})` : "compatible or not evaluated"],
          ["Contributes winning keys", channelContributes("server") ? "yes" : "no"]
        ]
      );
      content += managedSettingsPipeline(
        "Raw response (last successful fetch)",
        isObject(rawResponse) ? rawResponse : void 0,
        serverManagedSettings,
        serverProjected,
        "No successful managed-settings response has been captured."
      );
      content += "#### File (managed-settings.json)\n\n";
      content += markdownTable(
        ["Property", "Value"],
        [
          ["Available", fileManagedSettingsService ? "yes" : "no"],
          ["Contributes winning keys", channelContributes("file") ? "yes" : "no"]
        ]
      );
      if (fileManagedSettingsService) {
        content += managedSettingsPipeline("Raw parsed file", fileRawManagedSettings, fileManagedSettings, fileProjected);
      }
      content += markdownDetails(
        "VS Code managed-settings schema",
        "*Only keys declared here can reach VS Code policy callbacks. Runtime-owned keys may still be enforced by the Copilot runtime even when absent from the projections above.*\n\n" + markdownJsonBlock(declaredDefinitions)
      );
      content += "### Agent Runtime Resolution\n\n";
      content += "*Resolved independently by each provider through its own SDK/runtime. This may include runtime-owned keys that VS Code does not declare as configuration policies.*\n\n";
      if (!agentHostEnablementService.enabled.get()) {
        summary.agentRuntime = "Agent Host disabled";
        content += "*Agent Host is disabled; runtime managed-settings diagnostics were not queried.*\n\n";
      } else {
        try {
          const runtimeDiagnostics = await raceTimeout(agentHostService.getManagedSettingsDiagnostics(), AGENT_RUNTIME_DIAGNOSTICS_TIMEOUT);
          if (!runtimeDiagnostics) {
            summary.agentRuntime = "Timed out";
            content += "*The Agent Host did not return provider diagnostics within 6 seconds. The report continued without a runtime snapshot; check the Agent Host log for a stalled provider.*\n\n";
          } else if (runtimeDiagnostics.length === 0) {
            summary.agentRuntime = "No provider diagnostics";
            content += "*No agent provider exposes managed-settings diagnostics.*\n\n";
          } else {
            const failedProviderCount = runtimeDiagnostics.filter((diagnostic) => diagnostic.error).length;
            summary.agentRuntime = `${runtimeDiagnostics.length} ${runtimeDiagnostics.length === 1 ? "provider" : "providers"}, ${failedProviderCount} failed`;
            for (const diagnostic of runtimeDiagnostics) {
              content += `#### ${markdownText(diagnostic.provider)}

`;
              if (diagnostic.error) {
                content += `*Probe failed: ${markdownText(diagnostic.error)}*

`;
              } else {
                content += markdownDetails("Resolved settings snapshot", markdownJsonBlock(diagnostic.snapshot));
              }
            }
          }
        } catch (error) {
          const message = getErrorMessage(error);
          summary.agentRuntime = `Unavailable (${message})`;
          content += `*Agent runtime diagnostics unavailable: ${markdownText(message)}*

`;
        }
      }
    } catch (error) {
      content += `*Error rendering managed settings diagnostics: ${markdownText(getErrorMessage(error))}*

`;
    }
    content += "## Policy-Controlled Settings\n\n";
    const policyConfigurations = configurationRegistry2.getPolicyConfigurations();
    const policyReferenceConfigurations = configurationRegistry2.getPolicyReferenceConfigurations();
    const configurationProperties = configurationRegistry2.getConfigurationProperties();
    const excludedProperties = configurationRegistry2.getExcludedConfigurationProperties();
    if (policyConfigurations.size > 0 || policyReferenceConfigurations.size > 0) {
      const appliedPolicy = [];
      const notAppliedPolicy = [];
      const collectPolicySetting = (policyName, settingKey) => {
        const property = configurationProperties[settingKey] ?? excludedProperties[settingKey];
        if (property) {
          const inspectValue = configurationService.inspect(settingKey);
          const settingInfo = {
            name: policyName,
            key: settingKey,
            property,
            inspection: inspectValue
          };
          if (inspectValue.policyValue !== void 0) {
            appliedPolicy.push(settingInfo);
          } else {
            notAppliedPolicy.push(settingInfo);
          }
        }
      };
      for (const [policyName, settingKey] of policyConfigurations) {
        collectPolicySetting(policyName, settingKey);
      }
      for (const [policyName, settingKeys] of policyReferenceConfigurations) {
        for (const settingKey of settingKeys) {
          collectPolicySetting(policyName, settingKey);
        }
      }
      const getPolicySource = (policyName) => policyValueSourceLabel(policyService.getPolicyValueSource(policyName));
      content += "### Applied Policy\n\n";
      appliedPolicy.sort((a, b) => getPolicySource(a.name).localeCompare(getPolicySource(b.name)) || a.name.localeCompare(b.name));
      notAppliedPolicy.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
      summary.policyControlledSettings = `${appliedPolicy.length} applied, ${notAppliedPolicy.length} not applied`;
      if (appliedPolicy.length > 0) {
        content += markdownTable(
          ["Setting Key", "Policy Name", "Policy Source"],
          appliedPolicy.map((setting) => [
            setting.key,
            setting.name,
            getPolicySource(setting.name)
          ])
        );
        let policyDetails = "";
        for (const setting of appliedPolicy) {
          const managedSettingsKeys = setting.property.policy?.managedSettings ? Object.keys(setting.property.policy.managedSettings).join(", ") : "";
          policyDetails += `**${markdownText(setting.key)}**

`;
          policyDetails += markdownTable(
            ["Property", "Value"],
            [
              ["Policy name", setting.name],
              ["Policy source", getPolicySource(setting.name)],
              ["Managed settings", managedSettingsKeys || "n/a"],
              ["Default value", formatDiagnosticValue(setting.property.default)],
              ["Current value", formatDiagnosticValue(setting.inspection.value)],
              ["Policy value", formatDiagnosticValue(setting.inspection.policyValue)]
            ]
          );
        }
        content += markdownDetails("Applied policy values and configuration details", policyDetails);
      } else {
        content += "*No settings are currently controlled by policies*\n\n";
      }
      content += "### Non-applied Policy\n\n";
      if (notAppliedPolicy.length > 0) {
        content += markdownTable(
          ["Setting Key", "Policy Name"],
          notAppliedPolicy.map((setting) => [setting.key, setting.name])
        );
      } else {
        content += "*All policy-controllable settings are currently being enforced*\n\n";
      }
    } else {
      summary.policyControlledSettings = "No policy-controlled settings found";
      content += "*No policy-controlled settings found*\n\n";
    }
    content += "## Authentication Information\n\n";
    try {
      const providerIds = authenticationService.getProviderIds();
      if (providerIds.length > 0) {
        content += "### Authentication Providers\n\n";
        const providerRows = [];
        let sessionDetails = "";
        for (const providerId of providerIds) {
          try {
            const sessions = await authenticationService.getSessions(providerId);
            const accounts = sessions.map((session) => session.account);
            const uniqueAccounts = Array.from(new Set(accounts.map((account) => account.label)));
            providerRows.push([providerId, String(sessions.length), uniqueAccounts.join(", ") || "None"]);
            if (sessions.length > 0) {
              sessionDetails += `**${markdownText(providerId)}**

`;
              const sessionRows = [];
              for (const session of sessions) {
                const accountName = session.account.label;
                const scopes = session.scopes.join(", ") || "Default";
                try {
                  const allowedExtensions = authenticationAccessService.readAllowedExtensions(providerId, accountName);
                  const extensionNames = allowedExtensions.filter((ext) => ext.allowed !== false).map((ext) => `${ext.name}${ext.trusted ? " (trusted)" : ""}`).join(", ") || "None";
                  sessionRows.push([accountName, scopes, extensionNames]);
                } catch (error) {
                  sessionRows.push([accountName, scopes, `Error: ${getErrorMessage(error)}`]);
                }
              }
              sessionDetails += markdownTable(["Account", "Scopes", "Extensions with Access"], sessionRows);
            }
          } catch (error) {
            const message = getErrorMessage(error);
            providerRows.push([providerId, "Error", message]);
            sessionDetails += `**${markdownText(providerId)}**

*Error retrieving sessions: ${markdownText(message)}*

`;
          }
        }
        content += markdownTable(["Provider ID", "Sessions", "Accounts"], providerRows);
        if (sessionDetails) {
          content += markdownDetails("Detailed session information", sessionDetails);
        }
      } else {
        content += "*No authentication providers found*\n\n";
      }
    } catch (error) {
      content += `*Error retrieving authentication information: ${markdownText(getErrorMessage(error))}*

`;
    }
    const report = "# VS Code Policy Diagnostics\n\n*WARNING: This file may contain sensitive information.*\n\n## Summary\n\n" + markdownTable(
      ["Diagnostic", "Result"],
      [
        ["Account policy gate", summary.accountPolicyGate],
        ["Managed-settings sources", summary.managedSettingsSources],
        ["Effective managed settings", summary.effectiveManagedSettings],
        ["Managed-settings issues", summary.managedSettingsIssues],
        ["Agent Runtime", summary.agentRuntime],
        ["Policy-controlled settings", summary.policyControlledSettings]
      ]
    ) + content;
    const resource = URI.from({
      scheme: Schemas.untitled,
      path: localize("policyDiagnostics.editorTitle", "Policy Diagnostics"),
      query: generateUuid()
    });
    const editorPane = await editorService.openEditor({
      resource,
      contents: report,
      languageId: "markdown",
      options: { pinned: true }
    });
    if (!editorPane) {
      notificationService.warn(localize(
        "policyDiagnostics.previewMissingResource",
        "Policy diagnostics opened as Markdown source because the rendered preview could not be initialized."
      ));
      return;
    }
    try {
      await commandService.executeCommand("markdown.reopenAsPreview");
    } catch (error) {
      notificationService.warn(localize(
        "policyDiagnostics.previewError",
        "Policy diagnostics opened as Markdown source because the rendered preview could not be opened: {0}",
        getErrorMessage(error)
      ));
    }
  }
}
class SyncAccountPolicyAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.syncAccountPolicy",
      title: localize2("syncAccountPolicy", "Sync Account Policy"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const defaultAccountService = accessor.get(IDefaultAccountService);
    const dialogService = accessor.get(IDialogService);
    const logService = accessor.get(ILogService);
    try {
      logService.info("[DefaultAccount] Manually syncing account policy");
      await defaultAccountService.refresh({ forceRefresh: true });
      await dialogService.info(localize("syncAccountPolicy.success", "Account policy has been synced."));
    } catch (error) {
      logService.error("[DefaultAccount] Failed to sync account policy", error);
      await dialogService.error(
        localize("syncAccountPolicy.error", "Failed to sync account policy."),
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
registerAction2(InspectContextKeysAction);
registerAction2(ToggleScreencastModeAction);
registerAction2(LogStorageAction);
registerAction2(LogWorkingCopiesAction);
registerAction2(RemoveLargeStorageEntriesAction);
registerAction2(PolicyDiagnosticsAction);
registerAction2(SyncAccountPolicyAction);
if (!product.commit) {
  registerAction2(StartTrackDisposables);
  registerAction2(SnapshotTrackedDisposables);
  registerAction2(StopTrackDisposables);
}
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "screencastMode",
  order: 9,
  title: localize("screencastModeConfigurationTitle", "Screencast Mode"),
  type: "object",
  properties: {
    "screencastMode.verticalOffset": {
      type: "number",
      default: 20,
      minimum: 0,
      maximum: 90,
      description: localize("screencastMode.location.verticalPosition", "Controls the vertical offset of the screencast mode overlay from the bottom as a percentage of the workbench height.")
    },
    "screencastMode.fontSize": {
      type: "number",
      default: 56,
      minimum: 20,
      maximum: 100,
      description: localize("screencastMode.fontSize", "Controls the font size (in pixels) of the screencast mode keyboard.")
    },
    "screencastMode.keyboardOptions": {
      type: "object",
      description: localize("screencastMode.keyboardOptions.description", "Options for customizing the keyboard overlay in screencast mode."),
      properties: {
        "showKeys": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showKeys", "Show raw keys.")
        },
        "showKeybindings": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showKeybindings", "Show keyboard shortcuts.")
        },
        "showCommands": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showCommands", "Show command names.")
        },
        "showCommandGroups": {
          type: "boolean",
          default: false,
          description: localize("screencastMode.keyboardOptions.showCommandGroups", "Show command group names, when commands are also shown.")
        },
        "showSingleEditorCursorMoves": {
          type: "boolean",
          default: true,
          description: localize("screencastMode.keyboardOptions.showSingleEditorCursorMoves", "Show single editor cursor move commands.")
        }
      },
      default: {
        "showKeys": true,
        "showKeybindings": true,
        "showCommands": true,
        "showCommandGroups": false,
        "showSingleEditorCursorMoves": true
      },
      additionalProperties: false
    },
    "screencastMode.keyboardOverlayTimeout": {
      type: "number",
      default: 800,
      minimum: 500,
      maximum: 5e3,
      description: localize("screencastMode.keyboardOverlayTimeout", "Controls how long (in milliseconds) the keyboard overlay is shown in screencast mode.")
    },
    "screencastMode.mouseIndicatorColor": {
      type: "string",
      format: "color-hex",
      default: "#FF0000",
      description: localize("screencastMode.mouseIndicatorColor", "Controls the color in hex (#RGB, #RGBA, #RRGGBB or #RRGGBBAA) of the mouse indicator in screencast mode.")
    },
    "screencastMode.mouseIndicatorSize": {
      type: "number",
      default: 20,
      minimum: 20,
      maximum: 100,
      description: localize("screencastMode.mouseIndicatorSize", "Controls the size (in pixels) of the mouse indicator in screencast mode.")
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGFjdGlvbnNcXGRldmVsb3BlckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWN0aW9ucy5jc3MnO1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSwgc2V0RGlzcG9zYWJsZVRyYWNrZXIsIERpc3Bvc2FibGVUcmFja2VyLCBEaXNwb3NhYmxlSW5mbyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZXREb21Ob2RlUGFnZVBvc2l0aW9uLCBhcHBlbmQsICQsIGdldEFjdGl2ZURvY3VtZW50LCBvbkRpZFJlZ2lzdGVyV2luZG93LCBnZXRXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDU1NSdWxlLCBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyByYWNlVGltZW91dCwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUJhY2t1cC5qcyc7XG5pbXBvcnQgeyBSZXNvbHV0aW9uUmVzdWx0LCBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IHdpbmRvd0xvZ0lkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbG9nL2NvbW1vbi9sb2dDb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQnl0ZVNpemUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBvbGljeVNlcnZpY2UsIFBvbGljeVZhbHVlU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZLCBDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVksIENPUElMT1RfU1RSSUNUX01BUktFVFBMQUNFU19LRVksIElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIE1hbmFnZWRTZXR0aW5nc0NoYW5uZWwsIE1hbmFnZWRTZXR0aW5nc1NvdXJjZSwgbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzLCBwcm9qZWN0TWFuYWdlZFNldHRpbmdzLCBwaWNrTWFuYWdlZFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkU2V0dGluZ1BvbGljeURlZmluaXRpb24sIE1hbmFnZWRTZXR0aW5nc0RhdGEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgQVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FLCBJQWNjb3VudFBvbGljeUdhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcG9saWNpZXMvY29tbW9uL2FjY291bnRQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFkYXB0TWFuYWdlZFNldHRpbmdzLCBhcHBlbmRNYW5hZ2VkU2V0dGluZ3NDbGllbnRJZGVudGl0eSwgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYWNjb3VudHMvYnJvd3Nlci9tYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBqc29uIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgZ2V0UGFyc2VFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IG1hcmtkb3duRGV0YWlscywgbWFya2Rvd25Kc29uQmxvY2ssIG1hcmtkb3duVGFibGUsIG1hcmtkb3duVGV4dCB9IGZyb20gJy4vcG9saWN5RGlhZ25vc3RpY3NNYXJrZG93bi5qcyc7XG5cbmNsYXNzIEluc3BlY3RDb250ZXh0S2V5c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5pbnNwZWN0Q29udGV4dEtleXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW5zcGVjdCBjb250ZXh0IGtleXMnLCAnSW5zcGVjdCBDb250ZXh0IEtleXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBzdHlsZXNoZWV0ID0gY3JlYXRlU3R5bGVTaGVldCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNyZWF0ZUNTU1J1bGUoJyonLCAnY3Vyc29yOiBjcm9zc2hhaXIgIWltcG9ydGFudDsnLCBzdHlsZXNoZWV0KTtcblxuXHRcdGNvbnN0IGhvdmVyRmVlZGJhY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBhY3RpdmVEb2N1bWVudCA9IGdldEFjdGl2ZURvY3VtZW50KCk7XG5cdFx0YWN0aXZlRG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChob3ZlckZlZWRiYWNrKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGhvdmVyRmVlZGJhY2sucmVtb3ZlKCkpKTtcblxuXHRcdGhvdmVyRmVlZGJhY2suc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGhvdmVyRmVlZGJhY2suc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcblx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICdyZ2JhKDI1NSwgMCwgMCwgMC41KSc7XG5cdFx0aG92ZXJGZWVkYmFjay5zdHlsZS56SW5kZXggPSAnMTAwMCc7XG5cblx0XHRjb25zdCBvbk1vdXNlTW92ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcihhY3RpdmVEb2N1bWVudCwgJ21vdXNlbW92ZScsIHRydWUpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25Nb3VzZU1vdmUuZXZlbnQoZSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0YXJnZXQpO1xuXG5cdFx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLnRvcCA9IGAke3Bvc2l0aW9uLnRvcH1weGA7XG5cdFx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLmxlZnQgPSBgJHtwb3NpdGlvbi5sZWZ0fXB4YDtcblx0XHRcdGhvdmVyRmVlZGJhY2suc3R5bGUud2lkdGggPSBgJHtwb3NpdGlvbi53aWR0aH1weGA7XG5cdFx0XHRob3ZlckZlZWRiYWNrLnN0eWxlLmhlaWdodCA9IGAke3Bvc2l0aW9uLmhlaWdodH1weGA7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb25Nb3VzZURvd24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIoYWN0aXZlRG9jdW1lbnQsICdtb3VzZWRvd24nLCB0cnVlKSk7XG5cdFx0RXZlbnQub25jZShvbk1vdXNlRG93bi5ldmVudCkoZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgfSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3Qgb25Nb3VzZVVwID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKGFjdGl2ZURvY3VtZW50LCAnbW91c2V1cCcsIHRydWUpKTtcblx0XHRFdmVudC5vbmNlKG9uTW91c2VVcC5ldmVudCkoZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkgYXMgQ29udGV4dDtcblx0XHRcdGNvbnNvbGUubG9nKGNvbnRleHQuY29sbGVjdEFsbFZhbHVlcygpKTtcblxuXHRcdFx0ZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0fSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2NyZWVuY2FzdEtleWJvYXJkT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNob3dLZXlzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0tleWJpbmRpbmdzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0NvbW1hbmRzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0NvbW1hbmRHcm91cHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBzaG93U2luZ2xlRWRpdG9yQ3Vyc29yTW92ZXM/OiBib29sZWFuO1xufVxuXG5jbGFzcyBUb2dnbGVTY3JlZW5jYXN0TW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlU2NyZWVuY2FzdE1vZGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlIHNjcmVlbmNhc3QgbW9kZScsICdUb2dnbGUgU2NyZWVuY2FzdCBNb2RlJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0aWYgKFRvZ2dsZVNjcmVlbmNhc3RNb2RlQWN0aW9uLmRpc3Bvc2FibGUpIHtcblx0XHRcdFRvZ2dsZVNjcmVlbmNhc3RNb2RlQWN0aW9uLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0VG9nZ2xlU2NyZWVuY2FzdE1vZGVBY3Rpb24uZGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyO1xuXG5cdFx0Y29uc3QgbW91c2VNYXJrZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NyZWVuY2FzdC1tb3VzZScpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1vdXNlTWFya2VyLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBrZXlib2FyZE1hcmtlciA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY3JlZW5jYXN0LWtleWJvYXJkJykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ga2V5Ym9hcmRNYXJrZXIucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IG9uTW91c2VEb3duID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPE1vdXNlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uTW91c2VVcCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxNb3VzZUV2ZW50PigpKTtcblx0XHRjb25zdCBvbk1vdXNlTW92ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxNb3VzZUV2ZW50PigpKTtcblxuXHRcdGZ1bmN0aW9uIHJlZ2lzdGVyQ29udGFpbmVyTGlzdGVuZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHdpbmRvd0Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0bGlzdGVuZXJzLmFkZChsaXN0ZW5lcnMuYWRkKG5ldyBEb21FbWl0dGVyKGNvbnRhaW5lciwgJ21vdXNlZG93bicsIHRydWUpKS5ldmVudChlID0+IG9uTW91c2VEb3duLmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJzLmFkZChuZXcgRG9tRW1pdHRlcihjb250YWluZXIsICdtb3VzZXVwJywgdHJ1ZSkpLmV2ZW50KGUgPT4gb25Nb3VzZVVwLmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJzLmFkZChuZXcgRG9tRW1pdHRlcihjb250YWluZXIsICdtb3VzZW1vdmUnLCB0cnVlKSkuZXZlbnQoZSA9PiBvbk1vdXNlTW92ZS5maXJlKGUpKSk7XG5cblx0XHRcdHdpbmRvd0Rpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcnMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3aW5kb3dEaXNwb3NhYmxlcy5kZWxldGUobGlzdGVuZXJzKSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGlzdGVuZXJzKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgd2luZG93LCBkaXNwb3NhYmxlcyB9IG9mIGdldFdpbmRvd3MoKSkge1xuXHRcdFx0cmVnaXN0ZXJDb250YWluZXJMaXN0ZW5lcnMobGF5b3V0U2VydmljZS5nZXRDb250YWluZXIod2luZG93KSwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkRpZFJlZ2lzdGVyV2luZG93KCh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4gcmVnaXN0ZXJDb250YWluZXJMaXN0ZW5lcnMobGF5b3V0U2VydmljZS5nZXRDb250YWluZXIod2luZG93KSwgZGlzcG9zYWJsZXMpKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGF5b3V0U2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUNvbnRhaW5lcigoKSA9PiB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lci5hcHBlbmRDaGlsZChtb3VzZU1hcmtlcik7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lci5hcHBlbmRDaGlsZChrZXlib2FyZE1hcmtlcik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlTW91c2VJbmRpY2F0b3JDb2xvciA9ICgpID0+IHtcblx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLmJvcmRlckNvbG9yID0gQ29sb3IuZnJvbUhleChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJykpLnRvU3RyaW5nKCk7XG5cdFx0fTtcblxuXHRcdGxldCBtb3VzZUluZGljYXRvclNpemU6IG51bWJlcjtcblx0XHRjb25zdCB1cGRhdGVNb3VzZUluZGljYXRvclNpemUgPSAoKSA9PiB7XG5cdFx0XHRtb3VzZUluZGljYXRvclNpemUgPSBjbGFtcChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvclNpemUnKSB8fCAyMCwgMjAsIDEwMCk7XG5cblx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLmhlaWdodCA9IGAke21vdXNlSW5kaWNhdG9yU2l6ZX1weGA7XG5cdFx0XHRtb3VzZU1hcmtlci5zdHlsZS53aWR0aCA9IGAke21vdXNlSW5kaWNhdG9yU2l6ZX1weGA7XG5cdFx0fTtcblxuXHRcdHVwZGF0ZU1vdXNlSW5kaWNhdG9yQ29sb3IoKTtcblx0XHR1cGRhdGVNb3VzZUluZGljYXRvclNpemUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbk1vdXNlRG93bi5ldmVudChlID0+IHtcblx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLnRvcCA9IGAke2UuY2xpZW50WSAtIG1vdXNlSW5kaWNhdG9yU2l6ZSAvIDJ9cHhgO1xuXHRcdFx0bW91c2VNYXJrZXIuc3R5bGUubGVmdCA9IGAke2UuY2xpZW50WCAtIG1vdXNlSW5kaWNhdG9yU2l6ZSAvIDJ9cHhgO1xuXHRcdFx0bW91c2VNYXJrZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHRtb3VzZU1hcmtlci5zdHlsZS50cmFuc2Zvcm0gPSBgc2NhbGUoJHsxfSlgO1xuXHRcdFx0bW91c2VNYXJrZXIuc3R5bGUudHJhbnNpdGlvbiA9ICd0cmFuc2Zvcm0gMC4xcyc7XG5cblx0XHRcdGNvbnN0IG1vdXNlTW92ZUxpc3RlbmVyID0gb25Nb3VzZU1vdmUuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLnRvcCA9IGAke2UuY2xpZW50WSAtIG1vdXNlSW5kaWNhdG9yU2l6ZSAvIDJ9cHhgO1xuXHRcdFx0XHRtb3VzZU1hcmtlci5zdHlsZS5sZWZ0ID0gYCR7ZS5jbGllbnRYIC0gbW91c2VJbmRpY2F0b3JTaXplIC8gMn1weGA7XG5cdFx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLnRyYW5zZm9ybSA9IGBzY2FsZSgkey44fSlgO1xuXHRcdFx0fSk7XG5cblx0XHRcdEV2ZW50Lm9uY2Uob25Nb3VzZVVwLmV2ZW50KSgoKSA9PiB7XG5cdFx0XHRcdG1vdXNlTWFya2VyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdG1vdXNlTW92ZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUtleWJvYXJkRm9udFNpemUgPSAoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlci5zdHlsZS5mb250U2l6ZSA9IGAke2NsYW1wKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3NjcmVlbmNhc3RNb2RlLmZvbnRTaXplJykgfHwgNTYsIDIwLCAxMDApfXB4YDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlS2V5Ym9hcmRNYXJrZXIgPSAoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlci5zdHlsZS5ib3R0b20gPSBgJHtjbGFtcChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY3JlZW5jYXN0TW9kZS52ZXJ0aWNhbE9mZnNldCcpIHx8IDAsIDAsIDkwKX0lYDtcblx0XHR9O1xuXG5cdFx0bGV0IGtleWJvYXJkTWFya2VyVGltZW91dCE6IG51bWJlcjtcblx0XHRjb25zdCB1cGRhdGVLZXlib2FyZE1hcmtlclRpbWVvdXQgPSAoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlclRpbWVvdXQgPSBjbGFtcChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE92ZXJsYXlUaW1lb3V0JykgfHwgODAwLCA1MDAsIDUwMDApO1xuXHRcdH07XG5cblx0XHR1cGRhdGVLZXlib2FyZEZvbnRTaXplKCk7XG5cdFx0dXBkYXRlS2V5Ym9hcmRNYXJrZXIoKTtcblx0XHR1cGRhdGVLZXlib2FyZE1hcmtlclRpbWVvdXQoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NyZWVuY2FzdE1vZGUudmVydGljYWxPZmZzZXQnKSkge1xuXHRcdFx0XHR1cGRhdGVLZXlib2FyZE1hcmtlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NyZWVuY2FzdE1vZGUuZm9udFNpemUnKSkge1xuXHRcdFx0XHR1cGRhdGVLZXlib2FyZEZvbnRTaXplKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE92ZXJsYXlUaW1lb3V0JykpIHtcblx0XHRcdFx0dXBkYXRlS2V5Ym9hcmRNYXJrZXJUaW1lb3V0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJykpIHtcblx0XHRcdFx0dXBkYXRlTW91c2VJbmRpY2F0b3JDb2xvcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2NyZWVuY2FzdE1vZGUubW91c2VJbmRpY2F0b3JTaXplJykpIHtcblx0XHRcdFx0dXBkYXRlTW91c2VJbmRpY2F0b3JTaXplKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb25LZXlEb3duID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPEtleWJvYXJkRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uQ29tcG9zaXRpb25TdGFydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxDb21wb3NpdGlvbkV2ZW50PigpKTtcblx0XHRjb25zdCBvbkNvbXBvc2l0aW9uVXBkYXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPENvbXBvc2l0aW9uRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uQ29tcG9zaXRpb25FbmQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8Q29tcG9zaXRpb25FdmVudD4oKSk7XG5cblx0XHRmdW5jdGlvbiByZWdpc3RlcldpbmRvd0xpc3RlbmVycyh3aW5kb3c6IFdpbmRvdywgd2luZG93RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGxpc3RlbmVycy5hZGQobmV3IERvbUVtaXR0ZXIod2luZG93LCAna2V5ZG93bicsIHRydWUpKS5ldmVudChlID0+IG9uS2V5RG93bi5maXJlKGUpKSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGxpc3RlbmVycy5hZGQobmV3IERvbUVtaXR0ZXIod2luZG93LCAnY29tcG9zaXRpb25zdGFydCcsIHRydWUpKS5ldmVudChlID0+IG9uQ29tcG9zaXRpb25TdGFydC5maXJlKGUpKSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGxpc3RlbmVycy5hZGQobmV3IERvbUVtaXR0ZXIod2luZG93LCAnY29tcG9zaXRpb251cGRhdGUnLCB0cnVlKSkuZXZlbnQoZSA9PiBvbkNvbXBvc2l0aW9uVXBkYXRlLmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVycy5hZGQobGlzdGVuZXJzLmFkZChuZXcgRG9tRW1pdHRlcih3aW5kb3csICdjb21wb3NpdGlvbmVuZCcsIHRydWUpKS5ldmVudChlID0+IG9uQ29tcG9zaXRpb25FbmQuZmlyZShlKSkpO1xuXG5cdFx0XHR3aW5kb3dEaXNwb3NhYmxlcy5hZGQobGlzdGVuZXJzKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gd2luZG93RGlzcG9zYWJsZXMuZGVsZXRlKGxpc3RlbmVycykpKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxpc3RlbmVycyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSBvZiBnZXRXaW5kb3dzKCkpIHtcblx0XHRcdHJlZ2lzdGVyV2luZG93TGlzdGVuZXJzKHdpbmRvdywgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkRpZFJlZ2lzdGVyV2luZG93KCh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4gcmVnaXN0ZXJXaW5kb3dMaXN0ZW5lcnMod2luZG93LCBkaXNwb3NhYmxlcykpKTtcblxuXHRcdGxldCBsZW5ndGggPSAwO1xuXHRcdGxldCBjb21wb3Npbmc6IEVsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGltZUJhY2tTcGFjZSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY2xlYXJLZXlib2FyZFNjaGVkdWxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRrZXlib2FyZE1hcmtlci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0Y29tcG9zaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0bGVuZ3RoID0gMDtcblx0XHR9LCBrZXlib2FyZE1hcmtlclRpbWVvdXQpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkNvbXBvc2l0aW9uU3RhcnQuZXZlbnQoZSA9PiB7XG5cdFx0XHRpbWVCYWNrU3BhY2UgPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbkNvbXBvc2l0aW9uVXBkYXRlLmV2ZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUuZGF0YSAmJiBpbWVCYWNrU3BhY2UpIHtcblx0XHRcdFx0aWYgKGxlbmd0aCA+IDIwKSB7XG5cdFx0XHRcdFx0a2V5Ym9hcmRNYXJrZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdFx0bGVuZ3RoID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb21wb3NpbmcgPSBjb21wb3NpbmcgPz8gYXBwZW5kKGtleWJvYXJkTWFya2VyLCAkKCdzcGFuLmtleScpKTtcblx0XHRcdFx0Y29tcG9zaW5nLnRleHRDb250ZW50ID0gZS5kYXRhO1xuXHRcdFx0fSBlbHNlIGlmIChpbWVCYWNrU3BhY2UpIHtcblx0XHRcdFx0a2V5Ym9hcmRNYXJrZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdGFwcGVuZChrZXlib2FyZE1hcmtlciwgJCgnc3Bhbi5rZXknLCB7fSwgYEJhY2tzcGFjZWApKTtcblx0XHRcdH1cblx0XHRcdGNsZWFyS2V5Ym9hcmRTY2hlZHVsZXIuc2NoZWR1bGUoa2V5Ym9hcmRNYXJrZXJUaW1lb3V0KTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQob25Db21wb3NpdGlvbkVuZC5ldmVudChlID0+IHtcblx0XHRcdGNvbXBvc2luZyA9IHVuZGVmaW5lZDtcblx0XHRcdGxlbmd0aCsrO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChvbktleURvd24uZXZlbnQoZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdQcm9jZXNzJyB8fCAvW1xcdWFjMDAtXFx1ZDc4N1xcdTMxMzEtXFx1MzE0ZVxcdTMxNGYtXFx1MzE2M1xcdTMwNDEtXFx1MzA5NFxcdTMwYTEtXFx1MzBmNFxcdTMwZmNcXHUzMDA1XFx1MzAwNlxcdTMwMjRcXHU0ZTAwLVxcdTlmYTVdL3UudGVzdChlLmtleSkpIHtcblx0XHRcdFx0aWYgKGUuY29kZSA9PT0gJ0JhY2tzcGFjZScpIHtcblx0XHRcdFx0XHRpbWVCYWNrU3BhY2UgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFlLmNvZGUuaW5jbHVkZXMoJ0tleScpKSB7XG5cdFx0XHRcdFx0Y29tcG9zaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGltZUJhY2tTcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGltZUJhY2tTcGFjZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xlYXJLZXlib2FyZFNjaGVkdWxlci5zY2hlZHVsZShrZXlib2FyZE1hcmtlclRpbWVvdXQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmlzQ29tcG9zaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTY3JlZW5jYXN0S2V5Ym9hcmRPcHRpb25zPignc2NyZWVuY2FzdE1vZGUua2V5Ym9hcmRPcHRpb25zJyk7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRjb25zdCBzaG9ydGN1dCA9IGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaChldmVudCwgZXZlbnQudGFyZ2V0KTtcblxuXHRcdFx0Ly8gSGlkZSB0aGUgc2luZ2xlIGFycm93IGtleSBwcmVzc2VkXG5cdFx0XHRpZiAoc2hvcnRjdXQua2luZCA9PT0gUmVzdWx0S2luZC5LYkZvdW5kICYmIHNob3J0Y3V0LmNvbW1hbmRJZCAmJiAhKG9wdGlvbnMuc2hvd1NpbmdsZUVkaXRvckN1cnNvck1vdmVzID8/IHRydWUpICYmIChcblx0XHRcdFx0WydjdXJzb3JMZWZ0JywgJ2N1cnNvclJpZ2h0JywgJ2N1cnNvclVwJywgJ2N1cnNvckRvd24nXS5pbmNsdWRlcyhzaG9ydGN1dC5jb21tYW5kSWQpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRldmVudC5jdHJsS2V5IHx8IGV2ZW50LmFsdEtleSB8fCBldmVudC5tZXRhS2V5IHx8IGV2ZW50LnNoaWZ0S2V5XG5cdFx0XHRcdHx8IGxlbmd0aCA+IDIwXG5cdFx0XHRcdHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuQmFja3NwYWNlIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlXG5cdFx0XHRcdHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdyB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvd1xuXHRcdFx0XHR8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkxlZnRBcnJvdyB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3dcblx0XHRcdCkge1xuXHRcdFx0XHRrZXlib2FyZE1hcmtlci5pbm5lclRleHQgPSAnJztcblx0XHRcdFx0bGVuZ3RoID0gMDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGtleWJpbmRpbmdTZXJ2aWNlLnJlc29sdmVLZXlib2FyZEV2ZW50KGV2ZW50KTtcblx0XHRcdGNvbnN0IGNvbW1hbmREZXRhaWxzID0gKHRoaXMuX2lzS2JGb3VuZChzaG9ydGN1dCkgJiYgc2hvcnRjdXQuY29tbWFuZElkKSA/IHRoaXMuZ2V0Q29tbWFuZERldGFpbHMoc2hvcnRjdXQuY29tbWFuZElkKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IGNvbW1hbmRBbmRHcm91cExhYmVsID0gY29tbWFuZERldGFpbHM/LnRpdGxlO1xuXHRcdFx0bGV0IGtleUxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0ga2V5YmluZGluZy5nZXRMYWJlbCgpO1xuXG5cdFx0XHRpZiAoY29tbWFuZERldGFpbHMpIHtcblx0XHRcdFx0aWYgKChvcHRpb25zLnNob3dDb21tYW5kR3JvdXBzID8/IGZhbHNlKSAmJiBjb21tYW5kRGV0YWlscy5jYXRlZ29yeSkge1xuXHRcdFx0XHRcdGNvbW1hbmRBbmRHcm91cExhYmVsID0gYCR7Y29tbWFuZERldGFpbHMuY2F0ZWdvcnl9OiAke2NvbW1hbmRBbmRHcm91cExhYmVsfSBgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX2lzS2JGb3VuZChzaG9ydGN1dCkgJiYgc2hvcnRjdXQuY29tbWFuZElkKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ3MgPSBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncyhzaG9ydGN1dC5jb21tYW5kSWQpXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGsgPT4gay5nZXRMYWJlbCgpPy5lbmRzV2l0aChrZXlMYWJlbCA/PyAnJykpO1xuXG5cdFx0XHRcdFx0aWYgKGtleWJpbmRpbmdzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGtleUxhYmVsID0ga2V5YmluZGluZ3Nba2V5YmluZGluZ3MubGVuZ3RoIC0gMV0uZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKChvcHRpb25zLnNob3dDb21tYW5kcyA/PyB0cnVlKSAmJiBjb21tYW5kQW5kR3JvdXBMYWJlbCkge1xuXHRcdFx0XHRhcHBlbmQoa2V5Ym9hcmRNYXJrZXIsICQoJ3NwYW4udGl0bGUnLCB7fSwgYCR7Y29tbWFuZEFuZEdyb3VwTGFiZWx9IGApKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKChvcHRpb25zLnNob3dLZXlzID8/IHRydWUpIHx8ICgob3B0aW9ucy5zaG93S2V5YmluZGluZ3MgPz8gdHJ1ZSkgJiYgdGhpcy5faXNLYkZvdW5kKHNob3J0Y3V0KSkpIHtcblx0XHRcdFx0Ly8gRml4IGxhYmVsIGZvciBhcnJvdyBrZXlzXG5cdFx0XHRcdGtleUxhYmVsID0ga2V5TGFiZWw/LnJlcGxhY2UoJ1VwQXJyb3cnLCAnXHUyMTkxJylcblx0XHRcdFx0XHQ/LnJlcGxhY2UoJ0Rvd25BcnJvdycsICdcdTIxOTMnKVxuXHRcdFx0XHRcdD8ucmVwbGFjZSgnTGVmdEFycm93JywgJ1x1MjE5MCcpXG5cdFx0XHRcdFx0Py5yZXBsYWNlKCdSaWdodEFycm93JywgJ1x1MjE5MicpO1xuXG5cdFx0XHRcdGFwcGVuZChrZXlib2FyZE1hcmtlciwgJCgnc3Bhbi5rZXknLCB7fSwga2V5TGFiZWwgPz8gJycpKTtcblx0XHRcdH1cblxuXHRcdFx0bGVuZ3RoKys7XG5cdFx0XHRjbGVhcktleWJvYXJkU2NoZWR1bGVyLnNjaGVkdWxlKGtleWJvYXJkTWFya2VyVGltZW91dCk7XG5cdFx0fSkpO1xuXG5cdFx0VG9nZ2xlU2NyZWVuY2FzdE1vZGVBY3Rpb24uZGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNLYkZvdW5kKHJlc29sdXRpb25SZXN1bHQ6IFJlc29sdXRpb25SZXN1bHQpOiByZXNvbHV0aW9uUmVzdWx0IGlzIHsga2luZDogUmVzdWx0S2luZC5LYkZvdW5kOyBjb21tYW5kSWQ6IHN0cmluZyB8IG51bGw7IGNvbW1hbmRBcmdzOiB1bmtub3duOyBpc0J1YmJsZTogYm9vbGVhbiB9IHtcblx0XHRyZXR1cm4gcmVzb2x1dGlvblJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLktiRm91bmQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbW1hbmREZXRhaWxzKGNvbW1hbmRJZDogc3RyaW5nKTogeyB0aXRsZTogc3RyaW5nOyBjYXRlZ29yeT86IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmcm9tTWVudVJlZ2lzdHJ5ID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZElkKTtcblxuXHRcdGlmIChmcm9tTWVudVJlZ2lzdHJ5KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdHlwZW9mIGZyb21NZW51UmVnaXN0cnkudGl0bGUgPT09ICdzdHJpbmcnID8gZnJvbU1lbnVSZWdpc3RyeS50aXRsZSA6IGZyb21NZW51UmVnaXN0cnkudGl0bGUudmFsdWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBmcm9tTWVudVJlZ2lzdHJ5LmNhdGVnb3J5ID8gKHR5cGVvZiBmcm9tTWVudVJlZ2lzdHJ5LmNhdGVnb3J5ID09PSAnc3RyaW5nJyA/IGZyb21NZW51UmVnaXN0cnkuY2F0ZWdvcnkgOiBmcm9tTWVudVJlZ2lzdHJ5LmNhdGVnb3J5LnZhbHVlKSA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tQ29tbWFuZHNSZWdpc3RyeSA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpO1xuXG5cdFx0aWYgKGZyb21Db21tYW5kc1JlZ2lzdHJ5Py5tZXRhZGF0YT8uZGVzY3JpcHRpb24pIHtcblx0XHRcdHJldHVybiB7IHRpdGxlOiB0eXBlb2YgZnJvbUNvbW1hbmRzUmVnaXN0cnkubWV0YWRhdGEuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gZnJvbUNvbW1hbmRzUmVnaXN0cnkubWV0YWRhdGEuZGVzY3JpcHRpb24gOiBmcm9tQ29tbWFuZHNSZWdpc3RyeS5tZXRhZGF0YS5kZXNjcmlwdGlvbi52YWx1ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgTG9nU3RvcmFnZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5sb2dTdG9yYWdlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoeyBrZXk6ICdsb2dTdG9yYWdlJywgY29tbWVudDogWydBIGRldmVsb3BlciBvbmx5IGFjdGlvbiB0byBsb2cgdGhlIGNvbnRlbnRzIG9mIHRoZSBzdG9yYWdlIGZvciB0aGUgY3VycmVudCB3aW5kb3cuJ10gfSwgXCJMb2cgU3RvcmFnZSBEYXRhYmFzZSBDb250ZW50c1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2UubG9nKCk7XG5cblx0XHRkaWFsb2dTZXJ2aWNlLmluZm8obG9jYWxpemUoJ3N0b3JhZ2VMb2dEaWFsb2dNZXNzYWdlJywgXCJUaGUgc3RvcmFnZSBkYXRhYmFzZSBjb250ZW50cyBoYXZlIGJlZW4gbG9nZ2VkIHRvIHRoZSBkZXZlbG9wZXIgdG9vbHMuXCIpLCBsb2NhbGl6ZSgnc3RvcmFnZUxvZ0RpYWxvZ0RldGFpbHMnLCBcIk9wZW4gZGV2ZWxvcGVyIHRvb2xzIGZyb20gdGhlIG1lbnUgYW5kIHNlbGVjdCB0aGUgQ29uc29sZSB0YWIuXCIpKTtcblx0fVxufVxuXG5jbGFzcyBMb2dXb3JraW5nQ29waWVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmxvZ1dvcmtpbmdDb3BpZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMih7IGtleTogJ2xvZ1dvcmtpbmdDb3BpZXMnLCBjb21tZW50OiBbJ0EgZGV2ZWxvcGVyIG9ubHkgYWN0aW9uIHRvIGxvZyB0aGUgd29ya2luZyBjb3BpZXMgdGhhdCBleGlzdC4nXSB9LCBcIkxvZyBXb3JraW5nIENvcGllc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3JraW5nQ29weVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtpbmdDb3B5U2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IG91dHB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYmFja3VwcyA9IGF3YWl0IHdvcmtpbmdDb3B5QmFja3VwU2VydmljZS5nZXRCYWNrdXBzKCk7XG5cblx0XHRjb25zdCBtc2cgPSBbXG5cdFx0XHRgYCxcblx0XHRcdGBbV29ya2luZyBDb3BpZXNdYCxcblx0XHRcdC4uLih3b3JraW5nQ29weVNlcnZpY2Uud29ya2luZ0NvcGllcy5sZW5ndGggPiAwKSA/XG5cdFx0XHRcdHdvcmtpbmdDb3B5U2VydmljZS53b3JraW5nQ29waWVzLm1hcCh3b3JraW5nQ29weSA9PiBgJHt3b3JraW5nQ29weS5pc0RpcnR5KCkgPyAnXHUyNUNGICcgOiAnJ30ke3dvcmtpbmdDb3B5LnJlc291cmNlLnRvU3RyaW5nKHRydWUpfSAodHlwZUlkOiAke3dvcmtpbmdDb3B5LnR5cGVJZCB8fCAnPG5vIHR5cGVJZD4nfSlgKSA6XG5cdFx0XHRcdFsnPG5vbmU+J10sXG5cdFx0XHRgYCxcblx0XHRcdGBbQmFja3Vwc11gLFxuXHRcdFx0Li4uKGJhY2t1cHMubGVuZ3RoID4gMCkgP1xuXHRcdFx0XHRiYWNrdXBzLm1hcChiYWNrdXAgPT4gYCR7YmFja3VwLnJlc291cmNlLnRvU3RyaW5nKHRydWUpfSAodHlwZUlkOiAke2JhY2t1cC50eXBlSWQgfHwgJzxubyB0eXBlSWQ+J30pYCkgOlxuXHRcdFx0XHRbJzxub25lPiddLFxuXHRcdF07XG5cblx0XHRsb2dTZXJ2aWNlLmluZm8obXNnLmpvaW4oJ1xcbicpKTtcblxuXHRcdG91dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwod2luZG93TG9nSWQsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIFJlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHN0YXRpYyBTSVpFX1RIUkVTSE9MRCA9IDEwMjQgKiAxNjsgLy8gMTZrYlxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5yZW1vdmVMYXJnZVN0b3JhZ2VEYXRhYmFzZUVudHJpZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVtb3ZlTGFyZ2VTdG9yYWdlRGF0YWJhc2VFbnRyaWVzJywgJ1JlbW92ZSBMYXJnZSBTdG9yYWdlIERhdGFiYXNlIEVudHJpZXMuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0aW50ZXJmYWNlIElTdG9yYWdlSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgc2NvcGU6IFN0b3JhZ2VTY29wZTtcblx0XHRcdHJlYWRvbmx5IHRhcmdldDogU3RvcmFnZVRhcmdldDtcblx0XHRcdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtczogSVN0b3JhZ2VJdGVtW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgc2NvcGUgb2YgW1N0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0VdKSB7XG5cdFx0XHRpZiAoc2NvcGUgPT09IFN0b3JhZ2VTY29wZS5QUk9GSUxFICYmIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBhdm9pZCBkdXBsaWNhdGVzXG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgdGFyZ2V0IG9mIFtTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUsIFN0b3JhZ2VUYXJnZXQuVVNFUl0pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygc3RvcmFnZVNlcnZpY2Uua2V5cyhzY29wZSwgdGFyZ2V0KSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgc2NvcGUpO1xuXHRcdFx0XHRcdGlmICh2YWx1ZSAmJiAoIWVudmlyb25tZW50U2VydmljZS5pc0J1aWx0IC8qIHNob3cgYWxsIGtleXMgaW4gZGV2ICovIHx8IHZhbHVlLmxlbmd0aCA+IFJlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNBY3Rpb24uU0laRV9USFJFU0hPTEQpKSB7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdFx0XHRzY29wZSxcblx0XHRcdFx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRcdFx0XHRzaXplOiB2YWx1ZS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBrZXksXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBCeXRlU2l6ZS5mb3JtYXRTaXplKHZhbHVlLmxlbmd0aCksXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2xhcmdlU3RvcmFnZUl0ZW1EZXRhaWwnLCBcIlNjb3BlOiB7MH0sIFRhcmdldDogezF9XCIsIHNjb3BlID09PSBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04gPyBsb2NhbGl6ZSgnZ2xvYmFsJywgXCJHbG9iYWxcIikgOiBzY29wZSA9PT0gU3RvcmFnZVNjb3BlLlBST0ZJTEUgPyBsb2NhbGl6ZSgncHJvZmlsZScsIFwiUHJvZmlsZVwiKSA6IGxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSwgdGFyZ2V0ID09PSBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgPyBsb2NhbGl6ZSgnbWFjaGluZScsIFwiTWFjaGluZVwiKSA6IGxvY2FsaXplKCd1c2VyJywgXCJVc2VyXCIpKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGl0ZW1zLnNvcnQoKGl0ZW1BLCBpdGVtQikgPT4gaXRlbUIuc2l6ZSAtIGl0ZW1BLnNpemUpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IGF3YWl0IG5ldyBQcm9taXNlPHJlYWRvbmx5IElTdG9yYWdlSXRlbVtdPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElTdG9yYWdlSXRlbT4oKSk7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHRcdHBpY2tlci5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRcdHBpY2tlci5vayA9IGZhbHNlO1xuXHRcdFx0cGlja2VyLmN1c3RvbUJ1dHRvbiA9IHRydWU7XG5cdFx0XHRwaWNrZXIuaGlkZUNoZWNrQWxsID0gdHJ1ZTtcblx0XHRcdHBpY2tlci5jdXN0b21MYWJlbCA9IGxvY2FsaXplKCdyZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzUGlja2VyQnV0dG9uJywgXCJSZW1vdmVcIik7XG5cdFx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgncmVtb3ZlTGFyZ2VTdG9yYWdlRW50cmllc1BpY2tlclBsYWNlaG9sZGVyJywgXCJTZWxlY3QgbGFyZ2UgZW50cmllcyB0byByZW1vdmUgZnJvbSBzdG9yYWdlXCIpO1xuXG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHBpY2tlci5kZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdyZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzUGlja2VyRGVzY3JpcHRpb25Ob0VudHJpZXMnLCBcIlRoZXJlIGFyZSBubyBsYXJnZSBzdG9yYWdlIGVudHJpZXMgdG8gcmVtb3ZlLlwiKTtcblx0XHRcdH1cblxuXHRcdFx0cGlja2VyLnNob3coKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEN1c3RvbSgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXMpO1xuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkSGlkZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHR9KTtcblxuXHRcdGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3JlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNDb25maXJtUmVtb3ZlJywgXCJEbyB5b3Ugd2FudCB0byByZW1vdmUgdGhlIHNlbGVjdGVkIHN0b3JhZ2UgZW50cmllcyBmcm9tIHRoZSBkYXRhYmFzZT9cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdyZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzQ29uZmlybVJlbW92ZURldGFpbCcsIFwiezB9XFxuXFxuVGhpcyBhY3Rpb24gaXMgaXJyZXZlcnNpYmxlIGFuZCBtYXkgcmVzdWx0IGluIGRhdGEgbG9zcyFcIiwgc2VsZWN0ZWRJdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmxhYmVsKS5qb2luKCdcXG4nKSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3JlbW92ZUxhcmdlU3RvcmFnZUVudHJpZXNCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlbW92ZVwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY29wZXNUb09wdGltaXplID0gbmV3IFNldDxTdG9yYWdlU2NvcGU+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNlbGVjdGVkSXRlbXMpIHtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShpdGVtLmtleSwgaXRlbS5zY29wZSk7XG5cdFx0XHRzY29wZXNUb09wdGltaXplLmFkZChpdGVtLnNjb3BlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIHNjb3Blc1RvT3B0aW1pemUpIHtcblx0XHRcdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLm9wdGltaXplKHNjb3BlKTtcblx0XHR9XG5cdH1cbn1cblxubGV0IHRyYWNrZXI6IERpc3Bvc2FibGVUcmFja2VyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xubGV0IHRyYWNrZWREaXNwb3NhYmxlcyA9IG5ldyBTZXQ8SURpc3Bvc2FibGU+KCk7XG5cbmNvbnN0IERpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTwnc3RhcnRlZCcgfCAncGVuZGluZycgfCAnc3RvcHBlZCc+KCdkaXJ0eVdvcmtpbmdDb3BpZXMnLCAnc3RvcHBlZCcpO1xuXG5jbGFzcyBTdGFydFRyYWNrRGlzcG9zYWJsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc3RhcnRUcmFja0Rpc3Bvc2FibGVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N0YXJ0VHJhY2tEaXNwb3NhYmxlcycsICdTdGFydCBUcmFja2luZyBEaXNwb3NhYmxlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmlzRXF1YWxUbygncGVuZGluZycpLm5lZ2F0ZSgpLCBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmlzRXF1YWxUbygnc3RhcnRlZCcpLm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXNTbmFwc2hvdFN0YXRlQ29udGV4dCA9IERpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQuYmluZFRvKGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRkaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LnNldCgnc3RhcnRlZCcpO1xuXG5cdFx0dHJhY2tlZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0cmFja2VyID0gbmV3IERpc3Bvc2FibGVUcmFja2VyKCk7XG5cdFx0c2V0RGlzcG9zYWJsZVRyYWNrZXIodHJhY2tlcik7XG5cdH1cbn1cblxuY2xhc3MgU25hcHNob3RUcmFja2VkRGlzcG9zYWJsZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc25hcHNob3RUcmFja2VkRGlzcG9zYWJsZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc25hcHNob3RUcmFja2VkRGlzcG9zYWJsZXMnLCAnU25hcHNob3QgVHJhY2tlZCBEaXNwb3NhYmxlcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IERpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCdzdGFydGVkJylcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQgPSBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmJpbmRUbyhhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXNTbmFwc2hvdFN0YXRlQ29udGV4dC5zZXQoJ3BlbmRpbmcnKTtcblxuXHRcdHRyYWNrZWREaXNwb3NhYmxlcyA9IG5ldyBTZXQodHJhY2tlcj8uY29tcHV0ZUxlYWtpbmdEaXNwb3NhYmxlcygxMDAwKT8ubGVha3MubWFwKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS52YWx1ZSkpO1xuXHR9XG59XG5cbmNsYXNzIFN0b3BUcmFja0Rpc3Bvc2FibGVzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnN0b3BUcmFja0Rpc3Bvc2FibGVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N0b3BUcmFja0Rpc3Bvc2FibGVzJywgJ1N0b3AgVHJhY2tpbmcgRGlzcG9zYWJsZXMnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmlzRXF1YWxUbygncGVuZGluZycpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzU25hcHNob3RTdGF0ZUNvbnRleHQgPSBEaXNwb3NhYmxlc1NuYXBzaG90U3RhdGVDb250ZXh0LmJpbmRUbyhhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0ZGlzcG9zYWJsZXNTbmFwc2hvdFN0YXRlQ29udGV4dC5zZXQoJ3N0b3BwZWQnKTtcblxuXHRcdGlmICh0cmFja2VyKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlTGVha3MgPSBuZXcgU2V0PERpc3Bvc2FibGVJbmZvPigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgbmV3IFNldCh0cmFja2VyLmNvbXB1dGVMZWFraW5nRGlzcG9zYWJsZXMoMTAwMCk/LmxlYWtzKSA/PyBbXSkge1xuXHRcdFx0XHRpZiAodHJhY2tlZERpc3Bvc2FibGVzLmhhcyhkaXNwb3NhYmxlLnZhbHVlKSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVMZWFrcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGVha3MgPSB0cmFja2VyLmNvbXB1dGVMZWFraW5nRGlzcG9zYWJsZXMoMTAwMCwgQXJyYXkuZnJvbShkaXNwb3NhYmxlTGVha3MpKTtcblx0XHRcdGlmIChsZWFrcykge1xuXHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdW5kZWZpbmVkLCBjb250ZW50czogbGVha3MuZGV0YWlscyB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXREaXNwb3NhYmxlVHJhY2tlcihudWxsKTtcblx0XHR0cmFja2VyID0gdW5kZWZpbmVkO1xuXHRcdHRyYWNrZWREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG59XG5cbi8qKiBIdW1hbi1yZWFkYWJsZSBsYWJlbCBmb3IgYSBtYW5hZ2VkLXNldHRpbmdzIHtAbGluayBNYW5hZ2VkU2V0dGluZ3NTb3VyY2V9IGluIHRoZSBkaWFnbm9zdGljcyByZXBvcnQuICovXG5mdW5jdGlvbiBtYW5hZ2VkU2V0dGluZ3NTb3VyY2VMYWJlbChzb3VyY2U6IE1hbmFnZWRTZXR0aW5nc1NvdXJjZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0Y2FzZSAnc2VydmVyJzogcmV0dXJuICdHaXRIdWIgU2VydmVyIEFQSSc7XG5cdFx0Y2FzZSAnbmF0aXZlTWRtJzogcmV0dXJuICdOYXRpdmUgTURNJztcblx0XHRjYXNlICdmaWxlJzogcmV0dXJuICdGaWxlIChtYW5hZ2VkLXNldHRpbmdzLmpzb24pJztcblx0XHRjYXNlICdub25lJzogcmV0dXJuICdOb25lIChubyBtYW5hZ2VkIHNldHRpbmdzIGFjdGl2ZSknO1xuXHR9XG59XG5cbi8qKiBDb21wYWN0IGxhYmVsIGZvciB0aGUgXCJQb2xpY3kgU291cmNlXCIgY29sdW1uLCB3aGVyZSB0aGUgYWRqYWNlbnQgXCJNYW5hZ2VkIFNldHRpbmdzXCIgY29sdW1uIGFscmVhZHkgbGlzdHMgdGhlIGtleS4gKi9cbmZ1bmN0aW9uIG1hbmFnZWRTZXR0aW5nc1NvdXJjZVNob3J0TGFiZWwoc291cmNlOiBNYW5hZ2VkU2V0dGluZ3NTb3VyY2UpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHNvdXJjZSkge1xuXHRcdGNhc2UgJ3NlcnZlcic6IHJldHVybiAnU2VydmVyJztcblx0XHRjYXNlICduYXRpdmVNZG0nOiByZXR1cm4gJ05hdGl2ZSBNRE0nO1xuXHRcdGNhc2UgJ2ZpbGUnOiByZXR1cm4gJ0ZpbGUnO1xuXHRcdGNhc2UgJ25vbmUnOiByZXR1cm4gJ05vbmUnO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBvbGljeVZhbHVlU291cmNlTGFiZWwoc291cmNlOiBQb2xpY3lWYWx1ZVNvdXJjZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0Y2FzZSBQb2xpY3lWYWx1ZVNvdXJjZS5EZXZpY2U6IHJldHVybiAnRGV2aWNlJztcblx0XHRjYXNlIFBvbGljeVZhbHVlU291cmNlLk5hdGl2ZU1kbTogcmV0dXJuICdNYW5hZ2VkIFNldHRpbmdzOiBOYXRpdmUgTURNJztcblx0XHRjYXNlIFBvbGljeVZhbHVlU291cmNlLlNlcnZlck1hbmFnZWRTZXR0aW5nczogcmV0dXJuICdNYW5hZ2VkIFNldHRpbmdzOiBTZXJ2ZXInO1xuXHRcdGNhc2UgUG9saWN5VmFsdWVTb3VyY2UuRmlsZU1hbmFnZWRTZXR0aW5nczogcmV0dXJuICdNYW5hZ2VkIFNldHRpbmdzOiBGaWxlJztcblx0XHRjYXNlIFBvbGljeVZhbHVlU291cmNlLk1peGVkTWFuYWdlZFNldHRpbmdzOiByZXR1cm4gJ01hbmFnZWQgU2V0dGluZ3M6IE1peGVkJztcblx0XHRjYXNlIFBvbGljeVZhbHVlU291cmNlLkFjY291bnQ6IHJldHVybiAnQWNjb3VudCc7XG5cdFx0Y2FzZSBQb2xpY3lWYWx1ZVNvdXJjZS5BY2NvdW50R2F0ZTogcmV0dXJuICdBY2NvdW50IFBvbGljeSBHYXRlJztcblx0XHRjYXNlIHVuZGVmaW5lZDogcmV0dXJuICdVbmtub3duJztcblx0fVxufVxuXG5mdW5jdGlvbiBtYW5hZ2VkU2V0dGluZ3NQaXBlbGluZShyYXdMYWJlbDogc3RyaW5nLCByYXc6IHVua25vd24gfCB1bmRlZmluZWQsIG5vcm1hbGl6ZWQ6IE1hbmFnZWRTZXR0aW5nc0RhdGEsIHByb2plY3RlZDogTWFuYWdlZFNldHRpbmdzRGF0YSwgcmF3VW5hdmFpbGFibGVNZXNzYWdlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGNvbnRlbnQgPSBgKioke21hcmtkb3duVGV4dChyYXdMYWJlbCl9KipcXG5cXG5gO1xuXHRjb250ZW50ICs9IHJhdyA9PT0gdW5kZWZpbmVkID8gYCoke21hcmtkb3duVGV4dChyYXdVbmF2YWlsYWJsZU1lc3NhZ2UgPz8gJ1VuYXZhaWxhYmxlJyl9KlxcblxcbmAgOiBtYXJrZG93bkpzb25CbG9jayhyYXcpO1xuXHRjb250ZW50ICs9ICcqKk5vcm1hbGl6ZWQgYmFnKipcXG5cXG4nO1xuXHRjb250ZW50ICs9IG1hcmtkb3duSnNvbkJsb2NrKG5vcm1hbGl6ZWQpO1xuXHRjb250ZW50ICs9ICcqKlZTIENvZGUgcG9saWN5IHByb2plY3Rpb24qKlxcblxcbic7XG5cdGNvbnRlbnQgKz0gbWFya2Rvd25Kc29uQmxvY2socHJvamVjdGVkKTtcblx0cmV0dXJuIG1hcmtkb3duRGV0YWlscygnU291cmNlLCBub3JtYWxpemVkLCBhbmQgVlMgQ29kZSBwcm9qZWN0aW9uJywgY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdERpYWdub3N0aWNWYWx1ZSh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgPz8gU3RyaW5nKHZhbHVlKTtcbn1cblxuY29uc3QgQUdFTlRfUlVOVElNRV9ESUFHTk9TVElDU19USU1FT1VUID0gNjAwMDtcblxuaW50ZXJmYWNlIElQb2xpY3lEaWFnbm9zdGljc1N1bW1hcnkge1xuXHRhY2NvdW50UG9saWN5R2F0ZTogc3RyaW5nO1xuXHRtYW5hZ2VkU2V0dGluZ3NTb3VyY2VzOiBzdHJpbmc7XG5cdGVmZmVjdGl2ZU1hbmFnZWRTZXR0aW5nczogc3RyaW5nO1xuXHRtYW5hZ2VkU2V0dGluZ3NJc3N1ZXM6IHN0cmluZztcblx0YWdlbnRSdW50aW1lOiBzdHJpbmc7XG5cdHBvbGljeUNvbnRyb2xsZWRTZXR0aW5nczogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVBvbGljeURpYWdub3N0aWNzU2VydmljZXMge1xuXHRlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZTtcblx0Y29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZTtcblx0bm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2U7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2U7XG5cdGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZTtcblx0YXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlO1xuXHRhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U7XG5cdHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlO1xuXHRhY2NvdW50UG9saWN5R2F0ZVNlcnZpY2U6IElBY2NvdW50UG9saWN5R2F0ZVNlcnZpY2U7XG5cdGFnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlO1xuXHRhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlO1xuXHRuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlOiBJTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSB8IHVuZGVmaW5lZDtcblx0ZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2U6IElGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgUG9saWN5RGlhZ25vc3RpY3NBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd1BvbGljeURpYWdub3N0aWNzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3BvbGljeURpYWdub3N0aWNzJywgJ1BvbGljeSBEaWFnbm9zdGljcycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZHVjdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJRGVmYXVsdEFjY291bnRTZXJ2aWNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHBvbGljeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBvbGljeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjY291bnRQb2xpY3lHYXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjb3VudFBvbGljeUdhdGVTZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2dyZXNzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZ3Jlc3NTZXJ2aWNlKTtcblx0XHQvLyBOYXRpdmUgTURNIGlzIGEgZGVza3RvcC1vbmx5IGNoYW5uZWwsIHJlZ2lzdGVyZWQgaW4gdGhlIHJlbmRlcmVyIHNlcnZpY2UgY29sbGVjdGlvbiBvblxuXHRcdC8vIGRlc2t0b3AgYW5kIEFnZW50cyB3aW5kb3dzIGJ1dCBhYnNlbnQgaW4gd2ViLiBSZXNvbHZlIGl0IG5vdywgc3luY2hyb25vdXNseSwgYmVjYXVzZSB0aGVcblx0XHQvLyBhY2Nlc3NvciBpcyBvbmx5IHZhbGlkIGJlZm9yZSB0aGUgZmlyc3QgYGF3YWl0YCBiZWxvdy5cblx0XHRsZXQgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZTogSU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gbm8gbmF0aXZlIE1ETSBjaGFubmVsIGluIHRoaXMgd2luZG93IChlLmcuIHdlYilcblx0XHR9XG5cdFx0Ly8gRmlsZS1iYXNlZCBtYW5hZ2VkIHNldHRpbmdzIGlzIGxpa2V3aXNlIGEgZGVza3RvcC1vbmx5IGNoYW5uZWwgcmVnaXN0ZXJlZCBpbiB0aGUgcmVuZGVyZXJcblx0XHQvLyBzZXJ2aWNlIGNvbGxlY3Rpb24gb24gZGVza3RvcCBhbmQgQWdlbnRzIHdpbmRvd3MsIGFic2VudCBpbiB3ZWIuXG5cdFx0bGV0IGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlOiBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBubyBmaWxlIGNoYW5uZWwgaW4gdGhpcyB3aW5kb3cgKGUuZy4gd2ViKVxuXHRcdH1cblxuXHRcdHJldHVybiBwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncG9saWN5RGlhZ25vc3RpY3MucHJvZ3Jlc3MnLCBcIkdlbmVyYXRpbmcgcG9saWN5IGRpYWdub3N0aWNzLi4uXCIpLFxuXHRcdFx0dHlwZTogJ2xvYWRpbmcnLFxuXHRcdH0sICgpID0+IHRoaXMub3BlblBvbGljeURpYWdub3N0aWNzKHtcblx0XHRcdGVkaXRvclNlcnZpY2UsXG5cdFx0XHRjb21tYW5kU2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdFx0YXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLFxuXHRcdFx0cG9saWN5U2VydmljZSxcblx0XHRcdGFjY291bnRQb2xpY3lHYXRlU2VydmljZSxcblx0XHRcdGFnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHRhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSxcblx0XHRcdG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsXG5cdFx0XHRmaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5Qb2xpY3lEaWFnbm9zdGljcyhzZXJ2aWNlczogSVBvbGljeURpYWdub3N0aWNzU2VydmljZXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7XG5cdFx0XHRlZGl0b3JTZXJ2aWNlLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2UsXG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRwcm9kdWN0U2VydmljZSxcblx0XHRcdGRlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRcdGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSxcblx0XHRcdHBvbGljeVNlcnZpY2UsXG5cdFx0XHRhY2NvdW50UG9saWN5R2F0ZVNlcnZpY2UsXG5cdFx0XHRhZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdFx0YWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHRuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdFx0ZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsXG5cdFx0fSA9IHNlcnZpY2VzO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeTogSVBvbGljeURpYWdub3N0aWNzU3VtbWFyeSA9IHtcblx0XHRcdGFjY291bnRQb2xpY3lHYXRlOiAnVW5hdmFpbGFibGUnLFxuXHRcdFx0bWFuYWdlZFNldHRpbmdzU291cmNlczogJ1VuYXZhaWxhYmxlJyxcblx0XHRcdGVmZmVjdGl2ZU1hbmFnZWRTZXR0aW5nczogJ1VuYXZhaWxhYmxlJyxcblx0XHRcdG1hbmFnZWRTZXR0aW5nc0lzc3VlczogJ1VuYXZhaWxhYmxlJyxcblx0XHRcdGFnZW50UnVudGltZTogJ1VuYXZhaWxhYmxlJyxcblx0XHRcdHBvbGljeUNvbnRyb2xsZWRTZXR0aW5nczogJ1VuYXZhaWxhYmxlJ1xuXHRcdH07XG5cblx0XHRsZXQgY29udGVudCA9ICcnO1xuXHRcdGNvbnRlbnQgKz0gJyMjIFN5c3RlbSBJbmZvcm1hdGlvblxcblxcbic7XG5cdFx0Y29udGVudCArPSBtYXJrZG93blRhYmxlKFxuXHRcdFx0WydQcm9wZXJ0eScsICdWYWx1ZSddLFxuXHRcdFx0W1xuXHRcdFx0XHRbJ0dlbmVyYXRlZCcsIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKV0sXG5cdFx0XHRcdFsnUHJvZHVjdCcsIGAke3Byb2R1Y3RTZXJ2aWNlLm5hbWVMb25nfSAke3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb259YF0sXG5cdFx0XHRcdFsnQ29tbWl0JywgcHJvZHVjdFNlcnZpY2UuY29tbWl0IHx8ICduL2EnXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBBY2NvdW50IGluZm9ybWF0aW9uXG5cdFx0Y29udGVudCArPSAnIyMgQWNjb3VudCBJbmZvcm1hdGlvblxcblxcbic7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY291bnQgPSBhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnQoKTtcblx0XHRcdGNvbnN0IHNlbnNpdGl2ZUtleXMgPSBbJ3Nlc3Npb25JZCcsICdhbmFseXRpY3NfdHJhY2tpbmdfaWQnXTtcblx0XHRcdGlmIChhY2NvdW50KSB7XG5cdFx0XHRcdC8vIFRyeSB0byBnZXQgdXNlcm5hbWUvZGlzcGxheSBpbmZvIGZyb20gdGhlIGF1dGhlbnRpY2F0aW9uIHNlc3Npb25cblx0XHRcdFx0bGV0IHVzZXJuYW1lID0gJ1Vua25vd24nO1xuXHRcdFx0XHRsZXQgYWNjb3VudExhYmVsID0gJ1Vua25vd24nO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVySWRzID0gYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwcm92aWRlcklkIG9mIHByb3ZpZGVySWRzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoaW5nU2Vzc2lvbiA9IHNlc3Npb25zLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLmlkID09PSBhY2NvdW50LnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRpZiAobWF0Y2hpbmdTZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdHVzZXJuYW1lID0gbWF0Y2hpbmdTZXNzaW9uLmFjY291bnQuaWQ7XG5cdFx0XHRcdFx0XHRcdGFjY291bnRMYWJlbCA9IG1hdGNoaW5nU2Vzc2lvbi5hY2NvdW50LmxhYmVsO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gRmFsbGJhY2sgdG8ganVzdCBzZXNzaW9uIGluZm9cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnRlbnQgKz0gJyMjIyBEZWZhdWx0IEFjY291bnQgU3VtbWFyeVxcblxcbic7XG5cdFx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25UYWJsZShcblx0XHRcdFx0XHRbJ1Byb3BlcnR5JywgJ1ZhbHVlJ10sXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0WydBY2NvdW50IElEL1VzZXJuYW1lJywgdXNlcm5hbWVdLFxuXHRcdFx0XHRcdFx0WydBY2NvdW50IExhYmVsJywgYWNjb3VudExhYmVsXVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblxuXHRcdFx0XHRjb25zdCBhY2NvdW50UHJvcGVydHlSb3dzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGFjY291bnQpKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3BsYXlWYWx1ZSA9IHNlbnNpdGl2ZUtleXMuaW5jbHVkZXMoa2V5KVxuXHRcdFx0XHRcdFx0XHQ/ICcqKionXG5cdFx0XHRcdFx0XHRcdDogdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyA/IGZvcm1hdERpYWdub3N0aWNWYWx1ZSh2YWx1ZSkgOiBTdHJpbmcodmFsdWUpO1xuXHRcdFx0XHRcdFx0YWNjb3VudFByb3BlcnR5Um93cy5wdXNoKFtrZXksIGRpc3BsYXlWYWx1ZV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwb2xpY3lEYXRhID0gZGVmYXVsdEFjY291bnRTZXJ2aWNlLnBvbGljeURhdGE7XG5cdFx0XHRcdGFjY291bnRQcm9wZXJ0eVJvd3MucHVzaChbJ3BvbGljeURhdGEnLCBwb2xpY3lEYXRhID8gZm9ybWF0RGlhZ25vc3RpY1ZhbHVlKHBvbGljeURhdGEpIDogJ05vIFBvbGljeSBEYXRhJ10pO1xuXHRcdFx0XHRjb250ZW50ICs9IG1hcmtkb3duRGV0YWlscyhcblx0XHRcdFx0XHQnRGV0YWlsZWQgYWNjb3VudCBwcm9wZXJ0aWVzJyxcblx0XHRcdFx0XHRtYXJrZG93blRhYmxlKFsnUHJvcGVydHknLCAnVmFsdWUnXSwgYWNjb3VudFByb3BlcnR5Um93cylcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRlbnQgKz0gJypObyBkZWZhdWx0IGFjY291bnQgY29uZmlndXJlZCpcXG5cXG4nO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb250ZW50ICs9IGAqRXJyb3IgcmV0cmlldmluZyBhY2NvdW50IGluZm9ybWF0aW9uOiAke21hcmtkb3duVGV4dChnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKX0qXFxuXFxuYDtcblx0XHR9XG5cblx0XHQvLyBBY2NvdW50IFBvbGljeSBHYXRlIChmb3JjZXMgQUkgZmVhdHVyZXMgb2ZmIHVudGlsIGFuIGFkbWluLWFwcHJvdmVkXG5cdFx0Ly8gR2l0SHViIGFjY291bnQgaXMgc2lnbmVkIGluIEFORCBpdHMgYWNjb3VudC1zaWRlIHBvbGljeSBkYXRhIGhhcyByZXNvbHZlZCkuXG5cdFx0Y29udGVudCArPSAnIyMgQWNjb3VudCBQb2xpY3kgR2F0ZVxcblxcbic7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGdhdGVJbmZvID0gYWNjb3VudFBvbGljeUdhdGVTZXJ2aWNlLmdhdGVJbmZvO1xuXHRcdFx0Y29uc3QgYXBwcm92ZWRPcmdzUmF3ID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZShBUFBST1ZFRF9BQ0NPVU5UX09SR0FOSVpBVElPTlNfUE9MSUNZX05BTUUpO1xuXHRcdFx0c3VtbWFyeS5hY2NvdW50UG9saWN5R2F0ZSA9IGdhdGVJbmZvLnJlYXNvbiA/IGAke2dhdGVJbmZvLnN0YXRlfSAoJHtnYXRlSW5mby5yZWFzb259KWAgOiBnYXRlSW5mby5zdGF0ZTtcblx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25UYWJsZShcblx0XHRcdFx0WydQcm9wZXJ0eScsICdWYWx1ZSddLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WydTdGF0ZScsIGdhdGVJbmZvLnN0YXRlXSxcblx0XHRcdFx0XHRbJ1JlYXNvbicsIGdhdGVJbmZvLnJlYXNvbiA/PyAnbi9hJ10sXG5cdFx0XHRcdFx0W0FQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgYXBwcm92ZWRPcmdzUmF3ICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoYXBwcm92ZWRPcmdzUmF3KSA6ICdub3Qgc2V0J11cblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHRcdGNvbnRlbnQgKz0gJyoqTGVnZW5kKipcXG5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnLSBgaW5hY3RpdmVgOiBnYXRlIGRpc2FibGVkIChubyBhcHByb3ZlZCBvcmdzIGNvbmZpZ3VyZWQpIFx1MjAxNCBwb2xpY2llcyBiZWhhdmUgYXMgYWNjb3VudCBkYXRhIGRpY3RhdGVzLlxcbic7XG5cdFx0XHRjb250ZW50ICs9ICctIGBzYXRpc2ZpZWRgOiBnYXRlIGFjdGl2ZSBhbmQgYXBwcm92ZWQgXHUyMDE0IGFjY291bnQgcG9saWN5IHZhbHVlcyBmbG93IG5vcm1hbGx5Llxcbic7XG5cdFx0XHRjb250ZW50ICs9ICctIGByZXN0cmljdGVkYDogZ2F0ZSBhY3RpdmUgYW5kIG5vdCBzYXRpc2ZpZWQgXHUyMDE0IG9wdGVkLWluIHBvbGljaWVzIGZvcmNlZCB0byB0aGVpciByZXN0cmljdGVkIHZhbHVlLlxcbic7XG5cdFx0XHRjb250ZW50ICs9ICcgIC0gYG5vQWNjb3VudGA6IG5vIGRlZmF1bHQgYWNjb3VudCBzaWduZWQgaW4uXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gJyAgLSBgd3JvbmdQcm92aWRlcmA6IHNpZ25lZCBpbiB3aXRoIGEgbm9uLUdpdEh1YiBwcm92aWRlci5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnICAtIGBvcmdOb3RBcHByb3ZlZGA6IHNpZ25lZCBpbiBidXQgYWNjb3VudCBpcyBub3QgYSBtZW1iZXIgb2YgYW55IGFwcHJvdmVkIG9yZ2FuaXphdGlvbi5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnICAtIGBwb2xpY3lOb3RSZXNvbHZlZGA6IHNpZ25lZCBpbiB0byBhbiBhcHByb3ZlZCBvcmcgYnV0IGFjY291bnQtc2lkZSBwb2xpY3kgZGF0YSBoYXMgbm90IHlldCBiZWVuIGZldGNoZWQuXFxuXFxuJztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29udGVudCArPSBgKkVycm9yIHJldHJpZXZpbmcgYWNjb3VudCBwb2xpY3kgZ2F0ZSBpbmZvOiAke21hcmtkb3duVGV4dChnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKX0qXFxuXFxuYDtcblx0XHR9XG5cblx0XHRjb250ZW50ICs9ICcjIyBNYW5hZ2VkIFNldHRpbmdzXFxuXFxuJztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcG9saWN5RGF0YSA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5wb2xpY3lEYXRhO1xuXHRcdFx0Y29uc3Qgc2VydmVyTWFuYWdlZFNldHRpbmdzID0gcG9saWN5RGF0YT8ubWFuYWdlZFNldHRpbmdzID8/IHt9O1xuXHRcdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzID0gbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZT8ubWFuYWdlZFNldHRpbmdzID8/IHt9O1xuXHRcdFx0Y29uc3QgZmlsZU1hbmFnZWRTZXR0aW5ncyA9IGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlPy5tYW5hZ2VkU2V0dGluZ3MgPz8ge307XG5cdFx0XHRjb25zdCBmaWxlUmF3TWFuYWdlZFNldHRpbmdzID0gZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2U/LnJhd01hbmFnZWRTZXR0aW5ncztcblxuXHRcdFx0Y29uc3QgZGVjbGFyZWREZWZpbml0aW9uczogUmVjb3JkPHN0cmluZywgSU1hbmFnZWRTZXR0aW5nUG9saWN5RGVmaW5pdGlvbj4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgWy4uLk9iamVjdC52YWx1ZXMoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkpLCAuLi5PYmplY3QudmFsdWVzKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCkpXSkge1xuXHRcdFx0XHRjb25zdCBkZWNsYXJlZCA9IHByb3BlcnR5LnBvbGljeT8ubWFuYWdlZFNldHRpbmdzO1xuXHRcdFx0XHRpZiAoZGVjbGFyZWQpIHtcblx0XHRcdFx0XHRPYmplY3QuYXNzaWduKGRlY2xhcmVkRGVmaW5pdGlvbnMsIGRlY2xhcmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhuYXRpdmVNYW5hZ2VkU2V0dGluZ3MsIHNlcnZlck1hbmFnZWRTZXR0aW5ncywgZmlsZU1hbmFnZWRTZXR0aW5ncyk7XG5cdFx0XHRjb25zdCBwYXJzZUVycm9yczogeyBzdGFnZTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRjb25zdCBwcm9qZWN0Q2hhbm5lbCA9IChjaGFubmVsOiBNYW5hZ2VkU2V0dGluZ3NDaGFubmVsLCB2YWx1ZXM6IE1hbmFnZWRTZXR0aW5nc0RhdGEpOiBNYW5hZ2VkU2V0dGluZ3NEYXRhID0+IHByb2plY3RNYW5hZ2VkU2V0dGluZ3MoXG5cdFx0XHRcdHZhbHVlcyxcblx0XHRcdFx0ZGVjbGFyZWREZWZpbml0aW9ucyxcblx0XHRcdFx0bWVzc2FnZSA9PiBwYXJzZUVycm9ycy5wdXNoKHsgc3RhZ2U6IGAke2NoYW5uZWx9OiBwcm9qZWN0YCwgbWVzc2FnZSB9KVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGNoYW5uZWxDb250cmlidXRlcyA9IChjaGFubmVsOiBNYW5hZ2VkU2V0dGluZ3NDaGFubmVsKSA9PiBwaWNrLmFjdGl2ZVNvdXJjZXMuaW5jbHVkZXMoY2hhbm5lbCk7XG5cdFx0XHRjb25zdCBuYXRpdmVQcm9qZWN0ZWQgPSBwcm9qZWN0Q2hhbm5lbCgnbmF0aXZlTWRtJywgbmF0aXZlTWFuYWdlZFNldHRpbmdzKTtcblx0XHRcdGNvbnN0IHNlcnZlclByb2plY3RlZCA9IHByb2plY3RDaGFubmVsKCdzZXJ2ZXInLCBzZXJ2ZXJNYW5hZ2VkU2V0dGluZ3MpO1xuXHRcdFx0Y29uc3QgZmlsZVByb2plY3RlZCA9IHByb2plY3RDaGFubmVsKCdmaWxlJywgZmlsZU1hbmFnZWRTZXR0aW5ncyk7XG5cdFx0XHRjb25zdCBlZmZlY3RpdmUgPSBwcm9qZWN0TWFuYWdlZFNldHRpbmdzKHBpY2sudmFsdWVzLCBkZWNsYXJlZERlZmluaXRpb25zLCBtZXNzYWdlID0+IHBhcnNlRXJyb3JzLnB1c2goeyBzdGFnZTogJ2VmZmVjdGl2ZTogcHJvamVjdCcsIG1lc3NhZ2UgfSkpO1xuXG5cdFx0XHRjb25zdCByYXdSZXNwb25zZSA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5tYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZTtcblx0XHRcdGlmIChpc09iamVjdChyYXdSZXNwb25zZSkpIHtcblx0XHRcdFx0YWRhcHRNYW5hZ2VkU2V0dGluZ3MocmF3UmVzcG9uc2UgYXMgSU1hbmFnZWRTZXR0aW5nc1Jlc3BvbnNlLCBtZXNzYWdlID0+IHBhcnNlRXJyb3JzLnB1c2goeyBzdGFnZTogJ2FkYXB0JywgbWVzc2FnZSB9KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZmlsZVJhd01hbmFnZWRTZXR0aW5ncykge1xuXHRcdFx0XHRub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3MoZmlsZVJhd01hbmFnZWRTZXR0aW5ncywgbWVzc2FnZSA9PiBwYXJzZUVycm9ycy5wdXNoKHsgc3RhZ2U6ICdmaWxlOiBub3JtYWxpemUnLCBtZXNzYWdlIH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWSwgQ09QSUxPVF9TVFJJQ1RfTUFSS0VUUExBQ0VTX0tFWSwgQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZXSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVmZmVjdGl2ZVtrZXldO1xuXHRcdFx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGpzb25FcnJvcnM6IGpzb24uUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRcdGpzb24ucGFyc2UodmFsdWUsIGpzb25FcnJvcnMpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVycm9yIG9mIGpzb25FcnJvcnMpIHtcblx0XHRcdFx0XHRwYXJzZUVycm9ycy5wdXNoKHsgc3RhZ2U6ICdwYXJzZScsIG1lc3NhZ2U6IGAke2tleX0gQCBvZmZzZXQgJHtlcnJvci5vZmZzZXR9OiAke2dldFBhcnNlRXJyb3JNZXNzYWdlKGVycm9yLmVycm9yKX1gIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGl2ZVNvdXJjZXMgPSBwaWNrLmFjdGl2ZVNvdXJjZXMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IHBpY2suYWN0aXZlU291cmNlcy5tYXAobWFuYWdlZFNldHRpbmdzU291cmNlTGFiZWwpLmpvaW4oJywgJylcblx0XHRcdFx0OiBtYW5hZ2VkU2V0dGluZ3NTb3VyY2VMYWJlbCgnbm9uZScpO1xuXHRcdFx0Y29uc3QgZWZmZWN0aXZlS2V5Q291bnQgPSBPYmplY3Qua2V5cyhlZmZlY3RpdmUpLmxlbmd0aDtcblx0XHRcdHN1bW1hcnkubWFuYWdlZFNldHRpbmdzU291cmNlcyA9IGFjdGl2ZVNvdXJjZXM7XG5cdFx0XHRzdW1tYXJ5LmVmZmVjdGl2ZU1hbmFnZWRTZXR0aW5ncyA9IGAke2VmZmVjdGl2ZUtleUNvdW50fSAke2VmZmVjdGl2ZUtleUNvdW50ID09PSAxID8gJ2tleScgOiAna2V5cyd9YDtcblx0XHRcdHN1bW1hcnkubWFuYWdlZFNldHRpbmdzSXNzdWVzID0gYCR7cGFyc2VFcnJvcnMubGVuZ3RofSAke3BhcnNlRXJyb3JzLmxlbmd0aCA9PT0gMSA/ICdpc3N1ZScgOiAnaXNzdWVzJ31gO1xuXG5cdFx0XHRjb250ZW50ICs9IG1hcmtkb3duVGFibGUoXG5cdFx0XHRcdFsnUHJvcGVydHknLCAnVmFsdWUnXSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFsnQWN0aXZlIHNvdXJjZXMgKHByZWNlZGVuY2Ugb3JkZXIpJywgYWN0aXZlU291cmNlc10sXG5cdFx0XHRcdFx0WydTdXBwbGllZCBrZXlzJywgU3RyaW5nKHBpY2sucmVzb2x1dGlvbnMuc2l6ZSldLFxuXHRcdFx0XHRcdFsnRWZmZWN0aXZlIFZTIENvZGUgcG9saWN5IGtleXMnLCBTdHJpbmcoZWZmZWN0aXZlS2V5Q291bnQpXVxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdFx0Y29udGVudCArPSAnKlByZWNlZGVuY2UgaXMgcmVzb2x2ZWQgcGVyIGtleTogbmF0aXZlIE1ETSB3aW5zIG92ZXIgdGhlIHNlcnZlciBlbmRwb2ludCwgd2hpY2ggd2lucyBvdmVyIHRoZSBmaWxlIG9uIGRpc2suIEEga2V5IGxlZnQgdW5zZXQgYnkgYSBoaWdoZXIgY2hhbm5lbCBpcyBzdGlsbCBmaWxsZWQgaW4gYnkgYSBsb3dlciBvbmUuKlxcblxcbic7XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyBFZmZlY3RpdmUgUmVzb2x1dGlvblxcblxcbic7XG5cdFx0XHRpZiAocGljay5yZXNvbHV0aW9ucy5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCByZXNvbHV0aW9ucyA9IFsuLi5waWNrLnJlc29sdXRpb25zLmVudHJpZXMoKV0uc29ydCgoW2ZpcnN0XSwgW3NlY29uZF0pID0+IGZpcnN0LmxvY2FsZUNvbXBhcmUoc2Vjb25kKSk7XG5cdFx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25UYWJsZShcblx0XHRcdFx0XHRbJ0tleScsICdFZmZlY3RpdmUgVmFsdWUnLCAnV2lubmluZyBTb3VyY2UnXSxcblx0XHRcdFx0XHRyZXNvbHV0aW9ucy5tYXAoKFtrZXksIHJlc29sdXRpb25dKSA9PiBbXG5cdFx0XHRcdFx0XHRrZXksXG5cdFx0XHRcdFx0XHRmb3JtYXREaWFnbm9zdGljVmFsdWUocmVzb2x1dGlvbi52YWx1ZSksXG5cdFx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3NTb3VyY2VTaG9ydExhYmVsKHJlc29sdXRpb24uc291cmNlKVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Y29uc3QgY29udHJpYnV0aW9uUm93cyA9IHJlc29sdXRpb25zLmZsYXRNYXAoKFtrZXksIHJlc29sdXRpb25dKSA9PiByZXNvbHV0aW9uLmNvbnRyaWJ1dGlvbnMubWFwKGNvbnRyaWJ1dGlvbiA9PiBbXG5cdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdG1hbmFnZWRTZXR0aW5nc1NvdXJjZVNob3J0TGFiZWwoY29udHJpYnV0aW9uLmNoYW5uZWwpLFxuXHRcdFx0XHRcdGZvcm1hdERpYWdub3N0aWNWYWx1ZShjb250cmlidXRpb24udmFsdWUpLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5jaGFubmVsID09PSByZXNvbHV0aW9uLnNvdXJjZSA/ICdFZmZlY3RpdmUnIDogJ092ZXJyaWRkZW4nXG5cdFx0XHRcdF0pKTtcblx0XHRcdFx0Y29udGVudCArPSBtYXJrZG93bkRldGFpbHMoXG5cdFx0XHRcdFx0J1Blci1jaGFubmVsIGNvbnRyaWJ1dGlvbnMnLFxuXHRcdFx0XHRcdG1hcmtkb3duVGFibGUoWydLZXknLCAnU291cmNlJywgJ1ZhbHVlJywgJ1N0YXR1cyddLCBjb250cmlidXRpb25Sb3dzKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudCArPSAnKk5vIG1hbmFnZWQtc2V0dGluZ3Mga2V5cyBhcmUgc3VwcGxpZWQgYnkgYW55IGNoYW5uZWwuKlxcblxcbic7XG5cdFx0XHR9XG5cdFx0XHRjb250ZW50ICs9IG1hcmtkb3duRGV0YWlscygnTWVyZ2VkIG5vcm1hbGl6ZWQgYmFnJywgbWFya2Rvd25Kc29uQmxvY2socGljay52YWx1ZXMpKTtcblx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25EZXRhaWxzKCdFZmZlY3RpdmUgVlMgQ29kZSBwb2xpY3kgYmFnJywgbWFya2Rvd25Kc29uQmxvY2soZWZmZWN0aXZlKSk7XG5cblx0XHRcdGNvbnRlbnQgKz0gYCMjIyBOb3JtYWxpemF0aW9uIGFuZCBQYXJzZSBJc3N1ZXMgKCR7cGFyc2VFcnJvcnMubGVuZ3RofSlcXG5cXG5gO1xuXHRcdFx0aWYgKHBhcnNlRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29udGVudCArPSBtYXJrZG93blRhYmxlKFxuXHRcdFx0XHRcdFsnU3RhZ2UnLCAnTWVzc2FnZSddLFxuXHRcdFx0XHRcdHBhcnNlRXJyb3JzLm1hcCgoeyBzdGFnZSwgbWVzc2FnZSB9KSA9PiBbc3RhZ2UsIG1lc3NhZ2VdKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudCArPSAnKk5vbmUuKlxcblxcbic7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyBEZWxpdmVyeSBDaGFubmVsIERldGFpbHNcXG5cXG4nO1xuXHRcdFx0Y29udGVudCArPSAnIyMjIyBOYXRpdmUgTURNXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25UYWJsZShcblx0XHRcdFx0WydQcm9wZXJ0eScsICdWYWx1ZSddLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WydBdmFpbGFibGUnLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID8gJ3llcycgOiAnbm8nXSxcblx0XHRcdFx0XHRbJ0NvbnRyaWJ1dGVzIHdpbm5pbmcga2V5cycsIGNoYW5uZWxDb250cmlidXRlcygnbmF0aXZlTWRtJykgPyAneWVzJyA6ICdubyddXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0XHRpZiAobmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSkge1xuXHRcdFx0XHRjb250ZW50ICs9ICcqVGhlIG5hdGl2ZSBwb2xpY3kgd2F0Y2hlciBleHBvc2VzIG9ubHkgZGVjbGFyZWQgc2NhbGFyIGtleXMsIHNvIGl0cyBzb3VyY2UgdmFsdWVzIGFyZSBhbHJlYWR5IGRlZmluaXRpb24tc2NvcGVkIGFuZCBjYW5vbmljYWwuKlxcblxcbic7XG5cdFx0XHRcdGNvbnRlbnQgKz0gbWFuYWdlZFNldHRpbmdzUGlwZWxpbmUoJ1NvdXJjZSB2YWx1ZXMgKGRlZmluaXRpb24tc2NvcGVkKScsIG5hdGl2ZU1hbmFnZWRTZXR0aW5ncywgbmF0aXZlTWFuYWdlZFNldHRpbmdzLCBuYXRpdmVQcm9qZWN0ZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmZXRjaFN0YXR1cyA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5tYW5hZ2VkU2V0dGluZ3NGZXRjaFN0YXR1cztcblx0XHRcdGNvbnN0IGZldGNoZWRBdCA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5tYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQ7XG5cdFx0XHRjb25zdCBjbGllbnRJZGVudGl0eSA9IGFwcGVuZE1hbmFnZWRTZXR0aW5nc0NsaWVudElkZW50aXR5KCdodHRwczovL2FwaS5naXRodWIuY29tL2NvcGlsb3RfaW50ZXJuYWwvbWFuYWdlZF9zZXR0aW5ncycsIHByb2R1Y3RTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbXBhdGliaWxpdHlFcnJvciA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5tYW5hZ2VkU2V0dGluZ3NDb21wYXRpYmlsaXR5RXJyb3I7XG5cdFx0XHRjb250ZW50ICs9ICcjIyMjIEdpdEh1YiBTZXJ2ZXIgQVBJXFxuXFxuJztcblx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25UYWJsZShcblx0XHRcdFx0WydQcm9wZXJ0eScsICdWYWx1ZSddLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WydFbmRwb2ludCcsICcvY29waWxvdF9pbnRlcm5hbC9tYW5hZ2VkX3NldHRpbmdzJ10sXG5cdFx0XHRcdFx0WydMYXN0IGZldGNoJywgZmV0Y2hTdGF0dXMgPT09IG51bGwgPyAnbmV2ZXInIDogYCR7ZmV0Y2hTdGF0dXN9JHtmZXRjaGVkQXQgPyBgIGF0ICR7bmV3IERhdGUoZmV0Y2hlZEF0KS50b0xvY2FsZVN0cmluZygpfWAgOiAnJ31gXSxcblx0XHRcdFx0XHRbJ0NsaWVudCBpZGVudGl0eScsIG5ldyBVUkwoY2xpZW50SWRlbnRpdHkpLnNlYXJjaC5yZXBsYWNlKC9eXFw/LywgJycpXSxcblx0XHRcdFx0XHRbJ0NvbXBhdGliaWxpdHknLCBjb21wYXRpYmlsaXR5RXJyb3IgPyBgdXBkYXRlIHJlcXVpcmVkICgke2NvbXBhdGliaWxpdHlFcnJvci5jbGllbnRWZXJzaW9uID8/ICc/J30gXHUyMTkyICR7Y29tcGF0aWJpbGl0eUVycm9yLm1pbmltdW1DbGllbnRWZXJzaW9uID8/ICc/J30pYCA6ICdjb21wYXRpYmxlIG9yIG5vdCBldmFsdWF0ZWQnXSxcblx0XHRcdFx0XHRbJ0NvbnRyaWJ1dGVzIHdpbm5pbmcga2V5cycsIGNoYW5uZWxDb250cmlidXRlcygnc2VydmVyJykgPyAneWVzJyA6ICdubyddXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0XHRjb250ZW50ICs9IG1hbmFnZWRTZXR0aW5nc1BpcGVsaW5lKFxuXHRcdFx0XHQnUmF3IHJlc3BvbnNlIChsYXN0IHN1Y2Nlc3NmdWwgZmV0Y2gpJyxcblx0XHRcdFx0aXNPYmplY3QocmF3UmVzcG9uc2UpID8gcmF3UmVzcG9uc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlcnZlck1hbmFnZWRTZXR0aW5ncyxcblx0XHRcdFx0c2VydmVyUHJvamVjdGVkLFxuXHRcdFx0XHQnTm8gc3VjY2Vzc2Z1bCBtYW5hZ2VkLXNldHRpbmdzIHJlc3BvbnNlIGhhcyBiZWVuIGNhcHR1cmVkLidcblx0XHRcdCk7XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyMgRmlsZSAobWFuYWdlZC1zZXR0aW5ncy5qc29uKVxcblxcbic7XG5cdFx0XHRjb250ZW50ICs9IG1hcmtkb3duVGFibGUoXG5cdFx0XHRcdFsnUHJvcGVydHknLCAnVmFsdWUnXSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFsnQXZhaWxhYmxlJywgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPyAneWVzJyA6ICdubyddLFxuXHRcdFx0XHRcdFsnQ29udHJpYnV0ZXMgd2lubmluZyBrZXlzJywgY2hhbm5lbENvbnRyaWJ1dGVzKCdmaWxlJykgPyAneWVzJyA6ICdubyddXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0XHRpZiAoZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpIHtcblx0XHRcdFx0Y29udGVudCArPSBtYW5hZ2VkU2V0dGluZ3NQaXBlbGluZSgnUmF3IHBhcnNlZCBmaWxlJywgZmlsZVJhd01hbmFnZWRTZXR0aW5ncywgZmlsZU1hbmFnZWRTZXR0aW5ncywgZmlsZVByb2plY3RlZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25EZXRhaWxzKFxuXHRcdFx0XHQnVlMgQ29kZSBtYW5hZ2VkLXNldHRpbmdzIHNjaGVtYScsXG5cdFx0XHRcdCcqT25seSBrZXlzIGRlY2xhcmVkIGhlcmUgY2FuIHJlYWNoIFZTIENvZGUgcG9saWN5IGNhbGxiYWNrcy4gUnVudGltZS1vd25lZCBrZXlzIG1heSBzdGlsbCBiZSBlbmZvcmNlZCBieSB0aGUgQ29waWxvdCBydW50aW1lIGV2ZW4gd2hlbiBhYnNlbnQgZnJvbSB0aGUgcHJvamVjdGlvbnMgYWJvdmUuKlxcblxcbicgK1xuXHRcdFx0XHRtYXJrZG93bkpzb25CbG9jayhkZWNsYXJlZERlZmluaXRpb25zKVxuXHRcdFx0KTtcblxuXHRcdFx0Y29udGVudCArPSAnIyMjIEFnZW50IFJ1bnRpbWUgUmVzb2x1dGlvblxcblxcbic7XG5cdFx0XHRjb250ZW50ICs9ICcqUmVzb2x2ZWQgaW5kZXBlbmRlbnRseSBieSBlYWNoIHByb3ZpZGVyIHRocm91Z2ggaXRzIG93biBTREsvcnVudGltZS4gVGhpcyBtYXkgaW5jbHVkZSBydW50aW1lLW93bmVkIGtleXMgdGhhdCBWUyBDb2RlIGRvZXMgbm90IGRlY2xhcmUgYXMgY29uZmlndXJhdGlvbiBwb2xpY2llcy4qXFxuXFxuJztcblx0XHRcdGlmICghYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0XHRzdW1tYXJ5LmFnZW50UnVudGltZSA9ICdBZ2VudCBIb3N0IGRpc2FibGVkJztcblx0XHRcdFx0Y29udGVudCArPSAnKkFnZW50IEhvc3QgaXMgZGlzYWJsZWQ7IHJ1bnRpbWUgbWFuYWdlZC1zZXR0aW5ncyBkaWFnbm9zdGljcyB3ZXJlIG5vdCBxdWVyaWVkLipcXG5cXG4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBydW50aW1lRGlhZ25vc3RpY3MgPSBhd2FpdCByYWNlVGltZW91dChhZ2VudEhvc3RTZXJ2aWNlLmdldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKCksIEFHRU5UX1JVTlRJTUVfRElBR05PU1RJQ1NfVElNRU9VVCk7XG5cdFx0XHRcdFx0aWYgKCFydW50aW1lRGlhZ25vc3RpY3MpIHtcblx0XHRcdFx0XHRcdHN1bW1hcnkuYWdlbnRSdW50aW1lID0gJ1RpbWVkIG91dCc7XG5cdFx0XHRcdFx0XHRjb250ZW50ICs9ICcqVGhlIEFnZW50IEhvc3QgZGlkIG5vdCByZXR1cm4gcHJvdmlkZXIgZGlhZ25vc3RpY3Mgd2l0aGluIDYgc2Vjb25kcy4gVGhlIHJlcG9ydCBjb250aW51ZWQgd2l0aG91dCBhIHJ1bnRpbWUgc25hcHNob3Q7IGNoZWNrIHRoZSBBZ2VudCBIb3N0IGxvZyBmb3IgYSBzdGFsbGVkIHByb3ZpZGVyLipcXG5cXG4nO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocnVudGltZURpYWdub3N0aWNzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0c3VtbWFyeS5hZ2VudFJ1bnRpbWUgPSAnTm8gcHJvdmlkZXIgZGlhZ25vc3RpY3MnO1xuXHRcdFx0XHRcdFx0Y29udGVudCArPSAnKk5vIGFnZW50IHByb3ZpZGVyIGV4cG9zZXMgbWFuYWdlZC1zZXR0aW5ncyBkaWFnbm9zdGljcy4qXFxuXFxuJztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmFpbGVkUHJvdmlkZXJDb3VudCA9IHJ1bnRpbWVEaWFnbm9zdGljcy5maWx0ZXIoZGlhZ25vc3RpYyA9PiBkaWFnbm9zdGljLmVycm9yKS5sZW5ndGg7XG5cdFx0XHRcdFx0XHRzdW1tYXJ5LmFnZW50UnVudGltZSA9IGAke3J1bnRpbWVEaWFnbm9zdGljcy5sZW5ndGh9ICR7cnVudGltZURpYWdub3N0aWNzLmxlbmd0aCA9PT0gMSA/ICdwcm92aWRlcicgOiAncHJvdmlkZXJzJ30sICR7ZmFpbGVkUHJvdmlkZXJDb3VudH0gZmFpbGVkYDtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZGlhZ25vc3RpYyBvZiBydW50aW1lRGlhZ25vc3RpY3MpIHtcblx0XHRcdFx0XHRcdFx0Y29udGVudCArPSBgIyMjIyAke21hcmtkb3duVGV4dChkaWFnbm9zdGljLnByb3ZpZGVyKX1cXG5cXG5gO1xuXHRcdFx0XHRcdFx0XHRpZiAoZGlhZ25vc3RpYy5lcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQgKz0gYCpQcm9iZSBmYWlsZWQ6ICR7bWFya2Rvd25UZXh0KGRpYWdub3N0aWMuZXJyb3IpfSpcXG5cXG5gO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnQgKz0gbWFya2Rvd25EZXRhaWxzKCdSZXNvbHZlZCBzZXR0aW5ncyBzbmFwc2hvdCcsIG1hcmtkb3duSnNvbkJsb2NrKGRpYWdub3N0aWMuc25hcHNob3QpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZ2V0RXJyb3JNZXNzYWdlKGVycm9yKTtcblx0XHRcdFx0XHRzdW1tYXJ5LmFnZW50UnVudGltZSA9IGBVbmF2YWlsYWJsZSAoJHttZXNzYWdlfSlgO1xuXHRcdFx0XHRcdGNvbnRlbnQgKz0gYCpBZ2VudCBydW50aW1lIGRpYWdub3N0aWNzIHVuYXZhaWxhYmxlOiAke21hcmtkb3duVGV4dChtZXNzYWdlKX0qXFxuXFxuYDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb250ZW50ICs9IGAqRXJyb3IgcmVuZGVyaW5nIG1hbmFnZWQgc2V0dGluZ3MgZGlhZ25vc3RpY3M6ICR7bWFya2Rvd25UZXh0KGdldEVycm9yTWVzc2FnZShlcnJvcikpfSpcXG5cXG5gO1xuXHRcdH1cblxuXHRcdGNvbnRlbnQgKz0gJyMjIFBvbGljeS1Db250cm9sbGVkIFNldHRpbmdzXFxuXFxuJztcblxuXHRcdGNvbnN0IHBvbGljeUNvbmZpZ3VyYXRpb25zID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeUNvbmZpZ3VyYXRpb25zKCk7XG5cdFx0Y29uc3QgcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRFeGNsdWRlZENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cblx0XHRpZiAocG9saWN5Q29uZmlndXJhdGlvbnMuc2l6ZSA+IDAgfHwgcG9saWN5UmVmZXJlbmNlQ29uZmlndXJhdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRjb25zdCBhcHBsaWVkUG9saWN5OiBBcnJheTx7IG5hbWU6IHN0cmluZzsga2V5OiBzdHJpbmc7IHByb3BlcnR5OiBhbnk7IGluc3BlY3Rpb246IGFueSB9PiA9IFtdO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdGNvbnN0IG5vdEFwcGxpZWRQb2xpY3k6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBrZXk6IHN0cmluZzsgcHJvcGVydHk6IGFueTsgaW5zcGVjdGlvbjogYW55IH0+ID0gW107XG5cblx0XHRcdGNvbnN0IGNvbGxlY3RQb2xpY3lTZXR0aW5nID0gKHBvbGljeU5hbWU6IHN0cmluZywgc2V0dGluZ0tleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5ID0gY29uZmlndXJhdGlvblByb3BlcnRpZXNbc2V0dGluZ0tleV0gPz8gZXhjbHVkZWRQcm9wZXJ0aWVzW3NldHRpbmdLZXldO1xuXHRcdFx0XHRpZiAocHJvcGVydHkpIHtcblx0XHRcdFx0XHRjb25zdCBpbnNwZWN0VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHNldHRpbmdLZXkpO1xuXHRcdFx0XHRcdGNvbnN0IHNldHRpbmdJbmZvID0ge1xuXHRcdFx0XHRcdFx0bmFtZTogcG9saWN5TmFtZSxcblx0XHRcdFx0XHRcdGtleTogc2V0dGluZ0tleSxcblx0XHRcdFx0XHRcdHByb3BlcnR5LFxuXHRcdFx0XHRcdFx0aW5zcGVjdGlvbjogaW5zcGVjdFZhbHVlXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmIChpbnNwZWN0VmFsdWUucG9saWN5VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0YXBwbGllZFBvbGljeS5wdXNoKHNldHRpbmdJbmZvKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bm90QXBwbGllZFBvbGljeS5wdXNoKHNldHRpbmdJbmZvKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGZvciAoY29uc3QgW3BvbGljeU5hbWUsIHNldHRpbmdLZXldIG9mIHBvbGljeUNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGNvbGxlY3RQb2xpY3lTZXR0aW5nKHBvbGljeU5hbWUsIHNldHRpbmdLZXkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBbcG9saWN5TmFtZSwgc2V0dGluZ0tleXNdIG9mIHBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZ0tleSBvZiBzZXR0aW5nS2V5cykge1xuXHRcdFx0XHRcdGNvbGxlY3RQb2xpY3lTZXR0aW5nKHBvbGljeU5hbWUsIHNldHRpbmdLZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdldFBvbGljeVNvdXJjZSA9IChwb2xpY3lOYW1lOiBzdHJpbmcpOiBzdHJpbmcgPT4gcG9saWN5VmFsdWVTb3VyY2VMYWJlbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKHBvbGljeU5hbWUpKTtcblxuXHRcdFx0Y29udGVudCArPSAnIyMjIEFwcGxpZWQgUG9saWN5XFxuXFxuJztcblx0XHRcdGFwcGxpZWRQb2xpY3kuc29ydCgoYSwgYikgPT4gZ2V0UG9saWN5U291cmNlKGEubmFtZSkubG9jYWxlQ29tcGFyZShnZXRQb2xpY3lTb3VyY2UoYi5uYW1lKSkgfHwgYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSk7XG5cdFx0XHRub3RBcHBsaWVkUG9saWN5LnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkgfHwgYS5rZXkubG9jYWxlQ29tcGFyZShiLmtleSkpO1xuXHRcdFx0c3VtbWFyeS5wb2xpY3lDb250cm9sbGVkU2V0dGluZ3MgPSBgJHthcHBsaWVkUG9saWN5Lmxlbmd0aH0gYXBwbGllZCwgJHtub3RBcHBsaWVkUG9saWN5Lmxlbmd0aH0gbm90IGFwcGxpZWRgO1xuXHRcdFx0aWYgKGFwcGxpZWRQb2xpY3kubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb250ZW50ICs9IG1hcmtkb3duVGFibGUoXG5cdFx0XHRcdFx0WydTZXR0aW5nIEtleScsICdQb2xpY3kgTmFtZScsICdQb2xpY3kgU291cmNlJ10sXG5cdFx0XHRcdFx0YXBwbGllZFBvbGljeS5tYXAoc2V0dGluZyA9PiBbXG5cdFx0XHRcdFx0XHRzZXR0aW5nLmtleSxcblx0XHRcdFx0XHRcdHNldHRpbmcubmFtZSxcblx0XHRcdFx0XHRcdGdldFBvbGljeVNvdXJjZShzZXR0aW5nLm5hbWUpXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRsZXQgcG9saWN5RGV0YWlscyA9ICcnO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2YgYXBwbGllZFBvbGljeSkge1xuXHRcdFx0XHRcdGNvbnN0IG1hbmFnZWRTZXR0aW5nc0tleXMgPSBzZXR0aW5nLnByb3BlcnR5LnBvbGljeT8ubWFuYWdlZFNldHRpbmdzID8gT2JqZWN0LmtleXMoc2V0dGluZy5wcm9wZXJ0eS5wb2xpY3kubWFuYWdlZFNldHRpbmdzKS5qb2luKCcsICcpIDogJyc7XG5cdFx0XHRcdFx0cG9saWN5RGV0YWlscyArPSBgKioke21hcmtkb3duVGV4dChzZXR0aW5nLmtleSl9KipcXG5cXG5gO1xuXHRcdFx0XHRcdHBvbGljeURldGFpbHMgKz0gbWFya2Rvd25UYWJsZShcblx0XHRcdFx0XHRcdFsnUHJvcGVydHknLCAnVmFsdWUnXSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0WydQb2xpY3kgbmFtZScsIHNldHRpbmcubmFtZV0sXG5cdFx0XHRcdFx0XHRcdFsnUG9saWN5IHNvdXJjZScsIGdldFBvbGljeVNvdXJjZShzZXR0aW5nLm5hbWUpXSxcblx0XHRcdFx0XHRcdFx0WydNYW5hZ2VkIHNldHRpbmdzJywgbWFuYWdlZFNldHRpbmdzS2V5cyB8fCAnbi9hJ10sXG5cdFx0XHRcdFx0XHRcdFsnRGVmYXVsdCB2YWx1ZScsIGZvcm1hdERpYWdub3N0aWNWYWx1ZShzZXR0aW5nLnByb3BlcnR5LmRlZmF1bHQpXSxcblx0XHRcdFx0XHRcdFx0WydDdXJyZW50IHZhbHVlJywgZm9ybWF0RGlhZ25vc3RpY1ZhbHVlKHNldHRpbmcuaW5zcGVjdGlvbi52YWx1ZSldLFxuXHRcdFx0XHRcdFx0XHRbJ1BvbGljeSB2YWx1ZScsIGZvcm1hdERpYWdub3N0aWNWYWx1ZShzZXR0aW5nLmluc3BlY3Rpb24ucG9saWN5VmFsdWUpXVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudCArPSBtYXJrZG93bkRldGFpbHMoJ0FwcGxpZWQgcG9saWN5IHZhbHVlcyBhbmQgY29uZmlndXJhdGlvbiBkZXRhaWxzJywgcG9saWN5RGV0YWlscyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZW50ICs9ICcqTm8gc2V0dGluZ3MgYXJlIGN1cnJlbnRseSBjb250cm9sbGVkIGJ5IHBvbGljaWVzKlxcblxcbic7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnRlbnQgKz0gJyMjIyBOb24tYXBwbGllZCBQb2xpY3lcXG5cXG4nO1xuXHRcdFx0aWYgKG5vdEFwcGxpZWRQb2xpY3kubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb250ZW50ICs9IG1hcmtkb3duVGFibGUoXG5cdFx0XHRcdFx0WydTZXR0aW5nIEtleScsICdQb2xpY3kgTmFtZSddLFxuXHRcdFx0XHRcdG5vdEFwcGxpZWRQb2xpY3kubWFwKHNldHRpbmcgPT4gW3NldHRpbmcua2V5LCBzZXR0aW5nLm5hbWVdKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGVudCArPSAnKkFsbCBwb2xpY3ktY29udHJvbGxhYmxlIHNldHRpbmdzIGFyZSBjdXJyZW50bHkgYmVpbmcgZW5mb3JjZWQqXFxuXFxuJztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0c3VtbWFyeS5wb2xpY3lDb250cm9sbGVkU2V0dGluZ3MgPSAnTm8gcG9saWN5LWNvbnRyb2xsZWQgc2V0dGluZ3MgZm91bmQnO1xuXHRcdFx0Y29udGVudCArPSAnKk5vIHBvbGljeS1jb250cm9sbGVkIHNldHRpbmdzIGZvdW5kKlxcblxcbic7XG5cdFx0fVxuXG5cdFx0Ly8gQXV0aGVudGljYXRpb24gZGlhZ25vc3RpY3Ncblx0XHRjb250ZW50ICs9ICcjIyBBdXRoZW50aWNhdGlvbiBJbmZvcm1hdGlvblxcblxcbic7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVySWRzID0gYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cblx0XHRcdGlmIChwcm92aWRlcklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnRlbnQgKz0gJyMjIyBBdXRoZW50aWNhdGlvbiBQcm92aWRlcnNcXG5cXG4nO1xuXHRcdFx0XHRjb25zdCBwcm92aWRlclJvd3M6IHN0cmluZ1tdW10gPSBbXTtcblx0XHRcdFx0bGV0IHNlc3Npb25EZXRhaWxzID0gJyc7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXJJZCBvZiBwcm92aWRlcklkcykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGFjY291bnRzID0gc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5hY2NvdW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IHVuaXF1ZUFjY291bnRzID0gQXJyYXkuZnJvbShuZXcgU2V0KGFjY291bnRzLm1hcChhY2NvdW50ID0+IGFjY291bnQubGFiZWwpKSk7XG5cdFx0XHRcdFx0XHRwcm92aWRlclJvd3MucHVzaChbcHJvdmlkZXJJZCwgU3RyaW5nKHNlc3Npb25zLmxlbmd0aCksIHVuaXF1ZUFjY291bnRzLmpvaW4oJywgJykgfHwgJ05vbmUnXSk7XG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRzZXNzaW9uRGV0YWlscyArPSBgKioke21hcmtkb3duVGV4dChwcm92aWRlcklkKX0qKlxcblxcbmA7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25Sb3dzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGFjY291bnROYW1lID0gc2Vzc2lvbi5hY2NvdW50LmxhYmVsO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNjb3BlcyA9IHNlc3Npb24uc2NvcGVzLmpvaW4oJywgJykgfHwgJ0RlZmF1bHQnO1xuXHRcdFx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMocHJvdmlkZXJJZCwgYWNjb3VudE5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTmFtZXMgPSBhbGxvd2VkRXh0ZW5zaW9uc1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQuZmlsdGVyKGV4dCA9PiBleHQuYWxsb3dlZCAhPT0gZmFsc2UpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC5tYXAoZXh0ID0+IGAke2V4dC5uYW1lfSR7ZXh0LnRydXN0ZWQgPyAnICh0cnVzdGVkKScgOiAnJ31gKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHQuam9pbignLCAnKSB8fCAnTm9uZSc7XG5cblx0XHRcdFx0XHRcdFx0XHRcdHNlc3Npb25Sb3dzLnB1c2goW2FjY291bnROYW1lLCBzY29wZXMsIGV4dGVuc2lvbk5hbWVzXSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHNlc3Npb25Sb3dzLnB1c2goW2FjY291bnROYW1lLCBzY29wZXMsIGBFcnJvcjogJHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfWBdKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2Vzc2lvbkRldGFpbHMgKz0gbWFya2Rvd25UYWJsZShbJ0FjY291bnQnLCAnU2NvcGVzJywgJ0V4dGVuc2lvbnMgd2l0aCBBY2Nlc3MnXSwgc2Vzc2lvblJvd3MpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZ2V0RXJyb3JNZXNzYWdlKGVycm9yKTtcblx0XHRcdFx0XHRcdHByb3ZpZGVyUm93cy5wdXNoKFtwcm92aWRlcklkLCAnRXJyb3InLCBtZXNzYWdlXSk7XG5cdFx0XHRcdFx0XHRzZXNzaW9uRGV0YWlscyArPSBgKioke21hcmtkb3duVGV4dChwcm92aWRlcklkKX0qKlxcblxcbipFcnJvciByZXRyaWV2aW5nIHNlc3Npb25zOiAke21hcmtkb3duVGV4dChtZXNzYWdlKX0qXFxuXFxuYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudCArPSBtYXJrZG93blRhYmxlKFsnUHJvdmlkZXIgSUQnLCAnU2Vzc2lvbnMnLCAnQWNjb3VudHMnXSwgcHJvdmlkZXJSb3dzKTtcblx0XHRcdFx0aWYgKHNlc3Npb25EZXRhaWxzKSB7XG5cdFx0XHRcdFx0Y29udGVudCArPSBtYXJrZG93bkRldGFpbHMoJ0RldGFpbGVkIHNlc3Npb24gaW5mb3JtYXRpb24nLCBzZXNzaW9uRGV0YWlscyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRlbnQgKz0gJypObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlcnMgZm91bmQqXFxuXFxuJztcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29udGVudCArPSBgKkVycm9yIHJldHJpZXZpbmcgYXV0aGVudGljYXRpb24gaW5mb3JtYXRpb246ICR7bWFya2Rvd25UZXh0KGdldEVycm9yTWVzc2FnZShlcnJvcikpfSpcXG5cXG5gO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9ydCA9ICcjIFZTIENvZGUgUG9saWN5IERpYWdub3N0aWNzXFxuXFxuJyArXG5cdFx0XHQnKldBUk5JTkc6IFRoaXMgZmlsZSBtYXkgY29udGFpbiBzZW5zaXRpdmUgaW5mb3JtYXRpb24uKlxcblxcbicgK1xuXHRcdFx0JyMjIFN1bW1hcnlcXG5cXG4nICtcblx0XHRcdG1hcmtkb3duVGFibGUoXG5cdFx0XHRcdFsnRGlhZ25vc3RpYycsICdSZXN1bHQnXSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFsnQWNjb3VudCBwb2xpY3kgZ2F0ZScsIHN1bW1hcnkuYWNjb3VudFBvbGljeUdhdGVdLFxuXHRcdFx0XHRcdFsnTWFuYWdlZC1zZXR0aW5ncyBzb3VyY2VzJywgc3VtbWFyeS5tYW5hZ2VkU2V0dGluZ3NTb3VyY2VzXSxcblx0XHRcdFx0XHRbJ0VmZmVjdGl2ZSBtYW5hZ2VkIHNldHRpbmdzJywgc3VtbWFyeS5lZmZlY3RpdmVNYW5hZ2VkU2V0dGluZ3NdLFxuXHRcdFx0XHRcdFsnTWFuYWdlZC1zZXR0aW5ncyBpc3N1ZXMnLCBzdW1tYXJ5Lm1hbmFnZWRTZXR0aW5nc0lzc3Vlc10sXG5cdFx0XHRcdFx0WydBZ2VudCBSdW50aW1lJywgc3VtbWFyeS5hZ2VudFJ1bnRpbWVdLFxuXHRcdFx0XHRcdFsnUG9saWN5LWNvbnRyb2xsZWQgc2V0dGluZ3MnLCBzdW1tYXJ5LnBvbGljeUNvbnRyb2xsZWRTZXR0aW5nc11cblx0XHRcdFx0XVxuXHRcdFx0KSArXG5cdFx0XHRjb250ZW50O1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQsXG5cdFx0XHRwYXRoOiBsb2NhbGl6ZSgncG9saWN5RGlhZ25vc3RpY3MuZWRpdG9yVGl0bGUnLCBcIlBvbGljeSBEaWFnbm9zdGljc1wiKSxcblx0XHRcdHF1ZXJ5OiBnZW5lcmF0ZVV1aWQoKVxuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRjb250ZW50czogcmVwb3J0LFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ21hcmtkb3duJyxcblx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHR9KTtcblx0XHRpZiAoIWVkaXRvclBhbmUpIHtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZShcblx0XHRcdFx0J3BvbGljeURpYWdub3N0aWNzLnByZXZpZXdNaXNzaW5nUmVzb3VyY2UnLFxuXHRcdFx0XHRcIlBvbGljeSBkaWFnbm9zdGljcyBvcGVuZWQgYXMgTWFya2Rvd24gc291cmNlIGJlY2F1c2UgdGhlIHJlbmRlcmVkIHByZXZpZXcgY291bGQgbm90IGJlIGluaXRpYWxpemVkLlwiXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ21hcmtkb3duLnJlb3BlbkFzUHJldmlldycpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoXG5cdFx0XHRcdCdwb2xpY3lEaWFnbm9zdGljcy5wcmV2aWV3RXJyb3InLFxuXHRcdFx0XHRcIlBvbGljeSBkaWFnbm9zdGljcyBvcGVuZWQgYXMgTWFya2Rvd24gc291cmNlIGJlY2F1c2UgdGhlIHJlbmRlcmVkIHByZXZpZXcgY291bGQgbm90IGJlIG9wZW5lZDogezB9XCIsXG5cdFx0XHRcdGdldEVycm9yTWVzc2FnZShlcnJvcilcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTeW5jQWNjb3VudFBvbGljeUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zeW5jQWNjb3VudFBvbGljeScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzeW5jQWNjb3VudFBvbGljeScsICdTeW5jIEFjY291bnQgUG9saWN5JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5EZXZlbG9wZXIsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbygnW0RlZmF1bHRBY2NvdW50XSBNYW51YWxseSBzeW5jaW5nIGFjY291bnQgcG9saWN5Jyk7XG5cdFx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCh7IGZvcmNlUmVmcmVzaDogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnc3luY0FjY291bnRQb2xpY3kuc3VjY2VzcycsIFwiQWNjb3VudCBwb2xpY3kgaGFzIGJlZW4gc3luY2VkLlwiKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWZhdWx0QWNjb3VudF0gRmFpbGVkIHRvIHN5bmMgYWNjb3VudCBwb2xpY3knLCBlcnJvcik7XG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yKFxuXHRcdFx0XHRsb2NhbGl6ZSgnc3luY0FjY291bnRQb2xpY3kuZXJyb3InLCBcIkZhaWxlZCB0byBzeW5jIGFjY291bnQgcG9saWN5LlwiKSxcblx0XHRcdFx0ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gQWN0aW9ucyBSZWdpc3RyYXRpb25cbnJlZ2lzdGVyQWN0aW9uMihJbnNwZWN0Q29udGV4dEtleXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZVNjcmVlbmNhc3RNb2RlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihMb2dTdG9yYWdlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihMb2dXb3JraW5nQ29waWVzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZW1vdmVMYXJnZVN0b3JhZ2VFbnRyaWVzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihQb2xpY3lEaWFnbm9zdGljc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3luY0FjY291bnRQb2xpY3lBY3Rpb24pO1xuaWYgKCFwcm9kdWN0LmNvbW1pdCkge1xuXHRyZWdpc3RlckFjdGlvbjIoU3RhcnRUcmFja0Rpc3Bvc2FibGVzKTtcblx0cmVnaXN0ZXJBY3Rpb24yKFNuYXBzaG90VHJhY2tlZERpc3Bvc2FibGVzKTtcblx0cmVnaXN0ZXJBY3Rpb24yKFN0b3BUcmFja0Rpc3Bvc2FibGVzKTtcbn1cblxuLy8gLS0tIENvbmZpZ3VyYXRpb25cblxuLy8gU2NyZWVuIENhc3QgTW9kZVxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdzY3JlZW5jYXN0TW9kZScsXG5cdG9yZGVyOiA5LFxuXHR0aXRsZTogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlQ29uZmlndXJhdGlvblRpdGxlJywgXCJTY3JlZW5jYXN0IE1vZGVcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J3NjcmVlbmNhc3RNb2RlLnZlcnRpY2FsT2Zmc2V0Jzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAyMCxcblx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRtYXhpbXVtOiA5MCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUubG9jYXRpb24udmVydGljYWxQb3NpdGlvbicsIFwiQ29udHJvbHMgdGhlIHZlcnRpY2FsIG9mZnNldCBvZiB0aGUgc2NyZWVuY2FzdCBtb2RlIG92ZXJsYXkgZnJvbSB0aGUgYm90dG9tIGFzIGEgcGVyY2VudGFnZSBvZiB0aGUgd29ya2JlbmNoIGhlaWdodC5cIilcblx0XHR9LFxuXHRcdCdzY3JlZW5jYXN0TW9kZS5mb250U2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogNTYsXG5cdFx0XHRtaW5pbXVtOiAyMCxcblx0XHRcdG1heGltdW06IDEwMCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUuZm9udFNpemUnLCBcIkNvbnRyb2xzIHRoZSBmb250IHNpemUgKGluIHBpeGVscykgb2YgdGhlIHNjcmVlbmNhc3QgbW9kZSBrZXlib2FyZC5cIilcblx0XHR9LFxuXHRcdCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE9wdGlvbnMnOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUua2V5Ym9hcmRPcHRpb25zLmRlc2NyaXB0aW9uJywgXCJPcHRpb25zIGZvciBjdXN0b21pemluZyB0aGUga2V5Ym9hcmQgb3ZlcmxheSBpbiBzY3JlZW5jYXN0IG1vZGUuXCIpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQnc2hvd0tleXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE9wdGlvbnMuc2hvd0tleXMnLCBcIlNob3cgcmF3IGtleXMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzaG93S2V5YmluZGluZ3MnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZS5rZXlib2FyZE9wdGlvbnMuc2hvd0tleWJpbmRpbmdzJywgXCJTaG93IGtleWJvYXJkIHNob3J0Y3V0cy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J3Nob3dDb21tYW5kcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3B0aW9ucy5zaG93Q29tbWFuZHMnLCBcIlNob3cgY29tbWFuZCBuYW1lcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J3Nob3dDb21tYW5kR3JvdXBzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3B0aW9ucy5zaG93Q29tbWFuZEdyb3VwcycsIFwiU2hvdyBjb21tYW5kIGdyb3VwIG5hbWVzLCB3aGVuIGNvbW1hbmRzIGFyZSBhbHNvIHNob3duLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnc2hvd1NpbmdsZUVkaXRvckN1cnNvck1vdmVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUua2V5Ym9hcmRPcHRpb25zLnNob3dTaW5nbGVFZGl0b3JDdXJzb3JNb3ZlcycsIFwiU2hvdyBzaW5nbGUgZWRpdG9yIGN1cnNvciBtb3ZlIGNvbW1hbmRzLlwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnc2hvd0tleXMnOiB0cnVlLFxuXHRcdFx0XHQnc2hvd0tleWJpbmRpbmdzJzogdHJ1ZSxcblx0XHRcdFx0J3Nob3dDb21tYW5kcyc6IHRydWUsXG5cdFx0XHRcdCdzaG93Q29tbWFuZEdyb3Vwcyc6IGZhbHNlLFxuXHRcdFx0XHQnc2hvd1NpbmdsZUVkaXRvckN1cnNvck1vdmVzJzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdH0sXG5cdFx0J3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3ZlcmxheVRpbWVvdXQnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDgwMCxcblx0XHRcdG1pbmltdW06IDUwMCxcblx0XHRcdG1heGltdW06IDUwMDAsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjcmVlbmNhc3RNb2RlLmtleWJvYXJkT3ZlcmxheVRpbWVvdXQnLCBcIkNvbnRyb2xzIGhvdyBsb25nIChpbiBtaWxsaXNlY29uZHMpIHRoZSBrZXlib2FyZCBvdmVybGF5IGlzIHNob3duIGluIHNjcmVlbmNhc3QgbW9kZS5cIilcblx0XHR9LFxuXHRcdCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRmb3JtYXQ6ICdjb2xvci1oZXgnLFxuXHRcdFx0ZGVmYXVsdDogJyNGRjAwMDAnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY3JlZW5jYXN0TW9kZS5tb3VzZUluZGljYXRvckNvbG9yJywgXCJDb250cm9scyB0aGUgY29sb3IgaW4gaGV4ICgjUkdCLCAjUkdCQSwgI1JSR0dCQiBvciAjUlJHR0JCQUEpIG9mIHRoZSBtb3VzZSBpbmRpY2F0b3IgaW4gc2NyZWVuY2FzdCBtb2RlLlwiKVxuXHRcdH0sXG5cdFx0J3NjcmVlbmNhc3RNb2RlLm1vdXNlSW5kaWNhdG9yU2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMjAsXG5cdFx0XHRtaW5pbXVtOiAyMCxcblx0XHRcdG1heGltdW06IDEwMCxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NyZWVuY2FzdE1vZGUubW91c2VJbmRpY2F0b3JTaXplJywgXCJDb250cm9scyB0aGUgc2l6ZSAoaW4gcGl4ZWxzKSBvZiB0aGUgbW91c2UgaW5kaWNhdG9yIGluIHNjcmVlbmNhc3QgbW9kZS5cIilcblx0XHR9LFxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFFUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFzQixjQUFjLFNBQVMsaUJBQWlCLHNCQUFzQix5QkFBeUM7QUFDN0gsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHdCQUF3QixRQUFRLEdBQUcsbUJBQW1CLHFCQUFxQixrQkFBa0I7QUFDdEcsU0FBUyxlQUFlLHdCQUF3QjtBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBRWxFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSx3QkFBd0I7QUFDOUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsU0FBUyxvQkFBb0I7QUFDdkQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFpQyxjQUFjLCtCQUErQjtBQUM5RSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlDQUFpQztBQUMxQyxTQUEyQixrQkFBa0I7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEM7QUFDbkQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGdCQUFnQix5QkFBeUI7QUFDbEQsU0FBUyw2QkFBNkIsZ0NBQWdDLGlDQUFpQywrQkFBK0IsNkJBQTRFLDBCQUEwQix3QkFBd0IsMkJBQTJCO0FBRS9SLFNBQVMsNENBQTRDLGlDQUFpQztBQUN0RixTQUFTLHNCQUFzQiwyQ0FBcUU7QUFDcEcsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQixtQkFBbUIsZUFBZSxvQkFBb0I7QUFFaEYsTUFBTSxpQ0FBaUMsUUFBUTtBQUFBLEVBRTlDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsd0JBQXdCLHNCQUFzQjtBQUFBLE1BQy9ELFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFFekQsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFVBQU0sYUFBYSxpQkFBaUIsUUFBVyxRQUFXLFdBQVc7QUFDckUsa0JBQWMsS0FBSyxpQ0FBaUMsVUFBVTtBQUU5RCxVQUFNLGdCQUFnQixTQUFTLGNBQWMsS0FBSztBQUNsRCxVQUFNLGlCQUFpQixrQkFBa0I7QUFDekMsbUJBQWUsS0FBSyxZQUFZLGFBQWE7QUFDN0MsZ0JBQVksSUFBSSxhQUFhLE1BQU0sY0FBYyxPQUFPLENBQUMsQ0FBQztBQUUxRCxrQkFBYyxNQUFNLFdBQVc7QUFDL0Isa0JBQWMsTUFBTSxnQkFBZ0I7QUFDcEMsa0JBQWMsTUFBTSxrQkFBa0I7QUFDdEMsa0JBQWMsTUFBTSxTQUFTO0FBRTdCLFVBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxXQUFXLGdCQUFnQixhQUFhLElBQUksQ0FBQztBQUNyRixnQkFBWSxJQUFJLFlBQVksTUFBTSxPQUFLO0FBQ3RDLFlBQU0sU0FBUyxFQUFFO0FBQ2pCLFlBQU0sV0FBVyx1QkFBdUIsTUFBTTtBQUU5QyxvQkFBYyxNQUFNLE1BQU0sR0FBRyxTQUFTLEdBQUc7QUFDekMsb0JBQWMsTUFBTSxPQUFPLEdBQUcsU0FBUyxJQUFJO0FBQzNDLG9CQUFjLE1BQU0sUUFBUSxHQUFHLFNBQVMsS0FBSztBQUM3QyxvQkFBYyxNQUFNLFNBQVMsR0FBRyxTQUFTLE1BQU07QUFBQSxJQUNoRCxDQUFDLENBQUM7QUFFRixVQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksV0FBVyxnQkFBZ0IsYUFBYSxJQUFJLENBQUM7QUFDckYsVUFBTSxLQUFLLFlBQVksS0FBSyxFQUFFLE9BQUs7QUFBRSxRQUFFLGVBQWU7QUFBRyxRQUFFLGdCQUFnQjtBQUFBLElBQUcsR0FBRyxNQUFNLFdBQVc7QUFFbEcsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLFdBQVcsZ0JBQWdCLFdBQVcsSUFBSSxDQUFDO0FBQ2pGLFVBQU0sS0FBSyxVQUFVLEtBQUssRUFBRSxPQUFLO0FBQ2hDLFFBQUUsZUFBZTtBQUNqQixRQUFFLGdCQUFnQjtBQUVsQixZQUFNLFVBQVUsa0JBQWtCLFdBQVcsRUFBRSxNQUFxQjtBQUNwRSxjQUFRLElBQUksUUFBUSxpQkFBaUIsQ0FBQztBQUV0QyxjQUFRLFdBQVc7QUFBQSxJQUNwQixHQUFHLE1BQU0sV0FBVztBQUFBLEVBQ3JCO0FBQ0Q7QUFVQSxNQUFNLG1DQUFtQyxRQUFRO0FBQUEsRUFJaEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSwwQkFBMEIsd0JBQXdCO0FBQUEsTUFDbkUsVUFBVSxXQUFXO0FBQUEsTUFDckIsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsUUFBSSwyQkFBMkIsWUFBWTtBQUMxQyxpQ0FBMkIsV0FBVyxRQUFRO0FBQzlDLGlDQUEyQixhQUFhO0FBQ3hDO0FBQUEsSUFDRDtBQUVBLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFDL0QsVUFBTSxvQkFBb0IsU0FBUyxJQUFJLGtCQUFrQjtBQUV6RCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsVUFBTSxZQUFZLGNBQWM7QUFFaEMsVUFBTSxjQUFjLE9BQU8sV0FBVyxFQUFFLG1CQUFtQixDQUFDO0FBQzVELGdCQUFZLElBQUksYUFBYSxNQUFNLFlBQVksT0FBTyxDQUFDLENBQUM7QUFFeEQsVUFBTSxpQkFBaUIsT0FBTyxXQUFXLEVBQUUsc0JBQXNCLENBQUM7QUFDbEUsZ0JBQVksSUFBSSxhQUFhLE1BQU0sZUFBZSxPQUFPLENBQUMsQ0FBQztBQUUzRCxVQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksUUFBb0IsQ0FBQztBQUM3RCxVQUFNLFlBQVksWUFBWSxJQUFJLElBQUksUUFBb0IsQ0FBQztBQUMzRCxVQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksUUFBb0IsQ0FBQztBQUU3RCxhQUFTLDJCQUEyQkEsWUFBd0IsbUJBQTBDO0FBQ3JHLFlBQU0sWUFBWSxJQUFJLGdCQUFnQjtBQUV0QyxnQkFBVSxJQUFJLFVBQVUsSUFBSSxJQUFJLFdBQVdBLFlBQVcsYUFBYSxJQUFJLENBQUMsRUFBRSxNQUFNLE9BQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3pHLGdCQUFVLElBQUksVUFBVSxJQUFJLElBQUksV0FBV0EsWUFBVyxXQUFXLElBQUksQ0FBQyxFQUFFLE1BQU0sT0FBSyxVQUFVLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDckcsZ0JBQVUsSUFBSSxVQUFVLElBQUksSUFBSSxXQUFXQSxZQUFXLGFBQWEsSUFBSSxDQUFDLEVBQUUsTUFBTSxPQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQztBQUV6Ryx3QkFBa0IsSUFBSSxTQUFTO0FBQy9CLGtCQUFZLElBQUksYUFBYSxNQUFNLGtCQUFrQixPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBRXZFLGtCQUFZLElBQUksU0FBUztBQUFBLElBQzFCO0FBRUEsZUFBVyxFQUFFLFFBQVEsYUFBQUMsYUFBWSxLQUFLLFdBQVcsR0FBRztBQUNuRCxpQ0FBMkIsY0FBYyxhQUFhLE1BQU0sR0FBR0EsWUFBVztBQUFBLElBQzNFO0FBRUEsZ0JBQVksSUFBSSxvQkFBb0IsQ0FBQyxFQUFFLFFBQVEsYUFBQUEsYUFBWSxNQUFNLDJCQUEyQixjQUFjLGFBQWEsTUFBTSxHQUFHQSxZQUFXLENBQUMsQ0FBQztBQUU3SSxnQkFBWSxJQUFJLGNBQWMsMkJBQTJCLE1BQU07QUFDOUQsb0JBQWMsZ0JBQWdCLFlBQVksV0FBVztBQUNyRCxvQkFBYyxnQkFBZ0IsWUFBWSxjQUFjO0FBQUEsSUFDekQsQ0FBQyxDQUFDO0FBRUYsVUFBTSw0QkFBNEIsTUFBTTtBQUN2QyxrQkFBWSxNQUFNLGNBQWMsTUFBTSxRQUFRLHFCQUFxQixTQUFpQixvQ0FBb0MsQ0FBQyxFQUFFLFNBQVM7QUFBQSxJQUNySTtBQUVBLFFBQUk7QUFDSixVQUFNLDJCQUEyQixNQUFNO0FBQ3RDLDJCQUFxQixNQUFNLHFCQUFxQixTQUFpQixtQ0FBbUMsS0FBSyxJQUFJLElBQUksR0FBRztBQUVwSCxrQkFBWSxNQUFNLFNBQVMsR0FBRyxrQkFBa0I7QUFDaEQsa0JBQVksTUFBTSxRQUFRLEdBQUcsa0JBQWtCO0FBQUEsSUFDaEQ7QUFFQSw4QkFBMEI7QUFDMUIsNkJBQXlCO0FBRXpCLGdCQUFZLElBQUksWUFBWSxNQUFNLE9BQUs7QUFDdEMsa0JBQVksTUFBTSxNQUFNLEdBQUcsRUFBRSxVQUFVLHFCQUFxQixDQUFDO0FBQzdELGtCQUFZLE1BQU0sT0FBTyxHQUFHLEVBQUUsVUFBVSxxQkFBcUIsQ0FBQztBQUM5RCxrQkFBWSxNQUFNLFVBQVU7QUFDNUIsa0JBQVksTUFBTSxZQUFZLFNBQVMsQ0FBQztBQUN4QyxrQkFBWSxNQUFNLGFBQWE7QUFFL0IsWUFBTSxvQkFBb0IsWUFBWSxNQUFNLENBQUFDLE9BQUs7QUFDaEQsb0JBQVksTUFBTSxNQUFNLEdBQUdBLEdBQUUsVUFBVSxxQkFBcUIsQ0FBQztBQUM3RCxvQkFBWSxNQUFNLE9BQU8sR0FBR0EsR0FBRSxVQUFVLHFCQUFxQixDQUFDO0FBQzlELG9CQUFZLE1BQU0sWUFBWSxTQUFTLEdBQUU7QUFBQSxNQUMxQyxDQUFDO0FBRUQsWUFBTSxLQUFLLFVBQVUsS0FBSyxFQUFFLE1BQU07QUFDakMsb0JBQVksTUFBTSxVQUFVO0FBQzVCLDBCQUFrQixRQUFRO0FBQUEsTUFDM0IsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBRUYsVUFBTSx5QkFBeUIsTUFBTTtBQUNwQyxxQkFBZSxNQUFNLFdBQVcsR0FBRyxNQUFNLHFCQUFxQixTQUFpQix5QkFBeUIsS0FBSyxJQUFJLElBQUksR0FBRyxDQUFDO0FBQUEsSUFDMUg7QUFFQSxVQUFNLHVCQUF1QixNQUFNO0FBQ2xDLHFCQUFlLE1BQU0sU0FBUyxHQUFHLE1BQU0scUJBQXFCLFNBQWlCLCtCQUErQixLQUFLLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxJQUMzSDtBQUVBLFFBQUk7QUFDSixVQUFNLDhCQUE4QixNQUFNO0FBQ3pDLDhCQUF3QixNQUFNLHFCQUFxQixTQUFpQix1Q0FBdUMsS0FBSyxLQUFLLEtBQUssR0FBSTtBQUFBLElBQy9IO0FBRUEsMkJBQXVCO0FBQ3ZCLHlCQUFxQjtBQUNyQixnQ0FBNEI7QUFFNUIsZ0JBQVksSUFBSSxxQkFBcUIseUJBQXlCLE9BQUs7QUFDbEUsVUFBSSxFQUFFLHFCQUFxQiwrQkFBK0IsR0FBRztBQUM1RCw2QkFBcUI7QUFBQSxNQUN0QjtBQUVBLFVBQUksRUFBRSxxQkFBcUIseUJBQXlCLEdBQUc7QUFDdEQsK0JBQXVCO0FBQUEsTUFDeEI7QUFFQSxVQUFJLEVBQUUscUJBQXFCLHVDQUF1QyxHQUFHO0FBQ3BFLG9DQUE0QjtBQUFBLE1BQzdCO0FBRUEsVUFBSSxFQUFFLHFCQUFxQixvQ0FBb0MsR0FBRztBQUNqRSxrQ0FBMEI7QUFBQSxNQUMzQjtBQUVBLFVBQUksRUFBRSxxQkFBcUIsbUNBQW1DLEdBQUc7QUFDaEUsaUNBQXlCO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sWUFBWSxZQUFZLElBQUksSUFBSSxRQUF1QixDQUFDO0FBQzlELFVBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLFFBQTBCLENBQUM7QUFDMUUsVUFBTSxzQkFBc0IsWUFBWSxJQUFJLElBQUksUUFBMEIsQ0FBQztBQUMzRSxVQUFNLG1CQUFtQixZQUFZLElBQUksSUFBSSxRQUEwQixDQUFDO0FBRXhFLGFBQVMsd0JBQXdCLFFBQWdCLG1CQUEwQztBQUMxRixZQUFNLFlBQVksSUFBSSxnQkFBZ0I7QUFFdEMsZ0JBQVUsSUFBSSxVQUFVLElBQUksSUFBSSxXQUFXLFFBQVEsV0FBVyxJQUFJLENBQUMsRUFBRSxNQUFNLE9BQUssVUFBVSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ2xHLGdCQUFVLElBQUksVUFBVSxJQUFJLElBQUksV0FBVyxRQUFRLG9CQUFvQixJQUFJLENBQUMsRUFBRSxNQUFNLE9BQUssbUJBQW1CLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDcEgsZ0JBQVUsSUFBSSxVQUFVLElBQUksSUFBSSxXQUFXLFFBQVEscUJBQXFCLElBQUksQ0FBQyxFQUFFLE1BQU0sT0FBSyxvQkFBb0IsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUN0SCxnQkFBVSxJQUFJLFVBQVUsSUFBSSxJQUFJLFdBQVcsUUFBUSxrQkFBa0IsSUFBSSxDQUFDLEVBQUUsTUFBTSxPQUFLLGlCQUFpQixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRWhILHdCQUFrQixJQUFJLFNBQVM7QUFDL0Isa0JBQVksSUFBSSxhQUFhLE1BQU0sa0JBQWtCLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFFdkUsa0JBQVksSUFBSSxTQUFTO0FBQUEsSUFDMUI7QUFFQSxlQUFXLEVBQUUsUUFBUSxhQUFBRCxhQUFZLEtBQUssV0FBVyxHQUFHO0FBQ25ELDhCQUF3QixRQUFRQSxZQUFXO0FBQUEsSUFDNUM7QUFFQSxnQkFBWSxJQUFJLG9CQUFvQixDQUFDLEVBQUUsUUFBUSxhQUFBQSxhQUFZLE1BQU0sd0JBQXdCLFFBQVFBLFlBQVcsQ0FBQyxDQUFDO0FBRTlHLFFBQUksU0FBUztBQUNiLFFBQUksWUFBaUM7QUFDckMsUUFBSSxlQUFlO0FBRW5CLFVBQU0seUJBQXlCLFlBQVksSUFBSSxJQUFJLGlCQUFpQixNQUFNO0FBQ3pFLHFCQUFlLGNBQWM7QUFDN0Isa0JBQVk7QUFDWixlQUFTO0FBQUEsSUFDVixHQUFHLHFCQUFxQixDQUFDO0FBRXpCLGdCQUFZLElBQUksbUJBQW1CLE1BQU0sT0FBSztBQUM3QyxxQkFBZTtBQUFBLElBQ2hCLENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksb0JBQW9CLE1BQU0sT0FBSztBQUM5QyxVQUFJLEVBQUUsUUFBUSxjQUFjO0FBQzNCLFlBQUksU0FBUyxJQUFJO0FBQ2hCLHlCQUFlLFlBQVk7QUFDM0IsbUJBQVM7QUFBQSxRQUNWO0FBQ0Esb0JBQVksYUFBYSxPQUFPLGdCQUFnQixFQUFFLFVBQVUsQ0FBQztBQUM3RCxrQkFBVSxjQUFjLEVBQUU7QUFBQSxNQUMzQixXQUFXLGNBQWM7QUFDeEIsdUJBQWUsWUFBWTtBQUMzQixlQUFPLGdCQUFnQixFQUFFLFlBQVksQ0FBQyxHQUFHLFdBQVcsQ0FBQztBQUFBLE1BQ3REO0FBQ0EsNkJBQXVCLFNBQVMscUJBQXFCO0FBQUEsSUFDdEQsQ0FBQyxDQUFDO0FBRUYsZ0JBQVksSUFBSSxpQkFBaUIsTUFBTSxPQUFLO0FBQzNDLGtCQUFZO0FBQ1o7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGdCQUFZLElBQUksVUFBVSxNQUFNLE9BQUs7QUFDcEMsVUFBSSxFQUFFLFFBQVEsYUFBYSw0R0FBNEcsS0FBSyxFQUFFLEdBQUcsR0FBRztBQUNuSixZQUFJLEVBQUUsU0FBUyxhQUFhO0FBQzNCLHlCQUFlO0FBQUEsUUFDaEIsV0FBVyxDQUFDLEVBQUUsS0FBSyxTQUFTLEtBQUssR0FBRztBQUNuQyxzQkFBWTtBQUNaLHlCQUFlO0FBQUEsUUFDaEIsT0FBTztBQUNOLHlCQUFlO0FBQUEsUUFDaEI7QUFDQSwrQkFBdUIsU0FBUyxxQkFBcUI7QUFDckQ7QUFBQSxNQUNEO0FBRUEsVUFBSSxFQUFFLGFBQWE7QUFDbEI7QUFBQSxNQUNEO0FBRUEsWUFBTSxVQUFVLHFCQUFxQixTQUFxQyxnQ0FBZ0M7QUFDMUcsWUFBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFDekMsWUFBTSxXQUFXLGtCQUFrQixhQUFhLE9BQU8sTUFBTSxNQUFNO0FBR25FLFVBQUksU0FBUyxTQUFTLFdBQVcsV0FBVyxTQUFTLGFBQWEsRUFBRSxRQUFRLCtCQUErQixTQUMxRyxDQUFDLGNBQWMsZUFBZSxZQUFZLFlBQVksRUFBRSxTQUFTLFNBQVMsU0FBUyxHQUNsRjtBQUNEO0FBQUEsTUFDRDtBQUVBLFVBQ0MsTUFBTSxXQUFXLE1BQU0sVUFBVSxNQUFNLFdBQVcsTUFBTSxZQUNyRCxTQUFTLE1BQ1QsTUFBTSxZQUFZLFFBQVEsYUFBYSxNQUFNLFlBQVksUUFBUSxVQUNqRSxNQUFNLFlBQVksUUFBUSxXQUFXLE1BQU0sWUFBWSxRQUFRLGFBQy9ELE1BQU0sWUFBWSxRQUFRLGFBQWEsTUFBTSxZQUFZLFFBQVEsWUFDbkU7QUFDRCx1QkFBZSxZQUFZO0FBQzNCLGlCQUFTO0FBQUEsTUFDVjtBQUVBLFlBQU0sYUFBYSxrQkFBa0IscUJBQXFCLEtBQUs7QUFDL0QsWUFBTSxpQkFBa0IsS0FBSyxXQUFXLFFBQVEsS0FBSyxTQUFTLFlBQWEsS0FBSyxrQkFBa0IsU0FBUyxTQUFTLElBQUk7QUFFeEgsVUFBSSx1QkFBdUIsZ0JBQWdCO0FBQzNDLFVBQUksV0FBc0MsV0FBVyxTQUFTO0FBRTlELFVBQUksZ0JBQWdCO0FBQ25CLGFBQUssUUFBUSxxQkFBcUIsVUFBVSxlQUFlLFVBQVU7QUFDcEUsaUNBQXVCLEdBQUcsZUFBZSxRQUFRLEtBQUssb0JBQW9CO0FBQUEsUUFDM0U7QUFFQSxZQUFJLEtBQUssV0FBVyxRQUFRLEtBQUssU0FBUyxXQUFXO0FBQ3BELGdCQUFNLGNBQWMsa0JBQWtCLGtCQUFrQixTQUFTLFNBQVMsRUFDeEUsT0FBTyxPQUFLLEVBQUUsU0FBUyxHQUFHLFNBQVMsWUFBWSxFQUFFLENBQUM7QUFFcEQsY0FBSSxZQUFZLFNBQVMsR0FBRztBQUMzQix1QkFBVyxZQUFZLFlBQVksU0FBUyxDQUFDLEVBQUUsU0FBUztBQUFBLFVBQ3pEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFFBQVEsZ0JBQWdCLFNBQVMsc0JBQXNCO0FBQzNELGVBQU8sZ0JBQWdCLEVBQUUsY0FBYyxDQUFDLEdBQUcsR0FBRyxvQkFBb0IsR0FBRyxDQUFDO0FBQUEsTUFDdkU7QUFFQSxXQUFLLFFBQVEsWUFBWSxVQUFXLFFBQVEsbUJBQW1CLFNBQVMsS0FBSyxXQUFXLFFBQVEsR0FBSTtBQUVuRyxtQkFBVyxVQUFVLFFBQVEsV0FBVyxRQUFHLEdBQ3hDLFFBQVEsYUFBYSxRQUFHLEdBQ3hCLFFBQVEsYUFBYSxRQUFHLEdBQ3hCLFFBQVEsY0FBYyxRQUFHO0FBRTVCLGVBQU8sZ0JBQWdCLEVBQUUsWUFBWSxDQUFDLEdBQUcsWUFBWSxFQUFFLENBQUM7QUFBQSxNQUN6RDtBQUVBO0FBQ0EsNkJBQXVCLFNBQVMscUJBQXFCO0FBQUEsSUFDdEQsQ0FBQyxDQUFDO0FBRUYsK0JBQTJCLGFBQWE7QUFBQSxFQUN6QztBQUFBLEVBRVEsV0FBVyxrQkFBeUo7QUFDM0ssV0FBTyxpQkFBaUIsU0FBUyxXQUFXO0FBQUEsRUFDN0M7QUFBQSxFQUVRLGtCQUFrQixXQUFxRTtBQUM5RixVQUFNLG1CQUFtQixhQUFhLFdBQVcsU0FBUztBQUUxRCxRQUFJLGtCQUFrQjtBQUNyQixhQUFPO0FBQUEsUUFDTixPQUFPLE9BQU8saUJBQWlCLFVBQVUsV0FBVyxpQkFBaUIsUUFBUSxpQkFBaUIsTUFBTTtBQUFBLFFBQ3BHLFVBQVUsaUJBQWlCLFdBQVksT0FBTyxpQkFBaUIsYUFBYSxXQUFXLGlCQUFpQixXQUFXLGlCQUFpQixTQUFTLFFBQVM7QUFBQSxNQUN2SjtBQUFBLElBQ0Q7QUFFQSxVQUFNLHVCQUF1QixpQkFBaUIsV0FBVyxTQUFTO0FBRWxFLFFBQUksc0JBQXNCLFVBQVUsYUFBYTtBQUNoRCxhQUFPLEVBQUUsT0FBTyxPQUFPLHFCQUFxQixTQUFTLGdCQUFnQixXQUFXLHFCQUFxQixTQUFTLGNBQWMscUJBQXFCLFNBQVMsWUFBWSxNQUFNO0FBQUEsSUFDN0s7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSx5QkFBeUIsUUFBUTtBQUFBLEVBRXRDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsRUFBRSxLQUFLLGNBQWMsU0FBUyxDQUFDLG9GQUFvRixFQUFFLEdBQUcsK0JBQStCO0FBQUEsTUFDeEssVUFBVSxXQUFXO0FBQUEsTUFDckIsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFFakQsbUJBQWUsSUFBSTtBQUVuQixrQkFBYyxLQUFLLFNBQVMsMkJBQTJCLHdFQUF3RSxHQUFHLFNBQVMsMkJBQTJCLGdFQUFnRSxDQUFDO0FBQUEsRUFDeE87QUFDRDtBQUVBLE1BQU0sK0JBQStCLFFBQVE7QUFBQSxFQUU1QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLEVBQUUsS0FBSyxvQkFBb0IsU0FBUyxDQUFDLCtEQUErRCxFQUFFLEdBQUcsb0JBQW9CO0FBQUEsTUFDOUksVUFBVSxXQUFXO0FBQUEsTUFDckIsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLHFCQUFxQixTQUFTLElBQUksbUJBQW1CO0FBQzNELFVBQU0sMkJBQTJCLFNBQVMsSUFBSSx5QkFBeUI7QUFDdkUsVUFBTSxhQUFhLFNBQVMsSUFBSSxXQUFXO0FBQzNDLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFVBQU0sVUFBVSxNQUFNLHlCQUF5QixXQUFXO0FBRTFELFVBQU0sTUFBTTtBQUFBLE1BQ1g7QUFBQSxNQUNBO0FBQUEsTUFDQSxHQUFJLG1CQUFtQixjQUFjLFNBQVMsSUFDN0MsbUJBQW1CLGNBQWMsSUFBSSxpQkFBZSxHQUFHLFlBQVksUUFBUSxJQUFJLFlBQU8sRUFBRSxHQUFHLFlBQVksU0FBUyxTQUFTLElBQUksQ0FBQyxhQUFhLFlBQVksVUFBVSxhQUFhLEdBQUcsSUFDakwsQ0FBQyxRQUFRO0FBQUEsTUFDVjtBQUFBLE1BQ0E7QUFBQSxNQUNBLEdBQUksUUFBUSxTQUFTLElBQ3BCLFFBQVEsSUFBSSxZQUFVLEdBQUcsT0FBTyxTQUFTLFNBQVMsSUFBSSxDQUFDLGFBQWEsT0FBTyxVQUFVLGFBQWEsR0FBRyxJQUNyRyxDQUFDLFFBQVE7QUFBQSxJQUNYO0FBRUEsZUFBVyxLQUFLLElBQUksS0FBSyxJQUFJLENBQUM7QUFFOUIsa0JBQWMsWUFBWSxhQUFhLElBQUk7QUFBQSxFQUM1QztBQUNEO0FBRUEsTUFBTSxtQ0FBTixNQUFNLHlDQUF3QyxRQUFRO0FBQUE7QUFBQSxFQUlyRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHFDQUFxQywwQ0FBMEM7QUFBQSxNQUNoRyxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsVUFBTSx5QkFBeUIsU0FBUyxJQUFJLHVCQUF1QjtBQUNuRSxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLHFCQUFxQixTQUFTLElBQUksbUJBQW1CO0FBUzNELFVBQU0sUUFBd0IsQ0FBQztBQUUvQixlQUFXLFNBQVMsQ0FBQyxhQUFhLGFBQWEsYUFBYSxTQUFTLGFBQWEsU0FBUyxHQUFHO0FBQzdGLFVBQUksVUFBVSxhQUFhLFdBQVcsdUJBQXVCLGVBQWUsV0FBVztBQUN0RjtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxVQUFVLENBQUMsY0FBYyxTQUFTLGNBQWMsSUFBSSxHQUFHO0FBQ2pFLG1CQUFXLE9BQU8sZUFBZSxLQUFLLE9BQU8sTUFBTSxHQUFHO0FBQ3JELGdCQUFNLFFBQVEsZUFBZSxJQUFJLEtBQUssS0FBSztBQUMzQyxjQUFJLFVBQVUsQ0FBQyxtQkFBbUIsV0FBc0MsTUFBTSxTQUFTLGlDQUFnQyxpQkFBaUI7QUFDdkksa0JBQU0sS0FBSztBQUFBLGNBQ1Y7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0EsTUFBTSxNQUFNO0FBQUEsY0FDWixPQUFPO0FBQUEsY0FDUCxhQUFhLFNBQVMsV0FBVyxNQUFNLE1BQU07QUFBQSxjQUM3QyxRQUFRLFNBQVMsMEJBQTBCLDJCQUEyQixVQUFVLGFBQWEsY0FBYyxTQUFTLFVBQVUsUUFBUSxJQUFJLFVBQVUsYUFBYSxVQUFVLFNBQVMsV0FBVyxTQUFTLElBQUksU0FBUyxhQUFhLFdBQVcsR0FBRyxXQUFXLGNBQWMsVUFBVSxTQUFTLFdBQVcsU0FBUyxJQUFJLFNBQVMsUUFBUSxNQUFNLENBQUM7QUFBQSxZQUM3VSxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxDQUFDLE9BQU8sVUFBVSxNQUFNLE9BQU8sTUFBTSxJQUFJO0FBRXBELFVBQU0sZ0JBQWdCLE1BQU0sSUFBSSxRQUFpQyxhQUFXO0FBQzNFLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxZQUFNLFNBQVMsWUFBWSxJQUFJLGtCQUFrQixnQkFBOEIsQ0FBQztBQUNoRixhQUFPLFFBQVE7QUFDZixhQUFPLGdCQUFnQjtBQUN2QixhQUFPLEtBQUs7QUFDWixhQUFPLGVBQWU7QUFDdEIsYUFBTyxlQUFlO0FBQ3RCLGFBQU8sY0FBYyxTQUFTLHlDQUF5QyxRQUFRO0FBQy9FLGFBQU8sY0FBYyxTQUFTLDhDQUE4Qyw2Q0FBNkM7QUFFekgsVUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixlQUFPLGNBQWMsU0FBUyx1REFBdUQsK0NBQStDO0FBQUEsTUFDckk7QUFFQSxhQUFPLEtBQUs7QUFFWixrQkFBWSxJQUFJLE9BQU8sWUFBWSxNQUFNO0FBQ3hDLGdCQUFRLE9BQU8sYUFBYTtBQUM1QixlQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsQ0FBQztBQUVGLGtCQUFZLElBQUksT0FBTyxVQUFVLE1BQU0sWUFBWSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQzlELENBQUM7QUFFRCxRQUFJLGNBQWMsV0FBVyxHQUFHO0FBQy9CO0FBQUEsSUFDRDtBQUVBLFVBQU0sRUFBRSxVQUFVLElBQUksTUFBTSxjQUFjLFFBQVE7QUFBQSxNQUNqRCxNQUFNO0FBQUEsTUFDTixTQUFTLFNBQVMsMENBQTBDLHVFQUF1RTtBQUFBLE1BQ25JLFFBQVEsU0FBUyxnREFBZ0QsbUVBQW1FLGNBQWMsSUFBSSxVQUFRLEtBQUssS0FBSyxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDcEwsZUFBZSxTQUFTLEVBQUUsS0FBSyx3Q0FBd0MsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsVUFBVTtBQUFBLElBQ3hILENBQUM7QUFFRCxRQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLG9CQUFJLElBQWtCO0FBQy9DLGVBQVcsUUFBUSxlQUFlO0FBQ2pDLHFCQUFlLE9BQU8sS0FBSyxLQUFLLEtBQUssS0FBSztBQUMxQyx1QkFBaUIsSUFBSSxLQUFLLEtBQUs7QUFBQSxJQUNoQztBQUVBLGVBQVcsU0FBUyxrQkFBa0I7QUFDckMsWUFBTSxlQUFlLFNBQVMsS0FBSztBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUNEO0FBekdNLGlDQUVVLGlCQUFpQixPQUFPO0FBRnhDLElBQU0sa0NBQU47QUEyR0EsSUFBSSxVQUF5QztBQUM3QyxJQUFJLHFCQUFxQixvQkFBSSxJQUFpQjtBQUU5QyxNQUFNLGtDQUFrQyxJQUFJLGNBQWlELHNCQUFzQixTQUFTO0FBRTVILE1BQU0sOEJBQThCLFFBQVE7QUFBQSxFQUUzQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHlCQUF5Qiw0QkFBNEI7QUFBQSxNQUN0RSxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsTUFDSixjQUFjLGVBQWUsSUFBSSxnQ0FBZ0MsVUFBVSxTQUFTLEVBQUUsT0FBTyxHQUFHLGdDQUFnQyxVQUFVLFNBQVMsRUFBRSxPQUFPLENBQUM7QUFBQSxJQUM5SixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBSSxVQUFrQztBQUNyQyxVQUFNLGtDQUFrQyxnQ0FBZ0MsT0FBTyxTQUFTLElBQUksa0JBQWtCLENBQUM7QUFDL0csb0NBQWdDLElBQUksU0FBUztBQUU3Qyx1QkFBbUIsTUFBTTtBQUV6QixjQUFVLElBQUksa0JBQWtCO0FBQ2hDLHlCQUFxQixPQUFPO0FBQUEsRUFDN0I7QUFDRDtBQUVBLE1BQU0sbUNBQW1DLFFBQVE7QUFBQSxFQUVoRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLDhCQUE4Qiw4QkFBOEI7QUFBQSxNQUM3RSxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsTUFDSixjQUFjLGdDQUFnQyxVQUFVLFNBQVM7QUFBQSxJQUNsRSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBSSxVQUFrQztBQUNyQyxVQUFNLGtDQUFrQyxnQ0FBZ0MsT0FBTyxTQUFTLElBQUksa0JBQWtCLENBQUM7QUFDL0csb0NBQWdDLElBQUksU0FBUztBQUU3Qyx5QkFBcUIsSUFBSSxJQUFJLFNBQVMsMEJBQTBCLEdBQUksR0FBRyxNQUFNLElBQUksZ0JBQWMsV0FBVyxLQUFLLENBQUM7QUFBQSxFQUNqSDtBQUNEO0FBRUEsTUFBTSw2QkFBNkIsUUFBUTtBQUFBLEVBRTFDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsd0JBQXdCLDJCQUEyQjtBQUFBLE1BQ3BFLFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxNQUNKLGNBQWMsZ0NBQWdDLFVBQVUsU0FBUztBQUFBLElBQ2xFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFVBQU0sa0NBQWtDLGdDQUFnQyxPQUFPLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQztBQUMvRyxvQ0FBZ0MsSUFBSSxTQUFTO0FBRTdDLFFBQUksU0FBUztBQUNaLFlBQU0sa0JBQWtCLG9CQUFJLElBQW9CO0FBRWhELGlCQUFXLGNBQWMsSUFBSSxJQUFJLFFBQVEsMEJBQTBCLEdBQUksR0FBRyxLQUFLLEtBQUssQ0FBQyxHQUFHO0FBQ3ZGLFlBQUksbUJBQW1CLElBQUksV0FBVyxLQUFLLEdBQUc7QUFDN0MsMEJBQWdCLElBQUksVUFBVTtBQUFBLFFBQy9CO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxRQUFRLDBCQUEwQixLQUFNLE1BQU0sS0FBSyxlQUFlLENBQUM7QUFDakYsVUFBSSxPQUFPO0FBQ1Ysc0JBQWMsV0FBVyxFQUFFLFVBQVUsUUFBVyxVQUFVLE1BQU0sUUFBUSxDQUFDO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBRUEseUJBQXFCLElBQUk7QUFDekIsY0FBVTtBQUNWLHVCQUFtQixNQUFNO0FBQUEsRUFDMUI7QUFDRDtBQUdBLFNBQVMsMkJBQTJCLFFBQXVDO0FBQzFFLFVBQVEsUUFBUTtBQUFBLElBQ2YsS0FBSztBQUFVLGFBQU87QUFBQSxJQUN0QixLQUFLO0FBQWEsYUFBTztBQUFBLElBQ3pCLEtBQUs7QUFBUSxhQUFPO0FBQUEsSUFDcEIsS0FBSztBQUFRLGFBQU87QUFBQSxFQUNyQjtBQUNEO0FBR0EsU0FBUyxnQ0FBZ0MsUUFBdUM7QUFDL0UsVUFBUSxRQUFRO0FBQUEsSUFDZixLQUFLO0FBQVUsYUFBTztBQUFBLElBQ3RCLEtBQUs7QUFBYSxhQUFPO0FBQUEsSUFDekIsS0FBSztBQUFRLGFBQU87QUFBQSxJQUNwQixLQUFLO0FBQVEsYUFBTztBQUFBLEVBQ3JCO0FBQ0Q7QUFFQSxTQUFTLHVCQUF1QixRQUErQztBQUM5RSxVQUFRLFFBQVE7QUFBQSxJQUNmLEtBQUssa0JBQWtCO0FBQVEsYUFBTztBQUFBLElBQ3RDLEtBQUssa0JBQWtCO0FBQVcsYUFBTztBQUFBLElBQ3pDLEtBQUssa0JBQWtCO0FBQXVCLGFBQU87QUFBQSxJQUNyRCxLQUFLLGtCQUFrQjtBQUFxQixhQUFPO0FBQUEsSUFDbkQsS0FBSyxrQkFBa0I7QUFBc0IsYUFBTztBQUFBLElBQ3BELEtBQUssa0JBQWtCO0FBQVMsYUFBTztBQUFBLElBQ3ZDLEtBQUssa0JBQWtCO0FBQWEsYUFBTztBQUFBLElBQzNDLEtBQUs7QUFBVyxhQUFPO0FBQUEsRUFDeEI7QUFDRDtBQUVBLFNBQVMsd0JBQXdCLFVBQWtCLEtBQTBCLFlBQWlDLFdBQWdDLHVCQUF3QztBQUNyTCxNQUFJLFVBQVUsS0FBSyxhQUFhLFFBQVEsQ0FBQztBQUFBO0FBQUE7QUFDekMsYUFBVyxRQUFRLFNBQVksSUFBSSxhQUFhLHlCQUF5QixhQUFhLENBQUM7QUFBQTtBQUFBLElBQVUsa0JBQWtCLEdBQUc7QUFDdEgsYUFBVztBQUNYLGFBQVcsa0JBQWtCLFVBQVU7QUFDdkMsYUFBVztBQUNYLGFBQVcsa0JBQWtCLFNBQVM7QUFDdEMsU0FBTyxnQkFBZ0IsOENBQThDLE9BQU87QUFDN0U7QUFFQSxTQUFTLHNCQUFzQixPQUF3QjtBQUN0RCxTQUFPLEtBQUssVUFBVSxLQUFLLEtBQUssT0FBTyxLQUFLO0FBQzdDO0FBRUEsTUFBTSxvQ0FBb0M7QUE0QjFDLE1BQU0sZ0NBQWdDLFFBQVE7QUFBQSxFQUU3QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHFCQUFxQixvQkFBb0I7QUFBQSxNQUMxRCxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0sc0JBQXNCLFNBQVMsSUFBSSxvQkFBb0I7QUFDN0QsVUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxVQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxVQUFNLHdCQUF3QixTQUFTLElBQUksc0JBQXNCO0FBQ2pFLFVBQU0sd0JBQXdCLFNBQVMsSUFBSSxzQkFBc0I7QUFDakUsVUFBTSw4QkFBOEIsU0FBUyxJQUFJLDRCQUE0QjtBQUM3RSxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLDJCQUEyQixTQUFTLElBQUkseUJBQXlCO0FBQ3ZFLFVBQU0sbUJBQW1CLFNBQVMsSUFBSSxpQkFBaUI7QUFDdkQsVUFBTSw2QkFBNkIsU0FBUyxJQUFJLDJCQUEyQjtBQUMzRSxVQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBSXJELFFBQUk7QUFDSixRQUFJO0FBQ0gscUNBQStCLFNBQVMsSUFBSSw2QkFBNkI7QUFBQSxJQUMxRSxRQUFRO0FBQUEsSUFFUjtBQUdBLFFBQUk7QUFDSixRQUFJO0FBQ0gsbUNBQTZCLFNBQVMsSUFBSSwyQkFBMkI7QUFBQSxJQUN0RSxRQUFRO0FBQUEsSUFFUjtBQUVBLFdBQU8sZ0JBQWdCLGFBQWE7QUFBQSxNQUNuQyxVQUFVLGlCQUFpQjtBQUFBLE1BQzNCLE9BQU8sU0FBUyw4QkFBOEIsa0NBQWtDO0FBQUEsTUFDaEYsTUFBTTtBQUFBLElBQ1AsR0FBRyxNQUFNLEtBQUssc0JBQXNCO0FBQUEsTUFDbkM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixVQUFxRDtBQUN4RixVQUFNO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELElBQUk7QUFDSixVQUFNRSx5QkFBd0IsU0FBUyxHQUEyQix3QkFBd0IsYUFBYTtBQUV2RyxVQUFNLFVBQXFDO0FBQUEsTUFDMUMsbUJBQW1CO0FBQUEsTUFDbkIsd0JBQXdCO0FBQUEsTUFDeEIsMEJBQTBCO0FBQUEsTUFDMUIsdUJBQXVCO0FBQUEsTUFDdkIsY0FBYztBQUFBLE1BQ2QsMEJBQTBCO0FBQUEsSUFDM0I7QUFFQSxRQUFJLFVBQVU7QUFDZCxlQUFXO0FBQ1gsZUFBVztBQUFBLE1BQ1YsQ0FBQyxZQUFZLE9BQU87QUFBQSxNQUNwQjtBQUFBLFFBQ0MsQ0FBQyxjQUFhLG9CQUFJLEtBQUssR0FBRSxZQUFZLENBQUM7QUFBQSxRQUN0QyxDQUFDLFdBQVcsR0FBRyxlQUFlLFFBQVEsSUFBSSxlQUFlLE9BQU8sRUFBRTtBQUFBLFFBQ2xFLENBQUMsVUFBVSxlQUFlLFVBQVUsS0FBSztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUdBLGVBQVc7QUFDWCxRQUFJO0FBQ0gsWUFBTSxVQUFVLE1BQU0sc0JBQXNCLGtCQUFrQjtBQUM5RCxZQUFNLGdCQUFnQixDQUFDLGFBQWEsdUJBQXVCO0FBQzNELFVBQUksU0FBUztBQUVaLFlBQUksV0FBVztBQUNmLFlBQUksZUFBZTtBQUNuQixZQUFJO0FBQ0gsZ0JBQU0sY0FBYyxzQkFBc0IsZUFBZTtBQUN6RCxxQkFBVyxjQUFjLGFBQWE7QUFDckMsa0JBQU0sV0FBVyxNQUFNLHNCQUFzQixZQUFZLFVBQVU7QUFDbkUsa0JBQU0sa0JBQWtCLFNBQVMsS0FBSyxhQUFXLFFBQVEsT0FBTyxRQUFRLFNBQVM7QUFDakYsZ0JBQUksaUJBQWlCO0FBQ3BCLHlCQUFXLGdCQUFnQixRQUFRO0FBQ25DLDZCQUFlLGdCQUFnQixRQUFRO0FBQ3ZDO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNELFNBQVMsT0FBTztBQUFBLFFBRWhCO0FBRUEsbUJBQVc7QUFDWCxtQkFBVztBQUFBLFVBQ1YsQ0FBQyxZQUFZLE9BQU87QUFBQSxVQUNwQjtBQUFBLFlBQ0MsQ0FBQyx1QkFBdUIsUUFBUTtBQUFBLFlBQ2hDLENBQUMsaUJBQWlCLFlBQVk7QUFBQSxVQUMvQjtBQUFBLFFBQ0Q7QUFFQSxjQUFNLHNCQUFrQyxDQUFDO0FBQ3pDLG1CQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLE9BQU8sR0FBRztBQUNuRCxjQUFJLFVBQVUsVUFBYSxVQUFVLE1BQU07QUFDMUMsa0JBQU0sZUFBZSxjQUFjLFNBQVMsR0FBRyxJQUM1QyxRQUNBLE9BQU8sVUFBVSxXQUFXLHNCQUFzQixLQUFLLElBQUksT0FBTyxLQUFLO0FBQzFFLGdDQUFvQixLQUFLLENBQUMsS0FBSyxZQUFZLENBQUM7QUFBQSxVQUM3QztBQUFBLFFBQ0Q7QUFDQSxjQUFNLGFBQWEsc0JBQXNCO0FBQ3pDLDRCQUFvQixLQUFLLENBQUMsY0FBYyxhQUFhLHNCQUFzQixVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDMUcsbUJBQVc7QUFBQSxVQUNWO0FBQUEsVUFDQSxjQUFjLENBQUMsWUFBWSxPQUFPLEdBQUcsbUJBQW1CO0FBQUEsUUFDekQ7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLGlCQUFXLDBDQUEwQyxhQUFhLGdCQUFnQixLQUFLLENBQUMsQ0FBQztBQUFBO0FBQUE7QUFBQSxJQUMxRjtBQUlBLGVBQVc7QUFDWCxRQUFJO0FBQ0gsWUFBTSxXQUFXLHlCQUF5QjtBQUMxQyxZQUFNLGtCQUFrQixjQUFjLGVBQWUsMENBQTBDO0FBQy9GLGNBQVEsb0JBQW9CLFNBQVMsU0FBUyxHQUFHLFNBQVMsS0FBSyxLQUFLLFNBQVMsTUFBTSxNQUFNLFNBQVM7QUFDbEcsaUJBQVc7QUFBQSxRQUNWLENBQUMsWUFBWSxPQUFPO0FBQUEsUUFDcEI7QUFBQSxVQUNDLENBQUMsU0FBUyxTQUFTLEtBQUs7QUFBQSxVQUN4QixDQUFDLFVBQVUsU0FBUyxVQUFVLEtBQUs7QUFBQSxVQUNuQyxDQUFDLDRDQUE0QyxvQkFBb0IsU0FBWSxPQUFPLGVBQWUsSUFBSSxTQUFTO0FBQUEsUUFDakg7QUFBQSxNQUNEO0FBQ0EsaUJBQVc7QUFDWCxpQkFBVztBQUNYLGlCQUFXO0FBQ1gsaUJBQVc7QUFDWCxpQkFBVztBQUNYLGlCQUFXO0FBQ1gsaUJBQVc7QUFDWCxpQkFBVztBQUFBLElBQ1osU0FBUyxPQUFPO0FBQ2YsaUJBQVcsK0NBQStDLGFBQWEsZ0JBQWdCLEtBQUssQ0FBQyxDQUFDO0FBQUE7QUFBQTtBQUFBLElBQy9GO0FBRUEsZUFBVztBQUNYLFFBQUk7QUFDSCxZQUFNLGFBQWEsc0JBQXNCO0FBQ3pDLFlBQU0sd0JBQXdCLFlBQVksbUJBQW1CLENBQUM7QUFDOUQsWUFBTSx3QkFBd0IsOEJBQThCLG1CQUFtQixDQUFDO0FBQ2hGLFlBQU0sc0JBQXNCLDRCQUE0QixtQkFBbUIsQ0FBQztBQUM1RSxZQUFNLHlCQUF5Qiw0QkFBNEI7QUFFM0QsWUFBTSxzQkFBdUUsQ0FBQztBQUM5RSxpQkFBVyxZQUFZLENBQUMsR0FBRyxPQUFPLE9BQU9BLHVCQUFzQiwyQkFBMkIsQ0FBQyxHQUFHLEdBQUcsT0FBTyxPQUFPQSx1QkFBc0IsbUNBQW1DLENBQUMsQ0FBQyxHQUFHO0FBQzVLLGNBQU0sV0FBVyxTQUFTLFFBQVE7QUFDbEMsWUFBSSxVQUFVO0FBQ2IsaUJBQU8sT0FBTyxxQkFBcUIsUUFBUTtBQUFBLFFBQzVDO0FBQUEsTUFDRDtBQUVBLFlBQU0sT0FBTyxvQkFBb0IsdUJBQXVCLHVCQUF1QixtQkFBbUI7QUFDbEcsWUFBTSxjQUFvRCxDQUFDO0FBQzNELFlBQU0saUJBQWlCLENBQUMsU0FBaUMsV0FBcUQ7QUFBQSxRQUM3RztBQUFBLFFBQ0E7QUFBQSxRQUNBLGFBQVcsWUFBWSxLQUFLLEVBQUUsT0FBTyxHQUFHLE9BQU8sYUFBYSxRQUFRLENBQUM7QUFBQSxNQUN0RTtBQUNBLFlBQU0scUJBQXFCLENBQUMsWUFBb0MsS0FBSyxjQUFjLFNBQVMsT0FBTztBQUNuRyxZQUFNLGtCQUFrQixlQUFlLGFBQWEscUJBQXFCO0FBQ3pFLFlBQU0sa0JBQWtCLGVBQWUsVUFBVSxxQkFBcUI7QUFDdEUsWUFBTSxnQkFBZ0IsZUFBZSxRQUFRLG1CQUFtQjtBQUNoRSxZQUFNLFlBQVksdUJBQXVCLEtBQUssUUFBUSxxQkFBcUIsYUFBVyxZQUFZLEtBQUssRUFBRSxPQUFPLHNCQUFzQixRQUFRLENBQUMsQ0FBQztBQUVoSixZQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFVBQUksU0FBUyxXQUFXLEdBQUc7QUFDMUIsNkJBQXFCLGFBQXlDLGFBQVcsWUFBWSxLQUFLLEVBQUUsT0FBTyxTQUFTLFFBQVEsQ0FBQyxDQUFDO0FBQUEsTUFDdkg7QUFDQSxVQUFJLHdCQUF3QjtBQUMzQixpQ0FBeUIsd0JBQXdCLGFBQVcsWUFBWSxLQUFLLEVBQUUsT0FBTyxtQkFBbUIsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUNwSDtBQUVBLGlCQUFXLE9BQU8sQ0FBQyw2QkFBNkIsaUNBQWlDLDhCQUE4QixHQUFHO0FBQ2pILGNBQU0sUUFBUSxVQUFVLEdBQUc7QUFDM0IsWUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGFBQWdDLENBQUM7QUFDdkMsYUFBSyxNQUFNLE9BQU8sVUFBVTtBQUM1QixtQkFBVyxTQUFTLFlBQVk7QUFDL0Isc0JBQVksS0FBSyxFQUFFLE9BQU8sU0FBUyxTQUFTLEdBQUcsR0FBRyxhQUFhLE1BQU0sTUFBTSxLQUFLLHFCQUFxQixNQUFNLEtBQUssQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUN0SDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGdCQUFnQixLQUFLLGNBQWMsU0FBUyxJQUMvQyxLQUFLLGNBQWMsSUFBSSwwQkFBMEIsRUFBRSxLQUFLLElBQUksSUFDNUQsMkJBQTJCLE1BQU07QUFDcEMsWUFBTSxvQkFBb0IsT0FBTyxLQUFLLFNBQVMsRUFBRTtBQUNqRCxjQUFRLHlCQUF5QjtBQUNqQyxjQUFRLDJCQUEyQixHQUFHLGlCQUFpQixJQUFJLHNCQUFzQixJQUFJLFFBQVEsTUFBTTtBQUNuRyxjQUFRLHdCQUF3QixHQUFHLFlBQVksTUFBTSxJQUFJLFlBQVksV0FBVyxJQUFJLFVBQVUsUUFBUTtBQUV0RyxpQkFBVztBQUFBLFFBQ1YsQ0FBQyxZQUFZLE9BQU87QUFBQSxRQUNwQjtBQUFBLFVBQ0MsQ0FBQyxxQ0FBcUMsYUFBYTtBQUFBLFVBQ25ELENBQUMsaUJBQWlCLE9BQU8sS0FBSyxZQUFZLElBQUksQ0FBQztBQUFBLFVBQy9DLENBQUMsaUNBQWlDLE9BQU8saUJBQWlCLENBQUM7QUFBQSxRQUM1RDtBQUFBLE1BQ0Q7QUFDQSxpQkFBVztBQUVYLGlCQUFXO0FBQ1gsVUFBSSxLQUFLLFlBQVksT0FBTyxHQUFHO0FBQzlCLGNBQU0sY0FBYyxDQUFDLEdBQUcsS0FBSyxZQUFZLFFBQVEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLE1BQU0sTUFBTSxNQUFNLGNBQWMsTUFBTSxDQUFDO0FBQzNHLG1CQUFXO0FBQUEsVUFDVixDQUFDLE9BQU8sbUJBQW1CLGdCQUFnQjtBQUFBLFVBQzNDLFlBQVksSUFBSSxDQUFDLENBQUMsS0FBSyxVQUFVLE1BQU07QUFBQSxZQUN0QztBQUFBLFlBQ0Esc0JBQXNCLFdBQVcsS0FBSztBQUFBLFlBQ3RDLGdDQUFnQyxXQUFXLE1BQU07QUFBQSxVQUNsRCxDQUFDO0FBQUEsUUFDRjtBQUVBLGNBQU0sbUJBQW1CLFlBQVksUUFBUSxDQUFDLENBQUMsS0FBSyxVQUFVLE1BQU0sV0FBVyxjQUFjLElBQUksa0JBQWdCO0FBQUEsVUFDaEg7QUFBQSxVQUNBLGdDQUFnQyxhQUFhLE9BQU87QUFBQSxVQUNwRCxzQkFBc0IsYUFBYSxLQUFLO0FBQUEsVUFDeEMsYUFBYSxZQUFZLFdBQVcsU0FBUyxjQUFjO0FBQUEsUUFDNUQsQ0FBQyxDQUFDO0FBQ0YsbUJBQVc7QUFBQSxVQUNWO0FBQUEsVUFDQSxjQUFjLENBQUMsT0FBTyxVQUFVLFNBQVMsUUFBUSxHQUFHLGdCQUFnQjtBQUFBLFFBQ3JFO0FBQUEsTUFDRCxPQUFPO0FBQ04sbUJBQVc7QUFBQSxNQUNaO0FBQ0EsaUJBQVcsZ0JBQWdCLHlCQUF5QixrQkFBa0IsS0FBSyxNQUFNLENBQUM7QUFDbEYsaUJBQVcsZ0JBQWdCLGdDQUFnQyxrQkFBa0IsU0FBUyxDQUFDO0FBRXZGLGlCQUFXLHVDQUF1QyxZQUFZLE1BQU07QUFBQTtBQUFBO0FBQ3BFLFVBQUksWUFBWSxTQUFTLEdBQUc7QUFDM0IsbUJBQVc7QUFBQSxVQUNWLENBQUMsU0FBUyxTQUFTO0FBQUEsVUFDbkIsWUFBWSxJQUFJLENBQUMsRUFBRSxPQUFPLFFBQVEsTUFBTSxDQUFDLE9BQU8sT0FBTyxDQUFDO0FBQUEsUUFDekQ7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFFQSxpQkFBVztBQUNYLGlCQUFXO0FBQ1gsaUJBQVc7QUFBQSxRQUNWLENBQUMsWUFBWSxPQUFPO0FBQUEsUUFDcEI7QUFBQSxVQUNDLENBQUMsYUFBYSwrQkFBK0IsUUFBUSxJQUFJO0FBQUEsVUFDekQsQ0FBQyw0QkFBNEIsbUJBQW1CLFdBQVcsSUFBSSxRQUFRLElBQUk7QUFBQSxRQUM1RTtBQUFBLE1BQ0Q7QUFDQSxVQUFJLDhCQUE4QjtBQUNqQyxtQkFBVztBQUNYLG1CQUFXLHdCQUF3QixxQ0FBcUMsdUJBQXVCLHVCQUF1QixlQUFlO0FBQUEsTUFDdEk7QUFFQSxZQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFlBQU0sWUFBWSxzQkFBc0I7QUFDeEMsWUFBTSxpQkFBaUIsb0NBQW9DLDREQUE0RCxjQUFjO0FBQ3JJLFlBQU0scUJBQXFCLHNCQUFzQjtBQUNqRCxpQkFBVztBQUNYLGlCQUFXO0FBQUEsUUFDVixDQUFDLFlBQVksT0FBTztBQUFBLFFBQ3BCO0FBQUEsVUFDQyxDQUFDLFlBQVksb0NBQW9DO0FBQUEsVUFDakQsQ0FBQyxjQUFjLGdCQUFnQixPQUFPLFVBQVUsR0FBRyxXQUFXLEdBQUcsWUFBWSxPQUFPLElBQUksS0FBSyxTQUFTLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxFQUFFO0FBQUEsVUFDakksQ0FBQyxtQkFBbUIsSUFBSSxJQUFJLGNBQWMsRUFBRSxPQUFPLFFBQVEsT0FBTyxFQUFFLENBQUM7QUFBQSxVQUNyRSxDQUFDLGlCQUFpQixxQkFBcUIsb0JBQW9CLG1CQUFtQixpQkFBaUIsR0FBRyxXQUFNLG1CQUFtQix3QkFBd0IsR0FBRyxNQUFNLDZCQUE2QjtBQUFBLFVBQ3pMLENBQUMsNEJBQTRCLG1CQUFtQixRQUFRLElBQUksUUFBUSxJQUFJO0FBQUEsUUFDekU7QUFBQSxNQUNEO0FBQ0EsaUJBQVc7QUFBQSxRQUNWO0FBQUEsUUFDQSxTQUFTLFdBQVcsSUFBSSxjQUFjO0FBQUEsUUFDdEM7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVztBQUNYLGlCQUFXO0FBQUEsUUFDVixDQUFDLFlBQVksT0FBTztBQUFBLFFBQ3BCO0FBQUEsVUFDQyxDQUFDLGFBQWEsNkJBQTZCLFFBQVEsSUFBSTtBQUFBLFVBQ3ZELENBQUMsNEJBQTRCLG1CQUFtQixNQUFNLElBQUksUUFBUSxJQUFJO0FBQUEsUUFDdkU7QUFBQSxNQUNEO0FBQ0EsVUFBSSw0QkFBNEI7QUFDL0IsbUJBQVcsd0JBQXdCLG1CQUFtQix3QkFBd0IscUJBQXFCLGFBQWE7QUFBQSxNQUNqSDtBQUVBLGlCQUFXO0FBQUEsUUFDVjtBQUFBLFFBQ0EsbUxBQ0Esa0JBQWtCLG1CQUFtQjtBQUFBLE1BQ3RDO0FBRUEsaUJBQVc7QUFDWCxpQkFBVztBQUNYLFVBQUksQ0FBQywyQkFBMkIsUUFBUSxJQUFJLEdBQUc7QUFDOUMsZ0JBQVEsZUFBZTtBQUN2QixtQkFBVztBQUFBLE1BQ1osT0FBTztBQUNOLFlBQUk7QUFDSCxnQkFBTSxxQkFBcUIsTUFBTSxZQUFZLGlCQUFpQiw4QkFBOEIsR0FBRyxpQ0FBaUM7QUFDaEksY0FBSSxDQUFDLG9CQUFvQjtBQUN4QixvQkFBUSxlQUFlO0FBQ3ZCLHVCQUFXO0FBQUEsVUFDWixXQUFXLG1CQUFtQixXQUFXLEdBQUc7QUFDM0Msb0JBQVEsZUFBZTtBQUN2Qix1QkFBVztBQUFBLFVBQ1osT0FBTztBQUNOLGtCQUFNLHNCQUFzQixtQkFBbUIsT0FBTyxnQkFBYyxXQUFXLEtBQUssRUFBRTtBQUN0RixvQkFBUSxlQUFlLEdBQUcsbUJBQW1CLE1BQU0sSUFBSSxtQkFBbUIsV0FBVyxJQUFJLGFBQWEsV0FBVyxLQUFLLG1CQUFtQjtBQUN6SSx1QkFBVyxjQUFjLG9CQUFvQjtBQUM1Qyx5QkFBVyxRQUFRLGFBQWEsV0FBVyxRQUFRLENBQUM7QUFBQTtBQUFBO0FBQ3BELGtCQUFJLFdBQVcsT0FBTztBQUNyQiwyQkFBVyxrQkFBa0IsYUFBYSxXQUFXLEtBQUssQ0FBQztBQUFBO0FBQUE7QUFBQSxjQUM1RCxPQUFPO0FBQ04sMkJBQVcsZ0JBQWdCLDhCQUE4QixrQkFBa0IsV0FBVyxRQUFRLENBQUM7QUFBQSxjQUNoRztBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxTQUFTLE9BQU87QUFDZixnQkFBTSxVQUFVLGdCQUFnQixLQUFLO0FBQ3JDLGtCQUFRLGVBQWUsZ0JBQWdCLE9BQU87QUFDOUMscUJBQVcsMkNBQTJDLGFBQWEsT0FBTyxDQUFDO0FBQUE7QUFBQTtBQUFBLFFBQzVFO0FBQUEsTUFDRDtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsaUJBQVcsa0RBQWtELGFBQWEsZ0JBQWdCLEtBQUssQ0FBQyxDQUFDO0FBQUE7QUFBQTtBQUFBLElBQ2xHO0FBRUEsZUFBVztBQUVYLFVBQU0sdUJBQXVCQSx1QkFBc0Isd0JBQXdCO0FBQzNFLFVBQU0sZ0NBQWdDQSx1QkFBc0IsaUNBQWlDO0FBQzdGLFVBQU0sMEJBQTBCQSx1QkFBc0IsMkJBQTJCO0FBQ2pGLFVBQU0scUJBQXFCQSx1QkFBc0IsbUNBQW1DO0FBRXBGLFFBQUkscUJBQXFCLE9BQU8sS0FBSyw4QkFBOEIsT0FBTyxHQUFHO0FBRTVFLFlBQU0sZ0JBQXNGLENBQUM7QUFFN0YsWUFBTSxtQkFBeUYsQ0FBQztBQUVoRyxZQUFNLHVCQUF1QixDQUFDLFlBQW9CLGVBQXVCO0FBQ3hFLGNBQU0sV0FBVyx3QkFBd0IsVUFBVSxLQUFLLG1CQUFtQixVQUFVO0FBQ3JGLFlBQUksVUFBVTtBQUNiLGdCQUFNLGVBQWUscUJBQXFCLFFBQVEsVUFBVTtBQUM1RCxnQkFBTSxjQUFjO0FBQUEsWUFDbkIsTUFBTTtBQUFBLFlBQ04sS0FBSztBQUFBLFlBQ0w7QUFBQSxZQUNBLFlBQVk7QUFBQSxVQUNiO0FBRUEsY0FBSSxhQUFhLGdCQUFnQixRQUFXO0FBQzNDLDBCQUFjLEtBQUssV0FBVztBQUFBLFVBQy9CLE9BQU87QUFDTiw2QkFBaUIsS0FBSyxXQUFXO0FBQUEsVUFDbEM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLGlCQUFXLENBQUMsWUFBWSxVQUFVLEtBQUssc0JBQXNCO0FBQzVELDZCQUFxQixZQUFZLFVBQVU7QUFBQSxNQUM1QztBQUNBLGlCQUFXLENBQUMsWUFBWSxXQUFXLEtBQUssK0JBQStCO0FBQ3RFLG1CQUFXLGNBQWMsYUFBYTtBQUNyQywrQkFBcUIsWUFBWSxVQUFVO0FBQUEsUUFDNUM7QUFBQSxNQUNEO0FBRUEsWUFBTSxrQkFBa0IsQ0FBQyxlQUErQix1QkFBdUIsY0FBYyxxQkFBcUIsVUFBVSxDQUFDO0FBRTdILGlCQUFXO0FBQ1gsb0JBQWMsS0FBSyxDQUFDLEdBQUcsTUFBTSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsY0FBYyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLEtBQUssY0FBYyxFQUFFLElBQUksQ0FBQztBQUMzSCx1QkFBaUIsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssY0FBYyxFQUFFLElBQUksS0FBSyxFQUFFLElBQUksY0FBYyxFQUFFLEdBQUcsQ0FBQztBQUMxRixjQUFRLDJCQUEyQixHQUFHLGNBQWMsTUFBTSxhQUFhLGlCQUFpQixNQUFNO0FBQzlGLFVBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0IsbUJBQVc7QUFBQSxVQUNWLENBQUMsZUFBZSxlQUFlLGVBQWU7QUFBQSxVQUM5QyxjQUFjLElBQUksYUFBVztBQUFBLFlBQzVCLFFBQVE7QUFBQSxZQUNSLFFBQVE7QUFBQSxZQUNSLGdCQUFnQixRQUFRLElBQUk7QUFBQSxVQUM3QixDQUFDO0FBQUEsUUFDRjtBQUVBLFlBQUksZ0JBQWdCO0FBQ3BCLG1CQUFXLFdBQVcsZUFBZTtBQUNwQyxnQkFBTSxzQkFBc0IsUUFBUSxTQUFTLFFBQVEsa0JBQWtCLE9BQU8sS0FBSyxRQUFRLFNBQVMsT0FBTyxlQUFlLEVBQUUsS0FBSyxJQUFJLElBQUk7QUFDekksMkJBQWlCLEtBQUssYUFBYSxRQUFRLEdBQUcsQ0FBQztBQUFBO0FBQUE7QUFDL0MsMkJBQWlCO0FBQUEsWUFDaEIsQ0FBQyxZQUFZLE9BQU87QUFBQSxZQUNwQjtBQUFBLGNBQ0MsQ0FBQyxlQUFlLFFBQVEsSUFBSTtBQUFBLGNBQzVCLENBQUMsaUJBQWlCLGdCQUFnQixRQUFRLElBQUksQ0FBQztBQUFBLGNBQy9DLENBQUMsb0JBQW9CLHVCQUF1QixLQUFLO0FBQUEsY0FDakQsQ0FBQyxpQkFBaUIsc0JBQXNCLFFBQVEsU0FBUyxPQUFPLENBQUM7QUFBQSxjQUNqRSxDQUFDLGlCQUFpQixzQkFBc0IsUUFBUSxXQUFXLEtBQUssQ0FBQztBQUFBLGNBQ2pFLENBQUMsZ0JBQWdCLHNCQUFzQixRQUFRLFdBQVcsV0FBVyxDQUFDO0FBQUEsWUFDdkU7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLG1CQUFXLGdCQUFnQixtREFBbUQsYUFBYTtBQUFBLE1BQzVGLE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFFQSxpQkFBVztBQUNYLFVBQUksaUJBQWlCLFNBQVMsR0FBRztBQUNoQyxtQkFBVztBQUFBLFVBQ1YsQ0FBQyxlQUFlLGFBQWE7QUFBQSxVQUM3QixpQkFBaUIsSUFBSSxhQUFXLENBQUMsUUFBUSxLQUFLLFFBQVEsSUFBSSxDQUFDO0FBQUEsUUFDNUQ7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNELE9BQU87QUFDTixjQUFRLDJCQUEyQjtBQUNuQyxpQkFBVztBQUFBLElBQ1o7QUFHQSxlQUFXO0FBQ1gsUUFBSTtBQUNILFlBQU0sY0FBYyxzQkFBc0IsZUFBZTtBQUV6RCxVQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCLG1CQUFXO0FBQ1gsY0FBTSxlQUEyQixDQUFDO0FBQ2xDLFlBQUksaUJBQWlCO0FBQ3JCLG1CQUFXLGNBQWMsYUFBYTtBQUNyQyxjQUFJO0FBQ0gsa0JBQU0sV0FBVyxNQUFNLHNCQUFzQixZQUFZLFVBQVU7QUFDbkUsa0JBQU0sV0FBVyxTQUFTLElBQUksYUFBVyxRQUFRLE9BQU87QUFDeEQsa0JBQU0saUJBQWlCLE1BQU0sS0FBSyxJQUFJLElBQUksU0FBUyxJQUFJLGFBQVcsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUNqRix5QkFBYSxLQUFLLENBQUMsWUFBWSxPQUFPLFNBQVMsTUFBTSxHQUFHLGVBQWUsS0FBSyxJQUFJLEtBQUssTUFBTSxDQUFDO0FBQzVGLGdCQUFJLFNBQVMsU0FBUyxHQUFHO0FBQ3hCLGdDQUFrQixLQUFLLGFBQWEsVUFBVSxDQUFDO0FBQUE7QUFBQTtBQUMvQyxvQkFBTSxjQUEwQixDQUFDO0FBQ2pDLHlCQUFXLFdBQVcsVUFBVTtBQUMvQixzQkFBTSxjQUFjLFFBQVEsUUFBUTtBQUNwQyxzQkFBTSxTQUFTLFFBQVEsT0FBTyxLQUFLLElBQUksS0FBSztBQUM1QyxvQkFBSTtBQUNILHdCQUFNLG9CQUFvQiw0QkFBNEIsc0JBQXNCLFlBQVksV0FBVztBQUNuRyx3QkFBTSxpQkFBaUIsa0JBQ3JCLE9BQU8sU0FBTyxJQUFJLFlBQVksS0FBSyxFQUNuQyxJQUFJLFNBQU8sR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLFVBQVUsZUFBZSxFQUFFLEVBQUUsRUFDMUQsS0FBSyxJQUFJLEtBQUs7QUFFaEIsOEJBQVksS0FBSyxDQUFDLGFBQWEsUUFBUSxjQUFjLENBQUM7QUFBQSxnQkFDdkQsU0FBUyxPQUFPO0FBQ2YsOEJBQVksS0FBSyxDQUFDLGFBQWEsUUFBUSxVQUFVLGdCQUFnQixLQUFLLENBQUMsRUFBRSxDQUFDO0FBQUEsZ0JBQzNFO0FBQUEsY0FDRDtBQUNBLGdDQUFrQixjQUFjLENBQUMsV0FBVyxVQUFVLHdCQUF3QixHQUFHLFdBQVc7QUFBQSxZQUM3RjtBQUFBLFVBQ0QsU0FBUyxPQUFPO0FBQ2Ysa0JBQU0sVUFBVSxnQkFBZ0IsS0FBSztBQUNyQyx5QkFBYSxLQUFLLENBQUMsWUFBWSxTQUFTLE9BQU8sQ0FBQztBQUNoRCw4QkFBa0IsS0FBSyxhQUFhLFVBQVUsQ0FBQztBQUFBO0FBQUEsOEJBQXFDLGFBQWEsT0FBTyxDQUFDO0FBQUE7QUFBQTtBQUFBLFVBQzFHO0FBQUEsUUFDRDtBQUNBLG1CQUFXLGNBQWMsQ0FBQyxlQUFlLFlBQVksVUFBVSxHQUFHLFlBQVk7QUFDOUUsWUFBSSxnQkFBZ0I7QUFDbkIscUJBQVcsZ0JBQWdCLGdDQUFnQyxjQUFjO0FBQUEsUUFDMUU7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLGlCQUFXLGlEQUFpRCxhQUFhLGdCQUFnQixLQUFLLENBQUMsQ0FBQztBQUFBO0FBQUE7QUFBQSxJQUNqRztBQUVBLFVBQU0sU0FBUyw4R0FHZDtBQUFBLE1BQ0MsQ0FBQyxjQUFjLFFBQVE7QUFBQSxNQUN2QjtBQUFBLFFBQ0MsQ0FBQyx1QkFBdUIsUUFBUSxpQkFBaUI7QUFBQSxRQUNqRCxDQUFDLDRCQUE0QixRQUFRLHNCQUFzQjtBQUFBLFFBQzNELENBQUMsOEJBQThCLFFBQVEsd0JBQXdCO0FBQUEsUUFDL0QsQ0FBQywyQkFBMkIsUUFBUSxxQkFBcUI7QUFBQSxRQUN6RCxDQUFDLGlCQUFpQixRQUFRLFlBQVk7QUFBQSxRQUN0QyxDQUFDLDhCQUE4QixRQUFRLHdCQUF3QjtBQUFBLE1BQ2hFO0FBQUEsSUFDRCxJQUNBO0FBRUQsVUFBTSxXQUFXLElBQUksS0FBSztBQUFBLE1BQ3pCLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLE1BQU0sU0FBUyxpQ0FBaUMsb0JBQW9CO0FBQUEsTUFDcEUsT0FBTyxhQUFhO0FBQUEsSUFDckIsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGNBQWMsV0FBVztBQUFBLE1BQ2pEO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsTUFDWixTQUFTLEVBQUUsUUFBUSxLQUFLO0FBQUEsSUFDekIsQ0FBQztBQUNELFFBQUksQ0FBQyxZQUFZO0FBQ2hCLDBCQUFvQixLQUFLO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILFlBQU0sZUFBZSxlQUFlLDBCQUEwQjtBQUFBLElBQy9ELFNBQVMsT0FBTztBQUNmLDBCQUFvQixLQUFLO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsUUFDQSxnQkFBZ0IsS0FBSztBQUFBLE1BQ3RCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxnQ0FBZ0MsUUFBUTtBQUFBLEVBRTdDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUscUJBQXFCLHFCQUFxQjtBQUFBLE1BQzNELFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLGFBQWEsU0FBUyxJQUFJLFdBQVc7QUFFM0MsUUFBSTtBQUNILGlCQUFXLEtBQUssa0RBQWtEO0FBQ2xFLFlBQU0sc0JBQXNCLFFBQVEsRUFBRSxjQUFjLEtBQUssQ0FBQztBQUMxRCxZQUFNLGNBQWMsS0FBSyxTQUFTLDZCQUE2QixpQ0FBaUMsQ0FBQztBQUFBLElBQ2xHLFNBQVMsT0FBTztBQUNmLGlCQUFXLE1BQU0sa0RBQWtELEtBQUs7QUFDeEUsWUFBTSxjQUFjO0FBQUEsUUFDbkIsU0FBUywyQkFBMkIsZ0NBQWdDO0FBQUEsUUFDcEUsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUFBLE1BQ3REO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUdBLGdCQUFnQix3QkFBd0I7QUFDeEMsZ0JBQWdCLDBCQUEwQjtBQUMxQyxnQkFBZ0IsZ0JBQWdCO0FBQ2hDLGdCQUFnQixzQkFBc0I7QUFDdEMsZ0JBQWdCLCtCQUErQjtBQUMvQyxnQkFBZ0IsdUJBQXVCO0FBQ3ZDLGdCQUFnQix1QkFBdUI7QUFDdkMsSUFBSSxDQUFDLFFBQVEsUUFBUTtBQUNwQixrQkFBZ0IscUJBQXFCO0FBQ3JDLGtCQUFnQiwwQkFBMEI7QUFDMUMsa0JBQWdCLG9CQUFvQjtBQUNyQztBQUtBLE1BQU0sd0JBQXdCLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWE7QUFDdkcsc0JBQXNCLHNCQUFzQjtBQUFBLEVBQzNDLElBQUk7QUFBQSxFQUNKLE9BQU87QUFBQSxFQUNQLE9BQU8sU0FBUyxvQ0FBb0MsaUJBQWlCO0FBQUEsRUFDckUsTUFBTTtBQUFBLEVBQ04sWUFBWTtBQUFBLElBQ1gsaUNBQWlDO0FBQUEsTUFDaEMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsYUFBYSxTQUFTLDRDQUE0QyxzSEFBc0g7QUFBQSxJQUN6TDtBQUFBLElBQ0EsMkJBQTJCO0FBQUEsTUFDMUIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsYUFBYSxTQUFTLDJCQUEyQixxRUFBcUU7QUFBQSxJQUN2SDtBQUFBLElBQ0Esa0NBQWtDO0FBQUEsTUFDakMsTUFBTTtBQUFBLE1BQ04sYUFBYSxTQUFTLDhDQUE4QyxrRUFBa0U7QUFBQSxNQUN0SSxZQUFZO0FBQUEsUUFDWCxZQUFZO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUFhLFNBQVMsMkNBQTJDLGdCQUFnQjtBQUFBLFFBQ2xGO0FBQUEsUUFDQSxtQkFBbUI7QUFBQSxVQUNsQixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsVUFDVCxhQUFhLFNBQVMsa0RBQWtELDBCQUEwQjtBQUFBLFFBQ25HO0FBQUEsUUFDQSxnQkFBZ0I7QUFBQSxVQUNmLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWEsU0FBUywrQ0FBK0MscUJBQXFCO0FBQUEsUUFDM0Y7QUFBQSxRQUNBLHFCQUFxQjtBQUFBLFVBQ3BCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWEsU0FBUyxvREFBb0QseURBQXlEO0FBQUEsUUFDcEk7QUFBQSxRQUNBLCtCQUErQjtBQUFBLFVBQzlCLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxVQUNULGFBQWEsU0FBUyw4REFBOEQsMENBQTBDO0FBQUEsUUFDL0g7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixtQkFBbUI7QUFBQSxRQUNuQixnQkFBZ0I7QUFBQSxRQUNoQixxQkFBcUI7QUFBQSxRQUNyQiwrQkFBK0I7QUFBQSxNQUNoQztBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsSUFDdkI7QUFBQSxJQUNBLHlDQUF5QztBQUFBLE1BQ3hDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULGFBQWEsU0FBUyx5Q0FBeUMsdUZBQXVGO0FBQUEsSUFDdko7QUFBQSxJQUNBLHNDQUFzQztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxNQUNULGFBQWEsU0FBUyxzQ0FBc0MsMEdBQTBHO0FBQUEsSUFDdks7QUFBQSxJQUNBLHFDQUFxQztBQUFBLE1BQ3BDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULGFBQWEsU0FBUyxxQ0FBcUMsMEVBQTBFO0FBQUEsSUFDdEk7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFsiY29udGFpbmVyIiwgImRpc3Bvc2FibGVzIiwgImUiLCAiY29uZmlndXJhdGlvblJlZ2lzdHJ5Il0KfQo=
