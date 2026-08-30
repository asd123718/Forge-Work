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
import "./media/automationDialog.css";
import * as DOM from "../../../../base/browser/dom.js";
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { defaultDialogStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { createWorkbenchDialogOptions } from "../../../../workbench/browser/parts/dialogs/dialog.js";
import { ILanguageModelsService } from "../../../../workbench/contrib/chat/common/languageModels.js";
import { IHostService } from "../../../../workbench/services/host/browser/host.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { isAutomationDialogEditCommand, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, renderForm, updateSaveButtonState } from "./automationDialog.js";
const $ = DOM.$;
const automationDialogAllowableCommands = /* @__PURE__ */ new Set([
  "workbench.action.quit",
  "workbench.action.reloadWindow",
  "copy",
  "cut",
  "paste",
  "editor.action.selectAll",
  "editor.action.clipboardCopyAction",
  "editor.action.clipboardCutAction",
  "editor.action.clipboardPasteAction",
  "hideCodeActionWidget",
  "clearFilterCodeActionWidget",
  "selectPrevCodeAction",
  "selectNextCodeAction",
  "acceptSelectedCodeAction",
  "previewSelectedCodeAction",
  "toggleSectionCodeAction",
  "collapseSectionCodeAction",
  "expandSectionCodeAction",
  "quickInput.next",
  "quickInput.previous",
  "quickInput.accept",
  "quickInput.hide"
]);
let AutomationDialogService = class {
  constructor(instantiationService, contextKeyService, contextViewService, configurationService, languageModelsService, keybindingService, layoutService, logService, productService, hostService, sessionsManagementService, workspaceTrustRequestService) {
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.contextViewService = contextViewService;
    this.configurationService = configurationService;
    this.languageModelsService = languageModelsService;
    this.keybindingService = keybindingService;
    this.layoutService = layoutService;
    this.logService = logService;
    this.productService = productService;
    this.hostService = hostService;
    this.sessionsManagementService = sessionsManagementService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
  }
  async showAutomationDialog(options) {
    const disposables = new DisposableStore();
    const initial = options.existing;
    const isEdit = !!initial;
    const initialTarget = initial?.target;
    const initialWorkspaceTarget = initialTarget?.kind === "workspace" ? initialTarget : void 0;
    const state = {
      name: initial?.name ?? "",
      interval: initial?.schedule.interval ?? "daily",
      hour: initial?.schedule.scheduleHour ?? 9,
      minute: initial?.schedule.scheduleMinute ?? 0,
      day: initial?.schedule.scheduleDay ?? 1,
      isQuickChat: initialTarget?.kind === "quickChat",
      folderUri: initialWorkspaceTarget?.folderUri,
      providerId: initialTarget?.providerId,
      sessionTypeId: initialTarget?.sessionTypeId,
      isolationMode: initialWorkspaceTarget?.isolation.kind === "default" ? void 0 : initialWorkspaceTarget?.isolation.kind === "worktree" ? "worktree" : "workspace",
      branch: initialWorkspaceTarget?.isolation.kind === "worktree" ? initialWorkspaceTarget.isolation.branch : void 0,
      enabled: initial?.enabled ?? true
    };
    const validation = { nameError: void 0, promptError: void 0, folderError: void 0, sessionTypeError: void 0, branchError: void 0 };
    let saveButton;
    let cancelButton;
    let revalidate = () => {
    };
    let getPrompt = () => initial?.prompt ?? "";
    let getMode = () => initial?.mode;
    let getPermissionLevel = () => initial?.permissionLevel;
    let getModelId = () => initial?.modelId;
    let getBranch = () => initialWorkspaceTarget?.isolation.kind === "worktree" ? initialWorkspaceTarget.isolation.branch : void 0;
    let waitForAutomationSessionSync = async () => {
    };
    let getFocusableElements = () => [];
    let focusFirst = () => {
    };
    const title = isEdit ? localize("automation.dialog.editTitle", "Edit automation") : localize("automation.dialog.createTitle", "New automation");
    const buttonLabels = [
      isEdit ? localize("automation.dialog.save", "Save") : localize("automation.dialog.create", "Create"),
      localize("automation.dialog.cancel", "Cancel")
    ];
    const activeContainer = this.layoutService.activeContainer;
    const dialog = disposables.add(new Dialog(
      activeContainer,
      title,
      buttonLabels,
      createWorkbenchDialogOptions(
        {
          type: "none",
          extraClasses: ["automation-dialog"],
          cancelId: 1,
          isExternalFocusAllowed: isAutomationDialogPopupTarget,
          // textLinkForeground stamps inline styles onto chat input picker chips.
          dialogStyles: { ...defaultDialogStyles, textLinkForeground: void 0 },
          buttonOptions: [
            {
              styleButton: (button) => {
                saveButton = button;
                revalidate();
              }
            },
            {
              styleButton: (button) => {
                cancelButton = button;
              }
            }
          ],
          renderBody: (container) => {
            container.classList.add("automation-dialog-body");
            const titlebar = DOM.append(container, $(".automation-titlebar"));
            titlebar.setAttribute("aria-hidden", "true");
            titlebar.textContent = title;
            const description = DOM.append(container, $(".automation-description"));
            description.textContent = isEdit ? localize("automation.dialog.editDescription", "Update the schedule, prompt, or run target for this automation.") : localize("automation.dialog.createDescription", "Define a prompt that will run on a schedule against the selected target.");
            const formPane = DOM.append(container, $(".automation-form-pane"));
            const form = DOM.append(formPane, $(".automation-form"));
            const handle = renderForm(form, state, disposables, validation, () => revalidate(), this.instantiationService, this.contextKeyService, this.contextViewService, this.configurationService, this.languageModelsService, this.layoutService, this.logService, this.productService, this.sessionsManagementService, this.workspaceTrustRequestService, initial?.prompt ?? "", initial?.mode, initial?.permissionLevel, initial?.modelId);
            getPrompt = handle.getPrompt;
            getMode = handle.getMode;
            getPermissionLevel = handle.getPermissionLevel;
            getModelId = handle.getModelId;
            getBranch = handle.getBranch;
            waitForAutomationSessionSync = handle.waitForAutomationSessionSync;
            getFocusableElements = handle.getFocusableElements;
            const keyboardNavigation = disposables.add(registerAutomationDialogKeyboardNavigation(
              DOM.getWindow(container),
              () => [
                ...getFocusableElements(),
                ...saveButton ? [saveButton.element] : [],
                ...cancelButton ? [cancelButton.element] : []
              ],
              isAutomationDialogPopupTarget
            ));
            focusFirst = keyboardNavigation.focusFirst;
            revalidate = () => updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch);
            revalidate();
          }
        },
        this.keybindingService,
        this.layoutService,
        this.hostService,
        automationDialogAllowableCommands,
        (commandId, event) => isAutomationDialogEditCommand(commandId, event.target)
      )
    ));
    activeContainer.classList.add("automation-dialog-open");
    disposables.add(toDisposable(() => activeContainer.classList.remove("automation-dialog-open")));
    try {
      const resultPromise = dialog.show();
      focusFirst();
      const result = await resultPromise;
      if (result.button !== 0) {
        return void 0;
      }
      revalidate();
      if (validation.nameError || validation.promptError || validation.folderError || validation.sessionTypeError || validation.branchError) {
        return void 0;
      }
      if (!state.isQuickChat && !state.folderUri || !state.sessionTypeId || state.isQuickChat && !state.providerId) {
        return void 0;
      }
      await waitForAutomationSessionSync();
      const schedule = {
        interval: state.interval,
        scheduleHour: state.hour,
        scheduleMinute: state.minute,
        scheduleDay: state.day
      };
      const prompt = getPrompt();
      const mode = getMode();
      const permissionLevel = getPermissionLevel();
      const modelId = getModelId();
      const branch = getBranch();
      const target = createAutomationTarget(state, branch);
      if (!target) {
        return void 0;
      }
      if (isEdit && initial) {
        const patch = {
          name: state.name,
          prompt,
          schedule,
          target,
          modelId: modelId ?? null,
          mode: mode ?? null,
          permissionLevel: permissionLevel ?? null,
          enabled: state.enabled
        };
        return { kind: "update", id: initial.id, value: patch };
      }
      const create = {
        name: state.name,
        prompt,
        schedule,
        target,
        modelId,
        mode,
        permissionLevel,
        enabled: state.enabled
      };
      return { kind: "create", value: create };
    } finally {
      disposables.dispose();
    }
  }
};
AutomationDialogService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILanguageModelsService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IHostService),
  __decorateParam(10, ISessionsManagementService),
  __decorateParam(11, IWorkspaceTrustRequestService)
], AutomationDialogService);
function createAutomationTarget(state, branch) {
  if (state.isQuickChat) {
    return state.providerId && state.sessionTypeId ? { kind: "quickChat", providerId: state.providerId, sessionTypeId: state.sessionTypeId } : void 0;
  }
  if (!state.folderUri) {
    return void 0;
  }
  const isolation = state.isolationMode === "worktree" ? branch ? { kind: "worktree", branch } : void 0 : state.isolationMode === "workspace" ? { kind: "folder" } : { kind: "default" };
  return isolation ? {
    kind: "workspace",
    folderUri: state.folderUri,
    providerId: state.providerId,
    sessionTypeId: state.sessionTypeId,
    isolation
  } : void 0;
}
export {
  AutomationDialogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXGJyb3dzZXJcXGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2F1dG9tYXRpb25EaWFsb2cuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBEaWFsb2cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IGRlZmF1bHREaWFsb2dTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25UYXJnZXQsIElBdXRvbWF0aW9uU2NoZWR1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uRGlhbG9nUmVzdWx0LCBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIElTaG93QXV0b21hdGlvbkRpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlQXV0b21hdGlvbk9wdGlvbnMsIElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUZvcm1TdGF0ZSwgSVZhbGlkYXRpb25TdGF0ZSwgaXNBdXRvbWF0aW9uRGlhbG9nRWRpdENvbW1hbmQsIGlzQXV0b21hdGlvbkRpYWxvZ1BvcHVwVGFyZ2V0LCByZWdpc3RlckF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24sIHJlbmRlckZvcm0sIHVwZGF0ZVNhdmVCdXR0b25TdGF0ZSB9IGZyb20gJy4vYXV0b21hdGlvbkRpYWxvZy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgYXV0b21hdGlvbkRpYWxvZ0FsbG93YWJsZUNvbW1hbmRzID0gbmV3IFNldChbXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aXQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5yZWxvYWRXaW5kb3cnLFxuXHQnY29weScsXG5cdCdjdXQnLFxuXHQncGFzdGUnLFxuXHQnZWRpdG9yLmFjdGlvbi5zZWxlY3RBbGwnLFxuXHQnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRDb3B5QWN0aW9uJyxcblx0J2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ3V0QWN0aW9uJyxcblx0J2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkUGFzdGVBY3Rpb24nLFxuXHQnaGlkZUNvZGVBY3Rpb25XaWRnZXQnLFxuXHQnY2xlYXJGaWx0ZXJDb2RlQWN0aW9uV2lkZ2V0Jyxcblx0J3NlbGVjdFByZXZDb2RlQWN0aW9uJyxcblx0J3NlbGVjdE5leHRDb2RlQWN0aW9uJyxcblx0J2FjY2VwdFNlbGVjdGVkQ29kZUFjdGlvbicsXG5cdCdwcmV2aWV3U2VsZWN0ZWRDb2RlQWN0aW9uJyxcblx0J3RvZ2dsZVNlY3Rpb25Db2RlQWN0aW9uJyxcblx0J2NvbGxhcHNlU2VjdGlvbkNvZGVBY3Rpb24nLFxuXHQnZXhwYW5kU2VjdGlvbkNvZGVBY3Rpb24nLFxuXHQncXVpY2tJbnB1dC5uZXh0Jyxcblx0J3F1aWNrSW5wdXQucHJldmlvdXMnLFxuXHQncXVpY2tJbnB1dC5hY2NlcHQnLFxuXHQncXVpY2tJbnB1dC5oaWRlJyxcbl0pO1xuXG4vKipcbiAqIE93bnMgdGhlIEF1dG9tYXRpb25zIGNyZWF0ZS9lZGl0IGRpYWxvZyBpbiB0aGUgc2Vzc2lvbnMgbGF5ZXIsIHdoZXJlIHRoZVxuICogc2Vzc2lvbi10eXBlIHByb3ZpZGVyIGl0IG5lZWRzIGFscmVhZHkgbGl2ZXMuIFRoZSB3b3JrYmVuY2ggbGlzdCB3aWRnZXRcbiAqIGRlcGVuZHMgb25seSBvbiB7QGxpbmsgSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlfS5cbiAqL1xuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlIGltcGxlbWVudHMgSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBzaG93QXV0b21hdGlvbkRpYWxvZyhvcHRpb25zOiBJU2hvd0F1dG9tYXRpb25EaWFsb2dPcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbkRpYWxvZ1Jlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgaW5pdGlhbCA9IG9wdGlvbnMuZXhpc3Rpbmc7XG5cdFx0Y29uc3QgaXNFZGl0ID0gISFpbml0aWFsO1xuXHRcdGNvbnN0IGluaXRpYWxUYXJnZXQgPSBpbml0aWFsPy50YXJnZXQ7XG5cdFx0Y29uc3QgaW5pdGlhbFdvcmtzcGFjZVRhcmdldCA9IGluaXRpYWxUYXJnZXQ/LmtpbmQgPT09ICd3b3Jrc3BhY2UnID8gaW5pdGlhbFRhcmdldCA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHN0YXRlOiBJRm9ybVN0YXRlID0ge1xuXHRcdFx0bmFtZTogaW5pdGlhbD8ubmFtZSA/PyAnJyxcblx0XHRcdGludGVydmFsOiBpbml0aWFsPy5zY2hlZHVsZS5pbnRlcnZhbCA/PyAnZGFpbHknLFxuXHRcdFx0aG91cjogaW5pdGlhbD8uc2NoZWR1bGUuc2NoZWR1bGVIb3VyID8/IDksXG5cdFx0XHRtaW51dGU6IGluaXRpYWw/LnNjaGVkdWxlLnNjaGVkdWxlTWludXRlID8/IDAsXG5cdFx0XHRkYXk6IGluaXRpYWw/LnNjaGVkdWxlLnNjaGVkdWxlRGF5ID8/IDEsXG5cdFx0XHRpc1F1aWNrQ2hhdDogaW5pdGlhbFRhcmdldD8ua2luZCA9PT0gJ3F1aWNrQ2hhdCcsXG5cdFx0XHRmb2xkZXJVcmk6IGluaXRpYWxXb3Jrc3BhY2VUYXJnZXQ/LmZvbGRlclVyaSxcblx0XHRcdHByb3ZpZGVySWQ6IGluaXRpYWxUYXJnZXQ/LnByb3ZpZGVySWQsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiBpbml0aWFsVGFyZ2V0Py5zZXNzaW9uVHlwZUlkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogaW5pdGlhbFdvcmtzcGFjZVRhcmdldD8uaXNvbGF0aW9uLmtpbmQgPT09ICdkZWZhdWx0J1xuXHRcdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0XHQ6IGluaXRpYWxXb3Jrc3BhY2VUYXJnZXQ/Lmlzb2xhdGlvbi5raW5kID09PSAnd29ya3RyZWUnID8gJ3dvcmt0cmVlJyA6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0YnJhbmNoOiBpbml0aWFsV29ya3NwYWNlVGFyZ2V0Py5pc29sYXRpb24ua2luZCA9PT0gJ3dvcmt0cmVlJyA/IGluaXRpYWxXb3Jrc3BhY2VUYXJnZXQuaXNvbGF0aW9uLmJyYW5jaCA6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IGluaXRpYWw/LmVuYWJsZWQgPz8gdHJ1ZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgdmFsaWRhdGlvbjogSVZhbGlkYXRpb25TdGF0ZSA9IHsgbmFtZUVycm9yOiB1bmRlZmluZWQsIHByb21wdEVycm9yOiB1bmRlZmluZWQsIGZvbGRlckVycm9yOiB1bmRlZmluZWQsIHNlc3Npb25UeXBlRXJyb3I6IHVuZGVmaW5lZCwgYnJhbmNoRXJyb3I6IHVuZGVmaW5lZCB9O1xuXG5cdFx0bGV0IHNhdmVCdXR0b246IElCdXR0b24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhbmNlbEJ1dHRvbjogSUJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmV2YWxpZGF0ZTogKCkgPT4gdm9pZCA9ICgpID0+IHsgfTtcblx0XHRsZXQgZ2V0UHJvbXB0OiAoKSA9PiBzdHJpbmcgPSAoKSA9PiBpbml0aWFsPy5wcm9tcHQgPz8gJyc7XG5cdFx0bGV0IGdldE1vZGU6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZCA9ICgpID0+IGluaXRpYWw/Lm1vZGU7XG5cdFx0bGV0IGdldFBlcm1pc3Npb25MZXZlbDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkID0gKCkgPT4gaW5pdGlhbD8ucGVybWlzc2lvbkxldmVsO1xuXHRcdGxldCBnZXRNb2RlbElkOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQgPSAoKSA9PiBpbml0aWFsPy5tb2RlbElkO1xuXHRcdGxldCBnZXRCcmFuY2g6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZCA9ICgpID0+IGluaXRpYWxXb3Jrc3BhY2VUYXJnZXQ/Lmlzb2xhdGlvbi5raW5kID09PSAnd29ya3RyZWUnID8gaW5pdGlhbFdvcmtzcGFjZVRhcmdldC5pc29sYXRpb24uYnJhbmNoIDogdW5kZWZpbmVkO1xuXHRcdGxldCB3YWl0Rm9yQXV0b21hdGlvblNlc3Npb25TeW5jOiAoKSA9PiBQcm9taXNlPHZvaWQ+ID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGxldCBnZXRGb2N1c2FibGVFbGVtZW50czogKCkgPT4gcmVhZG9ubHkgSFRNTEVsZW1lbnRbXSA9ICgpID0+IFtdO1xuXHRcdGxldCBmb2N1c0ZpcnN0OiAoKSA9PiB2b2lkID0gKCkgPT4geyB9O1xuXG5cdFx0Y29uc3QgdGl0bGUgPSBpc0VkaXRcblx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZGlhbG9nLmVkaXRUaXRsZScsIFwiRWRpdCBhdXRvbWF0aW9uXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmRpYWxvZy5jcmVhdGVUaXRsZScsIFwiTmV3IGF1dG9tYXRpb25cIik7XG5cblx0XHRjb25zdCBidXR0b25MYWJlbHMgPSBbXG5cdFx0XHRpc0VkaXQgPyBsb2NhbGl6ZSgnYXV0b21hdGlvbi5kaWFsb2cuc2F2ZScsIFwiU2F2ZVwiKSA6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmRpYWxvZy5jcmVhdGUnLCBcIkNyZWF0ZVwiKSxcblx0XHRcdGxvY2FsaXplKCdhdXRvbWF0aW9uLmRpYWxvZy5jYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0aXZlQ29udGFpbmVyID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcjtcblx0XHRjb25zdCBkaWFsb2cgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpYWxvZyhcblx0XHRcdGFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdHRpdGxlLFxuXHRcdFx0YnV0dG9uTGFiZWxzLFxuXHRcdFx0Y3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyh7XG5cdFx0XHRcdHR5cGU6ICdub25lJyxcblx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ2F1dG9tYXRpb24tZGlhbG9nJ10sXG5cdFx0XHRcdGNhbmNlbElkOiAxLFxuXHRcdFx0XHRpc0V4dGVybmFsRm9jdXNBbGxvd2VkOiBpc0F1dG9tYXRpb25EaWFsb2dQb3B1cFRhcmdldCxcblx0XHRcdFx0Ly8gdGV4dExpbmtGb3JlZ3JvdW5kIHN0YW1wcyBpbmxpbmUgc3R5bGVzIG9udG8gY2hhdCBpbnB1dCBwaWNrZXIgY2hpcHMuXG5cdFx0XHRcdGRpYWxvZ1N0eWxlczogeyAuLi5kZWZhdWx0RGlhbG9nU3R5bGVzLCB0ZXh0TGlua0ZvcmVncm91bmQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRidXR0b25PcHRpb25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c3R5bGVCdXR0b246IGJ1dHRvbiA9PiB7XG5cdFx0XHRcdFx0XHRcdHNhdmVCdXR0b24gPSBidXR0b247XG5cdFx0XHRcdFx0XHRcdHJldmFsaWRhdGUoKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzdHlsZUJ1dHRvbjogYnV0dG9uID0+IHtcblx0XHRcdFx0XHRcdFx0Y2FuY2VsQnV0dG9uID0gYnV0dG9uO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRyZW5kZXJCb2R5OiBjb250YWluZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhdXRvbWF0aW9uLWRpYWxvZy1ib2R5Jyk7XG5cblx0XHRcdFx0XHRjb25zdCB0aXRsZWJhciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYXV0b21hdGlvbi10aXRsZWJhcicpKTtcblx0XHRcdFx0XHR0aXRsZWJhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdFx0XHR0aXRsZWJhci50ZXh0Q29udGVudCA9IHRpdGxlO1xuXG5cdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmF1dG9tYXRpb24tZGVzY3JpcHRpb24nKSk7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBpc0VkaXRcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2F1dG9tYXRpb24uZGlhbG9nLmVkaXREZXNjcmlwdGlvbicsIFwiVXBkYXRlIHRoZSBzY2hlZHVsZSwgcHJvbXB0LCBvciBydW4gdGFyZ2V0IGZvciB0aGlzIGF1dG9tYXRpb24uXCIpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhdXRvbWF0aW9uLmRpYWxvZy5jcmVhdGVEZXNjcmlwdGlvbicsIFwiRGVmaW5lIGEgcHJvbXB0IHRoYXQgd2lsbCBydW4gb24gYSBzY2hlZHVsZSBhZ2FpbnN0IHRoZSBzZWxlY3RlZCB0YXJnZXQuXCIpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZm9ybVBhbmUgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmF1dG9tYXRpb24tZm9ybS1wYW5lJykpO1xuXHRcdFx0XHRcdGNvbnN0IGZvcm0gPSBET00uYXBwZW5kKGZvcm1QYW5lLCAkKCcuYXV0b21hdGlvbi1mb3JtJykpO1xuXHRcdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHJlbmRlckZvcm0oZm9ybSwgc3RhdGUsIGRpc3Bvc2FibGVzLCB2YWxpZGF0aW9uLCAoKSA9PiByZXZhbGlkYXRlKCksIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZSwgdGhpcy5sYXlvdXRTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UsIHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBpbml0aWFsPy5wcm9tcHQgPz8gJycsIGluaXRpYWw/Lm1vZGUsIGluaXRpYWw/LnBlcm1pc3Npb25MZXZlbCwgaW5pdGlhbD8ubW9kZWxJZCk7XG5cdFx0XHRcdFx0Z2V0UHJvbXB0ID0gaGFuZGxlLmdldFByb21wdDtcblx0XHRcdFx0XHRnZXRNb2RlID0gaGFuZGxlLmdldE1vZGU7XG5cdFx0XHRcdFx0Z2V0UGVybWlzc2lvbkxldmVsID0gaGFuZGxlLmdldFBlcm1pc3Npb25MZXZlbDtcblx0XHRcdFx0XHRnZXRNb2RlbElkID0gaGFuZGxlLmdldE1vZGVsSWQ7XG5cdFx0XHRcdFx0Z2V0QnJhbmNoID0gaGFuZGxlLmdldEJyYW5jaDtcblx0XHRcdFx0XHR3YWl0Rm9yQXV0b21hdGlvblNlc3Npb25TeW5jID0gaGFuZGxlLndhaXRGb3JBdXRvbWF0aW9uU2Vzc2lvblN5bmM7XG5cdFx0XHRcdFx0Z2V0Rm9jdXNhYmxlRWxlbWVudHMgPSBoYW5kbGUuZ2V0Rm9jdXNhYmxlRWxlbWVudHM7XG5cdFx0XHRcdFx0Y29uc3Qga2V5Ym9hcmROYXZpZ2F0aW9uID0gZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQXV0b21hdGlvbkRpYWxvZ0tleWJvYXJkTmF2aWdhdGlvbihcblx0XHRcdFx0XHRcdERPTS5nZXRXaW5kb3coY29udGFpbmVyKSxcblx0XHRcdFx0XHRcdCgpID0+IFtcblx0XHRcdFx0XHRcdFx0Li4uZ2V0Rm9jdXNhYmxlRWxlbWVudHMoKSxcblx0XHRcdFx0XHRcdFx0Li4uKHNhdmVCdXR0b24gPyBbc2F2ZUJ1dHRvbi5lbGVtZW50XSA6IFtdKSxcblx0XHRcdFx0XHRcdFx0Li4uKGNhbmNlbEJ1dHRvbiA/IFtjYW5jZWxCdXR0b24uZWxlbWVudF0gOiBbXSksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0aXNBdXRvbWF0aW9uRGlhbG9nUG9wdXBUYXJnZXQsXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0Zm9jdXNGaXJzdCA9IGtleWJvYXJkTmF2aWdhdGlvbi5mb2N1c0ZpcnN0O1xuXHRcdFx0XHRcdHJldmFsaWRhdGUgPSAoKSA9PiB1cGRhdGVTYXZlQnV0dG9uU3RhdGUoc2F2ZUJ1dHRvbiwgc3RhdGUsIHZhbGlkYXRpb24sIGZvcm0sIGdldFByb21wdCwgZ2V0QnJhbmNoKTtcblx0XHRcdFx0XHRyZXZhbGlkYXRlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMuaG9zdFNlcnZpY2UsIGF1dG9tYXRpb25EaWFsb2dBbGxvd2FibGVDb21tYW5kcyxcblx0XHRcdFx0KGNvbW1hbmRJZCwgZXZlbnQpID0+IGlzQXV0b21hdGlvbkRpYWxvZ0VkaXRDb21tYW5kKGNvbW1hbmRJZCwgZXZlbnQudGFyZ2V0KSksXG5cdFx0KSk7XG5cblx0XHRhY3RpdmVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYXV0b21hdGlvbi1kaWFsb2ctb3BlbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWN0aXZlQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2F1dG9tYXRpb24tZGlhbG9nLW9wZW4nKSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBkaWFsb2cuc2hvdygpO1xuXHRcdFx0Zm9jdXNGaXJzdCgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRcdGlmIChyZXN1bHQuYnV0dG9uICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBHdWFyZCBhZ2FpbnN0IHN1Ym1pdC13aXRoLUVudGVyIGJ5cGFzc2luZyBsaXZlIHZhbGlkYXRpb24uXG5cdFx0XHRyZXZhbGlkYXRlKCk7XG5cdFx0XHRpZiAodmFsaWRhdGlvbi5uYW1lRXJyb3IgfHwgdmFsaWRhdGlvbi5wcm9tcHRFcnJvciB8fCB2YWxpZGF0aW9uLmZvbGRlckVycm9yIHx8IHZhbGlkYXRpb24uc2Vzc2lvblR5cGVFcnJvciB8fCB2YWxpZGF0aW9uLmJyYW5jaEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKCFzdGF0ZS5pc1F1aWNrQ2hhdCAmJiAhc3RhdGUuZm9sZGVyVXJpKSB8fCAhc3RhdGUuc2Vzc2lvblR5cGVJZCB8fCAoc3RhdGUuaXNRdWlja0NoYXQgJiYgIXN0YXRlLnByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB3YWl0Rm9yQXV0b21hdGlvblNlc3Npb25TeW5jKCk7XG5cblx0XHRcdGNvbnN0IHNjaGVkdWxlOiBJQXV0b21hdGlvblNjaGVkdWxlID0ge1xuXHRcdFx0XHRpbnRlcnZhbDogc3RhdGUuaW50ZXJ2YWwsXG5cdFx0XHRcdHNjaGVkdWxlSG91cjogc3RhdGUuaG91cixcblx0XHRcdFx0c2NoZWR1bGVNaW51dGU6IHN0YXRlLm1pbnV0ZSxcblx0XHRcdFx0c2NoZWR1bGVEYXk6IHN0YXRlLmRheSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb21wdCA9IGdldFByb21wdCgpO1xuXHRcdFx0Y29uc3QgbW9kZSA9IGdldE1vZGUoKTtcblx0XHRcdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IGdldFBlcm1pc3Npb25MZXZlbCgpO1xuXHRcdFx0Y29uc3QgbW9kZWxJZCA9IGdldE1vZGVsSWQoKTtcblx0XHRcdGNvbnN0IGJyYW5jaCA9IGdldEJyYW5jaCgpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlQXV0b21hdGlvblRhcmdldChzdGF0ZSwgYnJhbmNoKTtcblx0XHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0VkaXQgJiYgaW5pdGlhbCkge1xuXHRcdFx0XHRjb25zdCBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zID0ge1xuXHRcdFx0XHRcdG5hbWU6IHN0YXRlLm5hbWUsXG5cdFx0XHRcdFx0cHJvbXB0LFxuXHRcdFx0XHRcdHNjaGVkdWxlLFxuXHRcdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0XHRtb2RlbElkOiBtb2RlbElkID8/IG51bGwsXG5cdFx0XHRcdFx0bW9kZTogbW9kZSA/PyBudWxsLFxuXHRcdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogcGVybWlzc2lvbkxldmVsID8/IG51bGwsXG5cdFx0XHRcdFx0ZW5hYmxlZDogc3RhdGUuZW5hYmxlZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3VwZGF0ZScsIGlkOiBpbml0aWFsLmlkLCB2YWx1ZTogcGF0Y2ggfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3JlYXRlOiBJQ3JlYXRlQXV0b21hdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRcdG5hbWU6IHN0YXRlLm5hbWUsXG5cdFx0XHRcdHByb21wdCxcblx0XHRcdFx0c2NoZWR1bGUsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0bW9kZWxJZCxcblx0XHRcdFx0bW9kZSxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsLFxuXHRcdFx0XHRlbmFibGVkOiBzdGF0ZS5lbmFibGVkLFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdjcmVhdGUnLCB2YWx1ZTogY3JlYXRlIH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b21hdGlvblRhcmdldChzdGF0ZTogSUZvcm1TdGF0ZSwgYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBBdXRvbWF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkIHtcblx0aWYgKHN0YXRlLmlzUXVpY2tDaGF0KSB7XG5cdFx0cmV0dXJuIHN0YXRlLnByb3ZpZGVySWQgJiYgc3RhdGUuc2Vzc2lvblR5cGVJZFxuXHRcdFx0PyB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiBzdGF0ZS5wcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiBzdGF0ZS5zZXNzaW9uVHlwZUlkIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cdGlmICghc3RhdGUuZm9sZGVyVXJpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBpc29sYXRpb24gPSBzdGF0ZS5pc29sYXRpb25Nb2RlID09PSAnd29ya3RyZWUnXG5cdFx0PyAoYnJhbmNoID8geyBraW5kOiAnd29ya3RyZWUnIGFzIGNvbnN0LCBicmFuY2ggfSA6IHVuZGVmaW5lZClcblx0XHQ6IHN0YXRlLmlzb2xhdGlvbk1vZGUgPT09ICd3b3Jrc3BhY2UnXG5cdFx0XHQ/IHsga2luZDogJ2ZvbGRlcicgYXMgY29uc3QgfVxuXHRcdFx0OiB7IGtpbmQ6ICdkZWZhdWx0JyBhcyBjb25zdCB9O1xuXHRyZXR1cm4gaXNvbGF0aW9uXG5cdFx0PyB7XG5cdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdGZvbGRlclVyaTogc3RhdGUuZm9sZGVyVXJpLFxuXHRcdFx0cHJvdmlkZXJJZDogc3RhdGUucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlSWQ6IHN0YXRlLnNlc3Npb25UeXBlSWQsXG5cdFx0XHRpc29sYXRpb24sXG5cdFx0fVxuXHRcdDogdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBRXJCLFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQ0FBb0M7QUFJN0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBdUMsK0JBQStCLCtCQUErQiw0Q0FBNEMsWUFBWSw2QkFBNkI7QUFFMUwsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLG9DQUFvQyxvQkFBSSxJQUFJO0FBQUEsRUFDakQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtB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Uyx1QkFBdUIsT0FBTyxNQUFNO0FBQ25ELFVBQUksQ0FBQyxRQUFRO0FBQ1osZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFVBQVUsU0FBUztBQUN0QixjQUFNLFFBQWtDO0FBQUEsVUFDdkMsTUFBTSxNQUFNO0FBQUEsVUFDWjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxTQUFTLFdBQVc7QUFBQSxVQUNwQixNQUFNLFFBQVE7QUFBQSxVQUNkLGlCQUFpQixtQkFBbUI7QUFBQSxVQUNwQyxTQUFTLE1BQU07QUFBQSxRQUNoQjtBQUNBLGVBQU8sRUFBRSxNQUFNLFVBQVUsSUFBSSxRQUFRLElBQUksT0FBTyxNQUFNO0FBQUEsTUFDdkQ7QUFFQSxZQUFNLFNBQW1DO0FBQUEsUUFDeEMsTUFBTSxNQUFNO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxTQUFTLE1BQU07QUFBQSxNQUNoQjtBQUNBLGFBQU8sRUFBRSxNQUFNLFVBQVUsT0FBTyxPQUFPO0FBQUEsSUFDeEMsVUFBRTtBQUNELGtCQUFZLFFBQVE7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFDRDtBQXJNYSwwQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEJVO0FBdU1iLFNBQVMsdUJBQXVCLE9BQW1CLFFBQTBEO0FBQzVHLE1BQUksTUFBTSxhQUFhO0FBQ3RCLFdBQU8sTUFBTSxjQUFjLE1BQU0sZ0JBQzlCLEVBQUUsTUFBTSxhQUFhLFlBQVksTUFBTSxZQUFZLGVBQWUsTUFBTSxjQUFjLElBQ3RGO0FBQUEsRUFDSjtBQUNBLE1BQUksQ0FBQyxNQUFNLFdBQVc7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFlBQVksTUFBTSxrQkFBa0IsYUFDdEMsU0FBUyxFQUFFLE1BQU0sWUFBcUIsT0FBTyxJQUFJLFNBQ2xELE1BQU0sa0JBQWtCLGNBQ3ZCLEVBQUUsTUFBTSxTQUFrQixJQUMxQixFQUFFLE1BQU0sVUFBbUI7QUFDL0IsU0FBTyxZQUNKO0FBQUEsSUFDRCxNQUFNO0FBQUEsSUFDTixXQUFXLE1BQU07QUFBQSxJQUNqQixZQUFZLE1BQU07QUFBQSxJQUNsQixlQUFlLE1BQU07QUFBQSxJQUNyQjtBQUFBLEVBQ0QsSUFDRTtBQUNKOyIsCiAgIm5hbWVzIjogW10KfQo=
