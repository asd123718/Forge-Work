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
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ITelemetryService, TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IWorkspaceTagsService, getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from "../common/workspaceTags.js";
import { IDiagnosticsService } from "../../../../platform/diagnostics/common/diagnostics.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { isWindows } from "../../../../base/common/platform.js";
import { AllowedSecondLevelDomains, getDomainsOfRemotes } from "../../../../platform/extensionManagement/common/configRemotes.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { hashAsync } from "../../../../base/common/hash.js";
async function getHashedRemotesFromConfig(text, stripEndingDotGit = false) {
  return baseGetHashedRemotesFromConfig(text, stripEndingDotGit, hashAsync);
}
let WorkspaceTags = class {
  constructor(fileService, contextService, telemetryService, requestService, textFileService, workspaceTagsService, diagnosticsService, productService, nativeHostService) {
    this.fileService = fileService;
    this.contextService = contextService;
    this.telemetryService = telemetryService;
    this.requestService = requestService;
    this.textFileService = textFileService;
    this.workspaceTagsService = workspaceTagsService;
    this.diagnosticsService = diagnosticsService;
    this.productService = productService;
    this.nativeHostService = nativeHostService;
    if (this.telemetryService.telemetryLevel === TelemetryLevel.USAGE) {
      this.report();
    }
  }
  async report() {
    this.reportWindowsEdition();
    this.workspaceTagsService.getTags().then((tags) => this.reportWorkspaceTags(tags), (error) => onUnexpectedError(error));
    this.reportCloudStats();
    this.reportProxyStats();
    this.getWorkspaceInformation().then((stats) => this.diagnosticsService.reportWorkspaceStats(stats));
  }
  async reportWindowsEdition() {
    if (!isWindows) {
      return;
    }
    let value = await this.nativeHostService.windowsGetStringRegKey("HKEY_LOCAL_MACHINE", "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "EditionID");
    if (value === void 0) {
      value = "Unknown";
    }
    this.telemetryService.publicLog2("windowsEdition", { edition: value });
  }
  async getWorkspaceInformation() {
    const workspace = this.contextService.getWorkspace();
    const state = this.contextService.getWorkbenchState();
    const telemetryId = await this.workspaceTagsService.getTelemetryWorkspaceId(workspace, state);
    return {
      id: workspace.id,
      telemetryId,
      rendererSessionId: this.telemetryService.sessionId,
      folders: workspace.folders,
      transient: workspace.transient,
      configuration: workspace.configuration
    };
  }
  reportWorkspaceTags(tags) {
    this.telemetryService.publicLog("workspce.tags", tags);
  }
  reportRemoteDomains(workspaceUris) {
    Promise.all(workspaceUris.map((workspaceUri) => {
      const path = workspaceUri.path;
      const uri = workspaceUri.with({ path: `${path !== "/" ? path : ""}/.git/config` });
      return this.fileService.exists(uri).then((exists) => {
        if (!exists) {
          return [];
        }
        return this.textFileService.read(uri, { acceptTextOnly: true }).then(
          (content) => getDomainsOfRemotes(content.value, AllowedSecondLevelDomains),
          (err) => []
          // ignore missing or binary file
        );
      });
    })).then((domains) => {
      const set = domains.reduce((set2, list2) => list2.reduce((set3, item) => set3.add(item), set2), /* @__PURE__ */ new Set());
      const list = [];
      set.forEach((item) => list.push(item));
      this.telemetryService.publicLog("workspace.remotes", { domains: list.sort() });
    }, onUnexpectedError);
  }
  reportRemotes(workspaceUris) {
    Promise.all(workspaceUris.map((workspaceUri) => {
      return this.workspaceTagsService.getHashedRemotesFromUri(workspaceUri, true);
    })).then(() => {
    }, onUnexpectedError);
  }
  /* __GDPR__FRAGMENT__
  	"AzureTags" : {
  		"node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
  	}
  */
  reportAzureNode(workspaceUris, tags) {
    const uris = workspaceUris.map((workspaceUri) => {
      const path = workspaceUri.path;
      return workspaceUri.with({ path: `${path !== "/" ? path : ""}/node_modules` });
    });
    return this.fileService.resolveAll(uris.map((resource) => ({ resource }))).then(
      (results) => {
        const names = [].concat(...results.map((result) => result.success ? result.stat.children || [] : [])).map((c) => c.name);
        const referencesAzure = WorkspaceTags.searchArray(names, /azure/i);
        if (referencesAzure) {
          tags["node"] = true;
        }
        return tags;
      },
      (err) => {
        return tags;
      }
    );
  }
  static searchArray(arr, regEx) {
    return arr.some((v) => v.search(regEx) > -1) || void 0;
  }
  /* __GDPR__FRAGMENT__
  	"AzureTags" : {
  		"java" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
  	}
  */
  reportAzureJava(workspaceUris, tags) {
    return Promise.all(workspaceUris.map((workspaceUri) => {
      const path = workspaceUri.path;
      const uri = workspaceUri.with({ path: `${path !== "/" ? path : ""}/pom.xml` });
      return this.fileService.exists(uri).then((exists) => {
        if (!exists) {
          return false;
        }
        return this.textFileService.read(uri, { acceptTextOnly: true }).then(
          (content) => !!content.value.match(/azure/i),
          (err) => false
        );
      });
    })).then((javas) => {
      if (javas.indexOf(true) !== -1) {
        tags["java"] = true;
      }
      return tags;
    });
  }
  reportAzure(uris) {
    const tags = /* @__PURE__ */ Object.create(null);
    this.reportAzureNode(uris, tags).then((tags2) => {
      return this.reportAzureJava(uris, tags2);
    }).then((tags2) => {
      if (Object.keys(tags2).length) {
        this.telemetryService.publicLog("workspace.azure", tags2);
      }
    }).then(void 0, onUnexpectedError);
  }
  reportCloudStats() {
    const uris = this.contextService.getWorkspace().folders.map((folder) => folder.uri);
    if (uris.length && this.fileService) {
      this.reportRemoteDomains(uris);
      this.reportRemotes(uris);
      this.reportAzure(uris);
    }
  }
  reportProxyStats() {
    const downloadUrl = this.productService.downloadUrl;
    if (!downloadUrl) {
      return;
    }
    this.requestService.resolveProxy(downloadUrl).then((proxy) => {
      let type = proxy ? String(proxy).trim().split(/\s+/, 1)[0] : "EMPTY";
      if (["DIRECT", "PROXY", "HTTPS", "SOCKS", "EMPTY"].indexOf(type) === -1) {
        type = "UNKNOWN";
      }
    }).then(void 0, onUnexpectedError);
  }
};
WorkspaceTags = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IRequestService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IWorkspaceTagsService),
  __decorateParam(6, IDiagnosticsService),
  __decorateParam(7, IProductService),
  __decorateParam(8, INativeHostService)
], WorkspaceTags);
export {
  WorkspaceTags,
  getHashedRemotesFromConfig
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhZ3NcXGVsZWN0cm9uLWJyb3dzZXJcXHdvcmtzcGFjZVRhZ3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UsIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVGFnc1NlcnZpY2UsIFRhZ3MsIGdldEhhc2hlZFJlbW90ZXNGcm9tQ29uZmlnIGFzIGJhc2VHZXRIYXNoZWRSZW1vdGVzRnJvbUNvbmZpZyB9IGZyb20gJy4uL2NvbW1vbi93b3Jrc3BhY2VUYWdzLmpzJztcbmltcG9ydCB7IElEaWFnbm9zdGljc1NlcnZpY2UsIElXb3Jrc3BhY2VJbmZvcm1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEFsbG93ZWRTZWNvbmRMZXZlbERvbWFpbnMsIGdldERvbWFpbnNPZlJlbW90ZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9jb25maWdSZW1vdGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc2hBc3luYyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0SGFzaGVkUmVtb3Rlc0Zyb21Db25maWcodGV4dDogc3RyaW5nLCBzdHJpcEVuZGluZ0RvdEdpdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRyZXR1cm4gYmFzZUdldEhhc2hlZFJlbW90ZXNGcm9tQ29uZmlnKHRleHQsIHN0cmlwRW5kaW5nRG90R2l0LCBoYXNoQXN5bmMpO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlVGFncyBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVGFnc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUYWdzU2VydmljZTogSVdvcmtzcGFjZVRhZ3NTZXJ2aWNlLFxuXHRcdEBJRGlhZ25vc3RpY3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhZ25vc3RpY3NTZXJ2aWNlOiBJRGlhZ25vc3RpY3NTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlXG5cdCkge1xuXHRcdGlmICh0aGlzLnRlbGVtZXRyeVNlcnZpY2UudGVsZW1ldHJ5TGV2ZWwgPT09IFRlbGVtZXRyeUxldmVsLlVTQUdFKSB7XG5cdFx0XHR0aGlzLnJlcG9ydCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwb3J0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFdpbmRvd3Mtb25seSBFZGl0aW9uIEV2ZW50XG5cdFx0dGhpcy5yZXBvcnRXaW5kb3dzRWRpdGlvbigpO1xuXG5cdFx0Ly8gV29ya3NwYWNlIFRhZ3Ncblx0XHR0aGlzLndvcmtzcGFjZVRhZ3NTZXJ2aWNlLmdldFRhZ3MoKVxuXHRcdFx0LnRoZW4odGFncyA9PiB0aGlzLnJlcG9ydFdvcmtzcGFjZVRhZ3ModGFncyksIGVycm9yID0+IG9uVW5leHBlY3RlZEVycm9yKGVycm9yKSk7XG5cblx0XHQvLyBDbG91ZCBTdGF0c1xuXHRcdHRoaXMucmVwb3J0Q2xvdWRTdGF0cygpO1xuXG5cdFx0dGhpcy5yZXBvcnRQcm94eVN0YXRzKCk7XG5cblx0XHR0aGlzLmdldFdvcmtzcGFjZUluZm9ybWF0aW9uKCkudGhlbihzdGF0cyA9PiB0aGlzLmRpYWdub3N0aWNzU2VydmljZS5yZXBvcnRXb3Jrc3BhY2VTdGF0cyhzdGF0cykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXBvcnRXaW5kb3dzRWRpdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB2YWx1ZSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uud2luZG93c0dldFN0cmluZ1JlZ0tleSgnSEtFWV9MT0NBTF9NQUNISU5FJywgJ1NPRlRXQVJFXFxcXE1pY3Jvc29mdFxcXFxXaW5kb3dzIE5UXFxcXEN1cnJlbnRWZXJzaW9uJywgJ0VkaXRpb25JRCcpO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZSA9ICdVbmtub3duJztcblx0XHR9XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IGVkaXRpb246IHN0cmluZyB9LCB7IG93bmVyOiAnc2JhdHRlbic7IGNvbW1lbnQ6ICdJbmZvcm1hdGlvbiBhYm91dCB0aGUgV2luZG93cyBlZGl0aW9uLic7IGVkaXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdCdXNpbmVzc0luc2lnaHQnOyBjb21tZW50OiAnVGhlIFdpbmRvd3MgZWRpdGlvbi4nIH0gfT4oJ3dpbmRvd3NFZGl0aW9uJywgeyBlZGl0aW9uOiB2YWx1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0V29ya3NwYWNlSW5mb3JtYXRpb24oKTogUHJvbWlzZTxJV29ya3NwYWNlSW5mb3JtYXRpb24+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeUlkID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUYWdzU2VydmljZS5nZXRUZWxlbWV0cnlXb3Jrc3BhY2VJZCh3b3Jrc3BhY2UsIHN0YXRlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogd29ya3NwYWNlLmlkLFxuXHRcdFx0dGVsZW1ldHJ5SWQsXG5cdFx0XHRyZW5kZXJlclNlc3Npb25JZDogdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnNlc3Npb25JZCxcblx0XHRcdGZvbGRlcnM6IHdvcmtzcGFjZS5mb2xkZXJzLFxuXHRcdFx0dHJhbnNpZW50OiB3b3Jrc3BhY2UudHJhbnNpZW50LFxuXHRcdFx0Y29uZmlndXJhdGlvbjogd29ya3NwYWNlLmNvbmZpZ3VyYXRpb25cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRXb3Jrc3BhY2VUYWdzKHRhZ3M6IFRhZ3MpOiB2b2lkIHtcblx0XHQvKiBfX0dEUFJfX1xuXHRcdFx0XCJ3b3Jrc3BjZS50YWdzXCIgOiB7XG5cdFx0XHRcdFwib3duZXJcIjogXCJscmFtb3MxNVwiLFxuXHRcdFx0XHRcIiR7aW5jbHVkZX1cIjogW1xuXHRcdFx0XHRcdFwiJHtXb3Jrc3BhY2VUYWdzfVwiXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHQqL1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ3dvcmtzcGNlLnRhZ3MnLCB0YWdzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0UmVtb3RlRG9tYWlucyh3b3Jrc3BhY2VVcmlzOiBVUklbXSk6IHZvaWQge1xuXHRcdFByb21pc2UuYWxsPHN0cmluZ1tdPih3b3Jrc3BhY2VVcmlzLm1hcCh3b3Jrc3BhY2VVcmkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IHdvcmtzcGFjZVVyaS5wYXRoO1xuXHRcdFx0Y29uc3QgdXJpID0gd29ya3NwYWNlVXJpLndpdGgoeyBwYXRoOiBgJHtwYXRoICE9PSAnLycgPyBwYXRoIDogJyd9Ly5naXQvY29uZmlnYCB9KTtcblx0XHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpLnRoZW4oZXhpc3RzID0+IHtcblx0XHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMudGV4dEZpbGVTZXJ2aWNlLnJlYWQodXJpLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlIH0pLnRoZW4oXG5cdFx0XHRcdFx0Y29udGVudCA9PiBnZXREb21haW5zT2ZSZW1vdGVzKGNvbnRlbnQudmFsdWUsIEFsbG93ZWRTZWNvbmRMZXZlbERvbWFpbnMpLFxuXHRcdFx0XHRcdGVyciA9PiBbXSAvLyBpZ25vcmUgbWlzc2luZyBvciBiaW5hcnkgZmlsZVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSkpLnRoZW4oZG9tYWlucyA9PiB7XG5cdFx0XHRjb25zdCBzZXQgPSBkb21haW5zLnJlZHVjZSgoc2V0LCBsaXN0KSA9PiBsaXN0LnJlZHVjZSgoc2V0LCBpdGVtKSA9PiBzZXQuYWRkKGl0ZW0pLCBzZXQpLCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdFx0XHRjb25zdCBsaXN0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0c2V0LmZvckVhY2goaXRlbSA9PiBsaXN0LnB1c2goaXRlbSkpO1xuXHRcdFx0LyogX19HRFBSX19cblx0XHRcdFx0XCJ3b3Jrc3BhY2UucmVtb3Rlc1wiIDoge1xuXHRcdFx0XHRcdFwib3duZXJcIjogXCJscmFtb3MxNVwiLFxuXHRcdFx0XHRcdFwiZG9tYWluc1wiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9XG5cdFx0XHRcdH1cblx0XHRcdCovXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCd3b3Jrc3BhY2UucmVtb3RlcycsIHsgZG9tYWluczogbGlzdC5zb3J0KCkgfSk7XG5cdFx0fSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRSZW1vdGVzKHdvcmtzcGFjZVVyaXM6IFVSSVtdKTogdm9pZCB7XG5cdFx0UHJvbWlzZS5hbGw8c3RyaW5nW10+KHdvcmtzcGFjZVVyaXMubWFwKHdvcmtzcGFjZVVyaSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VUYWdzU2VydmljZS5nZXRIYXNoZWRSZW1vdGVzRnJvbVVyaSh3b3Jrc3BhY2VVcmksIHRydWUpO1xuXHRcdH0pKS50aGVuKCgpID0+IHsgfSwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0LyogX19HRFBSX19GUkFHTUVOVF9fXG5cdFx0XCJBenVyZVRhZ3NcIiA6IHtcblx0XHRcdFwibm9kZVwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfVxuXHRcdH1cblx0Ki9cblx0cHJpdmF0ZSByZXBvcnRBenVyZU5vZGUod29ya3NwYWNlVXJpczogVVJJW10sIHRhZ3M6IFRhZ3MpOiBQcm9taXNlPFRhZ3M+IHtcblx0XHQvLyBUT0RPOiBzaG91bGQgYWxzbyB3b3JrIGZvciBgbm9kZV9tb2R1bGVzYCBmb2xkZXJzIHNldmVyYWwgbGV2ZWxzIGRvd25cblx0XHRjb25zdCB1cmlzID0gd29ya3NwYWNlVXJpcy5tYXAod29ya3NwYWNlVXJpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSB3b3Jrc3BhY2VVcmkucGF0aDtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2VVcmkud2l0aCh7IHBhdGg6IGAke3BhdGggIT09ICcvJyA/IHBhdGggOiAnJ30vbm9kZV9tb2R1bGVzYCB9KTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS5yZXNvbHZlQWxsKHVyaXMubWFwKHJlc291cmNlID0+ICh7IHJlc291cmNlIH0pKSkudGhlbihcblx0XHRcdHJlc3VsdHMgPT4ge1xuXHRcdFx0XHRjb25zdCBuYW1lcyA9ICg8SUZpbGVTdGF0W10+W10pLmNvbmNhdCguLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnN1Y2Nlc3MgPyAocmVzdWx0LnN0YXQhLmNoaWxkcmVuIHx8IFtdKSA6IFtdKSkubWFwKGMgPT4gYy5uYW1lKTtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlc0F6dXJlID0gV29ya3NwYWNlVGFncy5zZWFyY2hBcnJheShuYW1lcywgL2F6dXJlL2kpO1xuXHRcdFx0XHRpZiAocmVmZXJlbmNlc0F6dXJlKSB7XG5cdFx0XHRcdFx0dGFnc1snbm9kZSddID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGFncztcblx0XHRcdH0sXG5cdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGFncztcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgc2VhcmNoQXJyYXkoYXJyOiBzdHJpbmdbXSwgcmVnRXg6IFJlZ0V4cCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBhcnIuc29tZSh2ID0+IHYuc2VhcmNoKHJlZ0V4KSA+IC0xKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiBfX0dEUFJfX0ZSQUdNRU5UX19cblx0XHRcIkF6dXJlVGFnc1wiIDoge1xuXHRcdFx0XCJqYXZhXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9XG5cdFx0fVxuXHQqL1xuXHRwcml2YXRlIHJlcG9ydEF6dXJlSmF2YSh3b3Jrc3BhY2VVcmlzOiBVUklbXSwgdGFnczogVGFncyk6IFByb21pc2U8VGFncz4ge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbCh3b3Jrc3BhY2VVcmlzLm1hcCh3b3Jrc3BhY2VVcmkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IHdvcmtzcGFjZVVyaS5wYXRoO1xuXHRcdFx0Y29uc3QgdXJpID0gd29ya3NwYWNlVXJpLndpdGgoeyBwYXRoOiBgJHtwYXRoICE9PSAnLycgPyBwYXRoIDogJyd9L3BvbS54bWxgIH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHVyaSkudGhlbihleGlzdHMgPT4ge1xuXHRcdFx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy50ZXh0RmlsZVNlcnZpY2UucmVhZCh1cmksIHsgYWNjZXB0VGV4dE9ubHk6IHRydWUgfSkudGhlbihcblx0XHRcdFx0XHRjb250ZW50ID0+ICEhY29udGVudC52YWx1ZS5tYXRjaCgvYXp1cmUvaSksXG5cdFx0XHRcdFx0ZXJyID0+IGZhbHNlXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KSkudGhlbihqYXZhcyA9PiB7XG5cdFx0XHRpZiAoamF2YXMuaW5kZXhPZih0cnVlKSAhPT0gLTEpIHtcblx0XHRcdFx0dGFnc1snamF2YSddID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YWdzO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRBenVyZSh1cmlzOiBVUklbXSkge1xuXHRcdGNvbnN0IHRhZ3M6IFRhZ3MgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMucmVwb3J0QXp1cmVOb2RlKHVyaXMsIHRhZ3MpLnRoZW4oKHRhZ3MpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLnJlcG9ydEF6dXJlSmF2YSh1cmlzLCB0YWdzKTtcblx0XHR9KS50aGVuKCh0YWdzKSA9PiB7XG5cdFx0XHRpZiAoT2JqZWN0LmtleXModGFncykubGVuZ3RoKSB7XG5cdFx0XHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcdFx0XCJ3b3Jrc3BhY2UuYXp1cmVcIiA6IHtcblx0XHRcdFx0XHRcdFwib3duZXJcIjogXCJscmFtb3MxNVwiLFxuXHRcdFx0XHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XHRcdFx0XCIke0F6dXJlVGFnc31cIlxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0Ki9cblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnd29ya3NwYWNlLmF6dXJlJywgdGFncyk7XG5cdFx0XHR9XG5cdFx0fSkudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0Q2xvdWRTdGF0cygpOiB2b2lkIHtcblx0XHRjb25zdCB1cmlzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSk7XG5cdFx0aWYgKHVyaXMubGVuZ3RoICYmIHRoaXMuZmlsZVNlcnZpY2UpIHtcblx0XHRcdHRoaXMucmVwb3J0UmVtb3RlRG9tYWlucyh1cmlzKTtcblx0XHRcdHRoaXMucmVwb3J0UmVtb3Rlcyh1cmlzKTtcblx0XHRcdHRoaXMucmVwb3J0QXp1cmUodXJpcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXBvcnRQcm94eVN0YXRzKCkge1xuXHRcdGNvbnN0IGRvd25sb2FkVXJsID0gdGhpcy5wcm9kdWN0U2VydmljZS5kb3dubG9hZFVybDtcblx0XHRpZiAoIWRvd25sb2FkVXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucmVxdWVzdFNlcnZpY2UucmVzb2x2ZVByb3h5KGRvd25sb2FkVXJsKVxuXHRcdFx0LnRoZW4ocHJveHkgPT4ge1xuXHRcdFx0XHRsZXQgdHlwZSA9IHByb3h5ID8gU3RyaW5nKHByb3h5KS50cmltKCkuc3BsaXQoL1xccysvLCAxKVswXSA6ICdFTVBUWSc7XG5cdFx0XHRcdGlmIChbJ0RJUkVDVCcsICdQUk9YWScsICdIVFRQUycsICdTT0NLUycsICdFTVBUWSddLmluZGV4T2YodHlwZSkgPT09IC0xKSB7XG5cdFx0XHRcdFx0dHlwZSA9ICdVTktOT1dOJztcblx0XHRcdFx0fVxuXHRcdFx0fSkudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG9CQUErQjtBQUN4QyxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyx3QkFBeUI7QUFDbEMsU0FBUyx1QkFBNkIsOEJBQThCLHNDQUFzQztBQUMxRyxTQUFTLDJCQUFrRDtBQUMzRCxTQUFTLHVCQUF1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
