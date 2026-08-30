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
import "./media/extensionActions.css";
import { localize, localize2 } from "../../../../nls.js";
import { Action, Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { Delayer, Promises, Throttler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import * as json from "../../../../base/common/json.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { disposeIfDisposable } from "../../../../base/common/lifecycle.js";
import { ExtensionState, IExtensionsWorkbenchService, TOGGLE_IGNORE_EXTENSION_ACTION_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, INSTALL_ACTIONS_GROUP, UPDATE_ACTIONS_GROUP, ExtensionEditorTab, ExtensionRuntimeActionType, AutoUpdateConfigurationKey } from "../common/extensions.js";
import { ExtensionsConfigurationInitialContent } from "../common/extensionsFileTemplate.js";
import { IExtensionGalleryService, InstallOperation, ExtensionManagementErrorCode, IAllowedExtensionsService, shouldRequireRepositorySignatureFor } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { areSameExtensions, getExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionType, ExtensionIdentifier, isLanguagePackExtension, getWorkspaceSupportTypeMessage, TargetPlatform, isApplicationScopedExtension } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IExtensionService, toExtension, toExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { URI } from "../../../../base/common/uri.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { buttonBackground, buttonForeground, buttonHoverBackground, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground, registerColor, editorWarningForeground, editorInfoForeground, editorErrorForeground, buttonSeparator, buttonSecondaryBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { IJSONEditingService } from "../../../services/configuration/common/jsonEditing.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { MenuId, IMenuService } from "../../../../platform/actions/common/actions.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { EXTENSIONS_CONFIG } from "../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js";
import { getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { errorIcon, infoIcon, manageExtensionIcon, syncEnabledIcon, syncIgnoredIcon, trustIcon, warningIcon } from "./extensionsIcons.js";
import { isIOS, isWeb, language } from "../../../../base/common/platform.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { createCommandUri, escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../base/common/htmlContent.js";
import { fromNow } from "../../../../base/common/date.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { getLocale } from "../../../../platform/languagePacks/common/languagePacks.js";
import { ILocaleService } from "../../../services/localization/common/locale.js";
import { isString } from "../../../../base/common/types.js";
import { showWindowLogActionId } from "../../../services/log/common/logConstants.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { ActionWithDropdownActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { IAuthenticationUsageService } from "../../../services/authentication/browser/authenticationUsageService.js";
import { IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { IWorkbenchIssueService } from "../../issue/common/issue.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { getWorkbenchMenuMotionContextMenuOptions } from "../../../browser/actions/menuMotion.js";
let PromptExtensionInstallFailureAction = class extends Action {
  constructor(extension, options, version, installOperation, error, productService, openerService, notificationService, dialogService, commandService, logService, extensionManagementServerService, instantiationService, galleryService, extensionManifestPropertiesService, workbenchIssueService) {
    super("extension.promptExtensionInstallFailure");
    this.extension = extension;
    this.options = options;
    this.version = version;
    this.installOperation = installOperation;
    this.error = error;
    this.productService = productService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.logService = logService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.instantiationService = instantiationService;
    this.galleryService = galleryService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.workbenchIssueService = workbenchIssueService;
  }
  async run() {
    if (isCancellationError(this.error)) {
      return;
    }
    this.logService.error(this.error);
    if (this.error.name === ExtensionManagementErrorCode.Unsupported) {
      const productName = isWeb ? localize("VS Code for Web", "{0} for the Web", this.productService.nameLong) : this.productService.nameLong;
      const message2 = localize("cannot be installed", "The '{0}' extension is not available in {1}. Click 'More Information' to learn more.", this.extension.displayName || this.extension.identifier.id, productName);
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Info,
        message: message2,
        primaryButton: localize({ key: "more information", comment: ["&& denotes a mnemonic"] }, "&&More Information"),
        cancelButton: localize("close", "Close")
      });
      if (confirmed) {
        this.openerService.open(isWeb ? URI.parse("https://aka.ms/vscode-web-extensions-guide") : URI.parse("https://aka.ms/vscode-remote"));
      }
      return;
    }
    if (ExtensionManagementErrorCode.ReleaseVersionNotFound === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: getErrorMessage(this.error),
        buttons: [{
          label: localize("install prerelease", "Install Pre-Release"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { installPreReleaseVersion: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: localize("cancel", "Cancel")
      });
      return;
    }
    if ([ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleApi, ExtensionManagementErrorCode.IncompatibleTargetPlatform, ExtensionManagementErrorCode.Malicious, ExtensionManagementErrorCode.Deprecated].includes(this.error.name)) {
      await this.dialogService.info(getErrorMessage(this.error));
      return;
    }
    if (ExtensionManagementErrorCode.PackageNotSigned === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: localize("not signed", "'{0}' is an extension from an unknown source. Are you sure you want to install?", this.extension.displayName),
        detail: getErrorMessage(this.error),
        buttons: [{
          label: localize("install anyway", "Install Anyway"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: true
      });
      return;
    }
    if (ExtensionManagementErrorCode.SignatureVerificationFailed === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: localize("verification failed", "Cannot install '{0}' extension because {1} cannot verify the extension signature", this.extension.displayName, this.productService.nameLong),
        detail: getErrorMessage(this.error),
        buttons: [{
          label: localize("learn more", "Learn More"),
          run: () => this.openerService.open("https://code.visualstudio.com/docs/editor/extension-marketplace#_the-extension-signature-cannot-be-verified-by-vs-code")
        }, {
          label: localize("install donot verify", "Install Anyway (Don't Verify Signature)"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: true
      });
      return;
    }
    if (ExtensionManagementErrorCode.SignatureVerificationInternal === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: localize("verification failed", "Cannot install '{0}' extension because {1} cannot verify the extension signature", this.extension.displayName, this.productService.nameLong),
        detail: getErrorMessage(this.error),
        buttons: [{
          label: localize("learn more", "Learn More"),
          run: () => this.openerService.open("https://code.visualstudio.com/docs/editor/extension-marketplace#_the-extension-signature-cannot-be-verified-by-vs-code")
        }, {
          label: localize("report issue", "Report Issue"),
          run: () => this.workbenchIssueService.openReporter({
            issueTitle: localize("report issue title", "Extension Signature Verification Failed: {0}", this.extension.displayName),
            issueBody: localize("report issue body", "Please include following log `F1 > Open View... > Shared` below.\n\n")
          })
        }, {
          label: localize("install donot verify", "Install Anyway (Don't Verify Signature)"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: true
      });
      return;
    }
    const operationMessage = this.installOperation === InstallOperation.Update ? localize("update operation", "Error while updating '{0}' extension.", this.extension.displayName || this.extension.identifier.id) : localize("install operation", "Error while installing '{0}' extension.", this.extension.displayName || this.extension.identifier.id);
    let additionalMessage;
    const promptChoices = [];
    const downloadUrl = await this.getDownloadUrl();
    if (downloadUrl) {
      additionalMessage = localize("check logs", "Please check the [log]({0}) for more details.", createCommandUri(showWindowLogActionId).toString());
      promptChoices.push({
        label: localize("download", "Try Downloading Manually..."),
        run: () => this.openerService.open(downloadUrl).then(() => {
          this.notificationService.prompt(
            Severity.Info,
            localize("install vsix", "Once downloaded, please manually install the downloaded VSIX of '{0}'.", this.extension.identifier.id),
            [{
              label: localize("installVSIX", "Install from VSIX..."),
              run: () => this.commandService.executeCommand(SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID)
            }]
          );
        })
      });
    }
    const message = `${operationMessage}${additionalMessage ? ` ${additionalMessage}` : ""}`;
    this.notificationService.prompt(Severity.Error, message, promptChoices);
  }
  async getDownloadUrl() {
    if (isIOS) {
      return void 0;
    }
    if (!this.extension.gallery) {
      return void 0;
    }
    if (!this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer) {
      return void 0;
    }
    let targetPlatform = this.extension.gallery.properties.targetPlatform;
    if (targetPlatform !== TargetPlatform.UNIVERSAL && targetPlatform !== TargetPlatform.UNDEFINED && this.extensionManagementServerService.remoteExtensionManagementServer) {
      try {
        const manifest = await this.galleryService.getManifest(this.extension.gallery, CancellationToken.None);
        if (manifest && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(manifest)) {
          targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
        }
      } catch (error) {
        this.logService.error(error);
        return void 0;
      }
    }
    if (targetPlatform === TargetPlatform.UNKNOWN) {
      return void 0;
    }
    const [extension] = await this.galleryService.getExtensions([{
      ...this.extension.identifier,
      version: this.version
    }], {
      targetPlatform
    }, CancellationToken.None);
    if (!extension) {
      return void 0;
    }
    return URI.parse(extension.assets.download.uri);
  }
};
PromptExtensionInstallFailureAction = __decorateClass([
  __decorateParam(5, IProductService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IExtensionManagementServerService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IExtensionGalleryService),
  __decorateParam(14, IExtensionManifestPropertiesService),
  __decorateParam(15, IWorkbenchIssueService)
], PromptExtensionInstallFailureAction);
const _ExtensionAction = class _ExtensionAction extends Action {
  constructor() {
    super(...arguments);
    this._onDidChange = this._register(new Emitter());
    this._extension = null;
    this._hidden = false;
    this.hideOnDisabled = true;
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get extension() {
    return this._extension;
  }
  set extension(extension) {
    this._extension = extension;
    this.update();
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(hidden) {
    if (this._hidden !== hidden) {
      this._hidden = hidden;
      this._onDidChange.fire({ hidden });
    }
  }
  _setEnabled(value) {
    super._setEnabled(value);
    if (this.hideOnDisabled) {
      this.hidden = !value;
    }
  }
};
_ExtensionAction.EXTENSION_ACTION_CLASS = "extension-action";
_ExtensionAction.TEXT_ACTION_CLASS = `${_ExtensionAction.EXTENSION_ACTION_CLASS} text`;
_ExtensionAction.LABEL_ACTION_CLASS = `${_ExtensionAction.EXTENSION_ACTION_CLASS} label`;
_ExtensionAction.ICON_ACTION_CLASS = `${_ExtensionAction.EXTENSION_ACTION_CLASS} icon`;
let ExtensionAction = _ExtensionAction;
class ButtonWithDropDownExtensionAction extends ExtensionAction {
  constructor(id, clazz, actionsGroups) {
    clazz = `${clazz} action-dropdown`;
    super(id, void 0, clazz);
    this.actionsGroups = actionsGroups;
    this.menuActionClassNames = [];
    this._menuActions = [];
    this.menuActionClassNames = clazz.split(" ");
    this.hideOnDisabled = false;
    this.extensionActions = actionsGroups.flat();
    this.update();
    this._register(Event.any(...this.extensionActions.map((a) => a.onDidChange))(() => this.update(true)));
    this.extensionActions.forEach((a) => this._register(a));
  }
  get menuActions() {
    return [...this._menuActions];
  }
  get extension() {
    return super.extension;
  }
  set extension(extension) {
    this.extensionActions.forEach((a) => a.extension = extension);
    super.extension = extension;
  }
  update(donotUpdateActions) {
    if (!donotUpdateActions) {
      this.extensionActions.forEach((a) => a.update());
    }
    const actionsGroups = this.actionsGroups.map((actionsGroup) => actionsGroup.filter((a) => !a.hidden));
    let actions = [];
    for (const visibleActions of actionsGroups) {
      if (visibleActions.length) {
        actions = [...actions, ...visibleActions, new Separator()];
      }
    }
    actions = actions.length ? actions.slice(0, actions.length - 1) : actions;
    this.primaryAction = actions[0];
    this._menuActions = actions.length > 1 ? actions : [];
    this._onDidChange.fire({ menuActions: this._menuActions });
    if (this.primaryAction) {
      this.hidden = false;
      this.enabled = this.primaryAction.enabled;
      this.label = this.getLabel(this.primaryAction);
      this.tooltip = this.primaryAction.tooltip;
    } else {
      this.hidden = true;
      this.enabled = false;
    }
  }
  async run() {
    if (this.enabled) {
      await this.primaryAction?.run();
    }
  }
  getLabel(action) {
    return action.label;
  }
}
class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {
  constructor(action, options, contextMenuProvider) {
    super(null, action, options, contextMenuProvider);
    this._register(action.onDidChange((e) => {
      if (e.hidden !== void 0 || e.menuActions !== void 0) {
        this.updateClass();
      }
    }));
  }
  render(container) {
    super.render(container);
    this.updateClass();
  }
  updateClass() {
    super.updateClass();
    if (this.element && this.dropdownMenuActionViewItem?.element) {
      this.element.classList.toggle("hide", this._action.hidden);
      const isMenuEmpty = this._action.menuActions.length === 0;
      this.element.classList.toggle("empty", isMenuEmpty);
      this.dropdownMenuActionViewItem.element.classList.toggle("hide", isMenuEmpty);
    }
  }
}
let InstallAction = class extends ExtensionAction {
  constructor(options, extensionsWorkbenchService, instantiationService, runtimeExtensionService, workbenchThemeService, labelService, dialogService, preferencesService, telemetryService, contextService, allowedExtensionsService, extensionGalleryManifestService) {
    super("extensions.install", localize("install", "Install"), InstallAction.CLASS, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.instantiationService = instantiationService;
    this.runtimeExtensionService = runtimeExtensionService;
    this.workbenchThemeService = workbenchThemeService;
    this.labelService = labelService;
    this.dialogService = dialogService;
    this.preferencesService = preferencesService;
    this.telemetryService = telemetryService;
    this.contextService = contextService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this._manifest = null;
    this.updateThrottler = this._register(new Throttler());
    this.hideOnDisabled = false;
    this.options = { isMachineScoped: false, ...options };
    this.update();
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this._register(this.labelService.onDidChangeFormatters(() => this.updateLabel(), this));
  }
  set manifest(manifest) {
    this._manifest = manifest;
    this.updateLabel();
  }
  update() {
    this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
  }
  async computeAndUpdateEnablement() {
    this.enabled = false;
    this.class = InstallAction.HIDE;
    this.hidden = true;
    if (!this.extension) {
      return;
    }
    if (this.extension.isBuiltin) {
      return;
    }
    if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.state !== ExtensionState.Uninstalled) {
      return;
    }
    if (this.options.installPreReleaseVersion && (!this.extension.hasPreReleaseVersion || this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName, prerelease: true }) !== true)) {
      return;
    }
    if (!this.options.installPreReleaseVersion && !this.extension.hasReleaseVersion) {
      return;
    }
    this.hidden = false;
    this.class = InstallAction.CLASS;
    if (await this.extensionsWorkbenchService.canInstall(this.extension) === true) {
      this.enabled = true;
      this.updateLabel();
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    if (this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
      const { result } = await this.dialogService.prompt({
        type: Severity.Warning,
        message: localize("not signed", "'{0}' is an extension from an unknown source. Are you sure you want to install?", this.extension.displayName),
        detail: localize("not signed detail", "Extension is not signed."),
        buttons: [
          {
            label: localize("install anyway", "Install Anyway"),
            run: () => {
              this.options.donotVerifySignature = true;
              return true;
            }
          }
        ],
        cancelButton: {
          run: () => false
        }
      });
      if (!result) {
        return;
      }
    }
    if (this.extension.deprecationInfo) {
      let detail = localize("deprecated message", "This extension is deprecated as it is no longer being maintained.");
      let DeprecationChoice;
      ((DeprecationChoice2) => {
        DeprecationChoice2[DeprecationChoice2["InstallAnyway"] = 0] = "InstallAnyway";
        DeprecationChoice2[DeprecationChoice2["ShowAlternateExtension"] = 1] = "ShowAlternateExtension";
        DeprecationChoice2[DeprecationChoice2["ConfigureSettings"] = 2] = "ConfigureSettings";
        DeprecationChoice2[DeprecationChoice2["Cancel"] = 3] = "Cancel";
      })(DeprecationChoice || (DeprecationChoice = {}));
      const buttons = [
        {
          label: localize("install anyway", "Install Anyway"),
          run: () => 0 /* InstallAnyway */
        }
      ];
      if (this.extension.deprecationInfo.extension) {
        detail = localize("deprecated with alternate extension message", "This extension is deprecated. Use the {0} extension instead.", this.extension.deprecationInfo.extension.displayName);
        const alternateExtension = this.extension.deprecationInfo.extension;
        buttons.push({
          label: localize({ key: "Show alternate extension", comment: ["&& denotes a mnemonic"] }, "&&Open {0}", this.extension.deprecationInfo.extension.displayName),
          run: async () => {
            const [extension2] = await this.extensionsWorkbenchService.getExtensions([{ id: alternateExtension.id, preRelease: alternateExtension.preRelease }], CancellationToken.None);
            await this.extensionsWorkbenchService.open(extension2);
            return 1 /* ShowAlternateExtension */;
          }
        });
      } else if (this.extension.deprecationInfo.settings) {
        detail = localize("deprecated with alternate settings message", "This extension is deprecated as this functionality is now built-in to VS Code.");
        const settings = this.extension.deprecationInfo.settings;
        buttons.push({
          label: localize({ key: "configure in settings", comment: ["&& denotes a mnemonic"] }, "&&Configure Settings"),
          run: async () => {
            await this.preferencesService.openSettings({ query: settings.map((setting) => `@id:${setting}`).join(" ") });
            return 2 /* ConfigureSettings */;
          }
        });
      } else if (this.extension.deprecationInfo.additionalInfo) {
        detail = new MarkdownString(`${detail} ${this.extension.deprecationInfo.additionalInfo}`);
      }
      const { result } = await this.dialogService.prompt({
        type: Severity.Warning,
        message: localize("install confirmation", "Are you sure you want to install '{0}'?", this.extension.displayName),
        detail: isString(detail) ? detail : void 0,
        custom: isString(detail) ? void 0 : {
          markdownDetails: [{
            markdown: detail
          }]
        },
        buttons,
        cancelButton: {
          run: () => 3 /* Cancel */
        }
      });
      if (result !== 0 /* InstallAnyway */) {
        return;
      }
    }
    this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: this.options.installPreReleaseVersion });
    alert(localize("installExtensionStart", "Installing extension {0} started. An editor is now open with more details on this extension", this.extension.displayName));
    this.telemetryService.publicLog("extensions:action:install", { ...this.extension.telemetryData, actionId: this.id });
    const extension = await this.install(this.extension);
    if (extension?.local) {
      alert(localize("installExtensionComplete", "Installing extension {0} is completed.", this.extension.displayName));
      const runningExtension = await this.getRunningExtension(extension.local);
      if (runningExtension && !(runningExtension.activationEvents && runningExtension.activationEvents.some((activationEent) => activationEent.startsWith("onLanguage")))) {
        const action = await this.getThemeAction(extension);
        if (action) {
          action.extension = extension;
          try {
            return action.run({ showCurrentTheme: true, ignoreFocusLost: true });
          } finally {
            action.dispose();
          }
        }
      }
    }
  }
  async getThemeAction(extension) {
    const colorThemes = await this.workbenchThemeService.getColorThemes();
    if (colorThemes.some((theme) => isThemeFromExtension(theme, extension))) {
      return this.instantiationService.createInstance(SetColorThemeAction);
    }
    const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
    if (fileIconThemes.some((theme) => isThemeFromExtension(theme, extension))) {
      return this.instantiationService.createInstance(SetFileIconThemeAction);
    }
    const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
    if (productIconThemes.some((theme) => isThemeFromExtension(theme, extension))) {
      return this.instantiationService.createInstance(SetProductIconThemeAction);
    }
    return void 0;
  }
  async install(extension) {
    try {
      return await this.extensionsWorkbenchService.install(extension, this.options);
    } catch (error) {
      await this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, this.options, extension.latestVersion, InstallOperation.Install, error).run();
      return void 0;
    }
  }
  async getRunningExtension(extension) {
    const runningExtension = await this.runtimeExtensionService.getExtension(extension.identifier.id);
    if (runningExtension) {
      return runningExtension;
    }
    if (this.runtimeExtensionService.canAddExtension(toExtensionDescription(extension))) {
      return new Promise((c, e) => {
        const disposable = this.runtimeExtensionService.onDidChangeExtensions(async () => {
          const runningExtension2 = await this.runtimeExtensionService.getExtension(extension.identifier.id);
          if (runningExtension2) {
            disposable.dispose();
            c(runningExtension2);
          }
        });
      });
    }
    return null;
  }
  updateLabel() {
    this.label = this.getLabel();
  }
  getLabel(primary) {
    if (this.extension?.isWorkspaceScoped && this.extension.resourceExtension && this.contextService.isInsideWorkspace(this.extension.resourceExtension.location)) {
      return localize("install workspace version", "Install Workspace Extension");
    }
    if (this.options.installPreReleaseVersion && this.extension?.hasPreReleaseVersion) {
      return primary ? localize("install pre-release", "Install Pre-Release") : localize("install pre-release version", "Install Pre-Release Version");
    }
    if (this.extension?.hasPreReleaseVersion) {
      return primary ? localize("install", "Install") : localize("install release version", "Install Release Version");
    }
    return localize("install", "Install");
  }
};
InstallAction.CLASS = `${InstallAction.LABEL_ACTION_CLASS} prominent install`;
InstallAction.HIDE = `${InstallAction.CLASS} hide`;
InstallAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IWorkbenchThemeService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IPreferencesService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IAllowedExtensionsService),
  __decorateParam(11, IExtensionGalleryManifestService)
], InstallAction);
let InstallDropdownAction = class extends ButtonWithDropDownExtensionAction {
  set manifest(manifest) {
    this.extensionActions.forEach((a) => a.manifest = manifest);
    this.update();
  }
  constructor(instantiationService, extensionManagementService) {
    super(`extensions.installActions`, InstallAction.CLASS, [
      [
        instantiationService.createInstance(InstallAction, { installPreReleaseVersion: extensionManagementService.preferPreReleases }),
        instantiationService.createInstance(InstallAction, { installPreReleaseVersion: !extensionManagementService.preferPreReleases })
      ]
    ]);
  }
  getLabel(action) {
    return action.getLabel(true);
  }
};
InstallDropdownAction = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkbenchExtensionManagementService)
], InstallDropdownAction);
const _InstallingLabelAction = class _InstallingLabelAction extends ExtensionAction {
  constructor() {
    super("extension.installing", _InstallingLabelAction.LABEL, _InstallingLabelAction.CLASS, false);
  }
  update() {
    this.class = `${_InstallingLabelAction.CLASS}${this.extension && this.extension.state === ExtensionState.Installing ? "" : " hide"}`;
  }
};
_InstallingLabelAction.LABEL = localize("installing", "Installing");
_InstallingLabelAction.CLASS = `${ExtensionAction.LABEL_ACTION_CLASS} install installing`;
let InstallingLabelAction = _InstallingLabelAction;
let InstallInOtherServerAction = class extends ExtensionAction {
  constructor(id, server, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(id, InstallInOtherServerAction.INSTALL_LABEL, InstallInOtherServerAction.Class, false);
    this.server = server;
    this.canInstallAnyWhere = canInstallAnyWhere;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.updateWhenCounterExtensionChanges = true;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallInOtherServerAction.Class;
    if (this.canInstall()) {
      const extensionInOtherServer = this.extensionsWorkbenchService.installed.filter((e) => areSameExtensions(e.identifier, this.extension.identifier) && e.server === this.server)[0];
      if (extensionInOtherServer) {
        if (extensionInOtherServer.state === ExtensionState.Installing && !extensionInOtherServer.local) {
          this.enabled = true;
          this.label = InstallInOtherServerAction.INSTALLING_LABEL;
          this.class = InstallInOtherServerAction.InstallingClass;
        }
      } else {
        this.enabled = true;
        this.label = this.getInstallLabel();
      }
    }
  }
  canInstall() {
    if (!this.extension || !this.server || !this.extension.local || this.extension.state !== ExtensionState.Installed || this.extension.type !== ExtensionType.User || this.extension.enablementState === EnablementState.DisabledByEnvironment || this.extension.enablementState === EnablementState.DisabledByTrustRequirement || this.extension.enablementState === EnablementState.DisabledByVirtualWorkspace) {
      return false;
    }
    if (isLanguagePackExtension(this.extension.local.manifest)) {
      return true;
    }
    if (this.server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
      return true;
    }
    if (this.server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
      return true;
    }
    if (this.server === this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWeb(this.extension.local.manifest)) {
      return true;
    }
    if (this.canInstallAnyWhere) {
      if (this.server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnUI(this.extension.local.manifest)) {
        return true;
      }
      if (this.server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(this.extension.local.manifest)) {
        return true;
      }
    }
    return false;
  }
  async run() {
    if (!this.extension?.local) {
      return;
    }
    if (!this.extension?.server) {
      return;
    }
    if (!this.server) {
      return;
    }
    this.extensionsWorkbenchService.open(this.extension);
    alert(localize("installExtensionStart", "Installing extension {0} started. An editor is now open with more details on this extension", this.extension.displayName));
    return this.extensionsWorkbenchService.installInServer(this.extension, this.server);
  }
};
InstallInOtherServerAction.INSTALL_LABEL = localize("install", "Install");
InstallInOtherServerAction.INSTALLING_LABEL = localize("installing", "Installing");
InstallInOtherServerAction.Class = `${ExtensionAction.LABEL_ACTION_CLASS} prominent install-other-server`;
InstallInOtherServerAction.InstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} install-other-server installing`;
InstallInOtherServerAction = __decorateClass([
  __decorateParam(3, IExtensionsWorkbenchService),
  __decorateParam(4, IExtensionManagementServerService),
  __decorateParam(5, IExtensionManifestPropertiesService)
], InstallInOtherServerAction);
let RemoteInstallAction = class extends InstallInOtherServerAction {
  constructor(canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(`extensions.remoteinstall`, extensionManagementServerService.remoteExtensionManagementServer, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
  }
  getInstallLabel() {
    return this.extensionManagementServerService.remoteExtensionManagementServer ? localize({ key: "install in remote", comment: ["This is the name of the action to install an extension in remote server. Placeholder is for the name of remote server."] }, "Install in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label) : InstallInOtherServerAction.INSTALL_LABEL;
  }
};
RemoteInstallAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IExtensionManagementServerService),
  __decorateParam(3, IExtensionManifestPropertiesService)
], RemoteInstallAction);
let LocalInstallAction = class extends InstallInOtherServerAction {
  constructor(extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(`extensions.localinstall`, extensionManagementServerService.localExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
  }
  getInstallLabel() {
    return localize("install locally", "Install Locally");
  }
};
LocalInstallAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IExtensionManifestPropertiesService)
], LocalInstallAction);
let WebInstallAction = class extends InstallInOtherServerAction {
  constructor(extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(`extensions.webInstall`, extensionManagementServerService.webExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
  }
  getInstallLabel() {
    return localize("install browser", "Install in Browser");
  }
};
WebInstallAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IExtensionManifestPropertiesService)
], WebInstallAction);
let UninstallAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, userDataProfilesService, dialogService) {
    super("extensions.uninstall", UninstallAction.UninstallLabel, UninstallAction.UninstallClass, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.userDataProfilesService = userDataProfilesService;
    this.dialogService = dialogService;
    this.update();
  }
  update() {
    if (!this.extension) {
      this.enabled = false;
      return;
    }
    const state = this.extension.state;
    if (state === ExtensionState.Uninstalling) {
      this.label = UninstallAction.UninstallingLabel;
      this.class = UninstallAction.UnInstallingClass;
      this.enabled = false;
      return;
    }
    this.label = this.extension.local?.isApplicationScoped && this.userDataProfilesService.profiles.length > 1 ? localize("uninstallAll", "Uninstall (All Profiles)") : UninstallAction.UninstallLabel;
    this.class = UninstallAction.UninstallClass;
    this.tooltip = UninstallAction.UninstallLabel;
    if (state !== ExtensionState.Installed) {
      this.enabled = false;
      return;
    }
    if (this.extension.isBuiltin) {
      this.enabled = false;
      return;
    }
    this.enabled = true;
  }
  async run() {
    if (!this.extension) {
      return;
    }
    alert(localize("uninstallExtensionStart", "Uninstalling extension {0} started.", this.extension.displayName));
    try {
      await this.extensionsWorkbenchService.uninstall(this.extension);
      alert(localize("uninstallExtensionComplete", "Please reload Visual Studio Code to complete the uninstallation of the extension {0}.", this.extension.displayName));
    } catch (error) {
      if (!isCancellationError(error)) {
        this.dialogService.error(getErrorMessage(error));
      }
    }
  }
};
UninstallAction.UninstallLabel = localize("uninstallAction", "Uninstall");
UninstallAction.UninstallingLabel = localize("Uninstalling", "Uninstalling");
UninstallAction.UninstallClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall`;
UninstallAction.UnInstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall uninstalling`;
UninstallAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IDialogService)
], UninstallAction);
let UpdateAction = class extends ExtensionAction {
  constructor(verbose, extensionsWorkbenchService, dialogService, openerService, instantiationService) {
    super(`extensions.update`, localize("update", "Update"), UpdateAction.DisabledClass, false);
    this.verbose = verbose;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.dialogService = dialogService;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this.updateThrottler = this._register(new Throttler());
    this.update();
  }
  update() {
    this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
    if (this.extension) {
      this.label = this.verbose ? localize("update to", "Update to v{0}", this.extension.latestVersion) : localize("update", "Update");
    }
  }
  async computeAndUpdateEnablement() {
    this.enabled = false;
    this.class = UpdateAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (this.extension.deprecationInfo) {
      return;
    }
    const canInstall = await this.extensionsWorkbenchService.canInstall(this.extension);
    const isInstalled = this.extension.state === ExtensionState.Installed;
    this.enabled = canInstall === true && isInstalled && this.extension.outdated;
    this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
  }
  async run() {
    if (!this.extension) {
      return;
    }
    const consent = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
    if (consent) {
      const { result } = await this.dialogService.prompt({
        type: "warning",
        title: localize("updateExtensionConsentTitle", "Update {0} Extension", this.extension.displayName),
        message: localize("updateExtensionConsent", "{0}\n\nWould you like to update the extension?", consent),
        buttons: [{
          label: localize("update", "Update"),
          run: () => "update"
        }, {
          label: localize("review", "Review"),
          run: () => "review"
        }, {
          label: localize("cancel", "Cancel"),
          run: () => "cancel"
        }]
      });
      if (result === "cancel") {
        return;
      }
      if (result === "review") {
        if (this.extension.hasChangelog()) {
          return this.extensionsWorkbenchService.open(this.extension, { tab: ExtensionEditorTab.Changelog });
        }
        if (this.extension.repository) {
          return this.openerService.open(this.extension.repository);
        }
        return this.extensionsWorkbenchService.open(this.extension);
      }
    }
    const installOptions = {};
    if (this.extension.local?.source === "vsix" && this.extension.local.pinned) {
      installOptions.pinned = false;
    }
    if (this.extension.local?.preRelease) {
      installOptions.installPreReleaseVersion = true;
    }
    try {
      alert(localize("updateExtensionStart", "Updating extension {0} to version {1} started.", this.extension.displayName, this.extension.latestVersion));
      await this.extensionsWorkbenchService.install(this.extension, installOptions);
      alert(localize("updateExtensionComplete", "Updating extension {0} to version {1} completed.", this.extension.displayName, this.extension.latestVersion));
    } catch (err) {
      this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, installOptions, this.extension.latestVersion, InstallOperation.Update, err).run();
    }
  }
};
UpdateAction.EnabledClass = `${UpdateAction.LABEL_ACTION_CLASS} update`;
UpdateAction.DisabledClass = `${UpdateAction.EnabledClass} disabled`;
UpdateAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IInstantiationService)
], UpdateAction);
let ToggleAutoUpdateForExtensionAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, allowedExtensionsService, configurationService) {
    super(ToggleAutoUpdateForExtensionAction.ID, ToggleAutoUpdateForExtensionAction.LABEL.value, ToggleAutoUpdateForExtensionAction.DisabledClass);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.allowedExtensionsService = allowedExtensionsService;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
        this.update();
      }
    }));
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue((e) => this.update()));
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ToggleAutoUpdateForExtensionAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (this.extension.isBuiltin) {
      return;
    }
    if (this.extension.deprecationInfo?.disallowInstall) {
      return;
    }
    const extension = this.extension.local ?? this.extension.gallery;
    if (extension && this.allowedExtensionsService.isAllowed(extension) !== true) {
      return;
    }
    if (this.extensionsWorkbenchService.getAutoUpdateValue() === "on" && !this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState)) {
      return;
    }
    this.enabled = true;
    this.class = ToggleAutoUpdateForExtensionAction.EnabledClass;
    this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
  }
  async run() {
    if (!this.extension) {
      return;
    }
    const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
    await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension, enableAutoUpdate);
    if (enableAutoUpdate) {
      alert(localize("enableAutoUpdate", "Enabled auto updates for", this.extension.displayName));
    } else {
      alert(localize("disableAutoUpdate", "Disabled auto updates for", this.extension.displayName));
    }
  }
};
ToggleAutoUpdateForExtensionAction.ID = "workbench.extensions.action.toggleAutoUpdateForExtension";
ToggleAutoUpdateForExtensionAction.LABEL = localize2("enableAutoUpdateLabel", "Auto Update");
ToggleAutoUpdateForExtensionAction.EnabledClass = `${ExtensionAction.EXTENSION_ACTION_CLASS} auto-update`;
ToggleAutoUpdateForExtensionAction.DisabledClass = `${ToggleAutoUpdateForExtensionAction.EnabledClass} hide`;
ToggleAutoUpdateForExtensionAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IAllowedExtensionsService),
  __decorateParam(3, IConfigurationService)
], ToggleAutoUpdateForExtensionAction);
let ToggleAutoUpdatesForPublisherAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService) {
    super(ToggleAutoUpdatesForPublisherAction.ID, ToggleAutoUpdatesForPublisherAction.LABEL);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
  }
  update() {
  }
  async run() {
    if (!this.extension) {
      return;
    }
    alert(localize("ignoreExtensionUpdatePublisher", "Ignoring updates published by {0}.", this.extension.publisherDisplayName));
    const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
    await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension.publisher, enableAutoUpdate);
    if (enableAutoUpdate) {
      alert(localize("enableAutoUpdate", "Enabled auto updates for", this.extension.displayName));
    } else {
      alert(localize("disableAutoUpdate", "Disabled auto updates for", this.extension.displayName));
    }
  }
};
ToggleAutoUpdatesForPublisherAction.ID = "workbench.extensions.action.toggleAutoUpdatesForPublisher";
ToggleAutoUpdatesForPublisherAction.LABEL = localize("toggleAutoUpdatesForPublisherLabel", "Auto Update All (From Publisher)");
ToggleAutoUpdatesForPublisherAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], ToggleAutoUpdatesForPublisherAction);
let MigrateDeprecatedExtensionAction = class extends ExtensionAction {
  constructor(small, extensionsWorkbenchService) {
    super("extensionsAction.migrateDeprecatedExtension", localize("migrateExtension", "Migrate"), MigrateDeprecatedExtensionAction.DisabledClass, false);
    this.small = small;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = MigrateDeprecatedExtensionAction.DisabledClass;
    if (!this.extension?.local) {
      return;
    }
    if (this.extension.state !== ExtensionState.Installed) {
      return;
    }
    if (!this.extension.deprecationInfo?.extension) {
      return;
    }
    const id = this.extension.deprecationInfo.extension.id;
    if (this.extensionsWorkbenchService.local.some((e) => areSameExtensions(e.identifier, { id }))) {
      return;
    }
    this.enabled = true;
    this.class = MigrateDeprecatedExtensionAction.EnabledClass;
    this.tooltip = localize("migrate to", "Migrate to {0}", this.extension.deprecationInfo.extension.displayName);
    this.label = this.small ? localize("migrate", "Migrate") : this.tooltip;
  }
  async run() {
    if (!this.extension?.deprecationInfo?.extension) {
      return;
    }
    const local = this.extension.local;
    await this.extensionsWorkbenchService.uninstall(this.extension);
    const [extension] = await this.extensionsWorkbenchService.getExtensions([{ id: this.extension.deprecationInfo.extension.id, preRelease: this.extension.deprecationInfo?.extension?.preRelease }], CancellationToken.None);
    await this.extensionsWorkbenchService.install(extension, { isMachineScoped: local?.isMachineScoped });
  }
};
MigrateDeprecatedExtensionAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} migrate`;
MigrateDeprecatedExtensionAction.DisabledClass = `${MigrateDeprecatedExtensionAction.EnabledClass} disabled`;
MigrateDeprecatedExtensionAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService)
], MigrateDeprecatedExtensionAction);
let DropDownExtensionAction = class extends ExtensionAction {
  constructor(id, label, cssClass, enabled, instantiationService) {
    super(id, label, cssClass, enabled);
    this.instantiationService = instantiationService;
    this._actionViewItem = null;
  }
  createActionViewItem(options) {
    this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
    return this._actionViewItem;
  }
  run(actionGroups) {
    this._actionViewItem?.showMenu(actionGroups);
    return Promise.resolve();
  }
};
DropDownExtensionAction = __decorateClass([
  __decorateParam(4, IInstantiationService)
], DropDownExtensionAction);
let DropDownExtensionActionViewItem = class extends ActionViewItem {
  constructor(action, options, contextMenuService) {
    super(null, action, { ...options, icon: true, label: true });
    this.contextMenuService = contextMenuService;
  }
  showMenu(menuActionGroups) {
    if (this.element) {
      const actions = this.getActions(menuActionGroups);
      this.contextMenuService.showContextMenu({
        ...getWorkbenchMenuMotionContextMenuOptions(this.element),
        getActions: () => actions,
        actionRunner: this.actionRunner,
        onHide: () => disposeIfDisposable(actions)
      });
    }
  }
  getActions(menuActionGroups) {
    let actions = [];
    for (const menuActions of menuActionGroups) {
      actions = [...actions, ...menuActions, new Separator()];
    }
    return actions.length ? actions.slice(0, actions.length - 1) : actions;
  }
};
DropDownExtensionActionViewItem = __decorateClass([
  __decorateParam(2, IContextMenuService)
], DropDownExtensionActionViewItem);
async function getContextMenuActionsGroups(extension, contextKeyService, instantiationService) {
  return instantiationService.invokeFunction(async (accessor) => {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
    const menuService = accessor.get(IMenuService);
    const extensionRecommendationsService = accessor.get(IExtensionRecommendationsService);
    const extensionIgnoredRecommendationsService = accessor.get(IExtensionIgnoredRecommendationsService);
    const workbenchThemeService = accessor.get(IWorkbenchThemeService);
    const authenticationUsageService = accessor.get(IAuthenticationUsageService);
    const allowedExtensionsService = accessor.get(IAllowedExtensionsService);
    const cksOverlay = [];
    if (extension) {
      cksOverlay.push(["extension", extension.identifier.id]);
      cksOverlay.push(["isBuiltinExtension", extension.isBuiltin]);
      cksOverlay.push(["isDefaultApplicationScopedExtension", extension.local && isApplicationScopedExtension(extension.local.manifest)]);
      cksOverlay.push(["isApplicationScopedExtension", extension.local && extension.local.isApplicationScoped]);
      cksOverlay.push(["isWorkspaceScopedExtension", extension.isWorkspaceScoped]);
      cksOverlay.push(["isGalleryExtension", !!extension.identifier.uuid]);
      if (extension.local) {
        cksOverlay.push(["extensionSource", extension.local.source]);
      }
      cksOverlay.push(["extensionHasConfiguration", extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.configuration]);
      cksOverlay.push(["extensionHasKeybindings", extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.keybindings]);
      cksOverlay.push(["extensionHasCommands", extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes?.commands]);
      cksOverlay.push(["isExtensionRecommended", !!extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]]);
      cksOverlay.push(["isExtensionWorkspaceRecommended", extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]?.reasonId === ExtensionRecommendationReason.Workspace]);
      cksOverlay.push(["isUserIgnoredRecommendation", extensionIgnoredRecommendationsService.globalIgnoredRecommendations.some((e) => e === extension.identifier.id.toLowerCase())]);
      cksOverlay.push(["isExtensionPinned", extension.pinned]);
      cksOverlay.push(["isExtensionEnabled", extensionEnablementService.isEnabledEnablementState(extension.enablementState)]);
      switch (extension.state) {
        case ExtensionState.Installing:
          cksOverlay.push(["extensionStatus", "installing"]);
          break;
        case ExtensionState.Installed:
          cksOverlay.push(["extensionStatus", "installed"]);
          break;
        case ExtensionState.Uninstalling:
          cksOverlay.push(["extensionStatus", "uninstalling"]);
          break;
        case ExtensionState.Uninstalled:
          cksOverlay.push(["extensionStatus", "uninstalled"]);
          break;
      }
      cksOverlay.push(["installedExtensionIsPreReleaseVersion", !!extension.local?.isPreReleaseVersion]);
      cksOverlay.push(["installedExtensionIsOptedToPreRelease", !!extension.local?.preRelease]);
      cksOverlay.push(["galleryExtensionIsPreReleaseVersion", !!extension.gallery?.properties.isPreReleaseVersion]);
      cksOverlay.push(["galleryExtensionHasPreReleaseVersion", extension.gallery?.hasPreReleaseVersion]);
      cksOverlay.push(["extensionHasPreReleaseVersion", extension.hasPreReleaseVersion]);
      cksOverlay.push(["extensionHasReleaseVersion", extension.hasReleaseVersion]);
      cksOverlay.push(["extensionDisallowInstall", extension.isMalicious || extension.deprecationInfo?.disallowInstall]);
      cksOverlay.push(["isExtensionAllowed", allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) === true]);
      cksOverlay.push(["isPreReleaseExtensionAllowed", allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName, prerelease: true }) === true]);
      cksOverlay.push(["extensionIsUnsigned", extension.gallery && !extension.gallery.isSigned]);
      cksOverlay.push(["extensionIsPrivate", extension.gallery?.private]);
      const [colorThemes, fileIconThemes, productIconThemes, extensionUsesAuth] = await Promise.all([workbenchThemeService.getColorThemes(), workbenchThemeService.getFileIconThemes(), workbenchThemeService.getProductIconThemes(), authenticationUsageService.extensionUsesAuth(extension.identifier.id.toLowerCase())]);
      cksOverlay.push(["extensionHasColorThemes", colorThemes.some((theme) => isThemeFromExtension(theme, extension))]);
      cksOverlay.push(["extensionHasFileIconThemes", fileIconThemes.some((theme) => isThemeFromExtension(theme, extension))]);
      cksOverlay.push(["extensionHasProductIconThemes", productIconThemes.some((theme) => isThemeFromExtension(theme, extension))]);
      cksOverlay.push(["extensionHasAccountPreferences", extensionUsesAuth]);
      cksOverlay.push(["canSetLanguage", extensionsWorkbenchService.canSetLanguage(extension)]);
      cksOverlay.push(["isActiveLanguagePackExtension", extension.gallery && language === getLocale(extension.gallery)]);
    }
    const actionsGroups = menuService.getMenuActions(MenuId.ExtensionContext, contextKeyService.createOverlay(cksOverlay), { shouldForwardArgs: true });
    return actionsGroups;
  });
}
function toActions(actionsGroups, instantiationService) {
  const result = [];
  for (const [, actions] of actionsGroups) {
    result.push(actions.map((action) => {
      if (action instanceof SubmenuAction) {
        return action;
      }
      return instantiationService.createInstance(MenuItemExtensionAction, action);
    }));
  }
  return result;
}
async function getContextMenuActions(extension, contextKeyService, instantiationService) {
  const actionsGroups = await getContextMenuActionsGroups(extension, contextKeyService, instantiationService);
  return toActions(actionsGroups, instantiationService);
}
let ManageExtensionAction = class extends DropDownExtensionAction {
  constructor(instantiationService, extensionService, contextKeyService, productService) {
    super(ManageExtensionAction.ID, "", "", true, instantiationService);
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.productService = productService;
    this.tooltip = localize("manage", "Manage");
    this.update();
  }
  async getActionGroups() {
    const groups = [];
    const contextMenuActionsGroups = await getContextMenuActionsGroups(this.extension, this.contextKeyService, this.instantiationService);
    const themeActions = [], installActions = [], updateActions = [], otherActionGroups = [];
    for (const [group, actions] of contextMenuActionsGroups) {
      if (group === INSTALL_ACTIONS_GROUP) {
        installActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
      } else if (group === UPDATE_ACTIONS_GROUP) {
        updateActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
      } else if (group === THEME_ACTIONS_GROUP) {
        themeActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
      } else {
        otherActionGroups.push(...toActions([[group, actions]], this.instantiationService));
      }
    }
    if (themeActions.length) {
      groups.push(themeActions);
    }
    const isChatExtension = this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId);
    if (isChatExtension) {
      groups.push([
        this.instantiationService.createInstance(EnableAIFeaturesGloballyAction),
        this.instantiationService.createInstance(EnableAIFeaturesInWorkspaceAction)
      ]);
      groups.push([
        this.instantiationService.createInstance(DisableAIFeaturesGloballyAction),
        this.instantiationService.createInstance(DisableAIFeaturesInWorkspaceAction)
      ]);
    } else {
      groups.push([
        this.instantiationService.createInstance(EnableGloballyAction),
        this.instantiationService.createInstance(EnableForWorkspaceAction)
      ]);
      groups.push([
        this.instantiationService.createInstance(DisableGloballyAction),
        this.instantiationService.createInstance(DisableForWorkspaceAction)
      ]);
    }
    if (updateActions.length) {
      groups.push(updateActions);
    }
    groups.push([
      ...installActions.length ? installActions : [],
      this.instantiationService.createInstance(InstallAnotherVersionAction, this.extension, false),
      this.instantiationService.createInstance(UninstallAction)
    ]);
    otherActionGroups.forEach((actions) => groups.push(actions));
    groups.forEach((group) => group.forEach((extensionAction) => {
      if (extensionAction instanceof ExtensionAction) {
        extensionAction.extension = this.extension;
      }
    }));
    return groups;
  }
  async run() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    return super.run(await this.getActionGroups());
  }
  update() {
    this.class = ManageExtensionAction.HideManageExtensionClass;
    this.enabled = false;
    if (this.extension) {
      const state = this.extension.state;
      this.enabled = state === ExtensionState.Installed;
      this.class = this.enabled || state === ExtensionState.Uninstalling ? ManageExtensionAction.Class : ManageExtensionAction.HideManageExtensionClass;
    }
  }
};
ManageExtensionAction.ID = "extensions.manage";
ManageExtensionAction.Class = `${ExtensionAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
ManageExtensionAction.HideManageExtensionClass = `${ManageExtensionAction.Class} hide`;
ManageExtensionAction = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IProductService)
], ManageExtensionAction);
class ExtensionEditorManageExtensionAction extends DropDownExtensionAction {
  constructor(contextKeyService, instantiationService) {
    super("extensionEditor.manageExtension", "", `${ExtensionAction.ICON_ACTION_CLASS} manage ${ThemeIcon.asClassName(manageExtensionIcon)}`, true, instantiationService);
    this.contextKeyService = contextKeyService;
    this.tooltip = localize("manage", "Manage");
  }
  update() {
  }
  async run() {
    const actionGroups = [];
    (await getContextMenuActions(this.extension, this.contextKeyService, this.instantiationService)).forEach((actions) => actionGroups.push(actions));
    actionGroups.forEach((group) => group.forEach((extensionAction) => {
      if (extensionAction instanceof ExtensionAction) {
        extensionAction.extension = this.extension;
      }
    }));
    return super.run(actionGroups);
  }
}
let MenuItemExtensionAction = class extends ExtensionAction {
  constructor(action, extensionsWorkbenchService) {
    super(action.id, action.label);
    this.action = action;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
  }
  get enabled() {
    return this.action.enabled;
  }
  set enabled(value) {
    this.action.enabled = value;
  }
  update() {
    if (!this.extension) {
      return;
    }
    if (this.action.id === TOGGLE_IGNORE_EXTENSION_ACTION_ID) {
      this.checked = !this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
    } else if (this.action.id === ToggleAutoUpdateForExtensionAction.ID) {
      this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
    } else if (this.action.id === ToggleAutoUpdatesForPublisherAction.ID) {
      this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
    } else {
      this.checked = this.action.checked;
    }
  }
  async run() {
    if (this.extension) {
      const id = this.extension.local ? getExtensionId(this.extension.local.manifest.publisher, this.extension.local.manifest.name) : this.extension.gallery ? getExtensionId(this.extension.gallery.publisher, this.extension.gallery.name) : this.extension.identifier.id;
      const extensionArg = {
        id: this.extension.identifier.id,
        version: this.extension.version,
        location: this.extension.local?.location,
        galleryLink: this.extension.url
      };
      await this.action.run(id, extensionArg);
    }
  }
};
MenuItemExtensionAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService)
], MenuItemExtensionAction);
let TogglePreReleaseExtensionAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, allowedExtensionsService) {
    super(TogglePreReleaseExtensionAction.ID, TogglePreReleaseExtensionAction.LABEL, TogglePreReleaseExtensionAction.DisabledClass);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.allowedExtensionsService = allowedExtensionsService;
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = TogglePreReleaseExtensionAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (this.extension.isBuiltin) {
      return;
    }
    if (this.extension.state !== ExtensionState.Installed) {
      return;
    }
    if (!this.extension.hasPreReleaseVersion) {
      return;
    }
    if (!this.extension.gallery) {
      return;
    }
    if (this.extension.preRelease) {
      if (!this.extension.isPreReleaseVersion) {
        return;
      }
      if (this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) !== true) {
        return;
      }
    }
    if (!this.extension.preRelease) {
      if (!this.extension.gallery.hasPreReleaseVersion) {
        return;
      }
      if (this.allowedExtensionsService.isAllowed(this.extension.gallery) !== true) {
        return;
      }
    }
    this.enabled = true;
    this.class = TogglePreReleaseExtensionAction.EnabledClass;
    if (this.extension.preRelease) {
      this.label = localize("togglePreRleaseDisableLabel", "Switch to Release Version");
      this.tooltip = localize("togglePreRleaseDisableTooltip", "This will switch and enable updates to release versions");
    } else {
      this.label = localize("switchToPreReleaseLabel", "Switch to Pre-Release Version");
      this.tooltip = localize("switchToPreReleaseTooltip", "This will switch to pre-release version and enable updates to latest version always");
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: !this.extension.preRelease });
    await this.extensionsWorkbenchService.togglePreRelease(this.extension);
  }
};
TogglePreReleaseExtensionAction.ID = "workbench.extensions.action.togglePreRlease";
TogglePreReleaseExtensionAction.LABEL = localize("togglePreRleaseLabel", "Pre-Release");
TogglePreReleaseExtensionAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent pre-release`;
TogglePreReleaseExtensionAction.DisabledClass = `${TogglePreReleaseExtensionAction.EnabledClass} hide`;
TogglePreReleaseExtensionAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IAllowedExtensionsService)
], TogglePreReleaseExtensionAction);
let InstallAnotherVersionAction = class extends ExtensionAction {
  constructor(extension, whenInstalled, extensionsWorkbenchService, extensionManagementService, extensionGalleryService, quickInputService, instantiationService, dialogService, allowedExtensionsService) {
    super(InstallAnotherVersionAction.ID, InstallAnotherVersionAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.whenInstalled = whenInstalled;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.allowedExtensionsService = allowedExtensionsService;
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this.extension = extension;
    this.update();
  }
  update() {
    this.enabled = !!this.extension && !this.extension.isBuiltin && !!this.extension.identifier.uuid && !this.extension.deprecationInfo && this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) === true;
    if (this.enabled && this.whenInstalled) {
      this.enabled = !!this.extension?.local && !!this.extension.server && this.extension.state === ExtensionState.Installed;
    }
  }
  async run() {
    if (!this.enabled) {
      return;
    }
    if (!this.extension) {
      return;
    }
    const targetPlatform = this.extension.server ? await this.extension.server.extensionManagementService.getTargetPlatform() : await this.extensionManagementService.getTargetPlatform();
    const allVersions = await this.extensionGalleryService.getAllCompatibleVersions(this.extension.identifier, this.extension.local?.preRelease ?? this.extension.gallery?.properties.isPreReleaseVersion ?? false, targetPlatform);
    if (!allVersions.length) {
      await this.dialogService.info(localize("no versions", "This extension has no other versions."));
      return;
    }
    const picks = allVersions.map((v, i) => {
      return {
        id: v.version,
        label: v.version,
        description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${localize("pre-release", "pre-release")})` : ""}${v.version === this.extension?.local?.manifest.version ? ` (${localize("current", "current")})` : ""}`,
        ariaLabel: `${v.isPreReleaseVersion ? "Pre-Release version" : "Release version"} ${v.version}`,
        isPreReleaseVersion: v.isPreReleaseVersion
      };
    });
    const pick = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("selectVersion", "Select Version to Install"),
        matchOnDetail: true
      }
    );
    if (pick) {
      if (this.extension.local?.manifest.version === pick.id) {
        return;
      }
      const options = { installPreReleaseVersion: pick.isPreReleaseVersion, version: pick.id };
      try {
        await this.extensionsWorkbenchService.install(this.extension, options);
      } catch (error) {
        this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, options, pick.id, InstallOperation.Install, error).run();
      }
    }
    return null;
  }
};
InstallAnotherVersionAction.ID = "workbench.extensions.action.install.anotherVersion";
InstallAnotherVersionAction.LABEL = localize("install another version", "Install Specific Version...");
InstallAnotherVersionAction = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IWorkbenchExtensionManagementService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IAllowedExtensionsService)
], InstallAnotherVersionAction);
let EnableForWorkspaceAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, productService) {
    super(EnableForWorkspaceAction.ID, EnableForWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.productService = productService;
    this.tooltip = localize("enableForWorkspaceActionToolTip", "Enable this extension only in this workspace");
    this.update();
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && !this.extensionEnablementService.isEnabled(this.extension.local) && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledWorkspace);
  }
};
EnableForWorkspaceAction.ID = "extensions.enableForWorkspace";
EnableForWorkspaceAction.LABEL = localize("enableForWorkspaceAction", "Enable (Workspace)");
EnableForWorkspaceAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IProductService)
], EnableForWorkspaceAction);
let EnableGloballyAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, productService) {
    super(EnableGloballyAction.ID, EnableGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.productService = productService;
    this.tooltip = localize("enableGloballyActionToolTip", "Enable this extension");
    this.update();
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isDisabledGlobally(this.extension.local) && this.extensionEnablementService.canChangeEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledGlobally);
  }
};
EnableGloballyAction.ID = "extensions.enableGlobally";
EnableGloballyAction.LABEL = localize("enableGloballyAction", "Enable");
EnableGloballyAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IProductService)
], EnableGloballyAction);
let DisableForWorkspaceAction = class extends ExtensionAction {
  constructor(workspaceContextService, extensionsWorkbenchService, extensionEnablementService, extensionService, productService) {
    super(DisableForWorkspaceAction.ID, DisableForWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.workspaceContextService = workspaceContextService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionService = extensionService;
    this.productService = productService;
    this.tooltip = localize("disableForWorkspaceActionToolTip", "Disable this extension only in this workspace");
    this.update();
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier) && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY)) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace) && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledWorkspace);
  }
};
DisableForWorkspaceAction.ID = "extensions.disableForWorkspace";
DisableForWorkspaceAction.LABEL = localize("disableForWorkspaceAction", "Disable (Workspace)");
DisableForWorkspaceAction = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IWorkbenchExtensionEnablementService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IProductService)
], DisableForWorkspaceAction);
let DisableGloballyAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, extensionService, productService) {
    super(DisableGloballyAction.ID, DisableGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionService = extensionService;
    this.productService = productService;
    this.tooltip = localize("disableGloballyActionToolTip", "Disable this extension");
    this.update();
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace) && this.extensionEnablementService.canChangeEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledGlobally);
  }
};
DisableGloballyAction.ID = "extensions.disableGlobally";
DisableGloballyAction.LABEL = localize("disableGloballyAction", "Disable");
DisableGloballyAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IProductService)
], DisableGloballyAction);
let EnableAIFeaturesGloballyAction = class extends ExtensionAction {
  constructor(productService, configurationService) {
    super(EnableAIFeaturesGloballyAction.ID, EnableAIFeaturesGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.configurationService = configurationService;
    this.tooltip = localize("enableAIGloballyActionToolTip", "Enable AI features");
    this.update();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.update();
      }
    }));
  }
  update() {
    this.enabled = false;
    if (!this.extension?.local) {
      return;
    }
    if (!ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      return;
    }
    if (this.extension.enablementState === EnablementState.DisabledWorkspace) {
      return;
    }
    if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
      return;
    }
    const inspect = this.configurationService.inspect(ChatAIDisabledSettingId);
    if (inspect?.workspaceValue === true) {
      return;
    }
    this.enabled = inspect.value === true;
  }
  async run() {
    await this.configurationService.updateValue(ChatAIDisabledSettingId, false);
  }
};
EnableAIFeaturesGloballyAction.ID = "extensions.enableAIGlobally";
EnableAIFeaturesGloballyAction.LABEL = localize("enableAIGloballyAction", "Enable AI Features");
EnableAIFeaturesGloballyAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService)
], EnableAIFeaturesGloballyAction);
let EnableAIFeaturesInWorkspaceAction = class extends ExtensionAction {
  constructor(productService, extensionsWorkbenchService, configurationService, extensionEnablementService) {
    super(EnableAIFeaturesInWorkspaceAction.ID, EnableAIFeaturesInWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.configurationService = configurationService;
    this.extensionEnablementService = extensionEnablementService;
    this.tooltip = localize("enableAIInWorkspaceActionToolTip", "Enable AI features in this workspace");
    this.update();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.update();
      }
    }));
  }
  update() {
    this.enabled = false;
    if (!this.extension?.local) {
      return;
    }
    if (!ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      return;
    }
    if (!this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local)) {
      return;
    }
    const inspect = this.configurationService.inspect(ChatAIDisabledSettingId);
    if (inspect.value === false) {
      return;
    }
    if (inspect?.workspaceValue === true) {
      this.enabled = true;
      return;
    }
    if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
      return;
    }
    this.enabled = true;
    return;
  }
  async run() {
    if (!this.extension) {
      return;
    }
    await this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledWorkspace);
    if (this.configurationService.getValue(ChatAIDisabledSettingId) === true) {
      await this.configurationService.updateValue(ChatAIDisabledSettingId, false, ConfigurationTarget.WORKSPACE);
    }
  }
};
EnableAIFeaturesInWorkspaceAction.ID = "extensions.enableAIInWorkspace";
EnableAIFeaturesInWorkspaceAction.LABEL = localize("enableAIInWorkspaceAction", "Enable AI Features (Workspace)");
EnableAIFeaturesInWorkspaceAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], EnableAIFeaturesInWorkspaceAction);
let DisableAIFeaturesGloballyAction = class extends ExtensionAction {
  constructor(productService, configurationService) {
    super(DisableAIFeaturesGloballyAction.ID, DisableAIFeaturesGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.configurationService = configurationService;
    this.tooltip = localize("disableAIGloballyActionToolTip", "Disable AI features");
    this.update();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.update();
      }
    }));
  }
  update() {
    this.enabled = false;
    if (this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      this.enabled = this.extension.state === ExtensionState.Installed && this.configurationService.getValue(ChatAIDisabledSettingId) !== true && this.extension.enablementState !== EnablementState.DisabledWorkspace;
    }
  }
  async run() {
    await this.configurationService.updateValue(ChatAIDisabledSettingId, true);
  }
};
DisableAIFeaturesGloballyAction.ID = "extensions.disableAIGlobally";
DisableAIFeaturesGloballyAction.LABEL = localize("disableAIGloballyAction", "Disable AI Features");
DisableAIFeaturesGloballyAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService)
], DisableAIFeaturesGloballyAction);
let DisableAIFeaturesInWorkspaceAction = class extends ExtensionAction {
  constructor(productService, extensionsWorkbenchService, extensionEnablementService, extensionService) {
    super(DisableAIFeaturesInWorkspaceAction.ID, DisableAIFeaturesInWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionService = extensionService;
    this.tooltip = localize("disableAIInWorkspaceActionToolTip", "Disable AI features in this workspace");
    this.update();
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace) && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    await this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledWorkspace);
    await this.extensionsWorkbenchService.updateRunningExtensions(localize("restartExtensionHost.reason.disable", "Disabling AI features"));
  }
};
DisableAIFeaturesInWorkspaceAction.ID = "extensions.disableAIInWorkspace";
DisableAIFeaturesInWorkspaceAction.LABEL = localize("disableAIInWorkspaceAction", "Disable AI Features (Workspace)");
DisableAIFeaturesInWorkspaceAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IWorkbenchExtensionEnablementService),
  __decorateParam(3, IExtensionService)
], DisableAIFeaturesInWorkspaceAction);
let EnableDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("extensions.enable", ExtensionAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(EnableGloballyAction),
        instantiationService.createInstance(EnableForWorkspaceAction)
      ],
      [
        instantiationService.createInstance(EnableAIFeaturesGloballyAction),
        instantiationService.createInstance(EnableAIFeaturesInWorkspaceAction)
      ]
    ]);
  }
};
EnableDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], EnableDropDownAction);
let DisableDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("extensions.disable", ExtensionAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(DisableGloballyAction),
        instantiationService.createInstance(DisableForWorkspaceAction)
      ],
      [
        instantiationService.createInstance(DisableAIFeaturesGloballyAction),
        instantiationService.createInstance(DisableAIFeaturesInWorkspaceAction)
      ]
    ]);
  }
};
DisableDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], DisableDropDownAction);
let ExtensionRuntimeStateAction = class extends ExtensionAction {
  constructor(hostService, extensionsWorkbenchService, updateService, extensionService, productService, telemetryService) {
    super("extensions.runtimeState", "", ExtensionRuntimeStateAction.DisabledClass, false);
    this.hostService = hostService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.updateService = updateService;
    this.extensionService = extensionService;
    this.productService = productService;
    this.telemetryService = telemetryService;
    this.updateWhenCounterExtensionChanges = true;
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
    this.update();
  }
  update() {
    this.enabled = false;
    this.tooltip = "";
    this.class = ExtensionRuntimeStateAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    const state = this.extension.state;
    if (state === ExtensionState.Installing || state === ExtensionState.Uninstalling) {
      return;
    }
    if (this.extension.local && this.extension.local.manifest && this.extension.local.manifest.contributes && this.extension.local.manifest.contributes.localizations && this.extension.local.manifest.contributes.localizations.length > 0) {
      return;
    }
    const runtimeState = this.extension.runtimeState;
    if (!runtimeState) {
      return;
    }
    this.enabled = true;
    this.class = ExtensionRuntimeStateAction.EnabledClass;
    this.tooltip = runtimeState.reason;
    this.label = runtimeState.action === ExtensionRuntimeActionType.ReloadWindow ? localize("reload window", "Reload Window") : runtimeState.action === ExtensionRuntimeActionType.RestartExtensions ? localize("restart extensions", "Restart Extensions") : runtimeState.action === ExtensionRuntimeActionType.QuitAndInstall ? localize("restart product", "Restart to Update") : runtimeState.action === ExtensionRuntimeActionType.ApplyUpdate || runtimeState.action === ExtensionRuntimeActionType.DownloadUpdate ? localize("update product", "Update {0}", this.productService.nameShort) : "";
  }
  async run() {
    const runtimeState = this.extension?.runtimeState;
    if (!runtimeState?.action) {
      return;
    }
    this.telemetryService.publicLog2("extensions:runtimestate:action", {
      action: runtimeState.action
    });
    if (runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow) {
      return this.hostService.reload();
    } else if (runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions) {
      return this.extensionsWorkbenchService.updateRunningExtensions();
    } else if (runtimeState?.action === ExtensionRuntimeActionType.DownloadUpdate) {
      return this.updateService.downloadUpdate(true);
    } else if (runtimeState?.action === ExtensionRuntimeActionType.ApplyUpdate) {
      return this.updateService.applyUpdate();
    } else if (runtimeState?.action === ExtensionRuntimeActionType.QuitAndInstall) {
      return this.updateService.quitAndInstall();
    }
  }
};
ExtensionRuntimeStateAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent reload`;
ExtensionRuntimeStateAction.DisabledClass = `${ExtensionRuntimeStateAction.EnabledClass} disabled`;
ExtensionRuntimeStateAction = __decorateClass([
  __decorateParam(0, IHostService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IUpdateService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IProductService),
  __decorateParam(5, ITelemetryService)
], ExtensionRuntimeStateAction);
function isThemeFromExtension(theme, extension) {
  return !!(extension && theme.extensionData && ExtensionIdentifier.equals(theme.extensionData.extensionId, extension.identifier.id));
}
function getQuickPickEntries(themes, currentTheme, extension, showCurrentTheme) {
  const picks = [];
  for (const theme of themes) {
    if (isThemeFromExtension(theme, extension) && !(showCurrentTheme && theme === currentTheme)) {
      picks.push({ label: theme.label, id: theme.id });
    }
  }
  if (showCurrentTheme) {
    picks.push({ type: "separator", label: localize("current", "current") });
    picks.push({ label: currentTheme.label, id: currentTheme.id });
  }
  return picks;
}
let SetColorThemeAction = class extends ExtensionAction {
  constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
    super(SetColorThemeAction.ID, SetColorThemeAction.TITLE.value, SetColorThemeAction.DisabledClass, false);
    this.workbenchThemeService = workbenchThemeService;
    this.quickInputService = quickInputService;
    this.extensionEnablementService = extensionEnablementService;
    this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidColorThemeChange)(() => this.update(), this));
    this.update();
  }
  update() {
    this.workbenchThemeService.getColorThemes().then((colorThemes) => {
      this.enabled = this.computeEnablement(colorThemes);
      this.class = this.enabled ? SetColorThemeAction.EnabledClass : SetColorThemeAction.DisabledClass;
    });
  }
  computeEnablement(colorThemes) {
    return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemes.some((th) => isThemeFromExtension(th, this.extension));
  }
  async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
    const colorThemes = await this.workbenchThemeService.getColorThemes();
    if (!this.computeEnablement(colorThemes)) {
      return;
    }
    const currentTheme = this.workbenchThemeService.getColorTheme();
    const delayer = new Delayer(100);
    const picks = getQuickPickEntries(colorThemes, currentTheme, this.extension, showCurrentTheme);
    const pickedTheme = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("select color theme", "Select Color Theme"),
        onDidFocus: (item) => delayer.trigger(() => this.workbenchThemeService.setColorTheme(item.id, void 0)),
        ignoreFocusLost
      }
    );
    return this.workbenchThemeService.setColorTheme(pickedTheme ? pickedTheme.id : currentTheme.id, "auto");
  }
};
SetColorThemeAction.ID = "workbench.extensions.action.setColorTheme";
SetColorThemeAction.TITLE = localize2("workbench.extensions.action.setColorTheme", "Set Color Theme");
SetColorThemeAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
SetColorThemeAction.DisabledClass = `${SetColorThemeAction.EnabledClass} disabled`;
SetColorThemeAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], SetColorThemeAction);
let SetFileIconThemeAction = class extends ExtensionAction {
  constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
    super(SetFileIconThemeAction.ID, SetFileIconThemeAction.TITLE.value, SetFileIconThemeAction.DisabledClass, false);
    this.workbenchThemeService = workbenchThemeService;
    this.quickInputService = quickInputService;
    this.extensionEnablementService = extensionEnablementService;
    this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidFileIconThemeChange)(() => this.update(), this));
    this.update();
  }
  update() {
    this.workbenchThemeService.getFileIconThemes().then((fileIconThemes) => {
      this.enabled = this.computeEnablement(fileIconThemes);
      this.class = this.enabled ? SetFileIconThemeAction.EnabledClass : SetFileIconThemeAction.DisabledClass;
    });
  }
  computeEnablement(colorThemfileIconThemess) {
    return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemfileIconThemess.some((th) => isThemeFromExtension(th, this.extension));
  }
  async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
    const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
    if (!this.computeEnablement(fileIconThemes)) {
      return;
    }
    const currentTheme = this.workbenchThemeService.getFileIconTheme();
    const delayer = new Delayer(100);
    const picks = getQuickPickEntries(fileIconThemes, currentTheme, this.extension, showCurrentTheme);
    const pickedTheme = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("select file icon theme", "Select File Icon Theme"),
        onDidFocus: (item) => delayer.trigger(() => this.workbenchThemeService.setFileIconTheme(item.id, void 0)),
        ignoreFocusLost
      }
    );
    return this.workbenchThemeService.setFileIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, "auto");
  }
};
SetFileIconThemeAction.ID = "workbench.extensions.action.setFileIconTheme";
SetFileIconThemeAction.TITLE = localize2("workbench.extensions.action.setFileIconTheme", "Set File Icon Theme");
SetFileIconThemeAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
SetFileIconThemeAction.DisabledClass = `${SetFileIconThemeAction.EnabledClass} disabled`;
SetFileIconThemeAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], SetFileIconThemeAction);
let SetProductIconThemeAction = class extends ExtensionAction {
  constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
    super(SetProductIconThemeAction.ID, SetProductIconThemeAction.TITLE.value, SetProductIconThemeAction.DisabledClass, false);
    this.workbenchThemeService = workbenchThemeService;
    this.quickInputService = quickInputService;
    this.extensionEnablementService = extensionEnablementService;
    this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidProductIconThemeChange)(() => this.update(), this));
    this.update();
  }
  update() {
    this.workbenchThemeService.getProductIconThemes().then((productIconThemes) => {
      this.enabled = this.computeEnablement(productIconThemes);
      this.class = this.enabled ? SetProductIconThemeAction.EnabledClass : SetProductIconThemeAction.DisabledClass;
    });
  }
  computeEnablement(productIconThemes) {
    return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && productIconThemes.some((th) => isThemeFromExtension(th, this.extension));
  }
  async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
    const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
    if (!this.computeEnablement(productIconThemes)) {
      return;
    }
    const currentTheme = this.workbenchThemeService.getProductIconTheme();
    const delayer = new Delayer(100);
    const picks = getQuickPickEntries(productIconThemes, currentTheme, this.extension, showCurrentTheme);
    const pickedTheme = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("select product icon theme", "Select Product Icon Theme"),
        onDidFocus: (item) => delayer.trigger(() => this.workbenchThemeService.setProductIconTheme(item.id, void 0)),
        ignoreFocusLost
      }
    );
    return this.workbenchThemeService.setProductIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, "auto");
  }
};
SetProductIconThemeAction.ID = "workbench.extensions.action.setProductIconTheme";
SetProductIconThemeAction.TITLE = localize2("workbench.extensions.action.setProductIconTheme", "Set Product Icon Theme");
SetProductIconThemeAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
SetProductIconThemeAction.DisabledClass = `${SetProductIconThemeAction.EnabledClass} disabled`;
SetProductIconThemeAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], SetProductIconThemeAction);
let SetLanguageAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService) {
    super(SetLanguageAction.ID, SetLanguageAction.TITLE.value, SetLanguageAction.DisabledClass, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = SetLanguageAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (!this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.gallery && language === getLocale(this.extension.gallery)) {
      return;
    }
    this.enabled = true;
    this.class = SetLanguageAction.EnabledClass;
  }
  async run() {
    return this.extension && this.extensionsWorkbenchService.setLanguage(this.extension);
  }
};
SetLanguageAction.ID = "workbench.extensions.action.setDisplayLanguage";
SetLanguageAction.TITLE = localize2("workbench.extensions.action.setDisplayLanguage", "Set Display Language");
SetLanguageAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
SetLanguageAction.DisabledClass = `${SetLanguageAction.EnabledClass} disabled`;
SetLanguageAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], SetLanguageAction);
let ClearLanguageAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, localeService) {
    super(ClearLanguageAction.ID, ClearLanguageAction.TITLE.value, ClearLanguageAction.DisabledClass, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.localeService = localeService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ClearLanguageAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (!this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.gallery && language !== getLocale(this.extension.gallery)) {
      return;
    }
    this.enabled = true;
    this.class = ClearLanguageAction.EnabledClass;
  }
  async run() {
    return this.extension && this.localeService.clearLocalePreference();
  }
};
ClearLanguageAction.ID = "workbench.extensions.action.clearLanguage";
ClearLanguageAction.TITLE = localize2("workbench.extensions.action.clearLanguage", "Clear Display Language");
ClearLanguageAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
ClearLanguageAction.DisabledClass = `${ClearLanguageAction.EnabledClass} disabled`;
ClearLanguageAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, ILocaleService)
], ClearLanguageAction);
let ShowRecommendedExtensionAction = class extends Action {
  constructor(extensionId, extensionWorkbenchService) {
    super(ShowRecommendedExtensionAction.ID, ShowRecommendedExtensionAction.LABEL, void 0, false);
    this.extensionWorkbenchService = extensionWorkbenchService;
    this.extensionId = extensionId;
  }
  async run() {
    await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
    const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: "install-recommendation" }, CancellationToken.None);
    if (extension) {
      return this.extensionWorkbenchService.open(extension);
    }
    return null;
  }
};
ShowRecommendedExtensionAction.ID = "workbench.extensions.action.showRecommendedExtension";
ShowRecommendedExtensionAction.LABEL = localize("showRecommendedExtension", "Show Recommended Extension");
ShowRecommendedExtensionAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService)
], ShowRecommendedExtensionAction);
let InstallRecommendedExtensionAction = class extends Action {
  constructor(extensionId, instantiationService, extensionWorkbenchService) {
    super(InstallRecommendedExtensionAction.ID, InstallRecommendedExtensionAction.LABEL, void 0, false);
    this.instantiationService = instantiationService;
    this.extensionWorkbenchService = extensionWorkbenchService;
    this.extensionId = extensionId;
  }
  async run() {
    await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
    const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: "install-recommendation" }, CancellationToken.None);
    if (extension) {
      await this.extensionWorkbenchService.open(extension);
      try {
        await this.extensionWorkbenchService.install(extension);
      } catch (err) {
        this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, void 0, extension.latestVersion, InstallOperation.Install, err).run();
      }
    }
  }
};
InstallRecommendedExtensionAction.ID = "workbench.extensions.action.installRecommendedExtension";
InstallRecommendedExtensionAction.LABEL = localize("installRecommendedExtension", "Install Recommended Extension");
InstallRecommendedExtensionAction = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IExtensionsWorkbenchService)
], InstallRecommendedExtensionAction);
let IgnoreExtensionRecommendationAction = class extends Action {
  constructor(extension, extensionRecommendationsManagementService) {
    super(IgnoreExtensionRecommendationAction.ID, "Ignore Recommendation");
    this.extension = extension;
    this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
    this.class = IgnoreExtensionRecommendationAction.Class;
    this.tooltip = localize("ignoreExtensionRecommendation", "Do not recommend this extension again");
    this.enabled = true;
  }
  run() {
    this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, true);
    return Promise.resolve();
  }
};
IgnoreExtensionRecommendationAction.ID = "extensions.ignore";
IgnoreExtensionRecommendationAction.Class = `${ExtensionAction.LABEL_ACTION_CLASS} ignore`;
IgnoreExtensionRecommendationAction = __decorateClass([
  __decorateParam(1, IExtensionIgnoredRecommendationsService)
], IgnoreExtensionRecommendationAction);
let UndoIgnoreExtensionRecommendationAction = class extends Action {
  constructor(extension, extensionRecommendationsManagementService) {
    super(UndoIgnoreExtensionRecommendationAction.ID, "Undo");
    this.extension = extension;
    this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
    this.class = UndoIgnoreExtensionRecommendationAction.Class;
    this.tooltip = localize("undo", "Undo");
    this.enabled = true;
  }
  run() {
    this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, false);
    return Promise.resolve();
  }
};
UndoIgnoreExtensionRecommendationAction.ID = "extensions.ignore";
UndoIgnoreExtensionRecommendationAction.Class = `${ExtensionAction.LABEL_ACTION_CLASS} undo-ignore`;
UndoIgnoreExtensionRecommendationAction = __decorateClass([
  __decorateParam(1, IExtensionIgnoredRecommendationsService)
], UndoIgnoreExtensionRecommendationAction);
let AbstractConfigureRecommendedExtensionsAction = class extends Action {
  constructor(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService) {
    super(id, label);
    this.contextService = contextService;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.editorService = editorService;
    this.jsonEditingService = jsonEditingService;
    this.textModelResolverService = textModelResolverService;
  }
  openExtensionsFile(extensionsFileResource) {
    return this.getOrCreateExtensionsFile(extensionsFileResource).then(
      ({ created, content }) => this.getSelectionPosition(content, extensionsFileResource, ["recommendations"]).then((selection) => this.editorService.openEditor({
        resource: extensionsFileResource,
        options: {
          pinned: created,
          selection
        }
      })),
      (error) => Promise.reject(new Error(localize("OpenExtensionsFile.failed", "Unable to create 'extensions.json' file inside the '.vscode' folder ({0}).", error)))
    );
  }
  openWorkspaceConfigurationFile(workspaceConfigurationFile) {
    return this.getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile).then((content) => this.getSelectionPosition(content.value.toString(), content.resource, ["extensions", "recommendations"])).then((selection) => this.editorService.openEditor({
      resource: workspaceConfigurationFile,
      options: {
        selection,
        forceReload: true
        // because content has changed
      }
    }));
  }
  getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile) {
    return Promise.resolve(this.fileService.readFile(workspaceConfigurationFile)).then((content) => {
      const workspaceRecommendations = json.parse(content.value.toString())["extensions"];
      if (!workspaceRecommendations || !workspaceRecommendations.recommendations) {
        return this.jsonEditingService.write(workspaceConfigurationFile, [{ path: ["extensions"], value: { recommendations: [] } }], true).then(() => this.fileService.readFile(workspaceConfigurationFile));
      }
      return content;
    });
  }
  getSelectionPosition(content, resource, path) {
    const tree = json.parseTree(content);
    const node = json.findNodeAtLocation(tree, path);
    if (node && node.parent && node.parent.children) {
      const recommendationsValueNode = node.parent.children[1];
      const lastExtensionNode = recommendationsValueNode.children && recommendationsValueNode.children.length ? recommendationsValueNode.children[recommendationsValueNode.children.length - 1] : null;
      const offset = lastExtensionNode ? lastExtensionNode.offset + lastExtensionNode.length : recommendationsValueNode.offset + 1;
      return Promise.resolve(this.textModelResolverService.createModelReference(resource)).then((reference) => {
        const position = reference.object.textEditorModel.getPositionAt(offset);
        reference.dispose();
        return {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        };
      });
    }
    return Promise.resolve(void 0);
  }
  getOrCreateExtensionsFile(extensionsFileResource) {
    return Promise.resolve(this.fileService.readFile(extensionsFileResource)).then((content) => {
      return { created: false, extensionsFileResource, content: content.value.toString() };
    }, (err) => {
      return this.textFileService.write(extensionsFileResource, ExtensionsConfigurationInitialContent).then(() => {
        return { created: true, extensionsFileResource, content: ExtensionsConfigurationInitialContent };
      });
    });
  }
};
AbstractConfigureRecommendedExtensionsAction = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IJSONEditingService),
  __decorateParam(7, ITextModelService)
], AbstractConfigureRecommendedExtensionsAction);
let ConfigureWorkspaceRecommendedExtensionsAction = class extends AbstractConfigureRecommendedExtensionsAction {
  constructor(id, label, fileService, textFileService, contextService, editorService, jsonEditingService, textModelResolverService) {
    super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.update(), this));
    this.update();
  }
  update() {
    this.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  run() {
    switch (this.contextService.getWorkbenchState()) {
      case WorkbenchState.FOLDER:
        return this.openExtensionsFile(this.contextService.getWorkspace().folders[0].toResource(EXTENSIONS_CONFIG));
      case WorkbenchState.WORKSPACE:
        return this.openWorkspaceConfigurationFile(this.contextService.getWorkspace().configuration);
    }
    return Promise.resolve();
  }
};
ConfigureWorkspaceRecommendedExtensionsAction.ID = "workbench.extensions.action.configureWorkspaceRecommendedExtensions";
ConfigureWorkspaceRecommendedExtensionsAction.LABEL = localize("configureWorkspaceRecommendedExtensions", "Configure Recommended Extensions (Workspace)");
ConfigureWorkspaceRecommendedExtensionsAction = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IJSONEditingService),
  __decorateParam(7, ITextModelService)
], ConfigureWorkspaceRecommendedExtensionsAction);
let ConfigureWorkspaceFolderRecommendedExtensionsAction = class extends AbstractConfigureRecommendedExtensionsAction {
  constructor(id, label, fileService, textFileService, contextService, editorService, jsonEditingService, textModelResolverService, commandService) {
    super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
    this.commandService = commandService;
  }
  run() {
    const folderCount = this.contextService.getWorkspace().folders.length;
    const pickFolderPromise = folderCount === 1 ? Promise.resolve(this.contextService.getWorkspace().folders[0]) : this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
    return Promise.resolve(pickFolderPromise).then((workspaceFolder) => {
      if (workspaceFolder) {
        return this.openExtensionsFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
      }
      return null;
    });
  }
};
ConfigureWorkspaceFolderRecommendedExtensionsAction.ID = "workbench.extensions.action.configureWorkspaceFolderRecommendedExtensions";
ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL = localize("configureWorkspaceFolderRecommendedExtensions", "Configure Recommended Extensions (Workspace Folder)");
ConfigureWorkspaceFolderRecommendedExtensionsAction = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IJSONEditingService),
  __decorateParam(7, ITextModelService),
  __decorateParam(8, ICommandService)
], ConfigureWorkspaceFolderRecommendedExtensionsAction);
let ExtensionStatusLabelAction = class extends Action {
  constructor(extensionService, extensionManagementServerService, extensionEnablementService) {
    super("extensions.action.statusLabel", "", ExtensionStatusLabelAction.DISABLED_CLASS, false);
    this.extensionService = extensionService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionEnablementService = extensionEnablementService;
    this.initialStatus = null;
    this.status = null;
    this.version = null;
    this.enablementState = null;
    this._extension = null;
  }
  get extension() {
    return this._extension;
  }
  set extension(extension) {
    if (!(this._extension && extension && areSameExtensions(this._extension.identifier, extension.identifier))) {
      this.initialStatus = null;
      this.status = null;
      this.enablementState = null;
    }
    this._extension = extension;
    this.update();
  }
  update() {
    const label = this.computeLabel();
    this.label = label || "";
    this.class = label ? ExtensionStatusLabelAction.ENABLED_CLASS : ExtensionStatusLabelAction.DISABLED_CLASS;
  }
  computeLabel() {
    if (!this.extension) {
      return null;
    }
    const currentStatus = this.status;
    const currentVersion = this.version;
    const currentEnablementState = this.enablementState;
    this.status = this.extension.state;
    this.version = this.extension.version;
    if (this.initialStatus === null) {
      this.initialStatus = this.status;
    }
    this.enablementState = this.extension.enablementState;
    const canAddExtension = () => {
      const runningExtension = this.extensionService.extensions.filter((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))[0];
      if (this.extension.local) {
        if (runningExtension && this.extension.version === runningExtension.version) {
          return true;
        }
        return this.extensionService.canAddExtension(toExtensionDescription(this.extension.local));
      }
      return false;
    };
    const canRemoveExtension = () => {
      if (this.extension.local) {
        if (this.extensionService.extensions.every((e) => !(areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier) && this.extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(e))))) {
          return true;
        }
        return this.extensionService.canRemoveExtension(toExtensionDescription(this.extension.local));
      }
      return false;
    };
    if (currentStatus !== null) {
      if (currentStatus === ExtensionState.Installing && this.status === ExtensionState.Installed) {
        if (this.initialStatus === ExtensionState.Uninstalled && canAddExtension()) {
          return localize("installed", "Installed");
        }
        if (this.initialStatus === ExtensionState.Installed && this.version !== currentVersion && canAddExtension()) {
          return localize("updated", "Updated");
        }
        return null;
      }
      if (currentStatus === ExtensionState.Uninstalling && this.status === ExtensionState.Uninstalled) {
        this.initialStatus = this.status;
        return canRemoveExtension() ? localize("uninstalled", "Uninstalled") : null;
      }
    }
    if (currentEnablementState !== null) {
      const currentlyEnabled = this.extensionEnablementService.isEnabledEnablementState(currentEnablementState);
      const enabled = this.extensionEnablementService.isEnabledEnablementState(this.enablementState);
      if (!currentlyEnabled && enabled) {
        return canAddExtension() ? localize("enabled", "Enabled") : null;
      }
      if (currentlyEnabled && !enabled) {
        return canRemoveExtension() ? localize("disabled", "Disabled") : null;
      }
    }
    return null;
  }
  run() {
    return Promise.resolve();
  }
};
ExtensionStatusLabelAction.ENABLED_CLASS = `${ExtensionAction.TEXT_ACTION_CLASS} extension-status-label`;
ExtensionStatusLabelAction.DISABLED_CLASS = `${ExtensionStatusLabelAction.ENABLED_CLASS} hide`;
ExtensionStatusLabelAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IWorkbenchExtensionEnablementService)
], ExtensionStatusLabelAction);
let ToggleSyncExtensionAction = class extends DropDownExtensionAction {
  constructor(configurationService, extensionsWorkbenchService, userDataSyncEnablementService, instantiationService) {
    super("extensions.sync", "", ToggleSyncExtensionAction.SYNC_CLASS, false, instantiationService);
    this.configurationService = configurationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.ignoredExtensions"))(() => this.update()));
    this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
    this.update();
  }
  update() {
    this.enabled = !!this.extension && this.userDataSyncEnablementService.isEnabled() && this.extension.state === ExtensionState.Installed;
    if (this.extension) {
      const isIgnored = this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
      this.class = isIgnored ? ToggleSyncExtensionAction.IGNORED_SYNC_CLASS : ToggleSyncExtensionAction.SYNC_CLASS;
      this.tooltip = isIgnored ? localize("ignored", "This extension is ignored during sync") : localize("synced", "This extension is synced");
    }
  }
  async run() {
    return super.run([
      [
        new Action(
          "extensions.syncignore",
          this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension) ? localize("sync", "Sync this extension") : localize("do not sync", "Do not sync this extension"),
          void 0,
          true,
          () => this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(this.extension)
        )
      ]
    ]);
  }
};
ToggleSyncExtensionAction.IGNORED_SYNC_CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncIgnoredIcon)}`;
ToggleSyncExtensionAction.SYNC_CLASS = `${ToggleSyncExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncEnabledIcon)}`;
ToggleSyncExtensionAction = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IUserDataSyncEnablementService),
  __decorateParam(3, IInstantiationService)
], ToggleSyncExtensionAction);
let ExtensionStatusAction = class extends ExtensionAction {
  constructor(extensionManagementServerService, labelService, commandService, workspaceTrustEnablementService, workspaceTrustService, extensionsWorkbenchService, extensionService, extensionManifestPropertiesService, contextService, productService, allowedExtensionsService, workbenchExtensionEnablementService, extensionFeaturesManagementService, extensionGalleryManifestService, configurationService) {
    super("extensions.status", "", `${ExtensionStatusAction.CLASS} hide`, false);
    this.extensionManagementServerService = extensionManagementServerService;
    this.labelService = labelService;
    this.commandService = commandService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.workspaceTrustService = workspaceTrustService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionService = extensionService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.contextService = contextService;
    this.productService = productService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.workbenchExtensionEnablementService = workbenchExtensionEnablementService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.configurationService = configurationService;
    this.updateWhenCounterExtensionChanges = true;
    this._status = [];
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this.updateThrottler = this._register(new Throttler());
    this._register(this.labelService.onDidChangeFormatters(() => this.update(), this));
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
    this._register(this.extensionFeaturesManagementService.onDidChangeAccessData(() => this.update()));
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
        this.update();
      }
    }));
    this.update();
  }
  get status() {
    return this._status;
  }
  update() {
    this.recomputeStatus();
  }
  /**
   * Recomputes the status and returns a promise that resolves when the
   * computation is done. Use this when callers need to await time-sensitive
   * status content (e.g. the delayed auto-update message) before reading it.
   */
  recomputeStatus() {
    return this.updateThrottler.queue(() => this.computeAndUpdateStatus());
  }
  async computeAndUpdateStatus() {
    this.updateStatus(void 0, true);
    this.enabled = false;
    if (!this.extension) {
      return;
    }
    if (this.extension.isMalicious) {
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("malicious tooltip", "This extension was reported to be problematic.")) }, true);
      return;
    }
    if (this.extension.state === ExtensionState.Uninstalled && this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("not signed tooltip", "This extension is not signed by the Extension Marketplace.")) }, true);
      return;
    }
    if (this.extension.deprecationInfo) {
      if (this.extension.deprecationInfo.extension) {
        const link = `[${this.extension.deprecationInfo.extension.displayName}](${createCommandUri("extension.open", this.extension.deprecationInfo.extension.id)})`;
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("deprecated with alternate extension tooltip", "This extension is deprecated. Use the {0} extension instead.", link)) }, true);
      } else if (this.extension.deprecationInfo.settings) {
        const link = `[${localize("settings", "settings")}](${createCommandUri("workbench.action.openSettings", this.extension.deprecationInfo.settings.map((setting) => `@id:${setting}`).join(" "))}})`;
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("deprecated with alternate settings tooltip", "This extension is deprecated as this functionality is now built-in to VS Code. Configure these {0} to use this functionality.", link)) }, true);
      } else {
        const message = new MarkdownString(localize("deprecated tooltip", "This extension is deprecated as it is no longer being maintained."));
        if (this.extension.deprecationInfo.additionalInfo) {
          message.appendMarkdown(` ${this.extension.deprecationInfo.additionalInfo}`);
        }
        this.updateStatus({ icon: warningIcon, message }, true);
      }
      return;
    }
    if (this.extension.missingFromGallery) {
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("missing from gallery tooltip", "This extension is no longer available on the Extension Marketplace.")) }, true);
      return;
    }
    if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.outdated) {
      let hasConsentWarning = false;
      const message = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
      if (message) {
        hasConsentWarning = true;
        const markdown = new MarkdownString();
        markdown.appendMarkdown(`${message} `);
        markdown.appendMarkdown(
          localize(
            "auto update message",
            "Please [review the extension]({0}) and update it manually.",
            this.extension.hasChangelog() ? createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Changelog).toString() : this.extension.repository ? this.extension.repository : createCommandUri("extension.open", this.extension.identifier.id).toString()
          )
        );
        this.updateStatus({ icon: warningIcon, message: markdown }, true);
      }
      if (this.extensionsWorkbenchService.isAutoUpdateDelayed(this.extension)) {
        const delay = fromNow(Date.now() - this.extensionsWorkbenchService.getAutoUpdateDelay(), false, true);
        const updateAt = fromNow(Date.now() + this.extensionsWorkbenchService.getAutoUpdateDelayRemaining(this.extension), false, true);
        this.updateStatus({ icon: infoIcon, message: new MarkdownString(localize("autoUpdateDelayed", "This extension is not updated yet because new versions are auto updated {0} after they are published. It will be auto updated {1}.", delay, updateAt)) }, !hasConsentWarning);
      }
    }
    if (this.extension.gallery && this.extension.state === ExtensionState.Uninstalled) {
      const result = await this.extensionsWorkbenchService.canInstall(this.extension);
      if (result !== true) {
        this.updateStatus({ icon: warningIcon, message: result }, true);
        return;
      }
    }
    if (!this.extension.local || !this.extension.server || this.extension.state !== ExtensionState.Installed) {
      return;
    }
    if (this.extension.enablementState === EnablementState.DisabledByAllowlist) {
      const result = this.allowedExtensionsService.isAllowed(this.extension.local);
      if (result !== true) {
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("disabled - not allowed", "This extension is disabled because {0}", result.value)) }, true);
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByEnvironment) {
      this.updateStatus({ message: new MarkdownString(localize("disabled by environment", "This extension is disabled by the environment.")) }, true);
      return;
    }
    if (this.extension.enablementState === EnablementState.EnabledByEnvironment) {
      this.updateStatus({ message: new MarkdownString(localize("enabled by environment", "This extension is enabled because it is required in the current environment.")) }, true);
      return;
    }
    if (this.extension.enablementState === EnablementState.DisabledByVirtualWorkspace) {
      const details = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.virtualWorkspaces);
      this.updateStatus({ icon: infoIcon, message: new MarkdownString(details ? escapeMarkdownSyntaxTokens(details) : localize("disabled because of virtual workspace", "This extension has been disabled because it does not support virtual workspaces.")) }, true);
      return;
    }
    if (isVirtualWorkspace(this.contextService.getWorkspace())) {
      const virtualSupportType = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(this.extension.local.manifest);
      const details = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.virtualWorkspaces);
      if (virtualSupportType === "limited" || details) {
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(details ? escapeMarkdownSyntaxTokens(details) : localize("extension limited because of virtual workspace", "This extension has limited features because the current workspace is virtual.")) }, true);
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByUnification) {
      this.updateStatus({ icon: infoIcon, message: new MarkdownString(localize("extension disabled because of unification", "All GitHub Copilot functionality is now being served from the GitHub Copilot Chat extension. To temporarily opt out of this extension unification, toggle the {0} setting.", "`chat.extensionUnification.enabled`")) }, true);
      return;
    }
    if (!this.workspaceTrustService.isWorkspaceTrusted() && // Extension is disabled by untrusted workspace
    (this.extension.enablementState === EnablementState.DisabledByTrustRequirement || // All disabled dependencies of the extension are disabled by untrusted workspace
    this.extension.enablementState === EnablementState.DisabledByExtensionDependency && this.workbenchExtensionEnablementService.getDependenciesEnablementStates(this.extension.local).every(([, enablementState]) => this.workbenchExtensionEnablementService.isEnabledEnablementState(enablementState) || enablementState === EnablementState.DisabledByTrustRequirement))) {
      this.enabled = true;
      const untrustedDetails = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.untrustedWorkspaces);
      this.updateStatus({ icon: trustIcon, message: new MarkdownString(untrustedDetails ? escapeMarkdownSyntaxTokens(untrustedDetails) : localize("extension disabled because of trust requirement", "This extension has been disabled because the current workspace is not trusted.")) }, true);
      return;
    }
    if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() && !this.workspaceTrustService.isWorkspaceTrusted()) {
      const untrustedSupportType = this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(this.extension.local.manifest);
      const untrustedDetails = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.untrustedWorkspaces);
      if (untrustedSupportType === "limited" || untrustedDetails) {
        this.enabled = true;
        this.updateStatus({ icon: trustIcon, message: new MarkdownString(untrustedDetails ? escapeMarkdownSyntaxTokens(untrustedDetails) : localize("extension limited because of trust requirement", "This extension has limited features because the current workspace is not trusted.")) }, true);
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByExtensionKind) {
      if (!this.extensionsWorkbenchService.installed.some((e) => areSameExtensions(e.identifier, this.extension.identifier) && e.server !== this.extension.server)) {
        let message;
        if (this.extensionManagementServerService.localExtensionManagementServer === this.extension.server) {
          if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
            if (this.extensionManagementServerService.remoteExtensionManagementServer) {
              message = new MarkdownString(`${localize("Install in remote server to enable", "This extension is disabled in this workspace because it is defined to run in the Remote Extension Host. Please install the extension in '{0}' to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
            }
          }
        } else if (this.extensionManagementServerService.remoteExtensionManagementServer === this.extension.server) {
          if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
            if (this.extensionManagementServerService.localExtensionManagementServer) {
              message = new MarkdownString(`${localize("Install in local server to enable", "This extension is disabled in this workspace because it is defined to run in the Local Extension Host. Please install the extension locally to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
            } else if (isWeb) {
              message = new MarkdownString(`${localize("Defined to run in desktop", "This extension is disabled because it is defined to run only in {0} for the Desktop.", this.productService.nameLong)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
            }
          }
        } else if (this.extensionManagementServerService.webExtensionManagementServer === this.extension.server) {
          message = new MarkdownString(`${localize("Cannot be enabled", "This extension is disabled because it is not supported in {0} for the Web.", this.productService.nameLong)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
        }
        if (message) {
          this.updateStatus({ icon: warningIcon, message }, true);
        }
        return;
      }
    }
    const extensionId = new ExtensionIdentifier(this.extension.identifier.id);
    const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
    for (const feature of features) {
      const status = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id)?.current?.status;
      const manageAccessLink = `[${localize("manage access", "Manage Access")}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features, false, feature.id)})`;
      if (status?.severity === Severity.Error) {
        this.updateStatus({ icon: errorIcon, message: new MarkdownString().appendText(status.message).appendMarkdown(` ${manageAccessLink}`) }, true);
        return;
      }
      if (status?.severity === Severity.Warning) {
        this.updateStatus({ icon: warningIcon, message: new MarkdownString().appendText(status.message).appendMarkdown(` ${manageAccessLink}`) }, true);
        return;
      }
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      if (isLanguagePackExtension(this.extension.local.manifest)) {
        if (!this.extensionsWorkbenchService.installed.some((e) => areSameExtensions(e.identifier, this.extension.identifier) && e.server !== this.extension.server)) {
          const message = this.extension.server === this.extensionManagementServerService.localExtensionManagementServer ? new MarkdownString(localize("Install language pack also in remote server", "Install the language pack extension on '{0}' to enable it there also.", this.extensionManagementServerService.remoteExtensionManagementServer.label)) : new MarkdownString(localize("Install language pack also locally", "Install the language pack extension locally to enable it there also."));
          this.updateStatus({ icon: infoIcon, message }, true);
        }
        return;
      }
      const runningExtension = this.extensionService.extensions.filter((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))[0];
      const runningExtensionServer = runningExtension ? this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension)) : null;
      if (this.extension.server === this.extensionManagementServerService.localExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer) {
        if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
          this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize("enabled remotely", "This extension is enabled in the Remote Extension Host because it prefers to run there.")} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
        }
        return;
      }
      if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
        if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
          this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize("enabled locally", "This extension is enabled in the Local Extension Host because it prefers to run there.")} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
        }
        return;
      }
      if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.webExtensionManagementServer) {
        if (this.extensionManifestPropertiesService.canExecuteOnWeb(this.extension.local.manifest)) {
          this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize("enabled in web worker", "This extension is enabled in the Web Worker Extension Host because it prefers to run there.")} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
        }
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByExtensionDependency) {
      this.updateStatus({
        icon: warningIcon,
        message: new MarkdownString(localize("extension disabled because of dependency", "This extension depends on an extension that is disabled.")).appendMarkdown(`&nbsp;[${localize("dependencies", "Show Dependencies")}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Dependencies)})`)
      }, true);
      return;
    }
    if (!this.extension.local.isValid) {
      const errors = this.extension.local.validations.filter(([severity]) => severity === Severity.Error).map(([, message]) => message);
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(errors.join(" ").trim()) }, true);
      return;
    }
    const isEnabled = this.workbenchExtensionEnablementService.isEnabled(this.extension.local);
    const isRunning = this.extensionService.extensions.some((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier));
    if (!this.extension.isWorkspaceScoped && isEnabled && isRunning) {
      if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
        this.updateStatus({ message: new MarkdownString(localize("workspace enabled", "This extension is enabled for this workspace by the user.")) }, true);
        return;
      }
      if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
        if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
          this.updateStatus({ message: new MarkdownString(localize("extension enabled on remote", "Extension is enabled on '{0}'", this.extension.server.label)) }, true);
          return;
        }
      }
      if (this.extension.enablementState === EnablementState.EnabledGlobally) {
        return;
      }
    }
    if (!isEnabled && !isRunning) {
      if (this.extension.enablementState === EnablementState.DisabledGlobally) {
        this.updateStatus({ message: new MarkdownString(localize("globally disabled", "This extension is disabled globally by the user.")) }, true);
        return;
      }
      if (this.extension.enablementState === EnablementState.DisabledWorkspace) {
        this.updateStatus({ message: new MarkdownString(localize("workspace disabled", "This extension is disabled for this workspace by the user.")) }, true);
        return;
      }
    }
  }
  updateStatus(status, updateClass) {
    if (status) {
      if (this._status.some((s) => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
        return;
      }
    } else {
      if (this._status.length === 0) {
        return;
      }
      this._status = [];
    }
    if (status) {
      this._status.push(status);
      this._status.sort(
        (a, b) => b.icon === trustIcon ? -1 : a.icon === trustIcon ? 1 : b.icon === errorIcon ? -1 : a.icon === errorIcon ? 1 : b.icon === warningIcon ? -1 : a.icon === warningIcon ? 1 : b.icon === infoIcon ? -1 : a.icon === infoIcon ? 1 : 0
      );
    }
    if (updateClass) {
      if (status?.icon === errorIcon) {
        this.class = `${ExtensionStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
      } else if (status?.icon === warningIcon) {
        this.class = `${ExtensionStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
      } else if (status?.icon === infoIcon) {
        this.class = `${ExtensionStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
      } else if (status?.icon === trustIcon) {
        this.class = `${ExtensionStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
      } else {
        this.class = `${ExtensionStatusAction.CLASS} hide`;
      }
    }
    this._onDidChangeStatus.fire();
  }
  async run() {
    if (this._status[0]?.icon === trustIcon) {
      return this.commandService.executeCommand("workbench.trust.manage");
    }
  }
};
ExtensionStatusAction.CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-status`;
ExtensionStatusAction = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IWorkspaceTrustEnablementService),
  __decorateParam(4, IWorkspaceTrustManagementService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IExtensionManifestPropertiesService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IAllowedExtensionsService),
  __decorateParam(11, IWorkbenchExtensionEnablementService),
  __decorateParam(12, IExtensionFeaturesManagementService),
  __decorateParam(13, IExtensionGalleryManifestService),
  __decorateParam(14, IConfigurationService)
], ExtensionStatusAction);
let InstallSpecificVersionOfExtensionAction = class extends Action {
  constructor(id = InstallSpecificVersionOfExtensionAction.ID, label = InstallSpecificVersionOfExtensionAction.LABEL, extensionsWorkbenchService, quickInputService, instantiationService, extensionEnablementService) {
    super(id, label);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.extensionEnablementService = extensionEnablementService;
  }
  get enabled() {
    return this.extensionsWorkbenchService.local.some((l) => this.isEnabled(l));
  }
  async run() {
    const extensionPick = await this.quickInputService.pick(this.getExtensionEntries(), { placeHolder: localize("selectExtension", "Select Extension"), matchOnDetail: true });
    if (extensionPick && extensionPick.extension) {
      const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extensionPick.extension, true);
      try {
        await action.run();
      } finally {
        action.dispose();
      }
      await this.extensionsWorkbenchService.openSearch(extensionPick.extension.identifier.id);
    }
  }
  isEnabled(extension) {
    const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extension, true);
    try {
      return action.enabled && !!extension.local && this.extensionEnablementService.isEnabled(extension.local);
    } finally {
      action.dispose();
    }
  }
  async getExtensionEntries() {
    const installed = await this.extensionsWorkbenchService.queryLocal();
    const entries = [];
    for (const extension of installed) {
      if (this.isEnabled(extension)) {
        entries.push({
          id: extension.identifier.id,
          label: extension.displayName || extension.identifier.id,
          description: extension.identifier.id,
          extension
        });
      }
    }
    return entries.sort((e1, e2) => e1.extension.displayName.localeCompare(e2.extension.displayName));
  }
};
InstallSpecificVersionOfExtensionAction.ID = "workbench.extensions.action.install.specificVersion";
InstallSpecificVersionOfExtensionAction.LABEL = localize("install previous version", "Install Specific Version of Extension...");
InstallSpecificVersionOfExtensionAction = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IWorkbenchExtensionEnablementService)
], InstallSpecificVersionOfExtensionAction);
let AbstractInstallExtensionsInServerAction = class extends Action {
  constructor(id, extensionsWorkbenchService, quickInputService, notificationService, progressService) {
    super(id);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.quickInputService = quickInputService;
    this.notificationService = notificationService;
    this.progressService = progressService;
    this.extensions = void 0;
    this.update();
    this.extensionsWorkbenchService.queryLocal().then(() => this.updateExtensions());
    this._register(this.extensionsWorkbenchService.onChange(() => {
      if (this.extensions) {
        this.updateExtensions();
      }
    }));
  }
  updateExtensions() {
    this.extensions = this.extensionsWorkbenchService.local;
    this.update();
  }
  update() {
    this.enabled = !!this.extensions && this.getExtensionsToInstall(this.extensions).length > 0;
    this.tooltip = this.label;
  }
  async run() {
    return this.selectAndInstallExtensions();
  }
  async queryExtensionsToInstall() {
    const local = await this.extensionsWorkbenchService.queryLocal();
    return this.getExtensionsToInstall(local);
  }
  async selectAndInstallExtensions() {
    const quickPick = this.quickInputService.createQuickPick();
    quickPick.busy = true;
    const disposable = quickPick.onDidAccept(() => {
      disposable.dispose();
      quickPick.hide();
      quickPick.dispose();
      this.onDidAccept(quickPick.selectedItems);
    });
    quickPick.show();
    const localExtensionsToInstall = await this.queryExtensionsToInstall();
    quickPick.busy = false;
    if (localExtensionsToInstall.length) {
      quickPick.title = this.getQuickPickTitle();
      quickPick.placeholder = localize("select extensions to install", "Select extensions to install");
      quickPick.canSelectMany = true;
      localExtensionsToInstall.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
      quickPick.items = localExtensionsToInstall.map((extension) => ({ extension, label: extension.displayName, description: extension.version }));
    } else {
      quickPick.hide();
      quickPick.dispose();
      this.notificationService.notify({
        severity: Severity.Info,
        message: localize("no local extensions", "There are no extensions to install.")
      });
    }
  }
  async onDidAccept(selectedItems) {
    if (selectedItems.length) {
      const localExtensionsToInstall = selectedItems.filter((r) => !!r.extension).map((r) => r.extension);
      if (localExtensionsToInstall.length) {
        await this.progressService.withProgress(
          {
            location: ProgressLocation.Notification,
            title: localize("installing extensions", "Installing Extensions...")
          },
          () => this.installExtensions(localExtensionsToInstall)
        );
        this.notificationService.info(localize("finished installing", "Successfully installed extensions."));
      }
    }
  }
};
AbstractInstallExtensionsInServerAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IProgressService)
], AbstractInstallExtensionsInServerAction);
let InstallLocalExtensionsInRemoteAction = class extends AbstractInstallExtensionsInServerAction {
  constructor(extensionsWorkbenchService, quickInputService, progressService, notificationService, extensionManagementServerService, extensionGalleryService, instantiationService, fileService, logService) {
    super("workbench.extensions.actions.installLocalExtensionsInRemote", extensionsWorkbenchService, quickInputService, notificationService, progressService);
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryService = extensionGalleryService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.logService = logService;
  }
  get label() {
    if (this.extensionManagementServerService && this.extensionManagementServerService.remoteExtensionManagementServer) {
      return localize("select and install local extensions", "Install Local Extensions in '{0}'...", this.extensionManagementServerService.remoteExtensionManagementServer.label);
    }
    return "";
  }
  getQuickPickTitle() {
    return localize("install local extensions title", "Install Local Extensions in '{0}'", this.extensionManagementServerService.remoteExtensionManagementServer.label);
  }
  getExtensionsToInstall(local) {
    return local.filter((extension) => {
      const action = this.instantiationService.createInstance(RemoteInstallAction, true);
      action.extension = extension;
      return action.enabled;
    });
  }
  async installExtensions(localExtensionsToInstall) {
    const galleryExtensions = [];
    const vsixs = [];
    const targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
    await Promises.settled(localExtensionsToInstall.map(async (extension) => {
      if (this.extensionGalleryService.isEnabled()) {
        const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
        if (gallery) {
          galleryExtensions.push(gallery);
          return;
        }
      }
      const vsix = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.zip(extension.local);
      vsixs.push(vsix);
    }));
    await Promises.settled(galleryExtensions.map((gallery) => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(gallery)));
    try {
      await Promises.settled(vsixs.map((vsix) => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.install(vsix)));
    } finally {
      try {
        await Promise.allSettled(vsixs.map((vsix) => this.fileService.del(vsix)));
      } catch (error) {
        this.logService.error(error);
      }
    }
  }
};
InstallLocalExtensionsInRemoteAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IExtensionManagementServerService),
  __decorateParam(5, IExtensionGalleryService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IFileService),
  __decorateParam(8, ILogService)
], InstallLocalExtensionsInRemoteAction);
let InstallRemoteExtensionsInLocalAction = class extends AbstractInstallExtensionsInServerAction {
  constructor(id, extensionsWorkbenchService, quickInputService, progressService, notificationService, extensionManagementServerService, extensionGalleryService, fileService, logService) {
    super(id, extensionsWorkbenchService, quickInputService, notificationService, progressService);
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryService = extensionGalleryService;
    this.fileService = fileService;
    this.logService = logService;
  }
  get label() {
    return localize("select and install remote extensions", "Install Remote Extensions Locally...");
  }
  getQuickPickTitle() {
    return localize("install remote extensions", "Install Remote Extensions Locally");
  }
  getExtensionsToInstall(local) {
    return local.filter((extension) => extension.type === ExtensionType.User && extension.server !== this.extensionManagementServerService.localExtensionManagementServer && !this.extensionsWorkbenchService.installed.some((e) => e.server === this.extensionManagementServerService.localExtensionManagementServer && areSameExtensions(e.identifier, extension.identifier)));
  }
  async installExtensions(extensions) {
    const galleryExtensions = [];
    const vsixs = [];
    const targetPlatform = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getTargetPlatform();
    await Promises.settled(extensions.map(async (extension) => {
      if (this.extensionGalleryService.isEnabled()) {
        const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
        if (gallery) {
          galleryExtensions.push(gallery);
          return;
        }
      }
      const vsix = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.zip(extension.local);
      vsixs.push(vsix);
    }));
    await Promises.settled(galleryExtensions.map((gallery) => this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery)));
    try {
      await Promises.settled(vsixs.map((vsix) => this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix)));
    } finally {
      try {
        await Promise.allSettled(vsixs.map((vsix) => this.fileService.del(vsix)));
      } catch (error) {
        this.logService.error(error);
      }
    }
  }
};
InstallRemoteExtensionsInLocalAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IProgressService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IExtensionManagementServerService),
  __decorateParam(6, IExtensionGalleryService),
  __decorateParam(7, IFileService),
  __decorateParam(8, ILogService)
], InstallRemoteExtensionsInLocalAction);
CommandsRegistry.registerCommand("workbench.extensions.action.showExtensionsForLanguage", function(accessor, fileExtension) {
  const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
  return extensionsWorkbenchService.openSearch(`ext:${fileExtension.replace(/^\./, "")}`);
});
const showExtensionsWithIdsCommandId = "workbench.extensions.action.showExtensionsWithIds";
CommandsRegistry.registerCommand(showExtensionsWithIdsCommandId, function(accessor, extensionIds) {
  const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
  return extensionsWorkbenchService.openSearch(extensionIds.map((id) => `@id:${id}`).join(" "));
});
registerColor("extensionButton.background", {
  dark: buttonSecondaryBackground,
  light: buttonSecondaryBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonBackground", "Button background color for extension actions."));
registerColor("extensionButton.foreground", {
  dark: buttonSecondaryForeground,
  light: buttonSecondaryForeground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonForeground", "Button foreground color for extension actions."));
registerColor("extensionButton.hoverBackground", {
  dark: buttonSecondaryHoverBackground,
  light: buttonSecondaryHoverBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonHoverBackground", "Button background hover color for extension actions."));
registerColor("extensionButton.border", {
  dark: buttonSecondaryBorder,
  light: buttonSecondaryBorder,
  hcDark: buttonSecondaryBorder,
  hcLight: buttonSecondaryBorder
}, localize("extensionButtonBorder", "Button border color for extension actions."));
registerColor("extensionButton.separator", buttonSeparator, localize("extensionButtonSeparator", "Button separator color for extension actions"));
const extensionButtonProminentBackground = registerColor("extensionButton.prominentBackground", {
  dark: buttonBackground,
  light: buttonBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonProminentBackground", "Button background color for extension actions that stand out (e.g. install button)."));
registerColor("extensionButton.prominentForeground", {
  dark: buttonForeground,
  light: buttonForeground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonProminentForeground", "Button foreground color for extension actions that stand out (e.g. install button)."));
registerColor("extensionButton.prominentHoverBackground", {
  dark: buttonHoverBackground,
  light: buttonHoverBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonProminentHoverBackground", "Button background hover color for extension actions that stand out (e.g. install button)."));
registerThemingParticipant((theme, collector) => {
  const errorColor = theme.getColor(editorErrorForeground);
  if (errorColor) {
    collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
    collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
  }
  const warningColor = theme.getColor(editorWarningForeground);
  if (warningColor) {
    collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
    collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
  }
  const infoColor = theme.getColor(editorInfoForeground);
  if (infoColor) {
    collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
    collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
  }
});
export {
  AbstractConfigureRecommendedExtensionsAction,
  AbstractInstallExtensionsInServerAction,
  ButtonWithDropDownExtensionAction,
  ButtonWithDropdownExtensionActionViewItem,
  ClearLanguageAction,
  ConfigureWorkspaceFolderRecommendedExtensionsAction,
  ConfigureWorkspaceRecommendedExtensionsAction,
  DisableDropDownAction,
  DisableForWorkspaceAction,
  DisableGloballyAction,
  DropDownExtensionAction,
  DropDownExtensionActionViewItem,
  EnableAIFeaturesInWorkspaceAction,
  EnableDropDownAction,
  EnableForWorkspaceAction,
  EnableGloballyAction,
  ExtensionAction,
  ExtensionEditorManageExtensionAction,
  ExtensionRuntimeStateAction,
  ExtensionStatusAction,
  ExtensionStatusLabelAction,
  IgnoreExtensionRecommendationAction,
  InstallAction,
  InstallAnotherVersionAction,
  InstallDropdownAction,
  InstallInOtherServerAction,
  InstallLocalExtensionsInRemoteAction,
  InstallRecommendedExtensionAction,
  InstallRemoteExtensionsInLocalAction,
  InstallSpecificVersionOfExtensionAction,
  InstallingLabelAction,
  LocalInstallAction,
  ManageExtensionAction,
  MenuItemExtensionAction,
  MigrateDeprecatedExtensionAction,
  PromptExtensionInstallFailureAction,
  RemoteInstallAction,
  SetColorThemeAction,
  SetFileIconThemeAction,
  SetLanguageAction,
  SetProductIconThemeAction,
  ShowRecommendedExtensionAction,
  ToggleAutoUpdateForExtensionAction,
  ToggleAutoUpdatesForPublisherAction,
  TogglePreReleaseExtensionAction,
  ToggleSyncExtensionAction,
  UndoIgnoreExtensionRecommendationAction,
  UninstallAction,
  UpdateAction,
  WebInstallAction,
  extensionButtonProminentBackground,
  getContextMenuActions,
  showExtensionsWithIdsCommandId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGJyb3dzZXJcXGV4dGVuc2lvbnNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2V4dGVuc2lvbkFjdGlvbnMuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgQWN0aW9uLCBTZXBhcmF0b3IsIFN1Ym1lbnVBY3Rpb24sIElBY3Rpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsYXllciwgUHJvbWlzZXMsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMganNvbiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGRpc3Bvc2VJZkRpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbiwgRXh0ZW5zaW9uU3RhdGUsIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSUV4dGVuc2lvbkNvbnRhaW5lciwgVE9HR0xFX0lHTk9SRV9FWFRFTlNJT05fQUNUSU9OX0lELCBTRUxFQ1RfSU5TVEFMTF9WU0lYX0VYVEVOU0lPTl9DT01NQU5EX0lELCBUSEVNRV9BQ1RJT05TX0dST1VQLCBJTlNUQUxMX0FDVElPTlNfR1JPVVAsIFVQREFURV9BQ1RJT05TX0dST1VQLCBFeHRlbnNpb25FZGl0b3JUYWIsIEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLCBJRXh0ZW5zaW9uQXJnLCBBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNDb25maWd1cmF0aW9uSW5pdGlhbENvbnRlbnQgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc0ZpbGVUZW1wbGF0ZS5qcyc7XG5pbXBvcnQgeyBJR2FsbGVyeUV4dGVuc2lvbiwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJTG9jYWxFeHRlbnNpb24sIEluc3RhbGxPcHRpb25zLCBJbnN0YWxsT3BlcmF0aW9uLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLCBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLCBzaG91bGRSZXF1aXJlUmVwb3NpdG9yeVNpZ25hdHVyZUZvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBFbmFibGVtZW50U3RhdGUsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24sIElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSwgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgZ2V0RXh0ZW5zaW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElFeHRlbnNpb25NYW5pZmVzdCwgaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24sIGdldFdvcmtzcGFjZVN1cHBvcnRUeXBlTWVzc2FnZSwgVGFyZ2V0UGxhdGZvcm0sIGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZUNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCB0b0V4dGVuc2lvbiwgdG9FeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50LCBJQ29sb3JUaGVtZSwgSUNzc1N0eWxlQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYnV0dG9uQmFja2dyb3VuZCwgYnV0dG9uRm9yZWdyb3VuZCwgYnV0dG9uSG92ZXJCYWNrZ3JvdW5kLCBidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kLCBidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kLCBidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQsIHJlZ2lzdGVyQ29sb3IsIGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kLCBlZGl0b3JJbmZvRm9yZWdyb3VuZCwgZWRpdG9yRXJyb3JGb3JlZ3JvdW5kLCBidXR0b25TZXBhcmF0b3IsIGJ1dHRvblNlY29uZGFyeUJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElKU09ORWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9qc29uRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvclNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dFNlcnZpY2UsIFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLCBJV29ya2JlbmNoVGhlbWUsIElXb3JrYmVuY2hDb2xvclRoZW1lLCBJV29ya2JlbmNoRmlsZUljb25UaGVtZSwgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJUHJvbXB0QnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsIEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OU19DT05GSUcsIElFeHRlbnNpb25zQ29uZmlnQ29udGVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZy5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBlcnJvckljb24sIGluZm9JY29uLCBtYW5hZ2VFeHRlbnNpb25JY29uLCBzeW5jRW5hYmxlZEljb24sIHN5bmNJZ25vcmVkSWNvbiwgdHJ1c3RJY29uLCB3YXJuaW5nSWNvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IGlzSU9TLCBpc1dlYiwgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBpc1ZpcnR1YWxXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tbWFuZFVyaSwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMsIElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IGdldExvY2FsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvY29tbW9uL2xhbmd1YWdlUGFja3MuanMnO1xuaW1wb3J0IHsgSUxvY2FsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sb2NhbGl6YXRpb24vY29tbW9uL2xvY2FsZS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IHNob3dXaW5kb3dMb2dBY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xvZy9jb21tb24vbG9nQ29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbSwgSUFjdGlvbldpdGhEcm9wZG93bkFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaElzc3VlU2VydmljZSB9IGZyb20gJy4uLy4uL2lzc3VlL2NvbW1vbi9pc3N1ZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBnZXRXb3JrYmVuY2hNZW51TW90aW9uQ29udGV4dE1lbnVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL21lbnVNb3Rpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgUHJvbXB0RXh0ZW5zaW9uSW5zdGFsbEZhaWx1cmVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSW5zdGFsbE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2ZXJzaW9uOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnN0YWxsT3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXJyb3I6IEVycm9yLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoSXNzdWVTZXJ2aWNlOiBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9uLnByb21wdEV4dGVuc2lvbkluc3RhbGxGYWlsdXJlJyk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IodGhpcy5lcnJvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IodGhpcy5lcnJvcik7XG5cblx0XHRpZiAodGhpcy5lcnJvci5uYW1lID09PSBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlVuc3VwcG9ydGVkKSB7XG5cdFx0XHRjb25zdCBwcm9kdWN0TmFtZSA9IGlzV2ViID8gbG9jYWxpemUoJ1ZTIENvZGUgZm9yIFdlYicsIFwiezB9IGZvciB0aGUgV2ViXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpIDogdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZztcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2Fubm90IGJlIGluc3RhbGxlZCcsIFwiVGhlICd7MH0nIGV4dGVuc2lvbiBpcyBub3QgYXZhaWxhYmxlIGluIHsxfS4gQ2xpY2sgJ01vcmUgSW5mb3JtYXRpb24nIHRvIGxlYXJuIG1vcmUuXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHByb2R1Y3ROYW1lKTtcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAnbW9yZSBpbmZvcm1hdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk1vcmUgSW5mb3JtYXRpb25cIiksXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZVwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGlzV2ViID8gVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUtd2ViLWV4dGVuc2lvbnMtZ3VpZGUnKSA6IFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZScpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5SZWxlYXNlVmVyc2lvbk5vdEZvdW5kID09PSAoPEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGU+dGhpcy5lcnJvci5uYW1lKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdG1lc3NhZ2U6IGdldEVycm9yTWVzc2FnZSh0aGlzLmVycm9yKSxcblx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwgcHJlcmVsZWFzZScsIFwiSW5zdGFsbCBQcmUtUmVsZWFzZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGluc3RhbGxBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0aW5zdGFsbEFjdGlvbi5leHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbjtcblx0XHRcdFx0XHRcdHJldHVybiBpbnN0YWxsQWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoW0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkluY29tcGF0aWJsZUFwaSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGVUYXJnZXRQbGF0Zm9ybSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5NYWxpY2lvdXMsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuRGVwcmVjYXRlZF0uaW5jbHVkZXMoPEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGU+dGhpcy5lcnJvci5uYW1lKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8oZ2V0RXJyb3JNZXNzYWdlKHRoaXMuZXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5QYWNrYWdlTm90U2lnbmVkID09PSAoPEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGU+dGhpcy5lcnJvci5uYW1lKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdub3Qgc2lnbmVkJywgXCInezB9JyBpcyBhbiBleHRlbnNpb24gZnJvbSBhbiB1bmtub3duIHNvdXJjZS4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGluc3RhbGw/XCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0ZGV0YWlsOiBnZXRFcnJvck1lc3NhZ2UodGhpcy5lcnJvciksXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsIGFueXdheScsIFwiSW5zdGFsbCBBbnl3YXlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7IC4uLnRoaXMub3B0aW9ucywgZG9ub3RWZXJpZnlTaWduYXR1cmU6IHRydWUsIH0pO1xuXHRcdFx0XHRcdFx0aW5zdGFsbEFjdGlvbi5leHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbjtcblx0XHRcdFx0XHRcdHJldHVybiBpbnN0YWxsQWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuU2lnbmF0dXJlVmVyaWZpY2F0aW9uRmFpbGVkID09PSAoPEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGU+dGhpcy5lcnJvci5uYW1lKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd2ZXJpZmljYXRpb24gZmFpbGVkJywgXCJDYW5ub3QgaW5zdGFsbCAnezB9JyBleHRlbnNpb24gYmVjYXVzZSB7MX0gY2Fubm90IHZlcmlmeSB0aGUgZXh0ZW5zaW9uIHNpZ25hdHVyZVwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksXG5cdFx0XHRcdGRldGFpbDogZ2V0RXJyb3JNZXNzYWdlKHRoaXMuZXJyb3IpLFxuXHRcdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9leHRlbnNpb24tbWFya2V0cGxhY2UjX3RoZS1leHRlbnNpb24tc2lnbmF0dXJlLWNhbm5vdC1iZS12ZXJpZmllZC1ieS12cy1jb2RlJylcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCBkb25vdCB2ZXJpZnknLCBcIkluc3RhbGwgQW55d2F5IChEb24ndCBWZXJpZnkgU2lnbmF0dXJlKVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGluc3RhbGxBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHsgLi4udGhpcy5vcHRpb25zLCBkb25vdFZlcmlmeVNpZ25hdHVyZTogdHJ1ZSwgfSk7XG5cdFx0XHRcdFx0XHRpbnN0YWxsQWN0aW9uLmV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGluc3RhbGxBY3Rpb24ucnVuKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5TaWduYXR1cmVWZXJpZmljYXRpb25JbnRlcm5hbCA9PT0gKDxFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlPnRoaXMuZXJyb3IubmFtZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndmVyaWZpY2F0aW9uIGZhaWxlZCcsIFwiQ2Fubm90IGluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgezF9IGNhbm5vdCB2ZXJpZnkgdGhlIGV4dGVuc2lvbiBzaWduYXR1cmVcIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0XHRkZXRhaWw6IGdldEVycm9yTWVzc2FnZSh0aGlzLmVycm9yKSxcblx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvZXh0ZW5zaW9uLW1hcmtldHBsYWNlI190aGUtZXh0ZW5zaW9uLXNpZ25hdHVyZS1jYW5ub3QtYmUtdmVyaWZpZWQtYnktdnMtY29kZScpXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlcG9ydCBpc3N1ZScsIFwiUmVwb3J0IElzc3VlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy53b3JrYmVuY2hJc3N1ZVNlcnZpY2Uub3BlblJlcG9ydGVyKHtcblx0XHRcdFx0XHRcdGlzc3VlVGl0bGU6IGxvY2FsaXplKCdyZXBvcnQgaXNzdWUgdGl0bGUnLCBcIkV4dGVuc2lvbiBTaWduYXR1cmUgVmVyaWZpY2F0aW9uIEZhaWxlZDogezB9XCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRcdGlzc3VlQm9keTogbG9jYWxpemUoJ3JlcG9ydCBpc3N1ZSBib2R5JywgXCJQbGVhc2UgaW5jbHVkZSBmb2xsb3dpbmcgbG9nIGBGMSA+IE9wZW4gVmlldy4uLiA+IFNoYXJlZGAgYmVsb3cuXFxuXFxuXCIpXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCBkb25vdCB2ZXJpZnknLCBcIkluc3RhbGwgQW55d2F5IChEb24ndCBWZXJpZnkgU2lnbmF0dXJlKVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGluc3RhbGxBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHsgLi4udGhpcy5vcHRpb25zLCBkb25vdFZlcmlmeVNpZ25hdHVyZTogdHJ1ZSwgfSk7XG5cdFx0XHRcdFx0XHRpbnN0YWxsQWN0aW9uLmV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGluc3RhbGxBY3Rpb24ucnVuKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVyYXRpb25NZXNzYWdlID0gdGhpcy5pbnN0YWxsT3BlcmF0aW9uID09PSBJbnN0YWxsT3BlcmF0aW9uLlVwZGF0ZSA/IGxvY2FsaXplKCd1cGRhdGUgb3BlcmF0aW9uJywgXCJFcnJvciB3aGlsZSB1cGRhdGluZyAnezB9JyBleHRlbnNpb24uXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpXG5cdFx0XHQ6IGxvY2FsaXplKCdpbnN0YWxsIG9wZXJhdGlvbicsIFwiRXJyb3Igd2hpbGUgaW5zdGFsbGluZyAnezB9JyBleHRlbnNpb24uXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdGxldCBhZGRpdGlvbmFsTWVzc2FnZTtcblx0XHRjb25zdCBwcm9tcHRDaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10gPSBbXTtcblxuXHRcdGNvbnN0IGRvd25sb2FkVXJsID0gYXdhaXQgdGhpcy5nZXREb3dubG9hZFVybCgpO1xuXHRcdGlmIChkb3dubG9hZFVybCkge1xuXHRcdFx0YWRkaXRpb25hbE1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hlY2sgbG9ncycsIFwiUGxlYXNlIGNoZWNrIHRoZSBbbG9nXSh7MH0pIGZvciBtb3JlIGRldGFpbHMuXCIsIGNyZWF0ZUNvbW1hbmRVcmkoc2hvd1dpbmRvd0xvZ0FjdGlvbklkKS50b1N0cmluZygpKTtcblx0XHRcdHByb21wdENob2ljZXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZG93bmxvYWQnLCBcIlRyeSBEb3dubG9hZGluZyBNYW51YWxseS4uLlwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihkb3dubG9hZFVybCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnaW5zdGFsbCB2c2l4JywgJ09uY2UgZG93bmxvYWRlZCwgcGxlYXNlIG1hbnVhbGx5IGluc3RhbGwgdGhlIGRvd25sb2FkZWQgVlNJWCBvZiBcXCd7MH1cXCcuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGxWU0lYJywgXCJJbnN0YWxsIGZyb20gVlNJWC4uLlwiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNFTEVDVF9JTlNUQUxMX1ZTSVhfRVhURU5TSU9OX0NPTU1BTkRfSUQpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlID0gYCR7b3BlcmF0aW9uTWVzc2FnZX0ke2FkZGl0aW9uYWxNZXNzYWdlID8gYCAke2FkZGl0aW9uYWxNZXNzYWdlfWAgOiAnJ31gO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2UsIHByb21wdENob2ljZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXREb3dubG9hZFVybCgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc0lPUykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmICF0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCB0YXJnZXRQbGF0Zm9ybSA9IHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkucHJvcGVydGllcy50YXJnZXRQbGF0Zm9ybTtcblx0XHRpZiAodGFyZ2V0UGxhdGZvcm0gIT09IFRhcmdldFBsYXRmb3JtLlVOSVZFUlNBTCAmJiB0YXJnZXRQbGF0Zm9ybSAhPT0gVGFyZ2V0UGxhdGZvcm0uVU5ERUZJTkVEICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpZiAobWFuaWZlc3QgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25Xb3Jrc3BhY2UobWFuaWZlc3QpKSB7XG5cdFx0XHRcdFx0dGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRhcmdldFBsYXRmb3JtID09PSBUYXJnZXRQbGF0Zm9ybS5VTktOT1dOKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtleHRlbnNpb25dID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7XG5cdFx0XHQuLi50aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0dmVyc2lvbjogdGhpcy52ZXJzaW9uXG5cdFx0fV0sIHtcblx0XHRcdHRhcmdldFBsYXRmb3JtXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIFVSSS5wYXJzZShleHRlbnNpb24uYXNzZXRzLmRvd25sb2FkLnVyaSk7XG5cdH1cblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25BY3Rpb25DaGFuZ2VFdmVudCBleHRlbmRzIElBY3Rpb25DaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGhpZGRlbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1lbnVBY3Rpb25zPzogSUFjdGlvbltdO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIGltcGxlbWVudHMgSUV4dGVuc2lvbkNvbnRhaW5lciB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFeHRlbnNpb25BY3Rpb25DaGFuZ2VFdmVudD4oKSk7XG5cdG92ZXJyaWRlIGdldCBvbkRpZENoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50OyB9XG5cblx0c3RhdGljIHJlYWRvbmx5IEVYVEVOU0lPTl9BQ1RJT05fQ0xBU1MgPSAnZXh0ZW5zaW9uLWFjdGlvbic7XG5cdHN0YXRpYyByZWFkb25seSBURVhUX0FDVElPTl9DTEFTUyA9IGAke0V4dGVuc2lvbkFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSB0ZXh0YDtcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMX0FDVElPTl9DTEFTUyA9IGAke0V4dGVuc2lvbkFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSBsYWJlbGA7XG5cdHN0YXRpYyByZWFkb25seSBJQ09OX0FDVElPTl9DTEFTUyA9IGAke0V4dGVuc2lvbkFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSBpY29uYDtcblxuXHRwcml2YXRlIF9leHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsID0gbnVsbDtcblx0Z2V0IGV4dGVuc2lvbigpOiBJRXh0ZW5zaW9uIHwgbnVsbCB7IHJldHVybiB0aGlzLl9leHRlbnNpb247IH1cblx0c2V0IGV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsKSB7IHRoaXMuX2V4dGVuc2lvbiA9IGV4dGVuc2lvbjsgdGhpcy51cGRhdGUoKTsgfVxuXG5cdHByaXZhdGUgX2hpZGRlbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgaGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGlkZGVuOyB9XG5cdHNldCBoaWRkZW4oaGlkZGVuOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2hpZGRlbiAhPT0gaGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9oaWRkZW4gPSBoaWRkZW47XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgaGlkZGVuIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc2V0RW5hYmxlZCh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLl9zZXRFbmFibGVkKHZhbHVlKTtcblx0XHRpZiAodGhpcy5oaWRlT25EaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5oaWRkZW4gPSAhdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGhpZGVPbkRpc2FibGVkOiBib29sZWFuID0gdHJ1ZTtcblxuXHRhYnN0cmFjdCB1cGRhdGUoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0cHJpdmF0ZSBwcmltYXJ5QWN0aW9uOiBJQWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG1lbnVBY3Rpb25DbGFzc05hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIF9tZW51QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGdldCBtZW51QWN0aW9ucygpOiBJQWN0aW9uW10geyByZXR1cm4gWy4uLnRoaXMuX21lbnVBY3Rpb25zXTsgfVxuXG5cdG92ZXJyaWRlIGdldCBleHRlbnNpb24oKTogSUV4dGVuc2lvbiB8IG51bGwge1xuXHRcdHJldHVybiBzdXBlci5leHRlbnNpb247XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgZXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwpIHtcblx0XHR0aGlzLmV4dGVuc2lvbkFjdGlvbnMuZm9yRWFjaChhID0+IGEuZXh0ZW5zaW9uID0gZXh0ZW5zaW9uKTtcblx0XHRzdXBlci5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uQWN0aW9uczogRXh0ZW5zaW9uQWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRjbGF6ejogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uc0dyb3VwczogRXh0ZW5zaW9uQWN0aW9uW11bXSxcblx0KSB7XG5cdFx0Y2xhenogPSBgJHtjbGF6en0gYWN0aW9uLWRyb3Bkb3duYDtcblx0XHRzdXBlcihpZCwgdW5kZWZpbmVkLCBjbGF6eik7XG5cdFx0dGhpcy5tZW51QWN0aW9uQ2xhc3NOYW1lcyA9IGNsYXp6LnNwbGl0KCcgJyk7XG5cdFx0dGhpcy5oaWRlT25EaXNhYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuZXh0ZW5zaW9uQWN0aW9ucyA9IGFjdGlvbnNHcm91cHMuZmxhdCgpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KC4uLnRoaXMuZXh0ZW5zaW9uQWN0aW9ucy5tYXAoYSA9PiBhLm9uRGlkQ2hhbmdlKSkoKCkgPT4gdGhpcy51cGRhdGUodHJ1ZSkpKTtcblx0XHR0aGlzLmV4dGVuc2lvbkFjdGlvbnMuZm9yRWFjaChhID0+IHRoaXMuX3JlZ2lzdGVyKGEpKTtcblx0fVxuXG5cdHVwZGF0ZShkb25vdFVwZGF0ZUFjdGlvbnM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFkb25vdFVwZGF0ZUFjdGlvbnMpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uQWN0aW9ucy5mb3JFYWNoKGEgPT4gYS51cGRhdGUoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uc0dyb3VwcyA9IHRoaXMuYWN0aW9uc0dyb3Vwcy5tYXAoYWN0aW9uc0dyb3VwID0+IGFjdGlvbnNHcm91cC5maWx0ZXIoYSA9PiAhYS5oaWRkZW4pKTtcblxuXHRcdGxldCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHZpc2libGVBY3Rpb25zIG9mIGFjdGlvbnNHcm91cHMpIHtcblx0XHRcdGlmICh2aXNpYmxlQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YWN0aW9ucyA9IFsuLi5hY3Rpb25zLCAuLi52aXNpYmxlQWN0aW9ucywgbmV3IFNlcGFyYXRvcigpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWN0aW9ucyA9IGFjdGlvbnMubGVuZ3RoID8gYWN0aW9ucy5zbGljZSgwLCBhY3Rpb25zLmxlbmd0aCAtIDEpIDogYWN0aW9ucztcblxuXHRcdHRoaXMucHJpbWFyeUFjdGlvbiA9IGFjdGlvbnNbMF07XG5cdFx0dGhpcy5fbWVudUFjdGlvbnMgPSBhY3Rpb25zLmxlbmd0aCA+IDEgPyBhY3Rpb25zIDogW107XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IG1lbnVBY3Rpb25zOiB0aGlzLl9tZW51QWN0aW9ucyB9KTtcblxuXHRcdGlmICh0aGlzLnByaW1hcnlBY3Rpb24pIHtcblx0XHRcdHRoaXMuaGlkZGVuID0gZmFsc2U7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLnByaW1hcnlBY3Rpb24uZW5hYmxlZDtcblx0XHRcdHRoaXMubGFiZWwgPSB0aGlzLmdldExhYmVsKHRoaXMucHJpbWFyeUFjdGlvbiBhcyBFeHRlbnNpb25BY3Rpb24pO1xuXHRcdFx0dGhpcy50b29sdGlwID0gdGhpcy5wcmltYXJ5QWN0aW9uLnRvb2x0aXA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaGlkZGVuID0gdHJ1ZTtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5lbmFibGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnByaW1hcnlBY3Rpb24/LnJ1bigpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMYWJlbChhY3Rpb246IEV4dGVuc2lvbkFjdGlvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGFjdGlvbi5sYWJlbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnV0dG9uV2l0aERyb3Bkb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyAmIElBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0Y29udGV4dE1lbnVQcm92aWRlcjogSUNvbnRleHRNZW51UHJvdmlkZXJcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBvcHRpb25zLCBjb250ZXh0TWVudVByb3ZpZGVyKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5oaWRkZW4gIT09IHVuZGVmaW5lZCB8fCBlLm1lbnVBY3Rpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZUNsYXNzKCk7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCAmJiB0aGlzLmRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtPy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsICg8QnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uPnRoaXMuX2FjdGlvbikuaGlkZGVuKTtcblx0XHRcdGNvbnN0IGlzTWVudUVtcHR5ID0gKDxCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24+dGhpcy5fYWN0aW9uKS5tZW51QWN0aW9ucy5sZW5ndGggPT09IDA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCBpc01lbnVFbXB0eSk7XG5cdFx0XHR0aGlzLmRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsIGlzTWVudUVtcHR5KTtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbEFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBpbnN0YWxsYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdHByb3RlY3RlZCBfbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwgPSBudWxsO1xuXHRzZXQgbWFuaWZlc3QobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwpIHtcblx0XHR0aGlzLl9tYW5pZmVzdCA9IG1hbmlmZXN0O1xuXHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9wdGlvbnM6IEluc3RhbGxPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IEluc3RhbGxPcHRpb25zLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJ1bnRpbWVFeHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaFRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaFRoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuaW5zdGFsbCcsIGxvY2FsaXplKCdpbnN0YWxsJywgXCJJbnN0YWxsXCIpLCBJbnN0YWxsQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy5oaWRlT25EaXNhYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMub3B0aW9ucyA9IHsgaXNNYWNoaW5lU2NvcGVkOiBmYWxzZSwgLi4ub3B0aW9ucyB9O1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKCgpID0+IHRoaXMudXBkYXRlTGFiZWwoKSwgdGhpcykpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMuY29tcHV0ZUFuZFVwZGF0ZUVuYWJsZW1lbnQoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgY29tcHV0ZUFuZFVwZGF0ZUVuYWJsZW1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxBY3Rpb24uSElERTtcblx0XHR0aGlzLmhpZGRlbiA9IHRydWU7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uaXNCdWlsdGluKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhblNldExhbmd1YWdlKHRoaXMuZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uICYmICghdGhpcy5leHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24gfHwgdGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHsgaWQ6IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSwgcHJlcmVsZWFzZTogdHJ1ZSB9KSAhPT0gdHJ1ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uICYmICF0aGlzLmV4dGVuc2lvbi5oYXNSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmhpZGRlbiA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsQWN0aW9uLkNMQVNTO1xuXHRcdGlmIChhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwodGhpcy5leHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZ2FsbGVyeSAmJiAhdGhpcy5leHRlbnNpb24uZ2FsbGVyeS5pc1NpZ25lZCAmJiBzaG91bGRSZXF1aXJlUmVwb3NpdG9yeVNpZ25hdHVyZUZvcih0aGlzLmV4dGVuc2lvbi5wcml2YXRlLCBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCkpKSB7XG5cdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdub3Qgc2lnbmVkJywgXCInezB9JyBpcyBhbiBleHRlbnNpb24gZnJvbSBhbiB1bmtub3duIHNvdXJjZS4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGluc3RhbGw/XCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnbm90IHNpZ25lZCBkZXRhaWwnLCBcIkV4dGVuc2lvbiBpcyBub3Qgc2lnbmVkLlwiKSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCBhbnl3YXknLCBcIkluc3RhbGwgQW55d2F5XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMub3B0aW9ucy5kb25vdFZlcmlmeVNpZ25hdHVyZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvKSB7XG5cdFx0XHRsZXQgZGV0YWlsOiBzdHJpbmcgfCBNYXJrZG93blN0cmluZyA9IGxvY2FsaXplKCdkZXByZWNhdGVkIG1lc3NhZ2UnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRlcHJlY2F0ZWQgYXMgaXQgaXMgbm8gbG9uZ2VyIGJlaW5nIG1haW50YWluZWQuXCIpO1xuXHRcdFx0ZW51bSBEZXByZWNhdGlvbkNob2ljZSB7XG5cdFx0XHRcdEluc3RhbGxBbnl3YXkgPSAwLFxuXHRcdFx0XHRTaG93QWx0ZXJuYXRlRXh0ZW5zaW9uID0gMSxcblx0XHRcdFx0Q29uZmlndXJlU2V0dGluZ3MgPSAyLFxuXHRcdFx0XHRDYW5jZWwgPSAzXG5cdFx0XHR9XG5cdFx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPERlcHJlY2F0aW9uQ2hvaWNlPltdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsIGFueXdheScsIFwiSW5zdGFsbCBBbnl3YXlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBEZXByZWNhdGlvbkNob2ljZS5JbnN0YWxsQW55d2F5XG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGRldGFpbCA9IGxvY2FsaXplKCdkZXByZWNhdGVkIHdpdGggYWx0ZXJuYXRlIGV4dGVuc2lvbiBtZXNzYWdlJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIHswfSBleHRlbnNpb24gaW5zdGVhZC5cIiwgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSk7XG5cblx0XHRcdFx0Y29uc3QgYWx0ZXJuYXRlRXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbjtcblx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdTaG93IGFsdGVybmF0ZSBleHRlbnNpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPcGVuIHswfVwiLCB0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IFtleHRlbnNpb25dID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiBhbHRlcm5hdGVFeHRlbnNpb24uaWQsIHByZVJlbGVhc2U6IGFsdGVybmF0ZUV4dGVuc2lvbi5wcmVSZWxlYXNlIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24pO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gRGVwcmVjYXRpb25DaG9pY2UuU2hvd0FsdGVybmF0ZUV4dGVuc2lvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uc2V0dGluZ3MpIHtcblx0XHRcdFx0ZGV0YWlsID0gbG9jYWxpemUoJ2RlcHJlY2F0ZWQgd2l0aCBhbHRlcm5hdGUgc2V0dGluZ3MgbWVzc2FnZScsIFwiVGhpcyBleHRlbnNpb24gaXMgZGVwcmVjYXRlZCBhcyB0aGlzIGZ1bmN0aW9uYWxpdHkgaXMgbm93IGJ1aWx0LWluIHRvIFZTIENvZGUuXCIpO1xuXG5cdFx0XHRcdGNvbnN0IHNldHRpbmdzID0gdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLnNldHRpbmdzO1xuXHRcdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2NvbmZpZ3VyZSBpbiBzZXR0aW5ncycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvbmZpZ3VyZSBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IHF1ZXJ5OiBzZXR0aW5ncy5tYXAoc2V0dGluZyA9PiBgQGlkOiR7c2V0dGluZ31gKS5qb2luKCcgJykgfSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBEZXByZWNhdGlvbkNob2ljZS5Db25maWd1cmVTZXR0aW5ncztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uYWRkaXRpb25hbEluZm8pIHtcblx0XHRcdFx0ZGV0YWlsID0gbmV3IE1hcmtkb3duU3RyaW5nKGAke2RldGFpbH0gJHt0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uYWRkaXRpb25hbEluZm99YCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2luc3RhbGwgY29uZmlybWF0aW9uJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gaW5zdGFsbCAnezB9Jz9cIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRkZXRhaWw6IGlzU3RyaW5nKGRldGFpbCkgPyBkZXRhaWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN1c3RvbTogaXNTdHJpbmcoZGV0YWlsKSA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0XHRtYXJrZG93bjogZGV0YWlsXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBEZXByZWNhdGlvbkNob2ljZS5DYW5jZWxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocmVzdWx0ICE9PSBEZXByZWNhdGlvbkNob2ljZS5JbnN0YWxsQW55d2F5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5leHRlbnNpb24sIHsgc2hvd1ByZVJlbGVhc2VWZXJzaW9uOiB0aGlzLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uIH0pO1xuXG5cdFx0YWxlcnQobG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb25TdGFydCcsIFwiSW5zdGFsbGluZyBleHRlbnNpb24gezB9IHN0YXJ0ZWQuIEFuIGVkaXRvciBpcyBub3cgb3BlbiB3aXRoIG1vcmUgZGV0YWlscyBvbiB0aGlzIGV4dGVuc2lvblwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXG5cdFx0LyogX19HRFBSX19cblx0XHRcdFwiZXh0ZW5zaW9uczphY3Rpb246aW5zdGFsbFwiIDoge1xuXHRcdFx0XHRcIm93bmVyXCI6IFwic2FuZHkwODFcIixcblx0XHRcdFx0XCJhY3Rpb25JZFwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFx0XHRcIiR7aW5jbHVkZX1cIjogW1xuXHRcdFx0XHRcdFwiJHtHYWxsZXJ5RXh0ZW5zaW9uVGVsZW1ldHJ5RGF0YX1cIlxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0Ki9cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCdleHRlbnNpb25zOmFjdGlvbjppbnN0YWxsJywgeyAuLi50aGlzLmV4dGVuc2lvbi50ZWxlbWV0cnlEYXRhLCBhY3Rpb25JZDogdGhpcy5pZCB9KTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuaW5zdGFsbCh0aGlzLmV4dGVuc2lvbik7XG5cblx0XHRpZiAoZXh0ZW5zaW9uPy5sb2NhbCkge1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb25Db21wbGV0ZScsIFwiSW5zdGFsbGluZyBleHRlbnNpb24gezB9IGlzIGNvbXBsZXRlZC5cIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblx0XHRcdGNvbnN0IHJ1bm5pbmdFeHRlbnNpb24gPSBhd2FpdCB0aGlzLmdldFJ1bm5pbmdFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uICYmICEocnVubmluZ0V4dGVuc2lvbi5hY3RpdmF0aW9uRXZlbnRzICYmIHJ1bm5pbmdFeHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cy5zb21lKGFjdGl2YXRpb25FZW50ID0+IGFjdGl2YXRpb25FZW50LnN0YXJ0c1dpdGgoJ29uTGFuZ3VhZ2UnKSkpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGF3YWl0IHRoaXMuZ2V0VGhlbWVBY3Rpb24oZXh0ZW5zaW9uKTtcblx0XHRcdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0XHRcdGFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHJldHVybiBhY3Rpb24ucnVuKHsgc2hvd0N1cnJlbnRUaGVtZTogdHJ1ZSwgaWdub3JlRm9jdXNMb3N0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRhY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRUaGVtZUFjdGlvbihleHRlbnNpb246IElFeHRlbnNpb24pOiBQcm9taXNlPEV4dGVuc2lvbkFjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbG9yVGhlbWVzID0gYXdhaXQgdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKTtcblx0XHRpZiAoY29sb3JUaGVtZXMuc29tZSh0aGVtZSA9PiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZSwgZXh0ZW5zaW9uKSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldENvbG9yVGhlbWVBY3Rpb24pO1xuXHRcdH1cblx0XHRjb25zdCBmaWxlSWNvblRoZW1lcyA9IGF3YWl0IHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWVzKCk7XG5cdFx0aWYgKGZpbGVJY29uVGhlbWVzLnNvbWUodGhlbWUgPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGhlbWUsIGV4dGVuc2lvbikpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXRGaWxlSWNvblRoZW1lQWN0aW9uKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvZHVjdEljb25UaGVtZXMgPSBhd2FpdCB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lcygpO1xuXHRcdGlmIChwcm9kdWN0SWNvblRoZW1lcy5zb21lKHRoZW1lID0+IGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoZW1lLCBleHRlbnNpb24pKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTxJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoZXh0ZW5zaW9uLCB0aGlzLm9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEV4dGVuc2lvbkluc3RhbGxGYWlsdXJlQWN0aW9uLCBleHRlbnNpb24sIHRoaXMub3B0aW9ucywgZXh0ZW5zaW9uLmxhdGVzdFZlcnNpb24sIEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCwgZXJyb3IpLnJ1bigpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJ1bm5pbmdFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IG51bGw+IHtcblx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5ydW50aW1lRXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gcnVubmluZ0V4dGVuc2lvbjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucnVudGltZUV4dGVuc2lvblNlcnZpY2UuY2FuQWRkRXh0ZW5zaW9uKHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZXh0ZW5zaW9uKSkpIHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCBudWxsPigoYywgZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5ydW50aW1lRXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJ1bm5pbmdFeHRlbnNpb24gPSBhd2FpdCB0aGlzLnJ1bnRpbWVFeHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0aWYgKHJ1bm5pbmdFeHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0YyhydW5uaW5nRXh0ZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWwgPSB0aGlzLmdldExhYmVsKCk7XG5cdH1cblxuXHRnZXRMYWJlbChwcmltYXJ5PzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uPy5pc1dvcmtzcGFjZVNjb3BlZCAmJiB0aGlzLmV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbiAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKHRoaXMuZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uLmxvY2F0aW9uKSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsIHdvcmtzcGFjZSB2ZXJzaW9uJywgXCJJbnN0YWxsIFdvcmtzcGFjZSBFeHRlbnNpb25cIik7XG5cdFx0fVxuXHRcdC8qIGluc3RhbGwgcHJlLXJlbGVhc2UgdmVyc2lvbiAqL1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uICYmIHRoaXMuZXh0ZW5zaW9uPy5oYXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIHByaW1hcnkgPyBsb2NhbGl6ZSgnaW5zdGFsbCBwcmUtcmVsZWFzZScsIFwiSW5zdGFsbCBQcmUtUmVsZWFzZVwiKSA6IGxvY2FsaXplKCdpbnN0YWxsIHByZS1yZWxlYXNlIHZlcnNpb24nLCBcIkluc3RhbGwgUHJlLVJlbGVhc2UgVmVyc2lvblwiKTtcblx0XHR9XG5cdFx0LyogaW5zdGFsbCByZWxlYXNlZCB2ZXJzaW9uIHRoYXQgaGFzIGEgcHJlIHJlbGVhc2UgdmVyc2lvbiAqL1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbj8uaGFzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybiBwcmltYXJ5ID8gbG9jYWxpemUoJ2luc3RhbGwnLCBcIkluc3RhbGxcIikgOiBsb2NhbGl6ZSgnaW5zdGFsbCByZWxlYXNlIHZlcnNpb24nLCBcIkluc3RhbGwgUmVsZWFzZSBWZXJzaW9uXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2luc3RhbGwnLCBcIkluc3RhbGxcIik7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbERyb3Bkb3duQWN0aW9uIGV4dGVuZHMgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzZXQgbWFuaWZlc3QobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwpIHtcblx0XHR0aGlzLmV4dGVuc2lvbkFjdGlvbnMuZm9yRWFjaChhID0+ICg8SW5zdGFsbEFjdGlvbj5hKS5tYW5pZmVzdCA9IG1hbmlmZXN0KTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYGV4dGVuc2lvbnMuaW5zdGFsbEFjdGlvbnNgLCBJbnN0YWxsQWN0aW9uLkNMQVNTLCBbXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5wcmVmZXJQcmVSZWxlYXNlcyB9KSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFjdGlvbiwgeyBpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246ICFleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5wcmVmZXJQcmVSZWxlYXNlcyB9KSxcblx0XHRcdF1cblx0XHRdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRMYWJlbChhY3Rpb246IEluc3RhbGxBY3Rpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBhY3Rpb24uZ2V0TGFiZWwodHJ1ZSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbGluZ0xhYmVsQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdpbnN0YWxsaW5nJywgXCJJbnN0YWxsaW5nXCIpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IGluc3RhbGwgaW5zdGFsbGluZ2A7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbi5pbnN0YWxsaW5nJywgSW5zdGFsbGluZ0xhYmVsQWN0aW9uLkxBQkVMLCBJbnN0YWxsaW5nTGFiZWxBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsYXNzID0gYCR7SW5zdGFsbGluZ0xhYmVsQWN0aW9uLkNMQVNTfSR7dGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxpbmcgPyAnJyA6ICcgaGlkZSd9YDtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHByb3RlY3RlZCBzdGF0aWMgcmVhZG9ubHkgSU5TVEFMTF9MQUJFTCA9IGxvY2FsaXplKCdpbnN0YWxsJywgXCJJbnN0YWxsXCIpO1xuXHRwcm90ZWN0ZWQgc3RhdGljIHJlYWRvbmx5IElOU1RBTExJTkdfTEFCRUwgPSBsb2NhbGl6ZSgnaW5zdGFsbGluZycsIFwiSW5zdGFsbGluZ1wiKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBpbnN0YWxsLW90aGVyLXNlcnZlcmA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEluc3RhbGxpbmdDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IGluc3RhbGwtb3RoZXItc2VydmVyIGluc3RhbGxpbmdgO1xuXG5cdHVwZGF0ZVdoZW5Db3VudGVyRXh0ZW5zaW9uQ2hhbmdlczogYm9vbGVhbiA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfCBudWxsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FuSW5zdGFsbEFueVdoZXJlOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBJbnN0YWxsSW5PdGhlclNlcnZlckFjdGlvbi5JTlNUQUxMX0xBQkVMLCBJbnN0YWxsSW5PdGhlclNlcnZlckFjdGlvbi5DbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uLkNsYXNzO1xuXG5cdFx0aWYgKHRoaXMuY2FuSW5zdGFsbCgpKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25Jbk90aGVyU2VydmVyID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsZWQuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB0aGlzLmV4dGVuc2lvbiEuaWRlbnRpZmllcikgJiYgZS5zZXJ2ZXIgPT09IHRoaXMuc2VydmVyKVswXTtcblx0XHRcdGlmIChleHRlbnNpb25Jbk90aGVyU2VydmVyKSB7XG5cdFx0XHRcdC8vIEdldHRpbmcgaW5zdGFsbGVkIGluIG90aGVyIHNlcnZlclxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5PdGhlclNlcnZlci5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGluZyAmJiAhZXh0ZW5zaW9uSW5PdGhlclNlcnZlci5sb2NhbCkge1xuXHRcdFx0XHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5sYWJlbCA9IEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uLklOU1RBTExJTkdfTEFCRUw7XG5cdFx0XHRcdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uLkluc3RhbGxpbmdDbGFzcztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm90IGluc3RhbGxlZCBpbiBvdGhlciBzZXJ2ZXJcblx0XHRcdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5sYWJlbCA9IHRoaXMuZ2V0SW5zdGFsbExhYmVsKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGNhbkluc3RhbGwoKTogYm9vbGVhbiB7XG5cdFx0Ly8gRGlzYWJsZSBpZiBleHRlbnNpb24gaXMgbm90IGluc3RhbGxlZCBvciBub3QgYW4gdXNlciBleHRlbnNpb25cblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5leHRlbnNpb25cblx0XHRcdHx8ICF0aGlzLnNlcnZlclxuXHRcdFx0fHwgIXRoaXMuZXh0ZW5zaW9uLmxvY2FsXG5cdFx0XHR8fCB0aGlzLmV4dGVuc2lvbi5zdGF0ZSAhPT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0XHR8fCB0aGlzLmV4dGVuc2lvbi50eXBlICE9PSBFeHRlbnNpb25UeXBlLlVzZXJcblx0XHRcdHx8IHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFbnZpcm9ubWVudCB8fCB0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VHJ1c3RSZXF1aXJlbWVudCB8fCB0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VmlydHVhbFdvcmtzcGFjZVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpc0xhbmd1YWdlUGFja0V4dGVuc2lvbih0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFByZWZlcnMgdG8gcnVuIG9uIFVJXG5cdFx0aWYgKHRoaXMuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPblVJKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUHJlZmVycyB0byBydW4gb24gV29ya3NwYWNlXG5cdFx0aWYgKHRoaXMuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25Xb3Jrc3BhY2UodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBQcmVmZXJzIHRvIHJ1biBvbiBXZWJcblx0XHRpZiAodGhpcy5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPbldlYih0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNhbkluc3RhbGxBbnlXaGVyZSkge1xuXHRcdFx0Ly8gQ2FuIHJ1biBvbiBVSVxuXHRcdFx0aWYgKHRoaXMuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uVUkodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYW4gcnVuIG9uIFdvcmtzcGFjZVxuXHRcdFx0aWYgKHRoaXMuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPbldvcmtzcGFjZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24/LmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5leHRlbnNpb24/LnNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3Blbih0aGlzLmV4dGVuc2lvbik7XG5cdFx0YWxlcnQobG9jYWxpemUoJ2luc3RhbGxFeHRlbnNpb25TdGFydCcsIFwiSW5zdGFsbGluZyBleHRlbnNpb24gezB9IHN0YXJ0ZWQuIEFuIGVkaXRvciBpcyBub3cgb3BlbiB3aXRoIG1vcmUgZGV0YWlscyBvbiB0aGlzIGV4dGVuc2lvblwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGxJblNlcnZlcih0aGlzLmV4dGVuc2lvbiwgdGhpcy5zZXJ2ZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEluc3RhbGxMYWJlbCgpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVJbnN0YWxsQWN0aW9uIGV4dGVuZHMgSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNhbkluc3RhbGxBbnlXaGVyZTogYm9vbGVhbixcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYGV4dGVuc2lvbnMucmVtb3RlaW5zdGFsbGAsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIGNhbkluc3RhbGxBbnlXaGVyZSwgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRJbnN0YWxsTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHQ/IGxvY2FsaXplKHsga2V5OiAnaW5zdGFsbCBpbiByZW1vdGUnLCBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIG5hbWUgb2YgdGhlIGFjdGlvbiB0byBpbnN0YWxsIGFuIGV4dGVuc2lvbiBpbiByZW1vdGUgc2VydmVyLiBQbGFjZWhvbGRlciBpcyBmb3IgdGhlIG5hbWUgb2YgcmVtb3RlIHNlcnZlci4nXSB9LCBcIkluc3RhbGwgaW4gezB9XCIsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5sYWJlbClcblx0XHRcdDogSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24uSU5TVEFMTF9MQUJFTDtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbEluc3RhbGxBY3Rpb24gZXh0ZW5kcyBJbnN0YWxsSW5PdGhlclNlcnZlckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGBleHRlbnNpb25zLmxvY2FsaW5zdGFsbGAsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgZmFsc2UsIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SW5zdGFsbExhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsIGxvY2FsbHknLCBcIkluc3RhbGwgTG9jYWxseVwiKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBXZWJJbnN0YWxsQWN0aW9uIGV4dGVuZHMgSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihgZXh0ZW5zaW9ucy53ZWJJbnN0YWxsYCwgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciwgZmFsc2UsIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SW5zdGFsbExhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsIGJyb3dzZXInLCBcIkluc3RhbGwgaW4gQnJvd3NlclwiKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBVbmluc3RhbGxBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBVbmluc3RhbGxMYWJlbCA9IGxvY2FsaXplKCd1bmluc3RhbGxBY3Rpb24nLCBcIlVuaW5zdGFsbFwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVW5pbnN0YWxsaW5nTGFiZWwgPSBsb2NhbGl6ZSgnVW5pbnN0YWxsaW5nJywgXCJVbmluc3RhbGxpbmdcIik7XG5cblx0c3RhdGljIHJlYWRvbmx5IFVuaW5zdGFsbENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gdW5pbnN0YWxsYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVW5JbnN0YWxsaW5nQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSB1bmluc3RhbGwgdW5pbnN0YWxsaW5nYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy51bmluc3RhbGwnLCBVbmluc3RhbGxBY3Rpb24uVW5pbnN0YWxsTGFiZWwsIFVuaW5zdGFsbEFjdGlvbi5Vbmluc3RhbGxDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZTtcblxuXHRcdGlmIChzdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsaW5nKSB7XG5cdFx0XHR0aGlzLmxhYmVsID0gVW5pbnN0YWxsQWN0aW9uLlVuaW5zdGFsbGluZ0xhYmVsO1xuXHRcdFx0dGhpcy5jbGFzcyA9IFVuaW5zdGFsbEFjdGlvbi5Vbkluc3RhbGxpbmdDbGFzcztcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGFiZWwgPSB0aGlzLmV4dGVuc2lvbi5sb2NhbD8uaXNBcHBsaWNhdGlvblNjb3BlZCAmJiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmxlbmd0aCA+IDEgPyBsb2NhbGl6ZSgndW5pbnN0YWxsQWxsJywgXCJVbmluc3RhbGwgKEFsbCBQcm9maWxlcylcIikgOiBVbmluc3RhbGxBY3Rpb24uVW5pbnN0YWxsTGFiZWw7XG5cdFx0dGhpcy5jbGFzcyA9IFVuaW5zdGFsbEFjdGlvbi5Vbmluc3RhbGxDbGFzcztcblx0XHR0aGlzLnRvb2x0aXAgPSBVbmluc3RhbGxBY3Rpb24uVW5pbnN0YWxsTGFiZWw7XG5cblx0XHRpZiAoc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YWxlcnQobG9jYWxpemUoJ3VuaW5zdGFsbEV4dGVuc2lvblN0YXJ0JywgXCJVbmluc3RhbGxpbmcgZXh0ZW5zaW9uIHswfSBzdGFydGVkLlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudW5pbnN0YWxsKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCd1bmluc3RhbGxFeHRlbnNpb25Db21wbGV0ZScsIFwiUGxlYXNlIHJlbG9hZCBWaXN1YWwgU3R1ZGlvIENvZGUgdG8gY29tcGxldGUgdGhlIHVuaW5zdGFsbGF0aW9uIG9mIHRoZSBleHRlbnNpb24gezB9LlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuZGlhbG9nU2VydmljZS5lcnJvcihnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVwZGF0ZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHVwZGF0ZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gZGlzYWJsZWRgO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZlcmJvc2U6IGJvb2xlYW4sXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGBleHRlbnNpb25zLnVwZGF0ZWAsIGxvY2FsaXplKCd1cGRhdGUnLCBcIlVwZGF0ZVwiKSwgVXBkYXRlQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMuY29tcHV0ZUFuZFVwZGF0ZUVuYWJsZW1lbnQoKSk7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxhYmVsID0gdGhpcy52ZXJib3NlID8gbG9jYWxpemUoJ3VwZGF0ZSB0bycsIFwiVXBkYXRlIHRvIHZ7MH1cIiwgdGhpcy5leHRlbnNpb24ubGF0ZXN0VmVyc2lvbikgOiBsb2NhbGl6ZSgndXBkYXRlJywgXCJVcGRhdGVcIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlQW5kVXBkYXRlRW5hYmxlbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gVXBkYXRlQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhbkluc3RhbGwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwodGhpcy5leHRlbnNpb24pO1xuXHRcdGNvbnN0IGlzSW5zdGFsbGVkID0gdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZDtcblxuXHRcdHRoaXMuZW5hYmxlZCA9IGNhbkluc3RhbGwgPT09IHRydWUgJiYgaXNJbnN0YWxsZWQgJiYgdGhpcy5leHRlbnNpb24ub3V0ZGF0ZWQ7XG5cdFx0dGhpcy5jbGFzcyA9IHRoaXMuZW5hYmxlZCA/IFVwZGF0ZUFjdGlvbi5FbmFibGVkQ2xhc3MgOiBVcGRhdGVBY3Rpb24uRGlzYWJsZWRDbGFzcztcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25zZW50ID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zaG91bGRSZXF1aXJlQ29uc2VudFRvVXBkYXRlKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRpZiAoY29uc2VudCkge1xuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8J3VwZGF0ZScgfCAncmV2aWV3JyB8ICdjYW5jZWwnPih7XG5cdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd1cGRhdGVFeHRlbnNpb25Db25zZW50VGl0bGUnLCBcIlVwZGF0ZSB7MH0gRXh0ZW5zaW9uXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3VwZGF0ZUV4dGVuc2lvbkNvbnNlbnQnLCBcInswfVxcblxcbldvdWxkIHlvdSBsaWtlIHRvIHVwZGF0ZSB0aGUgZXh0ZW5zaW9uP1wiLCBjb25zZW50KSxcblx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3VwZGF0ZScsIFwiVXBkYXRlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gJ3VwZGF0ZSdcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmV2aWV3JywgXCJSZXZpZXdcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiAncmV2aWV3J1xuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+ICdjYW5jZWwnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHRcdGlmIChyZXN1bHQgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgPT09ICdyZXZpZXcnKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5oYXNDaGFuZ2Vsb2coKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5leHRlbnNpb24sIHsgdGFiOiBFeHRlbnNpb25FZGl0b3JUYWIuQ2hhbmdlbG9nIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5yZXBvc2l0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHRoaXMuZXh0ZW5zaW9uLnJlcG9zaXRvcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5leHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbGxPcHRpb25zOiBJbnN0YWxsT3B0aW9ucyA9IHt9O1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5sb2NhbD8uc291cmNlID09PSAndnNpeCcgJiYgdGhpcy5leHRlbnNpb24ubG9jYWwucGlubmVkKSB7XG5cdFx0XHRpbnN0YWxsT3B0aW9ucy5waW5uZWQgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5wcmVSZWxlYXNlKSB7XG5cdFx0XHRpbnN0YWxsT3B0aW9ucy5pbnN0YWxsUHJlUmVsZWFzZVZlcnNpb24gPSB0cnVlO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ3VwZGF0ZUV4dGVuc2lvblN0YXJ0JywgXCJVcGRhdGluZyBleHRlbnNpb24gezB9IHRvIHZlcnNpb24gezF9IHN0YXJ0ZWQuXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCB0aGlzLmV4dGVuc2lvbi5sYXRlc3RWZXJzaW9uKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwodGhpcy5leHRlbnNpb24sIGluc3RhbGxPcHRpb25zKTtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCd1cGRhdGVFeHRlbnNpb25Db21wbGV0ZScsIFwiVXBkYXRpbmcgZXh0ZW5zaW9uIHswfSB0byB2ZXJzaW9uIHsxfSBjb21wbGV0ZWQuXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCB0aGlzLmV4dGVuc2lvbi5sYXRlc3RWZXJzaW9uKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEV4dGVuc2lvbkluc3RhbGxGYWlsdXJlQWN0aW9uLCB0aGlzLmV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnMsIHRoaXMuZXh0ZW5zaW9uLmxhdGVzdFZlcnNpb24sIEluc3RhbGxPcGVyYXRpb24uVXBkYXRlLCBlcnIpLnJ1bigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi50b2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUyKCdlbmFibGVBdXRvVXBkYXRlTGFiZWwnLCBcIkF1dG8gVXBkYXRlXCIpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSBhdXRvLXVwZGF0ZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLklELCBUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLkxBQkVMLnZhbHVlLCBUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLkRpc2FibGVkQ2xhc3MpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5KSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ1ZhbHVlKGUgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGUoKSB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24uRGlzYWJsZWRDbGFzcztcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5pc0J1aWx0aW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbz8uZGlzYWxsb3dJbnN0YWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb24ubG9jYWwgPz8gdGhpcy5leHRlbnNpb24uZ2FsbGVyeTtcblx0XHRpZiAoZXh0ZW5zaW9uICYmIHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZChleHRlbnNpb24pICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEF1dG9VcGRhdGVWYWx1ZSgpID09PSAnb24nICYmICF0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZSh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGFzcyA9IFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24uRW5hYmxlZENsYXNzO1xuXHRcdHRoaXMuY2hlY2tlZCA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNBdXRvVXBkYXRlRW5hYmxlZEZvcih0aGlzLmV4dGVuc2lvbik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlQXV0b1VwZGF0ZSA9ICF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3IodGhpcy5leHRlbnNpb24pO1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudXBkYXRlQXV0b1VwZGF0ZUVuYWJsZW1lbnRGb3IodGhpcy5leHRlbnNpb24sIGVuYWJsZUF1dG9VcGRhdGUpO1xuXG5cdFx0aWYgKGVuYWJsZUF1dG9VcGRhdGUpIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdlbmFibGVBdXRvVXBkYXRlJywgXCJFbmFibGVkIGF1dG8gdXBkYXRlcyBmb3JcIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ2Rpc2FibGVBdXRvVXBkYXRlJywgXCJEaXNhYmxlZCBhdXRvIHVwZGF0ZXMgZm9yXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlckFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi50b2dnbGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlcic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCd0b2dnbGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlckxhYmVsJywgXCJBdXRvIFVwZGF0ZSBBbGwgKEZyb20gUHVibGlzaGVyKVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihUb2dnbGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlckFjdGlvbi5JRCwgVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24uTEFCRUwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlKCkgeyB9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhbGVydChsb2NhbGl6ZSgnaWdub3JlRXh0ZW5zaW9uVXBkYXRlUHVibGlzaGVyJywgXCJJZ25vcmluZyB1cGRhdGVzIHB1Ymxpc2hlZCBieSB7MH0uXCIsIHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lKSk7XG5cdFx0Y29uc3QgZW5hYmxlQXV0b1VwZGF0ZSA9ICF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3IodGhpcy5leHRlbnNpb24ucHVibGlzaGVyKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZUF1dG9VcGRhdGVFbmFibGVtZW50Rm9yKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlciwgZW5hYmxlQXV0b1VwZGF0ZSk7XG5cdFx0aWYgKGVuYWJsZUF1dG9VcGRhdGUpIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdlbmFibGVBdXRvVXBkYXRlJywgXCJFbmFibGVkIGF1dG8gdXBkYXRlcyBmb3JcIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ2Rpc2FibGVBdXRvVXBkYXRlJywgXCJEaXNhYmxlZCBhdXRvIHVwZGF0ZXMgZm9yXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNaWdyYXRlRGVwcmVjYXRlZEV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gbWlncmF0ZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gZGlzYWJsZWRgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc21hbGw6IGJvb2xlYW4sXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnNBY3Rpb24ubWlncmF0ZURlcHJlY2F0ZWRFeHRlbnNpb24nLCBsb2NhbGl6ZSgnbWlncmF0ZUV4dGVuc2lvbicsIFwiTWlncmF0ZVwiKSwgTWlncmF0ZURlcHJlY2F0ZWRFeHRlbnNpb25BY3Rpb24uRGlzYWJsZWRDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IE1pZ3JhdGVEZXByZWNhdGVkRXh0ZW5zaW9uQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8/LmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWQ7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCB9KSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNsYXNzID0gTWlncmF0ZURlcHJlY2F0ZWRFeHRlbnNpb25BY3Rpb24uRW5hYmxlZENsYXNzO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdtaWdyYXRlIHRvJywgXCJNaWdyYXRlIHRvIHswfVwiLCB0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKTtcblx0XHR0aGlzLmxhYmVsID0gdGhpcy5zbWFsbCA/IGxvY2FsaXplKCdtaWdyYXRlJywgXCJNaWdyYXRlXCIpIDogdGhpcy50b29sdGlwO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbj8uZGVwcmVjYXRpb25JbmZvPy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmV4dGVuc2lvbi5sb2NhbDtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVuaW5zdGFsbCh0aGlzLmV4dGVuc2lvbik7XG5cdFx0Y29uc3QgW2V4dGVuc2lvbl0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWQsIHByZVJlbGVhc2U6IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbz8uZXh0ZW5zaW9uPy5wcmVSZWxlYXNlIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoZXh0ZW5zaW9uLCB7IGlzTWFjaGluZVNjb3BlZDogbG9jYWw/LmlzTWFjaGluZVNjb3BlZCB9KTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRHJvcERvd25FeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHRjc3NDbGFzczogc3RyaW5nLFxuXHRcdGVuYWJsZWQ6IGJvb2xlYW4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIGNzc0NsYXNzLCBlbmFibGVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGlvblZpZXdJdGVtOiBEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIHwgbnVsbCA9IG51bGw7XG5cdGNyZWF0ZUFjdGlvblZpZXdJdGVtKG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIHtcblx0XHR0aGlzLl9hY3Rpb25WaWV3SXRlbSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcERvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSwgdGhpcywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvblZpZXdJdGVtO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aGlzLl9hY3Rpb25WaWV3SXRlbT8uc2hvd01lbnUoYWN0aW9uR3JvdXBzKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IHRydWUsIGxhYmVsOiB0cnVlIH0pO1xuXHR9XG5cblx0cHVibGljIHNob3dNZW51KG1lbnVBY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0QWN0aW9ucyhtZW51QWN0aW9uR3JvdXBzKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdC4uLmdldFdvcmtiZW5jaE1lbnVNb3Rpb25Db250ZXh0TWVudU9wdGlvbnModGhpcy5lbGVtZW50KSxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NlSWZEaXNwb3NhYmxlKGFjdGlvbnMpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMobWVudUFjdGlvbkdyb3VwczogSUFjdGlvbltdW10pOiBJQWN0aW9uW10ge1xuXHRcdGxldCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb25zIG9mIG1lbnVBY3Rpb25Hcm91cHMpIHtcblx0XHRcdGFjdGlvbnMgPSBbLi4uYWN0aW9ucywgLi4ubWVudUFjdGlvbnMsIG5ldyBTZXBhcmF0b3IoKV07XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zLmxlbmd0aCA/IGFjdGlvbnMuc2xpY2UoMCwgYWN0aW9ucy5sZW5ndGggLSAxKSA6IGFjdGlvbnM7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0Q29udGV4dE1lbnVBY3Rpb25zR3JvdXBzKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IHVuZGVmaW5lZCB8IG51bGwsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdPiB7XG5cdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IG1lbnVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNZW51U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlKTtcblx0XHRjb25zdCB3b3JrYmVuY2hUaGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaFRoZW1lU2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSk7XG5cdFx0Y29uc3QgY2tzT3ZlcmxheTogW3N0cmluZywgYW55XVtdID0gW107XG5cblx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb24nLCBleHRlbnNpb24uaWRlbnRpZmllci5pZF0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNCdWlsdGluRXh0ZW5zaW9uJywgZXh0ZW5zaW9uLmlzQnVpbHRpbl0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNEZWZhdWx0QXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24nLCBleHRlbnNpb24ubG9jYWwgJiYgaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbihleHRlbnNpb24ubG9jYWwubWFuaWZlc3QpXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uJywgZXh0ZW5zaW9uLmxvY2FsICYmIGV4dGVuc2lvbi5sb2NhbC5pc0FwcGxpY2F0aW9uU2NvcGVkXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydpc1dvcmtzcGFjZVNjb3BlZEV4dGVuc2lvbicsIGV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZF0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNHYWxsZXJ5RXh0ZW5zaW9uJywgISFleHRlbnNpb24uaWRlbnRpZmllci51dWlkXSk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvblNvdXJjZScsIGV4dGVuc2lvbi5sb2NhbC5zb3VyY2VdKTtcblx0XHRcdH1cblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc0NvbmZpZ3VyYXRpb24nLCBleHRlbnNpb24ubG9jYWwgJiYgISFleHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMgJiYgISFleHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMuY29uZmlndXJhdGlvbl0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZXh0ZW5zaW9uSGFzS2V5YmluZGluZ3MnLCBleHRlbnNpb24ubG9jYWwgJiYgISFleHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMgJiYgISFleHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMua2V5YmluZGluZ3NdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc0NvbW1hbmRzJywgZXh0ZW5zaW9uLmxvY2FsICYmICEhZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzICYmICEhZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kc10pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNFeHRlbnNpb25SZWNvbW1lbmRlZCcsICEhZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKClbZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV1dKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzRXh0ZW5zaW9uV29ya3NwYWNlUmVjb21tZW5kZWQnLCBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEFsbFJlY29tbWVuZGF0aW9uc1dpdGhSZWFzb24oKVtleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXT8ucmVhc29uSWQgPT09IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uLldvcmtzcGFjZV0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNVc2VySWdub3JlZFJlY29tbWVuZGF0aW9uJywgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2xvYmFsSWdub3JlZFJlY29tbWVuZGF0aW9ucy5zb21lKGUgPT4gZSA9PT0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSldKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzRXh0ZW5zaW9uUGlubmVkJywgZXh0ZW5zaW9uLnBpbm5lZF0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNFeHRlbnNpb25FbmFibGVkJywgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUpXSk7XG5cdFx0XHRzd2l0Y2ggKGV4dGVuc2lvbi5zdGF0ZSkge1xuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblN0YXRlLkluc3RhbGxpbmc6XG5cdFx0XHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZXh0ZW5zaW9uU3RhdHVzJywgJ2luc3RhbGxpbmcnXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkOlxuXHRcdFx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsZWQnXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsaW5nOlxuXHRcdFx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvblN0YXR1cycsICd1bmluc3RhbGxpbmcnXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQ6XG5cdFx0XHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZXh0ZW5zaW9uU3RhdHVzJywgJ3VuaW5zdGFsbGVkJ10pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaW5zdGFsbGVkRXh0ZW5zaW9uSXNQcmVSZWxlYXNlVmVyc2lvbicsICEhZXh0ZW5zaW9uLmxvY2FsPy5pc1ByZVJlbGVhc2VWZXJzaW9uXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydpbnN0YWxsZWRFeHRlbnNpb25Jc09wdGVkVG9QcmVSZWxlYXNlJywgISFleHRlbnNpb24ubG9jYWw/LnByZVJlbGVhc2VdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2dhbGxlcnlFeHRlbnNpb25Jc1ByZVJlbGVhc2VWZXJzaW9uJywgISFleHRlbnNpb24uZ2FsbGVyeT8ucHJvcGVydGllcy5pc1ByZVJlbGVhc2VWZXJzaW9uXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydnYWxsZXJ5RXh0ZW5zaW9uSGFzUHJlUmVsZWFzZVZlcnNpb24nLCBleHRlbnNpb24uZ2FsbGVyeT8uaGFzUHJlUmVsZWFzZVZlcnNpb25dKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJywgZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNSZWxlYXNlVmVyc2lvbicsIGV4dGVuc2lvbi5oYXNSZWxlYXNlVmVyc2lvbl0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZXh0ZW5zaW9uRGlzYWxsb3dJbnN0YWxsJywgZXh0ZW5zaW9uLmlzTWFsaWNpb3VzIHx8IGV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8/LmRpc2FsbG93SW5zdGFsbF0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNFeHRlbnNpb25BbGxvd2VkJywgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHVibGlzaGVyRGlzcGxheU5hbWU6IGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSB9KSA9PT0gdHJ1ZV0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNQcmVSZWxlYXNlRXh0ZW5zaW9uQWxsb3dlZCcsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUsIHByZXJlbGVhc2U6IHRydWUgfSkgPT09IHRydWVdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbklzVW5zaWduZWQnLCBleHRlbnNpb24uZ2FsbGVyeSAmJiAhZXh0ZW5zaW9uLmdhbGxlcnkuaXNTaWduZWRdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbklzUHJpdmF0ZScsIGV4dGVuc2lvbi5nYWxsZXJ5Py5wcml2YXRlXSk7XG5cblx0XHRcdGNvbnN0IFtjb2xvclRoZW1lcywgZmlsZUljb25UaGVtZXMsIHByb2R1Y3RJY29uVGhlbWVzLCBleHRlbnNpb25Vc2VzQXV0aF0gPSBhd2FpdCBQcm9taXNlLmFsbChbd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCksIHdvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lcygpLCB3b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZXMoKSwgYXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UuZXh0ZW5zaW9uVXNlc0F1dGgoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSldKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc0NvbG9yVGhlbWVzJywgY29sb3JUaGVtZXMuc29tZSh0aGVtZSA9PiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZSwgZXh0ZW5zaW9uKSldKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc0ZpbGVJY29uVGhlbWVzJywgZmlsZUljb25UaGVtZXMuc29tZSh0aGVtZSA9PiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZSwgZXh0ZW5zaW9uKSldKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc1Byb2R1Y3RJY29uVGhlbWVzJywgcHJvZHVjdEljb25UaGVtZXMuc29tZSh0aGVtZSA9PiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZSwgZXh0ZW5zaW9uKSldKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc0FjY291bnRQcmVmZXJlbmNlcycsIGV4dGVuc2lvblVzZXNBdXRoXSk7XG5cblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2NhblNldExhbmd1YWdlJywgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2FuU2V0TGFuZ3VhZ2UoZXh0ZW5zaW9uKV0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNBY3RpdmVMYW5ndWFnZVBhY2tFeHRlbnNpb24nLCBleHRlbnNpb24uZ2FsbGVyeSAmJiBsYW5ndWFnZSA9PT0gZ2V0TG9jYWxlKGV4dGVuc2lvbi5nYWxsZXJ5KV0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnNHcm91cHMgPSBtZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCwgY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShja3NPdmVybGF5KSwgeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gYWN0aW9uc0dyb3Vwcztcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHRvQWN0aW9ucyhhY3Rpb25zR3JvdXBzOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXSwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IElBY3Rpb25bXVtdIHtcblx0Y29uc3QgcmVzdWx0OiBJQWN0aW9uW11bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IFssIGFjdGlvbnNdIG9mIGFjdGlvbnNHcm91cHMpIHtcblx0XHRyZXN1bHQucHVzaChhY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51SXRlbUV4dGVuc2lvbkFjdGlvbiwgYWN0aW9uKTtcblx0XHR9KSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IHVuZGVmaW5lZCB8IG51bGwsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQcm9taXNlPElBY3Rpb25bXVtdPiB7XG5cdGNvbnN0IGFjdGlvbnNHcm91cHMgPSBhd2FpdCBnZXRDb250ZXh0TWVudUFjdGlvbnNHcm91cHMoZXh0ZW5zaW9uLCBjb250ZXh0S2V5U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRyZXR1cm4gdG9BY3Rpb25zKGFjdGlvbnNHcm91cHMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcbn1cblxuZXhwb3J0IGNsYXNzIE1hbmFnZUV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXh0ZW5zaW9ucy5tYW5hZ2UnO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLklDT05fQUNUSU9OX0NMQVNTfSBtYW5hZ2UgYCArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShtYW5hZ2VFeHRlbnNpb25JY29uKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSGlkZU1hbmFnZUV4dGVuc2lvbkNsYXNzID0gYCR7dGhpcy5DbGFzc30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKE1hbmFnZUV4dGVuc2lvbkFjdGlvbi5JRCwgJycsICcnLCB0cnVlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnbWFuYWdlJywgXCJNYW5hZ2VcIik7XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWN0aW9uR3JvdXBzKCk6IFByb21pc2U8SUFjdGlvbltdW10+IHtcblx0XHRjb25zdCBncm91cHM6IElBY3Rpb25bXVtdID0gW107XG5cdFx0Y29uc3QgY29udGV4dE1lbnVBY3Rpb25zR3JvdXBzID0gYXdhaXQgZ2V0Q29udGV4dE1lbnVBY3Rpb25zR3JvdXBzKHRoaXMuZXh0ZW5zaW9uLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0aGVtZUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdLCBpbnN0YWxsQWN0aW9uczogSUFjdGlvbltdID0gW10sIHVwZGF0ZUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdLCBvdGhlckFjdGlvbkdyb3VwczogSUFjdGlvbltdW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtncm91cCwgYWN0aW9uc10gb2YgY29udGV4dE1lbnVBY3Rpb25zR3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAgPT09IElOU1RBTExfQUNUSU9OU19HUk9VUCkge1xuXHRcdFx0XHRpbnN0YWxsQWN0aW9ucy5wdXNoKC4uLnRvQWN0aW9ucyhbW2dyb3VwLCBhY3Rpb25zXV0sIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpWzBdKTtcblx0XHRcdH0gZWxzZSBpZiAoZ3JvdXAgPT09IFVQREFURV9BQ1RJT05TX0dST1VQKSB7XG5cdFx0XHRcdHVwZGF0ZUFjdGlvbnMucHVzaCguLi50b0FjdGlvbnMoW1tncm91cCwgYWN0aW9uc11dLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKVswXSk7XG5cdFx0XHR9IGVsc2UgaWYgKGdyb3VwID09PSBUSEVNRV9BQ1RJT05TX0dST1VQKSB7XG5cdFx0XHRcdHRoZW1lQWN0aW9ucy5wdXNoKC4uLnRvQWN0aW9ucyhbW2dyb3VwLCBhY3Rpb25zXV0sIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpWzBdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG90aGVyQWN0aW9uR3JvdXBzLnB1c2goLi4udG9BY3Rpb25zKFtbZ3JvdXAsIGFjdGlvbnNdXSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGVtZUFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRncm91cHMucHVzaCh0aGVtZUFjdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ2hhdEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKTtcblx0XHRpZiAoaXNDaGF0RXh0ZW5zaW9uKSB7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24pXG5cdFx0XHRdKTtcblx0XHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uKVxuXHRcdFx0XSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlRm9yV29ya3NwYWNlQWN0aW9uKVxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUdsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlRm9yV29ya3NwYWNlQWN0aW9uKVxuXHRcdFx0XSk7XG5cdFx0fVxuXHRcdGlmICh1cGRhdGVBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0Z3JvdXBzLnB1c2godXBkYXRlQWN0aW9ucyk7XG5cdFx0fVxuXHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdC4uLihpbnN0YWxsQWN0aW9ucy5sZW5ndGggPyBpbnN0YWxsQWN0aW9ucyA6IFtdKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLCB0aGlzLmV4dGVuc2lvbiwgZmFsc2UpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmluc3RhbGxBY3Rpb24pLFxuXHRcdF0pO1xuXG5cdFx0b3RoZXJBY3Rpb25Hcm91cHMuZm9yRWFjaChhY3Rpb25zID0+IGdyb3Vwcy5wdXNoKGFjdGlvbnMpKTtcblxuXHRcdGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLmZvckVhY2goZXh0ZW5zaW9uQWN0aW9uID0+IHtcblx0XHRcdGlmIChleHRlbnNpb25BY3Rpb24gaW5zdGFuY2VvZiBFeHRlbnNpb25BY3Rpb24pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uQWN0aW9uLmV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBncm91cHM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0cmV0dXJuIHN1cGVyLnJ1bihhd2FpdCB0aGlzLmdldEFjdGlvbkdyb3VwcygpKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsYXNzID0gTWFuYWdlRXh0ZW5zaW9uQWN0aW9uLkhpZGVNYW5hZ2VFeHRlbnNpb25DbGFzcztcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5leHRlbnNpb24uc3RhdGU7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSBzdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkO1xuXHRcdFx0dGhpcy5jbGFzcyA9IHRoaXMuZW5hYmxlZCB8fCBzdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsaW5nID8gTWFuYWdlRXh0ZW5zaW9uQWN0aW9uLkNsYXNzIDogTWFuYWdlRXh0ZW5zaW9uQWN0aW9uLkhpZGVNYW5hZ2VFeHRlbnNpb25DbGFzcztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkVkaXRvck1hbmFnZUV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9uRWRpdG9yLm1hbmFnZUV4dGVuc2lvbicsICcnLCBgJHtFeHRlbnNpb25BY3Rpb24uSUNPTl9BQ1RJT05fQ0xBU1N9IG1hbmFnZSAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShtYW5hZ2VFeHRlbnNpb25JY29uKX1gLCB0cnVlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ21hbmFnZScsIFwiTWFuYWdlXCIpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQgeyB9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgYWN0aW9uR3JvdXBzOiBJQWN0aW9uW11bXSA9IFtdO1xuXHRcdChhd2FpdCBnZXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5leHRlbnNpb24sIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpKS5mb3JFYWNoKGFjdGlvbnMgPT4gYWN0aW9uR3JvdXBzLnB1c2goYWN0aW9ucykpO1xuXHRcdGFjdGlvbkdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLmZvckVhY2goZXh0ZW5zaW9uQWN0aW9uID0+IHtcblx0XHRcdGlmIChleHRlbnNpb25BY3Rpb24gaW5zdGFuY2VvZiBFeHRlbnNpb25BY3Rpb24pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uQWN0aW9uLmV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gc3VwZXIucnVuKGFjdGlvbkdyb3Vwcyk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTWVudUl0ZW1FeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uOiBJQWN0aW9uLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24uaWQsIGFjdGlvbi5sYWJlbCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5hY3Rpb24uZW5hYmxlZDtcblx0fVxuXG5cdG92ZXJyaWRlIHNldCBlbmFibGVkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5hY3Rpb24uZW5hYmxlZCA9IHZhbHVlO1xuXHR9XG5cblx0dXBkYXRlKCkge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWN0aW9uLmlkID09PSBUT0dHTEVfSUdOT1JFX0VYVEVOU0lPTl9BQ1RJT05fSUQpIHtcblx0XHRcdHRoaXMuY2hlY2tlZCA9ICF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzRXh0ZW5zaW9uSWdub3JlZFRvU3luYyh0aGlzLmV4dGVuc2lvbik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmFjdGlvbi5pZCA9PT0gVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbi5JRCkge1xuXHRcdFx0dGhpcy5jaGVja2VkID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0F1dG9VcGRhdGVFbmFibGVkRm9yKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuYWN0aW9uLmlkID09PSBUb2dnbGVBdXRvVXBkYXRlc0ZvclB1Ymxpc2hlckFjdGlvbi5JRCkge1xuXHRcdFx0dGhpcy5jaGVja2VkID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0F1dG9VcGRhdGVFbmFibGVkRm9yKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2hlY2tlZCA9IHRoaXMuYWN0aW9uLmNoZWNrZWQ7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0Y29uc3QgaWQgPSB0aGlzLmV4dGVuc2lvbi5sb2NhbCA/IGdldEV4dGVuc2lvbklkKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LnB1Ymxpc2hlciwgdGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QubmFtZSlcblx0XHRcdFx0OiB0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5ID8gZ2V0RXh0ZW5zaW9uSWQodGhpcy5leHRlbnNpb24uZ2FsbGVyeS5wdWJsaXNoZXIsIHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkubmFtZSlcblx0XHRcdFx0XHQ6IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdFx0XHRjb25zdCBleHRlbnNpb25Bcmc6IElFeHRlbnNpb25BcmcgPSB7XG5cdFx0XHRcdGlkOiB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHR2ZXJzaW9uOiB0aGlzLmV4dGVuc2lvbi52ZXJzaW9uLFxuXHRcdFx0XHRsb2NhdGlvbjogdGhpcy5leHRlbnNpb24ubG9jYWw/LmxvY2F0aW9uLFxuXHRcdFx0XHRnYWxsZXJ5TGluazogdGhpcy5leHRlbnNpb24udXJsXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgdGhpcy5hY3Rpb24ucnVuKGlkLCBleHRlbnNpb25BcmcpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlUHJlUmVsZWFzZUV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi50b2dnbGVQcmVSbGVhc2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgndG9nZ2xlUHJlUmxlYXNlTGFiZWwnLCBcIlByZS1SZWxlYXNlXCIpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBwcmUtcmVsZWFzZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24uSUQsIFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24uTEFCRUwsIFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24uRGlzYWJsZWRDbGFzcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZSgpIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gVG9nZ2xlUHJlUmVsZWFzZUV4dGVuc2lvbkFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5leHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24ucHJlUmVsZWFzZSkge1xuXHRcdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5pc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoeyBpZDogdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHVibGlzaGVyRGlzcGxheU5hbWU6IHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lIH0pICE9PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5wcmVSZWxlYXNlKSB7XG5cdFx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkuaGFzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5KSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGFzcyA9IFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24uRW5hYmxlZENsYXNzO1xuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnByZVJlbGVhc2UpIHtcblx0XHRcdHRoaXMubGFiZWwgPSBsb2NhbGl6ZSgndG9nZ2xlUHJlUmxlYXNlRGlzYWJsZUxhYmVsJywgXCJTd2l0Y2ggdG8gUmVsZWFzZSBWZXJzaW9uXCIpO1xuXHRcdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ3RvZ2dsZVByZVJsZWFzZURpc2FibGVUb29sdGlwJywgXCJUaGlzIHdpbGwgc3dpdGNoIGFuZCBlbmFibGUgdXBkYXRlcyB0byByZWxlYXNlIHZlcnNpb25zXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ3N3aXRjaFRvUHJlUmVsZWFzZUxhYmVsJywgXCJTd2l0Y2ggdG8gUHJlLVJlbGVhc2UgVmVyc2lvblwiKTtcblx0XHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdzd2l0Y2hUb1ByZVJlbGVhc2VUb29sdGlwJywgXCJUaGlzIHdpbGwgc3dpdGNoIHRvIHByZS1yZWxlYXNlIHZlcnNpb24gYW5kIGVuYWJsZSB1cGRhdGVzIHRvIGxhdGVzdCB2ZXJzaW9uIGFsd2F5c1wiKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3Blbih0aGlzLmV4dGVuc2lvbiwgeyBzaG93UHJlUmVsZWFzZVZlcnNpb246ICF0aGlzLmV4dGVuc2lvbi5wcmVSZWxlYXNlIH0pO1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudG9nZ2xlUHJlUmVsZWFzZSh0aGlzLmV4dGVuc2lvbik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5pbnN0YWxsLmFub3RoZXJWZXJzaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2luc3RhbGwgYW5vdGhlciB2ZXJzaW9uJywgXCJJbnN0YWxsIFNwZWNpZmljIFZlcnNpb24uLi5cIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgbnVsbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdoZW5JbnN0YWxsZWQ6IGJvb2xlYW4sXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbi5JRCwgSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ1ZhbHVlKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9ICEhdGhpcy5leHRlbnNpb24gJiYgIXRoaXMuZXh0ZW5zaW9uLmlzQnVpbHRpbiAmJiAhIXRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZCAmJiAhdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvXG5cdFx0XHQmJiB0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoeyBpZDogdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgcHVibGlzaGVyRGlzcGxheU5hbWU6IHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lIH0pID09PSB0cnVlO1xuXHRcdGlmICh0aGlzLmVuYWJsZWQgJiYgdGhpcy53aGVuSW5zdGFsbGVkKSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSAhIXRoaXMuZXh0ZW5zaW9uPy5sb2NhbCAmJiAhIXRoaXMuZXh0ZW5zaW9uLnNlcnZlciAmJiB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIgPyBhd2FpdCB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKSA6IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRjb25zdCBhbGxWZXJzaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0QWxsQ29tcGF0aWJsZVZlcnNpb25zKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5wcmVSZWxlYXNlID8/IHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnk/LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbiA/PyBmYWxzZSwgdGFyZ2V0UGxhdGZvcm0pO1xuXHRcdGlmICghYWxsVmVyc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnbm8gdmVyc2lvbnMnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhcyBubyBvdGhlciB2ZXJzaW9ucy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2tzID0gYWxsVmVyc2lvbnMubWFwKCh2LCBpKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogdi52ZXJzaW9uLFxuXHRcdFx0XHRsYWJlbDogdi52ZXJzaW9uLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYCR7ZnJvbU5vdyhuZXcgRGF0ZShEYXRlLnBhcnNlKHYuZGF0ZSkpLCB0cnVlKX0ke3YuaXNQcmVSZWxlYXNlVmVyc2lvbiA/IGAgKCR7bG9jYWxpemUoJ3ByZS1yZWxlYXNlJywgXCJwcmUtcmVsZWFzZVwiKX0pYCA6ICcnfSR7di52ZXJzaW9uID09PSB0aGlzLmV4dGVuc2lvbj8ubG9jYWw/Lm1hbmlmZXN0LnZlcnNpb24gPyBgICgke2xvY2FsaXplKCdjdXJyZW50JywgXCJjdXJyZW50XCIpfSlgIDogJyd9YCxcblx0XHRcdFx0YXJpYUxhYmVsOiBgJHt2LmlzUHJlUmVsZWFzZVZlcnNpb24gPyAnUHJlLVJlbGVhc2UgdmVyc2lvbicgOiAnUmVsZWFzZSB2ZXJzaW9uJ30gJHt2LnZlcnNpb259YCxcblx0XHRcdFx0aXNQcmVSZWxlYXNlVmVyc2lvbjogdi5pc1ByZVJlbGVhc2VWZXJzaW9uXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsXG5cdFx0XHR7XG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0VmVyc2lvbicsIFwiU2VsZWN0IFZlcnNpb24gdG8gSW5zdGFsbFwiKSxcblx0XHRcdFx0bWF0Y2hPbkRldGFpbDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0aWYgKHBpY2spIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5sb2NhbD8ubWFuaWZlc3QudmVyc2lvbiA9PT0gcGljay5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvcHRpb25zID0geyBpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IHBpY2suaXNQcmVSZWxlYXNlVmVyc2lvbiwgdmVyc2lvbjogcGljay5pZCB9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKHRoaXMuZXh0ZW5zaW9uLCBvcHRpb25zKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RXh0ZW5zaW9uSW5zdGFsbEZhaWx1cmVBY3Rpb24sIHRoaXMuZXh0ZW5zaW9uLCBvcHRpb25zLCBwaWNrLmlkLCBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsIGVycm9yKS5ydW4oKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlRm9yV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXh0ZW5zaW9ucy5lbmFibGVGb3JXb3Jrc3BhY2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZW5hYmxlRm9yV29ya3NwYWNlQWN0aW9uJywgXCJFbmFibGUgKFdvcmtzcGFjZSlcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEVuYWJsZUZvcldvcmtzcGFjZUFjdGlvbi5JRCwgRW5hYmxlRm9yV29ya3NwYWNlQWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZW5hYmxlRm9yV29ya3NwYWNlQWN0aW9uVG9vbFRpcCcsIFwiRW5hYmxlIHRoaXMgZXh0ZW5zaW9uIG9ubHkgaW4gdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24ubG9jYWwgJiYgIXRoaXMuZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRpZiAoRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWRcblx0XHRcdFx0JiYgIXRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKHRoaXMuZXh0ZW5zaW9uLmxvY2FsKVxuXHRcdFx0XHQmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24ubG9jYWwpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbmFibGVHbG9iYWxseUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuZW5hYmxlR2xvYmFsbHknO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZW5hYmxlR2xvYmFsbHlBY3Rpb24nLCBcIkVuYWJsZVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRW5hYmxlR2xvYmFsbHlBY3Rpb24uSUQsIEVuYWJsZUdsb2JhbGx5QWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZW5hYmxlR2xvYmFsbHlBY3Rpb25Ub29sVGlwJywgXCJFbmFibGUgdGhpcyBleHRlbnNpb25cIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24ubG9jYWwgJiYgIXRoaXMuZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHRpZiAoRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWRcblx0XHRcdFx0JiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0Rpc2FibGVkR2xvYmFsbHkodGhpcy5leHRlbnNpb24ubG9jYWwpXG5cdFx0XHRcdCYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlRW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuZGlzYWJsZUZvcldvcmtzcGFjZSc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdkaXNhYmxlRm9yV29ya3NwYWNlQWN0aW9uJywgXCJEaXNhYmxlIChXb3Jrc3BhY2UpXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihEaXNhYmxlRm9yV29ya3NwYWNlQWN0aW9uLklELCBEaXNhYmxlRm9yV29ya3NwYWNlQWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvblRvb2xUaXAnLCBcIkRpc2FibGUgdGhpcyBleHRlbnNpb24gb25seSBpbiB0aGlzIHdvcmtzcGFjZVwiKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbiAmJiB0aGlzLmV4dGVuc2lvbi5sb2NhbCAmJiAhdGhpcy5leHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQgJiYgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogZS51dWlkIH0sIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSAmJiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSkge1xuXHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0XHRcdCYmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkgfHwgdGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSlcblx0XHRcdFx0JiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVHbG9iYWxseUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuZGlzYWJsZUdsb2JhbGx5Jztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2Rpc2FibGVHbG9iYWxseUFjdGlvbicsIFwiRGlzYWJsZVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRGlzYWJsZUdsb2JhbGx5QWN0aW9uLklELCBEaXNhYmxlR2xvYmFsbHlBY3Rpb24uTEFCRUwsIEV4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdkaXNhYmxlR2xvYmFsbHlBY3Rpb25Ub29sVGlwJywgXCJEaXNhYmxlIHRoaXMgZXh0ZW5zaW9uXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucygoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsICYmICF0aGlzLmV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCAmJiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZS5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBlLnV1aWQgfSwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0XHRcdCYmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkgfHwgdGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSlcblx0XHRcdFx0JiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5KTtcblx0fVxufVxuXG5jbGFzcyBFbmFibGVBSUZlYXR1cmVzR2xvYmFsbHlBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmVuYWJsZUFJR2xvYmFsbHknO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZW5hYmxlQUlHbG9iYWxseUFjdGlvbicsIFwiRW5hYmxlIEFJIEZlYXR1cmVzXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihFbmFibGVBSUZlYXR1cmVzR2xvYmFsbHlBY3Rpb24uSUQsIEVuYWJsZUFJRmVhdHVyZXNHbG9iYWxseUFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2VuYWJsZUFJR2xvYmFsbHlBY3Rpb25Ub29sVGlwJywgXCJFbmFibGUgQUkgZmVhdHVyZXNcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5zcGVjdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCk7XG5cdFx0aWYgKGluc3BlY3Q/LndvcmtzcGFjZVZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IGluc3BlY3QudmFsdWUgPT09IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCwgZmFsc2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbmFibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmVuYWJsZUFJSW5Xb3Jrc3BhY2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZW5hYmxlQUlJbldvcmtzcGFjZUFjdGlvbicsIFwiRW5hYmxlIEFJIEZlYXR1cmVzIChXb3Jrc3BhY2UpXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihFbmFibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24uSUQsIEVuYWJsZUFJRmVhdHVyZXNJbldvcmtzcGFjZUFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2VuYWJsZUFJSW5Xb3Jrc3BhY2VBY3Rpb25Ub29sVGlwJywgXCJFbmFibGUgQUkgZmVhdHVyZXMgaW4gdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlV29ya3NwYWNlRW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbi5sb2NhbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5zcGVjdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCk7XG5cdFx0aWYgKGluc3BlY3QudmFsdWUgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0Py53b3Jrc3BhY2VWYWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkgPT09IHRydWUpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIERpc2FibGVBSUZlYXR1cmVzR2xvYmFsbHlBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmRpc2FibGVBSUdsb2JhbGx5Jztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2Rpc2FibGVBSUdsb2JhbGx5QWN0aW9uJywgXCJEaXNhYmxlIEFJIEZlYXR1cmVzXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihEaXNhYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uLklELCBEaXNhYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZGlzYWJsZUFJR2xvYmFsbHlBY3Rpb25Ub29sVGlwJywgXCJEaXNhYmxlIEFJIGZlYXR1cmVzXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdFx0XHQmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSAhPT0gdHJ1ZVxuXHRcdFx0XHQmJiB0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgIT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCwgdHJ1ZSk7XG5cdH1cbn1cblxuY2xhc3MgRGlzYWJsZUFJRmVhdHVyZXNJbldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuZGlzYWJsZUFJSW5Xb3Jrc3BhY2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZGlzYWJsZUFJSW5Xb3Jrc3BhY2VBY3Rpb24nLCBcIkRpc2FibGUgQUkgRmVhdHVyZXMgKFdvcmtzcGFjZSlcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKERpc2FibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24uSUQsIERpc2FibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24uTEFCRUwsIEV4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdkaXNhYmxlQUlJbldvcmtzcGFjZUFjdGlvblRvb2xUaXAnLCBcIkRpc2FibGUgQUkgZmVhdHVyZXMgaW4gdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24ubG9jYWwgJiYgRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0XHRcdCYmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkgfHwgdGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSlcblx0XHRcdFx0JiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS51cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucyhsb2NhbGl6ZSgncmVzdGFydEV4dGVuc2lvbkhvc3QucmVhc29uLmRpc2FibGUnLCBcIkRpc2FibGluZyBBSSBmZWF0dXJlc1wiKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVuYWJsZURyb3BEb3duQWN0aW9uIGV4dGVuZHMgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuZW5hYmxlJywgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUywgW1xuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZUZvcldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZUFJRmVhdHVyZXNHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZUFJRmVhdHVyZXNJbldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF1cblx0XHRdKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZURyb3BEb3duQWN0aW9uIGV4dGVuZHMgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuZGlzYWJsZScsIEV4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MsIFtcblx0XHRcdFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUdsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVBSUZlYXR1cmVzR2xvYmFsbHlBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uKVxuXHRcdFx0XVxuXHRcdF0pO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblJ1bnRpbWVTdGF0ZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IHJlbG9hZGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gZGlzYWJsZWRgO1xuXG5cdHVwZGF0ZVdoZW5Db3VudGVyRXh0ZW5zaW9uQ2hhbmdlczogYm9vbGVhbiA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLnJ1bnRpbWVTdGF0ZScsICcnLCBFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb24uRGlzYWJsZWRDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy50b29sdGlwID0gJyc7XG5cdFx0dGhpcy5jbGFzcyA9IEV4dGVuc2lvblJ1bnRpbWVTdGF0ZUFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5leHRlbnNpb24uc3RhdGU7XG5cdFx0aWYgKHN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nIHx8IHN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ubG9jYWwgJiYgdGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QgJiYgdGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMgJiYgdGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucyAmJiB0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBydW50aW1lU3RhdGUgPSB0aGlzLmV4dGVuc2lvbi5ydW50aW1lU3RhdGU7XG5cdFx0aWYgKCFydW50aW1lU3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2xhc3MgPSBFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb24uRW5hYmxlZENsYXNzO1xuXHRcdHRoaXMudG9vbHRpcCA9IHJ1bnRpbWVTdGF0ZS5yZWFzb247XG5cdFx0dGhpcy5sYWJlbCA9IHJ1bnRpbWVTdGF0ZS5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlbG9hZFdpbmRvdyA/IGxvY2FsaXplKCdyZWxvYWQgd2luZG93JywgJ1JlbG9hZCBXaW5kb3cnKVxuXHRcdFx0OiBydW50aW1lU3RhdGUuYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZXN0YXJ0RXh0ZW5zaW9ucyA/IGxvY2FsaXplKCdyZXN0YXJ0IGV4dGVuc2lvbnMnLCAnUmVzdGFydCBFeHRlbnNpb25zJylcblx0XHRcdFx0OiBydW50aW1lU3RhdGUuYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5RdWl0QW5kSW5zdGFsbCA/IGxvY2FsaXplKCdyZXN0YXJ0IHByb2R1Y3QnLCAnUmVzdGFydCB0byBVcGRhdGUnKVxuXHRcdFx0XHRcdDogcnVudGltZVN0YXRlLmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuQXBwbHlVcGRhdGUgfHwgcnVudGltZVN0YXRlLmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuRG93bmxvYWRVcGRhdGUgPyBsb2NhbGl6ZSgndXBkYXRlIHByb2R1Y3QnLCAnVXBkYXRlIHswfScsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSA6ICcnO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgcnVudGltZVN0YXRlID0gdGhpcy5leHRlbnNpb24/LnJ1bnRpbWVTdGF0ZTtcblx0XHRpZiAoIXJ1bnRpbWVTdGF0ZT8uYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHlwZSBFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ0V4dGVuc2lvbiBydW50aW1lIHN0YXRlIGFjdGlvbiBldmVudCc7XG5cdFx0XHRhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeGVjdXRlZCBhY3Rpb24nIH07XG5cdFx0fTtcblx0XHR0eXBlIEV4dGVuc2lvblJ1bnRpbWVTdGF0ZUFjdGlvbkV2ZW50ID0ge1xuXHRcdFx0YWN0aW9uOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb25FdmVudCwgRXh0ZW5zaW9uUnVudGltZVN0YXRlQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25zOnJ1bnRpbWVzdGF0ZTphY3Rpb24nLCB7XG5cdFx0XHRhY3Rpb246IHJ1bnRpbWVTdGF0ZS5hY3Rpb25cblx0XHR9KTtcblxuXHRcdGlmIChydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVsb2FkV2luZG93KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ob3N0U2VydmljZS5yZWxvYWQoKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVzdGFydEV4dGVuc2lvbnMpIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZVJ1bm5pbmdFeHRlbnNpb25zKCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAocnVudGltZVN0YXRlPy5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLkRvd25sb2FkVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51cGRhdGVTZXJ2aWNlLmRvd25sb2FkVXBkYXRlKHRydWUpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5BcHBseVVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlU2VydmljZS5hcHBseVVwZGF0ZSgpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5RdWl0QW5kSW5zdGFsbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlU2VydmljZS5xdWl0QW5kSW5zdGFsbCgpO1xuXHRcdH1cblxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUsIGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IHVuZGVmaW5lZCB8IG51bGwpOiBib29sZWFuIHtcblx0cmV0dXJuICEhKGV4dGVuc2lvbiAmJiB0aGVtZS5leHRlbnNpb25EYXRhICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoZW1lLmV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG59XG5cbmZ1bmN0aW9uIGdldFF1aWNrUGlja0VudHJpZXModGhlbWVzOiBJV29ya2JlbmNoVGhlbWVbXSwgY3VycmVudFRoZW1lOiBJV29ya2JlbmNoVGhlbWUsIGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwgfCB1bmRlZmluZWQsIHNob3dDdXJyZW50VGhlbWU6IGJvb2xlYW4pOiBRdWlja1BpY2tJdGVtW10ge1xuXHRjb25zdCBwaWNrczogUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdGZvciAoY29uc3QgdGhlbWUgb2YgdGhlbWVzKSB7XG5cdFx0aWYgKGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoZW1lLCBleHRlbnNpb24pICYmICEoc2hvd0N1cnJlbnRUaGVtZSAmJiB0aGVtZSA9PT0gY3VycmVudFRoZW1lKSkge1xuXHRcdFx0cGlja3MucHVzaCh7IGxhYmVsOiB0aGVtZS5sYWJlbCwgaWQ6IHRoZW1lLmlkIH0pO1xuXHRcdH1cblx0fVxuXHRpZiAoc2hvd0N1cnJlbnRUaGVtZSkge1xuXHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdjdXJyZW50JywgXCJjdXJyZW50XCIpIH0pO1xuXHRcdHBpY2tzLnB1c2goeyBsYWJlbDogY3VycmVudFRoZW1lLmxhYmVsLCBpZDogY3VycmVudFRoZW1lLmlkIH0pO1xuXHR9XG5cdHJldHVybiBwaWNrcztcbn1cblxuZXhwb3J0IGNsYXNzIFNldENvbG9yVGhlbWVBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2V0Q29sb3JUaGVtZSc7XG5cdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNldENvbG9yVGhlbWUnLCAnU2V0IENvbG9yIFRoZW1lJyk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gdGhlbWVgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hUaGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFNldENvbG9yVGhlbWVBY3Rpb24uSUQsIFNldENvbG9yVGhlbWVBY3Rpb24uVElUTEUudmFsdWUsIFNldENvbG9yVGhlbWVBY3Rpb24uRGlzYWJsZWRDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueTxhbnk+KGV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zLCB3b3JrYmVuY2hUaGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKSgoKSA9PiB0aGlzLnVwZGF0ZSgpLCB0aGlzKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpLnRoZW4oY29sb3JUaGVtZXMgPT4ge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5jb21wdXRlRW5hYmxlbWVudChjb2xvclRoZW1lcyk7XG5cdFx0XHR0aGlzLmNsYXNzID0gdGhpcy5lbmFibGVkID8gU2V0Q29sb3JUaGVtZUFjdGlvbi5FbmFibGVkQ2xhc3MgOiBTZXRDb2xvclRoZW1lQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVFbmFibGVtZW50KGNvbG9yVGhlbWVzOiBJV29ya2JlbmNoQ29sb3JUaGVtZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZSh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUpICYmIGNvbG9yVGhlbWVzLnNvbWUodGggPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGgsIHRoaXMuZXh0ZW5zaW9uKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oeyBzaG93Q3VycmVudFRoZW1lLCBpZ25vcmVGb2N1c0xvc3QgfTogeyBzaG93Q3VycmVudFRoZW1lOiBib29sZWFuOyBpZ25vcmVGb2N1c0xvc3Q6IGJvb2xlYW4gfSA9IHsgc2hvd0N1cnJlbnRUaGVtZTogZmFsc2UsIGlnbm9yZUZvY3VzTG9zdDogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgY29sb3JUaGVtZXMgPSBhd2FpdCB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpO1xuXG5cdFx0aWYgKCF0aGlzLmNvbXB1dGVFbmFibGVtZW50KGNvbG9yVGhlbWVzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50VGhlbWUgPSB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cblx0XHRjb25zdCBkZWxheWVyID0gbmV3IERlbGF5ZXI8YW55PigxMDApO1xuXHRcdGNvbnN0IHBpY2tzID0gZ2V0UXVpY2tQaWNrRW50cmllcyhjb2xvclRoZW1lcywgY3VycmVudFRoZW1lLCB0aGlzLmV4dGVuc2lvbiwgc2hvd0N1cnJlbnRUaGVtZSk7XG5cdFx0Y29uc3QgcGlja2VkVGhlbWUgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soXG5cdFx0XHRwaWNrcyxcblx0XHRcdHtcblx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3QgY29sb3IgdGhlbWUnLCBcIlNlbGVjdCBDb2xvciBUaGVtZVwiKSxcblx0XHRcdFx0b25EaWRGb2N1czogaXRlbSA9PiBkZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZShpdGVtLmlkLCB1bmRlZmluZWQpKSxcblx0XHRcdFx0aWdub3JlRm9jdXNMb3N0XG5cdFx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZShwaWNrZWRUaGVtZSA/IHBpY2tlZFRoZW1lLmlkIDogY3VycmVudFRoZW1lLmlkLCAnYXV0bycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXRGaWxlSWNvblRoZW1lQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNldEZpbGVJY29uVGhlbWUnO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zZXRGaWxlSWNvblRoZW1lJywgJ1NldCBGaWxlIEljb24gVGhlbWUnKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFbmFibGVkQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSB0aGVtZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gZGlzYWJsZWRgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaFRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaFRoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoU2V0RmlsZUljb25UaGVtZUFjdGlvbi5JRCwgU2V0RmlsZUljb25UaGVtZUFjdGlvbi5USVRMRS52YWx1ZSwgU2V0RmlsZUljb25UaGVtZUFjdGlvbi5EaXNhYmxlZENsYXNzLCBmYWxzZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55PGFueT4oZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMsIHdvcmtiZW5jaFRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UpKCgpID0+IHRoaXMudXBkYXRlKCksIHRoaXMpKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWVzKCkudGhlbihmaWxlSWNvblRoZW1lcyA9PiB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLmNvbXB1dGVFbmFibGVtZW50KGZpbGVJY29uVGhlbWVzKTtcblx0XHRcdHRoaXMuY2xhc3MgPSB0aGlzLmVuYWJsZWQgPyBTZXRGaWxlSWNvblRoZW1lQWN0aW9uLkVuYWJsZWRDbGFzcyA6IFNldEZpbGVJY29uVGhlbWVBY3Rpb24uRGlzYWJsZWRDbGFzcztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUVuYWJsZW1lbnQoY29sb3JUaGVtZmlsZUljb25UaGVtZXNzOiBJV29ya2JlbmNoRmlsZUljb25UaGVtZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZSh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUpICYmIGNvbG9yVGhlbWZpbGVJY29uVGhlbWVzcy5zb21lKHRoID0+IGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoLCB0aGlzLmV4dGVuc2lvbikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKHsgc2hvd0N1cnJlbnRUaGVtZSwgaWdub3JlRm9jdXNMb3N0IH06IHsgc2hvd0N1cnJlbnRUaGVtZTogYm9vbGVhbjsgaWdub3JlRm9jdXNMb3N0OiBib29sZWFuIH0gPSB7IHNob3dDdXJyZW50VGhlbWU6IGZhbHNlLCBpZ25vcmVGb2N1c0xvc3Q6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGZpbGVJY29uVGhlbWVzID0gYXdhaXQgdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZXMoKTtcblx0XHRpZiAoIXRoaXMuY29tcHV0ZUVuYWJsZW1lbnQoZmlsZUljb25UaGVtZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWUoKTtcblxuXHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgRGVsYXllcjxhbnk+KDEwMCk7XG5cdFx0Y29uc3QgcGlja3MgPSBnZXRRdWlja1BpY2tFbnRyaWVzKGZpbGVJY29uVGhlbWVzLCBjdXJyZW50VGhlbWUsIHRoaXMuZXh0ZW5zaW9uLCBzaG93Q3VycmVudFRoZW1lKTtcblx0XHRjb25zdCBwaWNrZWRUaGVtZSA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhcblx0XHRcdHBpY2tzLFxuXHRcdFx0e1xuXHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdCBmaWxlIGljb24gdGhlbWUnLCBcIlNlbGVjdCBGaWxlIEljb24gVGhlbWVcIiksXG5cdFx0XHRcdG9uRGlkRm9jdXM6IGl0ZW0gPT4gZGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLnNldEZpbGVJY29uVGhlbWUoaXRlbS5pZCwgdW5kZWZpbmVkKSksXG5cdFx0XHRcdGlnbm9yZUZvY3VzTG9zdFxuXHRcdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLnNldEZpbGVJY29uVGhlbWUocGlja2VkVGhlbWUgPyBwaWNrZWRUaGVtZS5pZCA6IGN1cnJlbnRUaGVtZS5pZCwgJ2F1dG8nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zZXRQcm9kdWN0SWNvblRoZW1lJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2V0UHJvZHVjdEljb25UaGVtZScsICdTZXQgUHJvZHVjdCBJY29uIFRoZW1lJyk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gdGhlbWVgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hUaGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24uSUQsIFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24uVElUTEUudmFsdWUsIFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24uRGlzYWJsZWRDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueTxhbnk+KGV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zLCB3b3JrYmVuY2hUaGVtZVNlcnZpY2Uub25EaWRQcm9kdWN0SWNvblRoZW1lQ2hhbmdlKSgoKSA9PiB0aGlzLnVwZGF0ZSgpLCB0aGlzKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lcygpLnRoZW4ocHJvZHVjdEljb25UaGVtZXMgPT4ge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5jb21wdXRlRW5hYmxlbWVudChwcm9kdWN0SWNvblRoZW1lcyk7XG5cdFx0XHR0aGlzLmNsYXNzID0gdGhpcy5lbmFibGVkID8gU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbi5FbmFibGVkQ2xhc3MgOiBTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVFbmFibGVtZW50KHByb2R1Y3RJY29uVGhlbWVzOiBJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZVtdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZSh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUpICYmIHByb2R1Y3RJY29uVGhlbWVzLnNvbWUodGggPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGgsIHRoaXMuZXh0ZW5zaW9uKSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oeyBzaG93Q3VycmVudFRoZW1lLCBpZ25vcmVGb2N1c0xvc3QgfTogeyBzaG93Q3VycmVudFRoZW1lOiBib29sZWFuOyBpZ25vcmVGb2N1c0xvc3Q6IGJvb2xlYW4gfSA9IHsgc2hvd0N1cnJlbnRUaGVtZTogZmFsc2UsIGlnbm9yZUZvY3VzTG9zdDogZmFsc2UgfSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgcHJvZHVjdEljb25UaGVtZXMgPSBhd2FpdCB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lcygpO1xuXHRcdGlmICghdGhpcy5jb21wdXRlRW5hYmxlbWVudChwcm9kdWN0SWNvblRoZW1lcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VGhlbWUgPSB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lKCk7XG5cblx0XHRjb25zdCBkZWxheWVyID0gbmV3IERlbGF5ZXI8YW55PigxMDApO1xuXHRcdGNvbnN0IHBpY2tzID0gZ2V0UXVpY2tQaWNrRW50cmllcyhwcm9kdWN0SWNvblRoZW1lcywgY3VycmVudFRoZW1lLCB0aGlzLmV4dGVuc2lvbiwgc2hvd0N1cnJlbnRUaGVtZSk7XG5cdFx0Y29uc3QgcGlja2VkVGhlbWUgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soXG5cdFx0XHRwaWNrcyxcblx0XHRcdHtcblx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3QgcHJvZHVjdCBpY29uIHRoZW1lJywgXCJTZWxlY3QgUHJvZHVjdCBJY29uIFRoZW1lXCIpLFxuXHRcdFx0XHRvbkRpZEZvY3VzOiBpdGVtID0+IGRlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5zZXRQcm9kdWN0SWNvblRoZW1lKGl0ZW0uaWQsIHVuZGVmaW5lZCkpLFxuXHRcdFx0XHRpZ25vcmVGb2N1c0xvc3Rcblx0XHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5zZXRQcm9kdWN0SWNvblRoZW1lKHBpY2tlZFRoZW1lID8gcGlja2VkVGhlbWUuaWQgOiBjdXJyZW50VGhlbWUuaWQsICdhdXRvJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldExhbmd1YWdlQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNldERpc3BsYXlMYW5ndWFnZSc7XG5cdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNldERpc3BsYXlMYW5ndWFnZScsICdTZXQgRGlzcGxheSBMYW5ndWFnZScpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IGxhbmd1YWdlYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRGlzYWJsZWRDbGFzcyA9IGAke3RoaXMuRW5hYmxlZENsYXNzfSBkaXNhYmxlZGA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFNldExhbmd1YWdlQWN0aW9uLklELCBTZXRMYW5ndWFnZUFjdGlvbi5USVRMRS52YWx1ZSwgU2V0TGFuZ3VhZ2VBY3Rpb24uRGlzYWJsZWRDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFNldExhbmd1YWdlQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2FuU2V0TGFuZ3VhZ2UodGhpcy5leHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5ICYmIGxhbmd1YWdlID09PSBnZXRMb2NhbGUodGhpcy5leHRlbnNpb24uZ2FsbGVyeSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNsYXNzID0gU2V0TGFuZ3VhZ2VBY3Rpb24uRW5hYmxlZENsYXNzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0TGFuZ3VhZ2UodGhpcy5leHRlbnNpb24pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbGVhckxhbmd1YWdlQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNsZWFyTGFuZ3VhZ2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jbGVhckxhbmd1YWdlJywgJ0NsZWFyIERpc3BsYXkgTGFuZ3VhZ2UnKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFbmFibGVkQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBsYW5ndWFnZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gZGlzYWJsZWRgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTG9jYWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvY2FsZVNlcnZpY2U6IElMb2NhbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihDbGVhckxhbmd1YWdlQWN0aW9uLklELCBDbGVhckxhbmd1YWdlQWN0aW9uLlRJVExFLnZhbHVlLCBDbGVhckxhbmd1YWdlQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBDbGVhckxhbmd1YWdlQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2FuU2V0TGFuZ3VhZ2UodGhpcy5leHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5ICYmIGxhbmd1YWdlICE9PSBnZXRMb2NhbGUodGhpcy5leHRlbnNpb24uZ2FsbGVyeSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNsYXNzID0gQ2xlYXJMYW5ndWFnZUFjdGlvbi5FbmFibGVkQ2xhc3M7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb24gJiYgdGhpcy5sb2NhbGVTZXJ2aWNlLmNsZWFyTG9jYWxlUHJlZmVyZW5jZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93UmVjb21tZW5kZWRFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ3Nob3dSZWNvbW1lbmRlZEV4dGVuc2lvbicsIFwiU2hvdyBSZWNvbW1lbmRlZCBFeHRlbnNpb25cIik7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25JZDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dGVuc2lvbklkOiBzdHJpbmcsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLklELCBTaG93UmVjb21tZW5kZWRFeHRlbnNpb25BY3Rpb24uTEFCRUwsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uSWQgPSBleHRlbnNpb25JZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAaWQ6JHt0aGlzLmV4dGVuc2lvbklkfWApO1xuXHRcdGNvbnN0IFtleHRlbnNpb25dID0gYXdhaXQgdGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IHRoaXMuZXh0ZW5zaW9uSWQgfV0sIHsgc291cmNlOiAnaW5zdGFsbC1yZWNvbW1lbmRhdGlvbicgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2luc3RhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbicsIFwiSW5zdGFsbCBSZWNvbW1lbmRlZCBFeHRlbnNpb25cIik7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25JZDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dGVuc2lvbklkOiBzdHJpbmcsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLklELCBJbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb25BY3Rpb24uTEFCRUwsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uSWQgPSBleHRlbnNpb25JZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAaWQ6JHt0aGlzLmV4dGVuc2lvbklkfWApO1xuXHRcdGNvbnN0IFtleHRlbnNpb25dID0gYXdhaXQgdGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IHRoaXMuZXh0ZW5zaW9uSWQgfV0sIHsgc291cmNlOiAnaW5zdGFsbC1yZWNvbW1lbmRhdGlvbicgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0ZW5zaW9uKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRFeHRlbnNpb25JbnN0YWxsRmFpbHVyZUFjdGlvbiwgZXh0ZW5zaW9uLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5sYXRlc3RWZXJzaW9uLCBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsIGVycikucnVuKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJZ25vcmVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuaWdub3JlJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IGlnbm9yZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb24sXG5cdFx0QElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKElnbm9yZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uQWN0aW9uLklELCAnSWdub3JlIFJlY29tbWVuZGF0aW9uJyk7XG5cblx0XHR0aGlzLmNsYXNzID0gSWdub3JlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25BY3Rpb24uQ2xhc3M7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2lnbm9yZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uJywgXCJEbyBub3QgcmVjb21tZW5kIHRoaXMgZXh0ZW5zaW9uIGFnYWluXCIpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNNYW5hZ2VtZW50U2VydmljZS50b2dnbGVHbG9iYWxJZ25vcmVkUmVjb21tZW5kYXRpb24odGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgdHJ1ZSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmRvSWdub3JlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmlnbm9yZSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSB1bmRvLWlnbm9yZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb24sXG5cdFx0QElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFVuZG9JZ25vcmVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbkFjdGlvbi5JRCwgJ1VuZG8nKTtcblxuXHRcdHRoaXMuY2xhc3MgPSBVbmRvSWdub3JlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25BY3Rpb24uQ2xhc3M7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ3VuZG8nLCBcIlVuZG9cIik7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc01hbmFnZW1lbnRTZXJ2aWNlLnRvZ2dsZUdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbih0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBmYWxzZSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdENvbmZpZ3VyZVJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJvdGVjdGVkIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByb3RlY3RlZCBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUpTT05FZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGpzb25FZGl0aW5nU2VydmljZTogSUpTT05FZGl0aW5nU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3BlbkV4dGVuc2lvbnNGaWxlKGV4dGVuc2lvbnNGaWxlUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0T3JDcmVhdGVFeHRlbnNpb25zRmlsZShleHRlbnNpb25zRmlsZVJlc291cmNlKVxuXHRcdFx0LnRoZW4oKHsgY3JlYXRlZCwgY29udGVudCB9KSA9PlxuXHRcdFx0XHR0aGlzLmdldFNlbGVjdGlvblBvc2l0aW9uKGNvbnRlbnQsIGV4dGVuc2lvbnNGaWxlUmVzb3VyY2UsIFsncmVjb21tZW5kYXRpb25zJ10pXG5cdFx0XHRcdFx0LnRoZW4oc2VsZWN0aW9uID0+IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBleHRlbnNpb25zRmlsZVJlc291cmNlLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRwaW5uZWQ6IGNyZWF0ZWQsXG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvblxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0ZXJyb3IgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGxvY2FsaXplKCdPcGVuRXh0ZW5zaW9uc0ZpbGUuZmFpbGVkJywgXCJVbmFibGUgdG8gY3JlYXRlICdleHRlbnNpb25zLmpzb24nIGZpbGUgaW5zaWRlIHRoZSAnLnZzY29kZScgZm9sZGVyICh7MH0pLlwiLCBlcnJvcikpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3BlbldvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlOiBVUkkpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiB0aGlzLmdldE9yVXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUod29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUpXG5cdFx0XHQudGhlbihjb250ZW50ID0+IHRoaXMuZ2V0U2VsZWN0aW9uUG9zaXRpb24oY29udGVudC52YWx1ZS50b1N0cmluZygpLCBjb250ZW50LnJlc291cmNlLCBbJ2V4dGVuc2lvbnMnLCAncmVjb21tZW5kYXRpb25zJ10pKVxuXHRcdFx0LnRoZW4oc2VsZWN0aW9uID0+IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHRcdGZvcmNlUmVsb2FkOiB0cnVlIC8vIGJlY2F1c2UgY29udGVudCBoYXMgY2hhbmdlZFxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE9yVXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUod29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGU6IFVSSSk6IFByb21pc2U8SUZpbGVDb250ZW50PiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKSlcblx0XHRcdC50aGVuKGNvbnRlbnQgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMgPSA8SUV4dGVuc2lvbnNDb25maWdDb250ZW50Pmpzb24ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKVsnZXh0ZW5zaW9ucyddO1xuXHRcdFx0XHRpZiAoIXdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucyB8fCAhd29ya3NwYWNlUmVjb21tZW5kYXRpb25zLnJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZSh3b3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZSwgW3sgcGF0aDogWydleHRlbnNpb25zJ10sIHZhbHVlOiB7IHJlY29tbWVuZGF0aW9uczogW10gfSB9XSwgdHJ1ZSlcblx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUod29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29udGVudDtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3Rpb25Qb3NpdGlvbihjb250ZW50OiBzdHJpbmcsIHJlc291cmNlOiBVUkksIHBhdGg6IGpzb24uSlNPTlBhdGgpOiBQcm9taXNlPElUZXh0RWRpdG9yU2VsZWN0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdHJlZSA9IGpzb24ucGFyc2VUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IG5vZGUgPSBqc29uLmZpbmROb2RlQXRMb2NhdGlvbih0cmVlLCBwYXRoKTtcblx0XHRpZiAobm9kZSAmJiBub2RlLnBhcmVudCAmJiBub2RlLnBhcmVudC5jaGlsZHJlbikge1xuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25zVmFsdWVOb2RlID0gbm9kZS5wYXJlbnQuY2hpbGRyZW5bMV07XG5cdFx0XHRjb25zdCBsYXN0RXh0ZW5zaW9uTm9kZSA9IHJlY29tbWVuZGF0aW9uc1ZhbHVlTm9kZS5jaGlsZHJlbiAmJiByZWNvbW1lbmRhdGlvbnNWYWx1ZU5vZGUuY2hpbGRyZW4ubGVuZ3RoID8gcmVjb21tZW5kYXRpb25zVmFsdWVOb2RlLmNoaWxkcmVuW3JlY29tbWVuZGF0aW9uc1ZhbHVlTm9kZS5jaGlsZHJlbi5sZW5ndGggLSAxXSA6IG51bGw7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSBsYXN0RXh0ZW5zaW9uTm9kZSA/IGxhc3RFeHRlbnNpb25Ob2RlLm9mZnNldCArIGxhc3RFeHRlbnNpb25Ob2RlLmxlbmd0aCA6IHJlY29tbWVuZGF0aW9uc1ZhbHVlTm9kZS5vZmZzZXQgKyAxO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnRleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSkpXG5cdFx0XHRcdC50aGVuKHJlZmVyZW5jZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0XHRcdFx0cmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IHBvc2l0aW9uLmNvbHVtbixcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHBvc2l0aW9uLmNvbHVtbixcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPckNyZWF0ZUV4dGVuc2lvbnNGaWxlKGV4dGVuc2lvbnNGaWxlUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8eyBjcmVhdGVkOiBib29sZWFuOyBleHRlbnNpb25zRmlsZVJlc291cmNlOiBVUkk7IGNvbnRlbnQ6IHN0cmluZyB9PiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGV4dGVuc2lvbnNGaWxlUmVzb3VyY2UpKS50aGVuKGNvbnRlbnQgPT4ge1xuXHRcdFx0cmV0dXJuIHsgY3JlYXRlZDogZmFsc2UsIGV4dGVuc2lvbnNGaWxlUmVzb3VyY2UsIGNvbnRlbnQ6IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSB9O1xuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0RmlsZVNlcnZpY2Uud3JpdGUoZXh0ZW5zaW9uc0ZpbGVSZXNvdXJjZSwgRXh0ZW5zaW9uc0NvbmZpZ3VyYXRpb25Jbml0aWFsQ29udGVudCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IGNyZWF0ZWQ6IHRydWUsIGV4dGVuc2lvbnNGaWxlUmVzb3VyY2UsIGNvbnRlbnQ6IEV4dGVuc2lvbnNDb25maWd1cmF0aW9uSW5pdGlhbENvbnRlbnQgfTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdENvbmZpZ3VyZVJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jb25maWd1cmVXb3Jrc3BhY2VSZWNvbW1lbmRlZEV4dGVuc2lvbnMnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnY29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zJywgXCJDb25maWd1cmUgUmVjb21tZW5kZWQgRXh0ZW5zaW9ucyAoV29ya3NwYWNlKVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSlNPTkVkaXRpbmdTZXJ2aWNlIGpzb25FZGl0aW5nU2VydmljZTogSUpTT05FZGl0aW5nU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIGNvbnRleHRTZXJ2aWNlLCBmaWxlU2VydmljZSwgdGV4dEZpbGVTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBqc29uRWRpdGluZ1NlcnZpY2UsIHRleHRNb2RlbFJlc29sdmVyU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMudXBkYXRlKCksIHRoaXMpKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c3dpdGNoICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRk9MREVSOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVuRXh0ZW5zaW9uc0ZpbGUodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdLnRvUmVzb3VyY2UoRVhURU5TSU9OU19DT05GSUcpKTtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVuV29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uISk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDb25maWd1cmVSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29uZmlndXJlV29ya3NwYWNlRm9sZGVyUmVjb21tZW5kZWRFeHRlbnNpb25zJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NvbmZpZ3VyZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGVkRXh0ZW5zaW9ucycsIFwiQ29uZmlndXJlIFJlY29tbWVuZGVkIEV4dGVuc2lvbnMgKFdvcmtzcGFjZSBGb2xkZXIpXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UganNvbkVkaXRpbmdTZXJ2aWNlOiBJSlNPTkVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgY29udGV4dFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB0ZXh0RmlsZVNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGpzb25FZGl0aW5nU2VydmljZSwgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBmb2xkZXJDb3VudCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGg7XG5cdFx0Y29uc3QgcGlja0ZvbGRlclByb21pc2UgPSBmb2xkZXJDb3VudCA9PT0gMSA/IFByb21pc2UucmVzb2x2ZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0pIDogdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxJV29ya3NwYWNlRm9sZGVyPihQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShwaWNrRm9sZGVyUHJvbWlzZSlcblx0XHRcdC50aGVuKHdvcmtzcGFjZUZvbGRlciA9PiB7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVuRXh0ZW5zaW9uc0ZpbGUod29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UoRVhURU5TSU9OU19DT05GSUcpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25TdGF0dXNMYWJlbEFjdGlvbiBleHRlbmRzIEFjdGlvbiBpbXBsZW1lbnRzIElFeHRlbnNpb25Db250YWluZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVOQUJMRURfQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uVEVYVF9BQ1RJT05fQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtbGFiZWxgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBESVNBQkxFRF9DTEFTUyA9IGAke3RoaXMuRU5BQkxFRF9DTEFTU30gaGlkZWA7XG5cblx0cHJpdmF0ZSBpbml0aWFsU3RhdHVzOiBFeHRlbnNpb25TdGF0ZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHN0YXR1czogRXh0ZW5zaW9uU3RhdGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB2ZXJzaW9uOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgX2V4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwgPSBudWxsO1xuXHRnZXQgZXh0ZW5zaW9uKCk6IElFeHRlbnNpb24gfCBudWxsIHsgcmV0dXJuIHRoaXMuX2V4dGVuc2lvbjsgfVxuXHRzZXQgZXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwpIHtcblx0XHRpZiAoISh0aGlzLl9leHRlbnNpb24gJiYgZXh0ZW5zaW9uICYmIGFyZVNhbWVFeHRlbnNpb25zKHRoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHQvLyBEaWZmZXJlbnQgZXh0ZW5zaW9uLiBSZXNldFxuXHRcdFx0dGhpcy5pbml0aWFsU3RhdHVzID0gbnVsbDtcblx0XHRcdHRoaXMuc3RhdHVzID0gbnVsbDtcblx0XHRcdHRoaXMuZW5hYmxlbWVudFN0YXRlID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5hY3Rpb24uc3RhdHVzTGFiZWwnLCAnJywgRXh0ZW5zaW9uU3RhdHVzTGFiZWxBY3Rpb24uRElTQUJMRURfQ0xBU1MsIGZhbHNlKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuY29tcHV0ZUxhYmVsKCk7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsIHx8ICcnO1xuXHRcdHRoaXMuY2xhc3MgPSBsYWJlbCA/IEV4dGVuc2lvblN0YXR1c0xhYmVsQWN0aW9uLkVOQUJMRURfQ0xBU1MgOiBFeHRlbnNpb25TdGF0dXNMYWJlbEFjdGlvbi5ESVNBQkxFRF9DTEFTUztcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUxhYmVsKCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRTdGF0dXMgPSB0aGlzLnN0YXR1cztcblx0XHRjb25zdCBjdXJyZW50VmVyc2lvbiA9IHRoaXMudmVyc2lvbjtcblx0XHRjb25zdCBjdXJyZW50RW5hYmxlbWVudFN0YXRlID0gdGhpcy5lbmFibGVtZW50U3RhdGU7XG5cdFx0dGhpcy5zdGF0dXMgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZTtcblx0XHR0aGlzLnZlcnNpb24gPSB0aGlzLmV4dGVuc2lvbi52ZXJzaW9uO1xuXHRcdGlmICh0aGlzLmluaXRpYWxTdGF0dXMgPT09IG51bGwpIHtcblx0XHRcdHRoaXMuaW5pdGlhbFN0YXR1cyA9IHRoaXMuc3RhdHVzO1xuXHRcdH1cblx0XHR0aGlzLmVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZTtcblxuXHRcdGNvbnN0IGNhbkFkZEV4dGVuc2lvbiA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHJ1bm5pbmdFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IGUudXVpZCB9LCB0aGlzLmV4dGVuc2lvbiEuaWRlbnRpZmllcikpWzBdO1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uIS5sb2NhbCkge1xuXHRcdFx0XHRpZiAocnVubmluZ0V4dGVuc2lvbiAmJiB0aGlzLmV4dGVuc2lvbiEudmVyc2lvbiA9PT0gcnVubmluZ0V4dGVuc2lvbi52ZXJzaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5BZGRFeHRlbnNpb24odG9FeHRlbnNpb25EZXNjcmlwdGlvbih0aGlzLmV4dGVuc2lvbiEubG9jYWwpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXHRcdGNvbnN0IGNhblJlbW92ZUV4dGVuc2lvbiA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbiEubG9jYWwpIHtcblx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmV2ZXJ5KGUgPT4gIShhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IGUudXVpZCB9LCB0aGlzLmV4dGVuc2lvbiEuaWRlbnRpZmllcikgJiYgdGhpcy5leHRlbnNpb24hLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKGUpKSkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5jYW5SZW1vdmVFeHRlbnNpb24odG9FeHRlbnNpb25EZXNjcmlwdGlvbih0aGlzLmV4dGVuc2lvbiEubG9jYWwpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0aWYgKGN1cnJlbnRTdGF0dXMgIT09IG51bGwpIHtcblx0XHRcdGlmIChjdXJyZW50U3RhdHVzID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nICYmIHRoaXMuc3RhdHVzID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuaW5pdGlhbFN0YXR1cyA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQgJiYgY2FuQWRkRXh0ZW5zaW9uKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2luc3RhbGxlZCcsIFwiSW5zdGFsbGVkXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmluaXRpYWxTdGF0dXMgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCAmJiB0aGlzLnZlcnNpb24gIT09IGN1cnJlbnRWZXJzaW9uICYmIGNhbkFkZEV4dGVuc2lvbigpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd1cGRhdGVkJywgXCJVcGRhdGVkXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRTdGF0dXMgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZyAmJiB0aGlzLnN0YXR1cyA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdFx0dGhpcy5pbml0aWFsU3RhdHVzID0gdGhpcy5zdGF0dXM7XG5cdFx0XHRcdHJldHVybiBjYW5SZW1vdmVFeHRlbnNpb24oKSA/IGxvY2FsaXplKCd1bmluc3RhbGxlZCcsIFwiVW5pbnN0YWxsZWRcIikgOiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50RW5hYmxlbWVudFN0YXRlICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50bHlFbmFibGVkID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoY3VycmVudEVuYWJsZW1lbnRTdGF0ZSk7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUodGhpcy5lbmFibGVtZW50U3RhdGUpO1xuXHRcdFx0aWYgKCFjdXJyZW50bHlFbmFibGVkICYmIGVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhbkFkZEV4dGVuc2lvbigpID8gbG9jYWxpemUoJ2VuYWJsZWQnLCBcIkVuYWJsZWRcIikgOiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRseUVuYWJsZWQgJiYgIWVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhblJlbW92ZUV4dGVuc2lvbigpID8gbG9jYWxpemUoJ2Rpc2FibGVkJywgXCJEaXNhYmxlZFwiKSA6IG51bGw7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVTeW5jRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgRHJvcERvd25FeHRlbnNpb25BY3Rpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElHTk9SRURfU1lOQ19DTEFTUyA9IGAke0V4dGVuc2lvbkFjdGlvbi5JQ09OX0FDVElPTl9DTEFTU30gZXh0ZW5zaW9uLXN5bmMgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoc3luY0lnbm9yZWRJY29uKX1gO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTWU5DX0NMQVNTID0gYCR7dGhpcy5JQ09OX0FDVElPTl9DTEFTU30gZXh0ZW5zaW9uLXN5bmMgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoc3luY0VuYWJsZWRJY29uKX1gO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuc3luYycsICcnLCBUb2dnbGVTeW5jRXh0ZW5zaW9uQWN0aW9uLlNZTkNfQ0xBU1MsIGZhbHNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NldHRpbmdzU3luYy5pZ25vcmVkRXh0ZW5zaW9ucycpKSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50KCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9ICEhdGhpcy5leHRlbnNpb24gJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0Y29uc3QgaXNJZ25vcmVkID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0V4dGVuc2lvbklnbm9yZWRUb1N5bmModGhpcy5leHRlbnNpb24pO1xuXHRcdFx0dGhpcy5jbGFzcyA9IGlzSWdub3JlZCA/IFRvZ2dsZVN5bmNFeHRlbnNpb25BY3Rpb24uSUdOT1JFRF9TWU5DX0NMQVNTIDogVG9nZ2xlU3luY0V4dGVuc2lvbkFjdGlvbi5TWU5DX0NMQVNTO1xuXHRcdFx0dGhpcy50b29sdGlwID0gaXNJZ25vcmVkID8gbG9jYWxpemUoJ2lnbm9yZWQnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGlnbm9yZWQgZHVyaW5nIHN5bmNcIikgOiBsb2NhbGl6ZSgnc3luY2VkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBzeW5jZWRcIik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHN1cGVyLnJ1bihbXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J2V4dGVuc2lvbnMuc3luY2lnbm9yZScsXG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0V4dGVuc2lvbklnbm9yZWRUb1N5bmModGhpcy5leHRlbnNpb24hKSA/IGxvY2FsaXplKCdzeW5jJywgXCJTeW5jIHRoaXMgZXh0ZW5zaW9uXCIpIDogbG9jYWxpemUoJ2RvIG5vdCBzeW5jJywgXCJEbyBub3Qgc3luYyB0aGlzIGV4dGVuc2lvblwiKVxuXHRcdFx0XHRcdCwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnRvZ2dsZUV4dGVuc2lvbklnbm9yZWRUb1N5bmModGhpcy5leHRlbnNpb24hKSlcblx0XHRcdF1cblx0XHRdKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBFeHRlbnNpb25TdGF0dXMgPSB7IHJlYWRvbmx5IG1lc3NhZ2U6IElNYXJrZG93blN0cmluZzsgcmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbiB9O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uU3RhdHVzQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke0V4dGVuc2lvbkFjdGlvbi5JQ09OX0FDVElPTl9DTEFTU30gZXh0ZW5zaW9uLXN0YXR1c2A7XG5cblx0dXBkYXRlV2hlbkNvdW50ZXJFeHRlbnNpb25DaGFuZ2VzOiBib29sZWFuID0gdHJ1ZTtcblxuXHRwcml2YXRlIF9zdGF0dXM6IEV4dGVuc2lvblN0YXR1c1tdID0gW107XG5cdGdldCBzdGF0dXMoKTogRXh0ZW5zaW9uU3RhdHVzW10geyByZXR1cm4gdGhpcy5fc3RhdHVzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuc3RhdHVzJywgJycsIGAke0V4dGVuc2lvblN0YXR1c0FjdGlvbi5DTEFTU30gaGlkZWAsIGZhbHNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoKCkgPT4gdGhpcy51cGRhdGUoKSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZUFjY2Vzc0RhdGEoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWUoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXkpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWNvbXB1dGVTdGF0dXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbXB1dGVzIHRoZSBzdGF0dXMgYW5kIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGVcblx0ICogY29tcHV0YXRpb24gaXMgZG9uZS4gVXNlIHRoaXMgd2hlbiBjYWxsZXJzIG5lZWQgdG8gYXdhaXQgdGltZS1zZW5zaXRpdmVcblx0ICogc3RhdHVzIGNvbnRlbnQgKGUuZy4gdGhlIGRlbGF5ZWQgYXV0by11cGRhdGUgbWVzc2FnZSkgYmVmb3JlIHJlYWRpbmcgaXQuXG5cdCAqL1xuXHRyZWNvbXB1dGVTdGF0dXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlVGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMuY29tcHV0ZUFuZFVwZGF0ZVN0YXR1cygpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZUFuZFVwZGF0ZVN0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh1bmRlZmluZWQsIHRydWUpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5pc01hbGljaW91cykge1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdtYWxpY2lvdXMgdG9vbHRpcCcsIFwiVGhpcyBleHRlbnNpb24gd2FzIHJlcG9ydGVkIHRvIGJlIHByb2JsZW1hdGljLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxlZCAmJiB0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5ICYmICF0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5LmlzU2lnbmVkICYmIHNob3VsZFJlcXVpcmVSZXBvc2l0b3J5U2lnbmF0dXJlRm9yKHRoaXMuZXh0ZW5zaW9uLnByaXZhdGUsIGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QoKSkpIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnbm90IHNpZ25lZCB0b29sdGlwJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBub3Qgc2lnbmVkIGJ5IHRoZSBFeHRlbnNpb24gTWFya2V0cGxhY2UuXCIpKSB9LCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvKSB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbikge1xuXHRcdFx0XHRjb25zdCBsaW5rID0gYFske3RoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uZGlzcGxheU5hbWV9XSgke2NyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbi5pZCl9KWA7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGVwcmVjYXRlZCB3aXRoIGFsdGVybmF0ZSBleHRlbnNpb24gdG9vbHRpcCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSB7MH0gZXh0ZW5zaW9uIGluc3RlYWQuXCIsIGxpbmspKSB9LCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLnNldHRpbmdzKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBgWyR7bG9jYWxpemUoJ3NldHRpbmdzJywgXCJzZXR0aW5nc1wiKX1dKCR7Y3JlYXRlQ29tbWFuZFVyaSgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCB0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uc2V0dGluZ3MubWFwKHNldHRpbmcgPT4gYEBpZDoke3NldHRpbmd9YCkuam9pbignICcpKX19KWA7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGVwcmVjYXRlZCB3aXRoIGFsdGVybmF0ZSBzZXR0aW5ncyB0b29sdGlwJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkZXByZWNhdGVkIGFzIHRoaXMgZnVuY3Rpb25hbGl0eSBpcyBub3cgYnVpbHQtaW4gdG8gVlMgQ29kZS4gQ29uZmlndXJlIHRoZXNlIHswfSB0byB1c2UgdGhpcyBmdW5jdGlvbmFsaXR5LlwiLCBsaW5rKSkgfSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkZXByZWNhdGVkIHRvb2x0aXAnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRlcHJlY2F0ZWQgYXMgaXQgaXMgbm8gbG9uZ2VyIGJlaW5nIG1haW50YWluZWQuXCIpKTtcblx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5hZGRpdGlvbmFsSW5mbykge1xuXHRcdFx0XHRcdG1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYCAke3RoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5hZGRpdGlvbmFsSW5mb31gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlIH0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5taXNzaW5nRnJvbUdhbGxlcnkpIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnbWlzc2luZyBmcm9tIGdhbGxlcnkgdG9vbHRpcCcsIFwiVGhpcyBleHRlbnNpb24gaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZSBvbiB0aGUgRXh0ZW5zaW9uIE1hcmtldHBsYWNlLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2FuU2V0TGFuZ3VhZ2UodGhpcy5leHRlbnNpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLm91dGRhdGVkKSB7XG5cdFx0XHRsZXQgaGFzQ29uc2VudFdhcm5pbmcgPSBmYWxzZTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNob3VsZFJlcXVpcmVDb25zZW50VG9VcGRhdGUodGhpcy5leHRlbnNpb24pO1xuXHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0aGFzQ29uc2VudFdhcm5pbmcgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHttZXNzYWdlfSBgKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2F1dG8gdXBkYXRlIG1lc3NhZ2UnLCBcIlBsZWFzZSBbcmV2aWV3IHRoZSBleHRlbnNpb25dKHswfSkgYW5kIHVwZGF0ZSBpdCBtYW51YWxseS5cIixcblx0XHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uLmhhc0NoYW5nZWxvZygpXG5cdFx0XHRcdFx0XHRcdD8gY3JlYXRlQ29tbWFuZFVyaSgnZXh0ZW5zaW9uLm9wZW4nLCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBFeHRlbnNpb25FZGl0b3JUYWIuQ2hhbmdlbG9nKS50b1N0cmluZygpXG5cdFx0XHRcdFx0XHRcdDogdGhpcy5leHRlbnNpb24ucmVwb3NpdG9yeVxuXHRcdFx0XHRcdFx0XHRcdD8gdGhpcy5leHRlbnNpb24ucmVwb3NpdG9yeVxuXHRcdFx0XHRcdFx0XHRcdDogY3JlYXRlQ29tbWFuZFVyaSgnZXh0ZW5zaW9uLm9wZW4nLCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKS50b1N0cmluZygpXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG1hcmtkb3duIH0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNBdXRvVXBkYXRlRGVsYXllZCh0aGlzLmV4dGVuc2lvbikpIHtcblx0XHRcdFx0Y29uc3QgZGVsYXkgPSBmcm9tTm93KERhdGUubm93KCkgLSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEF1dG9VcGRhdGVEZWxheSgpLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZUF0ID0gZnJvbU5vdyhEYXRlLm5vdygpICsgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRBdXRvVXBkYXRlRGVsYXlSZW1haW5pbmcodGhpcy5leHRlbnNpb24pLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdC8vIERvIG5vdCBvdmVycmlkZSB0aGUgaGlnaGVyLXByaW9yaXR5IHdhcm5pbmcgY2xhc3Mgd2l0aCB0aGUgaW5mbyBjbGFzcy5cblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiBpbmZvSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvVXBkYXRlRGVsYXllZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgbm90IHVwZGF0ZWQgeWV0IGJlY2F1c2UgbmV3IHZlcnNpb25zIGFyZSBhdXRvIHVwZGF0ZWQgezB9IGFmdGVyIHRoZXkgYXJlIHB1Ymxpc2hlZC4gSXQgd2lsbCBiZSBhdXRvIHVwZGF0ZWQgezF9LlwiLCBkZWxheSwgdXBkYXRlQXQpKSB9LCAhaGFzQ29uc2VudFdhcm5pbmcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5ICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxlZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRcdGlmIChyZXN1bHQgIT09IHRydWUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogcmVzdWx0IH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5sb2NhbCB8fFxuXHRcdFx0IXRoaXMuZXh0ZW5zaW9uLnNlcnZlciB8fFxuXHRcdFx0dGhpcy5leHRlbnNpb24uc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuc2lvbiBpcyBkaXNhYmxlZCBieSBhbGxvd2VkIGxpc3Rcblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUFsbG93bGlzdCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHRoaXMuZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRcdGlmIChyZXN1bHQgIT09IHRydWUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkaXNhYmxlZCAtIG5vdCBhbGxvd2VkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBiZWNhdXNlIHswfVwiLCByZXN1bHQudmFsdWUpKSB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEV4dGVuc2lvbiBpcyBkaXNhYmxlZCBieSBlbnZpcm9ubWVudFxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkaXNhYmxlZCBieSBlbnZpcm9ubWVudCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgdGhlIGVudmlyb25tZW50LlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5zaW9uIGlzIGVuYWJsZWQgYnkgZW52aXJvbm1lbnRcblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEJ5RW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdlbmFibGVkIGJ5IGVudmlyb25tZW50JywgXCJUaGlzIGV4dGVuc2lvbiBpcyBlbmFibGVkIGJlY2F1c2UgaXQgaXMgcmVxdWlyZWQgaW4gdGhlIGN1cnJlbnQgZW52aXJvbm1lbnQuXCIpKSB9LCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgdmlydHVhbCB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVZpcnR1YWxXb3Jrc3BhY2UpIHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBnZXRXb3Jrc3BhY2VTdXBwb3J0VHlwZU1lc3NhZ2UodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY2FwYWJpbGl0aWVzPy52aXJ0dWFsV29ya3NwYWNlcyk7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IGluZm9JY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoZGV0YWlscyA/IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGRldGFpbHMpIDogbG9jYWxpemUoJ2Rpc2FibGVkIGJlY2F1c2Ugb2YgdmlydHVhbCB3b3Jrc3BhY2UnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhcyBiZWVuIGRpc2FibGVkIGJlY2F1c2UgaXQgZG9lcyBub3Qgc3VwcG9ydCB2aXJ0dWFsIHdvcmtzcGFjZXMuXCIpKSB9LCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMaW1pdGVkIHN1cHBvcnQgaW4gVmlydHVhbCBXb3Jrc3BhY2Vcblx0XHRpZiAoaXNWaXJ0dWFsV29ya3NwYWNlKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpKSB7XG5cdFx0XHRjb25zdCB2aXJ0dWFsU3VwcG9ydFR5cGUgPSB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KTtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBnZXRXb3Jrc3BhY2VTdXBwb3J0VHlwZU1lc3NhZ2UodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY2FwYWJpbGl0aWVzPy52aXJ0dWFsV29ya3NwYWNlcyk7XG5cdFx0XHRpZiAodmlydHVhbFN1cHBvcnRUeXBlID09PSAnbGltaXRlZCcgfHwgZGV0YWlscykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoZGV0YWlscyA/IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGRldGFpbHMpIDogbG9jYWxpemUoJ2V4dGVuc2lvbiBsaW1pdGVkIGJlY2F1c2Ugb2YgdmlydHVhbCB3b3Jrc3BhY2UnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhcyBsaW1pdGVkIGZlYXR1cmVzIGJlY2F1c2UgdGhlIGN1cnJlbnQgd29ya3NwYWNlIGlzIHZpcnR1YWwuXCIpKSB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVuaWZpY2F0aW9uXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlVbmlmaWNhdGlvbikge1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiBpbmZvSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdleHRlbnNpb24gZGlzYWJsZWQgYmVjYXVzZSBvZiB1bmlmaWNhdGlvbicsIFwiQWxsIEdpdEh1YiBDb3BpbG90IGZ1bmN0aW9uYWxpdHkgaXMgbm93IGJlaW5nIHNlcnZlZCBmcm9tIHRoZSBHaXRIdWIgQ29waWxvdCBDaGF0IGV4dGVuc2lvbi4gVG8gdGVtcG9yYXJpbHkgb3B0IG91dCBvZiB0aGlzIGV4dGVuc2lvbiB1bmlmaWNhdGlvbiwgdG9nZ2xlIHRoZSB7MH0gc2V0dGluZy5cIiwgJ2BjaGF0LmV4dGVuc2lvblVuaWZpY2F0aW9uLmVuYWJsZWRgJykpIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkgJiZcblx0XHRcdC8vIEV4dGVuc2lvbiBpcyBkaXNhYmxlZCBieSB1bnRydXN0ZWQgd29ya3NwYWNlXG5cdFx0XHQodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnQgfHxcblx0XHRcdFx0Ly8gQWxsIGRpc2FibGVkIGRlcGVuZGVuY2llcyBvZiB0aGUgZXh0ZW5zaW9uIGFyZSBkaXNhYmxlZCBieSB1bnRydXN0ZWQgd29ya3NwYWNlXG5cdFx0XHRcdCh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uRGVwZW5kZW5jeSAmJiB0aGlzLndvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERlcGVuZGVuY2llc0VuYWJsZW1lbnRTdGF0ZXModGhpcy5leHRlbnNpb24ubG9jYWwpLmV2ZXJ5KChbLCBlbmFibGVtZW50U3RhdGVdKSA9PiB0aGlzLndvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZShlbmFibGVtZW50U3RhdGUpIHx8IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50KSkpKSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgdW50cnVzdGVkRGV0YWlscyA9IGdldFdvcmtzcGFjZVN1cHBvcnRUeXBlTWVzc2FnZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5jYXBhYmlsaXRpZXM/LnVudHJ1c3RlZFdvcmtzcGFjZXMpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB0cnVzdEljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyh1bnRydXN0ZWREZXRhaWxzID8gZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnModW50cnVzdGVkRGV0YWlscykgOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uIGRpc2FibGVkIGJlY2F1c2Ugb2YgdHJ1c3QgcmVxdWlyZW1lbnQnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhcyBiZWVuIGRpc2FibGVkIGJlY2F1c2UgdGhlIGN1cnJlbnQgd29ya3NwYWNlIGlzIG5vdCB0cnVzdGVkLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTGltaXRlZCBzdXBwb3J0IGluIFVudHJ1c3RlZCBXb3Jrc3BhY2Vcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCkgJiYgIXRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRjb25zdCB1bnRydXN0ZWRTdXBwb3J0VHlwZSA9IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCk7XG5cdFx0XHRjb25zdCB1bnRydXN0ZWREZXRhaWxzID0gZ2V0V29ya3NwYWNlU3VwcG9ydFR5cGVNZXNzYWdlKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNhcGFiaWxpdGllcz8udW50cnVzdGVkV29ya3NwYWNlcyk7XG5cdFx0XHRpZiAodW50cnVzdGVkU3VwcG9ydFR5cGUgPT09ICdsaW1pdGVkJyB8fCB1bnRydXN0ZWREZXRhaWxzKSB7XG5cdFx0XHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogdHJ1c3RJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcodW50cnVzdGVkRGV0YWlscyA/IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHVudHJ1c3RlZERldGFpbHMpIDogbG9jYWxpemUoJ2V4dGVuc2lvbiBsaW1pdGVkIGJlY2F1c2Ugb2YgdHJ1c3QgcmVxdWlyZW1lbnQnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhcyBsaW1pdGVkIGZlYXR1cmVzIGJlY2F1c2UgdGhlIGN1cnJlbnQgd29ya3NwYWNlIGlzIG5vdCB0cnVzdGVkLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFeHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgZXh0ZW5zaW9uIGtpbmRcblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQpIHtcblx0XHRcdGlmICghdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsZWQuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpICYmIGUuc2VydmVyICE9PSB0aGlzLmV4dGVuc2lvbiEuc2VydmVyKSkge1xuXHRcdFx0XHRsZXQgbWVzc2FnZTtcblx0XHRcdFx0Ly8gRXh0ZW5zaW9uIG9uIExvY2FsIFNlcnZlclxuXHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uLnNlcnZlcikge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPbldvcmtzcGFjZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnSW5zdGFsbCBpbiByZW1vdGUgc2VydmVyIHRvIGVuYWJsZScsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgaW4gdGhpcyB3b3Jrc3BhY2UgYmVjYXVzZSBpdCBpcyBkZWZpbmVkIHRvIHJ1biBpbiB0aGUgUmVtb3RlIEV4dGVuc2lvbiBIb3N0LiBQbGVhc2UgaW5zdGFsbCB0aGUgZXh0ZW5zaW9uIGluICd7MH0nIHRvIGVuYWJsZS5cIiwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmxhYmVsKX0gWyR7bG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIil9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3JlbW90ZS1leHRlbnNpb25zI2FyY2hpdGVjdHVyZS1hbmQtZXh0ZW5zaW9uLWtpbmRzKWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBFeHRlbnNpb24gb24gUmVtb3RlIFNlcnZlclxuXHRcdFx0XHRlbHNlIGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uLnNlcnZlcikge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPblVJKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ0luc3RhbGwgaW4gbG9jYWwgc2VydmVyIHRvIGVuYWJsZScsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgaW4gdGhpcyB3b3Jrc3BhY2UgYmVjYXVzZSBpdCBpcyBkZWZpbmVkIHRvIHJ1biBpbiB0aGUgTG9jYWwgRXh0ZW5zaW9uIEhvc3QuIFBsZWFzZSBpbnN0YWxsIHRoZSBleHRlbnNpb24gbG9jYWxseSB0byBlbmFibGUuXCIsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5sYWJlbCl9IFske2xvY2FsaXplKCdsZWFybiBtb3JlJywgXCJMZWFybiBNb3JlXCIpfV0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vYXBpL2FkdmFuY2VkLXRvcGljcy9yZW1vdGUtZXh0ZW5zaW9ucyNhcmNoaXRlY3R1cmUtYW5kLWV4dGVuc2lvbi1raW5kcylgKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNXZWIpIHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnRGVmaW5lZCB0byBydW4gaW4gZGVza3RvcCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgYmVjYXVzZSBpdCBpcyBkZWZpbmVkIHRvIHJ1biBvbmx5IGluIHswfSBmb3IgdGhlIERlc2t0b3AuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpfSBbJHtsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjYXJjaGl0ZWN0dXJlLWFuZC1leHRlbnNpb24ta2luZHMpYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEV4dGVuc2lvbiBvbiBXZWIgU2VydmVyXG5cdFx0XHRcdGVsc2UgaWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciA9PT0gdGhpcy5leHRlbnNpb24uc2VydmVyKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnQ2Fubm90IGJlIGVuYWJsZWQnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJlY2F1c2UgaXQgaXMgbm90IHN1cHBvcnRlZCBpbiB7MH0gZm9yIHRoZSBXZWIuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpfSBbJHtsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjYXJjaGl0ZWN0dXJlLWFuZC1leHRlbnNpb24ta2luZHMpYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdGNvbnN0IGZlYXR1cmVzID0gUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkuZ2V0RXh0ZW5zaW9uRmVhdHVyZXMoKTtcblx0XHRmb3IgKGNvbnN0IGZlYXR1cmUgb2YgZmVhdHVyZXMpIHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5nZXRBY2Nlc3NEYXRhKGV4dGVuc2lvbklkLCBmZWF0dXJlLmlkKT8uY3VycmVudD8uc3RhdHVzO1xuXHRcdFx0Y29uc3QgbWFuYWdlQWNjZXNzTGluayA9IGBbJHtsb2NhbGl6ZSgnbWFuYWdlIGFjY2VzcycsICdNYW5hZ2UgQWNjZXNzJyl9XSgke2NyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgRXh0ZW5zaW9uRWRpdG9yVGFiLkZlYXR1cmVzLCBmYWxzZSwgZmVhdHVyZS5pZCl9KWA7XG5cdFx0XHRpZiAoc3RhdHVzPy5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiBlcnJvckljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoc3RhdHVzLm1lc3NhZ2UpLmFwcGVuZE1hcmtkb3duKGAgJHttYW5hZ2VBY2Nlc3NMaW5rfWApIH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdHVzPy5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuV2FybmluZykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHN0YXR1cy5tZXNzYWdlKS5hcHBlbmRNYXJrZG93bihgICR7bWFuYWdlQWNjZXNzTGlua31gKSB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW90ZSBXb3Jrc3BhY2Vcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRpZiAoaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24odGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsZWQuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpICYmIGUuc2VydmVyICE9PSB0aGlzLmV4dGVuc2lvbiEuc2VydmVyKSkge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyXG5cdFx0XHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnSW5zdGFsbCBsYW5ndWFnZSBwYWNrIGFsc28gaW4gcmVtb3RlIHNlcnZlcicsIFwiSW5zdGFsbCB0aGUgbGFuZ3VhZ2UgcGFjayBleHRlbnNpb24gb24gJ3swfScgdG8gZW5hYmxlIGl0IHRoZXJlIGFsc28uXCIsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5sYWJlbCkpXG5cdFx0XHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnSW5zdGFsbCBsYW5ndWFnZSBwYWNrIGFsc28gbG9jYWxseScsIFwiSW5zdGFsbCB0aGUgbGFuZ3VhZ2UgcGFjayBleHRlbnNpb24gbG9jYWxseSB0byBlbmFibGUgaXQgdGhlcmUgYWxzby5cIikpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogaW5mb0ljb24sIG1lc3NhZ2UgfSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZS5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBlLnV1aWQgfSwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpKVswXTtcblx0XHRcdGNvbnN0IHJ1bm5pbmdFeHRlbnNpb25TZXJ2ZXIgPSBydW5uaW5nRXh0ZW5zaW9uID8gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKHRvRXh0ZW5zaW9uKHJ1bm5pbmdFeHRlbnNpb24pKSA6IG51bGw7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiBydW5uaW5nRXh0ZW5zaW9uU2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uV29ya3NwYWNlKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogaW5mb0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnZW5hYmxlZCByZW1vdGVseScsIFwiVGhpcyBleHRlbnNpb24gaXMgZW5hYmxlZCBpbiB0aGUgUmVtb3RlIEV4dGVuc2lvbiBIb3N0IGJlY2F1c2UgaXQgcHJlZmVycyB0byBydW4gdGhlcmUuXCIpfSBbJHtsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjYXJjaGl0ZWN0dXJlLWFuZC1leHRlbnNpb24ta2luZHMpYCkgfSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgcnVubmluZ0V4dGVuc2lvblNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uVUkodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiBpbmZvSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGAke2xvY2FsaXplKCdlbmFibGVkIGxvY2FsbHknLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGVuYWJsZWQgaW4gdGhlIExvY2FsIEV4dGVuc2lvbiBIb3N0IGJlY2F1c2UgaXQgcHJlZmVycyB0byBydW4gdGhlcmUuXCIpfSBbJHtsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjYXJjaGl0ZWN0dXJlLWFuZC1leHRlbnNpb24ta2luZHMpYCkgfSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgcnVubmluZ0V4dGVuc2lvblNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuY2FuRXhlY3V0ZU9uV2ViKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogaW5mb0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnZW5hYmxlZCBpbiB3ZWIgd29ya2VyJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBlbmFibGVkIGluIHRoZSBXZWIgV29ya2VyIEV4dGVuc2lvbiBIb3N0IGJlY2F1c2UgaXQgcHJlZmVycyB0byBydW4gdGhlcmUuXCIpfSBbJHtsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjYXJjaGl0ZWN0dXJlLWFuZC1leHRlbnNpb24ta2luZHMpYCkgfSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEV4dGVuc2lvbiBpcyBkaXNhYmxlZCBieSBpdHMgZGVwZW5kZW5jeVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uRGVwZW5kZW5jeSkge1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoe1xuXHRcdFx0XHRpY29uOiB3YXJuaW5nSWNvbixcblx0XHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdleHRlbnNpb24gZGlzYWJsZWQgYmVjYXVzZSBvZiBkZXBlbmRlbmN5JywgXCJUaGlzIGV4dGVuc2lvbiBkZXBlbmRzIG9uIGFuIGV4dGVuc2lvbiB0aGF0IGlzIGRpc2FibGVkLlwiKSlcblx0XHRcdFx0XHQuYXBwZW5kTWFya2Rvd24oYCZuYnNwO1ske2xvY2FsaXplKCdkZXBlbmRlbmNpZXMnLCBcIlNob3cgRGVwZW5kZW5jaWVzXCIpfV0oJHtjcmVhdGVDb21tYW5kVXJpKCdleHRlbnNpb24ub3BlbicsIHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIEV4dGVuc2lvbkVkaXRvclRhYi5EZXBlbmRlbmNpZXMpfSlgKVxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5sb2NhbC5pc1ZhbGlkKSB7XG5cdFx0XHRjb25zdCBlcnJvcnMgPSB0aGlzLmV4dGVuc2lvbi5sb2NhbC52YWxpZGF0aW9ucy5maWx0ZXIoKFtzZXZlcml0eV0pID0+IHNldmVyaXR5ID09PSBTZXZlcml0eS5FcnJvcikubWFwKChbLCBtZXNzYWdlXSkgPT4gbWVzc2FnZSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoZXJyb3JzLmpvaW4oJyAnKS50cmltKCkpIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzRW5hYmxlZCA9IHRoaXMud29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKHRoaXMuZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHRjb25zdCBpc1J1bm5pbmcgPSB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZS5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBlLnV1aWQgfSwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpKTtcblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQgJiYgaXNFbmFibGVkICYmIGlzUnVubmluZykge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3dvcmtzcGFjZSBlbmFibGVkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBlbmFibGVkIGZvciB0aGlzIHdvcmtzcGFjZSBieSB0aGUgdXNlci5cIikpIH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdleHRlbnNpb24gZW5hYmxlZCBvbiByZW1vdGUnLCBcIkV4dGVuc2lvbiBpcyBlbmFibGVkIG9uICd7MH0nXCIsIHRoaXMuZXh0ZW5zaW9uLnNlcnZlci5sYWJlbCkpIH0sIHRydWUpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0VuYWJsZWQgJiYgIWlzUnVubmluZykge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2dsb2JhbGx5IGRpc2FibGVkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBnbG9iYWxseSBieSB0aGUgdXNlci5cIikpIH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3dvcmtzcGFjZSBkaXNhYmxlZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgZm9yIHRoaXMgd29ya3NwYWNlIGJ5IHRoZSB1c2VyLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1cyhzdGF0dXM6IEV4dGVuc2lvblN0YXR1cyB8IHVuZGVmaW5lZCwgdXBkYXRlQ2xhc3M6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc3RhdHVzKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdHVzLnNvbWUocyA9PiBzLm1lc3NhZ2UudmFsdWUgPT09IHN0YXR1cy5tZXNzYWdlLnZhbHVlICYmIHMuaWNvbj8uaWQgPT09IHN0YXR1cy5pY29uPy5pZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdHVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSBbXTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdHVzKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMucHVzaChzdGF0dXMpO1xuXHRcdFx0dGhpcy5fc3RhdHVzLnNvcnQoKGEsIGIpID0+XG5cdFx0XHRcdGIuaWNvbiA9PT0gdHJ1c3RJY29uID8gLTEgOlxuXHRcdFx0XHRcdGEuaWNvbiA9PT0gdHJ1c3RJY29uID8gMSA6XG5cdFx0XHRcdFx0XHRiLmljb24gPT09IGVycm9ySWNvbiA/IC0xIDpcblx0XHRcdFx0XHRcdFx0YS5pY29uID09PSBlcnJvckljb24gPyAxIDpcblx0XHRcdFx0XHRcdFx0XHRiLmljb24gPT09IHdhcm5pbmdJY29uID8gLTEgOlxuXHRcdFx0XHRcdFx0XHRcdFx0YS5pY29uID09PSB3YXJuaW5nSWNvbiA/IDEgOlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRiLmljb24gPT09IGluZm9JY29uID8gLTEgOlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGEuaWNvbiA9PT0gaW5mb0ljb24gPyAxIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdDBcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKHVwZGF0ZUNsYXNzKSB7XG5cdFx0XHRpZiAoc3RhdHVzPy5pY29uID09PSBlcnJvckljb24pIHtcblx0XHRcdFx0dGhpcy5jbGFzcyA9IGAke0V4dGVuc2lvblN0YXR1c0FjdGlvbi5DTEFTU30gZXh0ZW5zaW9uLXN0YXR1cy1lcnJvciAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShlcnJvckljb24pfWA7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGF0dXM/Lmljb24gPT09IHdhcm5pbmdJY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtFeHRlbnNpb25TdGF0dXNBY3Rpb24uQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtd2FybmluZyAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZSh3YXJuaW5nSWNvbil9YDtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKHN0YXR1cz8uaWNvbiA9PT0gaW5mb0ljb24pIHtcblx0XHRcdFx0dGhpcy5jbGFzcyA9IGAke0V4dGVuc2lvblN0YXR1c0FjdGlvbi5DTEFTU30gZXh0ZW5zaW9uLXN0YXR1cy1pbmZvICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGluZm9JY29uKX1gO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhdHVzPy5pY29uID09PSB0cnVzdEljb24pIHtcblx0XHRcdFx0dGhpcy5jbGFzcyA9IGAke0V4dGVuc2lvblN0YXR1c0FjdGlvbi5DTEFTU30gJHtUaGVtZUljb24uYXNDbGFzc05hbWUodHJ1c3RJY29uKX1gO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtFeHRlbnNpb25TdGF0dXNBY3Rpb24uQ0xBU1N9IGhpZGVgO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAodGhpcy5fc3RhdHVzWzBdPy5pY29uID09PSB0cnVzdEljb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2gudHJ1c3QubWFuYWdlJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbC5zcGVjaWZpY1ZlcnNpb24nO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnaW5zdGFsbCBwcmV2aW91cyB2ZXJzaW9uJywgXCJJbnN0YWxsIFNwZWNpZmljIFZlcnNpb24gb2YgRXh0ZW5zaW9uLi4uXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcgPSBJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24uSUQsIGxhYmVsOiBzdHJpbmcgPSBJbnN0YWxsU3BlY2lmaWNWZXJzaW9uT2ZFeHRlbnNpb25BY3Rpb24uTEFCRUwsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5zb21lKGwgPT4gdGhpcy5pc0VuYWJsZWQobCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uUGljayA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayh0aGlzLmdldEV4dGVuc2lvbkVudHJpZXMoKSwgeyBwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdEV4dGVuc2lvbicsIFwiU2VsZWN0IEV4dGVuc2lvblwiKSwgbWF0Y2hPbkRldGFpbDogdHJ1ZSB9KTtcblx0XHRpZiAoZXh0ZW5zaW9uUGljayAmJiBleHRlbnNpb25QaWNrLmV4dGVuc2lvbikge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQW5vdGhlclZlcnNpb25BY3Rpb24sIGV4dGVuc2lvblBpY2suZXh0ZW5zaW9uLCB0cnVlKTtcblx0XHRcdC8vIFRPRE86IHJlcGxhY2Ugd2l0aCBgdXNpbmdgIG9uY2UgYXZhaWxhYmxlXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGV4dGVuc2lvblBpY2suZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNFbmFibGVkKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLCBleHRlbnNpb24sIHRydWUpO1xuXHRcdC8vIFRPRE86IHJlcGxhY2Ugd2l0aCBgdXNpbmdgIG9uY2UgYXZhaWxhYmxlXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhY3Rpb24uZW5hYmxlZCAmJiAhIWV4dGVuc2lvbi5sb2NhbCAmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChleHRlbnNpb24ubG9jYWwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhY3Rpb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RXh0ZW5zaW9uRW50cmllcygpOiBQcm9taXNlPElFeHRlbnNpb25QaWNrSXRlbVtdPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCk7XG5cdFx0Y29uc3QgZW50cmllczogSUV4dGVuc2lvblBpY2tJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdGlmICh0aGlzLmlzRW5hYmxlZChleHRlbnNpb24pKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdFx0aWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdGxhYmVsOiBleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBlbnRyaWVzLnNvcnQoKGUxLCBlMikgPT4gZTEuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoZTIuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25QaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RJbnN0YWxsRXh0ZW5zaW9uc0luU2VydmVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRwcml2YXRlIGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGlkKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpLnRoZW4oKCkgPT4gdGhpcy51cGRhdGVFeHRlbnNpb25zKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9ucykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5leHRlbnNpb25zID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gISF0aGlzLmV4dGVuc2lvbnMgJiYgdGhpcy5nZXRFeHRlbnNpb25zVG9JbnN0YWxsKHRoaXMuZXh0ZW5zaW9ucykubGVuZ3RoID4gMDtcblx0XHR0aGlzLnRvb2x0aXAgPSB0aGlzLmxhYmVsO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdEFuZEluc3RhbGxFeHRlbnNpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5RXh0ZW5zaW9uc1RvSW5zdGFsbCgpOiBQcm9taXNlPElFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IGxvY2FsID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RXh0ZW5zaW9uc1RvSW5zdGFsbChsb2NhbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbGVjdEFuZEluc3RhbGxFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElFeHRlbnNpb25QaWNrSXRlbT4oKTtcblx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5vbkRpZEFjY2VwdChxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyk7XG5cdFx0fSk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGwgPSBhd2FpdCB0aGlzLnF1ZXJ5RXh0ZW5zaW9uc1RvSW5zdGFsbCgpO1xuXHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0aWYgKGxvY2FsRXh0ZW5zaW9uc1RvSW5zdGFsbC5sZW5ndGgpIHtcblx0XHRcdHF1aWNrUGljay50aXRsZSA9IHRoaXMuZ2V0UXVpY2tQaWNrVGl0bGUoKTtcblx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdzZWxlY3QgZXh0ZW5zaW9ucyB0byBpbnN0YWxsJywgXCJTZWxlY3QgZXh0ZW5zaW9ucyB0byBpbnN0YWxsXCIpO1xuXHRcdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdFx0bG9jYWxFeHRlbnNpb25zVG9JbnN0YWxsLnNvcnQoKGUxLCBlMikgPT4gZTEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShlMi5kaXNwbGF5TmFtZSkpO1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gbG9jYWxFeHRlbnNpb25zVG9JbnN0YWxsLm1hcDxJRXh0ZW5zaW9uUGlja0l0ZW0+KGV4dGVuc2lvbiA9PiAoeyBleHRlbnNpb24sIGxhYmVsOiBleHRlbnNpb24uZGlzcGxheU5hbWUsIGRlc2NyaXB0aW9uOiBleHRlbnNpb24udmVyc2lvbiB9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm8gbG9jYWwgZXh0ZW5zaW9ucycsIFwiVGhlcmUgYXJlIG5vIGV4dGVuc2lvbnMgdG8gaW5zdGFsbC5cIilcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRBY2NlcHQoc2VsZWN0ZWRJdGVtczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uUGlja0l0ZW0+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlbGVjdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGwgPSBzZWxlY3RlZEl0ZW1zLmZpbHRlcihyID0+ICEhci5leHRlbnNpb24pLm1hcChyID0+IHIuZXh0ZW5zaW9uKTtcblx0XHRcdGlmIChsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGwubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2luc3RhbGxpbmcgZXh0ZW5zaW9ucycsIFwiSW5zdGFsbGluZyBFeHRlbnNpb25zLi4uXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQoKSA9PiB0aGlzLmluc3RhbGxFeHRlbnNpb25zKGxvY2FsRXh0ZW5zaW9uc1RvSW5zdGFsbCkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnZmluaXNoZWQgaW5zdGFsbGluZycsIFwiU3VjY2Vzc2Z1bGx5IGluc3RhbGxlZCBleHRlbnNpb25zLlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFF1aWNrUGlja1RpdGxlKCk6IHN0cmluZztcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEV4dGVuc2lvbnNUb0luc3RhbGwobG9jYWw6IElFeHRlbnNpb25bXSk6IElFeHRlbnNpb25bXTtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGluc3RhbGxFeHRlbnNpb25zKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsTG9jYWxFeHRlbnNpb25zSW5SZW1vdGVBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdEluc3RhbGxFeHRlbnNpb25zSW5TZXJ2ZXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbnMuaW5zdGFsbExvY2FsRXh0ZW5zaW9uc0luUmVtb3RlJywgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlbGVjdCBhbmQgaW5zdGFsbCBsb2NhbCBleHRlbnNpb25zJywgXCJJbnN0YWxsIExvY2FsIEV4dGVuc2lvbnMgaW4gJ3swfScuLi5cIiwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmxhYmVsKTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFF1aWNrUGlja1RpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsIGxvY2FsIGV4dGVuc2lvbnMgdGl0bGUnLCBcIkluc3RhbGwgTG9jYWwgRXh0ZW5zaW9ucyBpbiAnezB9J1wiLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmxhYmVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRFeHRlbnNpb25zVG9JbnN0YWxsKGxvY2FsOiBJRXh0ZW5zaW9uW10pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdHJldHVybiBsb2NhbC5maWx0ZXIoZXh0ZW5zaW9uID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlSW5zdGFsbEFjdGlvbiwgdHJ1ZSk7XG5cdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0cmV0dXJuIGFjdGlvbi5lbmFibGVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGluc3RhbGxFeHRlbnNpb25zKGxvY2FsRXh0ZW5zaW9uc1RvSW5zdGFsbDogSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCB2c2l4czogVVJJW10gPSBbXTtcblx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0VGFyZ2V0UGxhdGZvcm0oKTtcblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGxvY2FsRXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXAoYXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdGNvbnN0IGdhbGxlcnkgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbi5sb2NhbD8ucHJlUmVsZWFzZSB9XSwgeyB0YXJnZXRQbGF0Zm9ybSwgY29tcGF0aWJsZTogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0Z2FsbGVyeUV4dGVuc2lvbnMucHVzaChnYWxsZXJ5KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHZzaXggPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuemlwKGV4dGVuc2lvbi5sb2NhbCEpO1xuXHRcdFx0dnNpeHMucHVzaCh2c2l4KTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGdhbGxlcnlFeHRlbnNpb25zLm1hcChnYWxsZXJ5ID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnkpKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQodnNpeHMubWFwKHZzaXggPT4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIS5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHZzaXgpKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh2c2l4cy5tYXAodnNpeCA9PiB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh2c2l4KSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxSZW1vdGVFeHRlbnNpb25zSW5Mb2NhbEFjdGlvbiBleHRlbmRzIEFic3RyYWN0SW5zdGFsbEV4dGVuc2lvbnNJblNlcnZlckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgcXVpY2tJbnB1dFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHByb2dyZXNzU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgbGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlbGVjdCBhbmQgaW5zdGFsbCByZW1vdGUgZXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBSZW1vdGUgRXh0ZW5zaW9ucyBMb2NhbGx5Li4uXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFF1aWNrUGlja1RpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsIHJlbW90ZSBleHRlbnNpb25zJywgXCJJbnN0YWxsIFJlbW90ZSBFeHRlbnNpb25zIExvY2FsbHlcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RXh0ZW5zaW9uc1RvSW5zdGFsbChsb2NhbDogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbltdIHtcblx0XHRyZXR1cm4gbG9jYWwuZmlsdGVyKGV4dGVuc2lvbiA9PlxuXHRcdFx0ZXh0ZW5zaW9uLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuVXNlciAmJiBleHRlbnNpb24uc2VydmVyICE9PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0JiYgIXRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLnNvbWUoZSA9PiBlLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBpbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBnYWxsZXJ5RXh0ZW5zaW9uczogSUdhbGxlcnlFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHZzaXhzOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IHRhcmdldFBsYXRmb3JtID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChleHRlbnNpb25zLm1hcChhc3luYyBleHRlbnNpb24gPT4ge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0Y29uc3QgZ2FsbGVyeSA9IChhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgLi4uZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHByZVJlbGVhc2U6ICEhZXh0ZW5zaW9uLmxvY2FsPy5wcmVSZWxlYXNlIH1dLCB7IHRhcmdldFBsYXRmb3JtLCBjb21wYXRpYmxlOiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXTtcblx0XHRcdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9ucy5wdXNoKGdhbGxlcnkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdnNpeCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuemlwKGV4dGVuc2lvbi5sb2NhbCEpO1xuXHRcdFx0dnNpeHMucHVzaCh2c2l4KTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGdhbGxlcnlFeHRlbnNpb25zLm1hcChnYWxsZXJ5ID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIS5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeSkpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh2c2l4cy5tYXAodnNpeCA9PiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbCh2c2l4KSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodnNpeHMubWFwKHZzaXggPT4gdGhpcy5maWxlU2VydmljZS5kZWwodnNpeCkpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0V4dGVuc2lvbnNGb3JMYW5ndWFnZScsIGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZmlsZUV4dGVuc2lvbjogc3RyaW5nKSB7XG5cdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdHJldHVybiBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBleHQ6JHtmaWxlRXh0ZW5zaW9uLnJlcGxhY2UoL15cXC4vLCAnJyl9YCk7XG59KTtcblxuZXhwb3J0IGNvbnN0IHNob3dFeHRlbnNpb25zV2l0aElkc0NvbW1hbmRJZCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd0V4dGVuc2lvbnNXaXRoSWRzJztcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHNob3dFeHRlbnNpb25zV2l0aElkc0NvbW1hbmRJZCwgZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBleHRlbnNpb25JZHM6IHN0cmluZ1tdKSB7XG5cdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdHJldHVybiBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGV4dGVuc2lvbklkcy5tYXAoaWQgPT4gYEBpZDoke2lkfWApLmpvaW4oJyAnKSk7XG59KTtcblxucmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uQnV0dG9uLmJhY2tncm91bmQnLCB7XG5cdGRhcms6IGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQsXG5cdGxpZ2h0OiBidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25CYWNrZ3JvdW5kJywgXCJCdXR0b24gYmFja2dyb3VuZCBjb2xvciBmb3IgZXh0ZW5zaW9uIGFjdGlvbnMuXCIpKTtcblxucmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uQnV0dG9uLmZvcmVncm91bmQnLCB7XG5cdGRhcms6IGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQsXG5cdGxpZ2h0OiBidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25Gb3JlZ3JvdW5kJywgXCJCdXR0b24gZm9yZWdyb3VuZCBjb2xvciBmb3IgZXh0ZW5zaW9uIGFjdGlvbnMuXCIpKTtcblxucmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uQnV0dG9uLmhvdmVyQmFja2dyb3VuZCcsIHtcblx0ZGFyazogYnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kLFxuXHRsaWdodDogYnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25Ib3ZlckJhY2tncm91bmQnLCBcIkJ1dHRvbiBiYWNrZ3JvdW5kIGhvdmVyIGNvbG9yIGZvciBleHRlbnNpb24gYWN0aW9ucy5cIikpO1xuXG5yZWdpc3RlckNvbG9yKCdleHRlbnNpb25CdXR0b24uYm9yZGVyJywge1xuXHRkYXJrOiBidXR0b25TZWNvbmRhcnlCb3JkZXIsXG5cdGxpZ2h0OiBidXR0b25TZWNvbmRhcnlCb3JkZXIsXG5cdGhjRGFyazogYnV0dG9uU2Vjb25kYXJ5Qm9yZGVyLFxuXHRoY0xpZ2h0OiBidXR0b25TZWNvbmRhcnlCb3JkZXJcbn0sIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25Cb3JkZXInLCBcIkJ1dHRvbiBib3JkZXIgY29sb3IgZm9yIGV4dGVuc2lvbiBhY3Rpb25zLlwiKSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkJ1dHRvbi5zZXBhcmF0b3InLCBidXR0b25TZXBhcmF0b3IsIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25TZXBhcmF0b3InLCBcIkJ1dHRvbiBzZXBhcmF0b3IgY29sb3IgZm9yIGV4dGVuc2lvbiBhY3Rpb25zXCIpKTtcblxuZXhwb3J0IGNvbnN0IGV4dGVuc2lvbkJ1dHRvblByb21pbmVudEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdleHRlbnNpb25CdXR0b24ucHJvbWluZW50QmFja2dyb3VuZCcsIHtcblx0ZGFyazogYnV0dG9uQmFja2dyb3VuZCxcblx0bGlnaHQ6IGJ1dHRvbkJhY2tncm91bmQsXG5cdGhjRGFyazogbnVsbCxcblx0aGNMaWdodDogbnVsbFxufSwgbG9jYWxpemUoJ2V4dGVuc2lvbkJ1dHRvblByb21pbmVudEJhY2tncm91bmQnLCBcIkJ1dHRvbiBiYWNrZ3JvdW5kIGNvbG9yIGZvciBleHRlbnNpb24gYWN0aW9ucyB0aGF0IHN0YW5kIG91dCAoZS5nLiBpbnN0YWxsIGJ1dHRvbikuXCIpKTtcblxucmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uQnV0dG9uLnByb21pbmVudEZvcmVncm91bmQnLCB7XG5cdGRhcms6IGJ1dHRvbkZvcmVncm91bmQsXG5cdGxpZ2h0OiBidXR0b25Gb3JlZ3JvdW5kLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25Qcm9taW5lbnRGb3JlZ3JvdW5kJywgXCJCdXR0b24gZm9yZWdyb3VuZCBjb2xvciBmb3IgZXh0ZW5zaW9uIGFjdGlvbnMgdGhhdCBzdGFuZCBvdXQgKGUuZy4gaW5zdGFsbCBidXR0b24pLlwiKSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkJ1dHRvbi5wcm9taW5lbnRIb3ZlckJhY2tncm91bmQnLCB7XG5cdGRhcms6IGJ1dHRvbkhvdmVyQmFja2dyb3VuZCxcblx0bGlnaHQ6IGJ1dHRvbkhvdmVyQmFja2dyb3VuZCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uUHJvbWluZW50SG92ZXJCYWNrZ3JvdW5kJywgXCJCdXR0b24gYmFja2dyb3VuZCBob3ZlciBjb2xvciBmb3IgZXh0ZW5zaW9uIGFjdGlvbnMgdGhhdCBzdGFuZCBvdXQgKGUuZy4gaW5zdGFsbCBidXR0b24pLlwiKSk7XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZTogSUNvbG9yVGhlbWUsIGNvbGxlY3RvcjogSUNzc1N0eWxlQ29sbGVjdG9yKSA9PiB7XG5cblx0Y29uc3QgZXJyb3JDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckVycm9yRm9yZWdyb3VuZCk7XG5cdGlmIChlcnJvckNvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tZWRpdG9yIC5oZWFkZXIgLmFjdGlvbnMtc3RhdHVzLWNvbnRhaW5lciA+IC5zdGF0dXMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihlcnJvckljb24pfSB7IGNvbG9yOiAke2Vycm9yQ29sb3J9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tZWRpdG9yIC5ib2R5IC5zdWJjb250ZW50IC5ydW50aW1lLXN0YXR1cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGVycm9ySWNvbil9IHsgY29sb3I6ICR7ZXJyb3JDb2xvcn07IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci5leHRlbnNpb24taG92ZXIgLm1hcmtkb3duLWhvdmVyIC5ob3Zlci1jb250ZW50cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGVycm9ySWNvbil9IHsgY29sb3I6ICR7ZXJyb3JDb2xvcn07IH1gKTtcblx0fVxuXG5cdGNvbnN0IHdhcm5pbmdDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kKTtcblx0aWYgKHdhcm5pbmdDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9uLWVkaXRvciAuaGVhZGVyIC5hY3Rpb25zLXN0YXR1cy1jb250YWluZXIgPiAuc3RhdHVzICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Iod2FybmluZ0ljb24pfSB7IGNvbG9yOiAke3dhcm5pbmdDb2xvcn07IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1lZGl0b3IgLmJvZHkgLnN1YmNvbnRlbnQgLnJ1bnRpbWUtc3RhdHVzICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Iod2FybmluZ0ljb24pfSB7IGNvbG9yOiAke3dhcm5pbmdDb2xvcn07IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci5leHRlbnNpb24taG92ZXIgLm1hcmtkb3duLWhvdmVyIC5ob3Zlci1jb250ZW50cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHdhcm5pbmdJY29uKX0geyBjb2xvcjogJHt3YXJuaW5nQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBpbmZvQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JJbmZvRm9yZWdyb3VuZCk7XG5cdGlmIChpbmZvQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1lZGl0b3IgLmhlYWRlciAuYWN0aW9ucy1zdGF0dXMtY29udGFpbmVyID4gLnN0YXR1cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGluZm9JY29uKX0geyBjb2xvcjogJHtpbmZvQ29sb3J9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tZWRpdG9yIC5ib2R5IC5zdWJjb250ZW50IC5ydW50aW1lLXN0YXR1cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGluZm9JY29uKX0geyBjb2xvcjogJHtpbmZvQ29sb3J9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28taG92ZXIuZXh0ZW5zaW9uLWhvdmVyIC5tYXJrZG93bi1ob3ZlciAuaG92ZXItY29udGVudHMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpbmZvSWNvbil9IHsgY29sb3I6ICR7aW5mb0NvbG9yfTsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBa0IsUUFBUSxXQUFXLHFCQUF5QztBQUM5RSxTQUFTLFNBQVMsVUFBVSxpQkFBaUI7QUFDN0MsU0FBUyxTQUFTLGFBQWE7QUFDL0IsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXFCLGdCQUFnQiw2QkFBa0QsbUNBQW1DLDBDQUEwQyxxQkFBcUIsdUJBQXVCLHNCQUFzQixvQkFBb0IsNEJBQTJDLGtDQUFrQztBQUN2VSxTQUFTLDZDQUE2QztBQUN0RCxTQUE0QiwwQkFBMkQsa0JBQWtCLDhCQUE4QiwyQkFBMkIsMkNBQTJDO0FBQzdNLFNBQVMsc0NBQXNDLGlCQUFpQixtQ0FBK0QsNENBQTRDO0FBQzNLLFNBQVMsK0JBQStCLHlDQUF5Qyx3Q0FBd0M7QUFDekgsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsZUFBZSxxQkFBZ0UseUJBQXlCLGdDQUFnQyxnQkFBZ0Isb0NBQW9DO0FBQ3JNLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsb0JBQWtDO0FBQzNDLFNBQVMsMEJBQTBCLHNCQUF3QztBQUMzRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQixhQUFhLDhCQUE4QjtBQUN2RSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFT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LHlCQUF5Qiw0Q0FBNEMsQ0FBQztBQUVsRixjQUFjLDZCQUE2QixpQkFBaUIsU0FBUyw0QkFBNEIsOENBQThDLENBQUM7QUFFekksTUFBTSxxQ0FBcUMsY0FBYyx1Q0FBdUM7QUFBQSxFQUN0RyxNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixTQUFTO0FBQ1YsR0FBRyxTQUFTLHNDQUFzQyxxRkFBcUYsQ0FBQztBQUV4SSxjQUFjLHVDQUF1QztBQUFBLEVBQ3BELE1BQU07QUFBQSxFQUNOLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFDVixHQUFHLFNBQVMsc0NBQXNDLHFGQUFxRixDQUFDO0FBRXhJLGNBQWMsNENBQTRDO0FBQUEsRUFDekQsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUNWLEdBQUcsU0FBUywyQ0FBMkMsMkZBQTJGLENBQUM7QUFFbkosMkJBQTJCLENBQUMsT0FBb0IsY0FBa0M7QUFFakYsUUFBTSxhQUFhLE1BQU0sU0FBUyxxQkFBcUI7QUFDdkQsTUFBSSxZQUFZO0FBQ2YsY0FBVSxRQUFRLGlFQUFpRSxVQUFVLGNBQWMsU0FBUyxDQUFDLGFBQWEsVUFBVSxLQUFLO0FBQ2pKLGNBQVUsUUFBUSx1REFBdUQsVUFBVSxjQUFjLFNBQVMsQ0FBQyxhQUFhLFVBQVUsS0FBSztBQUN2SSxjQUFVLFFBQVEsaUVBQWlFLFVBQVUsY0FBYyxTQUFTLENBQUMsYUFBYSxVQUFVLEtBQUs7QUFBQSxFQUNsSjtBQUVBLFFBQU0sZUFBZSxNQUFNLFNBQVMsdUJBQXVCO0FBQzNELE1BQUksY0FBYztBQUNqQixjQUFVLFFBQVEsaUVBQWlFLFVBQVUsY0FBYyxXQUFXLENBQUMsYUFBYSxZQUFZLEtBQUs7QUFDckosY0FBVSxRQUFRLHVEQUF1RCxVQUFVLGNBQWMsV0FBVyxDQUFDLGFBQWEsWUFBWSxLQUFLO0FBQzNJLGNBQVUsUUFBUSxpRUFBaUUsVUFBVSxjQUFjLFdBQVcsQ0FBQyxhQUFhLFlBQVksS0FBSztBQUFBLEVBQ3RKO0FBRUEsUUFBTSxZQUFZLE1BQU0sU0FBUyxvQkFBb0I7QUFDckQsTUFBSSxXQUFXO0FBQ2QsY0FBVSxRQUFRLGlFQUFpRSxVQUFVLGNBQWMsUUFBUSxDQUFDLGFBQWEsU0FBUyxLQUFLO0FBQy9JLGNBQVUsUUFBUSx1REFBdUQsVUFBVSxjQUFjLFFBQVEsQ0FBQyxhQUFhLFNBQVMsS0FBSztBQUNySSxjQUFVLFFBQVEsaUVBQWlFLFVBQVUsY0FBYyxRQUFRLENBQUMsYUFBYSxTQUFTLEtBQUs7QUFBQSxFQUNoSjtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbIm1lc3NhZ2UiLCAiRGVwcmVjYXRpb25DaG9pY2UiLCAiZXh0ZW5zaW9uIiwgInJ1bm5pbmdFeHRlbnNpb24iXQp9Cg==
