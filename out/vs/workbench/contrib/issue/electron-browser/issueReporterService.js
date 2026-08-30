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
import { $, reset } from "../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { isRemoteDiagnosticError } from "../../../../platform/diagnostics/common/diagnostics.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProcessService } from "../../../../platform/process/common/process.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { applyZoom } from "../../../../platform/window/electron-browser/window.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { BaseIssueReporterService } from "../browser/baseIssueReporterService.js";
import { IIssueFormService, IssueType } from "../common/issue.js";
const MAX_URL_LENGTH = 7500;
const MAX_GITHUB_API_LENGTH = 65500;
let IssueReporter = class extends BaseIssueReporterService {
  constructor(disableExtensions, data, os, product, window, nativeHostService, issueFormService, processService, themeService, fileService, fileDialogService, updateService, contextKeyService, contextMenuService, authenticationService, openerService) {
    super(disableExtensions, data, os, product, window, false, issueFormService, themeService, fileService, fileDialogService, contextMenuService, authenticationService, openerService);
    this.nativeHostService = nativeHostService;
    this.updateService = updateService;
    this.processService = processService;
    this.processService.getSystemInfo().then((info) => {
      this.issueReporterModel.update({ systemInfo: info });
      this.receivedSystemInfo = true;
      this.updateSystemInfo(this.issueReporterModel.getData());
      this.updateButtonStates();
    });
    if (this.data.issueType === IssueType.PerformanceIssue) {
      this.processService.getPerformanceInfo().then((info) => {
        this.updatePerformanceInfo(info);
      });
    }
    this.checkForUpdates();
    this.setEventHandlers();
    applyZoom(this.data.zoomLevel, this.window);
    this.updateExperimentsInfo(this.data.experiments);
    this.updateRestrictedMode(this.data.restrictedMode);
    this.updateInstallationPureMode(this.data.isInstallationPure);
  }
  async checkForUpdates() {
    const updateState = this.updateService.state;
    if (updateState.type === StateType.Ready || updateState.type === StateType.Downloaded) {
      this.needsUpdate = true;
      const includeAcknowledgement = this.getElementById("version-acknowledgements");
      const updateBanner = this.getElementById("update-banner");
      if (updateBanner && includeAcknowledgement) {
        includeAcknowledgement.classList.remove("hidden");
        updateBanner.classList.remove("hidden");
        updateBanner.textContent = localize("updateAvailable", "A new version of {0} is available.", this.product.nameLong);
      }
    }
  }
  setEventHandlers() {
    super.setEventHandlers();
    this.addEventListener("issue-type", "change", (event) => {
      const issueType = parseInt(event.target.value);
      this.issueReporterModel.update({ issueType });
      if (issueType === IssueType.PerformanceIssue && !this.receivedPerformanceInfo) {
        this.processService.getPerformanceInfo().then((info) => {
          this.updatePerformanceInfo(info);
        });
      }
      const descriptionTextArea = this.getElementById("issue-title");
      if (descriptionTextArea) {
        descriptionTextArea.placeholder = localize("undefinedPlaceholder", "Please enter a title");
      }
      this.updateButtonStates();
      this.setSourceOptions();
      this.render();
    });
  }
  async submitToGitHub(issueTitle, issueBody, gitHubDetails) {
    if (issueBody.length > MAX_GITHUB_API_LENGTH) {
      const extensionData = this.issueReporterModel.getData().extensionData;
      if (extensionData) {
        issueBody = issueBody.replace(extensionData, "");
        const date = /* @__PURE__ */ new Date();
        const formattedDate = date.toISOString().split("T")[0];
        const formattedTime = date.toTimeString().split(" ")[0].replace(/:/g, "-");
        const fileName = `extensionData_${formattedDate}_${formattedTime}.md`;
        try {
          const downloadPath = await this.fileDialogService.showSaveDialog({
            title: localize("saveExtensionData", "Save Extension Data"),
            availableFileSystems: [Schemas.file],
            defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), fileName)
          });
          if (downloadPath) {
            await this.fileService.writeFile(downloadPath, VSBuffer.fromString(extensionData));
          }
        } catch (e) {
          console.error("Writing extension data to file failed");
          return false;
        }
      } else {
        console.error("Issue body too large to submit to GitHub");
        return false;
      }
    }
    const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
    const init = {
      method: "POST",
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody
      }),
      headers: new Headers({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.data.githubAccessToken}`
      })
    };
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error("Invalid GitHub URL provided.");
      return false;
    }
    const result = await response.json();
    await this.openerService.open(result.html_url, { openExternal: true });
    this.close();
    return true;
  }
  async createIssue(shouldCreate, privateUri) {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    if (this.nonGitHubIssueUrl) {
      const url2 = this.getExtensionBugsUrl();
      if (url2) {
        this.hasBeenSubmitted = true;
        await this.openerService.open(url2, { openExternal: true });
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
          this.validateInput("description");
        });
      }
      return false;
    }
    this.hasBeenSubmitted = true;
    const issueTitle = this.getElementById("issue-title").value;
    const issueBody = this.issueReporterModel.serialize();
    let issueUrl = privateUri ? this.getPrivateIssueUrl() : this.getIssueUrl();
    if (!issueUrl && selectedExtension?.uri) {
      const uri = URI.revive(selectedExtension.uri);
      issueUrl = uri.toString();
    } else if (!issueUrl) {
      console.error(`No ${privateUri ? "private " : ""}issue url found`);
      return false;
    }
    const gitHubDetails = this.parseGitHubUrl(issueUrl);
    const baseUrl = this.getIssueUrlWithTitle(this.getElementById("issue-title").value, issueUrl);
    let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;
    url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
    if (this.data.githubAccessToken && gitHubDetails && shouldCreate) {
      if (await this.submitToGitHub(issueTitle, issueBody, gitHubDetails)) {
        return true;
      }
    }
    try {
      if (url.length > MAX_URL_LENGTH || issueBody.length > MAX_GITHUB_API_LENGTH) {
        url = await this.writeToClipboard(baseUrl, issueBody);
        url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
      }
    } catch (_) {
      console.error("Writing to clipboard failed");
      return false;
    }
    await this.openerService.open(url, { openExternal: true });
    return true;
  }
  async writeToClipboard(baseUrl, issueBody) {
    const shouldWrite = await this.issueFormService.showClipboardDialog();
    if (!shouldWrite) {
      throw new CancellationError();
    }
    await this.nativeHostService.writeClipboardText(issueBody);
    return baseUrl + `&body=${encodeURIComponent(localize("pasteData", "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
  }
  updateSystemInfo(state) {
    const target = this.window.document.querySelector(".block-system .block-info");
    if (target) {
      const systemInfo = state.systemInfo;
      const renderedDataTable = $(
        "table",
        void 0,
        $(
          "tr",
          void 0,
          $("td", void 0, "CPUs"),
          $("td", void 0, systemInfo.cpus || "")
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "GPU Status"),
          $("td", void 0, Object.keys(systemInfo.gpuStatus).map((key) => `${key}: ${systemInfo.gpuStatus[key]}`).join("\n"))
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Load (avg)"),
          $("td", void 0, systemInfo.load || "")
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Memory (System)"),
          $("td", void 0, systemInfo.memory)
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Process Argv"),
          $("td", void 0, systemInfo.processArgs)
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "Screen Reader"),
          $("td", void 0, systemInfo.screenReader)
        ),
        $(
          "tr",
          void 0,
          $("td", void 0, "VM"),
          $("td", void 0, systemInfo.vmHint)
        )
      );
      reset(target, renderedDataTable);
      systemInfo.remoteData.forEach((remote) => {
        target.appendChild($("hr"));
        if (isRemoteDiagnosticError(remote)) {
          const remoteDataTable = $(
            "table",
            void 0,
            $(
              "tr",
              void 0,
              $("td", void 0, "Remote"),
              $("td", void 0, remote.hostName)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, ""),
              $("td", void 0, remote.errorMessage)
            )
          );
          target.appendChild(remoteDataTable);
        } else {
          const remoteDataTable = $(
            "table",
            void 0,
            $(
              "tr",
              void 0,
              $("td", void 0, "Remote"),
              $("td", void 0, remote.latency ? `${remote.hostName} (latency: ${remote.latency.current.toFixed(2)}ms last, ${remote.latency.average.toFixed(2)}ms average)` : remote.hostName)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "OS"),
              $("td", void 0, remote.machineInfo.os)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "CPUs"),
              $("td", void 0, remote.machineInfo.cpus || "")
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "Memory (System)"),
              $("td", void 0, remote.machineInfo.memory)
            ),
            $(
              "tr",
              void 0,
              $("td", void 0, "VM"),
              $("td", void 0, remote.machineInfo.vmHint)
            )
          );
          target.appendChild(remoteDataTable);
        }
      });
    }
  }
  updateRestrictedMode(restrictedMode) {
    this.issueReporterModel.update({ restrictedMode });
  }
  updateInstallationPureMode(isInstallationPure) {
    this.issueReporterModel.update({ isInstallationPure });
  }
  updateExperimentsInfo(experimentInfo) {
    this.issueReporterModel.update({ experimentInfo });
    const target = this.window.document.querySelector(".block-experiments .block-info");
    if (target) {
      target.textContent = experimentInfo ? experimentInfo : localize("noCurrentExperiments", "No current experiments.");
    }
  }
};
IssueReporter = __decorateClass([
  __decorateParam(5, INativeHostService),
  __decorateParam(6, IIssueFormService),
  __decorateParam(7, IProcessService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IFileDialogService),
  __decorateParam(11, IUpdateService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IAuthenticationService),
  __decorateParam(15, IOpenerService)
], IssueReporter);
export {
  IssueReporter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxlbGVjdHJvbi1icm93c2VyXFxpc3N1ZVJlcG9ydGVyU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyAkLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFnbm9zdGljcy9jb21tb24vZGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9jZXNzL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGFwcGx5Wm9vbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9lbGVjdHJvbi1icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IEJhc2VJc3N1ZVJlcG9ydGVyU2VydmljZSB9IGZyb20gJy4uL2Jyb3dzZXIvYmFzZUlzc3VlUmVwb3J0ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzc3VlUmVwb3J0ZXJEYXRhIGFzIElzc3VlUmVwb3J0ZXJNb2RlbERhdGEgfSBmcm9tICcuLi9icm93c2VyL2lzc3VlUmVwb3J0ZXJNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSXNzdWVGb3JtU2VydmljZSwgSXNzdWVSZXBvcnRlckRhdGEsIElzc3VlVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9pc3N1ZS5qcyc7XG5cbi8vIEdpdEh1YiBoYXMgbGV0IHVzIGtub3cgdGhhdCB3ZSBjb3VsZCB1cCBvdXIgbGltaXQgaGVyZSB0byA4ay4gV2UgY2hvc2UgNzUwMCB0byBwbGF5IGl0IHNhZmUuXG4vLyByZWYgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE1OTE5MVxuY29uc3QgTUFYX1VSTF9MRU5HVEggPSA3NTAwO1xuXG4vLyBHaXRodWIgQVBJIGFuZCBpc3N1ZXMgb24gd2ViIGhhcyBhIGxpbWl0IG9mIDY1NTM2LiBXZSBjaG9zZSA2NTUwMCB0byBwbGF5IGl0IHNhZmUuXG4vLyByZWYgaHR0cHM6Ly9naXRodWIuY29tL2dpdGh1Yi9pc3N1ZXMvaXNzdWVzLzEyODU4XG5jb25zdCBNQVhfR0lUSFVCX0FQSV9MRU5HVEggPSA2NTUwMDtcblxuXG5leHBvcnQgY2xhc3MgSXNzdWVSZXBvcnRlciBleHRlbmRzIEJhc2VJc3N1ZVJlcG9ydGVyU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvY2Vzc1NlcnZpY2U6IElQcm9jZXNzU2VydmljZTtcblx0Y29uc3RydWN0b3IoXG5cdFx0ZGlzYWJsZUV4dGVuc2lvbnM6IGJvb2xlYW4sXG5cdFx0ZGF0YTogSXNzdWVSZXBvcnRlckRhdGEsXG5cdFx0b3M6IHtcblx0XHRcdHR5cGU6IHN0cmluZztcblx0XHRcdGFyY2g6IHN0cmluZztcblx0XHRcdHJlbGVhc2U6IHN0cmluZztcblx0XHR9LFxuXHRcdHByb2R1Y3Q6IElQcm9kdWN0Q29uZmlndXJhdGlvbixcblx0XHR3aW5kb3c6IFdpbmRvdyxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUlzc3VlRm9ybVNlcnZpY2UgaXNzdWVGb3JtU2VydmljZTogSUlzc3VlRm9ybVNlcnZpY2UsXG5cdFx0QElQcm9jZXNzU2VydmljZSBwcm9jZXNzU2VydmljZTogSVByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihkaXNhYmxlRXh0ZW5zaW9ucywgZGF0YSwgb3MsIHByb2R1Y3QsIHdpbmRvdywgZmFsc2UsIGlzc3VlRm9ybVNlcnZpY2UsIHRoZW1lU2VydmljZSwgZmlsZVNlcnZpY2UsIGZpbGVEaWFsb2dTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGF1dGhlbnRpY2F0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSk7XG5cdFx0dGhpcy5wcm9jZXNzU2VydmljZSA9IHByb2Nlc3NTZXJ2aWNlO1xuXHRcdHRoaXMucHJvY2Vzc1NlcnZpY2UuZ2V0U3lzdGVtSW5mbygpLnRoZW4oaW5mbyA9PiB7XG5cdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBzeXN0ZW1JbmZvOiBpbmZvIH0pO1xuXHRcdFx0dGhpcy5yZWNlaXZlZFN5c3RlbUluZm8gPSB0cnVlO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZVN5c3RlbUluZm8odGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpKTtcblx0XHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuZGF0YS5pc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlKSB7XG5cdFx0XHR0aGlzLnByb2Nlc3NTZXJ2aWNlLmdldFBlcmZvcm1hbmNlSW5mbygpLnRoZW4oaW5mbyA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlUGVyZm9ybWFuY2VJbmZvKGluZm8gYXMgUGFydGlhbDxJc3N1ZVJlcG9ydGVyRGF0YT4pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGVja0ZvclVwZGF0ZXMoKTtcblx0XHR0aGlzLnNldEV2ZW50SGFuZGxlcnMoKTtcblx0XHRhcHBseVpvb20odGhpcy5kYXRhLnpvb21MZXZlbCwgdGhpcy53aW5kb3cpO1xuXHRcdHRoaXMudXBkYXRlRXhwZXJpbWVudHNJbmZvKHRoaXMuZGF0YS5leHBlcmltZW50cyk7XG5cdFx0dGhpcy51cGRhdGVSZXN0cmljdGVkTW9kZSh0aGlzLmRhdGEucmVzdHJpY3RlZE1vZGUpO1xuXHRcdHRoaXMudXBkYXRlSW5zdGFsbGF0aW9uUHVyZU1vZGUodGhpcy5kYXRhLmlzSW5zdGFsbGF0aW9uUHVyZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrRm9yVXBkYXRlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cGRhdGVTdGF0ZSA9IHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZTtcblx0XHRpZiAodXBkYXRlU3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlJlYWR5IHx8IHVwZGF0ZVN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5Eb3dubG9hZGVkKSB7XG5cdFx0XHR0aGlzLm5lZWRzVXBkYXRlID0gdHJ1ZTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgaW5jbHVkZUFja25vd2xlZGdlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3ZlcnNpb24tYWNrbm93bGVkZ2VtZW50cycpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCB1cGRhdGVCYW5uZXIgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCd1cGRhdGUtYmFubmVyJyk7XG5cdFx0XHRpZiAodXBkYXRlQmFubmVyICYmIGluY2x1ZGVBY2tub3dsZWRnZW1lbnQpIHtcblx0XHRcdFx0aW5jbHVkZUFja25vd2xlZGdlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRcdFx0dXBkYXRlQmFubmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdFx0XHR1cGRhdGVCYW5uZXIudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndXBkYXRlQXZhaWxhYmxlJywgXCJBIG5ldyB2ZXJzaW9uIG9mIHswfSBpcyBhdmFpbGFibGUuXCIsIHRoaXMucHJvZHVjdC5uYW1lTG9uZyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHNldEV2ZW50SGFuZGxlcnMoKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RXZlbnRIYW5kbGVycygpO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdpc3N1ZS10eXBlJywgJ2NoYW5nZScsIChldmVudDogRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGlzc3VlVHlwZSA9IHBhcnNlSW50KCg8SFRNTElucHV0RWxlbWVudD5ldmVudC50YXJnZXQpLnZhbHVlKTtcblx0XHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IGlzc3VlVHlwZTogaXNzdWVUeXBlIH0pO1xuXHRcdFx0aWYgKGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWUgJiYgIXRoaXMucmVjZWl2ZWRQZXJmb3JtYW5jZUluZm8pIHtcblx0XHRcdFx0dGhpcy5wcm9jZXNzU2VydmljZS5nZXRQZXJmb3JtYW5jZUluZm8oKS50aGVuKGluZm8gPT4ge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlUGVyZm9ybWFuY2VJbmZvKGluZm8gYXMgUGFydGlhbDxJc3N1ZVJlcG9ydGVyRGF0YT4pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzZXRzIHBsYWNlaG9sZGVyXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uVGV4dEFyZWEgPSA8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpO1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uVGV4dEFyZWEpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25UZXh0QXJlYS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCd1bmRlZmluZWRQbGFjZWhvbGRlcicsIFwiUGxlYXNlIGVudGVyIGEgdGl0bGVcIik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0XHR0aGlzLnNldFNvdXJjZU9wdGlvbnMoKTtcblx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgc3VibWl0VG9HaXRIdWIoaXNzdWVUaXRsZTogc3RyaW5nLCBpc3N1ZUJvZHk6IHN0cmluZywgZ2l0SHViRGV0YWlsczogeyBvd25lcjogc3RyaW5nOyByZXBvc2l0b3J5TmFtZTogc3RyaW5nIH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoaXNzdWVCb2R5Lmxlbmd0aCA+IE1BWF9HSVRIVUJfQVBJX0xFTkdUSCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGF0YSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5leHRlbnNpb25EYXRhO1xuXHRcdFx0aWYgKGV4dGVuc2lvbkRhdGEpIHtcblx0XHRcdFx0aXNzdWVCb2R5ID0gaXNzdWVCb2R5LnJlcGxhY2UoZXh0ZW5zaW9uRGF0YSwgJycpO1xuXHRcdFx0XHRjb25zdCBkYXRlID0gbmV3IERhdGUoKTtcblx0XHRcdFx0Y29uc3QgZm9ybWF0dGVkRGF0ZSA9IGRhdGUudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdOyAvLyBZWVlZLU1NLUREXG5cdFx0XHRcdGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBkYXRlLnRvVGltZVN0cmluZygpLnNwbGl0KCcgJylbMF0ucmVwbGFjZSgvOi9nLCAnLScpOyAvLyBISC1NTS1TU1xuXHRcdFx0XHRjb25zdCBmaWxlTmFtZSA9IGBleHRlbnNpb25EYXRhXyR7Zm9ybWF0dGVkRGF0ZX1fJHtmb3JtYXR0ZWRUaW1lfS5tZGA7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgZG93bmxvYWRQYXRoID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93U2F2ZURpYWxvZyh7XG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NhdmVFeHRlbnNpb25EYXRhJywgXCJTYXZlIEV4dGVuc2lvbiBEYXRhXCIpLFxuXHRcdFx0XHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtTY2hlbWFzLmZpbGVdLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdFVyaTogam9pblBhdGgoYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoU2NoZW1hcy5maWxlKSwgZmlsZU5hbWUpLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGRvd25sb2FkUGF0aCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoZG93bmxvYWRQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGV4dGVuc2lvbkRhdGEpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdXcml0aW5nIGV4dGVuc2lvbiBkYXRhIHRvIGZpbGUgZmFpbGVkJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdJc3N1ZSBib2R5IHRvbyBsYXJnZSB0byBzdWJtaXQgdG8gR2l0SHViJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgdXJsID0gYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvJHtnaXRIdWJEZXRhaWxzLm93bmVyfS8ke2dpdEh1YkRldGFpbHMucmVwb3NpdG9yeU5hbWV9L2lzc3Vlc2A7XG5cdFx0Y29uc3QgaW5pdCA9IHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0aXRsZTogaXNzdWVUaXRsZSxcblx0XHRcdFx0Ym9keTogaXNzdWVCb2R5XG5cdFx0XHR9KSxcblx0XHRcdGhlYWRlcnM6IG5ldyBIZWFkZXJzKHtcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7dGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VufWBcblx0XHRcdH0pXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCBpbml0KTtcblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdJbnZhbGlkIEdpdEh1YiBVUkwgcHJvdmlkZWQuJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihyZXN1bHQuaHRtbF91cmwsIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdHRoaXMuY2xvc2UoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyBjcmVhdGVJc3N1ZShzaG91bGRDcmVhdGU/OiBib29sZWFuLCBwcml2YXRlVXJpPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkRXh0ZW5zaW9uID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLnNlbGVjdGVkRXh0ZW5zaW9uO1xuXHRcdC8vIFNob3J0IGNpcmN1aXQgaWYgdGhlIGV4dGVuc2lvbiBwcm92aWRlcyBhIGN1c3RvbSBpc3N1ZSBoYW5kbGVyXG5cdFx0aWYgKHRoaXMubm9uR2l0SHViSXNzdWVVcmwpIHtcblx0XHRcdGNvbnN0IHVybCA9IHRoaXMuZ2V0RXh0ZW5zaW9uQnVnc1VybCgpO1xuXHRcdFx0aWYgKHVybCkge1xuXHRcdFx0XHR0aGlzLmhhc0JlZW5TdWJtaXR0ZWQgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmwsIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudmFsaWRhdGVJbnB1dHMoKSkge1xuXHRcdFx0Ly8gSWYgaW5wdXRzIGFyZSBpbnZhbGlkLCBzZXQgZm9jdXMgdG8gdGhlIGZpcnN0IG9uZSBhbmQgYWRkIGxpc3RlbmVycyBvbiB0aGVtXG5cdFx0XHQvLyB0byBkZXRlY3QgZnVydGhlciBjaGFuZ2VzXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGludmFsaWRJbnB1dCA9IHRoaXMud2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdGlmIChpbnZhbGlkSW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdCg8SFRNTElucHV0RWxlbWVudD5pbnZhbGlkSW5wdXRbMF0pLmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtdGl0bGUnLCAnaW5wdXQnLCBfID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdpc3N1ZS10aXRsZScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZGVzY3JpcHRpb24nLCAnaW5wdXQnLCBfID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtc291cmNlJywgJ2NoYW5nZScsIF8gPT4ge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlSW5wdXQoJ2lzc3VlLXNvdXJjZScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5maWxlT25FeHRlbnNpb24oKSkge1xuXHRcdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2V4dGVuc2lvbi1zZWxlY3RvcicsICdjaGFuZ2UnLCBfID0+IHtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlSW5wdXQoJ2V4dGVuc2lvbi1zZWxlY3RvcicpO1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVJbnB1dCgnZGVzY3JpcHRpb24nKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLmhhc0JlZW5TdWJtaXR0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaXNzdWVUaXRsZSA9ICg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKS52YWx1ZTtcblx0XHRjb25zdCBpc3N1ZUJvZHkgPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5zZXJpYWxpemUoKTtcblxuXHRcdGxldCBpc3N1ZVVybCA9IHByaXZhdGVVcmkgPyB0aGlzLmdldFByaXZhdGVJc3N1ZVVybCgpIDogdGhpcy5nZXRJc3N1ZVVybCgpO1xuXHRcdGlmICghaXNzdWVVcmwgJiYgc2VsZWN0ZWRFeHRlbnNpb24/LnVyaSkge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShzZWxlY3RlZEV4dGVuc2lvbi51cmkpO1xuXHRcdFx0aXNzdWVVcmwgPSB1cmkudG9TdHJpbmcoKTtcblx0XHR9IGVsc2UgaWYgKCFpc3N1ZVVybCkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgTm8gJHtwcml2YXRlVXJpID8gJ3ByaXZhdGUgJyA6ICcnfWlzc3VlIHVybCBmb3VuZGApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdpdEh1YkRldGFpbHMgPSB0aGlzLnBhcnNlR2l0SHViVXJsKGlzc3VlVXJsKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGJhc2VVcmwgPSB0aGlzLmdldElzc3VlVXJsV2l0aFRpdGxlKCg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKS52YWx1ZSwgaXNzdWVVcmwpO1xuXHRcdGxldCB1cmwgPSBiYXNlVXJsICsgYCZib2R5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KGlzc3VlQm9keSl9YDtcblxuXHRcdHVybCA9IHRoaXMuYWRkVGVtcGxhdGVUb1VybCh1cmwsIGdpdEh1YkRldGFpbHM/Lm93bmVyLCBnaXRIdWJEZXRhaWxzPy5yZXBvc2l0b3J5TmFtZSk7XG5cblx0XHRpZiAodGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VuICYmIGdpdEh1YkRldGFpbHMgJiYgc2hvdWxkQ3JlYXRlKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5zdWJtaXRUb0dpdEh1Yihpc3N1ZVRpdGxlLCBpc3N1ZUJvZHksIGdpdEh1YkRldGFpbHMpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodXJsLmxlbmd0aCA+IE1BWF9VUkxfTEVOR1RIIHx8IGlzc3VlQm9keS5sZW5ndGggPiBNQVhfR0lUSFVCX0FQSV9MRU5HVEgpIHtcblx0XHRcdFx0dXJsID0gYXdhaXQgdGhpcy53cml0ZVRvQ2xpcGJvYXJkKGJhc2VVcmwsIGlzc3VlQm9keSk7XG5cdFx0XHRcdHVybCA9IHRoaXMuYWRkVGVtcGxhdGVUb1VybCh1cmwsIGdpdEh1YkRldGFpbHM/Lm93bmVyLCBnaXRIdWJEZXRhaWxzPy5yZXBvc2l0b3J5TmFtZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoXykge1xuXHRcdFx0Y29uc29sZS5lcnJvcignV3JpdGluZyB0byBjbGlwYm9hcmQgZmFpbGVkJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJsLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyB3cml0ZVRvQ2xpcGJvYXJkKGJhc2VVcmw6IHN0cmluZywgaXNzdWVCb2R5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHNob3VsZFdyaXRlID0gYXdhaXQgdGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLnNob3dDbGlwYm9hcmREaWFsb2coKTtcblx0XHRpZiAoIXNob3VsZFdyaXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLndyaXRlQ2xpcGJvYXJkVGV4dChpc3N1ZUJvZHkpO1xuXG5cdFx0cmV0dXJuIGJhc2VVcmwgKyBgJmJvZHk9JHtlbmNvZGVVUklDb21wb25lbnQobG9jYWxpemUoJ3Bhc3RlRGF0YScsIFwiV2UgaGF2ZSB3cml0dGVuIHRoZSBuZWVkZWQgZGF0YSBpbnRvIHlvdXIgY2xpcGJvYXJkIGJlY2F1c2UgaXQgd2FzIHRvbyBsYXJnZSB0byBzZW5kLiBQbGVhc2UgcGFzdGUuXCIpKX1gO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTeXN0ZW1JbmZvKHN0YXRlOiBJc3N1ZVJlcG9ydGVyTW9kZWxEYXRhKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5ibG9jay1zeXN0ZW0gLmJsb2NrLWluZm8nKTtcblxuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdGNvbnN0IHN5c3RlbUluZm8gPSBzdGF0ZS5zeXN0ZW1JbmZvITtcblx0XHRcdGNvbnN0IHJlbmRlcmVkRGF0YVRhYmxlID0gJCgndGFibGUnLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnQ1BVcycpLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCBzeXN0ZW1JbmZvLmNwdXMgfHwgJycpXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnR1BVIFN0YXR1cycgYXMgc3RyaW5nKSxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgT2JqZWN0LmtleXMoc3lzdGVtSW5mby5ncHVTdGF0dXMpLm1hcChrZXkgPT4gYCR7a2V5fTogJHtzeXN0ZW1JbmZvLmdwdVN0YXR1c1trZXldfWApLmpvaW4oJ1xcbicpKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ0xvYWQgKGF2ZyknIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHN5c3RlbUluZm8ubG9hZCB8fCAnJylcblx0XHRcdFx0KSxcblx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdNZW1vcnkgKFN5c3RlbSknIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHN5c3RlbUluZm8ubWVtb3J5KVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ1Byb2Nlc3MgQXJndicgYXMgc3RyaW5nKSxcblx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgc3lzdGVtSW5mby5wcm9jZXNzQXJncylcblx0XHRcdFx0KSxcblx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdTY3JlZW4gUmVhZGVyJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCBzeXN0ZW1JbmZvLnNjcmVlblJlYWRlcilcblx0XHRcdFx0KSxcblx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdWTScpLFxuXHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCBzeXN0ZW1JbmZvLnZtSGludClcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHRcdHJlc2V0KHRhcmdldCwgcmVuZGVyZWREYXRhVGFibGUpO1xuXG5cdFx0XHRzeXN0ZW1JbmZvLnJlbW90ZURhdGEuZm9yRWFjaChyZW1vdGUgPT4ge1xuXHRcdFx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQoJDxIVE1MSFJFbGVtZW50PignaHInKSk7XG5cdFx0XHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihyZW1vdGUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVtb3RlRGF0YVRhYmxlID0gJCgndGFibGUnLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdSZW1vdGUnKSxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHJlbW90ZS5ob3N0TmFtZSlcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICcnKSxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHJlbW90ZS5lcnJvck1lc3NhZ2UpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR0YXJnZXQuYXBwZW5kQ2hpbGQocmVtb3RlRGF0YVRhYmxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCByZW1vdGVEYXRhVGFibGUgPSAkKCd0YWJsZScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ1JlbW90ZScpLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgcmVtb3RlLmxhdGVuY3kgPyBgJHtyZW1vdGUuaG9zdE5hbWV9IChsYXRlbmN5OiAke3JlbW90ZS5sYXRlbmN5LmN1cnJlbnQudG9GaXhlZCgyKX1tcyBsYXN0LCAke3JlbW90ZS5sYXRlbmN5LmF2ZXJhZ2UudG9GaXhlZCgyKX1tcyBhdmVyYWdlKWAgOiByZW1vdGUuaG9zdE5hbWUpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCAnT1MnKSxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIHJlbW90ZS5tYWNoaW5lSW5mby5vcylcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdDUFVzJyksXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCByZW1vdGUubWFjaGluZUluZm8uY3B1cyB8fCAnJylcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsICdNZW1vcnkgKFN5c3RlbSknIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCByZW1vdGUubWFjaGluZUluZm8ubWVtb3J5KVxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHQkKCd0ZCcsIHVuZGVmaW5lZCwgJ1ZNJyksXG5cdFx0XHRcdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCByZW1vdGUubWFjaGluZUluZm8udm1IaW50KVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0dGFyZ2V0LmFwcGVuZENoaWxkKHJlbW90ZURhdGFUYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVzdHJpY3RlZE1vZGUocmVzdHJpY3RlZE1vZGU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyByZXN0cmljdGVkTW9kZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5zdGFsbGF0aW9uUHVyZU1vZGUoaXNJbnN0YWxsYXRpb25QdXJlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgaXNJbnN0YWxsYXRpb25QdXJlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHBlcmltZW50c0luZm8oZXhwZXJpbWVudEluZm86IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IGV4cGVyaW1lbnRJbmZvIH0pO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYmxvY2stZXhwZXJpbWVudHMgLmJsb2NrLWluZm8nKTtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHR0YXJnZXQudGV4dENvbnRlbnQgPSBleHBlcmltZW50SW5mbyA/IGV4cGVyaW1lbnRJbmZvIDogbG9jYWxpemUoJ25vQ3VycmVudEV4cGVyaW1lbnRzJywgXCJObyBjdXJyZW50IGV4cGVyaW1lbnRzLlwiKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxH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
