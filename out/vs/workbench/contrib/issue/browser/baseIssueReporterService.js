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
import { $, isHTMLInputElement, isHTMLTextAreaElement, reset } from "../../../../base/browser/dom.js";
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { Button, ButtonWithDropdown, unthemedButtonStyles } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Delayer, RunOnceScheduler } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { groupBy } from "../../../../base/common/collections.js";
import { debounce } from "../../../../base/common/decorators.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isLinuxSnap, isMacintosh } from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { escape } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { Action } from "../../../../base/common/actions.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { getIconsStyleSheet } from "../../../../platform/theme/browser/iconsStyleSheet.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IIssueFormService, IssueType } from "../common/issue.js";
import { normalizeGitHubUrl } from "../common/issueReporterUtil.js";
import { IssueReporterModel } from "./issueReporterModel.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
const MAX_URL_LENGTH = 7500;
const MAX_EXTENSION_DATA_LENGTH = 6e4;
var IssueSource = /* @__PURE__ */ ((IssueSource2) => {
  IssueSource2["VSCode"] = "vscode";
  IssueSource2["Extension"] = "extension";
  IssueSource2["Marketplace"] = "marketplace";
  IssueSource2["Unknown"] = "unknown";
  return IssueSource2;
})(IssueSource || {});
let BaseIssueReporterService = class extends Disposable {
  constructor(disableExtensions, data, os, product, window, isWeb, issueFormService, themeService, fileService, fileDialogService, contextMenuService, authenticationService, openerService) {
    super();
    this.disableExtensions = disableExtensions;
    this.data = data;
    this.os = os;
    this.product = product;
    this.window = window;
    this.isWeb = isWeb;
    this.issueFormService = issueFormService;
    this.themeService = themeService;
    this.fileService = fileService;
    this.fileDialogService = fileDialogService;
    this.contextMenuService = contextMenuService;
    this.authenticationService = authenticationService;
    this.openerService = openerService;
    this.receivedSystemInfo = false;
    this.numberOfSearchResultsDisplayed = 0;
    this.receivedPerformanceInfo = false;
    this.shouldQueueSearch = false;
    this.hasBeenSubmitted = false;
    this.openReporter = false;
    this.loadingExtensionData = false;
    this.selectedExtension = "";
    this.delayedSubmit = new Delayer(300);
    this.nonGitHubIssueUrl = false;
    this.needsUpdate = false;
    this.acknowledged = false;
    const targetExtension = data.extensionId ? data.enabledExtensions.find((extension) => extension.id.toLocaleLowerCase() === data.extensionId?.toLocaleLowerCase()) : void 0;
    this.issueReporterModel = new IssueReporterModel({
      ...data,
      issueType: data.issueType || IssueType.Bug,
      versionInfo: {
        vscodeVersion: `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || "Commit unknown"}, ${product.date || "Date unknown"})`,
        os: `${this.os.type} ${this.os.arch} ${this.os.release}${isLinuxSnap ? " snap" : ""}`
      },
      extensionsDisabled: !!this.disableExtensions,
      fileOnExtension: data.extensionId ? !targetExtension?.isBuiltin : void 0,
      selectedExtension: targetExtension
    });
    this._register(this.authenticationService.onDidChangeSessions(async () => {
      const previousAuthState = !!this.data.githubAccessToken;
      let githubAccessToken = "";
      try {
        const githubSessions = await this.authenticationService.getSessions("github");
        const potentialSessions = githubSessions.filter((session) => session.scopes.includes("repo"));
        githubAccessToken = potentialSessions[0]?.accessToken;
      } catch (e) {
      }
      this.data.githubAccessToken = githubAccessToken;
      const currentAuthState = !!githubAccessToken;
      if (previousAuthState !== currentAuthState) {
        this.updateButtonStates();
      }
    }));
    const fileOnMarketplace = data.issueSource === "marketplace" /* Marketplace */;
    const fileOnProduct = data.issueSource === "vscode" /* VSCode */;
    this.issueReporterModel.update({ fileOnMarketplace, fileOnProduct });
    this.createAction = this._register(new Action("issueReporter.create", localize("create", "Create on GitHub"), void 0, true, async () => {
      this.delayedSubmit.trigger(async () => {
        this.setSubmittingState(true);
        try {
          await this.createIssue(true);
        } finally {
          this.setSubmittingState(false);
        }
      });
    }));
    this.previewAction = this._register(new Action("issueReporter.preview", localize("preview", "Preview on GitHub"), void 0, true, async () => {
      this.delayedSubmit.trigger(async () => {
        this.setSubmittingState(true);
        try {
          await this.createIssue(false);
        } finally {
          this.setSubmittingState(false);
        }
      });
    }));
    this.privateAction = this._register(new Action("issueReporter.privateCreate", localize("privateCreate", "Create Internally"), void 0, true, async () => {
      this.delayedSubmit.trigger(async () => {
        this.setSubmittingState(true);
        try {
          await this.createIssue(true, true);
        } finally {
          this.setSubmittingState(false);
        }
      });
    }));
    const issueTitle = data.issueTitle;
    if (issueTitle) {
      const issueTitleElement = this.getElementById("issue-title");
      if (issueTitleElement) {
        issueTitleElement.value = issueTitle;
      }
    }
    const issueBody = data.issueBody;
    if (issueBody) {
      const description = this.getElementById("description");
      if (description) {
        description.value = issueBody;
        this.issueReporterModel.update({ issueDescription: issueBody });
      }
    }
    if (this.window.document.documentElement.lang !== "en") {
      show(this.getElementById("english"));
    }
    const codiconStyleSheet = createStyleSheet();
    codiconStyleSheet.id = "codiconStyles";
    const iconsStyleSheet = this._register(getIconsStyleSheet(this.themeService));
    function updateAll() {
      codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
    }
    const delayer = new RunOnceScheduler(updateAll, 0);
    this._register(iconsStyleSheet.onDidChange(() => delayer.schedule()));
    delayer.schedule();
    this.handleExtensionData(data.enabledExtensions);
    this.setUpTypes();
    if ((data.data || data.uri) && targetExtension) {
      this.updateExtensionStatus(targetExtension);
    }
    const issueReporterElement = this.getElementById("issue-reporter");
    if (issueReporterElement) {
      this.updateButtonStates();
    }
  }
  render() {
    this.renderBlocks();
  }
  setInitialFocus() {
    const { fileOnExtension } = this.issueReporterModel.getData();
    if (fileOnExtension) {
      const issueTitle = this.window.document.getElementById("issue-title");
      issueTitle?.focus();
    } else {
      const issueType = this.window.document.getElementById("issue-type");
      issueType?.focus();
    }
  }
  updateButtonStates() {
    const issueReporterElement = this.getElementById("issue-reporter");
    if (!issueReporterElement) {
      return;
    }
    let publicElements = this.getElementById("public-elements");
    if (!publicElements) {
      publicElements = document.createElement("div");
      publicElements.id = "public-elements";
      publicElements.classList.add("public-elements");
      issueReporterElement.appendChild(publicElements);
    }
    this.updatePublicGithubButton(publicElements);
    this.updatePublicRepoLink(publicElements);
    let internalElements = this.getElementById("internal-elements");
    if (!internalElements) {
      internalElements = document.createElement("div");
      internalElements.id = "internal-elements";
      internalElements.classList.add("internal-elements");
      internalElements.classList.add("hidden");
      issueReporterElement.appendChild(internalElements);
    }
    let filingRow = this.getElementById("internal-top-row");
    if (!filingRow) {
      filingRow = document.createElement("div");
      filingRow.id = "internal-top-row";
      filingRow.classList.add("internal-top-row");
      internalElements.appendChild(filingRow);
    }
    this.updateInternalFilingNote(filingRow);
    this.updateInternalGithubButton(filingRow);
    this.updateInternalElementsVisibility();
  }
  updateInternalFilingNote(container) {
    let filingNote = this.getElementById("internal-preview-message");
    if (!filingNote) {
      filingNote = document.createElement("span");
      filingNote.id = "internal-preview-message";
      filingNote.classList.add("internal-preview-message");
      container.appendChild(filingNote);
    }
    filingNote.textContent = escape(localize("internalPreviewMessage", "If your copilot debug logs contain private information:"));
  }
  updatePublicGithubButton(container) {
    const issueReporterElement = this.getElementById("issue-reporter");
    if (!issueReporterElement) {
      return;
    }
    if (this.publicGithubButton) {
      this.publicGithubButton.dispose();
    }
    if (!this.acknowledged && this.needsUpdate) {
      this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this.publicGithubButton.label = localize("acknowledge", "Confirm Version Acknowledgement");
      this.publicGithubButton.enabled = false;
    } else if (this.data.githubAccessToken && this.isPreviewEnabled()) {
      this.publicGithubButton = this._register(new ButtonWithDropdown(container, {
        contextMenuProvider: this.contextMenuService,
        actions: [this.previewAction],
        addPrimaryActionToDropdown: false,
        ...unthemedButtonStyles
      }));
      this._register(this.publicGithubButton.onDidClick(() => {
        this.createAction.run();
      }));
      this.publicGithubButton.label = localize("createOnGitHub", "Create on GitHub");
      this.publicGithubButton.enabled = true;
    } else if (this.data.githubAccessToken && !this.isPreviewEnabled()) {
      this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this._register(this.publicGithubButton.onDidClick(() => {
        this.createAction.run();
      }));
      this.publicGithubButton.label = localize("createOnGitHub", "Create on GitHub");
      this.publicGithubButton.enabled = true;
    } else {
      this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this._register(this.publicGithubButton.onDidClick(() => {
        this.previewAction.run();
      }));
      this.publicGithubButton.label = localize("previewOnGitHub", "Preview on GitHub");
      this.publicGithubButton.enabled = true;
    }
    const repoLink = this.getElementById("show-repo-name");
    if (repoLink) {
      container.insertBefore(this.publicGithubButton.element, repoLink);
    }
  }
  updatePublicRepoLink(container) {
    let issueRepoName = this.getElementById("show-repo-name");
    if (!issueRepoName) {
      issueRepoName = document.createElement("a");
      issueRepoName.id = "show-repo-name";
      issueRepoName.classList.add("hidden");
      container.appendChild(issueRepoName);
    }
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    if (selectedExtension && selectedExtension.uri) {
      const urlString = URI.revive(selectedExtension.uri).toString();
      issueRepoName.href = urlString;
      issueRepoName.addEventListener("click", (e) => this.openLink(e));
      issueRepoName.addEventListener("auxclick", (e) => this.openLink(e));
      const gitHubInfo = this.parseGitHubUrl(urlString);
      issueRepoName.textContent = gitHubInfo ? gitHubInfo.owner + "/" + gitHubInfo.repositoryName : urlString;
      Object.assign(issueRepoName.style, {
        alignSelf: "flex-end",
        display: "block",
        fontSize: "13px",
        padding: "4px 0px",
        textDecoration: "none",
        width: "auto"
      });
      show(issueRepoName);
    } else if (issueRepoName) {
      issueRepoName.removeAttribute("style");
      hide(issueRepoName);
    }
  }
  updateInternalGithubButton(container) {
    const issueReporterElement = this.getElementById("issue-reporter");
    if (!issueReporterElement) {
      return;
    }
    if (this.internalGithubButton) {
      this.internalGithubButton.dispose();
    }
    if (this.data.githubAccessToken && this.data.privateUri) {
      this.internalGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this._register(this.internalGithubButton.onDidClick(() => {
        this.privateAction.run();
      }));
      this.internalGithubButton.element.id = "internal-create-btn";
      this.internalGithubButton.element.classList.add("internal-create-subtle");
      this.internalGithubButton.label = localize("createInternally", "Create Internally");
      this.internalGithubButton.enabled = true;
      this.internalGithubButton.setTitle(this.data.privateUri.path.slice(1));
    }
  }
  updateInternalElementsVisibility() {
    const container = this.getElementById("internal-elements");
    if (!container) {
      return;
    }
    if (this.data.githubAccessToken && this.data.privateUri) {
      show(container);
      container.style.display = "";
      if (this.internalGithubButton) {
        this.internalGithubButton.enabled = this.publicGithubButton?.enabled ?? false;
      }
    } else {
      hide(container);
      container.style.display = "none";
    }
  }
  getSubmitButtonElement() {
    if (this.publicGithubButton instanceof ButtonWithDropdown) {
      return this.publicGithubButton.primaryButton.element;
    }
    return this.publicGithubButton.element;
  }
  setSubmittingState(submitting) {
    this.publicGithubButton.enabled = !submitting;
    if (this.internalGithubButton) {
      this.internalGithubButton.enabled = !submitting;
    }
    const buttonEl = this.getSubmitButtonElement();
    if (submitting) {
      const currentLabel = this.publicGithubButton instanceof ButtonWithDropdown ? this.publicGithubButton.primaryButton.label : this.publicGithubButton.label;
      this.preSubmitButtonLabel = typeof currentLabel === "string" ? currentLabel : "";
      this.publicGithubButton.label = localize("submittingIssue", "Submitting...");
      const spinnerIcon = renderIcon(ThemeIcon.modify(Codicon.loading, "spin"));
      buttonEl.prepend(spinnerIcon);
    } else {
      const spinnerEl = buttonEl.querySelector(".codicon-loading");
      spinnerEl?.remove();
      if (this.preSubmitButtonLabel !== void 0) {
        this.publicGithubButton.label = this.preSubmitButtonLabel;
        this.preSubmitButtonLabel = void 0;
      }
    }
  }
  async updateIssueReporterUri(extension) {
    try {
      if (extension.uri) {
        const uri = URI.revive(extension.uri);
        extension.bugsUrl = uri.toString();
      }
    } catch (e) {
      this.renderBlocks();
    }
  }
  handleExtensionData(extensions) {
    const installedExtensions = extensions.filter((x) => !x.isBuiltin);
    const { nonThemes, themes } = groupBy(installedExtensions, (ext) => {
      return ext.isTheme ? "themes" : "nonThemes";
    });
    const numberOfThemeExtesions = (themes && themes.length) ?? 0;
    this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: installedExtensions });
    this.updateExtensionTable(nonThemes ?? [], numberOfThemeExtesions);
    if (this.disableExtensions || installedExtensions.length === 0) {
      this.getElementById("disableExtensions").disabled = true;
    }
    this.updateExtensionSelector(installedExtensions);
  }
  updateExtensionSelector(extensions) {
    const extensionOptions = extensions.map((extension) => {
      return {
        name: extension.displayName || extension.name || "",
        id: extension.id
      };
    });
    extensionOptions.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName > bName) {
        return 1;
      }
      if (aName < bName) {
        return -1;
      }
      return 0;
    });
    const makeOption = (extension, selectedExtension) => {
      const selected = selectedExtension && extension.id === selectedExtension.id;
      return $("option", {
        "value": extension.id,
        "selected": selected || ""
      }, extension.name);
    };
    const extensionsSelector = this.getElementById("extension-selector");
    if (extensionsSelector) {
      const { selectedExtension } = this.issueReporterModel.getData();
      reset(extensionsSelector, this.makeOption("", localize("selectExtension", "Select extension"), true), ...extensionOptions.map((extension) => makeOption(extension, selectedExtension)));
      if (!selectedExtension) {
        extensionsSelector.selectedIndex = 0;
      }
      this.addEventListener("extension-selector", "change", async (e) => {
        this.clearExtensionData();
        const selectedExtensionId = e.target.value;
        this.selectedExtension = selectedExtensionId;
        const extensions2 = this.issueReporterModel.getData().allExtensions;
        const matches = extensions2.filter((extension) => extension.id === selectedExtensionId);
        if (matches.length) {
          this.issueReporterModel.update({ selectedExtension: matches[0] });
          const selectedExtension2 = this.issueReporterModel.getData().selectedExtension;
          if (selectedExtension2) {
            const iconElement = document.createElement("span");
            iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
            this.setLoading(iconElement);
            const openReporterData = await this.sendReporterMenu(selectedExtension2);
            if (openReporterData) {
              if (this.selectedExtension === selectedExtensionId) {
                this.removeLoading(iconElement, true);
                this.data = openReporterData;
              }
            } else {
              if (!this.loadingExtensionData) {
                iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
              }
              this.removeLoading(iconElement);
              this.clearExtensionData();
              selectedExtension2.data = void 0;
              selectedExtension2.uri = void 0;
            }
            if (this.selectedExtension === selectedExtensionId) {
              this.updateExtensionStatus(matches[0]);
              this.openReporter = false;
            }
          } else {
            this.issueReporterModel.update({ selectedExtension: void 0 });
            this.clearSearchResults();
            this.clearExtensionData();
            this.validateSelectedExtension();
            this.updateExtensionStatus(matches[0]);
          }
        }
        this.updateInternalElementsVisibility();
      });
    }
    this.addEventListener("problem-source", "change", (_) => {
      this.clearExtensionData();
      this.validateSelectedExtension();
    });
  }
  async sendReporterMenu(extension) {
    try {
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("sendReporterMenu timed out")), 1e4)
      );
      const data = await Promise.race([
        this.issueFormService.sendReporterMenu(extension.id),
        timeoutPromise
      ]);
      return data;
    } catch (e) {
      console.error(e);
      return void 0;
    }
  }
  updateAcknowledgementState() {
    const acknowledgementCheckbox = this.getElementById("includeAcknowledgement");
    if (acknowledgementCheckbox) {
      this.acknowledged = acknowledgementCheckbox.checked;
      this.updateButtonStates();
    }
  }
  setEventHandlers() {
    ["includeSystemInfo", "includeProcessInfo", "includeWorkspaceInfo", "includeExtensions", "includeExperiments", "includeExtensionData"].forEach((elementId) => {
      this.addEventListener(elementId, "click", (event) => {
        event.stopPropagation();
        this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
      });
    });
    this.addEventListener("includeAcknowledgement", "click", (event) => {
      event.stopPropagation();
      this.updateAcknowledgementState();
    });
    const showInfoElements = this.window.document.getElementsByClassName("showInfo");
    for (let i = 0; i < showInfoElements.length; i++) {
      const showInfo = showInfoElements.item(i);
      showInfo.addEventListener("click", (e) => {
        e.preventDefault();
        const label = e.target;
        if (label) {
          const containingElement = label.parentElement && label.parentElement.parentElement;
          const info = containingElement && containingElement.lastElementChild;
          if (info && info.classList.contains("hidden")) {
            show(info);
            label.textContent = localize("hide", "hide");
          } else {
            hide(info);
            label.textContent = localize("show", "show");
          }
        }
      });
    }
    this.addEventListener("issue-source", "change", (e) => {
      const value = e.target.value;
      const problemSourceHelpText = this.getElementById("problem-source-help-text");
      if (value === "") {
        this.issueReporterModel.update({ fileOnExtension: void 0 });
        show(problemSourceHelpText);
        this.clearSearchResults();
        this.render();
        return;
      } else {
        hide(problemSourceHelpText);
      }
      const descriptionTextArea = this.getElementById("issue-title");
      if (value === "vscode" /* VSCode */) {
        descriptionTextArea.placeholder = localize("vscodePlaceholder", "E.g Workbench is missing problems panel");
      } else if (value === "extension" /* Extension */) {
        descriptionTextArea.placeholder = localize("extensionPlaceholder", "E.g. Missing alt text on extension readme image");
      } else if (value === "marketplace" /* Marketplace */) {
        descriptionTextArea.placeholder = localize("marketplacePlaceholder", "E.g Cannot disable installed extension");
      } else {
        descriptionTextArea.placeholder = localize("undefinedPlaceholder", "Please enter a title");
      }
      let fileOnExtension, fileOnMarketplace, fileOnProduct = false;
      if (value === "extension" /* Extension */) {
        fileOnExtension = true;
      } else if (value === "marketplace" /* Marketplace */) {
        fileOnMarketplace = true;
      } else if (value === "vscode" /* VSCode */) {
        fileOnProduct = true;
      }
      this.issueReporterModel.update({ fileOnExtension, fileOnMarketplace, fileOnProduct });
      this.render();
      const title = this.getElementById("issue-title").value;
      this.searchIssues(title, fileOnExtension, fileOnMarketplace);
    });
    this.addEventListener("description", "input", (e) => {
      const issueDescription = e.target.value;
      this.issueReporterModel.update({ issueDescription });
      if (this.issueReporterModel.fileOnExtension() === false) {
        const title = this.getElementById("issue-title").value;
        this.searchVSCodeIssues(title, issueDescription);
      }
    });
    this.addEventListener("issue-title", "input", (_) => {
      const titleElement = this.getElementById("issue-title");
      if (titleElement) {
        const title = titleElement.value;
        this.issueReporterModel.update({ issueTitle: title });
      }
    });
    this.addEventListener("issue-title", "input", (e) => {
      const title = e.target.value;
      const lengthValidationMessage = this.getElementById("issue-title-length-validation-error");
      const issueUrl = this.getIssueUrl();
      if (title && this.getIssueUrlWithTitle(title, issueUrl).length > MAX_URL_LENGTH) {
        show(lengthValidationMessage);
      } else {
        hide(lengthValidationMessage);
      }
      const issueSource = this.getElementById("issue-source");
      if (!issueSource || issueSource.value === "") {
        return;
      }
      const { fileOnExtension, fileOnMarketplace } = this.issueReporterModel.getData();
      this.searchIssues(title, fileOnExtension, fileOnMarketplace);
    });
    this.addEventListener("disableExtensions", "click", () => {
      this.issueFormService.reloadWithExtensionsDisabled();
    });
    this.addEventListener("extensionBugsLink", "click", (e) => {
      const url = e.target.innerText;
      this.openLink(url);
    });
    this.addEventListener("disableExtensions", "keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === " ") {
        this.issueFormService.reloadWithExtensionsDisabled();
      }
    });
    this.window.document.onkeydown = async (e) => {
      const cmdOrCtrlKey = isMacintosh ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrlKey && e.key === "Enter") {
        this.delayedSubmit.trigger(async () => {
          this.setSubmittingState(true);
          try {
            if (await this.createIssue()) {
              this.close();
            }
          } finally {
            this.setSubmittingState(false);
          }
        });
      }
      if (cmdOrCtrlKey && e.key === "w") {
        e.stopPropagation();
        e.preventDefault();
        const issueTitle = this.getElementById("issue-title").value;
        const { issueDescription } = this.issueReporterModel.getData();
        if (!this.hasBeenSubmitted && (issueTitle || issueDescription)) {
          this.issueFormService.showConfirmCloseDialog();
        } else {
          this.close();
        }
      }
      if (isMacintosh) {
        if (cmdOrCtrlKey && e.key === "a" && e.target) {
          if (isHTMLInputElement(e.target) || isHTMLTextAreaElement(e.target)) {
            e.target.select();
          }
        }
      }
    };
    this.addEventListener("review-guidance-help-text", "click", (e) => {
      const target = e.target;
      if (target.tagName === "A" && target.getAttribute("target") === "_blank") {
        this.openLink(e);
      }
    });
  }
  updatePerformanceInfo(info) {
    this.issueReporterModel.update(info);
    this.receivedPerformanceInfo = true;
    const state = this.issueReporterModel.getData();
    this.updateProcessInfo(state);
    this.updateWorkspaceInfo(state);
    this.updateButtonStates();
  }
  isPreviewEnabled() {
    const issueType = this.issueReporterModel.getData().issueType;
    if (this.loadingExtensionData) {
      return false;
    }
    if (this.isWeb) {
      if (issueType === IssueType.FeatureRequest || issueType === IssueType.PerformanceIssue || issueType === IssueType.Bug) {
        return true;
      }
    } else {
      if (issueType === IssueType.Bug && this.receivedSystemInfo) {
        return true;
      }
      if (issueType === IssueType.PerformanceIssue && this.receivedSystemInfo && this.receivedPerformanceInfo) {
        return true;
      }
      if (issueType === IssueType.FeatureRequest) {
        return true;
      }
    }
    return false;
  }
  getExtensionRepositoryUrl() {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    return selectedExtension && selectedExtension.repositoryUrl;
  }
  getExtensionBugsUrl() {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    return selectedExtension && selectedExtension.bugsUrl;
  }
  searchVSCodeIssues(title, issueDescription) {
    if (title) {
      this.searchDuplicates(title, issueDescription);
    } else {
      this.clearSearchResults();
    }
  }
  searchIssues(title, fileOnExtension, fileOnMarketplace) {
    if (fileOnExtension) {
      return this.searchExtensionIssues(title);
    }
    if (fileOnMarketplace) {
      return this.searchMarketplaceIssues(title);
    }
    const description = this.issueReporterModel.getData().issueDescription;
    this.searchVSCodeIssues(title, description);
  }
  searchExtensionIssues(title) {
    const url = this.getExtensionGitHubUrl();
    if (title) {
      const matches = /^https?:\/\/github\.com\/(.*)/.exec(url);
      if (matches && matches.length) {
        const repo = matches[1];
        return this.searchGitHub(repo, title);
      }
      if (this.issueReporterModel.getData().selectedExtension) {
        this.clearSearchResults();
        return this.displaySearchResults([]);
      }
    }
    this.clearSearchResults();
  }
  searchMarketplaceIssues(title) {
    if (title) {
      const gitHubInfo = this.parseGitHubUrl(this.product.reportMarketplaceIssueUrl);
      if (gitHubInfo) {
        return this.searchGitHub(`${gitHubInfo.owner}/${gitHubInfo.repositoryName}`, title);
      }
    }
  }
  async close() {
    await this.issueFormService.closeReporter();
  }
  clearSearchResults() {
    const similarIssues = this.getElementById("similar-issues");
    similarIssues.innerText = "";
    this.numberOfSearchResultsDisplayed = 0;
  }
  searchGitHub(repo, title) {
    const query = `is:issue+repo:${repo}+${title}`;
    const similarIssues = this.getElementById("similar-issues");
    fetch(`https://api.github.com/search/issues?q=${query}`).then((response) => {
      response.json().then((result) => {
        similarIssues.innerText = "";
        if (result && result.items) {
          this.displaySearchResults(result.items);
        }
      }).catch((_) => {
        console.warn("Timeout or query limit exceeded");
      });
    }).catch((_) => {
      console.warn("Error fetching GitHub issues");
    });
  }
  searchDuplicates(title, body) {
    const url = "https://vscode-probot.westus.cloudapp.azure.com:7890/duplicate_candidates";
    const init = {
      method: "POST",
      body: JSON.stringify({
        title,
        body
      }),
      headers: new Headers({
        "Content-Type": "application/json"
      })
    };
    fetch(url, init).then((response) => {
      response.json().then((result) => {
        this.clearSearchResults();
        if (result && result.candidates) {
          this.displaySearchResults(result.candidates);
        } else {
          throw new Error("Unexpected response, no candidates property");
        }
      }).catch((_) => {
      });
    }).catch((_) => {
    });
  }
  displaySearchResults(results) {
    const similarIssues = this.getElementById("similar-issues");
    if (results.length) {
      const issues = $("div.issues-container");
      const issuesText = $("div.list-title");
      issuesText.textContent = localize("similarIssues", "Similar issues");
      this.numberOfSearchResultsDisplayed = results.length < 5 ? results.length : 5;
      for (let i = 0; i < this.numberOfSearchResultsDisplayed; i++) {
        const issue = results[i];
        const link = $("a.issue-link", { href: issue.html_url });
        link.textContent = issue.title;
        link.title = issue.title;
        link.addEventListener("click", (e) => this.openLink(e));
        link.addEventListener("auxclick", (e) => this.openLink(e));
        let issueState;
        let item;
        if (issue.state) {
          issueState = $("span.issue-state");
          const issueIcon = $("span.issue-icon");
          issueIcon.appendChild(renderIcon(issue.state === "open" ? Codicon.issueOpened : Codicon.issueClosed));
          const issueStateLabel = $("span.issue-state.label");
          issueStateLabel.textContent = issue.state === "open" ? localize("open", "Open") : localize("closed", "Closed");
          issueState.title = issue.state === "open" ? localize("open", "Open") : localize("closed", "Closed");
          issueState.appendChild(issueIcon);
          issueState.appendChild(issueStateLabel);
          item = $("div.issue", void 0, issueState, link);
        } else {
          item = $("div.issue", void 0, link);
        }
        issues.appendChild(item);
      }
      similarIssues.appendChild(issuesText);
      similarIssues.appendChild(issues);
    }
  }
  setUpTypes() {
    const makeOption = (issueType2, description) => $("option", { "value": issueType2.valueOf() }, escape(description));
    const typeSelect = this.getElementById("issue-type");
    const { issueType } = this.issueReporterModel.getData();
    reset(
      typeSelect,
      makeOption(IssueType.Bug, localize("bugReporter", "Bug Report")),
      makeOption(IssueType.FeatureRequest, localize("featureRequest", "Feature Request")),
      makeOption(IssueType.PerformanceIssue, localize("performanceIssue", "Performance Issue (freeze, slow, crash)"))
    );
    typeSelect.value = issueType.toString();
    this.setSourceOptions();
  }
  makeOption(value, description, disabled) {
    const option = document.createElement("option");
    option.disabled = disabled;
    option.value = value;
    option.textContent = description;
    return option;
  }
  setSourceOptions() {
    const sourceSelect = this.getElementById("issue-source");
    const { issueType, fileOnExtension, selectedExtension, fileOnMarketplace, fileOnProduct } = this.issueReporterModel.getData();
    let selected = sourceSelect.selectedIndex;
    if (selected === -1) {
      if (fileOnExtension !== void 0) {
        selected = fileOnExtension ? 2 : 1;
      } else if (selectedExtension?.isBuiltin) {
        selected = 1;
      } else if (fileOnMarketplace) {
        selected = 3;
      } else if (fileOnProduct) {
        selected = 1;
      }
    }
    sourceSelect.innerText = "";
    sourceSelect.append(this.makeOption("", localize("selectSource", "Select source"), true));
    sourceSelect.append(this.makeOption("vscode" /* VSCode */, localize("vscode", "Visual Studio Code"), false));
    sourceSelect.append(this.makeOption("extension" /* Extension */, localize("extension", "A VS Code extension"), false));
    if (this.product.reportMarketplaceIssueUrl) {
      sourceSelect.append(this.makeOption("marketplace" /* Marketplace */, localize("marketplace", "Extensions Marketplace"), false));
    }
    if (issueType !== IssueType.FeatureRequest) {
      sourceSelect.append(this.makeOption("unknown" /* Unknown */, localize("unknown", "Don't know"), false));
    }
    if (selected !== -1 && selected < sourceSelect.options.length) {
      sourceSelect.selectedIndex = selected;
    } else {
      sourceSelect.selectedIndex = 0;
      hide(this.getElementById("problem-source-help-text"));
    }
  }
  async renderBlocks() {
    const { issueType, fileOnExtension, fileOnMarketplace, selectedExtension } = this.issueReporterModel.getData();
    const blockContainer = this.getElementById("block-container");
    const systemBlock = this.window.document.querySelector(".block-system");
    const processBlock = this.window.document.querySelector(".block-process");
    const workspaceBlock = this.window.document.querySelector(".block-workspace");
    const extensionsBlock = this.window.document.querySelector(".block-extensions");
    const experimentsBlock = this.window.document.querySelector(".block-experiments");
    const extensionDataBlock = this.window.document.querySelector(".block-extension-data");
    const problemSource = this.getElementById("problem-source");
    const descriptionTitle = this.getElementById("issue-description-label");
    const descriptionSubtitle = this.getElementById("issue-description-subtitle");
    const extensionSelector = this.getElementById("extension-selection");
    const downloadExtensionDataLink = this.getElementById("extension-data-download");
    const titleTextArea = this.getElementById("issue-title-container");
    const descriptionTextArea = this.getElementById("description");
    const extensionDataTextArea = this.getElementById("extension-data");
    hide(blockContainer);
    hide(systemBlock);
    hide(processBlock);
    hide(workspaceBlock);
    hide(extensionsBlock);
    hide(experimentsBlock);
    hide(extensionSelector);
    hide(extensionDataTextArea);
    hide(extensionDataBlock);
    hide(downloadExtensionDataLink);
    show(problemSource);
    show(titleTextArea);
    show(descriptionTextArea);
    if (fileOnExtension) {
      show(extensionSelector);
    }
    const extensionData = this.issueReporterModel.getData().extensionData;
    if (extensionData && extensionData.length > MAX_EXTENSION_DATA_LENGTH) {
      show(downloadExtensionDataLink);
      const date = /* @__PURE__ */ new Date();
      const formattedDate = date.toISOString().split("T")[0];
      const formattedTime = date.toTimeString().split(" ")[0].replace(/:/g, "-");
      const fileName = `extensionData_${formattedDate}_${formattedTime}.md`;
      const handleLinkClick = async () => {
        const downloadPath = await this.fileDialogService.showSaveDialog({
          title: localize("saveExtensionData", "Save Extension Data"),
          availableFileSystems: [Schemas.file],
          defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), fileName)
        });
        if (downloadPath) {
          await this.fileService.writeFile(downloadPath, VSBuffer.fromString(extensionData));
        }
      };
      downloadExtensionDataLink.addEventListener("click", handleLinkClick);
      this._register({
        dispose: () => downloadExtensionDataLink.removeEventListener("click", handleLinkClick)
      });
    }
    if (selectedExtension && this.nonGitHubIssueUrl) {
      hide(titleTextArea);
      hide(descriptionTextArea);
      reset(descriptionTitle, localize("handlesIssuesElsewhere", "This extension handles issues outside of VS Code"));
      reset(descriptionSubtitle, localize("elsewhereDescription", "The '{0}' extension prefers to use an external issue reporter. To be taken to that issue reporting experience, click the button below.", selectedExtension.displayName));
      this.publicGithubButton.label = localize("openIssueReporter", "Open External Issue Reporter");
      return;
    }
    if (fileOnExtension && selectedExtension?.data) {
      const data = selectedExtension?.data;
      extensionDataTextArea.innerText = data.toString();
      extensionDataTextArea.readOnly = true;
      show(extensionDataBlock);
    }
    if (fileOnExtension && this.openReporter) {
      extensionDataTextArea.readOnly = true;
      setTimeout(() => {
        if (this.openReporter) {
          show(extensionDataBlock);
        }
      }, 100);
      show(extensionDataBlock);
    }
    if (issueType === IssueType.Bug) {
      if (!fileOnMarketplace) {
        show(blockContainer);
        show(systemBlock);
        show(experimentsBlock);
        if (!fileOnExtension) {
          show(extensionsBlock);
        }
      }
      reset(descriptionTitle, localize("stepsToReproduce", "Steps to Reproduce") + " ", $("span.required-input", void 0, "*"));
      reset(descriptionSubtitle, localize("bugDescription", "Share the steps needed to reliably reproduce the problem. Please include actual and expected results. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
    } else if (issueType === IssueType.PerformanceIssue) {
      if (!fileOnMarketplace) {
        show(blockContainer);
        show(systemBlock);
        show(processBlock);
        show(workspaceBlock);
        show(experimentsBlock);
      }
      if (fileOnExtension) {
        show(extensionSelector);
      } else if (!fileOnMarketplace) {
        show(extensionsBlock);
      }
      reset(descriptionTitle, localize("stepsToReproduce", "Steps to Reproduce") + " ", $("span.required-input", void 0, "*"));
      reset(descriptionSubtitle, localize("performanceIssueDesciption", "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
    } else if (issueType === IssueType.FeatureRequest) {
      reset(descriptionTitle, localize("description", "Description") + " ", $("span.required-input", void 0, "*"));
      reset(descriptionSubtitle, localize("featureRequestDescription", "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
    }
  }
  validateInput(inputId) {
    const inputElement = this.getElementById(inputId);
    const inputValidationMessage = this.getElementById(`${inputId}-empty-error`);
    const descriptionShortMessage = this.getElementById(`description-short-error`);
    if (inputId === "description" && this.nonGitHubIssueUrl && this.data.extensionId) {
      return true;
    } else if (!inputElement.value) {
      inputElement.classList.add("invalid-input");
      inputValidationMessage?.classList.remove("hidden");
      descriptionShortMessage?.classList.add("hidden");
      return false;
    } else if (inputId === "description" && inputElement.value.length < 10) {
      inputElement.classList.add("invalid-input");
      descriptionShortMessage?.classList.remove("hidden");
      inputValidationMessage?.classList.add("hidden");
      return false;
    } else {
      inputElement.classList.remove("invalid-input");
      inputValidationMessage?.classList.add("hidden");
      if (inputId === "description") {
        descriptionShortMessage?.classList.add("hidden");
      }
      return true;
    }
  }
  validateInputs() {
    let isValid = true;
    ["issue-title", "description", "issue-source"].forEach((elementId) => {
      isValid = this.validateInput(elementId) && isValid;
    });
    if (this.issueReporterModel.fileOnExtension()) {
      isValid = this.validateInput("extension-selector") && isValid;
    }
    return isValid;
  }
  async submitToGitHub(issueTitle, issueBody, gitHubDetails) {
    const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
    const init = {
      method: "POST",
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody
      }),
      headers: new Headers({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.data.githubAccessToken}`,
        "User-Agent": "request"
      })
    };
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error("Invalid GitHub URL provided.");
      return false;
    }
    const result = await response.json();
    await this.openLink(result.html_url);
    this.close();
    return true;
  }
  async createIssue(shouldCreate, privateUri) {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    if (this.nonGitHubIssueUrl) {
      const url2 = this.getExtensionBugsUrl();
      if (url2) {
        this.hasBeenSubmitted = true;
        return true;
      }
    }
    if (!this.validateInputs()) {
      const invalidInput = this.window.document.getElementsByClassName("invalid-input");
      if (invalidInput.length) {
        invalidInput[0].focus();
      }
      this.addEventListener("issue-title", "input", (_) => {
        this.validateInput("issue-title");
      });
      this.addEventListener("description", "input", (_) => {
        this.validateInput("description");
      });
      this.addEventListener("issue-source", "change", (_) => {
        this.validateInput("issue-source");
      });
      if (this.issueReporterModel.fileOnExtension()) {
        this.addEventListener("extension-selector", "change", (_) => {
          this.validateInput("extension-selector");
        });
      }
      return false;
    }
    this.hasBeenSubmitted = true;
    const issueTitle = this.getElementById("issue-title").value;
    const issueBody = this.issueReporterModel.serialize();
    let issueUrl = privateUri ? this.getPrivateIssueUrl() : this.getIssueUrl();
    if (!issueUrl) {
      console.error(`No ${privateUri ? "private " : ""}issue url found`);
      return false;
    }
    if (selectedExtension?.uri) {
      const uri = URI.revive(selectedExtension.uri);
      issueUrl = uri.toString();
    }
    const gitHubDetails = this.parseGitHubUrl(issueUrl);
    if (this.data.githubAccessToken && gitHubDetails && shouldCreate) {
      return this.submitToGitHub(issueTitle, issueBody, gitHubDetails);
    }
    const baseUrl = this.getIssueUrlWithTitle(this.getElementById("issue-title").value, issueUrl);
    let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;
    url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
    if (url.length > MAX_URL_LENGTH) {
      try {
        url = await this.writeToClipboard(baseUrl, issueBody);
        url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
      } catch (_) {
        console.error("Writing to clipboard failed");
        return false;
      }
    }
    await this.openLink(url);
    return true;
  }
  async writeToClipboard(baseUrl, issueBody) {
    const shouldWrite = await this.issueFormService.showClipboardDialog();
    if (!shouldWrite) {
      throw new CancellationError();
    }
    return baseUrl + `&body=${encodeURIComponent(localize("pasteData", "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
  }
  addTemplateToUrl(baseUrl, owner, repositoryName) {
    const isVscode = this.issueReporterModel.getData().fileOnProduct;
    const isMicrosoft = owner?.toLowerCase() === "microsoft";
    const needsTemplate = isVscode || isMicrosoft && (repositoryName === "vscode" || repositoryName === "vscode-python");
    if (needsTemplate) {
      try {
        const url = new URL(baseUrl);
        url.searchParams.set("template", "bug_report.md");
        return url.toString();
      } catch {
        return baseUrl + "&template=bug_report.md";
      }
    }
    return baseUrl;
  }
  getIssueUrl() {
    return this.issueReporterModel.fileOnExtension() ? this.getExtensionGitHubUrl() : this.issueReporterModel.getData().fileOnMarketplace ? this.product.reportMarketplaceIssueUrl : this.product.reportIssueUrl;
  }
  // for when command 'workbench.action.openIssueReporter' passes along a
  // `privateUri` UriComponents value
  getPrivateIssueUrl() {
    return URI.revive(this.data.privateUri)?.toString();
  }
  parseGitHubUrl(url) {
    const match = /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*).*/.exec(url);
    if (match && match.length) {
      return {
        owner: match[1],
        repositoryName: match[2]
      };
    } else {
      console.error("No GitHub issues match");
    }
    return void 0;
  }
  getExtensionGitHubUrl() {
    let repositoryUrl = "";
    const bugsUrl = this.getExtensionBugsUrl();
    const extensionUrl = this.getExtensionRepositoryUrl();
    if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?$/)) {
      repositoryUrl = normalizeGitHubUrl(bugsUrl);
    } else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)$/)) {
      repositoryUrl = normalizeGitHubUrl(extensionUrl);
    } else {
      this.nonGitHubIssueUrl = true;
      repositoryUrl = bugsUrl || extensionUrl || "";
    }
    return repositoryUrl;
  }
  getIssueUrlWithTitle(issueTitle, repositoryUrl) {
    if (this.issueReporterModel.fileOnExtension()) {
      repositoryUrl = repositoryUrl + "/issues/new";
    }
    const queryStringPrefix = repositoryUrl.indexOf("?") === -1 ? "?" : "&";
    return `${repositoryUrl}${queryStringPrefix}title=${encodeURIComponent(issueTitle)}`;
  }
  clearExtensionData() {
    this.nonGitHubIssueUrl = false;
    this.issueReporterModel.update({ extensionData: void 0 });
    this.data.issueBody = this.data.issueBody || "";
    this.data.data = void 0;
    this.data.uri = void 0;
    this.data.privateUri = void 0;
  }
  async updateExtensionStatus(extension) {
    this.issueReporterModel.update({ selectedExtension: extension });
    const template = this.data.issueBody;
    if (template) {
      const descriptionTextArea = this.getElementById("description");
      const descriptionText = descriptionTextArea.value;
      if (descriptionText === "" || !descriptionText.includes(template.toString())) {
        const fullTextArea = descriptionText + (descriptionText === "" ? "" : "\n") + template.toString();
        descriptionTextArea.value = fullTextArea;
        this.issueReporterModel.update({ issueDescription: fullTextArea });
      }
    }
    const data = this.data.data;
    if (data) {
      this.issueReporterModel.update({ extensionData: data });
      extension.data = data;
      const extensionDataBlock = this.window.document.querySelector(".block-extension-data");
      show(extensionDataBlock);
      this.renderBlocks();
    }
    const uri = this.data.uri;
    if (uri) {
      extension.uri = uri;
      this.updateIssueReporterUri(extension);
    }
    this.validateSelectedExtension();
    const title = this.getElementById("issue-title").value;
    this.searchExtensionIssues(title);
    this.updateButtonStates();
    this.renderBlocks();
  }
  validateSelectedExtension() {
    const extensionValidationMessage = this.getElementById("extension-selection-validation-error");
    const extensionValidationNoUrlsMessage = this.getElementById("extension-selection-validation-error-no-url");
    hide(extensionValidationMessage);
    hide(extensionValidationNoUrlsMessage);
    const extension = this.issueReporterModel.getData().selectedExtension;
    if (!extension) {
      this.publicGithubButton.enabled = true;
      return;
    }
    if (this.loadingExtensionData) {
      return;
    }
    const hasValidGitHubUrl = this.getExtensionGitHubUrl();
    if (hasValidGitHubUrl) {
      this.publicGithubButton.enabled = true;
    } else {
      this.setExtensionValidationMessage();
      this.publicGithubButton.enabled = false;
    }
  }
  setLoading(element) {
    this.openReporter = true;
    this.loadingExtensionData = true;
    this.updateButtonStates();
    const extensionDataCaption = this.getElementById("extension-id");
    hide(extensionDataCaption);
    const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll(".ext-parens"));
    extensionDataCaption2.forEach((extensionDataCaption22) => hide(extensionDataCaption22));
    const showLoading = this.getElementById("ext-loading");
    show(showLoading);
    while (showLoading.firstChild) {
      showLoading.firstChild.remove();
    }
    showLoading.append(element);
    this.renderBlocks();
  }
  removeLoading(element, fromReporter = false) {
    this.openReporter = fromReporter;
    this.loadingExtensionData = false;
    this.updateButtonStates();
    const extensionDataCaption = this.getElementById("extension-id");
    show(extensionDataCaption);
    const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll(".ext-parens"));
    extensionDataCaption2.forEach((extensionDataCaption22) => show(extensionDataCaption22));
    const hideLoading = this.getElementById("ext-loading");
    hide(hideLoading);
    if (hideLoading.firstChild) {
      element.remove();
    }
    this.renderBlocks();
  }
  setExtensionValidationMessage() {
    const extensionValidationMessage = this.getElementById("extension-selection-validation-error");
    const extensionValidationNoUrlsMessage = this.getElementById("extension-selection-validation-error-no-url");
    const bugsUrl = this.getExtensionBugsUrl();
    if (bugsUrl) {
      show(extensionValidationMessage);
      const link = this.getElementById("extensionBugsLink");
      link.textContent = bugsUrl;
      return;
    }
    const extensionUrl = this.getExtensionRepositoryUrl();
    if (extensionUrl) {
      show(extensionValidationMessage);
      const link = this.getElementById("extensionBugsLink");
      link.textContent = extensionUrl;
      return;
    }
    show(extensionValidationNoUrlsMessage);
  }
  updateProcessInfo(state) {
    const target = this.window.document.querySelector(".block-process .block-info");
    if (target) {
      reset(target, $("code", void 0, state.processInfo ?? ""));
    }
  }
  updateWorkspaceInfo(state) {
    this.window.document.querySelector(".block-workspace .block-info code").textContent = "\n" + state.workspaceInfo;
  }
  updateExtensionTable(extensions, numThemeExtensions) {
    const target = this.window.document.querySelector(".block-extensions .block-info");
    if (target) {
      if (this.disableExtensions) {
        reset(target, localize("disabledExtensions", "Extensions are disabled"));
        return;
      }
      const themeExclusionStr = numThemeExtensions ? `
(${numThemeExtensions} theme extensions excluded)` : "";
      extensions = extensions || [];
      if (!extensions.length) {
        target.innerText = "Extensions: none" + themeExclusionStr;
        return;
      }
      reset(target, this.getExtensionTableHtml(extensions), document.createTextNode(themeExclusionStr));
    }
  }
  getExtensionTableHtml(extensions) {
    return $(
      "table",
      void 0,
      $(
        "tr",
        void 0,
        $("th", void 0, "Extension"),
        $("th", void 0, "Author (truncated)"),
        $("th", void 0, "Version")
      ),
      ...extensions.map((extension) => $(
        "tr",
        void 0,
        $("td", void 0, extension.name),
        $("td", void 0, extension.publisher?.substr(0, 3) ?? "N/A"),
        $("td", void 0, extension.version)
      ))
    );
  }
  async openLink(eventOrUrl) {
    if (typeof eventOrUrl === "string") {
      await this.openerService.open(eventOrUrl, { openExternal: true });
    } else {
      const event = eventOrUrl;
      event.preventDefault();
      event.stopPropagation();
      if (event.which < 3) {
        await this.openerService.open(event.target.href, { openExternal: true });
      }
    }
  }
  getElementById(elementId) {
    const element = this.window.document.getElementById(elementId);
    if (element) {
      return element;
    } else {
      return void 0;
    }
  }
  addEventListener(elementId, eventType, handler) {
    const element = this.getElementById(elementId);
    element?.addEventListener(eventType, handler);
  }
};
__decorateClass([
  debounce(300)
], BaseIssueReporterService.prototype, "searchGitHub", 1);
__decorateClass([
  debounce(300)
], BaseIssueReporterService.prototype, "searchDuplicates", 1);
BaseIssueReporterService = __decorateClass([
  __decorateParam(6, IIssueFormService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IFileDialogService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IAuthenticationService),
  __decorateParam(12, IOpenerService)
], BaseIssueReporterService);
function hide(el) {
  el?.classList.add("hidden");
}
function show(el) {
  el?.classList.remove("hidden");
}
export {
  BaseIssueReporterService,
  hide,
  show
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxicm93c2VyXFxiYXNlSXNzdWVSZXBvcnRlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgJCwgaXNIVE1MSW5wdXRFbGVtZW50LCBpc0hUTUxUZXh0QXJlYUVsZW1lbnQsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uV2l0aERyb3Bkb3duLCB1bnRoZW1lZEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRGVsYXllciwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNMaW51eFNuYXAsIGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBlc2NhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGdldEljb25zU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvaWNvbnNTdHlsZVNoZWV0LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJc3N1ZUZvcm1TZXJ2aWNlLCBJc3N1ZVJlcG9ydGVyRGF0YSwgSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEsIElzc3VlVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9pc3N1ZS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVHaXRIdWJVcmwgfSBmcm9tICcuLi9jb21tb24vaXNzdWVSZXBvcnRlclV0aWwuanMnO1xuaW1wb3J0IHsgSXNzdWVSZXBvcnRlck1vZGVsLCBJc3N1ZVJlcG9ydGVyRGF0YSBhcyBJc3N1ZVJlcG9ydGVyTW9kZWxEYXRhIH0gZnJvbSAnLi9pc3N1ZVJlcG9ydGVyTW9kZWwuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5cbmNvbnN0IE1BWF9VUkxfTEVOR1RIID0gNzUwMDtcblxuLy8gR2l0aHViIEFQSSBhbmQgaXNzdWVzIG9uIHdlYiBoYXMgYSBsaW1pdCBvZiA2NTUzNi4gSWYgZXh0ZW5zaW9uIGRhdGEgaXMgdG9vIGxhcmdlLCB3ZSB3aWxsIGFsbG93IHVzZXJzIHRvIGRvd25sYW9kIGFuZCBhdHRhY2ggaXQgYXMgYSBmaWxlLlxuLy8gV2Ugcm91bmQgZG93biB0byBiZSBzYWZlLlxuLy8gcmVmIGh0dHBzOi8vZ2l0aHViLmNvbS9naXRodWIvaXNzdWVzL2lzc3Vlcy8xMjg1OFxuXG5jb25zdCBNQVhfRVhURU5TSU9OX0RBVEFfTEVOR1RIID0gNjAwMDA7XG5cbmludGVyZmFjZSBTZWFyY2hSZXN1bHQge1xuXHRodG1sX3VybDogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRzdGF0ZT86IHN0cmluZztcbn1cblxuZW51bSBJc3N1ZVNvdXJjZSB7XG5cdFZTQ29kZSA9ICd2c2NvZGUnLFxuXHRFeHRlbnNpb24gPSAnZXh0ZW5zaW9uJyxcblx0TWFya2V0cGxhY2UgPSAnbWFya2V0cGxhY2UnLFxuXHRVbmtub3duID0gJ3Vua25vd24nXG59XG5cblxuZXhwb3J0IGNsYXNzIEJhc2VJc3N1ZVJlcG9ydGVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgaXNzdWVSZXBvcnRlck1vZGVsOiBJc3N1ZVJlcG9ydGVyTW9kZWw7XG5cdHB1YmxpYyByZWNlaXZlZFN5c3RlbUluZm8gPSBmYWxzZTtcblx0cHVibGljIG51bWJlck9mU2VhcmNoUmVzdWx0c0Rpc3BsYXllZCA9IDA7XG5cdHB1YmxpYyByZWNlaXZlZFBlcmZvcm1hbmNlSW5mbyA9IGZhbHNlO1xuXHRwdWJsaWMgc2hvdWxkUXVldWVTZWFyY2ggPSBmYWxzZTtcblx0cHVibGljIGhhc0JlZW5TdWJtaXR0ZWQgPSBmYWxzZTtcblx0cHVibGljIG9wZW5SZXBvcnRlciA9IGZhbHNlO1xuXHRwdWJsaWMgbG9hZGluZ0V4dGVuc2lvbkRhdGEgPSBmYWxzZTtcblx0cHVibGljIHNlbGVjdGVkRXh0ZW5zaW9uID0gJyc7XG5cdHB1YmxpYyBkZWxheWVkU3VibWl0ID0gbmV3IERlbGF5ZXI8dm9pZD4oMzAwKTtcblx0cHVibGljIHB1YmxpY0dpdGh1YkJ1dHRvbiE6IEJ1dHRvbiB8IEJ1dHRvbldpdGhEcm9wZG93bjtcblx0cHVibGljIGludGVybmFsR2l0aHViQnV0dG9uITogQnV0dG9uIHwgQnV0dG9uV2l0aERyb3Bkb3duO1xuXHRwdWJsaWMgbm9uR2l0SHViSXNzdWVVcmwgPSBmYWxzZTtcblx0cHVibGljIG5lZWRzVXBkYXRlID0gZmFsc2U7XG5cdHB1YmxpYyBhY2tub3dsZWRnZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBjcmVhdGVBY3Rpb246IEFjdGlvbjtcblx0cHJpdmF0ZSBwcmV2aWV3QWN0aW9uOiBBY3Rpb247XG5cdHByaXZhdGUgcHJpdmF0ZUFjdGlvbjogQWN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBkaXNhYmxlRXh0ZW5zaW9uczogYm9vbGVhbixcblx0XHRwdWJsaWMgZGF0YTogSXNzdWVSZXBvcnRlckRhdGEsXG5cdFx0cHVibGljIG9zOiB7XG5cdFx0XHR0eXBlOiBzdHJpbmc7XG5cdFx0XHRhcmNoOiBzdHJpbmc7XG5cdFx0XHRyZWxlYXNlOiBzdHJpbmc7XG5cdFx0fSxcblx0XHRwdWJsaWMgcHJvZHVjdDogSVByb2R1Y3RDb25maWd1cmF0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSB3aW5kb3c6IFdpbmRvdyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaXNXZWI6IGJvb2xlYW4sXG5cdFx0QElJc3N1ZUZvcm1TZXJ2aWNlIHB1YmxpYyByZWFkb25seSBpc3N1ZUZvcm1TZXJ2aWNlOiBJSXNzdWVGb3JtU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHVibGljIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwdWJsaWMgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHB1YmxpYyByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHRhcmdldEV4dGVuc2lvbiA9IGRhdGEuZXh0ZW5zaW9uSWQgPyBkYXRhLmVuYWJsZWRFeHRlbnNpb25zLmZpbmQoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZC50b0xvY2FsZUxvd2VyQ2FzZSgpID09PSBkYXRhLmV4dGVuc2lvbklkPy50b0xvY2FsZUxvd2VyQ2FzZSgpKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbCA9IG5ldyBJc3N1ZVJlcG9ydGVyTW9kZWwoe1xuXHRcdFx0Li4uZGF0YSxcblx0XHRcdGlzc3VlVHlwZTogZGF0YS5pc3N1ZVR5cGUgfHwgSXNzdWVUeXBlLkJ1Zyxcblx0XHRcdHZlcnNpb25JbmZvOiB7XG5cdFx0XHRcdHZzY29kZVZlcnNpb246IGAke3Byb2R1Y3QubmFtZVNob3J0fSAkeyEhcHJvZHVjdC5kYXJ3aW5Vbml2ZXJzYWxBc3NldElkID8gYCR7cHJvZHVjdC52ZXJzaW9ufSAoVW5pdmVyc2FsKWAgOiBwcm9kdWN0LnZlcnNpb259ICgke3Byb2R1Y3QuY29tbWl0IHx8ICdDb21taXQgdW5rbm93bid9LCAke3Byb2R1Y3QuZGF0ZSB8fCAnRGF0ZSB1bmtub3duJ30pYCxcblx0XHRcdFx0b3M6IGAke3RoaXMub3MudHlwZX0gJHt0aGlzLm9zLmFyY2h9ICR7dGhpcy5vcy5yZWxlYXNlfSR7aXNMaW51eFNuYXAgPyAnIHNuYXAnIDogJyd9YFxuXHRcdFx0fSxcblx0XHRcdGV4dGVuc2lvbnNEaXNhYmxlZDogISF0aGlzLmRpc2FibGVFeHRlbnNpb25zLFxuXHRcdFx0ZmlsZU9uRXh0ZW5zaW9uOiBkYXRhLmV4dGVuc2lvbklkID8gIXRhcmdldEV4dGVuc2lvbj8uaXNCdWlsdGluIDogdW5kZWZpbmVkLFxuXHRcdFx0c2VsZWN0ZWRFeHRlbnNpb246IHRhcmdldEV4dGVuc2lvblxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0F1dGhTdGF0ZSA9ICEhdGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VuO1xuXG5cdFx0XHRsZXQgZ2l0aHViQWNjZXNzVG9rZW4gPSAnJztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGdpdGh1YlNlc3Npb25zID0gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMoJ2dpdGh1YicpO1xuXHRcdFx0XHRjb25zdCBwb3RlbnRpYWxTZXNzaW9ucyA9IGdpdGh1YlNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24uc2NvcGVzLmluY2x1ZGVzKCdyZXBvJykpO1xuXHRcdFx0XHRnaXRodWJBY2Nlc3NUb2tlbiA9IHBvdGVudGlhbFNlc3Npb25zWzBdPy5hY2Nlc3NUb2tlbjtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gSWdub3JlXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbiA9IGdpdGh1YkFjY2Vzc1Rva2VuO1xuXG5cdFx0XHRjb25zdCBjdXJyZW50QXV0aFN0YXRlID0gISFnaXRodWJBY2Nlc3NUb2tlbjtcblx0XHRcdGlmIChwcmV2aW91c0F1dGhTdGF0ZSAhPT0gY3VycmVudEF1dGhTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGZpbGVPbk1hcmtldHBsYWNlID0gZGF0YS5pc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuTWFya2V0cGxhY2U7XG5cdFx0Y29uc3QgZmlsZU9uUHJvZHVjdCA9IGRhdGEuaXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLlZTQ29kZTtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBmaWxlT25NYXJrZXRwbGFjZSwgZmlsZU9uUHJvZHVjdCB9KTtcblxuXHRcdHRoaXMuY3JlYXRlQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbignaXNzdWVSZXBvcnRlci5jcmVhdGUnLCBsb2NhbGl6ZSgnY3JlYXRlJywgXCJDcmVhdGUgb24gR2l0SHViXCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuZGVsYXllZFN1Ym1pdC50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXRTdWJtaXR0aW5nU3RhdGUodHJ1ZSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVJc3N1ZSh0cnVlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLnNldFN1Ym1pdHRpbmdTdGF0ZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLnByZXZpZXdBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdpc3N1ZVJlcG9ydGVyLnByZXZpZXcnLCBsb2NhbGl6ZSgncHJldmlldycsIFwiUHJldmlldyBvbiBHaXRIdWJcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWxheWVkU3VibWl0LnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNldFN1Ym1pdHRpbmdTdGF0ZSh0cnVlKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUlzc3VlKGZhbHNlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLnNldFN1Ym1pdHRpbmdTdGF0ZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLnByaXZhdGVBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdpc3N1ZVJlcG9ydGVyLnByaXZhdGVDcmVhdGUnLCBsb2NhbGl6ZSgncHJpdmF0ZUNyZWF0ZScsIFwiQ3JlYXRlIEludGVybmFsbHlcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWxheWVkU3VibWl0LnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNldFN1Ym1pdHRpbmdTdGF0ZSh0cnVlKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUlzc3VlKHRydWUsIHRydWUpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuc2V0U3VibWl0dGluZ1N0YXRlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaXNzdWVUaXRsZSA9IGRhdGEuaXNzdWVUaXRsZTtcblx0XHRpZiAoaXNzdWVUaXRsZSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBpc3N1ZVRpdGxlRWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQ8SFRNTElucHV0RWxlbWVudD4oJ2lzc3VlLXRpdGxlJyk7XG5cdFx0XHRpZiAoaXNzdWVUaXRsZUVsZW1lbnQpIHtcblx0XHRcdFx0aXNzdWVUaXRsZUVsZW1lbnQudmFsdWUgPSBpc3N1ZVRpdGxlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlzc3VlQm9keSA9IGRhdGEuaXNzdWVCb2R5O1xuXHRcdGlmIChpc3N1ZUJvZHkpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0aGlzLmdldEVsZW1lbnRCeUlkPEhUTUxUZXh0QXJlYUVsZW1lbnQ+KCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uLnZhbHVlID0gaXNzdWVCb2R5O1xuXHRcdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBpc3N1ZURlc2NyaXB0aW9uOiBpc3N1ZUJvZHkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud2luZG93LmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5sYW5nICE9PSAnZW4nKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHNob3codGhpcy5nZXRFbGVtZW50QnlJZCgnZW5nbGlzaCcpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RpY29uU3R5bGVTaGVldCA9IGNyZWF0ZVN0eWxlU2hlZXQoKTtcblx0XHRjb2RpY29uU3R5bGVTaGVldC5pZCA9ICdjb2RpY29uU3R5bGVzJztcblxuXHRcdGNvbnN0IGljb25zU3R5bGVTaGVldCA9IHRoaXMuX3JlZ2lzdGVyKGdldEljb25zU3R5bGVTaGVldCh0aGlzLnRoZW1lU2VydmljZSkpO1xuXHRcdGZ1bmN0aW9uIHVwZGF0ZUFsbCgpIHtcblx0XHRcdGNvZGljb25TdHlsZVNoZWV0LnRleHRDb250ZW50ID0gaWNvbnNTdHlsZVNoZWV0LmdldENTUygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcih1cGRhdGVBbGwsIDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGljb25zU3R5bGVTaGVldC5vbkRpZENoYW5nZSgoKSA9PiBkZWxheWVyLnNjaGVkdWxlKCkpKTtcblx0XHRkZWxheWVyLnNjaGVkdWxlKCk7XG5cblx0XHR0aGlzLmhhbmRsZUV4dGVuc2lvbkRhdGEoZGF0YS5lbmFibGVkRXh0ZW5zaW9ucyk7XG5cdFx0dGhpcy5zZXRVcFR5cGVzKCk7XG5cblx0XHQvLyBIYW5kbGUgY2FzZSB3aGVyZSBleHRlbnNpb24gaXMgcHJlLXNlbGVjdGVkIHRocm91Z2ggdGhlIGNvbW1hbmRcblx0XHRpZiAoKGRhdGEuZGF0YSB8fCBkYXRhLnVyaSkgJiYgdGFyZ2V0RXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblN0YXR1cyh0YXJnZXRFeHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdC8vIGluaXRpYWxpemUgdGhlIHJlcG9ydGluZyBidXR0b24ocylcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpc3N1ZVJlcG9ydGVyRWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXJlcG9ydGVyJyk7XG5cdFx0aWYgKGlzc3VlUmVwb3J0ZXJFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckJsb2NrcygpO1xuXHR9XG5cblx0c2V0SW5pdGlhbEZvY3VzKCkge1xuXHRcdGNvbnN0IHsgZmlsZU9uRXh0ZW5zaW9uIH0gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0aWYgKGZpbGVPbkV4dGVuc2lvbikge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBpc3N1ZVRpdGxlID0gdGhpcy53aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJyk7XG5cdFx0XHRpc3N1ZVRpdGxlPy5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGlzc3VlVHlwZSA9IHRoaXMud2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10eXBlJyk7XG5cdFx0XHRpc3N1ZVR5cGU/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHVwZGF0ZUJ1dHRvblN0YXRlcygpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpc3N1ZVJlcG9ydGVyRWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXJlcG9ydGVyJyk7XG5cdFx0aWYgKCFpc3N1ZVJlcG9ydGVyRWxlbWVudCkge1xuXHRcdFx0Ly8gc2hvdWxkbid0IG9jY3VyIC0tIHRocm93P1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0Ly8gcHVibGljIGVsZW1lbnRzIHNlY3Rpb25cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRsZXQgcHVibGljRWxlbWVudHMgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdwdWJsaWMtZWxlbWVudHMnKTtcblx0XHRpZiAoIXB1YmxpY0VsZW1lbnRzKSB7XG5cdFx0XHRwdWJsaWNFbGVtZW50cyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0cHVibGljRWxlbWVudHMuaWQgPSAncHVibGljLWVsZW1lbnRzJztcblx0XHRcdHB1YmxpY0VsZW1lbnRzLmNsYXNzTGlzdC5hZGQoJ3B1YmxpYy1lbGVtZW50cycpO1xuXHRcdFx0aXNzdWVSZXBvcnRlckVsZW1lbnQuYXBwZW5kQ2hpbGQocHVibGljRWxlbWVudHMpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVB1YmxpY0dpdGh1YkJ1dHRvbihwdWJsaWNFbGVtZW50cyk7XG5cdFx0dGhpcy51cGRhdGVQdWJsaWNSZXBvTGluayhwdWJsaWNFbGVtZW50cyk7XG5cblxuXHRcdC8vIHByaXZhdGUgZmlsaW5nIHNlY3Rpb25cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRsZXQgaW50ZXJuYWxFbGVtZW50cyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2ludGVybmFsLWVsZW1lbnRzJyk7XG5cdFx0aWYgKCFpbnRlcm5hbEVsZW1lbnRzKSB7XG5cdFx0XHRpbnRlcm5hbEVsZW1lbnRzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRpbnRlcm5hbEVsZW1lbnRzLmlkID0gJ2ludGVybmFsLWVsZW1lbnRzJztcblx0XHRcdGludGVybmFsRWxlbWVudHMuY2xhc3NMaXN0LmFkZCgnaW50ZXJuYWwtZWxlbWVudHMnKTtcblx0XHRcdGludGVybmFsRWxlbWVudHMuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRpc3N1ZVJlcG9ydGVyRWxlbWVudC5hcHBlbmRDaGlsZChpbnRlcm5hbEVsZW1lbnRzKTtcblx0XHR9XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0bGV0IGZpbGluZ1JvdyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2ludGVybmFsLXRvcC1yb3cnKTtcblx0XHRpZiAoIWZpbGluZ1Jvdykge1xuXHRcdFx0ZmlsaW5nUm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRmaWxpbmdSb3cuaWQgPSAnaW50ZXJuYWwtdG9wLXJvdyc7XG5cdFx0XHRmaWxpbmdSb3cuY2xhc3NMaXN0LmFkZCgnaW50ZXJuYWwtdG9wLXJvdycpO1xuXHRcdFx0aW50ZXJuYWxFbGVtZW50cy5hcHBlbmRDaGlsZChmaWxpbmdSb3cpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUludGVybmFsRmlsaW5nTm90ZShmaWxpbmdSb3cpO1xuXHRcdHRoaXMudXBkYXRlSW50ZXJuYWxHaXRodWJCdXR0b24oZmlsaW5nUm93KTtcblx0XHR0aGlzLnVwZGF0ZUludGVybmFsRWxlbWVudHNWaXNpYmlsaXR5KCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUludGVybmFsRmlsaW5nTm90ZShjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0bGV0IGZpbGluZ05vdGUgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpbnRlcm5hbC1wcmV2aWV3LW1lc3NhZ2UnKTtcblx0XHRpZiAoIWZpbGluZ05vdGUpIHtcblx0XHRcdGZpbGluZ05vdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRmaWxpbmdOb3RlLmlkID0gJ2ludGVybmFsLXByZXZpZXctbWVzc2FnZSc7XG5cdFx0XHRmaWxpbmdOb3RlLmNsYXNzTGlzdC5hZGQoJ2ludGVybmFsLXByZXZpZXctbWVzc2FnZScpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGZpbGluZ05vdGUpO1xuXHRcdH1cblxuXHRcdGZpbGluZ05vdGUudGV4dENvbnRlbnQgPSBlc2NhcGUobG9jYWxpemUoJ2ludGVybmFsUHJldmlld01lc3NhZ2UnLCAnSWYgeW91ciBjb3BpbG90IGRlYnVnIGxvZ3MgY29udGFpbiBwcml2YXRlIGluZm9ybWF0aW9uOicpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHVibGljR2l0aHViQnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpc3N1ZVJlcG9ydGVyRWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXJlcG9ydGVyJyk7XG5cdFx0aWYgKCFpc3N1ZVJlcG9ydGVyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2Ugb2YgdGhlIGV4aXN0aW5nIGJ1dHRvblxuXHRcdGlmICh0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbikge1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIHNldHVwIGJ1dHRvbiArIGRyb3Bkb3duIGlmIGFwcGxpY2FibGVcblx0XHRpZiAoIXRoaXMuYWNrbm93bGVkZ2VkICYmIHRoaXMubmVlZHNVcGRhdGUpIHsgLy8gKiBvbGQgdmVyc2lvbiBhbmQgaGFzbid0IGFjaydkXG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oY29udGFpbmVyLCB1bnRoZW1lZEJ1dHRvblN0eWxlcykpO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnYWNrbm93bGVkZ2UnLCBcIkNvbmZpcm0gVmVyc2lvbiBBY2tub3dsZWRnZW1lbnRcIik7XG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmRhdGEuZ2l0aHViQWNjZXNzVG9rZW4gJiYgdGhpcy5pc1ByZXZpZXdFbmFibGVkKCkpIHsgLy8gKiBoYXMgYWNjZXNzIHRva2VuLCBjcmVhdGUgYnkgZGVmYXVsdCwgcHJldmlldyBkcm9wZG93blxuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uV2l0aERyb3Bkb3duKGNvbnRhaW5lciwge1xuXHRcdFx0XHRjb250ZXh0TWVudVByb3ZpZGVyOiB0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0YWN0aW9uczogW3RoaXMucHJldmlld0FjdGlvbl0sXG5cdFx0XHRcdGFkZFByaW1hcnlBY3Rpb25Ub0Ryb3Bkb3duOiBmYWxzZSxcblx0XHRcdFx0Li4udW50aGVtZWRCdXR0b25TdHlsZXNcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHVibGljR2l0aHViQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUFjdGlvbi5ydW4oKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NyZWF0ZU9uR2l0SHViJywgXCJDcmVhdGUgb24gR2l0SHViXCIpO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmRhdGEuZ2l0aHViQWNjZXNzVG9rZW4gJiYgIXRoaXMuaXNQcmV2aWV3RW5hYmxlZCgpKSB7IC8vICogQWNjZXNzIHRva2VuIGJ1dCBpbnZhbGlkIHByZXZpZXcgc3RhdGU6IHNpbXBsZSBCdXR0b24gKGNyZWF0ZSBvbmx5KVxuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGNvbnRhaW5lciwgdW50aGVtZWRCdXR0b25TdHlsZXMpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHVibGljR2l0aHViQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUFjdGlvbi5ydW4oKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NyZWF0ZU9uR2l0SHViJywgXCJDcmVhdGUgb24gR2l0SHViXCIpO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0fSBlbHNlIHsgLy8gKiBObyBhY2Nlc3MgdG9rZW46IHNpbXBsZSBCdXR0b24gKHByZXZpZXcgb25seSlcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihjb250YWluZXIsIHVudGhlbWVkQnV0dG9uU3R5bGVzKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5wcmV2aWV3QWN0aW9uLnJ1bigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgncHJldmlld09uR2l0SHViJywgXCJQcmV2aWV3IG9uIEdpdEh1YlwiKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIG1ha2Ugc3VyZSB0aGF0IHRoZSByZXBvIGxpbmsgaXMgYWZ0ZXIgdGhlIGJ1dHRvblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHJlcG9MaW5rID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnc2hvdy1yZXBvLW5hbWUnKTtcblx0XHRpZiAocmVwb0xpbmspIHtcblx0XHRcdGNvbnRhaW5lci5pbnNlcnRCZWZvcmUodGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZWxlbWVudCwgcmVwb0xpbmspO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHVibGljUmVwb0xpbmsoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGxldCBpc3N1ZVJlcG9OYW1lID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnc2hvdy1yZXBvLW5hbWUnKSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHRpZiAoIWlzc3VlUmVwb05hbWUpIHtcblx0XHRcdGlzc3VlUmVwb05hbWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lLmlkID0gJ3Nob3ctcmVwby1uYW1lJztcblx0XHRcdGlzc3VlUmVwb05hbWUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoaXNzdWVSZXBvTmFtZSk7XG5cdFx0fVxuXG5cblx0XHRjb25zdCBzZWxlY3RlZEV4dGVuc2lvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRpZiAoc2VsZWN0ZWRFeHRlbnNpb24gJiYgc2VsZWN0ZWRFeHRlbnNpb24udXJpKSB7XG5cdFx0XHRjb25zdCB1cmxTdHJpbmcgPSBVUkkucmV2aXZlKHNlbGVjdGVkRXh0ZW5zaW9uLnVyaSkudG9TdHJpbmcoKTtcblx0XHRcdGlzc3VlUmVwb05hbWUuaHJlZiA9IHVybFN0cmluZztcblx0XHRcdGlzc3VlUmVwb05hbWUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gdGhpcy5vcGVuTGluayhlKSk7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lLmFkZEV2ZW50TGlzdGVuZXIoJ2F1eGNsaWNrJywgKGUpID0+IHRoaXMub3BlbkxpbmsoPE1vdXNlRXZlbnQ+ZSkpO1xuXHRcdFx0Y29uc3QgZ2l0SHViSW5mbyA9IHRoaXMucGFyc2VHaXRIdWJVcmwodXJsU3RyaW5nKTtcblx0XHRcdGlzc3VlUmVwb05hbWUudGV4dENvbnRlbnQgPSBnaXRIdWJJbmZvID8gZ2l0SHViSW5mby5vd25lciArICcvJyArIGdpdEh1YkluZm8ucmVwb3NpdG9yeU5hbWUgOiB1cmxTdHJpbmc7XG5cdFx0XHRPYmplY3QuYXNzaWduKGlzc3VlUmVwb05hbWUuc3R5bGUsIHtcblx0XHRcdFx0YWxpZ25TZWxmOiAnZmxleC1lbmQnLFxuXHRcdFx0XHRkaXNwbGF5OiAnYmxvY2snLFxuXHRcdFx0XHRmb250U2l6ZTogJzEzcHgnLFxuXHRcdFx0XHRwYWRkaW5nOiAnNHB4IDBweCcsXG5cdFx0XHRcdHRleHREZWNvcmF0aW9uOiAnbm9uZScsXG5cdFx0XHRcdHdpZHRoOiAnYXV0bydcblx0XHRcdH0pO1xuXHRcdFx0c2hvdyhpc3N1ZVJlcG9OYW1lKTtcblx0XHR9IGVsc2UgaWYgKGlzc3VlUmVwb05hbWUpIHtcblx0XHRcdC8vIGNsZWFyIHN0eWxlc1xuXHRcdFx0aXNzdWVSZXBvTmFtZS5yZW1vdmVBdHRyaWJ1dGUoJ3N0eWxlJyk7XG5cdFx0XHRoaWRlKGlzc3VlUmVwb05hbWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW50ZXJuYWxHaXRodWJCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGlzc3VlUmVwb3J0ZXJFbGVtZW50ID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtcmVwb3J0ZXInKTtcblx0XHRpZiAoIWlzc3VlUmVwb3J0ZXJFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBvZiB0aGUgZXhpc3RpbmcgYnV0dG9uXG5cdFx0aWYgKHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24pIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24uZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRhdGEuZ2l0aHViQWNjZXNzVG9rZW4gJiYgdGhpcy5kYXRhLnByaXZhdGVVcmkpIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGNvbnRhaW5lciwgdW50aGVtZWRCdXR0b25TdHlsZXMpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMucHJpdmF0ZUFjdGlvbi5ydW4oKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbi5lbGVtZW50LmlkID0gJ2ludGVybmFsLWNyZWF0ZS1idG4nO1xuXHRcdFx0dGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludGVybmFsLWNyZWF0ZS1zdWJ0bGUnKTtcblx0XHRcdHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY3JlYXRlSW50ZXJuYWxseScsIFwiQ3JlYXRlIEludGVybmFsbHlcIik7XG5cdFx0XHR0aGlzLmludGVybmFsR2l0aHViQnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbi5zZXRUaXRsZSh0aGlzLmRhdGEucHJpdmF0ZVVyaS5wYXRoIS5zbGljZSgxKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnRlcm5hbEVsZW1lbnRzVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpbnRlcm5hbC1lbGVtZW50cycpO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHQvLyBzaG91bGRuJ3QgaGFwcGVuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbiAmJiB0aGlzLmRhdGEucHJpdmF0ZVVyaSkge1xuXHRcdFx0c2hvdyhjb250YWluZXIpO1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJzsgLy90b2RvOiBuZWNlc3NhcnkgZXZlbiB3aXRoIHNob3c/XG5cdFx0XHRpZiAodGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbikge1xuXHRcdFx0XHR0aGlzLmludGVybmFsR2l0aHViQnV0dG9uLmVuYWJsZWQgPSB0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbj8uZW5hYmxlZCA/PyBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aGlkZShjb250YWluZXIpO1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7IC8vdG9kbzogbmVjZXNzYXJ5IGV2ZW4gd2l0aCBoaWRlP1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJlU3VibWl0QnV0dG9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGdldFN1Ym1pdEJ1dHRvbkVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICh0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbiBpbnN0YW5jZW9mIEJ1dHRvbldpdGhEcm9wZG93bikge1xuXHRcdFx0cmV0dXJuIHRoaXMucHVibGljR2l0aHViQnV0dG9uLnByaW1hcnlCdXR0b24uZWxlbWVudDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIHNldFN1Ym1pdHRpbmdTdGF0ZShzdWJtaXR0aW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9ICFzdWJtaXR0aW5nO1xuXHRcdGlmICh0aGlzLmludGVybmFsR2l0aHViQnV0dG9uKSB7XG5cdFx0XHR0aGlzLmludGVybmFsR2l0aHViQnV0dG9uLmVuYWJsZWQgPSAhc3VibWl0dGluZztcblx0XHR9XG5cblx0XHRjb25zdCBidXR0b25FbCA9IHRoaXMuZ2V0U3VibWl0QnV0dG9uRWxlbWVudCgpO1xuXHRcdGlmIChzdWJtaXR0aW5nKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50TGFiZWwgPSB0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbiBpbnN0YW5jZW9mIEJ1dHRvbldpdGhEcm9wZG93blxuXHRcdFx0XHQ/IHRoaXMucHVibGljR2l0aHViQnV0dG9uLnByaW1hcnlCdXR0b24ubGFiZWxcblx0XHRcdFx0OiB0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5sYWJlbDtcblx0XHRcdHRoaXMucHJlU3VibWl0QnV0dG9uTGFiZWwgPSB0eXBlb2YgY3VycmVudExhYmVsID09PSAnc3RyaW5nJyA/IGN1cnJlbnRMYWJlbCA6ICcnO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnc3VibWl0dGluZ0lzc3VlJywgXCJTdWJtaXR0aW5nLi4uXCIpO1xuXHRcdFx0Y29uc3Qgc3Bpbm5lckljb24gPSByZW5kZXJJY29uKFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpKTtcblx0XHRcdGJ1dHRvbkVsLnByZXBlbmQoc3Bpbm5lckljb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHNwaW5uZXJFbCA9IGJ1dHRvbkVsLnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uLWxvYWRpbmcnKTtcblx0XHRcdHNwaW5uZXJFbD8ucmVtb3ZlKCk7XG5cdFx0XHRpZiAodGhpcy5wcmVTdWJtaXRCdXR0b25MYWJlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gdGhpcy5wcmVTdWJtaXRCdXR0b25MYWJlbDtcblx0XHRcdFx0dGhpcy5wcmVTdWJtaXRCdXR0b25MYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUlzc3VlUmVwb3J0ZXJVcmkoZXh0ZW5zaW9uOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLnVyaSkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKGV4dGVuc2lvbi51cmkpO1xuXHRcdFx0XHRleHRlbnNpb24uYnVnc1VybCA9IHVyaS50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucmVuZGVyQmxvY2tzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVFeHRlbnNpb25EYXRhKGV4dGVuc2lvbnM6IElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhW10pIHtcblx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zID0gZXh0ZW5zaW9ucy5maWx0ZXIoeCA9PiAheC5pc0J1aWx0aW4pO1xuXHRcdGNvbnN0IHsgbm9uVGhlbWVzLCB0aGVtZXMgfSA9IGdyb3VwQnkoaW5zdGFsbGVkRXh0ZW5zaW9ucywgZXh0ID0+IHtcblx0XHRcdHJldHVybiBleHQuaXNUaGVtZSA/ICd0aGVtZXMnIDogJ25vblRoZW1lcyc7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBudW1iZXJPZlRoZW1lRXh0ZXNpb25zID0gKHRoZW1lcyAmJiB0aGVtZXMubGVuZ3RoKSA/PyAwO1xuXHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IG51bWJlck9mVGhlbWVFeHRlc2lvbnMsIGVuYWJsZWROb25UaGVtZUV4dGVzaW9uczogbm9uVGhlbWVzLCBhbGxFeHRlbnNpb25zOiBpbnN0YWxsZWRFeHRlbnNpb25zIH0pO1xuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uVGFibGUobm9uVGhlbWVzID8/IFtdLCBudW1iZXJPZlRoZW1lRXh0ZXNpb25zKTtcblx0XHRpZiAodGhpcy5kaXNhYmxlRXh0ZW5zaW9ucyB8fCBpbnN0YWxsZWRFeHRlbnNpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHQoPEhUTUxCdXR0b25FbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2Rpc2FibGVFeHRlbnNpb25zJykpLmRpc2FibGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblNlbGVjdG9yKGluc3RhbGxlZEV4dGVuc2lvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25TZWxlY3RvcihleHRlbnNpb25zOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YVtdKTogdm9pZCB7XG5cdFx0aW50ZXJmYWNlIElPcHRpb24ge1xuXHRcdFx0bmFtZTogc3RyaW5nO1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25PcHRpb25zOiBJT3B0aW9uW10gPSBleHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lIHx8ICcnLFxuXHRcdFx0XHRpZDogZXh0ZW5zaW9uLmlkXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Ly8gU29ydCBleHRlbnNpb25zIGJ5IG5hbWVcblx0XHRleHRlbnNpb25PcHRpb25zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGNvbnN0IGFOYW1lID0gYS5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBiTmFtZSA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0aWYgKGFOYW1lID4gYk5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhTmFtZSA8IGJOYW1lKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtYWtlT3B0aW9uID0gKGV4dGVuc2lvbjogSU9wdGlvbiwgc2VsZWN0ZWRFeHRlbnNpb24/OiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YSk6IEhUTUxPcHRpb25FbGVtZW50ID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gc2VsZWN0ZWRFeHRlbnNpb24gJiYgZXh0ZW5zaW9uLmlkID09PSBzZWxlY3RlZEV4dGVuc2lvbi5pZDtcblx0XHRcdHJldHVybiAkPEhUTUxPcHRpb25FbGVtZW50Pignb3B0aW9uJywge1xuXHRcdFx0XHQndmFsdWUnOiBleHRlbnNpb24uaWQsXG5cdFx0XHRcdCdzZWxlY3RlZCc6IHNlbGVjdGVkIHx8ICcnXG5cdFx0XHR9LCBleHRlbnNpb24ubmFtZSk7XG5cdFx0fTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvbnNTZWxlY3RvciA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQ8SFRNTFNlbGVjdEVsZW1lbnQ+KCdleHRlbnNpb24tc2VsZWN0b3InKTtcblx0XHRpZiAoZXh0ZW5zaW9uc1NlbGVjdG9yKSB7XG5cdFx0XHRjb25zdCB7IHNlbGVjdGVkRXh0ZW5zaW9uIH0gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0XHRyZXNldChleHRlbnNpb25zU2VsZWN0b3IsIHRoaXMubWFrZU9wdGlvbignJywgbG9jYWxpemUoJ3NlbGVjdEV4dGVuc2lvbicsIFwiU2VsZWN0IGV4dGVuc2lvblwiKSwgdHJ1ZSksIC4uLmV4dGVuc2lvbk9wdGlvbnMubWFwKGV4dGVuc2lvbiA9PiBtYWtlT3B0aW9uKGV4dGVuc2lvbiwgc2VsZWN0ZWRFeHRlbnNpb24pKSk7XG5cblx0XHRcdGlmICghc2VsZWN0ZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uc1NlbGVjdG9yLnNlbGVjdGVkSW5kZXggPSAwO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2V4dGVuc2lvbi1zZWxlY3RvcicsICdjaGFuZ2UnLCBhc3luYyAoZTogRXZlbnQpID0+IHtcblx0XHRcdFx0dGhpcy5jbGVhckV4dGVuc2lvbkRhdGEoKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRFeHRlbnNpb25JZCA9ICg8SFRNTElucHV0RWxlbWVudD5lLnRhcmdldCkudmFsdWU7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24gPSBzZWxlY3RlZEV4dGVuc2lvbklkO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLmFsbEV4dGVuc2lvbnM7XG5cdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBleHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkID09PSBzZWxlY3RlZEV4dGVuc2lvbklkKTtcblx0XHRcdFx0aWYgKG1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgc2VsZWN0ZWRFeHRlbnNpb246IG1hdGNoZXNbMF0gfSk7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRFeHRlbnNpb24gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuc2VsZWN0ZWRFeHRlbnNpb247XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpY29uRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdFx0XHRcdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sb2FkaW5nKSwgJ2NvZGljb24tbW9kaWZpZXItc3BpbicpO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRMb2FkaW5nKGljb25FbGVtZW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IG9wZW5SZXBvcnRlckRhdGEgPSBhd2FpdCB0aGlzLnNlbmRSZXBvcnRlck1lbnUoc2VsZWN0ZWRFeHRlbnNpb24pO1xuXHRcdFx0XHRcdFx0aWYgKG9wZW5SZXBvcnRlckRhdGEpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24gPT09IHNlbGVjdGVkRXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnJlbW92ZUxvYWRpbmcoaWNvbkVsZW1lbnQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZGF0YSA9IG9wZW5SZXBvcnRlckRhdGE7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMubG9hZGluZ0V4dGVuc2lvbkRhdGEpIHtcblx0XHRcdFx0XHRcdFx0XHRpY29uRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubG9hZGluZyksICdjb2RpY29uLW1vZGlmaWVyLXNwaW4nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR0aGlzLnJlbW92ZUxvYWRpbmcoaWNvbkVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHQvLyBpZiBub3QgdXNpbmcgY29tbWFuZCwgc2hvdWxkIGhhdmUgbm8gY29uZmlndXJhdGlvbiBkYXRhIGluIGZpZWxkcyB3ZSBjYXJlIGFib3V0IGFuZCBjaGVjayBsYXRlci5cblx0XHRcdFx0XHRcdFx0dGhpcy5jbGVhckV4dGVuc2lvbkRhdGEoKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBjYXNlIHdoZW4gcHJldmlvdXMgZXh0ZW5zaW9uIHdhcyBvcGVuZWQgZnJvbSBub3JtYWwgb3Blbklzc3VlUmVwb3J0ZXIgY29tbWFuZFxuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZEV4dGVuc2lvbi5kYXRhID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRzZWxlY3RlZEV4dGVuc2lvbi51cmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5zZWxlY3RlZEV4dGVuc2lvbiA9PT0gc2VsZWN0ZWRFeHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0XHQvLyByZXBvcHVsYXRlcyB0aGUgZmllbGRzIHdpdGggdGhlIG5ldyBkYXRhIGdpdmVuIHRoZSBzZWxlY3RlZCBleHRlbnNpb24uXG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uU3RhdHVzKG1hdGNoZXNbMF0pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLm9wZW5SZXBvcnRlciA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBzZWxlY3RlZEV4dGVuc2lvbjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5jbGVhclNlYXJjaFJlc3VsdHMoKTtcblx0XHRcdFx0XHRcdHRoaXMuY2xlYXJFeHRlbnNpb25EYXRhKCk7XG5cdFx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlU2VsZWN0ZWRFeHRlbnNpb24oKTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uU3RhdHVzKG1hdGNoZXNbMF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwZGF0ZSBpbnRlcm5hbCBhY3Rpb24gdmlzaWJpbGl0eSBhZnRlciBleHBsaWNpdCBzZWxlY3Rpb25cblx0XHRcdFx0dGhpcy51cGRhdGVJbnRlcm5hbEVsZW1lbnRzVmlzaWJpbGl0eSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdwcm9ibGVtLXNvdXJjZScsICdjaGFuZ2UnLCAoXykgPT4ge1xuXHRcdFx0dGhpcy5jbGVhckV4dGVuc2lvbkRhdGEoKTtcblx0XHRcdHRoaXMudmFsaWRhdGVTZWxlY3RlZEV4dGVuc2lvbigpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZW5kUmVwb3J0ZXJNZW51KGV4dGVuc2lvbjogSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEpOiBQcm9taXNlPElzc3VlUmVwb3J0ZXJEYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRpbWVvdXRQcm9taXNlID0gbmV3IFByb21pc2U8dW5kZWZpbmVkPigoXywgcmVqZWN0KSA9PlxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHJlamVjdChuZXcgRXJyb3IoJ3NlbmRSZXBvcnRlck1lbnUgdGltZWQgb3V0JykpLCAxMDAwMClcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0dGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLnNlbmRSZXBvcnRlck1lbnUoZXh0ZW5zaW9uLmlkKSxcblx0XHRcdFx0dGltZW91dFByb21pc2Vcblx0XHRcdF0pO1xuXHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY2tub3dsZWRnZW1lbnRTdGF0ZSgpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBhY2tub3dsZWRnZW1lbnRDaGVja2JveCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQ8SFRNTElucHV0RWxlbWVudD4oJ2luY2x1ZGVBY2tub3dsZWRnZW1lbnQnKTtcblx0XHRpZiAoYWNrbm93bGVkZ2VtZW50Q2hlY2tib3gpIHtcblx0XHRcdHRoaXMuYWNrbm93bGVkZ2VkID0gYWNrbm93bGVkZ2VtZW50Q2hlY2tib3guY2hlY2tlZDtcblx0XHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEV2ZW50SGFuZGxlcnMoKTogdm9pZCB7XG5cdFx0KFsnaW5jbHVkZVN5c3RlbUluZm8nLCAnaW5jbHVkZVByb2Nlc3NJbmZvJywgJ2luY2x1ZGVXb3Jrc3BhY2VJbmZvJywgJ2luY2x1ZGVFeHRlbnNpb25zJywgJ2luY2x1ZGVFeHBlcmltZW50cycsICdpbmNsdWRlRXh0ZW5zaW9uRGF0YSddIGFzIGNvbnN0KS5mb3JFYWNoKGVsZW1lbnRJZCA9PiB7XG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoZWxlbWVudElkLCAnY2xpY2snLCAoZXZlbnQ6IEV2ZW50KSA9PiB7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBbZWxlbWVudElkXTogIXRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKVtlbGVtZW50SWRdIH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2luY2x1ZGVBY2tub3dsZWRnZW1lbnQnLCAnY2xpY2snLCAoZXZlbnQ6IEV2ZW50KSA9PiB7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMudXBkYXRlQWNrbm93bGVkZ2VtZW50U3RhdGUoKTtcblx0XHR9KTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNob3dJbmZvRWxlbWVudHMgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdzaG93SW5mbycpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2hvd0luZm9FbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgc2hvd0luZm8gPSBzaG93SW5mb0VsZW1lbnRzLml0ZW0oaSkhO1xuXHRcdFx0KHNob3dJbmZvIGFzIEhUTUxBbmNob3JFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSAoPEhUTUxEaXZFbGVtZW50PmUudGFyZ2V0KTtcblx0XHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGFpbmluZ0VsZW1lbnQgPSBsYWJlbC5wYXJlbnRFbGVtZW50ICYmIGxhYmVsLnBhcmVudEVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHRcdFx0XHRjb25zdCBpbmZvID0gY29udGFpbmluZ0VsZW1lbnQgJiYgY29udGFpbmluZ0VsZW1lbnQubGFzdEVsZW1lbnRDaGlsZDtcblx0XHRcdFx0XHRpZiAoaW5mbyAmJiBpbmZvLmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJykpIHtcblx0XHRcdFx0XHRcdHNob3coaW5mbyk7XG5cdFx0XHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdoaWRlJywgXCJoaWRlXCIpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRoaWRlKGluZm8pO1xuXHRcdFx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2hvdycsIFwic2hvd1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtc291cmNlJywgJ2NoYW5nZScsIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAoPEhUTUxJbnB1dEVsZW1lbnQ+ZS50YXJnZXQpLnZhbHVlO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBwcm9ibGVtU291cmNlSGVscFRleHQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdwcm9ibGVtLXNvdXJjZS1oZWxwLXRleHQnKSE7XG5cdFx0XHRpZiAodmFsdWUgPT09ICcnKSB7XG5cdFx0XHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IGZpbGVPbkV4dGVuc2lvbjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRzaG93KHByb2JsZW1Tb3VyY2VIZWxwVGV4dCk7XG5cdFx0XHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhpZGUocHJvYmxlbVNvdXJjZUhlbHBUZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvblRleHRBcmVhID0gPEhUTUxJbnB1dEVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdGl0bGUnKTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gSXNzdWVTb3VyY2UuVlNDb2RlKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uVGV4dEFyZWEucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgndnNjb2RlUGxhY2Vob2xkZXInLCBcIkUuZyBXb3JrYmVuY2ggaXMgbWlzc2luZyBwcm9ibGVtcyBwYW5lbFwiKTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IElzc3VlU291cmNlLkV4dGVuc2lvbikge1xuXHRcdFx0XHRkZXNjcmlwdGlvblRleHRBcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2V4dGVuc2lvblBsYWNlaG9sZGVyJywgXCJFLmcuIE1pc3NpbmcgYWx0IHRleHQgb24gZXh0ZW5zaW9uIHJlYWRtZSBpbWFnZVwiKTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IElzc3VlU291cmNlLk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uVGV4dEFyZWEucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbWFya2V0cGxhY2VQbGFjZWhvbGRlcicsIFwiRS5nIENhbm5vdCBkaXNhYmxlIGluc3RhbGxlZCBleHRlbnNpb25cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXNjcmlwdGlvblRleHRBcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3VuZGVmaW5lZFBsYWNlaG9sZGVyJywgXCJQbGVhc2UgZW50ZXIgYSB0aXRsZVwiKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGZpbGVPbkV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UsIGZpbGVPblByb2R1Y3QgPSBmYWxzZTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGZpbGVPbkV4dGVuc2lvbiA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRmaWxlT25NYXJrZXRwbGFjZSA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJc3N1ZVNvdXJjZS5WU0NvZGUpIHtcblx0XHRcdFx0ZmlsZU9uUHJvZHVjdCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IGZpbGVPbkV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UsIGZpbGVPblByb2R1Y3QgfSk7XG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHRpdGxlID0gKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykpLnZhbHVlO1xuXHRcdFx0dGhpcy5zZWFyY2hJc3N1ZXModGl0bGUsIGZpbGVPbkV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdkZXNjcmlwdGlvbicsICdpbnB1dCcsIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNzdWVEZXNjcmlwdGlvbiA9ICg8SFRNTElucHV0RWxlbWVudD5lLnRhcmdldCkudmFsdWU7XG5cdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBpc3N1ZURlc2NyaXB0aW9uIH0pO1xuXG5cdFx0XHQvLyBPbmx5IHNlYXJjaCBmb3IgZXh0ZW5zaW9uIGlzc3VlcyBvbiB0aXRsZSBjaGFuZ2Vcblx0XHRcdGlmICh0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5maWxlT25FeHRlbnNpb24oKSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykpLnZhbHVlO1xuXHRcdFx0XHR0aGlzLnNlYXJjaFZTQ29kZUlzc3Vlcyh0aXRsZSwgaXNzdWVEZXNjcmlwdGlvbik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2lzc3VlLXRpdGxlJywgJ2lucHV0JywgXyA9PiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHRpdGxlRWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykgYXMgSFRNTElucHV0RWxlbWVudDtcblx0XHRcdGlmICh0aXRsZUVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSB0aXRsZUVsZW1lbnQudmFsdWU7XG5cdFx0XHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IGlzc3VlVGl0bGU6IHRpdGxlIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdpc3N1ZS10aXRsZScsICdpbnB1dCcsIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSAoPEhUTUxJbnB1dEVsZW1lbnQ+ZS50YXJnZXQpLnZhbHVlO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBsZW5ndGhWYWxpZGF0aW9uTWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlLWxlbmd0aC12YWxpZGF0aW9uLWVycm9yJyk7XG5cdFx0XHRjb25zdCBpc3N1ZVVybCA9IHRoaXMuZ2V0SXNzdWVVcmwoKTtcblx0XHRcdGlmICh0aXRsZSAmJiB0aGlzLmdldElzc3VlVXJsV2l0aFRpdGxlKHRpdGxlLCBpc3N1ZVVybCkubGVuZ3RoID4gTUFYX1VSTF9MRU5HVEgpIHtcblx0XHRcdFx0c2hvdyhsZW5ndGhWYWxpZGF0aW9uTWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWRlKGxlbmd0aFZhbGlkYXRpb25NZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgaXNzdWVTb3VyY2UgPSB0aGlzLmdldEVsZW1lbnRCeUlkPEhUTUxTZWxlY3RFbGVtZW50PignaXNzdWUtc291cmNlJyk7XG5cdFx0XHRpZiAoIWlzc3VlU291cmNlIHx8IGlzc3VlU291cmNlLnZhbHVlID09PSAnJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgZmlsZU9uRXh0ZW5zaW9uLCBmaWxlT25NYXJrZXRwbGFjZSB9ID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpO1xuXHRcdFx0dGhpcy5zZWFyY2hJc3N1ZXModGl0bGUsIGZpbGVPbkV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gV2UgaGFuZGxlIGNsaWNrcyBpbiB0aGUgZHJvcGRvd24gYWN0aW9ucyBub3dcblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZGlzYWJsZUV4dGVuc2lvbnMnLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmlzc3VlRm9ybVNlcnZpY2UucmVsb2FkV2l0aEV4dGVuc2lvbnNEaXNhYmxlZCgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdleHRlbnNpb25CdWdzTGluaycsICdjbGljaycsIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gKDxIVE1MRWxlbWVudD5lLnRhcmdldCkuaW5uZXJUZXh0O1xuXHRcdFx0dGhpcy5vcGVuTGluayh1cmwpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdkaXNhYmxlRXh0ZW5zaW9ucycsICdrZXlkb3duJywgKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKChlIGFzIEtleWJvYXJkRXZlbnQpLmtleSA9PT0gJ0VudGVyJyB8fCAoZSBhcyBLZXlib2FyZEV2ZW50KS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHR0aGlzLmlzc3VlRm9ybVNlcnZpY2UucmVsb2FkV2l0aEV4dGVuc2lvbnNEaXNhYmxlZCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy53aW5kb3cuZG9jdW1lbnQub25rZXlkb3duID0gYXN5bmMgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGNtZE9yQ3RybEtleSA9IGlzTWFjaW50b3NoID8gZS5tZXRhS2V5IDogZS5jdHJsS2V5O1xuXHRcdFx0Ly8gQ21kL0N0cmwrRW50ZXIgcHJldmlld3MgaXNzdWUgYW5kIGNsb3NlcyB3aW5kb3dcblx0XHRcdGlmIChjbWRPckN0cmxLZXkgJiYgZS5rZXkgPT09ICdFbnRlcicpIHtcblx0XHRcdFx0dGhpcy5kZWxheWVkU3VibWl0LnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuc2V0U3VibWl0dGluZ1N0YXRlKHRydWUpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5jcmVhdGVJc3N1ZSgpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRTdWJtaXR0aW5nU3RhdGUoZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENtZC9DdHJsICsgdyBjbG9zZXMgaXNzdWUgd2luZG93XG5cdFx0XHRpZiAoY21kT3JDdHJsS2V5ICYmIGUua2V5ID09PSAndycpIHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBpc3N1ZVRpdGxlID0gKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykpIS52YWx1ZTtcblx0XHRcdFx0Y29uc3QgeyBpc3N1ZURlc2NyaXB0aW9uIH0gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0XHRcdGlmICghdGhpcy5oYXNCZWVuU3VibWl0dGVkICYmIChpc3N1ZVRpdGxlIHx8IGlzc3VlRGVzY3JpcHRpb24pKSB7XG5cdFx0XHRcdFx0Ly8gZmlyZSBhbmQgZm9yZ2V0XG5cdFx0XHRcdFx0dGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLnNob3dDb25maXJtQ2xvc2VEaWFsb2coKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gV2l0aCBsYXRlc3QgZWxlY3Ryb24gdXBncmFkZSwgY21kK2EgaXMgbm8gbG9uZ2VyIHByb3BhZ2F0aW5nIGNvcnJlY3RseSBmb3IgaW5wdXRzIGluIHRoaXMgd2luZG93IG9uIG1hY1xuXHRcdFx0Ly8gTWFudWFsbHkgcGVyZm9ybSB0aGUgc2VsZWN0aW9uXG5cdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0aWYgKGNtZE9yQ3RybEtleSAmJiBlLmtleSA9PT0gJ2EnICYmIGUudGFyZ2V0KSB7XG5cdFx0XHRcdFx0aWYgKGlzSFRNTElucHV0RWxlbWVudChlLnRhcmdldCkgfHwgaXNIVE1MVGV4dEFyZWFFbGVtZW50KGUudGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0KDxIVE1MSW5wdXRFbGVtZW50PmUudGFyZ2V0KS5zZWxlY3QoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBndWlkYW5jZSBsaW5rIHNwZWNpZmljYWxseSB0byB1c2Ugb3BlbmVyU2VydmljZVxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigncmV2aWV3LWd1aWRhbmNlLWhlbHAtdGV4dCcsICdjbGljaycsIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRpZiAodGFyZ2V0LnRhZ05hbWUgPT09ICdBJyAmJiB0YXJnZXQuZ2V0QXR0cmlidXRlKCd0YXJnZXQnKSA9PT0gJ19ibGFuaycpIHtcblx0XHRcdFx0dGhpcy5vcGVuTGluayg8TW91c2VFdmVudD5lKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVQZXJmb3JtYW5jZUluZm8oaW5mbzogUGFydGlhbDxJc3N1ZVJlcG9ydGVyRGF0YT4pIHtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoaW5mbyk7XG5cdFx0dGhpcy5yZWNlaXZlZFBlcmZvcm1hbmNlSW5mbyA9IHRydWU7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKTtcblx0XHR0aGlzLnVwZGF0ZVByb2Nlc3NJbmZvKHN0YXRlKTtcblx0XHR0aGlzLnVwZGF0ZVdvcmtzcGFjZUluZm8oc3RhdGUpO1xuXHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzUHJldmlld0VuYWJsZWQoKSB7XG5cdFx0Y29uc3QgaXNzdWVUeXBlID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLmlzc3VlVHlwZTtcblxuXHRcdGlmICh0aGlzLmxvYWRpbmdFeHRlbnNpb25EYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNXZWIpIHtcblx0XHRcdGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5GZWF0dXJlUmVxdWVzdCB8fCBpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlIHx8IGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLkJ1Zykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLkJ1ZyAmJiB0aGlzLnJlY2VpdmVkU3lzdGVtSW5mbykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWUgJiYgdGhpcy5yZWNlaXZlZFN5c3RlbUluZm8gJiYgdGhpcy5yZWNlaXZlZFBlcmZvcm1hbmNlSW5mbykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uUmVwb3NpdG9yeVVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkRXh0ZW5zaW9uID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLnNlbGVjdGVkRXh0ZW5zaW9uO1xuXHRcdHJldHVybiBzZWxlY3RlZEV4dGVuc2lvbiAmJiBzZWxlY3RlZEV4dGVuc2lvbi5yZXBvc2l0b3J5VXJsO1xuXHR9XG5cblx0cHVibGljIGdldEV4dGVuc2lvbkJ1Z3NVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZWxlY3RlZEV4dGVuc2lvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRyZXR1cm4gc2VsZWN0ZWRFeHRlbnNpb24gJiYgc2VsZWN0ZWRFeHRlbnNpb24uYnVnc1VybDtcblx0fVxuXG5cdHB1YmxpYyBzZWFyY2hWU0NvZGVJc3N1ZXModGl0bGU6IHN0cmluZywgaXNzdWVEZXNjcmlwdGlvbj86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aXRsZSkge1xuXHRcdFx0dGhpcy5zZWFyY2hEdXBsaWNhdGVzKHRpdGxlLCBpc3N1ZURlc2NyaXB0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jbGVhclNlYXJjaFJlc3VsdHMoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2VhcmNoSXNzdWVzKHRpdGxlOiBzdHJpbmcsIGZpbGVPbkV4dGVuc2lvbjogYm9vbGVhbiB8IHVuZGVmaW5lZCwgZmlsZU9uTWFya2V0cGxhY2U6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoZmlsZU9uRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZWFyY2hFeHRlbnNpb25Jc3N1ZXModGl0bGUpO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlT25NYXJrZXRwbGFjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoTWFya2V0cGxhY2VJc3N1ZXModGl0bGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLmlzc3VlRGVzY3JpcHRpb247XG5cdFx0dGhpcy5zZWFyY2hWU0NvZGVJc3N1ZXModGl0bGUsIGRlc2NyaXB0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgc2VhcmNoRXh0ZW5zaW9uSXNzdWVzKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB1cmwgPSB0aGlzLmdldEV4dGVuc2lvbkdpdEh1YlVybCgpO1xuXHRcdGlmICh0aXRsZSkge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyguKikvLmV4ZWModXJsKTtcblx0XHRcdGlmIChtYXRjaGVzICYmIG1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHJlcG8gPSBtYXRjaGVzWzFdO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZWFyY2hHaXRIdWIocmVwbywgdGl0bGUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGUgZXh0ZW5zaW9uIGhhcyBubyByZXBvc2l0b3J5LCBkaXNwbGF5IGVtcHR5IHNlYXJjaCByZXN1bHRzXG5cdFx0XHRpZiAodGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLnNlbGVjdGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRpc3BsYXlTZWFyY2hSZXN1bHRzKFtdKTtcblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdH1cblxuXHRwcml2YXRlIHNlYXJjaE1hcmtldHBsYWNlSXNzdWVzKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGl0bGUpIHtcblx0XHRcdGNvbnN0IGdpdEh1YkluZm8gPSB0aGlzLnBhcnNlR2l0SHViVXJsKHRoaXMucHJvZHVjdC5yZXBvcnRNYXJrZXRwbGFjZUlzc3VlVXJsISk7XG5cdFx0XHRpZiAoZ2l0SHViSW5mbykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZWFyY2hHaXRIdWIoYCR7Z2l0SHViSW5mby5vd25lcn0vJHtnaXRIdWJJbmZvLnJlcG9zaXRvcnlOYW1lfWAsIHRpdGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLmNsb3NlUmVwb3J0ZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhclNlYXJjaFJlc3VsdHMoKTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgc2ltaWxhcklzc3VlcyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3NpbWlsYXItaXNzdWVzJykhO1xuXHRcdHNpbWlsYXJJc3N1ZXMuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5udW1iZXJPZlNlYXJjaFJlc3VsdHNEaXNwbGF5ZWQgPSAwO1xuXHR9XG5cblx0QGRlYm91bmNlKDMwMClcblx0cHJpdmF0ZSBzZWFyY2hHaXRIdWIocmVwbzogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVlcnkgPSBgaXM6aXNzdWUrcmVwbzoke3JlcG99KyR7dGl0bGV9YDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzaW1pbGFySXNzdWVzID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnc2ltaWxhci1pc3N1ZXMnKSE7XG5cblx0XHRmZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9zZWFyY2gvaXNzdWVzP3E9JHtxdWVyeX1gKS50aGVuKChyZXNwb25zZSkgPT4ge1xuXHRcdFx0cmVzcG9uc2UuanNvbigpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0c2ltaWxhcklzc3Vlcy5pbm5lclRleHQgPSAnJztcblx0XHRcdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQuaXRlbXMpIHtcblx0XHRcdFx0XHR0aGlzLmRpc3BsYXlTZWFyY2hSZXN1bHRzKHJlc3VsdC5pdGVtcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKF8gPT4ge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ1RpbWVvdXQgb3IgcXVlcnkgbGltaXQgZXhjZWVkZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pLmNhdGNoKF8gPT4ge1xuXHRcdFx0Y29uc29sZS53YXJuKCdFcnJvciBmZXRjaGluZyBHaXRIdWIgaXNzdWVzJyk7XG5cdFx0fSk7XG5cdH1cblxuXHRAZGVib3VuY2UoMzAwKVxuXHRwcml2YXRlIHNlYXJjaER1cGxpY2F0ZXModGl0bGU6IHN0cmluZywgYm9keT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHVybCA9ICdodHRwczovL3ZzY29kZS1wcm9ib3Qud2VzdHVzLmNsb3VkYXBwLmF6dXJlLmNvbTo3ODkwL2R1cGxpY2F0ZV9jYW5kaWRhdGVzJztcblx0XHRjb25zdCBpbml0ID0ge1xuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRib2R5XG5cdFx0XHR9KSxcblx0XHRcdGhlYWRlcnM6IG5ldyBIZWFkZXJzKHtcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdFx0fSlcblx0XHR9O1xuXG5cdFx0ZmV0Y2godXJsLCBpbml0KS50aGVuKChyZXNwb25zZSkgPT4ge1xuXHRcdFx0cmVzcG9uc2UuanNvbigpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0dGhpcy5jbGVhclNlYXJjaFJlc3VsdHMoKTtcblxuXHRcdFx0XHRpZiAocmVzdWx0ICYmIHJlc3VsdC5jYW5kaWRhdGVzKSB7XG5cdFx0XHRcdFx0dGhpcy5kaXNwbGF5U2VhcmNoUmVzdWx0cyhyZXN1bHQuY2FuZGlkYXRlcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHJlc3BvbnNlLCBubyBjYW5kaWRhdGVzIHByb3BlcnR5Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKF8gPT4ge1xuXHRcdFx0XHQvLyBJZ25vcmVcblx0XHRcdH0pO1xuXHRcdH0pLmNhdGNoKF8gPT4ge1xuXHRcdFx0Ly8gSWdub3JlXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlTZWFyY2hSZXN1bHRzKHJlc3VsdHM6IFNlYXJjaFJlc3VsdFtdKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgc2ltaWxhcklzc3VlcyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3NpbWlsYXItaXNzdWVzJykhO1xuXHRcdGlmIChyZXN1bHRzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgaXNzdWVzID0gJCgnZGl2Lmlzc3Vlcy1jb250YWluZXInKTtcblx0XHRcdGNvbnN0IGlzc3Vlc1RleHQgPSAkKCdkaXYubGlzdC10aXRsZScpO1xuXHRcdFx0aXNzdWVzVGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzaW1pbGFySXNzdWVzJywgXCJTaW1pbGFyIGlzc3Vlc1wiKTtcblxuXHRcdFx0dGhpcy5udW1iZXJPZlNlYXJjaFJlc3VsdHNEaXNwbGF5ZWQgPSByZXN1bHRzLmxlbmd0aCA8IDUgPyByZXN1bHRzLmxlbmd0aCA6IDU7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubnVtYmVyT2ZTZWFyY2hSZXN1bHRzRGlzcGxheWVkOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgaXNzdWUgPSByZXN1bHRzW2ldO1xuXHRcdFx0XHRjb25zdCBsaW5rID0gJCgnYS5pc3N1ZS1saW5rJywgeyBocmVmOiBpc3N1ZS5odG1sX3VybCB9KTtcblx0XHRcdFx0bGluay50ZXh0Q29udGVudCA9IGlzc3VlLnRpdGxlO1xuXHRcdFx0XHRsaW5rLnRpdGxlID0gaXNzdWUudGl0bGU7XG5cdFx0XHRcdGxpbmsuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gdGhpcy5vcGVuTGluayhlKSk7XG5cdFx0XHRcdGxpbmsuYWRkRXZlbnRMaXN0ZW5lcignYXV4Y2xpY2snLCAoZSkgPT4gdGhpcy5vcGVuTGluayg8TW91c2VFdmVudD5lKSk7XG5cblx0XHRcdFx0bGV0IGlzc3VlU3RhdGU6IEhUTUxFbGVtZW50O1xuXHRcdFx0XHRsZXQgaXRlbTogSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdGlmIChpc3N1ZS5zdGF0ZSkge1xuXHRcdFx0XHRcdGlzc3VlU3RhdGUgPSAkKCdzcGFuLmlzc3VlLXN0YXRlJyk7XG5cblx0XHRcdFx0XHRjb25zdCBpc3N1ZUljb24gPSAkKCdzcGFuLmlzc3VlLWljb24nKTtcblx0XHRcdFx0XHRpc3N1ZUljb24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihpc3N1ZS5zdGF0ZSA9PT0gJ29wZW4nID8gQ29kaWNvbi5pc3N1ZU9wZW5lZCA6IENvZGljb24uaXNzdWVDbG9zZWQpKTtcblxuXHRcdFx0XHRcdGNvbnN0IGlzc3VlU3RhdGVMYWJlbCA9ICQoJ3NwYW4uaXNzdWUtc3RhdGUubGFiZWwnKTtcblx0XHRcdFx0XHRpc3N1ZVN0YXRlTGFiZWwudGV4dENvbnRlbnQgPSBpc3N1ZS5zdGF0ZSA9PT0gJ29wZW4nID8gbG9jYWxpemUoJ29wZW4nLCBcIk9wZW5cIikgOiBsb2NhbGl6ZSgnY2xvc2VkJywgXCJDbG9zZWRcIik7XG5cblx0XHRcdFx0XHRpc3N1ZVN0YXRlLnRpdGxlID0gaXNzdWUuc3RhdGUgPT09ICdvcGVuJyA/IGxvY2FsaXplKCdvcGVuJywgXCJPcGVuXCIpIDogbG9jYWxpemUoJ2Nsb3NlZCcsIFwiQ2xvc2VkXCIpO1xuXHRcdFx0XHRcdGlzc3VlU3RhdGUuYXBwZW5kQ2hpbGQoaXNzdWVJY29uKTtcblx0XHRcdFx0XHRpc3N1ZVN0YXRlLmFwcGVuZENoaWxkKGlzc3VlU3RhdGVMYWJlbCk7XG5cblx0XHRcdFx0XHRpdGVtID0gJCgnZGl2Lmlzc3VlJywgdW5kZWZpbmVkLCBpc3N1ZVN0YXRlLCBsaW5rKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpdGVtID0gJCgnZGl2Lmlzc3VlJywgdW5kZWZpbmVkLCBsaW5rKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlzc3Vlcy5hcHBlbmRDaGlsZChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0c2ltaWxhcklzc3Vlcy5hcHBlbmRDaGlsZChpc3N1ZXNUZXh0KTtcblx0XHRcdHNpbWlsYXJJc3N1ZXMuYXBwZW5kQ2hpbGQoaXNzdWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldFVwVHlwZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFrZU9wdGlvbiA9IChpc3N1ZVR5cGU6IElzc3VlVHlwZSwgZGVzY3JpcHRpb246IHN0cmluZykgPT4gJCgnb3B0aW9uJywgeyAndmFsdWUnOiBpc3N1ZVR5cGUudmFsdWVPZigpIH0sIGVzY2FwZShkZXNjcmlwdGlvbikpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdHlwZVNlbGVjdCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXR5cGUnKSEgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5cdFx0Y29uc3QgeyBpc3N1ZVR5cGUgfSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKTtcblx0XHRyZXNldCh0eXBlU2VsZWN0LFxuXHRcdFx0bWFrZU9wdGlvbihJc3N1ZVR5cGUuQnVnLCBsb2NhbGl6ZSgnYnVnUmVwb3J0ZXInLCBcIkJ1ZyBSZXBvcnRcIikpLFxuXHRcdFx0bWFrZU9wdGlvbihJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3QsIGxvY2FsaXplKCdmZWF0dXJlUmVxdWVzdCcsIFwiRmVhdHVyZSBSZXF1ZXN0XCIpKSxcblx0XHRcdG1ha2VPcHRpb24oSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWUsIGxvY2FsaXplKCdwZXJmb3JtYW5jZUlzc3VlJywgXCJQZXJmb3JtYW5jZSBJc3N1ZSAoZnJlZXplLCBzbG93LCBjcmFzaClcIikpXG5cdFx0KTtcblxuXHRcdHR5cGVTZWxlY3QudmFsdWUgPSBpc3N1ZVR5cGUudG9TdHJpbmcoKTtcblxuXHRcdHRoaXMuc2V0U291cmNlT3B0aW9ucygpO1xuXHR9XG5cblx0cHVibGljIG1ha2VPcHRpb24odmFsdWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgZGlzYWJsZWQ6IGJvb2xlYW4pOiBIVE1MT3B0aW9uRWxlbWVudCB7XG5cdFx0Y29uc3Qgb3B0aW9uOiBIVE1MT3B0aW9uRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuXHRcdG9wdGlvbi5kaXNhYmxlZCA9IGRpc2FibGVkO1xuXHRcdG9wdGlvbi52YWx1ZSA9IHZhbHVlO1xuXHRcdG9wdGlvbi50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXG5cdFx0cmV0dXJuIG9wdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBzZXRTb3VyY2VPcHRpb25zKCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNvdXJjZVNlbGVjdCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXNvdXJjZScpISBhcyBIVE1MU2VsZWN0RWxlbWVudDtcblx0XHRjb25zdCB7IGlzc3VlVHlwZSwgZmlsZU9uRXh0ZW5zaW9uLCBzZWxlY3RlZEV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UsIGZpbGVPblByb2R1Y3QgfSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKTtcblx0XHRsZXQgc2VsZWN0ZWQgPSBzb3VyY2VTZWxlY3Quc2VsZWN0ZWRJbmRleDtcblx0XHRpZiAoc2VsZWN0ZWQgPT09IC0xKSB7XG5cdFx0XHRpZiAoZmlsZU9uRXh0ZW5zaW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0c2VsZWN0ZWQgPSBmaWxlT25FeHRlbnNpb24gPyAyIDogMTtcblx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWRFeHRlbnNpb24/LmlzQnVpbHRpbikge1xuXHRcdFx0XHRzZWxlY3RlZCA9IDE7XG5cdFx0XHR9IGVsc2UgaWYgKGZpbGVPbk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdHNlbGVjdGVkID0gMztcblx0XHRcdH0gZWxzZSBpZiAoZmlsZU9uUHJvZHVjdCkge1xuXHRcdFx0XHRzZWxlY3RlZCA9IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c291cmNlU2VsZWN0LmlubmVyVGV4dCA9ICcnO1xuXHRcdHNvdXJjZVNlbGVjdC5hcHBlbmQodGhpcy5tYWtlT3B0aW9uKCcnLCBsb2NhbGl6ZSgnc2VsZWN0U291cmNlJywgXCJTZWxlY3Qgc291cmNlXCIpLCB0cnVlKSk7XG5cdFx0c291cmNlU2VsZWN0LmFwcGVuZCh0aGlzLm1ha2VPcHRpb24oSXNzdWVTb3VyY2UuVlNDb2RlLCBsb2NhbGl6ZSgndnNjb2RlJywgXCJWaXN1YWwgU3R1ZGlvIENvZGVcIiksIGZhbHNlKSk7XG5cdFx0c291cmNlU2VsZWN0LmFwcGVuZCh0aGlzLm1ha2VPcHRpb24oSXNzdWVTb3VyY2UuRXh0ZW5zaW9uLCBsb2NhbGl6ZSgnZXh0ZW5zaW9uJywgXCJBIFZTIENvZGUgZXh0ZW5zaW9uXCIpLCBmYWxzZSkpO1xuXHRcdGlmICh0aGlzLnByb2R1Y3QucmVwb3J0TWFya2V0cGxhY2VJc3N1ZVVybCkge1xuXHRcdFx0c291cmNlU2VsZWN0LmFwcGVuZCh0aGlzLm1ha2VPcHRpb24oSXNzdWVTb3VyY2UuTWFya2V0cGxhY2UsIGxvY2FsaXplKCdtYXJrZXRwbGFjZScsIFwiRXh0ZW5zaW9ucyBNYXJrZXRwbGFjZVwiKSwgZmFsc2UpKTtcblx0XHR9XG5cblx0XHRpZiAoaXNzdWVUeXBlICE9PSBJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3QpIHtcblx0XHRcdHNvdXJjZVNlbGVjdC5hcHBlbmQodGhpcy5tYWtlT3B0aW9uKElzc3VlU291cmNlLlVua25vd24sIGxvY2FsaXplKCd1bmtub3duJywgXCJEb24ndCBrbm93XCIpLCBmYWxzZSkpO1xuXHRcdH1cblxuXHRcdGlmIChzZWxlY3RlZCAhPT0gLTEgJiYgc2VsZWN0ZWQgPCBzb3VyY2VTZWxlY3Qub3B0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHNvdXJjZVNlbGVjdC5zZWxlY3RlZEluZGV4ID0gc2VsZWN0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvdXJjZVNlbGVjdC5zZWxlY3RlZEluZGV4ID0gMDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0aGlkZSh0aGlzLmdldEVsZW1lbnRCeUlkKCdwcm9ibGVtLXNvdXJjZS1oZWxwLXRleHQnKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlbmRlckJsb2NrcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEZXBlbmRpbmcgb24gSXNzdWUgVHlwZSwgd2UgcmVuZGVyIGRpZmZlcmVudCBibG9ja3MgYW5kIHRleHRcblx0XHRjb25zdCB7IGlzc3VlVHlwZSwgZmlsZU9uRXh0ZW5zaW9uLCBmaWxlT25NYXJrZXRwbGFjZSwgc2VsZWN0ZWRFeHRlbnNpb24gfSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBibG9ja0NvbnRhaW5lciA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2Jsb2NrLWNvbnRhaW5lcicpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHN5c3RlbUJsb2NrID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLXN5c3RlbScpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHByb2Nlc3NCbG9jayA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay1wcm9jZXNzJyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgd29ya3NwYWNlQmxvY2sgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuYmxvY2std29ya3NwYWNlJyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0Jsb2NrID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLWV4dGVuc2lvbnMnKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHBlcmltZW50c0Jsb2NrID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLWV4cGVyaW1lbnRzJyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRGF0YUJsb2NrID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLWV4dGVuc2lvbi1kYXRhJyk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBwcm9ibGVtU291cmNlID0gdGhpcy5nZXRFbGVtZW50QnlJZCgncHJvYmxlbS1zb3VyY2UnKSE7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25UaXRsZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLWRlc2NyaXB0aW9uLWxhYmVsJykhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uU3VidGl0bGUgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS1kZXNjcmlwdGlvbi1zdWJ0aXRsZScpITtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25TZWxlY3RvciA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1zZWxlY3Rpb24nKSE7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZG93bmxvYWRFeHRlbnNpb25EYXRhTGluayA9IDxIVE1MQW5jaG9yRWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24tZGF0YS1kb3dubG9hZCcpITtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRpdGxlVGV4dEFyZWEgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZS1jb250YWluZXInKSE7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25UZXh0QXJlYSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2Rlc2NyaXB0aW9uJykhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvbkRhdGFUZXh0QXJlYSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1kYXRhJykhO1xuXG5cdFx0Ly8gSGlkZSBhbGwgYnkgZGVmYXVsdFxuXHRcdGhpZGUoYmxvY2tDb250YWluZXIpO1xuXHRcdGhpZGUoc3lzdGVtQmxvY2spO1xuXHRcdGhpZGUocHJvY2Vzc0Jsb2NrKTtcblx0XHRoaWRlKHdvcmtzcGFjZUJsb2NrKTtcblx0XHRoaWRlKGV4dGVuc2lvbnNCbG9jayk7XG5cdFx0aGlkZShleHBlcmltZW50c0Jsb2NrKTtcblx0XHRoaWRlKGV4dGVuc2lvblNlbGVjdG9yKTtcblx0XHRoaWRlKGV4dGVuc2lvbkRhdGFUZXh0QXJlYSk7XG5cdFx0aGlkZShleHRlbnNpb25EYXRhQmxvY2spO1xuXHRcdGhpZGUoZG93bmxvYWRFeHRlbnNpb25EYXRhTGluayk7XG5cblx0XHRzaG93KHByb2JsZW1Tb3VyY2UpO1xuXHRcdHNob3codGl0bGVUZXh0QXJlYSk7XG5cdFx0c2hvdyhkZXNjcmlwdGlvblRleHRBcmVhKTtcblxuXHRcdGlmIChmaWxlT25FeHRlbnNpb24pIHtcblx0XHRcdHNob3coZXh0ZW5zaW9uU2VsZWN0b3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbkRhdGEgPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuZXh0ZW5zaW9uRGF0YTtcblx0XHRpZiAoZXh0ZW5zaW9uRGF0YSAmJiBleHRlbnNpb25EYXRhLmxlbmd0aCA+IE1BWF9FWFRFTlNJT05fREFUQV9MRU5HVEgpIHtcblx0XHRcdHNob3coZG93bmxvYWRFeHRlbnNpb25EYXRhTGluayk7XG5cdFx0XHRjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcblx0XHRcdGNvbnN0IGZvcm1hdHRlZERhdGUgPSBkYXRlLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTsgLy8gWVlZWS1NTS1ERFxuXHRcdFx0Y29uc3QgZm9ybWF0dGVkVGltZSA9IGRhdGUudG9UaW1lU3RyaW5nKCkuc3BsaXQoJyAnKVswXS5yZXBsYWNlKC86L2csICctJyk7IC8vIEhILU1NLVNTXG5cdFx0XHRjb25zdCBmaWxlTmFtZSA9IGBleHRlbnNpb25EYXRhXyR7Zm9ybWF0dGVkRGF0ZX1fJHtmb3JtYXR0ZWRUaW1lfS5tZGA7XG5cdFx0XHRjb25zdCBoYW5kbGVMaW5rQ2xpY2sgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRvd25sb2FkUGF0aCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2F2ZUV4dGVuc2lvbkRhdGEnLCBcIlNhdmUgRXh0ZW5zaW9uIERhdGFcIiksXG5cdFx0XHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdLFxuXHRcdFx0XHRcdGRlZmF1bHRVcmk6IGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKFNjaGVtYXMuZmlsZSksIGZpbGVOYW1lKSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGRvd25sb2FkUGF0aCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGRvd25sb2FkUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhleHRlbnNpb25EYXRhKSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGRvd25sb2FkRXh0ZW5zaW9uRGF0YUxpbmsuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVMaW5rQ2xpY2spO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRvd25sb2FkRXh0ZW5zaW9uRGF0YUxpbmsucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVMaW5rQ2xpY2spXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZWN0ZWRFeHRlbnNpb24gJiYgdGhpcy5ub25HaXRIdWJJc3N1ZVVybCkge1xuXHRcdFx0aGlkZSh0aXRsZVRleHRBcmVhKTtcblx0XHRcdGhpZGUoZGVzY3JpcHRpb25UZXh0QXJlYSk7XG5cdFx0XHRyZXNldChkZXNjcmlwdGlvblRpdGxlLCBsb2NhbGl6ZSgnaGFuZGxlc0lzc3Vlc0Vsc2V3aGVyZScsIFwiVGhpcyBleHRlbnNpb24gaGFuZGxlcyBpc3N1ZXMgb3V0c2lkZSBvZiBWUyBDb2RlXCIpKTtcblx0XHRcdHJlc2V0KGRlc2NyaXB0aW9uU3VidGl0bGUsIGxvY2FsaXplKCdlbHNld2hlcmVEZXNjcmlwdGlvbicsIFwiVGhlICd7MH0nIGV4dGVuc2lvbiBwcmVmZXJzIHRvIHVzZSBhbiBleHRlcm5hbCBpc3N1ZSByZXBvcnRlci4gVG8gYmUgdGFrZW4gdG8gdGhhdCBpc3N1ZSByZXBvcnRpbmcgZXhwZXJpZW5jZSwgY2xpY2sgdGhlIGJ1dHRvbiBiZWxvdy5cIiwgc2VsZWN0ZWRFeHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ29wZW5Jc3N1ZVJlcG9ydGVyJywgXCJPcGVuIEV4dGVybmFsIElzc3VlIFJlcG9ydGVyXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlT25FeHRlbnNpb24gJiYgc2VsZWN0ZWRFeHRlbnNpb24/LmRhdGEpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBzZWxlY3RlZEV4dGVuc2lvbj8uZGF0YTtcblx0XHRcdChleHRlbnNpb25EYXRhVGV4dEFyZWEgYXMgSFRNTEVsZW1lbnQpLmlubmVyVGV4dCA9IGRhdGEudG9TdHJpbmcoKTtcblx0XHRcdChleHRlbnNpb25EYXRhVGV4dEFyZWEgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkucmVhZE9ubHkgPSB0cnVlO1xuXHRcdFx0c2hvdyhleHRlbnNpb25EYXRhQmxvY2spO1xuXHRcdH1cblxuXHRcdC8vIG9ubHkgaWYgd2Uga25vdyBjb21lcyBmcm9tIHRoZSBvcGVuIHJlcG9ydGVyIGNvbW1hbmRcblx0XHRpZiAoZmlsZU9uRXh0ZW5zaW9uICYmIHRoaXMub3BlblJlcG9ydGVyKSB7XG5cdFx0XHQoZXh0ZW5zaW9uRGF0YVRleHRBcmVhIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnJlYWRPbmx5ID0gdHJ1ZTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHQvLyBkZWxheSB0byBtYWtlIHN1cmUgZnJvbSBjb21tYW5kIG9yIG5vdFxuXHRcdFx0XHRpZiAodGhpcy5vcGVuUmVwb3J0ZXIpIHtcblx0XHRcdFx0XHRzaG93KGV4dGVuc2lvbkRhdGFCbG9jayk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDEwMCk7XG5cdFx0XHRzaG93KGV4dGVuc2lvbkRhdGFCbG9jayk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLkJ1Zykge1xuXHRcdFx0aWYgKCFmaWxlT25NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRzaG93KGJsb2NrQ29udGFpbmVyKTtcblx0XHRcdFx0c2hvdyhzeXN0ZW1CbG9jayk7XG5cdFx0XHRcdHNob3coZXhwZXJpbWVudHNCbG9jayk7XG5cdFx0XHRcdGlmICghZmlsZU9uRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0c2hvdyhleHRlbnNpb25zQmxvY2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJlc2V0KGRlc2NyaXB0aW9uVGl0bGUsIGxvY2FsaXplKCdzdGVwc1RvUmVwcm9kdWNlJywgXCJTdGVwcyB0byBSZXByb2R1Y2VcIikgKyAnICcsICQoJ3NwYW4ucmVxdWlyZWQtaW5wdXQnLCB1bmRlZmluZWQsICcqJykpO1xuXHRcdFx0cmVzZXQoZGVzY3JpcHRpb25TdWJ0aXRsZSwgbG9jYWxpemUoJ2J1Z0Rlc2NyaXB0aW9uJywgXCJTaGFyZSB0aGUgc3RlcHMgbmVlZGVkIHRvIHJlbGlhYmx5IHJlcHJvZHVjZSB0aGUgcHJvYmxlbS4gUGxlYXNlIGluY2x1ZGUgYWN0dWFsIGFuZCBleHBlY3RlZCByZXN1bHRzLiBXZSBzdXBwb3J0IEdpdEh1Yi1mbGF2b3JlZCBNYXJrZG93bi4gWW91IHdpbGwgYmUgYWJsZSB0byBlZGl0IHlvdXIgaXNzdWUgYW5kIGFkZCBzY3JlZW5zaG90cyB3aGVuIHdlIHByZXZpZXcgaXQgb24gR2l0SHViLlwiKSk7XG5cdFx0fSBlbHNlIGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlKSB7XG5cdFx0XHRpZiAoIWZpbGVPbk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdHNob3coYmxvY2tDb250YWluZXIpO1xuXHRcdFx0XHRzaG93KHN5c3RlbUJsb2NrKTtcblx0XHRcdFx0c2hvdyhwcm9jZXNzQmxvY2spO1xuXHRcdFx0XHRzaG93KHdvcmtzcGFjZUJsb2NrKTtcblx0XHRcdFx0c2hvdyhleHBlcmltZW50c0Jsb2NrKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpbGVPbkV4dGVuc2lvbikge1xuXHRcdFx0XHRzaG93KGV4dGVuc2lvblNlbGVjdG9yKTtcblx0XHRcdH0gZWxzZSBpZiAoIWZpbGVPbk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdHNob3coZXh0ZW5zaW9uc0Jsb2NrKTtcblx0XHRcdH1cblxuXHRcdFx0cmVzZXQoZGVzY3JpcHRpb25UaXRsZSwgbG9jYWxpemUoJ3N0ZXBzVG9SZXByb2R1Y2UnLCBcIlN0ZXBzIHRvIFJlcHJvZHVjZVwiKSArICcgJywgJCgnc3Bhbi5yZXF1aXJlZC1pbnB1dCcsIHVuZGVmaW5lZCwgJyonKSk7XG5cdFx0XHRyZXNldChkZXNjcmlwdGlvblN1YnRpdGxlLCBsb2NhbGl6ZSgncGVyZm9ybWFuY2VJc3N1ZURlc2NpcHRpb24nLCBcIldoZW4gZGlkIHRoaXMgcGVyZm9ybWFuY2UgaXNzdWUgaGFwcGVuPyBEb2VzIGl0IG9jY3VyIG9uIHN0YXJ0dXAgb3IgYWZ0ZXIgYSBzcGVjaWZpYyBzZXJpZXMgb2YgYWN0aW9ucz8gV2Ugc3VwcG9ydCBHaXRIdWItZmxhdm9yZWQgTWFya2Rvd24uIFlvdSB3aWxsIGJlIGFibGUgdG8gZWRpdCB5b3VyIGlzc3VlIGFuZCBhZGQgc2NyZWVuc2hvdHMgd2hlbiB3ZSBwcmV2aWV3IGl0IG9uIEdpdEh1Yi5cIikpO1xuXHRcdH0gZWxzZSBpZiAoaXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3QpIHtcblx0XHRcdHJlc2V0KGRlc2NyaXB0aW9uVGl0bGUsIGxvY2FsaXplKCdkZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIikgKyAnICcsICQoJ3NwYW4ucmVxdWlyZWQtaW5wdXQnLCB1bmRlZmluZWQsICcqJykpO1xuXHRcdFx0cmVzZXQoZGVzY3JpcHRpb25TdWJ0aXRsZSwgbG9jYWxpemUoJ2ZlYXR1cmVSZXF1ZXN0RGVzY3JpcHRpb24nLCBcIlBsZWFzZSBkZXNjcmliZSB0aGUgZmVhdHVyZSB5b3Ugd291bGQgbGlrZSB0byBzZWUuIFdlIHN1cHBvcnQgR2l0SHViLWZsYXZvcmVkIE1hcmtkb3duLiBZb3Ugd2lsbCBiZSBhYmxlIHRvIGVkaXQgeW91ciBpc3N1ZSBhbmQgYWRkIHNjcmVlbnNob3RzIHdoZW4gd2UgcHJldmlldyBpdCBvbiBHaXRIdWIuXCIpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVJbnB1dChpbnB1dElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSAoPEhUTUxJbnB1dEVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZChpbnB1dElkKSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaW5wdXRWYWxpZGF0aW9uTWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoYCR7aW5wdXRJZH0tZW1wdHktZXJyb3JgKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBkZXNjcmlwdGlvblNob3J0TWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoYGRlc2NyaXB0aW9uLXNob3J0LWVycm9yYCk7XG5cdFx0aWYgKGlucHV0SWQgPT09ICdkZXNjcmlwdGlvbicgJiYgdGhpcy5ub25HaXRIdWJJc3N1ZVVybCAmJiB0aGlzLmRhdGEuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoIWlucHV0RWxlbWVudC52YWx1ZSkge1xuXHRcdFx0aW5wdXRFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdGlucHV0VmFsaWRhdGlvbk1lc3NhZ2U/LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdFx0ZGVzY3JpcHRpb25TaG9ydE1lc3NhZ2U/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAoaW5wdXRJZCA9PT0gJ2Rlc2NyaXB0aW9uJyAmJiBpbnB1dEVsZW1lbnQudmFsdWUubGVuZ3RoIDwgMTApIHtcblx0XHRcdGlucHV0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRkZXNjcmlwdGlvblNob3J0TWVzc2FnZT8uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0XHRpbnB1dFZhbGlkYXRpb25NZXNzYWdlPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5wdXRFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdGlucHV0VmFsaWRhdGlvbk1lc3NhZ2U/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0aWYgKGlucHV0SWQgPT09ICdkZXNjcmlwdGlvbicpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25TaG9ydE1lc3NhZ2U/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlSW5wdXRzKCk6IGJvb2xlYW4ge1xuXHRcdGxldCBpc1ZhbGlkID0gdHJ1ZTtcblx0XHRbJ2lzc3VlLXRpdGxlJywgJ2Rlc2NyaXB0aW9uJywgJ2lzc3VlLXNvdXJjZSddLmZvckVhY2goZWxlbWVudElkID0+IHtcblx0XHRcdGlzVmFsaWQgPSB0aGlzLnZhbGlkYXRlSW5wdXQoZWxlbWVudElkKSAmJiBpc1ZhbGlkO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmZpbGVPbkV4dGVuc2lvbigpKSB7XG5cdFx0XHRpc1ZhbGlkID0gdGhpcy52YWxpZGF0ZUlucHV0KCdleHRlbnNpb24tc2VsZWN0b3InKSAmJiBpc1ZhbGlkO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc1ZhbGlkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN1Ym1pdFRvR2l0SHViKGlzc3VlVGl0bGU6IHN0cmluZywgaXNzdWVCb2R5OiBzdHJpbmcsIGdpdEh1YkRldGFpbHM6IHsgb3duZXI6IHN0cmluZzsgcmVwb3NpdG9yeU5hbWU6IHN0cmluZyB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgdXJsID0gYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvJHtnaXRIdWJEZXRhaWxzLm93bmVyfS8ke2dpdEh1YkRldGFpbHMucmVwb3NpdG9yeU5hbWV9L2lzc3Vlc2A7XG5cdFx0Y29uc3QgaW5pdCA9IHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0aXRsZTogaXNzdWVUaXRsZSxcblx0XHRcdFx0Ym9keTogaXNzdWVCb2R5XG5cdFx0XHR9KSxcblx0XHRcdGhlYWRlcnM6IG5ldyBIZWFkZXJzKHtcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VufWAsXG5cdFx0XHRcdCdVc2VyLUFnZW50JzogJ3JlcXVlc3QnXG5cdFx0XHR9KVxuXHRcdH07XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgaW5pdCk7XG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0Y29uc29sZS5lcnJvcignSW52YWxpZCBHaXRIdWIgVVJMIHByb3ZpZGVkLicpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0YXdhaXQgdGhpcy5vcGVuTGluayhyZXN1bHQuaHRtbF91cmwpO1xuXHRcdHRoaXMuY2xvc2UoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjcmVhdGVJc3N1ZShzaG91bGRDcmVhdGU/OiBib29sZWFuLCBwcml2YXRlVXJpPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkRXh0ZW5zaW9uID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLnNlbGVjdGVkRXh0ZW5zaW9uO1xuXHRcdC8vIFNob3J0IGNpcmN1aXQgaWYgdGhlIGV4dGVuc2lvbiBwcm92aWRlcyBhIGN1c3RvbSBpc3N1ZSBoYW5kbGVyXG5cdFx0aWYgKHRoaXMubm9uR2l0SHViSXNzdWVVcmwpIHtcblx0XHRcdGNvbnN0IHVybCA9IHRoaXMuZ2V0RXh0ZW5zaW9uQnVnc1VybCgpO1xuXHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHR0aGlzLmhhc0JlZW5TdWJtaXR0ZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudmFsaWRhdGVJbnB1dHMoKSkge1xuXHRcdFx0Ly8gSWYgaW5wdXRzIGFyZSBpbnZhbGlkLCBzZXQgZm9jdXMgdG8gdGhlIGZpcnN0IG9uZSBhbmQgYWRkIGxpc3RlbmVycyBvbiB0aGVtXG5cdFx0XHQvLyB0byBkZXRlY3QgZnVydGhlciBjaGFuZ2VzXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGludmFsaWRJbnB1dCA9IHRoaXMud2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdGlmIChpbnZhbGlkSW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdCg8SFRNTElucHV0RWxlbWVudD5pbnZhbGlkSW5wdXRbMF0pLmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtdGl0bGUnLCAnaW5wdXQnLCBfID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdpc3N1ZS10aXRsZScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZGVzY3JpcHRpb24nLCAnaW5wdXQnLCBfID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtc291cmNlJywgJ2NoYW5nZScsIF8gPT4ge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlSW5wdXQoJ2lzc3VlLXNvdXJjZScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5maWxlT25FeHRlbnNpb24oKSkge1xuXHRcdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2V4dGVuc2lvbi1zZWxlY3RvcicsICdjaGFuZ2UnLCBfID0+IHtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlSW5wdXQoJ2V4dGVuc2lvbi1zZWxlY3RvcicpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuaGFzQmVlblN1Ym1pdHRlZCA9IHRydWU7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpc3N1ZVRpdGxlID0gKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykpLnZhbHVlO1xuXHRcdGNvbnN0IGlzc3VlQm9keSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnNlcmlhbGl6ZSgpO1xuXG5cdFx0bGV0IGlzc3VlVXJsID0gcHJpdmF0ZVVyaSA/IHRoaXMuZ2V0UHJpdmF0ZUlzc3VlVXJsKCkgOiB0aGlzLmdldElzc3VlVXJsKCk7XG5cdFx0aWYgKCFpc3N1ZVVybCkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgTm8gJHtwcml2YXRlVXJpID8gJ3ByaXZhdGUgJyA6ICcnfWlzc3VlIHVybCBmb3VuZGApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoc2VsZWN0ZWRFeHRlbnNpb24/LnVyaSkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShzZWxlY3RlZEV4dGVuc2lvbi51cmkpO1xuXHRcdFx0aXNzdWVVcmwgPSB1cmkudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBnaXRIdWJEZXRhaWxzID0gdGhpcy5wYXJzZUdpdEh1YlVybChpc3N1ZVVybCk7XG5cdFx0aWYgKHRoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbiAmJiBnaXRIdWJEZXRhaWxzICYmIHNob3VsZENyZWF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3VibWl0VG9HaXRIdWIoaXNzdWVUaXRsZSwgaXNzdWVCb2R5LCBnaXRIdWJEZXRhaWxzKTtcblx0XHR9XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBiYXNlVXJsID0gdGhpcy5nZXRJc3N1ZVVybFdpdGhUaXRsZSgoPEhUTUxJbnB1dEVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdGl0bGUnKSkudmFsdWUsIGlzc3VlVXJsKTtcblx0XHRsZXQgdXJsID0gYmFzZVVybCArIGAmYm9keT0ke2VuY29kZVVSSUNvbXBvbmVudChpc3N1ZUJvZHkpfWA7XG5cblx0XHR1cmwgPSB0aGlzLmFkZFRlbXBsYXRlVG9VcmwodXJsLCBnaXRIdWJEZXRhaWxzPy5vd25lciwgZ2l0SHViRGV0YWlscz8ucmVwb3NpdG9yeU5hbWUpO1xuXG5cdFx0aWYgKHVybC5sZW5ndGggPiBNQVhfVVJMX0xFTkdUSCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dXJsID0gYXdhaXQgdGhpcy53cml0ZVRvQ2xpcGJvYXJkKGJhc2VVcmwsIGlzc3VlQm9keSk7XG5cdFx0XHRcdHVybCA9IHRoaXMuYWRkVGVtcGxhdGVUb1VybCh1cmwsIGdpdEh1YkRldGFpbHM/Lm93bmVyLCBnaXRIdWJEZXRhaWxzPy5yZXBvc2l0b3J5TmFtZSk7XG5cdFx0XHR9IGNhdGNoIChfKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ1dyaXRpbmcgdG8gY2xpcGJvYXJkIGZhaWxlZCcpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5vcGVuTGluayh1cmwpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgd3JpdGVUb0NsaXBib2FyZChiYXNlVXJsOiBzdHJpbmcsIGlzc3VlQm9keTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzaG91bGRXcml0ZSA9IGF3YWl0IHRoaXMuaXNzdWVGb3JtU2VydmljZS5zaG93Q2xpcGJvYXJkRGlhbG9nKCk7XG5cdFx0aWYgKCFzaG91bGRXcml0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJhc2VVcmwgKyBgJmJvZHk9JHtlbmNvZGVVUklDb21wb25lbnQobG9jYWxpemUoJ3Bhc3RlRGF0YScsIFwiV2UgaGF2ZSB3cml0dGVuIHRoZSBuZWVkZWQgZGF0YSBpbnRvIHlvdXIgY2xpcGJvYXJkIGJlY2F1c2UgaXQgd2FzIHRvbyBsYXJnZSB0byBzZW5kLiBQbGVhc2UgcGFzdGUuXCIpKX1gO1xuXHR9XG5cblx0cHVibGljIGFkZFRlbXBsYXRlVG9VcmwoYmFzZVVybDogc3RyaW5nLCBvd25lcj86IHN0cmluZywgcmVwb3NpdG9yeU5hbWU/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGlzVnNjb2RlID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLmZpbGVPblByb2R1Y3Q7XG5cdFx0Y29uc3QgaXNNaWNyb3NvZnQgPSBvd25lcj8udG9Mb3dlckNhc2UoKSA9PT0gJ21pY3Jvc29mdCc7XG5cdFx0Y29uc3QgbmVlZHNUZW1wbGF0ZSA9IGlzVnNjb2RlIHx8IChpc01pY3Jvc29mdCAmJiAocmVwb3NpdG9yeU5hbWUgPT09ICd2c2NvZGUnIHx8IHJlcG9zaXRvcnlOYW1lID09PSAndnNjb2RlLXB5dGhvbicpKTtcblxuXHRcdGlmIChuZWVkc1RlbXBsYXRlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKGJhc2VVcmwpO1xuXHRcdFx0XHR1cmwuc2VhcmNoUGFyYW1zLnNldCgndGVtcGxhdGUnLCAnYnVnX3JlcG9ydC5tZCcpO1xuXHRcdFx0XHRyZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gZmFsbGJhY2sgaWYgYmFzZVVybCBpcyBub3QgYSB2YWxpZCBVUkxcblx0XHRcdFx0cmV0dXJuIGJhc2VVcmwgKyAnJnRlbXBsYXRlPWJ1Z19yZXBvcnQubWQnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYmFzZVVybDtcblx0fVxuXG5cdHB1YmxpYyBnZXRJc3N1ZVVybCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5maWxlT25FeHRlbnNpb24oKVxuXHRcdFx0PyB0aGlzLmdldEV4dGVuc2lvbkdpdEh1YlVybCgpXG5cdFx0XHQ6IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5maWxlT25NYXJrZXRwbGFjZVxuXHRcdFx0XHQ/IHRoaXMucHJvZHVjdC5yZXBvcnRNYXJrZXRwbGFjZUlzc3VlVXJsIVxuXHRcdFx0XHQ6IHRoaXMucHJvZHVjdC5yZXBvcnRJc3N1ZVVybCE7XG5cdH1cblxuXHQvLyBmb3Igd2hlbiBjb21tYW5kICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyJyBwYXNzZXMgYWxvbmcgYVxuXHQvLyBgcHJpdmF0ZVVyaWAgVXJpQ29tcG9uZW50cyB2YWx1ZVxuXHRwdWJsaWMgZ2V0UHJpdmF0ZUlzc3VlVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIFVSSS5yZXZpdmUodGhpcy5kYXRhLnByaXZhdGVVcmkpPy50b1N0cmluZygpO1xuXHR9XG5cblx0cHVibGljIHBhcnNlR2l0SHViVXJsKHVybDogc3RyaW5nKTogdW5kZWZpbmVkIHwgeyByZXBvc2l0b3J5TmFtZTogc3RyaW5nOyBvd25lcjogc3RyaW5nIH0ge1xuXHRcdC8vIEFzc3VtZXMgYSBHaXRIdWIgdXJsIHRvIGEgcGFydGljdWxhciByZXBvLCBodHRwczovL2dpdGh1Yi5jb20vcmVwb3NpdG9yeU5hbWUvb3duZXIuXG5cdFx0Ly8gUmVwb3NpdG9yeSBuYW1lIGFuZCBvd25lciBjYW5ub3QgY29udGFpbiAnLydcblx0XHRjb25zdCBtYXRjaCA9IC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXlxcL10qKVxcLyhbXlxcL10qKS4qLy5leGVjKHVybCk7XG5cdFx0aWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b3duZXI6IG1hdGNoWzFdLFxuXHRcdFx0XHRyZXBvc2l0b3J5TmFtZTogbWF0Y2hbMl1cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ05vIEdpdEh1YiBpc3N1ZXMgbWF0Y2gnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25HaXRIdWJVcmwoKTogc3RyaW5nIHtcblx0XHRsZXQgcmVwb3NpdG9yeVVybCA9ICcnO1xuXHRcdGNvbnN0IGJ1Z3NVcmwgPSB0aGlzLmdldEV4dGVuc2lvbkJ1Z3NVcmwoKTtcblx0XHRjb25zdCBleHRlbnNpb25VcmwgPSB0aGlzLmdldEV4dGVuc2lvblJlcG9zaXRvcnlVcmwoKTtcblx0XHQvLyBJZiBnaXZlbiwgdHJ5IHRvIG1hdGNoIHRoZSBleHRlbnNpb24ncyBidWcgdXJsXG5cdFx0aWYgKGJ1Z3NVcmwgJiYgYnVnc1VybC5tYXRjaCgvXmh0dHBzPzpcXC9cXC9naXRodWJcXC5jb21cXC8oW15cXC9dKilcXC8oW15cXC9dKilcXC8/KFxcL2lzc3Vlcyk/JC8pKSB7XG5cdFx0XHQvLyBtYXRjaGVzIGV4YWN0bHk6IGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL2lzc3Vlc1xuXHRcdFx0cmVwb3NpdG9yeVVybCA9IG5vcm1hbGl6ZUdpdEh1YlVybChidWdzVXJsKTtcblx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvblVybCAmJiBleHRlbnNpb25VcmwubWF0Y2goL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteXFwvXSopXFwvKFteXFwvXSopJC8pKSB7XG5cdFx0XHQvLyBtYXRjaGVzIGV4YWN0bHk6IGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvXG5cdFx0XHRyZXBvc2l0b3J5VXJsID0gbm9ybWFsaXplR2l0SHViVXJsKGV4dGVuc2lvblVybCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm9uR2l0SHViSXNzdWVVcmwgPSB0cnVlO1xuXHRcdFx0cmVwb3NpdG9yeVVybCA9IGJ1Z3NVcmwgfHwgZXh0ZW5zaW9uVXJsIHx8ICcnO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXBvc2l0b3J5VXJsO1xuXHR9XG5cblx0cHVibGljIGdldElzc3VlVXJsV2l0aFRpdGxlKGlzc3VlVGl0bGU6IHN0cmluZywgcmVwb3NpdG9yeVVybDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZmlsZU9uRXh0ZW5zaW9uKCkpIHtcblx0XHRcdHJlcG9zaXRvcnlVcmwgPSByZXBvc2l0b3J5VXJsICsgJy9pc3N1ZXMvbmV3Jztcblx0XHR9XG5cblx0XHRjb25zdCBxdWVyeVN0cmluZ1ByZWZpeCA9IHJlcG9zaXRvcnlVcmwuaW5kZXhPZignPycpID09PSAtMSA/ICc/JyA6ICcmJztcblx0XHRyZXR1cm4gYCR7cmVwb3NpdG9yeVVybH0ke3F1ZXJ5U3RyaW5nUHJlZml4fXRpdGxlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGlzc3VlVGl0bGUpfWA7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJFeHRlbnNpb25EYXRhKCk6IHZvaWQge1xuXHRcdHRoaXMubm9uR2l0SHViSXNzdWVVcmwgPSBmYWxzZTtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBleHRlbnNpb25EYXRhOiB1bmRlZmluZWQgfSk7XG5cdFx0dGhpcy5kYXRhLmlzc3VlQm9keSA9IHRoaXMuZGF0YS5pc3N1ZUJvZHkgfHwgJyc7XG5cdFx0dGhpcy5kYXRhLmRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5kYXRhLnVyaSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRhdGEucHJpdmF0ZVVyaSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVFeHRlbnNpb25TdGF0dXMoZXh0ZW5zaW9uOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YSkge1xuXHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IHNlbGVjdGVkRXh0ZW5zaW9uOiBleHRlbnNpb24gfSk7XG5cblx0XHQvLyB1c2VzIHRoaXMuY29uZmlndXVyYXRpb24uZGF0YSB0byBlbnN1cmUgdGhhdCBkYXRhIGlzIGNvbWluZyBmcm9tIGBvcGVuUmVwb3J0ZXJgIGNvbW1hbmQuXG5cdFx0Y29uc3QgdGVtcGxhdGUgPSB0aGlzLmRhdGEuaXNzdWVCb2R5O1xuXHRcdGlmICh0ZW1wbGF0ZSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvblRleHRBcmVhID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnZGVzY3JpcHRpb24nKSE7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvblRleHQgPSAoZGVzY3JpcHRpb25UZXh0QXJlYSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZTtcblx0XHRcdGlmIChkZXNjcmlwdGlvblRleHQgPT09ICcnIHx8ICFkZXNjcmlwdGlvblRleHQuaW5jbHVkZXModGVtcGxhdGUudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0Y29uc3QgZnVsbFRleHRBcmVhID0gZGVzY3JpcHRpb25UZXh0ICsgKGRlc2NyaXB0aW9uVGV4dCA9PT0gJycgPyAnJyA6ICdcXG4nKSArIHRlbXBsYXRlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdChkZXNjcmlwdGlvblRleHRBcmVhIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnZhbHVlID0gZnVsbFRleHRBcmVhO1xuXHRcdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBpc3N1ZURlc2NyaXB0aW9uOiBmdWxsVGV4dEFyZWEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuZGF0YS5kYXRhO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBleHRlbnNpb25EYXRhOiBkYXRhIH0pO1xuXHRcdFx0ZXh0ZW5zaW9uLmRhdGEgPSBkYXRhO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBleHRlbnNpb25EYXRhQmxvY2sgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuYmxvY2stZXh0ZW5zaW9uLWRhdGEnKSE7XG5cdFx0XHRzaG93KGV4dGVuc2lvbkRhdGFCbG9jayk7XG5cdFx0XHR0aGlzLnJlbmRlckJsb2NrcygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IHRoaXMuZGF0YS51cmk7XG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0ZXh0ZW5zaW9uLnVyaSA9IHVyaTtcblx0XHRcdHRoaXMudXBkYXRlSXNzdWVSZXBvcnRlclVyaShleHRlbnNpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsaWRhdGVTZWxlY3RlZEV4dGVuc2lvbigpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRpdGxlID0gKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykpLnZhbHVlO1xuXHRcdHRoaXMuc2VhcmNoRXh0ZW5zaW9uSXNzdWVzKHRpdGxlKTtcblxuXHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0dGhpcy5yZW5kZXJCbG9ja3MoKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVNlbGVjdGVkRXh0ZW5zaW9uKCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvblZhbGlkYXRpb25NZXNzYWdlID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uLXNlbGVjdGlvbi12YWxpZGF0aW9uLWVycm9yJykhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvblZhbGlkYXRpb25Ob1VybHNNZXNzYWdlID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uLXNlbGVjdGlvbi12YWxpZGF0aW9uLWVycm9yLW5vLXVybCcpITtcblx0XHRoaWRlKGV4dGVuc2lvblZhbGlkYXRpb25NZXNzYWdlKTtcblx0XHRoaWRlKGV4dGVuc2lvblZhbGlkYXRpb25Ob1VybHNNZXNzYWdlKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubG9hZGluZ0V4dGVuc2lvbkRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNWYWxpZEdpdEh1YlVybCA9IHRoaXMuZ2V0RXh0ZW5zaW9uR2l0SHViVXJsKCk7XG5cdFx0aWYgKGhhc1ZhbGlkR2l0SHViVXJsKSB7XG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXRFeHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSgpO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRMb2FkaW5nKGVsZW1lbnQ6IEhUTUxFbGVtZW50KSB7XG5cdFx0Ly8gU2hvdyBsb2FkaW5nXG5cdFx0dGhpcy5vcGVuUmVwb3J0ZXIgPSB0cnVlO1xuXHRcdHRoaXMubG9hZGluZ0V4dGVuc2lvbkRhdGEgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25EYXRhQ2FwdGlvbiA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1pZCcpITtcblx0XHRoaWRlKGV4dGVuc2lvbkRhdGFDYXB0aW9uKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvbkRhdGFDYXB0aW9uMiA9IEFycmF5LmZyb20odGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmV4dC1wYXJlbnMnKSk7XG5cdFx0ZXh0ZW5zaW9uRGF0YUNhcHRpb24yLmZvckVhY2goZXh0ZW5zaW9uRGF0YUNhcHRpb24yID0+IGhpZGUoZXh0ZW5zaW9uRGF0YUNhcHRpb24yKSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzaG93TG9hZGluZyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dC1sb2FkaW5nJykhO1xuXHRcdHNob3coc2hvd0xvYWRpbmcpO1xuXHRcdHdoaWxlIChzaG93TG9hZGluZy5maXJzdENoaWxkKSB7XG5cdFx0XHRzaG93TG9hZGluZy5maXJzdENoaWxkLnJlbW92ZSgpO1xuXHRcdH1cblx0XHRzaG93TG9hZGluZy5hcHBlbmQoZWxlbWVudCk7XG5cblx0XHR0aGlzLnJlbmRlckJsb2NrcygpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUxvYWRpbmcoZWxlbWVudDogSFRNTEVsZW1lbnQsIGZyb21SZXBvcnRlcjogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0dGhpcy5vcGVuUmVwb3J0ZXIgPSBmcm9tUmVwb3J0ZXI7XG5cdFx0dGhpcy5sb2FkaW5nRXh0ZW5zaW9uRGF0YSA9IGZhbHNlO1xuXHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25EYXRhQ2FwdGlvbiA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1pZCcpITtcblx0XHRzaG93KGV4dGVuc2lvbkRhdGFDYXB0aW9uKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvbkRhdGFDYXB0aW9uMiA9IEFycmF5LmZyb20odGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmV4dC1wYXJlbnMnKSk7XG5cdFx0ZXh0ZW5zaW9uRGF0YUNhcHRpb24yLmZvckVhY2goZXh0ZW5zaW9uRGF0YUNhcHRpb24yID0+IHNob3coZXh0ZW5zaW9uRGF0YUNhcHRpb24yKSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBoaWRlTG9hZGluZyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dC1sb2FkaW5nJykhO1xuXHRcdGhpZGUoaGlkZUxvYWRpbmcpO1xuXHRcdGlmIChoaWRlTG9hZGluZy5maXJzdENoaWxkKSB7XG5cdFx0XHRlbGVtZW50LnJlbW92ZSgpO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlckJsb2NrcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFeHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSgpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1zZWxlY3Rpb24tdmFsaWRhdGlvbi1lcnJvcicpITtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25WYWxpZGF0aW9uTm9VcmxzTWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1zZWxlY3Rpb24tdmFsaWRhdGlvbi1lcnJvci1uby11cmwnKSE7XG5cdFx0Y29uc3QgYnVnc1VybCA9IHRoaXMuZ2V0RXh0ZW5zaW9uQnVnc1VybCgpO1xuXHRcdGlmIChidWdzVXJsKSB7XG5cdFx0XHRzaG93KGV4dGVuc2lvblZhbGlkYXRpb25NZXNzYWdlKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgbGluayA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbkJ1Z3NMaW5rJykhO1xuXHRcdFx0bGluay50ZXh0Q29udGVudCA9IGJ1Z3NVcmw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uVXJsID0gdGhpcy5nZXRFeHRlbnNpb25SZXBvc2l0b3J5VXJsKCk7XG5cdFx0aWYgKGV4dGVuc2lvblVybCkge1xuXHRcdFx0c2hvdyhleHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGxpbmsgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb25CdWdzTGluaycpO1xuXHRcdFx0bGluayEudGV4dENvbnRlbnQgPSBleHRlbnNpb25Vcmw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2hvdyhleHRlbnNpb25WYWxpZGF0aW9uTm9VcmxzTWVzc2FnZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVByb2Nlc3NJbmZvKHN0YXRlOiBJc3N1ZVJlcG9ydGVyTW9kZWxEYXRhKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLXByb2Nlc3MgLmJsb2NrLWluZm8nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRyZXNldCh0YXJnZXQsICQoJ2NvZGUnLCB1bmRlZmluZWQsIHN0YXRlLnByb2Nlc3NJbmZvID8/ICcnKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXb3Jrc3BhY2VJbmZvKHN0YXRlOiBJc3N1ZVJlcG9ydGVyTW9kZWxEYXRhKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0dGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLXdvcmtzcGFjZSAuYmxvY2staW5mbyBjb2RlJykhLnRleHRDb250ZW50ID0gJ1xcbicgKyBzdGF0ZS53b3Jrc3BhY2VJbmZvO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUV4dGVuc2lvblRhYmxlKGV4dGVuc2lvbnM6IElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhW10sIG51bVRoZW1lRXh0ZW5zaW9uczogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5ibG9jay1leHRlbnNpb25zIC5ibG9jay1pbmZvJyk7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0aWYgKHRoaXMuZGlzYWJsZUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0cmVzZXQodGFyZ2V0LCBsb2NhbGl6ZSgnZGlzYWJsZWRFeHRlbnNpb25zJywgXCJFeHRlbnNpb25zIGFyZSBkaXNhYmxlZFwiKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGhlbWVFeGNsdXNpb25TdHIgPSBudW1UaGVtZUV4dGVuc2lvbnMgPyBgXFxuKCR7bnVtVGhlbWVFeHRlbnNpb25zfSB0aGVtZSBleHRlbnNpb25zIGV4Y2x1ZGVkKWAgOiAnJztcblx0XHRcdGV4dGVuc2lvbnMgPSBleHRlbnNpb25zIHx8IFtdO1xuXG5cdFx0XHRpZiAoIWV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRhcmdldC5pbm5lclRleHQgPSAnRXh0ZW5zaW9uczogbm9uZScgKyB0aGVtZUV4Y2x1c2lvblN0cjtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXNldCh0YXJnZXQsIHRoaXMuZ2V0RXh0ZW5zaW9uVGFibGVIdG1sKGV4dGVuc2lvbnMpLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh0aGVtZUV4Y2x1c2lvblN0cikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uVGFibGVIdG1sKGV4dGVuc2lvbnM6IElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhW10pOiBIVE1MVGFibGVFbGVtZW50IHtcblx0XHRyZXR1cm4gJCgndGFibGUnLCB1bmRlZmluZWQsXG5cdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0JCgndGgnLCB1bmRlZmluZWQsICdFeHRlbnNpb24nKSxcblx0XHRcdFx0JCgndGgnLCB1bmRlZmluZWQsICdBdXRob3IgKHRydW5jYXRlZCknIGFzIHN0cmluZyksXG5cdFx0XHRcdCQoJ3RoJywgdW5kZWZpbmVkLCAnVmVyc2lvbicpXG5cdFx0XHQpLFxuXHRcdFx0Li4uZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+ICQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLm5hbWUpLFxuXHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLnB1Ymxpc2hlcj8uc3Vic3RyKDAsIDMpID8/ICdOL0EnKSxcblx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi52ZXJzaW9uKVxuXHRcdFx0KSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuTGluayhldmVudE9yVXJsOiBNb3VzZUV2ZW50IHwgc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiBldmVudE9yVXJsID09PSAnc3RyaW5nJykge1xuXHRcdFx0Ly8gRGlyZWN0IFVSTCBjYWxsXG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihldmVudE9yVXJsLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTW91c2VFdmVudCBjYWxsXG5cdFx0XHRjb25zdCBldmVudCA9IGV2ZW50T3JVcmw7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHQvLyBFeGNsdWRlIHJpZ2h0IGNsaWNrXG5cdFx0XHRpZiAoZXZlbnQud2hpY2ggPCAzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKCg8SFRNTEFuY2hvckVsZW1lbnQ+ZXZlbnQudGFyZ2V0KS5ocmVmLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWxlbWVudEJ5SWQ8VCBleHRlbmRzIEhUTUxFbGVtZW50ID0gSFRNTEVsZW1lbnQ+KGVsZW1lbnRJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMud2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGVsZW1lbnRJZCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZEV2ZW50TGlzdGVuZXIoZWxlbWVudElkOiBzdHJpbmcsIGV2ZW50VHlwZTogc3RyaW5nLCBoYW5kbGVyOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoZWxlbWVudElkKTtcblx0XHRlbGVtZW50Py5hZGRFdmVudExpc3RlbmVyKGV2ZW50VHlwZSwgaGFuZGxlcik7XG5cdH1cbn1cblxuLy8gaGVscGVyIGZ1bmN0aW9uc1xuXG5leHBvcnQgZnVuY3Rpb24gaGlkZShlbDogRWxlbWVudCB8IHVuZGVmaW5lZCB8IG51bGwpIHtcblx0ZWw/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHNob3coZWw6IEVsZW1lbnQgfCB1bmRlZmluZWQgfCBudWxsKSB7XG5cdGVsPy5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxHQUFHLG9CQUFvQix1QkFBdUIsYUFBYTtBQUNwRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFFBQVEsb0JBQW9CLDRCQUE0QjtBQUNqRSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsd0JBQXdCO0FBQzFDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYSxtQkFBbUI7QUFFekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBa0UsaUJBQWlCO0FBQzVGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQXVFO0FBQ2hGLFNBQVMsOEJBQThCO0FBRXZDLE1BQU0saUJBQWlCO0FBTXZCLE1BQU0sNEJBQTRCO0FBUWxDLElBQUssY0FBTCxrQkFBS0EsaUJBQUw7QUFDQyxFQUFBQSxhQUFBLFlBQVM7QUFDVCxFQUFBQSxhQUFBLGVBQVk7QUFDWixFQUFBQSxhQUFBLGlCQUFjO0FBQ2QsRUFBQUEsYUFBQSxhQUFVO0FBSk4sU0FBQUE7QUFBQSxHQUFBO0FBUUUsSUFBTSwyQkFB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
