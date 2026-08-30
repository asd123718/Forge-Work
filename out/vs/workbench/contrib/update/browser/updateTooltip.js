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
import * as dom from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IMeteredConnectionService } from "../../../../platform/meteredConnection/common/meteredConnection.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { DisablementReason, StateType } from "../../../../platform/update/common/update.js";
import { ShowCurrentReleaseNotesActionId } from "../common/update.js";
import { computeDownloadSpeed, computeDownloadTimeRemaining, computeProgressPercent, formatBytes, formatDate, formatTimeRemaining, tryParseDate } from "../common/updateUtils.js";
import "./media/updateTooltip.css";
let UpdateTooltip = class extends Disposable {
  constructor(clipboardService, commandService, configurationService, hoverService, meteredConnectionService, productService) {
    super();
    this.clipboardService = clipboardService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.meteredConnectionService = meteredConnectionService;
    this.productService = productService;
    this.domNode = dom.$(".update-tooltip");
    const header = dom.append(this.domNode, dom.$(".header"));
    this.titleNode = dom.append(header, dom.$(".title"));
    this.productInfoNode = dom.append(this.domNode, dom.$(".product-info"));
    const logoContainer = dom.append(this.productInfoNode, dom.$(".product-logo"));
    logoContainer.setAttribute("role", "img");
    logoContainer.setAttribute("aria-label", this.productService.nameLong);
    const details = dom.append(this.productInfoNode, dom.$(".product-details"));
    this.productNameNode = dom.append(details, dom.$(".product-name"));
    this.productNameNode.textContent = this.productService.nameLong;
    const currentVersionRow = this.createVersionRow(details);
    this.currentVersionNode = currentVersionRow.label;
    this.currentVersionCopyValue = currentVersionRow.copyValue;
    this.currentVersionCopyButton = currentVersionRow.copyButton;
    const latestVersionRow = this.createVersionRow(details);
    this.latestVersionNode = latestVersionRow.label;
    this.latestVersionCopyValue = latestVersionRow.copyValue;
    this.latestVersionCopyButton = latestVersionRow.copyButton;
    this.releaseDateNode = dom.append(details, dom.$(".product-release-date"));
    this.progressContainer = dom.append(this.domNode, dom.$(".progress-container"));
    const progressBar = dom.append(this.progressContainer, dom.$(".progress-bar"));
    this.progressFill = dom.append(progressBar, dom.$(".progress-fill"));
    const progressText = dom.append(this.progressContainer, dom.$(".progress-text"));
    this.progressPercentNode = dom.append(progressText, dom.$("span"));
    this.progressSizeNode = dom.append(progressText, dom.$("span"));
    this.downloadStatsContainer = dom.append(this.progressContainer, dom.$(".download-stats"));
    this.timeRemainingNode = dom.append(this.downloadStatsContainer, dom.$(".time-remaining"));
    this.speedInfoNode = dom.append(this.downloadStatsContainer, dom.$(".speed-info"));
    this.messageNode = dom.append(this.domNode, dom.$(".state-message"));
    this.buttonBar = dom.append(this.domNode, dom.$(".button-bar"));
    this.releaseNotesButton = dom.append(this.buttonBar, dom.$("button.release-notes-button"));
    this.releaseNotesButton.textContent = localize("updateTooltip.viewReleaseNotes", "Release Notes");
    this._register(dom.addDisposableListener(this.releaseNotesButton, "click", () => {
      if (this.releaseNotesVersion) {
        this.runCommandAndClose(ShowCurrentReleaseNotesActionId, this.releaseNotesVersion);
      }
    }));
    this.actionButton = dom.append(this.buttonBar, dom.$("button.action-button"));
    this._register(dom.addDisposableListener(this.actionButton, "click", () => {
      const commandId = this.actionButton.dataset.commandId;
      if (commandId) {
        this.runCommandAndClose(commandId);
      }
    }));
    this.updateCurrentVersion();
  }
  updateCurrentVersion() {
    const productVersion = this.productService.version;
    if (productVersion) {
      const currentCommitId = this.productService.commit?.substring(0, 7);
      this.currentVersionNode.textContent = currentCommitId ? localize("updateTooltip.currentVersionLabelWithCommit", "Current Version: {0} ({1})", productVersion, currentCommitId) : localize("updateTooltip.currentVersionLabel", "Current Version: {0}", productVersion);
      this.currentVersionCopyValue.value = currentCommitId ? `${productVersion} (${this.productService.commit})` : productVersion;
      this.currentVersionNode.parentElement.style.display = "";
      this.currentVersionCopyButton.tabIndex = 0;
    } else {
      this.currentVersionNode.parentElement.style.display = "none";
      this.currentVersionCopyButton.tabIndex = -1;
    }
  }
  hideAll() {
    this.productInfoNode.style.display = "";
    this.progressContainer.style.display = "none";
    this.speedInfoNode.textContent = "";
    this.timeRemainingNode.textContent = "";
    this.messageNode.style.display = "none";
    this.actionButton.style.display = "none";
    this.actionButton.tabIndex = -1;
    this.actionButton.dataset.commandId = "";
    this.releaseNotesButton.style.marginRight = "";
  }
  renderState(state) {
    this.hideAll();
    switch (state.type) {
      case StateType.Uninitialized:
        this.renderUninitialized();
        break;
      case StateType.Disabled:
        this.renderDisabled(state);
        break;
      case StateType.Idle:
        this.renderIdle(state);
        break;
      case StateType.CheckingForUpdates:
        this.renderCheckingForUpdates();
        break;
      case StateType.AvailableForDownload:
        this.renderAvailableForDownload(state);
        break;
      case StateType.Downloading:
        this.renderDownloading(state);
        break;
      case StateType.Downloaded:
        this.renderDownloaded(state);
        break;
      case StateType.Updating:
        this.renderUpdating(state);
        break;
      case StateType.Ready:
        this.renderReady(state);
        break;
      case StateType.Overwriting:
        this.renderOverwriting(state);
        break;
      case StateType.Cancelling:
        this.renderCancelling();
        break;
      case StateType.Restarting:
        this.renderRestarting(state);
        break;
    }
  }
  renderUninitialized() {
    this.renderTitleAndInfo(localize("updateTooltip.initializingTitle", "Initializing"));
    this.renderMessage(localize("updateTooltip.initializingMessage", "Initializing update service..."));
  }
  renderDisabled({ reason }) {
    this.renderTitleAndInfo(localize("updateTooltip.updatesDisabledTitle", "Updates Disabled"));
    switch (reason) {
      case DisablementReason.NotBuilt:
        this.renderMessage(
          localize("updateTooltip.disabledNotBuilt", "Updates are not available for this build."),
          Codicon.info
        );
        break;
      case DisablementReason.DisabledByEnvironment:
        this.renderMessage(
          localize("updateTooltip.disabledByEnvironment", "Updates are disabled by the --disable-updates command line flag."),
          Codicon.warning
        );
        break;
      case DisablementReason.ManuallyDisabled:
        this.renderMessage(
          localize("updateTooltip.disabledManually", 'Updates are manually disabled. Change the "update.mode" setting to enable.'),
          Codicon.warning
        );
        break;
      case DisablementReason.Policy:
        this.renderMessage(
          localize("updateTooltip.disabledByPolicy", "Updates are disabled by organization policy."),
          Codicon.info
        );
        break;
      case DisablementReason.MissingConfiguration:
        this.renderMessage(
          localize("updateTooltip.disabledMissingConfig", "Updates are disabled because no update URL is configured."),
          Codicon.info
        );
        break;
      case DisablementReason.InvalidConfiguration:
        this.renderMessage(
          localize("updateTooltip.disabledInvalidConfig", "Updates are disabled because the update URL is invalid."),
          Codicon.error
        );
        break;
      case DisablementReason.RunningAsAdmin:
        this.renderMessage(
          localize(
            "updateTooltip.disabledRunningAsAdmin",
            "Updates are not available when running a user install of {0} as administrator.",
            this.productService.nameShort
          ),
          Codicon.warning
        );
        break;
      default:
        this.renderMessage(localize("updateTooltip.disabledGeneric", "Updates are disabled."), Codicon.warning);
        break;
    }
  }
  renderIdle({ error, notAvailable }) {
    if (error) {
      this.renderTitleAndInfo(localize("updateTooltip.updateErrorTitle", "Update Error"));
      this.renderMessage(error, Codicon.error);
      return;
    }
    if (notAvailable) {
      this.renderTitleAndInfo(localize("updateTooltip.noUpdateAvailableTitle", "No Update Available"));
      this.renderMessage(localize("updateTooltip.noUpdateAvailableMessage", "There are no updates currently available."), Codicon.info);
      return;
    }
    this.renderTitleAndInfo(localize("updateTooltip.upToDateTitle", "Up to Date"));
    switch (this.configurationService.getValue("update.mode")) {
      case "none":
        this.renderMessage(localize("updateTooltip.autoUpdateNone", "Automatic updates are disabled."), Codicon.warning);
        break;
      case "manual":
        this.renderMessage(localize("updateTooltip.autoUpdateManual", "Automatic updates will be checked but not installed automatically."));
        break;
      case "start":
        this.renderMessage(localize("updateTooltip.autoUpdateStart", "Updates will be applied on restart."));
        break;
      case "default":
        if (this.meteredConnectionService.isConnectionMetered) {
          this.renderMessage(
            localize("updateTooltip.meteredConnectionMessage", "Automatic updates are paused because the network connection is metered."),
            Codicon.radioTower
          );
        } else {
          this.renderMessage(
            localize("updateTooltip.autoUpdateDefault", "Automatic updates are enabled. Happy Coding!"),
            Codicon.smiley
          );
        }
        break;
    }
  }
  renderCheckingForUpdates() {
    this.renderTitleAndInfo(localize("updateTooltip.checkingForUpdatesTitle", "Checking for Updates"));
    this.renderMessage(localize("updateTooltip.checkingPleaseWait", "Checking for updates, please wait..."));
  }
  renderAvailableForDownload({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.updateAvailableTitle", "Update Available"), update);
    this.renderActionButton(localize("updateTooltip.downloadButton", "Download"), "update.downloadNow");
  }
  renderDownloading(state) {
    this.renderTitleAndInfo(localize("updateTooltip.downloadingUpdateTitle", "Downloading Update"), state.update);
    const { downloadedBytes, totalBytes } = state;
    if (downloadedBytes !== void 0 && totalBytes !== void 0 && totalBytes > 0) {
      const percentage = computeProgressPercent(downloadedBytes, totalBytes) ?? 0;
      this.progressFill.style.width = `${percentage}%`;
      this.progressPercentNode.textContent = `${percentage}%`;
      this.progressSizeNode.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
      this.progressContainer.style.display = "";
      const speed = computeDownloadSpeed(state);
      if (speed !== void 0 && speed > 0) {
        this.speedInfoNode.textContent = localize("updateTooltip.downloadSpeed", "{0}/s", formatBytes(speed));
      }
      const timeRemaining = computeDownloadTimeRemaining(state);
      if (timeRemaining !== void 0 && timeRemaining > 0) {
        this.timeRemainingNode.textContent = `~${formatTimeRemaining(timeRemaining)} ${localize("updateTooltip.timeRemaining", "remaining")}`;
      }
      this.downloadStatsContainer.style.display = "";
    } else {
      this.renderMessage(localize("updateTooltip.downloadingPleaseWait", "Downloading update, please wait..."));
    }
  }
  renderDownloaded({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.updateReadyTitle", "Update is Ready to Install"), update);
    this.renderActionButton(localize("updateTooltip.installButton", "Install"), "update.install");
  }
  renderUpdating({ update, currentProgress, maxProgress }) {
    this.renderTitleAndInfo(localize("updateTooltip.installingUpdateTitle", "Installing Update"), update);
    const percentage = computeProgressPercent(currentProgress, maxProgress);
    if (percentage !== void 0) {
      this.progressFill.style.width = `${percentage}%`;
      this.progressPercentNode.textContent = `${percentage}%`;
      this.progressSizeNode.textContent = "";
      this.progressContainer.style.display = "";
    } else {
      this.renderMessage(localize("updateTooltip.installingPleaseWait", "Installing update, please wait..."));
    }
  }
  renderReady({ update }) {
    if (this.configurationService.getValue("update.mode") === "manual") {
      this.renderTitleAndInfo(localize("updateTooltip.updateInstalledTitle", "Update Installed"), update);
      this.renderActionButton(localize("updateTooltip.restartButton", "Restart"), "update.restart");
    } else {
      this.renderTitleAndInfo(localize("updateTooltip.restartToUpdateTitle", "Restart to Update"), update);
    }
  }
  renderOverwriting({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.downloadingNewerUpdateTitle", "Downloading Newer Update"), update);
    this.renderMessage(localize("updateTooltip.downloadingNewerPleaseWait", "A newer update was released. Downloading, please wait..."));
  }
  renderRestarting({ update }) {
    this.renderTitleAndInfo(localize("updateTooltip.restartingTitle", "Restarting {0}", this.productService.nameShort), update);
    this.renderMessage(localize("updateTooltip.restartingPleaseWait", "Restarting to update, please wait..."));
  }
  renderCancelling() {
    this.renderTitleAndInfo(localize("updateTooltip.cancellingTitle", "Cancelling Update"));
    this.renderMessage(localize("updateTooltip.cancellingPleaseWait", "Cancelling update, please wait..."));
  }
  renderTitleAndInfo(title, update) {
    this.titleNode.textContent = title;
    const version = update?.productVersion;
    if (version) {
      const updateCommitId = update.version?.substring(0, 7);
      this.latestVersionNode.textContent = updateCommitId ? localize("updateTooltip.latestVersionLabelWithCommit", "Latest Version: {0} ({1})", version, updateCommitId) : localize("updateTooltip.latestVersionLabel", "Latest Version: {0}", version);
      this.latestVersionCopyValue.value = updateCommitId ? `${version} (${update.version})` : version;
      this.latestVersionNode.parentElement.style.display = "";
      this.latestVersionCopyButton.tabIndex = 0;
    } else {
      this.latestVersionNode.parentElement.style.display = "none";
      this.latestVersionCopyButton.tabIndex = -1;
    }
    const releaseDate = update?.timestamp ?? tryParseDate(this.productService.date);
    if (typeof releaseDate === "number" && releaseDate > 0) {
      this.releaseDateNode.textContent = localize("updateTooltip.releasedLabel", "Released {0}", formatDate(releaseDate));
      this.releaseDateNode.style.display = "";
    } else {
      this.releaseDateNode.style.display = "none";
    }
    this.releaseNotesVersion = version ?? this.productService.version;
    this.releaseNotesButton.style.display = this.releaseNotesVersion ? "" : "none";
    this.releaseNotesButton.tabIndex = this.releaseNotesVersion ? 0 : -1;
    this.releaseNotesButton.style.marginRight = this.releaseNotesVersion ? "auto" : "";
    this.buttonBar.style.display = this.releaseNotesVersion ? "" : "none";
  }
  renderActionButton(label, commandId) {
    this.actionButton.textContent = label;
    this.actionButton.dataset.commandId = commandId;
    this.actionButton.style.display = "";
    this.actionButton.tabIndex = 0;
  }
  renderMessage(message, icon) {
    dom.clearNode(this.messageNode);
    if (icon) {
      const iconNode = dom.append(this.messageNode, dom.$(".state-message-icon"));
      iconNode.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
    dom.append(this.messageNode, document.createTextNode(message));
    this.messageNode.style.display = "";
  }
  createVersionRow(parent) {
    const row = dom.append(parent, dom.$(".product-version"));
    const label = dom.append(row, dom.$("span"));
    const copyValue = { value: "" };
    const copyButton = dom.append(row, dom.$("a.copy-version-button"));
    copyButton.setAttribute("role", "button");
    copyButton.setAttribute("tabindex", "0");
    const title = localize("updateTooltip.copyVersion", "Copy");
    copyButton.title = title;
    copyButton.setAttribute("aria-label", title);
    const copyIcon = dom.append(copyButton, dom.$(".copy-icon"));
    copyIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.copy));
    this._register(dom.addDisposableListener(copyButton, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (copyValue.value) {
        this.clipboardService.writeText(copyValue.value);
      }
    }));
    return { label, copyValue, copyButton };
  }
  runCommandAndClose(command, ...args) {
    this.commandService.executeCommand(command, ...args);
    this.hoverService.hideHover(true);
  }
};
UpdateTooltip = __decorateClass([
  __decorateParam(0, IClipboardService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IMeteredConnectionService),
  __decorateParam(5, IProductService)
], UpdateTooltip);
export {
  UpdateTooltip
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcYnJvd3NlclxcdXBkYXRlVG9vbHRpcC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF2YWlsYWJsZUZvckRvd25sb2FkLCBEaXNhYmxlZCwgRGlzYWJsZW1lbnRSZWFzb24sIERvd25sb2FkZWQsIERvd25sb2FkaW5nLCBJZGxlLCBJVXBkYXRlLCBPdmVyd3JpdGluZywgUmVhZHksIFJlc3RhcnRpbmcsIFN0YXRlLCBTdGF0ZVR5cGUsIFVwZGF0aW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgU2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZCB9IGZyb20gJy4uL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgY29tcHV0ZURvd25sb2FkU3BlZWQsIGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcsIGNvbXB1dGVQcm9ncmVzc1BlcmNlbnQsIGZvcm1hdEJ5dGVzLCBmb3JtYXREYXRlLCBmb3JtYXRUaW1lUmVtYWluaW5nLCB0cnlQYXJzZURhdGUgfSBmcm9tICcuLi9jb21tb24vdXBkYXRlVXRpbHMuanMnO1xuaW1wb3J0ICcuL21lZGlhL3VwZGF0ZVRvb2x0aXAuY3NzJztcblxuLyoqXG4gKiBBIHN0YXRlZnVsIHRvb2x0aXAgY29udHJvbCBmb3IgdGhlIHVwZGF0ZSBzdGF0dXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBVcGRhdGVUb29sdGlwIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHQvLyBIZWFkZXIgc2VjdGlvblxuXHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gUHJvZHVjdCBpbmZvIHNlY3Rpb25cblx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0SW5mb05vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3ROYW1lTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFZlcnNpb25Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50VmVyc2lvbkNvcHlWYWx1ZTogeyB2YWx1ZTogc3RyaW5nIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFZlcnNpb25Db3B5QnV0dG9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBsYXRlc3RWZXJzaW9uTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF0ZXN0VmVyc2lvbkNvcHlWYWx1ZTogeyB2YWx1ZTogc3RyaW5nIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF0ZXN0VmVyc2lvbkNvcHlCdXR0b246IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlbGVhc2VEYXRlTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gUHJvZ3Jlc3Mgc2VjdGlvblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc0ZpbGw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzUGVyY2VudE5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2l6ZU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdC8vIEV4dHJhIGRvd25sb2FkIGluZm9cblx0cHJpdmF0ZSByZWFkb25seSBkb3dubG9hZFN0YXRzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0aW1lUmVtYWluaW5nTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3BlZWRJbmZvTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gU3RhdGUtc3BlY2lmaWMgbWVzc2FnZVxuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VOb2RlOiBIVE1MRWxlbWVudDtcblxuXHQvLyBCdXR0b24gYmFyXG5cdHByaXZhdGUgcmVhZG9ubHkgYnV0dG9uQmFyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSByZWxlYXNlTm90ZXNCdXR0b246IEhUTUxCdXR0b25FbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbkJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWxlYXNlTm90ZXNWZXJzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U6IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLnVwZGF0ZS10b29sdGlwJyk7XG5cblx0XHQvLyBIZWFkZXIgc2VjdGlvblxuXHRcdGNvbnN0IGhlYWRlciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmhlYWRlcicpKTtcblx0XHR0aGlzLnRpdGxlTm9kZSA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnLnRpdGxlJykpO1xuXG5cdFx0Ly8gUHJvZHVjdCBpbmZvIHNlY3Rpb25cblx0XHR0aGlzLnByb2R1Y3RJbmZvTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnByb2R1Y3QtaW5mbycpKTtcblxuXHRcdGNvbnN0IGxvZ29Db250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMucHJvZHVjdEluZm9Ob2RlLCBkb20uJCgnLnByb2R1Y3QtbG9nbycpKTtcblx0XHRsb2dvQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdpbWcnKTtcblx0XHRsb2dvQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xuXG5cdFx0Y29uc3QgZGV0YWlscyA9IGRvbS5hcHBlbmQodGhpcy5wcm9kdWN0SW5mb05vZGUsIGRvbS4kKCcucHJvZHVjdC1kZXRhaWxzJykpO1xuXG5cdFx0dGhpcy5wcm9kdWN0TmFtZU5vZGUgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcucHJvZHVjdC1uYW1lJykpO1xuXHRcdHRoaXMucHJvZHVjdE5hbWVOb2RlLnRleHRDb250ZW50ID0gdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZztcblxuXHRcdGNvbnN0IGN1cnJlbnRWZXJzaW9uUm93ID0gdGhpcy5jcmVhdGVWZXJzaW9uUm93KGRldGFpbHMpO1xuXHRcdHRoaXMuY3VycmVudFZlcnNpb25Ob2RlID0gY3VycmVudFZlcnNpb25Sb3cubGFiZWw7XG5cdFx0dGhpcy5jdXJyZW50VmVyc2lvbkNvcHlWYWx1ZSA9IGN1cnJlbnRWZXJzaW9uUm93LmNvcHlWYWx1ZTtcblx0XHR0aGlzLmN1cnJlbnRWZXJzaW9uQ29weUJ1dHRvbiA9IGN1cnJlbnRWZXJzaW9uUm93LmNvcHlCdXR0b247XG5cblx0XHRjb25zdCBsYXRlc3RWZXJzaW9uUm93ID0gdGhpcy5jcmVhdGVWZXJzaW9uUm93KGRldGFpbHMpO1xuXHRcdHRoaXMubGF0ZXN0VmVyc2lvbk5vZGUgPSBsYXRlc3RWZXJzaW9uUm93LmxhYmVsO1xuXHRcdHRoaXMubGF0ZXN0VmVyc2lvbkNvcHlWYWx1ZSA9IGxhdGVzdFZlcnNpb25Sb3cuY29weVZhbHVlO1xuXHRcdHRoaXMubGF0ZXN0VmVyc2lvbkNvcHlCdXR0b24gPSBsYXRlc3RWZXJzaW9uUm93LmNvcHlCdXR0b247XG5cblx0XHR0aGlzLnJlbGVhc2VEYXRlTm9kZSA9IGRvbS5hcHBlbmQoZGV0YWlscywgZG9tLiQoJy5wcm9kdWN0LXJlbGVhc2UtZGF0ZScpKTtcblxuXHRcdC8vIFByb2dyZXNzIHNlY3Rpb25cblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcucHJvZ3Jlc3MtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHByb2dyZXNzQmFyID0gZG9tLmFwcGVuZCh0aGlzLnByb2dyZXNzQ29udGFpbmVyLCBkb20uJCgnLnByb2dyZXNzLWJhcicpKTtcblx0XHR0aGlzLnByb2dyZXNzRmlsbCA9IGRvbS5hcHBlbmQocHJvZ3Jlc3NCYXIsIGRvbS4kKCcucHJvZ3Jlc3MtZmlsbCcpKTtcblxuXHRcdGNvbnN0IHByb2dyZXNzVGV4dCA9IGRvbS5hcHBlbmQodGhpcy5wcm9ncmVzc0NvbnRhaW5lciwgZG9tLiQoJy5wcm9ncmVzcy10ZXh0JykpO1xuXHRcdHRoaXMucHJvZ3Jlc3NQZXJjZW50Tm9kZSA9IGRvbS5hcHBlbmQocHJvZ3Jlc3NUZXh0LCBkb20uJCgnc3BhbicpKTtcblx0XHR0aGlzLnByb2dyZXNzU2l6ZU5vZGUgPSBkb20uYXBwZW5kKHByb2dyZXNzVGV4dCwgZG9tLiQoJ3NwYW4nKSk7XG5cblx0XHQvLyBFeHRyYSBkb3dubG9hZCBzdGF0c1xuXHRcdHRoaXMuZG93bmxvYWRTdGF0c0NvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5wcm9ncmVzc0NvbnRhaW5lciwgZG9tLiQoJy5kb3dubG9hZC1zdGF0cycpKTtcblx0XHR0aGlzLnRpbWVSZW1haW5pbmdOb2RlID0gZG9tLmFwcGVuZCh0aGlzLmRvd25sb2FkU3RhdHNDb250YWluZXIsIGRvbS4kKCcudGltZS1yZW1haW5pbmcnKSk7XG5cdFx0dGhpcy5zcGVlZEluZm9Ob2RlID0gZG9tLmFwcGVuZCh0aGlzLmRvd25sb2FkU3RhdHNDb250YWluZXIsIGRvbS4kKCcuc3BlZWQtaW5mbycpKTtcblxuXHRcdC8vIFN0YXRlLXNwZWNpZmljIG1lc3NhZ2Vcblx0XHR0aGlzLm1lc3NhZ2VOb2RlID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcuc3RhdGUtbWVzc2FnZScpKTtcblxuXHRcdC8vIEJ1dHRvbiBiYXJcblx0XHR0aGlzLmJ1dHRvbkJhciA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmJ1dHRvbi1iYXInKSk7XG5cblx0XHR0aGlzLnJlbGVhc2VOb3Rlc0J1dHRvbiA9IGRvbS5hcHBlbmQodGhpcy5idXR0b25CYXIsIGRvbS4kKCdidXR0b24ucmVsZWFzZS1ub3Rlcy1idXR0b24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0dGhpcy5yZWxlYXNlTm90ZXNCdXR0b24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC52aWV3UmVsZWFzZU5vdGVzJywgXCJSZWxlYXNlIE5vdGVzXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yZWxlYXNlTm90ZXNCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLnJlbGVhc2VOb3Rlc1ZlcnNpb24pIHtcblx0XHRcdFx0dGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoU2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZCwgdGhpcy5yZWxlYXNlTm90ZXNWZXJzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmFjdGlvbkJ1dHRvbiA9IGRvbS5hcHBlbmQodGhpcy5idXR0b25CYXIsIGRvbS4kKCdidXR0b24uYWN0aW9uLWJ1dHRvbicpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYWN0aW9uQnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kSWQgPSB0aGlzLmFjdGlvbkJ1dHRvbi5kYXRhc2V0LmNvbW1hbmRJZDtcblx0XHRcdGlmIChjb21tYW5kSWQpIHtcblx0XHRcdFx0dGhpcy5ydW5Db21tYW5kQW5kQ2xvc2UoY29tbWFuZElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBQb3B1bGF0ZSBzdGF0aWMgcHJvZHVjdCBpbmZvXG5cdFx0dGhpcy51cGRhdGVDdXJyZW50VmVyc2lvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDdXJyZW50VmVyc2lvbigpIHtcblx0XHRjb25zdCBwcm9kdWN0VmVyc2lvbiA9IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbjtcblx0XHRpZiAocHJvZHVjdFZlcnNpb24pIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRDb21taXRJZCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0Py5zdWJzdHJpbmcoMCwgNyk7XG5cdFx0XHR0aGlzLmN1cnJlbnRWZXJzaW9uTm9kZS50ZXh0Q29udGVudCA9IGN1cnJlbnRDb21taXRJZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmN1cnJlbnRWZXJzaW9uTGFiZWxXaXRoQ29tbWl0JywgXCJDdXJyZW50IFZlcnNpb246IHswfSAoezF9KVwiLCBwcm9kdWN0VmVyc2lvbiwgY3VycmVudENvbW1pdElkKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmN1cnJlbnRWZXJzaW9uTGFiZWwnLCBcIkN1cnJlbnQgVmVyc2lvbjogezB9XCIsIHByb2R1Y3RWZXJzaW9uKTtcblx0XHRcdHRoaXMuY3VycmVudFZlcnNpb25Db3B5VmFsdWUudmFsdWUgPSBjdXJyZW50Q29tbWl0SWQgPyBgJHtwcm9kdWN0VmVyc2lvbn0gKCR7dGhpcy5wcm9kdWN0U2VydmljZS5jb21taXR9KWAgOiBwcm9kdWN0VmVyc2lvbjtcblx0XHRcdHRoaXMuY3VycmVudFZlcnNpb25Ob2RlLnBhcmVudEVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuY3VycmVudFZlcnNpb25Db3B5QnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jdXJyZW50VmVyc2lvbk5vZGUucGFyZW50RWxlbWVudCEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuY3VycmVudFZlcnNpb25Db3B5QnV0dG9uLnRhYkluZGV4ID0gLTE7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoaWRlQWxsKCkge1xuXHRcdHRoaXMucHJvZHVjdEluZm9Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5zcGVlZEluZm9Ob2RlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy50aW1lUmVtYWluaW5nTm9kZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMubWVzc2FnZU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLmFjdGlvbkJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuYWN0aW9uQnV0dG9uLnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5hY3Rpb25CdXR0b24uZGF0YXNldC5jb21tYW5kSWQgPSAnJztcblx0XHR0aGlzLnJlbGVhc2VOb3Rlc0J1dHRvbi5zdHlsZS5tYXJnaW5SaWdodCA9ICcnO1xuXHR9XG5cblx0cHVibGljIHJlbmRlclN0YXRlKHN0YXRlOiBTdGF0ZSkge1xuXHRcdHRoaXMuaGlkZUFsbCgpO1xuXHRcdHN3aXRjaCAoc3RhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuVW5pbml0aWFsaXplZDpcblx0XHRcdFx0dGhpcy5yZW5kZXJVbmluaXRpYWxpemVkKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRGlzYWJsZWQ6XG5cdFx0XHRcdHRoaXMucmVuZGVyRGlzYWJsZWQoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLklkbGU6XG5cdFx0XHRcdHRoaXMucmVuZGVySWRsZShzdGF0ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuQ2hlY2tpbmdGb3JVcGRhdGVzOlxuXHRcdFx0XHR0aGlzLnJlbmRlckNoZWNraW5nRm9yVXBkYXRlcygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkOlxuXHRcdFx0XHR0aGlzLnJlbmRlckF2YWlsYWJsZUZvckRvd25sb2FkKHN0YXRlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5Eb3dubG9hZGluZzpcblx0XHRcdFx0dGhpcy5yZW5kZXJEb3dubG9hZGluZyhzdGF0ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuRG93bmxvYWRlZDpcblx0XHRcdFx0dGhpcy5yZW5kZXJEb3dubG9hZGVkKHN0YXRlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5VcGRhdGluZzpcblx0XHRcdFx0dGhpcy5yZW5kZXJVcGRhdGluZyhzdGF0ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuUmVhZHk6XG5cdFx0XHRcdHRoaXMucmVuZGVyUmVhZHkoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGVUeXBlLk92ZXJ3cml0aW5nOlxuXHRcdFx0XHR0aGlzLnJlbmRlck92ZXJ3cml0aW5nKHN0YXRlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5DYW5jZWxsaW5nOlxuXHRcdFx0XHR0aGlzLnJlbmRlckNhbmNlbGxpbmcoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5SZXN0YXJ0aW5nOlxuXHRcdFx0XHR0aGlzLnJlbmRlclJlc3RhcnRpbmcoc3RhdGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclVuaW5pdGlhbGl6ZWQoKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuaW5pdGlhbGl6aW5nVGl0bGUnLCBcIkluaXRpYWxpemluZ1wiKSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmluaXRpYWxpemluZ01lc3NhZ2UnLCBcIkluaXRpYWxpemluZyB1cGRhdGUgc2VydmljZS4uLlwiKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRpc2FibGVkKHsgcmVhc29uIH06IERpc2FibGVkKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudXBkYXRlc0Rpc2FibGVkVGl0bGUnLCBcIlVwZGF0ZXMgRGlzYWJsZWRcIikpO1xuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cdFx0XHRjYXNlIERpc2FibGVtZW50UmVhc29uLk5vdEJ1aWx0OlxuXHRcdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZGlzYWJsZWROb3RCdWlsdCcsIFwiVXBkYXRlcyBhcmUgbm90IGF2YWlsYWJsZSBmb3IgdGhpcyBidWlsZC5cIiksXG5cdFx0XHRcdFx0Q29kaWNvbi5pbmZvKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERpc2FibGVtZW50UmVhc29uLkRpc2FibGVkQnlFbnZpcm9ubWVudDpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKFxuXHRcdFx0XHRcdGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmRpc2FibGVkQnlFbnZpcm9ubWVudCcsIFwiVXBkYXRlcyBhcmUgZGlzYWJsZWQgYnkgdGhlIC0tZGlzYWJsZS11cGRhdGVzIGNvbW1hbmQgbGluZSBmbGFnLlwiKSxcblx0XHRcdFx0XHRDb2RpY29uLndhcm5pbmcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGlzYWJsZW1lbnRSZWFzb24uTWFudWFsbHlEaXNhYmxlZDpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKFxuXHRcdFx0XHRcdGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmRpc2FibGVkTWFudWFsbHknLCBcIlVwZGF0ZXMgYXJlIG1hbnVhbGx5IGRpc2FibGVkLiBDaGFuZ2UgdGhlIFxcXCJ1cGRhdGUubW9kZVxcXCIgc2V0dGluZyB0byBlbmFibGUuXCIpLFxuXHRcdFx0XHRcdENvZGljb24ud2FybmluZyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEaXNhYmxlbWVudFJlYXNvbi5Qb2xpY3k6XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kaXNhYmxlZEJ5UG9saWN5JywgXCJVcGRhdGVzIGFyZSBkaXNhYmxlZCBieSBvcmdhbml6YXRpb24gcG9saWN5LlwiKSxcblx0XHRcdFx0XHRDb2RpY29uLmluZm8pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGlzYWJsZW1lbnRSZWFzb24uTWlzc2luZ0NvbmZpZ3VyYXRpb246XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kaXNhYmxlZE1pc3NpbmdDb25maWcnLCBcIlVwZGF0ZXMgYXJlIGRpc2FibGVkIGJlY2F1c2Ugbm8gdXBkYXRlIFVSTCBpcyBjb25maWd1cmVkLlwiKSxcblx0XHRcdFx0XHRDb2RpY29uLmluZm8pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGlzYWJsZW1lbnRSZWFzb24uSW52YWxpZENvbmZpZ3VyYXRpb246XG5cdFx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShcblx0XHRcdFx0XHRsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kaXNhYmxlZEludmFsaWRDb25maWcnLCBcIlVwZGF0ZXMgYXJlIGRpc2FibGVkIGJlY2F1c2UgdGhlIHVwZGF0ZSBVUkwgaXMgaW52YWxpZC5cIiksXG5cdFx0XHRcdFx0Q29kaWNvbi5lcnJvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBEaXNhYmxlbWVudFJlYXNvbi5SdW5uaW5nQXNBZG1pbjpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKFxuXHRcdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J3VwZGF0ZVRvb2x0aXAuZGlzYWJsZWRSdW5uaW5nQXNBZG1pbicsXG5cdFx0XHRcdFx0XHRcIlVwZGF0ZXMgYXJlIG5vdCBhdmFpbGFibGUgd2hlbiBydW5uaW5nIGEgdXNlciBpbnN0YWxsIG9mIHswfSBhcyBhZG1pbmlzdHJhdG9yLlwiLFxuXHRcdFx0XHRcdFx0dGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpLFxuXHRcdFx0XHRcdENvZGljb24ud2FybmluZyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmRpc2FibGVkR2VuZXJpYycsIFwiVXBkYXRlcyBhcmUgZGlzYWJsZWQuXCIpLCBDb2RpY29uLndhcm5pbmcpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcklkbGUoeyBlcnJvciwgbm90QXZhaWxhYmxlIH06IElkbGUpIHtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnVwZGF0ZUVycm9yVGl0bGUnLCBcIlVwZGF0ZSBFcnJvclwiKSk7XG5cdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoZXJyb3IsIENvZGljb24uZXJyb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChub3RBdmFpbGFibGUpIHtcblx0XHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLm5vVXBkYXRlQXZhaWxhYmxlVGl0bGUnLCBcIk5vIFVwZGF0ZSBBdmFpbGFibGVcIikpO1xuXHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLm5vVXBkYXRlQXZhaWxhYmxlTWVzc2FnZScsIFwiVGhlcmUgYXJlIG5vIHVwZGF0ZXMgY3VycmVudGx5IGF2YWlsYWJsZS5cIiksIENvZGljb24uaW5mbyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudXBUb0RhdGVUaXRsZScsIFwiVXAgdG8gRGF0ZVwiKSk7XG5cdFx0c3dpdGNoICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3VwZGF0ZS5tb2RlJykpIHtcblx0XHRcdGNhc2UgJ25vbmUnOlxuXHRcdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UobG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuYXV0b1VwZGF0ZU5vbmUnLCBcIkF1dG9tYXRpYyB1cGRhdGVzIGFyZSBkaXNhYmxlZC5cIiksIENvZGljb24ud2FybmluZyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbWFudWFsJzpcblx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmF1dG9VcGRhdGVNYW51YWwnLCBcIkF1dG9tYXRpYyB1cGRhdGVzIHdpbGwgYmUgY2hlY2tlZCBidXQgbm90IGluc3RhbGxlZCBhdXRvbWF0aWNhbGx5LlwiKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc3RhcnQnOlxuXHRcdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UobG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuYXV0b1VwZGF0ZVN0YXJ0JywgXCJVcGRhdGVzIHdpbGwgYmUgYXBwbGllZCBvbiByZXN0YXJ0LlwiKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZGVmYXVsdCc6XG5cdFx0XHRcdGlmICh0aGlzLm1ldGVyZWRDb25uZWN0aW9uU2VydmljZS5pc0Nvbm5lY3Rpb25NZXRlcmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAubWV0ZXJlZENvbm5lY3Rpb25NZXNzYWdlJywgXCJBdXRvbWF0aWMgdXBkYXRlcyBhcmUgcGF1c2VkIGJlY2F1c2UgdGhlIG5ldHdvcmsgY29ubmVjdGlvbiBpcyBtZXRlcmVkLlwiKSxcblx0XHRcdFx0XHRcdENvZGljb24ucmFkaW9Ub3dlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuYXV0b1VwZGF0ZURlZmF1bHQnLCBcIkF1dG9tYXRpYyB1cGRhdGVzIGFyZSBlbmFibGVkLiBIYXBweSBDb2RpbmchXCIpLFxuXHRcdFx0XHRcdFx0Q29kaWNvbi5zbWlsZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hlY2tpbmdGb3JVcGRhdGVzKCkge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmNoZWNraW5nRm9yVXBkYXRlc1RpdGxlJywgXCJDaGVja2luZyBmb3IgVXBkYXRlc1wiKSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmNoZWNraW5nUGxlYXNlV2FpdCcsIFwiQ2hlY2tpbmcgZm9yIHVwZGF0ZXMsIHBsZWFzZSB3YWl0Li4uXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQXZhaWxhYmxlRm9yRG93bmxvYWQoeyB1cGRhdGUgfTogQXZhaWxhYmxlRm9yRG93bmxvYWQpIHtcblx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC51cGRhdGVBdmFpbGFibGVUaXRsZScsIFwiVXBkYXRlIEF2YWlsYWJsZVwiKSwgdXBkYXRlKTtcblx0XHR0aGlzLnJlbmRlckFjdGlvbkJ1dHRvbihsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kb3dubG9hZEJ1dHRvbicsIFwiRG93bmxvYWRcIiksICd1cGRhdGUuZG93bmxvYWROb3cnKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRG93bmxvYWRpbmcoc3RhdGU6IERvd25sb2FkaW5nKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuZG93bmxvYWRpbmdVcGRhdGVUaXRsZScsIFwiRG93bmxvYWRpbmcgVXBkYXRlXCIpLCBzdGF0ZS51cGRhdGUpO1xuXG5cdFx0Y29uc3QgeyBkb3dubG9hZGVkQnl0ZXMsIHRvdGFsQnl0ZXMgfSA9IHN0YXRlO1xuXHRcdGlmIChkb3dubG9hZGVkQnl0ZXMgIT09IHVuZGVmaW5lZCAmJiB0b3RhbEJ5dGVzICE9PSB1bmRlZmluZWQgJiYgdG90YWxCeXRlcyA+IDApIHtcblx0XHRcdGNvbnN0IHBlcmNlbnRhZ2UgPSBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KGRvd25sb2FkZWRCeXRlcywgdG90YWxCeXRlcykgPz8gMDtcblx0XHRcdHRoaXMucHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudGFnZX0lYDtcblx0XHRcdHRoaXMucHJvZ3Jlc3NQZXJjZW50Tm9kZS50ZXh0Q29udGVudCA9IGAke3BlcmNlbnRhZ2V9JWA7XG5cdFx0XHR0aGlzLnByb2dyZXNzU2l6ZU5vZGUudGV4dENvbnRlbnQgPSBgJHtmb3JtYXRCeXRlcyhkb3dubG9hZGVkQnl0ZXMpfSAvICR7Zm9ybWF0Qnl0ZXModG90YWxCeXRlcyl9YDtcblx0XHRcdHRoaXMucHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXG5cdFx0XHRjb25zdCBzcGVlZCA9IGNvbXB1dGVEb3dubG9hZFNwZWVkKHN0YXRlKTtcblx0XHRcdGlmIChzcGVlZCAhPT0gdW5kZWZpbmVkICYmIHNwZWVkID4gMCkge1xuXHRcdFx0XHR0aGlzLnNwZWVkSW5mb05vZGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kb3dubG9hZFNwZWVkJywgJ3swfS9zJywgZm9ybWF0Qnl0ZXMoc3BlZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGltZVJlbWFpbmluZyA9IGNvbXB1dGVEb3dubG9hZFRpbWVSZW1haW5pbmcoc3RhdGUpO1xuXHRcdFx0aWYgKHRpbWVSZW1haW5pbmcgIT09IHVuZGVmaW5lZCAmJiB0aW1lUmVtYWluaW5nID4gMCkge1xuXHRcdFx0XHR0aGlzLnRpbWVSZW1haW5pbmdOb2RlLnRleHRDb250ZW50ID0gYH4ke2Zvcm1hdFRpbWVSZW1haW5pbmcodGltZVJlbWFpbmluZyl9ICR7bG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudGltZVJlbWFpbmluZycsIFwicmVtYWluaW5nXCIpfWA7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZG93bmxvYWRTdGF0c0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kb3dubG9hZGluZ1BsZWFzZVdhaXQnLCBcIkRvd25sb2FkaW5nIHVwZGF0ZSwgcGxlYXNlIHdhaXQuLi5cIikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRG93bmxvYWRlZCh7IHVwZGF0ZSB9OiBEb3dubG9hZGVkKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAudXBkYXRlUmVhZHlUaXRsZScsIFwiVXBkYXRlIGlzIFJlYWR5IHRvIEluc3RhbGxcIiksIHVwZGF0ZSk7XG5cdFx0dGhpcy5yZW5kZXJBY3Rpb25CdXR0b24obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuaW5zdGFsbEJ1dHRvbicsIFwiSW5zdGFsbFwiKSwgJ3VwZGF0ZS5pbnN0YWxsJyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclVwZGF0aW5nKHsgdXBkYXRlLCBjdXJyZW50UHJvZ3Jlc3MsIG1heFByb2dyZXNzIH06IFVwZGF0aW5nKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuaW5zdGFsbGluZ1VwZGF0ZVRpdGxlJywgXCJJbnN0YWxsaW5nIFVwZGF0ZVwiKSwgdXBkYXRlKTtcblxuXHRcdGNvbnN0IHBlcmNlbnRhZ2UgPSBjb21wdXRlUHJvZ3Jlc3NQZXJjZW50KGN1cnJlbnRQcm9ncmVzcywgbWF4UHJvZ3Jlc3MpO1xuXHRcdGlmIChwZXJjZW50YWdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NGaWxsLnN0eWxlLndpZHRoID0gYCR7cGVyY2VudGFnZX0lYDtcblx0XHRcdHRoaXMucHJvZ3Jlc3NQZXJjZW50Tm9kZS50ZXh0Q29udGVudCA9IGAke3BlcmNlbnRhZ2V9JWA7XG5cdFx0XHR0aGlzLnByb2dyZXNzU2l6ZU5vZGUudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMucHJvZ3Jlc3NDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UobG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuaW5zdGFsbGluZ1BsZWFzZVdhaXQnLCBcIkluc3RhbGxpbmcgdXBkYXRlLCBwbGVhc2Ugd2FpdC4uLlwiKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSZWFkeSh7IHVwZGF0ZSB9OiBSZWFkeSkge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3VwZGF0ZS5tb2RlJykgPT09ICdtYW51YWwnKSB7XG5cdFx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC51cGRhdGVJbnN0YWxsZWRUaXRsZScsIFwiVXBkYXRlIEluc3RhbGxlZFwiKSwgdXBkYXRlKTtcblx0XHRcdHRoaXMucmVuZGVyQWN0aW9uQnV0dG9uKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnJlc3RhcnRCdXR0b24nLCBcIlJlc3RhcnRcIiksICd1cGRhdGUucmVzdGFydCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5yZXN0YXJ0VG9VcGRhdGVUaXRsZScsIFwiUmVzdGFydCB0byBVcGRhdGVcIiksIHVwZGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJPdmVyd3JpdGluZyh7IHVwZGF0ZSB9OiBPdmVyd3JpdGluZykge1xuXHRcdHRoaXMucmVuZGVyVGl0bGVBbmRJbmZvKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmRvd25sb2FkaW5nTmV3ZXJVcGRhdGVUaXRsZScsIFwiRG93bmxvYWRpbmcgTmV3ZXIgVXBkYXRlXCIpLCB1cGRhdGUpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5kb3dubG9hZGluZ05ld2VyUGxlYXNlV2FpdCcsIFwiQSBuZXdlciB1cGRhdGUgd2FzIHJlbGVhc2VkLiBEb3dubG9hZGluZywgcGxlYXNlIHdhaXQuLi5cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSZXN0YXJ0aW5nKHsgdXBkYXRlIH06IFJlc3RhcnRpbmcpIHtcblx0XHR0aGlzLnJlbmRlclRpdGxlQW5kSW5mbyhsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5yZXN0YXJ0aW5nVGl0bGUnLCBcIlJlc3RhcnRpbmcgezB9XCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSwgdXBkYXRlKTtcblx0XHR0aGlzLnJlbmRlck1lc3NhZ2UobG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAucmVzdGFydGluZ1BsZWFzZVdhaXQnLCBcIlJlc3RhcnRpbmcgdG8gdXBkYXRlLCBwbGVhc2Ugd2FpdC4uLlwiKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNhbmNlbGxpbmcoKSB7XG5cdFx0dGhpcy5yZW5kZXJUaXRsZUFuZEluZm8obG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuY2FuY2VsbGluZ1RpdGxlJywgXCJDYW5jZWxsaW5nIFVwZGF0ZVwiKSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmNhbmNlbGxpbmdQbGVhc2VXYWl0JywgXCJDYW5jZWxsaW5nIHVwZGF0ZSwgcGxlYXNlIHdhaXQuLi5cIikpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUaXRsZUFuZEluZm8odGl0bGU6IHN0cmluZywgdXBkYXRlPzogSVVwZGF0ZSkge1xuXHRcdHRoaXMudGl0bGVOb2RlLnRleHRDb250ZW50ID0gdGl0bGU7XG5cblx0XHQvLyBMYXRlc3QgdmVyc2lvblxuXHRcdGNvbnN0IHZlcnNpb24gPSB1cGRhdGU/LnByb2R1Y3RWZXJzaW9uO1xuXHRcdGlmICh2ZXJzaW9uKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVDb21taXRJZCA9IHVwZGF0ZS52ZXJzaW9uPy5zdWJzdHJpbmcoMCwgNyk7XG5cdFx0XHR0aGlzLmxhdGVzdFZlcnNpb25Ob2RlLnRleHRDb250ZW50ID0gdXBkYXRlQ29tbWl0SWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgndXBkYXRlVG9vbHRpcC5sYXRlc3RWZXJzaW9uTGFiZWxXaXRoQ29tbWl0JywgXCJMYXRlc3QgVmVyc2lvbjogezB9ICh7MX0pXCIsIHZlcnNpb24sIHVwZGF0ZUNvbW1pdElkKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLmxhdGVzdFZlcnNpb25MYWJlbCcsIFwiTGF0ZXN0IFZlcnNpb246IHswfVwiLCB2ZXJzaW9uKTtcblx0XHRcdHRoaXMubGF0ZXN0VmVyc2lvbkNvcHlWYWx1ZS52YWx1ZSA9IHVwZGF0ZUNvbW1pdElkID8gYCR7dmVyc2lvbn0gKCR7dXBkYXRlLnZlcnNpb259KWAgOiB2ZXJzaW9uO1xuXHRcdFx0dGhpcy5sYXRlc3RWZXJzaW9uTm9kZS5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLmxhdGVzdFZlcnNpb25Db3B5QnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYXRlc3RWZXJzaW9uTm9kZS5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5sYXRlc3RWZXJzaW9uQ29weUJ1dHRvbi50YWJJbmRleCA9IC0xO1xuXHRcdH1cblxuXHRcdC8vIFJlbGVhc2UgZGF0ZVxuXHRcdGNvbnN0IHJlbGVhc2VEYXRlID0gdXBkYXRlPy50aW1lc3RhbXAgPz8gdHJ5UGFyc2VEYXRlKHRoaXMucHJvZHVjdFNlcnZpY2UuZGF0ZSk7XG5cdFx0aWYgKHR5cGVvZiByZWxlYXNlRGF0ZSA9PT0gJ251bWJlcicgJiYgcmVsZWFzZURhdGUgPiAwKSB7XG5cdFx0XHR0aGlzLnJlbGVhc2VEYXRlTm9kZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVUb29sdGlwLnJlbGVhc2VkTGFiZWwnLCBcIlJlbGVhc2VkIHswfVwiLCBmb3JtYXREYXRlKHJlbGVhc2VEYXRlKSk7XG5cdFx0XHR0aGlzLnJlbGVhc2VEYXRlTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVsZWFzZURhdGVOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gUmVsZWFzZSBub3RlcyBidXR0b25cblx0XHR0aGlzLnJlbGVhc2VOb3Rlc1ZlcnNpb24gPSB2ZXJzaW9uID8/IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbjtcblx0XHR0aGlzLnJlbGVhc2VOb3Rlc0J1dHRvbi5zdHlsZS5kaXNwbGF5ID0gdGhpcy5yZWxlYXNlTm90ZXNWZXJzaW9uID8gJycgOiAnbm9uZSc7XG5cdFx0dGhpcy5yZWxlYXNlTm90ZXNCdXR0b24udGFiSW5kZXggPSB0aGlzLnJlbGVhc2VOb3Rlc1ZlcnNpb24gPyAwIDogLTE7XG5cdFx0dGhpcy5yZWxlYXNlTm90ZXNCdXR0b24uc3R5bGUubWFyZ2luUmlnaHQgPSB0aGlzLnJlbGVhc2VOb3Rlc1ZlcnNpb24gPyAnYXV0bycgOiAnJztcblx0XHR0aGlzLmJ1dHRvbkJhci5zdHlsZS5kaXNwbGF5ID0gdGhpcy5yZWxlYXNlTm90ZXNWZXJzaW9uID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFjdGlvbkJ1dHRvbihsYWJlbDogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZykge1xuXHRcdHRoaXMuYWN0aW9uQnV0dG9uLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0dGhpcy5hY3Rpb25CdXR0b24uZGF0YXNldC5jb21tYW5kSWQgPSBjb21tYW5kSWQ7XG5cdFx0dGhpcy5hY3Rpb25CdXR0b24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMuYWN0aW9uQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcsIGljb24/OiBUaGVtZUljb24pIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMubWVzc2FnZU5vZGUpO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRjb25zdCBpY29uTm9kZSA9IGRvbS5hcHBlbmQodGhpcy5tZXNzYWdlTm9kZSwgZG9tLiQoJy5zdGF0ZS1tZXNzYWdlLWljb24nKSk7XG5cdFx0XHRpY29uTm9kZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHR9XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLm1lc3NhZ2VOb2RlLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShtZXNzYWdlKSk7XG5cdFx0dGhpcy5tZXNzYWdlTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVZlcnNpb25Sb3cocGFyZW50OiBIVE1MRWxlbWVudCk6IHsgbGFiZWw6IEhUTUxFbGVtZW50OyBjb3B5VmFsdWU6IHsgdmFsdWU6IHN0cmluZyB9OyBjb3B5QnV0dG9uOiBIVE1MRWxlbWVudCB9IHtcblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5wcm9kdWN0LXZlcnNpb24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJ3NwYW4nKSk7XG5cdFx0Y29uc3QgY29weVZhbHVlID0geyB2YWx1ZTogJycgfTtcblxuXHRcdGNvbnN0IGNvcHlCdXR0b24gPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJ2EuY29weS12ZXJzaW9uLWJ1dHRvbicpKTtcblx0XHRjb3B5QnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRjb3B5QnV0dG9uLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUoJ3VwZGF0ZVRvb2x0aXAuY29weVZlcnNpb24nLCBcIkNvcHlcIik7XG5cdFx0Y29weUJ1dHRvbi50aXRsZSA9IHRpdGxlO1xuXHRcdGNvcHlCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuXG5cdFx0Y29uc3QgY29weUljb24gPSBkb20uYXBwZW5kKGNvcHlCdXR0b24sIGRvbS4kKCcuY29weS1pY29uJykpO1xuXHRcdGNvcHlJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jb3B5KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb3B5QnV0dG9uLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAoY29weVZhbHVlLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoY29weVZhbHVlLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBsYWJlbCwgY29weVZhbHVlLCBjb3B5QnV0dG9uIH07XG5cdH1cblxuXHRwcml2YXRlIHJ1bkNvbW1hbmRBbmRDbG9zZShjb21tYW5kOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCwgLi4uYXJncyk7XG5cdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIs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
