import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { OS } from "../../../../base/common/platform.js";
import "./media/issueReporterOverlay.css";
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getWindow } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { isRemoteDiagnosticError } from "../../../../platform/diagnostics/common/diagnostics.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import product from "../../../../platform/product/common/product.js";
import { URI } from "../../../../base/common/uri.js";
import { normalizeGitHubUrl } from "../common/issueReporterUtil.js";
import { IssueSource, IssueType } from "../common/issue.js";
import { IssueReporterModel } from "./issueReporterModel.js";
import { RecordingState } from "./recordingService.js";
import { ScreenshotAnnotationEditor } from "./screenshotAnnotation.js";
const MAX_ATTACHMENTS = 5;
const MAX_SIMILAR_ISSUES = 5;
var WizardStep = /* @__PURE__ */ ((WizardStep2) => {
  WizardStep2[WizardStep2["Attachments"] = 0] = "Attachments";
  WizardStep2[WizardStep2["Describe"] = 1] = "Describe";
  WizardStep2[WizardStep2["Review"] = 2] = "Review";
  return WizardStep2;
})(WizardStep || {});
const STEP_COUNT = 3;
class IssueReporterOverlay {
  constructor(data, recordingSupported = false, container, contextViewService, contextMenuProvider, markdownRendererService, initialHideToolbar = true, resolveExtensionIssueData, openExternalLink, showUpdateBanner = false, refreshPerformanceInfo, resolveKeybinding) {
    this.data = data;
    this.recordingSupported = recordingSupported;
    this.container = container;
    this.contextViewService = contextViewService;
    this.contextMenuProvider = contextMenuProvider;
    this.markdownRendererService = markdownRendererService;
    this.resolveExtensionIssueData = resolveExtensionIssueData;
    this.openExternalLink = openExternalLink;
    this.showUpdateBanner = showUpdateBanner;
    this.refreshPerformanceInfo = refreshPerformanceInfo;
    this.resolveKeybinding = resolveKeybinding;
    this.disposables = new DisposableStore();
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._onDidSubmit = new Emitter();
    this.onDidSubmit = this._onDidSubmit.event;
    this._onDidRequestScreenshot = new Emitter();
    this.onDidRequestScreenshot = this._onDidRequestScreenshot.event;
    this._onDidRequestStartRecording = new Emitter();
    this.onDidRequestStartRecording = this._onDidRequestStartRecording.event;
    this._onDidRequestStopRecording = new Emitter();
    this.onDidRequestStopRecording = this._onDidRequestStopRecording.event;
    this._onDidRequestOpenRecording = new Emitter();
    this.onDidRequestOpenRecording = this._onDidRequestOpenRecording.event;
    this._onDidRequestOpenScreenshot = new Emitter();
    this.onDidRequestOpenScreenshot = this._onDidRequestOpenScreenshot.event;
    this._onDidChangeAttachments = new Emitter();
    /** Fires whenever the screenshot/recording collection changes so the host can persist it. */
    this.onDidChangeAttachments = this._onDidChangeAttachments.event;
    this.stepPages = [];
    // Step 1: Describe (category + description + title)
    this.issueTypeButtons = [];
    this.issueSourceButtons = [];
    this.extensionOptions = [];
    this.didAttemptDescribeSubmit = false;
    this.similarIssuesRequest = 0;
    this.extensionDataRequest = 0;
    this._onDidRequestGenerateTitle = new Emitter();
    this.onDidRequestGenerateTitle = this._onDidRequestGenerateTitle.event;
    this.screenshotDelay = 0;
    this.recordingStartTime = 0;
    this.currentRecordingState = RecordingState.Idle;
    this.delayedScreenshotPending = false;
    this.recordings = [];
    // Step 2: Review
    this.reviewThumbCards = [];
    this.reviewRenderDisposables = new DisposableStore();
    this.similarIssuesDisposables = new DisposableStore();
    this.descriptionGuidanceDisposables = new DisposableStore();
    this.uploading = false;
    this.includeSystemInfo = true;
    this.includeProcessInfo = true;
    this.includeWorkspaceInfo = true;
    this.includeExtensions = true;
    this.includeExperiments = true;
    this.includeExtensionData = false;
    this.diagnosticsCollapsed = false;
    this.performanceInfoLoaded = false;
    this.performanceInfoRefreshing = false;
    // Progress dots
    this.progressDots = [];
    this.currentStep = 0 /* Attachments */;
    this.screenshots = [];
    this.visible = false;
    this.previewOpened = false;
    this._hideToolbarInScreenshots = true;
    this._hideToolbarInScreenshots = initialHideToolbar;
    const hasStandaloneExtensionData = !!data.data && !data.extensionId;
    this.includeExtensionData = hasStandaloneExtensionData;
    this.model = new IssueReporterModel({
      ...data,
      issueType: data.issueType || IssueType.Bug,
      allExtensions: data.enabledExtensions,
      extensionData: hasStandaloneExtensionData ? data.data : void 0,
      includeSystemInfo: true,
      includeWorkspaceInfo: true,
      includeProcessInfo: true,
      includeExtensions: true,
      includeExperiments: true,
      includeExtensionData: hasStandaloneExtensionData
    });
    this.selectedIssueType = data.issueType;
    this.selectedIssueSource = data.issueSource ?? (data.extensionId ? IssueSource.Extension : void 0);
    this.createWizard();
  }
  createWizard() {
    this.wizardPanel = $("div.issue-reporter-wizard");
    this.wizardPanel.setAttribute("role", "dialog");
    this.wizardPanel.setAttribute("aria-label", localize("reportIssue", "Report Issue"));
    this.wizardPanel.setAttribute("tabindex", "-1");
    const toolbar = append(this.wizardPanel, $("div.wizard-toolbar"));
    const progressArea = append(toolbar, $("div.wizard-progress-area"));
    const progressDotsContainer = append(progressArea, $("div.wizard-progress-dots"));
    for (let i = 0; i < STEP_COUNT; i++) {
      const dot = append(progressDotsContainer, $("div.wizard-progress-dot"));
      this.progressDots.push(dot);
    }
    this.stepIndicator = append(progressArea, $("span.wizard-step-indicator"));
    append(progressArea, $("span.wizard-step-separator"));
    this.stepLabel = append(progressArea, $("span.wizard-step-label"));
    const nav = append(toolbar, $("div.wizard-nav"));
    this.backButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
    this.backButton.label = localize("back", "Back");
    this.backButton.element.classList.add("wizard-back");
    this.backButton.element.title = localize("back", "Back");
    this.nextButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, supportIcons: true }));
    this.nextButton.label = localize("next", "Next");
    this.nextButton.element.classList.add("wizard-next");
    this.nextButton.element.title = localize("next", "Next");
    this.updateBanner = append(this.wizardPanel, $("div.wizard-update-banner"));
    this.updateBanner.setAttribute("role", "status");
    this.updateBanner.setAttribute("aria-live", "polite");
    this.updateBanner.textContent = localize("updateAvailable", "A new version of {0} is available.", product.nameLong);
    this.setUpdateAvailable(this.showUpdateBanner);
    this.stepContainer = append(this.wizardPanel, $("div.wizard-step-container"));
    this.createStep0Attachments();
    this.createStep1Describe();
    this.createStep2Review();
    this.registerEventHandlers();
    if (this.data.extensionId) {
      void this.updateSelectedExtension(this.data.extensionId, false);
    }
    this.updateStepUI();
  }
  // Step 0: Attachments
  createStep0Attachments() {
    const page = append(this.stepContainer, $("div.wizard-step"));
    this.stepPages.push(page);
    const heading = append(page, $("h2.wizard-heading"));
    heading.textContent = localize("screenshotsHeading", "Add attachments for better context");
    const subtitle = append(page, $("p.wizard-subtitle"));
    subtitle.textContent = localize("screenshotsSubtitle", "You can add up to {0} screenshots or videos. Navigate VS Code and choose when to capture.", MAX_ATTACHMENTS);
    const captureShortcut = this.resolveKeybinding?.("workbench.action.issueReporter.captureScreenshot");
    const recordShortcut = this.recordingSupported ? this.resolveKeybinding?.("workbench.action.issueReporter.toggleRecording") : void 0;
    if (captureShortcut || recordShortcut) {
      const targetDocument = getWindow(this.container).document;
      const hint = append(page, $("p.wizard-subtitle.wizard-shortcut-hint"));
      const intro = localize("shortcutHintIntro", "Use the floating capture bar, or press");
      hint.appendChild(targetDocument.createTextNode(`${intro} `));
      if (captureShortcut) {
        this.renderShortcutKeycap(hint, captureShortcut);
        hint.appendChild(targetDocument.createTextNode(` ${localize("toCapture", "to capture a screenshot")}`));
      }
      if (captureShortcut && recordShortcut) {
        hint.appendChild(targetDocument.createTextNode(` ${localize("or", "or")} `));
      }
      if (recordShortcut) {
        this.renderShortcutKeycap(hint, recordShortcut);
        hint.appendChild(targetDocument.createTextNode(` ${localize("toRecord", "to start or stop recording")}`));
      }
      hint.appendChild(targetDocument.createTextNode("."));
    }
    this.screenshotContainer = append(page, $("div.wizard-screenshots"));
    this.updateScreenshotThumbnails();
    this.createFloatingCaptureBar();
  }
  createFloatingCaptureBar() {
    const targetWindow = getWindow(this.container);
    const workbench = targetWindow.document.querySelector(".monaco-workbench");
    const mountTarget = workbench ?? targetWindow.document.body;
    this.floatingBar = $("div.issue-reporter-floating-bar");
    const dragArea = append(this.floatingBar, $("div.wizard-floating-drag"));
    dragArea.appendChild(renderIcon(Codicon.gripper));
    const segmented = append(this.floatingBar, $("div.wizard-segmented-btn"));
    const floatingButtonStyles = this.getFloatingBarButtonStyles(targetWindow);
    const captureBtn = this.disposables.add(new Button(segmented, { ...floatingButtonStyles, supportIcons: true }));
    captureBtn.element.classList.add("wizard-segmented-main");
    captureBtn.label = `$(device-camera) ${localize("screenshot", "Screenshot")}`;
    this.captureStripCaptureBtn = captureBtn;
    const delayOptions = this.getScreenshotDelayOptions();
    const delayDropdownButton = this.disposables.add(new Button(segmented, { ...floatingButtonStyles, supportIcons: true }));
    delayDropdownButton.element.classList.add("wizard-segmented-dropdown");
    delayDropdownButton.element.title = localize("captureOptions", "Capture options");
    delayDropdownButton.element.setAttribute("aria-label", localize("captureOptions", "Capture options"));
    delayDropdownButton.label = "$(chevron-down)";
    this.captureStripDelayBtn = delayDropdownButton;
    if (this.contextMenuProvider) {
      let menuOpen = false;
      this.disposables.add(delayDropdownButton.onDidClick(() => {
        if (!delayDropdownButton.enabled || menuOpen) {
          return;
        }
        const hideAction = new Action(
          "hide-toolbar",
          localize("hideToolbarInScreenshots", "Hide Toolbar in Screenshots"),
          void 0,
          true,
          async () => {
            this._hideToolbarInScreenshots = !this._hideToolbarInScreenshots;
          }
        );
        hideAction.checked = this._hideToolbarInScreenshots;
        const actions = delayOptions.map((opt) => {
          const action = new Action(
            `delay-${opt.value}`,
            opt.label,
            void 0,
            true,
            async () => {
              this.screenshotDelay = opt.value;
            }
          );
          action.checked = opt.value === this.screenshotDelay;
          return action;
        });
        const allActions = [hideAction, new Separator(), ...actions];
        menuOpen = true;
        this.contextMenuProvider.showContextMenu({
          getAnchor: () => this.floatingBar,
          getActions: () => allActions,
          skipTelemetry: true,
          onHide: () => {
            menuOpen = false;
            hideAction.dispose();
            for (const a of actions) {
              a.dispose();
            }
          }
        });
      }));
      this.disposables.add(addDisposableListener(dragArea, EventType.POINTER_DOWN, () => {
        dragArea.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }));
    }
    this.disposables.add(captureBtn.onDidClick(() => {
      if (this.getTotalAttachments() >= MAX_ATTACHMENTS || !captureBtn.enabled) {
        return;
      }
      if (this.screenshotDelay > 0) {
        captureBtn.element.style.minWidth = `${captureBtn.element.offsetWidth}px`;
        captureBtn.enabled = false;
        this.delayedScreenshotPending = true;
        this.updateScreenshotThumbnails();
        this.updateAttachmentButtons();
        let remaining = this.screenshotDelay;
        captureBtn.label = `${remaining}...`;
        const targetWindow2 = getWindow(this.container);
        const intervalDisposable = this.disposables.add(disposableWindowInterval(targetWindow2, () => {
          remaining--;
          if (remaining > 0) {
            captureBtn.label = `${remaining}...`;
          } else {
            this.disposables.delete(intervalDisposable);
            captureBtn.label = `$(device-camera) ${localize("screenshot", "Screenshot")}`;
            captureBtn.element.style.minWidth = "";
            captureBtn.enabled = true;
            this.delayedScreenshotPending = false;
            this.updateScreenshotThumbnails();
            this.updateAttachmentButtons();
            this._onDidRequestScreenshot.fire();
          }
        }, 1e3));
      } else {
        this._onDidRequestScreenshot.fire();
      }
    }));
    if (this.recordingSupported) {
      this.captureStripRecordBtn = this.disposables.add(new Button(this.floatingBar, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      this.captureStripRecordBtn.label = `$(record) ${localize("recordVideo", "Record video")}`;
      this.captureStripRecordBtn.element.classList.add("wizard-record-btn");
      this.disposables.add(this.captureStripRecordBtn.onDidClick(() => {
        if (this.currentRecordingState === RecordingState.Recording) {
          this._onDidRequestStopRecording.fire();
        } else if (this.currentRecordingState === RecordingState.Idle && this.getTotalAttachments() < MAX_ATTACHMENTS) {
          this._onDidRequestStartRecording.fire();
        }
      }));
    }
    mountTarget.appendChild(this.floatingBar);
    let dragStartX = 0;
    let dragStartY = 0;
    let barStartX = 0;
    let barStartY = 0;
    const onPointerMove = (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const barW = this.floatingBar.offsetWidth;
      const barH = this.floatingBar.offsetHeight;
      const maxX = targetWindow.innerWidth - barW;
      const maxY = targetWindow.innerHeight - barH;
      const newX = Math.max(0, Math.min(barStartX + dx, maxX));
      const newY = Math.max(0, Math.min(barStartY + dy, maxY));
      this.floatingBar.style.left = `${newX}px`;
      this.floatingBar.style.top = `${newY}px`;
      this.floatingBar.style.right = "auto";
    };
    const onPointerUp = () => {
      dragArea.classList.remove("dragged");
      targetWindow.document.removeEventListener("pointermove", onPointerMove);
      targetWindow.document.removeEventListener("pointerup", onPointerUp);
    };
    this.disposables.add(addDisposableListener(dragArea, EventType.POINTER_DOWN, (e) => {
      e.preventDefault();
      dragArea.classList.add("dragged");
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = this.floatingBar.getBoundingClientRect();
      barStartX = rect.left;
      barStartY = rect.top;
      targetWindow.document.addEventListener("pointermove", onPointerMove);
      targetWindow.document.addEventListener("pointerup", onPointerUp);
    }));
    const clampIntoView = () => {
      if (!this.floatingBar) {
        return;
      }
      const rect = this.floatingBar.getBoundingClientRect();
      const winW = targetWindow.innerWidth;
      const winH = targetWindow.innerHeight;
      const margin = 8;
      let needsClamp = false;
      let nextLeft = rect.left;
      let nextTop = rect.top;
      if (rect.right > winW - margin) {
        nextLeft = Math.max(margin, winW - margin - rect.width);
        needsClamp = true;
      }
      if (rect.left < margin) {
        nextLeft = margin;
        needsClamp = true;
      }
      if (rect.bottom > winH - margin) {
        nextTop = Math.max(margin, winH - margin - rect.height);
        needsClamp = true;
      }
      if (rect.top < margin) {
        nextTop = margin;
        needsClamp = true;
      }
      if (needsClamp) {
        this.floatingBar.style.left = `${nextLeft}px`;
        this.floatingBar.style.top = `${nextTop}px`;
        this.floatingBar.style.right = "auto";
      }
    };
    this.disposables.add(addDisposableListener(targetWindow, "resize", clampIntoView));
    this.disposables.add(toDisposable(() => {
      this.floatingBar?.remove();
    }));
  }
  updateCaptureStripVisibility() {
    if (!this.floatingBar) {
      return;
    }
    this.floatingBar.style.display = "";
  }
  // Step 1: Describe (category + description + title)
  createStep1Describe() {
    const page = append(this.stepContainer, $("div.wizard-step"));
    this.stepPages.push(page);
    const heading = append(page, $("h2.wizard-heading"));
    heading.textContent = localize("describeHeading", "Describe your feedback");
    if (this.markdownRendererService) {
      const guidanceContainer = append(page, $("div.wizard-issue-guidance"));
      const guidanceMd = new MarkdownString(localize(
        {
          key: "reviewGuidanceLabelWizard",
          comment: ['{Locked="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions"}']
        },
        "Before you report an issue here please [review the guidance we provide](https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions). Please complete the form in English."
      ), { isTrusted: true });
      const rendered = this.markdownRendererService.render(guidanceMd, {
        actionHandler: async (link) => {
          await this.openExternalLink?.(link);
          return true;
        }
      });
      guidanceContainer.appendChild(rendered.element);
      this.disposables.add(rendered);
    }
    const targetRow = append(page, $("div.wizard-target-row"));
    const sourceField = append(targetRow, $("div.wizard-field.wizard-source-field"));
    const sourceLabel = append(sourceField, $("label.wizard-field-label"));
    sourceLabel.textContent = localize("target", "Target");
    this.appendRequiredMarker(sourceLabel);
    this.sourceButtonGroup = append(sourceField, $("div.wizard-type-buttons.wizard-source-buttons"));
    for (const option of this.getAllSourceOptions()) {
      const btn = this.disposables.add(new Button(this.sourceButtonGroup, { ...defaultButtonStyles, secondary: true }));
      btn.element.classList.add("wizard-type-btn", "wizard-source-btn");
      btn.element.setAttribute("data-source", option.value);
      btn.element.setAttribute("aria-pressed", "false");
      btn.label = option.label;
      this.issueSourceButtons.push(btn);
      this.disposables.add(btn.onDidClick(() => {
        this.setIssueSource(option.value);
        if (option.value === IssueSource.Extension && this.selectedExtension) {
          void this.updateSelectedExtension(this.selectedExtension.id);
        }
      }));
    }
    this.sourceError = this.createFieldError(sourceField, localize("targetRequired", "Select a target to continue."));
    this.targetStatus = append(sourceField, $("div.wizard-target-status"));
    this.extensionField = append(targetRow, $("div.wizard-field.wizard-extension-field"));
    const extensionLabel = append(this.extensionField, $("label.wizard-field-label"));
    extensionLabel.textContent = localize("extension", "Extension");
    this.appendRequiredMarker(extensionLabel);
    const extensionSelectContainer = append(this.extensionField, $("div.wizard-extension-select"));
    this.extensionOptions = this.getExtensionOptions();
    this.extensionSelect = this.disposables.add(new SelectBox(
      this.getExtensionSelectItems(),
      this.getSelectedExtensionIndex(),
      this.contextViewService,
      defaultSelectBoxStyles,
      { ariaLabel: localize("extension", "Extension"), useCustomDrawn: true, optionsAsChildren: true }
    ));
    this.extensionSelect.render(extensionSelectContainer);
    this.disposables.add(this.extensionSelect.onDidSelect((e) => {
      void this.updateSelectedExtension(this.extensionOptions[e.index]?.value);
    }));
    this.extensionError = this.createFieldError(this.extensionField, localize("extensionRequired", "Select an extension to continue."));
    this.extensionStatus = append(this.extensionField, $("div.wizard-extension-status"));
    this.updateExtensionOptions();
    this.updateExtensionFieldVisibility();
    if (!this.selectedIssueSource) {
      if (this.data.extensionId) {
        this.selectedIssueSource = IssueSource.Extension;
      } else if (this.data.isSessionsWindow) {
        this.selectedIssueSource = IssueSource.AgentsWindow;
      } else {
        this.selectedIssueSource = IssueSource.VSCode;
      }
      this.updateIssueSourceFlags();
    }
    this.updateIssueSourceButtons();
    const catLabel = append(page, $("label.wizard-field-label"));
    catLabel.textContent = localize("feedbackCategory", "Category");
    this.appendRequiredMarker(catLabel);
    this.typeButtonGroup = append(page, $("div.wizard-type-buttons"));
    const selectType = (type) => {
      this.selectedIssueType = type;
      this.model.update({ issueType: type });
      this.setFieldError(this.typeButtonGroup, this.typeError, false);
      for (const b of this.issueTypeButtons) {
        const isSelected = b.element.getAttribute("data-type") === String(type);
        b.element.classList.toggle("selected", isSelected);
        b.element.setAttribute("aria-pressed", String(isSelected));
      }
      this.updateDescriptionGuidance();
      this.updateIssueSourceButtons();
      if (this.currentStep === 2 /* Review */) {
        this.updateReviewDetails();
      }
      this.searchSimilarIssues();
    };
    for (const { type, label, icon } of this.getIssueTypeOptions()) {
      const btn = this.disposables.add(new Button(this.typeButtonGroup, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      btn.element.classList.add("wizard-type-btn");
      btn.element.setAttribute("data-type", String(type));
      btn.element.setAttribute("aria-pressed", "false");
      btn.label = `$(${icon.id}) ${label}`;
      this.issueTypeButtons.push(btn);
      this.disposables.add(btn.onDidClick(() => selectType(type)));
    }
    this.typeError = this.createFieldError(page, localize("categoryRequired", "Select a category to continue."));
    const titleGroup = append(page, $("div.wizard-field.wizard-title-field"));
    const titleLabelRow = append(titleGroup, $("div.wizard-title-label-row"));
    const titleLabel = append(titleLabelRow, $("label.wizard-field-label"));
    titleLabel.textContent = localize("issueTitle", "Title");
    this.appendRequiredMarker(titleLabel);
    const aiBtn = this.disposables.add(new Button(titleLabelRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    aiBtn.label = `$(sparkle) ${localize("generateTitleBtn", "Generate from description")}`;
    aiBtn.element.classList.add("wizard-ai-title-btn");
    aiBtn.element.title = localize("generateTitle", "Generate title from description");
    aiBtn.enabled = !!this.data.issueBody?.trim();
    this.disposables.add(aiBtn.onDidClick(() => {
      const desc = this.descriptionTextarea.value.trim();
      if (desc && !aiBtn.element.classList.contains("loading")) {
        aiBtn.element.style.minWidth = `${aiBtn.element.offsetWidth}px`;
        aiBtn.enabled = false;
        aiBtn.label = `$(loading~spin) ${localize("generatingTitle", "Generating...")}`;
        aiBtn.element.classList.add("loading");
        this._onDidRequestGenerateTitle.fire(desc);
      }
    }));
    this.generateTitleBtn = aiBtn;
    this.titleInput = this.disposables.add(new InputBox(titleGroup, void 0, {
      placeholder: localize("issueTitlePlaceholder", "Brief summary of the issue"),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.updateTitlePlaceholder();
    if (this.data.issueTitle) {
      this.titleInput.value = this.data.issueTitle;
    }
    this.disposables.add(this.titleInput.onDidChange(() => {
      if (this.titleInput.value.trim()) {
        this.setFieldError(this.titleInput.element, this.titleError, false);
      }
      this.searchSimilarIssues();
    }));
    this.titleError = this.createFieldError(titleGroup, localize("titleRequired", "Enter a title to continue."));
    const descriptionGroup = append(page, $("div.wizard-field"));
    const descLabel = append(descriptionGroup, $("label.wizard-field-label"));
    descLabel.textContent = localize("description", "Description");
    this.appendRequiredMarker(descLabel);
    this.descriptionGuidance = append(descriptionGroup, $("p.wizard-subtitle.wizard-description-guidance"));
    this.updateDescriptionGuidance();
    this.descriptionTextarea = append(descriptionGroup, $("textarea.wizard-textarea"));
    this.descriptionTextarea.placeholder = localize("descriptionPlaceholder", "Describe the issue in detail...");
    this.descriptionTextarea.rows = 6;
    if (this.data.issueBody) {
      this.descriptionTextarea.value = this.data.issueBody;
    }
    const autoGrowTextarea = () => {
      this.descriptionTextarea.style.height = "0";
      const newHeight = Math.max(this.descriptionTextarea.scrollHeight, 120);
      this.descriptionTextarea.style.height = `${newHeight}px`;
    };
    autoGrowTextarea();
    this.disposables.add(addDisposableListener(this.descriptionTextarea, EventType.INPUT, () => {
      if (this.descriptionTextarea.value.trim()) {
        this.setFieldError(this.descriptionTextarea, this.descriptionError, false);
      }
      autoGrowTextarea();
      this.searchSimilarIssues();
      this.updateGenerateTitleButtonState();
    }));
    this.descriptionError = this.createFieldError(descriptionGroup, localize("descriptionRequired", "Enter a description to continue."));
    this.updateIssueSourceFlags();
    this.updateTargetStatus();
    if (this.selectedIssueType === void 0) {
      selectType(IssueType.Bug);
    } else {
      selectType(this.selectedIssueType);
    }
  }
  appendRequiredMarker(label) {
    const marker = append(label, $("span.wizard-required-marker"));
    marker.textContent = "*";
    marker.setAttribute("aria-hidden", "true");
  }
  getIssueTypeOptions() {
    const options = [
      { type: IssueType.Bug, label: localize("bug", "Bug"), icon: Codicon.bug },
      { type: IssueType.FeatureRequest, label: localize("featureRequest", "Feature Request"), icon: Codicon.lightbulb },
      { type: IssueType.PerformanceIssue, label: localize("performanceIssue", "Performance Issue"), icon: Codicon.dashboard }
    ];
    if (this.selectedIssueSource === IssueSource.Marketplace) {
      return options.filter((o) => o.type !== IssueType.PerformanceIssue);
    }
    return options;
  }
  getAllSourceOptions() {
    return [
      { label: product.nameLong || localize("vscode", "Visual Studio Code"), value: IssueSource.VSCode },
      { label: localize("agentsWindow", "Agents Window"), value: IssueSource.AgentsWindow },
      { label: localize("extensionSource", "A VS Code extension"), value: IssueSource.Extension },
      { label: localize("marketplace", "Extensions Marketplace"), value: IssueSource.Marketplace }
    ];
  }
  getSourceOptions() {
    const options = this.getAllSourceOptions();
    if (this.data.isSessionsWindow || !this.hasReportableExtensions()) {
      return options.filter((o) => o.value !== IssueSource.Extension);
    }
    return options;
  }
  hasReportableExtensions() {
    const modelData = this.model.getData();
    const sourceExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions ?? [];
    return sourceExtensions.some((extension) => !extension.isTheme && !extension.isBuiltin);
  }
  updateIssueSourceButtons() {
    const availableSources = new Set(this.getSourceOptions().map((option) => option.value));
    if (this.selectedIssueSource && !availableSources.has(this.selectedIssueSource)) {
      this.selectedIssueSource = void 0;
      this.updateIssueSourceFlags();
      this.updateExtensionValidation();
    }
    for (const button of this.issueSourceButtons) {
      const source = button.element.getAttribute("data-source");
      const isAvailable = availableSources.has(source);
      const isSelected = source === this.selectedIssueSource;
      button.element.classList.toggle("hidden", !isAvailable);
      button.element.classList.toggle("selected", isSelected);
      button.element.setAttribute("aria-pressed", String(isSelected));
    }
    this.updateExtensionFieldVisibility();
  }
  setIssueSource(source) {
    this.selectedIssueSource = source;
    this.setFieldError(this.sourceButtonGroup, this.sourceError, this.didAttemptDescribeSubmit && !source);
    this.updateIssueSourceFlags();
    this.updateIssueSourceButtons();
    this.updateIssueTypeButtons();
    this.updateExtensionValidation();
    this.updateTitlePlaceholder();
    this.updateTargetStatus();
    this.updateDescriptionGuidance();
    this.searchSimilarIssues();
  }
  /**
   * Hide or restore issue type buttons based on the current source. The Marketplace
   * source does not support reporting performance issues, so the button is hidden
   * and the selection falls back to Bug when it was the Performance option.
   */
  updateIssueTypeButtons() {
    if (!this.issueTypeButtons.length) {
      return;
    }
    const allowedTypes = new Set(this.getIssueTypeOptions().map((option) => String(option.type)));
    for (const button of this.issueTypeButtons) {
      const buttonType = button.element.getAttribute("data-type");
      const isAvailable = !!buttonType && allowedTypes.has(buttonType);
      button.element.classList.toggle("hidden", !isAvailable);
    }
    if (this.selectedIssueType !== void 0 && !allowedTypes.has(String(this.selectedIssueType))) {
      this.selectedIssueType = IssueType.Bug;
      this.model.update({ issueType: IssueType.Bug });
      for (const b of this.issueTypeButtons) {
        const isSelected = b.element.getAttribute("data-type") === String(IssueType.Bug);
        b.element.classList.toggle("selected", isSelected);
        b.element.setAttribute("aria-pressed", String(isSelected));
      }
    }
  }
  updateIssueSourceFlags() {
    const fileOnExtension = this.selectedIssueSource === IssueSource.Extension;
    const fileOnMarketplace = this.selectedIssueSource === IssueSource.Marketplace;
    const fileOnProduct = this.selectedIssueSource === IssueSource.VSCode || this.selectedIssueSource === IssueSource.AgentsWindow || this.selectedIssueSource === IssueSource.Unknown;
    const fileOnAgentsWindow = this.selectedIssueSource === IssueSource.AgentsWindow;
    this.model.update({
      issueSource: this.selectedIssueSource,
      fileOnExtension,
      fileOnMarketplace,
      fileOnProduct,
      isSessionsWindow: fileOnAgentsWindow ? true : this.data.isSessionsWindow,
      selectedExtension: this.selectedExtension
    });
    this.data.issueSource = this.selectedIssueSource;
    this.data.extensionId = fileOnExtension ? this.selectedExtension?.id ?? this.data.extensionId : void 0;
  }
  updateTitlePlaceholder() {
    switch (this.selectedIssueSource) {
      case IssueSource.Extension:
        this.titleInput.setPlaceHolder(localize("extensionPlaceholder", "E.g. Missing alt text on extension readme image"));
        break;
      case IssueSource.Marketplace:
        this.titleInput.setPlaceHolder(localize("marketplacePlaceholder", "E.g. Cannot disable installed extension"));
        break;
      case IssueSource.AgentsWindow:
        this.titleInput.setPlaceHolder(localize("agentsWindowPlaceholder", "E.g. Sessions list does not refresh after creating a new session"));
        break;
      case IssueSource.VSCode:
        this.titleInput.setPlaceHolder(localize("vscodePlaceholder", "E.g. Workbench is missing problems panel"));
        break;
      default:
        this.titleInput.setPlaceHolder(localize("issueTitlePlaceholder", "Brief summary of the issue"));
        break;
    }
  }
  getExtensionOptions() {
    const modelData = this.model.getData();
    const sourceExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions ?? [];
    const extensions = [...sourceExtensions].filter((extension) => !extension.isTheme && !extension.isBuiltin).sort((a, b) => (a.displayName || a.name || a.id).localeCompare(b.displayName || b.name || b.id));
    return [
      { label: localize("selectExtension", "Select extension"), value: void 0, hidden: true },
      ...extensions.map((extension) => ({ label: extension.displayName || extension.name || extension.id, value: extension.id }))
    ];
  }
  getExtensionSelectItems() {
    return this.extensionOptions.map((option) => ({ text: option.label, isDisabled: option.hidden }));
  }
  getSelectedExtensionIndex() {
    return Math.max(0, this.extensionOptions.findIndex((option) => option.value === this.selectedExtension?.id || option.value === this.data.extensionId));
  }
  updateExtensionOptions() {
    this.extensionOptions = this.getExtensionOptions();
    this.extensionSelect.setOptions(this.getExtensionSelectItems(), this.getSelectedExtensionIndex());
    if (!this.selectedExtension && this.data.extensionId) {
      void this.updateSelectedExtension(this.data.extensionId, false);
    }
  }
  updateExtensionFieldVisibility() {
    this.extensionField.classList.toggle("hidden", this.selectedIssueSource !== IssueSource.Extension);
  }
  updateExtensionValidation() {
    const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension;
    const hasExtensionIssueUrl = this.selectedIssueSource !== IssueSource.Extension || !this.selectedExtension || !!this.getSelectedExtensionIssueUrl();
    this.setFieldError(this.extensionField, this.extensionError, this.didAttemptDescribeSubmit && (!hasExtension || !hasExtensionIssueUrl));
  }
  async updateSelectedExtension(extensionId, loadExtensionData = true) {
    const extension = extensionId ? this.model.getData().allExtensions.find((candidate) => candidate.id.toLowerCase() === extensionId.toLowerCase()) : void 0;
    this.selectedExtension = extension;
    if (extensionId === void 0 || extension) {
      this.data.extensionId = extension?.id;
    }
    this.extensionSelect.select(this.getSelectedExtensionIndex());
    this.updateExtensionValidation();
    this.updateIssueSourceFlags();
    if (!extension) {
      this.updateTargetStatus();
      this.searchSimilarIssues();
      return;
    }
    const hasPresetData = !this.includeExtensionData && (this.data.data !== void 0 || this.data.uri !== void 0 || this.data.privateUri !== void 0);
    if (!loadExtensionData && hasPresetData) {
      this.applyExtensionIssueData(extension, this.data);
    }
    if (extension.isBuiltin && this.selectedIssueSource === IssueSource.Extension && !this.data.issueSource) {
      this.setIssueSource(IssueSource.VSCode);
      return;
    }
    if (loadExtensionData && this.resolveExtensionIssueData) {
      const request = ++this.extensionDataRequest;
      this.extensionStatus.textContent = localize("loadingExtensionData", "Loading extension issue data...");
      const issueData = await this.resolveExtensionIssueData(extension.id);
      if (request !== this.extensionDataRequest) {
        return;
      }
      if (issueData) {
        this.applyExtensionIssueData(extension, issueData);
      }
    }
    this.updateTargetStatus();
    this.searchSimilarIssues();
  }
  applyExtensionIssueData(extension, issueData) {
    extension.data = issueData.data;
    extension.uri = issueData.uri;
    extension.privateUri = issueData.privateUri;
    this.data.data = issueData.data;
    this.data.uri = issueData.uri;
    this.data.privateUri = issueData.privateUri;
    this.data.issueBody = issueData.issueBody ?? this.data.issueBody;
    this.data.issueTitle = issueData.issueTitle ?? this.data.issueTitle;
    if (issueData.issueTitle && !this.titleInput.value.trim()) {
      this.titleInput.value = issueData.issueTitle;
    }
    if (issueData.issueBody && !this.descriptionTextarea.value.includes(issueData.issueBody)) {
      this.descriptionTextarea.value = this.descriptionTextarea.value ? `${this.descriptionTextarea.value}
${issueData.issueBody}` : issueData.issueBody;
    }
    if (issueData.data) {
      extension.extensionData = issueData.data;
      this.model.update({ extensionData: issueData.data, includeExtensionData: true });
      this.includeExtensionData = true;
    }
  }
  updateTargetStatus() {
    this.targetStatus.textContent = "";
    this.extensionStatus.textContent = "";
    if (!this.selectedIssueSource) {
      return;
    }
    if (this.selectedIssueSource !== IssueSource.Extension) {
      const repo = this.getIssueTargetRepo();
      this.targetStatus.textContent = repo ? localize("issueTargetRepo", "Issue will be created in {0}/{1}.", repo.owner, repo.repositoryName) : "";
      return;
    }
    if (!this.selectedExtension) {
      return;
    }
    const issueUrl = this.getSelectedExtensionIssueUrl();
    if (!issueUrl) {
      this.extensionStatus.textContent = localize("extensionNoIssueUrl", "This extension does not provide an issue reporting URL.");
    } else if (!this.isGitHubUrl(issueUrl)) {
      this.extensionStatus.textContent = localize("extensionExternalIssueUrl", "This extension uses an external issue reporter. Preview will open that issue reporter.");
    } else {
      const repo = this.getIssueTargetRepo();
      this.extensionStatus.textContent = repo ? localize("issueTargetRepo", "Issue will be created in {0}/{1}.", repo.owner, repo.repositoryName) : "";
    }
  }
  getIssueTargetRepo() {
    const targetUrl = this.getIssueTargetUrl();
    return targetUrl ? this.parseGitHubUrl(targetUrl) : void 0;
  }
  getSelectedExtensionIssueUrl() {
    const extension = this.selectedExtension;
    if (!extension) {
      return void 0;
    }
    if (extension.uri) {
      return URI.revive(extension.uri).toString();
    }
    if (extension.bugsUrl && /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?\/?$/.test(extension.bugsUrl)) {
      return `${normalizeGitHubUrl(extension.bugsUrl)}/issues/new`;
    }
    if (extension.repositoryUrl && /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?$/.test(extension.repositoryUrl)) {
      return `${normalizeGitHubUrl(extension.repositoryUrl)}/issues/new`;
    }
    return extension.bugsUrl || extension.repositoryUrl;
  }
  getIssueSourceLabel() {
    switch (this.selectedIssueSource) {
      case IssueSource.VSCode:
        return product.nameLong || localize("vscode", "Visual Studio Code");
      case IssueSource.AgentsWindow:
        return localize("agentsWindow", "Agents Window");
      case IssueSource.Extension:
        return this.selectedExtension?.displayName || this.selectedExtension?.name || localize("extensionSource", "A VS Code extension");
      case IssueSource.Marketplace:
        return localize("marketplace", "Extensions Marketplace");
      case IssueSource.Unknown:
        return localize("unknownSource", "Don't know");
      default:
        return localize("unknown", "Unknown");
    }
  }
  getIssueTargetUrl() {
    if (this.selectedIssueSource === IssueSource.Extension) {
      return this.getSelectedExtensionIssueUrl();
    }
    if (this.selectedIssueSource === IssueSource.Marketplace) {
      return product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
    }
    if (this.data.uri) {
      return URI.revive(this.data.uri).toString();
    }
    if (this.data.privateUri) {
      return URI.revive(this.data.privateUri).toString();
    }
    return product.reportIssueUrl;
  }
  isGitHubUrl(url) {
    return /^https?:\/\/github\.com\//i.test(url);
  }
  parseGitHubUrl(url) {
    const match = /^https?:\/\/github\.com\/([^\/?#]+)\/([^\/?#]+).*/i.exec(url);
    if (!match) {
      return void 0;
    }
    return { owner: match[1], repositoryName: match[2] };
  }
  searchSimilarIssues() {
    if (this.currentStep !== 2 /* Review */ || !this.similarIssuesContainer) {
      return;
    }
    if (this.similarIssuesHandle) {
      clearTimeout(this.similarIssuesHandle);
    }
    this.renderSimilarIssuesMessage(localize("searchingSimilarIssues", "Searching similar issues..."));
    this.similarIssuesHandle = setTimeout(() => this.doSearchSimilarIssues(), 300);
  }
  async doSearchSimilarIssues() {
    const title = this.titleInput.value.trim();
    const request = ++this.similarIssuesRequest;
    if (!title || !this.selectedIssueSource) {
      this.renderSimilarIssuesMessage(localize("similarIssuesNeedsTitle", "Enter a title to search for similar issues."));
      return;
    }
    this.renderSimilarIssuesMessage(localize("searchingSimilarIssues", "Searching similar issues..."));
    try {
      let results = [];
      if (this.selectedIssueSource === IssueSource.Extension) {
        const extensionIssueUrl = this.getSelectedExtensionIssueUrl();
        const repo = extensionIssueUrl && this.parseGitHubUrl(extensionIssueUrl);
        results = repo ? await this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
      } else if (this.selectedIssueSource === IssueSource.Marketplace) {
        const marketplaceIssueUrl = product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
        const repo = marketplaceIssueUrl && this.parseGitHubUrl(marketplaceIssueUrl);
        results = repo ? await this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
      } else {
        results = await this.searchVSCodeSimilarIssues(title, this.descriptionTextarea.value.trim());
      }
      if (request === this.similarIssuesRequest) {
        this.renderSimilarIssues(results);
      }
    } catch {
      if (request === this.similarIssuesRequest) {
        this.renderSimilarIssuesMessage(localize("similarIssuesSearchFailed", "Unable to search for similar issues."));
      }
    }
  }
  async searchGitHubIssues(repo, title) {
    const query = `is:issue repo:${repo} ${title}`;
    const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`);
    const result = await response.json();
    return Array.isArray(result?.items) ? result.items : [];
  }
  async searchVSCodeDuplicates(title, body) {
    const response = await fetch("https://vscode-probot.westus.cloudapp.azure.com:7890/duplicate_candidates", {
      method: "POST",
      body: JSON.stringify({ title, body }),
      headers: new Headers({ "Content-Type": "application/json" })
    });
    const result = await response.json();
    return Array.isArray(result?.candidates) ? result.candidates : [];
  }
  async searchVSCodeSimilarIssues(title, body) {
    try {
      const duplicates = await this.searchVSCodeDuplicates(title, body);
      if (duplicates.length) {
        return duplicates;
      }
    } catch {
    }
    const repo = this.getIssueTargetRepo();
    return repo ? this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
  }
  renderSimilarIssuesMessage(message) {
    this.resetSimilarIssuesContainer();
    const status = append(this.similarIssuesContainer, $("div.wizard-similar-status"));
    status.textContent = message;
  }
  renderSimilarIssues(results) {
    if (!results.length) {
      this.renderSimilarIssuesMessage(localize("noSimilarIssues", "No similar issues found."));
      return;
    }
    this.resetSimilarIssuesContainer();
    const list = append(this.similarIssuesContainer, $("ul.wizard-similar-list"));
    for (const issue of results.slice(0, MAX_SIMILAR_ISSUES)) {
      const item = append(list, $("li.wizard-similar-item"));
      const link = append(item, $("a.wizard-similar-link"));
      link.href = issue.html_url;
      link.textContent = issue.title;
      link.title = issue.title;
      this.similarIssuesDisposables.add(addDisposableListener(link, EventType.CLICK, (e) => {
        e.preventDefault();
        this.openExternalLink?.(issue.html_url);
      }));
      if (issue.state) {
        const state = append(item, $("span.wizard-similar-state"));
        state.textContent = issue.state;
      }
    }
  }
  /** Clear the similar-issues container and re-render the section heading. */
  resetSimilarIssuesContainer() {
    this.similarIssuesDisposables.clear();
    this.similarIssuesContainer.textContent = "";
    const heading = append(this.similarIssuesContainer, $("div.wizard-similar-heading"));
    heading.textContent = localize("similarIssues", "Similar Issues");
  }
  /** Update the guidance text above the description based on selected category */
  updateDescriptionGuidance() {
    const markdownHint = localize("markdownSupported", "Markdown formatting is supported.");
    const perfWikiUrl = "https://github.com/microsoft/vscode/wiki/Performance-Issues";
    this.descriptionGuidanceDisposables.clear();
    this.descriptionGuidance.textContent = "";
    this.descriptionGuidance.classList.remove("wizard-description-guidance-with-link");
    const appendText = (text) => {
      const targetDocument = getWindow(this.container).document;
      this.descriptionGuidance.appendChild(targetDocument.createTextNode(text));
    };
    switch (this.selectedIssueType) {
      case IssueType.Bug:
        appendText(`${localize("bugGuidance", "Describe what happened, the steps to reproduce, what you expected, and what you observed instead.")}
${markdownHint}`);
        break;
      case IssueType.FeatureRequest:
        appendText(`${localize("featureGuidance", "Describe the feature you'd like to see, what problem it would solve, and any alternatives you've considered.")}
${markdownHint}`);
        break;
      case IssueType.PerformanceIssue: {
        appendText(`${localize("perfGuidance", "Describe what is slow, when it happens, whether it's consistent or intermittent, and any patterns you've noticed.")} `);
        const link = $("a.wizard-description-guidance-link");
        link.href = perfWikiUrl;
        link.textContent = localize("perfWikiLink", "See the performance issue reporting guide.");
        this.descriptionGuidanceDisposables.add(addDisposableListener(link, EventType.CLICK, (e) => {
          e.preventDefault();
          this.openExternalLink?.(perfWikiUrl);
        }));
        this.descriptionGuidance.appendChild(link);
        appendText(`
${markdownHint}`);
        this.descriptionGuidance.classList.add("wizard-description-guidance-with-link");
        break;
      }
      default:
        appendText(`${localize("defaultGuidance", "Select a category above, then describe your feedback in detail.")}
${markdownHint}`);
        break;
    }
  }
  hasDescriptionContent() {
    return !!this.descriptionTextarea.value.trim();
  }
  updateGenerateTitleButtonState() {
    if (!this.generateTitleBtn || this.generateTitleBtn.element.classList.contains("loading")) {
      return;
    }
    this.generateTitleBtn.enabled = this.hasDescriptionContent();
  }
  createFieldError(parent, message) {
    const error = append(parent, $("div.wizard-field-error.hidden"));
    error.textContent = message;
    error.setAttribute("role", "alert");
    return error;
  }
  setFieldError(field, error, hasError) {
    field.classList.toggle("invalid-input", hasError);
    error.classList.toggle("hidden", !hasError);
  }
  // Step 2: Review & Submit
  createStep2Review() {
    const page = append(this.stepContainer, $("div.wizard-step.wizard-step-review"));
    this.stepPages.push(page);
    const heading = append(page, $("h2.wizard-heading"));
    heading.textContent = localize("reviewSubmit", "Review and submit");
    append(page, $("div.wizard-review-details"));
  }
  registerEventHandlers() {
    this.disposables.add(this.backButton.onDidClick(() => this.goBack()));
    this.disposables.add(this.nextButton.onDidClick(() => this.goNext()));
  }
  goBack() {
    if (this.currentStep > 0 /* Attachments */) {
      this.setStep(this.currentStep - 1);
    }
  }
  goNext() {
    if (this.currentStep === 1 /* Describe */) {
      this.didAttemptDescribeSubmit = true;
      const hasIssueSource = this.selectedIssueSource !== void 0;
      const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension;
      const hasExtensionIssueUrl = this.selectedIssueSource !== IssueSource.Extension || !this.selectedExtension || !!this.getSelectedExtensionIssueUrl();
      const hasIssueType = this.selectedIssueType !== void 0;
      const hasDescription = this.hasDescriptionContent();
      const title = this.titleInput.value.trim();
      this.setFieldError(this.sourceButtonGroup, this.sourceError, !hasIssueSource);
      this.setFieldError(this.extensionField, this.extensionError, !hasExtension || !hasExtensionIssueUrl);
      this.setFieldError(this.typeButtonGroup, this.typeError, !hasIssueType);
      this.setFieldError(this.descriptionTextarea, this.descriptionError, !hasDescription);
      this.setFieldError(this.titleInput.element, this.titleError, !title);
      if (!hasIssueSource || !hasExtension || !hasExtensionIssueUrl || !hasIssueType || !hasDescription || !title) {
        if (!hasIssueSource) {
          this.issueSourceButtons.find((button) => !button.element.classList.contains("hidden"))?.element.focus();
        } else if (!hasExtension || !hasExtensionIssueUrl) {
          this.extensionSelect.focus();
        } else if (!hasIssueType) {
          this.issueTypeButtons[0]?.element.focus();
        } else if (!hasDescription) {
          this.descriptionTextarea.focus();
        } else {
          this.titleInput.focus();
        }
        return;
      }
      this.updateIssueSourceFlags();
      this.model.update({ issueDescription: this.descriptionTextarea.value.trim() });
    }
    if (this.currentStep === 2 /* Review */) {
      if (this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing)) {
        return;
      }
      this.submit();
      return;
    }
    if (this.currentStep < 2 /* Review */) {
      this.setStep(this.currentStep + 1);
    }
  }
  setStep(step) {
    const oldStep = this.currentStep;
    this.currentStep = step;
    const oldPage = this.stepPages[oldStep];
    const newPage = this.stepPages[step];
    oldPage.style.display = "none";
    newPage.style.display = "flex";
    this.updateStepUI();
    if (step === 1 /* Describe */) {
      this.descriptionTextarea.focus();
    } else if (step === 2 /* Review */) {
      this.updateReviewDetails();
      this.searchSimilarIssues();
      this.wizardPanel.focus();
    } else {
      this.wizardPanel.focus();
    }
  }
  updateStepUI() {
    const stepNum = this.currentStep + 1;
    this.stepIndicator.textContent = localize("stepOf", "Step {0} of {1}", stepNum, STEP_COUNT);
    const stepNames = [
      localize("screenshots", "Attachments"),
      localize("composeMessage", "Describe"),
      localize("submit", "Review")
    ];
    this.stepLabel.textContent = stepNames[this.currentStep];
    for (let i = 0; i < this.progressDots.length; i++) {
      this.progressDots[i].classList.toggle("active", i === this.currentStep);
      this.progressDots[i].classList.toggle("completed", i < this.currentStep);
    }
    for (let i = 0; i < this.stepPages.length; i++) {
      if (i === this.currentStep) {
        this.stepPages[i].style.display = "flex";
      } else if (!this.stepPages[i].classList.contains("slide-out-left") && !this.stepPages[i].classList.contains("slide-out-right")) {
        this.stepPages[i].style.display = "none";
      }
    }
    this.backButton.element.style.display = this.currentStep === 0 /* Attachments */ ? "none" : "";
    if (this.closeButton) {
      const currentDraftPreviewed = this.previewedDraftKey === this.getDraftKey();
      this.closeButton.element.style.display = this.previewOpened && currentDraftPreviewed && this.currentStep === 2 /* Review */ ? "" : "none";
    }
    if (this.currentStep === 2 /* Review */) {
      const externalExtensionUrl = this.selectedIssueSource === IssueSource.Extension && this.getIssueTargetUrl() && !this.isGitHubUrl(this.getIssueTargetUrl());
      const waitingForData = this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing);
      if (waitingForData) {
        this.nextButton.label = `$(loading~spin) ${localize("loadingDiagnostics", "Loading diagnostics...")}`;
        this.nextButton.element.title = localize("waitingForDiagnostics", "Waiting for performance diagnostics to finish loading");
        this.nextButton.enabled = false;
      } else {
        this.nextButton.label = externalExtensionUrl ? localize("openExternalIssueReporter", "Open External Issue Reporter") : localize("previewOnGitHub", "Preview on GitHub");
        this.nextButton.element.title = this.nextButton.label;
        this.nextButton.enabled = true;
      }
    } else if (this.currentStep === 0 /* Attachments */) {
      this.nextButton.label = this.getTotalAttachments() === 0 ? localize("skip", "Skip") : localize("next", "Next");
      this.nextButton.element.title = this.nextButton.label;
    } else {
      this.nextButton.label = localize("next", "Next");
      this.nextButton.element.title = localize("next", "Next");
    }
    this.updateCaptureStripVisibility();
    this.updateNextButtonForRecording();
  }
  updateReviewDetails() {
    const page = this.stepPages[2 /* Review */];
    const details = page.querySelector(".wizard-review-details");
    if (!details) {
      return;
    }
    this.reviewRenderDisposables.clear();
    details.textContent = "";
    const similarSection = append(details, $("div.review-section.wizard-review-similar-section"));
    this.similarIssuesContainer = append(similarSection, $("div.wizard-similar-issues"));
    this.similarIssuesContainer.setAttribute("aria-live", "polite");
    this.renderSimilarIssuesMessage(localize("searchingSimilarIssues", "Searching similar issues..."));
    const sourceSection = append(details, $("div.review-section"));
    const sourceLabel = append(sourceSection, $("div.review-label"));
    sourceLabel.textContent = localize("target", "Target");
    const sourceValue = append(sourceSection, $("div.review-value"));
    sourceValue.textContent = this.getIssueSourceLabel();
    const catSection = append(details, $("div.review-section"));
    const catLabel = append(catSection, $("div.review-label"));
    catLabel.textContent = localize("category", "Category");
    const catValue = append(catSection, $("div.review-value"));
    const typeLabels = {
      [IssueType.Bug]: localize("bug", "Bug"),
      [IssueType.FeatureRequest]: localize("featureRequest", "Feature Request"),
      [IssueType.PerformanceIssue]: localize("performanceIssue", "Performance Issue")
    };
    catValue.textContent = (this.selectedIssueType !== void 0 ? typeLabels[this.selectedIssueType] : void 0) ?? localize("unknown", "Unknown");
    const titleSection = append(details, $("div.review-section"));
    const titleLabel = append(titleSection, $("div.review-label"));
    titleLabel.textContent = localize("issueTitle", "Title");
    const titleValue = append(titleSection, $("div.review-value"));
    titleValue.textContent = this.titleInput.value.trim() || localize("noTitle", "(no title)");
    const descSection = append(details, $("div.review-section"));
    const descLabel = append(descSection, $("div.review-label"));
    descLabel.textContent = localize("description", "Description");
    const descValue = append(descSection, $("div.review-value.review-description"));
    const description = this.descriptionTextarea.value.trim();
    if (description && this.markdownRendererService) {
      const renderedMarkdown = this.markdownRendererService.render(
        new MarkdownString(description),
        { markedOptions: { breaks: true } }
      );
      append(descValue, renderedMarkdown.element);
      this.reviewRenderDisposables.add(renderedMarkdown);
    } else {
      descValue.textContent = description || localize("noDescription", "(no description)");
    }
    const totalAttachments = this.screenshots.length + this.recordings.length;
    if (totalAttachments > 0) {
      const attachSection = append(details, $("div.review-section"));
      const attachLabel = append(attachSection, $("div.review-label"));
      attachLabel.textContent = localize("attachments", "Attachments ({0})", totalAttachments);
      const thumbRow = append(attachSection, $("div.review-thumbnails"));
      this.reviewThumbCards = [];
      for (let i = 0; i < this.screenshots.length; i++) {
        const s = this.screenshots[i];
        const card = append(thumbRow, $("div.wizard-screenshot-card.review-attachment-card"));
        const img = append(card, $("img"));
        img.src = s.annotatedDataUrl ?? s.dataUrl;
        img.alt = localize("screenshotAlt", "Screenshot {0}", i + 1);
        const progressOverlay = append(card, $("div.review-progress-overlay"));
        append(progressOverlay, $("div.review-progress-ring"));
        this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
          if (!this.uploading) {
            this._onDidRequestOpenScreenshot.fire(s);
          }
        }));
        this.reviewThumbCards.push(card);
      }
      for (let i = 0; i < this.recordings.length; i++) {
        const rec = this.recordings[i];
        const card = this.renderRecordingCard(thumbRow, rec, i);
        card.classList.add("review-attachment-card");
        const progressOverlay = append(card, $("div.review-progress-overlay"));
        append(progressOverlay, $("div.review-progress-ring"));
        this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
          if (!this.uploading) {
            this._onDidRequestOpenRecording.fire(rec.filePath);
          }
        }));
        this.reviewThumbCards.push(card);
      }
    }
    const diagContainer = append(details, $("div.review-diagnostics"));
    const modelData = this.model.getData();
    let diagnosticSectionCount = 0;
    if (modelData.versionInfo || modelData.systemInfo) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "system-info",
        label: localize("systemInformation", "System Information"),
        checked: this.includeSystemInfo,
        onToggle: (checked) => {
          this.includeSystemInfo = checked;
          this.model.update({ includeSystemInfo: checked });
        },
        renderContent: (container) => {
          const sysTable = append(container, $("table.review-diag-table"));
          if (modelData.versionInfo) {
            this.addDiagRow(sysTable, "VS Code", modelData.versionInfo.vscodeVersion);
            this.addDiagRow(sysTable, "OS", modelData.versionInfo.os);
          }
          if (modelData.systemInfo) {
            this.addDiagRow(sysTable, "CPUs", modelData.systemInfo.cpus ?? "");
            this.addDiagRow(sysTable, "Memory", modelData.systemInfo.memory);
            this.addDiagRow(sysTable, "VM", modelData.systemInfo.vmHint);
            this.addDiagRow(sysTable, "Screen Reader", modelData.systemInfo.screenReader);
          }
          this.addDiagRow(sysTable, "User Agent", navigator.userAgent);
          this.addDiagRow(sysTable, "Installation pure", String(modelData.isInstallationPure ?? true));
          if (modelData.restrictedMode) {
            this.addDiagRow(sysTable, "Mode", "Restricted");
          }
        }
      });
    } else {
      const loading = append(diagContainer, $("div.review-diag-loading"));
      loading.textContent = localize("loadingSystemInfo", "Loading system information...");
    }
    if (modelData.extensionData) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "extension-data",
        label: localize("extensionData", "Extension Data"),
        checked: this.includeExtensionData,
        onToggle: (checked) => {
          this.includeExtensionData = checked;
          this.model.update({ includeExtensionData: checked });
        },
        renderContent: (container) => {
          const pre = append(container, $("pre.review-diag-pre"));
          pre.textContent = modelData.extensionData;
        }
      });
    }
    const nonThemeExtensions = (modelData.allExtensions ?? []).filter((e) => !e.isTheme && !e.isBuiltin);
    if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && nonThemeExtensions.length > 0) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "extensions",
        label: localize("extensions", "Extensions ({0})", nonThemeExtensions.length),
        checked: this.includeExtensions,
        onToggle: (checked) => {
          this.includeExtensions = checked;
          this.model.update({ includeExtensions: checked });
        },
        renderContent: (container) => {
          const extTable = append(container, $("table.review-diag-table.review-ext-table"));
          const header = append(extTable, $("tr"));
          for (const h of ["Name", "Identifier", "Author", "Version"]) {
            const th = append(header, $("th.review-ext-th"));
            th.textContent = h;
          }
          for (const ext of nonThemeExtensions) {
            const row = append(extTable, $("tr"));
            append(row, $("td")).textContent = ext.displayName || ext.name;
            append(row, $("td")).textContent = ext.id;
            append(row, $("td")).textContent = ext.publisher ?? "";
            append(row, $("td")).textContent = ext.version;
          }
        }
      });
    }
    if (modelData.experimentInfo) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "experiments",
        label: localize("abExperiments", "A/B Experiments"),
        checked: this.includeExperiments,
        onToggle: (checked) => {
          this.includeExperiments = checked;
          this.model.update({ includeExperiments: checked });
        },
        renderContent: (container) => {
          const pre = append(container, $("pre.review-diag-pre"));
          pre.textContent = modelData.experimentInfo;
        }
      });
    }
    if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
      const performanceContainer = append(diagContainer, $("div.review-performance-data"));
      if (this.performanceInfoRefreshing) {
        performanceContainer.classList.add("refreshing");
      }
      const performanceTitleRow = append(performanceContainer, $("div.review-performance-title-row"));
      const performanceTitle = append(performanceTitleRow, $("div.review-performance-title"));
      performanceTitle.textContent = localize("additionalPerformanceData", "Additional Performance Data");
      if (this.refreshPerformanceInfo) {
        const refreshBtn = this.disposables.add(new Button(performanceTitleRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        refreshBtn.element.classList.add("review-performance-refresh");
        refreshBtn.label = `$(refresh) ${localize("refresh", "Refresh")}`;
        refreshBtn.element.title = localize("refreshPerformanceData", "Reload running processes and workspace metadata");
        refreshBtn.enabled = !this.performanceInfoRefreshing;
        this.disposables.add(refreshBtn.onDidClick(async () => {
          if (!this.refreshPerformanceInfo || this.performanceInfoRefreshing) {
            return;
          }
          this.performanceInfoRefreshing = true;
          refreshBtn.enabled = false;
          performanceContainer.classList.add("refreshing");
          this.updateStepUI();
          try {
            await this.refreshPerformanceInfo();
          } finally {
            this.performanceInfoRefreshing = false;
            if (this.currentStep === 2 /* Review */) {
              this.updateReviewDetails();
            }
            this.updateStepUI();
          }
        }));
      }
      const performanceDescription = append(performanceContainer, $("div.review-performance-description"));
      performanceDescription.textContent = localize("additionalPerformanceDataDescription", "Optionally include currently running processes and workspace metadata to help diagnose performance issues.");
      if (modelData.processInfo) {
        diagnosticSectionCount++;
        this.createDiagSection(performanceContainer, {
          id: "process-info",
          label: localize("runningProcesses", "Running Processes"),
          checked: this.includeProcessInfo,
          onToggle: (checked) => {
            this.includeProcessInfo = checked;
            this.model.update({ includeProcessInfo: checked });
          },
          renderContent: (container) => {
            const pre = append(container, $("pre.review-diag-pre"));
            pre.textContent = modelData.processInfo;
          }
        });
      } else if (!this.performanceInfoLoaded) {
        const loading = append(performanceContainer, $("div.review-diag-loading"));
        loading.textContent = localize("loadingProcessInfo", "Loading currently running processes...");
      }
      if (modelData.workspaceInfo) {
        diagnosticSectionCount++;
        this.createDiagSection(performanceContainer, {
          id: "workspace-info",
          label: localize("workspaceMetadata", "Workspace Metadata"),
          checked: this.includeWorkspaceInfo,
          onToggle: (checked) => {
            this.includeWorkspaceInfo = checked;
            this.model.update({ includeWorkspaceInfo: checked });
          },
          renderContent: (container) => {
            const pre = append(container, $("pre.review-diag-pre"));
            pre.textContent = modelData.workspaceInfo;
          }
        });
      } else if (!this.performanceInfoLoaded) {
        const loading = append(performanceContainer, $("div.review-diag-loading"));
        loading.textContent = localize("loadingWorkspaceInfo", "Loading workspace metadata...");
      }
    }
    if (diagnosticSectionCount > 0) {
      const heading = document.createElement("div");
      heading.className = "review-diag-heading";
      const masterWrap = append(heading, $("div.review-diag-master-wrap"));
      const masterCheckbox = this.disposables.add(new Checkbox(localize("additionalInformation", "Additional Information"), !this.diagnosticsCollapsed, defaultCheckboxStyles));
      masterCheckbox.domNode.classList.add("review-diag-master-checkbox");
      masterWrap.appendChild(masterCheckbox.domNode);
      const title = append(masterWrap, $("h3.review-diag-heading-title"));
      title.textContent = localize("additionalInformation", "Additional Information");
      this.disposables.add(masterCheckbox.onChange(() => {
        this.diagnosticsCollapsed = !masterCheckbox.checked;
        this.setAllDiagnosticSectionsIncluded(masterCheckbox.checked);
      }));
      diagContainer.classList.toggle("all-excluded", this.diagnosticsCollapsed);
      diagContainer.prepend(heading);
    }
    const titles = diagContainer.querySelectorAll(".review-diag-title");
    let maxWidth = 0;
    for (const t of titles) {
      t.style.minWidth = "";
    }
    for (const t of titles) {
      maxWidth = Math.max(maxWidth, t.offsetWidth);
    }
    if (maxWidth > 0) {
      for (const t of titles) {
        t.style.minWidth = `${maxWidth}px`;
      }
    }
  }
  setAllDiagnosticSectionsIncluded(included) {
    this.includeSystemInfo = included;
    this.includeExtensionData = included;
    this.includeExtensions = included;
    this.includeExperiments = included;
    this.includeProcessInfo = included;
    this.includeWorkspaceInfo = included;
    this.model.update({
      includeSystemInfo: included,
      includeExtensionData: included,
      includeExtensions: included,
      includeExperiments: included,
      includeProcessInfo: included,
      includeWorkspaceInfo: included
    });
    this.updateReviewDetails();
  }
  createDiagSection(parent, opts) {
    const group = append(parent, $("div.review-diag-group"));
    group.classList.toggle("excluded", !opts.checked);
    const header = append(group, $("div.review-diag-header"));
    const checkWrap = append(header, $("div.review-diag-check-wrap"));
    const checkbox = this.disposables.add(new Checkbox(opts.label, opts.checked, defaultCheckboxStyles));
    checkbox.domNode.classList.add("review-diag-checkbox");
    checkWrap.appendChild(checkbox.domNode);
    const toggleArea = append(header, $("div.review-diag-toggle-area"));
    toggleArea.setAttribute("role", "button");
    toggleArea.setAttribute("tabindex", "0");
    toggleArea.setAttribute("aria-expanded", "true");
    const chevron = append(toggleArea, $("span.review-diag-chevron"));
    chevron.appendChild(renderIcon(Codicon.chevronDown));
    const title = append(toggleArea, $("span.review-diag-title"));
    title.textContent = opts.label;
    const content = append(group, $("div.review-diag-content"));
    opts.renderContent(content);
    let expanded = true;
    const setExpanded = (next) => {
      expanded = next;
      content.style.display = expanded ? "" : "none";
      toggleArea.setAttribute("aria-expanded", String(expanded));
      chevron.textContent = "";
      chevron.appendChild(renderIcon(expanded ? Codicon.chevronDown : Codicon.chevronRight));
    };
    this.disposables.add(addDisposableListener(toggleArea, EventType.CLICK, () => setExpanded(!expanded)));
    this.disposables.add(addDisposableListener(toggleArea, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        e.preventDefault();
        setExpanded(!expanded);
      }
    }));
    this.disposables.add(checkbox.onChange(() => {
      opts.onToggle(checkbox.checked);
      group.classList.toggle("excluded", !checkbox.checked);
      this.updateStepUI();
    }));
  }
  addDiagRow(table, label, value) {
    const row = append(table, $("tr"));
    const th = append(row, $("td.review-diag-key"));
    th.textContent = label;
    const td = append(row, $("td.review-diag-val"));
    td.textContent = value;
  }
  /** Called by the form service to show upload progress */
  setUploading(uploading) {
    this.uploading = uploading;
    if (uploading) {
      this.nextButton.element.classList.add("uploading");
      this.nextButton.label = localize("uploading", "Uploading...");
      this.nextButton.enabled = false;
      this.backButton.element.style.display = "none";
    } else {
      this.nextButton.element.classList.remove("uploading");
      this.nextButton.enabled = true;
      this.updateStepUI();
    }
  }
  /** Mark a specific attachment as uploading / done */
  setAttachmentUploadState(index, state) {
    if (index < 0 || index >= this.reviewThumbCards.length) {
      return;
    }
    const card = this.reviewThumbCards[index];
    card.classList.remove("upload-pending", "upload-uploading", "upload-done");
    card.classList.add(`upload-${state}`);
    const overlay = card.querySelector(".review-progress-overlay");
    if (!overlay) {
      return;
    }
    if (state === "done") {
      overlay.textContent = "";
      const check = $("span.review-progress-check");
      check.appendChild(renderIcon(Codicon.check));
      overlay.appendChild(check);
    }
  }
  submit() {
    const title = this.titleInput.value.trim();
    if (!title) {
      return;
    }
    const description = this.descriptionTextarea.value.trim();
    this.updateIssueSourceFlags();
    this.model.update({ issueDescription: description, issueTitle: title, ...this.selectedIssueType !== void 0 ? { issueType: this.selectedIssueType } : {} });
    const body = this.buildIssueBody();
    this._onDidSubmit.fire({ title, body });
  }
  show() {
    if (this.visible) {
      return;
    }
    this.visible = true;
    this.wizardPanel.classList.add("open", "wizard-embedded");
    this.wizardPanel.style.maxHeight = "none";
    append(this.container, this.wizardPanel);
    this.wizardPanel.focus();
  }
  getTotalAttachments() {
    return this.screenshots.length + this.recordings.length;
  }
  getScreenshotDelayOptions() {
    return [
      { label: localize("noDelay", "No delay"), value: 0 },
      { label: localize("threeSeconds", "3 seconds"), value: 3 },
      { label: localize("fiveSeconds", "5 seconds"), value: 5 },
      { label: localize("tenSeconds", "10 seconds"), value: 10 }
    ];
  }
  getFloatingBarButtonStyles(targetWindow) {
    const containerStyles = targetWindow.getComputedStyle(this.container);
    const cssVar = (name, fallback) => containerStyles.getPropertyValue(name).trim() || fallback;
    return {
      ...defaultButtonStyles,
      buttonForeground: cssVar("--vscode-button-foreground", "#fff"),
      buttonBackground: cssVar("--vscode-button-background", "#0e639c"),
      buttonHoverBackground: cssVar("--vscode-button-hoverBackground", "#1177bb"),
      buttonBorder: cssVar("--vscode-button-border", "transparent")
    };
  }
  addScreenshot(screenshot) {
    if (this.getTotalAttachments() >= MAX_ATTACHMENTS) {
      return;
    }
    this.screenshots.push(screenshot);
    if (this.currentStep !== 0 /* Attachments */) {
      this.setStep(0 /* Attachments */);
    }
    this.updateAttachmentViews();
    this.updateAttachmentButtons();
    this.updateStepUI();
    this._onDidChangeAttachments.fire();
    this.openAnnotationEditor(this.screenshots.length - 1);
  }
  updateAttachmentButtons() {
    const atMax = this.getTotalAttachments() >= MAX_ATTACHMENTS;
    const maxMsg = localize("maxAttachmentsReached", "Max attachments reached");
    const wouldReachMax = this.getTotalAttachments() >= MAX_ATTACHMENTS - 1;
    const screenshotDisabled = atMax || wouldReachMax && this.currentRecordingState === RecordingState.Recording || this.delayedScreenshotPending;
    const recordDisabled = atMax || wouldReachMax && this.delayedScreenshotPending;
    if (this.captureStripCaptureBtn) {
      this.captureStripCaptureBtn.enabled = !screenshotDisabled;
      this.captureStripCaptureBtn.element.title = screenshotDisabled ? maxMsg : localize("screenshot", "Screenshot");
    }
    if (this.captureStripDelayBtn) {
      this.captureStripDelayBtn.enabled = !screenshotDisabled;
      this.captureStripDelayBtn.element.title = screenshotDisabled ? maxMsg : localize("captureOptions", "Capture options");
    }
    if (this.captureStripRecordBtn) {
      if (this.currentRecordingState !== RecordingState.Recording) {
        this.captureStripRecordBtn.enabled = !recordDisabled;
        this.captureStripRecordBtn.element.title = recordDisabled ? maxMsg : localize("recordVideo", "Record video");
      }
    }
    this.updateNextButtonForRecording();
  }
  updateNextButtonForRecording() {
    if (this.currentStep !== 2 /* Review */) {
      return;
    }
    const recording = this.currentRecordingState === RecordingState.Recording;
    this.nextButton.enabled = !recording;
    this.nextButton.element.title = recording ? localize("recordingActive", "Recording active") : localize("previewOnGitHub", "Preview on GitHub");
  }
  renderRecordingCard(parent, rec, index) {
    const card = append(parent, $("div.wizard-screenshot-card.wizard-recording-card"));
    if (rec.thumbnailDataUrl) {
      const thumbImg = append(card, $("img.wizard-screenshot-img"));
      thumbImg.setAttribute("src", rec.thumbnailDataUrl);
      thumbImg.alt = localize("recordingThumbnailAlt", "Recording {0}", index + 1);
      thumbImg.setAttribute("draggable", "false");
    }
    const playOverlay = append(card, $("div.wizard-recording-play"));
    playOverlay.appendChild(renderIcon(Codicon.play));
    const durSec = Math.floor(rec.durationMs / 1e3);
    const durLabel = append(card, $("div.wizard-recording-duration"));
    durLabel.textContent = `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, "0")}`;
    return card;
  }
  updateScreenshotThumbnails() {
    this.screenshotContainer.textContent = "";
    for (let i = 0; i < this.screenshots.length; i++) {
      const screenshot = this.screenshots[i];
      const card = append(this.screenshotContainer, $("div.wizard-screenshot-card"));
      const img = append(card, $("img"));
      img.src = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
      img.alt = localize("screenshotAlt", "Screenshot {0}", i + 1);
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.title = localize("editScreenshot", "Click to edit screenshot");
      const openEditor = () => this.openAnnotationEditor(i);
      this.disposables.add(addDisposableListener(card, EventType.CLICK, openEditor));
      this.disposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
          e.preventDefault();
          openEditor();
        }
      }));
      const deleteBtn = append(card, $("div.wizard-screenshot-delete"));
      deleteBtn.setAttribute("role", "button");
      deleteBtn.setAttribute("aria-label", localize("deleteScreenshot", "Delete screenshot"));
      deleteBtn.appendChild(renderIcon(Codicon.close));
      this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, (e) => {
        e.stopPropagation();
        this.screenshots.splice(i, 1);
        this.updateScreenshotThumbnails();
        this.updateAttachmentButtons();
        this.updateStepUI();
        this._onDidChangeAttachments.fire();
      }));
    }
    for (let i = 0; i < this.recordings.length; i++) {
      const rec = this.recordings[i];
      const card = this.renderRecordingCard(this.screenshotContainer, rec, i);
      this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
        this._onDidRequestOpenRecording.fire(rec.filePath);
      }));
      const deleteBtn = append(card, $("div.wizard-screenshot-delete"));
      deleteBtn.setAttribute("role", "button");
      deleteBtn.setAttribute("aria-label", localize("deleteRecording", "Remove recording"));
      deleteBtn.appendChild(renderIcon(Codicon.close));
      this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, (e) => {
        e.stopPropagation();
        this.recordings.splice(i, 1);
        this.updateScreenshotThumbnails();
        this.updateAttachmentButtons();
        this.updateStepUI();
        this._onDidChangeAttachments.fire();
      }));
    }
    if (this.getTotalAttachments() < MAX_ATTACHMENTS) {
      const wouldReachMax = this.getTotalAttachments() >= MAX_ATTACHMENTS - 1;
      const addDisabled = wouldReachMax && (this.currentRecordingState === RecordingState.Recording || this.delayedScreenshotPending);
      const addCard = append(this.screenshotContainer, $("div.wizard-screenshot-card.wizard-screenshot-add"));
      if (addDisabled) {
        addCard.classList.add("disabled");
        addCard.title = localize("maxAttachmentsReached", "Max attachments reached");
      }
      const plus = append(addCard, $("div.wizard-screenshot-plus"));
      plus.appendChild(renderIcon(Codicon.add));
      this.disposables.add(addDisposableListener(addCard, EventType.CLICK, () => {
        if (!addCard.classList.contains("disabled")) {
          this._onDidRequestScreenshot.fire();
        }
      }));
    }
  }
  openAnnotationEditor(index) {
    if (index < 0 || index >= this.screenshots.length) {
      return;
    }
    const screenshot = this.screenshots[index];
    const editor = new ScreenshotAnnotationEditor(screenshot, this.wizardPanel, screenshot.annotationState);
    this.disposables.add(editor);
    this.disposables.add(editor.onDidSave(({ dataUrl, state }) => {
      screenshot.annotatedDataUrl = dataUrl;
      screenshot.annotationState = state;
      this.updateAttachmentViews();
      this._onDidChangeAttachments.fire();
    }));
    this.disposables.add(editor.onDidCancel(() => {
    }));
  }
  getScreenshots() {
    return this.screenshots;
  }
  getRecordings() {
    return this.recordings;
  }
  /**
   * Replace the current attachments with a previously-captured set. Used when the
   * issue reporter editor is moved between the main editor area and a modal editor
   * part in the Agents Window, which rebuilds the wizard and would otherwise drop
   * the in-memory screenshots and recordings. Does not fire
   * `onDidChangeAttachments` since the host is the source of this state.
   */
  restoreAttachments(screenshots, recordings) {
    this.screenshots.length = 0;
    this.screenshots.push(...screenshots.slice(0, MAX_ATTACHMENTS));
    this.recordings.length = 0;
    this.recordings.push(...recordings.slice(0, Math.max(0, MAX_ATTACHMENTS - this.screenshots.length)));
    this.updateAttachmentViews();
    this.updateAttachmentButtons();
    this.updateStepUI();
  }
  buildIssueBody() {
    const description = this.descriptionTextarea.value.trim();
    this.model.update({
      issueDescription: description,
      issueType: this.selectedIssueType ?? IssueType.Bug,
      includeSystemInfo: this.includeSystemInfo,
      includeProcessInfo: this.includeProcessInfo,
      includeWorkspaceInfo: this.includeWorkspaceInfo,
      includeExtensions: this.includeExtensions,
      includeExperiments: this.includeExperiments,
      includeExtensionData: this.includeExtensionData
    });
    const modelData = this.model.getData();
    const sections = [
      `### Description

${description}`,
      this.generateIssueDetailsMd()
    ];
    if (this.includeExtensionData && modelData.extensionData) {
      sections.push(this.createDetails("Extension Data", modelData.extensionData));
    }
    if (this.includeSystemInfo && (modelData.versionInfo || modelData.systemInfo || modelData.systemInfoWeb)) {
      sections.push(this.generateSystemInfoMd());
    }
    if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && this.includeExtensions) {
      sections.push(this.generateExtensionsMd());
    }
    if (this.includeExperiments && modelData.experimentInfo) {
      sections.push(this.createDetails("A/B Experiments", this.createCodeBlock(modelData.experimentInfo)));
    }
    if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
      if (this.includeProcessInfo && modelData.processInfo) {
        sections.push(this.createDetails("Running Processes", this.createCodeBlock(modelData.processInfo)));
      }
      if (this.includeWorkspaceInfo && modelData.workspaceInfo) {
        sections.push(this.createDetails("Workspace Metadata", this.createCodeBlock(modelData.workspaceInfo)));
      }
    }
    sections.push("<!-- generated by issue reporter -->");
    return sections.join("\n\n");
  }
  generateIssueDetailsMd() {
    const modelData = this.model.getData();
    const rows = [
      ["Issue Category", this.getIssueTypeTitle(this.selectedIssueType ?? IssueType.Bug)],
      ["Target", this.getIssueSourceLabel()],
      ["VS Code Version", modelData.versionInfo?.vscodeVersion ?? product.version],
      ["OS Version", modelData.versionInfo?.os ?? modelData.systemInfo?.os]
    ];
    if (this.selectedIssueSource === IssueSource.Extension && this.selectedExtension) {
      rows.push(
        ["Extension Identifier", this.selectedExtension.id],
        ["Extension Version", this.selectedExtension.version],
        ["Extension Publisher", this.selectedExtension.publisher]
      );
    }
    return `### Issue Details

${this.createMarkdownTable(rows)}`;
  }
  generateSystemInfoMd() {
    const modelData = this.model.getData();
    const rows = [];
    if (modelData.versionInfo) {
      rows.push(
        ["VS Code Version", modelData.versionInfo.vscodeVersion],
        ["OS Version", modelData.versionInfo.os]
      );
    }
    if (modelData.systemInfo) {
      rows.push(
        ["CPUs", modelData.systemInfo.cpus],
        ["GPU Status", Object.keys(modelData.systemInfo.gpuStatus).map((key) => `${key}: ${modelData.systemInfo.gpuStatus[key]}`).join("<br>")],
        ["Load (avg)", modelData.systemInfo.load],
        ["Memory (System)", modelData.systemInfo.memory],
        ["Process Argv", modelData.systemInfo.processArgs],
        ["Screen Reader", modelData.systemInfo.screenReader],
        ["VM", modelData.systemInfo.vmHint]
      );
      if (modelData.systemInfo.linuxEnv) {
        rows.push(
          ["DESKTOP_SESSION", modelData.systemInfo.linuxEnv.desktopSession],
          ["XDG_CURRENT_DESKTOP", modelData.systemInfo.linuxEnv.xdgCurrentDesktop],
          ["XDG_SESSION_DESKTOP", modelData.systemInfo.linuxEnv.xdgSessionDesktop],
          ["XDG_SESSION_TYPE", modelData.systemInfo.linuxEnv.xdgSessionType]
        );
      }
      for (const remote of modelData.systemInfo.remoteData) {
        if (isRemoteDiagnosticError(remote)) {
          rows.push(["Remote Error", remote.errorMessage]);
        } else {
          rows.push(
            ["Remote", remote.latency ? `${remote.hostName} (latency: ${remote.latency.current.toFixed(2)}ms last, ${remote.latency.average.toFixed(2)}ms average)` : remote.hostName],
            ["Remote OS", remote.machineInfo.os],
            ["Remote CPUs", remote.machineInfo.cpus],
            ["Remote Memory (System)", remote.machineInfo.memory],
            ["Remote VM", remote.machineInfo.vmHint]
          );
        }
      }
    }
    if (modelData.systemInfoWeb) {
      rows.push(["User Agent", modelData.systemInfoWeb]);
    }
    rows.push(["Installation pure", String(modelData.isInstallationPure ?? true)]);
    return this.createDetails("System Info", this.createMarkdownTable(rows));
  }
  generateExtensionsMd() {
    const modelData = this.model.getData();
    const nonThemeExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions.filter((extension) => !extension.isTheme && !extension.isBuiltin);
    if (modelData.extensionsDisabled) {
      return "### Extensions\n\nExtensions disabled.";
    }
    if (!nonThemeExtensions.length && !modelData.numberOfThemeExtesions) {
      return "### Extensions\n\nExtensions: none";
    }
    const rows = nonThemeExtensions.map((extension) => [
      extension.displayName || extension.name,
      extension.id,
      extension.publisher ?? "N/A",
      extension.version
    ]);
    const details = [];
    if (rows.length) {
      details.push(this.createMarkdownTable(rows, ["Name", "Identifier", "Author", "Version"]));
    }
    if (modelData.numberOfThemeExtesions) {
      details.push(`Theme extensions: ${modelData.numberOfThemeExtesions}`);
    }
    return this.createDetails(`Extensions (${nonThemeExtensions.length})`, details.join("\n\n"));
  }
  getIssueTypeTitle(issueType) {
    switch (issueType) {
      case IssueType.Bug:
        return "Bug";
      case IssueType.PerformanceIssue:
        return "Performance Issue";
      case IssueType.FeatureRequest:
        return "Feature Request";
    }
  }
  createDetails(summary, content) {
    return `<details>
<summary>${summary}</summary>

${content}

</details>`;
  }
  createCodeBlock(content, language = "") {
    return `\`\`\`${language}
${content.trimEnd()}
\`\`\``;
  }
  createMarkdownTable(rows, headers = ["Item", "Value"]) {
    return `${headers.map((header) => this.escapeMarkdownTableCell(header)).join("|")}
${headers.map(() => "---").join("|")}
${rows.map((row) => row.map((value) => this.escapeMarkdownTableCell(value ?? "")).join("|")).join("\n")}`;
  }
  escapeMarkdownTableCell(value) {
    return value.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
  }
  setUpdateAvailable(showUpdateBanner) {
    this.showUpdateBanner = showUpdateBanner;
    this.updateBanner.style.display = showUpdateBanner ? "" : "none";
  }
  focus() {
    this.wizardPanel.focus();
  }
  getPanel() {
    return this.wizardPanel;
  }
  get recordingState() {
    return this.currentRecordingState;
  }
  hideFloatingBar() {
    if (this.floatingBar) {
      this.floatingBar.style.display = "none";
    }
  }
  showFloatingBar() {
    if (this.floatingBar) {
      this.floatingBar.style.display = "";
    }
  }
  get shouldHideToolbarForCapture() {
    return this._hideToolbarInScreenshots;
  }
  /** Re-parent the floating bar into the wizard's current window. */
  reparentFloatingBar() {
    if (!this.floatingBar) {
      return;
    }
    const targetWindow = getWindow(this.container);
    const workbench = targetWindow.document.querySelector(".monaco-workbench");
    const mountTarget = workbench ?? targetWindow.document.body;
    if (this.floatingBar.parentElement !== mountTarget) {
      this.floatingBar.remove();
      mountTarget.appendChild(this.floatingBar);
      this.floatingBar.style.left = "";
      this.floatingBar.style.top = "";
      this.floatingBar.style.right = "30%";
    }
  }
  /** Update the internal model with additional data loaded asynchronously */
  updateModel(newData) {
    this.model.update(newData);
    if (Array.isArray(newData.allExtensions)) {
      this.data.enabledExtensions = newData.allExtensions;
      this.updateExtensionOptions();
      this.updateIssueSourceFlags();
      this.updateIssueSourceButtons();
    }
    if (this.currentStep === 2 /* Review */) {
      this.updateReviewDetails();
    }
  }
  /** Called once performance info has resolved; suppresses "Loading…" placeholders. */
  markPerformanceInfoLoaded() {
    this.performanceInfoLoaded = true;
    if (this.currentStep === 2 /* Review */) {
      this.updateReviewDetails();
      this.updateStepUI();
    }
  }
  hasUnsavedChanges() {
    if (this.previewOpened && this.previewedDraftKey === this.getDraftKey()) {
      return false;
    }
    return this.hasUserInput();
  }
  hasUserInput() {
    return !!(this.hasDescriptionContent() || this.titleInput.value.trim() || this.selectedIssueType !== void 0 || this.screenshots.length > 0 || this.recordings.length > 0);
  }
  markPreviewOpened() {
    this.previewOpened = true;
    this.previewedDraftKey = this.getDraftKey();
    this.updateStepUI();
  }
  getDraftKey() {
    return JSON.stringify({
      title: this.titleInput.value.trim(),
      description: this.descriptionTextarea.value.trim(),
      issueType: this.selectedIssueType,
      issueSource: this.selectedIssueSource,
      extensionId: this.selectedExtension?.id,
      includeSystemInfo: this.includeSystemInfo,
      includeProcessInfo: this.includeProcessInfo,
      includeWorkspaceInfo: this.includeWorkspaceInfo,
      includeExtensions: this.includeExtensions,
      includeExperiments: this.includeExperiments,
      includeExtensionData: this.includeExtensionData,
      screenshots: this.screenshots.map((screenshot) => screenshot.annotatedDataUrl ?? screenshot.dataUrl),
      recordings: this.recordings.map((recording) => recording.filePath)
    });
  }
  /** Set the title input value (e.g., from AI generation) */
  setGeneratedTitle(title) {
    this.titleInput.value = title;
    if (title.trim()) {
      this.setFieldError(this.titleInput.element, this.titleError, false);
    }
    this.resetGenerateButton();
  }
  resetGenerateButton() {
    this.generateTitleBtn.label = `$(sparkle) ${localize("generateTitleBtn", "Generate from description")}`;
    this.generateTitleBtn.element.classList.remove("loading");
    this.generateTitleBtn.element.style.minWidth = "";
    this.generateTitleBtn.enabled = this.hasDescriptionContent();
  }
  /** Show a "Close" button next to the submit button after successful submission */
  showCloseButton() {
    const nav = this.nextButton.element.parentElement;
    if (nav && !nav.querySelector(".wizard-close-btn")) {
      this.closeButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
      this.closeButton.label = localize("closeTab", "Close");
      this.closeButton.element.classList.add("wizard-close-btn");
      this.disposables.add(this.closeButton.onDidClick(() => {
        this._onDidClose.fire();
      }));
    }
    this.updateStepUI();
  }
  setRecordingState(state) {
    this.currentRecordingState = state;
    if (state === RecordingState.Recording) {
      this.recordingStartTime = Date.now();
      const formatTime = () => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1e3);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
        const secs = (elapsed % 60).toString().padStart(2, "0");
        return `${mins}:${secs}`;
      };
      const stopLabel = localize("stopRecording", "Stop recording");
      const makeLabel = () => `$(stop-circle) ${stopLabel} ${formatTime()}`;
      if (this.captureStripRecordBtn) {
        this.captureStripRecordBtn.element.classList.add("recording");
        this.captureStripRecordBtn.element.title = stopLabel;
        this.captureStripRecordBtn.label = makeLabel();
      }
      this.recordingElapsedTimer = getWindow(this.container).setInterval(() => {
        if (this.captureStripRecordBtn) {
          this.captureStripRecordBtn.label = makeLabel();
        }
      }, 1e3);
    } else {
      if (this.recordingElapsedTimer !== void 0) {
        getWindow(this.container).clearInterval(this.recordingElapsedTimer);
        this.recordingElapsedTimer = void 0;
      }
      if (this.captureStripRecordBtn) {
        this.captureStripRecordBtn.element.classList.remove("recording");
        this.captureStripRecordBtn.element.title = localize("recordVideo", "Record video");
        this.captureStripRecordBtn.label = `$(record) ${localize("recordVideo", "Record video")}`;
      }
    }
    this.updateScreenshotThumbnails();
    this.updateAttachmentButtons();
  }
  addRecording(filePath, durationMs, thumbnailDataUrl) {
    this.recordings.push({ filePath, durationMs, thumbnailDataUrl });
    if (this.currentStep !== 0 /* Attachments */) {
      this.setStep(0 /* Attachments */);
    }
    this.updateAttachmentViews();
    this.updateAttachmentButtons();
    this.updateStepUI();
    this._onDidChangeAttachments.fire();
  }
  updateAttachmentViews() {
    this.updateScreenshotThumbnails();
    if (this.currentStep === 2 /* Review */) {
      this.updateReviewDetails();
    }
  }
  /**
   * Trigger a screenshot capture as if the user clicked the screenshot button
   * on the floating capture bar. The floating bar is mounted at the workbench
   * root and the button is enabled regardless of the current wizard step, so
   * the shortcut works from any step without changing it. The existing
   * capture flow opens the annotation editor and re-activates the issue
   * reporter editor when the screenshot is added.
   *
   * No-op when the capture button is disabled (e.g. at the attachment limit).
   */
  triggerCaptureScreenshot() {
    const btn = this.captureStripCaptureBtn;
    if (!btn?.enabled) {
      return;
    }
    btn.element.click();
  }
  /**
   * Toggle screen recording on/off as if the user clicked the record button.
   * Works from any step without changing it. No-op when recording isn't
   * supported or the record button is disabled.
   */
  triggerToggleRecording() {
    if (!this.recordingSupported) {
      return;
    }
    const btn = this.captureStripRecordBtn;
    if (!btn?.enabled) {
      return;
    }
    btn.element.click();
  }
  renderShortcutKeycap(parent, keybinding) {
    const label = this.disposables.add(new KeybindingLabel(parent, OS, { ...defaultKeybindingLabelStyles }));
    label.set(keybinding);
    label.element.classList.add("wizard-shortcut");
  }
  dispose() {
    if (this.recordingElapsedTimer !== void 0) {
      getWindow(this.container).clearInterval(this.recordingElapsedTimer);
    }
    if (this.similarIssuesHandle !== void 0) {
      clearTimeout(this.similarIssuesHandle);
    }
    this.similarIssuesRequest++;
    this.reviewRenderDisposables.dispose();
    this.similarIssuesDisposables.dispose();
    this.descriptionGuidanceDisposables.dispose();
    this.disposables.dispose();
    this._onDidClose.dispose();
    this._onDidSubmit.dispose();
    this._onDidRequestScreenshot.dispose();
    this._onDidRequestStartRecording.dispose();
    this._onDidRequestStopRecording.dispose();
    this._onDidRequestOpenRecording.dispose();
    this._onDidRequestOpenScreenshot.dispose();
    this._onDidChangeAttachments.dispose();
    this._onDidRequestGenerateTitle.dispose();
  }
}
export {
  IssueReporterOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxicm93c2VyXFxpc3N1ZVJlcG9ydGVyT3ZlcmxheS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICcuL21lZGlhL2lzc3VlUmVwb3J0ZXJPdmVybGF5LmNzcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBFdmVudFR5cGUsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSwgU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhZ25vc3RpY3MvY29tbW9uL2RpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZUdpdEh1YlVybCB9IGZyb20gJy4uL2NvbW1vbi9pc3N1ZVJlcG9ydGVyVXRpbC5qcyc7XG5pbXBvcnQgeyBJc3N1ZVJlcG9ydGVyRGF0YSwgSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEsIElzc3VlU291cmNlLCBJc3N1ZVR5cGUgfSBmcm9tICcuLi9jb21tb24vaXNzdWUuanMnO1xuaW1wb3J0IHsgSXNzdWVSZXBvcnRlck1vZGVsIH0gZnJvbSAnLi9pc3N1ZVJlcG9ydGVyTW9kZWwuanMnO1xuaW1wb3J0IHsgUmVjb3JkaW5nU3RhdGUgfSBmcm9tICcuL3JlY29yZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFubm90YXRpb25FZGl0b3JTdGF0ZSwgU2NyZWVuc2hvdEFubm90YXRpb25FZGl0b3IgfSBmcm9tICcuL3NjcmVlbnNob3RBbm5vdGF0aW9uLmpzJztcblxuY29uc3QgTUFYX0FUVEFDSE1FTlRTID0gNTtcbmNvbnN0IE1BWF9TSU1JTEFSX0lTU1VFUyA9IDU7XG5cbmludGVyZmFjZSBJU2ltaWxhcklzc3VlIHtcblx0cmVhZG9ubHkgaHRtbF91cmw6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgc3RhdGU/OiBzdHJpbmc7XG59XG5cbmNvbnN0IGVudW0gV2l6YXJkU3RlcCB7XG5cdEF0dGFjaG1lbnRzID0gMCxcblx0RGVzY3JpYmUgPSAxLFxuXHRSZXZpZXcgPSAyLFxufVxuXG5jb25zdCBTVEVQX0NPVU5UID0gMztcblxuZXhwb3J0IGludGVyZmFjZSBJU2NyZWVuc2hvdCB7XG5cdHJlYWRvbmx5IGRhdGFVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cdGFubm90YXRlZERhdGFVcmw/OiBzdHJpbmc7XG5cdGFubm90YXRpb25TdGF0ZT86IElBbm5vdGF0aW9uRWRpdG9yU3RhdGU7XG59XG5cbmV4cG9ydCBjbGFzcyBJc3N1ZVJlcG9ydGVyT3ZlcmxheSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdWJtaXQgPSBuZXcgRW1pdHRlcjx7IHRpdGxlOiBzdHJpbmc7IGJvZHk6IHN0cmluZyB9PigpO1xuXHRyZWFkb25seSBvbkRpZFN1Ym1pdDogRXZlbnQ8eyB0aXRsZTogc3RyaW5nOyBib2R5OiBzdHJpbmcgfT4gPSB0aGlzLl9vbkRpZFN1Ym1pdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0U2NyZWVuc2hvdCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFNjcmVlbnNob3Q6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZXF1ZXN0U2NyZWVuc2hvdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0U3RhcnRSZWNvcmRpbmcgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RTdGFydFJlY29yZGluZzogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFJlcXVlc3RTdGFydFJlY29yZGluZy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0U3RvcFJlY29yZGluZyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFN0b3BSZWNvcmRpbmc6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZXF1ZXN0U3RvcFJlY29yZGluZy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0T3BlblJlY29yZGluZyA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0T3BlblJlY29yZGluZzogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmcuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdE9wZW5TY3JlZW5zaG90ID0gbmV3IEVtaXR0ZXI8SVNjcmVlbnNob3Q+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdE9wZW5TY3JlZW5zaG90OiBFdmVudDxJU2NyZWVuc2hvdD4gPSB0aGlzLl9vbkRpZFJlcXVlc3RPcGVuU2NyZWVuc2hvdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBdHRhY2htZW50cyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdC8qKiBGaXJlcyB3aGVuZXZlciB0aGUgc2NyZWVuc2hvdC9yZWNvcmRpbmcgY29sbGVjdGlvbiBjaGFuZ2VzIHNvIHRoZSBob3N0IGNhbiBwZXJzaXN0IGl0LiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUF0dGFjaG1lbnRzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNobWVudHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSB3aXphcmRQYW5lbCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHVwZGF0ZUJhbm5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHN0ZXBDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzdGVwUGFnZXM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuXHQvLyBTdGVwIDE6IERlc2NyaWJlIChjYXRlZ29yeSArIGRlc2NyaXB0aW9uICsgdGl0bGUpXG5cdHByaXZhdGUgcmVhZG9ubHkgaXNzdWVUeXBlQnV0dG9uczogQnV0dG9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBpc3N1ZVNvdXJjZUJ1dHRvbnM6IEJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgc2VsZWN0ZWRJc3N1ZVR5cGU6IElzc3VlVHlwZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWxlY3RlZElzc3VlU291cmNlOiBJc3N1ZVNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWxlY3RlZEV4dGVuc2lvbjogSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc291cmNlQnV0dG9uR3JvdXAhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzb3VyY2VFcnJvciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRhcmdldFN0YXR1cyE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGV4dGVuc2lvbkZpZWxkITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZXh0ZW5zaW9uU2VsZWN0ITogU2VsZWN0Qm94O1xuXHRwcml2YXRlIGV4dGVuc2lvbk9wdGlvbnM6IHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDsgaGlkZGVuPzogYm9vbGVhbiB9W10gPSBbXTtcblx0cHJpdmF0ZSBleHRlbnNpb25FcnJvciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGV4dGVuc2lvblN0YXR1cyE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRpZEF0dGVtcHREZXNjcmliZVN1Ym1pdCA9IGZhbHNlO1xuXHRwcml2YXRlIHNpbWlsYXJJc3N1ZXNDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzaW1pbGFySXNzdWVzUmVxdWVzdCA9IDA7XG5cdHByaXZhdGUgZXh0ZW5zaW9uRGF0YVJlcXVlc3QgPSAwO1xuXHRwcml2YXRlIHNpbWlsYXJJc3N1ZXNIYW5kbGU6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHR5cGVCdXR0b25Hcm91cCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHR5cGVFcnJvciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRlc2NyaXB0aW9uVGV4dGFyZWEhOiBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRwcml2YXRlIGRlc2NyaXB0aW9uR3VpZGFuY2UhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkZXNjcmlwdGlvbkVycm9yITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGl0bGVJbnB1dCE6IElucHV0Qm94O1xuXHRwcml2YXRlIHRpdGxlRXJyb3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBnZW5lcmF0ZVRpdGxlQnRuITogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RHZW5lcmF0ZVRpdGxlID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RHZW5lcmF0ZVRpdGxlOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRSZXF1ZXN0R2VuZXJhdGVUaXRsZS5ldmVudDtcblxuXHQvLyBTdGVwIDA6IFNjcmVlbnNob3RzICYgUmVjb3JkaW5nXG5cdHByaXZhdGUgc2NyZWVuc2hvdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNjcmVlbnNob3REZWxheSA9IDA7XG5cdHByaXZhdGUgcmVjb3JkaW5nRWxhcHNlZFRpbWVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVjb3JkaW5nU3RhcnRUaW1lID0gMDtcblx0cHJpdmF0ZSBjdXJyZW50UmVjb3JkaW5nU3RhdGUgPSBSZWNvcmRpbmdTdGF0ZS5JZGxlO1xuXHRwcml2YXRlIGRlbGF5ZWRTY3JlZW5zaG90UGVuZGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlY29yZGluZ3M6IHsgZmlsZVBhdGg6IHN0cmluZzsgZHVyYXRpb25NczogbnVtYmVyOyB0aHVtYm5haWxEYXRhVXJsPzogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdC8vIFN0ZXAgMjogUmV2aWV3XG5cdHByaXZhdGUgcmV2aWV3VGh1bWJDYXJkczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJldmlld1JlbmRlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNpbWlsYXJJc3N1ZXNEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZXNjcmlwdGlvbkd1aWRhbmNlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgdXBsb2FkaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgaW5jbHVkZVN5c3RlbUluZm8gPSB0cnVlO1xuXHRwcml2YXRlIGluY2x1ZGVQcm9jZXNzSW5mbyA9IHRydWU7XG5cdHByaXZhdGUgaW5jbHVkZVdvcmtzcGFjZUluZm8gPSB0cnVlO1xuXHRwcml2YXRlIGluY2x1ZGVFeHRlbnNpb25zID0gdHJ1ZTtcblx0cHJpdmF0ZSBpbmNsdWRlRXhwZXJpbWVudHMgPSB0cnVlO1xuXHRwcml2YXRlIGluY2x1ZGVFeHRlbnNpb25EYXRhID0gZmFsc2U7XG5cdHByaXZhdGUgZGlhZ25vc3RpY3NDb2xsYXBzZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBwZXJmb3JtYW5jZUluZm9Mb2FkZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBwZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nID0gZmFsc2U7XG5cblx0Ly8gTmF2aWdhdGlvblxuXHRwcml2YXRlIHN0ZXBJbmRpY2F0b3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdGVwTGFiZWwhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBiYWNrQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIG5leHRCdXR0b24hOiBCdXR0b247XG5cblx0Ly8gUHJvZ3Jlc3MgZG90c1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzRG90czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXG5cdHByaXZhdGUgY3VycmVudFN0ZXA6IFdpemFyZFN0ZXAgPSBXaXphcmRTdGVwLkF0dGFjaG1lbnRzO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNjcmVlbnNob3RzOiBJU2NyZWVuc2hvdFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElzc3VlUmVwb3J0ZXJNb2RlbDtcblx0cHJpdmF0ZSB2aXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgZmxvYXRpbmdCYXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByZXZpZXdPcGVuZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBwcmV2aWV3ZWREcmFmdEtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNsb3NlQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hpZGVUb29sYmFySW5TY3JlZW5zaG90cyA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBkYXRhOiBJc3N1ZVJlcG9ydGVyRGF0YSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlY29yZGluZ1N1cHBvcnRlZDogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51UHJvdmlkZXI/OiBJQ29udGV4dE1lbnVQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlPzogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdGluaXRpYWxIaWRlVG9vbGJhcjogYm9vbGVhbiA9IHRydWUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXNvbHZlRXh0ZW5zaW9uSXNzdWVEYXRhPzogKGV4dGVuc2lvbklkOiBzdHJpbmcpID0+IFByb21pc2U8SXNzdWVSZXBvcnRlckRhdGEgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3BlbkV4dGVybmFsTGluaz86ICh1cmw6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRwcml2YXRlIHNob3dVcGRhdGVCYW5uZXIgPSBmYWxzZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlZnJlc2hQZXJmb3JtYW5jZUluZm8/OiAoKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdC8qKiBSZXR1cm5zIHRoZSB1c2VyJ3MgY3VycmVudGx5LWJvdW5kIGtleWJpbmRpbmcgZm9yIHRoZSBnaXZlbiBjb21tYW5kIGlkLCBvciB1bmRlZmluZWQgd2hlbiB1bmJvdW5kLiAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVzb2x2ZUtleWJpbmRpbmc/OiAoY29tbWFuZElkOiBzdHJpbmcpID0+IFJlc29sdmVkS2V5YmluZGluZyB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0dGhpcy5faGlkZVRvb2xiYXJJblNjcmVlbnNob3RzID0gaW5pdGlhbEhpZGVUb29sYmFyO1xuXHRcdGNvbnN0IGhhc1N0YW5kYWxvbmVFeHRlbnNpb25EYXRhID0gISFkYXRhLmRhdGEgJiYgIWRhdGEuZXh0ZW5zaW9uSWQ7XG5cdFx0dGhpcy5pbmNsdWRlRXh0ZW5zaW9uRGF0YSA9IGhhc1N0YW5kYWxvbmVFeHRlbnNpb25EYXRhO1xuXHRcdHRoaXMubW9kZWwgPSBuZXcgSXNzdWVSZXBvcnRlck1vZGVsKHtcblx0XHRcdC4uLmRhdGEsXG5cdFx0XHRpc3N1ZVR5cGU6IGRhdGEuaXNzdWVUeXBlIHx8IElzc3VlVHlwZS5CdWcsXG5cdFx0XHRhbGxFeHRlbnNpb25zOiBkYXRhLmVuYWJsZWRFeHRlbnNpb25zLFxuXHRcdFx0ZXh0ZW5zaW9uRGF0YTogaGFzU3RhbmRhbG9uZUV4dGVuc2lvbkRhdGEgPyBkYXRhLmRhdGEgOiB1bmRlZmluZWQsXG5cdFx0XHRpbmNsdWRlU3lzdGVtSW5mbzogdHJ1ZSxcblx0XHRcdGluY2x1ZGVXb3Jrc3BhY2VJbmZvOiB0cnVlLFxuXHRcdFx0aW5jbHVkZVByb2Nlc3NJbmZvOiB0cnVlLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbnM6IHRydWUsXG5cdFx0XHRpbmNsdWRlRXhwZXJpbWVudHM6IHRydWUsXG5cdFx0XHRpbmNsdWRlRXh0ZW5zaW9uRGF0YTogaGFzU3RhbmRhbG9uZUV4dGVuc2lvbkRhdGEsXG5cdFx0fSk7XG5cdFx0dGhpcy5zZWxlY3RlZElzc3VlVHlwZSA9IGRhdGEuaXNzdWVUeXBlO1xuXHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9IGRhdGEuaXNzdWVTb3VyY2UgPz8gKGRhdGEuZXh0ZW5zaW9uSWQgPyBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gOiB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5jcmVhdGVXaXphcmQoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV2l6YXJkKCk6IHZvaWQge1xuXHRcdHRoaXMud2l6YXJkUGFuZWwgPSAkKCdkaXYuaXNzdWUtcmVwb3J0ZXItd2l6YXJkJyk7XG5cdFx0dGhpcy53aXphcmRQYW5lbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZGlhbG9nJyk7XG5cdFx0dGhpcy53aXphcmRQYW5lbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgncmVwb3J0SXNzdWUnLCBcIlJlcG9ydCBJc3N1ZVwiKSk7XG5cdFx0dGhpcy53aXphcmRQYW5lbC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7XG5cblx0XHQvLyBUb29sYmFyIHdpdGggcHJvZ3Jlc3MgaW5kaWNhdG9yIGFuZCBuYXZpZ2F0aW9uIGJ1dHRvbnMuIFRoZSBuYXYgYnV0dG9uc1xuXHRcdC8vIHNpdCBpbiB0aGVpciBvd24gcm93IGRpcmVjdGx5IGJlbmVhdGggdGhlIHN0ZXAgaW5kaWNhdG9yLCBhbGlnbmVkIHRvIHRoZVxuXHRcdC8vIHN0YXJ0LCBzbyB0aGV5IHJlYWQgYXMgcGFydCBvZiB0aGUgc3RlcCBVSS5cblx0XHRjb25zdCB0b29sYmFyID0gYXBwZW5kKHRoaXMud2l6YXJkUGFuZWwsICQoJ2Rpdi53aXphcmQtdG9vbGJhcicpKTtcblxuXHRcdC8vIFByb2dyZXNzIGluZGljYXRvciBhcmVhXG5cdFx0Y29uc3QgcHJvZ3Jlc3NBcmVhID0gYXBwZW5kKHRvb2xiYXIsICQoJ2Rpdi53aXphcmQtcHJvZ3Jlc3MtYXJlYScpKTtcblx0XHRjb25zdCBwcm9ncmVzc0RvdHNDb250YWluZXIgPSBhcHBlbmQocHJvZ3Jlc3NBcmVhLCAkKCdkaXYud2l6YXJkLXByb2dyZXNzLWRvdHMnKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBTVEVQX0NPVU5UOyBpKyspIHtcblx0XHRcdGNvbnN0IGRvdCA9IGFwcGVuZChwcm9ncmVzc0RvdHNDb250YWluZXIsICQoJ2Rpdi53aXphcmQtcHJvZ3Jlc3MtZG90JykpO1xuXHRcdFx0dGhpcy5wcm9ncmVzc0RvdHMucHVzaChkb3QpO1xuXHRcdH1cblx0XHR0aGlzLnN0ZXBJbmRpY2F0b3IgPSBhcHBlbmQocHJvZ3Jlc3NBcmVhLCAkKCdzcGFuLndpemFyZC1zdGVwLWluZGljYXRvcicpKTtcblx0XHRhcHBlbmQocHJvZ3Jlc3NBcmVhLCAkKCdzcGFuLndpemFyZC1zdGVwLXNlcGFyYXRvcicpKTtcblx0XHR0aGlzLnN0ZXBMYWJlbCA9IGFwcGVuZChwcm9ncmVzc0FyZWEsICQoJ3NwYW4ud2l6YXJkLXN0ZXAtbGFiZWwnKSk7XG5cblx0XHQvLyBOYXZpZ2F0aW9uIGJ1dHRvbnMgcGxhY2VkIGluIHRoZWlyIG93biByb3cgZGlyZWN0bHkgdW5kZXIgdGhlIHN0ZXBcblx0XHQvLyBpbmRpY2F0b3IsIGFsaWduZWQgdG8gdGhlIHN0YXJ0LlxuXHRcdGNvbnN0IG5hdiA9IGFwcGVuZCh0b29sYmFyLCAkKCdkaXYud2l6YXJkLW5hdicpKTtcblxuXHRcdHRoaXMuYmFja0J1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24obmF2LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2JhY2snLCBcIkJhY2tcIik7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLWJhY2snKTtcblx0XHR0aGlzLmJhY2tCdXR0b24uZWxlbWVudC50aXRsZSA9IGxvY2FsaXplKCdiYWNrJywgXCJCYWNrXCIpO1xuXG5cdFx0dGhpcy5uZXh0QnV0dG9uID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihuYXYsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHR0aGlzLm5leHRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV4dCcsIFwiTmV4dFwiKTtcblx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtbmV4dCcpO1xuXHRcdHRoaXMubmV4dEJ1dHRvbi5lbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ25leHQnLCBcIk5leHRcIik7XG5cblx0XHR0aGlzLnVwZGF0ZUJhbm5lciA9IGFwcGVuZCh0aGlzLndpemFyZFBhbmVsLCAkKCdkaXYud2l6YXJkLXVwZGF0ZS1iYW5uZXInKSk7XG5cdFx0dGhpcy51cGRhdGVCYW5uZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N0YXR1cycpO1xuXHRcdHRoaXMudXBkYXRlQmFubmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuXHRcdHRoaXMudXBkYXRlQmFubmVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VwZGF0ZUF2YWlsYWJsZScsIFwiQSBuZXcgdmVyc2lvbiBvZiB7MH0gaXMgYXZhaWxhYmxlLlwiLCBwcm9kdWN0Lm5hbWVMb25nKTtcblx0XHR0aGlzLnNldFVwZGF0ZUF2YWlsYWJsZSh0aGlzLnNob3dVcGRhdGVCYW5uZXIpO1xuXG5cdFx0Ly8gU3RlcCBjb250ZW50IGFyZWFcblx0XHR0aGlzLnN0ZXBDb250YWluZXIgPSBhcHBlbmQodGhpcy53aXphcmRQYW5lbCwgJCgnZGl2LndpemFyZC1zdGVwLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmNyZWF0ZVN0ZXAwQXR0YWNobWVudHMoKTtcblx0XHR0aGlzLmNyZWF0ZVN0ZXAxRGVzY3JpYmUoKTtcblx0XHR0aGlzLmNyZWF0ZVN0ZXAyUmV2aWV3KCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnRIYW5kbGVycygpO1xuXHRcdGlmICh0aGlzLmRhdGEuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdHZvaWQgdGhpcy51cGRhdGVTZWxlY3RlZEV4dGVuc2lvbih0aGlzLmRhdGEuZXh0ZW5zaW9uSWQsIGZhbHNlKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0fVxuXG5cdC8vIFN0ZXAgMDogQXR0YWNobWVudHNcblx0cHJpdmF0ZSBjcmVhdGVTdGVwMEF0dGFjaG1lbnRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhZ2UgPSBhcHBlbmQodGhpcy5zdGVwQ29udGFpbmVyLCAkKCdkaXYud2l6YXJkLXN0ZXAnKSk7XG5cdFx0dGhpcy5zdGVwUGFnZXMucHVzaChwYWdlKTtcblxuXHRcdGNvbnN0IGhlYWRpbmcgPSBhcHBlbmQocGFnZSwgJCgnaDIud2l6YXJkLWhlYWRpbmcnKSk7XG5cdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzY3JlZW5zaG90c0hlYWRpbmcnLCBcIkFkZCBhdHRhY2htZW50cyBmb3IgYmV0dGVyIGNvbnRleHRcIik7XG5cblx0XHRjb25zdCBzdWJ0aXRsZSA9IGFwcGVuZChwYWdlLCAkKCdwLndpemFyZC1zdWJ0aXRsZScpKTtcblx0XHRzdWJ0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzY3JlZW5zaG90c1N1YnRpdGxlJywgXCJZb3UgY2FuIGFkZCB1cCB0byB7MH0gc2NyZWVuc2hvdHMgb3IgdmlkZW9zLiBOYXZpZ2F0ZSBWUyBDb2RlIGFuZCBjaG9vc2Ugd2hlbiB0byBjYXB0dXJlLlwiLCBNQVhfQVRUQUNITUVOVFMpO1xuXG5cdFx0Y29uc3QgY2FwdHVyZVNob3J0Y3V0ID0gdGhpcy5yZXNvbHZlS2V5YmluZGluZz8uKCd3b3JrYmVuY2guYWN0aW9uLmlzc3VlUmVwb3J0ZXIuY2FwdHVyZVNjcmVlbnNob3QnKTtcblx0XHRjb25zdCByZWNvcmRTaG9ydGN1dCA9IHRoaXMucmVjb3JkaW5nU3VwcG9ydGVkID8gdGhpcy5yZXNvbHZlS2V5YmluZGluZz8uKCd3b3JrYmVuY2guYWN0aW9uLmlzc3VlUmVwb3J0ZXIudG9nZ2xlUmVjb3JkaW5nJykgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNhcHR1cmVTaG9ydGN1dCB8fCByZWNvcmRTaG9ydGN1dCkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0RG9jdW1lbnQgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpLmRvY3VtZW50O1xuXHRcdFx0Y29uc3QgaGludCA9IGFwcGVuZChwYWdlLCAkKCdwLndpemFyZC1zdWJ0aXRsZS53aXphcmQtc2hvcnRjdXQtaGludCcpKTtcblx0XHRcdGNvbnN0IGludHJvID0gbG9jYWxpemUoJ3Nob3J0Y3V0SGludEludHJvJywgXCJVc2UgdGhlIGZsb2F0aW5nIGNhcHR1cmUgYmFyLCBvciBwcmVzc1wiKTtcblx0XHRcdGhpbnQuYXBwZW5kQ2hpbGQodGFyZ2V0RG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoYCR7aW50cm99IGApKTtcblx0XHRcdGlmIChjYXB0dXJlU2hvcnRjdXQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJTaG9ydGN1dEtleWNhcChoaW50LCBjYXB0dXJlU2hvcnRjdXQpO1xuXHRcdFx0XHRoaW50LmFwcGVuZENoaWxkKHRhcmdldERvY3VtZW50LmNyZWF0ZVRleHROb2RlKGAgJHtsb2NhbGl6ZSgndG9DYXB0dXJlJywgXCJ0byBjYXB0dXJlIGEgc2NyZWVuc2hvdFwiKX1gKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FwdHVyZVNob3J0Y3V0ICYmIHJlY29yZFNob3J0Y3V0KSB7XG5cdFx0XHRcdGhpbnQuYXBwZW5kQ2hpbGQodGFyZ2V0RG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoYCAke2xvY2FsaXplKCdvcicsIFwib3JcIil9IGApKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvcmRTaG9ydGN1dCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlclNob3J0Y3V0S2V5Y2FwKGhpbnQsIHJlY29yZFNob3J0Y3V0KTtcblx0XHRcdFx0aGludC5hcHBlbmRDaGlsZCh0YXJnZXREb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShgICR7bG9jYWxpemUoJ3RvUmVjb3JkJywgXCJ0byBzdGFydCBvciBzdG9wIHJlY29yZGluZ1wiKX1gKSk7XG5cdFx0XHR9XG5cdFx0XHRoaW50LmFwcGVuZENoaWxkKHRhcmdldERvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcuJykpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2NyZWVuc2hvdENvbnRhaW5lciA9IGFwcGVuZChwYWdlLCAkKCdkaXYud2l6YXJkLXNjcmVlbnNob3RzJykpO1xuXHRcdHRoaXMudXBkYXRlU2NyZWVuc2hvdFRodW1ibmFpbHMoKTtcblxuXHRcdHRoaXMuY3JlYXRlRmxvYXRpbmdDYXB0dXJlQmFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGNhcHR1cmVTdHJpcENhcHR1cmVCdG46IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYXB0dXJlU3RyaXBEZWxheUJ0bjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhcHR1cmVTdHJpcFJlY29yZEJ0bjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY3JlYXRlRmxvYXRpbmdDYXB0dXJlQmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Ly8gTW91bnQgaW5zaWRlIC5tb25hY28td29ya2JlbmNoIHNvIFZTIENvZGUncyBjb2xvciB0aGVtZSBDU1MgdmFyc1xuXHRcdC8vICgtLXZzY29kZS1kZWJ1Z1Rvb2xCYXItYmFja2dyb3VuZCwgZXRjLikgY2FzY2FkZSBhbmQgdGhlIGJhciBtYXRjaGVzIHRoZVxuXHRcdC8vIGFjdGl2ZSB0aGVtZS4gYm9keSBpcyBvdXRzaWRlIHRoYXQgc2NvcGUgYW5kIHRoZSB2YXJzIHdvdWxkbid0IHJlc29sdmUuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgd29ya2JlbmNoID0gdGFyZ2V0V2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28td29ya2JlbmNoJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGNvbnN0IG1vdW50VGFyZ2V0ID0gd29ya2JlbmNoID8/IHRhcmdldFdpbmRvdy5kb2N1bWVudC5ib2R5O1xuXG5cdFx0dGhpcy5mbG9hdGluZ0JhciA9ICQoJ2Rpdi5pc3N1ZS1yZXBvcnRlci1mbG9hdGluZy1iYXInKTtcblxuXHRcdC8vIERyYWcgaGFuZGxlXG5cdFx0Y29uc3QgZHJhZ0FyZWEgPSBhcHBlbmQodGhpcy5mbG9hdGluZ0JhciwgJCgnZGl2LndpemFyZC1mbG9hdGluZy1kcmFnJykpO1xuXHRcdGRyYWdBcmVhLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5ncmlwcGVyKSk7XG5cblx0XHQvLyBTZWdtZW50ZWQgc2NyZWVuc2hvdCBidXR0b246IFtTY3JlZW5zaG90IHwgb3B0aW9uc11cblx0XHRjb25zdCBzZWdtZW50ZWQgPSBhcHBlbmQodGhpcy5mbG9hdGluZ0JhciwgJCgnZGl2LndpemFyZC1zZWdtZW50ZWQtYnRuJykpO1xuXHRcdGNvbnN0IGZsb2F0aW5nQnV0dG9uU3R5bGVzID0gdGhpcy5nZXRGbG9hdGluZ0JhckJ1dHRvblN0eWxlcyh0YXJnZXRXaW5kb3cpO1xuXG5cdFx0Y29uc3QgY2FwdHVyZUJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oc2VnbWVudGVkLCB7IC4uLmZsb2F0aW5nQnV0dG9uU3R5bGVzLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdGNhcHR1cmVCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtc2VnbWVudGVkLW1haW4nKTtcblx0XHRjYXB0dXJlQnRuLmxhYmVsID0gYCQoZGV2aWNlLWNhbWVyYSkgJHtsb2NhbGl6ZSgnc2NyZWVuc2hvdCcsIFwiU2NyZWVuc2hvdFwiKX1gO1xuXHRcdHRoaXMuY2FwdHVyZVN0cmlwQ2FwdHVyZUJ0biA9IGNhcHR1cmVCdG47XG5cblx0XHQvLyBEZWxheS9vcHRpb25zIGRyb3Bkb3duIHVzaW5nIFZTIENvZGUncyBjb250ZXh0IG1lbnVcblx0XHRjb25zdCBkZWxheU9wdGlvbnMgPSB0aGlzLmdldFNjcmVlbnNob3REZWxheU9wdGlvbnMoKTtcblx0XHRjb25zdCBkZWxheURyb3Bkb3duQnV0dG9uID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihzZWdtZW50ZWQsIHsgLi4uZmxvYXRpbmdCdXR0b25TdHlsZXMsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0ZGVsYXlEcm9wZG93bkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dpemFyZC1zZWdtZW50ZWQtZHJvcGRvd24nKTtcblx0XHRkZWxheURyb3Bkb3duQnV0dG9uLmVsZW1lbnQudGl0bGUgPSBsb2NhbGl6ZSgnY2FwdHVyZU9wdGlvbnMnLCBcIkNhcHR1cmUgb3B0aW9uc1wiKTtcblx0XHRkZWxheURyb3Bkb3duQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NhcHR1cmVPcHRpb25zJywgXCJDYXB0dXJlIG9wdGlvbnNcIikpO1xuXHRcdGRlbGF5RHJvcGRvd25CdXR0b24ubGFiZWwgPSAnJChjaGV2cm9uLWRvd24pJztcblx0XHR0aGlzLmNhcHR1cmVTdHJpcERlbGF5QnRuID0gZGVsYXlEcm9wZG93bkJ1dHRvbjtcblxuXHRcdGlmICh0aGlzLmNvbnRleHRNZW51UHJvdmlkZXIpIHtcblx0XHRcdGxldCBtZW51T3BlbiA9IGZhbHNlO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZGVsYXlEcm9wZG93bkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0aWYgKCFkZWxheURyb3Bkb3duQnV0dG9uLmVuYWJsZWQgfHwgbWVudU9wZW4pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSGlkZS10b29sYmFyLWluLXNjcmVlbnNob3RzIHRvZ2dsZSAoZmlyc3QpXG5cdFx0XHRcdGNvbnN0IGhpZGVBY3Rpb24gPSBuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCdoaWRlLXRvb2xiYXInLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdoaWRlVG9vbGJhckluU2NyZWVuc2hvdHMnLCBcIkhpZGUgVG9vbGJhciBpbiBTY3JlZW5zaG90c1wiKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9oaWRlVG9vbGJhckluU2NyZWVuc2hvdHMgPSAhdGhpcy5faGlkZVRvb2xiYXJJblNjcmVlbnNob3RzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdFx0aGlkZUFjdGlvbi5jaGVja2VkID0gdGhpcy5faGlkZVRvb2xiYXJJblNjcmVlbnNob3RzO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBkZWxheU9wdGlvbnMubWFwKG9wdCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdGBkZWxheS0ke29wdC52YWx1ZX1gLFxuXHRcdFx0XHRcdFx0b3B0LmxhYmVsLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdGFzeW5jICgpID0+IHsgdGhpcy5zY3JlZW5zaG90RGVsYXkgPSBvcHQudmFsdWU7IH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGFjdGlvbi5jaGVja2VkID0gb3B0LnZhbHVlID09PSB0aGlzLnNjcmVlbnNob3REZWxheTtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBhbGxBY3Rpb25zID0gW2hpZGVBY3Rpb24sIG5ldyBTZXBhcmF0b3IoKSwgLi4uYWN0aW9uc107XG5cdFx0XHRcdG1lbnVPcGVuID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVByb3ZpZGVyIS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gdGhpcy5mbG9hdGluZ0JhciEsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWxsQWN0aW9ucyxcblx0XHRcdFx0XHRza2lwVGVsZW1ldHJ5OiB0cnVlLFxuXHRcdFx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0bWVudU9wZW4gPSBmYWxzZTtcblx0XHRcdFx0XHRcdGhpZGVBY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhIG9mIGFjdGlvbnMpIHsgYS5kaXNwb3NlKCk7IH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gQ2xvc2UgdGhlIGRlbGF5IG1lbnUgd2hlbiBkcmFnIHN0YXJ0cy5cblx0XHRcdC8vIFRoZSBkcmFnIGhhbmRsZXIgY2FsbHMgZS5wcmV2ZW50RGVmYXVsdCgpIG9uIHBvaW50ZXJkb3duIHdoaWNoXG5cdFx0XHQvLyBzdXBwcmVzc2VzIHRoZSBtb3VzZWRvd24gZXZlbnQgdGhhdCB0aGUgY29udGV4dCBtZW51IHVzZXMgZm9yXG5cdFx0XHQvLyBvdXRzaWRlLWNsaWNrIGRldGVjdGlvbiwgc28gd2UgZGlzcGF0Y2ggYSBzeW50aGV0aWMgb25lLlxuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRyYWdBcmVhLCBFdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoKSA9PiB7XG5cdFx0XHRcdGRyYWdBcmVhLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY2FwdHVyZUJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmdldFRvdGFsQXR0YWNobWVudHMoKSA+PSBNQVhfQVRUQUNITUVOVFMgfHwgIWNhcHR1cmVCdG4uZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5zY3JlZW5zaG90RGVsYXkgPiAwKSB7XG5cdFx0XHRcdC8vIExvY2sgd2lkdGggc28gYnV0dG9uIGRvZXNuJ3Qgc2hyaW5rIGR1cmluZyBjb3VudGRvd25cblx0XHRcdFx0Y2FwdHVyZUJ0bi5lbGVtZW50LnN0eWxlLm1pbldpZHRoID0gYCR7Y2FwdHVyZUJ0bi5lbGVtZW50Lm9mZnNldFdpZHRofXB4YDtcblx0XHRcdFx0Y2FwdHVyZUJ0bi5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuZGVsYXllZFNjcmVlbnNob3RQZW5kaW5nID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy51cGRhdGVTY3JlZW5zaG90VGh1bWJuYWlscygpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUF0dGFjaG1lbnRCdXR0b25zKCk7XG5cdFx0XHRcdGxldCByZW1haW5pbmcgPSB0aGlzLnNjcmVlbnNob3REZWxheTtcblx0XHRcdFx0Y2FwdHVyZUJ0bi5sYWJlbCA9IGAke3JlbWFpbmluZ30uLi5gO1xuXHRcdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdFx0XHRjb25zdCBpbnRlcnZhbERpc3Bvc2FibGUgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwodGFyZ2V0V2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdFx0cmVtYWluaW5nLS07XG5cdFx0XHRcdFx0aWYgKHJlbWFpbmluZyA+IDApIHtcblx0XHRcdFx0XHRcdGNhcHR1cmVCdG4ubGFiZWwgPSBgJHtyZW1haW5pbmd9Li4uYDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5kZWxldGUoaW50ZXJ2YWxEaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdGNhcHR1cmVCdG4ubGFiZWwgPSBgJChkZXZpY2UtY2FtZXJhKSAke2xvY2FsaXplKCdzY3JlZW5zaG90JywgXCJTY3JlZW5zaG90XCIpfWA7XG5cdFx0XHRcdFx0XHRjYXB0dXJlQnRuLmVsZW1lbnQuc3R5bGUubWluV2lkdGggPSAnJztcblx0XHRcdFx0XHRcdGNhcHR1cmVCdG4uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR0aGlzLmRlbGF5ZWRTY3JlZW5zaG90UGVuZGluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTY3JlZW5zaG90VGh1bWJuYWlscygpO1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U2NyZWVuc2hvdC5maXJlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxMDAwKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RTY3JlZW5zaG90LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZWNvcmQgYnV0dG9uXG5cdFx0aWYgKHRoaXMucmVjb3JkaW5nU3VwcG9ydGVkKSB7XG5cdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGhpcy5mbG9hdGluZ0JhciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5sYWJlbCA9IGAkKHJlY29yZCkgJHtsb2NhbGl6ZSgncmVjb3JkVmlkZW8nLCBcIlJlY29yZCB2aWRlb1wiKX1gO1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtcmVjb3JkLWJ0bicpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRSZWNvcmRpbmdTdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U3RvcFJlY29yZGluZy5maXJlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLklkbGUgJiYgdGhpcy5nZXRUb3RhbEF0dGFjaG1lbnRzKCkgPCBNQVhfQVRUQUNITUVOVFMpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RTdGFydFJlY29yZGluZy5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRtb3VudFRhcmdldC5hcHBlbmRDaGlsZCh0aGlzLmZsb2F0aW5nQmFyKTtcblxuXHRcdC8vIERyYWdnaW5nIChjbGFtcGVkIHRvIHdpbmRvdyBib3VuZHMpXG5cdFx0bGV0IGRyYWdTdGFydFggPSAwO1xuXHRcdGxldCBkcmFnU3RhcnRZID0gMDtcblx0XHRsZXQgYmFyU3RhcnRYID0gMDtcblx0XHRsZXQgYmFyU3RhcnRZID0gMDtcblxuXHRcdGNvbnN0IG9uUG9pbnRlck1vdmUgPSAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBkeCA9IGUuY2xpZW50WCAtIGRyYWdTdGFydFg7XG5cdFx0XHRjb25zdCBkeSA9IGUuY2xpZW50WSAtIGRyYWdTdGFydFk7XG5cdFx0XHRjb25zdCBiYXJXID0gdGhpcy5mbG9hdGluZ0JhciEub2Zmc2V0V2lkdGg7XG5cdFx0XHRjb25zdCBiYXJIID0gdGhpcy5mbG9hdGluZ0JhciEub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWF4WCA9IHRhcmdldFdpbmRvdy5pbm5lcldpZHRoIC0gYmFyVztcblx0XHRcdGNvbnN0IG1heFkgPSB0YXJnZXRXaW5kb3cuaW5uZXJIZWlnaHQgLSBiYXJIO1xuXHRcdFx0Y29uc3QgbmV3WCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGJhclN0YXJ0WCArIGR4LCBtYXhYKSk7XG5cdFx0XHRjb25zdCBuZXdZID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oYmFyU3RhcnRZICsgZHksIG1heFkpKTtcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIhLnN0eWxlLmxlZnQgPSBgJHtuZXdYfXB4YDtcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIhLnN0eWxlLnRvcCA9IGAke25ld1l9cHhgO1xuXHRcdFx0dGhpcy5mbG9hdGluZ0JhciEuc3R5bGUucmlnaHQgPSAnYXV0byc7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9uUG9pbnRlclVwID0gKCkgPT4ge1xuXHRcdFx0ZHJhZ0FyZWEuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dlZCcpO1xuXHRcdFx0dGFyZ2V0V2luZG93LmRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJtb3ZlJywgb25Qb2ludGVyTW92ZSk7XG5cdFx0XHR0YXJnZXRXaW5kb3cuZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgb25Qb2ludGVyVXApO1xuXHRcdH07XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZHJhZ0FyZWEsIEV2ZW50VHlwZS5QT0lOVEVSX0RPV04sIChlOiBQb2ludGVyRXZlbnQpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGRyYWdBcmVhLmNsYXNzTGlzdC5hZGQoJ2RyYWdnZWQnKTtcblx0XHRcdGRyYWdTdGFydFggPSBlLmNsaWVudFg7XG5cdFx0XHRkcmFnU3RhcnRZID0gZS5jbGllbnRZO1xuXHRcdFx0Y29uc3QgcmVjdCA9IHRoaXMuZmxvYXRpbmdCYXIhLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0YmFyU3RhcnRYID0gcmVjdC5sZWZ0O1xuXHRcdFx0YmFyU3RhcnRZID0gcmVjdC50b3A7XG5cdFx0XHR0YXJnZXRXaW5kb3cuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCBvblBvaW50ZXJNb3ZlKTtcblx0XHRcdHRhcmdldFdpbmRvdy5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVydXAnLCBvblBvaW50ZXJVcCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgYmFyIGZ1bGx5IHdpdGhpbiB0aGUgdmlzaWJsZSB2aWV3cG9ydCB3aGVuIHRoZSB3aW5kb3cgaXNcblx0XHQvLyByZXNpemVkLiBXaXRob3V0IHRoaXMsIG5hcnJvd2luZyB0aGUgd2luZG93IGNhbiBjbGlwIHRoZSBiYXIgb2ZmIHRoZVxuXHRcdC8vIHJpZ2h0IGVkZ2UgXHUyMDE0IHNlZSBzY3JlZW5zaG90IGluIGlzc3VlLiBUaGUgYmFyIHN0YXlzIGluIGl0cyBjdXJyZW50XG5cdFx0Ly8gcmVsYXRpdmUgcG9zaXRpb247IHdlIG9ubHkgbnVkZ2UgaXQgaW53YXJkIHdoZW4gaXQgd291bGQgb3RoZXJ3aXNlXG5cdFx0Ly8gZmFsbCBvZmYtc2NyZWVuLlxuXHRcdGNvbnN0IGNsYW1wSW50b1ZpZXcgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZmxvYXRpbmdCYXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVjdCA9IHRoaXMuZmxvYXRpbmdCYXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCB3aW5XID0gdGFyZ2V0V2luZG93LmlubmVyV2lkdGg7XG5cdFx0XHRjb25zdCB3aW5IID0gdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWFyZ2luID0gODtcblx0XHRcdGxldCBuZWVkc0NsYW1wID0gZmFsc2U7XG5cdFx0XHRsZXQgbmV4dExlZnQgPSByZWN0LmxlZnQ7XG5cdFx0XHRsZXQgbmV4dFRvcCA9IHJlY3QudG9wO1xuXHRcdFx0aWYgKHJlY3QucmlnaHQgPiB3aW5XIC0gbWFyZ2luKSB7XG5cdFx0XHRcdG5leHRMZWZ0ID0gTWF0aC5tYXgobWFyZ2luLCB3aW5XIC0gbWFyZ2luIC0gcmVjdC53aWR0aCk7XG5cdFx0XHRcdG5lZWRzQ2xhbXAgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY3QubGVmdCA8IG1hcmdpbikge1xuXHRcdFx0XHRuZXh0TGVmdCA9IG1hcmdpbjtcblx0XHRcdFx0bmVlZHNDbGFtcCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVjdC5ib3R0b20gPiB3aW5IIC0gbWFyZ2luKSB7XG5cdFx0XHRcdG5leHRUb3AgPSBNYXRoLm1heChtYXJnaW4sIHdpbkggLSBtYXJnaW4gLSByZWN0LmhlaWdodCk7XG5cdFx0XHRcdG5lZWRzQ2xhbXAgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY3QudG9wIDwgbWFyZ2luKSB7XG5cdFx0XHRcdG5leHRUb3AgPSBtYXJnaW47XG5cdFx0XHRcdG5lZWRzQ2xhbXAgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5lZWRzQ2xhbXApIHtcblx0XHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS5sZWZ0ID0gYCR7bmV4dExlZnR9cHhgO1xuXHRcdFx0XHR0aGlzLmZsb2F0aW5nQmFyLnN0eWxlLnRvcCA9IGAke25leHRUb3B9cHhgO1xuXHRcdFx0XHR0aGlzLmZsb2F0aW5nQmFyLnN0eWxlLnJpZ2h0ID0gJ2F1dG8nO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgJ3Jlc2l6ZScsIGNsYW1wSW50b1ZpZXcpKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmZsb2F0aW5nQmFyPy5yZW1vdmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNhcHR1cmVTdHJpcFZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmZsb2F0aW5nQmFyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFNob3cgb24gYWxsIHN0ZXBzIHNvIHRoZSB1c2VyIGNhbiBjYXB0dXJlIHNjcmVlbnNob3RzIG9mIHRoZSB3aXphcmQgaXRzZWxmXG5cdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdH1cblxuXHQvLyBTdGVwIDE6IERlc2NyaWJlIChjYXRlZ29yeSArIGRlc2NyaXB0aW9uICsgdGl0bGUpXG5cdHByaXZhdGUgY3JlYXRlU3RlcDFEZXNjcmliZSgpOiB2b2lkIHtcblx0XHRjb25zdCBwYWdlID0gYXBwZW5kKHRoaXMuc3RlcENvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zdGVwJykpO1xuXHRcdHRoaXMuc3RlcFBhZ2VzLnB1c2gocGFnZSk7XG5cblx0XHRjb25zdCBoZWFkaW5nID0gYXBwZW5kKHBhZ2UsICQoJ2gyLndpemFyZC1oZWFkaW5nJykpO1xuXHRcdGhlYWRpbmcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZGVzY3JpYmVIZWFkaW5nJywgXCJEZXNjcmliZSB5b3VyIGZlZWRiYWNrXCIpO1xuXG5cdFx0Ly8gSXNzdWUgZ3VpZGFuY2UgbGluayBcdTIwMTQga2VlcCB0aGUgc2FtZSB3b3JkaW5nIGFzIHRoZSBjbGFzc2ljIHJlcG9ydGVyLlxuXHRcdGlmICh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCBndWlkYW5jZUNvbnRhaW5lciA9IGFwcGVuZChwYWdlLCAkKCdkaXYud2l6YXJkLWlzc3VlLWd1aWRhbmNlJykpO1xuXHRcdFx0Y29uc3QgZ3VpZGFuY2VNZCA9IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtleTogJ3Jldmlld0d1aWRhbmNlTGFiZWxXaXphcmQnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFsne0xvY2tlZD1cImh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3dpa2kvU3VibWl0dGluZy1CdWdzLWFuZC1TdWdnZXN0aW9uc1wifSddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdCZWZvcmUgeW91IHJlcG9ydCBhbiBpc3N1ZSBoZXJlIHBsZWFzZSBbcmV2aWV3IHRoZSBndWlkYW5jZSB3ZSBwcm92aWRlXShodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS93aWtpL1N1Ym1pdHRpbmctQnVncy1hbmQtU3VnZ2VzdGlvbnMpLiBQbGVhc2UgY29tcGxldGUgdGhlIGZvcm0gaW4gRW5nbGlzaC4nXG5cdFx0XHQpLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZ3VpZGFuY2VNZCwge1xuXHRcdFx0XHRhY3Rpb25IYW5kbGVyOiBhc3luYyAobGluazogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuRXh0ZXJuYWxMaW5rPy4obGluayk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGd1aWRhbmNlQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQocmVuZGVyZWQpO1xuXHRcdH1cblxuXHRcdC8vIElzc3VlIHNvdXJjZSBzZWxlY3Rpb24gKyBleHRlbnNpb24gZHJvcGRvd24gc2hhcmUgYSByb3cgd2hlbiBib3RoIGFyZSB2aXNpYmxlXG5cdFx0Y29uc3QgdGFyZ2V0Um93ID0gYXBwZW5kKHBhZ2UsICQoJ2Rpdi53aXphcmQtdGFyZ2V0LXJvdycpKTtcblx0XHRjb25zdCBzb3VyY2VGaWVsZCA9IGFwcGVuZCh0YXJnZXRSb3csICQoJ2Rpdi53aXphcmQtZmllbGQud2l6YXJkLXNvdXJjZS1maWVsZCcpKTtcblx0XHRjb25zdCBzb3VyY2VMYWJlbCA9IGFwcGVuZChzb3VyY2VGaWVsZCwgJCgnbGFiZWwud2l6YXJkLWZpZWxkLWxhYmVsJykpO1xuXHRcdHNvdXJjZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RhcmdldCcsIFwiVGFyZ2V0XCIpO1xuXHRcdHRoaXMuYXBwZW5kUmVxdWlyZWRNYXJrZXIoc291cmNlTGFiZWwpO1xuXHRcdHRoaXMuc291cmNlQnV0dG9uR3JvdXAgPSBhcHBlbmQoc291cmNlRmllbGQsICQoJ2Rpdi53aXphcmQtdHlwZS1idXR0b25zLndpemFyZC1zb3VyY2UtYnV0dG9ucycpKTtcblx0XHQvLyBDcmVhdGUgYSBidXR0b24gZm9yIGV2ZXJ5IHNvdXJjZSB1cCBmcm9udCBzbyBhc3luYy1sb2FkZWQgZXh0ZW5zaW9ucyBjYW5cblx0XHQvLyByZXZlYWwgdGhlIEV4dGVuc2lvbiB0YXJnZXQgbGF0ZXI7IHVwZGF0ZUlzc3VlU291cmNlQnV0dG9ucygpIGNvbnRyb2xzXG5cdFx0Ly8gd2hpY2ggYnV0dG9ucyBhcmUgdmlzaWJsZS5cblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiB0aGlzLmdldEFsbFNvdXJjZU9wdGlvbnMoKSkge1xuXHRcdFx0Y29uc3QgYnRuID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aGlzLnNvdXJjZUJ1dHRvbkdyb3VwLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0XHRidG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtdHlwZS1idG4nLCAnd2l6YXJkLXNvdXJjZS1idG4nKTtcblx0XHRcdGJ0bi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1zb3VyY2UnLCBvcHRpb24udmFsdWUpO1xuXHRcdFx0YnRuLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCAnZmFsc2UnKTtcblx0XHRcdGJ0bi5sYWJlbCA9IG9wdGlvbi5sYWJlbDtcblx0XHRcdHRoaXMuaXNzdWVTb3VyY2VCdXR0b25zLnB1c2goYnRuKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXRJc3N1ZVNvdXJjZShvcHRpb24udmFsdWUpO1xuXHRcdFx0XHRpZiAob3B0aW9uLnZhbHVlID09PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gJiYgdGhpcy5zZWxlY3RlZEV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy51cGRhdGVTZWxlY3RlZEV4dGVuc2lvbih0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLnNvdXJjZUVycm9yID0gdGhpcy5jcmVhdGVGaWVsZEVycm9yKHNvdXJjZUZpZWxkLCBsb2NhbGl6ZSgndGFyZ2V0UmVxdWlyZWQnLCBcIlNlbGVjdCBhIHRhcmdldCB0byBjb250aW51ZS5cIikpO1xuXHRcdHRoaXMudGFyZ2V0U3RhdHVzID0gYXBwZW5kKHNvdXJjZUZpZWxkLCAkKCdkaXYud2l6YXJkLXRhcmdldC1zdGF0dXMnKSk7XG5cblx0XHR0aGlzLmV4dGVuc2lvbkZpZWxkID0gYXBwZW5kKHRhcmdldFJvdywgJCgnZGl2LndpemFyZC1maWVsZC53aXphcmQtZXh0ZW5zaW9uLWZpZWxkJykpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkxhYmVsID0gYXBwZW5kKHRoaXMuZXh0ZW5zaW9uRmllbGQsICQoJ2xhYmVsLndpemFyZC1maWVsZC1sYWJlbCcpKTtcblx0XHRleHRlbnNpb25MYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdleHRlbnNpb24nLCBcIkV4dGVuc2lvblwiKTtcblx0XHR0aGlzLmFwcGVuZFJlcXVpcmVkTWFya2VyKGV4dGVuc2lvbkxhYmVsKTtcblx0XHRjb25zdCBleHRlbnNpb25TZWxlY3RDb250YWluZXIgPSBhcHBlbmQodGhpcy5leHRlbnNpb25GaWVsZCwgJCgnZGl2LndpemFyZC1leHRlbnNpb24tc2VsZWN0JykpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uT3B0aW9ucyA9IHRoaXMuZ2V0RXh0ZW5zaW9uT3B0aW9ucygpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uU2VsZWN0ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFNlbGVjdEJveChcblx0XHRcdHRoaXMuZ2V0RXh0ZW5zaW9uU2VsZWN0SXRlbXMoKSxcblx0XHRcdHRoaXMuZ2V0U2VsZWN0ZWRFeHRlbnNpb25JbmRleCgpLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHRkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLFxuXHRcdFx0eyBhcmlhTGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb24nLCBcIkV4dGVuc2lvblwiKSwgdXNlQ3VzdG9tRHJhd246IHRydWUsIG9wdGlvbnNBc0NoaWxkcmVuOiB0cnVlIH1cblx0XHQpKTtcblx0XHR0aGlzLmV4dGVuc2lvblNlbGVjdC5yZW5kZXIoZXh0ZW5zaW9uU2VsZWN0Q29udGFpbmVyKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmV4dGVuc2lvblNlbGVjdC5vbkRpZFNlbGVjdChlID0+IHtcblx0XHRcdHZvaWQgdGhpcy51cGRhdGVTZWxlY3RlZEV4dGVuc2lvbih0aGlzLmV4dGVuc2lvbk9wdGlvbnNbZS5pbmRleF0/LnZhbHVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5leHRlbnNpb25FcnJvciA9IHRoaXMuY3JlYXRlRmllbGRFcnJvcih0aGlzLmV4dGVuc2lvbkZpZWxkLCBsb2NhbGl6ZSgnZXh0ZW5zaW9uUmVxdWlyZWQnLCBcIlNlbGVjdCBhbiBleHRlbnNpb24gdG8gY29udGludWUuXCIpKTtcblx0XHR0aGlzLmV4dGVuc2lvblN0YXR1cyA9IGFwcGVuZCh0aGlzLmV4dGVuc2lvbkZpZWxkLCAkKCdkaXYud2l6YXJkLWV4dGVuc2lvbi1zdGF0dXMnKSk7XG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25PcHRpb25zKCk7XG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25GaWVsZFZpc2liaWxpdHkoKTtcblxuXHRcdC8vIERlZmF1bHQgdGhlIHRhcmdldCB0byB0aGUgbW9zdCBsaWtlbHkgb3B0aW9uIHdoZW4gdGhlIHJlcG9ydGVyIG9wZW5zLlxuXHRcdC8vIEluIHRoZSBBZ2VudHMgV2luZG93IHdlIHByZXNlbGVjdCBBZ2VudHMgV2luZG93OyBvdGhlcndpc2UgZGVmYXVsdCB0b1xuXHRcdC8vIFZTIENvZGUgKHRoZSBtb3N0IGNvbW1vbiB0YXJnZXQpLiBFeHRlbnNpb24gaXMgcHJlc2VsZWN0ZWQgb25seSB3aGVuIGFuXG5cdFx0Ly8gZXh0ZW5zaW9uIGlkIHdhcyBhbHJlYWR5IHByb3ZpZGVkLiBUaGUgdXNlciBjYW4gYWx3YXlzIG92ZXJyaWRlLlxuXHRcdGlmICghdGhpcy5zZWxlY3RlZElzc3VlU291cmNlKSB7XG5cdFx0XHRpZiAodGhpcy5kYXRhLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9IElzc3VlU291cmNlLkV4dGVuc2lvbjtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZElzc3VlU291cmNlID0gSXNzdWVTb3VyY2UuQWdlbnRzV2luZG93O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZElzc3VlU291cmNlID0gSXNzdWVTb3VyY2UuVlNDb2RlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VCdXR0b25zKCk7XG5cblx0XHQvLyBDYXRlZ29yeSBzZWxlY3Rpb25cblx0XHRjb25zdCBjYXRMYWJlbCA9IGFwcGVuZChwYWdlLCAkKCdsYWJlbC53aXphcmQtZmllbGQtbGFiZWwnKSk7XG5cdFx0Y2F0TGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZmVlZGJhY2tDYXRlZ29yeScsIFwiQ2F0ZWdvcnlcIik7XG5cdFx0dGhpcy5hcHBlbmRSZXF1aXJlZE1hcmtlcihjYXRMYWJlbCk7XG5cblx0XHR0aGlzLnR5cGVCdXR0b25Hcm91cCA9IGFwcGVuZChwYWdlLCAkKCdkaXYud2l6YXJkLXR5cGUtYnV0dG9ucycpKTtcblxuXHRcdGNvbnN0IHNlbGVjdFR5cGUgPSAodHlwZTogSXNzdWVUeXBlKSA9PiB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID0gdHlwZTtcblx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaXNzdWVUeXBlOiB0eXBlIH0pO1xuXHRcdFx0dGhpcy5zZXRGaWVsZEVycm9yKHRoaXMudHlwZUJ1dHRvbkdyb3VwLCB0aGlzLnR5cGVFcnJvciwgZmFsc2UpO1xuXHRcdFx0Zm9yIChjb25zdCBiIG9mIHRoaXMuaXNzdWVUeXBlQnV0dG9ucykge1xuXHRcdFx0XHRjb25zdCBpc1NlbGVjdGVkID0gYi5lbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10eXBlJykgPT09IFN0cmluZyh0eXBlKTtcblx0XHRcdFx0Yi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgaXNTZWxlY3RlZCk7XG5cdFx0XHRcdGIuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhpc1NlbGVjdGVkKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZURlc2NyaXB0aW9uR3VpZGFuY2UoKTtcblx0XHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VCdXR0b25zKCk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVSZXZpZXdEZXRhaWxzKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlYXJjaFNpbWlsYXJJc3N1ZXMoKTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCB7IHR5cGUsIGxhYmVsLCBpY29uIH0gb2YgdGhpcy5nZXRJc3N1ZVR5cGVPcHRpb25zKCkpIHtcblx0XHRcdGNvbnN0IGJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGhpcy50eXBlQnV0dG9uR3JvdXAsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdFx0YnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLXR5cGUtYnRuJyk7XG5cdFx0XHRidG4uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdHlwZScsIFN0cmluZyh0eXBlKSk7XG5cdFx0XHRidG4uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsICdmYWxzZScpO1xuXHRcdFx0YnRuLmxhYmVsID0gYCQoJHtpY29uLmlkfSkgJHtsYWJlbH1gO1xuXHRcdFx0dGhpcy5pc3N1ZVR5cGVCdXR0b25zLnB1c2goYnRuKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGJ0bi5vbkRpZENsaWNrKCgpID0+IHNlbGVjdFR5cGUodHlwZSkpKTtcblx0XHR9XG5cdFx0dGhpcy50eXBlRXJyb3IgPSB0aGlzLmNyZWF0ZUZpZWxkRXJyb3IocGFnZSwgbG9jYWxpemUoJ2NhdGVnb3J5UmVxdWlyZWQnLCBcIlNlbGVjdCBhIGNhdGVnb3J5IHRvIGNvbnRpbnVlLlwiKSk7XG5cblx0XHQvLyBUaXRsZSBmaWVsZCB3aXRoIEFJIGdlbmVyYXRlIGJ1dHRvbiBuZXh0IHRvIGxhYmVsXG5cdFx0Y29uc3QgdGl0bGVHcm91cCA9IGFwcGVuZChwYWdlLCAkKCdkaXYud2l6YXJkLWZpZWxkLndpemFyZC10aXRsZS1maWVsZCcpKTtcblx0XHRjb25zdCB0aXRsZUxhYmVsUm93ID0gYXBwZW5kKHRpdGxlR3JvdXAsICQoJ2Rpdi53aXphcmQtdGl0bGUtbGFiZWwtcm93JykpO1xuXHRcdGNvbnN0IHRpdGxlTGFiZWwgPSBhcHBlbmQodGl0bGVMYWJlbFJvdywgJCgnbGFiZWwud2l6YXJkLWZpZWxkLWxhYmVsJykpO1xuXHRcdHRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaXNzdWVUaXRsZScsIFwiVGl0bGVcIik7XG5cdFx0dGhpcy5hcHBlbmRSZXF1aXJlZE1hcmtlcih0aXRsZUxhYmVsKTtcblxuXHRcdGNvbnN0IGFpQnRuID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0aXRsZUxhYmVsUm93LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRhaUJ0bi5sYWJlbCA9IGAkKHNwYXJrbGUpICR7bG9jYWxpemUoJ2dlbmVyYXRlVGl0bGVCdG4nLCBcIkdlbmVyYXRlIGZyb20gZGVzY3JpcHRpb25cIil9YDtcblx0XHRhaUJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dpemFyZC1haS10aXRsZS1idG4nKTtcblx0XHRhaUJ0bi5lbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ2dlbmVyYXRlVGl0bGUnLCBcIkdlbmVyYXRlIHRpdGxlIGZyb20gZGVzY3JpcHRpb25cIik7XG5cdFx0YWlCdG4uZW5hYmxlZCA9ICEhdGhpcy5kYXRhLmlzc3VlQm9keT8udHJpbSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFpQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVzYyA9IHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS50cmltKCk7XG5cdFx0XHRpZiAoZGVzYyAmJiAhYWlCdG4uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2xvYWRpbmcnKSkge1xuXHRcdFx0XHQvLyBMb2NrIHdpZHRoIHRvIHByZXZlbnQgbGF5b3V0IHNoaWZ0IGR1cmluZyBsb2FkaW5nXG5cdFx0XHRcdGFpQnRuLmVsZW1lbnQuc3R5bGUubWluV2lkdGggPSBgJHthaUJ0bi5lbGVtZW50Lm9mZnNldFdpZHRofXB4YDtcblx0XHRcdFx0YWlCdG4uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRhaUJ0bi5sYWJlbCA9IGAkKGxvYWRpbmd+c3BpbikgJHtsb2NhbGl6ZSgnZ2VuZXJhdGluZ1RpdGxlJywgXCJHZW5lcmF0aW5nLi4uXCIpfWA7XG5cdFx0XHRcdGFpQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbG9hZGluZycpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RHZW5lcmF0ZVRpdGxlLmZpcmUoZGVzYyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuZ2VuZXJhdGVUaXRsZUJ0biA9IGFpQnRuO1xuXG5cdFx0dGhpcy50aXRsZUlucHV0ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IElucHV0Qm94KHRpdGxlR3JvdXAsIHVuZGVmaW5lZCwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdpc3N1ZVRpdGxlUGxhY2Vob2xkZXInLCBcIkJyaWVmIHN1bW1hcnkgb2YgdGhlIGlzc3VlXCIpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHR9KSk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZVBsYWNlaG9sZGVyKCk7XG5cdFx0aWYgKHRoaXMuZGF0YS5pc3N1ZVRpdGxlKSB7XG5cdFx0XHR0aGlzLnRpdGxlSW5wdXQudmFsdWUgPSB0aGlzLmRhdGEuaXNzdWVUaXRsZTtcblx0XHR9XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy50aXRsZUlucHV0Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnRpdGxlSW5wdXQudmFsdWUudHJpbSgpKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLnRpdGxlSW5wdXQuZWxlbWVudCwgdGhpcy50aXRsZUVycm9yLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlYXJjaFNpbWlsYXJJc3N1ZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy50aXRsZUVycm9yID0gdGhpcy5jcmVhdGVGaWVsZEVycm9yKHRpdGxlR3JvdXAsIGxvY2FsaXplKCd0aXRsZVJlcXVpcmVkJywgXCJFbnRlciBhIHRpdGxlIHRvIGNvbnRpbnVlLlwiKSk7XG5cblx0XHQvLyBEZXNjcmlwdGlvbiBmaWVsZCB3aXRoIGd1aWRhbmNlIGFuZCBhdXRvLWdyb3dpbmcgdGV4dGFyZWFcblx0XHRjb25zdCBkZXNjcmlwdGlvbkdyb3VwID0gYXBwZW5kKHBhZ2UsICQoJ2Rpdi53aXphcmQtZmllbGQnKSk7XG5cdFx0Y29uc3QgZGVzY0xhYmVsID0gYXBwZW5kKGRlc2NyaXB0aW9uR3JvdXAsICQoJ2xhYmVsLndpemFyZC1maWVsZC1sYWJlbCcpKTtcblx0XHRkZXNjTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZGVzY3JpcHRpb24nLCBcIkRlc2NyaXB0aW9uXCIpO1xuXHRcdHRoaXMuYXBwZW5kUmVxdWlyZWRNYXJrZXIoZGVzY0xhYmVsKTtcblxuXHRcdHRoaXMuZGVzY3JpcHRpb25HdWlkYW5jZSA9IGFwcGVuZChkZXNjcmlwdGlvbkdyb3VwLCAkKCdwLndpemFyZC1zdWJ0aXRsZS53aXphcmQtZGVzY3JpcHRpb24tZ3VpZGFuY2UnKSk7XG5cdFx0dGhpcy51cGRhdGVEZXNjcmlwdGlvbkd1aWRhbmNlKCk7XG5cblx0XHR0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEgPSBhcHBlbmQoZGVzY3JpcHRpb25Hcm91cCwgJCgndGV4dGFyZWEud2l6YXJkLXRleHRhcmVhJykpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2Rlc2NyaXB0aW9uUGxhY2Vob2xkZXInLCBcIkRlc2NyaWJlIHRoZSBpc3N1ZSBpbiBkZXRhaWwuLi5cIik7XG5cdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnJvd3MgPSA2O1xuXHRcdGlmICh0aGlzLmRhdGEuaXNzdWVCb2R5KSB7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUgPSB0aGlzLmRhdGEuaXNzdWVCb2R5O1xuXHRcdH1cblx0XHRjb25zdCBhdXRvR3Jvd1RleHRhcmVhID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnN0eWxlLmhlaWdodCA9ICcwJztcblx0XHRcdGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWF4KHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS5zY3JvbGxIZWlnaHQsIDEyMCk7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gYCR7bmV3SGVpZ2h0fXB4YDtcblx0XHR9O1xuXHRcdGF1dG9Hcm93VGV4dGFyZWEoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLCBFdmVudFR5cGUuSU5QVVQsICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEsIHRoaXMuZGVzY3JpcHRpb25FcnJvciwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0YXV0b0dyb3dUZXh0YXJlYSgpO1xuXHRcdFx0dGhpcy5zZWFyY2hTaW1pbGFySXNzdWVzKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUdlbmVyYXRlVGl0bGVCdXR0b25TdGF0ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uRXJyb3IgPSB0aGlzLmNyZWF0ZUZpZWxkRXJyb3IoZGVzY3JpcHRpb25Hcm91cCwgbG9jYWxpemUoJ2Rlc2NyaXB0aW9uUmVxdWlyZWQnLCBcIkVudGVyIGEgZGVzY3JpcHRpb24gdG8gY29udGludWUuXCIpKTtcblxuXHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VGbGFncygpO1xuXHRcdHRoaXMudXBkYXRlVGFyZ2V0U3RhdHVzKCk7XG5cblx0XHQvLyBEZWZhdWx0IHRoZSBjYXRlZ29yeSB0byBCdWcgKG1vc3QgY29tbW9uKS4gTXVzdCBydW4gYWZ0ZXJcblx0XHQvLyBkZXNjcmlwdGlvbkd1aWRhbmNlIGlzIGluaXRpYWxpemVkIGJlY2F1c2Ugc2VsZWN0VHlwZSAtPlxuXHRcdC8vIHVwZGF0ZURlc2NyaXB0aW9uR3VpZGFuY2UgdG91Y2hlcyBpdC5cblx0XHRpZiAodGhpcy5zZWxlY3RlZElzc3VlVHlwZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzZWxlY3RUeXBlKElzc3VlVHlwZS5CdWcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZWxlY3RUeXBlKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kUmVxdWlyZWRNYXJrZXIobGFiZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbWFya2VyID0gYXBwZW5kKGxhYmVsLCAkKCdzcGFuLndpemFyZC1yZXF1aXJlZC1tYXJrZXInKSk7XG5cdFx0bWFya2VyLnRleHRDb250ZW50ID0gJyonO1xuXHRcdG1hcmtlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SXNzdWVUeXBlT3B0aW9ucygpOiB7IHR5cGU6IElzc3VlVHlwZTsgbGFiZWw6IHN0cmluZzsgaWNvbjogeyBpZDogc3RyaW5nIH0gfVtdIHtcblx0XHRjb25zdCBvcHRpb25zID0gW1xuXHRcdFx0eyB0eXBlOiBJc3N1ZVR5cGUuQnVnLCBsYWJlbDogbG9jYWxpemUoJ2J1ZycsIFwiQnVnXCIpLCBpY29uOiBDb2RpY29uLmJ1ZyB9LFxuXHRcdFx0eyB0eXBlOiBJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3QsIGxhYmVsOiBsb2NhbGl6ZSgnZmVhdHVyZVJlcXVlc3QnLCBcIkZlYXR1cmUgUmVxdWVzdFwiKSwgaWNvbjogQ29kaWNvbi5saWdodGJ1bGIgfSxcblx0XHRcdHsgdHlwZTogSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWUsIGxhYmVsOiBsb2NhbGl6ZSgncGVyZm9ybWFuY2VJc3N1ZScsIFwiUGVyZm9ybWFuY2UgSXNzdWVcIiksIGljb246IENvZGljb24uZGFzaGJvYXJkIH0sXG5cdFx0XTtcblx0XHQvLyBUaGUgTWFya2V0cGxhY2UgdGFyZ2V0IGlzIGZvciBpc3N1ZXMgd2l0aCB0aGUgbWFya2V0cGxhY2Ugc2l0ZS9zZXJ2aWNlXG5cdFx0Ly8gaXRzZWxmLCB3aGVyZSBwZXJmb3JtYW5jZSBtZXRyaWNzIGZyb20gYSBzaW5nbGUgVlMgQ29kZSBpbnN0YW5jZSBhcmVuJ3QgdXNlZnVsLlxuXHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLk1hcmtldHBsYWNlKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucy5maWx0ZXIobyA9PiBvLnR5cGUgIT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFNvdXJjZU9wdGlvbnMoKTogeyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogSXNzdWVTb3VyY2UgfVtdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBsYWJlbDogcHJvZHVjdC5uYW1lTG9uZyB8fCBsb2NhbGl6ZSgndnNjb2RlJywgXCJWaXN1YWwgU3R1ZGlvIENvZGVcIiksIHZhbHVlOiBJc3N1ZVNvdXJjZS5WU0NvZGUgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdhZ2VudHNXaW5kb3cnLCBcIkFnZW50cyBXaW5kb3dcIiksIHZhbHVlOiBJc3N1ZVNvdXJjZS5BZ2VudHNXaW5kb3cgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25Tb3VyY2UnLCBcIkEgVlMgQ29kZSBleHRlbnNpb25cIiksIHZhbHVlOiBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtYXJrZXRwbGFjZScsIFwiRXh0ZW5zaW9ucyBNYXJrZXRwbGFjZVwiKSwgdmFsdWU6IElzc3VlU291cmNlLk1hcmtldHBsYWNlIH0sXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U291cmNlT3B0aW9ucygpOiB7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBJc3N1ZVNvdXJjZSB9W10ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmdldEFsbFNvdXJjZU9wdGlvbnMoKTtcblx0XHQvLyBUaGUgRXh0ZW5zaW9uIHRhcmdldCBvbmx5IGFwcGxpZXMgd2hlbiB0aGVyZSBhcmUgbm9uLWJ1aWx0aW4sIG5vbi10aGVtZVxuXHRcdC8vIGV4dGVuc2lvbnMgdG8gcmVwb3J0IGFnYWluc3QsIHdoaWNoIG5ldmVyIGhhcHBlbnMgaW4gdGhlIEFnZW50cyBXaW5kb3cuXG5cdFx0aWYgKHRoaXMuZGF0YS5pc1Nlc3Npb25zV2luZG93IHx8ICF0aGlzLmhhc1JlcG9ydGFibGVFeHRlbnNpb25zKCkpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmZpbHRlcihvID0+IG8udmFsdWUgIT09IElzc3VlU291cmNlLkV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNSZXBvcnRhYmxlRXh0ZW5zaW9ucygpOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLm1vZGVsLmdldERhdGEoKTtcblx0XHRjb25zdCBzb3VyY2VFeHRlbnNpb25zID0gbW9kZWxEYXRhLmVuYWJsZWROb25UaGVtZUV4dGVzaW9ucyA/PyBtb2RlbERhdGEuYWxsRXh0ZW5zaW9ucyA/PyBbXTtcblx0XHRyZXR1cm4gc291cmNlRXh0ZW5zaW9ucy5zb21lKGV4dGVuc2lvbiA9PiAhZXh0ZW5zaW9uLmlzVGhlbWUgJiYgIWV4dGVuc2lvbi5pc0J1aWx0aW4pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJc3N1ZVNvdXJjZUJ1dHRvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYXZhaWxhYmxlU291cmNlcyA9IG5ldyBTZXQodGhpcy5nZXRTb3VyY2VPcHRpb25zKCkubWFwKG9wdGlvbiA9PiBvcHRpb24udmFsdWUpKTtcblx0XHRpZiAodGhpcy5zZWxlY3RlZElzc3VlU291cmNlICYmICFhdmFpbGFibGVTb3VyY2VzLmhhcyh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UpKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlRmxhZ3MoKTtcblx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uVmFsaWRhdGlvbigpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgYnV0dG9uIG9mIHRoaXMuaXNzdWVTb3VyY2VCdXR0b25zKSB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBidXR0b24uZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtc291cmNlJykgYXMgSXNzdWVTb3VyY2U7XG5cdFx0XHRjb25zdCBpc0F2YWlsYWJsZSA9IGF2YWlsYWJsZVNvdXJjZXMuaGFzKHNvdXJjZSk7XG5cdFx0XHRjb25zdCBpc1NlbGVjdGVkID0gc291cmNlID09PSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2U7XG5cdFx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhaXNBdmFpbGFibGUpO1xuXHRcdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBpc1NlbGVjdGVkKTtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKGlzU2VsZWN0ZWQpKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbkZpZWxkVmlzaWJpbGl0eSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRJc3N1ZVNvdXJjZShzb3VyY2U6IElzc3VlU291cmNlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RlZElzc3VlU291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLnNvdXJjZUJ1dHRvbkdyb3VwLCB0aGlzLnNvdXJjZUVycm9yLCB0aGlzLmRpZEF0dGVtcHREZXNjcmliZVN1Ym1pdCAmJiAhc291cmNlKTtcblx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlRmxhZ3MoKTtcblx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlQnV0dG9ucygpO1xuXHRcdHRoaXMudXBkYXRlSXNzdWVUeXBlQnV0dG9ucygpO1xuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uVmFsaWRhdGlvbigpO1xuXHRcdHRoaXMudXBkYXRlVGl0bGVQbGFjZWhvbGRlcigpO1xuXHRcdHRoaXMudXBkYXRlVGFyZ2V0U3RhdHVzKCk7XG5cdFx0dGhpcy51cGRhdGVEZXNjcmlwdGlvbkd1aWRhbmNlKCk7XG5cdFx0dGhpcy5zZWFyY2hTaW1pbGFySXNzdWVzKCk7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZSBvciByZXN0b3JlIGlzc3VlIHR5cGUgYnV0dG9ucyBiYXNlZCBvbiB0aGUgY3VycmVudCBzb3VyY2UuIFRoZSBNYXJrZXRwbGFjZVxuXHQgKiBzb3VyY2UgZG9lcyBub3Qgc3VwcG9ydCByZXBvcnRpbmcgcGVyZm9ybWFuY2UgaXNzdWVzLCBzbyB0aGUgYnV0dG9uIGlzIGhpZGRlblxuXHQgKiBhbmQgdGhlIHNlbGVjdGlvbiBmYWxscyBiYWNrIHRvIEJ1ZyB3aGVuIGl0IHdhcyB0aGUgUGVyZm9ybWFuY2Ugb3B0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVJc3N1ZVR5cGVCdXR0b25zKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc3N1ZVR5cGVCdXR0b25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhbGxvd2VkVHlwZXMgPSBuZXcgU2V0KHRoaXMuZ2V0SXNzdWVUeXBlT3B0aW9ucygpLm1hcChvcHRpb24gPT4gU3RyaW5nKG9wdGlvbi50eXBlKSkpO1xuXHRcdGZvciAoY29uc3QgYnV0dG9uIG9mIHRoaXMuaXNzdWVUeXBlQnV0dG9ucykge1xuXHRcdFx0Y29uc3QgYnV0dG9uVHlwZSA9IGJ1dHRvbi5lbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10eXBlJyk7XG5cdFx0XHRjb25zdCBpc0F2YWlsYWJsZSA9ICEhYnV0dG9uVHlwZSAmJiBhbGxvd2VkVHlwZXMuaGFzKGJ1dHRvblR5cGUpO1xuXHRcdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWlzQXZhaWxhYmxlKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgIT09IHVuZGVmaW5lZCAmJiAhYWxsb3dlZFR5cGVzLmhhcyhTdHJpbmcodGhpcy5zZWxlY3RlZElzc3VlVHlwZSkpKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID0gSXNzdWVUeXBlLkJ1Zztcblx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaXNzdWVUeXBlOiBJc3N1ZVR5cGUuQnVnIH0pO1xuXHRcdFx0Zm9yIChjb25zdCBiIG9mIHRoaXMuaXNzdWVUeXBlQnV0dG9ucykge1xuXHRcdFx0XHRjb25zdCBpc1NlbGVjdGVkID0gYi5lbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS10eXBlJykgPT09IFN0cmluZyhJc3N1ZVR5cGUuQnVnKTtcblx0XHRcdFx0Yi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgaXNTZWxlY3RlZCk7XG5cdFx0XHRcdGIuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhpc1NlbGVjdGVkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZpbGVPbkV4dGVuc2lvbiA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uO1xuXHRcdGNvbnN0IGZpbGVPbk1hcmtldHBsYWNlID0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZTtcblx0XHRjb25zdCBmaWxlT25Qcm9kdWN0ID0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5WU0NvZGUgfHwgdGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5BZ2VudHNXaW5kb3cgfHwgdGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5Vbmtub3duO1xuXHRcdGNvbnN0IGZpbGVPbkFnZW50c1dpbmRvdyA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuQWdlbnRzV2luZG93O1xuXHRcdHRoaXMubW9kZWwudXBkYXRlKHtcblx0XHRcdGlzc3VlU291cmNlOiB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UsXG5cdFx0XHRmaWxlT25FeHRlbnNpb24sXG5cdFx0XHRmaWxlT25NYXJrZXRwbGFjZSxcblx0XHRcdGZpbGVPblByb2R1Y3QsXG5cdFx0XHRpc1Nlc3Npb25zV2luZG93OiBmaWxlT25BZ2VudHNXaW5kb3cgPyB0cnVlIDogdGhpcy5kYXRhLmlzU2Vzc2lvbnNXaW5kb3csXG5cdFx0XHRzZWxlY3RlZEV4dGVuc2lvbjogdGhpcy5zZWxlY3RlZEV4dGVuc2lvbixcblx0XHR9KTtcblx0XHR0aGlzLmRhdGEuaXNzdWVTb3VyY2UgPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2U7XG5cdFx0Ly8gUHJlc2VydmUgYSBwcmVzZXQgYGV4dGVuc2lvbklkYCB3aGlsZSB0aGUgZXh0ZW5zaW9uIGxpc3QgaXMgc3RpbGwgbG9hZGluZzpcblx0XHQvLyBgc2VsZWN0ZWRFeHRlbnNpb25gIG1heSBiZSB1bmRlZmluZWQgaGVyZSBldmVuIHRob3VnaCB0aGUgY2FsbGVyIGFza2VkXG5cdFx0Ly8gZm9yIGEgc3BlY2lmaWMgZXh0ZW5zaW9uLCBhbmQgb3ZlcndyaXRpbmcgd2l0aCBgdW5kZWZpbmVkYCB3b3VsZCBwcmV2ZW50XG5cdFx0Ly8gdGhlIGNhdGNoLXVwIHJldHJ5IGluIGB1cGRhdGVFeHRlbnNpb25PcHRpb25zYCBmcm9tIHJlLXJlc29sdmluZyBpdC5cblx0XHR0aGlzLmRhdGEuZXh0ZW5zaW9uSWQgPSBmaWxlT25FeHRlbnNpb25cblx0XHRcdD8gKHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24/LmlkID8/IHRoaXMuZGF0YS5leHRlbnNpb25JZClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaXRsZVBsYWNlaG9sZGVyKCk6IHZvaWQge1xuXHRcdHN3aXRjaCAodGhpcy5zZWxlY3RlZElzc3VlU291cmNlKSB7XG5cdFx0XHRjYXNlIElzc3VlU291cmNlLkV4dGVuc2lvbjpcblx0XHRcdFx0dGhpcy50aXRsZUlucHV0LnNldFBsYWNlSG9sZGVyKGxvY2FsaXplKCdleHRlbnNpb25QbGFjZWhvbGRlcicsIFwiRS5nLiBNaXNzaW5nIGFsdCB0ZXh0IG9uIGV4dGVuc2lvbiByZWFkbWUgaW1hZ2VcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuTWFya2V0cGxhY2U6XG5cdFx0XHRcdHRoaXMudGl0bGVJbnB1dC5zZXRQbGFjZUhvbGRlcihsb2NhbGl6ZSgnbWFya2V0cGxhY2VQbGFjZWhvbGRlcicsIFwiRS5nLiBDYW5ub3QgZGlzYWJsZSBpbnN0YWxsZWQgZXh0ZW5zaW9uXCIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIElzc3VlU291cmNlLkFnZW50c1dpbmRvdzpcblx0XHRcdFx0dGhpcy50aXRsZUlucHV0LnNldFBsYWNlSG9sZGVyKGxvY2FsaXplKCdhZ2VudHNXaW5kb3dQbGFjZWhvbGRlcicsIFwiRS5nLiBTZXNzaW9ucyBsaXN0IGRvZXMgbm90IHJlZnJlc2ggYWZ0ZXIgY3JlYXRpbmcgYSBuZXcgc2Vzc2lvblwiKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJc3N1ZVNvdXJjZS5WU0NvZGU6XG5cdFx0XHRcdHRoaXMudGl0bGVJbnB1dC5zZXRQbGFjZUhvbGRlcihsb2NhbGl6ZSgndnNjb2RlUGxhY2Vob2xkZXInLCBcIkUuZy4gV29ya2JlbmNoIGlzIG1pc3NpbmcgcHJvYmxlbXMgcGFuZWxcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMudGl0bGVJbnB1dC5zZXRQbGFjZUhvbGRlcihsb2NhbGl6ZSgnaXNzdWVUaXRsZVBsYWNlaG9sZGVyJywgXCJCcmllZiBzdW1tYXJ5IG9mIHRoZSBpc3N1ZVwiKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uT3B0aW9ucygpOiB7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGhpZGRlbj86IGJvb2xlYW4gfVtdIHtcblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLm1vZGVsLmdldERhdGEoKTtcblx0XHRjb25zdCBzb3VyY2VFeHRlbnNpb25zID0gbW9kZWxEYXRhLmVuYWJsZWROb25UaGVtZUV4dGVzaW9ucyA/PyBtb2RlbERhdGEuYWxsRXh0ZW5zaW9ucyA/PyBbXTtcblx0XHRjb25zdCBleHRlbnNpb25zID0gWy4uLnNvdXJjZUV4dGVuc2lvbnNdXG5cdFx0XHQuZmlsdGVyKGV4dGVuc2lvbiA9PiAhZXh0ZW5zaW9uLmlzVGhlbWUgJiYgIWV4dGVuc2lvbi5pc0J1aWx0aW4pXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gKGEuZGlzcGxheU5hbWUgfHwgYS5uYW1lIHx8IGEuaWQpLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSB8fCBiLm5hbWUgfHwgYi5pZCkpO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0RXh0ZW5zaW9uJywgXCJTZWxlY3QgZXh0ZW5zaW9uXCIpLCB2YWx1ZTogdW5kZWZpbmVkLCBoaWRkZW46IHRydWUgfSxcblx0XHRcdC4uLmV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiAoeyBsYWJlbDogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lIHx8IGV4dGVuc2lvbi5pZCwgdmFsdWU6IGV4dGVuc2lvbi5pZCB9KSksXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uU2VsZWN0SXRlbXMoKTogSVNlbGVjdE9wdGlvbkl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uT3B0aW9ucy5tYXAob3B0aW9uID0+ICh7IHRleHQ6IG9wdGlvbi5sYWJlbCwgaXNEaXNhYmxlZDogb3B0aW9uLmhpZGRlbiB9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGVkRXh0ZW5zaW9uSW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgdGhpcy5leHRlbnNpb25PcHRpb25zLmZpbmRJbmRleChvcHRpb24gPT4gb3B0aW9uLnZhbHVlID09PSB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uPy5pZCB8fCBvcHRpb24udmFsdWUgPT09IHRoaXMuZGF0YS5leHRlbnNpb25JZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25PcHRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9uT3B0aW9ucyA9IHRoaXMuZ2V0RXh0ZW5zaW9uT3B0aW9ucygpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uU2VsZWN0LnNldE9wdGlvbnModGhpcy5nZXRFeHRlbnNpb25TZWxlY3RJdGVtcygpLCB0aGlzLmdldFNlbGVjdGVkRXh0ZW5zaW9uSW5kZXgoKSk7XG5cdFx0aWYgKCF0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uICYmIHRoaXMuZGF0YS5leHRlbnNpb25JZCkge1xuXHRcdFx0dm9pZCB0aGlzLnVwZGF0ZVNlbGVjdGVkRXh0ZW5zaW9uKHRoaXMuZGF0YS5leHRlbnNpb25JZCwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uRmllbGRWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9uRmllbGQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgdGhpcy5zZWxlY3RlZElzc3VlU291cmNlICE9PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25WYWxpZGF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc0V4dGVuc2lvbiA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAhPT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uIHx8ICEhdGhpcy5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRjb25zdCBoYXNFeHRlbnNpb25Jc3N1ZVVybCA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAhPT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uIHx8ICF0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uIHx8ICEhdGhpcy5nZXRTZWxlY3RlZEV4dGVuc2lvbklzc3VlVXJsKCk7XG5cdFx0dGhpcy5zZXRGaWVsZEVycm9yKHRoaXMuZXh0ZW5zaW9uRmllbGQsIHRoaXMuZXh0ZW5zaW9uRXJyb3IsIHRoaXMuZGlkQXR0ZW1wdERlc2NyaWJlU3VibWl0ICYmICghaGFzRXh0ZW5zaW9uIHx8ICFoYXNFeHRlbnNpb25Jc3N1ZVVybCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVTZWxlY3RlZEV4dGVuc2lvbihleHRlbnNpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBsb2FkRXh0ZW5zaW9uRGF0YSA9IHRydWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25JZFxuXHRcdFx0PyB0aGlzLm1vZGVsLmdldERhdGEoKS5hbGxFeHRlbnNpb25zLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZC50b0xvd2VyQ2FzZSgpID09PSBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zZWxlY3RlZEV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHQvLyBQcmVzZXJ2ZSB0aGUgcmVxdWVzdGVkIGV4dGVuc2lvbklkIGV2ZW4gd2hlbiB0aGUgZXh0ZW5zaW9uIGxpc3QgaGFzbid0XG5cdFx0Ly8gYmVlbiBwb3B1bGF0ZWQgeWV0ICh0eXBpY2FsIHdpemFyZCBmbG93OiB0aGUgY29uc3RydWN0b3IgcnVucyBiZWZvcmVcblx0XHQvLyBgcG9wdWxhdGVSZXBvcnRlckRhdGFBc3luY2AgZmluaXNoZXMgZmlsbGluZyBgYWxsRXh0ZW5zaW9uc2ApLiBXaXRob3V0XG5cdFx0Ly8gdGhpcyBwcmVzZXJ2YXRpb24sIHRoZSBsYXRlciBjYXRjaC11cCByZXRyeSBpbiBgdXBkYXRlRXh0ZW5zaW9uT3B0aW9uc2Bcblx0XHQvLyBzZWVzIGB0aGlzLmRhdGEuZXh0ZW5zaW9uSWQgPT09IHVuZGVmaW5lZGAgYW5kIG5ldmVyIHJlLXJlc29sdmVzLFxuXHRcdC8vIGRyb3BwaW5nIGFueSBwcmVzZXQgZXh0ZW5zaW9uIGRhdGEgd2l0aCBpdC5cblx0XHRpZiAoZXh0ZW5zaW9uSWQgPT09IHVuZGVmaW5lZCB8fCBleHRlbnNpb24pIHtcblx0XHRcdHRoaXMuZGF0YS5leHRlbnNpb25JZCA9IGV4dGVuc2lvbj8uaWQ7XG5cdFx0fVxuXHRcdHRoaXMuZXh0ZW5zaW9uU2VsZWN0LnNlbGVjdCh0aGlzLmdldFNlbGVjdGVkRXh0ZW5zaW9uSW5kZXgoKSk7XG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25WYWxpZGF0aW9uKCk7XG5cdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0dGhpcy51cGRhdGVUYXJnZXRTdGF0dXMoKTtcblx0XHRcdHRoaXMuc2VhcmNoU2ltaWxhcklzc3VlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IGFueSBwcmVzZXQgZXh0ZW5zaW9uIGRhdGEgQkVGT1JFIHRoZSBidWlsdC1pbiBzb3VyY2Utc3dpdGNoIGJlbG93LlxuXHRcdC8vIFdoZW4gdGhlIHJlcG9ydGVyIGlzIG9wZW5lZCBwcm9ncmFtbWF0aWNhbGx5IChlLmcuIHZpYSB0aGVcblx0XHQvLyBgd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcmAgY29tbWFuZCkgd2l0aCBhIHByZXNldCBgZXh0ZW5zaW9uSWRgXG5cdFx0Ly8gcGx1cyBleHRlbnNpb24gYGRhdGFgL2B1cmlgLCBwcm9wYWdhdGUgdGhhdCBkYXRhIG9udG8gdGhlIHNlbGVjdGVkXG5cdFx0Ly8gZXh0ZW5zaW9uIGFuZCB0aGUgbW9kZWwgc28gaXQgc2hvd3MgdXAgaW4gdGhlIGlzc3VlIGJvZHkuIERvaW5nIHRoaXNcblx0XHQvLyBiZWZvcmUgdGhlIGJ1aWx0LWluIGVhcmx5LXJldHVybiBpcyBpbXBvcnRhbnQ6IGV4dGVuc2lvbnMgYnVuZGxlZCB3aXRoXG5cdFx0Ly8gdGhlIGRldiBidWlsZCAoQ29waWxvdCwgZXRjLikgYXJlIGZsYWdnZWQgYGlzQnVpbHRpbmAsIHdoaWNoIHRyaWdnZXJzXG5cdFx0Ly8gdGhlIHNvdXJjZSBzd2l0Y2ggdG8gVlNDb2RlIGFuZCByZXR1cm5zIFx1MjAxNCBvdGhlcndpc2UgdGhlIHByZXNldCBkYXRhXG5cdFx0Ly8gd291bGQgYmUgc2lsZW50bHkgbG9zdCBmb3IgZXZlcnkgYnVpbHQtaW4gY2FsbGVyLiBXZSBndWFyZCBvblxuXHRcdC8vIGAhdGhpcy5pbmNsdWRlRXh0ZW5zaW9uRGF0YWAgKHJhdGhlciB0aGFuIGAhZXh0ZW5zaW9uLmRhdGFgKSBiZWNhdXNlXG5cdFx0Ly8gYGlzc3VlU2VydmljZWAgcHJlLXBvcHVsYXRlcyBgZXh0ZW5zaW9uLmRhdGFgIG9uIGV2ZXJ5IGVuYWJsZWRcblx0XHQvLyBleHRlbnNpb24sIHNvIHRoYXQgZmllbGQgaXMgbm90IGEgcmVsaWFibGUgXCJhbHJlYWR5IGFwcGxpZWRcIiBzaWduYWwgXHUyMDE0XG5cdFx0Ly8gYGluY2x1ZGVFeHRlbnNpb25EYXRhYCBpcyBvbmx5IGZsaXBwZWQgdG8gYHRydWVgIGJ5XG5cdFx0Ly8gYGFwcGx5RXh0ZW5zaW9uSXNzdWVEYXRhYC5cblx0XHRjb25zdCBoYXNQcmVzZXREYXRhID0gIXRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEgJiYgKHRoaXMuZGF0YS5kYXRhICE9PSB1bmRlZmluZWQgfHwgdGhpcy5kYXRhLnVyaSAhPT0gdW5kZWZpbmVkIHx8IHRoaXMuZGF0YS5wcml2YXRlVXJpICE9PSB1bmRlZmluZWQpO1xuXHRcdGlmICghbG9hZEV4dGVuc2lvbkRhdGEgJiYgaGFzUHJlc2V0RGF0YSkge1xuXHRcdFx0dGhpcy5hcHBseUV4dGVuc2lvbklzc3VlRGF0YShleHRlbnNpb24sIHRoaXMuZGF0YSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgdGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gJiYgIXRoaXMuZGF0YS5pc3N1ZVNvdXJjZSkge1xuXHRcdFx0dGhpcy5zZXRJc3N1ZVNvdXJjZShJc3N1ZVNvdXJjZS5WU0NvZGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChsb2FkRXh0ZW5zaW9uRGF0YSAmJiB0aGlzLnJlc29sdmVFeHRlbnNpb25Jc3N1ZURhdGEpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSArK3RoaXMuZXh0ZW5zaW9uRGF0YVJlcXVlc3Q7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblN0YXR1cy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsb2FkaW5nRXh0ZW5zaW9uRGF0YScsIFwiTG9hZGluZyBleHRlbnNpb24gaXNzdWUgZGF0YS4uLlwiKTtcblx0XHRcdGNvbnN0IGlzc3VlRGF0YSA9IGF3YWl0IHRoaXMucmVzb2x2ZUV4dGVuc2lvbklzc3VlRGF0YShleHRlbnNpb24uaWQpO1xuXHRcdFx0aWYgKHJlcXVlc3QgIT09IHRoaXMuZXh0ZW5zaW9uRGF0YVJlcXVlc3QpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzc3VlRGF0YSkge1xuXHRcdFx0XHR0aGlzLmFwcGx5RXh0ZW5zaW9uSXNzdWVEYXRhKGV4dGVuc2lvbiwgaXNzdWVEYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVRhcmdldFN0YXR1cygpO1xuXHRcdHRoaXMuc2VhcmNoU2ltaWxhcklzc3VlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUV4dGVuc2lvbklzc3VlRGF0YShleHRlbnNpb246IElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhLCBpc3N1ZURhdGE6IElzc3VlUmVwb3J0ZXJEYXRhKTogdm9pZCB7XG5cdFx0ZXh0ZW5zaW9uLmRhdGEgPSBpc3N1ZURhdGEuZGF0YTtcblx0XHRleHRlbnNpb24udXJpID0gaXNzdWVEYXRhLnVyaTtcblx0XHRleHRlbnNpb24ucHJpdmF0ZVVyaSA9IGlzc3VlRGF0YS5wcml2YXRlVXJpO1xuXHRcdHRoaXMuZGF0YS5kYXRhID0gaXNzdWVEYXRhLmRhdGE7XG5cdFx0dGhpcy5kYXRhLnVyaSA9IGlzc3VlRGF0YS51cmk7XG5cdFx0dGhpcy5kYXRhLnByaXZhdGVVcmkgPSBpc3N1ZURhdGEucHJpdmF0ZVVyaTtcblx0XHR0aGlzLmRhdGEuaXNzdWVCb2R5ID0gaXNzdWVEYXRhLmlzc3VlQm9keSA/PyB0aGlzLmRhdGEuaXNzdWVCb2R5O1xuXHRcdHRoaXMuZGF0YS5pc3N1ZVRpdGxlID0gaXNzdWVEYXRhLmlzc3VlVGl0bGUgPz8gdGhpcy5kYXRhLmlzc3VlVGl0bGU7XG5cdFx0aWYgKGlzc3VlRGF0YS5pc3N1ZVRpdGxlICYmICF0aGlzLnRpdGxlSW5wdXQudmFsdWUudHJpbSgpKSB7XG5cdFx0XHR0aGlzLnRpdGxlSW5wdXQudmFsdWUgPSBpc3N1ZURhdGEuaXNzdWVUaXRsZTtcblx0XHR9XG5cdFx0aWYgKGlzc3VlRGF0YS5pc3N1ZUJvZHkgJiYgIXRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS5pbmNsdWRlcyhpc3N1ZURhdGEuaXNzdWVCb2R5KSkge1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlID0gdGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlXG5cdFx0XHRcdD8gYCR7dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlfVxcbiR7aXNzdWVEYXRhLmlzc3VlQm9keX1gXG5cdFx0XHRcdDogaXNzdWVEYXRhLmlzc3VlQm9keTtcblx0XHR9XG5cdFx0aWYgKGlzc3VlRGF0YS5kYXRhKSB7XG5cdFx0XHRleHRlbnNpb24uZXh0ZW5zaW9uRGF0YSA9IGlzc3VlRGF0YS5kYXRhO1xuXHRcdFx0dGhpcy5tb2RlbC51cGRhdGUoeyBleHRlbnNpb25EYXRhOiBpc3N1ZURhdGEuZGF0YSwgaW5jbHVkZUV4dGVuc2lvbkRhdGE6IHRydWUgfSk7XG5cdFx0XHR0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRhcmdldFN0YXR1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRhcmdldFN0YXR1cy50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuZXh0ZW5zaW9uU3RhdHVzLnRleHRDb250ZW50ID0gJyc7XG5cdFx0aWYgKCF0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZWxlY3RlZElzc3VlU291cmNlICE9PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IHJlcG8gPSB0aGlzLmdldElzc3VlVGFyZ2V0UmVwbygpO1xuXHRcdFx0dGhpcy50YXJnZXRTdGF0dXMudGV4dENvbnRlbnQgPSByZXBvXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2lzc3VlVGFyZ2V0UmVwbycsIFwiSXNzdWUgd2lsbCBiZSBjcmVhdGVkIGluIHswfS97MX0uXCIsIHJlcG8ub3duZXIsIHJlcG8ucmVwb3NpdG9yeU5hbWUpXG5cdFx0XHRcdDogJyc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNzdWVVcmwgPSB0aGlzLmdldFNlbGVjdGVkRXh0ZW5zaW9uSXNzdWVVcmwoKTtcblx0XHRpZiAoIWlzc3VlVXJsKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblN0YXR1cy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdleHRlbnNpb25Ob0lzc3VlVXJsJywgXCJUaGlzIGV4dGVuc2lvbiBkb2VzIG5vdCBwcm92aWRlIGFuIGlzc3VlIHJlcG9ydGluZyBVUkwuXCIpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuaXNHaXRIdWJVcmwoaXNzdWVVcmwpKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblN0YXR1cy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdleHRlbnNpb25FeHRlcm5hbElzc3VlVXJsJywgXCJUaGlzIGV4dGVuc2lvbiB1c2VzIGFuIGV4dGVybmFsIGlzc3VlIHJlcG9ydGVyLiBQcmV2aWV3IHdpbGwgb3BlbiB0aGF0IGlzc3VlIHJlcG9ydGVyLlwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVwbyA9IHRoaXMuZ2V0SXNzdWVUYXJnZXRSZXBvKCk7XG5cdFx0XHR0aGlzLmV4dGVuc2lvblN0YXR1cy50ZXh0Q29udGVudCA9IHJlcG9cblx0XHRcdFx0PyBsb2NhbGl6ZSgnaXNzdWVUYXJnZXRSZXBvJywgXCJJc3N1ZSB3aWxsIGJlIGNyZWF0ZWQgaW4gezB9L3sxfS5cIiwgcmVwby5vd25lciwgcmVwby5yZXBvc2l0b3J5TmFtZSlcblx0XHRcdFx0OiAnJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldElzc3VlVGFyZ2V0UmVwbygpOiB7IG93bmVyOiBzdHJpbmc7IHJlcG9zaXRvcnlOYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0VXJsID0gdGhpcy5nZXRJc3N1ZVRhcmdldFVybCgpO1xuXHRcdHJldHVybiB0YXJnZXRVcmwgPyB0aGlzLnBhcnNlR2l0SHViVXJsKHRhcmdldFVybCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGVkRXh0ZW5zaW9uSXNzdWVVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uO1xuXHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLnVyaSkge1xuXHRcdFx0cmV0dXJuIFVSSS5yZXZpdmUoZXh0ZW5zaW9uLnVyaSkudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5idWdzVXJsICYmIC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXlxcL10qKVxcLyhbXlxcL10qKVxcLz8oXFwvaXNzdWVzKT9cXC8/JC8udGVzdChleHRlbnNpb24uYnVnc1VybCkpIHtcblx0XHRcdHJldHVybiBgJHtub3JtYWxpemVHaXRIdWJVcmwoZXh0ZW5zaW9uLmJ1Z3NVcmwpfS9pc3N1ZXMvbmV3YDtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5yZXBvc2l0b3J5VXJsICYmIC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXlxcL10qKVxcLyhbXlxcL10qKVxcLz8kLy50ZXN0KGV4dGVuc2lvbi5yZXBvc2l0b3J5VXJsKSkge1xuXHRcdFx0cmV0dXJuIGAke25vcm1hbGl6ZUdpdEh1YlVybChleHRlbnNpb24ucmVwb3NpdG9yeVVybCl9L2lzc3Vlcy9uZXdgO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uLmJ1Z3NVcmwgfHwgZXh0ZW5zaW9uLnJlcG9zaXRvcnlVcmw7XG5cdH1cblxuXHRwcml2YXRlIGdldElzc3VlU291cmNlTGFiZWwoKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSkge1xuXHRcdFx0Y2FzZSBJc3N1ZVNvdXJjZS5WU0NvZGU6XG5cdFx0XHRcdHJldHVybiBwcm9kdWN0Lm5hbWVMb25nIHx8IGxvY2FsaXplKCd2c2NvZGUnLCBcIlZpc3VhbCBTdHVkaW8gQ29kZVwiKTtcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuQWdlbnRzV2luZG93OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50c1dpbmRvdycsIFwiQWdlbnRzIFdpbmRvd1wiKTtcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuRXh0ZW5zaW9uOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZWxlY3RlZEV4dGVuc2lvbj8uZGlzcGxheU5hbWUgfHwgdGhpcy5zZWxlY3RlZEV4dGVuc2lvbj8ubmFtZSB8fCBsb2NhbGl6ZSgnZXh0ZW5zaW9uU291cmNlJywgXCJBIFZTIENvZGUgZXh0ZW5zaW9uXCIpO1xuXHRcdFx0Y2FzZSBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZTpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtYXJrZXRwbGFjZScsIFwiRXh0ZW5zaW9ucyBNYXJrZXRwbGFjZVwiKTtcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuVW5rbm93bjpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd1bmtub3duU291cmNlJywgXCJEb24ndCBrbm93XCIpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd1bmtub3duJywgXCJVbmtub3duXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SXNzdWVUYXJnZXRVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFNlbGVjdGVkRXh0ZW5zaW9uSXNzdWVVcmwoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuTWFya2V0cGxhY2UpIHtcblx0XHRcdHJldHVybiBwcm9kdWN0LnJlcG9ydE1hcmtldHBsYWNlSXNzdWVVcmwgPz8gcHJvZHVjdC5yZXBvcnRJc3N1ZVVybDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZGF0YS51cmkpIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKHRoaXMuZGF0YS51cmkpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmRhdGEucHJpdmF0ZVVyaSkge1xuXHRcdFx0cmV0dXJuIFVSSS5yZXZpdmUodGhpcy5kYXRhLnByaXZhdGVVcmkpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9kdWN0LnJlcG9ydElzc3VlVXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0dpdEh1YlVybCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvXmh0dHBzPzpcXC9cXC9naXRodWJcXC5jb21cXC8vaS50ZXN0KHVybCk7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlR2l0SHViVXJsKHVybDogc3RyaW5nKTogeyBvd25lcjogc3RyaW5nOyByZXBvc2l0b3J5TmFtZTogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hdGNoID0gL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteXFwvPyNdKylcXC8oW15cXC8/I10rKS4qL2kuZXhlYyh1cmwpO1xuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IG93bmVyOiBtYXRjaFsxXSwgcmVwb3NpdG9yeU5hbWU6IG1hdGNoWzJdIH07XG5cdH1cblxuXHRwcml2YXRlIHNlYXJjaFNpbWlsYXJJc3N1ZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgIT09IFdpemFyZFN0ZXAuUmV2aWV3IHx8ICF0aGlzLnNpbWlsYXJJc3N1ZXNDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2ltaWxhcklzc3Vlc0hhbmRsZSkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuc2ltaWxhcklzc3Vlc0hhbmRsZSk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyU2ltaWxhcklzc3Vlc01lc3NhZ2UobG9jYWxpemUoJ3NlYXJjaGluZ1NpbWlsYXJJc3N1ZXMnLCBcIlNlYXJjaGluZyBzaW1pbGFyIGlzc3Vlcy4uLlwiKSk7XG5cdFx0dGhpcy5zaW1pbGFySXNzdWVzSGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLmRvU2VhcmNoU2ltaWxhcklzc3VlcygpLCAzMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1NlYXJjaFNpbWlsYXJJc3N1ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLnRpdGxlSW5wdXQudmFsdWUudHJpbSgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSArK3RoaXMuc2ltaWxhcklzc3Vlc1JlcXVlc3Q7XG5cdFx0aWYgKCF0aXRsZSB8fCAhdGhpcy5zZWxlY3RlZElzc3VlU291cmNlKSB7XG5cdFx0XHR0aGlzLnJlbmRlclNpbWlsYXJJc3N1ZXNNZXNzYWdlKGxvY2FsaXplKCdzaW1pbGFySXNzdWVzTmVlZHNUaXRsZScsIFwiRW50ZXIgYSB0aXRsZSB0byBzZWFyY2ggZm9yIHNpbWlsYXIgaXNzdWVzLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJTaW1pbGFySXNzdWVzTWVzc2FnZShsb2NhbGl6ZSgnc2VhcmNoaW5nU2ltaWxhcklzc3VlcycsIFwiU2VhcmNoaW5nIHNpbWlsYXIgaXNzdWVzLi4uXCIpKTtcblx0XHR0cnkge1xuXHRcdFx0bGV0IHJlc3VsdHM6IElTaW1pbGFySXNzdWVbXSA9IFtdO1xuXHRcdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklzc3VlVXJsID0gdGhpcy5nZXRTZWxlY3RlZEV4dGVuc2lvbklzc3VlVXJsKCk7XG5cdFx0XHRcdGNvbnN0IHJlcG8gPSBleHRlbnNpb25Jc3N1ZVVybCAmJiB0aGlzLnBhcnNlR2l0SHViVXJsKGV4dGVuc2lvbklzc3VlVXJsKTtcblx0XHRcdFx0cmVzdWx0cyA9IHJlcG8gPyBhd2FpdCB0aGlzLnNlYXJjaEdpdEh1Yklzc3VlcyhgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb3NpdG9yeU5hbWV9YCwgdGl0bGUpIDogW107XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuTWFya2V0cGxhY2UpIHtcblx0XHRcdFx0Y29uc3QgbWFya2V0cGxhY2VJc3N1ZVVybCA9IHByb2R1Y3QucmVwb3J0TWFya2V0cGxhY2VJc3N1ZVVybCA/PyBwcm9kdWN0LnJlcG9ydElzc3VlVXJsO1xuXHRcdFx0XHRjb25zdCByZXBvID0gbWFya2V0cGxhY2VJc3N1ZVVybCAmJiB0aGlzLnBhcnNlR2l0SHViVXJsKG1hcmtldHBsYWNlSXNzdWVVcmwpO1xuXHRcdFx0XHRyZXN1bHRzID0gcmVwbyA/IGF3YWl0IHRoaXMuc2VhcmNoR2l0SHViSXNzdWVzKGAke3JlcG8ub3duZXJ9LyR7cmVwby5yZXBvc2l0b3J5TmFtZX1gLCB0aXRsZSkgOiBbXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdHMgPSBhd2FpdCB0aGlzLnNlYXJjaFZTQ29kZVNpbWlsYXJJc3N1ZXModGl0bGUsIHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS50cmltKCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcXVlc3QgPT09IHRoaXMuc2ltaWxhcklzc3Vlc1JlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJTaW1pbGFySXNzdWVzKHJlc3VsdHMpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0aWYgKHJlcXVlc3QgPT09IHRoaXMuc2ltaWxhcklzc3Vlc1JlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJTaW1pbGFySXNzdWVzTWVzc2FnZShsb2NhbGl6ZSgnc2ltaWxhcklzc3Vlc1NlYXJjaEZhaWxlZCcsIFwiVW5hYmxlIHRvIHNlYXJjaCBmb3Igc2ltaWxhciBpc3N1ZXMuXCIpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlYXJjaEdpdEh1Yklzc3VlcyhyZXBvOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPElTaW1pbGFySXNzdWVbXT4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYGlzOmlzc3VlIHJlcG86JHtyZXBvfSAke3RpdGxlfWA7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9zZWFyY2gvaXNzdWVzP3E9JHtlbmNvZGVVUklDb21wb25lbnQocXVlcnkpfWApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShyZXN1bHQ/Lml0ZW1zKSA/IHJlc3VsdC5pdGVtcyA6IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWFyY2hWU0NvZGVEdXBsaWNhdGVzKHRpdGxlOiBzdHJpbmcsIGJvZHk6IHN0cmluZyk6IFByb21pc2U8SVNpbWlsYXJJc3N1ZVtdPiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly92c2NvZGUtcHJvYm90Lndlc3R1cy5jbG91ZGFwcC5henVyZS5jb206Nzg5MC9kdXBsaWNhdGVfY2FuZGlkYXRlcycsIHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyB0aXRsZSwgYm9keSB9KSxcblx0XHRcdGhlYWRlcnM6IG5ldyBIZWFkZXJzKHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocmVzdWx0Py5jYW5kaWRhdGVzKSA/IHJlc3VsdC5jYW5kaWRhdGVzIDogW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlYXJjaFZTQ29kZVNpbWlsYXJJc3N1ZXModGl0bGU6IHN0cmluZywgYm9keTogc3RyaW5nKTogUHJvbWlzZTxJU2ltaWxhcklzc3VlW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZHVwbGljYXRlcyA9IGF3YWl0IHRoaXMuc2VhcmNoVlNDb2RlRHVwbGljYXRlcyh0aXRsZSwgYm9keSk7XG5cdFx0XHRpZiAoZHVwbGljYXRlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGR1cGxpY2F0ZXM7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gR2l0SHViIHNlYXJjaCBiZWxvdy5cblx0XHR9XG5cblx0XHRjb25zdCByZXBvID0gdGhpcy5nZXRJc3N1ZVRhcmdldFJlcG8oKTtcblx0XHRyZXR1cm4gcmVwbyA/IHRoaXMuc2VhcmNoR2l0SHViSXNzdWVzKGAke3JlcG8ub3duZXJ9LyR7cmVwby5yZXBvc2l0b3J5TmFtZX1gLCB0aXRsZSkgOiBbXTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2ltaWxhcklzc3Vlc01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNldFNpbWlsYXJJc3N1ZXNDb250YWluZXIoKTtcblx0XHRjb25zdCBzdGF0dXMgPSBhcHBlbmQodGhpcy5zaW1pbGFySXNzdWVzQ29udGFpbmVyLCAkKCdkaXYud2l6YXJkLXNpbWlsYXItc3RhdHVzJykpO1xuXHRcdHN0YXR1cy50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNpbWlsYXJJc3N1ZXMocmVzdWx0czogSVNpbWlsYXJJc3N1ZVtdKTogdm9pZCB7XG5cdFx0aWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5yZW5kZXJTaW1pbGFySXNzdWVzTWVzc2FnZShsb2NhbGl6ZSgnbm9TaW1pbGFySXNzdWVzJywgXCJObyBzaW1pbGFyIGlzc3VlcyBmb3VuZC5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVzZXRTaW1pbGFySXNzdWVzQ29udGFpbmVyKCk7XG5cdFx0Y29uc3QgbGlzdCA9IGFwcGVuZCh0aGlzLnNpbWlsYXJJc3N1ZXNDb250YWluZXIsICQoJ3VsLndpemFyZC1zaW1pbGFyLWxpc3QnKSk7XG5cdFx0Zm9yIChjb25zdCBpc3N1ZSBvZiByZXN1bHRzLnNsaWNlKDAsIE1BWF9TSU1JTEFSX0lTU1VFUykpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBhcHBlbmQobGlzdCwgJCgnbGkud2l6YXJkLXNpbWlsYXItaXRlbScpKTtcblx0XHRcdGNvbnN0IGxpbmsgPSBhcHBlbmQoaXRlbSwgJCgnYS53aXphcmQtc2ltaWxhci1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdFx0bGluay5ocmVmID0gaXNzdWUuaHRtbF91cmw7XG5cdFx0XHRsaW5rLnRleHRDb250ZW50ID0gaXNzdWUudGl0bGU7XG5cdFx0XHRsaW5rLnRpdGxlID0gaXNzdWUudGl0bGU7XG5cdFx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5vcGVuRXh0ZXJuYWxMaW5rPy4oaXNzdWUuaHRtbF91cmwpO1xuXHRcdFx0fSkpO1xuXHRcdFx0aWYgKGlzc3VlLnN0YXRlKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gYXBwZW5kKGl0ZW0sICQoJ3NwYW4ud2l6YXJkLXNpbWlsYXItc3RhdGUnKSk7XG5cdFx0XHRcdHN0YXRlLnRleHRDb250ZW50ID0gaXNzdWUuc3RhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIENsZWFyIHRoZSBzaW1pbGFyLWlzc3VlcyBjb250YWluZXIgYW5kIHJlLXJlbmRlciB0aGUgc2VjdGlvbiBoZWFkaW5nLiAqL1xuXHRwcml2YXRlIHJlc2V0U2ltaWxhcklzc3Vlc0NvbnRhaW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2ltaWxhcklzc3Vlc0NvbnRhaW5lci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGNvbnN0IGhlYWRpbmcgPSBhcHBlbmQodGhpcy5zaW1pbGFySXNzdWVzQ29udGFpbmVyLCAkKCdkaXYud2l6YXJkLXNpbWlsYXItaGVhZGluZycpKTtcblx0XHRoZWFkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3NpbWlsYXJJc3N1ZXMnLCBcIlNpbWlsYXIgSXNzdWVzXCIpO1xuXHR9XG5cblx0LyoqIFVwZGF0ZSB0aGUgZ3VpZGFuY2UgdGV4dCBhYm92ZSB0aGUgZGVzY3JpcHRpb24gYmFzZWQgb24gc2VsZWN0ZWQgY2F0ZWdvcnkgKi9cblx0cHJpdmF0ZSB1cGRhdGVEZXNjcmlwdGlvbkd1aWRhbmNlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtkb3duSGludCA9IGxvY2FsaXplKCdtYXJrZG93blN1cHBvcnRlZCcsIFwiTWFya2Rvd24gZm9ybWF0dGluZyBpcyBzdXBwb3J0ZWQuXCIpO1xuXHRcdGNvbnN0IHBlcmZXaWtpVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3dpa2kvUGVyZm9ybWFuY2UtSXNzdWVzJztcblxuXHRcdC8vIFJlc2V0IGJlZm9yZSB1cGRhdGluZ1xuXHRcdHRoaXMuZGVzY3JpcHRpb25HdWlkYW5jZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlLmNsYXNzTGlzdC5yZW1vdmUoJ3dpemFyZC1kZXNjcmlwdGlvbi1ndWlkYW5jZS13aXRoLWxpbmsnKTtcblxuXHRcdGNvbnN0IGFwcGVuZFRleHQgPSAodGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXREb2N1bWVudCA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuZG9jdW1lbnQ7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uR3VpZGFuY2UuYXBwZW5kQ2hpbGQodGFyZ2V0RG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCkpO1xuXHRcdH07XG5cblx0XHRzd2l0Y2ggKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUpIHtcblx0XHRcdGNhc2UgSXNzdWVUeXBlLkJ1Zzpcblx0XHRcdFx0YXBwZW5kVGV4dChgJHtsb2NhbGl6ZSgnYnVnR3VpZGFuY2UnLCBcIkRlc2NyaWJlIHdoYXQgaGFwcGVuZWQsIHRoZSBzdGVwcyB0byByZXByb2R1Y2UsIHdoYXQgeW91IGV4cGVjdGVkLCBhbmQgd2hhdCB5b3Ugb2JzZXJ2ZWQgaW5zdGVhZC5cIil9XFxuJHttYXJrZG93bkhpbnR9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3Q6XG5cdFx0XHRcdGFwcGVuZFRleHQoYCR7bG9jYWxpemUoJ2ZlYXR1cmVHdWlkYW5jZScsIFwiRGVzY3JpYmUgdGhlIGZlYXR1cmUgeW91J2QgbGlrZSB0byBzZWUsIHdoYXQgcHJvYmxlbSBpdCB3b3VsZCBzb2x2ZSwgYW5kIGFueSBhbHRlcm5hdGl2ZXMgeW91J3ZlIGNvbnNpZGVyZWQuXCIpfVxcbiR7bWFya2Rvd25IaW50fWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWU6IHtcblx0XHRcdFx0YXBwZW5kVGV4dChgJHtsb2NhbGl6ZSgncGVyZkd1aWRhbmNlJywgXCJEZXNjcmliZSB3aGF0IGlzIHNsb3csIHdoZW4gaXQgaGFwcGVucywgd2hldGhlciBpdCdzIGNvbnNpc3RlbnQgb3IgaW50ZXJtaXR0ZW50LCBhbmQgYW55IHBhdHRlcm5zIHlvdSd2ZSBub3RpY2VkLlwiKX0gYCk7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSAkKCdhLndpemFyZC1kZXNjcmlwdGlvbi1ndWlkYW5jZS1saW5rJykgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0XHRcdGxpbmsuaHJlZiA9IHBlcmZXaWtpVXJsO1xuXHRcdFx0XHRsaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BlcmZXaWtpTGluaycsIFwiU2VlIHRoZSBwZXJmb3JtYW5jZSBpc3N1ZSByZXBvcnRpbmcgZ3VpZGUuXCIpO1xuXHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uR3VpZGFuY2VEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMub3BlbkV4dGVybmFsTGluaz8uKHBlcmZXaWtpVXJsKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uR3VpZGFuY2UuYXBwZW5kQ2hpbGQobGluayk7XG5cdFx0XHRcdGFwcGVuZFRleHQoYFxcbiR7bWFya2Rvd25IaW50fWApO1xuXHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uR3VpZGFuY2UuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLWRlc2NyaXB0aW9uLWd1aWRhbmNlLXdpdGgtbGluaycpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGFwcGVuZFRleHQoYCR7bG9jYWxpemUoJ2RlZmF1bHRHdWlkYW5jZScsIFwiU2VsZWN0IGEgY2F0ZWdvcnkgYWJvdmUsIHRoZW4gZGVzY3JpYmUgeW91ciBmZWVkYmFjayBpbiBkZXRhaWwuXCIpfVxcbiR7bWFya2Rvd25IaW50fWApO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhc0Rlc2NyaXB0aW9uQ29udGVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVHZW5lcmF0ZVRpdGxlQnV0dG9uU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmdlbmVyYXRlVGl0bGVCdG4gfHwgdGhpcy5nZW5lcmF0ZVRpdGxlQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdsb2FkaW5nJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5nZW5lcmF0ZVRpdGxlQnRuLmVuYWJsZWQgPSB0aGlzLmhhc0Rlc2NyaXB0aW9uQ29udGVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVGaWVsZEVycm9yKHBhcmVudDogSFRNTEVsZW1lbnQsIG1lc3NhZ2U6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBlcnJvciA9IGFwcGVuZChwYXJlbnQsICQoJ2Rpdi53aXphcmQtZmllbGQtZXJyb3IuaGlkZGVuJykpO1xuXHRcdGVycm9yLnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHRlcnJvci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYWxlcnQnKTtcblx0XHRyZXR1cm4gZXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIHNldEZpZWxkRXJyb3IoZmllbGQ6IEhUTUxFbGVtZW50LCBlcnJvcjogSFRNTEVsZW1lbnQsIGhhc0Vycm9yOiBib29sZWFuKTogdm9pZCB7XG5cdFx0ZmllbGQuY2xhc3NMaXN0LnRvZ2dsZSgnaW52YWxpZC1pbnB1dCcsIGhhc0Vycm9yKTtcblx0XHRlcnJvci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhaGFzRXJyb3IpO1xuXHR9XG5cblx0Ly8gU3RlcCAyOiBSZXZpZXcgJiBTdWJtaXRcblx0cHJpdmF0ZSBjcmVhdGVTdGVwMlJldmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBwYWdlID0gYXBwZW5kKHRoaXMuc3RlcENvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zdGVwLndpemFyZC1zdGVwLXJldmlldycpKTtcblx0XHR0aGlzLnN0ZXBQYWdlcy5wdXNoKHBhZ2UpO1xuXG5cdFx0Y29uc3QgaGVhZGluZyA9IGFwcGVuZChwYWdlLCAkKCdoMi53aXphcmQtaGVhZGluZycpKTtcblx0XHRoZWFkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Jldmlld1N1Ym1pdCcsIFwiUmV2aWV3IGFuZCBzdWJtaXRcIik7XG5cblx0XHQvLyBSZXZpZXcgZGV0YWlscyAoZmlsbGVkIGR5bmFtaWNhbGx5KSB3aXRoIGNvbXBhY3QgaG9yaXpvbnRhbCBsYXlvdXRcblx0XHRhcHBlbmQocGFnZSwgJCgnZGl2LndpemFyZC1yZXZpZXctZGV0YWlscycpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFdmVudEhhbmRsZXJzKCk6IHZvaWQge1xuXHRcdC8vIEJhY2tcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmJhY2tCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmdvQmFjaygpKSk7XG5cblx0XHQvLyBOZXh0XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5uZXh0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5nb05leHQoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnb0JhY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPiBXaXphcmRTdGVwLkF0dGFjaG1lbnRzKSB7XG5cdFx0XHR0aGlzLnNldFN0ZXAodGhpcy5jdXJyZW50U3RlcCAtIDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ29OZXh0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwID09PSBXaXphcmRTdGVwLkRlc2NyaWJlKSB7XG5cdFx0XHR0aGlzLmRpZEF0dGVtcHREZXNjcmliZVN1Ym1pdCA9IHRydWU7XG5cdFx0XHRjb25zdCBoYXNJc3N1ZVNvdXJjZSA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaGFzRXh0ZW5zaW9uID0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlICE9PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gfHwgISF0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uO1xuXHRcdFx0Y29uc3QgaGFzRXh0ZW5zaW9uSXNzdWVVcmwgPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgIT09IElzc3VlU291cmNlLkV4dGVuc2lvbiB8fCAhdGhpcy5zZWxlY3RlZEV4dGVuc2lvbiB8fCAhIXRoaXMuZ2V0U2VsZWN0ZWRFeHRlbnNpb25Jc3N1ZVVybCgpO1xuXHRcdFx0Y29uc3QgaGFzSXNzdWVUeXBlID0gdGhpcy5zZWxlY3RlZElzc3VlVHlwZSAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaGFzRGVzY3JpcHRpb24gPSB0aGlzLmhhc0Rlc2NyaXB0aW9uQ29udGVudCgpO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSB0aGlzLnRpdGxlSW5wdXQudmFsdWUudHJpbSgpO1xuXG5cdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy5zb3VyY2VCdXR0b25Hcm91cCwgdGhpcy5zb3VyY2VFcnJvciwgIWhhc0lzc3VlU291cmNlKTtcblx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLmV4dGVuc2lvbkZpZWxkLCB0aGlzLmV4dGVuc2lvbkVycm9yLCAhaGFzRXh0ZW5zaW9uIHx8ICFoYXNFeHRlbnNpb25Jc3N1ZVVybCk7XG5cdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy50eXBlQnV0dG9uR3JvdXAsIHRoaXMudHlwZUVycm9yLCAhaGFzSXNzdWVUeXBlKTtcblx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEsIHRoaXMuZGVzY3JpcHRpb25FcnJvciwgIWhhc0Rlc2NyaXB0aW9uKTtcblx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLnRpdGxlSW5wdXQuZWxlbWVudCwgdGhpcy50aXRsZUVycm9yLCAhdGl0bGUpO1xuXG5cdFx0XHRpZiAoIWhhc0lzc3VlU291cmNlIHx8ICFoYXNFeHRlbnNpb24gfHwgIWhhc0V4dGVuc2lvbklzc3VlVXJsIHx8ICFoYXNJc3N1ZVR5cGUgfHwgIWhhc0Rlc2NyaXB0aW9uIHx8ICF0aXRsZSkge1xuXHRcdFx0XHRpZiAoIWhhc0lzc3VlU291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5pc3N1ZVNvdXJjZUJ1dHRvbnMuZmluZChidXR0b24gPT4gIWJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnaGlkZGVuJykpPy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWhhc0V4dGVuc2lvbiB8fCAhaGFzRXh0ZW5zaW9uSXNzdWVVcmwpIHtcblx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvblNlbGVjdC5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFoYXNJc3N1ZVR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLmlzc3VlVHlwZUJ1dHRvbnNbMF0/LmVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmICghaGFzRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEuZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnRpdGxlSW5wdXQuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlRmxhZ3MoKTtcblx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaXNzdWVEZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlLnRyaW0oKSB9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdC8vIERlZmVuc2l2ZTogaWYgdXNlciBtYW5hZ2VkIHRvIGludm9rZSBnb05leHQgd2hpbGUgZGlhZ25vc3RpY3MgYXJlXG5cdFx0XHQvLyBzdGlsbCBsb2FkaW5nIChlLmcuIHZpYSBDbWQvQ3RybCtFbnRlciksIGJsb2NrIHRoZSBzdWJtaXQuIFRoZVxuXHRcdFx0Ly8gUHJldmlldyBidXR0b24gaXMgYWxzbyB2aXN1YWxseSBkaXNhYmxlZCBpbiB0aGlzIHN0YXRlLlxuXHRcdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlICYmICghdGhpcy5wZXJmb3JtYW5jZUluZm9Mb2FkZWQgfHwgdGhpcy5wZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnN1Ym1pdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwIDwgV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdHRoaXMuc2V0U3RlcCh0aGlzLmN1cnJlbnRTdGVwICsgMSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGVwKHN0ZXA6IFdpemFyZFN0ZXApOiB2b2lkIHtcblx0XHRjb25zdCBvbGRTdGVwID0gdGhpcy5jdXJyZW50U3RlcDtcblx0XHR0aGlzLmN1cnJlbnRTdGVwID0gc3RlcDtcblxuXHRcdGNvbnN0IG9sZFBhZ2UgPSB0aGlzLnN0ZXBQYWdlc1tvbGRTdGVwXTtcblx0XHRjb25zdCBuZXdQYWdlID0gdGhpcy5zdGVwUGFnZXNbc3RlcF07XG5cblx0XHQvLyBJbW1lZGlhdGUgdHJhbnNpdGlvbiB3aXRoIG5vIGFuaW1hdGlvblxuXHRcdG9sZFBhZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRuZXdQYWdlLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cblx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXG5cdFx0aWYgKHN0ZXAgPT09IFdpemFyZFN0ZXAuRGVzY3JpYmUpIHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAoc3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdHRoaXMudXBkYXRlUmV2aWV3RGV0YWlscygpO1xuXHRcdFx0dGhpcy5zZWFyY2hTaW1pbGFySXNzdWVzKCk7XG5cdFx0XHR0aGlzLndpemFyZFBhbmVsLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEF0dGFjaG1lbnRzOiBmb2N1cyB0aGUgcGFuZWwgc28ga2V5Ym9hcmQgc2hvcnRjdXRzIHdvcmtcblx0XHRcdHRoaXMud2l6YXJkUGFuZWwuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0ZXBVSSgpOiB2b2lkIHtcblx0XHRjb25zdCBzdGVwTnVtID0gdGhpcy5jdXJyZW50U3RlcCArIDE7XG5cdFx0dGhpcy5zdGVwSW5kaWNhdG9yLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3N0ZXBPZicsIFwiU3RlcCB7MH0gb2YgezF9XCIsIHN0ZXBOdW0sIFNURVBfQ09VTlQpO1xuXG5cdFx0Y29uc3Qgc3RlcE5hbWVzID0gW1xuXHRcdFx0bG9jYWxpemUoJ3NjcmVlbnNob3RzJywgXCJBdHRhY2htZW50c1wiKSxcblx0XHRcdGxvY2FsaXplKCdjb21wb3NlTWVzc2FnZScsIFwiRGVzY3JpYmVcIiksXG5cdFx0XHRsb2NhbGl6ZSgnc3VibWl0JywgXCJSZXZpZXdcIiksXG5cdFx0XTtcblx0XHR0aGlzLnN0ZXBMYWJlbC50ZXh0Q29udGVudCA9IHN0ZXBOYW1lc1t0aGlzLmN1cnJlbnRTdGVwXTtcblxuXHRcdC8vIFVwZGF0ZSBwcm9ncmVzcyBkb3RzXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnByb2dyZXNzRG90cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5wcm9ncmVzc0RvdHNbaV0uY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaSA9PT0gdGhpcy5jdXJyZW50U3RlcCk7XG5cdFx0XHR0aGlzLnByb2dyZXNzRG90c1tpXS5jbGFzc0xpc3QudG9nZ2xlKCdjb21wbGV0ZWQnLCBpIDwgdGhpcy5jdXJyZW50U3RlcCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdy9oaWRlIHBhZ2VzXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0ZXBQYWdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGkgPT09IHRoaXMuY3VycmVudFN0ZXApIHtcblx0XHRcdFx0dGhpcy5zdGVwUGFnZXNbaV0uc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuc3RlcFBhZ2VzW2ldLmNsYXNzTGlzdC5jb250YWlucygnc2xpZGUtb3V0LWxlZnQnKSAmJiAhdGhpcy5zdGVwUGFnZXNbaV0uY2xhc3NMaXN0LmNvbnRhaW5zKCdzbGlkZS1vdXQtcmlnaHQnKSkge1xuXHRcdFx0XHR0aGlzLnN0ZXBQYWdlc1tpXS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJhY2sgYnV0dG9uIHZpc2liaWxpdHlcblx0XHR0aGlzLmJhY2tCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gdGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5BdHRhY2htZW50cyA/ICdub25lJyA6ICcnO1xuXHRcdGlmICh0aGlzLmNsb3NlQnV0dG9uKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50RHJhZnRQcmV2aWV3ZWQgPSB0aGlzLnByZXZpZXdlZERyYWZ0S2V5ID09PSB0aGlzLmdldERyYWZ0S2V5KCk7XG5cdFx0XHR0aGlzLmNsb3NlQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IHRoaXMucHJldmlld09wZW5lZCAmJiBjdXJyZW50RHJhZnRQcmV2aWV3ZWQgJiYgdGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcgPyAnJyA6ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBOZXh0IGJ1dHRvbiBsYWJlbFxuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwID09PSBXaXphcmRTdGVwLlJldmlldykge1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWxFeHRlbnNpb25VcmwgPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLkV4dGVuc2lvbiAmJiB0aGlzLmdldElzc3VlVGFyZ2V0VXJsKCkgJiYgIXRoaXMuaXNHaXRIdWJVcmwodGhpcy5nZXRJc3N1ZVRhcmdldFVybCgpISk7XG5cdFx0XHRjb25zdCB3YWl0aW5nRm9yRGF0YSA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlICYmICghdGhpcy5wZXJmb3JtYW5jZUluZm9Mb2FkZWQgfHwgdGhpcy5wZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nKTtcblx0XHRcdGlmICh3YWl0aW5nRm9yRGF0YSkge1xuXHRcdFx0XHR0aGlzLm5leHRCdXR0b24ubGFiZWwgPSBgJChsb2FkaW5nfnNwaW4pICR7bG9jYWxpemUoJ2xvYWRpbmdEaWFnbm9zdGljcycsIFwiTG9hZGluZyBkaWFnbm9zdGljcy4uLlwiKX1gO1xuXHRcdFx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC50aXRsZSA9IGxvY2FsaXplKCd3YWl0aW5nRm9yRGlhZ25vc3RpY3MnLCBcIldhaXRpbmcgZm9yIHBlcmZvcm1hbmNlIGRpYWdub3N0aWNzIHRvIGZpbmlzaCBsb2FkaW5nXCIpO1xuXHRcdFx0XHR0aGlzLm5leHRCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmxhYmVsID0gZXh0ZXJuYWxFeHRlbnNpb25Vcmxcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdvcGVuRXh0ZXJuYWxJc3N1ZVJlcG9ydGVyJywgXCJPcGVuIEV4dGVybmFsIElzc3VlIFJlcG9ydGVyXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJldmlld09uR2l0SHViJywgXCJQcmV2aWV3IG9uIEdpdEh1YlwiKTtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQudGl0bGUgPSB0aGlzLm5leHRCdXR0b24ubGFiZWw7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuQXR0YWNobWVudHMpIHtcblx0XHRcdHRoaXMubmV4dEJ1dHRvbi5sYWJlbCA9IHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpID09PSAwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3NraXAnLCBcIlNraXBcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbmV4dCcsIFwiTmV4dFwiKTtcblx0XHRcdHRoaXMubmV4dEJ1dHRvbi5lbGVtZW50LnRpdGxlID0gdGhpcy5uZXh0QnV0dG9uLmxhYmVsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV4dCcsIFwiTmV4dFwiKTtcblx0XHRcdHRoaXMubmV4dEJ1dHRvbi5lbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ25leHQnLCBcIk5leHRcIik7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdy9oaWRlIGNhcHR1cmUgc3RyaXAgKG9ubHkgb24gYXR0YWNobWVudHMgc3RlcClcblx0XHR0aGlzLnVwZGF0ZUNhcHR1cmVTdHJpcFZpc2liaWxpdHkoKTtcblx0XHQvLyBSZWZsZWN0IHJlY29yZGluZyBzdGF0ZSBvbiBuZXh0IGJ1dHRvblxuXHRcdHRoaXMudXBkYXRlTmV4dEJ1dHRvbkZvclJlY29yZGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSZXZpZXdEZXRhaWxzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhZ2UgPSB0aGlzLnN0ZXBQYWdlc1tXaXphcmRTdGVwLlJldmlld107XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZGV0YWlscyA9IHBhZ2UucXVlcnlTZWxlY3RvcignLndpemFyZC1yZXZpZXctZGV0YWlscycpO1xuXHRcdGlmICghZGV0YWlscykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJldmlld1JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0ZGV0YWlscy50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0Y29uc3Qgc2ltaWxhclNlY3Rpb24gPSBhcHBlbmQoZGV0YWlscyBhcyBIVE1MRWxlbWVudCwgJCgnZGl2LnJldmlldy1zZWN0aW9uLndpemFyZC1yZXZpZXctc2ltaWxhci1zZWN0aW9uJykpO1xuXHRcdHRoaXMuc2ltaWxhcklzc3Vlc0NvbnRhaW5lciA9IGFwcGVuZChzaW1pbGFyU2VjdGlvbiwgJCgnZGl2LndpemFyZC1zaW1pbGFyLWlzc3VlcycpKTtcblx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0dGhpcy5yZW5kZXJTaW1pbGFySXNzdWVzTWVzc2FnZShsb2NhbGl6ZSgnc2VhcmNoaW5nU2ltaWxhcklzc3VlcycsIFwiU2VhcmNoaW5nIHNpbWlsYXIgaXNzdWVzLi4uXCIpKTtcblxuXHRcdGNvbnN0IHNvdXJjZVNlY3Rpb24gPSBhcHBlbmQoZGV0YWlscyBhcyBIVE1MRWxlbWVudCwgJCgnZGl2LnJldmlldy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IHNvdXJjZUxhYmVsID0gYXBwZW5kKHNvdXJjZVNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctbGFiZWwnKSk7XG5cdFx0c291cmNlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndGFyZ2V0JywgXCJUYXJnZXRcIik7XG5cdFx0Y29uc3Qgc291cmNlVmFsdWUgPSBhcHBlbmQoc291cmNlU2VjdGlvbiwgJCgnZGl2LnJldmlldy12YWx1ZScpKTtcblx0XHRzb3VyY2VWYWx1ZS50ZXh0Q29udGVudCA9IHRoaXMuZ2V0SXNzdWVTb3VyY2VMYWJlbCgpO1xuXG5cdFx0Y29uc3QgY2F0U2VjdGlvbiA9IGFwcGVuZChkZXRhaWxzIGFzIEhUTUxFbGVtZW50LCAkKCdkaXYucmV2aWV3LXNlY3Rpb24nKSk7XG5cdFx0Y29uc3QgY2F0TGFiZWwgPSBhcHBlbmQoY2F0U2VjdGlvbiwgJCgnZGl2LnJldmlldy1sYWJlbCcpKTtcblx0XHRjYXRMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjYXRlZ29yeScsIFwiQ2F0ZWdvcnlcIik7XG5cdFx0Y29uc3QgY2F0VmFsdWUgPSBhcHBlbmQoY2F0U2VjdGlvbiwgJCgnZGl2LnJldmlldy12YWx1ZScpKTtcblx0XHRjb25zdCB0eXBlTGFiZWxzOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuXHRcdFx0W0lzc3VlVHlwZS5CdWddOiBsb2NhbGl6ZSgnYnVnJywgXCJCdWdcIiksXG5cdFx0XHRbSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0XTogbG9jYWxpemUoJ2ZlYXR1cmVSZXF1ZXN0JywgXCJGZWF0dXJlIFJlcXVlc3RcIiksXG5cdFx0XHRbSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWVdOiBsb2NhbGl6ZSgncGVyZm9ybWFuY2VJc3N1ZScsIFwiUGVyZm9ybWFuY2UgSXNzdWVcIiksXG5cdFx0fTtcblx0XHRjYXRWYWx1ZS50ZXh0Q29udGVudCA9ICh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlICE9PSB1bmRlZmluZWQgPyB0eXBlTGFiZWxzW3RoaXMuc2VsZWN0ZWRJc3N1ZVR5cGVdIDogdW5kZWZpbmVkKSA/PyBsb2NhbGl6ZSgndW5rbm93bicsIFwiVW5rbm93blwiKTtcblxuXHRcdGNvbnN0IHRpdGxlU2VjdGlvbiA9IGFwcGVuZChkZXRhaWxzIGFzIEhUTUxFbGVtZW50LCAkKCdkaXYucmV2aWV3LXNlY3Rpb24nKSk7XG5cdFx0Y29uc3QgdGl0bGVMYWJlbCA9IGFwcGVuZCh0aXRsZVNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctbGFiZWwnKSk7XG5cdFx0dGl0bGVMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdpc3N1ZVRpdGxlJywgXCJUaXRsZVwiKTtcblx0XHRjb25zdCB0aXRsZVZhbHVlID0gYXBwZW5kKHRpdGxlU2VjdGlvbiwgJCgnZGl2LnJldmlldy12YWx1ZScpKTtcblx0XHR0aXRsZVZhbHVlLnRleHRDb250ZW50ID0gdGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKSB8fCBsb2NhbGl6ZSgnbm9UaXRsZScsIFwiKG5vIHRpdGxlKVwiKTtcblxuXHRcdGNvbnN0IGRlc2NTZWN0aW9uID0gYXBwZW5kKGRldGFpbHMgYXMgSFRNTEVsZW1lbnQsICQoJ2Rpdi5yZXZpZXctc2VjdGlvbicpKTtcblx0XHRjb25zdCBkZXNjTGFiZWwgPSBhcHBlbmQoZGVzY1NlY3Rpb24sICQoJ2Rpdi5yZXZpZXctbGFiZWwnKSk7XG5cdFx0ZGVzY0xhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Rlc2NyaXB0aW9uJywgXCJEZXNjcmlwdGlvblwiKTtcblx0XHRjb25zdCBkZXNjVmFsdWUgPSBhcHBlbmQoZGVzY1NlY3Rpb24sICQoJ2Rpdi5yZXZpZXctdmFsdWUucmV2aWV3LWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlLnRyaW0oKTtcblx0XHRpZiAoZGVzY3JpcHRpb24gJiYgdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZSkge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKFxuXHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoZGVzY3JpcHRpb24pLFxuXHRcdFx0XHR7IG1hcmtlZE9wdGlvbnM6IHsgYnJlYWtzOiB0cnVlIH0gfSxcblx0XHRcdCk7XG5cdFx0XHRhcHBlbmQoZGVzY1ZhbHVlLCByZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5yZXZpZXdSZW5kZXJEaXNwb3NhYmxlcy5hZGQocmVuZGVyZWRNYXJrZG93bik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlc2NWYWx1ZS50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uIHx8IGxvY2FsaXplKCdub0Rlc2NyaXB0aW9uJywgXCIobm8gZGVzY3JpcHRpb24pXCIpO1xuXHRcdH1cblxuXHRcdC8vIEF0dGFjaG1lbnRzIHJvdyB3aXRoIGZ1bGwtc2l6ZSBjbGlja2FibGUgdGh1bWJuYWlsc1xuXHRcdGNvbnN0IHRvdGFsQXR0YWNobWVudHMgPSB0aGlzLnNjcmVlbnNob3RzLmxlbmd0aCArIHRoaXMucmVjb3JkaW5ncy5sZW5ndGg7XG5cdFx0aWYgKHRvdGFsQXR0YWNobWVudHMgPiAwKSB7XG5cdFx0XHRjb25zdCBhdHRhY2hTZWN0aW9uID0gYXBwZW5kKGRldGFpbHMgYXMgSFRNTEVsZW1lbnQsICQoJ2Rpdi5yZXZpZXctc2VjdGlvbicpKTtcblx0XHRcdGNvbnN0IGF0dGFjaExhYmVsID0gYXBwZW5kKGF0dGFjaFNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctbGFiZWwnKSk7XG5cdFx0XHRhdHRhY2hMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhdHRhY2htZW50cycsIFwiQXR0YWNobWVudHMgKHswfSlcIiwgdG90YWxBdHRhY2htZW50cyk7XG5cdFx0XHRjb25zdCB0aHVtYlJvdyA9IGFwcGVuZChhdHRhY2hTZWN0aW9uLCAkKCdkaXYucmV2aWV3LXRodW1ibmFpbHMnKSk7XG5cdFx0XHR0aGlzLnJldmlld1RodW1iQ2FyZHMgPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNjcmVlbnNob3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHMgPSB0aGlzLnNjcmVlbnNob3RzW2ldO1xuXHRcdFx0XHRjb25zdCBjYXJkID0gYXBwZW5kKHRodW1iUm93LCAkKCdkaXYud2l6YXJkLXNjcmVlbnNob3QtY2FyZC5yZXZpZXctYXR0YWNobWVudC1jYXJkJykpO1xuXHRcdFx0XHRjb25zdCBpbWcgPSBhcHBlbmQoY2FyZCwgJCgnaW1nJykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRcdGltZy5zcmMgPSBzLmFubm90YXRlZERhdGFVcmwgPz8gcy5kYXRhVXJsO1xuXHRcdFx0XHRpbWcuYWx0ID0gbG9jYWxpemUoJ3NjcmVlbnNob3RBbHQnLCBcIlNjcmVlbnNob3QgezB9XCIsIGkgKyAxKTtcblxuXHRcdFx0XHQvLyBQcm9ncmVzcyBvdmVybGF5IChoaWRkZW4gaW5pdGlhbGx5KVxuXHRcdFx0XHRjb25zdCBwcm9ncmVzc092ZXJsYXkgPSBhcHBlbmQoY2FyZCwgJCgnZGl2LnJldmlldy1wcm9ncmVzcy1vdmVybGF5JykpO1xuXHRcdFx0XHRhcHBlbmQocHJvZ3Jlc3NPdmVybGF5LCAkKCdkaXYucmV2aWV3LXByb2dyZXNzLXJpbmcnKSk7XG5cblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy51cGxvYWRpbmcpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdE9wZW5TY3JlZW5zaG90LmZpcmUocyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMucmV2aWV3VGh1bWJDYXJkcy5wdXNoKGNhcmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVjb3JkaW5ncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCByZWMgPSB0aGlzLnJlY29yZGluZ3NbaV07XG5cdFx0XHRcdGNvbnN0IGNhcmQgPSB0aGlzLnJlbmRlclJlY29yZGluZ0NhcmQodGh1bWJSb3csIHJlYywgaSk7XG5cdFx0XHRcdGNhcmQuY2xhc3NMaXN0LmFkZCgncmV2aWV3LWF0dGFjaG1lbnQtY2FyZCcpO1xuXG5cdFx0XHRcdGNvbnN0IHByb2dyZXNzT3ZlcmxheSA9IGFwcGVuZChjYXJkLCAkKCdkaXYucmV2aWV3LXByb2dyZXNzLW92ZXJsYXknKSk7XG5cdFx0XHRcdGFwcGVuZChwcm9ncmVzc092ZXJsYXksICQoJ2Rpdi5yZXZpZXctcHJvZ3Jlc3MtcmluZycpKTtcblxuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLnVwbG9hZGluZykge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0T3BlblJlY29yZGluZy5maXJlKHJlYy5maWxlUGF0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMucmV2aWV3VGh1bWJDYXJkcy5wdXNoKGNhcmQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERpYWdub3N0aWMgZGF0YSBzZWN0aW9ucyB3aXRoIGNoZWNrYm94ZXMgYW5kIGNvbGxhcHNpYmxlIGRldGFpbHNcblx0XHRjb25zdCBkaWFnQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMgYXMgSFRNTEVsZW1lbnQsICQoJ2Rpdi5yZXZpZXctZGlhZ25vc3RpY3MnKSk7XG5cblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLm1vZGVsLmdldERhdGEoKTtcblx0XHRsZXQgZGlhZ25vc3RpY1NlY3Rpb25Db3VudCA9IDA7XG5cblx0XHQvLyBTeXN0ZW0gSW5mb1xuXHRcdGlmIChtb2RlbERhdGEudmVyc2lvbkluZm8gfHwgbW9kZWxEYXRhLnN5c3RlbUluZm8pIHtcblx0XHRcdGRpYWdub3N0aWNTZWN0aW9uQ291bnQrKztcblx0XHRcdHRoaXMuY3JlYXRlRGlhZ1NlY3Rpb24oZGlhZ0NvbnRhaW5lciwge1xuXHRcdFx0XHRpZDogJ3N5c3RlbS1pbmZvJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzeXN0ZW1JbmZvcm1hdGlvbicsIFwiU3lzdGVtIEluZm9ybWF0aW9uXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmluY2x1ZGVTeXN0ZW1JbmZvLFxuXHRcdFx0XHRvblRvZ2dsZTogKGNoZWNrZWQpID0+IHtcblx0XHRcdFx0XHR0aGlzLmluY2x1ZGVTeXN0ZW1JbmZvID0gY2hlY2tlZDtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGluY2x1ZGVTeXN0ZW1JbmZvOiBjaGVja2VkIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3lzVGFibGUgPSBhcHBlbmQoY29udGFpbmVyLCAkKCd0YWJsZS5yZXZpZXctZGlhZy10YWJsZScpKTtcblx0XHRcdFx0XHRpZiAobW9kZWxEYXRhLnZlcnNpb25JbmZvKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdWUyBDb2RlJywgbW9kZWxEYXRhLnZlcnNpb25JbmZvLnZzY29kZVZlcnNpb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5hZGREaWFnUm93KHN5c1RhYmxlLCAnT1MnLCBtb2RlbERhdGEudmVyc2lvbkluZm8ub3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobW9kZWxEYXRhLnN5c3RlbUluZm8pIHtcblx0XHRcdFx0XHRcdHRoaXMuYWRkRGlhZ1JvdyhzeXNUYWJsZSwgJ0NQVXMnLCBtb2RlbERhdGEuc3lzdGVtSW5mby5jcHVzID8/ICcnKTtcblx0XHRcdFx0XHRcdHRoaXMuYWRkRGlhZ1JvdyhzeXNUYWJsZSwgJ01lbW9yeScsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLm1lbW9yeSk7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdWTScsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLnZtSGludCk7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdTY3JlZW4gUmVhZGVyJywgbW9kZWxEYXRhLnN5c3RlbUluZm8uc2NyZWVuUmVhZGVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5hZGREaWFnUm93KHN5c1RhYmxlLCAnVXNlciBBZ2VudCcsIG5hdmlnYXRvci51c2VyQWdlbnQpO1xuXHRcdFx0XHRcdHRoaXMuYWRkRGlhZ1JvdyhzeXNUYWJsZSwgJ0luc3RhbGxhdGlvbiBwdXJlJywgU3RyaW5nKG1vZGVsRGF0YS5pc0luc3RhbGxhdGlvblB1cmUgPz8gdHJ1ZSkpO1xuXHRcdFx0XHRcdGlmIChtb2RlbERhdGEucmVzdHJpY3RlZE1vZGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuYWRkRGlhZ1JvdyhzeXNUYWJsZSwgJ01vZGUnLCAnUmVzdHJpY3RlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBsb2FkaW5nID0gYXBwZW5kKGRpYWdDb250YWluZXIsICQoJ2Rpdi5yZXZpZXctZGlhZy1sb2FkaW5nJykpO1xuXHRcdFx0bG9hZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsb2FkaW5nU3lzdGVtSW5mbycsIFwiTG9hZGluZyBzeXN0ZW0gaW5mb3JtYXRpb24uLi5cIik7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsRGF0YS5leHRlbnNpb25EYXRhKSB7XG5cdFx0XHQvLyBNYXRjaCBgYnVpbGRJc3N1ZUJvZHlgLCB3aGljaCBvbmx5IGdhdGVzIG9uIGBleHRlbnNpb25EYXRhYC4gR2F0aW5nXG5cdFx0XHQvLyBoZXJlIG9uIGBmaWxlT25FeHRlbnNpb25gIGFzIHdlbGwgd291bGQgaGlkZSB0aGUgc2VjdGlvbiBpbiB0aGVcblx0XHRcdC8vIHJldmlldyBVSSB3aGVuZXZlciB0aGUgaXNzdWUgc291cmNlIHdhcyBhdXRvLXN3aXRjaGVkIGF3YXkgZnJvbVxuXHRcdFx0Ly8gRXh0ZW5zaW9uIChlLmcuIGJ1aWx0LWluIGV4dGVuc2lvbnMgYXJlIGZpbGVkIGFnYWluc3QgVlMgQ29kZSksXG5cdFx0XHQvLyBldmVuIHRob3VnaCB0aGUgZXh0ZW5zaW9uIGRhdGEgc3RpbGwgZW5kcyB1cCBpbiB0aGUgc3VibWl0dGVkIGJvZHkuXG5cdFx0XHRkaWFnbm9zdGljU2VjdGlvbkNvdW50Kys7XG5cdFx0XHR0aGlzLmNyZWF0ZURpYWdTZWN0aW9uKGRpYWdDb250YWluZXIsIHtcblx0XHRcdFx0aWQ6ICdleHRlbnNpb24tZGF0YScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uRGF0YScsIFwiRXh0ZW5zaW9uIERhdGFcIiksXG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEsXG5cdFx0XHRcdG9uVG9nZ2xlOiAoY2hlY2tlZCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEgPSBjaGVja2VkO1xuXHRcdFx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaW5jbHVkZUV4dGVuc2lvbkRhdGE6IGNoZWNrZWQgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbmRlckNvbnRlbnQ6IChjb250YWluZXIpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwcmUgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwcmUucmV2aWV3LWRpYWctcHJlJykpO1xuXHRcdFx0XHRcdHByZS50ZXh0Q29udGVudCA9IG1vZGVsRGF0YS5leHRlbnNpb25EYXRhITtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuc2lvbnMgKG5vbi10aGVtZSBvbmx5KVxuXHRcdGNvbnN0IG5vblRoZW1lRXh0ZW5zaW9ucyA9IChtb2RlbERhdGEuYWxsRXh0ZW5zaW9ucyA/PyBbXSkuZmlsdGVyKGUgPT4gIWUuaXNUaGVtZSAmJiAhZS5pc0J1aWx0aW4pO1xuXHRcdGlmICghbW9kZWxEYXRhLmZpbGVPbkV4dGVuc2lvbiAmJiAhbW9kZWxEYXRhLmZpbGVPbk1hcmtldHBsYWNlICYmIG5vblRoZW1lRXh0ZW5zaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRkaWFnbm9zdGljU2VjdGlvbkNvdW50Kys7XG5cdFx0XHR0aGlzLmNyZWF0ZURpYWdTZWN0aW9uKGRpYWdDb250YWluZXIsIHtcblx0XHRcdFx0aWQ6ICdleHRlbnNpb25zJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdleHRlbnNpb25zJywgXCJFeHRlbnNpb25zICh7MH0pXCIsIG5vblRoZW1lRXh0ZW5zaW9ucy5sZW5ndGgpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmluY2x1ZGVFeHRlbnNpb25zLFxuXHRcdFx0XHRvblRvZ2dsZTogKGNoZWNrZWQpID0+IHtcblx0XHRcdFx0XHR0aGlzLmluY2x1ZGVFeHRlbnNpb25zID0gY2hlY2tlZDtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGluY2x1ZGVFeHRlbnNpb25zOiBjaGVja2VkIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0VGFibGUgPSBhcHBlbmQoY29udGFpbmVyLCAkKCd0YWJsZS5yZXZpZXctZGlhZy10YWJsZS5yZXZpZXctZXh0LXRhYmxlJykpO1xuXHRcdFx0XHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChleHRUYWJsZSwgJCgndHInKSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBoIG9mIFsnTmFtZScsICdJZGVudGlmaWVyJywgJ0F1dGhvcicsICdWZXJzaW9uJ10pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRoID0gYXBwZW5kKGhlYWRlciwgJCgndGgucmV2aWV3LWV4dC10aCcpKTtcblx0XHRcdFx0XHRcdHRoLnRleHRDb250ZW50ID0gaDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleHQgb2Ygbm9uVGhlbWVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByb3cgPSBhcHBlbmQoZXh0VGFibGUsICQoJ3RyJykpO1xuXHRcdFx0XHRcdFx0YXBwZW5kKHJvdywgJCgndGQnKSkudGV4dENvbnRlbnQgPSBleHQuZGlzcGxheU5hbWUgfHwgZXh0Lm5hbWU7XG5cdFx0XHRcdFx0XHRhcHBlbmQocm93LCAkKCd0ZCcpKS50ZXh0Q29udGVudCA9IGV4dC5pZDtcblx0XHRcdFx0XHRcdGFwcGVuZChyb3csICQoJ3RkJykpLnRleHRDb250ZW50ID0gZXh0LnB1Ymxpc2hlciA/PyAnJztcblx0XHRcdFx0XHRcdGFwcGVuZChyb3csICQoJ3RkJykpLnRleHRDb250ZW50ID0gZXh0LnZlcnNpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwZXJpbWVudHNcblx0XHRpZiAobW9kZWxEYXRhLmV4cGVyaW1lbnRJbmZvKSB7XG5cdFx0XHRkaWFnbm9zdGljU2VjdGlvbkNvdW50Kys7XG5cdFx0XHR0aGlzLmNyZWF0ZURpYWdTZWN0aW9uKGRpYWdDb250YWluZXIsIHtcblx0XHRcdFx0aWQ6ICdleHBlcmltZW50cycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWJFeHBlcmltZW50cycsIFwiQS9CIEV4cGVyaW1lbnRzXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmluY2x1ZGVFeHBlcmltZW50cyxcblx0XHRcdFx0b25Ub2dnbGU6IChjaGVja2VkKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5pbmNsdWRlRXhwZXJpbWVudHMgPSBjaGVja2VkO1xuXHRcdFx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaW5jbHVkZUV4cGVyaW1lbnRzOiBjaGVja2VkIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgncHJlLnJldmlldy1kaWFnLXByZScpKTtcblx0XHRcdFx0XHRwcmUudGV4dENvbnRlbnQgPSBtb2RlbERhdGEuZXhwZXJpbWVudEluZm8hO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlICYmICFtb2RlbERhdGEuZmlsZU9uTWFya2V0cGxhY2UpIHtcblx0XHRcdGNvbnN0IHBlcmZvcm1hbmNlQ29udGFpbmVyID0gYXBwZW5kKGRpYWdDb250YWluZXIsICQoJ2Rpdi5yZXZpZXctcGVyZm9ybWFuY2UtZGF0YScpKTtcblx0XHRcdGlmICh0aGlzLnBlcmZvcm1hbmNlSW5mb1JlZnJlc2hpbmcpIHtcblx0XHRcdFx0cGVyZm9ybWFuY2VDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncmVmcmVzaGluZycpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGVyZm9ybWFuY2VUaXRsZVJvdyA9IGFwcGVuZChwZXJmb3JtYW5jZUNvbnRhaW5lciwgJCgnZGl2LnJldmlldy1wZXJmb3JtYW5jZS10aXRsZS1yb3cnKSk7XG5cdFx0XHRjb25zdCBwZXJmb3JtYW5jZVRpdGxlID0gYXBwZW5kKHBlcmZvcm1hbmNlVGl0bGVSb3csICQoJ2Rpdi5yZXZpZXctcGVyZm9ybWFuY2UtdGl0bGUnKSk7XG5cdFx0XHRwZXJmb3JtYW5jZVRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FkZGl0aW9uYWxQZXJmb3JtYW5jZURhdGEnLCBcIkFkZGl0aW9uYWwgUGVyZm9ybWFuY2UgRGF0YVwiKTtcblx0XHRcdGlmICh0aGlzLnJlZnJlc2hQZXJmb3JtYW5jZUluZm8pIHtcblx0XHRcdFx0Y29uc3QgcmVmcmVzaEJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24ocGVyZm9ybWFuY2VUaXRsZVJvdywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0XHRcdHJlZnJlc2hCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdyZXZpZXctcGVyZm9ybWFuY2UtcmVmcmVzaCcpO1xuXHRcdFx0XHRyZWZyZXNoQnRuLmxhYmVsID0gYCQocmVmcmVzaCkgJHtsb2NhbGl6ZSgncmVmcmVzaCcsIFwiUmVmcmVzaFwiKX1gO1xuXHRcdFx0XHRyZWZyZXNoQnRuLmVsZW1lbnQudGl0bGUgPSBsb2NhbGl6ZSgncmVmcmVzaFBlcmZvcm1hbmNlRGF0YScsIFwiUmVsb2FkIHJ1bm5pbmcgcHJvY2Vzc2VzIGFuZCB3b3Jrc3BhY2UgbWV0YWRhdGFcIik7XG5cdFx0XHRcdHJlZnJlc2hCdG4uZW5hYmxlZCA9ICF0aGlzLnBlcmZvcm1hbmNlSW5mb1JlZnJlc2hpbmc7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHJlZnJlc2hCdG4ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLnJlZnJlc2hQZXJmb3JtYW5jZUluZm8gfHwgdGhpcy5wZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMucGVyZm9ybWFuY2VJbmZvUmVmcmVzaGluZyA9IHRydWU7XG5cdFx0XHRcdFx0cmVmcmVzaEJ0bi5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0cGVyZm9ybWFuY2VDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncmVmcmVzaGluZycpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaFBlcmZvcm1hbmNlSW5mbygpO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBlcmZvcm1hbmNlSW5mb1JlZnJlc2hpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRcdC8vIHVwZGF0ZU1vZGVsIGluc2lkZSByZWZyZXNoUGVyZm9ybWFuY2VJbmZvIGFscmVhZHkgcmUtcmVuZGVycyB0aGVcblx0XHRcdFx0XHRcdC8vIHJldmlldyBzdGVwLCBzbyB0aGUgcHJldmlvdXMgcGVyZm9ybWFuY2VDb250YWluZXIvcmVmcmVzaEJ0biBtYXlcblx0XHRcdFx0XHRcdC8vIGJlIHN0YWxlIGJ5IG5vdy4gUmUtcmVuZGVyaW5nIG9uY2UgbW9yZSBoZXJlIGVuc3VyZXMgdGhlXG5cdFx0XHRcdFx0XHQvLyBcInJlZnJlc2hpbmdcIiBjbGFzcyBpcyBjbGVhcmVkIGFuZCB0aGUgYnV0dG9uIGlzIHJlLWVuYWJsZWQgZXZlblxuXHRcdFx0XHRcdFx0Ly8gaWYgdGhlIG1vZGVsIGRpZG4ndCB1cGRhdGUgKGUuZy4gZXJyb3IgcGF0aCkuXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVSZXZpZXdEZXRhaWxzKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGVyZm9ybWFuY2VEZXNjcmlwdGlvbiA9IGFwcGVuZChwZXJmb3JtYW5jZUNvbnRhaW5lciwgJCgnZGl2LnJldmlldy1wZXJmb3JtYW5jZS1kZXNjcmlwdGlvbicpKTtcblx0XHRcdHBlcmZvcm1hbmNlRGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWRkaXRpb25hbFBlcmZvcm1hbmNlRGF0YURlc2NyaXB0aW9uJywgXCJPcHRpb25hbGx5IGluY2x1ZGUgY3VycmVudGx5IHJ1bm5pbmcgcHJvY2Vzc2VzIGFuZCB3b3Jrc3BhY2UgbWV0YWRhdGEgdG8gaGVscCBkaWFnbm9zZSBwZXJmb3JtYW5jZSBpc3N1ZXMuXCIpO1xuXG5cdFx0XHRpZiAobW9kZWxEYXRhLnByb2Nlc3NJbmZvKSB7XG5cdFx0XHRcdGRpYWdub3N0aWNTZWN0aW9uQ291bnQrKztcblx0XHRcdFx0dGhpcy5jcmVhdGVEaWFnU2VjdGlvbihwZXJmb3JtYW5jZUNvbnRhaW5lciwge1xuXHRcdFx0XHRcdGlkOiAncHJvY2Vzcy1pbmZvJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3J1bm5pbmdQcm9jZXNzZXMnLCBcIlJ1bm5pbmcgUHJvY2Vzc2VzXCIpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHRoaXMuaW5jbHVkZVByb2Nlc3NJbmZvLFxuXHRcdFx0XHRcdG9uVG9nZ2xlOiAoY2hlY2tlZCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5pbmNsdWRlUHJvY2Vzc0luZm8gPSBjaGVja2VkO1xuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbC51cGRhdGUoeyBpbmNsdWRlUHJvY2Vzc0luZm86IGNoZWNrZWQgfSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcmUgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwcmUucmV2aWV3LWRpYWctcHJlJykpO1xuXHRcdFx0XHRcdFx0cHJlLnRleHRDb250ZW50ID0gbW9kZWxEYXRhLnByb2Nlc3NJbmZvITtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoIXRoaXMucGVyZm9ybWFuY2VJbmZvTG9hZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGxvYWRpbmcgPSBhcHBlbmQocGVyZm9ybWFuY2VDb250YWluZXIsICQoJ2Rpdi5yZXZpZXctZGlhZy1sb2FkaW5nJykpO1xuXHRcdFx0XHRsb2FkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xvYWRpbmdQcm9jZXNzSW5mbycsIFwiTG9hZGluZyBjdXJyZW50bHkgcnVubmluZyBwcm9jZXNzZXMuLi5cIik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbERhdGEud29ya3NwYWNlSW5mbykge1xuXHRcdFx0XHRkaWFnbm9zdGljU2VjdGlvbkNvdW50Kys7XG5cdFx0XHRcdHRoaXMuY3JlYXRlRGlhZ1NlY3Rpb24ocGVyZm9ybWFuY2VDb250YWluZXIsIHtcblx0XHRcdFx0XHRpZDogJ3dvcmtzcGFjZS1pbmZvJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3dvcmtzcGFjZU1ldGFkYXRhJywgXCJXb3Jrc3BhY2UgTWV0YWRhdGFcIiksXG5cdFx0XHRcdFx0Y2hlY2tlZDogdGhpcy5pbmNsdWRlV29ya3NwYWNlSW5mbyxcblx0XHRcdFx0XHRvblRvZ2dsZTogKGNoZWNrZWQpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuaW5jbHVkZVdvcmtzcGFjZUluZm8gPSBjaGVja2VkO1xuXHRcdFx0XHRcdFx0dGhpcy5tb2RlbC51cGRhdGUoeyBpbmNsdWRlV29ya3NwYWNlSW5mbzogY2hlY2tlZCB9KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlbmRlckNvbnRlbnQ6IChjb250YWluZXIpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHByZSA9IGFwcGVuZChjb250YWluZXIsICQoJ3ByZS5yZXZpZXctZGlhZy1wcmUnKSk7XG5cdFx0XHRcdFx0XHRwcmUudGV4dENvbnRlbnQgPSBtb2RlbERhdGEud29ya3NwYWNlSW5mbyE7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKCF0aGlzLnBlcmZvcm1hbmNlSW5mb0xvYWRlZCkge1xuXHRcdFx0XHRjb25zdCBsb2FkaW5nID0gYXBwZW5kKHBlcmZvcm1hbmNlQ29udGFpbmVyLCAkKCdkaXYucmV2aWV3LWRpYWctbG9hZGluZycpKTtcblx0XHRcdFx0bG9hZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsb2FkaW5nV29ya3NwYWNlSW5mbycsIFwiTG9hZGluZyB3b3Jrc3BhY2UgbWV0YWRhdGEuLi5cIik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRpYWdub3N0aWNTZWN0aW9uQ291bnQgPiAwKSB7XG5cdFx0XHRjb25zdCBoZWFkaW5nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRoZWFkaW5nLmNsYXNzTmFtZSA9ICdyZXZpZXctZGlhZy1oZWFkaW5nJztcblxuXHRcdFx0Ly8gTWFzdGVyIGNoZWNrYm94IGJlZm9yZSBcIkFkZGl0aW9uYWwgSW5mb3JtYXRpb25cIiBzaG93cy9oaWRlcyBhbmRcblx0XHRcdC8vIGluY2x1ZGVzL2V4Y2x1ZGVzIHRoZSB3aG9sZSBibG9jay4gSXQgaXMgYW4gZXhwbGljaXQgdG9nZ2xlXG5cdFx0XHQvLyBjb250cm9sbGVkIG9ubHkgYnkgdGhlIHVzZXI6IGNsaWNraW5nIGEgcGVyLXNlY3Rpb24gY2hlY2tib3ggYWZmZWN0c1xuXHRcdFx0Ly8gdGhhdCBzZWN0aW9uIGFsb25lIGFuZCBuZXZlciBjaGFuZ2VzIHRoZSBtYXN0ZXIgb3IgaGlkZXMgdGhlIG90aGVycy5cblx0XHRcdGNvbnN0IG1hc3RlcldyYXAgPSBhcHBlbmQoaGVhZGluZywgJCgnZGl2LnJldmlldy1kaWFnLW1hc3Rlci13cmFwJykpO1xuXHRcdFx0Y29uc3QgbWFzdGVyQ2hlY2tib3ggPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3gobG9jYWxpemUoJ2FkZGl0aW9uYWxJbmZvcm1hdGlvbicsIFwiQWRkaXRpb25hbCBJbmZvcm1hdGlvblwiKSwgIXRoaXMuZGlhZ25vc3RpY3NDb2xsYXBzZWQsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdFx0bWFzdGVyQ2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdyZXZpZXctZGlhZy1tYXN0ZXItY2hlY2tib3gnKTtcblx0XHRcdG1hc3RlcldyYXAuYXBwZW5kQ2hpbGQobWFzdGVyQ2hlY2tib3guZG9tTm9kZSk7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChtYXN0ZXJXcmFwLCAkKCdoMy5yZXZpZXctZGlhZy1oZWFkaW5nLXRpdGxlJykpO1xuXHRcdFx0dGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWRkaXRpb25hbEluZm9ybWF0aW9uJywgXCJBZGRpdGlvbmFsIEluZm9ybWF0aW9uXCIpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQobWFzdGVyQ2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRpYWdub3N0aWNzQ29sbGFwc2VkID0gIW1hc3RlckNoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHRcdHRoaXMuc2V0QWxsRGlhZ25vc3RpY1NlY3Rpb25zSW5jbHVkZWQobWFzdGVyQ2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhpZGUgYWxsIHNlY3Rpb25zIG9ubHkgd2hlbiB0aGUgdXNlciB0dXJucyB0aGUgbWFzdGVyIG9mZi5cblx0XHRcdGRpYWdDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWxsLWV4Y2x1ZGVkJywgdGhpcy5kaWFnbm9zdGljc0NvbGxhcHNlZCk7XG5cblx0XHRcdGRpYWdDb250YWluZXIucHJlcGVuZChoZWFkaW5nKTtcblx0XHR9XG5cblx0XHQvLyBBbGlnbiBhbGwgdGl0bGUgd2lkdGhzIGR5bmFtaWNhbGx5IHRvIHRoZSB3aWRlc3QgdGl0bGUgc28gY2hldnJvbiBjb2x1bW5zIGxpbmUgdXAuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdGl0bGVzID0gZGlhZ0NvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcucmV2aWV3LWRpYWctdGl0bGUnKTtcblx0XHRsZXQgbWF4V2lkdGggPSAwO1xuXHRcdGZvciAoY29uc3QgdCBvZiB0aXRsZXMpIHtcblx0XHRcdCh0IGFzIEhUTUxFbGVtZW50KS5zdHlsZS5taW5XaWR0aCA9ICcnO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHQgb2YgdGl0bGVzKSB7XG5cdFx0XHRtYXhXaWR0aCA9IE1hdGgubWF4KG1heFdpZHRoLCAodCBhcyBIVE1MRWxlbWVudCkub2Zmc2V0V2lkdGgpO1xuXHRcdH1cblx0XHRpZiAobWF4V2lkdGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHQgb2YgdGl0bGVzKSB7XG5cdFx0XHRcdCh0IGFzIEhUTUxFbGVtZW50KS5zdHlsZS5taW5XaWR0aCA9IGAke21heFdpZHRofXB4YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEFsbERpYWdub3N0aWNTZWN0aW9uc0luY2x1ZGVkKGluY2x1ZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pbmNsdWRlU3lzdGVtSW5mbyA9IGluY2x1ZGVkO1xuXHRcdHRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEgPSBpbmNsdWRlZDtcblx0XHR0aGlzLmluY2x1ZGVFeHRlbnNpb25zID0gaW5jbHVkZWQ7XG5cdFx0dGhpcy5pbmNsdWRlRXhwZXJpbWVudHMgPSBpbmNsdWRlZDtcblx0XHR0aGlzLmluY2x1ZGVQcm9jZXNzSW5mbyA9IGluY2x1ZGVkO1xuXHRcdHRoaXMuaW5jbHVkZVdvcmtzcGFjZUluZm8gPSBpbmNsdWRlZDtcblx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7XG5cdFx0XHRpbmNsdWRlU3lzdGVtSW5mbzogaW5jbHVkZWQsXG5cdFx0XHRpbmNsdWRlRXh0ZW5zaW9uRGF0YTogaW5jbHVkZWQsXG5cdFx0XHRpbmNsdWRlRXh0ZW5zaW9uczogaW5jbHVkZWQsXG5cdFx0XHRpbmNsdWRlRXhwZXJpbWVudHM6IGluY2x1ZGVkLFxuXHRcdFx0aW5jbHVkZVByb2Nlc3NJbmZvOiBpbmNsdWRlZCxcblx0XHRcdGluY2x1ZGVXb3Jrc3BhY2VJbmZvOiBpbmNsdWRlZCxcblx0XHR9KTtcblx0XHR0aGlzLnVwZGF0ZVJldmlld0RldGFpbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGlhZ1NlY3Rpb24ocGFyZW50OiBIVE1MRWxlbWVudCwgb3B0czoge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHRjaGVja2VkOiBib29sZWFuO1xuXHRcdG9uVG9nZ2xlOiAoY2hlY2tlZDogYm9vbGVhbikgPT4gdm9pZDtcblx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcblx0fSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwID0gYXBwZW5kKHBhcmVudCwgJCgnZGl2LnJldmlldy1kaWFnLWdyb3VwJykpO1xuXHRcdGdyb3VwLmNsYXNzTGlzdC50b2dnbGUoJ2V4Y2x1ZGVkJywgIW9wdHMuY2hlY2tlZCk7XG5cblx0XHQvLyBIZWFkZXIgbGF5b3V0OiBbQ2hlY2tib3hdIFtDaGV2cm9uICsgVGl0bGUgKHRvZ2dsZSBhcmVhKV0uIFRoZSB3aG9sZVxuXHRcdC8vIHRpdGxlIGFyZWEgaXMgY2xpY2thYmxlIHRvIGV4cGFuZC9jb2xsYXBzZS5cblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQoZ3JvdXAsICQoJ2Rpdi5yZXZpZXctZGlhZy1oZWFkZXInKSk7XG5cblx0XHRjb25zdCBjaGVja1dyYXAgPSBhcHBlbmQoaGVhZGVyLCAkKCdkaXYucmV2aWV3LWRpYWctY2hlY2std3JhcCcpKTtcblx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveChvcHRzLmxhYmVsLCBvcHRzLmNoZWNrZWQsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdGNoZWNrYm94LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgncmV2aWV3LWRpYWctY2hlY2tib3gnKTtcblx0XHRjaGVja1dyYXAuYXBwZW5kQ2hpbGQoY2hlY2tib3guZG9tTm9kZSk7XG5cblx0XHRjb25zdCB0b2dnbGVBcmVhID0gYXBwZW5kKGhlYWRlciwgJCgnZGl2LnJldmlldy1kaWFnLXRvZ2dsZS1hcmVhJykpO1xuXHRcdHRvZ2dsZUFyZWEuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRvZ2dsZUFyZWEuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0dG9nZ2xlQXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3QgY2hldnJvbiA9IGFwcGVuZCh0b2dnbGVBcmVhLCAkKCdzcGFuLnJldmlldy1kaWFnLWNoZXZyb24nKSk7XG5cdFx0Y2hldnJvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2hldnJvbkRvd24pKTtcblxuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKHRvZ2dsZUFyZWEsICQoJ3NwYW4ucmV2aWV3LWRpYWctdGl0bGUnKSk7XG5cdFx0dGl0bGUudGV4dENvbnRlbnQgPSBvcHRzLmxhYmVsO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGFwcGVuZChncm91cCwgJCgnZGl2LnJldmlldy1kaWFnLWNvbnRlbnQnKSk7XG5cdFx0b3B0cy5yZW5kZXJDb250ZW50KGNvbnRlbnQpO1xuXG5cdFx0bGV0IGV4cGFuZGVkID0gdHJ1ZTtcblx0XHRjb25zdCBzZXRFeHBhbmRlZCA9IChuZXh0OiBib29sZWFuKSA9PiB7XG5cdFx0XHRleHBhbmRlZCA9IG5leHQ7XG5cdFx0XHRjb250ZW50LnN0eWxlLmRpc3BsYXkgPSBleHBhbmRlZCA/ICcnIDogJ25vbmUnO1xuXHRcdFx0dG9nZ2xlQXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoZXhwYW5kZWQpKTtcblx0XHRcdGNoZXZyb24udGV4dENvbnRlbnQgPSAnJztcblx0XHRcdGNoZXZyb24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihleHBhbmRlZCA/IENvZGljb24uY2hldnJvbkRvd24gOiBDb2RpY29uLmNoZXZyb25SaWdodCkpO1xuXHRcdH07XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodG9nZ2xlQXJlYSwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiBzZXRFeHBhbmRlZCghZXhwYW5kZWQpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRvZ2dsZUFyZWEsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHNldEV4cGFuZGVkKCFleHBhbmRlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0b3B0cy5vblRvZ2dsZShjaGVja2JveC5jaGVja2VkKTtcblx0XHRcdGdyb3VwLmNsYXNzTGlzdC50b2dnbGUoJ2V4Y2x1ZGVkJywgIWNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZERpYWdSb3codGFibGU6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgcm93ID0gYXBwZW5kKHRhYmxlLCAkKCd0cicpKTtcblx0XHRjb25zdCB0aCA9IGFwcGVuZChyb3csICQoJ3RkLnJldmlldy1kaWFnLWtleScpKTtcblx0XHR0aC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdGNvbnN0IHRkID0gYXBwZW5kKHJvdywgJCgndGQucmV2aWV3LWRpYWctdmFsJykpO1xuXHRcdHRkLnRleHRDb250ZW50ID0gdmFsdWU7XG5cdH1cblxuXHQvKiogQ2FsbGVkIGJ5IHRoZSBmb3JtIHNlcnZpY2UgdG8gc2hvdyB1cGxvYWQgcHJvZ3Jlc3MgKi9cblx0c2V0VXBsb2FkaW5nKHVwbG9hZGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudXBsb2FkaW5nID0gdXBsb2FkaW5nO1xuXG5cdFx0aWYgKHVwbG9hZGluZykge1xuXHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgndXBsb2FkaW5nJyk7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgndXBsb2FkaW5nJywgXCJVcGxvYWRpbmcuLi5cIik7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgndXBsb2FkaW5nJyk7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBNYXJrIGEgc3BlY2lmaWMgYXR0YWNobWVudCBhcyB1cGxvYWRpbmcgLyBkb25lICovXG5cdHNldEF0dGFjaG1lbnRVcGxvYWRTdGF0ZShpbmRleDogbnVtYmVyLCBzdGF0ZTogJ3BlbmRpbmcnIHwgJ3VwbG9hZGluZycgfCAnZG9uZScpOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMucmV2aWV3VGh1bWJDYXJkcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FyZCA9IHRoaXMucmV2aWV3VGh1bWJDYXJkc1tpbmRleF07XG5cdFx0Y2FyZC5jbGFzc0xpc3QucmVtb3ZlKCd1cGxvYWQtcGVuZGluZycsICd1cGxvYWQtdXBsb2FkaW5nJywgJ3VwbG9hZC1kb25lJyk7XG5cdFx0Y2FyZC5jbGFzc0xpc3QuYWRkKGB1cGxvYWQtJHtzdGF0ZX1gKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IG92ZXJsYXkgPSBjYXJkLnF1ZXJ5U2VsZWN0b3IoJy5yZXZpZXctcHJvZ3Jlc3Mtb3ZlcmxheScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRpZiAoIW92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUgPT09ICdkb25lJykge1xuXHRcdFx0Ly8gUmVwbGFjZSByaW5nIHdpdGggY2hlY2ttYXJrXG5cdFx0XHRvdmVybGF5LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRjb25zdCBjaGVjayA9ICQoJ3NwYW4ucmV2aWV3LXByb2dyZXNzLWNoZWNrJyk7XG5cdFx0XHRjaGVjay5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2hlY2spKTtcblx0XHRcdG92ZXJsYXkuYXBwZW5kQ2hpbGQoY2hlY2spO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3VibWl0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKTtcblx0XHRpZiAoIXRpdGxlKSB7XG5cdFx0XHQvLyBTaG91bGQgbm90IGhhcHBlbjogdmFsaWRhdGVkIGluIGdvTmV4dCgpIG9uIERlc2NyaWJlIHN0ZXBcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS50cmltKCk7XG5cdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGUoeyBpc3N1ZURlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbiwgaXNzdWVUaXRsZTogdGl0bGUsIC4uLih0aGlzLnNlbGVjdGVkSXNzdWVUeXBlICE9PSB1bmRlZmluZWQgPyB7IGlzc3VlVHlwZTogdGhpcy5zZWxlY3RlZElzc3VlVHlwZSB9IDoge30pIH0pO1xuXG5cdFx0Y29uc3QgYm9keSA9IHRoaXMuYnVpbGRJc3N1ZUJvZHkoKTtcblx0XHR0aGlzLl9vbkRpZFN1Ym1pdC5maXJlKHsgdGl0bGUsIGJvZHkgfSk7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy52aXNpYmxlID0gdHJ1ZTtcblxuXHRcdHRoaXMud2l6YXJkUGFuZWwuY2xhc3NMaXN0LmFkZCgnb3BlbicsICd3aXphcmQtZW1iZWRkZWQnKTtcblx0XHR0aGlzLndpemFyZFBhbmVsLnN0eWxlLm1heEhlaWdodCA9ICdub25lJztcblx0XHRhcHBlbmQodGhpcy5jb250YWluZXIsIHRoaXMud2l6YXJkUGFuZWwpO1xuXHRcdHRoaXMud2l6YXJkUGFuZWwuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VG90YWxBdHRhY2htZW50cygpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnNjcmVlbnNob3RzLmxlbmd0aCArIHRoaXMucmVjb3JkaW5ncy5sZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIGdldFNjcmVlbnNob3REZWxheU9wdGlvbnMoKTogeyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogbnVtYmVyIH1bXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdub0RlbGF5JywgXCJObyBkZWxheVwiKSwgdmFsdWU6IDAgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCd0aHJlZVNlY29uZHMnLCBcIjMgc2Vjb25kc1wiKSwgdmFsdWU6IDMgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdmaXZlU2Vjb25kcycsIFwiNSBzZWNvbmRzXCIpLCB2YWx1ZTogNSB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ3RlblNlY29uZHMnLCBcIjEwIHNlY29uZHNcIiksIHZhbHVlOiAxMCB9LFxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGdldEZsb2F0aW5nQmFyQnV0dG9uU3R5bGVzKHRhcmdldFdpbmRvdzogV2luZG93KTogdHlwZW9mIGRlZmF1bHRCdXR0b25TdHlsZXMge1xuXHRcdGNvbnN0IGNvbnRhaW5lclN0eWxlcyA9IHRhcmdldFdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRoaXMuY29udGFpbmVyKTtcblx0XHRjb25zdCBjc3NWYXIgPSAobmFtZTogc3RyaW5nLCBmYWxsYmFjazogc3RyaW5nKTogc3RyaW5nID0+IGNvbnRhaW5lclN0eWxlcy5nZXRQcm9wZXJ0eVZhbHVlKG5hbWUpLnRyaW0oKSB8fCBmYWxsYmFjaztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdGJ1dHRvbkZvcmVncm91bmQ6IGNzc1ZhcignLS12c2NvZGUtYnV0dG9uLWZvcmVncm91bmQnLCAnI2ZmZicpLFxuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogY3NzVmFyKCctLXZzY29kZS1idXR0b24tYmFja2dyb3VuZCcsICcjMGU2MzljJyksXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IGNzc1ZhcignLS12c2NvZGUtYnV0dG9uLWhvdmVyQmFja2dyb3VuZCcsICcjMTE3N2JiJyksXG5cdFx0XHRidXR0b25Cb3JkZXI6IGNzc1ZhcignLS12c2NvZGUtYnV0dG9uLWJvcmRlcicsICd0cmFuc3BhcmVudCcpLFxuXHRcdH07XG5cdH1cblxuXHRhZGRTY3JlZW5zaG90KHNjcmVlbnNob3Q6IElTY3JlZW5zaG90KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpID49IE1BWF9BVFRBQ0hNRU5UUykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNjcmVlbnNob3RzLnB1c2goc2NyZWVuc2hvdCk7XG5cdFx0Ly8gTmF2aWdhdGUgdG8gdGhlIEF0dGFjaG1lbnRzIHN0ZXAgc28gdGhlIHVzZXIgc2VlcyB3aGVyZSB0aGUgc2NyZWVuc2hvdFxuXHRcdC8vIHdhcyBzYXZlZCBpbnN0ZWFkIG9mIHN0YXlpbmcgb24gd2hhdGV2ZXIgc3RlcCB0aGV5IHdlcmUgY29tcG9zaW5nIG9uLlxuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwICE9PSBXaXphcmRTdGVwLkF0dGFjaG1lbnRzKSB7XG5cdFx0XHR0aGlzLnNldFN0ZXAoV2l6YXJkU3RlcC5BdHRhY2htZW50cyk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQXR0YWNobWVudFZpZXdzKCk7XG5cdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdHRhY2htZW50cy5maXJlKCk7XG5cblx0XHQvLyBJbW1lZGlhdGVseSBvcGVuIHRoZSBhbm5vdGF0aW9uIGVkaXRvciBmb3IgdGhlIG5ldyBzY3JlZW5zaG90XG5cdFx0dGhpcy5vcGVuQW5ub3RhdGlvbkVkaXRvcih0aGlzLnNjcmVlbnNob3RzLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBdHRhY2htZW50QnV0dG9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBhdE1heCA9IHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpID49IE1BWF9BVFRBQ0hNRU5UUztcblx0XHRjb25zdCBtYXhNc2cgPSBsb2NhbGl6ZSgnbWF4QXR0YWNobWVudHNSZWFjaGVkJywgXCJNYXggYXR0YWNobWVudHMgcmVhY2hlZFwiKTtcblx0XHRjb25zdCB3b3VsZFJlYWNoTWF4ID0gdGhpcy5nZXRUb3RhbEF0dGFjaG1lbnRzKCkgPj0gTUFYX0FUVEFDSE1FTlRTIC0gMTtcblxuXHRcdC8vIFNjcmVlbnNob3QgZGlzYWJsZWQgd2hlbjogYXQgbWF4LCBPUiByZWNvcmRpbmcgd2lsbCBmaWxsIHRoZSBsYXN0IHNsb3QsIE9SIGRlbGF5ZWQgc2NyZWVuc2hvdCBwZW5kaW5nXG5cdFx0Y29uc3Qgc2NyZWVuc2hvdERpc2FibGVkID0gYXRNYXggfHwgKHdvdWxkUmVhY2hNYXggJiYgdGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZykgfHwgdGhpcy5kZWxheWVkU2NyZWVuc2hvdFBlbmRpbmc7XG5cdFx0Ly8gUmVjb3JkIGRpc2FibGVkIHdoZW46IGF0IG1heCwgT1IgZGVsYXllZCBzY3JlZW5zaG90IHdpbGwgZmlsbCB0aGUgbGFzdCBzbG90XG5cdFx0Y29uc3QgcmVjb3JkRGlzYWJsZWQgPSBhdE1heCB8fCAod291bGRSZWFjaE1heCAmJiB0aGlzLmRlbGF5ZWRTY3JlZW5zaG90UGVuZGluZyk7XG5cblx0XHRpZiAodGhpcy5jYXB0dXJlU3RyaXBDYXB0dXJlQnRuKSB7XG5cdFx0XHR0aGlzLmNhcHR1cmVTdHJpcENhcHR1cmVCdG4uZW5hYmxlZCA9ICFzY3JlZW5zaG90RGlzYWJsZWQ7XG5cdFx0XHR0aGlzLmNhcHR1cmVTdHJpcENhcHR1cmVCdG4uZWxlbWVudC50aXRsZSA9IHNjcmVlbnNob3REaXNhYmxlZCA/IG1heE1zZyA6IGxvY2FsaXplKCdzY3JlZW5zaG90JywgXCJTY3JlZW5zaG90XCIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jYXB0dXJlU3RyaXBEZWxheUJ0bikge1xuXHRcdFx0Ly8gRGVsYXkgZHJvcGRvd24gYWxzbyBkaXNhYmxlZCB3aGlsZSBjb3VudGRvd24gaXMgcnVubmluZ1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBEZWxheUJ0bi5lbmFibGVkID0gIXNjcmVlbnNob3REaXNhYmxlZDtcblx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwRGVsYXlCdG4uZWxlbWVudC50aXRsZSA9IHNjcmVlbnNob3REaXNhYmxlZCA/IG1heE1zZyA6IGxvY2FsaXplKCdjYXB0dXJlT3B0aW9ucycsIFwiQ2FwdHVyZSBvcHRpb25zXCIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4pIHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRSZWNvcmRpbmdTdGF0ZSAhPT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLmVuYWJsZWQgPSAhcmVjb3JkRGlzYWJsZWQ7XG5cdFx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLmVsZW1lbnQudGl0bGUgPSByZWNvcmREaXNhYmxlZCA/IG1heE1zZyA6IGxvY2FsaXplKCdyZWNvcmRWaWRlbycsIFwiUmVjb3JkIHZpZGVvXCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERpc2FibGUgXCJQcmV2aWV3IG9uIEdpdEh1YlwiIHdoaWxlIHJlY29yZGluZ1xuXHRcdHRoaXMudXBkYXRlTmV4dEJ1dHRvbkZvclJlY29yZGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVOZXh0QnV0dG9uRm9yUmVjb3JkaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwICE9PSBXaXphcmRTdGVwLlJldmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWNvcmRpbmcgPSB0aGlzLmN1cnJlbnRSZWNvcmRpbmdTdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nO1xuXHRcdHRoaXMubmV4dEJ1dHRvbi5lbmFibGVkID0gIXJlY29yZGluZztcblx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC50aXRsZSA9IHJlY29yZGluZ1xuXHRcdFx0PyBsb2NhbGl6ZSgncmVjb3JkaW5nQWN0aXZlJywgXCJSZWNvcmRpbmcgYWN0aXZlXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdwcmV2aWV3T25HaXRIdWInLCBcIlByZXZpZXcgb24gR2l0SHViXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSZWNvcmRpbmdDYXJkKHBhcmVudDogSFRNTEVsZW1lbnQsIHJlYzogeyBmaWxlUGF0aDogc3RyaW5nOyBkdXJhdGlvbk1zOiBudW1iZXI7IHRodW1ibmFpbERhdGFVcmw/OiBzdHJpbmcgfSwgaW5kZXg6IG51bWJlcik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjYXJkID0gYXBwZW5kKHBhcmVudCwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LWNhcmQud2l6YXJkLXJlY29yZGluZy1jYXJkJykpO1xuXG5cdFx0aWYgKHJlYy50aHVtYm5haWxEYXRhVXJsKSB7XG5cdFx0XHRjb25zdCB0aHVtYkltZyA9IGFwcGVuZChjYXJkLCAkKCdpbWcud2l6YXJkLXNjcmVlbnNob3QtaW1nJykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHR0aHVtYkltZy5zZXRBdHRyaWJ1dGUoJ3NyYycsIHJlYy50aHVtYm5haWxEYXRhVXJsKTtcblx0XHRcdHRodW1iSW1nLmFsdCA9IGxvY2FsaXplKCdyZWNvcmRpbmdUaHVtYm5haWxBbHQnLCBcIlJlY29yZGluZyB7MH1cIiwgaW5kZXggKyAxKTtcblx0XHRcdHRodW1iSW1nLnNldEF0dHJpYnV0ZSgnZHJhZ2dhYmxlJywgJ2ZhbHNlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxheU92ZXJsYXkgPSBhcHBlbmQoY2FyZCwgJCgnZGl2LndpemFyZC1yZWNvcmRpbmctcGxheScpKTtcblx0XHRwbGF5T3ZlcmxheS5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24ucGxheSkpO1xuXG5cdFx0Y29uc3QgZHVyU2VjID0gTWF0aC5mbG9vcihyZWMuZHVyYXRpb25NcyAvIDEwMDApO1xuXHRcdGNvbnN0IGR1ckxhYmVsID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi53aXphcmQtcmVjb3JkaW5nLWR1cmF0aW9uJykpO1xuXHRcdGR1ckxhYmVsLnRleHRDb250ZW50ID0gYCR7TWF0aC5mbG9vcihkdXJTZWMgLyA2MCl9OiR7KGR1clNlYyAlIDYwKS50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9YDtcblxuXHRcdHJldHVybiBjYXJkO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTY3JlZW5zaG90VGh1bWJuYWlscygpOiB2b2lkIHtcblx0XHR0aGlzLnNjcmVlbnNob3RDb250YWluZXIudGV4dENvbnRlbnQgPSAnJztcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zY3JlZW5zaG90cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgc2NyZWVuc2hvdCA9IHRoaXMuc2NyZWVuc2hvdHNbaV07XG5cdFx0XHRjb25zdCBjYXJkID0gYXBwZW5kKHRoaXMuc2NyZWVuc2hvdENvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LWNhcmQnKSk7XG5cblx0XHRcdGNvbnN0IGltZyA9IGFwcGVuZChjYXJkLCAkKCdpbWcnKSkgYXMgSFRNTEltYWdlRWxlbWVudDtcblx0XHRcdGltZy5zcmMgPSBzY3JlZW5zaG90LmFubm90YXRlZERhdGFVcmwgPz8gc2NyZWVuc2hvdC5kYXRhVXJsO1xuXHRcdFx0aW1nLmFsdCA9IGxvY2FsaXplKCdzY3JlZW5zaG90QWx0JywgXCJTY3JlZW5zaG90IHswfVwiLCBpICsgMSk7XG5cblx0XHRcdGNhcmQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRcdGNhcmQudGl0bGUgPSBsb2NhbGl6ZSgnZWRpdFNjcmVlbnNob3QnLCBcIkNsaWNrIHRvIGVkaXQgc2NyZWVuc2hvdFwiKTtcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3IgPSAoKSA9PiB0aGlzLm9wZW5Bbm5vdGF0aW9uRWRpdG9yKGkpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5DTElDSywgb3BlbkVkaXRvcikpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0b3BlbkVkaXRvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGRlbGV0ZUJ0biA9IGFwcGVuZChjYXJkLCAkKCdkaXYud2l6YXJkLXNjcmVlbnNob3QtZGVsZXRlJykpO1xuXHRcdFx0ZGVsZXRlQnRuLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdGRlbGV0ZUJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZGVsZXRlU2NyZWVuc2hvdCcsIFwiRGVsZXRlIHNjcmVlbnNob3RcIikpO1xuXHRcdFx0ZGVsZXRlQnRuLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jbG9zZSkpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRlbGV0ZUJ0biwgRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5zY3JlZW5zaG90cy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2NyZWVuc2hvdFRodW1ibmFpbHMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF0dGFjaG1lbnRzLmZpcmUoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBSZWNvcmRpbmcgdGh1bWJuYWlsc1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5yZWNvcmRpbmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCByZWMgPSB0aGlzLnJlY29yZGluZ3NbaV07XG5cdFx0XHRjb25zdCBjYXJkID0gdGhpcy5yZW5kZXJSZWNvcmRpbmdDYXJkKHRoaXMuc2NyZWVuc2hvdENvbnRhaW5lciwgcmVjLCBpKTtcblxuXHRcdFx0Ly8gQ2xpY2sgdG8gb3BlbiBmcm9tIE9TXG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmcuZmlyZShyZWMuZmlsZVBhdGgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBkZWxldGVCdG4gPSBhcHBlbmQoY2FyZCwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LWRlbGV0ZScpKTtcblx0XHRcdGRlbGV0ZUJ0bi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRkZWxldGVCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2RlbGV0ZVJlY29yZGluZycsIFwiUmVtb3ZlIHJlY29yZGluZ1wiKSk7XG5cdFx0XHRkZWxldGVCdG4uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNsb3NlKSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZGVsZXRlQnRuLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLnJlY29yZGluZ3Muc3BsaWNlKGksIDEpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNjcmVlbnNob3RUaHVtYm5haWxzKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBdHRhY2htZW50cy5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpIDwgTUFYX0FUVEFDSE1FTlRTKSB7XG5cdFx0XHRjb25zdCB3b3VsZFJlYWNoTWF4ID0gdGhpcy5nZXRUb3RhbEF0dGFjaG1lbnRzKCkgPj0gTUFYX0FUVEFDSE1FTlRTIC0gMTtcblx0XHRcdGNvbnN0IGFkZERpc2FibGVkID0gd291bGRSZWFjaE1heCAmJiAodGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZyB8fCB0aGlzLmRlbGF5ZWRTY3JlZW5zaG90UGVuZGluZyk7XG5cdFx0XHRjb25zdCBhZGRDYXJkID0gYXBwZW5kKHRoaXMuc2NyZWVuc2hvdENvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LWNhcmQud2l6YXJkLXNjcmVlbnNob3QtYWRkJykpO1xuXHRcdFx0aWYgKGFkZERpc2FibGVkKSB7XG5cdFx0XHRcdGFkZENhcmQuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHRcdFx0YWRkQ2FyZC50aXRsZSA9IGxvY2FsaXplKCdtYXhBdHRhY2htZW50c1JlYWNoZWQnLCBcIk1heCBhdHRhY2htZW50cyByZWFjaGVkXCIpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGx1cyA9IGFwcGVuZChhZGRDYXJkLCAkKCdkaXYud2l6YXJkLXNjcmVlbnNob3QtcGx1cycpKTtcblx0XHRcdHBsdXMuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmFkZCkpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFkZENhcmQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWFkZENhcmQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U2NyZWVuc2hvdC5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW5Bbm5vdGF0aW9uRWRpdG9yKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuc2NyZWVuc2hvdHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUGVyLWVkaXRvciBsaWZlY3ljbGU6IGVhY2ggY2FsbCBjcmVhdGVzIGEgbmV3IGVkaXRvciB0aGF0IG1vdW50cyBhblxuXHRcdC8vIGFic29sdXRlbHktcG9zaXRpb25lZCBvdmVybGF5IG9uIHRvcCBvZiBhbnkgcHJldmlvdXNseS1vcGVuIGVkaXRvciBhbmRcblx0XHQvLyBkaXNwb3NlcyBpdHNlbGYgb24gc2F2ZS9jYW5jZWwuIFRoaXMgZ2l2ZXMgdXMgdGhlIHN0YWNraW5nIGJlaGF2aW9yIHRoZVxuXHRcdC8vIHVzZXIgZXhwZWN0cyB3aGVuIHRha2luZyBtdWx0aXBsZSBzY3JlZW5zaG90cyBpbiBhIHJvdyBcdTIwMTQgdGhlIHRvcG1vc3Rcblx0XHQvLyBlZGl0b3IgaGFuZGxlcyBzYXZlL2NhbmNlbCwgdGhlbiB0aGUgcHJldmlvdXMgb25lIGJlY29tZXMgdmlzaWJsZVxuXHRcdC8vIGFnYWluLlxuXHRcdGNvbnN0IHNjcmVlbnNob3QgPSB0aGlzLnNjcmVlbnNob3RzW2luZGV4XTtcblx0XHRjb25zdCBlZGl0b3IgPSBuZXcgU2NyZWVuc2hvdEFubm90YXRpb25FZGl0b3Ioc2NyZWVuc2hvdCwgdGhpcy53aXphcmRQYW5lbCwgc2NyZWVuc2hvdC5hbm5vdGF0aW9uU3RhdGUpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGVkaXRvcik7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRTYXZlKCh7IGRhdGFVcmwsIHN0YXRlIH0pID0+IHtcblx0XHRcdHNjcmVlbnNob3QuYW5ub3RhdGVkRGF0YVVybCA9IGRhdGFVcmw7XG5cdFx0XHRzY3JlZW5zaG90LmFubm90YXRpb25TdGF0ZSA9IHN0YXRlO1xuXHRcdFx0dGhpcy51cGRhdGVBdHRhY2htZW50Vmlld3MoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNobWVudHMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGVkaXRvci5vbkRpZENhbmNlbCgoKSA9PiB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvLCBlZGl0b3IgZGlzcG9zZXMgaXRzZWxmXG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0U2NyZWVuc2hvdHMoKTogcmVhZG9ubHkgSVNjcmVlbnNob3RbXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2NyZWVuc2hvdHM7XG5cdH1cblxuXHRnZXRSZWNvcmRpbmdzKCk6IHJlYWRvbmx5IHsgZmlsZVBhdGg6IHN0cmluZzsgZHVyYXRpb25NczogbnVtYmVyOyB0aHVtYm5haWxEYXRhVXJsPzogc3RyaW5nIH1bXSB7XG5cdFx0cmV0dXJuIHRoaXMucmVjb3JkaW5ncztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlIHRoZSBjdXJyZW50IGF0dGFjaG1lbnRzIHdpdGggYSBwcmV2aW91c2x5LWNhcHR1cmVkIHNldC4gVXNlZCB3aGVuIHRoZVxuXHQgKiBpc3N1ZSByZXBvcnRlciBlZGl0b3IgaXMgbW92ZWQgYmV0d2VlbiB0aGUgbWFpbiBlZGl0b3IgYXJlYSBhbmQgYSBtb2RhbCBlZGl0b3Jcblx0ICogcGFydCBpbiB0aGUgQWdlbnRzIFdpbmRvdywgd2hpY2ggcmVidWlsZHMgdGhlIHdpemFyZCBhbmQgd291bGQgb3RoZXJ3aXNlIGRyb3Bcblx0ICogdGhlIGluLW1lbW9yeSBzY3JlZW5zaG90cyBhbmQgcmVjb3JkaW5ncy4gRG9lcyBub3QgZmlyZVxuXHQgKiBgb25EaWRDaGFuZ2VBdHRhY2htZW50c2Agc2luY2UgdGhlIGhvc3QgaXMgdGhlIHNvdXJjZSBvZiB0aGlzIHN0YXRlLlxuXHQgKi9cblx0cmVzdG9yZUF0dGFjaG1lbnRzKHNjcmVlbnNob3RzOiByZWFkb25seSBJU2NyZWVuc2hvdFtdLCByZWNvcmRpbmdzOiByZWFkb25seSB7IGZpbGVQYXRoOiBzdHJpbmc7IGR1cmF0aW9uTXM6IG51bWJlcjsgdGh1bWJuYWlsRGF0YVVybD86IHN0cmluZyB9W10pOiB2b2lkIHtcblx0XHR0aGlzLnNjcmVlbnNob3RzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5zY3JlZW5zaG90cy5wdXNoKC4uLnNjcmVlbnNob3RzLnNsaWNlKDAsIE1BWF9BVFRBQ0hNRU5UUykpO1xuXHRcdHRoaXMucmVjb3JkaW5ncy5sZW5ndGggPSAwO1xuXHRcdHRoaXMucmVjb3JkaW5ncy5wdXNoKC4uLnJlY29yZGluZ3Muc2xpY2UoMCwgTWF0aC5tYXgoMCwgTUFYX0FUVEFDSE1FTlRTIC0gdGhpcy5zY3JlZW5zaG90cy5sZW5ndGgpKSk7XG5cdFx0dGhpcy51cGRhdGVBdHRhY2htZW50Vmlld3MoKTtcblx0XHR0aGlzLnVwZGF0ZUF0dGFjaG1lbnRCdXR0b25zKCk7XG5cdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRJc3N1ZUJvZHkoKTogc3RyaW5nIHtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS50cmltKCk7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGUoe1xuXHRcdFx0aXNzdWVEZXNjcmlwdGlvbjogZGVzY3JpcHRpb24sXG5cdFx0XHRpc3N1ZVR5cGU6IHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPz8gSXNzdWVUeXBlLkJ1Zyxcblx0XHRcdGluY2x1ZGVTeXN0ZW1JbmZvOiB0aGlzLmluY2x1ZGVTeXN0ZW1JbmZvLFxuXHRcdFx0aW5jbHVkZVByb2Nlc3NJbmZvOiB0aGlzLmluY2x1ZGVQcm9jZXNzSW5mbyxcblx0XHRcdGluY2x1ZGVXb3Jrc3BhY2VJbmZvOiB0aGlzLmluY2x1ZGVXb3Jrc3BhY2VJbmZvLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbnM6IHRoaXMuaW5jbHVkZUV4dGVuc2lvbnMsXG5cdFx0XHRpbmNsdWRlRXhwZXJpbWVudHM6IHRoaXMuaW5jbHVkZUV4cGVyaW1lbnRzLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbkRhdGE6IHRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLm1vZGVsLmdldERhdGEoKTtcblx0XHRjb25zdCBzZWN0aW9uczogc3RyaW5nW10gPSBbXG5cdFx0XHRgIyMjIERlc2NyaXB0aW9uXFxuXFxuJHtkZXNjcmlwdGlvbn1gLFxuXHRcdFx0dGhpcy5nZW5lcmF0ZUlzc3VlRGV0YWlsc01kKCksXG5cdFx0XTtcblxuXHRcdGlmICh0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhICYmIG1vZGVsRGF0YS5leHRlbnNpb25EYXRhKSB7XG5cdFx0XHRzZWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlRGV0YWlscygnRXh0ZW5zaW9uIERhdGEnLCBtb2RlbERhdGEuZXh0ZW5zaW9uRGF0YSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmluY2x1ZGVTeXN0ZW1JbmZvICYmIChtb2RlbERhdGEudmVyc2lvbkluZm8gfHwgbW9kZWxEYXRhLnN5c3RlbUluZm8gfHwgbW9kZWxEYXRhLnN5c3RlbUluZm9XZWIpKSB7XG5cdFx0XHRzZWN0aW9ucy5wdXNoKHRoaXMuZ2VuZXJhdGVTeXN0ZW1JbmZvTWQoKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFtb2RlbERhdGEuZmlsZU9uRXh0ZW5zaW9uICYmICFtb2RlbERhdGEuZmlsZU9uTWFya2V0cGxhY2UgJiYgdGhpcy5pbmNsdWRlRXh0ZW5zaW9ucykge1xuXHRcdFx0c2VjdGlvbnMucHVzaCh0aGlzLmdlbmVyYXRlRXh0ZW5zaW9uc01kKCkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmluY2x1ZGVFeHBlcmltZW50cyAmJiBtb2RlbERhdGEuZXhwZXJpbWVudEluZm8pIHtcblx0XHRcdHNlY3Rpb25zLnB1c2godGhpcy5jcmVhdGVEZXRhaWxzKCdBL0IgRXhwZXJpbWVudHMnLCB0aGlzLmNyZWF0ZUNvZGVCbG9jayhtb2RlbERhdGEuZXhwZXJpbWVudEluZm8pKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlICYmICFtb2RlbERhdGEuZmlsZU9uTWFya2V0cGxhY2UpIHtcblx0XHRcdGlmICh0aGlzLmluY2x1ZGVQcm9jZXNzSW5mbyAmJiBtb2RlbERhdGEucHJvY2Vzc0luZm8pIHtcblx0XHRcdFx0c2VjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZURldGFpbHMoJ1J1bm5pbmcgUHJvY2Vzc2VzJywgdGhpcy5jcmVhdGVDb2RlQmxvY2sobW9kZWxEYXRhLnByb2Nlc3NJbmZvKSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaW5jbHVkZVdvcmtzcGFjZUluZm8gJiYgbW9kZWxEYXRhLndvcmtzcGFjZUluZm8pIHtcblx0XHRcdFx0c2VjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZURldGFpbHMoJ1dvcmtzcGFjZSBNZXRhZGF0YScsIHRoaXMuY3JlYXRlQ29kZUJsb2NrKG1vZGVsRGF0YS53b3Jrc3BhY2VJbmZvKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNlY3Rpb25zLnB1c2goJzwhLS0gZ2VuZXJhdGVkIGJ5IGlzc3VlIHJlcG9ydGVyIC0tPicpO1xuXG5cdFx0cmV0dXJuIHNlY3Rpb25zLmpvaW4oJ1xcblxcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZUlzc3VlRGV0YWlsc01kKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5tb2RlbC5nZXREYXRhKCk7XG5cdFx0Y29uc3Qgcm93czogW3N0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkXVtdID0gW1xuXHRcdFx0WydJc3N1ZSBDYXRlZ29yeScsIHRoaXMuZ2V0SXNzdWVUeXBlVGl0bGUodGhpcy5zZWxlY3RlZElzc3VlVHlwZSA/PyBJc3N1ZVR5cGUuQnVnKV0sXG5cdFx0XHRbJ1RhcmdldCcsIHRoaXMuZ2V0SXNzdWVTb3VyY2VMYWJlbCgpXSxcblx0XHRcdFsnVlMgQ29kZSBWZXJzaW9uJywgbW9kZWxEYXRhLnZlcnNpb25JbmZvPy52c2NvZGVWZXJzaW9uID8/IHByb2R1Y3QudmVyc2lvbl0sXG5cdFx0XHRbJ09TIFZlcnNpb24nLCBtb2RlbERhdGEudmVyc2lvbkluZm8/Lm9zID8/IG1vZGVsRGF0YS5zeXN0ZW1JbmZvPy5vc10sXG5cdFx0XTtcblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLkV4dGVuc2lvbiAmJiB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRyb3dzLnB1c2goXG5cdFx0XHRcdFsnRXh0ZW5zaW9uIElkZW50aWZpZXInLCB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uLmlkXSxcblx0XHRcdFx0WydFeHRlbnNpb24gVmVyc2lvbicsIHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24udmVyc2lvbl0sXG5cdFx0XHRcdFsnRXh0ZW5zaW9uIFB1Ymxpc2hlcicsIHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24ucHVibGlzaGVyXSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGAjIyMgSXNzdWUgRGV0YWlsc1xcblxcbiR7dGhpcy5jcmVhdGVNYXJrZG93blRhYmxlKHJvd3MpfWA7XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlU3lzdGVtSW5mb01kKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5tb2RlbC5nZXREYXRhKCk7XG5cdFx0Y29uc3Qgcm93czogW3N0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkXVtdID0gW107XG5cblx0XHRpZiAobW9kZWxEYXRhLnZlcnNpb25JbmZvKSB7XG5cdFx0XHRyb3dzLnB1c2goXG5cdFx0XHRcdFsnVlMgQ29kZSBWZXJzaW9uJywgbW9kZWxEYXRhLnZlcnNpb25JbmZvLnZzY29kZVZlcnNpb25dLFxuXHRcdFx0XHRbJ09TIFZlcnNpb24nLCBtb2RlbERhdGEudmVyc2lvbkluZm8ub3NdLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWxEYXRhLnN5c3RlbUluZm8pIHtcblx0XHRcdHJvd3MucHVzaChcblx0XHRcdFx0WydDUFVzJywgbW9kZWxEYXRhLnN5c3RlbUluZm8uY3B1c10sXG5cdFx0XHRcdFsnR1BVIFN0YXR1cycsIE9iamVjdC5rZXlzKG1vZGVsRGF0YS5zeXN0ZW1JbmZvLmdwdVN0YXR1cykubWFwKGtleSA9PiBgJHtrZXl9OiAke21vZGVsRGF0YS5zeXN0ZW1JbmZvIS5ncHVTdGF0dXNba2V5XX1gKS5qb2luKCc8YnI+JyldLFxuXHRcdFx0XHRbJ0xvYWQgKGF2ZyknLCBtb2RlbERhdGEuc3lzdGVtSW5mby5sb2FkXSxcblx0XHRcdFx0WydNZW1vcnkgKFN5c3RlbSknLCBtb2RlbERhdGEuc3lzdGVtSW5mby5tZW1vcnldLFxuXHRcdFx0XHRbJ1Byb2Nlc3MgQXJndicsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLnByb2Nlc3NBcmdzXSxcblx0XHRcdFx0WydTY3JlZW4gUmVhZGVyJywgbW9kZWxEYXRhLnN5c3RlbUluZm8uc2NyZWVuUmVhZGVyXSxcblx0XHRcdFx0WydWTScsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLnZtSGludF0sXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAobW9kZWxEYXRhLnN5c3RlbUluZm8ubGludXhFbnYpIHtcblx0XHRcdFx0cm93cy5wdXNoKFxuXHRcdFx0XHRcdFsnREVTS1RPUF9TRVNTSU9OJywgbW9kZWxEYXRhLnN5c3RlbUluZm8ubGludXhFbnYuZGVza3RvcFNlc3Npb25dLFxuXHRcdFx0XHRcdFsnWERHX0NVUlJFTlRfREVTS1RPUCcsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLmxpbnV4RW52LnhkZ0N1cnJlbnREZXNrdG9wXSxcblx0XHRcdFx0XHRbJ1hER19TRVNTSU9OX0RFU0tUT1AnLCBtb2RlbERhdGEuc3lzdGVtSW5mby5saW51eEVudi54ZGdTZXNzaW9uRGVza3RvcF0sXG5cdFx0XHRcdFx0WydYREdfU0VTU0lPTl9UWVBFJywgbW9kZWxEYXRhLnN5c3RlbUluZm8ubGludXhFbnYueGRnU2Vzc2lvblR5cGVdLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHJlbW90ZSBvZiBtb2RlbERhdGEuc3lzdGVtSW5mby5yZW1vdGVEYXRhKSB7XG5cdFx0XHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihyZW1vdGUpKSB7XG5cdFx0XHRcdFx0cm93cy5wdXNoKFsnUmVtb3RlIEVycm9yJywgcmVtb3RlLmVycm9yTWVzc2FnZV0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJvd3MucHVzaChcblx0XHRcdFx0XHRcdFsnUmVtb3RlJywgcmVtb3RlLmxhdGVuY3kgPyBgJHtyZW1vdGUuaG9zdE5hbWV9IChsYXRlbmN5OiAke3JlbW90ZS5sYXRlbmN5LmN1cnJlbnQudG9GaXhlZCgyKX1tcyBsYXN0LCAke3JlbW90ZS5sYXRlbmN5LmF2ZXJhZ2UudG9GaXhlZCgyKX1tcyBhdmVyYWdlKWAgOiByZW1vdGUuaG9zdE5hbWVdLFxuXHRcdFx0XHRcdFx0WydSZW1vdGUgT1MnLCByZW1vdGUubWFjaGluZUluZm8ub3NdLFxuXHRcdFx0XHRcdFx0WydSZW1vdGUgQ1BVcycsIHJlbW90ZS5tYWNoaW5lSW5mby5jcHVzXSxcblx0XHRcdFx0XHRcdFsnUmVtb3RlIE1lbW9yeSAoU3lzdGVtKScsIHJlbW90ZS5tYWNoaW5lSW5mby5tZW1vcnldLFxuXHRcdFx0XHRcdFx0WydSZW1vdGUgVk0nLCByZW1vdGUubWFjaGluZUluZm8udm1IaW50XSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsRGF0YS5zeXN0ZW1JbmZvV2ViKSB7XG5cdFx0XHRyb3dzLnB1c2goWydVc2VyIEFnZW50JywgbW9kZWxEYXRhLnN5c3RlbUluZm9XZWJdKTtcblx0XHR9XG5cdFx0cm93cy5wdXNoKFsnSW5zdGFsbGF0aW9uIHB1cmUnLCBTdHJpbmcobW9kZWxEYXRhLmlzSW5zdGFsbGF0aW9uUHVyZSA/PyB0cnVlKV0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlRGV0YWlscygnU3lzdGVtIEluZm8nLCB0aGlzLmNyZWF0ZU1hcmtkb3duVGFibGUocm93cykpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZUV4dGVuc2lvbnNNZCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IHRoaXMubW9kZWwuZ2V0RGF0YSgpO1xuXHRcdGNvbnN0IG5vblRoZW1lRXh0ZW5zaW9ucyA9IChtb2RlbERhdGEuZW5hYmxlZE5vblRoZW1lRXh0ZXNpb25zID8/IG1vZGVsRGF0YS5hbGxFeHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4gIWV4dGVuc2lvbi5pc1RoZW1lICYmICFleHRlbnNpb24uaXNCdWlsdGluKSk7XG5cdFx0aWYgKG1vZGVsRGF0YS5leHRlbnNpb25zRGlzYWJsZWQpIHtcblx0XHRcdHJldHVybiAnIyMjIEV4dGVuc2lvbnNcXG5cXG5FeHRlbnNpb25zIGRpc2FibGVkLic7XG5cdFx0fVxuXG5cdFx0aWYgKCFub25UaGVtZUV4dGVuc2lvbnMubGVuZ3RoICYmICFtb2RlbERhdGEubnVtYmVyT2ZUaGVtZUV4dGVzaW9ucykge1xuXHRcdFx0cmV0dXJuICcjIyMgRXh0ZW5zaW9uc1xcblxcbkV4dGVuc2lvbnM6IG5vbmUnO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvd3MgPSBub25UaGVtZUV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBbXG5cdFx0XHRleHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLm5hbWUsXG5cdFx0XHRleHRlbnNpb24uaWQsXG5cdFx0XHRleHRlbnNpb24ucHVibGlzaGVyID8/ICdOL0EnLFxuXHRcdFx0ZXh0ZW5zaW9uLnZlcnNpb24sXG5cdFx0XSBhcyBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZywgc3RyaW5nXSk7XG5cdFx0Y29uc3QgZGV0YWlsczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAocm93cy5sZW5ndGgpIHtcblx0XHRcdGRldGFpbHMucHVzaCh0aGlzLmNyZWF0ZU1hcmtkb3duVGFibGUocm93cywgWydOYW1lJywgJ0lkZW50aWZpZXInLCAnQXV0aG9yJywgJ1ZlcnNpb24nXSkpO1xuXHRcdH1cblx0XHRpZiAobW9kZWxEYXRhLm51bWJlck9mVGhlbWVFeHRlc2lvbnMpIHtcblx0XHRcdGRldGFpbHMucHVzaChgVGhlbWUgZXh0ZW5zaW9uczogJHttb2RlbERhdGEubnVtYmVyT2ZUaGVtZUV4dGVzaW9uc31gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVEZXRhaWxzKGBFeHRlbnNpb25zICgke25vblRoZW1lRXh0ZW5zaW9ucy5sZW5ndGh9KWAsIGRldGFpbHMuam9pbignXFxuXFxuJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJc3N1ZVR5cGVUaXRsZShpc3N1ZVR5cGU6IElzc3VlVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChpc3N1ZVR5cGUpIHtcblx0XHRcdGNhc2UgSXNzdWVUeXBlLkJ1Zzpcblx0XHRcdFx0cmV0dXJuICdCdWcnO1xuXHRcdFx0Y2FzZSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZTpcblx0XHRcdFx0cmV0dXJuICdQZXJmb3JtYW5jZSBJc3N1ZSc7XG5cdFx0XHRjYXNlIElzc3VlVHlwZS5GZWF0dXJlUmVxdWVzdDpcblx0XHRcdFx0cmV0dXJuICdGZWF0dXJlIFJlcXVlc3QnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGV0YWlscyhzdW1tYXJ5OiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGA8ZGV0YWlscz5cbjxzdW1tYXJ5PiR7c3VtbWFyeX08L3N1bW1hcnk+XG5cbiR7Y29udGVudH1cblxuPC9kZXRhaWxzPmA7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvZGVCbG9jayhjb250ZW50OiBzdHJpbmcsIGxhbmd1YWdlID0gJycpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgXFxgXFxgXFxgJHtsYW5ndWFnZX1cbiR7Y29udGVudC50cmltRW5kKCl9XG5cXGBcXGBcXGBgO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVNYXJrZG93blRhYmxlKHJvd3M6IHJlYWRvbmx5IChyZWFkb25seSAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKVtdLCBoZWFkZXJzOiByZWFkb25seSBzdHJpbmdbXSA9IFsnSXRlbScsICdWYWx1ZSddKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7aGVhZGVycy5tYXAoaGVhZGVyID0+IHRoaXMuZXNjYXBlTWFya2Rvd25UYWJsZUNlbGwoaGVhZGVyKSkuam9pbignfCcpfVxuJHtoZWFkZXJzLm1hcCgoKSA9PiAnLS0tJykuam9pbignfCcpfVxuJHtyb3dzLm1hcChyb3cgPT4gcm93Lm1hcCh2YWx1ZSA9PiB0aGlzLmVzY2FwZU1hcmtkb3duVGFibGVDZWxsKHZhbHVlID8/ICcnKSkuam9pbignfCcpKS5qb2luKCdcXG4nKX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBlc2NhcGVNYXJrZG93blRhYmxlQ2VsbCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxyP1xcbi9nLCAnPGJyPicpLnJlcGxhY2UoL1xcfC9nLCAnXFxcXHwnKTtcblx0fVxuXG5cdHNldFVwZGF0ZUF2YWlsYWJsZShzaG93VXBkYXRlQmFubmVyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zaG93VXBkYXRlQmFubmVyID0gc2hvd1VwZGF0ZUJhbm5lcjtcblx0XHR0aGlzLnVwZGF0ZUJhbm5lci5zdHlsZS5kaXNwbGF5ID0gc2hvd1VwZGF0ZUJhbm5lciA/ICcnIDogJ25vbmUnO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy53aXphcmRQYW5lbC5mb2N1cygpO1xuXHR9XG5cblx0Z2V0UGFuZWwoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLndpemFyZFBhbmVsO1xuXHR9XG5cblx0Z2V0IHJlY29yZGluZ1N0YXRlKCk6IFJlY29yZGluZ1N0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGU7XG5cdH1cblxuXHRoaWRlRmxvYXRpbmdCYXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZmxvYXRpbmdCYXIpIHtcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdH1cblxuXHRzaG93RmxvYXRpbmdCYXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZmxvYXRpbmdCYXIpIHtcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdGdldCBzaG91bGRIaWRlVG9vbGJhckZvckNhcHR1cmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hpZGVUb29sYmFySW5TY3JlZW5zaG90cztcblx0fVxuXG5cdC8qKiBSZS1wYXJlbnQgdGhlIGZsb2F0aW5nIGJhciBpbnRvIHRoZSB3aXphcmQncyBjdXJyZW50IHdpbmRvdy4gKi9cblx0cmVwYXJlbnRGbG9hdGluZ0JhcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZmxvYXRpbmdCYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKTtcblx0XHQvLyBNb3VudCBpbnNpZGUgLm1vbmFjby13b3JrYmVuY2ggc28gdGhlbWUgQ1NTIHZhcnMgY2FzY2FkZS4gRmFsbCBiYWNrIHRvXG5cdFx0Ly8gZG9jdW1lbnQuYm9keSB3aGVuIG5vIHdvcmtiZW5jaCByb290IGlzIHByZXNlbnQgKHNob3VsZG4ndCBoYXBwZW4gaW5cblx0XHQvLyBwcmFjdGljZSBidXQga2VlcHMgdGhlIGJhciB2aXNpYmxlIHJlZ2FyZGxlc3MpLlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXdvcmtiZW5jaCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRjb25zdCBtb3VudFRhcmdldCA9IHdvcmtiZW5jaCA/PyB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuYm9keTtcblx0XHRpZiAodGhpcy5mbG9hdGluZ0Jhci5wYXJlbnRFbGVtZW50ICE9PSBtb3VudFRhcmdldCkge1xuXHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5yZW1vdmUoKTtcblx0XHRcdG1vdW50VGFyZ2V0LmFwcGVuZENoaWxkKHRoaXMuZmxvYXRpbmdCYXIpO1xuXHRcdFx0Ly8gUmVzZXQgcG9zaXRpb24gc28gaXQgYXBwZWFycyBpbiB0aGUgbmV3IHdpbmRvd1xuXHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS5sZWZ0ID0gJyc7XG5cdFx0XHR0aGlzLmZsb2F0aW5nQmFyLnN0eWxlLnRvcCA9ICcnO1xuXHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS5yaWdodCA9ICczMCUnO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBVcGRhdGUgdGhlIGludGVybmFsIG1vZGVsIHdpdGggYWRkaXRpb25hbCBkYXRhIGxvYWRlZCBhc3luY2hyb25vdXNseSAqL1xuXHR1cGRhdGVNb2RlbChuZXdEYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwudXBkYXRlKG5ld0RhdGEpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KG5ld0RhdGEuYWxsRXh0ZW5zaW9ucykpIHtcblx0XHRcdHRoaXMuZGF0YS5lbmFibGVkRXh0ZW5zaW9ucyA9IG5ld0RhdGEuYWxsRXh0ZW5zaW9ucyBhcyBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YVtdO1xuXHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25PcHRpb25zKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlRmxhZ3MoKTtcblx0XHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VCdXR0b25zKCk7XG5cdFx0fVxuXHRcdC8vIFJlZnJlc2ggcmV2aWV3IGRldGFpbHMgaWYgd2UncmUgb24gdGhlIHJldmlldyBzdGVwIChhc3luYyBkYXRhIG1heSBoYXZlIGFycml2ZWQpXG5cdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVJldmlld0RldGFpbHMoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ2FsbGVkIG9uY2UgcGVyZm9ybWFuY2UgaW5mbyBoYXMgcmVzb2x2ZWQ7IHN1cHByZXNzZXMgXCJMb2FkaW5nXHUyMDI2XCIgcGxhY2Vob2xkZXJzLiAqL1xuXHRtYXJrUGVyZm9ybWFuY2VJbmZvTG9hZGVkKCk6IHZvaWQge1xuXHRcdHRoaXMucGVyZm9ybWFuY2VJbmZvTG9hZGVkID0gdHJ1ZTtcblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdHRoaXMudXBkYXRlUmV2aWV3RGV0YWlscygpO1xuXHRcdFx0Ly8gUmUtZW5hYmxlIHRoZSBQcmV2aWV3IGJ1dHRvbiBub3cgdGhhdCBkaWFnbm9zdGljcyBhcmUgcmVhZHkuXG5cdFx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdH1cblx0fVxuXG5cdGhhc1Vuc2F2ZWRDaGFuZ2VzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnByZXZpZXdPcGVuZWQgJiYgdGhpcy5wcmV2aWV3ZWREcmFmdEtleSA9PT0gdGhpcy5nZXREcmFmdEtleSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmhhc1VzZXJJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNVc2VySW5wdXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhKFxuXHRcdFx0dGhpcy5oYXNEZXNjcmlwdGlvbkNvbnRlbnQoKSB8fFxuXHRcdFx0dGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKSB8fFxuXHRcdFx0dGhpcy5zZWxlY3RlZElzc3VlVHlwZSAhPT0gdW5kZWZpbmVkIHx8XG5cdFx0XHR0aGlzLnNjcmVlbnNob3RzLmxlbmd0aCA+IDAgfHxcblx0XHRcdHRoaXMucmVjb3JkaW5ncy5sZW5ndGggPiAwXG5cdFx0KTtcblx0fVxuXG5cdG1hcmtQcmV2aWV3T3BlbmVkKCk6IHZvaWQge1xuXHRcdHRoaXMucHJldmlld09wZW5lZCA9IHRydWU7XG5cdFx0dGhpcy5wcmV2aWV3ZWREcmFmdEtleSA9IHRoaXMuZ2V0RHJhZnRLZXkoKTtcblx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREcmFmdEtleSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHR0aXRsZTogdGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpLFxuXHRcdFx0aXNzdWVUeXBlOiB0aGlzLnNlbGVjdGVkSXNzdWVUeXBlLFxuXHRcdFx0aXNzdWVTb3VyY2U6IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uPy5pZCxcblx0XHRcdGluY2x1ZGVTeXN0ZW1JbmZvOiB0aGlzLmluY2x1ZGVTeXN0ZW1JbmZvLFxuXHRcdFx0aW5jbHVkZVByb2Nlc3NJbmZvOiB0aGlzLmluY2x1ZGVQcm9jZXNzSW5mbyxcblx0XHRcdGluY2x1ZGVXb3Jrc3BhY2VJbmZvOiB0aGlzLmluY2x1ZGVXb3Jrc3BhY2VJbmZvLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbnM6IHRoaXMuaW5jbHVkZUV4dGVuc2lvbnMsXG5cdFx0XHRpbmNsdWRlRXhwZXJpbWVudHM6IHRoaXMuaW5jbHVkZUV4cGVyaW1lbnRzLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbkRhdGE6IHRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEsXG5cdFx0XHRzY3JlZW5zaG90czogdGhpcy5zY3JlZW5zaG90cy5tYXAoc2NyZWVuc2hvdCA9PiBzY3JlZW5zaG90LmFubm90YXRlZERhdGFVcmwgPz8gc2NyZWVuc2hvdC5kYXRhVXJsKSxcblx0XHRcdHJlY29yZGluZ3M6IHRoaXMucmVjb3JkaW5ncy5tYXAocmVjb3JkaW5nID0+IHJlY29yZGluZy5maWxlUGF0aCksXG5cdFx0fSk7XG5cdH1cblxuXHQvKiogU2V0IHRoZSB0aXRsZSBpbnB1dCB2YWx1ZSAoZS5nLiwgZnJvbSBBSSBnZW5lcmF0aW9uKSAqL1xuXHRzZXRHZW5lcmF0ZWRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50aXRsZUlucHV0LnZhbHVlID0gdGl0bGU7XG5cdFx0aWYgKHRpdGxlLnRyaW0oKSkge1xuXHRcdFx0dGhpcy5zZXRGaWVsZEVycm9yKHRoaXMudGl0bGVJbnB1dC5lbGVtZW50LCB0aGlzLnRpdGxlRXJyb3IsIGZhbHNlKTtcblx0XHR9XG5cdFx0dGhpcy5yZXNldEdlbmVyYXRlQnV0dG9uKCk7XG5cdH1cblxuXHRyZXNldEdlbmVyYXRlQnV0dG9uKCk6IHZvaWQge1xuXHRcdHRoaXMuZ2VuZXJhdGVUaXRsZUJ0bi5sYWJlbCA9IGAkKHNwYXJrbGUpICR7bG9jYWxpemUoJ2dlbmVyYXRlVGl0bGVCdG4nLCBcIkdlbmVyYXRlIGZyb20gZGVzY3JpcHRpb25cIil9YDtcblx0XHR0aGlzLmdlbmVyYXRlVGl0bGVCdG4uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdsb2FkaW5nJyk7XG5cdFx0dGhpcy5nZW5lcmF0ZVRpdGxlQnRuLmVsZW1lbnQuc3R5bGUubWluV2lkdGggPSAnJztcblx0XHR0aGlzLmdlbmVyYXRlVGl0bGVCdG4uZW5hYmxlZCA9IHRoaXMuaGFzRGVzY3JpcHRpb25Db250ZW50KCk7XG5cdH1cblxuXHQvKiogU2hvdyBhIFwiQ2xvc2VcIiBidXR0b24gbmV4dCB0byB0aGUgc3VibWl0IGJ1dHRvbiBhZnRlciBzdWNjZXNzZnVsIHN1Ym1pc3Npb24gKi9cblx0c2hvd0Nsb3NlQnV0dG9uKCk6IHZvaWQge1xuXHRcdC8vIEFkZCBjbG9zZSBidXR0b24gbmV4dCB0byB0aGUgZXhpc3RpbmcgcHJldmlldyBidXR0b25cblx0XHRjb25zdCBuYXYgPSB0aGlzLm5leHRCdXR0b24uZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGlmIChuYXYgJiYgIW5hdi5xdWVyeVNlbGVjdG9yKCcud2l6YXJkLWNsb3NlLWJ0bicpKSB7XG5cdFx0XHR0aGlzLmNsb3NlQnV0dG9uID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihuYXYsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRcdHRoaXMuY2xvc2VCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY2xvc2VUYWInLCBcIkNsb3NlXCIpO1xuXHRcdFx0dGhpcy5jbG9zZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dpemFyZC1jbG9zZS1idG4nKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuY2xvc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHR9XG5cblx0c2V0UmVjb3JkaW5nU3RhdGUoc3RhdGU6IFJlY29yZGluZ1N0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgPSBzdGF0ZTtcblxuXHRcdGlmIChzdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHR0aGlzLnJlY29yZGluZ1N0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cblx0XHRcdGNvbnN0IGZvcm1hdFRpbWUgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVsYXBzZWQgPSBNYXRoLmZsb29yKChEYXRlLm5vdygpIC0gdGhpcy5yZWNvcmRpbmdTdGFydFRpbWUpIC8gMTAwMCk7XG5cdFx0XHRcdGNvbnN0IG1pbnMgPSBNYXRoLmZsb29yKGVsYXBzZWQgLyA2MCkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpO1xuXHRcdFx0XHRjb25zdCBzZWNzID0gKGVsYXBzZWQgJSA2MCkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpO1xuXHRcdFx0XHRyZXR1cm4gYCR7bWluc306JHtzZWNzfWA7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzdG9wTGFiZWwgPSBsb2NhbGl6ZSgnc3RvcFJlY29yZGluZycsIFwiU3RvcCByZWNvcmRpbmdcIik7XG5cdFx0XHRjb25zdCBtYWtlTGFiZWwgPSAoKSA9PiBgJChzdG9wLWNpcmNsZSkgJHtzdG9wTGFiZWx9ICR7Zm9ybWF0VGltZSgpfWA7XG5cblx0XHRcdGlmICh0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bikge1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3JlY29yZGluZycpO1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5lbGVtZW50LnRpdGxlID0gc3RvcExhYmVsO1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5sYWJlbCA9IG1ha2VMYWJlbCgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlY29yZGluZ0VsYXBzZWRUaW1lciA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4pIHtcblx0XHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5sYWJlbCA9IG1ha2VMYWJlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMDAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQmFjayB0byBpZGxlXG5cdFx0XHRpZiAodGhpcy5yZWNvcmRpbmdFbGFwc2VkVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRnZXRXaW5kb3codGhpcy5jb250YWluZXIpLmNsZWFySW50ZXJ2YWwodGhpcy5yZWNvcmRpbmdFbGFwc2VkVGltZXIpO1xuXHRcdFx0XHR0aGlzLnJlY29yZGluZ0VsYXBzZWRUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuKSB7XG5cdFx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgncmVjb3JkaW5nJyk7XG5cdFx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLmVsZW1lbnQudGl0bGUgPSBsb2NhbGl6ZSgncmVjb3JkVmlkZW8nLCBcIlJlY29yZCB2aWRlb1wiKTtcblx0XHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4ubGFiZWwgPSBgJChyZWNvcmQpICR7bG9jYWxpemUoJ3JlY29yZFZpZGVvJywgXCJSZWNvcmQgdmlkZW9cIil9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVNjcmVlbnNob3RUaHVtYm5haWxzKCk7XG5cdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHR9XG5cblx0YWRkUmVjb3JkaW5nKGZpbGVQYXRoOiBzdHJpbmcsIGR1cmF0aW9uTXM6IG51bWJlciwgdGh1bWJuYWlsRGF0YVVybD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucmVjb3JkaW5ncy5wdXNoKHsgZmlsZVBhdGgsIGR1cmF0aW9uTXMsIHRodW1ibmFpbERhdGFVcmwgfSk7XG5cdFx0Ly8gTmF2aWdhdGUgdG8gdGhlIEF0dGFjaG1lbnRzIHN0ZXAgc28gdGhlIHVzZXIgc2VlcyB0aGUgc2F2ZWQgcmVjb3JkaW5nLlxuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwICE9PSBXaXphcmRTdGVwLkF0dGFjaG1lbnRzKSB7XG5cdFx0XHR0aGlzLnNldFN0ZXAoV2l6YXJkU3RlcC5BdHRhY2htZW50cyk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQXR0YWNobWVudFZpZXdzKCk7XG5cdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBdHRhY2htZW50cy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUF0dGFjaG1lbnRWaWV3cygpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVNjcmVlbnNob3RUaHVtYm5haWxzKCk7XG5cdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVJldmlld0RldGFpbHMoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVHJpZ2dlciBhIHNjcmVlbnNob3QgY2FwdHVyZSBhcyBpZiB0aGUgdXNlciBjbGlja2VkIHRoZSBzY3JlZW5zaG90IGJ1dHRvblxuXHQgKiBvbiB0aGUgZmxvYXRpbmcgY2FwdHVyZSBiYXIuIFRoZSBmbG9hdGluZyBiYXIgaXMgbW91bnRlZCBhdCB0aGUgd29ya2JlbmNoXG5cdCAqIHJvb3QgYW5kIHRoZSBidXR0b24gaXMgZW5hYmxlZCByZWdhcmRsZXNzIG9mIHRoZSBjdXJyZW50IHdpemFyZCBzdGVwLCBzb1xuXHQgKiB0aGUgc2hvcnRjdXQgd29ya3MgZnJvbSBhbnkgc3RlcCB3aXRob3V0IGNoYW5naW5nIGl0LiBUaGUgZXhpc3Rpbmdcblx0ICogY2FwdHVyZSBmbG93IG9wZW5zIHRoZSBhbm5vdGF0aW9uIGVkaXRvciBhbmQgcmUtYWN0aXZhdGVzIHRoZSBpc3N1ZVxuXHQgKiByZXBvcnRlciBlZGl0b3Igd2hlbiB0aGUgc2NyZWVuc2hvdCBpcyBhZGRlZC5cblx0ICpcblx0ICogTm8tb3Agd2hlbiB0aGUgY2FwdHVyZSBidXR0b24gaXMgZGlzYWJsZWQgKGUuZy4gYXQgdGhlIGF0dGFjaG1lbnQgbGltaXQpLlxuXHQgKi9cblx0dHJpZ2dlckNhcHR1cmVTY3JlZW5zaG90KCk6IHZvaWQge1xuXHRcdGNvbnN0IGJ0biA9IHRoaXMuY2FwdHVyZVN0cmlwQ2FwdHVyZUJ0bjtcblx0XHRpZiAoIWJ0bj8uZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRidG4uZWxlbWVudC5jbGljaygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRvZ2dsZSBzY3JlZW4gcmVjb3JkaW5nIG9uL29mZiBhcyBpZiB0aGUgdXNlciBjbGlja2VkIHRoZSByZWNvcmQgYnV0dG9uLlxuXHQgKiBXb3JrcyBmcm9tIGFueSBzdGVwIHdpdGhvdXQgY2hhbmdpbmcgaXQuIE5vLW9wIHdoZW4gcmVjb3JkaW5nIGlzbid0XG5cdCAqIHN1cHBvcnRlZCBvciB0aGUgcmVjb3JkIGJ1dHRvbiBpcyBkaXNhYmxlZC5cblx0ICovXG5cdHRyaWdnZXJUb2dnbGVSZWNvcmRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnJlY29yZGluZ1N1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBidG4gPSB0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bjtcblx0XHRpZiAoIWJ0bj8uZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRidG4uZWxlbWVudC5jbGljaygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTaG9ydGN1dEtleWNhcChwYXJlbnQ6IEhUTUxFbGVtZW50LCBrZXliaW5kaW5nOiBSZXNvbHZlZEtleWJpbmRpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBLZXliaW5kaW5nTGFiZWwocGFyZW50LCBPUywgeyAuLi5kZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzIH0pKTtcblx0XHRsYWJlbC5zZXQoa2V5YmluZGluZyk7XG5cdFx0bGFiZWwuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtc2hvcnRjdXQnKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmVjb3JkaW5nRWxhcHNlZFRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuY2xlYXJJbnRlcnZhbCh0aGlzLnJlY29yZGluZ0VsYXBzZWRUaW1lcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNpbWlsYXJJc3N1ZXNIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuc2ltaWxhcklzc3Vlc0hhbmRsZSk7XG5cdFx0fVxuXHRcdHRoaXMuc2ltaWxhcklzc3Vlc1JlcXVlc3QrKztcblx0XHR0aGlzLnJldmlld1JlbmRlckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2xvc2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkU3VibWl0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RTY3JlZW5zaG90LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RTdGFydFJlY29yZGluZy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0U3RvcFJlY29yZGluZy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0T3BlblJlY29yZGluZy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0T3BlblNjcmVlbnNob3QuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNobWVudHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVx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
