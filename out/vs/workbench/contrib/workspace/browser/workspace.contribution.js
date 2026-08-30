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
import "./media/workspaceTrustEditor.css";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Severity } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from "../../../../platform/workspace/common/workspaceTrust.js";
import { Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { shieldIcon, WorkspaceTrustEditor } from "./workspaceTrustEditor.js";
import { WorkspaceTrustEditorInput } from "../../../services/workspaces/browser/workspaceTrustEditorInput.js";
import { WORKSPACE_TRUST_BANNER, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_UNTRUSTED_FILES } from "../../../services/workspaces/common/workspaceTrust.js";
import { EditorExtensions } from "../../../common/editor.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isEmptyWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { dirname, resolve } from "../../../../base/common/path.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IBannerService } from "../../../services/banner/browser/bannerService.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from "../../extensions/common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { WORKSPACE_TRUST_SETTING_TAG } from "../../preferences/common/preferences.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from "../common/workspace.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { securityConfigurationNodeBase } from "../../../common/configuration.js";
import { basename, dirname as uriDirname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../../platform/files/common/files.js";
const BANNER_RESTRICTED_MODE = "workbench.banner.restrictedMode";
const STARTUP_PROMPT_SHOWN_KEY = "workspace.trust.startupPrompt.shown";
const BANNER_RESTRICTED_MODE_DISMISSED_KEY = "workbench.banner.restrictedMode.dismissed";
function getSessionsWindowTrustNote(environmentService, productService, isWorkspace) {
  if (!environmentService.isSessionsWindow) {
    return void 0;
  }
  if (isWorkspace) {
    return localize("sessionsWindowWorkspaceTrustNote", "Trusting this workspace will also mark it as trusted in {0}.", productService.nameLong);
  }
  return localize("sessionsWindowFolderTrustNote", "Trusting this folder will also mark it as trusted in {0}.", productService.nameLong);
}
let WorkspaceTrustContextKeys = class extends Disposable {
  constructor(contextKeyService, workspaceTrustEnablementService, workspaceTrustManagementService) {
    super();
    this._ctxWorkspaceTrustEnabled = WorkspaceTrustContext.IsEnabled.bindTo(contextKeyService);
    this._ctxWorkspaceTrustEnabled.set(workspaceTrustEnablementService.isWorkspaceTrustEnabled());
    this._ctxWorkspaceTrustState = WorkspaceTrustContext.IsTrusted.bindTo(contextKeyService);
    this._ctxWorkspaceTrustState.set(workspaceTrustManagementService.isWorkspaceTrusted());
    this._register(workspaceTrustManagementService.onDidChangeTrust((trusted) => this._ctxWorkspaceTrustState.set(trusted)));
  }
};
WorkspaceTrustContextKeys = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IWorkspaceTrustEnablementService),
  __decorateParam(2, IWorkspaceTrustManagementService)
], WorkspaceTrustContextKeys);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustContextKeys, LifecyclePhase.Restored);
let WorkspaceTrustRequestHandler = class extends Disposable {
  constructor(dialogService, commandService, labelService, workspaceContextService, workspaceTrustManagementService, workspaceTrustRequestService, environmentService, productService) {
    super();
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.labelService = labelService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.environmentService = environmentService;
    this.productService = productService;
    this.registerListeners();
  }
  get useWorkspaceLanguage() {
    return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
  }
  registerListeners() {
    this._register(this.workspaceTrustRequestService.onDidInitiateOpenFilesTrustRequest(async () => {
      await this.workspaceTrustManagementService.workspaceResolved;
      const markdownDetails = [
        this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ? localize("openLooseFileWorkspaceDetails", "You are trying to open untrusted files in a workspace which is trusted.") : localize("openLooseFileWindowDetails", "You are trying to open untrusted files in a window which is trusted."),
        localize("openLooseFileLearnMore", "If you don't want to open untrusted files, we recommend to open them in Restricted Mode in a new window as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")
      ];
      await this.dialogService.prompt({
        type: Severity.Info,
        message: this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ? localize("openLooseFileWorkspaceMesssage", "Do you want to allow untrusted files in this workspace?") : localize("openLooseFileWindowMesssage", "Do you want to allow untrusted files in this window?"),
        buttons: [
          {
            label: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open"),
            run: ({ checkboxChecked }) => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Open, !!checkboxChecked)
          },
          {
            label: localize({ key: "newWindow", comment: ["&& denotes a mnemonic"] }, "Open in &&Restricted Mode"),
            run: ({ checkboxChecked }) => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.OpenInNewWindow, !!checkboxChecked)
          }
        ],
        cancelButton: {
          run: () => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Cancel)
        },
        checkbox: {
          label: localize("openLooseFileWorkspaceCheckbox", "Remember my decision for all workspaces"),
          checked: false
        },
        custom: {
          icon: Codicon.shield,
          markdownDetails: markdownDetails.map((md) => {
            return { markdown: new MarkdownString(md) };
          })
        }
      });
    }));
    this._register(this.workspaceTrustRequestService.onDidInitiateResourcesTrustRequest(async (options) => {
      await this.workspaceTrustManagementService.workspaceResolved;
      const markdownDetails = [
        options?.message ?? localize("resourcesTrustDetails", "You are trying to open an untrusted folder. Do you trust the authors of this content?"),
        localize("resourcesTrustLearnMore", "If you don't trust the authors of these files, we recommend not continuing as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more."),
        `\`${this.labelService.getUriLabel(options.uri)}\``
      ];
      const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, false);
      if (sessionsTrustNote) {
        markdownDetails.push(sessionsTrustNote);
      }
      await this.dialogService.prompt({
        type: Severity.Info,
        message: localize("resourcesTrustMessage", "Do you trust the authors of the files in this folder?"),
        buttons: [
          {
            label: localize({ key: "trustResources", comment: ["&& denotes a mnemonic"] }, "&&Trust Folder & Continue"),
            run: () => this.workspaceTrustRequestService.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Open)
          }
        ],
        cancelButton: {
          run: () => this.workspaceTrustRequestService.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Cancel)
        },
        custom: {
          icon: Codicon.shield,
          markdownDetails: markdownDetails.map((md) => {
            return { markdown: new MarkdownString(md) };
          })
        }
      });
    }));
    this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(async (requestOptions) => {
      await this.workspaceTrustManagementService.workspaceResolved;
      const message = this.useWorkspaceLanguage ? localize("workspaceTrust", "Do you trust the authors of the files in this workspace?") : localize("folderTrust", "Do you trust the authors of the files in this folder?");
      const defaultDetails = localize("immediateTrustRequestMessage", "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.");
      const details = requestOptions?.message ?? defaultDetails;
      const buttons = requestOptions?.buttons ?? [
        { label: this.useWorkspaceLanguage ? localize({ key: "grantWorkspaceTrustButton", comment: ["&& denotes a mnemonic"] }, "&&Trust Workspace & Continue") : localize({ key: "grantFolderTrustButton", comment: ["&& denotes a mnemonic"] }, "&&Trust Folder & Continue"), type: "ContinueWithTrust" },
        { label: localize({ key: "manageWorkspaceTrustButton", comment: ["&& denotes a mnemonic"] }, "&&Manage"), type: "Manage" }
      ];
      if (!buttons.some((b) => b.type === "Cancel")) {
        buttons.push({ label: localize("cancelWorkspaceTrustButton", "Cancel"), type: "Cancel" });
      }
      const markdownDetails = [
        { markdown: new MarkdownString(details) },
        { markdown: new MarkdownString(localize("immediateTrustRequestLearnMore", "If you don't trust the authors of these files, we do not recommend continuing as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")) }
      ];
      const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, this.useWorkspaceLanguage);
      if (sessionsTrustNote) {
        markdownDetails.push({ markdown: new MarkdownString(sessionsTrustNote) });
      }
      const { result } = await this.dialogService.prompt({
        type: Severity.Info,
        message,
        custom: {
          icon: Codicon.shield,
          markdownDetails
        },
        buttons: buttons.filter((b) => b.type !== "Cancel").map((button) => {
          return {
            label: button.label,
            run: () => button.type
          };
        }),
        cancelButton: (() => {
          const cancelButton = buttons.find((b) => b.type === "Cancel");
          if (!cancelButton) {
            return void 0;
          }
          return {
            label: cancelButton.label,
            run: () => cancelButton.type
          };
        })()
      });
      switch (result) {
        case "ContinueWithTrust":
          await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
          break;
        case "ContinueWithoutTrust":
          await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(void 0);
          break;
        case "Manage":
          this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
          await this.commandService.executeCommand(MANAGE_TRUST_COMMAND_ID);
          break;
        case "Cancel":
          this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
          break;
      }
    }));
  }
};
WorkspaceTrustRequestHandler.ID = "workbench.contrib.workspaceTrustRequestHandler";
WorkspaceTrustRequestHandler = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IWorkspaceTrustManagementService),
  __decorateParam(5, IWorkspaceTrustRequestService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, IProductService)
], WorkspaceTrustRequestHandler);
let WorkspaceTrustUXHandler = class extends Disposable {
  constructor(dialogService, workspaceContextService, workspaceTrustEnablementService, workspaceTrustManagementService, configurationService, statusbarService, storageService, workspaceTrustRequestService, bannerService, labelService, hostService, productService, remoteAgentService, environmentService, fileService) {
    super();
    this.dialogService = dialogService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.configurationService = configurationService;
    this.statusbarService = statusbarService;
    this.storageService = storageService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.bannerService = bannerService;
    this.labelService = labelService;
    this.hostService = hostService;
    this.productService = productService;
    this.remoteAgentService = remoteAgentService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.entryId = `status.workspaceTrust`;
    this.statusbarEntryAccessor = this._register(new MutableDisposable());
    (async () => {
      await this.workspaceTrustManagementService.workspaceTrustInitialized;
      if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
        this.registerListeners();
        this.updateStatusbarEntry(this.workspaceTrustManagementService.isWorkspaceTrusted());
        if (this.hostService.hasFocus) {
          this.showModalOnStart();
        } else {
          const focusDisposable = this.hostService.onDidChangeFocus((focused) => {
            if (focused) {
              focusDisposable.dispose();
              this.showModalOnStart();
            }
          });
        }
      }
    })();
  }
  registerListeners() {
    this._register(this.workspaceContextService.onWillChangeWorkspaceFolders((e) => {
      if (e.fromCache) {
        return;
      }
      if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
        return;
      }
      const addWorkspaceFolder = async (e2) => {
        const trusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
        if (trusted && (e2.changes.added.length || e2.changes.changed.length)) {
          const addedFoldersTrustInfo = await Promise.all(e2.changes.added.map((folder) => this.workspaceTrustManagementService.getUriTrustInfo(folder.uri)));
          if (!addedFoldersTrustInfo.map((info) => info.trusted).every((trusted2) => trusted2)) {
            let detail = localize("addWorkspaceFolderDetail", "You are adding files that are not currently trusted to a trusted workspace. Do you trust the authors of these new files?");
            const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, false);
            if (sessionsTrustNote) {
              detail += "\n\n" + sessionsTrustNote;
            }
            const { confirmed } = await this.dialogService.confirm({
              type: Severity.Info,
              message: localize("addWorkspaceFolderMessage", "Do you trust the authors of the files in this folder?"),
              detail,
              cancelButton: localize("no", "No"),
              custom: { icon: Codicon.shield }
            });
            await this.workspaceTrustManagementService.setUrisTrust(addedFoldersTrustInfo.map((i) => i.uri), confirmed);
          }
        }
      };
      return e.join(addWorkspaceFolder(e));
    }));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust((trusted) => {
      this.updateWorkbenchIndicators(trusted);
    }));
    this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequestOnStartup(async () => {
      let titleString;
      let learnMoreString;
      let trustOption;
      let dontTrustOption;
      const isAiGeneratedWorkspace = await this.isAiGeneratedWorkspace();
      if (isAiGeneratedWorkspace && this.productService.aiGeneratedWorkspaceTrust) {
        titleString = this.productService.aiGeneratedWorkspaceTrust.title;
        learnMoreString = this.productService.aiGeneratedWorkspaceTrust.startupTrustRequestLearnMore;
        trustOption = this.productService.aiGeneratedWorkspaceTrust.trustOption;
        dontTrustOption = this.productService.aiGeneratedWorkspaceTrust.dontTrustOption;
      } else {
        console.warn("AI generated workspace trust dialog contents not available.");
      }
      const title = titleString ?? (this.useWorkspaceLanguage ? localize("workspaceTrust", "Do you trust the authors of the files in this workspace?") : localize("folderTrust", "Do you trust the authors of the files in this folder?"));
      let checkboxText;
      const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace());
      const isSingleFolderWorkspace = isSingleFolderWorkspaceIdentifier(workspaceIdentifier);
      const isEmptyWindow = isEmptyWorkspaceIdentifier(workspaceIdentifier);
      if (!isAiGeneratedWorkspace && this.workspaceTrustManagementService.canSetParentFolderTrust()) {
        const name = basename(uriDirname(workspaceIdentifier.uri));
        checkboxText = localize("checkboxString", "Trust the authors of all files in the parent folder '{0}'", name);
      }
      const markdownStrings = [
        !isSingleFolderWorkspace ? localize("workspaceStartupTrustDetails", "{0} provides features that may automatically execute files in this workspace.", this.productService.nameShort) : localize("folderStartupTrustDetails", "{0} provides features that may automatically execute files in this folder.", this.productService.nameShort),
        learnMoreString ?? localize("startupTrustRequestLearnMore", "If you don't trust the authors of these files, we recommend to continue in restricted mode as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more."),
        !isEmptyWindow ? `\`${this.labelService.getWorkspaceLabel(workspaceIdentifier, { verbose: Verbosity.LONG })}\`` : ""
      ];
      const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, !isSingleFolderWorkspace);
      if (sessionsTrustNote) {
        markdownStrings.push(sessionsTrustNote);
      }
      this.doShowModal(
        title,
        { label: trustOption ?? localize({ key: "trustOption", comment: ["&& denotes a mnemonic"] }, "&&Yes, I trust the authors"), sublabel: isSingleFolderWorkspace ? localize("trustFolderOptionDescription", "Trust folder and enable all features") : localize("trustWorkspaceOptionDescription", "Trust workspace and enable all features") },
        { label: dontTrustOption ?? localize({ key: "dontTrustOption", comment: ["&& denotes a mnemonic"] }, "&&No, I don't trust the authors"), sublabel: isSingleFolderWorkspace ? localize("dontTrustFolderOptionDescription", "Open folder in restricted mode") : localize("dontTrustWorkspaceOptionDescription", "Open workspace in restricted mode") },
        markdownStrings,
        checkboxText
      );
    }));
  }
  updateWorkbenchIndicators(trusted) {
    const bannerItem = this.getBannerItem(!trusted);
    this.updateStatusbarEntry(trusted);
    if (bannerItem) {
      if (!trusted) {
        this.bannerService.show(bannerItem);
      } else {
        this.bannerService.hide(BANNER_RESTRICTED_MODE);
      }
    }
  }
  //#region Dialog
  async doShowModal(question, trustedOption, untrustedOption, markdownStrings, trustParentString) {
    await this.dialogService.prompt({
      type: Severity.Info,
      message: question,
      checkbox: trustParentString ? {
        label: trustParentString
      } : void 0,
      buttons: [
        {
          label: trustedOption.label,
          run: async ({ checkboxChecked }) => {
            if (checkboxChecked) {
              await this.workspaceTrustManagementService.setParentFolderTrust(true);
            } else {
              await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
            }
          }
        },
        {
          label: untrustedOption.label,
          run: () => {
            this.updateWorkbenchIndicators(false);
            this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
          }
        }
      ],
      custom: {
        buttonDetails: [
          trustedOption.sublabel,
          untrustedOption.sublabel
        ],
        disableCloseAction: true,
        icon: Codicon.shield,
        markdownDetails: markdownStrings.map((md) => {
          return { markdown: new MarkdownString(md) };
        })
      }
    });
    this.storageService.store(STARTUP_PROMPT_SHOWN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async showModalOnStart() {
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      this.updateWorkbenchIndicators(true);
      return;
    }
    if (!this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
      return;
    }
    if (isVirtualWorkspace(this.workspaceContextService.getWorkspace())) {
      this.updateWorkbenchIndicators(false);
      return;
    }
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      this.updateWorkbenchIndicators(false);
      return;
    }
    if (this.startupPromptSetting === "never") {
      this.updateWorkbenchIndicators(false);
      return;
    }
    if (this.startupPromptSetting === "once" && this.storageService.getBoolean(STARTUP_PROMPT_SHOWN_KEY, StorageScope.WORKSPACE, false)) {
      this.updateWorkbenchIndicators(false);
      return;
    }
    this.workspaceTrustRequestService.requestWorkspaceTrustOnStartup();
  }
  get startupPromptSetting() {
    return this.configurationService.getValue(WORKSPACE_TRUST_STARTUP_PROMPT);
  }
  get useWorkspaceLanguage() {
    return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
  }
  async isAiGeneratedWorkspace() {
    const aiGeneratedWorkspaces = URI.joinPath(this.environmentService.workspaceStorageHome, "aiGeneratedWorkspaces.json");
    return await this.fileService.exists(aiGeneratedWorkspaces).then(async (result) => {
      if (result) {
        try {
          const content = await this.fileService.readFile(aiGeneratedWorkspaces);
          const workspaces = JSON.parse(content.value.toString());
          if (workspaces.indexOf(this.workspaceContextService.getWorkspace().folders[0].uri.toString()) > -1) {
            return true;
          }
        } catch (e) {
        }
      }
      return false;
    });
  }
  //#endregion
  //#region Banner
  getBannerItem(restrictedMode) {
    const dismissedRestricted = this.storageService.getBoolean(BANNER_RESTRICTED_MODE_DISMISSED_KEY, StorageScope.WORKSPACE, false);
    if (this.bannerSetting === "never") {
      return void 0;
    }
    if (this.bannerSetting === "untilDismissed" && dismissedRestricted) {
      return void 0;
    }
    const actions = [
      {
        label: localize("restrictedModeBannerManage", "Manage"),
        href: "command:" + MANAGE_TRUST_COMMAND_ID
      },
      {
        label: localize("restrictedModeBannerLearnMore", "Learn More"),
        href: "https://aka.ms/vscode-workspace-trust"
      }
    ];
    return {
      id: BANNER_RESTRICTED_MODE,
      icon: shieldIcon,
      ariaLabel: this.getBannerItemAriaLabels(),
      message: this.getBannerItemMessages(),
      actions,
      onClose: () => {
        if (restrictedMode) {
          this.storageService.store(BANNER_RESTRICTED_MODE_DISMISSED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
        }
      }
    };
  }
  getBannerItemAriaLabels() {
    switch (this.workspaceContextService.getWorkbenchState()) {
      case WorkbenchState.EMPTY:
        return localize("restrictedModeBannerAriaLabelWindow", "Restricted Mode is intended for safe code browsing. Trust this window to enable all features. Use navigation keys to access banner actions.");
      case WorkbenchState.FOLDER:
        return localize("restrictedModeBannerAriaLabelFolder", "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features. Use navigation keys to access banner actions.");
      case WorkbenchState.WORKSPACE:
        return localize("restrictedModeBannerAriaLabelWorkspace", "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features. Use navigation keys to access banner actions.");
    }
  }
  getBannerItemMessages() {
    switch (this.workspaceContextService.getWorkbenchState()) {
      case WorkbenchState.EMPTY:
        return localize("restrictedModeBannerMessageWindow", "Restricted Mode is intended for safe code browsing. Trust this window to enable all features.");
      case WorkbenchState.FOLDER:
        return localize("restrictedModeBannerMessageFolder", "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features.");
      case WorkbenchState.WORKSPACE:
        return localize("restrictedModeBannerMessageWorkspace", "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features.");
    }
  }
  get bannerSetting() {
    const result = this.configurationService.getValue(WORKSPACE_TRUST_BANNER);
    if (result !== "always" && isWeb && !this.remoteAgentService.getConnection()?.remoteAuthority) {
      return "never";
    }
    return result;
  }
  //#endregion
  //#region Statusbar
  getRestrictedModeStatusbarEntry() {
    let ariaLabel = "";
    let toolTip;
    switch (this.workspaceContextService.getWorkbenchState()) {
      case WorkbenchState.EMPTY: {
        ariaLabel = localize("status.ariaUntrustedWindow", "Restricted Mode: Some features are disabled because this window is not trusted.");
        toolTip = {
          value: localize(
            { key: "status.tooltipUntrustedWindow2", comment: ["[abc]({n}) are links.  Only translate `features are disabled` and `window is not trusted`. Do not change brackets and parentheses or {n}"] },
            "Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [window is not trusted]({1}).",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
            `command:${MANAGE_TRUST_COMMAND_ID}`
          ),
          isTrusted: true,
          supportThemeIcons: true
        };
        break;
      }
      case WorkbenchState.FOLDER: {
        ariaLabel = localize("status.ariaUntrustedFolder", "Restricted Mode: Some features are disabled because this folder is not trusted.");
        toolTip = {
          value: localize(
            { key: "status.tooltipUntrustedFolder2", comment: ["[abc]({n}) are links.  Only translate `features are disabled` and `folder is not trusted`. Do not change brackets and parentheses or {n}"] },
            "Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [folder is not trusted]({1}).",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
            `command:${MANAGE_TRUST_COMMAND_ID}`
          ),
          isTrusted: true,
          supportThemeIcons: true
        };
        break;
      }
      case WorkbenchState.WORKSPACE: {
        ariaLabel = localize("status.ariaUntrustedWorkspace", "Restricted Mode: Some features are disabled because this workspace is not trusted.");
        toolTip = {
          value: localize(
            { key: "status.tooltipUntrustedWorkspace2", comment: ["[abc]({n}) are links. Only translate `features are disabled` and `workspace is not trusted`. Do not change brackets and parentheses or {n}"] },
            "Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [workspace is not trusted]({1}).",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
            `command:${MANAGE_TRUST_COMMAND_ID}`
          ),
          isTrusted: true,
          supportThemeIcons: true
        };
        break;
      }
    }
    return {
      name: localize("status.WorkspaceTrust", "Workspace Trust"),
      text: `$(shield) ${localize("untrusted", "Restricted Mode")}`,
      ariaLabel,
      tooltip: toolTip,
      command: MANAGE_TRUST_COMMAND_ID,
      kind: "prominent"
    };
  }
  updateStatusbarEntry(trusted) {
    if (trusted && this.statusbarEntryAccessor.value) {
      this.statusbarEntryAccessor.clear();
      return;
    }
    if (!trusted && !this.statusbarEntryAccessor.value) {
      const entry = this.getRestrictedModeStatusbarEntry();
      this.statusbarEntryAccessor.value = this.statusbarService.addEntry(entry, this.entryId, StatusbarAlignment.LEFT, { location: { id: "status.host", priority: Number.POSITIVE_INFINITY }, alignment: StatusbarAlignment.RIGHT });
    }
  }
  //#endregion
};
WorkspaceTrustUXHandler = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IWorkspaceTrustEnablementService),
  __decorateParam(3, IWorkspaceTrustManagementService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkspaceTrustRequestService),
  __decorateParam(8, IBannerService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IHostService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IRemoteAgentService),
  __decorateParam(13, IWorkbenchEnvironmentService),
  __decorateParam(14, IFileService)
], WorkspaceTrustUXHandler);
registerWorkbenchContribution2(WorkspaceTrustRequestHandler.ID, WorkspaceTrustRequestHandler, WorkbenchPhase.BlockRestore);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustUXHandler, LifecyclePhase.Restored);
class WorkspaceTrustEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(input) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(WorkspaceTrustEditorInput);
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(WorkspaceTrustEditorInput.ID, WorkspaceTrustEditorInputSerializer);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    WorkspaceTrustEditor,
    WorkspaceTrustEditor.ID,
    localize("workspaceTrustEditor", "Workspace Trust Editor")
  ),
  [
    new SyncDescriptor(WorkspaceTrustEditorInput)
  ]
);
const CONFIGURE_TRUST_COMMAND_ID = "workbench.trust.configure";
const WORKSPACES_CATEGORY = localize2("workspacesCategory", "Workspaces");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CONFIGURE_TRUST_COMMAND_ID,
      title: localize2("configureWorkspaceTrustSettings", "Configure Workspace Trust Settings"),
      precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
      category: WORKSPACES_CATEGORY,
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: `@tag:${WORKSPACE_TRUST_SETTING_TAG}` });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: MANAGE_TRUST_COMMAND_ID,
      title: localize2("manageWorkspaceTrust", "Manage Workspace Trust"),
      precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
      category: WORKSPACES_CATEGORY,
      f1: true
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const instantiationService = accessor.get(IInstantiationService);
    const input = instantiationService.createInstance(WorkspaceTrustEditorInput);
    editorService.openEditor(input, { pinned: true });
    return;
  }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...securityConfigurationNodeBase,
  properties: {
    [WORKSPACE_TRUST_ENABLED]: {
      type: "boolean",
      default: true,
      description: localize("workspace.trust.description", "Controls whether or not Workspace Trust is enabled within VS Code."),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION
    },
    [WORKSPACE_TRUST_STARTUP_PROMPT]: {
      type: "string",
      default: "never",
      description: localize("workspace.trust.startupPrompt.description", "Controls when the startup prompt to trust a workspace is shown."),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION,
      enum: ["always", "once", "never"],
      enumDescriptions: [
        localize("workspace.trust.startupPrompt.always", "Ask for trust every time an untrusted workspace is opened."),
        localize("workspace.trust.startupPrompt.once", "Ask for trust the first time an untrusted workspace is opened."),
        localize("workspace.trust.startupPrompt.never", "Do not ask for trust when an untrusted workspace is opened.")
      ]
    },
    [WORKSPACE_TRUST_BANNER]: {
      type: "string",
      default: "untilDismissed",
      description: localize("workspace.trust.banner.description", "Controls when the restricted mode banner is shown."),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION,
      enum: ["always", "untilDismissed", "never"],
      enumDescriptions: [
        localize("workspace.trust.banner.always", "Show the banner every time an untrusted workspace is open."),
        localize("workspace.trust.banner.untilDismissed", "Show the banner when an untrusted workspace is opened until dismissed."),
        localize("workspace.trust.banner.never", "Do not show the banner when an untrusted workspace is open.")
      ]
    },
    [WORKSPACE_TRUST_UNTRUSTED_FILES]: {
      type: "string",
      default: "prompt",
      markdownDescription: localize("workspace.trust.untrustedFiles.description", "Controls how to handle opening untrusted files in a trusted workspace. This setting also applies to opening files in an empty window which is trusted via `#{0}#`.", WORKSPACE_TRUST_EMPTY_WINDOW),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION,
      enum: ["prompt", "open", "newWindow"],
      enumDescriptions: [
        localize("workspace.trust.untrustedFiles.prompt", "Ask how to handle untrusted files for each workspace. Once untrusted files are introduced to a trusted workspace, you will not be prompted again."),
        localize("workspace.trust.untrustedFiles.open", "Always allow untrusted files to be introduced to a trusted workspace without prompting."),
        localize("workspace.trust.untrustedFiles.newWindow", "Always open untrusted files in a separate window in restricted mode without prompting.")
      ]
    },
    [WORKSPACE_TRUST_EMPTY_WINDOW]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("workspace.trust.emptyWindow.description", "Controls whether or not the empty window is trusted by default within VS Code. When used with `#{0}#`, you can enable the full functionality of VS Code without prompting in an empty window.", WORKSPACE_TRUST_UNTRUSTED_FILES),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION
    }
  }
});
let WorkspaceTrustTelemetryContribution = class extends Disposable {
  constructor(environmentService, telemetryService, workspaceContextService, workspaceTrustEnablementService, workspaceTrustManagementService) {
    super();
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
      this.logInitialWorkspaceTrustInfo();
      this.logWorkspaceTrust(this.workspaceTrustManagementService.isWorkspaceTrusted());
      this._register(this.workspaceTrustManagementService.onDidChangeTrust((isTrusted) => this.logWorkspaceTrust(isTrusted)));
    });
  }
  logInitialWorkspaceTrustInfo() {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      const disabledByCliFlag = this.environmentService.disableWorkspaceTrust;
      this.telemetryService.publicLog2("workspaceTrustDisabled", {
        reason: disabledByCliFlag ? "cli" : "setting"
      });
      return;
    }
    this.telemetryService.publicLog2("workspaceTrustFolderCounts", {
      trustedFoldersCount: this.workspaceTrustManagementService.getTrustedUris().length
    });
  }
  async logWorkspaceTrust(isTrusted) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return;
    }
    this.telemetryService.publicLog2("workspaceTrustStateChanged", {
      workspaceId: this.workspaceContextService.getWorkspace().id,
      isTrusted
    });
    if (isTrusted) {
      const getDepth = (folder) => {
        let resolvedPath = resolve(folder);
        let depth = 0;
        while (dirname(resolvedPath) !== resolvedPath && depth < 100) {
          resolvedPath = dirname(resolvedPath);
          depth++;
        }
        return depth;
      };
      for (const folder of this.workspaceContextService.getWorkspace().folders) {
        const { trusted, uri } = await this.workspaceTrustManagementService.getUriTrustInfo(folder.uri);
        if (!trusted) {
          continue;
        }
        const workspaceFolderDepth = getDepth(folder.uri.fsPath);
        const trustedFolderDepth = getDepth(uri.fsPath);
        const delta = workspaceFolderDepth - trustedFolderDepth;
        this.telemetryService.publicLog2("workspaceFolderDepthBelowTrustedFolder", { workspaceFolderDepth, trustedFolderDepth, delta });
      }
    }
  }
};
WorkspaceTrustTelemetryContribution = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkspaceTrustEnablementService),
  __decorateParam(4, IWorkspaceTrustManagementService)
], WorkspaceTrustTelemetryContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustTelemetryContribution, LifecyclePhase.Restored);
export {
  WorkspaceTrustContextKeys,
  WorkspaceTrustRequestHandler,
  WorkspaceTrustUXHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdvcmtzcGFjZVxcYnJvd3Nlclxcd29ya3NwYWNlLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS93b3Jrc3BhY2VUcnVzdEVkaXRvci5jc3MnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnksIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lUmVnaXN0cnksIEVkaXRvclBhbmVEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgc2hpZWxkSWNvbiwgV29ya3NwYWNlVHJ1c3RFZGl0b3IgfSBmcm9tICcuL3dvcmtzcGFjZVRydXN0RWRpdG9yLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2Jyb3dzZXIvd29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBXT1JLU1BBQ0VfVFJVU1RfQkFOTkVSLCBXT1JLU1BBQ0VfVFJVU1RfRU1QVFlfV0lORE9XLCBXT1JLU1BBQ0VfVFJVU1RfRU5BQkxFRCwgV09SS1NQQUNFX1RSVVNUX1NUQVJUVVBfUFJPTVBULCBXT1JLU1BBQ0VfVFJVU1RfVU5UUlVTVEVEX0ZJTEVTIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcmlhbGl6ZXIsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGlzRW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyLCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50LCB0b1dvcmtzcGFjZUlkZW50aWZpZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgcmVzb2x2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElCYW5uZXJJdGVtLCBJQmFubmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Jhbm5lci9icm93c2VyL2Jhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNWaXJ0dWFsV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi92aXJ0dWFsV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IExJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgV09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHIH0gZnJvbSAnLi4vLi4vcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1BTkFHRV9UUlVTVF9DT01NQU5EX0lELCBXb3Jrc3BhY2VUcnVzdENvbnRleHQgfSBmcm9tICcuLi9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNlY3VyaXR5Q29uZmlndXJhdGlvbk5vZGVCYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgYXMgdXJpRGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcblxuY29uc3QgQkFOTkVSX1JFU1RSSUNURURfTU9ERSA9ICd3b3JrYmVuY2guYmFubmVyLnJlc3RyaWN0ZWRNb2RlJztcbmNvbnN0IFNUQVJUVVBfUFJPTVBUX1NIT1dOX0tFWSA9ICd3b3Jrc3BhY2UudHJ1c3Quc3RhcnR1cFByb21wdC5zaG93bic7XG5jb25zdCBCQU5ORVJfUkVTVFJJQ1RFRF9NT0RFX0RJU01JU1NFRF9LRVkgPSAnd29ya2JlbmNoLmJhbm5lci5yZXN0cmljdGVkTW9kZS5kaXNtaXNzZWQnO1xuXG4vKipcbiAqIFJldHVybnMgYSB0cnVzdCBub3RlIHN0cmluZyBmb3IgdGhlIHNlc3Npb25zIHdpbmRvdyBleHBsYWluaW5nIHRoYXQgdHJ1c3RpbmdcbiAqIGEgZm9sZGVyL3dvcmtzcGFjZSBhbHNvIHBlcnNpc3RzIHRydXN0IHRvIHRoZSBwYXJlbnQgVlMgQ29kZSBpbnN0YWxsLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vdCBydW5uaW5nIGluIHRoZSBzZXNzaW9ucyB3aW5kb3cuXG4gKi9cbmZ1bmN0aW9uIGdldFNlc3Npb25zV2luZG93VHJ1c3ROb3RlKGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSwgaXNXb3Jrc3BhY2U6IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIWVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoaXNXb3Jrc3BhY2UpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25zV2luZG93V29ya3NwYWNlVHJ1c3ROb3RlJywgXCJUcnVzdGluZyB0aGlzIHdvcmtzcGFjZSB3aWxsIGFsc28gbWFyayBpdCBhcyB0cnVzdGVkIGluIHswfS5cIiwgcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xuXHR9XG5cdHJldHVybiBsb2NhbGl6ZSgnc2Vzc2lvbnNXaW5kb3dGb2xkZXJUcnVzdE5vdGUnLCBcIlRydXN0aW5nIHRoaXMgZm9sZGVyIHdpbGwgYWxzbyBtYXJrIGl0IGFzIHRydXN0ZWQgaW4gezB9LlwiLCBwcm9kdWN0U2VydmljZS5uYW1lTG9uZyk7XG59XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdENvbnRleHRLZXlzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFdvcmtzcGFjZVRydXN0RW5hYmxlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFdvcmtzcGFjZVRydXN0U3RhdGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2Ugd29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jdHhXb3Jrc3BhY2VUcnVzdEVuYWJsZWQgPSBXb3Jrc3BhY2VUcnVzdENvbnRleHQuSXNFbmFibGVkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4V29ya3NwYWNlVHJ1c3RFbmFibGVkLnNldCh3b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCkpO1xuXG5cdFx0dGhpcy5fY3R4V29ya3NwYWNlVHJ1c3RTdGF0ZSA9IFdvcmtzcGFjZVRydXN0Q29udGV4dC5Jc1RydXN0ZWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhXb3Jrc3BhY2VUcnVzdFN0YXRlLnNldCh3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCh0cnVzdGVkID0+IHRoaXMuX2N0eFdvcmtzcGFjZVRydXN0U3RhdGUuc2V0KHRydXN0ZWQpKSk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFdvcmtzcGFjZVRydXN0Q29udGV4dEtleXMsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuXG4vKlxuICogVHJ1c3QgUmVxdWVzdCB2aWEgU2VydmljZSBVWCBoYW5kbGVyXG4gKi9cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVRydXN0UmVxdWVzdEhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLndvcmtzcGFjZVRydXN0UmVxdWVzdEhhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHVzZVdvcmtzcGFjZUxhbmd1YWdlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gT3BlbiBmaWxlcyB0cnVzdCByZXF1ZXN0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLm9uRGlkSW5pdGlhdGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVJlc29sdmVkO1xuXG5cdFx0XHQvLyBEZXRhaWxzXG5cdFx0XHRjb25zdCBtYXJrZG93bkRldGFpbHMgPSBbXG5cdFx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdvcGVuTG9vc2VGaWxlV29ya3NwYWNlRGV0YWlscycsIFwiWW91IGFyZSB0cnlpbmcgdG8gb3BlbiB1bnRydXN0ZWQgZmlsZXMgaW4gYSB3b3Jrc3BhY2Ugd2hpY2ggaXMgdHJ1c3RlZC5cIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdvcGVuTG9vc2VGaWxlV2luZG93RGV0YWlscycsIFwiWW91IGFyZSB0cnlpbmcgdG8gb3BlbiB1bnRydXN0ZWQgZmlsZXMgaW4gYSB3aW5kb3cgd2hpY2ggaXMgdHJ1c3RlZC5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdvcGVuTG9vc2VGaWxlTGVhcm5Nb3JlJywgXCJJZiB5b3UgZG9uJ3Qgd2FudCB0byBvcGVuIHVudHJ1c3RlZCBmaWxlcywgd2UgcmVjb21tZW5kIHRvIG9wZW4gdGhlbSBpbiBSZXN0cmljdGVkIE1vZGUgaW4gYSBuZXcgd2luZG93IGFzIHRoZSBmaWxlcyBtYXkgYmUgbWFsaWNpb3VzLiBTZWUgW291ciBkb2NzXShodHRwczovL2FrYS5tcy92c2NvZGUtd29ya3NwYWNlLXRydXN0KSB0byBsZWFybiBtb3JlLlwiKVxuXHRcdFx0XTtcblxuXHRcdFx0Ly8gRGlhbG9nXG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PHZvaWQ+KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/XG5cdFx0XHRcdFx0bG9jYWxpemUoJ29wZW5Mb29zZUZpbGVXb3Jrc3BhY2VNZXNzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gYWxsb3cgdW50cnVzdGVkIGZpbGVzIGluIHRoaXMgd29ya3NwYWNlP1wiKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ29wZW5Mb29zZUZpbGVXaW5kb3dNZXNzc2FnZScsIFwiRG8geW91IHdhbnQgdG8gYWxsb3cgdW50cnVzdGVkIGZpbGVzIGluIHRoaXMgd2luZG93P1wiKSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ29wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPcGVuXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoeyBjaGVja2JveENoZWNrZWQgfSkgPT4gdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLmNvbXBsZXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0KFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3BlbiwgISFjaGVja2JveENoZWNrZWQpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICduZXdXaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiT3BlbiBpbiAmJlJlc3RyaWN0ZWQgTW9kZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKHsgY2hlY2tib3hDaGVja2VkIH0pID0+IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdChXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW5Jbk5ld1dpbmRvdywgISFjaGVja2JveENoZWNrZWQpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdChXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLkNhbmNlbClcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2hlY2tib3g6IHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW5Mb29zZUZpbGVXb3Jrc3BhY2VDaGVja2JveCcsIFwiUmVtZW1iZXIgbXkgZGVjaXNpb24gZm9yIGFsbCB3b3Jrc3BhY2VzXCIpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogbWFya2Rvd25EZXRhaWxzLm1hcChtZCA9PiB7IHJldHVybiB7IG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobWQpIH07IH0pXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlc291cmNlcyB0cnVzdCByZXF1ZXN0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLm9uRGlkSW5pdGlhdGVSZXNvdXJjZXNUcnVzdFJlcXVlc3QoYXN5bmMgKG9wdGlvbnMpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VSZXNvbHZlZDtcblxuXHRcdFx0Ly8gRGV0YWlsc1xuXHRcdFx0Y29uc3QgbWFya2Rvd25EZXRhaWxzID0gW1xuXHRcdFx0XHRvcHRpb25zPy5tZXNzYWdlID8/IGxvY2FsaXplKCdyZXNvdXJjZXNUcnVzdERldGFpbHMnLCBcIllvdSBhcmUgdHJ5aW5nIHRvIG9wZW4gYW4gdW50cnVzdGVkIGZvbGRlci4gRG8geW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoaXMgY29udGVudD9cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdyZXNvdXJjZXNUcnVzdExlYXJuTW9yZScsIFwiSWYgeW91IGRvbid0IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZXNlIGZpbGVzLCB3ZSByZWNvbW1lbmQgbm90IGNvbnRpbnVpbmcgYXMgdGhlIGZpbGVzIG1heSBiZSBtYWxpY2lvdXMuIFNlZSBbb3VyIGRvY3NdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS13b3Jrc3BhY2UtdHJ1c3QpIHRvIGxlYXJuIG1vcmUuXCIpLFxuXHRcdFx0XHRgXFxgJHt0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChvcHRpb25zLnVyaSl9XFxgYFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnNUcnVzdE5vdGUgPSBnZXRTZXNzaW9uc1dpbmRvd1RydXN0Tm90ZSh0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSwgZmFsc2UpO1xuXHRcdFx0aWYgKHNlc3Npb25zVHJ1c3ROb3RlKSB7XG5cdFx0XHRcdG1hcmtkb3duRGV0YWlscy5wdXNoKHNlc3Npb25zVHJ1c3ROb3RlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGlhbG9nXG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PHZvaWQ+KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Jlc291cmNlc1RydXN0TWVzc2FnZScsIFwiRG8geW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGlzIGZvbGRlcj9cIiksXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICd0cnVzdFJlc291cmNlcycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRydXN0IEZvbGRlciAmIENvbnRpbnVlXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY29tcGxldGVSZXNvdXJjZXNUcnVzdFJlcXVlc3Qob3B0aW9ucy51cmksIFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UuT3Blbilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLmNvbXBsZXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0KG9wdGlvbnMudXJpLCBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLkNhbmNlbClcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBtYXJrZG93bkRldGFpbHMubWFwKG1kID0+IHsgcmV0dXJuIHsgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhtZCkgfTsgfSlcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV29ya3NwYWNlIHRydXN0IHJlcXVlc3Rcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2Uub25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdChhc3luYyByZXF1ZXN0T3B0aW9ucyA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlUmVzb2x2ZWQ7XG5cblx0XHRcdC8vIFRpdGxlXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy51c2VXb3Jrc3BhY2VMYW5ndWFnZSA/XG5cdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2VUcnVzdCcsIFwiRG8geW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGlzIHdvcmtzcGFjZT9cIikgOlxuXHRcdFx0XHRsb2NhbGl6ZSgnZm9sZGVyVHJ1c3QnLCBcIkRvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhpcyBmb2xkZXI/XCIpO1xuXG5cdFx0XHQvLyBNZXNzYWdlXG5cdFx0XHRjb25zdCBkZWZhdWx0RGV0YWlscyA9IGxvY2FsaXplKCdpbW1lZGlhdGVUcnVzdFJlcXVlc3RNZXNzYWdlJywgXCJBIGZlYXR1cmUgeW91IGFyZSB0cnlpbmcgdG8gdXNlIG1heSBiZSBhIHNlY3VyaXR5IHJpc2sgaWYgeW91IGRvIG5vdCB0cnVzdCB0aGUgc291cmNlIG9mIHRoZSBmaWxlcyBvciBmb2xkZXJzIHlvdSBjdXJyZW50bHkgaGF2ZSBvcGVuLlwiKTtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSByZXF1ZXN0T3B0aW9ucz8ubWVzc2FnZSA/PyBkZWZhdWx0RGV0YWlscztcblxuXHRcdFx0Ly8gQnV0dG9uc1xuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IHJlcXVlc3RPcHRpb25zPy5idXR0b25zID8/IFtcblx0XHRcdFx0eyBsYWJlbDogdGhpcy51c2VXb3Jrc3BhY2VMYW5ndWFnZSA/IGxvY2FsaXplKHsga2V5OiAnZ3JhbnRXb3Jrc3BhY2VUcnVzdEJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRydXN0IFdvcmtzcGFjZSAmIENvbnRpbnVlXCIpIDogbG9jYWxpemUoeyBrZXk6ICdncmFudEZvbGRlclRydXN0QnV0dG9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVHJ1c3QgRm9sZGVyICYgQ29udGludWVcIiksIHR5cGU6ICdDb250aW51ZVdpdGhUcnVzdCcgfSxcblx0XHRcdFx0eyBsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdtYW5hZ2VXb3Jrc3BhY2VUcnVzdEJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk1hbmFnZVwiKSwgdHlwZTogJ01hbmFnZScgfVxuXHRcdFx0XTtcblxuXHRcdFx0Ly8gQWRkIENhbmNlbCBidXR0b24gaWYgbm90IHByb3ZpZGVkXG5cdFx0XHRpZiAoIWJ1dHRvbnMuc29tZShiID0+IGIudHlwZSA9PT0gJ0NhbmNlbCcpKSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCh7IGxhYmVsOiBsb2NhbGl6ZSgnY2FuY2VsV29ya3NwYWNlVHJ1c3RCdXR0b24nLCBcIkNhbmNlbFwiKSwgdHlwZTogJ0NhbmNlbCcgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpYWxvZ1xuXHRcdFx0Y29uc3QgbWFya2Rvd25EZXRhaWxzID0gW1xuXHRcdFx0XHR7IG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcoZGV0YWlscykgfSxcblx0XHRcdFx0eyBtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdpbW1lZGlhdGVUcnVzdFJlcXVlc3RMZWFybk1vcmUnLCBcIklmIHlvdSBkb24ndCB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGVzZSBmaWxlcywgd2UgZG8gbm90IHJlY29tbWVuZCBjb250aW51aW5nIGFzIHRoZSBmaWxlcyBtYXkgYmUgbWFsaWNpb3VzLiBTZWUgW291ciBkb2NzXShodHRwczovL2FrYS5tcy92c2NvZGUtd29ya3NwYWNlLXRydXN0KSB0byBsZWFybiBtb3JlLlwiKSkgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHNlc3Npb25zVHJ1c3ROb3RlID0gZ2V0U2Vzc2lvbnNXaW5kb3dUcnVzdE5vdGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UsIHRoaXMudXNlV29ya3NwYWNlTGFuZ3VhZ2UpO1xuXHRcdFx0aWYgKHNlc3Npb25zVHJ1c3ROb3RlKSB7XG5cdFx0XHRcdG1hcmtkb3duRGV0YWlscy5wdXNoKHsgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhzZXNzaW9uc1RydXN0Tm90ZSkgfSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsc1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRidXR0b25zOiBidXR0b25zLmZpbHRlcihiID0+IGIudHlwZSAhPT0gJ0NhbmNlbCcpLm1hcChidXR0b24gPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogYnV0dG9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBidXR0b24udHlwZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246ICgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY2FuY2VsQnV0dG9uID0gYnV0dG9ucy5maW5kKGIgPT4gYi50eXBlID09PSAnQ2FuY2VsJyk7XG5cdFx0XHRcdFx0aWYgKCFjYW5jZWxCdXR0b24pIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiBjYW5jZWxCdXR0b24ubGFiZWwsXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IGNhbmNlbEJ1dHRvbi50eXBlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSkoKVxuXHRcdFx0fSk7XG5cblxuXHRcdFx0Ly8gRGlhbG9nIHJlc3VsdFxuXHRcdFx0c3dpdGNoIChyZXN1bHQpIHtcblx0XHRcdFx0Y2FzZSAnQ29udGludWVXaXRoVHJ1c3QnOlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCh0cnVlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnQ29udGludWVXaXRob3V0VHJ1c3QnOlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdNYW5hZ2UnOlxuXHRcdFx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jYW5jZWxXb3Jrc3BhY2VUcnVzdFJlcXVlc3QoKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1BTkFHRV9UUlVTVF9DT01NQU5EX0lEKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnQ2FuY2VsJzpcblx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY2FuY2VsV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cblxuLypcbiAqIFRydXN0IFVYIGFuZCBTdGFydHVwIEhhbmRsZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVRydXN0VVhIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZW50cnlJZCA9IGBzdGF0dXMud29ya3NwYWNlVHJ1c3RgO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyRW50cnlBY2Nlc3NvcjogTXV0YWJsZURpc3Bvc2FibGU8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJQmFubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJhbm5lclNlcnZpY2U6IElCYW5uZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zdGF0dXNiYXJFbnRyeUFjY2Vzc29yID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRcdChhc3luYyAoKSA9PiB7XG5cblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkO1xuXG5cdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c2JhckVudHJ5KHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cblx0XHRcdFx0Ly8gU2hvdyBtb2RhbCBkaWFsb2dcblx0XHRcdFx0aWYgKHRoaXMuaG9zdFNlcnZpY2UuaGFzRm9jdXMpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dNb2RhbE9uU3RhcnQoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBmb2N1c0Rpc3Bvc2FibGUgPSB0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXNlZCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHRcdFx0XHRmb2N1c0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNob3dNb2RhbE9uU3RhcnQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlID0+IHtcblx0XHRcdGlmIChlLmZyb21DYWNoZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWRkV29ya3NwYWNlRm9sZGVyID0gYXN5bmMgKGU6IElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHRydXN0ZWQgPSB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cblx0XHRcdFx0Ly8gV29ya3NwYWNlIGlzIHRydXN0ZWQgYW5kIHRoZXJlIGFyZSBhZGRlZC9jaGFuZ2VkIGZvbGRlcnNcblx0XHRcdFx0aWYgKHRydXN0ZWQgJiYgKGUuY2hhbmdlcy5hZGRlZC5sZW5ndGggfHwgZS5jaGFuZ2VzLmNoYW5nZWQubGVuZ3RoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGFkZGVkRm9sZGVyc1RydXN0SW5mbyA9IGF3YWl0IFByb21pc2UuYWxsKGUuY2hhbmdlcy5hZGRlZC5tYXAoZm9sZGVyID0+IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8oZm9sZGVyLnVyaSkpKTtcblxuXHRcdFx0XHRcdGlmICghYWRkZWRGb2xkZXJzVHJ1c3RJbmZvLm1hcChpbmZvID0+IGluZm8udHJ1c3RlZCkuZXZlcnkodHJ1c3RlZCA9PiB0cnVzdGVkKSkge1xuXHRcdFx0XHRcdFx0bGV0IGRldGFpbCA9IGxvY2FsaXplKCdhZGRXb3Jrc3BhY2VGb2xkZXJEZXRhaWwnLCBcIllvdSBhcmUgYWRkaW5nIGZpbGVzIHRoYXQgYXJlIG5vdCBjdXJyZW50bHkgdHJ1c3RlZCB0byBhIHRydXN0ZWQgd29ya3NwYWNlLiBEbyB5b3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlc2UgbmV3IGZpbGVzP1wiKTtcblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25zVHJ1c3ROb3RlID0gZ2V0U2Vzc2lvbnNXaW5kb3dUcnVzdE5vdGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UsIGZhbHNlKTtcblx0XHRcdFx0XHRcdGlmIChzZXNzaW9uc1RydXN0Tm90ZSkge1xuXHRcdFx0XHRcdFx0XHRkZXRhaWwgKz0gJ1xcblxcbicgKyBzZXNzaW9uc1RydXN0Tm90ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZGRXb3Jrc3BhY2VGb2xkZXJNZXNzYWdlJywgXCJEbyB5b3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoaXMgZm9sZGVyP1wiKSxcblx0XHRcdFx0XHRcdFx0ZGV0YWlsLFxuXHRcdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdubycsICdObycpLFxuXHRcdFx0XHRcdFx0XHRjdXN0b206IHsgaWNvbjogQ29kaWNvbi5zaGllbGQgfVxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdC8vIE1hcmsgYWRkZWQvY2hhbmdlZCBmb2xkZXJzIGFzIHRydXN0ZWRcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5zZXRVcmlzVHJ1c3QoYWRkZWRGb2xkZXJzVHJ1c3RJbmZvLm1hcChpID0+IGkudXJpKSwgY29uZmlybWVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBlLmpvaW4oYWRkV29ya3NwYWNlRm9sZGVyKGUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCh0cnVzdGVkID0+IHtcblx0XHRcdHRoaXMudXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyh0cnVzdGVkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2Uub25EaWRJbml0aWF0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdE9uU3RhcnR1cChhc3luYyAoKSA9PiB7XG5cblx0XHRcdGxldCB0aXRsZVN0cmluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGxlYXJuTW9yZVN0cmluZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHRydXN0T3B0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZG9udFRydXN0T3B0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBpc0FpR2VuZXJhdGVkV29ya3NwYWNlID0gYXdhaXQgdGhpcy5pc0FpR2VuZXJhdGVkV29ya3NwYWNlKCk7XG5cdFx0XHRpZiAoaXNBaUdlbmVyYXRlZFdvcmtzcGFjZSAmJiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmFpR2VuZXJhdGVkV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRcdFx0dGl0bGVTdHJpbmcgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmFpR2VuZXJhdGVkV29ya3NwYWNlVHJ1c3QudGl0bGU7XG5cdFx0XHRcdGxlYXJuTW9yZVN0cmluZyA9IHRoaXMucHJvZHVjdFNlcnZpY2UuYWlHZW5lcmF0ZWRXb3Jrc3BhY2VUcnVzdC5zdGFydHVwVHJ1c3RSZXF1ZXN0TGVhcm5Nb3JlO1xuXHRcdFx0XHR0cnVzdE9wdGlvbiA9IHRoaXMucHJvZHVjdFNlcnZpY2UuYWlHZW5lcmF0ZWRXb3Jrc3BhY2VUcnVzdC50cnVzdE9wdGlvbjtcblx0XHRcdFx0ZG9udFRydXN0T3B0aW9uID0gdGhpcy5wcm9kdWN0U2VydmljZS5haUdlbmVyYXRlZFdvcmtzcGFjZVRydXN0LmRvbnRUcnVzdE9wdGlvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignQUkgZ2VuZXJhdGVkIHdvcmtzcGFjZSB0cnVzdCBkaWFsb2cgY29udGVudHMgbm90IGF2YWlsYWJsZS4nKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB0aXRsZVN0cmluZyA/PyAodGhpcy51c2VXb3Jrc3BhY2VMYW5ndWFnZSA/XG5cdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2VUcnVzdCcsIFwiRG8geW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGlzIHdvcmtzcGFjZT9cIikgOlxuXHRcdFx0XHRsb2NhbGl6ZSgnZm9sZGVyVHJ1c3QnLCBcIkRvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhpcyBmb2xkZXI/XCIpKTtcblxuXHRcdFx0bGV0IGNoZWNrYm94VGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlSWRlbnRpZmllciA9IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTtcblx0XHRcdGNvbnN0IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlID0gaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3QgaXNFbXB0eVdpbmRvdyA9IGlzRW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKCFpc0FpR2VuZXJhdGVkV29ya3NwYWNlICYmIHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5jYW5TZXRQYXJlbnRGb2xkZXJUcnVzdCgpKSB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZSh1cmlEaXJuYW1lKCh3b3Jrc3BhY2VJZGVudGlmaWVyIGFzIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKS51cmkpKTtcblx0XHRcdFx0Y2hlY2tib3hUZXh0ID0gbG9jYWxpemUoJ2NoZWNrYm94U3RyaW5nJywgXCJUcnVzdCB0aGUgYXV0aG9ycyBvZiBhbGwgZmlsZXMgaW4gdGhlIHBhcmVudCBmb2xkZXIgJ3swfSdcIiwgbmFtZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNob3cgV29ya3NwYWNlIFRydXN0IFN0YXJ0IERpYWxvZ1xuXHRcdFx0Y29uc3QgbWFya2Rvd25TdHJpbmdzID0gW1xuXHRcdFx0XHQhaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2VTdGFydHVwVHJ1c3REZXRhaWxzJywgXCJ7MH0gcHJvdmlkZXMgZmVhdHVyZXMgdGhhdCBtYXkgYXV0b21hdGljYWxseSBleGVjdXRlIGZpbGVzIGluIHRoaXMgd29ya3NwYWNlLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdmb2xkZXJTdGFydHVwVHJ1c3REZXRhaWxzJywgXCJ7MH0gcHJvdmlkZXMgZmVhdHVyZXMgdGhhdCBtYXkgYXV0b21hdGljYWxseSBleGVjdXRlIGZpbGVzIGluIHRoaXMgZm9sZGVyLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCksXG5cdFx0XHRcdGxlYXJuTW9yZVN0cmluZyA/PyBsb2NhbGl6ZSgnc3RhcnR1cFRydXN0UmVxdWVzdExlYXJuTW9yZScsIFwiSWYgeW91IGRvbid0IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZXNlIGZpbGVzLCB3ZSByZWNvbW1lbmQgdG8gY29udGludWUgaW4gcmVzdHJpY3RlZCBtb2RlIGFzIHRoZSBmaWxlcyBtYXkgYmUgbWFsaWNpb3VzLiBTZWUgW291ciBkb2NzXShodHRwczovL2FrYS5tcy92c2NvZGUtd29ya3NwYWNlLXRydXN0KSB0byBsZWFybiBtb3JlLlwiKSxcblx0XHRcdFx0IWlzRW1wdHlXaW5kb3cgP1xuXHRcdFx0XHRcdGBcXGAke3RoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZUlkZW50aWZpZXIsIHsgdmVyYm9zZTogVmVyYm9zaXR5LkxPTkcgfSl9XFxgYCA6ICcnLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHNlc3Npb25zVHJ1c3ROb3RlID0gZ2V0U2Vzc2lvbnNXaW5kb3dUcnVzdE5vdGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UsICFpc1NpbmdsZUZvbGRlcldvcmtzcGFjZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbnNUcnVzdE5vdGUpIHtcblx0XHRcdFx0bWFya2Rvd25TdHJpbmdzLnB1c2goc2Vzc2lvbnNUcnVzdE5vdGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kb1Nob3dNb2RhbChcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdHsgbGFiZWw6IHRydXN0T3B0aW9uID8/IGxvY2FsaXplKHsga2V5OiAndHJ1c3RPcHRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZZZXMsIEkgdHJ1c3QgdGhlIGF1dGhvcnNcIiksIHN1YmxhYmVsOiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZSA/IGxvY2FsaXplKCd0cnVzdEZvbGRlck9wdGlvbkRlc2NyaXB0aW9uJywgXCJUcnVzdCBmb2xkZXIgYW5kIGVuYWJsZSBhbGwgZmVhdHVyZXNcIikgOiBsb2NhbGl6ZSgndHJ1c3RXb3Jrc3BhY2VPcHRpb25EZXNjcmlwdGlvbicsIFwiVHJ1c3Qgd29ya3NwYWNlIGFuZCBlbmFibGUgYWxsIGZlYXR1cmVzXCIpIH0sXG5cdFx0XHRcdHsgbGFiZWw6IGRvbnRUcnVzdE9wdGlvbiA/PyBsb2NhbGl6ZSh7IGtleTogJ2RvbnRUcnVzdE9wdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk5vLCBJIGRvbid0IHRydXN0IHRoZSBhdXRob3JzXCIpLCBzdWJsYWJlbDogaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UgPyBsb2NhbGl6ZSgnZG9udFRydXN0Rm9sZGVyT3B0aW9uRGVzY3JpcHRpb24nLCBcIk9wZW4gZm9sZGVyIGluIHJlc3RyaWN0ZWQgbW9kZVwiKSA6IGxvY2FsaXplKCdkb250VHJ1c3RXb3Jrc3BhY2VPcHRpb25EZXNjcmlwdGlvbicsIFwiT3BlbiB3b3Jrc3BhY2UgaW4gcmVzdHJpY3RlZCBtb2RlXCIpIH0sXG5cdFx0XHRcdG1hcmtkb3duU3RyaW5ncyxcblx0XHRcdFx0Y2hlY2tib3hUZXh0XG5cdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyh0cnVzdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFubmVySXRlbSA9IHRoaXMuZ2V0QmFubmVySXRlbSghdHJ1c3RlZCk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0YXR1c2JhckVudHJ5KHRydXN0ZWQpO1xuXG5cdFx0aWYgKGJhbm5lckl0ZW0pIHtcblx0XHRcdGlmICghdHJ1c3RlZCkge1xuXHRcdFx0XHR0aGlzLmJhbm5lclNlcnZpY2Uuc2hvdyhiYW5uZXJJdGVtKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYmFubmVyU2VydmljZS5oaWRlKEJBTk5FUl9SRVNUUklDVEVEX01PREUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI3JlZ2lvbiBEaWFsb2dcblxuXHRwcml2YXRlIGFzeW5jIGRvU2hvd01vZGFsKHF1ZXN0aW9uOiBzdHJpbmcsIHRydXN0ZWRPcHRpb246IHsgbGFiZWw6IHN0cmluZzsgc3VibGFiZWw6IHN0cmluZyB9LCB1bnRydXN0ZWRPcHRpb246IHsgbGFiZWw6IHN0cmluZzsgc3VibGFiZWw6IHN0cmluZyB9LCBtYXJrZG93blN0cmluZ3M6IHN0cmluZ1tdLCB0cnVzdFBhcmVudFN0cmluZz86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IHF1ZXN0aW9uLFxuXHRcdFx0Y2hlY2tib3g6IHRydXN0UGFyZW50U3RyaW5nID8ge1xuXHRcdFx0XHRsYWJlbDogdHJ1c3RQYXJlbnRTdHJpbmdcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogdHJ1c3RlZE9wdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRydW46IGFzeW5jICh7IGNoZWNrYm94Q2hlY2tlZCB9KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5zZXRQYXJlbnRGb2xkZXJUcnVzdCh0cnVlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZVdvcmtzcGFjZVRydXN0UmVxdWVzdCh0cnVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogdW50cnVzdGVkT3B0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JrYmVuY2hJbmRpY2F0b3JzKGZhbHNlKTtcblx0XHRcdFx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jYW5jZWxXb3Jrc3BhY2VUcnVzdFJlcXVlc3QoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjdXN0b206IHtcblx0XHRcdFx0YnV0dG9uRGV0YWlsczogW1xuXHRcdFx0XHRcdHRydXN0ZWRPcHRpb24uc3VibGFiZWwsXG5cdFx0XHRcdFx0dW50cnVzdGVkT3B0aW9uLnN1YmxhYmVsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRpc2FibGVDbG9zZUFjdGlvbjogdHJ1ZSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdFx0XHRcdG1hcmtkb3duRGV0YWlsczogbWFya2Rvd25TdHJpbmdzLm1hcChtZCA9PiB7IHJldHVybiB7IG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobWQpIH07IH0pXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUQVJUVVBfUFJPTVBUX1NIT1dOX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd01vZGFsT25TdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtiZW5jaEluZGljYXRvcnModHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyBtb2RhbCBwcm9tcHQgaWYgd29ya3NwYWNlIHRydXN0IGNhbm5vdCBiZSBjaGFuZ2VkXG5cdFx0aWYgKCEodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmNhblNldFdvcmtzcGFjZVRydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyBtb2RhbCBwcm9tcHQgZm9yIHZpcnR1YWwgd29ya3NwYWNlcyBieSBkZWZhdWx0XG5cdFx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSkge1xuXHRcdFx0dGhpcy51cGRhdGVXb3JrYmVuY2hJbmRpY2F0b3JzKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBzaG93IG1vZGFsIHByb21wdCBmb3IgZW1wdHkgd29ya3NwYWNlcyBieSBkZWZhdWx0XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHRoaXMudXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyhmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhcnR1cFByb21wdFNldHRpbmcgPT09ICduZXZlcicpIHtcblx0XHRcdHRoaXMudXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyhmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhcnR1cFByb21wdFNldHRpbmcgPT09ICdvbmNlJyAmJiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oU1RBUlRVUF9QUk9NUFRfU0hPV05fS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSkpIHtcblx0XHRcdHRoaXMudXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyhmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIHRoZSB3b3Jrc3BhY2UgdHJ1c3QgcmVxdWVzdCBzZXJ2aWNlIHRvIHNob3cgbW9kYWwgZGlhbG9nXG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdE9uU3RhcnR1cCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc3RhcnR1cFByb21wdFNldHRpbmcoKTogJ2Fsd2F5cycgfCAnb25jZScgfCAnbmV2ZXInIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShXT1JLU1BBQ0VfVFJVU1RfU1RBUlRVUF9QUk9NUFQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdXNlV29ya3NwYWNlTGFuZ3VhZ2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIodG9Xb3Jrc3BhY2VJZGVudGlmaWVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaXNBaUdlbmVyYXRlZFdvcmtzcGFjZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBhaUdlbmVyYXRlZFdvcmtzcGFjZXMgPSBVUkkuam9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsICdhaUdlbmVyYXRlZFdvcmtzcGFjZXMuanNvbicpO1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhhaUdlbmVyYXRlZFdvcmtzcGFjZXMpLnRoZW4oYXN5bmMgcmVzdWx0ID0+IHtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShhaUdlbmVyYXRlZFdvcmtzcGFjZXMpO1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZXMgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSkgYXMgc3RyaW5nW107XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZXMuaW5kZXhPZih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCkpID4gLTEpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIElnbm9yZSBlcnJvcnMgd2hlbiByZXNvbHZpbmcgZmlsZSBjb250ZW50c1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQmFubmVyXG5cblx0cHJpdmF0ZSBnZXRCYW5uZXJJdGVtKHJlc3RyaWN0ZWRNb2RlOiBib29sZWFuKTogSUJhbm5lckl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRpc21pc3NlZFJlc3RyaWN0ZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQkFOTkVSX1JFU1RSSUNURURfTU9ERV9ESVNNSVNTRURfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSk7XG5cblx0XHQvLyBuZXZlciBzaG93IHRoZSBiYW5uZXJcblx0XHRpZiAodGhpcy5iYW5uZXJTZXR0aW5nID09PSAnbmV2ZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIGluZm8gaGFzIGJlZW4gZGlzbWlzc2VkXG5cdFx0aWYgKHRoaXMuYmFubmVyU2V0dGluZyA9PT0gJ3VudGlsRGlzbWlzc2VkJyAmJiBkaXNtaXNzZWRSZXN0cmljdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnMgPVxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXN0cmljdGVkTW9kZUJhbm5lck1hbmFnZScsIFwiTWFuYWdlXCIpLFxuXHRcdFx0XHRcdGhyZWY6ICdjb21tYW5kOicgKyBNQU5BR0VfVFJVU1RfQ09NTUFORF9JRFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXN0cmljdGVkTW9kZUJhbm5lckxlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0XHRocmVmOiAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdvcmtzcGFjZS10cnVzdCdcblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogQkFOTkVSX1JFU1RSSUNURURfTU9ERSxcblx0XHRcdGljb246IHNoaWVsZEljb24sXG5cdFx0XHRhcmlhTGFiZWw6IHRoaXMuZ2V0QmFubmVySXRlbUFyaWFMYWJlbHMoKSxcblx0XHRcdG1lc3NhZ2U6IHRoaXMuZ2V0QmFubmVySXRlbU1lc3NhZ2VzKCksXG5cdFx0XHRhY3Rpb25zLFxuXHRcdFx0b25DbG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzdHJpY3RlZE1vZGUpIHtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEJBTk5FUl9SRVNUUklDVEVEX01PREVfRElTTUlTU0VEX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldEJhbm5lckl0ZW1BcmlhTGFiZWxzKCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRU1QVFk6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVzdHJpY3RlZE1vZGVCYW5uZXJBcmlhTGFiZWxXaW5kb3cnLCBcIlJlc3RyaWN0ZWQgTW9kZSBpcyBpbnRlbmRlZCBmb3Igc2FmZSBjb2RlIGJyb3dzaW5nLiBUcnVzdCB0aGlzIHdpbmRvdyB0byBlbmFibGUgYWxsIGZlYXR1cmVzLiBVc2UgbmF2aWdhdGlvbiBrZXlzIHRvIGFjY2VzcyBiYW5uZXIgYWN0aW9ucy5cIik7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXN0cmljdGVkTW9kZUJhbm5lckFyaWFMYWJlbEZvbGRlcicsIFwiUmVzdHJpY3RlZCBNb2RlIGlzIGludGVuZGVkIGZvciBzYWZlIGNvZGUgYnJvd3NpbmcuIFRydXN0IHRoaXMgZm9sZGVyIHRvIGVuYWJsZSBhbGwgZmVhdHVyZXMuIFVzZSBuYXZpZ2F0aW9uIGtleXMgdG8gYWNjZXNzIGJhbm5lciBhY3Rpb25zLlwiKTtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Jlc3RyaWN0ZWRNb2RlQmFubmVyQXJpYUxhYmVsV29ya3NwYWNlJywgXCJSZXN0cmljdGVkIE1vZGUgaXMgaW50ZW5kZWQgZm9yIHNhZmUgY29kZSBicm93c2luZy4gVHJ1c3QgdGhpcyB3b3Jrc3BhY2UgdG8gZW5hYmxlIGFsbCBmZWF0dXJlcy4gVXNlIG5hdmlnYXRpb24ga2V5cyB0byBhY2Nlc3MgYmFubmVyIGFjdGlvbnMuXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0QmFubmVySXRlbU1lc3NhZ2VzKCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRU1QVFk6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVzdHJpY3RlZE1vZGVCYW5uZXJNZXNzYWdlV2luZG93JywgXCJSZXN0cmljdGVkIE1vZGUgaXMgaW50ZW5kZWQgZm9yIHNhZmUgY29kZSBicm93c2luZy4gVHJ1c3QgdGhpcyB3aW5kb3cgdG8gZW5hYmxlIGFsbCBmZWF0dXJlcy5cIik7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXN0cmljdGVkTW9kZUJhbm5lck1lc3NhZ2VGb2xkZXInLCBcIlJlc3RyaWN0ZWQgTW9kZSBpcyBpbnRlbmRlZCBmb3Igc2FmZSBjb2RlIGJyb3dzaW5nLiBUcnVzdCB0aGlzIGZvbGRlciB0byBlbmFibGUgYWxsIGZlYXR1cmVzLlwiKTtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Jlc3RyaWN0ZWRNb2RlQmFubmVyTWVzc2FnZVdvcmtzcGFjZScsIFwiUmVzdHJpY3RlZCBNb2RlIGlzIGludGVuZGVkIGZvciBzYWZlIGNvZGUgYnJvd3NpbmcuIFRydXN0IHRoaXMgd29ya3NwYWNlIHRvIGVuYWJsZSBhbGwgZmVhdHVyZXMuXCIpO1xuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBnZXQgYmFubmVyU2V0dGluZygpOiAnYWx3YXlzJyB8ICd1bnRpbERpc21pc3NlZCcgfCAnbmV2ZXInIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhbHdheXMnIHwgJ3VudGlsRGlzbWlzc2VkJyB8ICduZXZlcic+KFdPUktTUEFDRV9UUlVTVF9CQU5ORVIpO1xuXG5cdFx0Ly8gSW4gc2VydmVybGVzcyBlbnZpcm9ubWVudHMsIHdlIGRvbid0IG5lZWQgdG8gYWdncmVzc2l2ZWx5IHNob3cgdGhlIGJhbm5lclxuXHRcdGlmIChyZXN1bHQgIT09ICdhbHdheXMnICYmIGlzV2ViICYmICF0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk/LnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuICduZXZlcic7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTdGF0dXNiYXJcblxuXHRwcml2YXRlIGdldFJlc3RyaWN0ZWRNb2RlU3RhdHVzYmFyRW50cnkoKTogSVN0YXR1c2JhckVudHJ5IHtcblx0XHRsZXQgYXJpYUxhYmVsID0gJyc7XG5cdFx0bGV0IHRvb2xUaXA6IElNYXJrZG93blN0cmluZyB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSkge1xuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5FTVBUWToge1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnc3RhdHVzLmFyaWFVbnRydXN0ZWRXaW5kb3cnLCBcIlJlc3RyaWN0ZWQgTW9kZTogU29tZSBmZWF0dXJlcyBhcmUgZGlzYWJsZWQgYmVjYXVzZSB0aGlzIHdpbmRvdyBpcyBub3QgdHJ1c3RlZC5cIik7XG5cdFx0XHRcdHRvb2xUaXAgPSB7XG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdzdGF0dXMudG9vbHRpcFVudHJ1c3RlZFdpbmRvdzInLCBjb21tZW50OiBbJ1thYmNdKHtufSkgYXJlIGxpbmtzLiAgT25seSB0cmFuc2xhdGUgYGZlYXR1cmVzIGFyZSBkaXNhYmxlZGAgYW5kIGB3aW5kb3cgaXMgbm90IHRydXN0ZWRgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7bn0nXSB9LFxuXHRcdFx0XHRcdFx0XCJSdW5uaW5nIGluIFJlc3RyaWN0ZWQgTW9kZVxcblxcblNvbWUgW2ZlYXR1cmVzIGFyZSBkaXNhYmxlZF0oezB9KSBiZWNhdXNlIHRoaXMgW3dpbmRvdyBpcyBub3QgdHJ1c3RlZF0oezF9KS5cIixcblx0XHRcdFx0XHRcdGBjb21tYW5kOiR7TElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lEfWAsXG5cdFx0XHRcdFx0XHRgY29tbWFuZDoke01BTkFHRV9UUlVTVF9DT01NQU5EX0lEfWBcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRk9MREVSOiB7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdzdGF0dXMuYXJpYVVudHJ1c3RlZEZvbGRlcicsIFwiUmVzdHJpY3RlZCBNb2RlOiBTb21lIGZlYXR1cmVzIGFyZSBkaXNhYmxlZCBiZWNhdXNlIHRoaXMgZm9sZGVyIGlzIG5vdCB0cnVzdGVkLlwiKTtcblx0XHRcdFx0dG9vbFRpcCA9IHtcblx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHR7IGtleTogJ3N0YXR1cy50b29sdGlwVW50cnVzdGVkRm9sZGVyMicsIGNvbW1lbnQ6IFsnW2FiY10oe259KSBhcmUgbGlua3MuICBPbmx5IHRyYW5zbGF0ZSBgZmVhdHVyZXMgYXJlIGRpc2FibGVkYCBhbmQgYGZvbGRlciBpcyBub3QgdHJ1c3RlZGAuIERvIG5vdCBjaGFuZ2UgYnJhY2tldHMgYW5kIHBhcmVudGhlc2VzIG9yIHtufSddIH0sXG5cdFx0XHRcdFx0XHRcIlJ1bm5pbmcgaW4gUmVzdHJpY3RlZCBNb2RlXFxuXFxuU29tZSBbZmVhdHVyZXMgYXJlIGRpc2FibGVkXSh7MH0pIGJlY2F1c2UgdGhpcyBbZm9sZGVyIGlzIG5vdCB0cnVzdGVkXSh7MX0pLlwiLFxuXHRcdFx0XHRcdFx0YGNvbW1hbmQ6JHtMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUR9YCxcblx0XHRcdFx0XHRcdGBjb21tYW5kOiR7TUFOQUdFX1RSVVNUX0NPTU1BTkRfSUR9YFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0aXNUcnVzdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U6IHtcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ3N0YXR1cy5hcmlhVW50cnVzdGVkV29ya3NwYWNlJywgXCJSZXN0cmljdGVkIE1vZGU6IFNvbWUgZmVhdHVyZXMgYXJlIGRpc2FibGVkIGJlY2F1c2UgdGhpcyB3b3Jrc3BhY2UgaXMgbm90IHRydXN0ZWQuXCIpO1xuXHRcdFx0XHR0b29sVGlwID0ge1xuXHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdHsga2V5OiAnc3RhdHVzLnRvb2x0aXBVbnRydXN0ZWRXb3Jrc3BhY2UyJywgY29tbWVudDogWydbYWJjXSh7bn0pIGFyZSBsaW5rcy4gT25seSB0cmFuc2xhdGUgYGZlYXR1cmVzIGFyZSBkaXNhYmxlZGAgYW5kIGB3b3Jrc3BhY2UgaXMgbm90IHRydXN0ZWRgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7bn0nXSB9LFxuXHRcdFx0XHRcdFx0XCJSdW5uaW5nIGluIFJlc3RyaWN0ZWQgTW9kZVxcblxcblNvbWUgW2ZlYXR1cmVzIGFyZSBkaXNhYmxlZF0oezB9KSBiZWNhdXNlIHRoaXMgW3dvcmtzcGFjZSBpcyBub3QgdHJ1c3RlZF0oezF9KS5cIixcblx0XHRcdFx0XHRcdGBjb21tYW5kOiR7TElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lEfWAsXG5cdFx0XHRcdFx0XHRgY29tbWFuZDoke01BTkFHRV9UUlVTVF9DT01NQU5EX0lEfWBcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5Xb3Jrc3BhY2VUcnVzdCcsIFwiV29ya3NwYWNlIFRydXN0XCIpLFxuXHRcdFx0dGV4dDogYCQoc2hpZWxkKSAke2xvY2FsaXplKCd1bnRydXN0ZWQnLCBcIlJlc3RyaWN0ZWQgTW9kZVwiKX1gLFxuXHRcdFx0YXJpYUxhYmVsOiBhcmlhTGFiZWwsXG5cdFx0XHR0b29sdGlwOiB0b29sVGlwLFxuXHRcdFx0Y29tbWFuZDogTUFOQUdFX1RSVVNUX0NPTU1BTkRfSUQsXG5cdFx0XHRraW5kOiAncHJvbWluZW50J1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1c2JhckVudHJ5KHRydXN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodHJ1c3RlZCAmJiB0aGlzLnN0YXR1c2JhckVudHJ5QWNjZXNzb3IudmFsdWUpIHtcblx0XHRcdHRoaXMuc3RhdHVzYmFyRW50cnlBY2Nlc3Nvci5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdHJ1c3RlZCAmJiAhdGhpcy5zdGF0dXNiYXJFbnRyeUFjY2Vzc29yLnZhbHVlKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZ2V0UmVzdHJpY3RlZE1vZGVTdGF0dXNiYXJFbnRyeSgpO1xuXHRcdFx0dGhpcy5zdGF0dXNiYXJFbnRyeUFjY2Vzc29yLnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KGVudHJ5LCB0aGlzLmVudHJ5SWQsIFN0YXR1c2JhckFsaWdubWVudC5MRUZULCB7IGxvY2F0aW9uOiB7IGlkOiAnc3RhdHVzLmhvc3QnLCBwcmlvcml0eTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIH0sIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoV29ya3NwYWNlVHJ1c3RSZXF1ZXN0SGFuZGxlci5JRCwgV29ya3NwYWNlVHJ1c3RSZXF1ZXN0SGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihXb3Jrc3BhY2VUcnVzdFVYSGFuZGxlciwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG5cbi8qKlxuICogVHJ1c3RlZCBXb3Jrc3BhY2UgR1VJIEVkaXRvclxuICovXG5jbGFzcyBXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblxuXHRjYW5TZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXJpYWxpemUoaW5wdXQ6IFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dCk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KVxuXHQucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQuSUQsIFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRXb3Jrc3BhY2VUcnVzdEVkaXRvcixcblx0XHRXb3Jrc3BhY2VUcnVzdEVkaXRvci5JRCxcblx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlVHJ1c3RFZGl0b3InLCBcIldvcmtzcGFjZSBUcnVzdCBFZGl0b3JcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5cbi8qXG4gKiBBY3Rpb25zXG4gKi9cblxuLy8gQ29uZmlndXJlIFdvcmtzcGFjZSBUcnVzdCBTZXR0aW5nc1xuXG5jb25zdCBDT05GSUdVUkVfVFJVU1RfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2gudHJ1c3QuY29uZmlndXJlJztcbmNvbnN0IFdPUktTUEFDRVNfQ0FURUdPUlkgPSBsb2NhbGl6ZTIoJ3dvcmtzcGFjZXNDYXRlZ29yeScsICdXb3Jrc3BhY2VzJyk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09ORklHVVJFX1RSVVNUX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmVXb3Jrc3BhY2VUcnVzdFNldHRpbmdzJywgXCJDb25maWd1cmUgV29ya3NwYWNlIFRydXN0IFNldHRpbmdzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya3NwYWNlVHJ1c3RDb250ZXh0LklzRW5hYmxlZCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtXT1JLU1BBQ0VfVFJVU1RfRU5BQkxFRH1gLCB0cnVlKSksXG5cdFx0XHRjYXRlZ29yeTogV09SS1NQQUNFU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSkub3BlblVzZXJTZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogYEB0YWc6JHtXT1JLU1BBQ0VfVFJVU1RfU0VUVElOR19UQUd9YCB9KTtcblx0fVxufSk7XG5cbi8vIE1hbmFnZSBXb3Jrc3BhY2UgVHJ1c3RcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNQU5BR0VfVFJVU1RfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZVdvcmtzcGFjZVRydXN0JywgXCJNYW5hZ2UgV29ya3NwYWNlIFRydXN0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya3NwYWNlVHJ1c3RDb250ZXh0LklzRW5hYmxlZCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtXT1JLU1BBQ0VfVFJVU1RfRU5BQkxFRH1gLCB0cnVlKSksXG5cdFx0XHRjYXRlZ29yeTogV09SS1NQQUNFU19DQVRFR09SWSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dCk7XG5cblx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdHJldHVybjtcblx0fVxufSk7XG5cblxuLypcbiAqIENvbmZpZ3VyYXRpb25cbiAqL1xuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0Li4uc2VjdXJpdHlDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0W1dPUktTUEFDRV9UUlVTVF9FTkFCTEVEXToge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIG9yIG5vdCBXb3Jrc3BhY2UgVHJ1c3QgaXMgZW5hYmxlZCB3aXRoaW4gVlMgQ29kZS5cIiksXG5cdFx0XHRcdHRhZ3M6IFtXT1JLU1BBQ0VfVFJVU1RfU0VUVElOR19UQUddLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0fSxcblx0XHRcdFtXT1JLU1BBQ0VfVFJVU1RfU1RBUlRVUF9QUk9NUFRdOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZWZhdWx0OiAnbmV2ZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5zdGFydHVwUHJvbXB0LmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGVuIHRoZSBzdGFydHVwIHByb21wdCB0byB0cnVzdCBhIHdvcmtzcGFjZSBpcyBzaG93bi5cIiksXG5cdFx0XHRcdHRhZ3M6IFtXT1JLU1BBQ0VfVFJVU1RfU0VUVElOR19UQUddLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdvbmNlJywgJ25ldmVyJ10sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LnN0YXJ0dXBQcm9tcHQuYWx3YXlzJywgXCJBc2sgZm9yIHRydXN0IGV2ZXJ5IHRpbWUgYW4gdW50cnVzdGVkIHdvcmtzcGFjZSBpcyBvcGVuZWQuXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3Quc3RhcnR1cFByb21wdC5vbmNlJywgXCJBc2sgZm9yIHRydXN0IHRoZSBmaXJzdCB0aW1lIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UgaXMgb3BlbmVkLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LnN0YXJ0dXBQcm9tcHQubmV2ZXInLCBcIkRvIG5vdCBhc2sgZm9yIHRydXN0IHdoZW4gYW4gdW50cnVzdGVkIHdvcmtzcGFjZSBpcyBvcGVuZWQuXCIpLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0W1dPUktTUEFDRV9UUlVTVF9CQU5ORVJdOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZWZhdWx0OiAndW50aWxEaXNtaXNzZWQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5iYW5uZXIuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZW4gdGhlIHJlc3RyaWN0ZWQgbW9kZSBiYW5uZXIgaXMgc2hvd24uXCIpLFxuXHRcdFx0XHR0YWdzOiBbV09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0ZW51bTogWydhbHdheXMnLCAndW50aWxEaXNtaXNzZWQnLCAnbmV2ZXInXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3QuYmFubmVyLmFsd2F5cycsIFwiU2hvdyB0aGUgYmFubmVyIGV2ZXJ5IHRpbWUgYW4gdW50cnVzdGVkIHdvcmtzcGFjZSBpcyBvcGVuLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LmJhbm5lci51bnRpbERpc21pc3NlZCcsIFwiU2hvdyB0aGUgYmFubmVyIHdoZW4gYW4gdW50cnVzdGVkIHdvcmtzcGFjZSBpcyBvcGVuZWQgdW50aWwgZGlzbWlzc2VkLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LmJhbm5lci5uZXZlcicsIFwiRG8gbm90IHNob3cgdGhlIGJhbm5lciB3aGVuIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UgaXMgb3Blbi5cIiksXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRbV09SS1NQQUNFX1RSVVNUX1VOVFJVU1RFRF9GSUxFU106IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlZmF1bHQ6ICdwcm9tcHQnLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LnVudHJ1c3RlZEZpbGVzLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyBob3cgdG8gaGFuZGxlIG9wZW5pbmcgdW50cnVzdGVkIGZpbGVzIGluIGEgdHJ1c3RlZCB3b3Jrc3BhY2UuIFRoaXMgc2V0dGluZyBhbHNvIGFwcGxpZXMgdG8gb3BlbmluZyBmaWxlcyBpbiBhbiBlbXB0eSB3aW5kb3cgd2hpY2ggaXMgdHJ1c3RlZCB2aWEgYCN7MH0jYC5cIiwgV09SS1NQQUNFX1RSVVNUX0VNUFRZX1dJTkRPVyksXG5cdFx0XHRcdHRhZ3M6IFtXT1JLU1BBQ0VfVFJVU1RfU0VUVElOR19UQUddLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHRlbnVtOiBbJ3Byb21wdCcsICdvcGVuJywgJ25ld1dpbmRvdyddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC51bnRydXN0ZWRGaWxlcy5wcm9tcHQnLCBcIkFzayBob3cgdG8gaGFuZGxlIHVudHJ1c3RlZCBmaWxlcyBmb3IgZWFjaCB3b3Jrc3BhY2UuIE9uY2UgdW50cnVzdGVkIGZpbGVzIGFyZSBpbnRyb2R1Y2VkIHRvIGEgdHJ1c3RlZCB3b3Jrc3BhY2UsIHlvdSB3aWxsIG5vdCBiZSBwcm9tcHRlZCBhZ2Fpbi5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC51bnRydXN0ZWRGaWxlcy5vcGVuJywgXCJBbHdheXMgYWxsb3cgdW50cnVzdGVkIGZpbGVzIHRvIGJlIGludHJvZHVjZWQgdG8gYSB0cnVzdGVkIHdvcmtzcGFjZSB3aXRob3V0IHByb21wdGluZy5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC51bnRydXN0ZWRGaWxlcy5uZXdXaW5kb3cnLCBcIkFsd2F5cyBvcGVuIHVudHJ1c3RlZCBmaWxlcyBpbiBhIHNlcGFyYXRlIHdpbmRvdyBpbiByZXN0cmljdGVkIG1vZGUgd2l0aG91dCBwcm9tcHRpbmcuXCIpLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0W1dPUktTUEFDRV9UUlVTVF9FTVBUWV9XSU5ET1ddOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5lbXB0eVdpbmRvdy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBvciBub3QgdGhlIGVtcHR5IHdpbmRvdyBpcyB0cnVzdGVkIGJ5IGRlZmF1bHQgd2l0aGluIFZTIENvZGUuIFdoZW4gdXNlZCB3aXRoIGAjezB9I2AsIHlvdSBjYW4gZW5hYmxlIHRoZSBmdWxsIGZ1bmN0aW9uYWxpdHkgb2YgVlMgQ29kZSB3aXRob3V0IHByb21wdGluZyBpbiBhbiBlbXB0eSB3aW5kb3cuXCIsIFdPUktTUEFDRV9UUlVTVF9VTlRSVVNURURfRklMRVMpLFxuXHRcdFx0XHR0YWdzOiBbV09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTlxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cbmNsYXNzIFdvcmtzcGFjZVRydXN0VGVsZW1ldHJ5Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMubG9nSW5pdGlhbFdvcmtzcGFjZVRydXN0SW5mbygpO1xuXHRcdFx0XHR0aGlzLmxvZ1dvcmtzcGFjZVRydXN0KHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoaXNUcnVzdGVkID0+IHRoaXMubG9nV29ya3NwYWNlVHJ1c3QoaXNUcnVzdGVkKSkpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGxvZ0luaXRpYWxXb3Jrc3BhY2VUcnVzdEluZm8oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRCeUNsaUZsYWcgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5kaXNhYmxlV29ya3NwYWNlVHJ1c3Q7XG5cblx0XHRcdHR5cGUgV29ya3NwYWNlVHJ1c3REaXNhYmxlZEV2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnc2JhdHRlbic7XG5cdFx0XHRcdGNvbW1lbnQ6ICdMb2dnZWQgd2hlbiB3b3Jrc3BhY2UgdHJ1c3QgaXMgZGlzYWJsZWQnO1xuXHRcdFx0XHRyZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcmVhc29uIHdvcmtzcGFjZSB0cnVzdCBpcyBkaXNhYmxlZC4gZS5nLiBjbGkgb3Igc2V0dGluZycgfTtcblx0XHRcdH07XG5cblx0XHRcdHR5cGUgV29ya3NwYWNlVHJ1c3REaXNhYmxlZEV2ZW50ID0ge1xuXHRcdFx0XHRyZWFzb246ICdzZXR0aW5nJyB8ICdjbGknO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya3NwYWNlVHJ1c3REaXNhYmxlZEV2ZW50LCBXb3Jrc3BhY2VUcnVzdERpc2FibGVkRXZlbnRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZVRydXN0RGlzYWJsZWQnLCB7XG5cdFx0XHRcdHJlYXNvbjogZGlzYWJsZWRCeUNsaUZsYWcgPyAnY2xpJyA6ICdzZXR0aW5nJ1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHlwZSBXb3Jrc3BhY2VUcnVzdEluZm9FdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYmF0dGVuJztcblx0XHRcdGNvbW1lbnQ6ICdJbmZvcm1hdGlvbiBhYm91dCB0aGUgd29ya3NwYWNlcyB0cnVzdGVkIG9uIHRoZSBtYWNoaW5lJztcblx0XHRcdHRydXN0ZWRGb2xkZXJzQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHRydXN0ZWQgZm9sZGVycyBvbiB0aGUgbWFjaGluZScgfTtcblx0XHR9O1xuXG5cdFx0dHlwZSBXb3Jrc3BhY2VUcnVzdEluZm9FdmVudCA9IHtcblx0XHRcdHRydXN0ZWRGb2xkZXJzQ291bnQ6IG51bWJlcjtcblx0XHR9O1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya3NwYWNlVHJ1c3RJbmZvRXZlbnQsIFdvcmtzcGFjZVRydXN0SW5mb0V2ZW50Q2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2VUcnVzdEZvbGRlckNvdW50cycsIHtcblx0XHRcdHRydXN0ZWRGb2xkZXJzQ291bnQ6IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRUcnVzdGVkVXJpcygpLmxlbmd0aCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9nV29ya3NwYWNlVHJ1c3QoaXNUcnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHR5cGUgV29ya3NwYWNlVHJ1c3RTdGF0ZUNoYW5nZWRFdmVudCA9IHtcblx0XHRcdHdvcmtzcGFjZUlkOiBzdHJpbmc7XG5cdFx0XHRpc1RydXN0ZWQ6IGJvb2xlYW47XG5cdFx0fTtcblxuXHRcdHR5cGUgV29ya3NwYWNlVHJ1c3RTdGF0ZUNoYW5nZWRFdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYmF0dGVuJztcblx0XHRcdGNvbW1lbnQ6ICdMb2dnZWQgd2hlbiB0aGUgd29ya3NwYWNlIHRyYW5zaXRpb25zIGJldHdlZW4gdHJ1c3RlZCBhbmQgcmVzdHJpY3RlZCBtb2Rlcyc7XG5cdFx0XHR3b3Jrc3BhY2VJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0FuIGlkIG9mIHRoZSB3b3Jrc3BhY2UnIH07XG5cdFx0XHRpc1RydXN0ZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICd0cnVlIGlmIHRoZSB3b3Jrc3BhY2UgaXMgdHJ1c3RlZCcgfTtcblx0XHR9O1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya3NwYWNlVHJ1c3RTdGF0ZUNoYW5nZWRFdmVudCwgV29ya3NwYWNlVHJ1c3RTdGF0ZUNoYW5nZWRFdmVudENsYXNzaWZpY2F0aW9uPignd29ya3NwYWNlVHJ1c3RTdGF0ZUNoYW5nZWQnLCB7XG5cdFx0XHR3b3Jrc3BhY2VJZDogdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5pZCxcblx0XHRcdGlzVHJ1c3RlZDogaXNUcnVzdGVkXG5cdFx0fSk7XG5cblx0XHRpZiAoaXNUcnVzdGVkKSB7XG5cdFx0XHR0eXBlIFdvcmtzcGFjZVRydXN0Rm9sZGVySW5mb0V2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnc2JhdHRlbic7XG5cdFx0XHRcdGNvbW1lbnQ6ICdTb21lIG1ldHJpY3Mgb24gdGhlIHRydXN0ZWQgd29ya3NwYWNlcyBmb2xkZXIgc3RydWN0dXJlJztcblx0XHRcdFx0dHJ1c3RlZEZvbGRlckRlcHRoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBkaXJlY3RvcmllcyBkZWVwIG9mIHRoZSB0cnVzdGVkIHBhdGgnIH07XG5cdFx0XHRcdHdvcmtzcGFjZUZvbGRlckRlcHRoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBkaXJlY3RvcmllcyBkZWVwIG9mIHRoZSB3b3Jrc3BhY2UgcGF0aCcgfTtcblx0XHRcdFx0ZGVsdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZGlmZmVyZW5jZSBiZXR3ZWVuIHRoZSB0cnVzdGVkIHBhdGggYW5kIHRoZSB3b3Jrc3BhY2UgcGF0aCBkaXJlY3RvcmllcyBkZXB0aCcgfTtcblx0XHRcdH07XG5cblx0XHRcdHR5cGUgV29ya3NwYWNlVHJ1c3RGb2xkZXJJbmZvRXZlbnQgPSB7XG5cdFx0XHRcdHRydXN0ZWRGb2xkZXJEZXB0aDogbnVtYmVyO1xuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJEZXB0aDogbnVtYmVyO1xuXHRcdFx0XHRkZWx0YTogbnVtYmVyO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZ2V0RGVwdGggPSAoZm9sZGVyOiBzdHJpbmcpOiBudW1iZXIgPT4ge1xuXHRcdFx0XHRsZXQgcmVzb2x2ZWRQYXRoID0gcmVzb2x2ZShmb2xkZXIpO1xuXG5cdFx0XHRcdGxldCBkZXB0aCA9IDA7XG5cdFx0XHRcdHdoaWxlIChkaXJuYW1lKHJlc29sdmVkUGF0aCkgIT09IHJlc29sdmVkUGF0aCAmJiBkZXB0aCA8IDEwMCkge1xuXHRcdFx0XHRcdHJlc29sdmVkUGF0aCA9IGRpcm5hbWUocmVzb2x2ZWRQYXRoKTtcblx0XHRcdFx0XHRkZXB0aCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGRlcHRoO1xuXHRcdFx0fTtcblxuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHsgdHJ1c3RlZCwgdXJpIH0gPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKGZvbGRlci51cmkpO1xuXHRcdFx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlckRlcHRoID0gZ2V0RGVwdGgoZm9sZGVyLnVyaS5mc1BhdGgpO1xuXHRcdFx0XHRjb25zdCB0cnVzdGVkRm9sZGVyRGVwdGggPSBnZXREZXB0aCh1cmkuZnNQYXRoKTtcblx0XHRcdFx0Y29uc3QgZGVsdGEgPSB3b3Jrc3BhY2VGb2xkZXJEZXB0aCAtIHRydXN0ZWRGb2xkZXJEZXB0aDtcblxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3Jrc3BhY2VUcnVzdEZvbGRlckluZm9FdmVudCwgV29ya3NwYWNlVHJ1c3RGb2xkZXJJbmZvRXZlbnRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZUZvbGRlckRlcHRoQmVsb3dUcnVzdGVkRm9sZGVyJywgeyB3b3Jrc3BhY2VGb2xkZXJEZXB0aCwgdHJ1c3RlZEZvbGRlckRlcHRoLCBkZWx0YSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpXG5cdC5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihXb3Jrc3BhY2VUcnVzdFRlbGVtZXRyeUNvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxvQkFBb0IsY0FBYywrQkFBdUQ7QUFDbEcsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQ0FBa0Msa0NBQWtDLCtCQUErQixpQ0FBaUM7QUFDN0ksU0FBUyxjQUFjLHFCQUE4RSxnQkFBZ0Isc0NBQXNDO0FBQzNKLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBbUQsbUJBQW1CLDBCQUEwQjtBQUNoRyxTQUE4Qiw0QkFBNEI7QUFDMUQsU0FBUyxZQUFZLDRCQUE0QjtBQUNqRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHdCQUF3Qiw4QkFBOEIseUJBQXlCLGdDQUFnQyx1Q0FBdUM7QUFDL0osU0FBb0Qsd0JBQXdCO0FBRTVFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQThELG1DQUFtQywwQkFBNEQsdUJBQXVCLHNCQUFzQjtBQUNuTixTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxvQkFBb0I7QUFDN0IsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0RBQXdEO0FBQ2pFLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUNBQW1DO0FBQzVDLFNB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
