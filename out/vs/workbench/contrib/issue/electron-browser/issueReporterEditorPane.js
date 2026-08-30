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
import "../browser/media/issueReporterOverlay.css";
import { $, append, clearNode } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { decodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { FileAccess } from "../../../../base/common/network.js";
import { IssueReporterOverlay } from "../browser/issueReporterOverlay.js";
import { IRecordingService, RecordingState } from "../browser/recordingService.js";
import { IScreenshotService } from "../browser/screenshotService.js";
import { IIssueFormService } from "../common/issue.js";
import { IProcessService } from "../../../../platform/process/common/process.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import product from "../../../../platform/product/common/product.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ChatMessageRole, ILanguageModelsService, getTextResponseFromStream } from "../../chat/common/languageModels.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isMacintosh } from "../../../../base/common/platform.js";
const IssueReporterOpenContext = new RawContextKey("issueReporterOpen", false);
let IssueReporterEditorPane = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, recordingService, screenshotService, logService, fileService, environmentService, editorService, issueFormService, processService, experimentService, contextMenuService, contextViewService, markdownRendererService, languageModelsService, notificationService, openerService, updateService, keybindingService, editorGroupsService, extensionService, configurationService) {
    super(IssueReporterEditorPane.ID, group, telemetryService, themeService, storageService);
    this.recordingService = recordingService;
    this.screenshotService = screenshotService;
    this.logService = logService;
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.editorService = editorService;
    this.issueFormService = issueFormService;
    this.processService = processService;
    this.experimentService = experimentService;
    this.contextMenuService = contextMenuService;
    this.contextViewService = contextViewService;
    this.markdownRendererService = markdownRendererService;
    this.languageModelsService = languageModelsService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.updateService = updateService;
    this.keybindingService = keybindingService;
    this.editorGroupsService = editorGroupsService;
    this.extensionService = extensionService;
    this.configurationService = configurationService;
    this.inputDisposables = this._register(new DisposableStore());
    IssueReporterEditorPane.liveInstances.add(this);
    this._register({ dispose: () => IssueReporterEditorPane.liveInstances.delete(this) });
  }
  static getAnyLiveInstance() {
    for (const inst of IssueReporterEditorPane.liveInstances) {
      if (inst.wizard) {
        return inst;
      }
    }
    return void 0;
  }
  getWizard() {
    return this.wizard;
  }
  /**
   * Bring this pane's tab to the front of its group and activate that group
   * so the wizard receives keyboard focus.
   */
  async revealAndActivate() {
    const input = this.wizardInput;
    if (!input) {
      return;
    }
    this.editorGroupsService.activateGroup(this.group);
    await this.editorService.openEditor(input, { activation: EditorActivation.ACTIVATE }, this.group);
  }
  createEditor(parent) {
    this.container = append(parent, $("div.issue-reporter-editor-tab"));
    this.container.style.height = "100%";
    this.container.style.overflow = "auto";
  }
  shouldShowUpdateBanner() {
    return this.updateService.state.type === StateType.AvailableForDownload || this.updateService.state.type === StateType.Ready || this.updateService.state.type === StateType.Downloaded;
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (token.isCancellationRequested || !this.container) {
      return;
    }
    this.wizardInput = input;
    if (this.wizard && this.container.contains(this.wizard.getPanel())) {
      this.wizard.reparentFloatingBar();
      this.wizard.showFloatingBar();
      this.wizard.setUpdateAvailable(this.shouldShowUpdateBanner());
      this.restoreAttachmentsFromInput(input);
      return;
    }
    this.inputDisposables.clear();
    clearNode(this.container);
    const data = input.data;
    if (!data) {
      const msg = append(this.container, $("p"));
      msg.textContent = localize("noData", "No issue reporter data available.");
      return;
    }
    this.wizard = new IssueReporterOverlay(
      data,
      this.recordingService.isSupported,
      this.container,
      this.contextViewService,
      this.contextMenuService,
      this.markdownRendererService,
      true,
      (extensionId) => this.issueFormService.sendReporterMenu(extensionId),
      async (url) => {
        await this.openerService.open(URI.parse(url), { openExternal: true });
      },
      this.shouldShowUpdateBanner(),
      () => this.refreshPerformanceInfo(),
      (commandId) => this.keybindingService.lookupKeybinding(commandId)
    );
    this.inputDisposables.add(this.wizard);
    this.inputDisposables.add(this.updateService.onStateChange(() => this.wizard?.setUpdateAvailable(this.shouldShowUpdateBanner())));
    input.hasUserInputFn = () => this.wizard?.hasUnsavedChanges() ?? false;
    this.inputDisposables.add(this.wizard.onDidClose(() => {
      input.hasUserInputFn = void 0;
      this.group.closeEditor(this.input);
    }));
    this.inputDisposables.add(input.onWillDispose(() => {
      this.destroyWizard();
    }));
    this.wizard.show();
    this.restoreAttachmentsFromInput(input);
    this.inputDisposables.add(this.wizard.onDidChangeAttachments(() => {
      input.savedScreenshots = this.wizard?.getScreenshots().slice();
      input.savedRecordings = this.wizard?.getRecordings().slice();
    }));
    void this.populateSystemInfo();
    this.inputDisposables.add(this.wizard.onDidRequestScreenshot(async () => {
      try {
        const shouldHide = this.wizard?.shouldHideToolbarForCapture ?? true;
        if (shouldHide) {
          this.wizard?.hideFloatingBar();
          await new Promise((r) => setTimeout(r, 100));
        }
        const dataUrl = await this.screenshotService.captureScreenshot();
        if (shouldHide) {
          setTimeout(() => this.wizard?.showFloatingBar(), 1e3);
        }
        if (!dataUrl || !this.wizard) {
          return;
        }
        const img = await new Promise((resolve, reject) => {
          const image = mainWindow.document.createElement("img");
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        this.wizard.addScreenshot({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        await this.revealAndActivate();
      } catch (err) {
        setTimeout(() => this.wizard?.showFloatingBar(), 1e3);
        this.logService.error("[IssueReporterEditorPane] Screenshot failed:", err);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestStartRecording(async () => {
      const permissionState = await this.recordingService.getScreenCapturePermissionStatus();
      if (permissionState === "denied" || permissionState === "restricted") {
        this.showScreenRecordingPermissionNotification();
        this.wizard?.setRecordingState(RecordingState.Idle);
        return;
      }
      try {
        await this.recordingService.startRecording("video/mp4");
        this.wizard?.setRecordingState(RecordingState.Recording);
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Recording failed:", err);
        this.wizard?.setRecordingState(RecordingState.Idle);
        const postState = await this.recordingService.getScreenCapturePermissionStatus();
        if (postState === "denied" || postState === "restricted") {
          this.showScreenRecordingPermissionNotification();
        }
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestStopRecording(async () => {
      try {
        const recordingData = await this.recordingService.stopRecording();
        if (recordingData) {
          await this.saveRecordingAndAdd(recordingData);
        }
        this.wizard?.setRecordingState(RecordingState.Idle);
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Stop recording failed:", err);
        this.wizard?.setRecordingState(RecordingState.Idle);
      }
    }));
    this.inputDisposables.add(this.recordingService.onDidChangeState(async (state) => {
      if (state === RecordingState.Stopped && this.wizard?.recordingState === RecordingState.Recording) {
        try {
          const recordingData = await this.recordingService.stopRecording();
          if (recordingData) {
            await this.saveRecordingAndAdd(recordingData);
            if (recordingData.stoppedBySize) {
              this.notificationService.notify({
                severity: Severity.Warning,
                message: localize("recordingTooLarge", "Recording stopped automatically: the 100 MB upload limit was reached.")
              });
            }
          }
        } catch (err) {
          this.logService.error("[IssueReporterEditorPane] Auto-stop recording failed:", err);
        }
        this.wizard?.setRecordingState(RecordingState.Idle);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestOpenScreenshot(async (screenshot) => {
      try {
        const dataUrl = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex === -1) {
          return;
        }
        const extension = dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
        const folder = URI.joinPath(this.environmentService.tmpDir, "issue-screenshots");
        const target = URI.joinPath(folder, `screenshot-${Date.now()}.${extension}`);
        await this.fileService.createFolder(folder);
        await this.fileService.writeFile(target, decodeBase64(dataUrl.substring(commaIndex + 1)));
        await this.editorService.openEditor({ resource: target });
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Open screenshot failed:", err);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestOpenRecording(async (filePath) => {
      try {
        await this.editorService.openEditor({ resource: URI.file(filePath) });
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Open recording failed:", err);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidSubmit(async ({ title, body }) => {
      if (!this.wizard) {
        return;
      }
      const opened = await this.issueFormService.submitIssue(this.wizard, data, title, body);
      if (opened) {
        this.wizard.markPreviewOpened();
        this.wizard.showCloseButton();
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestGenerateTitle(async (description) => {
      try {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const modelIds = await this.languageModelsService.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
        if (modelIds.length === 0) {
          this.logService.warn("[IssueReporterEditorPane] No language models available for title generation");
          this.wizard?.resetGenerateButton();
          return;
        }
        const modelId = modelIds[0];
        const response = await this.languageModelsService.sendChatRequest(
          modelId,
          void 0,
          [{
            role: ChatMessageRole.User,
            content: [{
              type: "text",
              value: `Generate a concise issue title (max 10 words, no quotes, no prefix like "Bug:" or "Feature:") for this bug report description:

${description}`
            }]
          }],
          {},
          CancellationToken.None
        );
        const title = (await getTextResponseFromStream(response)).trim().replace(/^["']|["']$/g, "");
        if (title && this.wizard) {
          this.wizard.setGeneratedTitle(title);
        } else {
          this.wizard?.resetGenerateButton();
        }
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Title generation failed:", err);
        this.wizard?.resetGenerateButton();
      }
    }));
  }
  async fetchPerformanceInfo(options) {
    if (!this.wizard) {
      return;
    }
    try {
      const performanceInfo = await this.processService.getPerformanceInfo(options);
      this.wizard.updateModel({
        processInfo: performanceInfo.processInfo,
        workspaceInfo: performanceInfo.workspaceInfo
      });
    } catch (err) {
      this.logService.error("[IssueReporterEditorPane] Failed to fetch performance info:", err);
    } finally {
      this.wizard?.markPerformanceInfoLoaded();
    }
  }
  async refreshPerformanceInfo() {
    await this.fetchPerformanceInfo({ skipCache: true, unbounded: true });
  }
  async populateSystemInfo() {
    if (!this.wizard) {
      return;
    }
    const input = this.input;
    const data = input?.data;
    try {
      const vscodeVersion = `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || "Commit unknown"}, ${product.date || "Date unknown"})`;
      const systemInfo = await this.processService.getSystemInfo();
      this.wizard.updateModel({
        versionInfo: { vscodeVersion, os: systemInfo.os },
        systemInfo,
        systemInfoWeb: navigator.userAgent
      });
      const fullScan = this.configurationService.getValue("issueReporter.wizard.fullWorkspaceScan") !== false;
      await this.fetchPerformanceInfo({ unbounded: fullScan });
    } catch (err) {
      this.logService.error("[IssueReporterEditorPane] Failed to collect system info:", err);
      this.wizard?.markPerformanceInfoLoaded();
    }
    try {
      const experiments = await this.experimentService.getCurrentExperiments();
      this.wizard?.updateModel({ experimentInfo: experiments?.join("\n") ?? localize("noExperiments", "No current experiments.") });
    } catch {
    }
    await data?.whenExtensionsLoaded;
    if (data && data.enabledExtensions.length > 0) {
      const nonTheme = data.enabledExtensions.filter((e) => !e.isTheme && !e.isBuiltin);
      const themeCount = data.enabledExtensions.filter((e) => e.isTheme).length;
      this.wizard?.updateModel({
        allExtensions: data.enabledExtensions,
        enabledNonThemeExtesions: nonTheme,
        numberOfThemeExtesions: themeCount
      });
    }
    await data?.whenDataComplete;
    if (data) {
      this.wizard?.updateModel({
        isInstallationPure: data.isInstallationPure
      });
    }
  }
  restoreAttachmentsFromInput(input) {
    if (!this.wizard) {
      return;
    }
    if (input.savedScreenshots?.length || input.savedRecordings?.length) {
      this.wizard.restoreAttachments(input.savedScreenshots ?? [], input.savedRecordings ?? []);
    }
  }
  destroyWizard() {
    if (this.recordingService.state === RecordingState.Recording) {
      this.recordingService.discardRecording();
    }
    this.inputDisposables.clear();
    this.wizard = void 0;
    this.wizardInput = void 0;
    if (this.container) {
      clearNode(this.container);
    }
  }
  /**
   * Surface a notification telling the user how to grant Screen Recording
   * permission. On macOS, includes a deep-link to System Settings.
   */
  showScreenRecordingPermissionNotification() {
    if (isMacintosh) {
      this.notificationService.prompt(
        Severity.Warning,
        localize("screenRecordingPermissionDenied", "{0} needs Screen Recording permission to record videos. Grant access in System Settings, then click Record again.", product.nameShort),
        [
          {
            label: localize("openSystemSettings", "Open System Settings"),
            run: () => {
              this.recordingService.openScreenCapturePermissionSettings();
            }
          }
        ]
      );
    } else {
      this.notificationService.warn(
        localize("screenRecordingPermissionDeniedGeneric", "Screen recording permission was denied. Allow {0} to record the screen and try again.", product.nameShort)
      );
    }
  }
  focus() {
    super.focus();
    this.wizard?.focus();
  }
  async saveRecordingAndAdd(data) {
    try {
      const extension = data.mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const fileName = `vscode-recording-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.${extension}`;
      const folder = URI.joinPath(this.environmentService.tmpDir, "issue-recordings");
      const target = URI.joinPath(folder, fileName);
      const arrayBuffer = await data.blob.arrayBuffer();
      await this.fileService.createFolder(folder);
      await this.fileService.writeFile(target, VSBuffer.wrap(new Uint8Array(arrayBuffer)));
      this.logService.info(`[IssueReporterEditorPane] Recording saved to ${target.toString()}`);
      const thumbnailDataUrl = await this.generateVideoThumbnail(target);
      this.wizard?.addRecording(target.fsPath, data.durationMs, thumbnailDataUrl);
    } catch (err) {
      this.logService.error("[IssueReporterEditorPane] Failed to save recording:", err);
    }
  }
  generateVideoThumbnail(fileUri) {
    const browserUri = FileAccess.uriToBrowserUri(URI.file(fileUri.fsPath));
    return new Promise((resolve) => {
      const video = mainWindow.document.createElement("video");
      const timeout = setTimeout(() => finish(void 0), 5e3);
      let resolved = false;
      const finish = (result) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout);
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        resolve(result);
      };
      const captureFrame = () => {
        try {
          if (!video.videoWidth || !video.videoHeight) {
            finish(void 0);
            return;
          }
          const canvas = mainWindow.document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            finish(void 0);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          finish(void 0);
        }
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none;";
      mainWindow.document.body.appendChild(video);
      video.src = browserUri.toString(true);
      video.addEventListener("loadeddata", () => {
        video.pause();
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (duration > 0.5) {
          video.addEventListener("seeked", () => captureFrame(), { once: true });
          try {
            video.currentTime = Math.min(0.5, duration / 2);
          } catch {
            captureFrame();
          }
          return;
        }
        captureFrame();
      }, { once: true });
      video.addEventListener("error", () => finish(void 0), { once: true });
      video.load();
    });
  }
  layout(dimension) {
    if (this.container) {
      this.container.style.width = `${dimension.width}px`;
      this.container.style.height = `${dimension.height}px`;
    }
  }
};
IssueReporterEditorPane.ID = "workbench.editor.issueReporter";
/**
 * Live registry of issue reporter panes so commands can target the wizard
 * even when its tab is not the active editor in its group.
 * (IEditorService.visibleEditorPanes only exposes the active pane per group.)
 */
IssueReporterEditorPane.liveInstances = /* @__PURE__ */ new Set();
IssueReporterEditorPane = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IRecordingService),
  __decorateParam(5, IScreenshotService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IFileService),
  __decorateParam(8, INativeWorkbenchEnvironmentService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IIssueFormService),
  __decorateParam(11, IProcessService),
  __decorateParam(12, IWorkbenchAssignmentService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, ILanguageModelsService),
  __decorateParam(17, INotificationService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IUpdateService),
  __decorateParam(20, IKeybindingService),
  __decorateParam(21, IEditorGroupsService),
  __decorateParam(22, IExtensionService),
  __decorateParam(23, IConfigurationService)
], IssueReporterEditorPane);
export {
  IssueReporterEditorPane,
  IssueReporterOpenContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxlbGVjdHJvbi1icm93c2VyXFxpc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vYnJvd3Nlci9tZWRpYS9pc3N1ZVJlcG9ydGVyT3ZlcmxheS5jc3MnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBjbGVhck5vZGUsIERpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGl2YXRpb24sIElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJc3N1ZVJlcG9ydGVyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi9icm93c2VyL2lzc3VlUmVwb3J0ZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJc3N1ZVJlcG9ydGVyT3ZlcmxheSB9IGZyb20gJy4uL2Jyb3dzZXIvaXNzdWVSZXBvcnRlck92ZXJsYXkuanMnO1xuaW1wb3J0IHsgSVJlY29yZGluZ1NlcnZpY2UsIElSZWNvcmRpbmdEYXRhLCBSZWNvcmRpbmdTdGF0ZSB9IGZyb20gJy4uL2Jyb3dzZXIvcmVjb3JkaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2NyZWVuc2hvdFNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL3NjcmVlbnNob3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJc3N1ZUZvcm1TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2lzc3VlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2Nlc3MvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdE1lc3NhZ2VSb2xlLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBnZXRUZXh0UmVzcG9uc2VGcm9tU3RyZWFtIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSwgU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbi8qKiBDb250ZXh0IGtleSB0aGF0J3MgYHRydWVgIHdoZW5ldmVyIGFueSBJc3N1ZVJlcG9ydGVyIGVkaXRvciBpcyBvcGVuIGluIGFueSBncm91cCwgZXZlbiB3aGVuIG5vdCBmb2N1c2VkLiAqL1xuZXhwb3J0IGNvbnN0IElzc3VlUmVwb3J0ZXJPcGVuQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpc3N1ZVJlcG9ydGVyT3BlbicsIGZhbHNlKTtcblxuLyoqXG4gKiBFZGl0b3IgcGFuZSB0aGF0IGhvc3RzIHRoZSBpc3N1ZSByZXBvcnRlciB3aXphcmQgaW5zaWRlIGFuIGVkaXRvciB0YWIuXG4gKi9cbmV4cG9ydCBjbGFzcyBJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZSBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZWRpdG9yLmlzc3VlUmVwb3J0ZXInO1xuXG5cdC8qKlxuXHQgKiBMaXZlIHJlZ2lzdHJ5IG9mIGlzc3VlIHJlcG9ydGVyIHBhbmVzIHNvIGNvbW1hbmRzIGNhbiB0YXJnZXQgdGhlIHdpemFyZFxuXHQgKiBldmVuIHdoZW4gaXRzIHRhYiBpcyBub3QgdGhlIGFjdGl2ZSBlZGl0b3IgaW4gaXRzIGdyb3VwLlxuXHQgKiAoSUVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvclBhbmVzIG9ubHkgZXhwb3NlcyB0aGUgYWN0aXZlIHBhbmUgcGVyIGdyb3VwLilcblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGxpdmVJbnN0YW5jZXMgPSBuZXcgU2V0PElzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lPigpO1xuXHRzdGF0aWMgZ2V0QW55TGl2ZUluc3RhbmNlKCk6IElzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGluc3Qgb2YgSXNzdWVSZXBvcnRlckVkaXRvclBhbmUubGl2ZUluc3RhbmNlcykge1xuXHRcdFx0aWYgKGluc3Qud2l6YXJkKSB7XG5cdFx0XHRcdHJldHVybiBpbnN0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdpemFyZDogSXNzdWVSZXBvcnRlck92ZXJsYXkgfCB1bmRlZmluZWQ7XG5cdC8qKiBTdXJ2aXZlcyB0aGUgZnJhbWV3b3JrIGNhbGxpbmcgY2xlYXJJbnB1dCgpIHdoZW4gdGhlIHVzZXIgc3dpdGNoZXMgYXdheS4gKi9cblx0cHJpdmF0ZSB3aXphcmRJbnB1dDogSXNzdWVSZXBvcnRlckVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElSZWNvcmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVjb3JkaW5nU2VydmljZTogSVJlY29yZGluZ1NlcnZpY2UsXG5cdFx0QElTY3JlZW5zaG90U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjcmVlbnNob3RTZXJ2aWNlOiBJU2NyZWVuc2hvdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJc3N1ZUZvcm1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaXNzdWVGb3JtU2VydmljZTogSUlzc3VlRm9ybVNlcnZpY2UsXG5cdFx0QElQcm9jZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2Nlc3NTZXJ2aWNlOiBJUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGVyaW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKElzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0SXNzdWVSZXBvcnRlckVkaXRvclBhbmUubGl2ZUluc3RhbmNlcy5hZGQodGhpcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZS5saXZlSW5zdGFuY2VzLmRlbGV0ZSh0aGlzKSB9KTtcblx0fVxuXG5cdGdldFdpemFyZCgpOiBJc3N1ZVJlcG9ydGVyT3ZlcmxheSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud2l6YXJkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJyaW5nIHRoaXMgcGFuZSdzIHRhYiB0byB0aGUgZnJvbnQgb2YgaXRzIGdyb3VwIGFuZCBhY3RpdmF0ZSB0aGF0IGdyb3VwXG5cdCAqIHNvIHRoZSB3aXphcmQgcmVjZWl2ZXMga2V5Ym9hcmQgZm9jdXMuXG5cdCAqL1xuXHRhc3luYyByZXZlYWxBbmRBY3RpdmF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMud2l6YXJkSW5wdXQ7XG5cdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZhdGVHcm91cCh0aGlzLmdyb3VwKTtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLkFDVElWQVRFIH0sIHRoaXMuZ3JvdXApO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCdkaXYuaXNzdWUtcmVwb3J0ZXItZWRpdG9yLXRhYicpKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUub3ZlcmZsb3cgPSAnYXV0byc7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFNob3dVcGRhdGVCYW5uZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuQXZhaWxhYmxlRm9yRG93bmxvYWRcblx0XHRcdHx8IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuUmVhZHlcblx0XHRcdHx8IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuRG93bmxvYWRlZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KFxuXHRcdGlucHV0OiBJc3N1ZVJlcG9ydGVyRWRpdG9ySW5wdXQsXG5cdFx0b3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0Y29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIXRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCBvdXIgb3duIGlucHV0IHJlZmVyZW5jZSBmb3IgcmV2ZWFsQW5kQWN0aXZhdGUoKSBhZnRlciBjbGVhcklucHV0KCkuXG5cdFx0dGhpcy53aXphcmRJbnB1dCA9IGlucHV0O1xuXG5cdFx0Ly8gSWYgdGhlIHdpemFyZCBpcyBhbHJlYWR5IGJ1aWx0IGFuZCBpdHMgRE9NIGlzIHN0aWxsIGF0dGFjaGVkLCByZS1wYXJlbnQgZmxvYXRpbmcgYmFyIGlmIG5lZWRlZFxuXHRcdGlmICh0aGlzLndpemFyZCAmJiB0aGlzLmNvbnRhaW5lci5jb250YWlucyh0aGlzLndpemFyZC5nZXRQYW5lbCgpKSkge1xuXHRcdFx0dGhpcy53aXphcmQucmVwYXJlbnRGbG9hdGluZ0JhcigpO1xuXHRcdFx0dGhpcy53aXphcmQuc2hvd0Zsb2F0aW5nQmFyKCk7XG5cdFx0XHR0aGlzLndpemFyZC5zZXRVcGRhdGVBdmFpbGFibGUodGhpcy5zaG91bGRTaG93VXBkYXRlQmFubmVyKCkpO1xuXHRcdFx0Ly8gUmVzdG9yZSBhdHRhY2htZW50cyBjYXB0dXJlZCBiZWZvcmUgdGhlIGVkaXRvciB3YXMgbW92ZWQgYmFjayBpbnRvXG5cdFx0XHQvLyB0aGlzIHBhbmUgZnJvbSBhIG1vZGFsIGVkaXRvciBwYXJ0LiBUaGUgaW5wdXQgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aDtcblx0XHRcdC8vIHRoZSBleGlzdGluZyBvbkRpZENoYW5nZUF0dGFjaG1lbnRzIHN1YnNjcmlwdGlvbiBrZWVwcyBpdCBpbiBzeW5jLlxuXHRcdFx0dGhpcy5yZXN0b3JlQXR0YWNobWVudHNGcm9tSW5wdXQoaW5wdXQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNsZWFyTm9kZSh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBkYXRhID0gaW5wdXQuZGF0YTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdGNvbnN0IG1zZyA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgncCcpKTtcblx0XHRcdG1zZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub0RhdGEnLCBcIk5vIGlzc3VlIHJlcG9ydGVyIGRhdGEgYXZhaWxhYmxlLlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIHdpemFyZCBcdTIwMTQgcmVuZGVycyBpbnNpZGUgdGhpcyBjb250YWluZXJcblx0XHR0aGlzLndpemFyZCA9IG5ldyBJc3N1ZVJlcG9ydGVyT3ZlcmxheShcblx0XHRcdGRhdGEsXG5cdFx0XHR0aGlzLnJlY29yZGluZ1NlcnZpY2UuaXNTdXBwb3J0ZWQsXG5cdFx0XHR0aGlzLmNvbnRhaW5lcixcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHR0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGV4dGVuc2lvbklkID0+IHRoaXMuaXNzdWVGb3JtU2VydmljZS5zZW5kUmVwb3J0ZXJNZW51KGV4dGVuc2lvbklkKSxcblx0XHRcdGFzeW5jIHVybCA9PiB7IGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh1cmwpLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTsgfSxcblx0XHRcdHRoaXMuc2hvdWxkU2hvd1VwZGF0ZUJhbm5lcigpLFxuXHRcdFx0KCkgPT4gdGhpcy5yZWZyZXNoUGVyZm9ybWFuY2VJbmZvKCksXG5cdFx0XHRjb21tYW5kSWQgPT4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRJZCksXG5cdFx0KTtcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2l6YXJkKTtcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMudXBkYXRlU2VydmljZS5vblN0YXRlQ2hhbmdlKCgpID0+IHRoaXMud2l6YXJkPy5zZXRVcGRhdGVBdmFpbGFibGUodGhpcy5zaG91bGRTaG93VXBkYXRlQmFubmVyKCkpKSk7XG5cblx0XHQvLyBMZXQgdGhlIGlucHV0IGNoZWNrIHdpemFyZCBzdGF0ZSBmb3IgY2xvc2UgY29uZmlybWF0aW9uXG5cdFx0aW5wdXQuaGFzVXNlcklucHV0Rm4gPSAoKSA9PiB0aGlzLndpemFyZD8uaGFzVW5zYXZlZENoYW5nZXMoKSA/PyBmYWxzZTtcblxuXHRcdC8vIENsb3NlIHRoZSBlZGl0b3IgdGFiIHdoZW4gdGhlIHVzZXIgZGlzY2FyZHNcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2l6YXJkLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0Ly8gUmVzZXQgc28gY2xvc2UgaGFuZGxlciBkb2Vzbid0IHByb21wdCBhZ2FpblxuXHRcdFx0aW5wdXQuaGFzVXNlcklucHV0Rm4gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmdyb3VwLmNsb3NlRWRpdG9yKHRoaXMuaW5wdXQhKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZXN0cm95V2l6YXJkKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy53aXphcmQuc2hvdygpO1xuXG5cdFx0Ly8gUmVzdG9yZSBhdHRhY2htZW50cyBtaXJyb3JlZCBvbnRvIHRoZSBpbnB1dCBiZWZvcmUgYSBtb3ZlLCBhbmQga2VlcCB0aGVcblx0XHQvLyBpbnB1dCBpbiBzeW5jIGFzIGF0dGFjaG1lbnRzIGNoYW5nZSBzbyB0aGV5IHN1cnZpdmUgdGhlIHdpemFyZCBiZWluZ1xuXHRcdC8vIHJlYnVpbHQgd2hlbiB0aGUgZWRpdG9yIG1vdmVzIGJldHdlZW4gdGhlIG1haW4gZWRpdG9yIGFyZWEgYW5kIGEgbW9kYWxcblx0XHQvLyBlZGl0b3IgcGFydCBpbiB0aGUgQWdlbnRzIFdpbmRvdy5cblx0XHR0aGlzLnJlc3RvcmVBdHRhY2htZW50c0Zyb21JbnB1dChpbnB1dCk7XG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZC5vbkRpZENoYW5nZUF0dGFjaG1lbnRzKCgpID0+IHtcblx0XHRcdGlucHV0LnNhdmVkU2NyZWVuc2hvdHMgPSB0aGlzLndpemFyZD8uZ2V0U2NyZWVuc2hvdHMoKS5zbGljZSgpO1xuXHRcdFx0aW5wdXQuc2F2ZWRSZWNvcmRpbmdzID0gdGhpcy53aXphcmQ/LmdldFJlY29yZGluZ3MoKS5zbGljZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFBvcHVsYXRlIHN5c3RlbSBpbmZvIGluIGJhY2tncm91bmQgKG5vbi1ibG9ja2luZylcblx0XHR2b2lkIHRoaXMucG9wdWxhdGVTeXN0ZW1JbmZvKCk7XG5cblx0XHQvLyBXaXJlIHNjcmVlbnNob3QgY2FwdHVyZVxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRSZXF1ZXN0U2NyZWVuc2hvdChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBDb25kaXRpb25hbGx5IGhpZGUgdGhlIGZsb2F0aW5nIGJhciBiYXNlZCBvbiB1c2VyIHNldHRpbmdcblx0XHRcdFx0Y29uc3Qgc2hvdWxkSGlkZSA9IHRoaXMud2l6YXJkPy5zaG91bGRIaWRlVG9vbGJhckZvckNhcHR1cmUgPz8gdHJ1ZTtcblx0XHRcdFx0aWYgKHNob3VsZEhpZGUpIHtcblx0XHRcdFx0XHR0aGlzLndpemFyZD8uaGlkZUZsb2F0aW5nQmFyKCk7XG5cblx0XHRcdFx0XHQvLyBTbWFsbCBkZWxheSB0byBsZXQgdGhlIGJhciBkaXNhcHBlYXIgYmVmb3JlIGNhcHR1cmVcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTAwKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkYXRhVXJsID0gYXdhaXQgdGhpcy5zY3JlZW5zaG90U2VydmljZS5jYXB0dXJlU2NyZWVuc2hvdCgpO1xuXG5cdFx0XHRcdC8vIFNob3cgYmFyIGFnYWluIGFmdGVyIGNhcHR1cmVcblx0XHRcdFx0aWYgKHNob3VsZEhpZGUpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMud2l6YXJkPy5zaG93RmxvYXRpbmdCYXIoKSwgMTAwMCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWRhdGFVcmwgfHwgIXRoaXMud2l6YXJkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaW1nID0gYXdhaXQgbmV3IFByb21pc2U8SFRNTEltYWdlRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGltYWdlID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbWcnKTtcblx0XHRcdFx0XHRpbWFnZS5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKGltYWdlKTtcblx0XHRcdFx0XHRpbWFnZS5vbmVycm9yID0gcmVqZWN0O1xuXHRcdFx0XHRcdGltYWdlLnNyYyA9IGRhdGFVcmw7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMud2l6YXJkLmFkZFNjcmVlbnNob3QoeyBkYXRhVXJsLCB3aWR0aDogaW1nLm5hdHVyYWxXaWR0aCwgaGVpZ2h0OiBpbWcubmF0dXJhbEhlaWdodCB9KTtcblxuXHRcdFx0XHQvLyBCcmluZyB0aGUgd2l6YXJkIGJhY2sgaW50byBmb2N1cyBhZnRlciB0aGUgY2FwdHVyZSBpbiBjYXNlXG5cdFx0XHRcdC8vIHRoZSB1c2VyIHN3aXRjaGVkIGVkaXRvcnMvZ3JvdXBzIHdoaWxlIHNldHRpbmcgdXAgdGhlIHNob3QuXG5cdFx0XHRcdGF3YWl0IHRoaXMucmV2ZWFsQW5kQWN0aXZhdGUoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMud2l6YXJkPy5zaG93RmxvYXRpbmdCYXIoKSwgMTAwMCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBTY3JlZW5zaG90IGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgcmVjb3JkaW5nIHN0YXJ0XG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZC5vbkRpZFJlcXVlc3RTdGFydFJlY29yZGluZyhhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBtYWNPUy1vbmx5OiBza2lwIGdldERpc3BsYXlNZWRpYSB3aGVuIHBlcm1pc3Npb24gaXMgZGVuaWVkIGFuZFxuXHRcdFx0Ly8gc3VyZmFjZSB0aGUgZ3JhbnQtcGVybWlzc2lvbiBub3RpZmljYXRpb24gaW5zdGVhZC5cblx0XHRcdGNvbnN0IHBlcm1pc3Npb25TdGF0ZSA9IGF3YWl0IHRoaXMucmVjb3JkaW5nU2VydmljZS5nZXRTY3JlZW5DYXB0dXJlUGVybWlzc2lvblN0YXR1cygpO1xuXHRcdFx0aWYgKHBlcm1pc3Npb25TdGF0ZSA9PT0gJ2RlbmllZCcgfHwgcGVybWlzc2lvblN0YXRlID09PSAncmVzdHJpY3RlZCcpIHtcblx0XHRcdFx0dGhpcy5zaG93U2NyZWVuUmVjb3JkaW5nUGVybWlzc2lvbk5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR0aGlzLndpemFyZD8uc2V0UmVjb3JkaW5nU3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVjb3JkaW5nU2VydmljZS5zdGFydFJlY29yZGluZygndmlkZW8vbXA0Jyk7XG5cdFx0XHRcdHRoaXMud2l6YXJkPy5zZXRSZWNvcmRpbmdTdGF0ZShSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBSZWNvcmRpbmcgZmFpbGVkOicsIGVycik7XG5cdFx0XHRcdHRoaXMud2l6YXJkPy5zZXRSZWNvcmRpbmdTdGF0ZShSZWNvcmRpbmdTdGF0ZS5JZGxlKTtcblx0XHRcdFx0Ly8gT25seSBudWRnZSB0aGUgdXNlciB0byBTeXN0ZW0gU2V0dGluZ3Mgb24gYW4gZXhwbGljaXQgZGVueS9yZXN0cmljdC4gT24gbWFjT1MsXG5cdFx0XHRcdC8vIGBub3QtZGV0ZXJtaW5lZGAgY2FuIGFsc28gbWVhbiB0aGUgdXNlciBqdXN0IGNhbmNlbGxlZCB0aGUgZ2V0RGlzcGxheU1lZGlhXG5cdFx0XHRcdC8vIHBpY2tlciAobm8gVENDIGRlY2lzaW9uIHJlY29yZGVkKSBcdTIwMTQgc3VyZmFjaW5nIGEgcGVybWlzc2lvbiBwcm9tcHQgdGhlbiB3b3VsZFxuXHRcdFx0XHQvLyBiZSBtaXNsZWFkaW5nLCBzbyB3ZSB0cmVhdCB0aGF0IGFzIGEgc2lsZW50IGNhbmNlbC5cblx0XHRcdFx0Y29uc3QgcG9zdFN0YXRlID0gYXdhaXQgdGhpcy5yZWNvcmRpbmdTZXJ2aWNlLmdldFNjcmVlbkNhcHR1cmVQZXJtaXNzaW9uU3RhdHVzKCk7XG5cdFx0XHRcdGlmIChwb3N0U3RhdGUgPT09ICdkZW5pZWQnIHx8IHBvc3RTdGF0ZSA9PT0gJ3Jlc3RyaWN0ZWQnKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93U2NyZWVuUmVjb3JkaW5nUGVybWlzc2lvbk5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2lyZSByZWNvcmRpbmcgc3RvcCAodXNlci1pbml0aWF0ZWQpXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZC5vbkRpZFJlcXVlc3RTdG9wUmVjb3JkaW5nKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlY29yZGluZ0RhdGEgPSBhd2FpdCB0aGlzLnJlY29yZGluZ1NlcnZpY2Uuc3RvcFJlY29yZGluZygpO1xuXHRcdFx0XHRpZiAocmVjb3JkaW5nRGF0YSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2F2ZVJlY29yZGluZ0FuZEFkZChyZWNvcmRpbmdEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLndpemFyZD8uc2V0UmVjb3JkaW5nU3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbSXNzdWVSZXBvcnRlckVkaXRvclBhbmVdIFN0b3AgcmVjb3JkaW5nIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0XHR0aGlzLndpemFyZD8uc2V0UmVjb3JkaW5nU3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGF1dG8tc3RvcCB0cmlnZ2VyZWQgYnkgdGhlIHJlY29yZGluZyBzZXJ2aWNlIChlLmcuIHNpemUgbGltaXQgcmVhY2hlZClcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMucmVjb3JkaW5nU2VydmljZS5vbkRpZENoYW5nZVN0YXRlKGFzeW5jIChzdGF0ZSkgPT4ge1xuXHRcdFx0Ly8gT25seSBoYW5kbGUgYXV0by1zdG9wOiBpZiB0aGUgc2VydmljZSBzdG9wcGVkIG9uIGl0cyBvd24gd2hpbGUgdGhlIHdpemFyZFxuXHRcdFx0Ly8gc3RpbGwgdGhpbmtzIHdlJ3JlIHJlY29yZGluZyAodXNlciBkaWRuJ3QgcHJlc3MgU3RvcCBtYW51YWxseSlcblx0XHRcdGlmIChzdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuU3RvcHBlZCAmJiB0aGlzLndpemFyZD8ucmVjb3JkaW5nU3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlY29yZGluZ0RhdGEgPSBhd2FpdCB0aGlzLnJlY29yZGluZ1NlcnZpY2Uuc3RvcFJlY29yZGluZygpO1xuXHRcdFx0XHRcdGlmIChyZWNvcmRpbmdEYXRhKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNhdmVSZWNvcmRpbmdBbmRBZGQocmVjb3JkaW5nRGF0YSk7XG5cdFx0XHRcdFx0XHRpZiAocmVjb3JkaW5nRGF0YS5zdG9wcGVkQnlTaXplKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdyZWNvcmRpbmdUb29MYXJnZScsIFwiUmVjb3JkaW5nIHN0b3BwZWQgYXV0b21hdGljYWxseTogdGhlIDEwMCBNQiB1cGxvYWQgbGltaXQgd2FzIHJlYWNoZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBBdXRvLXN0b3AgcmVjb3JkaW5nIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMud2l6YXJkPy5zZXRSZWNvcmRpbmdTdGF0ZShSZWNvcmRpbmdTdGF0ZS5JZGxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaXJlIG9wZW4gc2NyZWVuc2hvdCBcdTIwMTQgc2F2ZSB0byB0ZW1wIGZpbGUgYW5kIG9wZW4gaW4gZWRpdG9yXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZC5vbkRpZFJlcXVlc3RPcGVuU2NyZWVuc2hvdChhc3luYyAoc2NyZWVuc2hvdCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGF0YVVybCA9IHNjcmVlbnNob3QuYW5ub3RhdGVkRGF0YVVybCA/PyBzY3JlZW5zaG90LmRhdGFVcmw7XG5cdFx0XHRcdGNvbnN0IGNvbW1hSW5kZXggPSBkYXRhVXJsLmluZGV4T2YoJywnKTtcblx0XHRcdFx0aWYgKGNvbW1hSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFNjcmVlbnNob3RzIGFyZSBlaXRoZXIgYW5ub3RhdGVkIChhbHdheXMgUE5HIHZpYSBjYW52YXMudG9EYXRhVVJMKVxuXHRcdFx0XHQvLyBvciByYXcgbmF0aXZlIGNhcHR1cmVzIChhbHdheXMgSlBFRyk7IGZhbGwgYmFjayB0byBQTkcuXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGRhdGFVcmwuc3RhcnRzV2l0aCgnZGF0YTppbWFnZS9qcGVnJykgPyAnanBnJyA6ICdwbmcnO1xuXHRcdFx0XHQvLyBXcml0ZSB0byB0aGUgT1MgdGVtcCBmb2xkZXIgc28gYXJ0aWZhY3RzIGFyZSBjbGVhbmVkIHVwIGF1dG9tYXRpY2FsbHkuXG5cdFx0XHRcdGNvbnN0IGZvbGRlciA9IFVSSS5qb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS50bXBEaXIsICdpc3N1ZS1zY3JlZW5zaG90cycpO1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBVUkkuam9pblBhdGgoZm9sZGVyLCBgc2NyZWVuc2hvdC0ke0RhdGUubm93KCl9LiR7ZXh0ZW5zaW9ufWApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXIpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXQsIGRlY29kZUJhc2U2NChkYXRhVXJsLnN1YnN0cmluZyhjb21tYUluZGV4ICsgMSkpKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGFyZ2V0IH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBPcGVuIHNjcmVlbnNob3QgZmFpbGVkOicsIGVycik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2lyZSBvcGVuIHJlY29yZGluZyBcdTIwMTQgb3BlbiBmaWxlIGluIGVkaXRvclxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRSZXF1ZXN0T3BlblJlY29yZGluZyhhc3luYyAoZmlsZVBhdGgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKGZpbGVQYXRoKSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gT3BlbiByZWNvcmRpbmcgZmFpbGVkOicsIGVycik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2lyZSBzdWJtaXQgXHUyMDE0IGRlbGVnYXRlIHRvIGZvcm0gc2VydmljZSBmb3IgdXBsb2FkICsgb3BlbiBVUkxcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2l6YXJkLm9uRGlkU3VibWl0KGFzeW5jICh7IHRpdGxlLCBib2R5IH0pID0+IHtcblx0XHRcdGlmICghdGhpcy53aXphcmQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgdGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLnN1Ym1pdElzc3VlKHRoaXMud2l6YXJkLCBkYXRhLCB0aXRsZSwgYm9keSk7XG5cdFx0XHRpZiAob3BlbmVkKSB7XG5cdFx0XHRcdC8vIFVzZXIgb3BlbmVkIHRoZSBsaW5rIFx1MjAxNCBrZWVwIHRoZSB3aXphcmQgZWRpdGFibGUsIGJ1dCBvZmZlciBhbiBleHBsaWNpdCBjbG9zZSBhY3Rpb24uXG5cdFx0XHRcdHRoaXMud2l6YXJkLm1hcmtQcmV2aWV3T3BlbmVkKCk7XG5cdFx0XHRcdHRoaXMud2l6YXJkLnNob3dDbG9zZUJ1dHRvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgQUkgdGl0bGUgZ2VuZXJhdGlvblxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRSZXF1ZXN0R2VuZXJhdGVUaXRsZShhc3luYyAoZGVzY3JpcHRpb24pID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIFdhaXQgZm9yIGluc3RhbGxlZCBleHRlbnNpb25zIHRvIGJlIHJlZ2lzdGVyZWQgc28gdGhlIENvcGlsb3QgQ2hhdFxuXHRcdFx0XHQvLyBleHRlbnNpb24gaGFzIGhhZCBhIGNoYW5jZSB0byBjb250cmlidXRlIGl0cyBgY29waWxvdGAgbGFuZ3VhZ2Vcblx0XHRcdFx0Ly8gbW9kZWwgdmVuZG9yIGJlZm9yZSB3ZSB0cnkgdG8gcmVzb2x2ZSBhIG1vZGVsLiAoT3RoZXIgY2FsbCBzaXRlc1xuXHRcdFx0XHQvLyBsaWtlIHRoZSBjaGF0IHRoaW5raW5nIHRpdGxlIGdlbmVyYXRvciBhcmUgcmVhY2hlZCBhZnRlciBDb3BpbG90XG5cdFx0XHRcdC8vIGhhcyBhbHJlYWR5IGFjdGl2YXRlZDsgd2UncmUgdGhlIG9ubHkgcGxhY2UgdGhhdCBjYW4gYmUgaW52b2tlZFxuXHRcdFx0XHQvLyBiZWZvcmUgaXQgaGFzLilcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0XHRcdC8vIGBjb3BpbG90LXV0aWxpdHktc21hbGxgIG1hdGNoZXMgd2hhdCBvdGhlciB1dGlsaXR5IGNhbGxlcnMgaW4gdGhlXG5cdFx0XHRcdC8vIHdvcmtiZW5jaCB1c2UgKGNoYXQgdGhpbmtpbmcgc3VtbWFyaWVzLCB0b29sLXJpc2sgYXNzZXNzbWVudCxcblx0XHRcdFx0Ly8gY2hhdC1lZGl0IGV4cGxhbmF0aW9ucykuIFRoZSBlYXJsaWVyIGBjb3BpbG90LWZhc3RgIGlkIG5ldmVyXG5cdFx0XHRcdC8vIGV4aXN0ZWQgYW5kIHdhcyB0aGUgcm9vdCBjYXVzZSBvZiB0aGUgZW1wdHktcmVzdWx0IHJlZ3Jlc3Npb24uXG5cdFx0XHRcdGNvbnN0IG1vZGVsSWRzID0gYXdhaXQgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICdjb3BpbG90JywgaWQ6ICdjb3BpbG90LXV0aWxpdHktc21hbGwnIH0pO1xuXHRcdFx0XHRpZiAobW9kZWxJZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gTm8gbGFuZ3VhZ2UgbW9kZWxzIGF2YWlsYWJsZSBmb3IgdGl0bGUgZ2VuZXJhdGlvbicpO1xuXHRcdFx0XHRcdHRoaXMud2l6YXJkPy5yZXNldEdlbmVyYXRlQnV0dG9uKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVsSWQgPSBtb2RlbElkc1swXTtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5zZW5kQ2hhdFJlcXVlc3QoXG5cdFx0XHRcdFx0bW9kZWxJZCxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogYEdlbmVyYXRlIGEgY29uY2lzZSBpc3N1ZSB0aXRsZSAobWF4IDEwIHdvcmRzLCBubyBxdW90ZXMsIG5vIHByZWZpeCBsaWtlIFwiQnVnOlwiIG9yIFwiRmVhdHVyZTpcIikgZm9yIHRoaXMgYnVnIHJlcG9ydCBkZXNjcmlwdGlvbjpcXG5cXG4ke2Rlc2NyaXB0aW9ufWAsXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR7fSxcblx0XHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCB0aXRsZSA9IChhd2FpdCBnZXRUZXh0UmVzcG9uc2VGcm9tU3RyZWFtKHJlc3BvbnNlKSkudHJpbSgpLnJlcGxhY2UoL15bXCInXXxbXCInXSQvZywgJycpO1xuXHRcdFx0XHRpZiAodGl0bGUgJiYgdGhpcy53aXphcmQpIHtcblx0XHRcdFx0XHR0aGlzLndpemFyZC5zZXRHZW5lcmF0ZWRUaXRsZSh0aXRsZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy53aXphcmQ/LnJlc2V0R2VuZXJhdGVCdXR0b24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBUaXRsZSBnZW5lcmF0aW9uIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0XHR0aGlzLndpemFyZD8ucmVzZXRHZW5lcmF0ZUJ1dHRvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmV0Y2hQZXJmb3JtYW5jZUluZm8ob3B0aW9ucz86IHsgc2tpcENhY2hlPzogYm9vbGVhbjsgdW5ib3VuZGVkPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLndpemFyZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGVyZm9ybWFuY2VJbmZvID0gYXdhaXQgdGhpcy5wcm9jZXNzU2VydmljZS5nZXRQZXJmb3JtYW5jZUluZm8ob3B0aW9ucyk7XG5cdFx0XHR0aGlzLndpemFyZC51cGRhdGVNb2RlbCh7XG5cdFx0XHRcdHByb2Nlc3NJbmZvOiBwZXJmb3JtYW5jZUluZm8ucHJvY2Vzc0luZm8sXG5cdFx0XHRcdHdvcmtzcGFjZUluZm86IHBlcmZvcm1hbmNlSW5mby53b3Jrc3BhY2VJbmZvLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gRmFpbGVkIHRvIGZldGNoIHBlcmZvcm1hbmNlIGluZm86JywgZXJyKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy53aXphcmQ/Lm1hcmtQZXJmb3JtYW5jZUluZm9Mb2FkZWQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hQZXJmb3JtYW5jZUluZm8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVXNlci1pbml0aWF0ZWQgcmVmcmVzaDogYnlwYXNzIHRoZSB3b3Jrc3BhY2Utc3RhdHMgY2FjaGUgYW5kIHdhbGsgdGhlXG5cdFx0Ly8gZnVsbCBmaWxlc3lzdGVtIChubyBjYXApIHNvIHRoZSByZXBvcnRlZCBmaWxlIGNvdW50cyBhbmQgZmlsZS10eXBlXG5cdFx0Ly8gYnJlYWtkb3duIHJlZmxlY3QgdGhlIGFjdHVhbCB3b3Jrc3BhY2UuXG5cdFx0YXdhaXQgdGhpcy5mZXRjaFBlcmZvcm1hbmNlSW5mbyh7IHNraXBDYWNoZTogdHJ1ZSwgdW5ib3VuZGVkOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwb3B1bGF0ZVN5c3RlbUluZm8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLndpemFyZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnB1dCBhcyBJc3N1ZVJlcG9ydGVyRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGF0YSA9IGlucHV0Py5kYXRhO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFZlcnNpb24gaW5mb1xuXHRcdFx0Y29uc3QgdnNjb2RlVmVyc2lvbiA9IGAke3Byb2R1Y3QubmFtZVNob3J0fSAkeyEhcHJvZHVjdC5kYXJ3aW5Vbml2ZXJzYWxBc3NldElkID8gYCR7cHJvZHVjdC52ZXJzaW9ufSAoVW5pdmVyc2FsKWAgOiBwcm9kdWN0LnZlcnNpb259ICgke3Byb2R1Y3QuY29tbWl0IHx8ICdDb21taXQgdW5rbm93bid9LCAke3Byb2R1Y3QuZGF0ZSB8fCAnRGF0ZSB1bmtub3duJ30pYDtcblx0XHRcdGNvbnN0IHN5c3RlbUluZm8gPSBhd2FpdCB0aGlzLnByb2Nlc3NTZXJ2aWNlLmdldFN5c3RlbUluZm8oKTtcblx0XHRcdHRoaXMud2l6YXJkLnVwZGF0ZU1vZGVsKHtcblx0XHRcdFx0dmVyc2lvbkluZm86IHsgdnNjb2RlVmVyc2lvbiwgb3M6IHN5c3RlbUluZm8ub3MgfSxcblx0XHRcdFx0c3lzdGVtSW5mbyxcblx0XHRcdFx0c3lzdGVtSW5mb1dlYjogbmF2aWdhdG9yLnVzZXJBZ2VudCxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBIb25vdXIgYGlzc3VlUmVwb3J0ZXIud2l6YXJkLmZ1bGxXb3Jrc3BhY2VTY2FuYCBvbmx5IG9uIHRoZSBhdXRvbWF0aWNcblx0XHRcdC8vIChpbml0aWFsKSBjb2xsZWN0aW9uLiBUaGUgdXNlci1pbml0aWF0ZWQgcmVmcmVzaCBiZWxvdyBpcyBhbHdheXNcblx0XHRcdC8vIHVuYm91bmRlZCBcdTIwMTQgdGhlIHVzZXIgaGFzIGV4cGxpY2l0bHkgYXNrZWQgZm9yIGZyZXNoIGRhdGEgYW5kIHRoZVxuXHRcdFx0Ly8gYnV0dG9uIHNob3dzIGEgc3Bpbm5lciB3aGlsZSBpdCBydW5zLlxuXHRcdFx0Y29uc3QgZnVsbFNjYW4gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdpc3N1ZVJlcG9ydGVyLndpemFyZC5mdWxsV29ya3NwYWNlU2NhbicpICE9PSBmYWxzZTtcblx0XHRcdGF3YWl0IHRoaXMuZmV0Y2hQZXJmb3JtYW5jZUluZm8oeyB1bmJvdW5kZWQ6IGZ1bGxTY2FuIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbSXNzdWVSZXBvcnRlckVkaXRvclBhbmVdIEZhaWxlZCB0byBjb2xsZWN0IHN5c3RlbSBpbmZvOicsIGVycik7XG5cdFx0XHR0aGlzLndpemFyZD8ubWFya1BlcmZvcm1hbmNlSW5mb0xvYWRlZCgpO1xuXHRcdH1cblxuXHRcdC8vIEV4cGVyaW1lbnRzIChpbmRlcGVuZGVudCBmcm9tIHN5c3RlbSBpbmZvKVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleHBlcmltZW50cyA9IGF3YWl0IHRoaXMuZXhwZXJpbWVudFNlcnZpY2UuZ2V0Q3VycmVudEV4cGVyaW1lbnRzKCk7XG5cdFx0XHR0aGlzLndpemFyZD8udXBkYXRlTW9kZWwoeyBleHBlcmltZW50SW5mbzogZXhwZXJpbWVudHM/LmpvaW4oJ1xcbicpID8/IGxvY2FsaXplKCdub0V4cGVyaW1lbnRzJywgXCJObyBjdXJyZW50IGV4cGVyaW1lbnRzLlwiKSB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIElnbm9yZVxuXHRcdH1cblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBpc3N1ZSBzZXJ2aWNlIHRvIGZpbmlzaCBlbnVtZXJhdGluZyBpbnN0YWxsZWQgZXh0ZW5zaW9uc1xuXHRcdC8vIChpdCBraWNrcyBvZmYgZW51bWVyYXRpb24gaW4gcGFyYWxsZWwgd2l0aCB0aGlzIHBhbmUgb3BlbmluZykuXG5cdFx0YXdhaXQgZGF0YT8ud2hlbkV4dGVuc2lvbnNMb2FkZWQ7XG5cdFx0aWYgKGRhdGEgJiYgZGF0YS5lbmFibGVkRXh0ZW5zaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBub25UaGVtZSA9IGRhdGEuZW5hYmxlZEV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gIWUuaXNUaGVtZSAmJiAhZS5pc0J1aWx0aW4pO1xuXHRcdFx0Y29uc3QgdGhlbWVDb3VudCA9IGRhdGEuZW5hYmxlZEV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gZS5pc1RoZW1lKS5sZW5ndGg7XG5cdFx0XHR0aGlzLndpemFyZD8udXBkYXRlTW9kZWwoe1xuXHRcdFx0XHRhbGxFeHRlbnNpb25zOiBkYXRhLmVuYWJsZWRFeHRlbnNpb25zLFxuXHRcdFx0XHRlbmFibGVkTm9uVGhlbWVFeHRlc2lvbnM6IG5vblRoZW1lLFxuXHRcdFx0XHRudW1iZXJPZlRoZW1lRXh0ZXNpb25zOiB0aGVtZUNvdW50LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGZ1bGwgYXN5bmMgcG9wdWxhdGlvbiAodG9rZW4sIGludGVncml0eSBjaGVjaywgZXhwZXJpbWVudHMpXG5cdFx0Ly8gdG8gZmluaXNoIHNvIHdlIGNhbiBmb3J3YXJkIGxhdGUtYXJyaXZpbmcgdmFsdWVzIGludG8gdGhlIHdpemFyZCBtb2RlbC5cblx0XHQvLyBOb3RlOiBnaXRodWJBY2Nlc3NUb2tlbiBkb2Vzbid0IG5lZWQgZm9yd2FyZGluZyBcdTIwMTQgaXQncyByZWFkIGZyb20gdGhlXG5cdFx0Ly8gc2hhcmVkIGRhdGEgb2JqZWN0IGF0IHN1Ym1pdCB0aW1lLCBub3QgZnJvbSB0aGUgb3ZlcmxheSdzIGludGVybmFsIG1vZGVsLlxuXHRcdGF3YWl0IGRhdGE/LndoZW5EYXRhQ29tcGxldGU7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdHRoaXMud2l6YXJkPy51cGRhdGVNb2RlbCh7XG5cdFx0XHRcdGlzSW5zdGFsbGF0aW9uUHVyZTogZGF0YS5pc0luc3RhbGxhdGlvblB1cmUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVBdHRhY2htZW50c0Zyb21JbnB1dChpbnB1dDogSXNzdWVSZXBvcnRlckVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndpemFyZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaW5wdXQuc2F2ZWRTY3JlZW5zaG90cz8ubGVuZ3RoIHx8IGlucHV0LnNhdmVkUmVjb3JkaW5ncz8ubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLndpemFyZC5yZXN0b3JlQXR0YWNobWVudHMoaW5wdXQuc2F2ZWRTY3JlZW5zaG90cyA/PyBbXSwgaW5wdXQuc2F2ZWRSZWNvcmRpbmdzID8/IFtdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlc3Ryb3lXaXphcmQoKTogdm9pZCB7XG5cdFx0Ly8gU3RvcCBhbnkgYWN0aXZlIHJlY29yZGluZyB0byBhdm9pZCBtZW1vcnkgbGVha3Ncblx0XHRpZiAodGhpcy5yZWNvcmRpbmdTZXJ2aWNlLnN0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpIHtcblx0XHRcdHRoaXMucmVjb3JkaW5nU2VydmljZS5kaXNjYXJkUmVjb3JkaW5nKCk7XG5cdFx0fVxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMud2l6YXJkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMud2l6YXJkSW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRjbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIGEgbm90aWZpY2F0aW9uIHRlbGxpbmcgdGhlIHVzZXIgaG93IHRvIGdyYW50IFNjcmVlbiBSZWNvcmRpbmdcblx0ICogcGVybWlzc2lvbi4gT24gbWFjT1MsIGluY2x1ZGVzIGEgZGVlcC1saW5rIHRvIFN5c3RlbSBTZXR0aW5ncy5cblx0ICovXG5cdHByaXZhdGUgc2hvd1NjcmVlblJlY29yZGluZ1Blcm1pc3Npb25Ob3RpZmljYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NyZWVuUmVjb3JkaW5nUGVybWlzc2lvbkRlbmllZCcsIFwiezB9IG5lZWRzIFNjcmVlbiBSZWNvcmRpbmcgcGVybWlzc2lvbiB0byByZWNvcmQgdmlkZW9zLiBHcmFudCBhY2Nlc3MgaW4gU3lzdGVtIFNldHRpbmdzLCB0aGVuIGNsaWNrIFJlY29yZCBhZ2Fpbi5cIiwgcHJvZHVjdC5uYW1lU2hvcnQpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuU3lzdGVtU2V0dGluZ3MnLCBcIk9wZW4gU3lzdGVtIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucmVjb3JkaW5nU2VydmljZS5vcGVuU2NyZWVuQ2FwdHVyZVBlcm1pc3Npb25TZXR0aW5ncygpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4oXG5cdFx0XHRcdGxvY2FsaXplKCdzY3JlZW5SZWNvcmRpbmdQZXJtaXNzaW9uRGVuaWVkR2VuZXJpYycsIFwiU2NyZWVuIHJlY29yZGluZyBwZXJtaXNzaW9uIHdhcyBkZW5pZWQuIEFsbG93IHswfSB0byByZWNvcmQgdGhlIHNjcmVlbiBhbmQgdHJ5IGFnYWluLlwiLCBwcm9kdWN0Lm5hbWVTaG9ydClcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLndpemFyZD8uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZVJlY29yZGluZ0FuZEFkZChkYXRhOiBJUmVjb3JkaW5nRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSBkYXRhLm1pbWVUeXBlLnN0YXJ0c1dpdGgoJ3ZpZGVvL21wNCcpID8gJ21wNCcgOiAnd2VibSc7XG5cdFx0XHRjb25zdCBmaWxlTmFtZSA9IGB2c2NvZGUtcmVjb3JkaW5nLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoL1s6Ll0vZywgJy0nKX0uJHtleHRlbnNpb259YDtcblx0XHRcdC8vIFdyaXRlIHRvIHRoZSBPUyB0ZW1wIGZvbGRlciBzbyBhcnRpZmFjdHMgYXJlIGNsZWFuZWQgdXAgYXV0b21hdGljYWxseS5cblx0XHRcdGNvbnN0IGZvbGRlciA9IFVSSS5qb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS50bXBEaXIsICdpc3N1ZS1yZWNvcmRpbmdzJyk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBVUkkuam9pblBhdGgoZm9sZGVyLCBmaWxlTmFtZSk7XG5cblx0XHRcdGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgZGF0YS5ibG9iLmFycmF5QnVmZmVyKCk7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXIpO1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGFyZ2V0LCBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKSkpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gUmVjb3JkaW5nIHNhdmVkIHRvICR7dGFyZ2V0LnRvU3RyaW5nKCl9YCk7XG5cblx0XHRcdC8vIEdlbmVyYXRlIHRodW1ibmFpbCBmcm9tIHRoZSBzYXZlZCBmaWxlIFx1MjAxNCBibG9iIFVSTHMgYXJlIGJsb2NrZWQgYnlcblx0XHRcdC8vIEVsZWN0cm9uJ3MgQ1NQIGZvciBtZWRpYSBlbGVtZW50cywgc28gd2UgdXNlIHRoZSBzYXZlZCBmaWxlIHZpYVxuXHRcdFx0Ly8gdGhlIHZzY29kZS1maWxlOi8vIHByb3RvY29sIHdoaWNoIHRoZSByZW5kZXJlciBjYW4gbG9hZC5cblx0XHRcdGNvbnN0IHRodW1ibmFpbERhdGFVcmwgPSBhd2FpdCB0aGlzLmdlbmVyYXRlVmlkZW9UaHVtYm5haWwodGFyZ2V0KTtcblx0XHRcdHRoaXMud2l6YXJkPy5hZGRSZWNvcmRpbmcodGFyZ2V0LmZzUGF0aCwgZGF0YS5kdXJhdGlvbk1zLCB0aHVtYm5haWxEYXRhVXJsKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBGYWlsZWQgdG8gc2F2ZSByZWNvcmRpbmc6JywgZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlVmlkZW9UaHVtYm5haWwoZmlsZVVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUaGUgZmlsZVVyaSBtYXkgdXNlIHRoZSB2c2NvZGUtdXNlcmRhdGE6IHNjaGVtZS4gQ29udmVydCB0byBhIHJlYWxcblx0XHQvLyBmaWxlOi8vIFVSSSB2aWEgZnNQYXRoLCB0aGVuIHRvIHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8gc28gdGhlXG5cdFx0Ly8gcmVuZGVyZXIncyBDU1AgYWxsb3dzIGxvYWRpbmcgaXQgYXMgYSBtZWRpYSBzb3VyY2UuXG5cdFx0Y29uc3QgYnJvd3NlclVyaSA9IEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKFVSSS5maWxlKGZpbGVVcmkuZnNQYXRoKSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCB2aWRlbyA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IGZpbmlzaCh1bmRlZmluZWQpLCA1MDAwKTtcblx0XHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZmluaXNoID0gKHJlc3VsdDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCkgeyByZXR1cm47IH1cblx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cdFx0XHRcdHZpZGVvLnJlbW92ZUF0dHJpYnV0ZSgnc3JjJyk7XG5cdFx0XHRcdHZpZGVvLmxvYWQoKTtcblx0XHRcdFx0dmlkZW8ucmVtb3ZlKCk7XG5cdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjYXB0dXJlRnJhbWUgPSAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKCF2aWRlby52aWRlb1dpZHRoIHx8ICF2aWRlby52aWRlb0hlaWdodCkge1xuXHRcdFx0XHRcdFx0ZmluaXNoKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNhbnZhcyA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdFx0XHRcdFx0Y2FudmFzLndpZHRoID0gdmlkZW8udmlkZW9XaWR0aDtcblx0XHRcdFx0XHRjYW52YXMuaGVpZ2h0ID0gdmlkZW8udmlkZW9IZWlnaHQ7XG5cdFx0XHRcdFx0Y29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0XHRcdFx0aWYgKCFjdHgpIHtcblx0XHRcdFx0XHRcdGZpbmlzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjdHguZHJhd0ltYWdlKHZpZGVvLCAwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xuXHRcdFx0XHRcdGZpbmlzaChjYW52YXMudG9EYXRhVVJMKCdpbWFnZS9qcGVnJywgMC43KSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdGZpbmlzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR2aWRlby5tdXRlZCA9IHRydWU7XG5cdFx0XHR2aWRlby5wbGF5c0lubGluZSA9IHRydWU7XG5cdFx0XHR2aWRlby5wcmVsb2FkID0gJ2F1dG8nO1xuXHRcdFx0dmlkZW8uc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjpmaXhlZDt0b3A6LTk5OTlweDtsZWZ0Oi05OTk5cHg7d2lkdGg6MzIwcHg7aGVpZ2h0OjI0MHB4O29wYWNpdHk6MDtwb2ludGVyLWV2ZW50czpub25lOyc7XG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodmlkZW8pO1xuXHRcdFx0dmlkZW8uc3JjID0gYnJvd3NlclVyaS50b1N0cmluZyh0cnVlKTtcblxuXHRcdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignbG9hZGVkZGF0YScsICgpID0+IHtcblx0XHRcdFx0dmlkZW8ucGF1c2UoKTtcblx0XHRcdFx0Y29uc3QgZHVyYXRpb24gPSBOdW1iZXIuaXNGaW5pdGUodmlkZW8uZHVyYXRpb24pID8gdmlkZW8uZHVyYXRpb24gOiAwO1xuXHRcdFx0XHRpZiAoZHVyYXRpb24gPiAwLjUpIHtcblx0XHRcdFx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdzZWVrZWQnLCAoKSA9PiBjYXB0dXJlRnJhbWUoKSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR2aWRlby5jdXJyZW50VGltZSA9IE1hdGgubWluKDAuNSwgZHVyYXRpb24gLyAyKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdGNhcHR1cmVGcmFtZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FwdHVyZUZyYW1lKCk7XG5cdFx0XHR9LCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0XHR2aWRlby5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsICgpID0+IGZpbmlzaCh1bmRlZmluZWQpLCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0XHR2aWRlby5sb2FkKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250YWluZXIpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7ZGltZW5zaW9uLndpZHRofXB4YDtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbi5oZWlnaHR9cHhgO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLFFBQVEsaUJBQTRCO0FBQ2hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQXVCLDRCQUE0QjtBQUVuRCxTQUFTLHdCQUF3QztBQUNqRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1CQUFtQyxz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
